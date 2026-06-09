// Public: register a guest for an event by selfie. Returns magic_token.
import { corsHeaders, eventBySlug, json, svc } from "../_shared/auth.ts";
import { ensureCollection, collectionFor, rekognition } from "../_shared/rekognition.ts";

const MATCH_THRESHOLD = 75;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { name, selfieBase64, eventSlug } = await req.json();
    if (!name || !selfieBase64 || !eventSlug) {
      return json({ error: "name, selfieBase64, eventSlug required" }, 400);
    }
    const event = await eventBySlug(eventSlug);
    if (!event || !event.is_published) return json({ error: "Event not found" }, 404);

    const supabase = svc();
    const COLLECTION = collectionFor(event.id);
    await ensureCollection(COLLECTION);

    const base64 = selfieBase64.replace(/^data:image\/\w+;base64,/, "");
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const { data: guest, error: insertErr } = await supabase
      .from("guests")
      .insert({ name, event_id: event.id })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const path = `${event.id}/${guest.id}.jpg`;
    await supabase.storage.from("selfies").upload(path, binary, { contentType: "image/jpeg", upsert: true });

    const indexResult = await rekognition("IndexFaces", {
      CollectionId: COLLECTION,
      Image: { Bytes: base64 },
      ExternalImageId: guest.id,
      DetectionAttributes: [],
      MaxFaces: 1,
      QualityFilter: "AUTO",
    });

    const faceRecord = indexResult.FaceRecords?.[0];
    if (!faceRecord) {
      await supabase.from("guests").delete().eq("id", guest.id);
      return json({ error: "No face detected. Try another photo." }, 400);
    }
    const guestFaceId = faceRecord.Face.FaceId;

    // Aggregate matches from BOTH SearchFacesByImage (more reliable on large collections)
    // AND SearchFaces by FaceId (gets results even when the input image quality is borderline).
    // QualityFilter:NONE prevents AWS from silently dropping a borderline-quality selfie and returning 0.
    const allMatches: any[] = [];
    const searchByImage = await rekognition("SearchFacesByImage", {
      CollectionId: COLLECTION,
      Image: { Bytes: base64 },
      FaceMatchThreshold: MATCH_THRESHOLD,
      MaxFaces: 4096,
      QualityFilter: "NONE",
    }).catch((e) => { console.error("SearchFacesByImage failed:", e); return { FaceMatches: [] }; });
    allMatches.push(...(searchByImage.FaceMatches || []));

    // Wait briefly for indexing eventual-consistency, then also search by the FaceId we just got.
    await new Promise((r) => setTimeout(r, 500));
    const searchById = await rekognition("SearchFaces", {
      CollectionId: COLLECTION,
      FaceId: guestFaceId,
      FaceMatchThreshold: MATCH_THRESHOLD,
      MaxFaces: 4096,
    }).catch((e) => { console.error("SearchFaces failed:", e); return { FaceMatches: [] }; });
    allMatches.push(...(searchById.FaceMatches || []));

    console.log(`register-guest: byImage=${(searchByImage.FaceMatches || []).length} byId=${(searchById.FaceMatches || []).length}`);

    // Collect candidate photo IDs and cluster face IDs in one pass (dedup by best similarity)
    const candidatePhotoIds = new Map<string, number>(); // photoId -> best similarity
    const clusterFaceCandidates: { faceId: string; sim: number }[] = [];
    const seenFaceIds = new Set<string>();
    for (const m of allMatches) {
      const ext = m.Face?.ExternalImageId as string | undefined;
      const sim = m.Similarity || 0;
      const fid = m.Face?.FaceId;
      if (fid) { if (seenFaceIds.has(fid)) continue; seenFaceIds.add(fid); }
      if (ext && ext.startsWith("photo-")) {
        const pid = ext.slice("photo-".length);
        const prev = candidatePhotoIds.get(pid) ?? 0;
        if (sim > prev) candidatePhotoIds.set(pid, sim);
      }
      if (m.Face?.FaceId) clusterFaceCandidates.push({ faceId: m.Face.FaceId, sim });
    }

    // Bulk-verify photos belong to this event in one query
    const matchedPhotoIds = new Set<string>();
    const matchInserts: { guest_id: string; photo_id: string; similarity: number; event_id: string }[] = [];
    if (candidatePhotoIds.size > 0) {
      const ids = Array.from(candidatePhotoIds.keys());
      const { data: rows } = await supabase
        .from("photos").select("id").eq("event_id", event.id).in("id", ids);
      for (const r of rows || []) {
        matchedPhotoIds.add(r.id);
        matchInserts.push({ guest_id: guest.id, photo_id: r.id, similarity: candidatePhotoIds.get(r.id)!, event_id: event.id });
      }
      if (matchInserts.length) {
        await supabase.from("photo_matches").insert(matchInserts);
      }
    }

    // Bulk-find best cluster matching any of the candidate face IDs
    let bestClusterId: string | null = null;
    let bestSim = 0;
    if (clusterFaceCandidates.length > 0) {
      const faceIds = Array.from(new Set(clusterFaceCandidates.map((c) => c.faceId)));
      const { data: clusters } = await supabase
        .from("face_clusters").select("id, representative_face_id")
        .eq("event_id", event.id).in("representative_face_id", faceIds);
      const byFace = new Map((clusters || []).map((c) => [c.representative_face_id, c.id]));
      for (const c of clusterFaceCandidates) {
        const cid = byFace.get(c.faceId);
        if (cid && c.sim > bestSim) { bestSim = c.sim; bestClusterId = cid; }
      }
    }

    if (!bestClusterId) {
      const { data: newCluster } = await supabase.from("face_clusters").insert({
        event_id: event.id,
        representative_face_id: guestFaceId,
        photo_count: 0,
      }).select().single();
      if (newCluster) bestClusterId = newCluster.id;
    }

    await supabase.from("guests").update({
      selfie_path: path,
      rekognition_face_id: guestFaceId,
      photo_count: matchedPhotoIds.size,
      cluster_id: bestClusterId,
    }).eq("id", guest.id);

    return json({ token: guest.magic_token, photoCount: matchedPhotoIds.size, eventSlug: event.slug });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
