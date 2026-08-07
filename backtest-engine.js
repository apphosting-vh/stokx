/* ══════════════════════════════════════════════════════════════════════════
   StoX Backtesting Engine – Fixed & Enhanced
   Tests the 3‑pillar Entry Score against a fixed profit target over a
   holding window. Score‑agnostic – caller injects scoreFn.

   New options (passed to create()):
     realisticEntry   : boolean (default true)  – use next bar open for entry
     realisticExit    : boolean (default true)  – exit at open if gap above target
     slippagePct      : number (default 0.1)   – % slippage on entry/exit
     brokeragePct     : number (default 0.05)  – % brokerage each side
     maxCacheSize     : number (default 5)     – LRU cache size for score results
     errorLogging     : boolean (default true) – store score function errors
   ══════════════════════════════════════════════════════════════════════════ */

window.BacktestEngine = (function () {

  var ROUND2 = function (v) { return Math.round(v * 100) / 100; };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function yieldToUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

  function classifyScore(s) {
    if (s == null) return null;
    var t = null;
    if (window.TechIndicators && window.TechIndicators._scoreConfigClassification) {
      t = window.TechIndicators._scoreConfigClassification;
    } else if (window.TechIndicators && window.TechIndicators.getScoreConfig) {
      t = window.TechIndicators.getScoreConfig().classification;
      window.TechIndicators._scoreConfigClassification = t;
    }
    var sb = t ? t.strongBuy : 80, b = t ? t.buy : 65, wl = t ? t.watchlist : 50, n = t ? t.neutral : 35;
    if (s >= sb) return "STRONG_BUY";
    if (s >= b) return "BUY";
    if (s >= wl) return "WATCHLIST";
    if (s >= n) return "NEUTRAL";
    return "AVOID";
  }

  function maxConsecutive(arr, value) {
    var maxC = 0, cur = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === value) { cur++; if (cur > maxC) maxC = cur; } else cur = 0;
    }
    return maxC;
  }

  function monthlyBreakdown(trades) {
    var months = {};
    trades.forEach(function (t) {
      var m = String(t.entryDate).slice(0, 7);
      if (!months[m]) months[m] = { trades: 0, wins: 0, ret: 0, score: 0 };
      months[m].trades++; months[m].score += t.entryScore;
      if (t.hitTarget) months[m].wins++;
      months[m].ret += t.finalReturnPct;
    });
    return Object.keys(months).map(function (m) {
      var d = months[m];
      return { month: m, trades: d.trades, winRate: d.trades ? Math.round((d.wins / d.trades) * 1000) / 10 : null, avgReturn: d.trades ? Math.round((d.ret / d.trades) * 100) / 100 : null, avgScore: d.trades ? Math.round((d.score / d.trades) * 10) / 10 : null };
    }).sort(function (a, b) { return a.month.localeCompare(b.month); });
  }

  function scoreBrackets(trades) {
    var out = {};
    var ORDER = ["STRONG_BUY", "BUY", "WATCHLIST", "NEUTRAL", "AVOID"];
    var grouped = {};
    trades.forEach(function (t) { (grouped[t.signal] = grouped[t.signal] || []).push(t); });
    ORDER.forEach(function (k) {
      if (!grouped[k] || !grouped[k].length) return;
      var g = grouped[k];
      var wins = g.filter(function (t) { return t.hitTarget; }).length;
      out[k] = {
        trades: g.length,
        winRate: Math.round((wins / g.length) * 1000) / 10,
        avgReturn: Math.round((g.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / g.length) * 100) / 100
      };
    });
    return out;
  }

  // ── Equity curve ──────────────────────────────────────────────────────────
  function computeDrawdown(curve) {
    if (!curve || curve.length < 2) return 0;
    var peak = curve[0].equity;
    var maxDD = 0;
    for (var i = 1; i < curve.length; i++) {
      if (curve[i].equity > peak) peak = curve[i].equity;
      var dd = (peak - curve[i].equity) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return Math.round(maxDD * 100) / 100;
  }

  function approximateSharpe(trades, riskFreeRate) {
    riskFreeRate = riskFreeRate || 0;
    if (!trades || trades.length < 2) return null;
    var returns = trades.map(function (t) { return t.finalReturnPct; });
    var mean = returns.reduce(function (s, r) { return s + r; }, 0) / returns.length;
    var variance = returns.reduce(function (s, r) { return s + (r - mean) * (r - mean); }, 0) / (returns.length - 1);
    var std = Math.sqrt(variance);
    if (std === 0) return null;
    return Math.round(((mean - riskFreeRate) / std) * 100) / 100;
  }

  function equityCurve(trades) {
    if (!trades || !trades.length) return null;
    var sorted = trades.slice().sort(function (a, b) { return a.entryDate.localeCompare(b.entryDate); });
    var curve = [];
    var equity = 100;
    curve.push({ date: sorted[0].entryDate, equity: ROUND2(equity) });
    sorted.forEach(function (t) {
      equity *= (1 + t.finalReturnPct / 100);
      curve.push({ date: t.exitDate, equity: ROUND2(equity), trade: t });
    });
    return {
      curve: curve,
      finalEquity: ROUND2(equity),
      maxDrawdown: computeDrawdown(curve),
      sharpeApprox: approximateSharpe(sorted)
    };
  }

  function calculateStats(trades, symbol) {
    if (!trades.length) {
      return { symbol: symbol, totalSignals: 0, trades: [], message: "No trade signals generated" };
    }
    var n = trades.length;
    var wins = trades.filter(function (t) { return t.hitTarget; });
    var losses = trades.filter(function (t) { return !t.hitTarget; });
    var winRate = (wins.length / n) * 100;
    var avgReturn = trades.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / n;
    var avgWin = wins.length ? wins.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / wins.length : 0;
    var avgLoss = losses.length ? losses.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / losses.length : 0;
    var avgDays = wins.length ? wins.reduce(function (s, t) { return s + (t.daysToTarget || 0); }, 0) / wins.length : null;
    var grossProfit = trades.filter(function (t) { return t.finalReturnPct > 0; }).reduce(function (s, t) { return s + t.finalReturnPct; }, 0);
    var grossLoss = Math.abs(trades.filter(function (t) { return t.finalReturnPct < 0; }).reduce(function (s, t) { return s + t.finalReturnPct; }, 0));
    var profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
    var eq = equityCurve(trades);
    return {
      symbol: symbol,
      totalSignals: n,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: Math.round(winRate * 10) / 10,
      avgReturnPct: Math.round(avgReturn * 100) / 100,
      avgWinPct: Math.round(avgWin * 100) / 100,
      avgLossPct: Math.round(avgLoss * 100) / 100,
      avgDaysToTarget: avgDays != null ? Math.round(avgDays * 10) / 10 : null,
      profitFactor: profitFactor === Infinity ? "∞" : Math.round(profitFactor * 100) / 100,
      maxConsecutiveWins: maxConsecutive(trades.map(function (t) { return t.hitTarget; }), true),
      maxConsecutiveLosses: maxConsecutive(trades.map(function (t) { return t.hitTarget; }), false),
      scoreBrackets: scoreBrackets(trades),
      monthlyBreakdown: monthlyBreakdown(trades),
      equityCurve: eq,
      finalEquity: eq ? eq.finalEquity : null,
      maxDrawdown: eq ? eq.maxDrawdown : null,
      sharpeApprox: eq ? eq.sharpeApprox : null,
      trades: trades.slice().sort(function (a, b) { return String(b.entryDate).localeCompare(String(a.entryDate)); })
    };
  }

  function create(cfg) {
    cfg = cfg || {};
    var scoreFn = cfg.scoreFn || null;
    var targetProfitPct = cfg.targetProfitPct != null ? cfg.targetProfitPct : 4.0;
    var holdingPeriodDays = cfg.holdingPeriodDays != null ? cfg.holdingPeriodDays : 14;
    var threshold = cfg.threshold != null ? cfg.threshold : 65;
    var warmup = cfg.warmup != null ? cfg.warmup : 60;
    var multiTFMap = cfg.multiTFMap || null;
    var indexCandles = cfg.indexCandles || null;

    // New config options
    var realisticEntry = cfg.realisticEntry !== undefined ? cfg.realisticEntry : true;
    var realisticExit = cfg.realisticExit !== undefined ? cfg.realisticExit : true;
    var slippagePct = cfg.slippagePct != null ? cfg.slippagePct : 0.1;       // 0.1% default
    var brokeragePct = cfg.brokeragePct != null ? cfg.brokeragePct : 0.05;    // 0.05% default
    var maxCacheSize = cfg.maxCacheSize != null ? cfg.maxCacheSize : 5;
    var errorLogging = cfg.errorLogging !== undefined ? cfg.errorLogging : true;

    var scoreCache = new Map();
    var cacheOrder = [];
    var scoreErrors = [];

    function getCacheKey(candles, symbol) {
      if (!candles || candles.length === 0) return null;
      // Use symbol if available, else a fingerprint (first/last dates + length)
      var sym = symbol || candles._symbol || '';
      if (!sym) {
        // fallback: combine first and last timestamps with length
        var first = candles[0] ? candles[0].t : 0;
        var last = candles[candles.length-1] ? candles[candles.length-1].t : 0;
        sym = first + '_' + last + '_' + candles.length;
      }
      return sym + '_' + threshold + '_' + targetProfitPct + '_' + holdingPeriodDays;
    }

    function scoreAt(candles, idx, symbol) {
      var key = getCacheKey(candles, symbol);
      if (key) {
        var per = scoreCache.get(key);
        if (per && per.has(idx)) return per.get(idx);
      }

      var res = null;
      if (scoreFn) {
        try {
          res = scoreFn(candles, idx, symbol);
        } catch (e) {
          if (errorLogging) {
            scoreErrors.push({ idx: idx, symbol: symbol || candles._symbol || '', msg: e.message, stack: e.stack });
          }
          res = null;
        }
      }
      if (res && (res.entryScore == null || isNaN(res.entryScore))) res = null;

      if (key) {
        if (!per) {
          // Evict oldest if cache is full
          if (scoreCache.size >= maxCacheSize) {
            var oldest = cacheOrder.shift();
            scoreCache.delete(oldest);
          }
          per = new Map();
          scoreCache.set(key, per);
          cacheOrder.push(key);
        }
        per.set(idx, res);
      }
      return res;
    }

    function simulateTrade(candles, entryIdx, score, opts) {
      opts = opts || {};
      var useRealisticEntry = opts.realisticEntry !== undefined ? opts.realisticEntry : realisticEntry;
      var useRealisticExit = opts.realisticExit !== undefined ? opts.realisticExit : realisticExit;
      var slip = opts.slippagePct != null ? opts.slippagePct : slippagePct;
      var broker = opts.brokeragePct != null ? opts.brokeragePct : brokeragePct;

      var entryPrice, entryDateIdx;
      if (useRealisticEntry && entryIdx + 1 < candles.length) {
        entryPrice = candles[entryIdx + 1].o;
        entryDateIdx = entryIdx + 1;
      } else {
        entryPrice = candles[entryIdx].c;
        entryDateIdx = entryIdx;
      }

      var entryPriceAdj = entryPrice * (1 + slip / 100);
      // Exact target: raw price level that yields targetProfitPct net after exit slippage + brokerage
      // exitProceeds = targetPrice * (1 - slip/100) * (1 - broker/100) = entryPriceAdj * (1 + targetProfitPct/100)
      var exitCostFactor = (1 - slip / 100) * (1 - broker / 100);
      var targetPrice = entryPriceAdj * (1 + targetProfitPct / 100) / exitCostFactor;

      var entryDate = String(candles[entryDateIdx].t).slice(0, 10);
      var hitTarget = false, daysToTarget = null, exitPrice = entryPriceAdj, exitDate = entryDate;
      var maxProfitPct = 0, maxLossPct = 0;
      var maxHolding = Math.min(holdingPeriodDays, candles.length - entryDateIdx - 1);

      for (var j = 1; j <= maxHolding; j++) {
        var cur = candles[entryDateIdx + j];
        var prevClose = candles[entryDateIdx + j - 1].c;

        if (useRealisticExit) {
          // Check gap open above target
          if (cur.o >= targetPrice) {
            hitTarget = true;
            daysToTarget = j;
            exitDate = String(cur.t).slice(0, 10);
            exitPrice = cur.o * (1 - slip / 100) * (1 - broker / 100);
            break;
          }
          // Normal intraday hit
          if (cur.h >= targetPrice) {
            hitTarget = true;
            daysToTarget = j;
            exitDate = String(cur.t).slice(0, 10);
            exitPrice = targetPrice * (1 - slip / 100) * (1 - broker / 100);
            break;
          }
        } else {
          // Original optimistic: exit at target high without costs
          if (cur.h >= targetPrice) {
            hitTarget = true;
            daysToTarget = j;
            exitDate = String(cur.t).slice(0, 10);
            exitPrice = targetPrice;
            break;
          }
        }
        // Track max profit/loss before exit (based on close, adjusted for costs)
        var pnl = (cur.c - entryPriceAdj) / entryPriceAdj * 100;
        if (pnl > maxProfitPct) maxProfitPct = pnl;
        if (pnl < maxLossPct) maxLossPct = pnl;

        if (j === maxHolding) {
          exitPrice = cur.c * (1 - slip / 100) * (1 - broker / 100);
          exitDate = String(cur.t).slice(0, 10);
        }
      }

      // Final return after all costs
      var finalReturn = (exitPrice - entryPriceAdj) / entryPriceAdj * 100;
      // If exit price is not set (shouldn't happen), fallback
      if (exitPrice === undefined) exitPrice = entryPriceAdj;

      return {
        symbol: score.symbol || "",
        entryDate: entryDate,
        exitDate: exitDate,
        entryPrice: ROUND2(entryPrice),
        exitPrice: ROUND2(exitPrice),
        entryScore: ROUND2(score.entryScore),
        signal: score.classification || classifyScore(score.entryScore),
        targetPrice: ROUND2(targetPrice),
        hitTarget: hitTarget,
        daysToTarget: daysToTarget,
        finalReturnPct: ROUND2(finalReturn),
        maxProfitPct: ROUND2(maxProfitPct),
        maxLossPct: ROUND2(maxLossPct),
        trendScore: score.trendHealth != null ? ROUND2(score.trendHealth) : null,
        pullbackScore: score.pullbackQuality != null ? ROUND2(score.pullbackQuality) : null,
        probabilityScore: score.prob4 != null ? ROUND2(score.prob4) : null,
        modifiers: score.modifiers != null ? ROUND2(score.modifiers) : null
      };
    }

    /* Compute Conf10D probTouch for a given bar — slices hourly/daily to the
       bar's timestamp (no lookahead) and calls computeHorizonConfidence. */
    function conf10dAt(candles, idx, symbol) {
      if (!multiTFMap || !symbol) return null;
      var tfData = multiTFMap[symbol];
      if (!tfData || !tfData.hourly || tfData.hourly.length < 60) return null;
      var bar = candles[idx];
      if (!bar) return null;
      var ts = bar.t;
      function sliceBefore(arr) {
        if (!arr) return null;
        var fi = arr.findIndex(function(b) { return b.t > ts; });
        return arr.slice(0, fi === -1 ? arr.length : fi);
      }
      var hSlice = sliceBefore(tfData.hourly);
      var dSlice = sliceBefore(tfData.daily);
      if (!hSlice || hSlice.length < 60) return null;
      var idxSlice = null;
      if (indexCandles && indexCandles.length && ts != null) {
        var lo = 0, hi = indexCandles.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (indexCandles[mid].t <= ts) lo = mid + 1; else hi = mid; }
        if (lo > 0) idxSlice = indexCandles.slice(0, lo);
      }
      try {
        var scoreObj = scoreAt(candles, idx, symbol);
        var entryScoreCtx = scoreObj ? { trendHealth: scoreObj.trendHealth, pullbackQuality: scoreObj.pullbackQuality, prob4: scoreObj.prob4, entryScore: scoreObj.entryScore } : null;
        var _hd = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().horizonDays || 10) : 10;
        var cfg = { horizonDays: _hd, windowSessions: 40, entry_price: bar.c, targetPct: targetProfitPct, indexCandles: idxSlice, entryScoreContext: entryScoreCtx };
        var res = window.TechIndicators.computeHorizonConfidence(hSlice, dSlice, cfg);
        if (res && res.components && res.components.probTouch != null) return { probTouch: res.components.probTouch / 100, confLog: res.confidenceLognormal != null ? res.confidenceLognormal / 100 : null, confEmp: res.confidenceEmpirical != null ? res.confidenceEmpirical / 100 : null };
      } catch (e) {}
      return null;
    }

    function collectTrades(candles, startIdx, endIdx, opts, onBar) {
      opts = opts || {};
      var t = [];
      var sc = [];
      var step = opts.sampleEvery || 1;
      var skip = opts.skipBars || {};
      var symbol = opts.symbol || candles._symbol || '';
      var minTH = opts.minTrendHealth != null ? opts.minTrendHealth : -Infinity;
      var minPQ = opts.minPullbackQuality != null ? opts.minPullbackQuality : -Infinity;
      var minP4 = opts.minProb4 != null ? opts.minProb4 : -Infinity;
      var minRaw = opts.minRawScore != null ? opts.minRawScore : -Infinity;
      for (var i = startIdx; i <= endIdx; i++) {
        if (skip[i]) { if (onBar) onBar(i - startIdx + 1, endIdx - startIdx + 1); continue; }
        if ((i - startIdx) % step !== 0) { if (onBar) onBar(i - startIdx + 1, endIdx - startIdx + 1); continue; }
        var r = scoreAt(candles, i, symbol);
        if (r && r.entryScore != null) {
          sc.push(r);
          if (r.entryScore >= threshold
              && (r.trendHealth == null || r.trendHealth >= minTH)
              && (r.pullbackQuality == null || r.pullbackQuality >= minPQ)
              && (r.prob4 == null || r.prob4 >= minP4)
              && (r.raw_score == null || r.raw_score >= minRaw)) {
            var trade = simulateTrade(candles, i, r, opts);
            trade.symbol = symbol;
            trade.entryScore = r.entryScore;
            var c10 = conf10dAt(candles, i, symbol);
            trade.probTouch = c10 ? c10.probTouch : null;
            trade.confLog = c10 ? c10.confLog : null;
            trade.confEmp = c10 ? c10.confEmp : null;
            t.push(trade);
          }
        }
        if (onBar) onBar(i - startIdx + 1, endIdx - startIdx + 1);
      }
      return { trades: t, scored: sc };
    }

    function liftBuckets(scored) {
      var ORDER = ["STRONG_BUY", "BUY", "WATCHLIST", "NEUTRAL", "AVOID"];
      var grouped = {};
      scored.forEach(function (r) { (grouped[r.classification || classifyScore(r.entryScore)] = grouped[r.classification || classifyScore(r.entryScore)] || []).push(r); });
      return ORDER.map(function (k) {
        var g = grouped[k];
        if (!g || !g.length) return { bucket: k, n: 0, winRate: null, avgReturn: null };
        var wins = g.filter(function (r) { return r.hit; }).length;
        return {
          bucket: k, n: g.length,
          winRate: Math.round((wins / g.length) * 1000) / 10,
          avgReturn: Math.round((g.reduce(function (s, r) { return s + (r.fwdReturn != null ? r.fwdReturn : 0); }, 0) / g.length) * 100) / 100
        };
      });
    }

    function liftOnScored(scored) {
      return scored.map(function (r) {
        return { entryScore: r.entryScore, classification: r.classification, hit: r.hit, fwdReturn: r.fwdReturn };
      });
    }

    /* ── Confidence calibration: bucket probTouch into deciles, compute
       empirical hit rates, derive calP0 (50% crossover) and calK (slope). */
    function calibrateConfidence(trades) {
      var withPT = trades.filter(function(t) { return t.probTouch != null && !isNaN(t.probTouch); });
      var MIN_TOTAL = 50;
      var TARGET_PER_BUCKET = 15;
      var MIN_BUCKETS = 3;
      var MAX_BUCKETS = 10;
      if (withPT.length < MIN_TOTAL) return null;
      var bucketCount = Math.max(MIN_BUCKETS, Math.min(MAX_BUCKETS, Math.floor(withPT.length / TARGET_PER_BUCKET)));
      var sorted = withPT.slice().sort(function(a, b) { return a.probTouch - b.probTouch; });
      var bucketSize = Math.floor(sorted.length / bucketCount);
      if (bucketSize < 3) { bucketCount = Math.floor(sorted.length / 3); if (bucketCount < MIN_BUCKETS) return null; bucketSize = Math.floor(sorted.length / bucketCount); }
      var buckets = [];
      for (var i = 0; i < bucketCount; i++) {
        var start = i * bucketSize;
        var end = i === bucketCount - 1 ? sorted.length : start + bucketSize;
        var group = sorted.slice(start, end);
        if (group.length < 3) continue;
        var hits = group.filter(function(t) { return t.hitTarget; }).length;
        var avgPT = group.reduce(function(s, t) { return s + t.probTouch; }, 0) / group.length;
        buckets.push({
          decile: i + 1,
          probTouchRange: [Math.round(group[0].probTouch * 100) / 100, Math.round(group[group.length - 1].probTouch * 100) / 100],
          avgProbTouch: Math.round(avgPT * 100) / 100,
          n: group.length,
          hitRate: Math.round((hits / group.length) * 1000) / 10,
          hits: hits,
          misses: group.length - hits
        });
      }
      if (buckets.length < 3) return null;
      var calP0 = null, calK = null;
      for (var j = 1; j < buckets.length; j++) {
        if (buckets[j - 1].hitRate < 50 && buckets[j].hitRate >= 50) {
          var prev = buckets[j - 1], curr = buckets[j];
          var frac = (50 - prev.hitRate) / (curr.hitRate - prev.hitRate);
          calP0 = Math.round((prev.avgProbTouch + frac * (curr.avgProbTouch - prev.avgProbTouch)) * 1000) / 1000;
          break;
        }
      }
      if (calP0 == null) {
        if (buckets[buckets.length - 1].hitRate < 50) calP0 = buckets[buckets.length - 1].avgProbTouch;
        else if (buckets[0].hitRate >= 50) calP0 = buckets[0].avgProbTouch;
        else calP0 = 0.38;
      }
      var pts = buckets.map(function(b) { return { x: b.avgProbTouch, y: b.hitRate / 100 }; });
      var n = pts.length;
      if (n >= 3) {
        var sx = 0, sy = 0, sxy = 0, sx2 = 0;
        for (var k = 0; k < n; k++) { sx += pts[k].x; sy += pts[k].y; sxy += pts[k].x * pts[k].y; sx2 += pts[k].x * pts[k].x; }
        var denom = n * sx2 - sx * sx;
        if (Math.abs(denom) > 1e-10) {
          var slope = (n * sxy - sx * sy) / denom;
          var intercept = (sy - slope * sx) / n;
          var pAt50 = slope > 0 ? (0.5 - intercept) / slope : calP0;
          if (pAt50 > 0.05 && pAt50 < 0.95 && Math.abs(slope) > 0.5) calP0 = Math.round(pAt50 * 1000) / 1000;
        }
      }
      if (calP0 > 0 && calP0 < 1) {
        var logitPts = buckets.filter(function(b) { return b.hitRate > 1 && b.hitRate < 99 && b.avgProbTouch > 0.01 && b.avgProbTouch < 0.99; })
          .map(function(b) {
            var lx = Math.log(b.avgProbTouch / (1 - b.avgProbTouch));
            var ly = Math.log(b.hitRate / 100 / (1 - b.hitRate / 100));
            return { x: lx, y: ly };
          });
        if (logitPts.length >= 3) {
          var lsx = 0, lsy = 0, lsxy = 0, lsx2 = 0;
          for (var k = 0; k < logitPts.length; k++) {
            lsx += logitPts[k].x; lsy += logitPts[k].y;
            lsxy += logitPts[k].x * logitPts[k].y; lsx2 += logitPts[k].x * logitPts[k].x;
          }
          var lDenom = logitPts.length * lsx2 - lsx * lsx;
          if (Math.abs(lDenom) > 1e-10) {
            var logitSlope = (logitPts.length * lsxy - lsx * lsy) / lDenom;
            calK = Math.max(5, Math.min(100, Math.round(logitSlope * 100) / 100));
          }
        }
      }
      if (calK == null || calK <= 0) calK = 38;
      return { buckets: buckets, calP0: calP0, calK: calK, n: withPT.length };
    }

    async function runSingle(candles, opts, hooks) {
      opts = opts || {};
      hooks = hooks || {};
      var symbol = opts.symbol || "";
      if (!candles || candles.length < warmup + 2) {
        return { symbol: symbol, error: "Need at least " + (warmup + 2) + " candles for backtesting" };
      }
      candles._symbol = symbol;

      var L = candles.length;
      var endIdx = Math.min(L - 1, L - holdingPeriodDays - 1);
      var startIdx = Math.min(warmup, endIdx);
      if (endIdx < startIdx) {
        return { symbol: symbol, error: "Not enough forward data for a " + holdingPeriodDays + "-day hold" };
      }
      var step = opts.sampleEvery || 1;
      var scoredBars = 0, totalBars = endIdx - startIdx + 1;
      var trades = [], scored = [];
      var minTH = opts.minTrendHealth != null ? opts.minTrendHealth : -Infinity;
      var minPQ = opts.minPullbackQuality != null ? opts.minPullbackQuality : -Infinity;
      var minP4 = opts.minProb4 != null ? opts.minProb4 : -Infinity;
      var minRaw = opts.minRawScore != null ? opts.minRawScore : -Infinity;
      for (var i = startIdx; i <= endIdx; i++) {
        if ((i - startIdx) % step === 0) {
          var r = scoreAt(candles, i, symbol);
          if (r && r.entryScore != null) {
            var fwd = simulateTrade(candles, i, r, opts);
            r._idx = i;
            r.hit = fwd.hitTarget;
            r.fwdReturn = fwd.finalReturnPct;
            scored.push(r);
            scoredBars++;
            if (r.entryScore >= threshold
                && (r.trendHealth == null || r.trendHealth >= minTH)
                && (r.pullbackQuality == null || r.pullbackQuality >= minPQ)
                && (r.prob4 == null || r.prob4 >= minP4)
                && (r.raw_score == null || r.raw_score >= minRaw)) {
              fwd.symbol = symbol;
              var c10 = conf10dAt(candles, i, symbol);
              fwd.probTouch = c10 ? c10.probTouch : null;
              fwd.confLog = c10 ? c10.confLog : null;
              fwd.confEmp = c10 ? c10.confEmp : null;
              trades.push(fwd);
            }
          }
        }
        if (hooks.onBar && (i - startIdx) % 25 === 0) {
          hooks.onBar(i - startIdx + 1, totalBars);
          await yieldToUI();
        }
      }
      var stats = calculateStats(trades, symbol);
      stats.lift = liftBuckets(liftOnScored(scored));
      var calibration = calibrateConfidence(trades);
      var currentScore = null;
      if (L >= warmup) {
        var cur = scoreAt(candles, L - 1, symbol);
        if (cur) currentScore = { entryScore: ROUND2(cur.entryScore), classification: cur.classification || classifyScore(cur.entryScore), rawScore: cur.raw_score != null ? ROUND2(cur.raw_score) : null, trendHealth: cur.trendHealth != null ? ROUND2(cur.trendHealth) : null, pullbackQuality: cur.pullbackQuality != null ? ROUND2(cur.pullbackQuality) : null, prob4: cur.prob4 != null ? ROUND2(cur.prob4) : null, modifiers: cur.modifiers != null ? ROUND2(cur.modifiers) : null };
      }
      return {
        symbol: symbol,
        targetProfitPct: targetProfitPct,
        holdingPeriodDays: holdingPeriodDays,
        threshold: threshold,
        currentScore: currentScore,
        stats: stats,
        calibration: calibration,
        rangeStart: candles[startIdx] ? String(candles[startIdx].t).slice(0, 10) : null,
        rangeEnd: candles[endIdx] ? String(candles[endIdx].t).slice(0, 10) : null,
        sampledEvery: step > 1 ? step : null,
        totalScoredBars: scoredBars
      };
    }

    async function runWalkForward(candles, opts, hooks) {
      opts = opts || {};
      hooks = hooks || {};
      var symbol = opts.symbol || "";
      var numFolds = opts.folds || 4;
      var minInSample = opts.minInSample != null ? opts.minInSample : 180;
      var sampleEvery = opts.sampleEvery || 1;
      if (!candles || candles.length < warmup + holdingPeriodDays + 20) {
        return { symbol: symbol, error: "Not enough history for walk-forward (need ~" + (warmup + holdingPeriodDays + 20) + " candles)" };
      }
      candles._symbol = symbol;

      var L = candles.length;
      var matureEnd = L - holdingPeriodDays - 1;
      var regionStart = Math.min(warmup, matureEnd);
      var regionLen = matureEnd - regionStart + 1;

      // Anchored walk-forward: growing in-sample
      var folds = [];
      for (var f = 0; f < numFolds; f++) {
        var splitPoint = regionStart + Math.floor(regionLen * (f + 1) / numFolds);
        var testStart = splitPoint;
        var testEnd = Math.min(testStart + Math.floor(regionLen / numFolds) - 1, matureEnd);
        if (testStart > matureEnd) break;
        var inSampleStart = regionStart;
        var inSampleEnd = testStart - 1;

        var oos = collectTrades(candles, testStart, testEnd, { symbol: symbol, sampleEvery: sampleEvery });
        var ins = inSampleEnd >= inSampleStart
          ? collectTrades(candles, inSampleStart, inSampleEnd, { symbol: symbol, sampleEvery: sampleEvery })
          : { trades: [], scored: [] };

        var oosStats = calculateStats(oos.trades, symbol);
        var isStats = calculateStats(ins.trades, symbol);

        var oosCount = 0;
        for (var b = testStart; b <= testEnd; b++) { if (b % sampleEvery === 0) oosCount++; }

        folds.push({
          fold: f + 1,
          period: [String(candles[testStart].t).slice(0, 10), String(candles[testEnd].t).slice(0, 10)],
          inSampleBars: inSampleEnd - inSampleStart + 1,
          oosScoredBars: oosCount,
          inSample: { totalSignals: isStats.totalSignals, winRate: isStats.totalSignals ? isStats.winRate : null, avgReturnPct: isStats.totalSignals ? isStats.avgReturnPct : null, profitFactor: isStats.totalSignals ? isStats.profitFactor : null },
          oos: { totalSignals: oosStats.totalSignals, winRate: oosStats.totalSignals ? oosStats.winRate : null, avgReturnPct: oosStats.totalSignals ? oosStats.avgReturnPct : null, profitFactor: oosStats.totalSignals ? oosStats.profitFactor : null, winningTrades: oosStats.winningTrades, losingTrades: oosStats.losingTrades },
          _oosTrades: oos.trades
        });

        if (hooks.onFold) {
          hooks.onFold(f + 1, folds.length);
          await yieldToUI();
        }
      }

      var withSignals = folds.filter(function (fl) { return fl.oos.totalSignals > 0; });
      var oosTradesAll = withSignals.map(function (fl) {
        return { n: fl.oos.totalSignals, wins: fl.oos.winningTrades, avgReturn: fl.oos.avgReturnPct };
      });
      var totalOosSignals = oosTradesAll.reduce(function (s, t) { return s + t.n; }, 0);
      var totalOosWins = oosTradesAll.reduce(function (s, t) { return s + t.wins; }, 0);
      var agg = {
        folds: folds.length,
        foldsWithSignals: withSignals.length,
        totalOosSignals: totalOosSignals,
        totalOosWins: totalOosWins,
        overallWinRate: totalOosSignals
          ? Math.round((totalOosWins / totalOosSignals) * 1000) / 10
          : null,
        avgFoldWinRate: withSignals.length ? Math.round(withSignals.reduce(function (s, fl) { return s + fl.oos.winRate; }, 0) / withSignals.length * 10) / 10 : null,
        avgOosReturn: withSignals.length ? Math.round(withSignals.reduce(function (s, fl) { return s + fl.oos.avgReturnPct; }, 0) / withSignals.length * 100) / 100 : null,
        positiveFolds: withSignals.filter(function (fl) { return fl.oos.avgReturnPct > 0; }).length,
        consistency: withSignals.length ? Math.round((withSignals.filter(function (fl) { return fl.oos.winRate >= 40; }).length / withSignals.length) * 1000) / 10 : null,
        avgTrainTestGap: null
      };
      var gapFolds = withSignals.filter(function (fl) { return fl.inSample.winRate != null && fl.oos.winRate != null; });
      if (gapFolds.length) {
        agg.avgTrainTestGap = Math.round((gapFolds.reduce(function (s, fl) { return s + (fl.oos.winRate - fl.inSample.winRate); }, 0) / gapFolds.length) * 10) / 10;
      }
      agg.verdict = buildWalkForwardVerdict(agg);

      var allOosTrades = [];
      folds.forEach(function(fl) { if (fl._oosTrades) allOosTrades = allOosTrades.concat(fl._oosTrades); });
      var calibration = calibrateConfidence(allOosTrades);

      return { symbol: symbol, folds: folds, aggregate: agg, threshold: threshold, targetProfitPct: targetProfitPct, holdingPeriodDays: holdingPeriodDays, calibration: calibration };
    }

    function buildWalkForwardVerdict(agg) {
      if (!agg.totalOosSignals) return "No out-of-sample signals generated — try a lower threshold or longer history.";
      var parts = [];
      parts.push("Out-of-sample win rate " + (agg.overallWinRate != null ? agg.overallWinRate + "%" : "—") + " across " + agg.totalOosSignals + " signals in " + agg.folds + " folds (" + agg.foldsWithSignals + " with signals).");
      if (agg.consistency != null) {
        parts.push(agg.consistency >= 60
          ? "The edge held in " + agg.consistency + "% of folds — consistent across regimes."
          : "The edge held in only " + agg.consistency + "% of folds — regime-dependent.");
      }
      if (agg.avgTrainTestGap != null) {
        parts.push(agg.avgTrainTestGap > -10
          ? "Out-of-sample win rate tracks in-sample (" + (agg.avgTrainTestGap >= 0 ? "+" : "") + agg.avgTrainTestGap + "pts avg gap) — little sign of overfit."
          : "Out-of-sample lags in-sample by " + agg.avgTrainTestGap + "pts — some degradation out-of-sample.");
      }
      return parts.join(" ");
    }

    async function runBatch(dataMap, opts, hooks) {
      opts = opts || {};
      hooks = hooks || {};
      var results = [];
      var symbols = opts.symbols || Object.keys(dataMap || {});
      var total = symbols.length;
      for (var i = 0; i < symbols.length; i++) {
        var sym = symbols[i];
        var candles = dataMap[sym];
        if (!candles || candles.length < warmup + 2) {
          results.push({ symbol: sym, error: "insufficient data" });
        } else {
          try {
            var single = await runSingle(candles, Object.assign({}, opts, { symbol: sym }));
            if (single.error) results.push({ symbol: sym, error: single.error });
            else {
              var trades = single.stats.trades || [];
              var avgTrend = null, avgPullback = null, avgProb4 = null, avgHoldDays = null, avgConfLog = null, avgConfEmp = null, avgEntryScore = null;
              if (trades.length > 0) {
                var tSum = 0, pSum = 0, prSum = 0, tN = 0, pN = 0, prN = 0, hSum = 0, hN = 0, clSum = 0, ceSum = 0, clN = 0, ceN = 0, esSum = 0, esN = 0;
                for (var ti = 0; ti < trades.length; ti++) {
                  if (trades[ti].trendScore != null) { tSum += trades[ti].trendScore; tN++; }
                  if (trades[ti].pullbackScore != null) { pSum += trades[ti].pullbackScore; pN++; }
                  if (trades[ti].probabilityScore != null) { prSum += trades[ti].probabilityScore; prN++; }
                  var hd = trades[ti].daysToTarget != null ? trades[ti].daysToTarget : holdingPeriodDays;
                  hSum += hd; hN++;
                  if (trades[ti].confLog != null) { clSum += trades[ti].confLog; clN++; }
                  if (trades[ti].confEmp != null) { ceSum += trades[ti].confEmp; ceN++; }
                  if (trades[ti].entryScore != null) { esSum += trades[ti].entryScore; esN++; }
                }
                avgTrend = tN > 0 ? Math.round(tSum / tN * 10) / 10 : null;
                avgPullback = pN > 0 ? Math.round(pSum / pN * 10) / 10 : null;
                avgProb4 = prN > 0 ? Math.round(prSum / prN * 10) / 10 : null;
                avgHoldDays = hN > 0 ? Math.round(hSum / hN * 10) / 10 : null;
                avgConfLog = clN > 0 ? Math.round(clSum / clN * 10) / 10 : null;
                avgConfEmp = ceN > 0 ? Math.round(ceSum / ceN * 10) / 10 : null;
                avgEntryScore = esN > 0 ? Math.round(esSum / esN * 10) / 10 : null;
              }
              results.push({ symbol: sym, totalSignals: single.stats.totalSignals, winRate: single.stats.totalSignals ? single.stats.winRate : null, avgReturnPct: single.stats.totalSignals ? single.stats.avgReturnPct : null, profitFactor: single.stats.totalSignals ? single.stats.profitFactor : null, winningTrades: single.stats.totalSignals ? single.stats.winningTrades : 0, losingTrades: single.stats.totalSignals ? single.stats.losingTrades : 0, scoreBrackets: single.stats.totalSignals ? single.stats.scoreBrackets : null, avgTrend: avgTrend, avgPullback: avgPullback, avgProb4: avgProb4, avgHoldDays: avgHoldDays, avgConfLog: avgConfLog, avgConfEmp: avgConfEmp, avgEntryScore: avgEntryScore, detail: single });
            }
          } catch (e) {
            results.push({ symbol: sym, error: (e && e.message) || String(e) });
          }
        }
        if (hooks.onSymbol) {
          hooks.onSymbol(i + 1, total);
          await yieldToUI();
        }
      }
      var summary = batchSummary(results);
      var ranked = results.filter(function (r) { return !r.error && r.totalSignals > 0; })
        .sort(function (a, b) { return b.winRate - a.winRate; });
      return { results: ranked, allResults: results, summary: summary };
    }

    function batchSummary(results) {
      var valid = results.filter(function (r) { return !r.error && r.totalSignals > 0; });
      if (!valid.length) return { message: "No valid results" };
      var totalSignals = valid.reduce(function (s, r) { return s + r.totalSignals; }, 0);
      var totalWins = valid.reduce(function (s, r) { return s + r.winningTrades; }, 0);
      var pfSum = 0, pfN = 0;
      valid.forEach(function (r) { if (typeof r.profitFactor === "number") { pfSum += r.profitFactor; pfN++; } });
      var byWinRate = valid.slice().sort(function (a, b) { return b.winRate - a.winRate; });
      var byReturn = valid.slice().sort(function (a, b) { return b.avgReturnPct - a.avgReturnPct; });
      return {
        symbolsTested: results.length,
        symbolsWithSignals: valid.length,
        symbolsNoSignals: results.length - valid.length,
        totalSignals: totalSignals,
        totalWins: totalWins,
        overallWinRate: totalSignals ? Math.round((totalWins / totalSignals) * 1000) / 10 : null,
        avgWinRate: Math.round(valid.reduce(function (s, r) { return s + r.winRate; }, 0) / valid.length * 10) / 10,
        avgReturn: Math.round(valid.reduce(function (s, r) { return s + r.avgReturnPct * r.totalSignals; }, 0) / totalSignals * 100) / 100,
        avgProfitFactor: pfN ? Math.round(pfSum / pfN * 100) / 100 : null,
        bestByWinRate: byWinRate.length ? byWinRate[0].symbol : null,
        bestWinRate: byWinRate.length ? byWinRate[0].winRate : null,
        worstByWinRate: byWinRate.length ? byWinRate[byWinRate.length - 1].symbol : null,
        worstWinRate: byWinRate.length ? byWinRate[byWinRate.length - 1].winRate : null,
        bestByReturn: byReturn.length ? byReturn[0].symbol : null,
        bestReturn: byReturn.length ? byReturn[0].avgReturnPct : null
      };
    }

    function csvEscape(v) {
      var s = String(v == null ? "" : v);
      return s.indexOf(",") >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function csvRows(headers, rows) {
      return [headers.map(csvEscape).join(",")].concat(rows.map(function (r) { return r.map(csvEscape).join(","); })).join("\r\n");
    }

    function exportSingleCSV(res) {
      var st = res.stats;
      var headers = ["Symbol", "Entry Date", "Exit Date", "Entry Price", "Exit Price", "Entry Score", "10DLN", "10DEM", "Signal", "Target", "Hit Target", "Days", "Return %", "Max Fav %", "Max Adv %", "Trend", "Pullback", "Prob4", "Modifiers"];
      var rows = (st && st.trades ? st.trades : []).map(function (t) {
        return [res.symbol, t.entryDate, t.exitDate, t.entryPrice, t.exitPrice, t.entryScore, t.confLog != null ? Math.round(t.confLog * 1000) / 10 : null, t.confEmp != null ? Math.round(t.confEmp * 1000) / 10 : null, t.signal, t.targetPrice, t.hitTarget ? "YES" : "NO", t.daysToTarget || "", t.finalReturnPct, t.maxProfitPct, t.maxLossPct, t.trendScore, t.pullbackScore, t.probabilityScore, t.modifiers];
      });
      return csvRows(headers, rows);
    }

    function exportBatchCSV(res) {
      var headers = ["Symbol", "Signals", "Wins", "Losses", "Win Rate %", "Avg Return %", "Profit Factor"];
      var rows = (res.results || []).map(function (r) {
        return [r.symbol, r.totalSignals, r.winningTrades, r.losingTrades, r.winRate, r.avgReturnPct, r.profitFactor];
      });
      return csvRows(headers, rows);
    }

    function exportWalkForwardCSV(res) {
      var headers = ["Fold", "Period Start", "Period End", "IS Signals", "IS Win Rate %", "OOS Signals", "OOS Win Rate %", "OOS Avg Return %", "OOS Profit Factor"];
      var rows = (res.folds || []).map(function (fl) {
        return [fl.fold, fl.period[0], fl.period[1], fl.inSample.totalSignals, fl.inSample.winRate, fl.oos.totalSignals, fl.oos.winRate, fl.oos.avgReturnPct, fl.oos.profitFactor];
      });
      return csvRows(headers, rows);
    }

    function getScoreErrors() {
      return scoreErrors.slice(); // return copy
    }

    function clearScoreErrors() {
      scoreErrors = [];
    }

    /* ── Entry Score Sweep Utilities ────────────────────────────────────── */

    /**
     * sweepEntryScore — Sensitivity analysis.
     * Runs batch backtest at different minEntryScore thresholds and optionally
     * varies individual pillar thresholds. Returns a table of (threshold → metrics).
     *
     * opts:
     *   dataMap       : { symbol: candles[] }
     *   scoreThresholds : number[] (default [40, 50, 55, 60, 65, 70, 75, 80])
     *   pillarSweep   : { trendHealth?: number[], pullbackQuality?: number[], prob4?: number[] }
     *                   If set, for each threshold in scoreThresholds, also sweeps
     *                   each pillar independently while holding others at -Infinity.
     *   symbols       : string[] subset of dataMap keys
     *   sampleEvery   : number (default 2)
     *   hooks         : { onProgress: fn(completed, total, label) }
     *
     * Returns:
     *   { thresholdSweep: [...], pillarSweep: { trendHealth: [...], ... } }
     */
    async function sweepEntryScore(dataMap, opts, hooks) {
      opts = opts || {};
      hooks = hooks || {};
      var symbols = opts.symbols || Object.keys(dataMap || {});
      var thRange = opts.scoreThresholds || [40, 50, 55, 60, 65, 70, 75, 80];
      var pillarSweep = opts.pillarSweep || null;

      // Build a sub-dataMap for the requested symbols
      var subMap = {};
      symbols.forEach(function (s) { if (dataMap[s]) subMap[s] = dataMap[s]; });

      // ── 1. Total score threshold sweep ──
      var totalPillarSteps = pillarSweep
        ? (pillarSweep.trendHealth || [0,5,10,15,20,25]).length
          + (pillarSweep.pullbackQuality || [0,5,10,15,20,25]).length
          + (pillarSweep.prob4 || [0,5,10,15,20,25,30,35]).length
        : 0;
      var totalSteps = thRange.length + totalPillarSteps;
      var thResults = [];
      for (var ti = 0; ti < thRange.length; ti++) {
        var th = thRange[ti];
        if (hooks.onProgress) hooks.onProgress(ti, totalSteps, "Sweeping total score ≥ " + th);
        var eng = create({ threshold: th, scoreFn: cfg.scoreFn, targetProfitPct: targetProfitPct, holdingPeriodDays: holdingPeriodDays });
        var batch = await eng.runBatch(subMap, { symbols: symbols, sampleEvery: opts.sampleEvery || 2 });
        var sm = batch.summary;
        thResults.push({
          threshold: th,
          signals: sm.totalSignals,
          winRate: sm.overallWinRate,
          avgReturn: sm.avgReturn,
          avgProfitFactor: sm.avgProfitFactor,
          symbolsTested: sm.symbolsWithSignals
        });
        await yieldToUI();
      }

      // ── 2. Pillar-level sweeps ──
      var pResults = {};
      if (pillarSweep) {
        var pillarSweepCfg = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? window.TechIndicators.getScoreConfig().pillarMax : null;
        if (!pillarSweepCfg && window.TechIndicators && window.TechIndicators.getDefaultScoreConfig) pillarSweepCfg = window.TechIndicators.getDefaultScoreConfig().pillarMax;
        var pillars = [
          { key: 'trendHealth', optKey: 'minTrendHealth', label: 'Trend Health', max: pillarSweepCfg ? pillarSweepCfg.trendHealth : 35, values: pillarSweep.trendHealth || [0, 5, 10, 15, 20, 25,30] },
          { key: 'pullbackQuality', optKey: 'minPullbackQuality', label: 'Pullback Quality', max: pillarSweepCfg ? pillarSweepCfg.pullbackQuality : 30, values: pillarSweep.pullbackQuality || [0, 5, 10, 15, 20, 25] },
          { key: 'prob4', optKey: 'minProb4', label: '4% Probability', max: pillarSweepCfg ? pillarSweepCfg.prob4 : 40, values: pillarSweep.prob4 || [0, 5, 10, 15, 20, 25, 30, 35] }
        ];
        // Single engine with threshold=0 — scores are cached and reused across all pillar values
        var pillarEng = create({ scoreFn: cfg.scoreFn, targetProfitPct: targetProfitPct, holdingPeriodDays: holdingPeriodDays, threshold: 0 });
        var pillarOffset = 0;
        for (var pi = 0; pi < pillars.length; pi++) {
          var p = pillars[pi];
          var pRows = [];
          for (var vi = 0; vi < p.values.length; vi++) {
            var pv = p.values[vi];
            var label = p.label + " ≥ " + pv;
            if (hooks.onProgress) hooks.onProgress(thRange.length + pillarOffset + vi, thRange.length + totalPillarSteps, label);
            var filterOpts = {};
            filterOpts[p.optKey] = pv;
            var batch2 = await pillarEng.runBatch(subMap, Object.assign({ symbols: symbols, sampleEvery: opts.sampleEvery || 2 }, filterOpts));
            var sm2 = batch2.summary;
            pRows.push({
              pillar: p.key,
              minValue: pv,
              maxValue: p.max,
              signals: sm2.totalSignals,
              winRate: sm2.overallWinRate,
              avgReturn: sm2.avgReturn,
              avgProfitFactor: sm2.avgProfitFactor,
              symbolsTested: sm2.symbolsWithSignals
            });
            await yieldToUI();
          }
          pResults[p.key] = pRows;
          pillarOffset += p.values.length;
        }
      }

      if (hooks.onProgress) hooks.onProgress(1, 1, "Done");
      return { thresholdSweep: thResults, pillarSweep: pResults };
    }

    /**
     * analyzeComponentPower — Measures how well each individual score component
     * predicts forward returns across the scored bars.
     *
     * dataMap: { symbol: candles[] }
     * opts: { symbols, sampleEvery }
     *
     * Returns for each component (trendHealth, pullbackQuality, prob4):
     *   { correlation, bucketWinRates: [{min, max, signals, winRate, avgReturn}], infoValue }
     */
    async function analyzeComponentPower(dataMap, opts, hooks) {
      opts = opts || {};
      hooks = hooks || {};
      var symbols = opts.symbols || Object.keys(dataMap || {});
      var warmupBars = cfg.warmup != null ? cfg.warmup : 60;

      // Collect all scored bars with their forward returns
      var allScored = [];
      for (var si = 0; si < symbols.length; si++) {
        var sym = symbols[si];
        var candles = dataMap[sym];
        if (!candles || candles.length < warmupBars + 10) continue;
        candles._symbol = sym;
        var L = candles.length;
        var endIdx = Math.min(L - 1, L - 2);
        var step = opts.sampleEvery || 2;
        for (var i = warmupBars; i <= endIdx; i += step) {
          var r = scoreAt(candles, i, sym);
          if (r && r.entryScore != null) {
            var fwd = simulateTrade(candles, i, r, opts);
            allScored.push({
              symbol: sym,
              entryScore: r.entryScore,
              trendHealth: r.trendHealth != null ? r.trendHealth : null,
              pullbackQuality: r.pullbackQuality != null ? r.pullbackQuality : null,
              prob4: r.prob4 != null ? r.prob4 : null,
              hit: fwd.hitTarget,
              fwdReturn: fwd.finalReturnPct
            });
          }
        }
        if (hooks.onSymbol) {
          hooks.onSymbol(si + 1, symbols.length);
          await yieldToUI();
        }
      }

      var components = ['trendHealth', 'pullbackQuality', 'prob4', 'entryScore'];
      var result = {};

      components.forEach(function (comp) {
        var valid = allScored.filter(function (s) { return s[comp] != null; });
        if (valid.length < 10) { result[comp] = { error: 'insufficient data' }; return; }

        // Sort by component value
        valid.sort(function (a, b) { return a[comp] - b[comp]; });

        // Simple correlation (point-biserial with hit flag)
        var meanX = valid.reduce(function (s, v) { return s + v[comp]; }, 0) / valid.length;
        var meanY = valid.reduce(function (s, v) { return s + (v.hit ? 1 : 0); }, 0) / valid.length;
        var sumXY = 0, sumX2 = 0, sumY2 = 0;
        valid.forEach(function (v) {
          var dx = v[comp] - meanX;
          var dy = (v.hit ? 1 : 0) - meanY;
          sumXY += dx * dy;
          sumX2 += dx * dx;
          sumY2 += dy * dy;
        });
        var correlation = (sumX2 > 0 && sumY2 > 0) ? sumXY / Math.sqrt(sumX2 * sumY2) : 0;

        // Information value: bucket into quintiles
        var bucketSize = Math.max(1, Math.floor(valid.length / 5));
        var buckets = [];
        for (var bi = 0; bi < valid.length; bi += bucketSize) {
          var bEnd = Math.min(bi + bucketSize, valid.length);
          var bucket = valid.slice(bi, bEnd);
          var wins = bucket.filter(function (v) { return v.hit; }).length;
          var minVal = bucket[0][comp];
          var maxVal = bucket[bucket.length - 1][comp];
          buckets.push({
            min: Math.round(minVal * 10) / 10,
            max: Math.round(maxVal * 10) / 10,
            signals: bucket.length,
            winRate: Math.round((wins / bucket.length) * 1000) / 10,
            avgReturn: Math.round((bucket.reduce(function (s, v) { return s + v.fwdReturn; }, 0) / bucket.length) * 100) / 100
          });
        }

        // Info value = sum of (winRate_bucket - overallWinRate) * log(winRate_bucket / overallWinRate)
        var overallWR = valid.filter(function (v) { return v.hit; }).length / valid.length;
        var infoValue = 0;
        buckets.forEach(function (b) {
          var wr = b.winRate / 100;
          if (wr > 0 && overallWR > 0 && overallWR < 1) {
            infoValue += (b.signals / valid.length) * (wr - overallWR) * Math.log(wr / overallWR);
          }
        });

        result[comp] = {
          n: valid.length,
          correlation: Math.round(correlation * 1000) / 1000,
          infoValue: Math.round(infoValue * 1000) / 1000,
          bucketWinRates: buckets
        };
      });

      /* Compute pillar consumption stats */
      var pillars = ['trendHealth', 'pullbackQuality', 'prob4'];
      var _sc = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? window.TechIndicators.getScoreConfig() : {};
      var pillarMax = _sc.pillarMax || (window.TechIndicators && window.TechIndicators.getDefaultScoreConfig ? window.TechIndicators.getDefaultScoreConfig().pillarMax : {});
      var pillarConsumption = {};
      pillars.forEach(function(p) {
        var maxVal = pillarMax[p] || 0;
        var vals = allScored.map(function(s) { return s[p]; }).filter(function(v) { return v != null && !isNaN(v); });
        if (vals.length === 0) { pillarConsumption[p] = { max: maxVal, touched: 0, atMax: 0, atMaxPct: 0, avg: 0, median: 0, count: 0 }; return; }
        var sorted = vals.slice().sort(function(a, b) { return a - b; });
        var sum = vals.reduce(function(s, v) { return s + v; }, 0);
        var atMax = vals.filter(function(v) { return Math.abs(v - maxVal) < 0.01; }).length;
        var uniqueSymbols = new Set(allScored.filter(function(s) { return s[p] != null; }).map(function(s) { return s.symbol; })).size;
        pillarConsumption[p] = {
          max: maxVal,
          touched: Math.round(sorted[sorted.length - 1] * 10) / 10,
          atMax: atMax,
          atMaxPct: Math.round((atMax / vals.length) * 1000) / 10,
          avg: Math.round((sum / vals.length) * 10) / 10,
          median: sorted[Math.floor(sorted.length / 2)],
          count: vals.length,
          symbols: uniqueSymbols
        };
      });

      return { components: result, totalScored: allScored.length, pillarConsumption: pillarConsumption };
    }

    /**
     * exportSweepCSV — Export sweep results to CSV.
     * type: 'threshold' | 'pillar' | 'component'
     */
    function exportSweepCSV(sweepResult, type) {
      if (type === 'threshold') {
        var headers = ["Threshold", "Signals", "Win Rate %", "Avg Return %", "Avg Profit Factor", "Symbols w/ Signals"];
        var rows = (sweepResult.thresholdSweep || []).map(function (r) {
          return [r.threshold, r.signals, r.winRate, r.avgReturn, r.avgProfitFactor, r.symbolsTested];
        });
        return csvRows(headers, rows);
      }
      if (type === 'pillar') {
        var headers2 = ["Pillar", "Min Value", "Max Value", "Signals", "Win Rate %", "Avg Return %", "Avg Profit Factor", "Symbols w/ Signals"];
        var rows2 = [];
        var ps = sweepResult.pillarSweep || {};
        Object.keys(ps).forEach(function (k) {
          (ps[k] || []).forEach(function (r) {
            rows2.push([r.pillar, r.minValue, r.maxValue, r.signals, r.winRate, r.avgReturn, r.avgProfitFactor, r.symbolsTested]);
          });
        });
        return csvRows(headers2, rows2);
      }
      if (type === 'component') {
        var headers3 = ["Component", "Correlation", "Info Value", "N"];
        var rows3 = [];
        var cs = sweepResult.components || {};
        Object.keys(cs).forEach(function (k) {
          var c = cs[k];
          if (c && !c.error) rows3.push([k, c.correlation, c.infoValue, c.n]);
        });
        return csvRows(headers3, rows3);
      }
      return "";
    }

    return {
      scoreAt: scoreAt,
      simulateTrade: simulateTrade,
      calculateStats: calculateStats,
      classifyScore: classifyScore,
      runSingle: runSingle,
      runWalkForward: runWalkForward,
      runBatch: runBatch,
      sweepEntryScore: sweepEntryScore,
      analyzeComponentPower: analyzeComponentPower,
      exportSingleCSV: exportSingleCSV,
      exportBatchCSV: exportBatchCSV,
      exportWalkForwardCSV: exportWalkForwardCSV,
      exportSweepCSV: exportSweepCSV,
      clearScoreCache: function () { scoreCache.clear(); cacheOrder = []; },
      getScoreErrors: getScoreErrors,
      clearScoreErrors: clearScoreErrors
    };
  }

  return {
    create: create,
    classifyScore: classifyScore,
    ROUND2: ROUND2
  };
})();