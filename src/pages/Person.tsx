import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { HomeButton } from "@/components/HomeButton";
import { Button } from "@/components/ui/button";
import { Heart, Download, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { downloadOne, downloadManyAsZip } from "@/lib/download";
import { FaceCrop, type FaceBBox } from "@/components/FaceCrop";

const ADMIN_KEY = "wedding-admin-password";

type PhotoItem = { id: string; url: string; bbox?: FaceBBox | null; media_type?: string };

const Person = () => {
  const { id } = useParams();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-photos?id=${id}`;
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Failed");
        setPhotos(j.photos || []);
        setDisplayName(j.display_name || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  const downloadAll = async () => {
    if (!photos.length) return;
    setZipping({ done: 0, total: photos.length });
    try {
      await downloadManyAsZip(
        photos.map((p, i) => ({ url: p.url, name: `${displayName || "person"}-${i + 1}.jpg` })),
        `${displayName || "person"}-photos.zip`,
        (done, total) => setZipping({ done, total }),
      );
      toast.success("Download ready");
    } catch {
      toast.error("Some photos failed to download");
    } finally {
      setZipping(null);
    }
  };

  const adminPassword = typeof window !== "undefined" ? sessionStorage.getItem(ADMIN_KEY) : null;
  const isAdmin = !!adminPassword;

  const setCover = async (photoId: string) => {
    if (!adminPassword || !id) return;
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-cluster`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ clusterId: id, coverPhotoId: photoId }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      toast.success("Cover photo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <HomeButton />
      <header className="px-6 pt-16 pb-6 text-center">
        <div className="inline-flex items-center gap-2 text-primary mb-2">
          <Heart className="w-4 h-4 fill-current" />
          <span className="text-xs uppercase tracking-wider">Person folder</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-foreground">
          {displayName || "Photos of this person"}
        </h1>
        <p className="text-muted-foreground mt-2">
          {loading ? "Loading…" : `${photos.length} photo${photos.length === 1 ? "" : "s"}`}
        </p>
        {photos.length > 0 && (
          <div className="mt-4">
            <Button onClick={downloadAll} disabled={!!zipping} size="sm" className="gap-2">
              {zipping ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Preparing {zipping.done}/{zipping.total}…</>
              ) : (
                <><Download className="w-4 h-4" /> Download all</>
              )}
            </Button>
          </div>
        )}
      </header>
      <main className="px-4 pb-16 max-w-5xl mx-auto">
        {error && <p className="text-destructive text-center">{error}</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((p, i) => (
            <div
              key={p.id}
              className="relative group aspect-square overflow-hidden rounded-2xl bg-muted"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <a href={p.url} target="_blank" rel="noreferrer" className="block w-full h-full">
                {p.media_type === "video" ? (
                  <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                ) : (
                  <FaceCrop src={p.url} bbox={p.bbox} rounded={false} zoom={3} alt="" />
                )}
              </a>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  downloadOne(p.url, `${displayName || "person"}-${i + 1}.jpg`)
                    .catch(() => toast.error("Download failed"));
                }}
                className="absolute top-2 right-2 bg-background/90 hover:bg-background text-foreground rounded-full p-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow"
                aria-label="Download photo"
              >
                <Download className="w-4 h-4" />
              </button>
              {isAdmin && (
                <button
                  onClick={(e) => { e.preventDefault(); setCover(p.id); }}
                  className="absolute top-2 left-2 bg-background/90 hover:bg-background text-foreground rounded-full p-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow"
                  aria-label="Set as cover"
                  title="Set as cover photo"
                >
                  <Star className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Person;
