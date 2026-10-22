import type { CheckResult, MonitorConfig, NotifierConfig } from "./types.js";

export interface StateChange {
  monitor: MonitorConfig;
  from: "up" | "down" | "unknown";
  to: "up" | "down";
  result: CheckResult;
  at: string;
}

export function formatMessage(c: StateChange): string {
  const target = c.monitor.target;
  if (c.to === "down") return `🔴 ${c.monitor.name} is DOWN (${target}): ${c.result.error ?? "check failed"}`;
  return `🟢 ${c.monitor.name} is back UP (${target}) in ${c.result.ms} ms`;
}

export async function notify(notifiers: NotifierConfig[], change: StateChange, fetchImpl: typeof fetch = fetch): Promise<void> {
  const text = formatMessage(change);
  await Promise.all(
    notifiers
      .filter((n) => !n.monitors || n.monitors.includes(change.monitor.id))
      .map(async (n) => {
        const body = n.type === "slack" ? { text } : { event: `monitor.${change.to}`, monitor: change.monitor.id, name: change.monitor.name, target: change.monitor.target, at: change.at, result: change.result, text };
        try {
          await fetchImpl(n.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        } catch (e) {
          console.error(`notifier ${n.type} failed: ${(e as Error).message}`);
        }
      }),
  );
}
