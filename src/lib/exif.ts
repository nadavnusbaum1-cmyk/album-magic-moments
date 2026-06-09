// Extract the original capture date from an image's EXIF metadata.
// Returns an ISO timestamp string, or null if not present / not an image.
import exifr from "exifr";

export async function extractTakenAt(file: File): Promise<string | null> {
  if (!file.type?.startsWith("image/") && !/\.(jpe?g|png|heic|heif|tiff?|webp)$/i.test(file.name || "")) {
    return null;
  }
  try {
    const data = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
      translateValues: false,
    });
    const d: unknown = data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate;
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d as string);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}
