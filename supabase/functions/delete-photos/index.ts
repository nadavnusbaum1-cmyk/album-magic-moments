// Host-only: delete photos within an event.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { deleteS3Objects } from "../_shared/s3Delete.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { photoIds } = await req.json() as { photoIds?: string[] };
    if (!photoIds?.length) return json({ error: "photoIds required" }, 400);
    const supabase = svc();
    const { data: photos } = await supabase.from("photos").select("id, event_id, storage_path, storage_provider, s3_key").in("id", photoIds);
    if (!photos?.length) return json({ deleted: 0 });
    const eventIds = [...new Set(photos.map((p) => p.event_id).filter(Boolean) as string[])];
    for (const eid of eventIds) {
      const auth = await requireHost(req, eid);
      if (auth.error) return json({ error: auth.error }, auth.status);
    }

    const supabasePaths = photos.filter((p) => p.storage_provider !== "s3").map((p) => p.storage_path);
    const s3Keys = photos.filter((p) => p.storage_provider === "s3" && p.s3_key).map((p) => p.s3_key as string);

    if (supabasePaths.length) await supabase.storage.from("event-photos").remove(supabasePaths);
    if (s3Keys.length) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
      if (LOVABLE_API_KEY && AWS_S3_API_KEY) {
        await Promise.all(s3Keys.map(async (key) => {
          try {
            await fetch(`https://connector-gateway.lovable.dev/aws_s3/${key}`, {
              method: "DELETE",
              headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": AWS_S3_API_KEY },
            });
          } catch (e) { console.error("S3 delete failed:", key, e); }
        }));
      }
    }

    const { data: gm } = await supabase.from("photo_matches").select("guest_id").in("photo_id", photoIds);
    const affectedGuests = [...new Set((gm || []).map((m) => m.guest_id))];
    const { data: cm } = await supabase.from("cluster_photo_matches").select("cluster_id").in("photo_id", photoIds);
    const affectedClusters = [...new Set((cm || []).map((m) => m.cluster_id))];
    const { data: stale } = await supabase.from("face_clusters").select("id").in("representative_photo_id", photoIds);
    const staleSet = new Set((stale || []).map((c) => c.id));

    await supabase.from("photo_matches").delete().in("photo_id", photoIds);
    await supabase.from("cluster_photo_matches").delete().in("photo_id", photoIds);
    await supabase.from("photos").delete().in("id", photoIds);

    let removedGuests = 0, removedClusters = 0;
    for (const gid of affectedGuests) {
      const { count } = await supabase.from("photo_matches").select("*", { count: "exact", head: true }).eq("guest_id", gid);
      if (!count) { await supabase.from("guests").delete().eq("id", gid); removedGuests++; }
      else await supabase.from("guests").update({ photo_count: count }).eq("id", gid);
    }
    for (const cid of affectedClusters) {
      const { count } = await supabase.from("cluster_photo_matches").select("*", { count: "exact", head: true }).eq("cluster_id", cid);
      if (!count) { await supabase.from("face_clusters").delete().eq("id", cid); removedClusters++; }
      else {
        const update: Record<string, unknown> = { photo_count: count };
        if (staleSet.has(cid)) {
          const { data: any1 } = await supabase.from("cluster_photo_matches").select("photo_id, photos(storage_path, storage_provider, s3_key)").eq("cluster_id", cid).limit(1).maybeSingle();
          const p = any1?.photos ? (Array.isArray(any1.photos) ? any1.photos[0] : any1.photos) : null;
          if (p && any1?.photo_id) {
            update.representative_photo_id = any1.photo_id;
            update.representative_storage_path = p.storage_path;
            update.representative_s3_key = p.storage_provider === "s3" ? p.s3_key : null;
          }
        }
        await supabase.from("face_clusters").update(update).eq("id", cid);
      }
    }

    return json({ deleted: photoIds.length, removedClusters, removedGuests });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
