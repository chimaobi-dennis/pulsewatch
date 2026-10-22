import type { MonitorSummary, StatusSnapshot } from "./types.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (v: number | null) => (v === null ? "–" : `${v.toFixed(v >= 99.95 ? 3 : 2)}%`);
const dur = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)}m` : ms < 86_400_000 ? `${(ms / 3_600_000).toFixed(1)}h` : `${(ms / 86_400_000).toFixed(1)}d`);

/** Inline SVG sparkline of hourly average latency over the last 24 h. */
export function sparklineSvg(points: Array<number | null>, w = 160, h = 28): string {
  const vals = points.filter((p): p is number => p !== null);
  if (vals.length === 0) return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const max = Math.max(...vals, 1);
  const step = w / Math.max(points.length - 1, 1);
  const d = points
    .map((p, i) => (p === null ? null : `${(i * step).toFixed(1)},${(h - 2 - (p / max) * (h - 4)).toFixed(1)}`))
    .reduce<string[]>((acc, pt, i, arr) => {
      if (pt === null) return acc;
      const prev = i > 0 ? arr[i - 1] : null;
      acc.push(`${prev === null || prev === undefined ? "M" : "L"}${pt}`);
      return acc;
    }, [])
    .join(" ");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-label="latency last 24 hours"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

/** 90 one-day bars coloured by uptime. */
export function dayBars(days: Array<number | null>): string {
  return `<div class="days" aria-label="90 day history">${days
    .map((d, i) => {
      const cls = d === null ? "none" : d >= 99.9 ? "ok" : d >= 95 ? "warn" : "bad";
      const title = d === null ? `day ${i - 89}: no data` : `${d}% uptime`;
      return `<i class="${cls}" title="${title}"></i>`;
    })
    .join("")}</div>`;
}

function monitorCard(m: MonitorSummary): string {
  const dot = m.state === "up" ? "ok" : m.state === "down" ? "bad" : "none";
  const last = m.last ? `${m.last.ok ? "up" : "down"} · ${m.last.ms} ms${m.last.status ? ` · HTTP ${m.last.status}` : ""}${m.last.error ? ` · ${esc(m.last.error)}` : ""}` : "no checks yet";
  const tls = m.tlsDays !== undefined ? `<span class="tls ${m.tlsDays <= m.monitor.tlsWarnDays ? "warn" : ""}">TLS ${m.tlsDays}d</span>` : "";
  const inc = m.incidents
    .slice(0, 5)
    .map((i) => `<li><time datetime="${i.start}">${esc(i.start.replace("T", " ").slice(0, 16))}</time> · ${i.end ? dur(i.durationMs) : "ongoing"}${i.error ? ` · ${esc(i.error)}` : ""}</li>`)
    .join("");
  return `<section class="card" id="${esc(m.monitor.id)}">
  <header><span class="dot ${dot}"></span><h2>${esc(m.monitor.name)}</h2>${tls}<span class="up">${pct(m.uptime.d90)} <small>90d</small></span></header>
  <div class="row"><span class="target">${esc(m.monitor.target)}</span><span class="last">${last}</span></div>
  <div class="row"><span class="stats">24h ${pct(m.uptime.d1)} · 7d ${pct(m.uptime.d7)} · 30d ${pct(m.uptime.d30)}${m.avgMs24h !== null ? ` · avg ${m.avgMs24h} ms` : ""}</span>${sparklineSvg(m.sparkline)}</div>
  ${dayBars(m.days)}
  ${inc ? `<details><summary>${m.incidents.length} incident${m.incidents.length === 1 ? "" : "s"}</summary><ul class="inc">${inc}</ul></details>` : ""}
</section>`;
}

export function renderPage(s: StatusSnapshot, opts: { refreshSeconds?: number } = {}): string {
  const banner = { operational: ["ok", "All systems operational"], degraded: ["warn", "Some systems are down"], outage: ["bad", "Major outage"], unknown: ["none", "No data yet"] }[s.overall];
  const groups = new Map<string, MonitorSummary[]>();
  for (const m of s.monitors) {
    const g = m.monitor.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), m]);
  }
  const body = [...groups.entries()].map(([g, ms]) => `${g ? `<h3 class="group">${esc(g)}</h3>` : ""}${ms.map(monitorCard).join("\n")}`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.title)}</title>${opts.refreshSeconds ? `<meta http-equiv="refresh" content="${opts.refreshSeconds}">` : ""}
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#1b1f24;--muted:#6b7280;--ok:#16a34a;--warn:#d97706;--bad:#dc2626;--none:#d1d5db;--line:#e5e7eb}
@media(prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--fg:#e6e8eb;--muted:#9aa3ad;--none:#374151;--line:#262b33}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 4px}.desc{color:var(--muted);margin:0 0 16px}
.banner{border-radius:10px;padding:14px 16px;font-weight:600;margin:0 0 20px;color:#fff}.banner.ok{background:var(--ok)}.banner.warn{background:var(--warn)}.banner.bad{background:var(--bad)}.banner.none{background:var(--muted)}
.group{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:22px 0 8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 12px}
.card header{display:flex;align-items:center;gap:10px}.card h2{font-size:16px;margin:0;flex:1}
.dot{width:10px;height:10px;border-radius:50%;background:var(--none);flex:none}.dot.ok{background:var(--ok)}.dot.bad{background:var(--bad)}
.up{font-variant-numeric:tabular-nums;font-weight:600}.up small{color:var(--muted);font-weight:400}
.tls{font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:1px 6px}.tls.warn{color:var(--warn);border-color:var(--warn)}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:6px;color:var(--muted);font-size:13px;flex-wrap:wrap}
.target{word-break:break-all}.spark{color:var(--ok)}
.days{display:flex;gap:2px;margin-top:10px}.days i{flex:1;height:22px;border-radius:2px;background:var(--none)}.days i.ok{background:var(--ok)}.days i.warn{background:var(--warn)}.days i.bad{background:var(--bad)}
details{margin-top:10px;font-size:13px}summary{cursor:pointer;color:var(--muted)}.inc{margin:6px 0 0;padding-left:18px}
footer{color:var(--muted);font-size:12px;margin-top:24px}
</style></head><body><main>
<h1>${esc(s.title)}</h1>${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}
<div class="banner ${banner[0]}">${banner[1]}</div>
${body}
<footer>Updated <time datetime="${s.generatedAt}">${esc(s.generatedAt.replace("T", " ").slice(0, 19))} UTC</time> · generated by <a href="https://github.com/chimaobi-dennis/modal-flow-form">pulsewatch</a></footer>
</main></body></html>
`;
}
