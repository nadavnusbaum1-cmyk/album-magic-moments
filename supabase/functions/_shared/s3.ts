// =============================================================================
// Direct AWS S3 access via SigV4 (no third-party connector gateway, no AWS SDK).
//
// Reads credentials from Edge Function secrets:
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET
// (the same secrets the existing delete/Rekognition paths already use).
//
// Provides everything the storage lifecycle needs:
//   - presignPut / presignGet ....... short-lived signed URLs for the browser
//   - headObject .................... verify an upload actually landed (+ size)
//   - getObjectBytes / putObjectBytes  server-side read/write (processing, thumbs)
//   - deleteObjects ................. batched delete (replaces s3Delete.ts)
//
// This is the single source of truth for S3 in the backend.
// =============================================================================

const enc = new TextEncoder();

export interface S3Config {
  accessKey: string;
  secretKey: string;
  region: string;
  bucket: string;
}

export function s3Config(): S3Config {
  const accessKey = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  // AWS_REGION is sometimes set to a verbose value; extract a region code.
  const rawRegion = Deno.env.get("AWS_REGION") || "us-east-1";
  const region = (rawRegion.match(/[a-z]{2}-[a-z]+-\d/i)?.[0] || rawRegion).toLowerCase();
  const bucket = Deno.env.get("AWS_S3_BUCKET");
  if (!accessKey || !secretKey || !bucket) {
    throw new Error("AWS S3 credentials not configured");
  }
  return { accessKey, secretKey, region, bucket };
}

// ---------- SigV4 primitives -------------------------------------------------
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

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(buf);
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// RFC3986 encoding for a single path segment / query component.
function rfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodePath(key: string): string {
  return "/" + key.split("/").map(rfc3986).join("/");
}

function amzTimestamp(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

async function signingKey(cfg: S3Config, dateStamp: string): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode("AWS4" + cfg.secretKey), dateStamp);
  const kRegion = await hmac(kDate, cfg.region);
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function hostFor(cfg: S3Config): string {
  return `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
}

// ---------- Presigned URLs (query-string signing) ----------------------------
async function presign(
  method: "GET" | "PUT",
  key: string,
  expiresIn: number,
): Promise<string> {
  const cfg = s3Config();
  const host = hostFor(cfg);
  const canonicalUri = encodePath(key);
  const { amzDate, dateStamp } = amzTimestamp(new Date());
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;

  // Query params are signed; payload is UNSIGNED-PAYLOAD; only host is a signed header.
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKey}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(Math.max(expiresIn, 1), 604800)),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = toHex(await hmac(await signingKey(cfg, dateStamp), stringToSign));
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Presigned URL the browser can PUT bytes to. Default 15 min. */
export function presignPut(key: string, expiresIn = 900): Promise<string> {
  return presign("PUT", key, expiresIn);
}

/** Presigned URL the browser can GET bytes from. Default 1 hour. */
export function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return presign("GET", key, expiresIn);
}

// ---------- Signed header requests (server-to-S3) ----------------------------
async function signedRequest(
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  key: string,
  body?: Uint8Array,
  contentType?: string,
  query?: Record<string, string>,
): Promise<Response> {
  const cfg = s3Config();
  const host = hostFor(cfg);
  const canonicalUri = key === "" ? "/" : encodePath(key);
  const canonicalQuery = query
    ? Object.keys(query).sort().map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`).join("&")
    : "";
  const { amzDate, dateStamp } = amzTimestamp(new Date());
  const payloadHash = await sha256Hex(body ?? new Uint8Array());

  const headerMap: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headerMap["content-type"] = contentType;

  const signedHeaderNames = Object.keys(headerMap).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headerMap[h]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = toHex(await hmac(await signingKey(cfg, dateStamp), stringToSign));
  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "Authorization": authHeader,
  };
  if (contentType) headers["content-type"] = contentType;

  const qs = canonicalQuery ? `?${canonicalQuery}` : "";
  return fetch(`https://${host}${canonicalUri}${qs}`, { method, headers, body });
}

export interface ListPage { keys: string[]; truncated: boolean; nextToken?: string }

/** List object keys under a prefix (ListObjectsV2). For reconciliation scans. */
export async function listObjects(prefix: string, continuationToken?: string): Promise<ListPage> {
  const query: Record<string, string> = { "list-type": "2", prefix, "max-keys": "1000" };
  if (continuationToken) query["continuation-token"] = continuationToken;
  const res = await signedRequest("GET", "", undefined, undefined, query);
  if (!res.ok) throw new Error(`S3 ListObjectsV2 failed [${res.status}]`);
  const xml = await res.text();
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => decodeXml(m[1]));
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const nextToken = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
  return { keys, truncated, nextToken: nextToken ? decodeXml(nextToken) : undefined };
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export interface HeadResult {
  exists: boolean;
  size?: number;
  contentType?: string;
}

/** Verify an object exists (used to confirm a browser upload actually landed). */
export async function headObject(key: string): Promise<HeadResult> {
  const res = await signedRequest("HEAD", key);
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error(`S3 HEAD failed [${res.status}] ${key}`);
  await res.body?.cancel();
  const size = Number(res.headers.get("content-length") ?? "0");
  return {
    exists: true,
    size: Number.isFinite(size) ? size : undefined,
    contentType: res.headers.get("content-type") ?? undefined,
  };
}

/** Download an object's bytes (server-side: processing, thumbnail generation). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await signedRequest("GET", key);
  if (!res.ok) throw new Error(`S3 GET failed [${res.status}] ${key}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Upload bytes server-side (e.g. a generated thumbnail/medium rendition). */
export async function putObjectBytes(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const res = await signedRequest("PUT", key, bytes, contentType);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`S3 PUT failed [${res.status}] ${key} ${body}`);
  }
  await res.body?.cancel();
}

// ---------- Batched delete (replaces _shared/s3Delete.ts) --------------------
export async function deleteObjects(
  keys: string[],
): Promise<{ deleted: number; failed: { key: string; status: number; body?: string }[] }> {
  const uniq = [...new Set(keys.filter(Boolean))];
  let deleted = 0;
  const failed: { key: string; status: number; body?: string }[] = [];
  const concurrency = 5;
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, uniq.length) }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= uniq.length) return;
        const key = uniq[idx];
        try {
          const res = await signedRequest("DELETE", key);
          await res.body?.cancel();
          if (res.ok || res.status === 404) deleted++;
          else failed.push({ key, status: res.status, body: await res.text().catch(() => "") });
        } catch (e) {
          failed.push({ key, status: 0, body: e instanceof Error ? e.message : String(e) });
        }
      }
    }),
  );
  return { deleted, failed };
}
