/* ══════════════════════════════════════════════════════════════════════
   StoX Expected Value & Probability-Calibrated Trade Engine
   Version 4.8  (EV_V4_ENGINE)

   v4.9.2 -> v4.9.3 (ev-ab-test-v3 root-cause fix set; BASIS CHANGE -
   BASIS_REV 4 -> 5: stored predictions change, the calibration family and
   the row store rebuild once on upgrade):
     1. AS-OF PRIOR ANCHOR (P0, look-ahead fix): the v4.9 zero-edge anchor
        read walkForwardMean() = the LIFETIME reliability mean, while
        calibrateFromHistory backfills dates out of order - so historical
        rows were anchored on outcomes still in their FUTURE (and live
        decisions were not: a walk-forward/live mismatch). The harness's
        as-of variant (strictly earlier weeks only) was the ONLY score
        change that improved ranking significantly (dIC +0.021, t=2.32,
        FDR **). walkForwardMean(key, asOfDate) now aggregates the per-week
        reliability sums (rel.weeks, ISO week keys) for weeks STRICTLY
        EARLIER than the scored week, and prepare() passes the signal date
        (last completed session) as the as-of boundary. When the store has
        no per-week data the anchor stays OFF (never a lifetime mean).
     2. CHRONOLOGICAL BACKFILL (P0): calibrateFromHistory processed its
        first fill newest-first, so the anchor's minRows warm-up never saw
        earlier weeks. Retention is unchanged (the newest `cap` weekly
        dates per symbol) but dates are now processed oldest-to-newest;
        forward extension stays ascending, past extension stays
        boundary-first (the [oldest, newest] ledger never gains gaps).
     3. ADAPTIVE HAIRCUT SWITCH REMOVED (P0): selectionHaircutMeta used to
        drop the haircut entirely while reliabilityVerdict() ===
        'conservative' (v4.3 #12). That switch was NOT in the calibration
        signature - one basis could silently mix two scoring formulas and
        poison every later A/B/retune. Scoring policy no longer mutates
        with store contents.
     4. FITTED SCORE COEFFICIENTS (scoreFit, P1): the score can now be the
        fitted joint predictor
            priorMean + b1 x lam x (basisEV - priorMean) - b2 x haircut
        with SEPARATE haircut coefficients for Buy-grade rows (b2Buy) -
        the A/B showed the haircut's ranking value lives outside the
        tradeable pool (dIC t=-0.27 inside Buy-grade vs FDR ** pooled), so
        one global haircutCoef cannot serve both populations. It also
        stops the penalty from dominating the score variance (sd(-haircut)
        0.17-0.20 vs sd(signal) 0.09: corr(score, signal) was 0.07-0.20).
        retuneTuning() now returns .suggested (evPriorStdPct + scoreFit
        with per-eligibility b2) and applyTuning() persists it through the
        stox_ev_ui_config channel. scoreFit.enabled=false (default) keeps
        bit-identical v4.9.2 scoring; b1 defaults to 1.
     5. SELECTION BIAS TERM (selectionBias, P1, DEFAULT OFF): optional
        max-of-N correction for the best-of-(h,t,mode) winner,
        coef x stdErrPct x sqrt(2 ln planCount), clamped to maxPct and
        subtracted after shrinkage like the haircut. Uses the stored
        selection features (planCount/winnerGapPct). Set coef small
        (0.2-0.4); do not stack at full strength with haircutCoef=1.
        Off until validated on holdout rows.
     6. REGIME -> VETO ONLY (P2): the A/B found no out-of-sample regime
        effect (oosR2 -0.07 / -0.17), so regime.mismatchWeight defaults to
        0 (history windows are no longer reweighted by regime mismatch;
        the regime is still computed and reported for app-level vetoes)
        and evidenceConfidence no longer credits regime (new
        evidenceRegimePoints, default 0; was up to 15/100 of the evidence
        gate). evidenceRegimePoints=15 restores v4.9.2 behaviour.
     7. SHADOW GATE (shadowGate, P2; enabled by default, monitor-only): a
        second, looser gate below QUALIFIED_TRADE returning decision.code 'SHADOW_QUALIFIED'
        (monitor-only - no consumer trades it; the traded codes are
        unchanged) so near-miss rows stay identifiable while the strict
        gates are recalibrated on clean rows. The row store already keeps
        every priced plan, so the learning set is unaffected.
     8. ROWS CARRY THE SCORE RECIPE (P2): rowStoreShape gains signalScale
        (effective b1), shrinkFactor and selBiasPct so the A/B harness and
        the tuner reproduce stored predictions exactly.
     Also: retuneTuning({asof:true}) de-contaminates stored priors before
     fitting (as-of re-anchoring incl. the (1-lam) chain factor), so old
     backfilled rows can still be used for fitting.

   v4.9 -> v4.9.1 (holdout-harness gate fix, decision layer only):
     The first v2 harness run on 20,366 walk-forward rows (63 weeks) confirmed
     the gating diagnosis with significance: the top-20% Buy-grade picks by the
     current score realized -0.73% per plan (t = -2.38) - WORSE than the pool
     mean (-0.56%) - while every ranking variant stayed within noise of the
     current one (the pre-registered holdout rejected the fit-period winner,
     haircut x0.25, at dIC -0.031, FDR **). Fix the gate, not the ranking:
       - minNetEV 0.30 -> 0.50
       - minPositiveProbability 0.55 -> 0.60
     These are DECISION gates only (classify()) - stored predictions, the
     basis signature and the calibration family are untouched, so there is
     NO basis rotation and no store rebuild on upgrade. HIGH_CONVICTION
     thresholds are unchanged. Success metric on the next harness run:
     top% elig >= 0.

   v4.8 -> v4.9 (ev-ab-test P1/P2 fix set):
     1. ZERO-EDGE PRIOR ANCHOR (priorAnchor, P1): m0 (costs/tax only, ~-0.24%)
        sat well above the observed walk-forward mean realized (-0.56% all /
        -0.72% Buy-grade detrended in the ev-ab-test sample), flattering
        P(true EV > 0) through Phi(shrunk/postSd). m0 is now blended toward
        the reliability store's walk-forward realized mean: m0 += w x
        (wfMean - m0), default w = 0.35, gated at 100 settled rows. The pooled
        bucket prior still adds setup-specific information on top. Final
        basis sentences about tax note the effective basis via
        zeroEdgePriorPct (anchored) and priorAnchorPct/priorAnchorWeight.
     2. REPEATED-SPLIT HAIRCUT (P1): the winner's-curse estimate now averages
        over three deterministic partitions of the window sample (halves,
        first-vs-last third, odd-vs-even) instead of trusting one cut - same
        estimator, lower variance. tb.splits carries the two extra pairs.
     3. HAIRCUT COUNT-SHRINK (haircutShrink.k, P1, default 0 = OFF): optional
        shrink of the haircut toward 0 by candidate count, nValid/(nValid+k).
        Shipped OFF because the A/B could not validate it; decide with the
        new holdout harness before turning it on.
     4. SELECTION FEATURES (P1): expectedValue.selectionCandidates (plan
        count) and winnerGapPct (winner's utility margin) are recorded and
        stored in the row store - features for the fitted score, not more
        hard-coded penalties.
     5. ROWS CARRY A SYMBOL HASH (P2): rowStoreShape gains sym =
        shortHash(symbol), planCount, winnerGapPct, so the A/B harness can
        de-duplicate and cluster per symbol; rows still store no raw symbol.
     6. PER-ELIGIBILITY FITS (P1): retuneTuning() reports byElig fits - the
        A/B showed the haircut's ranking value lives mostly outside
        Buy-grade, so one global coefficient may be wrong for the rows that
        actually trade. The engine still applies one global haircutCoef; the
        tuner flags divergence.
     7. NEGATIVE-POOL GATING SIGNAL (P2): buildTrust raises a caution when the
        week-clustered raw realized mean is below zero with t < -2 - ranking
        well inside a losing pool still loses money; the message points at
        the EV gates instead of the ranking.
     8. BASIS: priorAnchor + haircutShrink enter the calibration signature and
        BASIS_REV is bumped 2 -> 3 (the anchor changes stored predictions).

   v4.7.2 -> v4.8 (ev-ab-test feedback: score identification & decomposition):
     1. SIGNAL-ONLY TAU IDENTIFICATION (retuneTuning): the A/B re-scoring of
        20,264 walk-forward rows showed the score's cross-sectional variance
        is dominated by the selection haircut (corr(score, -haircut) =
        0.95-0.97 vs 0.17-0.20 for the shrunk signal), so the v4.6 retune -
        which regressed REALIZED on the FULL score - was fitting tau against
        haircut variance that tau cannot fix (the 0.48 -> 0.19 slope never
        resolved). retuneTuning() now identifies tau from the SIGNAL
        component alone: per tau-grid point a joint OLS
            realized - priorMean = b1 x signal(tau) + b2 x (-haircutRaw)
            signal(tau) = lam(tau) x (basisEV - priorMean)
        is fitted, and the best tau is the one whose b1 is closest to 1
        (the coefficient the scoring formula puts on the signal). The old
        retuneTau() is kept as a compatibility wrapper (same return shape;
        its 'slope' is now the signal coefficient, not the full-score slope).
     2. HAIRCUT AS A FITTED REGRESSOR (haircutCoef): the best-of-N penalty is
        no longer hard-subtracted at coefficient 1. DEFAULTS.haircutCoef
        (default 1 = exactly v4.5-v4.7 behaviour) scales the penalty in
        finalizePlan; retuneTuning reports the joint-fit b2 as the suggested
        haircutCoef (clamped 0..1.5). expectedValue.haircutPct now reports
        the EFFECTIVE penalty (coef x raw) so every consumer (UI, row store,
        explanation text, the A/B recompute check) keeps reading 'what was
        actually subtracted'; haircutRawPct / haircutCoef carry the raw
        split-half estimate and the coefficient.
     3. ROW STORE: rows carry haircutRawPct + haircutCoef next to the
        effective haircutPct; pre-v4.8 rows fall back to haircutPct as the
        raw estimate (they were stored at coefficient 1).
     4. BASIS: haircutCoef is part of the calibration signature, so a
        coefficient change rotates the live store and rebuilds the
        calibration family automatically. BASIS_REV is deliberately NOT
        bumped - at coef = 1 the v4.8 predictions are bit-identical to
        v4.7.2. (The signature hash itself changes once on upgrade because
        the canon gains a field; that one-time background rebuild is noted
        here so it is not mistaken for drift.)

   v4.7.1 -> v4.7.2 (duplicate-episode fix set):
     1. RECENT-RESULTS DEDUP: the same episode can live in several basis
        stores (it was re-logged after a model/config change rotated the live
        store while the trade was still open), so the "Recent results" strip
        showed the identical trade 2-3 times with bit-identical P&L.
        recentResults() now dedupes by record id (symbol|signalDate), keeping
        the current-basis store's copy (liveStoreKeys lists it first), and
        rounds target/stop percentages so chips never print raw floats like
        -5.3337585533684%.
     2. CROSS-STORE EPISODE GUARD: recordPredictionDetailed() only deduped
        inside the current-basis store. Before creating a fresh episode it now
        sweeps EVERY basis store: if any store already holds the same
        signal date, or an open episode whose holding window still covers
        today, the record is NOT re-created (reason 'same_day' /
        'already_open' with otherBasis: true). One trade = one live record;
        older-basis records keep settling on their own snapshot basis.

   v4.5 -> v4.6 (audit feedback fix set A-E):
     A. BASIS SIGNATURE (feedback A): the store signature now hashes a
        canonical dump of every parameter that decides what is stored -
        outcome labels (driftKeep, lookbackBars, stopATR, minStopPct,
        maxStopPct, horizons, targets) plus the stored-prediction basis
        (evPriorStdPct, defaultHorizon, selectionHaircut, minWindows,
        recency, regime) plus the economics - together with a BASIS_REV
        constant bumped by hand whenever replay/optimizer logic changes.
        On ANY mismatch - or when no signature exists (unknown basis) -
        the whole family (calibration, meta, reliability) is cleared and
        rebuilds in the background. adoptCurrentBasis() keeps existing
        data when nothing changed since the build. Live records snapshot
        driftKeep + lookbackBars at prediction time and settlement uses
        the snapshot (old records fall back to the current config).
     B. ATOMIC BATCH COMMITS (feedback B): calibration + reliability + meta
        now live in ONE envelope record committed with a single setItem
        (atomic per setItem); any failure propagates and leaves every
        store untouched, so a retry can no longer double-count dates. The
        loadParts()/commitBatch() seam ports straight over to one IndexedDB
        transaction across stores (the proper fix for the quota cost).
     C. RAW-BASIS REPORTING (feedback C): per-week aggregates gain raw
        realized sums (srw/eSRW); gateReport returns BOTH gaps (raw +
        detrended) with z-scores and the verdict runs on RAW money; the
        self-check keeps the detrended comparison and gains a separate
        raw-money line with a week-clustered standard error.
     D. SHRINKAGE STRENGTH (feedback D): evPriorStdPct 0.5 -> 0.3. The
        Buy-grade slope of realized on predicted was 0.48; target
        lambda' = 0.48*lambda solved back through tau'^2 = lambda'*s^2 /
        (1-lambda') with a typical s~0.55 gives tau'~0.29 - 0.3 is the
        partway move (rebuild and re-read the slope before trusting one
        estimate). Optional extra shipped: row-level prediction store
        (unshrunk EV, stdErr, horizon, haircut; IndexedDB when available,
        capped in-memory otherwise) plus retuneTau(), which re-tunes the
        prior offline in milliseconds without a replay. The live store name
        now derives from the basis signature (stox_ev_live_<hash>), so model
        changes rotate the scorecard automatically — no manual key bumps;
        older-basis episodes keep settling on their own snapshotted basis.
        Follow-up: fully-settled old-basis stores idle for
        live.keepSettledDays (default 90) are rolled up into a tiny tombstone
        summary (basis, n, means, date range) and pruned; stores with open
        records and the current basis are never pruned.
     E. SIGNIFICANCE-BASED FLAGS (feedback E): per-bin weekly aggregates
        give the EV-bucket verdicts a week-clustered z-score (the raw gap
        threshold is only a legacy fallback); summarizeAcc reports a slope
        standard error and the trust line says so when the slope is
        clearly below 1 ("predictions vary about Nx as much as outcomes");
        the all-setups weak-ranking verdict stays visible even when
        Buy-grade has 100 or more rows.
     COSTS (user decision): default slippage 0.05 -> 0 %/side — fills are
        consistently at/near the open; round-trip costs are now the
        statutory stack (~0.24%), matching the official fee schedule
        (STT 0.20 + stamp 0.015 + txn 0.006 + SEBI/GST ~0.002 + DP ~0.016).
        The basis signature picks the change up automatically: the
        calibration family resets and the live store rotates on next load.

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

  var VERSION = 'EV-4.9.3';

  var DEFAULTS = {
    horizons: [3, 5, 10, 15, 20],
    targets: [2, 3, 4, 5, 6],
    defaultHorizon: 10,
    defaultTargetPct: 4,
    /* v4.9.1 (holdout-harness gate fix): raised from 0.30 / 0.55 - the
       top-20% Buy-grade picks realized -0.73% per plan (t = -2.38) under the
       old gates. Decision layer only (classify()); no basis change. */
    minNetEV: 0.50,
    minPositiveProbability: 0.60,
    minEvidence: 60,
    minEvConfidence: 0.80,
    /* v4.9.3 (P2): max points evidenceConfidence may credit to the index
       regime. Default 0 = regime is VETO-ONLY (the A/B found no
       out-of-sample regime effect, oosR2 < 0); 15 restores v4.9.2. */
    evidenceRegimePoints: 0,
    /* v4.4+: not a dilution blend any more (see combineProbability). The
       historical layer contributes its setup-specific lift at full strength;
       these weights now only set the ML share against the combined model
       (statistical + historical = 0.80 vs ml = 0.20 when ML fires). */
    blend: { statistical: 0.55, historical: 0.25 },   /* legacy, unused since v4.4; the ML share was removed in v4.7 */
    /* v4.7: forming-candle (intraday) policy. NOT part of the calibration signature
       (live decisions only; calibration backtests run on historical slices).
       partialBar 'exclude': the daily/index series fed to every statistic, the setup
         score and the scorecard contains COMPLETED sessions only (a half-formed bar has
         partial range/volume/ATR and is not comparable to the calibration buckets);
         today's price enters through the hourly data and the live price below.
         'include' keeps whatever the caller passed (v4.6 behaviour).
       remainingDistance: levels stay anchored to the last COMPLETED close; entry is the
         live price, so target/stop distances are re-measured from it before the
         window statistics and the EV are computed.
       maxMovePct: beyond this intraday move the plan is not priced (status 'move_too_large'). */
    intraday: { enabled: true, partialBar: 'exclude', remainingDistance: true, maxMovePct: 8, minTargetPct: 0.5, minStopPct: 0.5, negligibleMovePct: 0.1 },
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
      slippage: 0,             // fills at/near the open (user-confirmed) -> NO modeled slippage; round-trip costs are now the statutory stack (~0.24%), matching the official fee schedule. If entries ever become market orders, set 0.05%/side again: zero slippage overstated the shrunk EV by ~0.1-0.25%/trade against the 0.30% minNetEV gate.
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
    /* v4.6 (feedback D): 0.5 -> 0.3. Buy-grade realized-on-predicted slope
       was 0.48 (predictions ~2x too dispersed); target lambda' = 0.48*lambda
       solved back through tau'^2 = lambda'*s^2/(1-lambda') with a typical
       s~0.55 gives tau'~0.29. 0.3 is the partway move - rebuild and re-read
       the slope (now reported with its standard error) before tightening
       further; retuneTau() + the row-level store re-tune this offline. */
    evPriorStdPct: 0.3,             // prior sd of the TRUE gross edge per trade at h=defaultHorizon, % (shrinkage strength); scales with sqrt(h/defaultHorizon) so lambda is horizon-neutral
    selectionHaircut: true,
    /* v4.8: multiplier on the best-of-N selection haircut (1 = v4.5-v4.7
       behaviour: subtract the full split-half estimate after shrinkage).
       Fitted offline by retuneTuning() (joint OLS of realized on the shrunk
       signal and the raw haircut); part of the calibration signature, so
       changing it rotates the live store and rebuilds calibration. */
    haircutCoef: 1,
    /* v4.9 (P1): blend the zero-edge prior m0 toward the walk-forward
       empirical realized mean (detrended basis, from the reliability store).
       weight = min(maxWeight, ...) applied only once minRows settled rows
       exist; enabled:false restores the pure cost/tax prior. Part of the
       calibration signature. */
    priorAnchor: { enabled: true, maxWeight: 0.35, minRows: 100, population: 'elig' },
    /* v4.9 (P1): count-shrink of the selection haircut toward 0,
       haircut x nValid/(nValid + k). Default 0 = OFF (the A/B could not
       validate the shrink; decide with the holdout harness first). */
    haircutShrink: { k: 0 },
    /* v4.9.3 (P1): fitted score coefficients (retuneTuning().suggested +
       applyTuning()). enabled:false = classic scoring (bit-identical to
       v4.9.2). When enabled, the score is
         priorMean + b1 x lam x (basisEV - priorMean) - b2 x haircut
       with b2Buy used instead of b2 for Buy-grade plans (setup score >=
       buyThreshold): the A/B found the haircut ranks outside Buy-grade
       only, so the tradeable pool wants its own coefficient. b2/b2Buy
       null = fall back to haircutCoef. Part of the basis signature. */
    scoreFit: { enabled: false, b1: 1, b2: null, b2Buy: null },
    /* v4.9.3 (P1, DEFAULT OFF): parametric max-of-N selection bias for the
       winning plan, subtracted after shrinkage:
         coef x stdErrPct x sqrt(2 ln max(2, planCount)), clamped to maxPct.
       Complements the split-half haircut at the source of the winner's
       curse (best-of-(h,t,mode)); keep coef small (0.2-0.4) and do not
       stack at full strength with haircutCoef=1. coef 0 = off. */
    selectionBias: { coef: 0, maxPct: 3 },
    scoreGapFree: 8,
    scoreGapRange: 25,
    stopATR: 1.8,
    maxStopPct: 6.0,
    minStopPct: 1.5,
    lookbackBars: 500,
    minWindows: 30,
    driftKeep: 0.5,
    /* v4.4: v9 cleared — reliability store gains per-week aggregates that
       cannot be reconstructed from v9's week-key set.
       v4.6 (feedback B): v12 — ONE atomic envelope (calibration +
       reliability + meta under <key>_txn); legacy v11 keys are not
       migrated (the basis-signature reset rebuilds the family anyway). */
    calibrationKey: 'stox_ev_calibration_v12',

    gate: { includeWatch: false, includeAvoid: false },
    /* v4.9.3 (P2): shadow tier below QUALIFIED_TRADE - plans that fail the
       strict gates but clear these looser ones get decision.code
       'SHADOW_QUALIFIED' (monitor only; the traded codes and every
       consumer filter are unchanged). Lets near-miss rows stay visible
       while minNetEV & friends are recalibrated on clean rows. */
    shadowGate: { enabled: true, minNetEV: 0.30, minPositiveProbability: 0.55, minEvConfidence: 0.75, minEvidence: 50 },
    exitVariants: ['fixed'],
    exit: { armFrac: 0.5, trailFrac: 0.6 },
    lockedLimitDelay: true,
    recency: { halfLifeBars: 250 },
    regime: { enabled: true, mismatchWeight: 0, trendBars: 50, volBars: 20, minIndexBars: 80 },
    pooledPrior: { enabled: true, minN: 30, k: 60, maxWeight: 0.5 },
    liquidity: { enabled: false, impactCoef: 0.5, maxPerSidePct: 1.0, advBars: 20 },
    sizing: { kellyFraction: 0.25, maxPositionPct: 20, maxRiskPerTradePct: 1.0 },
    correlation: { lookbackBars: 120, minOverlap: 60, threshold: 0.7, penalty: 0.5, maxPicks: 5, maxPerGroup: 1, groupPrefixes: ['ADANI', 'TATA', 'BAJAJ'] },
    /* v4.4: v4 cleared — record id changes from symbol|date|h|t|mode
       to symbol|signalDate, incompatible with existing rows.
       v4.6: `key` is now a BASE PREFIX — the actual store name is derived
       from the basis signature (liveBase + '_' + sig hash), so model changes
       rotate the scorecard automatically instead of needing manual bumps.
       keepSettledDays: pruning policy for OLD-basis stores — a non-current
       store that is fully settled and idle for N days (default 90 = 3x the
       20-bar settlement bound and one quarter of out-of-sample comparison
       per model basis) is rolled up into a tiny tombstone summary and
       removed; stores with open records and the current-basis store are
       NEVER pruned. 0 disables. Deliberately NOT part of the basis
       signature (storage hygiene, not model basis). */
    live: { key: 'stox_ev_live', maxRecords: 4000, keepSettledDays: 90 },
    staleCalibrationDays: 21,
    noTrade: { minPPositive: 0.5 },
    upside: { horizons: [3, 5, 10, 15, 20], targets: [2, 3, 4, 5, 6], shrinkK: 8 }
  };

  /* Clear stores incompatible with this build. */
  try {
    ['', '_meta', '_rel', '_sig', '_txn'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v11' + sfx); });  // v11 legacy separate keys; v12 is the atomic _txn envelope
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v10' + sfx); });  // v10 _rel accumulator has no srw (raw realized sum); v11 rebuilds it
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v9' + sfx); });
    ['', '_meta', '_rel', '_sig'].forEach(function (sfx) { localStorage.removeItem('stox_ev_calibration_v8' + sfx); });
    localStorage.removeItem('stox_ev_live_v7');               // literal v-names are legacy; v4.6 stores are name-derived (stox_ev_live_<sig hash>) and kept for settlement
    localStorage.removeItem('stox_ev_live_v6');               // v6 predictions were made with tau=0.5
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

    /* v4.9: two extra deterministic splits (first-vs-last third, odd-vs-even)
       so selectionHaircutMeta can average the winner's-curse estimate over
       partitions instead of trusting the single halves cut. */
    var t3 = Math.floor(m / 3), qA = 0, qAw = 0, qB = 0, qBw = 0, oA = 0, oAw = 0, eB = 0, eBw = 0;
    for (i2 = 0; i2 < t3; i2++) { qA += ws[i2] * vals[i2]; qAw += ws[i2]; }
    for (i2 = m - t3; i2 < m; i2++) { qB += ws[i2] * vals[i2]; qBw += ws[i2]; }
    for (i2 = 0; i2 < m; i2++) {
      if (i2 % 2 === 0) { oA += ws[i2] * vals[i2]; oAw += ws[i2]; }
      else { eB += ws[i2] * vals[i2]; eBw += ws[i2]; }
    }

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
      splits: [
        [t3 > 0 && qAw > 0 && qBw > 0 ? qA / qAw : null, t3 > 0 && qAw > 0 && qBw > 0 ? qB / qBw : null],
        [oAw > 0 && eBw > 0 ? oA / oAw : null, eBw > 0 ? eB / eBw : null]
      ],
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

  /* v4.6 (feedback B): atomic batch commit. calibration + reliability + meta
     live in ONE envelope record written with a single setItem (atomic per
     setItem): a failed batch leaves EVERY store untouched and a retry cannot
     double-count. loadParts()/commitBatch() are the only I/O seam - the
     IndexedDB version (one transaction across three object stores) replaces
     just these two functions. */
  function blankRel() {
    return { all: blankAcc(), elig: blankAcc(), bins: { all: [], elig: [] }, weeks: {} };
  }
  function loadParts(key) {
    key = key || DEFAULTS.calibrationKey;
    var env = loadStore(key + '_txn');
    if (env && env.v === 2) {
      if (!env.cal || typeof env.cal !== 'object') env.cal = {};
      if (!env.rel || typeof env.rel !== 'object') env.rel = blankRel();
      if (!env.meta || typeof env.meta !== 'object') env.meta = {};
      return env;
    }
    return { v: 2, cal: {}, rel: blankRel(), meta: {} };
  }

  /* v4.9 (P1): walk-forward realized means (detrended + raw) from the
     reliability accumulator - the empirical anchor for the zero-edge prior.
     Memoized because finalizePlan runs per plan and loadStore parses JSON on
     every call; the cache is invalidated on every batch commit and expires
     after 60s as a belt-and-braces bound.
     v4.9.3 (P0): AS-OF. With asOfDate the mean is rebuilt from the per-week
     aggregates (rel.weeks) for weeks STRICTLY EARLIER than the scored week,
     so a backfilled row can never anchor on outcomes that were still in its
     future (the ev-ab-test-v3 as-of variant, the only FDR-significant
     ranking improvement). If the store carries no per-week data the anchor
     stays OFF - a lifetime mean would re-introduce the leak. */
  var _wfMeanCache = { key: null, at: 0, val: null };
  function walkForwardMean(key, asOfDate, maxAgeMs) {
    var now = Date.now();
    var asOfWeek = asOfDate ? weekKeyOf(String(asOfDate).slice(0, 10)) : null;
    var ck = key + '|' + (asOfWeek || 'all');
    if (_wfMeanCache.key === ck && _wfMeanCache.val && (now - _wfMeanCache.at) < (maxAgeMs || 60000)) return _wfMeanCache.val;
    var val = null;
    try {
      var rel = loadParts(key).rel || {};
      if (asOfWeek) {
        var wk = rel.weeks || {};
        var n = 0, s = 0, raw = 0, en = 0, es = 0;
        Object.keys(wk).forEach(function (k2) {
          if (!(k2 < asOfWeek)) return;   /* strictly earlier weeks only */
          var w = wk[k2];
          if (!w) return;
          var wn = num(w.n, 0), wen = num(w.eN, 0);
          if (wn > 0) { n += wn; s += num(w.sr, 0); raw += isFinite(w.srw) ? num(w.srw, 0) : num(w.sr, 0); }
          if (wen > 0) { en += wen; es += num(w.eSR, 0); }
        });
        if (n > 0) {
          val = {
            mean: s / n, n: n, rawMean: raw / n,
            eligMean: en > 0 ? es / en : null, eligN: en,
            asOfWeek: asOfWeek
          };
        }
      } else {
        var g = rel.all || {};
        if (g.n > 0 && isFinite(g.sr)) {
          val = {
            mean: g.sr / g.n, n: g.n,
            rawMean: isFinite(g.srw) ? g.srw / g.n : null,
            eligMean: rel.elig && rel.elig.n > 0 ? rel.elig.sr / rel.elig.n : null,
            eligN: rel.elig ? rel.elig.n : 0
          };
        }
      }
    } catch (e) {}
    _wfMeanCache = { key: ck, at: now, val: val };
    return val;
  }
  function commitBatch(key, parts) {
    key = key || DEFAULTS.calibrationKey;
    parts.v = 2;
    parts.ts = Date.now();
    /* Invalidate the calibration cache on EVERY attempt: a failed commit must
       not leave a mutated in-memory object behind. */
    _calCacheVer[key] = (_calCacheVer[key] || 0) + 1;
    _wfMeanCache.at = 0;
    return saveStore(key + '_txn', parts);
  }

  var _calCache = {};
  var _calCacheVer = {};
  function loadCalibration(key) {
    key = key || DEFAULTS.calibrationKey;
    var ver = _calCacheVer[key] || 0;
    var cached = _calCache[key];
    if (cached && cached.ver === ver) return cached.data;
    var data = loadParts(key).cal;
    _calCache[key] = { data: data, ver: ver };
    return data;
  }
  function saveCalibration(key, obj) {
    key = key || DEFAULTS.calibrationKey;
    var parts = loadParts(key);
    parts.cal = obj;
    return commitBatch(key, parts);
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
    var disagreement = null;
    if (sources.length > 1) {
      var mean = sources.reduce(function (a, b) { return a + b; }, 0) / sources.length;
      var variance = sources.reduce(function (s, x) { return s + Math.pow(x - mean, 2); }, 0) / sources.length;
      disagreement = Math.sqrt(variance);
    }

    /* v4.5 (F7): with no own-history windows but a usable calibration bucket,
       fall back to hist.p instead of dropping the plan. */
    var model = ownBase != null ? clamp(ownBase + lift, 0.01, 0.99) : (hist ? hist.p : null);
    var p = model;   /* v4.7: ML layer removed; the `ml` argument is ignored (kept for call compatibility). */

    return {
      p: p, contributors: sources.length, disagreement: disagreement, parts: sources,
      method: 'own_base_plus_setup_lift',
      ownBase: ownBase, adjustedBase: model,
      statisticalBase: ownBase, setupLift: lift,
      priorP: priorP, histP: hist ? hist.p : null,
      adjustment: (hist && priorP != null) ? (hist.p - priorP) : null
    };
  }

  function evidenceConfidence(input, cfg) {
    var ownScore = clamp((input.ownN || 0) / 40, 0, 1) * 12;
    var calScore = clamp((input.historicalN || 0) / 200, 0, 1) * 18;
    var dataScore = clamp(input.dataCompleteness == null ? 0 : input.dataCompleteness, 0, 1) * 15;
    var contributors = input.contributors || 0;
    var agreementScore = contributors <= 1 ? 8 : clamp(1 - num(input.disagreement, 0.25) / 0.25, 0, 1) * 15;
    var modelScore = contributors >= 3 ? 15 : contributors === 2 ? 11 : 7;
    var setupScore = input.setupScore == null ? 50 : input.setupScore;
    var stabilityScore = clamp((setupScore - 35) / 50, 0, 1) * 10;
    /* v4.9.3 (P2): regime credits nothing by default (evidenceRegimePoints
       0 = veto-only; the A/B found no out-of-sample regime effect). With
       evidenceRegimePoints > 0 the v4.9.2 behaviour is restored (up to
       that many points, null regime scores a third). */
    var regimePts = num(cfg && cfg.evidenceRegimePoints, 0);
    var regimeMax = num(input.regimeMax, 5);
    var regimeScore = regimePts <= 0 ? 0
      : (input.regimeScore == null || regimeMax <= 0 ? regimePts / 3 : clamp(input.regimeScore / regimeMax, 0, 1) * regimePts);
    return round(clamp(ownScore + calScore + dataScore + agreementScore + modelScore + stabilityScore + regimeScore, 0, 100), 1);
  }

  function classify(netEV, pEvPositive, pReturnPositive, evidence, setupScore, cfg) {
    if (netEV != null && netEV <= 0) return { code: 'NEGATIVE_EV', label: 'AVOID', color: 'loss' };
    if (netEV == null || evidence < 45) return { code: 'INSUFFICIENT_EVIDENCE', label: 'WATCH', color: 'neutral' };
    if (netEV >= 0.75 && pReturnPositive >= 0.62 && evidence >= 75 && (setupScore || 0) >= 60 && pEvPositive >= 0.90)
      return { code: 'HIGH_CONVICTION', label: 'HIGH CONVICTION', color: 'profit' };
    if (netEV >= cfg.minNetEV && pReturnPositive >= cfg.minPositiveProbability && evidence >= cfg.minEvidence && pEvPositive >= cfg.minEvConfidence)
      return { code: 'QUALIFIED_TRADE', label: 'QUALIFIED TRADE', color: 'profit' };
    /* v4.9.3 (P2): shadow tier - monitor-only, never traded (consumers
       filter on QUALIFIED_TRADE / HIGH_CONVICTION exactly as before). */
    var sg = cfg.shadowGate;
    if (sg && sg.enabled && netEV >= num(sg.minNetEV, 0.30) &&
        (pReturnPositive == null || pReturnPositive >= num(sg.minPositiveProbability, 0.55)) &&
        evidence >= num(sg.minEvidence, 50) &&
        (pEvPositive == null || pEvPositive >= num(sg.minEvConfidence, 0.75)))
      return { code: 'SHADOW_QUALIFIED', label: 'SHADOW (monitor only)', color: 'neutral', shadow: true };
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
      /* v4.9.3 (P2): mismatchWeight <= 0 = regime VETO-ONLY - the regime is
         still computed and reported below (app-level vetoes) but history
         windows are not reweighted by regime mismatch. (The old clamp
         floor of 0.05 meant a literal 0 still downweighted hard.) */
      var mmRaw = num(cfg.regime.mismatchWeight, 0.6);
      var mm = clamp(mmRaw, 0.05, 1);
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
          if (mmRaw > 0) w[k] *= Math.pow(mm, mism);
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

  /* ══════════ v4.7 INTRADAY: partial-bar policy + remaining distance ══════════ */
  var IST_MS = 5.5 * 3600 * 1000;

  function istClock(nowMs) {
    var d = new Date((nowMs == null ? Date.now() : nowMs) + IST_MS);
    return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
  }
  /* 09:15-15:40 IST Mon-Fri (15:30 close + 10 min vendor buffer).
     Exchange holidays are not known here; on a holiday no bar dated today exists, so nothing is "forming". */
  function sessionIsOpen(c) { return c.dow >= 1 && c.dow <= 5 && c.minutes >= 9 * 60 + 15 && c.minutes <= 15 * 60 + 40; }
  /* Calendar date (IST) of a candle: ISO strings as-is (the engine's existing convention), epoch s/ms converted. */
  function candleDate(t) {
    if (t == null) return null;
    if (typeof t === 'number' && isFinite(t)) return new Date((t < 1e11 ? t * 1000 : t) + IST_MS).toISOString().slice(0, 10);
    var s = String(t);
    if (/^\d{9,13}$/.test(s)) return candleDate(Number(s));
    return s.slice(0, 10);
  }
  function intradayCfg(cfg) {
    var c = (cfg && cfg.intraday) || {};
    return {
      enabled: c.enabled !== false,
      partialBar: c.partialBar === 'include' ? 'include' : 'exclude',
      remainingDistance: c.remainingDistance !== false,
      maxMovePct: Math.abs(num(c.maxMovePct, 8)),
      minTargetPct: num(c.minTargetPct, 0.5),
      minStopPct: num(c.minStopPct, 0.5),
      negligibleMovePct: Math.abs(num(c.negligibleMovePct, 0.1))
    };
  }
  /* Drop today's forming bar from a daily-type series (daily or index) when policy says exclude. */
  function completedOnly(candles, cfg, nowMs) {
    var ic = intradayCfg(cfg);
    if (!candles || !candles.length) return candles || [];
    if (!ic.enabled || ic.partialBar !== 'exclude') return candles;
    var clock = istClock(nowMs);
    if (sessionIsOpen(clock) && candleDate(candles[candles.length - 1].t) === clock.date) return candles.slice(0, -1);
    return candles;
  }
  /* What is today's session doing to this stock's data? Reference = last COMPLETED close; live price =
     latest hourly close dated after the reference (also covers a stale daily snapshot after the close),
     else the forming daily bar's close. */
  function sessionState(daily, hourly, cfg, nowMs) {
    var ic = intradayCfg(cfg), clock = istClock(nowMs);
    var out = {
      enabled: ic.enabled, today: clock.date, sessionOpen: sessionIsOpen(clock),
      formingBar: false, partialBarExcluded: false, completedDaily: daily || [],
      referencePrice: null, referenceDate: null, livePrice: null, liveSource: null, liveAsOf: null, movePct: null
    };
    if (!ic.enabled || !daily || !daily.length) return out;
    var lastBar = daily[daily.length - 1];
    var forming = out.sessionOpen && candleDate(lastBar.t) === clock.date;
    if (forming) {
      out.formingBar = true;
      if (ic.partialBar === 'exclude') { out.completedDaily = daily.slice(0, -1); out.partialBarExcluded = true; }
    }
    var refBar = forming ? daily[daily.length - 2] : lastBar;
    if (!refBar || !(refBar.c > 0)) return out;
    out.referencePrice = refBar.c; out.referenceDate = candleDate(refBar.t);
    var h = hourly && hourly.length ? hourly[hourly.length - 1] : null, hDate = h ? candleDate(h.t) : null;
    if (h && h.c > 0 && hDate && hDate > out.referenceDate && hDate <= clock.date) {
      out.livePrice = h.c; out.liveSource = 'hourly'; out.liveAsOf = h.t;
    } else if (forming && lastBar.c > 0) {
      out.livePrice = lastBar.c; out.liveSource = 'daily_forming'; out.liveAsOf = lastBar.t;
    }
    if (out.livePrice != null) out.movePct = (out.livePrice / out.referencePrice - 1) * 100;
    return out;
  }
  /* Normalise an analysis input ONCE so every downstream statistic sees the same completed series.
     Skipped for calibration/backtest slices (historical, hourly-free). */
  function withSession(input, cfg, internal, nowMs) {
    if (internal && (internal.noHist || internal.setupScoreOverride != null)) return input;
    var s = sessionState(input.dailyCandles || [], input.hourlyCandles || [], cfg, nowMs);
    var out = {};
    Object.keys(input).forEach(function (k) { out[k] = input[k]; });
    out.dailyCandles = s.completedDaily;
    out.indexCandles = completedOnly(input.indexCandles || [], cfg, nowMs);
    out._session = s;
    return out;
  }
  /* Remaining-distance adjustment. Levels are fixed in PRICE at the last completed close:
        target level = ref x (1+T),  stop level = ref x (1-S);
     entry is the live price P0, so the distances the window statistics and EV must use are
        effT = (1+T) x ref/P0 - 1,   effS = 1 - (1-S) x ref/P0.
     Up 2% intraday: a 4% target is 1.96% away but a 3.6% stop is 5.5% away (chasing worsens R:R);
     down 2%: target 6.1% away, stop 1.6% away. */
  function intradayBarriers(session, cfg, targetPct, stopPct) {
    var ic = intradayCfg(cfg);
    var base = { active: false, status: 'none', effTargetPct: targetPct, effStopPct: stopPct, movePct: null, targetPrice: null, stopPrice: null };
    if (!session || !ic.enabled || !ic.remainingDistance || session.livePrice == null || !(session.referencePrice > 0) || stopPct == null) return base;
    var ref = session.referencePrice, px = session.livePrice;
    base.movePct = (px / ref - 1) * 100;
    if (Math.abs(base.movePct) < ic.negligibleMovePct) { base.status = 'negligible_move'; return base; }
    if (Math.abs(base.movePct) > ic.maxMovePct) { base.status = 'move_too_large'; return base; }
    var effT = ((1 + targetPct / 100) * ref / px - 1) * 100;
    var effS = (1 - (1 - stopPct / 100) * ref / px) * 100;
    base.targetPrice = ref * (1 + targetPct / 100); base.stopPrice = ref * (1 - stopPct / 100);
    base.effTargetPct = effT; base.effStopPct = effS;
    if (!(effT >= ic.minTargetPct)) { base.status = 'target_reached'; return base; }
    if (!(effS >= ic.minStopPct)) { base.status = 'stop_breached'; return base; }
    base.active = true; base.status = 'adjusted';
    return base;
  }
  function intradayBlocked(adj) { return adj.status === 'target_reached' || adj.status === 'stop_breached' || adj.status === 'move_too_large'; }
  function sessionReport(s) {
    if (!s) return null;
    return {
      sessionOpen: s.sessionOpen, formingBar: s.formingBar, partialBarExcluded: s.partialBarExcluded,
      referencePrice: s.referencePrice, referenceDate: s.referenceDate,
      livePrice: s.livePrice, liveSource: s.liveSource, liveAsOf: s.liveAsOf,
      movePct: s.movePct != null ? round(s.movePct, 2) : null
    };
  }
  function planIntraday(core, pre) {
    var s = sessionReport(pre.session);
    if (!s) return null;
    var a = core.intraday || {};
    s.status = a.status || 'none';
    s.adjusted = !!a.active;
    s.effTargetPct = a.effTargetPct != null ? round(a.effTargetPct, 2) : null;
    s.effStopPct = a.effStopPct != null ? round(a.effStopPct, 2) : null;
    s.targetPrice = a.targetPrice != null ? round(a.targetPrice, 2) : null;
    s.stopPrice = a.stopPrice != null ? round(a.stopPrice, 2) : null;
    return s;
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

    /* v4.9 (P1): zero-edge prior anchor (computed once per call; the walk-
       forward mean comes from the reliability store, memoized below).
       v4.9.3 (P0): as-of - anchored on weeks strictly before the signal
       date (last completed session), never on same-or-later outcomes. */
    var anchor = null;
    var ancCfg = cfg.priorAnchor || {};
    if (ancCfg.enabled !== false) {
      var asOfDate = daily.length ? String(daily[daily.length - 1].t).slice(0, 10) : null;
      var wf = walkForwardMean(cfg.calibrationKey, asOfDate);
      if (wf) {
        /* v4.9.2 (A1): anchor to the Buy-grade (eligible) walk-forward mean -
           the population that is actually traded - when it has enough rows;
           population:'all' restores the all-plan mean. */
        var ancMinR = num(ancCfg.minRows, 100);
        var ancElig = ancCfg.population !== 'all' && wf.eligN >= ancMinR && isFinite(wf.eligMean);
        var ancMean = ancElig ? wf.eligMean : wf.mean, ancN = ancElig ? wf.eligN : wf.n;
        if (ancN >= ancMinR && isFinite(ancMean)) {
          anchor = { mean: ancMean, n: ancN, weight: clamp(num(ancCfg.maxWeight, 0.35), 0, 1), population: ancElig ? 'elig' : 'all' };
        }
      }
    }

    return {
      setup: setup, setupCalScore: setupCalScore, scoreGap: gap, gapFactor: gapFactor,
      atrPct: atrPct, stopPct: stopFromAtr(atrPct, cfg), volClass: volClassOf(atrPct),
      dataCompleteness: dataCompleteness,
      costs: totalRoundTripCost(cfg.costs) + liq.perSidePct * 2,
      liquidity: liq, weights: ww.weights, regime: ww.regime, priorAnchor: anchor,
      session: input._session || null
    };
  }

  function corePlan(pre, input, cfg, horizon, targetPct, internal, mode) {
    var daily = input.dailyCandles || [];
    var hourly = input.hourlyCandles || [];
    var indexCandles = input.indexCandles || [];
    mode = mode || 'fixed';
    var noHist = !!(internal && internal.noHist) || mode !== 'fixed';
    var noTouch = !!(internal && internal.noTouch);

    /* v4.7: remaining distance from the live price (levels anchored at the last completed close). The
       calibration lookups below stay keyed by the NOMINAL plan: only the setup LIFT (hist - prior) transfers. */
    var adj = noHist ? intradayBarriers(null, cfg, targetPct, pre.stopPct) : intradayBarriers(pre.session, cfg, targetPct, pre.stopPct);
    var effT = adj.effTargetPct, effS = adj.effStopPct;
    var tb = intradayBlocked(adj) ? null : tripleBarrierWindows(daily, horizon, effT, effS, cfg, pre.costs, pre.weights, mode);
    var touch = (noHist || noTouch || intradayBlocked(adj)) ? null : statisticalTouch(hourly, daily, indexCandles, horizon, effT);
    var hist = noHist ? null : historicalProbability(horizon, targetPct, pre.setupCalScore, pre.volClass, pre.stopPct, cfg.calibrationKey);
    var prior = noHist ? null : setupBlindPrior(horizon, targetPct, pre.stopPct, cfg.calibrationKey);
    var probability = combineProbability(tb, hist, prior, null, cfg, pre.gapFactor);

    var core = {
      horizonDays: horizon, targetPct: targetPct, exitMode: mode,
      intraday: adj, econTargetPct: effT, econStopPct: effS,
      tb: tb, touch: touch, hist: hist, prior: prior,
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
      targetReturnPct: effT, stopReturnPct: tb.meanStopRet, timeoutReturnPct: tb.meanTimeoutRet
    };
    var gross = pT * effT + pS * tb.meanStopRet + pO * tb.meanTimeoutRet;
    var preNet = pT * (effT - c) + pS * (tb.meanStopRet - c) + pO * (tb.meanTimeoutRet - c);
    var aftNet = pT * afterTax(effT - c, cfg) + pS * tb.meanAfStop + pO * tb.meanAfTimeout;
    core.dist = dist;
    core.ev = { grossPct: gross, costPct: c, preTaxNetPct: preNet, afterTaxNetPct: aftNet, taxPct: preNet - aftNet };
    core.basisEV = cfg.decideAfterTax !== false ? aftNet : preNet;
    core.pReturnPositive = clamp(pT + pO * tb.timeoutPosShare, 0, 1);
    return core;
  }

  function finalizePlan(core, pre, input, cfg, haircut, hcMeta) {
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
    }, cfg);

    var ev = null;
    if (core.ev) {
      var tauBase = num(cfg.evPriorStdPct, 0.5);
      var tau = Math.max(0.05, tauBase * Math.sqrt(core.horizonDays / Math.max(1, cfg.defaultHorizon)));
      var s = Math.max(0.02, tb.stdErr);
      var lam = tau * tau / (tau * tau + s * s);
      /* v4.5 (F2): the best-of-N selection haircut is plan-independent and is
         subtracted AFTER shrinkage. Subtracting it before shrink multiplied it
         by lambda (bigger effect at short horizons), stacking a conservatism
         layer unevenly across the grid.
         v4.8: scaled by haircutCoef (fitted by retuneTuning); the ev object's
         haircutPct is the EFFECTIVE penalty actually subtracted. */
      var cst = core.ev.costPct, Tg = core.econTargetPct != null ? core.econTargetPct : core.targetPct, Sg = Math.abs(tb.meanStopRet);
      var pT0 = Sg / (Tg + Sg) * (1 - tb.pTimeout), pS0 = Tg / (Tg + Sg) * (1 - tb.pTimeout);
      var rate = cfg.decideAfterTax !== false ? num(cfg.taxRatePct, 0) / 100 : 0;
      var m0 = -cst - rate * pT0 * Math.max(0, Tg - cst) + rate * clamp(num(cfg.taxLossCredit, 0), 0, 1) * pS0 * (Sg + cst);
      /* v4.9 (P1): anchor the zero-edge prior to the walk-forward empirical
         realized mean. The cost/tax-only m0 (~-0.24%) sat well above the
         observed mean realized (~-0.56% all / -0.72% Buy-grade detrended in
         the ev-ab-test sample), flattering P(true EV > 0) through
         Phi(shrunk/postSd). The pooled bucket prior below still adds the
         setup-specific layer on top of the anchored base. */
      if (pre.priorAnchor && pre.priorAnchor.weight > 0) {
        m0 = m0 + pre.priorAnchor.weight * (pre.priorAnchor.mean - m0);
      }
      var pp = cfg.pooledPrior || {};
      var priorMean = m0, pooledMean = null, pooledW = 0;
      if (pp.enabled && hist && hist.bucket && hist.bucket.nv >= num(pp.minN, 30)) {
        pooledMean = hist.bucket.sv / hist.bucket.nv;
        pooledW = Math.min(num(pp.maxWeight, 0.5), hist.bucket.nv / (hist.bucket.nv + num(pp.k, 60))) * pre.gapFactor;
        priorMean = m0 + pooledW * (pooledMean - m0);
      }
      var hcK = num(cfg.haircutCoef, 1);
      /* v4.9.3 (P1): fitted score coefficients. b1 rescales the shrunk
         signal (retuneTuning's joint OLS targets b1 = 1 via the tau grid);
         b2/b2Buy replace haircutCoef per population - Buy-grade plans use
         b2Buy (setup score >= buyThreshold) because the A/B found the
         haircut ranks only OUTSIDE the tradeable pool. scoreFit disabled
         (default) = classic scoring. */
      var sf = cfg.scoreFit || {};
      var sfOn = sf.enabled === true;
      var b1 = sfOn ? num(sf.b1, 1) : 1;
      if (sfOn) {
        var buyGrade = pre.setupCalScore != null && pre.setupCalScore >= buyThreshold();
        var pick = buyGrade ? (sf.b2Buy != null ? sf.b2Buy : sf.b2) : sf.b2;
        if (pick != null && isFinite(Number(pick))) hcK = num(pick, hcK);
      }
      /* v4.9.3 (P1): parametric max-of-N selection bias on the winning plan
         (selectionBias.coef > 0 only; clamped like the haircut). */
      var selBias = 0;
      var sbCoef = num(cfg.selectionBias && cfg.selectionBias.coef, 0);
      if (sbCoef > 0 && hcMeta && hcMeta.nCandidates > 1) {
        selBias = clamp(sbCoef * s * Math.sqrt(2 * Math.log(Math.max(2, hcMeta.nCandidates))), 0, num(cfg.selectionBias.maxPct, 3));
      }
      var shrunk = priorMean + b1 * lam * (core.basisEV - priorMean) - hcK * haircut - selBias;
      var postSd = Math.sqrt(tau * tau * s * s / (tau * tau + s * s));
      ev = {
        grossPct: core.ev.grossPct, costPct: core.ev.costPct, taxPct: core.ev.taxPct,
        preTaxNetPct: core.ev.preTaxNetPct, afterTaxNetPct: core.ev.afterTaxNetPct,
        basis: cfg.decideAfterTax !== false ? 'after-tax' : 'net of costs',
        rawBasisPct: core.basisEV,
        haircutPct: hcK * haircut,
        haircutRawPct: haircut,
        haircutCoef: hcK,
        shrinkFactor: lam,
        /* v4.9.3: the score recipe, so stored rows reproduce exactly */
        signalScale: b1,
        selBiasPct: selBias,
        priorMeanPct: priorMean,
        zeroEdgePriorPct: m0,
        pooledMeanPct: pooledMean,
        pooledWeight: pooledW,
        priorAnchorPct: pre.priorAnchor ? pre.priorAnchor.mean : null,
        priorAnchorWeight: pre.priorAnchor ? pre.priorAnchor.weight : 0,
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
    var be = core.dist ? breakEvenTargetProb(core.dist, tb, core.econTargetPct != null ? core.econTargetPct : core.targetPct, pre.costs) : null;
    var sizing = ev ? computeSizing(core.dist, tb, core.econTargetPct != null ? core.econTargetPct : core.targetPct, pre.costs, core.econStopPct != null ? core.econStopPct : pre.stopPct, ev, cfg) : null;
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
        historicalN: hist ? hist.n : 0
      },
      windows: tb ? {
        n: tb.n, nEff: round(tb.nEff, 1),
        ownDriftPerDayPct: round(tb.driftPerDayPct, 3),
        removedDriftPerDayPct: round(tb.removedDriftPerDayPct, 3)
      } : null,
      distribution: core.dist,
      intraday: planIntraday(core, pre),   // v4.7: targetPct/stopPct above are the NOMINAL plan; intraday.eff* are what EV was priced on
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
      reasons: (core.dist && ev) ? plainReasons(core, pre, ev, evidence, be, ev ? ev.haircutPct : haircut) : [],
      explanation: buildExplanation(setup, probability, ev, evidence, decision, tb, pre, core.intraday)
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
    var T = core.econTargetPct != null ? core.econTargetPct : core.targetPct, S = Math.abs(tb.meanStopRet), pT = core.dist.pTarget;
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
    var daily = completedOnly(dailyCandles || [], cfg), n = daily.length;
    if (n < 60) return null;
    var H = uc.horizons || [3, 5, 10, 15, 20], T = uc.targets || [2, 3, 4, 5, 6];
    var ww = buildWindowWeights(daily, completedOnly(indexCandles || [], cfg), cfg);
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
    input = withSession(input, cfg, null);
    var pre = prepare(input, cfg);
    return finalizePlan(corePlan(pre, input, cfg, horizon, targetPct), pre, input, cfg, 0);
  }

  function buildExplanation(setup, probability, ev, evidence, decision, tb, pre, adj) {
    var items = [];
    var ss = pre && pre.session;
    if (ss && ss.partialBarExcluded) items.push('today\'s forming daily bar excluded from statistics (completed sessions only)');
    if (adj && adj.status === 'adjusted' && ss) {
      items.push('intraday: live ' + round(ss.livePrice, 2) + ' is ' + (adj.movePct >= 0 ? '+' : '') + round(adj.movePct, 2) + '% vs last completed close ' + round(ss.referencePrice, 2) +
        '; levels anchored there, so remaining distance is +' + round(adj.effTargetPct, 2) + '% to target and -' + round(adj.effStopPct, 2) + '% to stop');
    } else if (adj && adj.status === 'target_reached') items.push('intraday: price has already reached/passed the target level; plan not priced');
    else if (adj && adj.status === 'stop_breached') items.push('intraday: price is at/through the stop level; plan not priced');
    else if (adj && adj.status === 'move_too_large') items.push('intraday: move of ' + round(adj.movePct, 1) + '% since the last close is too large to price against the original levels');
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

  /* v4.9 (P1): the selection haircut as a proper feature pipeline - averaged
     over three deterministic partitions of the window sample (halves,
     first-vs-last third, odd-vs-even) instead of one cut, with the plan count
     and the winner's utility margin returned as selection features. The
     per-split estimator is unchanged (v4.5 F8 sign-aware winners, cross-half
     gap / sqrt(2), clamped 0..3); only its variance and its metadata change.
     Optional count-shrink toward 0 (haircutShrink.k, default 0 = OFF). */
  function selectionHaircutMeta(cores, cfg) {
    var meta = { haircut: 0, nCandidates: 0, winnerGap: null, splits: 0 };
    if (!cfg.selectionHaircut) return meta;
    /* v4.9.3 (P0): the v4.3 #12 conservatism bypass (drop the haircut while
       reliabilityVerdict() === 'conservative') is REMOVED - it was not in
       the calibration signature, so one basis could silently mix two
       scoring formulas and poison later A/B runs and retunes. Scoring no
       longer mutates with store contents. */
    var valid = cores.filter(function (c) { return c.tb && c.tb.halfA != null && c.tb.halfB != null; });
    meta.nCandidates = valid.length;
    if (valid.length < 3) return meta;
    var ua = function (x, h) { h = Math.sqrt(Math.max(1, h)); return x > 0 ? x / h : x; };
    /* split pairs: [halves (as computed), first-vs-last third, odd-vs-even] */
    var splitPairs = [[], [], []];
    valid.forEach(function (c) {
      splitPairs[0].push(c);
      var s = c.tb.splits || [];
      if (s[0] && s[0][0] != null && s[0][1] != null) splitPairs[1].push({ horizonDays: c.horizonDays, tb: { halfA: s[0][0], halfB: s[0][1] } });
      if (s[1] && s[1][0] != null && s[1][1] != null) splitPairs[2].push({ horizonDays: c.horizonDays, tb: { halfA: s[1][0], halfB: s[1][1] } });
    });
    var hcs = [];
    splitPairs.forEach(function (sp) {
      if (sp.length < 3) return;
      var ia = -1, ib = -1, uA = -Infinity, uB = -Infinity, second = -Infinity;
      sp.forEach(function (c, k) {
        var a = ua(c.tb.halfA, c.horizonDays), b = ua(c.tb.halfB, c.horizonDays);
        if (a > uA) { second = uA; uA = a; ia = k; } else if (a > second) second = a;
        if (b > uB) { uB = b; ib = k; }
      });
      if (meta.winnerGap == null && ia >= 0 && isFinite(second) && second > -Infinity) meta.winnerGap = uA - second;
      var optA = sp[ia].tb.halfA - sp[ia].tb.halfB;
      var optB = sp[ib].tb.halfB - sp[ib].tb.halfA;
      hcs.push(clamp(Math.max(0, (optA + optB) / 2) / Math.SQRT2, 0, 3));
    });
    if (!hcs.length) return meta;
    var hc = 0, i;
    for (i = 0; i < hcs.length; i++) hc += hcs[i];
    hc /= hcs.length;
    meta.splits = hcs.length;
    var k = num(cfg.haircutShrink && cfg.haircutShrink.k, 0);
    if (k > 0) hc *= valid.length / (valid.length + k);
    meta.haircut = clamp(hc, 0, 3);
    return meta;
  }
  function selectionHaircutOf(cores, cfg) {
    return selectionHaircutMeta(cores, cfg).haircut;
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

    input = withSession(input || {}, cfg, internal);
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

    var hcMeta = selectionHaircutMeta(cores, cfg);
    var haircut = hcMeta.haircut;

    var results = [];
    cores.forEach(function (core) {
      var r = finalizePlan(core, pre, input, cfg, haircut, hcMeta);
      if (r.expectedValue && r.probability && r.probability.target != null) {
        /* v4.9 (P1): selection features on every priced plan */
        r.expectedValue.selectionCandidates = hcMeta.nCandidates;
        r.expectedValue.winnerGapPct = hcMeta.winnerGap;
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
        var tBest = statisticalTouch(input.hourlyCandles, input.dailyCandles || [], input.indexCandles || [], best.horizonDays,
          best.intraday && best.intraday.adjusted ? best.intraday.effTargetPct : best.targetPct);
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
      intraday: sessionReport(pre.session),
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

  function applyOutcomeRows(all, rows) {
    var added = 0;
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
    return added;
  }
  function recordOutcomes(rows, key) {
    key = key || DEFAULTS.calibrationKey;
    var parts = loadParts(key);
    var added = applyOutcomeRows(parts.cal, rows);
    if (!added) return 0;
    return commitBatch(key, parts) ? added : -1;
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
      localStorage.removeItem(key + '_txn');
      delete _calCache[key];
      _calCacheVer[key] = (_calCacheVer[key] || 0) + 1;
      _wfMeanCache.at = 0;
      rowStoreClear();   /* v4.9.2 (A3) */
      return true;
    } catch (e) { return false; }
  }

  /* v4.6 (feedback A): basis signature - a short hash of a canonical dump of
     EVERY parameter that decides what is stored:
       outcome labels:      driftKeep, lookbackBars, stopATR, minStopPct,
                            maxStopPct, horizons, targets
       stored predictions:  all of the above plus evPriorStdPct,
                            defaultHorizon, selectionHaircut, minWindows,
                            recency, regime
       economics:           cost, tax, taxLossCredit, decideAfterTax
     plus BASIS_REV, bumped by hand whenever replay or optimizer logic
     changes. If it differs from the stored one - or no signature exists
     (unknown basis) - the whole family is cleared and rebuilds. */
  /* v4.9: bumped - priorAnchor changes stored predictions.
     v4.9.2: bumped again - the anchor population is now Buy-grade.
     v4.9.3: bumped - the anchor is now AS-OF (strictly earlier weeks), so
     stored predictions change again; the row store rebuilds with them. */
  var BASIS_REV = '5';
  function shortHash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function calibrationSignature(cfg) {
    /* Fixed key order => deterministic JSON => stable hash. */
    var canon = {
      rev: BASIS_REV,
      cost: round(totalRoundTripCost(cfg.costs), 4),
      taxRatePct: num(cfg.taxRatePct, 0),
      taxLossCredit: num(cfg.taxLossCredit, 0),
      decideAfterTax: cfg.decideAfterTax !== false ? 1 : 0,
      driftKeep: num(cfg.driftKeep, 0.5),
      lookbackBars: num(cfg.lookbackBars, 500),
      stopATR: num(cfg.stopATR, 1.8),
      minStopPct: num(cfg.minStopPct, 1.5),
      maxStopPct: num(cfg.maxStopPct, 6),
      horizons: (cfg.horizons || []).slice().sort(function (a, b) { return a - b; }),
      targets: (cfg.targets || []).slice().sort(function (a, b) { return a - b; }),
      evPriorStdPct: num(cfg.evPriorStdPct, 0.5),
      defaultHorizon: num(cfg.defaultHorizon, 10),
      selectionHaircut: cfg.selectionHaircut !== false ? 1 : 0,
      haircutCoef: num(cfg.haircutCoef, 1),
      priorAnchor: cfg.priorAnchor ? { e: cfg.priorAnchor.enabled !== false ? 1 : 0, w: num(cfg.priorAnchor.maxWeight, 0.35), n: num(cfg.priorAnchor.minRows, 100), p: cfg.priorAnchor.population === 'all' ? 'all' : 'elig' } : null,
      haircutShrinkK: num(cfg.haircutShrink && cfg.haircutShrink.k, 0),
      /* v4.9.3: fitted score coefficients + selection-bias term change
         stored predictions -> part of the basis. */
      scoreFit: cfg.scoreFit ? {
        e: cfg.scoreFit.enabled === true ? 1 : 0,
        b1: num(cfg.scoreFit.b1, 1),
        b2: cfg.scoreFit.b2 == null ? null : num(cfg.scoreFit.b2, 1),
        b2Buy: cfg.scoreFit.b2Buy == null ? null : num(cfg.scoreFit.b2Buy, 1)
      } : null,
      selBiasCoef: num(cfg.selectionBias && cfg.selectionBias.coef, 0),
      minWindows: num(cfg.minWindows, 30),
      recency: cfg.recency || null,
      regime: cfg.regime || null
    };
    return 'v6|' + shortHash(JSON.stringify(canon));
  }
  function refreshCalibrationSignature(key, cfg) {
    try {
      var sk = key + '_sig', sig = calibrationSignature(cfg), old = localStorage.getItem(sk);
      if (old === sig) return false;
      /* Unknown basis (old == null) with data present is just as unsafe as a
         changed basis: clear in BOTH cases. */
      clearCalibration(key);
      localStorage.setItem(sk, sig);
      return old != null;   // 'changed' only when a previous basis existed
    } catch (e) { return false; }
  }
  /* v4.6 (feedback A): one-line opt-out of the one-time reset - adopt the
     CURRENT basis without clearing, for the case where nothing has actually
     changed since the build and the old data is still valid. */
  function adoptCurrentBasis(key) {
    try {
      localStorage.setItem((key || DEFAULTS.calibrationKey) + '_sig', calibrationSignature(getConfig()));
      return true;
    } catch (e) { return false; }
  }
  /* v4.7.2: tuner bootstrap - persist the UI-tuned parameter overrides in
     localStorage ('stox_ev_ui_config') and merge them into
     window.STOX_EV_CONFIG BEFORE the basis signature is first computed, so
     the signature, the live store name and the calibration family all agree
     with the tuned basis regardless of script load order. The tuner UI in
     app-core.js writes this key and updates window.STOX_EV_CONFIG at runtime. */
  try {
    var _uiCfgRaw = localStorage.getItem('stox_ev_ui_config');
    if (_uiCfgRaw) {
      var _uiCfg = JSON.parse(_uiCfgRaw);
      if (_uiCfg && typeof _uiCfg === 'object') {
        window.STOX_EV_CONFIG = Object.assign({}, window.STOX_EV_CONFIG || {}, _uiCfg);
      }
    }
  } catch (e) {}

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
    var meta = loadParts(key).meta;
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
  function applyReliabilityRows(st, rows) {
    if (!st.all) st.all = blankAcc();
    if (!st.elig) st.elig = blankAcc();
    if (!st.bins) st.bins = { all: [], elig: [] };
    if (!st.weeks) st.weeks = {};
    var added = 0;
    (rows || []).forEach(function (r) {
      ['all'].concat(r.elig ? ['elig'] : []).forEach(function (grp) {
        addAcc(st[grp], r.pred, r.raw, r.real, r.realRaw);
        var b = relBin(r.pred);
        var cell = st.bins[grp][b];
        if (!cell) cell = st.bins[grp][b] = { n: 0, sp: 0, sr: 0, weeks: {} };
        if (!cell.weeks) cell.weeks = {};
        cell.n++; cell.sp += r.pred; cell.sr += r.real;
        /* v4.6 (feedback E1): per-bin weekly aggregates — the bucket verdicts
           get a week-clustered z-score instead of a raw gap threshold. */
        if (r.date) {
          var bwk = weekKeyOf(r.date);
          if (bwk) {
            var bw = cell.weeks[bwk];
            if (!bw) bw = cell.weeks[bwk] = { n: 0, sp: 0, sr: 0, srw: 0 };
            bw.n++; bw.sp += r.pred; bw.sr += r.real;
            bw.srw = (bw.srw || 0) + (isFinite(r.realRaw) ? r.realRaw : r.real);
          }
        }
      });
      if (r.date) {
        var wk = weekKeyOf(r.date);
        if (wk) {
          var wa = st.weeks[wk];
          if (!wa) wa = st.weeks[wk] = { n: 0, sp: 0, sr: 0, srw: 0, eN: 0, eSP: 0, eSR: 0, eSRW: 0 };
          wa.n++; wa.sp += r.pred; wa.sr += r.real;
          /* v4.6 (feedback C): raw realized sums — the cluster test can run on
             raw money, not just the detrended number. */
          wa.srw = (wa.srw || 0) + (isFinite(r.realRaw) ? r.realRaw : r.real);
          if (r.elig) {
            wa.eN++; wa.eSP += r.pred; wa.eSR += r.real;
            wa.eSRW = (wa.eSRW || 0) + (isFinite(r.realRaw) ? r.realRaw : r.real);
          }
        }
      }
      added++;
    });
    return added;
  }
  function recordReliability(rows, key) {
    key = key || DEFAULTS.calibrationKey;
    var parts = loadParts(key);
    var added = applyReliabilityRows(parts.rel, rows);
    if (!added) return 0;
    parts.rel.updated = Date.now();
    /* v4.6 (feedback D): row-level prediction store (fire-and-forget). */
    try { rowStorePut((rows || []).map(rowStoreShape)); } catch (e) {}
    return commitBatch(key, parts) ? added : -1;
  }

  /* v4.4: clusterSummary — one observation per week. Returns null if fewer
     than 3 usable weeks (too few for a cluster SE).
     v4.6 (feedback C): opts.raw selects the raw (undetrended) realized sums
     (srw/eSRW); opts.subtractPred=false returns the raw MONEY mean per week
     ("does it make money") instead of the gap vs prediction. */
  function clusterSummary(weeks, mode, opts) {
    if (!weeks) return null;
    opts = opts || {};
    var raw = !!opts.raw, sub = opts.subtractPred !== false;
    var keys = Object.keys(weeks);
    var weekResiduals = [];   // one entry per usable week
    for (var i = 0; i < keys.length; i++) {
      var w = weeks[keys[i]];
      if (!w) continue;
      var nw = mode === 'elig' ? (w.eN || 0) : (w.n || 0);
      if (!(nw > 0)) continue;
      var swP = mode === 'elig' ? (w.eSP || 0) : (w.sp || 0);
      var swR;
      if (raw) {
        var rawField = mode === 'elig' ? w.eSRW : w.srw;
        if (rawField == null) continue;   // legacy week without raw sums
        swR = rawField;
      } else {
        swR = mode === 'elig' ? (w.eSR || 0) : (w.sr || 0);
      }
      weekResiduals.push((swR - (sub ? swP : 0)) / nw);
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
    return { mean: bias, bias: bias, se: se, z: se > 0 ? bias / se : 0, nWeeks: nW };
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
    var sxy = g.spr / n - mp * mr;
    var slope = varP > 1e-6 ? sxy / varP : null;
    /* v4.6 (feedback E2): slope standard error (OLS on the row-level
       accumulators) — "clearly below 1" needs an uncertainty band. */
    var slopeSe = null;
    if (slope != null && n > 2 && varP > 1e-6) {
      var syy = g.srr / n - mr * mr;
      var sse = Math.max(0, n * (syy - slope * sxy));
      slopeSe = Math.sqrt(sse / (n - 2) / (n * varP));
    }
    var sdPred = Math.sqrt(Math.max(0, varP));
    var result = {
      n: n,
      meanPredicted: mp, meanRealized: mr, meanRawPredicted: g.sraw / n,
      meanRealizedRaw: g.srw != null ? g.srw / n : null,   // v4.5 (F4): raw, undetrended realized P&L
      slope: slope, slopeSe: slopeSe, sdPredicted: sdPred,
      /* "consistent" means INTERNALLY COHERENT: predicted and realized are
         detrended by the same drift. meanRealizedRaw answers "did it make
         money". The walk-forward uses the own-history layer only (no
         calibration / ML), so it validates that layer, not the blend. */
      basis: 'predicted_own_history_ev_vs_realized_detrended_pnl'
    };
    /* v4.6 (feedback C): "does it make money" — raw mean with a cluster
       standard error (one observation per week), next to the detrended
       comparison that remains the model-consistency test. */
    var rawCluster = clusterSummary(weeks, mode, { raw: true, subtractPred: false });
    result.raw = {
      mean: g.srw != null ? g.srw / n : null,
      stdErr: rawCluster ? rawCluster.se : null,
      z: rawCluster ? rawCluster.z : null,
      nWeeks: rawCluster ? rawCluster.nWeeks : null,
      method: rawCluster ? 'cluster' : 'row',
      basis: 'raw_executable_pnl'
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
    var st = loadParts(key).rel;
    function bins(arr) {
      return (arr || []).map(function (c, k) {
        if (!c || !c.n) return null;
        var mp = c.sp / c.n, mr = c.sr / c.n, gap = mr - mp;
        /* v4.6 (feedback E1): bucket verdicts from the per-week clustered
           z-score (per-bin weekly aggregates); the raw gap threshold is only
           a fallback for legacy bins without week data. */
        var cl = c.weeks ? clusterSummary(c.weeks, 'all') : null;
        var verdict;
        if (c.n < 30) verdict = 'collecting';
        else if (cl) verdict = cl.z < -2 ? 'optimistic' : (cl.z > 2 ? 'conservative' : 'ok');
        else verdict = gap < -0.15 ? 'optimistic' : (gap > 0.15 ? 'conservative' : 'ok');
        return {
          bin: k, label: BIN_LABELS[k], n: c.n, meanPredicted: mp, meanRealized: mr, gap: gap,
          z: cl ? cl.z : null, nWeeks: cl ? cl.nWeeks : 0,
          verdict: verdict
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
    /* v4.6 (feedback E3): both population verdicts are exposed so the UI can
       show the all-setups weak-ranking even when Buy-grade is the headline. */
    out.verdictAll = out.all ? out.all.verdict : 'collecting';
    out.verdictElig = out.elig ? out.elig.verdict : 'collecting';
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
    var st = loadParts(key).rel;
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

    var weekDiffs = [], weekDiffsRaw = [];
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
        /* v4.6 (feedback C): parallel RAW money diff — weeks without raw sums
           (legacy stores) are skipped; every week has them after rebuild. */
        if (w.srw != null && w.eSRW != null) {
          var meanEr = w.eSRW / nE;
          var meanNEr = (w.srw - w.eSRW) / nNE;
          weekDiffsRaw.push(meanEr - meanNEr);
        }
      }
    }

    function clusterStats(diffs) {
      if (!diffs || diffs.length < 4) return null;
      var s = 0, k;
      for (k = 0; k < diffs.length; k++) s += diffs[k];
      var bias = s / diffs.length;
      var ss = 0;
      for (k = 0; k < diffs.length; k++) ss += Math.pow(diffs[k] - bias, 2);
      var sd = Math.sqrt(ss / (diffs.length - 1));
      var se = sd / Math.sqrt(diffs.length);
      return { edge: bias, se: se, z: se > 0 ? bias / se : 0, nWeeks: diffs.length, method: 'cluster' };
    }

    var modelCl = (e.n >= 50 && nn.n >= 50) ? clusterStats(weekDiffs) : null;
    var rawCl = (e.n >= 50 && nn.n >= 50) ? clusterStats(weekDiffsRaw) : null;

    if (modelCl) {
      out.edge = modelCl.edge; out.z = modelCl.z;
      out.nWeeks = modelCl.nWeeks; out.method = 'cluster';
    } else if (e.n >= 100 && nn.n >= 100) {
      out.edge = e.meanRealized - nn.meanRealized;
      var se2 = Math.sqrt(e.varRealized / Math.max(1, e.n / 4) + nn.varRealized / Math.max(1, nn.n / 4));
      out.z = se2 > 0 ? out.edge / se2 : 0;
      out.method = 'row';
    }
    out.model = modelCl
      ? { edge: modelCl.edge, z: modelCl.z, nWeeks: modelCl.nWeeks, method: 'cluster' }
      : (out.z != null ? { edge: out.edge, z: out.z, method: out.method } : null);
    if (rawCl) {
      out.raw = { edge: rawCl.edge, z: rawCl.z, nWeeks: rawCl.nWeeks, method: 'cluster' };
    } else if (e.n >= 100 && nn.n >= 100 && A.srw != null && E.srw != null) {
      /* row fallback: raw edge from raw sums; SE proxied by the detrended
         variance (no raw row-level variance is kept in the store). */
      var rawEdge = (E.srw / E.n) - ((A.srw - E.srw) / Math.max(1, A.n - E.n));
      out.raw = { edge: rawEdge, z: out.z, method: 'row-proxy' };
    }
    /* v4.6 (feedback C): the verdict runs on RAW money ("did the gate make
       money"), falling back to the detrended basis only when raw data is
       missing. out.edge/out.z stay as the detrended compat aliases. */
    var v = out.raw || out.model;
    if (v && v.z != null) {
      out.verdictBasis = out.raw ? 'raw' : 'detrended';
      out.verdict = v.z > 2 ? 'gate-adds-value' : (v.z < -2 ? 'gate-hurts' : 'gate-no-better');
    }
    return out;
  }

  /* ── Live tracking ───────────────────────────────────────────────────── */
  /* v4.6: the live store NAME derives from the basis signature (which
     contains BASIS_REV and every stored-basis parameter), so any model
     change — a tau retune included — rotates the scorecard automatically;
     predictions frozen under different shrinkage regimes never mix in one
     aggregate. Records from earlier bases keep settling on their own
     snapshotted basis (feedback A): settlement and episode reads SWEEP every
     live store; only the scorecard aggregate is current-basis. Literal
     v-numbered names (stox_ev_live_v1..v7) are legacy and cleaned at load. */
  function liveBase(cfg) { return (cfg.live && cfg.live.key) || 'stox_ev_live'; }
  function liveKey(cfg) {
    var sig = calibrationSignature(cfg);
    return liveBase(cfg) + '_' + sig.slice(sig.indexOf('|') + 1);
  }
  function liveStoreKeys(cfg) {
    var base = liveBase(cfg), keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(base) === 0 && k !== TOMB_KEY) keys.push(k);
      }
    } catch (e) {}
    var cur = liveKey(cfg);
    keys.sort(function (a, b) { return a === cur ? -1 : (b === cur ? 1 : 0); });
    if (keys.indexOf(cur) < 0) keys.unshift(cur);
    return keys;
  }
  function loadLive(cfg) { var d = loadStore(liveKey(cfg)); if (!d.records) d.records = []; return d; }

  /* v4.4.1: expose the "latest assessment" of an open episode so the caller
   can warn the user that the signal/plan changed since the episode opened,
   WITHOUT creating a second record and WITHOUT changing the scorecard
   settlement. recordPrediction() below is a boolean wrapper for backward
   compatibility. */
  function recordPredictionDetailed(best, opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var daily = completedOnly(opts.dailyCandles || [], cfg);
    var symbol = opts.symbol || (best && best.symbol);
    if (!best || !best.expectedValue || !symbol || !daily.length) {
      return { recorded: false, reason: 'invalid_input' };
    }
    /* v4.7: the scorecard settles every record on the nominal next-open convention. An EV priced on
       intraday remaining distances is a different bet, so it is not scored (the post-close rescan is). */
    if (best.intraday && best.intraday.adjusted) return { recorded: false, reason: 'intraday_adjusted' };
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

    /* v4.7.2 (dup-episode fix): the SAME trade must never be logged in two
       basis stores. A model/config change rotates the live store, but a
       signal already recorded elsewhere - or a still-open episode that
       already covers today - is one trade, not two. Sweep EVERY basis store
       before creating; the other store's record keeps settling on its own
       snapshot basis. */
    var curKey = liveKey(cfg);
    var allKeys = liveStoreKeys(cfg);
    for (var okI = 0; okI < allKeys.length; okI++) {
      var oKey = allKeys[okI];
      if (oKey === curKey) continue;
      var orecs = (loadStore(oKey).records || []);
      for (var oi = 0; oi < orecs.length; oi++) {
        var orec = orecs[oi];
        if (orec.symbol !== symbol) continue;
        if (orec.id === id || ((orec.signalDate || orec.date) === signalDate)) {
          return {
            recorded: false, reason: 'same_day', existing: orec,
            otherBasis: true, storeKey: oKey, changes: null, anyChange: false
          };
        }
        if (orec.status === 'open') {
          var oDate = orec.signalDate || orec.date;
          var oElapsed = null, oq;
          for (oq = 0; oq < daily.length; oq++) {
            if (String(daily[oq].t).slice(0, 10) === oDate) { oElapsed = (daily.length - 1) - oq; break; }
          }
          if (oElapsed == null) {
            var odA = dayOrdinal(signalDate), odB = dayOrdinal(oDate);
            if (odA != null && odB != null) oElapsed = odA - odB;
          }
          if (!(oElapsed != null && oElapsed >= Math.max(1, num(orec.h, 1)))) {
            return {
              recorded: false, reason: 'already_open', existing: orec,
              otherBasis: true, storeKey: oKey, changes: null, anyChange: false
            };
          }
        }
      }
    }

    /* Fresh episode. */
    var currentExit = exitOpts(cfg);
    var decisionSnapshot = {
      decideAfterTax: cfg.decideAfterTax !== false,
      taxRatePct: num(cfg.taxRatePct, 0),
      taxLossCredit: num(cfg.taxLossCredit, 0),
      /* v4.6 (feedback A): snapshot the OUTCOME-LABEL basis at prediction
         time so settlement uses the original basis, not today's. */
      driftKeep: num(cfg.driftKeep, 0.5),
      lookbackBars: num(cfg.lookbackBars, 500),
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
     signal changed since the episode opened? Returns null if not open.
     v4.6: sweeps every basis store — an episode opened under an older model
     is still a live trade; the basis is reported so the UI can say so. */
  function getOpenEpisode(symbol, opts) {
    var cfg = getConfig(opts && opts.config);
    var keys = liveStoreKeys(cfg), curKey = liveKey(cfg);
    for (var ki = 0; ki < keys.length; ki++) {
      var st = loadStore(keys[ki]);
      for (var i = 0; i < (st.records || []).length; i++) {
        if (st.records[i].symbol === symbol && st.records[i].status === 'open') {
          return {
            id: st.records[i].id,
            basis: keys[ki] === curKey ? 'current' : 'older',
            basisIsCurrent: keys[ki] === curKey,
            signalDate: st.records[i].signalDate,
            h: st.records[i].h, t: st.records[i].t,
            pred: st.records[i].pred, score: st.records[i].score,
            latest: st.records[i].latest || null,
            latestChanged: !!st.records[i].latestChanged,
            latestDelta: st.records[i].latestDelta || null
          };
        }
      }
    }
    return null;
  }

  /* ══════════ v4.7.1 EPISODE PROGRESS (EPISODE_PROGRESS_V1) ══════════
     Did the live prediction's plan reach its target (or stop)? Judged on the RAW price path the trader
     sees (entry = next-session open, levels = entry x (1 +/- pct)), NOT on the scorecard's detrended
     model-basis outcome, which can say "target" when price never reached the level (or the reverse).
     Includes today's forming bar and the live price, so a same-session hit shows before the close.
     status: pending_entry | running | target_hit | stop_hit | ambiguous_bar | expired */
  function findEpisodeRecord(symbol, cfg, recentMs) {
    var keys = liveStoreKeys(cfg), curKey = liveKey(cfg), now = Date.now(), best = null;
    for (var ki = 0; ki < keys.length; ki++) {
      var recs = (loadStore(keys[ki]).records || []);
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.symbol !== symbol) continue;
        var open = r.status === 'open';
        var recent = r.status === 'settled' && r.settledAt && (now - r.settledAt) <= recentMs;
        if (!open && !recent) continue;
        var rank = open ? 2 : 1, ts = open ? (r.ts || 0) : (r.settledAt || 0);
        if (!best || rank > best.rank || (rank === best.rank && ts > best.ts)) {
          best = { rec: r, rank: rank, ts: ts, basisIsCurrent: keys[ki] === curKey };
        }
      }
    }
    return best;
  }

  function episodeProgress(symbol, dailyCandles, opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var daily = dailyCandles || [];
    if (!symbol || !daily.length) return null;
    var found = findEpisodeRecord(symbol, cfg, num(opts.recentDays, 1.5) * 86400000);
    if (!found) return null;
    var rec = found.rec, n = daily.length;
    var byDate = {};
    daily.forEach(function (b, k) { byDate[candleDate(b.t)] = k; });
    var i = byDate[rec.date];
    if (i == null) return null;

    var h = Math.max(1, num(rec.h, 1)), T = num(rec.t, 0), S = num(rec.stop, 0);
    var fixed = (rec.mode || 'fixed') === 'fixed';
    var out = {
      id: rec.id, symbol: symbol, signalDate: rec.date, settled: rec.status === 'settled',
      basisIsCurrent: found.basisIsCurrent, horizonDays: h, targetPct: T, stopPct: S, exitMode: rec.mode || 'fixed',
      status: 'pending_entry', source: null, entryDate: null, entryPrice: null, targetPrice: null, stopPrice: null,
      hitDate: null, daysToHit: null, daysElapsed: 0, daysLeft: h, currentPct: null, peakPct: null
    };
    var entryBar = daily[i + 1];
    if (!entryBar || !(entryBar.o > 0)) return out;               // entry (next open) has not happened yet

    var entry = entryBar.o, tgt = entry * (1 + T / 100), stp = entry * (1 - S / 100);
    out.entryDate = candleDate(entryBar.t); out.entryPrice = round(entry, 2);
    out.targetPrice = round(tgt, 2); out.stopPrice = round(stp, 2);

    var lastBar = daily[n - 1];
    var livePx = num(opts.livePrice, 0);
    if (!(livePx > 0)) {
      var hr = opts.hourlyCandles && opts.hourlyCandles.length ? opts.hourlyCandles[opts.hourlyCandles.length - 1] : null;
      livePx = (hr && hr.c > 0 && candleDate(hr.t) >= candleDate(lastBar.t)) ? hr.c : lastBar.c;
    }

    var last = Math.min(n - 1, i + h), hi = -Infinity, kind = null, hitIdx = -1;
    for (var k = i + 1; k <= last; k++) {
      var b = daily[k];
      if (!(b.h > 0) || !(b.l > 0)) continue;
      if (b.h > hi) hi = b.h;
      var gotT = b.h >= tgt, gotS = fixed && b.l <= stp;
      if (gotT && gotS) {
        /* both levels inside one bar: only an open beyond a level tells the order; otherwise it is unknowable from a daily bar */
        kind = b.o >= tgt ? 'target' : (b.o <= stp ? 'stop' : 'ambiguous'); hitIdx = k; break;
      }
      if (gotT) { kind = 'target'; hitIdx = k; break; }
      if (gotS) { kind = 'stop'; hitIdx = k; break; }
    }
    var source = 'bar';
    if (!kind && livePx > 0) {
      if (livePx >= tgt) { kind = 'target'; source = 'live'; }
      else if (fixed && livePx <= stp) { kind = 'stop'; source = 'live'; }
      if (kind) {
        var today = istClock().date;
        hitIdx = candleDate(lastBar.t) === today ? n - 1 : n;
        if (livePx > hi) hi = livePx;
      }
    }
    var completedLen = completedOnly(daily, cfg).length;
    out.daysElapsed = Math.max(0, Math.min(h, completedLen - 1 - i));
    out.daysLeft = Math.max(0, h - out.daysElapsed);
    if (isFinite(hi) && hi > 0) out.peakPct = round((hi / entry - 1) * 100, 2);
    out.currentPct = livePx > 0 ? round((livePx / entry - 1) * 100, 2) : null;

    if (kind === 'target') out.status = 'target_hit';
    else if (kind === 'stop') out.status = 'stop_hit';
    else if (kind === 'ambiguous') out.status = 'ambiguous_bar';
    else out.status = (completedLen - 1 >= i + h) ? 'expired' : 'running';
    if (kind && kind !== 'ambiguous') {
      out.source = source;
      out.hitDate = source === 'live' ? istClock().date : candleDate(daily[hitIdx].t);
      out.daysToHit = hitIdx - i;
    }
    /* a settled record's own raw-basis outcome is authoritative for the final state */
    if (rec.status === 'settled' && rec.outcomeRaw) {
      if (rec.outcomeRaw === 'target') { out.status = 'target_hit'; out.source = out.source || 'settled'; }
      else if (rec.outcomeRaw === 'stop') { out.status = 'stop_hit'; out.source = out.source || 'settled'; }
      else if (rec.outcomeRaw === 'timeout') out.status = 'expired';
    }
    return out;
  }

  /* Recently settled predictions (raw-basis outcome), newest first, for a "Recent results" strip. */
  function recentResults(opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config), now = Date.now(), maxAge = num(opts.days, 7) * 86400000, out = [];
    /* v4.7.2: the same episode can sit in several basis stores (re-logged
       after a model change rotated the live store while it was still open).
       Show each trade ONCE - liveStoreKeys() lists the current-basis store
       first, so the current-basis copy wins. */
    var seen = {};
    liveStoreKeys(cfg).forEach(function (key) {
      (loadStore(key).records || []).forEach(function (r) {
        if (r.status !== 'settled' || !r.settledAt || now - r.settledAt > maxAge) return;
        var eid = r.id || ((r.symbol || '') + '|' + (r.signalDate || r.date || ''));
        if (seen[eid]) return;
        seen[eid] = true;
        out.push({
          symbol: r.symbol, signalDate: r.signalDate || r.date, entryDate: r.entryDate || null,
          entryPrice: r.entryPrice || null, horizonDays: r.h,
          targetPct: r.t != null ? round(num(r.t, 0), 2) : null,
          stopPct: r.stop != null ? round(num(r.stop, 0), 2) : null,
          outcome: r.outcomeRaw || r.outcome, modelOutcome: r.outcome,
          realizedRawPct: r.realRaw != null && isFinite(r.realRaw) ? round(r.realRaw, 2) : null,
          predictedPct: r.pred != null ? round(r.pred, 2) : null, settledAt: r.settledAt
        });
      });
    });
    out.sort(function (a, b) { return b.settledAt - a.settledAt; });
    return out.slice(0, Math.max(1, num(opts.limit, 12)));
  }

  function settlePredictions(symbol, dailyCandles, opts) {
    opts = opts || {};
    var cfg = getConfig(opts.config);
    var daily = completedOnly(dailyCandles || [], cfg), settled = 0;
    if (!daily.length) return { settled: 0 };
    var byDate = {};
    daily.forEach(function (b, k) { byDate[String(b.t).slice(0, 10)] = k; });
    /* v4.6: sweep EVERY basis store — episodes opened under an older model
       keep settling on their own snapshotted basis (feedback A). */
    liveStoreKeys(cfg).forEach(function (storeKey) {
      var st = loadStore(storeKey);
      if (!st.records || !st.records.length) return;
      var changed = false;
      st.records.forEach(function (rec) {
      if (rec.status !== 'open' || rec.symbol !== symbol) return;
      var i = byDate[rec.date];
      if (i == null) return;
      var complete = i + rec.h <= daily.length - 1;
      /* v4.6 (feedback A): settlement uses the ORIGINAL outcome basis —
         driftKeep / lookbackBars snapshotted at prediction time (records
         without a snapshot fall back to the current config; note the explicit
         null checks — num(null, fb) would return 0, not fb). */
      var snap = rec.decisionSnapshot || null;
      var lbSrc = (snap && snap.lookbackBars != null) ? snap.lookbackBars : cfg.lookbackBars;
      var dkSrc = (snap && snap.driftKeep != null) ? snap.driftKeep : cfg.driftKeep;
      var lbBars = Math.max(1, num(lbSrc, 500));
      var driftKeepI = clamp(num(dkSrc, 0.5), 0, 1);
      var muI = 0, mc = 0;
      for (var q = Math.max(1, i - lbBars + 1); q <= i; q++) {
        if (daily[q - 1].c > 0 && daily[q].c > 0) { muI += Math.log(daily[q].c / daily[q - 1].c); mc++; }
      }
      var removedI = (1 - driftKeepI) * (mc ? muI / mc : 0);
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
      if (changed) saveStore(storeKey, st);
    });
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
    /* v4.6: the aggregate is CURRENT-BASIS only (model changes rotate the
       store name); older-basis episodes keep settling on their own snapshot
       but are counted separately so the UI can say so. */
    out.basis = liveKey(cfg).slice(liveBase(cfg).length + 1);
    out.otherBases = { open: 0, settled: 0 };
    liveStoreKeys(cfg).forEach(function (k) {
      if (k === liveKey(cfg)) return;
      var s2 = loadStore(k);
      (s2.records || []).forEach(function (r) {
        if (r.status === 'settled') out.otherBases.settled++; else out.otherBases.open++;
      });
    });
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
    try {
      var cfg = getConfig(opts && opts.config);
      liveStoreKeys(cfg).forEach(function (k) { localStorage.removeItem(k); });
      localStorage.removeItem(TOMB_KEY);   // clearLive = clean slate, tombstones included
      return true;
    } catch (e) { return false; }
  }

  /* ── Old-basis store pruning + tombstone rollup (follow-up to feedback D) ─
     A non-current basis store that is FULLY SETTLED and idle for
     keepSettledDays (default 90) is rolled up into a tiny tombstone summary
     and removed. Rationale for 90: 3x the 20-bar (≈29-day) settlement bound,
     and one quarter of out-of-sample comparison per model basis — the audit
     window you want after a tau retune. Stores with ANY open record are never
     pruned; the current-basis store is never pruned; keepSettledDays = 0
     disables. The tombstone keeps cross-model history (n, mean predicted vs
     realized, raw mean, date range) at summary level after the rows go. */
  var TOMB_KEY = 'stox_ev_live_tombstones';
  function liveTombstones() {
    var t = loadStore(TOMB_KEY);
    return Array.isArray(t.entries) ? t.entries : [];
  }
  function pruneLiveStores(cfg, opts) {
    opts = opts || {};
    cfg = cfg || getConfig();
    var days = num(opts.keepSettledDays != null ? opts.keepSettledDays : (cfg.live && cfg.live.keepSettledDays), 90);
    if (!(days > 0)) return { pruned: 0, disabled: true, cutoffDays: days };
    var base = liveBase(cfg), cur = liveKey(cfg);
    var cutoff = Date.now() - days * 86400000;
    var pruned = 0;
    liveStoreKeys(cfg).forEach(function (k) {
      if (k === cur || k === TOMB_KEY) return;
      var st = loadStore(k);
      var recs = st.records || [];
      if (!recs.length) { try { localStorage.removeItem(k); } catch (e) {} return; }
      var open = 0, last = 0, n = 0, sp = 0, sr = 0, sRaw = 0, nRaw = 0, firstDate = null, lastDate = null;
      recs.forEach(function (r) {
        var t = num(r.settledAt, 0) || num(r.ts, 0);
        if (t > last) last = t;
        if (r.status !== 'settled') { open++; return; }
        if (!isFinite(r.real)) return;
        n++; sp += num(r.pred, 0); sr += r.real;
        if (isFinite(r.realRaw)) { sRaw += r.realRaw; nRaw++; }
        var d = String(r.date || '').slice(0, 10);
        if (d && (!firstDate || d < firstDate)) firstDate = d;
        if (d && (!lastDate || d > lastDate)) lastDate = d;
      });
      if (open > 0) return;              // never prune unsettled stores
      if (!(last <= cutoff)) return;     // last activity within retention window: keep
      var rollup = {
        basis: k.indexOf(base + '_') === 0 ? k.slice(base.length + 1) : k,
        n: n,
        meanPredicted: n ? round(sp / n, 4) : null,
        meanRealized: n ? round(sr / n, 4) : null,
        meanRealizedRaw: nRaw ? round(sRaw / nRaw, 4) : null,
        bias: n ? round((sr - sp) / n, 4) : null,
        firstDate: firstDate, lastDate: lastDate,
        lastSettledAt: last || null,
        prunedAt: Date.now()
      };
      var tomb = loadStore(TOMB_KEY);
      if (!Array.isArray(tomb.entries)) tomb.entries = [];
      tomb.entries.push(rollup);
      if (!saveStore(TOMB_KEY, tomb)) return;   // keep the rows if the rollup cannot be written
      try { localStorage.removeItem(k); pruned++; } catch (e) {}
    });
    return { pruned: pruned, cutoffDays: days, tombstones: liveTombstones().length };
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
    /* v4.6 (feedback E2): a slope clearly below 1 says so directly — the
       bucket flag is a noisy late indicator of the same problem. */
    if (g && g.slope != null && g.slopeSe != null && g.slope + 2 * g.slopeSe < 1) {
      raise('caution', 'Predictions vary about ' + round(1 / Math.max(0.05, g.slope), 1) +
        'x as much as outcomes (slope ' + round(g.slope, 2) + ' +/- ' + round(g.slopeSe, 2) +
        '): EV magnitudes are over-dispersed — shrinkage retune recommended.');
    }
    /* v4.6 (feedback E3): the all-setups weak-ranking verdict stays visible
       even when Buy-grade (n >= 100) is the headline group. */
    if (g && g.verdict === 'consistent') {
      var wr = (rel.all && rel.all.verdict === 'weak-ranking') ? rel.all
        : ((rel.elig && rel.elig.verdict === 'weak-ranking') ? rel.elig : null);
      if (wr) raise('caution', 'Levels match, but higher-EV picks have not done better than lower-EV picks (slope ' + round(wr.slope, 2) + ' on ' + wr.n + ' rows).');
    }
    if (rel.topBucket && rel.topBucket.verdict === 'optimistic') raise('caution', 'The top EV bucket (' + rel.topBucket.label + ') realized ' + round(rel.topBucket.gap, 2) + '% vs predicted.');
    if (rel.ageDays != null && rel.ageDays > num(cfg.staleCalibrationDays, 21)) raise('stale', 'Calibration has not been refreshed for ' + Math.round(rel.ageDays) + ' days.');
    var live = livePerformance();
    if (live.settled >= 30 && live.verdict === 'overconfident') raise('stale', 'Live results are below what was predicted (' + round(live.meanRealized, 2) + '% vs ' + round(live.meanPredicted, 2) + '%, n=' + live.settled + ').');
    var gate = gateReport(key);
    if (gate.verdict === 'gate-hurts') raise('caution', 'Setups the Buy filter rejected did better than those it accepted.');
    else if (gate.verdict === 'gate-no-better') raise('caution', 'The Buy filter shows no detectable advantage over rejected setups.');
    /* v4.9 (P2): a negative pool mean is a GATING problem, not a ranking one -
       ranking well inside a losing pool still loses money. Week-clustered
       raw-money t-test on the walk-forward plans. */
    try {
      var wk = rel.weeks || {}, xs = [];
      Object.keys(wk).forEach(function (k) {
        var w = wk[k];
        if (w && w.n >= 5 && isFinite(w.srw)) xs.push(w.srw / w.n);
      });
      if (xs.length >= 12) {
        var wm = 0, wi;
        for (wi = 0; wi < xs.length; wi++) wm += xs[wi];
        wm /= xs.length;
        var wss = 0;
        for (wi = 0; wi < xs.length; wi++) wss += (xs[wi] - wm) * (xs[wi] - wm);
        var wse = xs.length > 1 ? Math.sqrt(wss / (xs.length - 1)) / Math.sqrt(xs.length) : NaN;
        if (wm < 0 && isFinite(wse) && wm + 2 * wse < 0) {
          raise('caution', 'The candidate pool loses money on average (raw realized ' + round(wm, 2) + '% per plan over ' + xs.length + ' weeks, t < -2): this is a gating problem, not a ranking one - consider raising minNetEV / minPositiveProbability before trusting any pick from this pool.');
        }
      }
    } catch (_poolErr) {}
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

  /* ── Row-level prediction store + offline shrinkage retune (feedback D) ──
     The raw ingredients of every stored prediction — unshrunk EV, standard
     error, prior mean, haircut, horizon — so tau (evPriorStdPct) can be
     re-tuned offline in milliseconds without a replay. IndexedDB when
     available (the full ~9k-row history is too much for localStorage); a
     capped in-memory ring otherwise (same-session use only). */
  var _rowMem = [], _rowMemMax = 2000;
  function rowStoreShape(r) {
    return {
      date: r.date, pred: r.pred, raw: r.raw, real: r.real, realRaw: r.realRaw,
      elig: !!r.elig, basisEV: r.basisEV, stdErrPct: r.stdErrPct,
      /* v4.8: haircutPct is the EFFECTIVE penalty (coef x raw); haircutRawPct
         is the raw split-half estimate the coefficient is fitted on. */
      haircutPct: r.haircutPct, haircutRawPct: r.haircutRawPct, haircutCoef: r.haircutCoef,
      /* v4.9.3 (P2): score recipe (signal scale, effective shrinkage,
         selection-bias term) */
      signalScale: r.signalScale, shrinkFactor: r.shrinkFactor, selBiasPct: r.selBiasPct,
      /* v4.9 (P1/P2): symbol hash + selection features (plan count, winner gap) */
      sym: r.sym, planCount: r.planCount, winnerGapPct: r.winnerGapPct,
      priorMeanPct: r.priorMeanPct, horizonDays: r.horizonDays,
      /* v4.9.2 (A2) */
      basis: r.basis, ver: r.ver,
      anchorPct: r.anchorPct, anchorWeight: r.anchorWeight, pooledWeight: r.pooledWeight,
      pEv: r.pEv, pRet: r.pRet, evidence: r.evidence, setupQ: r.setupQ, code: r.code,
      regTrend: r.regTrend, regVol: r.regVol
    };
  }
  function rowStorePut(rows) {
    (rows || []).forEach(function (r) {
      _rowMem.push(r);
      if (_rowMem.length > _rowMemMax) _rowMem.splice(0, _rowMem.length - _rowMemMax);
    });
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return _rowMem.length;
      var req = indexedDB.open('stox_ev_rows', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('rows')) db.createObjectStore('rows', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = function () {
        var tx = req.result.transaction('rows', 'readwrite');
        var os = tx.objectStore('rows');
        (rows || []).forEach(function (r) { try { os.put(r); } catch (e) {} });
      };
    } catch (e) {}
    return _rowMem.length;
  }
  function rowStoreRows() { return _rowMem.slice(); }
  /* v4.9.2 (A3): a basis rotation used to clear localStorage but leave the
     IndexedDB rows behind, so stale old-basis rows sat next to the rebuilt
     ones. Never creates the database without its store (same upgrade
     handler as rowStorePut), so a later rowStorePut still finds 'rows'. */
  function rowStoreClear() {
    _rowMem = [];
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return;
      var req = indexedDB.open('stox_ev_rows', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('rows')) db.createObjectStore('rows', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = function () {
        var db = req.result;
        try {
          if (db.objectStoreNames.contains('rows')) db.transaction('rows', 'readwrite').objectStore('rows').clear();
        } catch (e) {}
        db.close();
      };
    } catch (e) {}
  }

  function olsSlope(xs, ys) {
    var n = xs.length, mx = 0, my = 0, i;
    if (n < 3) return null;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0;
    for (i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
    return sxx > 1e-12 ? sxy / sxx : null;
  }

  /* ── Joint offline re-tune (v4.8; supersedes the v4.6 tau scan) ──────────
     The v4.6 retune regressed realized on the FULL score to tune tau. The
     ev-ab-test.js re-scoring showed the score's variance is dominated by the
     selection haircut (corr(score, -haircut) = 0.95-0.97), so that slope was
     mostly haircut dispersion - tau was being asked to fix noise it cannot
     reach, and the target never stabilized. v4.8 identifies the two levers
     jointly, on their own regressors:

        realized - priorMean  =  b1 x signal(tau)  +  b2 x (-haircutRaw) + e
        signal(tau) = lam(tau) x (basisEV - priorMean),
        lam(tau)   = tau^2 / (tau^2 + s^2)  (s = stdErrPct)

     The scoring formula puts coefficient 1 on both terms, so a well-shrunk,
     well-penalized predictor has (b1, b2) = (1, 1):
       - best tau  = the grid point whose b1 is closest to 1,
       - haircutCoef suggestion = clamp(b2, 0, 1.5).
     Plain centered OLS (2 regressors, implicit intercept); coefficients only
     - for inference use the row store with week-clustered errors (ev-ab-test
     style). Rows without haircutRawPct (pre-v4.8) use haircutPct as raw. */
  /* v4.9.3 (P1): as-of de-contamination of stored priors for offline fitting.
     Rows backfilled before EV-4.9.3 were anchored on the LIFETIME reliability
     mean (look-ahead); this re-anchors each row's prior on strictly earlier
     weeks only, applying the correction the score would have carried:
       pmClean = pm + (1 - lam) x (1 - pooledWeight) x anchorWeight
                     x (asOfMean(earlier weeks) - anchorPct)
     (the (1 - lam) chain factor is d(score)/d(prior); ev-ab-test v3 omitted
     it). Rows built under v4.9.3+ are already as-of and shift ~ 0. */
  function asOfPriors(rows, pm) {
    var byW = {}, wkSet = {};
    rows.forEach(function (r) {
      var w = r.date ? weekKeyOf(String(r.date).slice(0, 10)) : null;
      if (!w) return;
      wkSet[w] = true;
      if (r.elig) { var b = byW[w] = byW[w] || { n: 0, s: 0 }; b.n++; b.s += num(r.real, 0); }
    });
    var weeks = Object.keys(wkSet).sort();
    var asOf = {}, n = 0, s = 0, minRows = 100;
    weeks.forEach(function (w) {
      asOf[w] = n >= minRows ? s / n : null;
      if (byW[w]) { n += byW[w].n; s += byW[w].s; }
    });
    var tauBase = num(getConfig().evPriorStdPct, 0.3), defH = num(getConfig().defaultHorizon, 10);
    return rows.map(function (r, i) {
      var w = r.date ? weekKeyOf(String(r.date).slice(0, 10)) : null;
      var a = w != null ? asOf[w] : null;
      var aw = isFinite(r.anchorWeight) ? r.anchorWeight : 0;
      var ap = isFinite(r.anchorPct) ? r.anchorPct : null;
      var pw = isFinite(r.pooledWeight) ? r.pooledWeight : 0;
      if (a == null || ap == null || !(aw > 0)) return pm[i];
      var lam = isFinite(r.shrinkFactor) ? r.shrinkFactor : (function () {
        var tau = Math.max(0.05, tauBase * Math.sqrt(Math.max(1, num(r.horizonDays, defH)) / defH));
        var se = Math.max(0.02, num(r.stdErrPct, 0.5));
        return tau * tau / (tau * tau + se * se);
      })();
      return pm[i] + (1 - lam) * (1 - pw) * aw * (a - ap);
    });
  }

  function retuneTuning(rows, opts) {
    opts = opts || {};
    var grid = opts.grid || [0.15, 0.2, 0.25, 0.28, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.75, 1.0];
    var defH = num(opts.defaultHorizon, 10);
    var usable = (rows || []).filter(function (r) {
      return r && isFinite(r.basisEV) && isFinite(r.stdErrPct) && isFinite(r.real) && isFinite(r.horizonDays);
    });
    if (usable.length < 30) return { ok: false, reason: 'insufficient_rows', n: usable.length };

    var pm = usable.map(function (r) { return isFinite(r.priorMeanPct) ? r.priorMeanPct : 0; });
    /* v4.9.3 (P1): default ON - fits must not learn from look-ahead priors. */
    if (opts.asof !== false) pm = asOfPriors(usable, pm);
    var y = usable.map(function (r, i) { return r.real - pm[i]; });
    var hcRaw = usable.map(function (r) {
      var h = (r.haircutRawPct != null && isFinite(r.haircutRawPct)) ? r.haircutRawPct : num(r.haircutPct, 0);
      return isFinite(h) ? h : 0;
    });

    /* centered 2-regressor OLS; degenerate columns return null coefficients */
    function avg(a) { var t = 0, i; for (i = 0; i < a.length; i++) t += a[i]; return a.length ? t / a.length : NaN; }
    function fit2(x1, x2, yy) {
      var n = x1.length, m1 = avg(x1), m2 = avg(x2), my = avg(yy), j;
      var s11 = 0, s22 = 0, s12 = 0, s1y = 0, s2y = 0;
      for (j = 0; j < n; j++) {
        var a1 = x1[j] - m1, a2 = x2[j] - m2, ay = yy[j] - my;
        s11 += a1 * a1; s22 += a2 * a2; s12 += a1 * a2; s1y += a1 * ay; s2y += a2 * ay;
      }
      if (!(s11 > 0)) return { b1: null, b2: null };
      if (!(s22 > 0)) return { b1: s1y / s11, b2: null };
      var det = s11 * s22 - s12 * s12;
      if (!(Math.abs(det) > 1e-12)) return { b1: s1y / s11, b2: null };
      return { b1: (s1y * s22 - s2y * s12) / det, b2: (s2y * s11 - s1y * s12) / det };
    }

    var best = null, out = [];
    grid.forEach(function (tauBase) {
      var sig = usable.map(function (r, k) {
        var tau = Math.max(0.05, tauBase * Math.sqrt(Math.max(1, num(r.horizonDays, defH)) / defH));
        var s = Math.max(0.02, num(r.stdErrPct, 0.5));
        var lam = tau * tau / (tau * tau + s * s);
        return lam * (r.basisEV - pm[k]);
      });
      var f = fit2(sig, hcRaw, y);
      var dev = f.b1 == null ? Infinity : Math.abs(f.b1 - 1);
      /* fit2 runs on +hcRaw, so its second coefficient is MINUS the penalty
         weight the formula uses; negate it back (target = 1). */
      var rec = { tauBase: tauBase, slope: f.b1, signalSlope: f.b1, haircutCoefFit: f.b2 == null ? null : -f.b2, deviation: dev };
      out.push(rec);
      if (!best || dev < best.deviation) best = rec;
    });
    /* v4.9 (P1): per-eligibility fits - the A/B showed the haircut's ranking
       value lives mostly outside Buy-grade, so one global coefficient may be
       wrong for the rows that actually trade. Reported so the tuner can flag
       divergence; the engine still applies one global haircutCoef. */
    var byElig = null;
    if (best && usable.some(function (r) { return r.elig; }) && usable.some(function (r) { return !r.elig; })) {
      var sigBest = usable.map(function (r, k) {
        var tau = Math.max(0.05, best.tauBase * Math.sqrt(Math.max(1, num(r.horizonDays, defH)) / defH));
        var s = Math.max(0.02, num(r.stdErrPct, 0.5));
        var lam = tau * tau / (tau * tau + s * s);
        return lam * (r.basisEV - pm[k]);
      });
      var fitSub = function (take) {
        var x1 = [], x2 = [], ys = [], q;
        for (q = 0; q < usable.length; q++) if (take(usable[q])) { x1.push(sigBest[q]); x2.push(hcRaw[q]); ys.push(y[q]); }
        if (x1.length < 30) return { n: x1.length, b1: null, haircutCoefFit: null };
        var f = fit2(x1, x2, ys);
        return { n: x1.length, b1: f.b1, haircutCoefFit: f.b2 == null ? null : -f.b2 };
      };
      byElig = { elig: fitSub(function (r) { return !!r.elig; }), other: fitSub(function (r) { return !r.elig; }) };
    }
    var b2All = (best && best.haircutCoefFit != null && isFinite(best.haircutCoefFit)) ? clamp(best.haircutCoefFit, 0, 1.5) : null;
    var b2Buy = (byElig && byElig.elig && byElig.elig.haircutCoefFit != null && isFinite(byElig.elig.haircutCoefFit)) ? clamp(byElig.elig.haircutCoefFit, 0, 1.5) : null;
    return {
      ok: true, n: usable.length, best: best, grid: out, byElig: byElig,
      currentTauBase: num(getConfig().evPriorStdPct, 0.5),
      currentHaircutCoef: num(getConfig().haircutCoef, 1),
      suggestedHaircutCoef: b2All,
      /* v4.9.3 (P1): ready-to-apply patch - feed to applyTuning(). */
      suggested: best ? {
        evPriorStdPct: best.tauBase,
        haircutCoef: b2All,
        scoreFit: {
          enabled: true,
          b1: isFinite(best.slope) ? clamp(best.slope, 0.25, 4) : 1,
          b2: b2All, b2Buy: b2Buy
        }
      } : null
    };
  }

  /* v4.9.3 (P1): persist a retuneTuning() suggestion through the same
     'stox_ev_ui_config' channel the Tune panel uses (v4.7.2), so the basis
     signature, the live store name and the calibration family all follow
     the tuned basis on the next load/call. Expect a one-time store rebuild:
     these are prediction-affecting parameters. */
  function applyTuning(fit) {
    var s = fit && fit.suggested ? fit.suggested : fit;
    if (!s || (!isFinite(s.evPriorStdPct) && !s.scoreFit && !isFinite(s.haircutCoef))) return { ok: false, reason: 'no_suggestion' };
    var patch = {};
    if (isFinite(s.evPriorStdPct)) patch.evPriorStdPct = num(s.evPriorStdPct, 0.3);
    if (s.scoreFit && s.scoreFit.enabled !== false && (isFinite(s.scoreFit.b1) || s.scoreFit.b2 != null || s.scoreFit.b2Buy != null)) {
      patch.scoreFit = {
        enabled: true,
        b1: num(s.scoreFit.b1, 1),
        b2: s.scoreFit.b2 == null ? null : num(s.scoreFit.b2, 1),
        b2Buy: s.scoreFit.b2Buy == null ? null : num(s.scoreFit.b2Buy, 1)
      };
    } else if (isFinite(s.haircutCoef)) {
      patch.haircutCoef = num(s.haircutCoef, 1);
    }
    try {
      var raw = localStorage.getItem('stox_ev_ui_config');
      var cur = raw ? JSON.parse(raw) : {};
      if (!cur || typeof cur !== 'object') cur = {};
      Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
      localStorage.setItem('stox_ev_ui_config', JSON.stringify(cur));
      window.STOX_EV_CONFIG = Object.assign({}, window.STOX_EV_CONFIG || {}, patch);
    } catch (e) { return { ok: false, reason: 'config_write_failed' }; }
    return {
      ok: true, applied: patch,
      note: 'prediction-affecting parameters changed: the calibration family clears and rebuilds on next use (basis signature ' + BASIS_REV + ').'
    };
  }

  /* Back-compat wrapper: the pre-v4.8 shape ({best:{tauBase, slope, deviation},
     grid, currentTauBase}) so existing callers keep working. NOTE: 'slope' is
     now the SIGNAL coefficient from the joint fit (target 1), not the old
     full-score slope. */
  function retuneTau(rows, opts) {
    var r = retuneTuning(rows, opts);
    if (!r.ok) return r;
    r.best = { tauBase: r.best.tauBase, slope: r.best.slope, deviation: r.best.deviation };
    r.grid = r.grid.map(function (g) { return { tauBase: g.tauBase, slope: g.slope, deviation: g.deviation }; });
    return r;
  }

  function retSeries(daily, lookback) {
    daily = completedOnly(daily, getConfig());
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
    /* v4.9.3 (P0): dates are enumerated OLDEST-FIRST. With the as-of anchor
       the row VALUES no longer depend on processing order, but the anchor's
       minRows warm-up should still see earlier weeks before later ones so a
       rebuilt store reproduces what live decisions would have seen. */
    var eligible = [];
    for (var i = minStart; i <= lastStart; i++) {
      var ord = dayOrdinal(daily[i].t), prev = dayOrdinal(daily[i - 1].t);
      if (ord == null || prev == null) { out.reason = 'bad_dates'; return out; }
      if (weekOf(ord) !== weekOf(prev)) eligible.push(i);
    }

    /* v4.6 (feedback B): meta lives in the same envelope as calibration and
       reliability — the whole batch commits atomically below. */
    var parts = loadParts(key);
    var meta = parts.meta[symbol] || { newest: null, oldest: null, count: 0 };

    var fresh = [], older = [];
    eligible.forEach(function (idx) {
      var dt = String(daily[idx].t).slice(0, 10);
      if (meta.newest == null) older.push(idx);
      else if (dt > meta.newest) fresh.push(idx);
      else if (dt < meta.oldest) older.push(idx);
    });
    /* v4.9.3 (P0): chronological processing within the retention window
       (oldest -> newest). Retention is unchanged - the NEWEST `cap` dates
       are kept - but the kept block now builds forward in time so the
       anchor warm-up sees earlier weeks first. Past extension (`older`
       when a ledger exists) still runs boundary-first (descending) so the
       [oldest, newest] ledger never gains gaps. */
    var olderBudget = Math.max(0, cap - meta.count);
    var olderKeep = older.slice(Math.max(0, older.length - olderBudget));
    if (meta.newest != null) olderKeep.reverse();
    var todo = (meta.count < cap ? olderKeep : []).concat(fresh);
    out.remaining = Math.max(0, todo.length - maxSamples);
    todo = todo.slice(0, maxSamples);
    if (!todo.length) { out.reason = 'up_to_date'; return out; }

    var doRel = opts.reliability !== false;
    var sigNow = calibrationSignature(cfg);   /* v4.9.2 (A2): basis tag for every stored row */
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
                  elig: score >= buyTh,
                  /* v4.6 (feedback D): shrinkage re-tune ingredients — the
                     unshrunk EV, its standard error, the prior mean, the
                     haircut and the horizon (see retuneTau). */
                  basisEV: b.expectedValue.rawBasisPct,
                  stdErrPct: b.expectedValue.stdErrPct,
                  haircutPct: b.expectedValue.haircutPct,
                  haircutRawPct: b.expectedValue.haircutRawPct,
                  haircutCoef: b.expectedValue.haircutCoef,
                  /* v4.9 (P2): hashed symbol for de-dup + clustering; selection
                     features for the fitted score (plan count, winner gap). */
                  sym: shortHash(symbol),
                  planCount: b.expectedValue.selectionCandidates,
                  winnerGapPct: b.expectedValue.winnerGapPct,
                  /* v4.9.3 (P2): the score recipe - reproduces stored
                     predictions exactly in the A/B and the tuner. */
                  signalScale: b.expectedValue.signalScale,
                  shrinkFactor: b.expectedValue.shrinkFactor,
                  selBiasPct: b.expectedValue.selBiasPct,
                  priorMeanPct: b.expectedValue.priorMeanPct,
                  horizonDays: b.horizonDays,
                  /* v4.9.2 (A2): basis tag, anchor ingredients (as-of re-anchoring),
                     live-gate inputs and the index regime at entry */
                  basis: sigNow, ver: VERSION,
                  anchorPct: b.expectedValue.priorAnchorPct, anchorWeight: b.expectedValue.priorAnchorWeight,
                  pooledWeight: b.expectedValue.pooledWeight,
                  pEv: b.expectedValue.pPositive,
                  pRet: b.probability ? b.probability.positiveReturn : null,
                  evidence: b.evidenceConfidence, setupQ: b.setupQuality,
                  code: b.decision ? b.decision.code : null,
                  regTrend: b.regime ? b.regime.trend : null,
                  regVol: b.regime ? b.regime.volatility : null
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

    /* v4.6 (feedback B): ONE atomic commit for calibration + reliability +
       meta. A failed commit leaves everything as it was (the meta ledger
       included), so the retry is clean and can never double-count dates. */
    var outcomesAdded = applyOutcomeRows(parts.cal, rows);
    applyReliabilityRows(parts.rel, relRows);
    if (relRows.length) parts.rel.updated = Date.now();
    parts.meta[symbol] = meta;
    if (!commitBatch(key, parts)) { out.reason = 'store_write_failed'; return out; }
    out.rows = outcomesAdded;
    /* v4.6 (feedback D): row-level prediction ingredients (fire-and-forget). */
    if (relRows.length) { try { rowStorePut(relRows.map(rowStoreShape)); } catch (e) {} }
    return out;
  }

  /* v4.6 follow-up: prune fully-settled idle old-basis stores at load. */
  try { pruneLiveStores(getConfig()); } catch (e) {}

  return {
    version: VERSION,
    sessionState: function (daily, hourly, o) { return sessionState(daily, hourly, getConfig(o)); },
    episodeProgress: function (symbol, daily, o) { try { return episodeProgress(symbol, daily, o); } catch (e) { return null; } },
    recentResults: function (o) { try { return recentResults(o); } catch (e) { return []; } },
    getConfig: function (o) { return getConfig(o); },
    totalRoundTripCost: totalRoundTripCost,
    analyze: analyze,
    optimize: optimize,
    recordOutcome: recordOutcome,
    recordOutcomes: recordOutcomes,
    recordReliability: recordReliability,
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
    liveStoreKey: function (o) { return liveKey(getConfig(o)); },
    liveStoreKeys: function (o) { return liveStoreKeys(getConfig(o)); },
    pruneLiveStores: pruneLiveStores,
    liveTombstones: liveTombstones,
    rankingVerdict: rankingVerdict,
    diversify: diversify,
    upsideProfile: upsideProfile,
    upsideEstimate: upsideEstimate,
    upsideBaseline: upsideBaseline,
    returnSeries: function (daily, lookback) { return retSeries(daily, lookback || 90); },
    clearCalibration: clearCalibration,
    adoptCurrentBasis: adoptCurrentBasis,
    retuneTau: retuneTau,
    retuneTuning: retuneTuning,
    applyTuning: applyTuning,
    rowStoreRows: rowStoreRows,
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
      clusterSummary: clusterSummary,
      calibrationSignature: calibrationSignature,
      refreshCalibrationSignature: refreshCalibrationSignature,
      shortHash: shortHash,
      loadParts: loadParts, commitBatch: commitBatch,
      applyOutcomeRows: applyOutcomeRows, applyReliabilityRows: applyReliabilityRows,
      olsSlope: olsSlope,
      selectionHaircutMeta: selectionHaircutMeta,
      walkForwardMean: walkForwardMean,
      asOfPriors: asOfPriors,
      sessionState: sessionState, intradayBarriers: intradayBarriers, completedOnly: completedOnly,
      withSession: withSession, candleDate: candleDate, istClock: istClock, sessionIsOpen: sessionIsOpen
    }
  };
})();