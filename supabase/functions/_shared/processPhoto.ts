// Shared per-photo face processing: download from S3 (or Supabase storage),
// run Rekognition IndexFaces + SearchFaces, write photo_matches and clusters.
import { rekognition, COLLECTION_ID } from "./rekognition.ts";

const API_URL = "https://connector-gateway.lovable.dev";

export const MATCH_THRESHOLD = 80;
export const CLUSTER_THRESHOLD = 80;

function looksProcessable(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
}

function isVideo(name: string, contentType?: string | null): boolean {
  if (contentType?.startsWith("video/")) return true;
  const lower = name.toLowerCase();
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(lower);
}

async function downloadFromS3(key: string): Promise<Uint8Array> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY")!;
  const signRes = await fetch(`${API_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=read`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": AWS_S3_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ object_path: key }),
  });
  if (!signRes.ok) throw new Error(`Sign read failed: ${await signRes.text()}`);
  const { url } = await signRes.json();
  const fileRes = await fetch(url);
  if (!fileRes.ok) throw new Error(`Download failed [${fileRes.status}]`);
  return new Uint8Array(await fileRes.arrayBuffer());
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
  s3_key: string | null;
  storage_path: string;
  storage_provider: string | null;
  content_type?: string | null;
  media_type?: string | null;
}

type FaceMatch = {
  Face?: { FaceId?: string; ExternalImageId?: string };
  Similarity?: number;
};

async function findBestCluster(supabase: Supa, matches: FaceMatch[]): Promise<string | null> {
  const ranked = matches
    .map((m) => ({ faceId: m.Face?.FaceId, similarity: Number(m.Similarity || 0) }))
    .filter((m): m is { faceId: string; similarity: number } => !!m.faceId && m.similarity >= CLUSTER_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);
  if (!ranked.length) return null;

  const faceIds = [...new Set(ranked.map((m) => m.faceId))];
  const { data: matchRows } = await supabase
    .from("cluster_photo_matches")
    .select("cluster_id, face_id")
    .in("face_id", faceIds);
  const byFace = new Map((matchRows || []).map((r: { face_id: string; cluster_id: string }) => [r.face_id, r.cluster_id]));

  for (const m of ranked) {
    const clusterId = byFace.get(m.faceId);
    if (clusterId) return clusterId;
  }

  const { data: clusters } = await supabase
    .from("face_clusters")
    .select("id, representative_face_id")
    .in("representative_face_id", faceIds);
  const byRepresentative = new Map((clusters || []).map((c: { representative_face_id: string; id: string }) => [c.representative_face_id, c.id]));

  for (const m of ranked) {
    const clusterId = byRepresentative.get(m.faceId);
    if (clusterId) return clusterId;
  }
  return null;
}

async function refreshClusterPhotoCount(supabase: Supa, clusterId: string) {
  const { count } = await supabase
    .from("cluster_photo_matches")
    .select("id", { count: "exact", head: true })
    .eq("cluster_id", clusterId);
  await supabase.from("face_clusters").update({ photo_count: count || 0 }).eq("id", clusterId);
}

export async function processPhoto(supabase: Supa, photo: ProcessablePhoto): Promise<{ matches: number; faces: number }> {
  const ref = photo.s3_key || photo.storage_path;

  // Skip videos entirely (no face recognition on video for now)
  if (photo.media_type === "video" || isVideo(ref, photo.content_type)) {
    await supabase
      .from("photos")
      .update({ processed: true, face_count: 0, media_type: "video", processing_error: null })
      .eq("id", photo.id);
    return { matches: 0, faces: 0 };
  }

  if (!looksProcessable(ref)) {
    await supabase
      .from("photos")
      .update({ processed: true, face_count: 0, processing_error: "Unsupported format (Rekognition needs JPEG/PNG)" })
      .eq("id", photo.id);
    return { matches: 0, faces: 0 };
  }

  let bytes: Uint8Array;
  if (photo.storage_provider === "s3" && photo.s3_key) {
    bytes = await downloadFromS3(photo.s3_key);
  } else {
    const { data, error } = await supabase.storage.from("event-photos").download(photo.storage_path);
    if (error) throw error;
    bytes = new Uint8Array(await data.arrayBuffer());
  }

  if (bytes.byteLength > 5 * 1024 * 1024) {
    await supabase
      .from("photos")
      .update({ processed: true, face_count: 0, processing_error: "File too large for face recognition (max 5MB)" })
      .eq("id", photo.id);
    return { matches: 0, faces: 0 };
  }

  const base64 = bytesToBase64(bytes);

  const indexResult = await rekognition("IndexFaces", {
    CollectionId: COLLECTION_ID,
    Image: { Bytes: base64 },
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
    const bbox = fr.Face?.BoundingBox || null; // {Width,Height,Left,Top} normalized 0-1

    const search = await rekognition("SearchFaces", {
      CollectionId: COLLECTION_ID,
      FaceId: faceId,
      FaceMatchThreshold: 70,
      MaxFaces: 50,
    }).catch(() => ({ FaceMatches: [] }));
    const matches = (search.FaceMatches || []) as FaceMatch[];

    for (const m of matches) {
      const ext = m.Face?.ExternalImageId;
      const similarity = Number(m.Similarity || 0);
      if (!ext || ext.startsWith("photo-") || ext.startsWith("cluster-")) continue;
      if (similarity < MATCH_THRESHOLD) continue;
      if (matchedGuests.has(ext)) continue;
      matchedGuests.add(ext);
      await supabase.from("photo_matches").insert({
        guest_id: ext,
        photo_id: photo.id,
        similarity,
      });
      const { data: g } = await supabase.from("guests").select("photo_count").eq("id", ext).single();
      if (g) await supabase.from("guests").update({ photo_count: (g.photo_count || 0) + 1 }).eq("id", ext);
    }

    let clusterId = await findBestCluster(supabase, matches);
    if (!clusterId) {
      const { data: nc } = await supabase
        .from("face_clusters")
        .insert({
          representative_face_id: faceId,
          representative_photo_id: photo.id,
          representative_storage_path: photo.storage_path,
          representative_s3_key: photo.storage_provider === "s3" ? photo.s3_key : null,
          photo_count: 0,
        })
        .select()
        .single();
      if (nc) clusterId = nc.id;
    }
    if (clusterId && !matchedClusters.has(clusterId)) {
      matchedClusters.add(clusterId);
      await supabase.from("cluster_photo_matches").upsert({
        cluster_id: clusterId,
        photo_id: photo.id,
        similarity: 100,
        bounding_box: bbox,
        face_id: faceId,
      }, { onConflict: "cluster_id,photo_id" });
      await refreshClusterPhotoCount(supabase, clusterId);
    }
  }

  await supabase
    .from("photos")
    .update({ processed: true, face_count: faceRecords.length, processing_error: null })
    .eq("id", photo.id);

  return { matches: matchedGuests.size, faces: faceRecords.length };
}
