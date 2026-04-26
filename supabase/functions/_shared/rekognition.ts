// AWS Rekognition helper using SigV4 signing (no external SDK).
// Supports CreateCollection, IndexFaces, SearchFacesByImage, DetectFaces.

const encoder = new TextEncoder();

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const dataBytes = encoder.encode(data);
  const dataBuf = dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength) as ArrayBuffer;
  return await crypto.subtle.sign("HMAC", cryptoKey, dataBuf);
}

function strToBuf(s: string): ArrayBuffer {
  const bytes = encoder.encode(s);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function getSigningKey(secret: string, dateStamp: string, region: string, service: string) {
  const kDate = await hmac(strToBuf("AWS4" + secret), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

export async function rekognition(action: string, payload: Record<string, unknown>) {
  const accessKey = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const rawRegion = Deno.env.get("AWS_REGION") || "us-east-1";
  // Extract a valid region code (e.g. "eu-west-2") from possibly verbose values like "Europe (London) eu-west-2"
  const regionMatch = rawRegion.match(/[a-z]{2}-[a-z]+-\d/);
  const region = regionMatch ? regionMatch[0] : rawRegion.trim();
  if (!accessKey || !secretKey) throw new Error("AWS credentials not configured");

  const service = "rekognition";
  const host = `${service}.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const body = JSON.stringify(payload);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const target = `RekognitionService.${action}`;
  const contentType = "application/x-amz-json-1.1";

  const canonicalHeaders =
    `content-type:${contentType}\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const payloadHash = await sha256Hex(body);
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const signingKey = await getSigningKey(secretKey, dateStamp, region, service);
  const signatureBuf = await hmac(signingKey, stringToSign);
  const signature = [...new Uint8Array(signatureBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "X-Amz-Date": amzDate,
      "X-Amz-Target": target,
      "Authorization": authorization,
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Rekognition ${action} failed [${res.status}]: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

export const COLLECTION_ID = "wedding-guests";

export async function ensureCollection() {
  try {
    await rekognition("CreateCollection", { CollectionId: COLLECTION_ID });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("ResourceAlreadyExistsException")) throw e;
  }
}
