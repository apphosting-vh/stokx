/* ══════════════════════════════════════════════════════════════════════════
   Pattern Dashboard — StoX
   React UI component for batch backtest management, pattern browsing,
   and insights visualization.

   Depends on: React, window.PatternStore, window.BatchBacktest,
               window.PatternScoring, window.OHLCVFetcher
   ══════════════════════════════════════════════════════════════════════════ */

window.PatternDashboard = (function () {

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useMemo = React.useMemo;
  var useRef = React.useRef;

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /**
   * Get the full NIFTY 200 symbol list from the app's global.
   * Falls back to a hardcoded minimal list if the global is not available.
   */
  function getStockUniverse() {
    if (window.NIFTY_200 && window.NIFTY_200.length > 0) {
      return window.NIFTY_200;
    }
    // Minimal fallback — the app should always provide window.NIFTY_200
    return [
      {t:"RELIANCE",cap:"L"},{t:"TCS",cap:"L"},{t:"HDFCBANK",cap:"L"},{t:"INFY",cap:"L"},
      {t:"ICICIBANK",cap:"L"},{t:"HINDUNILVR",cap:"L"},{t:"SBIN",cap:"L"},{t:"BHARTIARTL",cap:"L"},
      {t:"ITC",cap:"L"},{t:"KOTAKBANK",cap:"L"},{t:"LT",cap:"L"},{t:"AXISBANK",cap:"L"},
      {t:"BAJFINANCE",cap:"L"},{t:"MARUTI",cap:"L"},{t:"SUNPHARMA",cap:"L"},{t:"TITAN",cap:"L"}
    ];
  }

  /** Pick a random subset of symbols based on batchCap value */
  function pickSymbols(batchCap) {
    var universe = getStockUniverse();
    var syms;
    if (batchCap === "nifty100") {
      syms = shuffleArray(universe.filter(function(s) { return s.cap === "L"; })).map(function(s) { return s.t; });
    } else if (batchCap === "all") {
      syms = universe.map(function(s) { return s.t; });
    } else {
      var n = Math.min(parseInt(batchCap, 10) || 20, universe.length);
      syms = shuffleArray(universe).slice(0, n).map(function(s) { return s.t; });
    }
    return syms;
  }

  /** Estimated duration label based on stock count */
  function estimateTime(count) {
    if (count <= 10) return "~30 s";
    if (count <= 20) return "~1 min";
    if (count <= 50) return "~3 min";
    if (count <= 100) return "~8 min";
    if (count <= 150) return "~12 min";
    return "~20 min";
  }

  /* ── Main Dashboard Component ─────────────────────────────────────────── */

  function Dashboard(props) {
    var onBack = props.onBack || null;
    var stocksList = props.stocks || getStockUniverse().map(function (s) { return s.t; });

    var _s = useState("overview"); // tab: overview | run | browse | insights | settings | ml | live
    var tab = _s[0], setTab = _s[1];

    var _p = useState(null); // patterns
    var patterns = _p[0], setPatterns = _p[1];

    var _stats = useState(null);
    var stats = _stats[0], setStats = _stats[1];

    var _report = useState(null);
    var report = _report[0], setReport = _report[1];


    var _progress = useState({ current: 0, total: 0, symbol: "", phase: "" });
    var progress = _progress[0], setProgress = _progress[1];

    var _error = useState(null);
    var error = _error[0], setError = _error[1];

    // Run Batch tab state (must be at component top-level — Rules of Hooks)
    var _btConfig = useState(function () {
      var defaults = { targetProfitPct: 4, holdingPeriodDays: 14, threshold: 65, sampleEvery: 2 };
      try {
        var saved = localStorage.getItem("stox_best_bt_config");
        if (saved) {
          var c = JSON.parse(saved);
          var v = {};
          if (typeof c.targetProfitPct === "number" && isFinite(c.targetProfitPct) && c.targetProfitPct > 0) v.targetProfitPct = c.targetProfitPct;
          if (typeof c.holdingPeriodDays === "number" && isFinite(c.holdingPeriodDays) && c.holdingPeriodDays > 0) v.holdingPeriodDays = c.holdingPeriodDays;
          if (typeof c.threshold === "number" && isFinite(c.threshold) && c.threshold > 0 && c.threshold <= 100) v.threshold = c.threshold;
          if (typeof c.sampleEvery === "number" && isFinite(c.sampleEvery) && c.sampleEvery >= 1) v.sampleEvery = c.sampleEvery;
          if (v.targetProfitPct != null && v.holdingPeriodDays != null && v.threshold != null && v.sampleEvery != null) {
            return Object.assign({}, defaults, v);
          }
        }
      } catch (e) {}
      return defaults;
    });
    var btConfig = _btConfig[0], setBtConfig = _btConfig[1];
    var _btRunning = useState(false);
    var btRunning = _btRunning[0], setBtRunning = _btRunning[1];
    var _btLog = useState([]);
    var btLog = _btLog[0], setBtLog = _btLog[1];
    var btRunnerRef = useRef(null);
    var _btCap = useState("20");
    var btCap = _btCap[0], setBtCap = _btCap[1];
    // ML tab state (must be at component top-level — Rules of Hooks)
    var _mlStatus = useState(null);
    var mlStatus = _mlStatus[0], setMlStatus = _mlStatus[1];
    var _mlTraining = useState(false);
    var mlTraining = _mlTraining[0], setMlTraining = _mlTraining[1];
    var _mlLog = useState([]);
    var mlLog = _mlLog[0], setMlLog = _mlLog[1];
    var _mlOptimizing = useState(false);
    var mlOptimizing = _mlOptimizing[0], setMlOptimizing = _mlOptimizing[1];
    var _mlTrainMode = useState("walkforward");
    var mlTrainMode = _mlTrainMode[0], setMlTrainMode = _mlTrainMode[1];

    // Live Expert tab state (must be at component top-level — Rules of Hooks)
    var _liveStatus = useState(null);
    var liveStatus = _liveStatus[0], setLiveStatus = _liveStatus[1];
    var _liveBusy = useState(false);
    var liveBusy = _liveBusy[0], setLiveBusy = _liveBusy[1];
    var _liveLog = useState([]);
    var liveLog = _liveLog[0], setLiveLog = _liveLog[1];
    var _liveSignals = useState(null);
    var liveSignals = _liveSignals[0], setLiveSignals = _liveSignals[1];
    var _liveTracker = useState(null);
    var liveTracker = _liveTracker[0], setLiveTracker = _liveTracker[1];

    // Load ML status on mount
    useEffect(function () {
      loadMLStatus();
      loadLiveStatus();
    }, []);

    // Remove confirm state (must be at top-level with other hooks)
    var _removeConfirm = useState(false);
    var removeConfirm = _removeConfirm[0], setRemoveConfirm = _removeConfirm[1];

    // Pattern Settings tab state (all-stock weight override table)
    var _pSettings = useState(null);
    var patternSettings = _pSettings[0], setPatternSettings = _pSettings[1];
    var _pSearch = useState("");
    var patternSearch = _pSearch[0], setPatternSearch = _pSearch[1];
    var _rsAll = useState(false);
    var resetAllConfirm = _rsAll[0], setResetAllConfirm = _rsAll[1];
    var _bulkSel = useState({});
    var bulkSel = _bulkSel[0], setBulkSel = _bulkSel[1];
    var _bulkDeltas = useState({ trendHealth: 0, pullbackQuality: 0, prob4: 0, swingPotential: 0 });
    var bulkDeltas = _bulkDeltas[0], setBulkDeltas = _bulkDeltas[1];
    var _bulkConfirm = useState(false);
    var bulkConfirm = _bulkConfirm[0], setBulkConfirm = _bulkConfirm[1];
    var _pBlend = useState(0.5);
    var patternBlend = _pBlend[0], setPatternBlend = _pBlend[1];

    useEffect(function () {
      if (tab !== "settings") return;
      if (patternSettings) return;
      var cancelled = false;
      (async function () {
        try {
          if (!window.PatternStore) { setPatternSettings([]); return; }
          await window.PatternStore.init();
          var univ = getStockUniverse().map(function (s) { return s.t; });
          var pats = await window.PatternStore.getAll();
          var ov = await window.PatternStore.getWeightOverrides();
          var bl = 0.5;
          try {
            var blv = await window.PatternStore.getWeightBlend();
            if (blv != null) bl = blv;
          } catch (e) {}
          if (!cancelled) setPatternBlend(bl);
          var patMap = {};
          pats.forEach(function (p) { if (p && p.symbol) patMap[p.symbol] = p; });
          var rows = univ.map(function (sym) {
            var p = patMap[sym];
            var lw = (p && p.indicatorWeights) ? p.indicatorWeights : null;
            if (p && window.PatternScoring && window.PatternScoring.resolveLearnedWeights) {
              var rlw = window.PatternScoring.resolveLearnedWeights(p, true);
              if (rlw) lw = rlw;
            }
            var o = ov[sym] || null;
            var base = function (k) { return (lw && lw[k] != null) ? lw[k] : 0.25; };
            var learnedRaw = { trendHealth: base("trendHealth"), pullbackQuality: base("pullbackQuality"), prob4: base("prob4"), swingPotential: base("swingPotential") };
            var learnedEff = blendW(learnedRaw, bl);
            return {
              symbol: sym,
              hasPattern: !!p,
              learned: learnedRaw,
              trades: p && p.tradeStats ? p.tradeStats.totalTrades : 0,
              winRate: p && p.tradeStats ? p.tradeStats.winRate : null,
              backtestDate: p ? (p.backtestDate || null) : null,
              enabled: !!o,
              draft: o ? {
                trendHealth: o.trendHealth != null ? o.trendHealth : learnedEff.trendHealth,
                pullbackQuality: o.pullbackQuality != null ? o.pullbackQuality : learnedEff.pullbackQuality,
                prob4: o.prob4 != null ? o.prob4 : learnedEff.prob4,
                swingPotential: o.swingPotential != null ? o.swingPotential : learnedEff.swingPotential
              } : { trendHealth: learnedEff.trendHealth, pullbackQuality: learnedEff.pullbackQuality, prob4: learnedEff.prob4, swingPotential: learnedEff.swingPotential }
            };
          });
          if (!cancelled) setPatternSettings(rows);
        } catch (err) {
          if (!cancelled) setPatternSettings([]);
        }
      })();
      return function () { cancelled = true; };
    }, [tab, patternSettings]);

    async function loadMLStatus() {
      try {
        if (window.MLTrainer && window.MLTrainer.getModelStatus) {
          var status = await window.MLTrainer.getModelStatus();
          setMlStatus(status);
        }
      } catch (e) {}
    }

    async function loadLiveStatus() {
      try {
        if (window.LiveML && window.LiveML.getStatus) {
          var status = await window.LiveML.getStatus();
          setLiveStatus(status);
        }
      } catch (e) {}
      try {
        if (window.LiveML && window.LiveML.getTracker) {
          var tr = await window.LiveML.getTracker();
          setLiveTracker(tr);
        }
      } catch (e) {}
    }

    var _btSelectedCount = useState(function () {
      return Math.min(parseInt("20", 10) || 20, getStockUniverse().length);
    });
    var btSelectedCount = _btSelectedCount[0], setBtSelectedCount = _btSelectedCount[1];

    // Load existing patterns on mount
    useEffect(function () {
      loadExistingData();
    }, []);

    async function loadExistingData() {
      try {
        await window.PatternStore.init();
        var p = await window.PatternStore.getAll();
        setPatterns(p);
        var s = await window.PatternStore.getStats();
        setStats(s);
        if (p.length > 0 && window.BatchBacktest) {
          var r = await window.BatchBacktest.create({}).generateReport();
          setReport(r);
        }
      } catch (e) {
        console.error("Failed to load patterns:", e);
      }
    }

    /* ── Remove Patterns Handler (defined before return for Babel hoisting) ── */
    async function handleRemovePatterns() {
      if (!removeConfirm) {
        setRemoveConfirm(true);
        setTimeout(function () { setRemoveConfirm(false); }, 5000);
        return;
      }
      setRemoveConfirm(false);
      try {
        setError(null);
        await window.PatternStore.init();
        var count = (await window.PatternStore.getAll()).length;
        console.log("[PatternDashboard] Removing " + count + " patterns...");
        if (window.PatternStore.clearEverything) {
          await window.PatternStore.clearEverything();
        } else {
          await window.PatternStore.clearAll();
        }
        if (window.PatternStore.clearLiveFeatures) {
          await window.PatternStore.clearLiveFeatures();
        }
        console.log("[PatternDashboard] IDB cleared, reloading cache...");
        if (window.reloadPatternCache) await window.reloadPatternCache();
        setPatterns([]);
        setStats(null);
        setReport(null);
        setError("Cleared " + count + " patterns — ready for fresh backtest");
        setTimeout(function () { setError(null); }, 4000);
      } catch (err) {
        console.error("[PatternDashboard] Remove failed:", err);
        setError("Clear failed: " + err.message);
      }
    }

    /* ── Export/Import Handlers (defined before return for Babel hoisting) ── */
    async function handleExport() {
      try {
        var json = await window.PatternStore.exportJSON();
        var blob = new Blob([json], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "stox-patterns-" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError("Export failed: " + e.message);
      }
    }

    function handleImportClick() {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      input.addEventListener("change", function (e) {
        handleImportFile(e);
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    }

    async function handleImportFile(e) {
      var file = e.target && e.target.files && e.target.files[0];
      if (!file) return;
      try {
        setError(null);
        var text = await file.text();
        var parsed = JSON.parse(text);
        if (!parsed.patterns || !Array.isArray(parsed.patterns)) {
          setError("Invalid file: expected { patterns: [...] } format");
          return;
        }
        var count = await window.PatternStore.importJSON(text);
        if (window.reloadPatternCache) await window.reloadPatternCache();
        var all = await window.PatternStore.getAll();
        setPatterns(all);
        var st = await window.PatternStore.getStats();
        setStats(st);
        try {
          var rpt = await window.BatchBacktest.create({}).generateReport();
          setReport(rpt);
        } catch (_) {}
        setError("Imported " + count + " patterns from " + file.name);
        setTimeout(function () { setError(null); }, 4000);
      } catch (err) {
        setError("Import failed: " + err.message);
      }
    }

    function getTopKey(obj) {
      var max = 0, key = "N/A";
      Object.keys(obj).forEach(function (k) { if (obj[k] > max) { max = obj[k]; key = k; } });
      return key;
    }

    /* ── Run Batch Backtest ────────────────────────────────────────────── */
    function cancelBatchRun() {
      if (btRunnerRef.current) {
        btRunnerRef.current.cancel();
        btRunnerRef.current = null;
      }
      setBtRunning(false);
      setBtLog(function (prev) {
        var newLog = prev.slice(-50);
        newLog.push({ time: new Date().toLocaleTimeString(), msg: "CANCELLED by user" });
        return newLog;
      });
    }

    async function startBatchRun() {
      // Pick a random subset based on selected cap
      var symbols = pickSymbols(btCap);
      var count = symbols.length;

      setBtRunning(true);
      setError(null);
      setProgress({ current: 0, total: count, symbol: "", phase: "starting" });
      setBtLog([{ time: new Date().toLocaleTimeString(), msg: "Starting batch backtest for " + count + " stocks (cap=" + btCap + ")..." }]);

      try {
        var runner = window.BatchBacktest.create(btConfig);
        btRunnerRef.current = runner;
        var result = await runner.runBatch(symbols, {
          onProgress: function (current, total, symbol, phase) {
            setProgress({ current: current, total: total, symbol: symbol, phase: phase });
            // Log key phases: data load summary, no data, errors, completion
            var shouldLog = phase === "data_loaded" || phase === "no_data" || phase === "no_offline_fallback_live"
              || phase === "done" || phase === "error" || phase === "insufficient_trades"
              || (typeof current === "number" && current % 10 === 0);
            if (shouldLog) {
              setBtLog(function (prev) {
                var newLog = prev.slice(-50);
                if (phase === "data_loaded") {
                  newLog.push({ time: new Date().toLocaleTimeString(), msg: "Loaded " + current + " / " + total + " symbols with candle data" });
                } else if (phase === "no_data") {
                  newLog.push({ time: new Date().toLocaleTimeString(), msg: "WARNING: No candle data found for any symbol!" });
                } else if (phase === "no_offline_fallback_live") {
                  newLog.push({ time: new Date().toLocaleTimeString(), msg: "No offline data found — falling back to live fetch..." });
                } else {
                  newLog.push({ time: new Date().toLocaleTimeString(), msg: "[" + current + "/" + total + "] " + symbol + " — " + phase });
                }
                return newLog;
              });
            }
          },
          onError: function (symbol, err) {
            setBtLog(function (prev) {
              var newLog = prev.slice(-50);
              newLog.push({ time: new Date().toLocaleTimeString(), msg: "ERROR " + symbol + ": " + err.message });
              return newLog;
            });
          }
        });

        setBtLog(function (prev) {
          var newLog = prev.slice(-50);
          newLog.push({ time: new Date().toLocaleTimeString(), msg: "COMPLETE: " + result.summary.successCount + " success, " + result.summary.failCount + " failed, " + result.summary.skippedCount + " skipped. Duration: " + Math.round(result.summary.totalDurationMs / 1000) + "s" });
          return newLog;
        });

        await loadExistingData();
        // Reload screener's in-memory pattern cache so new patterns take effect immediately
        if (window.reloadPatternCache) await window.reloadPatternCache();
        // Reload ML model if one was trained
        if (window.initPatternIntelligence && window.PatternStore) {
          try { await window.PatternStore.init(); } catch (_) {}
        }
        setTab("browse");
      } catch (e) {
        setBtLog(function (prev) {
          var newLog = prev.slice(-50);
          newLog.push({ time: new Date().toLocaleTimeString(), msg: "FATAL: " + e.message });
          return newLog;
        });
      } finally {
        btRunnerRef.current = null;
        setBtRunning(false);
        setProgress({ current: 0, total: 0, symbol: "", phase: "" });
      }
    }

    /* ── Render ────────────────────────────────────────────────────────── */
    var containerStyle = { maxWidth: 960, margin: "0 auto", padding: "16px" };
    var headerStyle = { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 };
    var titleStyle = { fontSize: 20, fontWeight: 700 };
    var tabBarStyle = { display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border, #e5e7eb)", paddingBottom: 8 };
    var tabStyle = function (active) { return {
      padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500,
      background: active ? "var(--accent, #16a34a)" : "transparent",
      color: active ? "#fff" : "var(--text2, #6b7280)",
      border: "none", outline: "none"
    }; };
    var cardStyle = { background: "var(--bg2, #f9fafb)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid var(--border, #e5e7eb)" };
    var labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--text3, #9ca3af)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
    var valueStyle = { fontSize: 22, fontWeight: 700 };
    var smallStyle = { fontSize: 12, color: "var(--text3, #9ca3af)" };

    return React.createElement("div", { style: containerStyle },
      // Header
      React.createElement("div", { style: headerStyle },
        onBack ? React.createElement("button", { onClick: onBack, style: { background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 18 } }, "\u2190") : null,
        React.createElement("span", { style: titleStyle }, "Pattern Intelligence Lab")
      ),

      // Tab bar
      React.createElement("div", { style: tabBarStyle },
        React.createElement("button", { style: tabStyle(tab === "overview"), onClick: function () { setTab("overview"); } }, "Overview"),
        React.createElement("button", { style: tabStyle(tab === "run"), onClick: function () { setTab("run"); } }, "Run Batch"),
        React.createElement("button", { style: tabStyle(tab === "browse"), onClick: function () { setTab("browse"); } }, "Browse Patterns"),
        React.createElement("button", { style: tabStyle(tab === "insights"), onClick: function () { setTab("insights"); } }, "Insights"),
        React.createElement("button", { style: tabStyle(tab === "settings"), onClick: function () { setTab("settings"); } }, "Pattern Settings"),
        React.createElement("button", { style: tabStyle(tab === "ml"), onClick: function () { setTab("ml"); } }, "ML Engine"),
        React.createElement("button", { style: tabStyle(tab === "live"), onClick: function () { setTab("live"); } }, "Live Expert")
      ),

      // Error
      error && React.createElement("div", { style: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, marginBottom: 16, color: "#dc2626", fontSize: 13 } }, error),

      // Tab content
      tab === "overview" && renderOverview(),
      tab === "run" && renderRunBatch(),
      tab === "browse" && renderBrowse(),
      tab === "insights" && renderInsights(),
      tab === "settings" && renderPatternSettings(),
      tab === "ml" && renderMLEngine(),
      tab === "live" && renderLiveExpert()
    );

    function renderOverview() {
      if (!stats) return React.createElement("div", { style: cardStyle },
        React.createElement("p", { style: { color: "var(--text2)" } }, "No patterns stored yet. Go to 'Run Batch' to backtest all stocks and build pattern intelligence."));

      return React.createElement("div", null,
        // Stats cards
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 20 } },
          statCard("Stocks Analyzed", stats.totalPatterns),
          statCard("Total Trades", stats.totalTrades),
          statCard("Avg Win Rate", (stats.avgWinRate || 0) + "%"),
          statCard("Avg Sharpe", stats.avgSharpe || 0),
          statCard("With Calibration", stats.withCalibration),
          statCard("Oldest", stats.oldestPattern ? new Date(stats.oldestPattern).toLocaleDateString() : "N/A")
        ),
        // Report summary
        report && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Quick Report"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 } },
            React.createElement("div", null,
              React.createElement("span", { style: smallStyle }, "Best Stock: "),
              React.createElement("strong", null, (report.best ? report.best.symbol : "N/A") + " (" + (report.best ? report.best.winRate : 0) + "% WR)")
            ),
            React.createElement("div", null,
              React.createElement("span", { style: smallStyle }, "Top Indicator: "),
              React.createElement("strong", null, getTopKey(report.topIndicators || {}))
            )
          ),
          React.createElement("div", { style: { marginTop: 8 } },
            React.createElement("span", { style: smallStyle }, "Win Rate Distribution: "),
            JSON.stringify(report.winRateDistribution || {})
          )
        ),
        // Actions
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 16 } },
          React.createElement("button", {
            onClick: function () { setTab("run"); },
            style: { padding: "8px 16px", borderRadius: 6, background: "var(--accent, #16a34a)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }
          }, "Run Batch Backtest"),
          React.createElement("button", {
            onClick: handleExport,
            style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer" }
          }, "Export Patterns"),
          React.createElement("button", {
            onClick: handleImportClick,
            style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer" }
          }, "Import Patterns"),
          React.createElement("button", {
            onClick: handleRemovePatterns,
            style: Object.assign(
              { padding: "8px 16px", borderRadius: 6, border: "1px solid", cursor: "pointer" },
              removeConfirm
                ? { background: "#dc2626", color: "#fff", borderColor: "#dc2626", fontWeight: 700 }
                : { background: "var(--bg3, #f3f4f6)", color: "#dc2626", borderColor: "#dc262644" }
            )
          }, removeConfirm ? "Confirm — Remove All Patterns" : "Remove Patterns")
        )
      );
    }

    function renderRunBatch() {
      var capOptions = [
        ["10", "Random 10"],
        ["20", "Random 20"],
        ["50", "Random 50"],
        ["100", "Random 100"],
        ["nifty100", "NIFTY 100"],
        ["200", "NIFTY 200"],
        ["all", "All Stocks"]
      ];
      var universe = getStockUniverse();
      var effectiveCount = btCap === "all" || btCap === "200" ? universe.length
        : btCap === "nifty100" ? universe.filter(function(s) { return s.cap === "L"; }).length
        : Math.min(parseInt(btCap, 10) || 20, universe.length);

      return React.createElement("div", null,
        // Stock count selector
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("div", { style: labelStyle }, "Stock Selection"),
            React.createElement("div", { style: { fontSize: 11, color: "var(--text3)" } },
              effectiveCount + " stocks  ·  est. " + estimateTime(effectiveCount)
            )
          ),
          React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 } },
            capOptions.map(function (c) {
              var isActive = String(btCap) === c[0];
              return React.createElement("button", {
                key: c[0],
                onClick: function () {
                  var newCap = c[0];
                  var newCount = newCap === "all" || newCap === "200" ? universe.length
                    : newCap === "nifty100" ? universe.filter(function(s) { return s.cap === "L"; }).length
                    : Math.min(parseInt(newCap, 10) || 20, universe.length);
                  setBtCap(newCap);
                  setBtSelectedCount(newCount);
                },
                style: {
                  padding: "6px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                  border: "1px solid " + (isActive ? "var(--accent, #16a34a)" : "var(--border, #e5e7eb)"),
                  background: isActive ? "rgba(22,163,74,.12)" : "var(--bg4, #f9fafb)",
                  color: isActive ? "var(--accent, #16a34a)" : "var(--text5, #6b7280)"
                }
              }, c[1]);
            })
          )
        ),
        // Config
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Backtest Configuration"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 } },
            configField("Target Profit %", btConfig.targetProfitPct, function (v) { setBtConfig(Object.assign({}, btConfig, { targetProfitPct: parseFloat(v) || 4 })); }),
            configField("Holding Period (days)", btConfig.holdingPeriodDays, function (v) { setBtConfig(Object.assign({}, btConfig, { holdingPeriodDays: parseInt(v) || 14 })); }),
            configField("Threshold Score", btConfig.threshold, function (v) { setBtConfig(Object.assign({}, btConfig, { threshold: parseInt(v) || 65 })); }),
            configField("Sample Every N bars", btConfig.sampleEvery, function (v) { setBtConfig(Object.assign({}, btConfig, { sampleEvery: parseInt(v) || 2 })); })
          )
        ),
        // Progress
        btRunning && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Progress"),
          React.createElement("div", { style: { marginTop: 8 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } },
              React.createElement("span", { style: { fontSize: 13 } }, String(progress.symbol) + " — " + String(progress.phase)),
              React.createElement("span", { style: { fontSize: 13, fontWeight: 600 } }, String(progress.current) + " / " + String(progress.total))
            ),
            React.createElement("div", { style: { height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" } },
              React.createElement("div", { style: {
                height: "100%", borderRadius: 3,
                width: (progress.total > 0 ? (progress.current / progress.total * 100) : 0) + "%",
                background: "var(--accent, #16a34a)",
                transition: "width 0.3s ease"
              } })
            )
          )
        ),
        // Run / Cancel button
        btRunning
          ? React.createElement("button", {
              onClick: cancelBatchRun,
              style: {
                width: "100%", padding: "12px", borderRadius: 8, marginTop: 12,
                background: "#dc2626", color: "#fff", border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: 14
              }
            }, "Cancel (" + progress.current + "/" + progress.total + " processed)")
          : React.createElement("button", {
              onClick: startBatchRun,
              style: {
                width: "100%", padding: "12px", borderRadius: 8, marginTop: 12,
                background: "var(--accent, #16a34a)", color: "#fff", border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: 14
              }
            }, "Start Batch Backtest (" + effectiveCount + " stocks)"),
        // Log
        btLog.length > 0 && React.createElement("div", { style: Object.assign({}, cardStyle, { maxHeight: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }) },
          btLog.map(function (entry, i) {
            return React.createElement("div", { key: i, style: { marginBottom: 2 } },
              React.createElement("span", { style: { color: "var(--text3)" } }, String(entry.time) + " "),
              String(entry.msg)
            );
          })
        )
      );
    }

    function renderBrowse() {
      if (!patterns || patterns.length === 0) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("p", { style: { color: "var(--text2)", textAlign: "center", padding: 20 } }, "No patterns to browse. Run a batch backtest first.")
        );
      }

      var sorted = patterns.slice().sort(function (a, b) {
        return (b.tradeStats ? b.tradeStats.winRate || 0 : 0) - (a.tradeStats ? a.tradeStats.winRate || 0 : 0);
      });

      return React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
          React.createElement("span", { style: { fontSize: 14, fontWeight: 600 } }, sorted.length + " Patterns"),
          React.createElement("button", {
            onClick: handleExport,
            style: { padding: "4px 10px", borderRadius: 4, background: "var(--bg3)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }
          }, "Export All")
        ),
        sorted.map(function (p) { return patternRow(p); })
      );
    }

    function renderInsights() {
      if (!report || !patterns || patterns.length === 0) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("p", { style: { color: "var(--text2)", textAlign: "center" } }, "No insights available yet.")
        );
      }

      return React.createElement("div", null,
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Win Rate Distribution"),
          React.createElement("div", { style: { display: "flex", gap: 4, marginTop: 8, height: 32, alignItems: "flex-end" } },
            Object.keys(report.winRateDistribution || {}).map(function (bucket) {
              var count = report.winRateDistribution[bucket];
              var maxCount = Math.max.apply(null, Object.values(report.winRateDistribution || {}));
              var height = maxCount > 0 ? (count / maxCount * 100) : 0;
              return React.createElement("div", { key: bucket, style: { flex: 1, textAlign: "center" } },
                React.createElement("div", { style: { height: height + "%", minHeight: 2, background: bucket === "70+" || bucket === "60-70" ? "var(--accent, #16a34a)" : "var(--text3)", borderRadius: 2, transition: "height 0.5s" } }),
                React.createElement("div", { style: { fontSize: 9, color: "var(--text3)", marginTop: 2 } }, bucket),
                React.createElement("div", { style: { fontSize: 11, fontWeight: 600 } }, count)
              );
            })
          )
        ),
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Top Predictive Indicators"),
          React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" } },
            Object.keys(report.topIndicators || {}).sort(function (a, b) { return report.topIndicators[b] - report.topIndicators[a]; }).map(function (ind) {
              return React.createElement("div", { key: ind, style: { padding: "4px 10px", borderRadius: 12, background: "var(--bg3)", fontSize: 12, fontWeight: 500 } },
                ind + " (" + report.topIndicators[ind] + ")"
              );
            })
          )
        ),
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Stock Rankings"),
          React.createElement("div", { style: { maxHeight: 300, overflowY: "auto", marginTop: 8 } },
            (patterns || []).slice().sort(function (a, b) { return (b.tradeStats ? b.tradeStats.winRate || 0 : 0) - (a.tradeStats ? a.tradeStats.winRate || 0 : 0); }).slice(0, 20).map(function (p, i) {
              return React.createElement("div", { key: p.symbol, style: { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" } },
                React.createElement("span", null, (i + 1) + ". " + p.symbol),
                React.createElement("span", { style: { fontWeight: 600, color: (p.tradeStats && p.tradeStats.winRate >= 60) ? "var(--accent, #16a34a)" : "var(--text2)" } },
                  (p.tradeStats ? p.tradeStats.winRate : 0) + "% WR, " + (p.tradeStats ? p.tradeStats.totalTrades : 0) + " trades"
                )
              );
            })
          )
        )
      );
    }

    /* ── Helper Components ──────────────────────────────────────────────── */

    function statCard(label, value) {
      return React.createElement("div", { style: cardStyle, key: label },
        React.createElement("div", { style: labelStyle }, label),
        React.createElement("div", { style: valueStyle }, value)
      );
    }

    function configField(label, value, onChange) {
      return React.createElement("div", null,
        React.createElement("label", { style: { fontSize: 12, fontWeight: 500, display: "block", marginBottom: 2 } }, label),
        React.createElement("input", {
          type: "number", value: value, onChange: function (e) { onChange(e.target.value); },
          style: { width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box" }
        })
      );
    }

    function patternRow(p) {
      var wr = p.tradeStats ? p.tradeStats.winRate : 0;
      var wrColor = wr >= 60 ? "var(--accent, #16a34a)" : wr >= 45 ? "#f59e0b" : "#ef4444";
      var topW = null;
      var lw = p.indicatorWeights;
      if (p && window.PatternScoring && window.PatternScoring.resolveLearnedWeights) {
        var rlw2 = window.PatternScoring.resolveLearnedWeights(p);
        if (rlw2) lw = rlw2;
      }
      if (lw) {
        var max = 0;
        Object.keys(lw).forEach(function (k) { if (lw[k] > max) { max = lw[k]; topW = k; } });
      }
      var age = p.backtestDate ? Math.round((Date.now() - p.backtestDate) / (24 * 60 * 60 * 1000)) : null;

      return React.createElement("div", { key: p.symbol, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--bg2)", borderRadius: 8, marginBottom: 6, border: "1px solid var(--border)" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, p.symbol),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", marginTop: 2 } },
            (p.tradeStats ? p.tradeStats.totalTrades : 0) + " trades" +
            (topW ? " | Top: " + topW : "") +
            (age != null ? " | " + age + "d ago" : "") +
            (p.calibration && p.calibration.global ? " | Calibrated" : "")
          )
        ),
        React.createElement("div", { style: { textAlign: "right" } },
          React.createElement("div", { style: { fontWeight: 700, fontSize: 16, color: wrColor } }, wr + "%"),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text3)" } }, "Sharpe: " + (p.tradeStats ? p.tradeStats.sharpeApprox || 0 : 0))
        )
      );
    }

    /* ── Live Expert Tab ────────────────────────────────────────────────── */

    function pushLiveLog(msg) {
      setLiveLog(function (prev) {
        var n = prev.slice(-50);
        n.push({ time: new Date().toLocaleTimeString(), msg: msg });
        return n;
      });
    }

    async function handleCollectLive() {
      if (!window.LiveML) { setError("LiveML module not loaded"); return; }
      setLiveBusy(true);
      setLiveLog([]);
      pushLiveLog("Collecting live features from " + getStockUniverse().length + " symbols...");
      try {
        var summary = await window.LiveML.collect({
          maxDays: 90,
          onProgress: function (current, total, msg) { pushLiveLog("[" + Math.round((total > 0 ? current / total * 100 : 0)) + "%] " + msg); }
        });
        pushLiveLog("COLLECT: scanned " + summary.symbolsScanned + ", processed " + summary.symbolsProcessed + ", new samples: " + summary.newSamples + ", skipped: " + summary.skipped + ", offline: " + summary.offlineHits + ", live: " + summary.liveFetches);
        await loadLiveStatus();
      } catch (err) {
        pushLiveLog("ERROR: " + err.message);
        setError("Live collection failed: " + err.message);
      } finally {
        setLiveBusy(false);
      }
    }

    async function handleLiveRetrain() {
      if (!window.LiveML) { setError("LiveML module not loaded"); return; }
      setLiveBusy(true);
      pushLiveLog("Retraining live expert on confirmed outcomes only...");
      try {
        var result = await window.LiveML.retrain({
          numFolds: 5,
          epochsPerFold: 20,
          onProgress: function (current, total, msg) { pushLiveLog(msg); }
        });
        pushLiveLog("RETRAIN: walk-forward acc=" + result.walkForwardAcc + "%, avgAUC=" + result.avgAuc + " | " + (result.promotion ? result.promotion.reason : ""));
        pushLiveLog("Proven signs: " + (result.signs ? result.signs.signs.length : 0) + " | Base up-rate: " + (result.signs ? result.signs.baseRate : 0) + "%");
        await loadLiveStatus();
      } catch (err) {
        pushLiveLog("ERROR: " + err.message);
        setError("Live retrain failed: " + err.message);
      } finally {
        setLiveBusy(false);
      }
    }

    async function handleTodaySignals() {
      if (!window.LiveML) { setError("LiveML module not loaded"); return; }
      setLiveBusy(true);
      setLiveSignals(null);
      pushLiveLog("Scoring today's setup for the universe (latest bar)...");
      try {
        var signals = await window.LiveML.getTodaySignals({
          count: 20,
          onProgress: function (current, total, msg) { pushLiveLog("[" + Math.round((total > 0 ? current / total * 100 : 0)) + "%] " + (msg || "Scoring " + current + "/" + total + "...")); }
        });
        setLiveSignals(signals);
        await loadLiveStatus();
        pushLiveLog("Signals ready: " + signals.length + " symbols scored from " + (window.LiveML.getUniverse ? window.LiveML.getUniverse().length : "?") + " total, top pick: " + (signals.length > 0 ? signals[0].symbol + " (" + (signals[0].winProbability * 100).toFixed(1) + "%)" : "none"));
      } catch (err) {
        pushLiveLog("ERROR: " + err.message);
        setError("Today's signals failed: " + err.message);
      } finally {
        setLiveBusy(false);
      }
    }

    /* ── Pattern Settings (per-stock weight overrides) ─────────────────── */

    function updatePatternDraft(symbol, key, sliderVal) {
      setPatternSettings(function (prev) {
        return (prev || []).map(function (r) {
          if (r.symbol !== symbol) return r;
          var d = Object.assign({}, r.draft);
          d[key] = Math.round(sliderVal) / 100;
          return Object.assign({}, r, { draft: d });
        });
      });
    }

    function togglePatternEnabled(symbol, enabled) {
      setPatternSettings(function (prev) {
        return (prev || []).map(function (r) {
          if (r.symbol !== symbol) return r;
          return Object.assign({}, r, { enabled: enabled });
        });
      });
    }

    async function handleSavePatternSettings(symbol) {
      var row = (patternSettings || []).filter(function (r) { return r.symbol === symbol; })[0];
      if (!row) return;
      try {
        await window.PatternStore.init();
        if (row.enabled) {
          await window.PatternStore.setWeightOverride(symbol, {
            trendHealth: row.draft.trendHealth,
            pullbackQuality: row.draft.pullbackQuality,
            prob4: row.draft.prob4,
            swingPotential: row.draft.swingPotential
          });
          setError("Saved manual weights for " + symbol);
        } else {
          await window.PatternStore.clearWeightOverride(symbol);
          setError("Cleared override for " + symbol + " — learned weights restored");
        }
        setTimeout(function () { setError(null); }, 3000);
      } catch (err) {
        setError("Save failed: " + err.message);
      }
    }

    async function handleRevertPatternSettings(symbol) {
      try {
        await window.PatternStore.init();
        await window.PatternStore.clearWeightOverride(symbol);
        setPatternSettings(function (prev) {
          return (prev || []).map(function (r) {
            if (r.symbol !== symbol) return r;
            var lw = r.learned;
            return Object.assign({}, r, {
              enabled: false,
              draft: { trendHealth: lw.trendHealth, pullbackQuality: lw.pullbackQuality, prob4: lw.prob4, swingPotential: lw.swingPotential }
            });
          });
        });
        setError("Reverted " + symbol + " to learned weights");
        setTimeout(function () { setError(null); }, 3000);
      } catch (err) {
        setError("Revert failed: " + err.message);
      }
    }

    async function handleResetAllPatternSettings() {
      if (!resetAllConfirm) {
        setResetAllConfirm(true);
        setTimeout(function () { setResetAllConfirm(false); }, 5000);
        return;
      }
      setResetAllConfirm(false);
      try {
        await window.PatternStore.init();
        if (window.PatternStore.clearAllWeightOverrides) {
          await window.PatternStore.clearAllWeightOverrides();
        }
        setPatternSettings(function (prev) {
          return (prev || []).map(function (r) {
            var lw = r.learned;
            return Object.assign({}, r, {
              enabled: false,
              draft: { trendHealth: lw.trendHealth, pullbackQuality: lw.pullbackQuality, prob4: lw.prob4, swingPotential: lw.swingPotential }
            });
          });
        });
        setError("All overrides cleared — every stock back on learned/default weights");
        setTimeout(function () { setError(null); }, 4000);
      } catch (err) {
        setError("Reset failed: " + err.message);
      }
    }

    /* ── Bulk adjust: apply uniform pillar deltas to selected stocks ────── */

    function blendW(lw, b) {
      var P = ["trendHealth", "pullbackQuality", "prob4", "swingPotential"];
      var out = {};
      P.forEach(function (k) { out[k] = Math.round((b * (lw[k] != null ? lw[k] : 0.25) + (1 - b) * 0.25) * 1000) / 1000; });
      return out;
    }

    async function persistBlend() {
      try {
        await window.PatternStore.init();
        await window.PatternStore.setWeightBlend(patternBlend);
        setPatternSettings(function (prev) {
          return (prev || []).map(function (r) {
            if (r.enabled) return r;
            return Object.assign({}, r, { draft: blendW(r.learned, patternBlend) });
          });
        });
        setError("Blend saved: " + Math.round(patternBlend * 100) + "% learned / " + Math.round((1 - patternBlend) * 100) + "% equal");
        setTimeout(function () { setError(null); }, 2500);
      } catch (e) {
        setError("Blend save failed: " + e.message);
      }
    }

    function toggleBulkSelect(symbol) {
      setBulkSel(function (prev) {
        var n = Object.assign({}, prev);
        if (n[symbol]) delete n[symbol]; else n[symbol] = true;
        return n;
      });
    }

    function bulkSelectRows(rows) {
      setBulkSel(function (prev) {
        var n = Object.assign({}, prev);
        rows.forEach(function (r) { n[r.symbol] = true; });
        return n;
      });
    }

    function bulkClearSel() {
      setBulkSel({});
    }

    function bulkDeltaChange(key, val) {
      var d = Object.assign({}, bulkDeltas);
      d[key] = val;
      setBulkDeltas(d);
    }

    async function handleBulkApply() {
      var selected = Object.keys(bulkSel).filter(function (k) { return bulkSel[k]; });
      if (selected.length === 0) {
        setError("No stocks selected — tick the checkboxes first");
        setTimeout(function () { setError(null); }, 3000);
        return;
      }
      var P = ["trendHealth", "pullbackQuality", "prob4", "swingPotential"];
      var hasAny = P.some(function (k) { return (bulkDeltas[k] || 0) !== 0; });
      if (!hasAny) {
        setError("Set at least one pillar delta (%) before applying");
        setTimeout(function () { setError(null); }, 3000);
        return;
      }
      if (!bulkConfirm) {
        setBulkConfirm(true);
        setTimeout(function () { setBulkConfirm(false); }, 5000);
        return;
      }
      setBulkConfirm(false);
      try {
        await window.PatternStore.init();
        var ov = await window.PatternStore.getWeightOverrides();
        var pats = await window.PatternStore.getAll();
        var patMap = {};
        pats.forEach(function (p) { if (p && p.symbol) patMap[p.symbol] = p; });
        var next = {};
        selected.forEach(function (sym) {
          var base = {};
          P.forEach(function (k) {
            var v = ov[sym] && ov[sym][k] != null ? ov[sym][k] : null;
            if (v == null && patMap[sym]) {
              var lw = patMap[sym].indicatorWeights;
              if (window.PatternScoring && window.PatternScoring.resolveLearnedWeights) {
                var rlw = window.PatternScoring.resolveLearnedWeights(patMap[sym]);
                if (rlw) lw = rlw;
              }
              v = lw && lw[k] != null ? lw[k] : 0.25;
            }
            if (v == null) v = 0.25;
            base[k] = v;
          });
          var nw = {};
          P.forEach(function (k) {
            var delta = bulkDeltas[k] || 0;
            nw[k] = Math.max(0.05, Math.min(0.95, base[k] + delta / 100));
          });
          var sum = P.reduce(function (s, k) { return s + nw[k]; }, 0);
          if (sum > 0) P.forEach(function (k) { nw[k] = Math.round(nw[k] / sum * 1000) / 1000; });
          next[sym] = nw;
        });
        var syms = Object.keys(next);
        for (var i = 0; i < syms.length; i++) {
          await window.PatternStore.setWeightOverride(syms[i], next[syms[i]]);
        }
        setPatternSettings(function (prev) {
          return (prev || []).map(function (r) {
            if (!next[r.symbol]) return r;
            return Object.assign({}, r, { enabled: true, draft: next[r.symbol] });
          });
        });
        setError("Bulk-applied to " + syms.length + " stock(s)");
        setTimeout(function () { setError(null); }, 3000);
      } catch (err) {
        setError("Bulk apply failed: " + err.message);
      }
    }

    function renderPatternSettings() {
      if (!patternSettings) {
        return React.createElement("div", { style: cardStyle },
          React.createElement("p", { style: { color: "var(--text2)" } }, "Loading patterns..."));
      }
      var pillars = [
        ["trendHealth", "Trend Health"],
        ["pullbackQuality", "Pullback"],
        ["prob4", "4% Prob"],
        ["swingPotential", "Swing"]
      ];
      var query = patternSearch.trim().toUpperCase();
      var rows = patternSettings.filter(function (r) {
        return !query || r.symbol.indexOf(query) !== -1;
      });
      return React.createElement("div", null,
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Pattern Settings"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
            "Per-stock pillar weights drive the pattern bonus/penalty on entry scores. \"Learned\" = from each stock's batch backtest (component power). Toggle Override, slide the weights (0-100%), Save. Off rows keep learned weights. Bulk adjust: tick checkboxes, set per-pillar Δ% (e.g. +10 Trend, -10 Swing), Apply to Selected — deltas are clamped 5-95% and renormalized to 100%. The Learned-weight blend slider mixes learned weights with equal 25% — start low and raise it as you trust the learned profiles. Overrides apply to all pattern-adjusted scoring and travel with backups."
          ),
          React.createElement("div", { style: { marginTop: 10 } },
            React.createElement("input", {
              className: "inp", type: "text", placeholder: "Filter by symbol (e.g. RELIANCE)...",
              value: patternSearch,
              onChange: function (e) { setPatternSearch(e.target.value); },
              style: { width: 260, fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg1)", color: "var(--text)" }
            }),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", marginLeft: 10 } },
              rows.length + " / " + patternSettings.length + " stocks" + (rows.filter(function (r) { return r.enabled; }).length > 0 ? " · " + rows.filter(function (r) { return r.enabled; }).length + " overridden" : "")
            ),
            React.createElement("button", {
              onClick: handleResetAllPatternSettings,
              style: { padding: "6px 12px", borderRadius: 6, background: resetAllConfirm ? "#dc2626" : "var(--bg3, #f3f4f6)", border: "1px solid " + (resetAllConfirm ? "#dc2626" : "var(--border)"), color: resetAllConfirm ? "#fff" : "var(--text2)", cursor: "pointer", fontSize: 11, fontWeight: 600, marginLeft: 10 }
            }, resetAllConfirm ? "Confirm — reset ALL overrides?" : "Reset All Overrides")
          ),
          React.createElement("div", { style: { marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--text2)" } },
              "Bulk adjust: " + Object.keys(bulkSel).length + " selected"
            ),
            React.createElement("button", {
              onClick: function () { bulkSelectRows(rows); },
              style: { padding: "4px 10px", borderRadius: 5, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11 }
            }, "Select all filtered (" + rows.length + ")"),
            React.createElement("button", {
              onClick: bulkClearSel,
              disabled: Object.keys(bulkSel).length === 0,
              style: { padding: "4px 10px", borderRadius: 5, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: Object.keys(bulkSel).length === 0 ? "not-allowed" : "pointer", fontSize: 11, opacity: Object.keys(bulkSel).length === 0 ? 0.5 : 1 }
            }, "Clear"),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text3)" } }, "Δ%:"),
            [["trendHealth", "Trend"], ["pullbackQuality", "Pullback"], ["prob4", "Prob4"], ["swingPotential", "Swing"]].map(function (bk) {
              return React.createElement("label", { key: bk[0], style: { fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--text3)" } },
                bk[1],
                React.createElement("input", {
                  type: "number", min: -100, max: 100, step: 5,
                  value: bulkDeltas[bk[0]] || 0,
                  onChange: function (e) { bulkDeltaChange(bk[0], parseInt(e.target.value, 10) || 0); },
                  style: { width: 62, padding: "4px 6px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg1)", color: "var(--text)", fontSize: 12 }
                })
              );
            }),
            React.createElement("button", {
              onClick: handleBulkApply,
              style: { padding: "6px 12px", borderRadius: 6, background: bulkConfirm ? "#dc2626" : "var(--accent, #16a34a)", color: "#fff", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }
            }, bulkConfirm ? "Confirm — apply to " + Object.keys(bulkSel).length + "?" : "Apply to Selected")
          ),
          React.createElement("div", { style: { marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--text2)" } }, "Learned-weight blend:"),
            React.createElement("input", {
              type: "range", min: 0, max: 100, step: 5,
              value: Math.round(patternBlend * 100),
              onChange: function (e) { setPatternBlend(parseInt(e.target.value, 10) / 100); },
              onMouseUp: persistBlend,
              onTouchEnd: persistBlend,
              onKeyUp: persistBlend,
              style: { width: 220 }
            }),
            React.createElement("span", { style: { fontSize: 12, color: "var(--text2)", fontFamily: "monospace" } },
              Math.round(patternBlend * 100) + "% learned / " + Math.round((1 - patternBlend) * 100) + "% equal"
            ),
            React.createElement("button", {
              onClick: function () { setPatternBlend(0.5); persistBlend(); },
              style: { padding: "4px 10px", borderRadius: 5, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11 }
            }, "50/50"),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text3)" } },
              "0% = equal 25% each, 100% = pure learned. Blends the learned weights toward equal before scoring; overrides are unaffected."
            )
          )
        ),
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: { maxHeight: 560, overflowY: "auto" } },
            rows.map(function (r) {
              var wr = r.winRate != null ? Math.round(r.winRate) + "%" : "—";
              var age = r.backtestDate ? Math.round((Date.now() - r.backtestDate) / (24 * 60 * 60 * 1000)) + "d" : "—";
              return React.createElement("div", { key: r.symbol, style: { border: "1px solid " + (r.enabled ? "rgba(22,163,74,.45)" : "var(--border)"), borderRadius: 8, padding: 8, marginBottom: 8, background: r.enabled ? "rgba(22,163,74,.05)" : "transparent" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
                    React.createElement("input", {
                      type: "checkbox",
                      checked: !!bulkSel[r.symbol],
                      onChange: function () { toggleBulkSelect(r.symbol); },
                      title: "Select for bulk adjust",
                      style: { accentColor: "var(--accent, #16a34a)" }
                    }),
                    React.createElement("span", { style: { fontWeight: 700, fontSize: 13 } }, r.symbol),
                    React.createElement("span", { style: { fontSize: 11, color: "var(--text3)" } },
                      r.hasPattern ? ("WR " + wr + " · " + r.trades + " trades · " + age) : "no pattern yet — default 25% each"
                    ),
                    React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", fontFamily: "monospace" } },
                      (function () {
                        var eff = blendW(r.learned, patternBlend);
                        return "learned: " + ["trendHealth", "pullbackQuality", "prob4", "swingPotential"].map(function (k) { return Math.round(eff[k] * 100); }).join("/") + "%" + (patternBlend < 1 ? " · blend " + Math.round(patternBlend * 100) + "%" : "");
                      })()
                    )
                  ),
                  React.createElement("label", { style: { fontSize: 12, display: "flex", alignItems: "center", gap: 4 } },
                    React.createElement("input", { type: "checkbox", checked: r.enabled, onChange: function (e) { togglePatternEnabled(r.symbol, e.target.checked); } }),
                    "Override"
                  )
                ),
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 } },
                  pillars.map(function (pillar) {
                    var key = pillar[0];
                    var val = r.draft[key] != null ? r.draft[key] : 0.25;
                    return React.createElement("div", { key: key, style: { fontSize: 11 } },
                      React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } },
                        React.createElement("span", { style: { color: "var(--text3)" } }, pillar[1]),
                        React.createElement("span", { style: { fontWeight: 600 } }, Math.round(val * 100) + "%")
                      ),
                      React.createElement("input", {
                        type: "range", min: 0, max: 100, step: 1,
                        value: Math.round(val * 100),
                        disabled: !r.enabled,
                        onChange: function (e) { updatePatternDraft(r.symbol, key, parseInt(e.target.value, 10)); },
                        style: { width: "100%" }
                      })
                    );
                  })
                ),
                React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 6 } },
                  React.createElement("button", {
                    onClick: function () { handleSavePatternSettings(r.symbol); },
                    disabled: !r.enabled,
                    style: { padding: "4px 12px", borderRadius: 5, background: r.enabled ? "var(--accent, #16a34a)" : "#9ca3af", color: "#fff", border: "none", cursor: r.enabled ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 600 }
                  }, "Save"),
                  React.createElement("button", {
                    onClick: function () { handleRevertPatternSettings(r.symbol); },
                    style: { padding: "4px 12px", borderRadius: 5, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11 }
                  }, "Reset to Default")
                )
              );
            }),
            rows.length === 0 && React.createElement("p", { style: { color: "var(--text3)", fontSize: 12, padding: 12 } }, "No stocks match \"" + patternSearch + "\".")
          )
        )
      );
    }

    function renderLiveExpert() {
      var hasLive = !!(window.LiveML);
      var corpus = liveStatus && liveStatus.corpus;
      var signs = liveStatus && liveStatus.signs;
      var importance = liveStatus && liveStatus.champion && liveStatus.champion.featureImportance;
      var brPct = function (br) { return br != null ? (br > 0 && br < 1 ? br * 100 : br) : null; };

      return React.createElement("div", null,
        // Status
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Live Expert — Learns From Confirmed Outcomes Only"),
          React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
            "Collects daily OHLCV for every stock, records the indicator state at each prior close, and labels it with the realized next-day move. The model is retrained only on what already happened — every sample is verified. It then reports which indicator states ('signs') were followed by up-days, with sample counts."
          ),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginTop: 10 } },
            statCard("Corpus Samples", corpus ? corpus.count : 0),
            statCard("Symbols", corpus ? corpus.symbols : 0),
            statCard("Base Up-Rate", corpus ? (brPct(corpus.baseRate) != null ? brPct(corpus.baseRate).toFixed(1) + "%" : "N/A") : "N/A"),
            statCard("Range", corpus ? (corpus.firstDate || "—") + " → " + (corpus.lastDate || "—") : "N/A"),
            statCard("Last Collect", liveStatus && liveStatus.lastCollect ? new Date(liveStatus.lastCollect).toLocaleString() : "Never"),
            statCard("Last Retrain", liveStatus && liveStatus.lastRetrain ? new Date(liveStatus.lastRetrain).toLocaleString() : "Never"),
            statCard("WF Accuracy", liveStatus && liveStatus.walkForwardAcc != null ? liveStatus.walkForwardAcc + "%" : "N/A"),
            statCard("Avg AUC", liveStatus && liveStatus.avgAuc != null ? (liveStatus.avgAuc * 100).toFixed(1) + "%" : "N/A")
          ),
          React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" } },
            React.createElement("button", {
              onClick: handleCollectLive,
              disabled: liveBusy,
              style: { padding: "8px 16px", borderRadius: 6, background: liveBusy ? "#9ca3af" : "var(--accent, #16a34a)", color: "#fff", border: "none", cursor: liveBusy ? "not-allowed" : "pointer", fontWeight: 600, opacity: hasLive ? 1 : 0.5 }
            }, liveBusy ? "Working..." : "Collect Live Features"),
            React.createElement("button", {
              onClick: handleLiveRetrain,
              disabled: liveBusy,
              style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: liveBusy ? "not-allowed" : "pointer", opacity: hasLive ? 1 : 0.5 }
            }, "Retrain on Confirmed Data"),
            React.createElement("button", {
              onClick: handleTodaySignals,
              disabled: liveBusy,
              style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: liveBusy ? "not-allowed" : "pointer", opacity: hasLive ? 1 : 0.5 }
            }, "Score Today's Signals")
          )
        ),

        // Feature importance (horizontal bars)
        importance && importance.length > 0 && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "What Signs Drive Up-Days (Permutation Importance)"),
          React.createElement("div", { style: { marginTop: 8 } },
            importance.slice(0, 10).map(function (fi) {
              var maxImp = Math.max.apply(null, importance.map(function (f) { return Math.abs(f.importance); }));
              var width = maxImp > 0 ? Math.max(2, Math.abs(fi.importance) / maxImp * 100) : 2;
              var color = fi.importance >= 0 ? "var(--accent, #16a34a)" : "#ef4444";
              return React.createElement("div", { key: fi.feature, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } },
                React.createElement("span", { style: { width: 110, fontSize: 12, fontWeight: 600 } }, fi.feature),
                React.createElement("div", { style: { flex: 1, background: "var(--bg3)", borderRadius: 4, height: 14 } },
                  React.createElement("div", { style: { width: width + "%", background: color, borderRadius: 4, height: 14 } })
                ),
                React.createElement("span", { style: { width: 70, fontSize: 11, color: "var(--text3)" } }, fi.importance.toFixed(3))
              );
            })
          ),
          React.createElement("p", { style: { fontSize: 11, color: "var(--text3)", marginTop: 6 } },
            "Positive = accuracy drops when this sign is shuffled (it matters). Negative = the model's use of it was overfit (removing it helps)."
          )
        ),

        // Proven signs
        signs && signs.signs && signs.signs.length > 0 && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Proven Signs (min " + 30 + " samples, lift ≥ " + (0.03 * 100) + "%)"),
          React.createElement("div", { style: { maxHeight: 260, overflowY: "auto", marginTop: 8 } },
            signs.signs.map(function (s) {
              var color = s.lift >= 0 ? "var(--accent, #16a34a)" : "#ef4444";
              return React.createElement("div", { key: s.feature + s.bucket, style: { display: "flex", justifyContent: "space-between", padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: 12 } },
                React.createElement("span", null,
                  React.createElement("strong", null, s.feature + " " + s.bucket),
                  " · n=" + s.n
                ),
                React.createElement("span", { style: { fontWeight: 700, color: color } },
                  s.upRate + "% up-rate" + (s.lift >= 0 ? " (+" : " (") + s.lift + "% lift)" + " · avg " + s.avgReturn + "%"
                )
              );
            })
          )
        ),

        // Per-feature bucket tables
        signs && signs.tables && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Sign Tables (win rate by bucket)"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, marginTop: 8 } },
            Object.keys(signs.tables).map(function (key) {
              var rows = signs.tables[key];
              return React.createElement("div", { key: key, style: { border: "1px solid var(--border)", borderRadius: 8, padding: 8 } },
                React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 4 } }, key + " (base " + signs.baseRate + "%)"),
                rows.map(function (r) {
                  var color = r.lift >= 3 ? "var(--accent, #16a34a)" : r.lift <= -3 ? "#ef4444" : "var(--text2)";
                  return React.createElement("div", { key: r.bucket, style: { display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 } },
                    React.createElement("span", { style: { color: "var(--text3)" } }, r.bucket + " (n=" + r.n + ")"),
                    React.createElement("span", { style: { fontWeight: 600, color: color } }, r.upRate + "% · " + (r.avgReturn >= 0 ? "+" : "") + r.avgReturn + "%")
                  );
                })
              );
            })
          ),
          React.createElement("div", { style: { marginTop: 10 } },
            React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 4 } }, "Two-Sign Combos (sorted by up-rate)"),
            signs.combos && signs.combos.map(function (c) {
              return React.createElement("div", { key: c.combo, style: { display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 } },
                React.createElement("span", { style: { color: "var(--text3)" } }, c.combo + " (n=" + c.n + ")"),
                React.createElement("span", { style: { fontWeight: 600, color: c.lift >= 3 ? "var(--accent, #16a34a)" : c.lift <= -3 ? "#ef4444" : "var(--text2)" } },
                  c.upRate + "% · " + (c.avgReturn >= 0 ? "+" : "") + c.avgReturn + "%"
                )
              );
            })
          )
        ),

        // Today's signals
        liveSignals && liveSignals.length > 0 && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Today's Setup — Live Expert's Top Signals"),
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 } },
              React.createElement("thead", null,
              React.createElement("tr", null,
                React.createElement("th", { style: { textAlign: "left", padding: "4px", color: "var(--text3)" } }, "#"),
                React.createElement("th", { style: { textAlign: "left", padding: "4px", color: "var(--text3)" } }, "Symbol"),
                React.createElement("th", { style: { textAlign: "right", padding: "4px", color: "var(--text3)" } }, "Win Prob"),
                React.createElement("th", { style: { textAlign: "right", padding: "4px", color: "var(--text3)" } }, "Chg %"),
                React.createElement("th", { style: { textAlign: "left", padding: "4px", color: "var(--text3)" } }, "Signals")
              )
            ),
            React.createElement("tbody", null,
              liveSignals.map(function (s, idx) {
                var color = s.winProbability >= 0.6 ? "var(--accent, #16a34a)" : s.winProbability >= 0.5 ? "#f59e0b" : "var(--text2)";
                var chgColor = s.chgPct != null ? (s.chgPct >= 0 ? "var(--accent, #16a34a)" : "#ef4444") : "var(--text3)";
                return React.createElement("tr", { key: s.symbol },
                  React.createElement("td", { style: { padding: "4px", color: "var(--text3)", width: 24 } }, idx + 1),
                  React.createElement("td", { style: { padding: "4px", fontWeight: 600 } }, s.symbol),
                  React.createElement("td", { style: { padding: "4px", textAlign: "right", fontWeight: 700, color: color } }, (s.winProbability * 100).toFixed(1) + "%"),
                  React.createElement("td", { style: { padding: "4px", textAlign: "right", color: chgColor } }, s.chgPct != null ? (s.chgPct >= 0 ? "+" : "") + s.chgPct + "%" : "—"),
                  React.createElement("td", { style: { padding: "4px", fontSize: 11, color: "var(--text3)" } },
                    "RSI " + s.features.rsi + " · BB " + s.features.bb_position + " · ATR " + s.features.atr_pct + "% · Vol " + s.features.volume_ratio +
                    " · MACD " + s.features.macd_hist + " · EMA " + s.features.ema_slope + "% · ADX " + s.features.adx
                  )
                );
              })
            )
          )
        ),

        // Prediction accuracy tracker
        liveTracker && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Prediction Accuracy — Did Yesterday's Picks Print?"),
          liveSignals && liveSignals.length > 0 && React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
            "Today's scored picks: " + liveSignals.length + " (top: " + liveSignals[0].symbol + " at " + (liveSignals[0].winProbability * 100).toFixed(1) + "%) — pending resolution. Run Collect in the evening to settle them."
          ),
          (function () {
            var days = liveTracker.days.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
            var resolved = days.filter(function (d) { return d.resolvedCount > 0; });
            var allPicks = 0, allHits = 0;
            resolved.forEach(function (d) { allPicks += d.picks.length; allHits += d.hits; });
            var allRate = allPicks > 0 ? (allHits / allPicks) * 100 : null;
            var base = liveStatus && liveStatus.corpus && liveStatus.corpus.baseRate != null ? brPct(liveStatus.corpus.baseRate) : null;
            var shown = days.slice(0, 7);
            return React.createElement("div", null,
              React.createElement("p", { style: { fontSize: 12, color: "var(--text3)", marginTop: 4, lineHeight: 1.5 } },
                allRate != null
                  ? "All-time: " + allHits + "/" + allPicks + " (" + allRate.toFixed(1) + "%)" + (base != null ? " vs base up-rate " + base + "% — " + (allRate >= base ? "beating the base rate" : "below the base rate") : "") + ". Pending " + (days.length > 0 ? days.reduce(function (s, d) { return s + (d.picks.length - d.resolvedCount); }, 0) : 0) + " picks — collect in the evening to resolve."
                  : "Score Today's Signals, then collect in the evening to see how the picks printed."
              ),
              React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 } },
                React.createElement("thead", null,
                  React.createElement("tr", null,
                    React.createElement("th", { style: { textAlign: "left", padding: "4px", color: "var(--text3)" } }, "Date"),
                    React.createElement("th", { style: { textAlign: "right", padding: "4px", color: "var(--text3)" } }, "Picks"),
                    React.createElement("th", { style: { textAlign: "right", padding: "4px", color: "var(--text3)" } }, "Hits"),
                    React.createElement("th", { style: { textAlign: "right", padding: "4px", color: "var(--text3)" } }, "Misses"),
                    React.createElement("th", { style: { textAlign: "right", padding: "4px", color: "var(--text3)" } }, "Hit Rate")
                  )
                ),
                React.createElement("tbody", null,
                  shown.map(function (d) {
                    var total = d.picks.length;
                    var rate = d.resolvedCount > 0 ? (d.hits / d.resolvedCount) * 100 : null;
                    var rateColor = rate == null ? "var(--text3)" : rate >= (base != null ? base : 50) ? "#16a34a" : "#ef4444";
                    return React.createElement("tr", { key: d.date },
                      React.createElement("td", { style: { padding: "4px", fontWeight: 600 } }, d.date),
                      React.createElement("td", { style: { padding: "4px", textAlign: "right" } }, total),
                      React.createElement("td", { style: { padding: "4px", textAlign: "right", color: "#16a34a", fontWeight: 700 } }, d.hits),
                      React.createElement("td", { style: { padding: "4px", textAlign: "right", color: "#ef4444", fontWeight: 700 } }, d.misses),
                      React.createElement("td", { style: { padding: "4px", textAlign: "right", color: rateColor, fontWeight: 700 } }, rate != null ? rate.toFixed(0) + "%" : "—")
                    );
                  })
                )
              )
            );
          })()
        ),

        // Log
        liveLog.length > 0 && React.createElement("div", { style: Object.assign({}, cardStyle, { maxHeight: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }) },
          liveLog.map(function (entry, i) {
            return React.createElement("div", { key: i, style: { marginBottom: 2 } },
              React.createElement("span", { style: { color: "var(--text3)" } }, String(entry.time) + " "),
              String(entry.msg)
            );
          })
        )
      );
    }

    /* ── ML Engine Tab ─────────────────────────────────────────────────── */

    async function handleTrainML() {
      if (!window.MLTrainer) {
        setError("MLTrainer module not loaded");
        return;
      }
      if (!window.PatternStore) {
        setError("PatternStore not available");
        return;
      }

      setMlTraining(true);
      setMlLog([{ time: new Date().toLocaleTimeString(), msg: "Starting " + mlTrainMode + " training..." }]);

      try {
        await window.PatternStore.init();
        var featCount = 0;
        try {
          var allFeats = await window.PatternStore.getAllFeatures();
          featCount = allFeats.length;
        } catch (e) {}

        setMlLog(function (prev) {
          var n = prev.slice(-50);
          n.push({ time: new Date().toLocaleTimeString(), msg: "Available features: " + featCount + " samples" });
          return n;
        });

        var result;
        if (mlTrainMode === "walkforward") {
          result = await window.MLTrainer.trainWithWalkForward({
            numFolds: 5,
            epochsPerFold: 25,
            hiddenUnits: [32, 16],
            learningRate: 0.005,
            batchSize: 32,
            dropoutRate: 0.2,
            onFold: function (fold, total, foldResult) {
              if (foldResult.skipped) {
                setMlLog(function (prev) {
                  var n = prev.slice(-50);
                  n.push({ time: new Date().toLocaleTimeString(), msg: "Fold " + fold + "/" + total + ": skipped (" + foldResult.reason + ")" });
                  return n;
                });
              } else {
                setMlLog(function (prev) {
                  var n = prev.slice(-50);
                  n.push({ time: new Date().toLocaleTimeString(), msg: "Fold " + fold + "/" + total + ": valAcc=" + foldResult.finalValAcc + "%, F1=" + foldResult.f1 + ", Precision=" + foldResult.precision });
                  return n;
                });
              }
            },
            onProgress: function (current, total, msg) {
              setMlLog(function (prev) {
                var n = prev.slice(-50);
                if (typeof current === "number" && Math.floor(current) !== Math.floor(prev[prev.length - 1] ? prev[prev.length - 1].current || 0 : -1)) {
                  n.push({ time: new Date().toLocaleTimeString(), msg: "[" + Math.round((total > 0 ? current / total * 100 : 0)) + "%] " + msg });
                }
                return n;
              });
            }
          });

          setMlLog(function (prev) {
            var n = prev.slice(-50);
            n.push({ time: new Date().toLocaleTimeString(), msg: "Walk-Forward Result: " + result.walkForwardAcc + "% avg accuracy, Best Fold: " + result.bestFoldAcc + "%" });
            if (result.promotion) {
              n.push({ time: new Date().toLocaleTimeString(), msg: "Promotion: " + result.promotion.reason });
            }
            if (result.featureImportance && result.featureImportance.length > 0) {
              var top3 = result.featureImportance.slice(0, 3).map(function (f) { return f.feature + "(" + f.importance.toFixed(3) + ")"; }).join(", ");
              n.push({ time: new Date().toLocaleTimeString(), msg: "Top Features: " + top3 });
            }
            return n;
          });
        } else {
          // Legacy single-split training
          var trainer = window.MLTrainer.create({
            hiddenUnits: [32, 16],
            learningRate: 0.01,
            epochs: 50,
            batchSize: 32,
            dropoutRate: 0.2
          });

          result = await trainer.train({
            onEpoch: function (epoch, loss, trainAcc, valAcc) {
              if (epoch % 10 === 0 || epoch === 1) {
                setMlLog(function (prev) {
                  var n = prev.slice(-50);
                  n.push({ time: new Date().toLocaleTimeString(), msg: "Epoch " + epoch + ": loss=" + loss.toFixed(4) + " train=" + trainAcc + "% val=" + valAcc + "%" });
                  return n;
                });
              }
            }
          });

          setMlLog(function (prev) {
            var n = prev.slice(-50);
            n.push({ time: new Date().toLocaleTimeString(), msg: "Training Complete: valAcc=" + result.finalValAcc + "%, loss=" + result.finalLoss });
            if (result.featureImportance) {
              var top3 = result.featureImportance.slice(0, 3).map(function (f) { return f.feature + "(" + f.importance.toFixed(3) + ")"; }).join(", ");
              n.push({ time: new Date().toLocaleTimeString(), msg: "Top Features: " + top3 });
            }
            return n;
          });
        }

        // Refresh status
        await loadMLStatus();
        setError(null);
      } catch (err) {
        setMlLog(function (prev) {
          var n = prev.slice(-50);
          n.push({ time: new Date().toLocaleTimeString(), msg: "ERROR: " + err.message });
          return n;
        });
        setError("ML training failed: " + err.message);
      } finally {
        setMlTraining(false);
      }
    }

    async function handleRetrainML() {
      if (!window.MLTrainer || !window.continuousMLRetrain) {
        setError("Continuous retrain not available");
        return;
      }
      setMlTraining(true);
      setMlLog(function (prev) {
        var n = prev.slice(-50);
        n.push({ time: new Date().toLocaleTimeString(), msg: "Starting continuous retrain (drift check + walk-forward)..." });
        return n;
      });

      try {
        var result = await window.continuousMLRetrain({
          numFolds: 5,
          epochsPerFold: 20,
          forceRetrain: true,
          onProgress: function (current, total, msg) {
            setMlLog(function (prev) {
              var n = prev.slice(-50);
              n.push({ time: new Date().toLocaleTimeString(), msg: msg });
              return n;
            });
          }
        });

        setMlLog(function (prev) {
          var n = prev.slice(-50);
          n.push({ time: new Date().toLocaleTimeString(), msg: "Retrain " + (result.retrained ? "completed" : "skipped") + ": " + (result.actions || []).join("; ") });
          return n;
        });

        await loadMLStatus();
      } catch (err) {
        setError("Continuous retrain failed: " + err.message);
      } finally {
        setMlTraining(false);
      }
    }

    async function handleOptimizeConfig() {
      if (!window.MLOptimizer || !window.optimizeBacktestConfig) {
        setError("MLOptimizer not available");
        return;
      }
      setMlOptimizing(true);
      setMlLog(function (prev) {
        var n = prev.slice(-50);
        n.push({ time: new Date().toLocaleTimeString(), msg: "Starting Bayesian optimization of backtest config..." });
        return n;
      });

      try {
        var symbols = getStockUniverse().slice(0, 10).map(function (s) { return s.t; });
        var result = await window.optimizeBacktestConfig({
          symbols: symbols,
          iterations: 10,
          onIteration: function (iter, total, config, iterResult) {
            setMlLog(function (prev) {
              var n = prev.slice(-50);
              n.push({ time: new Date().toLocaleTimeString(), msg: "Iter " + iter + "/" + total + ": TP=" + config.targetProfitPct + "% HP=" + config.holdingPeriodDays + "d → Sharpe=" + iterResult.sharpe + " WR=" + iterResult.winRate + "% Trades=" + iterResult.tradesEvaluated + (iterResult.evalErrors && iterResult.evalErrors.length ? " (" + iterResult.evalErrors.length + " errors)" : "") });
              return n;
            });
          }
        });

        if (result.warning) {
          setMlLog(function (prev) {
            var n = prev.slice(-50);
            n.push({ time: new Date().toLocaleTimeString(), msg: "ABORTED: " + result.warning });
            return n;
          });
          setError(result.warning);
          setTimeout(function () { setError(null); }, 8000);
          return;
        }

        setMlLog(function (prev) {
          var n = prev.slice(-50);
          n.push({ time: new Date().toLocaleTimeString(), msg: "Best Config: TP=" + result.bestConfig.targetProfitPct + "%, HP=" + result.bestConfig.holdingPeriodDays + "d, Thr=" + result.bestConfig.threshold + " → Sharpe=" + result.bestSharpe + " (trades=" + result.bestTradesEvaluated + ")" });
          return n;
        });

        // Apply best config to backtest config
        setBtConfig(Object.assign({}, btConfig, {
          targetProfitPct: result.bestConfig.targetProfitPct,
          holdingPeriodDays: result.bestConfig.holdingPeriodDays,
          threshold: result.bestConfig.threshold,
          sampleEvery: result.bestConfig.sampleEvery
        }));

        try {
          localStorage.setItem("stox_best_bt_config", JSON.stringify(result.bestConfig));
        } catch (e) {}

        setError("Optimal config applied & saved to Backtest Configuration");
        setTimeout(function () { setError(null); }, 5000);
      } catch (err) {
        setError("Optimization failed: " + err.message);
      } finally {
        setMlOptimizing(false);
      }
    }

    function renderMLEngine() {
      var hasML = !!(window.MLTrainer);
      var hasOptimizer = !!(window.MLOptimizer);
      var championInfo = mlStatus && mlStatus.champion;

      return React.createElement("div", null,
        // Model Status
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Model Status"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginTop: 8 } },
            statCard("Has Model", mlStatus && mlStatus.hasModel ? "Yes" : "No"),
            statCard("Features", (mlStatus && mlStatus.totalFeaturesAvailable) || 0),
            statCard("Method", championInfo && championInfo.method ? String(championInfo.method) : "N/A"),
            statCard("WF Accuracy", championInfo && championInfo.walkForwardAcc ? championInfo.walkForwardAcc + "%" : "N/A"),
            statCard("Val Accuracy", championInfo && championInfo.finalValAcc ? championInfo.finalValAcc + "%" : "N/A"),
            statCard("Versions", (mlStatus && mlStatus.versions && mlStatus.versions.length) || 0)
          )
        ),
        // Feature Importance
        championInfo && championInfo.featureImportance && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Feature Importance"),
          React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" } },
            championInfo.featureImportance.slice(0, 10).map(function (fi) {
              var intensity = Math.min(1, fi.importance * 5);
              var bg = "rgba(22,163,74," + (0.1 + intensity * 0.4) + ")";
              return React.createElement("div", { key: fi.feature, style: { padding: "4px 10px", borderRadius: 12, background: bg, fontSize: 12, fontWeight: 500, border: "1px solid var(--border)" } },
                fi.feature + " (" + fi.importance.toFixed(3) + ")"
              );
            })
          )
        ),
        // Training Controls
        React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Training Controls"),
          React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" } },
            React.createElement("label", { style: { fontSize: 12, display: "flex", alignItems: "center", gap: 4 } },
              React.createElement("input", {
                type: "radio", name: "mlmode", value: "walkforward",
                checked: mlTrainMode === "walkforward",
                onChange: function () { setMlTrainMode("walkforward"); }
              }),
              "Walk-Forward (Recommended)"
            ),
            React.createElement("label", { style: { fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginLeft: 12 } },
              React.createElement("input", {
                type: "radio", name: "mlmode", value: "legacy",
                checked: mlTrainMode === "legacy",
                onChange: function () { setMlTrainMode("legacy"); }
              }),
              "Single Split (Legacy)"
            )
          ),
          React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
            React.createElement("button", {
              onClick: handleTrainML,
              disabled: mlTraining || !hasML,
              style: { padding: "8px 16px", borderRadius: 6, background: mlTraining ? "#9ca3af" : "var(--accent, #16a34a)", color: "#fff", border: "none", cursor: mlTraining ? "not-allowed" : "pointer", fontWeight: 600, opacity: hasML ? 1 : 0.5 }
            }, mlTraining ? "Training..." : "Train Model"),
            React.createElement("button", {
              onClick: handleRetrainML,
              disabled: mlTraining || !hasML,
              style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: mlTraining ? "not-allowed" : "pointer", opacity: hasML ? 1 : 0.5 }
            }, "Continuous Retrain")
          ),
          hasOptimizer && React.createElement("button", {
            onClick: handleOptimizeConfig,
            disabled: mlTraining || mlOptimizing,
            style: { padding: "8px 16px", borderRadius: 6, background: "var(--bg3, #f3f4f6)", border: "1px solid var(--border)", cursor: (mlTraining || mlOptimizing) ? "not-allowed" : "pointer", marginTop: 8 }
          }, mlOptimizing ? "Optimizing..." : "Optimize Backtest Config (Bayesian)")
        ),
        // Retrain History
        mlStatus && mlStatus.retrainHistory && mlStatus.retrainHistory.length > 0 && React.createElement("div", { style: cardStyle },
          React.createElement("div", { style: labelStyle }, "Retrain History"),
          React.createElement("div", { style: { maxHeight: 150, overflowY: "auto", marginTop: 8 } },
            mlStatus.retrainHistory.slice().reverse().slice(0, 10).map(function (h, i) {
              return React.createElement("div", { key: i, style: { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)", fontSize: 12 } },
                React.createElement("span", null, new Date(h.timestamp).toLocaleString()),
                React.createElement("span", { style: { fontWeight: 600, color: h.promoted ? "var(--accent, #16a34a)" : "var(--text2)" } },
                  h.walkForwardAcc + "% WR" + (h.promoted ? " (Promoted)" : "")
                )
              );
            })
          )
        ),
        // ML Log
        mlLog.length > 0 && React.createElement("div", { style: Object.assign({}, cardStyle, { maxHeight: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }) },
          mlLog.map(function (entry, i) {
            return React.createElement("div", { key: i, style: { marginBottom: 2 } },
              React.createElement("span", { style: { color: "var(--text3)" } }, String(entry.time) + " "),
              String(entry.msg)
            );
          })
        )
      );
    }
  }

  return { Dashboard: Dashboard };
})();
