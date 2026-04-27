import { ensureCollection, rekognition, COLLECTION_ID } from "../_shared/rekognition.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const result: Record<string, unknown> = {};

  try {
    const accessKey = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
    const secretKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
    const rawRegion = Deno.env.get("AWS_REGION") || "";

    result.env = {
      hasAccessKey: !!accessKey,
      accessKeyPrefix: accessKey.slice(0, 4),
      accessKeyLength: accessKey.length,
      hasSecretKey: !!secretKey,
      secretKeyLength: secretKey.length,
      rawRegion,
      parsedRegion: rawRegion.match(/[a-z]{2}-[a-z]+-\d/)?.[0] || rawRegion.trim(),
    };

    try {
      await ensureCollection();
      result.ensureCollection = "OK";
    } catch (e) {
      result.ensureCollection = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
    }

    try {
      const list = await rekognition("ListCollections", {});
      result.listCollections = list;
    } catch (e) {
      result.listCollections = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
    }

    try {
      const desc = await rekognition("DescribeCollection", { CollectionId: COLLECTION_ID });
      result.describeCollection = desc;
    } catch (e) {
      result.describeCollection = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
