import { useEffect, useCallback, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { downloadOne, preloadDownloadFile, isAbortError, isMobile } from "@/lib/download";
import { toast } from "sonner";

// `url` is the original (used for downloads); `mediumUrl` is an optimized
// rendition shown in the viewer so we don't fetch full-size originals to display.
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

  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 0));
  const [drag, setDrag] = useState(0);        // px offset while swiping / animating
  const [animating, setAnimating] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<null | "x" | "y">(null);
  const moved = useRef(false);
  const dragRef = useRef(0); // synchronous drag value for the release decision
  const indexRef = useRef(index);
  // Sync the logical index from the prop only when the parent actually changes it
  // (open at N, external nav). commit() updates it optimistically so rapid swipes
  // chain correctly without waiting for the parent round-trip.
  useEffect(() => { indexRef.current = index; }, [index]);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Slide to the next/prev image with a smooth animation, then commit the index.
  const commit = useCallback((dir: 1 | -1) => {
    const idx = indexRef.current;
    if (idx === null || len < 2) { setAnimating(true); setDrag(0); return; }
    const target = (idx + dir + len) % len;
    indexRef.current = target; // optimistic: chained swipes stay correct
    setAnimating(true);
    setDrag(dir === 1 ? -vw : vw);
    window.setTimeout(() => {
      onIndexChange(target);
      setAnimating(false);
      setDrag(0);
    }, 260);
  }, [len, vw, onIndexChange]);

  const next = useCallback(() => commit(1), [commit]);
  const prev = useCallback(() => commit(-1), [commit]);

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

  // Preload neighbors (display rendition + the download original) for instant swipes.
  useEffect(() => {
    if (!isOpen || index === null) return;
    const around = [index, (index + 1) % len, (index - 1 + len) % len];
    around.forEach((i) => {
      const it = items[i];
      if (!it) return;
      if (it.media_type !== "video") { const img = new Image(); img.src = displaySrc(it); }
      preloadDownloadFile(it.url, `${fileNamePrefix}-${i + 1}.${it.media_type === "video" ? "mp4" : "jpg"}`).catch(() => {});
    });
  }, [fileNamePrefix, index, isOpen, items, len]);

  if (!isOpen) return null;
  const current = items[index!];
  const currentName = `${fileNamePrefix}-${index! + 1}.${current.media_type === "video" ? "mp4" : "jpg"}`;
  const slides = [items[(index! - 1 + len) % len], current, items[(index! + 1) % len]];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 overflow-hidden select-none"
      onClick={() => { if (moved.current) { moved.current = false; return; } onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      {/* Swipeable 3-slide track (prev · current · next) */}
      <div
        className="flex h-full touch-pan-y"
        style={{
          width: vw * 3,
          transform: `translate3d(${-vw + drag}px,0,0)`,
          transition: animating ? "transform 260ms cubic-bezier(.22,.61,.36,1)" : "none",
          willChange: "transform",
        }}
        onTouchStart={(e) => {
          if (animating) return;
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          axis.current = null; moved.current = false;
        }}
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
          dragRef.current = 0;
          start.current = null; axis.current = null;
          const threshold = Math.min(90, vw * 0.18);
          if (len > 1 && dx <= -threshold) commit(1);
          else if (len > 1 && dx >= threshold) commit(-1);
          else { setAnimating(true); setDrag(0); }
        }}
      >
        {slides.map((it, k) => (
          <div key={k} className="shrink-0 h-full flex items-center justify-center px-2" style={{ width: vw }}>
            {it?.media_type === "video" ? (
              <video src={it.url} className="max-w-full max-h-[92vh] object-contain" controls playsInline autoPlay={k === 1} onClick={(e) => e.stopPropagation()} />
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
        {index! + 1} / {len}
      </div>
    </div>
  );
};
