/* ══════════════════════════════════════════════════════════════════════════
   Batch Backtest Engine — StoX
   Runs backtests across multiple stocks, extracts per-stock patterns,
   and stores them in PatternStore for live scoring consumption.

   Supports two data sources:
     1. OfflineOHLCV — pre-downloaded JSON data (preferred, instant)
     2. Yahoo Finance live fetch — fallback when no offline data

   Dependencies: window.BacktestEngine, window.TechIndicators,
                 window.OHLCVFetcher, window.PatternStore, window.OfflineOHLCV

   Usage:
     await PatternStore.init();

     // Option A: Run using offline data (automatic)
     var runner = BatchBacktest.create({ targetProfitPct: 4, holdingPeriodDays: 14 });
     var result = await runner.runBatch(symbols, {
       onProgress: (current, total, symbol, phase) => { ... }
     });

     // Option B: Run using pre-built dataMap (from existing backtester)
     var result = await runner.runBatchFromDataMap(dataMap, multiTFMap, indexCandles, {
       onProgress: (current, total, symbol, phase) => { ... }
     });
   ══════════════════════════════════════════════════════════════════════════ */

window.BatchBacktest = (function () {

  /**
   * Yield to the browser's event loop so the UI can repaint and avoid
   * a "page unresponsive" crash.  Uses requestAnimationFrame for a full
   * paint cycle, plus a small setTimeout fallback.
   */
  function yieldToUI(ms) {
    var delay = ms || 0;
    if (delay > 0) {
      return new Promise(function (r) { setTimeout(r, delay); });
    }
    return new Promise(function (r) {
      requestAnimationFrame(function () { setTimeout(r, 0); });
    });
  }

  /** Longer pause — lets GC run and the user see progress updates */
  function yieldLong() { return yieldToUI(80); }

  function round2(v) { return Math.round(v * 100) / 100; }
  function round3(v) { return Math.round(v * 1000) / 1000; }

  /**
   * Build the multi-TF score function (same approach as the existing
   * backtester in app-core.js — tries multi-TF first, falls back to
   * single-TF daily scoring).
   */
  function buildScoreFn(idxCandles, multiTFMap) {
    var TI = window.TechIndicators;
    return function (candles, idx, symbol) {
      var bar = candles[idx];
      if (!bar) return null;
      var ts = bar.t;
      var idxSlice = null;
      if (idxCandles && idxCandles.length && ts != null) {
        var lo = 0, hi = idxCandles.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (idxCandles[mid].t <= ts) lo = mid + 1; else hi = mid; }
        if (lo > 0) idxSlice = idxCandles.slice(0, lo);
      }

      /* Try multi-TF scoring if data available */
      var tfData = multiTFMap && symbol ? multiTFMap[symbol] : null;
      if (tfData && (tfData.daily || tfData.hourly || tfData.weekly)) {
        function sliceBefore(arr) {
          if (!arr) return null;
          var fi = arr.findIndex(function(b) { return b.t > ts; });
          return arr.slice(0, fi === -1 ? arr.length : fi);
        }
        var dailySlice = sliceBefore(tfData.daily);
        var hourlySlice = sliceBefore(tfData.hourly);
        var weeklySlice = sliceBefore(tfData.weekly);
        var tfResults = [];
        if (dailySlice && dailySlice.length >= 50) tfResults.push({ timeframe: "D", candles: dailySlice });
        if (hourlySlice && hourlySlice.length >= 50) tfResults.push({ timeframe: "H", candles: hourlySlice });
        if (weeklySlice && weeklySlice.length >= 50) tfResults.push({ timeframe: "W", candles: weeklySlice });
        if (tfResults.length >= 2) {
          try {
            var mtf = TI.computeMultiTFEntryScore(tfResults, idxSlice, null);
            if (mtf && mtf.multiTF_score != null) {
              return { entryScore: mtf.multiTF_score, raw_score: mtf.raw_score, classification: mtf.classification, trendHealth: mtf.trendHealth, pullbackQuality: mtf.pullbackQuality, prob4: mtf.prob4, swingPotential: mtf.swingPotential, modifiers: mtf.modifiers };
            }
          } catch (e) { console.warn("Multi-TF scoring failed:", e.message); }
        }
      }

      /* Fall back to single-TF daily scoring */
      var res;
      try { res = TI.computeEntryScore(candles.slice(0, idx + 1), idxSlice && idxSlice.length ? idxSlice : null); } catch (e) { return null; }
      if (!res || res.entry_score == null) return null;
      return { entryScore: res.entry_score, raw_score: res.raw_score, classification: res.classification, trendHealth: res.trendHealth, pullbackQuality: res.pullbackQuality, prob4: res.prob4, swingPotential: res.swingPotential, modifiers: res.modifiers };
    };
  }

  /**
   * Create a batch backtest runner with configuration.
   */
  function create(cfg) {
    cfg = cfg || {};

    var targetProfitPct = cfg.targetProfitPct != null ? cfg.targetProfitPct : 4.0;
    var holdingPeriodDays = cfg.holdingPeriodDays != null ? cfg.holdingPeriodDays : 14;
    var threshold = cfg.threshold != null ? cfg.threshold : 65;
    var slippagePct = cfg.slippagePct != null ? cfg.slippagePct : 0.1;
    var brokeragePct = cfg.brokeragePct != null ? cfg.brokeragePct : 0.05;
    var warmup = cfg.warmup != null ? cfg.warmup : 60;
    var timeframe = cfg.timeframe || "1h";
    var range = cfg.range || "2y";
    var sampleEvery = cfg.sampleEvery != null ? cfg.sampleEvery : 2;
    var _cancelled = false;

    /**
     * Run batch backtest for a list of stock symbols.
     *
     * Automatically loads from OfflineOHLCV if available, otherwise
     * fetches from Yahoo Finance.
     *
     * @param {string[]} symbols - List of NSE stock symbols
     * @param {Object} opts
     *   - onProgress(current, total, symbol, phase)
     *   - onPatternExtracted(symbol, pattern)
     *   - onError(symbol, error)
     *   - sampleEvery
     *   - storePatterns (default: true)
     *   - extractFeatures (default: true)
     * @returns {Object} { results, errors, summary }
     */
    async function runBatch(symbols, opts) {
      opts = opts || {};
      var totalSymbols = symbols.length;

      // Initialize PatternStore if needed
      if (window.PatternStore) {
        try { await window.PatternStore.init(); } catch (e) { console.error("PatternStore.init failed:", e); }
      }

      // ── Load data: offline first, live fallback ──
      var dataMap = {};
      var multiTFMap = {};
      var indexCandles = null;
      var offlineUsed = false;

      // Check for offline data
      var hasOffline = window.OfflineOHLCV && await checkOfflineAvailable();
      if (opts.onProgress) opts.onProgress(0, totalSymbols, "", hasOffline ? "loading_offline" : "no_offline_fallback_live");

      if (hasOffline) {
        offlineUsed = true;

        // Build a set of all available offline tickers (keys as stored)
        var offlineRecords = await window.OfflineOHLCV.getAll();
        var offlineKeyMap = {}; // maps both "RELIANCE" and "RELIANCE.NS" -> record
        offlineRecords.forEach(function (rec) {
          if (!rec || !rec.ticker) return;
          offlineKeyMap[rec.ticker] = rec;
          // Also map without .NS suffix
          var base = rec.ticker.replace(/\.NS$/, "").replace(/\.BO$/, "");
          offlineKeyMap[base] = rec;
        });

        // Load NIFTY index candles
        try {
          var idxKey = "^NSEI";
          if (offlineKeyMap["^NSEI"]) indexCandles = offlineKeyMap["^NSEI"].daily || offlineKeyMap["^NSEI"].data || null;
          else if (offlineKeyMap["^NSEI.NS"]) indexCandles = offlineKeyMap["^NSEI.NS"].daily || offlineKeyMap["^NSEI.NS"].data || null;
        } catch (e) { console.warn("Index candle load failed:", e.message); }

        // Load all stock candles
        for (var i = 0; i < symbols.length; i++) {
          var sym = symbols[i];
          try {
            // Try exact key first, then with .NS, then without .NS
            var rec = offlineKeyMap[sym] || offlineKeyMap[sym + ".NS"] || offlineKeyMap[sym.replace(/\.NS$/, "")];
            if (rec) {
              var daily = rec.daily || rec.data || null;
              if (daily && daily.length >= warmup + 20) {
                dataMap[sym] = daily;
                multiTFMap[sym] = {
                  daily: rec.daily || null,
                  hourly: rec.hourly || rec["1h"] || null,
                  weekly: rec.weekly || null
                };
              }
            }
          } catch (e) {}
          if (opts.onProgress) opts.onProgress(i + 1, totalSymbols, sym, "loading_offline");
          if (i % 20 === 0) await yieldToUI();
        }
      }

      // Fallback: live fetch for symbols not in offline
      var loadedSymbols = Object.keys(dataMap);
      var missingSymbols = symbols.filter(function(s) { return loadedSymbols.indexOf(s) === -1; });

      if (missingSymbols.length > 0) {
        // Fetch NIFTY index if not already loaded
        try {
          if (window.OHLCVFetcher && !indexCandles) {
            var idxRes = await window.OHLCVFetcher.fetchOHLCVCached("^NSEI.NS", "daily", range);
            indexCandles = idxRes && idxRes.data ? idxRes.data : null;
          }
        } catch (e) { console.warn("Index fetch failed:", e.message); }

        for (var j = 0; j < missingSymbols.length; j++) {
          var sym2 = missingSymbols[j];
          try {
            if (window.OHLCVFetcher && window.OHLCVFetcher.fetchOHLCVCached) {
              var r = await window.OHLCVFetcher.fetchOHLCVCached(sym2 + ".NS", "daily", range);
              var c = r && r.data ? r.data : (Array.isArray(r) ? r : null);
              if (c && c.length >= warmup + 20) {
                dataMap[sym2] = c;
                // Fetch hourly + weekly in parallel
                var tfResults = await Promise.all([
                  window.OHLCVFetcher.fetchOHLCVCached(sym2 + ".NS", "1h", "1y").catch(function() { return null; }),
                  window.OHLCVFetcher.fetchOHLCVCached(sym2 + ".NS", "weekly", "5y").catch(function() { return null; })
                ]);
                var hRes = tfResults[0], wRes = tfResults[1];
                multiTFMap[sym2] = {
                  daily: c,
                  hourly: hRes && hRes.data ? hRes.data : null,
                  weekly: wRes && wRes.data ? wRes.data : null
                };
              }
            }
          } catch (e) {
            console.warn("Fetch failed for " + sym2 + ":", e.message);
            errors.push({ symbol: sym2, error: e.message });
          }
          if (opts.onProgress) opts.onProgress(j + 1, missingSymbols.length, sym2, "fetching");
          if (j % 5 === 0) await yieldToUI();
        }
      }

      var validSymbols = Object.keys(dataMap);

      // Log data loading summary
      if (opts.onProgress) opts.onProgress(validSymbols.length, totalSymbols, "", validSymbols.length > 0 ? "data_loaded" : "no_data");

      if (validSymbols.length === 0) {
        return {
          results: {},
          errors: [{ symbol: "*", error: "No data available for any of the " + totalSymbols + " symbols. Offline data: " + (offlineUsed ? "found but no match" : "not found") + ". Check offline data or network." }],
          summary: { totalSymbols: totalSymbols, successCount: 0, failCount: 0, skippedCount: totalSymbols, totalTrades: 0, avgWinRate: 0, totalDurationMs: 0, dataSource: offlineUsed ? "offline_no_match" : "none" }
        };
      }

      if (opts.onProgress) opts.onProgress(0, validSymbols.length, "", "backtesting");

      // ── Run backtest on all loaded data ──
      return await runBatchFromDataMap(dataMap, multiTFMap, indexCandles, Object.assign({}, opts, {
        _dataSource: offlineUsed ? "offline" : "live"
      }));
    }

    /**
     * Run batch backtest using pre-built dataMap and multiTFMap.
     * This is the core processing function — used both by runBatch() and
     * can be called directly when data is already loaded (e.g. from the
     * existing backtester's offline loading logic).
     *
     * @param {Object} dataMap - { symbol: dailyCandles[] }
     * @param {Object} multiTFMap - { symbol: { daily, hourly, weekly } }
     * @param {Array} indexCandles - NIFTY daily candles
     * @param {Object} opts - callbacks
     */
    async function runBatchFromDataMap(dataMap, multiTFMap, indexCandles, opts) {
      opts = opts || {};
      var storePatterns = opts.storePatterns !== false;
      var extractFeatures = opts.extractFeatures !== false;
      var symbols = opts.symbols || Object.keys(dataMap);
      var totalSymbols = symbols.length;
      var results = {};
      var errors = [];
      var summary = {
        totalSymbols: totalSymbols,
        successCount: 0,
        failCount: 0,
        skippedCount: 0,
        totalTrades: 0,
        avgWinRate: 0,
        totalDurationMs: 0,
        dataSource: opts._dataSource || "preloaded"
      };

      var startTime = Date.now();

      // Initialize PatternStore
      if (storePatterns && window.PatternStore) {
        try { await window.PatternStore.init(); } catch (e) { console.warn("PatternStore.init failed:", e.message); }
      }

      // Build score function using multi-TF data
      var scoreFn = buildScoreFn(indexCandles, multiTFMap);

      // Create engine with all config
      var engine = window.BacktestEngine.create({
        scoreFn: scoreFn,
        targetProfitPct: targetProfitPct,
        holdingPeriodDays: holdingPeriodDays,
        threshold: threshold,
        warmup: warmup,
        realisticEntry: true,
        realisticExit: true,
        slippagePct: slippagePct,
        brokeragePct: brokeragePct,
        multiTFMap: multiTFMap,
        indexCandles: indexCandles,
        maxCacheSize: 5
      });

      var step = sampleEvery || opts.sampleEvery || 2;

      for (var si = 0; si < symbols.length; si++) {
        if (_cancelled) break;
        var symbol = symbols[si];
        var candles = dataMap[symbol];

        if (!candles || candles.length < warmup + 20) {
          summary.skippedCount++;
          continue;
        }

        if (opts.onProgress) {
          opts.onProgress(si + 1, totalSymbols, symbol, "backtesting");
        }

        try {
          // ── Run single stock backtest (pass hooks so engine yields every 25 bars) ──
          var btResult = await engine.runSingle(candles, {
            symbol: symbol,
            sampleEvery: step
          }, {
            onBar: function (d, t) {
              // Callback fires every 25 bars — gives engine a chance to yield
            }
          });

          var trades = btResult.trades || (btResult.stats && btResult.stats.trades) || [];
          if (trades.length < 5) {
            summary.skippedCount++;
            if (opts.onProgress) opts.onProgress(si + 1, totalSymbols, symbol, "insufficient_trades");
            continue;
          }

          if (opts.onProgress) opts.onProgress(si + 1, totalSymbols, symbol, "analyzing");

          if (opts.silent) {
            results[symbol] = { symbol: symbol, trades: trades, tradeCount: trades.length };
            summary.successCount++;
            summary.totalTrades += trades.length;
            if (opts.onProgress) opts.onProgress(si + 1, totalSymbols, symbol, "done");
            await yieldToUI();
            continue;
          }

          // ── Analyze component power ──
          var powerResult = null;
          try {
            var singleDataMap = {};
            singleDataMap[symbol] = candles;
            powerResult = await engine.analyzeComponentPower(singleDataMap, {
              symbols: [symbol],
              sampleEvery: step
            }, {
              onSymbol: function (d, t) {
                // Callback fires after each symbol — lets engine yield
              }
            });
          } catch (e) {
            console.warn("Component power analysis failed for " + symbol + ":", e.message);
          }

          // ── Extract pattern ──
          var dailyOhlcv = multiTFMap && multiTFMap[symbol] ? multiTFMap[symbol].daily : null;
          var pattern = extractPattern(symbol, btResult, powerResult, candles, dailyOhlcv);

          // ── Extract features for ML ──
          if (extractFeatures) {
            try {
              var features = extractFeaturesForML(symbol, candles, trades, scoreFn);
              if (features.length > 0 && window.PatternStore) {
                await window.PatternStore.putFeatures(symbol, features);
              }
            } catch (e) {
              console.warn("Feature extraction failed for " + symbol + ":", e.message);
            }
          }

          // ── Store pattern ──
          if (storePatterns && window.PatternStore) {
            await window.PatternStore.put(symbol, pattern);
          }

          results[symbol] = pattern;
          summary.successCount++;
          summary.totalTrades += trades.length;

          if (opts.onProgress) opts.onProgress(si + 1, totalSymbols, symbol, "done");
          if (opts.onPatternExtracted) opts.onPatternExtracted(symbol, pattern);

        } catch (err) {
          errors.push({ symbol: symbol, error: err.message, stack: err.stack });
          summary.failCount++;
          if (opts.onError) opts.onError(symbol, err);
          if (opts.onProgress) opts.onProgress(si + 1, totalSymbols, symbol, "error");
        }

        // Yield to UI after EVERY stock + longer pause every 10 stocks for GC/paint
        await yieldToUI();
        if ((si + 1) % 10 === 0) await yieldLong();
      }

      summary.totalDurationMs = Date.now() - startTime;
      summary.avgWinRate = summary.successCount > 0
        ? round2(Object.values(results).reduce(function (s, p) {
            return s + (p.tradeStats && p.tradeStats.winRate ? p.tradeStats.winRate : 0);
          }, 0) / summary.successCount)
        : 0;

      // Update global metadata
      if (window.PatternStore) {
        try {
          await window.PatternStore.setMeta("lastBatchRun", {
            date: Date.now(),
            config: { targetProfitPct: targetProfitPct, holdingPeriodDays: holdingPeriodDays, threshold: threshold },
            summary: summary
          });
        } catch (e) { console.warn("setMeta failed:", e.message); }
      }

      return { results: results, errors: errors, summary: summary };
    }

    /**
     * Run backtest for a single stock and update its pattern.
     */
    async function runSingle(symbol, opts) {
      opts = opts || {};
      return await runBatch([symbol], opts);
    }

    /**
     * Refresh stale patterns (older than maxAgeMs).
     */
    async function refreshStale(symbols, maxAgeMs, opts) {
      maxAgeMs = maxAgeMs || 7 * 24 * 60 * 60 * 1000;
      if (!window.PatternStore) throw new Error("PatternStore required for refresh");

      var stale = await window.PatternStore.getStalePatterns(maxAgeMs);
      if (!stale || stale.length === 0) {
        return { refreshed: 0, message: "No stale patterns found" };
      }

      var staleSymbols = symbols
        ? stale.filter(function (s) { return s && s.symbol && symbols.indexOf(s.symbol) !== -1; }).map(function (s) { return s.symbol; })
        : stale.filter(function (s) { return s && s.symbol; }).map(function (s) { return s.symbol; });

      var result = await runBatch(staleSymbols, opts);
      result.refreshed = result.summary.successCount;
      return result;
    }

    /* ── Pattern Extraction ─────────────────────────────────────────────── */

    function extractPattern(symbol, btResult, powerResult, candles, dailyCandles, btCfg) {
      var trades = btResult.trades || (btResult.stats && btResult.stats.trades) || [];
      var stats = btResult.stats || {};

      // ── 1. Indicator Weights from component power ──
      var indicatorWeights = { trendHealth: 0.25, pullbackQuality: 0.25, prob4: 0.25, swingPotential: 0.25 };
      var indicatorPowers = {};

      if (powerResult && powerResult.components) {
        var comps = powerResult.components;
        var ivs = [];
        ["trendHealth", "pullbackQuality", "prob4", "swingPotential"].forEach(function (c) {
          if (comps[c] && !comps[c].error) {
            var iv = Math.abs(comps[c].infoValue || 0);
            indicatorPowers[c] = {
              correlation: comps[c].correlation,
              infoValue: comps[c].infoValue,
              bucketWinRates: comps[c].bucketWinRates || []
            };
            ivs.push({ c: c, iv: iv });
          }
        });

        // Relative min-max spread on infoValue (NOT a floor on raw magnitude —
        // a floor of 0.1 collapsed typical sub-0.1 infoValues to equal 25%).
        // Valid components get 0.1-0.9 of the budget, errored ones a fair share.
        if (ivs.length > 0) {
          var minIV = Math.min.apply(null, ivs.map(function (x) { return x.iv; }));
          var maxIV = Math.max.apply(null, ivs.map(function (x) { return x.iv; }));
          var valid = ivs.map(function (x) {
            return { c: x.c, w: maxIV > minIV ? (0.1 + 0.8 * (x.iv - minIV) / (maxIV - minIV)) : 0.5 };
          });
          var erroredCount = 4 - ivs.length;
          var validBudget = 1 - erroredCount * 0.1;
          var validSum = valid.reduce(function (s, x) { return s + x.w; }, 0);
          var validScale = validSum > 0 ? validBudget / validSum : 0;
          valid.forEach(function (x) { indicatorWeights[x.c] = round3(x.w * validScale); });
          ["trendHealth", "pullbackQuality", "prob4", "swingPotential"].forEach(function (c) {
            if (indicatorWeights[c] == null) indicatorWeights[c] = round3((erroredCount * 0.1) / Math.max(1, erroredCount));
          });
        }
      }

      // ── 2. Calibration from trades ──
      var calibration = { global: null, stratified: null };
      var withPT = trades.filter(function (t) { return t.probTouch != null && !isNaN(t.probTouch); });
      if (withPT.length >= 30) {
        var sorted = withPT.slice().sort(function (a, b) { return a.probTouch - b.probTouch; });
        var numBuckets = Math.max(3, Math.min(10, Math.floor(sorted.length / 10)));
        var bucketSize = Math.floor(sorted.length / numBuckets);
        var buckets = [];
        for (var bi = 0; bi < numBuckets; bi++) {
          var bStart = bi * bucketSize;
          var bEnd = bi === numBuckets - 1 ? sorted.length : bStart + bucketSize;
          var group = sorted.slice(bStart, bEnd);
          if (group.length < 5) continue;
          var hits = group.filter(function (t) { return t.hitTarget; }).length;
          buckets.push({
            probTouchRange: [round3(group[0].probTouch), round3(group[group.length - 1].probTouch)],
            avgProbTouch: round3(group.reduce(function (s, t) { return s + t.probTouch; }, 0) / group.length),
            hitRate: round2((hits / group.length) * 100),
            n: group.length
          });
        }
        var calP0 = 0.38;
        for (var j = 1; j < buckets.length; j++) {
          if (buckets[j - 1].hitRate < 50 && buckets[j].hitRate >= 50) {
            var prev = buckets[j - 1], curr = buckets[j];
            var denom = curr.hitRate - prev.hitRate;
            if (Math.abs(denom) > 0.001) {
              calP0 = round3(prev.avgProbTouch + ((50 - prev.hitRate) / denom) * (curr.avgProbTouch - prev.avgProbTouch));
            }
            break;
          }
        }
        calibration.global = { calP0: calP0, calK: 38, buckets: buckets };
      }

      // Stratified by drift tercile
      var withDS = trades.filter(function (t) { return t.driftScore != null && !isNaN(t.driftScore); });
      if (withDS.length >= 30) {
        var dsSorted = withDS.slice().sort(function (a, b) { return a.driftScore - b.driftScore; });
        var tercileSize = Math.floor(dsSorted.length / 3);
        if (tercileSize >= 10) {
          calibration.stratified = [];
          ["LOW_DRIFT", "MID_DRIFT", "HIGH_DRIFT"].forEach(function (label, ti) {
            var tStart = ti * tercileSize;
            var tEnd = ti === 2 ? dsSorted.length : tStart + tercileSize;
            var tGroup = dsSorted.slice(tStart, tEnd);
            var tHits = tGroup.filter(function (t) { return t.hitTarget; }).length;
            calibration.stratified.push({
              label: label,
              driftRange: [round3(tGroup[0].driftScore), round3(tGroup[tGroup.length - 1].driftScore)],
              avgProbTouch: round3(tGroup.reduce(function (s, t) { return s + (t.probTouch != null && !isNaN(t.probTouch) ? t.probTouch : 0); }, 0) / tGroup.length),
              hitRate: round2((tHits / tGroup.length) * 100),
              n: tGroup.length
            });
          });
        }
      }

      // ── 3. Regime Behavior ──
      var regimeBehavior = {};
      if (candles && candles.length > 60 && window.TechIndicators) {
        try {
          var atrArr = window.TechIndicators.atr(candles, 14);
          var atrVals = atrArr.filter(function (v) { return v != null && v > 0; });
          if (atrVals.length > 20) {
            atrVals.sort(function (a, b) { return a - b; });
            var p33 = atrVals[Math.floor(atrVals.length * 0.33)];
            var p66 = atrVals[Math.floor(atrVals.length * 0.66)];
            var regimes = { low_vol: [], mid_vol: [], high_vol: [] };
            var dateMap = {};
            candles.forEach(function (c, ci) { var d = String(c.t).slice(0, 10); if (!dateMap[d]) dateMap[d] = ci; });
            trades.forEach(function (t) {
              var entryIdx = dateMap[t.entryDate] != null ? dateMap[t.entryDate] : -1;
              if (entryIdx >= 0 && entryIdx < atrArr.length && atrArr[entryIdx] != null) {
                var atr = atrArr[entryIdx];
                if (atr <= p33) regimes.low_vol.push(t);
                else if (atr <= p66) regimes.mid_vol.push(t);
                else regimes.high_vol.push(t);
              }
            });
            ["low_vol", "mid_vol", "high_vol"].forEach(function (regime) {
              var rt = regimes[regime];
              if (rt.length >= 5) {
                regimeBehavior[regime] = {
                  winRate: round2((rt.filter(function (t) { return t.hitTarget; }).length / rt.length) * 100),
                  avgReturn: round2(rt.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / rt.length),
                  n: rt.length
                };
              }
            });
          }
        } catch (e) { console.warn("Regime analysis failed for " + symbol + ":", e.message); }
      }

      // ── 4. Score Distribution ──
      var scoreDist = { mean: 0, std: 0, median: 0 };
      var allScores = trades.map(function (t) { return t.entryScore; }).filter(function (s) { return s != null; });
      if (allScores.length > 5) {
        allScores.sort(function (a, b) { return a - b; });
        var mean = allScores.reduce(function (s, v) { return s + v; }, 0) / allScores.length;
        scoreDist = { mean: round2(mean), std: round2(Math.sqrt(allScores.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / (allScores.length - 1))), median: round2(allScores[Math.floor(allScores.length / 2)]) };
      }

      return {
        symbol: symbol,
        backtestDate: Date.now(),
        backtestVersion: window.__STOX_APP_VERSION || "3.0.24",
        indicatorWeights: indicatorWeights,
        indicatorPowers: indicatorPowers,
        calibration: calibration,
        regimeBehavior: regimeBehavior,
        scoreDistribution: scoreDist,
        tradeStats: {
          totalTrades: stats.totalSignals != null ? stats.totalSignals : trades.length,
          winRate: stats.winRate || 0,
          avgReturn: stats.avgReturnPct || 0,
          avgWin: stats.avgWinPct || 0,
          avgLoss: stats.avgLossPct || 0,
          profitFactor: stats.profitFactor || 0,
          maxConsecWins: stats.maxConsecutiveWins || 0,
          maxConsecLosses: stats.maxConsecutiveLosses || 0,
          avgDaysToTarget: stats.avgDaysToTarget || 0,
          maxDrawdown: stats.maxDrawdown || 0,
          sharpeApprox: stats.sharpeApprox || 0
        },
        pillarConsumption: powerResult && powerResult.pillarConsumption ? powerResult.pillarConsumption : {},
        backtestConfig: { targetProfitPct: targetProfitPct, holdingPeriodDays: holdingPeriodDays, threshold: threshold, slippagePct: slippagePct, brokeragePct: brokeragePct },
        dataQuality: { candleCount: candles ? candles.length : 0, dateRange: candles && candles.length > 1 && candles[0].t != null && candles[candles.length - 1].t != null ? candles[0].t + " to " + candles[candles.length - 1].t : null, timeframe: "daily" }
      };
    }

    /* ── Feature Extraction for ML ──────────────────────────────────────── */

    function extractFeaturesForML(symbol, candles, trades, scoreFn) {
      var features = [];
      if (!candles || candles.length < 100 || !window.TechIndicators) return features;
      var TI = window.TechIndicators;

      try {
        var rsi = TI.rsi(candles, 14);
        var macd = TI.macd(candles, 12, 26, 9);
        var bb = TI.bollingerBands(candles, 20, 2);
        var atr = TI.atr(candles, 14);
        var emaFast = TI.ema(candles, 12);
        var obv = TI.obv(candles);
        var supertrend = TI.supertrend(candles, 10, 3);
        var adx = TI.adx(candles, 14);
        var volSma = TI.sma(TI.volumes(candles), 20);

        var featureDateMap = {};
        candles.forEach(function (c, ci) { var d = String(c.t).slice(0, 10); if (!featureDateMap[d]) featureDateMap[d] = ci; });
        trades.forEach(function (trade) {
          var entryIdx = featureDateMap[trade.entryDate] != null ? featureDateMap[trade.entryDate] : -1;
          if (entryIdx < 0) return;

          var close = candles[entryIdx].c;
          features.push({
            symbol: symbol,
            entryDate: trade.entryDate,
            features: {
              rsi: rsi[entryIdx] != null ? round2(rsi[entryIdx]) : 50,
              macd_hist: macd && macd.histogram ? round3(macd.histogram[entryIdx]) : 0,
              bb_position: (bb.upper && bb.lower) ? round3((close - (bb.lower[entryIdx] || 0)) / Math.max(0.01, (bb.upper[entryIdx] || 0) - (bb.lower[entryIdx] || 0))) : 0.5,
              atr_pct: atr[entryIdx] && close > 0 ? round3((atr[entryIdx] / close) * 100) : 0,
              obv_trend: entryIdx > 0 && obv[entryIdx - 1] ? round3((obv[entryIdx] || 0) / obv[entryIdx - 1]) : 1,
              supertrend_dir: supertrend && supertrend.trend ? supertrend.trend[entryIdx] : 0,
              adx: adx && adx.adx ? round2(adx.adx[entryIdx] || 0) : 0,
              ema_slope: emaFast[entryIdx] != null && emaFast[Math.max(0, entryIdx - 3)] != null ? round3((emaFast[entryIdx] - emaFast[Math.max(0, entryIdx - 3)]) / Math.max(0.01, emaFast[Math.max(0, entryIdx - 3)]) * 100) : 0,
              volume_ratio: volSma && volSma[entryIdx] ? round2(candles[entryIdx].v / Math.max(1, volSma[entryIdx])) : 1,
              entry_score: trade.entryScore || 0
            },
            label: {
              return_10d: round2(trade.finalReturnPct || 0),
              is_winner: !!trade.hitTarget,
              days_to_target: trade.daysToTarget || 0,
              max_profit_pct: round2(trade.maxProfitPct || 0),
              max_loss_pct: round2(trade.maxLossPct || 0),
              prob_touch: trade.probTouch || 0,
              signal: trade.signal || "NEUTRAL"
            }
          });
        });
      } catch (e) {
        console.warn("Feature extraction error for " + symbol + ":", e.message);
      }
      return features;
    }

    /* ── Report Generation ────────────────────────────────────────────────── */

    async function generateReport() {
      if (!window.PatternStore) throw new Error("PatternStore required");
      var patterns = await window.PatternStore.getAll();
      if (patterns.length === 0) return { message: "No patterns stored yet." };

      patterns.sort(function (a, b) { return (b.tradeStats ? b.tradeStats.winRate || 0 : 0) - (a.tradeStats ? a.tradeStats.winRate || 0 : 0); });

      var wrBuckets = { "70+": 0, "60-70": 0, "50-60": 0, "40-50": 0, "<40": 0 };
      patterns.forEach(function (p) {
        var wr = p.tradeStats ? p.tradeStats.winRate : 0;
        if (wr >= 70) wrBuckets["70+"]++;
        else if (wr >= 60) wrBuckets["60-70"]++;
        else if (wr >= 50) wrBuckets["50-60"]++;
        else if (wr >= 40) wrBuckets["40-50"]++;
        else wrBuckets["<40"]++;
      });

      var topIndicators = {};
      patterns.forEach(function (p) {
        if (p.indicatorWeights) {
          var maxW = 0, topComp = "none";
          Object.keys(p.indicatorWeights).forEach(function (c) { if (p.indicatorWeights[c] > maxW) { maxW = p.indicatorWeights[c]; topComp = c; } });
          topIndicators[topComp] = (topIndicators[topComp] || 0) + 1;
        }
      });

      return {
        totalStocks: patterns.length,
        totalTrades: patterns.reduce(function (s, p) { return s + (p.tradeStats ? p.tradeStats.totalTrades || 0 : 0); }, 0),
        avgWinRate: round2(patterns.reduce(function (s, p) { return s + (p.tradeStats ? p.tradeStats.winRate || 0 : 0); }, 0) / patterns.length),
        best: patterns[0] ? { symbol: patterns[0].symbol, winRate: patterns[0].tradeStats ? patterns[0].tradeStats.winRate : 0, trades: patterns[0].tradeStats ? patterns[0].tradeStats.totalTrades : 0 } : null,
        worst: patterns[patterns.length - 1] ? { symbol: patterns[patterns.length - 1].symbol, winRate: patterns[patterns.length - 1].tradeStats ? patterns[patterns.length - 1].tradeStats.winRate : 0 } : null,
        winRateDistribution: wrBuckets,
        topIndicators: topIndicators,
        withCalibration: patterns.filter(function (p) { return p.calibration && p.calibration.global; }).length
      };
    }

    return {
      runBatch: runBatch,
      runBatchFromDataMap: runBatchFromDataMap,
      runSingle: runSingle,
      refreshStale: refreshStale,
      extractPattern: extractPattern,
      extractFeaturesForML: extractFeaturesForML,
      cancel: function () { _cancelled = true; },
      generateReport: generateReport,
      buildScoreFn: buildScoreFn,
      getConfig: function () {
        return { targetProfitPct: targetProfitPct, holdingPeriodDays: holdingPeriodDays, threshold: threshold, slippagePct: slippagePct, brokeragePct: brokeragePct, timeframe: timeframe, range: range, sampleEvery: sampleEvery };
      }
    };
  }

  /* ── Check if OfflineOHLCV has data ── */
  async function checkOfflineAvailable() {
    if (!window.OfflineOHLCV) return false;
    try {
      var meta = await window.OfflineOHLCV.getMeta();
      return meta && meta.count > 0;
    } catch (e) { return false; }
  }

  return { create: create };
})();
