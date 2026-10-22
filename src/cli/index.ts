#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, writeFileSync } from "node:fs";
import pc from "picocolors";
import { loadConfig, CONFIG_FILENAME, EXAMPLE_CONFIG } from "../config.js";
import { Store, snapshot } from "../store.js";
import { checkAll, startScheduler } from "../scheduler.js";
import { renderPage } from "../page.js";
import { startServer } from "../server.js";
import type { CheckResult, MonitorConfig } from "../types.js";

const VERSION = "0.1.0";
const program = new Command();
program.name("pulsewatch").description("Self-hosted uptime monitor and status page.").version(VERSION);

const line = (m: MonitorConfig, r: CheckResult, state: string) => {
  const dot = r.ok ? pc.green("●") : pc.red("●");
  const extra = [r.status ? `HTTP ${r.status}` : "", r.tlsDays !== undefined ? `TLS ${r.tlsDays}d` : "", r.error ?? ""].filter(Boolean).join("  ");
  return `${dot} ${m.name.padEnd(24)} ${String(r.ms).padStart(6)} ms  ${pc.dim(state.padEnd(7))} ${pc.dim(extra)}`;
};

program
  .command("init")
  .description(`write an example ${CONFIG_FILENAME}`)
  .option("-f, --force", "overwrite an existing file", false)
  .action((o) => {
    if (existsSync(CONFIG_FILENAME) && !o.force) {
      console.error(pc.red(`${CONFIG_FILENAME} already exists (use --force to overwrite)`));
      process.exitCode = 1;
      return;
    }
    writeFileSync(CONFIG_FILENAME, EXAMPLE_CONFIG);
    console.log(pc.green(`✔ wrote ${CONFIG_FILENAME}. Edit it, then run: pulsewatch check`));
  });

program
  .command("check")
  .description("run every monitor once, record the results, exit 1 if anything is down")
  .option("-c, --config <file>", "config file", CONFIG_FILENAME)
  .option("--no-tls", "skip TLS expiry inspection")
  .option("--json", "print JSON instead of a table", false)
  .action(async (o) => {
    const config = loadConfig(o.config);
    const store = new Store(config.dataDir);
    const results = await checkAll(config, store, { tls: o.tls });
    if (o.json) console.log(JSON.stringify(results.map((r) => ({ id: r.monitor.id, name: r.monitor.name, state: r.state, ...r.result })), null, 2));
    else for (const r of results) console.log(line(r.monitor, r.result, r.state));
    const down = results.filter((r) => r.state === "down");
    if (!o.json) console.log(down.length ? pc.red(`\n✖ ${down.length} of ${results.length} monitors down`) : pc.green(`\n✔ all ${results.length} monitors up`));
    process.exitCode = down.length ? 1 : 0;
  });

program
  .command("generate")
  .description("render the static status page from recorded history")
  .option("-c, --config <file>", "config file", CONFIG_FILENAME)
  .option("-o, --output <file>", "output file", "status.html")
  .option("--json <file>", "also write the snapshot as JSON")
  .action((o) => {
    const config = loadConfig(o.config);
    const snap = snapshot(config, new Store(config.dataDir));
    writeFileSync(o.output, renderPage(snap));
    if (o.json) writeFileSync(o.json, JSON.stringify(snap, null, 2));
    console.log(pc.green(`✔ ${o.output} (${snap.overall}, ${snap.monitors.length} monitors)`));
  });

program
  .command("run")
  .description("keep checking on each monitor's interval; optionally serve the page")
  .option("-c, --config <file>", "config file", CONFIG_FILENAME)
  .option("-p, --port <port>", "also serve the status page on this port")
  .option("--no-tls", "skip TLS expiry inspection")
  .action((o) => {
    const config = loadConfig(o.config);
    const store = new Store(config.dataDir);
    startScheduler(config, store, { tls: o.tls, onResult: (m, r, s) => console.log(`${pc.dim(r.t.slice(11, 19))} ${line(m, r, s)}`), onChange: (c) => console.log(pc.bold(`${c.monitor.name}: ${c.from} → ${c.to}`)) });
    if (o.port) {
      startServer(config, store, Number(o.port));
      console.log(pc.green(`✔ status page on http://localhost:${o.port}  (JSON at /api/status)`));
    }
    console.log(pc.dim(`watching ${config.monitors.length} monitors; data in ${config.dataDir}`));
  });

program
  .command("serve")
  .description("serve the status page from recorded history without running checks")
  .option("-c, --config <file>", "config file", CONFIG_FILENAME)
  .option("-p, --port <port>", "port", "3030")
  .action((o) => {
    const config = loadConfig(o.config);
    startServer(config, new Store(config.dataDir), Number(o.port));
    console.log(pc.green(`✔ serving http://localhost:${o.port}`));
  });

program.parseAsync(process.argv).catch((e: Error) => {
  console.error(pc.red(e.message));
  process.exitCode = 1;
});
