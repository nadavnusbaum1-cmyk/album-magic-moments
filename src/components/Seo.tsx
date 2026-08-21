// Per-page SEO: title, description, canonical, Open Graph / Twitter, and
// optional Article JSON-LD (for blog posts → rich results in Google).
import { useEffect } from "react";

const SITE = "https://heymori.co.il";

function setTag(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function Seo({
  title,
  description,
  path,
  image,
  article,
}: {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  article?: { date?: string; author?: string };
}) {
  useEffect(() => {
    const url = SITE + (path || window.location.pathname);
    document.title = title;
    if (description) setTag("name", "description", description);
    setTag("property", "og:title", title);
    if (description) setTag("property", "og:description", description);
    setTag("property", "og:type", article ? "article" : "website");
    setTag("property", "og:url", url);
    setCanonical(url);
    if (image) {
      const img = image.startsWith("http") ? image : SITE + image;
      setTag("property", "og:image", img);
      setTag("name", "twitter:image", img);
    }
    setTag("name", "twitter:card", image ? "summary_large_image" : "summary");

    const id = "seo-jsonld";
    document.getElementById(id)?.remove();
    if (article) {
      const ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = id;
      ld.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        datePublished: article.date,
        mainEntityOfPage: url,
        image: image ? [image.startsWith("http") ? image : SITE + image] : undefined,
        author: { "@type": "Organization", name: article.author || "HeyMori" },
        publisher: { "@type": "Organization", name: "HeyMori", logo: { "@type": "ImageObject", url: SITE + "/favicon.svg" } },
      });
      document.head.appendChild(ld);
    }
  }, [title, description, path, image, article?.date, article?.author]);

  return null;
}
