/* ══════════════════════════════════════════════════════════════════════════
   OHLCV Data Fetcher — Yahoo Finance (all timeframes via CORS proxies)
   Every configured channel (Worker + public proxies) is raced together per
   symbol/host combo — see fetchFromYahooRaced below.
   ══════════════════════════════════════════════════════════════════════════ */
window.OHLCVFetcher = (function () {

  /* ── CORS Proxies ──────────────────────────────────────────────────────── */
  var Y_PROXY_FNS = [
    function (u) { return "https://api.cors.lol/?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?" + encodeURIComponent(u); },
    function (u) { return "https://cors.eu.org/" + u; },
    function (u) { return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u); },
    function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
    function (u) { return "https://thingproxy.freeboard.io/fetch/" + encodeURIComponent(u); },
  ];
  var Y_PROXY_KEYS = ["cors.lol", "corsproxy.io", "cors.eu.org", "codetabs", "allorigins", "thingproxy"];
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
    /* idx === -1 means worker-self. A 429/403 here means Yahoo has
       soft-blocked the Worker's own egress IP. Non-hard limits (timeouts,
       network errors) use a shorter base so transient blips don't cause
       cascading proxy blackouts during the scan. */
    var base = idx === -1 ? (isHardLimit ? 3000 : 1500) : (isHardLimit ? 6000 : 2000);
    var capMs = idx === -1 ? 15000 : 30000;
    var cooldown = Math.min(base * Math.pow(1.5, Math.min(fails, 5)), capMs);
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

  /* ── Global concurrency cap ────────────────────────────────────────────
     With _acquireGlobalPacingGate (below) now serializing the actual FIRE
     RATE of every request app-wide, this cap no longer does the heavy
     lifting — it just bounds how many already-fired requests can be
     awaiting a response at once (each takes up to ~4s to resolve or time
     out, fired ~600ms apart, so a handful are normally in flight
     simultaneously). Kept modest since it's a secondary safety net now,
     not the primary throttle. */
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

  /* ── Global pacing gate ───────────────────────────────────────────────────
     MAX_GLOBAL_CONCURRENT / the per-proxy token buckets both cap how many
     requests can be OUTSTANDING at once, but neither one stops several
     different channels (Worker + public proxies) from all firing in the
     same instant — which is exactly what happened when we raced them
     together per wave. Yahoo's real constraint (per available evidence) is
     a low SUSTAINED RATE against its API, not per-IP concurrency — so this
     gate serializes the actual fire time of every request app-wide, one at
     a time, spaced GLOBAL_MIN_GAP_MS apart, no matter which channel or how
     many stocks are "concurrently" being processed above this layer. A
     promise chain is used (rather than a plain timestamp check) so that
     concurrent callers each get a distinct, non-overlapping slot instead of
     racing each other to read/write the same "last fire time". ── */
  var GLOBAL_MIN_GAP_MS = 800; // ~1.25 req/s sustained — well under Yahoo's observed ~2/s tolerance
  var _lastFireTime = 0;
  var _pacingChain = Promise.resolve();
  function _acquireGlobalPacingGate() {
    var myTurn = _pacingChain.then(function () {
      var now = Date.now();
      var slot = Math.max(now, _lastFireTime + GLOBAL_MIN_GAP_MS);
      _lastFireTime = slot;
      var wait = slot - now;
      if (wait > 0) return new Promise(function (r) { setTimeout(r, wait); });
    });
    _pacingChain = myTurn.catch(function () {});
    return myTurn;
  }
  function resetGlobalPacing() {
    _lastFireTime = 0;
    _pacingChain = Promise.resolve();
  }

  /* ── Per-proxy token bucket ────────────────────────────────────────────── */
  var PROXY_WINDOW_MS = 10000;
  var PROXY_MAX_PER_WINDOW = 30; // ~3 req/s sustained per public proxy
  /* self-hosted Worker: the 100k req/day quota is NOT the real ceiling —
     the Worker still calls Yahoo directly, and Yahoo soft rate-limits by
     the calling IP well before that quota is ever touched. 120/10s (12
     req/s) let bursts of scanning stocks slam Yahoo hard enough to get
     throttled after only a few dozen requests, which looked like "only
     15-16 stocks load" no matter how the scan was batched. Capped much
     lower so the Worker's real Yahoo-facing rate stays sustainable. */
  var WORKER_MAX_PER_WINDOW = 60;
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
      return _acquireGlobalPacingGate();
    }).then(function () {
      _proxyRecordFire(att.pIdx);
      var yUrl = "https://" + att.host + "/v8/finance/chart/"
        + encodeURIComponent(att.symbol)
        + "?interval=" + interval + "&range=" + range;
      var proxyUrl = att.pIdx === -1 ? att.proxyFn(yUrl) : Y_PROXY_FNS[att.pIdx](yUrl);

      return fetchWithTimeout(proxyUrl, {}, 4000)
        .then(function (r) {
          if (!r.ok) {
            var hard = r.status === 429 || r.status === 403;
            _markProxyCool(att.pIdx, hard);
            return null;
          }
          return readBody(r, 3000);
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
     FETCH STRATEGY — one request at a time, paced, Worker-first

     Two things changed here based on what actually happened when this
     was tested:

     1. Racing the Worker against all 4 public CORS proxies at once made
        the success rate WORSE (65/200 → 42/200), not better. The public
        proxies (cors.lol, corsproxy.io free tier, cors.eu.org, codetabs)
        have no way to forward a custom User-Agent to Yahoo — only our
        own Worker sets one — and Yahoo's endpoint rejects requests that
        arrive without a real browser User-Agent. So those 4 channels
        were near-guaranteed failures the whole time; racing them just
        burned time and concurrency slots on near-certain misses while
        diluting the one channel that actually works. They're now used
        only as a genuine last resort, one at a time, never raced
        alongside the Worker.

     2. The regression is itself evidence that Yahoo's block here tracks
        aggregate REQUEST RATE, not which IP a request comes from —
        otherwise adding more distinct egress paths should have helped,
        not hurt. So instead of more parallelism, every real request
        (Worker or fallback) now passes through _acquireGlobalPacingGate,
        which serializes actual fire time app-wide to one request every
        GLOBAL_MIN_GAP_MS, regardless of how many stocks/timeframes are
        nominally "concurrent" above this layer.
     ═══════════════════════════════════════════════════════════════════════ */
  async function fetchFromYahooRaced(ticker, interval, range, overallMs) {
    interval = interval || "5m";
    range = range || "1mo";
    overallMs = overallMs || 5000;

    var symbols = [ticker.toUpperCase() + ".NS", ticker.toUpperCase() + ".BO", ticker.toUpperCase()];
    var deadline = Date.now() + overallMs;

    var workerUrl = await getWorkerProxyUrl();
    var workerFn = workerUrl ? _workerProxyFn(workerUrl) : null;
    var proxyOrder = _getProxyOrder();

    /* One flat, priority-ordered attempt list, tried strictly one at a
       time: every Worker symbol/host combo first (.NS covers almost
       every Nifty 200 name, so this usually resolves on attempt #1),
       then public proxies as a last resort if the Worker is unconfigured
       or every combo through it failed. */
    var attempts = [];
    if (workerFn) {
      for (var s = 0; s < symbols.length; s++) {
        for (var h = 0; h < Y_HOSTS.length; h++) {
          attempts.push({ symbol: symbols[s], host: Y_HOSTS[h], pIdx: -1, proxyFn: workerFn });
        }
      }
    }
    for (var s2 = 0; s2 < symbols.length; s2++) {
      for (var h2 = 0; h2 < Y_HOSTS.length; h2++) {
        for (var pi = 0; pi < proxyOrder.length; pi++) {
          attempts.push({ symbol: symbols[s2], host: Y_HOSTS[h2], pIdx: proxyOrder[pi], proxyFn: Y_PROXY_FNS[proxyOrder[pi]] });
        }
      }
    }
    if (attempts.length === 0) return null;

    var ai = 0;
    var consecutiveFails = 0;
    while (ai < attempts.length && Date.now() < deadline) {
      var att = attempts[ai];
      if (_isProxyCool(att.pIdx)) { ai++; continue; }
      if (!_proxyHasRoom(att.pIdx)) {
        await new Promise(function (r) { setTimeout(r, 150); });
        continue;
      }
      var result = await _tryOneAttempt(att, interval, range);
      if (result) return result;
      ai++;
      consecutiveFails++;
      if (ai < attempts.length && Date.now() < deadline) {
        /* Back off a bit more with each consecutive miss instead of a
           flat gap — gives a fresh block a moment to clear instead of
           immediately retrying into it. The global pacing gate inside
           _tryOneAttempt already enforces the real minimum spacing; this
           adds extra room specifically after failures. */
        var gap = Math.min(150 * consecutiveFails, 1200) + Math.random() * 150;
        await new Promise(function (r) { setTimeout(r, gap); });
      }
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
    perTfMs = perTfMs || 12000;
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
    resetGlobalPacing();
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
