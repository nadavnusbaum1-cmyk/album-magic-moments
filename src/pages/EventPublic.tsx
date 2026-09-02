// Public event landing page (replaces old Index for guests).
// Path: /e/:slug
import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Camera, Sparkles, Upload, Heart, Users, Loader2, Image as ImageIcon, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { convertHeicIfNeeded, prepareImageForUpload, isVideo, uploadRenditions } from "@/lib/imageUtils";
import { extractTakenAt } from "@/lib/exif";
import { useIsMobile } from "@/hooks/use-mobile";
import { Lightbox } from "@/components/Lightbox";
import { authedFetch, useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { FloatingLanguageSwitcher, LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandMark } from "@/components/BrandMark";
import { Mori } from "@/components/Mori";
import { useI18n } from "@/lib/i18n";
import { ExternalLink } from "lucide-react";

type ExtraLink = { label_en: string; label_he: string; url: string };
type Event = { id: string; name: string; slug: string; event_date: string | null; cover_image_url: string | null; home_bg_url?: string | null; show_people: boolean; show_all_photos: boolean; allow_guest_uploads?: boolean; default_language?: string | null; extra_links?: ExtraLink[] | null; album_tabs?: boolean; };
type Cluster = { id: string; cover_url: string | null; photo_count: number; display_name: string | null };
type Photo = { id: string; url: string; thumbUrl?: string; mediumUrl?: string; media_type?: string };

export default function EventPublic() {
  const { t, setDefaultLang, lang } = useI18n();
  const { slug } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [event, setEvent] = useState<Event | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ token: string; photoCount: number } | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [photosCursor, setPhotosCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showFullAlbum, setShowFullAlbum] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Photographer "album tabs" (folders as tabs) gallery
  const [tabSources, setTabSources] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [tabPhotos, setTabPhotos] = useState<Photo[]>([]);
  const [tabCursor, setTabCursor] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [peopleVisible, setPeopleVisible] = useState(12);
  const { session } = useSession();
  const [isHost, setIsHost] = useState(false);

  // Guest upload state
  const [guestName, setGuestName] = useState("");
  const [guestUploading, setGuestUploading] = useState(false);
  const [guestProgress, setGuestProgress] = useState({ done: 0, total: 0, errors: 0 });

  useEffect(() => {
    if (!slug) return;
    const saved = localStorage.getItem(`guest-name:${slug}`);
    if (saved) setGuestName(saved);
  }, [slug]);

  const onGuestFiles = async (fileList: File[] | FileList | null) => {
    if (!fileList || !fileList.length || !event) return;
    if (!event.allow_guest_uploads) { toast.error(t("guest_uploads_off")); return; }
    const files = Array.from(fileList);
    if (guestName.trim()) localStorage.setItem(`guest-name:${slug}`, guestName.trim());
    setGuestUploading(true);
    setGuestProgress({ done: 0, total: files.length, errors: 0 });
    let done = 0, errors = 0;
    const bump = (isErr = false) => { done++; if (isErr) errors++; setGuestProgress({ done, total: files.length, errors }); };
    const clientId = (f: File) => `${f.name}|${f.size}|${f.lastModified}`.slice(0, 128);

    // 1) Prepare all files (HEIC convert + shrink) with a small CPU pool.
    type Prepped = { raw: File; file: File; takenAt: string | null };
    const prepped: (Prepped | null)[] = new Array(files.length).fill(null);
    let pc = 0;
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
      while (true) {
        const i = pc++; if (i >= files.length) break;
        const raw = files[i];
        try {
          const takenAt = isVideo(raw) ? null : await extractTakenAt(raw);
          const file = isVideo(raw) ? raw : await prepareImageForUpload(raw);
          prepped[i] = { raw, file, takenAt };
        } catch (e) { console.error(raw.name, e); bump(true); }
      }
    }));
    const items = prepped.filter((p): p is Prepped => !!p);
    if (!items.length) { setGuestUploading(false); if (errors) toast.error(t("n_files_failed", { n: errors })); return; }

    // 2) Batch-sign in chunks (one edge round-trip per ~25 files, not per file).
    type Signed = { file: File; photoId?: string; uploadUrl?: string; thumbUploadUrl?: string; mediumUploadUrl?: string; skipped?: boolean };
    const signed: Signed[] = [];
    const CHUNK = 25;
    for (let c = 0; c < items.length; c += CHUNK) {
      const batch = items.slice(c, c + CHUNK);
      try {
        const r = await authedFetch("guest-sign-s3-upload", {
          method: "POST",
          body: JSON.stringify({
            eventSlug: event.slug,
            uploadedBy: guestName.trim() || null,
            files: batch.map((b) => ({ name: b.file.name, contentType: b.file.type || "image/jpeg", takenAt: b.takenAt, size: b.file.size, clientUploadId: clientId(b.raw) })),
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "sign failed");
        (j.uploads || []).forEach((u: Signed, k: number) => signed.push({ ...u, file: batch[k].file }));
      } catch (e) { console.error(e); batch.forEach(() => bump(true)); }
    }

    // 3) PUT originals concurrently; renditions upload in the BACKGROUND so the
    // progress bar completes as soon as the originals land (much faster feel).
    const uploadedIds: string[] = [];
    const renditionPromises: Promise<void>[] = [];
    let uc = 0;
    await Promise.all(Array.from({ length: Math.min(10, signed.length) }, async () => {
      while (true) {
        const i = uc++; if (i >= signed.length) break;
        const s = signed[i];
        if (!s.uploadUrl || s.skipped) { bump(true); continue; }
        try {
          const put = await fetch(s.uploadUrl, { method: "PUT", headers: { "Content-Type": s.file.type || "image/jpeg" }, body: s.file });
          if (!put.ok) throw new Error(`put ${put.status}`);
          uploadedIds.push(s.photoId!);
          renditionPromises.push(uploadRenditions(s.file, s.thumbUploadUrl, s.mediumUploadUrl));
          bump();
        } catch (e) { console.error(e); bump(true); }
      }
    }));

    // Confirm originals now (so photos aren't lost if the guest closes the tab),
    // then re-confirm once renditions finish to record their keys — both in the
    // background so the guest sees success immediately.
    setGuestUploading(false);
    const ok = done - errors;
    if (ok > 0) toast.success(t("thanks_added", { n: ok }));
    if (errors) toast.error(t("n_files_failed", { n: errors }));
    if (uploadedIds.length) {
      authedFetch("confirm-upload", { method: "POST", body: JSON.stringify({ photoIds: uploadedIds }) }).catch(() => {});
      Promise.allSettled(renditionPromises).then(() => {
        authedFetch("confirm-upload", { method: "POST", body: JSON.stringify({ photoIds: uploadedIds }) }).catch(() => {});
      });
    }
  };

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const r = await authedFetch(`get-public-event?slug=${encodeURIComponent(slug)}`);
        const j = await r.json();
        if (!r.ok) { setNotFound(true); return; }
        setEvent(j.event);
        if (j.event?.default_language) setDefaultLang(j.event.default_language as "he" | "en");
      } catch { setNotFound(true); }
    })();
  }, [slug]);

  // Show the owner a "Manage event" shortcut (server-verified; guests never see it).
  useEffect(() => {
    if (!session || !event?.id) { setIsHost(false); return; }
    (async () => {
      const { data } = await supabase.rpc("is_event_host", { _user_id: session.user.id, _event_id: event.id });
      setIsHost(!!data);
    })();
  }, [session, event?.id]);

  useEffect(() => {
    if (!event) return;
    (async () => {
      try {
        const r = await authedFetch("list-clusters", { method: "POST", body: JSON.stringify({ eventSlug: event.slug }) });
        const j = await r.json();
        if (r.ok) setClusters(j.clusters || []);
      } catch (e) { console.error(e); }
    })();
  }, [event]);

  const loadFullAlbum = async (initial = false) => {
    if (!event) return;
    if (initial) setShowFullAlbum(true);
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await authedFetch("list-photos", { method: "POST", body: JSON.stringify({ eventSlug: event.slug, limit: 60, before: initial ? undefined : photosCursor }) });
      const j = await r.json();
      if (r.ok) {
        setAllPhotos((prev) => initial ? (j.photos || []) : [...prev, ...(j.photos || [])]);
        setPhotosCursor(j.nextCursor || null);
      }
    } finally { setLoadingMore(false); }
  };

  const loadTab = async (label: string, initial = false) => {
    if (!event) return;
    setTabLoading(true);
    try {
      const r = await authedFetch("list-photos", { method: "POST", body: JSON.stringify({ eventSlug: event.slug, sourceLabel: label, limit: 60, before: initial ? undefined : tabCursor }) });
      const j = await r.json();
      if (r.ok) {
        setTabPhotos((prev) => initial ? (j.photos || []) : [...prev, ...(j.photos || [])]);
        setTabCursor(j.nextCursor || null);
      }
    } finally { setTabLoading(false); }
  };

  const selectTab = (label: string) => {
    if (label === activeTab) return;
    setActiveTab(label);
    setTabPhotos([]);
    setTabCursor(null);
    loadTab(label, true);
  };

  const goToAlbum = () => {
    if (!event) return;
    if (!event.album_tabs && !showFullAlbum) loadFullAlbum(true);
    setTimeout(() => document.getElementById("full-album")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };

  const onSelfieFile = async (file: File) => {
    try {
      const converted = await prepareImageForUpload(await convertHeicIfNeeded(file));
      const reader = new FileReader();
      reader.onload = () => setSelfie(reader.result as string);
      reader.readAsDataURL(converted);
    } catch { toast.error(t("couldnt_read_image")); }
  };

  const submit = async () => {
    if (!selfie || !event) return toast.error(t("please_add_selfie"));
    setLoading(true);
    try {
      const r = await authedFetch("register-guest", {
        method: "POST",
        body: JSON.stringify({ name: `Guest-${Date.now().toString(36)}`, selfieBase64: selfie, eventSlug: event.slug }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || t("something_wrong"));
      if (data.error) throw new Error(data.error);
      setResult({ token: data.token, photoCount: data.photoCount });
      toast.success(t("found_n_photos", { n: data.photoCount }));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("something_wrong")); }
    finally { setLoading(false); }
  };

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center text-center p-6">
      <FloatingLanguageSwitcher />
      <div><h1 className="font-serif text-2xl">{t("event_not_found")}</h1><Link to="/" className="text-sm text-primary mt-2 inline-block">{t("go_home")}</Link></div>
    </div>
  );
  if (!event) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (result) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-soft)" }}>
      <FloatingLanguageSwitcher />
      <Card className="max-w-md w-full p-8 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mx-auto" style={{ background: "var(--gradient-romantic)" }}>
          <Sparkles className="w-10 h-10 text-primary-foreground" />
        </div>
        <Mori expression="celebrating" size={104} className="mx-auto -mt-2" />
        <h1 className="text-3xl font-serif">{t("youre_in")}</h1>
        <p className="text-muted-foreground">{t("found_n_photos_videos", { n: result.photoCount })}</p>
        <Link to={`/album/${result.token}`}><Button size="lg" className="w-full">{t("view_my_album")}</Button></Link>
        <Button variant="outline" className="w-full" onClick={() => setResult(null)}>{t("back")}</Button>
      </Card>
    </div>
  );

  return (
    <div
      className="min-h-screen relative"
      style={
        event.home_bg_url
          ? { backgroundImage: `url(${event.home_bg_url})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }
          : { background: "var(--gradient-soft)" }
      }
    >
      {event.home_bg_url && <div className="absolute inset-0 bg-background/70 backdrop-blur-sm pointer-events-none" aria-hidden />}
      <div className="relative">

      <div className="flex items-center justify-between px-4 md:px-6 pt-3">
        <Link to="/" aria-label="HeyMori"><BrandMark avatar avatarSize={28} className="text-base md:text-lg" /></Link>
        <LanguageSwitcher />
      </div>
      <header className="px-6 pt-2 md:pt-6 pb-5 md:pb-8 text-center">
        <div className="inline-flex items-center gap-2 text-primary mb-2">
          <Heart className="w-4 h-4 md:w-5 md:h-5 fill-current" />
          <span className="text-sm tracking-wide uppercase">{event.name}</span>
          <Heart className="w-4 h-4 md:w-5 md:h-5 fill-current" />
        </div>
        <h1 className="text-3xl md:text-5xl font-serif flex items-center justify-center flex-wrap gap-x-3 gap-y-1">
          <Mori expression="searching" size={isMobile ? 54 : 76} className="inline-block shrink-0 -my-2" />
          <span>{t("find_your_photos")}</span>
        </h1>
        <p className="text-muted-foreground mt-2 md:mt-3 max-w-md mx-auto text-sm md:text-base">{t("find_desc")}</p>
      </header>

      <main className="px-6 pb-12">
        <Card className="max-w-md mx-auto p-6 space-y-5">
          <div>
            <label className="text-sm font-medium mb-1 block">{t("selfie_label")}</label>
            <p className="text-xs text-muted-foreground mb-2">{t("selfie_hint")}</p>
            <div className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-2xl p-6 bg-secondary/40">
              {selfie ? <img src={selfie} alt={t("your_selfie")} className="w-32 h-32 rounded-full object-cover" /> : <Camera className="w-10 h-10 text-muted-foreground" />}
              {isMobile ? (
                <div className="flex gap-2 w-full">
                  <label htmlFor="selfie-camera" className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary"><Camera className="w-4 h-4" /> {t("take_photo")}</label>
                  <label htmlFor="selfie-gallery" className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary"><Upload className="w-4 h-4" /> {t("from_gallery")}</label>
                </div>
              ) : (
                <label htmlFor="selfie-gallery" className="w-full flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary"><Upload className="w-4 h-4" /> {t("choose_photo")}</label>
              )}
              <input id="selfie-camera" type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => e.target.files?.[0] && onSelfieFile(e.target.files[0])} disabled={loading} />
              <input id="selfie-gallery" type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(e) => e.target.files?.[0] && onSelfieFile(e.target.files[0])} disabled={loading} />
            </div>
          </div>
          <Button onClick={submit} disabled={loading} size="lg" className="w-full">{loading ? t("doing_magic") : t("find_my_photos")}</Button>
          <p className="text-[11px] text-center text-muted-foreground/70">
            <Link to="/legal" className="underline hover:text-primary">{t("privacy_policy")}</Link>
          </p>
          {loading && (
            <div className="space-y-2">
              <IndeterminateBar />
              <p className="text-xs text-center text-muted-foreground">{t("searching_photos")}</p>
              <p className="text-[11px] text-center text-muted-foreground/70">{t("this_can_take")}</p>
            </div>
          )}
        </Card>

        {event.show_all_photos && (
          <div className="max-w-md mx-auto mt-6">
            <button onClick={() => navigate(`/e/${slug}/album`)}
              className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-foreground text-background py-4 px-5 text-base font-semibold shadow-lg hover:opacity-90 transition-opacity">
              <ImageIcon className="w-5 h-5" /> {t("view_full_album")}
            </button>
          </div>
        )}

        {event.allow_guest_uploads && (
          <Card className="max-w-md mx-auto mt-6 p-6 space-y-4">
            <div>
              <h3 className="font-serif text-xl">{t("share_your_photos")}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t("share_your_photos_desc")}</p>
            </div>
            <Input
              placeholder={t("your_name_optional")}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              disabled={guestUploading}
              maxLength={60}
            />
            <div>
              <label htmlFor="guest-gallery" className={`w-full flex items-center justify-center gap-2 text-sm py-3 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary ${guestUploading ? "opacity-50 pointer-events-none" : ""}`}>
                <Upload className="w-4 h-4" /> {t("choose_files")}
              </label>
            </div>
            <input id="guest-gallery" type="file" accept="image/*,video/*,.heic,.heif" multiple className="sr-only" onChange={(e) => { const fs = Array.from(e.target.files || []); e.currentTarget.value = ""; onGuestFiles(fs); }} disabled={guestUploading} />
            {guestUploading && (
              <div className="space-y-2">
                <Progress value={guestProgress.total ? (guestProgress.done / guestProgress.total) * 100 : 0} />
                <p className="text-xs text-center text-muted-foreground">
                  {t("upload_progress", { done: guestProgress.done, total: guestProgress.total })}{guestProgress.errors ? ` · ${t("uploads_failed", { n: guestProgress.errors })}` : ""}…
                </p>
              </div>
            )}
          </Card>
        )}





        {event.show_people && clusters.length > 0 && (
          <section className="max-w-5xl mx-auto mt-12">
            <h2 className="text-2xl md:text-3xl font-serif mb-4 px-1">{t("people_and_pets")}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {clusters.slice(0, peopleVisible).map((c) => (
                <Link key={c.id} to={`/person/${c.id}`} className="block relative aspect-square rounded-3xl overflow-hidden bg-muted shadow-sm hover:shadow-md">
                  {c.cover_url ? <img src={c.cover_url} alt={c.display_name || t("person_folder")} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><Users className="w-8 h-8 text-muted-foreground" /></div>}
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5 flex items-end justify-between gap-1">
                    {c.display_name ? <span className="text-white font-semibold text-sm truncate drop-shadow">{c.display_name}</span> : <span />}
                    <span className="text-white/80 text-[10px]">{c.photo_count}</span>
                  </div>
                </Link>
              ))}
            </div>
            {clusters.length > peopleVisible && (
              <div className="text-center mt-6">
                <Button variant="outline" onClick={() => setPeopleVisible((n) => n + 12)}>
                  {t("load_more_people", { n: clusters.length - peopleVisible })}
                </Button>
              </div>
            )}
          </section>
        )}

        {(event.extra_links || []).filter((l) => l.url && (l.label_en || l.label_he)).length > 0 && (
          <Card className="max-w-md mx-auto mt-6 p-6 space-y-3">
            <h3 className="font-serif text-xl">{t("more_from_event")}</h3>
            <div className="flex flex-col gap-2">
              {(event.extra_links || []).filter((l) => l.url && (l.label_en || l.label_he)).map((l, i) => {
                const label = (lang === "he" ? l.label_he : l.label_en) || l.label_en || l.label_he;
                return (
                  <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 text-sm py-3 px-3 rounded-xl bg-background border hover:border-primary">
                    <ExternalLink className="w-4 h-4" /> {label}
                  </a>
                );
              })}
            </div>
          </Card>
        )}


      </main>
      {isHost && (
        <Link
          to={`/dashboard/event/${event.id}`}
          className="fixed bottom-5 end-5 z-40 inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2.5 text-sm font-medium shadow-lg hover:opacity-90"
        >
          <LayoutDashboard className="w-4 h-4" /> {t("manage_event")}
        </Link>
      )}
      </div>
    </div>

  );
}

function IndeterminateBar() {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div className="absolute inset-y-0 w-1/3 rounded-full bg-primary animate-[indeterminate_1.4s_ease-in-out_infinite]" />
      <style>{`@keyframes indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
    </div>
  );
}
