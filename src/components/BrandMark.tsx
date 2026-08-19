// HeyMori wordmark — "Hey" in navy, "Mori" in purple. One consistent lockup.
export function BrandMark({ className = "", tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <span className={`inline-flex flex-col leading-none ${className}`}>
      <span className="font-extrabold tracking-tight">
        <span className="text-foreground">Hey</span><span className="text-primary">Mori</span>
      </span>
      {tagline && <span className="text-xs text-muted-foreground font-medium mt-1">Your AI photo buddy 💜</span>}
    </span>
  );
}
