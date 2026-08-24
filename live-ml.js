/* ══════════════════════════════════════════════════════════════════════════
   Live ML Expert — StoX
   Learns which indicator states precede up-days from live/confirmed market
   data. Maintains a rolling daily corpus (features at previous close, label =
   realized next-bar return), retrains a walk-forward model daily on confirmed
   outcomes only, and emits auditable "conditional signs" (bucket win rates).

   Depends on: window.PatternStore, window.MLTrainer, window.TechIndicators,
   window.OHLCVFetcher, window.OfflineOHLCV (optional), window.NIFTY_200.

   Usage:
     await LiveML.collect({ maxDays: 90, onProgress });
     await LiveML.retrain({ numFolds: 5, onProgress });
     const status = await LiveML.getStatus();
     const sig = await LiveML.predictToday("RELIANCE");
     const signals = await LiveML.getTodaySignals({ count: 20 });
   ══════════════════════════════════════════════════════════════════════════ */

window.LiveML = (function () {

  var WARMUP = 30;

  var META_STATUS = "ml_live_status";
  var KEY_LAST_DATES = "ml_live_last_dates";
  var MODEL_KEYS = {
    champion: "ml_live_champion",
    championMeta: "ml_live_champion_meta",
    legacy: "ml_live_model",
    legacyMeta: "ml_live_model_meta",
    candidatePrefix: "ml_live_model_"
  };

  var BUCKETS = {
    rsi: { label: "RSI (14)", bins: [30, 40, 50, 60, 70, 80], labels: ["<30", "30-40", "40-50", "50-60", "60-70", "70-80", "80+"] },
    atr_pct: { label: "ATR %", bins: [1, 2, 3, 4, 5, 8], labels: ["<1%", "1-2%", "2-3%", "3-4%", "4-5%", "5-8%", "8%+"] },
    bb_position: { label: "BB Position", bins: [0.2, 0.4, 0.6, 0.8], labels: ["<0.2", "0.2-0.4", "0.4-0.6", "0.6-0.8", "0.8+"] },
    volume_ratio: { label: "Volume Ratio", bins: [0.7, 1, 1.3, 1.7, 2.5], labels: ["<0.7", "0.7-1", "1-1.3", "1.3-1.7", "1.7-2.5", "2.5+"] },
    macd_hist: { label: "MACD Hist %", bins: [-0.5, -0.1, 0, 0.1, 0.5], labels: ["<-0.5%", "-0.5/-0.1%", "-0.1/0%", "0/0.1%", "0.1/0.5%", "0.5%+"] },
    ema_slope: { label: "EMA12 Slope %", bins: [-0.5, 0, 0.3, 0.7], labels: ["<-0.5", "-0.5/0", "0/0.3", "0.3/0.7", "0.7+"] },
    adx: { label: "ADX (14)", bins: [15, 20, 25, 35], labels: ["<15", "15-20", "20-25", "25-35", "35+"] },
    entry_score: { label: "Entry Score", bins: [30, 45, 55, 65, 75], labels: ["<30", "30-45", "45-55", "55-65", "65-75", "75+"] }
  };

  function round2(v) { return Math.round(v * 100) / 100; }
  function round3(v) { return Math.round(v * 1000) / 1000; }

  function getUniverse() {
    if (window.NIFTY_200 && window.NIFTY_200.length) return window.NIFTY_200;
    return [];
  }

  /* Build a {ticker -> record} map from the offline store once per operation. */
  async function loadOfflineMap() {
    if (!window.OfflineOHLCV || !window.OfflineOHLCV.getAll) return null;
    try {
      var records = await window.OfflineOHLCV.getAll();
      var map = {};
      records.forEach(function (rec) {
        if (!rec || !rec.ticker) return;
        map[rec.ticker] = rec;
        map[rec.ticker.replace(/\.NS$/, "").replace(/\.BO$/, "")] = rec;
      });
      return map;
    } catch (e) { return null; }
  }

  /* Resolve a promise or give up after ms (keeps the collector moving). */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var tid = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
      promise.then(function (v) { if (!done) { done = true; clearTimeout(tid); resolve(v); } })
             .catch(function () { if (!done) { done = true; clearTimeout(tid); resolve(null); } });
    });
  }

  /* Look up an offline record tolerating .NS/.BO suffix mismatches:
     Score Tuner stores bare tickers ("RELIANCE"), NIFTY_200 uses "RELIANCE.NS". */
  function offlineLookup(map, symbol) {
    if (!map || !symbol) return null;
    return map[symbol] || map[symbol + ".NS"] || map[symbol.replace(/\.NS$/, "").replace(/\.BO$/, "")] || null;
  }

  /* Yield to the event loop so progress callbacks can paint. */
  function yieldTick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /* Make sure PatternStore is initialized — getMeta/setMeta reject otherwise,
     which silently degraded every prediction (base rate, ML model lookups). */
  async function ensureStoreInit() {
    try { if (window.PatternStore && window.PatternStore.init) await window.PatternStore.init(); } catch (e) {}
  }

  /* Load daily candles.
     - firstRun (no prior collects): offline first, live fallback.
     - subsequent runs: live first (Yahoo), offline fallback. Ensures latest
       closing prices for tracker resolution. */
  async function loadDailyCandles(symbol, offlineMap, liveFirst) {
    var rec = offlineLookup(offlineMap, symbol);
    var offlineDaily = rec ? (rec.daily || rec.data || null) : null;

    if (liveFirst && window.OHLCVFetcher && window.OHLCVFetcher.fetchOHLCVCached) {
      /* Live first — try Yahoo, fall back to offline if it fails or is too short. */
      try {
        var r = await withTimeout(window.OHLCVFetcher.fetchOHLCVCached(symbol + ".NS", "daily"), 10000);
        var c = r && r.data ? r.data : (Array.isArray(r) ? r : null);
        if (c && c.length >= WARMUP + 5) return c;
      } catch (e) {}
      /* Live failed — fall back to offline */
      if (offlineDaily && offlineDaily.length >= WARMUP + 5) return offlineDaily;
      return offlineDaily;
    }

    /* Offline first — original path for first-time collect. */
    if (offlineDaily && offlineDaily.length >= WARMUP + 5) return offlineDaily;
    if (window.OHLCVFetcher && window.OHLCVFetcher.fetchOHLCVCached) {
      try {
        var r2 = await withTimeout(window.OHLCVFetcher.fetchOHLCVCached(symbol + ".NS", "daily"), 10000);
        var c2 = r2 && r2.data ? r2.data : (Array.isArray(r2) ? r2 : null);
        if (c2 && c2.length >= WARMUP + 5) return c2;
      } catch (e) {}
    }
    return offlineDaily;
  }

  /* Today's date as YYYY-MM-DD in IST (same timezone as candle timestamps). */
  function istToday() {
    return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  }

  /* Market close as epoch ms IST today (3:30 PM IST = 15:30). */
  function marketCloseIST() {
    var now = new Date(Date.now() + 5.5 * 3600 * 1000);
    var close = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 30, 0, 0);
    return close.getTime() - 5.5 * 3600 * 1000; // back to UTC epoch
  }

  /* Last bar date (YYYY-MM-DD) of a candle array, or null. */
  function lastBarDate(candles) {
    if (!candles || !candles.length) return null;
    for (var i = candles.length - 1; i >= 0; i--) {
      if (candles[i] && candles[i].t != null) {
        var d = String(candles[i].t).slice(0, 10);
        if (d) return d;
      }
    }
    return null;
  }

  /* If a symbol's offline snapshot ends before today, fetch the latest daily
     candle(s) live and append bars newer than the snapshot so the newest bar
     is always today's. Returns the original array when nothing is refreshed
     (identical reference = no refresh, so callers can detect changes). Also
     writes the appended bars back to the offline IndexedDB record so future
     collects and the rest of the app (charts, screener) see today's bar
     instead of re-fetching the same candles repeatedly. */
  async function refreshStaleOffline(symbol, candles, offlineMap, skipBeforeClose) {
    if (!window.OHLCVFetcher || !window.OHLCVFetcher.fetchOHLCVCached) return candles;
    var rec = offlineLookup(offlineMap, symbol);
    if (!rec) return candles;
    var recDaily = (rec.daily || rec.data) || null;
    var offLast = lastBarDate(recDaily);
    var today = istToday();
    /* Before market close today's bar doesn't exist yet — nothing to refresh. */
    if (skipBeforeClose && Date.now() < marketCloseIST()) return candles;
    var needsRefresh = false;
    if (!offLast || offLast < today) {
      needsRefresh = true;
    } else if (offLast === today && rec.downloadedAt != null) {
      needsRefresh = rec.downloadedAt < marketCloseIST();
    }
    if (!needsRefresh) return candles;
    var liveRes = await withTimeout(window.OHLCVFetcher.fetchOHLCVCached(symbol, "daily"), 10000);
    var liveC = liveRes && liveRes.data ? liveRes.data : null;
    if (!liveC || liveC.length === 0) return candles;
    var liveNew = liveC.filter(function (x) {
      return x && x.t != null && String(x.t).slice(0, 10) > offLast;
    }).slice(-10);
    if (liveNew.length === 0) return candles;
    var merged = recDaily.concat(liveNew);
    /* Write back to the offline store (v1 records use data, v2 use daily;
       hourly/weekly untouched). */
    try {
      var write = Object.assign({}, rec, { downloadedAt: Date.now() });
      if (rec.daily != null) write.daily = merged;
      else write.data = merged;
      if (window.OfflineOHLCV && window.OfflineOHLCV.put) {
        await withTimeout(window.OfflineOHLCV.put(write), 5000);
      }
    } catch (e) {}
    return merged;
  }

  /* Indicator arrays via TechIndicators. */
  function computeIndicators(candles) {
    var TI = window.TechIndicators;
    var bb = TI.bollingerBands(candles, 20, 2);
    var macd = TI.macd(candles, 12, 26, 9);
    var adx = TI.adx(candles, 14);
    return {
      rsi: TI.rsi(candles, 14),
      atr: TI.atr(candles, 14),
      bb: bb,
      volSma: TI.sma(TI.volumes(candles), 20),
      macd: macd,
      emaFast: TI.ema(candles, 12),
      adx: adx
    };
  }

  /* Feature vector at bar index i — same keys as the ML model. */
  function featuresAt(i, candles, ind) {
    var close = candles[i].c;
    var es = 0.5;
    try {
      var TI = window.TechIndicators;
      if (TI && ind && ind.rsi && ind.adx && ind.macd && ind.bb && ind.atr) {
        var trendScore = 0;
        var sma20Arr = TI.sma(candles, 20);
        var sma50Arr = TI.sma(candles, 50);
        var sma20 = sma20Arr && sma20Arr[i];
        var sma50 = sma50Arr && sma50Arr[i];
        if (sma20 != null && close > sma20) trendScore += 1;
        if (sma20 != null && sma50 != null && sma20 > sma50) trendScore += 1;
        var macdH = ind.macd.histogram && ind.macd.histogram[i];
        if (macdH != null && macdH > 0) trendScore += 1;
        var adxVal = ind.adx.adx && ind.adx.adx[i];
        var plusDI = ind.adx.plusDI && ind.adx.plusDI[i];
        var minusDI = ind.adx.minusDI && ind.adx.minusDI[i];
        if (adxVal != null && adxVal >= 25 && plusDI != null && minusDI != null && plusDI > minusDI) trendScore += 1;
        var pullScore = 0;
        var rsi = ind.rsi[i];
        if (rsi != null && rsi < 40) pullScore += 1;
        var bbUpper = ind.bb.upper && ind.bb.upper[i];
        var bbLower = ind.bb.lower && ind.bb.lower[i];
        if (bbUpper != null && bbLower != null && bbUpper > bbLower) {
          var bbW = (bbUpper - bbLower) / close;
          var bbW5 = 0;
          for (var bi = Math.max(0, i - 5); bi < i; bi++) {
            if (ind.bb.upper[bi] != null && ind.bb.lower[bi] != null) {
              bbW5 += (ind.bb.upper[bi] - ind.bb.lower[bi]) / (candles[bi].c || 1);
            }
          }
          bbW5 = bbW5 / Math.max(1, i - Math.max(0, i - 5));
          if (bbW5 > 0 && bbW < bbW5 * 0.9) pullScore += 1;
        }
        var probScore = 0;
        if (ind.atr[i] != null && close > 0) {
          var atrPct = ind.atr[i] / close;
          if (atrPct > 0 && atrPct < 0.04) probScore += 1;
          var targetReach = (0.04 * close) / ind.atr[i];
          if (targetReach > 1.5) probScore += 1;
        }
        var swingScore = 0;
        if (rsi != null && rsi < 40 && i >= 2 && ind.rsi[i - 2] != null && ind.rsi[i - 2] > rsi) swingScore += 1;
        var raw = (trendScore / 4) * 0.35 + (pullScore / 2) * 0.30 + (probScore / 2) * 0.35 + (swingScore / 1) * 0.0;
        es = Math.max(0, Math.min(1, raw));
      }
    } catch (_e) {}
    return {
      rsi: ind.rsi[i] != null ? round2(ind.rsi[i]) : 50,
      atr_pct: ind.atr[i] != null && close > 0 ? round3((ind.atr[i] / close) * 100) : 0,
      bb_position: ind.bb.upper && ind.bb.lower ? round3((close - (ind.bb.lower[i] || 0)) / Math.max(0.01, (ind.bb.upper[i] || 0) - (ind.bb.lower[i] || 0))) : 0.5,
      volume_ratio: ind.volSma && ind.volSma[i] ? round2(candles[i].v / Math.max(1, ind.volSma[i])) : 1,
      macd_hist: ind.macd && ind.macd.histogram && close > 0 ? round3(ind.macd.histogram[i] / close * 100) : 0,
      ema_slope: ind.emaFast[i] != null && ind.emaFast[Math.max(0, i - 3)] != null ? round3((ind.emaFast[i] - ind.emaFast[Math.max(0, i - 3)]) / Math.max(0.01, ind.emaFast[Math.max(0, i - 3)]) * 100) : 0,
      adx: ind.adx && ind.adx.adx ? round2(ind.adx.adx[i] || 0) : 0,
      entry_score: round3(es)
    };
  }

  /* ── Step 1: Morning Analysis Helpers ─────────────────────────────────── */

  /**
   * Generate a human-readable justification for why the ML model picked this stock.
   * Based on the 8 feature values and their relationship to up-day patterns.
   */
  function generateJustification(features, candles, ind) {
    var parts = [];
    var rsi = features.rsi;
    var bbPos = features.bb_position;
    var atrPct = features.atr_pct;
    var volRatio = features.volume_ratio;
    var macdHist = features.macd_hist;
    var emaSlope = features.ema_slope;
    var adx = features.adx;
    var entryScore = features.entry_score;

    // RSI analysis
    if (rsi < 30) parts.push("RSI at " + rsi + " (deeply oversold — mean-reversion opportunity)");
    else if (rsi < 40) parts.push("RSI at " + rsi + " (oversold zone — potential bounce)");
    else if (rsi > 70) parts.push("RSI at " + rsi + " (overbought — caution)");
    else if (rsi > 60) parts.push("RSI at " + rsi + " (bullish momentum)");
    else parts.push("RSI at " + rsi + " (neutral)");

    // Bollinger Band position
    if (bbPos < 0.2) parts.push("BB position " + bbPos + " (near lower band — potential support)");
    else if (bbPos > 0.8) parts.push("BB position " + bbPos + " (near upper band — resistance zone)");
    else if (bbPos < 0.4) parts.push("BB position " + bbPos + " (below midpoint — room to run up)");
    else parts.push("BB position " + bbPos + " (mid-range)");

    // Volume analysis
    if (volRatio > 1.5) parts.push("Volume " + volRatio + "x average (strong institutional interest)");
    else if (volRatio > 1.2) parts.push("Volume " + volRatio + "x average (above-average participation)");
    else if (volRatio < 0.7) parts.push("Volume " + volRatio + "x average (low participation — wait for catalyst)");
    else parts.push("Volume " + volRatio + "x average (normal)");

    // MACD momentum
    if (macdHist > 0.1) parts.push("MACD histogram +0.1% (strong bullish momentum)");
    else if (macdHist > 0) parts.push("MACD histogram +" + macdHist + "% (positive momentum)");
    else if (macdHist < -0.1) parts.push("MACD histogram " + macdHist + "% (bearish momentum)");
    else parts.push("MACD histogram " + macdHist + "% (neutral)");

    // EMA slope
    if (emaSlope > 0.5) parts.push("EMA12 slope +" + emaSlope + "% (strong uptrend)");
    else if (emaSlope > 0) parts.push("EMA12 slope +" + emaSlope + "% (mild uptrend)");
    else if (emaSlope < -0.5) parts.push("EMA12 slope " + emaSlope + "% (downtrend)");
    else parts.push("EMA12 slope " + emaSlope + "% (flat)");

    // ADX trend strength
    if (adx > 30) parts.push("ADX " + adx + " (strong trend — direction likely to persist)");
    else if (adx > 20) parts.push("ADX " + adx + " (moderate trend)");
    else parts.push("ADX " + adx + " (weak trend — range-bound)");

    // Entry score
    if (entryScore > 0.6) parts.push("Composite entry score " + (entryScore * 100).toFixed(0) + "/100 (high-conviction setup)");
    else if (entryScore > 0.4) parts.push("Composite entry score " + (entryScore * 100).toFixed(0) + "/100 (moderate setup)");
    else parts.push("Composite entry score " + (entryScore * 100).toFixed(0) + "/100 (weak setup)");

    return parts.join(". ") + ".";
  }

  /**
   * Compute a composite technical strength score (0-100) from the 8 ML features.
   * Weights: trend (35%), pullback quality (30%), probability (35%).
   */
  function computeTechnicalScore(features) {
    var rsi = features.rsi || 50;
    var bbPos = features.bb_position != null ? features.bb_position : 0.5;
    var volRatio = features.volume_ratio || 1;
    var macdHist = features.macd_hist || 0;
    var emaSlope = features.ema_slope || 0;
    var adx = features.adx || 20;
    var entryScore = features.entry_score != null ? features.entry_score : 0.5;

    // Trend component (0-100): EMA slope, ADX, MACD direction
    var trendScore = 0;
    if (emaSlope > 0.5) trendScore += 40; else if (emaSlope > 0) trendScore += 25; else if (emaSlope > -0.5) trendScore += 10;
    if (adx > 30) trendScore += 30; else if (adx > 20) trendScore += 20; else if (adx > 15) trendScore += 10;
    if (macdHist > 0.1) trendScore += 30; else if (macdHist > 0) trendScore += 20; else if (macdHist > -0.1) trendScore += 10;

    // Pullback quality (0-100): RSI oversold, BB position low, volume confirmation
    var pullbackScore = 0;
    if (rsi < 30) pullbackScore += 40; else if (rsi < 40) pullbackScore += 30; else if (rsi < 50) pullbackScore += 15;
    if (bbPos < 0.2) pullbackScore += 30; else if (bbPos < 0.4) pullbackScore += 20; else if (bbPos < 0.6) pullbackScore += 10;
    if (volRatio > 1.3) pullbackScore += 30; else if (volRatio > 1) pullbackScore += 15;

    // Probability component (0-100): entry score, ATR attractiveness
    var probScore = entryScore * 100;

    // Weighted composite
    var composite = Math.round(trendScore * 0.35 + pullbackScore * 0.30 + probScore * 0.35);
    return Math.max(0, Math.min(100, composite));
  }

  /**
   * Compute ML-estimated expected 1-day change based on win probability
   * and historical base rate. Uses Kelly-inspired heuristic: if model says
   * X% win probability and base rate is Y%, expected return is scaled.
   */
  function computeExpectedChg(features, baseRate) {
    // Use entry score and feature alignment to estimate expected change
    var es = features.entry_score != null ? features.entry_score : 0.5;
    var rsi = features.rsi || 50;
    var macdHist = features.macd_hist || 0;
    var emaSlope = features.ema_slope || 0;

    // Simple heuristic: higher entry score + positive momentum = higher expected change
    var direction = (macdHist > 0 || emaSlope > 0) ? 1 : -1;
    var magnitude = es * 2.5; // scale: max entry_score 1.0 → 2.5% expected
    if (rsi < 30) magnitude += 0.5; // oversold bounce bonus
    if (rsi > 70) magnitude -= 0.3; // overbought penalty

    return round2(direction * magnitude);
  }

  /**
   * Generate a brief pattern summary for the stock.
   */
  function generatePatternSummary(features, candles, ind) {
    var parts = [];
    var rsi = features.rsi;
    var bbPos = features.bb_position;
    var volRatio = features.volume_ratio;
    var macdHist = features.macd_hist;
    var emaSlope = features.ema_slope;
    var adx = features.adx;

    // Overall trend
    if (emaSlope > 0.3 && adx > 25) parts.push("Strong uptrend");
    else if (emaSlope > 0) parts.push("Mild uptrend");
    else if (emaSlope < -0.3 && adx > 25) parts.push("Strong downtrend");
    else if (emaSlope < 0) parts.push("Mild downtrend");
    else parts.push("Sideways consolidation");

    // Momentum
    if (macdHist > 0.1) parts.push("bullish MACD");
    else if (macdHist < -0.1) parts.push("bearish MACD");

    // Oversold/overbought
    if (rsi < 35) parts.push("oversold RSI");
    else if (rsi > 65) parts.push("overbought RSI");

    // Volume
    if (volRatio > 1.5) parts.push("high volume");
    else if (volRatio < 0.7) parts.push("low volume");

    // BB squeeze
    if (bbPos < 0.2) parts.push("near BB lower band");
    else if (bbPos > 0.8) parts.push("near BB upper band");

    return parts.join(", ");
  }

  /* ── Morning scan persistence ─────────────────────────────────────────── */

  var KEY_MORNING_SCAN = "ml_live_morning_scan";
  var KEY_LIVE_LOG = "ml_live_log";

  async function saveMorningScan(signals) {
    try {
      var entry = {
        signals: (signals || []).map(function (s) {
          return { symbol: s.symbol, date: s.date, scanTime: s.scanTime, winProbability: s.winProbability, recommendation: s.recommendation, modelUsed: s.modelUsed, close: s.close, predictedClose: s.predictedClose, chgPct: s.chgPct, technicalScore: s.technicalScore, expectedChgPct: s.expectedChgPct, patternSummary: s.patternSummary, justification: s.justification, features: s.features };
        }),
        timestamp: Date.now()
      };
      await window.PatternStore.setMeta(KEY_MORNING_SCAN, entry);
    } catch (e) {}
  }

  async function loadMorningScan() {
    var entry = null;
    try { entry = await window.PatternStore.getMeta(KEY_MORNING_SCAN); } catch (e) {}
    return entry || null;
  }

  async function saveLiveLog(log) {
    try {
      var trimmed = (log || []).slice(-100);
      await window.PatternStore.setMeta(KEY_LIVE_LOG, { lines: trimmed, timestamp: Date.now() });
    } catch (e) {}
  }

  async function loadLiveLog() {
    var entry = null;
    try { entry = await window.PatternStore.getMeta(KEY_LIVE_LOG); } catch (e) {}
    return (entry && entry.lines) || [];
  }

  /* ── Prediction accuracy tracker ──────────────────────────────────────── */

  var KEY_TRACKER = "ml_live_pred_tracker";
  var TRACKER_MAX_DAYS = 120;

  async function getTracker() {
    var t = null;
    try { t = await window.PatternStore.getMeta(KEY_TRACKER); } catch (e) {}
    return t || { days: [] };
  }

  async function saveTracker(t) {
    t.days = t.days.slice(-TRACKER_MAX_DAYS);
    try { await window.PatternStore.setMeta(KEY_TRACKER, t); } catch (e) {}
  }

  /* Record a day-entry per feature date. Replaces a same-date entry only if
     it hasn't been resolved yet (keeps resolved accuracy data intact). */
  async function recordTodayPicks(signals) {
    if (!signals || !signals.length) return null;
    var t = await getTracker();
    var byDate = {};
    signals.forEach(function (s) {
      var d = s.date || "";
      if (!d) return;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push({ symbol: s.symbol, winProbability: s.winProbability, recommendation: s.recommendation || "", close: s.close || null, predictedClose: s.predictedClose || null });
    });
    var dates = Object.keys(byDate);
    for (var i = 0; i < dates.length; i++) {
      var d = dates[i];
      var existing = null, existingIdx = -1;
      for (var j = 0; j < t.days.length; j++) {
        if (t.days[j].date === d) { existing = t.days[j]; existingIdx = j; break; }
      }
      if (existing && existing.resolvedCount > 0) continue;
      var entry = {
        date: d,
        picks: byDate[d],
        hits: existing ? existing.hits : 0,
        misses: existing ? existing.misses : 0,
        resolvedCount: existing ? existing.resolvedCount : 0
      };
      if (existingIdx >= 0) t.days.splice(existingIdx, 1);
      t.days.push(entry);
    }
    t.days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    await saveTracker(t);
    return t;
  }

  /* Mark hit/miss for one symbol using its candles: a pick on bar D is a hit
     when the next bar's close is higher (same convention as the labels). */
  function resolveSymbolInTracker(tracker, symbol, candles) {
    if (!tracker || !candles || !candles.length) return;
    var dateIdx = {};
    for (var i = 0; i < candles.length; i++) {
      var d = String(candles[i].t).slice(0, 10);
      if (!(d in dateIdx)) dateIdx[d] = i;
    }
    for (var j = 0; j < tracker.days.length; j++) {
      var day = tracker.days[j];
      if (day.resolvedCount >= day.picks.length) continue;
      for (var k = 0; k < day.picks.length; k++) {
        var pick = day.picks[k];
        if (pick.resolved || pick.symbol !== symbol) continue;
        var idx = dateIdx[day.date];
        if (idx == null || idx >= candles.length - 1) continue;
        var c1 = candles[idx].c, c2 = candles[idx + 1].c;
        if (!c1 || !c2) continue;
        pick.resolved = true;
        pick.hit = c2 > c1;
        pick.return_1d = round3(((c2 / c1) - 1) * 100);
        pick.actualClose = c2;
        if (pick.hit) day.hits++; else day.misses++;
        day.resolvedCount++;
      }
    }
  }

  /**
   * Collect features per symbol: features at bar t, label = next-bar
   * close-to-close return. Only appends bars newer than the last collected
   * date per symbol, keeping the rolling window to maxDays bars per symbol.
   * Also resolves any pending prediction-tracker picks from loaded candles.
   */
  async function collect(opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};
    if (!window.PatternStore || !window.TechIndicators || !window.OHLCVFetcher) {
      throw new Error("LiveML requires PatternStore, TechIndicators and OHLCVFetcher");
    }

    await window.PatternStore.init();
    var universe = opts.symbols || getUniverse().map(function (s) { return s.t; });
    var maxDays = opts.maxDays || 90;

    var lastDates = {};
    try { lastDates = (await window.PatternStore.getMeta(KEY_LAST_DATES)) || {}; } catch (e) {}
    var isFirstRun = Object.keys(lastDates).length === 0;

    onProgress(0, total, "Reading offline candle store...");
    var offlineMap = await loadOfflineMap();
    var loadMsg = isFirstRun
      ? "First run — loading candles from offline store (live fallback capped at 15s/symbol)..."
      : "Subsequent run — fetching live close prices from Yahoo (offline fallback capped at 15s/symbol)...";
    onProgress(0, total, loadMsg);
    var total = universe.length;
    var processed = 0, skipped = 0, newSamples = 0, liveFetches = 0, offlineHits = 0;
    var fallbackNoted = false, staleNoted = false;

    var tracker = await getTracker();
    var pendingSymbols = {};
    tracker.days.forEach(function (day) {
      if (day.resolvedCount >= day.picks.length) return;
      day.picks.forEach(function (p) { if (!p.resolved) pendingSymbols[p.symbol] = true; });
    });
    var trackerNeedsSave = false;

    for (var i = 0; i < total; i++) {
      var symbol = universe[i];
      try {
        var liveFirst = !isFirstRun;
        var candles = await loadDailyCandles(symbol, offlineMap, liveFirst);
        if (!candles || candles.length < WARMUP + 3) { skipped++; continue; }

        /* First run only: stale-offline refresh — the offline snapshot may
           not have today's bar or may have been downloaded before market
           close. In subsequent runs loadDailyCandles already fetches live
           first, so the data is fresh. */
        var fromOffline = !!offlineLookup(offlineMap, symbol);
        if (isFirstRun && fromOffline) {
          var refreshed = await refreshStaleOffline(symbol, candles, offlineMap);
          if (refreshed !== candles) {
            candles = refreshed;
            liveFetches++;
            if (!staleNoted) {
              staleNoted = true;
              onProgress(processed + 1, total, "Offline snapshot stale — fetching live close prices from Yahoo for affected symbols.");
            }
          }
        }

        if (pendingSymbols[symbol]) {
          resolveSymbolInTracker(tracker, symbol, candles);
          trackerNeedsSave = true;
        }
        if (!liveFirst && fromOffline) offlineHits++;
        if (liveFirst || !fromOffline) {
          liveFetches++;
          if (!fallbackNoted && !liveFirst) {
            fallbackNoted = true;
            onProgress(processed + 1, total, "Note: some symbols not in offline store — fetching live (may take a while).");
          }
        }

        var lastDate = lastDates[symbol] || "";
        var ind = computeIndicators(candles);
        var stored = [];
        for (var t = WARMUP; t < candles.length - 1; t++) {
          var date = String(candles[t].t).slice(0, 10);
          if (date <= lastDate) continue;
          var prevClose = candles[t].c;
          var nextClose = candles[t + 1].c;
          if (!prevClose || !nextClose) continue;
          var ret = (nextClose / prevClose) - 1;
          stored.push({
            symbol: symbol,
            entryDate: date,
            features: featuresAt(t, candles, ind),
            label: { is_winner: ret > 0, return_1d: round3(ret * 100), days: 1, source: "live" }
          });
        }
        /* Merge with the existing rolling corpus: keep prior bars (so the
           window persists across daily collects), append the new bars, and
           cap at maxDays. With an empty lastDate (fresh start) the prior
           bars are dropped and the full window is rebuilt from candles. */
        var existing = [];
        try {
          var all = await window.PatternStore.getAllLiveFeatures();
          existing = all.filter(function (s) { return s.symbol === symbol && (!lastDate || s.entryDate <= lastDate); });
        } catch (e) {}
        var merged = existing.concat(stored).slice(-maxDays);
        if (merged.length > 0) {
          if (merged.length > existing.length) lastDates[symbol] = merged[merged.length - 1].entryDate;
          await window.PatternStore.putLiveFeatures(symbol, merged);
          newSamples += stored.length;
        }
      } catch (e) { skipped++; }
      processed++;
      if (processed % 10 === 0 || processed < 3) {
        await new Promise(function (r) { setTimeout(r, 0); });
        onProgress(processed, total, "Collected " + processed + "/" + total + " symbols (" + newSamples + " new samples, " + offlineHits + " from offline, " + liveFetches + " live)");
      }
    }

    try { await window.PatternStore.setMeta(KEY_LAST_DATES, lastDates); } catch (e) {}
    if (trackerNeedsSave) await saveTracker(tracker);

    var summary = { symbolsScanned: total, symbolsProcessed: processed, skipped: skipped, newSamples: newSamples, liveFetches: liveFetches, offlineHits: offlineHits, collectedAt: Date.now() };
    try {
      var status = await getStatusMeta() || {};
      status.lastCollect = Date.now();
      status.lastCollectSummary = summary;
      await window.PatternStore.setMeta(META_STATUS, status);
    } catch (e) {}

    return summary;
  }

  async function getStatusMeta() {
    if (!window.PatternStore) return null;
    try {
      await window.PatternStore.init();
      return await window.PatternStore.getMeta(META_STATUS);
    } catch (e) { return null; }
  }

  async function loadCorpus() {
    await window.PatternStore.init();
    return await window.PatternStore.getAllLiveFeatures();
  }

  async function corpusStats(samples) {
    var wins = 0;
    samples.forEach(function (s) { if (s.label && s.label.is_winner) wins++; });
    var baseRate = samples.length > 0 ? wins / samples.length : 0;
    var dates = samples.map(function (s) { return s.entryDate || ""; }).filter(Boolean).sort();
    var symbols = {};
    samples.forEach(function (s) { if (s.symbol) symbols[s.symbol] = 1; });
    return {
      count: samples.length,
      symbols: Object.keys(symbols).length,
      baseRate: Math.round(baseRate * 1000) / 10,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null
    };
  }

  /* ── Conditional signs ─────────────────────────────────────────────────── */

  function bucketIndex(value, bins) {
    if (value == null || isNaN(value)) return -1;
    var idx = 0;
    while (idx < bins.length && value >= bins[idx]) idx++;
    return idx;
  }

  /**
   * Bucket statistics: for each feature, win rate / avg return per bucket, plus
   * lift vs the corpus base rate. "Proven signs" = buckets with enough samples
   * and a meaningful lift; also two-feature combo cells.
   */
  function computeConditionalSigns(samples, opts) {
    opts = opts || {};
    var minN = opts.minN || 30;
    var minLift = opts.minLift || 0.03;

    var wins = 0;
    samples.forEach(function (s) { if (s.label && s.label.is_winner) wins++; });
    var baseRate = samples.length > 0 ? wins / samples.length : 0;

    var tables = {};
    var signs = [];

    Object.keys(BUCKETS).forEach(function (key) {
      var def = BUCKETS[key];
      var counts = new Array(def.labels.length).fill(0);
      var w = new Array(def.labels.length).fill(0);
      var rets = new Array(def.labels.length).fill(0);
      samples.forEach(function (s) {
        var idx = bucketIndex(s.features[key], def.bins);
        if (idx < 0) return;
        counts[idx]++;
        if (s.label && s.label.is_winner) w[idx]++;
        if (s.label && s.label.return_1d != null) rets[idx] += s.label.return_1d;
      });
      var rows = [];
      def.labels.forEach(function (lbl, idx) {
        var n = counts[idx];
        if (n === 0) return;
        var upRate = w[idx] / n;
        var avgRet = rets[idx] / n;
        rows.push({
          feature: key,
          bucket: lbl,
          n: n,
          upRate: Math.round(upRate * 1000) / 10,
          avgReturn: round2(avgRet),
          lift: Math.round((upRate - baseRate) * 1000) / 10
        });
        if (n >= minN && (upRate - baseRate) >= minLift) {
          signs.push({
            feature: key,
            bucket: lbl,
            n: n,
            upRate: Math.round(upRate * 1000) / 10,
            avgReturn: round2(avgRet),
            lift: Math.round((upRate - baseRate) * 1000) / 10
          });
        }
      });
      tables[key] = rows;
    });

    var combos = [
      { a: "rsi", b: "volume_ratio", splitA: 60, splitB: 1.3 },
      { a: "rsi", b: "bb_position", splitA: 60, splitB: 0.6 },
      { a: "bb_position", b: "atr_pct", splitA: 0.6, splitB: 2 },
      { a: "volume_ratio", b: "atr_pct", splitA: 1.3, splitB: 2 },
      { a: "entry_score", b: "rsi", splitA: 65, splitB: 55 }
    ];
    var comboRows = [];
    combos.forEach(function (c) {
      var cells = {};
      samples.forEach(function (s) {
        var aHi = s.features[c.a] != null && s.features[c.a] >= c.splitA;
        var bHi = s.features[c.b] != null && s.features[c.b] >= c.splitB;
        var key = (aHi ? "H" : "L") + "/" + (bHi ? "H" : "L");
        if (!cells[key]) cells[key] = { n: 0, w: 0, ret: 0 };
        cells[key].n++;
        if (s.label && s.label.is_winner) cells[key].w++;
        if (s.label && s.label.return_1d != null) cells[key].ret += s.label.return_1d;
      });
      Object.keys(cells).forEach(function (k) {
        var cell = cells[k];
        comboRows.push({
          combo: c.a + " " + (k[0] === "H" ? ">=" : "<") + c.splitA + " & " + c.b + " " + (k[2] === "H" ? ">=" : "<") + c.splitB,
          n: cell.n,
          upRate: Math.round((cell.n > 0 ? cell.w / cell.n : 0) * 1000) / 10,
          avgReturn: round2(cell.n > 0 ? cell.ret / cell.n : 0),
          lift: Math.round(((cell.n > 0 ? cell.w / cell.n : 0) - baseRate) * 1000) / 10
        });
      });
    });

    comboRows.sort(function (x, y) { return y.upRate - x.upRate; });
    signs.sort(function (x, y) { return y.lift - x.lift; });

    return {
      baseRate: Math.round(baseRate * 1000) / 10,
      tables: tables,
      signs: signs.slice(0, 20),
      combos: comboRows.slice(0, 12),
      generatedAt: Date.now()
    };
  }

  /* ── Retrain on the confirmed corpus ───────────────────────────────────── */

  async function retrain(opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};
    if (!window.MLTrainer) throw new Error("MLTrainer module not loaded");
    await window.PatternStore.init();

    var samples = await loadCorpus();
    if (samples.length < 200) {
      throw new Error("Live corpus too small for training: " + samples.length + " samples (need >= 200). Collect live features first.");
    }

    onProgress(0, 1, "Training live model on " + samples.length + " confirmed samples...");

    var originalGetAll = window.PatternStore.getAllFeatures;
    window.PatternStore.getAllFeatures = function () { return Promise.resolve(samples); };
    var result;
    try {
      result = await window.MLTrainer.trainWithWalkForward(Object.assign({}, opts, {
        numFolds: opts.numFolds || (samples.length >= 3000 ? 5 : 3),
        epochsPerFold: opts.epochsPerFold || 20,
        minTrainSamples: Math.min(200, Math.floor(samples.length * 0.6)),
        modelKeys: MODEL_KEYS
      }));
    } finally {
      window.PatternStore.getAllFeatures = originalGetAll;
    }

    var signs = computeConditionalSigns(samples, { minN: opts.minN || 30, minLift: opts.minLift || 0.03 });
    var cstats = await corpusStats(samples);

    var status = await getStatusMeta() || {};
    status.lastRetrain = Date.now();
    status.corpus = cstats;
    status.walkForwardAcc = result.walkForwardAcc;
    status.avgAuc = result.avgAuc;
    status.featureImportance = result.featureImportance || [];
    status.signs = signs;
    status.promotion = result.promotion;
    status.retrainCount = (status.retrainCount || 0) + 1;
    await window.PatternStore.setMeta(META_STATUS, status);

    return Object.assign({}, result, { corpus: cstats, signs: signs });
  }

  /* ── Today's signals (latest bar per symbol) ───────────────────────────── */

  /* ctx (optional): { baseRate, model } cached per-scan by getTodaySignals so
     we don't do 2-3 IndexedDB reads inside every predictToday call. */
  async function predictToday(symbol, offlineMap, diagnostics, ctx) {
    var reject = function (reason) {
      if (diagnostics) diagnostics.rejects[reason] = (diagnostics.rejects[reason] || 0) + 1;
      return null;
    };

    var candles = await loadDailyCandles(symbol, offlineMap, false);
    var fromOffline = !!offlineLookup(offlineMap, symbol);
    if (fromOffline) {
      try {
        var refreshed = await refreshStaleOffline(symbol, candles, offlineMap, true);
        if (refreshed !== candles) candles = refreshed;
      } catch (_e) {}
    }
    if (!candles || candles.length < WARMUP + 2) return reject("no_candles");

    var ind = computeIndicators(candles);
    var i = candles.length - 1;
    var f = featuresAt(i, candles, ind);
    var prevClose = candles[i - 1] ? candles[i - 1].c : null;
    var chgPct = prevClose ? ((candles[i].c / prevClose) - 1) * 100 : null;

    var baseRate = 50;
    if (ctx && ctx.baseRate != null) {
      baseRate = ctx.baseRate;
    } else {
      try {
        var statusMeta = await getStatusMeta();
        if (statusMeta && statusMeta.corpus && statusMeta.corpus.baseRate != null) {
          baseRate = statusMeta.corpus.baseRate;
        }
      } catch (e) {}
    }

    var technicalScore = computeTechnicalScore(f);
    var expectedChgPct = computeExpectedChg(f, baseRate);
    var patternSummary = generatePatternSummary(f, candles, ind);
    var justification = generateJustification(f, candles, ind);

    var winProbability = null;
    var recommendation = null;
    var modelUsed = false;

    if (window.MLTrainer) {
      var model = null;
      if (ctx && ctx.model !== undefined) {
        model = ctx.model;
      } else {
        try {
          if (!model) model = await window.PatternStore.getMeta(MODEL_KEYS.champion);
          if (!model) model = await window.PatternStore.getMeta(MODEL_KEYS.legacy);
        } catch (e) {}
      }
      if (model && model.network && model.network.inputSize === window.MLTrainer.FEATURE_KEYS.length) {
        var pred = window.MLTrainer.predictSync(f, model);
        if (pred) {
          winProbability = pred.winProbability;
          recommendation = pred.recommendation;
          modelUsed = true;
        }
      }
    }

    if (winProbability == null) {
      winProbability = Math.round(Math.max(0.10, Math.min(0.90, technicalScore / 100)) * 1000) / 1000;
      recommendation = technicalScore >= 70 ? "STRONG_BUY" :
                        technicalScore >= 55 ? "BUY" :
                        technicalScore >= 40 ? "WATCHLIST" :
                        technicalScore >= 25 ? "NEUTRAL" : "AVOID";
    }

    if (diagnostics) diagnostics.scored = (diagnostics.scored || 0) + 1;

    var scanTime = Date.now();
    var predictedClose = candles[i].c != null && expectedChgPct != null ? round2(candles[i].c * (1 + expectedChgPct / 100)) : null;

    return {
      symbol: symbol,
      date: String(candles[i].t).slice(0, 10),
      scanTime: scanTime,
      winProbability: winProbability,
      recommendation: recommendation,
      modelUsed: modelUsed,
      features: f,
      close: candles[i].c,
      predictedClose: predictedClose,
      chgPct: chgPct != null ? round2(chgPct) : null,
      technicalScore: technicalScore,
      expectedChgPct: expectedChgPct,
      patternSummary: patternSummary,
      justification: justification
    };
  }

  async function getTodaySignals(opts) {
    opts = opts || {};
    var universe = opts.symbols || getUniverse().map(function (s) { return s.t; });
    var count = opts.count || 20;
    var onProgress = opts.onProgress || function () {};
    var out = [];
    var diagnostics = { rejects: {}, scored: 0 };
    var started = Date.now();
    /* Hard watchdog — the scan can never hang forever, no matter what stalls. */
    var DEADLINE_MS = opts.budgetMs || 180000;

    if (!universe.length) {
      onProgress(0, 0, "Universe is empty (window.NIFTY_200 missing?)");
      return out;
    }

    await ensureStoreInit();

    /* Per-scan caches (previously: 2-3 IndexedDB reads per symbol => ~600
       redundant awaits across a 200-symbol scan). */
    var baseRate = 50;
    try {
      var statusMeta = await getStatusMeta();
      if (statusMeta && statusMeta.corpus && statusMeta.corpus.baseRate != null) baseRate = statusMeta.corpus.baseRate;
    } catch (e) {}
    var championModel = null;
    try {
      championModel = await window.PatternStore.getMeta(MODEL_KEYS.champion);
      if (!championModel) championModel = await window.PatternStore.getMeta(MODEL_KEYS.legacy);
    } catch (e) {}
    var scanCtx = { baseRate: baseRate, model: championModel };

    /* Offline map load is guarded too — an IDB open without onblocked can stall. */
    var offlineMap = null;
    try { offlineMap = await withTimeout(loadOfflineMap(), 15000); } catch (e) {}

    onProgress(0, universe.length, "Scanning " + universe.length + " symbols (budget " + Math.round(DEADLINE_MS / 1000) + "s)...");

    /* Parallel worker pool instead of fully serial fetching:
       6 concurrent symbol pipelines cut a cold scan from ~10 min to ~1-2 min. */
    var CONCURRENCY = Math.max(2, Math.min(8, opts.concurrency || 6));
    var nextIdx = 0, done = 0, lastProgress = 0;

    async function worker() {
      for (;;) {
        if (Date.now() - started > DEADLINE_MS) return;
        var my = nextIdx++;
        if (my >= universe.length) return;
        try {
          var sig = await withTimeout(predictToday(universe[my], offlineMap, diagnostics, scanCtx), 45000);
          if (sig) out.push(sig);
        } catch (e) {}
        done++;
        if (Date.now() - lastProgress > 2000 || done === universe.length) {
          lastProgress = Date.now();
          await yieldTick();
          onProgress(done, universe.length, "Scored " + done + "/" + universe.length + " symbols (" + out.length + " signals, " + Math.round((lastProgress - started) / 1000) + "s)");
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (done < universe.length) {
      onProgress(done, universe.length, "Time budget reached (" + Math.round((Date.now() - started) / 1000) + "s): scored " + done + "/" + universe.length + ", keeping " + out.length + " signals");
    }
    if (opts.onDiagnostics) {
      opts.onDiagnostics(diagnostics);
    }
    out.sort(function (a, b) {
      if (b.winProbability !== a.winProbability) return b.winProbability - a.winProbability;
      if ((b.chgPct || 0) !== (a.chgPct || 0)) return (b.chgPct || 0) - (a.chgPct || 0);
      return a.symbol < b.symbol ? -1 : 1;
    });
    out = out.slice(0, count);
    if (opts.track !== false) {
      try { await recordTodayPicks(out); } catch (e) {}
    }
    return out;
  }

  async function getStatus() {
    var status = await getStatusMeta() || {};
    var championMeta = null;
    try {
      await window.PatternStore.init();
      championMeta = await window.PatternStore.getMeta(MODEL_KEYS.championMeta);
    } catch (e) {}
    if (championMeta) {
      status.champion = {
        trainedAt: championMeta.trainedAt,
        walkForwardAcc: championMeta.walkForwardAcc,
        avgAuc: championMeta.avgAuc,
        featureImportance: championMeta.featureImportance || []
      };
    }
    return status;
  }

  /* ── Step 2: Evening Validation ───────────────────────────────────────── */

  /**
   * Resolve yesterday's picks against actual market data and return a detailed
   * validation report showing predicted vs actual for each pick.
   */
  async function resolveAndValidate(opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};

    if (!window.PatternStore) throw new Error("PatternStore required");
    await window.PatternStore.init();

    var tracker = await getTracker();
    var unresolvedDays = tracker.days.filter(function (d) {
      return d.resolvedCount < d.picks.length;
    });

    if (unresolvedDays.length === 0) {
      return { days: [], summary: { total: 0, resolved: 0, hits: 0, misses: 0, hitRate: null } };
    }

    // Collect unique symbols from unresolved picks
    var symbolSet = {};
    unresolvedDays.forEach(function (day) {
      day.picks.forEach(function (p) {
        if (!p.resolved) symbolSet[p.symbol] = true;
      });
    });
    var symbols = Object.keys(symbolSet);

    onProgress(0, symbols.length, "Loading candles for " + symbols.length + " symbols...");
    var offlineMap = await loadOfflineMap();
    var processed = 0;

    for (var i = 0; i < symbols.length; i++) {
      var symbol = symbols[i];
      try {
        var candles = await loadDailyCandles(symbol, offlineMap, true);
        if (candles && candles.length > 0) {
          resolveSymbolInTracker(tracker, symbol, candles);
        }
      } catch (e) {}
      processed++;
      if (processed % 10 === 0 || processed === symbols.length) {
        await new Promise(function (r) { setTimeout(r, 0); });
        onProgress(processed, symbols.length, "Resolved " + processed + "/" + symbols.length + " symbols");
      }
    }

    await saveTracker(tracker);

    // Build validation report for the most recent unresolved day
    var validationDays = [];
    unresolvedDays.forEach(function (day) {
      var picks = day.picks.map(function (p) {
        var actualChg = p.return_1d != null ? p.return_1d : null;
        var predictedUp = p.winProbability > 0.5;
        var actualUp = p.hit === true;
        var verdict;
        if (predictedUp && actualUp) verdict = "CORRECT_WIN";
        else if (!predictedUp && !actualUp) verdict = "CORRECT_LOSS";
        else if (predictedUp && !actualUp) verdict = "MISSED";
        else verdict = "CAUGHT_FALL";

        var scanPrice = p.close || null;
        var predictedClose = p.predictedClose || null;
        var actualClose = p.actualClose || null;
        var closeError = null;
        if (predictedClose != null && actualClose != null) {
          closeError = round2(((actualClose - predictedClose) / predictedClose) * 100);
        }

        return {
          symbol: p.symbol,
          predictedProb: p.winProbability,
          recommendation: p.recommendation || "",
          scanPrice: scanPrice,
          predictedClose: predictedClose,
          actualClose: actualClose,
          closeError: closeError,
          actualChg: actualChg,
          hit: p.hit,
          resolved: p.resolved,
          verdict: verdict
        };
      });

      var resolved = picks.filter(function (p) { return p.resolved; });
      var hits = resolved.filter(function (p) { return p.hit; });
      var avgReturn = resolved.length > 0
        ? resolved.reduce(function (s, p) { return s + (p.actualChg || 0); }, 0) / resolved.length
        : null;
      var withCloseErr = resolved.filter(function (p) { return p.closeError != null; });
      var avgCloseError = withCloseErr.length > 0
        ? round2(withCloseErr.reduce(function (s, p) { return s + p.closeError; }, 0) / withCloseErr.length)
        : null;

      validationDays.push({
        date: day.date,
        picks: picks,
        total: picks.length,
        resolvedCount: resolved.length,
        hits: hits.length,
        misses: resolved.length - hits.length,
        hitRate: resolved.length > 0 ? Math.round((hits.length / resolved.length) * 1000) / 10 : null,
        avgReturn: avgReturn != null ? round2(avgReturn) : null,
        avgCloseError: avgCloseError
      });
    });

    // Sort by date descending
    validationDays.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    // Overall summary
    var allPicks = [];
    validationDays.forEach(function (d) {
      d.picks.forEach(function (p) { if (p.resolved) allPicks.push(p); });
    });
    var totalHits = allPicks.filter(function (p) { return p.hit; }).length;
    var summary = {
      total: allPicks.length,
      resolved: allPicks.length,
      hits: totalHits,
      misses: allPicks.length - totalHits,
      hitRate: allPicks.length > 0 ? Math.round((totalHits / allPicks.length) * 1000) / 10 : null
    };

    return { days: validationDays, summary: summary };
  }

  /* ── Step 3: Night Learning ──────────────────────────────────────────── */

  /**
   * Retrain the model on confirmed outcomes and compare before/after metrics.
   * Returns an improvement report.
   */
  async function retrainWithLearning(opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};

    // Capture before metrics
    var beforeStatus = await getStatusMeta() || {};
    var beforeAcc = beforeStatus.walkForwardAcc || null;
    var beforeAuc = beforeStatus.avgAuc || null;

    onProgress(0, 1, "Starting nightly retrain...");

    // Run the retrain
    var result = await retrain(opts);

    // Capture after metrics
    var afterStatus = await getStatusMeta() || {};
    var afterAcc = afterStatus.walkForwardAcc || null;
    var afterAuc = afterStatus.avgAuc || null;

    var accDelta = (beforeAcc != null && afterAcc != null) ? round2(afterAcc - beforeAcc) : null;
    var aucDelta = (beforeAuc != null && afterAuc != null) ? round2((afterAuc - beforeAuc) * 100) / 100 : null;

    return {
      before: { walkForwardAcc: beforeAcc, avgAuc: beforeAuc },
      after: { walkForwardAcc: afterAcc, avgAuc: afterAuc },
      improvement: { accDelta: accDelta, aucDelta: aucDelta },
      promotion: result.promotion || null,
      signs: result.signs || null,
      corpus: result.corpus || null,
      readyForTomorrow: true
    };
  }

  return {
    collect: collect,
    retrain: retrain,
    getStatus: getStatus,
    predictToday: predictToday,
    getTodaySignals: getTodaySignals,
    computeConditionalSigns: computeConditionalSigns,
    getTracker: getTracker,
    recordTodayPicks: recordTodayPicks,
    resolveAndValidate: resolveAndValidate,
    retrainWithLearning: retrainWithLearning,
    saveMorningScan: saveMorningScan,
    loadMorningScan: loadMorningScan,
    saveLiveLog: saveLiveLog,
    loadLiveLog: loadLiveLog,
    BUCKETS: BUCKETS
  };
})();
