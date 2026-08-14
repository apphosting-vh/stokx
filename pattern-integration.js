/* ══════════════════════════════════════════════════════════════════════════
   Pattern Intelligence Integration — StoX
   Wires PatternStore, BatchBacktest, PatternScoring, MLTrainer, and
   PatternDashboard into the main app-core.js navigation and scoring pipeline.

   This file should be loaded AFTER app-core.js and patches the app at runtime.

   Dependencies: React, window.PatternStore, window.BatchBacktest,
               window.PatternScoring, window.MLTrainer, window.PatternDashboard
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var INITIALIZED = false;

  /* ── In-memory pattern cache for synchronous screener access ─────────── */
  var _patternMemoryCache = {};   // { "RELIANCE": patternObj, ... }
  var _cacheLoaded = false;
  var _cachedMLModel = null;     // Pre-loaded ML model for synchronous prediction

  /**
   * Load all patterns from IndexedDB into memory so the screener can
   * access them synchronously (no async IDB reads per stock).
   */
  async function loadPatternCache() {
    if (!window.PatternStore) return;
    try {
      var patterns = await window.PatternStore.getAll();
      _patternMemoryCache = {};
      patterns.forEach(function (p) {
        if (p && p.symbol) _patternMemoryCache[p.symbol] = p;
      });
      _cacheLoaded = true;
      console.log("[PatternIntel] Pattern cache loaded: " + patterns.length + " stocks in memory");
    } catch (e) {
      console.warn("[PatternIntel] Failed to load pattern cache:", e.message);
    }
  }

  /**
   * Get a pattern from memory cache (synchronous).
   */
  function getPatternFromCache(symbol) {
    if (!_cacheLoaded) return null;
    // Try exact match first, then with/without .NS/.BO suffix
    var p = _patternMemoryCache[symbol];
    if (p) return p;
    if (symbol && !symbol.endsWith(".NS") && !symbol.endsWith(".BO")) {
      p = _patternMemoryCache[symbol + ".NS"] || _patternMemoryCache[symbol + ".BO"];
    } else if (symbol) {
      var base = symbol.replace(/\.NS$/, "").replace(/\.BO$/, "");
      p = _patternMemoryCache[base] || null;
    }
    return p;
  }

  /**
   * Public API to reload the cache (call after batch backtest).
   */
  window.reloadPatternCache = async function () {
    await loadPatternCache();
    // Update exposed diagnostics
    if (window.TechIndicators) {
      window.TechIndicators._patCacheLoaded = _cacheLoaded;
      window.TechIndicators._patCacheCount = Object.keys(_patternMemoryCache).length;
      window.TechIndicators._patCacheSymbols = Object.keys(_patternMemoryCache);
    }
    console.log("[PatternIntel] Cache reloaded: " + Object.keys(_patternMemoryCache).length + " patterns");
  };

  /**
   * Pre-load ML champion model into memory for synchronous screener prediction.
   */
  async function preloadMLModel() {
    _cachedMLModel = null;
    if (!window.MLTrainer || !window.PatternStore) return;
    try {
      var champ = await window.PatternStore.getMeta("ml_model_champion");
      if (champ && champ.network && champ.normalizer) {
        _cachedMLModel = champ;
        console.log("[PatternIntel] ML champion model pre-loaded for synchronous screener prediction");
      }
    } catch (e) {
      console.warn("[PatternIntel] Failed to pre-load ML model:", e.message);
    }
  }

  /**
   * Compute ML features from a compatResult for synchronous prediction.
   * Uses the same feature set as pattern-scoring.js applyMLEnhancement.
   */
  function computeMLFeaturesFromCompat(compatResult) {
    if (!compatResult) return null;
    // Map compatResult fields to ML feature keys
    var features = {
      rsi: compatResult.aggRSI != null ? compatResult.aggRSI : 50,
      macd_hist: 0,     // Not available in compatResult — default neutral
      bb_position: 0.5,  // Not available — default middle
      atr_pct: compatResult.aggATRPct != null ? compatResult.aggATRPct : 0,
      obv_trend: 1,     // Not available — default neutral
      supertrend_dir: 0, // Not available — default neutral
      adx: compatResult.aggADX != null ? compatResult.aggADX : 20,
      ema_slope: 0,      // Not available — default neutral
      volume_ratio: 1,    // Not available — default neutral
      entry_score: compatResult.finalScore || 0
    };
    return features;
  }

  /* ── Synchronous pattern weight application ─────────────────────────── */

  function round2(v) { return v != null ? Math.round(v * 100) / 100 : null; }
  function round3(v) { return v != null ? Math.round(v * 1000) / 1000 : null; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /**
   * Effective weights for a pattern: manual overrides (Pattern Lab →
   * Pattern Settings) take precedence; otherwise resolved (repaired from
   * powers if the stored weights are uniform) and blended toward equal 25%
   * per the global Learned-weight blend setting. Falls back to stored
   * weights if PatternScoring is unavailable.
   */
  function resolveWeightsForDisplay(pattern) {
    var w = pattern && pattern.indicatorWeights ? pattern.indicatorWeights : null;
    try {
      if (window.PatternStore && window.PatternStore.getWeightOverridesSync) {
        var ov = window.PatternStore.getWeightOverridesSync();
        if (ov && pattern.symbol) {
          var sym = pattern.symbol;
          var ovW = ov[sym] || ov[sym + ".NS"] || ov[sym + ".BO"];
          if (ovW) return ovW;
        }
      }
    } catch (e) {}
    try {
      if (window.PatternScoring && window.PatternScoring.resolveLearnedWeights) {
        var rlw = window.PatternScoring.resolveLearnedWeights(pattern);
        if (rlw) w = rlw;
      }
    } catch (e) {}
    return w;
  }

  /**
   * Apply pattern weights to the compat result format.
   */
  function applyPatternToCompatResult(compatResult, pattern) {
    if (!compatResult || !pattern || !pattern.indicatorWeights) return compatResult;

    var weights = resolveWeightsForDisplay(pattern);
    var powers = pattern.indicatorPowers;

    var pillars = {
      trendHealth: compatResult.aggTrendHealth != null ? compatResult.aggTrendHealth : 0,
      pullbackQuality: compatResult.aggPullbackQuality != null ? compatResult.aggPullbackQuality : 0,
      prob4: compatResult.aggProb4 != null ? compatResult.aggProb4 : 0,
      swingPotential: compatResult.aggSwingPotential != null ? compatResult.aggSwingPotential : 0
    };

    var pillarMax = { trendHealth: 35, pullbackQuality: 30, prob4: 35, swingPotential: 20 };
    if (window.TechIndicators && window.TechIndicators.getScoreConfig) {
      var sc = window.TechIndicators.getScoreConfig();
      if (sc && sc.pillarMax) pillarMax = sc.pillarMax;
    }

    var totalWeighted = 0;
    var totalWeight = 0;
    var powerBonusTotal = 0;

    ["trendHealth", "pullbackQuality", "prob4", "swingPotential"].forEach(function (p) {
      var w = weights[p] != null ? weights[p] : 0.25;
      var max = pillarMax[p] || 25;
      var normalizedPillar = clamp(pillars[p] / max, 0, 1);
      var weighted = normalizedPillar * w;
      totalWeighted += weighted;
      totalWeight += w;

      if (powers && powers[p] && powers[p].infoValue > 0.01) {
        var iv = powers[p].infoValue;
        if (iv > 0.05 && normalizedPillar > 0.5) {
          powerBonusTotal += iv * normalizedPillar * 2;
        }
      }
    });

    var baseWeightedScore = totalWeight > 0 ? (totalWeighted / totalWeight) * 100 : compatResult.finalScore;
    var adjustedScore = clamp(round2(baseWeightedScore + powerBonusTotal), 0, 100);

    // ── ML Enhancement (synchronous, using pre-loaded model) ──
    var mlPrediction = null;
    if (_cachedMLModel && window.MLTrainer && window.MLTrainer.predictSync) {
      try {
        var mlFeatures = computeMLFeaturesFromCompat(compatResult);
        // Gate: model was trained on entry scores >= entryScoreMin (scores of
        // actual opened trades). Below that, fall back to pattern-weighted only.
        if (_cachedMLModel.entryScoreMin != null && (mlFeatures.entry_score == null || mlFeatures.entry_score < _cachedMLModel.entryScoreMin)) {
          mlPrediction = null;
        } else {
          mlPrediction = window.MLTrainer.predictSync(mlFeatures, _cachedMLModel);
        }
        if (mlPrediction && mlPrediction.winProbability != null) {
          var mlScore = mlPrediction.winProbability * 100;
          // Blend: 75% pattern-weighted + 25% ML (kept modest while model is weak)
          var mlWeight = 0.25;
          if (mlPrediction.winProbability >= 0.7 || mlPrediction.winProbability <= 0.3) {
            mlWeight = 0.35;
          }
          adjustedScore = clamp(round2(adjustedScore * (1 - mlWeight) + mlScore * mlWeight), 0, 100);
        }
      } catch (mlErr) {
        // ML prediction failed silently — use pattern-weighted score
      }
    }

    var delta = round2(adjustedScore - compatResult.finalScore);

    var classification = compatResult.decision;
    if (window.BacktestEngine && window.BacktestEngine.classifyScore) {
      classification = window.BacktestEngine.classifyScore(adjustedScore);
    }

    var SCREENER_DECISION_MAP = {
      STRONG_BUY: { label: "STRONG BUY", color: "#16a34a" },
      BUY:        { label: "BUY",        color: "#22c55e" },
      WATCHLIST:  { label: "WATCHLIST",  color: "#f59e0b" },
      NEUTRAL:    { label: "NEUTRAL",    color: "#6b7280" },
      AVOID:      { label: "AVOID",      color: "#ef4444" },
      STRONG_AVOID: { label: "STRONG AVOID", color: "#dc2626" }
    };

    compatResult._patternApplied = true;
    compatResult._patternOriginalScore = compatResult.finalScore;
    compatResult._patternDelta = delta;
    compatResult.finalScore = adjustedScore;
    var decisionObj = SCREENER_DECISION_MAP[classification];
    if (decisionObj) {
      compatResult.decision = { label: decisionObj.label, color: decisionObj.color };
    } else if (typeof compatResult.decision !== "object" || compatResult.decision === null) {
      compatResult.decision = { label: classification || "NEUTRAL", color: "var(--text6)" };
    }
    compatResult.decisionColor = decisionObj ? decisionObj.color : null;
    compatResult._patternClassification = classification;
    compatResult._patternWinRate = pattern.tradeStats ? pattern.tradeStats.winRate : null;
    compatResult._patternTrades = pattern.tradeStats ? pattern.tradeStats.totalTrades : null;
    compatResult._patternTopWeight = getTopWeight(resolveWeightsForDisplay(pattern));
    compatResult._patternHasCalibration = !!(pattern.calibration && pattern.calibration.global);
    // ML prediction metadata
    if (mlPrediction) {
      compatResult._mlEnhanced = true;
      compatResult._mlWinProb = mlPrediction.winProbability;
      compatResult._mlRecommendation = mlPrediction.recommendation;
    }

    return compatResult;
  }

  function getTopWeight(weights) {
    if (!weights) return null;
    var max = 0, top = null;
    Object.keys(weights).forEach(function (k) {
      if (weights[k] > max) { max = weights[k]; top = k; }
    });
    return top ? { component: top, weight: max } : null;
  }

  /**
   * Apply pattern calibration to raw probTouch value.
   */
  function applyPatternCalibration(rawProbTouch, driftScore, pattern) {
    if (!pattern || !pattern.calibration || rawProbTouch == null) return rawProbTouch;

    var cal = pattern.calibration;

    if (cal.global && cal.global.calP0 != null && cal.global.calK != null) {
      var calP0 = cal.global.calP0;
      var calK = cal.global.calK;
      var z = calK * (rawProbTouch - calP0);
      var calibrated = 1 / (1 + Math.exp(-z));

      if (cal.stratified && driftScore != null) {
        var tercile = driftScore < 0.33 ? 0 : driftScore < 0.66 ? 1 : 2;
        if (cal.stratified[tercile]) {
          var stratum = cal.stratified[tercile];
          var stratumWR = stratum.hitRate / 100;
          var globalWR = 0.5;
          if (cal.global.buckets && cal.global.buckets.length > 0) {
            var totalHits = cal.global.buckets.reduce(function (s, b) { return s + (b.hitRate || 0) * (b.n || 0); }, 0);
            var totalN = cal.global.buckets.reduce(function (s, b) { return s + (b.n || 0); }, 0);
            globalWR = totalN > 0 ? totalHits / totalN / 100 : 0.5;
          }
          var stratAdj = stratumWR / (globalWR || 0.5);
          calibrated = clamp(calibrated * 0.7 + (rawProbTouch * stratAdj) * 0.3, 0.01, 0.99);
        }
      }

      return round3(calibrated);
    }

    if (cal.stratified && driftScore != null) {
      var tercile2 = driftScore < 0.33 ? 0 : driftScore < 0.66 ? 1 : 2;
      if (cal.stratified[tercile2]) {
        var stratum2 = cal.stratified[tercile2];
        var adjustment2 = stratum2.hitRate / 100;
        return round3(clamp(rawProbTouch * (adjustment2 / 0.5), 0.01, 0.99));
      }
    }

    return rawProbTouch;
  }

  /**
   * Initialize the Pattern Intelligence system.
   * Call this once after all modules are loaded.
   */
  window.initPatternIntelligence = async function () {
    if (INITIALIZED) return;
    INITIALIZED = true;

    try {
      // 1. Init PatternStore
      if (window.PatternStore) {
        await window.PatternStore.init();
        console.log("[PatternIntel] PatternStore initialized");
      }

      // 2. Pre-load all patterns into memory (for synchronous screener access)
      await loadPatternCache();

      // 2b. Pre-load ML model for synchronous prediction in screener
      await preloadMLModel();

      // 3. Patch navigation to include Pattern Lab tab
      patchNavigation();

      // 4. Enhance scoring to use patterns when available
      patchScoring();

      // 5. Expose direct-call helpers for screener paths
      exposePatternHelpers();

      var cacheCount = Object.keys(_patternMemoryCache).length;
      console.log("[PatternIntel] System ready — screener will use calibrated pattern data (" + cacheCount + " patterns cached)");
      if (cacheCount === 0) {
        console.warn("[PatternIntel] NO PATTERNS in cache. Run batch backtest or import patterns from JSON.");
      }
    } catch (e) {
      console.error("[PatternIntel] Init failed:", e);
    }
  };

  /**
   * Expose direct-call helpers for screener scoring paths.
   * These are defined OUTSIDE patchScoring() so always available.
   */
  function exposePatternHelpers() {
    /**
     * Apply pattern intelligence to a compat result.
     * Called from app-core.js screener paths.
     */
    window.applyPatternIntel = function (compatResult, symbol) {
      if (!compatResult || !symbol || compatResult._patternApplied) return compatResult;
      var pattern = getPatternFromCache(symbol);
      if (!pattern) {
        // Even without a stored pattern, a manual override (Pattern Lab →
        // Pattern Settings) must still re-weight the score.
        try {
          if (window.PatternStore && window.PatternStore.getWeightOverridesSync) {
            var ov = window.PatternStore.getWeightOverridesSync();
            if (ov) {
              var ovW = ov[symbol] || ov[symbol + ".NS"] || ov[symbol + ".BO"];
              if (ovW) pattern = { symbol: symbol, indicatorWeights: ovW, indicatorPowers: {} };
            }
          }
        } catch (e) {}
      }
      if (pattern) {
        return applyPatternToCompatResult(compatResult, pattern);
      }
      return compatResult;
    };

    /**
     * Apply pattern calibration to a 10-day confidence result.
     */
    window.applyPatternConfCal = function (confResult, symbol) {
      if (!confResult || !symbol || confResult._patternCalibrated) return confResult;
      var pattern = getPatternFromCache(symbol);
      if (!pattern) return confResult;

      var rawProb = confResult.confidenceLognormal != null ? confResult.confidenceLognormal / 100 : null;
      var driftScore = confResult.components && confResult.components.driftScore != null ? confResult.components.driftScore : null;
      if (rawProb != null) {
        var calibrated = applyPatternCalibration(rawProb, driftScore, pattern);
        if (calibrated != null && calibrated !== rawProb) {
          confResult._patternCalibrated = true;
          confResult._patternOriginalConf = confResult.confidence;
          confResult.confidence = Math.round(calibrated * 100);
          if (confResult.components && confResult.components.probTouch != null) {
            confResult._patternOriginalProbTouch = confResult.components.probTouch;
            confResult.components.probTouch = Math.round(calibrated * 100);
          }
          confResult.confidenceLognormal = Math.round(calibrated * 100);
        }
      }
      return confResult;
    };

    console.log("[PatternIntel] Direct-call helpers exposed (window.applyPatternIntel, window.applyPatternConfCal)");
  }

  /**
   * Add "Pattern Lab" to the app's navigation.
   */
  function patchNavigation() {
    // Wait for the React app to render, then inject the new tab
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.querySelector && node.querySelector('[data-stox-nav]')) {
            injectPatternLabTab(node);
            observer.disconnect();
          }
        });
      });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Safety timeout: disconnect observer if nav never appears (prevents memory leak)
    setTimeout(function () {
      observer.disconnect();
      var nav = document.querySelector('[data-stox-nav]') || document.querySelector('nav');
      if (nav) {
        injectPatternLabTab(nav.closest('[class*="root"]') || document.body);
      }
    }, 2000);
  }

  function injectPatternLabTab(container) {
    // We add the tab via React state if we can find the state setter
    // This is a non-invasive approach: we just expose the dashboard component
    // and let the user navigate to it via the settings page or a URL hash
    console.log("[PatternIntel] PatternDashboard available at window.openPatternLab()");
  }

  /**
   * Make Pattern Lab accessible from anywhere in the app.
   */
  window.openPatternLab = function () {
    // Dispatch event to switch to Pulse page with patternlab tab
    window.dispatchEvent(new CustomEvent("stox:navigate", { detail: { page: "watchlist", tab: "patternlab" } }));
  };

  /**
   * Enhance the existing scoring functions to use pattern intelligence.
   * When a pattern exists for a stock, the entry score and confidence
   * are adjusted using stock-specific weights and calibration.
   *
   * NOTE: computeEntryScorePatched is DEPRECATED — the live screener uses
   * window.applyPatternIntel / window.applyPatternConfCal instead (exposed
   * via exposePatternHelpers). Kept here for backward compatibility only.
   */
  function patchScoring() {
    if (!window.PatternScoring || !window.TechIndicators) return;

    // Save original computeEntryScore
    var originalComputeEntryScore = window.TechIndicators.computeEntryScore;

    // Wrap to add pattern-aware scoring
    window.TechIndicators.computeEntryScorePatched = async function (symbol, candles, opts) {
      opts = opts || {};

      // First compute the base score
      var baseResult = originalComputeEntryScore(candles, opts.indexCandles);

      if (!baseResult || baseResult.entry_score == null) return baseResult;

      // Try pattern-enhanced scoring
      try {
        var enhanced = await window.PatternScoring.compute(symbol, candles, opts);
        if (enhanced && enhanced.entryScore != null) {
          // Merge pattern data into the result
          baseResult.pattern_adjusted_score = enhanced.entryScore;
          baseResult.pattern_score_delta = enhanced.scoreDelta;
          baseResult.pattern_confidence = enhanced.confidence;
          baseResult.pattern_probTouch = enhanced.probTouch;
          baseResult.pattern_used = enhanced.patternUsed;
          baseResult.classification = enhanced.classification;
        }
      } catch (e) {
        // Pattern scoring failed — use base result
        console.warn("[PatternIntel] Scoring fallback:", e.message);
      }

      return baseResult;
    };

    // Quick check for pattern availability (async — for non-screener use)
    window.TechIndicators.hasPattern = async function (symbol) {
      if (!window.PatternStore) return false;
      var pattern = await window.PatternStore.get(symbol);
      return pattern != null;
    };

    // Synchronous check using in-memory cache (for screener badge counting)
    window.TechIndicators.hasPatternSync = function (symbol) {
      return getPatternFromCache(symbol) != null;
    };

    console.log("[PatternIntel] Scoring patched with pattern intelligence");
  }

  /**
   * Utility: Run batch backtest for all stocks and return results.
   * Can be called from the browser console:
   *   await runFullBatchBacktest()
   */
  window.runFullBatchBacktest = async function (symbols) {
    if (!window.BatchBacktest) {
      throw new Error("BatchBacktest module not loaded");
    }

    var stocks = symbols || (window.NIFTY_200 && window.NIFTY_200.map ? window.NIFTY_200.map(function(s) { return s.t; }) : null) || getDefaultStocks();
    var runner = window.BatchBacktest.create({
      targetProfitPct: 4,
      holdingPeriodDays: 14,
      threshold: 65,
      sampleEvery: 2
    });

    console.log("[PatternIntel] Starting batch backtest for " + stocks.length + " stocks...");

    var result = await runner.runBatch(stocks, {
      onProgress: function (current, total, symbol, phase) {
        if (current % 10 === 0 || phase === "done") {
          console.log("[BatchBT] " + current + "/" + total + " " + symbol + " — " + phase);
        }
      }
    });

    console.log("[PatternIntel] Batch complete:", result.summary);
    // Reload screener's in-memory pattern cache with new patterns
    if (window.reloadPatternCache) await window.reloadPatternCache();
    return result;
  };

  /**
   * Utility: Refresh stale patterns (older than 7 days).
   */
  window.refreshStalePatterns = async function (symbols) {
    if (!window.BatchBacktest || !window.PatternStore) {
      throw new Error("BatchBacktest and PatternStore required");
    }

    var runner = window.BatchBacktest.create({
      targetProfitPct: 4,
      holdingPeriodDays: 14,
      threshold: 65,
      sampleEvery: 2
    });

    var result = await runner.refreshStale(symbols, 7 * 24 * 60 * 60 * 1000);
    console.log("[PatternIntel] Refresh complete:", result);
    // Reload screener's in-memory pattern cache with refreshed patterns
    if (window.reloadPatternCache) await window.reloadPatternCache();
    return result;
  };

  /**
   * Utility: Train ML model on stored features (legacy — single split).
   */
  window.trainMLModel = async function (config) {
    if (!window.MLTrainer) {
      throw new Error("MLTrainer module not loaded");
    }

    var trainer = window.MLTrainer.create(config || {
      hiddenUnits: [32, 16],
      learningRate: 0.01,
      epochs: 50,
      batchSize: 32
    });

    console.log("[PatternIntel] Starting ML training...");

    var result = await trainer.train({
      onEpoch: function (epoch, loss, trainAcc, valAcc) {
        if (epoch % 10 === 0) {
          console.log("[ML] Epoch " + epoch + ": loss=" + loss.toFixed(4) + " train=" + trainAcc + "% val=" + valAcc + "%");
        }
      }
    });

    console.log("[PatternIntel] ML training complete:", result);
    return result;
  };

  /**
   * Utility: Train ML model with walk-forward validation (recommended).
   * Trains, validates across time-based folds, and auto-promotes if better.
   */
  window.trainMLModelWalkForward = async function (config) {
    if (!window.MLTrainer) {
      throw new Error("MLTrainer module not loaded");
    }

    console.log("[PatternIntel] Starting walk-forward ML training...");

    var result = await window.MLTrainer.trainWithWalkForward(Object.assign({}, config || {}, {
      numFolds: (config && config.numFolds) || 5,
      epochsPerFold: (config && config.epochsPerFold) || 30,
      hiddenUnits: (config && config.hiddenUnits) || [32, 16],
      learningRate: (config && config.learningRate) || 0.005,
      onFold: function (fold, total, foldResult) {
        if (foldResult.skipped) {
          console.log("[ML-WF] Fold " + fold + "/" + total + " skipped: " + foldResult.reason);
        } else {
          console.log("[ML-WF] Fold " + fold + "/" + total + ": valAcc=" + foldResult.finalValAcc + "%, F1=" + foldResult.f1);
        }
      }
    }));

    console.log("[PatternIntel] Walk-forward training complete:", result.walkForwardAcc + "% avg accuracy");
    if (result.promotion) {
      console.log("[PatternIntel] Promotion: " + result.promotion.reason);
    }
    return result;
  };

  /**
   * Utility: Continuous retrain with drift detection.
   * Call after batch backtest runs to keep model fresh.
   */
  window.continuousMLRetrain = async function (config) {
    if (!window.MLTrainer) {
      throw new Error("MLTrainer module not loaded");
    }

    console.log("[PatternIntel] Starting continuous ML retrain...");
    var result = await window.MLTrainer.continuousRetrain(Object.assign({}, config || {}, {
      onProgress: function (current, total, msg) {
        console.log("[ML-RETRAIN] " + (total > 0 ? Math.round(current / total * 100) : 0) + "% — " + msg);
      }
    }));

    console.log("[PatternIntel] Continuous retrain result:", result.retrained ? "retrained" : "skipped");
    if (result.drift) {
      console.log("[PatternIntel] Drift status:", result.drift.reason);
    }
    return result;
  };

  /**
   * Utility: Optimize backtest config params using Bayesian optimization.
   */
  window.optimizeBacktestConfig = async function (config) {
    if (!window.MLOptimizer) {
      throw new Error("MLOptimizer module not loaded");
    }

    console.log("[PatternIntel] Starting Bayesian config optimization...");
    var result = await window.MLOptimizer.optimizeConfig(config);
    console.log("[PatternIntel] Optimization complete. Best config:", JSON.stringify(result.bestConfig));
    return result;
  };

  /**
   * Utility: Detect current market regime.
   */
  window.detectMarketRegime = async function (candles, indexCandles) {
    if (!window.MLOptimizer) return null;
    return window.MLOptimizer.detectRegimeFromCandles(candles, indexCandles);
  };

  /**
   * Utility: Get ML model status (versions, champion, drift, retrain history).
   */
  window.getMLStatus = async function () {
    if (window.MLTrainer) {
      return await window.MLTrainer.getModelStatus();
    }
    return null;
  };

  /**
   * Utility: Get pattern summary for a stock.
   */
  window.getPatternInfo = async function (symbol) {
    if (!window.PatternScoring) return null;
    return await window.PatternScoring.getPatternSummary(symbol);
  };

  /**
   * Default stock list if none provided.
   */
  function getDefaultStocks() {
    return [
      "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","HINDUNILVR","SBIN","BHARTIARTL",
      "ITC","KOTAKBANK","LT","AXISBANK","ASIANPAINT","BAJFINANCE","MARUTI","HCLTECH",
      "SUNPHARMA","TITAN","WIPRO","ULTRACEMCO","NESTLEIND","NTPC","POWERGRID","ONGC",
      "TATAMOTORS","JSWSTEEL","ADANIENT","HINDALCO","COALINDIA","BAJAJFINSV",
      "INDUSINDBK","DRREDDY","CIPLA","TECHM","GRASIM","HDFCLIFE","DIVISLAB",
      "EICHERMOT","BPCL","BRITANNIA","IOC","SHRIRAMFIN","HEROMOTOCO","M_M",
      "PIDILITIND","ABB","ACC","AMBUJACEM","DIXON","LAURUSLABS","TORNTPHARM",
      "VBL","DALBHARAT","LTI","YESBANK","IDFCFIRSTB","TATAPOWER","INDIGO",
      "VEDL","NMDC","UPL","MUTHOOTFIN","SRF","BERGEPAINT","GODREJCP",
      "PEL","COLPAL","HAVELLS","DABUR","MARICO","PAGEIND","TRENT","UBL",
      "CHOLAHLDG","BANDHANBNK","PFC","REC","MANAPPURAM"
    ];
  }

  // Auto-init when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(function () { window.initPatternIntelligence(); }, 500);
    });
  } else {
    setTimeout(function () { window.initPatternIntelligence(); }, 500);
  }

})();
