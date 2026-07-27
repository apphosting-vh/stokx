/* ══════════════════════════════════════════════════════════════════════════
   StoX — Stock Analysis & Portfolio Tracking for Indian Equities
   app-core.js — React application (in-browser Babel compilation)
   ══════════════════════════════════════════════════════════════════════════ */
window.__STOX_APP_VERSION = "2.4.1";

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
    return row ? row.value : {};
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
};

/* ══════════════════════════════════════════════════════════════════════════
   TOAST SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */
let _toastId = 0;
let _toasts = [];
let _setToasts = null;

function showToast(msg, duration = 3000) {
  if (!_setToasts) return;
  const id = ++_toastId;
  _setToasts((prev) => [...prev, { id, msg }]);
  setTimeout(() => {
    _setToasts((prev) => prev.filter((t) => t.id !== id));
  }, duration);
}

function ToastHost() {
  const [toasts, setToasts] = useState([]);
  _setToasts = setToasts;
  if (toasts.length === 0) return null;
  return React.createElement("div", { className: "stx-toast-host" },
    toasts.map((t) =>
      React.createElement("div", { key: t.id, className: "stx-toast" },
        React.createElement("span", { className: "stx-toast-msg" }, t.msg),
        React.createElement("button", {
          className: "stx-toast-close",
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
   MARKET NEWS PANEL — Marketaux API
   ══════════════════════════════════════════════════════════════════════════ */
const MARKETAUX_KEY = "2DxOjtOp2p5Nu2hU21aYGPNEIX2dxmOj4oHJta6x";

function MarketNewsPanel({ holdings }) {
  const [news, setNews] = React.useState([]);
  const [stockNews, setStockNews] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [stockLoading, setStockLoading] = React.useState(true);
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

  // Fetch India market news on mount
  React.useEffect(() => {
    let cancelled = false;
    const url = "https://api.marketaux.com/v1/news/all?api_token=" + MARKETAUX_KEY + "&countries=in&language=en&limit=15&filter_entities=true";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.data) setNews(data.data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Fetch news for held tickers
  React.useEffect(() => {
    if (!holdings || holdings.length === 0) { setStockLoading(false); return; }
    let cancelled = false;
    const tickers = holdings.slice(0, 10).map((h) => h.ticker).join(",");
    const url = "https://api.marketaux.com/v1/news/all?api_token=" + MARKETAUX_KEY + "&symbols=" + encodeURIComponent(tickers) + "&language=en&limit=12&filter_entities=true";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.data) setStockNews(data.data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStockLoading(false); });
    return () => { cancelled = true; };
  }, [holdings]);

  const renderNewsCard = (article, idx) => {
    const isExp = expanded[article.uuid];
    const desc = stripHtml(article.description || "");
    const shortDesc = desc.length > 140 ? desc.slice(0, 140) + "..." : desc;
    const entities = (article.entities || []).slice(0, 4);

    return React.createElement("div", {
      key: article.uuid || idx,
      className: "stx-card",
      style: { padding: "14px 16px", marginBottom: 0, animation: "stxFadeIn .35s ease " + (idx * 0.04) + "s both", cursor: "pointer", transition: "border-color .15s, box-shadow .15s" },
      onClick: () => { if (article.url) window.open(article.url, "_blank", "noopener"); },
      onMouseEnter: (e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; },
      onMouseLeave: (e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }
    },
      React.createElement("div", { style: { display: "flex", gap: 12 } },
        article.image_url && React.createElement("div", {
          style: { width: 72, height: 72, borderRadius: 8, backgroundSize: "cover", backgroundPosition: "center", backgroundImage: "url(" + article.image_url + ")", flexShrink: 0, background: article.image_url ? undefined : "var(--bg5)" }
        }),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.35, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } }, article.title),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", lineHeight: 1.4, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: isExp ? 10 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" } }, isExp ? desc : shortDesc),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", fontWeight: 600 } }, article.source || "Unknown"),
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "\u00b7"),
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, timeAgo(article.published_at)),
            entities.length > 0 && React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", marginLeft: 4 } },
              entities.map((ent, ei) => {
                const sentColor = ent.sentiment_score > 0.1 ? "#10b981" : ent.sentiment_score < -0.1 ? "#ef4444" : "var(--text6)";
                return React.createElement("span", {
                  key: ei,
                  style: { fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "var(--bg5)", border: "1px solid var(--border2)", color: sentColor, letterSpacing: 0.3 }
                }, ent.symbol || ent.name);
              })
            )
          )
        )
      )
    );
  };

  return React.createElement("div", { style: { marginTop: 24 } },
    // Tab header
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 } },
      React.createElement("h2", { style: { fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Market News"),
      React.createElement("div", { style: { display: "flex", gap: 2, background: "var(--bg5)", borderRadius: 8, padding: 2, border: "1px solid var(--border)" } },
        React.createElement("button", {
          onClick: () => setActiveTab("market"),
          style: { padding: "4px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: activeTab === "market" ? "var(--accent)" : "transparent", color: activeTab === "market" ? "#fff" : "var(--text5)", transition: "all .15s", fontFamily: "var(--font-body)" }
        }, "Indian Markets"),
        holdings.length > 0 && React.createElement("button", {
          onClick: () => setActiveTab("stock"),
          style: { padding: "4px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: activeTab === "stock" ? "var(--accent)" : "transparent", color: activeTab === "stock" ? "#fff" : "var(--text5)", transition: "all .15s", fontFamily: "var(--font-body)" }
        }, "My Holdings")
      ),
      React.createElement("div", { style: { marginLeft: "auto", fontSize: 10, color: "var(--text6)" } }, "Powered by Marketaux")
    ),

    // Market news tab
    activeTab === "market" && React.createElement("div", null,
      loading && React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text5)" } },
        React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite", fontSize: 20 } }, "\u21bb"),
        React.createElement("div", { style: { marginTop: 8, fontSize: 12 } }, "Fetching market news...")
      ),
      !loading && news.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 32, color: "var(--text6)", fontSize: 12 } }, "No news available right now."),
      !loading && news.length > 0 && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 } },
        news.map((a, i) => renderNewsCard(a, i))
      )
    ),

    // Stock-specific news tab
    activeTab === "stock" && React.createElement("div", null,
      stockLoading && React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text5)" } },
        React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite", fontSize: 20 } }, "\u21bb"),
        React.createElement("div", { style: { marginTop: 8, fontSize: 12 } }, "Fetching news for your holdings...")
      ),
      !stockLoading && stockNews.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 32, color: "var(--text6)", fontSize: 12 } }, "No news found for your holdings."),
      !stockLoading && stockNews.length > 0 && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 } },
        stockNews.map((a, i) => renderNewsCard(a, i))
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

    // Full technical indicators panel
    React.createElement(window.TechnicalIndicatorsPanel, { shares: holdings || [], isMobile: isMobile })
  );
}

function EntryScoreAnalysis({ entry, onBack }) {
  const [activeTF, setActiveTF] = useState("daily");
  const [catFilter, setCatFilter] = useState("all");
  const r = entry.result || {};
  const ind = entry.indicators || {};
  const price = entry.currentPrice || r.lastClose || 0;

  const INDS = window.STOX_INDICATORS || [];
  const CATS = window.STOX_CATEGORIES || [];
  const _fmt = function (v, d) { return v != null ? Number(v).toFixed(d != null ? d : 2) : "\u2014"; };
  const _TI = window.TechIndicators;

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
        case "ichimoku": return _fmt(val.tenkan, 2);
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
  const activeInd = ind[activeTF] || null;

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
      React.createElement("div", { style: { display: "flex", gap: 3, marginBottom: 10, flexWrap: "wrap" } },
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
        })
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
              React.createElement("span", null, "T: " + _fmt(val.tenkan)),
              React.createElement("span", null, "K: " + _fmt(val.kijun)),
              React.createElement("span", null, "SA: " + _fmt(val.senkouA)),
              React.createElement("span", null, "SB: " + _fmt(val.senkouB))
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
          renderIndicators(activeInd)
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
const SnapshotChartPanel = ({ sn }) => {
  const [loading, setLoading] = React.useState(false);
  const [histPts, setHistPts] = React.useState(sn.chartPts && sn.chartPts.length >= 2 ? sn.chartPts : null);
  const tkr = (sn.ticker || "").trim().toUpperCase();
  const isGain = sn.sellPrice >= sn.buyPrice;
  const costBasisVal = sn.qty * sn.buyPrice;
  const safeId = "svc_" + (sn.id || "x").replace(/[^a-zA-Z0-9]/g, "_");

  React.useEffect(() => {
    if (histPts && histPts.length >= 2) return;
    if (!tkr || !sn.buyDate) return;
    let cancelled = false;
    setLoading(true);
    fetchHistoricalPrices(tkr, sn.buyDate)
      .then(pts => {
        if (cancelled) return;
        if (pts && pts.length >= 2) {
          const cutoff = sn.savedAt || TODAY();
          const filtered = pts.filter(p => p.date <= cutoff);
          setHistPts(filtered.length >= 2 ? filtered.map(p => ({ date: p.date, close: p.close })) : []);
        } else {
          setHistPts([]);
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setHistPts([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tkr, sn.buyDate, sn.savedAt]);

  if (loading) return React.createElement("div", { style: {
    marginTop: 10, padding: "10px 14px", borderRadius: 9, fontSize: 12,
    background: "var(--bg5)", border: "1px solid var(--border2)",
    display: "flex", alignItems: "center", gap: 8
  }},
    React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite" } }, "\u21bb"),
    React.createElement("span", { style: { color: "var(--text5)" } }, "Loading chart...")
  );

  if (!histPts || histPts.length < 2) return null;

  const chartPts = histPts.map(p => ({ date: p.date, value: sn.qty * p.close }));
  const latestVal = chartPts[chartPts.length - 1].value;
  const oldestVal = chartPts[0].value;
  const overallChg = latestVal - oldestVal;
  const overallChgPct = oldestVal > 0 ? ((overallChg / oldestVal) * 100).toFixed(2) : "0.00";
  const chgCol = overallChg >= 0 ? "#10b981" : "#ef4444";

  return React.createElement("div", { style: { marginTop: 12, background: "var(--bg5)", borderRadius: 10, padding: "14px 14px 10px", border: "1px solid var(--border2)" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 } },
      React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--text5)", textTransform: "uppercase", letterSpacing: .4 } }, "Holding Value History"),
      React.createElement("span", { style: { fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 700, background: overallChg >= 0 ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)", color: chgCol } }, (overallChg >= 0 ? "+" : "") + Math.abs(overallChgPct) + "%"),
      React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, chartPts.length + " days")
    ),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 4, fontSize: 10, color: "var(--text6)" } },
      React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 4 } },
        React.createElement("span", { style: { display: "inline-block", width: 16, height: 2, background: isGain ? "#10b981" : "#ef4444", borderRadius: 1, verticalAlign: "middle" } }),
        "Value"
      ),
      React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 4 } },
        React.createElement("span", { style: { display: "inline-block", width: 16, height: 0, borderTop: "2px dashed #f59e0b", verticalAlign: "middle" } }),
        "Cost"
      )
    ),
    React.createElement(HoldingValueChart, { pts: chartPts, qty: sn.qty, buyPrice: sn.buyPrice, color: isGain ? "#10b981" : "#ef4444", gradId: safeId })
  );
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
                  onClick: () => { if (confirm("Remove " + h.ticker + " from portfolio?")) handleDelete(h.id); },
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
function TradeHistoryPage({ soldShareSnapshots = {}, deleteSnapshot, editSnapshot }) {
  const fyKeys = Object.keys(soldShareSnapshots).sort().reverse();
  const [collapsed, setCollapsed] = useState({});
  const [monthCollapsed, setMonthCollapsed] = useState({});
  const [editSnap, setEditSnap] = useState(null);

  const toggleFY = (fy) => setCollapsed((p) => ({ ...p, [fy]: !p[fy] }));
  const toggleMonth = (mk) => setMonthCollapsed((p) => ({ ...p, [mk]: !p[mk] }));
  const collapseAll = () => {
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
    setCollapsed(c);
    setMonthCollapsed(c);
  };
  const expandAll = () => { setCollapsed({}); setMonthCollapsed({}); };

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
        React.createElement("p", { style: { fontSize: 13, color: "var(--text5)", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" } }, "Go to Portfolio \u2192 click \"Save Snapshot\" on any active holding to capture its current values as a historical record here.")
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
      React.createElement("div", { style: { display: "flex", gap: 6 } },
        React.createElement("button", { onClick: expandAll, className: "stx-btn stx-btn-ghost", style: { fontSize: 11, padding: "5px 10px" } }, "Expand All"),
        React.createElement("button", { onClick: collapseAll, className: "stx-btn stx-btn-ghost", style: { fontSize: 11, padding: "5px 10px" } }, "Collapse All")
      )
    ),

    /* ── FY groups ── */
    fyKeys.map((fy) => {
      const snaps = soldShareSnapshots[fy] || [];
      if (!snaps.length) return null;
      const isCollapsedFY = !!collapsed[fy];
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
            const mIsCollapsed = !!monthCollapsed[mk];
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
                        onClick: () => { if (confirm("Remove this snapshot? This cannot be undone.")) deleteSnapshot(fy, sn.id); },
                        style: { fontSize: 10, padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--lossborder)", background: "var(--lossbg)", color: "var(--loss)" }
                      }, "\u00d7 Remove")
                    ),
                    React.createElement(SnapshotChartPanel, { sn: sn })
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

  useEffect(() => {
    (async () => {
      try {
        const val = await dbGetSetting(LS_ENTRY_SCORES);
        if (val && Array.isArray(val)) setEntries(val);
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

  const saveEntries = (arr) => { setEntries(arr); dbSetSetting(LS_ENTRY_SCORES, arr); };
  const deleteEntry = (id) => { saveEntries(entries.filter(e => e.id !== id)); };

  useEffect(() => {
    if (!entries.length || !TI || !DF) return;
    const OLD_KEYWORDS = /Overbought|price up, volume down|bullish, weekly bearish|within 1% of upper|new 20d high with volume surge|all 3 timeframes bullish|institutional buying|rising OBV|ADX > 20 all|MTF alignment strong|declining on thin volume|within 1.5% of lower|held < 3 days with strong|> 3% below entry|> 1.5% below entry|below EMAs \+ MACD|institutional selling/;
    const stale = entries.filter(e => {
      if (!e.result || !e.result.hardFilters || !e.result.hardFilters.length) return false;
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
          const result = TI.computeMultiTFEntryScore(resW.data, indW, resD.data, indD, resH.data, indH, entry.currentPrice || 0);
          const idx = updated.findIndex(e => e.id === entry.id);
          if (idx >= 0) updated[idx] = { ...updated[idx], result, indicators: { weekly: indW, daily: indD, hourly: indH } };
        } catch (e) {}
      }
      saveEntries(updated);
    })();
  }, []);

  const saveSnapshots = (arr) => { setSnapshots(arr); dbSetSetting(LS_ENTRY_SNAPSHOTS, arr); };
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
    const price = parseFloat(addPrice) || 0;
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
      const indW = TI.computeAll(resW.data);
      const indD = TI.computeAll(resD.data);
      const indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
      const result = TI.computeMultiTFEntryScore(resW.data, indW, resD.data, indD, resH.data, indH, price);
      const entry = { id: Date.now(), ticker: tk, currentPrice: price, addedAt: new Date().toISOString(), result, indicators: { weekly: indW, daily: indD, hourly: indH } };
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
        indRow("ROC (12)", indData.roc_12, indData.roc_12 > 0 ? "bullish" : "bearish"),
        indRow("PSAR", indData.psar, lc && indData.psar ? lc > indData.psar ? "bullish" : "bearish" : null),
        indRow("WMA 20", indData.wma_20),
        indRow("HMA 16", indData.hma_16),
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
                React.createElement("span", { onClick: (e) => { e.stopPropagation(); if (window.confirm("Delete all " + mSnaps + " snapshot" + (mSnaps !== 1 ? "s" : "") + " in " + mKey.split("-").slice(1).join("-") + "?")) deleteSnapshotsWhere(s => { const d = new Date(s.savedAt); return String(d.getFullYear()) + "-" + d.toLocaleString("en-IN", { month: "long" }) === mKey; }); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, mSnaps === 1 ? "Delete" : "Delete All")
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
                    React.createElement("span", { onClick: (e) => { e.stopPropagation(); if (window.confirm("Delete all " + day.snaps.length + " snapshot" + (day.snaps.length !== 1 ? "s" : "") + " on " + day.label + "?")) deleteSnapshotsWhere(s => { const d = new Date(s.savedAt); const dk = mKey + "-" + d.getDate(); return dk === dayKey; }); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, day.snaps.length === 1 ? "Delete" : "Delete All")
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
      React.createElement("button", { onClick: () => setShowAdd(true), className: "stx-btn stx-btn-primary", style: { fontSize: 12, padding: "8px 16px" } },
        "+ Add Entry"
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
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))", gap: 14 } },
      entries.map(entry => {
        const r = entry.result;
        const isExpanded = !!expandedIds[entry.id];
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
              React.createElement("div", { onClick: () => saveSnapshot(entry), style: { cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--accent)", fontSize: 13, title: "Save Snapshot" } }, Icons.save(14)),
              React.createElement("div", { onClick: () => deleteEntry(entry.id), style: { cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--text6)", fontSize: 14 }, title: "Delete" }, Icons.trash(14))
            )
          ),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "6px 10px", borderRadius: 8, background: r.decision.color + "12" } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 800, color: r.decision.color, fontFamily: "var(--font-heading)" } }, r.decision.label),
            React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text5)", fontStyle: "italic" } }, r.decision.position),
            r.hardFilters && r.hardFilters.length > 0 && React.createElement("span", { style: { fontSize: 8, fontWeight: 700, color: "#ef4444", padding: "2px 5px", borderRadius: 3, background: "rgba(239,68,68,.1)" } }, r.hardFilters.length + " filter" + (r.hardFilters.length > 1 ? "s" : ""))
          ),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 } },
            ["weekly", "daily", "hourly"].map(tf => {
              const s = r[tf];
              const label = tf === "weekly" ? "Weekly (30%)" : tf === "daily" ? "Daily (50%)" : "Hourly (20%)";
              return React.createElement("div", { key: tf, style: { padding: "6px 8px", borderRadius: 8, background: "var(--bg4)", textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: "var(--text5)", marginBottom: 2 } }, label),
                React.createElement("div", { style: { fontSize: 14, fontWeight: 800, color: s ? s.decision.color : "var(--text6)", fontFamily: "var(--font-heading)" } }, s ? s.total : "N/A"),
                s && React.createElement("div", { style: { fontSize: 8, color: s.decision.color, fontWeight: 600 } }, s.decision.label)
              );
            })
          ),
          React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 12, marginBottom: 6 } },
            React.createElement("div", { onClick: () => setExpandedIds(prev => ({ ...prev, [entry.id]: !prev[entry.id] })), style: { fontSize: 10, color: "var(--accent)", cursor: "pointer", fontWeight: 600 } },
              isExpanded ? "\u25b2 Hide Details" : "\u25bc Show Details"
            ),
            window.TechnicalIndicatorsInline && React.createElement("div", { onClick: () => setViewingAnalysis(viewingAnalysis && viewingAnalysis.id === entry.id ? null : entry), style: { fontSize: 10, color: "#f97316", cursor: "pointer", fontWeight: 600 } },
              "\u26a1 Technicals"
            )
          ),
          isExpanded && React.createElement("div", { style: { marginTop: 8 } },
            r.daily && tfSection("Daily Breakdown", r.daily),
            r.weekly && tfSection("Weekly Breakdown", r.weekly),
            r.hourly && tfSection("Hourly Breakdown", r.hourly),
            r.hardFilters && r.hardFilters.length > 0 && React.createElement("div", { style: { marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)" } },
              React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "var(--text3)", marginBottom: 4 } }, "Penalties & Bonuses"),
              r.hardFilters.map((f, i) => {
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
      })
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
  {t:"360ONE.NS",n:"360 One"},{t:"ABB.NS",n:"ABB India"},{t:"APLAPOLLO.NS",n:"APL Apollo Tubes"},{t:"AUBANK.NS",n:"AU Small Finance Bank"},{t:"ADANIENSOL.NS",n:"Adani Energy Solutions"},
  {t:"ADANIENT.NS",n:"Adani Enterprises"},{t:"ADANIGREEN.NS",n:"Adani Green Energy"},{t:"ADANIPORTS.NS",n:"Adani Ports & SEZ"},{t:"ADANIPOWER.NS",n:"Adani Power"},{t:"ATGL.NS",n:"Adani Total Gas"},
  {t:"ABCAPITAL.NS",n:"Aditya Birla Capital"},{t:"ALKEM.NS",n:"Alkem Laboratories"},{t:"AMBUJACEM.NS",n:"Ambuja Cements"},{t:"APOLLOHOSP.NS",n:"Apollo Hospitals"},{t:"ASHOKLEY.NS",n:"Ashok Leyland"},
  {t:"ASIANPAINT.NS",n:"Asian Paints"},{t:"ASTRAL.NS",n:"Astral"},{t:"AUROPHARMA.NS",n:"Aurobindo Pharma"},{t:"DMART.NS",n:"Avenue Supermarts"},{t:"AXISBANK.NS",n:"Axis Bank"},
  {t:"BSE.NS",n:"BSE"},{t:"BAJAJ-AUTO.NS",n:"Bajaj Auto"},{t:"BAJFINANCE.NS",n:"Bajaj Finance"},{t:"BAJAJFINSV.NS",n:"Bajaj Finserv"},{t:"BAJAJHLDNG.NS",n:"Bajaj Holdings"},
  {t:"BANKBARODA.NS",n:"Bank of Baroda"},{t:"BANKINDIA.NS",n:"Bank of India"},{t:"BDL.NS",n:"Bharat Dynamics"},{t:"BEL.NS",n:"Bharat Electronics"},{t:"BHARATFORG.NS",n:"Bharat Forge"},
  {t:"BHEL.NS",n:"Bharat Heavy Electricals"},{t:"BPCL.NS",n:"Bharat Petroleum"},{t:"BHARTIARTL.NS",n:"Bharti Airtel"},{t:"GROWW.NS",n:"Groww"},{t:"BIOCON.NS",n:"Biocon"},
  {t:"BLUESTARCO.NS",n:"Blue Star"},{t:"BOSCHLTD.NS",n:"Bosch"},{t:"BRITANNIA.NS",n:"Britannia Industries"},{t:"CGPOWER.NS",n:"CG Power & Industrial"},{t:"CANBK.NS",n:"Canara Bank"},
  {t:"CHOLAFIN.NS",n:"Cholamandalam Finance"},{t:"CIPLA.NS",n:"Cipla"},{t:"COALINDIA.NS",n:"Coal India"},{t:"COCHINSHIP.NS",n:"Cochin Shipyard"},{t:"COFORGE.NS",n:"Coforge"},
  {t:"COLPAL.NS",n:"Colgate-Palmolive"},{t:"CONCOR.NS",n:"Container Corp"},{t:"COROMANDEL.NS",n:"Coromandel International"},{t:"CUMMINSIND.NS",n:"Cummins India"},{t:"DLF.NS",n:"DLF"},
  {t:"DABUR.NS",n:"Dabur India"},{t:"DIVISLAB.NS",n:"Divi's Laboratories"},{t:"DIXON.NS",n:"Dixon Technologies"},{t:"DRREDDY.NS",n:"Dr. Reddy's Laboratories"},{t:"EICHERMOT.NS",n:"Eicher Motors"},
  {t:"ETERNAL.NS",n:"Eternal"},{t:"EXIDEIND.NS",n:"Exide Industries"},{t:"NYKAA.NS",n:"FSN E-Commerce Ventures"},{t:"FEDERALBNK.NS",n:"Federal Bank"},{t:"FORTIS.NS",n:"Fortis Healthcare"},
  {t:"GAIL.NS",n:"GAIL India"},{t:"GVT&D.NS",n:"GVT&D"},{t:"GMRAIRPORT.NS",n:"GMR Airports"},{t:"GLENMARK.NS",n:"Glenmark Pharmaceuticals"},{t:"GODFRYPHLP.NS",n:"Godfrey Phillips"},
  {t:"GODREJCP.NS",n:"Godrej Consumer Products"},{t:"GODREJPROP.NS",n:"Godrej Properties"},{t:"GRASIM.NS",n:"Grasim Industries"},{t:"HCLTECH.NS",n:"HCL Technologies"},{t:"HDFCAMC.NS",n:"HDFC Asset Management"},
  {t:"HDFCBANK.NS",n:"HDFC Bank"},{t:"HDFCLIFE.NS",n:"HDFC Life Insurance"},{t:"HAVELLS.NS",n:"Havells India"},{t:"HEROMOTOCO.NS",n:"Hero MotoCorp"},{t:"HINDALCO.NS",n:"Hindalco Industries"},
  {t:"HAL.NS",n:"Hindustan Aeronautics"},{t:"HINDPETRO.NS",n:"Hindustan Petroleum"},{t:"HINDUNILVR.NS",n:"Hindustan Unilever"},{t:"HINDZINC.NS",n:"Hindustan Zinc"},{t:"POWERINDIA.NS",n:"Hindustan Powerworks"},
  {t:"HUDCO.NS",n:"HUDCO"},{t:"HYUNDAI.NS",n:"Hyundai Motor India"},{t:"ICICIBANK.NS",n:"ICICI Bank"},{t:"ICICIGI.NS",n:"ICICI Lombard"},{t:"ICICIAMC.NS",n:"ICICI Prudential AMC"},
  {t:"IDFCFIRSTB.NS",n:"IDFC First Bank"},{t:"ITC.NS",n:"ITC"},{t:"INDIANB.NS",n:"Indian Bank"},{t:"INDHOTEL.NS",n:"Indian Hotels"},{t:"IOC.NS",n:"Indian Oil"},
  {t:"IRCTC.NS",n:"IRCTC"},{t:"IRFC.NS",n:"Indian Railway Finance"},{t:"IREDA.NS",n:"IREDA"},{t:"INDUSTOWER.NS",n:"Indus Towers"},{t:"INDUSINDBK.NS",n:"IndusInd Bank"},
  {t:"NAUKRI.NS",n:"Info Edge"},{t:"INFY.NS",n:"Infosys"},{t:"INDIGO.NS",n:"InterGlobe Aviation"},{t:"JSWENERGY.NS",n:"JSW Energy"},{t:"JSWSTEEL.NS",n:"JSW Steel"},
  {t:"JINDALSTEL.NS",n:"Jindal Steel & Power"},{t:"JIOFIN.NS",n:"Jio Financial Services"},{t:"JUBLFOOD.NS",n:"Jubilant Foodworks"},{t:"KEI.NS",n:"KEI Industries"},{t:"KPITTECH.NS",n:"KPIT Technologies"},
  {t:"KALYANKJIL.NS",n:"Kalyan Jewellers"},{t:"KOTAKBANK.NS",n:"Kotak Mahindra Bank"},{t:"LTF.NS",n:"L&T Finance"},{t:"LGEINDIA.NS",n:"LG Electronics India"},{t:"LICHSGFIN.NS",n:"LIC Housing Finance"},
  {t:"LTM.NS",n:"LTIMindtree"},{t:"LT.NS",n:"Larsen & Toubro"},{t:"LAURUSLABS.NS",n:"Laurus Labs"},{t:"LENSKART.NS",n:"Lenskart"},{t:"LODHA.NS",n:"Macrotech Developers"},
  {t:"LUPIN.NS",n:"Lupin"},{t:"MRF.NS",n:"MRF"},{t:"M&MFIN.NS",n:"Mahindra & Mahindra Financial"},{t:"M&M.NS",n:"Mahindra & Mahindra"},{t:"MANKIND.NS",n:"Mankind Pharma"},
  {t:"MARICO.NS",n:"Marico"},{t:"MARUTI.NS",n:"Maruti Suzuki"},{t:"MFSL.NS",n:"Max Financial Services"},{t:"MAXHEALTH.NS",n:"Max Healthcare"},{t:"MAZDOCK.NS",n:"Mazagon Dock Shipbuilders"},
  {t:"MOTILALOFS.NS",n:"Motilal Oswal Financial"},{t:"MPHASIS.NS",n:"Mphasis"},{t:"MCX.NS",n:"Multi Commodity Exchange"},{t:"MUTHOOTFIN.NS",n:"Muthoot Finance"},{t:"NHPC.NS",n:"NHPC"},
  {t:"NMDC.NS",n:"NMDC"},{t:"NTPC.NS",n:"NTPC"},{t:"NATIONALUM.NS",n:"National Aluminium"},{t:"NESTLEIND.NS",n:"Nestle India"},{t:"OBEROIRLTY.NS",n:"Oberoi Realty"},
  {t:"ONGC.NS",n:"Oil & Natural Gas Corp"},{t:"OIL.NS",n:"Oil India"},{t:"PAYTM.NS",n:"One97 Communications"},{t:"OFSS.NS",n:"Oracle Financial Services"},{t:"POLICYBZR.NS",n:"PB Fintech"},
  {t:"PIIND.NS",n:"PI Industries"},{t:"PAGEIND.NS",n:"Page Industries"},{t:"PATANJALI.NS",n:"Patanjali"},{t:"PERSISTENT.NS",n:"Persistent Systems"},{t:"PHOENIXLTD.NS",n:"Phoenix Mills"},
  {t:"PIDILITIND.NS",n:"Pidilite Industries"},{t:"POLYCAB.NS",n:"Polycab India"},{t:"PFC.NS",n:"Power Finance Corp"},{t:"POWERGRID.NS",n:"Power Grid Corp"},{t:"PREMIERENE.NS",n:"Premier Energies"},
  {t:"PRESTIGE.NS",n:"Prestige Estates"},{t:"PNB.NS",n:"Punjab National Bank"},{t:"RECLTD.NS",n:"REC"},{t:"RADICO.NS",n:"Radico Khaitan"},{t:"RVNL.NS",n:"Rail Vikas Nigam"},
  {t:"RELIANCE.NS",n:"Reliance Industries"},{t:"SBICARD.NS",n:"SBI Cards"},{t:"SBILIFE.NS",n:"SBI Life Insurance"},{t:"SRF.NS",n:"SRF"},{t:"MOTHERSON.NS",n:"Motherson Sumi"},
  {t:"SHREECEM.NS",n:"Shree Cement"},{t:"SHRIRAMFIN.NS",n:"Shriram Finance"},{t:"ENRIN.NS",n:"Enrin India"},{t:"SIEMENS.NS",n:"Siemens"},{t:"SOLARINDS.NS",n:"Solar Industries"},
  {t:"SBIN.NS",n:"State Bank of India"},{t:"SAIL.NS",n:"Steel Authority"},{t:"SUNPHARMA.NS",n:"Sun Pharmaceutical"},{t:"SUPREMEIND.NS",n:"Supreme Industries"},{t:"SUZLON.NS",n:"Suzlon Energy"},
  {t:"SWIGGY.NS",n:"Swiggy"},{t:"TVSMOTOR.NS",n:"TVS Motor"},{t:"TATACAP.NS",n:"Tata Capital"},{t:"TATACOMM.NS",n:"Tata Communications"},{t:"TCS.NS",n:"Tata Consultancy Services"},
  {t:"TATACONSUM.NS",n:"Tata Consumer Products"},{t:"TATAELXSI.NS",n:"Tata Elxsi"},{t:"TATAINVEST.NS",n:"Tata Investment Corp"},{t:"TMCV.NS",n:"Tata Motors CV"},{t:"TMPV.NS",n:"Tata Motors PV"},
  {t:"TATAPOWER.NS",n:"Tata Power"},{t:"TATASTEEL.NS",n:"Tata Steel"},{t:"TECHM.NS",n:"Tech Mahindra"},{t:"TITAN.NS",n:"Titan Company"},{t:"TORNTPHARM.NS",n:"Torrent Pharma"},
  {t:"TRENT.NS",n:"Trent"},{t:"TIINDIA.NS",n:"Tube Investments"},{t:"UPL.NS",n:"UPL"},{t:"ULTRACEMCO.NS",n:"UltraTech Cement"},{t:"UNIONBANK.NS",n:"Union Bank of India"},
  {t:"UNITDSPR.NS",n:"United Spirits"},{t:"VBL.NS",n:"Varun Beverages"},{t:"VEDL.NS",n:"Vedanta"},{t:"VMM.NS",n:"VMM"},{t:"IDEA.NS",n:"Vodafone Idea"},
  {t:"VOLTAS.NS",n:"Voltas"},{t:"WAAREEENER.NS",n:"Waaree Energies"},{t:"WIPRO.NS",n:"Wipro"},{t:"YESBANK.NS",n:"Yes Bank"},{t:"ZYDUSLIFE.NS",n:"Zydus Lifesciences"}
];
var _nseen = new Set();
var NIFTY_100_UNIQUE = NIFTY_100.filter(function(s) { if (_nseen.has(s.t)) return false; _nseen.add(s.t); return true; });

/* ══════════════════════════════════════════════════════════════════════════
   STOCK SCREENER (Nifty 200 multi-TF entry score)
   ══════════════════════════════════════════════════════════════════════════ */
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
  }, [results, timestamps, scanTime]);

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
  };

  var deleteSnapshot = function(id) {
    var updated = snapshots.filter(function(s) { return s.id !== id; });
    setSnapshots(updated);
    dbSetSetting("stox_screener_snapshots", updated);
  };

  var deleteSnapshotsBatch = function(ids) {
    var idSet = new Set(ids);
    var updated = snapshots.filter(function(s) { return !idSet.has(s.id); });
    setSnapshots(updated);
    dbSetSetting("stox_screener_snapshots", updated);
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
      appVersion: window.__STOX_APP_VERSION || "2.4.1",
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
      var resW = await DF.fetchOHLCVCached(tk, "weekly");
      var resD = await DF.fetchOHLCVCached(tk, "daily");
      var resH = await DF.fetchOHLCVCached(tk, "1h");
      if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) {
        setRefreshingMap(function(p) { var c = Object.assign({}, p); c[s.t] = false; return c; }); return;
      }
      var indW = TI.computeAll(resW.data);
      var indD = TI.computeAll(resD.data);
      var indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
      var lc = indD ? indD.lastClose : 0;
      var result = TI.computeMultiTFEntryScore(resW.data, indW, resD.data, indD, resH.data, indH, lc);
      var dc = resD.data;
      var lc1 = dc.length >= 2 ? dc[dc.length - 2].c : null;
      var lc2 = dc.length >= 3 ? dc[dc.length - 3].c : null;
      var lc5 = dc.length >= 6 ? dc[dc.length - 6].c : null;
      var lc21 = dc.length >= 23 ? dc[dc.length - 23].c : null;
      var todayChg = lc > 0 && lc1 != null && lc1 > 0 ? Math.round((lc - lc1) / lc1 * 10000) / 100 : null;
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
      var indW = TI.computeAll(resW.data);
      var indD = TI.computeAll(resD.data);
      var indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
      var result = TI.computeMultiTFEntryScore(resW.data, indW, resD.data, indD, resH.data, indH, 0);
      var entry = { id: Date.now(), ticker: tk, currentPrice: 0, addedAt: new Date().toISOString(), result: result, indicators: { weekly: indW, daily: indD, hourly: indH } };
      entries.unshift(entry);
      await dbSetSetting("mm_entry_scores", entries);
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
          var resW = await DF.fetchOHLCVCached(tk, "weekly");
          var resD = await DF.fetchOHLCVCached(tk, "daily");
          var resH = await DF.fetchOHLCVCached(tk, "1h");
          if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) return null;
          var indW = TI.computeAll(resW.data);
          var indD = TI.computeAll(resD.data);
          var indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
          var lc = indD ? indD.lastClose : 0;
          var result = TI.computeMultiTFEntryScore(resW.data, indW, resD.data, indD, resH.data, indH, lc);
          var dc = resD.data;
          var lc1 = dc.length >= 2 ? dc[dc.length - 2].c : null;
          var lc2 = dc.length >= 3 ? dc[dc.length - 3].c : null;
          var lc5 = dc.length >= 6 ? dc[dc.length - 6].c : null;
          var lc21 = dc.length >= 23 ? dc[dc.length - 23].c : null;
          var todayChg = lc > 0 && lc1 != null && lc1 > 0 ? Math.round((lc - lc1) / lc1 * 10000) / 100 : null;
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
        }, scanning ? "Scanning... (" + progress.done + "/" + progress.total + ")" : "Scan Nifty 200")
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
    results.length > 0 && React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" } },
        [{ k: "all", l: "All (" + results.length + ")" }, { k: "buy", l: "Buy (" + countBuy + ")" }, { k: "watch", l: "Watch (" + countWatch + ")" }, { k: "avoid", l: "Avoid (" + countAvoid + ")" }].map(function(f) {
          return React.createElement("button", { key: f.k, onClick: function() { setFilter(f.k); }, className: "stx-btn" + (filter === f.k ? " stx-btn-primary" : ""), style: { padding: "5px 12px", fontSize: 10, fontWeight: filter === f.k ? 700 : 500 } }, f.l);
        })
      ),
      React.createElement("div", { style: { overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg3)" } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 1220 } },
          React.createElement("thead", null,
            React.createElement("tr", null,
              ["ticker", "name", "price", "todayChg", "dayChg", "weekChg", "monthChg", "finalScore", "weekly", "daily", "hourly", "addToES", "actions"].map(function(k) {
                var labels = { ticker: "Ticker", name: "Company", price: "Price (\u20b9)", todayChg: "Today %", dayChg: "1D Chg %", weekChg: "1W Chg %", monthChg: "1M Chg %", finalScore: "Score", weekly: "Weekly", daily: "Daily", hourly: "Hourly", addToES: "Add to ES", actions: "Last Refreshed" };
                return React.createElement("th", { key: k, style: Object.assign({}, thStyle, { cursor: k === "actions" || k === "addToES" ? "default" : "pointer" }), onClick: k === "actions" || k === "addToES" ? undefined : function() { toggleSort(k); } }, labels[k] + (k === "actions" || k === "addToES" ? "" : arrow(k)));
              })
            )
          ),
          React.createElement("tbody", null,
            filtered.map(function(r) {
              var d = r.result.decision;
              return React.createElement("tr", { key: r.s.t, style: { background: "var(--bg3)", transition: "background .15s" } },
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }) }, r.s.t.replace(".NS", "")),
                React.createElement("td", { style: Object.assign({}, tdStyle, { color: "var(--text4)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) }, r.s.n),
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
        "Sorted by entry score " + (sortDir === "desc" ? "descending" : "ascending") + " \u00b7 " + filtered.length + " stocks shown"
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
                React.createElement("span", { onClick: function(e) { e.stopPropagation(); var ids = Object.values(days).flat().map(function(s) { return s.id; }); if (window.confirm("Delete all " + monthSnapCount + " snapshot" + (monthSnapCount !== 1 ? "s" : "") + " in " + month + "?")) deleteSnapshotsBatch(ids); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, monthSnapCount === 1 ? "Delete" : "Delete All")
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
    var allInds = [
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
      { name: "ROC (12)", key: "roc_12", cat: "Momentum", type: "oscillator" },
      { name: "Momentum (10)", key: "momentum_10", cat: "Momentum", type: "oscillator" },
      { name: "Parabolic SAR", key: "psar", cat: "Trend", type: "line" },
      { name: "HMA (16)", key: "hma_16", cat: "Trend", type: "line" },
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
    var CATS = ["Trend", "Momentum", "Volatility", "Volume", "Structure"];
    window.STOX_INDICATORS = allInds;
    window.STOX_CATEGORIES = CATS;
    if (category === "all") return allInds;
    return allInds.filter(function (ind) { return ind.cat === category; });
  }, [category]);

  var CATS = ["Trend", "Momentum", "Volatility", "Volume", "Structure"];
  var catKeys = ["all"].concat(CATS);

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
                React.createElement("span", null, "T: " + _fmt(val.tenkan)),
                React.createElement("span", null, "K: " + _fmt(val.kijun)),
                React.createElement("span", null, "SA: " + _fmt(val.senkouA)),
                React.createElement("span", null, "SB: " + _fmt(val.senkouB))
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

    React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 } },
      TABS.map(t => React.createElement("button", {
        key: t.key,
        onClick: () => setActiveTab(t.key),
        style: {
          padding: "8px 16px", fontSize: 12, fontWeight: activeTab === t.key ? 700 : 600,
          background: "transparent", border: "none", borderBottom: "2px solid " + (activeTab === t.key ? "var(--accent)" : "transparent"),
          color: activeTab === t.key ? "var(--accent)" : "var(--text5)", cursor: "pointer", transition: "all .15s",
          display: "flex", alignItems: "center", gap: 6
        }
      }, t.icon(14), t.label))
    ),

    React.createElement("div", { style: { display: activeTab === "screener" ? "block" : "none" } },
      React.createElement(StockScreener, null)
    ),
    React.createElement("div", { style: { display: activeTab === "entryscore" ? "block" : "none" } },
      React.createElement(EntryScorePanel, { shares: holdings || [] })
    ),
    React.createElement("div", { style: { display: activeTab === "singlestock" ? "block" : "none" } },
      React.createElement(SingleStockAnalysis, null)
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Info (Changelog & Version History)
   ══════════════════════════════════════════════════════════════════════════ */
function InfoPage() {
  const [expandedVersion, setExpandedVersion] = useState(null);

  const CHANGELOG = [
    {
      version: "2.4.1",
      date: "July 2026",
      label: "Latest",
      changes: [
        { type: "fixed", text: "Refresh button now fetches live prices without stale cache — added cache-busting timestamp to Yahoo Finance API calls" },
        { type: "fixed", text: "Failed price fetches no longer overwrite valid cached prices (null results filtered from merge)" },
        { type: "fixed", text: "Analyze button now fetches fresh price before navigating to stock analysis page" },
        { type: "fixed", text: "FSA auto-save on page reload — wired up writeNow() handler so file is written after permission is restored" },
        { type: "fixed", text: "FSA Re-grant Permission now writes data immediately instead of silently failing" },
      ]
    },
    {
      version: "2.4.0",
      date: "July 2026",
      changes: [
        { type: "improved", text: "Technical indicator recalibration — aligned all scoring formulas with sample_indicators.js reference implementation" },
        { type: "fixed", text: "Bollinger Bands — switched from population to sample standard deviation for more accurate volatility bands" },
        { type: "fixed", text: "MFI — direction check now uses typical price instead of raw money flow for correct overbought/oversold detection" },
        { type: "fixed", text: "Aroon — corrected loop bounds and denominator (period instead of period-1) for proper oscillator calculation" },
        { type: "improved", text: "Volume Profile — 24 bins (from 12) using close prices with value area (VAH/VAL) computation for tighter support/resistance" },
        { type: "improved", text: "Entry Score — wider crossover lookback (3 candles via justCrossedAbove) for MACD, TSI, STC, Force Index, Ichimoku Tenkan/Kijun" },
        { type: "improved", text: "Entry Score — reweighted ADX, Supertrend, PSAR, Keltner, Darvas Box, RSI, StochRSI, Williams %R scoring for balanced signals" },
        { type: "improved", text: "Entry Score — added RS Mansfield relative strength, MFI/CMF crossedAbove helper, and Accumulation/Distribution composite" },
        { type: "improved", text: "Exit Score — replaced sector/FII dependencies with distribution day ratio and accumulation/detection logic" },
        { type: "improved", text: "Multi-TF Entry Score — added High Beta + Volatility penalty, Accumulation + MTF bonus, RS Mansfield + Aroon bonus, Above Key Levels bonus, Pivot R1 resistance detection" },
      ]
    },
    {
      version: "2.3.0",
      date: "July 2026",
      changes: [
        { type: "fixed", text: "JSON Export and Import functionality" },
      ]
    },
    {
      version: "2.1.0",
      date: "July 2026",
      changes: [
        { type: "feature", text: "Info page with full changelog, version history, feature highlights, and data source attributions" },
        { type: "improved", text: "Entry Score Analysis — category-filtered indicator grid with signal-colored cards replacing flat 2-column layout" },
        { type: "improved", text: "Entry Score Analysis — tab-based timeframe selector (Weekly/Daily/Hourly) replacing expandable 3-column cards" },
        { type: "improved", text: "Entry Score Analysis — 10 complex sub-indicator renderers (MACD, Bollinger Bands, Stochastic, Ichimoku, Chandelier, Heikin Ashi, Aroon, Vortex, Volume Profile, Relative Strength)" },
        { type: "improved", text: "Entry Score Analysis — dynamic signal interpretation via TechIndicators.interpret() instead of hardcoded thresholds" },
      ]
    },
    {
      version: "2.0.0",
      date: "July 2026",
      changes: [
        { type: "feature", text: "Single Stock Analysis — enter any ticker for full technical analysis with 50+ indicators, candlestick chart, and signal gauge" },
        { type: "feature", text: "Entry Score engine with multi-timeframe analysis (Weekly/Daily/Hourly)" },
        { type: "feature", text: "Stock Screener with custom filters and bulk scoring" },
        { type: "feature", text: "Exit Score — momentum-based exit engine with price recommendations (take profit, stop loss, trailing stop, time stop)" },
        { type: "feature", text: "Market Ticker — live scrolling strip for NSE indices + Gold/Silver/Crude commodities" },
        { type: "feature", text: "Market News panel powered by Marketaux (India markets + holdings news)" },
        { type: "feature", text: "Technical Indicators Inline — compact indicator view below each holding card" },
        { type: "feature", text: "Dark/Light theme toggle in Settings" },
        { type: "feature", text: "Data Backup & Restore (JSON export/import)" },
        { type: "feature", text: "File System Access auto-save support" },
        { type: "feature", text: "Google Drive cloud backup integration" },
        { type: "feature", text: "Trade History with P&L tracking and FY classification" },
        { type: "feature", text: "Reports page with portfolio analytics" },
        { type: "improved", text: "50+ technical indicators including SuperTrend, Ichimoku, Darvas Box, Smart Money, MTF Alignment" },
        { type: "improved", text: "Multiple CORS proxy fallbacks for reliable Yahoo Finance data fetching" },
        { type: "improved", text: "Responsive mobile layout with bottom navigation" },
        { type: "improved", text: "PWA support with service worker caching" },
      ]
    },
    {
      version: "1.0.0",
      date: "June 2026",
      label: "Initial Release",
      changes: [
        { type: "feature", text: "Portfolio tracking with buy/sell transactions" },
        { type: "feature", text: "Watchlist for tracking stocks of interest" },
        { type: "feature", text: "Real-time price fetching via Yahoo Finance" },
        { type: "feature", text: "IndexedDB persistence — all data stored locally on device" },
        { type: "feature", text: "INR currency formatting (Indian numbering system)" },
        { type: "feature", text: "Capital gains classification (STCG/LTCG) per Indian tax rules" },
        { type: "feature", text: "XIRR calculation for multi-cashflow holdings" },
        { type: "feature", text: "Financial Year tracking (April–March Indian FY)" },
        { type: "feature", text: "Basic technical indicators (SMA, EMA, RSI, MACD)" },
        { type: "improved", text: "Desktop sidebar + mobile bottom nav layout" },
        { type: "improved", text: "Splash screen with animated branding" },
        { type: "improved", text: "Auto-refresh prices every 60 seconds" },
        { type: "improved", text: "NSE holiday calendar for trading day detection" },
      ]
    }
  ];

  const TYPE_STYLES = {
    feature: { bg: "var(--accentbg)", border: "var(--accentbg5)", color: "var(--accent)", label: "New" },
    improved: { bg: "var(--infobg)", border: "var(--infoborder)", color: "var(--info)", label: "Improved" },
    fixed: { bg: "var(--warnbg)", border: "var(--warnborder)", color: "var(--warn)", label: "Fixed" },
  };

  return React.createElement("div", null,
    React.createElement("div", { style: { marginBottom: 24 } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "INFO"),
      React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Changelog & Version History")
    ),

    /* App identity card */
    React.createElement("div", { className: "stx-card", style: { marginBottom: 20, display: "flex", alignItems: "center", gap: 16 } },
      React.createElement("div", { style: { width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg, var(--accent), var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontFamily: "var(--font-heading)", fontSize: 24, flexShrink: 0, boxShadow: "0 4px 16px var(--accentbg)" } }, "S"),
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
          React.createElement("span", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Sto", React.createElement("span", { style: { color: "var(--accent)" } }, "X")),
          React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentbg)", padding: "2px 8px", borderRadius: 6 } }, "v" + (window.__STOX_APP_VERSION || "2.4.1"))
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

    /* Changelog */
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
      CHANGELOG.map(function (release) {
        var isExpanded = expandedVersion === release.version || expandedVersion === null;
        return React.createElement("div", { key: release.version, className: "stx-card", style: { padding: "16px 18px" } },
          React.createElement("div", {
            onClick: function () { setExpandedVersion(isExpanded && expandedVersion !== null ? null : release.version); },
            style: { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }
          },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
              React.createElement("div", { style: { width: 40, height: 40, borderRadius: 10, background: release.label === "Latest" ? "var(--accentbg)" : "var(--bg4)", border: "1px solid " + (release.label === "Latest" ? "var(--accentbg5)" : "var(--border)"), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } },
                React.createElement("span", { style: { fontSize: 12, fontWeight: 800, color: release.label === "Latest" ? "var(--accent)" : "var(--text4)", fontFamily: "var(--font-mono)" } }, "v" + release.version)
              ),
              React.createElement("div", null,
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                  React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Version " + release.version),
                  release.label === "Latest" && React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "var(--accentbg)", color: "var(--accent)", border: "1px solid var(--accentbg5)" } }, "LATEST")
                ),
                React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } }, release.date + " \u00b7 " + release.changes.length + " changes")
              )
            ),
            React.createElement("span", { style: { fontSize: 14, color: "var(--text5)", transition: "transform .2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" } }, "\u25bc")
          ),
          isExpanded && React.createElement("div", { style: { marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" } },
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
              release.changes.map(function (ch, ci) {
                var ts = TYPE_STYLES[ch.type] || TYPE_STYLES.feature;
                return React.createElement("div", { key: ci, style: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.5, animation: "stxFadeIn .25s ease " + (ci * 0.03) + "s both" } },
                  React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: ts.bg, border: "1px solid " + ts.border, color: ts.color, flexShrink: 0, marginTop: 2, letterSpacing: 0.3, textTransform: "uppercase" } }, ts.label),
                  React.createElement("span", { style: { color: "var(--text3)" } }, ch.text)
                );
              })
            )
          )
        );
      })
    ),

    /* Data sources note */
    React.createElement("div", { className: "stx-card", style: { marginTop: 16, padding: "14px 18px" } },
      React.createElement("h3", { style: { fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text)" } }, "Data Sources & Disclaimer"),
      React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", lineHeight: 1.7 } },
        React.createElement("p", null, "Stock prices sourced from Yahoo Finance via CORS proxies. Data may be delayed 15+ minutes."),
        React.createElement("p", null, "Market index data from NSE India API. Commodity prices from Stooq."),
        React.createElement("p", null, "News powered by Marketaux API."),
        React.createElement("p", { style: { marginTop: 6, color: "var(--text6)" } }, "This application is for informational purposes only and does not constitute financial advice. Always do your own research before investing.")
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Settings
   ══════════════════════════════════════════════════════════════════════════ */
function SettingsPage({ holdings, setHoldings, soldShareSnapshots, setSoldShareSnapshots, watchlist, setWatchlist }) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    dbGetSetting("stox_theme").then(t => {
      if (t) { setTheme(t); document.documentElement.setAttribute("data-theme", t); }
    });
  }, []);

  const changeTheme = (t) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    dbSetSetting("stox_theme", t);
  };

  return React.createElement("div", null,
    React.createElement("div", { style: { marginBottom: 20 } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "SETTINGS"),
      React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Settings")
    ),

    // Theme
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 12 } }, "Appearance"),
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        React.createElement("button", {
          className: "stx-btn " + (theme === "dark" ? "stx-btn-primary" : "stx-btn-ghost"),
          onClick: () => changeTheme("dark")
        }, "Dark"),
        React.createElement("button", {
          className: "stx-btn " + (theme === "light" ? "stx-btn-primary" : "stx-btn-ghost"),
          onClick: () => changeTheme("light")
        }, "Light")
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
        React.createElement("p", { style: { marginTop: 8 } }, "Version: ", window.__STOX_APP_VERSION || "2.4.1"),
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
          if (confirm("Clear ALL data? This cannot be undone.")) {
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
  const [theme, setTheme] = useState("light");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [loading, setLoading] = useState(true);

  // Init theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
        const [h, w, snaps, savedTheme] = await Promise.all([dbGetAll("holdings"), dbGetAll("watchlist"), loadSnapshots(), dbGetSetting("stox_theme")]);
        setHoldings(h);
        setWatchlist(w);
        setSoldShareSnapshots(snaps);
        if (savedTheme) { setTheme(savedTheme); document.documentElement.setAttribute("data-theme", savedTheme); }
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
      case "settings": return React.createElement(SettingsPage, pageProps);
      case "info": return React.createElement(InfoPage, null);
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
    { key: "info", label: "Info", icon: Icons.info },
  ];

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
            return React.createElement("button", {
              key: item.key, onClick: () => navigate(item.key),
              style: {
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                borderRadius: 10, border: "none", cursor: "pointer", transition: "all .15s",
                background: active ? "rgba(16,185,129,.15)" : "transparent",
                color: active ? "#10b981" : "rgba(255,255,255,.55)",
                fontWeight: active ? 700 : 500, fontSize: 13,
                fontFamily: "var(--font-body)", textAlign: "left",
                borderLeft: active ? "3px solid #10b981" : "3px solid transparent"
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
      NAV_ITEMS.map((item) =>
        React.createElement("button", {
          key: item.key,
          className: "stx-botnav-item" + (page === item.key ? " active" : ""),
          onClick: () => navigate(item.key)
        },
          React.createElement("span", null, item.icon(18)),
          React.createElement("span", null, item.label)
        )
      )
    ),
    React.createElement(ToastHost, null)
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MOUNT
   ══════════════════════════════════════════════════════════════════════════ */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
