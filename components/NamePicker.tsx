"use client";

import { useEffect, useId, useRef, useState } from "react";

type NamePickerProps = {
  initialName?: string;
  open: boolean;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
  /** When true, Escape / Cancel closes without requiring a name. */
  allowSkip?: boolean;
};

export function NamePicker({
  initialName = "",
  open,
  onSubmit,
  onCancel,
  allowSkip = false,
}: NamePickerProps) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setValue(initialName);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, initialName]);

  if (!open) return null;

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed.slice(0, 32));
  };

  return (
    <div
      className="vt-overlay fixed inset-0 z-50 flex items-end justify-center bg-canvas/80 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && allowSkip) {
          e.preventDefault();
          onCancel?.();
        }
      }}
    >
      <div className="vt-dialog vt-elevated w-full max-w-sm rounded-[var(--radius-sm)] p-6">
        <p id={titleId} className="vt-caption text-ink">
          Display name
        </p>
        <p className="mt-2 text-sm leading-5 text-body">
          Shown on your cursor for collaborators.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={32}
          placeholder="e.g. Axion"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className="mt-4 min-h-[var(--touch-min)] w-full rounded-[var(--radius-sm)] border border-hairline bg-canvas-soft px-4 py-3 text-base text-ink outline-none placeholder:text-mute focus:border-body-mid focus:shadow-[var(--glow-breeze)]"
          autoComplete="nickname"
          spellCheck={false}
          enterKeyHint="done"
        />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="vt-pill vt-pill--solid vt-pill--label min-w-[7.5rem]"
          >
            {allowSkip ? "Save" : "Join room"}
          </button>
          {allowSkip ? (
            <button
              type="button"
              onClick={() => onCancel?.()}
              className="vt-pill vt-pill--ghost vt-pill--label"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
