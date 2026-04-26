import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, CheckCircle2, Image as ImageIcon, Users } from "lucide-react";
import { toast } from "sonner";

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

type GalleryPhoto = {
  id: string;
  url: string;
  face_count: number;
  processed: boolean;
  created_at: string;
};

const Admin = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ name: string; matches: number; error?: string }[]>([]);
  const [tab, setTab] = useState("upload");
  const [gallery, setGallery] = useState<GalleryPhoto[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);

  const loadGallery = async () => {
    setLoadingGallery(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-photos", { body: {} });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setGallery(data.photos || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load gallery");
    } finally {
      setLoadingGallery(false);
    }
  };

  useEffect(() => {
    if (tab === "all") loadGallery();
  }, [tab]);

  const upload = async () => {
    if (!files.length) return;
    setUploading(true);
    setResults([]);
    try {
      const allResults: typeof results = [];
      for (let i = 0; i < files.length; i += 3) {
        const batch = files.slice(i, i + 3);
        const photos = await Promise.all(
          batch.map(async (f) => ({ name: f.name, base64: await fileToBase64(f) })),
        );
        const { data, error } = await supabase.functions.invoke("upload-photos", {
          body: { photos },
        });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        allResults.push(...data.results);
        setResults([...allResults]);
      }
      toast.success(`Processed ${allResults.length} photos`);
      setFiles([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--gradient-soft)" }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-serif text-foreground mb-2">Photographer Admin</h1>
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
                  accept="image/*"
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-medium">{gallery.length} photos</h2>
                <Button variant="outline" size="sm" onClick={loadGallery} disabled={loadingGallery}>
                  {loadingGallery ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
              {loadingGallery && gallery.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
              ) : gallery.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No photos uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {gallery.map((p) => (
                    <div key={p.id} className="relative group rounded-xl overflow-hidden bg-muted aspect-square">
                      <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute bottom-1 right-1 bg-background/80 backdrop-blur text-xs rounded-full px-2 py-0.5 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {p.face_count}
                      </div>
                    </div>
                  ))}
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
