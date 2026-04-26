import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const Admin = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ name: string; matches: number; error?: string }[]>([]);

  const upload = async () => {
    if (!files.length) return;
    setUploading(true);
    setResults([]);
    try {
      // Process in batches of 3 to avoid huge payloads
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
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-serif text-foreground mb-2">Photographer Upload</h1>
        <p className="text-muted-foreground mb-6">Bulk upload event photos. Faces are matched automatically.</p>

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
      </div>
    </div>
  );
};

export default Admin;
