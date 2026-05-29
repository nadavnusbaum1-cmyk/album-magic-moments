import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSession, authedInvoke, authedFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Upload, Image as ImageIcon, Settings, Trash2, ExternalLink, Copy, Loader2, CheckSquare, Square, Users, Star, RefreshCw, Plus, X, EyeOff, Eye, FolderOpen, AlertTriangle, Pencil, Download, MessageCircle, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { prepareImageForUpload } from "@/lib/imageUtils";
import { saveManyToGallery, isAbortError, isMobile } from "@/lib/download";
import { useI18n, Lang } from "@/lib/i18n";

type Event = { id: string; name: string; slug: string; event_date: string | null; cover_image_url: string | null; cover_photo_id: string | null; is_published: boolean; show_people: boolean; show_all_photos: boolean; allow_guest_uploads: boolean; };
type Photo = { id: string; url: string; face_count: number; processed: boolean; processing_error?: string | null; uploaded_by: string | null; media_type?: string; source_label?: string | null; created_at?: string; };
type Cluster = { id: string; cover_url: string | null; photo_count: number; display_name: string | null; hidden?: boolean };
type ClusterPhoto = { id: string; url: string; media_type?: string };
type Source = { label: string; count: number };

const NEW_FOLDER = "__new__";

export default function EventAdmin() {
  const { id } = useParams();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [event, setEvent] = useState<Event | null>(null);
  const [tab, setTab] = useState("upload");
  const [coverUploading, setCoverUploading] = useState(false);

  // Upload
  const [files, setFiles] = useState<File[]>([]);
  const [uploaderName, setUploaderName] = useState("");
  const [folderChoice, setFolderChoice] = useState<string>("");
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0, skipped: 0 });

  // Gallery
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosCursor, setPhotosCursor] = useState<string | null>(null);
  const [photosTotals, setPhotosTotals] = useState({ total: 0, processed: 0, pending: 0, review: 0 });
  const [sources, setSources] = useState<Source[]>([]);
  const [filterSource, setFilterSource] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);

  // Review
  const [reviewPhotos, setReviewPhotos] = useState<Photo[]>([]);
  const [reviewCursor, setReviewCursor] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  // Folder management dialog
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; from: string; to: string }>({ open: false, from: "", to: "" });

  // Reprocess
  const [reprocessing, setReprocessing] = useState(false);

  // People
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clustersLoading, setClustersLoading] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null);
  const [editingClusterPhotos, setEditingClusterPhotos] = useState<ClusterPhoto[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPhotos, setPickerPhotos] = useState<Photo[]>([]);
  const [pickerCursor, setPickerCursor] = useState<string | null>(null);
  const [pickerSel, setPickerSel] = useState<Set<string>>(new Set());

  // Share / WhatsApp
  const [waFrom, setWaFrom] = useState("");
  const [waNumbers, setWaNumbers] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waResult, setWaResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);

  useEffect(() => { if (!loading && !session) navigate("/auth"); }, [loading, session, navigate]);

  useEffect(() => {
    const f = localStorage.getItem("wa:from");
    if (f) setWaFrom(f);
  }, []);

  // Restore last folder per event
  useEffect(() => {
    if (!id) return;
    const last = localStorage.getItem(`folder:${id}`);
    if (last) setFolderChoice(last);
  }, [id]);

  const loadEvent = async () => {
    if (!id) return;
    const { data, error } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
    if (error || !data) { toast.error(t("event_not_found")); navigate("/dashboard"); return; }
    setEvent(data as Event);
  };

  const loadPhotos = async (before?: string) => {
    if (!id) return;
    if (before) setLoadingMore(true); else setLoadingPhotos(true);
    try {
      const data = await authedInvoke<{ photos: Photo[]; sources: Source[]; nextCursor: string | null; totals?: typeof photosTotals }>(
        "admin-list-photos",
        { eventId: id, sourceLabel: filterSource === "all" ? undefined : filterSource, before, limit: 60 },
      );
      if (before) {
        setPhotos((prev) => [...prev, ...data.photos]);
      } else {
        setPhotos(data.photos);
        if (data.sources) setSources(data.sources);
        if (data.totals) setPhotosTotals(data.totals);
        setSelected(new Set());
      }
      setPhotosCursor(data.nextCursor);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
    finally { setLoadingPhotos(false); setLoadingMore(false); }
  };

  const loadReview = async (before?: string) => {
    if (!id) return;
    setReviewLoading(true);
    try {
      const data = await authedInvoke<{ photos: Photo[]; nextCursor: string | null; totals?: typeof photosTotals }>(
        "admin-list-photos",
        { eventId: id, review: true, before, limit: 60 },
      );
      if (before) setReviewPhotos((p) => [...p, ...data.photos]);
      else { setReviewPhotos(data.photos); if (data.totals) setPhotosTotals(data.totals); }
      setReviewCursor(data.nextCursor);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
    finally { setReviewLoading(false); }
  };

  const loadClusters = async () => {
    if (!event) return;
    setClustersLoading(true);
    try {
      const r = await authedFetch("list-clusters", { method: "POST", body: JSON.stringify({ eventSlug: event.slug }) });
      const j = await r.json();
      if (r.ok) setClusters(j.clusters || []);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
    finally { setClustersLoading(false); }
  };

  useEffect(() => { if (session && id) loadEvent(); }, [session, id]);
  useEffect(() => { if (session && id && tab === "all") loadPhotos(); }, [session, id, tab, filterSource]);
  useEffect(() => { if (session && event && tab === "people") loadClusters(); }, [session, event, tab]);
  useEffect(() => { if (session && id && tab === "review") loadReview(); }, [session, id, tab]);

  const folderForUpload = folderChoice === NEW_FOLDER ? newFolderName.trim() : folderChoice.trim();

  const upload = async () => {
    if (!files.length || !id) return;
    if (!folderForUpload) { toast.error(t("pick_folder_first")); return; }
    localStorage.setItem(`folder:${id}`, folderChoice === NEW_FOLDER ? folderForUpload : folderChoice);
    setUploading(true);
    setProgress({ done: 0, total: files.length, errors: 0, skipped: 0 });
    let done = 0, errors = 0, skipped = 0;
    const BATCH = 20;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const conv = await Promise.all(batch.map(async (f) => {
        try { return { ok: true as const, file: await prepareImageForUpload(f), original: f }; }
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
            sourceLabel: folderForUpload,
          });
          await Promise.all(data.uploads.map(async (u, idx) => {
            const file = goodFiles[idx];
            try {
              const r = await fetch(u.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
              if (!r.ok) throw new Error(`${r.status}`);
              authedInvoke("process-photo-now", { photoId: u.photoId }).catch(() => {});
            } catch (e) { console.error(file.name, e); errors++; }
          }));
        } catch (e) { errors += goodFiles.length; console.error(e); }
      }
      done += batch.length;
      setProgress({ done, total: files.length, errors, skipped });
    }
    if (skipped) toast.warning(t("heic_skipped", { n: skipped }));
    if (errors) toast.error(t("uploads_failed", { n: errors }));
    const ok = done - errors - skipped;
    if (ok > 0) toast.success(t("upload_success", { n: ok }));
    setFiles([]); setUploading(false);
    if (folderChoice === NEW_FOLDER) { setFolderChoice(folderForUpload); setNewFolderName(""); }
  };

  const deletePhotos = async (ids: string[], from: "all" | "review" = "all") => {
    if (!ids.length) return;
    if (!confirm(t("confirm_delete", { n: ids.length }))) return;
    try {
      const r = await authedFetch("delete-photos", { method: "POST", body: JSON.stringify({ photoIds: ids }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("failed"));
      toast.success(t("deleted_n", { n: j.deleted }));
      if (from === "all") { setPhotos((p) => p.filter((x) => !ids.includes(x.id))); setSelected(new Set()); }
      else setReviewPhotos((p) => p.filter((x) => !ids.includes(x.id)));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const skipReviewPhotos = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const r = await authedFetch("skip-review-photos", { method: "POST", body: JSON.stringify({ photoIds: ids }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("failed"));
      toast.success(t("skipped_n", { n: ids.length }));
      setReviewPhotos((p) => p.filter((x) => !ids.includes(x.id)));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const setClusterCover = async (photoId: string) => {
    if (!editingCluster) return;
    try {
      await authedFetch("update-cluster", { method: "POST", body: JSON.stringify({ clusterId: editingCluster.id, coverPhotoId: photoId }) });
      toast.success(t("cover_updated"));
      loadClusters();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const reindexPhoto = async (photoId: string) => {
    try {
      await authedInvoke("process-photo-now", { photoId });
      toast.success(t("reindex_started"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const reindexAllReview = async () => {
    if (!reviewPhotos.length) return;
    toast.info(t("reindexing_n", { n: reviewPhotos.length }));
    let ok = 0;
    for (const p of reviewPhotos) {
      try { await authedInvoke("process-photo-now", { photoId: p.id }); ok++; } catch { /* ignore */ }
    }
    toast.success(t("reindex_triggered", { n: ok }));
    setTimeout(() => loadReview(), 2000);
  };

  const updateEvent = async (patch: Partial<Event>) => {
    if (!id) return;
    try {
      const data = await authedInvoke<{ event: Event }>("update-event", { eventId: id, ...patch });
      setEvent(data.event); toast.success(t("saved"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const uploadCover = async (file: File) => {
    if (!id) return;
    setCoverUploading(true);
    try {
      const fd = new FormData();
      fd.append("eventId", id);
      fd.append("file", file);
      const r = await authedFetch("upload-cover", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("failed"));
      setEvent(j.event);
      toast.success(t("cover_uploaded"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("upload_failed")); }
    finally { setCoverUploading(false); }
  };


  const reprocess = async () => {
    if (!id) return;
    if (!confirm(t("reprocess_confirm"))) return;
    setReprocessing(true);
    try {
      const r = await authedFetch("reprocess-event", { method: "POST", body: JSON.stringify({ eventId: id, mode: "all" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("failed"));
      toast.success(t("reprocessed", { processed: j.processed, total: j.total }));
      if (tab === "all") loadPhotos();
      if (tab === "people") loadClusters();
      if (tab === "review") loadReview();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
    finally { setReprocessing(false); }
  };

  const renameOrDeleteFolder = async (action: "rename" | "delete") => {
    if (!id || !folderDialog.from) return;
    const to = action === "delete" ? null : folderDialog.to.trim();
    if (action === "rename" && !to) return toast.error(t("folder_rename_required"));
    if (action === "delete" && !confirm(t("folder_unfile_confirm", { name: folderDialog.from }))) return;
    try {
      const r = await authedFetch("rename-source", { method: "POST", body: JSON.stringify({ eventId: id, from: folderDialog.from, to }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("failed"));
      toast.success(t("folder_updated", { n: j.updated }));
      setFolderDialog({ open: false, from: "", to: "" });
      if (filterSource === folderDialog.from) setFilterSource("all");
      loadPhotos();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const openClusterEditor = async (c: Cluster) => {
    setEditingCluster(c);
    setEditingClusterPhotos([]);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-photos?id=${c.id}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
      const j = await r.json();
      if (r.ok) setEditingClusterPhotos(j.photos || []);
    } catch { toast.error(t("failed")); }
  };

  const removePhotosFromCluster = async (photoIds: string[]) => {
    if (!editingCluster || !photoIds.length) return;
    try {
      await authedFetch("update-cluster", { method: "POST", body: JSON.stringify({ clusterId: editingCluster.id, removePhotoIds: photoIds }) });
      setEditingClusterPhotos((p) => p.filter((x) => !photoIds.includes(x.id)));
      toast.success(t("removed"));
      loadClusters();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const renameCluster = async (name: string) => {
    if (!editingCluster) return;
    try {
      await authedFetch("update-cluster", { method: "POST", body: JSON.stringify({ clusterId: editingCluster.id, displayName: name || null }) });
      setEditingCluster({ ...editingCluster, display_name: name });
      toast.success(t("renamed"));
      loadClusters();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const toggleClusterHidden = async (c: Cluster) => {
    try {
      await authedFetch("update-cluster", { method: "POST", body: JSON.stringify({ clusterId: c.id, hidden: !c.hidden }) });
      loadClusters();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setPickerSel(new Set());
    if (!id) return;
    try {
      const data = await authedInvoke<{ photos: Photo[]; nextCursor: string | null }>("admin-list-photos", { eventId: id, limit: 60 });
      setPickerPhotos(data.photos);
      setPickerCursor(data.nextCursor);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const loadMorePicker = async () => {
    if (!id || !pickerCursor) return;
    try {
      const data = await authedInvoke<{ photos: Photo[]; nextCursor: string | null }>("admin-list-photos", { eventId: id, limit: 60, before: pickerCursor });
      setPickerPhotos((p) => [...p, ...data.photos]);
      setPickerCursor(data.nextCursor);
    } catch { /* ignore */ }
  };

  const addPickedPhotos = async () => {
    if (!editingCluster || !pickerSel.size) return;
    try {
      await authedFetch("update-cluster", { method: "POST", body: JSON.stringify({ clusterId: editingCluster.id, addPhotoIds: [...pickerSel] }) });
      toast.success(t("added_n", { n: pickerSel.size }));
      setPickerOpen(false);
      openClusterEditor(editingCluster);
      loadClusters();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const publicUrl = event ? `${window.location.origin}/e/${event.slug}` : "";
  const copyPublic = async () => { await navigator.clipboard.writeText(publicUrl); toast.success(t("link_copied")); };

  useEffect(() => {
    if (event && !waMessage) {
      setWaMessage(t("msg_default", { event: event.name, url: `${window.location.origin}/e/${event.slug}` }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, lang]);

  const sendWhatsApp = async () => {
    if (!event) return;
    const list = waNumbers.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error(t("add_number")); return; }
    if (!waFrom.trim()) { toast.error(t("enter_twilio_number")); return; }
    if (!waMessage.trim()) { toast.error(t("msg_empty")); return; }
    localStorage.setItem("wa:from", waFrom.trim());
    setWaSending(true);
    setWaResult(null);
    try {
      const res = await authedInvoke<{ sent: number; failed: number; skipped: number }>(
        "send-whatsapp",
        { eventId: event.id, from: waFrom.trim(), message: waMessage, numbers: list },
      );
      setWaResult(res);
      toast.success(t("sent_summary", { sent: res.sent, failed: res.failed, skipped: res.skipped }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("send_failed"));
    } finally {
      setWaSending(false);
    }
  };


  const folderOptions = useMemo(() => sources.map((s) => s.label), [sources]);

  if (loading || !event) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--gradient-soft)" }}>
      <div className="max-w-5xl mx-auto pt-2">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("all_events")}
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
          <TabsList className="grid grid-cols-6 w-full max-w-3xl mb-6">
            <TabsTrigger value="upload" className="gap-2"><Upload className="w-4 h-4" /> {t("upload")}</TabsTrigger>
            <TabsTrigger value="all" className="gap-2"><ImageIcon className="w-4 h-4" /> {t("photos")}</TabsTrigger>
            <TabsTrigger value="review" className="gap-2 relative"><AlertTriangle className="w-4 h-4" /> {t("review")}{photosTotals.review > 0 && <span className="ml-1 text-xs bg-amber-500 text-white rounded-full px-1.5">{photosTotals.review}</span>}</TabsTrigger>
            <TabsTrigger value="people" className="gap-2"><Users className="w-4 h-4" /> {t("people")}</TabsTrigger>
            <TabsTrigger value="share" className="gap-2"><MessageCircle className="w-4 h-4" /> {t("share")}</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings className="w-4 h-4" /> {t("settings")}</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <Card className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2"><FolderOpen className="w-4 h-4" /> {t("folder")} *</label>
                <p className="text-xs text-muted-foreground">{t("folder_hint")}</p>
                <Select value={folderChoice} onValueChange={(v) => setFolderChoice(v)} disabled={uploading}>
                  <SelectTrigger><SelectValue placeholder={t("pick_folder")} /></SelectTrigger>
                  <SelectContent>
                    {folderOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    <SelectItem value={NEW_FOLDER}>{t("new_folder")}</SelectItem>
                  </SelectContent>
                </Select>
                {folderChoice === NEW_FOLDER && (
                  <Input autoFocus placeholder={t("new_folder_placeholder")} value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)} disabled={uploading} maxLength={60} />
                )}
              </div>
              <Input placeholder={t("uploader_name_optional")} value={uploaderName} onChange={(e) => setUploaderName(e.target.value)} disabled={uploading} maxLength={60} />
              <label htmlFor="files" className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl p-8 cursor-pointer hover:border-primary bg-secondary/40">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground text-center">
                  {files.length ? t("files_ready", { n: files.length }) : t("tap_to_choose")}
                </span>
                <input id="files" type="file" accept="image/*,video/*,.heic,.heif" multiple className="hidden" disabled={uploading}
                  onChange={(e) => setFiles(Array.from(e.target.files || []))} />
              </label>

              {uploading && (
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("upload_progress", { done: progress.done, total: progress.total })}
                  {progress.errors ? ` · ${t("uploads_failed", { n: progress.errors })}` : ""} {progress.skipped ? ` · ${t("heic_skipped", { n: progress.skipped })}` : ""}
                </div>
              )}
              <Button onClick={upload} disabled={!files.length || uploading || !folderForUpload} size="lg" className="w-full">
                {uploading ? t("processing") : `${t("upload_files", { n: files.length || "" })}${folderForUpload ? ` ${t("upload_to", { folder: folderForUpload })}` : ""}`}
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="font-medium">{t("n_photos", { n: photosTotals.total || photos.length })}</h2>
                  {photosTotals.pending > 0 && <p className="text-xs text-amber-600">{t("still_indexing", { n: photosTotals.pending })}</p>}
                  {photosTotals.review > 0 && <p className="text-xs text-amber-600">{t("need_review", { n: photosTotals.review })}</p>}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  {sources.length > 0 && (
                    <>
                      <Select value={filterSource} onValueChange={setFilterSource}>
                        <SelectTrigger className="w-48"><SelectValue placeholder={t("all_folders")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("all_folders")} ({photosTotals.total})</SelectItem>
                          {sources.map((s) => <SelectItem key={s.label} value={s.label}>{s.label} ({s.count})</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {filterSource !== "all" && (
                        <Button variant="ghost" size="sm" className="gap-1" onClick={() => setFolderDialog({ open: true, from: filterSource, to: filterSource })}>
                          <Pencil className="w-3.5 h-3.5" /> {t("edit_folder")}
                        </Button>
                      )}
                    </>
                  )}
                  {photos.length > 0 && (
                    <Button variant="outline" size="sm" className="gap-2"
                      onClick={() => selected.size === photos.length ? setSelected(new Set()) : setSelected(new Set(photos.map((p) => p.id)))}>
                      {selected.size === photos.length ? <Square className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                      {selected.size === photos.length ? t("clear") : t("select_all")}
                    </Button>
                  )}
                  {selected.size > 0 && (
                    <>
                      <Button variant="destructive" size="sm" className="gap-2" onClick={() => deletePhotos([...selected])}>
                        <Trash2 className="w-4 h-4" /> {t("delete")} {selected.size}
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" disabled={!!zipping}
                        onClick={async () => {
                          const items = photos.filter((p) => selected.has(p.id) && p.media_type !== "video").map((p, i) => ({ url: p.url, name: `${event.slug}-${i + 1}.jpg` }));
                          if (!items.length) { toast.error(t("no_images_selected")); return; }
                          setZipping({ done: 0, total: items.length });
                          try {
                            await saveManyToGallery(items, `${event.slug}-selected.zip`, (d, tt) => setZipping({ done: d, total: tt }));
                            toast.success(isMobile() ? t("saved_to_gallery") : t("download_ready"));
                          } catch (error) { if (!isAbortError(error)) toast.error(error instanceof Error ? error.message : t("download_failed")); }
                          finally { setZipping(null); }
                        }}>
                        {zipping ? <><Loader2 className="w-4 h-4 animate-spin" /> {zipping.done}/{zipping.total}</> : <><Download className="w-4 h-4" /> {t("download_n", { n: selected.size })}</>}
                      </Button>
                    </>
                  )}
                  {photos.length > 0 && selected.size === 0 && (
                    <Button variant="outline" size="sm" className="gap-2" disabled={!!zipping}
                      onClick={async () => {
                        const items = photos.filter((p) => p.media_type !== "video").map((p, i) => ({ url: p.url, name: `${event.slug}-${i + 1}.jpg` }));
                        if (!items.length) { toast.error(t("no_images_to_download")); return; }
                        setZipping({ done: 0, total: items.length });
                        try {
                          await saveManyToGallery(items, `${event.slug}-photos.zip`, (d, tt) => setZipping({ done: d, total: tt }));
                          toast.success(isMobile() ? t("saved_to_gallery") : t("download_ready"));
                        } catch (error) { if (!isAbortError(error)) toast.error(error instanceof Error ? error.message : t("download_failed")); }
                        finally { setZipping(null); }
                      }}>
                      {zipping ? <><Loader2 className="w-4 h-4 animate-spin" /> {zipping.done}/{zipping.total}</> : <><Download className="w-4 h-4" /> {t("download_all")}</>}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => loadPhotos()} disabled={loadingPhotos}>
                    {loadingPhotos ? "…" : t("refresh")}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={reprocess} disabled={reprocessing} className="gap-2">
                    {reprocessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {t("rerun_face_matching")}
                  </Button>
                </div>
              </div>
              {loadingPhotos && photos.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{t("loading")}</p>
              ) : photos.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{t("no_photos_yet")}</p>
              ) : (
                <>
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
                          <div className="absolute top-1 start-1"><input type="checkbox" checked={sel} readOnly className="w-5 h-5 accent-primary" /></div>
                          {p.media_type !== "video" && (
                            <button onClick={(e) => { e.stopPropagation(); updateEvent({ cover_photo_id: isCover ? null : p.id }); }}
                              className={`absolute top-1 end-1 rounded-full p-1.5 shadow transition-opacity ${isCover ? "bg-amber-400 text-white opacity-100" : "bg-background/90 text-foreground opacity-0 group-hover:opacity-100"}`}
                              title={isCover ? t("current_cover") : t("set_as_cover")}>
                              <Star className={`w-4 h-4 ${isCover ? "fill-current" : ""}`} />
                            </button>
                          )}
                          <div className="absolute bottom-1 start-1 end-1 flex items-end justify-between gap-1 pointer-events-none">
                            {p.source_label && <div className="bg-background/85 text-[10px] rounded-md px-1.5 py-0.5 truncate max-w-[60%]">{p.source_label}</div>}
                            <div className="bg-background/85 text-xs rounded-full px-2 py-0.5 flex items-center gap-1 ms-auto"><Users className="w-3 h-3" />{p.face_count}</div>
                          </div>
                          {!p.processed && <span className="absolute top-7 end-1 bg-amber-500/90 text-white text-[10px] px-1.5 rounded">{t("indexing_label")}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {photosCursor && (
                    <div className="text-center mt-6">
                      <Button variant="outline" onClick={() => loadPhotos(photosCursor)} disabled={loadingMore}>
                        {loadingMore ? t("loading") : t("load_more")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="review">
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="font-medium">{t("review_title")}</h2>
                  <p className="text-xs text-muted-foreground">{t("review_desc")}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => loadReview()} disabled={reviewLoading}>{reviewLoading ? "…" : t("refresh")}</Button>
                  <Button variant="secondary" size="sm" className="gap-2" onClick={reindexAllReview} disabled={!reviewPhotos.length}>
                    <RefreshCw className="w-4 h-4" /> {t("reindex_all")}
                  </Button>
                </div>
              </div>
              {reviewLoading && reviewPhotos.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{t("loading")}</p>
              ) : reviewPhotos.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{t("review_all_done")}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {reviewPhotos.map((p) => (
                      <div key={p.id} className="relative group rounded-xl overflow-hidden bg-muted aspect-square">
                        {p.media_type === "video" ? <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" /> : <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                        {p.processing_error && <div className="absolute top-1 start-1 end-1 bg-destructive/90 text-destructive-foreground text-[10px] rounded px-1.5 py-0.5 truncate">⚠ {p.processing_error}</div>}
                        <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/80 to-transparent">
                          <Button size="sm" variant="secondary" className="flex-1 h-7 text-xs gap-1" onClick={() => reindexPhoto(p.id)}>
                            <RefreshCw className="w-3 h-3" /> {t("reindex")}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2" title={t("skip")} onClick={() => skipReviewPhotos([p.id])}>
                            <EyeOff className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => deletePhotos([p.id], "review")}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {reviewCursor && (
                    <div className="text-center mt-6">
                      <Button variant="outline" onClick={() => loadReview(reviewCursor)} disabled={reviewLoading}>
                        {reviewLoading ? t("loading") : t("load_more")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="people">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="font-medium">{clusters.length} {clusters.length === 1 ? "person" : "people"}</h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={loadClusters} disabled={clustersLoading}>{clustersLoading ? "…" : "Refresh"}</Button>
                  <Button variant="secondary" size="sm" onClick={reprocess} disabled={reprocessing} className="gap-2">
                    {reprocessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Re-run matching
                  </Button>
                </div>
              </div>
              {clustersLoading && clusters.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
              ) : clusters.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No people detected yet. Upload photos and run face matching.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {clusters.map((c) => (
                    <div key={c.id} className={`relative group rounded-xl overflow-hidden bg-muted aspect-square cursor-pointer ${c.hidden ? "opacity-50" : ""}`} onClick={() => openClusterEditor(c)}>
                      {c.cover_url ? <img src={c.cover_url} alt={c.display_name || "Person"} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><Users className="w-8 h-8 text-muted-foreground" /></div>}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex items-end justify-between">
                        <span className="text-white text-sm font-semibold truncate">{c.display_name || "Unnamed"}</span>
                        <span className="text-white/80 text-xs">{c.photo_count}</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); toggleClusterHidden(c); }}
                        className="absolute top-1 right-1 bg-background/90 hover:bg-background rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                        title={c.hidden ? "Show on public album" : "Hide from public album"}>
                        {c.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="share">
            <Card className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-medium flex items-center gap-2"><MessageCircle className="w-5 h-5 text-emerald-600" /> Send album via WhatsApp</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Send the album link to guests through Twilio WhatsApp. Numbers must be in international format (e.g. <code>+14155550123</code>).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Your Twilio WhatsApp number</label>
                <Input value={waFrom} onChange={(e) => setWaFrom(e.target.value)} placeholder="+14155238886 (Twilio sandbox)" />
                <p className="text-xs text-muted-foreground">
                  Use your approved WhatsApp sender, or the Twilio sandbox number <code>+14155238886</code> for testing (recipients must join your sandbox first).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Recipient phone numbers</label>
                <Textarea
                  rows={5}
                  value={waNumbers}
                  onChange={(e) => setWaNumbers(e.target.value)}
                  placeholder={"+14155550123\n+447700900123\n+33612345678"}
                />
                <p className="text-xs text-muted-foreground">One per line, or comma-separated. Up to 500.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea rows={4} value={waMessage} onChange={(e) => setWaMessage(e.target.value)} maxLength={1500} />
                <p className="text-xs text-muted-foreground">{waMessage.length}/1500 characters</p>
              </div>

              <Button onClick={sendWhatsApp} disabled={waSending} size="lg" className="w-full gap-2">
                {waSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send WhatsApp messages</>}
              </Button>

              {waResult && (
                <div className="text-sm border rounded-md p-3 bg-secondary/40">
                  ✅ Sent: <b>{waResult.sent}</b> · ❌ Failed: <b>{waResult.failed}</b> · ⚠️ Skipped (invalid): <b>{waResult.skipped}</b>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("language")}</label>
                <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
                  <SelectTrigger className="w-full max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{t("english")}</SelectItem>
                    <SelectItem value="he">{t("hebrew")} (RTL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 border-t pt-5">
                <label className="text-sm font-medium">{t("event_name")}</label>
                <Input defaultValue={event.name} onBlur={(e) => e.target.value !== event.name && updateEvent({ name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("event_date")}</label>
                <Input type="date" defaultValue={event.event_date || ""} onChange={(e) => updateEvent({ event_date: e.target.value || null })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("cover_image")}</label>
                <p className="text-xs text-muted-foreground">{t("cover_image_hint")}</p>
                {event.cover_image_url && (
                  <img src={event.cover_image_url} alt="Cover preview" className="w-full max-w-sm aspect-video object-cover rounded-md border" />
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  <label className="inline-flex">
                    <Button type="button" variant="outline" size="sm" disabled={coverUploading} asChild>
                      <span className="cursor-pointer gap-2 inline-flex items-center">
                        {coverUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {t("upload_image")}
                      </span>
                    </Button>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); e.currentTarget.value = ""; }} />
                  </label>
                  {event.cover_image_url && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => updateEvent({ cover_image_url: null })}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <Input defaultValue={event.cover_image_url || ""} placeholder={t("paste_url")}
                  onBlur={(e) => e.target.value !== (event.cover_image_url || "") && updateEvent({ cover_image_url: e.target.value || null })} />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div><div className="font-medium text-sm">{t("show_people_title")}</div><p className="text-xs text-muted-foreground">{t("show_people_desc")}</p></div>
                <Switch checked={event.show_people} onCheckedChange={(v) => updateEvent({ show_people: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div><div className="font-medium text-sm">{t("show_all_photos_title")}</div><p className="text-xs text-muted-foreground">{t("show_all_photos_desc")}</p></div>
                <Switch checked={event.show_all_photos} onCheckedChange={(v) => updateEvent({ show_all_photos: v })} />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div><div className="font-medium text-sm">{t("allow_guest_title")}</div><p className="text-xs text-muted-foreground">{t("allow_guest_desc")}</p></div>
                <Switch checked={event.allow_guest_uploads} onCheckedChange={(v) => updateEvent({ allow_guest_uploads: v })} />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div><div className="font-medium text-sm">{t("published_title")}</div><p className="text-xs text-muted-foreground">{t("published_desc")}</p></div>
                <Switch checked={event.is_published} onCheckedChange={(v) => updateEvent({ is_published: v })} />
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Folder edit dialog */}
      <Dialog open={folderDialog.open} onOpenChange={(o) => setFolderDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit folder "{folderDialog.from}"</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Rename to</label>
            <Input value={folderDialog.to} onChange={(e) => setFolderDialog((d) => ({ ...d, to: e.target.value }))} maxLength={60} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="destructive" onClick={() => renameOrDeleteFolder("delete")}>Unfile all</Button>
            <Button onClick={() => renameOrDeleteFolder("rename")} disabled={!folderDialog.to.trim() || folderDialog.to === folderDialog.from}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cluster editor */}
      <Dialog open={!!editingCluster} onOpenChange={(o) => !o && setEditingCluster(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit person</DialogTitle></DialogHeader>
          {editingCluster && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input defaultValue={editingCluster.display_name || ""} placeholder="Name (e.g. Sarah)"
                  onBlur={(e) => { if (e.target.value !== (editingCluster.display_name || "")) renameCluster(e.target.value); }} />
                <Button variant="outline" onClick={openPicker} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> Add photos</Button>
              </div>
              <div className="text-sm text-muted-foreground">{editingClusterPhotos.length} photo(s) in this person.</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {editingClusterPhotos.map((p) => (
                  <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden bg-muted">
                    {p.media_type === "video" ? <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" /> : <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    {p.media_type !== "video" && (
                      <button onClick={() => setClusterCover(p.id)}
                        className="absolute top-1 left-1 bg-background/90 hover:bg-background rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow" title="Set as cover photo">
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => removePhotosFromCluster([p.id])}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove from this person">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add photos to this person</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {pickerPhotos.map((p) => {
              const sel = pickerSel.has(p.id);
              return (
                <div key={p.id} className={`relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer ring-2 ${sel ? "ring-primary" : "ring-transparent"}`}
                  onClick={() => setPickerSel((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}>
                  {p.media_type === "video" ? <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" /> : <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  {sel && <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-1"><CheckSquare className="w-4 h-4" /></div>}
                </div>
              );
            })}
          </div>
          {pickerCursor && (
            <div className="text-center mt-3">
              <Button variant="outline" size="sm" onClick={loadMorePicker}>Load more</Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
            <Button onClick={addPickedPhotos} disabled={!pickerSel.size}>Add {pickerSel.size || ""}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
