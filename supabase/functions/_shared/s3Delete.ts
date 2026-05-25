// AWS SigV4 DELETE for S3 objects using AWS_ACCESS_KEY_ID / SECRET / REGION / BUCKET.
// The connector-gateway only proxies GET-list and HEAD, so DELETE is performed directly against S3.

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function encodePath(key: string): string {
  return key.split("/").map((seg) => encodeURIComponent(seg)).join("/");
}

async function signedDelete(key: string): Promise<{ ok: boolean; status: number; body?: string }> {
  const accessKey = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const region = Deno.env.get("AWS_REGION") || "us-east-1";
  const bucket = Deno.env.get("AWS_S3_BUCKET");
  if (!accessKey || !secretKey || !bucket) {
    return { ok: false, status: 0, body: "AWS S3 credentials not configured" };
  }

  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const path = `/${encodePath(key)}`;
  const url = `https://${host}${path}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex("");

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `DELETE\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const kDate = await hmac(enc.encode("AWS4" + secretKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      "Host": host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "Authorization": authHeader,
    },
  });
  // 204 No Content (success) or 200 OK; some accounts return 404 for missing.
  if (res.ok || res.status === 404) return { ok: true, status: res.status };
  const body = await res.text().catch(() => "");
  return { ok: false, status: res.status, body };
}

export async function deleteS3Objects(keys: string[]): Promise<{ deleted: number; failed: { key: string; status: number; body?: string }[] }> {
  let deleted = 0;
  const failed: { key: string; status: number; body?: string }[] = [];
  // Run with a small concurrency to avoid bursts.
  const concurrency = 5;
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, keys.length) }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= keys.length) return;
        const key = keys[idx];
        try {
          const r = await signedDelete(key);
          if (r.ok) deleted++;
          else failed.push({ key, status: r.status, body: r.body });
        } catch (e) {
          failed.push({ key, status: 0, body: e instanceof Error ? e.message : String(e) });
        }
      }
    }),
  );
  return { deleted, failed };
}
