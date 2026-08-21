// Single blog post. Route: /blog/:slug
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandMark } from "@/components/BrandMark";
import { Seo } from "@/components/Seo";
import { getPost } from "@/content/blog";

// Styled renderers so Markdown matches the HeyMori design.
const mdComponents = {
  h2: (p: any) => <h2 className="font-serif text-2xl mt-8 mb-3" {...p} />,
  h3: (p: any) => <h3 className="font-medium text-lg mt-6 mb-2" {...p} />,
  p: (p: any) => <p className="text-[15px] leading-relaxed text-foreground/90 my-4" {...p} />,
  ul: (p: any) => <ul className="list-disc ps-6 space-y-1.5 my-4 text-foreground/90" {...p} />,
  ol: (p: any) => <ol className="list-decimal ps-6 space-y-1.5 my-4 text-foreground/90" {...p} />,
  a: (p: any) => <a className="text-primary underline hover:opacity-80" {...p} />,
  blockquote: (p: any) => <blockquote className="border-s-4 border-primary/40 ps-4 italic text-muted-foreground my-4" {...p} />,
  img: (p: any) => <img className="rounded-2xl my-6 w-full" loading="lazy" {...p} />,
  strong: (p: any) => <strong className="font-semibold" {...p} />,
  h1: (p: any) => <h2 className="font-serif text-2xl mt-8 mb-3" {...p} />,
};

export default function BlogPost() {
  const { t } = useI18n();
  const { slug } = useParams();
  const post = slug ? getPost(slug) : undefined;

  if (!post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">הפוסט לא נמצא.</p>
        <Button asChild variant="outline"><Link to="/blog">לבלוג</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title={`${post.title} | HeyMori`} description={post.description} path={`/blog/${post.slug}`} image={post.cover} article={{ date: post.date, author: post.author }} />
      <FloatingLanguageSwitcher />
      <main id="main-content" className="max-w-2xl mx-auto px-5 py-12 md:py-16">
        <div className="flex items-center justify-between mb-8">
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> לבלוג
          </Link>
          <Link to="/" aria-label="HeyMori"><BrandMark className="text-lg" /></Link>
        </div>

        <article>
          <h1 className="font-serif text-3xl md:text-4xl leading-tight">{post.title}</h1>
          {post.date && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
              <CalendarDays className="w-3.5 h-3.5" /> {new Date(post.date).toLocaleDateString("he-IL")}
            </div>
          )}
          {post.cover && <img src={post.cover} alt="" className="rounded-2xl w-full mt-6" />}

          <div className="mt-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{post.body}</ReactMarkdown>
          </div>
        </article>

        {/* CTA */}
        <div className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="font-medium">רוצים אלבום אירוע חכם כזה? מורי תמצא לכל אורח את התמונות שלו.</p>
          <Button asChild className="mt-4"><Link to="/auth?mode=signup">{t("get_started")}</Link></Button>
        </div>
      </main>
    </div>
  );
}
