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

export const Lightbox = ({ items, index, onClose, onIndexChange, fileNamePrefix = "photo" }: Props) => {
  const isOpen = index !== null && index >= 0 && index < items.length;
  const len = items.length;

  // The viewer owns its current index so swipes advance instantly without waiting
  // on the parent round-trip; the parent is notified via onIndexChange.
  const [cur, setCur] = useState(index ?? 0);
  const curRef = useRef(cur);
  useEffect(() => { curRef.current = cur; }, [cur]);
  // Adopt external index changes (opening at N, keyboard nav from parent, etc.).
  useEffect(() => {
    if (index !== null && index !== curRef.current) { curRef.current = index; setCur(index); }
  }, [index]);

  const [drag, setDrag] = useState(0);        // px offset while swiping / settling
  const [animating, setAnimating] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<null | "x" | "y">(null);
  const moved = useRef(false);
  const dragRef = useRef(0);
  const raf = useRef(0);
  const settleTimer = useRef(0);

  const clearSettle = () => { cancelAnimationFrame(raf.current); clearTimeout(settleTimer.current); };
  const settleToCentre = () => {
    // rAF gives a clean frame boundary so the transition actually runs; the timeout
    // is a safety net so the slide can never be left off-centre if rAF is throttled
    // (e.g. the tab was briefly backgrounded mid-swipe).
    clearSettle();
    const finish = () => { setAnimating(true); setDrag(0); dragRef.current = 0; };
    raf.current = requestAnimationFrame(() => { raf.current = requestAnimationFrame(finish); });
    settleTimer.current = window.setTimeout(finish, 300);
  };

  // Advance one image and let the residual offset settle to centre. The index is
  // updated synchronously, so rapid/chained swipes stay correct and nothing is
  // locked out while the settle animates.
  const go = useCallback((dir: 1 | -1) => {
    if (len < 2) { settleToCentre(); return; }
    const w = window.innerWidth;
    const target = (curRef.current + dir + len) % len;
    curRef.current = target;
    setCur(target);
    onIndexChange(target);
    // Keep the just-revealed image exactly where the finger left it, then glide it
    // to centre. residual = how far off-centre the new current slide now sits.
    const residual = dir === 1 ? dragRef.current + w : dragRef.current - w;
    setAnimating(false);
    setDrag(residual);
    dragRef.current = residual;
    settleToCentre();
  }, [len, onIndexChange]);

  const next = useCallback(() => go(1), [go]);
  const prev = useCallback(() => go(-1), [go]);

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

  const beginDrag = (x: number, y: number) => {
    // If a settle is mid-flight, grab it at its live position so the new drag is seamless.
    if (animating && trackRef.current) {
      const m = new DOMMatrix(getComputedStyle(trackRef.current).transform);
      const live = m.m41 + window.innerWidth; // base transform is -100vw
      dragRef.current = live;
      setAnimating(false);
      setDrag(live);
    }
    clearSettle();
    start.current = { x, y };
    axis.current = null;
    moved.current = false;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 overflow-hidden select-none"
      onClick={() => { if (moved.current) { moved.current = false; return; } onClose(); }}
      role="dialog"
      aria-modal="true"
      dir="ltr"
    >
      {/* Swipeable 3-slide track (prev · current · next) */}
      <div
        ref={trackRef}
        className="flex h-full touch-pan-y"
        style={{
          width: "300vw",
          transform: `translate3d(calc(-100vw + ${drag}px),0,0)`,
          transition: animating ? "transform 240ms cubic-bezier(.22,.61,.36,1)" : "none",
          willChange: "transform",
        }}
        onTouchStart={(e) => beginDrag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => {
          if (!start.current) return;
          const dx = e.touches[0].clientX - start.current.x;
          const dy = e.touches[0].clientY - start.current.y;
          if (!axis.current) axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (axis.current !== "x") return;
          if (Math.abs(dx) > 8) moved.current = true;
          const v = len < 2 ? dx * 0.3 : dx; // resist when there's nothing to swipe to
          dragRef.current = v;
          setDrag(v);
        }}
        onTouchEnd={() => {
          if (!start.current) return;
          const dx = dragRef.current;
          start.current = null; axis.current = null;
          const threshold = Math.min(80, window.innerWidth * 0.16);
          if (len > 1 && dx <= -threshold) go(1);
          else if (len > 1 && dx >= threshold) go(-1);
          else settleToCentre();
        }}
      >
        {slides.map((it, k) => (
          <div
            key={`${k}-${it?.url ?? ""}`}
            className="shrink-0 h-full flex items-center justify-center px-2"
            style={{ width: "100vw" }}
          >
            {it?.media_type === "video" ? (
              <video src={it.url} className="max-w-full max-h-[92vh] object-contain" controls playsInline autoPlay={k === 1} onClick={(e) => e.stopPropagation()} />
            ) : it?.thumbUrl ? (
              // The cached thumbnail (already loaded by the grid) sizes the box and
              // shows instantly, blurred; the medium rendition covers it once loaded.
              <div className="relative flex items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <img src={it.thumbUrl} alt="" aria-hidden draggable={false} className="max-w-full max-h-[92vh] object-contain blur-[6px] scale-105" />
                <img src={displaySrc(it)} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain" />
              </div>
            ) : (
              <img src={displaySrc(it)} alt="" draggable={false} className="max-w-full max-h-[92vh] object-contain" onClick={(e) => e.stopPropagation()} />
            )}
          </div>
        ))}
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
