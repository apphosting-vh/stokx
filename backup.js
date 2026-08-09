/* BACKUP / RESTORE MODULE — StoX */
/* File System API + StoX backup + finsight cross-app import */

function isFileSystemAccessSupported() {
  return typeof window !== "undefined" && "showSaveFilePicker" in window && "showOpenFilePicker" in window;
}

function downloadFallback(content, filename) {
  var blob = new Blob([content], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readFromFileInput(accept) {
  return new Promise(function(resolve, reject) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = accept || ".json";
    input.style.display = "none";
    input.onchange = function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) { reject(new Error("No file selected")); return; }
      var reader = new FileReader();
      reader.onload = function(ev) { resolve(ev.target.result); };
      reader.onerror = function() { reject(new Error("Failed to read file")); };
      reader.readAsText(file);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

/* ── Storage measurement helpers ── */
function _estBytes(obj) {
  try { return new Blob([JSON.stringify(obj)]).size; } catch (e) { return 0; }
}

function _scanIndexedDb(dbName) {
  return new Promise(function(resolve) {
    try {
      var req = indexedDB.open(dbName);
      req.onsuccess = function(e) {
        var db = e.target.result;
        var storeNames = [];
        for (var i = 0; i < db.objectStoreNames.length; i++) storeNames.push(db.objectStoreNames[i]);
        var out = { db: dbName, bytes: 0, records: 0, stores: {} };
        var pending = storeNames.length;
        if (pending === 0) { db.close(); resolve(out); return; }
        storeNames.forEach(function(sn) {
          var tx = db.transaction(sn, "readonly");
          var g = tx.objectStore(sn).getAll();
          g.onsuccess = function() {
            var recs = g.result || [];
            var stBytes = 0;
            for (var r = 0; r < recs.length; r++) stBytes += _estBytes(recs[r]);
            out.stores[sn] = { records: recs.length, bytes: stBytes };
            out.records += recs.length;
            out.bytes += stBytes;
            if (--pending === 0) { db.close(); resolve(out); }
          };
          g.onerror = function() { if (--pending === 0) { db.close(); resolve(out); } };
        });
      };
      req.onerror = function() { resolve(null); };
    } catch (e) { resolve(null); }
  });
}

function _scanLocalStorage() {
  var bytes = 0, keys = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i) || "";
      var v = "";
      try { v = localStorage.getItem(k) || ""; } catch (e) {}
      var b = _estBytes(k) + _estBytes(v);
      bytes += b;
      keys.push({ key: k, bytes: b });
    }
  } catch (e) {}
  keys.sort(function(a, b) { return b.bytes - a.bytes; });
  return { bytes: bytes, keys: keys };
}

function _readFsaFile() {
  return new Promise(function(resolve) {
    try {
      var fsa = window.__fsa;
      if (!fsa || !fsa.handle) { resolve({ connected: false }); return; }
      fsa.handle.getFile().then(function(file) {
        var info = { connected: true, bytes: file.size, name: fsa.filename || file.name, lastSaved: fsa.lastSaved, error: null };
        file.text().then(function(text) {
          try {
            var parsed = JSON.parse(text);
            var d = parsed && parsed.data ? parsed.data : null;
            if (d) {
              var keys = ["holdings", "soldShareSnapshots", "watchlist", "entryScores", "entrySnapshots", "entryPerfPrices", "screenerData", "screenerSnapshots", "screenerBookmarks", "screenerUnicorns", "singleStockSnapshots", "confTracker", "confTrackerPrices", "notes", "scoreConfig"];
              var sections = [], secTotal = 0;
              keys.forEach(function(k) { var b = _estBytes(d[k]); sections.push({ key: k, bytes: b }); secTotal += b; });
              info.sections = sections;
              info.sectionsBytes = secTotal;
            }
          } catch (e) {}
          resolve(info);
        }).catch(function() { resolve(info); });
      }).catch(function() {
        resolve({ connected: true, bytes: 0, name: (window.__fsa && window.__fsa.filename) || "", lastSaved: window.__fsa && window.__fsa.lastSaved, error: "permission" });
      });
    } catch (e) { resolve({ connected: false }); }
  });
}

async function buildStoxBackup(holdings, soldShareSnapshots, watchlist) {
  var entryScores = [];
  var entrySnapshots = [];
  var entryPerfPrices = {};
  var screenerResults = [];
  var screenerSnapshots = [];
  var screenerBookmarks = {};
  var screenerUnicorns = {};
  var singleStockSnapshots = [];
  var confTracker = [];
  var confTrackerPrices = {};
  var notes = [];
  var scoreConfig = null;
  try { entryScores = (await dbGetSetting("mm_entry_scores")) || []; } catch(e) {}
  try { entrySnapshots = (await dbGetSetting("mm_entry_score_snapshots")) || []; } catch(e) {}
  try { entryPerfPrices = (await dbGetSetting("mm_entry_perf_prices")) || {}; } catch(e) {}
  try { screenerResults = (await dbGetSetting("stox_screener_data")) || { results: [], timestamps: {}, scanTime: 0 }; } catch(e) {}
  try { screenerSnapshots = (await dbGetSetting("stox_screener_snapshots")) || []; } catch(e) {}
  try { screenerBookmarks = (await dbGetSetting("stox_screener_bookmarks")) || {}; } catch(e) {}
  try { screenerUnicorns = (await dbGetSetting("stox_screener_unicorns")) || {}; } catch(e) {}
  try { singleStockSnapshots = (await dbGetSetting("stox_single_stock_snapshots")) || []; } catch(e) {}
  try { confTracker = (await dbGetSetting("stox_conf_tracker")) || []; } catch(e) {}
  try { confTrackerPrices = (await dbGetSetting("stox_conf_tracker_prices")) || {}; } catch(e) {}
  try { notes = (await dbGetSetting("stox_notes")) || []; } catch(e) {}
  try {
    var saved = localStorage.getItem("stox_score_config");
    if (saved) scoreConfig = JSON.parse(saved);
  } catch(e) {}
  return {
    app: "StoX",
    version: 3,
    exportedAt: new Date().toISOString(),
    summary: {
      holdings: holdings.length,
      watchlist: watchlist.length,
      pastTrades: Object.values(soldShareSnapshots).reduce(function(s, a) { return s + a.length; }, 0),
      entryScores: entryScores.length,
      entrySnapshots: entrySnapshots.length,
      entryPerfPrices: Object.keys(entryPerfPrices).length,
      screenerStocks: screenerResults.results ? screenerResults.results.length : 0,
      screenerSnapshots: screenerSnapshots.length,
      screenerBookmarks: Object.keys(screenerBookmarks).length,
      screenerUnicorns: Object.keys(screenerUnicorns).length,
      singleStockSnapshots: singleStockSnapshots.length,
      confTracker: confTracker.length,
      confTrackerPrices: Object.keys(confTrackerPrices).length,
      notes: notes.length,
      scoreConfig: !!scoreConfig
    },
    data: {
      holdings: holdings,
      soldShareSnapshots: soldShareSnapshots,
      watchlist: watchlist,
      entryScores: entryScores,
      entrySnapshots: entrySnapshots,
      entryPerfPrices: entryPerfPrices,
      screenerData: screenerResults,
      screenerSnapshots: screenerSnapshots,
      screenerBookmarks: screenerBookmarks,
      screenerUnicorns: screenerUnicorns,
      singleStockSnapshots: singleStockSnapshots,
      confTracker: confTracker,
      confTrackerPrices: confTrackerPrices,
      notes: notes,
      scoreConfig: scoreConfig
    }
  };
}

async function saveBackupFile(payload) {
  var filename = "stox-backup-" + new Date().toISOString().split("T")[0] + ".json";
  var content = JSON.stringify(payload, null, 2);
  if (isFileSystemAccessSupported()) {
    try {
      var handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "JSON Backup", accept: { "application/json": [".json"] } }]
      });
      var writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
      console.warn("[StoX] File System API save failed, using fallback:", e);
    }
  }
  downloadFallback(content, filename);
  return true;
}

async function loadBackupFile() {
  if (isFileSystemAccessSupported()) {
    try {
      var handles = await window.showOpenFilePicker({
        types: [{ description: "JSON Backup", accept: { "application/json": [".json"] } }],
        multiple: false
      });
      var handle = handles[0];
      var file = await handle.getFile();
      return await file.text();
    } catch (e) {
      if (e.name === "AbortError") return null;
      console.warn("[StoX] File System API open failed, using fallback:", e);
    }
  }
  return await readFromFileInput(".json");
}

async function restoreStoxBackup(fileText) {
  var payload = JSON.parse(fileText);
  if (!payload.data || !payload.data.holdings) {
    throw new Error("Invalid StoX backup file — missing holdings data.");
  }
  var d = payload.data;
  if (d.entryScores) { try { await dbSetSetting("mm_entry_scores", d.entryScores); } catch(e) {} }
  if (d.entrySnapshots) { try { await dbSetSetting("mm_entry_score_snapshots", d.entrySnapshots); } catch(e) {} }
  if (d.entryPerfPrices) { try { await dbSetSetting("mm_entry_perf_prices", d.entryPerfPrices); } catch(e) {} }
  if (d.screenerData) { try { await dbSetSetting("stox_screener_data", d.screenerData); } catch(e) {} }
  if (d.screenerSnapshots) { try { await dbSetSetting("stox_screener_snapshots", d.screenerSnapshots); } catch(e) {} }
  if (d.screenerBookmarks && typeof d.screenerBookmarks === "object") { try { await dbSetSetting("stox_screener_bookmarks", d.screenerBookmarks); } catch(e) {} }
  if (d.screenerUnicorns && typeof d.screenerUnicorns === "object") { try { await dbSetSetting("stox_screener_unicorns", d.screenerUnicorns); } catch(e) {} }
  if (d.singleStockSnapshots) { try { await dbSetSetting("stox_single_stock_snapshots", d.singleStockSnapshots); } catch(e) {} }
  if (d.confTracker) { try { await dbSetSetting("stox_conf_tracker", d.confTracker); } catch(e) {} }
  if (d.confTrackerPrices && typeof d.confTrackerPrices === "object") { try { await dbSetSetting("stox_conf_tracker_prices", d.confTrackerPrices); } catch(e) {} }
  if (d.notes) { try { await dbSetSetting("stox_notes", d.notes); } catch(e) {} }
  if (d.scoreConfig && typeof d.scoreConfig === "object") {
    var curVer = (window.TechIndicators && window.TechIndicators.getScoreConfigVersion) ? window.TechIndicators.getScoreConfigVersion() : null;
    if (curVer != null && d.scoreConfig._v !== curVer) {
      d.scoreConfig = null; // discard stale score config from import
    }
    if (d.scoreConfig) {
      try {
        localStorage.setItem("stox_score_config", JSON.stringify(d.scoreConfig));
        if (window.TechIndicators && window.TechIndicators.setScoreConfig) {
          window.TechIndicators.setScoreConfig(d.scoreConfig);
        }
      } catch(e) {}
    }
  }
  var snaps = d.soldShareSnapshots || {};
  Object.keys(snaps).forEach(function(fyKey) {
    snaps[fyKey].forEach(function(sn) {
      if (sn.chartPts && sn.chartPts.length > 0 && sn.chartPts[0].close == null && sn.chartPts[0].value != null) {
        var q = Number(sn.qty) || 1;
        sn.chartPts = sn.chartPts.map(function(p) { return { date: p.date, close: q > 0 ? p.value / q : p.value }; });
      }
    });
  });
  return {
    holdings: d.holdings || [],
    soldShareSnapshots: snaps,
    watchlist: d.watchlist || []
  };
}

function importFinsightBackup(fileText) {
  var payload = JSON.parse(fileText);
  if (!payload.data) {
    throw new Error("Invalid backup file — missing data field.");
  }
  var d = payload.data;
  if (!d.banks && !d.cards && !d.shares) {
    throw new Error("Unrecognised backup format. Expected finsight or StoX backup.");
  }
  var now = Date.now();
  /* Filter: only active holdings (no sellDate). Sold ones are already in soldShareSnapshots. */
  var activeShares = (d.shares || []).filter(function(sh) { return !sh.sellDate; });
  var soldSharesInArray = (d.shares || []).filter(function(sh) { return !!sh.sellDate; });
  var holdings = activeShares.map(function(sh) {
    return {
      id: sh.id || (now.toString(36) + Math.random().toString(36).substr(2, 4)),
      company: sh.company || sh.ticker || "",
      ticker: (sh.ticker || "").toUpperCase(),
      qty: Number(sh.qty) || 0,
      buyPrice: Number(sh.buyPrice) || 0,
      avgPrice: Number(sh.buyPrice) || 0,
      currentPrice: Number(sh.currentPrice) || Number(sh.buyPrice) || 0,
      buyDate: sh.buyDate || "",
      brokerage: Number(sh.brokerage) || 0,
      sector: sh.sector || "",
      notes: sh.notes || "",
      entryScore: sh.entryScore != null ? Number(sh.entryScore) : null,
      priceTs: now,
      createdAt: now
    };
  });
  var soldShareSnapshots = d.soldShareSnapshots || {};
  Object.keys(soldShareSnapshots).forEach(function(fyKey) {
    soldShareSnapshots[fyKey].forEach(function(sn) {
      if (sn.chartPts && sn.chartPts.length > 0 && sn.chartPts[0].close == null && sn.chartPts[0].value != null) {
        var q = Number(sn.qty) || 1;
        sn.chartPts = sn.chartPts.map(function(p) { return { date: p.date, close: q > 0 ? p.value / q : p.value }; });
      }
    });
  });
  var summary = {
    finsightActiveHoldings: activeShares.length,
    finsightSoldShares: soldSharesInArray.length,
    finsightSnapshots: Object.values(soldShareSnapshots).reduce(function(s, a) { return s + a.length; }, 0)
  };
  return { holdings: holdings, soldShareSnapshots: soldShareSnapshots, summary: summary };
}

async function applyRestoredData(holdings, soldShareSnapshots, watchlist) {
  var db = await openDB();
  await new Promise(function(resolve, reject) {
    var tx = db.transaction(["holdings", "watchlist"], "readwrite");
    tx.objectStore("holdings").clear();
    tx.objectStore("watchlist").clear();
    tx.oncomplete = function() { db.close(); resolve(); };
    tx.onerror = function(e) { db.close(); reject(e.target.error); };
  });
  for (var i = 0; i < holdings.length; i++) {
    await dbPut("holdings", holdings[i]);
  }
  for (var j = 0; j < (watchlist || []).length; j++) {
    await dbPut("watchlist", watchlist[j]);
  }
  await persistSnapshots(soldShareSnapshots);
  window.dispatchEvent(new CustomEvent("stox:data-changed"));
}


/* BACKUP / RESTORE UI COMPONENT — DataBackupSection */
function DataBackupSection(props) {
  var holdings = props.holdings;
  var setHoldings = props.setHoldings;
  var soldShareSnapshots = props.soldShareSnapshots;
  var setSoldShareSnapshots = props.setSoldShareSnapshots;
  var watchlist = props.watchlist;
  var setWatchlist = props.setWatchlist;

  var _ref = React.useState("");
  var msg = _ref[0];
  var setMsg = _ref[1];

  function showMsg(text, type) {
    setMsg(text);
    setTimeout(function() { setMsg(""); }, 4000);
  }

  var [entryScores, setEntryScores] = React.useState([]);
  var [entrySnapshots, setEntrySnapshots] = React.useState([]);
  var [screenerData, setScreenerData] = React.useState({ results: [], timestamps: {}, scanTime: 0 });
  var [screenerSnapshots, setScreenerSnapshots] = React.useState([]);
  var [singleStockSnapshots, setSingleStockSnapshots] = React.useState([]);
  var [notes, setNotes] = React.useState([]);
  var [entryPerfPrices, setEntryPerfPrices] = React.useState({});
  var [screenerBookmarks, setScreenerBookmarks] = React.useState({});
  var [screenerUnicorns, setScreenerUnicorns] = React.useState({});
  var [confTracker, setConfTracker] = React.useState([]);
  var [confTrackerPrices, setConfTrackerPrices] = React.useState({});

  React.useEffect(function() {
    (async function() {
      try { var es = await dbGetSetting("mm_entry_scores"); if (es) setEntryScores(es); } catch(e) {}
      try { var esn = await dbGetSetting("mm_entry_score_snapshots"); if (esn) setEntrySnapshots(esn); } catch(e) {}
      try { var sd = await dbGetSetting("stox_screener_data"); if (sd) setScreenerData(sd); } catch(e) {}
      try { var ss = await dbGetSetting("stox_screener_snapshots"); if (ss) setScreenerSnapshots(ss); } catch(e) {}
      try { var sss = await dbGetSetting("stox_single_stock_snapshots"); if (sss) setSingleStockSnapshots(sss); } catch(e) {}
      try { var nt = await dbGetSetting("stox_notes"); if (nt) setNotes(nt); } catch(e) {}
      try { var epp = await dbGetSetting("mm_entry_perf_prices"); if (epp) setEntryPerfPrices(epp); } catch(e) {}
      try { var sbm = await dbGetSetting("stox_screener_bookmarks"); if (sbm) setScreenerBookmarks(sbm); } catch(e) {}
      try { var sun = await dbGetSetting("stox_screener_unicorns"); if (sun) setScreenerUnicorns(sun); } catch(e) {}
      try { var ct = await dbGetSetting("stox_conf_tracker"); if (ct) setConfTracker(ct); } catch(e) {}
      try { var ctp = await dbGetSetting("stox_conf_tracker_prices"); if (ctp) setConfTrackerPrices(ctp); } catch(e) {}
    })();
  }, []);

  var [storageStats, setStorageStats] = React.useState(null);
  React.useEffect(function() {
    var cancelled = false;
    (async function() {
      var idbMain = await _scanIndexedDb("stox_db");
      var idbFsa = await _scanIndexedDb("stox_fsa_db");
      var ls = _scanLocalStorage();
      var fsa = await _readFsaFile();
      var est = null;
      try { if (navigator.storage && navigator.storage.estimate) { var e = await navigator.storage.estimate(); if (e && e.quota) est = { usage: e.usage || 0, quota: e.quota }; } } catch (err) {}
      if (!cancelled) setStorageStats({ idbMain: idbMain, idbFsa: idbFsa, ls: ls, fsa: fsa, est: est });
    })();
    return function() { cancelled = true; };
  }, []);

  var storageInfo = React.useMemo(function() {
    var sz = function(obj) { try { return new Blob([JSON.stringify(obj)]).size; } catch (e) { return 0; } };
    var holdingsB = sz(holdings);
    var snapsB = sz(soldShareSnapshots);
    var watchB = sz(watchlist);
    var esB = sz(entryScores);
    var esnB = sz(entrySnapshots);
    var eppB = sz(entryPerfPrices);
    var scB = sz(screenerData);
    var scnB = sz(screenerSnapshots);
    var sbmB = sz(screenerBookmarks);
    var sunB = sz(screenerUnicorns);
    var sssB = sz(singleStockSnapshots);
    var ntB = sz(notes);
    var ctfB = sz(confTracker);
    var ctfpB = sz(confTrackerPrices);
    return {
      holdingsB: holdingsB, snapsB: snapsB, watchB: watchB,
      esB: esB, esnB: esnB, eppB: eppB,
      scB: scB, scnB: scnB, sbmB: sbmB, sunB: sunB,
      sssB: sssB, ntB: ntB, ctfB: ctfB, ctfpB: ctfpB,
      totalB: holdingsB + snapsB + watchB + esB + esnB + eppB + scB + scnB + sbmB + sunB + sssB + ntB + ctfB + ctfpB
    };
  }, [holdings, soldShareSnapshots, watchlist, entryScores, entrySnapshots, entryPerfPrices, screenerData, screenerSnapshots, screenerBookmarks, screenerUnicorns, singleStockSnapshots, notes, confTracker, confTrackerPrices]);

  var pastTradeCount = Object.values(soldShareSnapshots).reduce(function(s, a) { return s + a.length; }, 0);

  async function handleBackup() {
    try {
      var payload = await buildStoxBackup(holdings, soldShareSnapshots, watchlist);
      var ok = await saveBackupFile(payload);
      if (ok) showMsg("Backup downloaded successfully!");
    } catch (e) { showMsg("Backup failed: " + e.message); }
  }

  async function handleRestore() {
    try {
      if (!await showConfirm("This will OVERWRITE your current holdings, watchlist, trade history, and notes. Continue?")) return;
      var text = await loadBackupFile();
      if (!text) return;
      var result = await restoreStoxBackup(text);
      await applyRestoredData(result.holdings, result.soldShareSnapshots, result.watchlist);
      setHoldings(result.holdings);
      setSoldShareSnapshots(result.soldShareSnapshots);
      setWatchlist(result.watchlist);
      var snapCount = Object.values(result.soldShareSnapshots).reduce(function(s, a) { return s + a.length; }, 0);
      showMsg("Restored " + result.holdings.length + " holdings, " + snapCount + " past trades. Reload recommended.");
    } catch (e) { showMsg("Restore failed: " + e.message); }
  }

  async function handleFinsightImport() {
    try {
      if (!await showConfirm("Import holdings and past trades from a finsight backup? This will MERGE with your existing data.")) return;
      var text = await loadBackupFile();
      if (!text) return;
      var result = importFinsightBackup(text);
      if (result.holdings.length === 0 && result.summary.finsightSnapshots === 0) {
        showMsg("No shares or past trades found in the finsight backup.");
        return;
      }
      var existingTickers = new Set(holdings.map(function(h) { return h.ticker + "|" + h.buyDate; }));
      var newHoldings = result.holdings.filter(function(h) { return !existingTickers.has(h.ticker + "|" + h.buyDate); });
      var mergedHoldings = holdings.concat(newHoldings);
      var mergedSnaps = Object.assign({}, soldShareSnapshots);
      var fyKeys = Object.keys(result.soldShareSnapshots);
      for (var i = 0; i < fyKeys.length; i++) {
        var fyKey = fyKeys[i];
        var snaps = result.soldShareSnapshots[fyKey];
        var existing = mergedSnaps[fyKey] || [];
        var existingIds = new Set(existing.map(function(s) { return s.id; }));
        var toAdd = snaps.filter(function(s) { return !existingIds.has(s.id); });
        mergedSnaps[fyKey] = existing.concat(toAdd).sort(function(a, b) { return (b.savedAt || "").localeCompare(a.savedAt || ""); });
      }
      var db = await openDB();
      for (var j = 0; j < newHoldings.length; j++) {
        await dbPut("holdings", newHoldings[j]);
      }
      await persistSnapshots(mergedSnaps);
      setHoldings(mergedHoldings);
      setSoldShareSnapshots(mergedSnaps);
      var parts = [];
      if (newHoldings.length > 0) parts.push(newHoldings.length + " active holdings");
      if (result.summary.finsightSnapshots > 0) parts.push(result.summary.finsightSnapshots + " past trades");
      showMsg("Imported " + parts.join(" + ") + " from finsight.");
    } catch (e) { showMsg("Import failed: " + e.message); }
  }

  var cardStyle = { marginBottom: 16 };
  var labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--text5)", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 10 };
  var descStyle = { fontSize: 12, color: "var(--text4)", marginBottom: 14, lineHeight: 1.6 };

  var screenerCount = screenerData.results ? screenerData.results.length : 0;
  var fmtMB = function(v) {
    var mb = (v != null && isFinite(Number(v)) ? Number(v) : 0) / 1048576;
    if (mb >= 100) return mb.toFixed(0) + " MB";
    if (mb >= 1) return mb.toFixed(2) + " MB";
    return mb.toFixed(3) + " MB";
  };
  var totalCount = holdings.length + pastTradeCount + watchlist.length + entryScores.length + entrySnapshots.length + Object.keys(entryPerfPrices).length + screenerCount + screenerSnapshots.length + Object.keys(screenerBookmarks).length + Object.keys(screenerUnicorns).length + singleStockSnapshots.length + confTracker.length + Object.keys(confTrackerPrices).length + notes.length;
  var sectionList = [
    { label: "Holdings", val: holdings.length, bytes: storageInfo.holdingsB, color: "#10b981" },
    { label: "Past Trades", val: pastTradeCount, bytes: storageInfo.snapsB, color: "#6d28d9" },
    { label: "Watchlist", val: watchlist.length, bytes: storageInfo.watchB, color: "#0ea5e9" },
    { label: "Entry Scores", val: entryScores.length, bytes: storageInfo.esB, color: "#f97316" },
    { label: "Entry Snaps", val: entrySnapshots.length, bytes: storageInfo.esnB, color: "#fb7185" },
    { label: "Perf Prices", val: Object.keys(entryPerfPrices).length, bytes: storageInfo.eppB, color: "#f43f5e" },
    { label: "Screener", val: screenerCount, bytes: storageInfo.scB, color: "#8b5cf6" },
    { label: "Screener Snaps", val: screenerSnapshots.length, bytes: storageInfo.scnB, color: "#ec4899" },
    { label: "Screener Bkmk", val: Object.keys(screenerBookmarks).length, bytes: storageInfo.sbmB, color: "#c084fc" },
    { label: "Unicorns", val: Object.keys(screenerUnicorns).length, bytes: storageInfo.sunB, color: "#f97316" },
    { label: "Analysis Snaps", val: singleStockSnapshots.length, bytes: storageInfo.sssB, color: "#a78bfa" },
    { label: "Conf Tracker", val: confTracker.length, bytes: storageInfo.ctfB, color: "#22d3ee" },
    { label: "Conf Prices", val: Object.keys(confTrackerPrices).length, bytes: storageInfo.ctfpB, color: "#2dd4bf" },
    { label: "Notes", val: notes.length, bytes: storageInfo.ntB, color: "#f59e0b" }
  ];
  var stats = sectionList.concat([{ label: "Total", val: totalCount, bytes: storageInfo.totalB, color: "var(--text)" }]);
  var appMaxBytes = Math.max(1, sectionList.reduce(function(m, s) { return Math.max(m, s.bytes); }, 0));

  var ss = storageStats || {};
  var idbMain = ss.idbMain || null;
  var idbFsa = ss.idbFsa || null;
  var ls = ss.ls || null;
  var fsa = ss.fsa || null;
  var idbMainBytes = idbMain ? idbMain.bytes : 0;
  var idbMainRecords = idbMain ? idbMain.records : 0;
  var idbFsaBytes = idbFsa ? idbFsa.bytes : 0;
  var idbFsaRecords = idbFsa ? idbFsa.records : 0;
  var lsBytes = ls ? ls.bytes : 0;
  var lsKeys = ls ? ls.keys.length : 0;
  var fsaBytes = fsa && fsa.bytes ? fsa.bytes : 0;
  var grandBytes = idbMainBytes + idbFsaBytes + lsBytes + fsaBytes;
  var fsaConnected = fsa && fsa.connected;
  var fsaLabel = fsaConnected ? (fsa.name || "file") + (fsa.lastSaved ? " \u00b7 saved " + new Date(fsa.lastSaved).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "") : "Not connected";
  var FSA_SECTION_LABELS = {
    holdings: "Holdings", soldShareSnapshots: "Past Trades", watchlist: "Watchlist",
    entryScores: "Entry Scores", entrySnapshots: "Entry Snaps", entryPerfPrices: "Perf Prices",
    screenerData: "Screener", screenerSnapshots: "Screener Snaps", screenerBookmarks: "Screener Bkmk", screenerUnicorns: "Unicorns",
    singleStockSnapshots: "Analysis Snaps", confTracker: "Conf Tracker", confTrackerPrices: "Conf Prices",
    notes: "Notes"
  };

  var est = ss.est || null;
  var estPct = est && est.quota ? est.usage / est.quota * 100 : null;
  var MB = 1048576;
  var alerts = [];
  if (storageStats) {
    if (storageInfo.totalB >= 15 * MB) alerts.push({ sev: 2, title: "App data is heavy", msg: storageInfo.totalB + " bytes (" + fmtMB(storageInfo.totalB) + ") \u2014 JSON saves may freeze the UI. Trim snapshots or export & clear old data." });
    else if (storageInfo.totalB >= 8 * MB) alerts.push({ sev: 1, title: "App data growing", msg: storageInfo.totalB + " bytes (" + fmtMB(storageInfo.totalB) + ") \u2014 approaching the smooth-save threshold (~10 MB)." });
    if (fsaConnected && fsaBytes >= 15 * MB) alerts.push({ sev: 2, title: "FSA file is heavy", msg: fmtMB(fsaBytes) + " \u2014 auto-saves may lag. Start a fresh backup file or trim stored data." });
    else if (fsaConnected && fsaBytes >= 8 * MB) alerts.push({ sev: 1, title: "FSA file growing", msg: fmtMB(fsaBytes) + " \u2014 approaching the smooth auto-save threshold (~10 MB)." });
    if (lsBytes >= 4.5 * MB) alerts.push({ sev: 2, title: "localStorage near limit", msg: fmtMB(lsBytes) + " \u2014 browser cap is ~5 MB. Clear unused keys / re-authenticate to shrink tokens." });
    else if (lsBytes >= 3.5 * MB) alerts.push({ sev: 1, title: "localStorage filling up", msg: fmtMB(lsBytes) + " \u2014 getting close to the ~5 MB browser cap." });
    if (estPct != null) {
      if (estPct >= 80) alerts.push({ sev: 2, title: "Browser storage almost full", msg: fmtMB(est.usage) + " of " + fmtMB(est.quota) + " used (" + estPct.toFixed(0) + "%). Free up disk space or trim app data." });
      else if (estPct >= 60) alerts.push({ sev: 1, title: "Browser storage at " + estPct.toFixed(0) + "%", msg: fmtMB(est.usage) + " of " + fmtMB(est.quota) + " used by this site." });
    }
  }
  var alertTone = function(sev) { return sev === 2 ? { c: "#ef4444", bg: "rgba(239,68,68,.08)", bd: "rgba(239,68,68,.3)" } : { c: "#d97706", bg: "rgba(217,119,6,.08)", bd: "rgba(217,119,6,.3)" }; };
  var healthy = !!storageStats && alerts.length === 0;
  var estTone = estPct != null ? (estPct >= 80 ? "#ef4444" : estPct >= 60 ? "#d97706" : "#16a34a") : "#16a34a";

  var btnBase = {
    display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 17px", fontSize: 14,
    borderRadius: 8, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600, transition: "all .2s", border: "none"
  };

  return React.createElement("div", null,
    React.createElement("div", { className: "stx-card", style: cardStyle },
      React.createElement("div", { style: labelStyle }, "Storage Overview"),
      React.createElement("div", { style: { fontSize: 10.5, color: "var(--text6)", lineHeight: 1.6, marginBottom: 12 } },
        "App data lives in the browser IndexedDB. A copy is auto-saved to the FSA / Drive file, and small preferences (theme, sync tokens) sit in localStorage."
      ),
      storageStats && alerts.map(function(a, i) {
        var t = alertTone(a.sev);
        return React.createElement("div", { key: i, style: { display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: 9, marginBottom: 8, background: t.bg, border: "1px solid " + t.bd } },
          React.createElement("span", { style: { fontSize: 14, lineHeight: 1.2 } }, a.sev === 2 ? Ico.alertTriangle(14, "#ef4444") : Ico.alertTriangle(14, "#f59e0b")),
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 11.5, fontWeight: 700, color: t.c } }, a.title),
            React.createElement("div", { style: { fontSize: 10.5, color: "var(--text5)", marginTop: 2, lineHeight: 1.5 } }, a.msg)
          )
        );
      }),
      healthy && React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 9, marginBottom: 8, background: "rgba(22,163,74,.07)", border: "1px solid rgba(22,163,74,.25)", fontSize: 11, color: "#16a34a", fontWeight: 600 } },
        React.createElement(React.Fragment, null, Ico.check(14, "#22c55e"), " All storage levels healthy.")
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 14 } },
        React.createElement("div", { style: { background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 } }, "IndexedDB"),
          React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: "#0ea5e9" } }, storageStats ? fmtMB(idbMainBytes) : "\u2026"),
          React.createElement("div", { style: { fontSize: 9.5, color: "var(--text5)", marginTop: 2 } }, idbMainRecords + " records \u00b7 " + idbFsaRecords + " fsa handle")
        ),
        React.createElement("div", { style: { background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 } }, "localStorage"),
          React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: "#f59e0b" } }, storageStats ? fmtMB(lsBytes) : "\u2026"),
          React.createElement("div", { style: { fontSize: 9.5, color: "var(--text5)", marginTop: 2 } }, lsKeys + " keys")
        ),
        React.createElement("div", { style: { background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", border: "1px solid " + (fsaConnected ? "rgba(139,92,246,.35)" : "var(--border)") } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 } }, "FSA / Drive File"),
          React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: fsaConnected ? "#8b5cf6" : "var(--text5)" } }, fsaConnected ? fmtMB(fsaBytes) : "\u2014"),
          React.createElement("div", { style: { fontSize: 9.5, color: "var(--text5)", marginTop: 2 } }, fsaLabel)
        ),
        React.createElement("div", { style: { background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 } }, "Grand Total"),
          React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)" } }, storageStats ? fmtMB(grandBytes) : "\u2026"),
          React.createElement("div", { style: { fontSize: 9.5, color: "var(--text5)", marginTop: 2 } }, "physical footprint on disk")
        )
      ),
      storageStats && est && React.createElement("div", { style: { background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border)", marginBottom: 14 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
          React.createElement("span", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 } }, "Browser Storage Quota"),
          React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: estTone, fontFamily: "var(--font-mono)" } }, fmtMB(est.usage) + " / " + fmtMB(est.quota) + (estPct != null ? " \u00b7 " + estPct.toFixed(0) + "%" : ""))
        ),
        React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
          React.createElement("div", { style: { width: (estPct != null ? Math.max(0, Math.min(100, estPct)) : 0) + "%", height: "100%", background: estTone, borderRadius: 3, transition: "width .4s" } })
        ),
        React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", marginTop: 5 } }, "Total browser quota for this site (IndexedDB + Cache + localStorage). Writes fail once full.")
      ),
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text4)", marginBottom: 8 } }, "App Data Breakdown"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 } },
        stats.map(function(s) {
          var pct = s.label === "Total" ? 100 : Math.max(0, Math.min(100, Math.round(s.bytes / appMaxBytes * 100)));
          return React.createElement("div", { key: s.label, style: { background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", border: "1px solid " + (s.label === "Total" ? "rgba(139,92,246,.35)" : "var(--border)") } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 3 } }, s.label),
            React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: s.color } }, s.val),
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 1 } }, fmtMB(s.bytes)),
            React.createElement("div", { style: { height: 4, borderRadius: 2, background: "var(--bg5)", marginTop: 6, overflow: "hidden" } },
              React.createElement("div", { style: { width: pct + "%", height: "100%", background: s.color, borderRadius: 2, transition: "width .4s" } })
            )
          );
        })
      ),
      fsaConnected && fsa.sections && React.createElement("div", { style: { marginTop: 14 } },
        React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text4)", marginBottom: 8 } }, "FSA / Drive File Breakdown"),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginBottom: 8 } }, "Disk copy of the same sections \u2014 " + fmtMB(fsaBytes) + " total on disk."),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 } },
          fsa.sections.filter(function(sx) { return sx.bytes > 0; }).map(function(sx) {
            var pct = fsa.sectionsBytes > 0 ? Math.max(0, Math.min(100, Math.round(sx.bytes / fsa.sectionsBytes * 100))) : 0;
            return React.createElement("div", { key: sx.key, style: { background: "var(--bg3)", borderRadius: 10, padding: "9px 12px", border: "1px solid var(--border)" } },
              React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 2 } }, FSA_SECTION_LABELS[sx.key] || sx.key),
              React.createElement("div", { style: { fontSize: 12.5, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text2)" } }, fmtMB(sx.bytes)),
              React.createElement("div", { style: { height: 3, borderRadius: 2, background: "var(--bg5)", marginTop: 4, overflow: "hidden" } },
                React.createElement("div", { style: { width: pct + "%", height: "100%", background: "#8b5cf6", borderRadius: 2 } })
              )
            );
          })
        )
      ),
      storageStats && ls && ls.keys.length > 0 && React.createElement("div", { style: { marginTop: 14 } },
        React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text4)", marginBottom: 8 } }, "localStorage Keys"),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
          ls.keys.slice(0, 8).map(function(ks) {
            return React.createElement("div", { key: ks.key, style: { padding: "6px 10px", borderRadius: 7, background: "var(--bg4)", border: "1px solid var(--border)", fontSize: 10, color: "var(--text5)", fontFamily: "var(--font-mono)" } },
              ks.key + " \u00b7 " + fmtMB(ks.bytes)
            );
          })
        )
      )
    ),

    React.createElement("div", { className: "stx-card", style: cardStyle },
      React.createElement("div", { style: labelStyle }, "Backup Data"),
      React.createElement("p", { style: descStyle }, "Download a complete snapshot of your portfolio, watchlist, trade history, and entry scores as a JSON file. Store it safely or import it on another device."),
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } },
        React.createElement("button", {
          onClick: handleBackup,
          style: Object.assign({}, btnBase, { background: "rgba(16,185,129,.13)", border: "1px solid rgba(16,185,129,.35)", color: "#10b981" })
        }, React.createElement(React.Fragment, null, Ico.download(14), " Download Backup")),
        React.createElement("button", {
          onClick: handleRestore,
          style: Object.assign({}, btnBase, { background: "rgba(109,40,217,.13)", border: "1px solid rgba(109,40,217,.35)", color: "#6d28d9" })
        }, React.createElement(React.Fragment, null, Ico.upload(14), " Restore from Backup"))
      )
    ),

    React.createElement("div", { className: "stx-card", style: cardStyle },
      React.createElement("div", { style: labelStyle }, "Import from Finsight"),
      React.createElement("p", { style: descStyle }, "Import active holdings and past trade snapshots from a finsight (Money Manager) backup. This merges with your existing data — duplicates by ticker+buy date are skipped."),
      React.createElement("button", {
        onClick: handleFinsightImport,
        style: Object.assign({}, btnBase, { background: "rgba(14,165,233,.13)", border: "1px solid rgba(14,165,233,.35)", color: "#0ea5e9" })
      }, React.createElement(React.Fragment, null, Ico.inbox(14), " Import from Finsight"))
    ),

    msg ? React.createElement("div", {
      style: { padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600,
        background: msg.indexOf("failed") > -1 || msg.indexOf("Failed") > -1 ? "rgba(239,68,68,.1)" : "rgba(16,185,129,.1)",
        border: "1px solid " + (msg.indexOf("failed") > -1 || msg.indexOf("Failed") > -1 ? "rgba(239,68,68,.25)" : "rgba(16,185,129,.25)"),
        color: msg.indexOf("failed") > -1 || msg.indexOf("Failed") > -1 ? "#ef4444" : "#10b981" }
    }, msg) : null
  );
}

