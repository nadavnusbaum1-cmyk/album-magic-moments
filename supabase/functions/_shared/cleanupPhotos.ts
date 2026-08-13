// Shared hard-delete for photos: removes S3 objects (original + thumbnail +
// medium), Rekognition faces, match rows, and finally the photo row — but only
// for photos whose storage objects were actually deleted. A photo whose S3
// delete failed is LEFT marked `deleting` so a retry pass can finish it, which
// guarantees we never drop the DB row while the object still exists (no orphans).
import { deleteObjects } from "./s3.ts";
import { collectionFor, deleteFaces } from "./rekognition.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface CleanupPhoto {
  id: string;
  event_id: string | null;
  storage_provider: string | null;
  storage_path: string;
  s3_key: string | null;
  s3_key_thumbnail?: string | null;
  s3_key_medium?: string | null;
}

export interface CleanupResult {
  hardDeleted: number;
  kept: number;          // objects still present (S3 delete failed) — retried later
  facesDeleted: number;
  removedGuests: number;
  removedClusters: number;
}

export async function hardDeletePhotos(supabase: Supa, photos: CleanupPhoto[]): Promise<CleanupResult> {
  const result: CleanupResult = { hardDeleted: 0, kept: 0, facesDeleted: 0, removedGuests: 0, removedClusters: 0 };
  if (!photos.length) return result;

  const ids = photos.map((p) => p.id);

  // 1) Delete Rekognition faces for these photos (per event collection).
  const byEvent = new Map<string, string[]>(); // eventId -> face ids
  const { data: faceRows } = await supabase
    .from("cluster_photo_matches").select("photo_id, face_id, event_id").in("photo_id", ids);
  for (const r of faceRows || []) {
    if (!r.event_id || !r.face_id) continue;
    (byEvent.get(r.event_id) ?? byEvent.set(r.event_id, []).get(r.event_id)!).push(r.face_id);
  }
  for (const [eventId, faceIds] of byEvent) {
    try { result.facesDeleted += await deleteFaces(collectionFor(eventId), faceIds); }
    catch (e) { console.error(`DeleteFaces failed for event ${eventId}:`, e instanceof Error ? e.message : e); }
  }

  // 2) Delete storage objects; track which photos are fully cleared.
  const keysByPhoto = new Map<string, string[]>();
  const s3Keys: string[] = [];
  const supabasePaths: string[] = [];
  for (const p of photos) {
    if (p.storage_provider === "s3") {
      const keys = [p.s3_key, p.s3_key_thumbnail, p.s3_key_medium].filter(Boolean) as string[];
      keysByPhoto.set(p.id, keys);
      s3Keys.push(...keys);
    } else {
      keysByPhoto.set(p.id, []);
      if (p.storage_path) supabasePaths.push(p.storage_path);
    }
  }

  const failedKeys = new Set<string>();
  if (s3Keys.length) {
    const r = await deleteObjects(s3Keys);
    for (const f of r.failed) failedKeys.add(f.key);
    if (r.failed.length) console.error("S3 delete failures:", JSON.stringify(r.failed.slice(0, 5)));
  }
  if (supabasePaths.length) {
    await supabase.storage.from("event-photos").remove(supabasePaths).catch(() => {});
  }

  const cleanIds = photos.filter((p) => !(keysByPhoto.get(p.id) || []).some((k) => failedKeys.has(k))).map((p) => p.id);
  const keptIds = ids.filter((id) => !cleanIds.includes(id));
  result.kept = keptIds.length;
  if (!cleanIds.length) return result;

  // 3) Remove DB rows + derived state for fully-cleared photos.
  const { data: gm } = await supabase.from("photo_matches").select("guest_id").in("photo_id", cleanIds);
  const affectedGuests = [...new Set((gm || []).map((m: any) => m.guest_id))];
  const { data: cm } = await supabase.from("cluster_photo_matches").select("cluster_id").in("photo_id", cleanIds);
  const affectedClusters = [...new Set((cm || []).map((m: any) => m.cluster_id))];
  const { data: stale } = await supabase.from("face_clusters").select("id").in("representative_photo_id", cleanIds);
  const staleSet = new Set((stale || []).map((c: any) => c.id));

  await supabase.from("photo_matches").delete().in("photo_id", cleanIds);
  await supabase.from("cluster_photo_matches").delete().in("photo_id", cleanIds);
  await supabase.from("photos").delete().in("id", cleanIds);
  result.hardDeleted = cleanIds.length;

  for (const gid of affectedGuests) {
    const { count } = await supabase.from("photo_matches").select("*", { count: "exact", head: true }).eq("guest_id", gid);
    if (!count) { await supabase.from("guests").delete().eq("id", gid); result.removedGuests++; }
    else await supabase.from("guests").update({ photo_count: count }).eq("id", gid);
  }
  for (const cid of affectedClusters) {
    const { count } = await supabase.from("cluster_photo_matches").select("*", { count: "exact", head: true }).eq("cluster_id", cid);
    if (!count) { await supabase.from("face_clusters").delete().eq("id", cid); result.removedClusters++; }
    else {
      const update: Record<string, unknown> = { photo_count: count };
      if (staleSet.has(cid)) {
        const { data: rep } = await supabase.from("cluster_photo_matches")
          .select("photo_id, photos(storage_path, storage_provider, s3_key)")
          .eq("cluster_id", cid).limit(1).maybeSingle();
        const ph = rep?.photos ? (Array.isArray(rep.photos) ? rep.photos[0] : rep.photos) : null;
        if (ph && rep?.photo_id) {
          update.representative_photo_id = rep.photo_id;
          update.representative_storage_path = ph.storage_path;
          update.representative_s3_key = ph.storage_provider === "s3" ? ph.s3_key : null;
        }
      }
      await supabase.from("face_clusters").update(update).eq("id", cid);
    }
  }
  return result;
}
