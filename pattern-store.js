/* ══════════════════════════════════════════════════════════════════════════
   Pattern Store — StoX
   IndexedDB-backed per-stock pattern storage for backtest intelligence.
   Stores indicator weights, calibration curves, regime behavior, optimal
   parameters, and trade features extracted from batch backtests.

   Usage:
     await PatternStore.init();
     await PatternStore.put(symbol, pattern);
     const pattern = await PatternStore.get(symbol);
     await PatternStore.delete(symbol);
     const allPatterns = await PatternStore.getAll();
     await PatternStore.putFeatures(symbol, features);  // raw trade features
     const features = await PatternStore.getFeatures(symbol);
     const stats = await PatternStore.getStats();
   ══════════════════════════════════════════════════════════════════════════ */

window.PatternStore = (function () {

  var DB_NAME = "stox_pattern_db";
  var DB_VERSION = 1;

  var STORE_PATTERNS = "patterns";      // per-stock pattern summary
  var STORE_FEATURES = "features";      // raw trade-level features
  var STORE_META = "meta";              // global metadata

  var _db = null;

  /* ── DB Init ──────────────────────────────────────────────────────────── */
  function init() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_PATTERNS)) {
          db.createObjectStore(STORE_PATTERNS, { keyPath: "symbol" });
        }
        if (!db.objectStoreNames.contains(STORE_FEATURES)) {
          db.createObjectStore(STORE_FEATURES, { keyPath: "symbol" });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      };
      req.onsuccess = function (e) {
        _db = e.target.result;
        resolve();
      };
      req.onerror = function (e) {
        reject(e.target.error);
      };
    });
  }

  function _tx(storeName, mode) {
    var tx = _db.transaction(storeName, mode);
    var store = tx.objectStore(storeName);
    return { tx: tx, store: store };
  }

  /* ── Pattern CRUD ─────────────────────────────────────────────────────── */

  /**
   * Store a complete pattern object for a symbol.
   * Pattern structure:
   * {
   *   symbol: string,
   *   backtestDate: number (timestamp),
   *   backtestVersion: string,
   *   indicatorWeights: { trendHealth: 0.32, pullbackQuality: 0.28, prob4: 0.22, swingPotential: 0.18 },
   *   indicatorPowers: { trendHealth: { correlation, infoValue, bucketWinRates }, ... },
   *   calibration: {
   *     global: { calP0, calK, buckets },
   *     stratified: [
   *       { label: 'LOW_DRIFT', driftRange: [0, 0.33], hitRate, avgProbTouch, n },
   *       { label: 'MID_DRIFT', driftRange: [0.33, 0.66], hitRate, avgProbTouch, n },
   *       { label: 'HIGH_DRIFT', driftRange: [0.66, 1.0], hitRate, avgProbTouch, n }
   *     ]
   *   },
   *   regimeBehavior: {
   *     high_vol: { winRate, avgReturn, bestComponents, n },
   *     mid_vol:  { ... },
   *     low_vol:  { ... }
   *   },
   *   optimalPeriods: { rsiPeriod: 14, emaFast: 12, emaSlow: 26, bbPeriod: 20, atrPeriod: 14 },
   *   scoreDistribution: { mean, std, median, skew },
   *   tradeStats: {
   *     totalTrades, winRate, avgReturn, avgWin, avgLoss,
   *     profitFactor, maxConsecWins, maxConsecLosses,
   *     avgDaysToTarget, maxDrawdown, sharpeApprox
   *   },
   *   pillarConsumption: {
   *     trendHealth: { max, touched, atMax, atMaxPct, avg, median },
   *     pullbackQuality: { ... },
   *     prob4: { ... },
   *     swingPotential: { ... }
   *   },
   *   backtestConfig: { targetProfitPct, holdingPeriodDays, threshold, slippagePct, brokeragePct },
   *   dataQuality: { candleCount, dateRange, timeframe }
   * }
   */
  function put(symbol, pattern) {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized. Call init() first.")); return; }
      pattern.symbol = symbol;
      var t = _tx(STORE_PATTERNS, "readwrite");
      t.store.put(pattern);
      t.tx.oncomplete = function () { resolve(); };
      t.tx.onerror = function (e) { reject(e.target.error); };
    });
  }

  function get(symbol) {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_PATTERNS, "readonly");
      var req = t.store.get(symbol);
      req.onsuccess = function (e) { resolve(e.target.result || null); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function getAll() {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_PATTERNS, "readonly");
      var req = t.store.getAll();
      req.onsuccess = function (e) { resolve(e.target.result || []); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function getAllSymbols() {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_PATTERNS, "readonly");
      var req = t.store.getAllKeys();
      req.onsuccess = function (e) { resolve(e.target.result || []); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function deletePattern(symbol) {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_PATTERNS, "readwrite");
      t.store.delete(symbol);
      t.tx.oncomplete = function () { resolve(); };
      t.tx.onerror = function (e) { reject(e.target.error); };
    });
  }

  function clearAll() {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_PATTERNS, "readwrite");
      t.store.clear();
      t.tx.oncomplete = function () { resolve(); };
      t.tx.onerror = function (e) { reject(e.target.error); };
    });
  }

  function clearAllFeatures() {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_FEATURES, "readwrite");
      t.store.clear();
      t.tx.oncomplete = function () { resolve(); };
      t.tx.onerror = function (e) { reject(e.target.error); };
    });
  }

  function clearAllMeta() {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_META, "readwrite");
      t.store.clear();
      t.tx.oncomplete = function () { resolve(); };
      t.tx.onerror = function (e) { reject(e.target.error); };
    });
  }

  /**
   * Clear everything: patterns, features, and metadata.
   */
  async function clearEverything() {
    await clearAll();
    await clearAllFeatures();
    await clearAllMeta();
  }

  /* ── Raw Features Storage (for ML training) ────────────────────────────── */

  /**
   * Store raw per-trade features for ML training.
   * Features array: [
   *   { symbol, features: { rsi, macd_hist, bb_position, atr_pct, obv_trend, ... }, label: { return_10d, is_winner } },
   *   ...
   * ]
   */
  function putFeatures(symbol, features) {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_FEATURES, "readwrite");
      t.store.put({ symbol: symbol, features: features, updatedAt: Date.now() });
      t.tx.oncomplete = function () { resolve(); };
      t.tx.onerror = function (e) { reject(e.target.error); };
    });
  }

  function getFeatures(symbol) {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_FEATURES, "readonly");
      var req = t.store.get(symbol);
      req.onsuccess = function (e) {
        var r = e.target.result;
        resolve(r ? r.features : []);
      };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function getAllFeatures() {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_FEATURES, "readonly");
      var req = t.store.getAll();
      req.onsuccess = function (e) {
        var results = e.target.result || [];
        var all = [];
        results.forEach(function (r) {
          if (r.features && r.features.length) {
            all = all.concat(r.features);
          }
        });
        resolve(all);
      };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  /* ── Global Metadata ───────────────────────────────────────────────────── */

  function getMeta(key) {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_META, "readonly");
      var req = t.store.get(key);
      req.onsuccess = function (e) {
        resolve(e.target.result ? e.target.result.value : null);
      };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function setMeta(key, value) {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var t = _tx(STORE_META, "readwrite");
      t.store.put({ key: key, value: value });
      t.tx.oncomplete = function () { resolve(); };
      t.tx.onerror = function (e) { reject(e.target.error); };
    });
  }

  /* ── Aggregate Stats ───────────────────────────────────────────────────── */

  async function getStats() {
    if (!_db) throw new Error("PatternStore not initialized");
    var patterns = await getAll();
    var totalPatterns = patterns.length;
    var totalTrades = 0;
    var avgWinRate = 0;
    var avgSharpe = 0;
    var withCalibration = 0;
    var oldestPattern = Infinity;
    var newestPattern = 0;

    patterns.forEach(function (p) {
      if (p.tradeStats) {
        totalTrades += p.tradeStats.totalTrades || 0;
        avgWinRate += p.tradeStats.winRate || 0;
        avgSharpe += p.tradeStats.sharpeApprox || 0;
      }
      if (p.calibration && p.calibration.global) withCalibration++;
      if (p.backtestDate) {
        if (p.backtestDate < oldestPattern) oldestPattern = p.backtestDate;
        if (p.backtestDate > newestPattern) newestPattern = p.backtestDate;
      }
    });

    if (totalPatterns > 0) {
      avgWinRate = Math.round((avgWinRate / totalPatterns) * 10) / 10;
      avgSharpe = Math.round((avgSharpe / totalPatterns) * 100) / 100;
    }
    if (oldestPattern === Infinity) { oldestPattern = null; newestPattern = null; }

    return {
      totalPatterns: totalPatterns,
      totalTrades: totalTrades,
      avgWinRate: avgWinRate,
      avgSharpe: avgSharpe,
      withCalibration: withCalibration,
      oldestPattern: oldestPattern,
      newestPattern: newestPattern
    };
  }

  /* ── Pattern Expiry / Refresh ──────────────────────────────────────────── */

  /**
   * Get symbols whose patterns are older than maxAgeMs.
   * Returns array of { symbol, age, backtestDate }.
   */
  async function getStalePatterns(maxAgeMs) {
    maxAgeMs = maxAgeMs || 7 * 24 * 60 * 60 * 1000;  // default 7 days
    var patterns = await getAll();
    var now = Date.now();
    return patterns
      .filter(function (p) {
        return p.backtestDate && (now - p.backtestDate > maxAgeMs);
      })
      .map(function (p) {
        return { symbol: p.symbol, age: now - p.backtestDate, backtestDate: p.backtestDate };
      });
  }

  /**
   * Bulk-put patterns efficiently using a single transaction.
   */
  function putMany(patternArray) {
    return new Promise(function (resolve, reject) {
      if (!_db) { reject(new Error("PatternStore not initialized")); return; }
      var tx = _db.transaction(STORE_PATTERNS, "readwrite");
      var store = tx.objectStore(STORE_PATTERNS);
      patternArray.forEach(function (p) {
        store.put(p);
      });
      tx.oncomplete = function () { resolve(patternArray.length); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
  }

  /* ── Pattern Search / Query ───────────────────────────────────────────── */

  /**
   * Find patterns by criteria. Simple in-memory filter.
   */
  async function query(filter) {
    filter = filter || {};
    var patterns = await getAll();
    return patterns.filter(function (p) {
      if (filter.minWinRate && (!p.tradeStats || p.tradeStats.winRate < filter.minWinRate)) return false;
      if (filter.minTrades && (!p.tradeStats || p.tradeStats.totalTrades < filter.minTrades)) return false;
      if (filter.hasCalibration && (!p.calibration || !p.calibration.global)) return false;
      if (filter.minSharpe && (!p.tradeStats || (p.tradeStats.sharpeApprox || 0) < filter.minSharpe)) return false;
      return true;
    });
  }

  /**
   * Get top N patterns by a metric.
   */
  async function getTopN(metric, n, ascending) {
    metric = metric || "winRate";
    n = n || 20;
    var patterns = await getAll();
    patterns.sort(function (a, b) {
      var va = (a.tradeStats && a.tradeStats[metric]) || 0;
      var vb = (b.tradeStats && b.tradeStats[metric]) || 0;
      return ascending ? va - vb : vb - va;
    });
    return patterns.slice(0, n);
  }

  /**
   * Get aggregate sector-like patterns from correlated stocks.
   * Groups stocks by similarity in indicator weight profiles.
   */
  async function getWeightClusters() {
    var patterns = await getAll();
    var valid = patterns.filter(function (p) {
      return p.indicatorWeights &&
        p.indicatorWeights.trendHealth != null &&
        p.indicatorWeights.pullbackQuality != null;
    });
    if (valid.length < 3) return [];

    // Simple K-means-like clustering by weight vector (4D)
    var clusters = [];
    var MAX_CLUSTERS = Math.min(8, Math.max(2, Math.floor(valid.length / 10)));
    var DIMS = ["trendHealth", "pullbackQuality", "prob4", "swingPotential"];

    // Initialize centroids using first MAX_CLUSTERS patterns
    var centroids = valid.slice(0, MAX_CLUSTERS).map(function (p) {
      return DIMS.map(function (d) { return p.indicatorWeights[d] || 0; });
    });

    for (var iter = 0; iter < 10; iter++) {
      clusters = [];
      for (var i = 0; i < MAX_CLUSTERS; i++) clusters.push([]);

      // Assign to nearest centroid
      valid.forEach(function (p) {
        var vec = DIMS.map(function (d) { return p.indicatorWeights[d] || 0; });
        var bestDist = Infinity, bestIdx = 0;
        centroids.forEach(function (c, ci) {
          var dist = 0;
          for (var j = 0; j < vec.length; j++) {
            dist += (vec[j] - c[j]) * (vec[j] - c[j]);
          }
          if (dist < bestDist) { bestDist = dist; bestIdx = ci; }
        });
        while (clusters.length <= bestIdx) clusters.push([]);
        clusters[bestIdx].push(p.symbol);
      });

      // Update centroids
      centroids = clusters.map(function (members, ci) {
        if (members.length === 0) return centroids[ci];
        var sums = DIMS.map(function () { return 0; });
        members.forEach(function (sym) {
          var p = valid.find(function (v) { return v.symbol === sym; });
          if (!p) return;
          DIMS.forEach(function (d, di) { sums[di] += (p.indicatorWeights[d] || 0); });
        });
        return sums.map(function (s) { return s / members.length; });
      });
    }

    var result = [];
    clusters.forEach(function (members, ci) {
      if (members.length === 0) return;
      var memberPatterns = members.map(function (sym) {
        return valid.find(function (v) { return v.symbol === sym; });
      }).filter(Boolean);
      var avgWR = memberPatterns.length > 0
        ? Math.round(memberPatterns.reduce(function (s, p) { return s + (p.tradeStats ? p.tradeStats.winRate || 0 : 0); }, 0) / memberPatterns.length * 10) / 10
        : 0;
      result.push({
        clusterId: result.length + 1,
        members: members,
        size: members.length,
        centroid: centroids[ci] ? DIMS.reduce(function (o, d, di) { o[d] = Math.round((centroids[ci][di] || 0) * 100) / 100; return o; }, {}) : {},
        avgWinRate: avgWR
      });
    });
    return result;
  }

  /**
   * Export all patterns as JSON string for backup.
   */
  async function exportJSON() {
    var patterns = await getAll();
    var meta = await getStats();
    return JSON.stringify({ version: 1, exportedAt: Date.now(), meta: meta, patterns: patterns }, null, 2);
  }

  /**
   * Import patterns from JSON string.
   */
  async function importJSON(jsonStr) {
    var data = JSON.parse(jsonStr);
    if (!data || !data.patterns) throw new Error("Invalid pattern export format");
    await putMany(data.patterns);
    if (data.meta) {
      await setMeta("importedMeta", data.meta);
    }
    return data.patterns.length;
  }

  /**
   * Get estimated storage size in bytes.
   */
  async function getStorageSize() {
    var patterns = await getAll();
    try {
      var blob = new Blob([JSON.stringify(patterns)]);
      return blob.size;
    } catch (e) {
      return 0;
    }
  }

  /* ── Public API ────────────────────────────────────────────────────────── */
  return {
    init: init,
    put: put,
    get: get,
    getAll: getAll,
    getAllSymbols: getAllSymbols,
    delete: deletePattern,
    clearAll: clearAll,
    clearAllFeatures: clearAllFeatures,
    clearAllMeta: clearAllMeta,
    clearEverything: clearEverything,
    putMany: putMany,
    putFeatures: putFeatures,
    getFeatures: getFeatures,
    getAllFeatures: getAllFeatures,
    getMeta: getMeta,
    setMeta: setMeta,
    getStats: getStats,
    getStalePatterns: getStalePatterns,
    query: query,
    getTopN: getTopN,
    getWeightClusters: getWeightClusters,
    exportJSON: exportJSON,
    importJSON: importJSON,
    getStorageSize: getStorageSize
  };
})();
