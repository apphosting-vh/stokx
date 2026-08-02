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

async function buildStoxBackup(holdings, soldShareSnapshots, watchlist) {
  var entryScores = [];
  var entrySnapshots = [];
  var entryPerfPrices = {};
  var screenerResults = [];
  var screenerSnapshots = [];
  var screenerBookmarks = {};
  var singleStockSnapshots = [];
  var notes = [];
  try { entryScores = (await dbGetSetting("mm_entry_scores")) || []; } catch(e) {}
  try { entrySnapshots = (await dbGetSetting("mm_entry_score_snapshots")) || []; } catch(e) {}
  try { entryPerfPrices = (await dbGetSetting("mm_entry_perf_prices")) || {}; } catch(e) {}
  try { screenerResults = (await dbGetSetting("stox_screener_data")) || { results: [], timestamps: {}, scanTime: 0 }; } catch(e) {}
  try { screenerSnapshots = (await dbGetSetting("stox_screener_snapshots")) || []; } catch(e) {}
  try { screenerBookmarks = (await dbGetSetting("stox_screener_bookmarks")) || {}; } catch(e) {}
  try { singleStockSnapshots = (await dbGetSetting("stox_single_stock_snapshots")) || []; } catch(e) {}
  try { notes = (await dbGetSetting("stox_notes")) || []; } catch(e) {}
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
      singleStockSnapshots: singleStockSnapshots.length,
      notes: notes.length
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
      singleStockSnapshots: singleStockSnapshots,
      notes: notes
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
  if (d.singleStockSnapshots) { try { await dbSetSetting("stox_single_stock_snapshots", d.singleStockSnapshots); } catch(e) {} }
  if (d.notes) { try { await dbSetSetting("stox_notes", d.notes); } catch(e) {} }
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

  React.useEffect(function() {
    (async function() {
      try { var es = await dbGetSetting("mm_entry_scores"); if (es) setEntryScores(es); } catch(e) {}
      try { var esn = await dbGetSetting("mm_entry_score_snapshots"); if (esn) setEntrySnapshots(esn); } catch(e) {}
      try { var sd = await dbGetSetting("stox_screener_data"); if (sd) setScreenerData(sd); } catch(e) {}
      try { var ss = await dbGetSetting("stox_screener_snapshots"); if (ss) setScreenerSnapshots(ss); } catch(e) {}
      try { var sss = await dbGetSetting("stox_single_stock_snapshots"); if (sss) setSingleStockSnapshots(sss); } catch(e) {}
      try { var nt = await dbGetSetting("stox_notes"); if (nt) setNotes(nt); } catch(e) {}
    })();
  }, []);

  var storageInfo = React.useMemo(function() {
    var holdingsKB = new Blob([JSON.stringify(holdings)]).size / 1024;
    var snapsKB = new Blob([JSON.stringify(soldShareSnapshots)]).size / 1024;
    var watchKB = new Blob([JSON.stringify(watchlist)]).size / 1024;
    var esKB = new Blob([JSON.stringify(entryScores)]).size / 1024;
    var esnKB = new Blob([JSON.stringify(entrySnapshots)]).size / 1024;
    var scKB = new Blob([JSON.stringify(screenerData)]).size / 1024;
    var scnKB = new Blob([JSON.stringify(screenerSnapshots)]).size / 1024;
    var sssKB = new Blob([JSON.stringify(singleStockSnapshots)]).size / 1024;
    var ntKB = new Blob([JSON.stringify(notes)]).size / 1024;
    return {
      holdingsKB: holdingsKB.toFixed(1),
      snapsKB: snapsKB.toFixed(1),
      watchKB: watchKB.toFixed(1),
      esKB: esKB.toFixed(1),
      esnKB: esnKB.toFixed(1),
      scKB: scKB.toFixed(1),
      scnKB: scnKB.toFixed(1),
      sssKB: sssKB.toFixed(1),
      ntKB: ntKB.toFixed(1),
      totalKB: (holdingsKB + snapsKB + watchKB + esKB + esnKB + scKB + scnKB + sssKB + ntKB).toFixed(1)
    };
  }, [holdings, soldShareSnapshots, watchlist, entryScores, entrySnapshots, screenerData, screenerSnapshots, singleStockSnapshots, notes]);

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
  var stats = [
    { label: "Holdings", val: holdings.length, sub: storageInfo.holdingsKB + " KB", color: "#10b981" },
    { label: "Past Trades", val: pastTradeCount, sub: storageInfo.snapsKB + " KB", color: "#6d28d9" },
    { label: "Watchlist", val: watchlist.length, sub: storageInfo.watchKB + " KB", color: "#0ea5e9" },
    { label: "Entry Scores", val: entryScores.length, sub: storageInfo.esKB + " KB", color: "#f97316" },
    { label: "Screener", val: screenerCount, sub: storageInfo.scKB + " KB", color: "#8b5cf6" },
    { label: "Screener Snaps", val: screenerSnapshots.length, sub: storageInfo.scnKB + " KB", color: "#ec4899" },
    { label: "Analysis Snaps", val: singleStockSnapshots.length, sub: storageInfo.sssKB + " KB", color: "#a78bfa" },
    { label: "Notes", val: notes.length, sub: storageInfo.ntKB + " KB", color: "#f59e0b" },
    { label: "Total", val: holdings.length + pastTradeCount + watchlist.length + entryScores.length + screenerCount + screenerSnapshots.length + singleStockSnapshots.length + notes.length, sub: storageInfo.totalKB + " KB", color: "var(--text)" }
  ];

  var btnBase = {
    display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 17px", fontSize: 14,
    borderRadius: 8, cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 600, transition: "all .2s", border: "none"
  };

  return React.createElement("div", null,
    React.createElement("div", { className: "stx-card", style: cardStyle },
      React.createElement("div", { style: labelStyle }, "Storage Overview"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 } },
        stats.map(function(s) {
          return React.createElement("div", { key: s.label, style: { background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border)" } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 3 } }, s.label),
            React.createElement("div", { style: { fontSize: 20, fontWeight: 800, fontFamily: "var(--font-heading)", color: s.color } }, s.val),
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, s.sub)
          );
        })
      )
    ),

    React.createElement("div", { className: "stx-card", style: cardStyle },
      React.createElement("div", { style: labelStyle }, "Backup Data"),
      React.createElement("p", { style: descStyle }, "Download a complete snapshot of your portfolio, watchlist, trade history, and entry scores as a JSON file. Store it safely or import it on another device."),
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } },
        React.createElement("button", {
          onClick: handleBackup,
          style: Object.assign({}, btnBase, { background: "rgba(16,185,129,.13)", border: "1px solid rgba(16,185,129,.35)", color: "#10b981" })
        }, "\u2B07 Download Backup"),
        React.createElement("button", {
          onClick: handleRestore,
          style: Object.assign({}, btnBase, { background: "rgba(109,40,217,.13)", border: "1px solid rgba(109,40,217,.35)", color: "#6d28d9" })
        }, "\u2B06 Restore from Backup")
      )
    ),

    React.createElement("div", { className: "stx-card", style: cardStyle },
      React.createElement("div", { style: labelStyle }, "Import from Finsight"),
      React.createElement("p", { style: descStyle }, "Import active holdings and past trade snapshots from a finsight (Money Manager) backup. This merges with your existing data — duplicates by ticker+buy date are skipped."),
      React.createElement("button", {
        onClick: handleFinsightImport,
        style: Object.assign({}, btnBase, { background: "rgba(14,165,233,.13)", border: "1px solid rgba(14,165,233,.35)", color: "#0ea5e9" })
      }, "\u{1F4E5} Import from Finsight")
    ),

    msg ? React.createElement("div", {
      style: { padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600,
        background: msg.indexOf("failed") > -1 || msg.indexOf("Failed") > -1 ? "rgba(239,68,68,.1)" : "rgba(16,185,129,.1)",
        border: "1px solid " + (msg.indexOf("failed") > -1 || msg.indexOf("Failed") > -1 ? "rgba(239,68,68,.25)" : "rgba(16,185,129,.25)"),
        color: msg.indexOf("failed") > -1 || msg.indexOf("Failed") > -1 ? "#ef4444" : "#10b981" }
    }, msg) : null
  );
}

