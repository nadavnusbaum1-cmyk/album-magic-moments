// Host-only: delete an entire event and all its storage/Rekognition state.
// Unpublishes immediately, then hard-deletes photos in time-budgeted batches
// (S3 objects preserved until removed, so no orphans), drops the Rekognition
// collection, removes guest selfies, and finally deletes the event row (DB
// cascade clears guests/clusters/matches). Re-entrant: call again if not done.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { collectionFor, deleteCollection } from "../_shared/rekognition.ts";
import { deleteObjects } from "../_shared/s3.ts";
import { hardDeletePhotos, type CleanupPhoto } from "../_shared/cleanupPhotos.ts";

const TIME_BUDGET_MS = 45_000;
const BATCH = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId } = await req.json() as { eventId?: string };
    if (!eventId) return json({ error: "eventId required" }, 400);

    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const supabase = svc();
    await supabase.from("events").update({ is_published: false }).eq("id", eventId);

    // Hard-delete photos in batches within a time budget.
    const start = Date.now();
    let cleaned = 0;
    while (Date.now() - start < TIME_BUDGET_MS) {
      const { data: photos } = await supabase
        .from("photos")
        .select("id, event_id, storage_path, storage_provider, s3_key, s3_key_thumbnail, s3_key_medium")
        .eq("event_id", eventId)
        .limit(BATCH);
      if (!photos?.length) break;
      const r = await hardDeletePhotos(supabase, photos as CleanupPhoto[]);
      cleaned += r.hardDeleted;
      if (r.hardDeleted === 0) break; // all remaining are stuck on S3 failures — stop, retry later
    }

    const { count: remaining } = await supabase
      .from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId);
    if (remaining && remaining > 0) {
      return json({ done: false, cleaned, remaining, message: "Call again to continue deletion" });
    }

    // No photos left — tear down the rest.
    const { data: guests } = await supabase.from("guests").select("selfie_path").eq("event_id", eventId);
    const selfiePaths = (guests || []).map((g) => g.selfie_path).filter(Boolean) as string[];
    if (selfiePaths.length) await supabase.storage.from("selfies").remove(selfiePaths).catch(() => {});
    // A few guest selfies may live in S3 too (defensive).
    const s3Selfies = selfiePaths.filter((p) => p.startsWith("event-photos/"));
    if (s3Selfies.length) await deleteObjects(s3Selfies).catch(() => {});

    await deleteCollection(collectionFor(eventId)).catch((e) =>
      console.error("DeleteCollection failed:", e instanceof Error ? e.message : e));

    // Cascade removes guests, clusters, matches, members.
    const { error: delErr } = await supabase.from("events").delete().eq("id", eventId);
    if (delErr) throw delErr;

    return json({ done: true, cleaned });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
