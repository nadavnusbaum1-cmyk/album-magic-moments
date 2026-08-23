// Invoice4U clearing (payments) client. Docs: https://invoice4u.gitbook.io/invoice4u-docs
// WCF JSON API — HTTP stays 200 on failure, so we always inspect the Errors array.
// Config is env-driven so the whole flow is inert until the API key is set:
//   INVOICE4U_API_KEY   organization API key (GUID) — REQUIRED to enable payments
//   INVOICE4U_BASE_URL  service base (default production); QA = https://apiqa.invoice4u.co.il/Services/ApiService.svc
//   INVOICE4U_CC_TYPE   CreditCardCompanyType (default 15 = Cardcom)
//   INVOICE4U_QA_MODE   "true" to send IsQaMode on every request (QA testing)

const PROD_BASE = "https://api.invoice4u.co.il/Services/ApiService.svc";

export function i4uConfig() {
  const apiKey = Deno.env.get("INVOICE4U_API_KEY") || "";
  const baseUrl = (Deno.env.get("INVOICE4U_BASE_URL") || PROD_BASE).replace(/\/+$/, "");
  const ccType = Number(Deno.env.get("INVOICE4U_CC_TYPE") || "15"); // 15 = Cardcom
  const qaMode = (Deno.env.get("INVOICE4U_QA_MODE") || "").toLowerCase() === "true";
  return { apiKey, baseUrl, ccType, qaMode, configured: !!apiKey };
}

export interface ClearingError { ErrorCode?: number; ErrorMessage?: string }
export interface ClearingResult {
  Sum?: number;
  OrderIdClientUsage?: string;
  ClearingRedirectUrl?: string;
  PaymentId?: string;
  DocumentId?: string;
  DocumentNumber?: number;
  Errors?: ClearingError[];
}

// deno-lint-ignore no-explicit-any
export async function processClearing(request: Record<string, unknown>): Promise<ClearingResult> {
  const { baseUrl } = i4uConfig();
  const res = await fetch(`${baseUrl}/ProcessApiRequestV2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request }),
  });
  const text = await res.text();
  let parsed: any = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { throw new Error(`Invoice4U: non-JSON response [${res.status}]: ${text.slice(0, 300)}`); }
  const result: ClearingResult = parsed?.ProcessApiRequestV2Result ?? parsed ?? {};
  const errs = result.Errors || [];
  if (errs.length) {
    const e = errs[0];
    throw new Error(`Invoice4U error ${e.ErrorCode ?? "?"}: ${e.ErrorMessage ?? "clearing failed"}`);
  }
  return result;
}
