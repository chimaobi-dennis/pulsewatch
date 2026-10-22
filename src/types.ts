export type MonitorType = "http" | "tcp";

export interface MonitorConfig {
  /** Stable identifier derived from the name; used for file names and URLs. */
  id: string;
  name: string;
  type: MonitorType;
  /** http: full URL. tcp: host:port. */
  target: string;
  /** Seconds between checks. */
  interval: number;
  /** Milliseconds before a check is considered failed. */
  timeout: number;
  method: string;
  headers: Record<string, string>;
  /** Accepted HTTP status codes. Default 200-399. */
  expectStatus: number[];
  /** Substring that must appear in the response body. */
  expectBody?: string;
  /** Warn when the TLS certificate expires within this many days. */
  tlsWarnDays: number;
  /** Consecutive failures before the monitor is reported down. */
  retries: number;
  group?: string;
}

export interface NotifierConfig {
  type: "slack" | "webhook";
  url: string;
  /** Only notify for these monitor ids (default: all). */
  monitors?: string[];
}

export interface PulsewatchConfig {
  title: string;
  description?: string;
  dataDir: string;
  /** Days of history to keep per monitor. */
  retentionDays: number;
  monitors: MonitorConfig[];
  notifiers: NotifierConfig[];
}

export interface CheckResult {
  /** ISO timestamp. */
  t: string;
  ok: boolean;
  /** Round trip in milliseconds. */
  ms: number;
  /** HTTP status when applicable. */
  status?: number;
  /** Short error description when !ok. */
  error?: string;
  /** Days until the TLS certificate expires (https targets only). */
  tlsDays?: number;
}

export interface Incident {
  start: string;
  end?: string;
  durationMs: number;
  error?: string;
  checks: number;
}

export interface MonitorSummary {
  monitor: MonitorConfig;
  state: "up" | "down" | "unknown";
  last?: CheckResult;
  /** Uptime percentages over trailing windows. */
  uptime: { d1: number | null; d7: number | null; d30: number | null; d90: number | null };
  /** Average latency over the last 24 hours. */
  avgMs24h: number | null;
  /** Hourly buckets for the last 24 h: [avg latency, worst ok] with null for empty buckets. */
  sparkline: Array<number | null>;
  /** Day buckets for the last 90 days: uptime % or null. */
  days: Array<number | null>;
  incidents: Incident[];
  tlsDays?: number;
}

export interface StatusSnapshot {
  title: string;
  description?: string;
  generatedAt: string;
  overall: "operational" | "degraded" | "outage" | "unknown";
  monitors: MonitorSummary[];
}
