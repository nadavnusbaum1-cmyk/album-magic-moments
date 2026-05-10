// Public: guests upload photos to an event by slug.
// Mirrors sign-s3-upload but does NOT require host auth.
import { corsHeaders, eventBySlug, json, svc } from "../_shared/auth.ts";

const API_URL = "https://connector-gateway.lovable.dev";
const ALLOWED = /^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|quicktime|webm|x-m4v|x-matroska))$/i;
const HEIC_RE = /\.(heic|heif)$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
    if (!LOVABLE_API_KEY || !AWS_S3_API_KEY) throw new Error("S3 connector not configured");

    const { eventSlug, files, uploadedBy } = await req.json() as {
      eventSlug: string;
      files: { name: string; contentType: string }[];
      uploadedBy?: string;
    };
    if (!eventSlug) return json({ error: "eventSlug required" }, 400);
    if (!files?.length) return json({ error: "files required" }, 400);
    if (files.length > 30) return json({ error: "Too many files in one batch" }, 400);

    const event = await eventBySlug(eventSlug);
    if (!event || !event.is_published) return json({ error: "Event not found" }, 404);

    // Re-fetch with allow_guest_uploads (eventBySlug doesn't select it)
    const supabase = svc();
    const { data: full } = await supabase.from("events").select("id, allow_guest_uploads").eq("id", event.id).maybeSingle();
    if (!full?.allow_guest_uploads) return json({ error: "Guest uploads are disabled for this event" }, 403);

    const uploader = (uploadedBy || "").trim().slice(0, 60) || null;
    const sourceLabel = uploader ? `Guest: ${uploader}` : "Guest uploads";

    type Plan = { idx: number; id: string; key: string; contentType: string; mediaType: string };
    const plans: (Plan | { idx: number; skipped: true })[] = files.map((f, idx) => {
      const lower = (f.name || "").toLowerCase();
      if (HEIC_RE.test(lower) || /^image\/(heic|heif)/i.test(f.contentType || "")) {
        return { idx, skipped: true };
      }
      const id = crypto.randomUUID();
      const ext = (lower.split(".").pop() || "jpg").slice(0, 5);
      let contentType = f.contentType || "";
      if (!contentType || !ALLOWED.test(contentType)) {
        if (lower.endsWith(".mp4")) contentType = "video/mp4";
        else if (lower.endsWith(".mov")) contentType = "video/quicktime";
        else if (lower.endsWith(".webm")) contentType = "video/webm";
        else if (lower.endsWith(".png")) contentType = "image/png";
        else if (lower.endsWith(".webp")) contentType = "image/webp";
        else contentType = "image/jpeg";
      }
      const mediaType = contentType.startsWith("video/") ? "video" : "image";
      const key = `event-photos/${event.id}/${id}.${ext}`;
      return { idx, id, key, contentType, mediaType };
    });

    const realPlans = plans.filter((p): p is Plan => !("skipped" in p && p.skipped));

    const signed = await Promise.all(realPlans.map(async (p) => {
      const signRes = await fetch(`${API_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=write`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": AWS_S3_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ object_path: p.key }),
      });
      if (!signRes.ok) throw new Error(`Sign failed [${signRes.status}]`);
      const { url } = await signRes.json();
      return { ...p, uploadUrl: url as string };
    }));

    if (signed.length) {
      const rows = signed.map((p) => ({
        id: p.id,
        event_id: event.id,
        storage_path: p.key,
        s3_key: p.key,
        storage_provider: "s3",
        source: "guest_upload",
        source_label: sourceLabel,
        processed: false,
        uploaded_by: uploader,
        media_type: p.mediaType,
        content_type: p.contentType,
      }));
      const { error: insErr } = await supabase.from("photos").insert(rows);
      if (insErr) throw insErr;
    }

    const results = plans.map((p) => {
      if ("skipped" in p && p.skipped) {
        return { photoId: "", uploadUrl: "", key: "", contentType: "", skipped: true, reason: "HEIC must be converted client-side" };
      }
      const s = signed.find((x) => x.idx === (p as Plan).idx)!;
      return { photoId: s.id, uploadUrl: s.uploadUrl, key: s.key, contentType: s.contentType };
    });

    return json({ uploads: results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
