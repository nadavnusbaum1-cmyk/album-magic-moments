// Host-only: list photos in own event (richer data for admin gallery).
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { resolvePhotoUrl } from "../_shared/storage.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, sourceLabel } = await req.json() as { eventId?: string; sourceLabel?: string };
    if (!eventId) return json({ error: "eventId required" }, 400);
    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const supabase = svc();
    let q = supabase.from("photos")
      .select("id, storage_path, storage_provider, s3_key, face_count, processed, created_at, uploaded_by, media_type, content_type, source_label, processing_error")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (sourceLabel) q = q.eq("source_label", sourceLabel);
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

    const sources = Array.from(new Set((photos || []).map((p: any) => p.source_label).filter(Boolean))) as string[];
    return json({ photos: items, sources });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
