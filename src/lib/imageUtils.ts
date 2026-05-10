// Image utilities: HEIC conversion + base64 encoding.
// HEIC support: Safari can render HEIC natively, but Chrome/Firefox cannot,
// and AWS Rekognition does NOT accept HEIC. Convert to JPEG client-side.
// We try heic2any first (handles HEVC), then fall back to canvas decode for
// browsers that natively decode HEIC (Safari/iOS).

let heic2anyPromise: Promise<typeof import("heic2any")> | null = null;
const loadHeic2any = () => {
  if (!heic2anyPromise) {
    heic2anyPromise = import("heic2any");
  }
  return heic2anyPromise;
};

export const isHeic = (file: File) => {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
};

export const isVideo = (file: File) => {
  if (file.type?.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name || "");
};

const withJpgExtension = (name: string) => {
  const safe = name || `photo-${Date.now()}`;
  return /\.[a-z0-9]+$/i.test(safe)
    ? safe.replace(/\.[a-z0-9]+$/i, ".jpg")
    : `${safe}.jpg`;
};

const canvasToJpegFile = async (canvas: HTMLCanvasElement, name: string, quality = 0.86): Promise<File | null> => {
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  return blob ? new File([blob], withJpgExtension(name), { type: "image/jpeg" }) : null;
};

const drawToCanvas = (source: CanvasImageSource, width: number, height: number, maxSide = 2200) => {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
};

// Try to decode any image (incl. HEIC on Safari) to a JPEG via <canvas>.
async function decodeViaCanvas(file: File): Promise<File | null> {
  try {
    // createImageBitmap supports many formats incl. HEIC on Safari
    const bitmap = await createImageBitmap(file);
    const canvas = drawToCanvas(bitmap, bitmap.width, bitmap.height);
    bitmap.close?.();
    return canvas ? canvasToJpegFile(canvas, file.name) : null;
  } catch {
    return null;
  }
}

async function decodeViaImageElement(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = url;
    });
    const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
    return canvas ? canvasToJpegFile(canvas, file.name) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Max bytes that AWS Rekognition accepts for inline image bytes.
const REKOG_MAX_BYTES = 5 * 1024 * 1024;
// Re-encode threshold a bit below the limit to allow base64 overhead headroom.
const SHRINK_THRESHOLD = 4.5 * 1024 * 1024;

async function shrinkOnce(file: File, maxSide: number, quality: number): Promise<File | null> {
  // Try createImageBitmap first
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return null; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await canvasToJpegFile(canvas, file.name, quality);
  } catch {
    return await decodeViaImageElement(file);
  }
}

async function compressJpegIfLarge(file: File): Promise<File> {
  if (file.size <= SHRINK_THRESHOLD) return file;
  // Iterate down until under the Rekognition limit (max 3 passes).
  let current: File = file;
  const passes = [
    { maxSide: 2200, quality: 0.85 },
    { maxSide: 1800, quality: 0.8 },
    { maxSide: 1400, quality: 0.75 },
  ];
  for (const p of passes) {
    const next = await shrinkOnce(current, p.maxSide, p.quality);
    if (!next) break;
    current = next;
    if (current.size <= REKOG_MAX_BYTES) break;
  }
  return current;
}

// Use this for any image being uploaded — handles HEIC + shrinks large
// JPEG/PNG so AWS Rekognition's 5MB inline-bytes cap is never hit.
export const prepareImageForUpload = async (file: File): Promise<File> => {
  if (isVideo(file)) return file;
  if (isHeic(file)) return await convertHeicIfNeeded(file);
  return await compressJpegIfLarge(file);
};

// Last-ditch fallback: libheif-js (pure JS HEIC decoder, works in all browsers).
// Loaded lazily from CDN to keep bundle small.
async function decodeViaLibheif(file: File): Promise<File | null> {
  try {
    // @ts-ignore — dynamic CDN import
    const mod: any = await import(/* @vite-ignore */ "https://esm.sh/libheif-js@1.17.1?bundle");
    const libheif = mod.default || mod;
    const decoder = new libheif.HeifDecoder();
    const buf = new Uint8Array(await file.arrayBuffer());
    const data = decoder.decode(buf);
    if (!data?.length) return null;
    const image = data[0];
    const width = image.get_width();
    const height = image.get_height();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imageData = ctx.createImageData(width, height);
    await new Promise<void>((resolve, reject) => {
      image.display(imageData, (displayData: ImageData | null) => {
        if (!displayData) return reject(new Error("libheif display returned null"));
        ctx.putImageData(displayData, 0, 0);
        resolve();
      });
    });
    return await canvasToJpegFile(canvas, file.name);
  } catch (e) {
    console.warn("libheif fallback failed", e);
    return null;
  }
}

export const convertHeicIfNeeded = async (file: File): Promise<File> => {
  if (isVideo(file)) return file;
  if (!isHeic(file)) return file;

  // Try heic2any first (works on Chrome/Firefox/Edge for HEVC files)
  try {
    const mod = await loadHeic2any();
    const heic2any = (mod as { default: (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]> }).default;
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    const blob = Array.isArray(result) ? result[0] : result;
    return await compressJpegIfLarge(new File([blob], withJpgExtension(file.name), { type: "image/jpeg" }));
  } catch (e) {
    console.warn("heic2any failed, trying canvas fallback", e);
    const viaCanvas = await decodeViaCanvas(file);
    if (viaCanvas) return await compressJpegIfLarge(viaCanvas);
    const viaImage = await decodeViaImageElement(file);
    if (viaImage) return await compressJpegIfLarge(viaImage);
    const viaLibheif = await decodeViaLibheif(file);
    if (viaLibheif) return await compressJpegIfLarge(viaLibheif);
    throw new Error("HEIC conversion failed. Please choose a JPEG/PNG copy of this image.");
  }
};

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
