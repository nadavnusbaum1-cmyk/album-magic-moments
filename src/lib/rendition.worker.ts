// Off-main-thread image resizing (thumbnail / medium renditions) so uploads
// don't freeze the UI — especially many photos on a phone. Uses createImageBitmap
// + OffscreenCanvas (Safari 16.4+, all modern Chrome/Firefox). The main thread
// falls back to its own canvas path when this isn't available.
self.onmessage = async (e: MessageEvent) => {
  const { id, blob, maxSide, quality } = e.data as { id: number; blob: Blob; maxSide: number; quality: number };
  try {
    const bmp = await createImageBitmap(blob);
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
