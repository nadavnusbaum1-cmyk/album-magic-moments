import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSession, authedInvoke, authedFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, Image as ImageIcon, Settings, Trash2, ExternalLink, Copy, Loader2, CheckSquare, Square, Users, Star } from "lucide-react";
import { toast } from "sonner";
import { convertHeicIfNeeded } from "@/lib/imageUtils";

type Event = { id: string; name: string; slug: string; event_date: string | null; cover_image_url: string | null; cover_photo_id: string | null; is_published: boolean; show_people: boolean; show_all_photos: boolean; };
type Photo = { id: string; url: string; face_count: number; processed: boolean; processing_error?: string | null; uploaded_by: string | null; media_type?: string; source_label?: string | null; };

export default function EventAdmin() {
  const { id } = useParams();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [tab, setTab] = useState("upload");

  // Upload state
  const [files, setFiles] = useState<File[]>([]);
  const [uploaderName, setUploaderName] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0, skipped: 0 });

  // Gallery
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  useEffect(() => { if (!loading && !session) navigate("/auth"); }, [loading, session, navigate]);

  const loadEvent = async () => {
    if (!id) return;
    const { data, error } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
    if (error || !data) { toast.error("Event not found"); navigate("/dashboard"); return; }
    setEvent(data as Event);
  };

  const loadPhotos = async () => {
    if (!id) return;
    setLoadingPhotos(true);
    try {
      const data = await authedInvoke<{ photos: Photo[]; sources: string[] }>("admin-list-photos", {
        eventId: id, sourceLabel: filterSource === "all" ? undefined : filterSource,
      });
      setPhotos(data.photos); setSources(data.sources); setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setLoadingPhotos(false); }
  };

  useEffect(() => { if (session && id) loadEvent(); }, [session, id]);
  useEffect(() => { if (session && id && tab === "all") loadPhotos(); }, [session, id, tab, filterSource]);

  const upload = async () => {
    if (!files.length || !id) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length, errors: 0, skipped: 0 });
    let done = 0, errors = 0, skipped = 0;
    const BATCH = 20; // bigger batches = fewer round-trips
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const conv = await Promise.all(batch.map(async (f) => {
        try { return { ok: true as const, file: await convertHeicIfNeeded(f), original: f }; }
        catch { return { ok: false as const, original: f }; }
      }));
      const goodFiles = conv.filter((c) => c.ok).map((c) => c.file!);
      skipped += conv.length - goodFiles.length;
      if (goodFiles.length) {
        try {
          const data = await authedInvoke<{ uploads: { photoId: string; uploadUrl: string }[] }>("sign-s3-upload", {
            eventId: id,
            files: goodFiles.map((f) => ({ name: f.name, contentType: f.type || "image/jpeg" })),
            uploadedBy: uploaderName.trim() || null,
            sourceLabel: sourceLabel.trim() || null,
          });
          // Upload in parallel; do NOT await per-photo face processing — the cron picks them up.
          await Promise.all(data.uploads.map(async (u, idx) => {
            const file = goodFiles[idx];
            try {
              const r = await fetch(u.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
              if (!r.ok) throw new Error(`${r.status}`);
              // Fire-and-forget — don't block the upload pipeline
              authedInvoke("process-photo-now", { photoId: u.photoId }).catch(() => {});
            } catch (e) { console.error(file.name, e); errors++; }
          }));
        } catch (e) { errors += goodFiles.length; console.error(e); }
      }
      done += batch.length;
      setProgress({ done, total: files.length, errors, skipped });
    }
    if (skipped) toast.warning(`${skipped} HEIC file(s) skipped (couldn't convert).`);
    if (errors) toast.error(`${errors} upload(s) failed.`);
    const ok = done - errors - skipped;
    if (ok > 0) toast.success(`Uploaded ${ok} file${ok === 1 ? "" : "s"} 🎉 — face matching runs in the background.`);
    setFiles([]); setUploading(false);
  };

  const deletePhotos = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} photo${ids.length === 1 ? "" : "s"}?`)) return;
    try {
      const r = await authedFetch("delete-photos", { method: "POST", body: JSON.stringify({ photoIds: ids }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success(`Deleted ${j.deleted}`);
      setPhotos((p) => p.filter((x) => !ids.includes(x.id)));
      setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const updateEvent = async (patch: Partial<Event>) => {
    if (!id) return;
    try {
      const data = await authedInvoke<{ event: Event }>("update-event", { eventId: id, ...patch });
      setEvent(data.event); toast.success("Saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const publicUrl = event ? `${window.location.origin}/e/${event.slug}` : "";
  const copyPublic = async () => { await navigator.clipboard.writeText(publicUrl); toast.success("Link copied"); };

  if (loading || !event) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--gradient-soft)" }}>
      <div className="max-w-5xl mx-auto pt-2">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> All events
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-serif">{event.name}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <a href={publicUrl} target="_blank" rel="noreferrer" className="hover:text-primary inline-flex items-center gap-1">
                {publicUrl} <ExternalLink className="w-3 h-3" />
              </a>
              <button onClick={copyPublic} className="hover:text-primary"><Copy className="w-3 h-3" /></button>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md mb-6">
            <TabsTrigger value="upload" className="gap-2"><Upload className="w-4 h-4" /> Upload</TabsTrigger>
            <TabsTrigger value="all" className="gap-2"><ImageIcon className="w-4 h-4" /> Photos</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings className="w-4 h-4" /> Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <Card className="p-6 space-y-4">
              <Input placeholder="Photographer / source name (optional, e.g. Pro photographer, Guest cam)"
                value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} disabled={uploading} maxLength={60} />
              <Input placeholder="Uploader name (optional)" value={uploaderName} onChange={(e) => setUploaderName(e.target.value)} disabled={uploading} maxLength={60} />
              <label htmlFor="files" className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl p-10 cursor-pointer hover:border-primary bg-secondary/40">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{files.length ? `${files.length} file(s) selected` : "Drag &amp; drop or tap to choose photos / videos"}</span>
                <input id="files" type="file" accept="image/*,video/*,.heic,.heif" multiple className="hidden" disabled={uploading}
                  onChange={(e) => setFiles(Array.from(e.target.files || []))} />
              </label>
              {uploading && (
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Uploading {progress.done}/{progress.total}
                  {progress.errors ? ` · ${progress.errors} failed` : ""} {progress.skipped ? ` · ${progress.skipped} skipped` : ""}
                </div>
              )}
              <Button onClick={upload} disabled={!files.length || uploading} size="lg" className="w-full">
                {uploading ? "Processing…" : `Upload ${files.length || ""} file(s)`}
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="font-medium">{photos.length} photo{photos.length === 1 ? "" : "s"}</h2>
                <div className="flex gap-2 items-center flex-wrap">
                  {sources.length > 0 && (
                    <Select value={filterSource} onValueChange={setFilterSource}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="All sources" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {photos.length > 0 && (
                    <Button variant="outline" size="sm" className="gap-2"
                      onClick={() => selected.size === photos.length ? setSelected(new Set()) : setSelected(new Set(photos.map((p) => p.id)))}>
                      {selected.size === photos.length ? <Square className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                      {selected.size === photos.length ? "Clear" : "Select all"}
                    </Button>
                  )}
                  {selected.size > 0 && (
                    <Button variant="destructive" size="sm" className="gap-2" onClick={() => deletePhotos([...selected])}>
                      <Trash2 className="w-4 h-4" /> Delete {selected.size}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={loadPhotos} disabled={loadingPhotos}>
                    {loadingPhotos ? "…" : "Refresh"}
                  </Button>
                </div>
              </div>
              {loadingPhotos && photos.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
              ) : photos.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {photos.map((p) => {
                    const sel = selected.has(p.id);
                    const isCover = event.cover_photo_id === p.id;
                    return (
                      <div key={p.id} className={`relative group rounded-xl overflow-hidden bg-muted aspect-square cursor-pointer ring-2 transition-all ${sel ? "ring-primary" : isCover ? "ring-amber-400" : "ring-transparent"}`}
                        onClick={() => setSelected((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}>
                        {p.media_type === "video" ? (
                          <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                        ) : (
                          <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        )}
                        <div className="absolute top-1 left-1"><input type="checkbox" checked={sel} readOnly className="w-5 h-5 accent-primary" /></div>
                        {p.media_type !== "video" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateEvent({ cover_photo_id: isCover ? null : p.id }); }}
                            className={`absolute top-1 right-1 rounded-full p-1.5 shadow transition-opacity ${isCover ? "bg-amber-400 text-white opacity-100" : "bg-background/90 text-foreground opacity-0 group-hover:opacity-100"}`}
                            title={isCover ? "Current cover" : "Set as cover"}
                          >
                            <Star className={`w-4 h-4 ${isCover ? "fill-current" : ""}`} />
                          </button>
                        )}
                        <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between gap-1 pointer-events-none">
                          {p.source_label && <div className="bg-background/85 text-[10px] rounded-md px-1.5 py-0.5 truncate max-w-[60%]">{p.source_label}</div>}
                          <div className="bg-background/85 text-xs rounded-full px-2 py-0.5 flex items-center gap-1 ml-auto"><Users className="w-3 h-3" />{p.face_count}</div>
                        </div>
                        {!p.processed && <span className="absolute top-7 right-1 bg-amber-500/90 text-white text-[10px] px-1.5 rounded">indexing</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Event name</label>
                <Input defaultValue={event.name} onBlur={(e) => e.target.value !== event.name && updateEvent({ name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Event date</label>
                <Input type="date" defaultValue={event.event_date || ""} onChange={(e) => updateEvent({ event_date: e.target.value || null })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cover image URL</label>
                <Input defaultValue={event.cover_image_url || ""} placeholder="https://…"
                  onBlur={(e) => e.target.value !== (event.cover_image_url || "") && updateEvent({ cover_image_url: e.target.value || null })} />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div><div className="font-medium text-sm">Show "People" section</div><p className="text-xs text-muted-foreground">Browse-by-person tiles on the public album</p></div>
                <Switch checked={event.show_people} onCheckedChange={(v) => updateEvent({ show_people: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div><div className="font-medium text-sm">Show "All photos" section</div><p className="text-xs text-muted-foreground">Public grid of every photo</p></div>
                <Switch checked={event.show_all_photos} onCheckedChange={(v) => updateEvent({ show_all_photos: v })} />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div><div className="font-medium text-sm">Published</div><p className="text-xs text-muted-foreground">Public URL is live</p></div>
                <Switch checked={event.is_published} onCheckedChange={(v) => updateEvent({ is_published: v })} />
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
