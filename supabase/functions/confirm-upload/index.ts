// Public: confirm that presigned uploads actually landed in S3.
// Safe to be unauthenticated — it only advances `pending` rows whose object is
// HEAD-verified to exist (a caller cannot fake that without having performed the
// real PUT). Advances pending → uploaded, enforces the true size cap, then
// processes images inline (claimed so the cron cannot double-process), spilling
// any overflow back to `queued` for the cron safety net.
import { corsHeaders, json, svc } from "../_shared/auth.ts";
import { headObject, deleteObjects } from "../_shared/s3.ts";
import { ensureCollection, collectionFor } from "../_shared/rekognition.ts";
import { processPhoto } from "../_shared/processPhoto.ts";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, derivativeKey } from "../_shared/uploadPlan.ts";

const INLINE_TIME_BUDGET_MS = 40_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { photoIds } = await req.json() as { photoIds?: string[] };
    if (!photoIds?.length) return json({ error: "photoIds required" }, 400);
    if (photoIds.length > 60) return json({ error: "Too many photos in one confirm" }, 400);

    const supabase = svc();
    const { data: photos } = await supabase
      .from("photos")
      .select("id, event_id, s3_key, s3_key_medium, storage_path, storage_provider, content_type, media_type, upload_status")
      .in("id", photoIds);
    if (!photos?.length) return json({ confirmed: 0, results: [] });

    const results: { id: string; status: string }[] = [];
    const toProcess: typeof photos = [];

    for (const p of photos) {
      // Idempotent: already-advanced rows are reported as-is.
      if (p.upload_status && p.upload_status !== "pending") {
        results.push({ id: p.id, status: p.upload_status });
        if (p.upload_status === "uploaded") toProcess.push(p);
        continue;
      }
      if (!p.s3_key) { results.push({ id: p.id, status: "error" }); continue; }

      let head;
      try {
        head = await headObject(p.s3_key);
      } catch (_e) {
        results.push({ id: p.id, status: "verify_failed" });
        continue;
      }
      if (!head.exists) {
        results.push({ id: p.id, status: "missing" }); // client may retry the PUT then re-confirm
        continue;
      }

      const cap = p.media_type === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (head.size !== undefined && head.size > cap) {
        await supabase.from("photos").update({
          upload_status: "failed",
          upload_error: `File too large (max ${Math.round(cap / 1024 / 1024)}MB)`,
        }).eq("id", p.id);
        await deleteObjects([p.s3_key]).catch(() => {});
        results.push({ id: p.id, status: "too_large" });
        continue;
      }

      // Detect the client-uploaded thumbnail/medium (best-effort). Missing ones
      // just fall back to the original via resolvePhotoAssets — never a broken tile.
      const thumbKey = derivativeKey(p.s3_key, "thumb");
      const mediumKey = derivativeKey(p.s3_key, "medium");
      const [th, md] = await Promise.all([
        headObject(thumbKey).catch(() => ({ exists: false })),
        headObject(mediumKey).catch(() => ({ exists: false })),
      ]);
      const s3_key_thumbnail = th.exists ? thumbKey : null;
      const s3_key_medium = md.exists ? mediumKey : null;
      await supabase.from("photos").update({
        upload_status: "uploaded",
        upload_confirmed_at: new Date().toISOString(),
        upload_error: null,
        file_size: head.size ?? null,
        s3_key_thumbnail,
        s3_key_medium,
      }).eq("id", p.id);
      (p as { s3_key_medium?: string | null }).s3_key_medium = s3_key_medium; // inline processing uses the medium
      results.push({ id: p.id, status: "uploaded" });
      toProcess.push(p);
    }

    // Best-effort inline processing within a time budget. Each photo is claimed
    // (queued → processing) so the cron sweep can never grab it concurrently.
    const start = Date.now();
    const seenCollections = new Set<string>();
    let processed = 0;
    for (const p of toProcess) {
      if (Date.now() - start > INLINE_TIME_BUDGET_MS) break; // rest stays queued for cron
      const { data: claimed } = await supabase
        .from("photos")
        .update({ processing_status: "processing" })
        .eq("id", p.id)
        .eq("processing_status", "queued")
        .select("id")
        .maybeSingle();
      if (!claimed) continue; // already processed or being processed elsewhere
      try {
        const col = collectionFor(p.event_id);
        if (!seenCollections.has(col)) { await ensureCollection(col); seenCollections.add(col); }
        await processPhoto(supabase, p);
        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown";
        // Return to queue for the cron to retry (retry cap enforced there).
        await supabase.from("photos").update({
          processing_status: "queued",
          processing_attempts: (await bumpAttempts(supabase, p.id)),
          processing_error: msg,
        }).eq("id", p.id);
      }
    }

    return json({ confirmed: results.filter((r) => r.status === "uploaded").length, processed, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function bumpAttempts(supabase: any, id: string): Promise<number> {
  const { data } = await supabase.from("photos").select("processing_attempts").eq("id", id).maybeSingle();
  return (data?.processing_attempts || 0) + 1;
}
