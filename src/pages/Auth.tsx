import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { HomeButton } from "@/components/HomeButton";

export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
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
        toast.success("Account created — you're in!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/dashboard` });
      if (result.error) throw new Error(result.error instanceof Error ? result.error.message : String(result.error));
      if (result.redirected) return;
      navigate("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-soft)" }}>
      <HomeButton />
      <Card className="max-w-md w-full p-8 space-y-5" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="text-center">
          <Heart className="w-8 h-8 text-primary mx-auto fill-current" />
          <h1 className="text-2xl font-serif mt-2">Host sign in</h1>
          <p className="text-sm text-muted-foreground">Manage your events &amp; albums</p>
        </div>

        <Button onClick={google} disabled={busy} variant="outline" className="w-full">
          Continue with Google
        </Button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px bg-border flex-1" /> or <div className="h-px bg-border flex-1" />
        </div>

        {mode === "signup" && (
          <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        )}
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />

        <Button onClick={submit} disabled={busy || !email || !password} className="w-full">
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-xs text-muted-foreground hover:text-primary w-full text-center"
        >
          {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
        </button>
      </Card>
    </div>
  );
}
