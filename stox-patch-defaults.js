#!/usr/bin/env node
"use strict";

/* stox-patch-defaults.js — Updates app-wide default Target % and Horizon.
   - Updates SCORE_CONFIG (horizonDays: 13, targetPct: 0.031)
   - Bumps SCORE_CONFIG_VERSION to 19 (clears stale caches)
   - Updates fallbacks in backtest/batch engines (15 -> 13, 3.5 -> 3.1)
   - Updates UI default state in Score Tuner and Backtest panels.
   Idempotent. Backs up as *.bak-defaults. */

const fs   = require("fs");
const path = require("path");
const SRC  = __dirname;
const DRY  = process.argv.includes("--dry-run");

function rd(f) { return fs.readFileSync(path.join(SRC, f), "utf8"); }
function wr(f, c) {
  if (DRY) return;
  const p = path.join(SRC, f);
  if (!fs.existsSync(p + ".bak-defaults")) fs.copyFileSync(p, p + ".bak-defaults");
  fs.writeFileSync(p, c, "utf8");
}

function patchFile(file, patches) {
  console.log("\n[ " + file + " ]\n");
  let src = rd(file);
  let changed = false;
  
  for (const p of patches) {
    if (src.includes(p.replaceId)) {
      console.log("  · " + p.name + "  (already applied)");
      continue;
    }
    
    let newSrc;
    if (p.regex) {
      newSrc = src.replace(p.regex, p.replace);
    } else {
      newSrc = src.split(p.find).join(p.replace);
    }
    
    if (newSrc !== src) {
      src = newSrc;
      changed = true;
      console.log("  ✓ " + p.name);
    } else {
      console.log("  ✗ NOT FOUND: " + p.name);
    }
  }
  if (changed) wr(file, src);
}

console.log("🚀 Updating defaults to 3.1% target / 13 days...\n");

/* ── 1. indicators.js — Core Config ─────────────────────────────────────── */
patchFile("indicators.js", [
  {
    name: "default horizonDays = 13",
    find: "    horizonDays: 10,",
    replace: "    horizonDays: 13,",
    replaceId: "    horizonDays: 13,"
  },
  {
    name: "default targetPct = 0.031",
    find: "    forwardSim: { targetPct: 0.05 },",
    replace: "    forwardSim: { targetPct: 0.031 },",
    replaceId: "    forwardSim: { targetPct: 0.031 },"
  },
  {
    name: "bump SCORE_CONFIG_VERSION to 19",
    find: "  var SCORE_CONFIG_VERSION = 18;",
    replace: "  var SCORE_CONFIG_VERSION = 19;",
    replaceId: "  var SCORE_CONFIG_VERSION = 19;"
  },
  {
    name: "update fallback target (3.5 -> 3.1) in horizon confidence",
    regex: /SCORE_CONFIG\.forwardSim\.targetPct != null \? getTargetPctDisplay\(\) : 3\.5/g,
    replace: "SCORE_CONFIG.forwardSim.targetPct != null ? getTargetPctDisplay() : 3.1",
    replaceId: "getTargetPctDisplay() : 3.1"
  },
  {
    name: "update fallback horizon (15 -> 13) in horizon confidence",
    regex: /SCORE_CONFIG\.horizonDays \|\| 15/g,
    replace: "SCORE_CONFIG.horizonDays || 13",
    replaceId: "SCORE_CONFIG.horizonDays || 13"
  }
]);

/* ── 2. app-core.js — UI Defaults ───────────────────────────────────────── */
patchFile("app-core.js", [
  {
    name: "ScoreTunerPanel: target state = 3.1",
    find: "const [target, setTarget] = useState(3);",
    replace: "const [target, setTarget] = useState(3.1);",
    replaceId: "const [target, setTarget] = useState(3.1);"
  },
  {
    name: "ScoreTunerPanel: holding state = 13",
    find: "const [holding, setHolding] = useState(10);",
    replace: "const [holding, setHolding] = useState(13);",
    replaceId: "const [holding, setHolding] = useState(13);"
  },
  {
    name: "App-core fallbacks (target: 3.5 -> 3.1)",
    regex: /getTargetPctDisplay\(\) : 3\.5/g,
    replace: "getTargetPctDisplay() : 3.1",
    replaceId: "getTargetPctDisplay() : 3.1"
  },
  {
    name: "App-core fallbacks (horizon: 15 -> 13)",
    regex: /horizonDays \|\| 15/g,
    replace: "horizonDays || 13",
    replaceId: "horizonDays || 13"
  }
]);

/* ── 3. backtest-engine.js — Fallbacks ──────────────────────────────────── */
patchFile("backtest-engine.js", [
  {
    name: "Backtest engine target fallback (3.5 -> 3.1)",
    regex: /getTargetPctDisplay\(\) : 3\.5/g,
    replace: "getTargetPctDisplay() : 3.1",
    replaceId: "getTargetPctDisplay() : 3.1"
  },
  {
    name: "Backtest engine horizon fallback (15 -> 13)",
    regex: /horizonDays\) \|\| 15/g,
    replace: "horizonDays) || 13",
    replaceId: "horizonDays) || 13"
  }
]);

/* ── 4. batch-backtest.js — Fallbacks ───────────────────────────────────── */
patchFile("batch-backtest.js", [
  {
    name: "Batch backtest target fallback (3.5 -> 3.1)",
    regex: /getTargetPctDisplay\(\) : 3\.5/g,
    replace: "getTargetPctDisplay() : 3.1",
    replaceId: "getTargetPctDisplay() : 3.1"
  },
  {
    name: "Batch backtest horizon fallback (15 -> 13)",
    regex: /horizonDays\) \|\| 15/g,
    replace: "horizonDays) || 13",
    replaceId: "horizonDays) || 13"
  }
]);

/* ── 5. pattern-dashboard.js — UI Defaults ──────────────────────────────── */
patchFile("pattern-dashboard.js", [
  {
    name: "Pattern Dashboard target fallback (3.5 -> 3.1)",
    regex: /getTargetPctDisplay\(\) : 3\.5/g,
    replace: "getTargetPctDisplay() : 3.1",
    replaceId: "getTargetPctDisplay() : 3.1"
  },
  {
    name: "Pattern Dashboard horizon fallback (15 -> 13)",
    regex: /horizonDays \|\| 15/g,
    replace: "horizonDays || 13",
    replaceId: "horizonDays || 13"
  }
]);

/* ── 6. pattern-integration.js — Utility Fallbacks ──────────────────────── */
patchFile("pattern-integration.js", [
  {
    name: "Pattern integration target fallback (3.5 -> 3.1)",
    regex: /getTargetPctDisplay\(\) : 3\.5/g,
    replace: "getTargetPctDisplay() : 3.1",
    replaceId: "getTargetPctDisplay() : 3.1"
  },
  {
    name: "Pattern integration horizon fallback (15 -> 13)",
    regex: /horizonDays \|\| 15/g,
    replace: "horizonDays || 13",
    replaceId: "horizonDays || 13"
  }
]);

console.log("\n" + (DRY ? "[DRY RUN] no files written.\n" : "Done. Defaults updated to 3.1% and 13 days.\n"));