# VimTex

**Vim keybindings. Live LaTeX. Shared buffer. Zero setup.**

A throwaway scratchpad for math notes — open a room, type TeX like Vim, and watch KaTeX render as you go. Share the link; everyone edits the same buffer in realtime. Ask `@ai` to rewrite an equation and the whole room sees the change.

No accounts. No save button. Refresh clears the slate.

---

## Quickstart

```bash
npm install
npm run build
npm start
```

Open **[http://localhost:3001](http://localhost:3001)**. You’ll land in a room (`?room=…`). Hit **Share**, send the URL, and you’re co-editing.

For local development (same custom server + Yjs WebSocket):

```bash
npm run dev
```

### Share outside localhost

```bash
npm start
npm run tunnel   # needs cloudflared
```

Open the printed `https://*.trycloudflare.com` link on two devices with the same room — carets, edits, and chat sync live.

---

## What you get

| | |
|---|---|
| **Vim editor** | CodeMirror 6 + Replit Vim — motions, modes, the works |
| **LaTeX as you type** | KaTeX preview; autocomplete for common commands |
| **Realtime collab** | Yjs over WebSocket — shared doc, carets, peer count |
| **Room chat** | Sidebar for humans; `@ai` / `@vimtex` for model edits |
| **Two layouts** | Split (source + preview) or Realtime (full-width + inline math) |

Type TeX directly — no `$` required for bare commands. Use `\(...\)` for inline and `\[...\]` for display when you want them.

---

## AI in the room

Toggle **Chat**, then mention **`@ai`** or **`@vimtex`**. Only the sender hits OpenRouter; everyone sees the reply and document patch via Yjs.

Create `.env` or `.env.local` (gitignored):

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

Restart after changing env. The key stays on the server (`POST /api/chat`) — never in the browser.

Models (sidebar dropdown):

- `tencent/hy3:free` (default)
- `nvidia/nemotron-3-ultra-550b-a55b:free`

---

## Stack

Next.js · CodeMirror 6 · Yjs · KaTeX · OpenRouter

---

## License

Private / experimental — use at your own risk. Ephemeral by design: don’t store secrets in the buffer.
