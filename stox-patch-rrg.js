#!/usr/bin/env node
"use strict";

/* stox-patch-rrg.js v3 — reads rrg.js from disk, only patches wiring.
   Run AFTER saving rrg.js. Idempotent. Backs up as *.bak on first edit. */

const fs   = require("fs");
const path = require("path");
const SRC  = __dirname;
const DRY  = process.argv.includes("--dry-run");

function rd(f) {
  const p = path.join(SRC, f);
  if (!fs.existsSync(p)) throw new Error("Missing file: " + f);
  return fs.readFileSync(p, "utf8");
}
function wr(f, c) {
  if (DRY) return;
  const p = path.join(SRC, f);
  if (!fs.existsSync(p + ".bak")) fs.copyFileSync(p, p + ".bak");
  fs.writeFileSync(p, c, "utf8");
}
function patch(file, patches) {
  console.log("\n[ " + file + " ]");
  let src = rd(file);
  let changed = false;
  for (const p of patches) {
    if (src.includes(p.find)) {
      src = src.split(p.find).join(p.replace);
      changed = true;
      console.log("  ✓ " + p.name);
    } else if (p.alreadyIf && src.includes(p.alreadyIf)) {
      console.log("  · " + p.name + " (already)");
    } else if (!p.optional) {
      console.log("  ✗ NOT FOUND: " + p.name);
    }
  }
  if (changed) wr(file, src);
}

/* Verify rrg.js exists */
if (!fs.existsSync(path.join(SRC, "rrg.js"))) {
  console.error("\n✗ rrg.js missing. Save Step 1's file as rrg.js first.\n");
  process.exit(1);
}
console.log("✓ rrg.js present (" + fs.statSync(path.join(SRC, "rrg.js")).size + " bytes)");

/* ── 1. index.html ─────────────────────────────────────────────────── */
patch("index.html", [{
  name: "load rrg.js",
  find: `<script type="text/babel" src="./data-fetcher.js"></script>`,
  replace: `<script type="text/babel" src="./data-fetcher.js"></script>\n<script type="text/babel" src="./rrg.js"></script>`,
  alreadyIf: `src="./rrg.js"`
}]);

/* ── 2. sw.js ──────────────────────────────────────────────────────── */
patch("sw.js", [
  {
    name: "bump cache to v470",
    find: `const CACHE_NAME = 'stox-v469';`,
    replace: `const CACHE_NAME = 'stox-v470';`,
    alreadyIf: `const CACHE_NAME = 'stox-v470';`
  },
  {
    name: "cache rrg.js",
    find: `  './data-fetcher.js',\n  './backtest-engine.js',`,
    replace: `  './data-fetcher.js',\n  './rrg.js',\n  './backtest-engine.js',`,
    alreadyIf: `'./rrg.js'`
  }
]);

/* ── 3. indicators.js ──────────────────────────────────────────────── */
patch("indicators.js", [
  {
    name: "buildEntrySnapshot: accept symbol",
    find: `function buildEntrySnapshot(candles, indexCandles, tf) {`,
    replace: `function buildEntrySnapshot(candles, indexCandles, tf, symbol) {`,
    alreadyIf: `function buildEntrySnapshot(candles, indexCandles, tf, symbol) {`
  },
  {
    name: "buildEntrySnapshot: expose symbol in snapshot",
    find: `        c: c, pc: L >= 2 ? cl[L1 - 1] : null, o: op[L1] != null ? op[L1] : c, h: hi[L1], l: lo[L1],\n        cl: cl, vo: vo, volRatio: volRatio,`,
    replace: `        c: c, pc: L >= 2 ? cl[L1 - 1] : null, o: op[L1] != null ? op[L1] : c, h: hi[L1], l: lo[L1],\n        symbol: symbol || null,\n        cl: cl, vo: vo, volRatio: volRatio,`,
    alreadyIf: `        symbol: symbol || null,\n`
  },
  {
    name: "scoreEntryPillarsForTF: pass symbol",
    find: `  function scoreEntryPillarsForTF(candles, indexCandles, tf) {\n    var sn = buildEntrySnapshot(candles, indexCandles, tf);`,
    replace: `  function scoreEntryPillarsForTF(candles, indexCandles, tf, symbol) {\n    var sn = buildEntrySnapshot(candles, indexCandles, tf, symbol);`,
    alreadyIf: `function scoreEntryPillarsForTF(candles, indexCandles, tf, symbol) {`
  },
  {
    name: "computeEntryScore: accept symbol",
    find: `  function computeEntryScore(candles, indexCandles) {\n    if (!candles || candles.length < 50) return { entry_score: null, reason: 'insufficient_data', need: 50, got: candles ? candles.length : 0 };\n    var sn = buildEntrySnapshot(candles, indexCandles, 'D');`,
    replace: `  function computeEntryScore(candles, indexCandles, symbol) {\n    if (!candles || candles.length < 50) return { entry_score: null, reason: 'insufficient_data', need: 50, got: candles ? candles.length : 0 };\n    var sn = buildEntrySnapshot(candles, indexCandles, 'D', symbol);`,
    alreadyIf: `function computeEntryScore(candles, indexCandles, symbol) {`
  },
  {
    name: "computeEntryScore: sector-RRG override in RS gate",
    find: `      var isLeader = (sn.c > sn.sma200) && (sn.rsMansfield !== null && sn.rsMansfield > 0);\n      if (!isLeader) {`,
    replace: `      var isLeader = (sn.c > sn.sma200) && (sn.rsMansfield !== null && sn.rsMansfield > 0);\n      if (!isLeader && symbol && window.SectorRRG) { try { var _rq = window.SectorRRG.getSectorQuadrantForSymbol(symbol); if (_rq && _rq.quadrant === "Leading") isLeader = true; } catch (_e) {} }\n      if (!isLeader) {`,
    alreadyIf: `window.SectorRRG.getSectorQuadrantForSymbol(symbol)`
  },
  {
    name: "computeMultiTFEntryScore: accept symbol",
    find: `  function computeMultiTFEntryScore(tfResults, indexCandles, indexWeeklyCandles) {`,
    replace: `  function computeMultiTFEntryScore(tfResults, indexCandles, indexWeeklyCandles, symbol) {`,
    alreadyIf: `function computeMultiTFEntryScore(tfResults, indexCandles, indexWeeklyCandles, symbol) {`
  },
  {
    name: "computeMultiTFEntryScore: forward symbol to H/D/W",
    find: `    perTF.H = (hTF && hTF.candles && hTF.candles.length >= 50) ? scoreEntryPillarsForTF(hTF.candles, indexCandles, 'H') : null;\n    perTF.D = (dTF && dTF.candles && dTF.candles.length >= 50) ? scoreEntryPillarsForTF(dTF.candles, indexCandles, 'D') : null;\n    perTF.W = (wTF && wTF.candles && wTF.candles.length >= 50) ? scoreEntryPillarsForTF(wTF.candles, indexWeeklyCandles || indexCandles, 'W') : null;`,
    replace: `    perTF.H = (hTF && hTF.candles && hTF.candles.length >= 50) ? scoreEntryPillarsForTF(hTF.candles, indexCandles, 'H', symbol) : null;\n    perTF.D = (dTF && dTF.candles && dTF.candles.length >= 50) ? scoreEntryPillarsForTF(dTF.candles, indexCandles, 'D', symbol) : null;\n    perTF.W = (wTF && wTF.candles && wTF.candles.length >= 50) ? scoreEntryPillarsForTF(wTF.candles, indexWeeklyCandles || indexCandles, 'W', symbol) : null;`,
    alreadyIf: `scoreEntryPillarsForTF(hTF.candles, indexCandles, 'H', symbol)`
  },
  {
    name: "computeMultiTFEntryScore: fix aggRegimeAlignment typo + sector override",
    find: `      var isLeader = (aggRegimeAlignment > 0);\n      if (!isLeader) {\n        finalScore = Math.min(finalScore, 45);\n      }\n    }`,
    replace: `      var isLeader = (agg.regimeAlignment > 0);\n      if (!isLeader && symbol && window.SectorRRG) { try { var _rqM = window.SectorRRG.getSectorQuadrantForSymbol(symbol); if (_rqM && _rqM.quadrant === "Leading") isLeader = true; } catch (_eM) {} }\n      if (!isLeader) {\n        finalScore = Math.min(finalScore, 45);\n      }\n    }`,
    alreadyIf: `_rqM`
  }
]);

/* ── 4. batch-backtest.js ──────────────────────────────────────────── */
patch("batch-backtest.js", [
  {
    name: "scoreFn: MTF gets symbol",
    find: `TI.computeMultiTFEntryScore(tfResults, idxSlice, null);`,
    replace: `TI.computeMultiTFEntryScore(tfResults, idxSlice, null, symbol);`,
    alreadyIf: `TI.computeMultiTFEntryScore(tfResults, idxSlice, null, symbol)`
  },
  {
    name: "scoreFn: single-TF gets symbol",
    find: `TI.computeEntryScore(candles.slice(0, idx + 1), idxSlice && idxSlice.length ? idxSlice : null)`,
    replace: `TI.computeEntryScore(candles.slice(0, idx + 1), idxSlice && idxSlice.length ? idxSlice : null, symbol)`,
    alreadyIf: `TI.computeEntryScore(candles.slice(0, idx + 1), idxSlice && idxSlice.length ? idxSlice : null, symbol)`
  }
]);

/* ── 5. pattern-scoring.js ─────────────────────────────────────────── */
patch("pattern-scoring.js", [{
  name: "compute: forward symbol",
  find: `TI.computeEntryScore(candles, opts.indexCandles)`,
  replace: `TI.computeEntryScore(candles, opts.indexCandles, symbol)`,
  alreadyIf: `TI.computeEntryScore(candles, opts.indexCandles, symbol)`
}]);

/* ── 6. app-core.js ─────────────────────────────────────────────────── */

/* Insert SectorRotationPanel component + patches */
const PANEL = `
const SectorRotationPanel = React.memo(function () {
  var _s = useState(function () { return window.SectorRRG ? window.SectorRRG.getState() : null; });
  var state = _s[0], setState = _s[1];
  var _b = useState(false); var busy = _b[0], setBusy = _b[1];
  var doLoad = useCallback(function (f) {
    setBusy(true);
    window.SectorRRG.load({ force: !!f }).then(setState).catch(function () {}).finally(function () { setBusy(false); });
  }, []);
  useEffect(function () {
    var unsub = window.SectorRRG.onUpdate(setState);
    if (!state) doLoad(false);
    return unsub;
  }, []);
  var secs = state && state.sectors ? state.sectors : [];
  var lead = secs.filter(function (x) { return x.quadrant === "Leading"; });
  var mx = 5;
  secs.forEach(function (x) { x.tail.forEach(function (p) { mx = Math.max(mx, Math.abs(p.rsRatio - 100), Math.abs(p.rsMomentum - 100)); }); });
  mx = Math.ceil(mx * 1.15);
  var W = 460, H = 460, P = 40, PW = W - 2 * P, PH = H - 2 * P;
  var CX = P + PW / 2, CY = P + PH / 2;
  var X = function (v) { return CX + (v - 100) / mx * PW / 2; };
  var Y = function (v) { return CY - (v - 100) / mx * PH / 2; };
  var QUADS = [
    { x: CX, y: P, w: PW / 2, h: PH / 2, f: "rgba(34,197,94,0.08)", t: "LEADING", c: "#16a34a" },
    { x: P, y: P, w: PW / 2, h: PH / 2, f: "rgba(59,130,246,0.07)", t: "IMPROVING", c: "#2563eb" },
    { x: CX, y: CY, w: PW / 2, h: PH / 2, f: "rgba(234,179,8,0.07)", t: "WEAKENING", c: "#ca8a04" },
    { x: P, y: CY, w: PW / 2, h: PH / 2, f: "rgba(239,68,68,0.07)", t: "LAGGING", c: "#dc2626" }
  ];
  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Sector Rotation Graph (RRG)"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 3 } }, "JdK RS-Ratio vs RS-Momentum · 14-day z-score · tail = 5 sessions")
      ),
      React.createElement("button", { onClick: function () { doLoad(true); }, disabled: busy, className: "stx-btn stx-btn-ghost", style: { fontSize: 11, padding: "6px 12px" } }, busy ? "Loading..." : "Refresh")
    ),
    secs.length === 0
      ? React.createElement("div", { style: { padding: 40, textAlign: "center", color: "var(--text5)", fontSize: 13 } }, busy ? "Fetching sector indices..." : "Click Refresh to load RRG")
      : React.createElement("svg", { viewBox: "0 0 " + W + " " + H, style: { width: "100%", maxWidth: 520, height: "auto", display: "block", margin: "0 auto" } },
          QUADS.map(function (q, i) {
            return React.createElement("g", { key: i },
              React.createElement("rect", { x: q.x, y: q.y, width: q.w, height: q.h, fill: q.f }),
              React.createElement("text", { x: q.x + q.w / 2, y: q.y + 18, textAnchor: "middle", fontSize: 9, fontWeight: 800, fill: q.c, letterSpacing: 1, opacity: 0.7 }, q.t));
          }),
          React.createElement("line", { x1: CX, y1: P, x2: CX, y2: P + PH, stroke: "var(--border3)", strokeWidth: 1, strokeDasharray: "3,3" }),
          React.createElement("line", { x1: P, y1: CY, x2: P + PW, y2: CY, stroke: "var(--border3)", strokeWidth: 1, strokeDasharray: "3,3" }),
          React.createElement("text", { x: CX, y: H - 8, textAnchor: "middle", fontSize: 10, fontWeight: 600, fill: "var(--text6)" }, "RS-Ratio"),
          React.createElement("text", { x: 14, y: CY, textAnchor: "middle", fontSize: 10, fontWeight: 600, fill: "var(--text6)", transform: "rotate(-90,14," + CY + ")" }, "RS-Momentum"),
          secs.map(function (sec) {
            var c = sec.current;
            return React.createElement("g", { key: sec.key },
              sec.tail.length > 1 && React.createElement("polyline", { points: sec.tail.map(function (p) { return X(p.rsRatio).toFixed(1) + "," + Y(p.rsMomentum).toFixed(1); }).join(" "), fill: "none", stroke: sec.color, strokeWidth: 1.5, opacity: 0.35, strokeLinejoin: "round" }),
              sec.tail.map(function (p, i) {
                var isHead = i === sec.tail.length - 1;
                return React.createElement("circle", { key: i, cx: X(p.rsRatio), cy: Y(p.rsMomentum), r: isHead ? 5 : 2, fill: sec.color, opacity: isHead ? 1 : 0.45, stroke: isHead ? "var(--bg)" : "none", strokeWidth: isHead ? 1.5 : 0 });
              }),
              React.createElement("text", { x: X(c.rsRatio) + 8, y: Y(c.rsMomentum) + 3, fontSize: 10, fontWeight: 800, fill: "var(--text)", fontFamily: "var(--font-heading)" }, sec.name));
          })
        ),
    lead.length > 0 && React.createElement("div", { style: { marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)", fontSize: 11, color: "var(--text3)", lineHeight: 1.6 } },
      React.createElement("div", { style: { fontWeight: 700, color: "#16a34a", marginBottom: 4 } }, "Leading sectors — where money is flowing"),
      lead.map(function (x) {
        return React.createElement("div", { key: x.key },
          React.createElement("strong", { style: { color: x.color } }, x.name),
          " · RS-Ratio " + x.current.rsRatio.toFixed(1) + " · RS-Mom " + x.current.rsMomentum.toFixed(1) + " · " + x.daysInQuadrant + "d in quadrant");
      }),
      React.createElement("div", { style: { marginTop: 6, color: "var(--text5)" } }, "Stocks in these sectors get the RS gate override — trade even when NIFTY < SMA200.")
    )
  );
});

`;

patch("app-core.js", [
  {
    name: "insert SectorRotationPanel component",
    find: `function PulsePage({ holdings }) {`,
    replace: PANEL + `function PulsePage({ holdings }) {`,
    alreadyIf: `const SectorRotationPanel = React.memo`
  },
  {
    name: "add Sector Rotation tab",
    find: `    { key: "scoretuner", label: "Score Tuner", icon: Icons.settings },\n    { key: "patternlab", label: "Pattern Lab", icon: Icons.flask },`,
    replace: `    { key: "scoretuner", label: "Score Tuner", icon: Icons.settings },\n    { key: "sectorrotation", label: "Sector Rotation", icon: Icons.chart },\n    { key: "patternlab", label: "Pattern Lab", icon: Icons.flask },`,
    alreadyIf: `key: "sectorrotation"`
  },
  {
    name: "render sector rotation content",
    find: `      activeTab === "singlestock" && React.createElement(SingleStockAnalysis, { requestedTicker: pendingTicker }),`,
    replace: `      activeTab === "singlestock" && React.createElement(SingleStockAnalysis, { requestedTicker: pendingTicker }),\n      activeTab === "sectorrotation" && React.createElement(SectorRotationPanel, null),`,
    alreadyIf: `activeTab === "sectorrotation"`
  },
  {
    name: "computeCompatEntryScore: accept symbol",
    find: `function computeCompatEntryScore(weeklyCandles, dailyCandles, hourlyCandles, indexCandles, indexWeeklyCandles) {`,
    replace: `function computeCompatEntryScore(weeklyCandles, dailyCandles, hourlyCandles, indexCandles, indexWeeklyCandles, symbol) {`,
    alreadyIf: `function computeCompatEntryScore(weeklyCandles, dailyCandles, hourlyCandles, indexCandles, indexWeeklyCandles, symbol) {`
  },
  {
    name: "computeCompatEntryScore: forward symbol",
    find: `var multi = TI.computeMultiTFEntryScore(tfResults, indexCandles || null, indexWeeklyCandles || null);`,
    replace: `var multi = TI.computeMultiTFEntryScore(tfResults, indexCandles || null, indexWeeklyCandles || null, symbol);`,
    alreadyIf: `var multi = TI.computeMultiTFEntryScore(tfResults, indexCandles || null, indexWeeklyCandles || null, symbol);`
  },
  /* Forward tk at all callsites — three patterns cover all 8 callers */
  {
    name: "callsite: _idxD/_idxW (3 places)",
    find: `computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, _idxD, _idxW)`,
    replace: `computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, _idxD, _idxW, tk)`,
    alreadyIf: `resH.data && resH.data.length >= 100 ? resH.data : null, _idxD, _idxW, tk)`
  },
  {
    name: "callsite: indexDaily/indexWeekly (4 places)",
    find: `computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, indexDaily, indexWeekly)`,
    replace: `computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, indexDaily, indexWeekly, tk)`,
    alreadyIf: `resH.data && resH.data.length >= 100 ? resH.data : null, indexDaily, indexWeekly, tk)`
  },
  {
    name: "callsite: idxD.data/idxW.data (1 place)",
    find: `computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, idxD && idxD.data, idxW && idxW.data)`,
    replace: `computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, idxD && idxD.data, idxW && idxW.data, tk)`,
    alreadyIf: `resH.data && resH.data.length >= 100 ? resH.data : null, idxD && idxD.data, idxW && idxW.data, tk)`
  }
]);

console.log("\n" + (DRY ? "[DRY RUN] no files written\n" : "Done.\n"));
console.log("Next steps:");
console.log("  1. Reload the app (browser); service worker cache refreshes to v470.");
console.log("  2. Pulse → Sector Rotation tab appears.");
console.log("  3. First load waits ~30s while 11 sectors fetch.");
console.log("  4. RS gate: when NIFTY < SMA200, a stock in a Leading sector");
console.log("     now bypasses the 45-point cap.\n");