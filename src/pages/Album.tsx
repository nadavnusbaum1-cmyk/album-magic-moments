import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Heart, Download, Loader2, ArrowLeft, CheckSquare, Square, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { downloadOne, preloadDownloadFile, preloadDownloadFiles, saveManyToGallery, isAbortError, isMobile } from "@/lib/download";
import { Lightbox } from "@/components/Lightbox";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

type ExtraLink = { label_en: string; label_he: string; url: string };

interface AlbumData {
  guest: { name: string };
  event?: { name?: string; slug?: string; extra_links?: ExtraLink[] | null } | null;
  photos: { id?: string; url: string; thumbUrl?: string; mediumUrl?: string; media_type?: string; created_at?: string }[];
  count: number;
  nextCursor: string | null;
}

const Album = () => {
  const { t, lang } = useI18n();
  const { token } = useParams();
  const [data, setData] = useState<AlbumData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fetchPage = useCallback(async (before?: string) => {
    const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-album`);
    if (token) url.searchParams.set("token", token);
    if (before) url.searchParams.set("before", before);
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || "Failed");
    return json as AlbumData;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchPage().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [token, fetchPage]);

  useEffect(() => {
    if (!data?.photos.length || !isMobile()) return;
    preloadDownloadFiles(data.photos.map((p, i) => ({ url: p.url, name: `${data.guest.name}-${i + 1}.jpg` }))).catch(() => {});
  }, [data]);

  const loadMore = async () => {
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(data.nextCursor);
      setData({ ...data, photos: [...data.photos, ...next.photos], nextCursor: next.nextCursor });
    } catch { toast.error(t("failed_load_more")); } finally { setLoadingMore(false); }
  };

  const downloadItems = async (indices: number[]) => {
    if (!data || !indices.length) return;
    setZipping({ done: 0, total: indices.length });
    try {
      await saveManyToGallery(
        indices.map((i) => ({ url: data.photos[i].url, name: `${data.guest.name}-${i + 1}.jpg` })),
        `${data.guest.name}-photos.zip`,
        (done, total) => setZipping({ done, total }),
      );
      toast.success(isMobile() ? t("saved_to_gallery") : t("download_ready"));
    } catch (error) { if (!isAbortError(error)) toast.error(error instanceof Error ? error.message : t("some_failed")); }
    finally { setZipping(null); }
  };

  const downloadAll = () => downloadItems(data?.photos.map((_, i) => i) ?? []);
  const downloadSelected = () => downloadItems([...selected]);

  if (error) return <div className="min-h-screen flex items-center justify-center p-6 text-center"><p className="text-destructive">{error}</p></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">{t("loading_album")}</p></div>;

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <FloatingLanguageSwitcher />
      {data.event?.slug && (
        <div className="px-6 pt-4">
          <Link to={`/e/${data.event.slug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("back_to_album")}
          </Link>
        </div>
      )}
      <header className="px-6 pt-8 pb-6 text-center">
        <div className="inline-flex items-center gap-2 text-primary mb-2">
          <Heart className="w-4 h-4 fill-current" />
          <span className="text-xs uppercase tracking-wider">{t("personal_album")}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-foreground">{t("hi_name", { name: data.guest.name })}</h1>
        <p className="text-muted-foreground mt-2">
          {data.count === 0 ? t("no_photos_check_back") : t("n_photos_of_you", { n: data.count })}
        </p>
        {data.photos.length > 0 && (
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
        {data.photos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">{t("notify_new")}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.photos.map((p, i) => (
                <div key={i} className="relative group aspect-square overflow-hidden rounded-2xl bg-muted" style={{ boxShadow: "var(--shadow-card)" }}>
                  <button type="button" onClick={() => {
                    if (selecting) {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        next.has(i) ? next.delete(i) : next.add(i);
                        return next;
                      });
                    } else setLightboxIndex(i);
                  }} className="block w-full h-full" aria-label={selecting ? t("select") : t("view_my_album")}>
                    {p.media_type === "video" ? (
                      <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      <img src={p.thumbUrl || p.url} alt={t("n_photo", { n: i + 1 })} className="w-full h-full object-cover" loading="lazy" />
                    )}
                  </button>
                  {selecting && (
                    <div className="absolute top-2 start-2 bg-background/90 text-foreground rounded-full p-2 shadow" aria-hidden="true">
                      {selected.has(i) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </div>
                  )}
                  <button
                    onPointerDown={() => preloadDownloadFile(p.url, `${data.guest.name}-${i + 1}.jpg`).catch(() => {})}
                    onFocus={() => preloadDownloadFile(p.url, `${data.guest.name}-${i + 1}.jpg`).catch(() => {})}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); downloadOne(p.url, `${data.guest.name}-${i + 1}.jpg`).catch((error) => { if (!isAbortError(error)) toast.error(error instanceof Error ? error.message : t("download_failed")); }); }}
                    className="absolute top-2 end-2 bg-background/90 hover:bg-background text-foreground rounded-full p-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow"
                    aria-label={t("download_all")}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {data.nextCursor && (
              <div className="text-center mt-6">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? t("loading") : t("load_more")}
                </Button>
              </div>
            )}
          </>
        )}


      </main>
      <Lightbox items={data.photos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={setLightboxIndex} fileNamePrefix={data.guest.name} />
    </div>
  );
};

export default Album;
