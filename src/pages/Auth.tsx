import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { HomeButton } from "@/components/HomeButton";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

export default function Auth() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { display_name: name || email.split("@")[0] } },
        });
        if (error) throw error;
        toast.success(t("account_created"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate("/dashboard");
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

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-soft)" }}>
      <FloatingLanguageSwitcher />
      <HomeButton />
      <Card className="max-w-md w-full p-8 space-y-5" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="text-center">
          <Heart className="w-8 h-8 text-primary mx-auto fill-current" />
          <h1 className="text-2xl font-serif mt-2">{t("auth_title")}</h1>
          <p className="text-sm text-muted-foreground">{t("auth_subtitle")}</p>
        </div>

        <Button onClick={google} disabled={busy} variant="outline" className="w-full">
          {t("continue_google")}
        </Button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px bg-border flex-1" /> {t("or")} <div className="h-px bg-border flex-1" />
        </div>

        {mode === "signup" && (
          <Input placeholder={t("your_name")} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        )}
        <Input type="email" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <Input type="password" placeholder={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />

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
