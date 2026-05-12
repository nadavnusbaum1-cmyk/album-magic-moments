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

// Mobile-aware bulk save. On phones, uses the Web Share API with multiple
// image files so users can save them straight to Photos/Gallery. Falls back
// to per-file share, then to a zip download.
export async function saveManyToGallery(
  items: { url: string; name: string }[],
  zipName = "photos.zip",
  onProgress?: (done: number, total: number) => void,
): Promise<{ method: "share" | "sequential" | "zip" }> {
  if (!items.length) return { method: "zip" };

  // Desktop or no share API: zip it.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  if (!isMobile() || !canShare) {
    await downloadManyAsZip(items, zipName, onProgress);
    return { method: "zip" };
  }

  // Try multi-file share in batches (iOS share sheet "Save N Images" => Photos).
  const BATCH = 20;
  let done = 0;
  try {
    // Probe support for multi-file share with a dummy file.
    const probe = new File([new Blob([""], { type: "image/jpeg" })], "probe.jpg", { type: "image/jpeg" });
    // @ts-ignore
    const supportsMulti = !navigator.canShare || navigator.canShare({ files: [probe, probe] });
    if (supportsMulti) {
      for (let i = 0; i < items.length; i += BATCH) {
        const slice = items.slice(i, i + BATCH);
        const files: File[] = [];
        for (const it of slice) {
          try {
            const r = await fetch(it.url);
            if (!r.ok) continue;
            const blob = await r.blob();
            files.push(new File([blob], it.name, { type: blob.type || "image/jpeg" }));
          } catch { /* skip */ }
          done++;
          onProgress?.(done, items.length);
        }
        if (files.length) {
          await navigator.share({ files, title: zipName });
        }
      }
      return { method: "share" };
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return { method: "share" };
    // fall through to sequential
  }

  // Fallback: share/download one at a time.
  done = 0;
  try {
    for (const it of items) {
      try { await downloadOne(it.url, it.name); } catch { /* skip */ }
      done++;
      onProgress?.(done, items.length);
    }
    return { method: "sequential" };
  } catch {
    await downloadManyAsZip(items, zipName, onProgress);
    return { method: "zip" };
  }
}
