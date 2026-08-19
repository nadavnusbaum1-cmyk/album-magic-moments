// Terms of Use & Privacy Policy. Route: /legal
// Content lives in src/content/legal.ts (Hebrew + English).
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { legal } from "@/content/legal";

type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "muted"; text: string }
  | { type: "ul"; items: string[] };

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] | null = null;
  const flush = () => { if (list) { blocks.push({ type: "ul", items: list }); list = null; } };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("## ")) { flush(); blocks.push({ type: "h2", text: line.slice(3) }); }
    else if (line.startsWith("# ")) { flush(); blocks.push({ type: "h1", text: line.slice(2) }); }
    else if (line.startsWith("* ") || line.startsWith("- ")) { if (!list) list = []; list.push(line.slice(2)); }
    else if (line.startsWith("_") && line.endsWith("_")) { flush(); blocks.push({ type: "muted", text: line.slice(1, -1) }); }
    else { flush(); blocks.push({ type: "p", text: line }); }
  }
  flush();
  return blocks;
}

export default function Legal() {
  const { lang, dir, t } = useI18n();
  const blocks = parse(legal[lang]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FloatingLanguageSwitcher />
      <main id="main-content" className="max-w-3xl mx-auto px-5 py-12 md:py-16" dir={dir}>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("home")}
        </Link>

        <article className="space-y-4 leading-relaxed">
          {blocks.map((b, i) => {
            if (b.type === "h1") return <h1 key={i} className="font-serif text-3xl md:text-4xl mb-1">{b.text}</h1>;
            if (b.type === "muted") return <p key={i} className="text-xs text-muted-foreground !mt-0 mb-6">{b.text}</p>;
            if (b.type === "h2") return <h2 key={i} className="font-medium text-lg mt-8 pt-2">{b.text}</h2>;
            if (b.type === "ul") return (
              <ul key={i} className="list-disc space-y-1.5 text-muted-foreground ps-6">
                {b.items.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            );
            return <p key={i} className="text-muted-foreground">{b.text}</p>;
          })}
        </article>
      </main>
    </div>
  );
}
