// Marketing landing — points hosts to /auth and explains the SaaS.
import { Link } from "react-router-dom";
import { Heart, Sparkles, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Index() {
  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <header className="px-6 pt-16 pb-10 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 text-primary mb-3">
          <Heart className="w-5 h-5 fill-current" />
          <span className="text-sm uppercase tracking-wide">Album Magic Moments</span>
          <Heart className="w-5 h-5 fill-current" />
        </div>
        <h1 className="text-4xl md:text-6xl font-serif">Personal photo albums for every guest</h1>
        <p className="text-muted-foreground mt-4 text-lg">Upload thousands of event photos. Guests snap a selfie and instantly get every photo &amp; video they appear in.</p>
        <div className="flex gap-3 justify-center mt-6">
          <Link to="/auth"><Button size="lg">Get started</Button></Link>
          <Link to="/dashboard"><Button size="lg" variant="outline">My dashboard</Button></Link>
        </div>
      </header>

      <main className="px-6 pb-20 max-w-5xl mx-auto grid md:grid-cols-3 gap-4">
        <Card className="p-6"><Camera className="w-8 h-8 text-primary mb-2" /><h3 className="font-serif text-lg">Bulk upload</h3><p className="text-sm text-muted-foreground mt-1">Drag &amp; drop photos and videos. HEIC auto-converts.</p></Card>
        <Card className="p-6"><Sparkles className="w-8 h-8 text-primary mb-2" /><h3 className="font-serif text-lg">AI face matching</h3><p className="text-sm text-muted-foreground mt-1">Auto-clusters people; guests find themselves with a selfie.</p></Card>
        <Card className="p-6"><Heart className="w-8 h-8 text-primary mb-2" /><h3 className="font-serif text-lg">Personal albums</h3><p className="text-sm text-muted-foreground mt-1">Each guest gets a private link to their own album.</p></Card>
      </main>
    </div>
  );
}
