/* ══════════════════════════════════════════════════════════════════════════
   Pattern Dashboard — StoX
   React UI component for batch backtest management, pattern browsing,
   and insights visualization.

   Depends on: React, window.PatternStore, window.BatchBacktest,
               window.PatternScoring, window.OHLCVFetcher
   ══════════════════════════════════════════════════════════════════════════ */

window.PatternDashboard = (function () {

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useMemo = React.useMemo;
  var useRef = React.useRef;

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /**
   * Get the full NIFTY 200 symbol list from the app's global.
   * Falls back to a hardcoded minimal list if the global is not available.
   */
  function getStockUniverse() {
    if (window.NIFTY_200 && window.NIFTY_200.length > 0) {
      return window.NIFTY_200;
    }
    // Minimal fallback — the app should always provide window.NIFTY_200
    return [
      {t:"RELIANCE",cap:"L"},{t:"TCS",cap:"L"},{t:"HDFCBANK",cap:"L"},{t:"INFY",cap:"L"},
      {t:"ICICIBANK",cap:"L"},{t:"HINDUNILVR",cap:"L"},{t:"SBIN",cap:"L"},{t:"BHARTIARTL",cap:"L"},
      {t:"ITC",cap:"L"},{t:"KOTAKBANK",cap:"L"},{t:"LT",cap:"L"},{t:"AXISBANK",cap:"L"},
      {t:"BAJFINANCE",cap:"L"},{t:"MARUTI",cap:"L"},{t:"SUNPHARMA",cap:"L"},{t:"TITAN",cap:"L"}
    ];
  }

  /** Pick a random subset of symbols based on batchCap value */
  function pickSymbols(batchCap) {
    var universe = getStockUniverse();
    var syms;
    if (batchCap === "nifty100") {
      syms = shuffleArray(universe.filter(function(s) { return s.cap === "L"; })).map(function(s) { return s.t; });
    } else if (batchCap === "all") {
      syms = universe.map(function(s) { return s.t; });
    } else {
      var n = Math.min(parseInt(batchCap, 10) || 20, universe.length);
      syms = shuffleArray(universe).slice(0, n).map(function(s) { return s.t; });
    }
    return syms;
  }

  /** Estimated duration label based on stock count */
  function estimateTime(count) {
    if (count <= 10) return "~30 s";
    if (count <= 20) return "~1 min";
    if (count <= 50) return "~3 min";
    if (count <= 100) return "~8 min";
    if (count <= 150) return "~12 min";
    return "~20 min";
  }

  /* ── Insights aggregation — every report is derived exclusively from data
     extractPattern()/calculateStats() already computed and stored per stock.
     Nothing here re-runs a backtest. ─────────────────────────────────────── */

  var INS_PILLARS = [
    ["trendHealth", "Trend Health"],
    ["pullbackQuality", "Pullback Quality"],
    ["prob4", "4% Prob"],
    ["swingPotential", "Swing Potential"]
  ];
  var INS_BRACKETS = ["STRONG_BUY", "BUY", "WATCHLIST", "NEUTRAL", "AVOID"];
  var INS_REGIMES = [["low_vol", "Low Volatility"], ["mid_vol", "Mid Volatility"], ["high_vol", "High Volatility"]];
  var INS_FINITE_PF = "∞";

  function inum(v, d) { return v == null || isNaN(v) ? d : v; }

  /* Re-bucket raw {x, y, n} points into ~8 sorted bins, pooling across
     stocks whose per-stock calibration used different bucket counts. */
  function weightedPts(pts) {
    if (!pts || pts.length < 2) return null;
    pts.sort(function (a, b) { return a.x - b.x; });
    var nb = Math.max(2, Math.min(8, Math.floor(pts.length / 3)));
    var per = Math.max(1, Math.floor(pts.length / nb));
    var out = [];
    for (var i = 0; i < pts.length; i += per) {
      var g = pts.slice(i, i + per);
      var n = g.reduce(function (s, p) { return s + inum(p.n, 1); }, 0);
      if (n <= 0) continue;
      var hits = g.reduce(function (s, p) { return s + (p.y / 100) * inum(p.n, 1); }, 0);
      var x = g.reduce(function (s, p) { return s + p.x * inum(p.n, 1); }, 0) / n;
      out.push({ x: Math.round(x * 1000) / 1000, y: Math.round((hits / n) * 1000) / 10, n: Math.round(n) });
    }
    return out.length >= 2 ? out : null;
  }

  /* Same calP0 (50% crossing) / calK (logit slope) derivation used by
     calibrateConfidence() in backtest-engine.js, applied to pooled buckets. */
  function deriveCal(buckets) {
    if (!buckets || buckets.length < 2) return { calP0: null, calK: null };
    var calP0 = null;
    for (var j = 1; j < buckets.length; j++) {
      var a = buckets[j - 1], b = buckets[j];
      if (a.y < 50 && b.y >= 50) {
        var denom = b.y - a.y;
        if (Math.abs(denom) > 0.001) calP0 = Math.round((a.x + ((50 - a.y) / denom) * (b.x - a.x)) * 1000) / 1000;
        break;
      }
    }
    if (calP0 == null) {
      calP0 = buckets[buckets.length - 1].y < 50 ? buckets[buckets.length - 1].x : (buckets[0].y >= 50 ? buckets[0].x : 0.38);
    }
    var calK = null;
    var logPts = buckets.filter(function (b) { return b.y > 1 && b.y < 99 && b.x > 0.01 && b.x < 0.99; }).map(function (b) {
      return { lx: Math.log(b.x / (1 - b.x)), ly: Math.log(b.y / 100 / (1 - b.y / 100)) };
    });
    if (logPts.length >= 3) {
      var sx = 0, sy = 0, sxy = 0, sx2 = 0;
      logPts.forEach(function (p) { sx += p.lx; sy += p.ly; sxy += p.lx * p.ly; sx2 += p.lx * p.lx; });
      var den = logPts.length * sx2 - sx * sx;
      if (Math.abs(den) > 1e-10) calK = Math.max(5, Math.min(100, Math.round(((logPts.length * sxy - sx * sy) / den) * 100) / 100));
    }
    if (calK == null) calK = 38;
    return { calP0: Math.round(calP0 * 1000) / 1000, calK: calK };
  }

  /* Shape verdict for a reliability curve: flat / inverted / s-shaped / good. */
  function calShape(buckets) {
    if (!buckets || buckets.length < 3) return { kind: "insufficient", text: "Not enough buckets to judge the curve shape." };
    var n = buckets.length, sx = 0, sy = 0, sxy = 0, sx2 = 0;
    buckets.forEach(function (b) { sx += b.x; sy += b.y; sxy += b.x * b.y; sx2 += b.x * b.x; });
    var den = n * sx2 - sx * sx;
    var slope = Math.abs(den) > 1e-10 ? (n * sxy - sx * sy) / den : 0;
    var first = buckets[0], last = buckets[buckets.length - 1];
    var span = last.y - first.y;
    var mae = buckets.reduce(function (s, b) { return s + Math.abs(b.y - b.x * 100); }, 0) / n;
    if (span <= 8) return { kind: "flat", text: "Hit rate is nearly flat across probTouch (" + span.toFixed(1) + "pt range) — the confidence score does not separate winners from losers. Consider retuning the confidence model." };
    if (slope < 0.3) return { kind: "weak", text: "Hit rate rises only " + slope.toFixed(2) + "% per probTouch point (slope < 0.3) — weak separation, the score adds little beyond the base rate." };
    if (last.y < first.y) return { kind: "inverted", text: "Hit rate FALLS as probTouch rises — the confidence score is inverted for this scope. High-probability setups are actually the worst bets." };
    var well = mae <= 12;
    return { kind: well ? "good" : "s-shaped", text: well ? "Curve tracks the ideal line closely (avg gap " + mae.toFixed(1) + "pt) — confidence is well calibrated for this scope." : "Curve is monotone but sits " + (mae > 20 ? "far " : "") + "off the ideal line (avg gap " + mae.toFixed(1) + "pt) — S-shaped or systematically optimistic/pessimistic. calP0 below shows the probTouch that actually yields a 50% hit rate." };
  }

  /* Verdict sentences for the drift / regime / bracket reports. */
  function stratVerdict(rows) {
    if (!rows || rows.length < 3) return "Not enough terciles to judge drift separation.";
    var lo = rows[0].winRate, hi = rows[rows.length - 1].winRate;
    var gap = hi - lo;
    if (gap >= 8) return "Drift stratifies well: high-drift setups hit " + hi + "% vs " + lo + "% for low-drift (" + (gap > 0 ? "+" : "") + gap + "pt). High-drift setups are the ones worth trading.";
    if (gap <= -8) return "Drift is INVERTED: high-drift setups hit " + hi + "% vs " + lo + "% for low-drift. Momentum-chasing setups are actually the weakest — the drift score is misleading here.";
    return "Drift adds little separation: " + rows.map(function (r) { return r.label.replace("_DRIFT", "") + " " + r.winRate + "%"; }).join(" / ") + " (spread " + (gap > 0 ? "+" : "") + gap + "pt).";
  }

  function regimeVerdict(rows) {
    if (!rows || rows.length < 2) return "Not enough regime data to judge.";
    var lo = rows[0], hi = rows[rows.length - 1];
    var gap = hi.winRate - lo.winRate;
    if (gap >= 8) return "StoX performs far better in high-volatility markets: " + hi.winRate + "% win rate in " + hi.label + " vs " + lo.winRate + "% in " + lo.label + ". The profit target is effectively a volatility bet.";
    if (gap <= -8) return "StoX only works in calm markets: " + lo.winRate + "% win rate in " + lo.label + " vs " + hi.winRate + "% in " + hi.label + ". High-vol entries keep getting caught before the target.";
    return "Volatility regime barely matters here: " + rows.map(function (r) { return r.label + " " + r.winRate + "%"; }).join(" / ") + " (spread " + (gap > 0 ? "+" : "") + gap + "pt).";
  }

  function bracketVerdict(rows) {
    if (!rows || rows.length < 2) return null;
    var parts = rows.map(function (r) { return r.key + " " + r.winRate + "%"; }).join(" > ");
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].winRate < rows[i - 1].winRate - 5) {
        return "Monotonicity break: " + parts + ". Higher scores did NOT consistently raise the hit rate — the signal boundary between " + rows[i - 1].key + " and " + rows[i].key + " needs attention.";
      }
    }
    return "Monotonic lift: " + parts + ". Higher entry score = higher hit rate, exactly as intended.";
  }

  function pillarNote(p) {
    var parts = [];
    parts.push("r=" + p.correlation + (Math.abs(p.correlation) >= 0.1 ? " (meaningful)" : Math.abs(p.correlation) >= 0.05 ? " (weak)" : " (negligible)"));
    parts.push("IV=" + p.infoValue + (p.infoValue >= 0.1 ? " (strong)" : p.infoValue >= 0.05 ? " (moderate)" : " (weak)"));
    if (p.buckets && p.buckets.length >= 2) {
      var b = p.buckets;
      var span = b[b.length - 1].winRate - b[0].winRate;
      if (span <= 6) parts.push("flat bucket curve — pillar does not rank setups");
      else if (b[b.length - 1].winRate < b[0].winRate) parts.push("INVERTED bucket curve — high pillar scores are worse");
      else parts.push("bucket curve rises " + (span > 0 ? "+" : "") + span + "pt");
    }
    return parts.join(" · ");
  }

  /* Generic pooling: pull keyed rows out of every pattern and merge them,
     weighting hit rate / avg return / probTouch by sample count. */
  function poolGroups(scoped, pick, order, map) {
    var agg = {}, any = false;
    scoped.forEach(function (p) {
      var rows = pick(p);
      if (!rows) return;
      rows.forEach(function (r) {
        if (!r) return;
        var k = r.key != null ? r.key : (r.label != null ? r.label : r.month);
        if (k == null) return;
        var m = map(r);
        var n = inum(m.n, 0);
        if (n <= 0) return;
        any = true;
        var a = agg[k] = agg[k] || { n: 0, hits: 0, sumRet: 0, sumPT: 0, label: r.label || k };
        if (!a.label) a.label = r.label || k;
        a.n += n;
        a.hits += (inum(m.winRate, 0) / 100) * n;
        a.sumRet += inum(m.avgReturn, 0) * n;
        a.sumPT += inum(m.avgProbTouch, 0) * n;
      });
    });
    if (!any) return null;
    var out = Object.keys(agg).map(function (k) {
      var a = agg[k];
      return {
        key: k,
        label: a.label || k,
        n: Math.round(a.n),
        winRate: Math.round((a.hits / a.n) * 1000) / 10,
        avgReturn: Math.round((a.sumRet / a.n) * 100) / 100,
        avgProbTouch: Math.round((a.sumPT / a.n) * 1000) / 1000
      };
    });
    if (order) {
      out.sort(function (x, y) {
        var ix = order.indexOf(x.key), iy = order.indexOf(y.key);
        return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
      });
    } else {
      out.sort(function (x, y) { return x.key < y.key ? -1 : x.key > y.key ? 1 : 0; });
    }
    return out;
  }

  /* Indicator power: correlation / info value / bucket win-rate curve,
     n-weighted across stocks. In single-stock mode the raw quintiles (with
     min–max ranges) are preserved. */
  function buildPillars(scoped, single) {
    if (single) {
      var o = [];
      INS_PILLARS.forEach(function (pp) {
        var key = pp[0], label = pp[1];
        var pw = single.indicatorPowers && single.indicatorPowers[key];
        if (!pw) return;
        var bwr = pw.bucketWinRates || [];
        o.push({
          key: key, label: label,
          n: bwr.reduce(function (s, b) { return s + inum(b.signals, 0); }, 0),
          correlation: inum(pw.correlation, 0),
          infoValue: inum(pw.infoValue, 0),
          buckets: bwr.map(function (b) {
            return {
              label: (b.min != null ? b.min : "?") + "–" + (b.max != null ? b.max : "?"),
              signals: inum(b.signals, 0),
              winRate: inum(b.winRate, 0),
              avgReturn: inum(b.avgReturn, 0)
            };
          })
        });
      });
      return o;
    }
    var out = [];
    INS_PILLARS.forEach(function (pp) {
      var key = pp[0], label = pp[1];
      var aggN = 0, aggCorr = 0, aggIV = 0, buckets = {}, bucketN = {}, maxB = 0;
      scoped.forEach(function (p) {
        var pw = p.indicatorPowers && p.indicatorPowers[key];
        if (!pw) return;
        var bwr = pw.bucketWinRates || [];
        var n = bwr.reduce(function (s, b) { return s + inum(b.signals, 0); }, 0);
        if (n <= 0) return;
        aggN += n;
        aggCorr += inum(pw.correlation, 0) * n;
        aggIV += inum(pw.infoValue, 0) * n;
        bwr.forEach(function (b, bi) {
          var bn = inum(b.signals, 0);
          if (bn <= 0) return;
          buckets[bi] = (buckets[bi] || 0) + (inum(b.winRate, 0) / 100) * bn;
          bucketN[bi] = (bucketN[bi] || 0) + bn;
          if (bi + 1 > maxB) maxB = bi + 1;
        });
      });
      if (!aggN) return;
      var bList = [];
      for (var i = 0; i < maxB; i++) {
        if (!bucketN[i]) continue;
        bList.push({ label: "Q" + (i + 1), signals: Math.round(bucketN[i]), winRate: Math.round((buckets[i] / bucketN[i]) * 1000) / 10 });
      }
      out.push({
        key: key, label: label, n: aggN,
        correlation: Math.round((aggCorr / aggN) * 1000) / 1000,
        infoValue: Math.round((aggIV / aggN) * 1000) / 1000,
        buckets: bList
      });
    });
    return out;
  }

  /* Full per-stock trade-stat rows (profitFactor may be the "∞" sentinel). */
  function buildTradeRows(scoped) {
    return scoped.map(function (p) {
      var s = p.tradeStats || {};
      var eq = p.equityCurve || null;
      var adj = p.adjustedMetrics || null;
      var ml = p.mlAdjustedMetrics || null;
      return {
        symbol: p.symbol,
        trades: inum(s.totalTrades, 0),
        winRate: inum(s.winRate, 0),
        adjWinRate: adj && adj.winRate != null ? adj.winRate : null,
        mlWinRate: ml && ml.winRate != null ? ml.winRate : null,
        avgReturn: inum(s.avgReturn, 0),
        avgWin: inum(s.avgWin, 0),
        avgLoss: inum(s.avgLoss, 0),
        profitFactor: s.profitFactor,
        maxConsecWins: inum(s.maxConsecWins, 0),
        maxConsecLosses: inum(s.maxConsecLosses, 0),
        avgDaysToTarget: inum(s.avgDaysToTarget, 0),
        maxDrawdown: inum(s.maxDrawdown, 0),
        sharpeApprox: inum(s.sharpeApprox, 0),
        finalEquity: eq ? inum(eq.finalEquity, null) : null
      };
    });
  }

  /* Pooled trade-stats summary across the scope. */
  function buildAggregate(scoped) {
    var n = scoped.length, trades = 0, wins = 0, sumRet = 0, sumWR = 0, sumSharpe = 0, pfList = [], ddList = [], maxCW = 0, maxCL = 0, sumDays = 0, daysN = 0;
    var adjWRsum = 0, adjN = 0, mlWRsum = 0, mlN = 0;
    scoped.forEach(function (p) {
      var s = p.tradeStats || {};
      var t = inum(s.totalTrades, 0);
      trades += t;
      var wr = inum(s.winRate, 0);
      wins += (wr / 100) * t;
      sumRet += inum(s.avgReturn, 0) * t;
      sumWR += wr;
      sumSharpe += inum(s.sharpeApprox, 0);
      if (s.profitFactor != null && s.profitFactor !== INS_FINITE_PF && !isNaN(Number(s.profitFactor))) pfList.push(Number(s.profitFactor));
      var dd = inum(s.maxDrawdown, 0);
      if (dd > 0) ddList.push(dd);
      maxCW = Math.max(maxCW, inum(s.maxConsecWins, 0));
      maxCL = Math.max(maxCL, inum(s.maxConsecLosses, 0));
      if (inum(s.avgDaysToTarget, 0) > 0) { sumDays += inum(s.avgDaysToTarget, 0); daysN++; }
      var adj = p.adjustedMetrics || null;
      if (adj && adj.winRate != null) { adjWRsum += adj.winRate; adjN++; }
      var ml = p.mlAdjustedMetrics || null;
      if (ml && ml.winRate != null) { mlWRsum += ml.winRate; mlN++; }
    });
    pfList.sort(function (a, b) { return a - b; });
    ddList.sort(function (a, b) { return a - b; });
    return {
      stocks: n,
      trades: trades,
      winRate: trades ? Math.round((wins / trades) * 1000) / 10 : 0,
      avgReturn: trades ? Math.round((sumRet / trades) * 100) / 100 : 0,
      avgWinRate: n ? Math.round((sumWR / n) * 10) / 10 : 0,
      avgSharpe: n ? Math.round((sumSharpe / n) * 100) / 100 : 0,
      medianPF: pfList.length ? pfList[Math.floor(pfList.length / 2)] : null,
      medianDD: ddList.length ? ddList[Math.floor(ddList.length / 2)] : null,
      maxConsecWins: maxCW,
      maxConsecLosses: maxCL,
      avgDaysToTarget: daysN ? Math.round((sumDays / daysN) * 10) / 10 : null,
      adjWinRate: adjN ? Math.round((adjWRsum / adjN) * 10) / 10 : null,
      mlWinRate: mlN ? Math.round((mlWRsum / mlN) * 10) / 10 : null
    };
  }

  /* Single dataset powering the whole Insights tab (pooled or per-stock). */
  function buildInsightsData(patterns, selectedSymbol) {
    var scoped = selectedSymbol ? patterns.filter(function (p) { return p && p.symbol === selectedSymbol; }) : patterns;
    if (!scoped.length) return null;
    var single = selectedSymbol ? scoped[0] : null;

    // 1 ── Calibration reliability curve
    var cal = null;
    if (single) {
      var g = single.calibration && single.calibration.global;
      if (g && g.buckets && g.buckets.length) {
        var bks = g.buckets.map(function (b) { return { x: inum(b.avgProbTouch, 0), y: inum(b.hitRate, 0), n: inum(b.n, 0) }; });
        cal = { buckets: bks, n: inum(g.n, bks.reduce(function (s, b) { return s + b.n; }, 0)), perStock: null };
      }
    } else {
      var pts = [], per = [];
      scoped.forEach(function (p) {
        var g2 = p.calibration && p.calibration.global;
        if (!g2 || !g2.buckets) return;
        var sn = 0;
        g2.buckets.forEach(function (b) {
          var n = inum(b.n, 0);
          if (n <= 0) return;
          sn += n;
          pts.push({ x: inum(b.avgProbTouch, 0), y: inum(b.hitRate, 0), n: n });
        });
        if (sn > 0) per.push({ symbol: p.symbol, calP0: inum(g2.calP0, 0.38), calK: inum(g2.calK, 38), n: sn });
      });
      var pooled = weightedPts(pts);
      if (pooled) cal = { buckets: pooled, n: pts.reduce(function (s, p) { return s + inum(p.n, 0); }, 0), perStock: per.sort(function (a, b) { return a.calP0 - b.calP0; }) };
    }
    if (cal) {
      var d = deriveCal(cal.buckets);
      cal.calP0 = d.calP0;
      cal.calK = d.calK;
      cal.shape = calShape(cal.buckets);
    }

    // 2 ── Drift-stratified calibration (LOW/MID/HIGH drift terciles)
    var strat = poolGroups(scoped, function (p) {
      var s = p.calibration && p.calibration.stratified;
      return Array.isArray(s) ? s : null;
    }, ["LOW_DRIFT", "MID_DRIFT", "HIGH_DRIFT"], function (r) {
      return { n: r.n, winRate: r.hitRate, avgReturn: null, avgProbTouch: r.avgProbTouch };
    });

    // 3 ── Volatility-regime performance
    var regimes = poolGroups(scoped, function (p) {
      var rb = p.regimeBehavior;
      if (!rb) return null;
      return INS_REGIMES.filter(function (r) { return rb[r[0]]; }).map(function (r) {
        var o = rb[r[0]];
        return Object.assign({ key: r[0], label: r[1] }, o);
      });
    }, INS_REGIMES.map(function (r) { return r[0]; }), function (r) {
      return { n: r.n, winRate: r.winRate, avgReturn: r.avgReturn, avgProbTouch: null };
    });

    // 4 ── Indicator power
    var pillars = buildPillars(scoped, single);

    // 5 ── Full trade stats
    var statRows = buildTradeRows(scoped);
    var agg = buildAggregate(scoped);

    // 6 ── Signal-bracket lift (entry score monotonicity test)
    var brackets = poolGroups(scoped, function (p) {
      if (!p.scoreBrackets) return null;
      return Object.keys(p.scoreBrackets).map(function (k) {
        var b = p.scoreBrackets[k];
        return Object.assign({ key: k }, b);
      });
    }, INS_BRACKETS, function (r) {
      return { n: r.trades, winRate: r.winRate, avgReturn: r.avgReturn, avgProbTouch: null };
    });

    // 7 ── Monthly breakdown
    var monthly = poolGroups(scoped, function (p) {
      return Array.isArray(p.monthlyBreakdown) ? p.monthlyBreakdown : null;
    }, null, function (r) {
      return { n: r.trades, winRate: r.winRate, avgReturn: r.avgReturn, avgProbTouch: null };
    });

    return {
      mode: single ? "symbol" : "all",
      symbol: single ? single.symbol : null,
      single: single,
      cal: cal,
      strat: strat,
      regimes: regimes,
      pillars: pillars,
      statRows: statRows,
      agg: agg,
      brackets: brackets,
      monthly: monthly,
      symbols: patterns.map(function (p) { return p.symbol; })
    };
  }

  function numForSort(v) {
    if (v == null || isNaN(v) || v === "") return -Infinity;
    if (v === INS_FINITE_PF) return Infinity;
    return Number(v);
  }

  function fmtPF(v) {
    if (v == null || isNaN(Number(v))) return "—";
    if (v === INS_FINITE_PF || Number(v) === Infinity) return "∞";
    return Number(v).toFixed(2);
  }

  function retColor(v) {
    return v == null || isNaN(v) ? "var(--text3, #9ca3af)" : v > 0 ? "var(--accent, #16a34a)" : v < 0 ? "#ef4444" : "var(--text3, #9ca3af)";
  }

  function wrColor(v) {
    return v >= 60 ? "var(--accent, #16a34a)" : v >= 45 ? "#f59e0b" : "#ef4444";
  }

  /* ── SVG charts (pure, no dependencies) ───────────────────────────────── */

  /* Reliability curve: x = avg probTouch (0–1), y = actual hit rate (0–100),
     dashed ideal line y = 100x, amber 50% reference. */
  function calChart(buckets, opts) {
    opts = opts || {};
    var W = 640, H = 220, padL = 36, padB = 26, padT = 12, padR = 12;
    var x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    var X = function (x) { return x0 + x * (x1 - x0); };
    var Y = function (y) { return y1 - (y / 100) * (y1 - y0); };
    var els = [];
    [0, 25, 50, 75, 100].forEach(function (g) {
      els.push(React.createElement("line", { key: "gy" + g, x1: x0, y1: Y(g), x2: x1, y2: Y(g), stroke: g === 50 ? "rgba(245,158,11,.55)" : "var(--border, #e5e7eb)", strokeWidth: 1, strokeDasharray: g === 50 ? "4 3" : null }));
      els.push(React.createElement("text", { key: "ly" + g, x: x0 - 4, y: Y(g) + 3, fontSize: 9, textAnchor: "end", fill: "var(--text3, #9ca3af)" }, g + "%"));
    });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (g) {
      els.push(React.createElement("text", { key: "lx" + g, x: X(g), y: y1 + 12, fontSize: 9, textAnchor: "middle", fill: "var(--text3, #9ca3af)" }, g));
    });
    els.push(React.createElement("line", { key: "ideal", x1: X(0), y1: Y(0), x2: X(1), y2: Y(100), stroke: "var(--text3, #9ca3af)", strokeWidth: 1, strokeDasharray: "5 4" }));
    if (buckets && buckets.length) {
      var d = buckets.map(function (b, i) { return (i ? "L" : "M") + X(b.x).toFixed(1) + " " + Y(b.y).toFixed(1); }).join(" ");
      els.push(React.createElement("path", { key: "line", d: d, fill: "none", stroke: opts.stroke || "#16a34a", strokeWidth: 2 }));
      buckets.forEach(function (b, i) {
        els.push(React.createElement("circle", { key: "p" + i, cx: X(b.x), cy: Y(b.y), r: 3.5, fill: opts.stroke || "#16a34a" }));
        els.push(React.createElement("text", { key: "pt" + i, x: X(b.x) + 5, y: Y(b.y) - 5, fontSize: 9, fill: "var(--text3, #9ca3af)" }, "n=" + b.n));
      });
    }
    els.push(React.createElement("text", { key: "xl", x: x1, y: H - 6, fontSize: 9, textAnchor: "end", fill: "var(--text3, #9ca3af)" }, "avg probTouch →"));
    els.push(React.createElement("text", { key: "yl", x: 10, y: y0 + 9, fontSize: 9, fill: "var(--text3, #9ca3af)" }, "hit rate %"));
    return React.createElement("svg", { width: "100%", viewBox: "0 0 " + W + " " + H, style: { display: "block", maxWidth: 660 } }, els);
  }

  /* Equity curve: equity per trade (chronological), shaded to baseline. */
  function eqChart(points, opts) {
    opts = opts || {};
    if (!points || points.length < 2) return null;
    var W = 640, H = 200, padL = 44, padB = 22, padT = 10, padR = 12;
    var x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    var eqs = points.map(function (p) { return p.equity; });
    var min = Math.min.apply(null, eqs), max = Math.max.apply(null, eqs);
    var lo = Math.min(0, min), hi = Math.max(100, max);
    var span = (hi - lo) || 1;
    var X = function (i) { return x0 + (i / (points.length - 1)) * (x1 - x0); };
    var Y = function (e) { return y1 - (e - lo) / span * (y1 - y0); };
    var els = [];
    var steps = 5;
    for (var g = 0; g <= steps; g++) {
      var v = lo + (hi - lo) * g / steps;
      els.push(React.createElement("line", { key: "g" + g, x1: x0, y1: Y(v), x2: x1, y2: Y(v), stroke: "var(--border, #e5e7eb)", strokeWidth: 1 }));
      els.push(React.createElement("text", { key: "t" + g, x: x0 - 4, y: Y(v) + 3, fontSize: 9, textAnchor: "end", fill: "var(--text3, #9ca3af)" }, Math.round(v)));
    }
    var d = points.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.equity).toFixed(1); }).join(" ");
    els.push(React.createElement("path", { key: "fill", d: d + " L" + X(points.length - 1).toFixed(1) + " " + Y(lo) + " L" + X(0) + " " + Y(lo) + " Z", fill: "rgba(22,163,74,.08)", stroke: "none" }));
    els.push(React.createElement("path", { key: "eq", d: d, fill: "none", stroke: opts.stroke || "#16a34a", strokeWidth: 2 }));
    els.push(React.createElement("text", { key: "x0", x: X(0), y: y1 + 12, fontSize: 9, textAnchor: "start", fill: "var(--text3, #9ca3af)" }, points[0].date || "start"));
    els.push(React.createElement("text", { key: "x1", x: X(points.length - 1), y: y1 + 12, fontSize: 9, textAnchor: "end", fill: "var(--text3, #9ca3af)" }, points[points.length - 1].date || "end"));
    return React.createElement("svg", { width: "100%", viewBox: "0 0 " + W + " " + H, style: { display: "block", maxWidth: 660 } }, els);
  }

  /* Tiny in-cell win-rate bar sparkline for bucket curves. */
  function sparkBars(vals) {
    var max = Math.max.apply(null, vals.map(function (v) { return inum(v, 0); }));
    return React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 3, height: 26 } },
      vals.map(function (v, i) {
        var h = max > 0 ? Math.max(2, (inum(v, 0) / max) * 24) : 2;
        var col = i === 0 ? "#ef4444" : i === vals.length - 1 ? "var(--accent, #16a34a)" : "var(--text3, #9ca3af)";
        return React.createElement("div", { key: i, title: (vals[i] != null ? vals[i] + "%" : "n/a"), style: { width: 14, height: h, background: col, borderRadius: 2 } });
      })
    );
  }

  /* ── Main Dashboard Component ─────────────────────────────────────────── */

  function Dashboard(props) {
    var onBack = props.onBack || null;
    var stocksList = props.stocks || getStockUniverse().map(function (s) { return s.t; });

    var _s = useState("overview"); // tab: overview | run | browse | insights | settings | ml | live
    var tab = _s[0], setTab = _s[1];

    var _p = useState(null); // patterns
    var patterns = _p[0], setPatterns = _p[1];

    var _stats = useState(null);
    var stats = _stats[0], setStats = _stats[1];

    var _report = useState(null);
    var report = _report[0], setReport = _report[1];


    var _progress = useState({ current: 0, total: 0, symbol: "", phase: "" });
    var progress = _progress[0], setProgress = _progress[1];

    var _error = useState(null);
    var error = _error[0], setError = _error[1];

    // Run Batch tab state (must be at component top-level — Rules of Hooks)
    var _btConfig = useState(function () {
      var _scDef = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? window.TechIndicators.getScoreConfig() : {};
      var defaults = { targetProfitPct: (window.TechIndicators && window.TechIndicators.getTargetPctDisplay) ? window.TechIndicators.getTargetPctDisplay() : 4, holdingPeriodDays: _scDef.horizonDays || 14, threshold: 65, sampleEvery: 2, usePatternWeights: true, useMLBlend: true };
      try {
        var saved = localStorage.getItem("stox_best_bt_config");
        if (saved) {
          var c = JSON.parse(saved);
          var v = {};
          if (typeof c.targetProfitPct === "number" && isFinite(c.targetProfitPct) && c.targetProfitPct > 0) v.targetProfitPct = c.targetProfitPct;
          if (typeof c.holdingPeriodDays === "number" && isFinite(c.holdingPeriodDays) && c.holdingPeriodDays > 0) v.holdingPeriodDays = c.holdingPeriodDays;
          if (typeof c.threshold === "number" && isFinite(c.threshold) && c.threshold > 0 && c.threshold <= 100) v.threshold = c.threshold;
          if (typeof c.sampleEvery === "number" && isFinite(c.sampleEvery) && c.sampleEvery >= 1) v.sampleEvery = c.sampleEvery;
          if (typeof c.usePatternWeights === "boolean") v.usePatternWeights = c.usePatternWeights;
          if (typeof c.useMLBlend === "boolean") v.useMLBlend = c.useMLBlend;
          if (v.targetProfitPct != null && v.holdingPeriodDays != null && v.threshold != null && v.sampleEvery != null) {
            return Object.assign({}, defaults, v);
          }
        }
      } catch (e) {}
      return defaults;
    });
    var btConfig = _btConfig[0], setBtConfig = _btConfig[1];
    var _btRunning = useState(false);
    var btRunning = _btRunning[0], setBtRunning = _btRunning[1];
    var _btLog = useState([]);
    var btLog = _btLog[0], setBtLog = _btLog[1];
    var btRunnerRef = useRef(null);
    var _btCap = useState("20");
    var btCap = _btCap[0], setBtCap = _btCap[1];
    var _btResult = useState(null);
    var btResult = _btResult[0], setBtResult = _btResult[1];
    var _browseSort = useState({ key: "winRate", asc: false });
    var browseSort = _browseSort[0], setBrowseSort = _browseSort[1];
    // ML tab state (must be at component top-level — Rules of Hooks)
    var _mlStatus = useState(null);
    var mlStatus = _mlStatus[0], setMlStatus = _mlStatus[1];
    var _mlTraining = useState(false);
    var mlTraining = _mlTraining[0], setMlTraining = _mlTraining[1];
    var _mlLog = useState([]);
    var mlLog = _mlLog[0], setMlLog = _mlLog[1];
    var _mlOptimizing = useState(false);
    var mlOptimizing = _mlOptimizing[0], setMlOptimizing = _mlOptimizing[1];
    var _mlTrainMode = useState("walkforward");
    var mlTrainMode = _mlTrainMode[0], setMlTrainMode = _mlTrainMode[1];
    var _mlDriftHistory = useState(null);
    var mlDriftHistory = _mlDriftHistory[0], setMlDriftHistory = _mlDriftHistory[1];
    var _mlPromoHistory = useState(null);
    var mlPromoHistory = _mlPromoHistory[0], setMlPromoHistory = _mlPromoHistory[1];
    var _mlCachedModel = useState(null);
    var mlCachedModel = _mlCachedModel[0], setMlCachedModel = _mlCachedModel[1];

    // Live Expert tab state (must be at component top-level — Rules of Hooks)
    var _liveStatus = useState(null);
    var liveStatus = _liveStatus[0], setLiveStatus = _liveStatus[1];
    var _liveBusy = useState(false);
    var liveBusy = _liveBusy[0], setLiveBusy = _liveBusy[1];
    // Live scan progress { done, total } so the button shows movement instead of a frozen "Working..."
    var _liveProg = useState(null);
    var liveProg = _liveProg[0], setLiveProg = _liveProg[1];
    var _liveLog = useState([]);
    var liveLog = _liveLog[0], setLiveLog = _liveLog[1];
    var _liveSignals = useState(null);
    var liveSignals = _liveSignals[0], setLiveSignals = _liveSignals[1];
    var _liveTracker = useState(null);
    var liveTracker = _liveTracker[0], setLiveTracker = _liveTracker[1];
    // Step 2: Evening validation report
    var _validationReport = useState(null);
    var validationReport = _validationReport[0], setValidationReport = _validationReport[1];
    // Step 3: Night improvement report
    var _improvementReport = useState(null);
    var improvementReport = _improvementReport[0], setImprovementReport = _improvementReport[1];
    // Active step tracking
    var _activeLiveStep = useState(0);
    var activeLiveStep = _activeLiveStep[0], setActiveLiveStep = _activeLiveStep[1];

    // Load ML status on mount
    useEffect(function () {
      loadMLStatus();
      loadMLDriftHistory();
      loadMLPromoHistory();
      loadLiveStatus();
      loadPersistedScan();
    }, []);

    // Load ML model when ML tab is active
    useEffect(function () {
      if (tab === "ml") loadMLCachedModel();
    }, [tab]);

    // Remove confirm state (must be at top-level with other hooks)
    var _removeConfirm = useState(false);
    var removeConfirm = _removeConfirm[0], setRemoveConfirm = _removeConfirm[1];

    // Pattern Settings tab state (all-stock weight override table)
    var _pSettings = useState(null);
    var patternSettings = _pSettings[0], setPatternSettings = _pSettings[1];
    var _pSearch = useState("");
    var patternSearch = _pSearch[0], setPatternSearch = _pSearch[1];
    var _rsAll = useState(false);
    var resetAllConfirm = _rsAll[0], setResetAllConfirm = _rsAll[1];
    var _bulkSel = useState({});
    var bulkSel = _bulkSel[0], setBulkSel = _bulkSel[1];
    var _bulkDeltas = useState({ trendHealth: 0, pullbackQuality: 0, prob4: 0, swingPotential: 0 });
    var bulkDeltas = _bulkDeltas[0], setBulkDeltas = _bulkDeltas[1];
    var _bulkConfirm = useState(false);
    var bulkConfirm = _bulkConfirm[0], setBulkConfirm = _bulkConfirm[1];
    var _pBlend = useState(0.5);
    var patternBlend = _pBlend[0], setPatternBlend = _pBlend[1];
    var _scoringCfg = useState(function () {
      if (window.getScoringConfig) return window.getScoringConfig();
      return { usePatternWeights: true, useMLBlend: true };
    });
    var scoringCfg = _scoringCfg[0], setScoringCfg = _scoringCfg[1];

    // Insights tab state (must be at component top-level — Rules of Hooks)
    var _insSym = useState("");
    var insightsSym = _insSym[0], setInsightsSym = _insSym[1];
    var _insSort = useState({ key: "sharpeApprox", asc: false });
    var insightsSort = _insSort[0], setInsightsSort = _insSort[1];

    useEffect(function () {
      if (tab !== "settings") return;
      if (patternSettings) return;
      var cancelled = false;
      (async function () {
        try {
          if (!window.PatternStore) { setPatternSettings([]); return; }
          await window.PatternStore.init();
          var univ = getStockUniverse().map(function (s) { return s.t; });
          var pats = await window.PatternStore.getAll();
          var ov = await window.PatternStore.getWeightOverrides();
          var bl = 0.5;
          try {
            var blv = await window.PatternStore.getWeightBlend();
            if (blv != null) bl = blv;
          } catch (e) {}
          if (!cancelled) setPatternBlend(bl);
          var patMap = {};
          pats.forEach(function (p) { if (p && p.symbol) patMap[p.symbol] = p; });
          var rows = univ.map(function (sym) {
            var p = patMap[sym];
            var lw = (p && p.indicatorWeights) ? p.indicatorWeights : null;
            if (p && window.PatternScoring && window.PatternScoring.resolveLearnedWeights) {
              var rlw = window.PatternScoring.resolveLearnedWeights(p, true);
              if (rlw) lw = rlw;
            }
            var o = ov[sym] || null;
            var base = function (k) { return (lw && lw[k] != null) ? lw[k] : 0.25; };
            var learnedRaw = { trendHealth: base("trendHealth"), pullbackQuality: base("pullbackQuality"), prob4: base("prob4"), swingPotential: base("swingPotential") };
            return {
              symbol: sym,
              hasPattern: !!p,
              learned: learnedRaw,
              trades: p && p.tradeStats ? p.tradeStats.totalTrades : 0,
              winRate: p && p.tradeStats ? p.tradeStats.winRate : null,
              backtestDate: p ? (p.backtestDate || null) : null,
              enabled: !!o,
              draft: o ? {
                trendHealth: o.trendHealth != null ? o.trendHealth : learnedRaw.trendHealth,
                pullbackQuality: o.pullbackQuality != null ? o.pullbackQuality : learnedRaw.pullbackQuality,
                prob4: o.prob4 != null ? o.prob4 : learnedRaw.prob4,
                swingPotential: o.swingPotential != null ? o.swingPotential : learnedRaw.swingPotential
              } : { trendHealth: learnedRaw.trendHealth, pullbackQuality: learnedRaw.pullbackQuality, prob4: learnedRaw.prob4, swingPotential: learnedRaw.swingPotential }
            };
          });
          if (!cancelled) setPatternSettings(rows);
        } catch (err) {
          if (!cancelled) setPatternSettings([]);
        }
      })();
      return function () { cancelled = true; };
    }, [tab, patternSettings]);

    async function loadMLStatus() {
      try {
        if (window.MLTrainer && window.MLTrainer.getModelStatus) {
          var status = await window.MLTrainer.getModelStatus();
          setMlStatus(status);
        }
      } catch (e) {}
    }

    async function loadMLDriftHistory() {
      try {
        if (window.MLTrainer && window.MLTrainer.getDriftHistory) {
          var dh = await window.MLTrainer.getDriftHistory();
          setMlDriftHistory(dh);
        }
      } catch (e) {}
    }

    async function loadMLPromoHistory() {
      try {
        if (window.MLTrainer && window.MLTrainer.getPromotionHistory) {
          var ph = await window.MLTrainer.getPromotionHistory();
          setMlPromoHistory(ph);
        }
      } catch (e) {}
    }

    async function loadMLCachedModel() {
      try {
        if (window.MLTrainer && window.MLTrainer.getActiveModel) {
          var m = await window.MLTrainer.getActiveModel();
          setMlCachedModel(m);
        }
      } catch (e) {}
    }

    async function loadLiveStatus() {
      try {
        if (window.LiveML && window.LiveML.getStatus) {
          var status = await window.LiveML.getStatus();
          setLiveStatus(status);
        }
      } catch (e) {}
      try {
        if (window.LiveML && window.LiveML.getTracker) {
          var tr = await window.LiveML.getTracker();
          setLiveTracker(tr);
        }
      } catch (e) {}
    }

    var _btSelectedCount = useState(function () {
      return Math.min(parseInt("20", 10) || 20, getStockUniverse().length);
    });
    var btSelectedCount = _btSelectedCount[0], setBtSelectedCount = _btSelectedCount[1];

    // Load existing patterns on mount
    useEffect(function () {
      loadExistingData();
    }, []);

    async function loadExistingData() {
      try {
        await window.PatternStore.init();
        var p = await window.PatternStore.getAll();
        setPatterns(p);
        var s = await window.PatternStore.getStats();
        setStats(s);
        if (p.length > 0 && window.BatchBacktest) {
          var r = await window.BatchBacktest.create({}).generateReport();
          setReport(r);
        }
      } catch (e) {
        console.error("Failed to load patterns:", e);
      }
    }

    /* ── Remove Patterns Handler (defined before return for Babel hoisting) ── */
    async function handleRemovePatterns() {
      if (!removeConfirm) {
        setRemoveConfirm(true);
        setTimeout(function () { setRemoveConfirm(false); }, 5000);
        return;
      }
      setRemoveConfirm(false);
      try {
        setError(null);
        await window.PatternStore.init();
        var count = (await window.PatternStore.getAll()).length;
        console.log("[PatternDashboard] Removing " + count + " patterns...");
        if (window.PatternStore.clearEverything) {
          await window.PatternStore.clearEverything();
        } else {
          await window.PatternStore.clearAll();
        }
        if (window.PatternStore.clearLiveFeatures) {
          await window.PatternStore.clearLiveFeatures();
        }
        console.log("[PatternDashboard] IDB cleared, reloading cache...");
        if (window.reloadPatternCache) await window.reloadPatternCache();
        setPatterns([]);
        setStats(null);
        setReport(null);
        setError("Cleared " + count + " patterns — ready for fresh backtest");
        setTimeout(function () { setError(null); }, 4000);
      } catch (err) {
        console.error("[PatternDashboard] Remove failed:", err);
        setError("Clear failed: " + err.message);
      }
    }

    /* ── Export/Import Handlers (defined before return for Babel hoisting) ── */
    async function handleExport() {
      try {
        var json = await window.PatternStore.exportJSON();
        var blob = new Blob([json], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "stox-patterns-" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError("Export failed: " + e.message);
      }
    }

    function handleImportClick() {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      input.addEventListener("change", function (e) {
        handleImportFile(e);
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    }

    async function handleImportFile(e) {
      var file = e.target && e.target.files && e.target.files[0];
      if (!file) return;
      try {
        setError(null);
        var text = await file.text();
        var parsed = JSON.parse(text);
        if (!parsed.patterns || !Array.isArray(parsed.patterns)) {
          setError("Invalid file: expected { patterns: [...] } format");
          return;
        }
        var count = await window.PatternStore.importJSON(text);
        if (window.reloadPatternCache) await window.reloadPatternCache();
        var all = await window.PatternStore.getAll();
        setPatterns(all);
        var st = await window.PatternStore.getStats();
        setStats(st);
        try {
          var rpt = await window.BatchBacktest.create({}).generateReport();
          setReport(rpt);
        } catch (_) {}
        setError("Imported " + count + " patterns from " + file.name);
        setTimeout(function () { setError(null); }, 4000);
      } catch (err) {
        setError("Import failed: " + err.message);
      }
    }

    function getTopKey(obj) {
      var max = 0, key = "N/A";
      Object.keys(obj).forEach(function (k) { if (obj[k] > max) { max = obj[k]; key = k; } });
      return key;
    }

    /* ── Run Batch Backtest ────────────────────────────────────────────── */
    function cancelBatchRun() {
      if (btRunnerRef.current) {
        btRunnerRef.current.cancel();
        btRunnerRef.current = null;
      }
      setBtRunning(false);
      setBtLog(function (prev) {
        var newLog = prev.slice(-50);
        newLog.push({ time: new Date().toLocaleTimeString(), msg: "CANCELLED by user" });
        return newLog;
      });
    }

    async function startBatchRun() {
      // Pick a random subset based on selected cap
      var symbols = pickSymbols(btCap);
      var count = symbols.length;

      setBtRunning(true);
      setError(null);
      setBtResult(null);
      setProgress({ current: 0, total: count, symbol: "", phase: "starting" });
      setBtLog([{ time: new Date().toLocaleTimeString(), msg: "Starting batch backtest for " + count + " stocks (cap=" + btCap + ")..." }]);

      try {
        var runner = window.BatchBacktest.create(btConfig);
        btRunnerRef.current = runner;
        var result = await runner.runBatch(symbols, {
          onProgress: function (current, total, symbol, phase) {
            setProgress({ current: current, total: total, symbol: symbol, phase: phase });
            // Log key phases: data load summary, no data, errors, completion
            var shouldLog = phase === "data_loaded" || phase === "no_data" || phase === "no_offline_fallback_live"
              || phase === "done" || phase === "error" || phase === "insufficient_trades"
              || (typeof current === "number" && current % 10 === 0);
            if (shouldLog) {
              setBtLog(function (prev) {
                var newLog = prev.slice(-50);
                if (phase === "data_loaded") {
                  newLog.push({ time: new Date().toLocaleTimeString(), msg: "Loaded " + current + " / " + total + " symbols with candle data" });
                } else if (phase === "no_data") {
                  newLog.push({ time: new Date().toLocaleTimeString(), msg: "WARNING: No candle data found for any symbol!" });
                } else if (phase === "no_offline_fallback_live") {
                  newLog.push({ time: new Date().toLocaleTimeString(), msg: "No offline data found — falling back to live fetch..." });
                } else {
                  newLog.push({ time: new Date().toLocaleTimeString(), msg: "[" + current + "/" + total + "] " + symbol + " — " + phase });
                }
                return newLog;
              });
            }
          },
          onError: function (symbol, err) {
            setBtLog(function (prev) {
              var newLog = prev.slice(-50);
              newLog.push({ time: new Date().toLocaleTimeString(), msg: "ERROR " + symbol + ": " + err.message });
              return newLog;
            });
          }
        });

        setBtLog(function (prev) {
          var newLog = prev.slice(-50);
          newLog.push({ time: new Date().toLocaleTimeString(), msg: "COMPLETE: " + result.summary.successCount + " success, " + result.summary.failCount + " failed, " + result.summary.skippedCount + " skipped. Duration: " + Math.round(result.summary.totalDurationMs / 1000) + "s" });
          return newLog;
        });

        // Store result summary for comparison card
        setBtResult({
          summary: result.summary,
          avgWinRate: result.summary.avgWinRate || null,
          avgAdjustedWinRate: result.summary.avgAdjustedWinRate || null,
          avgMLWinRate: result.summary.avgMLWinRate || null,
          mlModelLoaded: result.summary.mlModelLoaded || false,
          totalTrades: result.summary.totalTrades != null ? result.summary.totalTrades : null,
          successCount: result.summary.successCount != null ? result.summary.successCount : null,
          adjTradesTotal: result.summary.adjTradesTotal != null ? result.summary.adjTradesTotal : null,
          adjSymsCounted: result.summary.adjSymsCounted != null ? result.summary.adjSymsCounted : null,
          mlTradesTotal: result.summary.mlTradesTotal != null ? result.summary.mlTradesTotal : null,
          mlSymsCounted: result.summary.mlSymsCounted != null ? result.summary.mlSymsCounted : null,
          smallSampleSkipped: result.summary.smallSampleSkipped || 0,
          decile: result.summary.decile || null,
          runConfig: { usePatternWeights: btConfig.usePatternWeights !== false, useMLBlend: btConfig.useMLBlend !== false }
        });

        await loadExistingData();
        // Reload screener's in-memory pattern cache so new patterns take effect immediately
        if (window.reloadPatternCache) await window.reloadPatternCache();
        // Reload ML model if one was trained
        if (window.initPatternIntelligence && window.PatternStore) {
          try { await window.PatternStore.init(); } catch (_) {}
        }
        setTab("browse");
      } catch (e) {
        setBtLog(function (prev) {
          var newLog = prev.slice(-50);
          newLog.push({ time: new Date().toLocaleTimeString(), msg: "FATAL: " + e.message });
          return newLog;
        });
      } finally {
        btRunnerRef.current = null;
        setBtRunning(false);
        setProgress({ current: 0, total: 0, symbol: "", phase: "" });
      }
    }

    /* ── Render ────────────────────────────────────────────────────────── */
    var containerStyle = { maxWidth: 960, margin: "0 auto", padding: "16px" };
    var headerStyle = { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 };
    var titleStyle = { fontSize: 20, fontWeight: 700 };
    var tabBarStyle = { display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border, #e5e7eb)", paddingBottom: 8 };
    var tabStyle = function (active) { return {
      padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500,
      background: active ? "var(--accent, #16a34a)" : "transparent",
      color: active ? "#fff" : "var(--text2, #6b7280)",
      border: "none", outline: "none"
    }; };
    var cardStyle = { background: "var(--bg2, #f9fafb)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid var(--border, #e5e7eb)" };
    var labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--text3, #9ca3af)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
    var valueStyle = { fontSize: 22, fontWeight: 700 };
    var smallStyle = { fontSize: 12, color: "var(--text3, #9ca3af)" };

    return React.createElement("div", { style: containerStyle },
      // Header
      React.createElement("div", { style: headerStyle },
        onBack ? React.createElement("button", { onClick: onBack, style: { background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 18 } }, "\u2190") : null,
        React.createElement("span", { style: titleStyle }, "Pattern Intelligence Lab")
      ),

      // Tab bar
      React.createElement("div", { style: tabBarStyle },
        React.createElement("button", { style: tabStyle(tab === "overview"), onClick: function () { setTab("overview"); } }, "Overview"),
        React.createElement("button", { style: tabStyle(tab === "run"), onClick: function () { setTab("run"); } }, "Run Batch"),
        React.createElement("button", { style: tabStyle(tab === "browse"), onClick: function () { setTab("browse"); } }, "Browse Patterns"),
        React.createElement("button", { style: tabStyle(tab === "insights"), onClick: function () { setTab("insights"); } }, "Insights"),
        React.createElement("button", { style: tabStyle(tab === "settings"), onClick: function () { setTab("settings"); } }, "Pattern Settings"),
        React.createElement("button", { style: tabStyle(tab === "ml"), onClick: function () { setTab("ml"); } }, "ML Engine"),
        React.createElement("button", { style: tabStyle(tab === "live"), onClick: function () { setTab("live"); } }, "Live Expert")
      ),

      // Error
      error && React.createElement("div", { style: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, marginBottom: 16, color: "#dc2626", fontSize: 13 } }, error),

      // Tab content
      tab === "overview" && renderOverview(),
      tab === "run" && renderRunBatch(),
      tab === "browse" && renderBrowse(),
      tab === "insights" && renderInsights(),
      tab === "settings" && renderPatternSettings(),
      tab === "ml" && renderMLEngine(),
      tab === "live" && renderLiveExpert()
    );

    function renderOverview() {
      if (!stats) return React.createElement("div", { style: cardStyle },
        React.createElement("p", { style: { color: "var(--text2)" } }, "No patterns stored yet. Go to 'Run Batch' to backtest all stocks and build pattern intelligence."));

      // Compute aggregated adj/ML win rates from patterns
      var adjWRsum = 0, adjN = 0, mlWRsum = 0, mlN = 0;
      (patterns || []).forEach(function (p) {
        var adj = p.adjustedMetrics || null;
        if (adj && adj.winRate != null) { adjWRsum += adj.winRate; adjN++; }
        var ml = p.mlAdjustedMetrics || null;
        if (ml && ml.winRate != null) { mlWRsum += ml.winRate; mlN++; }
      });
      var avgAdjWR = adjN ? Math.round((adjWRsum / adjN) * 10) / 10 : null;
      var avgMLWR = mlN ? Math.round((mlWRsum / mlN) * 10) / 10 : null;

      return React.createElement("div", null,
        // Stats cards
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 20 } },
          statCard("Stocks Analyzed", stats.totalPatterns),
          statCard("Total Trades", stats.totalTrades),
          statCard("Avg Win Rate", (stats.avgWinRate || 0) + "%"),
          avgAdjWR != null ? statCard("Pattern Adj WR", avgAdjWR + "%") : null,
          avgMLWR != null ? statCard("ML Blended WR", avgMLWR + "%") : null,
          statCard("Avg Sharpe", stats.avgSharpe || 0),
          statCard("With Calibration", stats.withCalibration),
          statCard("Oldest", stats.oldestPattern ? new Date(stats.oldestPattern).toLocaleDateString() : "N/A")
        ),
        // Report summary
        report && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Quick Report"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 } },
            React.createElement("div", null,
              React.createElement("span", { style: smallStyle }, "Best Stock: "),
              React.createElement("strong", null, (report.best ? report.best.symbol : "N/A") + " (" + (report.best ? report.best.winRate : 0) + "% WR)")
            ),
            React.createElement("div", null,
              React.createElement("span", { style: smallStyle }, "Top Indicator: "),
              React.createElement("strong", null, getTopKey(report.topIndicators || {}))
            )
          ),
          React.createElement("div", { style: { marginTop: 8 } },
            React.createElement("span", { style: smallStyle }, "Win Rate Distribution: "),
            JSON.stringify(report.winRateDistribution || {})
          )
        ),
        // Actions
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 16 } },
          React.createElement("button", {
            onClick: function () { setTab("run"); },
            style: { padding: "8px 16px", borderRadius: 6, background: "var(--accent, #16a34a)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }
          }, "Run Batch Backtest"),
          React.createElement("button", {
            onClick: handleExport,
            style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer" }
          }, "Export Patterns"),
          React.createElement("button", {
            onClick: handleImportClick,
            style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer" }
          }, "Import Patterns"),
          React.createElement("button", {
            onClick: handleRemovePatterns,
            style: Object.assign(
              { padding: "8px 16px", borderRadius: 6, border: "1px solid", cursor: "pointer" },
              removeConfirm
                ? { background: "#dc2626", color: "#fff", borderColor: "#dc2626", fontWeight: 700 }
                : { background: "var(--bg3, #f3f4f6)", color: "#dc2626", borderColor: "#dc262644" }
            )
          }, removeConfirm ? "Confirm — Remove All Patterns" : "Remove Patterns")
        )
      );
    }

    function renderRunBatch() {
      var capOptions = [
        ["10", "Random 10"],
        ["20", "Random 20"],
        ["50", "Random 50"],
        ["100", "Random 100"],
        ["nifty100", "NIFTY 100"],
        ["200", "NIFTY 200"],
        ["all", "All Stocks"]
      ];
      var universe = getStockUniverse();
      var effectiveCount = btCap === "all" || btCap === "200" ? universe.length
        : btCap === "nifty100" ? universe.filter(function(s) { return s.cap === "L"; }).length
        : Math.min(parseInt(btCap, 10) || 20, universe.length);

      return React.createElement("div", null,
        // Stock count selector
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("div", { style: labelStyle }, "Stock Selection"),
            React.createElement("div", { style: { fontSize: 11, color: "var(--text3)" } },
              effectiveCount + " stocks  ·  est. " + estimateTime(effectiveCount)
            )
          ),
          React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 } },
            capOptions.map(function (c) {
              var isActive = String(btCap) === c[0];
              return React.createElement("button", {
                key: c[0],
                onClick: function () {
                  var newCap = c[0];
                  var newCount = newCap === "all" || newCap === "200" ? universe.length
                    : newCap === "nifty100" ? universe.filter(function(s) { return s.cap === "L"; }).length
                    : Math.min(parseInt(newCap, 10) || 20, universe.length);
                  setBtCap(newCap);
                  setBtSelectedCount(newCount);
                },
                style: {
                  padding: "6px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                  border: "1px solid " + (isActive ? "var(--accent, #16a34a)" : "var(--border, #e5e7eb)"),
                  background: isActive ? "rgba(22,163,74,.12)" : "var(--bg4, #f9fafb)",
                  color: isActive ? "var(--accent, #16a34a)" : "var(--text5, #6b7280)"
                }
              }, c[1]);
            })
          )
        ),
        // Config
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Backtest Configuration"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 } },
            configField("Target Profit %", btConfig.targetProfitPct, function (v) { var _def = (window.TechIndicators && window.TechIndicators.getTargetPctDisplay) ? window.TechIndicators.getTargetPctDisplay() : 4; setBtConfig(Object.assign({}, btConfig, { targetProfitPct: parseFloat(v) || _def })); }),
            configField("Holding Period (days)", btConfig.holdingPeriodDays, function (v) { var _defH = (window.TechIndicators && window.TechIndicators.getScoreConfig && window.TechIndicators.getScoreConfig().horizonDays) || 14; setBtConfig(Object.assign({}, btConfig, { holdingPeriodDays: parseInt(v) || _defH })); }),
            configField("Threshold Score", btConfig.threshold, function (v) { setBtConfig(Object.assign({}, btConfig, { threshold: parseInt(v) || 65 })); }),
            configField("Sample Every N bars", btConfig.sampleEvery, function (v) { setBtConfig(Object.assign({}, btConfig, { sampleEvery: parseInt(v) || 2 })); })
          ),
          React.createElement("div", { style: { display: "flex", gap: 16, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" } },
            React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 } },
              React.createElement("input", { type: "checkbox", checked: btConfig.usePatternWeights !== false, onChange: function (e) { var next = Object.assign({}, btConfig, { usePatternWeights: e.target.checked }); setBtConfig(next); try { localStorage.setItem("stox_best_bt_config", JSON.stringify(next)); } catch(_e) {} }, style: { cursor: "pointer" } }),
              React.createElement("span", null, "Pattern Re-weighting"),
              React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, "(stock-specific pillar weights)")
            ),
            React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 } },
              React.createElement("input", { type: "checkbox", checked: btConfig.useMLBlend !== false, onChange: function (e) { var next = Object.assign({}, btConfig, { useMLBlend: e.target.checked }); setBtConfig(next); try { localStorage.setItem("stox_best_bt_config", JSON.stringify(next)); } catch(_e) {} }, style: { cursor: "pointer" } }),
              React.createElement("span", null, "ML Blend"),
              React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, "(champion model overlay)")
            )
          )
        ),
        // Progress
        btRunning && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Progress"),
          React.createElement("div", { style: { marginTop: 8 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } },
              React.createElement("span", { style: { fontSize: 13 } }, String(progress.symbol) + " — " + String(progress.phase)),
              React.createElement("span", { style: { fontSize: 13, fontWeight: 600 } }, String(progress.current) + " / " + String(progress.total))
            ),
            React.createElement("div", { style: { height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" } },
              React.createElement("div", { style: {
                height: "100%", borderRadius: 3,
                width: (progress.total > 0 ? (progress.current / progress.total * 100) : 0) + "%",
                background: "var(--accent, #16a34a)",
                transition: "width 0.3s ease"
              } })
            )
          )
        ),
        // Run / Cancel button
        btRunning
          ? React.createElement("button", {
              onClick: cancelBatchRun,
              style: {
                width: "100%", padding: "12px", borderRadius: 8, marginTop: 12,
                background: "#dc2626", color: "#fff", border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: 14
              }
            }, "Cancel (" + progress.current + "/" + progress.total + " processed)")
          : React.createElement("button", {
              onClick: startBatchRun,
              style: {
                width: "100%", padding: "12px", borderRadius: 8, marginTop: 12,
                background: "var(--accent, #16a34a)", color: "#fff", border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: 14
              }
            }, "Start Batch Backtest (" + effectiveCount + " stocks)"),
        // Post-run comparison card
        btResult && !btRunning && React.createElement("div", { style: Object.assign({}, cardStyle, { border: "1px solid rgba(6,182,212,.3)", background: "rgba(6,182,212,.04)" }) },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 } }, "Scoring Parity Comparison"),
          React.createElement("div", { style: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 } },
            React.createElement("div", { style: { textAlign: "center" } },
              React.createElement("div", { style: { fontSize: 10, color: "var(--text4)", textTransform: "uppercase", letterSpacing: .5 } }, "Raw Win Rate"),
              React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: "var(--text)" } }, btResult.avgWinRate != null ? btResult.avgWinRate + "%" : "\u2014"),
              btResult.totalTrades != null ? React.createElement("div", { style: { fontSize: 9, color: "var(--text6)" } }, btResult.totalTrades + " trades") : null
            ),
            React.createElement("div", { style: { textAlign: "center" } },
              React.createElement("div", { style: { fontSize: 10, color: "#06b6d4", textTransform: "uppercase", letterSpacing: .5 } }, "Pattern Adj WR" + (btResult.runConfig && btResult.runConfig.usePatternWeights === false ? " (off)" : "")),
              React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: "#06b6d4" } }, btResult.avgAdjustedWinRate != null ? btResult.avgAdjustedWinRate + "%" : "\u2014"),
              btResult.avgAdjustedWinRate != null && btResult.adjTradesTotal != null
                ? React.createElement("div", { style: { fontSize: 9, color: "#06b6d4", opacity: .7 } }, btResult.adjTradesTotal + " trades \u00B7 " + btResult.adjSymsCounted + "/" + (btResult.successCount || "?") + " sym")
                : React.createElement("div", { style: { fontSize: 9, color: "var(--text6)" } }, "no qualifying bars")
            ),
            React.createElement("div", { style: { textAlign: "center" } },
              React.createElement("div", { style: { fontSize: 10, color: "#a78bfa", textTransform: "uppercase", letterSpacing: .5 } }, "ML Blended WR" + (btResult.runConfig && btResult.runConfig.useMLBlend === false ? " (off)" : "")),
              React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: btResult.mlModelLoaded ? "#a78bfa" : "var(--text6)" } }, btResult.avgMLWinRate != null ? btResult.avgMLWinRate + "%" : (btResult.mlModelLoaded === false ? "No model" : "\u2014")),
              btResult.mlModelLoaded && btResult.avgMLWinRate != null && btResult.mlTradesTotal != null
                ? React.createElement("div", { style: { fontSize: 9, color: "#a78bfa", opacity: .7 } }, btResult.mlTradesTotal + " trades \u00B7 " + btResult.mlSymsCounted + "/" + (btResult.successCount || "?") + " sym")
                : null
            )
          ),
          // Threshold-free comparison row (top-decile selection per symbol)
          btResult.decile && btResult.decile.avgRawWR != null && React.createElement("div", { style: { borderTop: "1px solid rgba(128,128,128,.2)", paddingTop: 8 } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text4)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Threshold-free \u00B7 top 10% of bars per symbol"),
            React.createElement("div", { style: { display: "flex", gap: 16, flexWrap: "wrap" } },
              React.createElement("div", { style: { textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase" } }, "Raw"),
                React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--text)" } }, btResult.decile.avgRawWR + "%")
              ),
              React.createElement("div", { style: { textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase" } }, "Pattern"),
                React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#06b6d4" } }, btResult.decile.avgPatternWR != null ? btResult.decile.avgPatternWR + "%" : "\u2014")
              ),
              React.createElement("div", { style: { textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase" } }, "ML"),
                React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#a78bfa" } }, btResult.decile.avgMLWR != null ? btResult.decile.avgMLWR + "%" : "\u2014")
              )
            )
          ),
          (function () {
            var parts = [];
            var runCfg = btResult.runConfig || {};
            // Pattern delta
            if (runCfg.usePatternWeights === false) {
              parts.push(React.createElement("span", { key: "a" }, "Pattern re-weighting disabled \u2014 raw scores used as-is"));
            } else if (btResult.avgAdjustedWinRate != null && btResult.avgWinRate != null) {
              var rawVsAdj = Math.round((btResult.avgAdjustedWinRate - btResult.avgWinRate) * 10) / 10;
              var adjLabel = rawVsAdj >= 0 ? "Pattern re-weighting improved" : "Pattern re-weighting reduced";
              parts.push(React.createElement("span", { key: "a" }, adjLabel + " raw win rate by " + Math.abs(rawVsAdj) + " points"));
            }
            // ML delta
            if (runCfg.useMLBlend === false) {
              parts.push(React.createElement("span", { key: "b" }, ". ML blend disabled \u2014 no model overlay applied"));
            } else if (btResult.avgMLWinRate != null && btResult.avgAdjustedWinRate != null) {
              var adjVsMl = Math.round((btResult.avgMLWinRate - btResult.avgAdjustedWinRate) * 10) / 10;
              var mlLabel = adjVsMl >= 0 ? "ML blend improved" : "ML blend reduced";
              parts.push(React.createElement("span", { key: "b" }, ". " + mlLabel + " pattern-adjusted win rate by " + Math.abs(adjVsMl) + " points"));
            } else if (!btResult.mlModelLoaded && runCfg.useMLBlend !== false) {
              parts.push(React.createElement("span", { key: "b" }, ". No champion model loaded \u2014 ML blend not applied"));
            }
            if (btResult.smallSampleSkipped > 0) {
              parts.push(React.createElement("span", { key: "c" }, ". Re-weighting skipped on " + btResult.smallSampleSkipped + " low-sample patterns (<30 trades)"));
            }
            if (!parts.length) return null;
            return React.createElement("div", { style: { fontSize: 12, color: "var(--text3)", lineHeight: 1.6 } }, parts);
          })()
        ),
        // Log
        btLog.length > 0 && React.createElement("div", { style: Object.assign({}, cardStyle, { maxHeight: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }) },
          btLog.map(function (entry, i) {
            return React.createElement("div", { key: i, style: { marginBottom: 2 } },
              React.createElement("span", { style: { color: "var(--text3)" } }, String(entry.time) + " "),
              String(entry.msg)
            );
          })
        )
      );
    }

    function renderBrowse() {
      if (!patterns || patterns.length === 0) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("p", { style: { color: "var(--text2)", textAlign: "center", padding: 20 } }, "No patterns to browse. Run a batch backtest first.")
        );
      }

      var sortKey = browseSort.key, asc = browseSort.asc;
      function numVal(p, key) {
        if (key === "symbol") return 0;
        if (key === "trades") return p.tradeStats ? p.tradeStats.totalTrades || 0 : 0;
        if (key === "winRate") return p.tradeStats ? p.tradeStats.winRate || 0 : 0;
        if (key === "adjWR") return p.adjustedMetrics && p.adjustedMetrics.winRate != null ? p.adjustedMetrics.winRate : -1;
        if (key === "mlWR") return p.mlAdjustedMetrics && p.mlAdjustedMetrics.winRate != null ? p.mlAdjustedMetrics.winRate : -1;
        if (key === "sharpe") return p.tradeStats ? p.tradeStats.sharpeApprox || 0 : 0;
        if (key === "profitFactor") { var pf = p.tradeStats ? p.tradeStats.profitFactor : null; return (pf != null && isFinite(pf)) ? pf : -1; }
        if (key === "avgReturn") return p.tradeStats ? p.tradeStats.avgReturn || 0 : 0;
        if (key === "maxDD") return p.tradeStats ? p.tradeStats.maxDrawdown || 0 : 0;
        if (key === "topPillar") {
          var lw2 = p.indicatorWeights;
          if (p && window.PatternScoring && window.PatternScoring.resolveLearnedWeights) { var rlw2 = window.PatternScoring.resolveLearnedWeights(p); if (rlw2) lw2 = rlw2; }
          if (!lw2) return "";
          var best = "", bestV = -1;
          Object.keys(lw2).forEach(function (k) { if (lw2[k] > bestV) { bestV = lw2[k]; best = k; } });
          return best;
        }
        if (key === "age") return p.backtestDate ? -(Date.now() - p.backtestDate) : 0;
        return 0;
      }
      var sorted = patterns.slice().sort(function (a, b) {
        if (sortKey === "symbol") { var c = String(a.symbol).localeCompare(String(b.symbol)); return asc ? c : -c; }
        if (sortKey === "topPillar") { var c2 = String(numVal(a, "topPillar")).localeCompare(String(numVal(b, "topPillar"))); return asc ? c2 : -c2; }
        var va = numVal(a, sortKey), vb = numVal(b, sortKey);
        return asc ? va - vb : vb - va;
      });

      var th = { textAlign: "left", padding: "6px 8px", fontSize: 11, fontWeight: 600, color: "var(--text3)", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none", borderBottom: "2px solid var(--border)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 };
      var tdc = { padding: "5px 8px", fontSize: 12, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
      var tdr = { padding: "5px 8px", fontSize: 12, borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" };

      function col(key, label, alignRight) {
        var isSorted = sortKey === key;
        return React.createElement("th", {
          key: key, style: Object.assign({}, alignRight ? th : th, { textAlign: alignRight ? "right" : "left" }),
          onClick: function () { setBrowseSort({ key: key, asc: isSorted ? !asc : (key === "symbol" ? true : false) }); }
        }, label + (isSorted ? (asc ? " \u2191" : " \u2193") : ""));
      }

      return React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
          React.createElement("span", { style: { fontSize: 14, fontWeight: 600 } }, sorted.length + " Patterns"),
          React.createElement("button", {
            onClick: handleExport,
            style: { padding: "4px 10px", borderRadius: 4, background: "var(--bg3)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }
          }, "Export All")
        ),
        React.createElement("div", { style: { maxHeight: "calc(100vh - 220px)", overflowY: "auto", borderRadius: 8, border: "1px solid var(--border)" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null,
              React.createElement("tr", null,
                col("symbol", "Symbol", false),
                col("trades", "Trades", true),
                col("winRate", "WR%", true),
                col("adjWR", "Pat WR", true),
                col("mlWR", "ML WR", true),
                col("sharpe", "Sharpe", true),
                col("profitFactor", "PF", true),
                col("avgReturn", "Avg Ret", true),
                col("maxDD", "Max DD", true),
                col("topPillar", "Top Pillar", false),
                col("age", "Age", true)
              )
            ),
            React.createElement("tbody", null,
              sorted.map(function (p) {
                var wr = p.tradeStats ? p.tradeStats.winRate || 0 : 0;
                var wrColor = wr >= 60 ? "var(--accent, #16a34a)" : wr >= 45 ? "#f59e0b" : "#ef4444";
                var adjWR = p.adjustedMetrics && p.adjustedMetrics.winRate != null ? p.adjustedMetrics.winRate : null;
                var mlWR = p.mlAdjustedMetrics && p.mlAdjustedMetrics.winRate != null ? p.mlAdjustedMetrics.winRate : null;
                var trades = p.tradeStats ? p.tradeStats.totalTrades || 0 : 0;
                var sharpe = p.tradeStats ? p.tradeStats.sharpeApprox || 0 : 0;
                var pf = p.tradeStats ? p.tradeStats.profitFactor : null;
                var avgRet = p.tradeStats ? p.tradeStats.avgReturn || 0 : 0;
                var maxDD = p.tradeStats ? p.tradeStats.maxDrawdown || 0 : 0;
                var age = p.backtestDate ? Math.round((Date.now() - p.backtestDate) / (24 * 60 * 60 * 1000)) : null;
                var topPillar = numVal(p, "topPillar");

                return React.createElement("tr", { key: p.symbol, style: { cursor: "default" } },
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 600 }) }, p.symbol),
                  React.createElement("td", { style: tdr }, trades),
                  React.createElement("td", { style: Object.assign({}, tdr, { fontWeight: 700, color: wrColor }) }, wr + "%"),
                  React.createElement("td", { style: Object.assign({}, tdr, { color: adjWR != null ? "#06b6d4" : "var(--text4)" }) }, adjWR != null ? adjWR + "%" : "\u2014"),
                  React.createElement("td", { style: Object.assign({}, tdr, { color: mlWR != null ? "#a78bfa" : "var(--text4)" }) }, mlWR != null ? mlWR + "%" : "\u2014"),
                  React.createElement("td", { style: tdr }, sharpe),
                  React.createElement("td", { style: Object.assign({}, tdr, { color: (pf != null && pf >= 1.5) ? "var(--accent)" : "var(--text)" }) }, (pf != null && isFinite(pf)) ? pf : "\u2014"),
                  React.createElement("td", { style: Object.assign({}, tdr, { color: avgRet >= 0 ? "var(--accent)" : "#ef4444" }) }, avgRet + "%"),
                  React.createElement("td", { style: Object.assign({}, tdr, { color: maxDD > 10 ? "#ef4444" : "var(--text)" }) }, maxDD + "%"),
                  React.createElement("td", { style: tdc }, topPillar || "\u2014"),
                  React.createElement("td", { style: Object.assign({}, tdr, { color: "var(--text3)" }) }, age != null ? age + "d" : "\u2014")
                );
              })
            )
          )
        )
      );
    }

    function renderInsights() {
      if (!patterns || patterns.length === 0) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("p", { style: { color: "var(--text2)", textAlign: "center" } }, "No insights available yet. Run a batch backtest first.")
        );
      }
      var data = buildInsightsData(patterns, insightsSym);
      if (!data) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("p", { style: { color: "var(--text2)", textAlign: "center" } }, "No insights available yet.")
        );
      }
      var symbolOpts = patterns.slice().sort(function (a, b) { return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0; });

      return React.createElement("div", null,
        // Scope selector — pooled universe or single-stock drill-down
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Report Scope"),
          React.createElement("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 } },
            React.createElement("select", {
              value: insightsSym,
              onChange: function (e) { setInsightsSym(e.target.value); },
              style: { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg1)", color: "var(--text)", fontSize: 12 }
            },
              React.createElement("option", { key: "", value: "" }, "All Stocks — pooled (" + patterns.length + ")"),
              symbolOpts.map(function (p) {
                return React.createElement("option", { key: p.symbol, value: p.symbol }, p.symbol);
              })
            ),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", lineHeight: 1.4, maxWidth: 560 } },
              data.single
                ? "Drill-down: every curve below is " + data.single.symbol + "'s own stored backtest result."
                : "Every report below is pooled from per-stock data the batch backtest already computed and stored — zero re-instrumentation."
            )
          )
        ),
        !data.single && report && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Win Rate Distribution"),
          React.createElement("div", { style: { display: "flex", gap: 4, marginTop: 8, height: 32, alignItems: "flex-end" } },
            Object.keys(report.winRateDistribution || {}).map(function (bucket) {
              var count = report.winRateDistribution[bucket];
              var maxCount = Math.max.apply(null, Object.values(report.winRateDistribution || {}));
              var height = maxCount > 0 ? (count / maxCount * 100) : 0;
              return React.createElement("div", { key: bucket, style: { flex: 1, textAlign: "center" } },
                React.createElement("div", { style: { height: height + "%", minHeight: 2, background: bucket === "70+" || bucket === "60-70" ? "var(--accent, #16a34a)" : "var(--text3)", borderRadius: 2, transition: "height 0.5s" } }),
                React.createElement("div", { style: { fontSize: 9, color: "var(--text3)", marginTop: 2 } }, bucket),
                React.createElement("div", { style: { fontSize: 11, fontWeight: 600 } }, count)
              );
            })
          )
        ),
        !data.single && report && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Top Predictive Indicators"),
          React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" } },
            Object.keys(report.topIndicators || {}).sort(function (a, b) { return report.topIndicators[b] - report.topIndicators[a]; }).map(function (ind) {
              return React.createElement("div", { key: ind, style: { padding: "4px 10px", borderRadius: 12, background: "var(--bg3)", fontSize: 12, fontWeight: 500 } },
                ind + " (" + report.topIndicators[ind] + ")"
              );
            })
          )
        ),
        renderInsCalibration(data),
        renderInsStratified(data),
        renderInsRegimes(data),
        renderInsPillars(data),
        renderInsTradeStats(data),
        renderInsEquity(data),
        renderInsBrackets(data),
        renderInsMonthly(data)
      );
    }

    /* ── 1 · Calibration Reliability Curve ─────────────────────────────── */

    function renderInsCalibration(data) {
      if (!data.cal) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "1 · Calibration Reliability Curve"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } }, "No calibration data in scope — a stock needs ≥30 trades with probTouch for its curve to exist.")
        );
      }
      var cal = data.cal;
      var _tgtDef = (window.TechIndicators && window.TechIndicators.getTargetPctDisplay) ? window.TechIndicators.getTargetPctDisplay() : 4;
      var target = (btConfig && btConfig.targetProfitPct) || _tgtDef;
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "1 · Calibration Reliability Curve — is your confidence honest?"),
        React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "Predicted probTouch (x) vs realized +" + target + "% hit rate (y) across " + cal.n + " trades" + (data.single ? "" : " pooled from all stocks") + ". On the dashed ideal line = perfectly calibrated; above the line = under-confident, below = over-confident. calP0 " + cal.calP0 + " is the probTouch that actually produces a 50% hit rate" + (data.single ? "" : " (pooled)") + "; calK " + cal.calK + " is the logit slope."
        ),
        calChart(cal.buckets, {}),
        React.createElement("div", { style: { fontSize: 12, marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", color: "var(--text2)", lineHeight: 1.5 } },
          cal.shape.text
        ),
        cal.perStock && cal.perStock.length > 1 && React.createElement("div", { style: { marginTop: 10 } },
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text3)", marginBottom: 4 } }, "calP0 by stock — where each stock's 50% crossing actually sits"),
          React.createElement("div", { style: { maxHeight: 130, overflowY: "auto" } },
            cal.perStock.map(function (r) {
              return React.createElement("div", { key: r.symbol, style: { display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11, borderBottom: "1px solid var(--border)" } },
                React.createElement("span", { style: { color: "var(--text3)" } }, r.symbol + " (n=" + r.n + ")"),
                React.createElement("span", { style: { fontWeight: 600 } }, "calP0 " + r.calP0 + " · calK " + r.calK)
              );
            })
          )
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 10, lineHeight: 1.5 } },
          "Points on the dashed line = perfectly calibrated. Below the line = model is over-confident (says 80% but only hits 60%). Above = under-confident. calP0 is the threshold where predictions cross 50% hit rate — lower calP0 means the model is more discriminating. calK is the steepness: higher = better separation between winners and losers."
        )
      );
    }

    /* ── 2 · Drift-Stratified Calibration ──────────────────────────────── */

    function renderInsStratified(data) {
      if (!data.strat || !data.strat.length) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "2 · Drift-Stratified Calibration"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } }, "No drift stratification in scope — a stock needs ≥30 trades with driftScore.")
        );
      }
      var rows = data.strat;
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "2 · Drift-Stratified Calibration — does drift separate good setups?"),
        React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "Trades split into LOW / MID / HIGH drift terciles. If the confidence model is honest, predicted probTouch and realized hit rate should both rise from low to high drift."
        ),
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" } },
          rows.map(function (r) {
            return React.createElement("div", { key: r.key, style: { flex: 1, minWidth: 170, padding: "10px 12px", borderRadius: 8, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)" } },
              React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.4 } }, r.label.replace("_DRIFT", "") + " drift"),
              React.createElement("div", { style: { fontSize: 22, fontWeight: 700, color: wrColor(r.winRate), marginTop: 2 } }, r.winRate + "%"),
              React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", marginTop: 2 } },
                "hit rate · n=" + r.n + " · avg probTouch " + r.avgProbTouch
              )
            );
          })
        ),
        React.createElement("div", { style: { fontSize: 12, marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", color: "var(--text2)", lineHeight: 1.5 } },
          stratVerdict(rows)
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 8, lineHeight: 1.5 } },
          "If HIGH drift wins more than LOW, the model is correctly identifying momentum. If all three are similar, drift score isn't adding value. If HIGH loses more, the model is chasing bad moves — retrain or recalibrate. Green = HIGH > LOW by >5%."
        )
      );
    }

    /* ── 3 · Volatility-Regime Performance ─────────────────────────────── */

    function renderInsRegimes(data) {
      if (!data.regimes || !data.regimes.length) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "3 · Volatility-Regime Performance"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } }, "No regime data in scope — needs ≥5 trades per ATR tercile per stock.")
        );
      }
      var rows = data.regimes;
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "3 · Volatility-Regime Performance — does StoX only work in calm markets?"),
        React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "Entry-date ATR(14) terciles (computed per stock) split into low / mid / high volatility buckets, with win rate and average return per regime."
        ),
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" } },
          rows.map(function (r) {
            return React.createElement("div", { key: r.key, style: { flex: 1, minWidth: 170, padding: "10px 12px", borderRadius: 8, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)" } },
              React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text3)" } }, r.label),
              React.createElement("div", { style: { fontSize: 22, fontWeight: 700, color: wrColor(r.winRate), marginTop: 2 } }, r.winRate + "%"),
              React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", marginTop: 2 } },
                "avg return " + (r.avgReturn >= 0 ? "+" : "") + r.avgReturn + "% · n=" + r.n
              )
            );
          })
        ),
        React.createElement("div", { style: { fontSize: 12, marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", color: "var(--text2)", lineHeight: 1.5 } },
          regimeVerdict(rows)
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 8, lineHeight: 1.5 } },
          "A good system performs across all regimes or improves in low volatility (where edge is easiest). If low-vol WR is much higher than high-vol, the system avoids volatile traps. If high-vol is better, the system needs momentum to work. Red flag if one regime has <10 trades — too thin to trust."
        )
      );
    }

    /* ── 4 · Indicator Power / Info Value ──────────────────────────────── */

    function renderInsPillars(data) {
      if (!data.pillars || !data.pillars.length) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "4 · Indicator Power / Info Value"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } }, "No component-power data in scope — run a batch backtest to populate.")
        );
      }
      var rows = data.pillars;
      var th = { textAlign: "left", padding: "5px 8px", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
      var tdl = { padding: "6px 8px", fontSize: 12, fontWeight: 600, borderBottom: "1px solid var(--border)" };
      var tdc = { padding: "6px 8px", fontSize: 11, borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" };
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "4 · Indicator Power — why did each pillar earn its weight?"),
        React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "Point-biserial correlation with forward hit rate, information value, and the win-rate curve across score buckets. The weights shown in Browse / Pattern Settings are derived from exactly these numbers."
        ),
        React.createElement("div", { style: { overflowX: "auto", marginTop: 6 } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null,
              React.createElement("tr", null,
                React.createElement("th", { style: th }, "Pillar"),
                React.createElement("th", { style: th }, "Corr (r)"),
                React.createElement("th", { style: th }, "Info Value"),
                React.createElement("th", { style: th }, "N"),
                React.createElement("th", { style: th }, "Bucket win-rate curve")
              )
            ),
            React.createElement("tbody", null,
              rows.map(function (p) {
                var spanTxt = "—";
                if (p.buckets && p.buckets.length >= 2) {
                  spanTxt = p.buckets[0].winRate + "% → " + p.buckets[p.buckets.length - 1].winRate + "%";
                }
                return React.createElement("tr", { key: p.key },
                  React.createElement("td", { style: tdl },
                    React.createElement("div", null, p.label),
                    React.createElement("div", { style: { fontSize: 10, color: "var(--text3)", fontWeight: 400, lineHeight: 1.4, maxWidth: 240 } }, pillarNote(p))
                  ),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 700, color: Math.abs(p.correlation) >= 0.1 ? "var(--accent, #16a34a)" : Math.abs(p.correlation) >= 0.05 ? "#f59e0b" : "var(--text3, #9ca3af)" }) }, p.correlation.toFixed(3)),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 700, color: p.infoValue >= 0.1 ? "var(--accent, #16a34a)" : p.infoValue >= 0.05 ? "#f59e0b" : "var(--text3, #9ca3af)" }) }, p.infoValue.toFixed(3)),
                  React.createElement("td", { style: tdc }, p.n),
                  React.createElement("td", { style: tdc },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 } },
                      sparkBars(p.buckets.map(function (b) { return b.winRate; })),
                      React.createElement("span", { style: { fontSize: 10, color: "var(--text3)", minWidth: 86, textAlign: "right" } }, spanTxt)
                    )
                  )
                );
              })
            )
          )
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 8 } },
          "r ≥ 0.1 = meaningful predictive signal; IV ≥ 0.1 = strong. A rising bucket curve means high pillar scores actually precede wins. Comparing these explains the weight split — e.g. Trend Health at 0.31 vs Swing Potential at 0.19."
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "Correlation (r) measures linear relationship with wins. Info Value (IV) measures how well the indicator separates winners from losers — more robust than correlation. The bucket curve is the real proof: if low buckets lose and high buckets win, the indicator is genuinely predictive, not just statistically correlated."
        )
      );
    }

    /* ── 5 · Full Trade Stats ──────────────────────────────────────────── */

    function renderInsTradeStats(data) {
      var rows = data.statRows;
      var agg = data.agg;
      var sortKey = insightsSort.key, asc = insightsSort.asc;
      var sorted = rows.slice().sort(function (a, b) {
        if (sortKey === "symbol") {
          var c = String(a.symbol).localeCompare(String(b.symbol));
          return asc ? c : -c;
        }
        var va = numForSort(a[sortKey]), vb = numForSort(b[sortKey]);
        return asc ? va - vb : vb - va;
      });
      var cols = [
        ["symbol", "Symbol"],
        ["trades", "Trades"],
        ["winRate", "Win %"],
        ["adjWinRate", "Pat WR"],
        ["mlWinRate", "ML WR"],
        ["avgReturn", "Avg Ret"],
        ["profitFactor", "PF"],
        ["maxDrawdown", "Max DD"],
        ["maxConsecWins", "W/L streak"],
        ["avgDaysToTarget", "Days"],
        ["sharpeApprox", "Sharpe"],
        ["finalEquity", "Final Eq"]
      ];
      var th = { textAlign: "left", padding: "5px 8px", fontSize: 10, color: "var(--text3)", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none", borderBottom: "1px solid var(--border)" };
      var tdl = { padding: "5px 8px", fontSize: 11, fontWeight: 600, borderBottom: "1px solid var(--border)" };
      var tdc = { padding: "5px 8px", fontSize: 11, borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" };
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "5 · Full Trade Stats"),
        React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "Everything calculateStats() already computed per stock, now rendered: profit factor, consecutive win/loss streaks, days to target, drawdown and Sharpe."
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginTop: 10 } },
          statCard("Win Rate", agg.winRate + "%"),
          agg.adjWinRate != null ? statCard("Pattern Adj WR", agg.adjWinRate + "%") : null,
          agg.mlWinRate != null ? statCard("ML Blended WR", agg.mlWinRate + "%") : null,
          statCard("Avg Return", agg.avgReturn + "%"),
          statCard("Median PF", fmtPF(agg.medianPF)),
          statCard("Median Max DD", (agg.medianDD != null ? agg.medianDD : "—") + (agg.medianDD != null ? "%" : "")),
          statCard("Max Streak", agg.maxConsecWins + "W / " + agg.maxConsecLosses + "L"),
          statCard("Avg Days to Target", agg.avgDaysToTarget != null ? agg.avgDaysToTarget : "—"),
          statCard("Avg Sharpe", agg.avgSharpe),
          statCard("Trades", agg.trades + " (" + agg.stocks + " stk)")
        ),
        React.createElement("div", { style: { maxHeight: 420, overflowY: "auto", marginTop: 10 } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null,
              React.createElement("tr", null,
                cols.map(function (c) {
                  return React.createElement("th", {
                    key: c[0],
                    style: Object.assign({}, th, { color: sortKey === c[0] ? "var(--accent, #16a34a)" : "var(--text3)" }),
                    onClick: function () { setInsightsSort({ key: c[0], asc: sortKey === c[0] ? !asc : false }); },
                    title: "Click to sort"
                  }, c[1] + (sortKey === c[0] ? (asc ? " ↑" : " ↓") : ""));
                })
              )
            ),
            React.createElement("tbody", null,
              sorted.slice(0, 60).map(function (r) {
                return React.createElement("tr", { key: r.symbol },
                  React.createElement("td", { style: tdl }, r.symbol),
                  React.createElement("td", { style: tdc }, r.trades),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 700, color: wrColor(r.winRate) }) }, r.winRate + "%"),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 700, color: r.adjWinRate != null ? "#06b6d4" : "var(--text3)" }) }, r.adjWinRate != null ? r.adjWinRate + "%" : "—"),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 700, color: r.mlWinRate != null ? "#a78bfa" : "var(--text3)" }) }, r.mlWinRate != null ? r.mlWinRate + "%" : "—"),
                  React.createElement("td", { style: Object.assign({}, tdc, { color: retColor(r.avgReturn), fontWeight: 600 }) }, (r.avgReturn >= 0 ? "+" : "") + r.avgReturn + "%"),
                  React.createElement("td", { style: tdc }, fmtPF(r.profitFactor)),
                  React.createElement("td", { style: Object.assign({}, tdc, { color: r.maxDrawdown >= 15 ? "#ef4444" : "var(--text2)" }) }, r.maxDrawdown + "%"),
                  React.createElement("td", { style: tdc }, r.maxConsecWins + "W / " + r.maxConsecLosses + "L"),
                  React.createElement("td", { style: tdc }, r.avgDaysToTarget != null ? r.avgDaysToTarget : "—"),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 700, color: r.sharpeApprox >= 0.3 ? "var(--accent, #16a34a)" : r.sharpeApprox < 0 ? "#ef4444" : "var(--text2)" }) }, r.sharpeApprox.toFixed(2)),
                  React.createElement("td", { style: Object.assign({}, tdc, { color: r.finalEquity != null ? (r.finalEquity >= 100 ? "var(--accent, #16a34a)" : "#ef4444") : "var(--text3)", fontWeight: 600 }) }, r.finalEquity != null ? Math.round(r.finalEquity) : "—")
                );
              })
            )
          )
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 8 } },
          "Click any column header to sort. Showing top " + Math.min(60, sorted.length) + " of " + sorted.length + " stocks." + (data.single ? "" : " Median PF/Max DD are medians across stocks; Win Rate/Avg Return are trade-weighted.")
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "PF > 1.5 is healthy, > 2.0 is strong. Max DD < 15% is conservative, > 25% is risky. Sharpe > 0.3 is good, > 0.5 is excellent. Final equity > 100 = profitable, < 100 = losing. Days to target < 10 = fast trades, > 20 = slow — consider capital cost."
        )
      );
    }

    /* ── 6 · Equity Curve & Drawdown ───────────────────────────────────── */

    function renderInsEquity(data) {
      var eq = data.single && data.single.equityCurve;
      var rowsEq = data.statRows.filter(function (r) { return r.finalEquity != null; });
      var hasCurve = eq && eq.curve && eq.curve.length > 1;
      var inner = null;
      if (hasCurve) {
        var pts = eq.curve;
        inner = React.createElement("div", null,
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
            data.single.symbol + " — " + pts.length + " trades, " + pts[0].date + " → " + pts[pts.length - 1].date + ". Final equity " + eq.finalEquity + " (" + (eq.finalEquity >= 100 ? "+" : "") + (eq.finalEquity - 100).toFixed(1) + "%), max drawdown " + eq.maxDrawdown + "%, per-trade Sharpe " + eq.sharpeApprox + "."
          ),
          eqChart(pts, {}),
          React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 6 } },
            "Shaded region = equity below its running peak; its depth is the drawdown series."
          )
        );
      } else if (rowsEq.length > 0) {
        var sorted = rowsEq.slice().sort(function (a, b) { return b.finalEquity - a.finalEquity; });
        var best = sorted[0], worst = sorted[sorted.length - 1];
        var avgEq = sorted.reduce(function (s, r) { return s + r.finalEquity; }, 0) / sorted.length;
        var th = { textAlign: "left", padding: "5px 8px", fontSize: 10, color: "var(--text3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
        var tdl = { padding: "5px 8px", fontSize: 11, fontWeight: 600, borderBottom: "1px solid var(--border)" };
        var tdc = { padding: "5px 8px", fontSize: 11, borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" };
        inner = React.createElement("div", null,
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
            rowsEq.length + " of " + data.statRows.length + " patterns carry an equity curve (older patterns predate it — rerun the batch to populate). Best: " + best.symbol + " ends at " + best.finalEquity + "; worst: " + worst.symbol + " at " + worst.finalEquity + ". Mean final equity " + Math.round(avgEq * 10) / 10 + " (100 = breakeven)."
          ),
          React.createElement("div", { style: { maxHeight: 260, overflowY: "auto", marginTop: 6 } },
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
              React.createElement("thead", null,
                React.createElement("tr", null,
                  React.createElement("th", { style: th }, "Symbol"),
                  React.createElement("th", { style: th }, "Final Equity"),
                  React.createElement("th", { style: th }, "Max DD"),
                  React.createElement("th", { style: th }, "Sharpe"),
                  React.createElement("th", { style: th }, "Win %"),
                  React.createElement("th", { style: th }, "Trades")
                )
              ),
              React.createElement("tbody", null,
                sorted.slice(0, 15).map(function (r) {
                  return React.createElement("tr", { key: r.symbol },
                    React.createElement("td", { style: tdl }, r.symbol),
                    React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 700, color: r.finalEquity >= 100 ? "var(--accent, #16a34a)" : "#ef4444" }) }, Math.round(r.finalEquity)),
                    React.createElement("td", { style: tdc }, r.maxDrawdown + "%"),
                    React.createElement("td", { style: tdc }, r.sharpeApprox.toFixed(2)),
                    React.createElement("td", { style: tdc }, r.winRate + "%"),
                    React.createElement("td", { style: tdc }, r.trades)
                  );
                })
              )
            )
          ),
          React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 8 } },
            "Select a stock above to chart its full equity curve."
          ),
          React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
            "Final equity > 100 = net profit; < 100 = net loss. Max DD = deepest peak-to-trough drop — the real risk measure. Sharpe > 0.3 = good risk-adjusted return, > 0.5 = excellent. Sort by final equity to find best/worst performers."
          )
        );
      } else {
        inner = React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } },
          "No equity-curve data stored in scope yet — run a fresh batch backtest to populate it."
        );
      }
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "6 · Equity Curve & Drawdown"),
        inner
      );
    }

    /* ── 7 · Signal-Bracket Lift (entry-score monotonicity) ────────────── */

    function renderInsBrackets(data) {
      if (!data.brackets || !data.brackets.length) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "7 · Signal-Bracket Lift"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } }, "No bracket data in scope — older patterns predate it; rerun the batch to populate.")
        );
      }
      var rows = data.brackets;
      var verdict = bracketVerdict(rows);
      var th = { textAlign: "left", padding: "5px 8px", fontSize: 10, color: "var(--text3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
      var tdl = { padding: "6px 8px", fontSize: 12, fontWeight: 700, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
      var tdc = { padding: "6px 8px", fontSize: 11, borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" };
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "7 · Signal-Bracket Lift — is your entry score monotonic?"),
        React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "Trades grouped by STRONG_BUY / BUY / WATCHLIST / NEUTRAL. A higher score bracket should come with a higher win rate — this is the direct test of the entry score's monotonicity."
        ),
        React.createElement("div", { style: { overflowX: "auto", marginTop: 6 } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null,
              React.createElement("tr", null,
                React.createElement("th", { style: th }, "Bracket"),
                React.createElement("th", { style: th }, "Trades"),
                React.createElement("th", { style: th }, "Win Rate"),
                React.createElement("th", { style: th }, "Avg Return")
              )
            ),
            React.createElement("tbody", null,
              rows.map(function (r) {
                return React.createElement("tr", { key: r.key },
                  React.createElement("td", { style: tdl }, r.key),
                  React.createElement("td", { style: tdc }, r.n),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 700, color: wrColor(r.winRate) }) }, r.winRate + "%"),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 600, color: retColor(r.avgReturn) }) }, (r.avgReturn >= 0 ? "+" : "") + r.avgReturn + "%")
                );
              })
            )
          )
        ),
        React.createElement("div", { style: { fontSize: 12, marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", color: "var(--text2)", lineHeight: 1.5 } },
          verdict
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 8, lineHeight: 1.5 } },
          "Monotonic = STRONG_BUY > BUY > WATCHLIST > NEUTRAL in win rate. This is the most direct test of the score's value. If brackets overlap or reverse, the score thresholds are miscalibrated — the system can't distinguish strong from weak entries. Green = monotonic, Red = broken."
        )
      );
    }

    /* ── 8 · Monthly Breakdown ─────────────────────────────────────────── */

    function renderInsMonthly(data) {
      if (!data.monthly || !data.monthly.length) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "8 · Monthly Breakdown"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } }, "No monthly data in scope — older patterns predate it; rerun the batch to populate.")
        );
      }
      var rows = data.monthly;
      var maxT = Math.max.apply(null, rows.map(function (r) { return r.trades; }));
      var th = { textAlign: "left", padding: "5px 8px", fontSize: 10, color: "var(--text3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
      var tdl = { padding: "6px 8px", fontSize: 12, fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
      var tdc = { padding: "6px 8px", fontSize: 11, borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" };
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "8 · Monthly Breakdown — seasonality & consistency"),
        React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "Trades pooled by entry month. Reveals seasonal patterns and consistency — a system that only wins in a few months is fragile."
        ),
        React.createElement("div", { style: { display: "flex", gap: 4, marginTop: 8, height: 52, alignItems: "flex-end", overflowX: "auto" } },
          rows.map(function (r) {
            var h = maxT > 0 ? Math.max(2, (r.trades / maxT) * 40) : 2;
            return React.createElement("div", { key: r.key, style: { minWidth: 28, textAlign: "center", flex: "none" } },
              React.createElement("div", { title: r.key + ": " + r.trades + " trades, " + r.winRate + "% WR, " + (r.avgReturn >= 0 ? "+" : "") + r.avgReturn + "% avg return", style: { height: h, background: wrColor(r.winRate), borderRadius: 2, marginBottom: 2 } }),
              React.createElement("div", { style: { fontSize: 8, color: "var(--text3)" } }, r.key)
            );
          })
        ),
        React.createElement("div", { style: { overflowX: "auto", marginTop: 10 } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null,
              React.createElement("tr", null,
                React.createElement("th", { style: th }, "Month"),
                React.createElement("th", { style: th }, "Trades"),
                React.createElement("th", { style: th }, "Win Rate"),
                React.createElement("th", { style: th }, "Avg Return")
              )
            ),
            React.createElement("tbody", null,
              rows.map(function (r) {
                return React.createElement("tr", { key: r.key },
                  React.createElement("td", { style: tdl }, r.key),
                  React.createElement("td", { style: tdc }, r.trades),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 700, color: wrColor(r.winRate) }) }, r.winRate + "%"),
                  React.createElement("td", { style: Object.assign({}, tdc, { fontWeight: 600, color: retColor(r.avgReturn) }) }, (r.avgReturn >= 0 ? "+" : "") + r.avgReturn + "%")
                );
              })
            )
          )
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 8 } },
          "Bar height = trade count; bar color = that month's win rate."
        ),
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
          "Look for consistency: a robust system should be profitable across most months. Months with <10 trades are too thin to trust. If only 2-3 months are profitable, the system may be overfitted to those periods. Green bars = months where WR > 50%."
        )
      );
    }

    /* ── Helper Components ──────────────────────────────────────────────── */

    function statCard(label, value) {
      return React.createElement("div", { style: cardStyle, key: label },
        React.createElement("div", { style: labelStyle }, label),
        React.createElement("div", { style: valueStyle }, value)
      );
    }

    function configField(label, value, onChange) {
      return React.createElement("div", null,
        React.createElement("label", { style: { fontSize: 12, fontWeight: 500, display: "block", marginBottom: 2 } }, label),
        React.createElement("input", {
          type: "number", value: value, onChange: function (e) { onChange(e.target.value); },
          style: { width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box" }
        })
      );
    }

    function patternRow(p) {
      var wr = p.tradeStats ? p.tradeStats.winRate : 0;
      var wrColor = wr >= 60 ? "var(--accent, #16a34a)" : wr >= 45 ? "#f59e0b" : "#ef4444";
      var adjWR = p.adjustedMetrics && p.adjustedMetrics.winRate != null ? p.adjustedMetrics.winRate : null;
      var mlWR = p.mlAdjustedMetrics && p.mlAdjustedMetrics.winRate != null ? p.mlAdjustedMetrics.winRate : null;
      var topW = null;
      var lw = p.indicatorWeights;
      if (p && window.PatternScoring && window.PatternScoring.resolveLearnedWeights) {
        var rlw2 = window.PatternScoring.resolveLearnedWeights(p);
        if (rlw2) lw = rlw2;
      }
      if (lw) {
        var max = 0;
        Object.keys(lw).forEach(function (k) { if (lw[k] > max) { max = lw[k]; topW = k; } });
      }
      var age = p.backtestDate ? Math.round((Date.now() - p.backtestDate) / (24 * 60 * 60 * 1000)) : null;

      return React.createElement("div", { key: p.symbol, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--bg2)", borderRadius: 8, marginBottom: 6, border: "1px solid var(--border)" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, p.symbol),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", marginTop: 2 } },
            (p.tradeStats ? p.tradeStats.totalTrades : 0) + " trades" +
            (topW ? " | Top: " + topW : "") +
            (age != null ? " | " + age + "d ago" : "") +
            (p.calibration && p.calibration.global ? " | Calibrated" : "")
          )
        ),
        React.createElement("div", { style: { textAlign: "right" } },
          React.createElement("div", { style: { fontWeight: 700, fontSize: 16, color: wrColor } }, wr + "%"),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text3)", marginTop: 2 } },
            adjWR != null ? React.createElement("span", { style: { color: "#06b6d4" } }, "Pat:" + adjWR + "%") : null,
            adjWR != null && mlWR != null ? " " : null,
            mlWR != null ? React.createElement("span", { style: { color: "#a78bfa" } }, "ML:" + mlWR + "%") : null
          ),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text3)" } }, "Sharpe: " + (p.tradeStats ? p.tradeStats.sharpeApprox || 0 : 0))
        )
      );
    }

    /* ── Live Expert Tab ────────────────────────────────────────────────── */

    var _liveLogRef = [];
    function pushLiveLog(msg) {
      var entry = { time: new Date().toLocaleTimeString(), msg: msg };
      _liveLogRef = _liveLogRef.concat([entry]).slice(-50);
      setLiveLog(_liveLogRef.slice());
    }

    function flushLiveLogLive() {
      var snapshot = _liveLogRef.slice();
      if (window.LiveML && window.LiveML.saveLiveLog) {
        window.LiveML.saveLiveLog(snapshot).catch(function () {});
      }
    }

    async function loadPersistedScan() {
      if (!window.LiveML) return;
      try {
        if (window.LiveML.loadMorningScan) {
          var entry = await window.LiveML.loadMorningScan();
          if (entry && entry.signals && entry.signals.length) {
            setLiveSignals(entry.signals);
            var age = Date.now() - (entry.timestamp || 0);
            if (age < 12 * 3600 * 1000) setActiveLiveStep(1);
          }
        }
      } catch (e) {}
      try {
        if (window.LiveML.loadLiveLog) {
          var logLines = await window.LiveML.loadLiveLog();
          if (logLines && logLines.length) {
            _liveLogRef = logLines;
            setLiveLog(logLines);
          }
        }
      } catch (e) {}
    }

    async function handleTodaySignals() {
      if (!window.LiveML) { setError("LiveML module not loaded"); return; }
      setLiveBusy(true);
      setLiveProg(null);
      setLiveSignals(null);
      setValidationReport(null);
      setImprovementReport(null);
      setActiveLiveStep(1);
      pushLiveLog("=== STEP 1: Morning Scan ===");
      pushLiveLog("Scoring today's setup for the universe (latest bar)...");
      try {
        var diagLog = null;
        var signals = await window.LiveML.getTodaySignals({
          count: 20,
          onProgress: function (current, total, msg) {
            setLiveProg({ done: current, total: total });
            pushLiveLog("[" + Math.round((total > 0 ? current / total * 100 : 0)) + "%] " + (msg || "Scoring " + current + "/" + total + "..."));
          },
          onDiagnostics: function (d) { diagLog = d; }
        });
        setLiveSignals(signals);
        await loadLiveStatus();
        if (diagLog) {
          var rejectKeys = Object.keys(diagLog.rejects || {});
          if (rejectKeys.length > 0) {
            var parts = rejectKeys.map(function (k) { return k + ": " + diagLog.rejects[k]; });
            pushLiveLog("Rejects: " + parts.join(", "));
          }
          pushLiveLog("Scored: " + (diagLog.scored || 0) + " / " + (diagLog.scored || 0) + (diagLog.scored > 0 ? " (model-based: " + signals.filter(function (s) { return s.modelUsed; }).length + ")" : ""));
        }
        pushLiveLog("STEP 1 COMPLETE: " + signals.length + " signals scored");
        if (signals.length > 0) {
          pushLiveLog("Top pick: " + signals[0].symbol + " | Live: \u20B9" + (signals[0].close != null ? signals[0].close.toFixed(2) : "?") + " | Pred: \u20B9" + (signals[0].predictedClose != null ? signals[0].predictedClose.toFixed(2) : "?") + " | Exp: " + (signals[0].expectedChgPct != null ? (signals[0].expectedChgPct >= 0 ? "+" : "") + signals[0].expectedChgPct + "%" : "N/A") + (signals[0].modelUsed ? " [ML]" : " [Tech]"));
        }
        pushLiveLog("Run Step 2 (Evening Validate) after market close to check predictions.");
        await window.LiveML.saveMorningScan(signals);
      } catch (err) {
        pushLiveLog("ERROR: " + err.message);
        setError("Today's signals failed: " + err.message);
      } finally {
        flushLiveLogLive();
        setLiveProg(null);
        setLiveBusy(false);
      }
    }

    async function handleEveningValidate() {
      if (!window.LiveML) { setError("LiveML module not loaded"); return; }
      setLiveBusy(true);
      setValidationReport(null);
      setActiveLiveStep(2);
      pushLiveLog("=== STEP 2: Evening Validation ===");
      pushLiveLog("Resolving yesterday's picks against actual market data...");
      try {
        var report = await window.LiveML.resolveAndValidate({
          onProgress: function (current, total, msg) { pushLiveLog("[" + Math.round((total > 0 ? current / total * 100 : 0)) + "%] " + msg); }
        });
        setValidationReport(report);
        pushLiveLog("STEP 2 COMPLETE: " + report.summary.resolved + " picks resolved, " + report.summary.hits + " hits, " + report.summary.misses + " misses");
        if (report.summary.hitRate != null) {
          pushLiveLog("Hit rate: " + report.summary.hitRate + "% | Base rate: " + (liveStatus && liveStatus.corpus && liveStatus.corpus.baseRate != null ? liveStatus.corpus.baseRate + "%" : "N/A"));
        }
        // Also refresh today's signals for context
        pushLiveLog("Refreshing today's signals for comparison...");
        var signals = await window.LiveML.getTodaySignals({ count: 20, track: false });
        setLiveSignals(signals);
        if (window.LiveML.saveMorningScan) await window.LiveML.saveMorningScan(signals);
        await loadLiveStatus();
      } catch (err) {
        pushLiveLog("ERROR: " + err.message);
        setError("Evening validation failed: " + err.message);
      } finally {
        flushLiveLogLive();
        setLiveBusy(false);
      }
    }

    async function handleNightLearn() {
      if (!window.LiveML) { setError("LiveML module not loaded"); return; }
      setLiveBusy(true);
      setImprovementReport(null);
      setActiveLiveStep(3);
      pushLiveLog("=== STEP 3: Night Learning ===");
      pushLiveLog("Retraining model on confirmed outcomes...");
      try {
        var report = await window.LiveML.retrainWithLearning({
          numFolds: 5,
          epochsPerFold: 20,
          onProgress: function (current, total, msg) { pushLiveLog(msg); }
        });
        setImprovementReport(report);
        pushLiveLog("STEP 3 COMPLETE: Model retrained and ready for tomorrow");
        if (report.before.walkForwardAcc != null && report.after.walkForwardAcc != null) {
          pushLiveLog("WF Accuracy: " + report.before.walkForwardAcc + "% → " + report.after.walkForwardAcc + "% (" + (report.improvement.accDelta >= 0 ? "+" : "") + report.improvement.accDelta + "%)");
        }
        if (report.promotion) {
          pushLiveLog("Promotion: " + report.promotion.reason);
        }
        pushLiveLog("Ready for tomorrow's Step 1 (Morning Scan).");
        await loadLiveStatus();
      } catch (err) {
        pushLiveLog("ERROR: " + err.message);
        setError("Night learning failed: " + err.message);
      } finally {
        flushLiveLogLive();
        setLiveBusy(false);
      }
    }

    /* ── Pattern Settings (per-stock weight overrides) ─────────────────── */

    function updatePatternDraft(symbol, key, sliderVal) {
      setPatternSettings(function (prev) {
        return (prev || []).map(function (r) {
          if (r.symbol !== symbol) return r;
          var d = Object.assign({}, r.draft);
          d[key] = Math.round(sliderVal) / 100;
          return Object.assign({}, r, { draft: d });
        });
      });
    }

    function togglePatternEnabled(symbol, enabled) {
      setPatternSettings(function (prev) {
        return (prev || []).map(function (r) {
          if (r.symbol !== symbol) return r;
          return Object.assign({}, r, { enabled: enabled });
        });
      });
    }

    async function handleSavePatternSettings(symbol) {
      var row = (patternSettings || []).filter(function (r) { return r.symbol === symbol; })[0];
      if (!row) return;
      try {
        await window.PatternStore.init();
        if (row.enabled) {
          await window.PatternStore.setWeightOverride(symbol, {
            trendHealth: row.draft.trendHealth,
            pullbackQuality: row.draft.pullbackQuality,
            prob4: row.draft.prob4,
            swingPotential: row.draft.swingPotential
          });
          setError("Saved manual weights for " + symbol);
        } else {
          await window.PatternStore.clearWeightOverride(symbol);
          setError("Cleared override for " + symbol + " — learned weights restored");
        }
        setTimeout(function () { setError(null); }, 3000);
      } catch (err) {
        setError("Save failed: " + err.message);
      }
    }

    async function handleRevertPatternSettings(symbol) {
      try {
        await window.PatternStore.init();
        await window.PatternStore.clearWeightOverride(symbol);
        setPatternSettings(function (prev) {
          return (prev || []).map(function (r) {
            if (r.symbol !== symbol) return r;
            var lw = r.learned;
            return Object.assign({}, r, {
              enabled: false,
              draft: { trendHealth: lw.trendHealth, pullbackQuality: lw.pullbackQuality, prob4: lw.prob4, swingPotential: lw.swingPotential }
            });
          });
        });
        setError("Reverted " + symbol + " to learned weights");
        setTimeout(function () { setError(null); }, 3000);
      } catch (err) {
        setError("Revert failed: " + err.message);
      }
    }

    async function handleResetAllPatternSettings() {
      if (!resetAllConfirm) {
        setResetAllConfirm(true);
        setTimeout(function () { setResetAllConfirm(false); }, 5000);
        return;
      }
      setResetAllConfirm(false);
      try {
        await window.PatternStore.init();
        if (window.PatternStore.clearAllWeightOverrides) {
          await window.PatternStore.clearAllWeightOverrides();
        }
        // Blend is global: reset it to full learned so "Reset All" genuinely
        // restores the learned profile for every stock. Otherwise a leftover
        // blend (e.g. 0%) keeps scoring identity and the learned line at 25%.
        if (window.PatternStore.setWeightBlend) {
          await window.PatternStore.setWeightBlend(1);
        }
        setPatternBlend(1);
        setPatternSettings(function (prev) {
          return (prev || []).map(function (r) {
            var lw = r.learned;
            return Object.assign({}, r, {
              enabled: false,
              draft: { trendHealth: lw.trendHealth, pullbackQuality: lw.pullbackQuality, prob4: lw.prob4, swingPotential: lw.swingPotential }
            });
          });
        });
        setError("All overrides cleared and blend reset to 100% learned — every stock back on its learned weights");
        setTimeout(function () { setError(null); }, 4000);
      } catch (err) {
        setError("Reset failed: " + err.message);
      }
    }

    /* ── Bulk adjust: apply uniform pillar deltas to selected stocks ────── */

    function blendW(lw, b) {
      var P = ["trendHealth", "pullbackQuality", "prob4", "swingPotential"];
      var out = {};
      P.forEach(function (k) { out[k] = Math.round((b * (lw[k] != null ? lw[k] : 0.25) + (1 - b) * 0.25) * 1000) / 1000; });
      return out;
    }

    async function persistBlend() {
      try {
        await window.PatternStore.init();
        await window.PatternStore.setWeightBlend(patternBlend);
        setError("Blend saved: " + Math.round(patternBlend * 100) + "% learned / " + Math.round((1 - patternBlend) * 100) + "% calculated — overrides unaffected");
        setTimeout(function () { setError(null); }, 2500);
      } catch (e) {
        setError("Blend save failed: " + e.message);
      }
    }

    function toggleBulkSelect(symbol) {
      setBulkSel(function (prev) {
        var n = Object.assign({}, prev);
        if (n[symbol]) delete n[symbol]; else n[symbol] = true;
        return n;
      });
    }

    function bulkSelectRows(rows) {
      setBulkSel(function (prev) {
        var n = Object.assign({}, prev);
        rows.forEach(function (r) { n[r.symbol] = true; });
        return n;
      });
    }

    function bulkClearSel() {
      setBulkSel({});
    }

    function bulkDeltaChange(key, val) {
      var d = Object.assign({}, bulkDeltas);
      d[key] = val;
      setBulkDeltas(d);
    }

    async function handleBulkApply() {
      var selected = Object.keys(bulkSel).filter(function (k) { return bulkSel[k]; });
      if (selected.length === 0) {
        setError("No stocks selected — tick the checkboxes first");
        setTimeout(function () { setError(null); }, 3000);
        return;
      }
      var P = ["trendHealth", "pullbackQuality", "prob4", "swingPotential"];
      var hasAny = P.some(function (k) { return (bulkDeltas[k] || 0) !== 0; });
      if (!hasAny) {
        setError("Set at least one pillar delta (%) before applying");
        setTimeout(function () { setError(null); }, 3000);
        return;
      }
      if (!bulkConfirm) {
        setBulkConfirm(true);
        setTimeout(function () { setBulkConfirm(false); }, 5000);
        return;
      }
      setBulkConfirm(false);
      try {
        await window.PatternStore.init();
        var ov = await window.PatternStore.getWeightOverrides();
        var pats = await window.PatternStore.getAll();
        var patMap = {};
        pats.forEach(function (p) { if (p && p.symbol) patMap[p.symbol] = p; });
        var next = {};
        selected.forEach(function (sym) {
          var base = {};
          P.forEach(function (k) {
            var v = ov[sym] && ov[sym][k] != null ? ov[sym][k] : null;
            if (v == null && patMap[sym]) {
              var lw = patMap[sym].indicatorWeights;
              if (window.PatternScoring && window.PatternScoring.resolveLearnedWeights) {
                var rlw = window.PatternScoring.resolveLearnedWeights(patMap[sym], true);
                if (rlw) lw = rlw;
              }
              v = lw && lw[k] != null ? lw[k] : 0.25;
            }
            if (v == null) v = 0.25;
            base[k] = v;
          });
          var nw = {};
          P.forEach(function (k) {
            var delta = bulkDeltas[k] || 0;
            nw[k] = Math.max(0.05, Math.min(0.95, base[k] + delta / 100));
          });
          var sum = P.reduce(function (s, k) { return s + nw[k]; }, 0);
          if (sum > 0) P.forEach(function (k) { nw[k] = Math.round(nw[k] / sum * 1000) / 1000; });
          next[sym] = nw;
        });
        var syms = Object.keys(next);
        for (var i = 0; i < syms.length; i++) {
          await window.PatternStore.setWeightOverride(syms[i], next[syms[i]]);
        }
        setPatternSettings(function (prev) {
          return (prev || []).map(function (r) {
            if (!next[r.symbol]) return r;
            return Object.assign({}, r, { enabled: true, draft: next[r.symbol] });
          });
        });
        setError("Bulk-applied to " + syms.length + " stock(s)");
        setTimeout(function () { setError(null); }, 3000);
      } catch (err) {
        setError("Bulk apply failed: " + err.message);
      }
    }

    function renderPatternSettings() {
      if (!patternSettings) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("p", { style: { color: "var(--text2)" } }, "Loading patterns..."));
      }
      var pillars = [
        ["trendHealth", "Trend Health"],
        ["pullbackQuality", "Pullback"],
        ["prob4", "4% Prob"],
        ["swingPotential", "Swing"]
      ];
      var query = patternSearch.trim().toUpperCase();
      var rows = patternSettings.filter(function (r) {
        return !query || r.symbol.indexOf(query) !== -1;
      });
      return React.createElement("div", null,
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Pattern Settings"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
            "Per-stock pillar weights drive the pattern bonus/penalty on entry scores. \"Learned\" = from each stock's batch backtest (component power). Toggle Override, slide the weights (0-100%), Save. Overrides always win over the blend and start from the raw learned profile (not the blended values). Bulk adjust: tick checkboxes, set per-pillar Δ% (e.g. +10 Trend, -10 Swing), Apply to Selected — deltas are clamped 5-95% and renormalized to 100%. The Learned-weight blend slider mixes learned weights with calculated 25% for non-overridden stocks only. Overrides apply to all pattern-adjusted scoring and travel with backups."
          ),
          React.createElement("div", { style: { marginTop: 10 } },
            React.createElement("div", { style: { display: "flex", gap: 16, marginBottom: 10, padding: "8px 12px", background: "var(--bg2)", borderRadius: 6, border: "1px solid var(--border)" } },
              React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 } },
                React.createElement("input", { type: "checkbox", checked: scoringCfg.usePatternWeights !== false, onChange: function (e) { var next = Object.assign({}, scoringCfg, { usePatternWeights: e.target.checked }); setScoringCfg(next); if (window.setScoringConfig) window.setScoringConfig(next); }, style: { cursor: "pointer" } }),
                React.createElement("span", { style: { fontWeight: 600 } }, "Pattern Re-weighting"),
                React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, "(pillar weight adjustment)")
              ),
              React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 } },
                React.createElement("input", { type: "checkbox", checked: scoringCfg.useMLBlend !== false, onChange: function (e) { var next = Object.assign({}, scoringCfg, { useMLBlend: e.target.checked }); setScoringCfg(next); if (window.setScoringConfig) window.setScoringConfig(next); }, style: { cursor: "pointer" } }),
                React.createElement("span", { style: { fontWeight: 600 } }, "ML Blend"),
                React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, "(champion model overlay)")
              )
            ),
            React.createElement("input", {
              className: "inp", type: "text", placeholder: "Filter by symbol (e.g. RELIANCE)...",
              value: patternSearch,
              onChange: function (e) { setPatternSearch(e.target.value); },
              style: { width: 260, fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg1)", color: "var(--text)" }
            }),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", marginLeft: 10 } },
              rows.length + " / " + patternSettings.length + " stocks" + (rows.filter(function (r) { return r.enabled; }).length > 0 ? " · " + rows.filter(function (r) { return r.enabled; }).length + " overridden" : "")
            ),
            React.createElement("button", {
              onClick: handleResetAllPatternSettings,
              style: { padding: "6px 12px", borderRadius: 6, background: resetAllConfirm ? "#dc2626" : "var(--bg3, #f3f4f6)", border: "1px solid " + (resetAllConfirm ? "#dc2626" : "var(--border)"), color: resetAllConfirm ? "#fff" : "var(--text2)", cursor: "pointer", fontSize: 11, fontWeight: 600, marginLeft: 10 }
            }, resetAllConfirm ? "Confirm — reset ALL overrides?" : "Reset All Overrides")
          ),
          React.createElement("div", { style: { marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--text2)" } },
              "Bulk adjust: " + Object.keys(bulkSel).length + " selected"
            ),
            React.createElement("button", {
              onClick: function () { bulkSelectRows(rows); },
              style: { padding: "4px 10px", borderRadius: 5, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11 }
            }, "Select all filtered (" + rows.length + ")"),
            React.createElement("button", {
              onClick: bulkClearSel,
              disabled: Object.keys(bulkSel).length === 0,
              style: { padding: "4px 10px", borderRadius: 5, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: Object.keys(bulkSel).length === 0 ? "not-allowed" : "pointer", fontSize: 11, opacity: Object.keys(bulkSel).length === 0 ? 0.5 : 1 }
            }, "Clear"),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text3)" } }, "Δ%:"),
            [["trendHealth", "Trend"], ["pullbackQuality", "Pullback"], ["prob4", "Prob4"], ["swingPotential", "Swing"]].map(function (bk) {
              return React.createElement("label", { key: bk[0], style: { fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--text3)" } },
                bk[1],
                React.createElement("input", {
                  type: "number", min: -100, max: 100, step: 5,
                  value: bulkDeltas[bk[0]] || 0,
                  onChange: function (e) { bulkDeltaChange(bk[0], parseInt(e.target.value, 10) || 0); },
                  style: { width: 62, padding: "4px 6px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg1)", color: "var(--text)", fontSize: 12 }
                })
              );
            }),
            React.createElement("button", {
              onClick: handleBulkApply,
              style: { padding: "6px 12px", borderRadius: 6, background: bulkConfirm ? "#dc2626" : "var(--accent, #16a34a)", color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }
            }, bulkConfirm ? "Confirm — apply to " + Object.keys(bulkSel).length + "?" : "Apply to Selected")
          ),
          React.createElement("div", { style: { marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--text2)" } }, "Learned-weight blend:"),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", minWidth: 92, textAlign: "right", lineHeight: 1.3 } }, "Pillar Equal Weights"),
            React.createElement("input", {
              type: "range", min: 0, max: 100, step: 5,
              value: Math.round(patternBlend * 100),
              onChange: function (e) { setPatternBlend(parseInt(e.target.value, 10) / 100); },
              onMouseUp: persistBlend,
              onTouchEnd: persistBlend,
              onKeyUp: persistBlend,
              style: { width: 200 }
            }),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", minWidth: 92, lineHeight: 1.3 } }, "Pillar Learned Weights"),
            React.createElement("span", { style: { fontSize: 12, color: "var(--text2)", fontFamily: "monospace" } },
              Math.round(patternBlend * 100) + "% learned / " + Math.round((1 - patternBlend) * 100) + "% calculated"
            ),
            React.createElement("button", {
              onClick: function () { setPatternBlend(0.5); persistBlend(); },
              style: { padding: "4px 10px", borderRadius: 5, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11 }
            }, "50/50"),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text3)" } },
              "Left = every pillar counted equally (25% each); right = each stock's backtest-learned profile. Overrides are unaffected."
            )
          )
        ),
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: { maxHeight: 560, overflowY: "auto" } },
            rows.map(function (r) {
              var wr = r.winRate != null ? Math.round(r.winRate) + "%" : "—";
              var age = r.backtestDate ? Math.round((Date.now() - r.backtestDate) / (24 * 60 * 60 * 1000)) + "d" : "—";
              return React.createElement("div", { key: r.symbol, style: { border: "1px solid " + (r.enabled ? "rgba(22,163,74,.45)" : "var(--border)"), borderRadius: 8, padding: 8, marginBottom: 8, background: r.enabled ? "rgba(22,163,74,.05)" : "transparent" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
                    React.createElement("input", {
                      type: "checkbox",
                      checked: !!bulkSel[r.symbol],
                      onChange: function () { toggleBulkSelect(r.symbol); },
                      title: "Select for bulk adjust",
                      style: { accentColor: "var(--accent, #16a34a)" }
                    }),
                    React.createElement("span", { style: { fontWeight: 700, fontSize: 13 } }, r.symbol),
                    React.createElement("span", { style: { fontSize: 11, color: "var(--text3)" } },
                      r.hasPattern ? ("WR " + wr + " · " + r.trades + " trades · " + age) : "no pattern yet — default 25% each"
                    ),
                    React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", fontFamily: "monospace" } },
                      (function () {
                        var P = ["trendHealth", "pullbackQuality", "prob4", "swingPotential"];
                        // Always show the RAW learned profile so a low blend can
                        // never mask it (blend 0% previously rendered 25% for
                        // every pillar and looked like learned was lost).
                        var raw = P.map(function (k) { return Math.round((r.learned[k] != null ? r.learned[k] : 0.25) * 100); }).join("/") + "%";
                        if (patternBlend >= 1) return "learned: " + raw;
                        var eff = blendW(r.learned, patternBlend);
                        var effTxt = P.map(function (k) { return Math.round(eff[k] * 100); }).join("/") + "%";
                        return "learned: " + raw + " · blend " + Math.round(patternBlend * 100) + "% → eff " + effTxt;
                      })()
                    )
                  ),
                  React.createElement("label", { style: { fontSize: 12, display: "flex", alignItems: "center", gap: 4 } },
                    React.createElement("input", { type: "checkbox", checked: r.enabled, onChange: function (e) { togglePatternEnabled(r.symbol, e.target.checked); } }),
                    "Override"
                  )
                ),
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 } },
                  pillars.map(function (pillar) {
                    var key = pillar[0];
                    var val = r.draft[key] != null ? r.draft[key] : 0.25;
                    return React.createElement("div", { key: key, style: { fontSize: 11 } },
                      React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } },
                        React.createElement("span", { style: { color: "var(--text3)" } }, pillar[1]),
                        React.createElement("span", { style: { fontWeight: 600 } }, Math.round(val * 100) + "%")
                      ),
                      React.createElement("input", {
                        type: "range", min: 0, max: 100, step: 1,
                        value: Math.round(val * 100),
                        disabled: !r.enabled,
                        onChange: function (e) { updatePatternDraft(r.symbol, key, parseInt(e.target.value, 10)); },
                        style: { width: "100%" }
                      })
                    );
                  })
                ),
                React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 6 } },
                  React.createElement("button", {
                    onClick: function () { handleSavePatternSettings(r.symbol); },
                    disabled: !r.enabled,
                    style: { padding: "4px 12px", borderRadius: 5, background: r.enabled ? "var(--accent, #16a34a)" : "#9ca3af", color: "#fff", border: "none", cursor: r.enabled ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 600 }
                  }, "Save"),
                  React.createElement("button", {
                    onClick: function () { handleRevertPatternSettings(r.symbol); },
                    style: { padding: "4px 12px", borderRadius: 5, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11 }
                  }, "Reset to Default")
                )
              );
            }),
            rows.length === 0 && React.createElement("p", { style: { color: "var(--text3)", fontSize: 12, padding: 12 } }, "No stocks match \"" + patternSearch + "\".")
          )
        )
      );
    }

    function renderLiveExpert() {
      var hasLive = !!(window.LiveML);
      var corpus = liveStatus && liveStatus.corpus;
      var signs = liveStatus && liveStatus.signs;
      var importance = liveStatus && liveStatus.champion && liveStatus.champion.featureImportance;
      var brPct = function (br) { return br != null ? (br > 0 && br < 1 ? br * 100 : br) : null; };
      var base = liveStatus && liveStatus.corpus && liveStatus.corpus.baseRate != null ? brPct(liveStatus.corpus.baseRate) : null;

      // Helper: step button style
      function stepBtn(active, color) {
        return { fontSize: 10, fontWeight: 700, color: active ? "#fff" : color, background: active ? color : "transparent", border: "1px solid " + color, padding: "3px 8px", borderRadius: 4 };
      }

      return React.createElement("div", null,
        // ── Status Header ──
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Live Expert — Daily Learning Cycle"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
            "Three-step daily workflow: Morning scan picks top 20 stocks, evening validates predictions against actuals, night retrains the model to improve for tomorrow."
          ),
          // Step indicators
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 12, flexWrap: "wrap" } },
            React.createElement("span", { style: stepBtn(activeLiveStep === 1, "#16a34a") }, "STEP 1: Morning"),
            React.createElement("span", { style: { color: "var(--text5)", fontSize: 12 } }, "\u2192"),
            React.createElement("span", { style: stepBtn(activeLiveStep === 2, "#d97706") }, "STEP 2: Evening"),
            React.createElement("span", { style: { color: "var(--text5)", fontSize: 12 } }, "\u2192"),
            React.createElement("span", { style: stepBtn(activeLiveStep === 3, "#7c3aed") }, "STEP 3: Night")
          ),
          // Status cards
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginTop: 12 } },
            statCard("Corpus", corpus ? corpus.count : 0),
            statCard("Symbols", corpus ? corpus.symbols : 0),
            statCard("Base Rate", corpus ? (brPct(corpus.baseRate) != null ? brPct(corpus.baseRate).toFixed(1) + "%" : "N/A") : "N/A"),
            statCard("WF Accuracy", liveStatus && liveStatus.walkForwardAcc != null ? liveStatus.walkForwardAcc + "%" : "N/A"),
            statCard("AUC", liveStatus && liveStatus.avgAuc != null ? (liveStatus.avgAuc * 100).toFixed(1) + "%" : "N/A"),
            statCard("Last Retrain", liveStatus && liveStatus.lastRetrain ? new Date(liveStatus.lastRetrain).toLocaleDateString() : "Never")
          ),
          // Action buttons
          React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 } },
            React.createElement("button", {
              onClick: handleTodaySignals, disabled: liveBusy,
              style: { padding: "8px 16px", borderRadius: 6, background: liveBusy ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", cursor: liveBusy ? "not-allowed" : "pointer", fontWeight: 600, opacity: hasLive ? 1 : 0.5 }
            }, liveBusy ? ("Working..." + (liveProg && liveProg.total ? " " + liveProg.done + "/" + liveProg.total : "")) : "Step 1: Morning Scan"),
            React.createElement("button", {
              onClick: handleEveningValidate, disabled: liveBusy,
              style: { padding: "8px 16px", borderRadius: 6, background: liveBusy ? "#9ca3af" : "#d97706", color: "#fff", border: "none", cursor: liveBusy ? "not-allowed" : "pointer", fontWeight: 600, opacity: hasLive ? 1 : 0.5 }
            }, liveBusy ? "Working..." : "Step 2: Evening Validate"),
            React.createElement("button", {
              onClick: handleNightLearn, disabled: liveBusy,
              style: { padding: "8px 16px", borderRadius: 6, background: liveBusy ? "#9ca3af" : "#7c3aed", color: "#fff", border: "none", cursor: liveBusy ? "not-allowed" : "pointer", fontWeight: 600, opacity: hasLive ? 1 : 0.5 }
            }, liveBusy ? "Working..." : "Step 3: Night Learn")
          )
        ),

        // ── STEP 1: Today's Top 20 with justifications ──
        liveSignals && liveSignals.length > 0 && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: Object.assign({}, labelStyle, { color: "#16a34a" }) }, "Step 1: Morning Scan — Top " + liveSignals.length + " Picks"),
          React.createElement("div", { style: { maxHeight: 500, overflowY: "auto" } },
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 8 } },
              React.createElement("thead", null,
                React.createElement("tr", null,
                  React.createElement("th", { style: { textAlign: "left", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "#"),
                  React.createElement("th", { style: { textAlign: "left", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "Symbol"),
                  React.createElement("th", { style: { textAlign: "left", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1, fontSize: 10 } }, "Scan Time"),
                  React.createElement("th", { style: { textAlign: "right", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "Live Price"),
                  React.createElement("th", { style: { textAlign: "right", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "Pred Close"),
                  React.createElement("th", { style: { textAlign: "right", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "Exp %"),
                  React.createElement("th", { style: { textAlign: "right", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "Win Prob"),
                  React.createElement("th", { style: { textAlign: "right", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "Tech"),
                  React.createElement("th", { style: { textAlign: "right", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "1D Chg"),
                  React.createElement("th", { style: { textAlign: "left", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "Pattern"),
                  React.createElement("th", { style: { textAlign: "left", padding: "4px 6px", color: "var(--text3)", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 1 } }, "Justification")
                )
              ),
              React.createElement("tbody", null,
                liveSignals.map(function (s, idx) {
                  var probColor = s.winProbability >= 0.6 ? "#16a34a" : s.winProbability >= 0.5 ? "#f59e0b" : "var(--text2)";
                  var techColor = s.technicalScore >= 70 ? "#16a34a" : s.technicalScore >= 40 ? "#f59e0b" : "#ef4444";
                  var expColor = s.expectedChgPct != null ? (s.expectedChgPct >= 0 ? "#16a34a" : "#ef4444") : "var(--text3)";
                  var chgColor = s.chgPct != null ? (s.chgPct >= 0 ? "#16a34a" : "#ef4444") : "var(--text3)";
                  var scanTimeStr = s.scanTime ? new Date(s.scanTime).toLocaleTimeString() : (s.date || "\u2014");
                  var predCloseColor = s.expectedChgPct != null ? (s.expectedChgPct >= 0 ? "#16a34a" : "#ef4444") : "var(--text3)";
                  return React.createElement("tr", { key: s.symbol, style: { borderBottom: "1px solid var(--border)" } },
                    React.createElement("td", { style: { padding: "5px 6px", color: "var(--text3)" } }, idx + 1),
                    React.createElement("td", { style: { padding: "5px 6px", fontWeight: 700 } }, s.symbol),
                    React.createElement("td", { style: { padding: "5px 6px", fontSize: 10, color: "var(--text3)" } }, scanTimeStr),
                    React.createElement("td", { style: { padding: "5px 6px", textAlign: "right", fontWeight: 600 } }, s.close != null ? "\u20B9" + s.close.toFixed(2) : "\u2014"),
                    React.createElement("td", { style: { padding: "5px 6px", textAlign: "right", fontWeight: 700, color: predCloseColor } }, s.predictedClose != null ? "\u20B9" + s.predictedClose.toFixed(2) : "\u2014"),
                    React.createElement("td", { style: { padding: "5px 6px", textAlign: "right", fontWeight: 600, color: expColor } }, s.expectedChgPct != null ? (s.expectedChgPct >= 0 ? "+" : "") + s.expectedChgPct + "%" : "\u2014"),
                    React.createElement("td", { style: { padding: "5px 6px", textAlign: "right", fontWeight: 700, color: probColor } }, (s.winProbability * 100).toFixed(1) + "%"),
                    React.createElement("td", { style: { padding: "5px 6px", textAlign: "right", fontWeight: 700, color: techColor } }, s.technicalScore != null ? s.technicalScore : "\u2014"),
                    React.createElement("td", { style: { padding: "5px 6px", textAlign: "right", color: chgColor, fontSize: 10 } }, s.chgPct != null ? (s.chgPct >= 0 ? "+" : "") + s.chgPct + "%" : "\u2014"),
                    React.createElement("td", { style: { padding: "5px 6px", fontSize: 10, color: "var(--text3)", maxWidth: 150 } }, s.patternSummary || "\u2014"),
                    React.createElement("td", { style: { padding: "5px 6px", fontSize: 10, color: "var(--text3)", maxWidth: 250, lineHeight: 1.4 } }, s.justification || "\u2014")
                  );
                })
              )
            )
          ),
          React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 6 } },
            "Top pick: " + liveSignals[0].symbol + " | Live: \u20B9" + (liveSignals[0].close != null ? liveSignals[0].close.toFixed(2) : "?") + " | Pred: \u20B9" + (liveSignals[0].predictedClose != null ? liveSignals[0].predictedClose.toFixed(2) : "?") + " | Exp: " + (liveSignals[0].expectedChgPct != null ? (liveSignals[0].expectedChgPct >= 0 ? "+" : "") + liveSignals[0].expectedChgPct + "%" : "N/A")
          )
        ),

        // ── STEP 2: Evening Validation Report ──
        validationReport && validationReport.days.length > 0 && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: Object.assign({}, labelStyle, { color: "#d97706" }) }, "Step 2: Evening Validation — Predicted vs Actual"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginTop: 8 } },
            statCard("Total Picks", validationReport.summary.total),
            statCard("Hits", React.createElement("span", { style: { color: "#16a34a", fontWeight: 700 } }, validationReport.summary.hits)),
            statCard("Misses", React.createElement("span", { style: { color: "#ef4444", fontWeight: 700 } }, validationReport.summary.misses)),
            statCard("Hit Rate", validationReport.summary.hitRate != null ? validationReport.summary.hitRate + "%" : "N/A"),
            statCard("Base Rate", base != null ? base + "%" : "N/A"),
            statCard("Alpha", validationReport.summary.hitRate != null && base != null ? (validationReport.summary.hitRate - base >= 0 ? "+" : "") + (validationReport.summary.hitRate - base).toFixed(1) + "%" : "N/A")
          ),
          validationReport.days.map(function (day) {
            return React.createElement("div", { key: day.date, style: { marginTop: 10 } },
              React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 4 } }, day.date + " — " + day.hits + "/" + day.resolvedCount + " hits (" + (day.hitRate != null ? day.hitRate.toFixed(0) + "%" : "N/A") + ")" + (day.avgReturn != null ? " | Avg Return: " + (day.avgReturn >= 0 ? "+" : "") + day.avgReturn + "%" : "") + (day.avgCloseError != null ? " | Avg Close Err: " + (day.avgCloseError >= 0 ? "+" : "") + day.avgCloseError + "%" : "")),
              React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 11 } },
                React.createElement("thead", null,
                  React.createElement("tr", null,
                    React.createElement("th", { style: { textAlign: "left", padding: "3px 6px", color: "var(--text3)" } }, "Symbol"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "Scan Price"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "Pred Close"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "Actual Close"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "Close Err"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "1D Chg"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "Prob"),
                    React.createElement("th", { style: { textAlign: "center", padding: "3px 6px", color: "var(--text3)" } }, "Verdict")
                  )
                ),
                React.createElement("tbody", null,
                  day.picks.map(function (p) {
                    var verdictColor = p.verdict === "CORRECT_WIN" ? "#16a34a" : p.verdict === "CORRECT_LOSS" ? "#6b7280" : p.verdict === "MISSED" ? "#ef4444" : "#f59e0b";
                    var verdictBg = p.verdict === "CORRECT_WIN" ? "rgba(22,163,74,.1)" : p.verdict === "MISSED" ? "rgba(239,68,68,.1)" : "transparent";
                    var errColor = p.closeError != null ? (Math.abs(p.closeError) < 1 ? "#16a34a" : Math.abs(p.closeError) < 3 ? "#f59e0b" : "#ef4444") : "var(--text3)";
                    return React.createElement("tr", { key: p.symbol, style: { background: verdictBg } },
                      React.createElement("td", { style: { padding: "3px 6px", fontWeight: 600 } }, p.symbol),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right" } }, p.scanPrice != null ? "\u20B9" + p.scanPrice.toFixed(2) : "\u2014"),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right", fontWeight: 600, color: "#16a34a" } }, p.predictedClose != null ? "\u20B9" + p.predictedClose.toFixed(2) : "\u2014"),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right", fontWeight: 600, color: p.actualClose != null ? "#3b82f6" : "var(--text3)" } }, p.actualClose != null ? "\u20B9" + p.actualClose.toFixed(2) : "\u2014"),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right", fontWeight: 600, color: errColor } }, p.closeError != null ? (p.closeError >= 0 ? "+" : "") + p.closeError + "%" : "\u2014"),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right", color: p.actualChg != null ? (p.actualChg >= 0 ? "#16a34a" : "#ef4444") : "var(--text3)" } }, p.actualChg != null ? (p.actualChg >= 0 ? "+" : "") + p.actualChg + "%" : "\u2014"),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right", fontSize: 10 } }, (p.predictedProb * 100).toFixed(1) + "%"),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "center", fontWeight: 700, color: verdictColor, fontSize: 10 } }, p.verdict)
                    );
                  })
                )
              )
            );
          })
        ),

        // ── STEP 3: Night Learning Report ──
        improvementReport && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: Object.assign({}, labelStyle, { color: "#7c3aed" }) }, "Step 3: Night Learning — Model Improvement"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 10 } },
            React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, padding: 10 } },
              React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", marginBottom: 4 } }, "Before Retrain"),
              React.createElement("div", { style: { fontSize: 13, fontWeight: 600 } }, "WF Acc: " + (improvementReport.before.walkForwardAcc != null ? improvementReport.before.walkForwardAcc + "%" : "N/A")),
              React.createElement("div", { style: { fontSize: 13, fontWeight: 600 } }, "AUC: " + (improvementReport.before.avgAuc != null ? (improvementReport.before.avgAuc * 100).toFixed(1) + "%" : "N/A"))
            ),
            React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, padding: 10 } },
              React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", marginBottom: 4 } }, "After Retrain"),
              React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#16a34a" } }, "WF Acc: " + (improvementReport.after.walkForwardAcc != null ? improvementReport.after.walkForwardAcc + "%" : "N/A")),
              React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#16a34a" } }, "AUC: " + (improvementReport.after.avgAuc != null ? (improvementReport.after.avgAuc * 100).toFixed(1) + "%" : "N/A"))
            ),
            React.createElement("div", { style: { border: "1px solid var(--border)", borderRadius: 8, padding: 10 } },
              React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", marginBottom: 4 } }, "Improvement"),
              React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: improvementReport.improvement.accDelta != null && improvementReport.improvement.accDelta >= 0 ? "#16a34a" : "#ef4444" } },
                "Acc: " + (improvementReport.improvement.accDelta != null ? (improvementReport.improvement.accDelta >= 0 ? "+" : "") + improvementReport.improvement.accDelta + "%" : "N/A")
              ),
              React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: improvementReport.improvement.aucDelta != null && improvementReport.improvement.aucDelta >= 0 ? "#16a34a" : "#ef4444" } },
                "AUC: " + (improvementReport.improvement.aucDelta != null ? (improvementReport.improvement.aucDelta >= 0 ? "+" : "") + improvementReport.improvement.aucDelta : "N/A")
              )
            )
          ),
          improvementReport.promotion && React.createElement("div", { style: { marginTop: 8, padding: 8, borderRadius: 6, background: improvementReport.promotion.promoted ? "rgba(22,163,74,.1)" : "rgba(239,68,68,.1)", fontSize: 12 } },
            React.createElement("strong", null, improvementReport.promotion.promoted ? "Model Promoted" : "Model Kept"),
            ": " + improvementReport.promotion.reason
          ),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 8 } },
            "Model retrained on confirmed outcomes. Ready for tomorrow's Step 1 (Morning Scan)."
          )
        ),

        // ── Feature importance (horizontal bars) ──
        importance && importance.length > 0 && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Feature Importance (Permutation)"),
          React.createElement("div", { style: { marginTop: 8 } },
            importance.slice(0, 8).map(function (fi) {
              var maxImp = Math.max.apply(null, importance.map(function (f) { return Math.abs(f.importance); }));
              var width = maxImp > 0 ? Math.max(2, Math.abs(fi.importance) / maxImp * 100) : 2;
              var color = fi.importance >= 0 ? "#16a34a" : "#ef4444";
              return React.createElement("div", { key: fi.feature, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } },
                React.createElement("span", { style: { width: 100, fontSize: 11, fontWeight: 600 } }, fi.feature),
                React.createElement("div", { style: { flex: 1, background: "var(--bg3)", borderRadius: 4, height: 10 } },
                  React.createElement("div", { style: { width: width + "%", background: color, borderRadius: 4, height: 10 } })
                ),
                React.createElement("span", { style: { width: 60, fontSize: 10, color: "var(--text3)" } }, fi.importance.toFixed(3))
              );
            })
          )
        ),

        // ── Historical Tracker (last 7 days) ──
        liveTracker && liveTracker.days.length > 0 && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Historical Tracker (Last 7 Days)"),
          (function () {
            var days = liveTracker.days.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
            var resolved = days.filter(function (d) { return d.resolvedCount > 0; });
            var allPicks = 0, allHits = 0;
            resolved.forEach(function (d) { allPicks += d.picks.length; allHits += d.hits; });
            var allRate = allPicks > 0 ? (allHits / allPicks) * 100 : null;
            var shown = days.slice(0, 7);
            return React.createElement("div", null,
              allRate != null && React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } },
                "All-time: " + allHits + "/" + allPicks + " (" + allRate.toFixed(1) + "%)" + (base != null ? " vs base " + base + "%" : "")
              ),
              React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 6 } },
                React.createElement("thead", null,
                  React.createElement("tr", null,
                    React.createElement("th", { style: { textAlign: "left", padding: "3px 6px", color: "var(--text3)" } }, "Date"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "Picks"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "Hits"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "Misses"),
                    React.createElement("th", { style: { textAlign: "right", padding: "3px 6px", color: "var(--text3)" } }, "Hit Rate")
                  )
                ),
                React.createElement("tbody", null,
                  shown.map(function (d) {
                    var rate = d.resolvedCount > 0 ? (d.hits / d.resolvedCount) * 100 : null;
                    var rateColor = rate == null ? "var(--text3)" : rate >= (base != null ? base : 50) ? "#16a34a" : "#ef4444";
                    return React.createElement("tr", { key: d.date },
                      React.createElement("td", { style: { padding: "3px 6px", fontWeight: 600 } }, d.date),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right" } }, d.picks.length),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right", color: "#16a34a", fontWeight: 700 } }, d.hits),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right", color: "#ef4444", fontWeight: 700 } }, d.misses),
                      React.createElement("td", { style: { padding: "3px 6px", textAlign: "right", color: rateColor, fontWeight: 700 } }, rate != null ? rate.toFixed(0) + "%" : "\u2014")
                    );
                  })
                )
              )
            );
          })()
        ),

        // ── Log ──
        liveLog.length > 0 && React.createElement("div", { style: Object.assign({}, cardStyle, { maxHeight: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }) },
          React.createElement("div", { style: labelStyle }, "Activity Log"),
          liveLog.map(function (entry, i) {
            return React.createElement("div", { key: i, style: { marginBottom: 2 } },
              React.createElement("span", { style: { color: "var(--text3)" } }, String(entry.time) + " "),
              String(entry.msg)
            );
          })
        )
      );
    }

    /* ── ML Engine Tab ─────────────────────────────────────────────────── */

    async function handleTrainML() {
      if (!window.MLTrainer) {
        setError("MLTrainer module not loaded");
        return;
      }
      if (!window.PatternStore) {
        setError("PatternStore not available");
        return;
      }

      setMlTraining(true);
      setMlLog([{ time: new Date().toLocaleTimeString(), msg: "Starting " + mlTrainMode + " training..." }]);

      try {
        await window.PatternStore.init();
        var featCount = 0;
        try {
          var allFeats = await window.PatternStore.getAllFeatures();
          featCount = allFeats.length;
        } catch (e) {}

        setMlLog(function (prev) {
          var n = prev.slice(-50);
          n.push({ time: new Date().toLocaleTimeString(), msg: "Available features: " + featCount + " samples" });
          return n;
        });

        var result;
        if (mlTrainMode === "walkforward") {
          result = await window.MLTrainer.trainWithWalkForward({
            numFolds: 5,
            epochsPerFold: 25,
            hiddenUnits: [32, 16],
            learningRate: 0.005,
            batchSize: 32,
            dropoutRate: 0.2,
            onFold: function (fold, total, foldResult) {
              if (foldResult.skipped) {
                setMlLog(function (prev) {
                  var n = prev.slice(-50);
                  n.push({ time: new Date().toLocaleTimeString(), msg: "Fold " + fold + "/" + total + ": skipped (" + foldResult.reason + ")" });
                  return n;
                });
              } else {
                setMlLog(function (prev) {
                  var n = prev.slice(-50);
                  n.push({ time: new Date().toLocaleTimeString(), msg: "Fold " + fold + "/" + total + ": valAcc=" + foldResult.finalValAcc + "%, F1=" + foldResult.f1 + ", Precision=" + foldResult.precision });
                  return n;
                });
              }
            },
            onProgress: function (current, total, msg) {
              setMlLog(function (prev) {
                var n = prev.slice(-50);
                if (typeof current === "number" && Math.floor(current) !== Math.floor(prev[prev.length - 1] ? prev[prev.length - 1].current || 0 : -1)) {
                  n.push({ time: new Date().toLocaleTimeString(), msg: "[" + Math.round((total > 0 ? current / total * 100 : 0)) + "%] " + msg });
                }
                return n;
              });
            }
          });

          setMlLog(function (prev) {
            var n = prev.slice(-50);
            n.push({ time: new Date().toLocaleTimeString(), msg: "Walk-Forward Result: " + result.walkForwardAcc + "% avg accuracy, Best Fold: " + result.bestFoldAcc + "%" });
            if (result.promotion) {
              n.push({ time: new Date().toLocaleTimeString(), msg: "Promotion: " + result.promotion.reason });
            }
            if (result.featureImportance && result.featureImportance.length > 0) {
              var top3 = result.featureImportance.slice(0, 3).map(function (f) { return f.feature + "(" + f.importance.toFixed(3) + ")"; }).join(", ");
              n.push({ time: new Date().toLocaleTimeString(), msg: "Top Features: " + top3 });
            }
            return n;
          });
        } else {
          // Legacy single-split training
          var trainer = window.MLTrainer.create({
            hiddenUnits: [32, 16],
            learningRate: 0.01,
            epochs: 50,
            batchSize: 32,
            dropoutRate: 0.2
          });

          result = await trainer.train({
            onEpoch: function (epoch, loss, trainAcc, valAcc) {
              if (epoch % 10 === 0 || epoch === 1) {
                setMlLog(function (prev) {
                  var n = prev.slice(-50);
                  n.push({ time: new Date().toLocaleTimeString(), msg: "Epoch " + epoch + ": loss=" + loss.toFixed(4) + " train=" + trainAcc + "% val=" + valAcc + "%" });
                  return n;
                });
              }
            }
          });

          setMlLog(function (prev) {
            var n = prev.slice(-50);
            n.push({ time: new Date().toLocaleTimeString(), msg: "Training Complete: valAcc=" + result.finalValAcc + "%, loss=" + result.finalLoss });
            if (result.featureImportance) {
              var top3 = result.featureImportance.slice(0, 3).map(function (f) { return f.feature + "(" + f.importance.toFixed(3) + ")"; }).join(", ");
              n.push({ time: new Date().toLocaleTimeString(), msg: "Top Features: " + top3 });
            }
            return n;
          });
        }

        // Refresh status
        await loadMLStatus();
        await loadMLDriftHistory();
        await loadMLPromoHistory();
        setError(null);
      } catch (err) {
        setMlLog(function (prev) {
          var n = prev.slice(-50);
          n.push({ time: new Date().toLocaleTimeString(), msg: "ERROR: " + err.message });
          return n;
        });
        setError("ML training failed: " + err.message);
      } finally {
        setMlTraining(false);
      }
    }

    async function handleRetrainML() {
      if (!window.MLTrainer || !window.continuousMLRetrain) {
        setError("Continuous retrain not available");
        return;
      }
      setMlTraining(true);
      setMlLog(function (prev) {
        var n = prev.slice(-50);
        n.push({ time: new Date().toLocaleTimeString(), msg: "Starting continuous retrain (drift check + walk-forward)..." });
        return n;
      });

      try {
        var result = await window.continuousMLRetrain({
          numFolds: 5,
          epochsPerFold: 20,
          forceRetrain: true,
          onProgress: function (current, total, msg) {
            setMlLog(function (prev) {
              var n = prev.slice(-50);
              n.push({ time: new Date().toLocaleTimeString(), msg: msg });
              return n;
            });
          }
        });

        setMlLog(function (prev) {
          var n = prev.slice(-50);
          n.push({ time: new Date().toLocaleTimeString(), msg: "Retrain " + (result.retrained ? "completed" : "skipped") + ": " + (result.actions || []).join("; ") });
          return n;
        });

        await loadMLStatus();
        await loadMLDriftHistory();
        await loadMLPromoHistory();
      } catch (err) {
        setError("Continuous retrain failed: " + err.message);
      } finally {
        setMlTraining(false);
      }
    }

    async function handleOptimizeConfig() {
      if (!window.MLOptimizer || !window.optimizeBacktestConfig) {
        setError("MLOptimizer not available");
        return;
      }
      setMlOptimizing(true);
      setMlLog(function (prev) {
        var n = prev.slice(-50);
        n.push({ time: new Date().toLocaleTimeString(), msg: "Starting Bayesian optimization of backtest config..." });
        return n;
      });

      try {
        var symbols = getStockUniverse().slice(0, 10).map(function (s) { return s.t; });
        var result = await window.optimizeBacktestConfig({
          symbols: symbols,
          iterations: 10,
          onIteration: function (iter, total, config, iterResult) {
            setMlLog(function (prev) {
              var n = prev.slice(-50);
              n.push({ time: new Date().toLocaleTimeString(), msg: "Iter " + iter + "/" + total + ": TP=" + config.targetProfitPct + "% HP=" + config.holdingPeriodDays + "d → Sharpe=" + iterResult.sharpe + " WR=" + iterResult.winRate + "% Trades=" + iterResult.tradesEvaluated + (iterResult.evalErrors && iterResult.evalErrors.length ? " (" + iterResult.evalErrors.length + " errors)" : "") });
              return n;
            });
          }
        });

        if (result.warning) {
          setMlLog(function (prev) {
            var n = prev.slice(-50);
            n.push({ time: new Date().toLocaleTimeString(), msg: "ABORTED: " + result.warning });
            return n;
          });
          setError(result.warning);
          setTimeout(function () { setError(null); }, 8000);
          return;
        }

        setMlLog(function (prev) {
          var n = prev.slice(-50);
          n.push({ time: new Date().toLocaleTimeString(), msg: "Best Config: TP=" + result.bestConfig.targetProfitPct + "%, HP=" + result.bestConfig.holdingPeriodDays + "d, Thr=" + result.bestConfig.threshold + " → Sharpe=" + result.bestSharpe + " (trades=" + result.bestTradesEvaluated + ")" });
          return n;
        });

        // Apply best config to backtest config
        setBtConfig(Object.assign({}, btConfig, {
          targetProfitPct: result.bestConfig.targetProfitPct,
          holdingPeriodDays: result.bestConfig.holdingPeriodDays,
          threshold: result.bestConfig.threshold,
          sampleEvery: result.bestConfig.sampleEvery
        }));

        try {
          localStorage.setItem("stox_best_bt_config", JSON.stringify(result.bestConfig));
        } catch (e) {}

        setError("Optimal config applied & saved to Backtest Configuration");
        setTimeout(function () { setError(null); }, 5000);
      } catch (err) {
        setError("Optimization failed: " + err.message);
      } finally {
        setMlOptimizing(false);
      }
    }

    /* ── ML Observability Helpers ──────────────────────────────────────── */

    function buildConfusionMatrix(foldResults) {
      var tp = 0, fp = 0, fn = 0, tn = 0;
      if (!foldResults || !foldResults.length) return { tp: 0, fp: 0, fn: 0, tn: 0 };
      foldResults.forEach(function (fr) {
        if (!fr.predictions) return;
        fr.predictions.forEach(function (p) {
          var predClass = p.predicted >= 0.5 ? 1 : 0;
          var actual = p.actual;
          if (predClass === 1 && actual === 1) tp++;
          else if (predClass === 1 && actual === 0) fp++;
          else if (predClass === 0 && actual === 1) fn++;
          else tn++;
        });
      });
      return { tp: tp, fp: fp, fn: fn, tn: tn };
    }

    function buildReliabilityData(foldResults, nBins) {
      nBins = nBins || 10;
      var bins = [];
      for (var i = 0; i < nBins; i++) bins.push({ sumPred: 0, sumActual: 0, count: 0 });
      if (!foldResults) return bins;
      foldResults.forEach(function (fr) {
        if (!fr.predictions) return;
        fr.predictions.forEach(function (p) {
          var binIdx = Math.min(Math.floor(p.predicted * nBins), nBins - 1);
          bins[binIdx].sumPred += p.predicted;
          bins[binIdx].sumActual += p.actual;
          bins[binIdx].count++;
        });
      });
      return bins.map(function (b, i) {
        return {
          binStart: i / nBins,
          binEnd: (i + 1) / nBins,
          meanPred: b.count > 0 ? b.sumPred / b.count : 0,
          observedRate: b.count > 0 ? (b.sumActual / b.count) * 100 : 0,
          count: b.count
        };
      }).filter(function (b) { return b.count > 0; });
    }

    function foldTrendVerdict(foldResults) {
      if (!foldResults || foldResults.length < 2) return { text: "Need 2+ folds", color: "var(--text3)", cv: 0 };
      var accs = foldResults.map(function (f) { return f.finalValAcc || 0; });
      var mean = accs.reduce(function (s, v) { return s + v; }, 0) / accs.length;
      var variance = accs.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / accs.length;
      var std = Math.sqrt(variance);
      var cv = mean > 0 ? (std / mean) * 100 : 0;
      if (cv < 5) return { text: "Stable — consistent across time periods", color: "#16a34a", cv: cv };
      if (cv < 15) return { text: "Moderate variance — some periods harder", color: "#f59e0b", cv: cv };
      return { text: "High variance — model struggles in certain regimes", color: "#ef4444", cv: cv };
    }

    function fmtNum(v, d) { return v != null ? Number(v).toFixed(d || 0) : "\u2014"; }

    /* ── ML Observability Renderers ────────────────────────────────────── */

    function renderMLStatusBadge() {
      var hasIntegration = typeof window.applyPatternIntel === "function";
      var hasStoredModel = !!(mlStatus && mlStatus.hasModel);
      var hasLiveML = !!(window.LiveML);
      var badgeBg = hasIntegration && hasStoredModel ? "#16a34a" : hasIntegration ? "#f59e0b" : "#ef4444";
      var badgeText = hasIntegration && hasStoredModel ? "ML Active in Scoring" : hasIntegration ? "Integration Loaded (No Model Trained)" : "ML Not in Scoring Path";

      var items = [
        React.createElement("div", { key: "badge", style: { display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: badgeBg + "22", border: "1px solid " + badgeBg, marginBottom: 8 } },
          React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", background: badgeBg } }),
          React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: badgeBg } }, badgeText)
        ),
        React.createElement("div", { key: "detail", style: { fontSize: 12, color: "var(--text3)", lineHeight: 1.6 } },
          React.createElement("div", null, "applyPatternIntel: " + (hasIntegration ? "loaded" : "missing") + " \u00B7 MLTrainer: " + (window.MLTrainer ? "loaded" : "missing") + " \u00B7 LiveML: " + (hasLiveML ? "loaded (not in scoring path)" : "missing")),
          React.createElement("div", null, "Champion model stored: " + (hasStoredModel ? "yes" : "no") + " \u00B7 Blend: 75% pattern / 25% ML (or 65/35 if winProb \u2265 0.7)")
        )
      ];

      // Side-by-side Rule Score vs ML Score table
      if (patterns && patterns.length > 0) {
        var sortedPatterns = patterns.slice().sort(function (a, b) { return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0; });
        var rows = sortedPatterns.map(function (p) {
          if (!p || !p.tradeStats) return null;
          var ruleScore = p.backtestDate ? Math.round(((p.tradeStats.winRate || 50) / 100) * 100) / 100 : null;
          // Compute ML win probability using the loaded model
          var mlProb = null;
          if (mlCachedModel && window.MLTrainer && window.MLTrainer.predictSync) {
            try {
              var ip = p.indicatorPowers || {};
              var features = {
                rsi: ip.trendHealth && ip.trendHealth.correlation != null ? 50 + ip.trendHealth.correlation * 50 : 50,
                macd_hist: 0,
                bb_position: 0.5,
                atr_pct: 3,
                volume_ratio: 1,
                ema_slope: 0,
                adx: ip.trendHealth && ip.trendHealth.correlation != null ? 20 + ip.trendHealth.correlation * 30 : 25,
                entry_score: ruleScore != null ? ruleScore : 0.5
              };
              var pred = window.MLTrainer.predictSync(features, mlCachedModel);
              if (pred && pred.winProbability != null) mlProb = pred.winProbability;
            } catch (e) {}
          }
          // Final score = 75% rule + 25% ML (or 65/35 if ML confident)
          var finalScore = null;
          if (ruleScore != null) {
            if (mlProb != null) {
              var blend = mlProb >= 0.7 ? 0.35 : 0.25;
              finalScore = Math.round(((1 - blend) * ruleScore + blend * mlProb) * 100) / 100;
            } else {
              finalScore = ruleScore;
            }
          }
          return React.createElement("tr", { key: p.symbol, style: { borderBottom: "1px solid var(--border)" } },
            React.createElement("td", { style: { padding: "4px 8px", fontWeight: 600, fontSize: 12 } }, p.symbol),
            React.createElement("td", { style: { padding: "4px 8px", textAlign: "right", fontSize: 12, color: "var(--text3)" } }, ruleScore != null ? (ruleScore * 100).toFixed(1) + "%" : "\u2014"),
            React.createElement("td", { style: { padding: "4px 8px", textAlign: "right", fontSize: 12, color: mlProb != null ? (mlProb >= 0.55 ? "#16a34a" : mlProb >= 0.45 ? "#f59e0b" : "var(--text3)") : "var(--text3)" } }, mlProb != null ? (mlProb * 100).toFixed(1) + "%" : "\u2014"),
            React.createElement("td", { style: { padding: "4px 8px", textAlign: "right", fontSize: 12, fontWeight: finalScore !== ruleScore ? 700 : 400 } }, finalScore != null ? (finalScore * 100).toFixed(1) + "%" : "\u2014")
          );
        }).filter(Boolean);

        if (rows.length > 0) {
          items.push(React.createElement("div", { key: "scores", style: { maxHeight: 300, overflowY: "auto", marginTop: 10 } },
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
              React.createElement("thead", null,
                React.createElement("tr", null,
                  ["Symbol", "Rule Score", "ML Win Prob", "Final Score"].map(function (h) {
                    return React.createElement("th", { key: h, style: { textAlign: h === "Symbol" ? "left" : "right", padding: "4px 8px", fontSize: 11, color: "var(--text3)", fontWeight: 600, position: "sticky", top: 0, background: "var(--bg1)" } }, h);
                  })
                )
              ),
              React.createElement("tbody", null, rows)
            )
          ));
        }
      }

      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "ML Scoring Status"),
        items,
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 8, lineHeight: 1.5 } },
          "Green badge = model is trained and wired into scoring. Table compares Rule Score (pattern-only) vs ML Win Prob (neural net) vs Final Score (75/25 blend). If ML differs significantly from Rule, the model is adding value \u2014 or pulling in the wrong direction."
        )
      );
    }

    function renderConfusionMatrixAndReliability(championInfo) {
      var foldResults = championInfo && championInfo.foldResults;
      if (!foldResults || foldResults.length === 0) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Model Diagnostics"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } },
            "Walk-forward fold data not available — retrain with Walk-Forward to enable confusion matrix and reliability diagnostics."
          )
        );
      }

      var cm = buildConfusionMatrix(foldResults);
      var total = cm.tp + cm.fp + cm.fn + cm.tn;
      var precision = (cm.tp + cm.fp) > 0 ? cm.tp / (cm.tp + cm.fp) : 0;
      var recall = (cm.tp + cm.fn) > 0 ? cm.tp / (cm.tp + cm.fn) : 0;
      var f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
      var specificity = (cm.tn + cm.fp) > 0 ? cm.tn / (cm.tn + cm.fp) : 0;
      var accuracy = total > 0 ? (cm.tp + cm.tn) / total : 0;

      // Aggregate AUC across folds
      var totalAuc = 0, aucCount = 0;
      foldResults.forEach(function (fr) { if (fr.auc != null) { totalAuc += fr.auc; aucCount++; } });
      var avgAuc = aucCount > 0 ? totalAuc / aucCount : 0.5;

      // Reliability data
      var relData = buildReliabilityData(foldResults, 10);

      // ECE (Expected Calibration Error)
      var ece = 0, totalPreds = 0;
      relData.forEach(function (b) {
        var diff = Math.abs(b.meanPred * 100 - b.observedRate);
        ece += diff * b.count;
        totalPreds += b.count;
      });
      ece = totalPreds > 0 ? ece / totalPreds : 0;

      // CM table styles
      var cmTd = { padding: "6px 12px", textAlign: "center", fontSize: 12, fontWeight: 600, minWidth: 50 };
      var cmTh = Object.assign({}, cmTd, { color: "var(--text3)", fontWeight: 700, fontSize: 11 });

      // Reliability chart dimensions
      var chartW = 280, chartH = 160, pad = { t: 20, r: 10, b: 30, l: 40 };

      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "Model Diagnostics (Walk-Forward)"),

        // Confusion Matrix
        React.createElement("div", { style: { display: "flex", gap: 24, flexWrap: "wrap", marginTop: 8 } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 4 } }, "Confusion Matrix (all folds)"),
            React.createElement("table", { style: { borderCollapse: "collapse" } },
              React.createElement("thead", null,
                React.createElement("tr", null,
                  React.createElement("th", { style: cmTh }),
                  React.createElement("th", { style: cmTh }, "Pred Positive"),
                  React.createElement("th", { style: cmTh }, "Pred Negative")
                )
              ),
              React.createElement("tbody", null,
                React.createElement("tr", null,
                  React.createElement("td", { style: Object.assign({}, cmTh, { textAlign: "right" }) }, "Actual +"),
                  React.createElement("td", { style: Object.assign({}, cmTd, { background: "rgba(22,163,74,0.12)", color: "#16a34a" }) }, cm.tp),
                  React.createElement("td", { style: Object.assign({}, cmTd, { background: "rgba(239,68,68,0.08)", color: "#ef4444" }) }, cm.fn)
                ),
                React.createElement("tr", null,
                  React.createElement("td", { style: Object.assign({}, cmTh, { textAlign: "right" }) }, "Actual -"),
                  React.createElement("td", { style: Object.assign({}, cmTd, { background: "rgba(239,68,68,0.08)", color: "#ef4444" }) }, cm.fp),
                  React.createElement("td", { style: Object.assign({}, cmTd, { background: "rgba(22,163,74,0.12)", color: "#16a34a" }) }, cm.tn)
                )
              )
            )
          ),
          React.createElement("div", { style: { fontSize: 12 } },
            React.createElement("div", { style: { fontWeight: 700, marginBottom: 4 } }, "Derived Metrics"),
            React.createElement("div", null, "Accuracy: " + (accuracy * 100).toFixed(1) + "%"),
            React.createElement("div", null, "Precision: " + (precision * 100).toFixed(1) + "%"),
            React.createElement("div", null, "Recall: " + (recall * 100).toFixed(1) + "%"),
            React.createElement("div", null, "F1: " + (f1 * 100).toFixed(1) + "%"),
            React.createElement("div", null, "Specificity: " + (specificity * 100).toFixed(1) + "%"),
            React.createElement("div", { style: { marginTop: 4, fontWeight: 700 } }, "AUC: " + (avgAuc * 100).toFixed(1) + "%")
          )
        ),

        // Reliability Diagram
        relData.length > 0 && React.createElement("div", { style: { marginTop: 12 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 4 } }, "Reliability Diagram (ECE: " + ece.toFixed(1) + "%)"),
          React.createElement("svg", { width: chartW, height: chartH, style: { display: "block" } },
            // Grid
            React.createElement("line", { x1: pad.l, y1: pad.t, x2: pad.l, y2: chartH - pad.b, stroke: "var(--border)", strokeWidth: 1 }),
            React.createElement("line", { x1: pad.l, y1: chartH - pad.b, x2: chartW - pad.r, y2: chartH - pad.b, stroke: "var(--border)", strokeWidth: 1 }),
            // Ideal diagonal
            React.createElement("line", { x1: pad.l, y1: chartH - pad.b, x2: chartW - pad.r, y2: pad.t, stroke: "var(--text3)", strokeWidth: 1, strokeDasharray: "4,3" }),
            // Points + line
            relData.length > 1 && React.createElement("polyline", {
              points: relData.map(function (b) {
                var x = pad.l + (b.meanPred) * (chartW - pad.l - pad.r);
                var y = (chartH - pad.b) - (b.observedRate / 100) * (chartH - pad.t - pad.b);
                return x + "," + y;
              }).join(" "),
              fill: "none", stroke: "#16a34a", strokeWidth: 2
            }),
            relData.map(function (b, i) {
              var x = pad.l + (b.meanPred) * (chartW - pad.l - pad.r);
              var y = (chartH - pad.b) - (b.observedRate / 100) * (chartH - pad.t - pad.b);
              return React.createElement("circle", { key: i, cx: x, cy: y, r: 3, fill: "#16a34a" });
            }),
            // Axis labels
            React.createElement("text", { x: pad.l + (chartW - pad.l - pad.r) / 2, y: chartH - 4, textAnchor: "middle", fontSize: 10, fill: "var(--text3)" }, "Mean Predicted"),
            React.createElement("text", { x: 10, y: pad.t + (chartH - pad.t - pad.b) / 2, textAnchor: "middle", fontSize: 10, fill: "var(--text3)", transform: "rotate(-90,10," + (pad.t + (chartH - pad.t - pad.b) / 2) + ")" }, "Observed Rate")
          )
        ),

        // Interpretation guide
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 10, lineHeight: 1.5 } },
          "Confusion matrix: top-left = correct winners, bottom-right = correct losers, top-right = false alarms, bottom-left = missed calls. ",
          "Precision = how many buy calls were right. Recall = how many actual winners caught. ",
          "Reliability diagram: points on diagonal = well-calibrated (60% prediction wins ~60%). Above = under-confident, below = over-confident. ECE under 5% is good."
        )
      );
    }

    function renderFoldTrend(championInfo) {
      var foldResults = championInfo && championInfo.foldResults;
      if (!foldResults || foldResults.length < 2) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Fold-by-Fold Accuracy Trend"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } },
            foldResults && foldResults.length === 1 ? "Only 1 fold completed — need at least 2 for trend analysis." : "Walk-forward fold data not available."
          )
        );
      }

      var verdict = foldTrendVerdict(foldResults);
      var accs = foldResults.map(function (f) { return f.finalValAcc || 0; });
      var avgAcc = championInfo.walkForwardAcc || accs.reduce(function (s, v) { return s + v; }, 0) / accs.length;
      var minAcc = Math.min.apply(null, accs);
      var maxAcc = Math.max.apply(null, accs);
      var bestFold = championInfo.bestFold || 1;

      // Chart dimensions
      var chartW = 320, chartH = 120, pad = { t: 15, r: 10, b: 25, l: 40 };
      var plotW = chartW - pad.l - pad.r;
      var plotH = chartH - pad.t - pad.b;
      var yMin = Math.floor(minAcc / 5) * 5 - 5;
      var yMax = Math.ceil(maxAcc / 5) * 5 + 5;
      if (yMax <= yMin + 10) yMax = yMin + 10;

      var points = foldResults.map(function (f, i) {
        var x = pad.l + (i / (foldResults.length - 1)) * plotW;
        var y = pad.t + (1 - (f.finalValAcc - yMin) / (yMax - yMin)) * plotH;
        return { x: x, y: y, acc: f.finalValAcc, fold: f.fold };
      });
      var avgY = pad.t + (1 - (avgAcc - yMin) / (yMax - yMin)) * plotH;

      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "Fold-by-Fold Accuracy Trend"),
        React.createElement("div", { style: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginTop: 8 } },
          React.createElement("svg", { width: chartW, height: chartH, style: { display: "block" } },
            // Grid
            React.createElement("line", { x1: pad.l, y1: pad.t, x2: pad.l, y2: chartH - pad.b, stroke: "var(--border)", strokeWidth: 1 }),
            React.createElement("line", { x1: pad.l, y1: chartH - pad.b, x2: chartW - pad.r, y2: chartH - pad.b, stroke: "var(--border)", strokeWidth: 1 }),
            // Average line
            React.createElement("line", { x1: pad.l, y1: avgY, x2: chartW - pad.r, y2: avgY, stroke: "var(--text3)", strokeWidth: 1, strokeDasharray: "4,3" }),
            React.createElement("text", { x: chartW - pad.r + 2, y: avgY + 3, fontSize: 9, fill: "var(--text3)" }, avgAcc.toFixed(1) + "%"),
            // Polyline
            React.createElement("polyline", {
              points: points.map(function (p) { return p.x + "," + p.y; }).join(" "),
              fill: "none", stroke: "#16a34a", strokeWidth: 2
            }),
            // Dots
            points.map(function (p, i) {
              var color = p.acc >= avgAcc ? "#16a34a" : p.acc >= avgAcc - 5 ? "#f59e0b" : "#ef4444";
              return React.createElement("circle", { key: i, cx: p.x, cy: p.y, r: 4, fill: color });
            }),
            // Fold labels
            points.map(function (p, i) {
              return React.createElement("text", { key: "l" + i, x: p.x, y: chartH - pad.b + 12, textAnchor: "middle", fontSize: 9, fill: "var(--text3)" }, "F" + (i + 1));
            }),
            React.createElement("text", { x: pad.l + plotW / 2, y: chartH - 2, textAnchor: "middle", fontSize: 9, fill: "var(--text3)" }, "Fold")
          ),
          React.createElement("div", { style: { fontSize: 12, minWidth: 120 } },
            React.createElement("div", { style: { color: verdict.color, fontWeight: 700, marginBottom: 4 } }, verdict.text),
            React.createElement("div", null, "CV: " + verdict.cv.toFixed(1) + "%"),
            React.createElement("div", null, "Range: " + minAcc.toFixed(1) + "% \u2013 " + maxAcc.toFixed(1) + "%"),
            React.createElement("div", null, "Best Fold: #" + bestFold),
            React.createElement("div", null, "Completed: " + foldResults.length + " folds")
          )
        ),

        // Fold detail table
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 12 } },
          React.createElement("thead", null,
            React.createElement("tr", null,
              ["Fold", "Train N", "Val N", "Accuracy", "AUC", "F1", "Precision", "Recall"].map(function (h) {
                return React.createElement("th", { key: h, style: { textAlign: h === "Fold" ? "left" : "right", padding: "3px 6px", fontSize: 11, color: "var(--text3)", fontWeight: 600, borderBottom: "1px solid var(--border)" } }, h);
              })
            )
          ),
          React.createElement("tbody", null,
            foldResults.map(function (fr, i) {
              var isBest = fr.fold === bestFold;
              var bg = isBest ? "rgba(22,163,74,0.08)" : undefined;
              return React.createElement("tr", { key: i, style: { background: bg } },
                React.createElement("td", { style: { padding: "3px 6px", fontWeight: 600 } }, "F" + fr.fold),
                React.createElement("td", { style: { padding: "3px 6px", textAlign: "right" } }, fmtNum(fr.trainSize)),
                React.createElement("td", { style: { padding: "3px 6px", textAlign: "right" } }, fmtNum(fr.valSize)),
                React.createElement("td", { style: { padding: "3px 6px", textAlign: "right", fontWeight: 700, color: fr.finalValAcc >= avgAcc ? "#16a34a" : "#ef4444" } }, fmtNum(fr.finalValAcc, 1) + "%"),
                React.createElement("td", { style: { padding: "3px 6px", textAlign: "right" } }, fmtNum(fr.auc, 3)),
                React.createElement("td", { style: { padding: "3px 6px", textAlign: "right" } }, fmtNum(fr.f1, 3)),
                React.createElement("td", { style: { padding: "3px 6px", textAlign: "right" } }, fmtNum(fr.precision, 3)),
                React.createElement("td", { style: { padding: "3px 6px", textAlign: "right" } }, fmtNum(fr.recall, 3))
              );
            })
          )
        ),

        // Interpretation guide
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 10, lineHeight: 1.5 } },
          "Each fold tests the model on a different time period. Flat line = model generalizes consistently. ",
          "Downward trend = degrading on newer data (overfitting). CV under 5% = stable, 5-15% = moderate, over 15% = unreliable. ",
          "AUC above 0.6 is decent, above 0.7 is good."
        )
      );
    }

    function renderDriftMonitor() {
      var hasTrainer = !!(window.MLTrainer);
      var dh = mlDriftHistory;
      var currentDrift = dh && dh.currentDrift;
      var history = dh && dh.history ? dh.history : [];

      var badgeBg = currentDrift && currentDrift.drifted ? "#ef4444" : currentDrift ? "#16a34a" : "var(--text3)";
      var badgeText = currentDrift ? (currentDrift.drifted ? "Drift Detected" : "No Drift") : "Unknown";

      var items = [
        React.createElement("div", { key: "badge", style: { display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: badgeBg + "22", border: "1px solid " + badgeBg, marginBottom: 8 } },
          React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", background: badgeBg } }),
          React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: badgeBg } }, badgeText)
        )
      ];

      if (currentDrift) {
        items.push(React.createElement("div", { key: "stats", style: { fontSize: 12, color: "var(--text3)", lineHeight: 1.6, marginBottom: 8 } },
          React.createElement("span", null, "KL Divergence: " + (currentDrift.score != null ? currentDrift.score.toFixed(3) : "\u2014") + " (threshold: 0.100)"),
          React.createElement("span", null, " \u00B7 Predictions: " + (currentDrift.nPredictions || 0))
        ));
      }

      // Distribution comparison chart
      if (currentDrift && currentDrift.nPredictions >= 20) {
        var chartW = 300, chartH = 120, pad = { t: 10, r: 10, b: 25, l: 35 };
        var recentMeta = null;
        // We don't have raw recent predictions here, but we can show the drift score as a bar
        var scoreBar = Math.min(1, (currentDrift.score || 0) / 0.3);
        items.push(React.createElement("div", { key: "bar", style: { marginTop: 4 } },
          React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", marginBottom: 2 } }, "Drift Score vs Threshold"),
          React.createElement("div", { style: { height: 12, background: "var(--bg3)", borderRadius: 6, overflow: "hidden", position: "relative" } },
            React.createElement("div", { style: { height: "100%", width: (scoreBar * 100) + "%", background: currentDrift.drifted ? "#ef4444" : "#16a34a", borderRadius: 6, transition: "width 0.3s" } }),
            React.createElement("div", { style: { position: "absolute", left: (0.1 / 0.3 * 100) + "%", top: 0, height: "100%", width: 1, background: "var(--text3)" } })
          )
        ));
      }

      // Time-series chart of historical drift scores
      if (history.length > 1) {
        var chartW = 320, chartH = 100, pad = { t: 10, r: 10, b: 20, l: 35 };
        var plotW = chartW - pad.l - pad.r;
        var plotH = chartH - pad.t - pad.b;
        var maxScore = Math.max.apply(null, history.map(function (h) { return h.driftScore || 0; }));
        maxScore = Math.max(maxScore, 0.15);

        var pts = history.map(function (h, i) {
          var x = pad.l + (i / (history.length - 1)) * plotW;
          var y = pad.t + (1 - (h.driftScore || 0) / maxScore) * plotH;
          return x + "," + y;
        });

        items.push(React.createElement("div", { key: "ts", style: { marginTop: 8 } },
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, marginBottom: 4 } }, "Drift Score Over Time (" + history.length + " samples)"),
          React.createElement("svg", { width: chartW, height: chartH, style: { display: "block" } },
            React.createElement("line", { x1: pad.l, y1: pad.t, x2: pad.l, y2: chartH - pad.b, stroke: "var(--border)", strokeWidth: 1 }),
            React.createElement("line", { x1: pad.l, y1: chartH - pad.b, x2: chartW - pad.r, y2: chartH - pad.b, stroke: "var(--border)", strokeWidth: 1 }),
            // Threshold line
            React.createElement("line", { x1: pad.l, y1: pad.t + (1 - 0.1 / maxScore) * plotH, x2: chartW - pad.r, y2: pad.t + (1 - 0.1 / maxScore) * plotH, stroke: "#ef4444", strokeWidth: 1, strokeDasharray: "4,3" }),
            React.createElement("text", { x: chartW - pad.r + 2, y: pad.t + (1 - 0.1 / maxScore) * plotH + 3, fontSize: 8, fill: "#ef4444" }, "0.1"),
            // Polyline
            React.createElement("polyline", { points: pts.join(" "), fill: "none", stroke: "#16a34a", strokeWidth: 1.5 }),
            // Dots colored by drift status
            history.map(function (h, i) {
              var x = pad.l + (i / (history.length - 1)) * plotW;
              var y = pad.t + (1 - (h.driftScore || 0) / maxScore) * plotH;
              return React.createElement("circle", { key: i, cx: x, cy: y, r: 2, fill: h.drifted ? "#ef4444" : "#16a34a" });
            }),
            React.createElement("text", { x: pad.l + plotW / 2, y: chartH - 4, textAnchor: "middle", fontSize: 9, fill: "var(--text3)" }, "Time")
          )
        ));
      } else if (hasTrainer) {
        items.push(React.createElement("p", { key: "hint", style: { fontSize: 11, color: "var(--text3)", marginTop: 4 } },
          "Drift history will appear here as the ML model scores predictions. Each prediction appends a drift score to the time-series."
        ));
      }

      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "Feature Drift Monitor"),
        items,
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 8, lineHeight: 1.5 } },
          "Tracks whether prediction distribution shifts from training. Green = predictions match training. Red = distribution shifted (model may be unreliable). ",
          "KL divergence under 0.1 = fine, over 0.1 = drift detected. Spike in time-series = regime change. When drift detected, consider retraining."
        )
      );
    }

    function renderPromotionHistory() {
      var ph = mlPromoHistory;
      var history = ph && ph.retrainHistory ? ph.retrainHistory : [];
      var versions = ph && ph.versions ? ph.versions : [];

      if (history.length === 0 && versions.length === 0) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Champion / Challenger History"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4 } },
            "No retrain history — run Continuous Retrain to start tracking promotion decisions."
          )
        );
      }

      // Retrain history table with score comparison
      var retrainRows = history.slice().reverse().slice(0, 10).map(function (h, i) {
        var hasScores = h.championScore != null && h.challengerScore != null;
        var improvement = hasScores ? h.challengerScore - h.championScore : null;
        return React.createElement("tr", { key: i, style: { borderBottom: "1px solid var(--border)" } },
          React.createElement("td", { style: { padding: "4px 8px", fontSize: 12 } }, new Date(h.timestamp).toLocaleString()),
          React.createElement("td", { style: { padding: "4px 8px", fontSize: 12, textAlign: "right", fontWeight: 600 } }, fmtNum(h.walkForwardAcc, 1) + "%"),
          React.createElement("td", { style: { padding: "4px 8px", fontSize: 12, textAlign: "right", color: "var(--text3)" } }, hasScores ? fmtNum(h.championScore, 1) + "%" : "\u2014"),
          React.createElement("td", { style: { padding: "4px 8px", fontSize: 12, textAlign: "right", color: "var(--text3)" } }, hasScores ? fmtNum(h.challengerScore, 1) + "%" : "\u2014"),
          React.createElement("td", { style: { padding: "4px 8px", fontSize: 12, textAlign: "right", color: improvement != null ? (improvement >= 1.0 ? "#16a34a" : improvement >= 0 ? "#f59e0b" : "#ef4444") : "var(--text3)" } }, improvement != null ? (improvement >= 0 ? "+" : "") + improvement.toFixed(1) + "%" : "\u2014"),
          React.createElement("td", { style: { padding: "4px 8px", fontSize: 12 } },
            React.createElement("span", { style: { fontWeight: 700, color: h.promoted ? "#16a34a" : "var(--text3)" } }, h.promoted ? "Promoted" : "Kept")
          ),
          React.createElement("td", { style: { padding: "4px 8px", fontSize: 11, color: "var(--text3)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, h.reason || "")
        );
      });

      // Version timeline (compact)
      var versionItems = versions.slice(0, 8).map(function (v, i) {
        var isChamp = v.role === "champion";
        var bg = isChamp ? "rgba(22,163,74,0.1)" : "var(--bg3)";
        var border = isChamp ? "1px solid #16a34a" : "1px solid var(--border)";
        return React.createElement("div", { key: i, style: { padding: "4px 8px", borderRadius: 6, background: bg, border: border, fontSize: 11 } },
          React.createElement("span", { style: { fontWeight: 700 } }, v.versionId || "?"),
          " \u00B7 " + fmtNum(v.walkForwardAcc || v.finalValAcc, 1) + "%",
          " \u00B7 " + (v.role || "candidate"),
          v.savedAt ? " \u00B7 " + new Date(v.savedAt).toLocaleDateString() : ""
        );
      });

      // Promotion threshold visualization
      var thresholdBar = null;
      var lastEntry = history.length > 0 ? history[history.length - 1] : null;
      if (lastEntry && lastEntry.championScore != null && lastEntry.challengerScore != null) {
        var cScore = lastEntry.championScore;
        var chScore = lastEntry.challengerScore;
        var improvement = chScore - cScore;
        var barMax = Math.max(cScore, chScore, 80) + 5;
        var barMin = Math.max(0, Math.min(cScore, chScore) - 5);
        var barRange = barMax - barMin;
        var champX = ((cScore - barMin) / barRange) * 100;
        var challX = ((chScore - barMin) / barRange) * 100;

        thresholdBar = React.createElement("div", { style: { marginTop: 10 } },
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, marginBottom: 4 } }, "Last Promotion Attempt"),
          React.createElement("div", { style: { position: "relative", height: 24, background: "var(--bg3)", borderRadius: 4 } },
            React.createElement("div", { style: { position: "absolute", left: champX + "%", top: 0, width: 2, height: "100%", background: "var(--text3)" } }),
            React.createElement("div", { style: { position: "absolute", left: challX + "%", top: 0, width: 2, height: "100%", background: improvement >= 1.0 ? "#16a34a" : "#ef4444" } }),
            React.createElement("div", { style: { position: "absolute", left: Math.min(champX, challX) + "%", top: 9, width: Math.abs(challX - champX) + "%", height: 6, background: improvement >= 1.0 ? "#16a34a" : "#f59e0b", borderRadius: 3 } }),
            React.createElement("div", { style: { position: "absolute", left: champX + "%", bottom: -14, fontSize: 9, color: "var(--text3)", transform: "translateX(-50%)" } }, "Champ " + cScore.toFixed(1)),
            React.createElement("div", { style: { position: "absolute", left: challX + "%", bottom: -14, fontSize: 9, color: "var(--text3)", transform: "translateX(-50%)" } }, "Chall " + chScore.toFixed(1))
          ),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", marginTop: 14 } },
            "Gap: " + (improvement >= 0 ? "+" : "") + improvement.toFixed(1) + "% (need \u2265 1.0%)"
          )
        );
      }

      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: labelStyle }, "Champion / Challenger History"),

        thresholdBar,

        retrainRows.length > 0 && React.createElement("div", { style: { marginTop: 10 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 4 } }, "Retrain History"),
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null,
              React.createElement("tr", null,
                ["Date", "WF Acc", "Champion", "Challenger", "Gap", "Verdict", "Reason"].map(function (h) {
                  return React.createElement("th", { key: h, style: { textAlign: h === "Date" || h === "Reason" ? "left" : "right", padding: "3px 6px", fontSize: 11, color: "var(--text3)", fontWeight: 600, borderBottom: "1px solid var(--border)" } }, h);
                })
              )
            ),
            React.createElement("tbody", null, retrainRows)
          )
        ),

        versionItems.length > 0 && React.createElement("div", { style: { marginTop: 10 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 4 } }, "Version Timeline"),
          React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, versionItems)
        ),

        // Interpretation guide
        React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 10, lineHeight: 1.5 } },
          "Champion = current model in production. Challenger = new candidate. Promotion requires +1.0% accuracy improvement. ",
          "'Promoted' = new model won and replaced old. 'Kept' = challenger wasn't good enough. ",
          "Version timeline shows all saved models (green border = current champion)."
        )
      );
    }

    function renderMLEngine() {
      var hasML = !!(window.MLTrainer);
      var hasOptimizer = !!(window.MLOptimizer);
      var championInfo = mlStatus && mlStatus.champion;

      return React.createElement("div", null,
        // ML Scoring Status (Report 1)
        renderMLStatusBadge(),
        // Model Status
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Model Status"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginTop: 8 } },
            statCard("Has Model", mlStatus && mlStatus.hasModel ? "Yes" : "No"),
            statCard("Features", (mlStatus && mlStatus.totalFeaturesAvailable) || 0),
            statCard("Method", championInfo && championInfo.method ? String(championInfo.method) : "N/A"),
            statCard("WF Accuracy", championInfo && championInfo.walkForwardAcc ? championInfo.walkForwardAcc + "%" : "N/A"),
            statCard("Val Accuracy", championInfo && championInfo.finalValAcc ? championInfo.finalValAcc + "%" : "N/A"),
            statCard("Versions", (mlStatus && mlStatus.versions && mlStatus.versions.length) || 0)
          )
        ),
        // Feature Importance
        championInfo && championInfo.featureImportance && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Feature Importance"),
          React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" } },
            championInfo.featureImportance.slice(0, 10).map(function (fi) {
              var intensity = Math.min(1, fi.importance * 5);
              var bg = "rgba(22,163,74," + (0.1 + intensity * 0.4) + ")";
              return React.createElement("div", { key: fi.feature, style: { padding: "4px 10px", borderRadius: 12, background: bg, fontSize: 12, fontWeight: 500, border: "1px solid var(--border)" } },
                fi.feature + " (" + fi.importance.toFixed(3) + ")"
              );
            })
          )
        ),
        // Training Controls
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Training Controls"),
          React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" } },
            React.createElement("label", { style: { fontSize: 12, display: "flex", alignItems: "center", gap: 4 } },
              React.createElement("input", {
                type: "radio", name: "mlmode", value: "walkforward",
                checked: mlTrainMode === "walkforward",
                onChange: function () { setMlTrainMode("walkforward"); }
              }),
              "Walk-Forward (Recommended)"
            ),
            React.createElement("label", { style: { fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginLeft: 12 } },
              React.createElement("input", {
                type: "radio", name: "mlmode", value: "legacy",
                checked: mlTrainMode === "legacy",
                onChange: function () { setMlTrainMode("legacy"); }
              }),
              "Single Split (Legacy)"
            )
          ),
          React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
            React.createElement("button", {
              onClick: handleTrainML,
              disabled: mlTraining || !hasML,
              style: { padding: "8px 16px", borderRadius: 6, background: mlTraining ? "#9ca3af" : "var(--accent, #16a34a)", color: "#fff", border: "none", cursor: mlTraining ? "not-allowed" : "pointer", fontWeight: 600, opacity: hasML ? 1 : 0.5 }
            }, mlTraining ? "Training..." : "Train Model"),
            React.createElement("button", {
              onClick: handleRetrainML,
              disabled: mlTraining || !hasML,
              style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: mlTraining ? "not-allowed" : "pointer", opacity: hasML ? 1 : 0.5 }
            }, "Continuous Retrain")
          ),
          hasOptimizer && React.createElement("button", {
            onClick: handleOptimizeConfig,
            disabled: mlTraining || mlOptimizing,
            style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: (mlTraining || mlOptimizing) ? "not-allowed" : "pointer", marginTop: 8 }
          }, mlOptimizing ? "Optimizing..." : "Optimize Backtest Config (Bayesian)")
        ),
        // Fold-by-Fold Accuracy Trend (Report 3)
        renderFoldTrend(championInfo),
        // Model Diagnostics — Confusion Matrix + Reliability (Report 2)
        renderConfusionMatrixAndReliability(championInfo),
        // Feature Drift Monitor (Report 4)
        renderDriftMonitor(),
        // Champion / Challenger History (Report 5)
        renderPromotionHistory(),
        // ML Log
        mlLog.length > 0 && React.createElement("div", { style: Object.assign({}, cardStyle, { maxHeight: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }) },
          mlLog.map(function (entry, i) {
            return React.createElement("div", { key: i, style: { marginBottom: 2 } },
              React.createElement("span", { style: { color: "var(--text3)" } }, String(entry.time) + " "),
              String(entry.msg)
            );
          })
        )
      );
    }
  }

  return { Dashboard: Dashboard };
})();
