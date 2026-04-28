// Background processor: picks up unprocessed S3 photos, downloads them,
// runs Rekognition (face index + cluster + match guests). Designed to be called
// every minute by pg_cron — processes a small batch per call to stay within edge
// function limits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { ensureCollection, rekognition, COLLECTION_ID } from "../_shared/rekognition.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_URL = "https://connector-gateway.lovable.dev";
const MATCH_THRESHOLD = 80;
const CLUSTER_THRESHOLD = 85;
const BATCH_SIZE = 10;

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
  const buf = await fileRes.arrayBuffer();
  return new Uint8Array(buf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await ensureCollection();

    const { data: pending } = await supabase
      .from("photos")
      .select("id, s3_key, storage_path, storage_provider")
      .eq("processed", false)
      .is("processing_error", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!pending?.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    for (const photo of pending) {
      try {
        let bytes: Uint8Array;
        if (photo.storage_provider === "s3" && photo.s3_key) {
          bytes = await downloadFromS3(photo.s3_key);
        } else {
          // Supabase storage fallback
          const { data, error } = await supabase.storage
            .from("event-photos")
            .download(photo.storage_path);
          if (error) throw error;
          bytes = new Uint8Array(await data.arrayBuffer());
        }
        const base64 = bytesToBase64(bytes);

        const indexResult = await rekognition("IndexFaces", {
          CollectionId: COLLECTION_ID,
          Image: { Bytes: base64 },
          ExternalImageId: `photo-${photo.id}`,
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

          // Match guests
          for (const m of matches) {
            const ext = m.Face?.ExternalImageId;
            if (!ext || ext.startsWith("photo-") || ext.startsWith("cluster-")) continue;
            if (m.Similarity < MATCH_THRESHOLD) continue;
            if (matchedGuests.has(ext)) continue;
            matchedGuests.add(ext);
            await supabase.from("photo_matches").insert({
              guest_id: ext,
              photo_id: photo.id,
              similarity: m.Similarity,
            });
            const { data: g } = await supabase.from("guests").select("photo_count").eq("id", ext).single();
            if (g) await supabase.from("guests").update({ photo_count: (g.photo_count || 0) + 1 }).eq("id", ext);
          }

          // Cluster
          let clusterId: string | null = null;
          let best: { id: string; sim: number } | null = null;
          for (const m of matches) {
            if (!m.Face?.FaceId || m.Similarity < CLUSTER_THRESHOLD) continue;
            const { data: existing } = await supabase
              .from("face_clusters")
              .select("id")
              .eq("representative_face_id", m.Face.FaceId)
              .maybeSingle();
            if (existing && (!best || m.Similarity > best.sim)) {
              best = { id: existing.id, sim: m.Similarity };
            }
          }
          if (best) {
            clusterId = best.id;
          } else {
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
            await supabase.from("cluster_photo_matches").insert({
              cluster_id: clusterId,
              photo_id: photo.id,
              similarity: 100,
            });
            const { data: c } = await supabase.from("face_clusters").select("photo_count").eq("id", clusterId).single();
            if (c) await supabase.from("face_clusters").update({ photo_count: (c.photo_count || 0) + 1 }).eq("id", clusterId);
          }
        }

        await supabase
          .from("photos")
          .update({ processed: true, face_count: faceRecords.length })
          .eq("id", photo.id);
        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown";
        console.error(`Photo ${photo.id} failed:`, msg);
        await supabase.from("photos").update({ processing_error: msg }).eq("id", photo.id);
      }
    }

    return new Response(JSON.stringify({ processed, batch: pending.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
