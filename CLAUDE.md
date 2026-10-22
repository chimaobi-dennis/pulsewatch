# pulsewatch — project context

Self-hosted uptime monitor + status page. TypeScript, Node 20+, ESM, three runtime deps (commander, picocolors, yaml).

- `src/config.ts` — `monitors.yml` parsing, `${ENV}` expansion, example config.
- `src/check.ts` — HTTP (fetch + AbortController), TCP (net), TLS expiry (tls).
- `src/store.ts` — NDJSON per monitor; `summarise()` / `snapshot()` compute everything the page shows.
- `src/scheduler.ts` — `checkAll()` (one round) and `startScheduler()` (intervals); state-change detection + notify.
- `src/page.ts` — single-file HTML, inline CSS/SVG, no JS. `src/server.ts` — page + `/api/status` + `/healthz`.
- `src/cli/index.ts` — commander CLI.
- `monitors.yml` — real config for the author's sites; `data/` and `status.html` are gitignored.

Rules: `npm test` (spins up local servers), `npm run typecheck`, `npm run lint`. Keep the page JS-free. Never commit `data/`.
