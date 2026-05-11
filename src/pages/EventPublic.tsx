// Public event landing page (replaces old Index for guests).
// Path: /e/:slug
import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Camera, Sparkles, Upload, Heart, Users, Loader2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { convertHeicIfNeeded, prepareImageForUpload, isVideo } from "@/lib/imageUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Lightbox } from "@/components/Lightbox";
import { authedFetch, authedInvoke } from "@/lib/auth";

type Event = { id: string; name: string; slug: string; event_date: string | null; cover_image_url: string | null; show_people: boolean; show_all_photos: boolean; allow_guest_uploads?: boolean; };
type Cluster = { id: string; cover_url: string | null; photo_count: number; display_name: string | null };
type Photo = { id: string; url: string; media_type?: string };

export default function EventPublic() {
  const { slug } = useParams();
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
  const [peopleVisible, setPeopleVisible] = useState(12);

  // Guest upload state
  const [guestName, setGuestName] = useState("");
  const [guestUploading, setGuestUploading] = useState(false);
  const [guestProgress, setGuestProgress] = useState({ done: 0, total: 0, errors: 0 });

  useEffect(() => {
    if (!slug) return;
    const saved = localStorage.getItem(`guest-name:${slug}`);
    if (saved) setGuestName(saved);
  }, [slug]);

  const onGuestFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length || !event) return;
    if (!event.allow_guest_uploads) { toast.error("Guest uploads are off for this event"); return; }
    const files = Array.from(fileList);
    if (guestName.trim()) localStorage.setItem(`guest-name:${slug}`, guestName.trim());
    setGuestUploading(true);
    setGuestProgress({ done: 0, total: files.length, errors: 0 });
    let done = 0, errors = 0;
    const bumpDone = () => { done++; setGuestProgress({ done, total: files.length, errors }); };
    const bumpErr = () => { errors++; bumpDone(); };

    // Pipeline: each worker preps one file, signs, PUTs, kicks processing.
    // Concurrency = 4 keeps phones responsive while overlapping CPU + network.
    const CONCURRENCY = 6;
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= files.length) return;
        const raw = files[idx];
        try {
          const prepared = isVideo(raw) ? raw : await prepareImageForUpload(raw);
          const r = await authedFetch("guest-sign-s3-upload", {
            method: "POST",
            body: JSON.stringify({
              eventSlug: event.slug,
              uploadedBy: guestName.trim() || null,
              files: [{ name: prepared.name, contentType: prepared.type || "image/jpeg" }],
            }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "sign failed");
          const u = (j.uploads || [])[0] as { photoId: string; uploadUrl: string; skipped?: boolean } | undefined;
          if (!u || u.skipped) { bumpErr(); continue; }
          const put = await fetch(u.uploadUrl, { method: "PUT", headers: { "Content-Type": prepared.type || "image/jpeg" }, body: prepared });
          if (!put.ok) throw new Error(`put ${put.status}`);
          authedInvoke("process-photo-now", { photoId: u.photoId }).catch(() => {});
          bumpDone();
        } catch (e) {
          console.error(raw.name, e);
          bumpErr();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    setGuestUploading(false);
    const ok = done - errors;
    if (ok > 0) toast.success(`Thanks! Added ${ok} photo${ok === 1 ? "" : "s"} to the album 💖`);
    if (errors) toast.error(`${errors} file(s) failed`);
  };

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const r = await authedFetch(`get-public-event?slug=${encodeURIComponent(slug)}`);
        const j = await r.json();
        if (!r.ok) { setNotFound(true); return; }
        setEvent(j.event);
      } catch { setNotFound(true); }
    })();
  }, [slug]);

  // Only load people on first paint — full album is gated behind a button.
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


  const onSelfieFile = async (file: File) => {
    try {
      const converted = await convertHeicIfNeeded(file);
      const reader = new FileReader();
      reader.onload = () => setSelfie(reader.result as string);
      reader.readAsDataURL(converted);
    } catch { toast.error("Could not read that image"); }
  };

  const submit = async () => {
    if (!selfie || !event) return toast.error("Please add a selfie ✨");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-guest", {
        body: { name: `Guest-${Date.now().toString(36)}`, selfieBase64: selfie, eventSlug: event.slug },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setResult({ token: data.token, photoCount: data.photoCount });
      toast.success(`Found ${data.photoCount} photos of you! 🎉`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setLoading(false); }
  };

  if (notFound) return <div className="min-h-screen flex items-center justify-center text-center p-6"><div><h1 className="font-serif text-2xl">Event not found</h1><Link to="/" className="text-sm text-primary mt-2 inline-block">Go home</Link></div></div>;
  if (!event) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (result) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-soft)" }}>
      <Card className="max-w-md w-full p-8 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mx-auto" style={{ background: "var(--gradient-romantic)" }}>
          <Sparkles className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-serif">You're in! 💕</h1>
        <p className="text-muted-foreground">Found <b className="text-primary">{result.photoCount}</b> photos &amp; videos of you.</p>
        <Link to={`/album/${result.token}`}><Button size="lg" className="w-full">View My Album</Button></Link>
        <Button variant="outline" className="w-full" onClick={() => setResult(null)}>Back</Button>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="px-6 pt-12 pb-8 text-center">
        <div className="inline-flex items-center gap-2 text-primary mb-3">
          <Heart className="w-5 h-5 fill-current" />
          <span className="text-sm tracking-wide uppercase">{event.name}</span>
          <Heart className="w-5 h-5 fill-current" />
        </div>
        <h1 className="text-4xl md:text-5xl font-serif">Find your photos &amp; videos</h1>
        <p className="text-muted-foreground mt-3 max-w-md mx-auto">Take a quick selfie so we can find every photo and video <em>you appear in</em>. Your selfie isn't added to the album.</p>
      </header>

      <main className="px-6 pb-12">
        <Card className="max-w-md mx-auto p-6 space-y-5">
          <div>
            <label className="text-sm font-medium mb-2 block">Your selfie 📸</label>
            <div className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-2xl p-6 bg-secondary/40">
              {selfie ? <img src={selfie} alt="Your selfie" className="w-32 h-32 rounded-full object-cover" /> : <Camera className="w-10 h-10 text-muted-foreground" />}
              {isMobile ? (
                <div className="flex gap-2 w-full">
                  <label htmlFor="selfie-camera" className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary"><Camera className="w-4 h-4" /> Take photo</label>
                  <label htmlFor="selfie-gallery" className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary"><Upload className="w-4 h-4" /> From gallery</label>
                </div>
              ) : (
                <label htmlFor="selfie-gallery" className="w-full flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary"><Upload className="w-4 h-4" /> Choose photo</label>
              )}
              <input id="selfie-camera" type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => e.target.files?.[0] && onSelfieFile(e.target.files[0])} disabled={loading} />
              <input id="selfie-gallery" type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(e) => e.target.files?.[0] && onSelfieFile(e.target.files[0])} disabled={loading} />
            </div>
          </div>
          <Button onClick={submit} disabled={loading} size="lg" className="w-full">{loading ? "Doing the magic ✨" : "Find my photos"}</Button>
        </Card>

        {event.allow_guest_uploads && (
          <Card className="max-w-md mx-auto mt-6 p-6 space-y-4">
            <div>
              <h3 className="font-serif text-xl">Share your photos 📷</h3>
              <p className="text-sm text-muted-foreground mt-1">Got pictures from the event? Add them to the album!</p>
            </div>
            <Input
              placeholder="Your name (optional)"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              disabled={guestUploading}
              maxLength={60}
            />
            <div className="flex gap-2">
              <label htmlFor="guest-camera" className={`flex-1 flex items-center justify-center gap-2 text-sm py-3 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary ${guestUploading ? "opacity-50 pointer-events-none" : ""}`}>
                <Camera className="w-4 h-4" /> Take photo
              </label>
              <label htmlFor="guest-gallery" className={`flex-1 flex items-center justify-center gap-2 text-sm py-3 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary ${guestUploading ? "opacity-50 pointer-events-none" : ""}`}>
                <Upload className="w-4 h-4" /> Choose files
              </label>
            </div>
            <input id="guest-camera" type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { onGuestFiles(e.target.files); e.target.value = ""; }} disabled={guestUploading} />
            <input id="guest-gallery" type="file" accept="image/*,video/*,.heic,.heif" multiple className="hidden" onChange={(e) => { onGuestFiles(e.target.files); e.target.value = ""; }} disabled={guestUploading} />
            {guestUploading && (
              <p className="text-xs text-center text-muted-foreground">
                Uploading {guestProgress.done}/{guestProgress.total}{guestProgress.errors ? ` · ${guestProgress.errors} failed` : ""}…
              </p>
            )}
          </Card>
        )}

        {event.show_people && clusters.length > 0 && (
          <section className="max-w-5xl mx-auto mt-12">
            <h2 className="text-2xl md:text-3xl font-serif mb-4 px-1">People &amp; Pets</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {clusters.map((c) => (
                <Link key={c.id} to={`/person/${c.id}`} className="block relative aspect-square rounded-3xl overflow-hidden bg-muted shadow-sm hover:shadow-md">
                  {c.cover_url ? <img src={c.cover_url} alt={c.display_name || "Person"} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><Users className="w-8 h-8 text-muted-foreground" /></div>}
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5 flex items-end justify-between gap-1">
                    <span className="text-white font-semibold text-sm truncate drop-shadow">{c.display_name || "Add name"}</span>
                    <span className="text-white/80 text-[10px]">{c.photo_count}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {event.show_all_photos && (
          <section className="max-w-5xl mx-auto mt-12 text-center">
            {!showFullAlbum ? (
              <Button size="lg" variant="outline" onClick={() => loadFullAlbum(true)}>
                <ImageIcon className="w-4 h-4 mr-2" /> View full album
              </Button>
            ) : (
              <>
                <h2 className="text-2xl md:text-3xl font-serif mb-4 px-1 text-left">All photos</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {allPhotos.map((p, i) => (
                    <button key={p.id} onClick={() => setLightboxIndex(i)} className="relative aspect-square overflow-hidden rounded-xl bg-muted hover:opacity-90">
                      {p.media_type === "video" ? (<><video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" /><span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">▶</span></>) : <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    </button>
                  ))}
                </div>
                {photosCursor && (
                  <div className="text-center mt-6">
                    <Button variant="outline" onClick={() => loadFullAlbum(false)} disabled={loadingMore}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                )}
                {!allPhotos.length && loadingMore && <p className="text-sm text-muted-foreground py-6">Loading…</p>}
              </>
            )}
          </section>
        )}

      </main>
      <Lightbox items={allPhotos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={setLightboxIndex} fileNamePrefix={event.slug} />
    </div>
  );
}
