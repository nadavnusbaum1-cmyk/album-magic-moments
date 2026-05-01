import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Camera, Sparkles, Upload, Heart, Users, Pencil, Check, X, Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { convertHeicIfNeeded } from "@/lib/imageUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Lightbox } from "@/components/Lightbox";

const SHOW_PEOPLE_KEY = "wedding-show-people";
const SHOW_ALL_PHOTOS_KEY = "wedding-show-all-photos";

const ADMIN_KEY = "wedding-admin-password";

type Cluster = {
  id: string;
  cover_url: string | null;
  photo_count: number;
  display_name: string | null;
  hidden?: boolean;
};

type AllPhoto = { id: string; url: string; media_type?: string; uploaded_by?: string | null };

const Index = () => {
  const [selfie, setSelfie] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ token: string; photoCount: number } | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [editingCluster, setEditingCluster] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set());
  const [mergingClusters, setMergingClusters] = useState(false);
  const isMobile = useIsMobile();

  // Public uploads
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploaderName, setUploaderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  // All photos & lightbox
  const [allPhotos, setAllPhotos] = useState<AllPhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Section visibility (admin toggle, persisted)
  const [showPeople, setShowPeople] = useState<boolean>(() =>
    typeof window === "undefined" ? true : localStorage.getItem(SHOW_PEOPLE_KEY) !== "0"
  );
  const [showAllPhotos, setShowAllPhotos] = useState<boolean>(() =>
    typeof window === "undefined" ? true : localStorage.getItem(SHOW_ALL_PHOTOS_KEY) !== "0"
  );

  const adminPassword = typeof window !== "undefined" ? sessionStorage.getItem(ADMIN_KEY) : null;
  const isAdmin = !!adminPassword;

  const togglePeopleSection = () => {
    setShowPeople((v) => {
      const next = !v;
      localStorage.setItem(SHOW_PEOPLE_KEY, next ? "1" : "0");
      return next;
    });
  };
  const toggleAllPhotosSection = () => {
    setShowAllPhotos((v) => {
      const next = !v;
      localStorage.setItem(SHOW_ALL_PHOTOS_KEY, next ? "1" : "0");
      return next;
    });
  };

  const loadClusters = async () => {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-clusters`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          ...(adminPassword ? { "x-admin-password": adminPassword } : {}),
        },
        body: "{}",
      });
      const data = await r.json();
      if (!data?.error) setClusters(data.clusters || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAllPhotos = async () => {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-photos`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: "{}",
      });
      const data = await r.json();
      if (!data?.error) setAllPhotos(data.photos || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadClusters();
    loadAllPhotos();
  }, []);

  const onSelfieFile = async (file: File) => {
    try {
      const converted = await convertHeicIfNeeded(file);
      const reader = new FileReader();
      reader.onload = () => setSelfie(reader.result as string);
      reader.readAsDataURL(converted);
    } catch {
      toast.error("Could not read that image");
    }
  };

  const submit = async () => {
    if (!selfie) {
      toast.error("Please add a selfie ✨");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-guest", {
        body: { name: `Guest-${Date.now().toString(36)}`, selfieBase64: selfie },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setResult({ token: data.token, photoCount: data.photoCount });
      toast.success(`Found ${data.photoCount} photos of you! 🎉`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const onUploadFiles = async (files: File[]) => {
    setUploadFiles(files);
  };

  const startUpload = async () => {
    if (!uploadFiles.length) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: uploadFiles.length });
    let done = 0;
    let errors = 0;
    let heicSkipped = 0;
    try {
      // Direct-to-S3 upload in batches. HEIC files are converted client-side to JPEG.
      // If a single HEIC conversion fails, we skip THAT file only — never block the batch.
      const BATCH = 8;
      for (let i = 0; i < uploadFiles.length; i += BATCH) {
        const batch = uploadFiles.slice(i, i + BATCH);

        // Per-file conversion with isolated error handling — one bad HEIC won't block the rest
        const convertedResults = await Promise.all(
          batch.map(async (f) => {
            try {
              return { ok: true as const, file: await convertHeicIfNeeded(f), original: f };
            } catch (err) {
              console.warn("Skipping file (conversion failed):", f.name, err);
              return { ok: false as const, original: f };
            }
          })
        );

        const converted = convertedResults.filter((r) => r.ok).map((r) => r.file!);
        const skippedInBatch = convertedResults.length - converted.length;
        if (skippedInBatch) {
          heicSkipped += skippedInBatch;
        }

        if (converted.length === 0) {
          done += batch.length;
          setUploadProgress({ done, total: uploadFiles.length });
          continue;
        }

        try {
          const { data, error } = await supabase.functions.invoke("sign-s3-upload", {
            body: {
              files: converted.map((f) => ({ name: f.name, contentType: f.type || "image/jpeg" })),
              uploadedBy: uploaderName.trim() || null,
            },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const uploads = data.uploads as { photoId: string; uploadUrl: string }[];

          // Upload each file directly to S3 — isolate failures per file
          await Promise.all(uploads.map(async (u, idx) => {
            const file = converted[idx];
            try {
              const r = await fetch(u.uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type || "image/jpeg" },
                body: file,
              });
              if (!r.ok) throw new Error(`S3 upload failed: ${r.status}`);
              try {
                await supabase.functions.invoke("process-photo-now", { body: { photoId: u.photoId } });
              } catch (err) {
                console.error("Face processing failed (will retry via cron):", err);
              }
            } catch (err) {
              console.error("Per-file upload failed:", file.name, err);
              errors += 1;
            }
          }));
        } catch (e) {
          errors += converted.length;
          console.error(e);
        }
        done += batch.length;
        setUploadProgress({ done, total: uploadFiles.length });
        loadClusters();
      }
      if (heicSkipped) {
        toast.warning(`${heicSkipped} HEIC file${heicSkipped > 1 ? "s" : ""} couldn't be read in this browser. Try converting to JPEG, or upload from a different device.`);
      }
      if (errors) toast.error(`${errors} photo${errors > 1 ? "s" : ""} failed to upload`);
      const successful = done - errors - heicSkipped;
      if (successful > 0) toast.success(`Uploaded ${successful} photo${successful > 1 ? "s" : ""} and matched faces! 🎉`);
      setUploadFiles([]);
    } finally {
      setUploading(false);
    }
  };

  const saveClusterName = async (id: string) => {
    const newName = editName.trim();
    setEditingCluster(null);
    setClusters((cs) => cs.map((c) => (c.id === id ? { ...c, display_name: newName || null } : c)));
    try {
      const { error } = await supabase.functions.invoke("rename-cluster", { body: { id, name: newName } });
      if (error) throw error;
      toast.success("Renamed");
    } catch {
      toast.error("Failed to rename");
      loadClusters();
    }
  };

  const toggleHidden = async (c: Cluster) => {
    if (!adminPassword) return;
    const newHidden = !c.hidden;
    setClusters((cs) => cs.map((x) => (x.id === c.id ? { ...x, hidden: newHidden } : x)));
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-cluster`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ clusterId: c.id, hidden: newHidden }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      toast.success(newHidden ? "Hidden from home" : "Visible again");
    } catch {
      toast.error("Failed to update");
      loadClusters();
    }
  };

  const toggleClusterSelected = (id: string) => {
    setSelectedClusters((selected) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const unifySelectedClusters = async () => {
    if (!adminPassword || selectedClusters.size < 2) return;
    const [targetClusterId, ...sourceClusterIds] = [...selectedClusters];
    const target = clusters.find((c) => c.id === targetClusterId);
    if (!confirm(`Unify ${selectedClusters.size} person folders into “${target?.display_name || "the first selected folder"}”?`)) return;
    setMergingClusters(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merge-clusters`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ targetClusterId, sourceClusterIds }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success("Person folders unified");
      setSelectedClusters(new Set());
      loadClusters();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unify");
    } finally {
      setMergingClusters(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-soft)" }}>
        <Card className="max-w-md w-full p-8 text-center space-y-6" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mx-auto" style={{ background: "var(--gradient-romantic)" }}>
            <Sparkles className="w-10 h-10 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-serif text-foreground">You're in! 💕</h1>
            <p className="text-muted-foreground mt-2">
              We found <span className="font-bold text-primary">{result.photoCount}</span> photos of you so far.
              We'll keep adding more as new pics arrive.
            </p>
          </div>
          <Link to={`/album/${result.token}`}>
            <Button size="lg" className="w-full">View My Album</Button>
          </Link>
          <Button variant="outline" className="w-full" onClick={() => setResult(null)}>
            Back to home
          </Button>
          <p className="text-xs text-muted-foreground">
            Bookmark your album link — it's your private gallery.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="px-6 pt-12 pb-8 text-center">
        <div className="inline-flex items-center gap-2 text-primary mb-3">
          <Heart className="w-5 h-5 fill-current" />
          <span className="text-sm font-medium tracking-wide uppercase">Wedding Album</span>
          <Heart className="w-5 h-5 fill-current" />
        </div>
        <h1 className="text-4xl md:text-5xl font-serif text-foreground">
          Your personal wedding album
        </h1>
        <p className="text-muted-foreground mt-3 max-w-md mx-auto">
          Send a selfie and we'll find every photo you appear in — no scrolling through thousands of pics.
        </p>
      </header>

      <main className="px-6 pb-12">
        <Card className="max-w-md mx-auto p-6 space-y-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Your selfie 📸</label>
            <div className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-2xl p-6 bg-secondary/40">
              {selfie ? (
                <img src={selfie} alt="Your selfie" className="w-32 h-32 rounded-full object-cover" />
              ) : (
                <Camera className="w-10 h-10 text-muted-foreground" />
              )}
              {isMobile ? (
                <div className="flex gap-2 w-full">
                  <label
                    htmlFor="selfie-camera"
                    className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary"
                  >
                    <Camera className="w-4 h-4" />
                    Take photo
                  </label>
                  <label
                    htmlFor="selfie-gallery"
                    className="flex-1 flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary"
                  >
                    <Upload className="w-4 h-4" />
                    From gallery
                  </label>
                </div>
              ) : (
                <label
                  htmlFor="selfie-gallery"
                  className="w-full flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-xl bg-background border cursor-pointer hover:border-primary"
                >
                  <Upload className="w-4 h-4" />
                  Choose photo
                </label>
              )}
              <input
                id="selfie-camera"
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onSelfieFile(e.target.files[0])}
                disabled={loading}
              />
              <input
                id="selfie-gallery"
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onSelfieFile(e.target.files[0])}
                disabled={loading}
              />
            </div>
          </div>

          <Button onClick={submit} disabled={loading} size="lg" className="w-full">
            {loading ? "Doing the magic ✨" : "Find my photos"}
          </Button>
        </Card>

        {/* Public upload section */}
        <Card className="max-w-md mx-auto mt-6 p-6 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="text-center">
            <h2 className="text-lg font-serif text-foreground">Share your photos</h2>
            <p className="text-xs text-muted-foreground mt-1">Upload pics from the wedding so everyone can find themselves</p>
          </div>
          <Input
            value={uploaderName}
            onChange={(e) => setUploaderName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={60}
            disabled={uploading}
          />
          <label
            htmlFor="photos-upload-input"
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl p-6 cursor-pointer hover:border-primary transition-colors bg-secondary/40"
          >
            <Upload className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {uploadFiles.length ? `${uploadFiles.length} files selected` : "Tap to choose photos from your device"}
            </span>
            <input
              id="photos-upload-input"
              type="file"
              accept="image/*,video/*,.heic,.heif"
              multiple
              className="hidden"
              onChange={(e) => onUploadFiles(Array.from(e.target.files || []))}
              disabled={uploading}
            />
          </label>
          {uploading && (
            <div className="text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading {uploadProgress.done} / {uploadProgress.total}…
            </div>
          )}
          <Button onClick={startUpload} disabled={!uploadFiles.length || uploading} className="w-full">
            {uploading ? "Uploading…" : `Upload ${uploadFiles.length || ""} photos`}
          </Button>
        </Card>

        <div className="text-center mt-6">
          <Link to="/admin" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary">
            Admin
          </Link>
        </div>

        {/* Section visibility controls (admin only) */}
        {isAdmin && (
          <div className="max-w-5xl mx-auto mt-10 flex flex-wrap justify-center gap-2 text-xs">
            <Button type="button" size="sm" variant={showPeople ? "default" : "outline"} onClick={togglePeopleSection} className="gap-1">
              {showPeople ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Browse by person
            </Button>
            <Button type="button" size="sm" variant={showAllPhotos ? "default" : "outline"} onClick={toggleAllPhotosSection} className="gap-1">
              {showAllPhotos ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              All photos
            </Button>
          </div>
        )}

        {showPeople && clusters.length > 0 && (
          <section className="max-w-5xl mx-auto mt-12">
            <div className="flex items-end justify-between mb-4 px-1">
              <div>
                <h2 className="text-2xl md:text-3xl font-serif text-foreground">People &amp; Pets</h2>
                <p className="text-muted-foreground text-xs mt-1">
                  {clusters.length} {clusters.length === 1 ? "person" : "people"} recognized — tap a tile to see all their photos
                </p>
              </div>
              {isAdmin && selectedClusters.size > 0 && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={selectedClusters.size < 2 || mergingClusters}
                    onClick={unifySelectedClusters}
                  >
                    {mergingClusters ? "Unifying…" : `Unify (${selectedClusters.size})`}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedClusters(new Set())}>
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {clusters.map((c) => (
                <div key={c.id} className={`relative group ${c.hidden ? "opacity-50" : ""}`}>
                  <Link
                    to={`/person/${c.id}`}
                    className="block relative aspect-square rounded-3xl overflow-hidden bg-muted shadow-sm hover:shadow-md transition-shadow"
                  >
                    {c.cover_url ? (
                      <img
                        src={c.cover_url}
                        alt={c.display_name || "Person"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary">
                        <Users className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    {/* Gradient + name overlay */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 p-2.5 flex items-end justify-between gap-1">
                      {editingCluster === c.id ? null : (
                        <span className="text-white font-semibold text-sm truncate drop-shadow">
                          {c.display_name || "Add name"}
                        </span>
                      )}
                      <span className="text-white/80 text-[10px] font-medium shrink-0">{c.photo_count}</span>
                    </div>
                  </Link>

                  {/* Inline rename row (below tile) */}
                  {editingCluster === c.id ? (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveClusterName(c.id);
                          if (e.key === "Escape") setEditingCluster(null);
                        }}
                        className="h-7 text-xs px-2"
                        placeholder="Name"
                        maxLength={60}
                      />
                      <button onClick={() => saveClusterName(c.id)} className="text-primary p-1">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => setEditingCluster(null)} className="text-muted-foreground p-1">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setEditingCluster(c.id);
                        setEditName(c.display_name || "");
                      }}
                      className="absolute top-2 right-2 bg-background/80 hover:bg-background rounded-full p-1.5 shadow opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Rename"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}

                  {isAdmin && (
                    <>
                      <button
                        onClick={(e) => { e.preventDefault(); toggleHidden(c); }}
                        className="absolute top-2 left-2 bg-background/80 hover:bg-background rounded-full p-1.5 shadow"
                        title={c.hidden ? "Show on home" : "Hide from home"}
                      >
                        {c.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); toggleClusterSelected(c.id); }}
                        className={`absolute bottom-12 right-2 rounded-full px-2 py-0.5 text-[10px] shadow border ${selectedClusters.has(c.id) ? "bg-primary text-primary-foreground border-primary" : "bg-background/90 text-foreground border-border opacity-0 group-hover:opacity-100"}`}
                        title="Select for unifying"
                      >
                        {selectedClusters.has(c.id) ? "✓" : "Select"}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {showAllPhotos && allPhotos.length > 0 && (
          <section className="max-w-5xl mx-auto mt-16">
            <div className="mb-4 px-1">
              <h2 className="text-2xl md:text-3xl font-serif text-foreground">All photos</h2>
              <p className="text-muted-foreground text-xs mt-1">
                {allPhotos.length} memories from the day
              </p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {allPhotos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="relative aspect-square overflow-hidden rounded-xl bg-muted hover:opacity-90 transition-opacity"
                >
                  {p.media_type === "video" ? (
                    <>
                      <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                      <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">▶</span>
                    </>
                  ) : (
                    <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <Lightbox
        items={allPhotos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
        fileNamePrefix="wedding"
      />
    </div>
  );
};

export default Index;
