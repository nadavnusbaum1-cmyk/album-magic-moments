// In-page checkout: opens the Invoice4U/Cardcom hosted page in an iframe modal
// (the page sends no X-Frame-Options, so it embeds) instead of redirecting away.
// Completion is confirmed by polling the payments row (readable by its owner via
// RLS) — the server-to-server callback is the source of truth — with the return
// page's postMessage as an immediate nudge.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { authedFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { X, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type StartResult = "started" | "unconfigured";

export function useCheckout() {
  const { t } = useI18n();
  const [st, setSt] = useState<{ url: string; orderId: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const cbRef = useRef<() => void>(() => {});

  const start = useCallback(
    async (kind: "plan" | "extra_event", plan: string, onPaid: () => void): Promise<StartResult> => {
      const c = await authedFetch("create-checkout", { method: "POST", body: JSON.stringify({ kind, plan }) });
      const cj = await c.json();
      if (c.ok && cj.redirectUrl) {
        cbRef.current = onPaid;
        setConfirming(false);
        setSt({ url: cj.redirectUrl, orderId: cj.orderId });
        return "started";
      }
      if (cj.code === "payments_unconfigured") return "unconfigured";
      throw new Error(cj.error || t("failed"));
    },
    [t],
  );

  const close = useCallback(() => { setSt(null); setConfirming(false); }, []);

  useEffect(() => {
    if (!st) return;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      const cb = cbRef.current;
      setSt(null);
      setConfirming(false);
      if (ok) cb();
      else toast.error(t("payment_failed_msg"));
    };
    const check = async () => {
      const { data } = await supabase.from("payments").select("status").eq("order_id", st.orderId).maybeSingle();
      const s = (data as { status?: string } | null)?.status;
      if (s === "paid") finish(true);
      else if (s === "failed") finish(false);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && (e.data as { heymoriCheckout?: string })?.heymoriCheckout) {
        setConfirming(true);
        check();
      }
    };
    window.addEventListener("message", onMsg);
    const iv = setInterval(() => { if (!done) check(); }, 2500);
    const to = setTimeout(() => clearInterval(iv), 180_000);
    return () => { window.removeEventListener("message", onMsg); clearInterval(iv); clearTimeout(to); };
  }, [st, t]);

  const modal = st
    ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3" onClick={close}>
          <div className="relative w-full max-w-[460px] rounded-2xl bg-background shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b">
              <span className="text-sm font-medium flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-primary" /> {t("secure_payment")}</span>
              <button onClick={close} className="text-muted-foreground hover:text-foreground" aria-label={t("cancel")}><X className="w-4 h-4" /></button>
            </div>
            <iframe src={st.url} title={t("secure_payment")} className="w-full" style={{ height: "72vh", maxHeight: 720, border: 0 }} />
            {confirming && (
              <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{t("confirming_payment")}</p>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return { start, modal, close };
}
