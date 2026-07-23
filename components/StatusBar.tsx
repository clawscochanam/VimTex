"use client";

import type { CollabStatus, VimMode } from "@/lib/types";

type StatusBarProps = {
  vimMode: VimMode;
  collabStatus: CollabStatus;
  peerCount: number;
  userName: string;
  onEditName?: () => void;
};

function formatMode(mode: VimMode): string {
  const m = mode.toLowerCase();
  if (m.startsWith("vis")) return "VISUAL";
  if (m.startsWith("ins")) return "INSERT";
  if (m.startsWith("rep")) return "REPLACE";
  if (m.startsWith("nor") || m === "normal") return "NORMAL";
  return mode.toUpperCase();
}

function statusDotClass(status: CollabStatus): string {
  if (status === "connected") return "vt-status-dot vt-status-dot--connected";
  if (status === "disconnected") return "vt-status-dot vt-status-dot--error";
  return "vt-status-dot vt-status-dot--connecting";
}

export function StatusBar({
  vimMode,
  collabStatus,
  peerCount,
  userName,
  onEditName,
}: StatusBarProps) {
  return (
    <footer className="vt-chrome flex min-h-[var(--footer-h)] shrink-0 items-center justify-between gap-3 border-t px-3 py-1.5 sm:gap-4 sm:px-4">
      <span className="vt-mode-chip hidden sm:inline">
        {formatMode(vimMode)}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-x-2 overflow-hidden sm:flex-none sm:justify-start">
        {onEditName ? (
          <button
            type="button"
            onClick={onEditName}
            className="vt-meta max-w-[40vw] truncate uppercase tracking-[1.2px] text-body underline-offset-2 hover:text-ink hover:underline sm:max-w-none"
            title="Change display name"
          >
            {userName}
          </button>
        ) : (
          <span className="vt-meta truncate uppercase tracking-[1.2px]">
            {userName}
          </span>
        )}
        <span className="vt-meta shrink-0" aria-hidden>
          ·
        </span>
        <span
          className="vt-meta flex shrink-0 items-center gap-1.5 lowercase first-letter:uppercase"
        >
          <span
            className={statusDotClass(collabStatus)}
            aria-hidden
          />
          {collabStatus}
        </span>
        {collabStatus === "connected" ? (
          <>
            <span className="vt-meta shrink-0" aria-hidden>
              ·
            </span>
            <span className="vt-meta shrink-0">{peerCount} online</span>
          </>
        ) : null}
        <span className="vt-meta hidden shrink-0 sm:inline" aria-hidden>
          ·
        </span>
        <span className="vt-meta hidden shrink-0 sm:inline">live room</span>
      </span>
    </footer>
  );
}
