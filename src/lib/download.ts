// Download helpers. Mobile never falls back to zip/file downloads for photos:
// it uses the native share sheet so users can save images into Photos/Gallery.
// Desktop keeps classic blob downloads and zip downloads for bulk.

export function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
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

const fileCache = new Map<string, { promise: Promise<File>; file?: File }>();

export function preloadDownloadFile(url: string, filename = "photo.jpg") {
  const key = `${url}\n${filename}`;
  const cached = fileCache.get(key);
  if (cached) return cached.promise;

  const entry: { promise: Promise<File>; file?: File } = {
    promise: fetchAsFile(url, filename).then((file) => {
      entry.file = file;
      return file;
    }),
  };
  fileCache.set(key, entry);
  return entry.promise;
}

function getPreloadedFile(url: string, filename = "photo.jpg") {
  return fileCache.get(`${url}\n${filename}`)?.file;
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

function shareDataFor(files: File[], title: string) {
  return { files, title } as ShareData & { files: File[] };
}

function canShareFiles(files: File[]) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  const nav = navigator as Navigator & { canShare?: (data: ShareData & { files?: File[] }) => boolean };
  return !nav.canShare || nav.canShare(shareDataFor(files, files.length === 1 ? files[0].name : "Photos"));
}

function shareBatchSize(files: File[]) {
  if (canShareFiles(files)) return files.length;
  const candidates = [100, 50, 25, 10, 5, 1].filter((n) => n < files.length);
  return candidates.find((n) => canShareFiles(files.slice(0, n))) ?? 0;
}

async function nativeShareFiles(files: File[], title: string) {
  if (!canShareFiles(files)) {
    throw new Error("Saving to your phone gallery is not supported in this browser. Try opening the album in Safari or Chrome.");
  }
  await navigator.share(shareDataFor(files, title));
}

function waitForTapToShare(files: File[], title: string) {
  return new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Saving to your phone gallery is not supported in this browser."));
      return;
    }

    const batchSize = shareBatchSize(files);
    if (!batchSize) {
      reject(new Error("Saving to your phone gallery is not supported in this browser. Try opening the album in Safari or Chrome."));
      return;
    }

    let index = 0;
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:hsl(var(--background) / .88);display:flex;align-items:center;justify-content:center;padding:24px;";

    const panel = document.createElement("div");
    panel.style.cssText = "width:min(420px,100%);border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--card));color:hsl(var(--card-foreground));box-shadow:var(--shadow-elegant);padding:22px;text-align:center;font-family:inherit;";

    const heading = document.createElement("div");
    heading.style.cssText = "font-weight:600;font-size:18px;margin-bottom:8px;";
    heading.textContent = files.length === 1 ? "Photo ready" : `${files.length} photos ready`;

    const copy = document.createElement("p");
    copy.style.cssText = "margin:0 0 18px;color:hsl(var(--muted-foreground));font-size:14px;line-height:1.4;";

    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = "width:100%;border:0;border-radius:8px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));padding:12px 16px;font:inherit;font-weight:600;";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.style.cssText = "margin-top:10px;border:0;background:transparent;color:hsl(var(--muted-foreground));padding:8px;font:inherit;";
    cancel.textContent = "Cancel";

    const cleanup = () => overlay.remove();
    const update = () => {
      const currentBatch = Math.floor(index / batchSize) + 1;
      const batches = Math.ceil(files.length / batchSize);
      copy.textContent = batches > 1
        ? `Save batch ${currentBatch} of ${batches} to your phone gallery.`
        : "Tap below, then choose Save Image or Save Images in the phone share sheet.";
      button.textContent = batches > 1 ? `Save batch ${currentBatch}` : "Save to gallery";
      button.disabled = false;
    };

    button.onclick = async (event) => {
      event.preventDefault();
      button.disabled = true;
      const chunk = files.slice(index, index + batchSize);
      try {
        await nativeShareFiles(chunk, title);
        index += batchSize;
        if (index >= files.length) {
          cleanup();
          resolve();
        } else {
          update();
        }
      } catch (error) {
        button.disabled = false;
        if (isAbortError(error)) return;
        cleanup();
        reject(error);
      }
    };

    cancel.onclick = () => {
      cleanup();
      reject(new DOMException("Save cancelled", "AbortError"));
    };

    panel.append(heading, copy, button, cancel);
    overlay.append(panel);
    document.body.append(overlay);
    update();
  });
}

async function shareFilesToGallery(files: File[], title: string) {
  const batchSize = shareBatchSize(files);
  if (!batchSize) {
    throw new Error("Saving to your phone gallery is not supported in this browser. Try opening the album in Safari or Chrome.");
  }

  if (batchSize === files.length) {
    try {
      await nativeShareFiles(files, title);
      return;
    } catch (error) {
      if (isAbortError(error)) throw error;
    }
  }

  await waitForTapToShare(files, title);
}

export async function downloadOne(url: string, filename = "photo.jpg") {
  if (isMobile()) {
    const prepared = getPreloadedFile(url, filename) ?? await preloadDownloadFile(url, filename);
    await shareFilesToGallery([prepared], prepared.name);
    return;
  }

  const file = await preloadDownloadFile(url, filename);
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

  if (!isMobile()) {
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
          files.push(await preloadDownloadFile(it.url, it.name));
        } catch { /* skip */ }
        done++;
        onProgress?.(done, items.length);
      }
    }),
  );

  if (!files.length) throw new Error("No files to share");
  await shareFilesToGallery(files, zipName.replace(/\.zip$/i, ""));
  return { method: "share" };
}
