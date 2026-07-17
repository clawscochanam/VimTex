/** Markers the model uses to propose a full-buffer replacement. */
export const DOC_EDIT_START = "@@@DOCUMENT";
export const DOC_EDIT_END = "@@@END";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ParsedAssistantReply = {
  /** User-visible chat text (edit block stripped). */
  message: string;
  /** Full document replacement, if the model proposed one. */
  documentEdit: string | null;
};

export function buildSystemPrompt(document: string): string {
  return `You are the VimTex assistant. Collaborators tag you in room chat with @ai; you receive only that single instruction plus the current document — no prior chat history.

Current document buffer:
-----
${document}
-----

Rules:
- Help with math, LaTeX, and editing the note.
- Keep chat replies concise.
- When the instruction asks you to change the note (add formulas, rewrite, fix TeX, etc.), propose the FULL updated document by ending your reply with exactly:

${DOC_EDIT_START}
<entire new document content>
${DOC_EDIT_END}

- The content between the markers must be the complete note (not a diff). Preserve unrelated parts unless asked to rewrite everything.
- If you are only answering a question and not changing the note, do not include the markers.
- Prefer KaTeX-friendly TeX. Do not wrap the whole document in a LaTeX documentclass.`;
}

export function parseAssistantReply(raw: string): ParsedAssistantReply {
  const start = raw.indexOf(DOC_EDIT_START);
  if (start === -1) {
    return { message: raw.trim(), documentEdit: null };
  }

  const afterStart = start + DOC_EDIT_START.length;
  let bodyStart = afterStart;
  if (raw[bodyStart] === "\r") bodyStart += 1;
  if (raw[bodyStart] === "\n") bodyStart += 1;

  const end = raw.indexOf(DOC_EDIT_END, bodyStart);
  if (end === -1) {
    return { message: raw.trim(), documentEdit: null };
  }

  const documentEdit = raw.slice(bodyStart, end).replace(/\r?\n$/, "");
  const before = raw.slice(0, start).trim();
  const after = raw.slice(end + DOC_EDIT_END.length).trim();
  const message = [before, after].filter(Boolean).join("\n\n").trim() ||
    "Updated the note.";

  return { message, documentEdit };
}
