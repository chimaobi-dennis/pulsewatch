import { connect as tlsConnect } from "node:tls";
import { createConnection } from "node:net";
import type { CheckResult, MonitorConfig } from "./types.js";

/** Days until the certificate served by host:port expires. Resolves undefined on any failure. */
export function tlsExpiryDays(host: string, port = 443, timeout = 5000): Promise<number | undefined> {
  return new Promise((resolve) => {
    const socket = tlsConnect({ host, port, servername: host, timeout, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) return resolve(undefined);
      const ms = new Date(cert.valid_to).getTime() - Date.now();
      resolve(Math.floor(ms / 86_400_000));
    });
    socket.on("error", () => resolve(undefined));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(undefined);
    });
  });
}

export async function checkHttp(m: MonitorConfig, fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const t = new Date().toISOString();
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), m.timeout);
  try {
    const res = await fetchImpl(m.target, { method: m.method, headers: { "user-agent": "pulsewatch/0.1", ...m.headers }, signal: ctrl.signal, redirect: "follow" });
    const ms = Math.round(performance.now() - started);
    const statusOk = m.expectStatus.length ? m.expectStatus.includes(res.status) : res.status >= 200 && res.status < 400;
    let bodyOk = true;
    if (m.expectBody !== undefined) {
      const body = await res.text();
      bodyOk = body.includes(m.expectBody);
    }
    const result: CheckResult = { t, ok: statusOk && bodyOk, ms, status: res.status };
    if (!statusOk) result.error = `HTTP ${res.status}`;
    else if (!bodyOk) result.error = `body missing "${m.expectBody}"`;
    return result;
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    const err = e as Error & { cause?: { code?: string } };
    const error = err.name === "AbortError" ? `timeout after ${m.timeout} ms` : err.cause?.code ?? err.message;
    return { t, ok: false, ms, error };
  } finally {
    clearTimeout(timer);
  }
}

export function checkTcp(m: MonitorConfig): Promise<CheckResult> {
  const t = new Date().toISOString();
  const started = performance.now();
  const [host, portStr] = m.target.split(":");
  const port = Number(portStr);
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: m.timeout });
    const done = (ok: boolean, error?: string) => {
      socket.destroy();
      resolve({ t, ok, ms: Math.round(performance.now() - started), error });
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false, `timeout after ${m.timeout} ms`));
    socket.once("error", (e: NodeJS.ErrnoException) => done(false, e.code ?? e.message));
  });
}

/** Run one check for a monitor, including TLS expiry for https targets. */
export async function runCheck(m: MonitorConfig, opts: { fetchImpl?: typeof fetch; tls?: boolean } = {}): Promise<CheckResult> {
  const result = m.type === "tcp" ? await checkTcp(m) : await checkHttp(m, opts.fetchImpl);
  if (opts.tls !== false && m.type === "http" && m.target.startsWith("https://")) {
    try {
      const u = new URL(m.target);
      const days = await tlsExpiryDays(u.hostname, Number(u.port || 443), Math.min(m.timeout, 5000));
      if (days !== undefined) {
        result.tlsDays = days;
        if (days < 0) {
          result.ok = false;
          result.error = result.error ?? "TLS certificate expired";
        }
      }
    } catch {
      /* TLS inspection is best-effort */
    }
  }
  return result;
}
