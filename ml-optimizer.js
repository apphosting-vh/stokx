/* ══════════════════════════════════════════════════════════════════════════
   ML Optimizer — StoX (Phase 4)
   Bayesian optimization of backtest configuration parameters and
   market regime detection with per-regime model routing.

   Components:
     1. BayesianOptimizer — optimizes targetProfitPct, holdingPeriodDays,
        threshold, sampleEvery by treating backtest Sharpe as objective.
     2. RegimeDetector — classifies market conditions (trending/ranging/
        volatile) using indicator clustering.
     3. Per-regime model routing — select best ML model for current regime.

   Dependencies: window.PatternStore, window.MLTrainer, window.BatchBacktest
   ══════════════════════════════════════════════════════════════════════════ */

window.MLOptimizer = (function () {

  /* ════════════════════════════════════════════════════════════════════════
     Bayesian Optimization (Gaussian Process surrogate)
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Param space definition for backtest config optimization.
   */
  var PARAM_SPACE = {
    targetProfitPct: { min: 1, max: 12, step: 0.5, default: 4 },
    holdingPeriodDays: { min: 3, max: 30, step: 1, default: 14 },
    threshold: { min: 40, max: 85, step: 5, default: 65 },
    sampleEvery: { min: 1, max: 5, step: 1, default: 2 }
  };

  /**
   * Squared Exponential kernel for GP.
   */
  function seKernel(x1, x2, lengthScale, signalVariance) {
    var sum = 0;
    for (var i = 0; i < x1.length; i++) {
      var diff = x1[i] - x2[i];
      sum += diff * diff;
    }
    return signalVariance * Math.exp(-0.5 * sum / (lengthScale * lengthScale));
  }

  /**
   * Build GP kernel matrix.
   */
  function buildKernelMatrix(X, lengthScale, signalVariance, noiseVariance) {
    var n = X.length;
    var K = [];
    for (var i = 0; i < n; i++) {
      K[i] = [];
      for (var j = 0; j < n; j++) {
        K[i][j] = seKernel(X[i], X[j], lengthScale, signalVariance);
        if (i === j) K[i][j] += noiseVariance;
      }
    }
    return K;
  }

  /**
   * Solve Ax = b using Gaussian elimination with partial pivoting.
   * A is n×n, b is n×1, returns x as n×1.
   */
  function solveLinear(A, b) {
    var n = A.length;
    // Augmented matrix
    var M = [];
    for (var i = 0; i < n; i++) {
      M[i] = A[i].concat([b[i]]);
    }
    // Forward elimination
    for (var col = 0; col < n; col++) {
      // Partial pivot
      var maxRow = col;
      for (var row = col + 1; row < n; row++) {
        if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
      }
      var tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp;
      if (Math.abs(M[col][col]) < 1e-10) continue;
      for (var row = col + 1; row < n; row++) {
        var factor = M[row][col] / M[col][col];
        for (var j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
      }
    }
    // Back substitution
    var x = new Array(n).fill(0);
    for (var i = n - 1; i >= 0; i--) {
      if (Math.abs(M[i][i]) < 1e-10) continue;
      x[i] = M[i][n];
      for (var j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
      x[i] /= M[i][i];
    }
    return x;
  }

  /**
   * Bayesian Optimizer.
   * Uses Gaussian Process surrogate to select next evaluation points
   * via Expected Improvement acquisition function.
   */
  function createBayesianOptimizer(paramSpace) {
    paramSpace = paramSpace || PARAM_SPACE;
    var observations = []; // { params: [normalized], value: objective, raw: { targetProfitPct, ... } }
    var paramNames = Object.keys(paramSpace);
    var lengthScale = 1.0;
    var signalVariance = 1.0;
    var noiseVariance = 0.01;

    /**
     * Normalize params to [0, 1].
     */
    function normalizeParams(raw) {
      return paramNames.map(function (name) {
        var space = paramSpace[name];
        return (raw[name] - space.min) / (space.max - space.min);
      });
    }

    /**
     * Denormalize from [0, 1] to actual param values.
     */
    function denormalizeParams(normed) {
      var raw = {};
      paramNames.forEach(function (name, i) {
        var space = paramSpace[name];
        raw[name] = space.min + normed[i] * (space.max - space.min);
        // Snap to step
        raw[name] = Math.round(raw[name] / space.step) * space.step;
        raw[name] = Math.max(space.min, Math.min(space.max, raw[name]));
      });
      return raw;
    }

    /**
     * Record an observation.
     */
    function record(rawParams, objectiveValue) {
      observations.push({
        params: normalizeParams(rawParams),
        value: objectiveValue,
        raw: Object.assign({}, rawParams)
      });
    }

    /**
     * Predict mean and variance at a point using GP.
     */
    function predictGP(x) {
      if (observations.length < 2) return { mean: 0, variance: signalVariance };

      var X = observations.map(function (o) { return o.params; });
      var y = observations.map(function (o) { return o.value; });
      var n = X.length;

      var K = buildKernelMatrix(X, lengthScale, signalVariance, noiseVariance);

      // k(x, X) — vector of covariances between x and all training points
      var kx = X.map(function (Xi) { return seKernel(x, Xi, lengthScale, signalVariance); });

      // Solve K^{-1} * y
      var alpha = solveLinear(K, y);

      // Predicted mean: k(x, X)^T * K^{-1} * y
      var mean = 0;
      for (var i = 0; i < n; i++) mean += kx[i] * alpha[i];

      // Predicted variance: k(x,x) - k(x,X)^T * K^{-1} * k(x,X)
      var kxx = seKernel(x, x, lengthScale, signalVariance);
      var KinvKx = solveLinear(K, kx);
      var varTerm = 0;
      for (var i = 0; i < n; i++) varTerm += KinvKx[i] * kx[i];
      var variance = Math.max(0, kxx - varTerm);

      return { mean: mean, variance: variance };
    }

    /**
     * Expected Improvement acquisition function.
     */
    function expectedImprovement(x, bestSoFar) {
      var gp = predictGP(x);
      var mean = gp.mean;
      var std = Math.sqrt(gp.variance);
      if (std < 1e-8) return 0;

      var z = (mean - bestSoFar) / std;
      // Approximate normal CDF and PDF
      var phi = 0.5 * (1 + erf(z));
      var pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
      return (mean - bestSoFar) * phi + std * pdf;
    }

    /**
     * Approximate error function (Abramowitz & Stegun).
     */
    function erf(x) {
      var sign = x >= 0 ? 1 : -1;
      x = Math.abs(x);
      var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      var a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      var t = 1 / (1 + p * x);
      var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return sign * y;
    }

    /**
     * Select next point to evaluate using EI.
     * Generates candidates and picks the one with highest EI.
     */
    function suggestNext(numCandidates) {
      numCandidates = (numCandidates != null) ? numCandidates : 50;
      if (observations.length < 1) {
        // First point: use defaults
        return denormalizeParams(paramNames.map(function (n) { return 0.5; }));
      }

      var bestSoFar = observations.reduce(function (best, o) { return o.value > best ? o.value : best; }, -Infinity);
      var bestEI = -Infinity;
      var bestX = null;

      for (var i = 0; i < numCandidates; i++) {
        var candidate = paramNames.map(function () { return Math.random(); });
        var ei = expectedImprovement(candidate, bestSoFar);
        if (ei > bestEI) {
          bestEI = ei;
          bestX = candidate;
        }
      }

      // Also check around current best
      if (observations.length > 0) {
        var bestObs = observations.reduce(function (b, o) { return o.value > b.value ? o : b; });
        for (var d = -0.1; d <= 0.1; d += 0.05) {
          paramNames.forEach(function (_, idx) {
            var candidate = bestObs.params.slice();
            candidate[idx] = Math.max(0, Math.min(1, candidate[idx] + d));
            var ei = expectedImprovement(candidate, bestSoFar);
            if (ei > bestEI) { bestEI = ei; bestX = candidate; }
          });
        }
      }

      return bestX ? denormalizeParams(bestX) : denormalizeParams(paramNames.map(function () { return 0.5; }));
    }

    function getObservations() { return observations.slice(); }
    function getCount() { return observations.length; }

    return {
      record: record,
      suggestNext: suggestNext,
      predictGP: predictGP,
      normalizeParams: normalizeParams,
      denormalizeParams: denormalizeParams,
      getObservations: getObservations,
      getCount: getCount,
      paramNames: paramNames,
      paramSpace: paramSpace
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     Configuration Optimizer (uses BayesianOptimizer)
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Run Bayesian optimization over backtest config params.
   * Evaluates configurations by running mini-backtests and measuring Sharpe.
   *
   * @param {Object} opts
   *   - symbols: string[] — stocks to evaluate on
   *   - iterations: number — number of config evaluations (default 15)
   *   - evalFn: function(config) → Promise<{ sharpe, winRate, avgReturn }>
   *     Custom evaluation function. If not provided, uses a built-in mini-backtest.
   *   - onIteration: function(iter, total, config, result)
   *   - onProgress: function(current, total, message)
   */
  async function optimizeConfig(opts) {
    opts = opts || {};
    var symbols = opts.symbols || [];
    var iterations = (opts.iterations != null) ? opts.iterations : 15;
    var onIteration = opts.onIteration || function () {};
    var onProgress = opts.onProgress || function () {};

    var optimizer = createBayesianOptimizer(PARAM_SPACE);
    var results = [];

    onProgress(0, iterations, "Starting Bayesian optimization...");

    for (var iter = 0; iter < iterations; iter++) {
      var config = optimizer.suggestNext(80);
      onProgress(iter, iterations, "Evaluating config: TP=" + config.targetProfitPct + "%, HP=" + config.holdingPeriodDays + "d, Thr=" + config.threshold);

      var evalResult;
      if (opts.evalFn) {
        evalResult = await opts.evalFn(config);
      } else if (window.BatchBacktest && symbols.length > 0) {
        evalResult = await _evaluateConfigWithBacktest(config, symbols, opts);
      } else {
        evalResult = { sharpe: 0, winRate: 0, avgReturn: 0 };
      }

      // Objective: Sharpe ratio (primary) + bonus for high win rate
      var objective = evalResult.sharpe + (evalResult.winRate / 100) * 0.5;
      optimizer.record(config, objective);

      var iterResult = {
        iteration: iter + 1,
        config: config,
        objective: Math.round(objective * 1000) / 1000,
        sharpe: evalResult.sharpe,
        winRate: evalResult.winRate,
        avgReturn: evalResult.avgReturn
      };
      results.push(iterResult);

      onIteration(iter + 1, iterations, config, iterResult);
      await new Promise(function (r) { setTimeout(r, 0); });
    }

    // Find best config
    results.sort(function (a, b) { return b.objective - a.objective; });
    var best = results[0];

    // Save optimization results
    if (window.PatternStore) {
      await PatternStore.init();
      await PatternStore.setMeta("ml_optimization_results", {
        timestamp: Date.now(),
        iterations: iterations,
        bestConfig: best.config,
        bestObjective: best.objective,
        allResults: results
      });
    }

    return {
      success: true,
      iterations: iterations,
      bestConfig: best.config,
      bestObjective: best.objective,
      bestSharpe: best.sharpe,
      bestWinRate: best.winRate,
      allResults: results
    };
  }

  /**
   * Internal: Evaluate a config by running a quick backtest on a few stocks.
   */
  async function _evaluateConfigWithBacktest(config, symbols, opts) {
    try {
      // Use a subset of symbols for speed (max 10)
      var evalSymbols = symbols.slice(0, Math.min(10, symbols.length));
      var runner = window.BatchBacktest.create(Object.assign({}, config, { sampleEvery: config.sampleEvery || 2 }));

      var totalTrades = 0, totalWins = 0, totalReturns = 0;
      var returns = [];

      // Quick evaluation: load from offline data if available
      for (var i = 0; i < evalSymbols.length; i++) {
        try {
          var singleResult = await runner.runSingle(evalSymbols[i], { silent: true });
          if (singleResult && singleResult.stats && singleResult.stats.trades) {
            var trades = singleResult.stats.trades;
            totalTrades += trades.length;
            trades.forEach(function (t) {
              if (t.hitTarget) totalWins++;
              if (t.finalReturnPct != null) {
                totalReturns += t.finalReturnPct;
                returns.push(t.finalReturnPct);
              }
            });
          }
        } catch (e) { /* skip failed stocks */ }
      }

      var winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
      var avgReturn = totalTrades > 0 ? totalReturns / totalTrades : 0;

      // Approximate Sharpe
      var sharpe = 0;
      if (returns.length > 1) {
        var mean = returns.reduce(function (s, v) { return s + v; }, 0) / returns.length;
        var variance = returns.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / returns.length;
        var std = Math.sqrt(variance);
        sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0; // annualized
      }

      return {
        sharpe: Math.round(sharpe * 100) / 100,
        winRate: Math.round(winRate * 10) / 10,
        avgReturn: Math.round(avgReturn * 100) / 100,
        tradesEvaluated: totalTrades
      };
    } catch (e) {
      return { sharpe: 0, winRate: 0, avgReturn: 0, error: e.message };
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     Market Regime Detection
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Regime definitions.
   * Each regime is characterized by indicator ranges.
   */
  var REGIME_DEFINITIONS = {
    STRONG_TREND_UP: {
      description: "Strong uptrend with high momentum",
      indicators: { adx: [25, 100], ema_slope: [0.5, 100], rsi: [55, 80], atr_pct: [0.5, 5] },
      modelSuffix: "_trend_up"
    },
    WEAK_TREND_UP: {
      description: "Mild uptrend, moderate momentum",
      indicators: { adx: [15, 40], ema_slope: [0, 0.5], rsi: [50, 70], atr_pct: [0.3, 3] },
      modelSuffix: "_trend_up"
    },
    SIDEWAYS_LOW_VOL: {
      description: "Range-bound with low volatility",
      indicators: { adx: [0, 25], ema_slope: [-0.3, 0.3], rsi: [40, 60], atr_pct: [0, 1.5] },
      modelSuffix: "_ranging"
    },
    SIDEWAYS_HIGH_VOL: {
      description: "Range-bound with high volatility (consolidation)",
      indicators: { adx: [0, 30], ema_slope: [-0.3, 0.3], rsi: [35, 65], atr_pct: [1.5, 10] },
      modelSuffix: "_volatile"
    },
    TREND_DOWN: {
      description: "Downtrend",
      indicators: { adx: [20, 100], ema_slope: [-100, -0.3], rsi: [20, 50], atr_pct: [0.5, 5] },
      modelSuffix: "_trend_down"
    }
  };

  /**
   * Classify current market regime based on index indicators.
   *
   * @param {Object} indicators — { adx, ema_slope, rsi, atr_pct, ... }
   * @returns {Object} { regime: string, confidence: number, scores: {...}, description: string }
   */
  function detectRegime(indicators) {
    indicators = indicators || {};
    var scores = {};

    Object.keys(REGIME_DEFINITIONS).forEach(function (regime) {
      var def = REGIME_DEFINITIONS[regime];
      var score = 1;
      var matchCount = 0;

      Object.keys(def.indicators).forEach(function (ind) {
        var range = def.indicators[ind];
        var val = indicators[ind];
        if (val == null) { score *= 0.5; return; }

        var lo = range[0], hi = range[1];
        // Soft membership: 1.0 inside, linear decay to 0 outside
        if (val >= lo && val <= hi) {
          score *= 1.0;
          matchCount++;
        } else if (val < lo) {
          var dist = (lo - val) / Math.max(1, Math.abs(lo));
          score *= Math.max(0, 1 - dist);
        } else {
          var dist = (val - hi) / Math.max(1, Math.abs(hi));
          score *= Math.max(0, 1 - dist);
        }
      });

      scores[regime] = Math.round(score * 1000) / 1000;
    });

    // Find best matching regime
    var bestRegime = "SIDEWAYS_LOW_VOL"; // default
    var bestScore = 0;
    Object.keys(scores).forEach(function (r) {
      if (scores[r] > bestScore) { bestScore = scores[r]; bestRegime = r; }
    });

    // Confidence: how much better is the best vs second-best
    var sortedScores = Object.keys(scores).map(function (r) { return { regime: r, score: scores[r] }; })
      .sort(function (a, b) { return b.score - a.score; });
    var secondBest = sortedScores.length > 1 ? sortedScores[1].score : 0;
    var confidence = sortedScores[0].score > 0 ? Math.min(1, (bestScore - secondBest) / bestScore) : 0;

    return {
      regime: bestRegime,
      confidence: Math.round(confidence * 100) / 100,
      scores: scores,
      description: REGIME_DEFINITIONS[bestRegime].description,
      modelSuffix: REGIME_DEFINITIONS[bestRegime].modelSuffix
    };
  }

  /**
   * Detect regime from candles (computes indicators then classifies).
   */
  function detectRegimeFromCandles(candles, indexCandles) {
    var TI = window.TechIndicators;
    if (!TI || !candles || candles.length < 50) {
      return detectRegime({}); // default
    }

    try {
      // Use index candles for market-wide regime, fallback to stock candles
      var src = (indexCandles && indexCandles.length > 50) ? indexCandles : candles;
      var adx = TI.adx(src, 14);
      var emaFast = TI.ema(src, 12);
      var rsi = TI.rsi(src, 14);
      var atr = TI.atr(src, 14);
      var n = src.length - 1;

      var indicators = {
        adx: adx && adx.adx ? adx.adx[n] : 20,
        ema_slope: emaFast[n] != null && emaFast[Math.max(0, n - 3)] != null
          ? ((emaFast[n] - emaFast[Math.max(0, n - 3)]) / Math.max(0.01, emaFast[Math.max(0, n - 3)])) * 100
          : 0,
        rsi: rsi ? rsi[n] : 50,
        atr_pct: atr[n] && src[n].c > 0 ? (atr[n] / src[n].c) * 100 : 1
      };

      return detectRegime(indicators);
    } catch (e) {
      return detectRegime({});
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     Per-Regime Model Management
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Get or train regime-specific ML model.
   */
  async function getRegimeModel(regimeSuffix) {
    if (!window.PatternStore) return null;
    await PatternStore.init();

    var key = "ml_model_champion" + regimeSuffix;
    try {
      var model = await PatternStore.getMeta(key);
      var meta = await PatternStore.getMeta(key + "_meta");
      return model ? { model: model, meta: meta } : null;
    } catch (e) { return null; }
  }

  /**
   * Train regime-specific model by filtering features for that regime.
   */
  async function trainRegimeModel(regimeSuffix, indicatorFilter, opts) {
    opts = opts || {};
    if (!window.PatternStore || !window.MLTrainer) return null;

    await PatternStore.init();
    var allFeatures = await PatternStore.getAllFeatures();
    if (allFeatures.length < 50) return null;

    // Filter samples matching this regime's indicator ranges
    var def = null;
    Object.keys(REGIME_DEFINITIONS).forEach(function (r) {
      if (REGIME_DEFINITIONS[r].modelSuffix === regimeSuffix) def = REGIME_DEFINITIONS[r];
    });
    if (!def) return null;

    var regimeSamples = allFeatures.filter(function (s) {
      if (!s.features) return false;
      var matches = true;
      Object.keys(def.indicators).forEach(function (ind) {
        var range = def.indicators[ind];
        var val = s.features[ind];
        var rangeWidth = Math.abs(range[1] - range[0]);
        if (val == null || val < range[0] - 0.2 * rangeWidth || val > range[1] + 0.2 * rangeWidth) matches = false;
      });
      return matches;
    });

    if (regimeSamples.length < 30) return null;

    // Store filtered features temporarily
    var originalGetAll = PatternStore.getAllFeatures;
    PatternStore.getAllFeatures = function () { return Promise.resolve(regimeSamples); };

    try {
      var trainer = window.MLTrainer.create({
        hiddenUnits: opts.hiddenUnits || [24, 12],
        learningRate: opts.learningRate || 0.008,
        epochs: opts.epochs || 40,
        batchSize: opts.batchSize || 16,
        dropoutRate: 0.15
      });

      var result = await trainer.train({
        onEpoch: opts.onEpoch || function () {}
      });

      // Save as regime-specific model
      if (result.success) {
        var modelData = await PatternStore.getMeta("ml_model");
        var modelMeta = await PatternStore.getMeta("ml_model_meta") || {};
        if (modelData) {
          var key = "ml_model_champion" + regimeSuffix;
          await PatternStore.setMeta(key, modelData);
          modelMeta.regime = regimeSuffix;
          modelMeta.regimeSamples = regimeSamples.length;
          await PatternStore.setMeta(key + "_meta", modelMeta);
        }
      }

      return result;
    } finally {
      PatternStore.getAllFeatures = originalGetAll;
    }
  }

  /**
   * Predict using the best model for the current regime.
   * Falls back to champion model if no regime-specific model exists.
   */
  async function predictWithRegime(features, regime) {
    // Try regime-specific model first
    if (regime && regime.modelSuffix) {
      var regimeModel = await getRegimeModel(regime.modelSuffix);
      if (regimeModel && window.MLTrainer) {
        var pred = window.MLTrainer.predictSync(features, regimeModel.model);
        if (pred) {
          pred.regimeUsed = regime.regime;
          pred.modelType = "regime_specific";
          return pred;
        }
      }
    }

    // Fallback to champion
    if (window.MLTrainer) {
      var pred = await window.MLTrainer.predict(features);
      if (pred) {
        pred.regimeUsed = regime ? regime.regime : "unknown";
        pred.modelType = "champion";
      }
      return pred;
    }

    return null;
  }

  /* ════════════════════════════════════════════════════════════════════════
     Feature Importance Ranking & Selection
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Get feature importance from the latest trained model.
   */
  async function getFeatureImportance() {
    if (!window.MLTrainer || !window.PatternStore) return [];
    await PatternStore.init();

    var meta = await PatternStore.getMeta("ml_model_champion_meta") || await PatternStore.getMeta("ml_model_meta");
    if (meta && meta.featureImportance) return meta.featureImportance;

    return [];
  }

  /**
   * Get optimization history.
   */
  async function getOptimizationHistory() {
    if (!window.PatternStore) return null;
    await PatternStore.init();
    return await PatternStore.getMeta("ml_optimization_results");
  }

  /* ════════════════════════════════════════════════════════════════════════
     Public API
     ════════════════════════════════════════════════════════════════════════ */

  return {
    // Bayesian Optimization
    createBayesianOptimizer: createBayesianOptimizer,
    PARAM_SPACE: PARAM_SPACE,
    optimizeConfig: optimizeConfig,

    // Regime Detection
    REGIME_DEFINITIONS: REGIME_DEFINITIONS,
    detectRegime: detectRegime,
    detectRegimeFromCandles: detectRegimeFromCandles,

    // Per-Regime Models
    getRegimeModel: getRegimeModel,
    trainRegimeModel: trainRegimeModel,
    predictWithRegime: predictWithRegime,

    // Feature Importance
    getFeatureImportance: getFeatureImportance,

    // History
    getOptimizationHistory: getOptimizationHistory
  };
})();
