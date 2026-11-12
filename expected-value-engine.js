/* ══════════════════════════════════════════════════════════════════════
   StoX Expected Value & Probability-Calibrated Trade Engine
   Version 4.0  (EV_V4_ENGINE)

   Decision hierarchy:
     Setup Quality -> Calibrated Probability -> Outcome Distribution
     -> Net Expected Value -> Evidence Confidence -> Trade Decision

   v2 -> v3 (trust fixes)
     1. SAMPLING NOISE: every EV carries a standard error from its own windows
        and is shrunk toward zero (empirical-Bayes, prior sd cfg.evPriorStdPct).
        The engine reports P(true EV > 0) and QUALIFIED requires it to be high.
     2. SELECTION BIAS (best of 25 plans): a split-half test (choose on the older
        half, evaluate on the newer half, and vice versa) estimates how much the
        winning plan's EV is inflated by being the maximum, and subtracts it.
     3. SAME-BAR TIES: when a bar touches both target and stop, the order is
        decided by where the bar opened (gambler's-ruin share), not always stop.
        Stops that gap through their level fill at the open.
     4. COSTS/TAX: flat DP charge on the sell (per scrip) and short-term capital
        gains tax on gains (STT-paid listed equity, 20% + 4% cess) are modeled.
        Decisions use after-tax EV by default (cfg.decideAfterTax).
     5. CALIBRATION SCORE MISMATCH: calibration buckets use the daily-only entry
        score. If the caller passes baseScore (the live multi-timeframe score)
        and it differs a lot, the historical probability is down-weighted.
     6. SELF-AUDIT: calibrateFromHistory() also records walk-forward predicted-vs-
        realized EV of the optimizer's choice, and reliabilityStatus() reports
        whether the table's numbers have been over- or under-confident.

   v3 -> v4 (decision quality, risk and self-honesty)
     1. REGIME + RECENCY WEIGHTING: historical windows are weighted by how recent
        they are and by how closely the index regime then (trend, volatility)
        matches the regime now. Effective sample size falls accordingly.
     2. POOLED PRIOR: when the calibration store has enough similar setups (same
        plan, score band, volatility class) across stocks, the shrinkage target
        moves from the zero-edge EV toward that pooled EV.
     3. REALISTIC EXITS: stops locked behind a no-trade (limit) bar exit on the
        next tradable bar; optional liquidity impact; optional exit variants
        ('breakeven', 'trail') that compete with the fixed plan (off by default).
     4. SIZING + RISK: fractional-Kelly position size, EV per day / annualized,
        expected shortfall, worst window, adverse excursion, EV range,
        break-even win probability, plain-language reasons, signal strength.
     5. PORTFOLIO: diversify() ranks picks with correlation and group penalties;
        rankingVerdict() answers "is there anything worth trading today?".
     6. SELF-HONESTY: live prediction log + settlement, gate backtest (does the
        Buy filter add value?), EV-bucket calibration table, stale/trust flag,
        and calibration that clears itself when the cost or tax model changes.

   Earlier (v2): first-passage outcome model, corrected costs, probTouch percent
   fix, evidence reflects measured sample, shared per-stock setup computation,
   idempotent walk-forward calibration.

   This module deliberately does NOT replace the existing technical engine.
   It consumes existing StoX calculations and separates descriptive scoring
   from predictive probability and economic expectancy.
   ══════════════════════════════════════════════════════════════════════ */
window.ExpectedValueEngine = (function () {
  'use strict';

  var VERSION = 'EV-4.0';

  var DEFAULTS = {
    horizons: [3, 5, 10, 15, 20],
    targets: [2, 3, 4, 5, 6],
    defaultHorizon: 10,
    defaultTargetPct: 4,
    minNetEV: 0.30,                 // applies to the SHRUNK (trust-adjusted) EV
    minPositiveProbability: 0.55,
    minEvidence: 60,
    minEvConfidence: 0.80,          // P(true EV > 0) required for QUALIFIED (0.90 for HIGH CONVICTION)
    blend: { statistical: 0.55, historical: 0.25, ml: 0.20 },
    /* All values are PERCENT of traded value unless stated.
       brokerage, exchange, sebi, slippage are PER SIDE; stt is ROUND TRIP
       (0.1% on buy + 0.1% on sell for delivery); stampDuty is buy side only;
       gst is a FRACTION applied to (brokerage + exchange + SEBI).
       dpChargeRs is the flat depository charge in RUPEES per scrip on the sell
       day (13.5 + 18% GST = 15.93 at most brokers); it is converted to a percent
       using positionSizeRs, so set positionSizeRs to your typical position.
       Set costs.brokerage = 0 if your broker charges no delivery brokerage.
       Override at runtime with window.STOX_EV_CONFIG = { costs: { ... } }. */
    costs: {
      brokerage: 0,            // zero-brokerage delivery
      stt: 0.20,               // 0.1% buy + 0.1% sell
      exchange: 0.003,         // ~0.003% per side (0.006% round trip)
      sebi: 0.001,             // GST & SEBI charges, ~0.001% per side (0.002% round trip); GST is folded in here, so gst below is 0
      gst: 0,
      stampDuty: 0.015,        // buy side only
      slippage: 0,             // removed so total cost = 0.223% statutory only (was 0.10% per side)
      dpChargeRs: 0,           // DP charge is folded into the 0.223% statutory total
      positionSizeRs: 100000
    },
    /* Short-term capital gains on STT-paid listed equity: 20% + 4% cess = 20.8%.
       Surcharge for high incomes and business-income treatment are NOT modeled.
       Tax is levied on NET gains for the year, so a strategy you repeat pays tax
       on its expected net gain (EV x (1 - rate)): losses are set off against gains.
       taxLossCredit = share of each loss that offsets gains (1 = full set-off, the
       default for a repeated strategy; 0 = taxed on every winner while losers earn
       nothing, only right for one-off trades or a year with no other gains). */
    taxRatePct: 0,                  // capital gains tax NOT deducted from Net EV (was 20.8)
    taxLossCredit: 1,
    decideAfterTax: false,          // Net EV is after costs only (no capital gains tax)
    /* Trust adjustments */
    evPriorStdPct: 0.5,             // prior sd of the TRUE gross edge per trade, % (shrinkage strength)
    selectionHaircut: true,         // subtract the estimated best-of-N inflation
    scoreGapFree: 8,                // points of live-vs-calibration score gap that cost nothing
    scoreGapRange: 25,              // further points over which historical weight falls to its floor
    stopATR: 1.8,
    maxStopPct: 6.0,
    minStopPct: 1.5,
    lookbackBars: 500,
    minWindows: 30,
    driftKeep: 0.5,
    calibrationKey: 'stox_ev_calibration_v6',

    /* ── v4 options ─────────────────────────────────────────────────────── */
    /* Eligibility gate. By default only base-model Strong Buy / Buy rows are
       optimized. includeWatch also optimizes Watch/Hold rows; includeAvoid also
       optimizes Avoid/Sell rows. Use gateReport() to see whether the gate helps. */
    gate: { includeWatch: false, includeAvoid: false },
    /* Exit rules the optimizer may choose between. 'fixed' = target / stop /
       timeout. 'breakeven' = once price reaches armFrac of the target, the stop
       moves to entry. 'trail' = after arming, the stop trails the peak by
       trailFrac of the initial stop (never below entry). The variants use the
       stock's own history only (no calibration/ML blend), so they carry less
       evidence. Off by default because the UI must show the exit rule. */
    exitVariants: ['fixed'],
    exit: { armFrac: 0.5, trailFrac: 0.6 },
    lockedLimitDelay: true,         // a stop hit on a locked (no-trade) bar exits on the next tradable bar
    /* Historical windows are down-weighted by age and by regime mismatch. */
    recency: { halfLifeBars: 250 }, // 0 disables
    regime: { enabled: true, mismatchWeight: 0.6, trendBars: 50, volBars: 20, minIndexBars: 80 },
    /* Shrink toward the pooled EV of similar setups when the store has enough. */
    pooledPrior: { enabled: true, minN: 30, k: 60, maxWeight: 0.5 },
    /* Extra per-side impact cost from position size vs average daily turnover
       (square-root law). Off by default so costs stay at the statutory total. */
    liquidity: { enabled: false, impactCoef: 0.5, maxPerSidePct: 1.0, advBars: 20 },
    sizing: { kellyFraction: 0.25, maxPositionPct: 20, maxRiskPerTradePct: 1.0 },
    correlation: { lookbackBars: 120, minOverlap: 60, threshold: 0.7, penalty: 0.5, maxPicks: 5, maxPerGroup: 1, groupPrefixes: ['ADANI', 'TATA', 'BAJAJ'] },
    live: { key: 'stox_ev_live_v1', maxRecords: 4000 },
    staleCalibrationDays: 21,
    noTrade: { minPPositive: 0.5 },
    upside: { horizons: [3, 5, 10, 15, 20], targets: [2, 3, 4, 5, 6], shrinkK: 8 }
  };

  /* v2 stored calibration with a different label rule; it is not comparable. */
  try {
    localStorage.removeItem('stox_ev_calibration_v2');
    localStorage.removeItem('stox_ev_calibration_v2_meta');
    localStorage.removeItem('stox_ev_calibration_v3');       // calibrated under old cost/tax settings
    localStorage.removeItem('stox_ev_calibration_v3_meta');
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v4' + sfx); });  // pre-regime/recency model
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v5' + sfx); });  // win labels were raw while val/live model were detrended
  } catch (e) {}

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function num(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : fallback;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round(v, d) {
    var p = Math.pow(10, d == null ? 2 : d);
    return Math.round(v * p) / p;
  }
  function pct(v) { return v == null || !isFinite(v) ? null : round(v * 100, 1); }
  function Phi(x) {   // standard normal CDF (Abramowitz-Stegun 7.1.26)
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989423 * Math.exp(-x * x / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  function getConfig(overrides) {
    var c = clone(DEFAULTS);
    function merge(src) {
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function (k) {
        if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && c[k] && typeof c[k] === 'object' && !Array.isArray(c[k])) {
          Object.assign(c[k], src[k]);
        } else c[k] = src[k];
      });
    }
    try { merge(window.STOX_EV_CONFIG); } catch (e) {}
    merge(overrides);
    return c;
  }

  function totalRoundTripCost(costs) {
    var c = costs || DEFAULTS.costs;
    var broker = num(c.brokerage, 0) * 2;
    var exch = num(c.exchange, 0) * 2;
    var sebi = num(c.sebi, 0) * 2;
    var gst = (broker + exch + sebi) * num(c.gst, 0);   // GST never applies to STT, stamp duty or DP
    var dp = (num(c.dpChargeRs, 0) > 0 && num(c.positionSizeRs, 0) > 0) ? num(c.dpChargeRs, 0) / num(c.positionSizeRs, 0) * 100 : 0;
    return broker + exch + sebi + gst + num(c.stt, 0) + num(c.stampDuty, 0) + num(c.slippage, 0) * 2 + dp;
  }

  /* Tax on ONE trade outcome g (percent, after costs). Gains are taxed; a loss
     earns a rebate only to the extent cfg.taxLossCredit says it can be set off. */
  function afterTax(g, cfg) {
    var r = num(cfg.taxRatePct, 0) / 100;
    if (!(r > 0)) return g;
    return g > 0 ? g * (1 - r) : g * (1 - r * clamp(num(cfg.taxLossCredit, 0), 0, 1));
  }

  /* ── Setup quality (descriptive; NOT a probability) ─────────────────── */
  function setupQuality(daily, indexCandles, symbol, hourly) {
    var TI = window.TechIndicators;
    if (!TI || !TI.computeEntryScore) return { score: null, components: {}, reason: 'technical_engine_unavailable' };
    var r;
    try { r = TI.computeEntryScore(daily, indexCandles, symbol, hourly && hourly.length ? hourly : null); }
    catch (e) { return { score: null, components: {}, reason: 'entry_score_error' }; }
    if (!r || r.entry_score == null) return { score: null, components: r || {}, reason: r && r.reason || 'insufficient_data' };
    return {
      score: clamp(Number(r.entry_score), 0, 100),
      components: {
        trend: r.trendHealth,
        pullback: r.pullbackQuality,
        swing: r.swingPotential,
        breakout: r.breakoutContinuation,
        regime: r.regimeAlignment,
        regimeMax: r.regimeAlignmentMax,
        range: r.rangeAdequacy,
        legacyConfidence: r.confidence
      },
      raw: r,
      reason: 'ok'
    };
  }

  /* ── Volatility helpers ──────────────────────────────────────────────── */
  function atrPctOf(daily) {
    if (!daily || !daily.length) return null;
    var close = daily[daily.length - 1].c;
    var atrPct = null;
    var TI = window.TechIndicators;
    try {
      if (TI && TI.atr) {
        var a = TI.atr(daily, 14);
        var v = a && a[a.length - 1];
        if (v != null && close > 0) atrPct = v / close * 100;
      }
    } catch (e) {}
    if (atrPct == null) {
      var n = Math.min(14, daily.length), sum = 0, count = 0;
      for (var i = daily.length - n; i < daily.length; i++) {
        var b = daily[i];
        if (b && b.h != null && b.l != null && close > 0) { sum += (b.h - b.l) / close * 100; count++; }
      }
      atrPct = count ? sum / count : null;
    }
    return atrPct;
  }
  function stopFromAtr(atrPct, cfg) {
    var a = atrPct == null ? cfg.minStopPct / cfg.stopATR : atrPct;
    return clamp(a * cfg.stopATR, cfg.minStopPct, cfg.maxStopPct);
  }
  function volClassOf(atrPct) {
    if (atrPct == null) return 'M';
    return atrPct < 1.5 ? 'L' : (atrPct < 2.5 ? 'M' : 'H');
  }

  /* ── TechIndicators touch probability (informational only) ───────────────
     NOTE: components.probTouch is a PERCENT (e.g. 60.8 means 60.8%). */
  function statisticalTouch(hourly, daily, indexCandles, horizon, targetPct) {
    var TI = window.TechIndicators;
    if (!TI || !TI.computeHorizonConfidence || !hourly || !hourly.length || !daily || !daily.length) return null;
    var entry = hourly[hourly.length - 1].c;
    try {
      var r = TI.computeHorizonConfidence(hourly, daily, {
        horizonDays: horizon,
        windowSessions: 40,
        entry_price: entry,
        targetPct: targetPct,
        holdingDays: null,
        indexCandles: indexCandles
      });
      if (r && r.components && r.components.probTouch != null) {
        var p = Number(r.components.probTouch) / 100;
        if (isFinite(p)) return { p: clamp(p, 0.001, 0.999), raw: r };
      }
    } catch (e) {}
    return null;
  }

  /* ── One historical window, walked bar by bar ────────────────────────────
     Entry = close of bar i. Returns fractional outcome weights:
        tP target first, sP stop first, oP timeout (tP + sP + oP = 1)
     plus x (timeout terminal return, %) and sRet (return if stopped, %).
     "removed" is the per-day log drift taken out of the path (see tripleBarrierWindows).
     Same-bar tie: the share going to the target is the gambler's-ruin chance
     that a driftless walk starting at the bar's OPEN reaches the target level
     before the stop level; an open beyond a level means that level was hit first.
     A stop that the bar gaps through fills at the open (worse than the stop). */
  function exitOpts(cfg) {
    return { armFrac: cfg.exit && cfg.exit.armFrac, trailFrac: cfg.exit && cfg.exit.trailFrac, lockDelay: cfg.lockedLimitDelay !== false };
  }
  function windowOutcome(daily, i, horizon, up, dn, removed, stopPct, mode, ex) {
    var base = daily[i].c;
    if (!(base > 0)) return null;
    mode = mode || 'fixed';
    ex = ex || {};
    var lvl = dn;                                   // current stop level (log, drift-adjusted)
    var armAt = up * (ex.armFrac == null ? 0.5 : ex.armFrac);
    var trailDist = Math.abs(dn) * (ex.trailFrac == null ? 0.6 : ex.trailFrac);
    var peak = -Infinity, minLow = 0;
    for (var j = 1; j <= horizon; j++) {
      var bar = daily[i + j];
      if (!bar || !(bar.h > 0) || !(bar.l > 0)) continue;
      var adj = removed * j;
      var lowL = Math.log(bar.l / base), highL = Math.log(bar.h / base);
      if (lowL < minLow) minLow = lowL;
      var hitS = lowL - adj <= lvl;
      var hitT = highL - adj >= up;
      if (!hitS && !hitT) {
        if (mode !== 'fixed') {                     // the new stop applies from the NEXT bar
          var pk = highL - adj;
          if (pk > peak) peak = pk;
          if (peak >= armAt) {
            var nl = mode === 'breakeven' ? 0 : Math.max(0, peak - trailDist);
            if (nl > lvl) lvl = nl;
          }
        }
        continue;
      }
      var stopRet = (Math.exp(lvl) - 1) * 100;      // equals -stopPct while the stop has not moved
      var gapRet = stopRet;
      if (bar.o > 0) {
        var oRet = (bar.o / base - 1) * 100;
        if (oRet < gapRet) gapRet = oRet;
      }
      var mae = (Math.exp(minLow) - 1) * 100;
      if (hitS && hitT) {
        var share = 0.5;
        if (bar.o > 0) {
          var oL = Math.log(bar.o / base) - adj;
          if (oL >= up) share = 1; else if (oL <= lvl) share = 0; else share = (oL - lvl) / (up - lvl);
        }
        return { tP: share, sP: 1 - share, oP: 0, x: 0, sRet: gapRet, mae: mae };
      }
      if (hitT) return { tP: 1, sP: 0, oP: 0, x: 0, sRet: stopRet, mae: mae };
      /* Stop hit. If this bar is locked (no range: lower circuit / suspended)
         nobody could sell at the stop: exit on the next tradable bar instead. */
      if (ex.lockDelay !== false && bar.h === bar.l) {
        var exitRet = null;
        for (var k = j + 1; k <= horizon; k++) {
          var b2 = daily[i + k];
          if (!b2 || !(b2.h > 0) || !(b2.l > 0)) continue;
          if (b2.h > b2.l) { exitRet = b2.o > 0 ? (b2.o / base - 1) * 100 : (b2.c / base - 1) * 100; break; }
        }
        if (exitRet == null) {
          var lastB = daily[Math.min(daily.length - 1, i + horizon)];
          exitRet = lastB && lastB.c > 0 ? (lastB.c / base - 1) * 100 : gapRet;
        }
        if (exitRet < gapRet) gapRet = exitRet;
      }
      return { tP: 0, sP: 1, oP: 0, x: 0, sRet: gapRet, mae: Math.min(mae, gapRet) };
    }
    var endBar = daily[i + horizon];
    var endC = endBar ? endBar.c : 0;
    var x = endC > 0 ? (Math.exp(Math.log(endC / base) - removed * horizon) - 1) * 100 : 0;
    return { tP: 0, sP: 0, oP: 1, x: x, sRet: (Math.exp(lvl) - 1) * 100, mae: (Math.exp(minLow) - 1) * 100 };
  }

  /* Value of one window outcome for a trade with target T, costs c (percent). */
  function outcomeValues(o, targetPct, costPct, cfg) {
    var afT = afterTax(targetPct - costPct, cfg);
    var afS = afterTax(o.sRet - costPct, cfg);
    var afO = afterTax(o.x - costPct, cfg);
    return {
      pre: o.tP * (targetPct - costPct) + o.sP * (o.sRet - costPct) + o.oP * (o.x - costPct),
      aft: o.tP * afT + o.sP * afS + o.oP * afO,
      gross: o.tP * targetPct + o.sP * o.sRet + o.oP * o.x,
      afS: afS, afO: afO
    };
  }

  /* weighted quantile of (value, weight) pairs; q in [0,1] */
  function wQuantile(pairs, q) {
    if (!pairs.length) return 0;
    var arr = pairs.slice().sort(function (a, b) { return a[0] - b[0]; });
    var tot = 0, k;
    for (k = 0; k < arr.length; k++) tot += arr[k][1];
    var acc = 0, target = q * tot;
    for (k = 0; k < arr.length; k++) { acc += arr[k][1]; if (acc >= target) return arr[k][0]; }
    return arr[arr.length - 1][0];
  }
  /* weighted mean of the lowest `share` of total weight (expected shortfall) */
  function wTailMean(pairs, share) {
    if (!pairs.length) return 0;
    var arr = pairs.slice().sort(function (a, b) { return a[0] - b[0]; });
    var tot = 0, k;
    for (k = 0; k < arr.length; k++) tot += arr[k][1];
    var lim = share * tot, acc = 0, s = 0;
    for (k = 0; k < arr.length && acc < lim; k++) {
      var take = Math.min(arr[k][1], lim - acc);
      s += arr[k][0] * take; acc += take;
    }
    return acc > 0 ? s / acc : arr[0][0];
  }

  /* ── Triple-barrier study on the stock's own history ─────────────────────
     Every historical start bar is walked forward "horizon" bars (see
     windowOutcome). The stock's own average daily log-drift is partly removed
     (1 - driftKeep) from every path so a prior rally is not mistaken for an edge.
     Each window carries a weight (recency x regime match, see buildWindowWeights;
     1 when no weights are given). Per-window after-cost (and after-tax) values
     give the weighted EV, its standard error (using the effective sample size),
     and the older-half / newer-half means used for the selection test. Tail and
     adverse-excursion statistics describe the downside. */
  function tripleBarrierWindows(daily, horizon, targetPct, stopPct, cfg, costPct, weights, mode) {
    if (!daily || !daily.length) return null;
    var n = daily.length, last = n - 1;
    var firstStart = Math.max(1, n - cfg.lookbackBars);
    var lastStart = last - horizon;
    if (lastStart - firstStart + 1 < cfg.minWindows) return null;

    var sum = 0, cnt = 0;
    for (var k = firstStart; k <= last; k++) {
      var a = daily[k - 1].c, b = daily[k].c;
      if (a > 0 && b > 0) { sum += Math.log(b / a); cnt++; }
    }
    var mu = cnt ? sum / cnt : 0;
    var removed = (1 - clamp(num(cfg.driftKeep, 0.5), 0, 1)) * mu;
    var up = Math.log(1 + targetPct / 100);
    var dn = Math.log(1 - stopPct / 100);
    var ex = exitOpts(cfg);

    var useAft = cfg.decideAfterTax !== false;
    var vals = [], ws = [], maes = [];
    var W = 0, W2 = 0, sT = 0, sS = 0, sO = 0, sRetW = 0, sAfS = 0, sX = 0, sAfO = 0, nPosO = 0;
    for (var i = firstStart; i <= lastStart; i++) {
      var w = weights ? weights[i] : 1;
      if (!(w > 0)) continue;
      var o = windowOutcome(daily, i, horizon, up, dn, removed, stopPct, mode, ex);
      if (!o) continue;
      var v = outcomeValues(o, targetPct, costPct, cfg);
      vals.push(useAft ? v.aft : v.pre); ws.push(w); maes.push(o.mae == null ? 0 : o.mae);
      W += w; W2 += w * w;
      sT += w * o.tP; sS += w * o.sP; sO += w * o.oP;
      sRetW += w * o.sP * o.sRet; sAfS += w * o.sP * v.afS;
      sX += w * o.oP * o.x; sAfO += w * o.oP * v.afO;
      if (o.oP > 0 && o.x - costPct > 0) nPosO += w * o.oP;
    }
    var m = vals.length;
    if (m < cfg.minWindows || !(W > 0)) return null;

    var mean = 0, i2;
    for (i2 = 0; i2 < m; i2++) mean += ws[i2] * vals[i2];
    mean /= W;
    var ss = 0;
    for (i2 = 0; i2 < m; i2++) ss += ws[i2] * (vals[i2] - mean) * (vals[i2] - mean);
    var effW = W * W / W2;                            // Kish effective number of windows
    var sd = Math.sqrt(ss / W * effW / Math.max(1, effW - 1));
    var nEff = effW / Math.max(1, horizon);           // overlapping windows are not independent
    var half = Math.floor(m / 2), hA = 0, hB = 0, wA = 0, wB = 0;
    for (i2 = 0; i2 < half; i2++) { hA += ws[i2] * vals[i2]; wA += ws[i2]; }
    for (i2 = half; i2 < m; i2++) { hB += ws[i2] * vals[i2]; wB += ws[i2]; }

    var pairs = [], mp = [], worst = Infinity;
    for (i2 = 0; i2 < m; i2++) {
      pairs.push([vals[i2], ws[i2]]); mp.push([-maes[i2], ws[i2]]);
      if (vals[i2] < worst) worst = vals[i2];
    }
    var maeMean = 0;
    for (i2 = 0; i2 < m; i2++) maeMean += ws[i2] * maes[i2];
    maeMean /= W;

    return {
      pTarget: sT / W, pStop: sS / W, pTimeout: sO / W,
      meanStopRet: sS > 0 ? sRetW / sS : -stopPct,
      meanAfStop: sS > 0 ? sAfS / sS : afterTax(-stopPct - costPct, cfg),
      meanTimeoutRet: sO > 0 ? sX / sO : 0,
      meanAfTimeout: sO > 0 ? sAfO / sO : 0,
      timeoutPosShare: sO > 0 ? nPosO / sO : 0.5,
      n: m, nEff: nEff, effWindows: effW,
      empEV: mean,
      stdErr: sd / Math.sqrt(Math.max(1, nEff)),
      halfA: half > 0 && wA > 0 ? hA / wA : null,
      halfB: m - half > 0 && wB > 0 ? hB / wB : null,
      driftPerDayPct: mu * 100,
      removedDriftPerDayPct: removed * 100,
      cvar5Pct: wTailMean(pairs, 0.05),
      p5Pct: wQuantile(pairs, 0.05),
      worstPct: worst,
      meanMAEPct: maeMean,
      p90MAEPct: -wQuantile(mp, 0.90)
    };
  }

  /* ── Calibration store (bucketed empirical target-first outcomes) ───────── */
  function calibrationBucket(horizon, targetPct, setupScore, volClass) {
    return 'h' + horizon + '|t' + round(targetPct, 1) + '|s' + Math.floor(clamp(setupScore || 0, 0, 99) / 10) * 10 + '|v' + (volClass || 'M');
  }
  function loadStore(key) {
    try {
      var raw = localStorage.getItem(key);
      var d = raw ? JSON.parse(raw) : {};
      return d && typeof d === 'object' ? d : {};
    } catch (e) { return {}; }
  }
  function saveStore(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }
  function loadCalibration(key) { return loadStore(key || DEFAULTS.calibrationKey); }

  function historicalProbability(horizon, targetPct, setupScore, volClass, key) {
    var all = loadCalibration(key);
    var b = all[calibrationBucket(horizon, targetPct, setupScore, volClass)];
    if (!b || !b.n || b.n < 20) return null;
    // Beta(1,1) shrinkage prevents small samples from producing extreme probabilities.
    var p = (num(b.wins, 0) + 1) / (num(b.n, 0) + 2);
    return { p: clamp(p, 0.01, 0.99), n: b.n, bucket: b };
  }

  function mlProbability(context) {
    // Optional adapter: accepts a calibrated live ML probability if the existing
    // StoX ML layer exposes one. No uncalibrated classifier score is used.
    var candidates = [
      window.LiveML && window.LiveML.getCalibratedProbability,
      window.MLTrainer && window.MLTrainer.getCalibratedProbability
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (typeof candidates[i] === 'function') {
        try {
          var p = Number(candidates[i](context));
          if (isFinite(p)) {
            if (p > 1) p /= 100;
            return clamp(p, 0.01, 0.99);
          }
        } catch (e) {}
      }
    }
    return null;
  }

  function blendProbability(parts, cfg, histScale) {
    var weights = cfg.blend;
    var available = [];
    if (parts.statistical && parts.statistical.p != null) available.push({ k: 'statistical', p: parts.statistical.p, w: weights.statistical });
    if (parts.historical && parts.historical.p != null) available.push({ k: 'historical', p: parts.historical.p, w: weights.historical * (histScale == null ? 1 : histScale) });
    if (parts.ml != null) available.push({ k: 'ml', p: parts.ml, w: weights.ml });
    if (!available.length) return { p: null, contributors: 0, disagreement: null };
    var wsum = available.reduce(function (s, x) { return s + x.w; }, 0);
    var p = available.reduce(function (s, x) { return s + x.p * x.w / wsum; }, 0);
    var mean = p;
    var variance = available.reduce(function (s, x) {
      return s + x.w / wsum * Math.pow(x.p - mean, 2);
    }, 0);
    return { p: clamp(p, 0.01, 0.99), contributors: available.length, disagreement: Math.sqrt(variance), parts: available };
  }

  /* Evidence confidence, 0-100.
       own-history windows   0-12   calibration history  0-18
       data completeness     0-15   model agreement      0-15
       model count           0-15   setup stability      0-10
       regime alignment      0-15
     Without calibration or a second model the ceiling is 67. */
  function evidenceConfidence(input) {
    var ownScore = clamp((input.ownN || 0) / 40, 0, 1) * 12;
    var calScore = clamp((input.historicalN || 0) / 200, 0, 1) * 18;
    var dataScore = clamp(input.dataCompleteness == null ? 0 : input.dataCompleteness, 0, 1) * 15;
    var contributors = input.contributors || 0;
    var agreementScore = contributors <= 1 ? 8 :
      clamp(1 - num(input.disagreement, 0.25) / 0.25, 0, 1) * 15;
    var modelScore = contributors >= 3 ? 15 : contributors === 2 ? 11 : 7;
    var setupScore = input.setupScore == null ? 50 : input.setupScore;
    var stabilityScore = clamp((setupScore - 35) / 50, 0, 1) * 10;
    var regimeMax = num(input.regimeMax, 5);
    var regimeScore = input.regimeScore == null || regimeMax <= 0 ? 5 : clamp(input.regimeScore / regimeMax, 0, 1) * 15;
    return round(clamp(ownScore + calScore + dataScore + agreementScore + modelScore + stabilityScore + regimeScore, 0, 100), 1);
  }

  /* netEV is the SHRUNK, selection-corrected EV on the decision basis. */
  function classify(netEV, pEvPositive, pReturnPositive, evidence, setupScore, cfg) {
    if (netEV == null || evidence < 45) return { code: 'INSUFFICIENT_EVIDENCE', label: 'WATCH', color: 'neutral' };
    if (netEV <= 0) return { code: 'NEGATIVE_EV', label: 'AVOID', color: 'loss' };
    if (netEV >= 0.75 && pReturnPositive >= 0.62 && evidence >= 75 && (setupScore || 0) >= 60 && pEvPositive >= 0.90)
      return { code: 'HIGH_CONVICTION', label: 'HIGH CONVICTION', color: 'profit' };
    if (netEV >= cfg.minNetEV && pReturnPositive >= cfg.minPositiveProbability && evidence >= cfg.minEvidence && pEvPositive >= cfg.minEvConfidence)
      return { code: 'QUALIFIED_TRADE', label: 'QUALIFIED TRADE', color: 'profit' };
    return { code: 'WATCH', label: 'WATCH', color: 'warn' };
  }


  /* ── Window weights: recency x index-regime match ───────────────────────
     Index regime at a date = (trend: close above its trendBars average) x
     (volatility: recent realized vol above / below the index's own median).
     A window whose regime differs from the CURRENT regime in one dimension is
     weighted mismatchWeight, in both dimensions mismatchWeight^2. */
  function indexRegimes(indexCandles, cfg) {
    var rc = cfg.regime || {};
    var tb = rc.trendBars || 50, vb = rc.volBars || 20;
    var n = indexCandles ? indexCandles.length : 0;
    if (!rc.enabled || n < (rc.minIndexBars || 80) || n <= tb) return null;
    var close = [], i;
    for (i = 0; i < n; i++) close.push(num(indexCandles[i].c, 0));
    var trend = new Array(n), vol = new Array(n), volVals = [];
    var sma = 0;
    for (i = 0; i < n; i++) {
      sma += close[i];
      if (i >= tb) sma -= close[i - tb];
      trend[i] = i >= tb - 1 && close[i] > 0 ? (close[i] > sma / tb ? 1 : 0) : null;
      if (i >= vb) {
        var s1 = 0, s2 = 0, c = 0;
        for (var j = i - vb + 1; j <= i; j++) {
          if (close[j] > 0 && close[j - 1] > 0) { var lr = Math.log(close[j] / close[j - 1]); s1 += lr; s2 += lr * lr; c++; }
        }
        vol[i] = c > 5 ? Math.sqrt(Math.max(0, s2 / c - Math.pow(s1 / c, 2))) : null;
        if (vol[i] != null) volVals.push(vol[i]);
      } else vol[i] = null;
    }
    if (volVals.length < 20) return null;
    var sorted = volVals.slice().sort(function (a, b) { return a - b; });
    var med = sorted[sorted.length >> 1];
    var dates = indexCandles.map(function (c) { return String(c.t).slice(0, 10); });
    return { n: n, trend: trend, hiVol: vol.map(function (v) { return v == null ? null : (v > med ? 1 : 0); }), dates: dates };
  }
  function buildWindowWeights(daily, indexCandles, cfg) {
    var n = daily.length, w = new Array(n), last = n - 1, k;
    var hl = num(cfg.recency && cfg.recency.halfLifeBars, 0);
    for (k = 0; k < n; k++) w[k] = hl > 0 ? Math.pow(0.5, (last - k) / hl) : 1;
    var info = null;
    var reg = indexRegimes(indexCandles, cfg);
    if (reg) {
      var mm = clamp(num(cfg.regime.mismatchWeight, 0.6), 0.05, 1);
      var state = new Array(n), p = -1;
      for (k = 0; k < n; k++) {
        var d = String(daily[k].t).slice(0, 10);
        while (p + 1 < reg.n && reg.dates[p + 1] <= d) p++;
        state[k] = p >= 0 && reg.trend[p] != null && reg.hiVol[p] != null ? [reg.trend[p], reg.hiVol[p]] : null;
      }
      var cur = [reg.trend[reg.n - 1], reg.hiVol[reg.n - 1]];
      if (cur[0] != null && cur[1] != null) {
        var matchW = 0, totW = 0;
        for (k = 0; k < n; k++) {
          if (!state[k]) continue;
          var mism = (state[k][0] !== cur[0] ? 1 : 0) + (state[k][1] !== cur[1] ? 1 : 0);
          var f = Math.pow(mm, mism);
          w[k] *= f;
          totW += w[k]; if (!mism) matchW += w[k];
        }
        info = { trend: cur[0] ? 'up' : 'down', volatility: cur[1] ? 'high' : 'low', matchedShare: totW > 0 ? matchW / totW : null };
      }
    }
    return { weights: w, regime: info };
  }

  /* Per-side market-impact estimate (percent): coef x daily vol x sqrt(position / ADV). */
  function liquidityCostPct(daily, atrPct, cfg) {
    var lc = cfg.liquidity || {};
    if (!lc.enabled) return { perSidePct: 0, participation: null, advRs: null };
    var nb = lc.advBars || 20, s = 0, c = 0;
    for (var i = Math.max(0, daily.length - nb); i < daily.length; i++) {
      var b = daily[i];
      if (b && b.v > 0 && b.c > 0) { s += b.v * b.c; c++; }
    }
    var pos = num(cfg.costs && cfg.costs.positionSizeRs, 0);
    if (!c || !(pos > 0)) return { perSidePct: 0, participation: null, advRs: null };
    var adv = s / c, part = pos / adv;
    var imp = num(lc.impactCoef, 0.5) * (atrPct == null ? 2 : atrPct) * Math.sqrt(part);
    return { perSidePct: clamp(imp, 0, num(lc.maxPerSidePct, 1)), participation: part, advRs: adv };
  }

  /* ── Per-stock work that does NOT depend on the (horizon, target) plan ──── */
  function prepare(input, cfg, internal) {
    var daily = input.dailyCandles || [];
    var hourly = input.hourlyCandles || [];
    var indexCandles = input.indexCandles || [];
    var symbol = input.symbol || '';
    var TI = window.TechIndicators;

    var setup, setupCalScore;
    if (internal && internal.setupScoreOverride != null) {
      setup = { score: internal.setupScoreOverride, components: {}, reason: 'override' };
      setupCalScore = internal.setupScoreOverride;
    } else {
      setup = setupQuality(daily, indexCandles, symbol, hourly);
      // Calibration buckets use the DAILY-ONLY score so that live analysis and
      // historical (walk-forward) labelling use exactly the same definition.
      setupCalScore = null;
      try {
        var rc = TI && TI.computeEntryScore ? TI.computeEntryScore(daily, indexCandles, symbol, null) : null;
        if (rc && rc.entry_score != null) setupCalScore = clamp(Number(rc.entry_score), 0, 100);
      } catch (e) {}
      if (setupCalScore == null) setupCalScore = setup.score;
    }

    // Live multi-timeframe score vs the daily-only score the calibration was built on.
    var baseScore = input.baseScore == null ? null : Number(input.baseScore);
    var gap = (baseScore != null && isFinite(baseScore) && setupCalScore != null) ? Math.abs(baseScore - setupCalScore) : null;
    var gapFactor = gap == null ? 1 : clamp(1 - Math.max(0, gap - cfg.scoreGapFree) / cfg.scoreGapRange, 0.25, 1);

    var atrPct = atrPctOf(daily);
    var dataCompleteness =
      (daily.length >= 50 ? 0.45 : Math.min(daily.length / 50, 0.45)) +
      (hourly.length >= 60 ? 0.35 : Math.min(hourly.length / 60, 0.35)) +
      (indexCandles.length >= 30 ? 0.20 : Math.min(indexCandles.length / 30, 0.20));

    var ww = buildWindowWeights(daily, indexCandles, cfg);
    var liq = liquidityCostPct(daily, atrPct, cfg);

    return {
      setup: setup,
      setupCalScore: setupCalScore,
      scoreGap: gap,
      gapFactor: gapFactor,
      atrPct: atrPct,
      stopPct: stopFromAtr(atrPct, cfg),
      volClass: volClassOf(atrPct),
      dataCompleteness: dataCompleteness,
      costs: totalRoundTripCost(cfg.costs) + liq.perSidePct * 2,
      liquidity: liq,
      weights: ww.weights,
      regime: ww.regime
    };
  }

  /* ── Stage 1: everything about one plan that is independent of selection ── */
  function corePlan(pre, input, cfg, horizon, targetPct, internal, mode) {
    var daily = input.dailyCandles || [];
    var hourly = input.hourlyCandles || [];
    var indexCandles = input.indexCandles || [];
    mode = mode || 'fixed';
    /* Exit variants have no calibration history or ML probability for their own
       exit rule, so they rely on the stock's own windows only. */
    var noHist = !!(internal && internal.noHist) || mode !== 'fixed';

    var tb = tripleBarrierWindows(daily, horizon, targetPct, pre.stopPct, cfg, pre.costs, pre.weights, mode);
    var touch = noHist ? null : statisticalTouch(hourly, daily, indexCandles, horizon, targetPct);
    var hist = noHist ? null : historicalProbability(horizon, targetPct, pre.setupCalScore, pre.volClass, cfg.calibrationKey);
    var ml = noHist ? null : mlProbability({
      symbol: input.symbol, dailyCandles: daily, hourlyCandles: hourly, indexCandles: indexCandles,
      setup: pre.setup, horizonDays: horizon, targetPct: targetPct
    });

    var probability = blendProbability({
      statistical: tb ? { p: clamp(tb.pTarget, 0.01, 0.99) } : null,
      historical: hist,
      ml: ml
    }, cfg, pre.gapFactor);

    var core = {
      horizonDays: horizon, targetPct: targetPct, exitMode: mode, tb: tb, touch: touch, hist: hist, ml: ml,
      probability: probability, dist: null, ev: null, pReturnPositive: null
    };
    if (!tb || probability.p == null) return core;

    /* The blended target-first probability sets P(target); the remaining mass
       keeps the MEASURED stop / timeout split. */
    var pT = probability.p, rest = 1 - pT;
    var denom = tb.pStop + tb.pTimeout;
    var stopShare = denom > 0 ? tb.pStop / denom : 0.5;
    var pS = rest * stopShare, pO = rest - pS;
    var c = pre.costs;
    var dist = {
      pTarget: pT, pStop: pS, pTimeout: pO,
      targetReturnPct: targetPct, stopReturnPct: tb.meanStopRet, timeoutReturnPct: tb.meanTimeoutRet
    };
    var gross = pT * targetPct + pS * tb.meanStopRet + pO * tb.meanTimeoutRet;
    var preNet = pT * (targetPct - c) + pS * (tb.meanStopRet - c) + pO * (tb.meanTimeoutRet - c);
    var aftNet = pT * afterTax(targetPct - c, cfg) + pS * tb.meanAfStop + pO * tb.meanAfTimeout;
    core.dist = dist;
    core.ev = { grossPct: gross, costPct: c, preTaxNetPct: preNet, afterTaxNetPct: aftNet, taxPct: preNet - aftNet };
    core.basisEV = cfg.decideAfterTax !== false ? aftNet : preNet;
    core.pReturnPositive = clamp(pT + pO * tb.timeoutPosShare, 0, 1);
    return core;
  }

  /* ── Stage 2: shrink, correct for selection, classify ──────────────────── */
  function finalizePlan(core, pre, input, cfg, haircut) {
    var setup = pre.setup, tb = core.tb, probability = core.probability;
    var hist = core.hist;

    var evidence = evidenceConfidence({
      ownN: tb ? tb.nEff : 0,
      historicalN: hist ? hist.n * pre.gapFactor : 0,
      dataCompleteness: pre.dataCompleteness,
      contributors: probability.contributors,
      disagreement: probability.disagreement,
      setupScore: setup.score,
      regimeScore: setup.components && setup.components.regime,
      regimeMax: setup.components && setup.components.regimeMax
    });

    var ev = null;
    if (core.ev) {
      var tau = Math.max(0.05, num(cfg.evPriorStdPct, 0.5));
      var s = Math.max(0.02, tb.stdErr);
      var lam = tau * tau / (tau * tau + s * s);
      var corrected = core.basisEV - haircut;
      /* Prior mean = EV of a trade with ZERO gross edge (efficient market):
         minus costs, minus the tax drag on the winners (plus any loss rebate).
         Shrinking toward 0 instead would hide the cost drag. */
      var cst = core.ev.costPct, Tg = core.targetPct, Sg = Math.abs(tb.meanStopRet);
      var pT0 = Sg / (Tg + Sg) * (1 - tb.pTimeout), pS0 = Tg / (Tg + Sg) * (1 - tb.pTimeout);
      var rate = cfg.decideAfterTax !== false ? num(cfg.taxRatePct, 0) / 100 : 0;
      var m0 = -cst - rate * pT0 * Math.max(0, Tg - cst) + rate * clamp(num(cfg.taxLossCredit, 0), 0, 1) * pS0 * (Sg + cst);
      /* Pooled prior: similar setups across stocks (same plan, score band, vol class). */
      var pp = cfg.pooledPrior || {};
      var priorMean = m0, pooledMean = null, pooledW = 0;
      if (pp.enabled && hist && hist.bucket && hist.bucket.nv >= num(pp.minN, 30)) {
        pooledMean = hist.bucket.sv / hist.bucket.nv;
        pooledW = Math.min(num(pp.maxWeight, 0.5), hist.bucket.nv / (hist.bucket.nv + num(pp.k, 60))) * pre.gapFactor;
        priorMean = m0 + pooledW * (pooledMean - m0);
      }
      var shrunk = priorMean + lam * (corrected - priorMean);
      var postSd = Math.sqrt(tau * tau * s * s / (tau * tau + s * s));
      ev = {
        grossPct: core.ev.grossPct,
        costPct: core.ev.costPct,
        taxPct: core.ev.taxPct,
        preTaxNetPct: core.ev.preTaxNetPct,
        afterTaxNetPct: core.ev.afterTaxNetPct,
        basis: cfg.decideAfterTax !== false ? 'after-tax' : 'net of costs',
        rawBasisPct: core.basisEV,          // what the data say, no trust adjustment
        haircutPct: haircut,                // best-of-N selection inflation removed
        shrinkFactor: lam,
        priorMeanPct: priorMean,
        zeroEdgePriorPct: m0,
        pooledMeanPct: pooledMean,
        pooledWeight: pooledW,
        shrunkPct: shrunk,
        stdErrPct: s,
        postSdPct: postSd,
        pPositive: clamp(Phi(shrunk / postSd), 0, 1),   // P(true EV > 0)
        netPct: shrunk,                     // PRIMARY: trust-adjusted EV on the decision basis
        rangeLoPct: shrunk - 1.645 * postSd,    // 90% interval for the TRUE EV
        rangeHiPct: shrunk + 1.645 * postSd,
        evPerDayPct: shrunk / Math.max(1, core.horizonDays),
        annualizedPct: shrunk * 252 / Math.max(1, core.horizonDays)   // simple (not compounded) EV x trades per year
      };
    }

    var decision = classify(ev ? ev.netPct : null, ev ? ev.pPositive : null, core.pReturnPositive, evidence, setup.score, cfg);
    var be = core.dist ? breakEvenTargetProb(core.dist, tb, core.targetPct, pre.costs) : null;
    var sizing = ev ? computeSizing(core.dist, tb, core.targetPct, pre.costs, pre.stopPct, ev, cfg) : null;
    var downside = tb && core.dist ? {
      pStop: core.dist.pStop, stopReturnPct: tb.meanStopRet,
      expectedShortfall5Pct: tb.cvar5Pct, p5Pct: tb.p5Pct, worstWindowPct: tb.worstPct,
      meanAdverseExcursionPct: tb.meanMAEPct, p90AdverseExcursionPct: tb.p90MAEPct
    } : null;

    return {
      version: VERSION,
      symbol: input.symbol || '',
      horizonDays: core.horizonDays,
      targetPct: core.targetPct,
      setupQuality: setup.score,
      setup: setup,
      probability: {
        target: probability.p,                              // blended TARGET-FIRST probability
        touch: core.touch ? core.touch.p : null,            // legacy "touch at any time" (informational)
        positiveReturn: core.pReturnPositive,
        contributors: probability.contributors,
        disagreement: probability.disagreement,
        statistical: tb ? tb.pTarget : null,
        historical: hist ? hist.p : null,
        historicalN: hist ? hist.n : 0,
        ml: core.ml
      },
      windows: tb ? {
        n: tb.n, nEff: round(tb.nEff, 1),
        ownDriftPerDayPct: round(tb.driftPerDayPct, 3),
        removedDriftPerDayPct: round(tb.removedDriftPerDayPct, 3)
      } : null,
      distribution: core.dist,
      stopPct: pre.stopPct,
      atrPct: pre.atrPct,
      volClass: pre.volClass,
      costsPct: pre.costs,
      calScoreGap: pre.scoreGap,
      calScoreFactor: pre.gapFactor,
      expectedValue: ev,
      evidenceConfidence: evidence,
      dataCompleteness: round(pre.dataCompleteness * 100, 1),
      decision: decision,
      exitMode: core.exitMode || 'fixed',
      exitRule: exitRuleText(core.exitMode, cfg),
      eligibility: null,
      regime: pre.regime,
      liquidity: pre.liquidity && pre.liquidity.advRs != null ? pre.liquidity : null,
      breakEvenTargetProb: be,
      sizing: sizing,
      downside: downside,
      signalStrength: signalStrength(ev),
      reasons: (core.dist && ev) ? plainReasons(core, pre, ev, evidence, be, haircut) : [],
      explanation: buildExplanation(setup, probability, ev, evidence, decision, tb, pre)
    };
  }


  /* ── Sizing, break-even, reasons, strength (presentation + risk) ─────────── */
  function exitRuleText(mode, cfg) {
    var ex = cfg.exit || {};
    if (mode === 'breakeven') return 'Stop moves to entry once price is up ' + round(num(ex.armFrac, 0.5) * 100, 0) + '% of the way to target';
    if (mode === 'trail') return 'After ' + round(num(ex.armFrac, 0.5) * 100, 0) + '% of the target, stop trails the peak (never below entry)';
    return 'Fixed target / stop / time exit';
  }

  /* Fractional Kelly on the three modeled outcomes, scaled down by how much of
     the raw edge survived shrinkage, then capped by risk per trade and size. */
  function computeSizing(dist, tb, targetPct, cost, stopPct, ev, cfg) {
    var sc = cfg.sizing || {};
    var out = { fullKellyPct: 0, suggestedPct: 0, riskCapPct: null, binding: 'no edge', kellyScale: 0 };
    if (!dist || !tb || !ev || !(ev.netPct > 0)) return out;
    var outs = [
      [dist.pTarget, afterTax(targetPct - cost, cfg) / 100],
      [dist.pStop, afterTax(tb.meanStopRet - cost, cfg) / 100],
      [dist.pTimeout, afterTax(tb.meanTimeoutRet - cost, cfg) / 100]
    ];
    var rawEdge = 0;
    outs.forEach(function (o) { rawEdge += o[0] * o[1] * 100; });
    var bestF = 0, bestG = 0;
    for (var f = 0.005; f <= 1.0001; f += 0.005) {
      var g = 0, ok = true;
      for (var k = 0; k < outs.length; k++) {
        var x = 1 + f * outs[k][1];
        if (!(x > 0)) { ok = false; break; }
        g += outs[k][0] * Math.log(x);
      }
      if (ok && g > bestG) { bestG = g; bestF = f; }
    }
    var scale = rawEdge > 1e-9 ? clamp(ev.netPct / rawEdge, 0, 1) : 0;
    var kelly = bestF * 100 * num(sc.kellyFraction, 0.25) * scale;
    var riskCap = stopPct > 0 ? num(sc.maxRiskPerTradePct, 1) / stopPct * 100 : null;
    var cap = num(sc.maxPositionPct, 20);
    var sug = kelly, binding = 'kelly';
    if (riskCap != null && riskCap < sug) { sug = riskCap; binding = 'risk cap'; }
    if (cap < sug) { sug = cap; binding = 'position cap'; }
    return { fullKellyPct: bestF * 100, suggestedPct: sug, riskCapPct: riskCap, binding: binding, kellyScale: scale };
  }

  /* Target-first probability at which EV (before tax) is exactly zero, holding the
     measured stop/timeout split and payoffs fixed. */
  function breakEvenTargetProb(dist, tb, targetPct, cost) {
    if (!dist || !tb) return null;
    var rest = dist.pStop + dist.pTimeout;
    var sh = rest > 0 ? dist.pStop / rest : 0.5;
    var L = sh * (tb.meanStopRet - cost) + (1 - sh) * (tb.meanTimeoutRet - cost);
    var T = targetPct - cost;
    var d = T - L;
    return d > 1e-9 ? clamp(-L / d, 0, 1) : null;
  }

  function signalStrength(ev) {
    if (!ev) return { tier: 'none', color: 'neutral' };
    var e = ev.netPct, p = ev.pPositive;
    if (e > 0 && p >= 0.80) return { tier: 'strong', color: 'profit' };
    if (e > 0 && p >= 0.60) return { tier: 'moderate', color: 'warn' };
    if (e > 0) return { tier: 'weak', color: 'neutral' };
    if (e > -0.10) return { tier: 'near-breakeven', color: 'neutral' };
    return { tier: 'negative', color: 'loss' };
  }

  function plainReasons(core, pre, ev, evidence, be, haircut) {
    var tb = core.tb, out = [];
    var T = core.targetPct, S = Math.abs(tb.meanStopRet), pT = core.dist.pTarget;
    if (be != null) {
      var gap = (pT - be) * 100;
      if (gap >= 0) out.push('Target-first chance ' + pct(pT) + '% is ' + round(gap, 1) + ' pts above the ' + pct(be) + '% needed to break even.');
      else out.push('Needs ' + pct(be) + '% target-first to break even but history gives ' + pct(pT) + '%.');
    }
    if (S > T * 1.5) out.push('The ' + round(S, 1) + '% stop is much wider than the +' + round(T, 1) + '% target: one loss erases about ' + round(S / T, 1) + ' wins.');
    if (core.ev.costPct > 0.25 * T) out.push('Costs of ' + round(core.ev.costPct, 2) + '% eat ' + round(core.ev.costPct / T * 100, 0) + '% of the +' + round(T, 1) + '% target.');
    if (ev && ev.pPositive < 0.6) out.push('The edge is inside sampling noise (only ' + pct(ev.pPositive) + '% sure it is real).');
    if (haircut > 0.15) out.push('About ' + round(haircut, 2) + '% of the raw EV was likely luck from picking the best of many plans.');
    if (core.tb.timeoutPosShare != null && core.dist.pTimeout > 0.4) out.push('Many trades just time out (' + pct(core.dist.pTimeout) + '%), so the move needs to come within the horizon.');
    if (evidence < 60) out.push('Evidence is thin (' + round(evidence, 0) + '/100): few similar setups measured.');
    if (pre.regime && pre.regime.matchedShare != null && pre.regime.matchedShare < 0.35) out.push('Today\'s market regime (' + pre.regime.trend + 'trend, ' + pre.regime.volatility + ' vol) is uncommon in this stock\'s history.');
    return out.slice(0, 4);
  }


  /* ── Upside candidates: chance of REACHING +T% within N days ──────────────
     Different question from EV: this ignores the stop and costs. For every
     historical close, did the high reach +T% within N bars? Windows are
     weighted by recency and index-regime match (same weights as the EV model),
     the stock's own drift is kept (it is what makes a stock a candidate), and
     the estimate is shrunk toward the random-walk baseline for a driftless
     stock with the same daily volatility, so a thin or lucky history does not
     look like a sure thing. lift = shrunk chance - baseline. */
  function upsideProfile(dailyCandles, indexCandles, overrides) {
    var cfg = getConfig(overrides), uc = cfg.upside || {};
    var daily = dailyCandles || [], n = daily.length;
    if (n < 60) return null;
    var H = uc.horizons || [3, 5, 10, 15, 20], T = uc.targets || [2, 3, 4, 5, 6];
    var ww = buildWindowWeights(daily, indexCandles || [], cfg);
    var last = n - 1, firstStart = Math.max(1, n - cfg.lookbackBars);
    var s1 = 0, s2 = 0, c = 0, k;
    for (k = firstStart; k <= last; k++) {
      if (daily[k - 1].c > 0 && daily[k].c > 0) { var lr = Math.log(daily[k].c / daily[k - 1].c); s1 += lr; s2 += lr * lr; c++; }
    }
    if (c < 30) return null;
    var sigma = Math.sqrt(Math.max(0, s2 / c - Math.pow(s1 / c, 2)));
    var p = [], nEff = [];
    H.forEach(function (h) {
      var lastStart = last - h, row = T.map(function () { return 0; }), W = 0, W2 = 0;
      if (lastStart - firstStart + 1 < 30) { p.push(T.map(function () { return null; })); nEff.push(0); return; }
      for (var i = firstStart; i <= lastStart; i++) {
        var base = daily[i].c, w = ww.weights[i];
        if (!(base > 0) || !(w > 0)) continue;
        var mx = 0;
        for (var j = 1; j <= h; j++) { var hi = daily[i + j] && daily[i + j].h; if (hi > mx) mx = hi; }
        var up = mx / base - 1;
        W += w; W2 += w * w;
        for (var t = 0; t < T.length; t++) if (up >= T[t] / 100) row[t] += w;
      }
      if (!(W > 0)) { p.push(T.map(function () { return null; })); nEff.push(0); return; }
      p.push(row.map(function (x) { return Math.round(x / W * 1000) / 1000; }));
      nEff.push(Math.round((W * W / W2) / h * 10) / 10);   // overlapping windows are not independent
    });
    return {
      sigmaPct: Math.round(sigma * 100 * 1000) / 1000, horizons: H, targets: T, p: p, nEff: nEff,
      regime: ww.regime, asOf: String(daily[last].t).slice(0, 10)
    };
  }
  /* P(max reaches +T% within N days) for a driftless random walk with daily vol sigma (reflection principle). */
  function upsideBaseline(sigmaPct, horizon, targetPct) {
    var sg = sigmaPct / 100 * Math.sqrt(horizon);
    if (!(sg > 0)) return 0;
    return clamp(2 * (1 - Phi(Math.log(1 + targetPct / 100) / sg)), 0, 1);
  }
  function upsideEstimate(profile, horizon, targetPct, overrides) {
    if (!profile) return null;
    var cfg = getConfig(overrides), k = num(cfg.upside && cfg.upside.shrinkK, 8);
    var hi = profile.horizons.indexOf(horizon), ti = profile.targets.indexOf(targetPct);
    if (hi < 0 || ti < 0) return null;
    var raw = profile.p[hi] ? profile.p[hi][ti] : null;
    if (raw == null) return null;
    var base = upsideBaseline(profile.sigmaPct, horizon, targetPct), ne = profile.nEff[hi] || 0;
    var adj = base + (raw - base) * ne / (ne + k);
    return { chance: adj, raw: raw, baseline: base, lift: adj - base, nEff: ne };
  }

  function analyze(input, overrides) {
    input = input || {};
    var cfg = getConfig(overrides);
    var horizon = clamp(num(input.horizonDays, cfg.defaultHorizon), 3, 20);
    var targetPct = clamp(num(input.targetPct, cfg.defaultTargetPct), 1, 10);
    var pre = prepare(input, cfg);
    // A single, user-chosen plan involves no selection among alternatives: no haircut.
    return finalizePlan(corePlan(pre, input, cfg, horizon, targetPct), pre, input, cfg, 0);
  }

  function buildExplanation(setup, probability, ev, evidence, decision, tb, pre) {
    var items = [];
    if (setup.score != null) items.push('Setup quality ' + round(setup.score, 0) + '/100');
    if (probability.p != null) items.push('target-first probability ' + pct(probability.p) + '%');
    if (tb) items.push('measured on ' + tb.n + ' historical windows (~' + round(tb.nEff, 0) + ' independent)');
    if (pre && pre.stopPct != null) items.push('stop ' + round(pre.stopPct, 1) + '% (' + round(pre.stopPct / Math.max(0.01, pre.atrPct || pre.stopPct), 1) + ' ATR-equivalent)');
    if (pre && pre.regime && pre.regime.matchedShare != null) items.push('regime ' + pre.regime.trend + 'trend / ' + pre.regime.volatility + ' vol (' + round(pre.regime.matchedShare * 100, 0) + '% of weighted history matches)');
    if (ev) {
      items.push('trust-adjusted ' + ev.basis + ' EV ' + (ev.netPct >= 0 ? '+' : '') + round(ev.netPct, 2) + '% (data say ' + (ev.rawBasisPct >= 0 ? '+' : '') + round(ev.rawBasisPct, 2) +
        '%, minus ' + round(ev.haircutPct, 2) + '% selection inflation, pulled x' + round(ev.shrinkFactor, 2) + ' of the way from the zero-edge EV ' + round(ev.priorMeanPct, 2) + '% for +/-' + round(ev.stdErrPct, 2) + '% sampling error)');
      items.push('P(true EV > 0) = ' + pct(ev.pPositive) + '%; costs ' + round(ev.costPct, 2) + '%, tax ' + round(ev.taxPct, 2) + '%');
    }
    items.push('evidence confidence ' + round(evidence, 0) + '/100');
    if (probability.contributors < 2) items.push('limited model triangulation (no calibration history yet)');
    if (pre && pre.scoreGap != null && pre.gapFactor < 1) items.push('live score differs from calibration score by ' + round(pre.scoreGap, 0) + ' pts: historical weight x' + round(pre.gapFactor, 2));
    if (decision.code === 'INSUFFICIENT_EVIDENCE') items.push('do not treat probability as trade-ready');
    return items;
  }

  /* ── Optimizer ───────────────────────────────────────────────────────────
     Utility = evidence-adjusted TRUST-ADJUSTED net EV per sqrt(day). Positive
     EV is scaled by an evidence factor; negative EV is left unscaled so low
     evidence can never make a losing plan look better. A small penalty
     discourages choosing the extreme edge of the search grid. */
  function optimizerUtility(r, cfg) {
    if (!r || !r.expectedValue) return -999999;
    var ev = Number(r.expectedValue.netPct);
    var evidence = Number(r.evidenceConfidence);
    var h = Math.max(1, Number(r.horizonDays) || 1);
    var t = Number(r.targetPct) || 0;
    if (!isFinite(ev)) return -999999;
    if (!isFinite(evidence)) evidence = 0;

    var timeEff = ev / Math.sqrt(h);
    var evidenceFactor = 0.55 + 0.45 * clamp(evidence, 0, 100) / 100;
    var u = ev > 0 ? timeEff * evidenceFactor : timeEff;

    var maxH = Math.max.apply(null, cfg.horizons || [20]);
    var maxT = Math.max.apply(null, cfg.targets || [6]);
    var corner = 0;
    if (h === maxH) corner += 0.02;
    if (t === maxT) corner += 0.02;
    return u - corner;
  }

  /* Winner's-curse estimate. Choose the best plan on the OLDER half of the
     windows and look at how it did on the NEWER half (and vice versa). The
     average in-sample-minus-out-of-sample gap measures how much picking the
     maximum of many noisy plans flatters the winner at HALF sample size; the
     inflation scales with the standard error, so it is divided by sqrt(2) to
     get the full-sample figure. Never negative. */
  function selectionHaircutOf(cores, cfg) {
    if (!cfg.selectionHaircut) return 0;
    var valid = cores.filter(function (c) { return c.tb && c.tb.halfA != null && c.tb.halfB != null; });
    if (valid.length < 3) return 0;
    var ia = -1, ib = -1, ua = -Infinity, ub = -Infinity;
    valid.forEach(function (c, k) {
      var h = Math.sqrt(Math.max(1, c.horizonDays));
      var a = c.tb.halfA / h, b = c.tb.halfB / h;
      if (a > ua) { ua = a; ia = k; }
      if (b > ub) { ub = b; ib = k; }
    });
    var optA = valid[ia].tb.halfA - valid[ia].tb.halfB;
    var optB = valid[ib].tb.halfB - valid[ib].tb.halfA;
    return clamp(Math.max(0, (optA + optB) / 2) / Math.SQRT2, 0, 3);
  }

  function optimize(input, overrides, internal) {
    /* Eligibility gate: the technical/base model decides WHETHER to trade; EV
       only optimizes the plan for an already eligible setup. */
    var baseRaw = input && (input.baseDecision || input.baseRating || input.baseSignal || input.rating);
    if (baseRaw && typeof baseRaw === 'object') baseRaw = baseRaw.code || baseRaw.label || baseRaw.rating;
    var baseDecision = String(baseRaw || '').toUpperCase().replace(/[\s-]+/g, '_');

    var eligibility = 'UNSPECIFIED';
    if (baseDecision === 'STRONG_BUY' || baseDecision === 'BUY') eligibility = 'ELIGIBLE';
    else if (baseDecision === 'AVOID' || baseDecision === 'SELL') eligibility = 'EXCLUDED';
    else if (baseDecision) eligibility = 'WATCH_ONLY';

    /* A missing base decision fails closed (diagnostic only). Internal callers that
       deliberately run without a base signal (walk-forward calibration) pass internal.skipGate. */
    var missingBase = eligibility === 'UNSPECIFIED' && !(internal && internal.skipGate);
    if (missingBase) eligibility = 'WATCH_ONLY';

    var cfg = getConfig(overrides);
    var gateOpts = cfg.gate || {};
    var ungated = false;                       // optimized although the base signal would not normally qualify
    if (eligibility === 'EXCLUDED' && gateOpts.includeAvoid) { eligibility = 'ELIGIBLE'; ungated = true; }
    else if (eligibility === 'WATCH_ONLY' && gateOpts.includeWatch) { eligibility = 'ELIGIBLE'; ungated = true; }

    if (eligibility === 'EXCLUDED') {
      return {
        best: null, baseline: null, candidates: [], qualified: [],
        eligibility: eligibility, baseDecision: baseDecision,
        reason: 'Base StoX signal is AVOID; EV trade optimization is excluded.'
      };
    }

    input = input || {};
    var pre = prepare(input, cfg, internal);

    var horizons = (cfg.horizons || []).slice();
    var targets = (cfg.targets || []).slice();
    // The base model is calibrated around a 3% move in 10 trading days: always benchmark it.
    if (horizons.indexOf(10) < 0) horizons.push(10);
    if (targets.indexOf(3) < 0) targets.push(3);
    var gridCfg = { horizons: horizons, targets: targets };

    var modes = (cfg.exitVariants || ['fixed']).filter(function (m) { return m === 'fixed' || m === 'breakeven' || m === 'trail'; });
    if (modes.indexOf('fixed') < 0) modes.unshift('fixed');   // the base plan is always benchmarked

    var cores = [];
    horizons.forEach(function (h) {
      targets.forEach(function (t) {
        modes.forEach(function (mode) {
          var core = corePlan(pre, input, cfg, h, t, internal, mode);
          core.isBaseline = (h === 10 && t === 3 && mode === 'fixed');
          if (core.ev) cores.push(core);
        });
      });
    });

    var haircut = selectionHaircutOf(cores, cfg);

    var results = [];
    cores.forEach(function (core) {
      var r = finalizePlan(core, pre, input, cfg, haircut);
      if (r.expectedValue && r.probability && r.probability.target != null) {
        r.optimizerUtility = optimizerUtility(r, gridCfg);
        r.isBaseModelPlan = !!core.isBaseline;
        r.eligibility = ungated ? 'UNGATED' : eligibility;
        r.optimizerRankMetric = 'evidence-adjusted trust-adjusted net EV per sqrt(day), 3%/10d baseline guard';
        results.push(r);
      }
    });

    results.sort(function (a, b) {
      var au = a.optimizerUtility != null ? a.optimizerUtility : -999999;
      var bu = b.optimizerUtility != null ? b.optimizerUtility : -999999;
      if (bu !== au) return bu - au;
      var ae = Number(a.evidenceConfidence) || 0;
      var be = Number(b.evidenceConfidence) || 0;
      if (be !== ae) return be - ae;
      return (Number(a.horizonDays) || 99) - (Number(b.horizonDays) || 99);
    });

    var baseline = null;
    for (var i = 0; i < results.length; i++) {
      if (results[i].isBaseModelPlan) { baseline = results[i]; break; }
    }

    /* Baseline guard: do not leave the 3%/10d plan for a trivial improvement. */
    var best = results.length ? results[0] : null;
    if (best && baseline && best !== baseline) {
      var bestU = Number(best.optimizerUtility);
      var baseU = Number(baseline.optimizerUtility);
      var requiredImprovement = Math.max(0.03, Math.abs(baseU) * 0.08);
      if (isFinite(bestU) && isFinite(baseU) && bestU < baseU + requiredImprovement) best = baseline;
    }

    if (best) {
      best.baseModelPlan = {
        targetPct: baseline ? baseline.targetPct : 3,
        horizonDays: baseline ? baseline.horizonDays : 10,
        utility: baseline && baseline.optimizerUtility != null ? baseline.optimizerUtility : null,
        netEV: baseline && baseline.expectedValue ? baseline.expectedValue.netPct : null,
        selectedAgainstBaseline: baseline ? best !== baseline : null
      };
    }

    var tradeBest = eligibility === 'WATCH_ONLY' ? null : best;

    return {
      best: tradeBest,
      baseline: baseline,
      candidates: results,
      eligibility: eligibility,
      baseDecision: baseDecision,
      selectionHaircutPct: haircut,
      ungated: ungated,
      reason: eligibility === 'WATCH_ONLY'
        ? (missingBase
            ? 'No base decision supplied (baseDecision / baseRating / baseSignal / rating); EV results are diagnostic only.'
            : 'Base StoX signal is not Buy/Strong Buy; EV results are diagnostic only.')
        : null,
      qualified: results.filter(function (r) {
        return r.decision && (r.decision.code === 'HIGH_CONVICTION' || r.decision.code === 'QUALIFIED_TRADE');
      })
    };
  }

  /* ── Calibration API ─────────────────────────────────────────────────────── */
  function recordOutcomes(rows, key) {
    key = key || DEFAULTS.calibrationKey;
    var all = loadCalibration(key), added = 0;
    (rows || []).forEach(function (row) {
      if (!row || row.horizonDays == null || row.targetPct == null || row.setupScore == null) return;
      var w = row.win != null ? Number(row.win) : (row.hitTarget ? 1 : (row.hitTarget === false ? 0 : NaN));
      if (!isFinite(w)) return;
      var b = calibrationBucket(row.horizonDays, row.targetPct, row.setupScore, row.volClass);
      var cell = all[b] || { n: 0, wins: 0 };
      cell.n++;
      cell.wins += clamp(w, 0, 1);     // fractional when a same-bar tie was split by the open
      if (row.val != null && isFinite(Number(row.val))) {   // value of the plan on the decision basis (pooled prior)
        cell.nv = (cell.nv || 0) + 1;
        cell.sv = (cell.sv || 0) + Number(row.val);
      }
      all[b] = cell;
      added++;
    });
    if (!added) return 0;
    return saveStore(key, all) ? added : 0;
  }
  function recordOutcome(row, key) { return recordOutcomes([row], key) > 0; }

  function clearCalibration(key) {
    key = key || DEFAULTS.calibrationKey;
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(key + '_meta');
      localStorage.removeItem(key + '_rel');
      localStorage.removeItem(key + '_sig');
      return true;
    } catch (e) { return false; }
  }

  /* The pooled EV and the reliability tally depend on the cost/tax model. When
     that model changes, stored values from the old model are wrong, so the whole
     calibration is cleared and rebuilt (win counts alone would be fine, but the
     per-stock progress marker would stop the rest from being re-labeled). */
  function calibrationSignature(cfg) {
    return ['v5', round(totalRoundTripCost(cfg.costs), 4), num(cfg.taxRatePct, 0), num(cfg.taxLossCredit, 0), cfg.decideAfterTax !== false ? 1 : 0].join('|');
  }
  function refreshCalibrationSignature(key, cfg) {
    try {
      var sk = key + '_sig', sig = calibrationSignature(cfg), old = localStorage.getItem(sk);
      if (old === sig) return false;
      var changed = old != null;
      if (changed) clearCalibration(key);
      localStorage.setItem(sk, sig);
      return changed;
    } catch (e) { return false; }
  }
  try { refreshCalibrationSignature(DEFAULTS.calibrationKey, getConfig()); } catch (e) {}

  function calibrationStatus(key) {
    key = key || DEFAULTS.calibrationKey;
    var all = loadCalibration(key), buckets = 0, usable = 0, total = 0;
    Object.keys(all).forEach(function (k) {
      buckets++; total += all[k].n || 0;
      if ((all[k].n || 0) >= 20) usable++;
    });
    var meta = loadStore(key + '_meta');
    return { buckets: buckets, usableBuckets: usable, outcomes: total, symbols: Object.keys(meta).length };
  }

  /* ── Reliability: did the table's EV match what actually happened? ───────
     At each walk-forward start bar the optimizer is run on data up to that bar
     ONLY (own-history model; no calibration or ML, so there is no look-ahead),
     its chosen plan is played out on the bars that followed, and predicted vs
     realized EV (same basis: after-tax or pre-tax) are accumulated. */
  var REL_EDGES = [-0.5, -0.25, 0, 0.25, 0.5];
  function blankAcc() { return { n: 0, sp: 0, sr: 0, spp: 0, spr: 0, srr: 0, sd: 0, sdd: 0, sraw: 0 }; }
  function relBin(p) { var k = 0; while (k < REL_EDGES.length && p >= REL_EDGES[k]) k++; return k; }
  function addAcc(g, pred, raw, real) {
    var d = real - pred;
    g.n++; g.sp += pred; g.sr += real; g.spp += pred * pred; g.spr += pred * real; g.srr += real * real;
    g.sd += d; g.sdd += d * d; g.sraw += raw;
  }
  function recordReliability(rows, key) {
    key = key || DEFAULTS.calibrationKey;
    var rk = key + '_rel';
    var st = loadStore(rk);
    if (!st.all) st.all = blankAcc();
    if (!st.elig) st.elig = blankAcc();
    if (!st.bins) st.bins = { all: [], elig: [] };
    var added = 0;
    (rows || []).forEach(function (r) {
      ['all'].concat(r.elig ? ['elig'] : []).forEach(function (grp) {
        addAcc(st[grp], r.pred, r.raw, r.real);
        var b = relBin(r.pred);
        var cell = st.bins[grp][b] || { n: 0, sp: 0, sr: 0 };
        cell.n++; cell.sp += r.pred; cell.sr += r.real;
        st.bins[grp][b] = cell;
      });
      added++;
    });
    if (added) { st.updated = Date.now(); saveStore(rk, st); }
    return added;
  }
  function summarizeAcc(g) {
    if (!g || !g.n) return { n: 0, verdict: 'collecting' };
    var n = g.n, mp = g.sp / n, mr = g.sr / n, bias = mr - mp;
    var varD = Math.max(0, g.sdd / n - Math.pow(g.sd / n, 2));
    var nEff = n / 4;                                  // weekly starts overlap and stocks move together
    var se = Math.sqrt(varD / Math.max(1, nEff));
    var varP = g.spp / n - mp * mp;
    var slope = varP > 1e-6 ? (g.spr / n - mp * mr) / varP : null;
    var sdPred = Math.sqrt(Math.max(0, varP));
    var z = se > 0 ? bias / se : 0;
    var verdict = n < 100 ? 'collecting' : (z < -2 ? 'overconfident' : (z > 2 ? 'conservative' : 'consistent'));
    // Level is right but the predictions do not rank trades: high-EV picks did not do better than low-EV picks.
    if (verdict === 'consistent' && n >= 300 && sdPred >= 0.2 && slope != null && slope < 0.3) verdict = 'weak-ranking';
    return { n: n, meanPredicted: mp, meanRealized: mr, meanRawPredicted: g.sraw / n, bias: bias, stdErr: se, slope: slope, sdPredicted: sdPred, verdict: verdict };
  }
  var BIN_LABELS = ['< -0.50%', '-0.50% to -0.25%', '-0.25% to 0%', '0% to +0.25%', '+0.25% to +0.50%', '>= +0.50%'];
  function reliabilityCore(key) {
    key = key || DEFAULTS.calibrationKey;
    var st = loadStore(key + '_rel');
    function bins(arr) {
      return (arr || []).map(function (c, k) {
        if (!c || !c.n) return null;
        var mp = c.sp / c.n, mr = c.sr / c.n, gap = mr - mp;
        return {
          bin: k, label: BIN_LABELS[k], n: c.n, meanPredicted: mp, meanRealized: mr, gap: gap,
          verdict: c.n < 30 ? 'collecting' : (gap < -0.15 ? 'optimistic' : (gap > 0.15 ? 'conservative' : 'ok'))
        };
      }).filter(Boolean);
    }
    var be = bins(st.bins && st.bins.elig), ba = bins(st.bins && st.bins.all);
    var useB = be.length && st.elig && st.elig.n >= 100 ? be : ba;
    var top = null;
    useB.forEach(function (b) { if (b.n >= 30 && (!top || b.bin > top.bin)) top = b; });
    return {
      all: summarizeAcc(st.all), elig: summarizeAcc(st.elig),
      binsAll: ba, binsElig: be,
      topBucket: top,                         // highest predicted-EV bucket with enough samples
      updatedAt: st.updated || null,
      ageDays: st.updated ? (Date.now() - st.updated) / 86400000 : null
    };
  }
  function reliabilityStatus(key) {
    var out = reliabilityCore(key);
    out.trust = buildTrust(out, key);
    return out;
  }

  /* ── Does the Buy gate add value? Eligible vs not-eligible setups, same
     optimizer, realized walk-forward on the decision basis. ──────────────── */
  function gateReport(key) {
    key = key || DEFAULTS.calibrationKey;
    var st = loadStore(key + '_rel');
    var A = st.all, E = st.elig;
    if (!A || !E || !A.n) return { verdict: 'collecting', eligible: { n: E ? E.n : 0 }, notEligible: { n: 0 } };
    var N = { n: A.n - E.n, sp: A.sp - E.sp, sr: A.sr - E.sr, srr: A.srr - E.srr };
    function sm(g) {
      if (!g || g.n < 1) return { n: 0 };
      var mr = g.sr / g.n, v = Math.max(0, g.srr / g.n - mr * mr);
      return { n: g.n, meanPredicted: g.sp / g.n, meanRealized: mr, varRealized: v };
    }
    var e = sm(E), nn = sm(N);
    var out = { eligible: e, notEligible: nn, edge: null, z: null, verdict: 'collecting' };
    if (e.n >= 100 && nn.n >= 100) {
      out.edge = e.meanRealized - nn.meanRealized;
      var se = Math.sqrt(e.varRealized / Math.max(1, e.n / 4) + nn.varRealized / Math.max(1, nn.n / 4));
      out.z = se > 0 ? out.edge / se : 0;
      out.verdict = out.z > 2 ? 'gate-adds-value' : (out.z < -2 ? 'gate-hurts' : 'gate-no-better');
    }
    return out;
  }

  /* ── Live tracking: log what the table predicted, settle it later on real bars ─ */
  function liveKey(cfg) { return (cfg.live && cfg.live.key) || 'stox_ev_live_v1'; }
  function loadLive(cfg) { var d = loadStore(liveKey(cfg)); if (!d.records) d.records = []; return d; }

  function recordPrediction(best, opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var daily = opts.dailyCandles || [];
    var symbol = opts.symbol || (best && best.symbol);
    if (!best || !best.expectedValue || !symbol || !daily.length) return false;
    var date = String(daily[daily.length - 1].t).slice(0, 10);
    var id = [symbol, date, best.horizonDays, best.targetPct, best.exitMode || 'fixed'].join('|');
    var st = loadLive(cfg);
    for (var i = 0; i < st.records.length; i++) if (st.records[i].id === id) return false;   // already logged
    st.records.push({
      id: id, symbol: symbol, date: date, h: best.horizonDays, t: best.targetPct, stop: best.stopPct,
      cost: best.costsPct, mode: best.exitMode || 'fixed',
      pred: best.expectedValue.netPct, raw: best.expectedValue.rawBasisPct, pPos: best.expectedValue.pPositive,
      evid: best.evidenceConfidence, score: best.setupQuality, status: 'open', ts: Date.now()
    });
    var max = num(cfg.live && cfg.live.maxRecords, 1500);
    if (st.records.length > max) {
      var open = st.records.filter(function (r) { return r.status === 'open'; });
      var done = st.records.filter(function (r) { return r.status !== 'open'; }).slice(-(max - open.length));
      st.records = done.concat(open);
    }
    return saveStore(liveKey(cfg), st);
  }

  /* Settle every open prediction of one stock using its (fresh) daily candles. */
  function settlePredictions(symbol, dailyCandles, opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var st = loadLive(cfg), daily = dailyCandles || [], settled = 0, changed = false;
    if (!daily.length) return { settled: 0 };
    var byDate = {};
    daily.forEach(function (b, k) { byDate[String(b.t).slice(0, 10)] = k; });
    st.records.forEach(function (rec) {
      if (rec.status !== 'open' || rec.symbol !== symbol) return;
      var i = byDate[rec.date];
      if (i == null) return;
      var complete = i + rec.h <= daily.length - 1;
      var o = windowOutcome(daily, i, rec.h, Math.log(1 + rec.t / 100), Math.log(1 - rec.stop / 100), 0, rec.stop, rec.mode, exitOpts(cfg));
      if (!o) return;
      if (!complete && o.oP > 0) return;                 // neither target nor stop yet and bars remain
      var v = outcomeValues(o, rec.t, rec.cost, cfg);
      rec.real = cfg.decideAfterTax !== false ? v.aft : v.pre;
      rec.outcome = o.tP >= 0.5 ? 'target' : (o.sP >= 0.5 ? 'stop' : 'timeout');
      rec.status = 'settled'; rec.settledAt = Date.now();
      settled++; changed = true;
    });
    if (changed) saveStore(liveKey(cfg), st);
    return { settled: settled };
  }

  function livePerformance(opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var st = loadLive(cfg);
    var done = st.records.filter(function (r) { return r.status === 'settled' && isFinite(r.real); });
    var openN = st.records.length - done.length;
    var out = { open: openN, settled: done.length, verdict: 'collecting', buckets: {} };
    if (!done.length) return out;
    var sp = 0, sr = 0, sd = 0, sdd = 0;
    done.forEach(function (r) { var d = r.real - r.pred; sp += r.pred; sr += r.real; sd += d; sdd += d * d; });
    var n = done.length, bias = (sr - sp) / n;
    var varD = Math.max(0, sdd / n - Math.pow(sd / n, 2));
    var se = Math.sqrt(varD / Math.max(1, n / 2));
    out.meanPredicted = sp / n; out.meanRealized = sr / n; out.bias = bias; out.stdErr = se;
    out.z = se > 0 ? bias / se : 0;
    out.verdict = n < 30 ? 'collecting' : (out.z < -2 ? 'overconfident' : (out.z > 2 ? 'conservative' : 'consistent'));
    [['positiveEV', function (r) { return r.pred > 0; }], ['nonPositiveEV', function (r) { return r.pred <= 0; }]].forEach(function (g) {
      var sub = done.filter(g[1]);
      if (!sub.length) return;
      var mp = 0, mr = 0, hit = 0;
      sub.forEach(function (r) { mp += r.pred; mr += r.real; if (r.real > 0) hit++; });
      out.buckets[g[0]] = { n: sub.length, meanPredicted: mp / sub.length, meanRealized: mr / sub.length, winRate: hit / sub.length };
    });
    return out;
  }
  function clearLive(opts) {
    try { localStorage.removeItem(liveKey(getConfig(opts && opts.config))); return true; } catch (e) { return false; }
  }

  /* ── Trust flag: one place that says whether the EVs on screen can be believed ── */
  function buildTrust(rel, key) {
    var cfg = getConfig(), msgs = [], level = 'ok';
    function raise(l, m) {
      var rank = { ok: 0, collecting: 1, caution: 2, stale: 3 };
      if (rank[l] > rank[level]) level = l;
      msgs.push(m);
    }
    var g = rel.elig && rel.elig.n >= 100 ? rel.elig : rel.all;
    if (!g || !g.n || g.verdict === 'collecting') raise('collecting', 'Walk-forward self-check is still collecting history.');
    else if (g.verdict === 'overconfident') raise('stale', 'Self-check says the EVs have been optimistic (predicted ' + round(g.meanPredicted, 2) + '% vs realized ' + round(g.meanRealized, 2) + '%).');
    else if (g.verdict === 'weak-ranking') raise('caution', 'Levels match, but higher-EV picks have not done better than lower-EV picks.');
    if (rel.topBucket && rel.topBucket.verdict === 'optimistic') raise('caution', 'The top EV bucket (' + rel.topBucket.label + ') realized ' + round(rel.topBucket.gap, 2) + '% vs predicted.');
    if (rel.ageDays != null && rel.ageDays > num(cfg.staleCalibrationDays, 21)) raise('stale', 'Calibration has not been refreshed for ' + Math.round(rel.ageDays) + ' days.');
    var live = livePerformance();
    if (live.settled >= 30 && live.verdict === 'overconfident') raise('stale', 'Live results are below what was predicted (' + round(live.meanRealized, 2) + '% vs ' + round(live.meanPredicted, 2) + '%, n=' + live.settled + ').');
    var gate = gateReport(key);
    if (gate.verdict === 'gate-hurts') raise('caution', 'Setups the Buy filter rejected did better than those it accepted.');
    else if (gate.verdict === 'gate-no-better') raise('caution', 'The Buy filter shows no detectable advantage over rejected setups.');
    return { level: level, messages: msgs };
  }

  /* ── "Is there anything worth trading today?" ─────────────────────────── */
  function rankingVerdict(results, opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var list = (results || []).filter(function (r) { return r && r.expectedValue; });
    var minP = num(cfg.noTrade && cfg.noTrade.minPPositive, 0.5);
    var pos = list.filter(function (r) { return r.expectedValue.netPct > 0 && r.expectedValue.pPositive >= minP; });
    var qual = list.filter(function (r) { return r.decision && (r.decision.code === 'HIGH_CONVICTION' || r.decision.code === 'QUALIFIED_TRADE'); });
    var best = null;
    list.forEach(function (r) { if (!best || r.expectedValue.netPct > best.expectedValue.netPct) best = r; });
    var trust = reliabilityStatus(opts.key).trust;
    var verdict, message;
    if (!list.length) { verdict = 'NO_DATA'; message = 'No setups were evaluated.'; }
    else if (qual.length) { verdict = 'TRADE'; message = qual.length + ' setup(s) pass every EV test.'; }
    else if (pos.length) { verdict = 'WEAK'; message = pos.length + ' setup(s) have positive EV but none pass every test: small size or wait.'; }
    else { verdict = 'NO_TRADE'; message = 'No setup has positive trust-adjusted EV after costs. Best: ' + (best ? best.symbol + ' ' + round(best.expectedValue.netPct, 2) + '%' : 'n/a') + '. Sitting out is the better trade today.'; }
    if (trust.level === 'stale' && verdict !== 'NO_TRADE' && verdict !== 'NO_DATA') { message += ' But the engine\'s self-check is flagged stale: treat EVs with extra caution.'; }
    return {
      verdict: verdict, message: message,
      counts: { ranked: list.length, positiveEV: pos.length, qualified: qual.length },
      bestSymbol: best ? best.symbol : null, bestNetEVPct: best ? best.expectedValue.netPct : null,
      trust: trust
    };
  }

  /* ── Correlation-aware pick list ────────────────────────────────────────── */
  /* Compact {dayOrdinal: logReturn} map (4 decimals) so a row can carry its own
     correlation inputs without storing candles. */
  function retSeries(daily, lookback) {
    var m = {}, n = daily ? daily.length : 0;
    for (var i = Math.max(1, n - lookback); i < n; i++) {
      var a = daily[i - 1].c, b = daily[i].c, o = dayOrdinal(daily[i].t);
      if (a > 0 && b > 0 && o != null) m[o] = Math.round(Math.log(b / a) * 10000) / 10000;
    }
    return m;
  }
  function corrOf(ma, mb, minOverlap) {
    var xs = [], ys = [];
    Object.keys(ma).forEach(function (d) { if (mb[d] != null) { xs.push(ma[d]); ys.push(mb[d]); } });
    var n = xs.length;
    if (n < minOverlap) return null;
    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); syy += (ys[i] - my) * (ys[i] - my); }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function groupOf(symbol, explicit, prefixes) {
    if (explicit) return String(explicit).toUpperCase();
    var u = String(symbol || '').toUpperCase();
    for (var i = 0; i < (prefixes || []).length; i++) if (u.indexOf(prefixes[i]) === 0) return prefixes[i];
    return null;
  }

  /* items: [{ symbol, result (the optimizer's best plan), dailyCandles OR returns (from returnSeries), group? }]
     Returns the items re-ordered so that picks highly correlated with a better
     pick already chosen (or in the same group) are pushed down. */
  function diversify(items, opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config), cc = cfg.correlation || {};
    var pool = (items || []).filter(function (it) { return it && it.result && it.result.expectedValue; }).map(function (it) {
      return {
        symbol: it.symbol || it.result.symbol, result: it.result,
        utility: it.result.optimizerUtility != null ? Number(it.result.optimizerUtility) : Number(it.result.expectedValue.netPct),
        series: it.returns || retSeries(it.dailyCandles, num(cc.lookbackBars, 120)),
        group: groupOf(it.symbol || it.result.symbol, it.group, cc.groupPrefixes)
      };
    });
    var cache = {};
    function corr(a, b) {
      var k = a.symbol < b.symbol ? a.symbol + '|' + b.symbol : b.symbol + '|' + a.symbol;
      if (!(k in cache)) cache[k] = corrOf(a.series, b.series, num(cc.minOverlap, 60));
      return cache[k];
    }
    var chosen = [], out = [], thr = num(cc.threshold, 0.7), pen = num(cc.penalty, 0.5);
    while (pool.length) {
      var bestK = -1, bestAdj = -Infinity, bestInfo = null;
      for (var k = 0; k < pool.length; k++) {
        var it = pool[k], maxC = null, withSym = null, grpCount = 0;
        for (var j = 0; j < chosen.length; j++) {
          var c = corr(it, chosen[j]);
          if (c != null && (maxC == null || c > maxC)) { maxC = c; withSym = chosen[j].symbol; }
          if (it.group && chosen[j].group === it.group) { grpCount++; if (maxC == null || maxC < thr) { maxC = Math.max(maxC == null ? 0 : maxC, thr); withSym = chosen[j].symbol; } }
        }
        var adj = it.utility;
        if (adj > 0 && maxC != null) adj = it.utility * (1 - pen * clamp((maxC - 0.5) / 0.5, 0, 1));
        if (adj > bestAdj) { bestAdj = adj; bestK = k; bestInfo = { maxCorr: maxC, correlatedWith: withSym, groupCount: grpCount }; }
      }
      var pick = pool.splice(bestK, 1)[0];
      var flags = [];
      if (bestInfo.maxCorr != null && bestInfo.maxCorr >= thr) flags.push('highly correlated with ' + bestInfo.correlatedWith + ' (' + round(bestInfo.maxCorr, 2) + ')');
      if (pick.group && bestInfo.groupCount >= num(cc.maxPerGroup, 1)) flags.push('same group as a better pick (' + pick.group + ')');
      var selected = pick.result.expectedValue.netPct > 0 && !flags.length && chosen.filter(function (x) { return x.selected; }).length < num(cc.maxPicks, 5);
      pick.selected = selected;
      chosen.push(pick);
      out.push({
        rank: out.length + 1, symbol: pick.symbol, result: pick.result, utility: pick.utility, adjustedUtility: bestAdj,
        maxCorr: bestInfo.maxCorr, correlatedWith: bestInfo.correlatedWith, group: pick.group, selected: selected, flags: flags
      });
    }
    return out;
  }

  function dayOrdinal(t) {
    var ms = Date.parse(String(t).slice(0, 10));
    return isFinite(ms) ? Math.floor(ms / 86400000) : null;
  }
  function sliceIndexUpTo(indexCandles, dateStr) {
    if (!indexCandles || !indexCandles.length) return [];
    var d = String(dateStr).slice(0, 10), lo = 0, hi = indexCandles.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (String(indexCandles[mid].t).slice(0, 10) <= d) lo = mid + 1; else hi = mid;
    }
    return indexCandles.slice(0, lo);
  }
  function buyThreshold() {
    try {
      var TI = window.TechIndicators;
      var sc = TI && TI.getScoreConfig && TI.getScoreConfig();
      var v = sc && sc.classification && Number(sc.classification.buy);
      if (isFinite(v)) return v;
    } catch (e) {}
    return 60;
  }

  /* Walk-forward calibration + reliability for ONE stock. Idempotent and
     incremental:
       - start bars are the first bar of each calendar week, so re-running never
         re-labels the same window and appended bars never create near-duplicates;
       - per-symbol progress is stored in <key>_meta as { newest, oldest, count };
       - each call processes at most opts.maxSamples new start bars, so the
         caller can yield to the UI between calls.
     Labels use the same window rules as the live model (open-based tie split,
     gap-through stops). Setup = daily-only entry score as of the start bar
     (no look-ahead). opts.reliability === false skips the predicted-vs-realized
     bookkeeping. */
  function calibrateFromHistory(daily, indexCandles, symbol, opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var key = opts.key || cfg.calibrationKey;
    var out = { symbol: symbol, processed: 0, rows: 0, remaining: 0, reason: 'ok' };
    if (refreshCalibrationSignature(key, cfg)) out.reset = 'cost or tax model changed: calibration cleared and rebuilding';
    var TI = window.TechIndicators;
    if (!TI || !TI.computeEntryScore) { out.reason = 'technical_engine_unavailable'; return out; }
    var minStart = opts.minStart || 210;
    if (!daily || daily.length < minStart + 30) { out.reason = 'insufficient_history'; return out; }

    var maxSamples = opts.maxSamples || 6;
    var cap = opts.capPerStock || 60;
    var maxH = Math.max.apply(null, cfg.horizons);
    var lastStart = daily.length - 1 - maxH;

    function weekOf(ord) { return Math.floor((ord + 3) / 7); }
    var eligible = [];   // newest -> oldest
    for (var i = lastStart; i >= minStart; i--) {
      var ord = dayOrdinal(daily[i].t), prev = dayOrdinal(daily[i - 1].t);
      if (ord == null || prev == null) { out.reason = 'bad_dates'; return out; }
      if (weekOf(ord) !== weekOf(prev)) eligible.push(i);
    }

    var metaKey = key + '_meta';
    var metaAll = loadStore(metaKey);
    var meta = metaAll[symbol] || { newest: null, oldest: null, count: 0 };

    var fresh = [], older = [];
    eligible.forEach(function (idx) {
      var dt = String(daily[idx].t).slice(0, 10);
      if (meta.newest == null) older.push(idx);
      else if (dt > meta.newest) fresh.push(idx);
      else if (dt < meta.oldest) older.push(idx);
    });
    fresh.reverse();                      // oldest-of-the-new first keeps the done-range contiguous
    var todo = fresh.concat(meta.count < cap ? older.slice(0, Math.max(0, cap - meta.count)) : []);
    out.remaining = Math.max(0, todo.length - maxSamples);
    todo = todo.slice(0, maxSamples);
    if (!todo.length) { out.reason = 'up_to_date'; return out; }

    var doRel = opts.reliability !== false;
    var buyTh = buyThreshold();
    var costPct = totalRoundTripCost(cfg.costs);
    var rows = [], relRows = [];
    todo.forEach(function (idx) {
      var date = String(daily[idx].t).slice(0, 10);
      var slice = daily.slice(0, idx + 1);
      var idxSlice = sliceIndexUpTo(indexCandles, date);
      var r;
      try { r = TI.computeEntryScore(slice, idxSlice, symbol, null); } catch (e) { r = null; }
      var atrPct = atrPctOf(slice);
      var stopPct = stopFromAtr(atrPct, cfg);
      var vc = volClassOf(atrPct);
      if (r && r.entry_score != null) {
        var score = clamp(Number(r.entry_score), 0, 99.9);
        /* Pooled-EV values drop part of the stock's PRIOR drift exactly as the live
           model does (past data only), so a bull market is not mistaken for an edge. */
        var mu = 0, mc = 0;
        for (var q = Math.max(1, idx - cfg.lookbackBars + 1); q <= idx; q++) {
          if (daily[q - 1].c > 0 && daily[q].c > 0) { mu += Math.log(daily[q].c / daily[q - 1].c); mc++; }
        }
        var removedC = (1 - clamp(num(cfg.driftKeep, 0.5), 0, 1)) * (mc ? mu / mc : 0);
        cfg.horizons.forEach(function (h) {
          cfg.targets.forEach(function (t) {
            /* win and val are both DETRENDED, matching the live model's tb.pTarget. */
            var oV = windowOutcome(daily, idx, h, Math.log(1 + t / 100), Math.log(1 - stopPct / 100), removedC, stopPct);
            if (!oV) return;
            var ov = outcomeValues(oV, t, costPct, cfg);
            rows.push({ horizonDays: h, targetPct: t, setupScore: score, volClass: vc, win: oV.tP, val: cfg.decideAfterTax !== false ? ov.aft : ov.pre });
          });
        });
        if (doRel) {
          try {
            var res = optimize({ symbol: symbol, dailyCandles: slice, hourlyCandles: [], indexCandles: idxSlice }, opts.config, { setupScoreOverride: score, noHist: true, skipGate: true });
            var b = res && res.best;
            if (b && b.expectedValue) {
              var o2 = windowOutcome(daily, idx, b.horizonDays, Math.log(1 + b.targetPct / 100), Math.log(1 - b.stopPct / 100), 0, b.stopPct, b.exitMode, exitOpts(cfg));
              if (o2) {
                var rv = outcomeValues(o2, b.targetPct, b.costsPct != null ? b.costsPct : costPct, cfg);
                relRows.push({
                  pred: b.expectedValue.netPct, raw: b.expectedValue.rawBasisPct,
                  real: cfg.decideAfterTax !== false ? rv.aft : rv.pre,
                  elig: score >= buyTh
                });
              }
            }
          } catch (e) {}
        }
      }
      if (meta.newest == null || date > meta.newest) meta.newest = date;
      if (meta.oldest == null || date < meta.oldest) meta.oldest = date;
      meta.count++;
      out.processed++;
    });
    out.rows = recordOutcomes(rows, key);
    if (relRows.length) recordReliability(relRows, key);
    metaAll[symbol] = meta;
    saveStore(metaKey, metaAll);
    return out;
  }

  return {
    version: VERSION,
    getConfig: function () { return getConfig(); },
    totalRoundTripCost: totalRoundTripCost,
    analyze: analyze,
    optimize: optimize,
    recordOutcome: recordOutcome,
    recordOutcomes: recordOutcomes,
    calibrateFromHistory: calibrateFromHistory,
    calibrationStatus: calibrationStatus,
    reliabilityStatus: reliabilityStatus,
    gateReport: gateReport,
    recordPrediction: recordPrediction,
    settlePredictions: settlePredictions,
    livePerformance: livePerformance,
    clearLive: clearLive,
    rankingVerdict: rankingVerdict,
    diversify: diversify,
    upsideProfile: upsideProfile,
    upsideEstimate: upsideEstimate,
    upsideBaseline: upsideBaseline,
    returnSeries: function (daily, lookback) { return retSeries(daily, lookback || 90); },
    clearCalibration: clearCalibration,
    _test: { windowOutcome: windowOutcome, buildWindowWeights: buildWindowWeights, computeSizing: computeSizing, breakEvenTargetProb: breakEvenTargetProb, liquidityCostPct: liquidityCostPct, afterTax: afterTax, outcomeValues: outcomeValues, Phi: Phi, tripleBarrierWindows: tripleBarrierWindows }
  };
})();
