import { runCheck } from "./check.js";
import { notify, type StateChange } from "./notify.js";
import { Store, summarise } from "./store.js";
import type { CheckResult, MonitorConfig, PulsewatchConfig } from "./types.js";

export interface SchedulerOptions {
  fetchImpl?: typeof fetch;
  onResult?: (m: MonitorConfig, r: CheckResult, state: "up" | "down" | "unknown") => void;
  onChange?: (c: StateChange) => void;
  tls?: boolean;
}

/** Run every monitor once. Returns results and fires notifications on state changes. */
export async function checkAll(config: PulsewatchConfig, store: Store, opts: SchedulerOptions = {}): Promise<Array<{ monitor: MonitorConfig; result: CheckResult; state: "up" | "down" | "unknown" }>> {
  return Promise.all(
    config.monitors.map(async (m) => {
      const before = summarise(m, store.read(m.id)).state;
      const result = await runCheck(m, { fetchImpl: opts.fetchImpl, tls: opts.tls });
      store.append(m.id, result);
      const after = summarise(m, store.read(m.id)).state;
      opts.onResult?.(m, result, after);
      if (after !== before && after !== "unknown" && !(before === "unknown" && after === "up")) {
        const change: StateChange = { monitor: m, from: before, to: after, result, at: result.t };
        opts.onChange?.(change);
        await notify(config.notifiers, change, opts.fetchImpl);
      }
      return { monitor: m, result, state: after };
    }),
  );
}

/** Keep checking each monitor on its own interval until stop() is called. */
export function startScheduler(config: PulsewatchConfig, store: Store, opts: SchedulerOptions = {}): { stop: () => void } {
  const timers: NodeJS.Timeout[] = [];
  for (const m of config.monitors) {
    const tick = async () => {
      const before = summarise(m, store.read(m.id)).state;
      const result = await runCheck(m, { fetchImpl: opts.fetchImpl, tls: opts.tls });
      store.append(m.id, result);
      store.compact(m.id, config.retentionDays);
      const after = summarise(m, store.read(m.id)).state;
      opts.onResult?.(m, result, after);
      if (after !== before && after !== "unknown" && !(before === "unknown" && after === "up")) {
        const change: StateChange = { monitor: m, from: before, to: after, result, at: result.t };
        opts.onChange?.(change);
        await notify(config.notifiers, change, opts.fetchImpl);
      }
    };
    void tick();
    timers.push(setInterval(() => void tick(), m.interval * 1000));
  }
  return { stop: () => timers.forEach(clearInterval) };
}
