import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, checkAll, parseConfig, formatMessage } from "../src/index.js";

const fakeFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => ((url: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(String(url), init))) as typeof fetch;

describe("checkAll", () => {
  it("records results and notifies only on state changes", async () => {
    const posted: Array<{ url: string; body: unknown }> = [];
    let healthy = true;
    const fetchImpl = fakeFetch((url, init) => {
      if (url.startsWith("https://hooks")) {
        posted.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response("ok");
      }
      return new Response(healthy ? "fine" : "nope", { status: healthy ? 200 : 503 });
    });
    const config = parseConfig("monitors:\n  - name: Site\n    url: https://site.test\n    retries: 1\nnotifiers:\n  - type: slack\n    url: https://hooks.test/slack\n  - type: webhook\n    url: https://hooks.test/wh\n    monitors: [site]\n");
    const store = new Store(mkdtempSync(join(tmpdir(), "pw-")));
    const changes: string[] = [];
    const opts = { fetchImpl, tls: false, onChange: (c: { from: string; to: string }) => changes.push(`${c.from}>${c.to}`) };

    await checkAll(config, store, opts); // unknown -> up: no notification
    expect(posted).toHaveLength(0);
    healthy = false;
    await checkAll(config, store, opts); // up -> down
    expect(changes).toEqual(["up>down"]);
    expect(posted).toHaveLength(2);
    expect((posted[0]!.body as { text: string }).text).toContain("DOWN");
    expect((posted[1]!.body as { event: string }).event).toBe("monitor.down");
    await checkAll(config, store, opts); // still down: nothing new
    expect(posted).toHaveLength(2);
    healthy = true;
    const results = await checkAll(config, store, opts); // down -> up
    expect(results[0]!.state).toBe("up");
    expect(changes).toEqual(["up>down", "down>up"]);
    expect(store.read("site")).toHaveLength(4);
  });

  it("formats messages", () => {
    const m = parseConfig("monitors:\n  - name: Site\n    url: https://s.test\n").monitors[0]!;
    expect(formatMessage({ monitor: m, from: "up", to: "down", result: { t: "", ok: false, ms: 0, error: "HTTP 500" }, at: "" })).toContain("HTTP 500");
    expect(formatMessage({ monitor: m, from: "down", to: "up", result: { t: "", ok: true, ms: 42 }, at: "" })).toContain("42 ms");
  });
});
