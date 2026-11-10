/* ══════════════════════════════════════════════════════════════════════
   StoX Expected Value & Probability-Calibrated Trade Engine
   Version 2.0  (EV_V2_ENGINE)

   Decision hierarchy:
     Setup Quality -> Calibrated Probability -> Outcome Distribution
     -> Net Expected Value -> Evidence Confidence -> Trade Decision

   v2 changes vs v1.0
     1. Outcome distribution is MEASURED with a triple-barrier first-passage
        study on the stock's own daily history (target first / stop first /
        timeout), instead of "touch probability" + an invented stop share.
        The stock's own historical drift is shrunk (cfg.driftKeep) so a stock
        that merely rallied for two years does not look like it has an edge.
     2. Round-trip cost model uses current Indian delivery-trade charges
        (STT 0.1% per side, GST 18% of brokerage+exchange+SEBI, etc.).
     3. TechIndicators probTouch is a PERCENT; always divided by 100 (v1
        mistook any value <= 1% for a probability >= 80%).
     4. Evidence confidence credits the measured sample behind the estimate
        (own-history windows, capped) and calibration history separately.
        HIGH CONVICTION still requires calibration or multi-model agreement.
     5. Optimizer utility is evidence-adjusted net EV per sqrt(day). The v1
        additive probability / setup terms and the large boundary penalty
        (which compensated for the v1 EV bias) are gone.
     6. Setup score / ATR / stop are computed ONCE per stock, not once per
        candidate plan (26x fewer computeEntryScore calls).
     7. calibrateFromHistory(): walk-forward, idempotent outcome recorder that
        fills the calibration store so the historical probability and the
        evidence score can become real.

   This module deliberately does NOT replace the existing technical engine.
   It consumes existing StoX calculations and separates descriptive scoring
   from predictive probability and economic expectancy.
   ══════════════════════════════════════════════════════════════════════ */
window.ExpectedValueEngine = (function () {
  'use strict';

  var VERSION = 'EV-2.0';

  var DEFAULTS = {
    horizons: [3, 5, 10, 15, 20],
    targets: [2, 3, 4, 5, 6],
    defaultHorizon: 10,
    defaultTargetPct: 4,
    minNetEV: 0.30,
    minPositiveProbability: 0.55,
    minEvidence: 60,
    blend: { statistical: 0.55, historical: 0.25, ml: 0.20 },
    /* All values are PERCENT of traded value.
       brokerage, exchange, sebi, slippage are PER SIDE; stt is ROUND TRIP
       (0.1% on buy + 0.1% on sell for delivery); stampDuty is on the buy side
       only; gst is a FRACTION applied to (brokerage + exchange + SEBI).
       Set costs.brokerage = 0 if your broker charges no delivery brokerage.
       Override at runtime with window.STOX_EV_CONFIG = { costs: { ... } }. */
    costs: {
      brokerage: 0.06,
      stt: 0.20,
      exchange: 0.00297,
      sebi: 0.0001,
      gst: 0.18,
      stampDuty: 0.015,
      slippage: 0.10
    },
    stopATR: 1.8,
    maxStopPct: 6.0,
    minStopPct: 1.5,
    /* Triple-barrier study */
    lookbackBars: 500,      // trailing daily bars used for historical windows
    minWindows: 30,         // fewer windows than this => no EV (insufficient history)
    driftKeep: 0.5,         // share of the stock's OWN historical drift retained (0 = driftless, 1 = raw history)
    calibrationKey: 'stox_ev_calibration_v2'
  };

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
    var gst = (broker + exch + sebi) * num(c.gst, 0);   // GST never applies to STT or stamp duty
    return broker + exch + sebi + gst + num(c.stt, 0) + num(c.stampDuty, 0) + num(c.slippage, 0) * 2;
  }

  /* ── Setup quality (descriptive; NOT a probability) ─────────────────── */
  function setupQuality(daily, indexCandles, symbol, hourly) {
    var TI = window.TechIndicators;
    if (!TI || !TI.computeEntryScore) return { score: null, components: {}, reason: 'technical_engine_unavailable' };
    var r;
    try { r = TI.computeEntryScore(daily, indexCandles, symbol, hourly); }
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

  /* ── Triple-barrier first-passage study on the stock's own history ───────
     For every historical start bar (close = entry) we walk forward "horizon"
     daily bars and record which happens FIRST:
        target   : high reaches +targetPct
        stop     : low reaches -stopPct          (same-bar tie => stop, conservative)
        timeout  : neither; the terminal return is kept
     The stock's own average daily log-drift is partly removed (1 - driftKeep)
     from every path so that a prior rally is not mistaken for an edge. */
  function tripleBarrier(daily, horizon, targetPct, stopPct, cfg) {
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

    var nT = 0, nS = 0, nO = 0, toSum = 0, toPos = 0, toCnt = 0, total = 0;
    for (var i = firstStart; i <= lastStart; i++) {
      var base = daily[i].c;
      if (!(base > 0)) continue;
      var res = 0;
      for (var j = 1; j <= horizon; j++) {
        var bar = daily[i + j];
        if (!bar || !(bar.h > 0) || !(bar.l > 0)) continue;
        var adj = removed * j;
        if (Math.log(bar.l / base) - adj <= dn) { res = -1; break; }
        if (Math.log(bar.h / base) - adj >= up) { res = 1; break; }
      }
      total++;
      if (res === 1) nT++;
      else if (res === -1) nS++;
      else {
        nO++;
        var endC = daily[i + horizon].c;
        if (endC > 0) {
          var x = (Math.exp(Math.log(endC / base) - removed * horizon) - 1) * 100;
          toSum += x; toCnt++;
          if (x > 0) toPos++;
        }
      }
    }
    if (total < cfg.minWindows) return null;
    var d = total + 3; // Dirichlet(1,1,1) smoothing so no outcome is ever exactly 0 or 1
    return {
      pTarget: (nT + 1) / d,
      pStop: (nS + 1) / d,
      pTimeout: (nO + 1) / d,
      timeoutMeanPct: toCnt ? toSum / toCnt : 0,
      timeoutPosShare: toCnt ? toPos / toCnt : 0.5,
      n: total,
      nEff: total / Math.max(1, horizon),     // overlapping windows are not independent
      driftPerDayPct: mu * 100,
      removedDriftPerDayPct: removed * 100
    };
  }

  /* Single forward window on RAW candles (no detrending) for calibration labels. */
  function firstPassage(daily, i, horizon, targetPct, stopPct) {
    var base = daily[i].c;
    if (!(base > 0)) return null;
    var up = Math.log(1 + targetPct / 100), dn = Math.log(1 - stopPct / 100);
    for (var j = 1; j <= horizon; j++) {
      var bar = daily[i + j];
      if (!bar || !(bar.h > 0) || !(bar.l > 0)) return null;
      if (Math.log(bar.l / base) <= dn) return -1;
      if (Math.log(bar.h / base) >= up) return 1;
    }
    return 0;
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

  function blendProbability(parts, cfg) {
    var weights = cfg.blend;
    var available = [];
    if (parts.statistical && parts.statistical.p != null) available.push({ k: 'statistical', p: parts.statistical.p, w: weights.statistical });
    if (parts.historical && parts.historical.p != null) available.push({ k: 'historical', p: parts.historical.p, w: weights.historical });
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

  /* Outcome distribution: the blended target-first probability sets P(target);
     the remaining probability mass keeps the MEASURED stop/timeout split. */
  function outcomeDistribution(pTarget, tb, targetPct, stopPct) {
    var rest = 1 - pTarget;
    var stopShare = tb.pStop / (tb.pStop + tb.pTimeout);
    var pStop = rest * stopShare;
    var pTimeout = rest - pStop;
    return {
      pTarget: pTarget,
      pStop: pStop,
      pTimeout: pTimeout,
      targetReturnPct: targetPct,
      stopReturnPct: -stopPct,
      timeoutReturnPct: tb.timeoutMeanPct
    };
  }

  function expectedValue(dist, costsPct) {
    var gross =
      dist.pTarget * dist.targetReturnPct +
      dist.pStop * dist.stopReturnPct +
      dist.pTimeout * dist.timeoutReturnPct;
    return {
      grossPct: gross,
      costPct: costsPct,
      netPct: gross - costsPct
    };
  }

  /* Evidence confidence, 0-100.
       own-history windows   0-12  (how well the stock's base rate is measured)
       calibration history   0-18  (does this setup bucket actually win?)
       data completeness     0-15
       model agreement       0-15
       model count           0-15
       setup stability       0-10
       regime alignment      0-15
     Without calibration or a second model the ceiling is 67, so QUALIFIED is
     reachable but HIGH CONVICTION (>= 75) is not. */
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

  function classify(netEV, pPositive, evidence, setupScore, cfg) {
    if (netEV == null || evidence < 45) return { code: 'INSUFFICIENT_EVIDENCE', label: 'WATCH', color: 'neutral' };
    if (netEV <= 0) return { code: 'NEGATIVE_EV', label: 'AVOID', color: 'loss' };
    if (netEV >= 0.75 && pPositive >= 0.62 && evidence >= 75 && (setupScore || 0) >= 60)
      return { code: 'HIGH_CONVICTION', label: 'HIGH CONVICTION', color: 'profit' };
    if (netEV >= cfg.minNetEV && pPositive >= cfg.minPositiveProbability && evidence >= cfg.minEvidence)
      return { code: 'QUALIFIED_TRADE', label: 'QUALIFIED TRADE', color: 'profit' };
    return { code: 'WATCH', label: 'WATCH', color: 'warn' };
  }

  /* ── Per-stock work that does NOT depend on the (horizon, target) plan ──── */
  function prepare(input, cfg) {
    var daily = input.dailyCandles || [];
    var hourly = input.hourlyCandles || [];
    var indexCandles = input.indexCandles || [];
    var symbol = input.symbol || '';

    var setup = setupQuality(daily, indexCandles, symbol, hourly);
    // Calibration buckets use the DAILY-ONLY score so that live analysis and
    // historical (walk-forward) labelling use exactly the same definition.
    var setupCalScore = null;
    var TI = window.TechIndicators;
    try {
      var rc = TI && TI.computeEntryScore ? TI.computeEntryScore(daily, indexCandles, symbol, null) : null;
      if (rc && rc.entry_score != null) setupCalScore = clamp(Number(rc.entry_score), 0, 100);
    } catch (e) {}
    if (setupCalScore == null) setupCalScore = setup.score;

    var atrPct = atrPctOf(daily);
    var dataCompleteness =
      (daily.length >= 50 ? 0.45 : Math.min(daily.length / 50, 0.45)) +
      (hourly.length >= 60 ? 0.35 : Math.min(hourly.length / 60, 0.35)) +
      (indexCandles.length >= 30 ? 0.20 : Math.min(indexCandles.length / 30, 0.20));

    return {
      setup: setup,
      setupCalScore: setupCalScore,
      atrPct: atrPct,
      stopPct: stopFromAtr(atrPct, cfg),
      volClass: volClassOf(atrPct),
      dataCompleteness: dataCompleteness,
      costs: totalRoundTripCost(cfg.costs)
    };
  }

  function analyzePlan(pre, input, cfg, horizon, targetPct) {
    var daily = input.dailyCandles || [];
    var hourly = input.hourlyCandles || [];
    var indexCandles = input.indexCandles || [];
    var setup = pre.setup;

    var tb = tripleBarrier(daily, horizon, targetPct, pre.stopPct, cfg);
    var touch = statisticalTouch(hourly, daily, indexCandles, horizon, targetPct);
    var hist = historicalProbability(horizon, targetPct, pre.setupCalScore, pre.volClass, cfg.calibrationKey);
    var ml = mlProbability({
      symbol: input.symbol,
      dailyCandles: daily,
      hourlyCandles: hourly,
      indexCandles: indexCandles,
      setup: setup,
      horizonDays: horizon,
      targetPct: targetPct
    });

    var probability = blendProbability({
      statistical: tb ? { p: clamp(tb.pTarget, 0.01, 0.99) } : null,
      historical: hist,
      ml: ml
    }, cfg);

    var dist = (tb && probability.p != null) ? outcomeDistribution(probability.p, tb, targetPct, pre.stopPct) : null;
    var ev = dist ? expectedValue(dist, pre.costs) : null;
    if (ev && tb) {
      // Sampling uncertainty of the EV estimate (overlapping windows => use nEff).
      var m2 = dist.pTarget * Math.pow(dist.targetReturnPct, 2) + dist.pStop * Math.pow(dist.stopReturnPct, 2) +
               dist.pTimeout * Math.pow(dist.timeoutReturnPct, 2);
      ev.stdErrPct = Math.sqrt(Math.max(0, m2 - ev.grossPct * ev.grossPct)) / Math.sqrt(Math.max(1, tb.nEff));
    }

    var evidence = evidenceConfidence({
      ownN: tb ? tb.nEff : 0,
      historicalN: hist ? hist.n : 0,
      dataCompleteness: pre.dataCompleteness,
      contributors: probability.contributors,
      disagreement: probability.disagreement,
      setupScore: setup.score,
      regimeScore: setup.components && setup.components.regime,
      regimeMax: setup.components && setup.components.regimeMax
    });

    var pPositive = dist ? clamp(dist.pTarget + dist.pTimeout * tb.timeoutPosShare, 0, 1) : null;
    var decision = classify(ev ? ev.netPct : null, pPositive, evidence, setup.score, cfg);

    return {
      version: VERSION,
      symbol: input.symbol || '',
      horizonDays: horizon,
      targetPct: targetPct,
      setupQuality: setup.score,
      setup: setup,
      probability: {
        target: probability.p,              // blended TARGET-FIRST probability
        touch: touch ? touch.p : null,      // legacy "touch at any time" (informational)
        positiveReturn: pPositive,
        contributors: probability.contributors,
        disagreement: probability.disagreement,
        statistical: tb ? tb.pTarget : null,
        historical: hist ? hist.p : null,
        historicalN: hist ? hist.n : 0,
        ml: ml
      },
      windows: tb ? {
        n: tb.n, nEff: round(tb.nEff, 1),
        ownDriftPerDayPct: round(tb.driftPerDayPct, 3),
        removedDriftPerDayPct: round(tb.removedDriftPerDayPct, 3)
      } : null,
      distribution: dist,
      stopPct: pre.stopPct,
      atrPct: pre.atrPct,
      volClass: pre.volClass,
      costsPct: pre.costs,
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
    return analyzePlan(pre, input, cfg, horizon, targetPct);
  }

  function buildExplanation(setup, probability, ev, evidence, decision, tb, pre) {
    var items = [];
    if (setup.score != null) items.push('Setup quality ' + round(setup.score, 0) + '/100');
    if (probability.p != null) items.push('target-first probability ' + pct(probability.p) + '%');
    if (tb) items.push('measured on ' + tb.n + ' historical windows (~' + round(tb.nEff, 0) + ' independent)');
    if (pre && pre.stopPct != null) items.push('stop ' + round(pre.stopPct, 1) + '% (' + round(pre.stopPct / Math.max(0.01, pre.atrPct || pre.stopPct), 1) + ' ATR-equivalent)');
    if (ev) items.push('net expected value ' + (ev.netPct >= 0 ? '+' : '') + round(ev.netPct, 2) + '% (+/- ' + round(ev.stdErrPct || 0, 2) + '% sampling error) after ' + round(ev.costPct, 2) + '% modeled costs');
    items.push('evidence confidence ' + round(evidence, 0) + '/100');
    if (probability.contributors < 2) items.push('limited model triangulation (no calibration history yet)');
    if (decision.code === 'INSUFFICIENT_EVIDENCE') items.push('do not treat probability as trade-ready');
    return items;
  }

  /* ── Optimizer ───────────────────────────────────────────────────────────
     Utility = evidence-adjusted net EV per sqrt(day). Positive EV is scaled
     by an evidence factor; negative EV is left unscaled so low evidence can
     never make a losing plan look better. A small penalty discourages
     choosing the extreme edge of the search grid (extrapolation). */
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

  function optimize(input, overrides) {
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
    var pre = prepare(input || {}, cfg);
    var results = [];
    var seen = {};

    var horizons = (cfg.horizons || []).slice();
    var targets = (cfg.targets || []).slice();
    // The base model is calibrated around a 3% move in 10 trading days: always benchmark it.
    if (horizons.indexOf(10) < 0) horizons.push(10);
    if (targets.indexOf(3) < 0) targets.push(3);
    var gridCfg = { horizons: horizons, targets: targets };

    function addCandidate(h, t, isBaseline) {
      var key = h + '|' + t;
      if (seen[key]) return;
      seen[key] = true;
      var r = analyzePlan(pre, input || {}, cfg, h, t);
      if (r.expectedValue && r.probability && r.probability.target != null) {
        r.optimizerUtility = optimizerUtility(r, gridCfg);
        r.isBaseModelPlan = !!isBaseline;
        r.optimizerRankMetric = 'evidence-adjusted net EV per sqrt(day), 3%/10d baseline guard';
        results.push(r);
      }
    }

    horizons.forEach(function (h) {
      targets.forEach(function (t) { addCandidate(h, t, h === 10 && t === 3); });
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
      if (!row || row.horizonDays == null || row.targetPct == null || row.setupScore == null || row.hitTarget == null) return;
      var b = calibrationBucket(row.horizonDays, row.targetPct, row.setupScore, row.volClass);
      var cell = all[b] || { n: 0, wins: 0 };
      cell.n++;
      if (row.hitTarget) cell.wins++;
      all[b] = cell;
      added++;
    });
    if (!added) return 0;
    return saveStore(key, all) ? added : 0;
  }
  function recordOutcome(row, key) { return recordOutcomes([row], key) > 0; }

  function clearCalibration(key) {
    key = key || DEFAULTS.calibrationKey;
    try { localStorage.removeItem(key); localStorage.removeItem(key + '_meta'); return true; } catch (e) { return false; }
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

  /* Walk-forward calibration for ONE stock. Idempotent and incremental:
       - start bars are the first bar of each calendar week, so re-running never
         re-labels the same window and appended bars never create near-duplicates;
       - per-symbol progress is stored in <key>_meta as { newest, oldest, count };
       - each call processes at most opts.maxSamples new start bars, so the
         caller can yield to the UI between calls.
     Labels: target FIRST within horizon, stop = 1.8 ATR as of the start bar
     (same-bar tie counts as stop). Setup = daily-only entry score as of the
     start bar (no look-ahead). */
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

    // Start bars = the first bar of each calendar week (Monday-based). The rule
    // depends only on a bar and its predecessor, so appending new bars never
    // changes which earlier bars qualify, whatever the holiday calendar.
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

    var rows = [];
    todo.forEach(function (idx) {
      var date = String(daily[idx].t).slice(0, 10);
      var slice = daily.slice(0, idx + 1);
      var r;
      try { r = TI.computeEntryScore(slice, sliceIndexUpTo(indexCandles, date), symbol, null); } catch (e) { r = null; }
      var atrPct = atrPctOf(slice);
      var stopPct = stopFromAtr(atrPct, cfg);
      var vc = volClassOf(atrPct);
      if (r && r.entry_score != null) {
        cfg.horizons.forEach(function (h) {
          cfg.targets.forEach(function (t) {
            var res = firstPassage(daily, idx, h, t, stopPct);
            if (res === null) return;
            rows.push({ horizonDays: h, targetPct: t, setupScore: clamp(Number(r.entry_score), 0, 99.9), volClass: vc, hitTarget: res === 1 });
          });
        });
      }
      if (meta.newest == null || date > meta.newest) meta.newest = date;
      if (meta.oldest == null || date < meta.oldest) meta.oldest = date;
      meta.count++;
      out.processed++;
    });
    out.rows = recordOutcomes(rows, key);
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
    clearCalibration: clearCalibration
  };
})();
