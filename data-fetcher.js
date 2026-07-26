/* ══════════════════════════════════════════════════════════════════════════
   OHLCV Data Fetcher — Yahoo Finance (all timeframes via CORS proxies)
   Sequential worker cascade for self-hosted proxy, wave racing for public.
   ══════════════════════════════════════════════════════════════════════════ */
window.OHLCVFetcher = (function () {

  /* ── CORS Proxies ──────────────────────────────────────────────────────── */
  var Y_PROXY_FNS = [
    function (u) { return "https://api.cors.lol/?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?" + encodeURIComponent(u); },
    function (u) { return "https://cors.eu.org/" + u; },
    function (u) { return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u); },
  ];
  var Y_PROXY_KEYS = ["cors.lol", "corsproxy.io", "cors.eu.org", "codetabs"];
  var Y_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

  /* ── Y_HOSTS ──────────────────────────────────────────────────────── */

  /* ── Proxy health tracking ────────────────────────────────────────────── */
  var _proxyHealth = {};
  function _proxyKey(proxyIdx) { return proxyIdx === -1 ? "worker" : (Y_PROXY_KEYS[proxyIdx] || "p" + proxyIdx); }
  function _isProxyCool(idx) {
    var h = _proxyHealth[_proxyKey(idx)];
    return h && h.cooldownUntil && Date.now() < h.cooldownUntil;
  }
  function _markProxyCool(idx, isHardLimit) {
    var key = _proxyKey(idx);
    _proxyHealth[key] = _proxyHealth[key] || {};
    var fails = (_proxyHealth[key].fails || 0) + 1;
    /* idx === -1 means worker-self: shorter cooldown so one 429 doesn't
       block the entire batch for minutes.  Public proxies keep longer backs. */
    var base = idx === -1 ? 3000 : (isHardLimit ? 10000 : 5000);
    var cooldown = Math.min(base * Math.pow(1.5, Math.min(fails, 4)), idx === -1 ? 10000 : 60000);
    _proxyHealth[key].cooldownUntil = Date.now() + cooldown;
    _proxyHealth[key].fails = fails;
  }
  function _markProxyOk(idx) {
    _proxyHealth[_proxyKey(idx)] = _proxyHealth[_proxyKey(idx)] || {};
    _proxyHealth[_proxyKey(idx)].cooldownUntil = 0;
    _proxyHealth[_proxyKey(idx)].lastOk = Date.now();
    _proxyHealth[_proxyKey(idx)].fails = 0;
  }
  function _clearProxyCooldowns() {
    _proxyHealth = {};
    _proxyBucket = {};
  }

  /* ── Get proxy order: rotate starting point, skip cooldown ones ─────────
     Previously this always put the single "most recently successful" proxy
     first — fine for one caller, but with several stocks scanning at once
     every concurrent fetch piled onto that same proxy and blew through its
     rate-limit budget in under a second while the other 3 proxies sat idle.
     Rotating the starting point spreads concurrent load evenly instead. ── */
  var _proxyRotationCounter = 0;
  function _getProxyOrder() {
    var healthy = [];
    for (var i = 0; i < Y_PROXY_FNS.length; i++) {
      if (_isProxyCool(i)) continue;
      healthy.push(i);
    }
    if (healthy.length === 0) {
      for (var j = 0; j < Y_PROXY_FNS.length; j++) healthy.push(j);
    }
    var start = _proxyRotationCounter % healthy.length;
    _proxyRotationCounter++;
    return healthy.slice(start).concat(healthy.slice(0, start));
  }

  /* ── Global concurrency cap (bounds TOTAL in-flight proxy requests app-wide) ──
     Tilted upward from 8 → 12 because each stock now takes fewer network
     legs (sequential worker cascade resolves in 1-2 requests instead of
     firing a multi-proxy wave), so the same global cap lets more stocks
     scan concurrently without overwhelming the proxy pool. ── */
  /* 6 stocks scan at a time × 3 TFs each = 18 concurrent fetches.
     Must be ≥ POOL_SIZE × timeframes so nothing queues behind the gate. */
  var MAX_GLOBAL_CONCURRENT = 18;
  var _globalActive = 0;
  var _globalQueue = [];
  function _acquireGlobalSlot() {
    return new Promise(function (resolve) {
      if (_globalActive < MAX_GLOBAL_CONCURRENT) { _globalActive++; resolve(); }
      else _globalQueue.push(resolve);
    });
  }
  function _releaseGlobalSlot() {
    _globalActive--;
    if (_globalQueue.length > 0) {
      _globalActive++;
      var next = _globalQueue.shift();
      next();
    }
  }

  /* ── Per-proxy token bucket ────────────────────────────────────────────── */
  var PROXY_WINDOW_MS = 10000;
  var PROXY_MAX_PER_WINDOW = 25; // ~2.5 req/s sustained per public proxy — was 6, far too low
  var WORKER_MAX_PER_WINDOW = 120; // self-hosted: 100k req/day ÷ 10s window ≈ 115; keep headroom
  var _proxyBucket = {};
  function _maxForKey(key) { return key === "worker" ? WORKER_MAX_PER_WINDOW : PROXY_MAX_PER_WINDOW; }
  function _proxyHasRoom(idx) {
    var key = _proxyKey(idx);
    var now = Date.now();
    var arr = (_proxyBucket[key] || []).filter(function (t) { return now - t < PROXY_WINDOW_MS; });
    _proxyBucket[key] = arr;
    return arr.length < _maxForKey(key);
  }
  function _proxyRecordFire(idx) {
    var key = _proxyKey(idx);
    var arr = _proxyBucket[key] || [];
    arr.push(Date.now());
    _proxyBucket[key] = arr;
  }

  /* ── Fetch with timeout ────────────────────────────────────────────────── */
  function fetchWithTimeout(url, opts, ms) {
    ms = ms || 8000;
    var ctrl = new AbortController();
    var tid = setTimeout(function () { ctrl.abort(); }, ms);
    var isExt = typeof location !== "undefined" && url.startsWith("http") && !url.startsWith(location.origin);
    var baseOpts = isExt ? { credentials: "omit" } : {};
    return fetch(url, Object.assign({}, baseOpts, opts || {}, { signal: ctrl.signal, cache: "no-store" }))
      .finally(function () { clearTimeout(tid); });
  }

  function readBody(r, ms) {
    ms = ms || 5000;
    return Promise.race([
      r.text(),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error("body timeout")); }, ms); }),
    ]);
  }

  /* ── Get/set a self-hosted proxy Worker URL ──────────────────────────────
     Public CORS proxies (cors.lol, corsproxy.io, etc.) share their rate
     limit across every anonymous user in the world, not just this app — no
     amount of client-side throttling here can fix that. A free Cloudflare
     Worker deployed on the user's own account has its own 100k req/day
     quota with no shared contention. When set, this becomes the primary
     path; public proxies remain as a fallback if it's not configured or is
     briefly unreachable. ── */
  var _cachedWorkerUrl = null;
  async function getWorkerProxyUrl() {
    if (_cachedWorkerUrl !== null) return _cachedWorkerUrl;
    try {
      if (typeof dbGetSetting === "function") {
        _cachedWorkerUrl = (await dbGetSetting("mm_proxy_worker_url")) || "";
      } else {
        _cachedWorkerUrl = "";
      }
    } catch (e) { _cachedWorkerUrl = ""; }
    return _cachedWorkerUrl;
  }
  async function setWorkerProxyUrl(url) {
    _cachedWorkerUrl = (url || "").trim().replace(/\/+$/, "");
    try {
      if (typeof dbSetSetting === "function") {
        await dbSetSetting("mm_proxy_worker_url", _cachedWorkerUrl);
      }
    } catch (e) { }
  }
  function _workerProxyFn(base) {
    return function (u) { return base + "/?url=" + encodeURIComponent(u); };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Single fetch attempt — acquire a global slot + proxy token, fire the
     request, parse OHLCV, release.  Used by both the sequential worker
     cascade and the public-proxy wave fallback.
     ═══════════════════════════════════════════════════════════════════════ */
  /* One attempt: acquire a global slot + proxy token, fetch, parse, release. */
  function _tryOneAttempt(att, interval, range) {
    return _acquireGlobalSlot().then(function () {
      _proxyRecordFire(att.pIdx);
      var yUrl = "https://" + att.host + "/v8/finance/chart/"
        + encodeURIComponent(att.symbol)
        + "?interval=" + interval + "&range=" + range;
      var proxyUrl = att.pIdx === -1 ? att.proxyFn(yUrl) : Y_PROXY_FNS[att.pIdx](yUrl);

      return fetchWithTimeout(proxyUrl, {}, 2200)
        .then(function (r) {
          if (!r.ok) {
            var hard = r.status === 429 || r.status === 403;
            _markProxyCool(att.pIdx, hard);
            return null;
          }
          return readBody(r, 1800);
        })
        .then(function (txt) {
          if (!txt) return null;
          var json;
          try { json = JSON.parse(txt); } catch (e) { return null; }
          var payload = json && json.contents ? (function () { try { return JSON.parse(json.contents); } catch (e) { return json; } })() : json;
          var result = payload && payload.chart && payload.chart.result && payload.chart.result[0];
          if (!result) return null;

          var timestamps = result.timestamp || [];
          var quotes = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
          var oArr = quotes.open || [];
          var hArr = quotes.high || [];
          var lArr = quotes.low || [];
          var cArr = quotes.close || [];
          var vArr = quotes.volume || [];
          if (timestamps.length < 2) return null;

          var candles = [];
          for (var ci = 0; ci < timestamps.length; ci++) {
            var o = oArr[ci], h = hArr[ci], l = lArr[ci], c = cArr[ci], v = vArr[ci];
            if (c == null || isNaN(c) || c <= 0) continue;
            var istMs = timestamps[ci] * 1000 + (5.5 * 60 * 60 * 1000);
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
          if (candles.length >= 5) { _markProxyOk(att.pIdx); return candles; }
          return null;
        })
        .catch(function () { _markProxyCool(att.pIdx); return null; })
        .then(function (val) { _releaseGlobalSlot(); return val; });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     FETCH STRATEGY — sequential worker cascade + wave public fallback

     When a self-hosted Worker proxy is configured it becomes the sole
     primary path.  Attempts are tried ONE AT A TIME through the Worker
     (no parallel racing) because our own Worker doesn't need race-to-
     beat rate limits — firing duplicate simultaneous requests just
     wastes its dedicated quota.  Budget / cooldown checks are enforced
     before each attempt so a struggling Worker isn't hammered by all
     concurrent stocks at once.

     If every Worker attempt fails or no Worker is configured, we fall
     back to public CORS proxies using a small wave-based race (unchanged
     logic, just narrower scope since the common case now resolves in
     the Worker cascade).
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchFromYahooRaced(ticker, interval, range, overallMs) {
    interval = interval || "5m";
    range = range || "1mo";
    overallMs = overallMs || 3000;

    var symbols = [ticker.toUpperCase() + ".NS", ticker.toUpperCase() + ".BO", ticker.toUpperCase()];
    var deadline = Date.now() + overallMs;

    /* ── Worker sequential cascade ────────────────────────────────────────
       Each attempt goes: acquire slot → budget check → fetch → release.
       On success return immediately. On failure, sleep a tiny inter-attempt
       gap (only when the Worker isn't in hard cooldown) to avoid burst-
       hammering a struggling upstream while other stocks are also scanning.
       ──────────────────────────────────────────────────────────────────── */
    var workerUrl = await getWorkerProxyUrl();
    if (workerUrl) {
      var workerFn = _workerProxyFn(workerUrl);
      var workerAttempts = [];
      for (var s = 0; s < symbols.length; s++) {
        for (var h = 0; h < Y_HOSTS.length; h++) {
          workerAttempts.push({ symbol: symbols[s], host: Y_HOSTS[h], pIdx: -1, proxyFn: workerFn });
        }
      }

      for (var wi = 0; wi < workerAttempts.length && Date.now() < deadline; wi++) {
        var wAtt = workerAttempts[wi];
        if (_isProxyCool(-1) || !_proxyHasRoom(-1)) {
          /* Worker is cooling down or over budget — pause briefly before
             trying the next symbol/host combo rather than skipping straight
             through all of them. */
          if (_isProxyCool(-1)) break;
          await new Promise(function (r) { setTimeout(r, 120); });
          if (!_proxyHasRoom(-1)) continue;
        }
        var wResult = await _tryOneAttempt(wAtt, interval, range);
        if (wResult) return wResult;
        /* Tiny gap between consecutive failures so we don't fire N
           rapid requests through a Worker whose upstream (Yahoo) is
           clearly unhappy.  Only 60 ms — negligible when Yahoo is up. */
        if (wi < workerAttempts.length - 1) {
          await new Promise(function (r) { setTimeout(r, 60); });
        }
      }
    }

    /* ── Public proxy wave fallback ───────────────────────────────────────
       Worker wasn't configured or every attempt through it failed.
       Fire small parallel waves across the public CORS proxy pool —
       this is the old racing logic kept for the fallback path only.
       ──────────────────────────────────────────────────────────────────── */
    var proxyOrder = _getProxyOrder();
    var attempts = [];
    for (var s2 = 0; s2 < symbols.length; s2++) {
      for (var h2 = 0; h2 < Y_HOSTS.length; h2++) {
        for (var pi = 0; pi < proxyOrder.length; pi++) {
          attempts.push({ symbol: symbols[s2], host: Y_HOSTS[h2], pIdx: proxyOrder[pi] });
        }
      }
    }
    if (attempts.length === 0) return null;

    var WAVE_SIZE = 2;
    var WAVE_GAP_MS = 350;
    var idx = 0;

    while (idx < attempts.length && Date.now() < deadline) {
      var wave = [];
      var firedInWave = 0;
      while (idx < attempts.length && firedInWave < WAVE_SIZE) {
        var att = attempts[idx];
        idx++;
        if (_isProxyCool(att.pIdx) || !_proxyHasRoom(att.pIdx)) continue;
        wave.push(_tryOneAttempt(att, interval, range));
        firedInWave++;
      }
      if (wave.length > 0) {
        var remaining = Math.max(200, deadline - Date.now());
        var waveBudget = Math.min(2200, remaining);
        var waveTimeout = new Promise(function (res) { setTimeout(function () { res(null); }, waveBudget); });
        var firstGood = new Promise(function (res) {
          var remainingInWave = wave.length;
          wave.forEach(function (p) {
            p.then(function (val) {
              remainingInWave--;
              if (val) res(val);
              else if (remainingInWave === 0) res(null);
            });
          });
        });
        var winner = await Promise.race([firstGood, waveTimeout]);
        if (winner) return winner;
      }
      await new Promise(function (res) { setTimeout(res, WAVE_GAP_MS); });
    }
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Legacy single-timeframe fetch (kept for UI components that need one TF)
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchFromYahooIntraday(ticker, interval, range) {
    return fetchFromYahooRaced(ticker, interval, range, 5000);
  }

  async function fetchFromYahooDaily(ticker, range) {
    return fetchFromYahooRaced(ticker, "1d", range || "2y", 5000);
  }

  async function fetchOHLCV(ticker, timeframe) {
    timeframe = timeframe || "daily";
    ticker = (ticker || "").trim().toUpperCase();
    if (!ticker) return null;
    if (timeframe === "daily") {
      var yfDaily = await fetchFromYahooDaily(ticker, "2y");
      return { candles: yfDaily, source: "Yahoo Finance" };
    }
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
    var yfIntra = await fetchFromYahooRaced(ticker, yfInterval, yfRange, 5000);
    return { candles: yfIntra, source: "Yahoo Finance" };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Cache
     ═══════════════════════════════════════════════════════════════════════ */
  var _cache = {};
  var CACHE_TTL = 5 * 60 * 1000;

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

  /* ═══════════════════════════════════════════════════════════════════════
     FAST PARALLEL FETCH — used by Nifty 200 scan
     Fetches weekly + daily + 1h simultaneously, each raced across proxies.
     Overall stock timeout enforced by caller.
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchOHLCVParallel(ticker, timeframes, perTfMs) {
    perTfMs = perTfMs || 5000;
    ticker = (ticker || "").trim().toUpperCase();
    if (!ticker) return {};
    var tfConfigs = {
      "weekly": { interval: "1wk", range: "5y" },
      "daily": { interval: "1d", range: "2y" },
      "1h": { interval: "1h", range: "3mo" },
      "5m": { interval: "5m", range: "5d" },
      "15m": { interval: "15m", range: "1mo" },
      "30m": { interval: "30m", range: "1mo" },
      "1m": { interval: "1m", range: "1d" }
    };
    var out = {};
    var promises = timeframes.map(function (tf) {
      var cfg = tfConfigs[tf] || { interval: "1d", range: "2y" };
      return fetchFromYahooRaced(ticker, cfg.interval, cfg.range, perTfMs).then(function (candles) {
        out[tf] = { data: candles && candles.length >= 5 ? candles : null, source: "Yahoo Finance", ts: candles ? Date.now() : 0 };
      }).catch(function () {
        out[tf] = { data: null, source: null, ts: 0 };
      });
    });
    await Promise.all(promises);
    return out;
  }

  function clearProxyCooldowns() {
    _clearProxyCooldowns();
  }

  return {
    fetchOHLCV: fetchOHLCV,
    fetchOHLCVCached: fetchOHLCVCached,
    fetchOHLCVParallel: fetchOHLCVParallel,
    fetchFromYahooIntraday: fetchFromYahooIntraday,
    fetchFromYahooDaily: fetchFromYahooDaily,
    clearCache: clearCache,
    clearProxyCooldowns: clearProxyCooldowns,
    getWorkerProxyUrl: getWorkerProxyUrl,
    setWorkerProxyUrl: setWorkerProxyUrl
  };
})();
