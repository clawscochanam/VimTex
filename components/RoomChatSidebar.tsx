"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { parseAssistantReply } from "@/lib/ai-chat";
import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  type AiModelId,
} from "@/lib/ai-models";
import {
  AI_MENTION_SUGGESTIONS,
  mentionsAi,
  stripAiMention,
} from "@/lib/chat-mentions";
import {
  formatRelativeTime,
  newChatMessageId,
  type RoomChatMessage,
} from "@/lib/room-chat";
import type { CollabUser } from "@/lib/types";
import type { VimEditorHandle } from "@/components/VimEditor";

export type RoomChatSidebarProps = {
  open: boolean;
  onClose: () => void;
  peerCount: number;
  user: CollabUser;
  editorRef: RefObject<VimEditorHandle | null>;
  /** Bumps when the editor remounts (e.g. room ready) so chat can resubscribe. */
  chatReady: boolean;
};

function highlightMentions(text: string): ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /@(?:ai|vimtex)\b/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <span key={key++} className="font-semibold text-primary">
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}

export function RoomChatSidebar({
  open,
  onClose,
  peerCount,
  user,
  editorRef,
  chatReady,
}: RoomChatSidebarProps) {
  const [model, setModel] = useState<AiModelId>(DEFAULT_AI_MODEL);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorForId, setErrorForId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [stickBottom, setStickBottom] = useState(true);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingAiRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!chatReady) {
      setMessages([]);
      return;
    }

    let unsub: (() => void) | undefined;
    let cancelled = false;
    let tries = 0;
    let raf = 0;

    const trySub = () => {
      if (cancelled) return;
      const editor = editorRef.current;
      if (!editor || editor.getClientId() == null) {
        if (tries++ < 60) {
          raf = requestAnimationFrame(trySub);
        }
        return;
      }
      unsub = editor.subscribeChat(setMessages);
    };

    trySub();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      unsub?.();
    };
  }, [chatReady, editorRef]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, open, stickBottom, error]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickBottom(dist < 48);
  };

  const filteredMentions = AI_MENTION_SUGGESTIONS.filter((s) =>
    s.startsWith(mentionFilter.toLowerCase()),
  );

  const updateMentionState = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = before.match(/(^|[\s])@([a-zA-Z0-9_]*)$/);
    if (at) {
      setMentionOpen(true);
      setMentionFilter(at[2] ?? "");
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
      setMentionFilter("");
    }
  };

  const insertMention = (tag: string) => {
    const el = inputRef.current;
    const value = input;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const replaced = before.replace(/(^|[\s])@[a-zA-Z0-9_]*$/, `$1@${tag} `);
    const next = replaced + after;
    setInput(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const pos = replaced.length;
      el?.setSelectionRange(pos, pos);
      el?.focus();
    });
  };

  const invokeAi = useCallback(
    async (userMsg: RoomChatMessage) => {
      const editor = editorRef.current;
      if (!editor) return;

      const instruction = stripAiMention(userMsg.text);
      if (!instruction) {
        setError("Add an instruction after @ai.");
        setErrorForId(userMsg.id);
        return;
      }

      pendingAiRef.current = userMsg.id;
      setBusy(true);
      setError(null);
      setErrorForId(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction,
            document: editor.getContent(),
            model,
          }),
        });

        const data = (await res.json()) as {
          message?: string;
          error?: string;
        };

        if (!res.ok || data.error) {
          throw new Error(data.error || `Request failed (${res.status})`);
        }

        const parsed = parseAssistantReply(data.message ?? "");
        const clientId = editor.getClientId() ?? userMsg.clientId;
        const aiMsg: RoomChatMessage = {
          id: newChatMessageId(),
          clientId,
          authorName: "AI",
          authorColor: "var(--primary)",
          role: "ai",
          text: parsed.message,
          mentionAi: false,
          createdAt: Date.now(),
          documentEdit: parsed.documentEdit,
        };
        editor.appendChatMessage(aiMsg);
        if (parsed.documentEdit != null) {
          editor.applyAiEdit(parsed.documentEdit);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Unknown error";
        setError(detail);
        setErrorForId(userMsg.id);
      } finally {
        pendingAiRef.current = null;
        setBusy(false);
      }
    },
    [editorRef, model],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    const editor = editorRef.current;
    if (!text || busy || !editor) return;

    const clientId = editor.getClientId();
    if (clientId == null) return;

    const mention = mentionsAi(text);
    const userMsg: RoomChatMessage = {
      id: newChatMessageId(),
      clientId,
      authorName: user.name,
      authorColor: user.color,
      role: "user",
      text,
      mentionAi: mention,
      createdAt: Date.now(),
    };

    setInput("");
    setMentionOpen(false);
    setError(null);
    setErrorForId(null);
    setStickBottom(true);
    editor.appendChatMessage(userMsg);

    if (mention) {
      await invokeAi(userMsg);
    }
  }, [busy, editorRef, input, invokeAi, user.color, user.name]);

  const retryAi = useCallback(
    (msg: RoomChatMessage) => {
      if (busy || !msg.mentionAi) return;
      void invokeAi(msg);
    },
    [busy, invokeAi],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMentions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + filteredMentions.length) % filteredMentions.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndex] ?? "ai");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (!open) return null;

  return (
    <aside
      className="flex h-[min(48vh,420px)] min-h-0 w-full shrink-0 flex-col border-t border-hairline bg-canvas md:h-full md:w-[340px] md:border-t-0 md:border-l"
      aria-label="Room chat"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[1.2px] text-ink">
            Chat
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-mute">
            {peerCount} {peerCount === 1 ? "peer" : "peers"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-hairline px-3 py-1 font-mono text-xs uppercase tracking-[1.2px] text-ink transition-colors hover:bg-ink hover:text-on-primary"
        >
          Close
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 py-2">
        <label
          htmlFor="room-chat-model"
          className="shrink-0 font-mono text-[10px] uppercase tracking-[1.2px] text-mute"
          title="Used when a message mentions @ai"
        >
          Model
        </label>
        <select
          id="room-chat-model"
          value={model}
          onChange={(e) => setModel(e.target.value as AiModelId)}
          className="min-w-0 flex-1 rounded-full border border-hairline bg-canvas px-3 py-1 font-mono text-xs text-ink outline-none"
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id} className="bg-canvas text-ink">
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={listRef}
        onScroll={onListScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <p className="font-mono text-xs uppercase tracking-[1.2px] text-mute">
            Talk to collaborators. Tag @ai to edit the note.
          </p>
        ) : null}

        {messages.map((m) => {
          const isAi = m.role === "ai";
          const showError = error && errorForId === m.id;
          return (
            <div key={m.id} className="space-y-1.5">
              <div
                className={
                  isAi
                    ? "mr-1 rounded-lg border border-primary/40 bg-canvas-card px-3 py-2 text-sm text-body"
                    : "ml-2 rounded-lg border border-hairline bg-canvas-soft px-3 py-2 text-sm text-ink"
                }
                style={
                  !isAi
                    ? { borderLeftWidth: 3, borderLeftColor: m.authorColor }
                    : undefined
                }
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span
                    className="font-mono text-[10px] uppercase tracking-[1.2px]"
                    style={{ color: isAi ? undefined : m.authorColor }}
                  >
                    <span className={isAi ? "text-primary" : undefined}>
                      {isAi ? "AI" : m.authorName}
                    </span>
                    {m.mentionAi ? (
                      <span className="ml-1.5 text-mute">→ @ai</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-mute">
                    {formatRelativeTime(m.createdAt, now)}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-words">
                  {highlightMentions(m.text)}
                </div>
                {isAi && m.documentEdit != null ? (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[1.2px] text-mute">
                    Applied to note
                  </p>
                ) : null}
              </div>
              {showError ? (
                <div className="space-y-1 pl-2">
                  <p className="rounded-lg border border-hairline bg-canvas-card px-3 py-2 text-sm text-body">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => retryAi(m)}
                    disabled={busy}
                    className="rounded-full border border-hairline px-3 py-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-ink transition-colors hover:bg-ink hover:text-on-primary disabled:opacity-40"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {busy ? (
          <p className="font-mono text-xs uppercase tracking-[1.2px] text-mute">
            Thinking…
          </p>
        ) : null}
      </div>

      <div className="relative shrink-0 border-t border-hairline p-3">
        {mentionOpen && filteredMentions.length > 0 ? (
          <ul
            className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border border-hairline bg-canvas-card shadow-sm"
            role="listbox"
          >
            {filteredMentions.map((tag, i) => (
              <li key={tag}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === mentionIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(tag);
                  }}
                  className={
                    i === mentionIndex
                      ? "flex w-full items-center gap-2 bg-ink px-3 py-2 text-left font-mono text-xs text-on-primary"
                      : "flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs text-ink hover:bg-canvas-soft"
                  }
                >
                  <span className="text-primary">@{tag}</span>
                  <span className="text-[10px] uppercase tracking-[1.2px] opacity-70">
                    {tag === "ai" ? "Ask the model" : "Alias for @ai"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            const value = e.target.value;
            setInput(value);
            updateMentionState(value, e.target.selectionStart ?? value.length);
          }}
          onKeyUp={(e) => {
            const el = e.currentTarget;
            updateMentionState(el.value, el.selectionStart ?? el.value.length);
          }}
          onClick={(e) => {
            const el = e.currentTarget;
            updateMentionState(el.value, el.selectionStart ?? el.value.length);
          }}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="Message… use @ai to edit the note"
          disabled={busy}
          className="w-full resize-none rounded-lg border border-hairline bg-canvas-soft px-3 py-2 text-sm text-ink outline-none placeholder:text-mute disabled:opacity-50"
        />
        {mentionsAi(input) ? (
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-primary">
            Will call AI with this instruction
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => insertMention("ai")}
            disabled={busy}
            className="rounded-full border border-hairline px-3 py-1 font-mono text-[10px] uppercase tracking-[1.2px] text-ink transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
          >
            @ai
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="rounded-full border border-hairline px-4 py-1.5 font-mono text-xs uppercase tracking-[1.2px] text-ink transition-colors hover:bg-ink hover:text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
