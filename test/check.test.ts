import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { createServer as createTcp, type Server as TcpServer } from "node:net";
import { runCheck, checkTcp, parseConfig } from "../src/index.js";

let http: Server;
let tcp: TcpServer;
let port = 0;
let tcpPort = 0;

beforeAll(async () => {
  http = createServer((req, res) => {
    if (req.url === "/ok") return res.writeHead(200).end("hello world");
    if (req.url === "/slow") return setTimeout(() => res.writeHead(200).end("late"), 400);
    if (req.url === "/teapot") return res.writeHead(418).end("short and stout");
    res.writeHead(500).end("boom");
  });
  await new Promise<void>((r) => http.listen(0, r));
  port = (http.address() as { port: number }).port;
  tcp = createTcp((s) => s.end());
  await new Promise<void>((r) => tcp.listen(0, r));
  tcpPort = (tcp.address() as { port: number }).port;
});
afterAll(() => {
  http.close();
  tcp.close();
});

const mon = (extra: string) => parseConfig(`monitors:\n  - name: t\n${extra}`).monitors[0]!;

describe("runCheck (http)", () => {
  it("passes on 2xx and body match", async () => {
    const r = await runCheck(mon(`    url: http://127.0.0.1:${port}/ok\n    expectBody: hello`));
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(r.tlsDays).toBeUndefined();
  });
  it("fails on unexpected status, with the status in the error", async () => {
    const r = await runCheck(mon(`    url: http://127.0.0.1:${port}/nope`));
    expect(r).toMatchObject({ ok: false, status: 500, error: "HTTP 500" });
  });
  it("accepts explicit expectStatus", async () => {
    expect((await runCheck(mon(`    url: http://127.0.0.1:${port}/teapot\n    expectStatus: [418]`))).ok).toBe(true);
  });
  it("fails on missing body text", async () => {
    const r = await runCheck(mon(`    url: http://127.0.0.1:${port}/ok\n    expectBody: goodbye`));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("goodbye");
  });
  it("times out", async () => {
    const r = await runCheck(mon(`    url: http://127.0.0.1:${port}/slow\n    timeout: 500`), {});
    // timeout is clamped to >= 500 ms and /slow answers in 400, so use an unroutable port for a real timeout
    expect(r.ok).toBe(true);
    const r2 = await runCheck(mon(`    url: http://10.255.255.1:81/\n    timeout: 500`));
    expect(r2.ok).toBe(false);
    expect(r2.error).toMatch(/timeout|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT/);
  }, 10_000);
  it("reports connection refused", async () => {
    const r = await runCheck(mon(`    url: http://127.0.0.1:1/`));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECONNREFUSED|fetch failed/);
  });
});

describe("checkTcp", () => {
  it("connects to an open port and fails on a closed one", async () => {
    expect((await checkTcp(mon(`    type: tcp\n    host: 127.0.0.1\n    port: ${tcpPort}`))).ok).toBe(true);
    const r = await checkTcp(mon(`    type: tcp\n    host: 127.0.0.1\n    port: 1`));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("ECONNREFUSED");
  });
});
