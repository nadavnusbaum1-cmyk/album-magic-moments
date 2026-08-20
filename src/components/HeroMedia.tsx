// Hero demo media — an autoplay/looping product clip, memzo-style.
//
// ▶ To show a real video: drop a short looping clip at  public/hero-demo.mp4
//   (and optionally a still frame at  public/hero-poster.jpg ), then set
//   HERO_VIDEO / HERO_POSTER below. Until then, a branded Mori frame shows.
import { useState } from "react";
import { Mori } from "./Mori";

const HERO_VIDEO = "/hero-demo.mp4";
const HERO_POSTER = "/hero-poster.jpg";

export function HeroMedia() {
  const [failed, setFailed] = useState(false);
  const showVideo = HERO_VIDEO && !failed;

  return (
    <div
      className="relative mx-auto w-full max-w-3xl aspect-video rounded-3xl overflow-hidden border border-border/70 bg-secondary"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      {showVideo ? (
        <video
          autoPlay loop muted playsInline
          poster={HERO_POSTER || undefined}
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--gradient-romantic)" }}>
          <Mori expression="searching" size={180} className="drop-shadow-xl" />
        </div>
      )}
    </div>
  );
}
