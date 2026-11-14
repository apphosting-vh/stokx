/* ══════════════════════════════════════════════════════════════════════
   StoX Expected Value & Probability-Calibrated Trade Engine
   Version 4.5  (EV_V4_ENGINE)

   v4.4.1 -> v4.5 (merged build: the audit fix set completed, keeping the
   v4.4.1 open-episode API and the v4.4 cluster statistics)
     1. SETUP LIFT REPAIRED (audit F1): the adjustment multiplied the
        already-shrunk (histP - priorP) by evidenceWeight AGAIN — effective
        lift = evidenceWeight^2 x (rawP - priorP), ~11% of the raw bucket gap
        at exactN=20 — and measured it against a setup-blind prior that
        INCLUDED the exact bucket. The lift is now single-shrunk and measured
        against hist.priorP (the H_T_P prior with the exact bucket EXCLUDED):
            p = ownBase + gapFactor * (histP - priorP)
        Verified: a seeded always-winning score band produces a probability
        gap of ~0.8 between score 85 and 45 (was 0.005) and can reach a
        positive-EV sized plan (was structurally impossible).
     2. HAIRCUT AFTER SHRINKAGE (audit F2): the plan-independent best-of-N
        haircut was still subtracted BEFORE shrinkage (multiplied by lambda,
        stronger at short horizons). It is now subtracted at full strength
        after shrinkage.
     3. HONEST LIVE LABELS + WEEK-CLUSTERED LIVE nEff (audit F3):
        comparisonBasis now states the detrended basis (the old string
        claimed "executable_pnl" for a detrended number), rawBasis added,
        and the live effective n is the number of distinct signal weeks
        (the v4.2 horizon heuristic remains as fallback).
     4. RAW REALIZED IN THE RELIABILITY SELF-CHECK (audit F4): walk-forward
        rows now also carry the undetrended realized P&L, so meanRealizedRaw
        is reported next to the detrended meanRealized.
     5. calibrationStatus().byHorizon (audit F5): usable buckets per horizon,
        so pooled-prior fallbacks at long horizons are visible.
     6. UPSIDE DRIFT CONSISTENCY (audit F6): upsideProfile removes the same
        trailing drift as the EV model ((1 - driftKeep) x trailing mean log
        drift, no look-ahead); the two screens no longer disagree.
     7. HIST-ONLY FALLBACK (audit F7): with no own-history windows but a
        usable calibration bucket, the probability falls back to hist.p
        instead of dropping the plan.
     8. SIGN-AWARE HALF SELECTION (audit F8): the split-half winner's-curse
        halves rank non-positive EV by raw EV, like the optimizer does.
     9. OPEN-EPISODE TRANSPARENCY FOR SAME-DAY RESCANS (audit F9): a same-day
        rescan now populates latest/latestDelta (it was a silent no-op), and
        episode blocking is window-aware: a record whose holding window is
        over no longer blocks a new episode when settlement lags.
    10. DOCS (audit F10): restored hierarchical-prior changelog note (below),
        the business-income tax caveat and the DEFAULTS cost documentation.
     Store keys BUMPED: calibration v10 -> v11 and live v5 -> v6. The v10
     reliability accumulator predates the raw-realized sum (srw) and the v5
     settled records predate rec.realRaw, so keeping them would silently bias
     meanRealizedRaw (partial sums over the full n / subset samples). All
     earlier stores are cleared on load and the walk-forward rebuilds itself
     in the background.

   v4.4 -> v4.4.1 (open-episode transparency)
     1. recordPredictionDetailed() returns structured info even when the
        prediction is deduplicated (same-day rescan or open episode), so
        the caller can warn the user that the signal has changed since
        the open episode began. recordPrediction() is kept as a boolean
        wrapper for backward compatibility.
     2. On an open-episode rescan, the existing record gets a 'latest'
        sub-object (latest pred / decision / score / plan) and two
        flags: latestChanged (any material change) and latestDelta
        (planChanged / predDelta / scoreDelta). Settlement is unchanged:
        rec.pred, rec.h, rec.t, rec.mode stay frozen at first prediction.
     3. getOpenEpisode(symbol) is a pure read for the UI: returns the
        open episode with its latest assessment (or null).
     4. Exports added: recordPredictionDetailed, getOpenEpisode.
     No store key bumps, no schema migrations, no behavioural change to
     the scorecard.

   v4.3 -> v4.4 (audit fixes for remaining stat / logging defects)
     1. WEEK-CLUSTERED RELIABILITY (proper):
        v4.3 divided ROW-level variance by the number of distinct weeks.
        That is still wrong — 100 stocks in one bad week still enter the
        numerator of the row variance, so cross-sectional correlation is
        only partly removed. The reliability store now keeps per-week
        aggregates {n, sp, sr, eN, eSP, eSR}; the bias and SE used for
        the verdict are computed from ONE observation per week:
            bias = mean_w( r̄_w − p̄_w )
            SE   = sd_w( r̄_w − p̄_w ) / sqrt(N_weeks)
        Row-weighted pooled means are still shown for display continuity,
        and the fallback (n/4) path is kept for stores with too few
        weeks to cluster.
        gateReport() uses the same cluster estimator (per-week eligible
        vs non-eligible mean difference).
     2. LIVE RECORD DEDUPLICATION (one episode per symbol):
        Record id is now 'symbol|signalDate' (was symbol|date|h|t|mode,
        which let a rescan that picked a different best plan log a
        second row). recordPrediction() also refuses to create a new
        record while any OPEN record exists for the same symbol — a
        persistent Buy does not start a second overlapping episode.
        Live key bumped v4→v5 (id scheme incompatible with v4 rows).
     3. EXPLICIT RAW-vs-MODEL LABELS: livePerformance() now returns
        `labels` metadata (meanPredicted / meanRealized / meanRealizedRaw)
        and `rawVsModelGap` (meanRealizedRaw − meanRealized), so the UI
        can label the two P&L numbers explicitly. meanRealized and
        meanRealizedRaw were both already in v4.3; this adds the
        metadata the UI needs to distinguish them.
     4. ISO-8601 WEEK KEYS: weekKeyOf() is now the standard
        Thursday-shift algorithm. Handles year-boundary spillover
        correctly (2024-12-31 → '2025-W01').
     5. Reliable key bumps: calibrationKey v9→v10 and live.key v4→v5.
        v9 calibration is cleared because the reliability store gained
        per-week aggregates that cannot be reconstructed from v9's
        week-key set; v4 live rows are cleared because the id scheme
        changed.

   v4.2 -> v4.3 (audit fixes: setup-aware probability, self-audit honesty,
   correct utility sign, horizon-scaled prior, write-failure detection)
     1. SETUP-AWARE PROBABILITY DECOMPOSITION.
     2. SELF-CHECK HONESTY (rec.real + rec.realRaw).
     3. TRUST STATISTICS distinct weeks (partial — superseded by 4.4 #1).
     4. UTILITY SIGN (raw EV for non-positive plans).
     5. HORIZON-SCALED PRIOR (τ ∝ √h).
     6. CALIBRATION DATA LOSS (-1 on write failure).
     7. BUCKET SPARSITY (volClass dropped from key).
     8. REALISTIC COSTS (slippage 0.05%/side default).
     9. SIZING gap-through awareness.
    10. CLASSIFICATION ORDER (netEV ≤ 0 checked first).
    11. STORE MEMOIZATION + DEFERRED TOUCH.
    12. CONSERVATISM FEEDBACK (drop haircut when reliability = conservative).

   RESTORED HISTORY NOTE (audit feedback item 10e — the entry that was never
   written): the v4.2 -> v4.3 engine upgrade (VERSION 4.3.0) shipped the
   HIERARCHICAL EMPIRICAL-BAYES PRIOR for historicalProbability (exact bucket
   shrunk toward H_T_P -> H_T -> GLOBAL, exact bucket excluded from prior
   aggregation so its observations are not counted twice; prior strength
   40 -> 10 as the exact bucket fills), pooled-EV bucket accumulators (nv/sv)
   feeding the pooled prior, and the store bumps to calibration v8 / live v4.
   This is that changelog entry.

   v4.1 -> v4.2: frozen decision snapshot, explicit entry tracking,
   live scorecard transparency, store keys bumped.

   v4.0 -> v4.1: stop width in calibration buckets, same-basis reliability,
   look-ahead-free drift, next-open entry, DP charge, consistent basis
   inside windowOutcome, sizing on the decision tax basis, overlap-weighted
   calibration counts.

   v3 -> v4: regime + recency weighting, pooled prior, realistic exits,
   sizing + risk, portfolio diversify, self-honesty.

   v2 -> v3: sampling noise, selection bias, same-bar ties, costs/tax,
   calibration score mismatch, self-audit.

   v2: first-passage outcome model, corrected costs, probTouch percent
   fix, evidence reflects measured sample, shared per-stock setup
   computation, idempotent walk-forward calibration.

   This module deliberately does NOT replace the existing technical engine.
   ══════════════════════════════════════════════════════════════════════ */
window.ExpectedValueEngine = (function () {
  'use strict';

  var VERSION = 'EV-4.5.0';

  var DEFAULTS = {
    horizons: [3, 5, 10, 15, 20],
    targets: [2, 3, 4, 5, 6],
    defaultHorizon: 10,
    defaultTargetPct: 4,
    minNetEV: 0.30,
    minPositiveProbability: 0.55,
    minEvidence: 60,
    minEvConfidence: 0.80,
    /* v4.4+: not a dilution blend any more (see combineProbability). The
       historical layer contributes its setup-specific lift at full strength;
       these weights now only set the ML share against the combined model
       (statistical + historical = 0.80 vs ml = 0.20 when ML fires). */
    blend: { statistical: 0.55, historical: 0.25, ml: 0.20 },
    /* All values are PERCENT of traded value unless stated.
       brokerage, exchange, sebi, slippage are PER SIDE; stt is ROUND TRIP
       (0.1% on buy + 0.1% on sell for delivery); stampDuty is buy side only;
       gst is a FRACTION applied to (brokerage + exchange + SEBI) and NEVER to
       STT, stamp duty or DP.
       dpChargeRs is the flat depository charge in RUPEES per scrip on the sell
       day (13.5 + 18% GST = 15.93 at most brokers), converted to a percent via
       positionSizeRs — set positionSizeRs to your typical position.
       Set costs.brokerage = 0 if your broker charges no delivery brokerage.
       Override at runtime with window.STOX_EV_CONFIG = { costs: { ... } }. */
    costs: {
      brokerage: 0,            // zero-brokerage delivery
      stt: 0.20,               // 0.1% buy + 0.1% sell
      exchange: 0.003,         // ~0.003% per side (0.006% round trip)
      sebi: 0.001,             // GST & SEBI charges, ~0.001% per side; GST folded in, so gst below is 0
      gst: 0,
      stampDuty: 0.015,        // buy side only
      slippage: 0.05,          // 0.05%/side modeled slippage (next-open entry of an EOD signal). Zero slippage overstated the shrunk EV by ~0.1-0.25%/trade against the 0.30% minNetEV gate; set 0 only if your fills are consistently at the open.
      dpChargeRs: 15.93,       // DP charge per scrip on the sell day (13.5 + 18% GST), converted to a % via positionSizeRs
      positionSizeRs: 100000
    },
    /* Short-term capital gains on STT-paid listed equity: 20% + 4% cess = 20.8%.
       Surcharge for high incomes and business-income treatment are NOT modeled.
       WARNING: if your gains are taxed as BUSINESS INCOME (slab rates, up to
       30%+ cess, no 20% equity rate), taxRatePct = 0 is optimistic — set it to
       your effective slab rate or the EV will overstate what you keep.
       Tax is levied on NET gains for the year, so a strategy you repeat pays tax
       on its expected net gain (EV x (1 - rate)): losses are set off against gains.
       taxLossCredit = share of each loss that offsets gains (1 = full set-off,
       the default for a repeated strategy; 0 = taxed on every winner while
       losers earn nothing, only right for one-off trades or a year with no
       other gains). */
    taxRatePct: 0,                  // capital gains tax NOT deducted from Net EV (was 20.8)
    taxLossCredit: 1,
    decideAfterTax: false,          // Net EV is after costs only (no capital gains tax)
    evPriorStdPct: 0.5,             // prior sd of the TRUE gross edge per trade at h=defaultHorizon, % (shrinkage strength); scales with sqrt(h/defaultHorizon) so lambda is horizon-neutral
    selectionHaircut: true,
    scoreGapFree: 8,
    scoreGapRange: 25,
    stopATR: 1.8,
    maxStopPct: 6.0,
    minStopPct: 1.5,
    lookbackBars: 500,
    minWindows: 30,
    driftKeep: 0.5,
    /* v4.4: v9 cleared — reliability store gains per-week aggregates that
       cannot be reconstructed from v9's week-key set. */
    calibrationKey: 'stox_ev_calibration_v11',

    gate: { includeWatch: false, includeAvoid: false },
    exitVariants: ['fixed'],
    exit: { armFrac: 0.5, trailFrac: 0.6 },
    lockedLimitDelay: true,
    recency: { halfLifeBars: 250 },
    regime: { enabled: true, mismatchWeight: 0.6, trendBars: 50, volBars: 20, minIndexBars: 80 },
    pooledPrior: { enabled: true, minN: 30, k: 60, maxWeight: 0.5 },
    liquidity: { enabled: false, impactCoef: 0.5, maxPerSidePct: 1.0, advBars: 20 },
    sizing: { kellyFraction: 0.25, maxPositionPct: 20, maxRiskPerTradePct: 1.0 },
    correlation: { lookbackBars: 120, minOverlap: 60, threshold: 0.7, penalty: 0.5, maxPicks: 5, maxPerGroup: 1, groupPrefixes: ['ADANI', 'TATA', 'BAJAJ'] },
    /* v4.4: v4 cleared — record id changes from symbol|date|h|t|mode
       to symbol|signalDate, incompatible with existing rows. */
    live: { key: 'stox_ev_live_v6', maxRecords: 4000 },
    staleCalibrationDays: 21,
    noTrade: { minPPositive: 0.5 },
    upside: { horizons: [3, 5, 10, 15, 20], targets: [2, 3, 4, 5, 6], shrinkK: 8 }
  };

  /* Clear stores incompatible with this build. */
  try {
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v10' + sfx); });  // v10 _rel accumulator has no srw (raw realized sum); v11 rebuilds it
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v9' + sfx); });
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v8' + sfx); });
    localStorage.removeItem('stox_ev_live_v5');               // v5 settled rows have no realRaw / outcomeRaw; v6 scorecard rebuilds
    localStorage.removeItem('stox_ev_live_v4');
    localStorage.removeItem('stox_ev_live_v3');
    localStorage.removeItem('stox_ev_live_v2');
    localStorage.removeItem('stox_ev_live_v1');
    localStorage.removeItem('stox_ev_calibration_v2');
    localStorage.removeItem('stox_ev_calibration_v2_meta');
    localStorage.removeItem('stox_ev_calibration_v3');
    localStorage.removeItem('stox_ev_calibration_v3_meta');
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v4' + sfx); });
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v5' + sfx); });
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v6' + sfx); });
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v7' + sfx); });
  } catch (e) {}

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function num(v, fallback) { v = Number(v); return isFinite(v) ? v : fallback; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round(v, d) {
    var p = Math.pow(10, d == null ? 2 : d);
    return Math.round(v * p) / p;
  }
  function pct(v) { return v == null || !isFinite(v) ? null : round(v * 100, 1); }
  function Phi(x) {
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
    var gst = (broker + exch + sebi) * num(c.gst, 0);
    var dp = (num(c.dpChargeRs, 0) > 0 && num(c.positionSizeRs, 0) > 0) ? num(c.dpChargeRs, 0) / num(c.positionSizeRs, 0) * 100 : 0;
    return broker + exch + sebi + gst + num(c.stt, 0) + num(c.stampDuty, 0) + num(c.slippage, 0) * 2 + dp;
  }

  function afterTax(g, cfg) {
    var r = num(cfg.taxRatePct, 0) / 100;
    if (!(r > 0)) return g;
    return g > 0 ? g * (1 - r) : g * (1 - r * clamp(num(cfg.taxLossCredit, 0), 0, 1));
  }

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
        trend: r.trendHealth, pullback: r.pullbackQuality, swing: r.swingPotential,
        breakout: r.breakoutContinuation, regime: r.regimeAlignment, regimeMax: r.regimeAlignmentMax,
        range: r.rangeAdequacy, legacyConfidence: r.confidence
      },
      raw: r, reason: 'ok'
    };
  }

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

  function statisticalTouch(hourly, daily, indexCandles, horizon, targetPct) {
    var TI = window.TechIndicators;
    if (!TI || !TI.computeHorizonConfidence || !hourly || !hourly.length || !daily || !daily.length) return null;
    var entry = hourly[hourly.length - 1].c;
    try {
      var r = TI.computeHorizonConfidence(hourly, daily, {
        horizonDays: horizon, windowSessions: 40, entry_price: entry,
        targetPct: targetPct, holdingDays: null, indexCandles: indexCandles
      });
      if (r && r.components && r.components.probTouch != null) {
        var p = Number(r.components.probTouch) / 100;
        if (isFinite(p)) return { p: clamp(p, 0.001, 0.999), raw: r };
      }
    } catch (e) {}
    return null;
  }

  function exitOpts(cfg) {
    return { armFrac: cfg.exit && cfg.exit.armFrac, trailFrac: cfg.exit && cfg.exit.trailFrac, lockDelay: cfg.lockedLimitDelay !== false };
  }

  function windowOutcome(daily, i, horizon, up, dn, removed, stopPct, mode, ex) {
    var entryBar = daily[i + 1];
    var base = entryBar && entryBar.o > 0 ? entryBar.o : (entryBar && entryBar.c > 0 ? entryBar.c : (daily[i] ? daily[i].c : 0));
    if (!(base > 0)) return null;
    mode = mode || 'fixed';
    ex = ex || {};
    removed = num(removed, 0);
    var lvl = dn;
    var armAt = up * (ex.armFrac == null ? 0.5 : ex.armFrac);
    var trailDist = Math.abs(dn) * (ex.trailFrac == null ? 0.6 : ex.trailFrac);
    var peak = -Infinity, minLow = 0;
    for (var j = 1; j <= horizon; j++) {
      var bar = daily[i + j];
      if (!bar || !(bar.h > 0) || !(bar.l > 0)) continue;
      var adj = removed * j;
      var lowL = Math.log(bar.l / base) - adj, highL = Math.log(bar.h / base) - adj;
      if (lowL < minLow) minLow = lowL;
      var hitS = lowL <= lvl;
      var hitT = highL >= up;
      if (!hitS && !hitT) {
        if (mode !== 'fixed') {
          if (highL > peak) peak = highL;
          if (peak >= armAt) {
            var nl = mode === 'breakeven' ? 0 : Math.max(0, peak - trailDist);
            if (nl > lvl) lvl = nl;
          }
        }
        continue;
      }
      var stopRet = (Math.exp(lvl) - 1) * 100;
      var gapRet = stopRet;
      if (bar.o > 0) {
        var oRet = (Math.exp(Math.log(bar.o / base) - adj) - 1) * 100;
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
      if (ex.lockDelay !== false && bar.h === bar.l) {
        var exitRet = null;
        for (var k = j + 1; k <= horizon; k++) {
          var b2 = daily[i + k];
          if (!b2 || !(b2.h > 0) || !(b2.l > 0)) continue;
          if (b2.h > b2.l) {
            var px = b2.o > 0 ? b2.o : b2.c;
            exitRet = (Math.exp(Math.log(px / base) - removed * k) - 1) * 100;
            break;
          }
        }
        if (exitRet == null) {
          var lastB = daily[Math.min(daily.length - 1, i + horizon)];
          exitRet = lastB && lastB.c > 0 ? (Math.exp(Math.log(lastB.c / base) - removed * horizon) - 1) * 100 : gapRet;
        }
        gapRet = exitRet;
      }
      return { tP: 0, sP: 1, oP: 0, x: 0, sRet: gapRet, mae: Math.min(mae, gapRet) };
    }
    var endBar = daily[i + horizon];
    var endC = endBar ? endBar.c : 0;
    var x = endC > 0 ? (Math.exp(Math.log(endC / base) - removed * horizon) - 1) * 100 : 0;
    return { tP: 0, sP: 0, oP: 1, x: x, sRet: (Math.exp(lvl) - 1) * 100, mae: (Math.exp(minLow) - 1) * 100 };
  }

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

  function wQuantile(pairs, q) {
    if (!pairs.length) return 0;
    var arr = pairs.slice().sort(function (a, b) { return a[0] - b[0]; });
    var tot = 0, k;
    for (k = 0; k < arr.length; k++) tot += arr[k][1];
    var acc = 0, target = q * tot;
    for (k = 0; k < arr.length; k++) { acc += arr[k][1]; if (acc >= target) return arr[k][0]; }
    return arr[arr.length - 1][0];
  }
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

  function tripleBarrierWindows(daily, horizon, targetPct, stopPct, cfg, costPct, weights, mode) {
    if (!daily || !daily.length) return null;
    var n = daily.length, last = n - 1;
    var firstStart = Math.max(1, n - cfg.lookbackBars);
    var lastStart = last - horizon;
    if (lastStart - firstStart + 1 < cfg.minWindows) return null;

    var lrSum = new Array(n), lrCnt = new Array(n);
    lrSum[0] = 0; lrCnt[0] = 0;
    for (var k = 1; k < n; k++) {
      var a = daily[k - 1].c, b = daily[k].c;
      var okv = (a > 0 && b > 0);
      lrSum[k] = lrSum[k - 1] + (okv ? Math.log(b / a) : 0);
      lrCnt[k] = lrCnt[k - 1] + (okv ? 1 : 0);
    }
    var driftKeep = clamp(num(cfg.driftKeep, 0.5), 0, 1);
    var up = Math.log(1 + targetPct / 100);
    var dn = Math.log(1 - stopPct / 100);
    var ex = exitOpts(cfg);

    var useAft = cfg.decideAfterTax !== false;
    var vals = [], ws = [], maes = [];
    var W = 0, W2 = 0, sT = 0, sS = 0, sO = 0, sRetW = 0, sAfS = 0, sX = 0, sAfO = 0, nPosO = 0;
    var sumMuW = 0, sumRemW = 0;
    for (var i = firstStart; i <= lastStart; i++) {
      var w = weights ? weights[i] : 1;
      if (!(w > 0)) continue;
      var lbFrom = Math.max(1, i - cfg.lookbackBars + 1);
      var cntI = lrCnt[i] - lrCnt[lbFrom - 1];
      var muI = cntI > 0 ? (lrSum[i] - lrSum[lbFrom - 1]) / cntI : 0;
      var removedI = (1 - driftKeep) * muI;
      var o = windowOutcome(daily, i, horizon, up, dn, removedI, stopPct, mode, ex);
      if (!o) continue;
      sumMuW += w * muI; sumRemW += w * removedI;
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
    var effW = W * W / W2;
    var sd = Math.sqrt(ss / W * effW / Math.max(1, effW - 1));
    var nEff = effW / Math.max(1, horizon);
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
      driftPerDayPct: sumMuW / W * 100,
      removedDriftPerDayPct: sumRemW / W * 100,
      cvar5Pct: wTailMean(pairs, 0.05),
      p5Pct: wQuantile(pairs, 0.05),
      worstPct: worst,
      meanMAEPct: maeMean,
      p90MAEPct: -wQuantile(mp, 0.90)
    };
  }

  function calibrationBucket(horizon, targetPct, setupScore, volClass, stopPct) {
    var ps = stopPct == null ? 'x' : round(Math.round(num(stopPct, 0) * 2) / 2, 1);
    return 'h' + horizon + '|t' + round(targetPct, 1) + '|s' + Math.floor(clamp(setupScore || 0, 0, 99) / 10) * 10 + '|p' + ps;
  }
  function loadStore(key) {
    try {
      var raw = localStorage.getItem(key);
      var d = raw ? JSON.parse(raw) : {};
      return d && typeof d === 'object' ? d : {};
    } catch (e) {
      console.warn('[EV] store read FAILED for "' + key + '" (corrupt JSON?): starting empty.');
      return {};
    }
  }
  function saveStore(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; }
    catch (e) {
      console.warn('[EV] store write FAILED for "' + key + '" (' + (e && e.name || 'error') +
        '): this batch is NOT persisted. Check localStorage quota (stox_ev_* sizes).');
      return false;
    }
  }

  var _calCache = {};
  var _calCacheVer = {};
  function loadCalibration(key) {
    key = key || DEFAULTS.calibrationKey;
    var ver = _calCacheVer[key] || 0;
    var cached = _calCache[key];
    if (cached && cached.ver === ver) return cached.data;
    var data = loadStore(key);
    _calCache[key] = { data: data, ver: ver };
    return data;
  }
  function saveCalibration(key, obj) {
    key = key || DEFAULTS.calibrationKey;
    _calCacheVer[key] = (_calCacheVer[key] || 0) + 1;
    return saveStore(key, obj);
  }

  function calibrationKeyPart(bucketKey, prefix) {
    var parts = String(bucketKey || '').split('|');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(prefix) === 0) return parts[i];
    }
    return null;
  }

  function calibrationPriorStats(all, predicate, excludeKey) {
    var totalN = 0, totalWins = 0;
    Object.keys(all || {}).forEach(function (bucketKey) {
      if (bucketKey === excludeKey || !predicate(bucketKey)) return;
      var b = all[bucketKey];
      if (!b) return;
      var n = num(b.n, 0), wins = num(b.wins, 0);
      if (!isFinite(n) || n <= 0 || !isFinite(wins)) return;
      totalN += n;
      totalWins += clamp(wins, 0, n);
    });
    if (totalN <= 0) return null;
    return { n: totalN, wins: totalWins, p: clamp(totalWins / totalN, 0.01, 0.99) };
  }

  function hierarchicalCalibrationPrior(all, horizon, targetPct, volClass, stopPct, exactKey) {
    var h = 'h' + horizon;
    var t = 't' + round(targetPct, 1);
    var ps = stopPct == null ? 'x' : round(Math.round(num(stopPct, 0) * 2) / 2, 1);
    var p = 'p' + ps;
    var candidates = [
      { level: 'H_T_P', minN: 40, predicate: function (k) {
          return calibrationKeyPart(k, 'h') === h && calibrationKeyPart(k, 't') === t && calibrationKeyPart(k, 'p') === p; } },
      { level: 'H_T', minN: 100, predicate: function (k) {
          return calibrationKeyPart(k, 'h') === h && calibrationKeyPart(k, 't') === t; } },
      { level: 'GLOBAL', minN: 1, predicate: function () { return true; } }
    ];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i], stats = calibrationPriorStats(all, c.predicate, exactKey);
      if (stats && stats.n >= c.minN) return { level: c.level, n: stats.n, p: stats.p };
    }
    return { level: 'DEFAULT', n: 0, p: 0.50 };
  }

  function calibrationPriorStrength(exactN) {
    var n = num(exactN, 0);
    if (n < 30) return 40;
    if (n < 60) return 30;
    if (n < 120) return 20;
    return 10;
  }

  function historicalProbability(horizon, targetPct, setupScore, volClass, stopPct, key) {
    var all = loadCalibration(key);
    if (!all) return null;
    var exactKey = calibrationBucket(horizon, targetPct, setupScore, volClass, stopPct);
    var b = all[exactKey];
    var exactN = b ? num(b.n, 0) : 0;
    if (!b || exactN < 20) return null;
    var exactWins = clamp(num(b.wins, 0), 0, exactN);
    var prior = hierarchicalCalibrationPrior(all, horizon, targetPct, volClass, stopPct, exactKey);
    var priorStrength = calibrationPriorStrength(exactN);
    var p = (exactWins + priorStrength * prior.p) / (exactN + priorStrength);
    return {
      p: clamp(p, 0.01, 0.99), n: exactN, bucket: b,
      rawP: exactN > 0 ? clamp(exactWins / exactN, 0.01, 0.99) : null,
      priorP: prior.p, priorN: prior.n, priorLevel: prior.level,
      priorStrength: priorStrength,
      evidenceWeight: exactN / (exactN + priorStrength),
      exactKey: exactKey
    };
  }

  function setupBlindPrior(horizon, targetPct, stopPct, key) {
    var all = loadCalibration(key);
    var h = 'h' + horizon;
    var t = 't' + round(targetPct, 1);
    var ps = stopPct == null ? 'x' : round(Math.round(num(stopPct, 0) * 2) / 2, 1);
    var p = 'p' + ps;
    var totalN = 0, totalWins = 0;
    Object.keys(all || {}).forEach(function (k) {
      if (calibrationKeyPart(k, 'h') !== h) return;
      if (calibrationKeyPart(k, 't') !== t) return;
      if (calibrationKeyPart(k, 'p') !== p) return;
      var b = all[k];
      if (!b) return;
      var n = num(b.n, 0), w = num(b.wins, 0);
      if (n > 0) { totalN += n; totalWins += clamp(w, 0, n); }
    });
    if (totalN < 20) return null;
    return { p: clamp(totalWins / totalN, 0.01, 0.99), n: totalN };
  }

  function mlProbability(context) {
    var candidates = [
      window.LiveML && window.LiveML.getCalibratedProbability,
      window.MLTrainer && window.MLTrainer.getCalibratedProbability
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (typeof candidates[i] === 'function') {
        try {
          var p = Number(candidates[i](context));
          if (isFinite(p)) { if (p > 1) p /= 100; return clamp(p, 0.01, 0.99); }
        } catch (e) {}
      }
    }
    return null;
  }

  /* v4.5: setup-aware decomposition (audit F1/F7).
     The statistical layer walks every start bar (setup-blind), so the
     calibration's only unique information is how TODAY'S setup differs from
     the average setup with the same h/t/stop:
         p = ownBase + gapFactor * (histP - priorP)
     histP   = shrunk win rate of this setup's exact score band.
     priorP  = hist.priorP — the H_T_P prior with the exact bucket EXCLUDED
     (the `prior` argument pools WITH the exact bucket and would shrink the
     lift by the bucket's own share; it is kept only as a fallback).
     The lift is SINGLE-shrunk: hist.p already embeds the evidenceWeight
     shrinkage toward priorP, so multiplying by evidenceWeight again (v4.3/
     v4.4.1 behaviour) squared the shrinkage and left ~11% of the raw bucket
     gap at n=20 — the dilution the audit was about. ML (when it fires) is an
     independent estimate of the same quantity and keeps its configured share
     (cfg.blend.ml) against the combined model. */
  function combineProbability(tb, hist, prior, ml, cfg, gapFactor) {
    var ownBase = tb ? clamp(tb.pTarget, 0.01, 0.99) : null;
    var w = gapFactor == null ? 1 : gapFactor;
    var priorP = hist
      ? (hist.priorP != null ? hist.priorP : (prior ? prior.p : null))
      : (prior ? prior.p : null);
    var lift = (hist && priorP != null) ? w * (hist.p - priorP) : 0;

    /* Contributors and disagreement describe the RAW sources (own history,
       calibration, ML) so the evidence-score semantics are unchanged. */
    var sources = [];
    if (ownBase != null) sources.push(ownBase);
    if (hist) sources.push(hist.p);
    if (ml != null) sources.push(ml);
    var disagreement = null;
    if (sources.length > 1) {
      var mean = sources.reduce(function (a, b) { return a + b; }, 0) / sources.length;
      var variance = sources.reduce(function (s, x) { return s + Math.pow(x - mean, 2); }, 0) / sources.length;
      disagreement = Math.sqrt(variance);
    }

    /* v4.5 (F7): with no own-history windows but a usable calibration bucket,
       fall back to hist.p instead of dropping the plan. */
    var model = ownBase != null ? clamp(ownBase + lift, 0.01, 0.99) : (hist ? hist.p : null);
    var p = null;
    if (model != null && ml != null) {
      var mlW = num(cfg.blend.ml, 0.2);
      p = clamp(model * (1 - mlW) + ml * mlW, 0.01, 0.99);
    } else if (model != null) {
      p = model;
    } else if (ml != null) {
      p = ml;
    }

    return {
      p: p, contributors: sources.length, disagreement: disagreement, parts: sources,
      method: 'own_base_plus_setup_lift',
      ownBase: ownBase, adjustedBase: model,
      statisticalBase: ownBase, setupLift: lift,
      priorP: priorP, histP: hist ? hist.p : null,
      adjustment: (hist && priorP != null) ? (hist.p - priorP) : null
    };
  }

  function evidenceConfidence(input) {
    var ownScore = clamp((input.ownN || 0) / 40, 0, 1) * 12;
    var calScore = clamp((input.historicalN || 0) / 200, 0, 1) * 18;
    var dataScore = clamp(input.dataCompleteness == null ? 0 : input.dataCompleteness, 0, 1) * 15;
    var contributors = input.contributors || 0;
    var agreementScore = contributors <= 1 ? 8 : clamp(1 - num(input.disagreement, 0.25) / 0.25, 0, 1) * 15;
    var modelScore = contributors >= 3 ? 15 : contributors === 2 ? 11 : 7;
    var setupScore = input.setupScore == null ? 50 : input.setupScore;
    var stabilityScore = clamp((setupScore - 35) / 50, 0, 1) * 10;
    var regimeMax = num(input.regimeMax, 5);
    var regimeScore = input.regimeScore == null || regimeMax <= 0 ? 5 : clamp(input.regimeScore / regimeMax, 0, 1) * 15;
    return round(clamp(ownScore + calScore + dataScore + agreementScore + modelScore + stabilityScore + regimeScore, 0, 100), 1);
  }

  function classify(netEV, pEvPositive, pReturnPositive, evidence, setupScore, cfg) {
    if (netEV != null && netEV <= 0) return { code: 'NEGATIVE_EV', label: 'AVOID', color: 'loss' };
    if (netEV == null || evidence < 45) return { code: 'INSUFFICIENT_EVIDENCE', label: 'WATCH', color: 'neutral' };
    if (netEV >= 0.75 && pReturnPositive >= 0.62 && evidence >= 75 && (setupScore || 0) >= 60 && pEvPositive >= 0.90)
      return { code: 'HIGH_CONVICTION', label: 'HIGH CONVICTION', color: 'profit' };
    if (netEV >= cfg.minNetEV && pReturnPositive >= cfg.minPositiveProbability && evidence >= cfg.minEvidence && pEvPositive >= cfg.minEvConfidence)
      return { code: 'QUALIFIED_TRADE', label: 'QUALIFIED TRADE', color: 'profit' };
    return { code: 'WATCH', label: 'WATCH', color: 'warn' };
  }

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
      setupCalScore = null;
      try {
        var rc = TI && TI.computeEntryScore ? TI.computeEntryScore(daily, indexCandles, symbol, null) : null;
        if (rc && rc.entry_score != null) setupCalScore = clamp(Number(rc.entry_score), 0, 100);
      } catch (e) {}
      if (setupCalScore == null) setupCalScore = setup.score;
    }

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
      setup: setup, setupCalScore: setupCalScore, scoreGap: gap, gapFactor: gapFactor,
      atrPct: atrPct, stopPct: stopFromAtr(atrPct, cfg), volClass: volClassOf(atrPct),
      dataCompleteness: dataCompleteness,
      costs: totalRoundTripCost(cfg.costs) + liq.perSidePct * 2,
      liquidity: liq, weights: ww.weights, regime: ww.regime
    };
  }

  function corePlan(pre, input, cfg, horizon, targetPct, internal, mode) {
    var daily = input.dailyCandles || [];
    var hourly = input.hourlyCandles || [];
    var indexCandles = input.indexCandles || [];
    mode = mode || 'fixed';
    var noHist = !!(internal && internal.noHist) || mode !== 'fixed';
    var noTouch = !!(internal && internal.noTouch);

    var tb = tripleBarrierWindows(daily, horizon, targetPct, pre.stopPct, cfg, pre.costs, pre.weights, mode);
    var touch = (noHist || noTouch) ? null : statisticalTouch(hourly, daily, indexCandles, horizon, targetPct);
    var hist = noHist ? null : historicalProbability(horizon, targetPct, pre.setupCalScore, pre.volClass, pre.stopPct, cfg.calibrationKey);
    var prior = noHist ? null : setupBlindPrior(horizon, targetPct, pre.stopPct, cfg.calibrationKey);
    var ml = noHist ? null : mlProbability({
      symbol: input.symbol, dailyCandles: daily, hourlyCandles: hourly, indexCandles: indexCandles,
      setup: pre.setup, horizonDays: horizon, targetPct: targetPct
    });

    var probability = combineProbability(tb, hist, prior, ml, cfg, pre.gapFactor);

    var core = {
      horizonDays: horizon, targetPct: targetPct, exitMode: mode,
      tb: tb, touch: touch, hist: hist, prior: prior, ml: ml,
      probability: probability, dist: null, ev: null, pReturnPositive: null
    };
    if (!tb || probability.p == null) return core;

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
      var tauBase = num(cfg.evPriorStdPct, 0.5);
      var tau = Math.max(0.05, tauBase * Math.sqrt(core.horizonDays / Math.max(1, cfg.defaultHorizon)));
      var s = Math.max(0.02, tb.stdErr);
      var lam = tau * tau / (tau * tau + s * s);
      /* v4.5 (F2): the best-of-N selection haircut is plan-independent and is
         subtracted AFTER shrinkage. Subtracting it before shrink multiplied it
         by lambda (bigger effect at short horizons), stacking a conservatism
         layer unevenly across the grid. */
      var cst = core.ev.costPct, Tg = core.targetPct, Sg = Math.abs(tb.meanStopRet);
      var pT0 = Sg / (Tg + Sg) * (1 - tb.pTimeout), pS0 = Tg / (Tg + Sg) * (1 - tb.pTimeout);
      var rate = cfg.decideAfterTax !== false ? num(cfg.taxRatePct, 0) / 100 : 0;
      var m0 = -cst - rate * pT0 * Math.max(0, Tg - cst) + rate * clamp(num(cfg.taxLossCredit, 0), 0, 1) * pS0 * (Sg + cst);
      var pp = cfg.pooledPrior || {};
      var priorMean = m0, pooledMean = null, pooledW = 0;
      if (pp.enabled && hist && hist.bucket && hist.bucket.nv >= num(pp.minN, 30)) {
        pooledMean = hist.bucket.sv / hist.bucket.nv;
        pooledW = Math.min(num(pp.maxWeight, 0.5), hist.bucket.nv / (hist.bucket.nv + num(pp.k, 60))) * pre.gapFactor;
        priorMean = m0 + pooledW * (pooledMean - m0);
      }
      var shrunk = priorMean + lam * (core.basisEV - priorMean) - haircut;
      var postSd = Math.sqrt(tau * tau * s * s / (tau * tau + s * s));
      ev = {
        grossPct: core.ev.grossPct, costPct: core.ev.costPct, taxPct: core.ev.taxPct,
        preTaxNetPct: core.ev.preTaxNetPct, afterTaxNetPct: core.ev.afterTaxNetPct,
        basis: cfg.decideAfterTax !== false ? 'after-tax' : 'net of costs',
        rawBasisPct: core.basisEV,
        haircutPct: haircut,
        shrinkFactor: lam,
        priorMeanPct: priorMean,
        zeroEdgePriorPct: m0,
        pooledMeanPct: pooledMean,
        pooledWeight: pooledW,
        shrunkPct: shrunk,
        stdErrPct: s,
        postSdPct: postSd,
        pPositive: clamp(Phi(shrunk / postSd), 0, 1),
        netPct: shrunk,
        rangeLoPct: shrunk - 1.645 * postSd,
        rangeHiPct: shrunk + 1.645 * postSd,
        evPerDayPct: shrunk / Math.max(1, core.horizonDays),
        annualizedPct: shrunk * 252 / Math.max(1, core.horizonDays)
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
        target: probability.p,
        touch: core.touch ? core.touch.p : null,
        positiveReturn: core.pReturnPositive,
        contributors: probability.contributors,
        disagreement: probability.disagreement,
        statistical: tb ? tb.pTarget : null,
        historical: hist ? hist.p : null,
        priorP: probability.priorP,                       // v4.5: H_T_P prior, exact bucket excluded (the lift baseline)
        setupAdjustment: probability.adjustment,
        method: probability.method,                       // own_base_plus_setup_lift
        statisticalBase: probability.statisticalBase,     // setup-blind own-history rate
        setupLift: probability.setupLift,                 // gapFactor x (histP - priorP)
        historicalN: hist ? hist.n : 0,
        ml: core.ml
      },
      windows: tb ? {
        n: tb.n, nEff: round(tb.nEff, 1),
        ownDriftPerDayPct: round(tb.driftPerDayPct, 3),
        removedDriftPerDayPct: round(tb.removedDriftPerDayPct, 3)
      } : null,
      distribution: core.dist,
      stopPct: pre.stopPct, atrPct: pre.atrPct, volClass: pre.volClass,
      costsPct: pre.costs, calScoreGap: pre.scoreGap, calScoreFactor: pre.gapFactor,
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

  function exitRuleText(mode, cfg) {
    var ex = cfg.exit || {};
    if (mode === 'breakeven') return 'Stop moves to entry once price is up ' + round(num(ex.armFrac, 0.5) * 100, 0) + '% of the way to target';
    if (mode === 'trail') return 'After ' + round(num(ex.armFrac, 0.5) * 100, 0) + '% of the target, stop trails the peak (never below entry)';
    return 'Fixed target / stop / time exit';
  }

  function computeSizing(dist, tb, targetPct, cost, stopPct, ev, cfg) {
    var sc = cfg.sizing || {};
    var out = { fullKellyPct: 0, suggestedPct: 0, riskCapPct: null, binding: 'no edge', kellyScale: 0 };
    if (!dist || !tb || !ev || !(ev.netPct > 0)) return out;
    var basisG = cfg.decideAfterTax !== false ? function (g) { return afterTax(g, cfg); } : function (g) { return g; };
    var outs = [
      [dist.pTarget, basisG(targetPct - cost) / 100],
      [dist.pStop, basisG(tb.meanStopRet - cost) / 100],
      [dist.pTimeout, basisG(tb.meanTimeoutRet - cost) / 100]
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
    var effStop = Math.max(
      stopPct || 0,
      Math.abs(tb.meanStopRet || 0),
      tb.p5Pct != null ? Math.abs(tb.p5Pct) : 0
    );
    var riskCap = effStop > 0 ? num(sc.maxRiskPerTradePct, 1) / effStop * 100 : null;
    var cap = num(sc.maxPositionPct, 20);
    var sug = kelly, binding = 'kelly';
    if (riskCap != null && riskCap < sug) { sug = riskCap; binding = 'risk cap'; }
    if (cap < sug) { sug = cap; binding = 'position cap'; }
    return { fullKellyPct: bestF * 100, suggestedPct: sug, riskCapPct: riskCap, riskBasisPct: effStop, binding: binding, kellyScale: scale };
  }

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
    if (tb.timeoutPosShare != null && core.dist.pTimeout > 0.4) out.push('Many trades just time out (' + pct(core.dist.pTimeout) + '%), so the move needs to come within the horizon.');
    if (evidence < 60) out.push('Evidence is thin (' + round(evidence, 0) + '/100): few similar setups measured.');
    if (pre.regime && pre.regime.matchedShare != null && pre.regime.matchedShare < 0.35) out.push('Today\'s market regime (' + pre.regime.trend + 'trend, ' + pre.regime.volatility + ' vol) is uncommon in this stock\'s history.');
    return out.slice(0, 4);
  }

  /* v4.5 (F6): each window is detrended by its own trailing drift exactly like
     the EV model's windowOutcome ((1 - driftKeep) x mean log drift over the
     lookback ending at the window start, no look-ahead). v4.4.1 kept the drift
     here while the EV engine removed it, so the two screens disagreed in
     philosophy. */
  function upsideProfile(dailyCandles, indexCandles, overrides) {
    var cfg = getConfig(overrides), uc = cfg.upside || {};
    var daily = dailyCandles || [], n = daily.length;
    if (n < 60) return null;
    var H = uc.horizons || [3, 5, 10, 15, 20], T = uc.targets || [2, 3, 4, 5, 6];
    var ww = buildWindowWeights(daily, indexCandles || [], cfg);
    var last = n - 1, firstStart = Math.max(1, n - cfg.lookbackBars);
    var s1 = 0, s2 = 0, c = 0, k;
    /* Per-window, look-ahead-free trailing drift (same convention as
       tripleBarrierWindows / calibrateFromHistory labels). */
    var lrSum = new Array(n), lrCnt = new Array(n);
    lrSum[0] = 0; lrCnt[0] = 0;
    for (k = 1; k < n; k++) {
      var aC = daily[k - 1].c, bC = daily[k].c;
      var okC = (aC > 0 && bC > 0);
      lrSum[k] = lrSum[k - 1] + (okC ? Math.log(bC / aC) : 0);
      lrCnt[k] = lrCnt[k - 1] + (okC ? 1 : 0);
      if (okC && k >= firstStart) { var lr = Math.log(bC / aC); s1 += lr; s2 += lr * lr; c++; }
    }
    if (c < 30) return null;
    var driftKeep = clamp(num(cfg.driftKeep, 0.5), 0, 1);
    var sigma = Math.sqrt(Math.max(0, s2 / c - Math.pow(s1 / c, 2)));
    var p = [], nEff = [];
    H.forEach(function (h) {
      var lastStart = last - h, row = T.map(function () { return 0; }), W = 0, W2 = 0;
      if (lastStart - firstStart + 1 < 30) { p.push(T.map(function () { return null; })); nEff.push(0); return; }
      for (var i = firstStart; i <= lastStart; i++) {
        var w = ww.weights[i];
        var entryBar = daily[i + 1];
        var base = entryBar && entryBar.o > 0 ? entryBar.o : (entryBar && entryBar.c > 0 ? entryBar.c : daily[i].c);
        if (!(base > 0) || !(w > 0)) continue;
        var lbFrom = Math.max(1, i - cfg.lookbackBars + 1);
        var cntI = lrCnt[i] - lrCnt[lbFrom - 1];
        var muI = cntI > 0 ? (lrSum[i] - lrSum[lbFrom - 1]) / cntI : 0;
        var removedI = (1 - driftKeep) * muI;
        var mxL = -Infinity;                     // max DETRENDED log high
        for (var j = 1; j <= h; j++) {
          var bar = daily[i + j], hi = bar && bar.h;
          if (!(hi > 0)) continue;
          var hiL = Math.log(hi / base) - removedI * j;
          if (hiL > mxL) mxL = hiL;
        }
        if (!(mxL > -Infinity)) continue;
        W += w; W2 += w * w;
        for (var t = 0; t < T.length; t++) if (mxL >= Math.log(1 + T[t] / 100)) row[t] += w;
      }
      if (!(W > 0)) { p.push(T.map(function () { return null; })); nEff.push(0); return; }
      p.push(row.map(function (x) { return Math.round(x / W * 1000) / 1000; }));
      nEff.push(Math.round((W * W / W2) / h * 10) / 10);
    });
    return { sigmaPct: Math.round(sigma * 100 * 1000) / 1000, horizons: H, targets: T, p: p, nEff: nEff, regime: ww.regime, asOf: String(daily[last].t).slice(0, 10) };
  }
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
    return finalizePlan(corePlan(pre, input, cfg, horizon, targetPct), pre, input, cfg, 0);
  }

  function buildExplanation(setup, probability, ev, evidence, decision, tb, pre) {
    var items = [];
    if (setup.score != null) items.push('Setup quality ' + round(setup.score, 0) + '/100');
    if (probability.p != null) items.push('target-first probability ' + pct(probability.p) + '%');
    if (probability.ownBase != null && probability.adjustment != null)
      items.push('own base ' + pct(probability.ownBase) + '% + setup adj ' + round((probability.adjustment * 100), 1) + ' pts (' + (probability.priorP != null ? 'prior ' + pct(probability.priorP) + '% vs hist ' + pct(probability.histP) + '%' : 'no prior') + ')');
    if (tb) items.push('measured on ' + tb.n + ' historical windows (~' + round(tb.nEff, 0) + ' independent)');
    if (pre && pre.stopPct != null) items.push('stop ' + round(pre.stopPct, 1) + '% (' + round(pre.stopPct / Math.max(0.01, pre.atrPct || pre.stopPct), 1) + ' ATR-equivalent)');
    if (pre && pre.regime && pre.regime.matchedShare != null) items.push('regime ' + pre.regime.trend + 'trend / ' + pre.regime.volatility + ' vol (' + round(pre.regime.matchedShare * 100, 0) + '% of weighted history matches)');
    if (ev) {
      items.push('trust-adjusted ' + ev.basis + ' EV ' + (ev.netPct >= 0 ? '+' : '') + round(ev.netPct, 2) + '% (data say ' + (ev.rawBasisPct >= 0 ? '+' : '') + round(ev.rawBasisPct, 2) +
        '%, pulled x' + round(ev.shrinkFactor, 2) + ' of the way from the zero-edge EV ' + round(ev.priorMeanPct, 2) + '% for +/-' + round(ev.stdErrPct, 2) + '% sampling error, minus ' + round(ev.haircutPct, 2) + '% selection inflation)');
      items.push('P(true EV > 0) = ' + pct(ev.pPositive) + '%; costs ' + round(ev.costPct, 2) + '%, tax ' + round(ev.taxPct, 2) + '%');
    }
    items.push('evidence confidence ' + round(evidence, 0) + '/100');
    if (probability.contributors < 2) items.push('limited model triangulation (no calibration history yet)');
    if (pre && pre.scoreGap != null && pre.gapFactor < 1) items.push('live score differs from calibration score by ' + round(pre.scoreGap, 0) + ' pts: historical weight x' + round(pre.gapFactor, 2));
    if (decision.code === 'INSUFFICIENT_EVIDENCE') items.push('do not treat probability as trade-ready');
    return items;
  }

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
    var u;
    if (ev > 0) {
      u = timeEff * evidenceFactor;
    } else {
      u = ev;
    }

    var maxH = Math.max.apply(null, cfg.horizons || [20]);
    var maxT = Math.max.apply(null, cfg.targets || [6]);
    var corner = 0;
    if (h === maxH) corner += 0.02;
    if (t === maxT) corner += 0.02;
    return u - corner;
  }

  function selectionHaircutOf(cores, cfg) {
    if (!cfg.selectionHaircut) return 0;
    try {
      if (reliabilityVerdict(cfg.calibrationKey) === 'conservative') return 0;
    } catch (e) {}
    var valid = cores.filter(function (c) { return c.tb && c.tb.halfA != null && c.tb.halfB != null; });
    if (valid.length < 3) return 0;
    var ia = -1, ib = -1, ua = -Infinity, ub = -Infinity;
    /* v4.5 (F8): the halves are ranked with the same sign-aware rule as the
       optimizer (ev/sqrt(h) only for positive EV), so negative-EV grids do
       not pick their "winner" through the long-horizon sign artifact. */
    valid.forEach(function (c, k) {
      var h = Math.sqrt(Math.max(1, c.horizonDays));
      var a = c.tb.halfA > 0 ? c.tb.halfA / h : c.tb.halfA;
      var b = c.tb.halfB > 0 ? c.tb.halfB / h : c.tb.halfB;
      if (a > ua) { ua = a; ia = k; }
      if (b > ub) { ub = b; ib = k; }
    });
    var optA = valid[ia].tb.halfA - valid[ia].tb.halfB;
    var optB = valid[ib].tb.halfB - valid[ib].tb.halfA;
    return clamp(Math.max(0, (optA + optB) / 2) / Math.SQRT2, 0, 3);
  }

  function optimize(input, overrides, internal) {
    var baseRaw = input && (input.baseDecision || input.baseRating || input.baseSignal || input.rating);
    if (baseRaw && typeof baseRaw === 'object') baseRaw = baseRaw.code || baseRaw.label || baseRaw.rating;
    var baseDecision = String(baseRaw || '').toUpperCase().replace(/[\s-]+/g, '_');

    var eligibility = 'UNSPECIFIED';
    if (baseDecision === 'STRONG_BUY' || baseDecision === 'BUY') eligibility = 'ELIGIBLE';
    else if (baseDecision === 'AVOID' || baseDecision === 'SELL') eligibility = 'EXCLUDED';
    else if (baseDecision) eligibility = 'WATCH_ONLY';

    var missingBase = eligibility === 'UNSPECIFIED' && !(internal && internal.skipGate);
    if (missingBase) eligibility = 'WATCH_ONLY';

    var cfg = getConfig(overrides);
    var gateOpts = cfg.gate || {};
    var ungated = false;
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
    if (horizons.indexOf(10) < 0) horizons.push(10);
    if (targets.indexOf(3) < 0) targets.push(3);
    var gridCfg = { horizons: horizons, targets: targets };

    var modes = (cfg.exitVariants || ['fixed']).filter(function (m) { return m === 'fixed' || m === 'breakeven' || m === 'trail'; });
    if (modes.indexOf('fixed') < 0) modes.unshift('fixed');

    var coreInternal = {};
    if (internal) Object.keys(internal).forEach(function (k) { coreInternal[k] = internal[k]; });
    coreInternal.noTouch = true;

    var cores = [];
    horizons.forEach(function (h) {
      targets.forEach(function (t) {
        modes.forEach(function (mode) {
          var core = corePlan(pre, input, cfg, h, t, coreInternal, mode);
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
        r.optimizerRankMetric = 'evidence-adjusted trust-adjusted net EV per sqrt(day) for positive EV; raw EV otherwise; 3%/10d baseline guard';
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

    var best = results.length ? results[0] : null;
    if (best && baseline && best !== baseline) {
      var bestU = Number(best.optimizerUtility);
      var baseU = Number(baseline.optimizerUtility);
      var requiredImprovement = Math.max(0.03, Math.abs(baseU) * 0.08);
      if (isFinite(bestU) && isFinite(baseU) && bestU < baseU + requiredImprovement) best = baseline;
    }

    if (best && best.probability && !(internal && (internal.noHist || internal.noTouch)) &&
        input.hourlyCandles && input.hourlyCandles.length) {
      try {
        var tBest = statisticalTouch(input.hourlyCandles, input.dailyCandles || [], input.indexCandles || [], best.horizonDays, best.targetPct);
        if (tBest) best.probability.touch = tBest.p;
      } catch (e) {}
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
            ? 'No base decision supplied; EV results are diagnostic only.'
            : 'Base StoX signal is not Buy/Strong Buy; EV results are diagnostic only.')
        : null,
      qualified: results.filter(function (r) {
        return r.decision && (r.decision.code === 'HIGH_CONVICTION' || r.decision.code === 'QUALIFIED_TRADE');
      })
    };
  }

  function recordOutcomes(rows, key) {
    key = key || DEFAULTS.calibrationKey;
    var all = loadCalibration(key), added = 0;
    (rows || []).forEach(function (row) {
      if (!row || row.horizonDays == null || row.targetPct == null || row.setupScore == null) return;
      var w = row.win != null ? Number(row.win) : (row.hitTarget ? 1 : (row.hitTarget === false ? 0 : NaN));
      if (!isFinite(w)) return;
      var rw = row.w != null ? clamp(Number(row.w), 0.05, 1) : 1;
      if (!isFinite(rw) || rw <= 0) rw = 1;
      var b = calibrationBucket(row.horizonDays, row.targetPct, row.setupScore, row.volClass, row.stopPct);
      var cell = all[b] || { n: 0, wins: 0 };
      cell.n += rw;
      cell.wins += rw * clamp(w, 0, 1);
      if (row.val != null && isFinite(Number(row.val))) {
        cell.nv = (cell.nv || 0) + rw;
        cell.sv = (cell.sv || 0) + rw * Number(row.val);
      }
      all[b] = cell;
      added++;
    });
    if (!added) return 0;
    return saveCalibration(key, all) ? added : -1;
  }
  function recordOutcome(row, key) {
    var r = recordOutcomes([row], key);
    return r > 0;
  }

  function clearCalibration(key) {
    key = key || DEFAULTS.calibrationKey;
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(key + '_meta');
      localStorage.removeItem(key + '_rel');
      localStorage.removeItem(key + '_sig');
      delete _calCache[key];
      _calCacheVer[key] = (_calCacheVer[key] || 0) + 1;
      return true;
    } catch (e) { return false; }
  }

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
    var byHorizon = {};
    Object.keys(all).forEach(function (k) {
      buckets++; total += all[k].n || 0;
      var ok = (all[k].n || 0) >= 20;
      if (ok) usable++;
      /* v4.5 (F5): usable buckets PER HORIZON — long horizons weigh each
         label 1/ceil(h/5), so their exact buckets often fall back to the
         pooled prior; this makes that visible. */
      var hk = calibrationKeyPart(k, 'h');
      if (hk) {
        var row = byHorizon[hk] || (byHorizon[hk] = { buckets: 0, usableBuckets: 0, outcomes: 0 });
        row.buckets++; row.outcomes += all[k].n || 0;
        if (ok) row.usableBuckets++;
      }
    });
    var meta = loadStore(key + '_meta');
    return { buckets: buckets, usableBuckets: usable, outcomes: total, symbols: Object.keys(meta).length, byHorizon: byHorizon };
  }

  /* ── Reliability ─────────────────────────────────────────────────────── */
  var REL_EDGES = [-0.5, -0.25, 0, 0.25, 0.5];
  function blankAcc() { return { n: 0, sp: 0, sr: 0, spp: 0, spr: 0, srr: 0, sd: 0, sdd: 0, sraw: 0, srw: 0 }; }
  function relBin(p) { var k = 0; while (k < REL_EDGES.length && p >= REL_EDGES[k]) k++; return k; }
  /* v4.5 (F4): realRaw = undetrended realized P&L of the same plan, so the
     self-check can report actual money next to the detrended number. srw is
     accumulated defensively (v10 stores predate the field). */
  function addAcc(g, pred, raw, real, realRaw) {
    var d = real - pred;
    g.n++; g.sp += pred; g.sr += real; g.spp += pred * pred; g.spr += pred * real; g.srr += real * real;
    g.sd += d; g.sdd += d * d; g.sraw += raw;
    g.srw = (g.srw || 0) + (isFinite(realRaw) ? realRaw : real);
  }

  /* v4.4: TRUE ISO-8601 week. Thursday-shift algorithm; handles year-
     boundary spillover (2024-12-31 -> 2025-W01). */
  function weekKeyOf(dateStr) {
    var ms = Date.parse(String(dateStr).slice(0, 10) + 'T12:00:00Z');
    if (!isFinite(ms)) return null;
    var d = new Date(ms);
    var dow = d.getUTCDay() || 7;   // Mon=1..Sun=7
    var thursday = new Date(d.getTime() + (4 - dow) * 86400000);
    var isoYear = thursday.getUTCFullYear();
    var yearStart = Date.UTC(isoYear, 0, 1);
    var daysIn = Math.floor((thursday.getTime() - yearStart) / 86400000);
    var week = Math.floor(daysIn / 7) + 1;
    return isoYear + '-W' + (week < 10 ? '0' : '') + week;
  }

  /* v4.4: store per-week AGGREGATES alongside the row-level accumulators
     used for the bucket display. The verdict is computed from one
     observation per week (clusterSummary), not from row-level variance
     divided by week count. */
  function recordReliability(rows, key) {
    key = key || DEFAULTS.calibrationKey;
    var rk = key + '_rel';
    var st = loadStore(rk);
    if (!st.all) st.all = blankAcc();
    if (!st.elig) st.elig = blankAcc();
    if (!st.bins) st.bins = { all: [], elig: [] };
    if (!st.weeks) st.weeks = {};
    var added = 0;
    (rows || []).forEach(function (r) {
      ['all'].concat(r.elig ? ['elig'] : []).forEach(function (grp) {
        addAcc(st[grp], r.pred, r.raw, r.real, r.realRaw);
        var b = relBin(r.pred);
        var cell = st.bins[grp][b] || { n: 0, sp: 0, sr: 0 };
        cell.n++; cell.sp += r.pred; cell.sr += r.real;
        st.bins[grp][b] = cell;
      });
      if (r.date) {
        var wk = weekKeyOf(r.date);
        if (wk) {
          var wa = st.weeks[wk];
          if (!wa) wa = st.weeks[wk] = { n: 0, sp: 0, sr: 0, eN: 0, eSP: 0, eSR: 0 };
          wa.n++; wa.sp += r.pred; wa.sr += r.real;
          if (r.elig) { wa.eN++; wa.eSP += r.pred; wa.eSR += r.real; }
        }
      }
      added++;
    });
    if (added) {
      st.updated = Date.now();
      if (!saveStore(rk, st)) return -1;
    }
    return added;
  }

  /* v4.4: clusterSummary — one observation per week. Returns null if fewer
     than 3 usable weeks (too few for a cluster SE). */
  function clusterSummary(weeks, mode) {
    if (!weeks) return null;
    var keys = Object.keys(weeks);
    var weekResiduals = [];   // one entry per usable week
    for (var i = 0; i < keys.length; i++) {
      var w = weeks[keys[i]];
      var nw = mode === 'elig' ? (w.eN || 0) : (w.n || 0);
      if (!(nw > 0)) continue;
      var swP = mode === 'elig' ? (w.eSP || 0) : (w.sp || 0);
      var swR = mode === 'elig' ? (w.eSR || 0) : (w.sr || 0);
      weekResiduals.push((swR - swP) / nw);
    }
    var nW = weekResiduals.length;
    if (nW < 3) return null;
    var sum = 0, k;
    for (k = 0; k < nW; k++) sum += weekResiduals[k];
    var bias = sum / nW;
    var ss = 0;
    for (k = 0; k < nW; k++) ss += Math.pow(weekResiduals[k] - bias, 2);
    var sd = Math.sqrt(ss / (nW - 1));
    var se = sd / Math.sqrt(nW);
    return { bias: bias, se: se, z: se > 0 ? bias / se : 0, nWeeks: nW };
  }

  /* v4.4: summarizeAcc now prefers clusterSummary. Row-level accumulators
     still feed the pooled display means, which is what the UI shows. The
     verdict uses cluster bias and SE. Falls back to row-level + n/4 when
     the cluster has too few weeks (e.g. legacy stores or a very new
     calibration run). */
  function summarizeAcc(g, weeks, mode) {
    if (!g || !g.n) return { n: 0, verdict: 'collecting' };
    var n = g.n, mp = g.sp / n, mr = g.sr / n;
    var varP = g.spp / n - mp * mp;
    var slope = varP > 1e-6 ? (g.spr / n - mp * mr) / varP : null;
    var sdPred = Math.sqrt(Math.max(0, varP));
    var result = {
      n: n,
      meanPredicted: mp, meanRealized: mr, meanRawPredicted: g.sraw / n,
      meanRealizedRaw: g.srw != null ? g.srw / n : null,   // v4.5 (F4): raw, undetrended realized P&L
      slope: slope, sdPredicted: sdPred,
      /* "consistent" means INTERNALLY COHERENT: predicted and realized are
         detrended by the same drift. meanRealizedRaw answers "did it make
         money". The walk-forward uses the own-history layer only (no
         calibration / ML), so it validates that layer, not the blend. */
      basis: 'predicted_own_history_ev_vs_realized_detrended_pnl'
    };
    var cluster = clusterSummary(weeks, mode);
    if (cluster) {
      result.bias = cluster.bias;
      result.stdErr = cluster.se;
      result.z = cluster.z;
      result.nWeeks = cluster.nWeeks;
      result.effectiveN = cluster.nWeeks;
      result.method = 'cluster';
      result.rowBias = mr - mp;
    } else {
      var bias = mr - mp;
      var varD = Math.max(0, g.sdd / n - Math.pow(g.sd / n, 2));
      var nEff = n / 4;
      var se = Math.sqrt(varD / Math.max(1, nEff));
      result.bias = bias;
      result.stdErr = se;
      result.z = se > 0 ? bias / se : 0;
      result.effectiveN = nEff;
      result.method = 'row';
    }
    var verdict = n < 100 ? 'collecting' : (result.z < -2 ? 'overconfident' : (result.z > 2 ? 'conservative' : 'consistent'));
    if (verdict === 'consistent' && n >= 300 && sdPred >= 0.2 && slope != null && slope < 0.3) verdict = 'weak-ranking';
    result.verdict = verdict;
    /* compat aliases */
    result.nEff = result.effectiveN;
    result.weeks = result.nWeeks != null ? result.nWeeks : null;
    return result;
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
      all: summarizeAcc(st.all, st.weeks, 'all'),
      elig: summarizeAcc(st.elig, st.weeks, 'elig'),
      binsAll: ba, binsElig: be,
      weeksStored: st.weeks ? Object.keys(st.weeks).length : 0,
      topBucket: top,
      updatedAt: st.updated || null,
      ageDays: st.updated ? (Date.now() - st.updated) / 86400000 : null
    };
  }

  function reliabilityVerdict(key) {
    try {
      var core = reliabilityCore(key);
      var g = core.elig && core.elig.n >= 100 ? core.elig : core.all;
      return g ? g.verdict : 'collecting';
    } catch (e) { return 'collecting'; }
  }

  function reliabilityStatus(key) {
    var out = reliabilityCore(key);
    out.trust = buildTrust(out, key);
    return out;
  }

  /* v4.4: gateReport uses the same cluster estimator as the reliability
     bias. For each week with BOTH eligible and non-eligible rows, the
     week's eligible-minus-non-eligible mean gap is one observation;
     aggregate = mean, SE = sd/sqrt(N_weeks). Fallback to the old row
     path when fewer than 4 usable weeks. */
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

    var weekDiffs = [];
    if (st.weeks) {
      var keys = Object.keys(st.weeks);
      for (var i = 0; i < keys.length; i++) {
        var w = st.weeks[keys[i]];
        var nE = w.eN || 0;
        var nNE = (w.n || 0) - nE;
        if (!(nE > 0) || !(nNE > 0)) continue;
        var meanE = (w.eSR || 0) / nE;
        var meanNE = ((w.sr || 0) - (w.eSR || 0)) / nNE;
        weekDiffs.push(meanE - meanNE);
      }
    }

    if (weekDiffs.length >= 4 && e.n >= 50 && nn.n >= 50) {
      var s = 0, k;
      for (k = 0; k < weekDiffs.length; k++) s += weekDiffs[k];
      var bias = s / weekDiffs.length;
      var ss = 0;
      for (k = 0; k < weekDiffs.length; k++) ss += Math.pow(weekDiffs[k] - bias, 2);
      var sd = Math.sqrt(ss / (weekDiffs.length - 1));
      var se = sd / Math.sqrt(weekDiffs.length);
      out.edge = bias;
      out.z = se > 0 ? bias / se : 0;
      out.nWeeks = weekDiffs.length;
      out.method = 'cluster';
    } else if (e.n >= 100 && nn.n >= 100) {
      out.edge = e.meanRealized - nn.meanRealized;
      var se2 = Math.sqrt(e.varRealized / Math.max(1, e.n / 4) + nn.varRealized / Math.max(1, nn.n / 4));
      out.z = se2 > 0 ? out.edge / se2 : 0;
      out.method = 'row';
    }
    if (out.z != null) {
      out.verdict = out.z > 2 ? 'gate-adds-value' : (out.z < -2 ? 'gate-hurts' : 'gate-no-better');
    }
    return out;
  }

  /* ── Live tracking ───────────────────────────────────────────────────── */
  function liveKey(cfg) { return (cfg.live && cfg.live.key) || 'stox_ev_live_v1'; }
  function loadLive(cfg) { var d = loadStore(liveKey(cfg)); if (!d.records) d.records = []; return d; }

  /* v4.4.1: expose the "latest assessment" of an open episode so the caller
   can warn the user that the signal/plan changed since the episode opened,
   WITHOUT creating a second record and WITHOUT changing the scorecard
   settlement. recordPrediction() below is a boolean wrapper for backward
   compatibility. */
  function recordPredictionDetailed(best, opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var daily = opts.dailyCandles || [];
    var symbol = opts.symbol || (best && best.symbol);
    if (!best || !best.expectedValue || !symbol || !daily.length) {
      return { recorded: false, reason: 'invalid_input' };
    }
    var signalDate = String(daily[daily.length - 1].t).slice(0, 10);
    var id = symbol + '|' + signalDate;
    var st = loadLive(cfg);

    /* v4.5 (F9): attach the latest assessment + change flags to an existing
       record (shared by the same-day and open-episode paths). Settlement is
       unchanged: rec.pred / rec.h / rec.t / rec.mode stay frozen at the first
       prediction — the latest sub-object only INFORMS the caller. */
    function attachLatest(rec) {
      var latest = {
        date: signalDate,
        pred: best.expectedValue.netPct,
        decision: best.decision ? best.decision.code : null,
        score: best.setupQuality,
        h: best.horizonDays,
        t: best.targetPct,
        stop: best.stopPct,
        mode: best.exitMode || 'fixed',
        ts: Date.now()
      };
      var planChanged = rec.h !== latest.h || rec.t !== latest.t || (rec.mode || 'fixed') !== latest.mode;
      var predDelta = (rec.pred != null && latest.pred != null) ? latest.pred - rec.pred : null;
      var scoreDelta = (rec.score != null && latest.score != null) ? latest.score - rec.score : null;
      var anyChange = planChanged ||
        (predDelta != null && Math.abs(predDelta) > 0.05) ||
        (scoreDelta != null && Math.abs(scoreDelta) >= 5);
      rec.latest = latest;
      rec.latestChanged = anyChange;
      rec.latestDelta = { planChanged: planChanged, predDelta: predDelta, scoreDelta: scoreDelta };
      return anyChange;
    }

    /* Same-day rescan of the same symbol: never a second record. v4.5 (F9):
       also record the latest assessment so the caller can warn that the signal
       changed since the episode opened (this used to be a silent no-op). */
    for (var i = 0; i < st.records.length; i++) {
      if (st.records[i].id === id) {
        var anyC = attachLatest(st.records[i]);
        saveStore(liveKey(cfg), st);
        return {
          recorded: false, reason: 'same_day', existing: st.records[i],
          changes: st.records[i].latestDelta, anyChange: anyC
        };
      }
    }

    /* Persistent Buy while the open episode's holding window still covers
       today's signal bar: do NOT create a second (overlapping) record — the
       trade is already on. DO record the latest assessment on the open one;
       settlement still uses the frozen first prediction.
       v4.5 (F9): blocking is window-aware — once the holding window is over
       (settlement lagging), a new episode may start instead of being blocked
       indefinitely. */
    for (var j = 0; j < st.records.length; j++) {
      if (st.records[j].symbol === symbol && st.records[j].status === 'open') {
        var rec = st.records[j];
        var elapsed = null, kNow = daily.length - 1, q;
        for (q = 0; q < daily.length; q++) {
          if (String(daily[q].t).slice(0, 10) === rec.date) { elapsed = kNow - q; break; }
        }
        if (elapsed == null) {
          var oA = dayOrdinal(signalDate), oB = dayOrdinal(rec.date);
          if (oA != null && oB != null) elapsed = oA - oB;
        }
        if (elapsed != null && elapsed >= Math.max(1, num(rec.h, 1))) continue;   // window over: not blocking
        var anyChange = attachLatest(rec);
        saveStore(liveKey(cfg), st);   /* best-effort; not required for scorecard integrity */
        return {
          recorded: false, reason: 'already_open', existing: rec,
          changes: rec.latestDelta, anyChange: anyChange
        };
      }
    }

    /* Fresh episode. */
    var currentExit = exitOpts(cfg);
    var decisionSnapshot = {
      decideAfterTax: cfg.decideAfterTax !== false,
      taxRatePct: num(cfg.taxRatePct, 0),
      taxLossCredit: num(cfg.taxLossCredit, 0),
      exit: { armFrac: currentExit.armFrac, trailFrac: currentExit.trailFrac, lockDelay: currentExit.lockDelay }
    };
    st.records.push({
      id: id, symbol: symbol, date: signalDate, signalDate: signalDate,
      entryDate: null, entryPrice: null, entryConvention: 'next_session_open',
      h: best.horizonDays, t: best.targetPct, stop: best.stopPct,
      cost: best.costsPct, mode: best.exitMode || 'fixed',
      decisionSnapshot: decisionSnapshot,
      pred: best.expectedValue.netPct, raw: best.expectedValue.rawBasisPct, pPos: best.expectedValue.pPositive,
      evid: best.evidenceConfidence, score: best.setupQuality, status: 'open', ts: Date.now()
    });
    var max = num(cfg.live && cfg.live.maxRecords, 1500);
    if (st.records.length > max) {
      var open = st.records.filter(function (r) { return r.status === 'open'; });
      var done = st.records.filter(function (r) { return r.status !== 'open'; }).slice(-(max - open.length));
      st.records = done.concat(open);
    }
    var ok = saveStore(liveKey(cfg), st);
    return {
      recorded: ok, reason: ok ? 'created' : 'write_failed',
      record: ok ? st.records[st.records.length - 1] : null
    };
  }

  /* Backward-compatible boolean wrapper. The app-core.js call site can stay
     as-is; callers that want the rich info can switch to
     recordPredictionDetailed. */
  function recordPrediction(best, opts) {
    try {
      return recordPredictionDetailed(best, opts).recorded === true;
    } catch (e) {
      return false;
    }
  }

  /* Pure read for the UI: is this symbol in an open episode, and has the
     signal changed since the episode opened? Returns null if not open. */
  function getOpenEpisode(symbol, opts) {
    var cfg = getConfig(opts && opts.config);
    var st = loadLive(cfg);
    for (var i = 0; i < st.records.length; i++) {
      if (st.records[i].symbol === symbol && st.records[i].status === 'open') {
        return {
          id: st.records[i].id,
          signalDate: st.records[i].signalDate,
          h: st.records[i].h, t: st.records[i].t,
          pred: st.records[i].pred, score: st.records[i].score,
          latest: st.records[i].latest || null,
          latestChanged: !!st.records[i].latestChanged,
          latestDelta: st.records[i].latestDelta || null
        };
      }
    }
    return null;
  }

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
      var muI = 0, mc = 0;
      for (var q = Math.max(1, i - cfg.lookbackBars + 1); q <= i; q++) {
        if (daily[q - 1].c > 0 && daily[q].c > 0) { muI += Math.log(daily[q].c / daily[q - 1].c); mc++; }
      }
      var removedI = (1 - clamp(num(cfg.driftKeep, 0.5), 0, 1)) * (mc ? muI / mc : 0);
      var snap = rec.decisionSnapshot || null;
      var settlementCfg = cfg;
      if (snap) {
        settlementCfg = {};
        Object.keys(cfg).forEach(function (key) { settlementCfg[key] = cfg[key]; });
        settlementCfg.decideAfterTax = snap.decideAfterTax !== false;
        settlementCfg.taxRatePct = snap.taxRatePct;
        settlementCfg.taxLossCredit = snap.taxLossCredit;
      }
      var settlementExit = snap && snap.exit ? snap.exit : exitOpts(cfg);
      var entryBar = daily[i + 1];
      if (entryBar && entryBar.o > 0) {
        rec.entryDate = String(entryBar.t).slice(0, 10);
        rec.entryPrice = entryBar.o;
      }
      var up = Math.log(1 + rec.t / 100), dn = Math.log(1 - rec.stop / 100);
      var o = windowOutcome(daily, i, rec.h, up, dn, removedI, rec.stop, rec.mode, settlementExit);
      if (!o) return;
      if (!complete && o.oP > 0) return;
      var v = outcomeValues(o, rec.t, rec.cost, settlementCfg);
      rec.real = settlementCfg.decideAfterTax !== false ? v.aft : v.pre;
      /* Parallel undetrended run for the "raw realized P&L" column. */
      var oRaw = windowOutcome(daily, i, rec.h, up, dn, 0, rec.stop, rec.mode, settlementExit);
      if (oRaw) {
        var vRaw = outcomeValues(oRaw, rec.t, rec.cost, settlementCfg);
        rec.realRaw = settlementCfg.decideAfterTax !== false ? vRaw.aft : vRaw.pre;
        rec.outcomeRaw = oRaw.tP >= 0.5 ? 'target' : (oRaw.sP >= 0.5 ? 'stop' : 'timeout');
        rec.detrend = removedI * 100 * rec.h;
      }
      rec.outcome = o.tP >= 0.5 ? 'target' : (o.sP >= 0.5 ? 'stop' : 'timeout');
      rec.status = 'settled'; rec.settledAt = Date.now();
      settled++; changed = true;
    });
    if (changed) saveStore(liveKey(cfg), st);
    return { settled: settled };
  }

  /* v4.4: explicit basis labels. The UI should use `labels` to render
     meanPredicted / meanRealized / meanRealizedRaw unambiguously;
     `rawVsModelGap` quantifies how much detrending shifted the number. */
  function livePerformance(opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var st = loadLive(cfg);
    var done = st.records.filter(function (r) { return r.status === 'settled' && isFinite(r.real); });
    var doneRaw = st.records.filter(function (r) { return r.status === 'settled' && isFinite(r.realRaw); });
    var openN = st.records.length - done.length;
    var out = { open: openN, settled: done.length, verdict: 'collecting', buckets: {} };
    out.labels = {
      meanPredicted: 'Predicted model EV (detrended, after costs)',
      meanRealized: 'Model-basis realized P&L (detrended, comparable to prediction)',
      meanRealizedRaw: 'Raw realized trading P&L (undetrended)',
      /* v4.5 (F3): the old string claimed "executable_pnl" for the DETRENDED
         number — exactly what the audit flagged. Both bases are now named. */
      comparisonBasis: 'predicted_model_ev_vs_realized_detrended_pnl',
      rawBasis: 'predicted_model_ev_vs_realized_raw_executable_pnl',
      note: 'meanRealized is on the same detrended basis as meanPredicted, so it validates the model ("consistent" = internally coherent). meanRealizedRaw shows what an actual trade would have made; the difference is the drift the model deliberately removes.'
    };
    if (!done.length) return out;
    var sp = 0, sr = 0, sd = 0, sdd = 0;
    done.forEach(function (r) { var d = r.real - r.pred; sp += r.pred; sr += r.real; sd += d; sdd += d * d; });
    var n = done.length, bias = (sr - sp) / n;
    var varD = Math.max(0, sdd / n - Math.pow(sd / n, 2));
    var avgHorizon = 0;
    done.forEach(function (r) { avgHorizon += Math.max(1, Number(r.h) || 1); });
    avgHorizon /= Math.max(1, n);
    /* v4.5 (F3): effective n = distinct SIGNAL WEEKS (same-week rows across
       symbols share market moves; the v4.2 horizon heuristic overcounted).
       Fallback to the horizon heuristic when dates are missing. */
    var weekSet = {};
    done.forEach(function (r) { var wk = r.date != null ? weekKeyOf(r.date) : null; if (wk) weekSet[wk] = 1; });
    var nWeeks = Object.keys(weekSet).length;
    var effectiveN = nWeeks || Math.max(1, n / Math.max(1, Math.min(avgHorizon, 10) / 2));
    var se = Math.sqrt(varD / Math.max(1, effectiveN));
    out.meanPredicted = sp / n;
    out.meanRealized = sr / n;
    if (doneRaw.length) {
      var srRaw = 0;
      doneRaw.forEach(function (r) { srRaw += r.realRaw; });
      out.meanRealizedRaw = srRaw / doneRaw.length;
      out.rawSampleN = doneRaw.length;
      out.rawVsModelGap = out.meanRealizedRaw - out.meanRealized;
    }
    out.bias = bias; out.stdErr = se;
    out.comparisonBasis = 'predicted_model_ev_vs_realized_detrended_pnl';
    out.rawBasis = 'predicted_model_ev_vs_realized_raw_executable_pnl';
    out.effectiveN = effectiveN; out.weeks = nWeeks; out.avgHorizonDays = avgHorizon;
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
    var eligible = [];
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
    fresh.reverse();
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
        var mu = 0, mc = 0;
        for (var q = Math.max(1, idx - cfg.lookbackBars + 1); q <= idx; q++) {
          if (daily[q - 1].c > 0 && daily[q].c > 0) { mu += Math.log(daily[q].c / daily[q - 1].c); mc++; }
        }
        var removedC = (1 - clamp(num(cfg.driftKeep, 0.5), 0, 1)) * (mc ? mu / mc : 0);
        cfg.horizons.forEach(function (h) {
          cfg.targets.forEach(function (t) {
            var oV = windowOutcome(daily, idx, h, Math.log(1 + t / 100), Math.log(1 - stopPct / 100), removedC, stopPct);
            if (!oV) return;
            var ov = outcomeValues(oV, t, costPct, cfg);
            rows.push({
              horizonDays: h, targetPct: t, setupScore: score, volClass: vc, stopPct: stopPct,
              w: 1 / Math.max(1, Math.ceil(h / 5)), win: oV.tP,
              val: cfg.decideAfterTax !== false ? ov.aft : ov.pre
            });
          });
        });
        if (doRel) {
          try {
            var res = optimize(
              { symbol: symbol, dailyCandles: slice, hourlyCandles: [], indexCandles: idxSlice },
              opts.config, { setupScoreOverride: score, noHist: true, skipGate: true }
            );
            var b = res && res.best;
            if (b && b.expectedValue) {
              var o2 = windowOutcome(daily, idx, b.horizonDays, Math.log(1 + b.targetPct / 100), Math.log(1 - b.stopPct / 100), removedC, b.stopPct, b.exitMode, exitOpts(cfg));
              if (o2) {
                var rv = outcomeValues(o2, b.targetPct, b.costsPct != null ? b.costsPct : costPct, cfg);
                /* v4.5 (F4): parallel undetrended run — the raw money P&L of
                   the same plan, reported next to the detrended realized. */
                var o2r = windowOutcome(daily, idx, b.horizonDays, Math.log(1 + b.targetPct / 100), Math.log(1 - b.stopPct / 100), 0, b.stopPct, b.exitMode, exitOpts(cfg));
                var rvr = o2r ? outcomeValues(o2r, b.targetPct, b.costsPct != null ? b.costsPct : costPct, cfg) : null;
                relRows.push({
                  date: date,
                  pred: b.expectedValue.netPct, raw: b.expectedValue.rawBasisPct,
                  real: cfg.decideAfterTax !== false ? rv.aft : rv.pre,
                  realRaw: rvr ? (cfg.decideAfterTax !== false ? rvr.aft : rvr.pre) : null,
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

    var outcomesAdded = recordOutcomes(rows, key);
    if (outcomesAdded < 0) { out.reason = 'store_write_failed'; return out; }
    out.rows = outcomesAdded;

    if (relRows.length) {
      var relAdded = recordReliability(relRows, key);
      if (relAdded < 0) { out.reason = 'reliability_write_failed'; return out; }
    }

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
    recordPredictionDetailed: recordPredictionDetailed,
    getOpenEpisode: getOpenEpisode,
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
    reliabilityVerdict: reliabilityVerdict,
    _test: {
      windowOutcome: windowOutcome, buildWindowWeights: buildWindowWeights,
      computeSizing: computeSizing, breakEvenTargetProb: breakEvenTargetProb,
      liquidityCostPct: liquidityCostPct, afterTax: afterTax,
      outcomeValues: outcomeValues, Phi: Phi,
      tripleBarrierWindows: tripleBarrierWindows,
      calibrationBucket: calibrationBucket, calibrationKeyPart: calibrationKeyPart,
      calibrationPriorStats: calibrationPriorStats,
      hierarchicalCalibrationPrior: hierarchicalCalibrationPrior,
      calibrationPriorStrength: calibrationPriorStrength,
      historicalProbability: historicalProbability,
      setupBlindPrior: setupBlindPrior,
      combineProbability: combineProbability,
      weekKeyOf: weekKeyOf,
      clusterSummary: clusterSummary
    }
  };
})();