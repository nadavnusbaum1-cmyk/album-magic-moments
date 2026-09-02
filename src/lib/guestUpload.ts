// Pipelined guest/host photo upload. A pool of workers each takes the next file
// and runs prepare → sign → PUT for it, so uploads begin as soon as the first
// photo is ready (no "prepare everything first" wait) and progress advances
// continuously. Image prep runs in a Web Worker (see imageUtils) so the UI never
// freezes; thumbnail/medium renditions upload in the background and the upload is
// confirmed immediately (so nothing is lost if the tab closes) and again once the
// renditions land, to record their keys.
import { authedFetch } from "@/lib/auth";
import { prepareImageForUpload, isVideo, uploadRenditions } from "@/lib/imageUtils";
import { extractTakenAt } from "@/lib/exif";

type SignedUpload = { photoId?: string; uploadUrl?: string; thumbUploadUrl?: string; mediumUploadUrl?: string; skipped?: boolean };

export async function uploadGuestFiles(opts: {
  files: File[];
  eventSlug: string;
  uploadedBy: string | null;
  concurrency?: number;
  onProgress: (done: number, errors: number) => void;
}): Promise<{ uploadedIds: string[]; done: number; errors: number }> {
  const { files, eventSlug, uploadedBy, onProgress } = opts;
  let done = 0, errors = 0;
  const bump = (isErr = false) => { done++; if (isErr) errors++; onProgress(done, errors); };
  const uploadedIds: string[] = [];
  const renditionPromises: Promise<void>[] = [];
  const clientId = (f: File) => `${f.name}|${f.size}|${f.lastModified}`.slice(0, 128);

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= files.length) return;
      const raw = files[i];
      try {
        const takenAt = isVideo(raw) ? null : await extractTakenAt(raw);
        const file = isVideo(raw) ? raw : await prepareImageForUpload(raw);
        const r = await authedFetch("guest-sign-s3-upload", {
          method: "POST",
          body: JSON.stringify({
            eventSlug,
            uploadedBy,
            files: [{ name: file.name, contentType: file.type || "image/jpeg", takenAt, size: file.size, clientUploadId: clientId(raw) }],
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "sign failed");
        const u = (j.uploads || [])[0] as SignedUpload | undefined;
        if (!u || u.skipped || !u.uploadUrl) { bump(true); continue; }
        const put = await fetch(u.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
        if (!put.ok) throw new Error(`put ${put.status}`);
        uploadedIds.push(u.photoId!);
        renditionPromises.push(uploadRenditions(file, u.thumbUploadUrl, u.mediumUploadUrl));
        bump();
      } catch (e) { console.error(raw.name, e); bump(true); }
    }
  };

  const pool = Math.min(opts.concurrency ?? 8, Math.max(1, files.length));
  await Promise.all(Array.from({ length: pool }, worker));

  const confirm = () =>
    authedFetch("confirm-upload", { method: "POST", body: JSON.stringify({ photoIds: uploadedIds }) }).catch(() => {});
  if (uploadedIds.length) {
    confirm();
    Promise.allSettled(renditionPromises).then(confirm);
  }
  return { uploadedIds, done, errors };
}
