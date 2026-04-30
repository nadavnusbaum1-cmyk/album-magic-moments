import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, CheckCircle2, Image as ImageIcon, Users, Trash2, Lock, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { HomeButton } from "@/components/HomeButton";
import { convertHeicIfNeeded } from "@/lib/imageUtils";

const ADMIN_KEY = "wedding-admin-password";

type GalleryPhoto = {
  id: string;
  url: string;
  face_count: number;
  processed: boolean;
  created_at: string;
  uploaded_by: string | null;
  media_type?: string;
};
const Admin = () => {
  const [adminPassword, setAdminPassword] = useState<string | null>(
    () => sessionStorage.getItem(ADMIN_KEY),
  );
  const [pwInput, setPwInput] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ name: string; matches: number; error?: string }[]>([]);
  const [tab, setTab] = useState("upload");
  const [gallery, setGallery] = useState<GalleryPhoto[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const loadGallery = async () => {
    setLoadingGallery(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-photos", { body: {} });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setGallery(data.photos || []);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load gallery");
    } finally {
      setLoadingGallery(false);
    }
  };

  useEffect(() => {
    if (tab === "all" && adminPassword) loadGallery();
  }, [tab, adminPassword]);

  const upload = async () => {
    if (!files.length) return;
    setUploading(true);
    setResults([]);
    try {
      const BATCH = 8;
      const allResults: typeof results = [];
      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        const converted = await Promise.all(batch.map((f) => convertHeicIfNeeded(f).catch(() => f)));
        try {
          const { data, error } = await supabase.functions.invoke("sign-s3-upload", {
            body: { files: converted.map((f) => ({ name: f.name, contentType: f.type || "image/jpeg" })) },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const uploads = data.uploads as { photoId: string; uploadUrl: string }[];
          await Promise.all(uploads.map(async (u, idx) => {
            const file = converted[idx];
            const r = await fetch(u.uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type || "image/jpeg" },
              body: file,
            });
            if (!r.ok) throw new Error(`S3 upload failed: ${r.status}`);
            // Run face recognition synchronously
            let matches = 0;
            try {
              const { data: pr } = await supabase.functions.invoke("process-photo-now", { body: { photoId: u.photoId } });
              matches = pr?.matches ?? 0;
            } catch (err) {
              console.error("Face processing failed:", err);
            }
            allResults.push({ name: file.name, matches });
          }));
          setResults([...allResults]);
        } catch (e) {
          batch.forEach((f) => allResults.push({ name: f.name, matches: 0, error: e instanceof Error ? e.message : "Failed" }));
          setResults([...allResults]);
        }
      }
      toast.success(`Uploaded ${allResults.length} photos with face matching done.`);
      setFiles([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const deletePhotos = async (ids: string[]) => {
    if (!ids.length || !adminPassword) return;
    if (!confirm(`Delete ${ids.length} photo${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-photos`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ photoIds: ids }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 401) {
          sessionStorage.removeItem(ADMIN_KEY);
          setAdminPassword(null);
          throw new Error("Wrong admin password");
        }
        throw new Error(j.error || "Delete failed");
      }
      toast.success(`Deleted ${j.deleted} photo${j.deleted === 1 ? "" : "s"}`);
      setGallery((g) => g.filter((p) => !ids.includes(p.id)));
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  if (!adminPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-soft)" }}>
        <HomeButton />
        <Card className="max-w-sm w-full p-6 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-serif">Admin login</h1>
          </div>
          <Input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Admin password"
            onKeyDown={(e) => {
              if (e.key === "Enter" && pwInput) {
                sessionStorage.setItem(ADMIN_KEY, pwInput);
                setAdminPassword(pwInput);
              }
            }}
          />
          <Button
            className="w-full"
            disabled={!pwInput}
            onClick={() => {
              sessionStorage.setItem(ADMIN_KEY, pwInput);
              setAdminPassword(pwInput);
            }}
          >
            Enter
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--gradient-soft)" }}>
      <HomeButton />
      <div className="max-w-4xl mx-auto pt-10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-serif text-foreground">Admin</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              sessionStorage.removeItem(ADMIN_KEY);
              setAdminPassword(null);
            }}
          >
            Sign out
          </Button>
        </div>
        <p className="text-muted-foreground mb-6">Upload event photos and manage the gallery.</p>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="w-4 h-4" /> Upload
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              <ImageIcon className="w-4 h-4" /> All Photos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <Card className="p-6 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <label
                htmlFor="photos-input"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl p-10 cursor-pointer hover:border-primary transition-colors bg-secondary/40"
              >
                <Upload className="w-10 h-10 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {files.length ? `${files.length} files selected` : "Tap to select photos"}
                </span>
                <input
                  id="photos-input"
                  type="file"
                  accept="image/*,video/*,.heic,.heif"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  disabled={uploading}
                />
              </label>

              <Button onClick={upload} disabled={!files.length || uploading} size="lg" className="w-full">
                {uploading ? "Processing…" : `Upload ${files.length || ""} photos`}
              </Button>
            </Card>

            {results.length > 0 && (
              <Card className="mt-6 p-6">
                <h2 className="font-medium mb-3">Results</h2>
                <ul className="space-y-2 text-sm">
                  {results.map((r, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        {r.name}
                      </span>
                      <span className="text-muted-foreground">
                        {r.error ? `❌ ${r.error}` : `${r.matches} match${r.matches === 1 ? "" : "es"}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="all">
            <Card className="p-6" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="font-medium">{gallery.length} photos</h2>
                <div className="flex gap-2 flex-wrap">
                  {gallery.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selected.size === gallery.length) setSelected(new Set());
                        else setSelected(new Set(gallery.map((p) => p.id)));
                      }}
                      className="gap-2"
                    >
                      {selected.size === gallery.length ? <Square className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                      {selected.size === gallery.length ? "Clear" : "Select all"}
                    </Button>
                  )}
                  {selected.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting}
                      onClick={() => deletePhotos([...selected])}
                      className="gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete {selected.size}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={loadGallery} disabled={loadingGallery}>
                    {loadingGallery ? "Refreshing…" : "Refresh"}
                  </Button>
                </div>
              </div>
              {loadingGallery && gallery.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
              ) : gallery.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No photos uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {gallery.map((p) => {
                    const isSelected = selected.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className={`relative group rounded-xl overflow-hidden bg-muted aspect-square cursor-pointer ring-2 transition-all ${
                          isSelected ? "ring-primary" : "ring-transparent"
                        }`}
                        onClick={() => toggleSelect(p.id)}
                      >
                        {p.media_type === "video" ? (
                          <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                        ) : (
                          <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        )}
                        <div className="absolute top-1 left-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-5 h-5 accent-primary"
                          />
                        </div>
                        <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between gap-1 pointer-events-none">
                          <div className="bg-background/85 backdrop-blur text-[10px] rounded-md px-1.5 py-0.5 truncate max-w-[70%]">
                            {p.uploaded_by || "Anonymous"}
                          </div>
                          <div className="bg-background/85 backdrop-blur text-xs rounded-full px-2 py-0.5 flex items-center gap-1 pointer-events-auto">
                            <Users className="w-3 h-3" />
                            {p.face_count}
                          </div>
                        </div>
                        <div className="absolute top-1 right-1 flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePhotos([p.id]);
                            }}
                            className="bg-destructive/90 text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Delete photo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
