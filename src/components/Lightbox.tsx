import { useEffect, useCallback, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { downloadOne, preloadDownloadFile, isAbortError, isMobile } from "@/lib/download";
import { toast } from "sonner";

// `url` is the original (used for downloads); `mediumUrl` is an optimized
// rendition shown in the viewer so we don't fetch full-size originals to display.
// `thumbUrl` is the tiny grid rendition — already cached, so we show it instantly
// underneath while the medium loads (blur-up), avoiding a blank first frame.
export type LightboxItem = { url: string; mediumUrl?: string; thumbUrl?: string; media_type?: string };

type Props = {
  items: LightboxItem[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  fileNamePrefix?: string;
};

const displaySrc = (it?: LightboxItem) => (it ? it.mediumUrl || it.url : "");
const MAX_ZOOM = 4;
const DBL_ZOOM = 2.5;

type Zoom = { scale: number; x: number; y: number };
const IDENTITY: Zoom = { scale: 1, x: 0, y: 0 };
type Pt = { clientX: number; clientY: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

export const Lightbox = ({ items, index, onClose, onIndexChange, fileNamePrefix = "photo" }: Props) => {
  const isOpen = index !== null && index >= 0 && index < items.length;
  const len = items.length;

  // The viewer owns its current index so swipes advance instantly without waiting
  // on the parent round-trip; the parent is notified via onIndexChange.
  const [cur, setCur] = useState(index ?? 0);
  const curRef = useRef(cur);
  useEffect(() => { curRef.current = cur; }, [cur]);
  useEffect(() => {
    if (index !== null && index !== curRef.current) { curRef.current = index; setCur(index); }
  }, [index]);

  const [drag, setDrag] = useState(0);            // horizontal track offset (swipe)
  const [animating, setAnimating] = useState(false);
  const [zoom, setZoom] = useState<Zoom>(IDENTITY); // pinch/double-tap state on the current image
  const [dismissY, setDismissY] = useState(0);     // vertical swipe-to-close offset
  const [contentAnim, setContentAnim] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);   // current (centre) medium image, for bounds
  const dragRef = useRef(0);
  const zoomRef = useRef(zoom);
  const dismissRef = useRef(0);
  const raf = useRef(0);
  const settleTimer = useRef(0);

  // Gesture state machine.
  const mode = useRef<"none" | "swipe" | "dismiss" | "pan" | "pinch">("none");
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<null | "x" | "y">(null);
  const moved = useRef(false);
  const pinch = useRef({ dist: 1, scale: 1, x: 0, y: 0, midX: 0, midY: 0 });
  const pan = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  const applyZoom = (z: Zoom, anim = false) => { zoomRef.current = z; setContentAnim(anim); setZoom(z); };
  const applyDismiss = (y: number, anim = false) => { dismissRef.current = y; setContentAnim(anim); setDismissY(y); };
  const zoomed = () => zoomRef.current.scale > 1.01;

  // Bounds so a zoomed image can't be panned off its own edges.
  const clampZoom = (z: Zoom): Zoom => {
    const vw = window.innerWidth, vh = window.innerHeight;
    let baseW = vw, baseH = vh * 0.92;
    const el = imgRef.current;
    if (el && el.naturalWidth && el.naturalHeight) {
      const fit = Math.min(vw / el.naturalWidth, (vh * 0.92) / el.naturalHeight);
      baseW = el.naturalWidth * fit; baseH = el.naturalHeight * fit;
    }
    const maxX = Math.max(0, (baseW * z.scale - vw) / 2);
    const maxY = Math.max(0, (baseH * z.scale - vh) / 2);
    return { scale: z.scale, x: Math.max(-maxX, Math.min(maxX, z.x)), y: Math.max(-maxY, Math.min(maxY, z.y)) };
  };

  const clearSettle = () => { cancelAnimationFrame(raf.current); clearTimeout(settleTimer.current); };
  const settleToCentre = () => {
    clearSettle();
    const finish = () => { setAnimating(true); setDrag(0); dragRef.current = 0; };
    raf.current = requestAnimationFrame(() => { raf.current = requestAnimationFrame(finish); });
    settleTimer.current = window.setTimeout(finish, 300);
  };

  // Advance one image; the residual offset then glides to centre. Index updates
  // synchronously so rapid/chained swipes stay correct with nothing locked out.
  const go = useCallback((dir: 1 | -1) => {
    if (len < 2) { settleToCentre(); return; }
    const w = window.innerWidth;
    const target = (curRef.current + dir + len) % len;
    curRef.current = target;
    setCur(target);
    onIndexChange(target);
    const residual = dir === 1 ? dragRef.current + w : dragRef.current - w;
    setAnimating(false);
    setDrag(residual);
    dragRef.current = residual;
    settleToCentre();
  }, [len, onIndexChange]);

  const next = useCallback(() => go(1), [go]);
  const prev = useCallback(() => go(-1), [go]);

  // Reset zoom/dismiss whenever the current image changes.
  useEffect(() => { applyZoom(IDENTITY); applyDismiss(0); }, [cur]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [isOpen, onClose, next, prev]);

  useEffect(() => () => clearSettle(), []);

  // Preload neighbours (display rendition + the download original) for instant swipes.
  useEffect(() => {
    if (!isOpen) return;
    [cur, (cur + 1) % len, (cur - 1 + len) % len].forEach((i) => {
      const it = items[i];
      if (!it) return;
      if (it.media_type !== "video") { const img = new Image(); img.src = displaySrc(it); }
      preloadDownloadFile(it.url, `${fileNamePrefix}-${i + 1}.${it.media_type === "video" ? "mp4" : "jpg"}`).catch(() => {});
    });
  }, [fileNamePrefix, cur, isOpen, items, len]);

  if (!isOpen) return null;
  const current = items[cur];
  const currentName = `${fileNamePrefix}-${cur + 1}.${current.media_type === "video" ? "mp4" : "jpg"}`;
  const slides = [items[(cur - 1 + len) % len], current, items[(cur + 1) % len]];

  const toggleDoubleTapZoom = (px: number, py: number) => {
    if (zoomed()) { applyZoom(IDENTITY, true); return; }
    const fx = px - window.innerWidth / 2;
    const fy = py - window.innerHeight / 2;
    applyZoom(clampZoom({ scale: DBL_ZOOM, x: -(DBL_ZOOM - 1) * fx, y: -(DBL_ZOOM - 1) * fy }), true);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    clearSettle();
    if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      mode.current = "pinch";
      pinch.current = {
        dist: dist(a, b) || 1, scale: zoomRef.current.scale, x: zoomRef.current.x, y: zoomRef.current.y,
        midX: (a.clientX + b.clientX) / 2, midY: (a.clientY + b.clientY) / 2,
      };
      start.current = null;
      return;
    }
    const p = e.touches[0];
    moved.current = false;
    if (zoomed()) {
      mode.current = "pan";
      pan.current = { x: p.clientX, y: p.clientY, ox: zoomRef.current.x, oy: zoomRef.current.y };
      start.current = { x: p.clientX, y: p.clientY };
    } else {
      mode.current = "swipe";
      axis.current = null;
      // grab an in-flight settle at its live position so the new drag is seamless
      if (animating && trackRef.current) {
        const m = new DOMMatrix(getComputedStyle(trackRef.current).transform);
        const live = m.m41 + window.innerWidth;
        dragRef.current = live; setAnimating(false); setDrag(live);
      }
      start.current = { x: p.clientX, y: p.clientY };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (mode.current === "pinch" && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const ps = pinch.current;
      const scale = Math.max(1, Math.min(MAX_ZOOM, ps.scale * (dist(a, b) / ps.dist)));
      const ratio = scale / ps.scale;
      const fx = ps.midX - window.innerWidth / 2;
      const fy = ps.midY - window.innerHeight / 2;
      const midX = (a.clientX + b.clientX) / 2, midY = (a.clientY + b.clientY) / 2;
      const x = fx - (fx - ps.x) * ratio + (midX - ps.midX);
      const y = fy - (fy - ps.y) * ratio + (midY - ps.midY);
      moved.current = true;
      applyZoom(clampZoom({ scale, x, y }));
      return;
    }
    if (mode.current === "pan") {
      const p = e.touches[0];
      if (Math.abs(p.clientX - pan.current.x) > 4 || Math.abs(p.clientY - pan.current.y) > 4) moved.current = true;
      applyZoom(clampZoom({ scale: zoomRef.current.scale, x: pan.current.ox + (p.clientX - pan.current.x), y: pan.current.oy + (p.clientY - pan.current.y) }));
      return;
    }
    if (mode.current === "swipe" || mode.current === "dismiss") {
      if (!start.current) return;
      const p = e.touches[0];
      const dx = p.clientX - start.current.x;
      const dy = p.clientY - start.current.y;
      if (!axis.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "y") {
        // vertical drag → swipe-to-dismiss (down closes; up allowed too)
        mode.current = "dismiss";
        moved.current = true;
        applyDismiss(dy);
      } else if (axis.current === "x") {
        if (Math.abs(dx) > 8) moved.current = true;
        const v = len < 2 ? dx * 0.3 : dx;
        dragRef.current = v;
        setDrag(v);
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (mode.current === "pinch") {
      if (zoomRef.current.scale <= 1.03) applyZoom(IDENTITY, true);
      else applyZoom(clampZoom(zoomRef.current), true);
      // one finger remains → continue panning without lifting
      if (e.touches.length === 1 && zoomed()) {
        const p = e.touches[0];
        mode.current = "pan";
        pan.current = { x: p.clientX, y: p.clientY, ox: zoomRef.current.x, oy: zoomRef.current.y };
      } else mode.current = "none";
      return;
    }
    if (mode.current === "dismiss") {
      if (Math.abs(dismissRef.current) > 110) onClose();
      else applyDismiss(0, true);
      mode.current = "none"; axis.current = null; start.current = null;
      return;
    }
    if (mode.current === "swipe" || mode.current === "pan") {
      const wasSwipe = mode.current === "swipe";
      const dx = dragRef.current;
      const tap = !moved.current && start.current;
      const tapX = start.current?.x ?? 0, tapY = start.current?.y ?? 0;
      start.current = null; axis.current = null; mode.current = "none";
      // A tap (either while zoomed or not) → double-tap toggles zoom.
      if (tap) {
        const now = Date.now();
        if (now - lastTap.current.t < 300 && Math.hypot(tapX - lastTap.current.x, tapY - lastTap.current.y) < 40) {
          lastTap.current = { t: 0, x: 0, y: 0 };
          toggleDoubleTapZoom(tapX, tapY);
        } else {
          lastTap.current = { t: now, x: tapX, y: tapY };
        }
        return;
      }
      if (!wasSwipe) { // finished panning a zoomed image
        if (zoomRef.current.scale <= 1.03) applyZoom(IDENTITY, true);
        else applyZoom(clampZoom(zoomRef.current), true);
        return;
      }
      const threshold = Math.min(80, window.innerWidth * 0.16);
      if (len > 1 && dx <= -threshold) go(1);
      else if (len > 1 && dx >= threshold) go(-1);
      else settleToCentre();
    }
  };

  const bgAlpha = Math.max(0, 0.96 - Math.abs(dismissY) / 500);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden select-none"
      style={{ backgroundColor: `rgba(0,0,0,${bgAlpha})` }}
      onClick={() => { if (moved.current) { moved.current = false; return; } if (zoomed()) { applyZoom(IDENTITY, true); return; } onClose(); }}
      role="dialog"
      aria-modal="true"
      dir="ltr"
    >
      {/* Swipeable 3-slide track (prev · current · next) */}
      <div
        ref={trackRef}
        className="flex h-full touch-none"
        style={{
          width: "300vw",
          transform: `translate3d(calc(-100vw + ${drag}px),0,0)`,
          transition: animating ? "transform 240ms cubic-bezier(.22,.61,.36,1)" : "none",
          willChange: "transform",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {slides.map((it, k) => {
          const isCentre = k === 1;
          const zStyle = isCentre
            ? { transform: `translate3d(${zoom.x}px, ${zoom.y + dismissY}px, 0) scale(${zoom.scale})`, transition: contentAnim ? "transform 220ms ease-out" : "none" as const }
            : undefined;
          return (
            <div key={`${k}-${it?.url ?? ""}`} className="shrink-0 h-full flex items-center justify-center px-2" style={{ width: "100vw" }}>
              {it?.media_type === "video" ? (
                <video src={it.url} className="max-w-full max-h-[92vh] object-contain" controls playsInline autoPlay={isCentre} onClick={(e) => e.stopPropagation()} />
              ) : it?.thumbUrl ? (
                <div className="relative flex items-center justify-center overflow-hidden" style={zStyle} onClick={(e) => e.stopPropagation()} onDoubleClick={isCentre ? (e) => { e.stopPropagation(); toggleDoubleTapZoom(e.clientX, e.clientY); } : undefined}>
                  <img src={it.thumbUrl} alt="" aria-hidden draggable={false} className="max-w-full max-h-[92vh] object-contain blur-[6px] scale-105" />
                  <img ref={isCentre ? imgRef : undefined} src={displaySrc(it)} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain" />
                </div>
              ) : (
                <img ref={isCentre ? imgRef : undefined} src={displaySrc(it)} alt="" draggable={false} className="max-w-full max-h-[92vh] object-contain" style={zStyle} onClick={(e) => e.stopPropagation()} onDoubleClick={isCentre ? (e) => { e.stopPropagation(); toggleDoubleTapZoom(e.clientX, e.clientY); } : undefined} />
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 end-4 text-white/90 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      <button
        onPointerDown={() => preloadDownloadFile(current.url, currentName).catch(() => {})}
        onClick={(e) => {
          e.stopPropagation();
          toast.info(isMobile() ? "Preparing photo… tap Save to gallery when it appears" : "Preparing download…");
          downloadOne(current.url, currentName).catch((error) => { if (!isAbortError(error)) toast.error(error instanceof Error ? error.message : "Download failed"); });
        }}
        className="absolute top-4 end-16 text-white/90 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
        aria-label="Download"
      >
        <Download className="w-5 h-5" />
      </button>

      {len > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }} className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 text-white/90 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20" aria-label="Previous">
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 text-white/90 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20" aria-label="Next">
            <ChevronRight className="w-7 h-7" />
          </button>
        </>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs pointer-events-none">
        {cur + 1} / {len}
      </div>
    </div>
  );
};
