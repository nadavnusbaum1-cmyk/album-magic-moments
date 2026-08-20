import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { HomeButton } from "@/components/HomeButton";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { Mori } from "@/components/Mori";
import { useI18n } from "@/lib/i18n";

export default function Auth() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [marketing, setMarketing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [verifyEmailSent, setVerifyEmailSent] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              display_name: name || email.split("@")[0],
              phone: phone.trim() || null,
              event_date: eventDate || null,
              marketing_opt_in: marketing,
            },
          },
        });
        if (error) throw error;
        // Email confirmation ON → no session yet; user must verify via email.
        if (!data.session) { setVerifyEmailSent(true); return; }
        toast.success(t("account_created"));
        navigate("/dashboard");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/dashboard");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("auth_failed"));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success(t("email_resent"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("auth_failed"));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      // Native Supabase OAuth — redirects to Google, then back to /dashboard
      // where the session is picked up automatically (detectSessionInUrl).
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      // Browser redirects to Google now; nothing more to do here.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("google_failed"));
      setBusy(false);
    }
  };

  if (verifyEmailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-soft)" }}>
        <FloatingLanguageSwitcher />
        <HomeButton />
        <Card className="max-w-md w-full p-8 space-y-4 text-center" style={{ boxShadow: "var(--shadow-soft)" }}>
          <Mail className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-serif">{t("check_email_title")}</h1>
          <p className="text-sm text-muted-foreground">{t("check_email_desc", { email })}</p>
          <Button variant="outline" onClick={resend} disabled={busy} className="w-full">{t("resend_email")}</Button>
          <button onClick={() => { setVerifyEmailSent(false); setMode("signin"); }} className="text-xs text-muted-foreground hover:text-primary w-full">
            {t("back_to_signin")}
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-soft)" }}>
      <FloatingLanguageSwitcher />
      <HomeButton />
      <Card className="max-w-md w-full p-8 space-y-5" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="text-center">
          <Mori expression="waving" size={96} className="mx-auto" />
          <h1 className="text-2xl font-serif mt-1">{mode === "signin" ? t("auth_title") : t("auth_title_signup")}</h1>
          <p className="text-sm text-muted-foreground">{mode === "signin" ? t("auth_subtitle") : t("auth_subtitle_signup")}</p>
        </div>

        <Button onClick={google} disabled={busy} variant="outline" className="w-full">
          {t("continue_google")}
        </Button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px bg-border flex-1" /> {t("or")} <div className="h-px bg-border flex-1" />
        </div>

        {mode === "signup" && (
          <>
            <Input placeholder={t("your_name")} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
            <Input type="tel" placeholder={t("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
            <div>
              <label className="text-xs text-muted-foreground">{t("event_date_label")}</label>
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} disabled={busy} />
            </div>
          </>
        )}
        <Input type="email" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <Input type="password" placeholder={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />

        {mode === "signup" && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="accent-primary w-4 h-4" disabled={busy} />
            {t("marketing_opt_in_label")}
          </label>
        )}

        <Button onClick={submit} disabled={busy || !email || !password} className="w-full">
          {busy ? "…" : mode === "signin" ? t("sign_in") : t("create_account")}
        </Button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-xs text-muted-foreground hover:text-primary w-full text-center"
        >
          {mode === "signin" ? t("no_account") : t("have_account")}
        </button>
      </Card>
    </div>
  );
}
