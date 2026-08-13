/* ══════════════════════════════════════════════════════════════════════════
   Pattern-Aware Scoring — StoX
   Modifies live entry score and confidence computation to use per-stock
   patterns extracted from batch backtests. Falls back to generic scoring
   when no pattern is available.

   Dependencies: window.TechIndicators, window.PatternStore

   Usage:
     await PatternStore.init();
     var result = await PatternScoring.compute(symbol, candles, { indexCandles, dailyCandles, hourlyCandles });
     // result.entryScore — pattern-weighted entry score
     // result.confidence — pattern-calibrated confidence
     // result.patternUsed — which pattern data was used
     // result.breakdown — per-component breakdown
   ══════════════════════════════════════════════════════════════════════════ */

window.PatternScoring = (function () {

  function round2(v) { return v != null ? Math.round(v * 100) / 100 : null; }
  function round3(v) { return v != null ? Math.round(v * 1000) / 1000 : null; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ── In-memory pattern cache (avoids IDB read on every call) ────────── */
  var _patternCache = new Map();
  var _cacheMaxAge = 5 * 60 * 1000; // 5 minutes

  /**
   * Load pattern from cache or IndexedDB.
   */
  async function loadPattern(symbol) {
    var cached = _patternCache.get(symbol);
    if (cached && (Date.now() - cached._loadedAt < _cacheMaxAge)) {
      return cached;
    }

    if (!window.PatternStore) return null;
    var pattern = await PatternStore.get(symbol);
    if (pattern) {
      pattern._loadedAt = Date.now();
      _patternCache.set(symbol, pattern);

      // Evict oldest entries if cache grows too large
      if (_patternCache.size > 50) {
        var oldest = null;
        _patternCache.forEach(function (v, k) {
          if (!oldest || v._loadedAt < oldest._loadedAt) oldest = { key: k, ts: v._loadedAt };
        });
        if (oldest) _patternCache.delete(oldest.key);
      }
    }
    return pattern;
  }

  /**
   * Invalidate cache for a specific symbol or all symbols.
   */
  function invalidateCache(symbol) {
    if (symbol) {
      _patternCache.delete(symbol);
    } else {
      _patternCache.clear();
    }
  }

  /* ── Core Scoring ───────────────────────────────────────────────────── */

  /**
   * Compute pattern-aware entry score and confidence for a stock.
   *
   * @param {string} symbol - NSE stock symbol
   * @param {Array} candles - OHLCV candles (hourly/daily)
   * @param {Object} opts
   *   - indexCandles: [...] NIFTY candles
   *   - dailyCandles: [...] daily OHLCV
   *   - hourlyCandles: [...] hourly OHLCV (for confidence)
   *   - driftScore: number (optional, computed if not provided)
   * @returns {Object} {
   *   entryScore, classification, confidence, probTouch,
   *   patternUsed, breakdown, adjustments
   * }
   */
  async function compute(symbol, candles, opts) {
    opts = opts || {};

    var TI = window.TechIndicators;
    if (!TI) {
      return { entryScore: null, error: "TechIndicators not loaded" };
    }

    // 1. Compute base (generic) entry score
    var baseResult = null;
    try {
      baseResult = TI.computeEntryScore(candles, opts.indexCandles);
    } catch (e) {
      return { entryScore: null, error: "computeEntryScore failed: " + e.message };
    }

    if (!baseResult || baseResult.entry_score == null) {
      return { entryScore: null, error: "No entry score computed" };
    }

    // 2. Load stock pattern
    var pattern = await loadPattern(symbol);

    // 3. Compute pattern-weighted score
    var scoreResult = pattern
      ? applyPatternWeights(baseResult, pattern, candles)
      : { entryScore: baseResult.entry_score, classification: baseResult.classification, breakdown: null, adjustments: null };

    // 4. ML Enhancement — augment score with trained model prediction
    var mlResult = await applyMLEnhancement(symbol, candles, opts, baseResult, scoreResult);
    if (mlResult && mlResult.adjustedScore != null) {
      scoreResult.entryScore = mlResult.adjustedScore;
      scoreResult.classification = mlResult.adjustedClassification;
      scoreResult.mlEnhancement = mlResult;
    }

    // 5. Compute confidence
    var confidenceResult = await computeConfidence(symbol, candles, opts, pattern, baseResult);

    // 6. Use ML confidence if available and better than calibration
    if (mlResult && mlResult.winProbability != null) {
      var mlConf = mlResult.winProbability;
      // Blend: 70% ML confidence + 30% calibrated confidence when both available
      if (confidenceResult.confidence != null && confidenceResult.source === "pattern_calibrated") {
        confidenceResult.confidence = round3(mlConf * 0.7 + confidenceResult.confidence * 0.3);
        confidenceResult.source = "ml_blended";
      } else if (mlConf != null) {
        confidenceResult.confidence = round3(mlConf);
        confidenceResult.source = "ml_model";
      }
      confidenceResult.probTouch = confidenceResult.confidence;
      confidenceResult.calibratedProbTouch = confidenceResult.confidence;
    }

    // 7. Merge results
    return {
      entryScore: scoreResult.entryScore,
      classification: scoreResult.classification,
      confidence: confidenceResult.confidence,
      probTouch: confidenceResult.probTouch,
      probTouchRaw: confidenceResult.probTouchRaw,
      driftScore: confidenceResult.driftScore,
      driftLabel: confidenceResult.driftLabel,
      patternUsed: pattern ? extractPatternInfo(pattern) : null,
      breakdown: scoreResult.breakdown,
      adjustments: scoreResult.adjustments,
      mlEnhancement: scoreResult.mlEnhancement || null,
      baseScore: baseResult.entry_score,
      scoreDelta: scoreResult.entryScore != null ? round2(scoreResult.entryScore - baseResult.entry_score) : null,
      calibratedProbTouch: confidenceResult.calibratedProbTouch,
      confidenceSource: confidenceResult.source
    };
  }

  /* ── Apply Pattern Weights ──────────────────────────────────────────── */

  /**
   * Re-weight the entry score using stock-specific indicator weights.
   *
   * Strategy: The base entry_score uses equal weights for the 4 pillars
   * (trendHealth, pullbackQuality, prob4, swingPotential). If we have
   * per-stock indicator weights, we recompute:
   *
   *   weightedScore = Σ(pillar_score × stock_weight) × normalization_factor
   *
   * where normalization_factor preserves the 0-100 score range.
   */
  function applyPatternWeights(baseResult, pattern, candles) {
    var weights = pattern.indicatorWeights;
    var powers = pattern.indicatorPowers;

    if (!weights) {
      return { entryScore: baseResult.entry_score, classification: baseResult.classification };
    }

    // Extract pillar scores from base result
    var pillars = {
      trendHealth: baseResult.trend_health != null ? baseResult.trend_health : 0,
      pullbackQuality: baseResult.pullback_quality != null ? baseResult.pullback_quality : 0,
      prob4: baseResult.prob4 != null ? baseResult.prob4 : 0,
      swingPotential: baseResult.swing_potential != null ? baseResult.swing_potential : 0
    };

    // Get pillar max values from score config for normalization
    var pillarMax = { trendHealth: 35, pullbackQuality: 30, prob4: 35, swingPotential: 20 };
    if (window.TechIndicators && window.TechIndicators.getScoreConfig) {
      var sc = window.TechIndicators.getScoreConfig();
      if (sc.pillarMax) pillarMax = sc.pillarMax;
    }

    // Compute weighted score components
    var totalWeighted = 0;
    var totalWeight = 0;
    var breakdown = {};

    ["trendHealth", "pullbackQuality", "prob4", "swingPotential"].forEach(function (p) {
      var w = weights[p] || 0.25;
      var max = pillarMax[p] || 25;
      var normalizedPillar = clamp(pillars[p] / max, 0, 1);  // 0-1 scale
      var weighted = normalizedPillar * w;
      totalWeighted += weighted;
      totalWeight += w;

      // Compute power bonus: if the indicator's historical correlation is strong,
      // give a small bonus to signals that align with high-power ranges
      var powerBonus = 0;
      if (powers && powers[p] && powers[p].infoValue > 0.01) {
        // Boost if pillar is in its historically predictive range
        var infoValue = powers[p].infoValue;
        if (infoValue > 0.05 && normalizedPillar > 0.5) {
          powerBonus = round3(infoValue * normalizedPillar * 2);  // small boost
        }
      }

      breakdown[p] = {
        raw: pillars[p],
        normalized: round3(normalizedPillar),
        weight: round3(w),
        weighted: round3(weighted),
        powerBonus: powerBonus,
        max: max
      };
    });

    // Normalize back to 0-100 scale
    var baseWeightedScore = totalWeight > 0 ? (totalWeighted / totalWeight) * 100 : baseResult.entry_score;

    // Apply power bonus
    var powerBonusTotal = 0;
    if (breakdown) {
      ["trendHealth", "pullbackQuality", "prob4", "swingPotential"].forEach(function (p) {
        powerBonusTotal += (breakdown[p] && breakdown[p].powerBonus) || 0;
      });
    }

    var adjustedScore = clamp(round2(baseWeightedScore + powerBonusTotal), 0, 100);

    // Compute adjustments summary
    var adjustments = {
      method: "pattern_weighted",
      powerBonusApplied: round2(powerBonusTotal),
      deltaFromBase: round2(adjustedScore - baseResult.entry_score),
      weightsUsed: Object.assign({}, weights)
    };

    // Re-classify with the adjusted score
    var classification = baseResult.classification;
    if (window.BacktestEngine && window.BacktestEngine.classifyScore) {
      classification = window.BacktestEngine.classifyScore(adjustedScore);
    }

    return {
      entryScore: adjustedScore,
      classification: classification,
      breakdown: breakdown,
      adjustments: adjustments
    };
  }

  /* ── ML Enhancement ────────────────────────────────────────────────── */

  /**
   * Apply ML model prediction to augment the entry score.
   * Computes features at the current bar, runs ML prediction, and
   * blends with pattern-weighted score.
   *
   * Strategy:
   *   - ML win probability → convert to 0-100 score
   *   - Blend: 60% pattern-weighted + 40% ML prediction
   *   - If ML is very confident (>=0.7 or <=0.3), weight ML more (50/50)
   *   - If no ML model, return null (no enhancement)
   */
  async function applyMLEnhancement(symbol, candles, opts, baseResult, scoreResult) {
    var ML = window.MLTrainer;
    if (!ML) return null;

    // Check if model exists (fast check, no I/O)
    var hasModel = false;
    try {
      if (ML._cachedModel) { hasModel = true; }
      else {
        // Check meta exists without full load
        if (window.PatternStore) {
          var meta = await PatternStore.getMeta("ml_model_champion");
          if (!meta) meta = await PatternStore.getMeta("ml_model");
          hasModel = !!meta;
        }
      }
    } catch (e) { return null; }

    if (!hasModel) return null;

    // Compute ML features at the current bar
    var TI = window.TechIndicators;
    if (!TI || !candles || candles.length < 50) return null;

    try {
      var n = candles.length - 1;
      var close = candles[n].c;

      var rsiArr = TI.rsi(candles, 14);
      var macdObj = TI.macd(candles, 12, 26, 9);
      var bbObj = TI.bollingerBands(candles, 20, 2);
      var atrArr = TI.atr(candles, 14);
      var emaFastArr = TI.ema(candles, 12);
      var obvArr = TI.obv(candles);
      var stObj = TI.supertrend(candles, 10, 3);
      var adxObj = TI.adx(candles, 14);
      var volSma = TI.sma(TI.volumes(candles), 20);

      var features = {
        rsi: rsiArr[n] != null ? Math.round(rsiArr[n] * 100) / 100 : 50,
        macd_hist: macdObj && macdObj.histogram ? Math.round(macdObj.histogram[n] * 1000) / 1000 : 0,
        bb_position: (bbObj.upper && bbObj.lower)
          ? Math.round(((close - (bbObj.lower[n] || 0)) / Math.max(0.01, (bbObj.upper[n] || 0) - (bbObj.lower[n] || 0))) * 1000) / 1000
          : 0.5,
        atr_pct: atrArr[n] && close > 0 ? Math.round((atrArr[n] / close) * 100 * 1000) / 1000 : 0,
        obv_trend: n > 0 && obvArr[n - 1] ? Math.round((obvArr[n] || 0) / obvArr[n - 1] * 1000) / 1000 : 1,
        supertrend_dir: stObj && stObj.trend ? stObj.trend[n] : 0,
        adx: adxObj && adxObj.adx ? Math.round((adxObj.adx[n] || 0) * 100) / 100 : 0,
        ema_slope: emaFastArr[n] != null && emaFastArr[Math.max(0, n - 3)] != null
          ? Math.round(((emaFastArr[n] - emaFastArr[Math.max(0, n - 3)]) / Math.max(0.01, emaFastArr[Math.max(0, n - 3)])) * 100 * 1000) / 1000
          : 0,
        volume_ratio: volSma && volSma[n] ? Math.round(candles[n].v / Math.max(1, volSma[n]) * 100) / 100 : 1,
        entry_score: baseResult.entry_score || 0
      };

      // Detect regime for regime-specific prediction
      var regime = null;
      if (window.MLOptimizer) {
        regime = window.MLOptimizer.detectRegimeFromCandles(candles, opts.indexCandles);
      }

      // Get ML prediction
      var prediction;
      if (regime && window.MLOptimizer) {
        prediction = await window.MLOptimizer.predictWithRegime(features, regime);
      } else {
        prediction = await ML.predict(features);
      }

      if (!prediction || prediction.winProbability == null) return null;

      // Convert ML probability (0-1) to score (0-100)
      var mlScore = prediction.winProbability * 100;

      // Blend pattern-weighted score with ML score
      var patternScore = scoreResult.entryScore;
      var mlWeight = 0.4; // default 40% ML
      var patternWeight = 0.6;

      // If ML is very confident, weight it more
      if (prediction.winProbability >= 0.7 || prediction.winProbability <= 0.3) {
        mlWeight = 0.5;
        patternWeight = 0.5;
      }

      // If no pattern data, rely more on ML
      if (!scoreResult.breakdown) {
        mlWeight = 0.7;
        patternWeight = 0.3;
      }

      var adjustedScore = clamp(round2(patternScore * patternWeight + mlScore * mlWeight), 0, 100);

      // Re-classify
      var adjustedClassification = scoreResult.classification;
      if (window.BacktestEngine && window.BacktestEngine.classifyScore) {
        adjustedClassification = window.BacktestEngine.classifyScore(adjustedScore);
      }
      // Also consider ML recommendation
      if (prediction.recommendation === "STRONG_BUY" && adjustedScore >= 60) {
        adjustedClassification = "STRONG_BUY";
      } else if (prediction.recommendation === "AVOID" && adjustedScore < 40) {
        adjustedClassification = "AVOID";
      }

      return {
        winProbability: prediction.winProbability,
        recommendation: prediction.recommendation,
        mlScore: Math.round(mlScore * 10) / 10,
        patternScore: Math.round(patternScore * 10) / 10,
        mlWeight: mlWeight,
        adjustedScore: adjustedScore,
        adjustedClassification: adjustedClassification,
        regime: regime ? regime.regime : null,
        regimeConfidence: regime ? regime.confidence : null,
        modelType: prediction.modelType || "champion",
        features: features
      };
    } catch (e) {
      // ML enhancement failed — silently fall back to pattern-weighted score
      return null;
    }
  }

  /* ── Pattern-Calibrated Confidence ───────────────────────────────────── */

  /**
   * Compute confidence using stock-specific calibration if available.
   */
  async function computeConfidence(symbol, candles, opts, pattern, baseResult) {
    var TI = window.TechIndicators;
    var result = {
      confidence: null,
      probTouch: null,
      probTouchRaw: null,
      calibratedProbTouch: null,
      driftScore: null,
      driftLabel: null,
      source: "none"
    };

    if (!TI.computeHorizonConfidence) {
      return result;
    }

    try {
      // Compute base confidence using TechIndicators
      var hourlyCandles = opts.hourlyCandles;
      var dailyCandles = opts.dailyCandles;

      // Compute base probTouch
      var confResult = TI.computeTenDayForwardConfidence
        ? TI.computeTenDayForwardConfidence(candles, opts.indexCandles)
        : null;

      if (!confResult && hourlyCandles && dailyCandles) {
        try {
          var entryScoreCtx = baseResult ? {
            trendHealth: baseResult.trend_health,
            pullbackQuality: baseResult.pullback_quality,
            prob4: baseResult.prob4,
            swingPotential: baseResult.swing_potential,
            entryScore: baseResult.entry_score
          } : null;

          confResult = TI.computeHorizonConfidence(hourlyCandles, dailyCandles, {
            horizonDays: 14,
            windowSessions: 40,
            entry_price: candles[candles.length - 1].c,
            indexCandles: opts.indexCandles,
            entryScoreContext: entryScoreCtx
          });
        } catch (e) { /* confidence computation optional */ }
      }

      var rawProbTouch = null;
      var driftScore = null;

      if (confResult && confResult.components) {
        rawProbTouch = confResult.components.probTouch != null ? confResult.components.probTouch / 100 : null;
        driftScore = confResult.components.driftScore != null ? confResult.components.driftScore : null;
      } else if (confResult && confResult.confidenceLognormal != null) {
        rawProbTouch = confResult.confidenceLognormal / 100;
      } else if (confResult && confResult.confidenceEmpirical != null) {
        rawProbTouch = confResult.confidenceEmpirical / 100;
      }

      result.probTouchRaw = rawProbTouch;
      result.driftScore = driftScore;
      result.driftLabel = driftScore != null
        ? (driftScore < 0.33 ? "LOW_DRIFT" : driftScore < 0.66 ? "MID_DRIFT" : "HIGH_DRIFT")
        : null;

      // ── Apply pattern calibration ──
      if (pattern && pattern.calibration && rawProbTouch != null) {
        var calibrated = applyCalibration(rawProbTouch, driftScore, pattern);
        result.probTouch = calibrated.probTouch;
        result.confidence = calibrated.confidence;
        result.calibratedProbTouch = calibrated.probTouch;
        result.source = "pattern_calibrated";
      } else if (rawProbTouch != null) {
        result.probTouch = rawProbTouch;
        result.confidence = rawProbTouch;
        result.source = "generic";
      }

    } catch (e) {
      console.warn("Confidence computation failed:", e.message);
    }

    return result;
  }

  /**
   * Apply stock-specific calibration to raw probTouch.
   *
   * Uses calibration curve (calP0/calK) if available:
   *   calibrated = 1 / (1 + exp(-calK × (rawProbTouch - calP0)))
   *
   * Falls back to stratified drift-tercile lookup.
   */
  function applyCalibration(rawProbTouch, driftScore, pattern) {
    var cal = pattern.calibration;

    // Method 1: Global logistic calibration
    if (cal.global && cal.global.calP0 != null && cal.global.calK != null) {
      var calP0 = cal.global.calP0;
      var calK = cal.global.calK;
      var z = calK * (rawProbTouch - calP0);
      var calibrated = 1 / (1 + Math.exp(-z));

      // Method 2: Stratified adjustment overlay
      if (cal.stratified && driftScore != null) {
        var tercile = driftScore < 0.33 ? 0 : driftScore < 0.66 ? 1 : 2;
        if (cal.stratified[tercile]) {
          var stratum = cal.stratified[tercile];
          var stratumWR = stratum.hitRate / 100;
          var globalWR = cal.global.buckets
            ? cal.global.buckets.reduce(function (s, b) { return s + b.hitRate * b.n; }, 0) /
              cal.global.buckets.reduce(function (s, b) { return s + b.n; }, 0) / 100
            : 0.5;

          // Blend: 70% logistic calibrated + 30% stratified adjustment
          var stratAdj = stratumWR / (globalWR || 0.5);
          calibrated = clamp(calibrated * 0.7 + (rawProbTouch * stratAdj) * 0.3, 0.01, 0.99);
        }
      }

      return {
        probTouch: round3(calibrated),
        confidence: round3(calibrated)
      };
    }

    // Method 3: Stratified only
    if (cal.stratified && driftScore != null) {
      var tercile = driftScore < 0.33 ? 0 : driftScore < 0.66 ? 1 : 2;
      if (cal.stratified[tercile]) {
        var stratum = cal.stratified[tercile];
        // Use the stratum's empirical hit rate as adjustment factor
        var adjustment = stratum.hitRate / 100;
        var adjusted = rawProbTouch * (adjustment / 0.5);  // normalize around 50%
        return {
          probTouch: round3(clamp(adjusted, 0.01, 0.99)),
          confidence: round3(clamp(adjusted, 0.01, 0.99))
        };
      }
    }

    // No calibration data — return raw
    return {
      probTouch: round3(rawProbTouch),
      confidence: round3(rawProbTouch)
    };
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  function extractPatternInfo(pattern) {
    return {
      symbol: pattern.symbol,
      backtestDate: pattern.backtestDate,
      age: pattern.backtestDate ? Math.round((Date.now() - pattern.backtestDate) / (24 * 60 * 60 * 1000)) + " days ago" : "unknown",
      hasCalibration: !!(pattern.calibration && pattern.calibration.global),
      hasStratified: !!(pattern.calibration && pattern.calibration.stratified),
      hasRegimeBehavior: !!(pattern.regimeBehavior && Object.keys(pattern.regimeBehavior).length > 0),
      totalTrades: pattern.tradeStats ? pattern.tradeStats.totalTrades : 0,
      patternWinRate: pattern.tradeStats ? pattern.tradeStats.winRate : 0,
      topWeight: getTopWeight(pattern.indicatorWeights)
    };
  }

  function getTopWeight(weights) {
    if (!weights) return null;
    var max = 0, top = null;
    Object.keys(weights).forEach(function (k) {
      if (weights[k] > max) { max = weights[k]; top = k; }
    });
    return top ? { component: top, weight: max } : null;
  }

  /* ── Multi-Stock Scan with Patterns ─────────────────────────────────── */

  /**
   * Scan multiple stocks using pattern-aware scoring.
   * Returns ranked results sorted by adjusted entry score.
   *
   * @param {string[]} symbols
   * @param {Object} opts
   *   - getCandles: async (symbol) => candles array
   *   - indexCandles, dailyCandles
   *   - minScore: minimum entry score to include
   *   - onProgress: (current, total, symbol) => void
   * @returns {Array} sorted results
   */
  async function scanStocks(symbols, opts) {
    opts = opts || {};
    var minScore = opts.minScore != null ? opts.minScore : 50;
    var results = [];

    for (var i = 0; i < symbols.length; i++) {
      var symbol = symbols[i];
      if (opts.onProgress) opts.onProgress(i + 1, symbols.length, symbol);

      try {
        var candles = null;
        if (opts.getCandles) {
          candles = await opts.getCandles(symbol);
        } else if (window.OHLCVFetcher && window.OHLCVFetcher.fetchOHLCVCached) {
          var fetched = await window.OHLCVFetcher.fetchOHLCVCached(symbol.toUpperCase() + ".NS", "1h", "2y");
          candles = fetched && fetched.data ? fetched.data : (Array.isArray(fetched) ? fetched : null);
        }

        if (!candles || candles.length < 60) continue;

        var result = await compute(symbol, candles, {
          indexCandles: opts.indexCandles,
          dailyCandles: opts.dailyCandles,
          hourlyCandles: candles
        });

        if (result.entryScore != null && result.entryScore >= minScore) {
          results.push(Object.assign({ symbol: symbol }, result));
        }
      } catch (e) {
        console.warn("Scan failed for " + symbol + ":", e.message);
      }

      // Yield to UI every 5 stocks
      if (i % 5 === 0) {
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    }

    // Sort by adjusted score descending
    results.sort(function (a, b) { return (b.entryScore || 0) - (a.entryScore || 0); });
    return results;
  }

  /* ── Quick Pattern Lookup for UI Display ────────────────────────────── */

  /**
   * Get a human-readable pattern summary for a stock.
   * Used by the UI to show "this stock's pattern intelligence".
   */
  async function getPatternSummary(symbol) {
    var pattern = await loadPattern(symbol);
    if (!pattern) {
      return { hasPattern: false, symbol: symbol };
    }

    var topW = getTopWeight(pattern.indicatorWeights);
    var topRegime = null;
    var bestRegimeWR = 0;
    if (pattern.regimeBehavior) {
      Object.keys(pattern.regimeBehavior).forEach(function (r) {
        if (pattern.regimeBehavior[r].winRate > bestRegimeWR) {
          bestRegimeWR = pattern.regimeBehavior[r].winRate;
          topRegime = r;
        }
      });
    }

    return {
      hasPattern: true,
      symbol: symbol,
      backtestDate: pattern.backtestDate,
      ageDays: Math.round((Date.now() - (pattern.backtestDate || 0)) / (24 * 60 * 60 * 1000)),
      totalTrades: pattern.tradeStats ? pattern.tradeStats.totalTrades : 0,
      winRate: pattern.tradeStats ? pattern.tradeStats.winRate : 0,
      sharpe: pattern.tradeStats ? pattern.tradeStats.sharpeApprox : 0,
      maxDrawdown: pattern.tradeStats ? pattern.tradeStats.maxDrawdown : 0,
      topIndicator: topW,
      bestRegime: topRegime ? { name: topRegime, winRate: bestRegimeWR } : null,
      hasCalibration: !!(pattern.calibration && pattern.calibration.global),
      calP0: pattern.calibration && pattern.calibration.global ? pattern.calibration.global.calP0 : null,
      stratifiedLabels: pattern.calibration && pattern.calibration.stratified
        ? pattern.calibration.stratified.map(function (s) { return s.label + ": " + s.hitRate + "%"; })
        : [],
      scoreDistribution: pattern.scoreDistribution || null
    };
  }

  return {
    compute: compute,
    scanStocks: scanStocks,
    loadPattern: loadPattern,
    invalidateCache: invalidateCache,
    getPatternSummary: getPatternSummary,
    applyCalibration: applyCalibration
  };
})();
