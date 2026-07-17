# VimTex

Ephemeral Vim + LaTeX scratchpad with **realtime collaboration**. Built with Next.js, CodeMirror 6 Vim, Yjs, and KaTeX.

## Run

```bash
npm install
npm run build
npm start
```

Open [http://localhost:3001](http://localhost:3001). Each visit gets a `?room=` id — share that URL (or hit **Share**) so others join the same buffer.

Dev (custom server with Yjs on the same port):

```bash
npm run dev
```

## Modes

- **Split** (default) — source left, KaTeX preview right (stacked on mobile)
- **Realtime** — full-width Vim with inline KaTeX decorations

## Collaboration

Yjs syncs the editor over a WebSocket on the same origin (`ws(s)://host/<room>`). Status and peer count show in the footer.

### Public tunnel (Cloudflare)

```bash
npm start
npm run tunnel
```

Open the printed `https://*.trycloudflare.com` URL in two browsers/devices with the same `?room=` — edits and carets sync live.

## AI chat

Toggle **AI** in the header for a sidebar that can edit the live collaborative note (writes through Yjs).

### Configure OpenRouter

Create `.env` or `.env.local` in the project root (gitignored — never commit):

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

Restart the server after changing env. The key is used only in the server route `POST /api/chat` and is never sent to the browser.

Models (dropdown in the sidebar):

- `tencent/hy3:free` (default)
- `nvidia/nemotron-3-ultra-550b-a55b:free`
