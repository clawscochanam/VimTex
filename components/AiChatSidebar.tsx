"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { parseAssistantReply, type ChatMessage } from "@/lib/ai-chat";
import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  type AiModelId,
} from "@/lib/ai-models";

export type AiChatSidebarProps = {
  open: boolean;
  onClose: () => void;
  getDocument: () => string;
  applyDocumentEdit: (content: string) => void;
};

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Pending or last applied full-doc replacement from this turn. */
  documentEdit?: string | null;
  applied?: boolean;
};

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AiChatSidebar({
  open,
  onClose,
  getDocument,
  applyDocumentEdit,
}: AiChatSidebarProps) {
  const [model, setModel] = useState<AiModelId>(DEFAULT_AI_MODEL);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  const applyEdit = useCallback(
    (content: string, messageId: string) => {
      applyDocumentEdit(content);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, applied: true } : m,
        ),
      );
    },
    [applyDocumentEdit],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    setError(null);
    setInput("");
    const userMsg: UiMessage = {
      id: newId(),
      role: "user",
      content: text,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setBusy(true);

    const apiMessages: ChatMessage[] = nextMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          model,
          document: getDocument(),
        }),
      });

      const data = (await res.json()) as {
        message?: string;
        error?: string;
      };

      if (!res.ok || data.error) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const raw = data.message ?? "";
      const parsed = parseAssistantReply(raw);
      const assistantId = newId();
      const willApply = parsed.documentEdit != null;
      const assistantMsg: UiMessage = {
        id: assistantId,
        role: "assistant",
        content: parsed.message,
        documentEdit: parsed.documentEdit,
        applied: willApply,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (parsed.documentEdit != null) {
        applyDocumentEdit(parsed.documentEdit);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      setError(detail);
    } finally {
      setBusy(false);
    }
  }, [applyDocumentEdit, busy, getDocument, input, messages, model]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (!open) return null;

  return (
    <aside
      className="flex h-[min(48vh,420px)] min-h-0 w-full shrink-0 flex-col border-t border-hairline bg-canvas md:h-full md:w-[340px] md:border-t-0 md:border-l"
      aria-label="AI chat"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
        <span className="font-mono text-xs uppercase tracking-[1.2px] text-ink">
          AI Chat
        </span>
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
          htmlFor="ai-model"
          className="shrink-0 font-mono text-[10px] uppercase tracking-[1.2px] text-mute"
        >
          Model
        </label>
        <select
          id="ai-model"
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
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <p className="font-mono text-xs uppercase tracking-[1.2px] text-mute">
            Ask to edit the note — e.g. add the quadratic formula.
          </p>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            <div
              className={
                m.role === "user"
                  ? "ml-4 rounded-lg border border-hairline bg-canvas-soft px-3 py-2 text-sm text-ink"
                  : "mr-2 rounded-lg border border-hairline bg-canvas-card px-3 py-2 text-sm text-body"
              }
            >
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[1.2px] text-mute">
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
            </div>
            {m.role === "assistant" && m.documentEdit != null ? (
              <div className="flex items-center gap-2 pl-1">
                <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-mute">
                  {m.applied ? "Applied to note" : "Edit ready"}
                </span>
                <button
                  type="button"
                  onClick={() => applyEdit(m.documentEdit!, m.id)}
                  className="rounded-full border border-hairline px-3 py-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-ink transition-colors hover:bg-ink hover:text-on-primary"
                >
                  {m.applied ? "Re-apply" : "Apply"}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {busy ? (
          <p className="font-mono text-xs uppercase tracking-[1.2px] text-mute">
            Thinking…
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-hairline bg-canvas-card px-3 py-2 text-sm text-body">
            {error}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-hairline p-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="Message…"
          disabled={busy}
          className="w-full resize-none rounded-lg border border-hairline bg-canvas-soft px-3 py-2 text-sm text-ink outline-none placeholder:text-mute disabled:opacity-50"
        />
        <div className="mt-2 flex justify-end">
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
