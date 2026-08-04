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
    if (s >= 80) return "STRONG_BUY";
    if (s >= 65) return "BUY";
    if (s >= 50) return "WATCHLIST";
    if (s >= 35) return "NEUTRAL";
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
          res = scoreFn(candles, idx);
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

    function collectTrades(candles, startIdx, endIdx, opts, onBar) {
      opts = opts || {};
      var t = [];
      var sc = [];
      var step = opts.sampleEvery || 1;
      var skip = opts.skipBars || {};
      var symbol = opts.symbol || candles._symbol || '';
      for (var i = startIdx; i <= endIdx; i++) {
        if (skip[i]) { if (onBar) onBar(i - startIdx + 1, endIdx - startIdx + 1); continue; }
        if ((i - startIdx) % step !== 0) { if (onBar) onBar(i - startIdx + 1, endIdx - startIdx + 1); continue; }
        var r = scoreAt(candles, i, symbol);
        if (r && r.entryScore != null) {
          sc.push(r);
          if (r.entryScore >= threshold) {
            var trade = simulateTrade(candles, i, r, opts);
            trade.symbol = symbol;
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

    async function runSingle(candles, opts, hooks) {
      opts = opts || {};
      hooks = hooks || {};
      var symbol = opts.symbol || "";
      if (!candles || candles.length < warmup + 2) {
        return { symbol: symbol, error: "Need at least " + (warmup + 2) + " candles for backtesting" };
      }
      // Attach symbol to candles for cache key
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
            if (r.entryScore >= threshold) {
              fwd.symbol = symbol;
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
          oos: { totalSignals: oosStats.totalSignals, winRate: oosStats.totalSignals ? oosStats.winRate : null, avgReturnPct: oosStats.totalSignals ? oosStats.avgReturnPct : null, profitFactor: oosStats.totalSignals ? oosStats.profitFactor : null, winningTrades: oosStats.winningTrades, losingTrades: oosStats.losingTrades }
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

      return { symbol: symbol, folds: folds, aggregate: agg, threshold: threshold, targetProfitPct: targetProfitPct, holdingPeriodDays: holdingPeriodDays };
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
            else results.push({ symbol: sym, totalSignals: single.stats.totalSignals, winRate: single.stats.totalSignals ? single.stats.winRate : null, avgReturnPct: single.stats.totalSignals ? single.stats.avgReturnPct : null, profitFactor: single.stats.totalSignals ? single.stats.profitFactor : null, winningTrades: single.stats.totalSignals ? single.stats.winningTrades : 0, losingTrades: single.stats.totalSignals ? single.stats.losingTrades : 0, scoreBrackets: single.stats.totalSignals ? single.stats.scoreBrackets : null, detail: single });
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
        avgReturn: Math.round(valid.reduce(function (s, r) { return s + r.avgReturnPct; }, 0) / valid.length * 100) / 100,
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
      var headers = ["Symbol", "Entry Date", "Exit Date", "Entry Price", "Exit Price", "Entry Score", "Signal", "Target", "Hit Target", "Days", "Return %", "Max Fav %", "Max Adv %", "Trend", "Pullback", "Prob4", "Modifiers"];
      var rows = (st && st.trades ? st.trades : []).map(function (t) {
        return [res.symbol, t.entryDate, t.exitDate, t.entryPrice, t.exitPrice, t.entryScore, t.signal, t.targetPrice, t.hitTarget ? "YES" : "NO", t.daysToTarget || "", t.finalReturnPct, t.maxProfitPct, t.maxLossPct, t.trendScore, t.pullbackScore, t.probabilityScore, t.modifiers];
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

    return {
      scoreAt: scoreAt,
      simulateTrade: simulateTrade,
      calculateStats: calculateStats,
      classifyScore: classifyScore,
      runSingle: runSingle,
      runWalkForward: runWalkForward,
      runBatch: runBatch,
      exportSingleCSV: exportSingleCSV,
      exportBatchCSV: exportBatchCSV,
      exportWalkForwardCSV: exportWalkForwardCSV,
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