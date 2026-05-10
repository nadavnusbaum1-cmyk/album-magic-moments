// Host-only: list photos in own event (paginated). Optional review-only filter.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { resolvePhotoUrl } from "../_shared/storage.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, sourceLabel, before, limit, review } = await req.json() as {
      eventId?: string; sourceLabel?: string; before?: string; limit?: number; review?: boolean;
    };
    if (!eventId) return json({ error: "eventId required" }, 400);
    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 300);
    const supabase = svc();
    let q = supabase.from("photos")
      .select("id, storage_path, storage_provider, s3_key, face_count, processed, created_at, uploaded_by, media_type, content_type, source_label, processing_error")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(pageSize);
    if (sourceLabel) q = q.eq("source_label", sourceLabel);
    if (review) {
      // Photos needing manual review: processed but no person OR processing failed.
      // Exclude videos (face matching never applies) and items the host already skipped.
      q = q.eq("review_skipped", false)
           .neq("media_type", "video")
           .or("and(processed.eq.true,face_count.eq.0),processing_error.not.is.null");
    }
    if (before) q = q.lt("created_at", before);
    const { data: photos, error } = await q;
    if (error) throw error;

    const items = await Promise.all((photos || []).map(async (p) => ({
      id: p.id,
      url: await resolvePhotoUrl(p),
      face_count: p.face_count,
      processed: p.processed,
      processing_error: p.processing_error,
      created_at: p.created_at,
      uploaded_by: p.uploaded_by,
      media_type: p.media_type || "image",
      source_label: p.source_label,
    })));

    // First page only: include sources + lightweight totals (estimated, fast).
    let sources: { label: string; count: number }[] = [];
    let totals = { total: 0, processed: 0, pending: 0, review: 0 };
    if (!before) {
      const { data: srcRows } = await supabase.rpc("get_event_sources", { _event_id: eventId });
      sources = (srcRows || []).map((r: any) => ({ label: r.source_label as string, count: Number(r.count) }));
      // Counts (head:true is fast — uses index)
      const [{ count: total }, { count: processed }, { count: review }] = await Promise.all([
        supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId),
        supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("processed", true),
        supabase.from("photos").select("id", { count: "exact", head: true })
          .eq("event_id", eventId).eq("processed", true).eq("face_count", 0)
          .eq("review_skipped", false).neq("media_type", "video"),
      ]);
      totals = { total: total || 0, processed: processed || 0, pending: (total || 0) - (processed || 0), review: review || 0 };
    }

    const nextCursor = items.length === pageSize ? items[items.length - 1].created_at : null;
    return json({ photos: items, sources, nextCursor, totals });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
