import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, parseConfig, startServer } from "../src/index.js";

const config = parseConfig("title: Srv\nmonitors:\n  - name: A\n    url: https://a.test\n");
const store = new Store(mkdtempSync(join(tmpdir(), "pw-")));
store.append("a", { t: new Date().toISOString(), ok: true, ms: 12 });
const server = startServer(config, store, 0);
const base = () => `http://127.0.0.1:${(server.address() as { port: number }).port}`;
afterAll(() => server.close());

describe("server", () => {
  it("serves html, json and healthz", async () => {
    const html = await fetch(base() + "/");
    expect(html.status).toBe(200);
    expect(await html.text()).toContain("All systems operational");
    const json = await (await fetch(base() + "/api/status")).json();
    expect(json.monitors[0].state).toBe("up");
    expect((await fetch(base() + "/healthz")).status).toBe(200);
    expect((await fetch(base() + "/nope")).status).toBe(404);
  });
  it("returns 503 for the page when something is down", async () => {
    store.append("a", { t: new Date().toISOString(), ok: false, ms: 0, error: "x" });
    expect((await fetch(base() + "/")).status).toBe(503);
  });
});
