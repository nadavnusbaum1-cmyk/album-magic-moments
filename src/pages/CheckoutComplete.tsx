// Invoice4U ReturnUrl target. Cardcom redirects the customer here after payment.
// It normally loads INSIDE our checkout iframe/popup — so it just signals the
// opener and closes. If it ever loads top-level (e.g. a browser blocked the
// embed), it falls back to the dashboard.
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Mori } from "@/components/Mori";
import { useI18n } from "@/lib/i18n";

export default function CheckoutComplete() {
  const { t } = useI18n();
  useEffect(() => {
    const embedded = window.parent && window.parent !== window;
    const popup = !!window.opener && window.opener !== window;
    if (embedded || popup) {
      const target = (embedded ? window.parent : window.opener) as Window;
      try { target.postMessage({ heymoriCheckout: "done" }, window.location.origin); } catch { /* ignore */ }
      if (popup) setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 300);
    } else {
      // Loaded as a normal page — nothing is listening; go home.
      setTimeout(() => { window.location.replace("/dashboard"); }, 1200);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center" style={{ background: "var(--gradient-soft)" }}>
      <Mori expression="celebrating" size={96} />
      <p className="font-serif text-lg">{t("payment_complete")}</p>
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}
