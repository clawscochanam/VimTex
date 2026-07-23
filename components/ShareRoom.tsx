"use client";

import { useState } from "react";

type ShareRoomProps = {
  roomId: string;
};

export function ShareRoom({ roomId }: ShareRoomProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: leave URL updated via history already.
    }
  };

  return (
    <button
      type="button"
      onClick={copyLink}
      className={
        copied
          ? "vt-pill vt-pill--solid vt-pill--glow"
          : "vt-pill vt-pill--ghost"
      }
      title={`Room ${roomId}`}
      aria-live="polite"
    >
      {copied ? "Copied" : "Share"}
    </button>
  );
}
