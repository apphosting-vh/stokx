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

    var _s = useState("overview"); // tab: overview | run | browse | insights
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
        await PatternStore.init();
        var p = await PatternStore.getAll();
        setPatterns(p);
        var s = await PatternStore.getStats();
        setStats(s);
        if (p.length > 0 && BatchBacktest) {
          var r = await BatchBacktest.create({}).generateReport();
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

      // Warn if any selected symbols already have patterns (will be overwritten)
      if (patterns && patterns.length > 0) {
        var existing = new Set(patterns.map(function(p) { return p.symbol; }));
        var overlap = symbols.filter(function(s) { return existing.has(s); });
        if (overlap.length > 0) {
          setBtLog([{ time: new Date().toLocaleTimeString(), msg: "NOTE: " + overlap.length + " of " + count + " stocks already have patterns and will be OVERWRITTEN. Use Export first to backup." }]);
        }
      }

      setBtRunning(true);
      setError(null);
      setProgress({ current: 0, total: count, symbol: "", phase: "starting" });
      setBtLog(function(prev) {
        var newLog = prev.slice(-50);
        newLog.push({ time: new Date().toLocaleTimeString(), msg: "Starting batch backtest for " + count + " stocks (cap=" + btCap + ")..." });
        return newLog;
      });

      try {
        var runner = BatchBacktest.create(btConfig);
        btRunnerRef.current = runner;
        var result = await runner.runBatch(symbols, {
          onProgress: function (current, total, symbol, phase) {
            setProgress({ current: current, total: total, symbol: symbol, phase: phase });
            // Log key phases: data load summary, no data, errors, completion
            var shouldLog = phase === "data_loaded" || phase === "no_data" || phase === "no_offline_fallback_live"
              || phase === "done" || phase === "error" || phase === "insufficient_trades" || phase === "no_scores"
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
        onBack ? React.createElement("button", { onClick: onBack, style: { background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 18 } }, "\u2190") : null,
        React.createElement("span", { style: titleStyle }, "Pattern Intelligence Lab")
      ),

      // Tab bar
      React.createElement("div", { style: tabBarStyle },
        React.createElement("button", { style: tabStyle(tab === "overview"), onClick: function () { setTab("overview"); } }, "Overview"),
        React.createElement("button", { style: tabStyle(tab === "run"), onClick: function () { setTab("run"); } }, "Run Batch"),
        React.createElement("button", { style: tabStyle(tab === "browse"), onClick: function () { setTab("browse"); } }, "Browse Patterns"),
        React.createElement("button", { style: tabStyle(tab === "insights"), onClick: function () { setTab("insights"); } }, "Insights")
      ),

      // Error
      error && React.createElement("div", { style: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, marginBottom: 16, color: "#dc2626", fontSize: 13 } }, error),

      // Tab content
      tab === "overview" && renderOverview(),
      tab === "run" && renderRunBatch(),
      tab === "browse" && renderBrowse(),
      tab === "insights" && renderInsights()
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

    async function handleExport() {
      try {
        var json = await PatternStore.exportJSON();
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
        var count = await PatternStore.importJSON(text);
        if (window.reloadPatternCache) await window.reloadPatternCache();
        var all = await PatternStore.getAll();
        setPatterns(all);
        var st = await PatternStore.getStats();
        setStats(st);
        try {
          var rpt = await BatchBacktest.create({}).generateReport();
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
        var count = (await PatternStore.getAll()).length;
        await PatternStore.clearAll();
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
