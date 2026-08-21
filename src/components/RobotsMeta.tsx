// Per-route search-engine indexing control.
// Marketing pages are indexable; everything else (private albums, guest upload,
// dashboard, admin, auth) is noindex — albums are unlisted and link-only.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const INDEXABLE = new Set(["/", "/contact", "/legal", "/terms", "/privacy", "/accessibility"]);

function setMeta(name: string, content: string) {
  let el = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function RobotsMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const indexable = INDEXABLE.has(pathname) || pathname === "/blog" || pathname.startsWith("/blog/");
    const value = indexable ? "index, follow" : "noindex, nofollow";
    setMeta("robots", value);
    setMeta("googlebot", value);
  }, [pathname]);
  return null;
}
