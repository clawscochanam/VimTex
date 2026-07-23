const NOTE_PREFIX = "vimtex:note:";

function noteKey(roomId: string): string {
  return `${NOTE_PREFIX}${roomId}`;
}

/**
 * Room-scoped local autosave for solo scratch sheets.
 */
export function loadNote(roomId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(noteKey(roomId));
    return raw ?? null;
  } catch {
    return null;
  }
}

export function saveNote(roomId: string, note: string): void {
  if (typeof window === "undefined") return;
  try {
    if (note.length === 0) {
      localStorage.removeItem(noteKey(roomId));
    } else {
      localStorage.setItem(noteKey(roomId), note);
    }
  } catch {
    // Quota or private browsing — ignore.
  }
}

export function clearNote(roomId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(noteKey(roomId));
  } catch {
    // ignore
  }
}
