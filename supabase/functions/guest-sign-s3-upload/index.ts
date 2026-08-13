// Public: guests upload photos to an event by slug (no host auth).
// Mirrors sign-s3-upload but sets source=guest_upload and applies the event's
// moderation policy (guest_photos_auto_publish → approved | pending).
import { corsHeaders, eventBySlug, json, svc } from "../_shared/auth.ts";
import { presignPut } from "../_shared/s3.ts";
import { planUploads, isPlanItem, derivativeKey, type FileInput } from "../_shared/uploadPlan.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventSlug, files, uploadedBy } = await req.json() as {
      eventSlug: string;
      files: FileInput[];
      uploadedBy?: string;
    };
    if (!eventSlug) return json({ error: "eventSlug required" }, 400);
    if (!files?.length) return json({ error: "files required" }, 400);
    if (files.length > 30) return json({ error: "Too many files in one batch" }, 400);

    const event = await eventBySlug(eventSlug);
    if (!event || !event.is_published) return json({ error: "Event not found" }, 404);

    const supabase = svc();
    const { data: full } = await supabase
      .from("events")
      .select("id, allow_guest_uploads, guest_photos_auto_publish")
      .eq("id", event.id)
      .maybeSingle();
    if (!full?.allow_guest_uploads) return json({ error: "Guest uploads are disabled for this event" }, 403);

    const moderationStatus = full.guest_photos_auto_publish === false ? "pending" : "approved";
    const uploader = (uploadedBy || "").trim().slice(0, 60) || null;
    const sourceLabel = uploader ? `Guest: ${uploader}` : "Guest uploads";

    const planned = planUploads(event.id, files);
    const items = planned.filter(isPlanItem);

    // Idempotency (same as host path).
    const clientIds = items.map((p) => p.clientUploadId).filter(Boolean) as string[];
    const existingByClientId = new Map<string, { id: string; key: string; content_type: string }>();
    if (clientIds.length) {
      const { data: existing } = await supabase
        .from("photos")
        .select("id, s3_key, content_type, client_upload_id")
        .eq("event_id", event.id)
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
        event_id: event.id,
        storage_path: p.key,
        s3_key: p.key,
        storage_provider: "s3",
        source: "guest_upload",
        source_label: sourceLabel,
        upload_status: "pending",
        processing_status: "queued",
        moderation_status: moderationStatus,
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

    const urls = new Map<number, { original: string; thumb: string; medium: string }>();
    await Promise.all(resolved.map(async (r) => {
      const [original, thumb, medium] = await Promise.all([
        presignPut(r.key),
        presignPut(derivativeKey(r.key, "thumb")),
        presignPut(derivativeKey(r.key, "medium")),
      ]);
      urls.set(r.idx, { original, thumb, medium });
    }));

    const uploads = planned.map((p) => {
      if (!isPlanItem(p)) return { photoId: "", uploadUrl: "", thumbUploadUrl: "", mediumUploadUrl: "", key: "", contentType: "", skipped: true, reason: p.reason };
      const r = resolved.find((x) => x.idx === p.idx)!;
      const u = urls.get(p.idx)!;
      return { photoId: r.id, uploadUrl: u.original, thumbUploadUrl: u.thumb, mediumUploadUrl: u.medium, key: r.key, contentType: r.contentType };
    });

    return json({ uploads });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
