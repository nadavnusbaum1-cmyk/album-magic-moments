import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Heart, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AlbumData {
  guest: { name: string };
  photos: { url: string }[];
  count: number;
}

const Album = () => {
  const { token } = useParams();
  const [data, setData] = useState<AlbumData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke("get-album", {
          method: "GET" as const,
          body: undefined,
          headers: {},
        });
        // invoke doesn't support GET query params well; use fetch directly
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
      <header className="px-6 pt-10 pb-6 text-center">
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
      </header>

      <main className="px-4 pb-16 max-w-5xl mx-auto">
        {data.photos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            We'll notify you when new pics arrive ✨
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data.photos.map((p, i) => (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="aspect-square overflow-hidden rounded-2xl bg-muted hover:opacity-90 transition-opacity"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <img src={p.url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Album;
