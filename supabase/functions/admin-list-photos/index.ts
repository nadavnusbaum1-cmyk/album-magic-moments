// Host-only: list photos in own event (paginated).
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { resolvePhotoUrl } from "../_shared/storage.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, sourceLabel, before, limit } = await req.json() as {
      eventId?: string; sourceLabel?: string; before?: string; limit?: number;
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

    let sources: string[] = [];
    let totals = { total: 0, processed: 0, pending: 0 };
    if (!before) {
      const { data: srcRows } = await supabase
        .from("photos").select("source_label").eq("event_id", eventId).not("source_label", "is", null).limit(1000);
      sources = Array.from(new Set((srcRows || []).map((p: any) => p.source_label).filter(Boolean))) as string[];
      const { count: total } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId);
      const { count: processed } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("processed", true);
      totals = { total: total || 0, processed: processed || 0, pending: (total || 0) - (processed || 0) };
    }

    const nextCursor = items.length === pageSize ? items[items.length - 1].created_at : null;
    return json({ photos: items, sources, nextCursor, totals });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
