// Host-only: sign S3 PUT URLs (direct AWS, no connector gateway).
// Creates photo rows in `pending` upload_status; the client PUTs bytes, then
// calls confirm-upload which HEAD-verifies the object and advances the state.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { presignPut } from "../_shared/s3.ts";
import { planUploads, isPlanItem, type FileInput } from "../_shared/uploadPlan.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, files, uploadedBy, sourceLabel } = await req.json() as {
      eventId: string;
      files: FileInput[];
      uploadedBy?: string;
      sourceLabel?: string;
    };
    if (!eventId) return json({ error: "eventId required" }, 400);
    if (!files?.length) return json({ error: "files required" }, 400);
    if (files.length > 50) return json({ error: "Too many files in one batch" }, 400);

    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const supabase = svc();
    const uploader = (uploadedBy || "").trim().slice(0, 60) || null;
    const source = (sourceLabel || "").trim().slice(0, 60) || null;

    const planned = planUploads(eventId, files);
    const items = planned.filter(isPlanItem);

    // Idempotency: reuse existing rows for known client_upload_ids so a retry
    // (refresh / network re-send) does not create duplicate rows or objects.
    const clientIds = items.map((p) => p.clientUploadId).filter(Boolean) as string[];
    const existingByClientId = new Map<string, { id: string; key: string; content_type: string }>();
    if (clientIds.length) {
      const { data: existing } = await supabase
        .from("photos")
        .select("id, s3_key, content_type, client_upload_id")
        .eq("event_id", eventId)
        .in("client_upload_id", clientIds);
      for (const r of existing || []) {
        existingByClientId.set(r.client_upload_id, { id: r.id, key: r.s3_key, content_type: r.content_type });
      }
    }

    const newRows: Record<string, unknown>[] = [];
    const resolved = items.map((p) => {
      const reuse = p.clientUploadId ? existingByClientId.get(p.clientUploadId) : undefined;
      if (reuse) return { idx: p.idx, id: reuse.id, key: reuse.key, contentType: reuse.content_type };
      newRows.push({
        id: p.id,
        event_id: eventId,
        storage_path: p.key,
        s3_key: p.key,
        storage_provider: "s3",
        source: "upload",
        source_label: source,
        upload_status: "pending",
        processing_status: "queued",
        moderation_status: "approved",
        uploaded_by: uploader,
        media_type: p.mediaType,
        content_type: p.contentType,
        mime_type: p.contentType,
        file_size: p.fileSize,
        taken_at: p.takenAt,
        client_upload_id: p.clientUploadId,
      });
      return { idx: p.idx, id: p.id, key: p.key, contentType: p.contentType };
    });

    if (newRows.length) {
      const { error: insErr } = await supabase.from("photos").insert(newRows);
      if (insErr) throw insErr;
    }

    // Presign PUT URLs in parallel.
    const uploadUrls = new Map<number, string>();
    await Promise.all(resolved.map(async (r) => {
      uploadUrls.set(r.idx, await presignPut(r.key));
    }));

    const uploads = planned.map((p) => {
      if (!isPlanItem(p)) return { photoId: "", uploadUrl: "", key: "", contentType: "", skipped: true, reason: p.reason };
      const r = resolved.find((x) => x.idx === p.idx)!;
      return { photoId: r.id, uploadUrl: uploadUrls.get(p.idx)!, key: r.key, contentType: r.contentType };
    });

    return json({ uploads });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
