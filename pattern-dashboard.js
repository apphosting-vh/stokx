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
    var onBack = props.onBack || function () {};
    var stocksList = props.stocks || getStockUniverse().map(function (s) { return s.t; });

    var _s = useState("overview"); // tab: overview | run | browse | insights | ml
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
    var _btConfig = useState({ targetProfitPct: 4, holdingPeriodDays: 14, threshold: 65, sampleEvery: 2 });
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

    // Load ML status on mount
    useEffect(function () {
      loadMLStatus();
    }, []);

    async function loadMLStatus() {
      try {
        if (window.MLTrainer && window.MLTrainer.getModelStatus) {
          var status = await window.MLTrainer.getModelStatus();
          setMlStatus(status);
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
        React.createElement("button", { onClick: onBack, style: { background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 18 } }, "\u2190"),
        React.createElement("span", { style: titleStyle }, "Pattern Intelligence Lab")
      ),

      // Tab bar
      React.createElement("div", { style: tabBarStyle },
        React.createElement("button", { style: tabStyle(tab === "overview"), onClick: function () { setTab("overview"); } }, "Overview"),
        React.createElement("button", { style: tabStyle(tab === "run"), onClick: function () { setTab("run"); } }, "Run Batch"),
        React.createElement("button", { style: tabStyle(tab === "browse"), onClick: function () { setTab("browse"); } }, "Browse Patterns"),
        React.createElement("button", { style: tabStyle(tab === "insights"), onClick: function () { setTab("insights"); } }, "Insights"),
        React.createElement("button", { style: tabStyle(tab === "ml"), onClick: function () { setTab("ml"); } }, "ML Engine")
      ),

      // Error
      error && React.createElement("div", { style: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, marginBottom: 16, color: "#dc2626", fontSize: 13 } }, error),

      // Tab content
      tab === "overview" && renderOverview(),
      tab === "run" && renderRunBatch(),
      tab === "browse" && renderBrowse(),
      tab === "insights" && renderInsights(),
      tab === "ml" && renderMLEngine()
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
                onClick: function () { setBtCap(c[0]); setBtSelectedCount(effectiveCount); },
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
      if (!report || patterns.length === 0) {
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
      if (p.indicatorWeights) {
        var max = 0;
        Object.keys(p.indicatorWeights).forEach(function (k) { if (p.indicatorWeights[k] > max) { max = p.indicatorWeights[k]; topW = k; } });
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
                  n.push({ time: new Date().toLocaleTimeString(), msg: "[" + Math.round(current / total * 100) + "%] " + msg });
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
              if (epoch % 10 === 0 || epoch % 10 === 0) {
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
              n.push({ time: new Date().toLocaleTimeString(), msg: "Iter " + iter + "/" + total + ": TP=" + config.targetProfitPct + "% HP=" + config.holdingPeriodDays + "d → Sharpe=" + iterResult.sharpe + " WR=" + iterResult.winRate + "%" });
              return n;
            });
          }
        });

        setMlLog(function (prev) {
          var n = prev.slice(-50);
          n.push({ time: new Date().toLocaleTimeString(), msg: "Best Config: TP=" + result.bestConfig.targetProfitPct + "%, HP=" + result.bestConfig.holdingPeriodDays + "d, Thr=" + result.bestConfig.threshold + " → Sharpe=" + result.bestSharpe });
          return n;
        });

        // Apply best config to backtest config
        setBtConfig(Object.assign({}, btConfig, {
          targetProfitPct: result.bestConfig.targetProfitPct,
          holdingPeriodDays: result.bestConfig.holdingPeriodDays,
          threshold: result.bestConfig.threshold,
          sampleEvery: result.bestConfig.sampleEvery
        }));

        setError("Optimal config applied to Backtest Configuration");
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

    var _removeConfirm = useState(false);
    var removeConfirm = _removeConfirm[0], setRemoveConfirm = _removeConfirm[1];

    async function handleRemovePatterns() {
      if (!removeConfirm) {
        setRemoveConfirm(true);
        setTimeout(function () { setRemoveConfirm(false); }, 5000);
        return;
      }
      setRemoveConfirm(false);
      try {
        setError(null);
        var count = (await window.PatternStore.getAll()).length;
        await window.PatternStore.clearAll();
        if (window.reloadPatternCache) await window.reloadPatternCache();
        setPatterns([]);
        setStats(null);
        setReport(null);
        setError("Cleared " + count + " patterns — ready for fresh backtest");
        setTimeout(function () { setError(null); }, 4000);
      } catch (err) {
        setError("Clear failed: " + err.message);
      }
    }

    function getTopKey(obj) {
      var max = 0, key = "N/A";
      Object.keys(obj).forEach(function (k) { if (obj[k] > max) { max = obj[k]; key = k; } });
      return key;
    }
  }

  return { Dashboard: Dashboard };
})();
