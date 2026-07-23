"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderNoteToHtml } from "@/lib/render-note";

type LatexPreviewProps = {
  note: string;
  debounceMs?: number;
};

export function LatexPreview({ note, debounceMs = 75 }: LatexPreviewProps) {
  const [html, setHtml] = useState(() => renderNoteToHtml(note));
  const latest = useRef(note);
  latest.current = note;

  useEffect(() => {
    const id = window.setTimeout(() => {
      setHtml(renderNoteToHtml(latest.current));
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [note, debounceMs]);

  const markup = useMemo(() => ({ __html: html }), [html]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-hairline-strong px-4 py-2 sm:px-6">
        <span className="vt-eyebrow">Preview</span>
      </div>
      <div
        className="latex-preview min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        dangerouslySetInnerHTML={markup}
      />
    </div>
  );
}
