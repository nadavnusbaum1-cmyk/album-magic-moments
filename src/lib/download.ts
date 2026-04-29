// Download helpers: single file via fetch+blob, bulk as ZIP using JSZip.
// Loaded dynamically so it doesn't bloat initial bundle.

export async function downloadOne(url: string, filename = "photo.jpg") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (e) {
    // Fallback: open in new tab
    window.open(url, "_blank");
    throw e;
  }
}

export async function downloadManyAsZip(
  items: { url: string; name: string }[],
  zipName = "photos.zip",
  onProgress?: (done: number, total: number) => void,
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  let done = 0;
  // Limit concurrency so the browser doesn't choke
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
