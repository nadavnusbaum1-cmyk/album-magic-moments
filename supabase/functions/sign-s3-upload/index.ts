// Host-only: sign S3 PUT URLs for an event. Parallelized for speed.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";

const API_URL = "https://connector-gateway.lovable.dev";
const ALLOWED = /^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|quicktime|webm|x-m4v|x-matroska))$/i;
const HEIC_RE = /\.(heic|heif)$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
    if (!LOVABLE_API_KEY || !AWS_S3_API_KEY) throw new Error("S3 connector not configured");

    const { eventId, files, uploadedBy, sourceLabel } = await req.json() as {
      eventId: string;
      files: { name: string; contentType: string }[];
      uploadedBy?: string;
      sourceLabel?: string;
    };
    if (!eventId) return json({ error: "eventId required" }, 400);
    if (!files?.length) return json({ error: "files required" }, 400);

    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const supabase = svc();
    const uploader = (uploadedBy || "").trim().slice(0, 60) || null;
    const source = (sourceLabel || "").trim().slice(0, 60) || null;

    type Plan = { idx: number; id: string; key: string; contentType: string; mediaType: string; skipped?: boolean };
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
      const key = `event-photos/${eventId}/${id}.${ext}`;
      return { idx, id, key, contentType, mediaType };
    });

    const realPlans = plans.filter((p): p is Plan => !("skipped" in p && p.skipped));

    // Sign URLs in parallel
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

    // Batch insert photo rows
    if (signed.length) {
      const rows = signed.map((p) => ({
        id: p.id,
        event_id: eventId,
        storage_path: p.key,
        s3_key: p.key,
        storage_provider: "s3",
        source: "upload",
        source_label: source,
        processed: false,
        uploaded_by: uploader,
        media_type: p.mediaType,
        content_type: p.contentType,
      }));
      const { error: insErr } = await supabase.from("photos").insert(rows);
      if (insErr) throw insErr;
    }

    // Reassemble in original order
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
