// Download helpers. Mobile uses the Web Share API so users can save photos
// directly into the device's Photos/Gallery app. Desktop falls back to a
// classic blob download (or a single zip for bulk).

export function isMobile() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function extFromUrl(url: string, fallback = "jpg") {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (m) return m[1].toLowerCase();
  } catch { /* ignore */ }
  return fallback;
}

function mimeFromExt(ext: string) {
  const e = ext.toLowerCase();
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "png") return "image/png";
  if (e === "heic") return "image/heic";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  if (e === "mp4" || e === "m4v") return "video/mp4";
  if (e === "mov") return "video/quicktime";
  return "application/octet-stream";
}

function ensureExt(name: string, url: string) {
  if (/\.[a-zA-Z0-9]{2,5}$/.test(name)) return name;
  return `${name}.${extFromUrl(url)}`;
}

async function fetchAsFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const name = ensureExt(filename, url);
  const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : mimeFromExt(extFromUrl(url));
  return new File([blob], name, { type });
}

function blobDownload(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function downloadOne(url: string, filename = "photo.jpg") {
  const file = await fetchAsFile(url, filename);

  // Mobile: open share sheet so the user can pick "Save Image" -> Photos.
  if (isMobile() && typeof navigator.share === "function") {
    try {
      // @ts-ignore
      const ok = !navigator.canShare || navigator.canShare({ files: [file] });
      if (ok) {
        await navigator.share({ files: [file], title: file.name });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // fall through to blob download
    }
  }

  blobDownload(file);
}

export async function downloadManyAsZip(
  items: { url: string; name: string }[],
  zipName = "photos.zip",
  onProgress?: (done: number, total: number) => void,
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  let done = 0;
  const CONCURRENCY = 6;
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        const it = items[i];
        try {
          const r = await fetch(it.url);
          if (r.ok) zip.file(ensureExt(it.name, it.url), await r.blob());
        } catch { /* skip */ }
        done++;
        onProgress?.(done, items.length);
      }
    }),
  );
  const blob = await zip.generateAsync({ type: "blob" });
  blobDownload(new File([blob], zipName, { type: "application/zip" }));
}

// Mobile-aware bulk save. Phones: fetch every image first, then open the
// share sheet ONCE with all files so the user can tap "Save N Images" to
// drop them straight into Photos/Gallery. Desktop: zip download.
export async function saveManyToGallery(
  items: { url: string; name: string }[],
  zipName = "photos.zip",
  onProgress?: (done: number, total: number) => void,
): Promise<{ method: "share" | "sequential" | "zip" }> {
  if (!items.length) return { method: "zip" };

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  if (!isMobile() || !canShare) {
    await downloadManyAsZip(items, zipName, onProgress);
    return { method: "zip" };
  }

  // Fetch all files in parallel first (don't depend on user-activation across awaits).
  let done = 0;
  const CONCURRENCY = 6;
  let idx = 0;
  const files: File[] = [];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        const it = items[i];
        try {
          files.push(await fetchAsFile(it.url, it.name));
        } catch { /* skip */ }
        done++;
        onProgress?.(done, items.length);
      }
    }),
  );

  if (!files.length) throw new Error("No files to share");

  // Try one big share first.
  try {
    // @ts-ignore
    if (!navigator.canShare || navigator.canShare({ files })) {
      await navigator.share({ files, title: zipName });
      return { method: "share" };
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return { method: "share" };
    // fall through
  }

  // Some browsers cap the number of files. Try in smaller chunks.
  const BATCH = 10;
  try {
    for (let i = 0; i < files.length; i += BATCH) {
      const chunk = files.slice(i, i + BATCH);
      // @ts-ignore
      if (navigator.canShare && !navigator.canShare({ files: chunk })) throw new Error("canShare=false");
      await navigator.share({ files: chunk, title: zipName });
    }
    return { method: "share" };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { method: "share" };
  }

  // Last resort: trigger per-file blob downloads.
  for (const f of files) blobDownload(f);
  return { method: "sequential" };
}
