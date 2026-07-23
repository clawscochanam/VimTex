"use client";

import type { ViewMode } from "@/lib/types";

type ViewToggleProps = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
};

const OPTIONS: { id: ViewMode; label: string; short: string }[] = [
  { id: "realtime", label: "Realtime", short: "Live" },
  { id: "split", label: "Split", short: "Split" },
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className="vt-segment"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            aria-label={opt.label}
            onClick={() => onChange(opt.id)}
            className={
              active
                ? "vt-segment__btn vt-segment__btn--active"
                : "vt-segment__btn"
            }
          >
            <span className="sm:hidden">{opt.short}</span>
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
