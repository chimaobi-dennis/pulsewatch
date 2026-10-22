import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, summarise, incidents, uptimePercent, parseConfig, snapshot, renderPage } from "../src/index.js";
import type { CheckResult } from "../src/index.js";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const at = (minsAgo: number, ok: boolean, ms = 100, error?: string): CheckResult => ({ t: new Date(NOW - minsAgo * 60_000).toISOString(), ok, ms, error });
const mon = parseConfig("monitors:\n  - name: Site\n    url: https://s.test\n    retries: 2\n").monitors[0]!;

describe("Store", () => {
  it("appends, reads and compacts ndjson", () => {
    const dir = mkdtempSync(join(tmpdir(), "pw-"));
    const s = new Store(dir);
    s.append("site", at(5, true));
    s.append("site", at(0, false, 0, "HTTP 500"));
    expect(s.read("site")).toHaveLength(2);
    expect(readFileSync(join(dir, "site.ndjson"), "utf8").split("\n").filter(Boolean)).toHaveLength(2);
    s.append("site", at(200 * 24 * 60, true));
    expect(s.compact("site", 90, NOW)).toBe(1);
    expect(s.read("site")).toHaveLength(2);
    expect(s.read("missing")).toEqual([]);
    expect(existsSync(join(dir, "missing.ndjson"))).toBe(false);
  });
});

describe("summaries", () => {
  it("computes uptime windows and incidents", () => {
    const rows = [at(3000, true), at(2000, false, 0, "timeout"), at(1900, false, 0, "timeout"), at(1800, true), at(60, true), at(30, false, 0, "HTTP 502"), at(0, true)];
    expect(uptimePercent(rows, 86_400_000, NOW)).toBe(66.667);
    expect(uptimePercent([], 1, NOW)).toBeNull();
    const inc = incidents(rows);
    expect(inc).toHaveLength(2);
    expect(inc[0]).toMatchObject({ error: "HTTP 502", checks: 1 });
    expect(inc[1]).toMatchObject({ error: "timeout", checks: 2, durationMs: 200 * 60_000 });
    expect(inc[1]!.end).toBe(rows[3]!.t);
  });

  it("honours retries when deciding the state", () => {
    expect(summarise(mon, [at(1, true), at(0, false)], NOW).state).toBe("up");
    expect(summarise(mon, [at(2, true), at(1, false), at(0, false)], NOW).state).toBe("down");
    expect(summarise(mon, [], NOW).state).toBe("unknown");
    expect(summarise(mon, [at(0, false)], NOW).state).toBe("down");
  });

  it("builds sparkline and 90-day buckets", () => {
    const sum = summarise(mon, [at(30, true, 120), at(20, true, 80), at(25 * 60, true, 50)], NOW);
    expect(sum.sparkline).toHaveLength(24);
    expect(sum.sparkline[23]).toBe(100);
    expect(sum.sparkline[0]).toBeNull();
    expect(sum.days).toHaveLength(90);
    expect(sum.days[89]).toBe(100);
    expect(sum.avgMs24h).toBe(100);
  });

  it("snapshot derives the overall state and the page renders it", () => {
    const config = parseConfig("title: T\nmonitors:\n  - name: A\n    url: https://a.test\n  - name: B\n    url: https://b.test\n    group: Backend\n");
    const dir = mkdtempSync(join(tmpdir(), "pw-"));
    const store = new Store(dir);
    store.append("a", at(0, true));
    store.append("b", at(0, false, 0, "HTTP 500"));
    const snap = snapshot(config, store, NOW);
    expect(snap.overall).toBe("degraded");
    const html = renderPage(snap);
    expect(html).toContain("Some systems are down");
    expect(html).toContain("Backend");
    expect(html).toContain("HTTP 500");
    expect(html).not.toContain("<script");
    store.append("a", at(0, false));
    expect(snapshot(config, store, NOW).overall).toBe("outage");
  });

  it("escapes html in names", () => {
    const config = parseConfig('title: "<b>x</b>"\nmonitors:\n  - name: "<img src=x>"\n    url: https://a.test\n');
    const html = renderPage(snapshot(config, new Store(mkdtempSync(join(tmpdir(), "pw-"))), NOW));
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
  });
});
