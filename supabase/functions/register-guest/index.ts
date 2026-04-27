import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { ensureCollection, rekognition, COLLECTION_ID } from "../_shared/rekognition.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MATCH_THRESHOLD = 75;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, selfieBase64 } = await req.json();
    if (!name || !selfieBase64) {
      return new Response(JSON.stringify({ error: "name and selfieBase64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await ensureCollection();

    const base64 = selfieBase64.replace(/^data:image\/\w+;base64,/, "");
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const { data: guest, error: insertErr } = await supabase
      .from("guests")
      .insert({ name })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const path = `${guest.id}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("selfies")
      .upload(path, binary, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;

    const indexResult = await rekognition("IndexFaces", {
      CollectionId: COLLECTION_ID,
      Image: { Bytes: base64 },
      ExternalImageId: guest.id,
      DetectionAttributes: [],
      MaxFaces: 1,
      QualityFilter: "AUTO",
    });

    const faceRecord = indexResult.FaceRecords?.[0];
    if (!faceRecord) {
      await supabase.from("guests").delete().eq("id", guest.id);
      return new Response(
        JSON.stringify({ error: "No face detected in selfie. Try another photo." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const guestFaceId = faceRecord.Face.FaceId;

    // Search collection by guest face id
    const search = await rekognition("SearchFaces", {
      CollectionId: COLLECTION_ID,
      FaceId: guestFaceId,
      FaceMatchThreshold: MATCH_THRESHOLD,
      MaxFaces: 500,
    }).catch(() => ({ FaceMatches: [] }));

    const matchedPhotoIds = new Set<string>();
    let bestClusterId: string | null = null;
    let bestClusterSim = 0;

    for (const m of search.FaceMatches || []) {
      const ext = m.Face?.ExternalImageId as string | undefined;
      if (!ext) continue;
      if (ext.startsWith("photo-")) {
        const photoId = ext.slice("photo-".length);
        if (!matchedPhotoIds.has(photoId)) {
          matchedPhotoIds.add(photoId);
          await supabase
            .from("photo_matches")
            .insert({ guest_id: guest.id, photo_id: photoId, similarity: m.Similarity });
        }
      }
      // Find cluster this face belongs to
      const { data: cluster } = await supabase
        .from("face_clusters")
        .select("id")
        .eq("representative_face_id", m.Face!.FaceId!)
        .maybeSingle();
      if (cluster && m.Similarity > bestClusterSim) {
        bestClusterSim = m.Similarity;
        bestClusterId = cluster.id;
      }
    }

    // If no cluster found, create one for this guest
    if (!bestClusterId) {
      const { data: newCluster } = await supabase
        .from("face_clusters")
        .insert({
          representative_face_id: guestFaceId,
          representative_storage_path: null,
          photo_count: 0,
        })
        .select()
        .single();
      if (newCluster) bestClusterId = newCluster.id;
    }

    await supabase
      .from("guests")
      .update({
        selfie_path: path,
        rekognition_face_id: guestFaceId,
        photo_count: matchedPhotoIds.size,
        cluster_id: bestClusterId,
      })
      .eq("id", guest.id);

    return new Response(
      JSON.stringify({ token: guest.magic_token, photoCount: matchedPhotoIds.size }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
