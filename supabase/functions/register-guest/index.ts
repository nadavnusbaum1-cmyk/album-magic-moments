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

    // Match against already-uploaded photos
    const { data: photos } = await supabase.from("photos").select("id, storage_path");
    let matchCount = 0;
    if (photos) {
      for (const photo of photos) {
        try {
          const { data: photoData } = await supabase.storage
            .from("event-photos")
            .download(photo.storage_path);
          if (!photoData) continue;
          const buf = new Uint8Array(await photoData.arrayBuffer());
          const photoB64 = btoa(String.fromCharCode(...buf));

          const search = await rekognition("SearchFacesByImage", {
            CollectionId: COLLECTION_ID,
            Image: { Bytes: photoB64 },
            FaceMatchThreshold: 85,
            MaxFaces: 10,
          });

          const matched = (search.FaceMatches || []).some(
            (m: { Face: { ExternalImageId: string } }) => m.Face.ExternalImageId === guest.id,
          );
          if (matched) {
            await supabase
              .from("photo_matches")
              .insert({ guest_id: guest.id, photo_id: photo.id, similarity: 90 });
            matchCount++;
          }
        } catch (e) {
          console.error("photo scan error", e);
        }
      }
      if (matchCount > 0) {
        await supabase.from("guests").update({ photo_count: matchCount }).eq("id", guest.id);
      }
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
