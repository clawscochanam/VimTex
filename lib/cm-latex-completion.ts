import {
  acceptCompletion,
  autocompletion,
  completionStatus,
  hasNextSnippetField,
  nextSnippetField,
  snippet,
  snippetCompletion,
  startCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { Prec } from "@codemirror/state";
import { keymap, type EditorView, type KeyBinding } from "@codemirror/view";
import {
  findLatexCommands,
  LATEX_COMMAND_MAP,
  type LatexCommand,
} from "@/lib/latex-commands";

const COMMAND_RE = /\\([a-zA-Z]*)$/;

function completionOptions(prefix: string) {
  return findLatexCommands(prefix).map((cmd) =>
    snippetCompletion(cmd.template, {
      label: `\\${cmd.name}`,
      detail: cmd.detail,
      type: "keyword",
      boost: cmd.name === prefix ? 20 : cmd.name.startsWith(prefix) ? 10 : 0,
    }),
  );
}

export function latexCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const match = context.matchBefore(/\\[a-zA-Z]*/);
  if (!match) return null;
  if (match.text === "\\" && !context.explicit) return null;

  const prefix = match.text.slice(1);
  const options = completionOptions(prefix);
  if (!options.length && !context.explicit) return null;

  return {
    from: match.from,
    options,
    validFor: /^\\[a-zA-Z]*$/,
  };
}

function commandBeforeCursor(view: EditorView): {
  from: number;
  to: number;
  name: string;
} | null {
  const head = view.state.selection.main.head;
  if (!view.state.selection.main.empty) return null;
  const before = view.state.sliceDoc(Math.max(0, head - 64), head);
  const match = before.match(COMMAND_RE);
  if (!match) return null;
  return {
    from: head - match[0].length,
    to: head,
    name: match[1] ?? "",
  };
}

function alreadyHasArgs(view: EditorView, to: number): boolean {
  const next = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + 1));
  return next === "{" || next === "[";
}

function pickCommand(name: string): LatexCommand | null {
  if (!name) return null;
  const exact = LATEX_COMMAND_MAP.get(name);
  if (exact) return exact;
  const matches = findLatexCommands(name);
  if (matches.length === 1) return matches[0] ?? null;
  return null;
}

function applyLatexSnippet(
  view: EditorView,
  cmd: LatexCommand,
  from: number,
  to: number,
): boolean {
  snippet(cmd.template)(view, null, from, to);
  return true;
}

function findMatchingCloseBrace(doc: string, open: number): number {
  if (doc[open] !== "{") return -1;
  let depth = 0;
  for (let i = open; i < doc.length; i += 1) {
    const ch = doc[i];
    if (ch === "\\" && i + 1 < doc.length) {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Innermost `{…}` pair containing the cursor (for `\frac{a}{b}` arg navigation). */
function innermostBracePair(
  doc: string,
  head: number,
): { open: number; close: number } | null {
  let best: { open: number; close: number } | null = null;
  for (let i = 0; i < doc.length; i += 1) {
    if (doc[i] !== "{") continue;
    const close = findMatchingCloseBrace(doc, i);
    if (close === -1) continue;
    if (head > i && head <= close) {
      if (!best || i > best.open) best = { open: i, close };
    }
  }
  return best;
}

const BRACE_JUMP_LOOKAHEAD = 48;

/**
 * Next cursor position when jumping through `\frac{}{}`-style arguments.
 * Returns index inside the next `{`, or just after the current `}` when done.
 */
export function findNextLatexBraceTarget(
  doc: string,
  head: number,
): number | null {
  const pair = innermostBracePair(doc, head);
  if (!pair) return null;

  const limit = Math.min(doc.length, pair.close + 1 + BRACE_JUMP_LOOKAHEAD);
  for (let i = pair.close + 1; i < limit; i += 1) {
    if (doc[i] === "{") return i + 1;
  }

  return pair.close + 1;
}

/**
 * Enter: advance snippet fields, else jump to the next `{}` or out of the
 * current brace group (e.g. `\frac{}{}` → second arg → after closing `}`).
 */
export function latexEnterJump(view: EditorView): boolean {
  if (!view.state.selection.main.empty) return false;

  if (hasNextSnippetField(view.state)) {
    if (nextSnippetField(view)) return true;
  }

  const head = view.state.selection.main.head;
  const jump = findNextLatexBraceTarget(view.state.doc.toString(), head);
  if (jump === null || jump === head) return false;

  view.dispatch({
    selection: { anchor: jump },
    scrollIntoView: true,
  });
  return true;
}

/** Tab: accept popup → next snippet field → expand unique/exact command. */
export function latexTabComplete(view: EditorView): boolean {
  if (completionStatus(view.state) === "active") {
    if (acceptCompletion(view)) return true;
  }
  if (hasNextSnippetField(view.state)) {
    return nextSnippetField(view);
  }

  const hit = commandBeforeCursor(view);
  if (!hit) return false;
  if (alreadyHasArgs(view, hit.to)) return false;

  const cmd = pickCommand(hit.name);
  if (cmd) {
    return applyLatexSnippet(view, cmd, hit.from, hit.to);
  }

  const matches = findLatexCommands(hit.name);
  if (matches.length === 0) return false;

  // Prefer the shortest name (usually the base command: frac over dfrac)
  const best = [...matches].sort(
    (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name),
  )[0];
  if (best && hit.name.length >= 2) {
    return applyLatexSnippet(view, best, hit.from, hit.to);
  }

  startCompletion(view);
  return true;
}

const latexKeyBindings: KeyBinding[] = [
  { key: "Tab", run: latexTabComplete },
  { key: "Enter", run: latexEnterJump },
];

export const latexCompletionExtension = [
  autocompletion({
    override: [latexCompletionSource],
    activateOnTyping: true,
    defaultKeymap: true,
    icons: false,
    interactionDelay: 0,
    optionClass: () => "vt-latex-option",
  }),
  Prec.highest(keymap.of(latexKeyBindings)),
];
