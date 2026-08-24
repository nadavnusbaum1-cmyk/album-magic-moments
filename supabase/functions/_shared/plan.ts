// Account plan helpers (SaaS tier gating).
import { svc } from "./auth.ts";

export interface Account {
  plan: string;
  plan_status: string;
  photo_limit: number | null;  // per-event photo cap; null = unlimited
  event_limit: number | null;  // max events; null = unlimited
  storage_days: number | null; // days photos are kept before auto-deletion; null = forever
}

// Default limits per plan. Used when (re)assigning a plan.
export const PLAN_LIMITS: Record<string, { photo: number | null; event: number | null; storage: number | null }> = {
  free: { photo: 50, event: 1, storage: 14 },
  small: { photo: 1000, event: 1, storage: 365 },
  wedding: { photo: 10000, event: 1, storage: 365 },
  business: { photo: null, event: null, storage: null },
};

// Server-side price list (NIS, VAT-INCLUSIVE gross — what the customer is charged)
// — the ONLY source of truth for charge amounts, so a client can't tamper with
// what it pays. The tax invoice breaks 18% VAT out of this. null = not self-serve.
export const PLAN_PRICES: Record<string, number | null> = {
  free: 0,
  small: 1, // TEMP: ₪1 for live payment testing — revert to 299 before launch
  wedding: 499,
  business: null,
};

const DEFAULT: Account = { plan: "free", plan_status: "active", photo_limit: 50, event_limit: 1, storage_days: 14 };

export async function getAccount(userId: string): Promise<Account> {
  const supabase = svc();
  const { data } = await supabase
    .from("profiles")
    .select("plan, plan_status, photo_limit, event_limit, storage_days")
    .eq("id", userId)
    .maybeSingle();
  return (data as Account) || DEFAULT;
}
