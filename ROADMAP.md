# pulsewatch Roadmap

Status key: ✅ done · 🔨 in progress · ⏳ planned

## Phase 1 — Core monitor (v0.1) ✅ 2026-01-02

- ✅ HTTP and TCP checks with timeouts, status and body assertions, env-expanded headers
- ✅ TLS certificate expiry on https checks
- ✅ Retry-aware up/down state and incident grouping
- ✅ NDJSON storage with retention compaction
- ✅ Status page with sparklines, 90-day bars, incidents, dark mode
- ✅ Built-in server with `/api/status` and `/healthz`
- ✅ Slack and webhook notifiers on state change
- ✅ `init`, `check`, `run`, `serve`, `generate` commands
- ✅ GitHub Actions serverless mode (schedule + Pages)
- ✅ 21 tests with real local HTTP and TCP servers

## Phase 2 — Smarter checks (v0.2) ⏳ target: 2 weeks

- ⏳ DNS checks (expected A/AAAA/CNAME records) and ICMP ping
- ⏳ JSON path assertions (`expectJson: { path: "$.status", equals: "ok" }`)
- ⏳ Latency threshold alerts (degraded state when p95 exceeds N ms)
- ⏳ Maintenance windows that pause alerts and are shown on the page
- ⏳ Check from multiple regions by running agents that POST results to one server
- ⏳ Publish to npm with provenance

## Phase 3 — Alerting and pages (v0.3) ⏳ target: 4 weeks

- ⏳ Email (SMTP) and Discord / Telegram notifiers
- ⏳ Escalation: re-notify every N minutes while down
- ⏳ Manually declared incidents with status updates on the page
- ⏳ Subscribe-to-updates RSS feed
- ⏳ Custom page branding (logo, colours, custom domain hint)

## Phase 4 — Storage and scale (v0.4) ⏳ target: 8 weeks

- ⏳ Optional SQLite backend behind the same `Store` interface
- ⏳ Prometheus `/metrics` endpoint
- ⏳ Docker image and docker-compose example
- ⏳ Hundreds of monitors: worker pool and per-host concurrency limits

## Non-goals

- A hosted service. pulsewatch is something you run.
- Synthetic browser monitoring. Plain HTTP and TCP keep it dependency-free.

## Housekeeping

- [ ] Rename the repository to `pulsewatch` and update `package.json`
- [ ] Enable GitHub Pages so the scheduled workflow publishes the live page
