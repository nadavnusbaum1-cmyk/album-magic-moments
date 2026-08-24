// Day-first date field: always displays dd/mm/yyyy (native <input type="date">
// follows the browser locale, which we can't control — en-US shows mm/dd/yyyy).
// value/onChange use ISO yyyy-mm-dd (what the backend stores). A calendar icon
// still opens the native picker for convenience.
import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";

function isoToDMY(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function dmyToIso(dmy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DateField({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  className,
  disabled,
}: {
  value?: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(isoToDMY(value));
  const pickerRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(isoToDMY(value)); }, [value]);

  const handleText = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(out);
    if (out === "") onChange(null);
    else if (out.length === 10) onChange(dmyToIso(out));
  };

  return (
    <div className={`relative ${className || ""}`}>
      <Input
        value={text}
        onChange={(e) => handleText(e.target.value)}
        placeholder={placeholder}
        inputMode="numeric"
        disabled={disabled}
        dir="ltr"
        className="pe-9"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => { pickerRef.current?.showPicker?.(); }}
        className="absolute inset-y-0 end-2 flex items-center text-muted-foreground hover:text-foreground disabled:opacity-50"
        aria-label="Open calendar"
      >
        <Calendar className="w-4 h-4" />
      </button>
      {/* Hidden native picker — the calendar UI only; value stays ISO. */}
      <input
        ref={pickerRef}
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute end-2 bottom-0 w-0 h-0 opacity-0 pointer-events-none"
      />
    </div>
  );
}
