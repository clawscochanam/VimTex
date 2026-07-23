"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { LatexPreview } from "@/components/LatexPreview";
import { StatusBar } from "@/components/StatusBar";
import { ExportMenu } from "@/components/ExportMenu";
import { ShareRoom } from "@/components/ShareRoom";
import { NamePicker } from "@/components/NamePicker";
import { RoomChatSidebar } from "@/components/RoomChatSidebar";
import type { VimEditorHandle } from "@/components/VimEditor";
import {
  createCollabUser,
  createRoomId,
  loadDisplayName,
  readRoomFromLocation,
  saveDisplayName,
  writeRoomToLocation,
} from "@/lib/collab";
import { loadNote, saveNote } from "@/lib/storage";
import type { CollabStatus, CollabUser, VimMode } from "@/lib/types";

const VimEditor = dynamic(
  () => import("@/components/VimEditor").then((m) => m.VimEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center px-4 font-mono text-xs uppercase tracking-[1.2px] text-mute sm:px-5">
        Opening sheet…
      </div>
    ),
  },
);

export default function HomePage() {
  const [note, setNote] = useState("");
  const [vimMode, setVimMode] = useState<VimMode>("normal");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [localSeed, setLocalSeed] = useState<string | null>(null);
  const [collabStatus, setCollabStatus] =
    useState<CollabStatus>("connecting");
  const [peerCount, setPeerCount] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<CollabUser | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const editorRef = useRef<VimEditorHandle>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const existing = readRoomFromLocation();
      const room = existing ?? createRoomId();
      writeRoomToLocation(room);
      setRoomId(room);
      setLocalSeed(loadNote(room));

      const storedName = loadDisplayName();
      setUser(
        createCollabUser(
          storedName ? { name: storedName } : undefined,
        ),
      );
    } catch {
      const room = createRoomId();
      setRoomId(room);
      setUser(createCollabUser());
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !roomId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveNote(roomId, note);
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [note, roomId, hydrated]);

  const handleNameSubmit = useCallback((name: string) => {
    saveDisplayName(name);
    setUser((prev) =>
      prev
        ? { ...prev, name }
        : createCollabUser({ name }),
    );
    setEditingName(false);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const openNameEdit = useCallback(() => {
    setEditingName(true);
  }, []);

  const togglePreview = useCallback(() => {
    setPreviewOpen((open) => {
      const next = !open;
      if (!next) {
        requestAnimationFrame(() => editorRef.current?.focus());
      }
      return next;
    });
  }, []);

  const handleNewSheet = useCallback(() => {
    const newRoom = createRoomId();
    writeRoomToLocation(newRoom);
    setNote("");
    setLocalSeed(null);
    setPreviewOpen(false);
    setRoomId(newRoom);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const ready = hydrated && !!roomId && !!user;

  return (
    <div className="app-shell flex h-dvh flex-col text-ink">
      <header className="vt-chrome flex min-h-[var(--header-h)] shrink-0 flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-0">
        <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start sm:gap-4">
          <span className="vt-brand text-ink">
            <span className="vt-brand-mark" aria-hidden />
            VimTex
          </span>
          <span className="vt-mode-chip sm:hidden">
            {vimModeLabel(vimMode)}
          </span>
          <span className="vt-mode-chip hidden sm:inline">
            {vimModeLabel(vimMode)}
          </span>
        </div>
        <div className="vt-toolbar sm:justify-end" role="toolbar" aria-label="Workspace tools">
          <button
            type="button"
            disabled={!ready}
            onClick={handleNewSheet}
            className="vt-pill vt-pill--ghost"
            title="Start a fresh sheet in a new room"
          >
            New
          </button>
          <button
            type="button"
            aria-pressed={previewOpen}
            disabled={!ready}
            onClick={togglePreview}
            className={
              previewOpen
                ? "vt-pill vt-pill--solid vt-pill--glow"
                : "vt-pill vt-pill--ghost"
            }
          >
            Preview
          </button>
          {roomId ? <ShareRoom roomId={roomId} /> : null}
          <button
            type="button"
            aria-pressed={chatOpen}
            disabled={!ready}
            onClick={() => setChatOpen((v) => !v)}
            className={
              chatOpen
                ? "vt-pill vt-pill--solid vt-pill--glow"
                : "vt-pill vt-pill--ghost"
            }
          >
            Chat
          </button>
          <ExportMenu note={note} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="min-h-0 min-w-0 flex-1">
          <section className="vt-pane h-full min-h-0">
            {ready ? (
              <VimEditor
                ref={editorRef}
                roomId={roomId}
                user={user}
                localSeed={localSeed}
                onChange={setNote}
                onVimModeChange={setVimMode}
                onCollabStatus={setCollabStatus}
                onPeerCount={setPeerCount}
              />
            ) : (
              <div className="flex h-full items-center px-4 font-mono text-xs uppercase tracking-[1.2px] text-mute sm:px-5">
                Opening sheet…
              </div>
            )}
          </section>
        </main>

        {previewOpen ? (
          <aside
            className="vt-pane-preview flex min-h-0 w-full flex-col border-t border-hairline-strong md:w-[min(42vw,28rem)] md:border-t-0 md:border-l"
            aria-label="Rendered preview"
          >
            <LatexPreview note={note} />
          </aside>
        ) : null}

        {user ? (
          <RoomChatSidebar
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            peerCount={peerCount}
            user={user}
            editorRef={editorRef}
            chatReady={ready}
          />
        ) : null}
      </div>

      <StatusBar
        vimMode={vimMode}
        collabStatus={collabStatus}
        peerCount={peerCount}
        userName={user?.name ?? "…"}
        onEditName={user ? openNameEdit : undefined}
      />

      <NamePicker
        open={hydrated && editingName}
        initialName={user?.name ?? ""}
        onSubmit={handleNameSubmit}
        allowSkip
        onCancel={() => setEditingName(false)}
      />
    </div>
  );
}

function vimModeLabel(mode: VimMode): string {
  const m = mode.toLowerCase();
  if (m.startsWith("vis")) return "VISUAL";
  if (m.startsWith("ins")) return "INSERT";
  if (m.startsWith("rep")) return "REPLACE";
  return "NORMAL";
}
