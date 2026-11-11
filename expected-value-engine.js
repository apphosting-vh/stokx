/* ══════════════════════════════════════════════════════════════════════
   StoX Expected Value & Probability-Calibrated Trade Engine
   Version 3.0  (EV_V3_ENGINE)

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

   Earlier (v2): first-passage outcome model, corrected costs, probTouch percent
   fix, evidence reflects measured sample, shared per-stock setup computation,
   idempotent walk-forward calibration.

   This module deliberately does NOT replace the existing technical engine.
   It consumes existing StoX calculations and separates descriptive scoring
   from predictive probability and economic expectancy.
   ══════════════════════════════════════════════════════════════════════ */
window.ExpectedValueEngine = (function () {
  'use strict';

  var VERSION = 'EV-3.0';

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
      slippage: 0.10,
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
    calibrationKey: 'stox_ev_calibration_v3'
  };

  /* v2 stored calibration with a different label rule; it is not comparable. */
  try {
    localStorage.removeItem('stox_ev_calibration_v2');
    localStorage.removeItem('stox_ev_calibration_v2_meta');
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
  function windowOutcome(daily, i, horizon, up, dn, removed, stopPct) {
    var base = daily[i].c;
    if (!(base > 0)) return null;
    for (var j = 1; j <= horizon; j++) {
      var bar = daily[i + j];
      if (!bar || !(bar.h > 0) || !(bar.l > 0)) continue;
      var adj = removed * j;
      var hitS = Math.log(bar.l / base) - adj <= dn;
      var hitT = Math.log(bar.h / base) - adj >= up;
      if (!hitS && !hitT) continue;
      var gapRet = -stopPct;
      if (bar.o > 0) {
        var oRet = (bar.o / base - 1) * 100;
        if (oRet < gapRet) gapRet = oRet;
      }
      if (hitS && hitT) {
        var share = 0.5;
        if (bar.o > 0) {
          var oL = Math.log(bar.o / base) - adj;
          if (oL >= up) share = 1; else if (oL <= dn) share = 0; else share = (oL - dn) / (up - dn);
        }
        return { tP: share, sP: 1 - share, oP: 0, x: 0, sRet: gapRet };
      }
      if (hitT) return { tP: 1, sP: 0, oP: 0, x: 0, sRet: -stopPct };
      return { tP: 0, sP: 1, oP: 0, x: 0, sRet: gapRet };
    }
    var endBar = daily[i + horizon];
    var endC = endBar ? endBar.c : 0;
    var x = endC > 0 ? (Math.exp(Math.log(endC / base) - removed * horizon) - 1) * 100 : 0;
    return { tP: 0, sP: 0, oP: 1, x: x, sRet: -stopPct };
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

  /* ── Triple-barrier study on the stock's own history ─────────────────────
     Every historical start bar is walked forward "horizon" bars (see
     windowOutcome). The stock's own average daily log-drift is partly removed
     (1 - driftKeep) from every path so a prior rally is not mistaken for an edge.
     Per-window after-cost (and after-tax) values give the EV, its standard
     error, and the older-half / newer-half means used for the selection test. */
  function tripleBarrierWindows(daily, horizon, targetPct, stopPct, cfg, costPct) {
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

    var useAft = cfg.decideAfterTax !== false;
    var vals = [];
    var sT = 0, sS = 0, sO = 0, sRetW = 0, sAfS = 0, sX = 0, sAfO = 0, nPosO = 0;
    for (var i = firstStart; i <= lastStart; i++) {
      var o = windowOutcome(daily, i, horizon, up, dn, removed, stopPct);
      if (!o) continue;
      var v = outcomeValues(o, targetPct, costPct, cfg);
      vals.push(useAft ? v.aft : v.pre);
      sT += o.tP; sS += o.sP; sO += o.oP;
      sRetW += o.sP * o.sRet; sAfS += o.sP * v.afS;
      sX += o.oP * o.x; sAfO += o.oP * v.afO;
      if (o.oP > 0 && o.x - costPct > 0) nPosO += o.oP;
    }
    var m = vals.length;
    if (m < cfg.minWindows) return null;

    var mean = 0, i2;
    for (i2 = 0; i2 < m; i2++) mean += vals[i2];
    mean /= m;
    var ss = 0;
    for (i2 = 0; i2 < m; i2++) ss += (vals[i2] - mean) * (vals[i2] - mean);
    var sd = Math.sqrt(ss / Math.max(1, m - 1));
    var nEff = m / Math.max(1, horizon);          // overlapping windows are not independent
    var half = Math.floor(m / 2), hA = 0, hB = 0;
    for (i2 = 0; i2 < half; i2++) hA += vals[i2];
    for (i2 = half; i2 < m; i2++) hB += vals[i2];

    return {
      pTarget: sT / m, pStop: sS / m, pTimeout: sO / m,
      meanStopRet: sS > 0 ? sRetW / sS : -stopPct,
      meanAfStop: sS > 0 ? sAfS / sS : afterTax(-stopPct - costPct, cfg),
      meanTimeoutRet: sO > 0 ? sX / sO : 0,
      meanAfTimeout: sO > 0 ? sAfO / sO : 0,
      timeoutPosShare: sO > 0 ? nPosO / sO : 0.5,
      n: m, nEff: nEff,
      empEV: mean,
      stdErr: sd / Math.sqrt(Math.max(1, nEff)),
      halfA: half > 0 ? hA / half : null,
      halfB: m - half > 0 ? hB / (m - half) : null,
      driftPerDayPct: mu * 100,
      removedDriftPerDayPct: removed * 100
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

    return {
      setup: setup,
      setupCalScore: setupCalScore,
      scoreGap: gap,
      gapFactor: gapFactor,
      atrPct: atrPct,
      stopPct: stopFromAtr(atrPct, cfg),
      volClass: volClassOf(atrPct),
      dataCompleteness: dataCompleteness,
      costs: totalRoundTripCost(cfg.costs)
    };
  }

  /* ── Stage 1: everything about one plan that is independent of selection ── */
  function corePlan(pre, input, cfg, horizon, targetPct, internal) {
    var daily = input.dailyCandles || [];
    var hourly = input.hourlyCandles || [];
    var indexCandles = input.indexCandles || [];
    var noHist = !!(internal && internal.noHist);

    var tb = tripleBarrierWindows(daily, horizon, targetPct, pre.stopPct, cfg, pre.costs);
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
      horizonDays: horizon, targetPct: targetPct, tb: tb, touch: touch, hist: hist, ml: ml,
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
      var shrunk = m0 + lam * (corrected - m0);
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
        priorMeanPct: m0,
        shrunkPct: shrunk,
        stdErrPct: s,
        postSdPct: postSd,
        pPositive: clamp(Phi(shrunk / postSd), 0, 1),   // P(true EV > 0)
        netPct: shrunk                      // PRIMARY: trust-adjusted EV on the decision basis
      };
    }

    var decision = classify(ev ? ev.netPct : null, ev ? ev.pPositive : null, core.pReturnPositive, evidence, setup.score, cfg);

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
      explanation: buildExplanation(setup, probability, ev, evidence, decision, tb, pre)
    };
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

    if (eligibility === 'EXCLUDED') {
      return {
        best: null, baseline: null, candidates: [], qualified: [],
        eligibility: eligibility, baseDecision: baseDecision,
        reason: 'Base StoX signal is AVOID; EV trade optimization is excluded.'
      };
    }

    var cfg = getConfig(overrides);
    input = input || {};
    var pre = prepare(input, cfg, internal);

    var horizons = (cfg.horizons || []).slice();
    var targets = (cfg.targets || []).slice();
    // The base model is calibrated around a 3% move in 10 trading days: always benchmark it.
    if (horizons.indexOf(10) < 0) horizons.push(10);
    if (targets.indexOf(3) < 0) targets.push(3);
    var gridCfg = { horizons: horizons, targets: targets };

    var cores = [];
    horizons.forEach(function (h) {
      targets.forEach(function (t) {
        var core = corePlan(pre, input, cfg, h, t, internal);
        core.isBaseline = (h === 10 && t === 3);
        if (core.ev) cores.push(core);
      });
    });

    var haircut = selectionHaircutOf(cores, cfg);

    var results = [];
    cores.forEach(function (core) {
      var r = finalizePlan(core, pre, input, cfg, haircut);
      if (r.expectedValue && r.probability && r.probability.target != null) {
        r.optimizerUtility = optimizerUtility(r, gridCfg);
        r.isBaseModelPlan = !!core.isBaseline;
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
      reason: eligibility === 'WATCH_ONLY'
        ? 'Base StoX signal is not Buy/Strong Buy; EV results are diagnostic only.'
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
      return true;
    } catch (e) { return false; }
  }

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
    if (added) saveStore(rk, st);
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
  function reliabilityStatus(key) {
    key = key || DEFAULTS.calibrationKey;
    var st = loadStore(key + '_rel');
    function bins(arr) {
      return (arr || []).map(function (c, k) {
        return c && c.n ? { bin: k, n: c.n, meanPredicted: c.sp / c.n, meanRealized: c.sr / c.n } : null;
      }).filter(Boolean);
    }
    return {
      all: summarizeAcc(st.all), elig: summarizeAcc(st.elig),
      binsAll: bins(st.bins && st.bins.all), binsElig: bins(st.bins && st.bins.elig)
    };
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
        cfg.horizons.forEach(function (h) {
          cfg.targets.forEach(function (t) {
            var o = windowOutcome(daily, idx, h, Math.log(1 + t / 100), Math.log(1 - stopPct / 100), 0, stopPct);
            if (!o) return;
            rows.push({ horizonDays: h, targetPct: t, setupScore: score, volClass: vc, win: o.tP });
          });
        });
        if (doRel) {
          try {
            var res = optimize({ symbol: symbol, dailyCandles: slice, hourlyCandles: [], indexCandles: idxSlice }, opts.config, { setupScoreOverride: score, noHist: true });
            var b = res && res.best;
            if (b && b.expectedValue) {
              var o2 = windowOutcome(daily, idx, b.horizonDays, Math.log(1 + b.targetPct / 100), Math.log(1 - b.stopPct / 100), 0, b.stopPct);
              if (o2) {
                var rv = outcomeValues(o2, b.targetPct, costPct, cfg);
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
    clearCalibration: clearCalibration,
    _test: { windowOutcome: windowOutcome, afterTax: afterTax, outcomeValues: outcomeValues, Phi: Phi, tripleBarrierWindows: tripleBarrierWindows }
  };
})();
