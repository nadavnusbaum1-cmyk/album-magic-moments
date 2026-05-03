import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSession, authedInvoke } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, LogOut, Calendar, Image as ImageIcon, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Event = {
  id: string; name: string; slug: string; event_date: string | null;
  cover_image_url: string | null; is_published: boolean; photo_count: number;
};

export default function Dashboard() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!loading && !session) navigate("/auth");
  }, [loading, session, navigate]);

  const load = async () => {
    setLoadingEvents(true);
    try {
      const data = await authedInvoke<{ events: Event[] }>("list-events");
      setEvents(data.events);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load events");
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
      toast.success("Event created");
      setShowForm(false); setName(""); setDate("");
      navigate(`/dashboard/event/${event.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate("/auth"); };

  if (loading || !session) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--gradient-soft)" }}>
      <div className="max-w-5xl mx-auto pt-6">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif">My Events</h1>
            <p className="text-sm text-muted-foreground">{session.user.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </header>

        {showForm ? (
          <Card className="p-6 mb-6 space-y-3">
            <h2 className="font-serif text-lg">New event</h2>
            <Input placeholder="Event name (e.g. Sara &amp; David Wedding)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={create} disabled={creating || !name.trim()}>{creating ? "Creating…" : "Create event"}</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </Card>
        ) : (
          <Button onClick={() => setShowForm(true)} className="mb-6 gap-2"><Plus className="w-4 h-4" /> New event</Button>
        )}

        {loadingEvents ? (
          <p className="text-muted-foreground text-center py-12">Loading…</p>
        ) : events.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">No events yet — create your first one ✨</Card>
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
                      <span className="absolute top-2 left-2 bg-background/90 text-xs rounded px-2 py-0.5">Draft</span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-serif text-lg truncate">{e.name}</h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        {e.event_date && <><Calendar className="w-3 h-3" /> {new Date(e.event_date).toLocaleDateString()}</>}
                      </span>
                      <span>{e.photo_count} photos</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center mt-12">
          Public album URL format: <code>/e/&lt;event-slug&gt;</code>
          <a href="/" className="ml-2 underline inline-flex items-center gap-1">home <ExternalLink className="w-3 h-3" /></a>
        </div>
      </div>
    </div>
  );
}
