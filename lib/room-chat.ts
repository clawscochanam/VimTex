/** Shared room chat message stored in Y.Array("chat"). */
export type RoomChatMessage = {
  id: string;
  /** Yjs client id of the author. */
  clientId: number;
  authorName: string;
  authorColor: string;
  role: "user" | "ai";
  /** Display text (may include @ai / @vimtex). */
  text: string;
  /** True if this user message invoked the model. */
  mentionAi: boolean;
  createdAt: number;
  /** Optional full-document replacement from an AI turn. */
  documentEdit?: string | null;
};

export function newChatMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatRelativeTime(ts: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
