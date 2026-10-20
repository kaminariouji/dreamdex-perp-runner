#!/usr/bin/env node
// Turn a perp-runner JSONL log into the markdown evidence table used in README.
// Usage: node summarize.mjs [path/to/run.jsonl]
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2] ?? path.join("runs", fs.readdirSync("runs").sort().at(-1));
const rows = fs
  .readFileSync(file, "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

// A run starts when the cycle counter goes back to 1.
const runs = [];
let current = null;
for (const row of rows) {
  if (row.event === "cycle-start" && (current === null || row.cycle === 1)) {
    current = { rows: [] };
    runs.push(current);
  }
  if (current) current.rows.push(row);
}

const usd = (n) => (n >= 0 ? "+" : "") + n.toFixed(4);
const short = (v) => (v ? `\`${v}\`` : "—");

for (const [i, run] of runs.entries()) {
  const opens = new Map();
  for (const r of run.rows) if (r.event === "open") opens.set(r.cycle, r);
  const ends = run.rows.filter((r) => r.event === "cycle-end");
  const net = ends.reduce((sum, r) => sum + (r.upnl ?? 0), 0);
  const count = (name) => ends.filter((r) => r.outcome === name).length;
  console.log(`\n### Run ${i + 1} — ${ends.length} cycles, net ${usd(net)} USDso\n`);
  console.log("| # | Outcome | uPnL | Open order | Open tx | Close order | Close tx |");
  console.log("|---|---|---|---|---|---|---|");
  for (const end of ends) {
    const open = opens.get(end.cycle) ?? {};
    // A cycle can log a close that never went through (sent false) and then retry,
    // so the row that counts is the one that was actually sent.
    const closes = run.rows.filter((r) => r.event === "close" && r.cycle === end.cycle);
    const close = closes.find((r) => r.sent === true) ?? closes.at(-1) ?? {};
    console.log(
      `| ${end.cycle} | ${end.outcome} | ${usd(end.upnl ?? 0)} | ${short(open.orderId)} | ${short(open.txHash)} | ${short(close.orderId)} | ${short(close.txHash)} |`,
    );
  }
  console.log(
    `\nTake-profit ${count("take-profit")} · stop-loss ${count("stop-loss")} · timeout ${count("timeout")} · closed ${count(
      "closed",
    )} · other ${ends.length - count("take-profit") - count("stop-loss") - count("timeout") - count("closed")}\n`,
  );
}
console.log(`Source: \`${file}\` (${rows.length} events).`);
