/* ev-ab-test.js v2 — does the best-of-N haircut help or hurt EV ranking?
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
    bootstrap: 2000, holdout: 0, seed: 20261120, minCell: 8, fdrQ: 0.10, file: null
  };
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
      else if (!av[i].startsWith('--')) opts.file = av[i];
    }
    if (!opts.file) {
      console.error('usage: node ev-ab-test.js rows.json [--tau 0.3] [--min-per-date 8] [--bootstrap 2000] [--holdout 0.5] [--seed 42] [--min-cell 8]');
      process.exit(1);
    }
  }

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
    if (IS_NODE) return JSON.parse(require('fs').readFileSync(opts.file, 'utf8'));
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
  function lamOf(r) {
    var tau = Math.max(0.05, opts.tauBase * Math.sqrt(Math.max(1, r.horizonDays) / opts.defaultHorizon));
    var s = Math.max(0.02, r.stdErrPct);
    return tau * tau / (tau * tau + s * s);
  }
  function pm(r) { return isNum(r.priorMeanPct) ? r.priorMeanPct : 0; }
  function hc(r) { return isNum(r.haircutPct) ? r.haircutPct : 0; }
  function shrunk(r, k) { return pm(r) + lamOf(r) * (r.basisEV - pm(r)) - k * hc(r); }

  var VARIANTS = [
    { name: 'current (shrink, then -haircut)', f: function (r) { return shrunk(r, 1); } },
    { name: 'haircut x0.5',                    f: function (r) { return shrunk(r, 0.5); } },
    { name: 'haircut x0.25',                   f: function (r) { return shrunk(r, 0.25); } },
    { name: 'no haircut (shrunk signal)',      f: function (r) { return shrunk(r, 0); } },
    { name: 'haircut BEFORE shrink (pre-4.5)', f: function (r) { return pm(r) + lamOf(r) * (r.basisEV - hc(r) - pm(r)); } },
    { name: 'unshrunk basis EV',               f: function (r) { return r.basisEV; } },
    { name: 'haircut only (prior - haircut)',  f: function (r) { return pm(r) - hc(r); } }
  ];

  /* ---------- evaluation ---------- */
  function evaluate(rows) {
    var byDate = {};
    rows.forEach(function (r) { (byDate[r.date] = byDate[r.date] || []).push(r); });
    var dates = Object.keys(byDate).sort();

    var out = VARIANTS.map(function (v) {
      var scores = rows.map(v.f);
      var weeklyIC = {}, weeklySpread = {}, weeklyTopElig = {};
      var hzCells = {}; /* (week|horizon) -> {s:[], y:[]} for stratified IC */
      dates.forEach(function (d) {
        var g = byDate[d];
        if (g.length < opts.minPerDate) return;
        var s = g.map(v.f), y = g.map(function (r) { return r.real; });
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
        }
        /* P1: stratified cells (week x horizon) */
        for (var z = 0; z < g.length; z++) {
          var ck = wk + '|' + g[z].horizonDays;
          (hzCells[ck] = hzCells[ck] || { s: [], y: [] });
          hzCells[ck].s.push(s[z]); hzCells[ck].y.push(y[z]);
        }
      });
      var icW = {}, spW = {}, teW = {}, hzW = {};
      Object.keys(weeklyIC).forEach(function (w) { icW[w] = mean(weeklyIC[w]); });
      Object.keys(weeklySpread).forEach(function (w) { spW[w] = mean(weeklySpread[w]); });
      Object.keys(weeklyTopElig).forEach(function (w) { teW[w] = mean(weeklyTopElig[w]); });
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
      var hzVec = Object.keys(hzW).map(function (w) { return hzW[w]; });
      var cs = clusteredSlope(scores, rows.map(function (r) { return r.real; }), rows.map(function (r) { return r.week; }));
      return {
        name: v.name, scores: scores, icW: icW,
        nWeeks: icVec.length,
        IC: mean(icVec), ICt: tStat(icVec),
        IChz: mean(hzVec), IChzT: tStat(hzVec), nHzWeeks: hzVec.length,
        spread: mean(spVec), spreadT: tStat(spVec),
        topElig: mean(teVec), topEligT: tStat(teVec), nTopWeeks: teVec.length,
        slope: cs.slope, slopeSe: cs.se,
        meanScore: mean(scores), meanReal: mean(rows.map(function (r) { return r.real; })),
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
        meanScore: fmt(o.meanScore, 2), meanReal: fmt(o.meanReal, 2),
        IC: fmt(o.IC), 'IC t': fmt(o.ICt, 2),
        'IC hz': fmt(o.IChz), 'hz t': fmt(o.IChzT, 2),
        'top-bot spread': fmt(o.spread, 2), 'spread t': fmt(o.spreadT, 2),
        'top% elig': fmt(o.topElig, 2), 'top% t': fmt(o.topEligT, 2),
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
    var sig = rows.map(function (r) { return lamOf(r) * (r.basisEV - pm(r)); });
    var zeroH = rows.filter(function (r) { return hc(r) === 0; }).length / rows.length;
    console.log('Drivers of the current score (pooled): corr with -haircut = ' + fmt(pearson(cur, negH), 2) +
      ', corr with shrunk signal = ' + fmt(pearson(cur, sig), 2) +
      '; sd(-haircut) = ' + fmt(sd(negH), 3) + ' vs sd(signal) = ' + fmt(sd(sig), 3) +
      '; rows with haircut = 0: ' + fmt(zeroH * 100, 0) + '%');

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
      if (res[0].topElig > 0 && res[0].topEligT > 2) lines.push('Top Buy-grade picks make money in absolute terms (' + fmt(res[0].topElig, 2) + '% per plan, t=' + fmt(res[0].topEligT, 2) + '): the tradeable top of the pool clears costs.');
      else if (res[0].topElig < 0 && res[0].topEligT < -2) lines.push('Top Buy-grade picks LOSE money in absolute terms (' + fmt(res[0].topElig, 2) + '% per plan, t=' + fmt(res[0].topEligT, 2) + '): this is a GATING problem, not a ranking one - raise minNetEV / minPositiveProbability before trusting any pick.');
      else lines.push('Top Buy-grade picks (' + fmt(res[0].topElig, 2) + '%, t=' + fmt(res[0].topEligT, 2) + ') are not distinguishable from zero: no evidence the tradeable top clears costs yet.');
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
        'top% elig': fmt(o.topElig, 2),
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

  /* ---------- main ---------- */
  var raw = await loadRows();
  var rows = (raw || []).map(function (r) {
    return {
      date: r && r.date != null ? dateStr(r.date) : null,
      week: null,
      sym: r && r.sym != null ? String(r.sym) : null,
      basisEV: r && r.basisEV, stdErrPct: r && r.stdErrPct, haircutPct: r && r.haircutPct,
      priorMeanPct: r && r.priorMeanPct, horizonDays: r && r.horizonDays,
      real: r && r.real, pred: r && r.pred, elig: !!(r && r.elig),
      planCount: r && isNum(r.planCount) ? r.planCount : null
    };
  }).filter(function (r) {
    return r.date && isNum(r.basisEV) && isNum(r.stdErrPct) && isNum(r.real) && isNum(r.horizonDays);
  });
  rows.forEach(function (r) { r.week = weekKey(r.date); });
  rows = rows.filter(function (r) { return r.week; });

  /* de-duplicate: engine v4.9 rows carry a symbol hash - use it; v1 rows fall
     back to the old date|basisEV|stdErr|horizon|real key. */
  var seen = {}, before = rows.length;
  rows = rows.filter(function (r) {
    var k = [r.date, r.sym || '', r.basisEV, r.stdErrPct, r.horizonDays, r.real].join('|');
    if (seen[k]) return false; seen[k] = 1; return true;
  });
  console.log('Loaded ' + before + ' usable rows, ' + (before - rows.length) + ' duplicates dropped, ' + rows.length + ' kept.');
  if (!rows.length) { console.log('No rows found. Run calibrateFromHistory over your symbols first.'); return; }

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

  /* sanity check: does recomputing "current" reproduce the stored pred? */
  var withPred = rows.filter(function (r) { return isNum(r.pred); });
  if (withPred.length) {
    var bad = withPred.filter(function (r) { return Math.abs(shrunk(r, 1) - r.pred) > 1e-6; }).length;
    console.log('Recompute check: ' + (withPred.length - bad) + '/' + withPred.length + ' rows reproduce the stored pred at tauBase=' + opts.tauBase +
      (bad ? '  -> ' + bad + ' differ (rows were stored under another tau/config; try --tau / EV_AB_OPTS.tauBase, or interpret variants as relative comparisons).' : '  (exact)'));
  }

  var resAll = report('ALL rows', rows);
  var resElig = report('Buy-grade rows only (elig)', rows.filter(function (r) { return r.elig; }));
  var resHoldout = (opts.holdout > 0 && opts.holdout < 1) ? holdoutReport(rows) : null;

  var result = { all: resAll, elig: resElig, holdout: resHoldout, opts: opts };
  if (IS_NODE) module.exports = result; else window.EV_AB_RESULT = result;
  return result;

  function median(a) {
    if (!a.length) return NaN;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
})();
