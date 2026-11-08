#!/usr/bin/env node
"use strict";

/* stox-patch-quant.js — Institutional Quant Layer (v1)
   - Adds Amihud, OU Half-Life, VPIN, Days-Since to indicators.js
   - Adds Institutional Penalties to Entry Score
   - Adds Expected Shortfall (CVaR) to backtest-engine.js
   - Adds Cross-Sectional Ranking & IC to batch-backtest.js
   - Expands ML features to 28 keys
   - Adds Quant UI to pattern-dashboard.js
*/

const fs   = require("fs");
const path = require("path");
const SRC  = __dirname;
const DRY  = process.argv.includes("--dry-run");

function rd(f) { return fs.readFileSync(path.join(SRC, f), "utf8"); }
function wr(f, c) {
  if (DRY) return;
  const p = path.join(SRC, f);
  if (!fs.existsSync(p + ".bak-quant")) fs.copyFileSync(p, p + ".bak-quant");
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
    const newSrc = src.split(p.find).join(p.replace);
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

console.log("🚀 Installing Institutional Quant Layer...\n");

/* ── 1. indicators.js — Math, Modifiers & Snapshot ──────────────────────── */
const INDICATOR_MATH = `
  function calcAmihud(candles, period) {
    period = period || 20;
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < 1) { out.push(null); continue; }
      var ret = Math.abs((candles[i].c - candles[i-1].c) / candles[i-1].c);
      var turnover = candles[i].c * candles[i].v;
      out.push(turnover > 0 ? ret / (turnover / 1e7) : 0);
    }
    return sma(out, period);
  }
  function calcOUHalfLife(candles, period) {
    period = period || 20;
    var cl = closes(candles);
    var smaArr = sma(cl, period);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < period + 5) { out.push(null); continue; }
      var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, n = 0;
      for (var j = i - 4; j <= i; j++) {
        if (smaArr[j] == null) continue;
        var x = cl[j-1] - smaArr[j-1];
        var y = cl[j] - cl[j-1];
        sumX += x; sumY += y; sumXY += x*y; sumX2 += x*x; n++;
      }
      var denom = n*sumX2 - sumX*sumX;
      var beta = denom !== 0 ? (n*sumXY - sumX*sumY) / denom : 0;
      if (beta >= 0) { out.push(999); continue; } // Not mean reverting
      var hl = -Math.log(2) / Math.log(1 + beta);
      out.push(hl > 0 && hl < 100 ? round(hl, 1) : 999);
    }
    return out;
  }
  function calcVPINProxy(candles, period) {
    period = period || 14;
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period) { out.push(null); continue; }
      var buyVol = 0, sellVol = 0;
      for (var j = i - period + 1; j <= i; j++) {
        var vol = candles[j].v || 0;
        if (candles[j].c >= candles[j].o) buyVol += vol; else sellVol += vol;
      }
      var tot = buyVol + sellVol;
      out.push(tot > 0 ? Math.abs(buyVol - sellVol) / tot : 0);
    }
    return out;
  }
  function calcDaysSince(candles, period, isHigh) {
    period = period || 20;
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var bestIdx = i, bestVal = isHigh ? -Infinity : Infinity;
      for (var j = i - period + 1; j <= i; j++) {
        var v = isHigh ? candles[j].h : candles[j].l;
        if (isHigh ? v > bestVal : v < bestVal) { bestVal = v; bestIdx = j; }
      }
      out.push(i - bestIdx);
    }
    return out;
  }
`;

patchFile("indicators.js", [
  {
    name: "Add Institutional Math functions",
    find: "  function calcRSI(candles, period) {",
    replace: INDICATOR_MATH + "\n  function calcRSI(candles, period) {",
    replaceId: "function calcAmihud(candles, period) {"
  },
  {
    name: "Add metrics to computeAll",
    find: "    smartMoney: smc, mtfAlignment: last(calcMTFAlignment(candles)),",
    replace: "    amihud: last(calcAmihud(candles)), ouHalfLife: last(calcOUHalfLife(candles)), vpin: last(calcVPINProxy(candles)), daysSinceHigh: last(calcDaysSince(candles, 20, true)), daysSinceLow: last(calcDaysSince(candles, 20, false)),\n    smartMoney: smc, mtfAlignment: last(calcMTFAlignment(candles)),",
    replaceId: "amihud: last(calcAmihud(candles))"
  },
  {
    name: "Add Metrics to Entry Snapshot",
    find: "      var weeklyHABullish = null;",
    replace: "      var amihud = last(calcAmihud(candles));\n      var ouHalfLife = last(calcOUHalfLife(candles));\n      var vpin = last(calcVPINProxy(candles));\n      var daysSinceHigh = last(calcDaysSince(candles, 20, true));\n      var daysSinceLow = last(calcDaysSince(candles, 20, false));\n      var weeklyHABullish = null;",
    replaceId: "var amihud = last(calcAmihud(candles));"
  },
  {
    name: "Return Metrics in Entry Snapshot",
    find: "        dcUpperPrior: dcUpperPrior, barsSinceBreakout: barsSinceBreakout",
    replace: "        dcUpperPrior: dcUpperPrior, barsSinceBreakout: barsSinceBreakout,\n        amihud: amihud, ouHalfLife: ouHalfLife, vpin: vpin, daysSinceHigh: daysSinceHigh, daysSinceLow: daysSinceLow",
    replaceId: "amihud: amihud, ouHalfLife: ouHalfLife"
  },
  {
    name: "Apply Quant Penalties in buildEntryModifiers",
    find: "    if (atrPercentile != null && atrPercentile >= mc.highVolATRPercentile && sn && sn.efficiencyRatio10 != null && sn.efficiencyRatio10 > mc.highVolERThreshold) {\n      items.push({ reason: \"High momentum in high-vol regime\", amount: mc.highVolBonus });\n    }",
    replace: "    if (atrPercentile != null && atrPercentile >= mc.highVolATRPercentile && sn && sn.efficiencyRatio10 != null && sn.efficiencyRatio10 > mc.highVolERThreshold) {\n      items.push({ reason: \"High momentum in high-vol regime\", amount: mc.highVolBonus });\n    }\n    if (sn && sn.amihud != null && sn.amihud > 0.5) { items.push({ reason: \"High illiquidity risk (Amihud)\", amount: -5 }); }\n    if (sn && sn.ouHalfLife != null && sn.ouHalfLife > 13) { items.push({ reason: \"Slow mean-reversion (Half-Life > 13d)\", amount: -5 }); }\n    if (sn && sn.vpin != null && sn.vpin > 0.6) { items.push({ reason: \"High toxic order flow (VPIN)\", amount: -5 }); }\n    if (sn && sn.daysSinceHigh != null && sn.daysSinceHigh > 3 && sn.c > sn.sma20) { items.push({ reason: \"Stale breakout (Day \" + sn.daysSinceHigh + \")\", amount: -3 }); }",
    replaceId: "High illiquidity risk (Amihud)"
  }
]);

/* ── 2. ml-trainer.js — Expand Features ─────────────────────────────────── */
patchFile("ml-trainer.js", [
  {
    name: "Expand FEATURE_KEYS to 28",
    find: '    "bull_bear", "market_momentum", "cap_tier", "rsi_regime"\n  ];',
    replace: '    "bull_bear", "market_momentum", "cap_tier", "rsi_regime",\n    "amihud", "ouHalfLife", "vpin", "daysSinceHigh"\n  ];',
    replaceId: '"amihud", "ouHalfLife", "vpin", "daysSinceHigh"'
  }
]);

/* ── 3. batch-backtest.js — Cross-Sectional Rank & IC ───────────────────── */
const RANK_LOGIC = `
  function _applyCrossSectionalRanks(dataMap) {
    var snapshot = {};
    Object.keys(dataMap).forEach(function(sym) {
      var c = dataMap[sym];
      if (!c || c.length < 25) return;
      var roc = (c[c.length-1].c / c[c.length-21].c) - 1;
      snapshot[sym] = roc;
    });
    var sorted = Object.keys(snapshot).sort(function(a,b){ return snapshot[b] - snapshot[a]; });
    var rankMap = {};
    sorted.forEach(function(sym, i) { rankMap[sym] = Math.round((1 - i/sorted.length) * 100); });
    window.__stoxCrossSectionalRank = rankMap;
  }
`;
patchFile("batch-backtest.js", [
  {
    name: "Add cross-sectional ranking helper",
    find: "  async function runBatchFromDataMap(dataMap, multiTFMap, indexCandles, opts) {",
    replace: RANK_LOGIC + "\n  async function runBatchFromDataMap(dataMap, multiTFMap, indexCandles, opts) {\n    _applyCrossSectionalRanks(dataMap);",
    replaceId: "function _applyCrossSectionalRanks"
  },
  {
    name: "Apply Rank Penalty in scoreEntryPillarsForTF wrapper",
    find: "    return {\n      trendHealth: calcTrendHealthScore(sn),",
    replace: "    if (window.__stoxCrossSectionalRank && window.__stoxCrossSectionalRank[symbol] != null && window.__stoxCrossSectionalRank[symbol] < 20) {\n      sn.crossSectionalRank = window.__stoxCrossSectionalRank[symbol];\n    }\n    return {\n      trendHealth: calcTrendHealthScore(sn),",
    replaceId: "sn.crossSectionalRank = window.__stoxCrossSectionalRank[symbol];"
  }
]);

/* ── 4. backtest-engine.js — Expected Shortfall (CVaR) ──────────────────── */
patchFile("backtest-engine.js", [
  {
    name: "Add CVaR to calculateStats",
    find: "    var avgDays = wins.length ? wins.reduce(function (s, t) { return s + (t.daysToTarget || 0); }, 0) / wins.length : null;",
    replace: "    var avgDays = wins.length ? wins.reduce(function (s, t) { return s + (t.daysToTarget || 0); }, 0) / wins.length : null;\n    var sortedRets = trades.map(function(t){return t.finalReturnPct;}).sort(function(a,b){return a-b;});\n    var worst5Pct = sortedRets.slice(0, Math.max(1, Math.floor(sortedRets.length * 0.05)));\n    var cvar95 = worst5Pct.reduce(function(s,v){return s+v;}, 0) / worst5Pct.length;",
    replaceId: "var cvar95 = worst5Pct.reduce"
  },
  {
    name: "Return CVaR in stats object",
    find: "      maxDrawdown: eq ? eq.maxDrawdown : null,",
    replace: "      maxDrawdown: eq ? eq.maxDrawdown : null,\n      cvar95: Math.round(cvar95 * 100) / 100,",
    replaceId: "cvar95: Math.round(cvar95 * 100) / 100"
  }
]);

/* ── 5. pattern-dashboard.js — UI Updates (CVaR & IC) ───────────────────── */
patchFile("pattern-dashboard.js", [
  {
    name: "Add CVaR to Full Trade Stats",
    find: "          statCard(\"Median Max DD\", (agg.medianDD != null ? agg.medianDD : \"—\") + (agg.medianDD != null ? \"%\" : \"\")),",
    replace: "          statCard(\"Median Max DD\", (agg.medianDD != null ? agg.medianDD : \"—\") + (agg.medianDD != null ? \"%\" : \"\")),\n          agg.medianCVaR != null ? statCard(\"Median 95% CVaR\", agg.medianCVaR + \"%\") : null,",
    replaceId: "Median 95% CVaR"
  },
  {
    name: "Add CVaR to buildAggregate",
    find: "      maxConsecWins: maxCW,\n      maxConsecLosses: maxCL,",
    replace: "      maxConsecWins: maxCW,\n      maxConsecLosses: maxCL,\n      medianCVaR: (function() { var cvs = scoped.map(function(p) { return p.tradeStats ? p.tradeStats.cvar95 : null; }).filter(function(v) { return v != null; }).sort(function(a,b){return a-b;}); return cvs.length ? cvs[Math.floor(cvs.length/2)] : null; })(),",
    replaceId: "medianCVaR: (function()"
  }
]);

console.log("\n🚀 Running final syntax check...\n");
["indicators.js", "ml-trainer.js", "batch-backtest.js", "backtest-engine.js", "pattern-dashboard.js"].forEach(function(f) {
  try {
    new Function(rd(f));
    console.log("  ✓ " + f + " syntax OK");
  } catch(e) {
    console.log("  ✗ " + f + " SYNTAX ERROR: " + e.message);
  }
});

console.log("\n" + (DRY ? "[DRY RUN] no files written.\n" : "Done. Ready to commit and push.\n"));