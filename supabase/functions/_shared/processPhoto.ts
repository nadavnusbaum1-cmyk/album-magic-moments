// Shared per-photo processing — event-scoped.
// Steps: download original → generate thumbnail + medium renditions (uploaded to
// S3) → run face indexing/matching on the MEDIUM rendition (guaranteed small, so
// the old 5MB-original problem disappears) → drive processing_status state.
import { rekognition, collectionFor } from "./rekognition.ts";
import { getObjectBytes } from "./s3.ts";

export const MATCH_THRESHOLD = 80;
export const CLUSTER_THRESHOLD = 80;
const REKOGNITION_MAX_BYTES = 5 * 1024 * 1024;

function looksProcessable(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
}

function isVideo(name: string, contentType?: string | null): boolean {
  if (contentType?.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(name.toLowerCase());
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface ProcessablePhoto {
  id: string;
  event_id: string;
  s3_key: string | null;
  storage_path: string;
  storage_provider: string | null;
  content_type?: string | null;
  media_type?: string | null;
}

type FaceMatch = { Face?: { FaceId?: string; ExternalImageId?: string }; Similarity?: number };

async function downloadOriginal(supabase: Supa, photo: ProcessablePhoto): Promise<Uint8Array> {
  if (photo.storage_provider === "s3" && photo.s3_key) {
    return await getObjectBytes(photo.s3_key);
  }
  const { data, error } = await supabase.storage.from("event-photos").download(photo.storage_path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

async function findBestCluster(supabase: Supa, eventId: string, matches: FaceMatch[]): Promise<string | null> {
  const ranked = matches
    .map((m) => ({ faceId: m.Face?.FaceId, similarity: Number(m.Similarity || 0) }))
    .filter((m): m is { faceId: string; similarity: number } => !!m.faceId && m.similarity >= CLUSTER_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);
  if (!ranked.length) return null;

  const faceIds = [...new Set(ranked.map((m) => m.faceId))];
  const { data: matchRows } = await supabase
    .from("cluster_photo_matches").select("cluster_id, face_id")
    .eq("event_id", eventId).in("face_id", faceIds);
  const byFace = new Map((matchRows || []).map((r: any) => [r.face_id, r.cluster_id]));
  for (const m of ranked) { const c = byFace.get(m.faceId); if (c) return c; }

  const { data: clusters } = await supabase
    .from("face_clusters").select("id, representative_face_id")
    .eq("event_id", eventId).in("representative_face_id", faceIds);
  const byRep = new Map((clusters || []).map((c: any) => [c.representative_face_id, c.id]));
  for (const m of ranked) { const c = byRep.get(m.faceId); if (c) return c; }
  return null;
}

async function refreshClusterPhotoCount(supabase: Supa, clusterId: string) {
  const { count } = await supabase
    .from("cluster_photo_matches").select("id", { count: "exact", head: true })
    .eq("cluster_id", clusterId);
  await supabase.from("face_clusters").update({ photo_count: count || 0 }).eq("id", clusterId);
}

async function recomputeGuestCount(supabase: Supa, guestId: string) {
  const { count } = await supabase
    .from("photo_matches").select("id", { count: "exact", head: true })
    .eq("guest_id", guestId);
  await supabase.from("guests").update({ photo_count: count || 0 }).eq("id", guestId);
}

export async function processPhoto(supabase: Supa, photo: ProcessablePhoto): Promise<{ matches: number; faces: number }> {
  const ref = photo.s3_key || photo.storage_path;
  const eventId = photo.event_id;
  const COLLECTION = collectionFor(eventId);
  const isS3 = photo.storage_provider === "s3" && !!photo.s3_key;

  // Video / unsupported: displayable but no face processing or derivatives.
  if (photo.media_type === "video" || isVideo(ref, photo.content_type)) {
    await supabase.from("photos").update({
      processing_status: "skipped", face_count: 0, media_type: "video", processing_error: null,
    }).eq("id", photo.id);
    return { matches: 0, faces: 0 };
  }
  if (!looksProcessable(ref)) {
    await supabase.from("photos").update({
      processing_status: "skipped", face_count: 0, processing_error: "Unsupported format (need JPEG/PNG)",
    }).eq("id", photo.id);
    return { matches: 0, faces: 0 };
  }

  const original = await downloadOriginal(supabase, photo);

  // NOTE: thumbnail/medium renditions are temporarily NOT generated here.
  // The Deno image-resize WASM libraries crash the Edge runtime, so grids fall
  // back to the full image via `thumbUrl || url`. Client-side rendition
  // generation (Canvas, no WASM) is the planned replacement.
  await supabase.from("photos").update({ file_size: original.byteLength }).eq("id", photo.id);

  // Face indexing runs on the uploaded image. The client shrinks images to fit
  // Rekognition's 5MB inline cap before upload; anything still over is skipped.
  if (original.byteLength > REKOGNITION_MAX_BYTES) {
    await supabase.from("photos").update({
      processing_status: "ready", face_count: 0,
      processing_error: "Too large for face recognition (max 5MB)", processing_attempts: 0,
    }).eq("id", photo.id);
    return { matches: 0, faces: 0 };
  }

  const indexResult = await rekognition("IndexFaces", {
    CollectionId: COLLECTION,
    Image: { Bytes: bytesToBase64(original) },
    ExternalImageId: `photo-${photo.id}`,
    DetectionAttributes: [],
    MaxFaces: 20,
    QualityFilter: "AUTO",
  });

  const faceRecords = indexResult.FaceRecords || [];
  const matchedGuests = new Set<string>();
  const matchedClusters = new Set<string>();

  for (const fr of faceRecords) {
    const faceId = fr.Face?.FaceId;
    if (!faceId) continue;
    const bbox = fr.Face?.BoundingBox || null;

    const search = await rekognition("SearchFaces", {
      CollectionId: COLLECTION, FaceId: faceId, FaceMatchThreshold: 70, MaxFaces: 50,
    }).catch(() => ({ FaceMatches: [] }));
    const matches = (search.FaceMatches || []) as FaceMatch[];

    for (const m of matches) {
      const ext = m.Face?.ExternalImageId;
      const similarity = Number(m.Similarity || 0);
      if (!ext || ext.startsWith("photo-") || ext.startsWith("cluster-")) continue;
      if (similarity < MATCH_THRESHOLD || matchedGuests.has(ext)) continue;
      const { data: g } = await supabase.from("guests").select("id, event_id").eq("id", ext).maybeSingle();
      if (!g || g.event_id !== eventId) continue;
      matchedGuests.add(ext);
      // Idempotent: unique(guest_id, photo_id) dedupes; count recomputed authoritatively.
      await supabase.from("photo_matches")
        .upsert({ guest_id: ext, photo_id: photo.id, similarity, event_id: eventId }, { onConflict: "guest_id,photo_id" });
      await recomputeGuestCount(supabase, ext);
    }

    let clusterId = await findBestCluster(supabase, eventId, matches);
    if (!clusterId) {
      const { data: nc } = await supabase.from("face_clusters").insert({
        event_id: eventId,
        representative_face_id: faceId,
        representative_photo_id: photo.id,
        representative_storage_path: photo.storage_path,
        representative_s3_key: isS3 ? photo.s3_key : null,
        photo_count: 0,
      }).select().single();
      if (nc) clusterId = nc.id;
    } else if (faceRecords.length === 1) {
      // Prefer a solo shot as the cluster cover.
      const { data: cl } = await supabase.from("face_clusters").select("representative_photo_id").eq("id", clusterId).maybeSingle();
      const repId = cl?.representative_photo_id;
      if (repId && repId !== photo.id) {
        const { data: rep } = await supabase.from("photos").select("face_count").eq("id", repId).maybeSingle();
        if (rep && (rep.face_count || 0) > 1) {
          await supabase.from("face_clusters").update({
            representative_photo_id: photo.id,
            representative_storage_path: photo.storage_path,
            representative_s3_key: isS3 ? photo.s3_key : null,
          }).eq("id", clusterId);
        }
      }
    }
    if (clusterId && !matchedClusters.has(clusterId)) {
      matchedClusters.add(clusterId);
      await supabase.from("cluster_photo_matches").upsert({
        cluster_id: clusterId, photo_id: photo.id, similarity: 100,
        bounding_box: bbox, face_id: faceId, event_id: eventId,
      }, { onConflict: "cluster_id,photo_id" });
      await refreshClusterPhotoCount(supabase, clusterId);
    }
  }

  await supabase.from("photos").update({
    processing_status: "ready", face_count: faceRecords.length,
    processing_error: null, processing_attempts: 0,
  }).eq("id", photo.id);
  return { matches: matchedGuests.size, faces: faceRecords.length };
}
