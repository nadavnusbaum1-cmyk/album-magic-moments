import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

const SITE = "https://heymori.co.il";
const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Parse the simple `--- frontmatter ---` block used by blog posts.
function parseFront(raw: string): Record<string, string> {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

type Route = { path: string; title: string; description?: string; image?: string; type?: string; article?: { date?: string; author?: string } };

// Pre-render one static HTML file per PUBLIC route with route-specific <head>
// meta, so search engines and social scrapers see correct tags without JS.
function prerenderMeta(): Plugin {
  return {
    name: "prerender-meta",
    apply: "build",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      const tpl = path.join(outDir, "index.html");
      if (!fs.existsSync(tpl)) return;
      const template = fs.readFileSync(tpl, "utf8");

      // Load blog posts from source markdown.
      const blogDir = path.resolve(__dirname, "src/content/blog");
      const posts = fs.existsSync(blogDir)
        ? fs.readdirSync(blogDir).filter((f) => f.endsWith(".md")).map((f) => {
            const meta = parseFront(fs.readFileSync(path.join(blogDir, f), "utf8"));
            return { slug: meta.slug || f.replace(/\.md$/, ""), ...meta };
          })
        : [];

      const routes: Route[] = [
        { path: "/", title: "HeyMori — האלבום החכם לאירועים שלכם", description: "מורי מוצאת לכל אורח את התמונות שלו מהאירוע. סורקים QR, שולחים סלפי, ומקבלים גלריה אישית — בלי אפליקציה.", image: "/hero-poster.jpg" },
        { path: "/blog", title: "בלוג HeyMori — טיפים לשיתוף תמונות מאירועים", description: "מדריכים וטיפים לשיתוף תמונות מאירועים, זיהוי פנים חכם, ואיך נותנים לכל אורח את התמונות שלו." },
        { path: "/contact", title: "צור קשר | HeyMori", description: "יש שאלה על HeyMori? דברו איתנו ונשמח לעזור." },
        { path: "/legal", title: "תנאי שימוש ומדיניות פרטיות | HeyMori", description: "תנאי השימוש ומדיניות הפרטיות של HeyMori." },
        { path: "/accessibility", title: "הצהרת נגישות | HeyMori", description: "הצהרת הנגישות של HeyMori בהתאם לתקן הישראלי ת\"י 5568." },
        ...posts.map((p): Route => ({
          path: `/blog/${p.slug}`,
          title: `${p.title || p.slug} | HeyMori`,
          description: p.description,
          image: p.cover || undefined,
          type: "article",
          article: { date: p.date, author: p.author || "HeyMori" },
        })),
      ];

      const base = template
        .replace(/<title>[\s\S]*?<\/title>/i, "")
        .replace(/<meta\s+name="description"[^>]*>/gi, "")
        .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
        .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
        .replace(/<meta\s+name="robots"[^>]*>/gi, "")
        .replace(/<meta\s+name="googlebot"[^>]*>/gi, "");

      const head = (r: Route) => {
        const url = SITE + r.path;
        const img = r.image ? (r.image.startsWith("http") ? r.image : SITE + r.image) : "";
        let h = `\n    <title>${esc(r.title)}</title>`;
        if (r.description) h += `\n    <meta name="description" content="${esc(r.description)}" />`;
        h += `\n    <meta name="robots" content="index, follow" />`;
        h += `\n    <link rel="canonical" href="${esc(url)}" />`;
        h += `\n    <meta property="og:title" content="${esc(r.title)}" />`;
        if (r.description) h += `\n    <meta property="og:description" content="${esc(r.description)}" />`;
        h += `\n    <meta property="og:type" content="${r.type || "website"}" />`;
        h += `\n    <meta property="og:url" content="${esc(url)}" />`;
        if (img) h += `\n    <meta property="og:image" content="${esc(img)}" />\n    <meta name="twitter:image" content="${esc(img)}" />`;
        h += `\n    <meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}" />`;
        if (r.article) {
          const ld: Record<string, unknown> = {
            "@context": "https://schema.org", "@type": "Article", headline: r.title, description: r.description,
            datePublished: r.article.date, mainEntityOfPage: url,
            author: { "@type": "Organization", name: r.article.author || "HeyMori" },
            publisher: { "@type": "Organization", name: "HeyMori", logo: { "@type": "ImageObject", url: SITE + "/favicon.svg" } },
          };
          if (img) ld.image = [img];
          h += `\n    <script type="application/ld+json">${JSON.stringify(ld)}</script>`;
        }
        return h;
      };

      for (const r of routes) {
        const html = base.replace("</head>", `${head(r)}\n  </head>`);
        const dest = r.path === "/" ? path.join(outDir, "index.html") : path.join(outDir, r.path.replace(/^\//, ""), "index.html");
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, html);
      }
      console.log(`[prerender-meta] wrote ${routes.length} static route HTML files`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "localhost",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), prerenderMeta()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
