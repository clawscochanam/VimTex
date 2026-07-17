"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ViewToggle } from "@/components/ViewToggle";
import { LatexPreview } from "@/components/LatexPreview";
import { StatusBar } from "@/components/StatusBar";
import { ExportMenu } from "@/components/ExportMenu";
import { ShareRoom } from "@/components/ShareRoom";
import { NamePicker } from "@/components/NamePicker";
import { AiChatSidebar } from "@/components/AiChatSidebar";
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
      <div className="flex h-full items-center px-5 font-mono text-xs uppercase tracking-[1.2px] text-mute">
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
  const [needsName, setNeedsName] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const editorRef = useRef<VimEditorHandle>(null);

  useEffect(() => {
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
    setHydrated(true);
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

  const getDocument = useCallback(
    () => editorRef.current?.getContent() ?? note,
    [note],
  );

  const applyDocumentEdit = useCallback((content: string) => {
    editorRef.current?.applyAiEdit(content);
  }, []);

  const isSplit = viewMode === "split";
  const ready = hydrated && !!roomId && !!user && !needsName;
  const namePickerOpen = needsName || editingName;

  return (
    <div className="flex h-dvh flex-col bg-canvas text-ink">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-hairline px-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="font-mono text-sm uppercase tracking-[1.4px] text-ink">
            VimTex
          </span>
          <span className="hidden font-mono text-xs uppercase tracking-[1.2px] text-mute sm:inline">
            {vimModeLabel(vimMode)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {roomId ? <ShareRoom roomId={roomId} /> : null}
          <button
            type="button"
            aria-pressed={chatOpen}
            onClick={() => setChatOpen((v) => !v)}
            className={
              chatOpen
                ? "rounded-full bg-primary px-3 py-1 font-mono text-xs uppercase tracking-[1.2px] text-on-primary transition-colors"
                : "rounded-full border border-hairline bg-canvas px-3 py-1 font-mono text-xs uppercase tracking-[1.2px] text-ink transition-colors hover:border-body-mid"
            }
          >
            AI
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
                ? "min-h-0 flex-[0.55] border-b border-hairline md:border-b-0 md:border-r"
                : "h-full min-h-0"
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
              <div className="flex h-full items-center px-5 font-mono text-xs uppercase tracking-[1.2px] text-mute">
                {namePickerOpen ? "Enter a display name…" : "Preparing room…"}
              </div>
            )}
          </section>

          {isSplit ? (
            <section className="min-h-0 flex-[0.45] bg-canvas">
              <LatexPreview note={note} />
            </section>
          ) : null}
        </main>

        <AiChatSidebar
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          getDocument={getDocument}
          applyDocumentEdit={applyDocumentEdit}
        />
      </div>

      <StatusBar
        vimMode={vimMode}
        collabStatus={collabStatus}
        peerCount={peerCount}
        userName={user?.name ?? "…"}
        onEditName={user ? openNameEdit : undefined}
      />

      <NamePicker
        open={namePickerOpen}
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
