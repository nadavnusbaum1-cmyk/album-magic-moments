// Shared helper: get a signed S3 read URL via the connector gateway.
const API_URL = "https://connector-gateway.lovable.dev";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function signS3Read(key: string, expiresIn = 3600): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
  if (!LOVABLE_API_KEY || !AWS_S3_API_KEY) {
    throw new Error("S3 connector not configured");
  }
  // Retry on 429 / 5xx with exponential backoff
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=read`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": AWS_S3_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ object_path: key, expires_in: expiresIn }),
    });
    if (res.ok) {
      const { url } = await res.json();
      return url as string;
    }
    lastStatus = res.status;
    if (res.status !== 429 && res.status < 500) break;
    await sleep(150 * Math.pow(2, attempt) + Math.random() * 100);
  }
  throw new Error(`S3 sign failed [${lastStatus}]`);
}

export function supabasePublicUrl(path: string): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/storage/v1/object/public/event-photos/${path}`;
}

// Resolve a photo row to a public/signed URL. Returns null on failure.
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

// Concurrency-limited mapper to avoid hammering the sign endpoint.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
