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

async function compressJpegIfLarge(file: File): Promise<File> {
  if (file.size <= 4.5 * 1024 * 1024) return file;
  const decoded = await decodeViaCanvas(file);
  return decoded || file;
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
