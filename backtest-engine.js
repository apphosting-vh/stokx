/* ══════════════════════════════════════════════════════════════════════════
   StoX Backtesting Engine
   Tests the 3-pillar Entry Score (Trend Health 30 / Pullback Quality 30 /
   4% Probability 40 + framework modifiers) against a fixed profit target
   (default +4%) over a fixed holding window (default 14 trading sessions).

   Three run modes:
     Option 1  runSingle        — one symbol, detailed trade-by-trade analysis
     Option 2  runBatch         — many symbols, aggregated ranking
     Option 3  runWalkForward   — rolling out-of-sample folds, consistency check

   The engine is scoring-agnostic: the caller injects scoreFn(candles, idx)
   which grades bar idx with NO lookahead (only bars 0..idx). In the app this
   wraps window.TechIndicators.computeEntryScore on the sliced series, so the
   backtest grades the exact production engine.
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

    var scoreCache = new Map();

    function scoreAt(candles, idx) {
      var per = scoreCache.get(candles);
      if (per && per.has(idx)) return per.get(idx);
      var res = null;
      if (scoreFn) {
        try { res = scoreFn(candles, idx); } catch (e) { res = null; }
      }
      if (res && (res.entryScore == null || isNaN(res.entryScore))) res = null;
      if (!per) { per = new Map(); scoreCache.set(candles, per); }
      per.set(idx, res);
      return res;
    }

    function simulateTrade(candles, entryIdx, score) {
      var entryPrice = candles[entryIdx].c;
      var targetPrice = entryPrice * (1 + targetProfitPct / 100);
      var entryDate = String(candles[entryIdx].t).slice(0, 10);
      var hitTarget = false, daysToTarget = null, exitPrice = entryPrice, exitDate = entryDate;
      var maxProfitPct = 0, maxLossPct = 0;
      var maxHolding = Math.min(holdingPeriodDays, candles.length - entryIdx - 1);
      for (var j = 1; j <= maxHolding; j++) {
        var cur = candles[entryIdx + j];
        if (cur.h >= targetPrice) {
          hitTarget = true;
          daysToTarget = j;
          exitPrice = targetPrice;
          exitDate = String(cur.t).slice(0, 10);
          break;
        }
        var pnl = (cur.c - entryPrice) / entryPrice * 100;
        if (pnl > maxProfitPct) maxProfitPct = pnl;
        if (pnl < maxLossPct) maxLossPct = pnl;
        if (j === maxHolding) {
          exitPrice = cur.c;
          exitDate = String(cur.t).slice(0, 10);
        }
      }
      var finalReturn = (exitPrice - entryPrice) / entryPrice * 100;
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
      for (var i = startIdx; i <= endIdx; i++) {
        if (skip[i]) { if (onBar) onBar(i - startIdx + 1, endIdx - startIdx + 1); continue; }
        if ((i - startIdx) % step !== 0) { if (onBar) onBar(i - startIdx + 1, endIdx - startIdx + 1); continue; }
        var r = scoreAt(candles, i);
        if (r && r.entryScore != null) {
          sc.push(r);
          if (r.entryScore >= threshold) {
            var trade = simulateTrade(candles, i, r);
            trade.symbol = opts.symbol || "";
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
          var r = scoreAt(candles, i);
          if (r && r.entryScore != null) {
            var fwd = simulateTrade(candles, i, r);
            r._idx = i;
            r.hit = fwd.hitTarget;
            r.fwdReturn = fwd.finalReturnPct;
            scored.push(r);
            scoredBars++;
            if (r.entryScore >= threshold) {
              var trade = simulateTrade(candles, i, r);
              trade.symbol = symbol;
              trades.push(trade);
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
        var cur = scoreAt(candles, L - 1);
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
      var L = candles.length;
      var matureEnd = L - holdingPeriodDays - 1;
      var regionStart = Math.min(warmup, matureEnd);
      var regionLen = matureEnd - regionStart + 1;
      var foldSize = Math.max(1, Math.floor(regionLen / numFolds));
      var folds = [];
      for (var f = 0; f < numFolds; f++) {
        var testStart = regionStart + f * foldSize;
        var testEnd = f === numFolds - 1 ? matureEnd : testStart + foldSize - 1;
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
      if (!agg.totalOosSignals) return "No out-of-sample signals generated \u2014 try a lower threshold or longer history.";
      var parts = [];
      parts.push("Out-of-sample win rate " + (agg.overallWinRate != null ? agg.overallWinRate + "%" : "\u2014") + " across " + agg.totalOosSignals + " signals in " + agg.folds + " folds (" + agg.foldsWithSignals + " with signals).");
      if (agg.consistency != null) {
        parts.push(agg.consistency >= 60
          ? "The edge held in " + agg.consistency + "% of folds \u2014 consistent across regimes."
          : "The edge held in only " + agg.consistency + "% of folds \u2014 regime-dependent.");
      }
      if (agg.avgTrainTestGap != null) {
        parts.push(agg.avgTrainTestGap > -10
          ? "Out-of-sample win rate tracks in-sample (" + (agg.avgTrainTestGap >= 0 ? "+" : "") + agg.avgTrainTestGap + "pts avg gap) \u2014 little sign of overfit."
          : "Out-of-sample lags in-sample by " + agg.avgTrainTestGap + "pts \u2014 some degradation out-of-sample.");
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
      clearScoreCache: function () { scoreCache.clear(); }
    };
  }

  return {
    create: create,
    classifyScore: classifyScore,
    ROUND2: ROUND2
  };
})();
