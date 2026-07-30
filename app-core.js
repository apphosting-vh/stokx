/* ══════════════════════════════════════════════════════════════════════════
   StoX — Stock Analysis & Portfolio Tracking for Indian Equities
   app-core.js — React application (in-browser Babel compilation)
   ══════════════════════════════════════════════════════════════════════════ */
window.__STOX_APP_VERSION = "2.5.8";

const { useState, useReducer, useRef, useEffect, useCallback, useMemo } = React;

/* ══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════════════════ */
const _inrFmt = {
  0: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  2: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};
const INR = (n, d = 0) => { const v = (!n || !isFinite(n)) ? 0 : n; return (_inrFmt[d] || _inrFmt[0]).format(v); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
const TODAY = () => { const istMs = Date.now() + (5.5 * 60 * 60 * 1000); return new Date(istMs).toISOString().split("T")[0]; };
const pct = (v, b) => b ? (((v - b) / b) * 100) : 0;
const pctStr = (v, b) => b ? (((v - b) / b) * 100).toFixed(2) : "0.00";
const round2 = (v) => Math.round((v || 0) * 100) / 100;

const NSE_HOLIDAYS = new Set([
  "2025-01-26","2025-02-19","2025-03-14","2025-03-31",
  "2025-04-10","2025-04-14","2025-04-18",
  "2025-05-01","2025-08-15","2025-08-27",
  "2025-10-02","2025-10-21","2025-10-22",
  "2025-11-05","2025-12-25",
  "2026-01-26","2026-03-19","2026-03-20",
  "2026-04-02","2026-04-03","2026-04-06","2026-04-14",
  "2026-05-01","2026-06-19","2026-08-17",
  "2026-10-02","2026-11-24","2026-12-25",
]);

const isTradingWeekday = () => {
  const istMs = Date.now() + (5.5 * 60 * 60 * 1000);
  const istDate = new Date(istMs);
  const d = istDate.getUTCDay();
  if (d < 1 || d > 5) return false;
  return !NSE_HOLIDAYS.has(istDate.toISOString().split("T")[0]);
};

/* ── XIRR for single-buy holdings (Newton–Raphson) ── */
function xirrSingleBuy(costBasis, currentVal, buyDateStr) {
  if (!buyDateStr || costBasis <= 0 || currentVal <= 0) return null;
  const buyD = new Date(buyDateStr + "T12:00:00");
  const now = new Date();
  const days = (now - buyD) / 86400000;
  if (days <= 0) return null;
  const years = days / 365;
  if (years < 0.01) return null;
  /* Simple annualised return: (currentVal/costBasis)^(1/years) - 1 */
  const rate = Math.pow(currentVal / costBasis, 1 / years) - 1;
  return isFinite(rate) ? rate * 100 : null;
}

/* ── XIRR for multi-cashflow (Newton–Raphson) ── */
const computeXIRR = (cashflows, dates, guess = 0.1) => {
  if (!cashflows || cashflows.length < 2) return null;
  if (dates[0] === dates[dates.length - 1]) return null;
  const t0 = new Date(dates[0]).getTime();
  const yr = dates.map(d => (new Date(d).getTime() - t0) / (365.25 * 86400000));
  const npv = r => cashflows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, yr[i]), 0);
  const dnpv = r => cashflows.reduce((s, cf, i) => s - yr[i] * cf / Math.pow(1 + r, yr[i] + 1), 0);
  let r = guess;
  for (let i = 0; i < 200; i++) {
    const f = npv(r), df = dnpv(r);
    if (Math.abs(df) < 1e-12) break;
    const nr = r - f / df;
    if (Math.abs(nr - r) < 1e-9) { r = nr; break; }
    r = nr;
    if (r <= -1) r = -0.9999;
  }
  if (!isFinite(r) || r <= -1 || r > 5) return null;
  return Math.round(r * 10000) / 100;
};

/* ── Capital gains classification (Indian tax rules) ── */
function capitalGainsInfo(buyDateStr) {
  if (!buyDateStr) return null;
  const buyD = new Date(buyDateStr + "T12:00:00");
  const now = new Date();
  const daysHeld = Math.floor((now - buyD) / 86400000);
  if (daysHeld < 0) return null;
  const isLT = daysHeld > 365;
  const cgType = isLT ? "LTCG" : "STCG";
  const taxRate = isLT ? "12.5%" : "20%";
  const daysToLT = isLT ? 0 : 365 - daysHeld;
  return { daysHeld, isLT, cgType, taxRate, daysToLT };
}

/* ── Day change calc (placeholder — uses prevClose from prices) ── */
function dayChangeInfo(currentPrice, prevClose) {
  if (!prevClose || !currentPrice || prevClose <= 0) return null;
  const abs = currentPrice - prevClose;
  const pctVal = (abs / prevClose) * 100;
  return { abs, pct: pctVal };
}

/* ── Indian Financial Year key (April–March) ── */
function getFYKey(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const yr = d.getFullYear();
  const mo = d.getMonth();
  const fyStart = mo >= 3 ? yr : yr - 1;
  return "FY" + fyStart + "-" + String(fyStart + 1).slice(-2);
}

/* ── Persist snapshots to IDB settings store ── */
async function persistSnapshots(soldShareSnapshots) {
  await dbPut("settings", { key: "soldShareSnapshots", value: soldShareSnapshots });
}

async function loadSnapshots() {
  try {
    const rows = await dbGetAll("settings");
    const row = rows.find((r) => r.key === "soldShareSnapshots");
    const snaps = row ? row.value : {};
    Object.keys(snaps).forEach(fyKey => {
      (snaps[fyKey] || []).forEach(sn => {
        if (sn.chartPts && sn.chartPts.length > 0 && sn.chartPts[0].close == null && sn.chartPts[0].value != null) {
          const q = Number(sn.qty) || 1;
          sn.chartPts = sn.chartPts.map(p => ({ date: p.date, close: q > 0 ? p.value / q : p.value }));
        }
      });
    });
    return snaps;
  } catch { return {}; }
}

/* ══════════════════════════════════════════════════════════════════════════
   DATA LAYER — LocalStorage / IndexedDB persistence
   ══════════════════════════════════════════════════════════════════════════ */
const DB_NAME = "stox_db";
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("holdings")) db.createObjectStore("holdings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("watchlist")) db.createObjectStore("watchlist", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "date" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = (e) => { db.close(); resolve(e.target.result || []); };
    req.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbPut(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbGetSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readonly");
    const req = tx.objectStore("settings").get(key);
    req.onsuccess = (e) => { db.close(); resolve(e.target.result ? e.target.result.value : undefined); };
    req.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbSetSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key, value });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbDeleteSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   PRICE FETCHER — Yahoo Finance + Stooq for Indian stocks
   ══════════════════════════════════════════════════════════════════════════ */
const _fetchX = (url, opts = {}, ms = 5000) => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  const isExt = typeof location !== "undefined" && url.startsWith("http") && !url.startsWith(location.origin);
  return fetch(url, { ...(isExt ? { credentials: "omit" } : {}), ...opts, signal: ctrl.signal, cache: "no-store" })
    .finally(() => clearTimeout(tid));
};

const _readBody = (r, ms = 4000) => Promise.race([r.text(), new Promise((_, rej) => setTimeout(() => rej(new Error("body timeout")), ms))]);
const _unwrap = (txt) => { try { const j = JSON.parse(txt); if (typeof j?.contents === "string") return j.contents; } catch {} return txt; };

const PROXY_FNS = [
  (u) => "https://api.cors.lol/?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?" + encodeURIComponent(u),
  (u) => "https://cors.eu.org/" + u,
];

async function fetchTickerPrice(rawTicker) {
  const ticker = (rawTicker || "").trim().toUpperCase();
  if (!ticker) return null;
  const symbols = [ticker + ".NS", ticker + ".BO", ticker];
  for (const sym of symbols) {
    for (const proxy of PROXY_FNS) {
      try {
        const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?interval=1d&range=1d&_t=" + Date.now();
        const r = await _fetchX(proxy(url), {}, 6000);
        if (!r.ok) continue;
        const txt = await _readBody(r);
        const json = JSON.parse(_unwrap(txt));
        const result = json?.chart?.result?.[0];
        if (!result) continue;
        const meta = result.meta;
        if (meta && meta.regularMarketPrice > 0) {
          return { price: Math.round(meta.regularMarketPrice * 100) / 100, currency: meta.currency || "INR" };
        }
      } catch { continue; }
    }
  }
  return null;
}

async function fetchMultiplePrices(tickers) {
  const results = {};
  const promises = tickers.map(async (t) => {
    const data = await fetchTickerPrice(t);
    if (data) results[t.toUpperCase()] = data;
  });
  await Promise.allSettled(promises);
  return results;
}

/* ── Historical daily prices fetcher (buyDate → today) ── */
const fetchHistoricalPrices = async (rawTicker, fromDate) => {
  const ticker = (rawTicker || "").trim().toUpperCase();
  if (!ticker || !fromDate) return null;
  let _resolve;
  const capTimer = new Promise(r => { _resolve = r; setTimeout(() => _resolve(null), 30000); });
  const _fetch = async () => {
    const period1 = Math.floor(new Date(fromDate + "T00:00:00Z").getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000) + 86400;
    const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
    const symbols = [ticker + ".NS", ticker + ".BO", ticker];
    const proxyFns = [
      u => "https://api.cors.lol/?url=" + encodeURIComponent(u),
      u => "https://corsproxy.io/?" + encodeURIComponent(u),
      u => "https://cors.eu.org/" + u,
      u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
    ];
    for (const sym of symbols) {
      for (const host of hosts) {
        const yUrl = "https://" + host + "/v8/finance/chart/" + encodeURIComponent(sym) + "?interval=1d&period1=" + period1 + "&period2=" + period2;
        for (const mkProxy of proxyFns) {
          try {
            const r = await _fetchX(mkProxy(yUrl), {}, 10000);
            if (!r.ok) continue;
            const txt = await _readBody(r, 8000);
            let json; try { json = JSON.parse(txt); } catch { continue; }
            const payload = json?.contents ? JSON.parse(json.contents) : json;
            const result = payload?.chart?.result?.[0];
            if (!result) continue;
            const timestamps = result.timestamp || [];
            const closes = result.indicators?.quote?.[0]?.close || [];
            if (timestamps.length < 2) continue;
            const pts = [];
            for (let i = 0; i < timestamps.length; i++) {
              const c = closes[i];
              if (c == null || isNaN(c) || c <= 0) continue;
              const istMs = timestamps[i] * 1000 + (5.5 * 60 * 60 * 1000);
              const istDate = new Date(istMs).toISOString().split("T")[0];
              pts.push({ date: istDate, close: Math.round(c * 100) / 100 });
            }
            if (pts.length >= 2) { _resolve(pts); return pts; }
          } catch {}
        }
      }
    }
    _resolve(null);
    return null;
  };
  return Promise.race([_fetch(), capTimer]);
};

/* ══════════════════════════════════════════════════════════════════════════
   MARKET INDICES FETCHER — NSE India + Stooq commodities
   ══════════════════════════════════════════════════════════════════════════ */
const MARKET_INDEX_MAP = [
  { nseKey: "NIFTY 50", name: "Nifty 50", group: "Broad" },
  { nseKey: "NIFTY 100", name: "Nifty 100", group: "Broad" },
  { nseKey: "NIFTY MIDCAP 50", name: "Nifty Midcap 50", group: "Broad" },
  { nseKey: "NIFTY MIDCAP 100", name: "Nifty Midcap 100", group: "Broad" },
  { nseKey: "NIFTY BANK", name: "Bank Nifty", group: "Sector" },
  { nseKey: "NIFTY IT", name: "Nifty IT", group: "Sector" },
  { nseKey: "NIFTY PHARMA", name: "Nifty Pharma", group: "Sector" },
  { nseKey: "NIFTY AUTO", name: "Nifty Auto", group: "Sector" },
  { nseKey: "NIFTY FMCG", name: "Nifty FMCG", group: "Sector" },
  { nseKey: "NIFTY METAL", name: "Nifty Metal", group: "Sector" },
  { nseKey: "NIFTY REALTY", name: "Nifty Realty", group: "Sector" },
  { nseKey: "NIFTY ENERGY", name: "Nifty Energy", group: "Sector" },
];

const COMMODITY_LIST = [
  { stooq: "xauusd", name: "Gold", currency: "USD" },
  { stooq: "xagusd", name: "Silver", currency: "USD" },
  { stooq: "cl.f", name: "Crude Oil (WTI)", currency: "USD" },
];

async function fetchMarketIndices() {
  const out = [];
  const overallCap = new Promise(r => setTimeout(() => r(null), 18000));

  const _fetch = async () => {
    /* ── NSE India API for all Indian indexes ── */
    const nseUrl = "https://www.nseindia.com/api/allIndices";
    const nseProxies = [
      "https://corsproxy.io/?" + encodeURIComponent(nseUrl),
      "https://api.cors.lol/?url=" + encodeURIComponent(nseUrl),
      "https://cors.eu.org/" + nseUrl,
      "https://api.allorigins.win/raw?url=" + encodeURIComponent(nseUrl),
    ];
    let nseData = null;
    for (const proxyUrl of nseProxies) {
      try {
        const r = await _fetchX(proxyUrl, {}, 10000);
        if (!r.ok) continue;
        const txt = await _readBody(r, 8000);
        let json;
        try { json = JSON.parse(txt); } catch { continue; }
        const payload = json?.contents ? JSON.parse(json.contents) : json;
        if (Array.isArray(payload?.data)) { nseData = payload.data; break; }
      } catch {}
    }

    if (nseData) {
      const bySym = {};
      nseData.forEach(d => { if (d.indexSymbol) bySym[d.indexSymbol] = d; });
      for (const cfg of MARKET_INDEX_MAP) {
        const d = bySym[cfg.nseKey];
        if (!d) continue;
        const price = parseFloat(d.last);
        const prevClose = parseFloat(d.previousClose);
        const change = parseFloat(d.variation) || 0;
        const changePct = parseFloat(d.percentChange) || 0;
        if (isNaN(price)) continue;
        out.push({
          symbol: cfg.nseKey, name: cfg.name, group: cfg.group,
          price, prevClose: !isNaN(prevClose) ? prevClose : null,
          change, changePct, currency: "INR",
        });
      }
    }

    /* ── Commodities via Stooq ── */
    const fetchStooq = async (item) => {
      const stooqUrl = "https://stooq.com/q/l/?s=" + encodeURIComponent(item.stooq) + "&f=sd2t2ohlcv&h&e=csv";
      const proxies = [
        "https://api.cors.lol/?url=" + encodeURIComponent(stooqUrl),
        "https://cors.eu.org/" + stooqUrl,
        "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(stooqUrl),
      ];
      for (const proxyUrl of proxies) {
        try {
          const r = await _fetchX(proxyUrl, {}, 8000);
          if (!r.ok) continue;
          const csv = _unwrap(await _readBody(r, 6000));
          const lines = csv.trim().split("\n");
          if (lines.length < 2) continue;
          const cols = lines[1].split(",");
          const close = parseFloat(cols[6]);
          const open = parseFloat(cols[3]);
          if (isNaN(close) || close <= 0) continue;
          const change = !isNaN(open) && open > 0 ? close - open : 0;
          const changePct = !isNaN(open) && open > 0 ? (change / open * 100) : 0;
          return {
            symbol: item.stooq, name: item.name, group: "Commodity",
            price: Math.round(close * 100) / 100, prevClose: null,
            change: Math.round(change * 100) / 100,
            changePct: Math.round(changePct * 100) / 100,
            currency: item.currency,
          };
        } catch {}
      }
      return null;
    };

    const commodityResults = await Promise.all(COMMODITY_LIST.map(c => fetchStooq(c)));
    commodityResults.forEach(r => { if (r) out.push(r); });
    return out;
  };

  return Promise.race([_fetch(), overallCap]).then(r => r || []);
}

/* ══════════════════════════════════════════════════════════════════════════
   OHLCV DATA FETCHER — for technical analysis
   ══════════════════════════════════════════════════════════════════════════ */
const Y_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

async function fetchOHLCV(ticker, timeframe) {
  timeframe = timeframe || "daily";
  ticker = (ticker || "").trim().toUpperCase();
  if (!ticker) return null;
  var yfInterval, yfRange;
  switch (timeframe) {
    case "1m": yfInterval = "1m"; yfRange = "1d"; break;
    case "5m": yfInterval = "5m"; yfRange = "5d"; break;
    case "15m": yfInterval = "15m"; yfRange = "1mo"; break;
    case "30m": yfInterval = "30m"; yfRange = "1mo"; break;
    case "1h": yfInterval = "1h"; yfRange = "3mo"; break;
    case "2h": yfInterval = "2h"; yfRange = "3mo"; break;
    case "weekly": yfInterval = "1wk"; yfRange = "5y"; break;
    default: yfInterval = "1d"; yfRange = "2y"; break;
  }
  var symbols = [ticker + ".NS", ticker + ".BO", ticker];
  for (var s = 0; s < symbols.length; s++) {
    for (var h = 0; h < Y_HOSTS.length; h++) {
      for (var p = 0; p < PROXY_FNS.length; p++) {
        try {
          var yUrl = "https://" + Y_HOSTS[h] + "/v8/finance/chart/" + encodeURIComponent(symbols[s]) + "?interval=" + yfInterval + "&range=" + yfRange;
          var r = await _fetchX(PROXY_FNS[p](yUrl), {}, 10000);
          if (!r.ok) continue;
          var txt = await _readBody(r, 8000);
          var json = JSON.parse(_unwrap(txt));
          var result = json?.chart?.result?.[0];
          if (!result) continue;
          var timestamps = result.timestamp || [];
          var quotes = result.indicators?.quote?.[0] || {};
          if (timestamps.length < 2) continue;
          var candles = [];
          for (var i = 0; i < timestamps.length; i++) {
            var o = quotes.open?.[i], h2 = quotes.high?.[i], l = quotes.low?.[i], c = quotes.close?.[i], v = quotes.volume?.[i];
            if (c == null || isNaN(c) || c <= 0) continue;
            var istMs = timestamps[i] * 1000 + (5.5 * 60 * 60 * 1000);
            var d = new Date(istMs);
            candles.push({
              t: d.toISOString().split("T")[0] + " " + d.toISOString().split("T")[1].substring(0, 5),
              o: Math.round((o || c) * 100) / 100,
              h: Math.round((h2 || c) * 100) / 100,
              l: Math.round((l || c) * 100) / 100,
              c: Math.round(c * 100) / 100,
              v: v || 0
            });
          }
          if (candles.length >= 10) return candles;
        } catch { continue; }
      }
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   TECHNICAL INDICATORS ENGINE
   ══════════════════════════════════════════════════════════════════════════ */
/* ── Global indicator definitions (available to all components) ── */
var ALL_INDS = [
  { name: "SMA (20)", key: "sma_20", cat: "Trend", type: "line" },
  { name: "SMA (50)", key: "sma_50", cat: "Trend", type: "line" },
  { name: "SMA (200)", key: "sma_200", cat: "Trend", type: "line" },
  { name: "EMA (9)", key: "ema_9", cat: "Trend", type: "line" },
  { name: "EMA (21)", key: "ema_21", cat: "Trend", type: "line" },
  { name: "EMA (50)", key: "ema_50", cat: "Trend", type: "line" },
  { name: "WMA (20)", key: "wma_20", cat: "Trend", type: "line" },
  { name: "VWAP", key: "vwap", cat: "Volume", type: "line" },
  { name: "RSI (14)", key: "rsi_14", cat: "Momentum", type: "oscillator", range: [0, 100] },
  { name: "MACD", key: "macd", cat: "Momentum", type: "macd" },
  { name: "ATR (14)", key: "atr_14", cat: "Volatility", type: "line" },
  { name: "Bollinger Bands", key: "bb", cat: "Volatility", type: "bands" },
  { name: "ADX (14)", key: "adx_14", cat: "Trend", type: "oscillator", range: [0, 100] },
  { name: "SuperTrend", key: "supertrend", cat: "Trend", type: "line" },
  { name: "Ichimoku Cloud", key: "ichimoku", cat: "Trend", type: "ichimoku" },
  { name: "Donchian Channels", key: "donchian", cat: "Volatility", type: "bands" },
  { name: "Keltner Channels", key: "keltner", cat: "Volatility", type: "bands" },
  { name: "OBV", key: "obv", cat: "Volume", type: "volume" },
  { name: "CMF (20)", key: "cmf_20", cat: "Volume", type: "oscillator", range: [-1, 1] },
  { name: "Stochastic RSI", key: "stochRSI", cat: "Momentum", type: "stoch" },
  { name: "CCI (20)", key: "cci_20", cat: "Momentum", type: "oscillator", range: [-200, 200] },
  { name: "ROC (10)", key: "roc_10", cat: "Momentum", type: "oscillator" },
  { name: "Momentum (10)", key: "momentum_10", cat: "Momentum", type: "oscillator" },
  { name: "Parabolic SAR", key: "psar", cat: "Trend", type: "line" },
  { name: "HMA (20)", key: "hma_20", cat: "Trend", type: "line" },
  { name: "KAMA (10)", key: "kama_10", cat: "Trend", type: "line" },
  { name: "TSI", key: "tsi", cat: "Momentum", type: "oscillator" },
  { name: "STC", key: "stc", cat: "Momentum", type: "oscillator", range: [0, 100] },
  { name: "MFI (14)", key: "mfi_14", cat: "Volume", type: "oscillator", range: [0, 100] },
  { name: "PVT", key: "pvt", cat: "Volume", type: "volume" },
  { name: "KVO", key: "kvo", cat: "Volume", type: "oscillator" },
  { name: "Anchored VWAP", key: "anchored_vwap", cat: "Volume", type: "line" },
  { name: "Volume Profile", key: "volumeProfile", cat: "Volume", type: "volumeProfile" },
  { name: "TTM Squeeze", key: "ttmSqueeze", cat: "Volatility", type: "squeeze" },
  { name: "Squeeze Momentum", key: "squeezeMomentum", cat: "Momentum", type: "oscillator" },
  { name: "Darvas Box", key: "darvasBox", cat: "Volatility", type: "darvas" },
  { name: "Smart Money", key: "smartMoney", cat: "Volume", type: "smartMoney" },
  { name: "MTF Alignment", key: "mtfAlignment", cat: "Trend", type: "oscillator", range: [0, 100] },
  { name: "Chandelier Exit", key: "chandelier", cat: "Volatility", type: "chandelier" },
  { name: "Heikin-Ashi", key: "heikinAshi", cat: "Trend", type: "heikinAshi" },
  { name: "Choppiness Index", key: "choppiness", cat: "Volatility", type: "oscillator", range: [0, 100] },
  { name: "Williams %R", key: "williamsR", cat: "Momentum", type: "oscillator", range: [-100, 0] },
  { name: "Awesome Oscillator", key: "awesomeOsc", cat: "Momentum", type: "oscillator" },
  { name: "Force Index", key: "forceIndex", cat: "Volume", type: "volume" },
  { name: "Fibonacci Levels", key: "fibonacci", cat: "Structure", type: "fibonacci" },
  { name: "Pivot Points", key: "pivotPoints", cat: "Structure", type: "pivotPoints" },
  { name: "Williams Fractals", key: "fractals", cat: "Structure", type: "fractals" },
  { name: "Aroon", key: "aroon", cat: "Trend", type: "aroon" },
  { name: "Zig Zag", key: "zigZag", cat: "Structure", type: "zigZag" },
  { name: "Vortex Indicator", key: "vortex", cat: "Trend", type: "vortex" },
  { name: "RS vs Nifty50", key: "rs_vs_nifty", cat: "Trend", type: "rs" },
  { name: "Beta vs Nifty50", key: "beta_nifty", cat: "Momentum", type: "line" },
];
var ALL_CATS = ["Trend", "Momentum", "Volatility", "Volume", "Structure"];
window.STOX_INDICATORS = ALL_INDS;
window.STOX_CATEGORIES = ALL_CATS;

const TechIndicators = window.TechIndicators;

/* ══════════════════════════════════════════════════════════════════════════
   NIFTY 50 / SENSEX REFERENCE DATA
   ══════════════════════════════════════════════════════════════════════════ */
const INDICES = [
  { name: "NIFTY 50", ticker: "^NSEI", exchange: "NSE" },
  { name: "SENSEX", ticker: "^BSESN", exchange: "BSE" },
  { name: "NIFTY BANK", ticker: "^NSEBANK", exchange: "NSE" },
  { name: "NIFTY IT", ticker: "^CNXIT", exchange: "NSE" },
];

const POPULAR_STOCKS = [
  { ticker: "RELIANCE", name: "Reliance Industries" },
  { ticker: "TCS", name: "Tata Consultancy Services" },
  { ticker: "HDFCBANK", name: "HDFC Bank" },
  { ticker: "INFY", name: "Infosys" },
  { ticker: "ICICIBANK", name: "ICICI Bank" },
  { ticker: "HINDUNILVR", name: "Hindustan Unilever" },
  { ticker: "ITC", name: "ITC Limited" },
  { ticker: "SBIN", name: "State Bank of India" },
  { ticker: "BHARTIARTL", name: "Bharti Airtel" },
  { ticker: "KOTAKBANK", name: "Kotak Mahindra Bank" },
  { ticker: "LT", name: "Larsen & Toubro" },
  { ticker: "AXISBANK", name: "Axis Bank" },
  { ticker: "BAJFINANCE", name: "Bajaj Finance" },
  { ticker: "MARUTI", name: "Maruti Suzuki" },
  { ticker: "SUNPHARMA", name: "Sun Pharmaceutical" },
  { ticker: "TATAMOTORS", name: "Tata Motors" },
  { ticker: "WIPRO", name: "Wipro" },
  { ticker: "HCLTECH", name: "HCL Technologies" },
  { ticker: "ADANIENT", name: "Adani Enterprises" },
  { ticker: "TITAN", name: "Titan Company" },
  { ticker: "ASIANPAINT", name: "Asian Paints" },
  { ticker: "BAJAJFINSV", name: "Bajaj Finserv" },
  { ticker: "TECHM", name: "Tech Mahindra" },
  { ticker: "POWERGRID", name: "Power Grid Corp" },
  { ticker: "NTPC", name: "NTPC Limited" },
];

const SECTORS = [
  "Technology", "Banking & Finance", "Energy", "Consumer", "Healthcare",
  "Automobile", "Infrastructure", "Telecom", "Pharma", "FMCG",
  "Metal & Mining", "Real Estate", "Media", "Chemicals", "Textiles"
];

/* ══════════════════════════════════════════════════════════════════════════
   ICONS — SVG icon helpers
   ══════════════════════════════════════════════════════════════════════════ */
const Icons = {
  home: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M4 10.5L12 3l8 7.5V20a1 1 0 0 1-1 1h-4v-5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v5H5a1 1 0 0 1-1-1V10.5z" })
  ),
  search: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 11, cy: 11, r: 7 }),
    React.createElement("line", { x1: 16.5, y1: 16.5, x2: 21, y2: 21 })
  ),
  chart: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "22 12 18 12 15 21 9 3 6 12 2 12" })
  ),
  briefcase: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("rect", { x: 2, y: 7, width: 20, height: 14, rx: 2 }),
    React.createElement("path", { d: "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" })
  ),
  eye: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" }),
    React.createElement("circle", { cx: 12, cy: 12, r: 3 })
  ),
  settings: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 12, cy: 12, r: 3 }),
    React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })
  ),
  plus: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("line", { x1: 12, y1: 5, x2: 12, y2: 19 }),
    React.createElement("line", { x1: 5, y1: 12, x2: 19, y2: 12 })
  ),
  trash: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "3 6 5 6 21 6" }),
    React.createElement("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })
  ),
  x: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("line", { x1: 18, y1: 6, x2: 6, y2: 18 }),
    React.createElement("line", { x1: 6, y1: 6, x2: 18, y2: 18 })
  ),
  refresh: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "23 4 23 10 17 10" }),
    React.createElement("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
  ),
  sun: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 12, cy: 12, r: 4 }),
    React.createElement("line", { x1: 12, y1: 2, x2: 12, y2: 5 }),
    React.createElement("line", { x1: 12, y1: 19, x2: 12, y2: 22 }),
    React.createElement("line", { x1: 4.93, y1: 4.93, x2: 7.05, y2: 7.05 }),
    React.createElement("line", { x1: 16.95, y1: 16.95, x2: 19.07, y2: 19.07 }),
    React.createElement("line", { x1: 2, y1: 12, x2: 5, y2: 12 }),
    React.createElement("line", { x1: 19, y1: 12, x2: 22, y2: 12 }),
    React.createElement("line", { x1: 4.93, y1: 19.07, x2: 7.05, y2: 16.95 }),
    React.createElement("line", { x1: 16.95, y1: 7.05, x2: 19.07, y2: 4.93 })
  ),
  moon: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" })
  ),
  trendingUp: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "23 6 13.5 15.5 8.5 10.5 1 18" }),
    React.createElement("polyline", { points: "17 6 23 6 23 12" })
  ),
  trendingDown: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "23 18 13.5 8.5 8.5 13.5 1 6" }),
    React.createElement("polyline", { points: "17 18 23 18 23 12" })
  ),
  arrowUp: (s = 16) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "18 15 12 9 6 15" })
  ),
  arrowDown: (s = 16) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "6 9 12 15 18 9" })
  ),
  rupee: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M6 3h12" }),
    React.createElement("path", { d: "M6 8h12" }),
    React.createElement("path", { d: "M6 3c0 4.5 6 6 6 11" }),
    React.createElement("path", { d: "M18 3c0 4.5-6 6-6 11" }),
    React.createElement("path", { d: "M6 14c3 2 9 2 12 0" })
  ),
  star: (s = 20, filled = false) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: filled ? "currentColor" : "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polygon", { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" })
  ),
  edit: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }),
    React.createElement("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })
  ),
  clock: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 12, cy: 12, r: 10 }),
    React.createElement("polyline", { points: "12 6 12 12 16 14" })
  ),
  save: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" }),
    React.createElement("polyline", { points: "17 21 17 13 7 13 7 21" }),
    React.createElement("polyline", { points: "7 3 7 8 15 8" })
  ),
  filter: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polygon", { points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" })
  ),
  info: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 12, cy: 12, r: 10 }),
    React.createElement("line", { x1: 12, y1: 16, x2: 12, y2: 12 }),
    React.createElement("line", { x1: 12, y1: 8, x2: 12.01, y2: 8 })
  ),
  pen: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" })
  ),
};

/* ══════════════════════════════════════════════════════════════════════════
   TOAST SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */
let _toastId = 0;
let _toasts = [];
let _setToasts = null;

function showToast(msg, duration = 3000, action) {
  if (!_setToasts) return;
  const id = ++_toastId;
  _setToasts((prev) => [...prev, { id, msg, action, persistent: duration === 0 }]);
  if (duration > 0) {
    setTimeout(() => {
      _setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }
}

window.addEventListener('stox:update-ready', function() {
  showToast('New version available \u2014 updating\u2026', 5000);
  var reg = window.__swReg;
  if (reg && reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
});

window.addEventListener('fsa:permission-needed', function() {
  if (window.__fsa && window.__fsa.handle && !window.__fsa.ready) {
    showToast("File auto-save needs write permission", 15000, { label: "Grant Permission", onClick: function() {
      if (window.__fsa && window.__fsa.grantPermission) window.__fsa.grantPermission();
    }});
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   THEMES & FONTS
   ══════════════════════════════════════════════════════════════════════════ */
const THEMES = [
  { id: "violet",      name: "Violet Light",  desc: "Rich purple-violet",   dark: false, preview: ["#f8f6ff","#7c3aed","#ddd8f5","#6d28d9"] },
  { id: "indigo",      name: "Indigo Light",  desc: "Deep indigo-blue",     dark: false, preview: ["#eef2ff","#4f46e5","#c8d4f8","#4338ca"] },
  { id: "blue",        name: "Blue Light",    desc: "Classic bright blue",  dark: false, preview: ["#eff6ff","#2563eb","#bfdbfe","#1d4ed8"] },
  { id: "green",       name: "Green Light",   desc: "Fresh emerald green",  dark: false, preview: ["#f0fdf4","#16a34a","#bbf7d0","#15803d"] },
  { id: "yellow",      name: "Yellow Light",  desc: "Warm golden yellow",   dark: false, preview: ["#fffbeb","#ca8a04","#fde68a","#a16207"] },
  { id: "orange",      name: "Orange Light",  desc: "Vibrant fiery orange", dark: false, preview: ["#fff7ed","#ea580c","#fed7aa","#c2410c"] },
  { id: "red",         name: "Red Light",     desc: "Bold crimson red",     dark: false, preview: ["#fef2f2","#dc2626","#fecaca","#b91c1c"] },
  { id: "violet-dark", name: "Violet Dark",   desc: "Deep violet night",    dark: true,  preview: ["#0c0818","#a78bfa","#38245e","#8b5cf6"] },
  { id: "indigo-dark", name: "Indigo Dark",   desc: "Indigo midnight",      dark: true,  preview: ["#08081a","#818cf8","#2e2c62","#6366f1"] },
  { id: "blue-dark",   name: "Blue Dark",     desc: "Deep ocean blue",      dark: true,  preview: ["#070c18","#60a5fa","#26406a","#3b82f6"] },
  { id: "green-dark",  name: "Green Dark",    desc: "Forest emerald",       dark: true,  preview: ["#060e08","#4ade80","#224232","#22c55e"] },
  { id: "yellow-dark", name: "Yellow Dark",   desc: "Dark amber glow",      dark: true,  preview: ["#100c04","#facc15","#4e462a","#eab308"] },
  { id: "orange-dark", name: "Orange Dark",   desc: "Ember orange night",   dark: true,  preview: ["#120a04","#fb923c","#523e24","#f97316"] },
  { id: "red-dark",    name: "Red Dark",      desc: "Dark blood red",       dark: true,  preview: ["#140606","#f87171","#582828","#ef4444"] },
];
const FONTS = [
  { id: "dm-sans",            name: "DM Sans",            stack: "'DM Sans', sans-serif" },
  { id: "inter",              name: "Inter",              stack: "'Inter', sans-serif" },
  { id: "plus-jakarta-sans",  name: "Plus Jakarta Sans",  stack: "'Plus Jakarta Sans', sans-serif" },
  { id: "manrope",            name: "Manrope",            stack: "'Manrope', sans-serif" },
  { id: "outfit",             name: "Outfit",             stack: "'Outfit', sans-serif" },
  { id: "space-grotesk",      name: "Space Grotesk",      stack: "'Space Grotesk', sans-serif" },
];
const loadTheme = () => { try { const t = localStorage.getItem("stox_theme_id"); if (t && THEMES.find(th => th.id === t)) return t; } catch {} return "green"; };
const saveTheme = id => { try { localStorage.setItem("stox_theme_id", id); } catch {} };
const applyTheme = id => {
  const th = THEMES.find(t => t.id === id) || THEMES[0];
  document.documentElement.setAttribute("data-theme", id);
  document.documentElement.setAttribute("data-mode", th.dark ? "dark" : "light");
  if (th.dark) { document.documentElement.style.setProperty("color-scheme", "dark"); }
  else { document.documentElement.style.removeProperty("color-scheme"); }
};
const loadFont = () => { try { const f = localStorage.getItem("stox_font_id"); if (f && FONTS.find(fo => fo.id === f)) return f; } catch {} return "dm-sans"; };
const saveFont = id => { try { localStorage.setItem("stox_font_id", id); } catch {} };
const applyFont = id => {
  const font = FONTS.find(f => f.id === id) || FONTS[0];
  document.documentElement.style.setProperty("--font-body", font.stack);
};

var _confirmResolve = null;
function showConfirm(msg) {
  return new Promise(function(resolve) {
    _confirmResolve = resolve;
    var el = document.createElement("div");
    el.className = "modal-bd";
    el.id = "stox-confirm-modal";
    el.style.zIndex = "3000";
    el.onclick = function(e) { if (e.target === e.currentTarget) { el.remove(); _confirmResolve = null; resolve(false); } };
    el.innerHTML = '<div class="stx-card stx-fu" style="max-width:400px;margin:40px auto;width:92vw;padding:24px;text-align:center">'
      + '<p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 20px;line-height:1.5">' + msg + '</p>'
      + '<div style="display:flex;gap:10px;justify-content:center">'
      + '<button id="stox-confirm-cancel" class="stx-btn stx-btn-ghost" style="padding:8px 20px;font-size:13px">Cancel</button>'
      + '<button id="stox-confirm-ok" class="stx-btn" style="padding:8px 20px;font-size:13px;background:#ef4444;color:#fff;border-color:#ef4444">Confirm</button>'
      + '</div></div>';
    document.body.appendChild(el);
    document.getElementById("stox-confirm-cancel").onclick = function() { el.remove(); _confirmResolve = null; resolve(false); };
    document.getElementById("stox-confirm-ok").onclick = function() { el.remove(); _confirmResolve = null; resolve(true); };
  });
}
window.showConfirm = showConfirm;

function ToastHost() {
  const [toasts, setToasts] = useState([]);
  _setToasts = setToasts;
  if (toasts.length === 0) return null;
  return React.createElement("div", { className: "stx-toast-host" },
    toasts.map((t) =>
      React.createElement("div", { key: t.id, className: "stx-toast" + (t.persistent ? " stx-toast-persistent" : ""), style: t.persistent ? { background: "var(--accent)", color: "#fff", border: "none", fontWeight: 700, boxShadow: "0 4px 24px rgba(0,0,0,.25)" } : {} },
        t.persistent && React.createElement("span", { style: { marginRight: 6, fontSize: 13 } }, "\u26a0"),
        React.createElement("span", { className: "stx-toast-msg" }, t.msg),
        t.action && React.createElement("button", {
          className: "stx-toast-action",
          onClick: () => { t.action.onClick(); setToasts((prev) => prev.filter((x) => x.id !== t.id)); }
        }, t.action.label),
        React.createElement("button", {
          className: "stx-toast-close",
          style: t.persistent ? { color: "rgba(255,255,255,.8)" } : {},
          onClick: () => setToasts((prev) => prev.filter((x) => x.id !== t.id))
        }, "\u00d7")
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: StatCard
   ══════════════════════════════════════════════════════════════════════════ */
function StatCard({ label, value, sub, icon, color, className }) {
  return React.createElement("div", {
    className: "stx-card stx-statcard " + (className || ""),
    style: { borderLeft: color ? "3px solid " + color : undefined }
  },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 } },
      React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.5 } }, label),
      icon && React.createElement("span", { style: { color: color || "var(--accent)", opacity: 0.7 } }, icon)
    ),
    React.createElement("div", { style: { fontSize: 22, fontWeight: 800, fontFamily: "var(--font-heading)", color: color || "var(--text)", lineHeight: 1.2 } }, value),
    sub && React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 4 } }, sub)
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: SignalBadge
   ══════════════════════════════════════════════════════════════════════════ */
const SIGNAL_COLORS = {
  bullish: { bg: "var(--profitbg)", border: "var(--profitborder)", text: "var(--profit)", label: "Bullish" },
  bearish: { bg: "var(--lossbg)", border: "var(--lossborder)", text: "var(--loss)", label: "Bearish" },
  overbought: { bg: "var(--warnbg)", border: "var(--warnborder)", text: "var(--warn)", label: "Overbought" },
  oversold: { bg: "var(--infobg)", border: "var(--infoborder)", text: "var(--info)", label: "Oversold" },
  neutral: { bg: "var(--bg5)", border: "var(--border)", text: "var(--text5)", label: "Neutral" },
  trending: { bg: "rgba(168,85,247,.12)", border: "rgba(168,85,247,.3)", text: "#a855f7", label: "Trending" },
  ranging: { bg: "var(--bg5)", border: "var(--border)", text: "var(--text5)", label: "Ranging" },
};

function SignalBadge(signal) {
  if (!signal) return null;
  var s = SIGNAL_COLORS[signal] || SIGNAL_COLORS.neutral;
  return React.createElement("span", {
    style: { display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, background: s.bg, border: "1px solid " + s.border, color: s.text, textTransform: "uppercase" }
  }, s.label);
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: MiniSparkline
   ══════════════════════════════════════════════════════════════════════════ */
function MiniSparkline({ data, width = 100, height = 32, color }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return x + "," + y;
  }).join(" ");
  const isUp = data[data.length - 1] >= data[0];
  const lineColor = color || (isUp ? "var(--profit)" : "var(--loss)");
  return React.createElement("svg", { width, height, style: { overflow: "visible" } },
    React.createElement("polyline", { points, fill: "none", stroke: lineColor, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" })
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MarketTicker — live scrolling ticker for Indian indices + commodities
   ══════════════════════════════════════════════════════════════════════════ */
const MarketTicker = React.memo(function MarketTicker() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const scrollRef = useRef(null);
  const autoScrollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await fetchMarketIndices();
      if (d.length) { setData(d); setLastUpdated(new Date()); }
      else setError("Could not fetch market data");
    } catch (e) { setError(e.message || "Failed to load"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);

  /* Auto-scroll animation */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || data.length < 2) return;
    let pos = 0, dir = 1, paused = false;
    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("touchstart", onEnter, { passive: true });
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("touchend", onLeave);
    const tick = () => {
      if (!paused && el.scrollWidth > el.clientWidth) {
        pos += dir * 0.5;
        if (pos >= el.scrollWidth - el.clientWidth - 2) dir = -1;
        if (pos <= 0) dir = 1;
        el.scrollLeft = pos;
      }
      autoScrollRef.current = requestAnimationFrame(tick);
    };
    autoScrollRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(autoScrollRef.current);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("touchstart", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("touchend", onLeave);
    };
  }, [data]);

  if (!data.length && !loading && !error) return null;

  const fmtPrice = (v, cur) => {
    if (v == null) return "--";
    if (cur === "USD") return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return "\u20b9" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return React.createElement("div", { style: { marginBottom: 24 } },
    /* Header row */
    React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
        React.createElement("div", { style: { width: 3, height: 14, borderRadius: 2, background: "#16a34a", flexShrink: 0 } }),
        React.createElement("span", { style: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text5)" } }, "Market Indices"),
        loading && React.createElement("span", { style: { fontSize: 12, color: "var(--text6)" } }, "\u27f3")
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        lastUpdated && React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", whiteSpace: "nowrap" } },
          "Updated " + lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        ),
        React.createElement("button", {
          onClick: load, disabled: loading,
          style: { fontSize: 10, padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(22,163,74,.3)", background: loading ? "var(--bg5)" : "rgba(22,163,74,.08)", color: "#16a34a", cursor: loading ? "default" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: loading ? 0.5 : 1 }
        }, loading ? "\u27f3 \u2026" : "\u27f3 Refresh")
      )
    ),
    /* Ticker strip */
    error && !data.length
      ? React.createElement("div", { style: { padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)", fontSize: 12, color: "#ef4444", textAlign: "center" } }, error)
      : React.createElement("div", { ref: scrollRef, style: {
          display: "flex", gap: 10, overflowX: "auto", overflowY: "hidden",
          paddingBottom: 6, scrollbarWidth: "thin",
          WebkitOverflowScrolling: "touch",
        }},
        data.map((item, idx) => {
          const isUp = item.change >= 0;
          const col = isUp ? "#16a34a" : "#ef4444";
          const bgCol = isUp ? "rgba(22,163,74,.06)" : "rgba(239,68,68,.06)";
          const borderCol = isUp ? "rgba(22,163,74,.18)" : "rgba(239,68,68,.18)";
          const groupCol = item.group === "Commodity" ? "#b45309" : item.group === "Sector" ? "#6d28d9" : "#0e7490";
          return React.createElement("div", { key: item.symbol + idx, style: {
            flex: "0 0 auto", minWidth: 155, maxWidth: 200,
            padding: "10px 14px", borderRadius: 10,
            background: bgCol, border: "1px solid " + borderCol,
          }},
            /* Group badge + currency */
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 } },
              React.createElement("span", { style: { fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: groupCol + "18", color: groupCol, border: "1px solid " + groupCol + "30", textTransform: "uppercase", letterSpacing: 0.6 } }, item.group),
              item.currency === "USD" && React.createElement("span", { style: { fontSize: 8, fontWeight: 600, color: "var(--text6)" } }, "USD")
            ),
            /* Index name */
            React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", marginBottom: 6, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, item.name),
            /* Price */
            React.createElement("div", { style: { fontWeight: 800, fontSize: 15, color: "var(--text)", marginBottom: 4, whiteSpace: "nowrap", fontFamily: "var(--font-mono)" } }, fmtPrice(item.price, item.currency)),
            /* Change row */
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" } },
              React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: col, lineHeight: 1 } },
                isUp ? "\u25b2" : "\u25bc", " ",
                item.currency === "USD"
                  ? "$" + Math.abs(item.change).toFixed(2)
                  : "\u20b9" + Math.abs(item.change).toFixed(2)
              ),
              React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: col, background: col + "15", padding: "1px 5px", borderRadius: 4 } },
                (isUp ? "+" : "") + item.changePct.toFixed(2) + "%"
              )
            )
          );
        })
    )
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   MARKET NEWS PANEL — RSS Feeds (ET, Moneycontrol, HinduBL)
   ══════════════════════════════════════════════════════════════════════════ */
const RSS_FEEDS = [
  { name: "Economic Times", url: "https://economictimes.indiatimes.com/rssfeeds/13357109.cms" },
  { name: "Moneycontrol", url: "https://www.moneycontrol.com/rss/MCtopnews.xml" },
  { name: "The Hindu BusinessLine", url: "https://www.thehindubusinessline.com/feeder/default.rss" }
];

function MarketNewsPanel({ holdings }) {
  const [news, setNews] = React.useState([]);
  const [stockNews, setStockNews] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("market");
  const [expanded, setExpanded] = React.useState({});

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    return days + "d ago";
  };

  const stripHtml = (html) => {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, "\"");
  };

  // Fetch all RSS feeds on mount
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(RSS_FEEDS.map(function (feed) {
      var rssUrl = encodeURIComponent(feed.url);
      return fetch("https://api.rss2json.com/v1/api.json?rss_url=" + rssUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.status !== "ok" || !data.items) return [];
          return data.items.map(function (item) {
            return {
              title: item.title || "",
              description: item.description || "",
              image_url: item.thumbnail || null,
              source: feed.name,
              published_at: item.pubDate || "",
              url: item.link || "",
              uuid: item.guid || item.link || Math.random().toString(36)
            };
          });
        })
        .catch(function () { return []; });
    })).then(function (results) {
      if (cancelled) return;
      var all = results.flat();
      var seen = {};
      var unique = [];
      for (var i = 0; i < all.length; i++) {
        var key = (all[i].title || "").toLowerCase().slice(0, 60);
        if (seen[key]) continue;
        seen[key] = true;
        unique.push(all[i]);
      }
      unique.sort(function (a, b) { return new Date(b.published_at) - new Date(a.published_at); });
      var top = unique.slice(0, 15);
      setNews(top);
      if (holdings && holdings.length > 0) {
        var keywords = [];
        for (var j = 0; j < holdings.length; j++) {
          var tk = (holdings[j].ticker || "").toLowerCase();
          var co = (holdings[j].company || "").toLowerCase();
          if (co && keywords.indexOf(co) === -1) keywords.push(co);
          if (tk && keywords.indexOf(tk) === -1) keywords.push(tk);
        }
        var filtered = [];
        for (var k = 0; k < top.length; k++) {
          var text = (top[k].title + " " + top[k].description).toLowerCase();
          for (var m = 0; m < keywords.length; m++) {
            if (text.indexOf(keywords[m]) !== -1) { filtered.push(top[k]); break; }
          }
        }
        setStockNews(filtered.slice(0, 12));
      } else {
        setStockNews([]);
      }
      setLoading(false);
    }).catch(function () { if (!cancelled) setLoading(false); });
    return function () { cancelled = true; };
  }, [holdings]);

  const renderNewsCard = (article, idx) => {
    var isExp = expanded[article.uuid];
    var desc = stripHtml(article.description || "");
    var shortDesc = desc.length > 140 ? desc.slice(0, 140) + "..." : desc;
    var hasImage = !!article.image_url;

    return React.createElement("div", {
      key: article.uuid || idx,
      className: "stx-card",
      style: { padding: "14px 16px", marginBottom: 0, animation: "stxFadeIn .35s ease " + (idx * 0.04) + "s both", cursor: "pointer", transition: "border-color .15s, box-shadow .15s" },
      onClick: function () { if (article.url) window.open(article.url, "_blank", "noopener"); },
      onMouseEnter: function (e) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; },
      onMouseLeave: function (e) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }
    },
      React.createElement("div", { style: { display: "flex", gap: 12 } },
        hasImage && React.createElement("div", {
          style: { width: 72, height: 72, borderRadius: 8, backgroundSize: "cover", backgroundPosition: "center", backgroundImage: "url(" + article.image_url + ")", flexShrink: 0 }
        }),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.35, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } }, article.title),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", lineHeight: 1.4, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: isExp ? 10 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" } }, isExp ? desc : shortDesc),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", fontWeight: 600 } }, article.source || "Unknown"),
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "\u00b7"),
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, timeAgo(article.published_at))
          )
        )
      )
    );
  };

  return React.createElement("div", { style: { marginTop: 24 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 } },
      React.createElement("h2", { style: { fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Market News"),
      React.createElement("div", { style: { display: "flex", gap: 2, background: "var(--bg5)", borderRadius: 8, padding: 2, border: "1px solid var(--border)" } },
        React.createElement("button", {
          onClick: function () { setActiveTab("market"); },
          style: { padding: "4px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: activeTab === "market" ? "var(--accent)" : "transparent", color: activeTab === "market" ? "#fff" : "var(--text5)", transition: "all .15s", fontFamily: "var(--font-body)" }
        }, "Indian Markets"),
        holdings && holdings.length > 0 && React.createElement("button", {
          onClick: function () { setActiveTab("stock"); },
          style: { padding: "4px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: activeTab === "stock" ? "var(--accent)" : "transparent", color: activeTab === "stock" ? "#fff" : "var(--text5)", transition: "all .15s", fontFamily: "var(--font-body)" }
        }, "My Holdings")
      ),
      React.createElement("div", { style: { marginLeft: "auto", fontSize: 10, color: "var(--text6)" } }, "RSS Feeds: ET, Moneycontrol, HinduBL")
    ),

    activeTab === "market" && React.createElement("div", null,
      loading && React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text5)" } },
        React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite", fontSize: 20 } }, "\u21bb"),
        React.createElement("div", { style: { marginTop: 8, fontSize: 12 } }, "Loading market news...")
      ),
      !loading && news.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 32, color: "var(--text6)", fontSize: 12 } }, "No news available right now."),
      !loading && news.length > 0 && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 } },
        news.map(function (a, i) { return renderNewsCard(a, i); })
      )
    ),

    activeTab === "stock" && React.createElement("div", null,
      loading && React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text5)" } },
        React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite", fontSize: 20 } }, "\u21bb"),
        React.createElement("div", { style: { marginTop: 8, fontSize: 12 } }, "Loading news for your holdings...")
      ),
      !loading && stockNews.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 32, color: "var(--text6)", fontSize: 12 } }, "No relevant news found for your holdings."),
      !loading && stockNews.length > 0 && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 } },
        stockNews.map(function (a, i) { return renderNewsCard(a, i); })
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Dashboard
   ══════════════════════════════════════════════════════════════════════════ */
function Dashboard({ holdings, watchlist, prices, navigate, refreshPrices }) {
  const [loading, setLoading] = useState(false);

  const totalInvested = useMemo(() => {
    return holdings.reduce((s, h) => s + ((h.buyPrice || h.avgPrice || 0) * h.qty), 0);
  }, [holdings]);

  const totalCurrent = useMemo(() => {
    return holdings.reduce((s, h) => {
      const p = prices[h.ticker]?.price || h.currentPrice || h.buyPrice || h.avgPrice || 0;
      return s + (p * h.qty);
    }, 0);
  }, [holdings, prices]);

  const totalPnL = totalCurrent - totalInvested;
  const totalPnLPct = totalInvested > 0 ? ((totalPnL / totalInvested) * 100) : 0;
  const todayStr = TODAY();

  return React.createElement("div", null,
    // Header
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "DASHBOARD"),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Market Overview"),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", marginTop: 4 } }, todayStr + (isTradingWeekday() ? " \u00b7 Market Open" : " \u00b7 Market Closed"))
      ),
      React.createElement("button", {
        className: "stx-btn stx-btn-ghost",
        disabled: loading,
        onClick: async function() { setLoading(true); try { await refreshPrices(); } catch(e) {} setLoading(false); },
        style: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 14px", borderRadius: 8 }
      }, React.createElement("span", { style: { display: "inline-block", animation: loading ? "screener-spin .8s linear infinite" : "none" } }, Icons.refresh(14)), loading ? "Refreshing..." : "Refresh")
    ),

    // Stats row
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 24 } },
      React.createElement(StatCard, { label: "Total Invested", value: INR(totalInvested), color: "var(--info)" }),
      React.createElement(StatCard, { label: "Current Value", value: INR(totalCurrent), color: "var(--accent)" }),
      React.createElement(StatCard, { label: "Total P&L", value: INR(totalPnL), sub: (totalPnLPct >= 0 ? "+" : "") + totalPnLPct.toFixed(2) + "%", color: totalPnL >= 0 ? "var(--profit)" : "var(--loss)" }),
      React.createElement(StatCard, { label: "Holdings", value: holdings.length.toString(), sub: watchlist.length + " in watchlist", color: "var(--warn)" })
    ),

    // Market Indices
    React.createElement(MarketTicker),

    // Market News
    React.createElement(MarketNewsPanel, { holdings: holdings })
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Stock Analysis
   ══════════════════════════════════════════════════════════════════════════ */
function StockAnalysis({ ticker: initialTicker, prices, holdings, onBack }) {
  const [ticker, setTicker] = useState(initialTicker || "");

  const isMobile = window.innerWidth < 768;

  const price = prices[ticker?.toUpperCase()]?.price;
  const holding = (holdings || []).find(h => h.ticker === (ticker || "").toUpperCase());

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
      React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } },
          onBack && React.createElement("button", {
            onClick: onBack,
            className: "stx-btn stx-btn-ghost",
            style: { fontSize: 11, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }
          }, "\u2190 Back to Portfolio"),
          React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase" } }, "ANALYSIS")
        ),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Stock Analysis")
      )
    ),

    // Price header
    ticker && price && React.createElement("div", { className: "stx-card", style: { marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 20, fontWeight: 800, fontFamily: "var(--font-heading)" } }, ticker),
        React.createElement("div", { style: { fontSize: 28, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--accent)" } }, INR(price, 2))
      )
    ),

    // Indicator Guide (collapsible, shows actual values when available)
    React.createElement("div", {
      style: { marginBottom: 16, borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }
    },
      React.createElement("div", {
        onClick: function (e) { var n = e.currentTarget.nextElementSibling; if (n) n.style.display = n.style.display === "none" ? "block" : "none"; },
        style: { padding: "8px 14px", background: "var(--bg4)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: "var(--text)", userSelect: "none" }
      }, "\u2139\uFE0F " + ticker + " \u2014 " + (price > 0 ? "Price: " + INR(price, 2) : "Indicator Guide")),
      React.createElement("div", { style: { padding: "10px 14px", fontSize: 11, lineHeight: 1.7, color: "var(--text4)", background: "var(--bg3)", borderTop: "1px solid var(--border)" } },
        React.createElement("div", { style: { marginBottom: 6 } },
          React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "How to use this page: "),
          "The ", React.createElement("span", { style: { fontWeight: 600, color: "var(--accent)" } }, "Technical Indicators"),
          " panel below shows computed values for all indicators. Hover over the ", React.createElement("span", { style: { fontWeight: 700, color: "var(--accent)", background: "var(--accentbg)", padding: "0 4px", borderRadius: 3 } }, "?"),
          " button in the panel to see a dynamic guide with actual indicator values for " + ticker + "."
        ),
        React.createElement("div", { style: { marginBottom: 6 } },
          React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "Signals: "),
          "Each indicator shows a ",
          React.createElement("span", { style: { color: "#16a34a", fontWeight: 600 } }, "Bullish"),
          "/", React.createElement("span", { style: { color: "#ef4444", fontWeight: 600 } }, "Bearish"),
          "/Neutral badge. These are rule-based (e.g., price above MA = bullish)."
        ),
        React.createElement("div", { style: { marginBottom: 6 } },
          React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "Categories: "),
          "Trend \u2014 MAs, MACD, ADX, SuperTrend. Momentum \u2014 RSI, CCI, MFI. Volume \u2014 VWAP, OBV, TTM Squeeze. ",
          "Volatility \u2014 Bollinger, ATR, Donchian. Structure \u2014 Ichimoku, Pivots, Choppiness."
        ),
        React.createElement("div", null,
          React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "Scoring: "),
          "The Entry/Exit Score (0\u2013100) aggregates all indicators into four pillars. " + (holding ? "Your holding: entry $" + INR(holding.buyPrice, 2) + " on " + new Date(holding.buyDate).toLocaleDateString() + "." : "")
        )
      )
    ),

    // Exit Score Trend (active holdings only)
    ticker && holding && React.createElement(ExitScoreTrend, {
      ticker: ticker,
      buyPrice: holding.buyPrice,
      buyDate: holding.buyDate,
      entryScore: holding.entryScore,
    }),

    // Full technical indicators panel
    React.createElement(window.TechnicalIndicatorsPanel, { shares: holdings || [], isMobile: isMobile })
  );
}

function EntryScoreAnalysis({ entry, onBack }) {
  const [activeTF, setActiveTF] = useState("daily");
  const [catFilter, setCatFilter] = useState("all");
  const [showGuide, setShowGuide] = useState(false);
  const [freshIndicators, setFreshIndicators] = useState(null);
  const r = entry.result || {};
  const ind = entry.indicators || {};
  const price = entry.currentPrice || r.lastClose || 0;

  const INDS = window.STOX_INDICATORS || [];
  const CATS = window.STOX_CATEGORIES || [];
  const _fmt = function (v, d) { return v != null ? Number(v).toFixed(d != null ? d : 2) : "\u2014"; };
  const _TI = window.TechIndicators;

  useEffect(() => {
    if (!entry.ticker || !_TI || !window.OHLCVFetcher) return;
    let cancelled = false;
    (async () => {
      try {
        const DF = window.OHLCVFetcher;
        const tk = entry.ticker.toUpperCase();
        const [resW, resD, resH] = await Promise.all([
          DF.fetchOHLCVCached(tk, "weekly"),
          DF.fetchOHLCVCached(tk, "daily"),
          DF.fetchOHLCVCached(tk, "1h"),
        ]);
        if (cancelled) return;
        const indW = resW.data && resW.data.length >= 12 ? _TI.computeAll(resW.data) : null;
        const indD = resD.data && resD.data.length >= 12 ? _TI.computeAll(resD.data) : null;
        const indH = resH.data && resH.data.length >= 12 ? _TI.computeAll(resH.data) : null;
        setFreshIndicators({ weekly: indW, daily: indD, hourly: indH });
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [entry.ticker, _TI]);

  const computedInd = freshIndicators || ind;

  const _fmtVal = (def, val) => {
    if (val == null) return "\u2014";
    if (typeof val === "number") {
      if (def.type === "volume") {
        if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + "B";
        if (Math.abs(val) >= 1e7) return (val / 1e7).toFixed(2) + "Cr";
        if (Math.abs(val) >= 1e5) return (val / 1e5).toFixed(2) + "L";
        if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1) + "K";
      }
      return _fmt(val, 2);
    }
    if (typeof val === "object") {
      switch (def.type) {
        case "macd": return _fmt(val.macd, 4);
        case "bands": return _fmt(val.upper, 2);
        case "stoch": return _fmt(val.k, 2);
        case "ichimoku": return _fmt(val.tenkan ?? val.tenkan_sen, 2);
        case "chandelier": return _fmt(val.long, 2);
        case "heikinAshi": return (val.trend || "\u2014").toUpperCase();
        case "aroon": return "Up: " + _fmt(val.up) + " / Dn: " + _fmt(val.down);
        case "vortex": return "+: " + _fmt(val.plus) + " / -: " + _fmt(val.minus);
        case "volumeProfile": return val.poc ? "POC: " + _fmt(val.poc) : "\u2014";
        case "rs": return val.rs ? "RS: " + _fmt(val.rs, 4) : "\u2014";
        case "squeeze": return val.active ? "Squeeze ON" : "Squeeze OFF";
        case "darvas": return val.boxTop ? _fmt(val.boxTop) + " / " + _fmt(val.boxBottom) : "\u2014";
        case "smartMoney": return val.bos ? val.bos.replace("_", " ").toUpperCase() : "\u2014";
        case "fibonacci": return val.swingHigh ? _fmt(val.swingHigh) + " \u2014 " + _fmt(val.swingLow) : "\u2014";
        case "pivotPoints": return val.classic ? "P: " + _fmt(val.classic.P) : "\u2014";
        case "fractals": return (val.up ? val.up.length : 0) + "\u2191 / " + (val.down ? val.down.length : 0) + "\u2193";
        case "zigZag": return val ? val.length + " pivots" : "\u2014";
        default: return "\u2014";
      }
    }
    return String(val);
  };

  const TF_DEFS = [
    { key: "weekly", label: "Weekly", weight: "30%" },
    { key: "daily", label: "Daily", weight: "50%" },
    { key: "hourly", label: "Hourly", weight: "20%" },
  ];

  const activeScore = r[activeTF] || null;
  const activeInd = computedInd[activeTF] || null;

  const factorBar = (label, val, max, color) => {
    if (val == null || max == null) return null;
    const pct = max > 0 ? (Math.abs(val) / max * 100) : 0;
    const barColor = val < 0 ? "#f0473f" : color;
    return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
      React.createElement("span", { style: { width: 90, fontSize: 11, fontWeight: 600, color: "var(--text4)", textAlign: "right", flexShrink: 0 } }, label),
      React.createElement("div", { style: { flex: 1, height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
        React.createElement("div", { style: { width: pct + "%", height: "100%", borderRadius: 3, background: barColor, transition: "width .3s" } })
      ),
      React.createElement("span", { style: { width: 44, fontSize: 10, fontWeight: 700, color: val < 0 ? "#f0473f" : "var(--text4)", fontFamily: "var(--font-mono)", textAlign: "right" } }, (val >= 0 ? "+" : "") + val + "/" + max)
    );
  };

  const renderIndicators = (indData) => {
    if (!indData) return React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", padding: "6px 0" } }, "No indicator data available for this timeframe");
    const signals = _TI && _TI.interpret ? _TI.interpret(indData) : {};
    const filtered = catFilter === "all" ? INDS : INDS.filter(function (i) { return i.cat === catFilter; });
    const catKeys = ["all"].concat(CATS);

    return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", gap: 3, marginBottom: 10, flexWrap: "wrap", alignItems: "center" } },
        catKeys.map(function (cat) {
          var label = cat === "all" ? "All" : cat;
          var count = cat === "all" ? INDS.length : INDS.filter(function (i) { return i.cat === cat; }).length;
          var active = catFilter === cat;
          return React.createElement("button", {
            key: cat,
            onClick: function () { setCatFilter(cat); },
            style: {
              padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: active ? 700 : 500,
              border: "none", cursor: "pointer",
              background: active ? "var(--accent)" : "var(--bg4)",
              color: active ? "#fff" : "var(--text5)",
              transition: "all .15s",
            }
          }, label + " (" + count + ")");
        }),
        React.createElement("button", {
          onClick: function () { setShowGuide(!showGuide); },
          title: "Indicator guide",
          style: {
            padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
            border: "1px solid " + (showGuide ? "var(--accent)" : "var(--border)"),
            background: showGuide ? "var(--accentbg)" : "var(--bg4)",
            color: showGuide ? "var(--accent)" : "var(--text5)", cursor: "pointer",
          }
        }, "?")
      ),
      React.createElement("div", {
        style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 }
      },
        filtered.map(function (def) {
          var val = indData[def.key];
          if (val === null || val === undefined) return null;
          var sig = signals[def.key] || null;
          var sigStyle = sig ? SIGNAL_COLORS[sig] || SIGNAL_COLORS.neutral : null;

          var cardBg = "var(--bg4)";
          var cardBorderLeft = "none";
          if (sig === "bullish") { cardBg = "rgba(22,163,74,.06)"; cardBorderLeft = "3px solid #20c46a"; }
          else if (sig === "bearish") { cardBg = "rgba(239,68,68,.06)"; cardBorderLeft = "3px solid #f0473f"; }
          else if (sig === "overbought") { cardBg = "rgba(234,88,12,.05)"; cardBorderLeft = "3px solid #ea580c"; }
          else if (sig === "oversold") { cardBg = "rgba(37,99,235,.05)"; cardBorderLeft = "3px solid #2563eb"; }
          else if (sig === "trending") { cardBg = "rgba(168,85,247,.05)"; cardBorderLeft = "3px solid #a855f7"; }
          else if (sig === "ranging") { cardBg = "rgba(107,114,128,.04)"; cardBorderLeft = "3px solid #6b7280"; }

          return React.createElement("div", {
            key: def.key,
            style: {
              padding: "8px 10px", borderRadius: 8,
              background: cardBg, border: "1px solid var(--border)", borderLeft: cardBorderLeft,
              display: "flex", flexDirection: "column", gap: 2,
              transition: "background .3s, border-color .3s",
            }
          },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.3 } }, def.name),
              sigStyle && sig !== "neutral" && React.createElement("span", {
                style: {
                  fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 6,
                  background: sigStyle.bg, border: "1px solid " + sigStyle.border, color: sigStyle.text,
                  textTransform: "uppercase",
                }
              }, sigStyle.label)
            ),
            React.createElement("div", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text)" } }, _fmtVal(def, val)),
            def.type === "macd" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "MACD: " + _fmt(val.macd, 4)),
              React.createElement("span", null, "Sig: " + _fmt(val.signal, 4)),
              React.createElement("span", { style: { color: val.histogram >= 0 ? "#20c46a" : "#f0473f" } },
                "Hist: " + _fmt(val.histogram, 4))
            ),
            def.type === "bands" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "U: " + _fmt(val.upper)),
              React.createElement("span", null, "M: " + _fmt(val.middle)),
              React.createElement("span", null, "L: " + _fmt(val.lower))
            ),
            def.type === "stoch" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "%K: " + _fmt(val.k)),
              React.createElement("span", null, "%D: " + _fmt(val.d))
            ),
            def.type === "ichimoku" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 6, flexWrap: "wrap" }
            },
              React.createElement("span", null, "T: " + _fmt(val.tenkan ?? val.tenkan_sen)),
              React.createElement("span", null, "K: " + _fmt(val.kijun ?? val.kijun_sen)),
              React.createElement("span", null, "SA: " + _fmt(val.senkouA ?? val.senkou_span_a)),
              React.createElement("span", null, "SB: " + _fmt(val.senkouB ?? val.senkou_span_b))
            ),
            def.type === "chandelier" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "L: " + _fmt(val.long)),
              React.createElement("span", null, "S: " + _fmt(val.short))
            ),
            def.type === "heikinAshi" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 6 }
            },
              React.createElement("span", null, "O: " + _fmt(val.open)),
              React.createElement("span", null, "H: " + _fmt(val.high)),
              React.createElement("span", null, "L: " + _fmt(val.low)),
              React.createElement("span", null, "C: " + _fmt(val.close))
            ),
            def.type === "aroon" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "Up: " + _fmt(val.up)),
              React.createElement("span", null, "Dn: " + _fmt(val.down)),
              React.createElement("span", { style: { color: val.osc > 0 ? "#20c46a" : "#f0473f" } }, "Osc: " + _fmt(val.osc))
            ),
            def.type === "vortex" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", { style: { color: "#20c46a" } }, "VI+: " + _fmt(val.plus)),
              React.createElement("span", { style: { color: "#f0473f" } }, "VI-: " + _fmt(val.minus))
            ),
            def.type === "volumeProfile" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "POC: " + _fmt(val.poc)),
              val.valueAreaHigh && React.createElement("span", null, "VAH: " + _fmt(val.valueAreaHigh)),
              val.valueAreaLow && React.createElement("span", null, "VAL: " + _fmt(val.valueAreaLow))
            ),
            def.type === "darvas" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8, flexWrap: "wrap" }
            },
              React.createElement("span", null, "Top: " + _fmt(val.boxTop)),
              React.createElement("span", null, "Bottom: " + _fmt(val.boxBottom)),
              val.breakout && React.createElement("span", {
                style: { color: val.breakout === "up" ? "#16a34a" : val.breakout === "down" ? "#ef4444" : "var(--text6)" }
              }, "Breakout: " + val.breakout.toUpperCase())
            ),
            def.type === "rs" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "RS: " + _fmt(val.rs, 4)),
              val.mansfield != null && React.createElement("span", { style: { color: val.mansfield > 0 ? "#20c46a" : "#f0473f" } }, "Mans: " + _fmt(val.mansfield, 2) + "%")
            )
          );
        })
      )
    );
  };

  var _sc = function(key, bullish) {
    var map = {
      sma_20: ["Institutional buy orders step in on tests of the 20/50 SMA.", "Price rallies but rejected at MA from below."],
      ema_9: ["Short-term trend supported by institutional flow.", "EMA turns into resistance on pullback attempts."],
      macd: ["Surging institutional momentum; expanding histogram confirms.", "Fading institutional support; histogram shrinking."],
      adx_14: ["+DI > -DI confirms strong trend.", "-DI > +DI = bearish trend control."],
      supertrend: ["Institutional uptrend control.", "Institutional support has ended."],
      rsi_14: ["RSI 40-80; bounces off 40-50 signal institutional re-entries.", "Bearish divergence or break below 40 = institutional exit."],
      atr_14: ["", ""],
      bb: ["Walking upper band with volume = aggressive institutional expansion.", "Upper band touch + long wick = liquidity sweep, then breakdown."],
      ichimoku: ["Price above cloud = bullish; Tenkan/Kijun cross = signal.", "Price below cloud = bearish."],
      vwap: ["Dips to VWAP bought by institutional algorithms.", "Price below VWAP; institutions offload on rallies to VWAP."],
      darvasBox: ["Breakout above box = institutional accumulation.", "Breakdown below box = institutional distribution."]
    };
    var entry = map[key];
    if (!entry) return null;
    return React.createElement("div", { style: { color: "var(--text6)", lineHeight: 1.3, marginTop: 1 } }, bullish ? entry[0] : entry[1]);
  };

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
      React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } },
          onBack && React.createElement("button", {
            onClick: onBack,
            className: "stx-btn stx-btn-ghost",
            style: { fontSize: 11, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }
          }, "\u2190 Back to Entry Score"),
          React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "#f97316", letterSpacing: 1.4, textTransform: "uppercase" } }, "ENTRY SCORE ANALYSIS")
        ),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, entry.ticker)
      )
    ),
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 2 } }, "Current Price"),
        React.createElement("div", { style: { fontSize: 28, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--accent)" } }, price > 0 ? INR(price, 2) : "\u2014")
      ),
      React.createElement("div", { style: { textAlign: "right" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600, marginBottom: 2 } }, "Final Score"),
        React.createElement("div", { style: { fontSize: 36, fontWeight: 900, color: r.decision ? r.decision.color : "var(--text6)", fontFamily: "var(--font-heading)", lineHeight: 1 } }, r.finalScore != null ? r.finalScore : "\u2014")
      )
    ),
    r.decision && React.createElement("div", { className: "stx-card", style: { marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
        React.createElement("div", { style: { padding: "6px 14px", borderRadius: 8, background: r.decision.color + "18", border: "1px solid " + r.decision.color + "33" } },
          React.createElement("span", { style: { fontSize: 14, fontWeight: 800, color: r.decision.color, fontFamily: "var(--font-heading)" } }, r.decision.label)
        ),
        React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", fontStyle: "italic" } }, r.decision.position)
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textAlign: "right" } },
          "Base: ", React.createElement("span", { style: { fontWeight: 700, color: "var(--text3)" } }, r.baseScore),
          " \u00b7 Pen: ", React.createElement("span", { style: { fontWeight: 700, color: r.penalties < 0 ? "#f0473f" : "var(--text3)" } }, r.penalties),
          " \u00b7 Bonus: ", React.createElement("span", { style: { fontWeight: 700, color: r.bonuses > 0 ? "#20c46a" : "var(--text3)" } }, r.bonuses)
        )
      )
    ),
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("div", { style: { display: "flex", gap: 2, background: "var(--bg4)", borderRadius: 8, padding: 3, marginBottom: 14 } },
        TF_DEFS.map(function (tf) {
          var score = r[tf.key];
          var isActive = activeTF === tf.key;
          return React.createElement("button", {
            key: tf.key,
            onClick: function () { setActiveTF(tf.key); setCatFilter("all"); },
            style: {
              flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: 11, fontWeight: isActive ? 700 : 500,
              border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "#fff" : "var(--text5)",
              transition: "all .15s",
            }
          },
            React.createElement("span", null, tf.label + " (" + tf.weight + ")"),
            score ? React.createElement("span", { style: { fontSize: 14, fontWeight: 900, fontFamily: "var(--font-heading)", color: isActive ? "#fff" : score.decision.color, lineHeight: 1 } }, score.total) : React.createElement("span", { style: { fontSize: 10 } }, "N/A"),
            score && React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: isActive ? "rgba(255,255,255,.8)" : score.decision.color } }, score.decision.label)
          );
        })
      ),
      activeScore && React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 } },
          factorBar("Trend", activeScore.trendScore, activeScore.trendMax, "#4a8fe0"),
          factorBar("Momentum", activeScore.momentumScore, activeScore.momentumMax, "#a855f7"),
          factorBar("Volume", activeScore.volumeScore, activeScore.volumeMax, "#06b6d4"),
          factorBar("Structure", activeScore.structureScore, activeScore.structureMax, "#ec4899")
        ),
        React.createElement("div", { style: { borderTop: "1px solid var(--border)", paddingTop: 10 } },
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text4)", marginBottom: 8 } }, "Technical Indicators"),
          renderIndicators(activeInd),
          showGuide && activeInd && React.createElement("div", {
            style: { marginTop: 10, borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden", fontSize: 10, lineHeight: 1.5, color: "var(--text5)" }
          },
            React.createElement("div", { style: { padding: "6px 10px", background: "var(--bg4)", fontWeight: 600, fontSize: 10, color: "var(--text)", borderBottom: "1px solid var(--border)" } },
              entry.ticker + " Indicators (" + activeTF + ")"
            ),
            React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg3)", maxHeight: 300, overflowY: "auto" } },
              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
                React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "Price: "),
                  React.createElement("span", { style: { fontWeight: 700, color: "var(--accent)" } }, _fmt(price)), " \u00b7 ",
                  "Score: ", React.createElement("span", { style: { fontWeight: 700 } }, activeScore ? activeScore.total : "\u2014")
                ),
                activeInd.sma_20 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "SMA(20): ", React.createElement("span", { style: { fontWeight: 600, color: price > activeInd.sma_20 ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.sma_20)),
                  " \u2014 price ", price > activeInd.sma_20 ? "above = bullish" : "below = bearish",
                  _sc("sma_20", price > activeInd.sma_20)
                ),
                activeInd.ema_9 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "EMA(9): ", React.createElement("span", { style: { fontWeight: 600, color: price > activeInd.ema_9 ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ema_9)),
                  " \u2014 ", price > activeInd.ema_9 ? "price above (bullish)" : "price below (bearish)",
                  _sc("ema_9", price > activeInd.ema_9)
                ),
                activeInd.macd && activeInd.macd.macd != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "MACD: ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.macd.histogram >= 0 ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.macd.macd, 4)),
                  " Hist: ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.macd.histogram >= 0 ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.macd.histogram, 4)),
                  " \u2014 ", activeInd.macd.histogram >= 0 ? "bullish momentum" : "bearish momentum",
                  _sc("macd", activeInd.macd.histogram >= 0)
                ),
                activeInd.adx_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "ADX: ", React.createElement("span", { style: { fontWeight: 600, color: "#eab308" } }, _fmt(activeInd.adx_14)),
                  " \u2014 ", activeInd.adx_14 > 25 ? "trending" : activeInd.adx_14 > 20 ? "borderline" : "ranging"
                ),
                activeInd.plusDI != null && activeInd.minusDI != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "+DI: ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.plusDI > activeInd.minusDI ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.plusDI)), " / -DI: ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.plusDI > activeInd.minusDI ? "#ef4444" : "#16a34a" } }, _fmt(activeInd.minusDI)),
                  " \u2014 ", activeInd.plusDI > activeInd.minusDI ? "bullish" : "bearish"
                ),
                activeInd.supertrend != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "SuperTrend: ", React.createElement("span", { style: { fontWeight: 600, color: price > activeInd.supertrend ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.supertrend)),
                  " \u2014 ", price > activeInd.supertrend ? "uptrend" : "downtrend",
                  _sc("supertrend", price > activeInd.supertrend)
                ),
                activeInd.rsi_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "RSI(14): ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.rsi_14 > 70 ? "#ef4444" : activeInd.rsi_14 < 30 ? "#2563eb" : "#2563eb" } }, _fmt(activeInd.rsi_14)),
                  " \u2014 ", activeInd.rsi_14 > 70 ? "overbought (reversal risk)" : activeInd.rsi_14 < 30 ? "oversold (bounce potential)" : "neutral range",
                  _sc("rsi_14", activeInd.rsi_14 > 50)
                ),
                activeInd.atr_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "ATR(14): ", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, _fmt(activeInd.atr_14)),
                  " \u2014 ", activeInd.atr_14 > 0 && price > 0 ? "stop ~" + _fmt(activeInd.atr_14 * 1.5) + " (" + (activeInd.atr_14 / price * 100).toFixed(1) + "% of price)" : ""
                ),
                activeInd.bb && activeInd.bb.upper != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "Bollinger: U:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, _fmt(activeInd.bb.upper)), " M:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, _fmt(activeInd.bb.middle)), " L:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, _fmt(activeInd.bb.lower)),
                  price >= activeInd.bb.upper * 0.99 ? " \u2014 at upper band" : price <= activeInd.bb.lower * 1.01 ? " \u2014 at lower band" : " \u2014 inside bands",
                  _sc("bb", price > activeInd.bb.middle)
                ),
                activeInd.ichimoku && (activeInd.ichimoku.tenkan ?? activeInd.ichimoku.tenkan_sen) != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "Ichimoku: T:", React.createElement("span", { style: { fontWeight: 600, color: price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ichimoku.tenkan ?? activeInd.ichimoku.tenkan_sen)), " K:", React.createElement("span", { style: { fontWeight: 600, color: price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ichimoku.kijun ?? activeInd.ichimoku.kijun_sen)),
                  " SA:", React.createElement("span", { style: { fontWeight: 600, color: price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a)), " SB:", React.createElement("span", { style: { fontWeight: 600, color: price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b)),
                  " \u2014 price ", price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "above cloud" : "below cloud",
                  _sc("ichimoku", price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0))
                ),
                activeInd.vwap != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "VWAP: ", React.createElement("span", { style: { fontWeight: 600, color: price > activeInd.vwap ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.vwap)),
                  " \u2014 price ", price > activeInd.vwap ? "above (bullish)" : "below (bearish)",
                  _sc("vwap", price > activeInd.vwap)
                ),
                activeInd.darvasBox && activeInd.darvasBox.boxTop != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "Darvas Box: ", React.createElement("span", { style: { fontWeight: 600, color: price >= activeInd.darvasBox.boxTop ? "#16a34a" : price <= activeInd.darvasBox.boxBottom ? "#ef4444" : "#eab308" } }, _fmt(activeInd.darvasBox.boxTop)), " / ", React.createElement("span", { style: { fontWeight: 600, color: price >= activeInd.darvasBox.boxTop ? "#16a34a" : price <= activeInd.darvasBox.boxBottom ? "#ef4444" : "#eab308" } }, _fmt(activeInd.darvasBox.boxBottom)),
                  " \u2014 ", price >= activeInd.darvasBox.boxTop ? "breakout above (bullish)" : price <= activeInd.darvasBox.boxBottom ? "breakdown below (bearish)" : "inside box",
                  _sc("darvasBox", price >= activeInd.darvasBox.boxTop)
                ),
                React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)", fontSize: 9, color: "var(--text6)" } },
                  "Signals are rule-based (price vs indicator). Scores aggregate across Trend, Momentum, Volume, Structure pillars. Switch timeframes above for multi-TF context."
                )
              )
            )
          )
        )
      ),
      !activeScore && React.createElement("div", { style: { textAlign: "center", padding: 16, color: "var(--text6)", fontSize: 11 } }, "No score data for " + activeTF)
    ),
    r.hardFilters && r.hardFilters.length > 0 && React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 8 } }, "Penalties & Bonuses"),
      r.hardFilters.map((f, i) => {
        var isBonus = f.indexOf("(+") >= 0;
        var valMatch = f.match(/\([+\-\u2212]?\d+\)$/);
        var valStr = valMatch ? valMatch[0] : "";
        var label = valStr ? f.replace(valStr, "").replace(/\s*\u2014\s*/, " \u2014 ").trim() : f;
        return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" } },
          React.createElement("span", { style: { color: "var(--text3)", fontSize: 12, flex: 1 } }, isBonus ? "\u2713 " + label : "\u26a0 " + label),
          valStr && React.createElement("span", { style: { fontSize: 11, fontWeight: 800, color: isBonus ? "#20c46a" : "#f0473f", background: isBonus ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", padding: "2px 8px", borderRadius: 4, fontFamily: "var(--font-mono)" } }, valStr)
        );
      })
    ),
    React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", textAlign: "center", padding: "8px 0" } },
      "Added " + new Date(entry.addedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HOLDING VALUE HISTORY CHART
   ══════════════════════════════════════════════════════════════════════════ */
const HoldingValueChart = ({ pts, qty, buyPrice, color, gradId }) => {
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const svgRef = React.useRef(null);
  if (!pts || pts.length < 2) return null;
  color = color || "#10b981";
  gradId = gradId || "hvh0";
  const INRshort = v => {
    if (v >= 10000000) return "\u20b9" + (v / 10000000).toFixed(2) + "Cr";
    if (v >= 100000) return "\u20b9" + (v / 100000).toFixed(2) + "L";
    if (v >= 1000) return "\u20b9" + (v / 1000).toFixed(1) + "K";
    return "\u20b9" + Math.round(v);
  };
  const fmtLbl = dateStr => {
    const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m = parseInt(dateStr.slice(5, 7));
    const d = dateStr.slice(8);
    return d + "-" + mn[m - 1];
  };
  const W = 1200, padL = 136, padR = 64, padT = 36, padB = 64;
  const h = 480;
  const chartW = W - padL - padR, chartH = h - padT - padB;
  const costBasis = qty * buyPrice;
  const vals = pts.map(d => d.value);
  const allVals = [...vals, costBasis];
  const rawMn = Math.min(...allVals), rawMx = Math.max(...allVals, 1);
  const pad4 = (rawMx - rawMn) * 0.04;
  const mn = rawMn - pad4, mx = rawMx + pad4;
  const range = mx - mn || 1;
  const xStep = chartW / (pts.length - 1);
  const yFn = v => padT + chartH * (1 - (v - mn) / range);
  const ptStr = pts.map((d, i) => `${padL + i * xStep},${yFn(d.value)}`).join(" ");
  const polyFill = `${padL},${padT + chartH} ${ptStr} ${padL + (pts.length - 1) * xStep},${padT + chartH}`;
  const yCostBasis = yFn(costBasis);
  const yTicks = [rawMn, rawMn + (rawMx - rawMn) * 0.5, rawMx];
  const greenGradId = gradId + "_g";
  const redGradId = gradId + "_r";
  const clipAboveId = gradId + "_ca";
  const clipBelowId = gradId + "_cb";
  const clipAboveRect = `0 0 ${W} ${yCostBasis}`;
  const clipBelowRect = `0 ${yCostBasis} ${W} ${h - yCostBasis}`;
  const handleMouseMove = e => {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width) - padL;
    const idx = Math.round(svgX / xStep);
    setHoverIdx(Math.max(0, Math.min(pts.length - 1, idx)));
  };
  const hp = hoverIdx !== null ? pts[hoverIdx] : null;
  const hx = hoverIdx !== null ? padL + hoverIdx * xStep : null;
  const hy = hoverIdx !== null ? yFn(pts[hoverIdx].value) : null;
  const tipW = 392, tipH = 160;
  const tipX = hx !== null ? (hx + tipW + padR + 12 > W ? hx - tipW - 20 : hx + 20) : 0;
  const tipY = hy !== null ? Math.max(padT, Math.min(padT + chartH - tipH, hy - tipH / 2)) : 0;
  const labelGap = Math.max(82, Math.ceil(19 * 0.58 * 7 + 24));
  const stride = Math.max(1, Math.ceil(labelGap / xStep));
  const lastStrideIdx = Math.floor((pts.length - 1) / stride) * stride;
  const showLastLabel = (pts.length - 1) % stride !== 0 && ((pts.length - 1) - lastStrideIdx) * xStep >= labelGap;

  return React.createElement("svg", {
    ref: svgRef, width: "100%", viewBox: `0 0 ${W} ${h}`,
    style: { display: "block", cursor: "crosshair", overflow: "visible" },
    onMouseMove: handleMouseMove, onMouseLeave: () => setHoverIdx(null)
  },
    React.createElement("defs", null,
      React.createElement("linearGradient", { id: greenGradId, x1: "0", y1: "0", x2: "0", y2: "1" },
        React.createElement("stop", { offset: "0%", stopColor: "#10b981", stopOpacity: .28 }),
        React.createElement("stop", { offset: "100%", stopColor: "#10b981", stopOpacity: .02 })
      ),
      React.createElement("linearGradient", { id: redGradId, x1: "0", y1: "0", x2: "0", y2: "1" },
        React.createElement("stop", { offset: "0%", stopColor: "#ef4444", stopOpacity: .28 }),
        React.createElement("stop", { offset: "100%", stopColor: "#ef4444", stopOpacity: .02 })
      ),
      React.createElement("clipPath", { id: clipAboveId },
        React.createElement("rect", { x: 0, y: 0, width: W, height: yCostBasis })
      ),
      React.createElement("clipPath", { id: clipBelowId },
        React.createElement("rect", { x: 0, y: yCostBasis, width: W, height: h - yCostBasis })
      )
    ),
    yTicks.map((v, i) => {
      const gy = yFn(v);
      return React.createElement("g", { key: "yt" + i },
        React.createElement("line", { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: "var(--border2)", strokeWidth: 1.4, strokeDasharray: "6,8" }),
        React.createElement("text", { x: padL - 10, y: gy + 7, textAnchor: "end", fill: "var(--text5)", fontSize: 19, fontWeight: 500 }, INRshort(v))
      );
    }),
    React.createElement("line", { x1: padL, y1: yCostBasis, x2: W - padR, y2: yCostBasis, stroke: "#f59e0b", strokeWidth: 2.8, strokeDasharray: "12,8", opacity: .8 }),
    React.createElement("text", { x: W - padR + 6, y: yCostBasis + 7, fill: "#f59e0b", fontSize: 15, fontWeight: 700, textAnchor: "start" }, "Cost"),
    React.createElement("polygon", { points: polyFill, fill: "url(#" + greenGradId + ")", clipPath: "url(#" + clipAboveId + ")" }),
    React.createElement("polygon", { points: polyFill, fill: "url(#" + redGradId + ")", clipPath: "url(#" + clipBelowId + ")" }),
    React.createElement("polyline", { points: ptStr, fill: "none", stroke: pts[pts.length - 1].value >= costBasis ? "#10b981" : "#ef4444", strokeWidth: 4.4, strokeLinejoin: "round", strokeLinecap: "round" }),
    React.createElement("line", { x1: padL, y1: padT + chartH, x2: W - padR, y2: padT + chartH, stroke: "var(--border)", strokeWidth: 2 }),
    (() => {
      const dotR = pts.length <= 20 ? 4.8 : pts.length <= 40 ? 3.2 : pts.length <= 70 ? 2.2 : 0;
      if (dotR === 0) return null;
      return pts.map((d, i) => i === hoverIdx ? null : React.createElement("circle", { key: "d" + i, cx: padL + i * xStep, cy: yFn(d.value), r: dotR, fill: d.value >= costBasis ? "#10b981" : "#ef4444", opacity: .6 }));
    })(),
    pts.map((d, i) => {
      const isStrideHit = i % stride === 0;
      const isLast = i === pts.length - 1;
      if (!isStrideHit && !(isLast && showLastLabel)) return null;
      return React.createElement("text", { key: "xl" + i, x: padL + i * xStep, y: h - 8, textAnchor: "middle", fill: "var(--text6)", fontSize: 19 }, fmtLbl(d.date));
    }),
    hoverIdx !== null && React.createElement("g", null,
      React.createElement("line", { x1: hx, y1: padT, x2: hx, y2: padT + chartH, stroke: color, strokeWidth: 2.4, strokeDasharray: "8,6", opacity: .5 }),
      React.createElement("circle", { cx: hx, cy: hy, r: 18, fill: color, opacity: .13 }),
      React.createElement("circle", { cx: hx, cy: hy, r: 12, fill: "white", stroke: color, strokeWidth: 5 }),
      React.createElement("circle", { cx: hx, cy: hy, r: 6, fill: color }),
      React.createElement("rect", { x: tipX + 4, y: tipY + 6, width: tipW, height: tipH, rx: 16, fill: "rgba(0,0,0,.18)", style: { filter: "blur(6px)" } }),
      React.createElement("rect", { x: tipX, y: tipY, width: tipW, height: tipH, rx: 16, fill: "var(--modal-bg)", stroke: color, strokeWidth: 3 }),
      React.createElement("rect", { x: tipX, y: tipY, width: tipW, height: 8, rx: 16, fill: color }),
      React.createElement("rect", { x: tipX, y: tipY + 4, width: tipW, height: 8, fill: color }),
      React.createElement("text", { x: tipX + 24, y: tipY + 40, fill: "var(--text4)", fontSize: 19, fontWeight: 600, letterSpacing: .3 }, hp.date),
      React.createElement("text", { x: tipX + 24, y: tipY + 84, fill: color, fontSize: 30, fontWeight: 800, fontFamily: "'Sora',sans-serif" }, INR(hp.value)),
      (() => {
        const diff = hp.value - costBasis;
        const diffPct = costBasis > 0 ? ((diff / costBasis) * 100).toFixed(2) : "0.00";
        const col = diff >= 0 ? "#10b981" : "#ef4444";
        const sign = diff >= 0 ? "\u25b2 +" : "\u25bc ";
        return React.createElement("text", { x: tipX + 24, y: tipY + 122, fill: col, fontSize: 18, fontWeight: 600 }, sign + INR(Math.abs(diff)) + " (" + Math.abs(diffPct) + "%)");
      })()
    )
  );
};

const ExitScoreTrend = ({ ticker, buyPrice, buyDate, entryScore }) => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [trendData, setTrendData] = React.useState([]);
  const [expanded, setExpanded] = React.useState(true);
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const svgRef = React.useRef(null);

  React.useEffect(() => {
    if (!ticker || !DF || !TI) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [resW, resD, resH] = await Promise.all([
          DF.fetchOHLCVCached(ticker, "weekly"),
          DF.fetchOHLCVCached(ticker, "daily"),
          DF.fetchOHLCVCached(ticker, "1h"),
        ]);
        if (cancelled) return;
        const computeSeries = (candles) => {
          if (!candles || candles.length < 12) return [];
          const minCandles = 40;
          let startIdx = 0;
          if (buyDate) {
            const bd = buyDate + "T00:00:00";
            for (let j = 0; j < candles.length; j++) {
              const ct = candles[j].t ? candles[j].t.split(" ")[0] : "";
              if (ct >= buyDate) { startIdx = j; break; }
            }
          }
          startIdx = Math.max(startIdx, minCandles - 1);
          const total = candles.length;
          if (total - startIdx < 2) return [];
          const sampleCount = Math.min(20, total - startIdx);
          const step = Math.max(1, Math.floor((total - startIdx - 1) / (sampleCount - 1)));
          const pts = [];
          for (let s = 0; s < sampleCount; s++) {
            const endIdx = Math.min(startIdx + s * step, total - 1);
            const slice = candles.slice(0, endIdx + 1);
            if (slice.length < 12) continue;
            const lastCandle = slice[slice.length - 1];
            const histClose = lastCandle.c;
            const dateStr = lastCandle.t ? lastCandle.t.split(" ")[0] : "";
            if (!dateStr) continue;
            try {
              const ind = TI.computeAll(slice);
              const es = TI.computeExitScore(slice, { entry_price: buyPrice || 0, entry_score: entryScore || 0 });
              if (es && es.exit_score != null) pts.push({ date: dateStr, score: es.exit_score, decision: es.classification, open: lastCandle.o, close: lastCandle.c, prevClose: slice.length >= 2 ? slice[slice.length - 2].c : null });
            } catch {}
          }
          return pts;
        };
        const weeklyPts = computeSeries(resW.data);
        const dailyPts = computeSeries(resD.data);
        const hourlyPts = computeSeries(resH.data);
        const dateSet = new Set();
        weeklyPts.forEach(p => dateSet.add(p.date));
        dailyPts.forEach(p => dateSet.add(p.date));
        hourlyPts.forEach(p => dateSet.add(p.date));
        const allDates = Array.from(dateSet).sort();
        const wMap = {}; weeklyPts.forEach(p => { wMap[p.date] = p; });
        const dMap = {}; dailyPts.forEach(p => { dMap[p.date] = p; });
        const hMap = {}; hourlyPts.forEach(p => { hMap[p.date] = p; });
        const merged = allDates.map(date => ({ date, weekly: wMap[date] || null, daily: dMap[date] || null, hourly: hMap[date] || null }));
        if (!cancelled) setTrendData(merged);
      } catch (e) {
        if (!cancelled) setError("Failed to compute exit score trend");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ticker, buyPrice, buyDate, entryScore]);

  if (loading) {
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Exit Score Trend"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "Computing...")
      )
    );
  }
  if (error || !trendData.length) {
    return null;
  }
  const hasW = trendData.some(p => p.weekly);
  const hasD = trendData.some(p => p.daily);
  const hasH = trendData.some(p => p.hourly);
  const series = [
    { key: "weekly", color: "#ec4899", label: "W", show: hasW },
    { key: "daily", color: "#a855f7", label: "D", show: hasD },
    { key: "hourly", color: "#3b82f6", label: "H", show: hasH },
  ].filter(s => s.show);
  if (!series.length) return null;
  const W = 800, padL = 68, padR = 14, padT = 16, padB = 28;
  const H = 140;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const xStep = trendData.length > 1 ? chartW / (trendData.length - 1) : chartW;
  const yFn = v => padT + chartH * (1 - v / 100);
  const thresholds = [
    { val: 25, color: "#84cc16", label: "MONITOR" },
    { val: 40, color: "#eab308", label: "TIGHTEN STOP" },
    { val: 55, color: "#f97316", label: "PARTIAL EXIT" },
    { val: 70, color: "#ef4444", label: "EXIT" },
  ];
  const buildPolyline = (key) => {
    const pts = trendData.map((d, i) => {
      const v = d[key] ? d[key].score : null;
      return v !== null ? `${padL + i * xStep},${yFn(v)}` : null;
    }).filter(Boolean);
    return pts.length >= 2 ? pts.join(" ") : null;
  };
  const handleMouseMove = e => {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width) - padL;
    const idx = Math.round(svgX / xStep);
    setHoverIdx(Math.max(0, Math.min(trendData.length - 1, idx)));
  };
  const hp = hoverIdx !== null ? trendData[hoverIdx] : null;
  const hx = hoverIdx !== null ? padL + hoverIdx * xStep : null;
  const fmtDate = d => {
    if (!d) return "";
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const parts = d.split("-");
    return parseInt(parts[2]) + " " + m[parseInt(parts[1]) - 1];
  };
  const scoreColor = s => {
    if (s == null) return "var(--text6)";
    if (s >= 70) return "#ef4444";
    if (s >= 55) return "#f97316";
    if (s >= 40) return "#eab308";
    if (s >= 25) return "#84cc16";
    return "#22c55e";
  };
  const stride = Math.max(1, Math.ceil(trendData.length / 6));
  const latest = trendData[trendData.length - 1];
  return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px" } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Exit Score Trend"),
        React.createElement("div", { style: { display: "flex", gap: 6, fontSize: 9 } },
          series.map(s => React.createElement("span", { key: s.key, style: { display: "flex", alignItems: "center", gap: 3, color: s.color, fontWeight: 600 } },
            React.createElement("span", { style: { width: 8, height: 2, borderRadius: 1, background: s.color, display: "inline-block" } }), s.label
          ))
        )
      ),
      React.createElement("button", {
        onClick: () => setExpanded(!expanded),
        style: { background: "none", border: "none", color: "var(--text5)", cursor: "pointer", fontSize: 12, padding: "2px 4px" }
      }, expanded ? "\u25b2" : "\u25bc")
    ),
    expanded && React.createElement(React.Fragment, null,
      React.createElement("svg", {
        ref: svgRef, width: "100%", viewBox: `0 0 ${W} ${H}`,
        style: { display: "block", cursor: "crosshair", overflow: "visible" },
        onMouseMove: handleMouseMove, onMouseLeave: () => setHoverIdx(null)
      },
        thresholds.map((th, i) => React.createElement("g", { key: "yt" + i },
          React.createElement("line", { x1: padL, y1: yFn(th.val), x2: W - padR, y2: yFn(th.val), stroke: th.color, strokeWidth: 0.7, strokeDasharray: "3,5", opacity: 0.3 }),
          React.createElement("text", { x: padL - 4, y: yFn(th.val) + 3, textAnchor: "end", fill: th.color, fontSize: 7, fontWeight: 600, opacity: 0.8 }, th.label)
        )),
        [0, 50, 100].map(v => React.createElement("text", { key: "ytv" + v, x: padL - 4, y: yFn(v) + 3, textAnchor: "end", fill: "var(--text6)", fontSize: 7 }, v)),
        series.map(s => {
          const line = buildPolyline(s.key);
          return line ? React.createElement("polyline", { key: s.key, points: line, fill: "none", stroke: s.color, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round", opacity: 0.85 }) : null;
        }),
        trendData.map((d, i) => {
          if (i % stride !== 0 && i !== trendData.length - 1) return null;
          return React.createElement("text", { key: "xl" + i, x: padL + i * xStep, y: H - 4, textAnchor: "middle", fill: "var(--text6)", fontSize: 8 }, fmtDate(d.date));
        }),
        hp && React.createElement("g", null,
          React.createElement("line", { x1: hx, y1: padT, x2: hx, y2: padT + chartH, stroke: "var(--text5)", strokeWidth: 1, strokeDasharray: "3,3", opacity: 0.5 }),
          series.map(s => {
            const v = hp[s.key] ? hp[s.key].score : null;
            if (v == null) return null;
            return React.createElement("circle", { key: "dot_" + s.key, cx: hx, cy: yFn(v), r: 4, fill: s.color, stroke: "#fff", strokeWidth: 1.5 });
          }),
          (() => {
            const ohlcPt = hp.weekly || hp.daily || hp.hourly;
            const o = ohlcPt ? ohlcPt.open : null;
            const c = ohlcPt ? ohlcPt.close : null;
            const pc = ohlcPt ? ohlcPt.prevClose : null;
            const pctChg = (o != null && c != null && pc) ? ((c - pc) / pc * 100) : null;
            const tipW = 160, tipH = 80;
            const tipX = hx + tipW + padR + 10 > W ? hx - tipW - 10 : hx + 10;
            const tipY = Math.max(padT, Math.min(padT + chartH - tipH, yFn(hp[series[0].key] ? hp[series[0].key].score : 50) - tipH / 2));
            return React.createElement("g", null,
              React.createElement("rect", { x: tipX, y: tipY, width: tipW, height: tipH, rx: 6, fill: "var(--modal-bg)", stroke: "var(--border)", strokeWidth: 1 }),
              React.createElement("text", { x: tipX + 8, y: tipY + 12, fill: "var(--text4)", fontSize: 9, fontWeight: 600 }, fmtDate(hp.date)),
              o != null && React.createElement("text", { x: tipX + 8, y: tipY + 24, fill: "var(--text5)", fontSize: 8 },
                "Open " + o.toFixed(2)
              ),
              c != null && React.createElement("text", { x: tipX + 8, y: tipY + 35, fill: "var(--text5)", fontSize: 8 },
                "Close " + c.toFixed(2)
              ),
              pctChg != null && React.createElement("text", { x: tipX + 8, y: tipY + 46, fill: pctChg >= 0 ? "#22c55e" : "#ef4444", fontSize: 8, fontWeight: 700 },
                (pctChg >= 0 ? "+" : "") + pctChg.toFixed(1) + "% vs prev close"
              ),
              series.map((s, si) => {
                const v = hp[s.key] ? hp[s.key].score : null;
                return React.createElement("text", { key: s.key, x: tipX + 8, y: tipY + 58 + si * 10, fill: s.color, fontSize: 8, fontWeight: 700 },
                  s.label + " " + (v != null ? v : "\u2014")
                );
              })
            );
          })()
        )
      ),
      React.createElement("div", { style: { display: "flex", gap: 12, marginTop: 4, fontSize: 9, color: "var(--text6)" } },
        series.map(s => {
          const val = latest[s.key] ? latest[s.key].score : null;
          const dec = latest[s.key] && latest[s.key].decision ? latest[s.key].decision : "";
          return React.createElement("span", { key: s.key, style: { color: s.color, fontWeight: 600 } },
            s.label + ": " + (val != null ? val + " " + dec : "\u2014")
          );
        }),
        React.createElement("span", { style: { marginLeft: "auto", color: "var(--text6)" } }, trendData.length + " pts")
      )
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   HOLDING HISTORY PANEL
   Fetches daily closing prices from buyDate → today, renders chart
   ══════════════════════════════════════════════════════════════════════════ */
const HoldingHistoryPanel = ({ h, prices }) => {
  const [histLoading, setHistLoading] = React.useState(false);
  const [histPts, setHistPts] = React.useState(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const tkr = (h.ticker || "").trim().toUpperCase();
  const isGain = (prices[h.ticker]?.price || h.currentPrice || 0) >= (h.buyPrice || h.avgPrice || 0);
  const costBasisVal = h.qty * (h.buyPrice || h.avgPrice || 0);
  const safeId = "hvh_" + (h.id || "x").replace(/[^a-zA-Z0-9]/g, "_");

  React.useEffect(() => {
    if (!tkr || !h.buyDate) { setHistPts(null); setHistLoading(false); return; }
    let cancelled = false;
    setHistLoading(true);
    setHistPts(null);
    fetchHistoricalPrices(tkr, h.buyDate)
      .then(pts => {
        if (cancelled) return;
        setHistPts(pts && pts.length >= 2 ? pts : []);
        setHistLoading(false);
      })
      .catch(() => { if (!cancelled) { setHistPts([]); setHistLoading(false); } });
    return () => { cancelled = true; };
  }, [tkr, h.buyDate, refreshKey]);

  if (histLoading) return React.createElement("div", { style: {
    marginTop: 16, padding: "14px 18px", borderRadius: 12,
    background: "var(--bg4)", border: "1px solid var(--border2)",
    display: "flex", alignItems: "center", gap: 10
  }},
    React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite", fontSize: 16 } }, "\u21bb"),
    React.createElement("span", { style: { fontSize: 13, color: "var(--text5)", flex: 1 } }, "Fetching price history since " + h.buyDate + "...")
  );

  if (histPts && histPts.length >= 2) {
    const chartPts = histPts.map(p => ({ date: p.date, value: h.qty * p.close }));
    const latestVal = chartPts[chartPts.length - 1].value;
    const oldestVal = chartPts[0].value;
    const overallChg = latestVal - oldestVal;
    const overallChgPct = oldestVal > 0 ? ((overallChg / oldestVal) * 100).toFixed(2) : "0.00";
    const chgCol = overallChg >= 0 ? "#10b981" : "#ef4444";
    return React.createElement("div", { style: { marginTop: 20, marginBottom: 6, background: "var(--bg4)", borderRadius: 14, padding: "20px 20px 14px", border: "1px solid var(--border2)" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 } },
        React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: "var(--text4)", textTransform: "uppercase", letterSpacing: .5 } }, "Holding Value History"),
        React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", background: "var(--accentbg2)", border: "1px solid var(--border2)", borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" } }, chartPts[0].date + " \u2192 " + chartPts[chartPts.length - 1].date),
        React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { style: { fontSize: 12, padding: "3px 10px", borderRadius: 8, fontWeight: 700, background: overallChg >= 0 ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.12)", border: "1px solid " + (overallChg >= 0 ? "rgba(16,185,129,.25)" : "rgba(239,68,68,.25)"), color: chgCol } }, (overallChg >= 0 ? "\u25b2 +" : "\u25bc ") + Math.abs(overallChgPct) + "%"),
          React.createElement("span", { style: { fontSize: 12, color: "var(--text6)" } }, chartPts.length + " days"),
          React.createElement("button", {
            onClick: () => { if (histLoading) return; setHistPts(null); setRefreshKey(k => k + 1); },
            disabled: histLoading,
            style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 7, border: "1px solid rgba(16,185,129,.3)", background: "rgba(16,185,129,.08)", color: "var(--accent)", cursor: histLoading ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, opacity: histLoading ? .5 : 1 }
          }, "\u21bb Refresh")
        )
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 8, fontSize: 12, color: "var(--text6)" } },
        React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } },
          React.createElement("span", { style: { display: "inline-block", width: 24, height: 3, background: isGain ? "#10b981" : "#ef4444", borderRadius: 2, verticalAlign: "middle" } }),
          "Holding value"
        ),
        React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } },
          React.createElement("span", { style: { display: "inline-block", width: 24, height: 0, borderTop: "3px dashed #f59e0b", verticalAlign: "middle" } }),
          "Cost basis (" + INR(costBasisVal) + ")"
        )
      ),
      React.createElement(HoldingValueChart, { pts: chartPts, qty: h.qty, buyPrice: h.buyPrice || h.avgPrice || 0, color: isGain ? "#10b981" : "#ef4444", gradId: safeId })
    );
  }

  if (histPts !== null && histPts.length === 0 && h.buyDate) {
    return React.createElement("div", { style: {
      marginTop: 12, padding: "10px 14px", borderRadius: 9, fontSize: 12,
      background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.18)",
      color: "#ef4444", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
    }},
      React.createElement("span", { style: { flex: 1 } }, "\u26a0 Could not fetch price history for " + h.ticker + ". Check connection or try again."),
      React.createElement("button", {
        onClick: () => { setHistPts(null); setRefreshKey(k => k + 1); },
        style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 7, border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.08)", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 600 }
      }, "\u21bb Retry")
    );
  }

  return null;
};

/* ══════════════════════════════════════════════════════════════════════════
   SNAPSHOT CHART PANEL (for Trade History — uses saved chartPts or fetches)
   ══════════════════════════════════════════════════════════════════════════ */
const SnapshotChartPanel = ({ sn, dispatch }) => {
  const hasChart = sn.chartPts && sn.chartPts.length >= 2;
  const canLoad = !hasChart && sn.ticker && sn.buyDate && sn.savedAt;
  const [loadingChart, setLoadingChart] = React.useState(false);
  const [chartError, setChartError] = React.useState(null);
  if (!hasChart && !canLoad) return null;
  if (!hasChart && canLoad) return React.createElement("div", { style: {
    marginTop: 12, padding: "10px 14px", borderRadius: 9,
    background: "var(--bg5)", border: "1px solid var(--border2)",
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
  }},
    React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", flex: 1 } },
      chartError ? React.createElement(React.Fragment, null, "\u26a0 " + chartError) : "No chart data saved with this snapshot."
    ),
    React.createElement("button", {
      disabled: loadingChart,
      onClick: async () => {
        setLoadingChart(true); setChartError(null);
        const tkr__ = (sn.ticker || "").trim().toUpperCase();
        try {
          const raw = await fetchHistoricalPrices(tkr__, sn.buyDate);
          if (raw && raw.length >= 2) {
            const cutoff = sn.savedAt || TODAY();
            const pts = raw.filter(p => p.date <= cutoff).map(p => ({ date: p.date, close: p.close }));
            if (pts.length >= 2) {
              if (dispatch) {
                dispatch({ type: "UPDATE_SNAPSHOT_CHART", snapshotId: sn.id, chartPts: pts });
              }
            } else { setChartError("No price data found for this date range."); }
          } else { setChartError("Could not fetch price history. Check ticker or internet connection."); }
        } catch (e) { setChartError("Fetch failed. Try again later."); }
        setLoadingChart(false);
      },
      style: {
        display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7,
        cursor: loadingChart ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600,
        fontFamily: "var(--font-body)", border: "1px solid rgba(109,40,217,.35)",
        background: loadingChart ? "var(--bg5)" : "rgba(109,40,217,.08)", color: "#6d28d9",
        opacity: loadingChart ? 0.6 : 1
      }
    },
      loadingChart ? React.createElement(React.Fragment, null, React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite" } }, "\u21bb"), " Fetching\u2026")
        : React.createElement(React.Fragment, null, "\u{1F4C8} Load Chart")
    )
  );
  return null;
};

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Portfolio Management
   ══════════════════════════════════════════════════════════════════════════ */
function PortfolioPage({ holdings, setHoldings, prices, navigate, saveSnapshot, refreshPrices, setSoldShareSnapshots }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editShare, setEditShare] = useState(null);
  const [mode, setMode] = useState("active"); /* "active" | "past" */
  const [analyzingTicker, setAnalyzingTicker] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({
    company: "", ticker: "", qty: "", buyPrice: "", currentPrice: "",
    buyDate: TODAY(), sellDate: "", sellPrice: "",
    brokerage: "", notes: "", entryScore: "", sector: "Technology"
  });

  const resetForm = () => {
    setForm({ company: "", ticker: "", qty: "", buyPrice: "", currentPrice: "", buyDate: TODAY(), sellDate: "", sellPrice: "", brokerage: "", notes: "", entryScore: "", sector: "Technology" });
    setMode("active");
  };

  const handleAdd = async () => {
    if (!form.ticker || !form.qty || !form.buyPrice) { showToast("Please fill ticker, quantity and buy price"); return; }
    const holding = {
      id: uid(),
      ticker: form.ticker.toUpperCase(),
      company: form.company || form.ticker.toUpperCase(),
      qty: parseFloat(form.qty),
      buyPrice: parseFloat(form.buyPrice),
      avgPrice: parseFloat(form.buyPrice),
      currentPrice: parseFloat(form.currentPrice) || parseFloat(form.buyPrice),
      sector: form.sector,
      buyDate: form.buyDate || TODAY(),
      brokerage: parseFloat(form.brokerage) || 0,
      notes: form.notes || "",
      entryScore: form.entryScore ? parseFloat(form.entryScore) : null,
      priceTs: Date.now(),
      createdAt: Date.now()
    };
    await dbPut("holdings", holding);
    setHoldings((prev) => [...prev, holding]);
    resetForm();
    setShowAdd(false);
    showToast(holding.ticker + " added to portfolio");
  };

  const handleEdit = async () => {
    if (!editShare) return;
    const updated = {
      ...editShare,
      ticker: (editShare.ticker || "").toUpperCase(),
      company: (editShare.company || "").trim(),
      qty: parseFloat(editShare.qty) || 0,
      buyPrice: parseFloat(editShare.buyPrice) || 0,
      avgPrice: parseFloat(editShare.buyPrice) || 0,
      currentPrice: parseFloat(editShare.currentPrice) || 0,
      brokerage: parseFloat(editShare.brokerage) || 0,
      entryScore: editShare.entryScore ? parseFloat(editShare.entryScore) : null,
    };
    await dbPut("holdings", updated);
    setHoldings((prev) => prev.map((h) => h.id === updated.id ? updated : h));
    setEditShare(null);
    showToast(updated.ticker + " updated");
  };

  const handleDelete = async (id) => {
    await dbDelete("holdings", id);
    setHoldings((prev) => prev.filter((h) => h.id !== id));
    showToast("Holding removed");
  };

  const f = form; /* shorthand */

  return React.createElement("div", null,
    /* ── Inline analysis view ── */
    analyzingTicker && React.createElement(StockAnalysis, {
      ticker: analyzingTicker,
      prices,
      holdings,
      onBack: () => setAnalyzingTicker(null)
    }),

    /* ── Portfolio view (hidden when analyzing) ── */
    !analyzingTicker && React.createElement(React.Fragment, null,

    /* ── Header ── */
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "PORTFOLIO"),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Active Holdings"),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", marginTop: 2 } }, holdings.length + " position" + (holdings.length !== 1 ? "s" : "") + " \u00b7 " + TODAY())
      ),
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        React.createElement("button", {
          className: "stx-btn stx-btn-ghost",
          disabled: refreshing,
          onClick: async function() { setRefreshing(true); try { await refreshPrices(); } catch(e) {} setRefreshing(false); showToast("Prices updated"); },
          style: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 12px", borderRadius: 8 }
        }, React.createElement("span", { style: { display: "inline-block", animation: refreshing ? "screener-spin .8s linear infinite" : "none" } }, Icons.refresh(14)), refreshing ? "..." : "Refresh"),
        React.createElement("button", { className: "stx-btn stx-btn-primary", onClick: () => { setShowAdd(true); resetForm(); } }, "+ Add Holding")
      )
    ),

    /* ── Summary stats row ── */
    holdings.length > 0 && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 } },
      React.createElement(StatCard, {
        label: "Total Invested",
        value: INR(holdings.reduce((s, h) => s + ((h.buyPrice || h.avgPrice || 0) * h.qty), 0)),
        color: "var(--info)"
      }),
      React.createElement(StatCard, {
        label: "Current Value",
        value: INR(holdings.reduce((s, h) => {
          const p = prices[h.ticker]?.price || h.currentPrice || h.buyPrice || h.avgPrice || 0;
          return s + (p * h.qty);
        }, 0)),
        color: "var(--accent)"
      }),
      (() => {
        const invested = holdings.reduce((s, h) => s + ((h.buyPrice || h.avgPrice || 0) * h.qty), 0);
        const current = holdings.reduce((s, h) => {
          const p = prices[h.ticker]?.price || h.currentPrice || h.buyPrice || h.avgPrice || 0;
          return s + (p * h.qty);
        }, 0);
        const pnl = current - invested;
        const pnlPct = invested > 0 ? ((pnl / invested) * 100) : 0;
        return React.createElement(StatCard, {
          label: "Total P&L",
          value: (pnl >= 0 ? "+" : "") + INR(pnl),
          sub: (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(2) + "%",
          color: pnl >= 0 ? "var(--profit)" : "var(--loss)"
        });
      })(),
      React.createElement(StatCard, {
        label: "Holdings",
        value: holdings.length.toString(),
        sub: holdings.filter((h) => { const cg = capitalGainsInfo(h.buyDate); return cg && cg.isLT; }).length + " long-term",
        color: "var(--warn)"
      })
    ),

    /* ── Add Share Modal ── */
    showAdd && React.createElement("div", { className: "modal-bd", onClick: (e) => { if (e.target === e.currentTarget) { setShowAdd(false); resetForm(); } } },
      React.createElement("div", { className: "stx-card stx-fu", style: { maxWidth: 520, margin: "40px auto", width: "92vw" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement("h2", { style: { fontSize: 17, fontWeight: 700, fontFamily: "var(--font-heading)" } }, "Add Share"),
          React.createElement("button", { onClick: () => { setShowAdd(false); resetForm(); }, style: { background: "transparent", border: "none", color: "var(--text5)", cursor: "pointer", fontSize: 20 } }, "\u00d7")
        ),

        /* ── Mode toggle: Active holding vs Past trade ── */
        React.createElement("div", { style: { display: "flex", borderRadius: 9, overflow: "hidden", border: "1px solid var(--border2)", marginBottom: 16 } },
          React.createElement("button", {
            onClick: () => setMode("active"),
            style: { flex: 1, padding: "8px 10px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", transition: "all .15s", background: mode === "active" ? "var(--accent)" : "var(--bg4)", color: mode === "active" ? "#fff" : "var(--text5)" }
          }, Icons.briefcase(13), " Active Holding"),
          React.createElement("button", {
            onClick: () => setMode("past"),
            style: { flex: 1, padding: "8px 10px", border: "none", borderLeft: "1px solid var(--border2)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", transition: "all .15s", background: mode === "past" ? "#6d28d9" : "var(--bg4)", color: mode === "past" ? "#fff" : "var(--text5)" }
          }, Icons.clock(12), " Past Trade (Sold)")
        ),

        /* ── Common fields ── */
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Company Name"),
            React.createElement("input", { className: "inp", placeholder: "e.g. Reliance Industries", value: f.company, onChange: (e) => setForm({ ...form, company: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Ticker Symbol *"),
            React.createElement("input", { className: "inp", placeholder: "e.g. RELIANCE", value: f.ticker, onChange: (e) => setForm({ ...form, ticker: e.target.value.toUpperCase() }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Quantity *"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0", value: f.qty, onChange: (e) => setForm({ ...form, qty: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Buy Price (\u20b9) *"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0", value: f.buyPrice, onChange: (e) => setForm({ ...form, buyPrice: e.target.value }) })
          )
        ),

        /* ── Active holding: Acquisition date + current price ── */
        mode === "active" && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Acquisition"),
            React.createElement("input", { className: "inp", type: "date", value: f.buyDate, onChange: (e) => setForm({ ...form, buyDate: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Current Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0", value: f.currentPrice, onChange: (e) => setForm({ ...form, currentPrice: e.target.value }) })
          )
        ),

        /* ── Past trade: sell date + sell price ── */
        mode === "past" && React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 } },
            React.createElement("div", null,
              React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Acquisition"),
              React.createElement("input", { className: "inp", type: "date", value: f.buyDate, onChange: (e) => setForm({ ...form, buyDate: e.target.value }) })
            ),
            React.createElement("div", null,
              React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Selling"),
              React.createElement("input", { className: "inp", type: "date", value: f.sellDate, max: TODAY(), onChange: (e) => setForm({ ...form, sellDate: e.target.value }) })
            )
          ),
          React.createElement("div", { style: { marginTop: 12 } },
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Sell Price (\u20b9 per share)"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0", value: f.sellPrice, onChange: (e) => setForm({ ...form, sellPrice: e.target.value }) })
          ),
          /* P&L preview */
          (f.qty && f.buyPrice && f.sellPrice) && (() => {
            const pnlPreview = (+f.sellPrice - +f.buyPrice) * +f.qty;
            const pnlPctPreview = +f.buyPrice > 0 ? ((+f.sellPrice - +f.buyPrice) / +f.buyPrice * 100) : 0;
            const isG = pnlPreview >= 0;
            return React.createElement("div", {
              style: { padding: "8px 12px", borderRadius: 8, marginTop: 12, background: isG ? "var(--profitbg)" : "var(--lossbg)", border: "1px solid " + (isG ? "var(--profitborder)" : "var(--lossborder)"), display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }
            },
              React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", fontWeight: 600 } }, isG ? "\u25b2 Profit" : "\u25bc Loss"),
              React.createElement("span", { style: { fontWeight: 700, color: isG ? "var(--profit)" : "var(--loss)", fontFamily: "var(--font-heading)", fontSize: 14 } }, (isG ? "+" : "") + INR(pnlPreview)),
              React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isG ? "+" : "") + pnlPctPreview.toFixed(2) + "%")
            );
          })()
        ),

        /* ── Extra fields ── */
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Sector"),
            React.createElement("select", { className: "inp", value: f.sector, onChange: (e) => setForm({ ...form, sector: e.target.value }) },
              SECTORS.map((s) => React.createElement("option", { key: s, value: s }, s))
            )
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Brokerage / Fees (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0 (optional)", value: f.brokerage, onChange: (e) => setForm({ ...form, brokerage: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Entry Score (0\u2013100)"),
            React.createElement("input", { className: "inp", type: "number", min: "0", max: "100", placeholder: "0 (optional)", value: f.entryScore, onChange: (e) => setForm({ ...form, entryScore: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Notes"),
            React.createElement("input", { className: "inp", placeholder: "Broker, strategy notes\u2026", value: f.notes, onChange: (e) => setForm({ ...form, notes: e.target.value }) })
          )
        ),

        /* ── Action buttons ── */
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 16 } },
          React.createElement("button", { className: "stx-btn stx-btn-primary", style: { flex: 1 }, onClick: handleAdd }, mode === "active" ? "Add Share" : "Save to Previous Trades"),
          React.createElement("button", { className: "stx-btn stx-btn-ghost", onClick: () => { setShowAdd(false); resetForm(); } }, "Cancel")
        )
      )
    ),

    /* ── Edit Share Modal ── */
    editShare && React.createElement("div", { className: "modal-bd", onClick: (e) => { if (e.target === e.currentTarget) setEditShare(null); } },
      React.createElement("div", { className: "stx-card stx-fu", style: { maxWidth: 520, margin: "40px auto", width: "92vw" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement("h2", { style: { fontSize: 17, fontWeight: 700, fontFamily: "var(--font-heading)" } }, "Edit Holding"),
          React.createElement("button", { onClick: () => setEditShare(null), style: { background: "transparent", border: "none", color: "var(--text5)", cursor: "pointer", fontSize: 20 } }, "\u00d7")
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Company Name"),
            React.createElement("input", { className: "inp", value: editShare.company || "", onChange: (e) => setEditShare({ ...editShare, company: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Ticker Symbol"),
            React.createElement("input", { className: "inp", value: editShare.ticker || "", onChange: (e) => setEditShare({ ...editShare, ticker: e.target.value.toUpperCase() }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Quantity"),
            React.createElement("input", { className: "inp", type: "number", value: editShare.qty, onChange: (e) => setEditShare({ ...editShare, qty: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Buy Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editShare.buyPrice, onChange: (e) => setEditShare({ ...editShare, buyPrice: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Current Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editShare.currentPrice, onChange: (e) => setEditShare({ ...editShare, currentPrice: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Acquisition"),
            React.createElement("input", { className: "inp", type: "date", value: editShare.buyDate || "", onChange: (e) => setEditShare({ ...editShare, buyDate: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Brokerage / Fees (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editShare.brokerage || "", onChange: (e) => setEditShare({ ...editShare, brokerage: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Entry Score (0\u2013100)"),
            React.createElement("input", { className: "inp", type: "number", min: "0", max: "100", placeholder: "0", value: editShare.entryScore || "", onChange: (e) => setEditShare({ ...editShare, entryScore: e.target.value }) })
          )
        ),
        React.createElement("div", { style: { marginTop: 12 } },
          React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Notes"),
          React.createElement("textarea", { className: "inp", value: editShare.notes || "", onChange: (e) => setEditShare({ ...editShare, notes: e.target.value }), placeholder: "Broker, target price, holding notes\u2026", style: { resize: "vertical", minHeight: 60, lineHeight: 1.6, fontSize: 12 } })
        ),
        /* P&L preview */
        editShare.qty && editShare.buyPrice && editShare.currentPrice && (() => {
          const pnl = (+editShare.currentPrice - +editShare.buyPrice) * (+editShare.qty);
          const pnlPct = +editShare.buyPrice > 0 ? ((+editShare.currentPrice - +editShare.buyPrice) / +editShare.buyPrice * 100) : 0;
          const isG = pnl >= 0;
          return React.createElement("div", { style: { padding: "8px 12px", borderRadius: 8, marginTop: 12, background: isG ? "var(--profitbg)" : "var(--lossbg)", border: "1px solid " + (isG ? "var(--profitborder)" : "var(--lossborder)"), display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 } },
            React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", fontWeight: 600 } }, isG ? "\u25b2 Profit" : "\u25bc Loss"),
            React.createElement("span", { style: { fontWeight: 700, color: isG ? "var(--profit)" : "var(--loss)", fontFamily: "var(--font-heading)", fontSize: 14 } }, (isG ? "+" : "") + INR(pnl)),
            React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isG ? "+" : "") + pnlPct.toFixed(2) + "%")
          );
        })(),
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
          React.createElement("button", { className: "stx-btn stx-btn-primary", style: { flex: 1 }, onClick: handleEdit }, "Save Changes"),
          React.createElement("button", { className: "stx-btn stx-btn-ghost", onClick: () => setEditShare(null) }, "Cancel")
        )
      )
    ),

    /* ── Holdings card grid ── */
    holdings.length > 0
      ? React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 } },
          holdings.map((h) => {
            const livePrice = prices[h.ticker]?.price;
            const currentPrice = livePrice || h.currentPrice || h.buyPrice || h.avgPrice || 0;
            const currentVal = h.qty * currentPrice;
            const costBasis = h.qty * (h.buyPrice || h.avgPrice || 0);
            const pnl = currentVal - costBasis;
            const pnlPct = costBasis > 0 ? ((pnl / costBasis) * 100) : 0;
            const isGain = pnl >= 0;
            const priceDiff = currentPrice - (h.buyPrice || h.avgPrice || 0);
            const hasLivePrice = !!livePrice;
            const xirr = xirrSingleBuy(costBasis, currentVal, h.buyDate);
            const cg = capitalGainsInfo(h.buyDate);

            return React.createElement("div", { key: h.id, className: "stx-card", style: { animation: "stxFadeIn .35s ease both" } },

              /* ── Header: company + ticker + market value ── */
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 } },
                React.createElement("div", null,
                  React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4, lineHeight: 1.3 } }, h.company || h.ticker),
                  React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
                    React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: "var(--r-pill)", fontSize: 11, fontWeight: 600, background: "var(--infobg)", border: "1px solid var(--infoborder)", color: "var(--info)" } }, h.ticker),
                    hasLivePrice && React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "var(--profitbg)", color: "var(--profit)", border: "1px solid var(--profitborder)" } }, "\u25cf LIVE"),
                    h.buyDate && React.createElement("span", { style: { fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)" } }, "since " + h.buyDate)
                  )
                ),
                React.createElement("div", { style: { textAlign: "right" } },
                  React.createElement("div", { style: { fontSize: 18, fontFamily: "var(--font-heading)", fontWeight: 800, color: "var(--accent)" } }, INR(currentVal)),
                  React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 1 } }, h.qty + " shares" + (h.sector ? " \u00b7 " + h.sector : ""))
                )
              ),

              /* ── Buy price vs Current price ── */
              React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderRadius: 9, overflow: "hidden", marginBottom: 10, border: "1px solid var(--border)" } },
                React.createElement("div", { style: { padding: "9px 12px", background: "var(--bg5)" } },
                  React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, "Buy Price"),
                  React.createElement("div", { style: { fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text3)" } }, "\u20b9" + Number(h.buyPrice || h.avgPrice || 0).toLocaleString("en-IN"))
                ),
                React.createElement("div", { style: { padding: "9px 12px", background: "var(--bg4)", textAlign: "right" } },
                  React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, hasLivePrice ? "Live Price" : "Current Price"),
                  React.createElement("div", { style: { fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: isGain ? "var(--profit)" : "var(--loss)" } }, "\u20b9" + Number(currentPrice).toLocaleString("en-IN"))
                )
              ),

              /* ── P&L box ── */
              React.createElement("div", { style: {
                padding: "10px 13px", borderRadius: 9, marginBottom: 10,
                background: isGain ? "var(--profitbg)" : "var(--lossbg)",
                border: "1px solid " + (isGain ? "var(--profitborder)" : "var(--lossborder)")
              } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                  React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: isGain ? "var(--profit)" : "var(--loss)" } }, isGain ? "\u25b2 Profit" : "\u25bc Loss"),
                  React.createElement("div", { style: { textAlign: "right" } },
                    React.createElement("div", { style: { fontSize: 16, fontFamily: "var(--font-heading)", fontWeight: 800, color: isGain ? "var(--profit)" : "var(--loss)" } }, (isGain ? "+" : "") + INR(pnl)),
                    React.createElement("div", { style: { fontSize: 11, color: isGain ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isGain ? "+" : "") + pnlPct.toFixed(2) + "% \u00b7 \u20b9" + (priceDiff >= 0 ? "+" : "") + Number(priceDiff).toFixed(2) + " per share")
                  )
                ),
                /* XIRR row */
                xirr !== null && React.createElement("div", { style: {
                  marginTop: 7, paddingTop: 7, borderTop: "1px solid " + (isGain ? "var(--profitborder)" : "var(--lossborder)"),
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                } },
                  React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", fontWeight: 600 } }, "XIRR (annualised)"),
                  React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: xirr >= 0 ? "var(--profit)" : "var(--loss)" } }, (xirr >= 0 ? "+" : "") + xirr.toFixed(2) + "% p.a.")
                )
              ),

              /* ── Capital Gains classification ── */
              cg && React.createElement("div", { style: {
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 10px", borderRadius: 7, marginBottom: 8,
                background: cg.isLT ? "var(--profitbg)" : "var(--warnbg)",
                border: "1px solid " + (cg.isLT ? "var(--profitborder)" : "var(--warnborder)")
              } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
                  React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: cg.isLT ? "var(--profit)" : "var(--warn)", color: "#fff" } }, cg.cgType),
                  React.createElement("span", { style: { fontSize: 11, color: "var(--text4)" } }, "held " + cg.daysHeld + " days \u00b7 " + cg.taxRate + " tax rate")
                ),
                !cg.isLT && cg.daysToLT > 0 && React.createElement("span", { style: { fontSize: 10, color: "var(--warn)", fontWeight: 600 } }, cg.daysToLT + "d to LTCG"),
                cg.isLT && pnl > 0 && React.createElement("span", { style: { fontSize: 10, color: "var(--profit)", fontWeight: 600 } }, "LTCG: " + INR(Math.round(pnl)))
              ),

              /* ── Entry score badge ── */
              h.entryScore != null && h.entryScore > 0 && React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 } },
                React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, "Entry Score:"),
                React.createElement("span", { style: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: h.entryScore >= 70 ? "var(--profitbg)" : h.entryScore >= 40 ? "var(--warnbg)" : "var(--lossbg)", color: h.entryScore >= 70 ? "var(--profit)" : h.entryScore >= 40 ? "var(--warn)" : "var(--loss)", border: "1px solid " + (h.entryScore >= 70 ? "var(--profitborder)" : h.entryScore >= 40 ? "var(--warnborder)" : "var(--lossborder)") } }, h.entryScore + "/100")
              ),

              /* ── Notes preview ── */
              h.notes && React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 8, fontStyle: "italic" } }, h.notes),

              /* ── Action buttons ── */
              React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" } },
                React.createElement("button", {
                  onClick: () => setEditShare({ ...h, qty: String(h.qty || ""), buyPrice: String(h.buyPrice || h.avgPrice || ""), currentPrice: String(h.currentPrice || ""), brokerage: String(h.brokerage || 0) }),
                  style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--infoborder)", background: "var(--infobg)", color: "var(--info)", transition: "all .15s" },
                  title: "Edit this holding"
                }, Icons.edit(13), " Edit"),
                React.createElement("button", {
                  onClick: async () => {
                    const snapId = uid();
                    const liveP = prices[h.ticker]?.price || h.currentPrice || h.buyPrice || h.avgPrice || 0;
                    const snap = {
                      id: snapId,
                      savedAt: TODAY(),
                      company: h.company || h.ticker,
                      ticker: h.ticker,
                      qty: h.qty,
                      buyPrice: h.buyPrice || h.avgPrice || 0,
                      buyDate: h.buyDate || "",
                      sellPrice: liveP,
                      currentVal: h.qty * liveP,
                      costBasis: h.qty * (h.buyPrice || h.avgPrice || 0),
                      pnl: 0,
                      pnlPct: 0,
                      brokerage: h.brokerage || 0,
                      priceTs: Date.now(),
                      notes: h.notes || "",
                      chartPts: [],
                    };
                    snap.pnl = snap.currentVal - snap.costBasis;
                    snap.pnlPct = snap.costBasis > 0 ? ((snap.pnl / snap.costBasis) * 100) : 0;
                    saveSnapshot(snap);
                    showToast(h.ticker + " snapshot saved to Trade History");
                    if (h.buyDate) {
                      fetchHistoricalPrices(h.ticker, h.buyDate).then(pts => {
                        if (pts && pts.length >= 2) {
                          const chartData = pts.filter(p => p.date <= TODAY()).map(p => ({ date: p.date, close: p.close }));
                          if (chartData.length >= 2) {
                            const updatedSnap = { ...snap, chartPts: chartData };
                            const fyKey = getFYKey(snap.savedAt);
                            setSoldShareSnapshots(prev => {
                              const snaps = (prev[fyKey] || []).map(s => s.id === snapId ? updatedSnap : s);
                              const updated = { ...prev, [fyKey]: snaps };
                              persistSnapshots(updated);
                              return updated;
                            });
                          }
                        }
                      }).catch(() => {});
                    }
                  },
                  style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid rgba(109,40,217,.35)", background: "rgba(109,40,217,.08)", color: "#6d28d9", transition: "all .15s" },
                  title: "Save a snapshot of this holding to Trade History"
                }, Icons.save(13), " Save Snapshot"),
                React.createElement("button", {
                  onClick: async () => { if (await showConfirm("Remove " + h.ticker + " from portfolio?")) handleDelete(h.id); },
                  style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--lossborder)", background: "var(--lossbg)", color: "var(--loss)", transition: "all .15s" },
                  title: "Remove this holding"
                }, Icons.trash(13), " Remove"),
                React.createElement("button", {
                  onClick: async () => { try { await fetchSinglePrice(h.ticker); } catch(e) {} setAnalyzingTicker(h.ticker); },
                  style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--accentborder)", background: "rgba(16,185,129,.08)", color: "var(--accent)", transition: "all .15s" },
                  title: "Analyze this stock"
                }, Icons.chart(13), " Analyze")
              ),
              React.createElement(HoldingHistoryPanel, { h: h, prices: prices }),
              React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", fontStyle: "italic", marginTop: 4 } }, "Save Snapshot captures current values to Trade History before selling")
            );
          })
        )
      : React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: "48px 24px" } },
          React.createElement("div", { style: { fontSize: 48, marginBottom: 16, opacity: 0.3 } }, "\ud83d\udcbc"),
          React.createElement("h3", { style: { fontSize: 16, fontWeight: 700, color: "var(--text2)", marginBottom: 8 } }, "No Holdings Yet"),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text5)", marginBottom: 20, maxWidth: 360, margin: "0 auto 20px" } }, "Add your first stock to start tracking your portfolio performance with live prices, P&L, and tax classification."),
          React.createElement("button", { className: "stx-btn stx-btn-primary", onClick: () => { setShowAdd(true); resetForm(); } }, "+ Add First Holding")
        )
    ) /* end Fragment */
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Trade History
   ══════════════════════════════════════════════════════════════════════════ */
function TradeHistoryPage({ soldShareSnapshots = {}, deleteSnapshot, editSnapshot, setSoldShareSnapshots }) {
  const fyKeys = Object.keys(soldShareSnapshots).sort().reverse();
  const [expanded, setExpanded] = useState({});
  const [monthExpanded, setMonthExpanded] = useState({});
  const [editSnap, setEditSnap] = useState(null);

  const exportTrades = () => {
    const payload = {
      app: "StoX",
      type: "trade-history",
      version: 1,
      exportDate: new Date().toISOString(),
      soldShareSnapshots: soldShareSnapshots
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stox-trades-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported " + totalSnapshots + " trade snapshot" + (totalSnapshots !== 1 ? "s" : ""), 3000);
  };

  const importTrades = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.type !== "trade-history" || !data.soldShareSnapshots || typeof data.soldShareSnapshots !== "object") {
          showToast("Invalid trade history file", 3000);
          return;
        }
        const importCount = Object.values(data.soldShareSnapshots).reduce((s, a) => s + a.length, 0);
        if (!await showConfirm("Import " + importCount + " trade snapshot" + (importCount !== 1 ? "s" : "") + "?\nExisting snapshots with the same ID will be replaced.")) return;
        const merged = {};
        Object.keys(soldShareSnapshots).forEach(fy => { merged[fy] = [...soldShareSnapshots[fy]]; });
        Object.keys(data.soldShareSnapshots).forEach(fy => {
          const existing = merged[fy] || [];
          const imported = data.soldShareSnapshots[fy] || [];
          const snapMap = {};
          existing.forEach(s => { snapMap[s.id] = s; });
          imported.forEach(s => { snapMap[s.id] = s; });
          merged[fy] = Object.values(snapMap);
        });
        setSoldShareSnapshots(merged);
        persistSnapshots(merged);
        showToast("Imported " + importCount + " trade snapshot" + (importCount !== 1 ? "s" : ""), 3000);
      } catch (err) {
        showToast("Import failed: " + err.message, 5000);
      }
    };
    input.click();
  };

  const toggleFY = (fy) => setExpanded((p) => ({ ...p, [fy]: !p[fy] }));
  const toggleMonth = (mk) => setMonthExpanded((p) => ({ ...p, [mk]: !p[mk] }));
  const expandAll = () => {
    const c = {};
    fyKeys.forEach((fy) => {
      c[fy] = true;
      const snaps = soldShareSnapshots[fy] || [];
      snaps.forEach((sn) => {
        const d = new Date(sn.savedAt + "T12:00:00");
        const mk = fy + "-" + d.toLocaleString("en-IN", { month: "long" });
        c[mk] = true;
      });
    });
    setExpanded(c);
    setMonthExpanded(c);
  };
  const collapseAll = () => { setExpanded({}); setMonthExpanded({}); };

  const saveEditedSnapshot = () => {
    if (!editSnap) return;
    const { fyKey: _editFyKey, ...snapData } = editSnap;
    const qty = +editSnap.qty || 0;
    const buyPrice = +editSnap.buyPrice || 0;
    const sellPrice = +editSnap.sellPrice || 0;
    const costBasis = qty * buyPrice;
    const currentVal = qty * sellPrice;
    const pnl = currentVal - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    editSnapshot(_editFyKey, {
      ...snapData,
      company: (editSnap.company || "").trim(),
      ticker: (editSnap.ticker || "").trim().toUpperCase(),
      qty, buyPrice, sellPrice, currentVal, costBasis, pnl, pnlPct,
      brokerage: +editSnap.brokerage || 0,
      savedAt: editSnap.savedAt || TODAY(),
      buyDate: editSnap.buyDate || "",
      notes: editSnap.notes || "",
    });
    setEditSnap(null);
  };

  const totalSnapshots = fyKeys.reduce((s, fy) => s + (soldShareSnapshots[fy] || []).length, 0);

  if (!fyKeys.length) {
  return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "#6d28d9", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "TRADE HISTORY"),
          React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Previous Trades")
        )
      ),
      React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: "48px 24px" } },
        React.createElement("div", { style: { width: 60, height: 60, borderRadius: 16, background: "rgba(109,40,217,.1)", border: "1px solid rgba(109,40,217,.25)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 } }, Icons.save(28)),
        React.createElement("h3", { style: { fontSize: 16, fontWeight: 700, color: "var(--text2)", marginBottom: 8 } }, "No Trade Snapshots"),
        React.createElement("p", { style: { fontSize: 13, color: "var(--text5)", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" } }, "Go to Portfolio \u2192 click \"Save Snapshot\" on any active holding to capture its current values as a historical record here."),
        React.createElement("button", { onClick: importTrades, className: "stx-btn", style: { fontSize: 11, padding: "8px 16px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)" } }, "\u2b06 Import from JSON")
      )
    );
  }

  return React.createElement("div", null,
    /* ── Header ── */
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "#6d28d9", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "TRADE HISTORY"),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Previous Trades"),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", marginTop: 2 } }, totalSnapshots + " snapshot" + (totalSnapshots !== 1 ? "s" : "") + " across " + fyKeys.length + " financial year" + (fyKeys.length !== 1 ? "s" : ""))
      ),
      React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
        React.createElement("button", { onClick: exportTrades, className: "stx-btn", style: { fontSize: 10, padding: "5px 10px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)" } }, "\u2b07 Export"),
        React.createElement("button", { onClick: importTrades, className: "stx-btn", style: { fontSize: 10, padding: "5px 10px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)" } }, "\u2b06 Import"),
        React.createElement("button", { onClick: expandAll, className: "stx-btn stx-btn-ghost", style: { fontSize: 11, padding: "5px 10px" } }, "Expand All"),
        React.createElement("button", { onClick: collapseAll, className: "stx-btn stx-btn-ghost", style: { fontSize: 11, padding: "5px 10px" } }, "Collapse All")
      )
    ),

    /* ── FY groups ── */
    fyKeys.map((fy) => {
      const snaps = soldShareSnapshots[fy] || [];
      if (!snaps.length) return null;
      const isCollapsedFY = !expanded[fy];
      const totalPnl = snaps.reduce((s, sn) => s + sn.pnl, 0);
      const totalCost = snaps.reduce((s, sn) => s + sn.costBasis, 0);

      return React.createElement("div", { key: fy, style: { marginBottom: 24 } },
        /* ── FY header row ── */
        React.createElement("div", {
          onClick: () => toggleFY(fy),
          style: {
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderRadius: 10, marginBottom: isCollapsedFY ? 0 : 14, cursor: "pointer",
            background: "var(--bg4)", border: "1px solid var(--border2)", transition: "all .15s",
          }
        },
          React.createElement("span", { style: { fontSize: 12, color: "var(--text6)", transition: "transform .2s", display: "inline-block", transform: isCollapsedFY ? "rotate(-90deg)" : "rotate(0deg)" } }, "\u25bc"),
          React.createElement("span", { style: { fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 700, color: "var(--text)", flex: 1 } }, fy),
          React.createElement("span", { style: { fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "rgba(109,40,217,.1)", color: "#6d28d9", border: "1px solid rgba(109,40,217,.2)", fontWeight: 600 } }, snaps.length + " trade" + (snaps.length !== 1 ? "s" : "")),
          totalCost > 0 && React.createElement("span", { style: { fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 8, background: totalPnl >= 0 ? "var(--profitbg)" : "var(--lossbg)", color: totalPnl >= 0 ? "var(--profit)" : "var(--loss)", border: "1px solid " + (totalPnl >= 0 ? "var(--profitborder)" : "var(--lossborder)") } }, "Net P&L: " + (totalPnl >= 0 ? "+" : "") + INR(totalPnl))
        ),

        /* ── Month groups ── */
        !isCollapsedFY && (() => {
          const monthGroups = {};
          snaps.forEach((sn) => {
            const d = new Date(sn.savedAt + "T12:00:00");
            const mKey = fy + "-" + d.toLocaleString("en-IN", { month: "long" });
            const mLabel = d.toLocaleString("en-IN", { month: "long", year: "numeric" });
            if (!monthGroups[mKey]) monthGroups[mKey] = { label: mLabel, snaps: [] };
            monthGroups[mKey].snaps.push(sn);
          });
          const mKeys = Object.keys(monthGroups).sort((a, b) => {
            const aD = new Date(monthGroups[a].snaps[0].savedAt + "T12:00:00");
            const bD = new Date(monthGroups[b].snaps[0].savedAt + "T12:00:00");
            return bD - aD;
          });

          return mKeys.map((mk) => {
            const mg = monthGroups[mk];
            const mIsCollapsed = !monthExpanded[mk];
            const mPnl = mg.snaps.reduce((s, sn) => s + sn.pnl, 0);

            return React.createElement("div", { key: mk, style: { marginBottom: 12, marginLeft: 12, borderLeft: "2px solid var(--border2)", paddingLeft: 12 } },
              /* ── Month header ── */
              React.createElement("div", {
                onClick: () => toggleMonth(mk),
                style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, marginBottom: mIsCollapsed ? 0 : 8, cursor: "pointer", background: "var(--bg5)", border: "1px solid var(--border)", transition: "all .15s" }
              },
                React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", transition: "transform .2s", display: "inline-block", transform: mIsCollapsed ? "rotate(-90deg)" : "rotate(0deg)" } }, "\u25bc"),
                React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--text3)", flex: 1 } }, mg.label),
                React.createElement("span", { style: { fontSize: 10, padding: "2px 7px", borderRadius: 7, background: "rgba(109,40,217,.08)", color: "#6d28d9", border: "1px solid rgba(109,40,217,.15)", fontWeight: 600 } }, mg.snaps.length + " trade" + (mg.snaps.length !== 1 ? "s" : "")),
                React.createElement("span", { style: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 7, background: mPnl >= 0 ? "var(--profitbg)" : "var(--lossbg)", color: mPnl >= 0 ? "var(--profit)" : "var(--loss)", border: "1px solid " + (mPnl >= 0 ? "var(--profitborder)" : "var(--lossborder)") } }, (mPnl >= 0 ? "+" : "") + INR(mPnl))
              ),

              /* ── Snapshot cards ── */
              !mIsCollapsed && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 } },
                mg.snaps.map((sn, idx) => {
                  const isGain = sn.pnl >= 0;
                  const priceDiff = sn.sellPrice - sn.buyPrice;
                  const buyD = sn.buyDate ? new Date(sn.buyDate + "T12:00:00") : null;
                  const sellD = new Date(sn.savedAt + "T12:00:00");
                  const daysHeld = buyD ? Math.floor((sellD - buyD) / 86400000) : null;
                  const isLT = daysHeld !== null && daysHeld > 365;
                  const cgType = isLT ? "LTCG" : "STCG";
                  const taxRate = isLT ? "12.5%" : "20%";
                  const estTax = isLT ? Math.max(0, (sn.pnl - 100000) * 0.125) * 1.04 : sn.pnl > 0 ? sn.pnl * 0.20 * 1.04 : 0;

                  return React.createElement("div", { key: sn.id || idx, className: "stx-card", style: { border: "1px solid " + (isGain ? "var(--profitborder)" : "var(--lossborder)"), position: "relative", overflow: "hidden" } },
                    /* Snapshot badge */
                    React.createElement("div", { style: { position: "absolute", top: 10, right: 10, fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(109,40,217,.12)", color: "#6d28d9", border: "1px solid rgba(109,40,217,.25)", textTransform: "uppercase", letterSpacing: 0.5 } }, "Snapshot \u00b7 " + sn.savedAt),

                    /* Company + ticker */
                    React.createElement("div", { style: { marginBottom: 10 } },
                      React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4, paddingRight: 100 } }, sn.company),
                      React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
                        React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: "var(--r-pill)", fontSize: 11, fontWeight: 600, background: "var(--infobg)", border: "1px solid var(--infoborder)", color: "var(--info)" } }, sn.ticker || "\u2014"),
                        sn.buyDate && React.createElement("span", { style: { fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)" } }, "bought " + sn.buyDate)
                      )
                    ),

                    /* Price grid: Buy vs Sell */
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderRadius: 9, overflow: "hidden", marginBottom: 10, border: "1px solid var(--border)" } },
                      React.createElement("div", { style: { padding: "9px 12px", background: "var(--bg5)" } },
                        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, "Buy Price"),
                        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text3)" } }, "\u20b9" + Number(sn.buyPrice).toLocaleString("en-IN"))
                      ),
                      React.createElement("div", { style: { padding: "9px 12px", background: "var(--bg4)", textAlign: "right" } },
                        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, "Sell / Snapshot Price"),
                        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)", color: isGain ? "var(--profit)" : "var(--loss)" } }, "\u20b9" + Number(sn.sellPrice).toLocaleString("en-IN")),
                        React.createElement("div", { style: { fontSize: 10, color: isGain ? "var(--profit)" : "var(--loss)", fontWeight: 700, marginTop: 2 } }, (priceDiff >= 0 ? "+\u20b9" : "-\u20b9") + Math.abs(priceDiff).toFixed(2) + " / share")
                      )
                    ),

                    /* P&L box */
                    React.createElement("div", { style: { padding: "9px 12px", borderRadius: 9, marginBottom: 8, background: isGain ? "var(--profitbg)" : "var(--lossbg)", border: "1px solid " + (isGain ? "var(--profitborder)" : "var(--lossborder)"), display: "flex", justifyContent: "space-between", alignItems: "center" } },
                      React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: isGain ? "var(--profit)" : "var(--loss)", marginBottom: 2 } }, isGain ? "\u25b2 Profit" : "\u25bc Loss"),
                        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)" } }, sn.qty + " shares \u00b7 cost " + INR(sn.costBasis))
                      ),
                      React.createElement("div", { style: { textAlign: "right" } },
                        React.createElement("div", { style: { fontSize: 17, fontFamily: "var(--font-heading)", fontWeight: 800, color: isGain ? "var(--profit)" : "var(--loss)" } }, (isGain ? "+" : "") + INR(sn.pnl)),
                        React.createElement("div", { style: { fontSize: 11, color: isGain ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isGain ? "+" : "") + sn.pnlPct.toFixed(2) + "%")
                      )
                    ),

                    /* STCG/LTCG badge */
                    daysHeld !== null && daysHeld >= 0 && React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 9px", borderRadius: 7, marginBottom: 8, background: isLT ? "var(--profitbg)" : "var(--warnbg)", border: "1px solid " + (isLT ? "var(--profitborder)" : "var(--warnborder)"), fontSize: 11 } },
                      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                        React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: isLT ? "var(--profit)" : "var(--warn)", color: "#fff" } }, cgType),
                        React.createElement("span", { style: { color: "var(--text4)" } }, daysHeld + " days held \u00b7 " + taxRate)
                      ),
                      sn.pnl > 0 && estTax > 0 && React.createElement("span", { style: { color: "var(--loss)", fontWeight: 600, fontSize: 10 } }, "Est. tax: " + INR(Math.round(estTax)))
                    ),

                    /* Notes */
                    sn.notes && React.createElement("div", { style: { fontSize: 11, color: "var(--text4)", lineHeight: 1.5, padding: "6px 9px", borderRadius: 7, background: "var(--accentbg2)", border: "1px solid var(--border2)", marginBottom: 8, whiteSpace: "pre-wrap" } }, sn.notes),

                    /* Edit / Delete buttons */
                    React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 } },
                      React.createElement("button", {
                        onClick: () => setEditSnap({ ...sn, fyKey: fy, qty: String(sn.qty || ""), buyPrice: String(sn.buyPrice || ""), sellPrice: String(sn.sellPrice || ""), brokerage: String(sn.brokerage || 0) }),
                        style: { fontSize: 10, padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--infoborder)", background: "var(--infobg)", color: "var(--info)" }
                      }, Icons.edit(12), " Edit"),
                      React.createElement("button", {
                        onClick: async () => { if (await showConfirm("Remove this snapshot? This cannot be undone.")) deleteSnapshot(fy, sn.id); },
                        style: { fontSize: 10, padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--lossborder)", background: "var(--lossbg)", color: "var(--loss)" }
                      }, "\u00d7 Remove")
                    ),
                    React.createElement(SnapshotChartPanel, { sn: sn }),
                    sn.chartPts && sn.chartPts.length >= 2 && (() => {
                      const snIsGain = sn.pnl >= 0;
                      const snGradId = "snlg_" + (sn.id || "x").replace(/[^a-zA-Z0-9]/g, "_");
                      const snChartPts = sn.chartPts.map(p => ({ date: p.date, value: p.close != null ? (sn.qty || 0) * p.close : (p.value || 0) }));
                      if (snChartPts.length < 2) return null;
                      const snChgAbs = snChartPts[snChartPts.length - 1].value - snChartPts[0].value;
                      const snChgPct = snChartPts[0].value > 0 ? ((snChgAbs / snChartPts[0].value) * 100).toFixed(2) : "0.00";
                      const snChgCol = snChgAbs >= 0 ? "#16a34a" : "#ef4444";
                      return React.createElement("div", { style: { marginTop: 14, marginBottom: 8, background: "var(--bg5)", borderRadius: 12, padding: "14px 16px 10px", border: "1px solid var(--border2)" } },
                        React.createElement("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 8 } },
                          React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--text5)", textTransform: "uppercase", letterSpacing: .5 } }, "Holding Value History"),
                          React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", background: "var(--accentbg2)", border: "1px solid var(--border2)", borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap" } },
                            sn.chartPts[0].date + " \u2192 " + sn.chartPts[sn.chartPts.length - 1].date
                          ),
                          React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 } },
                            React.createElement("span", { style: { fontSize: 11, padding: "2px 8px", borderRadius: 7, fontWeight: 700, background: snChgAbs >= 0 ? "rgba(22,163,74,.12)" : "rgba(239,68,68,.12)", border: "1px solid " + (snChgAbs >= 0 ? "rgba(22,163,74,.25)" : "rgba(239,68,68,.25)"), color: snChgCol } }, (snChgAbs >= 0 ? "\u25b2 +" : "\u25bc ") + Math.abs(snChgPct) + "%"),
                            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, sn.chartPts.length + " days")
                          )
                        ),
                        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, marginBottom: 6, fontSize: 11, color: "var(--text6)" } },
                          React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 4 } },
                            React.createElement("span", { style: { display: "inline-block", width: 20, height: 3, background: snIsGain ? "#16a34a" : "#ef4444", borderRadius: 2, verticalAlign: "middle" } }),
                            "Holding value"
                          ),
                          React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 4 } },
                            React.createElement("span", { style: { display: "inline-block", width: 20, height: 0, borderTop: "3px dashed #f59e0b", verticalAlign: "middle" } }),
                            "Cost basis (" + INR(sn.costBasis) + ")"
                          )
                        ),
                        React.createElement(HoldingValueChart, { pts: snChartPts, qty: sn.qty, buyPrice: sn.buyPrice, color: snIsGain ? "#16a34a" : "#ef4444", gradId: snGradId })
                      );
                    })()
                  );
                })
              )
            );
          });
        })()
      );
    }),

    /* ── Edit Snapshot Modal ── */
    editSnap && React.createElement("div", { className: "modal-bd", onClick: (e) => { if (e.target === e.currentTarget) setEditSnap(null); } },
      React.createElement("div", { className: "stx-card stx-fu", style: { maxWidth: 520, margin: "40px auto", width: "92vw" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement("h2", { style: { fontSize: 17, fontWeight: 700, fontFamily: "var(--font-heading)" } }, "Edit Snapshot"),
          React.createElement("button", { onClick: () => setEditSnap(null), style: { background: "transparent", border: "none", color: "var(--text5)", cursor: "pointer", fontSize: 20 } }, "\u00d7")
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Company"),
            React.createElement("input", { className: "inp", value: editSnap.company || "", onChange: (e) => setEditSnap((p) => ({ ...p, company: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Ticker"),
            React.createElement("input", { className: "inp", value: editSnap.ticker || "", onChange: (e) => setEditSnap((p) => ({ ...p, ticker: e.target.value.toUpperCase() })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Quantity"),
            React.createElement("input", { className: "inp", type: "number", value: editSnap.qty, onChange: (e) => setEditSnap((p) => ({ ...p, qty: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Buy Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editSnap.buyPrice, onChange: (e) => setEditSnap((p) => ({ ...p, buyPrice: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Sell Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editSnap.sellPrice, onChange: (e) => setEditSnap((p) => ({ ...p, sellPrice: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Snapshot Date"),
            React.createElement("input", { className: "inp", type: "date", value: editSnap.savedAt || "", onChange: (e) => setEditSnap((p) => ({ ...p, savedAt: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Acquisition"),
            React.createElement("input", { className: "inp", type: "date", value: editSnap.buyDate || "", onChange: (e) => setEditSnap((p) => ({ ...p, buyDate: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Brokerage / Fees (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editSnap.brokerage || "", onChange: (e) => setEditSnap((p) => ({ ...p, brokerage: e.target.value })) })
          )
        ),
        React.createElement("div", { style: { marginTop: 12 } },
          React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Notes"),
          React.createElement("textarea", { className: "inp", value: editSnap.notes || "", onChange: (e) => setEditSnap((p) => ({ ...p, notes: e.target.value })), placeholder: "Broker, exchange, strategy notes\u2026", style: { resize: "vertical", minHeight: 60, lineHeight: 1.6, fontSize: 12 } })
        ),
        /* P&L preview */
        editSnap.qty && editSnap.buyPrice && editSnap.sellPrice && (() => {
          const pnl = (+editSnap.sellPrice - +editSnap.buyPrice) * (+editSnap.qty);
          const pnlPct = +editSnap.buyPrice > 0 ? ((+editSnap.sellPrice - +editSnap.buyPrice) / +editSnap.buyPrice * 100) : 0;
          const isG = pnl >= 0;
          return React.createElement("div", { style: { padding: "8px 12px", borderRadius: 8, marginTop: 12, background: isG ? "var(--profitbg)" : "var(--lossbg)", border: "1px solid " + (isG ? "var(--profitborder)" : "var(--lossborder)"), display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 } },
            React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", fontWeight: 600 } }, isG ? "\u25b2 Profit" : "\u25bc Loss"),
            React.createElement("span", { style: { fontWeight: 700, color: isG ? "var(--profit)" : "var(--loss)", fontFamily: "var(--font-heading)", fontSize: 14 } }, (isG ? "+" : "") + INR(pnl)),
            React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isG ? "+" : "") + pnlPct.toFixed(2) + "%")
          );
        })(),
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
          React.createElement("button", { className: "stx-btn stx-btn-primary", style: { flex: 1 }, onClick: saveEditedSnapshot }, "Save Changes"),
          React.createElement("button", { className: "stx-btn stx-btn-ghost", onClick: () => setEditSnap(null) }, "Cancel")
        )
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Entry Score Panel — Momentum Trading Entry Scoring Engine
   ══════════════════════════════════════════════════════════════════════════ */
const LS_ENTRY_SCORES = "mm_entry_scores";
const LS_ENTRY_SNAPSHOTS = "mm_entry_score_snapshots";
const LS_ENTRY_PERF_PRICES = "mm_entry_perf_prices";
const EntryScorePanel = ({ shares }) => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [entries, setEntries] = useState([]);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addTicker, setAddTicker] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [expandedIds, setExpandedIds] = useState({});
  const [viewingAnalysis, setViewingAnalysis] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const val = await dbGetSetting(LS_ENTRY_SCORES);
        if (val && Array.isArray(val)) {
          const backfilled = val.map(e => {
            let changed = false;
            let ne = e;
            if (!e.frozenResult && e.result) { ne = Object.assign({}, ne, { frozenResult: JSON.parse(JSON.stringify(e.result)) }); changed = true; }
            if (!ne.addedAt) { ne = Object.assign({}, ne, { addedAt: new Date(ne.id || Date.now()).toISOString() }); changed = true; }
            return ne;
          });
          setEntries(backfilled);
          const needsSave = backfilled.some((e, i) => e !== val[i]);
          if (needsSave) dbSetSetting(LS_ENTRY_SCORES, backfilled);
        }
      } catch {}
      setEntriesLoaded(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const val = await dbGetSetting(LS_ENTRY_SNAPSHOTS);
        if (val && Array.isArray(val)) setSnapshots(val);
      } catch {}
      setSnapshotsLoaded(true);
    })();
  }, []);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [expandedYear, setExpandedYear] = useState(null);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [perfTrackerExpanded, setPerfTrackerExpanded] = useState(false);
  const [perfTrackerRefreshing, setPerfTrackerRefreshing] = useState(false);
  const [perfTrackerPrices, setPerfTrackerPrices] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const val = await dbGetSetting(LS_ENTRY_PERF_PRICES);
        if (val && typeof val === "object" && Object.keys(val).length) setPerfTrackerPrices(val);
      } catch {}
    })();
  }, []);

  const saveEntries = (arr) => { setEntries(arr); dbSetSetting(LS_ENTRY_SCORES, arr); window.dispatchEvent(new CustomEvent("stox:data-changed")); };
  const deleteEntry = (id) => { saveEntries(entries.filter(e => e.id !== id)); };

  const refreshPerfTracker = async () => {
    if (!entries.length || perfTrackerRefreshing) return;
    setPerfTrackerRefreshing(true);
    const oldPrices = { ...perfTrackerPrices };
    const prices = {};
    for (const entry of entries) {
      try {
        const data = await fetchTickerPrice(entry.ticker);
        if (data && data.price > 0) prices[entry.ticker] = data.price;
      } catch {}
    }
    setPerfTrackerPrices(prices);
    dbSetSetting(LS_ENTRY_PERF_PRICES, prices);
    try { if (window.__fsa && window.__fsa.writeNow) await window.__fsa.writeNow(); } catch(e) {}
    setPerfTrackerRefreshing(false);
    const changes = [];
    const noChanges = [];
    entries.forEach(entry => {
      const oldPrice = oldPrices[entry.ticker];
      const newPrice = prices[entry.ticker];
      const priceOnAdd = entry.currentPrice || entry.frozenResult?.lastClose || entry.result?.lastClose || 0;
      if (!oldPrice || !newPrice || !priceOnAdd) { noChanges.push(entry.ticker); return; }
      const oldPct = ((oldPrice - priceOnAdd) / priceOnAdd * 100);
      const newPct = ((newPrice - priceOnAdd) / priceOnAdd * 100);
      const diff = Math.round((newPct - oldPct) * 100) / 100;
      const label = entry.ticker.replace(".NS", "");
      if (Math.abs(diff) >= 0.01) {
        const sign = diff > 0 ? "+" : "";
        changes.push(label + " " + sign + diff.toFixed(2) + "% (" + oldPct.toFixed(1) + "% \u2192 " + newPct.toFixed(1) + "%)");
      } else {
        noChanges.push(label);
      }
    });
    if (changes.length > 0) {
      var msg = "\u2713 " + changes.length + " % change" + (changes.length !== 1 ? "s" : "") + " updated: " + changes.join(", ");
      if (noChanges.length > 0) msg += " \u00b7 " + noChanges.length + " unchanged";
      showToast(msg, 0);
    } else {
      showToast("Prices refreshed \u2014 no % change updates", 0);
    }
  };

  useEffect(() => {
    if (!entries.length || !TI || !DF) return;
    const OLD_KEYWORDS = /Overbought|price up, volume down|bullish, weekly bearish|within 1% of upper|new 20d high with volume surge|all 3 timeframes bullish|institutional buying|rising OBV|ADX > 20 all|MTF alignment strong|declining on thin volume|within 1.5% of lower|held < 3 days with strong|> 3% below entry|> 1.5% below entry|below EMAs \+ MACD|institutional selling/;
    const stale = entries.filter(e => {
      if (!e.result) return false;
      if (!e.result.hardFilters || !e.result.hardFilters.length) return true;
      return e.result.hardFilters.some(f => OLD_KEYWORDS.test(f));
    });
    if (!stale.length) return;
    (async () => {
      const updated = [...entries];
      for (const entry of stale) {
        try {
          const tk = entry.ticker.toUpperCase();
          const [resW, resD, resH] = await Promise.all([DF.fetchOHLCVCached(tk, "weekly"), DF.fetchOHLCVCached(tk, "daily"), DF.fetchOHLCVCached(tk, "1h")]);
          if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) continue;
          const indW = TI.computeAll(resW.data);
          const indD = TI.computeAll(resD.data);
          const indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
          const result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 12 ? resH.data : null);
          if (result) result.lastClose = entry.currentPrice || resD.data[resD.data.length - 1].c;
          const idx = updated.findIndex(e => e.id === entry.id);
          if (idx >= 0) updated[idx] = { ...updated[idx], result, indicators: { weekly: indW, daily: indD, hourly: indH } };
        } catch (e) {}
      }
      saveEntries(updated);
    })();
  }, []);

  useEffect(() => {
    if (!entries.length || !TI || !DF || perfTrackerRefreshing) return;
    if (Object.keys(perfTrackerPrices).length > 0) return;
    (async () => {
      setPerfTrackerRefreshing(true);
      const prices = {};
      for (const entry of entries) {
        try {
          const data = await fetchTickerPrice(entry.ticker);
          if (data && data.price > 0) prices[entry.ticker] = data.price;
        } catch {}
      }
      setPerfTrackerPrices(prices);
      dbSetSetting(LS_ENTRY_PERF_PRICES, prices);
      try { if (window.__fsa && window.__fsa.writeNow) await window.__fsa.writeNow(); } catch(e) {}
      setPerfTrackerRefreshing(false);
    })();
  }, [entriesLoaded]);

  const refreshEntries = async () => {
    if (!entries.length || refreshing) return;
    setRefreshing(true);
    const oldScores = {};
    entries.forEach(e => { oldScores[e.ticker] = e.result ? e.result.finalScore : null; });
    const updated = [...entries];
    for (let i = 0; i < updated.length; i++) {
      const entry = updated[i];
      const tk = entry.ticker.toUpperCase();
      try {
        const [resW, resD, resH] = await Promise.all([
          DF.fetchOHLCVCached(tk, "weekly"),
          DF.fetchOHLCVCached(tk, "daily"),
          DF.fetchOHLCVCached(tk, "1h"),
        ]);
        if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) continue;
        const indW = TI.computeAll(resW.data);
        const indD = TI.computeAll(resD.data);
        const indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
        const lastClose = resD.data[resD.data.length - 1]?.close || entry.currentPrice || 0;
        const result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 12 ? resH.data : null);
        if (result) result.lastClose = lastClose;
        updated[i] = { ...updated[i], currentPrice: entry.currentPrice || lastClose, result, indicators: { weekly: indW, daily: indD, hourly: indH } };
      } catch {}
    }
    saveEntries(updated);
    setRefreshing(false);
    const changes = [];
    updated.forEach(e => {
      const old = oldScores[e.ticker];
      const now = e.result ? e.result.finalScore : null;
      if (old !== null && now !== null && old !== now) {
        const diff = Math.round((now - old) * 10) / 10;
        const sign = diff > 0 ? "+" : "";
        changes.push(e.ticker + " " + sign + diff + " (" + (e.result.decision ? e.result.decision.label : "") + ")");
      }
    });
    if (changes.length > 0) {
      showToast("\u2713 Scores updated: " + changes.join(", "), 0);
    } else {
      showToast("Entry scores refreshed \u2014 no changes", 0);
    }
  };

  const exportEntryScores = () => {
    const payload = {
      app: "StoX",
      type: "entry-scores",
      version: 1,
      exportDate: new Date().toISOString(),
      entries: entries,
      snapshots: snapshots,
      perfTrackerPrices: perfTrackerPrices
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stox-entry-scores-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported " + entries.length + " entries" + (snapshots.length ? " + " + snapshots.length + " snapshots" : ""), 3000);
  };

  const importEntryScores = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.type !== "entry-scores" || !Array.isArray(data.entries)) {
          showToast("Invalid entry score file", 3000);
          return;
        }
        if (!await showConfirm("Import " + data.entries.length + " entry scores" + (data.snapshots && data.snapshots.length ? " + " + data.snapshots.length + " snapshots" : "") + "?\nExisting entries with the same ticker will be replaced.")) return;
        const localMap = {};
        entries.forEach(e => { localMap[e.id] = e; });
        const importedMap = {};
        data.entries.forEach(e => { importedMap[e.id] = e; });
        const merged = data.entries.map(imp => {
          const local = entries.find(e => e.ticker === imp.ticker && e.id !== imp.id);
          if (local) {
            return Object.assign({}, imp, {
              id: local.id,
              currentPrice: local.currentPrice,
              addedAt: local.addedAt,
              frozenResult: local.frozenResult || imp.frozenResult,
              result: local.result || imp.result,
              indicators: local.indicators || imp.indicators
            });
          }
          return imp;
        });
        entries.forEach(e => {
          if (!importedMap[e.id] && !data.entries.find(ie => ie.ticker === e.ticker)) {
            merged.push(e);
          }
        });
        saveEntries(merged);
        if (data.snapshots && Array.isArray(data.snapshots)) {
          const snapMap = {};
          snapshots.forEach(s => { snapMap[s.id] = s; });
          data.snapshots.forEach(s => { snapMap[s.id] = s; });
          const mergedSnaps = Object.values(snapMap);
          saveSnapshots(mergedSnaps);
        }
        if (data.perfTrackerPrices && typeof data.perfTrackerPrices === "object") {
          setPerfTrackerPrices(data.perfTrackerPrices);
          dbSetSetting(LS_ENTRY_PERF_PRICES, data.perfTrackerPrices);
          window.dispatchEvent(new CustomEvent("stox:data-changed"));
        }
        showToast("Imported " + data.entries.length + " entries successfully", 3000);
      } catch (err) {
        showToast("Import failed: " + err.message, 5000);
      }
    };
    input.click();
  };

  const saveSnapshots = (arr) => { setSnapshots(arr); dbSetSetting(LS_ENTRY_SNAPSHOTS, arr); window.dispatchEvent(new CustomEvent("stox:data-changed")); };
  const saveSnapshot = (entry) => {
    const snap = { id: Date.now(), ticker: entry.ticker, currentPrice: entry.currentPrice, savedAt: new Date().toISOString(), result: JSON.parse(JSON.stringify(entry.result)), indicators: entry.indicators ? JSON.parse(JSON.stringify(entry.indicators)) : null, entryAddedAt: entry.addedAt };
    saveSnapshots([snap, ...snapshots]);
  };
  const deleteSnapshot = (id) => { saveSnapshots(snapshots.filter(s => s.id !== id)); };
  const deleteSnapshotsWhere = (pred) => { saveSnapshots(snapshots.filter(s => !pred(s))); };

  const groupSnapshots = () => {
    const years = {};
    snapshots.forEach(snap => {
      const d = new Date(snap.savedAt);
      const yKey = String(d.getFullYear());
      const mKey = yKey + "-" + d.toLocaleString("en-IN", { month: "long" });
      const dayKey = mKey + "-" + d.getDate();
      const dayLabel = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      if (!years[yKey]) years[yKey] = {};
      if (!years[yKey][mKey]) years[yKey][mKey] = {};
      if (!years[yKey][mKey][dayKey]) years[yKey][mKey][dayKey] = { label: dayLabel, snaps: [] };
      years[yKey][mKey][dayKey].snaps.push(snap);
    });
    return years;
  };

  const fetchAndScore = async () => {
    if (!addTicker.trim()) { setAddErr("Enter a ticker."); return; }
    setAdding(true); setAddErr("");
    try {
      const tk = addTicker.trim().toUpperCase();
      const [resW, resD, resH] = await Promise.all([
        DF.fetchOHLCVCached(tk, "weekly"),
        DF.fetchOHLCVCached(tk, "daily"),
        DF.fetchOHLCVCached(tk, "1h"),
      ]);
      if (!resW.data || resW.data.length < 12) { setAddErr("Insufficient weekly data for " + tk); setAdding(false); return; }
      if (!resD.data || resD.data.length < 12) { setAddErr("Insufficient daily data for " + tk); setAdding(false); return; }
      const lastDailyClose = resD.data[resD.data.length - 1].c;
      const price = parseFloat(addPrice) || lastDailyClose || 0;
      const indW = TI.computeAll(resW.data);
      const indD = TI.computeAll(resD.data);
      const indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
      const result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 12 ? resH.data : null);
      if (result) result.lastClose = lastDailyClose;
      const entry = { id: Date.now(), ticker: tk, currentPrice: price, addedAt: new Date().toISOString(), result, frozenResult: JSON.parse(JSON.stringify(result || {})), indicators: { weekly: indW, daily: indD, hourly: indH } };
      saveEntries([entry, ...entries]);
      setAddTicker(""); setAddPrice(""); setShowAdd(false);
    } catch (e) { setAddErr("Error: " + (e.message || "Failed")); }
    setAdding(false);
  };

  const factorBar = (label, val, max, color, hasNeg) => {
    const pct = max > 0 ? (Math.abs(val) / max * 100) : 0;
    const barColor = val < 0 ? "#ef4444" : color;
    return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
      React.createElement("span", { style: { width: 90, fontSize: 9, fontWeight: 600, color: "var(--text4)", textAlign: "right", flexShrink: 0 } }, label),
      React.createElement("div", { style: { flex: 1, height: 5, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
        React.createElement("div", { style: { width: pct + "%", height: "100%", borderRadius: 3, background: barColor, transition: "width .3s" } })
      ),
      React.createElement("span", { style: { width: 38, fontSize: 9, fontWeight: 700, color: val < 0 ? "#ef4444" : "var(--text4)", fontFamily: "var(--font-mono)", textAlign: "right" } }, (val >= 0 ? "+" : "") + val + "/" + max)
    );
  };

  const tfSection = (label, score) => {
    if (!score) return React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", padding: "4px 0" } }, label + ": No data");
    return React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 } },
        React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: "var(--text3)" } }, label),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
          React.createElement("span", { style: { fontSize: 11, fontWeight: 800, color: score.decision.color, fontFamily: "var(--font-heading)" } }, score.total + " · " + score.decision.label)
        )
      ),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
        factorBar("Trend", score.trendScore, score.trendMax, "#3b82f6", false),
        factorBar("Momentum", score.momentumScore, score.momentumMax, "#a855f7", false),
        factorBar("Volume", score.volumeScore, score.volumeMax, "#06b6d4", false),
        factorBar("Structure", score.structureScore, score.structureMax, "#ec4899", false)
      )
    );
  };

  const [snapExpanded, setSnapExpanded] = useState({});
  const [snapTech, setSnapTech] = useState({});

  const snapshotCard = (snap) => {
    const r = snap.result;
    const ind = snap.indicators || {};
    const isExp = !!snapExpanded[snap.id];
    const isTech = !!snapTech[snap.id];
    const snapFactorBar = (label, val, max, color) => {
      if (val == null || max == null) return null;
      const pct = max > 0 ? (Math.abs(val) / max * 100) : 0;
      const barColor = val < 0 ? "#ef4444" : color;
      return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
        React.createElement("span", { style: { width: 65, fontSize: 8, fontWeight: 600, color: "var(--text5)", textAlign: "right", flexShrink: 0 } }, label),
        React.createElement("div", { style: { flex: 1, height: 4, borderRadius: 2, background: "var(--bg5)", overflow: "hidden" } },
          React.createElement("div", { style: { width: pct + "%", height: "100%", borderRadius: 2, background: barColor } })
        ),
        React.createElement("span", { style: { width: 32, fontSize: 8, fontWeight: 700, color: val < 0 ? "#ef4444" : "var(--text5)", fontFamily: "var(--font-mono)", textAlign: "right" } }, (val >= 0 ? "+" : "") + val + "/" + max)
      );
    };
    const snapTfSection = (label, score) => {
      if (!score) return null;
      return React.createElement("div", { style: { marginBottom: 6 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 } },
          React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: "var(--text3)" } }, label),
          React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: score.decision.color, fontFamily: "var(--font-heading)" } }, score.total + " · " + score.decision.label)
        ),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
          snapFactorBar("Trend", score.trendScore, score.trendMax, "#3b82f6"),
          snapFactorBar("Momentum", score.momentumScore, score.momentumMax, "#a855f7"),
          snapFactorBar("Volume", score.volumeScore, score.volumeMax, "#06b6d4"),
          snapFactorBar("Structure", score.structureScore, score.structureMax, "#ec4899")
        )
      );
    };
    const indRow = (label, val, signal) => {
      if (val == null) return null;
      const sigColor = signal === "bullish" ? "#22c55e" : signal === "bearish" ? "#ef4444" : signal === "overbought" ? "#f59e0b" : signal === "oversold" ? "#3b82f6" : "var(--text5)";
      return React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" } },
        React.createElement("span", { style: { fontSize: 9, color: "var(--text5)" } }, label),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
          React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: "var(--text3)", fontFamily: "var(--font-mono)" } }, typeof val === "number" ? val.toFixed(2) : "\u2014"),
          signal && React.createElement("span", { style: { fontSize: 7, fontWeight: 700, color: sigColor, padding: "1px 4px", borderRadius: 3, background: sigColor + "15" } }, signal)
        )
      );
    };
    const renderIndicators = (indData) => {
      if (!indData) return React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", padding: "4px 0" } }, "No data");
      const lc = indData.lastClose;
      return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px" } },
        indRow("RSI (14)", indData.rsi_14, indData.rsi_14 > 70 ? "overbought" : indData.rsi_14 < 30 ? "oversold" : "neutral"),
        indRow("ADX (14)", indData.adx_14, indData.adx_14 > 25 ? "trending" : "ranging"),
        indRow("MACD", indData.macd ? indData.macd.macd : null, indData.macd && indData.macd.histogram > 0 ? "bullish" : "bearish"),
        indRow("MACD Signal", indData.macd ? indData.macd.signal : null),
        indRow("EMA 9", indData.ema_9, lc && indData.ema_9 ? lc > indData.ema_9 ? "bullish" : "bearish" : null),
        indRow("EMA 21", indData.ema_21, lc && indData.ema_21 ? lc > indData.ema_21 ? "bullish" : "bearish" : null),
        indRow("EMA 50", indData.ema_50, lc && indData.ema_50 ? lc > indData.ema_50 ? "bullish" : "bearish" : null),
        indRow("SMA 20", indData.sma_20, lc && indData.sma_20 ? lc > indData.sma_20 ? "bullish" : "bearish" : null),
        indRow("SMA 50", indData.sma_50, lc && indData.sma_50 ? lc > indData.sma_50 ? "bullish" : "bearish" : null),
        indRow("Supertrend", indData.supertrend, lc && indData.supertrend ? lc > indData.supertrend ? "bullish" : "bearish" : null),
        indRow("ATR (14)", indData.atr_14),
        indRow("CCI (20)", indData.cci_20, indData.cci_20 > 100 ? "overbought" : indData.cci_20 < -100 ? "oversold" : "neutral"),
        indRow("MFI (14)", indData.mfi_14, indData.mfi_14 > 80 ? "overbought" : indData.mfi_14 < 20 ? "oversold" : "neutral"),
        indRow("Stoch RSI K", indData.stochRSI ? indData.stochRSI.k : null, indData.stochRSI && indData.stochRSI.k > 80 ? "overbought" : indData.stochRSI && indData.stochRSI.k < 20 ? "oversold" : "neutral"),
        indRow("BB Upper", indData.bb ? indData.bb.upper : null),
        indRow("BB Lower", indData.bb ? indData.bb.lower : null),
        indRow("OBV", indData.obv),
        indRow("VWAP", indData.vwap),
        indRow("ROC (10)", indData.roc_10, indData.roc_10 > 0 ? "bullish" : "bearish"),
        indRow("PSAR", indData.psar, lc && indData.psar ? lc > indData.psar ? "bullish" : "bearish" : null),
        indRow("WMA 20", indData.wma_20),
        indRow("HMA (20)", indData.hma_20),
        indRow("KAMA 10", indData.kama_10),
        indRow("CMF (20)", indData.cmf_20, indData.cmf_20 > 0 ? "bullish" : "bearish"),
        indRow("TSI", indData.tsi, indData.tsi > 0 ? "bullish" : "bearish"),
        indRow("STC", indData.stc, indData.stc > 0 ? "bullish" : "bearish"),
        indRow("KVO", indData.kvo, indData.kvo > 0 ? "bullish" : "bearish"),
        indRow("PVT", indData.pvt),
        indRow("Chandelier Long", indData.chandelier ? indData.chandelier.long : null, lc && indData.chandelier && indData.chandelier.long ? lc > indData.chandelier.long ? "bullish" : "bearish" : null),
        indRow("Chandelier Short", indData.chandelier ? indData.chandelier.short : null, lc && indData.chandelier && indData.chandelier.short ? lc > indData.chandelier.short ? "bullish" : "bearish" : null),
        indRow("Choppiness", indData.choppiness, indData.choppiness != null ? indData.choppiness < 38.2 ? "trending" : indData.choppiness > 61.8 ? "ranging" : "neutral" : null),
        indRow("Williams %R", indData.williamsR, indData.williamsR != null ? indData.williamsR > -20 ? "overbought" : indData.williamsR < -80 ? "oversold" : "neutral" : null),
        indRow("Awesome Osc", indData.awesomeOsc, indData.awesomeOsc != null ? indData.awesomeOsc > 0 ? "bullish" : "bearish" : null),
        indRow("Force Index", indData.forceIndex, indData.forceIndex != null ? indData.forceIndex > 0 ? "bullish" : "bearish" : null),
        indRow("Aroon Up", indData.aroon ? indData.aroon.up : null),
        indRow("Aroon Down", indData.aroon ? indData.aroon.down : null),
        indRow("Aroon Osc", indData.aroon ? indData.aroon.osc : null, indData.aroon && indData.aroon.osc != null ? indData.aroon.osc > 50 ? "bullish" : indData.aroon.osc < -50 ? "bearish" : "neutral" : null),
        indRow("Vortex +", indData.vortex ? indData.vortex.plus : null),
        indRow("Vortex -", indData.vortex ? indData.vortex.minus : null, indData.vortex && indData.vortex.plus != null && indData.vortex.minus != null ? indData.vortex.plus > indData.vortex.minus ? "bullish" : "bearish" : null),
        indRow("HA Trend", indData.heikinAshi ? indData.heikinAshi.trend : null, indData.heikinAshi ? indData.heikinAshi.trend : null),
        indRow("52W %From High", indData.week52HL ? indData.week52HL.pctFromHigh : null, indData.week52HL ? indData.week52HL.pctFromHigh > -5 ? "bullish" : indData.week52HL.pctFromHigh > -15 ? "neutral" : "bearish" : null),
        indRow("52W High", indData.week52HL ? indData.week52HL.high52w : null),
        indRow("52W Low", indData.week52HL ? indData.week52HL.low52w : null)
      );
    };
    return React.createElement("div", { key: snap.id, style: { padding: 12, borderRadius: 10, background: "var(--bg4)", border: "1px solid var(--border)", marginBottom: 8 } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, snap.ticker),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } }, "\u23f0 " + new Date(snap.savedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 1 } }, "\u2022 Price: " + (snap.currentPrice > 0 ? INR(snap.currentPrice) : (r.lastClose ? INR(r.lastClose) + " (Last Close)" : "Last Close")))
        ),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
          React.createElement("div", { textAlign: "right" },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, "Score"),
            React.createElement("div", { style: { fontSize: 20, fontWeight: 900, color: r.decision.color, fontFamily: "var(--font-heading)", lineHeight: 1 } }, r.finalScore)
          ),
          React.createElement("div", { onClick: () => deleteSnapshot(snap.id), style: { cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--text6)", fontSize: 14, title: "Delete snapshot" } }, "\u2715")
        )
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, background: r.decision.color + "12", marginBottom: 6 } },
        React.createElement("span", { style: { fontSize: 11, fontWeight: 800, color: r.decision.color, fontFamily: "var(--font-heading)" } }, r.decision.label),
        React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text5)", fontStyle: "italic" } }, r.decision.position),
        r.hardFilters && r.hardFilters.length > 0 && React.createElement("span", { style: { fontSize: 8, fontWeight: 700, color: "#ef4444", padding: "1px 4px", borderRadius: 3, background: "rgba(239,68,68,.1)" } }, r.hardFilters.length + " filter")
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 } },
        ["weekly", "daily", "hourly"].map(tf => {
          const s = r[tf];
          const label = tf === "weekly" ? "Weekly" : tf === "daily" ? "Daily" : "Hourly";
          return React.createElement("div", { key: tf, style: { padding: "4px 6px", borderRadius: 6, background: "var(--bg5)", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 8, fontWeight: 600, color: "var(--text5)", marginBottom: 1 } }, label),
            React.createElement("div", { style: { fontSize: 12, fontWeight: 800, color: s ? s.decision.color : "var(--text6)", fontFamily: "var(--font-heading)" } }, s ? s.total : "N/A"),
            s && React.createElement("div", { style: { fontSize: 8, color: s.decision.color, fontWeight: 600 } }, s.decision.label)
          );
        })
      ),
      React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 12, marginTop: 8 } },
        React.createElement("div", { onClick: () => setSnapExpanded(p => ({ ...p, [snap.id]: !p[snap.id] })), style: { fontSize: 9, color: "var(--accent)", cursor: "pointer", fontWeight: 600 } },
          isExp ? "\u25b2 Hide Details" : "\u25bc Show Details"
        ),
        ind && React.createElement("div", { onClick: () => setSnapTech(p => ({ ...p, [snap.id]: !p[snap.id] })), style: { fontSize: 9, color: isTech ? "var(--text5)" : "#f97316", cursor: "pointer", fontWeight: 600 } },
          "\u26a1 " + (isTech ? "Hide Technicals" : "Technicals")
        )
      ),
      isExp && React.createElement("div", { style: { marginTop: 8, padding: "6px 0" } },
        r.daily && snapTfSection("Daily (50%)", r.daily),
        r.weekly && snapTfSection("Weekly (30%)", r.weekly),
        r.hourly && snapTfSection("Hourly (20%)", r.hourly),
        r.hardFilters && r.hardFilters.length > 0 && React.createElement("div", { style: { marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)" } },
          React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text3)", marginBottom: 3 } }, "Penalties & Bonuses"),
          r.hardFilters.map((f, i) => {
            var isBonus = f.indexOf("(+") >= 0;
            var valMatch = f.match(/\([+\-\u2212]?\d+\)$/);
            var valStr = valMatch ? valMatch[0] : "";
            var label = valStr ? f.replace(valStr, "").replace(/\s*—\s*/, " — ").trim() : f;
            return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, fontSize: 9, lineHeight: 1.4 } },
              React.createElement("span", { style: { color: "var(--text3)", flex: 1, minWidth: 0, overflow: "hidden", wordBreak: "break-word" } }, isBonus ? "\u2713 " + label : "\u26a0 " + label),
              valStr && React.createElement("span", { style: { fontSize: 9, fontWeight: 800, color: "var(--text3)", background: "var(--bg4)", padding: "1px 5px", borderRadius: 3, fontFamily: "var(--font-mono)", flexShrink: 0 } }, valStr)
            );
          }),
          React.createElement("div", { style: { fontSize: 8, color: "var(--text5)", marginTop: 3 } },
            "Base: " + r.baseScore + " | Penalties: " + r.penalties + " | Bonuses: " + r.bonuses + " \u2192 Final: " + r.finalScore
          )
        )
      ),
      isTech && ind && React.createElement("div", { style: { marginTop: 8, padding: 8, borderRadius: 8, background: "var(--bg5)", border: "1px solid var(--border)" } },
        React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text4)", marginBottom: 6 } }, "Technical Indicators"),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
          ind.weekly && React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--text5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: .5 } }, "Weekly"),
            renderIndicators(ind.weekly)
          ),
          ind.daily && React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--text5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: .5 } }, "Daily"),
            renderIndicators(ind.daily)
          ),
          ind.hourly && React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--text5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: .5 } }, "Hourly"),
            renderIndicators(ind.hourly)
          )
        )
      )
    );
  };

  const renderSnapshots = () => {
    const grouped = groupSnapshots();
    const yKeys = Object.keys(grouped).sort().reverse();
    if (yKeys.length === 0) return React.createElement("div", { style: { textAlign: "center", padding: 30, color: "var(--text6)", fontSize: 12 } }, "No saved snapshots yet.");
    return yKeys.map(yKey => {
      const months = grouped[yKey];
      const isYExp = expandedYear === yKey;
      const totalSnaps = Object.values(months).reduce((a, m) => a + Object.values(m).reduce((b, d) => b + d.snaps.length, 0), 0);
      return React.createElement("div", { key: yKey, style: { marginBottom: 10, borderRadius: 10, background: "var(--bg3)", border: "1px solid var(--border)", overflow: "hidden" } },
        React.createElement("div", { onClick: () => setExpandedYear(isYExp ? null : yKey), style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", cursor: "pointer", background: isYExp ? "var(--bg4)" : "transparent" } },
          React.createElement("span", { style: { fontSize: 13, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)" } }, (isYExp ? "\u25be " : "\u25b8 ") + yKey),
          React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, totalSnaps + " snapshot" + (totalSnaps !== 1 ? "s" : ""))
        ),
        isYExp && Object.keys(months).sort().reverse().map(mKey => {
          const days = months[mKey];
          const isMExp = expandedMonth === mKey;
          const mSnaps = Object.values(days).reduce((a, d) => a + d.snaps.length, 0);
          return React.createElement("div", { key: mKey, style: { borderTop: "1px solid var(--border)" } },
            React.createElement("div", { onClick: () => setExpandedMonth(isMExp ? null : mKey), style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px 8px 28px", cursor: "pointer", background: isMExp ? "var(--bg4)" : "transparent" } },
              React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, (isMExp ? "\u25be " : "\u25b8 ") + mKey.split("-").slice(1).join("-")),
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, mSnaps + " snap" + (mSnaps !== 1 ? "s" : "")),
                React.createElement("span", { onClick: async (e) => { e.stopPropagation(); if (await showConfirm("Delete all " + mSnaps + " snapshot" + (mSnaps !== 1 ? "s" : "") + " in " + mKey.split("-").slice(1).join("-") + "?")) deleteSnapshotsWhere(s => { const d = new Date(s.savedAt); return String(d.getFullYear()) + "-" + d.toLocaleString("en-IN", { month: "long" }) === mKey; }); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, mSnaps === 1 ? "Delete" : "Delete All")
              )
            ),
            isMExp && Object.keys(days).sort().reverse().map(dayKey => {
              const day = days[dayKey];
              const isDExp = expandedDay === dayKey;
              return React.createElement("div", { key: dayKey, style: { borderTop: "1px solid var(--border)" } },
                React.createElement("div", { onClick: () => setExpandedDay(isDExp ? null : dayKey), style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 14px 6px 42px", cursor: "pointer", background: isDExp ? "var(--bg4)" : "transparent" } },
                  React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--text3)" } }, (isDExp ? "\u25be " : "\u25b8 ") + day.label),
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                    React.createElement("span", { style: { fontSize: 9, color: "var(--text5)" } }, day.snaps.length + " snap" + (day.snaps.length !== 1 ? "s" : "")),
                    React.createElement("span", { onClick: async (e) => { e.stopPropagation(); if (await showConfirm("Delete all " + day.snaps.length + " snapshot" + (day.snaps.length !== 1 ? "s" : "") + " on " + day.label + "?")) deleteSnapshotsWhere(s => { const d = new Date(s.savedAt); const dk = mKey + "-" + d.getDate(); return dk === dayKey; }); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, day.snaps.length === 1 ? "Delete" : "Delete All")
                  )
                ),
                isDExp && React.createElement("div", { style: { padding: "6px 14px 6px 56px" } },
                  day.snaps.map(snap => snapshotCard(snap))
                )
              );
            })
          );
        })
      );
    });
  };

  return React.createElement("div", null,
    viewingAnalysis && React.createElement(EntryScoreAnalysis, {
      entry: viewingAnalysis,
      onBack: () => setViewingAnalysis(null)
    }),
    !viewingAnalysis && React.createElement(React.Fragment, null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Entry Score"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } }, "Momentum Trading Entry Engine \u00b7 Weekly(30%) + Daily(50%) + Hourly(20%)")
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        React.createElement("button", {
          onClick: exportEntryScores, disabled: !entries.length,
          className: "stx-btn",
          style: { fontSize: 10, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: entries.length ? "pointer" : "default", opacity: entries.length ? 1 : 0.5 }
        }, "\u2b07 Export"),
        React.createElement("button", {
          onClick: importEntryScores,
          className: "stx-btn",
          style: { fontSize: 10, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" }
        }, "\u2b06 Import"),
        React.createElement("button", {
          onClick: refreshEntries, disabled: refreshing || !entries.length,
          className: "stx-btn stx-btn-ghost",
          style: { fontSize: 12, padding: "8px 14px", opacity: refreshing || !entries.length ? 0.5 : 1, cursor: refreshing ? "wait" : "pointer" }
        }, refreshing ? "Refreshing..." : "\u21bb Refresh"),
        React.createElement("button", { onClick: () => setShowAdd(true), className: "stx-btn stx-btn-primary", style: { fontSize: 12, padding: "8px 16px" } },
          "+ Add Entry"
        )
      )
    ),
    showAdd && React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 } }, "Add New Entry"),
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Ticker"),
          React.createElement("input", { className: "inp", type: "text", placeholder: "e.g. RELIANCE", value: addTicker, onChange: e => setAddTicker(e.target.value.toUpperCase()), style: { width: 140 } })
        ),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Current Price (\u20b9) (optional)"),
          React.createElement("input", { className: "inp", type: "number", placeholder: "Optional \u2014 uses last close", value: addPrice, onChange: e => setAddPrice(e.target.value), style: { width: 120 } })
        ),
        React.createElement("button", {
          onClick: fetchAndScore, disabled: adding, className: "stx-btn stx-btn-primary",
          style: { padding: "8px 18px", fontSize: 12, opacity: adding ? 0.6 : 1, cursor: adding ? "wait" : "pointer" }
        }, adding ? "Calculating..." : "Calculate Score"),
        React.createElement("button", { onClick: () => { setShowAdd(false); setAddErr(""); }, className: "stx-btn stx-btn-ghost", style: { fontSize: 12 } }, "Cancel")
      ),
      addErr && React.createElement("div", { style: { marginTop: 8, fontSize: 11, color: addErr.startsWith("Error") ? "#ef4444" : "#eab308" } }, addErr)
    ),
    entries.length === 0 && React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: 40, color: "var(--text6)", fontSize: 13 } },
      "No entry scores yet. Click \"+ Add Entry\" to analyze a stock."
    ),
    (() => {
      var sortedEntries = entries.slice().sort(function(a, b) { return new Date(b.addedAt) - new Date(a.addedAt); });
      var monthGroups = {};
      sortedEntries.forEach(function(entry) {
        var d = new Date(entry.addedAt);
        var monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        var dayKey = monthKey + "-" + String(d.getDate()).padStart(2, "0");
        var monthLabel = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        var dayLabel = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        if (!monthGroups[monthKey]) monthGroups[monthKey] = { label: monthLabel, days: {} };
        if (!monthGroups[monthKey].days[dayKey]) monthGroups[monthKey].days[dayKey] = { label: dayLabel, entries: [] };
        monthGroups[monthKey].days[dayKey].entries.push(entry);
      });
      var monthKeys = Object.keys(monthGroups).sort().reverse();
      var totalGroups = monthKeys.length;
      var expandedCount = 0;
      monthKeys.forEach(function(mk) {
        if (expandedGroups[mk]) { expandedCount++; return; }
        Object.keys(monthGroups[mk].days).forEach(function(dk) {
          if (expandedGroups[dk]) expandedCount++;
        });
      });
      var allExpanded = expandedCount > 0;
      var toggleAll = function() {
        if (allExpanded) { setExpandedGroups({}); }
        else {
          var newExpanded = {};
          monthKeys.forEach(function(mk) { newExpanded[mk] = true; });
          setExpandedGroups(newExpanded);
        }
      };
      var renderEntryCard = function(entry) {
        var r = entry.result;
        var isExpanded = !!expandedIds[entry.id];
        return React.createElement("div", { key: entry.id, className: "stx-card", style: { border: "2px solid " + r.decision.color + "33" } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 } },
            React.createElement("div", null,
              React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, entry.ticker),
              React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } }, "Added " + new Date(entry.addedAt).toLocaleDateString() + " \u00b7 " + (entry.currentPrice > 0 ? INR(entry.currentPrice) : (r.lastClose ? INR(r.lastClose) + " (Last Close)" : "Last Close")))
            ),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
              React.createElement("div", { textAlign: "right" },
                React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, "Final Score"),
                React.createElement("div", { style: { fontSize: 22, fontWeight: 900, color: r.decision.color, fontFamily: "var(--font-heading)", lineHeight: 1 } }, r.finalScore)
              ),
              React.createElement("div", { onClick: function() { saveSnapshot(entry); }, style: { cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--accent)", fontSize: 13, title: "Save Snapshot" } }, Icons.save(14)),
              React.createElement("div", { onClick: function() { deleteEntry(entry.id); }, style: { cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--text6)", fontSize: 14 }, title: "Delete" }, Icons.trash(14))
            )
          ),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "6px 10px", borderRadius: 8, background: r.decision.color + "12" } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 800, color: r.decision.color, fontFamily: "var(--font-heading)" } }, r.decision.label),
            React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text5)", fontStyle: "italic" } }, r.decision.position),
            r.hardFilters && r.hardFilters.length > 0 && React.createElement("span", { style: { fontSize: 8, fontWeight: 700, color: "#ef4444", padding: "2px 5px", borderRadius: 3, background: "rgba(239,68,68,.1)" } }, r.hardFilters.length + " filter" + (r.hardFilters.length > 1 ? "s" : ""))
          ),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 } },
            ["weekly", "daily", "hourly"].map(function(tf) {
              var s = r[tf];
              var label = tf === "weekly" ? "Weekly (30%)" : tf === "daily" ? "Daily (50%)" : "Hourly (20%)";
              return React.createElement("div", { key: tf, style: { padding: "6px 8px", borderRadius: 8, background: "var(--bg4)", textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: "var(--text5)", marginBottom: 2 } }, label),
                React.createElement("div", { style: { fontSize: 14, fontWeight: 800, color: s ? s.decision.color : "var(--text6)", fontFamily: "var(--font-heading)" } }, s ? s.total : "N/A"),
                s && React.createElement("div", { style: { fontSize: 8, color: s.decision.color, fontWeight: 600 } }, s.decision.label)
              );
            })
          ),
          React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 12, marginBottom: 6 } },
            React.createElement("div", { onClick: function() { setExpandedIds(function(prev) { var next = Object.assign({}, prev); next[entry.id] = !next[entry.id]; return next; }); }, style: { fontSize: 10, color: "var(--accent)", cursor: "pointer", fontWeight: 600 } },
              isExpanded ? "\u25b2 Hide Details" : "\u25bc Show Details"
            ),
            window.TechnicalIndicatorsInline && React.createElement("div", { onClick: function() { setViewingAnalysis(viewingAnalysis && viewingAnalysis.id === entry.id ? null : entry); }, style: { fontSize: 10, color: "#f97316", cursor: "pointer", fontWeight: 600 } },
              "\u26a1 Technicals"
            )
          ),
          isExpanded && React.createElement("div", { style: { marginTop: 8 } },
            r.daily && tfSection("Daily Breakdown", r.daily),
            r.weekly && tfSection("Weekly Breakdown", r.weekly),
            r.hourly && tfSection("Hourly Breakdown", r.hourly),
            r.hardFilters && r.hardFilters.length > 0 && React.createElement("div", { style: { marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)" } },
              React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "var(--text3)", marginBottom: 4 } }, "Penalties & Bonuses"),
              r.hardFilters.map(function(f, i) {
                var isBonus = f.indexOf("(+") >= 0;
                var valMatch = f.match(/\([+\-\u2212]?\d+\)$/);
                var valStr = valMatch ? valMatch[0] : "";
                var label = valStr ? f.replace(valStr, "").replace(/\s*—\s*/, " — ").trim() : f;
                return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, lineHeight: 1.5, fontSize: 10 } },
                  React.createElement("span", { style: { color: "var(--text3)", flex: 1, minWidth: 0, overflow: "hidden", wordBreak: "break-word" } }, isBonus ? "\u2713 " + label : "\u26a0 " + label),
                  valStr && React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "var(--text3)", background: "var(--bg4)", padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", flexShrink: 0 } }, valStr)
                );
              }),
              React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", marginTop: 4 } },
                "Base: " + r.baseScore + " | Penalties: " + r.penalties + " | Bonuses: " + r.bonuses + " \u2192 Final: " + r.finalScore
              )
            )
          )
        );
      };
      return React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", fontWeight: 600 } },
            entries.length + " entr" + (entries.length !== 1 ? "ies" : "y") + " \u00b7 " + monthKeys.length + " group" + (monthKeys.length !== 1 ? "s" : "")
          ),
          entries.length > 0 && React.createElement("div", { onClick: toggleAll, style: { fontSize: 11, color: "var(--accent)", cursor: "pointer", fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "var(--bg4)" } },
            allExpanded ? "\u25b8 Collapse All" : "\u25be Expand All"
          )
        ),
        monthKeys.map(function(monthKey) {
          var mg = monthGroups[monthKey];
          var monthExpanded = !!expandedGroups[monthKey];
          var dayKeys = Object.keys(mg.days).sort().reverse();
          var monthEntryCount = dayKeys.reduce(function(sum, dk) { return sum + mg.days[dk].entries.length; }, 0);
          var allMonthDaysExpanded = dayKeys.length > 0 && dayKeys.every(function(dk) { return expandedGroups[dk]; });
          return React.createElement("div", { key: monthKey, style: { marginBottom: 16 } },
            React.createElement("div", { onClick: function() { setExpandedGroups(function(prev) { var next = Object.assign({}, prev); if (prev[monthKey]) delete next[monthKey]; else next[monthKey] = true; return next; }); }, style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "var(--bg3)", cursor: "pointer", marginBottom: 6, border: "1px solid var(--border)" } },
              React.createElement("span", { style: { fontSize: 12, color: "var(--text)", fontWeight: 700, fontFamily: "var(--font-heading)" } }, monthExpanded ? "\u25be" : "\u25b8"),
              React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, mg.label),
              React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, monthEntryCount + " entr" + (monthEntryCount !== 1 ? "ies" : "y")),
              React.createElement("div", { style: { flex: 1 } }),
              React.createElement("span", { onClick: async function(e) { e.stopPropagation(); var allMonthEntryIds = []; dayKeys.forEach(function(dk) { mg.days[dk].entries.forEach(function(en) { allMonthEntryIds.push(en.id); }); }); if (await showConfirm("Delete all " + monthEntryCount + " entr" + (monthEntryCount !== 1 ? "ies" : "y") + " in " + mg.label + "?")) { saveEntries(entries.filter(function(en) { return allMonthEntryIds.indexOf(en.id) === -1; })); } }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, monthEntryCount === 1 ? "Delete" : "Delete All"),
              React.createElement("div", { onClick: function(e) { e.stopPropagation(); var next = Object.assign({}, expandedGroups); dayKeys.forEach(function(dk) { if (allMonthDaysExpanded) delete next[dk]; else next[dk] = true; }); setExpandedGroups(next); }, style: { fontSize: 10, color: "var(--accent)", cursor: "pointer", fontWeight: 600, padding: "2px 6px", borderRadius: 4 } },
                allMonthDaysExpanded ? "Collapse" : "Expand"
              )
            ),
            monthExpanded && dayKeys.map(function(dayKey) {
              var dg = mg.days[dayKey];
              var dayExpanded = !!expandedGroups[dayKey];
              return React.createElement("div", { key: dayKey, style: { marginBottom: 8 } },
                React.createElement("div", { onClick: function() { setExpandedGroups(function(prev) { var next = Object.assign({}, prev); if (prev[dayKey]) delete next[dayKey]; else next[dayKey] = true; return next; }); }, style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 28px", borderRadius: 6, background: "var(--bg2)", cursor: "pointer", marginBottom: 4 } },
                  React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, dayExpanded ? "\u25be" : "\u25b8"),
                  React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text2)" } }, dg.label),
                  React.createElement("span", { style: { fontSize: 9, color: "var(--text6)" } }, dg.entries.length + " entr" + (dg.entries.length !== 1 ? "ies" : "y")),
                  React.createElement("span", { onClick: async function(e) { e.stopPropagation(); var dayEntryIds = dg.entries.map(function(en) { return en.id; }); if (await showConfirm("Delete all " + dg.entries.length + " entr" + (dg.entries.length !== 1 ? "ies" : "y") + " on " + dg.label + "?")) { saveEntries(entries.filter(function(en) { return dayEntryIds.indexOf(en.id) === -1; })); } }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", marginLeft: 4, whiteSpace: "nowrap" } }, dg.entries.length === 1 ? "Delete" : "Delete All")
                ),
                dayExpanded && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))", gap: 14, paddingLeft: 28 } },
                  dg.entries.map(function(entry) { return renderEntryCard(entry); })
                )
              );
            })
          );
        })
      );
    })(),

    // Performance Tracker section
    !viewingAnalysis && entries.length > 0 && React.createElement("div", { style: { marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 } },
      React.createElement("div", { onClick: function() { setPerfTrackerExpanded(!perfTrackerExpanded); }, style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: perfTrackerExpanded ? 12 : 0, padding: "8px 0" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, (perfTrackerExpanded ? "\u25be " : "\u25b8 ") + "Entry Score Performance Tracker")
        ),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          perfTrackerExpanded && React.createElement("div", { onClick: function(e) { e.stopPropagation(); refreshPerfTracker(); }, style: { fontSize: 10, color: perfTrackerRefreshing ? "var(--text6)" : "var(--accent)", cursor: perfTrackerRefreshing ? "wait" : "pointer", fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "var(--bg4)" } }, perfTrackerRefreshing ? "Refreshing..." : "\u21bb Refresh Prices")
        )
      ),
      perfTrackerExpanded && React.createElement("div", { style: { overflowX: "auto", marginTop: 4 } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 11 } },
          React.createElement("thead", null,
            React.createElement("tr", null,
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Stock"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Date Added"),
              React.createElement("th", { colSpan: 6, style: { padding: "8px 10px", textAlign: "center", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "none", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Entry Score"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Price on Add"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Days"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Current Price"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "% Change")
            ),
            React.createElement("tr", null,
              React.createElement("th", { style: { background: "var(--bg3)" } }),
              React.createElement("th", { style: { background: "var(--bg3)" } }),
              ["Hourly", "Daily", "Weekly", "Base", "Bonus/Pen", "Final"].map(function(sub) {
                return React.createElement("th", { key: sub, style: { padding: "4px 10px", textAlign: "center", fontWeight: 600, color: "var(--text5)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, sub);
              }),
              React.createElement("th", { style: { background: "var(--bg3)" } }),
              React.createElement("th", { style: { background: "var(--bg3)" } }),
              React.createElement("th", { style: { background: "var(--bg3)" } }),
              React.createElement("th", { style: { background: "var(--bg3)" } })
            )
          ),
          React.createElement("tbody", null,
            entries.map(function(entry) {
              var addedDate = new Date(entry.addedAt);
              var now = new Date();
              var _startMs = Date.UTC(addedDate.getFullYear(), addedDate.getMonth(), addedDate.getDate());
              var _endMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
              var daysElapsed = 0;
              for (var _t = _startMs; _t < _endMs; _t += 86400000) { var _day = new Date(_t).getUTCDay(); if (_day !== 0 && _day !== 6) daysElapsed++; }
              var fr = entry.frozenResult || entry.result;
              var dailyScore = fr && fr.daily ? fr.daily.total : null;
              var weeklyScore = fr && fr.weekly ? fr.weekly.total : null;
              var hourlyScore = fr && fr.hourly ? fr.hourly.total : null;
              var priceOnAdd = entry.currentPrice || entry.frozenResult?.lastClose || entry.result?.lastClose || 0;
              var currentPrice = perfTrackerPrices[entry.ticker] || 0;
              var pctChange = priceOnAdd > 0 && currentPrice > 0 ? ((currentPrice - priceOnAdd) / priceOnAdd * 100) : null;
              var pctColor = pctChange === null ? "var(--text6)" : pctChange >= 0 ? "#22c55e" : "#ef4444";
              var scoreCellStyle = { padding: "8px 10px", textAlign: "center", fontWeight: 800, fontFamily: "var(--font-heading)", fontSize: 11 };
              var dailyColor = fr && fr.daily && fr.daily.decision ? fr.daily.decision.color : "var(--text6)";
              var weeklyColor = fr && fr.weekly && fr.weekly.decision ? fr.weekly.decision.color : "var(--text6)";
              var hourlyColor = fr && fr.hourly && fr.hourly.decision ? fr.hourly.decision.color : "var(--text6)";
              var finalScore = fr ? fr.finalScore : null;
              var finalColor = fr && fr.decision ? fr.decision.color : "var(--text6)";
              var rowBg = "rgba(220, 170, 190, 0.10)";
              return React.createElement("tr", { key: entry.id, style: { borderBottom: "1px solid var(--border)", background: rowBg } },
                React.createElement("td", { style: { padding: "8px 10px", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", whiteSpace: "nowrap" } }, entry.ticker),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", color: "var(--text3)", whiteSpace: "nowrap" } }, addedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: hourlyColor }) }, hourlyScore !== null ? hourlyScore : "—"),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: dailyColor }) }, dailyScore !== null ? dailyScore : "—"),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: weeklyColor }) }, weeklyScore !== null ? weeklyScore : "—"),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: "var(--text4)", fontSize: 10 }) }, fr && fr.baseScore != null ? fr.baseScore : "—"),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "left", whiteSpace: "normal", wordBreak: "break-word", maxWidth: 180 } },
                  fr && fr.hardFilters && fr.hardFilters.length > 0 ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
                    fr.hardFilters.map(function(hf, hi) {
                      var isBonus = hf.indexOf("(+") >= 0;
                      return React.createElement("span", { key: hi, style: { fontSize: 9, fontWeight: 600, color: isBonus ? "#22c55e" : "#ef4444", background: isBonus ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", padding: "1px 5px", borderRadius: 3, lineHeight: 1.5 } }, hf);
                    })
                  ) : "—"
                ),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: finalColor, fontWeight: 900 }) }, finalScore !== null ? finalScore : "—"),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", color: "var(--text2)", fontFamily: "var(--font-mono)" } }, priceOnAdd > 0 ? INR(priceOnAdd) : "—"),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", color: "var(--text4)" } }, daysElapsed),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", color: "var(--text2)", fontFamily: "var(--font-mono)" } }, currentPrice > 0 ? INR(currentPrice) : (perfTrackerRefreshing ? "..." : "—")),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: pctColor, fontFamily: "var(--font-mono)" } }, pctChange !== null ? (pctChange >= 0 ? "+" : "") + pctChange.toFixed(2) + "%" : "—")
              );
            })
          )
        )
      )
    ),

    // Snapshots section
    !viewingAnalysis && React.createElement("div", { style: { marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 } },
      React.createElement("div", { onClick: () => setShowSnapshots(!showSnapshots), style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: showSnapshots ? 12 : 0, padding: "8px 0" } },
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, (showSnapshots ? "\u25be " : "\u25b8 ") + "Saved Snapshots"),
        snapshots.length > 0 && React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", background: "var(--bg4)", padding: "3px 8px", borderRadius: 10 } }, snapshots.length + " snapshot" + (snapshots.length !== 1 ? "s" : ""))
      ),
      showSnapshots && React.createElement("div", { style: { marginTop: 4 } }, renderSnapshots())
    )
    ) /* end Fragment */
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   NIFTY_100 TICKER LIST
   ══════════════════════════════════════════════════════════════════════════ */
var NIFTY_100 = [
  {t:"360ONE.NS",n:"360 One",cap:"M"},{t:"ABB.NS",n:"ABB India",cap:"L"},{t:"APLAPOLLO.NS",n:"APL Apollo Tubes",cap:"M"},{t:"AUBANK.NS",n:"AU Small Finance Bank",cap:"M"},{t:"ADANIENSOL.NS",n:"Adani Energy Solutions",cap:"L"},
  {t:"ADANIENT.NS",n:"Adani Enterprises",cap:"L"},{t:"ADANIGREEN.NS",n:"Adani Green Energy",cap:"L"},{t:"ADANIPORTS.NS",n:"Adani Ports & SEZ",cap:"L"},{t:"ADANIPOWER.NS",n:"Adani Power",cap:"L"},{t:"ATGL.NS",n:"Adani Total Gas",cap:"M"},
  {t:"ABCAPITAL.NS",n:"Aditya Birla Capital",cap:"M"},{t:"ALKEM.NS",n:"Alkem Laboratories",cap:"M"},{t:"AMBUJACEM.NS",n:"Ambuja Cements",cap:"L"},{t:"APOLLOHOSP.NS",n:"Apollo Hospitals",cap:"L"},{t:"ASHOKLEY.NS",n:"Ashok Leyland",cap:"M"},
  {t:"ASIANPAINT.NS",n:"Asian Paints",cap:"L"},{t:"ASTRAL.NS",n:"Astral",cap:"M"},{t:"AUROPHARMA.NS",n:"Aurobindo Pharma",cap:"M"},{t:"DMART.NS",n:"Avenue Supermarts",cap:"L"},{t:"AXISBANK.NS",n:"Axis Bank",cap:"L"},
  {t:"BSE.NS",n:"BSE",cap:"M"},{t:"BAJAJ-AUTO.NS",n:"Bajaj Auto",cap:"L"},{t:"BAJFINANCE.NS",n:"Bajaj Finance",cap:"L"},{t:"BAJAJFINSV.NS",n:"Bajaj Finserv",cap:"L"},{t:"BAJAJHLDNG.NS",n:"Bajaj Holdings",cap:"L"},
  {t:"BANKBARODA.NS",n:"Bank of Baroda",cap:"L"},{t:"BANKINDIA.NS",n:"Bank of India",cap:"M"},{t:"BDL.NS",n:"Bharat Dynamics",cap:"M"},{t:"BEL.NS",n:"Bharat Electronics",cap:"L"},{t:"BHARATFORG.NS",n:"Bharat Forge",cap:"M"},
  {t:"BHEL.NS",n:"Bharat Heavy Electricals",cap:"M"},{t:"BPCL.NS",n:"Bharat Petroleum",cap:"L"},{t:"BHARTIARTL.NS",n:"Bharti Airtel",cap:"L"},{t:"GROWW.NS",n:"Groww",cap:"M"},{t:"BIOCON.NS",n:"Biocon",cap:"M"},
  {t:"BLUESTARCO.NS",n:"Blue Star",cap:"M"},{t:"BOSCHLTD.NS",n:"Bosch",cap:"L"},{t:"BRITANNIA.NS",n:"Britannia Industries",cap:"L"},{t:"CGPOWER.NS",n:"CG Power & Industrial",cap:"L"},{t:"CANBK.NS",n:"Canara Bank",cap:"L"},
  {t:"CHOLAFIN.NS",n:"Cholamandalam Finance",cap:"L"},{t:"CIPLA.NS",n:"Cipla",cap:"L"},{t:"COALINDIA.NS",n:"Coal India",cap:"L"},{t:"COCHINSHIP.NS",n:"Cochin Shipyard",cap:"M"},{t:"COFORGE.NS",n:"Coforge",cap:"M"},
  {t:"COLPAL.NS",n:"Colgate-Palmolive",cap:"M"},{t:"CONCOR.NS",n:"Container Corp",cap:"M"},{t:"COROMANDEL.NS",n:"Coromandel International",cap:"M"},{t:"CUMMINSIND.NS",n:"Cummins India",cap:"L"},{t:"DLF.NS",n:"DLF",cap:"L"},
  {t:"DABUR.NS",n:"Dabur India",cap:"M"},{t:"DIVISLAB.NS",n:"Divi's Laboratories",cap:"L"},{t:"DIXON.NS",n:"Dixon Technologies",cap:"M"},{t:"DRREDDY.NS",n:"Dr. Reddy's Laboratories",cap:"L"},{t:"EICHERMOT.NS",n:"Eicher Motors",cap:"L"},
  {t:"ETERNAL.NS",n:"Eternal",cap:"L"},{t:"EXIDEIND.NS",n:"Exide Industries",cap:"M"},{t:"NYKAA.NS",n:"FSN E-Commerce Ventures",cap:"M"},{t:"FEDERALBNK.NS",n:"Federal Bank",cap:"M"},{t:"FORTIS.NS",n:"Fortis Healthcare",cap:"M"},
  {t:"GAIL.NS",n:"GAIL India",cap:"L"},{t:"GVT&D.NS",n:"GVT&D",cap:"M"},{t:"GMRAIRPORT.NS",n:"GMR Airports",cap:"M"},{t:"GLENMARK.NS",n:"Glenmark Pharmaceuticals",cap:"M"},{t:"GODFRYPHLP.NS",n:"Godfrey Phillips",cap:"M"},
  {t:"GODREJCP.NS",n:"Godrej Consumer Products",cap:"L"},{t:"GODREJPROP.NS",n:"Godrej Properties",cap:"M"},{t:"GRASIM.NS",n:"Grasim Industries",cap:"L"},{t:"HCLTECH.NS",n:"HCL Technologies",cap:"L"},{t:"HDFCAMC.NS",n:"HDFC Asset Management",cap:"L"},
  {t:"HDFCBANK.NS",n:"HDFC Bank",cap:"L"},{t:"HDFCLIFE.NS",n:"HDFC Life Insurance",cap:"L"},{t:"HAVELLS.NS",n:"Havells India",cap:"M"},{t:"HEROMOTOCO.NS",n:"Hero MotoCorp",cap:"M"},{t:"HINDALCO.NS",n:"Hindalco Industries",cap:"L"},
  {t:"HAL.NS",n:"Hindustan Aeronautics",cap:"L"},{t:"HINDPETRO.NS",n:"Hindustan Petroleum",cap:"M"},{t:"HINDUNILVR.NS",n:"Hindustan Unilever",cap:"L"},{t:"HINDZINC.NS",n:"Hindustan Zinc",cap:"L"},{t:"POWERINDIA.NS",n:"Hindustan Powerworks",cap:"M"},
  {t:"HUDCO.NS",n:"HUDCO",cap:"M"},{t:"HYUNDAI.NS",n:"Hyundai Motor India",cap:"L"},{t:"ICICIBANK.NS",n:"ICICI Bank",cap:"L"},{t:"ICICIGI.NS",n:"ICICI Lombard",cap:"M"},{t:"ICICIAMC.NS",n:"ICICI Prudential AMC",cap:"M"},
  {t:"IDFCFIRSTB.NS",n:"IDFC First Bank",cap:"M"},{t:"ITC.NS",n:"ITC",cap:"L"},{t:"INDIANB.NS",n:"Indian Bank",cap:"M"},{t:"INDHOTEL.NS",n:"Indian Hotels",cap:"L"},{t:"IOC.NS",n:"Indian Oil",cap:"L"},
  {t:"IRCTC.NS",n:"IRCTC",cap:"M"},{t:"IRFC.NS",n:"Indian Railway Finance",cap:"L"},{t:"IREDA.NS",n:"IREDA",cap:"M"},{t:"INDUSTOWER.NS",n:"Indus Towers",cap:"M"},{t:"INDUSINDBK.NS",n:"IndusInd Bank",cap:"M"},
  {t:"NAUKRI.NS",n:"Info Edge",cap:"M"},{t:"INFY.NS",n:"Infosys",cap:"L"},{t:"INDIGO.NS",n:"InterGlobe Aviation",cap:"L"},{t:"JSWENERGY.NS",n:"JSW Energy",cap:"M"},{t:"JSWSTEEL.NS",n:"JSW Steel",cap:"L"},
  {t:"JINDALSTEL.NS",n:"Jindal Steel & Power",cap:"L"},{t:"JIOFIN.NS",n:"Jio Financial Services",cap:"L"},{t:"JUBLFOOD.NS",n:"Jubilant Foodworks",cap:"M"},{t:"KEI.NS",n:"KEI Industries",cap:"M"},{t:"KPITTECH.NS",n:"KPIT Technologies",cap:"M"},
  {t:"KALYANKJIL.NS",n:"Kalyan Jewellers",cap:"M"},{t:"KOTAKBANK.NS",n:"Kotak Mahindra Bank",cap:"L"},{t:"LTF.NS",n:"L&T Finance",cap:"M"},{t:"LGEINDIA.NS",n:"LG Electronics India",cap:"M"},{t:"LICHSGFIN.NS",n:"LIC Housing Finance",cap:"M"},
  {t:"LTM.NS",n:"LTIMindtree",cap:"L"},{t:"LT.NS",n:"Larsen & Toubro",cap:"L"},{t:"LAURUSLABS.NS",n:"Laurus Labs",cap:"M"},{t:"LENSKART.NS",n:"Lenskart",cap:"M"},{t:"LODHA.NS",n:"Macrotech Developers",cap:"L"},
  {t:"LUPIN.NS",n:"Lupin",cap:"M"},{t:"MRF.NS",n:"MRF",cap:"M"},{t:"M&MFIN.NS",n:"Mahindra & Mahindra Financial",cap:"M"},{t:"M&M.NS",n:"Mahindra & Mahindra",cap:"L"},{t:"MANKIND.NS",n:"Mankind Pharma",cap:"M"},
  {t:"MARICO.NS",n:"Marico",cap:"M"},{t:"MARUTI.NS",n:"Maruti Suzuki",cap:"L"},{t:"MFSL.NS",n:"Max Financial Services",cap:"M"},{t:"MAXHEALTH.NS",n:"Max Healthcare",cap:"L"},{t:"MAZDOCK.NS",n:"Mazagon Dock Shipbuilders",cap:"L"},
  {t:"MOTILALOFS.NS",n:"Motilal Oswal Financial",cap:"M"},{t:"MPHASIS.NS",n:"Mphasis",cap:"M"},{t:"MCX.NS",n:"Multi Commodity Exchange",cap:"M"},{t:"MUTHOOTFIN.NS",n:"Muthoot Finance",cap:"L"},{t:"NHPC.NS",n:"NHPC",cap:"M"},
  {t:"NMDC.NS",n:"NMDC",cap:"M"},{t:"NTPC.NS",n:"NTPC",cap:"L"},{t:"NATIONALUM.NS",n:"National Aluminium",cap:"M"},{t:"NESTLEIND.NS",n:"Nestle India",cap:"L"},{t:"OBEROIRLTY.NS",n:"Oberoi Realty",cap:"M"},
  {t:"ONGC.NS",n:"Oil & Natural Gas Corp",cap:"L"},{t:"OIL.NS",n:"Oil India",cap:"M"},{t:"PAYTM.NS",n:"One97 Communications",cap:"M"},{t:"OFSS.NS",n:"Oracle Financial Services",cap:"M"},{t:"POLICYBZR.NS",n:"PB Fintech",cap:"M"},
  {t:"PIIND.NS",n:"PI Industries",cap:"M"},{t:"PAGEIND.NS",n:"Page Industries",cap:"M"},{t:"PATANJALI.NS",n:"Patanjali",cap:"M"},{t:"PERSISTENT.NS",n:"Persistent Systems",cap:"M"},{t:"PHOENIXLTD.NS",n:"Phoenix Mills",cap:"M"},
  {t:"PIDILITIND.NS",n:"Pidilite Industries",cap:"L"},{t:"POLYCAB.NS",n:"Polycab India",cap:"M"},{t:"PFC.NS",n:"Power Finance Corp",cap:"L"},{t:"POWERGRID.NS",n:"Power Grid Corp",cap:"L"},{t:"PREMIERENE.NS",n:"Premier Energies",cap:"M"},
  {t:"PRESTIGE.NS",n:"Prestige Estates",cap:"M"},{t:"PNB.NS",n:"Punjab National Bank",cap:"L"},{t:"RECLTD.NS",n:"REC",cap:"L"},{t:"RADICO.NS",n:"Radico Khaitan",cap:"M"},{t:"RVNL.NS",n:"Rail Vikas Nigam",cap:"M"},
  {t:"RELIANCE.NS",n:"Reliance Industries",cap:"L"},{t:"SBICARD.NS",n:"SBI Cards",cap:"M"},{t:"SBILIFE.NS",n:"SBI Life Insurance",cap:"L"},{t:"SRF.NS",n:"SRF",cap:"M"},{t:"MOTHERSON.NS",n:"Motherson Sumi",cap:"L"},
  {t:"SHREECEM.NS",n:"Shree Cement",cap:"L"},{t:"SHRIRAMFIN.NS",n:"Shriram Finance",cap:"L"},{t:"ENRIN.NS",n:"Enrin India",cap:"L"},{t:"SIEMENS.NS",n:"Siemens",cap:"L"},{t:"SOLARINDS.NS",n:"Solar Industries",cap:"L"},
  {t:"SBIN.NS",n:"State Bank of India",cap:"L"},{t:"SAIL.NS",n:"Steel Authority",cap:"M"},{t:"SUNPHARMA.NS",n:"Sun Pharmaceutical",cap:"L"},{t:"SUPREMEIND.NS",n:"Supreme Industries",cap:"M"},{t:"SUZLON.NS",n:"Suzlon Energy",cap:"M"},
  {t:"SWIGGY.NS",n:"Swiggy",cap:"M"},{t:"TVSMOTOR.NS",n:"TVS Motor",cap:"L"},{t:"TATACAP.NS",n:"Tata Capital",cap:"L"},{t:"TATACOMM.NS",n:"Tata Communications",cap:"M"},{t:"TCS.NS",n:"Tata Consultancy Services",cap:"L"},
  {t:"TATACONSUM.NS",n:"Tata Consumer Products",cap:"L"},{t:"TATAELXSI.NS",n:"Tata Elxsi",cap:"M"},{t:"TATAINVEST.NS",n:"Tata Investment Corp",cap:"M"},{t:"TMCV.NS",n:"Tata Motors CV",cap:"L"},{t:"TMPV.NS",n:"Tata Motors PV",cap:"L"},
  {t:"TATAPOWER.NS",n:"Tata Power",cap:"L"},{t:"TATASTEEL.NS",n:"Tata Steel",cap:"L"},{t:"TECHM.NS",n:"Tech Mahindra",cap:"L"},{t:"TITAN.NS",n:"Titan Company",cap:"L"},{t:"TORNTPHARM.NS",n:"Torrent Pharma",cap:"L"},
  {t:"TRENT.NS",n:"Trent",cap:"L"},{t:"TIINDIA.NS",n:"Tube Investments",cap:"M"},{t:"UPL.NS",n:"UPL",cap:"M"},{t:"ULTRACEMCO.NS",n:"UltraTech Cement",cap:"L"},{t:"UNIONBANK.NS",n:"Union Bank of India",cap:"L"},
  {t:"UNITDSPR.NS",n:"United Spirits",cap:"L"},{t:"VBL.NS",n:"Varun Beverages",cap:"L"},{t:"VEDL.NS",n:"Vedanta",cap:"L"},{t:"VMM.NS",n:"VMM",cap:"M"},{t:"IDEA.NS",n:"Vodafone Idea",cap:"M"},
  {t:"VOLTAS.NS",n:"Voltas",cap:"M"},{t:"WAAREEENER.NS",n:"Waaree Energies",cap:"M"},{t:"WIPRO.NS",n:"Wipro",cap:"L"},{t:"YESBANK.NS",n:"Yes Bank",cap:"M"},{t:"ZYDUSLIFE.NS",n:"Zydus Lifesciences",cap:"L"}
];
var _nseen = new Set();
var NIFTY_100_UNIQUE = NIFTY_100.filter(function(s) { if (_nseen.has(s.t)) return false; _nseen.add(s.t); return true; });

/* ══════════════════════════════════════════════════════════════════════════
   STOCK SCREENER (Nifty 200 multi-TF entry score)
   ══════════════════════════════════════════════════════════════════════════ */
var SCREENER_DECISION_MAP = {
  STRONG_BUY: { label: 'STRONG_BUY', color: '#22c55e' },
  BUY:         { label: 'BUY',         color: '#16a34a' },
  WATCHLIST:   { label: 'WATCHLIST',   color: '#eab308' },
  NEUTRAL:     { label: 'NEUTRAL',     color: '#a855f7' },
  AVOID:       { label: 'AVOID',       color: '#ef4444' },
};

/* Wraps the new computeMultiTFEntryScore + per-timeframe computeEntryScore
   into the old result shape { finalScore, decision, baseScore, penalties, bonuses, weekly, daily, hourly } */
function computeCompatEntryScore(weeklyCandles, dailyCandles, hourlyCandles) {
  if (!window.TechIndicators) return null;
  var TI = window.TechIndicators;
  var tfResults = [];
  if (weeklyCandles && weeklyCandles.length >= 50) tfResults.push({ timeframe: 'W', candles: weeklyCandles });
  if (dailyCandles && dailyCandles.length >= 50) tfResults.push({ timeframe: 'D', candles: dailyCandles });
  if (hourlyCandles && hourlyCandles.length >= 50) tfResults.push({ timeframe: 'H', candles: hourlyCandles });
  if (!tfResults.length) return null;
  var multi = TI.computeMultiTFEntryScore(tfResults);
  if (!multi || multi.multiTF_score == null) return null;
  function toDec(cls) {
    return SCREENER_DECISION_MAP[cls] || { label: cls, color: 'var(--text6)' };
  }
  var out = {
    finalScore: multi.multiTF_score,
    decision: toDec(multi.classification),
    baseScore: multi.raw_score != null ? multi.raw_score : multi.multiTF_score,
    penalties: multi.penalties || 0,
    bonuses: multi.bonuses || 0,
    hardFilters: [],
    lastClose: null,
    weekly: null, daily: null, hourly: null
  };
  if (multi.details) multi.details.forEach(function(d) {
    var scoreObj = {
      total: d.entryScore,
      decision: toDec(d.classification),
      trendScore: d.trend, trendMax: 30,
      momentumScore: d.momentum, momentumMax: 25,
      volumeScore: d.volume, volumeMax: 20,
      structureScore: d.structure, structureMax: 20,
      penalties: d.penalties, bonuses: d.bonuses, raw_score: d.raw_score
    };
    if (d.timeframe === 'W' || d.timeframe === 'weekly' || d.timeframe === '1W') out.weekly = scoreObj;
    else if (d.timeframe === 'D' || d.timeframe === 'daily' || d.timeframe === '1D') out.daily = scoreObj;
    else if (d.timeframe === 'H' || d.timeframe === 'hourly' || d.timeframe === '1h') out.hourly = scoreObj;
  });
  if (multi.penalty_items && multi.penalty_items.length) {
    multi.penalty_items.forEach(function(it) {
      out.hardFilters.push(it.reason + " (" + it.amount + ")");
    });
  }
  if (multi.bonus_items && multi.bonus_items.length) {
    multi.bonus_items.forEach(function(it) {
      out.hardFilters.push(it.reason + " (+" + it.amount + ")");
    });
  }
  return out;
}

function StockScreener() {
  var TI = window.TechIndicators;
  var DF = window.OHLCVFetcher;
  var _s = useState([]);
  var results = _s[0], setResults = _s[1];
  var _s2 = useState(false);
  var scanning = _s2[0], setScanning = _s2[1];
  var _s3 = useState({ done: 0, total: 0, current: "" });
  var progress = _s3[0], setProgress = _s3[1];
  var _s4 = useState("finalScore");
  var sortKey = _s4[0], setSortKey = _s4[1];
  var _s5 = useState("desc");
  var sortDir = _s5[0], setSortDir = _s5[1];
  var _s6 = useState("");
  var scanErr = _s6[0], setScanErr = _s6[1];
  var _s7 = useState("all");
  var filter = _s7[0], setFilter = _s7[1];
  var _s8 = useState({});
  var timestamps = _s8[0], setTimestamps = _s8[1];
  var _s9 = useState(0);
  var scanTime = _s9[0], setScanTime = _s9[1];
  var _s10 = useState({});
  var refreshingMap = _s10[0], setRefreshingMap = _s10[1];
  var _s11 = useState({});
  var addingToES = _s11[0], setAddingToES = _s11[1];
  var _s12 = useState({});
  var addedToES = _s12[0], setAddedToES = _s12[1];
  var _s11 = useState([]);
  var snapshots = _s11[0], setSnapshots = _s11[1];
  var _s13 = useState({});
  var selected = _s13[0], setSelected = _s13[1];
  var _s14 = useState("");
  var manualTicker = _s14[0], setManualTicker = _s14[1];
  var _s15 = useState(false);
  var manualLoading = _s15[0], setManualLoading = _s15[1];
  var _s16 = useState(false);
  var bgRefreshing = _s16[0], setBgRefreshing = _s16[1];
  var _s17 = useState({ done: 0, total: 0, current: "" });
  var bgProgress = _s17[0], setBgProgress = _s17[1];
  var _resultsRef = useRef(results);
  _resultsRef.current = results;

  /* Load cached data from IndexedDB on mount */
  React.useEffect(function() {
    (async function() {
      try {
        var cached = await dbGetSetting("stox_screener_data");
        if (cached && Array.isArray(cached.results)) {
          setResults(cached.results);
          setTimestamps(cached.timestamps || {});
          setScanTime(cached.scanTime || 0);
        }
      } catch(e) {}
      try {
        var snaps = await dbGetSetting("stox_screener_snapshots");
        if (Array.isArray(snaps)) setSnapshots(snaps);
      } catch(e) {}
    })();
  }, []);

  /* Persist to IndexedDB whenever data changes */
  React.useEffect(function() {
    if (results.length > 0 || scanTime > 0) {
      dbSetSetting("stox_screener_data", { results: results, timestamps: timestamps, scanTime: scanTime });
    }
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  }, [results, timestamps, scanTime]);

  /* Sync background refresh state on mount and listen for progress */
  React.useEffect(function() {
    if (window.__stoxScreenerBg && window.__stoxScreenerBg.active) {
      setBgRefreshing(true);
      setBgProgress({ done: window.__stoxScreenerBg.done, total: window.__stoxScreenerBg.total, current: window.__stoxScreenerBg.current || "" });
    }
    var handler = function(e) {
      var d = e.detail;
      setBgProgress({ done: d.done, total: d.total, current: d.current });
      if (d.results) setResults(d.results);
      if (d.timestamps) setTimestamps(d.timestamps);
      if (!d.active) setBgRefreshing(false);
    };
    window.addEventListener("stox:screener-bg-progress", handler);
    return function() { window.removeEventListener("stox:screener-bg-progress", handler); };
  }, []);

  /* Inject spin keyframes */
  React.useEffect(function() {
    var id = "screener-spin-keyframes";
    if (!document.getElementById(id)) {
      var s = document.createElement("style"); s.id = id;
      s.textContent = "@keyframes screener-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
      document.head.appendChild(s);
    }
    return function() { var el = document.getElementById(id); if (el) el.remove(); };
  }, []);

  var saveSnapshot = function() {
    if (!results.length) return;
    var snap = { id: Date.now(), scanTime: scanTime, results: JSON.parse(JSON.stringify(results)), timestamps: JSON.parse(JSON.stringify(timestamps)) };
    var updated = [snap].concat(snapshots);
    setSnapshots(updated);
    dbSetSetting("stox_screener_snapshots", updated);
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  };

  var deleteSnapshot = function(id) {
    var updated = snapshots.filter(function(s) { return s.id !== id; });
    setSnapshots(updated);
    dbSetSetting("stox_screener_snapshots", updated);
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  };

  var deleteSnapshotsBatch = function(ids) {
    var idSet = new Set(ids);
    var updated = snapshots.filter(function(s) { return !idSet.has(s.id); });
    setSnapshots(updated);
    dbSetSetting("stox_screener_snapshots", updated);
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  };

  var purgeData = function() {
    dbDeleteSetting("stox_screener_data");
    setResults([]);
    setTimestamps({});
    setScanTime(0);
  };

  var exportJSON = function() {
    if (!results.length) return;
    var payload = {
      appVersion: window.__STOX_APP_VERSION || "2.4.25",
      exportDate: new Date().toISOString(),
      scanTime: scanTime,
      results: results,
      timestamps: timestamps
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "stox-screener-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  var importJSON = function() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async function(e) {
      var file = e.target.files[0];
      if (!file) return;
      try {
        var text = await file.text();
        var data = JSON.parse(text);
        if (!data.results || !Array.isArray(data.results)) {
          setScanErr("Invalid file: missing results array");
          return;
        }
        setResults(data.results);
        setTimestamps(data.timestamps || {});
        setScanTime(data.scanTime || 0);
        setScanErr("");
      } catch (err) {
        setScanErr("Failed to import: " + err.message);
      }
    };
    input.click();
  };

  var refreshStock = async function(s) {
    if (!TI || !DF) return;
    setRefreshingMap(function(p) { var c = Object.assign({}, p); c[s.t] = true; return c; });
    try {
      var tk = s.t.replace(".NS", "");
      DF.clearCache();
      var [resW, resD, resH, quoteRes] = await Promise.all([
        DF.fetchOHLCVCached(tk, "weekly"),
        DF.fetchOHLCVCached(tk, "daily"),
        DF.fetchOHLCVCached(tk, "1h"),
        DF.fetchQuoteCached(tk)
      ]);
      if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) {
        setRefreshingMap(function(p) { var c = Object.assign({}, p); c[s.t] = false; return c; }); return;
      }
      var dc = resD.data;
      var lastDailyClose = dc[dc.length - 1].c;
      var quotePrice = quoteRes && quoteRes.price != null ? quoteRes.price : null;
      var intradayClose = resH && resH.data && resH.data.length > 0 ? resH.data[resH.data.length - 1].c : null;
      var lc = quotePrice != null ? quotePrice : (intradayClose != null ? intradayClose : lastDailyClose);
      var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 12 ? resH.data : null);
      var lc1 = dc.length >= 2 ? dc[dc.length - 2].c : null;
      var lc2 = dc.length >= 3 ? dc[dc.length - 3].c : null;
      var lc5 = dc.length >= 6 ? dc[dc.length - 6].c : null;
      var lc21 = dc.length >= 23 ? dc[dc.length - 23].c : null;
      var todayChg = quotePrice != null && lc > 0 && lastDailyClose > 0 ? Math.round((lc - lastDailyClose) / lastDailyClose * 10000) / 100 : null;
      var dayChg = lc1 != null && lc2 != null && lc2 > 0 ? Math.round((lc1 - lc2) / lc2 * 10000) / 100 : null;
      var weekChg = lc > 0 && lc5 != null && lc5 > 0 ? Math.round((lc - lc5) / lc5 * 10000) / 100 : null;
      var monthChg = lc > 0 && lc21 != null && lc21 > 0 ? Math.round((lc - lc21) / lc21 * 10000) / 100 : null;
      setResults(function(p) {
        var idx = p.findIndex(function(r) { return r.s.t === s.t; });
        if (idx >= 0) { var copy = p.slice(); copy[idx] = { s: s, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, todayChg: todayChg }; return copy; }
        return p.concat([{ s: s, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, todayChg: todayChg }]);
      });
      setTimestamps(function(p) { var c = Object.assign({}, p); c[s.t] = Date.now(); return c; });
    } catch(e) {}
    setRefreshingMap(function(p) { var c = Object.assign({}, p); c[s.t] = false; return c; });
  };

  var addManualStock = async function() {
    if (!TI || !DF || !manualTicker.trim()) return;
    var tk = manualTicker.trim().toUpperCase().replace(/\.NS$|\.BO$/, "");
    if (!tk) return;
    var existing = results.find(function(r) { return r.s.t === tk + ".NS"; });
    if (existing) { setScanErr(tk + " already in results"); setManualTicker(""); return; }
    setManualLoading(true); setScanErr("");
    var found = NIFTY_100_UNIQUE.find(function(s) { return s.t === tk + ".NS"; });
    var stockObj = found ? found : { t: tk + ".NS", n: tk };
    try {
      var [resW, resD, resH, quoteRes] = await Promise.all([
        DF.fetchOHLCVCached(tk, "weekly"),
        DF.fetchOHLCVCached(tk, "daily"),
        DF.fetchOHLCVCached(tk, "1h"),
        DF.fetchQuoteCached(tk)
      ]);
      if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) {
        setScanErr("Insufficient data for " + tk); setManualLoading(false); setManualTicker(""); return;
      }
      var dc = resD.data;
      var lastDailyClose = dc[dc.length - 1].c;
      var quotePrice = quoteRes && quoteRes.price != null ? quoteRes.price : null;
      var intradayClose = resH && resH.data && resH.data.length > 0 ? resH.data[resH.data.length - 1].c : null;
      var lc = quotePrice != null ? quotePrice : (intradayClose != null ? intradayClose : lastDailyClose);
      var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 12 ? resH.data : null);
      var lc1 = dc.length >= 2 ? dc[dc.length - 2].c : null;
      var lc2 = dc.length >= 3 ? dc[dc.length - 3].c : null;
      var lc5 = dc.length >= 6 ? dc[dc.length - 6].c : null;
      var lc21 = dc.length >= 23 ? dc[dc.length - 23].c : null;
      var todayChg = quotePrice != null && lc > 0 && lastDailyClose > 0 ? Math.round((lc - lastDailyClose) / lastDailyClose * 10000) / 100 : null;
      var dayChg = lc1 != null && lc2 != null && lc2 > 0 ? Math.round((lc1 - lc2) / lc2 * 10000) / 100 : null;
      var weekChg = lc > 0 && lc5 != null && lc5 > 0 ? Math.round((lc - lc5) / lc5 * 10000) / 100 : null;
      var monthChg = lc > 0 && lc21 != null && lc21 > 0 ? Math.round((lc - lc21) / lc21 * 10000) / 100 : null;
      setResults(function(p) { return p.concat([{ s: stockObj, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, todayChg: todayChg }]); });
      setTimestamps(function(p) { var c = Object.assign({}, p); c[stockObj.t] = Date.now(); return c; });
    } catch(e) { setScanErr("Failed to fetch " + tk); }
    setManualLoading(false); setManualTicker("");
  };

  var refreshSelected = async function() {
    if (!TI || !DF) return;
    var tickers = Object.keys(selected).filter(function(t) { return selected[t]; });
    if (!tickers.length) return;
    var batch = results.filter(function(r) { return tickers.indexOf(r.s.t) >= 0; });
    var oldScores = {};
    batch.forEach(function(r) { oldScores[r.s.t] = r.result ? r.result.finalScore : null; });
    for (var i = 0; i < batch.length; i++) {
      await refreshStock(batch[i].s);
    }
    var updatedResults = _resultsRef.current;
    var changes = [];
    var noChanges = [];
    batch.forEach(function(r) {
      var tk = r.s.t;
      var oldScore = oldScores[tk];
      var fresh = updatedResults.find(function(u) { return u.s.t === tk; });
      var newScore = fresh && fresh.result ? fresh.result.finalScore : null;
      var label = tk.replace(".NS", "");
      if (oldScore !== null && newScore !== null && oldScore !== newScore) {
        var diff = Math.round((newScore - oldScore) * 10) / 10;
        var sign = diff > 0 ? "+" : "";
        var color = diff > 0 ? "\u2191" : "\u2193";
        changes.push(label + " " + sign + diff + " (" + oldScore + " \u2192 " + newScore + ")");
      } else {
        noChanges.push(label);
      }
    });
    if (changes.length > 0) {
      var msg = "\u2713 " + changes.length + " score" + (changes.length !== 1 ? "s" : "") + " changed: " + changes.join(", ");
      if (noChanges.length > 0) msg += " \u00b7 " + noChanges.length + " unchanged";
      showToast(msg, 0);
    } else {
      showToast(batch.length + " stock" + (batch.length !== 1 ? "s" : "") + " refreshed \u2014 no score changes", 0);
    }
    setSelected({});
  };

  var refreshSelectedBackground = async function() {
    if (!TI || !DF || bgRefreshing) return;
    var tickers = Object.keys(selected).filter(function(t) { return selected[t]; });
    if (!tickers.length) return;
    var batch = results.filter(function(r) { return tickers.indexOf(r.s.t) >= 0; });
    if (!batch.length) return;
    var bg = window.__stoxScreenerBg = window.__stoxScreenerBg || {};
    bg.active = true;
    bg.results = JSON.parse(JSON.stringify(results));
    bg.timestamps = Object.assign({}, timestamps);
    bg.done = 0;
    bg.total = batch.length;
    bg.current = "";
    setBgRefreshing(true);
    setBgProgress({ done: 0, total: batch.length, current: "" });
    setSelected({});
    for (var i = 0; i < batch.length; i++) {
      if (!bg.active) break;
      var stk = batch[i].s;
      var tk = stk.t.replace(".NS", "");
      bg.current = tk;
      window.dispatchEvent(new CustomEvent("stox:screener-bg-progress", { detail: { done: i, total: batch.length, current: tk, active: true } }));
      try {
        DF.clearCache();
        var [resW, resD, resH, quoteRes] = await Promise.all([
          DF.fetchOHLCVCached(tk, "weekly"),
          DF.fetchOHLCVCached(tk, "daily"),
          DF.fetchOHLCVCached(tk, "1h"),
          DF.fetchQuoteCached(tk)
        ]);
        if (resW.data && resW.data.length >= 12 && resD.data && resD.data.length >= 12) {
          var dc = resD.data;
          var lastDailyClose = dc[dc.length - 1].c;
          var quotePrice = quoteRes && quoteRes.price != null ? quoteRes.price : null;
          var intradayClose = resH && resH.data && resH.data.length > 0 ? resH.data[resH.data.length - 1].c : null;
          var lc = quotePrice != null ? quotePrice : (intradayClose != null ? intradayClose : lastDailyClose);
          var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 12 ? resH.data : null);
          var lc1 = dc.length >= 2 ? dc[dc.length - 2].c : null;
          var lc2 = dc.length >= 3 ? dc[dc.length - 3].c : null;
          var lc5 = dc.length >= 6 ? dc[dc.length - 6].c : null;
          var lc21 = dc.length >= 23 ? dc[dc.length - 23].c : null;
          var todayChg = quotePrice != null && lc > 0 && lastDailyClose > 0 ? Math.round((lc - lastDailyClose) / lastDailyClose * 10000) / 100 : null;
          var dayChg = lc1 != null && lc2 != null && lc2 > 0 ? Math.round((lc1 - lc2) / lc2 * 10000) / 100 : null;
          var weekChg = lc > 0 && lc5 != null && lc5 > 0 ? Math.round((lc - lc5) / lc5 * 10000) / 100 : null;
          var monthChg = lc > 0 && lc21 != null && lc21 > 0 ? Math.round((lc - lc21) / lc21 * 10000) / 100 : null;
          var idx = bg.results.findIndex(function(r) { return r.s.t === stk.t; });
          if (idx >= 0) bg.results[idx] = { s: stk, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, todayChg: todayChg };
          bg.timestamps[stk.t] = Date.now();
        }
      } catch(e) {}
      bg.done = i + 1;
      try { await dbSetSetting("stox_screener_data", { results: bg.results, timestamps: bg.timestamps, scanTime: scanTime }); } catch(e) {}
      try { if (window.__fsa && window.__fsa.writeNow) await window.__fsa.writeNow(); } catch(e) {}
      window.dispatchEvent(new CustomEvent("stox:screener-bg-progress", { detail: { done: i + 1, total: batch.length, current: tk, results: bg.results, timestamps: bg.timestamps, active: i + 1 < batch.length } }));
    }
    bg.active = false;
    bg.current = "";
    setBgRefreshing(false);
    try { await dbSetSetting("stox_screener_data", { results: bg.results, timestamps: bg.timestamps, scanTime: scanTime }); } catch(e) {}
    try { if (window.__fsa && window.__fsa.writeNow) await window.__fsa.writeNow(); } catch(e) {}
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
    showToast("Background refresh complete: " + batch.length + " stock" + (batch.length !== 1 ? "s" : "") + " updated", 3000);
  };

  var toggleSelect = function(ticker) {
    setSelected(function(p) { var c = Object.assign({}, p); c[ticker] = !c[ticker]; return c; });
  };

  var toggleSelectAll = function() {
    var filteredTickers = filtered.map(function(r) { return r.s.t; });
    var allSelected = filteredTickers.length > 0 && filteredTickers.every(function(t) { return selected[t]; });
    setSelected(function(p) {
      var c = Object.assign({}, p);
      filteredTickers.forEach(function(t) { c[t] = !allSelected; });
      return c;
    });
  };

  var selectedCount = Object.keys(selected).filter(function(t) { return selected[t]; }).length;

  var addToEntryScore = async function(s) {
    var tk = s.t.replace(".NS", "");
    if (!tk || addingToES[tk]) return;
    setAddingToES(function(p) { var c = Object.assign({}, p); c[tk] = true; return c; });
    try {
      var existing = await dbGetSetting("mm_entry_scores");
      var entries = (Array.isArray(existing) ? existing : []);
      if (entries.some(function(e) { return e.ticker === tk; })) {
        setAddedToES(function(p) { var c = Object.assign({}, p); c[tk] = "exists"; return c; });
        setAddingToES(function(p) { var c = Object.assign({}, p); c[tk] = false; return c; });
        return;
      }
      var [resW, resD, resH] = await Promise.all([
        DF.fetchOHLCVCached(tk, "weekly"),
        DF.fetchOHLCVCached(tk, "daily"),
        DF.fetchOHLCVCached(tk, "1h"),
      ]);
      if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) {
        setAddingToES(function(p) { var c = Object.assign({}, p); c[tk] = false; return c; });
        return;
      }
      var lc = resD.data[resD.data.length - 1].c;
      var indW = TI.computeAll(resW.data);
      var indD = TI.computeAll(resD.data);
      var indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
      var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 12 ? resH.data : null);
      if (result) result.lastClose = lc;
      var entry = { id: Date.now(), ticker: tk, currentPrice: lc || 0, addedAt: new Date().toISOString(), result: result, frozenResult: JSON.parse(JSON.stringify(result || {})), indicators: { weekly: indW, daily: indD, hourly: indH } };
      entries.unshift(entry);
      await dbSetSetting("mm_entry_scores", entries);
      window.dispatchEvent(new CustomEvent("stox:data-changed"));
      setAddedToES(function(p) { var c = Object.assign({}, p); c[tk] = true; return c; });
    } catch (e) {}
    setAddingToES(function(p) { var c = Object.assign({}, p); c[tk] = false; return c; });
  };

  var startScan = async function() {
    if (scanning || !TI || !DF) return;
    setScanning(true); setResults([]); setScanErr("");
    var stocks = NIFTY_100_UNIQUE;
    var total = stocks.length;
    setProgress({ done: 0, total: total, current: "Starting..." });
    var out = [];
    var BATCH = 3;
    for (var i = 0; i < stocks.length; i += BATCH) {
      var batch = stocks.slice(i, i + BATCH);
      var promises = batch.map(async function(s) {
        try {
          var tk = s.t.replace(".NS", "");
          var [resW, resD, resH, quoteRes] = await Promise.all([
            DF.fetchOHLCVCached(tk, "weekly"),
            DF.fetchOHLCVCached(tk, "daily"),
            DF.fetchOHLCVCached(tk, "1h"),
            DF.fetchQuoteCached(tk)
          ]);
          if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) return null;
          var dc = resD.data;
          var lastDailyClose = dc[dc.length - 1].c;
          var quotePrice = quoteRes && quoteRes.price != null ? quoteRes.price : null;
          var intradayClose = resH && resH.data && resH.data.length > 0 ? resH.data[resH.data.length - 1].c : null;
          var lc = quotePrice != null ? quotePrice : (intradayClose != null ? intradayClose : lastDailyClose);
          var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 12 ? resH.data : null);
          var lc1 = dc.length >= 2 ? dc[dc.length - 2].c : null;
          var lc2 = dc.length >= 3 ? dc[dc.length - 3].c : null;
          var lc5 = dc.length >= 6 ? dc[dc.length - 6].c : null;
          var lc21 = dc.length >= 23 ? dc[dc.length - 23].c : null;
          var todayChg = quotePrice != null && lc > 0 && lastDailyClose > 0 ? Math.round((lc - lastDailyClose) / lastDailyClose * 10000) / 100 : null;
          var dayChg = lc1 != null && lc2 != null && lc2 > 0 ? Math.round((lc1 - lc2) / lc2 * 10000) / 100 : null;
          var weekChg = lc > 0 && lc5 != null && lc5 > 0 ? Math.round((lc - lc5) / lc5 * 10000) / 100 : null;
          var monthChg = lc > 0 && lc21 != null && lc21 > 0 ? Math.round((lc - lc21) / lc21 * 10000) / 100 : null;
          return { s: s, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, todayChg: todayChg };
        } catch(e) { return null; }
      });
      var batchResults = await Promise.all(promises);
      batchResults.forEach(function(r) { if (r) out.push(r); });
      setProgress({ done: Math.min(i + BATCH, total), total: total, current: batch.map(function(s) { return s.t.replace(".NS", ""); }).join(", ") });
      if (i + BATCH < stocks.length) await new Promise(function(r) { setTimeout(r, 300); });
    }
    out.sort(function(a, b) { return b.result.finalScore - a.result.finalScore; });
    setResults(out);
    var now = Date.now();
    var ts = {};
    out.forEach(function(r) { ts[r.s.t] = now; });
    setTimestamps(ts);
    setScanTime(now);
    setScanning(false);
    setProgress({ done: total, total: 0, current: "" });
  };

  var toggleSort = function(key) {
    if (sortKey === key) setSortDir(function(d) { return d === "desc" ? "asc" : "desc"; });
    else { setSortKey(key); setSortDir("desc"); }
  };

  var sorted = results.slice().sort(function(a, b) {
    var av, bv;
    if (sortKey === "ticker") { av = a.s.t; bv = b.s.t; return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av); }
    if (sortKey === "name") { av = a.s.n; bv = b.s.n; return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av); }
    if (sortKey === "cap") { av = a.s.cap === "L" ? 0 : a.s.cap === "M" ? 1 : 2; bv = b.s.cap === "L" ? 0 : b.s.cap === "M" ? 1 : 2; return sortDir === "asc" ? av - bv : bv - av; }
    if (sortKey === "price") { av = a.lc; bv = b.lc; }
    else if (sortKey === "todayChg") { av = a.todayChg != null ? a.todayChg : -999; bv = b.todayChg != null ? b.todayChg : -999; }
    else if (sortKey === "dayChg") { av = a.dayChg != null ? a.dayChg : -999; bv = b.dayChg != null ? b.dayChg : -999; }
    else if (sortKey === "weekChg") { av = a.weekChg != null ? a.weekChg : -999; bv = b.weekChg != null ? b.weekChg : -999; }
    else if (sortKey === "monthChg") { av = a.monthChg != null ? a.monthChg : -999; bv = b.monthChg != null ? b.monthChg : -999; }
    else if (sortKey === "weekly") { av = a.result.weekly ? a.result.weekly.total : 0; bv = b.result.weekly ? b.result.weekly.total : 0; }
    else if (sortKey === "daily") { av = a.result.daily ? a.result.daily.total : 0; bv = b.result.daily ? b.result.daily.total : 0; }
    else if (sortKey === "hourly") { av = a.result.hourly ? a.result.hourly.total : 0; bv = b.result.hourly ? b.result.hourly.total : 0; }
    else { av = a.result.finalScore; bv = b.result.finalScore; }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  var filtered = filter === "all" ? sorted : sorted.filter(function(r) {
    if (filter === "buy") return r.result.finalScore >= 65;
    if (filter === "watch") return r.result.finalScore >= 50 && r.result.finalScore < 65;
    if (filter === "avoid") return r.result.finalScore < 50;
    return true;
  });

  var countBuy = results.filter(function(r) { return r.result.finalScore >= 65; }).length;
  var countWatch = results.filter(function(r) { return r.result.finalScore >= 50 && r.result.finalScore < 65; }).length;
  var countAvoid = results.filter(function(r) { return r.result.finalScore < 50; }).length;

  var arrow = function(key) {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? " \u25bc" : " \u25b2";
  };

  var thStyle = { padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "var(--text5)", textAlign: "left", borderBottom: "2px solid var(--border)", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" };
  var tdStyle = { padding: "7px 10px", fontSize: 11, borderBottom: "1px solid var(--border)" };

  return React.createElement("div", { style: { marginTop: 4 } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Nifty 200 Screener"),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } },
          "Real-time multi-timeframe entry score for all Nifty 200 stocks",
          scanTime && !scanning ? React.createElement("span", { style: { marginLeft: 6, color: "var(--text6)", fontSize: 9 } }, "Last scanned: " + new Date(scanTime).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })) : ""
        )
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        results.length > 0 && !scanning && !bgRefreshing && selectedCount > 0 ? React.createElement("button", {
          onClick: refreshSelected,
          className: "stx-btn stx-btn-primary",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 700, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", cursor: "pointer" }
        }, "\u21bb Refresh Selected (" + selectedCount + ")") : null,
        results.length > 0 && !scanning && selectedCount > 0 ? React.createElement("button", {
          onClick: refreshSelectedBackground,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: bgRefreshing ? "var(--bg5)" : "var(--bg4)", color: bgRefreshing ? "var(--text6)" : "var(--text4)", cursor: bgRefreshing ? "wait" : "pointer" }
        }, bgRefreshing ? "\u21bb BG (" + bgProgress.done + "/" + bgProgress.total + ")" : "\u21bb Background (" + selectedCount + ")") : null,
        results.length > 0 && !scanning ? React.createElement("button", {
          onClick: saveSnapshot,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--accent)", background: "var(--accentbg)", color: "var(--accent)", cursor: "pointer" }
        }, "Save Snapshot") : null,
        results.length > 0 && !scanning ? React.createElement("button", {
          onClick: exportJSON,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" }
        }, "\u2b07 Export") : null,
        React.createElement("button", {
          onClick: importJSON,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" }
        }, "\u2b06 Import"),
        results.length > 0 && !scanning ? React.createElement("button", {
          onClick: purgeData,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text5)", cursor: "pointer" }
        }, "Purge Data") : null,
        React.createElement("button", {
          onClick: startScan, disabled: scanning,
          className: "stx-btn stx-btn-primary",
          style: { padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: scanning ? "wait" : "pointer" }
        }, scanning ? "Scanning... (" + progress.done + "/" + progress.total + ")" : "Scan Nifty 200"),
        React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } },
          React.createElement("input", {
            type: "text", placeholder: "Add ticker...", value: manualTicker,
            onChange: function(e) { setManualTicker(e.target.value); },
            onKeyDown: function(e) { if (e.key === "Enter") addManualStock(); },
            style: { width: 110, padding: "7px 10px", fontSize: 11, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", outline: "none", fontFamily: "var(--font-mono)" }
          }),
          React.createElement("button", {
            onClick: addManualStock, disabled: manualLoading || !manualTicker.trim(),
            className: "stx-btn",
            style: { padding: "7px 12px", fontSize: 11, fontWeight: 600, border: "1px solid var(--accent)", background: "var(--accentbg)", color: "var(--accent)", cursor: manualLoading || !manualTicker.trim() ? "not-allowed" : "pointer", opacity: manualLoading || !manualTicker.trim() ? 0.5 : 1 }
          }, manualLoading ? "\u27f3" : "+ Add")
        )
      )
    ),
    scanning && React.createElement("div", { style: { marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
        React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text3)" } },
          "Progress: " + progress.done + "/" + (progress.total || NIFTY_100_UNIQUE.length) + " stocks"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, progress.current)
      ),
      React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
        React.createElement("div", { style: { height: "100%", borderRadius: 3, background: "var(--accent)", transition: "width .3s", width: (progress.total > 0 ? (progress.done / progress.total * 100) : 0) + "%" } })
      )
    ),
    scanErr && React.createElement("div", { style: { marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.15)", fontSize: 11, color: "#ef4444" } }, scanErr),
    bgRefreshing && React.createElement("div", { style: { marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
        React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text3)" } },
          "Background: " + bgProgress.done + "/" + bgProgress.total + " stocks"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, bgProgress.current)
      ),
      React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
        React.createElement("div", { style: { height: "100%", borderRadius: 3, background: "var(--accent)", transition: "width .3s", width: (bgProgress.total > 0 ? (bgProgress.done / bgProgress.total * 100) : 0) + "%" } })
      )
    ),
    results.length > 0 && React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" } },
        [{ k: "all", l: "All (" + results.length + ")" }, { k: "buy", l: "Buy (" + countBuy + ")" }, { k: "watch", l: "Watch (" + countWatch + ")" }, { k: "avoid", l: "Avoid (" + countAvoid + ")" }].map(function(f) {
          return React.createElement("button", { key: f.k, onClick: function() { setFilter(f.k); }, className: "stx-btn" + (filter === f.k ? " stx-btn-primary" : ""), style: { padding: "5px 12px", fontSize: 10, fontWeight: filter === f.k ? 700 : 500 } }, f.l);
        })
      ),
      React.createElement("div", { style: { overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg3)" } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 1320 } },
          React.createElement("thead", null,
            React.createElement("tr", null,
              ["select", "ticker", "name", "cap", "price", "todayChg", "dayChg", "weekChg", "monthChg", "finalScore", "weekly", "daily", "hourly", "addToES", "actions"].map(function(k) {
                if (k === "select") {
                  var allFilteredSelected = filtered.length > 0 && filtered.every(function(r) { return selected[r.s.t]; });
                  return React.createElement("th", { key: k, style: Object.assign({}, thStyle, { cursor: "default", textAlign: "center", width: 36 }) },
                    React.createElement("input", { type: "checkbox", checked: allFilteredSelected, onChange: toggleSelectAll, style: { accentColor: "var(--accent)", cursor: "pointer", width: 14, height: 14 } })
                  );
                }
                var labels = { ticker: "Ticker", name: "Company", cap: "Cap", price: "Price (\u20b9)", todayChg: "Today %", dayChg: "1D Chg %", weekChg: "1W Chg %", monthChg: "1M Chg %", finalScore: "Score", weekly: "Weekly", daily: "Daily", hourly: "Hourly", addToES: "Add to ES", actions: "Last Refreshed" };
                return React.createElement("th", { key: k, style: Object.assign({}, thStyle, { cursor: k === "actions" || k === "addToES" ? "default" : "pointer" }), onClick: k === "actions" || k === "addToES" ? undefined : function() { toggleSort(k); } }, labels[k] + (k === "actions" || k === "addToES" ? "" : arrow(k)));
              })
            )
          ),
          React.createElement("tbody", null,
            filtered.map(function(r) {
              var d = r.result.decision;
              return React.createElement("tr", { key: r.s.t, style: { background: selected[r.s.t] ? "var(--accentbg)" : "var(--bg3)", transition: "background .15s" } },
                React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                  React.createElement("input", { type: "checkbox", checked: !!selected[r.s.t], onChange: function() { toggleSelect(r.s.t); }, style: { accentColor: "var(--accent)", cursor: "pointer", width: 14, height: 14 } })
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }) }, r.s.t.replace(".NS", "")),
                React.createElement("td", { style: Object.assign({}, tdStyle, { color: "var(--text4)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) }, r.s.n),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontSize: 10 }) },
                  r.s.cap ? React.createElement("span", { style: { padding: "2px 7px", borderRadius: 4, background: r.s.cap === "L" ? "rgba(59,130,246,.12)" : "rgba(168,85,247,.12)", color: r.s.cap === "L" ? "#3b82f6" : "#a855f7", border: "1px solid " + (r.s.cap === "L" ? "rgba(59,130,246,.25)" : "rgba(168,85,247,.25)"), fontWeight: 700, letterSpacing: 0.3 } }, r.s.cap === "L" ? "Large" : "Mid") : "\u2014"
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, color: "var(--text3)", fontFamily: "var(--font-heading)" }) }, "\u20b9" + Number(Math.round(r.lc)).toLocaleString("en-IN")),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.todayChg != null ? (r.todayChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.todayChg != null ? (r.todayChg >= 0 ? "+" : "") + Number(r.todayChg).toFixed(2) + "%" : "--"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.dayChg != null ? (r.dayChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.dayChg != null ? (r.dayChg >= 0 ? "+" : "") + Number(r.dayChg).toFixed(2) + "%" : "--"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.weekChg != null ? (r.weekChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.weekChg != null ? (r.weekChg >= 0 ? "+" : "") + Number(r.weekChg).toFixed(2) + "%" : "--"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.monthChg != null ? (r.monthChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.monthChg != null ? (r.monthChg >= 0 ? "+" : "") + Number(r.monthChg).toFixed(2) + "%" : "--"),
                React.createElement("td", { style: tdStyle },
                  React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
                    React.createElement("span", { style: { fontSize: 13, fontWeight: 900, color: d.color, fontFamily: "var(--font-heading)" } }, r.result.finalScore),
                    React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: d.color, padding: "2px 6px", borderRadius: 4, background: d.color + "18" } }, d.label)
                  )
                ),
                React.createElement("td", { style: tdStyle }, r.result.weekly ? React.createElement("span", { style: { fontWeight: 700, color: r.result.weekly.decision.color } }, r.result.weekly.total) : "\u2014"),
                React.createElement("td", { style: tdStyle }, r.result.daily ? React.createElement("span", { style: { fontWeight: 700, color: r.result.daily.decision.color } }, r.result.daily.total) : "\u2014"),
                React.createElement("td", { style: tdStyle }, r.result.hourly ? React.createElement("span", { style: { fontWeight: 700, color: r.result.hourly.decision.color } }, r.result.hourly.total) : "\u2014"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                  (function() {
                    var tk = r.s.t.replace(".NS", "");
                    var isAdding = addingToES[tk];
                    var wasAdded = addedToES[tk];
                    if (wasAdded === true) {
                      return React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,.1)", padding: "3px 8px", borderRadius: 4 } }, "\u2713 Added");
                    }
                    if (wasAdded === "exists") {
                      return React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", padding: "3px 8px" } }, "In List");
                    }
                    return React.createElement("button", {
                      onClick: function() { addToEntryScore(r.s); },
                      disabled: isAdding,
                      style: { fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(22,163,74,.3)", background: isAdding ? "var(--bg5)" : "rgba(22,163,74,.08)", color: "#16a34a", cursor: isAdding ? "wait" : "pointer", fontFamily: "inherit", opacity: isAdding ? 0.6 : 1 }
                    }, isAdding ? "\u27f3 ..." : "+ Add");
                  })()
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { whiteSpace: "nowrap" }) },
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                    React.createElement("button", {
                      onClick: function() { refreshStock(r.s); }, disabled: !!refreshingMap[r.s.t],
                      style: { width: 24, height: 24, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg4)", cursor: refreshingMap[r.s.t] ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, padding: 0, color: "var(--text5)", flexShrink: 0 }
                    }, refreshingMap[r.s.t] ? React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite" } }, "\u21bb") : "\u21bb"),
                    React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, timestamps[r.s.t] ? new Date(timestamps[r.s.t]).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "\u2014")
                  )
                )
              );
            })
          )
        )
      ),
      React.createElement("div", { style: { marginTop: 8, fontSize: 9, color: "var(--text6)", textAlign: "center" } },
        "Sorted by Today % " + (sortDir === "desc" ? "descending" : "ascending") + " \u00b7 " + filtered.length + " stocks shown"
      )
    ),
    !scanning && results.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text6)", fontSize: 13 } },
      "Click \"Scan Nifty 200\" to analyze all stocks"
    ),
    React.createElement(ScreenerSnapshots, { snapshots: snapshots, deleteSnapshot: deleteSnapshot, deleteSnapshotsBatch: deleteSnapshotsBatch })
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SCREENER SNAPSHOTS (expandable Year > Month > Day tree)
   ══════════════════════════════════════════════════════════════════════════ */
function ScreenerSnapshots(props) {
  var snapshots = props.snapshots;
  var deleteSnapshot = props.deleteSnapshot;
  var deleteSnapshotsBatch = props.deleteSnapshotsBatch;

  var _s = useState({});
  var openSnaps = _s[0], setOpenSnaps = _s[1];
  var _s2 = useState({});
  var openGroups = _s2[0], setOpenGroups = _s2[1];

  if (!snapshots.length) return null;

  var fmtDate = function(ts) {
    var d = new Date(ts);
    return { year: d.getFullYear(), month: d.toLocaleString("en-IN", { month: "long" }), day: d.getDate(), dayStr: d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), time: d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
  };

  var grouped = {};
  snapshots.forEach(function(snap) {
    var f = fmtDate(snap.scanTime);
    var yk = String(f.year);
    var mk = yk + "-" + f.month;
    var dk = mk + "-" + f.day;
    if (!grouped[yk]) grouped[yk] = {};
    if (!grouped[yk][mk]) grouped[yk][mk] = {};
    if (!grouped[yk][mk][dk]) grouped[yk][mk][dk] = [];
    grouped[yk][mk][dk].push(Object.assign({}, snap, { _f: f }));
  });

  var toggleGroup = function(k) { setOpenGroups(function(p) { var c = Object.assign({}, p); c[k] = !c[k]; return c; }); };
  var toggleSnap = function(k) { setOpenSnaps(function(p) { var c = Object.assign({}, p); c[k] = !c[k]; return c; }); };

  var cardStyle = { background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 16, overflow: "hidden" };
  var headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "10px 14px", userSelect: "none", transition: "background .15s" };
  var arrowStyle = function(open) { return { display: "inline-block", transition: "transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)", fontSize: 10, marginRight: 8, color: "var(--text5)" }; };

  var snapThStyle = { padding: "5px 8px", fontSize: 9, fontWeight: 700, color: "var(--text6)", textAlign: "left", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  var snapTdStyle = { padding: "4px 8px", fontSize: 10, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };

  var renderSnapTable = function(results) {
    return React.createElement("div", { style: { overflowX: "auto" } },
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 900 } },
        React.createElement("thead", null,
          React.createElement("tr", null,
            ["ticker", "name", "price", "todayChg", "dayChg", "weekChg", "monthChg", "finalScore", "weekly", "daily", "hourly"].map(function(k) {
              var labels = { ticker: "Ticker", name: "Company", price: "Price (\u20b9)", todayChg: "Today %", dayChg: "1D Chg %", weekChg: "1W Chg %", monthChg: "1M Chg %", finalScore: "Score", weekly: "Weekly", daily: "Daily", hourly: "Hourly" };
              return React.createElement("th", { key: k, style: snapThStyle }, labels[k]);
            })
          )
        ),
        React.createElement("tbody", null,
          results.map(function(r) {
            var d = r.result.decision;
            return React.createElement("tr", { key: r.s.t },
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }) }, r.s.t.replace(".NS", "")),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { color: "var(--text4)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }) }, r.s.n),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, color: "var(--text3)", fontFamily: "var(--font-heading)" }) }, "\u20b9" + Number(Math.round(r.lc)).toLocaleString("en-IN")),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.todayChg != null ? (r.todayChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.todayChg != null ? (r.todayChg >= 0 ? "+" : "") + Number(r.todayChg).toFixed(2) + "%" : "--"),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.dayChg != null ? (r.dayChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.dayChg != null ? (r.dayChg >= 0 ? "+" : "") + Number(r.dayChg).toFixed(2) + "%" : "--"),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.weekChg != null ? (r.weekChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.weekChg != null ? (r.weekChg >= 0 ? "+" : "") + Number(r.weekChg).toFixed(2) + "%" : "--"),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.monthChg != null ? (r.monthChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.monthChg != null ? (r.monthChg >= 0 ? "+" : "") + Number(r.monthChg).toFixed(2) + "%" : "--"),
              React.createElement("td", { style: snapTdStyle },
                React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 4 } },
                  React.createElement("span", { style: { fontSize: 11, fontWeight: 900, color: d.color, fontFamily: "var(--font-heading)" } }, r.result.finalScore),
                  React.createElement("span", { style: { fontSize: 8, fontWeight: 700, color: d.color, padding: "1px 5px", borderRadius: 3, background: d.color + "18" } }, d.label)
                )
              ),
              React.createElement("td", { style: snapTdStyle }, r.result.weekly ? React.createElement("span", { style: { fontWeight: 700, color: r.result.weekly.decision.color } }, r.result.weekly.total) : "\u2014"),
              React.createElement("td", { style: snapTdStyle }, r.result.daily ? React.createElement("span", { style: { fontWeight: 700, color: r.result.daily.decision.color } }, r.result.daily.total) : "\u2014"),
              React.createElement("td", { style: snapTdStyle }, r.result.hourly ? React.createElement("span", { style: { fontWeight: 700, color: r.result.hourly.decision.color } }, r.result.hourly.total) : "\u2014")
            );
          })
        )
      )
    );
  };

  return React.createElement("div", { style: { marginTop: 20 } },
    React.createElement("div", { style: { fontSize: 14, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)", marginBottom: 4 } }, "Saved Snapshots"),
    React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 14 } }, "Historical screener snapshots grouped by date"),
    Object.keys(grouped).sort(function(a, b) { return b - a; }).map(function(year) {
      var yearKey = "y-" + year;
      var yearOpen = !!openGroups[yearKey];
      var months = grouped[year];
      return React.createElement("div", { key: year, style: cardStyle },
        React.createElement("div", { style: Object.assign({}, headerStyle, { background: "var(--bg4)" }), onClick: function() { toggleGroup(yearKey); } },
          React.createElement("div", null, React.createElement("span", { style: arrowStyle(yearOpen) }, "\u25b6"), React.createElement("span", { style: { fontSize: 13, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)" } }, year),
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", marginLeft: 8 } }, Object.values(months).reduce(function(a, m) { return a + Object.values(m).reduce(function(b, d) { return b + d.length; }, 0); }, 0) + " snapshots")
          )
        ),
        yearOpen && React.createElement("div", { style: { padding: "0 10px 10px" } },
          Object.keys(months).sort(function(a, b) { return months[b].length - months[a].length || b.localeCompare(a); }).map(function(month) {
            var mk = yearKey + "-" + month;
            var monthOpen = !!openGroups[mk];
            var days = months[month];
            var monthSnapCount = Object.values(days).reduce(function(a, d) { return a + d.length; }, 0);
            return React.createElement("div", { key: month, style: { marginBottom: 8 } },
              React.createElement("div", { style: Object.assign({}, headerStyle, { padding: "6px 10px", borderRadius: 6, background: "var(--bg5)" }), onClick: function() { toggleGroup(mk); } },
                React.createElement("div", null, React.createElement("span", { style: arrowStyle(monthOpen) }, "\u25b6"), React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--text4)" } }, month),
                  React.createElement("span", { style: { fontSize: 9, color: "var(--text6)", marginLeft: 6 } }, monthSnapCount + " snapshots")
                ),
                React.createElement("span", { onClick: async function(e) { e.stopPropagation(); var ids = Object.values(days).flat().map(function(s) { return s.id; }); if (await showConfirm("Delete all " + monthSnapCount + " snapshot" + (monthSnapCount !== 1 ? "s" : "") + " in " + month + "?")) deleteSnapshotsBatch(ids); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, monthSnapCount === 1 ? "Delete" : "Delete All")
              ),
              monthOpen && React.createElement("div", { style: { paddingLeft: 14 } },
                Object.keys(days).sort(function(a, b) { return b.localeCompare(a); }).map(function(dayKey) {
                  var dk = mk + "-" + dayKey;
                  var dayOpen = !!openGroups[dk];
                  var snaps = days[dayKey];
                  return React.createElement("div", { key: dayKey, style: { marginBottom: 4 } },
                    snaps.map(function(snap) {
                      var snapKey = dk + "-" + snap.id;
                      var isOpen = !!openSnaps[snapKey];
                      return React.createElement("div", { key: snap.id, style: { marginBottom: 4, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg3)" } },
                        React.createElement("div", { style: Object.assign({}, headerStyle, { padding: "7px 10px" }), onClick: function() { toggleSnap(snapKey); } },
                          React.createElement("div", null,
                            React.createElement("span", { style: arrowStyle(isOpen) }, "\u25b6"),
                            React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--text3)" } }, snap._f.dayStr + " " + snap._f.time),
                            React.createElement("span", { style: { fontSize: 9, color: "var(--text6)", marginLeft: 6 } }, snap.results.length + " stocks")
                          ),
                          React.createElement("button", {
                            onClick: function(e) { e.stopPropagation(); deleteSnapshot(snap.id); },
                            className: "stx-btn",
                            style: { padding: "3px 8px", fontSize: 9, fontWeight: 600, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.06)", color: "#ef4444", cursor: "pointer" }
                          }, "Delete")
                        ),
                        isOpen && renderSnapTable(snap.results)
                      );
                    })
                  );
                })
              )
            );
          })
        )
      );
    })
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: Single Stock Analysis (Pulse sub-tab)
   ══════════════════════════════════════════════════════════════════════════ */
function SingleStockAnalysis() {
  var TI = window.TechIndicators;
  var DF = window.OHLCVFetcher;

  var _LS_KEY = "stox_single_stock";
  var _saved = (function () { try { return JSON.parse(localStorage.getItem(_LS_KEY)) || {}; } catch (e) { return {}; } })();

  var _a = useState(_saved.ticker || ""), ticker = _a[0], setTicker = _a[1];
  var _b = useState(_saved.timeframe || "daily"), timeframe = _b[0], setTimeframe = _b[1];
  var _c = useState(null), candles = _c[0], setCandles = _c[1];
  var _d = useState(false), loading = _d[0], setLoading = _d[1];
  var _e = useState(null), error = _e[0], setError = _e[1];
  var _f = useState(null), indicators = _f[0], setIndicators = _f[1];
  var _g = useState(null), signals = _g[0], setSignals = _g[1];
  var _h = useState(!!_saved.autoRefresh), autoRefresh = _h[0], setAutoRefresh = _h[1];
  var _i = useState(null), lastUpdated = _i[0], setLastUpdated = _i[1];
  var _j = useState(_saved.category || "all"), category = _j[0], setCategory = _j[1];
  var _k = useState(0), refreshTick = _k[0], setRefreshTick = _k[1];
  var _l = useState(null), dataSource = _l[0], setDataSource = _l[1];
  var _m = useState(_saved.ticker || ""), inputVal = _m[0], setInputVal = _m[1];
  var timerRef = useRef(null);

  useEffect(function () {
    try { localStorage.setItem(_LS_KEY, JSON.stringify({ ticker: ticker, timeframe: timeframe, category: category, autoRefresh: autoRefresh })); } catch (e) {}
  }, [ticker, timeframe, category, autoRefresh]);

  var TF_DEFS = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "1h", label: "1H" },
    { key: "15m", label: "15m" },
    { key: "5m", label: "5m" },
    { key: "1m", label: "1m" },
  ];

  var fetchData = useCallback(async function () {
    if (!ticker) return;
    setLoading(true); setError(null);
    try {
      var result = await DF.fetchOHLCVCached(ticker, timeframe);
      var data = result.data;
      var source = result.source;
      if (!data || data.length < 10) {
        setError("Insufficient data for " + ticker + ". Try a different timeframe.");
        setLoading(false); return;
      }
      setCandles(data); setDataSource(source);
      var ind = TI.computeAll(data);
      setIndicators(ind);
      var sig = TI.interpret(ind);
      setSignals(sig);
      setLastUpdated(new Date());
    } catch (e) {
      setError("Failed to fetch data: " + (e.message || "error"));
    }
    setLoading(false);
  }, [ticker, timeframe]);

  useEffect(function () { fetchData(); }, [fetchData]);

  useEffect(function () {
    if (!autoRefresh) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(function () { DF.clearCache(); setRefreshTick(function (t) { return t + 1; }); }, 60000);
    return function () { clearInterval(timerRef.current); };
  }, [autoRefresh]);

  useEffect(function () { fetchData(); }, [refreshTick, fetchData]);

  var filteredIndicators = useMemo(function () {
    if (category === "all") return ALL_INDS;
    return ALL_INDS.filter(function (ind) { return ind.cat === category; });
  }, [category]);

  var catKeys = ["all"].concat(ALL_CATS);

  var handleSubmit = function () {
    var t = inputVal.trim().toUpperCase().replace(/\.NS$/i, "").replace(/\.BO$/i, "");
    if (t) { setTicker(t); DF.clearCache(); }
  };

  var _fmt = function (v, d) { return v != null ? Number(v).toFixed(d != null ? d : 2) : "\u2014"; };
  var _fmtVal = function (def, val) {
    if (val === null || val === undefined) return "\u2014";
    if (typeof val === "object") {
      if (def.type === "macd") return _fmt(val.macd, 4);
      if (def.type === "stoch") return "%K: " + _fmt(val.k) + " / %D: " + _fmt(val.d);
      if (def.type === "bands") return _fmt(val.middle);
      if (def.type === "ichimoku") return _fmt(val.tenkan);
      if (def.type === "darvas") return val.boxTop ? _fmt(val.boxTop) + " / " + _fmt(val.boxBottom) : "\u2014";
      if (def.type === "smartMoney") return val.bos ? val.bos.replace("_", " ").toUpperCase() : "\u2014";
      if (def.type === "volumeProfile") return val.poc ? "POC: " + _fmt(val.poc) : "\u2014";
      if (def.type === "chandelier") return "L: " + _fmt(val.long) + " / S: " + _fmt(val.short);
      if (def.type === "heikinAshi") return (val.trend || "\u2014").toUpperCase();
      if (def.type === "fibonacci") return val.swingHigh ? _fmt(val.swingHigh) + " \u2014 " + _fmt(val.swingLow) : "\u2014";
      if (def.type === "pivotPoints") return val.classic ? "P: " + _fmt(val.classic.P) : "\u2014";
      if (def.type === "aroon") return "Up: " + _fmt(val.up) + " / Dn: " + _fmt(val.down);
      if (def.type === "vortex") return "+: " + _fmt(val.plus) + " / -: " + _fmt(val.minus);
      if (def.type === "rs") return val.rs ? "RS: " + _fmt(val.rs, 4) : "\u2014";
      if (def.type === "fractals") return (val.up ? val.up.length : 0) + "\u2191 / " + (val.down ? val.down.length : 0) + "\u2193";
      if (def.type === "zigZag") return val ? val.length + " pivots" : "\u2014";
      return "\u2014";
    }
    if (def.type === "volume") {
      if (val >= 1e9) return (val / 1e9).toFixed(2) + "B";
      if (val >= 1e7) return (val / 1e7).toFixed(2) + "Cr";
      if (val >= 1e5) return (val / 1e5).toFixed(2) + "L";
      if (val >= 1000) return (val / 1000).toFixed(1) + "K";
      return val.toString();
    }
    if (def.type === "squeeze") return val ? "Squeeze ON" : "Squeeze OFF";
    return _fmt(val);
  };

  var renderCandleChart = function () {
    if (!candles || candles.length < 2) return null;
    var data = candles.filter(function (c) {
      return c && typeof c.o === "number" && !isNaN(c.o) && typeof c.h === "number" && !isNaN(c.h) &&
             typeof c.l === "number" && !isNaN(c.l) && typeof c.c === "number" && !isNaN(c.c);
    });
    if (data.length < 2) return null;
    data = data.slice(-80);
    var w = 700, h = 240, padL = 50, padR = 10, padT = 14, padB = 40;
    var cw = w - padL - padR, ch = h - padT - padB;
    var allH = data.map(function (c) { return c.h; });
    var allL = data.map(function (c) { return c.l; });
    var hi = Math.max.apply(null, allH), lo = Math.min.apply(null, allL);
    if (isNaN(hi) || isNaN(lo)) return null;
    var range = hi - lo || 1;
    var barW = Math.max(1, Math.floor(cw / data.length) - 1);
    var gap = cw / data.length;
    var yScale = function (v) { return padT + ch - ((v - lo) / range) * ch; };

    var isIntra = timeframe !== "daily" && timeframe !== "weekly";
    var formatXLabel = function (ts) {
      if (ts == null) return "";
      var d;
      if (typeof ts === "number") {
        d = new Date(ts * 1000);
      } else {
        var s = String(ts).trim();
        if (s.indexOf("T") !== -1 || s.indexOf(":") !== -1) {
          d = new Date(s.indexOf("T") !== -1 ? s : s.replace(" ", "T"));
        } else {
          d = new Date(s + "T00:00:00");
        }
      }
      if (isNaN(d.getTime())) return "";
      if (isIntra) {
        var h2 = d.getHours(), m = d.getMinutes();
        var ampm = h2 >= 12 ? "PM" : "AM";
        var h12 = h2 % 12 || 12;
        return h12 + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
      }
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return months[d.getMonth()] + " " + d.getDate();
    };

    var fmtY = function (v) {
      if (v == null || isNaN(v)) return "\u2014";
      return "\u20b9" + Number(v).toFixed(v >= 1000 ? 0 : 2);
    };

    var yLabel = "Price (\u20b9)";
    var xLabel = isIntra ? "Time" : "Date";

    var gridLines = [0, 0.25, 0.5, 0.75, 1].map(function (pct, gi) {
      var y = padT + ch * (1 - pct);
      var val = lo + range * pct;
      return React.createElement("g", { key: "g" + gi },
        React.createElement("line", { x1: padL, y1: y, x2: w - padR, y2: y, stroke: "var(--border)", strokeWidth: 0.5, strokeDasharray: "3,3" }),
        React.createElement("text", { x: padL - 4, y: y + 3, fontSize: 8, fill: "var(--text6)", textAnchor: "end", fontFamily: "var(--font-mono)" }, fmtY(val))
      );
    });

    var xTickCount = Math.min(6, data.length);
    var xTickStep = Math.max(1, Math.floor(data.length / xTickCount));
    var xTicks = [];
    for (var xi = 0; xi < data.length; xi += xTickStep) {
      xTicks.push(xi);
    }
    if (xTicks[xTicks.length - 1] !== data.length - 1) xTicks.push(data.length - 1);

    var xTickEls = xTicks.map(function (idx) {
      var x = padL + idx * gap + gap / 2;
      var label = formatXLabel(data[idx].t);
      return React.createElement("text", { key: "xt" + idx, x: x, y: h - 18, fontSize: 8, fill: "var(--text6)", textAnchor: "middle", fontFamily: "var(--font-mono)" }, label);
    });

    var candleEls = data.map(function (c, ci) {
      var x = padL + ci * gap + gap / 2;
      var isUp = c.c >= c.o;
      var color = isUp ? "var(--profit)" : "var(--loss)";
      var bodyTop = yScale(Math.max(c.o, c.c));
      var bodyBot = yScale(Math.min(c.o, c.c));
      var bodyH = Math.max(1, bodyBot - bodyTop);
      return React.createElement("g", { key: ci },
        React.createElement("line", { x1: x, y1: yScale(c.h), x2: x, y2: yScale(c.l), stroke: color, strokeWidth: 1 }),
        React.createElement("rect", { x: x - barW / 2, y: bodyTop, width: barW, height: bodyH, fill: color, rx: 0.5 })
      );
    });

    var lastC = data[data.length - 1];
    var firstC = data[0];
    var priceColor = lastC.c >= firstC.c ? "var(--profit)" : "var(--loss)";

    return React.createElement("div", { style: { background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 12px 8px", marginBottom: 12, overflow: "hidden" } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
        React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
          React.createElement("span", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: priceColor } }, "\u20b9" + _fmt(lastC.c)),
          React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "O: " + _fmt(lastC.o) + " H: " + _fmt(lastC.h) + " L: " + _fmt(lastC.l) + " C: " + _fmt(lastC.c))
        )
      ),
      React.createElement("svg", { viewBox: "0 0 " + w + " " + h, style: { width: "100%", height: "auto" } },
        React.createElement("text", { x: 8, y: padT + ch / 2, fontSize: 8, fill: "var(--text6)", textAnchor: "middle", fontFamily: "var(--font-mono)", transform: "rotate(-90, 8, " + (padT + ch / 2) + ")" }, yLabel),
        React.createElement("text", { x: padL + cw / 2, y: h - 2, fontSize: 8, fill: "var(--text6)", textAnchor: "middle", fontFamily: "var(--font-mono)" }, xLabel),
        gridLines,
        xTickEls,
        candleEls
      )
    );
  };

  var renderGauge = function () {
    if (!signals || !signals._score) return null;
    var sc = signals._score;
    if (sc.total === 0) return null;
    var bullPct = sc.bull / sc.total * 100;
    var neutralPct = sc.neutral / sc.total * 100;
    var bearPct = sc.bear / sc.total * 100;
    var col = sc.bull > sc.bear ? "var(--profit)" : sc.bear > sc.bull ? "var(--loss)" : "#6b7280";
    return React.createElement("div", {
      style: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, marginBottom: 12, background: "var(--bg4)", border: "1px solid var(--border)" }
    },
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text4)", marginBottom: 4 } }, "Overall Signal"),
        React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden", display: "flex" } },
          bullPct > 0 && React.createElement("div", { style: { width: bullPct + "%", height: "100%", background: "var(--profit)" } }),
          neutralPct > 0 && React.createElement("div", { style: { width: neutralPct + "%", height: "100%", background: "#9ca3af" } }),
          bearPct > 0 && React.createElement("div", { style: { width: bearPct + "%", height: "100%", background: "var(--loss)" } })
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: "var(--text5)" } },
          React.createElement("span", null, sc.bull + " Bull"),
          React.createElement("span", null, sc.neutral + " Neutral"),
          React.createElement("span", null, sc.bear + " Bear")
        )
      ),
      React.createElement("div", { style: { width: 48, height: 48, borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: col + "15", border: "2px solid " + col, flexShrink: 0 } },
        React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "var(--profit)", lineHeight: 1.2, fontFamily: "var(--font-mono)" } }, sc.bull),
        React.createElement("span", { style: { fontSize: 8, fontWeight: 600, color: "#6b7280", lineHeight: 1.2 } }, sc.neutral),
        React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "var(--loss)", lineHeight: 1.2, fontFamily: "var(--font-mono)" } }, sc.bear)
      )
    );
  };

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14, alignItems: "center" } },
      React.createElement("input", {
        type: "text", value: inputVal, placeholder: "Enter ticker (e.g. RELIANCE, TCS, INFY)",
        onChange: function (e) { setInputVal(e.target.value); },
        onKeyDown: function (e) { if (e.key === "Enter") handleSubmit(); },
        style: { flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 600, outline: "none" }
      }),
      React.createElement("button", {
        onClick: handleSubmit, disabled: loading || !inputVal.trim(),
        className: "stx-btn stx-btn-primary",
        style: { padding: "10px 18px", fontSize: 12, fontWeight: 700, cursor: loading ? "wait" : "pointer", whiteSpace: "nowrap" }
      }, loading ? "Loading..." : "Analyze")
    ),

    !ticker && React.createElement("div", { style: { textAlign: "center", padding: "60px 20px", color: "var(--text6)", fontSize: 13 } },
      "Enter a stock ticker above and click Analyze to view technical indicators and candlestick chart."
    ),

    ticker && React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)" } }, ticker + ".NS"),
          lastUpdated && React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } },
            timeframe + " \u00b7 " + lastUpdated.toLocaleTimeString() + (dataSource ? " \u00b7 " + dataSource : "")
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
          React.createElement("div", { style: { display: "flex", gap: 2, background: "var(--bg4)", borderRadius: 6, padding: 2 } },
            TF_DEFS.map(function (tf) {
              return React.createElement("button", {
                key: tf.key, onClick: function () { setTimeframe(tf.key); DF.clearCache(); },
                style: { padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: timeframe === tf.key ? 700 : 500, border: "none", cursor: "pointer", background: timeframe === tf.key ? "var(--accent)" : "transparent", color: timeframe === tf.key ? "#fff" : "var(--text5)", transition: "all .15s" }
              }, tf.label);
            })
          ),
          React.createElement("button", {
            onClick: function () { setAutoRefresh(!autoRefresh); },
            style: { padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid " + (autoRefresh ? "rgba(22,163,74,.4)" : "var(--border)"), background: autoRefresh ? "rgba(22,163,74,.1)" : "var(--bg4)", color: autoRefresh ? "var(--profit)" : "var(--text5)", cursor: "pointer" }
          }, autoRefresh ? "\u25cf Live" : "\u25cb Auto"),
          React.createElement("button", {
            onClick: function () { DF.clearCache(); setRefreshTick(function (t) { return t + 1; }); },
            disabled: loading,
            style: { padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text5)", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1 }
          }, loading ? "..." : "\u21bb")
        )
      ),
      error && React.createElement("div", { style: { padding: "8px 12px", borderRadius: 8, marginBottom: 10, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", fontSize: 11, color: "var(--loss)" } }, error),
      loading && !candles && React.createElement("div", { style: { textAlign: "center", padding: 30, color: "var(--text6)", fontSize: 12 } }, "Fetching data..."),
      candles && React.createElement("div", null,
        renderCandleChart(),
        renderGauge(),
        React.createElement("div", { style: { display: "flex", gap: 3, marginBottom: 10, flexWrap: "wrap" } },
          catKeys.map(function (cat) {
            var label = cat === "all" ? "All" : cat;
            var count = cat === "all" ? filteredIndicators.length : filteredIndicators.filter(function (i) { return i.cat === cat; }).length;
            var active = category === cat;
            return React.createElement("button", {
              key: cat, onClick: function () { setCategory(cat); },
              style: { padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: active ? 700 : 500, border: "none", cursor: "pointer", background: active ? "var(--accent)" : "var(--bg4)", color: active ? "#fff" : "var(--text5)", transition: "all .15s" }
            }, label + " (" + count + ")");
          })
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 } },
          filteredIndicators.map(function (def) {
            var val = indicators ? indicators[def.key] : undefined;
            if (val === null || val === undefined) return null;
            var sig = signals ? signals[def.key] || null : null;
            var sigStyle = sig ? SIGNAL_COLORS[sig] || SIGNAL_COLORS.neutral : null;
            var cardBg = "var(--bg4)", cardBorderLeft = "none";
            if (sig === "bullish") { cardBg = "rgba(22,163,74,.06)"; cardBorderLeft = "3px solid var(--profit)"; }
            else if (sig === "bearish") { cardBg = "rgba(239,68,68,.06)"; cardBorderLeft = "3px solid var(--loss)"; }
            else if (sig === "overbought") { cardBg = "rgba(234,88,12,.05)"; cardBorderLeft = "3px solid var(--warn)"; }
            else if (sig === "oversold") { cardBg = "rgba(37,99,235,.05)"; cardBorderLeft = "3px solid var(--info)"; }
            else if (sig === "trending") { cardBg = "rgba(168,85,247,.05)"; cardBorderLeft = "3px solid #a855f7"; }
            else if (sig === "ranging") { cardBg = "rgba(107,114,128,.04)"; cardBorderLeft = "3px solid #6b7280"; }
            return React.createElement("div", {
              key: def.key,
              style: { padding: "8px 10px", borderRadius: 8, background: cardBg, border: "1px solid var(--border)", borderLeft: cardBorderLeft, display: "flex", flexDirection: "column", gap: 2, transition: "background .3s, border-color .3s" }
            },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.3 } }, def.name),
                sigStyle && sig !== "neutral" && React.createElement("span", { style: { fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 6, background: sigStyle.bg, border: "1px solid " + sigStyle.border, color: sigStyle.text, textTransform: "uppercase" } }, sigStyle.label)
              ),
              React.createElement("div", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text)" } }, _fmtVal(def, val)),
              def.type === "macd" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "MACD: " + _fmt(val.macd, 4)),
                React.createElement("span", null, "Sig: " + _fmt(val.signal, 4)),
                React.createElement("span", { style: { color: val.histogram >= 0 ? "var(--profit)" : "var(--loss)" } }, "Hist: " + _fmt(val.histogram, 4))
              ),
              def.type === "bands" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "U: " + _fmt(val.upper)),
                React.createElement("span", null, "M: " + _fmt(val.middle)),
                React.createElement("span", null, "L: " + _fmt(val.lower))
              ),
              def.type === "stoch" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "%K: " + _fmt(val.k)),
                React.createElement("span", null, "%D: " + _fmt(val.d))
              ),
              def.type === "ichimoku" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 6, flexWrap: "wrap" } },
                React.createElement("span", null, "T: " + _fmt(val.tenkan ?? val.tenkan_sen)),
                React.createElement("span", null, "K: " + _fmt(val.kijun ?? val.kijun_sen)),
                React.createElement("span", null, "SA: " + _fmt(val.senkouA ?? val.senkou_span_a)),
                React.createElement("span", null, "SB: " + _fmt(val.senkouB ?? val.senkou_span_b))
              ),
              def.type === "chandelier" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "L: " + _fmt(val.long)),
                React.createElement("span", null, "S: " + _fmt(val.short))
              ),
              def.type === "heikinAshi" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 6 } },
                React.createElement("span", null, "O: " + _fmt(val.open)),
                React.createElement("span", null, "H: " + _fmt(val.high)),
                React.createElement("span", null, "L: " + _fmt(val.low)),
                React.createElement("span", null, "C: " + _fmt(val.close))
              ),
              def.type === "aroon" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "Up: " + _fmt(val.up)),
                React.createElement("span", null, "Dn: " + _fmt(val.down)),
                React.createElement("span", { style: { color: val.osc > 0 ? "var(--profit)" : "var(--loss)" } }, "Osc: " + _fmt(val.osc))
              ),
              def.type === "vortex" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", { style: { color: "var(--profit)" } }, "VI+: " + _fmt(val.plus)),
                React.createElement("span", { style: { color: "var(--loss)" } }, "VI-: " + _fmt(val.minus))
              ),
              def.type === "volumeProfile" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "POC: " + _fmt(val.poc)),
                val.valueAreaHigh && React.createElement("span", null, "VAH: " + _fmt(val.valueAreaHigh)),
                val.valueAreaLow && React.createElement("span", null, "VAL: " + _fmt(val.valueAreaLow))
              ),
              def.type === "darvas" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8, flexWrap: "wrap" } },
                React.createElement("span", null, "Top: " + _fmt(val.boxTop)),
                React.createElement("span", null, "Bottom: " + _fmt(val.boxBottom)),
                val.breakout && React.createElement("span", {
                  style: { color: val.breakout === "up" ? "var(--profit)" : val.breakout === "down" ? "var(--loss)" : "var(--text6)" }
                }, "Breakout: " + val.breakout.toUpperCase())
              ),
              def.type === "rs" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "RS: " + _fmt(val.rs, 4)),
                val.mansfield != null && React.createElement("span", { style: { color: val.mansfield > 0 ? "var(--profit)" : "var(--loss)" } }, "Mans: " + _fmt(val.mansfield, 2) + "%")
              )
            );
          })
        )
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Pulse (Watchlist + Entry Score + Stock Screener)
   ══════════════════════════════════════════════════════════════════════════ */
function PulsePage({ holdings }) {
  const [activeTab, setActiveTab] = useState("screener");

  const TABS = [
    { key: "screener", label: "Stock Screener", icon: Icons.chart },
    { key: "entryscore", label: "Entry Score", icon: Icons.trendingUp },
    { key: "singlestock", label: "Single Stock Analysis", icon: Icons.search },
  ];

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "PULSE"),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Market Pulse")
      )
    ),

    React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0, overflowX: "auto", WebkitOverflowScrolling: "touch" } },
      TABS.map(t => React.createElement("button", {
        key: t.key,
        onClick: () => setActiveTab(t.key),
        style: {
          padding: "8px 16px", fontSize: 12, fontWeight: activeTab === t.key ? 700 : 600,
          background: "transparent", border: "none", borderBottom: "2px solid " + (activeTab === t.key ? "var(--accent)" : "transparent"),
          color: activeTab === t.key ? "var(--accent)" : "var(--text5)", cursor: "pointer", transition: "all .15s",
          display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0
        }
      }, t.icon(14), t.label))
    ),

    React.createElement("div", null,
      activeTab === "screener" && React.createElement(StockScreener, null),
      activeTab === "entryscore" && React.createElement(EntryScorePanel, { shares: holdings || [] }),
      activeTab === "singlestock" && React.createElement(SingleStockAnalysis, null)
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Info (Changelog & Version History)
   ══════════════════════════════════════════════════════════════════════════ */
function InfoPage() {

  return React.createElement("div", null,
    React.createElement("div", { style: { marginBottom: 24 } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "INFO"),
      React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "About StoX")
    ),

    /* App identity card */
    React.createElement("div", { className: "stx-card", style: { marginBottom: 20, display: "flex", alignItems: "center", gap: 16 } },
      React.createElement("div", { style: { width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg, var(--accent), var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontFamily: "var(--font-heading)", fontSize: 24, flexShrink: 0, boxShadow: "0 4px 16px var(--accentbg)" } }, "S"),
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
          React.createElement("span", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Sto", React.createElement("span", { style: { color: "var(--accent)" } }, "X")),
          React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentbg)", padding: "2px 8px", borderRadius: 6 } }, "v" + (window.__STOX_APP_VERSION || "2.4.25"))
        ),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", marginTop: 3 } }, "Stock Analysis & Portfolio Tracking for Indian Equities"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" } },
          React.createElement("span", null, "NSE \u00b7 BSE"),
          React.createElement("span", null, "50+ Indicators"),
          React.createElement("span", null, "100% On-Device")
        )
      )
    ),

    /* Feature highlights */
    React.createElement("div", { className: "stx-card", style: { marginBottom: 20 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text)" } }, "Key Features"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 } },
        [
          { icon: Icons.chart(14), label: "50+ Technical Indicators", desc: "SMA, EMA, RSI, MACD, SuperTrend, Ichimoku, Darvas Box, and more" },
          { icon: Icons.briefcase(14), label: "Portfolio Tracking", desc: "Buy/sell transactions with P&L, XIRR, and capital gains" },
          { icon: Icons.search(14), label: "Stock Screener", desc: "Filter and score stocks with custom criteria" },
          { icon: Icons.trendingUp(14), label: "Entry & Exit Scores", desc: "Multi-timeframe analysis with actionable recommendations" },
          { icon: Icons.eye(14), label: "Market Pulse", desc: "Live indices, commodities, and market news" },
          { icon: Icons.clock(14), label: "Trade History", desc: "Complete transaction log with FY classification" },
        ].map(function (f, i) {
          return React.createElement("div", { key: i, style: { padding: "10px 12px", borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-start" } },
            React.createElement("span", { style: { color: "var(--accent)", marginTop: 1, flexShrink: 0 } }, f.icon),
            React.createElement("div", null,
              React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 2 } }, f.label),
              React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", lineHeight: 1.4 } }, f.desc)
            )
          );
        })
      )
    ),

    /* Data sources note */
    React.createElement("div", { className: "stx-card", style: { marginTop: 16, padding: "14px 18px" } },
      React.createElement("h3", { style: { fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text)" } }, "Data Sources & Disclaimer"),
      React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", lineHeight: 1.7 } },
        React.createElement("p", null, "Stock prices sourced from Yahoo Finance via CORS proxies. Data may be delayed 15+ minutes."),
        React.createElement("p", null, "Market index data from NSE India API. Commodity prices from Stooq."),
        React.createElement("p", null, "News from RSS feeds: Economic Times, Moneycontrol, The Hindu BusinessLine."),
        React.createElement("p", { style: { marginTop: 6, color: "var(--text6)" } }, "This application is for informational purposes only and does not constitute financial advice. Always do your own research before investing.")
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Settings
   ══════════════════════════════════════════════════════════════════════════ */
function SettingsPage({ holdings, setHoldings, soldShareSnapshots, setSoldShareSnapshots, watchlist, setWatchlist, themeId, setTheme, fontId, setFont }) {
  return React.createElement("div", null,
    React.createElement("div", { style: { marginBottom: 20 } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "SETTINGS"),
      React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Settings")
    ),

    // Theme picker
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 12 } }, "Theme"),
      React.createElement("div", { className: "stx-theme-grid" },
        THEMES.map(function (th) {
          var active = themeId === th.id;
          return React.createElement("button", {
            key: th.id,
            className: "stx-theme-swatch" + (active ? " active" : ""),
            onClick: function () { setTheme(th.id); },
            style: { background: th.preview[0] }
          },
            React.createElement("div", {
              className: "stx-theme-swatch-preview",
              style: { background: "linear-gradient(135deg, " + th.preview[1] + ", " + th.preview[2] + ")" }
            }),
            React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: active ? th.preview[3] : "var(--text3)", marginTop: 6, textAlign: "center" } }, th.name),
            React.createElement("div", { style: { fontSize: 8, color: "var(--text5)", textAlign: "center", marginTop: 1 } }, th.desc)
          );
        })
      )
    ),

    // Font picker
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 12 } }, "Font"),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        FONTS.map(function (fo) {
          var active = fontId === fo.id;
          return React.createElement("button", {
            key: fo.id,
            onClick: function () { setFont(fo.id); },
            style: {
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              padding: "10px 14px", borderRadius: 10, border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
              background: active ? "var(--accentbg)" : "transparent", cursor: "pointer", transition: "all .15s",
              fontFamily: fo.stack
            }
          },
            React.createElement("span", { style: { fontSize: 13, fontWeight: active ? 700 : 500, color: active ? "var(--accent)" : "var(--text)" } }, fo.name),
            React.createElement("span", { style: { fontSize: 11, color: active ? "var(--accent)" : "var(--text5)", fontStyle: "italic" } }, "Aa Bb Cc 123")
          );
        })
      )
    ),

    // Backup / Restore / Import
    React.createElement(DataBackupSection, {
      holdings, setHoldings, soldShareSnapshots, setSoldShareSnapshots, watchlist, setWatchlist
    }),

    // File System Access auto-save
    window.FSAStoragePanel ? React.createElement(window.FSAStoragePanel, {
      stateData: { holdings, watchlist, soldShareSnapshots }
    }) : null,

    // Google Drive cloud backup
    window.CloudBackupPanel ? React.createElement(window.CloudBackupPanel, {
      stateData: { holdings, watchlist, soldShareSnapshots }
    }) : null,

    // About
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, "About StoX"),
      React.createElement("div", { style: { fontSize: 12, color: "var(--text4)", lineHeight: 1.7 } },
        React.createElement("p", null, "StoX is a stock analysis and portfolio tracking app for Indian equities (NSE/BSE)."),
        React.createElement("p", null, "All data is stored locally on your device. No data is sent to any server."),
        React.createElement("p", { style: { marginTop: 8 } }, "Version: ", window.__STOX_APP_VERSION || "2.4.25"),
        React.createElement("p", null, "Data sourced from Yahoo Finance via CORS proxies. Prices may be delayed.")
      )
    ),

    // Data management (danger zone)
    React.createElement("div", { className: "stx-card", style: { border: "1px solid rgba(239,68,68,.25)", background: "rgba(239,68,68,.04)" } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#ef4444" } }, "Danger Zone"),
      React.createElement("p", { style: { fontSize: 12, color: "var(--text4)", marginBottom: 12 } }, "Permanently delete all data from this browser. Download a backup first."),
      React.createElement("button", {
        className: "stx-btn stx-btn-ghost",
        style: { color: "var(--loss)", borderColor: "var(--lossborder)" },
        onClick: async () => {
          if (await showConfirm("Clear ALL data? This cannot be undone.")) {
            localStorage.clear();
            const db = await openDB();
            const stores = ["holdings", "watchlist", "snapshots", "settings"];
            stores.forEach((s) => { try { db.transaction(s, "readwrite").objectStore(s).clear(); } catch {} });
            showToast("All data cleared. Reload to see changes.");
          }
        }
      }, "Clear All Data")
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════════════════════════════════ */
function App() {
  const [page, setPage] = useState("dashboard");
  const [pageParam, setPageParam] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [prices, setPrices] = useState({});
  const [soldShareSnapshots, setSoldShareSnapshots] = useState({});
  const [themeId, setThemeId] = useState(loadTheme);
  const [fontId, setFontId] = useState(loadFont);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [loading, setLoading] = useState(true);

  const setTheme = id => { setThemeId(id); applyTheme(id); saveTheme(id); };
  const setFont = id => { setFontId(id); applyFont(id); saveFont(id); };

  // Init theme & font
  useEffect(() => { applyTheme(themeId); }, [themeId]);
  useEffect(() => { applyFont(fontId); }, [fontId]);

  // Track mobile
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Load data from IDB on mount
  useEffect(() => {
    (async () => {
      try {
        const [h, w, snaps] = await Promise.all([dbGetAll("holdings"), dbGetAll("watchlist"), loadSnapshots()]);
        setHoldings(h);
        setWatchlist(w);
        setSoldShareSnapshots(snaps);
      } catch (e) { console.warn("Failed to load data:", e); }
      setLoading(false);
    })();
  }, []);

  // Fetch prices for all tracked tickers
  const allTickers = useMemo(() => {
    const set = new Set();
    holdings.forEach((h) => set.add(h.ticker));
    watchlist.forEach((w) => set.add(w.ticker));
    return [...set];
  }, [holdings, watchlist]);

  useEffect(() => {
    if (allTickers.length === 0) return;
    let cancelled = false;
    (async () => {
      const result = await fetchMultiplePrices(allTickers);
      if (!cancelled) setPrices((prev) => ({ ...prev, ...result }));
    })();
    return () => { cancelled = true; };
  }, [allTickers.join(",")]);

  // Auto-write FSA file when any app data changes (debounced 2s)
  const _fsaTimerRef = React.useRef(null);
  useEffect(() => {
    if (_fsaTimerRef.current) clearTimeout(_fsaTimerRef.current);
    _fsaTimerRef.current = setTimeout(() => {
      if (window.__fsa && window.__fsa.writeNow) {
        window.__fsa.writeNow().catch(function() {});
      }
    }, 2000);
    return () => { if (_fsaTimerRef.current) clearTimeout(_fsaTimerRef.current); };
  }, [holdings, watchlist, soldShareSnapshots, prices]);

  // Auto-write FSA when screener/entry-score data changes (outside main state)
  const _fsaExternalRef = React.useRef(null);
  useEffect(() => {
    const handler = () => {
      if (_fsaExternalRef.current) clearTimeout(_fsaExternalRef.current);
      _fsaExternalRef.current = setTimeout(() => {
        if (window.__fsa && window.__fsa.writeNow) {
          window.__fsa.writeNow().catch(function() {});
        }
      }, 2000);
    };
    window.addEventListener("stox:data-changed", handler);
    return () => { window.removeEventListener("stox:data-changed", handler); if (_fsaExternalRef.current) clearTimeout(_fsaExternalRef.current); };
  }, []);

  // Auto-refresh every 60s
  useEffect(() => {
    if (allTickers.length === 0) return;
    const timer = setInterval(async () => {
      const result = await fetchMultiplePrices(allTickers);
      setPrices((prev) => ({ ...prev, ...result }));
    }, 60000);
    return () => clearInterval(timer);
  }, [allTickers.join(",")]);

  const navigate = (p, param) => { setPage(p); setPageParam(param); window.scrollTo(0, 0); };

  const refreshPrices = async () => {
    if (allTickers.length === 0) return;
    const result = await fetchMultiplePrices(allTickers);
    setPrices((prev) => ({ ...prev, ...result }));
  };

  const fetchSinglePrice = async (ticker) => {
    const data = await fetchTickerPrice(ticker);
    if (data) setPrices((prev) => ({ ...prev, [ticker.toUpperCase()]: data }));
  };

  // Hide splash
  useEffect(() => {
    const splash = document.getElementById("stox-splash");
    if (splash) {
      setTimeout(() => {
        splash.style.transition = "opacity .5s ease";
        splash.style.opacity = "0";
        setTimeout(() => splash.remove(), 500);
      }, 3200);
    }
  }, []);

  // Snapshot CRUD helpers
  const saveSnapshot = async (snapshot) => {
    const savedAt = snapshot.savedAt || TODAY();
    const fyKey = getFYKey(savedAt);
    setSoldShareSnapshots((prev) => {
      const updated = { ...prev, [fyKey]: [...(prev[fyKey] || []), { ...snapshot, savedAt }] };
      persistSnapshots(updated);
      return updated;
    });
  };

  const editSnapshot = async (fyKey, snapshot) => {
    setSoldShareSnapshots((prev) => {
      const oldSnaps = (prev[fyKey] || []).filter((s) => s.id !== snapshot.id);
      const newFyKey = getFYKey(snapshot.savedAt || TODAY());
      const newSnaps = [...(prev[newFyKey] || []), snapshot].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
      const updated = { ...prev };
      if (oldSnaps.length > 0) updated[fyKey] = oldSnaps;
      else delete updated[fyKey];
      updated[newFyKey] = newSnaps;
      persistSnapshots(updated);
      return updated;
    });
  };

  const deleteSnapshot = async (fyKey, snapId) => {
    setSoldShareSnapshots((prev) => {
      const snaps = (prev[fyKey] || []).filter((s) => s.id !== snapId);
      const updated = { ...prev };
      if (snaps.length > 0) updated[fyKey] = snaps;
      else delete updated[fyKey];
      persistSnapshots(updated);
      return updated;
    });
  };

  const pageProps = { holdings, setHoldings, watchlist, setWatchlist, prices, navigate, soldShareSnapshots, setSoldShareSnapshots, saveSnapshot, editSnapshot, deleteSnapshot, refreshPrices };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return React.createElement(Dashboard, pageProps);
      case "analysis": return React.createElement(StockAnalysis, { ticker: pageParam, prices, holdings, onBack: () => setPage("portfolio") });
      case "portfolio": return React.createElement(PortfolioPage, pageProps);
      case "tradehistory": return React.createElement(TradeHistoryPage, pageProps);
      case "reports": return React.createElement(ReportsPage, { shares: holdings, soldShareSnapshots });
      case "watchlist": return React.createElement(PulsePage, { holdings });
      case "settings": return React.createElement(SettingsPage, { ...pageProps, themeId, setTheme, fontId, setFont });
      case "info": return React.createElement(InfoPage, null);
      case "notepad": return React.createElement(window.NotepadPage, null);
      default: return React.createElement(Dashboard, pageProps);
    }
  };

  const NAV_ITEMS = [
    { key: "dashboard", label: "Dashboard", icon: Icons.home },
    { key: "portfolio", label: "Portfolio", icon: Icons.briefcase },
    { key: "tradehistory", label: "Trades", icon: Icons.clock },
    { key: "reports", label: "Reports", icon: Icons.chart },
    { key: "watchlist", label: "Pulse", icon: Icons.eye },
    { key: "settings", label: "Settings", icon: Icons.settings },
    { key: "notepad", label: "Notes", icon: Icons.pen },
    { key: "info", label: "Info", icon: Icons.info },
  ];

  const NAV_COLORS = {
    dashboard: "#fbbf24",
    portfolio: "#38bdf8",
    tradehistory: "#f472b6",
    reports: "#a78bfa",
    watchlist: "#2dd4bf",
    settings: "#93c5fd",
    notepad: "#f59e0b",
    info: "#bef264",
  };

  const hexAlpha = (hex, a) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  };

  // Desktop sidebar + content
  if (!isMobile) {
    return React.createElement("div", { style: { display: "flex", height: "100vh", overflow: "hidden" } },
      // Sidebar
      React.createElement("div", {
        className: "stx-sidebar",
        style: {
          width: 220, minWidth: 220, background: "var(--sidebar)", display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--border)", padding: "20px 0", flexShrink: 0, height: "100vh", overflowY: "auto"
        }
      },
        React.createElement("div", { style: { padding: "0 20px 20px", borderBottom: "1px solid rgba(255,255,255,.08)" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
            React.createElement("div", { style: { width: 36, height: 36, borderRadius: 10, background: "rgba(16,185,129,.2)", border: "1px solid rgba(16,185,129,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#10b981", fontFamily: "var(--font-heading)", fontSize: 18 } }, "S"),
            React.createElement("div", null,
              React.createElement("div", { style: { fontWeight: 800, fontSize: 16, color: "#ecfdf5", fontFamily: "var(--font-heading)" } }, "Sto", React.createElement("span", { style: { color: "#10b981" } }, "X")),
              React.createElement("div", { style: { fontSize: 9, color: "rgba(255,255,255,.4)", letterSpacing: 1 } }, "STOCK ANALYSIS")
            )
          )
        ),
        React.createElement("div", { style: { padding: "16px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 2 } },
          NAV_ITEMS.map((item) => {
            const active = page === item.key;
            const col = NAV_COLORS[item.key] || "var(--accent)";
            return React.createElement("button", {
              key: item.key, onClick: () => navigate(item.key),
              style: {
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                borderRadius: 10, border: "none", cursor: "pointer",
                transition: "background .18s, color .18s, border-color .18s",
                background: active ? hexAlpha(col, 0.13) : "transparent",
                color: active ? col : "rgba(255,255,255,.55)",
                fontWeight: active ? 700 : 500, fontSize: 13,
                fontFamily: "var(--font-body)", textAlign: "left",
                borderLeft: active ? "3px solid " + col : "3px solid transparent"
              }
            },
              React.createElement("span", null, item.icon(18)),
              React.createElement("span", null, item.label)
            );
          })
        ),
        // Market status footer
        React.createElement("div", { style: { padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 10, color: "rgba(255,255,255,.35)" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
            React.createElement("div", { style: { width: 6, height: 6, borderRadius: "50%", background: isTradingWeekday() ? "#10b981" : "#6b7280" } }),
            isTradingWeekday() ? "Market Open" : "Market Closed"
          ),
          React.createElement("div", { style: { marginTop: 4 } }, "NSE \u00b7 BSE")
        )
      ),
      // Content
      React.createElement("div", { style: { flex: 1, overflowY: "auto", minHeight: 0, padding: "24px 24px 40px", background: "var(--bg)" } },
        renderPage()
      ),
      React.createElement(ToastHost, null)
    );
  }

  // Mobile layout
  return React.createElement("div", { className: "stx-has-botnav", style: { padding: "14px 10px 32px" } },
    React.createElement("div", { style: { maxWidth: 600, margin: "0 auto" } },
      renderPage()
    ),
    // Bottom nav
    React.createElement("div", { className: "stx-botnav" },
      NAV_ITEMS.map((item) => {
        const col = NAV_COLORS[item.key] || "var(--accent)";
        return React.createElement("button", {
          key: item.key,
          className: "stx-botnav-item" + (page === item.key ? " active" : ""),
          onClick: () => navigate(item.key),
          style: page === item.key ? { color: col } : {}
        },
          React.createElement("span", null, item.icon(18)),
          React.createElement("span", null, item.label)
        );
      })
    ),
    React.createElement(ToastHost, null)
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MOUNT
   ══════════════════════════════════════════════════════════════════════════ */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
