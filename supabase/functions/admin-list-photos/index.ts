// Host-only: list photos in own event (paginated). Filters: review | moderation.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { resolvePhotoAssets, mapWithConcurrency } from "../_shared/storage.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, sourceLabel, before, after, limit, review, moderation } = await req.json() as {
      eventId?: string; sourceLabel?: string; before?: string; after?: string;
      limit?: number; review?: boolean; moderation?: boolean;
    };
    if (!eventId) return json({ error: "eventId required" }, 400);
    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 300);
    const supabase = svc();
    let q = supabase.from("photos")
      .select("id, storage_path, storage_provider, s3_key, s3_key_thumbnail, s3_key_medium, face_count, processed, created_at, sort_at, uploaded_by, media_type, content_type, source_label, source, processing_error, upload_error, upload_status, processing_status, moderation_status")
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("sort_at", { ascending: true })
      .limit(pageSize);
    if (sourceLabel) q = q.eq("source_label", sourceLabel);
    if (moderation) {
      // Guest uploads awaiting approval.
      q = q.eq("moderation_status", "pending");
    } else if (review) {
      // Needs attention: processed-but-no-face, processing failed, or upload broken.
      q = q.eq("review_skipped", false)
           .neq("media_type", "video")
           .or("and(processing_status.eq.ready,face_count.eq.0),processing_status.eq.failed,upload_status.eq.failed");
    }
    const cursor = after || before;
    if (cursor) q = q.gt("sort_at", cursor);
    const { data: photos, error } = await q;
    if (error) throw error;

    const items = await mapWithConcurrency(photos || [], 6, async (p) => {
      let assets = { thumb: "", medium: "", full: "" };
      try { assets = await resolvePhotoAssets(p); }
      catch (err) { console.error("resolvePhotoAssets failed", p.id, err instanceof Error ? err.message : err); }
      return {
        id: p.id,
        url: assets.full,
        thumbUrl: assets.thumb,
        mediumUrl: assets.medium,
        face_count: p.face_count,
        processed: p.processed,
        processing_error: p.processing_error || p.upload_error,
        upload_status: p.upload_status,
        processing_status: p.processing_status,
        moderation_status: p.moderation_status,
        created_at: p.created_at,
        sort_at: (p as any).sort_at,
        uploaded_by: p.uploaded_by,
        media_type: p.media_type || "image",
        source: p.source,
        source_label: p.source_label,
      };
    });

    let sources: { label: string; count: number }[] = [];
    let totals = { total: 0, ready: 0, pending: 0, review: 0, moderation: 0 };
    if (!cursor) {
      const { data: srcRows } = await supabase.rpc("get_event_sources", { _event_id: eventId });
      sources = (srcRows || []).map((r: any) => ({ label: r.source_label as string, count: Number(r.count) }));
      const base = () => supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId).is("deleted_at", null);
      const [{ count: total }, { count: ready }, { count: moderation }] = await Promise.all([
        base(),
        base().eq("processing_status", "ready"),
        base().eq("moderation_status", "pending"),
      ]);
      totals = {
        total: total || 0,
        ready: ready || 0,
        pending: (total || 0) - (ready || 0),
        review: 0,
        moderation: moderation || 0,
      };
    }

    const nextCursor = items.length === pageSize ? (items[items.length - 1] as any).sort_at : null;
    return json({ photos: items, sources, nextCursor, totals });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
