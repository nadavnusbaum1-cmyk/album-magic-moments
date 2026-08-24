// Tiny wrapper around the SDK call. Pages should use `useSession`.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return { session, loading };
}

export async function authedInvoke<T = any>(name: string, body: any = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // supabase-js wraps any non-2xx response in a FunctionsHttpError whose
    // `.context` is the raw Response. Our functions return { error, code } in the
    // body (e.g. 403 event_limit / plan_pending), so read that out instead of
    // surfacing the generic "Edge Function returned a non-2xx status code".
    let message = error.message;
    let code: string | undefined;
    const ctx = (error as { context?: unknown }).context as Response | undefined;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        if (b?.error) message = b.error;
        code = b?.code;
      } catch { /* body wasn't JSON — keep the generic message */ }
    }
    const err = new Error(message) as Error & { code?: string };
    err.code = code;
    throw err;
  }
  if ((data as any)?.error) {
    const err = new Error((data as any).error) as Error & { code?: string };
    err.code = (data as any).code;
    throw err;
  }
  return data as T;
}

export async function authedFetch(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`);
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`, { ...init, headers });
}
