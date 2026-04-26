import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { ensureCollection, rekognition, COLLECTION_ID } from "../_shared/rekognition.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Decode base64 -> bytes for storage upload
    const base64 = selfieBase64.replace(/^data:image\/\w+;base64,/, "");
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    // Insert guest row to get id
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

    // Index face in Rekognition collection
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

    await supabase
      .from("guests")
      .update({
        selfie_path: path,
        rekognition_face_id: faceRecord.Face.FaceId,
      })
      .eq("id", guest.id);

    // Retroactive match: search the collection by the new guest's face id.
    // This finds any previously-uploaded event-photo faces that match this guest.
    let matchCount = 0;
    const guestFaceId = faceRecord.Face.FaceId;
    const search = await rekognition("SearchFaces", {
      CollectionId: COLLECTION_ID,
      FaceId: guestFaceId,
      FaceMatchThreshold: 80,
      MaxFaces: 500,
    }).catch(() => ({ FaceMatches: [] }));

    const matchedPhotoIds = new Set<string>();
    for (const m of search.FaceMatches || []) {
      const ext = m.Face?.ExternalImageId as string | undefined;
      if (!ext || !ext.startsWith("photo-")) continue;
      const photoId = ext.slice("photo-".length);
      if (matchedPhotoIds.has(photoId)) continue;
      matchedPhotoIds.add(photoId);
      const { error: mErr } = await supabase
        .from("photo_matches")
        .insert({ guest_id: guest.id, photo_id: photoId, similarity: m.Similarity });
      if (!mErr) matchCount++;
    }
    if (matchCount > 0) {
      await supabase.from("guests").update({ photo_count: matchCount }).eq("id", guest.id);
    }

    return new Response(
      JSON.stringify({ token: guest.magic_token, photoCount: matchCount }),
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
