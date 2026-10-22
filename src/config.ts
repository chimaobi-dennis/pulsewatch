import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { MonitorConfig, NotifierConfig, PulsewatchConfig } from "./types.js";

export const CONFIG_FILENAME = "monitors.yml";

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "monitor";
}

/** Replace ${VAR} with environment variables so secrets stay out of the config file. */
export function expandEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, k: string) => env[k] ?? "");
}

export function parseConfig(text: string, baseDir = process.cwd()): PulsewatchConfig {
  const raw = (parse(text) ?? {}) as Record<string, unknown>;
  const monitorsRaw = Array.isArray(raw.monitors) ? (raw.monitors as Record<string, unknown>[]) : [];
  if (monitorsRaw.length === 0) throw new Error(`${CONFIG_FILENAME}: "monitors" must be a non-empty list`);
  const seen = new Set<string>();
  const monitors: MonitorConfig[] = monitorsRaw.map((m, i) => {
    const name = String(m.name ?? m.url ?? m.host ?? `monitor-${i + 1}`);
    const url = typeof m.url === "string" ? expandEnv(m.url) : undefined;
    const host = typeof m.host === "string" ? m.host : undefined;
    const type = (m.type as string | undefined) ?? (url ? "http" : host ? "tcp" : "http");
    if (type !== "http" && type !== "tcp") throw new Error(`monitor "${name}": type must be http or tcp`);
    const target = type === "http" ? url : host && m.port ? `${host}:${m.port}` : undefined;
    if (!target) throw new Error(`monitor "${name}": ${type === "http" ? "url" : "host and port"} required`);
    if (type === "http" && !/^https?:\/\//i.test(target)) throw new Error(`monitor "${name}": url must start with http:// or https://`);
    let id = slugify(name);
    while (seen.has(id)) id += "-2";
    seen.add(id);
    const expectStatus = Array.isArray(m.expectStatus) ? m.expectStatus.map(Number) : typeof m.expectStatus === "number" ? [m.expectStatus] : [];
    const headers: Record<string, string> = {};
    if (m.headers && typeof m.headers === "object") for (const [k, v] of Object.entries(m.headers as Record<string, unknown>)) headers[k] = expandEnv(String(v));
    return {
      id,
      name,
      type,
      target,
      interval: Math.max(10, Number(m.interval ?? raw.interval ?? 60)),
      timeout: Math.max(500, Number(m.timeout ?? raw.timeout ?? 10000)),
      method: String(m.method ?? "GET").toUpperCase(),
      headers,
      expectStatus,
      expectBody: typeof m.expectBody === "string" ? m.expectBody : undefined,
      tlsWarnDays: Number(m.tlsWarnDays ?? raw.tlsWarnDays ?? 14),
      retries: Math.max(0, Number(m.retries ?? raw.retries ?? 1)),
      group: typeof m.group === "string" ? m.group : undefined,
    };
  });
  const notifiersRaw = Array.isArray(raw.notifiers) ? (raw.notifiers as Record<string, unknown>[]) : [];
  const notifiers: NotifierConfig[] = notifiersRaw
    .map((n) => ({ type: String(n.type) as NotifierConfig["type"], url: expandEnv(String(n.url ?? "")), monitors: Array.isArray(n.monitors) ? n.monitors.map(String) : undefined }))
    .filter((n) => (n.type === "slack" || n.type === "webhook") && n.url.length > 0);
  return {
    title: String(raw.title ?? "Status"),
    description: typeof raw.description === "string" ? raw.description : undefined,
    dataDir: resolve(baseDir, String(raw.dataDir ?? "data")),
    retentionDays: Math.max(1, Number(raw.retentionDays ?? 90)),
    monitors,
    notifiers,
  };
}

export function loadConfig(path = CONFIG_FILENAME): PulsewatchConfig {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`Config not found: ${abs}. Run "pulsewatch init" to create one.`);
  return parseConfig(readFileSync(abs, "utf8"), resolve(abs, ".."));
}

export const EXAMPLE_CONFIG = `# pulsewatch configuration
title: My services
description: Live status of the things I run.
interval: 60        # seconds between checks (per-monitor override below)
timeout: 10000      # ms
retries: 1          # consecutive failures before a monitor is "down"
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
      Authorization: "Bearer \${API_TOKEN}"   # pulled from the environment
    group: Backend

  - name: Postgres port
    type: tcp
    host: db.example.com
    port: 5432
    group: Backend

notifiers: []
#  - type: slack
#    url: \${SLACK_WEBHOOK_URL}
#  - type: webhook
#    url: \${ALERT_WEBHOOK_URL}
`;
