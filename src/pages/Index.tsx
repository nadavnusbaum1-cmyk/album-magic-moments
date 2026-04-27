import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Camera, Sparkles, Upload, Heart, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type Cluster = { id: string; cover_url: string | null; photo_count: number };

const Index = () => {
  const [name, setName] = useState("");
  const [selfie, setSelfie] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ token: string; photoCount: number } | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);

  const loadClusters = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("list-clusters", { body: {} });
      if (error) throw error;
      if (!data?.error) setClusters(data.clusters || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadClusters();
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
            <Upload className="w-4 h-4" /> Upload photos
          </Link>
        </div>

        {clusters.length > 0 && (
          <section className="max-w-5xl mx-auto mt-16">
            <div className="text-center mb-6">
              <h2 className="text-2xl md:text-3xl font-serif text-foreground">Browse by person</h2>
              <p className="text-muted-foreground text-sm mt-2">
                {clusters.length} {clusters.length === 1 ? "person" : "people"} recognized in the photos
              </p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {clusters.map((c) => (
                <Link
                  key={c.id}
                  to={`/person/${c.id}`}
                  className="group flex flex-col items-center gap-2"
                >
                  <div className="aspect-square w-full rounded-full overflow-hidden bg-muted border-2 border-transparent group-hover:border-primary transition-colors">
                    {c.cover_url ? (
                      <img src={c.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{c.photo_count} photos</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Index;
