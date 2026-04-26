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
    const results: { name: string; matches: number; error?: string }[] = [];

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

        // Search for matching guests
        const search = await rekognition("SearchFacesByImage", {
          CollectionId: COLLECTION_ID,
          Image: { Bytes: base64 },
          FaceMatchThreshold: 85,
          MaxFaces: 50,
        }).catch(() => ({ FaceMatches: [] }));

        const matches = search.FaceMatches || [];
        const seen = new Set<string>();
        let matchCount = 0;

        for (const m of matches) {
          const guestId = m.Face?.ExternalImageId;
          if (!guestId || seen.has(guestId)) continue;
          seen.add(guestId);
          const { error: mErr } = await supabase
            .from("photo_matches")
            .insert({ guest_id: guestId, photo_id: photoRow.id, similarity: m.Similarity });
          if (!mErr) {
            matchCount++;
            // bump count
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

        await supabase
          .from("photos")
          .update({ processed: true, face_count: matchCount })
          .eq("id", photoRow.id);

        results.push({ name: photo.name, matches: matchCount });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown";
        results.push({ name: photo.name, matches: 0, error: msg });
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
