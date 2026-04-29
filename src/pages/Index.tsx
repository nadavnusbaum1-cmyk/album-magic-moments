import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Camera, Sparkles, Upload, Heart, Users, Pencil, Check, X, Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { convertHeicIfNeeded } from "@/lib/imageUtils";

const ADMIN_KEY = "wedding-admin-password";

type Cluster = { id: string; cover_url: string | null; photo_count: number; display_name: string | null; hidden?: boolean };

const Index = () => {
  const [selfie, setSelfie] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ token: string; photoCount: number } | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [editingCluster, setEditingCluster] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Public uploads
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploaderName, setUploaderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  const adminPassword = typeof window !== "undefined" ? sessionStorage.getItem(ADMIN_KEY) : null;
  const isAdmin = !!adminPassword;

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

  useEffect(() => {
    loadClusters();
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
    try {
      // Direct-to-S3 upload in batches: get pre-signed URLs, then PUT files in parallel.
      // Face recognition runs in the background by the cron-driven process-photos function.
      const BATCH = 8;
      for (let i = 0; i < uploadFiles.length; i += BATCH) {
        const batch = uploadFiles.slice(i, i + BATCH);
        // Convert HEIC if needed
        const converted = await Promise.all(batch.map((f) => convertHeicIfNeeded(f).catch(() => f)));
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

          // Upload files directly to S3 in parallel
          await Promise.all(uploads.map(async (u, idx) => {
            const file = converted[idx];
            const r = await fetch(u.uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type || "image/jpeg" },
              body: file,
            });
            if (!r.ok) throw new Error(`S3 upload failed: ${r.status}`);
          }));
        } catch (e) {
          errors += batch.length;
          console.error(e);
        }
        done += batch.length;
        setUploadProgress({ done, total: uploadFiles.length });
      }
      if (errors) toast.error(`${errors} photos failed to upload`);
      else toast.success(`Uploaded ${done} photos! Face matching runs in the background.`);
      setUploadFiles([]);
      // Wait a moment for first batch to be processed, then refresh clusters
      setTimeout(loadClusters, 5000);
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
            <label
              htmlFor="selfie-input"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl p-8 cursor-pointer hover:border-primary transition-colors bg-secondary/40"
            >
              {selfie ? (
                <img src={selfie} alt="Your selfie" className="w-32 h-32 rounded-full object-cover" />
              ) : (
                <>
                  <Camera className="w-10 h-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Tap to take or upload a selfie</span>
                </>
              )}
              <input
                id="selfie-input"
                type="file"
                accept="image/*,.heic,.heif"
                capture="user"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onSelfieFile(e.target.files[0])}
                disabled={loading}
              />
            </label>
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
              accept="image/*,.heic,.heif"
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

        {clusters.length > 0 && (
          <section className="max-w-5xl mx-auto mt-16">
            <div className="text-center mb-6">
              <h2 className="text-2xl md:text-3xl font-serif text-foreground">Browse by person</h2>
              <p className="text-muted-foreground text-sm mt-2">
                {clusters.length} {clusters.length === 1 ? "person" : "people"} recognized — tap a name to label
              </p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {clusters.map((c) => (
                <div key={c.id} className="flex flex-col items-center gap-2">
                  <Link
                    to={`/person/${c.id}`}
                    className="aspect-square w-full rounded-full overflow-hidden bg-muted border-2 border-transparent hover:border-primary transition-colors"
                  >
                    {c.cover_url ? (
                      <img src={c.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </Link>

                  {editingCluster === c.id ? (
                    <div className="flex items-center gap-1 w-full">
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
                      onClick={() => {
                        setEditingCluster(c.id);
                        setEditName(c.display_name || "");
                      }}
                      className="text-xs text-foreground hover:text-primary inline-flex items-center gap-1 group"
                    >
                      <span className="truncate max-w-[80px]">
                        {c.display_name || "Add name"}
                      </span>
                      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
                    </button>
                  )}
                  <span className="text-[10px] text-muted-foreground">{c.photo_count} photos</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Index;
