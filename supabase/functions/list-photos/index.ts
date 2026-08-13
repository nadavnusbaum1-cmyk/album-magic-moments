// Public: list photos for an event (paginated). Filter by source optional.
import { corsHeaders, eventBySlug, json, svc } from "../_shared/auth.ts";
import { resolvePhotoAssets } from "../_shared/storage.ts";

// Build a PostgREST in-list value from folder names, safely quoting/escaping.
function pgList(values: string[]): string {
  return "(" + values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",") + ")";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventSlug, sourceLabel, before, after, limit } = await req.json() as {
      eventSlug?: string; sourceLabel?: string; before?: string; after?: string; limit?: number;
    };
    if (!eventSlug) return json({ error: "eventSlug required" }, 400);
    const event = await eventBySlug(eventSlug);
    if (!event || !event.is_published) return json({ error: "Event not found" }, 404);

    const pageSize = Math.min(Math.max(Number(limit) || 60, 1), 200);
    const supabase = svc();
    let q = supabase
      .from("photos")
      .select("id, storage_path, storage_provider, s3_key, s3_key_thumbnail, s3_key_medium, face_count, processed, created_at, sort_at, uploaded_by, media_type, content_type, source_label")
      .eq("event_id", event.id)
      // Public gallery: only confirmed, approved, non-deleted photos (no ghosts,
      // no un-moderated guest uploads).
      .eq("upload_status", "uploaded")
      .eq("moderation_status", "approved")
      .is("deleted_at", null)
      .order("sort_at", { ascending: true })
      .limit(pageSize);
    if (sourceLabel) q = q.eq("source_label", sourceLabel);
    // Hide folders the organizer chose not to share publicly.
    const hidden = Array.isArray((event as { hidden_sources?: unknown }).hidden_sources)
      ? ((event as { hidden_sources: string[] }).hidden_sources).filter((s) => typeof s === "string")
      : [];
    if (hidden.length) q = q.not("source_label", "in", pgList(hidden));
    // ASC pagination: continue after the last sort_at we showed.
    // Accept legacy `before` param too (treat it as `after` for old clients).
    const cursor = after || before;
    if (cursor) q = q.gt("sort_at", cursor);
    const { data: photos, error } = await q;
    if (error) throw error;

    const items = await Promise.all((photos || []).map(async (p) => {
      const assets = await resolvePhotoAssets(p);
      return {
        id: p.id,
        url: assets.full,
        thumbUrl: assets.thumb,
        mediumUrl: assets.medium,
        face_count: p.face_count,
        processed: p.processed,
        created_at: p.created_at,
        sort_at: p.sort_at,
        uploaded_by: p.uploaded_by,
        media_type: p.media_type || "image",
        source_label: p.source_label,
      };
    }));

    // Distinct source labels (only on first page request, to keep payload small)
    let sources: string[] = [];
    if (!cursor) {
      const { data: srcRows } = await supabase
        .from("photos").select("source_label").eq("event_id", event.id).not("source_label", "is", null).limit(1000);
      sources = (Array.from(new Set((srcRows || []).map((p: any) => p.source_label).filter(Boolean))) as string[])
        .filter((s) => !hidden.includes(s));
    }

    const nextCursor = items.length === pageSize ? items[items.length - 1].sort_at : null;
    return json({ photos: items, sources, nextCursor });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
