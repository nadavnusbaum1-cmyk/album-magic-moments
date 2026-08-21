// Public contact form → posts to the `contact` edge function (Resend → inbox).
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Mori } from "@/components/Mori";
import { useI18n } from "@/lib/i18n";

export function ContactForm({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const valid = name.trim() && email.trim() && message.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("contact", { body: { name, email, phone, message } });
      if (error || (data && (data as { error?: string }).error)) throw new Error("failed");
      setSent(true); // replace the form with a confirmation
    } catch {
      toast.error(t("contact_fail"));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className={`text-center w-full max-w-md mx-auto py-4 ${className}`}>
        <Mori expression="celebrating" size={104} className="mx-auto mb-3" />
        <p className="font-medium text-lg">{t("contact_sent")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`space-y-3 w-full max-w-md mx-auto text-start ${className}`}>
      <Input placeholder={t("your_name")} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      <Input type="email" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
      <Input type="tel" placeholder={t("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
      <textarea
        placeholder={t("contact_msg_placeholder")}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={busy}
        rows={4}
        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
      <Button type="submit" disabled={busy || !valid} className="w-full">
        {busy ? t("sending") : t("contact_send")}
      </Button>
    </form>
  );
}
