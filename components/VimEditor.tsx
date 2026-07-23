"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { CodeMirror, getCM, vim, Vim } from "@replit/codemirror-vim";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { mathInlineWidgets } from "@/lib/cm-math-widgets";
import { editorPlaceholder } from "@/lib/cm-placeholder";
import { latexCompletionExtension } from "@/lib/cm-latex-completion";
import { getCollabWsBase } from "@/lib/collab";
import type { RoomChatMessage } from "@/lib/room-chat";
import { EDITOR_PLACEHOLDER } from "@/lib/starter-content";
import type { CollabStatus, CollabUser, VimMode } from "@/lib/types";

export type VimEditorHandle = {
  focus: () => void;
  getContent: () => string;
  /** Replace the entire Yjs-backed buffer (syncs to all peers). */
  replaceAll: (content: string) => void;
  /** Alias for replaceAll — used by room @ai edits. */
  applyAiEdit: (content: string) => void;
  /** Local Yjs client id, or null before the doc is ready. */
  getClientId: () => number | null;
  /** Subscribe to the shared room chat array; returns unsubscribe. */
  subscribeChat: (
    cb: (messages: RoomChatMessage[]) => void,
  ) => () => void;
  appendChatMessage: (msg: RoomChatMessage) => void;
};

type VimEditorProps = {
  roomId: string;
  user: CollabUser;
  /** Local autosave seed when the Yjs room is empty after sync. */
  localSeed?: string | null;
  onChange: (value: string) => void;
  onVimModeChange: (mode: VimMode) => void;
  onCollabStatus: (status: CollabStatus) => void;
  onPeerCount: (count: number) => void;
};

const vimTexTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "var(--ink)",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "var(--ink)",
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--ink)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--ink) 18%, transparent)",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--mute)",
      borderRight: "1px solid var(--hairline)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
  },
  { dark: true },
);

function setAwarenessUser(
  provider: WebsocketProvider,
  user: CollabUser,
): void {
  provider.awareness.setLocalStateField("user", {
    name: user.name,
    color: user.color,
    colorLight: user.colorLight,
  });
}

/** Active Y.UndoManager for the live editor — used by Vim chord maps. */
let activeUndoManager: Y.UndoManager | null = null;

let vimUndoWired = false;
function wireVimUndoRedo(): void {
  if (vimUndoWired) return;
  vimUndoWired = true;
  Vim.defineAction("yUndo", () => {
    activeUndoManager?.undo();
  });
  Vim.defineAction("yRedo", () => {
    activeUndoManager?.redo();
  });
  for (const ctx of ["normal", "insert", "visual"] as const) {
    Vim.mapCommand("<C-S-z>", "action", "yRedo", {}, { context: ctx });
    Vim.mapCommand("<D-S-z>", "action", "yRedo", {}, { context: ctx });
    Vim.mapCommand("<C-z>", "action", "yUndo", {}, { context: ctx });
    Vim.mapCommand("<D-z>", "action", "yUndo", {}, { context: ctx });
  }
}

export const VimEditor = forwardRef<VimEditorHandle, VimEditorProps>(
  function VimEditor(
    {
      roomId,
      user,
      localSeed,
      onChange,
      onVimModeChange,
      onCollabStatus,
      onPeerCount,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const providerRef = useRef<WebsocketProvider | null>(null);
    const undoManagerRef = useRef<Y.UndoManager | null>(null);
    const ydocRef = useRef<Y.Doc | null>(null);
    const ytextRef = useRef<Y.Text | null>(null);
    const ychatRef = useRef<Y.Array<RoomChatMessage> | null>(null);
    const onChangeRef = useRef(onChange);
    const onVimModeChangeRef = useRef(onVimModeChange);
    const onCollabStatusRef = useRef(onCollabStatus);
    const onPeerCountRef = useRef(onPeerCount);
    const userRef = useRef(user);
    const localSeedRef = useRef(localSeed);

    onChangeRef.current = onChange;
    onVimModeChangeRef.current = onVimModeChange;
    onCollabStatusRef.current = onCollabStatus;
    onPeerCountRef.current = onPeerCount;
    userRef.current = user;
    localSeedRef.current = localSeed;

    useImperativeHandle(ref, () => {
      const replaceAll = (content: string) => {
        const ydoc = ydocRef.current;
        const ytext = ytextRef.current;
        if (!ydoc || !ytext) return;
        ydoc.transact(() => {
          const len = ytext.length;
          if (len > 0) ytext.delete(0, len);
          if (content.length > 0) ytext.insert(0, content);
        }, "ai-edit");
      };

      const readChat = (): RoomChatMessage[] => {
        const arr = ychatRef.current;
        if (!arr) return [];
        return arr.toArray().filter(
          (m): m is RoomChatMessage =>
            !!m &&
            typeof m === "object" &&
            typeof m.id === "string" &&
            typeof m.text === "string",
        );
      };

      return {
        focus: () => {
          viewRef.current?.focus();
        },
        getContent: () =>
          ytextRef.current?.toString() ??
          viewRef.current?.state.doc.toString() ??
          "",
        replaceAll,
        applyAiEdit: replaceAll,
        getClientId: () => ydocRef.current?.clientID ?? null,
        subscribeChat: (cb) => {
          const arr = ychatRef.current;
          if (!arr) {
            cb([]);
            return () => {};
          }
          const emit = () => cb(readChat());
          emit();
          arr.observe(emit);
          return () => {
            arr.unobserve(emit);
          };
        },
        appendChatMessage: (msg) => {
          const ydoc = ydocRef.current;
          const arr = ychatRef.current;
          if (!ydoc || !arr) return;
          ydoc.transact(() => {
            arr.push([msg]);
          }, "chat");
        },
      };
    });

    // Keep awareness in sync when name/color changes without recreating the doc.
    useEffect(() => {
      const provider = providerRef.current;
      if (!provider) return;
      setAwarenessUser(provider, user);
    }, [user.name, user.color, user.colorLight, user]);

    useEffect(() => {
      if (!hostRef.current) return;

      const ydoc = new Y.Doc();
      const ytext = ydoc.getText("codemirror");
      const ychat = ydoc.getArray<RoomChatMessage>("chat");
      ydocRef.current = ydoc;
      ytextRef.current = ytext;
      ychatRef.current = ychat;
      const wsBase = getCollabWsBase();
      const provider = new WebsocketProvider(wsBase, roomId, ydoc, {
        connect: true,
      });
      providerRef.current = provider;

      setAwarenessUser(provider, userRef.current);

      // yCollab registers its sync origin on this manager so local edits undo correctly.
      const um = new Y.UndoManager(ytext);
      undoManagerRef.current = um;

      const updatePeerCount = () => {
        onPeerCountRef.current(provider.awareness.getStates().size);
      };

      const onStatus = (event: { status: string }) => {
        if (
          event.status === "connected" ||
          event.status === "disconnected" ||
          event.status === "connecting"
        ) {
          onCollabStatusRef.current(event.status);
        }
      };

      provider.on("status", onStatus);
      provider.awareness.on("change", updatePeerCount);
      updatePeerCount();

      const emitText = () => {
        onChangeRef.current(ytext.toString());
      };

      ytext.observe(emitText);

      let seeded = false;
      const maybeSeed = (synced: boolean) => {
        if (!synced || seeded) return;
        seeded = true;
        if (ytext.length === 0) {
          const seed = localSeedRef.current?.trim();
          if (seed) {
            ydoc.transact(() => {
              ytext.insert(0, seed);
            }, "local-seed");
            um.clear();
          }
        }
        emitText();
      };
      provider.on("sync", maybeSeed);

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      });

      // Wire Vim `u` / Ctrl-r / Ctrl-Shift-z to Y.UndoManager (no CM history).
      wireVimUndoRedo();
      activeUndoManager = um;

      const prevUndo = CodeMirror.commands.undo;
      const prevRedo = CodeMirror.commands.redo;
      const runYUndo = () => {
        um.undo();
        return true;
      };
      const runYRedo = () => {
        um.redo();
        return true;
      };
      CodeMirror.commands.undo = (cm) => {
        if (viewRef.current && cm.cm6 === viewRef.current) {
          runYUndo();
          return;
        }
        prevUndo?.(cm);
      };
      CodeMirror.commands.redo = (cm) => {
        if (viewRef.current && cm.cm6 === viewRef.current) {
          runYRedo();
          return;
        }
        prevRedo?.(cm);
      };

      const yUndoKeys = Prec.highest(
        keymap.of([
          { key: "Mod-z", run: runYUndo, preventDefault: true },
          { key: "Mod-y", run: runYRedo, preventDefault: true },
          { key: "Mod-Shift-z", run: runYRedo, preventDefault: true },
          ...yUndoManagerKeymap,
        ]),
      );

      const state = EditorState.create({
        doc: ytext.toString(),
        extensions: [
          vim(),
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          yUndoKeys,
          ...latexCompletionExtension,
          keymap.of(defaultKeymap),
          vimTexTheme,
          EditorView.lineWrapping,
          updateListener,
          yCollab(ytext, provider.awareness, { undoManager: um }),
          mathInlineWidgets,
          ...editorPlaceholder(EDITOR_PLACEHOLDER),
        ],
      });

      const view = new EditorView({
        state,
        parent: hostRef.current,
      });
      viewRef.current = view;

      const onMode = (e: { mode?: string }) => {
        if (e?.mode) {
          onVimModeChangeRef.current(e.mode);
        }
      };
      const cm = getCM(view);
      cm?.on("vim-mode-change", onMode);
      requestAnimationFrame(() => view.focus());

      return () => {
        cm?.off("vim-mode-change", onMode);
        CodeMirror.commands.undo = prevUndo;
        CodeMirror.commands.redo = prevRedo;
        provider.off("status", onStatus);
        provider.off("sync", maybeSeed);
        provider.awareness.off("change", updatePeerCount);
        ytext.unobserve(emitText);
        provider.destroy();
        um.destroy();
        if (activeUndoManager === um) activeUndoManager = null;
        ydoc.destroy();
        view.destroy();
        viewRef.current = null;
        providerRef.current = null;
        undoManagerRef.current = null;
        ydocRef.current = null;
        ytextRef.current = null;
        ychatRef.current = null;
      };
      // Only remount when the room changes — awareness updates via the effect above.
    }, [roomId]);

    return <div ref={hostRef} className="h-full min-h-0 w-full" />;
  },
);
