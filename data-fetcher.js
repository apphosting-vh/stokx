/* ══════════════════════════════════════════════════════════════════════════
   OHLCV Data Fetcher — Alpha Vantage (primary) + Yahoo Finance (intraday/fallback)
   No OAuth tokens required. Alpha Vantage needs a free API key.
   Yahoo Finance is already integrated via CORS proxies (no key needed).
   ══════════════════════════════════════════════════════════════════════════ */
window.OHLCVFetcher = (function () {

  /* ── CORS Proxies (same order as existing app) ─────────────────────────── */
  var AV_PROXY_FNS = [
    function (u) { return "https://api.cors.lol/?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?" + encodeURIComponent(u); },
    function (u) { return "https://cors.eu.org/" + u; },
    function (u) { return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u); },
  ];

  var Y_PROXY_FNS = [
    function (u) { return "https://api.cors.lol/?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?" + encodeURIComponent(u); },
    function (u) { return "https://cors.eu.org/" + u; },
    function (u) { return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u); },
  ];

  var Y_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

  /* ── Fetch with timeout ────────────────────────────────────────────────── */
  function fetchWithTimeout(url, opts, ms) {
    ms = ms || 10000;
    var ctrl = new AbortController();
    var tid = setTimeout(function () { ctrl.abort(); }, ms);
    var isExt = typeof location !== "undefined" && url.startsWith("http") && !url.startsWith(location.origin);
    var baseOpts = isExt ? { credentials: "omit" } : {};
    return fetch(url, Object.assign({}, baseOpts, opts || {}, { signal: ctrl.signal, cache: "no-store" }))
      .finally(function () { clearTimeout(tid); });
  }

  function readBody(r, ms) {
    ms = ms || 8000;
    return Promise.race([
      r.text(),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error("body timeout")); }, ms); }),
    ]);
  }

  /* ── Get stored Alpha Vantage API key ──────────────────────────────────── */
  var _cachedAVKey = null;
  async function getAVKey() {
    if (_cachedAVKey !== null) return _cachedAVKey;
    try {
      if (typeof dbGetSetting === "function") {
        _cachedAVKey = (await dbGetSetting("mm_av_api_key")) || "";
      } else {
        _cachedAVKey = "";
      }
    } catch (e) { _cachedAVKey = ""; }
    return _cachedAVKey;
  }
  async function setAVKey(key) {
    _cachedAVKey = key || "";
    try {
      if (typeof dbSetSetting === "function") {
        await dbSetSetting("mm_av_api_key", key || "");
      }
    } catch (e) { }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Alpha Vantage — Daily OHLCV
     Endpoint: https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=RELIANCE.BSE&outputsize=compact&apikey=demo
     
     Response format:
     {
       "Time Series (Daily)": {
         "2024-01-15": {
           "1. open": "2450.00",
           "2. high": "2480.00",
           "3. low": "2440.00",
           "4. close": "2475.00",
           "5. volume": "12345678"
         }
       }
     }
     
     Indian stocks: use .BSE suffix (RELIANCE.BSE)
     Free tier: 25 requests/day, compact = 100 data points
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchFromAlphaVantage(ticker) {
    var apiKey = await getAVKey();
    if (!apiKey) return null;

    var symbol = ticker.toUpperCase() + ".BSE";
    var url = "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY"
      + "&symbol=" + encodeURIComponent(symbol)
      + "&outputsize=compact"
      + "&apikey=" + encodeURIComponent(apiKey);

    for (var i = 0; i < AV_PROXY_FNS.length; i++) {
      try {
        var proxyUrl = AV_PROXY_FNS[i](url);
        var r = await fetchWithTimeout(proxyUrl, {}, 12000);
        if (!r.ok) continue;
        var txt = await readBody(r, 10000);
        var json;
        try { json = JSON.parse(txt); } catch (e) { continue; }
        // Handle proxy-wrapped responses
        if (json && typeof json.contents === "string") {
          try { json = JSON.parse(json.contents); } catch (e) { }
        }

        var ts = json && json["Time Series (Daily)"];
        if (!ts || typeof ts !== "object") {
          // Check for error messages (rate limit, invalid key, etc.)
          if (json && json["Error Message"]) return null;
          if (json && json["Note"]) return null; // rate limit
          continue;
        }

        var candles = [];
        var dates = Object.keys(ts).sort(); // ascending date order
        for (var d = 0; d < dates.length; d++) {
          var entry = ts[dates[d]];
          var o = parseFloat(entry["1. open"]);
          var h = parseFloat(entry["2. high"]);
          var l = parseFloat(entry["3. low"]);
          var c = parseFloat(entry["4. close"]);
          var v = parseInt(entry["5. volume"], 10);
          if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;
          candles.push({ t: dates[d], o: o, h: h, l: l, c: c, v: isNaN(v) ? 0 : v });
        }
        if (candles.length >= 20) return candles;
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Yahoo Finance — Intraday OHLCV
     Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
     Params: interval={interval}&range={range}
     
     Supported intervals: 1m, 5m, 15m, 30m, 1h, 1d
     Supported ranges: 1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max
     
     Response: timestamps[], indicators.quote[0].{open,high,low,close,volume}
     Indian stocks: {ticker}.NS (NSE) or {ticker}.BO (BSE)
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchFromYahooIntraday(ticker, interval, range) {
    interval = interval || "5m";
    range = range || "1mo";

    var symbols = [ticker.toUpperCase() + ".NS", ticker.toUpperCase() + ".BO", ticker.toUpperCase()];

    for (var s = 0; s < symbols.length; s++) {
      for (var h = 0; h < Y_HOSTS.length; h++) {
        for (var p = 0; p < Y_PROXY_FNS.length; p++) {
          try {
            var yUrl = "https://" + Y_HOSTS[h] + "/v8/finance/chart/"
              + encodeURIComponent(symbols[s])
              + "?interval=" + interval + "&range=" + range;
            var proxyUrl = Y_PROXY_FNS[p](yUrl);
            var r = await fetchWithTimeout(proxyUrl, {}, 10000);
            if (!r.ok) continue;
            var txt = await readBody(r, 8000);
            var json;
            try { json = JSON.parse(txt); } catch (e) { continue; }
            var payload = json && json.contents ? (function () { try { return JSON.parse(json.contents); } catch (e) { return json; } })() : json;
            var result = payload && payload.chart && payload.chart.result && payload.chart.result[0];
            if (!result) continue;

            var timestamps = result.timestamp || [];
            var quotes = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
            var oArr = quotes.open || [];
            var hArr = quotes.high || [];
            var lArr = quotes.low || [];
            var cArr = quotes.close || [];
            var vArr = quotes.volume || [];

            if (timestamps.length < 2) continue;

            var candles = [];
            for (var i = 0; i < timestamps.length; i++) {
              var o = oArr[i], h = hArr[i], l = lArr[i], c = cArr[i], v = vArr[i];
              if (c == null || isNaN(c) || c <= 0) continue;
              // Convert UNIX timestamp to IST date string
              var istMs = timestamps[i] * 1000 + (5.5 * 60 * 60 * 1000);
              var istDate = new Date(istMs).toISOString().split("T")[0];
              var istTime = new Date(istMs).toISOString().split("T")[1].substring(0, 5);
              candles.push({
                t: istDate + " " + istTime,
                o: Math.round((o || c) * 100) / 100,
                h: Math.round((h || c) * 100) / 100,
                l: Math.round((l || c) * 100) / 100,
                c: Math.round(c * 100) / 100,
                v: v || 0
              });
            }
            if (candles.length >= 20) return candles;
          } catch (e) {
            continue;
          }
        }
      }
    }
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Yahoo Finance — Daily OHLCV (fallback when Alpha Vantage fails)
     Uses the same v8 chart endpoint with interval=1d
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchFromYahooDaily(ticker, range) {
    range = range || "2y";
    return fetchFromYahooIntraday(ticker, "1d", range);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Unified entry point
     
     timeframe: "daily" | "1m" | "5m" | "15m" | "30m" | "1h"
     
     Strategy:
       - Daily: Alpha Vantage (primary) → Yahoo Finance (fallback)
       - Intraday: Yahoo Finance (primary — AV free tier doesn't support Indian intraday)
     
     Returns: Array of { t, o, h, l, c, v } sorted ascending by time
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchOHLCV(ticker, timeframe) {
    timeframe = timeframe || "daily";
    ticker = (ticker || "").trim().toUpperCase();
    if (!ticker) return null;

    if (timeframe === "daily") {
      // Try Alpha Vantage first
      var avData = await fetchFromAlphaVantage(ticker);
      if (avData && avData.length >= 20) return { candles: avData, source: "Alpha Vantage" };
      // Fallback to Yahoo Finance daily
      var yfDaily = await fetchFromYahooDaily(ticker, "2y");
      return { candles: yfDaily, source: "Yahoo Finance" };
    }

    // Intraday: use Yahoo Finance directly
    var yfInterval, yfRange;
    switch (timeframe) {
      case "1m": yfInterval = "1m"; yfRange = "1d"; break;
      case "5m": yfInterval = "5m"; yfRange = "5d"; break;
      case "15m": yfInterval = "15m"; yfRange = "1mo"; break;
      case "30m": yfInterval = "30m"; yfRange = "1mo"; break;
      case "1h": yfInterval = "1h"; yfRange = "3mo"; break;
      case "2h": yfInterval = "2h"; yfRange = "3mo"; break;
      case "weekly": yfInterval = "1wk"; yfRange = "5y"; break;
      default: yfInterval = "5m"; yfRange = "1mo"; break;
    }
    var yfIntra = await fetchFromYahooIntraday(ticker, yfInterval, yfRange);
    return { candles: yfIntra, source: "Yahoo Finance" };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Simple cache to avoid re-fetching same data within 5 minutes
     ═══════════════════════════════════════════════════════════════════════ */
  var _cache = {};
  var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async function fetchOHLCVCached(ticker, timeframe) {
    var key = ticker.toUpperCase() + "|" + (timeframe || "daily");
    var entry = _cache[key];
    if (entry && (Date.now() - entry.ts) < CACHE_TTL) {
      return entry;
    }
    var result = await fetchOHLCV(ticker, timeframe);
    if (result && result.candles) {
      _cache[key] = { data: result.candles, source: result.source, ts: Date.now() };
      return _cache[key];
    }
    return { data: null, source: null, ts: 0 };
  }

  function clearCache() {
    _cache = {};
  }

  return {
    fetchOHLCV: fetchOHLCV,
    fetchOHLCVCached: fetchOHLCVCached,
    fetchFromAlphaVantage: fetchFromAlphaVantage,
    fetchFromYahooIntraday: fetchFromYahooIntraday,
    fetchFromYahooDaily: fetchFromYahooDaily,
    clearCache: clearCache,
    getAVKey: getAVKey,
    setAVKey: setAVKey
  };
})();
