// Blog posts — each is a Markdown file in ./blog/*.md with simple frontmatter:
//
//   ---
//   title: כותרת הפוסט
//   description: תיאור קצר ל-SEO ולכרטיס
//   date: 2026-08-21
//   cover: /blog/cover-slug.jpg      (optional, in public/)
//   author: HeyMori                  (optional)
//   ---
//   גוף הפוסט ב-Markdown…
//
// The slug comes from the filename (finding-photos.md → /blog/finding-photos).
// Add a post = drop a new .md file here and add its URL to public/sitemap.xml.

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  cover?: string;
  author: string;
  body: string;
};

const files = import.meta.glob("./blog/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function parse(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[k] = v;
  }
  return { meta, body: m[2].trim() };
}

export const posts: Post[] = Object.entries(files)
  .map(([path, raw]) => {
    const { meta, body } = parse(raw);
    const slug = meta.slug || path.split("/").pop()!.replace(/\.md$/, "");
    return {
      slug,
      title: meta.title || slug,
      description: meta.description || "",
      date: meta.date || "",
      cover: meta.cover || undefined,
      author: meta.author || "HeyMori",
      body,
    };
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1));

export const getPost = (slug: string) => posts.find((p) => p.slug === slug);
