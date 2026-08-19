import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSession, authedInvoke } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, LogOut, Calendar, Image as ImageIcon, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { Mori } from "@/components/Mori";
import { useI18n } from "@/lib/i18n";

type Event = {
  id: string; name: string; slug: string; event_date: string | null;
  cover_image_url: string | null; is_published: boolean; photo_count: number;
};

export default function Dashboard() {
  const { t } = useI18n();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (!session) return;
    supabase.rpc("has_role", { _user_id: session.user.id, _role: "super_admin" })
      .then(({ data }) => setIsSuperAdmin(!!data));
  }, [session]);

  // New users pick a plan first.
  useEffect(() => {
    if (!session) return;
    supabase.from("profiles").select("onboarded").eq("id", session.user.id).maybeSingle()
      .then(({ data }) => {
        const p = data as unknown as { onboarded?: boolean } | null;
        if (p && p.onboarded === false) navigate("/plan");
      });
  }, [session, navigate]);

  useEffect(() => {
    if (!loading && !session) navigate("/auth");
  }, [loading, session, navigate]);

  const load = async () => {
    setLoadingEvents(true);
    try {
      const data = await authedInvoke<{ events: Event[] }>("list-events");
      setEvents(data.events);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed_load_events"));
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => { if (session) load(); }, [session]);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { event } = await authedInvoke<{ event: Event }>("create-event", { name, event_date: date || null });
      toast.success(t("event_created"));
      setShowForm(false); setName(""); setDate("");
      navigate(`/dashboard/event/${event.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setCreating(false);
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate("/auth"); };

  if (loading || !session) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--gradient-soft)" }}>
      <FloatingLanguageSwitcher />
      <div className="max-w-5xl mx-auto pt-6">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif">{t("my_events")}</h1>
            <p className="text-sm text-muted-foreground">{session.user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/admin"><ShieldCheck className="w-4 h-4" /> Admin</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="w-4 h-4" /> {t("sign_out")}
            </Button>
          </div>
        </header>

        {showForm ? (
          <Card className="p-6 mb-6 space-y-3">
            <h2 className="font-serif text-lg">{t("new_event")}</h2>
            <Input placeholder={t("event_name_placeholder")} value={name} onChange={(e) => setName(e.target.value)} />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={create} disabled={creating || !name.trim()}>{creating ? t("creating") : t("create_event")}</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
            </div>
          </Card>
        ) : (
          <Button onClick={() => setShowForm(true)} className="mb-6 gap-2"><Plus className="w-4 h-4" /> {t("new_event")}</Button>
        )}

        {loadingEvents ? (
          <p className="text-muted-foreground text-center py-12">{t("loading")}</p>
        ) : events.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            <Mori expression="thinking" size={96} className="mx-auto mb-3" />
            <p>{t("no_events")}</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((e) => (
              <Link to={`/dashboard/event/${e.id}`} key={e.id}>
                <Card className="overflow-hidden hover:shadow-lg transition-shadow group">
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    {e.cover_image_url ? (
                      <img src={e.cover_image_url} alt={e.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="w-10 h-10" />
                      </div>
                    )}
                    {!e.is_published && (
                      <span className="absolute top-2 start-2 bg-background/90 text-xs rounded px-2 py-0.5">{t("draft")}</span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-serif text-lg truncate">{e.name}</h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        {e.event_date && <><Calendar className="w-3 h-3" /> {new Date(e.event_date).toLocaleDateString()}</>}
                      </span>
                      <span>{e.photo_count} {t("photos_count")}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center mt-12">
          {t("public_url_format")} <code>/e/&lt;event-slug&gt;</code>
          <a href="/" className="ms-2 underline inline-flex items-center gap-1">{t("home")} <ExternalLink className="w-3 h-3" /></a>
        </div>
      </div>
    </div>
  );
}
