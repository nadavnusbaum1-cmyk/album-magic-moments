import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Camera, Sparkles, Upload, Heart, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type GalleryPhoto = {
  id: string;
  url: string;
  face_count: number;
  processed: boolean;
  created_at: string;
};

const Index = () => {
  const [name, setName] = useState("");
  const [selfie, setSelfie] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ token: string; photoCount: number } | null>(null);
  const [gallery, setGallery] = useState<GalleryPhoto[]>([]);

  const loadGallery = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("list-photos", { body: {} });
      if (error) throw error;
      if (!data?.error) setGallery(data.photos || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadGallery();
  }, []);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setSelfie(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!name.trim() || !selfie) {
      toast.error("Add your name and a selfie ✨");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-guest", {
        body: { name: name.trim(), selfieBase64: selfie },
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
          <p className="text-xs text-muted-foreground">
            Bookmark this link — it's your private gallery.
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
            <label className="text-sm font-medium text-foreground mb-2 block">Your name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maya Cohen"
              disabled={loading}
            />
          </div>

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
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                disabled={loading}
              />
            </label>
          </div>

          <Button onClick={submit} disabled={loading} size="lg" className="w-full">
            {loading ? "Doing the magic ✨" : "Find my photos"}
          </Button>
        </Card>

        <div className="text-center mt-8">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
            <Upload className="w-4 h-4" /> Photographer? Upload event photos
          </Link>
        </div>

        {gallery.length > 0 && (
          <section className="max-w-5xl mx-auto mt-16">
            <div className="text-center mb-6">
              <h2 className="text-2xl md:text-3xl font-serif text-foreground">All wedding photos</h2>
              <p className="text-muted-foreground text-sm mt-2">
                {gallery.length} {gallery.length === 1 ? "photo" : "photos"} from the celebration
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {gallery.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative group rounded-xl overflow-hidden bg-muted aspect-square block"
                >
                  <img
                    src={p.url}
                    alt="Wedding moment"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  {p.face_count > 0 && (
                    <div className="absolute bottom-1 right-1 bg-background/80 backdrop-blur text-xs rounded-full px-2 py-0.5 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {p.face_count}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Index;
