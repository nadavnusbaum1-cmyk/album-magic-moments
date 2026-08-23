// Cron: enforce per-plan storage retention. Any event whose storage_expires_at
// has passed has its photos hard-deleted from AWS (S3 objects + Rekognition
// faces), its Rekognition collection dropped, and guest selfies removed — then
// the event is marked `storage_expired` and unpublished. The album row is KEPT
// as an "expired" shell so the host understands their photos were removed under
// the retention policy rather than silently vanishing.
//
// Cron-secret gated. Re-entrant + time-budgeted: it drains photos in batches and
// finalizes an event only once it has zero photos left, so a huge album spans
// several runs without ever dropping a DB row while its S3 object still exists.
import { corsHeaders, json, svc } from "../_shared/auth.ts";
import { collectionFor, deleteCollection } from "../_shared/rekognition.ts";
import { deleteObjects } from "../_shared/s3.ts";
import { hardDeletePhotos, type CleanupPhoto } from "../_shared/cleanupPhotos.ts";

const TIME_BUDGET_MS = 45_000;
const BATCH = 50;
const MAX_EVENTS = 25; // candidates considered per run

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return json({ error: "Forbidden" }, 403);

  const start = Date.now();
  try {
    const supabase = svc();
    const nowIso = new Date().toISOString();

    const { data: due } = await supabase
      .from("events")
      .select("id")
      .eq("storage_expired", false)
      .not("storage_expires_at", "is", null)
      .lte("storage_expires_at", nowIso)
      .order("storage_expires_at", { ascending: true })
      .limit(MAX_EVENTS);

    if (!due?.length) return json({ expired: 0, cleaned: 0 });

    let cleaned = 0;
    const finalized: string[] = [];
    const pending: string[] = [];

    for (const { id: eventId } of due) {
      if (Date.now() - start >= TIME_BUDGET_MS) break;
      // Unpublish immediately so an expired album stops serving while we purge.
      await supabase.from("events").update({ is_published: false }).eq("id", eventId);

      // Drain photos in batches within the shared time budget.
      while (Date.now() - start < TIME_BUDGET_MS) {
        const { data: photos } = await supabase
          .from("photos")
          .select("id, event_id, storage_path, storage_provider, s3_key, s3_key_thumbnail, s3_key_medium")
          .eq("event_id", eventId)
          .limit(BATCH);
        if (!photos?.length) break;
        const r = await hardDeletePhotos(supabase, photos as CleanupPhoto[]);
        cleaned += r.hardDeleted;
        if (r.hardDeleted === 0) break; // remaining stuck on S3 failures — retry next run
      }

      const { count: remaining } = await supabase
        .from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId);
      if (remaining && remaining > 0) { pending.push(eventId); continue; }

      // Zero photos left — tear down remaining AWS state and finalize the shell.
      const { data: guests } = await supabase.from("guests").select("selfie_path").eq("event_id", eventId);
      const selfiePaths = (guests || []).map((g) => g.selfie_path).filter(Boolean) as string[];
      if (selfiePaths.length) await supabase.storage.from("selfies").remove(selfiePaths).catch(() => {});
      const s3Selfies = selfiePaths.filter((p) => p.startsWith("event-photos/"));
      if (s3Selfies.length) await deleteObjects(s3Selfies).catch(() => {});

      await deleteCollection(collectionFor(eventId)).catch((e) =>
        console.error("DeleteCollection failed:", e instanceof Error ? e.message : e));

      await supabase.from("events")
        .update({ storage_expired: true, storage_expired_at: new Date().toISOString() })
        .eq("id", eventId);
      finalized.push(eventId);
    }

    return json({ expired: finalized.length, cleaned, finalized, pending });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
