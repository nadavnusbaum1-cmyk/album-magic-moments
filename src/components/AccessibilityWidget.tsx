// Floating accessibility menu (נגישות) — shown on every page.
// Applies visual adjustments to <html> and persists the choices in localStorage.
// Required for Israeli accessibility compliance (IS 5568 / WCAG 2.0 AA).
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  Accessibility, X, Plus, Minus, Contrast, Eye, Link2, Type, Ban, RotateCcw, Circle,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { widgetUI } from "@/content/accessibility";

type Filter = "none" | "grayscale" | "high-contrast" | "invert";
type Settings = {
  fontStep: number; // -2 .. 5, each step = 10%
  filter: Filter;
  links: boolean;
  readable: boolean;
  motion: boolean; // true = animations stopped
};

const DEFAULTS: Settings = { fontStep: 0, filter: "none", links: false, readable: false, motion: false };
const KEY = "a11y:settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function apply(s: Settings) {
  const html = document.documentElement;
  html.style.fontSize = s.fontStep === 0 ? "" : `${100 + s.fontStep * 10}%`;
  html.classList.toggle("a11y-grayscale", s.filter === "grayscale");
  html.classList.toggle("a11y-high-contrast", s.filter === "high-contrast");
  html.classList.toggle("a11y-invert", s.filter === "invert");
  html.classList.toggle("a11y-links", s.links);
  html.classList.toggle("a11y-readable", s.readable);
  html.classList.toggle("a11y-no-motion", s.motion);
}

export function AccessibilityWidget() {
  const { lang, dir } = useI18n();
  const L = (o: { en: string; he: string }) => o[lang];
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings>(() => load());
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Apply on mount and whenever settings change; persist.
  useEffect(() => {
    apply(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, [s]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const set = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));
  const toggleFilter = (f: Filter) => set({ filter: s.filter === f ? "none" : f });
  const reset = () => setS({ ...DEFAULTS });

  const side = dir === "rtl" ? { insetInlineStart: 12 } : { insetInlineEnd: 12 };

  const Row = ({ active, onClick, icon: Icon, label }: { active?: boolean; onClick: () => void; icon: ComponentType<{ className?: string }>; label: string; }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 w-full rounded-lg border px-3 py-2.5 text-sm text-start transition-colors ${active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background hover:bg-muted"}`}
    >
      <Icon className="w-4 h-4 shrink-0 text-primary" />
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={L(widgetUI.open)}
        aria-expanded={open}
        className="fixed bottom-4 z-[60] w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        style={side}
      >
        <Accessibility className="w-6 h-6" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={L(widgetUI.title)}
          className="fixed bottom-20 z-[60] w-72 max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-card p-4 shadow-xl"
          style={side}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">{L(widgetUI.title)}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label={L(widgetUI.close)} className="p-1 rounded hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-1.5">{L(widgetUI.fontSize)}</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => set({ fontStep: Math.max(-2, s.fontStep - 1) })} aria-label={L(widgetUI.decrease)} className="flex-1 rounded-lg border border-border py-2 hover:bg-muted flex items-center justify-center">
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-12 text-center text-sm tabular-nums">{100 + s.fontStep * 10}%</span>
              <button type="button" onClick={() => set({ fontStep: Math.min(5, s.fontStep + 1) })} aria-label={L(widgetUI.increase)} className="flex-1 rounded-lg border border-border py-2 hover:bg-muted flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Row active={s.filter === "grayscale"} onClick={() => toggleFilter("grayscale")} icon={Circle} label={L(widgetUI.grayscale)} />
            <Row active={s.filter === "high-contrast"} onClick={() => toggleFilter("high-contrast")} icon={Contrast} label={L(widgetUI.highContrast)} />
            <Row active={s.filter === "invert"} onClick={() => toggleFilter("invert")} icon={Eye} label={L(widgetUI.negative)} />
            <Row active={s.links} onClick={() => set({ links: !s.links })} icon={Link2} label={L(widgetUI.highlightLinks)} />
            <Row active={s.readable} onClick={() => set({ readable: !s.readable })} icon={Type} label={L(widgetUI.readableFont)} />
            <Row active={s.motion} onClick={() => set({ motion: !s.motion })} icon={Ban} label={L(widgetUI.stopMotion)} />
          </div>

          <button type="button" onClick={reset} className="mt-3 flex items-center gap-2 w-full rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted justify-center">
            <RotateCcw className="w-4 h-4" /> {L(widgetUI.reset)}
          </button>

          <Link to="/accessibility" onClick={() => setOpen(false)} className="mt-3 block text-center text-xs text-primary underline">
            {L(widgetUI.statementLink)}
          </Link>
        </div>
      )}
    </>
  );
}
