"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ViewToggle } from "@/components/ViewToggle";
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
import { loadViewMode, saveViewMode } from "@/lib/storage";
import type { CollabStatus, CollabUser, ViewMode, VimMode } from "@/lib/types";

const VimEditor = dynamic(
  () => import("@/components/VimEditor").then((m) => m.VimEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center px-4 font-mono text-xs uppercase tracking-[1.2px] text-mute sm:px-5">
        Connecting room…
      </div>
    ),
  },
);

export default function HomePage() {
  const [note, setNote] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [vimMode, setVimMode] = useState<VimMode>("normal");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [collabStatus, setCollabStatus] =
    useState<CollabStatus>("connecting");
  const [peerCount, setPeerCount] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<CollabUser | null>(null);
  const [needsName, setNeedsName] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const editorRef = useRef<VimEditorHandle>(null);

  useEffect(() => {
    try {
      const existing = readRoomFromLocation();
      const room = existing ?? createRoomId();
      writeRoomToLocation(room);
      setRoomId(room);

      const storedMode = loadViewMode();
      if (storedMode != null) setViewMode(storedMode);

      const storedName = loadDisplayName();
      if (storedName) {
        setUser(createCollabUser({ name: storedName }));
        setNeedsName(false);
      } else {
        setUser(createCollabUser());
        setNeedsName(true);
      }
    } catch {
      setRoomId((prev) => prev ?? createRoomId());
      setUser(createCollabUser());
      setNeedsName(true);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveViewMode(viewMode);
  }, [viewMode, hydrated]);

  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const handleNameSubmit = useCallback((name: string) => {
    saveDisplayName(name);
    setUser((prev) =>
      prev
        ? { ...prev, name }
        : createCollabUser({ name }),
    );
    setNeedsName(false);
    setEditingName(false);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const openNameEdit = useCallback(() => {
    setEditingName(true);
  }, []);

  const isSplit = viewMode === "split";
  const ready = hydrated && !!roomId && !!user && !needsName;
  const namePickerOpen = needsName || editingName;

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
          <ViewToggle value={viewMode} onChange={handleViewMode} />
          <ExportMenu note={note} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main
          className={
            isSplit
              ? "flex min-h-0 min-w-0 flex-1 flex-col md:flex-row"
              : "min-h-0 min-w-0 flex-1"
          }
        >
          <section
            className={
              isSplit
                ? "vt-pane vt-pane--split min-h-0 flex-[0.55] border-b border-hairline-strong md:border-b-0"
                : "vt-pane h-full min-h-0"
            }
          >
            {ready ? (
              <VimEditor
                ref={editorRef}
                roomId={roomId}
                user={user}
                viewMode={viewMode}
                onChange={setNote}
                onVimModeChange={setVimMode}
                onCollabStatus={setCollabStatus}
                onPeerCount={setPeerCount}
              />
            ) : (
              <div className="flex h-full items-center px-4 font-mono text-xs uppercase tracking-[1.2px] text-mute sm:px-5">
                {namePickerOpen ? "Enter a display name…" : "Preparing room…"}
              </div>
            )}
          </section>

          {isSplit ? (
            <section className="vt-pane-preview flex min-h-0 flex-[0.45] flex-col">
              <LatexPreview note={note} />
            </section>
          ) : null}
        </main>

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
        open={hydrated && namePickerOpen}
        initialName={needsName ? "" : (user?.name ?? "")}
        onSubmit={handleNameSubmit}
        allowSkip={editingName && !needsName}
        onCancel={
          editingName && !needsName
            ? () => setEditingName(false)
            : undefined
        }
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
