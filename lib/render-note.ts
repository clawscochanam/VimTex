import katex from "katex";

export type NoteSegment =
  | { type: "text"; content: string; from: number; to: number }
  | {
      type: "math";
      content: string;
      display: boolean;
      from: number;
      to: number;
      bodyFrom: number;
      bodyTo: number;
    };

/** Explicit TeX delimiters only — no `$` / `$$`. */
const DELIMITERS: Array<{
  open: string;
  close: string;
  display: boolean;
}> = [
  { open: "\\[", close: "\\]", display: true },
  { open: "\\(", close: "\\)", display: false },
];

function looksLikeTexCommandAt(text: string, index: number): boolean {
  if (text[index] !== "\\") return false;
  const next = text[index + 1];
  return next !== undefined && /[a-zA-Z]/.test(next);
}

function consumeBraced(text: string, from: number): number {
  if (text[from] !== "{") return from;
  let depth = 0;
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return from;
}

function consumeBracketed(text: string, from: number): number {
  if (text[from] !== "[") return from;
  let depth = 0;
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return from;
}

function consumeTeXSuffix(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === "[") {
      const next = consumeBracketed(text, i);
      if (next === i) break;
      i = next;
      continue;
    }
    if (text[i] === "{") {
      const next = consumeBraced(text, i);
      if (next === i) break;
      i = next;
      continue;
    }
    if (text[i] === "^" || text[i] === "_") {
      i += 1;
      if (text[i] === "{") {
        const next = consumeBraced(text, i);
        if (next === i) break;
        i = next;
        continue;
      }
      if (text[i] !== undefined) {
        i += 1;
        continue;
      }
      break;
    }
    break;
  }
  return i;
}

/**
 * Span from `start` at `\` through the TeX expression (command + args, then
 * math operators / further commands). Stops before adjacent English words.
 */
function endOfTeXSpan(text: string, start: number): number {
  if (!looksLikeTexCommandAt(text, start)) return start;

  let i = start + 1;
  while (i < text.length && /[a-zA-Z]/.test(text[i]!)) i += 1;
  i = consumeTeXSuffix(text, i);

  while (i < text.length) {
    while (i < text.length && text[i] === " ") i += 1;
    if (i >= text.length) break;

    if (looksLikeTexCommandAt(text, i)) {
      i += 1;
      while (i < text.length && /[a-zA-Z]/.test(text[i]!)) i += 1;
      i = consumeTeXSuffix(text, i);
      continue;
    }

    if (/[0-9+\-*/=<>.,;:!|^_{}()[\]]/.test(text[i]!)) {
      if (text[i] === "{") {
        const next = consumeBraced(text, i);
        if (next === i) break;
        i = next;
        continue;
      }
      if (text[i] === "[") {
        const next = consumeBracketed(text, i);
        if (next === i) break;
        i = next;
        continue;
      }
      i += 1;
      continue;
    }

    // Single-letter variables (x, y) — not multi-letter English words.
    if (
      /[a-zA-Z]/.test(text[i]!) &&
      (i + 1 >= text.length || !/[a-zA-Z]/.test(text[i + 1]!))
    ) {
      i += 1;
      continue;
    }

    break;
  }

  return i;
}

function startsWithAt(text: string, index: number, token: string): boolean {
  return text.startsWith(token, index);
}

function findClosing(text: string, from: number, close: string): number {
  let i = from;
  while (i < text.length) {
    if (startsWithAt(text, i, close)) {
      return i;
    }
    // Skip a TeX escape only when it is not the closing delimiter itself.
    if (
      text[i] === "\\" &&
      i + 1 < text.length &&
      !startsWithAt(text, i, close)
    ) {
      i += 2;
      continue;
    }
    i += 1;
  }
  return -1;
}

/**
 * Walk explicit \( \) / \[ \] first, then auto-detect inline TeX command spans
 * within prose (not whole lines). Use \[ \] for display layout.
 */
export function parseNote(text: string): NoteSegment[] {
  const explicit = parseExplicitDelimiters(text);
  const segments: NoteSegment[] = [];

  for (const seg of explicit) {
    if (seg.type === "math") {
      segments.push(seg);
      continue;
    }
    segments.push(...autoMathLines(seg.content, seg.from));
  }

  return mergeAdjacentText(segments);
}

function parseExplicitDelimiters(text: string): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let i = 0;
  let textStart = 0;

  while (i < text.length) {
    let matched: (typeof DELIMITERS)[number] | null = null;

    for (const delim of DELIMITERS) {
      if (startsWithAt(text, i, delim.open)) {
        matched = delim;
        break;
      }
    }

    if (!matched) {
      i += 1;
      continue;
    }

    const bodyStart = i + matched.open.length;
    const closeAt = findClosing(text, bodyStart, matched.close);

    if (closeAt === -1) {
      i += 1;
      continue;
    }

    const body = text.slice(bodyStart, closeAt);

    // Leave instructional empty delimiters like \( \) / \[ \] as literal text.
    // Must check BEFORE emitting a text segment, or textStart stays stale and
    // the same region is emitted twice (corrupting the preview).
    if (body.trim().length === 0) {
      i += 1;
      continue;
    }

    if (i > textStart) {
      segments.push({
        type: "text",
        content: text.slice(textStart, i),
        from: textStart,
        to: i,
      });
    }

    const spanEnd = closeAt + matched.close.length;

    segments.push({
      type: "math",
      content: body,
      display: matched.display,
      from: i,
      to: spanEnd,
      bodyFrom: bodyStart,
      bodyTo: closeAt,
    });

    i = spanEnd;
    textStart = spanEnd;
  }

  if (textStart < text.length) {
    segments.push({
      type: "text",
      content: text.slice(textStart),
      from: textStart,
      to: text.length,
    });
  }

  return segments;
}

/** Auto-detect TeX command spans inside text; whole lines are not promoted. */
function autoMathLines(content: string, baseOffset: number): NoteSegment[] {
  if (!content) return [];

  const segments: NoteSegment[] = [];
  const parts = content.split(/(\n)/);
  let offset = 0;

  for (const part of parts) {
    const absFrom = baseOffset + offset;
    offset += part.length;

    if (part === "\n") {
      segments.push({
        type: "text",
        content: "\n",
        from: absFrom,
        to: absFrom + 1,
      });
      continue;
    }

    if (part.length === 0) continue;

    segments.push(...parseInlineAutoMath(part, absFrom));
  }

  return segments;
}

/** Extract `\frac{}{}`-style spans from a single line of prose + math. */
function parseInlineAutoMath(line: string, baseOffset: number): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let i = 0;
  let textStart = 0;

  while (i < line.length) {
    if (!looksLikeTexCommandAt(line, i)) {
      i += 1;
      continue;
    }

    const spanEnd = endOfTeXSpan(line, i);
    if (spanEnd <= i) {
      i += 1;
      continue;
    }

    if (i > textStart) {
      segments.push({
        type: "text",
        content: line.slice(textStart, i),
        from: baseOffset + textStart,
        to: baseOffset + i,
      });
    }

    segments.push({
      type: "math",
      content: line.slice(i, spanEnd),
      display: false,
      from: baseOffset + i,
      to: baseOffset + spanEnd,
      bodyFrom: baseOffset + i,
      bodyTo: baseOffset + spanEnd,
    });

    i = spanEnd;
    textStart = spanEnd;
  }

  if (textStart < line.length) {
    segments.push({
      type: "text",
      content: line.slice(textStart),
      from: baseOffset + textStart,
      to: baseOffset + line.length,
    });
  }

  return segments;
}

function mergeAdjacentText(segments: NoteSegment[]): NoteSegment[] {
  const out: NoteSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (seg.type === "text" && prev?.type === "text" && prev.to === seg.from) {
      out[out.length - 1] = {
        type: "text",
        content: prev.content + seg.content,
        from: prev.from,
        to: seg.to,
      };
    } else {
      out.push(seg);
    }
  }
  return out;
}

export function renderMathToHtml(
  tex: string,
  displayMode: boolean,
): { html: string; error?: string } {
  try {
    return {
      html: katex.renderToString(tex.trim(), {
        displayMode,
        throwOnError: true,
        strict: "ignore",
        trust: false,
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid math";
    return {
      html: `<span class="math-error">${escapeHtml(tex || message)}</span>`,
      error: message,
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

/**
 * Full-document HTML for Split preview.
 * Never nests block <div> math inside <p> (browsers "fix" that and scramble content).
 */
export function renderNoteToHtml(text: string): string {
  const segments = parseNote(text);
  if (segments.length === 0) {
    return `<p class="preview-empty"></p>`;
  }

  const blocks: string[] = [];
  let inline = "";

  const flushInline = () => {
    if (!inline) return;
    const paras = inline.split(/(?:<br \/>){2,}/);
    for (const para of paras) {
      const cleaned = para.replace(/^(?:<br \/>)+|(?:<br \/>)+$/g, "");
      if (cleaned) {
        blocks.push(`<p>${cleaned}</p>`);
      }
    }
    inline = "";
  };

  for (const seg of segments) {
    if (seg.type === "text") {
      inline += escapeText(seg.content);
      continue;
    }
    const { html } = renderMathToHtml(seg.content, seg.display);
    if (seg.display) {
      flushInline();
      blocks.push(`<div class="katex-display-wrap">${html}</div>`);
    } else {
      inline += html;
    }
  }
  flushInline();

  return blocks.join("") || `<p class="preview-empty"></p>`;
}

/** Math spans whose range contains the cursor (Realtime raw-source editing). */
export function findMathAtCursor(
  text: string,
  cursor: number,
): NoteSegment | null {
  for (const seg of parseNote(text)) {
    if (seg.type === "math" && cursor >= seg.from && cursor <= seg.to) {
      return seg;
    }
  }
  return null;
}
