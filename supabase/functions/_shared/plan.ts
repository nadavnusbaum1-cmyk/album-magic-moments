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
