// Shared helper: get a signed S3 read URL via the connector gateway.
const API_URL = "https://connector-gateway.lovable.dev";

export async function signS3Read(key: string, expiresIn = 3600): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
  if (!LOVABLE_API_KEY || !AWS_S3_API_KEY) {
    throw new Error("S3 connector not configured");
  }
  const res = await fetch(`${API_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=read`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": AWS_S3_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ object_path: key, expires_in: expiresIn }),
  });
  if (!res.ok) throw new Error(`S3 sign failed [${res.status}]`);
  const { url } = await res.json();
  return url as string;
}

export function supabasePublicUrl(path: string): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/storage/v1/object/public/event-photos/${path}`;
}

// Resolve a photo row to a public/signed URL
export async function resolvePhotoUrl(photo: {
  storage_provider?: string | null;
  s3_key?: string | null;
  storage_path: string;
}): Promise<string> {
  if (photo.storage_provider === "s3" && photo.s3_key) {
    return await signS3Read(photo.s3_key);
  }
  return supabasePublicUrl(photo.storage_path);
}
