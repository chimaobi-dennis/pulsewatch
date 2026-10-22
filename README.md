# pulsewatch

**A self-hosted uptime monitor and status page that needs nothing but Node.**

pulsewatch checks your HTTP endpoints and TCP ports on a schedule, watches TLS
certificate expiry, keeps the history in plain newline-delimited JSON files, and
renders a status page you can serve from the tool itself, from GitHub Pages, or
from any static host. State changes go to Slack or any webhook.

```
$ pulsewatch check
● Vertoc Agro                 277 ms  up      HTTP 200  TLS 56d
● GitHub                      149 ms  up      HTTP 200  TLS 38d
● npm registry                314 ms  up      HTTP 200  TLS 89d
● Cloudflare DNS (TCP)         36 ms  up      

✔ all 4 monitors up
```

## Who it is for

Solo developers and small teams who run a handful of sites and APIs and want to
know when one goes down without paying for a SaaS monitor or running a
database. If you can run `npx`, you can run pulsewatch.

## Features

- **HTTP(S) checks** with status code allow-lists, body substring matching,
  custom headers (secrets via `${ENV_VAR}`), timeouts and redirects.
- **TCP checks** for databases, mail servers, anything with a port.
- **TLS expiry** reported on every https check and flagged on the page when
  under a threshold.
- **Flap protection**: a monitor is only "down" after N consecutive failures.
- **Status page** with 24 h latency sparklines, 90-day uptime bars, incident
  history, light and dark mode, no JavaScript.
- **JSON API** (`/api/status`) and a `/healthz` endpoint when serving.
- **Alerts** to Slack and generic webhooks on down and recovery.
- **Plain-file storage**: one `.ndjson` per monitor, compacted to a retention
  window. Back it up with `cp`.
- **Three ways to run**: a long-running process, a cron job plus static page,
  or entirely inside GitHub Actions.

## Install

```bash
npm install -g pulsewatch
# or
npx pulsewatch init
```

Requires Node 20+.

## Quick start

```bash
pulsewatch init              # writes monitors.yml
$EDITOR monitors.yml
pulsewatch check             # one round, prints a table, exit 1 if anything is down
pulsewatch run -p 3030       # keep checking; status page on http://localhost:3030
```

### Configuration: `monitors.yml`

```yaml
title: My services
interval: 60          # seconds (per-monitor override allowed)
timeout: 10000        # ms
retries: 2            # consecutive failures before "down"
retentionDays: 90

monitors:
  - name: Website
    url: https://example.com
    expectStatus: [200]
    expectBody: "Example Domain"
    group: Public
  - name: API health
    url: https://api.example.com/healthz
    interval: 30
    headers:
      Authorization: "Bearer ${API_TOKEN}"
  - name: Postgres
    type: tcp
    host: db.example.com
    port: 5432

notifiers:
  - type: slack
    url: ${SLACK_WEBHOOK_URL}
  - type: webhook
    url: https://alerts.example.com/hook
    monitors: [website]       # optional filter
```

### Commands

| Command | What it does |
|---|---|
| `pulsewatch init` | write an example `monitors.yml` |
| `pulsewatch check [--json] [--no-tls]` | run every monitor once; exit 1 if any is down |
| `pulsewatch run [-p port]` | daemon: check on each interval, optionally serve the page |
| `pulsewatch serve [-p port]` | serve the page from recorded history only |
| `pulsewatch generate [-o status.html] [--json status.json]` | render the static page |

### Deploy without a server

Run checks from cron and publish the page to any static host:

```cron
*/5 * * * * cd /srv/status && pulsewatch check -q; pulsewatch generate -o /var/www/status/index.html
```

Or let GitHub Actions do everything. This repository's
[status workflow](.github/workflows/status.yml) runs the checks every
15 minutes, keeps the history in the Actions cache and deploys the page to
GitHub Pages. Fork, edit `monitors.yml`, enable Pages, done.

### As a library

```ts
import { parseConfig, Store, checkAll, snapshot, renderPage } from "pulsewatch";

const config = parseConfig(yamlText);
const store = new Store("./data");
await checkAll(config, store);
const html = renderPage(snapshot(config, store));
```

## How it works

- [src/check.ts](src/check.ts) performs a check with `fetch` and an
  `AbortController` timeout, or a raw TCP connect, and inspects the TLS
  certificate for https targets.
- [src/store.ts](src/store.ts) appends results to `data/<id>.ndjson` and
  computes uptime windows, hourly latency buckets, daily uptime buckets and
  incidents (runs of consecutive failures).
- [src/scheduler.ts](src/scheduler.ts) runs monitors on their intervals, detects
  up/down transitions with `retries` applied, and triggers notifiers.
- [src/page.ts](src/page.ts) renders a single HTML file with inline CSS and
  SVG; [src/server.ts](src/server.ts) serves it plus `/api/status`.

## Development

```bash
npm install
npm test              # vitest; spins up local HTTP and TCP servers
npm run typecheck && npm run lint
npm run check         # runs monitors.yml for real
```

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## License

MIT © Chimaobi Dennis
