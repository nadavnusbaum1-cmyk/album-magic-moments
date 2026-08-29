import { useEffect, useMemo, useRef, useState } from "react";
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
import { ArrowLeft, Upload, Image as ImageIcon, Settings, Trash2, ExternalLink, Copy, Loader2, CheckSquare, Square, Users, Star, RefreshCw, Plus, X, EyeOff, Eye, FolderOpen, AlertTriangle, Pencil, Download, MessageCircle, Send, Printer, Link2, Sparkles, ChevronDown, Smartphone } from "lucide-react";
import { Mori } from "@/components/Mori";
import { DateField } from "@/components/DateField";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { googlePhotosEnabled, importFromGooglePhotos, type GPhotosProgress } from "@/lib/googlePhotos";
import { QRCodeSVG } from "qrcode.react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { prepareImageForUpload, uploadRenditions } from "@/lib/imageUtils";
import { extractTakenAt } from "@/lib/exif";
import { saveManyToGallery, isAbortError, isMobile } from "@/lib/download";
import { useI18n, Lang } from "@/lib/i18n";

type ExtraLink = { label_en: string; label_he: string; url: string };
type Event = { id: string; name: string; slug: string; event_date: string | null; cover_image_url: string | null; home_bg_url: string | null; cover_photo_id: string | null; is_published: boolean; show_people: boolean; show_all_photos: boolean; allow_guest_uploads: boolean; people_gallery_visibility?: string; hidden_sources?: string[] | null; default_language: string | null; extra_links?: ExtraLink[] | null; created_at?: string; storage_expires_at?: string | null; storage_expired?: boolean; storage_expired_at?: string | null; };
type Photo = { id: string; url: string; thumbUrl?: string; mediumUrl?: string; face_count: number; processed: boolean; processing_error?: string | null; upload_status?: string; processing_status?: string; moderation_status?: string; moderation_labels?: { name?: string; confidence?: number }[] | null; uploaded_by: string | null; media_type?: string; source_label?: string | null; created_at?: string; };
type Cluster = { id: string; cover_url: string | null; photo_count: number; display_name: string | null; hidden?: boolean };
type ClusterPhoto = { id: string; url: string; thumbUrl?: string; mediumUrl?: string; media_type?: string };
type Source = { label: string; count: number };

// Keep only photos/videos when a whole folder is selected (skip .DS_Store, sidecars, etc.).
const isMediaFile = (f: File) =>
  /^(image|video)\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v|webm)$/i.test(f.name);

// Recursively collect files from a dragged entry (file or folder). Supports the
// webkitGetAsEntry directory API so users can drag a whole folder onto the drop-zone.
// deno-lint-ignore no-explicit-any
async function readEntry(entry: any): Promise<File[]> {
  if (!entry) return [];
  if (entry.isFile) {
    return await new Promise((resolve) => entry.file((f: File) => resolve([f]), () => resolve([])));
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const readBatch = () => new Promise<any[]>((resolve) => reader.readEntries((es: any[]) => resolve(es || []), () => resolve([])));
    const all: any[] = [];
    let batch = await readBatch();
    while (batch.length) { all.push(...batch); batch = await readBatch(); }
    const nested = await Promise.all(all.map(readEntry));
    return nested.flat();
  }
  return [];
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items || []);
  // deno-lint-ignore no-explicit-any
  const entries = items.map((it: any) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
  if (entries.length) return (await Promise.all(entries.map(readEntry))).flat();
  return Array.from(dt.files || []); // fallback: plain files
}

const NEW_FOLDER = "__new__";
const NO_FOLDER = "__none__";

export default function EventAdmin() {
  const { id } = useParams();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [event, setEvent] = useState<Event | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [photoLimit, setPhotoLimit] = useState<number | null>(null);
  const [storageDays, setStorageDays] = useState<number | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState("upload");
  const [coverUploading, setCoverUploading] = useState(false);

  // Upload
  const [files, setFiles] = useState<File[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const deviceInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);
  const [uploaderName, setUploaderName] = useState("");
  const [folderChoice, setFolderChoice] = useState<string>(NO_FOLDER);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0, skipped: 0 });
  const [gphotos, setGphotos] = useState<GPhotosProgress | null>(null);

  // Gallery
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosCursor, setPhotosCursor] = useState<string | null>(null);
  const [photosTotals, setPhotosTotals] = useState({ total: 0, processed: 0, pending: 0, review: 0, skipped: 0, moderation: 0 });
  const [sources, setSources] = useState<Source[]>([]);
  const [filterSource, setFilterSource] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  // When on, the Photos grid shows only items needing review (merged Review tab).
  const [reviewFilter, setReviewFilter] = useState(false);
  // When on, the Photos grid shows only guest uploads awaiting moderation (pending/flagged).
  const [moderationFilter, setModerationFilter] = useState(false);

  // Folder management dialog
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; from: string; to: string }>({ open: false, from: "", to: "" });

  // Reprocess

  // People
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clustersLoading, setClustersLoading] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null);
  const [editingClusterPhotos, setEditingClusterPhotos] = useState<ClusterPhoto[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPhotos, setPickerPhotos] = useState<Photo[]>([]);
  const [pickerCursor, setPickerCursor] = useState<string | null>(null);
  const [pickerSel, setPickerSel] = useState<Set<string>>(new Set());

  // Share / WhatsApp
  const [waFrom, setWaFrom] = useState("");
  const [shortLink, setShortLink] = useState("");
  const [shortening, setShortening] = useState(false);
  const [waNumbers, setWaNumbers] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const prevShareUrlRef = useRef("");
  const [waSending, setWaSending] = useState(false);
  const [waResult, setWaResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);

  // EXIF capture-date backfill

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
    setEvent(data as unknown as Event);
  };

  const loadPhotos = async (before?: string) => {
    if (!id) return;
    if (before) setLoadingMore(true); else setLoadingPhotos(true);
    try {
      const data = await authedInvoke<{ photos: Photo[]; sources: Source[]; nextCursor: string | null; totals?: typeof photosTotals }>(
        "admin-list-photos",
        { eventId: id, sourceLabel: reviewFilter || moderationFilter || filterSource === "all" ? undefined : filterSource, review: reviewFilter, moderation: moderationFilter, before, limit: 60 },
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
  useEffect(() => {
    if (!session) return;
    supabase.from("profiles").select("plan, photo_limit, storage_days").eq("id", session.user.id).maybeSingle()
      .then(({ data }) => {
        const p = data as { plan?: string; photo_limit?: number | null; storage_days?: number | null } | null;
        setPlan(p?.plan ?? null);
        setPhotoLimit(p?.photo_limit ?? null);
        setStorageDays(p?.storage_days ?? null);
      });
  }, [session]);
  useEffect(() => { if (session && id && tab === "all") loadPhotos(); }, [session, id, tab, filterSource, reviewFilter, moderationFilter]);
  useEffect(() => { if (session && event && tab === "people") loadClusters(); }, [session, event, tab]);
  useEffect(() => { if (session && id && tab === "settings" && !sources.length) loadPhotos(); }, [session, id, tab]);
  // Enable folder selection on the folder input (non-standard attribute).
  useEffect(() => {
    const el = folderInputRef.current;
    if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); }
  }, []);

  // Folder is optional: a real name when one is chosen/typed, otherwise "" →
  // photos are filed under the "No Folder" label.
  const folderForUpload = folderChoice === NEW_FOLDER
    ? newFolderName.trim()
    : (folderChoice === NO_FOLDER ? "" : folderChoice.trim());
  const uploadSourceLabel = folderForUpload || t("no_folder");

  const upload = async () => {
    if (!files.length || !id) return;
    if (folderChoice === NEW_FOLDER && !newFolderName.trim()) { toast.error(t("name_new_folder")); return; }
    // Free/limited plans: catch an over-limit batch up front with an upgrade nudge.
    if (photoLimit != null && photosTotals.total + files.length > photoLimit) { setUpgradeOpen(true); return; }
    localStorage.setItem(`folder:${id}`, folderChoice === NEW_FOLDER ? folderForUpload : folderChoice);
    setUploading(true);
    setProgress({ done: 0, total: files.length, errors: 0, skipped: 0 });
    let done = 0, errors = 0, skipped = 0, limitHit = false;
    const BATCH = 20;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const conv = await Promise.all(batch.map(async (f) => {
        try {
          const takenAt = await extractTakenAt(f);
          return { ok: true as const, file: await prepareImageForUpload(f), original: f, takenAt };
        }
        catch { return { ok: false as const, original: f }; }
      }));
      const goodFiles = conv.filter((c) => c.ok) as Array<{ ok: true; file: File; original: File; takenAt: string | null }>;
      skipped += conv.length - goodFiles.length;
      if (goodFiles.length) {
        try {
          const data = await authedInvoke<{ uploads: { photoId: string; uploadUrl: string; thumbUploadUrl?: string; mediumUploadUrl?: string; skipped?: boolean }[] }>("sign-s3-upload", {
            eventId: id,
            files: goodFiles.map((g) => ({
              name: g.file.name,
              contentType: g.file.type || "image/jpeg",
              takenAt: g.takenAt,
              size: g.file.size,
              // Deterministic per source file → retries reuse the same row/object.
              clientUploadId: `${g.original.name}|${g.original.size}|${g.original.lastModified}`.slice(0, 128),
            })),
            uploadedBy: uploaderName.trim() || null,
            sourceLabel: uploadSourceLabel,
          });
          const uploadedIds: string[] = [];
          await Promise.all(data.uploads.map(async (u, idx) => {
            if (u.skipped || !u.uploadUrl) { skipped++; return; }
            const file = goodFiles[idx].file;
            try {
              const r = await fetch(u.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
              if (!r.ok) throw new Error(`${r.status}`);
              uploadedIds.push(u.photoId);
              // Upload thumbnail + medium (awaited so confirm-upload can detect them).
              await uploadRenditions(file, u.thumbUploadUrl, u.mediumUploadUrl);
            } catch (e) { console.error(file.name, e); errors++; }
          }));
          // Server-side verify (HEAD) + start processing. Replaces the old
          // fire-and-forget process-photo-now (which couldn't verify the upload).
          if (uploadedIds.length) authedInvoke("confirm-upload", { photoIds: uploadedIds }).catch(() => {});
        } catch (e) {
          if ((e as { code?: string }).code === "photo_limit") { limitHit = true; break; }
          errors += goodFiles.length; console.error(e);
        }
      }
      done += batch.length;
      setProgress({ done, total: files.length, errors, skipped });
    }
    setUploading(false);
    if (limitHit) { setUpgradeOpen(true); loadPhotos(); return; }
    if (skipped) toast.warning(t("heic_skipped", { n: skipped }));
    if (errors) toast.error(t("uploads_failed", { n: errors }));
    const ok = done - errors - skipped;
    if (ok > 0) toast.success(t("upload_success", { n: ok }));
    setFiles([]); setUploading(false);
    if (folderChoice === NEW_FOLDER) { setFolderChoice(folderForUpload); setNewFolderName(""); }
  };

  const importGooglePhotos = async () => {
    setGphotos({ phase: "auth" });
    try {
      const imported = await importFromGooglePhotos((p) => setGphotos(p));
      if (imported.length) {
        setFiles((prev) => [...prev, ...imported]);
        toast.success(t("gphotos_added", { n: imported.length }));
      } else {
        toast.info(t("gphotos_none"));
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
    finally { setGphotos(null); }
  };

  const deleteEvent = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      // delete-event is re-entrant (time-budgeted per call) — loop until done.
      for (let i = 0; i < 40; i++) {
        const r = await authedInvoke<{ done?: boolean }>("delete-event", { eventId: id });
        if (r?.done) break;
      }
      toast.success(t("event_deleted"));
      navigate("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
      setDeleting(false);
    }
  };

  const deletePhotos = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(t("confirm_delete", { n: ids.length }))) return;
    try {
      const r = await authedFetch("delete-photos", { method: "POST", body: JSON.stringify({ photoIds: ids }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("failed"));
      toast.success(t("deleted_n", { n: j.deleted }));
      setPhotos((p) => p.filter((x) => !ids.includes(x.id)));
      setSelected(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const skipReviewPhotos = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const r = await authedFetch("skip-review-photos", { method: "POST", body: JSON.stringify({ photoIds: ids }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("failed"));
      toast.success(t("skipped_n", { n: ids.length }));
      setPhotos((p) => p.filter((x) => !ids.includes(x.id)));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  const approvePhotos = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const r = await authedFetch("approve-photos", { method: "POST", body: JSON.stringify({ photoIds: ids }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("failed"));
      toast.success(t("approved_n", { n: j.approved }));
      setPhotos((p) => p.filter((x) => !ids.includes(x.id)));
      setSelected(new Set());
      setPhotosTotals((tt) => ({ ...tt, moderation: Math.max(0, tt.moderation - ids.length) }));
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

  const reindexShown = async () => {
    if (!photos.length) return;
    toast.info(t("reindexing_n", { n: photos.length }));
    let ok = 0;
    for (const p of photos) {
      try { await authedInvoke("process-photo-now", { photoId: p.id }); ok++; } catch { /* ignore */ }
    }
    toast.success(t("reindex_triggered", { n: ok }));
    setTimeout(() => loadPhotos(), 2000);
  };

  const updateEvent = async (patch: Partial<Event>) => {
    if (!id) return;
    try {
      const data = await authedInvoke<{ event: Event }>("update-event", { eventId: id, ...patch });
      setEvent(data.event); toast.success(t("saved"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
  };

  // Show/hide a folder on the public album.
  const toggleFolder = (label: string, shared: boolean) => {
    if (!event) return;
    const current = event.hidden_sources || [];
    const next = shared ? current.filter((s) => s !== label) : [...new Set([...current, label])];
    setEvent({ ...event, hidden_sources: next });
    updateEvent({ hidden_sources: next });
  };

  // One image is used for BOTH the album cover and the home background.
  const uploadEventImage = async (file: File) => {
    if (!id) return;
    setCoverUploading(true);
    try {
      const fd = new FormData();
      fd.append("eventId", id);
      fd.append("kind", "cover");
      fd.append("file", file);
      const r = await authedFetch("upload-cover", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("failed"));
      const url = j.event?.cover_image_url || null;
      const upd = await authedInvoke<{ event: Event }>("update-event", { eventId: id, home_bg_url: url });
      setEvent(upd.event);
      toast.success(t("cover_uploaded"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("upload_failed")); }
    finally { setCoverUploading(false); }
  };



  const copyPersonLink = (clusterId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/person/${clusterId}`);
    toast.success(t("link_copied"));
  };

  const [autoMerging, setAutoMerging] = useState(false);
  const autoMergeClusters = async () => {
    if (!id) return;
    if (!confirm(t("merge_similar_confirm"))) return;
    setAutoMerging(true);
    let cursor: string | null = null;
    let totalMerged = 0;
    let totalProcessed = 0;
    try {
      // Run iteratively until done — function is paginated for time-safety.
      while (true) {
        const r = await authedFetch("auto-merge-clusters", { method: "POST", body: JSON.stringify({ eventId: id, cursor }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || t("failed"));
        totalMerged += j.mergedGroups || 0;
        totalProcessed += j.processed || 0;
        cursor = j.nextCursor;
        if (j.done) break;
      }
      toast.success(t("merge_similar_done", { merged: totalMerged, processed: totalProcessed }));
      loadClusters();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
    finally { setAutoMerging(false); }
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
    setNameInput(c.display_name || "");
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
  const uploadUrl = event ? `${window.location.origin}/u/${event.slug}` : "";
  const shortenUploadLink = async () => {
    if (!event) return;
    setShortening(true);
    try {
      const j = await authedInvoke<{ short?: string }>("shorten-url", { eventId: event.id, url: uploadUrl });
      if (!j.short) throw new Error(t("failed"));
      setShortLink(j.short);
      await navigator.clipboard.writeText(j.short).catch(() => {});
      toast.success(t("short_link_copied"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("failed")); }
    finally { setShortening(false); }
  };

  useEffect(() => {
    if (!event) return;
    const defaultLink = `${window.location.origin}/e/${event.slug}`;
    if (!shareUrl) {
      setShareUrl(defaultLink);
      prevShareUrlRef.current = defaultLink;
    }
    const linkForMsg = shareUrl || defaultLink;
    const newDefault = t("msg_default", { event: event.name, url: linkForMsg });
    const prevDefault = t("msg_default", { event: event.name, url: prevShareUrlRef.current || defaultLink });
    if (!waMessage || waMessage === prevDefault) {
      setWaMessage(newDefault);
    }
    prevShareUrlRef.current = linkForMsg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, lang, shareUrl]);


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

  // Face-recognition breakdown as percentages of the processable (non-video) photos.
  // recognized + pending + no-face always sum to 100%.
  // Twilio isn't connected yet — hide the WhatsApp sender for now. Flip to re-enable.
  const SHOW_WHATSAPP = false;
  const statDenom = Math.max(0, photosTotals.total - photosTotals.skipped);
  const recognizedPct = statDenom > 0 ? Math.round((photosTotals.processed / statDenom) * 100) : 0;
  const pendingPct = statDenom > 0 ? Math.round((photosTotals.pending / statDenom) * 100) : 0;
  const noFacePct = Math.max(0, 100 - recognizedPct - pendingPct);

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
          <div className="flex items-center gap-2">
            {plan === "free" && (
              <button
                onClick={() => navigate("/plan")}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
              >
                <Sparkles className="w-4 h-4" /> {t("upgrade_from_demo")}
              </button>
            )}
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary"
            >
              <ExternalLink className="w-4 h-4" /> {t("view_public_page")}
            </a>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-6 w-full max-w-3xl mb-6">
            <TabsTrigger value="upload" className="gap-2"><Upload className="w-4 h-4" /> {t("upload")}</TabsTrigger>
            <TabsTrigger value="all" className="gap-2"><ImageIcon className="w-4 h-4" /> {t("photos")}</TabsTrigger>
            <TabsTrigger value="people" className="gap-2"><Users className="w-4 h-4" /> {t("people")}</TabsTrigger>
            <TabsTrigger value="share" className="gap-2"><MessageCircle className="w-4 h-4" /> {t("share")}</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings className="w-4 h-4" /> {t("settings")}</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <Card className="p-6 space-y-4">
              <div className="rounded-xl border bg-secondary/30 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium flex items-center gap-2"><FolderOpen className="w-4 h-4 text-primary" /> {t("folder")}</label>
                  <span className="text-[11px] text-muted-foreground">{t("optional")}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t("folder_hint")}</p>
                <Select value={folderChoice} onValueChange={(v) => setFolderChoice(v)} disabled={uploading}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FOLDER}><span className="text-muted-foreground">{t("no_folder")}</span></SelectItem>
                    {folderOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    <SelectItem value={NEW_FOLDER}><span className="inline-flex items-center gap-1.5 text-primary font-medium"><Plus className="w-3.5 h-3.5" /> {t("new_folder")}</span></SelectItem>
                  </SelectContent>
                </Select>
                {folderChoice === NEW_FOLDER && (
                  <Input autoFocus placeholder={t("new_folder_placeholder")} value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)} disabled={uploading} maxLength={60} className="bg-background" />
                )}
              </div>
              <Input placeholder={t("uploader_name_optional")} value={uploaderName} onChange={(e) => setUploaderName(e.target.value)} disabled={uploading} maxLength={60} />
              <label htmlFor="files"
                onDragEnter={(e) => { e.preventDefault(); dragCounter.current += 1; setDragActive(true); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => { e.preventDefault(); dragCounter.current -= 1; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragActive(false); } }}
                onDrop={async (e) => {
                  e.preventDefault();
                  dragCounter.current = 0; setDragActive(false);
                  const dropped = (await filesFromDrop(e.dataTransfer)).filter(isMediaFile);
                  if (dropped.length) setFiles(dropped);
                }}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all ${dragActive ? "border-primary bg-primary/10 ring-2 ring-primary/40 scale-[1.01]" : "border-border hover:border-primary bg-secondary/40"}`}>
                <Upload className={`w-8 h-8 transition-colors ${dragActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-sm text-center transition-colors ${dragActive ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {dragActive ? t("drop_to_upload") : files.length ? t("files_ready", { n: files.length }) : t("tap_to_choose")}
                </span>
                {!dragActive && !files.length && <span className="text-xs text-muted-foreground/80 text-center">{t("drag_folder_hint")}</span>}
                <input id="files" ref={deviceInputRef} type="file" accept="image/*,video/*,.heic,.heif" multiple className="sr-only" disabled={uploading}
                  onChange={(e) => setFiles(Array.from(e.target.files || []))} />
              </label>

              <div className="flex flex-col items-center gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="gap-2" disabled={uploading || !!gphotos}>
                      {gphotos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      {t("add_from")} <ChevronDown className="w-4 h-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-52">
                    <DropdownMenuItem onClick={() => deviceInputRef.current?.click()}>
                      <Smartphone className="w-4 h-4 me-2" /> {t("source_device")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => folderInputRef.current?.click()}>
                      <FolderOpen className="w-4 h-4 me-2" /> {t("source_folder")}
                    </DropdownMenuItem>
                    {googlePhotosEnabled() && (
                      <DropdownMenuItem onClick={importGooglePhotos}>
                        <ImageIcon className="w-4 h-4 me-2" /> {t("source_google_photos")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {gphotos && (
                  <span className="text-xs text-muted-foreground">
                    {gphotos.phase === "downloading" ? t("gphotos_downloading", { done: gphotos.done ?? 0, total: gphotos.total ?? 0 }) : gphotos.phase === "picking" ? t("gphotos_picking") : t("gphotos_connecting")}
                  </span>
                )}
                <input ref={folderInputRef} type="file" multiple className="sr-only" disabled={uploading}
                  onChange={(e) => { setFiles(Array.from(e.target.files || []).filter(isMediaFile)); e.currentTarget.value = ""; }} />
              </div>

              {uploading && (
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("upload_progress", { done: progress.done, total: progress.total })}
                  {progress.errors ? ` · ${t("uploads_failed", { n: progress.errors })}` : ""} {progress.skipped ? ` · ${t("heic_skipped", { n: progress.skipped })}` : ""}
                </div>
              )}
              <Button onClick={upload} disabled={!files.length || uploading} size="lg" className="w-full">
                {uploading ? t("processing") : `${t("upload_files", { n: files.length || "" })} ${t("upload_to", { folder: uploadSourceLabel })}`}
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card className="p-6">
              <div className={`grid grid-cols-2 gap-3 mb-4 ${photosTotals.moderation > 0 || moderationFilter ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">{t("stat_total")}</div>
                  <div className="text-2xl font-semibold">{photosTotals.total || photos.length}</div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">{t("stat_processed")}</div>
                  <div className="text-2xl font-semibold text-emerald-600">{photosTotals.processed}</div>
                  {statDenom > 0 && <div className="text-[11px] text-muted-foreground">{recognizedPct}%</div>}
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">{t("stat_pending")}</div>
                  <div className="text-2xl font-semibold text-amber-600">{photosTotals.pending}</div>
                  {statDenom > 0 && photosTotals.pending > 0 && <div className="text-[11px] text-muted-foreground">{pendingPct}%</div>}
                </div>
                <button
                  type="button"
                  onClick={() => { if (photosTotals.review > 0 || reviewFilter) { setSelected(new Set()); setModerationFilter(false); setReviewFilter((v) => !v); } }}
                  disabled={photosTotals.review === 0 && !reviewFilter}
                  className={`text-start rounded-lg border p-3 transition-colors ${reviewFilter ? "border-primary bg-primary/10" : "bg-card"} ${photosTotals.review > 0 || reviewFilter ? "hover:border-primary cursor-pointer" : "opacity-70 cursor-default"}`}
                >
                  <div className="text-xs text-muted-foreground">{t("stat_no_face")}</div>
                  <div className="text-2xl font-semibold text-amber-600">{photosTotals.review}</div>
                  {statDenom > 0 && <div className="text-[11px] text-muted-foreground">{noFacePct}%{reviewFilter ? ` · ${t("all_photos")}` : ""}</div>}
                </button>
                {(photosTotals.moderation > 0 || moderationFilter) && (
                  <button
                    type="button"
                    onClick={() => { setSelected(new Set()); setReviewFilter(false); setModerationFilter((v) => !v); }}
                    className={`text-start rounded-lg border p-3 transition-colors ${moderationFilter ? "border-destructive bg-destructive/10" : "bg-card"} hover:border-destructive cursor-pointer`}
                  >
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-destructive" /> {t("stat_flagged")}</div>
                    <div className="text-2xl font-semibold text-destructive">{photosTotals.moderation}</div>
                    {moderationFilter && <div className="text-[11px] text-muted-foreground">{t("all_photos")}</div>}
                  </button>
                )}
              </div>
              {reviewFilter && (
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{t("review_title")}</p>
                    <p className="text-xs text-muted-foreground">{t("review_desc")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" className="gap-2" onClick={reindexShown} disabled={!photos.length}>
                      <RefreshCw className="w-4 h-4" /> {t("reindex_all")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setSelected(new Set()); setReviewFilter(false); }}>{t("all_photos")}</Button>
                  </div>
                </div>
              )}
              {moderationFilter && (
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-destructive" /> {t("moderation_title")}</p>
                    <p className="text-xs text-muted-foreground">{t("moderation_desc")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" className="gap-2" onClick={() => approvePhotos(photos.map((p) => p.id))} disabled={!photos.length}>
                      <Eye className="w-4 h-4" /> {t("approve_all")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setSelected(new Set()); setModerationFilter(false); }}>{t("all_photos")}</Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="font-medium">{moderationFilter ? t("stat_flagged") : reviewFilter ? t("review") : t("n_photos", { n: photosTotals.total || photos.length })}</h2>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  {!reviewFilter && sources.length > 0 && (
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
                      {moderationFilter && (
                        <Button variant="secondary" size="sm" className="gap-2" onClick={() => approvePhotos([...selected])}>
                          <Eye className="w-4 h-4" /> {t("approve_n", { n: selected.size })}
                        </Button>
                      )}
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
                            <img src={p.thumbUrl || p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
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
                          {(p.moderation_status === "flagged" || p.moderation_status === "pending") && (
                            <span className="absolute top-8 start-1 bg-destructive/90 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5"
                              title={(p.moderation_labels || []).map((l) => l.name).filter(Boolean).join(", ") || undefined}>
                              <AlertTriangle className="w-3 h-3" /> {t("flagged_badge")}
                            </span>
                          )}
                          {moderationFilter && (
                            <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/80 to-transparent">
                              <Button size="sm" variant="secondary" className="flex-1 h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); approvePhotos([p.id]); }}>
                                <Eye className="w-3 h-3" /> {t("approve")}
                              </Button>
                              <Button size="sm" variant="destructive" className="h-7 px-2" title={t("delete")} onClick={(e) => { e.stopPropagation(); deletePhotos([p.id]); }}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                          {reviewFilter && (
                            <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/80 to-transparent">
                              <Button size="sm" variant="secondary" className="flex-1 h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); reindexPhoto(p.id); }}>
                                <RefreshCw className="w-3 h-3" /> {t("reindex")}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2" title={t("skip")} onClick={(e) => { e.stopPropagation(); skipReviewPhotos([p.id]); }}>
                                <EyeOff className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
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

          <TabsContent value="people">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="font-medium">{clusters.length === 1 ? t("n_person", { n: 1 }) : t("n_people", { n: clusters.length })}</h2>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={loadClusters} disabled={clustersLoading}>{clustersLoading ? "…" : t("refresh")}</Button>
                  <Button variant="secondary" size="sm" onClick={autoMergeClusters} disabled={autoMerging} className="gap-2">
                    {autoMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                    {t("merge_similar")}
                  </Button>
                </div>
              </div>
              {clustersLoading && clusters.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{t("loading")}</p>
              ) : clusters.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{t("no_people_yet")}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {clusters.map((c) => (
                    <div key={c.id} className={`relative group rounded-xl overflow-hidden bg-muted aspect-square cursor-pointer ${c.hidden ? "opacity-50" : ""}`} onClick={() => openClusterEditor(c)}>
                      {c.cover_url ? <img src={c.cover_url} alt={c.display_name || ""} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><Users className="w-8 h-8 text-muted-foreground" /></div>}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex items-end justify-between">
                        <span className="text-white text-sm font-semibold truncate">{c.display_name || "—"}</span>
                        <span className="text-white/80 text-xs">{c.photo_count}</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); toggleClusterHidden(c); }}
                        className="absolute top-1 end-1 bg-background/90 hover:bg-background rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                        title={c.hidden ? t("show_on_public") : t("hide_from_public")}>
                        {c.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); copyPersonLink(c.id); }}
                        className="absolute top-1 start-1 bg-background/90 hover:bg-background rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                        title={t("copy_person_link")}>
                        <Link2 className="w-4 h-4" />
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
                <h2 className="text-lg font-medium flex items-center gap-2"><MessageCircle className="w-5 h-5 text-emerald-600" /> {SHOW_WHATSAPP ? t("share_title") : t("share")}</h2>
                {SHOW_WHATSAPP && <p className="text-xs text-muted-foreground mt-1">{t("share_desc")}</p>}
              </div>

              <div className="space-y-2 border rounded-lg p-3 bg-secondary/30">
                <label className="text-sm font-medium">{t("guest_upload_link_title")}</label>
                <p className="text-xs text-muted-foreground">{t("guest_upload_link_desc")}</p>
                <div className="flex gap-2 flex-wrap">
                  <Input value={shortLink || uploadUrl} readOnly dir="ltr" className="flex-1 min-w-[12rem]" />
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => { navigator.clipboard.writeText(shortLink || uploadUrl); toast.success(t("link_copied")); }}>
                    {t("copy")}
                  </Button>
                  {SHOW_WHATSAPP && (
                    <Button type="button" variant="outline" size="sm" onClick={shortenUploadLink} disabled={shortening || !!shortLink}>
                      {shortening ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shorten")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">{t("qr_title")}</label>
                  <p className="text-xs text-muted-foreground">{t("qr_desc")}</p>
                </div>
                <div className="qr-print mx-auto max-w-xs flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-white text-black p-6 text-center">
                  <div className="font-serif text-2xl">{event.name}</div>
                  <QRCodeSVG value={uploadUrl} size={200} marginSize={2} bgColor="#ffffff" fgColor="#000000" />
                  <div className="text-sm font-medium">{t("qr_scan_cta")}</div>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
                  <Printer className="w-4 h-4" /> {t("qr_print")}
                </Button>
              </div>

              {SHOW_WHATSAPP && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("twilio_number")}</label>
                    <Input value={waFrom} onChange={(e) => setWaFrom(e.target.value)} placeholder="+14155238886" />
                    <p className="text-xs text-muted-foreground">{t("twilio_hint")}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("recipient_numbers")}</label>
                    <Textarea
                      rows={5}
                      value={waNumbers}
                      onChange={(e) => setWaNumbers(e.target.value)}
                      placeholder={"+972501234567\n+14155550123"}
                    />
                    <p className="text-xs text-muted-foreground">{t("one_per_line")}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("share_link_label")}</label>
                    <div className="flex gap-2">
                      <Input
                        value={shareUrl}
                        onChange={(e) => setShareUrl(e.target.value)}
                        placeholder={publicUrl}
                        dir="ltr"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => setShareUrl(publicUrl)}>
                        {t("reset_to_album_link")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("share_link_hint")}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("message")}</label>
                    <Textarea rows={4} value={waMessage} onChange={(e) => setWaMessage(e.target.value)} maxLength={1500} />
                    <p className="text-xs text-muted-foreground">{t("chars_count", { n: waMessage.length })}</p>
                  </div>

                  <Button onClick={sendWhatsApp} disabled={waSending} size="lg" className="w-full gap-2">
                    {waSending ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("sending")}</> : <><Send className="w-4 h-4" /> {t("send_whatsapp")}</>}
                  </Button>

                  {waResult && (
                    <div className="text-sm border rounded-md p-3 bg-secondary/40">
                      {t("sent_summary", { sent: waResult.sent, failed: waResult.failed, skipped: waResult.skipped })}
                    </div>
                  )}
                </>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("language")}</label>
                <p className="text-xs text-muted-foreground">{t("event_language_hint")}</p>
                <Select
                  value={event.default_language ?? lang}
                  onValueChange={(v) => { updateEvent({ default_language: v }); setLang(v as Lang); }}
                >
                  <SelectTrigger className="w-full max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{t("english")}</SelectItem>
                    <SelectItem value="he">{t("hebrew")} (RTL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 border-t pt-5">
                <label className="text-sm font-medium">{t("storage_retention")}</label>
                {event.storage_expired ? (
                  <p className="text-xs text-destructive">{t("storage_expired_note")}</p>
                ) : event.storage_expires_at ? (
                  <p className="text-xs text-muted-foreground">
                    {t("storage_until", { date: new Date(event.storage_expires_at).toLocaleDateString(lang === "he" ? "he-IL" : "en-US", { year: "numeric", month: "long", day: "numeric" }) })}
                  </p>
                ) : storageDays != null ? (
                  <p className="text-xs text-muted-foreground">
                    {t("storage_pending", { window: storageDays >= 60 ? (lang === "he" ? `${Math.round(storageDays / 30)} חודשים` : `${Math.round(storageDays / 30)} months`) : (lang === "he" ? `${storageDays} יום` : `${storageDays} days`) })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("storage_forever")}</p>
                )}
              </div>
              <div className="space-y-2 border-t pt-5">
                <label className="text-sm font-medium">{t("event_name")}</label>
                <Input defaultValue={event.name} onBlur={(e) => e.target.value !== event.name && updateEvent({ name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("event_date")}</label>
                <DateField value={event.event_date} onChange={(v) => updateEvent({ event_date: v })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("cover_image")}</label>
                <p className="text-xs text-muted-foreground">{t("cover_image_hint")}</p>
                {event.cover_image_url && (
                  <img src={event.cover_image_url} alt={t("cover_preview")} className="w-full max-w-sm aspect-video object-cover rounded-md border" />
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  <label className="inline-flex">
                    <Button type="button" variant="outline" size="sm" disabled={coverUploading} asChild>
                      <span className="cursor-pointer gap-2 inline-flex items-center">
                        {coverUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {t("upload_image")}
                      </span>
                    </Button>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEventImage(f); e.currentTarget.value = ""; }} />
                  </label>
                  {event.cover_image_url && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => updateEvent({ cover_image_url: null, home_bg_url: null })}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div><div className="font-medium text-sm">{t("people_public_title")}</div><p className="text-xs text-muted-foreground">{t("people_public_desc")}</p></div>
                <Switch checked={event.show_people && event.people_gallery_visibility === "public"}
                  onCheckedChange={(v) => updateEvent({ show_people: v, people_gallery_visibility: v ? "public" : "private" })} />
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

              <div className="space-y-2 border-t pt-4">
                <div className="font-medium text-sm">{t("folder_sharing_title")}</div>
                <p className="text-xs text-muted-foreground">{t("folder_sharing_desc")}</p>
                {sources.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("folder_sharing_empty")}</p>
                ) : (
                  <div className="space-y-1">
                    {sources.map((s) => {
                      const shared = !(event.hidden_sources || []).includes(s.label);
                      return (
                        <div key={s.label} className="flex items-center justify-between py-1">
                          <div className="text-sm">{s.label} <span className="text-xs text-muted-foreground">({s.count})</span></div>
                          <Switch checked={shared} onCheckedChange={(v) => toggleFolder(s.label, v)} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t pt-4">
                <label className="text-sm font-medium">{t("extra_links_title")}</label>
                <p className="text-xs text-muted-foreground">{t("extra_links_hint")}</p>
                <div className="space-y-3">
                  {(event.extra_links || []).map((lnk, idx) => (
                    <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] items-center border rounded-md p-2">
                      <Input
                        placeholder={t("extra_link_label_en")}
                        value={lnk.label_en}
                        onChange={(e) => {
                          const next = [...(event.extra_links || [])];
                          next[idx] = { ...next[idx], label_en: e.target.value };
                          setEvent({ ...event, extra_links: next });
                        }}
                        onBlur={() => updateEvent({ extra_links: event.extra_links || [] })}
                      />
                      <Input
                        placeholder={t("extra_link_label_he")}
                        value={lnk.label_he}
                        onChange={(e) => {
                          const next = [...(event.extra_links || [])];
                          next[idx] = { ...next[idx], label_he: e.target.value };
                          setEvent({ ...event, extra_links: next });
                        }}
                        onBlur={() => updateEvent({ extra_links: event.extra_links || [] })}
                      />
                      <Input
                        placeholder="https://..."
                        dir="ltr"
                        value={lnk.url}
                        onChange={(e) => {
                          const next = [...(event.extra_links || [])];
                          next[idx] = { ...next[idx], url: e.target.value };
                          setEvent({ ...event, extra_links: next });
                        }}
                        onBlur={() => updateEvent({ extra_links: event.extra_links || [] })}
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => {
                        const next = (event.extra_links || []).filter((_, i) => i !== idx);
                        setEvent({ ...event, extra_links: next });
                        updateEvent({ extra_links: next });
                      }}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => {
                  const next = [...(event.extra_links || []), { label_en: "", label_he: "", url: "" }];
                  setEvent({ ...event, extra_links: next });
                }}>
                  <Plus className="w-4 h-4" /> {t("add_link")}
                </Button>
              </div>

            </Card>

            <Card className="p-6 mt-4 border-destructive/40">
              <h2 className="font-medium text-destructive flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {t("danger_zone")}</h2>
              <p className="text-xs text-muted-foreground mt-1 mb-3">{t("delete_event_desc")}</p>
              <Button variant="destructive" size="sm" className="gap-2" onClick={() => { setDeleteText(""); setDeleteOpen(true); }}>
                <Trash2 className="w-4 h-4" /> {t("delete_event")}
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Upgrade nudge (photo limit reached) */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <Mori expression="thinking" size={96} className="mx-auto mb-2" />
            <DialogTitle className="text-center">{t("upgrade_limit_title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("upgrade_limit_desc", { n: photoLimit ?? 50 })}</p>
          <DialogFooter className="sm:justify-center gap-2">
            <Button variant="outline" onClick={() => setUpgradeOpen(false)}>{t("not_now")}</Button>
            <Button onClick={() => navigate("/plan")}><Sparkles className="w-4 h-4 me-1" /> {t("see_plans")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete event — type-to-confirm */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleting) setDeleteOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> {t("delete_event")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("delete_event_warning", { name: event.name })}</p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("delete_event_prompt")}</label>
            <Input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="delete" autoFocus disabled={deleting} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>{t("cancel")}</Button>
            <Button variant="destructive" className="gap-2" disabled={deleteText.trim().toLowerCase() !== "delete" || deleting} onClick={deleteEvent}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleting ? t("deleting") : t("delete_event_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folder edit dialog */}
      <Dialog open={folderDialog.open} onOpenChange={(o) => setFolderDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("edit_folder_title", { name: folderDialog.from })}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">{t("rename_to")}</label>
            <Input value={folderDialog.to} onChange={(e) => setFolderDialog((d) => ({ ...d, to: e.target.value }))} maxLength={60} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="destructive" onClick={() => renameOrDeleteFolder("delete")}>{t("unfile_all")}</Button>
            <Button onClick={() => renameOrDeleteFolder("rename")} disabled={!folderDialog.to.trim() || folderDialog.to === folderDialog.from}>{t("rename")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cluster editor */}
      <Dialog open={!!editingCluster} onOpenChange={(o) => !o && setEditingCluster(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("edit_person")}</DialogTitle></DialogHeader>
          {editingCluster && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder={t("person_name_placeholder")}
                  onKeyDown={(e) => { if (e.key === "Enter") renameCluster(nameInput); }} />
                <Button onClick={() => renameCluster(nameInput)} disabled={nameInput === (editingCluster.display_name || "")} className="shrink-0">{t("save")}</Button>
                <Button variant="outline" size="sm" onClick={() => copyPersonLink(editingCluster.id)} className="gap-2 shrink-0" title={t("copy_person_link")}><Link2 className="w-4 h-4" /> {t("copy")}</Button>
                <Button variant="outline" onClick={openPicker} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> {t("add_photos")}</Button>
              </div>
              <div className="text-sm text-muted-foreground">{t("n_photos_in_person", { n: editingClusterPhotos.length })}</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {editingClusterPhotos.map((p) => (
                  <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden bg-muted">
                    {p.media_type === "video" ? <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" /> : <img src={p.thumbUrl || p.url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    {p.media_type !== "video" && (
                      <button onClick={() => setClusterCover(p.id)}
                        className="absolute top-1 start-1 bg-background/90 hover:bg-background rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow" title={t("set_cover_photo")}>
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => removePhotosFromCluster([p.id])}
                      className="absolute top-1 end-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" title={t("remove_from_person")}>
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
          <DialogHeader><DialogTitle>{t("add_photos_to_person")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {pickerPhotos.map((p) => {
              const sel = pickerSel.has(p.id);
              return (
                <div key={p.id} className={`relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer ring-2 ${sel ? "ring-primary" : "ring-transparent"}`}
                  onClick={() => setPickerSel((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}>
                  {p.media_type === "video" ? <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" /> : <img src={p.thumbUrl || p.url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  {sel && <div className="absolute top-1 start-1 bg-primary text-primary-foreground rounded-full p-1"><CheckSquare className="w-4 h-4" /></div>}
                </div>
              );
            })}
          </div>
          {pickerCursor && (
            <div className="text-center mt-3">
              <Button variant="outline" size="sm" onClick={loadMorePicker}>{t("load_more")}</Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>{t("cancel")}</Button>
            <Button onClick={addPickedPhotos} disabled={!pickerSel.size}>{t("add")} {pickerSel.size || ""}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
