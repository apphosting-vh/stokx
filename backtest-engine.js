/* ══════════════════════════════════════════════════════════════════════════
   StoX Backtesting Engine – Fixed & Enhanced
   Tests the 4‑pillar Entry Score against a fixed profit target over a
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

  function yieldToUI() { return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); }); }

  function classifyScore(s) {
    if (s == null) return null;
    var t = null;
    if (window.TechIndicators && window.TechIndicators._scoreConfigClassification) {
      t = window.TechIndicators._scoreConfigClassification;
    } else if (window.TechIndicators && window.TechIndicators.getScoreConfig) {
      t = window.TechIndicators.getScoreConfig().classification;
      window.TechIndicators._scoreConfigClassification = t;
    }
    var sb = (t && t.strongBuy != null) ? t.strongBuy : 80;
    var b  = (t && t.buy != null)       ? t.buy       : 65;
    var wl = (t && t.watchlist != null) ? t.watchlist : 50;
    var n  = (t && t.neutral != null)    ? t.neutral   : 35;
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
      if (!months[m]) months[m] = { trades: 0, wins: 0, losses: 0, timeouts: 0, ret: 0, score: 0 };
      months[m].trades++; months[m].score += t.entryScore;
      if (t.hitTarget) months[m].wins++;
      else if (t.barrier === "LOSS") months[m].losses++;
      else months[m].timeouts++;
      months[m].ret += t.finalReturnPct;
    });
    return Object.keys(months).map(function (m) {
      var d = months[m];
      return { month: m, trades: d.trades, winRate: d.trades ? Math.round((d.wins / d.trades) * 1000) / 10 : null, expectancyPct: d.trades ? Math.round((d.ret / d.trades) * 100) / 100 : null, avgScore: d.trades ? Math.round((d.score / d.trades) * 10) / 10 : null, wins: d.wins, losses: d.losses, timeouts: d.timeouts };
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
      var losses = g.filter(function (t) { return t.barrier === "LOSS"; }).length;
      var timeouts = g.filter(function (t) { return t.barrier === "TIMEOUT"; }).length;
      var avgRet = g.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / g.length;
      var gp = g.filter(function (t) { return t.finalReturnPct > 0; }).reduce(function (s, t) { return s + t.finalReturnPct; }, 0);
      var gl = Math.abs(g.filter(function (t) { return t.finalReturnPct < 0; }).reduce(function (s, t) { return s + t.finalReturnPct; }, 0));
      out[k] = {
        trades: g.length,
        winRate: Math.round((wins / g.length) * 1000) / 10,
        lossRate: Math.round((losses / g.length) * 1000) / 10,
        timeoutRate: Math.round((timeouts / g.length) * 1000) / 10,
        expectancyPct: Math.round(avgRet * 100) / 100,
        profitFactor: gl > 0 ? Math.round((gp / gl) * 100) / 100 : (gp > 0 ? "∞" : 0),
        avgReturn: Math.round(avgRet * 100) / 100
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
      var dd = peak > 0 ? (peak - curve[i].equity) / peak * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }
    return Math.round(maxDD * 100) / 100;
  }

  function approximateSharpe(trades, riskFreeRate) {
    riskFreeRate = riskFreeRate != null ? riskFreeRate : 0;
    if (!trades || trades.length < 2) return null;
    var returns = trades.map(function (t) { return t.finalReturnPct; });
    var mean = returns.reduce(function (s, r) { return s + r; }, 0) / returns.length;
    var variance = returns.reduce(function (s, r) { return s + (r - mean) * (r - mean); }, 0) / (returns.length - 1);
    var std = Math.sqrt(variance);
    if (std === 0) return null;
    return Math.round(((mean - riskFreeRate) / std) * 100) / 100;
  }

  /* Phase 6 — Validation helpers. */

  /* Regime at a candle index (proxy using the instrument's own MAs since a
     stock-level WF doesn't carry the index series). Returns "bull" | "bear" |
     "neutral" | "unknown" based on price vs MA50 and MA200. */
  function regimeAtBar(candles, idx) {
    if (!candles || idx == null || idx < 50) return "unknown";
    var closes = candles.map(function (c) { return c.c; });
    var sum50 = 0, sum200 = 0;
    for (var i = Math.max(0, idx - 49); i <= idx; i++) sum50 += closes[i];
    var ma50 = sum50 / 50;
    if (idx >= 200) {
      for (var j = idx - 199; j <= idx; j++) sum200 += closes[j];
      var ma200 = sum200 / 200;
      if (closes[idx] > ma200 && ma50 > ma200) return "bull";
      if (closes[idx] < ma200 && ma50 < ma200) return "bear";
      return "neutral";
    }
    return closes[idx] > ma50 ? "bull" : "bear";
  }

  /* Regime coverage across a set of trades — how many fell in each regime and
     the win rate within each. */
  function regimeCoverage(trades) {
    var byRegime = {};
    trades.forEach(function (t) {
      var r = t.regime || "unknown";
      if (!byRegime[r]) byRegime[r] = { n: 0, wins: 0, totalReturn: 0 };
      byRegime[r].n++;
      if (t.hitTarget) byRegime[r].wins++;
      byRegime[r].totalReturn += t.finalReturnPct || 0;
    });
    var out = [];
    Object.keys(byRegime).forEach(function (r) {
      var b = byRegime[r];
      out.push({
        regime: r,
        n: b.n,
        winRate: b.n ? Math.round((b.wins / b.n) * 1000) / 10 : null,
        avgReturnPct: b.n ? Math.round((b.totalReturn / b.n) * 100) / 100 : null
      });
    });
    out.sort(function (a, b) { return b.n - a.n; });
    return out;
  }

  /* Annualized portfolio Sharpe from pooled trade returns assuming ~252/avgHold
     round-trips per year. Mean/std of per-trade returns, scaled by sqrt(N/yr). */
  function portfolioSharpe(trades, holdingDays) {
    var hd = holdingDays || 10;
    if (!trades || trades.length < 5) return null;
    var rets = trades.map(function (t) { return t.finalReturnPct || 0; });
    var mean = rets.reduce(function (s, r) { return s + r; }, 0) / rets.length;
    var variance = rets.reduce(function (s, r) { return s + (r - mean) * (r - mean); }, 0) / (rets.length - 1);
    var std = Math.sqrt(variance);
    if (std === 0) return null;
    var roundsPerYear = 252 / hd;
    return Math.round((mean / std) * Math.sqrt(roundsPerYear) * 100) / 100;
  }

  /* Blind holdout: a fixed-size final window that is never touched by training.
     Reports in-sample vs holdout expectancy so overfit can be detected.
     Runs at module scope, so warmup/holdingPeriodDays and the trade collector
     (collectTrades, defined inside create()) are passed in via opts. */
  function blindHoldout(candles, opts, ctx) {
    opts = opts || {};
    ctx = ctx || {};
    var symbol = opts.symbol || "";
    var warmupN = opts.warmup != null ? opts.warmup : 60;
    var holdDays = opts.holdingPeriodDays != null ? opts.holdingPeriodDays : 10;
    var collect = opts.collect != null ? opts.collect : null;
    if (!collect) return null;
    var holdoutBars = opts.holdoutBars != null ? opts.holdoutBars : Math.max(60, Math.floor((candles.length || 0) * 0.25));
    var L = candles.length;
    if (L < warmupN + holdDays + holdoutBars + 20) {
      return null;
    }
    var matureEnd = L - holdDays - 1 - (opts.realisticEntry ? 1 : 0);
    var holdoutStart = matureEnd - holdoutBars + 1;
    var embargoBars = ctx.embargo != null ? ctx.embargo : 60;
    var trainEnd = holdoutStart - 1 - embargoBars;

    // Train window: collect trades on the pre-holdout slice
    var trainTrades = trainEnd >= warmupN
      ? collect(candles, warmupN, trainEnd, { symbol: symbol, sampleEvery: opts.sampleEvery || 1 })
      : { trades: [], scored: [] };
    var holdoutTrades = collect(candles, holdoutStart, matureEnd, { symbol: symbol, sampleEvery: opts.sampleEvery || 1 });

    function summarize(t) {
      var st = calculateStats(t.trades || [], symbol);
      return {
        totalSignals: st.totalSignals,
        winRate: st.totalSignals ? st.winRate : 0,
        losingTrades: st.totalSignals ? st.losingTrades : 0,
        timeoutTrades: st.totalSignals ? st.timeoutTrades : 0,
        expectancyPct: st.totalSignals ? st.expectancyPct : 0,
        avgReturnPct: st.totalSignals ? st.avgReturnPct : 0,
        profitFactor: st.totalSignals ? st.profitFactor : null
      };
    }

    return {
      holdoutPeriod: [String(candles[holdoutStart].t).slice(0, 10), String(candles[matureEnd].t).slice(0, 10)],
      train: summarize(trainTrades),
      holdout: summarize(holdoutTrades),
      embargoBars: embargoBars
    };
  }

  /* Phase 7 — Position sizing (Kelly). */

  /* Compute Kelly fraction from a trade set. Uses win rate + avg win / avg loss
     ratio. Returns the full Kelly, and a conservative half/fraction Kelly.
     b = avg win (per unit), p = win prob, q = 1-p.
     Kelly f* = p - q/b. We express returns in %, so b = avgWinPct / avgLossPct
     (the payoff ratio). */
  function kellyFraction(trades, kellyMultiplier) {
    var km = kellyMultiplier != null ? kellyMultiplier : 0.5;
    if (!trades || trades.length < 20) return null;
    var wins = trades.filter(function (t) { return t.finalReturnPct > 0; });
    var losses = trades.filter(function (t) { return t.finalReturnPct <= 0; });
    if (!wins.length || !losses.length) return null;
    var p = wins.length / trades.length;
    var q = 1 - p;
    var avgWin = wins.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / wins.length;
    var avgLoss = Math.abs(losses.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / losses.length);
    if (avgLoss <= 0) return null;
    var payoff = avgWin / avgLoss;
    var f_star = p - q / payoff;
    if (f_star <= 0) f_star = 0;
    return {
      winRate: Math.round(p * 1000) / 10,
      avgWinPct: Math.round(avgWin * 100) / 100,
      avgLossPct: Math.round(avgLoss * 100) / 100,
      payoffRatio: Math.round(payoff * 1000) / 1000,
      kellyFull: Math.round(f_star * 100) / 100,
      kellyFraction: Math.round(Math.max(0, f_star * km) * 1000) / 1000,
      kellyMultiplier: km,
      tradeCount: trades.length
    };
  }

  /* Portfolio allocation: given a list of candidate signals each with an
     expectancy estimate and a total capital budget, allocate weights capped by
     per-position and total-position limits. Positions are ranked by
     expectancy; each receives budget*totalCap*(e/totalE) capped at
     perPositionCap of the budget, and any unallocated budget is redistributed
     among the uncapped positions so cap limits are never exceeded. */
  function allocatePositions(signals, budget, opts) {
    opts = opts || {};
    var maxPositions = opts.maxPositions || 5;
    var perPositionCap = opts.perPositionCap || 0.25; // 25% max per name
    var totalCap = opts.totalCap || 0.6;              // invest at most totalCap of budget
    if (!signals || !signals.length) return [];
    var ranked = signals.slice().
      filter(function (s) { return s.expectancy != null && s.expectancy > 0; }).
      sort(function (a, b) { return b.expectancy - a.expectancy; }).
      slice(0, maxPositions);
    if (!ranked.length) return [];
    var units = budget != null ? budget : 1;
    var allocBudget = Math.max(0, totalCap * units);
    var perCap = Math.min(perPositionCap * units, allocBudget);
    var totalExp = ranked.reduce(function (s, x) { return s + x.expectancy; }, 0);
    if (!(totalExp > 0)) return [];

    var allocs = new Array(ranked.length).fill(0);
    function pass() {
      var open = [];
      for (var i = 0; i < ranked.length; i++) {
        if (allocs[i] < perCap) {
          open.push({ idx: i, e: ranked[i].expectancy });
        }
      }
      return open;
    }
    // Iterative redistribution: targets proportional to expectancy, capped per-position.
    var target = allocBudget;
    var safety = 0;
    while (safety < 8) {
      safety++;
      var open = pass();
      if (!open.length) break;
      var openE = 0;
      for (var oi = 0; oi < open.length; oi++) openE += open[oi].e;
      if (!(openE > 0)) break;
      var gapBudget = allocBudget;
      for (var ai = 0; ai < allocs.length; ai++) gapBudget -= allocs[ai];
      if (gapBudget <= 1e-9) break;
      var distributed = false;
      for (var oi2 = 0; oi2 < open.length; oi2++) {
        var slot = open[oi2];
        var want = gapBudget * (slot.e / openE);
        var room = perCap - allocs[slot.idx];
        var give = Math.min(want, Math.max(0, room));
        if (give < 0) continue;
        allocs[slot.idx] += give;
        distributed = distributed || give > 1e-9;
      }
      if (!distributed) break;
    }
    // Normalize: if over-allocated (float), scale down to cap.
    var used = allocs.reduce(function (s, x) { return s + x; }, 0);
    if (used > allocBudget && used > 0) {
      var scale = allocBudget / used;
      for (var si = 0; si < allocs.length; si++) allocs[si] = allocs[si] * scale;
      used = allocs.reduce(function (s, x) { return s + x; }, 0);
    }

    var out = [];
    for (var o = 0; o < ranked.length; o++) {
      var s = ranked[o];
      var a = Math.round(allocs[o] * 100) / 100;
      out.push({
        symbol: s.symbol,
        expectancyPct: s.expectancy,
        weight: allocBudget > 0 ? Math.round((a / allocBudget) * 10000) / 100 : 0,
        allocation: a,
        sharesHint: s.close && s.close > 0 ? Math.max(1, Math.floor(a / s.close)) : null
      });
    }
    return out;
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
      sharpeApprox: approximateSharpe(sorted),
      sharpeLabel: 'Per-trade Sharpe (not annualized)'
    };
  }

  function calculateStats(trades, symbol) {
    if (!trades || !trades.length) {
      return { symbol: symbol, totalSignals: 0, trades: [], message: "No trade signals generated" };
    }
    var n = trades.length;
    var wins = trades.filter(function (t) { return t.hitTarget; });
    var losses = trades.filter(function (t) { return t.barrier === "LOSS"; });
    var timeouts = trades.filter(function (t) { return t.barrier === "TIMEOUT"; });
    var winRate = (wins.length / n) * 100;
    var avgReturn = trades.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / n;
    var avgWin = wins.length ? wins.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / wins.length : 0;
    var avgLoss = losses.length ? losses.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / losses.length : 0;
    var avgTimeout = timeouts.length ? timeouts.reduce(function (s, t) { return s + t.finalReturnPct; }, 0) / timeouts.length : null;
    var avgDays = wins.length ? wins.reduce(function (s, t) { return s + (t.daysToTarget || 0); }, 0) / wins.length : null;
    var grossProfit = trades.filter(function (t) { return t.finalReturnPct > 0; }).reduce(function (s, t) { return s + t.finalReturnPct; }, 0);
    var grossLoss = Math.abs(trades.filter(function (t) { return t.finalReturnPct < 0; }).reduce(function (s, t) { return s + t.finalReturnPct; }, 0));
    var profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
    // Expectancy per trade: average return across all trades (the key metric)
    var expectancy = avgReturn;
    var eq = equityCurve(trades);
    return {
      symbol: symbol,
      totalSignals: n,
      winningTrades: wins.length,
      losingTrades: losses.length,
      timeoutTrades: timeouts.length,
      winRate: Math.round(winRate * 10) / 10,
      expectancyPct: Math.round(expectancy * 100) / 100,
      avgReturnPct: Math.round(avgReturn * 100) / 100,
      avgWinPct: Math.round(avgWin * 100) / 100,
      avgLossPct: Math.round(avgLoss * 100) / 100,
      avgTimeoutPct: avgTimeout != null ? Math.round(avgTimeout * 100) / 100 : null,
      avgDaysToTarget: avgDays != null ? Math.round(avgDays * 10) / 10 : null,
      profitFactor: profitFactor === Infinity ? "∞" : Math.round(profitFactor * 100) / 100,
      barrierBreakdown: {
        win: wins.length,
        loss: losses.length,
        timeout: timeouts.length,
        winRatePct: Math.round(winRate * 10) / 10,
        lossRatePct: Math.round((losses.length / n) * 1000) / 10,
        timeoutRatePct: Math.round((timeouts.length / n) * 1000) / 10
      },
      maxConsecutiveWins: maxConsecutive(trades.map(function (t) { return t.hitTarget; }), true),
      maxConsecutiveLosses: maxConsecutive(trades.map(function (t) { return t.barrier === "LOSS"; }), true),
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
    var targetProfitPct = cfg.targetProfitPct != null ? cfg.targetProfitPct : ((window.TechIndicators && window.TechIndicators.getTargetPctDisplay) ? window.TechIndicators.getTargetPctDisplay() : 3.0);
    var stopLossPct = cfg.stopLossPct != null ? cfg.stopLossPct : 2.0;
    var holdingPeriodDays = cfg.holdingPeriodDays != null ? cfg.holdingPeriodDays : ((window.TechIndicators && window.TechIndicators.getScoreConfig && window.TechIndicators.getScoreConfig().horizonDays) || 10);
    var threshold = cfg.threshold != null ? cfg.threshold : 65;
    var warmup = cfg.warmup != null ? cfg.warmup : 60;
    var multiTFMap = cfg.multiTFMap || null;
    var indexCandles = cfg.indexCandles || null;

    // New config options
    var realisticEntry = cfg.realisticEntry !== undefined ? cfg.realisticEntry : true;
    var realisticExit = cfg.realisticExit !== undefined ? cfg.realisticExit : true;
    var useStopLoss = cfg.useStopLoss !== false;
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
        if (per && per.has(idx)) {
          // Promote to most-recently-used
          var idx2 = cacheOrder.indexOf(key);
          if (idx2 > -1) { cacheOrder.splice(idx2, 1); cacheOrder.push(key); }
          return per.get(idx);
        }
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
      var tradeTargetPct = opts.targetProfitPct != null ? opts.targetProfitPct : targetProfitPct;
      var tradeStopLossPct = opts.stopLossPct != null ? opts.stopLossPct : stopLossPct;
      var tradeHoldingPeriod = opts.holdingPeriodDays != null ? opts.holdingPeriodDays : holdingPeriodDays;
      var tradeUseStopLoss = opts.useStopLoss !== undefined ? opts.useStopLoss : useStopLoss;
      var lookAheadNeeded = useRealisticEntry ? 2 : 1;
      if (entryIdx + lookAheadNeeded > candles.length) return null;

      var entryPrice, entryDateIdx;
      if (useRealisticEntry && entryIdx + 1 < candles.length) {
        entryPrice = candles[entryIdx + 1].o;
        entryDateIdx = entryIdx + 1;
      } else {
        entryPrice = candles[entryIdx].c;
        entryDateIdx = entryIdx;
      }

      var entryPriceAdj = entryPrice * (1 + slip / 100) * (1 + broker / 100);
      var exitCostFactor = (1 - slip / 100) * (1 - broker / 100);
      var targetPrice = entryPriceAdj * (1 + tradeTargetPct / 100) / exitCostFactor;
      var stopLossPrice = tradeUseStopLoss ? (entryPriceAdj * (1 - tradeStopLossPct / 100) / exitCostFactor) : null;

      var entryDate = String(candles[entryDateIdx].t).slice(0, 10);
      var hitTarget = false, daysToTarget = null, exitPrice = entryPriceAdj, exitDate = entryDate;
      var barrier = "TIMEOUT";
      var maxProfitPct = 0, maxLossPct = 0;
      var maxHolding = Math.min(tradeHoldingPeriod, candles.length - entryDateIdx - 1);

      for (var j = 1; j <= maxHolding; j++) {
        var cur = candles[entryDateIdx + j];
        var prevClose = candles[entryDateIdx + j - 1].c;

        if (useRealisticExit) {
          if (tradeUseStopLoss) {
            // Gap open below stop-loss: exit at open
            if (cur.o <= stopLossPrice) {
              daysToTarget = j;
              exitDate = String(cur.t).slice(0, 10);
              exitPrice = cur.o * (1 - slip / 100) * (1 - broker / 100);
              barrier = "LOSS";
              break;
            }
            // Intraday stop-loss hit (check low before high — stop takes priority)
            if (cur.l <= stopLossPrice) {
              daysToTarget = j;
              exitDate = String(cur.t).slice(0, 10);
              exitPrice = stopLossPrice * (1 - slip / 100) * (1 - broker / 100);
              barrier = "LOSS";
              break;
            }
          }
          // Gap open above target: exit at open
          if (cur.o >= targetPrice) {
            hitTarget = true;
            daysToTarget = j;
            exitDate = String(cur.t).slice(0, 10);
            exitPrice = cur.o * (1 - slip / 100) * (1 - broker / 100);
            barrier = "WIN";
            break;
          }
          // Intraday target hit
          if (cur.h >= targetPrice) {
            hitTarget = true;
            daysToTarget = j;
            exitDate = String(cur.t).slice(0, 10);
            exitPrice = targetPrice * (1 - slip / 100) * (1 - broker / 100);
            barrier = "WIN";
            break;
          }
        } else {
          // Optimistic mode: no exit costs on stop-loss
          if (tradeUseStopLoss) {
            var stopLossRaw = entryPriceAdj * (1 - tradeStopLossPct / 100);
            if (cur.l <= stopLossRaw) {
              daysToTarget = j;
              exitDate = String(cur.t).slice(0, 10);
              exitPrice = stopLossRaw;
              barrier = "LOSS";
              break;
            }
          }
          var targetPriceRaw = entryPriceAdj * (1 + tradeTargetPct / 100);
          if (cur.h >= targetPriceRaw) {
            hitTarget = true;
            daysToTarget = j;
            exitDate = String(cur.t).slice(0, 10);
            exitPrice = targetPriceRaw;
            barrier = "WIN";
            break;
          }
        }

        // Track max profit/loss before exit (based on close, adjusted for exit costs)
        var pnlClose = cur.c * exitCostFactor;
        var pnl = (pnlClose - entryPriceAdj) / entryPriceAdj * 100;
        if (pnl > maxProfitPct) maxProfitPct = pnl;
        if (pnl < maxLossPct) maxLossPct = pnl;

        if (j === maxHolding) {
          exitPrice = cur.c * (1 - slip / 100) * (1 - broker / 100);
          exitDate = String(cur.t).slice(0, 10);
        }
      }

      var finalReturn = (exitPrice - entryPriceAdj) / entryPriceAdj * 100;
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
        stopLossPrice: stopLossPrice != null ? ROUND2(stopLossPrice) : null,
        hitTarget: hitTarget,
        barrier: barrier,
        daysToTarget: daysToTarget,
        finalReturnPct: ROUND2(finalReturn),
        maxProfitPct: ROUND2(maxProfitPct),
        maxLossPct: ROUND2(maxLossPct),
        trendScore: score.trendHealth != null ? ROUND2(score.trendHealth) : null,
        pullbackScore: score.pullbackQuality != null ? ROUND2(score.pullbackQuality) : null,
        probabilityScore: score.prob4 != null ? ROUND2(score.prob4) : null,
        swingScore: score.swingPotential != null ? ROUND2(score.swingPotential) : null,
        volatilityFitScore: score.volatilityFit != null ? ROUND2(score.volatilityFit) : null,
        regimeAlignmentScore: score.regimeAlignment != null ? ROUND2(score.regimeAlignment) : null,
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
      /* Slices via binary search (candles are ascending): conf10dAt runs per
         scanned bar, so a linear findIndex would be O(N*M) over the run. */
      function sliceBefore(arr) {
        if (!arr) return null;
        var lo = 0, hi = arr.length;
        while (lo < hi) {
          var mid = (lo + hi) >> 1;
          if (arr[mid].t <= ts) lo = mid + 1; else hi = mid;
        }
        return arr.slice(0, lo);
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
        var entryScoreCtx = scoreObj ? { trendHealth: scoreObj.trendHealth, pullbackQuality: scoreObj.pullbackQuality, prob4: scoreObj.prob4, swingPotential: scoreObj.swingPotential, volatilityFit: scoreObj.volatilityFit, regimeAlignment: scoreObj.regimeAlignment, entryScore: scoreObj.entryScore } : null;
        /* Cost-adjusted target: the actual % gain the model should estimate,
           matching what simulateTrade treats as hitTarget. Without this,
           calibration regresses against a harder bar (raw 4%) than the
           live model quotes, biasing calP0/calK. */
        var slip = slippagePct, broker = brokeragePct;
        var costAdjTargetPct = ((1 + slip / 100) * (1 + broker / 100) * (1 + targetProfitPct / 100) / ((1 - slip / 100) * (1 - broker / 100)) - 1) * 100;
        var cfg = { horizonDays: holdingPeriodDays, windowSessions: 40, entry_price: bar.c, targetPct: costAdjTargetPct, indexCandles: idxSlice, entryScoreContext: entryScoreCtx };
        var res = window.TechIndicators.computeHorizonConfidence(hSlice, dSlice, cfg);
        if (res && res.components && res.components.probTouch != null) return { probTouch: res.components.probTouch / 100, confLog: res.confidenceLognormal != null ? res.confidenceLognormal / 100 : null, confEmp: res.confidenceEmpirical != null ? res.confidenceEmpirical / 100 : null, components: res.components };
      } catch (e) {
        if (errorLogging) {
          scoreErrors.push({ idx: idx, symbol: symbol, context: 'conf10dAt', msg: e.message, stack: e.stack });
        }
      }
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
      var minSW = opts.minSwingPotential != null ? opts.minSwingPotential : -Infinity;
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
              && (r.swingPotential == null || r.swingPotential >= minSW)
              && (r.raw_score == null || r.raw_score >= minRaw)) {
            var trade = simulateTrade(candles, i, r, opts);
            if (!trade) continue;
            trade.symbol = symbol;
            var c10 = conf10dAt(candles, i, symbol);
            trade.probTouch = c10 ? c10.probTouch : null;
            trade.confLog = c10 ? c10.confLog : null;
            trade.confEmp = c10 ? c10.confEmp : null;
            trade.driftScore = (c10 && c10.components) ? c10.components.driftScore : null;
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
      scored.forEach(function (r) {
        var key = r.classification || classifyScore(r.entryScore);
        (grouped[key] = grouped[key] || []).push(r);
      });
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
      var MIN_PER_BUCKET = 5;
      var MIN_BUCKETS = 3;
      var MAX_BUCKETS = 10;
      if (withPT.length < MIN_TOTAL) return null;
      var bucketCount = Math.max(MIN_BUCKETS, Math.min(MAX_BUCKETS, Math.floor(withPT.length / TARGET_PER_BUCKET)));
      var sorted = withPT.slice().sort(function(a, b) { return a.probTouch - b.probTouch; });
      var bucketSize = Math.floor(sorted.length / bucketCount);
      if (bucketSize < MIN_PER_BUCKET) { bucketCount = Math.floor(sorted.length / MIN_PER_BUCKET); if (bucketCount < MIN_BUCKETS) return null; bucketSize = Math.floor(sorted.length / bucketCount); }
      var buckets = [];
      for (var i = 0; i < bucketCount; i++) {
        var start = i * bucketSize;
        var end = i === bucketCount - 1 ? sorted.length : start + bucketSize;
        var group = sorted.slice(start, end);
        if (group.length < MIN_PER_BUCKET) continue;
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

      /* ── Stratified calibration by driftScore tercile ──────────────────
         Reveals conditional miscalibration that the global calP0/calK
         can mask (e.g. high-drift setups overconfident while flat ones
         underconfident, averaging out). */
      var withDS = withPT.filter(function(t) { return t.driftScore != null && !isNaN(t.driftScore); });
      var stratified = null;
      if (withDS.length >= MIN_TOTAL) {
        var dsSorted = withDS.slice().sort(function(a, b) { return a.driftScore - b.driftScore; });
        var tercileSize = Math.floor(dsSorted.length / 3);
        if (tercileSize >= MIN_PER_BUCKET) {
          stratified = [];
          var labels = ['LOW_DRIFT', 'MID_DRIFT', 'HIGH_DRIFT'];
          for (var ti = 0; ti < 3; ti++) {
            var tStart = ti * tercileSize;
            var tEnd = ti === 2 ? dsSorted.length : tStart + tercileSize;
            var tGroup = dsSorted.slice(tStart, tEnd);
            var tHits = tGroup.filter(function(t) { return t.hitTarget; }).length;
            var tAvgPT = tGroup.reduce(function(s, t) { return s + t.probTouch; }, 0) / tGroup.length;
            var tHitRate = Math.round((tHits / tGroup.length) * 1000) / 10;
            var dsLo = Math.round(tGroup[0].driftScore * 1000) / 1000;
            var dsHi = Math.round(tGroup[tGroup.length - 1].driftScore * 1000) / 1000;
            stratified.push({
              label: labels[ti],
              driftRange: [dsLo, dsHi],
              n: tGroup.length,
              avgProbTouch: Math.round(tAvgPT * 100) / 100,
              hitRate: tHitRate,
              hits: tHits,
              misses: tGroup.length - tHits
            });
          }
        }
      }

      return { buckets: buckets, calP0: calP0, calK: calK, n: withPT.length, stratified: stratified };
    }

    async function runSingle(candles, opts, hooks) {
      opts = opts || {};
      hooks = hooks || {};
      var symbol = opts.symbol || "";
      if (!candles || candles.length < warmup + 2) {
        return { symbol: symbol, error: "Need at least " + (warmup + 2) + " candles for backtesting" };
      }
      var L = candles.length;
      var useRealistic = opts.realisticEntry !== undefined ? opts.realisticEntry : realisticEntry;
      var endIdx = Math.min(L - 1, L - holdingPeriodDays - 1 - (useRealistic ? 1 : 0));
      var startIdx = Math.max(0, Math.min(warmup, endIdx));
      if (endIdx < startIdx) {
        return { symbol: symbol, error: "Not enough forward data for a " + holdingPeriodDays + "-day hold" };
      }
      var step = opts.sampleEvery || 1;
      var scoredBars = 0, totalBars = endIdx - startIdx + 1;
      var trades = [], scored = [], allScoredBars = [];
      var minTH = opts.minTrendHealth != null ? opts.minTrendHealth : -Infinity;
      var minPQ = opts.minPullbackQuality != null ? opts.minPullbackQuality : -Infinity;
      var minP4 = opts.minProb4 != null ? opts.minProb4 : -Infinity;
      var minSW = opts.minSwingPotential != null ? opts.minSwingPotential : -Infinity;
      var minRaw = opts.minRawScore != null ? opts.minRawScore : -Infinity;
      for (var i = startIdx; i <= endIdx; i++) {
        if ((i - startIdx) % step === 0) {
          var r = scoreAt(candles, i, symbol);
          if (r && r.entryScore != null) {
            allScoredBars.push({ idx: i, entryScore: ROUND2(r.entryScore), trendHealth: ROUND2(r.trendHealth), pullbackQuality: ROUND2(r.pullbackQuality), prob4: ROUND2(r.prob4), swingPotential: ROUND2(r.swingPotential), raw_score: ROUND2(r.raw_score), modifiers: ROUND2(r.modifiers) });
            var rc = Object.assign({}, r);
            var fwd = simulateTrade(candles, i, r, opts);
            if (!fwd) { if (hooks.onBar && (i - startIdx) % 25 === 0) { hooks.onBar(i - startIdx + 1, totalBars); await yieldToUI(); } continue; }
            rc._idx = i;
            rc.hit = fwd.hitTarget;
            rc.fwdReturn = fwd.finalReturnPct;
            scored.push(rc);
            scoredBars++;
            if (rc.entryScore >= threshold
                && (rc.trendHealth == null || rc.trendHealth >= minTH)
                && (rc.pullbackQuality == null || rc.pullbackQuality >= minPQ)
                && (rc.prob4 == null || rc.prob4 >= minP4)
                && (rc.swingPotential == null || rc.swingPotential >= minSW)
                && (rc.raw_score == null || rc.raw_score >= minRaw)) {
              fwd.symbol = symbol;
              var c10 = conf10dAt(candles, i, symbol);
              fwd.probTouch = c10 ? c10.probTouch : null;
              fwd.confLog = c10 ? c10.confLog : null;
              fwd.confEmp = c10 ? c10.confEmp : null;
              fwd.driftScore = (c10 && c10.components) ? c10.components.driftScore : null;
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
        if (cur) currentScore = { entryScore: ROUND2(cur.entryScore), classification: cur.classification || classifyScore(cur.entryScore), rawScore: cur.raw_score != null ? ROUND2(cur.raw_score) : null, trendHealth: cur.trendHealth != null ? ROUND2(cur.trendHealth) : null, pullbackQuality: cur.pullbackQuality != null ? ROUND2(cur.pullbackQuality) : null, prob4: cur.prob4 != null ? ROUND2(cur.prob4) : null, swingPotential: cur.swingPotential != null ? ROUND2(cur.swingPotential) : null, modifiers: cur.modifiers != null ? ROUND2(cur.modifiers) : null };
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
        totalScoredBars: scoredBars,
        allScoredBars: allScoredBars
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
      var useRealisticWF = opts.realisticEntry !== undefined ? opts.realisticEntry : realisticEntry;
      var matureEnd = L - holdingPeriodDays - 1 - (useRealisticWF ? 1 : 0);
      var regionStart = Math.max(0, Math.min(warmup, matureEnd));
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
          oos: { totalSignals: oosStats.totalSignals, winRate: oosStats.totalSignals ? oosStats.winRate : null, expectancyPct: oosStats.totalSignals ? oosStats.expectancyPct : null, avgReturnPct: oosStats.totalSignals ? oosStats.avgReturnPct : null, profitFactor: oosStats.totalSignals ? oosStats.profitFactor : null, winningTrades: oosStats.winningTrades, losingTrades: oosStats.losingTrades, timeoutTrades: oosStats.timeoutTrades, barrierBreakdown: oosStats.barrierBreakdown },
          _oosTrades: oos.trades
        });

        if (hooks.onFold) {
          hooks.onFold(f + 1, folds.length);
          await yieldToUI();
        }
      }

      var withSignals = folds.filter(function (fl) { return fl.oos.totalSignals > 0; });
      var oosTradesAll = withSignals.map(function (fl) {
        return { n: fl.oos.totalSignals, wins: fl.oos.winningTrades, losses: fl.oos.losingTrades, timeouts: fl.oos.timeoutTrades || 0, avgReturn: fl.oos.avgReturnPct, expectancyPct: fl.oos.expectancyPct };
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
        avgOosExpectancy: withSignals.length ? Math.round(withSignals.reduce(function (s, fl) { return s + (fl.oos.expectancyPct || fl.oos.avgReturnPct); }, 0) / withSignals.length * 100) / 100 : null,
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
      // Phase 6 — tag each OOS trade with the entry regime (MA-based proxy),
      // compute regime coverage and annualized portfolio Sharpe.
      var dateToIdx = {};
      for (var di = 0; di < candles.length; di++) { dateToIdx[String(candles[di].t).slice(0, 10)] = di; }
      allOosTrades.forEach(function (t) {
        var eIdx = t.entryDate != null ? dateToIdx[String(t.entryDate).slice(0, 10)] : -1;
        t.regime = regimeAtBar(candles, eIdx != null ? eIdx : -1);
      });
      var regimeCover = regimeCoverage(allOosTrades);
      var portSharpe = portfolioSharpe(allOosTrades, holdingPeriodDays);
      agg.regimeCoverage = regimeCover;
      agg.portfolioSharpe = portSharpe;

      // Phase 6 — blind holdout: final window never seen during training, with
      // an embargo gap between train and holdout (Phase 3 of the plan requires
      // a 3-month gap; here we approximate by embargoBars).
      var blindHO = null;
      try {
        blindHO = blindHoldout(candles, { symbol: symbol, holdoutBars: opts.holdoutBars, sampleEvery: sampleEvery, realisticEntry: useRealisticWF, collect: collectTrades, warmup: warmup, holdingPeriodDays: holdingPeriodDays }, { embargo: opts.embargoBars != null ? opts.embargoBars : 60 });
      } catch (e) { blindHO = null; }
      agg.blindHoldout = blindHO;
      if (blindHO) agg.blindHoldoutConsistent = (blindHO.train.expectancyPct > 0 && blindHO.holdout.expectancyPct > 0) || (blindHO.train.expectancyPct < 0 && blindHO.holdout.expectancyPct < 0);

      // Pooled win/loss/timeout averages + break-even win rate from the real
      // barrier mix (see batchSummary for the formula).
      var _wS = 0, _wC = 0, _lS = 0, _lC = 0, _tS = 0, _tC = 0;
      allOosTrades.forEach(function (t) {
        if (t.hitTarget) { _wC++; _wS += t.finalReturnPct || 0; }
        else if (t.barrier === "LOSS") { _lC++; _lS += t.finalReturnPct || 0; }
        else { _tC++; _tS += t.finalReturnPct || 0; }
      });
      agg.avgWinPct = _wC ? Math.round(_wS / _wC * 100) / 100 : null;
      agg.avgLossPct = _lC ? Math.round(_lS / _lC * 100) / 100 : null;
      agg.avgTimeoutPct = _tC ? Math.round(_tS / _tC * 100) / 100 : null;
      if (allOosTrades.length && agg.avgWinPct != null && agg.avgWinPct > 0) {
        var _pL = _lC / allOosTrades.length, _pT = _tC / allOosTrades.length;
        agg.breakEvenWinRate = Math.round(Math.max(0, Math.min(100, ((-_pL * (agg.avgLossPct || 0) - _pT * (agg.avgTimeoutPct || 0)) / agg.avgWinPct) * 100)) * 10) / 10;
      } else {
        agg.breakEvenWinRate = null;
      }

      var calibration = calibrateConfidence(allOosTrades);

      return { symbol: symbol, folds: folds, aggregate: agg, threshold: threshold, targetProfitPct: targetProfitPct, holdingPeriodDays: holdingPeriodDays, calibration: calibration };
    }

    function buildWalkForwardVerdict(agg) {
      if (!agg.totalOosSignals) return "No test signals generated \u2014 try a lower threshold or longer history.";
      var parts = [];
      parts.push("Out-of-sample win rate " + (agg.overallWinRate != null ? agg.overallWinRate + "%" : "—") + " across " + agg.totalOosSignals + " signals in " + agg.folds + " folds (" + agg.foldsWithSignals + " with signals).");
      if (agg.breakEvenWinRate != null) {
        parts.push("Break-even win rate is " + agg.breakEvenWinRate + "% (losses + timeouts) \u2014 you're at " + (agg.overallWinRate != null ? agg.overallWinRate + "% (" + (agg.overallWinRate >= agg.breakEvenWinRate ? "above" : "below") + ")" : "—") + ".");
      }
      if (agg.consistency != null) {
        parts.push(agg.consistency >= 60
          ? "The edge held in " + agg.consistency + "% of folds — consistent across regimes."
          : "The edge held in only " + agg.consistency + "% of folds — regime-dependent.");
      }
      if (agg.avgTrainTestGap != null) {
        parts.push(agg.avgTrainTestGap > -10
          ? "Test win rate tracks training (" + (agg.avgTrainTestGap >= 0 ? "+" : "") + agg.avgTrainTestGap + "pts avg gap) \u2014 little sign of overfit."
          : "Test win rate lags training by " + agg.avgTrainTestGap + "pts \u2014 some degradation on unseen data.");
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
              var avgTrend = null, avgPullback = null, avgProb4 = null, avgSwing = null, avgVolFit = null, avgRegime = null, avgHoldDays = null, avgConfLog = null, avgConfEmp = null, avgEntryScore = null;
              if (trades.length > 0) {
                var tSum = 0, pSum = 0, prSum = 0, swSum = 0, vfSum = 0, rgSum = 0, tN = 0, pN = 0, prN = 0, swN = 0, vfN = 0, rgN = 0, hSum = 0, hN = 0, clSum = 0, ceSum = 0, clN = 0, ceN = 0, esSum = 0, esN = 0;
                for (var ti = 0; ti < trades.length; ti++) {
                  if (trades[ti].trendScore != null) { tSum += trades[ti].trendScore; tN++; }
                  if (trades[ti].pullbackScore != null) { pSum += trades[ti].pullbackScore; pN++; }
                  if (trades[ti].probabilityScore != null) { prSum += trades[ti].probabilityScore; prN++; }
                  if (trades[ti].swingScore != null) { swSum += trades[ti].swingScore; swN++; }
                  if (trades[ti].volatilityFitScore != null) { vfSum += trades[ti].volatilityFitScore; vfN++; }
                  if (trades[ti].regimeAlignmentScore != null) { rgSum += trades[ti].regimeAlignmentScore; rgN++; }
                  var hd = trades[ti].daysToTarget != null ? trades[ti].daysToTarget : holdingPeriodDays;
                  hSum += hd; hN++;
                  if (trades[ti].confLog != null) { clSum += trades[ti].confLog; clN++; }
                  if (trades[ti].confEmp != null) { ceSum += trades[ti].confEmp; ceN++; }
                  if (trades[ti].entryScore != null) { esSum += trades[ti].entryScore; esN++; }
                }
                avgTrend = tN > 0 ? Math.round(tSum / tN * 10) / 10 : null;
                avgPullback = pN > 0 ? Math.round(pSum / pN * 10) / 10 : null;
                avgProb4 = prN > 0 ? Math.round(prSum / prN * 10) / 10 : null;
                avgSwing = swN > 0 ? Math.round(swSum / swN * 10) / 10 : null;
                avgVolFit = vfN > 0 ? Math.round(vfSum / vfN * 10) / 10 : null;
                avgRegime = rgN > 0 ? Math.round(rgSum / rgN * 10) / 10 : null;
                avgHoldDays = hN > 0 ? Math.round(hSum / hN * 10) / 10 : null;
                avgConfLog = clN > 0 ? Math.round(clSum / clN * 10) / 10 : null;
                avgConfEmp = ceN > 0 ? Math.round(ceSum / ceN * 10) / 10 : null;
                avgEntryScore = esN > 0 ? Math.round(esSum / esN * 10) / 10 : null;
              }
              results.push({ symbol: sym, totalSignals: single.stats.totalSignals, winRate: single.stats.totalSignals ? single.stats.winRate : null, expectancyPct: single.stats.totalSignals ? single.stats.expectancyPct : null, avgReturnPct: single.stats.totalSignals ? single.stats.avgReturnPct : null, profitFactor: single.stats.totalSignals ? single.stats.profitFactor : null, winningTrades: single.stats.totalSignals ? single.stats.winningTrades : 0, losingTrades: single.stats.totalSignals ? single.stats.losingTrades : 0, timeoutTrades: single.stats.totalSignals ? single.stats.timeoutTrades : 0, barrierBreakdown: single.stats.totalSignals ? single.stats.barrierBreakdown : null, scoreBrackets: single.stats.totalSignals ? single.stats.scoreBrackets : null, avgWinPct: single.stats.totalSignals ? single.stats.avgWinPct : null, avgLossPct: single.stats.totalSignals ? single.stats.avgLossPct : null, avgTimeoutPct: single.stats.totalSignals ? single.stats.avgTimeoutPct : null, avgTrend: avgTrend, avgPullback: avgPullback, avgProb4: avgProb4, avgSwing: avgSwing, avgVolFit: avgVolFit, avgRegime: avgRegime, avgHoldDays: avgHoldDays, avgConfLog: avgConfLog, avgConfEmp: avgConfEmp, avgEntryScore: avgEntryScore, detail: single });
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
      var totalLosses = valid.reduce(function (s, r) { return s + r.losingTrades; }, 0);
      var totalTimeouts = valid.reduce(function (s, r) { return s + (r.timeoutTrades || 0); }, 0);
var pfSum = 0, pfN = 0;
valid.forEach(function (r) { if (typeof r.profitFactor === "number") { pfSum += r.profitFactor; pfN++; } });
var wSum = 0, wCnt = 0, lSum = 0, lCnt = 0, tSum = 0, tCnt = 0;
valid.forEach(function (r) {
  if (r.winningTrades) { wCnt += r.winningTrades; wSum += (r.avgWinPct || 0) * r.winningTrades; }
  if (r.losingTrades) { lCnt += r.losingTrades; lSum += (r.avgLossPct || 0) * r.losingTrades; }
  if (r.timeoutTrades) { tCnt += r.timeoutTrades; tSum += (r.avgTimeoutPct || 0) * r.timeoutTrades; }
});
var pooledAvgWinPct = wCnt ? wSum / wCnt : 0;
var pooledAvgLossPct = lCnt ? lSum / lCnt : 0;
var pooledAvgTimeoutPct = tCnt ? tSum / tCnt : 0;
/* Break-even win rate from the true barrier mix: p_be*avgWin + p_loss*avgLoss
   + p_timeout*avgTimeout = 0, solved for p_be (win rate is wins/totalSignals,
   so timeouts sit in the denominator exactly like the displayed win rate). */
var breakEvenWinRate = null;
if (totalSignals && pooledAvgWinPct > 0) {
  var pLoss = lCnt / totalSignals, pTimeout = tCnt / totalSignals;
  breakEvenWinRate = Math.round(Math.max(0, Math.min(100, ((-pLoss * pooledAvgLossPct - pTimeout * pooledAvgTimeoutPct) / pooledAvgWinPct) * 100)) * 10) / 10;
}
var byWinRate = valid.slice().sort(function (a, b) { return b.winRate - a.winRate; });
      var byReturn = valid.slice().sort(function (a, b) { return b.avgReturnPct - a.avgReturnPct; });
      var byExpectancy = valid.slice().sort(function (a, b) { return (b.expectancyPct || b.avgReturnPct) - (a.expectancyPct || a.avgReturnPct); });
      return {
        symbolsTested: results.length,
        symbolsWithSignals: valid.length,
        symbolsNoSignals: results.length - valid.length,
        totalSignals: totalSignals,
        totalWins: totalWins,
        totalLosses: totalLosses,
        totalTimeouts: totalTimeouts,
        overallWinRate: totalSignals ? Math.round((totalWins / totalSignals) * 1000) / 10 : null,
        avgWinRate: Math.round(valid.reduce(function (s, r) { return s + r.winRate; }, 0) / valid.length * 10) / 10,
        avgExpectancy: Math.round(valid.reduce(function (s, r) { return s + (r.expectancyPct || r.avgReturnPct) * r.totalSignals; }, 0) / totalSignals * 100) / 100,
        avgReturn: Math.round(valid.reduce(function (s, r) { return s + r.avgReturnPct * r.totalSignals; }, 0) / totalSignals * 100) / 100,
        avgProfitFactor: pfN ? Math.round(pfSum / pfN * 100) / 100 : null,
avgWinPct: wCnt ? Math.round(pooledAvgWinPct * 100) / 100 : null,
avgLossPct: lCnt ? Math.round(pooledAvgLossPct * 100) / 100 : null,
avgTimeoutPct: tCnt ? Math.round(pooledAvgTimeoutPct * 100) / 100 : null,
breakEvenWinRate: breakEvenWinRate,
        bestByWinRate: byWinRate.length ? byWinRate[0].symbol : null,
        bestWinRate: byWinRate.length ? byWinRate[0].winRate : null,
        worstByWinRate: byWinRate.length ? byWinRate[byWinRate.length - 1].symbol : null,
        worstWinRate: byWinRate.length ? byWinRate[byWinRate.length - 1].winRate : null,
        bestByExpectancy: byExpectancy.length ? byExpectancy[0].symbol : null,
        bestExpectancy: byExpectancy.length ? (byExpectancy[0].expectancyPct || byExpectancy[0].avgReturnPct) : null,
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
      var headers = ["Symbol", "Entry Date", "Exit Date", "Entry Price", "Exit Price", "Entry Score", "10DLN", "10DEM", "Signal", "Target", "Stop Loss", "Barrier", "Hit Target", "Days", "Return %", "Max Fav %", "Max Adv %", "Trend", "Pullback", "Prob4", "Swing", "Modifiers"];
      var rows = (st && st.trades ? st.trades : []).map(function (t) {
        return [res.symbol, t.entryDate, t.exitDate, t.entryPrice, t.exitPrice, t.entryScore, t.confLog != null ? Math.round(t.confLog * 1000) / 10 : null, t.confEmp != null ? Math.round(t.confEmp * 1000) / 10 : null, t.signal, t.targetPrice, t.stopLossPrice || "", t.barrier || "", t.hitTarget ? "YES" : "NO", t.daysToTarget || "", t.finalReturnPct, t.maxProfitPct, t.maxLossPct, t.trendScore, t.pullbackScore, t.probabilityScore, t.swingScore, t.modifiers];
      });
      return csvRows(headers, rows);
    }

    function exportBatchCSV(res) {
      var headers = ["Symbol", "Signals", "Wins", "Losses", "Timeouts", "Win Rate %", "Expectancy %", "Avg Return %", "Profit Factor"];
      var rows = (res.results || []).map(function (r) {
        return [r.symbol, r.totalSignals, r.winningTrades, r.losingTrades, r.timeoutTrades || 0, r.winRate, r.expectancyPct || r.avgReturnPct, r.avgReturnPct, r.profitFactor];
      });
      return csvRows(headers, rows);
    }

    function exportWalkForwardCSV(res) {
      var headers = ["Fold", "Period Start", "Period End", "Train Signals", "Train Win Rate %", "Test Signals", "Test Win Rate %", "Test Avg Return %", "Test Profit Factor"];
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
     *   pillarSweep   : { trendHealth?: number[], pullbackQuality?: number[], prob4?: number[], volatilityFit?: number[], regimeAlignment?: number[] }
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
        ? (pillarSweep.trendHealth || [0, 5, 10, 15, 20, 25]).length
          + (pillarSweep.pullbackQuality || [0, 5, 10, 15, 20, 25]).length
          + (pillarSweep.prob4 || [0, 5, 10, 15, 20, 25, 30]).length
          + (pillarSweep.volatilityFit || [0, 2, 4, 6, 8, 10]).length
          + (pillarSweep.regimeAlignment || [0, 2, 4, 6, 8, 10]).length
        : 0;
      var totalSteps = thRange.length + totalPillarSteps;
      var thResults = [];
      for (var ti = 0; ti < thRange.length; ti++) {
        var th = thRange[ti];
        if (hooks.onProgress) hooks.onProgress(ti, totalSteps, "Sweeping total score ≥ " + th);
        var eng = create({ threshold: th, scoreFn: cfg.scoreFn, targetProfitPct: targetProfitPct, stopLossPct: stopLossPct, holdingPeriodDays: holdingPeriodDays, multiTFMap: cfg.multiTFMap, indexCandles: cfg.indexCandles, realisticEntry: cfg.realisticEntry, realisticExit: cfg.realisticExit, slippagePct: cfg.slippagePct, brokeragePct: cfg.brokeragePct });
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
          { key: 'trendHealth', optKey: 'minTrendHealth', label: 'Trend Health', max: pillarSweepCfg ? pillarSweepCfg.trendHealth : 25, values: pillarSweep.trendHealth || [0, 5, 10, 15, 20, 25] },
          { key: 'pullbackQuality', optKey: 'minPullbackQuality', label: 'Pullback Quality', max: pillarSweepCfg ? pillarSweepCfg.pullbackQuality : 25, values: pillarSweep.pullbackQuality || [0, 5, 10, 15, 20, 25] },
          { key: 'prob4', optKey: 'minProb4', label: 'Barrier Race', max: pillarSweepCfg ? pillarSweepCfg.prob4 : 30, values: pillarSweep.prob4 || [0, 5, 10, 15, 20, 25, 30] },
          { key: 'volatilityFit', optKey: 'minVolatilityFit', label: 'Volatility Fit', max: pillarSweepCfg ? pillarSweepCfg.volatilityFit : 10, values: pillarSweep.volatilityFit || [0, 2, 4, 6, 8, 10] },
          { key: 'regimeAlignment', optKey: 'minRegimeAlignment', label: 'Market/RS Alignment', max: pillarSweepCfg ? pillarSweepCfg.regimeAlignment : 10, values: pillarSweep.regimeAlignment || [0, 2, 4, 6, 8, 10] }
        ];
        // Single engine with threshold=0 — scores are cached and reused across all pillar values
        var pillarEng = create({ scoreFn: cfg.scoreFn, targetProfitPct: targetProfitPct, stopLossPct: stopLossPct, holdingPeriodDays: holdingPeriodDays, threshold: 0, multiTFMap: cfg.multiTFMap, indexCandles: cfg.indexCandles, realisticEntry: cfg.realisticEntry, realisticExit: cfg.realisticExit, slippagePct: cfg.slippagePct, brokeragePct: cfg.brokeragePct });
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
        var L = candles.length;
        var useRealBt = opts.realisticEntry !== undefined ? opts.realisticEntry : realisticEntry;
        var endIdx = Math.min(L - 1, L - holdingPeriodDays - 1 - (useRealBt ? 1 : 0));
        var step = opts.sampleEvery || 2;
        for (var i = warmupBars; i <= endIdx; i += step) {
          var r = scoreAt(candles, i, sym);
          if (r && r.entryScore != null) {
            var fwd = simulateTrade(candles, i, r, opts);
            if (!fwd) continue;
            allScored.push({
              symbol: sym,
              entryScore: r.entryScore,
              trendHealth: r.trendHealth != null ? r.trendHealth : null,
              pullbackQuality: r.pullbackQuality != null ? r.pullbackQuality : null,
              prob4: r.prob4 != null ? r.prob4 : null,
              swingPotential: r.swingPotential != null ? r.swingPotential : null,
              volatilityFit: r.volatilityFit != null ? r.volatilityFit : null,
              regimeAlignment: r.regimeAlignment != null ? r.regimeAlignment : null,
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

      var components = ['trendHealth', 'pullbackQuality', 'prob4', 'volatilityFit', 'regimeAlignment', 'entryScore'];
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
      var pillars = ['trendHealth', 'pullbackQuality', 'prob4', 'volatilityFit', 'regimeAlignment'];
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
     * sweepParameters — Multi-dimensional parameter sweep.
     * Sweeps targetProfitPct × stopLossPct × entry-score threshold and reports
     * expectancy, win rate, timeout rate, profit factor and annualized return so
     * the best stop/target/score combination can be selected.
     *
     * opts:
     *   targetPcts    : number[]   (default [2.5, 3.0, 3.5, 4.0])
     *   stopPcts      : number[]   (default [1.5, 2.0, 2.5])
     *   scoreThresholds : number[] (default [55, 60, 65, 70])
     *   symbols       : string[] subset of dataMap keys
     *   sampleEvery   : number     (default 2)
     *   holdingPeriodDays : number (default 10)
     *
     * Returns { cells: [...], best: {...} }
     */
    async function sweepParameters(dataMap, opts, hooks) {
      opts = opts || {};
      hooks = hooks || {};
      var symbols = opts.symbols || Object.keys(dataMap || {});
      var targetPcts = opts.targetPcts || [2.5, 3.0, 3.5, 4.0];
      var stopPcts = opts.stopPcts || [1.5, 2.0, 2.5];
      var thRange = opts.scoreThresholds || [55, 60, 65, 70];
      var holdingDays = opts.holdingPeriodDays != null ? opts.holdingPeriodDays : holdingPeriodDays;
      var minSignals = opts.minSignals != null ? opts.minSignals : 20;

      var subMap = {};
      symbols.forEach(function (s) { if (dataMap[s]) subMap[s] = dataMap[s]; });

      var totalSteps = targetPcts.length * stopPcts.length * thRange.length;
      var step = 0;
      var cells = [];
      var resultsBySpec = {};
      var best = null;

      for (var t = 0; t < targetPcts.length; t++) {
        for (var sIdx = 0; sIdx < stopPcts.length; sIdx++) {
          for (var ti = 0; ti < thRange.length; ti++) {
            var tgt = targetPcts[t];
            var stp = stopPcts[sIdx];
            var th = thRange[ti];
            step++;
            if (hooks.onProgress) hooks.onProgress(step, totalSteps, "tgt=" + tgt + "% stop=" + stp + "% th=" + th);

            var eng = create({
              threshold: th,
              scoreFn: cfg.scoreFn,
              targetProfitPct: tgt,
              stopLossPct: stp,
              holdingPeriodDays: holdingDays,
              multiTFMap: cfg.multiTFMap,
              indexCandles: cfg.indexCandles,
              realisticEntry: cfg.realisticEntry,
              realisticExit: cfg.realisticExit,
              slippagePct: cfg.slippagePct,
              brokeragePct: cfg.brokeragePct
            });
            var batch;
            try {
              batch = await eng.runBatch(subMap, { symbols: symbols, sampleEvery: opts.sampleEvery || 2 });
            } catch (e) {
              batch = null;
            }
            var sm = batch ? batch.summary : null;
            var timeoutRate = 0;
            if (sm && sm.totalSignals > 0 && sm.totalTimeouts != null) {
              timeoutRate = sm.totalSignals > 0 ? Math.round((sm.totalTimeouts / sm.totalSignals) * 1000) / 10 : 0;
            }
            var exp = sm && sm.avgExpectancy != null ? sm.avgExpectancy : (sm ? sm.avgReturn : 0);
            var annRet = 0;
            if (sm && sm.avgReturn != null && holdingDays > 0) {
              // Approximate annualized per-position return assuming ~252/10 round-trips/yr.
              annRet = Math.round(sm.avgReturn * (252 / holdingDays) * 1000) / 1000;
            }
            var cell = {
              targetPct: tgt,
              stopLossPct: stp,
              threshold: th,
              signals: sm ? sm.totalSignals : 0,
              winRate: sm && sm.overallWinRate != null ? sm.overallWinRate : 0,
              timeoutRate: timeoutRate,
              avgReturn: sm ? sm.avgReturn : 0,
              expectancy: exp,
              profitFactor: sm && sm.avgProfitFactor != null ? sm.avgProfitFactor : 0,
              annualized: annRet,
              symbolsTested: sm ? sm.symbolsWithSignals : 0,
              smallSample: sm ? sm.totalSignals < minSignals : true
            };
            cells.push(cell);
            var specKey = "t" + tgt + "_s" + stp + "_x" + th;
            resultsBySpec[specKey] = cell;
            await yieldToUI();
          }
        }
      }

      var eligible = cells.filter(function (c) { return !c.smallSample && c.signals > 0; });
      var best = null;
      if (eligible.length > 0) {
        best = eligible.slice().sort(function (a, b) { return (b.expectancy || -1e9) - (a.expectancy || -1e9); })[0];
        // Plateau check: a legitimate best is supported by at least one sibling
        // cell (same target, different stop/threshold) within 50% of its
        // expectancy. A winner with no such support is an isolated spike that a
        // thin sample can manufacture — flag it so the UI can warn.
        var siblingCount = 0;
        for (var sib = 0; sib < eligible.length; sib++) {
          var c2 = eligible[sib];
          if (c2 !== best && c2.targetPct === best.targetPct && c2.expectancy > 0 && c2.expectancy >= 0.5 * (best.expectancy || 0)) siblingCount++;
        }
        best.plateauSupport = siblingCount;
        best.isolated = siblingCount === 0;
      }

      return {
        targets: targetPcts,
        stops: stopPcts,
        thresholds: thRange,
        cells: cells,
        minSignals: minSignals,
        best: best
      };
    }

    /**
     * exportSweepParametersCSV — Export multi-dim parameter sweep cells to CSV.
     */
    function exportSweepParametersCSV(sweepResult) {
      var headers = ["Target %", "Stop %", "Threshold", "Signals", "Win Rate %", "Timeout %", "Avg Return %", "Expectancy %", "Profit Factor", "Annualized Return %"];
      var rows = (sweepResult && sweepResult.cells ? sweepResult.cells : []).map(function (c) {
        return [c.targetPct, c.stopLossPct, c.threshold, c.signals, c.winRate, c.timeoutRate, c.avgReturn, c.expectancy, c.profitFactor, c.annualized];
      });
      return csvRows(headers, rows);
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
      calibrateConfidence: calibrateConfidence,
      equityCurve: equityCurve,
      classifyScore: classifyScore,
      runSingle: runSingle,
      runWalkForward: runWalkForward,
      runBatch: runBatch,
      sweepEntryScore: sweepEntryScore,
      sweepParameters: sweepParameters,
      analyzeComponentPower: analyzeComponentPower,
      kellyFraction: kellyFraction,
      allocatePositions: allocatePositions,
      portfolioSharpe: portfolioSharpe,
      blindHoldout: blindHoldout,
      regimeCoverage: regimeCoverage,
      regimeAtBar: regimeAtBar,
      exportSingleCSV: exportSingleCSV,
      exportBatchCSV: exportBatchCSV,
      exportWalkForwardCSV: exportWalkForwardCSV,
      exportSweepCSV: exportSweepCSV,
      exportSweepParametersCSV: exportSweepParametersCSV,
      clearScoreCache: function () { scoreCache.clear(); cacheOrder = []; },
      getScoreErrors: getScoreErrors,
      clearScoreErrors: clearScoreErrors,
      getTargetProfitPct: function () { return targetProfitPct; },
      getStopLossPct: function () { return stopLossPct; },
      getUseStopLoss: function () { return useStopLoss; },
      getHoldingPeriodDays: function () { return holdingPeriodDays; }
    };
  }

  return {
    create: create,
    classifyScore: classifyScore,
    ROUND2: ROUND2
  };
})();