// Reconcile DB <-> S3.
//   Global mode (cron, no eventId): sweep stale `pending` photos across all
//     events — recover to `uploaded` if the object exists, else mark `failed`.
//     This self-heals uploads whose browser PUT never completed.
//   Per-event mode (host or cron, with eventId): full reconcile —
//     DB->S3 (missing objects => broken), stale pending recovery, and
//     S3->DB orphan reporting (orphans are reported, never auto-deleted).
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { headObject, listObjects } from "../_shared/s3.ts";
import { mapWithConcurrency } from "../_shared/storage.ts";

const PENDING_STALE_MS = 30 * 60 * 1000; // pending longer than 30m is abandoned

// deno-lint-ignore no-explicit-any
async function recoverPending(supabase: any, rows: any[], repair: boolean) {
  let recovered = 0, failed = 0;
  await mapWithConcurrency(rows, 8, async (p: any) => {
    if (!p.s3_key) return;
    const head = await headObject(p.s3_key).catch(() => ({ exists: false }));
    if (head.exists) {
      if (repair) await supabase.from("photos").update({
        upload_status: "uploaded", upload_confirmed_at: new Date().toISOString(), file_size: head.size ?? null,
      }).eq("id", p.id);
      recovered++;
    } else {
      if (repair) await supabase.from("photos").update({
        upload_status: "failed", upload_error: "Upload never completed",
      }).eq("id", p.id);
      failed++;
    }
  });
  return { recovered, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { eventId, repair = true } = body as { eventId?: string; repair?: boolean };

    const secret = Deno.env.get("CRON_SECRET");
    const isCron = !!secret && req.headers.get("x-cron-secret") === secret;
    const supabase = svc();

    // ---- Global pending-recovery sweep (cron only) ----
    if (!eventId) {
      if (!isCron) return json({ error: "eventId required" }, 400);
      const cutoff = new Date(Date.now() - PENDING_STALE_MS).toISOString();
      const { data: stale } = await supabase
        .from("photos")
        .select("id, s3_key")
        .eq("upload_status", "pending")
        .eq("storage_provider", "s3")
        .lt("created_at", cutoff)
        .not("s3_key", "is", null)
        .limit(200);
      const { recovered, failed } = await recoverPending(supabase, stale || [], repair);
      return json({ ok: true, mode: "global-pending", scanned: (stale || []).length, recovered, failed });
    }

    // ---- Per-event full reconcile (host, or cron) ----
    if (!isCron) {
      const auth = await requireHost(req, eventId);
      if (auth.error) return json({ error: auth.error }, auth.status);
    }

    const report = { missingObjects: [] as string[], recoveredPending: 0, failedPending: 0, orphanObjects: [] as string[], checked: 0 };

    const { data: active } = await supabase
      .from("photos")
      .select("id, s3_key, s3_key_thumbnail, s3_key_medium, upload_status, storage_provider, created_at")
      .eq("event_id", eventId)
      .eq("storage_provider", "s3")
      .in("upload_status", ["uploaded", "pending"])
      .limit(5000);

    const dbKeys = new Set<string>();
    const stalePending: any[] = [];
    await mapWithConcurrency(active || [], 8, async (p: any) => {
      report.checked++;
      for (const k of [p.s3_key, p.s3_key_thumbnail, p.s3_key_medium]) if (k) dbKeys.add(k);
      if (!p.s3_key) return;
      if (p.upload_status === "pending") {
        if (Date.now() - new Date(p.created_at).getTime() > PENDING_STALE_MS) stalePending.push(p);
        return;
      }
      // uploaded → the original must exist (network error: don't false-flag).
      const head = await headObject(p.s3_key).catch(() => ({ exists: true }));
      if (!head.exists) {
        if (repair) await supabase.from("photos").update({ upload_status: "failed", upload_error: "S3 object missing" }).eq("id", p.id);
        report.missingObjects.push(p.id);
      }
    });
    const rec = await recoverPending(supabase, stalePending, repair);
    report.recoveredPending = rec.recovered;
    report.failedPending = rec.failed;

    // S3 -> DB orphan reporting.
    let token: string | undefined; let pages = 0;
    do {
      const page = await listObjects(`event-photos/${eventId}/`, token);
      for (const key of page.keys) if (!dbKeys.has(key)) report.orphanObjects.push(key);
      token = page.truncated ? page.nextToken : undefined;
    } while (token && ++pages < 20);
    if (report.orphanObjects.length > 100) report.orphanObjects = report.orphanObjects.slice(0, 100);

    return json({
      ok: true, eventId, ...report,
      summary: { missing: report.missingObjects.length, recoveredPending: report.recoveredPending, failedPending: report.failedPending, orphans: report.orphanObjects.length },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
