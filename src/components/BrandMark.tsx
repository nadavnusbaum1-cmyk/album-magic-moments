// HeyMori wordmark — "Hey" navy, "Mori" purple. Optionally with Mori's avatar.
import { Mori, type MoriExpression } from "./Mori";

export function BrandMark({
  className = "",
  tagline = false,
  avatar = false,
  avatarSize = 38,
  avatarExpression = "waving",
}: {
  className?: string;
  tagline?: boolean;
  avatar?: boolean;
  avatarSize?: number;
  avatarExpression?: MoriExpression;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {avatar && <Mori expression={avatarExpression} size={avatarSize} className="shrink-0 -my-1" />}
      <span className="inline-flex flex-col leading-none">
        <span className="font-extrabold tracking-tight">
          <span className="text-foreground">Hey</span><span className="text-primary">Mori</span>
        </span>
        {tagline && <span className="text-xs text-muted-foreground font-medium mt-1">Your AI photo buddy 💜</span>}
      </span>
    </span>
  );
}
