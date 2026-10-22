import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, Incident, MonitorConfig, MonitorSummary, PulsewatchConfig } from "./types.js";

/**
 * One newline-delimited JSON file per monitor. Append-only, human readable,
 * trivially backed up or committed. Compacted to the retention window on load.
 */
export class Store {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private file(id: string): string {
    return join(this.dir, `${id}.ndjson`);
  }

  append(id: string, r: CheckResult): void {
    appendFileSync(this.file(id), JSON.stringify(r) + "\n");
  }

  read(id: string): CheckResult[] {
    const f = this.file(id);
    if (!existsSync(f)) return [];
    const out: CheckResult[] = [];
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as CheckResult);
      } catch {
        /* skip a torn line */
      }
    }
    return out;
  }

  /** Drop results older than `days`. Returns the number of rows removed. */
  compact(id: string, days: number, now = Date.now()): number {
    const rows = this.read(id);
    const cutoff = now - days * 86_400_000;
    const kept = rows.filter((r) => new Date(r.t).getTime() >= cutoff);
    if (kept.length !== rows.length) writeFileSync(this.file(id), kept.map((r) => JSON.stringify(r)).join("\n") + (kept.length ? "\n" : ""));
    return rows.length - kept.length;
  }
}

export function uptimePercent(rows: CheckResult[], sinceMs: number, now = Date.now()): number | null {
  const window = rows.filter((r) => new Date(r.t).getTime() >= now - sinceMs);
  if (window.length === 0) return null;
  return Number(((window.filter((r) => r.ok).length / window.length) * 100).toFixed(3));
}

/** Group consecutive failures into incidents, most recent first. */
export function incidents(rows: CheckResult[], limit = 20): Incident[] {
  const out: Incident[] = [];
  let open: Incident | null = null;
  for (const r of rows) {
    if (!r.ok) {
      if (!open) open = { start: r.t, durationMs: 0, error: r.error, checks: 0 };
      open.checks++;
      open.durationMs = new Date(r.t).getTime() - new Date(open.start).getTime();
    } else if (open) {
      open.end = r.t;
      open.durationMs = new Date(r.t).getTime() - new Date(open.start).getTime();
      out.push(open);
      open = null;
    }
  }
  if (open) out.push(open);
  return out.reverse().slice(0, limit);
}

export function summarise(monitor: MonitorConfig, rows: CheckResult[], now = Date.now()): MonitorSummary {
  const last = rows[rows.length - 1];
  const H = 3_600_000;
  const D = 86_400_000;
  // Current state honours `retries`: the monitor is down only after N consecutive failures.
  let state: MonitorSummary["state"] = "unknown";
  if (last) {
    const tail = rows.slice(-Math.max(1, monitor.retries));
    state = tail.length >= Math.max(1, monitor.retries) && tail.every((r) => !r.ok) ? "down" : last.ok ? "up" : rows.length < Math.max(1, monitor.retries) ? "down" : "up";
  }
  const last24 = rows.filter((r) => new Date(r.t).getTime() >= now - D);
  const okLatencies = last24.filter((r) => r.ok).map((r) => r.ms);
  const sparkline: Array<number | null> = Array.from({ length: 24 }, (_, i) => {
    const from = now - (24 - i) * H;
    const bucket = last24.filter((r) => {
      const t = new Date(r.t).getTime();
      return t >= from && t < from + H && r.ok;
    });
    return bucket.length ? Math.round(bucket.reduce((a, r) => a + r.ms, 0) / bucket.length) : null;
  });
  const days: Array<number | null> = Array.from({ length: 90 }, (_, i) => {
    const from = now - (90 - i) * D;
    const bucket = rows.filter((r) => {
      const t = new Date(r.t).getTime();
      return t >= from && t < from + D;
    });
    return bucket.length ? Number(((bucket.filter((r) => r.ok).length / bucket.length) * 100).toFixed(2)) : null;
  });
  return {
    monitor,
    state,
    last,
    uptime: { d1: uptimePercent(rows, D, now), d7: uptimePercent(rows, 7 * D, now), d30: uptimePercent(rows, 30 * D, now), d90: uptimePercent(rows, 90 * D, now) },
    avgMs24h: okLatencies.length ? Math.round(okLatencies.reduce((a, b) => a + b, 0) / okLatencies.length) : null,
    sparkline,
    days,
    incidents: incidents(rows),
    tlsDays: [...rows].reverse().find((r) => r.tlsDays !== undefined)?.tlsDays,
  };
}

export function snapshot(config: PulsewatchConfig, store: Store, now = Date.now()) {
  const monitors = config.monitors.map((m) => summarise(m, store.read(m.id), now));
  const down = monitors.filter((m) => m.state === "down").length;
  const known = monitors.filter((m) => m.state !== "unknown").length;
  const overall = known === 0 ? "unknown" : down === 0 ? "operational" : down === known ? "outage" : "degraded";
  return { title: config.title, description: config.description, generatedAt: new Date(now).toISOString(), overall, monitors } as const;
}
