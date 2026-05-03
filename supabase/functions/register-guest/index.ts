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

    const search = await rekognition("SearchFaces", {
      CollectionId: COLLECTION,
      FaceId: guestFaceId,
      FaceMatchThreshold: MATCH_THRESHOLD,
      MaxFaces: 500,
    }).catch(() => ({ FaceMatches: [] }));

    const matchedPhotoIds = new Set<string>();
    let bestClusterId: string | null = null;
    let bestSim = 0;

    for (const m of search.FaceMatches || []) {
      const ext = m.Face?.ExternalImageId as string | undefined;
      if (!ext) continue;
      if (ext.startsWith("photo-")) {
        const pid = ext.slice("photo-".length);
        if (!matchedPhotoIds.has(pid)) {
          // Verify photo belongs to this event
          const { data: pr } = await supabase.from("photos").select("event_id").eq("id", pid).maybeSingle();
          if (pr?.event_id === event.id) {
            matchedPhotoIds.add(pid);
            await supabase.from("photo_matches").insert({ guest_id: guest.id, photo_id: pid, similarity: m.Similarity, event_id: event.id });
          }
        }
      }
      const { data: cluster } = await supabase
        .from("face_clusters").select("id, event_id")
        .eq("representative_face_id", m.Face!.FaceId!).maybeSingle();
      if (cluster && cluster.event_id === event.id && (m.Similarity || 0) > bestSim) {
        bestSim = m.Similarity || 0;
        bestClusterId = cluster.id;
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
