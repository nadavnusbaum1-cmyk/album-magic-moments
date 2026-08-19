// Mori — the HeyMori brand character. Renders an avatar image by expression.
//
// ▶ Drop the exported avatar PNGs into  public/mori/<expression>.png
//   e.g. public/mori/waving.png, searching.png, celebrating.png, thinking.png,
//   sorry.png, phone.png, pointing.png, sleeping.png
//   Until a file exists the component renders nothing (no broken image), so it's
//   safe to place Mori anywhere now and the art fills in once you add the files.
import { useState } from "react";

export type MoriExpression =
  | "waving" | "smiling" | "excited" | "pointing" | "thinking" | "searching"
  | "celebrating" | "phone" | "photos" | "confused" | "sorry" | "sleeping";

export function Mori({
  expression = "smiling",
  size = 96,
  className = "",
  alt = "Mori",
}: {
  expression?: MoriExpression;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={`/mori/${expression}.png`}
      width={size}
      height={size}
      alt={alt}
      onError={() => setFailed(true)}
      className={`inline-block select-none ${className}`}
      style={{ width: size, height: size, objectFit: "contain" }}
      draggable={false}
    />
  );
}
