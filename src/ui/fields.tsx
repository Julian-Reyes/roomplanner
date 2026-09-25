import { useEffect, useRef, useState, type ReactNode } from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  title?: string;
}

/**
 * Commits on Enter / blur instead of on every keystroke, so typing "120"
 * doesn't briefly make the wardrobe 1 cm wide (and doesn't fill the undo
 * history with "1", "12", "120"). Arrow keys step immediately (Shift = ×10).
 */
export function NumberField({ label, value, onChange, min = -Infinity, max = Infinity, step = 1, suffix = "cm", title }: NumberFieldProps) {
  const [draft, setDraft] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(fmt(value));
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || raw.trim() === "") {
      setDraft(fmt(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(fmt(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <label className="field" title={title}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => {
            focused.current = true;
            e.target.select();
          }}
          onBlur={(e) => {
            focused.current = false;
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(fmt(value));
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const n = Number(draft.replace(",", ".")) || 0;
              const next = n + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              const clamped = Math.min(max, Math.max(min, next));
              setDraft(fmt(clamped));
              onChange(clamped);
            }
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

function fmt(n: number) {
  return String(Math.round(n * 10) / 10);
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg seg-block" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function scoreClass(score: number) {
  return score >= 80 ? "good" : score >= 50 ? "ok" : "bad";
}

export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className={`score-ring ${scoreClass(score)}`} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="score-ring-bg" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="score-ring-fg"
        strokeDasharray={`${(c * score) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.3}>
        {score}
      </text>
    </svg>
  );
}
