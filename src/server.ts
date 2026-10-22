import { createServer, type Server } from "node:http";
import { renderPage } from "./page.js";
import { Store, snapshot } from "./store.js";
import type { PulsewatchConfig } from "./types.js";

/** Serve the status page, a JSON API and a health endpoint. */
export function startServer(config: PulsewatchConfig, store: Store, port: number, refreshSeconds = 30): Server {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    const snap = snapshot(config, store);
    if (url.startsWith("/api/status")) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(snap));
      return;
    }
    if (url === "/" || url === "/index.html" || url === "/status.html") {
      res.writeHead(snap.overall === "outage" || snap.overall === "degraded" ? 503 : 200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(renderPage(snap, { refreshSeconds }));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  });
  server.listen(port);
  return server;
}
