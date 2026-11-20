/* ev-ab-test.js v3 — does the best-of-N haircut help or hurt EV ranking, and does the gate make money?
 *
 * v3.2 (engine EV-4.9.3 recipe-aware): rows now carry the exact score recipe
 *   (signalScale = fitted b1, shrinkFactor = effective lam, haircutCoef,
 *   selBiasPct) and v3's recompute/variants ignored them - on fitted rows
 *   'current' was NOT the stored pred (recompute 0/N) and the haircut grid
 *   collapsed when the fitted coefficient was 0. Now:
 *     - lamOf() prefers the row's stored shrinkFactor;
 *     - 'current' = pm + signalScale x lam x (basisEV - pm) - haircutPct
 *       - selBiasPct, i.e. EXACTLY the stored pred (recompute is exact);
 *     - the haircut-treatment grid scales the RAW split-half estimate
 *       (haircutRawPct), so it keeps testing the winner's-curse penalty
 *       even when the fitted coefficient is 0; on pre-4.9.3 rows
 *       (effective = raw, signalScale = 1) every number is unchanged.
 *   A 'score recipe' summary line shows what is active on the row set.
 *
 * v3.1 (engine EV-4.9.3 companion): as-of chain-rule factor fixed. The
 *   stored prior enters the score with weight (1 - lam) x (1 - pooledWeight)
 *   (score = priorMean + lam x (basisEV - priorMean) - haircut), so the
 *   re-anchor shift is (1 - lam) x (1 - pooledWeight) x anchorWeight x
 *   (asOfMean - anchorPct). v3 omitted the (1 - lam) factor and over-shifted
 *   the LEVELS by ~1/lam; rank metrics (dIC) were barely affected because the
 *   shift is near-constant within a date. Engine EV-4.9.3 builds rows AS-OF
 *   already, so on new rows this variant should show ~0 shift and exists only
 *   as a leak detector.
 *
 * v3 (engine EV-4.9.2 support; the 7 v1/v2 variants and all v2 metrics are unchanged):
 *   1. ALL 4.9.2 ROW FIELDS ARE CARRIED (v2's row whitelist silently dropped them):
 *      basis, ver, realRaw, haircutRawPct, winnerGapPct, anchorPct/anchorWeight/
 *      pooledWeight, pEv, pRet, evidence, setupQ, code, regTrend, regVol.
 *   2. BASIS FILTER: rows are tagged with the calibration signature they were
 *      built under. --basis auto (default) keeps the most common basis and
 *      reports what it dropped; --basis all keeps everything; --basis <sig>
 *      selects one. Rows built before 4.9.2 carry no tag (kept only if NO row
 *      is tagged).
 *   3. MONEY COLUMNS: realRaw is raw P&L (drift NOT removed). v2 judged
 *      "absolute" results on the detrended `real`. Every realized metric now
 *      has a money twin ('meanMoney', '$ top% elig', '$ t'); gate verdicts use money.
 *   4. GATE BUCKETS: re-applies the LIVE gates (minNetEV, P(positive return),
 *      EV confidence, evidence) to every stored row and reports n / weeks /
 *      money / detrended / verdict per bucket. Gate values are options
 *      (--gate-net 0.5 --gate-p 0.6 --gate-ev 0.8 --gate-evid 60), not read
 *      from the engine - match them to your Tune panel.
 *   5. REGIME TEST: weekly Buy-grade pool money return vs the index regime at
 *      entry (walk-forward, expanding, out-of-sample R2 and allowed-vs-blocked
 *      t), also on every 4th week (non-overlapping horizons); plus the engine's
 *      own score / gate pass-rate as a no-trade filter.
 *   6. AS-OF ANCHOR (8th variant, appended so indices 0-6 are unchanged): the
 *      prior anchor is the realized mean of Buy-grade rows. The engine's
 *      newest-to-oldest backfill lets it include FUTURE outcomes. This variant
 *      re-anchors every row with only strictly earlier weeks (needs >= 100
 *      earlier Buy-grade rows) and prints how big the shift is.
 *
 * v2 (P1/P2 harness upgrade; same 7 variants as v1 so results stay comparable):
 *   1. HORIZON-STRATIFIED IC (P1): v1 pooled horizons (3-20d) and targets
 *      (2-6%) in one cross-section - realized dispersion scales with horizon
 *      and the score with the target, so pooled Spearman can pick up spurious
 *      structure. 'IC hz' = Spearman inside (week x horizon) cells with at
 *      least --min-cell rows, averaged per week, then overall.
 *   2. GATED-PICK ECONOMICS (P1): 'top% elig' = absolute mean realized of the
 *      top 20% by score among BUY-GRADE rows (the rows that actually trade),
 *      per date, averaged per week. This is the "does the pool make money at
 *      the top" number - the top-minus-bottom spread can look fine inside a
 *      pool that loses money everywhere.
 *   3. WEEK-BLOCK BOOTSTRAP CIs (P2): every dIC gets a 95% CI from resampling
 *      WEEKS with replacement (--bootstrap, default 2000, seeded), so the
 *      point estimates stop being read as more precise than they are.
 *   4. BENJAMINI-HOCHBERG FDR (P2): 6 dIC tests x 2 populations x more
 *      metrics is a multiple-comparisons minefield; dIC verdicts are flagged
 *      at q = 0.10 ('FDR' column: ** = survives, * = marginal, - = not).
 *   5. PRE-REGISTERED HOLDOUT (P2): --holdout 0.5 splits WEEKS in half; the
 *      best variant is selected on the first half only and the second half is
 *      scored ONCE. Picking max-IC on the full sample is itself best-of-N
 *      selection - the exact bias the haircut corrects.
 *   6. SYMBOL-AWARE ROWS (P2): rows written by engine v4.9+ carry a hashed
 *      symbol (sym) and planCount; the de-duplicate key includes the symbol
 *      and per-symbol row multiplicity is reported. v1 rows still work.
 *
 * Re-scores every stored walk-forward row under several haircut treatments
 * (using only the ingredients the engine already stores) and compares how
 * well each version ranks realized outcomes.
 *
 * RUN IN THE BROWSER (the page that hosts the engine; reads IndexedDB):
 *     paste this whole file into the DevTools console.
 *     Optional first:  window.EV_AB_OPTS = { tauBase: 0.3, holdout: 0.5 };
 *
 * RUN IN NODE (rows exported from the browser, see EXPORT below):
 *     node ev-ab-test.js rows.json [--tau 0.3] [--min-per-date 8]
 *                                [--bootstrap 2000] [--holdout 0.5] [--seed 42]
 *
 * EXPORT rows from the browser console:
 *     (async()=>{const q=indexedDB.open('stox_ev_rows');q.onsuccess=()=>{
 *       const g=q.result.transaction('rows').objectStore('rows').getAll();
 *       g.onsuccess=()=>{const a=document.createElement('a');
 *         a.href=URL.createObjectURL(new Blob([JSON.stringify(g.result)]));
 *         a.download='rows.json';a.click();};};})();
 *
 * Row fields used (written by calibrateFromHistory): date, basisEV,
 * stdErrPct, haircutPct, priorMeanPct, horizonDays, real, elig, pred, and
 * (engine v4.9+) sym (hashed symbol), planCount, winnerGapPct.
 * Rows without a symbol hash fall back to the v1 de-dup key.
 *
 * Metrics (all week-clustered, because adjacent days overlap):
 *   IC       mean per-date Spearman between score and realized, averaged by week
 *   IC hz    mean per-(week x horizon) cell Spearman (stratified; P1)
 *   Spread   mean per-date (top 20% minus bottom 20%) realized, averaged by week
 *   top%el   mean realized of the top 20% BUY-GRADE picks (absolute; P1)
 *   Slope    pooled OLS slope of realized on score, week-clustered SE (ideal ~1)
 *   dIC      paired weekly IC difference vs the "current" variant
 *   dIC CI   95% week-block bootstrap CI on dIC (P2)
 *   FDR      Benjamini-Hochberg flag at q = 0.10 across the 6 dIC tests (P2)
 */
(async function () {
  'use strict';

  var IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined';

  /* ---------- options ---------- */
  var opts = {
    tauBase: 0.3, defaultHorizon: 10, minPerDate: 8, spreadMin: 10, minWeeks: 8,
    bootstrap: 2000, holdout: 0, seed: 20261120, minCell: 8, fdrQ: 0.10, file: null,
    basis: 'auto', asof: true, asofPop: 'elig', regimeMinPrior: 8, regimeMinState: 4,
    gates: { minNetEV: 0.5, minP: 0.6, minEv: 0.8, minEvid: 60 }
  };
  var hasMoney = false;   /* set once rows are loaded: do they carry realRaw? */
  if (!IS_NODE && typeof window !== 'undefined' && window.EV_AB_OPTS) Object.assign(opts, window.EV_AB_OPTS);
  if (IS_NODE) {
    var av = process.argv.slice(2);
    for (var i = 0; i < av.length; i++) {
      if (av[i] === '--tau') opts.tauBase = Number(av[++i]);
      else if (av[i] === '--min-per-date') opts.minPerDate = Number(av[++i]);
      else if (av[i] === '--bootstrap') opts.bootstrap = Number(av[++i]);
      else if (av[i] === '--holdout') opts.holdout = Number(av[++i]);
      else if (av[i] === '--seed') opts.seed = Number(av[++i]);
      else if (av[i] === '--min-cell') opts.minCell = Number(av[++i]);
      else if (av[i] === '--basis') opts.basis = String(av[++i]);
      else if (av[i] === '--gate-net') opts.gates.minNetEV = Number(av[++i]);
      else if (av[i] === '--gate-p') opts.gates.minP = Number(av[++i]);
      else if (av[i] === '--gate-ev') opts.gates.minEv = Number(av[++i]);
      else if (av[i] === '--gate-evid') opts.gates.minEvid = Number(av[++i]);
      else if (av[i] === '--asof-pop') opts.asofPop = String(av[++i]);
      else if (av[i] === '--no-asof') opts.asof = false;
      else if (av[i] === '--regime-min-prior') opts.regimeMinPrior = Number(av[++i]);
      else if (!av[i].startsWith('--')) opts.file = av[i];
    }
    if (!opts.file) {
      console.error('usage: node ev-ab-test.js rows.json [--tau 0.3] [--min-per-date 8] [--bootstrap 2000] [--holdout 0.5] [--seed 42] [--min-cell 8]');
      console.error('         [--basis auto|all|<sig>] [--gate-net 0.5] [--gate-p 0.6] [--gate-ev 0.8] [--gate-evid 60] [--asof-pop elig|all] [--no-asof] [--regime-min-prior 8]');
      process.exit(1);
    }
  }

  opts.gates = Object.assign({ minNetEV: 0.5, minP: 0.6, minEv: 0.8, minEvid: 60 }, opts.gates || {});

  /* ---------- stats helpers ---------- */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; }
  function sd(a) {
    if (a.length < 2) return NaN;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }
  function tStat(a) { var s = sd(a); return a.length >= 2 && s > 0 ? mean(a) / (s / Math.sqrt(a.length)) : NaN; }
  function avgRanks(a) {
    var idx = a.map(function (v, i) { return i; }).sort(function (p, q) { return a[p] - a[q]; });
    var r = new Array(a.length), i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++;
      var rk = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) r[idx[k]] = rk;
      i = j + 1;
    }
    return r;
  }
  function pearson(x, y) {
    var n = x.length; if (n < 3) return NaN;
    var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  function spearman(x, y) { return pearson(avgRanks(x), avgRanks(y)); }
  /* normal CDF (for the FDR p-values; week counts are large enough) */
  function Phi(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989423 * Math.exp(-x * x / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  /* seeded PRNG so bootstrap results are reproducible run-to-run */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* week-block bootstrap CI of the mean of `vals` (resample the values - which
     are already week-level - with replacement, B times, percentile method) */
  function bootCI(vals, B, rng) {
    if (!vals || vals.length < 4) return null;
    var n = vals.length, out = [];
    for (var b = 0; b < B; b++) {
      var s = 0;
      for (var i = 0; i < n; i++) s += vals[Math.floor(rng() * n) % n];
      out.push(s / n);
    }
    out.sort(function (a, b2) { return a - b2; });
    return { lo: out[Math.floor(B * 0.025)], hi: out[Math.min(B - 1, Math.floor(B * 0.975))] };
  }

  /* Benjamini-Hochberg at level q; returns boolean[] (true = survives FDR) */
  function bhFDR(pvals, q) {
    var n = pvals.length;
    var idx = pvals.map(function (p, i) { return { p: isNum(p) ? p : 1, i: i }; })
      .filter(function (x) { return x.p < 1; })
      .sort(function (a, b) { return a.p - b.p; });
    var rej = new Array(n).fill(false);
    var maxK = -1;
    for (var k = 0; k < idx.length; k++) {
      if (idx[k].p <= (k + 1) / Math.max(1, idx.length) * q) maxK = k;
    }
    for (var k2 = 0; k2 <= maxK; k2++) rej[idx[k2].i] = true;
    return rej;
  }

  function weekKey(d) {
    var t = new Date(String(d).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(t)) return null;
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return t.toISOString().slice(0, 10);
  }
  function dateStr(d) {
    if (typeof d === 'number') return new Date(d).toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  }

  /* pooled OLS slope of y on x with week-clustered (CR0) standard error */
  function clusteredSlope(x, y, weeks) {
    var n = x.length; if (n < 30) return { slope: NaN, se: NaN };
    var mx = mean(x), my = mean(y), sxx = 0, sxy = 0, i;
    for (i = 0; i < n; i++) { sxx += (x[i] - mx) * (x[i] - mx); sxy += (x[i] - mx) * (y[i] - my); }
    if (!(sxx > 0)) return { slope: NaN, se: NaN };
    var b = sxy / sxx, a = my - b * mx, byC = {};
    for (i = 0; i < n; i++) {
      var e = y[i] - a - b * x[i];
      byC[weeks[i]] = (byC[weeks[i]] || 0) + (x[i] - mx) * e;
    }
    var meat = 0, G = 0;
    Object.keys(byC).forEach(function (k) { meat += byC[k] * byC[k]; G++; });
    var se = G > 1 ? Math.sqrt(meat * (G / (G - 1))) / sxx : NaN;
    return { slope: b, se: se };
  }

  /* ---------- load rows ---------- */
  async function loadRows() {
    if (IS_NODE) {
      try {
        return JSON.parse(require('fs').readFileSync(opts.file, 'utf8'));
      } catch (e) {
        if (e && e.code === 'ENOENT') {
          console.error('rows.json not found at: ' + require('path').resolve(opts.file));
          console.error('');
          console.error('rows.json is YOUR walk-forward data - it is not shipped with the script.');
          console.error('Export it from the browser page that hosts the EV engine:');
          console.error('  1. open DevTools -> Console and run:');
          console.error("     (async()=>{const q=indexedDB.open('stox_ev_rows');q.onsuccess=()=>{");
          console.error("       const g=q.result.transaction('rows').objectStore('rows').getAll();");
          console.error("       g.onsuccess=()=>{const a=document.createElement('a');");
          console.error("         a.href=URL.createObjectURL(new Blob([JSON.stringify(g.result)]));");
          console.error("         a.download='rows.json';a.click();};};})();");
          console.error('  2. put the downloaded rows.json next to ev-ab-test.js');
          console.error('  3. run: node ev-ab-test.js rows.json --holdout 0.5');
          console.error('(If the export comes back empty, run stoxRunEvCalibration() first and let episodes settle.)');
          process.exit(1);
        }
        throw e;
      }
    }
    var rows = [];
    try {
      var exists = true;
      if (indexedDB.databases) {
        var dbs = await indexedDB.databases();
        exists = dbs.some(function (d) { return d.name === 'stox_ev_rows'; });
      }
      /* Never open a DB that does not exist: opening it creates an empty v1
         database and the engine's onupgradeneeded would then never fire. */
      if (exists) {
        rows = await new Promise(function (res, rej) {
          var q = indexedDB.open('stox_ev_rows');
          q.onerror = function () { rej(q.error); };
          q.onsuccess = function () {
            var db = q.result;
            if (!db.objectStoreNames.contains('rows')) { db.close(); return res([]); }
            var g = db.transaction('rows', 'readonly').objectStore('rows').getAll();
            g.onsuccess = function () { db.close(); res(g.result || []); };
            g.onerror = function () { db.close(); rej(g.error); };
          };
        });
      }
    } catch (e) { console.warn('IndexedDB read failed:', e); }
    if (!rows.length && window.ExpectedValueEngine && window.ExpectedValueEngine.rowStoreRows) {
      rows = window.ExpectedValueEngine.rowStoreRows();
      if (rows.length) console.warn('Using the in-memory ring (capped at 2000 rows).');
    }
    return rows;
  }

  /* ---------- score variants (all use stored ingredients) ---------- */
  /* v3.2: prefer the row's stored recipe (EV-4.9.3+) so 'current' is the
     stored pred; fall back to the tauBase reconstruction for older rows. */
  function lamOf(r) {
    if (isNum(r.shrinkFactor)) return r.shrinkFactor;
    var tau = Math.max(0.05, opts.tauBase * Math.sqrt(Math.max(1, r.horizonDays) / opts.defaultHorizon));
    var s = Math.max(0.02, r.stdErrPct);
    return tau * tau / (tau * tau + s * s);
  }
  function pm(r) { return isNum(r.priorMeanPct) ? r.priorMeanPct : 0; }
  function hc(r) { return isNum(r.haircutPct) ? r.haircutPct : 0; }              /* EFFECTIVE penalty */
  function hcRaw(r) { return isNum(r.haircutRawPct) ? r.haircutRawPct : hc(r); } /* raw split-half estimate */
  function sigOf(r) { var b1 = isNum(r.signalScale) ? r.signalScale : 1; return b1 * lamOf(r) * (r.basisEV - pm(r)); }
  function selOf(r) { return isNum(r.selBiasPct) ? r.selBiasPct : 0; }
  function shrunk(r, k) { return pm(r) + sigOf(r) - k * hc(r) - selOf(r); }   /* k=1 => stored pred */

  var VARIANTS = [
    { name: 'current (shrink, then -haircut)', f: function (r) { return shrunk(r, 1); } },
    { name: 'haircut x0.5',                    f: function (r) { return pm(r) + sigOf(r) - 0.5 * hcRaw(r) - selOf(r); } },
    { name: 'haircut x0.25',                   f: function (r) { return pm(r) + sigOf(r) - 0.25 * hcRaw(r) - selOf(r); } },
    { name: 'no haircut (shrunk signal)',      f: function (r) { return pm(r) + sigOf(r) - selOf(r); } },
    { name: 'haircut BEFORE shrink (pre-4.5)', f: function (r) { return pm(r) + lamOf(r) * (r.basisEV - hcRaw(r) - pm(r)) - selOf(r); } },
    { name: 'unshrunk basis EV',               f: function (r) { return r.basisEV; } },
    { name: 'haircut only (prior - haircut)',  f: function (r) { return pm(r) - hcRaw(r); } }
  ];

  /* ---------- evaluation ---------- */
  function evaluate(rows) {
    var byDate = {};
    rows.forEach(function (r) { (byDate[r.date] = byDate[r.date] || []).push(r); });
    var dates = Object.keys(byDate).sort();

    var out = VARIANTS.map(function (v) {
      var scores = rows.map(v.f);
      var weeklyIC = {}, weeklySpread = {}, weeklyTopElig = {}, weeklyTopEligM = {};
      var hzCells = {}; /* (week|horizon) -> {s:[], y:[]} for stratified IC */
      dates.forEach(function (d) {
        var g = byDate[d];
        if (g.length < opts.minPerDate) return;
        var s = g.map(v.f), y = g.map(function (r) { return r.real; }), ym = g.map(moneyOf);
        var wk = weekKey(d); if (!wk) return;
        var ic = spearman(s, y);
        if (isNum(ic)) (weeklyIC[wk] = weeklyIC[wk] || []).push(ic);
        if (g.length >= opts.spreadMin) {
          var order = g.map(function (r, i) { return i; }).sort(function (p, q) { return s[q] - s[p]; });
          var k = Math.max(1, Math.floor(g.length * 0.2));
          var top = mean(order.slice(0, k).map(function (i) { return y[i]; }));
          var bot = mean(order.slice(-k).map(function (i) { return y[i]; }));
          (weeklySpread[wk] = weeklySpread[wk] || []).push(top - bot);
        }
        /* P1: absolute top-20% mean among BUY-GRADE rows (the tradeable pool) */
        var eligIdx = [];
        for (var q = 0; q < g.length; q++) if (g[q].elig) eligIdx.push(q);
        if (eligIdx.length >= opts.minPerDate) {
          eligIdx.sort(function (p, q2) { return s[q2] - s[p]; });
          var ke = Math.max(1, Math.floor(eligIdx.length * 0.2));
          (weeklyTopElig[wk] = weeklyTopElig[wk] || []).push(mean(eligIdx.slice(0, ke).map(function (i) { return y[i]; })));
          (weeklyTopEligM[wk] = weeklyTopEligM[wk] || []).push(mean(eligIdx.slice(0, ke).map(function (i) { return ym[i]; })));
        }
        /* P1: stratified cells (week x horizon) */
        for (var z = 0; z < g.length; z++) {
          var ck = wk + '|' + g[z].horizonDays;
          (hzCells[ck] = hzCells[ck] || { s: [], y: [] });
          hzCells[ck].s.push(s[z]); hzCells[ck].y.push(y[z]);
        }
      });
      var icW = {}, spW = {}, teW = {}, teMW = {}, hzW = {};
      Object.keys(weeklyIC).forEach(function (w) { icW[w] = mean(weeklyIC[w]); });
      Object.keys(weeklySpread).forEach(function (w) { spW[w] = mean(weeklySpread[w]); });
      Object.keys(weeklyTopElig).forEach(function (w) { teW[w] = mean(weeklyTopElig[w]); });
      Object.keys(weeklyTopEligM).forEach(function (w) { teMW[w] = mean(weeklyTopEligM[w]); });
      var hzByWeek = {};
      Object.keys(hzCells).forEach(function (ck) {
        var cell = hzCells[ck];
        if (cell.s.length < opts.minCell) return;
        var ic = spearman(cell.s, cell.y);
        if (!isNum(ic)) return;
        var w = ck.split('|')[0];
        (hzByWeek[w] = hzByWeek[w] || []).push(ic);
      });
      Object.keys(hzByWeek).forEach(function (w) { hzW[w] = mean(hzByWeek[w]); });
      var icVec = Object.keys(icW).map(function (w) { return icW[w]; });
      var spVec = Object.keys(spW).map(function (w) { return spW[w]; });
      var teVec = Object.keys(teW).map(function (w) { return teW[w]; });
      var teMVec = Object.keys(teMW).map(function (w) { return teMW[w]; });
      var hzVec = Object.keys(hzW).map(function (w) { return hzW[w]; });
      var cs = clusteredSlope(scores, rows.map(function (r) { return r.real; }), rows.map(function (r) { return r.week; }));
      return {
        name: v.name, scores: scores, icW: icW,
        nWeeks: icVec.length,
        IC: mean(icVec), ICt: tStat(icVec),
        IChz: mean(hzVec), IChzT: tStat(hzVec), nHzWeeks: hzVec.length,
        spread: mean(spVec), spreadT: tStat(spVec),
        topElig: mean(teVec), topEligT: tStat(teVec), nTopWeeks: teVec.length,
        topEligM: mean(teMVec), topEligMT: tStat(teMVec),
        slope: cs.slope, slopeSe: cs.se,
        meanScore: mean(scores), meanReal: mean(rows.map(function (r) { return r.real; })), meanMoney: mean(rows.map(moneyOf)),
        pooledRho: spearman(scores, rows.map(function (r) { return r.real; }))
      };
    });

    var base = out[0];
    out.forEach(function (o) {
      var diffs = [];
      Object.keys(o.icW).forEach(function (w) { if (w in base.icW) diffs.push(o.icW[w] - base.icW[w]); });
      o.dIC = mean(diffs); o.dICt = tStat(diffs); o.dICdiffs = diffs;
    });
    return out;
  }

  function fmt(v, d) { return isNum(v) ? v.toFixed(d == null ? 3 : d) : '  n/a'; }

  function report(label, rows) {
    console.log('\n==== ' + label + ' (n=' + rows.length + ' rows) ====');
    if (rows.length < 200) { console.log('Too few rows for a meaningful comparison (need ~200+).'); return null; }
    var rng = mulberry32(opts.seed);
    var res = evaluate(rows);
    console.log('weeks with usable IC: ' + res[0].nWeeks + (res[0].nWeeks < opts.minWeeks ? '  (LOW: treat t-stats as indicative only)' : ''));

    /* P2: FDR across the 6 dIC tests (variant 0 is the base, excluded) */
    var pvals = res.map(function (o, i) {
      if (i === 0) return 1;
      return isNum(o.dICt) ? 2 * (1 - Phi(Math.abs(o.dICt))) : 1;
    });
    var rej = bhFDR(pvals, opts.fdrQ);
    var rng2 = mulberry32(opts.seed);

    var table = res.map(function (o, i) {
      var ci = i > 0 ? bootCI(o.dICdiffs, opts.bootstrap, rng2) : null;
      return {
        variant: o.name,
        meanScore: fmt(o.meanScore, 2), meanReal: fmt(o.meanReal, 2), meanMoney: fmt(o.meanMoney, 2),
        IC: fmt(o.IC), 'IC t': fmt(o.ICt, 2),
        'IC hz': fmt(o.IChz), 'hz t': fmt(o.IChzT, 2),
        'top-bot spread': fmt(o.spread, 2), 'spread t': fmt(o.spreadT, 2),
        'top% elig': fmt(o.topElig, 2), 'top% t': fmt(o.topEligT, 2),
        '$ top% elig': fmt(o.topEligM, 2), '$ t': fmt(o.topEligMT, 2),
        slope: fmt(o.slope, 2) + ' ± ' + fmt(o.slopeSe, 2),
        'dIC vs current': fmt(o.dIC), 'dIC t': fmt(o.dICt, 2),
        'dIC 95% CI': ci ? ('[' + fmt(ci.lo) + ', ' + fmt(ci.hi) + ']') : '—',
        FDR: i > 0 ? (rej[i] ? '**' : (isNum(pvals[i]) && pvals[i] < 0.10 ? '*' : '-')) : ''
      };
    });
    console.table ? console.table(table) : console.log(table);

    /* what drives the current score? */
    var cur = res[0].scores;
    var negH = rows.map(function (r) { return -hc(r); });
    var sig = rows.map(function (r) { return sigOf(r); });
    var zeroH = rows.filter(function (r) { return hc(r) === 0; }).length / rows.length;
    var zeroRaw = rows.filter(function (r) { return hcRaw(r) === 0; }).length / rows.length;
    console.log('Drivers of the current score (pooled): corr with -haircut = ' + fmt(pearson(cur, negH), 2) +
      ', corr with shrunk signal = ' + fmt(pearson(cur, sig), 2) +
      '; sd(-haircut) = ' + fmt(sd(negH), 3) + ' vs sd(signal) = ' + fmt(sd(sig), 3) +
      '; rows with haircut = 0: ' + fmt(zeroH * 100, 0) + '% effective / ' + fmt(zeroRaw * 100, 0) + '% raw');

    /* plain-language read-out */
    var noH = res[3], half = res[1], hOnly = res[6];
    var lines = [];
    if (noH.dIC > 0 && noH.dICt > 2 && rej[3]) lines.push('Removing the haircut RAISES ranking skill significantly (dIC t=' + fmt(noH.dICt, 2) + ', FDR **): the haircut is adding noise.');
    else if (noH.dIC < 0 && noH.dICt < -2 && rej[3]) lines.push('Removing the haircut LOWERS ranking skill significantly (dIC t=' + fmt(noH.dICt, 2) + ', FDR **): the haircut is carrying real information.');
    else if (noH.dIC < 0 && noH.dICt < -2) lines.push('Removing the haircut lowers ranking skill (dIC t=' + fmt(noH.dICt, 2) + ') but it does NOT survive FDR across the variant grid - suggestive, not conclusive.');
    else lines.push('Haircut vs no-haircut is not distinguishable on ranking (dIC t=' + fmt(noH.dICt, 2) + '). Not enough evidence to change it on ranking grounds alone.');
    if (isNum(hOnly.ICt) && Math.abs(hOnly.ICt) < 2 && isNum(res[0].ICt) && Math.abs(res[0].ICt) < 2) lines.push('Neither the current score nor the haircut alone shows significant ranking skill; the engine is not ranking trades here.');
    if (isNum(res[0].slope) && isNum(res[0].slopeSe) && res[0].slope + 2 * res[0].slopeSe < 1) lines.push('Current slope ' + fmt(res[0].slope, 2) + ' ± ' + fmt(res[0].slopeSe, 2) + ' is clearly below 1: predictions are over-dispersed relative to outcomes.');
    if (isNum(res[0].meanScore) && isNum(res[0].meanReal) && Math.abs(res[0].meanScore - res[0].meanReal) < 0.15) lines.push('Mean score and mean realized are within 0.15 points, so "calibrated on average" is true but says nothing about ranking.');
    /* P1: gated-pick economics */
    if (isNum(res[0].topElig)) {
      if (res[0].topElig > 0 && res[0].topEligT > 2) lines.push('Top Buy-grade picks make money in detrended terms (' + fmt(res[0].topElig, 2) + '% per plan, t=' + fmt(res[0].topEligT, 2) + '): the tradeable top of the pool clears costs.');
      else if (res[0].topElig < 0 && res[0].topEligT < -2) lines.push('Top Buy-grade picks LOSE money in detrended terms (' + fmt(res[0].topElig, 2) + '% per plan, t=' + fmt(res[0].topEligT, 2) + '): this is a GATING problem, not a ranking one - raise minNetEV / minPositiveProbability before trusting any pick.');
      else lines.push('Top Buy-grade picks (' + fmt(res[0].topElig, 2) + '%, t=' + fmt(res[0].topEligT, 2) + ') are not distinguishable from zero: no evidence the tradeable top clears costs yet.');
    }
    if (isNum(res[0].topEligM)) {
      var mm = res[0].topEligM, mt = res[0].topEligMT;
      lines.push('MONEY basis (raw P&L, drift NOT removed): top Buy-grade picks ' + fmt(mm, 2) + '% per plan (t=' + fmt(mt, 2) + ')' +
        (mt < -2 ? ' - loses real money.' : mt > 2 ? ' - makes real money.' : ' - not distinguishable from zero.') +
        (hasMoney ? '' : '  [rows carry no realRaw: money = detrended]'));
    }
    lines.forEach(function (l) { console.log(' - ' + l); });
    return res;
  }

  /* P2: pre-registered holdout - select on the first half of the weeks, score
     the second half exactly once. Variants are frozen (same 7 as v1). */
  function holdoutReport(rows) {
    var weeks = {};
    rows.forEach(function (r) { weeks[r.week] = true; });
    var allWeeks = Object.keys(weeks).sort();
    var cut = Math.floor(allWeeks.length * opts.holdout);
    if (cut < 8 || allWeeks.length - cut < 8) {
      console.log('\n==== HOLDOUT: skipped (need >= 8 weeks on each side, have ' + cut + ' / ' + (allWeeks.length - cut) + ') ====');
      return null;
    }
    var fitSet = {}, testSet = {};
    allWeeks.slice(0, cut).forEach(function (w) { fitSet[w] = true; });
    allWeeks.slice(cut).forEach(function (w) { testSet[w] = true; });
    var fitRows = rows.filter(function (r) { return fitSet[r.week]; });
    var testRows = rows.filter(function (r) { return testSet[r.week]; });
    console.log('\n==== HOLDOUT (pre-registered): select on ' + cut + ' weeks (' + fitRows.length + ' rows), score ONCE on ' + (allWeeks.length - cut) + ' weeks (' + testRows.length + ' rows) ====');
    var fitRes = evaluate(fitRows);
    var winner = 0, bestIC = -Infinity;
    fitRes.forEach(function (o, i) { if (isNum(o.IC) && o.IC > bestIC) { bestIC = o.IC; winner = i; } });
    console.log('Selection period: best variant = "' + VARIANTS[winner].name + '" (fit IC ' + fmt(fitRes[winner].IC) + '). This is the ONLY selection step; the table below is the untouched test period.');
    var rng = mulberry32(opts.seed + 1);
    var testRes = evaluate(testRows);
    var pvals = testRes.map(function (o, i) { return i === 0 ? 1 : (isNum(o.dICt) ? 2 * (1 - Phi(Math.abs(o.dICt))) : 1); });
    var rej = bhFDR(pvals, opts.fdrQ);
    var table = testRes.map(function (o, i) {
      var ci = i > 0 ? bootCI(o.dICdiffs, opts.bootstrap, rng) : null;
      return {
        variant: o.name + (i === winner ? '  <= selected' : ''),
        IC: fmt(o.IC), 'IC t': fmt(o.ICt, 2),
        'IC hz': fmt(o.IChz),
        'top% elig': fmt(o.topElig, 2), '$ top% elig': fmt(o.topEligM, 2),
        'dIC vs current': fmt(o.dIC), 'dIC t': fmt(o.dICt, 2),
        'dIC 95% CI': ci ? ('[' + fmt(ci.lo) + ', ' + fmt(ci.hi) + ']') : '—',
        FDR: i > 0 ? (rej[i] ? '**' : (isNum(pvals[i]) && pvals[i] < 0.10 ? '*' : '-')) : ''
      };
    });
    console.table ? console.table(table) : console.log(table);
    var w = testRes[winner], base = testRes[0];
    var verdict;
    if (winner === 0) verdict = 'The selection period chose the CURRENT variant - no change warranted.';
    else if (isNum(w.dIC) && w.dIC > 0 && isNum(w.dICt) && w.dICt > 2 && rej[winner]) verdict = 'SELECTED VARIANT GENERALIZES (holdout dIC ' + fmt(w.dIC) + ', t=' + fmt(w.dICt, 2) + ', FDR **) - safe to adopt.';
    else if (isNum(w.dIC) && w.dIC > 0) verdict = 'Selected variant is ahead on holdout (dIC ' + fmt(w.dIC) + ', t=' + fmt(w.dICt, 2) + ') but NOT conclusively - keep current, gather more weeks.';
    else verdict = 'SELECTED VARIANT DOES NOT GENERALIZE (holdout dIC ' + fmt(w.dIC) + ') - it was fit-period luck; keep the current variant.';
    console.log(' - ' + verdict);
    return { fitWeeks: cut, testWeeks: allWeeks.length - cut, winner: VARIANTS[winner].name, winnerHoldoutIC: w.IC, winnerHoldoutDIC: w.dIC, verdict: verdict };
  }


  /* ---------- v3: helpers ---------- */
  function moneyOf(r) { return isNum(r.money) ? r.money : r.real; }
  function liveGate(r) {
    var G = opts.gates;
    return isNum(r.pEv) && isNum(r.pRet) && isNum(r.evidence) &&
      r.pred >= G.minNetEV && r.pRet >= G.minP && r.pEv >= G.minEv && r.evidence >= G.minEvid;
  }
  /* mean with week-clustered (CR0) standard error */
  function clusterMean(xs, wks) {
    var n = xs.length;
    if (n < 2) return { n: n, m: NaN, se: NaN, t: NaN, weeks: 0 };
    var m = mean(xs), by = {}, i;
    for (i = 0; i < n; i++) by[wks[i]] = (by[wks[i]] || 0) + (xs[i] - m);
    var keys = Object.keys(by), G = keys.length, meat = 0;
    keys.forEach(function (k) { meat += by[k] * by[k]; });
    var se = G > 1 ? Math.sqrt(meat * G / (G - 1)) / n : NaN;
    return { n: n, m: m, se: se, t: se > 0 ? m / se : NaN, weeks: G };
  }
  function welchT(a, b) {
    if (a.length < 3 || b.length < 3) return NaN;
    var va = sd(a) * sd(a) / a.length, vb = sd(b) * sd(b) / b.length;
    return va + vb > 0 ? (mean(a) - mean(b)) / Math.sqrt(va + vb) : NaN;
  }
  function moneyVerdict(c) {
    if (c.n < 30 || c.weeks < 8) return 'TOO FEW';
    if (c.m + 2 * c.se < 0) return 'LOSES';
    if (c.m - 2 * c.se > 0) return 'WINS';
    return 'unproven';
  }

  /* ---------- v3: as-of anchor (removes the backfill look-ahead) ---------- */
  function applyAsOf(rows) {
    var inPop = opts.asofPop === 'all' ? function () { return true; } : function (r) { return r.elig; };
    var byW = {}, weeks = {};
    rows.forEach(function (r) {
      weeks[r.week] = true;
      if (inPop(r)) { var b = byW[r.week] = byW[r.week] || { n: 0, s: 0 }; b.n++; b.s += r.real; }
    });
    var asOf = {}, n = 0, s = 0;
    Object.keys(weeks).sort().forEach(function (w) {
      asOf[w] = n >= 100 ? s / n : null;               /* strictly EARLIER weeks only */
      if (byW[w]) { n += byW[w].n; s += byW[w].s; }
    });
    var shifts = [], adjusted = 0, anchored = 0;
    rows.forEach(function (r) {
      var base = shrunk(r, 1), a = asOf[r.week];
      r.predAsOf = base;
      if (isNum(r.anchorWeight) && r.anchorWeight > 0 && isNum(r.anchorPct)) {
        anchored++;
        if (a != null) {
          /* v3.1: d(score)/d(prior) = (1 - lam) x (1 - pooledWeight); v3
             dropped (1 - lam) and over-shifted the levels.
             v3.2: with a fitted signal scale the factor is (1 - b1 x lam). */
          r.predAsOf = base + (1 - (isNum(r.signalScale) ? r.signalScale : 1) * lamOf(r)) *
            (1 - (isNum(r.pooledWeight) ? r.pooledWeight : 0)) * r.anchorWeight * (a - r.anchorPct);
          shifts.push(r.predAsOf - base); adjusted++;
        }
      }
    });
    if (!anchored) { console.log('As-of anchor: no row carries an anchor (anchorWeight > 0); variant not added.'); return null; }
    var abs = shifts.map(Math.abs);
    var st = { anchored: anchored, adjusted: adjusted, meanShift: mean(shifts), meanAbsShift: mean(abs),
               maxAbsShift: abs.length ? Math.max.apply(null, abs) : NaN };
    console.log('As-of anchor (' + opts.asofPop + ' pop): ' + adjusted + '/' + anchored + ' anchored rows re-anchored on earlier weeks only; mean shift ' +
      fmt(st.meanShift) + ', mean |shift| ' + fmt(st.meanAbsShift) + ', max |shift| ' + fmt(st.maxAbsShift) +
      (st.meanAbsShift < 0.05 ? '  -> look-ahead is immaterial.' : '  -> material: judge LEVELS (meanScore, slope) on the as-of variant, not the stored pred.') +
      ' (Within a date the shift is nearly constant, so its dIC mostly tests the leak; rank metrics barely move.)');
    return st;
  }

  /* ---------- v3: gate buckets ---------- */
  function gateReport(rows) {
    var G = opts.gates;
    console.log('\n==== GATE BUCKETS (live gates re-applied: net >= ' + G.minNetEV + ', P(ret>0) >= ' + G.minP + ', EV conf >= ' + G.minEv + ', evidence >= ' + G.minEvid + ') ====');
    var haveGate = rows.some(function (r) { return isNum(r.pEv) && isNum(r.pRet) && isNum(r.evidence); });
    if (!hasMoney) console.log('NOTE: rows carry no realRaw - "$" columns equal the detrended numbers.');
    var B = [
      ['all rows', function () { return true; }],
      ['Buy-grade', function (r) { return r.elig; }],
      ['Buy-grade, pred >= 0', function (r) { return r.elig && r.pred >= 0; }],
      ['Buy-grade, pred >= 0.25', function (r) { return r.elig && r.pred >= 0.25; }],
      ['Buy-grade, pred >= ' + G.minNetEV, function (r) { return r.elig && r.pred >= G.minNetEV; }]
    ];
    if (haveGate) {
      B.push(['LIVE GATES (qualified)', function (r) { return r.elig && liveGate(r); }]);
      B.push(['Buy-grade, failed live gates', function (r) { return r.elig && !liveGate(r); }]);
    } else console.log('LIVE GATES bucket unavailable: rows lack pEv / pRet / evidence (needs engine 4.9.2 rows).');
    if (rows.some(function (r) { return r.code; })) {
      B.push(['stored code QUALIFIED/HIGH (stale if gates changed)', function (r) { return r.code === 'QUALIFIED_TRADE' || r.code === 'HIGH_CONVICTION'; }]);
    }
    var out = [], live = null;
    B.forEach(function (b) {
      var rs = rows.filter(b[1]), wk = rs.map(function (r) { return r.week; });
      var m = clusterMean(rs.map(moneyOf), wk), d = clusterMean(rs.map(function (r) { return r.real; }), wk);
      var syms = {}; rs.forEach(function (r) { if (r.sym) syms[r.sym] = 1; });
      var c = { bucket: b[0], n: rs.length, syms: Object.keys(syms).length || '—', weeks: m.weeks,
        '$ mean': fmt(m.m, 2), '$ t': fmt(m.t, 2), '$ 95% CI': isNum(m.se) ? '[' + fmt(m.m - 2 * m.se, 2) + ', ' + fmt(m.m + 2 * m.se, 2) + ']' : '—',
        'detr mean': fmt(d.m, 2), 'detr t': fmt(d.t, 2),
        'hit %': rs.length ? fmt(100 * rs.filter(function (r) { return moneyOf(r) > 0; }).length / rs.length, 0) : '—',
        verdict: moneyVerdict(m) };
      if (b[0].indexOf('LIVE GATES') === 0) live = { n: rs.length, weeks: m.weeks, mean: m.m, se: m.se, verdict: c.verdict };
      out.push(c);
    });
    console.table ? console.table(out) : console.log(out);
    var lines = [];
    if (live) {
      if (live.verdict === 'TOO FEW') lines.push('LIVE GATES bucket has n=' + live.n + ' over ' + live.weeks + ' weeks - the gate is UNVERIFIED (not proven good or bad). The engine cannot learn from positive-EV calls it almost never makes.');
      else if (live.verdict === 'LOSES') lines.push('LIVE GATES bucket LOSES money (' + fmt(live.mean, 2) + '% per plan, 95% CI upper ' + fmt(live.mean + 2 * live.se, 2) + '): the gate fails; the Buy signal is not a trade signal.');
      else if (live.verdict === 'WINS') lines.push('LIVE GATES bucket WINS (' + fmt(live.mean, 2) + '% per plan, CI lower ' + fmt(live.mean - 2 * live.se, 2) + '): promising, but the gate was chosen on this sample - confirm on the forward scorecard.');
      else lines.push('LIVE GATES bucket is unproven (' + fmt(live.mean, 2) + '% per plan, n=' + live.n + '): keep sizing at zero until the CI clears zero.');
    }
    lines.forEach(function (l) { console.log(' - ' + l); });
    return out;
  }

  /* ---------- v3: regime at entry -> weekly pool return ---------- */
  function walkForwardState(wk, keyFn, minPrior, minState) {
    var out = [], i;
    for (i = minPrior; i < wk.length; i++) {
      var prior = wk.slice(0, i), grand = mean(prior.map(function (p) { return p.real; }));
      var k = keyFn(wk[i]);
      var same = prior.filter(function (p) { return keyFn(p) === k; });
      out.push({ real: wk[i].real, grand: grand, cond: same.length >= minState ? mean(same.map(function (p) { return p.real; })) : grand });
    }
    if (out.length < 6) return null;
    var sse = function (key) { var t = 0; out.forEach(function (o) { t += (o.real - o[key]) * (o.real - o[key]); }); return t; };
    var allowed = out.filter(function (o) { return o.cond >= 0; }), blocked = out.filter(function (o) { return o.cond < 0; });
    return { weeks: out.length, oosR2: sse('grand') > 0 ? 1 - sse('cond') / sse('grand') : NaN,
      nAllowed: allowed.length, nBlocked: blocked.length,
      allowedMean: allowed.length ? mean(allowed.map(function (o) { return o.real; })) : NaN,
      blockedMean: blocked.length ? mean(blocked.map(function (o) { return o.real; })) : NaN,
      t: welchT(allowed.map(function (o) { return o.real; }), blocked.map(function (o) { return o.real; })) };
  }
  function regimeReport(rows) {
    console.log('\n==== REGIME AT ENTRY vs WEEKLY BUY-GRADE POOL RETURN (money basis) ====');
    var el = rows.filter(function (r) { return r.elig && r.regTrend != null && r.regVol != null; });
    if (el.length < 100) { console.log('Skipped: need >= 100 Buy-grade rows with regTrend/regVol (engine 4.9.2 rows). Have ' + el.length + '.'); return null; }
    var byW = {};
    el.forEach(function (r) { (byW[r.week] = byW[r.week] || []).push(r); });
    var haveGate = rows.some(function (r) { return isNum(r.pEv) && isNum(r.pRet) && isNum(r.evidence); });
    var wk = Object.keys(byW).sort().map(function (w) {
      var rs = byW[w], st = {};
      rs.forEach(function (r) { var k = r.regTrend + '/' + r.regVol; st[k] = (st[k] || 0) + 1; });
      var state = Object.keys(st).sort(function (a, b) { return st[b] - st[a]; })[0];
      return { week: w, n: rs.length, real: mean(rs.map(moneyOf)), pred: mean(rs.map(function (r) { return r.pred; })),
               state: state, gated: haveGate ? rs.filter(liveGate).length : null };
    });
    var perState = {};
    wk.forEach(function (w) { (perState[w.state] = perState[w.state] || []).push(w.real); });
    console.table ? console.table(Object.keys(perState).map(function (k) {
      return { state: k, weeks: perState[k].length, 'weekly $ mean': fmt(mean(perState[k]), 2), 'weekly $ sd': fmt(sd(perState[k]), 2) };
    })) : null;
    var populated = Object.keys(perState).filter(function (k) { return perState[k].length >= 10; }).length;
    if (populated < 2) console.log('Only ' + populated + ' regime state(s) have >= 10 weeks: this sample is effectively ONE regime, so a regime filter cannot be tested here. Treat the engine as a veto only.');

    var A = walkForwardState(wk, function (w) { return w.state; }, opts.regimeMinPrior, opts.regimeMinState);
    var A4 = walkForwardState(wk.filter(function (w, i) { return i % 4 === 0; }), function (w) { return w.state; }, Math.max(4, Math.floor(opts.regimeMinPrior / 2)), 2);
    function show(label, r) {
      if (!r) { console.log(label + ': too few weeks.'); return; }
      console.log(label + ': ' + r.weeks + ' out-of-sample weeks | oosR2 ' + fmt(r.oosR2, 3) + ' | allowed ' + fmt(r.allowedMean, 2) + '% (n=' + r.nAllowed + ') vs blocked ' + fmt(r.blockedMean, 2) + '% (n=' + r.nBlocked + ') | Welch t ' + fmt(r.t, 2));
    }
    show('A. regime state, all weeks      ', A);
    show('A. regime state, every 4th week ', A4);
    var B = null;
    var corr = pearson(wk.map(function (w) { return w.pred; }), wk.map(function (w) { return w.real; }));
    console.log('B1. weekly mean pred vs weekly pool money return: corr = ' + fmt(corr, 2) + ' over ' + wk.length + ' weeks');
    if (haveGate) {
      var withG = wk.filter(function (w) { return w.gated > 0; }).map(function (w) { return w.real; });
      var without = wk.filter(function (w) { return w.gated === 0; }).map(function (w) { return w.real; });
      B = { weeksWithGated: withG.length, weeksWithout: without.length, meanWith: mean(withG), meanWithout: mean(without), t: welchT(withG, without) };
      console.log('B2. weeks with >= 1 live-gate pass: ' + withG.length + ' (pool $ ' + fmt(B.meanWith, 2) + '%) vs none: ' + without.length + ' (pool $ ' + fmt(B.meanWithout, 2) + '%) | Welch t ' + fmt(B.t, 2));
    }
    var lines = [];
    if (A && isNum(A.oosR2) && A.oosR2 > 0 && isNum(A.t) && A.t > 3 && A.nAllowed >= 15 && A.nBlocked >= 15)
      lines.push('Regime at entry looks USABLE as a gate (oosR2 > 0, t > 3, >= 15 weeks each side). Confirm on the every-4th-week line and on forward data before relying on it.');
    else lines.push('Regime at entry is NOT shown to predict the pool out of sample. Use the engine as a no-trade VETO only (trade when the live-gate bucket is non-empty and the day is not WEAK/NO TRADE); do not use EV as a size or return forecast.');
    lines.push('Caution: horizons run to 20 days, so adjacent weekly returns overlap; weekly t-stats are optimistic. Require |t| > 3, and prefer the every-4th-week line.');
    lines.forEach(function (l) { console.log(' - ' + l); });
    return { states: perState, all: A, every4: A4, corr: corr, gateFilter: B };
  }

  /* ---------- main ---------- */
  var raw = await loadRows();
  function nn(v) { return isNum(v) ? v : null; }
  var rows = (raw || []).map(function (r) {
    r = r || {};
    return {
      date: r.date != null ? dateStr(r.date) : null,
      week: null,
      sym: r.sym != null ? String(r.sym) : null,
      basisEV: r.basisEV, stdErrPct: r.stdErrPct, haircutPct: r.haircutPct, haircutRawPct: nn(r.haircutRawPct),
      /* v3.2: the score recipe (EV-4.9.3+) */
      haircutCoef: nn(r.haircutCoef), signalScale: nn(r.signalScale), shrinkFactor: nn(r.shrinkFactor), selBiasPct: nn(r.selBiasPct),
      priorMeanPct: r.priorMeanPct, horizonDays: r.horizonDays,
      real: r.real, money: nn(r.realRaw), pred: r.pred, elig: !!r.elig,
      planCount: nn(r.planCount), winnerGapPct: nn(r.winnerGapPct),
      /* v3: engine 4.9.2 fields */
      basis: r.basis != null ? String(r.basis) : null, ver: r.ver != null ? String(r.ver) : null,
      anchorPct: nn(r.anchorPct), anchorWeight: nn(r.anchorWeight), pooledWeight: nn(r.pooledWeight),
      pEv: nn(r.pEv), pRet: nn(r.pRet), evidence: nn(r.evidence), setupQ: nn(r.setupQ),
      code: r.code != null ? String(r.code) : null,
      regTrend: r.regTrend != null ? String(r.regTrend) : null, regVol: r.regVol != null ? String(r.regVol) : null,
      predAsOf: null
    };
  }).filter(function (r) {
    return r.date && isNum(r.basisEV) && isNum(r.stdErrPct) && isNum(r.real) && isNum(r.horizonDays);
  });
  rows.forEach(function (r) { r.week = weekKey(r.date); });
  rows = rows.filter(function (r) { return r.week; });

  /* v3: basis filter (rows tagged with the calibration signature they were built under) */
  (function () {
    var counts = {}, tagged = 0, vers = {};
    rows.forEach(function (r) {
      if (r.basis) { counts[r.basis] = (counts[r.basis] || 0) + 1; tagged++; }
      if (r.ver) vers[r.ver] = (vers[r.ver] || 0) + 1;
    });
    var keys = Object.keys(counts);
    if (!keys.length) {
      console.log('No basis tags on these rows (engine < 4.9.2, or the export predates the rebuild): cannot filter by basis. Rebuild on 4.9.2 and re-export.');
      return;
    }
    keys.sort(function (a2, b2) { return counts[b2] - counts[a2]; });
    console.log('Basis tags: ' + keys.map(function (k) { return k + ' x' + counts[k]; }).join(', ') + (rows.length - tagged ? ', untagged x' + (rows.length - tagged) : '') +
      (Object.keys(vers).length ? '  | engine versions: ' + Object.keys(vers).map(function (k) { return k + ' x' + vers[k]; }).join(', ') : ''));
    if (opts.basis === 'all') { if (keys.length > 1 || tagged < rows.length) console.log('WARNING: --basis all mixes bases; levels and anchors are not comparable across them.'); return; }
    var want = opts.basis === 'auto' ? keys[0] : opts.basis;
    if (!counts[want]) { console.log('Requested basis "' + want + '" not found; keeping all rows.'); return; }
    var before0 = rows.length;
    rows = rows.filter(function (r) { return r.basis === want; });
    console.log('Basis filter "' + want + '": kept ' + rows.length + ', dropped ' + (before0 - rows.length) + ' (other bases / untagged).' +
      (opts.basis === 'auto' && before0 - rows.length ? ' Stale rows survived a rebuild - clear the stox_ev_rows DB and rebuild if this is large.' : ''));
  })();

  /* de-duplicate: engine v4.9 rows carry a symbol hash - use it; v1 rows fall
     back to the old date|basisEV|stdErr|horizon|real key. v3 adds the basis. */
  var seen = {}, before = rows.length;
  rows = rows.filter(function (r) {
    var k = [r.date, r.sym || '', r.basis || '', r.basisEV, r.stdErrPct, r.horizonDays, r.real].join('|');
    if (seen[k]) return false; seen[k] = 1; return true;
  });
  console.log('Loaded ' + before + ' usable rows, ' + (before - rows.length) + ' duplicates dropped, ' + rows.length + ' kept.');
  if (!rows.length) { console.log('No rows found. Run calibrateFromHistory over your symbols first.'); return; }
  hasMoney = rows.some(function (r) { return isNum(r.money); });
  console.log('Money basis: ' + (hasMoney ? rows.filter(function (r) { return isNum(r.money); }).length + '/' + rows.length + ' rows carry realRaw (raw P&L).' : 'no realRaw on these rows - money columns fall back to detrended.'));

  /* P2: symbol coverage + per-symbol multiplicity (overlap diagnostic) */
  var withSym = rows.filter(function (r) { return r.sym; });
  if (withSym.length) {
    var perSym = {};
    withSym.forEach(function (r) { perSym[r.sym] = (perSym[r.sym] || 0) + 1; });
    var counts = Object.keys(perSym).map(function (k) { return perSym[k]; });
    console.log('Symbol hash present on ' + withSym.length + '/' + rows.length + ' rows (' + Object.keys(perSym).length + ' symbols, median ' + fmt(median(counts), 0) + ' rows/symbol). High multiplicity = overlapping episodes; week clustering covers it.');
    var withPC = rows.filter(function (r) { return r.planCount != null; }).length;
    if (withPC) console.log('planCount present on ' + withPC + '/' + rows.length + ' rows (selection feature for the fitted score).');
  } else {
    console.log('No symbol hash on these rows (engine < v4.9); de-dup falls back to the date|values key and per-symbol clustering is unavailable.');
  }

  /* v3.2: score recipe visibility */
  (function () {
    function tally(vals) {
      var m = {};
      vals.forEach(function (v) { var k = isNum(v) ? String(v) : '—'; m[k] = (m[k] || 0) + 1; });
      return Object.keys(m).map(function (k) { return k + ' x' + m[k]; }).join(', ');
    }
    if (rows.some(function (r) { return isNum(r.signalScale); })) {
      console.log('score recipe: signalScale ' + tally(rows.map(function (r) { return r.signalScale; })) +
        ' | haircutCoef ' + tally(rows.map(function (r) { return r.haircutCoef; })) +
        ' | selBias>0 on ' + rows.filter(function (r) { return isNum(r.selBiasPct) && r.selBiasPct > 0; }).length + ' rows');
    } else {
      console.log('score recipe: pre-4.9.3 rows (signalScale=1, haircutCoef=1 assumed; tau reconstructed from --tau).');
    }
  })();

  /* sanity check: does recomputing "current" reproduce the stored pred? */
  var withPred = rows.filter(function (r) { return isNum(r.pred); });
  if (withPred.length) {
    var bad = withPred.filter(function (r) { return Math.abs(shrunk(r, 1) - r.pred) > 1e-6; }).length;
    console.log('Recompute check: ' + (withPred.length - bad) + '/' + withPred.length + ' rows reproduce the stored pred' +
      (isNum(withPred[0] && withPred[0].shrinkFactor) ? ' (stored recipe)' : ' at tauBase=' + opts.tauBase) +
      (bad ? '  -> ' + bad + ' differ (rows were stored under another tau/config; try --tau / EV_AB_OPTS.tauBase, or interpret variants as relative comparisons).' : '  (exact)'));
  }

  var asOfStats = null;
  if (opts.asof) {
    asOfStats = applyAsOf(rows);
    if (asOfStats) VARIANTS.push({ name: 'current + as-of anchor (no look-ahead)', f: function (r) { return r.predAsOf; } });
  }

  var resAll = report('ALL rows', rows);
  var resElig = report('Buy-grade rows only (elig)', rows.filter(function (r) { return r.elig; }));
  var resHoldout = (opts.holdout > 0 && opts.holdout < 1) ? holdoutReport(rows) : null;

  var gateRes = gateReport(rows);
  var regimeRes = regimeReport(rows);

  var result = { all: resAll, elig: resElig, holdout: resHoldout, gates: gateRes, regime: regimeRes, asOf: asOfStats, opts: opts };
  if (IS_NODE) module.exports = result; else window.EV_AB_RESULT = result;
  return result;

  function median(a) {
    if (!a.length) return NaN;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
})();
