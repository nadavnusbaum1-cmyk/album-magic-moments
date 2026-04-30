// Renders an image cropped & zoomed to a face bounding box (from AWS Rekognition).
// bbox is normalized 0-1: { Width, Height, Left, Top }.
// We use background-image so we can scale & position to focus on the face.
import { CSSProperties } from "react";

export type FaceBBox = { Width: number; Height: number; Left: number; Top: number };

interface Props {
  src: string;
  bbox?: FaceBBox | null;
  className?: string;
  // Controls how tight to crop. 1 = bbox edges, 2.5 = nice headshot framing.
  zoom?: number;
  alt?: string;
  rounded?: boolean;
}

export function FaceCrop({ src, bbox, className = "", zoom = 2.4, alt = "", rounded = true }: Props) {
  if (!bbox) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`w-full h-full object-cover ${rounded ? "rounded-full" : ""} ${className}`}
      />
    );
  }
  // Center of face in normalized coords
  const cx = bbox.Left + bbox.Width / 2;
  const cy = bbox.Top + bbox.Height / 2;
  // The displayed crop should be roughly bbox * zoom of the original image.
  // background-size of (1/cropFraction)*100% scales the image so the crop fills.
  const cropFracX = Math.min(1, Math.max(0.05, bbox.Width * zoom));
  const cropFracY = Math.min(1, Math.max(0.05, bbox.Height * zoom));
  const cropFrac = Math.max(cropFracX, cropFracY);
  const sizePct = (1 / cropFrac) * 100;
  // background-position: percentage means "this point of the image aligns with same point of container".
  // Convert center to percentage; clamp so we don't show empty.
  const halfFrac = cropFrac / 2;
  const minC = halfFrac;
  const maxC = 1 - halfFrac;
  const px = ((Math.min(maxC, Math.max(minC, cx)) - halfFrac) / (1 - cropFrac)) * 100;
  const py = ((Math.min(maxC, Math.max(minC, cy)) - halfFrac) / (1 - cropFrac)) * 100;
  const style: CSSProperties = {
    backgroundImage: `url(${JSON.stringify(src)})`,
    backgroundSize: `${sizePct}% ${sizePct}%`,
    backgroundPosition: `${isFinite(px) ? px : 50}% ${isFinite(py) ? py : 50}%`,
    backgroundRepeat: "no-repeat",
  };
  return (
    <div
      role="img"
      aria-label={alt}
      style={style}
      className={`w-full h-full ${rounded ? "rounded-full" : ""} ${className}`}
    />
  );
}
