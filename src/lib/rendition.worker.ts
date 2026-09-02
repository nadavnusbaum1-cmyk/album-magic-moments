// Off-main-thread image resizing (thumbnail / medium renditions) so uploads
// don't freeze the UI — especially many photos on a phone. Uses createImageBitmap
// + OffscreenCanvas (Safari 16.4+, all modern Chrome/Firefox). The main thread
// falls back to its own canvas path when this isn't available.
async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    // Browser can't decode this directly (e.g. HEIC on Chrome/Android) — transcode
    // to JPEG with heic2any first, then decode. Runs here in the worker.
    const mod = await import("heic2any");
    const heic2any = (mod as { default: (o: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]> }).default;
    const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.92 });
    return await createImageBitmap(Array.isArray(out) ? out[0] : out);
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { id, blob, maxSide, quality } = e.data as { id: number; blob: Blob; maxSide: number; quality: number };
  try {
    const bmp = await decode(blob);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const oc = new OffscreenCanvas(w, h);
    const ctx = oc.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await oc.convertToBlob({ type: "image/jpeg", quality });
    (self as unknown as Worker).postMessage({ id, blob: out });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
