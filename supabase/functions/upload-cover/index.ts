// Host-only: upload a cover image to the public Supabase event-photos bucket.
// Used because S3-signed URLs can be unstable for hotlinked cover images.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";

const ALLOWED = /^image\/(jpeg|jpg|png|webp|gif)$/i;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const form = await req.formData();
    const eventId = String(form.get("eventId") || "");
    const file = form.get("file") as File | null;
    if (!eventId) return json({ error: "eventId required" }, 400);
    if (!file) return json({ error: "file required" }, 400);
    if (!ALLOWED.test(file.type)) return json({ error: "Only JPEG/PNG/WEBP/GIF images" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "Image must be under 10 MB" }, 400);

    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const supabase = svc();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
    const path = `covers/${eventId}/${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from("event-photos")
      .upload(path, bytes, { contentType: file.type, upsert: true });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("event-photos").getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { data: ev, error: evErr } = await supabase
      .from("events")
      .update({ cover_image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", eventId)
      .select()
      .single();
    if (evErr) throw evErr;

    return json({ url: publicUrl, event: ev });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
