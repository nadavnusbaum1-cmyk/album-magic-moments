// Super-admin panel: users, plans, usage metrics, manual controls.
// Path: /admin (gated server-side to super_admin).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Users, CalendarDays, Image as ImageIcon, HardDrive, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession, authedFetch } from "@/lib/auth";
import { toast } from "sonner";

type UserRow = {
  id: string; email: string | null; display_name: string | null; created_at: string;
  phone: string | null; event_date: string | null; marketing_opt_in: boolean;
  plan: string; plan_status: string; plan_requested: string | null;
  photo_limit: number | null; event_limit: number | null; is_super_admin: boolean;
  event_count: number; photo_count: number; storage_bytes: number;
};
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : "—";
type Metrics = { users: number; events: number; photos: number; storage_bytes: number; pending: number; paid_active: number };

const PLANS = ["free", "small", "wedding", "business"];
const fmtBytes = (b: number) => b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`;

export default function AdminPanel() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => { if (!loading && !session) navigate("/auth"); }, [loading, session, navigate]);

  const load = async () => {
    setBusy(true);
    try {
      const r = await authedFetch("admin-list-users");
      if (r.status === 403 || r.status === 401) { setDenied(true); return; }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setUsers(j.users); setMetrics(j.metrics); setDenied(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (session) load(); }, [session]);

  const setPlan = async (userId: string, patch: Record<string, unknown>) => {
    try {
      const r = await authedFetch("admin-set-plan", { method: "POST", body: JSON.stringify({ userId, ...patch }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success("Updated");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  if (loading || (busy && !denied && !metrics)) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (denied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="w-8 h-8 text-muted-foreground" />
        <p className="text-muted-foreground">You don't have access to the admin panel.</p>
        <Link to="/dashboard" className="text-sm text-primary hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const statusColor = (s: string) => s === "active" ? "text-emerald-600" : s === "pending" ? "text-amber-600" : "text-red-600";

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--gradient-soft)" }}>
      <div className="max-w-6xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <h1 className="text-3xl font-serif mb-6">Admin</h1>

        {/* Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[
              { icon: Users, label: "Users", value: metrics.users, sub: `${metrics.pending} pending · ${metrics.paid_active} paid` },
              { icon: CalendarDays, label: "Events", value: metrics.events },
              { icon: ImageIcon, label: "Photos", value: metrics.photos.toLocaleString() },
              { icon: HardDrive, label: "Storage", value: fmtBytes(metrics.storage_bytes), sub: "S3 (from DB)" },
            ].map((m) => (
              <Card key={m.label} className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><m.icon className="w-4 h-4" /> {m.label}</div>
                <div className="text-2xl font-semibold mt-1">{m.value}</div>
                {m.sub && <div className="text-xs text-muted-foreground mt-0.5">{m.sub}</div>}
              </Card>
            ))}
          </div>
        )}

        {/* Users */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-medium">Users ({users.length})</h2>
            <Button variant="outline" size="sm" onClick={load} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-secondary/40">
                <tr className="text-start">
                  <th className="p-3 text-start font-medium">User</th>
                  <th className="p-3 text-start font-medium">Phone</th>
                  <th className="p-3 text-start font-medium">Created</th>
                  <th className="p-3 text-start font-medium">Event date</th>
                  <th className="p-3 text-start font-medium">Plan</th>
                  <th className="p-3 text-start font-medium">Status</th>
                  <th className="p-3 text-center font-medium">Subscribed</th>
                  <th className="p-3 text-end font-medium">Events</th>
                  <th className="p-3 text-end font-medium">Photos</th>
                  <th className="p-3 text-end font-medium">Storage</th>
                  <th className="p-3 text-start font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{u.email || u.display_name || u.id.slice(0, 8)}</div>
                      {u.is_super_admin && <span className="text-[10px] uppercase tracking-wide text-primary">super admin</span>}
                      {u.plan_requested && <div className="text-xs text-amber-600">requested: {u.plan_requested}</div>}
                    </td>
                    <td className="p-3 whitespace-nowrap">{u.phone || "—"}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDate(u.created_at)}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDate(u.event_date)}</td>
                    <td className="p-3">
                      <select value={u.plan} onChange={(e) => setPlan(u.id, { plan: e.target.value })}
                        className="border rounded-md px-2 py-1 bg-background text-sm">
                        {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {u.photo_limit == null ? "∞" : u.photo_limit} photos · {u.event_limit == null ? "∞" : u.event_limit} events
                      </div>
                    </td>
                    <td className={`p-3 font-medium ${statusColor(u.plan_status)}`}>{u.plan_status}</td>
                    <td className="p-3 text-center">{u.marketing_opt_in ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-end">{u.event_count}</td>
                    <td className="p-3 text-end">{u.photo_count.toLocaleString()}</td>
                    <td className="p-3 text-end">{fmtBytes(u.storage_bytes)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {u.plan_status !== "active" && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPlan(u.id, { plan_status: "active" })}>Activate</Button>}
                        {u.plan_status === "pending" && u.plan_requested && <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setPlan(u.id, { plan: u.plan_requested, plan_status: "active" })}>Approve {u.plan_requested}</Button>}
                        {u.plan_status !== "suspended" && !u.is_super_admin && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPlan(u.id, { plan_status: "suspended" })}>Suspend</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
