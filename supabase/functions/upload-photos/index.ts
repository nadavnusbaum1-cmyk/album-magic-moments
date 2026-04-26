import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { ensureCollection, rekognition, COLLECTION_ID } from "../_shared/rekognition.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { photos } = await req.json() as { photos: { name: string; base64: string }[] };
    if (!photos?.length) {
      return new Response(JSON.stringify({ error: "no photos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await ensureCollection();
    const results: { name: string; matches: number; faces: number; error?: string }[] = [];

    for (const photo of photos) {
      try {
        const base64 = photo.base64.replace(/^data:image\/\w+;base64,/, "");
        const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const id = crypto.randomUUID();
        const path = `${id}.jpg`;

        const { error: upErr } = await supabase.storage
          .from("event-photos")
          .upload(path, binary, { contentType: "image/jpeg" });
        if (upErr) throw upErr;

        const { data: photoRow, error: insErr } = await supabase
          .from("photos")
          .insert({ storage_path: path, source: "photographer", processed: false })
          .select()
          .single();
        if (insErr) throw insErr;

        // Index ALL faces in the photo (with a temporary ExternalImageId so we can clean them up)
        // Then SearchFaces by FaceId to find matching guests for each face.
        const tempExternalId = `photo-${photoRow.id}`;
        const indexResult = await rekognition("IndexFaces", {
          CollectionId: COLLECTION_ID,
          Image: { Bytes: base64 },
          ExternalImageId: tempExternalId,
          DetectionAttributes: [],
          MaxFaces: 20,
          QualityFilter: "AUTO",
        }).catch((e) => {
          console.error("IndexFaces failed", e);
          return { FaceRecords: [] };
        });

        const faceRecords = indexResult.FaceRecords || [];
        const tempFaceIds: string[] = [];
        const matchedGuests = new Set<string>();

        for (const fr of faceRecords) {
          const faceId = fr.Face?.FaceId;
          if (!faceId) continue;
          tempFaceIds.push(faceId);

          const search = await rekognition("SearchFaces", {
            CollectionId: COLLECTION_ID,
            FaceId: faceId,
            FaceMatchThreshold: 80,
            MaxFaces: 10,
          }).catch(() => ({ FaceMatches: [] }));

          for (const m of search.FaceMatches || []) {
            const guestId = m.Face?.ExternalImageId;
            // Skip other temp photo faces — only real guest UUIDs (no "photo-" prefix)
            if (!guestId || guestId.startsWith("photo-")) continue;
            if (matchedGuests.has(guestId)) continue;
            matchedGuests.add(guestId);

            const { error: mErr } = await supabase
              .from("photo_matches")
              .insert({ guest_id: guestId, photo_id: photoRow.id, similarity: m.Similarity });
            if (!mErr) {
              const { data: g } = await supabase
                .from("guests")
                .select("photo_count")
                .eq("id", guestId)
                .single();
              if (g) {
                await supabase
                  .from("guests")
                  .update({ photo_count: (g.photo_count || 0) + 1 })
                  .eq("id", guestId);
              }
            }
          }
        }

        // Note: we keep indexed photo faces in the collection so future guest
        // registrations can retroactively match against them via SearchFaces.

        await supabase
          .from("photos")
          .update({ processed: true, face_count: faceRecords.length })
          .eq("id", photoRow.id);

        results.push({ name: photo.name, matches: matchedGuests.size, faces: faceRecords.length });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown";
        console.error("photo error", msg);
        results.push({ name: photo.name, matches: 0, faces: 0, error: msg });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
