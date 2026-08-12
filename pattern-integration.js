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

  /* ── Synchronous pattern weight application ─────────────────────────── */

  function round2(v) { return v != null ? Math.round(v * 100) / 100 : null; }
  function round3(v) { return v != null ? Math.round(v * 1000) / 1000 : null; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /**
   * Apply pattern weights to the compat result format.
   *
   * compatResult has: finalScore, baseScore, aggTrendHealth, aggPullbackQuality,
   *   aggProb4, aggSwingPotential, decision, ...
   *
   * pattern has: indicatorWeights { trendHealth: 0.32, ... },
   *   indicatorPowers { trendHealth: { infoValue: 0.04, ... }, ... }
   */
  function applyPatternToCompatResult(compatResult, pattern) {
    if (!compatResult || !pattern || !pattern.indicatorWeights) return compatResult;

    var weights = pattern.indicatorWeights;
    var powers = pattern.indicatorPowers;

    // Map compat pillar names to weight keys
    var pillars = {
      trendHealth: compatResult.aggTrendHealth != null ? compatResult.aggTrendHealth : 0,
      pullbackQuality: compatResult.aggPullbackQuality != null ? compatResult.aggPullbackQuality : 0,
      prob4: compatResult.aggProb4 != null ? compatResult.aggProb4 : 0,
      swingPotential: compatResult.aggSwingPotential != null ? compatResult.aggSwingPotential : 0
    };

    // Get pillar max values from score config
    var pillarMax = { trendHealth: 35, pullbackQuality: 30, prob4: 35, swingPotential: 20 };
    if (window.TechIndicators && window.TechIndicators.getScoreConfig) {
      var sc = window.TechIndicators.getScoreConfig();
      if (sc && sc.pillarMax) pillarMax = sc.pillarMax;
    }

    // Compute weighted score
    var totalWeighted = 0;
    var totalWeight = 0;
    var powerBonusTotal = 0;

    ["trendHealth", "pullbackQuality", "prob4", "swingPotential"].forEach(function (p) {
      var w = weights[p] || 0.25;
      var max = pillarMax[p] || 25;
      var normalizedPillar = clamp(pillars[p] / max, 0, 1);
      var weighted = normalizedPillar * w;
      totalWeighted += weighted;
      totalWeight += w;

      // Power bonus: boost when indicator is in historically predictive range
      if (powers && powers[p] && powers[p].infoValue > 0.01) {
        var iv = powers[p].infoValue;
        if (iv > 0.05 && normalizedPillar > 0.5) {
          powerBonusTotal += iv * normalizedPillar * 2;
        }
      }
    });

    var baseWeightedScore = totalWeight > 0 ? (totalWeighted / totalWeight) * 100 : compatResult.finalScore;
    var adjustedScore = clamp(round2(baseWeightedScore + powerBonusTotal), 0, 100);
    var delta = round2(adjustedScore - compatResult.finalScore);

    // Re-classify
    var classification = compatResult.decision;
    if (window.BacktestEngine && window.BacktestEngine.classifyScore) {
      classification = window.BacktestEngine.classifyScore(adjustedScore);
    }

    // Build decision object matching SCREENER_DECISION_MAP format
    var SCREENER_DECISION_MAP = (typeof SCREENER_DECISION_MAP !== "undefined") ? SCREENER_DECISION_MAP : {};
    // Fallback decision map
    if (!SCREENER_DECISION_MAP.STRONG_BUY) {
      SCREENER_DECISION_MAP = {
        STRONG_BUY: { label: "STRONG BUY", color: "#16a34a" },
        BUY:        { label: "BUY",        color: "#22c55e" },
        WATCHLIST:  { label: "WATCHLIST",  color: "#f59e0b" },
        NEUTRAL:    { label: "NEUTRAL",    color: "#6b7280" },
        AVOID:      { label: "AVOID",      color: "#ef4444" },
        STRONG_AVOID: { label: "STRONG AVOID", color: "#dc2626" }
      };
    }

    // Apply adjusted values to compat result
    compatResult._patternApplied = true;
    compatResult._patternOriginalScore = compatResult.finalScore;
    compatResult._patternDelta = delta;
    compatResult.finalScore = adjustedScore;
    compatResult.decision = SCREENER_DECISION_MAP[classification] || compatResult.decision;
    compatResult._patternClassification = classification;
    compatResult._patternWinRate = pattern.tradeStats ? pattern.tradeStats.winRate : null;
    compatResult._patternTrades = pattern.tradeStats ? pattern.tradeStats.totalTrades : null;
    compatResult._patternTopWeight = getTopWeight(pattern.indicatorWeights);
    compatResult._patternHasCalibration = !!(pattern.calibration && pattern.calibration.global);

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

    // Method 1: Global logistic calibration
    if (cal.global && cal.global.calP0 != null && cal.global.calK != null) {
      var calP0 = cal.global.calP0;
      var calK = cal.global.calK;
      var z = calK * (rawProbTouch - calP0);
      var calibrated = 1 / (1 + Math.exp(-z));

      // Method 2: Stratified overlay
      if (cal.stratified && driftScore != null) {
        var tercile = driftScore < 0.33 ? 0 : driftScore < 0.66 ? 1 : 2;
        if (cal.stratified[tercile]) {
          var stratum = cal.stratified[tercile];
          var stratumWR = stratum.hitRate / 100;
          var globalWR = cal.global.buckets
            ? cal.global.buckets.reduce(function (s, b) { return s + b.hitRate * b.n; }, 0) /
              cal.global.buckets.reduce(function (s, b) { return s + b.n; }, 0) / 100
            : 0.5;
          var stratAdj = stratumWR / (globalWR || 0.5);
          calibrated = clamp(calibrated * 0.7 + (rawProbTouch * stratAdj) * 0.3, 0.01, 0.99);
        }
      }

      return round3(calibrated);
    }

    // Method 3: Stratified only
    if (cal.stratified && driftScore != null) {
      var tercile = driftScore < 0.33 ? 0 : driftScore < 0.66 ? 1 : 2;
      if (cal.stratified[tercile]) {
        var stratum = cal.stratified[tercile];
        var adjustment = stratum.hitRate / 100;
        return round3(clamp(rawProbTouch * (adjustment / 0.5), 0.01, 0.99));
      }
    }

    return rawProbTouch;
  }

  /* ── Init ────────────────────────────────────────────────────────────── */

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

      // 3. Patch navigation to include Pattern Lab tab
      patchNavigation();

      // 4. Patch scoring pipeline to use pattern intelligence
      patchScoring();

      var cacheCount = Object.keys(_patternMemoryCache).length;
      var cacheSymbols = Object.keys(_patternMemoryCache).slice(0, 10);
      console.log("[PatternIntel] System ready — screener will use calibrated pattern data");
      console.log("[PatternIntel] DIAGNOSTIC: cacheLoaded=" + _cacheLoaded + ", patternsInCache=" + cacheCount + ", sampleKeys=" + JSON.stringify(cacheSymbols) + ", applyPatternIntel=" + !!window.applyPatternIntel + ", applyPatternConfCal=" + !!window.applyPatternConfCal);
      if (cacheCount === 0) {
        console.warn("[PatternIntel] ⚠ NO PATTERNS in cache. Run batch backtest or import patterns from JSON.");
      }
    } catch (e) {
      console.error("[PatternIntel] Init failed:", e);
    }
  };

  /**
   * Add "Pattern Lab" to the app's navigation.
   */
  function patchNavigation() {
    // Pattern Lab is now a sub-tab inside Pulse page (not a top-level nav item).
    // No navigation patching needed.
    console.log("[PatternIntel] Pattern Lab is nested under Pulse > Pattern Lab tab");
  }

  /**
   * Navigate to Pattern Lab tab within Pulse page.
   * Can be called from browser console or other modules.
   */
  window.openPatternLab = function () {
    // Dispatch event to switch to Pulse page with patternlab tab
    window.dispatchEvent(new CustomEvent("stox:navigate", { detail: { page: "watchlist", tab: "patternlab" } }));
  };

  /**
   * THE KEY PATCH: Wire pattern intelligence into the screener's scoring.
   *
   * Patches the global computeCompatEntryScore function (used by refreshStock,
   * addManualStock, and the full screener scan) to apply:
   *   1. Pattern-weighted entry score (re-weights pillars per stock)
   *   2. Pattern-calibrated confidence (adjusts probTouch per stock)
   *
   * The pattern data is read from an in-memory cache (loaded from IndexedDB
   * at init), so this patch is fully synchronous — no async overhead per stock.
   */
    /**
     * Direct-call helper: apply pattern intelligence to a compat result.
     * Called explicitly from app-core.js screener paths — does NOT rely on
     * monkey-patching computeCompatEntryScore (which can fail in Babel scope).
     *
     * IMPORTANT: This is defined OUTSIDE patchScoring() so it's always available
     * even if patchScoring() fails or returns early.
     *
     * Usage:
     *   var result = computeCompatEntryScore(w, d, h, idxD, idxW);
     *   if (window.applyPatternIntel) result = window.applyPatternIntel(result, "RELIANCE");
     */
    window.applyPatternIntel = function (compatResult, symbol) {
      if (!compatResult || !symbol || compatResult._patternApplied) return compatResult;
      var pattern = getPatternFromCache(symbol);
      if (!window.__patIntelDiagDone) {
        window.__patIntelDiagDone = true;
        console.log("[PatIntel] applyPatternIntel called: symbol=" + symbol + ", cacheLoaded=" + _cacheLoaded + ", patternFound=" + !!pattern + ", cacheKeys(count)=" + Object.keys(_patternMemoryCache).length);
        if (!pattern && _patternMemoryCache && Object.keys(_patternMemoryCache).length > 0) {
          console.log("[PatIntel] Available cache keys (sample):", Object.keys(_patternMemoryCache).slice(0, 5));
          console.log("[PatIntel] Tried lookup: '" + symbol + "' → '" + symbol + ".NS' (fallback)");
        }
      }
      if (pattern) {
        return applyPatternToCompatResult(compatResult, pattern);
      }
      return compatResult;
    };

    /**
     * Direct-call helper: apply pattern calibration to a 10-day confidence result.
     * IMPORTANT: Defined OUTSIDE patchScoring() so always available.
     *
     * Usage:
     *   var conf = TI.computeTenDayForwardConfidence(h, d, idx, ctx);
     *   if (window.applyPatternConfCal) conf = window.applyPatternConfCal(conf, "RELIANCE");
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

  function patchScoring() {
    if (!window.TechIndicators) return;

    // ── Step 0: Tag candle arrays with _symbol via fetchOHLCVCached patch ──
    // This ensures computeCompatEntryScore and computeTenDayForwardConfidence
    // can identify which stock they're scoring, without patching individual callers.
    if (window.OHLCVFetcher && window.OHLCVFetcher.fetchOHLCVCached) {
      var _origFetch = window.OHLCVFetcher.fetchOHLCVCached;
      window.OHLCVFetcher.fetchOHLCVCached = async function (ticker, timeframe, range) {
        var result = await _origFetch.call(this, ticker, timeframe, range);
        // Tag the data array with the clean symbol (no .NS suffix)
        if (result && result.data && Array.isArray(result.data)) {
          var sym = (ticker || "").replace(/\.NS$/, "").replace(/\.BO$/, "").replace(/^\^/, "");
          // Only tag stock symbols (not index like ^NSEI)
          if (sym && sym.length > 0 && !ticker.startsWith("^")) {
            result.data._symbol = sym;
          }
        }
        return result;
      };
      console.log("[PatternIntel] fetchOHLCVCached patched — candle arrays tagged with _symbol");
    }

    // ── Patch computeCompatEntryScore ──
    if (typeof computeCompatEntryScore === "function") {
      var _origComputeCompat = computeCompatEntryScore;

      // Replace the global function with pattern-enhanced version
      window.computeCompatEntryScore = function computeCompatEntryScorePatched(weeklyCandles, dailyCandles, hourlyCandles, indexCandles, indexWeeklyCandles, symbolHint) {
        // Call original to get base multi-TF score
        var result = _origComputeCompat(weeklyCandles, dailyCandles, hourlyCandles, indexCandles, indexWeeklyCandles);
        if (!result || result.finalScore == null) return result;

        // Extract symbol from tagged candle arrays
        var symbol = symbolHint || null;
        var pattern = null;

        if (!symbol) {
          var dc = dailyCandles || hourlyCandles || weeklyCandles;
          if (dc && dc._symbol) symbol = dc._symbol;
        }

        if (symbol) {
          pattern = getPatternFromCache(symbol);
        }

        // Apply pattern weights if available
        if (pattern) {
          applyPatternToCompatResult(result, pattern);
        }

        return result;
      };

      console.log("[PatternIntel] computeCompatEntryScore patched with pattern weights (synchronous)");
    }

    // ── Patch computeTenDayForwardConfidence wrapper in refreshStock ──
    // The screener calls TI.computeTenDayForwardConfidence at line 8353 of app-core.js.
    // We wrap it to apply pattern calibration to the probTouch output.
    if (window.TechIndicators.computeTenDayForwardConfidence) {
      var _origConf10d = window.TechIndicators.computeTenDayForwardConfidence;

      window.TechIndicators.computeTenDayForwardConfidence = function computeTenDayForwardConfidencePatched(hourlyCandles, dailyCandles, indexCandles, entryScoreCtx, symbolHint) {
        // Call original
        var result = _origConf10d(hourlyCandles, dailyCandles, indexCandles, entryScoreCtx);

        if (!result) return result;

        // Apply pattern calibration if we have a pattern for this symbol
        var symbol = symbolHint || (hourlyCandles && hourlyCandles._symbol) || (dailyCandles && dailyCandles._symbol) || null;
        if (symbol) {
          var pattern = getPatternFromCache(symbol);
          if (pattern) {
            var rawProb = result.confidenceLognormal != null ? result.confidenceLognormal / 100 : null;
            var driftScore = result.components && result.components.driftScore != null ? result.components.driftScore : null;

            if (rawProb != null) {
              var calibrated = applyPatternCalibration(rawProb, driftScore, pattern);
              if (calibrated != null && calibrated !== rawProb) {
                result._patternCalibrated = true;
                result._patternOriginalConf = result.confidence;
                result.confidence = Math.round(calibrated * 100);
                if (result.components && result.components.probTouch != null) {
                  result._patternOriginalProbTouch = result.components.probTouch;
                  result.components.probTouch = Math.round(calibrated * 100);
                }
                result.confidenceLognormal = Math.round(calibrated * 100);
              }
            }
          }
        }

        return result;
      };

      console.log("[PatternIntel] computeTenDayForwardConfidence patched with pattern calibration");
    }

    // ── Quick check helpers ──
    window.TechIndicators.hasPattern = function (symbol) {
      return !!getPatternFromCache(symbol);
    };

    window.TechIndicators.getPatternCached = function (symbol) {
      return getPatternFromCache(symbol);
    };

    // Expose cache status for diagnostics
    window.TechIndicators._patCacheLoaded = _cacheLoaded;
    window.TechIndicators._patCacheCount = Object.keys(_patternMemoryCache).length;
    window.TechIndicators._patCacheSymbols = Object.keys(_patternMemoryCache);

    console.log("[PatternIntel] Scoring pipeline fully patched — cache helpers exposed");
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

    var stocks = symbols || window.STOX_ALL_SYMBOLS || getDefaultStocks();
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

    // Auto-reload pattern cache so screener picks up new patterns immediately
    await loadPatternCache();
    console.log("[PatternIntel] Pattern cache reloaded — screener will use updated data on next refresh");

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

    // Reload cache
    await loadPatternCache();

    return result;
  };

  /**
   * Utility: Train ML model on stored features.
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
        if (epoch % 10 === 0 || epoch === 50) {
          console.log("[ML] Epoch " + epoch + ": loss=" + loss.toFixed(4) + " train=" + trainAcc + "% val=" + valAcc + "%");
        }
      }
    });

    console.log("[PatternIntel] ML training complete:", result);
    return result;
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
