// Pixieset helpers. The gallery is enumerated in the photographer's own browser
// (it sits behind Cloudflare, which blocks server-side reads), which POSTs a
// manifest to import-pixieset. The server only needs to turn a stored image BASE
// into a size-variant URL — the image CDN itself is open server-side.
//
// source_url holds the protocol-relative base, e.g.
//   //images.pixieset.com/347996511/<hash>
// and a variant is base + "-<size>.jpg".

/** Build a size-variant URL from a stored Pixieset base. */
export function pixiesetVariant(
  base: string,
  size: "thumb" | "small" | "medium" | "large" | "xlarge" | "xxlarge",
): string {
  const b = base.startsWith("//") ? `https:${base}` : base;
  return `${b}-${size}.jpg`;
}
