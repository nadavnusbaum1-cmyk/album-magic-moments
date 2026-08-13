import { useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { downloadOne, preloadDownloadFile, isAbortError, isMobile } from "@/lib/download";
import { toast } from "sonner";

// `url` is the original (used for downloads); `mediumUrl` is an optimized
// rendition shown in the viewer so we don't fetch full-size originals to display.
export type LightboxItem = { url: string; mediumUrl?: string; media_type?: string };

type Props = {
  items: LightboxItem[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  fileNamePrefix?: string;
};

export const Lightbox = ({ items, index, onClose, onIndexChange, fileNamePrefix = "photo" }: Props) => {
  const isOpen = index !== null && index >= 0 && index < items.length;
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const next = useCallback(() => {
    if (index === null) return;
    onIndexChange((index + 1) % items.length);
  }, [index, items.length, onIndexChange]);

  const prev = useCallback(() => {
    if (index === null) return;
    onIndexChange((index - 1 + items.length) % items.length);
  }, [index, items.length, onIndexChange]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, next, prev]);

  useEffect(() => {
    if (!isOpen || index === null) return;
    const neighbors = [index, (index + 1) % items.length, (index - 1 + items.length) % items.length];
    neighbors.forEach((i) => {
      const item = items[i];
      if (item) preloadDownloadFile(item.url, `${fileNamePrefix}-${i + 1}.${item.media_type === "video" ? "mp4" : "jpg"}`).catch(() => {});
    });
  }, [fileNamePrefix, index, isOpen, items]);

  if (!isOpen) return null;
  const current = items[index!];
  const currentName = `${fileNamePrefix}-${index! + 1}.${current.media_type === "video" ? "mp4" : "jpg"}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
        touchStartY.current = e.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null || touchStartY.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        touchStartX.current = null;
        touchStartY.current = null;
        if (items.length < 2 || Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
        e.stopPropagation();
        if (dx < 0) next(); else prev();
      }}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 text-white/90 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      <button
        onPointerDown={() => preloadDownloadFile(current.url, currentName).catch(() => {})}
        onFocus={() => preloadDownloadFile(current.url, currentName).catch(() => {})}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const message = isMobile() ? "Preparing photo… tap Save to gallery when it appears" : "Preparing download…";
          toast.info(message);
          downloadOne(current.url, currentName)
            .catch((error) => { if (!isAbortError(error)) toast.error(error instanceof Error ? error.message : "Download failed"); });
        }}
        className="absolute top-4 right-16 text-white/90 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
        aria-label="Download"
      >
        <Download className="w-5 h-5" />
      </button>

      {items.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-white/90 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Previous"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-white/90 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Next"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
        </>
      )}

      <div className="max-w-[92vw] max-h-[88vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {current.media_type === "video" ? (
          <video src={current.url} className="max-w-[92vw] max-h-[88vh] object-contain" controls autoPlay playsInline />
        ) : (
          <img src={current.mediumUrl || current.url} alt="" className="max-w-[92vw] max-h-[88vh] object-contain" />
        )}
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs">
        {index! + 1} / {items.length}
      </div>
    </div>
  );
};
