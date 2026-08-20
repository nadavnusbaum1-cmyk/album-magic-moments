// Self-explanatory UI demo for the hero — a phone showing HeyMori's "found your
// photos" result (real event stills) beside the 3-step flow. Bilingual.
import { QrCode, Camera, Images, Check, Download } from "lucide-react";
import { Mori } from "./Mori";
import { useI18n } from "@/lib/i18n";

const T = {
  he: {
    greeting: "היי נועה! מצאתי 47 תמונות שלך 🎉",
    download: "הורדת הכל",
    steps: [
      { t: "קישור לאלבום", d: "מקבלים קישור לאלבום" },
      { t: "שליחת סלפי", d: "מורי מזהה רק את התמונות שלך" },
      { t: "מקבלים את התמונות", d: "כל התמונות שלך, אצלך" },
    ],
  },
  en: {
    greeting: "Hi Sarah! I found 47 photos of you 🎉",
    download: "Download all",
    steps: [
      { t: "Scan the QR", d: "Scan the code at the event" },
      { t: "Send a selfie", d: "Mori learns your face" },
      { t: "Get your photos", d: "All your photos, instantly" },
    ],
  },
};

const PHOTOS = ["/demo/1.jpg", "/demo/2.jpg", "/demo/3.jpg", "/demo/4.jpg"];
const ICONS = [QrCode, Camera, Images];

export function HeroMockup() {
  const { lang } = useI18n();
  const t = T[lang];

  return (
    <div
      className="relative mx-auto w-full max-w-4xl rounded-3xl border border-border/70 p-5 md:p-8"
      style={{ background: "var(--gradient-soft)", boxShadow: "var(--shadow-soft)" }}
    >
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
        {/* Phone result screen */}
        <div className="w-[240px] shrink-0 rounded-[2rem] border-4 border-foreground/10 bg-background shadow-xl overflow-hidden">
          <div className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <Mori expression="celebrating" size={40} className="shrink-0" />
              <p className="text-[13px] font-semibold leading-tight text-start">{t.greeting}</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PHOTOS.map((p, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <span className="absolute top-1 end-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 w-full rounded-full bg-primary text-primary-foreground text-sm font-semibold py-2 flex items-center justify-center gap-1.5">
              <Download className="w-4 h-4" /> {t.download}
            </div>
          </div>
        </div>

        {/* 3-step flow */}
        <div className="flex-1 w-full space-y-3">
          {t.steps.map((s, i) => {
            const Icon = ICONS[i];
            return (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-background/80 border border-border/50 p-3">
                <span className="relative w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                  <span className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] flex items-center justify-center">{i + 1}</span>
                </span>
                <div className="text-start">
                  <p className="font-semibold text-sm">{s.t}</p>
                  <p className="text-xs text-muted-foreground">{s.d}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
