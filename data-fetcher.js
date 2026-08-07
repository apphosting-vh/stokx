/* ══════════════════════════════════════════════════════════════════════════
   OHLCV Data Fetcher — Yahoo Finance only (no API key required)
   Uses CORS proxies for browser compatibility.
   ══════════════════════════════════════════════════════════════════════════ */
window.OHLCVFetcher = (function () {

  /* ── CORS Proxies ─────────────────────────────────────────────────────── */
  var Y_PROXY_FNS = [
    function (u) { return "https://api.cors.lol/?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?" + encodeURIComponent(u); },
    function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
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
    var timer;
    return Promise.race([
      r.text(),
      new Promise(function (_, rej) { timer = setTimeout(function () { rej(new Error("body timeout")); }, ms); }),
    ]).finally(function () { clearTimeout(timer); });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Yahoo Finance — OHLCV
     Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
     Params: interval={interval}&range={range}
     
     Supported intervals: 1m, 5m, 15m, 30m, 1h, 1d, 1wk
     
     Response: timestamps[], indicators.quote[0].{open,high,low,close,volume}
     Indian stocks: {ticker}.NS (NSE) or {ticker}.BO (BSE)
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchFromYahooIntraday(ticker, interval, range) {
    interval = interval || "5m";
    range = range || "1mo";

    var symbols = [ticker.toUpperCase() + ".NS", ticker.toUpperCase() + ".BO", ticker.toUpperCase()];

    var startTime = Date.now();
    var TOTAL_TIMEOUT = 25000;

    for (var s = 0; s < symbols.length; s++) {
      for (var h = 0; h < Y_HOSTS.length; h++) {
        for (var p = 0; p < Y_PROXY_FNS.length; p++) {
          if (Date.now() - startTime > TOTAL_TIMEOUT) return null;
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
     Yahoo Finance — Daily OHLCV
     Uses the same v8 chart endpoint with interval=1d
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchFromYahooDaily(ticker, range) {
    range = range || "2y";
    return fetchFromYahooIntraday(ticker, "1d", range);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Yahoo Finance — Real-time Quote
     Endpoint: https://query1.finance.yahoo.com/v6/finance/quote?symbols={symbol}
     Returns { price, change, changePercent } or null
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchQuote(ticker) {
    var cleanTicker = (ticker || "").trim().toUpperCase().replace(/\.(NS|BO)$/i, "");
    var symbols = [cleanTicker + ".NS", cleanTicker + ".BO", cleanTicker];
    for (var s = 0; s < symbols.length; s++) {
      for (var h = 0; h < Y_HOSTS.length; h++) {
        for (var p = 0; p < Y_PROXY_FNS.length; p++) {
          try {
            var yUrl = "https://" + Y_HOSTS[h] + "/v6/finance/quote?symbols=" + encodeURIComponent(symbols[s]);
            var proxyUrl = Y_PROXY_FNS[p](yUrl);
            var r = await fetchWithTimeout(proxyUrl, {}, 10000);
            if (!r.ok) continue;
            var txt = await readBody(r, 8000);
            var json;
            try { json = JSON.parse(txt); } catch (e) { continue; }
            var payload = json && json.contents ? (function () { try { return JSON.parse(json.contents); } catch (e) { return json; } })() : json;
            var result = payload && payload.quoteResponse && payload.quoteResponse.result && payload.quoteResponse.result[0];
            if (!result || result.regularMarketPrice == null) continue;
            return {
              price: result.regularMarketPrice,
              change: result.regularMarketChange != null ? result.regularMarketChange : null,
              changePercent: result.regularMarketChangePercent != null ? result.regularMarketChangePercent : null,
              dayHigh: result.regularMarketDayHigh != null ? result.regularMarketDayHigh : null,
              dayLow: result.regularMarketDayLow != null ? result.regularMarketDayLow : null,
              high52: result.fiftyTwoWeekHigh != null ? result.fiftyTwoWeekHigh : null,
              low52: result.fiftyTwoWeekLow != null ? result.fiftyTwoWeekLow : null,
              marketCap: result.marketCap != null ? result.marketCap : null,
              pe: result.trailingPE != null ? result.trailingPE : null,
              volume: result.regularMarketVolume != null ? result.regularMarketVolume : null,
              avgVolume: result.averageDailyVolume10Day != null ? result.averageDailyVolume10Day : (result.averageVolume != null ? result.averageVolume : null)
            };
          } catch (e) {
            continue;
          }
        }
      }
    }
    return null;
  }

  var _quoteCache = {};
  var QUOTE_CACHE_TTL_ACTIVE = 15 * 1000; // 15 seconds during market hours
  var QUOTE_CACHE_TTL_CLOSED = 24 * 60 * 60 * 1000; // 24 hours after close

  async function fetchQuoteCached(ticker) {
    if (!ticker) return null;
    var key = String(ticker).trim().toUpperCase();
    var entry = _quoteCache[key];
    if (entry && (Date.now() - entry.ts) < (_isMarketOpen() ? QUOTE_CACHE_TTL_ACTIVE : QUOTE_CACHE_TTL_CLOSED)) {
      return entry.data;
    }
    var result = await Promise.race([
      fetchQuote(ticker).catch(function() { return null; }),
      new Promise(function(r) { setTimeout(function() { r(null); }, 6000); })
    ]);
    if (result && result.price != null) {
      _quoteCache[key] = { data: result, ts: Date.now() };
      return result;
    }
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Unified entry point
     
     timeframe: "daily" | "1m" | "5m" | "15m" | "30m" | "1h" | "weekly"
     
     All timeframes use Yahoo Finance.
     
     Returns: Array of { t, o, h, l, c, v } sorted ascending by time
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchOHLCV(ticker, timeframe) {
    timeframe = timeframe || "daily";
    ticker = (ticker || "").trim().toUpperCase();
    if (!ticker) return null;

    /* Strip .NS / .BO suffix if present — fetchFromYahooIntraday re-appends them */
    var cleanTicker = ticker.replace(/\.(NS|BO)$/i, "");

    var yfInterval, yfRange;
    switch (timeframe) {
      case "daily": yfInterval = "1d"; yfRange = "2y"; break;
      case "1m": yfInterval = "1m"; yfRange = "1d"; break;
      case "5m": yfInterval = "5m"; yfRange = "5d"; break;
      case "15m": yfInterval = "15m"; yfRange = "1mo"; break;
      case "30m": yfInterval = "30m"; yfRange = "1mo"; break;
      case "1h": yfInterval = "1h"; yfRange = "2y"; break;
      case "2h": yfInterval = "2h"; yfRange = "3mo"; break;
      case "weekly": yfInterval = "1wk"; yfRange = "5y"; break;
      default: yfInterval = "5m"; yfRange = "1mo"; break;
    }
    var yfData = await fetchFromYahooIntraday(cleanTicker, yfInterval, yfRange);
    return { candles: yfData, source: "Yahoo Finance" };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Simple cache to avoid re-fetching same data
     During market hours: 5-minute TTL (data changes live)
     After market hours: 24-hour TTL (data is frozen, scores stay stable)
     ═══════════════════════════════════════════════════════════════════════ */
  var _cache = {};
  var CACHE_TTL_ACTIVE = 5 * 60 * 1000;   // 5 minutes during market hours
  var CACHE_TTL_CLOSED = 24 * 60 * 60 * 1000; // 24 hours after market close

  function _isMarketOpen() {
    var now = new Date();
    var ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    var day = ist.getUTCDay();
    if (day === 0 || day === 6) return false;
    var h = ist.getUTCHours(), m = ist.getUTCMinutes();
    var mins = h * 60 + m;
    return mins >= 555 && mins <= 930; // 9:15 to 15:30 IST
  }

  function _cacheTTL() {
    return _isMarketOpen() ? CACHE_TTL_ACTIVE : CACHE_TTL_CLOSED;
  }

  async function fetchOHLCVCached(ticker, timeframe) {
    if (!ticker) return { data: null, source: null, ts: Date.now() };
    var key = String(ticker).trim().toUpperCase() + "|" + (timeframe || "daily");
    var entry = _cache[key];
    if (entry && (Date.now() - entry.ts) < _cacheTTL()) {
      return entry;
    }
    var result = await fetchOHLCV(ticker, timeframe);
    if (result && result.candles) {
      _cache[key] = { data: result.candles, source: result.source, ts: Date.now() };
      return _cache[key];
    }
    return { data: null, source: null, ts: Date.now() };
  }

  function clearCache() {
    _cache = {};
    _quoteCache = {};
  }

  return {
    fetchOHLCV: fetchOHLCV,
    fetchOHLCVCached: fetchOHLCVCached,
    fetchQuote: fetchQuote,
    fetchQuoteCached: fetchQuoteCached,
    fetchFromYahooIntraday: fetchFromYahooIntraday,
    fetchFromYahooDaily: fetchFromYahooDaily,
    clearCache: clearCache,
  };
})();
