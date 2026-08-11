/* ══════════════════════════════════════════════════════════════════════════
   Technical Indicators Panel — React Component
   Renders a live technical analysis dashboard for a selected stock.
   Depends on: window.TechIndicators, window.OHLCVFetcher, React
   ══════════════════════════════════════════════════════════════════════════ */
window.TechnicalIndicatorsPanel = (function () {

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useMemo = React.useMemo;
  var useRef = React.useRef;

  var TI = window.TechIndicators;
  var DF = window.OHLCVFetcher;

  /* ── Color palette for signals ─────────────────────────────────────────── */
  var SIGNAL_COLORS = {
    bullish: { bg: "rgba(22,163,74,.12)", border: "rgba(22,163,74,.3)", text: "#16a34a", label: "Bullish" },
    bearish: { bg: "rgba(239,68,68,.12)", border: "rgba(239,68,68,.3)", text: "#ef4444", label: "Bearish" },
    overbought: { bg: "rgba(234,88,12,.12)", border: "rgba(234,88,12,.3)", text: "#ea580c", label: "Overbought" },
    oversold: { bg: "rgba(37,99,235,.12)", border: "rgba(37,99,235,.3)", text: "#2563eb", label: "Oversold" },
    neutral: { bg: "var(--bg5)", border: "var(--border)", text: "var(--text5)", label: "Neutral" },
    trending: { bg: "rgba(168,85,247,.12)", border: "rgba(168,85,247,.3)", text: "#a855f7", label: "Trending" },
    ranging: { bg: "var(--bg5)", border: "var(--border)", text: "var(--text5)", label: "Ranging" },
  };

  var TIMEFRAMES = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "1h", label: "1H" },
    { key: "30m", label: "30m" },
    { key: "15m", label: "15m" },
    { key: "5m", label: "5m" },
    { key: "1m", label: "1m" },
  ];

  /* ── Indicator definitions (name, key, category, default params) ──────── */
  var INDICATORS = [
    { name: "SMA (20)", key: "sma_20", cat: "Trend", type: "line" },
    { name: "SMA (50)", key: "sma_50", cat: "Trend", type: "line" },
    { name: "SMA (200)", key: "sma_200", cat: "Trend", type: "line" },
    { name: "EMA (9)", key: "ema_9", cat: "Trend", type: "line" },
    { name: "EMA (21)", key: "ema_21", cat: "Trend", type: "line" },
    { name: "EMA (50)", key: "ema_50", cat: "Trend", type: "line" },
    { name: "WMA (20)", key: "wma_20", cat: "Trend", type: "line" },
    { name: "Rolling VWAP(10)", key: "vwap", cat: "Volume", type: "line" },
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

  var CATEGORIES = ["Trend", "Momentum", "Volatility", "Volume", "Structure"];

  function fmt(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    dec = dec !== undefined ? dec : 2;
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (Math.abs(v) >= 1e7) return (v / 1e7).toFixed(1) + "Cr";
    if (Math.abs(v) >= 1e5) return (v / 1e3).toFixed(1) + "K";
    return Number(v).toFixed(dec);
  }

  function fmtVol(v) {
    if (v === null || v === undefined) return "—";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e7) return (v / 1e7).toFixed(2) + "Cr";
    if (v >= 1e5) return (v / 1e5).toFixed(2) + "L";
    if (v >= 1000) return (v / 1000).toFixed(1) + "K";
    return v.toString();
  }

  /* ── Signal badge component ─────────────────────────────────────────────── */
  function SignalBadge(signal) {
    if (!signal) return null;
    var s = SIGNAL_COLORS[signal] || SIGNAL_COLORS.neutral;
    return React.createElement("span", {
      style: {
        display: "inline-block", padding: "2px 8px", borderRadius: 10,
        fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
        background: s.bg, border: "1px solid " + s.border, color: s.text,
        textTransform: "uppercase",
      }
    }, s.label);
  }

  /* ── Single indicator card ─────────────────────────────────────────────── */
  function IndicatorCard(props) {
    var ind = props.ind, val = props.val, signal = props.signal, lastClose = props.lastClose;
    var showSignal = signal && signal !== "neutral";

    // Determine if value is above/below close for trend indicators
    var deviation = null;
    if (lastClose && typeof val === "number" && ind.type === "line" && val > 0) {
      deviation = ((lastClose - val) / val * 100);
    }

    var cardBg = "var(--bg3)";
    var cardBorderLeft = "none";
    if (signal === "bullish") { cardBg = "rgba(22,163,74,.06)"; cardBorderLeft = "3px solid #16a34a"; }
    else if (signal === "bearish") { cardBg = "rgba(239,68,68,.06)"; cardBorderLeft = "3px solid #ef4444"; }
    else if (signal === "overbought") { cardBg = "rgba(234,88,12,.05)"; cardBorderLeft = "3px solid #ea580c"; }
    else if (signal === "oversold") { cardBg = "rgba(37,99,235,.05)"; cardBorderLeft = "3px solid #2563eb"; }
    else if (signal === "trending") { cardBg = "rgba(168,85,247,.05)"; cardBorderLeft = "3px solid #a855f7"; }
    else if (signal === "ranging") { cardBg = "rgba(107,114,128,.04)"; cardBorderLeft = "3px solid #6b7280"; }
    else if (signal === "neutral") { cardBg = "rgba(107,114,128,.03)"; }

    return React.createElement("div", {
      style: {
        padding: "10px 14px", borderRadius: 10,
        background: cardBg, border: "1px solid var(--border)", borderLeft: cardBorderLeft,
        display: "flex", flexDirection: "column", gap: 4,
        transition: "background .3s, border-color .3s",
      }
    },
      React.createElement("div", {
        style: { display: "flex", justifyContent: "space-between", alignItems: "center" }
      },
        React.createElement("span", {
          style: { fontSize: 11, fontWeight: 600, color: "var(--text4)", textTransform: "uppercase", letterSpacing: 0.4 }
        }, ind.name),
        SignalBadge(signal)
      ),
      React.createElement("div", {
        style: {
          fontSize: 18, fontWeight: 800, fontFamily: "'Sora',sans-serif",
          color: "var(--text)", lineHeight: 1.2,
        }
      }, formatValue(ind, val)),
      // Sub-values for complex indicators
      ind.type === "macd" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 12, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "MACD: ", fmt(val.macd, 4)),
        React.createElement("span", null, "Signal: ", fmt(val.signal, 4)),
        React.createElement("span", { style: { color: val.histogram >= 0 ? "#16a34a" : "#ef4444" } },
          "Hist: ", fmt(val.histogram, 4))
      ),
      ind.type === "bands" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 10, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "U: ", fmt(val.upper)),
        React.createElement("span", null, "M: ", fmt(val.middle)),
        React.createElement("span", null, "L: ", fmt(val.lower))
      ),
      ind.type === "ichimoku" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "Tenkan: ", fmt(val.tenkan)),
        React.createElement("span", null, "Kijun: ", fmt(val.kijun)),
        React.createElement("span", null, "Senkou A: ", fmt(val.senkouA)),
        React.createElement("span", null, "Senkou B: ", fmt(val.senkouB))
      ),
      ind.type === "stoch" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 12, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "%K: ", fmt(val.k)),
        React.createElement("span", null, "%D: ", fmt(val.d))
      ),
      ind.type === "darvas" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 10, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "Top: ", fmt(val.boxTop)),
        React.createElement("span", null, "Bottom: ", fmt(val.boxBottom)),
        val.breakout && React.createElement("span", {
          style: { color: val.breakout === "up" ? "#16a34a" : val.breakout === "down" ? "#ef4444" : "var(--text5)" }
        }, "Breakout: ", val.breakout.toUpperCase())
      ),
      ind.type === "smartMoney" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 10, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        val.bos && React.createElement("span", null, "BOS: ", val.bos.replace("_", " ")),
        val.choch && React.createElement("span", null, "CHoCH: ", val.choch.replace("_", " "))
      ),
      ind.type === "volumeProfile" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 10, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "POC: ", fmt(val.poc)),
        val.valueAreaHigh && React.createElement("span", null, "VAH: ", fmt(val.valueAreaHigh)),
        val.valueAreaLow && React.createElement("span", null, "VAL: ", fmt(val.valueAreaLow))
      ),
      ind.type === "chandelier" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 12, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "Long: ", fmt(val.long)),
        React.createElement("span", null, "Short: ", fmt(val.short)),
        lastClose && val.long && React.createElement("span", { style: { color: lastClose > val.long ? "#16a34a" : "#ef4444" } }, lastClose > val.long ? "Above Long" : "Below Long")
      ),
      ind.type === "heikinAshi" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 10, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "O: ", fmt(val.open)),
        React.createElement("span", null, "H: ", fmt(val.high)),
        React.createElement("span", null, "L: ", fmt(val.low)),
        React.createElement("span", null, "C: ", fmt(val.close)),
        React.createElement("span", { style: { color: val.trend === "bullish" ? "#16a34a" : val.trend === "bearish" ? "#ef4444" : "var(--text5)" } }, val.trend ? val.trend.toUpperCase() : "—")
      ),
      ind.type === "fibonacci" && val && typeof val === "object" && val.retrace && React.createElement("div", {
        style: { display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "SH: ", fmt(val.swingHigh)),
        React.createElement("span", null, "SL: ", fmt(val.swingLow)),
        Object.keys(val.retrace).map(function(k) { return React.createElement("span", { key: k }, k + ": " + fmt(val.retrace[k])); })
      ),
      ind.type === "pivotPoints" && val && typeof val === "object" && val.classic && React.createElement("div", {
        style: { display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "P: ", fmt(val.classic.P)),
        React.createElement("span", { style: { color: "#16a34a" } }, "R1: ", fmt(val.classic.R1)),
        React.createElement("span", { style: { color: "#16a34a" } }, "R2: ", fmt(val.classic.R2)),
        React.createElement("span", { style: { color: "#ef4444" } }, "S1: ", fmt(val.classic.S1)),
        React.createElement("span", { style: { color: "#ef4444" } }, "S2: ", fmt(val.classic.S2))
      ),
      ind.type === "aroon" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 12, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "Up: ", fmt(val.up)),
        React.createElement("span", null, "Down: ", fmt(val.down)),
        React.createElement("span", { style: { color: val.osc > 0 ? "#16a34a" : "#ef4444" } }, "Osc: ", fmt(val.osc))
      ),
      ind.type === "vortex" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 12, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", { style: { color: "#16a34a" } }, "VI+: ", fmt(val.plus)),
        React.createElement("span", { style: { color: "#ef4444" } }, "VI-: ", fmt(val.minus))
      ),
      ind.type === "rs" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 10, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "RS: ", fmt(val.rs, 4)),
        val.mansfield != null && React.createElement("span", { style: { color: val.mansfield > 0 ? "#16a34a" : "#ef4444" } }, "Mansfield: ", fmt(val.mansfield, 2) + "%")
      ),
      deviation !== null && React.createElement("div", {
        style: {
          fontSize: 10, marginTop: 2,
          color: deviation >= 0 ? "#16a34a" : "#ef4444",
        }
      }, (deviation >= 0 ? "+" : "") + fmt(deviation, 1) + "% from close")
    );
  }

  function formatValue(ind, val) {
    if (val === null || val === undefined) return "—";
    if (typeof val === "object") {
      if (ind.type === "macd") return fmt(val.macd, 4);
      if (ind.type === "stoch") return "%K: " + fmt(val.k) + " / %D: " + fmt(val.d);
      if (ind.type === "bands") return fmt(val.middle);
      if (ind.type === "ichimoku") return fmt(val.tenkan);
      if (ind.type === "darvas") return val.boxTop ? fmt(val.boxTop) + " / " + fmt(val.boxBottom) : "—";
      if (ind.type === "smartMoney") return val.bos ? val.bos.replace("_", " ").toUpperCase() : "—";
      if (ind.type === "volumeProfile") return val.poc ? "POC: " + fmt(val.poc) : "—";
      if (ind.type === "chandelier") return "L: " + fmt(val.long) + " / S: " + fmt(val.short);
      if (ind.type === "heikinAshi") return (val.trend || "—").toUpperCase();
      if (ind.type === "fibonacci") return val.swingHigh ? fmt(val.swingHigh) + " — " + fmt(val.swingLow) : "—";
      if (ind.type === "pivotPoints") return val.classic ? "P: " + fmt(val.classic.P) : "—";
      if (ind.type === "fractals") return (val.up ? val.up.length : 0) + "↑ / " + (val.down ? val.down.length : 0) + "↓";
      if (ind.type === "aroon") return "Up: " + fmt(val.up) + " / Dn: " + fmt(val.down);
      if (ind.type === "zigZag") return val ? val.length + " pivots" : "—";
      if (ind.type === "vortex") return "+: " + fmt(val.plus) + " / -: " + fmt(val.minus);
      if (ind.type === "rs") return val.rs ? "RS: " + fmt(val.rs, 4) : "—";
      return "—";
    }
    if (ind.type === "volume") return fmtVol(val);
    if (ind.type === "squeeze") return val ? "Squeeze ON" : "Squeeze OFF";
    return fmt(val);
  }

  /* ── Overall score gauge ────────────────────────────────────────────────── */
  function ScoreGauge(score) {
    if (!score || score.total === 0) return null;
    var bullPct = (score.bull / score.total * 100);
    var neutralPct = (score.neutral / score.total * 100);
    var bearPct = (score.bear / score.total * 100);
    var color = score.bull > score.bear ? "#16a34a" : score.bear > score.bull ? "#ef4444" : "#6b7280";

    return React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 18px", borderRadius: 12,
        background: "var(--bg3)", border: "1px solid var(--border)", marginBottom: 16,
      }
    },
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text4)", marginBottom: 6 } }, "Overall Signal"),
        React.createElement("div", {
          style: { height: 8, borderRadius: 4, background: "var(--bg5)", overflow: "hidden", display: "flex" }
        },
          bullPct > 0 && React.createElement("div", {
            style: {
              width: bullPct + "%", height: "100%",
              background: "linear-gradient(90deg, #16a34a, #22c55e)",
              transition: "width .3s",
            }
          }),
          neutralPct > 0 && React.createElement("div", {
            style: {
              width: neutralPct + "%", height: "100%",
              background: "linear-gradient(90deg, #6b7280, #9ca3af)",
              transition: "width .3s",
            }
          }),
          bearPct > 0 && React.createElement("div", {
            style: {
              width: bearPct + "%", height: "100%",
              background: "linear-gradient(90deg, #ef4444, #dc2626)",
              transition: "width .3s",
            }
          })
        ),
        React.createElement("div", {
          style: { display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "var(--text5)" }
        },
          React.createElement("span", null, score.bull + " Bullish"),
          React.createElement("span", null, score.neutral + " Neutral"),
          React.createElement("span", null, score.bear + " Bearish")
        )
      ),
      React.createElement("div", {
        style: {
          width: 64, height: 64, borderRadius: "50%",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: color + "15", border: "2px solid " + color,
          flexShrink: 0,
        }
      },
        React.createElement("span", {
          style: { fontSize: 11, fontWeight: 800, color: "#16a34a", lineHeight: 1.2, fontFamily: "'Sora',sans-serif" }
        }, score.bull),
        React.createElement("span", {
          style: { fontSize: 9, fontWeight: 600, color: "#6b7280", lineHeight: 1.2 }
        }, score.neutral),
        React.createElement("span", {
          style: { fontSize: 11, fontWeight: 800, color: "#ef4444", lineHeight: 1.2, fontFamily: "'Sora',sans-serif" }
        }, score.bear)
      )
    );
  }

  /* ── Exit Score Card ────────────────────────────────────────────────── */
  function ExitScoreCard(candles, ind, buyPrice, buyDate, currentPrice, entryScore, indexCandles, weeklyCandles, dailyCandles, hourlyCandles) {
    var position = {
      entry_price: buyPrice,
      holding_days: buyDate ? Math.floor((new Date() - new Date(buyDate + "T12:00:00")) / 864e5) : 0,
      entry_score: entryScore
    };
    var es = TI.computeCompatExitScore(candles, weeklyCandles, dailyCandles, hourlyCandles, position, indexCandles);
    if (!es || es.exit_score == null) return null;
    var exitScoreShown = es.exit_score != null ? Math.round(es.exit_score * 10) / 10 : es.exit_score;

    var decisionMap = {
      URGENT_EXIT: { label: "Urgent Exit", color: "#ef4444" },
      EXIT: { label: "Exit", color: "#f97316" },
      PARTIAL_EXIT: { label: "Partial Exit", color: "#eab308" },
      TIGHTEN_STOP: { label: "Tighten Stop", color: "#3b82f6" },
      MONITOR: { label: "Monitor", color: "#a855f7" },
      HOLD: { label: "Hold", color: "#16a34a" }
    };
    var decision = decisionMap[es.classification] || { label: "N/A", color: "#6b7280" };

    var factors = [
      { label: "Trend Breakdown", val: es.trend_breakdown, max: 25, color: "#3b82f6" },
      { label: "Momentum Exhaustion", val: es.momentum_exhaustion, max: 25, color: "#a855f7" },
      { label: "Volume Distribution", val: es.volume_distribution, max: 25, color: "#f59e0b" },
      { label: "Structure Breakdown", val: es.structure_breakdown, max: 25, color: "#ec4899" },
    ];

    /* ── Exit Recommendations ── */
    var exitRecs = null;
    var ep = buyPrice && buyPrice > 0 ? buyPrice : null;
    var cp = currentPrice && currentPrice > 0 ? currentPrice : (ind && ind.lastClose ? ind.lastClose : null);
    var atr = ind && ind.atr_14 ? ind.atr_14 : null;
    if (ep && cp && atr) {
      var holdingDays = 0;
      if (buyDate) {
        var bd = new Date(buyDate + "T12:00:00");
        var now = new Date();
        holdingDays = Math.floor((now - bd) / 864e5);
      }
      var target = ep * 1.04;
      var stopLoss = ep - (atr * 1.5);
      var highWatermark = cp;
      if (candles && candles.length > 0) {
        for (var ci = 0; ci < candles.length; ci++) {
          if (candles[ci].h > highWatermark) highWatermark = candles[ci].h;
        }
      }
      var trailingStop = highWatermark - (atr * 2);
      var pnlPct = ep > 0 ? ((cp - ep) / ep * 100) : 0;
      var aboveEntry2Pct = cp >= ep * 1.02;

      var rules = [];
      rules.push({ label: "Take Profit (+4%)", price: target, trigger: cp >= target, active: cp >= target, type: "exit", color: "#16a34a" });
      rules.push({ label: "Stop Loss (1.5\u00d7ATR)", price: stopLoss, trigger: cp <= stopLoss, active: cp <= stopLoss, type: "exit", color: "#ef4444" });
      if (aboveEntry2Pct) {
        rules.push({ label: "Trailing Stop (2\u00d7ATR from high)", price: trailingStop, trigger: cp <= trailingStop, active: cp <= trailingStop, type: "exit", color: "#ef4444" });
      }
      var timeStopActive = holdingDays >= 20 && cp < ep * 1.02;
      rules.push({ label: "Time Stop (20d, <2% gain)", price: null, trigger: timeStopActive, active: timeStopActive, type: "exit", color: "#f97316" });
      var partialActive = aboveEntry2Pct && holdingDays >= 3 && !cp >= target;
      rules.push({ label: "Partial Exit 50% (+2%, 3d+)", price: ep * 1.02, trigger: partialActive, active: partialActive && !timeStopActive, type: "partial", color: "#eab308" });

      var activeRule = null;
      if (cp >= target) activeRule = rules[0];
      else if (cp <= stopLoss) activeRule = rules[1];
      else if (aboveEntry2Pct && cp <= trailingStop) activeRule = rules[2];
      else if (timeStopActive) activeRule = rules[3];
      else if (partialActive && !timeStopActive) activeRule = rules[4];

      exitRecs = { rules: rules, activeRule: activeRule, pnlPct: pnlPct, holdingDays: holdingDays, target: target, stopLoss: stopLoss, trailingStop: trailingStop };
    }

    return React.createElement("div", {
      style: {
        padding: "14px 18px", borderRadius: 12, marginBottom: 16,
        background: "var(--bg3)", border: "2px solid " + decision.color + "33",
      }
    },
      /* Header row */
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }
      },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "'Sora',sans-serif" } }, "Exit Score"),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } },
            "Momentum Exit Engine \u00b7 0\u2013100 \u00b7 4 Components"
          )
        ),
        React.createElement("div", {
          style: {
            display: "flex", alignItems: "center", gap: 10,
          }
        },
          React.createElement("div", { style: { textAlign: "right" } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, "Decision"),
            React.createElement("div", { style: { fontSize: 12, fontWeight: 800, color: decision.color, fontFamily: "'Sora',sans-serif" } }, decision.label)
          ),
          React.createElement("div", {
            style: {
              width: 56, height: 56, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: decision.color + "18", border: "2.5px solid " + decision.color,
              flexShrink: 0,
            }
          },
            React.createElement("span", {
              style: { fontSize: 20, fontWeight: 900, color: decision.color, fontFamily: "'Sora',sans-serif", lineHeight: 1 }
            }, exitScoreShown)
          )
        )
      ),

      /* Factor breakdown */
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        factors.map(function (f) {
          var pct = f.max > 0 ? (f.val / f.max * 100) : 0;
          return React.createElement("div", { key: f.label, style: { display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("span", { style: { width: 68, fontSize: 10, fontWeight: 600, color: "var(--text4)", textAlign: "right", flexShrink: 0 } }, f.label),
            React.createElement("div", { style: { flex: 1, height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
              React.createElement("div", {
                style: {
                  width: pct + "%", height: "100%", borderRadius: 3,
                  background: f.color, transition: "width .3s",
                }
              })
            ),
            React.createElement("span", { style: { width: 40, fontSize: 10, fontWeight: 700, color: "var(--text4)", fontFamily: "'Sora',sans-serif", textAlign: "right" } },
              f.val + "/" + f.max
            )
          );
        })
      ),

      /* Overrides */
      es.overrides && es.overrides.length > 0 && React.createElement("div", {
        style: {
          marginTop: 10, padding: "8px 12px", borderRadius: 8,
          background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)",
        }
      },
        React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#ef4444", marginBottom: 4 } }, React.createElement(React.Fragment, null, Ico.alertTriangle(12, "#ef4444"), " Critical Overrides")),
        es.overrides.map(function (o, i) {
          return React.createElement("div", { key: i, style: { fontSize: 10, color: "#ef4444", lineHeight: 1.5 } }, "\u2022 " + o);
        })
      ),

      /* ── Penalties & Bonuses ── */
      React.createElement("div", {
        style: { marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "var(--bg4)", border: "1px solid var(--border)" }
      },
        React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "var(--text3)", fontFamily: "'Sora',sans-serif", marginBottom: 6 } }, "Penalties & Bonuses"),
        es.penalty_items && es.penalty_items.length > 0
          ? es.penalty_items.map(function(p, i) {
              return React.createElement("div", { key: "p-" + i, style: { fontSize: 10, color: "#ef4444", lineHeight: 1.5, padding: "2px 8px", borderRadius: 4, background: "rgba(239,68,68,.06)", marginBottom: 2 } },
                "\u2193 " + p.reason + " (" + p.amount + ")"
              );
            })
          : null,
        es.bonus_items && es.bonus_items.length > 0
          ? es.bonus_items.map(function(b, i) {
              return React.createElement("div", { key: "b-" + i, style: { fontSize: 10, color: "#16a34a", lineHeight: 1.5, padding: "2px 8px", borderRadius: 4, background: "rgba(22,163,74,.06)", marginBottom: 2 } },
                "\u2191 " + b.reason + " (+" + b.amount + ")"
              );
            })
          : null,
        (!es.penalty_items || es.penalty_items.length === 0) && (!es.bonus_items || es.bonus_items.length === 0) && React.createElement("div", {
          style: { fontSize: 10, color: "var(--text6)", fontStyle: "italic" }
        }, "No penalties or bonuses active")
      ),

      /* ── Exit Price Recommendations ── */
      exitRecs && React.createElement("div", {
        style: {
          marginTop: 12, padding: "12px 14px", borderRadius: 10,
          background: "var(--bg4)", border: "1px solid var(--border)",
        }
      },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)", fontFamily: "'Sora',sans-serif" } }, "Exit Price Recommendations"),
          React.createElement("div", { style: { display: "flex", gap: 12, fontSize: 10 } },
            React.createElement("span", { style: { color: "var(--text5)" } }, "Entry: " + INR(ep)),
            React.createElement("span", { style: { color: "var(--text5)" } }, "Current: " + INR(cp)),
            React.createElement("span", { style: { color: exitRecs.pnlPct >= 0 ? "#16a34a" : "#ef4444", fontWeight: 700 } }, (exitRecs.pnlPct >= 0 ? "+" : "") + exitRecs.pnlPct.toFixed(1) + "%"),
            React.createElement("span", { style: { color: "var(--text5)" } }, exitRecs.holdingDays + "d held")
          )
        ),
        exitRecs.activeRule && React.createElement("div", {
          style: {
            padding: "8px 12px", borderRadius: 8, marginBottom: 10,
            background: (exitRecs.activeRule.type === "exit" ? "rgba(239,68,68,.08)" : "rgba(234,179,8,.08)"),
            border: "1px solid " + (exitRecs.activeRule.type === "exit" ? "rgba(239,68,68,.25)" : "rgba(234,179,8,.3)"),
          }
        },
          React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: exitRecs.activeRule.color, marginBottom: 2 } },
            React.createElement(React.Fragment, null, Ico.alertTriangle(12, "#ef4444"), " " + exitRecs.activeRule.type.toUpperCase() + " SIGNAL")
          ),
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text)" } }, exitRecs.activeRule.label),
          exitRecs.activeRule.price !== null && React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } },
            "At " + INR(exitRecs.activeRule.price)
          )
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 } },
          exitRecs.rules.map(function (r, i) {
            return React.createElement("div", {
              key: i,
              style: {
                padding: "8px 10px", borderRadius: 8,
                background: r.active ? (r.type === "exit" ? "rgba(239,68,68,.08)" : "rgba(234,179,8,.08)") : "var(--bg3)",
                border: "1px solid " + (r.active ? (r.type === "exit" ? "rgba(239,68,68,.25)" : "rgba(234,179,8,.3)") : "var(--border)"),
              }
            },
              React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: r.active ? r.color : "var(--text5)", marginBottom: 3 } }, r.label),
              React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: r.active ? "var(--text)" : "var(--text5)", fontFamily: "'Sora',sans-serif" } },
                r.price !== null ? INR(r.price) : "\u2014"
              ),
              React.createElement("div", { style: { fontSize: 9, color: r.active ? r.color : "var(--text6)", marginTop: 2 } },
                r.active ? React.createElement(React.Fragment, null, Ico.dot(8, "#22c55e"), " ACTIVE") : "Pending"
              )
            );
          })
        )
      )
    );
  }

  /* ── Main Panel Component ──────────────────────────────────────────────── */
  function TechnicalIndicatorsPanelInner(props) {
    var shares = props.shares || [];
    var isMobile = props.isMobile;

    var _a = useState(shares.length > 0 ? shares[0].ticker : ""), ticker = _a[0], setTicker = _a[1];
    var _b = useState("daily"), timeframe = _b[0], setTimeframe = _b[1];
    var _c = useState(null), candles = _c[0], setCandles = _c[1];
    var _d = useState(false), loading = _d[0], setLoading = _d[1];
    var _e = useState(null), error = _e[0], setError = _e[1];
    var _f = useState(null), indicators = _f[0], setIndicators = _f[1];
    var _g = useState(null), signals = _g[0], setSignals = _g[1];
    var _h = useState(false), autoRefresh = _h[0], setAutoRefresh = _h[1];
    var _i = useState(null), lastUpdated = _i[0], setLastUpdated = _i[1];
    var _j = useState("all"), category = _j[0], setCategory = _j[1];
    var _k = useState(0), refreshTick = _k[0], setRefreshTick = _k[1];
    var _l = useState(null), dataSource = _l[0], setDataSource = _l[1];
    var _m = useState(false), showGuide = _m[0], setShowGuide = _m[1];
    var _n = useState(null), indexCandles = _n[0], setIndexCandles = _n[1];
    var _o = useState(null), hourlyCandlesMTF = _o[0], setHourlyCandlesMTF = _o[1];
    var _p = useState(null), dailyCandlesMTF = _p[0], setDailyCandlesMTF = _p[1];
    var _q = useState(null), weeklyCandlesMTF = _q[0], setWeeklyCandlesMTF = _q[1];
    var timerRef = useRef(null);

    var fetchData = useCallback(async function () {
      if (!ticker) return;
      setLoading(true);
      setError(null);
      try {
        var result = await DF.fetchOHLCVCached(ticker, timeframe);
        var data = result.data;
        var source = result.source;
        if (!data || data.length < 10) {
          setError("Insufficient data for " + ticker + ". Try a different timeframe.");
          setLoading(false);
          return;
        }
        setCandles(data);
        setDataSource(source);
        var indexResult = await DF.fetchOHLCVCached("^NSEI", timeframe);
        var indexData = indexResult ? indexResult.data : null;
        setIndexCandles(indexData);
        var mtfResults = await Promise.all([
          DF.fetchOHLCVCached(ticker, "1h"),
          DF.fetchOHLCVCached(ticker, "daily"),
          DF.fetchOHLCVCached(ticker, "weekly")
        ]);
        setHourlyCandlesMTF(mtfResults[0] ? mtfResults[0].data : null);
        setDailyCandlesMTF(mtfResults[1] ? mtfResults[1].data : null);
        setWeeklyCandlesMTF(mtfResults[2] ? mtfResults[2].data : null);
        var ind = TI.computeAllWithIndex(data, indexData);
        setIndicators(ind);
        var sig = TI.interpret(ind);
        setSignals(sig);
        setLastUpdated(new Date());
      } catch (e) {
        setError("Failed to fetch data: " + (e.message || "Unknown error"));
      }
      setLoading(false);
    }, [ticker, timeframe]);

    // Initial fetch
    useEffect(function () { fetchData(); }, [fetchData]);

    // Auto-refresh every 60s
    useEffect(function () {
      if (!autoRefresh) { clearInterval(timerRef.current); return; }
      timerRef.current = setInterval(function () {
        DF.clearCache();
        setRefreshTick(function (t) { return t + 1; });
      }, 60000);
      return function () { clearInterval(timerRef.current); };
    }, [autoRefresh]);

    useEffect(function () { fetchData(); }, [refreshTick, fetchData]);

    // Filtered indicators by category
    var filteredIndicators = useMemo(function () {
      if (category === "all") return INDICATORS;
      return INDICATORS.filter(function (ind) { return ind.cat === category; });
    }, [category]);

    var _sc = function(key, bullish) {
      var map = {
        sma_20: ["Institutional buy orders step in on tests of the 20/50 SMA.", "Price rallies but rejected at MA from below."],
        ema_9: ["Short-term trend supported by institutional flow.", "EMA turns into resistance on pullback attempts."],
        macd: ["Surging institutional momentum; expanding histogram confirms.", "Fading institutional support; histogram shrinking."],
        adx_14: ["+DI > -DI confirms strong trend.", "-DI > +DI = bearish trend control."],
        supertrend: ["Institutional uptrend control.", "Institutional support has ended."],
        psar: ["Price above PSAR = uptrend.", "Price below PSAR = downtrend."],
        aroon: ["Strong uptrend (Aroon Osc > 50).", "Strong downtrend (Aroon Osc < -50)."],
        rsi_14: ["RSI 40-80; bounces off 40-50 signal institutional re-entries.", "Bearish divergence or break below 40 = institutional exit."],
        cci_20: ["CCI rising from oversold = accumulation.", "Extreme CCI > 100 then sharp drop = Smart Money dumping."],
        roc_12: ["Positive ROC backed by volume = strong buying velocity.", "Negative ROC = selling pressure."],
        mfi_14: ["MFI rising from < 20 = accumulation.", "MFI > 80 = potential overbought distribution."],
        vwap: ["Dips to VWAP bought by institutional algorithms.", "Price below VWAP; institutions offload on rallies to VWAP."],
        obv: ["Rising OBV confirms institutional buying power.", "Bearish divergence: higher price, lower OBV = Smart Money selling."],
        ttmSqueeze: ["Squeeze release upward = institutional markup.", "Squeeze release downward = institutional distribution."],
        bb: ["Walking upper band with volume = aggressive institutional expansion.", "Upper band touch + long wick = liquidity sweep, then breakdown."],
        donchian: ["High-volume breakout above = institutional displacement.", "Fake breakout (stop hunt), reversal back inside."],
        chandelier: ["Price above exit = safe; trend intact.", "Chandelier triggered = institutional support ended."],
        ichimoku: ["Price above cloud = bullish; Tenkan/Kijun cross = signal.", "Price below cloud = bearish."],
        pivotPoints: ["Holding above Pivot = bullish.", "Below Pivot = bearish."],
        choppiness: ["Trending (< 38.2).", "Ranging/choppy (> 61.8)."],
        mtfAlignment: ["Complete MTF harmony = alignment across timeframes.", "Degrading MTF = conflicting institutional flows."],
        volumeProfile: ["POC bounce = institutional defense of value.", "Break below POC = value turned into resistance."],
        cmf: ["CMF > 0.05 = institutions infusing capital.", "Negative CMF = distribution."],
        kvo: ["KVO > 0 = bullish volume pressure.", "KVO < 0 = bearish volume."],
        pvt: ["Rising PVT = accumulation.", "Falling PVT = distribution."],
        vortex: ["+VI > -VI = institutional trend control.", "-VI > +VI = support ended."],
        heikinAshi: ["Consecutive green HA = institutional trend control.", "Red HA = bearish pressure."],
        fractals: ["Dip below fractal low, trigger stops, then surge = liquidity grab.", "Spike above fractal high, trigger breakouts, then dump."],
        smartMoney: ["BOS up = trend continuation.", "BOS down = reversal."],
        fibonacci: ["0.618 Fib bounce = institutional buy-wick rejection.", "0.618 failure = structural breakdown."],
        darvas: ["Breakout above box = bullish.", "Breakdown below box = bearish."],
        keltner: ["High-volume breakout above = institutional displacement.", "Fakeout above then reversal back inside."]
      };
      var entry = map[key];
      if (!entry) return null;
      return React.createElement("div", { style: { color: "var(--text6)", lineHeight: 1.3, marginTop: 1 } }, bullish ? entry[0] : entry[1]);
    };

    return React.createElement("div", null,
      /* ── Data source status ── */
      React.createElement("div", {
        style: {
          marginBottom: 14, padding: "8px 14px", borderRadius: 10,
          background: "var(--bg3)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text4)",
        }
      },
        React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: "#16a34a" } }),
        React.createElement("span", null, "Data source: ", React.createElement("span", { style: { color: "#16a34a", fontWeight: 600 } }, "Yahoo Finance"))
      ),

      /* ── Controls row ── */
      React.createElement("div", {
        style: {
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14,
        }
      },
        /* Ticker selector */
        React.createElement("select", {
          value: ticker,
          onChange: function (e) { setTicker(e.target.value); DF.clearCache(); },
          style: {
            padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: "var(--bg4)", border: "1px solid var(--border)",
            color: "var(--text2)", outline: "none", minWidth: 160,
          }
        },
          shares.map(function (sh) {
            return React.createElement("option", { key: sh.id, value: sh.ticker }, sh.company + " (" + sh.ticker + ")");
          })
        ),
        /* Ticker manual input */
        React.createElement("input", {
          type: "text", placeholder: "Or enter ticker...",
          value: ticker,
          onChange: function (e) { setTicker(e.target.value.toUpperCase()); },
          style: {
            width: 130, padding: "8px 12px", borderRadius: 8, fontSize: 12,
            background: "var(--bg4)", border: "1px solid var(--border)",
            color: "var(--text2)", outline: "none",
          }
        }),
        /* Timeframe buttons */
        React.createElement("div", {
          style: { display: "flex", gap: 2, background: "var(--bg4)", borderRadius: 8, padding: 2 }
        },
          TIMEFRAMES.map(function (tf) {
            return React.createElement("button", {
              key: tf.key,
              onClick: function () { setTimeframe(tf.key); DF.clearCache(); },
              style: {
                padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: timeframe === tf.key ? 700 : 500,
                border: "none", cursor: "pointer",
                background: timeframe === tf.key ? "var(--accent)" : "transparent",
                color: timeframe === tf.key ? "#fff" : "var(--text5)",
                transition: "all .15s",
              }
            }, tf.label);
          })
        ),
        /* Auto-refresh toggle */
        React.createElement("button", {
          onClick: function () { setAutoRefresh(!autoRefresh); },
          style: {
            padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
            border: "1px solid " + (autoRefresh ? "rgba(22,163,74,.4)" : "var(--border)"),
            background: autoRefresh ? "rgba(22,163,74,.1)" : "var(--bg4)",
            color: autoRefresh ? "#16a34a" : "var(--text5)",
            cursor: "pointer",
          }
          }, autoRefresh ? React.createElement(React.Fragment, null, Ico.dot(8, "#22c55e"), " Live") : React.createElement(React.Fragment, null, Ico.dotOutline(8, "var(--text5)"), " Auto")),
        /* Manual refresh */
        React.createElement("button", {
          onClick: function () { DF.clearCache(); setRefreshTick(function (t) { return t + 1; }); },
          disabled: loading,
          style: {
            padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
            border: "1px solid var(--border)", background: "var(--bg4)",
            color: "var(--text5)", cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }
        }, loading ? "Loading..." : "↻ Refresh"),
        React.createElement("button", {
          onClick: function () { setShowGuide(!showGuide); },
          title: "Indicator guide",
          style: {
            padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
            border: "1px solid " + (showGuide ? "var(--accent)" : "var(--border)"),
            background: showGuide ? "var(--accentbg)" : "var(--bg4)",
            color: showGuide ? "var(--accent)" : "var(--text5)", cursor: "pointer",
          }
        }, "?")
      ),

      /* Indicator guide — dynamic (uses actual computed values) */
      showGuide && React.createElement("div", {
        style: { marginBottom: 14, borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", fontSize: 11, lineHeight: 1.6, color: "var(--text4)" }
      },
        React.createElement("div", { style: { padding: "8px 14px", background: "var(--bg4)", fontWeight: 700, fontSize: 12, color: "var(--text)", borderBottom: "1px solid var(--border)" } },
          ticker + " Indicator Analysis (" + timeframe + ")"
        ),
        React.createElement("div", { style: { padding: "10px 14px", background: "var(--bg3)", maxHeight: 400, overflowY: "auto" } },
          !indicators
            ? React.createElement("div", { style: { color: "var(--text6)", textAlign: "center", padding: 16 } }, "Loading indicators\u2026")
            : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
                /* Price context */
                React.createElement("div", { style: { padding: "6px 8px", borderRadius: 6, background: "var(--bg4)" } },
                  React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "Price: "),
                  React.createElement("span", { style: { fontWeight: 700, color: "var(--accent)" } }, fmt(indicators.lastClose)),
                  " \u00b7 " + candles.length + " candles \u00b7 " + timeframe
                ),

                /* Trend */
                React.createElement("div", null,
                  React.createElement("div", { style: { fontWeight: 600, color: "var(--text)", marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 } }, "Trend"),
                  React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 } },
                    indicators.sma_20 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "SMA(20): ", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > indicators.sma_20 ? "#16a34a" : "#ef4444" } }, fmt(indicators.sma_20)),
                      " \u2014 price ", indicators.lastClose > indicators.sma_20 ? "above = bullish" : "below = bearish",
                      _sc("sma_20", indicators.lastClose > indicators.sma_20)
                    ),
                    indicators.ema_9 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "EMA(9): ", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > indicators.ema_9 ? "#16a34a" : "#ef4444" } }, fmt(indicators.ema_9)),
                      " \u2014 ", indicators.lastClose > indicators.ema_9 ? "price above (bullish)" : "price below (bearish)",
                      _sc("ema_9", indicators.lastClose > indicators.ema_9)
                    ),
                    indicators.macd && indicators.macd.macd != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "MACD: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.macd.histogram >= 0 ? "#16a34a" : "#ef4444" } }, fmt(indicators.macd.macd, 4)),
                      " Hist: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.macd.histogram >= 0 ? "#16a34a" : "#ef4444" } }, fmt(indicators.macd.histogram, 4)),
                      " \u2014 ", indicators.macd.histogram >= 0 ? "bullish momentum" : "bearish momentum",
                      _sc("macd", indicators.macd.histogram >= 0)
                    ),
                    indicators.adx_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "ADX: ", React.createElement("span", { style: { fontWeight: 600, color: "#eab308" } }, fmt(indicators.adx_14)),
                      " \u2014 ", indicators.adx_14 > 25 ? "trending" : indicators.adx_14 > 20 ? "borderline" : "ranging"
                    ),
                    indicators.plusDI != null && indicators.minusDI != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "+DI: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.plusDI > indicators.minusDI ? "#16a34a" : "#ef4444" } }, fmt(indicators.plusDI)), " / -DI: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.plusDI > indicators.minusDI ? "#ef4444" : "#16a34a" } }, fmt(indicators.minusDI)),
                      " \u2014 ", indicators.plusDI > indicators.minusDI ? "bullish" : "bearish"
                    ),
                    indicators.supertrend != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "SuperTrend: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > indicators.supertrend ? "#16a34a" : "#ef4444" } }, fmt(indicators.supertrend)),
                      " \u2014 ", indicators.lastClose > indicators.supertrend ? "uptrend" : "downtrend",
                      _sc("supertrend", indicators.lastClose > indicators.supertrend)
                    ),
                    indicators.psar != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "PSAR: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > indicators.psar ? "#16a34a" : "#ef4444" } }, fmt(indicators.psar)),
                      " \u2014 ", indicators.lastClose > indicators.psar ? "price above (bullish)" : "price below (bearish)",
                      _sc("psar", indicators.lastClose > indicators.psar)
                    ),
                    indicators.aroon && indicators.aroon.osc != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "Aroon Osc: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.aroon.osc > 0 ? "#16a34a" : "#ef4444" } }, fmt(indicators.aroon.osc)),
                      " \u2014 ", indicators.aroon.osc > 50 ? "strong uptrend" : indicators.aroon.osc > 0 ? "uptrend" : indicators.aroon.osc < -50 ? "strong downtrend" : "downtrend",
                      _sc("aroon", indicators.aroon.osc > 0)
                    )
                  )
                ),

                /* Momentum */
                React.createElement("div", null,
                  React.createElement("div", { style: { fontWeight: 600, color: "var(--text)", marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 } }, "Momentum"),
                  React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 } },
                    indicators.rsi_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "RSI(14): ", React.createElement("span", { style: { fontWeight: 600, color: indicators.rsi_14 > 70 ? "#ef4444" : indicators.rsi_14 < 30 ? "#2563eb" : "#2563eb" } }, fmt(indicators.rsi_14)),
                      " \u2014 ", indicators.rsi_14 > 70 ? "overbought (reversal risk)" : indicators.rsi_14 < 30 ? "oversold (bounce potential)" : "neutral range",
                      _sc("rsi_14", indicators.rsi_14 > 50)
                    ),
                    indicators.cci_20 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "CCI(20): ", React.createElement("span", { style: { fontWeight: 600, color: indicators.cci_20 > 100 ? "#ef4444" : indicators.cci_20 < -100 ? "#2563eb" : "#2563eb" } }, fmt(indicators.cci_20)),
                      " \u2014 ", indicators.cci_20 > 100 ? "overbought" : indicators.cci_20 < -100 ? "oversold" : "neutral",
                      _sc("cci_20", indicators.cci_20 > 0)
                    ),
                    indicators.roc_12 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "ROC(12): ", React.createElement("span", { style: { fontWeight: 600, color: indicators.roc_12 > 0 ? "#16a34a" : "#ef4444" } }, fmt(indicators.roc_12, 2) + "%"),
                      " \u2014 ", indicators.roc_12 > 0 ? "positive momentum" : "negative momentum",
                      _sc("roc_12", indicators.roc_12 > 0)
                    ),
                    indicators.mfi_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "MFI(14): ", React.createElement("span", { style: { fontWeight: 600, color: indicators.mfi_14 > 80 ? "#ef4444" : indicators.mfi_14 < 20 ? "#2563eb" : "#2563eb" } }, fmt(indicators.mfi_14)),
                      " \u2014 ", indicators.mfi_14 > 80 ? "overbought" : indicators.mfi_14 < 20 ? "oversold" : "neutral",
                      _sc("mfi_14", indicators.mfi_14 > 50)
                    )
                  )
                ),

                /* Volume */
                React.createElement("div", null,
                  React.createElement("div", { style: { fontWeight: 600, color: "var(--text)", marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 } }, "Volume"),
                  React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 } },
                    indicators.vwap != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "Roll VWAP: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > indicators.vwap ? "#16a34a" : "#ef4444" } }, fmt(indicators.vwap)),
                      " \u2014 price ", indicators.lastClose > indicators.vwap ? "above (bullish)" : "below (bearish)",
                      _sc("vwap", indicators.lastClose > indicators.vwap)
                    ),
                    indicators.volumeProfile && indicators.volumeProfile.poc != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "POC: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose >= indicators.volumeProfile.poc ? "#16a34a" : "#ef4444" } }, fmt(indicators.volumeProfile.poc)),
                      " \u2014 highest volume price level",
                      _sc("volumeProfile", indicators.volumeProfile && indicators.lastClose >= indicators.volumeProfile.poc)
                    ),
                    indicators.ttmSqueeze != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "TTM Squeeze: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.ttmSqueeze ? "#f59e0b" : "var(--text6)" } }, indicators.ttmSqueeze ? "ON" : "OFF"),
                      indicators.ttmSqueeze ? " \u2014 coiled for breakout" : " \u2014 no squeeze"
                    )
                  )
                ),

                /* Volatility */
                React.createElement("div", null,
                  React.createElement("div", { style: { fontWeight: 600, color: "var(--text)", marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 } }, "Volatility"),
                  React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 } },
                    indicators.atr_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "ATR(14): ", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, fmt(indicators.atr_14)),
                      " \u2014 ", indicators.atr_14 > 0 && indicators.lastClose > 0
                        ? "stop distance ~" + fmt(indicators.atr_14 * 1.5) + " (" + (indicators.atr_14 / indicators.lastClose * 100).toFixed(1) + "% of price)"
                        : ""
                    ),
                    indicators.bb && indicators.bb.upper != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "Bollinger: U:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, fmt(indicators.bb.upper)), " M:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, fmt(indicators.bb.middle)), " L:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, fmt(indicators.bb.lower)),
                      indicators.lastClose >= indicators.bb.upper * 0.99 ? " \u2014 at upper band (overextended)" : indicators.lastClose <= indicators.bb.lower * 1.01 ? " \u2014 at lower band (oversold)" : " \u2014 inside bands",
                      _sc("bb", indicators.lastClose > indicators.bb.middle)
                    ),
                    indicators.donchian && indicators.donchian.upper != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "Donchian(20): H:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, fmt(indicators.donchian.upper)), " L:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, fmt(indicators.donchian.lower)),
                      indicators.lastClose >= indicators.donchian.upper ? " \u2014 breakout high" : indicators.lastClose <= indicators.donchian.lower ? " \u2014 breakout low" : "",
                      _sc("donchian", indicators.lastClose > (indicators.donchian.upper + indicators.donchian.lower) / 2)
                    ),
                    indicators.chandelier && indicators.chandelier.long != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "Chandelier Long: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > indicators.chandelier.long ? "#16a34a" : "#ef4444" } }, fmt(indicators.chandelier.long)),
                      " \u2014 ", indicators.lastClose > indicators.chandelier.long ? "price above (safe)" : "price below (exit)",
                      _sc("chandelier", indicators.lastClose > indicators.chandelier.long)
                    ),
                    indicators.darvasBox && indicators.darvasBox.boxTop != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "Darvas Box: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose >= indicators.darvasBox.boxTop ? "#16a34a" : indicators.lastClose <= indicators.darvasBox.boxBottom ? "#ef4444" : "#eab308" } }, fmt(indicators.darvasBox.boxTop)), " / ", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose >= indicators.darvasBox.boxTop ? "#16a34a" : indicators.lastClose <= indicators.darvasBox.boxBottom ? "#ef4444" : "#eab308" } }, fmt(indicators.darvasBox.boxBottom)),
                      " \u2014 ", indicators.lastClose >= indicators.darvasBox.boxTop ? "breakout above (bullish)" : indicators.lastClose <= indicators.darvasBox.boxBottom ? "breakdown below (bearish)" : "inside box",
                      _sc("darvasBox", indicators.lastClose >= indicators.darvasBox.boxTop)
                    )
                  )
                ),

                /* Structure */
                React.createElement("div", null,
                  React.createElement("div", { style: { fontWeight: 600, color: "var(--text)", marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 } }, "Structure"),
                  React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 } },
                    indicators.ichimoku && indicators.ichimoku.senkouA != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "Ichimoku: T:", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > Math.max(indicators.ichimoku.senkouA, indicators.ichimoku.senkouB) ? "#16a34a" : "#ef4444" } }, fmt(indicators.ichimoku.tenkan)), " K:", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > Math.max(indicators.ichimoku.senkouA, indicators.ichimoku.senkouB) ? "#16a34a" : "#ef4444" } }, fmt(indicators.ichimoku.kijun)),
                      " SA:", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > Math.max(indicators.ichimoku.senkouA, indicators.ichimoku.senkouB) ? "#16a34a" : "#ef4444" } }, fmt(indicators.ichimoku.senkouA)), " SB:", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose > Math.max(indicators.ichimoku.senkouA, indicators.ichimoku.senkouB) ? "#16a34a" : "#ef4444" } }, fmt(indicators.ichimoku.senkouB)),
                      " \u2014 price ", indicators.lastClose > Math.max(indicators.ichimoku.senkouA, indicators.ichimoku.senkouB) ? "above cloud (bullish)" : "below cloud (bearish)",
                      _sc("ichimoku", indicators.lastClose > Math.max(indicators.ichimoku.senkouA, indicators.ichimoku.senkouB))
                    ),
                    indicators.pivotPoints && indicators.pivotPoints.classic && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "Pivots: P:", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose >= indicators.pivotPoints.classic.P ? "#16a34a" : "#ef4444" } }, fmt(indicators.pivotPoints.classic.P)),
                      " R1:", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose >= indicators.pivotPoints.classic.P ? "#16a34a" : "#ef4444" } }, fmt(indicators.pivotPoints.classic.R1)),
                      " S1:", React.createElement("span", { style: { fontWeight: 600, color: indicators.lastClose >= indicators.pivotPoints.classic.P ? "#16a34a" : "#ef4444" } }, fmt(indicators.pivotPoints.classic.S1)),
                      indicators.lastClose >= indicators.pivotPoints.classic.R1 ? " \u2014 above R1 (resistance)" : indicators.lastClose <= indicators.pivotPoints.classic.S1 ? " \u2014 below S1 (support)" : " \u2014 between S1-R1",
                      _sc("pivotPoints", indicators.lastClose >= indicators.pivotPoints.classic.P)
                    ),
                    indicators.choppiness != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "Choppiness: ", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, fmt(indicators.choppiness)),
                      " \u2014 ", indicators.choppiness < 38.2 ? "trending" : indicators.choppiness > 61.8 ? "ranging/choppy" : "neutral",
                      _sc("choppiness", indicators.choppiness < 38.2)
                    ),
                    indicators.mtfAlignment != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                      "MTF Alignment: ", React.createElement("span", { style: { fontWeight: 600, color: indicators.mtfAlignment >= 70 ? "#16a34a" : indicators.mtfAlignment <= 30 ? "#ef4444" : "#2563eb" } }, fmt(indicators.mtfAlignment)),
                      indicators.mtfAlignment >= 70 ? " \u2014 bullish across TFs" : indicators.mtfAlignment <= 30 ? " \u2014 bearish across TFs" : " \u2014 mixed",
                    )
                  )
                ),

                /* Summary */
                React.createElement("div", {
                  style: { marginTop: 4, padding: "6px 8px", borderRadius: 6, background: "var(--bg4)", fontSize: 10, color: "var(--text5)", lineHeight: 1.5 }
                },
                  "Signals are rule-based (price vs indicator). ",
                  "The blue ", React.createElement("span", { style: { fontWeight: 600, color: "var(--accent)" } }, "ScoreGauge"),
                  " above aggregates all signals into a Bull/Neutral/Bear count. ",
                  "Use the timeframe buttons to switch between Daily/Weekly/Hourly views for multi-TF context."
                )
              )
        )
      ),

      /* Last updated */
      lastUpdated && React.createElement("div", {
        style: { fontSize: 10, color: "var(--text6)", marginBottom: 12 }
      }, "Last updated: " + lastUpdated.toLocaleTimeString() + " · " + candles.length + " candles · " + timeframe + (dataSource ? " · " + dataSource : "")),

      /* Error message */
      error && React.createElement("div", {
        style: {
          padding: "12px 16px", borderRadius: 10, marginBottom: 14,
          background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)",
          fontSize: 12, color: "#ef4444", lineHeight: 1.5,
        }
      }, error),

      /* Loading skeleton */
      loading && !indicators && React.createElement("div", {
        style: {
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10,
        }
      },
        Array.from({ length: 12 }).map(function (_, i) {
          return React.createElement("div", {
            key: i, style: {
              height: 80, borderRadius: 10,
              background: "linear-gradient(135deg, var(--bg3), var(--bg4))",
              animation: "pulse 1.5s ease-in-out infinite alternate",
            }
          });
        })
      ),

      /* Score gauge */
      indicators && signals && signals._score && ScoreGauge(signals._score),

      /* Exit Score */
      indicators && candles && ExitScoreCard(candles, indicators, null, null, null, null, indexCandles, weeklyCandlesMTF, dailyCandlesMTF, hourlyCandlesMTF),

      /* Category tabs */
      React.createElement("div", {
        style: { display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }
      },
        React.createElement("button", {
          onClick: function () { setCategory("all"); },
          style: catBtnStyle(category === "all")
        }, "All (" + INDICATORS.length + ")"),
        CATEGORIES.map(function (cat) {
          var count = INDICATORS.filter(function (i) { return i.cat === cat; }).length;
          return React.createElement("button", {
            key: cat,
            onClick: function () { setCategory(cat); },
            style: catBtnStyle(category === cat)
          }, cat + " (" + count + ")");
        })
      ),

      /* Indicator grid */
      indicators && React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(" + (isMobile ? "160px" : "220px") + ", 1fr))",
          gap: 10,
        }
      },
        filteredIndicators.map(function (ind) {
          var val = indicators[ind.key];
          var sig = signals ? signals[ind.key] : null;
          return React.createElement(IndicatorCard, {
            key: ind.key, ind: ind, val: val, signal: sig, lastClose: indicators.lastClose,
          });
        })
      ),

      /* Data source info */
      React.createElement("div", {
        style: {
          marginTop: 20, padding: "10px 14px", borderRadius: 10,
          background: "var(--bg5)", border: "1px solid var(--border)",
          fontSize: 11, color: "var(--text6)", lineHeight: 1.6,
        }
      },
        React.createElement("strong", { style: { color: "var(--text4)" } }, "Data Sources:"),
        " Daily OHLCV from Yahoo Finance.",
        " Intraday OHLCV from Yahoo Finance.",
        " Technical indicators calculated locally in-browser.",
        " Data may be delayed 15+ minutes — not suitable for live trading."
      )
    );
  }

  function catBtnStyle(active) {
    return {
      padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: active ? 700 : 500,
      border: "none", cursor: "pointer",
      background: active ? "var(--accentbg)" : "transparent",
      color: active ? "var(--accent)" : "var(--text5)",
      borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
      transition: "all .15s", whiteSpace: "nowrap",
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Inline Technical Indicators — compact version shown below each share card
     ═══════════════════════════════════════════════════════════════════════ */
  function TechnicalIndicatorsInline(props) {
    var ticker = (props.ticker || "").toUpperCase();
    var company = props.company || ticker;
    var buyPrice = props.buyPrice || null;
    var buyDate = props.buyDate || null;
    var currentPrice = props.currentPrice || null;
    var entryScore = props.entryScore != null ? props.entryScore : null;
    var showExitScore = props.showExitScore !== false;

    var _a = useState("daily"), timeframe = _a[0], setTimeframe = _a[1];
    var _b = useState(null), indicators = _b[0], setIndicators = _b[1];
    var _c = useState(false), loading = _c[0], setLoading = _c[1];
    var _d = useState(null), error = _d[0], setError = _d[1];
    var _e = useState(null), signals = _e[0], setSignals = _e[1];
    var _f = useState(null), lastUpdated = _f[0], setLastUpdated = _f[1];
    var _g = useState("all"), category = _g[0], setCategory = _g[1];
    var _h = useState(0), refreshTick = _h[0], setRefreshTick = _h[1];
    var _i = useState(false), autoRefresh = _i[0], setAutoRefresh = _i[1];
    var _j = useState(null), dataSource = _j[0], setDataSource = _j[1];
    var _k = useState(null), candles = _k[0], setCandles = _k[1];
    var _l = useState(null), indexCandles = _l[0], setIndexCandles = _l[1];
    var _m = useState(null), hourlyCandlesMTF = _m[0], setHourlyCandlesMTF = _m[1];
    var _n = useState(null), dailyCandlesMTF = _n[0], setDailyCandlesMTF = _n[1];
    var _o = useState(null), weeklyCandlesMTF = _o[0], setWeeklyCandlesMTF = _o[1];
    var timerRef = useRef(null);

    var fetchData = useCallback(async function () {
      if (!ticker) return;
      setLoading(true);
      setError(null);
      try {
        var result = await DF.fetchOHLCVCached(ticker, timeframe);
        var data = result.data;
        var source = result.source;
        if (!data || data.length < 10) {
          setError("Insufficient data for " + ticker);
          setLoading(false);
          return;
        }
        setDataSource(source);
        setCandles(data);
        var indexResult = await DF.fetchOHLCVCached("^NSEI", timeframe);
        var indexData = indexResult ? indexResult.data : null;
        setIndexCandles(indexData);
        var mtfResults = await Promise.all([
          DF.fetchOHLCVCached(ticker, "1h"),
          DF.fetchOHLCVCached(ticker, "daily"),
          DF.fetchOHLCVCached(ticker, "weekly")
        ]);
        setHourlyCandlesMTF(mtfResults[0] ? mtfResults[0].data : null);
        setDailyCandlesMTF(mtfResults[1] ? mtfResults[1].data : null);
        setWeeklyCandlesMTF(mtfResults[2] ? mtfResults[2].data : null);
        var ind = TI.computeAllWithIndex(data, indexData);
        setIndicators(ind);
        var sig = TI.interpret(ind);
        setSignals(sig);
        setLastUpdated(new Date());
      } catch (e) {
        setError("Failed: " + (e.message || "error"));
      }
      setLoading(false);
    }, [ticker, timeframe]);

    useEffect(function () { fetchData(); }, [fetchData]);

    useEffect(function () {
      if (!autoRefresh) { clearInterval(timerRef.current); return; }
      timerRef.current = setInterval(function () {
        DF.clearCache();
        setRefreshTick(function (t) { return t + 1; });
      }, 60000);
      return function () { clearInterval(timerRef.current); };
    }, [autoRefresh]);

    useEffect(function () { fetchData(); }, [refreshTick, fetchData]);

    var filteredIndicators = useMemo(function () {
      if (category === "all") return INDICATORS;
      return INDICATORS.filter(function (ind) { return ind.cat === category; });
    }, [category]);

    var catKeys = ["all"].concat(CATEGORIES);

    return React.createElement("div", null,
      /* ── Header row: title + timeframe + refresh ── */
      React.createElement("div", {
        style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }
      },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "'Sora',sans-serif" } },
            "Technical Indicators"
          ),
          lastUpdated && React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } },
            company + " · " + timeframe + " · " + lastUpdated.toLocaleTimeString() + (dataSource ? " · " + dataSource : "")
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
          React.createElement("div", {
            style: { display: "flex", gap: 2, background: "var(--bg4)", borderRadius: 6, padding: 2 }
          },
            TIMEFRAMES.map(function (tf) {
              return React.createElement("button", {
                key: tf.key,
                onClick: function () { setTimeframe(tf.key); DF.clearCache(); },
                style: {
                  padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: timeframe === tf.key ? 700 : 500,
                  border: "none", cursor: "pointer",
                  background: timeframe === tf.key ? "var(--accent)" : "transparent",
                  color: timeframe === tf.key ? "#fff" : "var(--text5)",
                  transition: "all .15s",
                }
              }, tf.label);
            })
          ),
          React.createElement("button", {
            onClick: function () { setAutoRefresh(!autoRefresh); },
            style: {
              padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              border: "1px solid " + (autoRefresh ? "rgba(22,163,74,.4)" : "var(--border)"),
              background: autoRefresh ? "rgba(22,163,74,.1)" : "var(--bg4)",
              color: autoRefresh ? "#16a34a" : "var(--text5)", cursor: "pointer",
            }
        }, autoRefresh ? React.createElement(React.Fragment, null, Ico.dot(8, "#22c55e"), " Live") : React.createElement(React.Fragment, null, Ico.dotOutline(8, "var(--text5)"), " Auto")),
          React.createElement("button", {
            onClick: function () { DF.clearCache(); setRefreshTick(function (t) { return t + 1; }); },
            disabled: loading,
            style: {
              padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              border: "1px solid var(--border)", background: "var(--bg4)",
              color: "var(--text5)", cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.6 : 1,
            }
          }, loading ? "..." : "↻")
        )
      ),

      /* Error */
      error && React.createElement("div", {
        style: {
          padding: "8px 12px", borderRadius: 8, marginBottom: 10,
          background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)",
          fontSize: 11, color: "#ef4444",
        }
      }, error),

      /* Loading */
      loading && !indicators && React.createElement("div", {
        style: { textAlign: "center", padding: 20, color: "var(--text6)", fontSize: 12 }
      }, "Fetching OHLCV data..."),

      /* Score gauge */
      indicators && signals && signals._score && (function () {
        var sc = signals._score;
        if (!sc || sc.total === 0) return null;
        var bullPct = sc.bull / sc.total * 100;
        var neutralPct = sc.neutral / sc.total * 100;
        var bearPct = sc.bear / sc.total * 100;
        var col = sc.bull > sc.bear ? "#16a34a" : sc.bear > sc.bull ? "#ef4444" : "#6b7280";
        return React.createElement("div", {
          style: {
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 14px", borderRadius: 8, marginBottom: 12,
            background: "var(--bg4)", border: "1px solid var(--border)",
          }
        },
          React.createElement("div", { style: { flex: 1 } },
            React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text4)", marginBottom: 4 } }, "Overall Signal"),
            React.createElement("div", {
              style: { height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden", display: "flex" }
            },
              bullPct > 0 && React.createElement("div", {
                style: { width: bullPct + "%", height: "100%", background: "linear-gradient(90deg, #16a34a, #22c55e)" }
              }),
              neutralPct > 0 && React.createElement("div", {
                style: { width: neutralPct + "%", height: "100%", background: "linear-gradient(90deg, #6b7280, #9ca3af)" }
              }),
              bearPct > 0 && React.createElement("div", {
                style: { width: bearPct + "%", height: "100%", background: "linear-gradient(90deg, #ef4444, #dc2626)" }
              })
            ),
            React.createElement("div", {
              style: { display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: "var(--text5)" }
            },
              React.createElement("span", null, sc.bull + " Bull"),
              React.createElement("span", null, sc.neutral + " Neutral"),
              React.createElement("span", null, sc.bear + " Bear")
            )
          ),
          React.createElement("div", {
            style: {
              width: 48, height: 48, borderRadius: "50%",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: col + "15", border: "2px solid " + col,
              flexShrink: 0,
            }
          },
            React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "#16a34a", lineHeight: 1.2, fontFamily: "'Sora',sans-serif" } }, sc.bull),
            React.createElement("span", { style: { fontSize: 8, fontWeight: 600, color: "#6b7280", lineHeight: 1.2 } }, sc.neutral),
            React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "#ef4444", lineHeight: 1.2, fontFamily: "'Sora',sans-serif" } }, sc.bear)
          )
        );
      })(),

      /* Exit Score */
      showExitScore && indicators && candles && ExitScoreCard(candles, indicators, buyPrice, buyDate, currentPrice, entryScore, indexCandles, weeklyCandlesMTF, dailyCandlesMTF, hourlyCandlesMTF),

      /* Category filter pills */
      React.createElement("div", {
        style: { display: "flex", gap: 3, marginBottom: 10, flexWrap: "wrap" }
      },
        catKeys.map(function (cat) {
          var label = cat === "all" ? "All" : cat;
          var count = cat === "all" ? INDICATORS.length : INDICATORS.filter(function (i) { return i.cat === cat; }).length;
          var active = category === cat;
          return React.createElement("button", {
            key: cat,
            onClick: function () { setCategory(cat); },
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

      /* Indicator grid — compact 3-column on desktop, 2 on mobile */
      indicators && React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 8,
        }
      },
        filteredIndicators.map(function (ind) {
          var val = indicators[ind.key];
          var sig = signals ? signals[ind.key] : null;
          var sigStyle = sig ? SIGNAL_COLORS[sig] || SIGNAL_COLORS.neutral : null;

          var cardBg = "var(--bg4)";
          var cardBorder = "1px solid var(--border)";
          var cardBorderLeft = "none";
          if (sig === "bullish") { cardBg = "rgba(22,163,74,.06)"; cardBorderLeft = "3px solid #16a34a"; }
          else if (sig === "bearish") { cardBg = "rgba(239,68,68,.06)"; cardBorderLeft = "3px solid #ef4444"; }
          else if (sig === "overbought") { cardBg = "rgba(234,88,12,.05)"; cardBorderLeft = "3px solid #ea580c"; }
          else if (sig === "oversold") { cardBg = "rgba(37,99,235,.05)"; cardBorderLeft = "3px solid #2563eb"; }
          else if (sig === "trending") { cardBg = "rgba(168,85,247,.05)"; cardBorderLeft = "3px solid #a855f7"; }
          else if (sig === "ranging") { cardBg = "rgba(107,114,128,.04)"; cardBorderLeft = "3px solid #6b7280"; }
          else if (sig === "neutral") { cardBg = "rgba(107,114,128,.03)"; }

          return React.createElement("div", {
            key: ind.key,
            style: {
              padding: "8px 10px", borderRadius: 8,
              background: cardBg, border: "1px solid var(--border)", borderLeft: cardBorderLeft,
              display: "flex", flexDirection: "column", gap: 2,
              transition: "background .3s, border-color .3s",
            }
          },
            React.createElement("div", {
              style: { display: "flex", justifyContent: "space-between", alignItems: "center" }
            },
              React.createElement("span", {
                style: { fontSize: 9, fontWeight: 600, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.3 }
              }, ind.name),
              sigStyle && sig !== "neutral" && React.createElement("span", {
                style: {
                  fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 6,
                  background: sigStyle.bg, border: "1px solid " + sigStyle.border, color: sigStyle.text,
                  textTransform: "uppercase",
                }
              }, sigStyle.label)
            ),
            React.createElement("div", {
              style: { fontSize: 14, fontWeight: 700, fontFamily: "'Sora',sans-serif", color: "var(--text)" }
            }, formatValue(ind, val)),
            ind.type === "macd" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "MACD: " + fmt(val.macd, 4)),
              React.createElement("span", null, "Sig: " + fmt(val.signal, 4)),
              React.createElement("span", { style: { color: val.histogram >= 0 ? "#16a34a" : "#ef4444" } },
                "Hist: " + fmt(val.histogram, 4))
            ),
            ind.type === "bands" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "U: " + fmt(val.upper)),
              React.createElement("span", null, "M: " + fmt(val.middle)),
              React.createElement("span", null, "L: " + fmt(val.lower))
            ),
            ind.type === "stoch" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "%K: " + fmt(val.k)),
              React.createElement("span", null, "%D: " + fmt(val.d))
            ),
            ind.type === "ichimoku" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 6, flexWrap: "wrap" }
            },
              React.createElement("span", null, "T: " + fmt(val.tenkan)),
              React.createElement("span", null, "K: " + fmt(val.kijun)),
              React.createElement("span", null, "SA: " + fmt(val.senkouA)),
              React.createElement("span", null, "SB: " + fmt(val.senkouB))
            )
          );
        })
      )
    );
  }

  window.TechnicalIndicatorsInline = React.memo(TechnicalIndicatorsInline);

  return React.memo(TechnicalIndicatorsPanelInner);
})();
