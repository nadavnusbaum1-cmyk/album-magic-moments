// Deno tests for the storage foundation's pure/crypto logic.
//   Run: deno test supabase/functions/tests/storage-foundation.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planUploads, isPlanItem, MAX_IMAGE_BYTES } from "../_shared/uploadPlan.ts";

Deno.test("planUploads assigns unique immutable keys under the event prefix", () => {
  const eventId = "11111111-1111-1111-1111-111111111111";
  const planned = planUploads(eventId, [
    { name: "a.jpg", contentType: "image/jpeg" },
    { name: "b.jpg", contentType: "image/jpeg" },
  ]);
  const items = planned.filter(isPlanItem);
  assertEquals(items.length, 2);
  assert(items[0].key.startsWith(`event-photos/${eventId}/`));
  assert(items[0].key !== items[1].key, "keys must be unique per file");
  assert(!items[0].key.includes("a.jpg"), "must not use the original filename as the key");
});

Deno.test("planUploads rejects HEIC, unsupported types, and oversize files", () => {
  const eventId = "e";
  const planned = planUploads(eventId, [
    { name: "photo.heic", contentType: "image/heic" },
    { name: "doc.pdf", contentType: "application/pdf" },
    { name: "huge.jpg", contentType: "image/jpeg", size: MAX_IMAGE_BYTES + 1 },
    { name: "ok.png", contentType: "image/png", size: 1000 },
  ]);
  assert(!isPlanItem(planned[0]), "HEIC skipped");
  assert(!isPlanItem(planned[1]), "unsupported type skipped");
  assert(!isPlanItem(planned[2]), "oversize skipped");
  assert(isPlanItem(planned[3]), "valid png planned");
  assertEquals(planned.length, 4, "order + length preserved");
});

Deno.test("presign produces a valid SigV4 query-signed URL", async () => {
  Deno.env.set("AWS_ACCESS_KEY_ID", "AKIAIOSFODNN7EXAMPLE");
  Deno.env.set("AWS_SECRET_ACCESS_KEY", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
  Deno.env.set("AWS_REGION", "us-east-1");
  Deno.env.set("AWS_S3_BUCKET", "test-bucket");
  const { presignPut, presignGet } = await import("../_shared/s3.ts");

  const putUrl = await presignPut("event-photos/e/abc.jpg", 900);
  const u = new URL(putUrl);
  assertEquals(u.host, "test-bucket.s3.us-east-1.amazonaws.com");
  assertEquals(u.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assertEquals(u.searchParams.get("X-Amz-Expires"), "900");
  assertEquals(u.searchParams.get("X-Amz-SignedHeaders"), "host");
  assert(/^[0-9a-f]{64}$/.test(u.searchParams.get("X-Amz-Signature") || ""), "signature is 64 hex chars");

  const getUrl = await presignGet("event-photos/e/abc.jpg", 60);
  assertEquals(new URL(getUrl).searchParams.get("X-Amz-Expires"), "60");
});

Deno.test("region is extracted from a verbose AWS_REGION value", async () => {
  Deno.env.set("AWS_ACCESS_KEY_ID", "AKIAIOSFODNN7EXAMPLE");
  Deno.env.set("AWS_SECRET_ACCESS_KEY", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
  Deno.env.set("AWS_REGION", "Europe (London) eu-west-2");
  Deno.env.set("AWS_S3_BUCKET", "b");
  const { presignGet } = await import("../_shared/s3.ts");
  const url = await presignGet("event-photos/e/x.jpg");
  assertEquals(new URL(url).host, "b.s3.eu-west-2.amazonaws.com");
});
