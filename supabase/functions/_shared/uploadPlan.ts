// Shared upload planning for host + guest sign endpoints (removes duplication).
// Assigns an immutable server-side object key per file and validates type/size.

export const ALLOWED_TYPE =
  /^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|quicktime|webm|x-m4v|x-matroska))$/i;
const HEIC_RE = /\.(heic|heif)$/i;

// Size caps enforced at sign-time when the client reports a size, and again
// server-side at confirm-time via S3 HEAD (a malicious client can lie at sign
// time but cannot fake the real object size).
export const MAX_IMAGE_BYTES = 60 * 1024 * 1024;   // 60 MB
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;  // 500 MB

export interface FileInput {
  name: string;
  contentType: string;
  takenAt?: string | null;
  size?: number | null;
  clientUploadId?: string | null;
}

export interface PlanItem {
  idx: number;
  id: string;
  key: string;
  contentType: string;
  mediaType: "image" | "video";
  takenAt: string | null;
  clientUploadId: string | null;
  fileSize: number | null;
}

export type Planned = PlanItem | { idx: number; skipped: true; reason: string };

function coerceContentType(lower: string, raw: string): string | null {
  if (raw && ALLOWED_TYPE.test(raw)) return raw.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  return null; // unknown/unsupported — reject rather than silently coerce
}

export function planUploads(eventId: string, files: FileInput[]): Planned[] {
  return files.map((f, idx): Planned => {
    const lower = (f.name || "").toLowerCase();
    if (HEIC_RE.test(lower) || /^image\/(heic|heif)/i.test(f.contentType || "")) {
      return { idx, skipped: true, reason: "HEIC must be converted client-side" };
    }
    const contentType = coerceContentType(lower, f.contentType || "");
    if (!contentType) return { idx, skipped: true, reason: "Unsupported file type" };

    const mediaType = contentType.startsWith("video/") ? "video" : "image";
    const size = typeof f.size === "number" && Number.isFinite(f.size) ? f.size : null;
    const cap = mediaType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (size !== null && size > cap) {
      return { idx, skipped: true, reason: `File too large (max ${Math.round(cap / 1024 / 1024)}MB)` };
    }

    const id = crypto.randomUUID();
    const ext = (lower.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
    const key = `event-photos/${eventId}/${id}.${ext}`;
    const takenAt = typeof f.takenAt === "string" && !isNaN(Date.parse(f.takenAt))
      ? new Date(f.takenAt).toISOString()
      : null;
    const clientUploadId = typeof f.clientUploadId === "string" && f.clientUploadId.trim()
      ? f.clientUploadId.trim().slice(0, 128)
      : null;
    return { idx, id, key, contentType, mediaType, takenAt, clientUploadId, fileSize: size };
  });
}

export function isPlanItem(p: Planned): p is PlanItem {
  return !("skipped" in p);
}
