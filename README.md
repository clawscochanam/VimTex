# VimTex

**Vim keybindings. Inline LaTeX. Your scratch sheet.**

A keyboard-first math scratchpad — open the app, type TeX on a blank sheet, and watch KaTeX render in place as you work. No separate math mode, no preview pane required. Share a room link when you want to collaborate; export when you are done.

Your sheet autosaves locally per room. Refresh restores it. **New** starts a fresh room without erasing older sheets.

---

## Quickstart

```bash
npm install
npm run build
npm start
```

Open **[http://localhost:3001](http://localhost:3001)**. You land on a blank sheet (`?room=…`). Type immediately.

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

## How it works

| | |
|---|---|
| **One surface** | Type prose and math in the same editor — rendered math stays on the line |
| **Caret reveals source** | Move the cursor into math to edit the raw TeX; move away to see KaTeX |
| **Inline by default** | Bare commands like `\frac{1}{2}` render inline; use `\[...\]` for display math |
| **Vim editor** | CodeMirror 6 + Replit Vim — motions, modes, Tab/Enter to hop `\frac{}{}` fields |
| **Local autosave** | Each room restores after refresh; **New** opens a clean sheet in a new room |
| **Optional tools** | **Preview** (rendered export view), **Share**, **Chat**, `.tex` / `.md` export |

Use `\(...\)` when you need explicit inline boundaries in prose. Use `\[...\]` when you want a displayed equation. No `$` delimiters.

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

Private / experimental — use at your own risk. Do not store secrets in the buffer.
