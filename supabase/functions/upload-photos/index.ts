import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { ensureCollection, rekognition, COLLECTION_ID } from "../_shared/rekognition.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MATCH_THRESHOLD = 80; // guest match
const CLUSTER_THRESHOLD = 85; // group same person

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
          .insert({ storage_path: path, source: "upload", processed: false })
          .select()
          .single();
        if (insErr) throw insErr;

        const indexResult = await rekognition("IndexFaces", {
          CollectionId: COLLECTION_ID,
          Image: { Bytes: base64 },
          ExternalImageId: `photo-${photoRow.id}`,
          DetectionAttributes: [],
          MaxFaces: 20,
          QualityFilter: "AUTO",
        }).catch((e) => {
          console.error("IndexFaces failed", e);
          return { FaceRecords: [] };
        });

        const faceRecords = indexResult.FaceRecords || [];
        const matchedGuests = new Set<string>();
        const matchedClusters = new Set<string>();

        for (const fr of faceRecords) {
          const faceId = fr.Face?.FaceId;
          if (!faceId) continue;

          const search = await rekognition("SearchFaces", {
            CollectionId: COLLECTION_ID,
            FaceId: faceId,
            FaceMatchThreshold: 75,
            MaxFaces: 50,
          }).catch(() => ({ FaceMatches: [] }));

          const matches = search.FaceMatches || [];

          // 1) Match registered guests
          for (const m of matches) {
            const ext = m.Face?.ExternalImageId;
            if (!ext || ext.startsWith("photo-") || ext.startsWith("cluster-")) continue;
            if (m.Similarity < MATCH_THRESHOLD) continue;
            if (matchedGuests.has(ext)) continue;
            matchedGuests.add(ext);

            const { error: mErr } = await supabase
              .from("photo_matches")
              .insert({ guest_id: ext, photo_id: photoRow.id, similarity: m.Similarity });
            if (!mErr) {
              const { data: g } = await supabase
                .from("guests")
                .select("photo_count")
                .eq("id", ext)
                .single();
              if (g) {
                await supabase
                  .from("guests")
                  .update({ photo_count: (g.photo_count || 0) + 1 })
                  .eq("id", ext);
              }
            }
          }

          // 2) Auto-cluster: find best existing cluster face match, else create new cluster
          let clusterId: string | null = null;
          let bestClusterMatch: { ext: string; sim: number } | null = null;
          for (const m of matches) {
            const matchedFaceId = m.Face?.FaceId;
            if (!matchedFaceId) continue;
            if (m.Similarity < CLUSTER_THRESHOLD) continue;
            const { data: existing } = await supabase
              .from("face_clusters")
              .select("id")
              .eq("representative_face_id", matchedFaceId)
              .maybeSingle();
            if (existing) {
              if (!bestClusterMatch || m.Similarity > bestClusterMatch.sim) {
                bestClusterMatch = { ext: existing.id, sim: m.Similarity };
              }
            }
          }

          if (bestClusterMatch) {
            clusterId = bestClusterMatch.ext;
          } else {
            // New cluster — use this face as representative
            const { data: newCluster } = await supabase
              .from("face_clusters")
              .insert({
                representative_face_id: faceId,
                representative_photo_id: photoRow.id,
                representative_storage_path: path,
                photo_count: 0,
              })
              .select()
              .single();
            if (newCluster) clusterId = newCluster.id;
          }

          if (clusterId && !matchedClusters.has(clusterId)) {
            matchedClusters.add(clusterId);
            const { error: cmErr } = await supabase
              .from("cluster_photo_matches")
              .insert({ cluster_id: clusterId, photo_id: photoRow.id, similarity: 100 });
            if (!cmErr) {
              const { data: c } = await supabase
                .from("face_clusters")
                .select("photo_count")
                .eq("id", clusterId)
                .single();
              if (c) {
                await supabase
                  .from("face_clusters")
                  .update({ photo_count: (c.photo_count || 0) + 1 })
                  .eq("id", clusterId);
              }
            }
          }
        }

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
