// Reconcile DB <-> S3 for one event. Host-authed, or cron-secret for automation.
//   DB -> S3: every active photo's object must exist; missing => mark broken.
//   S3 -> DB: every managed object must have a live photo row; extras => report.
// Orphans are REPORTED, never auto-deleted (safety-first, per requirements).
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { headObject, listObjects } from "../_shared/s3.ts";
import { mapWithConcurrency } from "../_shared/storage.ts";

const PENDING_STALE_MS = 30 * 60 * 1000; // pending longer than 30m is abandoned

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, repair = true } = await req.json() as { eventId?: string; repair?: boolean };
    if (!eventId) return json({ error: "eventId required" }, 400);

    // Authorize: host JWT, or the cron secret.
    const secret = Deno.env.get("CRON_SECRET");
    const isCron = !!secret && req.headers.get("x-cron-secret") === secret;
    if (!isCron) {
      const auth = await requireHost(req, eventId);
      if (auth.error) return json({ error: auth.error }, auth.status);
    }

    const supabase = svc();
    const report = { missingObjects: [] as string[], recoveredPending: [] as string[], failedPending: [] as string[], orphanObjects: [] as string[], checked: 0 };

    // ---- DB -> S3 ----
    const { data: active } = await supabase
      .from("photos")
      .select("id, s3_key, s3_key_thumbnail, s3_key_medium, upload_status, storage_provider, created_at")
      .eq("event_id", eventId)
      .eq("storage_provider", "s3")
      .in("upload_status", ["uploaded", "pending"])
      .limit(5000);

    const dbKeys = new Set<string>();
    await mapWithConcurrency(active || [], 8, async (p: any) => {
      report.checked++;
      for (const k of [p.s3_key, p.s3_key_thumbnail, p.s3_key_medium]) if (k) dbKeys.add(k);
      if (!p.s3_key) return;

      if (p.upload_status === "pending") {
        const stale = Date.now() - new Date(p.created_at).getTime() > PENDING_STALE_MS;
        if (!stale) return; // give in-flight uploads time to confirm
        const head = await headObject(p.s3_key).catch(() => ({ exists: false }));
        if (head.exists) {
          if (repair) await supabase.from("photos").update({ upload_status: "uploaded", upload_confirmed_at: new Date().toISOString() }).eq("id", p.id);
          report.recoveredPending.push(p.id);
        } else {
          if (repair) await supabase.from("photos").update({ upload_status: "failed", upload_error: "Upload never completed" }).eq("id", p.id);
          report.failedPending.push(p.id);
        }
        return;
      }

      // uploaded → the original must exist.
      const head = await headObject(p.s3_key).catch(() => ({ exists: true })); // network error: don't false-flag
      if (!head.exists) {
        if (repair) await supabase.from("photos").update({ upload_status: "failed", upload_error: "S3 object missing" }).eq("id", p.id);
        report.missingObjects.push(p.id);
      }
    });

    // ---- S3 -> DB ----
    let token: string | undefined;
    let pages = 0;
    do {
      const page = await listObjects(`event-photos/${eventId}/`, token);
      for (const key of page.keys) {
        if (!dbKeys.has(key)) report.orphanObjects.push(key);
      }
      token = page.truncated ? page.nextToken : undefined;
    } while (token && ++pages < 20);

    if (report.orphanObjects.length > 100) report.orphanObjects = report.orphanObjects.slice(0, 100);

    return json({ ok: true, eventId, ...report,
      summary: {
        missing: report.missingObjects.length,
        recoveredPending: report.recoveredPending.length,
        failedPending: report.failedPending.length,
        orphans: report.orphanObjects.length,
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
