// Serve photos via direct-AWS presigned GET (replaces the connector gateway).
// Exposes thumbnail / medium / full renditions so galleries never load originals.
import { presignGet } from "./s3.ts";

/** Back-compat: existing callers expect a single signed read URL for a key. */
export function signS3Read(key: string, expiresIn = 3600): Promise<string> {
  return presignGet(key, expiresIn);
}

export function supabasePublicUrl(path: string): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/storage/v1/object/public/event-photos/${path}`;
}

export interface PhotoStorageRow {
  storage_provider?: string | null;
  s3_key?: string | null;
  s3_key_thumbnail?: string | null;
  s3_key_medium?: string | null;
  storage_path: string;
}

export interface PhotoAssets {
  thumb: string;   // small grid rendition
  medium: string;  // viewer rendition
  full: string;    // original
}

/** Single original URL (kept for callers that only need one size). */
export async function resolvePhotoUrl(photo: PhotoStorageRow, expiresIn = 3600): Promise<string> {
  if (photo.storage_provider === "s3" && photo.s3_key) {
    return await signS3Read(photo.s3_key, expiresIn);
  }
  return supabasePublicUrl(photo.storage_path);
}

/** Thumb/medium/full signed URLs, falling back to the original when a
 *  derivative doesn't exist yet (e.g. not-yet-processed or legacy rows). */
export async function resolvePhotoAssets(photo: PhotoStorageRow, expiresIn = 3600): Promise<PhotoAssets> {
  if (photo.storage_provider === "s3" && photo.s3_key) {
    const [thumb, medium, full] = await Promise.all([
      signS3Read(photo.s3_key_thumbnail || photo.s3_key, expiresIn),
      signS3Read(photo.s3_key_medium || photo.s3_key, expiresIn),
      signS3Read(photo.s3_key, expiresIn),
    ]);
    return { thumb, medium, full };
  }
  const url = supabasePublicUrl(photo.storage_path);
  return { thumb: url, medium: url, full: url };
}

// Concurrency-limited mapper to avoid bursts when signing many URLs.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
