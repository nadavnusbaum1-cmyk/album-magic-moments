// Image utilities: HEIC conversion + base64 encoding.
// HEIC support: Safari can render HEIC natively, but Chrome/Firefox cannot,
// and AWS Rekognition does NOT accept HEIC. Convert to JPEG client-side.

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

export const convertHeicIfNeeded = async (file: File): Promise<File> => {
  if (!isHeic(file)) return file;
  try {
    const mod = await loadHeic2any();
    const heic2any = (mod as { default: (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]> }).default;
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    const blob = Array.isArray(result) ? result[0] : result;
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (e) {
    console.error("HEIC convert failed", e);
    throw new Error(`Could not convert HEIC file: ${file.name}`);
  }
};

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
