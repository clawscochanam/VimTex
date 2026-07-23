/**
 * Production/dev server: Next.js + Yjs WebSocket on the same port.
 * Room URL shape: ws(s)://host/<roomId>
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";

const require = createRequire(import.meta.url);
const { setupWSConnection } = require("./scripts/y-ws/utils.js");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3001", 10);

const app = next({ dev, hostname, port });
await app.prepare();

const handle = app.getRequestHandler();
const upgradeHandler = app.getUpgradeHandler();

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url || "/", true);
  handle(req, res, parsedUrl);
});

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (conn, req) => {
  setupWSConnection(conn, req);
});

server.on("upgrade", (req, socket, head) => {
  const { pathname } = parse(req.url || "/", true);

  if (pathname === "/_next/webpack-hmr" || pathname?.startsWith("/_next/")) {
    void upgradeHandler(req, socket, head);
    return;
  }

  if (
    pathname &&
    pathname !== "/" &&
    !pathname.startsWith("/api") &&
    !pathname.includes(".")
  ) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
    return;
  }

  socket.destroy();
});

server.listen(port, hostname, () => {
  console.log(`VimTex ready on http://${hostname}:${port}`);
  console.log(`Yjs WebSocket on ws://${hostname}:${port}/<room>`);
});
