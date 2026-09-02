// Full event album — a dedicated, native-mobile-gallery style page (iOS Photos
// feel): edge-to-edge dense square grid, sticky header, folder tabs for
// photographer albums, and a full-screen swipeable lightbox. Route: /e/:slug/album
import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/auth";
import { Lightbox } from "@/components/Lightbox";
import { useI18n } from "@/lib/i18n";

type Photo = { id: string; url: string; thumbUrl?: string; mediumUrl?: string; media_type?: string };
type Ev = { id: string; name: string; slug: string; album_tabs?: boolean; default_language?: string | null };

export default function AlbumFull() {
  const { slug } = useParams<{ slug: string }>();
  const { t, setDefaultLang } = useI18n();
  const [event, setEvent] = useState<Ev | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [hasVideos, setHasVideos] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const r = await authedFetch(`get-public-event?slug=${encodeURIComponent(slug)}`);
        const j = await r.json();
        if (!r.ok) { setNotFound(true); return; }
        setEvent(j.event);
        if (j.event?.default_language) setDefaultLang(j.event.default_language);
      } catch { setNotFound(true); }
    })();
  }, [slug, setDefaultLang]);

  // Photographer albums organise by folder (source_label); everyone else splits
  // Photos vs Videos. The active tab key is a folder name in folder mode, or a
  // media_type ("image"/"video") otherwise.
  const folderMode = !!event?.album_tabs;

  const load = useCallback(async (tabKey: string, initial: boolean) => {
    if (!event) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = { eventSlug: event.slug, limit: 60, before: initial ? undefined : cursor };
      if (event.album_tabs) { if (tabKey) body.sourceLabel = tabKey; }
      else { body.mediaType = tabKey || "image"; }
      const r = await authedFetch("list-photos", { method: "POST", body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok) {
        if (initial) {
          if (j.sources && !sources.length) setSources(j.sources.filter(Boolean));
          if (typeof j.hasVideos === "boolean") setHasVideos(j.hasVideos);
        }
        setPhotos((prev) => initial ? (j.photos || []) : [...prev, ...(j.photos || [])]);
        setCursor(j.nextCursor || null);
      }
    } finally { setLoading(false); }
  }, [event, cursor, sources.length]);

  // First load once the event resolves. Folder albums start on "All photos";
  // standard albums start on the Photos tab (videos live behind their own tab so
  // slow-uploading videos never hold up the photos).
  useEffect(() => {
    if (!event) return;
    const def = event.album_tabs ? "" : "image";
    setActiveTab(def);
    load(def, true).then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const selectTab = (key: string) => {
    if (key === activeTab) return;
    setActiveTab(key); setPhotos([]); setCursor(null); load(key, true);
  };

  const tabs: { key: string; label: string }[] = folderMode
    ? (sources.length ? ["", ...sources].map((s) => ({ key: s, label: s || t("all_photos") })) : [])
    : (hasVideos ? [{ key: "image", label: t("photos_tab") }, { key: "video", label: t("videos_tab") }] : []);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && cursor && !loading) load(activeTab, false);
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loading, activeTab, load]);

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center text-center p-6">
      <div><h1 className="font-serif text-2xl">{t("event_not_found")}</h1><Link to="/" className="text-sm text-primary mt-2 inline-block">{t("go_home")}</Link></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border/60">
        <div className="flex items-center gap-3 px-3 h-14">
          <Link to={`/e/${slug}`} aria-label={t("back")} className="p-2 -ms-1 rounded-full hover:bg-secondary text-foreground">
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </Link>
          <div className="min-w-0">
            <h1 className="font-serif text-lg leading-tight truncate">{event?.name || t("all_photos")}</h1>
          </div>
        </div>
        {tabs.length > 0 && (
          <div className="overflow-x-auto no-scrollbar border-t border-border/50">
            <div className="flex gap-5 md:gap-7 px-4 min-w-max">
              {tabs.map((tab) => (
                <button key={tab.key || "__all"} onClick={() => selectTab(tab.key)}
                  className={`relative py-2.5 text-sm whitespace-nowrap transition-colors ${activeTab === tab.key ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
                  {tab.label}
                  {activeTab === tab.key && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-primary rounded-full" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {loading && !photos.length ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !photos.length ? (
        <p className="text-center text-sm text-muted-foreground py-24">{t("no_photos_yet")}</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-[2px]">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => setLightbox(i)} className="relative aspect-square overflow-hidden bg-muted active:opacity-80">
              {p.media_type === "video" ? (
                <><video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" /><span className="absolute bottom-1 end-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">▶</span></>
              ) : (
                <img src={p.thumbUrl || p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              )}
            </button>
          ))}
        </div>
      )}

      <div ref={sentinel} />
      {loading && photos.length > 0 && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

      <Lightbox items={photos} index={lightbox} onClose={() => setLightbox(null)} onIndexChange={setLightbox} fileNamePrefix={event?.slug || "photo"} />
    </div>
  );
}
