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
        var r = await withTimeout(window.OHLCVFetcher.fetchOHLCVCached(symbol + ".NS", "daily"), 15000);
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
        var r2 = await withTimeout(window.OHLCVFetcher.fetchOHLCVCached(symbol + ".NS", "daily"), 15000);
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
  async function refreshStaleOffline(symbol, candles, offlineMap) {
    if (!window.OHLCVFetcher || !window.OHLCVFetcher.fetchOHLCVCached) return candles;
    var rec = offlineLookup(offlineMap, symbol);
    if (!rec) return candles;
    var recDaily = (rec.daily || rec.data) || null;
    var offLast = lastBarDate(recDaily);
    var today = istToday();
    /* Refresh when: (a) snapshot doesn't have today's bar at all, or
       (b) snapshot has today's bar but was downloaded before market close
       (3:30 PM IST) — the close price may be stale. */
    var needsRefresh = false;
    if (!offLast || offLast < today) {
      needsRefresh = true;
    } else if (offLast === today && rec.downloadedAt != null) {
      needsRefresh = rec.downloadedAt < marketCloseIST();
    }
    if (!needsRefresh) return candles;
    var liveRes = await withTimeout(window.OHLCVFetcher.fetchOHLCVCached(symbol, "daily"), 15000);
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
      byDate[d].push({ symbol: s.symbol, winProbability: s.winProbability, recommendation: s.recommendation || "" });
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

  async function predictToday(symbol, offlineMap) {
    if (!window.MLTrainer) return null;
    var model = null;
    try {
      await window.PatternStore.init();
      model = await window.PatternStore.getMeta(MODEL_KEYS.champion);
    } catch (e) {}
    if (!model || !model.network || model.network.inputSize !== window.MLTrainer.FEATURE_KEYS.length) return null;

    var candles = await loadDailyCandles(symbol, offlineMap, false);
    /* Refresh only if offline snapshot is stale (downloaded before market close). */
    var fromOffline = !!offlineLookup(offlineMap, symbol);
    if (fromOffline) {
      var refreshed = await refreshStaleOffline(symbol, candles, offlineMap);
      if (refreshed !== candles) candles = refreshed;
    }
    if (!candles || candles.length < WARMUP + 2) return null;

    var ind = computeIndicators(candles);
    var i = candles.length - 1;
    var f = featuresAt(i, candles, ind);
    var pred = window.MLTrainer.predictSync(f, model);
    if (!pred) return null;
    var prevClose = candles[i - 1] ? candles[i - 1].c : null;
    var chgPct = prevClose ? ((candles[i].c / prevClose) - 1) * 100 : null;
    return {
      symbol: symbol,
      date: String(candles[i].t).slice(0, 10),
      winProbability: pred.winProbability,
      recommendation: pred.recommendation,
      features: f,
      close: candles[i].c,
      chgPct: chgPct != null ? round2(chgPct) : null
    };
  }

  async function getTodaySignals(opts) {
    opts = opts || {};
    var universe = opts.symbols || getUniverse().map(function (s) { return s.t; });
    var count = opts.count || 20;
    var onProgress = opts.onProgress || function () {};
    var offlineMap = await loadOfflineMap();
    var out = [];
    var started = Date.now();
    for (var i = 0; i < universe.length; i++) {
      var symbol = universe[i];
      /* Score the WHOLE universe so the top-N is a true market-wide ranking.
         If live fallback is burning time, degrade to offline-only symbols. */
      if (!offlineLookup(offlineMap, symbol) && Date.now() - started > 120000) continue;
      try {
        var sig = await predictToday(symbol, offlineMap);
        if (sig) out.push(sig);
      } catch (e) {}
      if (i % 25 === 0 || i === universe.length - 1) {
        await new Promise(function (r) { setTimeout(r, 0); });
        onProgress(i + 1, universe.length, "Scored " + (i + 1) + "/" + universe.length + " symbols (" + out.length + " signals)");
      }
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

  return {
    collect: collect,
    retrain: retrain,
    getStatus: getStatus,
    predictToday: predictToday,
    getTodaySignals: getTodaySignals,
    computeConditionalSigns: computeConditionalSigns,
    getTracker: getTracker,
    recordTodayPicks: recordTodayPicks,
    BUCKETS: BUCKETS
  };
})();
