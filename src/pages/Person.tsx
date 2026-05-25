import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Heart, Download, Loader2, ArrowLeft, CheckSquare, Square, X } from "lucide-react";
import { toast } from "sonner";
import { downloadOne, preloadDownloadFile, preloadDownloadFiles, saveManyToGallery, isAbortError, isMobile } from "@/lib/download";
import { Lightbox } from "@/components/Lightbox";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

type PhotoItem = { id: string; url: string; media_type?: string };

const Person = () => {
  const { t } = useI18n();
  const { id } = useParams();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [eventSlug, setEventSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-photos?id=${id}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Failed");
        setPhotos(j.photos || []);
        setDisplayName(j.display_name || null);
        setEventSlug(j.event_slug || null);
      } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
      finally { setLoading(false); }
    };
    if (id) load();
  }, [id]);

  useEffect(() => {
    if (!photos.length || !isMobile()) return;
    preloadDownloadFiles(photos.map((p, i) => ({ url: p.url, name: `${displayName || "person"}-${i + 1}.jpg` }))).catch(() => {});
  }, [photos, displayName]);

  const downloadItems = async (itemsToDownload: PhotoItem[]) => {
    if (!itemsToDownload.length) return;
    setZipping({ done: 0, total: itemsToDownload.length });
    try {
      await saveManyToGallery(
        itemsToDownload.map((p) => ({ url: p.url, name: `${displayName || "person"}-${photos.findIndex((x) => x.id === p.id) + 1}.jpg` })),
        `${displayName || "person"}-photos.zip`,
        (done, total) => setZipping({ done, total }),
      );
      toast.success(isMobile() ? t("saved_to_gallery") : t("download_ready"));
    } catch (error) { if (!isAbortError(error)) toast.error(error instanceof Error ? error.message : t("some_failed")); }
    finally { setZipping(null); }
  };

  const downloadAll = () => downloadItems(photos);
  const downloadSelected = () => downloadItems(photos.filter((p) => selected.has(p.id)));

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <FloatingLanguageSwitcher />
      {eventSlug && (
        <div className="px-6 pt-4">
          <Link to={`/e/${eventSlug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("back_to_album")}
          </Link>
        </div>
      )}
      <header className="px-6 pt-8 pb-6 text-center">
        <div className="inline-flex items-center gap-2 text-primary mb-2">
          <Heart className="w-4 h-4 fill-current" />
          <span className="text-xs uppercase tracking-wider">{t("person_folder")}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-foreground">{displayName || t("photos_of_person")}</h1>
        <p className="text-muted-foreground mt-2">{loading ? t("loading") : t("n_photos_simple", { n: photos.length })}</p>
        {photos.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={downloadAll} disabled={!!zipping} size="sm" className="gap-2">
              {zipping ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("preparing", { done: zipping.done, total: zipping.total })}</> : <><Download className="w-4 h-4" /> {t("download_all")}</>}
            </Button>
            <Button variant="outline" onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }} disabled={!!zipping} size="sm" className="gap-2">
              {selecting ? <><X className="w-4 h-4" /> {t("cancel")}</> : <><CheckSquare className="w-4 h-4" /> {t("select")}</>}
            </Button>
            {selecting && selected.size > 0 && (
              <Button variant="secondary" onClick={downloadSelected} disabled={!!zipping} size="sm" className="gap-2">
                <Download className="w-4 h-4" /> {t("download_n", { n: selected.size })}
              </Button>
            )}
          </div>
        )}
      </header>
      <main className="px-4 pb-16 max-w-5xl mx-auto">
        {error && <p className="text-destructive text-center">{error}</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((p, i) => (
            <div key={p.id} className="relative group aspect-square overflow-hidden rounded-2xl bg-muted" style={{ boxShadow: "var(--shadow-card)" }}>
              <button type="button" onClick={() => {
                if (selecting) {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                    return next;
                  });
                } else setLightboxIndex(i);
              }} className="block w-full h-full" aria-label={selecting ? t("select") : t("view_my_album")}>
                {p.media_type === "video" ? (
                  <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                ) : (
                  <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                )}
              </button>
              {selecting && (
                <div className="absolute top-2 start-2 bg-background/90 text-foreground rounded-full p-2 shadow" aria-hidden="true">
                  {selected.has(p.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </div>
              )}
              <button
                onPointerDown={() => preloadDownloadFile(p.url, `${displayName || "person"}-${i + 1}.jpg`).catch(() => {})}
                onFocus={() => preloadDownloadFile(p.url, `${displayName || "person"}-${i + 1}.jpg`).catch(() => {})}
                onClick={(e) => { e.preventDefault(); downloadOne(p.url, `${displayName || "person"}-${i + 1}.jpg`).catch((error) => { if (!isAbortError(error)) toast.error(error instanceof Error ? error.message : t("download_failed")); }); }}
                className="absolute top-2 end-2 bg-background/90 hover:bg-background text-foreground rounded-full p-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow"
                aria-label={t("download_all")}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </main>
      <Lightbox items={photos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={setLightboxIndex} fileNamePrefix={displayName || "person"} />
    </div>
  );
};

export default Person;
