import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Heart, Download, Loader2, Share2 } from "lucide-react";
import { HomeButton } from "@/components/HomeButton";
import { toast } from "sonner";
import { downloadOne, downloadManyAsZip } from "@/lib/download";
import { Lightbox } from "@/components/Lightbox";

interface AlbumData {
  guest: { name: string };
  photos: { url: string; media_type?: string }[];
  count: number;
}

const Album = () => {
  const { token } = useParams();
  const [data, setData] = useState<AlbumData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const shareAlbum = async () => {
    const shareUrl = window.location.href;
    const title = data ? `${data.guest.name}'s wedding photos` : "My wedding album";
    const text = "Check out my personal wedding album 💕";
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Album link copied!");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast.success("Album link copied!");
        } catch {
          toast.error("Could not share link");
        }
      }
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke("get-album", {
          method: "GET" as const,
          body: undefined,
          headers: {},
        });
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-album?token=${token}`;
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed");
        setData(json);
        void res; void error;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load album");
      }
    };
    if (token) load();
  }, [token]);

  const downloadAll = async () => {
    if (!data?.photos.length) return;
    setZipping({ done: 0, total: data.photos.length });
    try {
      await downloadManyAsZip(
        data.photos.map((p, i) => ({ url: p.url, name: `${data.guest.name}-${i + 1}.jpg` })),
        `${data.guest.name}-photos.zip`,
        (done, total) => setZipping({ done, total }),
      );
      toast.success("Download ready");
    } catch {
      toast.error("Some photos failed to download");
    } finally {
      setZipping(null);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading your album…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <HomeButton />
      <header className="px-6 pt-16 pb-6 text-center">
        <div className="inline-flex items-center gap-2 text-primary mb-2">
          <Heart className="w-4 h-4 fill-current" />
          <span className="text-xs uppercase tracking-wider">Personal Album</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-foreground">
          Hi {data.guest.name} 👋
        </h1>
        <p className="text-muted-foreground mt-2">
          {data.count === 0 ? "No photos yet — check back soon!" : `${data.count} photos of you`}
        </p>
        {data.photos.length > 0 && (
          <div className="mt-4 flex gap-2 justify-center flex-wrap">
            <Button onClick={downloadAll} disabled={!!zipping} size="sm" className="gap-2">
              {zipping ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Preparing {zipping.done}/{zipping.total}…</>
              ) : (
                <><Download className="w-4 h-4" /> Download all</>
              )}
            </Button>
            <Button onClick={shareAlbum} size="sm" variant="outline" className="gap-2">
              <Share2 className="w-4 h-4" /> Share my album
            </Button>
          </div>
        )}
      </header>

      <main className="px-4 pb-16 max-w-5xl mx-auto">
        {data.photos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            We'll notify you when new pics arrive ✨
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data.photos.map((p, i) => (
              <div
                key={i}
                className="relative group aspect-square overflow-hidden rounded-2xl bg-muted"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <button
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="block w-full h-full"
                  aria-label="Open photo"
                >
                  {p.media_type === "video" ? (
                    <video src={p.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    <img src={p.url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    downloadOne(p.url, `${data.guest.name}-${i + 1}.jpg`)
                      .catch(() => toast.error("Download failed"));
                  }}
                  className="absolute top-2 right-2 bg-background/90 hover:bg-background text-foreground rounded-full p-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow"
                  aria-label="Download photo"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
      <Lightbox
        items={data.photos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
        fileNamePrefix={data.guest.name}
      />
    </div>
  );
};

export default Album;
