import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { HomeButton } from "@/components/HomeButton";
import { Heart } from "lucide-react";

const Person = () => {
  const { id } = useParams();
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      </header>
      <main className="px-4 pb-16 max-w-5xl mx-auto">
        {error && <p className="text-destructive text-center">{error}</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="aspect-square overflow-hidden rounded-2xl bg-muted hover:opacity-90 transition-opacity"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </a>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Person;
