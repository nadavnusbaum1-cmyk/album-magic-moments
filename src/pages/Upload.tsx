// Dedicated guest photo-upload page. Path: /u/:slug
// Single-purpose "add the photos you took" screen — meant to be shared in a
// day-after thank-you message. Reuses the guest-upload backend.
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Camera, Loader2, CheckCircle2 } from "lucide-react";
import { Mori } from "@/components/Mori";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { authedFetch } from "@/lib/auth";
import { prepareImageForUpload, isVideo, uploadRenditions } from "@/lib/imageUtils";
import { extractTakenAt } from "@/lib/exif";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

type Ev = { id: string; name: string; slug: string; allow_guest_uploads?: boolean };

export default function Upload() {
  const { t, setDefaultLang } = useI18n();
  const { slug } = useParams();
  const [event, setEvent] = useState<Ev | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (!slug) return;
    const saved = localStorage.getItem(`guest-name:${slug}`);
    if (saved) setGuestName(saved);
    (async () => {
      try {
        const r = await authedFetch(`get-public-event?slug=${encodeURIComponent(slug)}`);
        const j = await r.json();
        if (!r.ok) { setNotFound(true); return; }
        setEvent(j.event);
        if (j.event?.default_language) setDefaultLang(j.event.default_language);
      } catch { setNotFound(true); }
    })();
  }, [slug]);

  const onFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length || !event) return;
    if (!event.allow_guest_uploads) { toast.error(t("guest_uploads_off")); return; }
    const files = Array.from(fileList);
    if (guestName.trim()) localStorage.setItem(`guest-name:${slug}`, guestName.trim());
    setUploading(true);
    setProgress({ done: 0, total: files.length, errors: 0 });
    let done = 0, errors = 0;
    const bump = (isErr = false) => { done++; if (isErr) errors++; setProgress({ done, total: files.length, errors }); };

    const CONCURRENCY = 6;
    const uploadedIds: string[] = [];
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= files.length) return;
        const raw = files[idx];
        try {
          const takenAt = isVideo(raw) ? null : await extractTakenAt(raw);
          const prepared = isVideo(raw) ? raw : await prepareImageForUpload(raw);
          const r = await authedFetch("guest-sign-s3-upload", {
            method: "POST",
            body: JSON.stringify({
              eventSlug: event.slug,
              uploadedBy: guestName.trim() || null,
              files: [{
                name: prepared.name, contentType: prepared.type || "image/jpeg", takenAt,
                size: prepared.size, clientUploadId: `${raw.name}|${raw.size}|${raw.lastModified}`.slice(0, 128),
              }],
            }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "sign failed");
          const u = (j.uploads || [])[0] as { photoId: string; uploadUrl: string; thumbUploadUrl?: string; mediumUploadUrl?: string; skipped?: boolean } | undefined;
          if (!u || u.skipped) { bump(true); continue; }
          const put = await fetch(u.uploadUrl, { method: "PUT", headers: { "Content-Type": prepared.type || "image/jpeg" }, body: prepared });
          if (!put.ok) throw new Error(`put ${put.status}`);
          uploadedIds.push(u.photoId);
          await uploadRenditions(prepared, u.thumbUploadUrl, u.mediumUploadUrl);
          bump();
        } catch (e) { console.error(raw.name, e); bump(true); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    if (uploadedIds.length) authedFetch("confirm-upload", { method: "POST", body: JSON.stringify({ photoIds: uploadedIds }) }).catch(() => {});
    setUploading(false);
    const ok = done - errors;
    setAdded((n) => n + ok);
    if (ok > 0) toast.success(t("thanks_added", { n: ok }));
    if (errors) toast.error(t("n_files_failed", { n: errors }));
  };

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-soft)" }}>
        <p className="text-muted-foreground">{t("event_not_found")}</p>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--gradient-soft)" }}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ background: "var(--gradient-soft)" }}>
      <FloatingLanguageSwitcher />
      <Link to="/" aria-label="HeyMori"><BrandMark avatar avatarSize={34} className="text-xl" /></Link>
      <Card className="max-w-md w-full p-8 space-y-5 text-center" style={{ boxShadow: "var(--shadow-soft)" }}>
        <Mori expression="phone" size={104} className="mx-auto" />
        <div>
          <h1 className="text-2xl font-serif">{event.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("upload_page_subtitle")}</p>
        </div>

        {!event.allow_guest_uploads ? (
          <p className="text-sm text-muted-foreground">{t("guest_uploads_off")}</p>
        ) : (
          <>
            {added > 0 && (
              <div className="flex items-center justify-center gap-2 text-sm text-primary">
                <CheckCircle2 className="w-4 h-4" /> {t("thanks_added", { n: added })}
              </div>
            )}
            <Input placeholder={t("your_name_optional")} value={guestName}
              onChange={(e) => setGuestName(e.target.value)} disabled={uploading} />

            <label htmlFor="upload-input"
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl p-8 cursor-pointer hover:border-primary bg-secondary/40 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              <Camera className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{added > 0 ? t("add_more_photos") : t("choose_your_photos")}</span>
              <input id="upload-input" type="file" accept="image/*,video/*,.heic,.heif" multiple className="hidden"
                disabled={uploading} onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = ""; }} />
            </label>

            {uploading && (
              <div className="space-y-2">
                <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  {t("upload_progress", { done: progress.done, total: progress.total })}
                  {progress.errors ? ` · ${t("uploads_failed", { n: progress.errors })}` : ""}
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground/80">{t("upload_page_hint")}</p>
          </>
        )}
      </Card>
    </div>
  );
}
