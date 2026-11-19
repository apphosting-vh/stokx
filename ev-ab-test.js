/* ev-ab-test.js — does the best-of-N haircut help or hurt EV ranking?
 *
 * Re-scores every stored walk-forward row under several haircut treatments
 * (using only the ingredients the engine already stores) and compares how
 * well each version ranks realized outcomes.
 *
 * RUN IN THE BROWSER (the page that hosts the engine; reads IndexedDB):
 *     paste this whole file into the DevTools console.
 *     Optional first:  window.EV_AB_OPTS = { tauBase: 0.3 };
 *
 * RUN IN NODE (rows exported from the browser, see EXPORT below):
 *     node ev-ab-test.js rows.json [--tau 0.3] [--min-per-date 8]
 *
 * EXPORT rows from the browser console:
 *     (async()=>{const q=indexedDB.open('stox_ev_rows');q.onsuccess=()=>{
 *       const g=q.result.transaction('rows').objectStore('rows').getAll();
 *       g.onsuccess=()=>{const a=document.createElement('a');
 *         a.href=URL.createObjectURL(new Blob([JSON.stringify(g.result)]));
 *         a.download='rows.json';a.click();};};})();
 *
 * Row fields used (written by calibrateFromHistory): date, basisEV,
 * stdErrPct, haircutPct, priorMeanPct, horizonDays, real, elig, pred.
 * Rows carry no symbol, so "cross-section" = all rows sharing a date.
 *
 * Metrics (all week-clustered, because adjacent days overlap):
 *   IC      mean per-date Spearman between score and realized, averaged by week
 *   Spread  mean per-date (top 20% minus bottom 20%) realized, averaged by week
 *   Slope   pooled OLS slope of realized on score, week-clustered SE (ideal ~1)
 *   dIC     paired weekly IC difference vs the "current" variant
 */
(async function () {
  'use strict';

  var IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined';

  /* ---------- options ---------- */
  var opts = { tauBase: 0.3, defaultHorizon: 10, minPerDate: 8, spreadMin: 10, minWeeks: 8, file: null };
  if (!IS_NODE && typeof window !== 'undefined' && window.EV_AB_OPTS) Object.assign(opts, window.EV_AB_OPTS);
  if (IS_NODE) {
    var av = process.argv.slice(2);
    for (var i = 0; i < av.length; i++) {
      if (av[i] === '--tau') opts.tauBase = Number(av[++i]);
      else if (av[i] === '--min-per-date') opts.minPerDate = Number(av[++i]);
      else if (!av[i].startsWith('--')) opts.file = av[i];
    }
    if (!opts.file) { console.error('usage: node ev-ab-test.js rows.json [--tau 0.3] [--min-per-date 8]'); process.exit(1); }
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
      var weeklyIC = {}, weeklySpread = {};
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
      });
      var icW = {}, spW = {};
      Object.keys(weeklyIC).forEach(function (w) { icW[w] = mean(weeklyIC[w]); });
      Object.keys(weeklySpread).forEach(function (w) { spW[w] = mean(weeklySpread[w]); });
      var icVec = Object.keys(icW).map(function (w) { return icW[w]; });
      var spVec = Object.keys(spW).map(function (w) { return spW[w]; });
      var cs = clusteredSlope(scores, rows.map(function (r) { return r.real; }), rows.map(function (r) { return r.week; }));
      return {
        name: v.name, scores: scores, icW: icW,
        nWeeks: icVec.length,
        IC: mean(icVec), ICt: tStat(icVec),
        spread: mean(spVec), spreadT: tStat(spVec),
        slope: cs.slope, slopeSe: cs.se,
        meanScore: mean(scores), meanReal: mean(rows.map(function (r) { return r.real; })),
        pooledRho: spearman(scores, rows.map(function (r) { return r.real; }))
      };
    });

    var base = out[0];
    out.forEach(function (o) {
      var diffs = [];
      Object.keys(o.icW).forEach(function (w) { if (w in base.icW) diffs.push(o.icW[w] - base.icW[w]); });
      o.dIC = mean(diffs); o.dICt = tStat(diffs);
    });
    return out;
  }

  function fmt(v, d) { return isNum(v) ? v.toFixed(d == null ? 3 : d) : '  n/a'; }

  function report(label, rows) {
    console.log('\n==== ' + label + ' (n=' + rows.length + ' rows) ====');
    if (rows.length < 200) { console.log('Too few rows for a meaningful comparison (need ~200+).'); return null; }
    var res = evaluate(rows);
    console.log('weeks with usable IC: ' + res[0].nWeeks + (res[0].nWeeks < opts.minWeeks ? '  (LOW: treat t-stats as indicative only)' : ''));
    var table = res.map(function (o) {
      return {
        variant: o.name,
        meanScore: fmt(o.meanScore, 2), meanReal: fmt(o.meanReal, 2),
        IC: fmt(o.IC), 'IC t': fmt(o.ICt, 2),
        'top-bot spread': fmt(o.spread, 2), 'spread t': fmt(o.spreadT, 2),
        slope: fmt(o.slope, 2) + ' ± ' + fmt(o.slopeSe, 2),
        'dIC vs current': fmt(o.dIC), 'dIC t': fmt(o.dICt, 2)
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
    if (noH.dIC > 0 && noH.dICt > 2) lines.push('Removing the haircut RAISES ranking skill significantly (dIC t=' + fmt(noH.dICt, 2) + '): the haircut is adding noise.');
    else if (noH.dIC < 0 && noH.dICt < -2) lines.push('Removing the haircut LOWERS ranking skill significantly (dIC t=' + fmt(noH.dICt, 2) + '): the haircut is carrying real information.');
    else lines.push('Haircut vs no-haircut is not distinguishable on ranking (dIC t=' + fmt(noH.dICt, 2) + '). Not enough evidence to change it on ranking grounds alone.');
    if (isNum(hOnly.ICt) && Math.abs(hOnly.ICt) < 2 && isNum(res[0].ICt) && Math.abs(res[0].ICt) < 2) lines.push('Neither the current score nor the haircut alone shows significant ranking skill; the engine is not ranking trades here.');
    if (isNum(res[0].slope) && isNum(res[0].slopeSe) && res[0].slope + 2 * res[0].slopeSe < 1) lines.push('Current slope ' + fmt(res[0].slope, 2) + ' ± ' + fmt(res[0].slopeSe, 2) + ' is clearly below 1: predictions are over-dispersed relative to outcomes.');
    if (isNum(res[0].meanScore) && isNum(res[0].meanReal) && Math.abs(res[0].meanScore - res[0].meanReal) < 0.15) lines.push('Mean score and mean realized are within 0.15 points, so "calibrated on average" is true but says nothing about ranking.');
    lines.forEach(function (l) { console.log(' - ' + l); });
    return res;
  }

  /* ---------- main ---------- */
  var raw = await loadRows();
  var rows = (raw || []).map(function (r) {
    return {
      date: r && r.date != null ? dateStr(r.date) : null,
      week: null,
      basisEV: r && r.basisEV, stdErrPct: r && r.stdErrPct, haircutPct: r && r.haircutPct,
      priorMeanPct: r && r.priorMeanPct, horizonDays: r && r.horizonDays,
      real: r && r.real, pred: r && r.pred, elig: !!(r && r.elig)
    };
  }).filter(function (r) {
    return r.date && isNum(r.basisEV) && isNum(r.stdErrPct) && isNum(r.real) && isNum(r.horizonDays);
  });
  rows.forEach(function (r) { r.week = weekKey(r.date); });
  rows = rows.filter(function (r) { return r.week; });

  /* de-duplicate (rows have no id of their own; re-runs could re-insert) */
  var seen = {}, before = rows.length;
  rows = rows.filter(function (r) {
    var k = [r.date, r.basisEV, r.stdErrPct, r.horizonDays, r.real].join('|');
    if (seen[k]) return false; seen[k] = 1; return true;
  });
  console.log('Loaded ' + before + ' usable rows, ' + (before - rows.length) + ' duplicates dropped, ' + rows.length + ' kept.');
  if (!rows.length) { console.log('No rows found. Run calibrateFromHistory over your symbols first.'); return; }

  /* sanity check: does recomputing "current" reproduce the stored pred? */
  var withPred = rows.filter(function (r) { return isNum(r.pred); });
  if (withPred.length) {
    var bad = withPred.filter(function (r) { return Math.abs(shrunk(r, 1) - r.pred) > 1e-6; }).length;
    console.log('Recompute check: ' + (withPred.length - bad) + '/' + withPred.length + ' rows reproduce the stored pred at tauBase=' + opts.tauBase +
      (bad ? '  -> ' + bad + ' differ (rows were stored under another tau/config; try --tau / EV_AB_OPTS.tauBase, or interpret variants as relative comparisons).' : '  (exact)'));
  }

  var resAll = report('ALL rows', rows);
  var resElig = report('Buy-grade rows only (elig)', rows.filter(function (r) { return r.elig; }));

  var result = { all: resAll, elig: resElig, opts: opts };
  if (IS_NODE) module.exports = result; else window.EV_AB_RESULT = result;
  return result;
})();
