// Host-only: reset & reprocess all photos in an event.
// Clears clusters + matches, marks photos unprocessed, then fans out background processing.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { ensureCollection, collectionFor, rekognition } from "../_shared/rekognition.ts";
import { processPhoto } from "../_shared/processPhoto.ts";

const CONCURRENCY = 6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, mode } = await req.json() as { eventId?: string; mode?: "all" | "pending" };
    if (!eventId) return json({ error: "eventId required" }, 400);
    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const supabase = svc();
    const reset = (mode || "all") === "all";

    if (reset) {
      // Wipe per-event matches & clusters and reset Rekognition collection.
      await supabase.from("cluster_photo_matches").delete().eq("event_id", eventId);
      await supabase.from("photo_matches").delete().eq("event_id", eventId);
      await supabase.from("face_clusters").delete().eq("event_id", eventId);
      await supabase.from("guests").update({ photo_count: 0 }).eq("event_id", eventId);
      await supabase.from("photos").update({ processed: false, processing_status: "queued", face_count: 0, processing_error: null }).eq("event_id", eventId);

      const collection = collectionFor(eventId);
      try { await rekognition("DeleteCollection", { CollectionId: collection }); } catch { /* ignore */ }

      // Re-register guests so face matching can find them
      await ensureCollection(collection);
      const { data: guests } = await supabase.from("guests").select("id, selfie_path").eq("event_id", eventId);
      for (const g of guests || []) {
        if (!g.selfie_path) continue;
        try {
          const { data: blob } = await supabase.storage.from("selfies").download(g.selfie_path);
          if (!blob) continue;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let bin = ""; const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
          const base64 = btoa(bin);
          const r = await rekognition("IndexFaces", {
            CollectionId: collection,
            Image: { Bytes: base64 },
            ExternalImageId: g.id,
            DetectionAttributes: [],
            MaxFaces: 1,
            QualityFilter: "AUTO",
          });
          const fid = r.FaceRecords?.[0]?.Face?.FaceId;
          if (fid) await supabase.from("guests").update({ rekognition_face_id: fid }).eq("id", g.id);
        } catch (e) { console.error("re-index guest", g.id, e); }
      }
    } else {
      await ensureCollection(collectionFor(eventId));
    }

    // Fetch photos to (re)process — image only.
    const { data: photos } = await supabase
      .from("photos")
      .select("id, event_id, s3_key, s3_key_medium, storage_path, storage_provider, content_type, media_type")
      .eq("event_id", eventId)
      .eq("upload_status", "uploaded")
      .eq("processed", false)
      .neq("media_type", "video")
      .order("created_at", { ascending: true })
      .limit(2000);

    const list = photos || [];
    let processed = 0, failed = 0;
    let i = 0;
    async function worker() {
      while (i < list.length) {
        const p = list[i++];
        try { await processPhoto(supabase, p); processed++; }
        catch (e) {
          failed++;
          await supabase.from("photos").update({ processing_error: e instanceof Error ? e.message : "err" }).eq("id", p.id);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

    return json({ ok: true, processed, failed, total: list.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
