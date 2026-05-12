// Download helpers. Desktop: forced download via blob. Mobile: uses Web Share API
// when available so iOS users can save to the Photos gallery.

export function isMobile() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export async function downloadOne(url: string, filename = "photo.jpg") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();

  if (isMobile() && typeof navigator.share === "function") {
    try {
      const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
      // @ts-ignore
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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
          if (r.ok) zip.file(it.name, await r.blob());
        } catch { /* skip */ }
        done++;
        onProgress?.(done, items.length);
      }
    }),
  );
  const blob = await zip.generateAsync({ type: "blob" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
