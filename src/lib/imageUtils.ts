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

// Try to decode any image (incl. HEIC on Safari) to a JPEG via <canvas>.
async function decodeViaCanvas(file: File): Promise<File | null> {
  try {
    // createImageBitmap supports many formats incl. HEIC on Safari
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob) return null;
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
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
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (e) {
    console.warn("heic2any failed, trying canvas fallback", e);
    const viaCanvas = await decodeViaCanvas(file);
    if (viaCanvas) return viaCanvas;
    // Return the original file so it still uploads — server stores it as-is.
    // Face recognition will skip it but the photo is preserved.
    console.warn(`HEIC conversion failed for ${file.name}; uploading as-is`);
    return file;
  }
};

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
