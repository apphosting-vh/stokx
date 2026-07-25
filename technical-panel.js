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
    bullish: { bg: "rgba(22,163,74,.12)", border: "rgba(22,163,74,.3)", text: "#20c46a", label: "Bullish" },
    bearish: { bg: "rgba(239,68,68,.12)", border: "rgba(239,68,68,.3)", text: "#f0473f", label: "Bearish" },
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
    { key: "2h", label: "2H" },
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
    if (signal === "bullish") { cardBg = "rgba(22,163,74,.06)"; cardBorderLeft = "3px solid #20c46a"; }
    else if (signal === "bearish") { cardBg = "rgba(239,68,68,.06)"; cardBorderLeft = "3px solid #f0473f"; }
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
          fontSize: 18, fontWeight: 800, fontFamily: "'Manrope',sans-serif",
          color: "var(--text)", lineHeight: 1.2,
        }
      }, formatValue(ind, val)),
      // Sub-values for complex indicators
      ind.type === "macd" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 12, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "MACD: ", fmt(val.macd, 4)),
        React.createElement("span", null, "Signal: ", fmt(val.signal, 4)),
        React.createElement("span", { style: { color: val.histogram >= 0 ? "#20c46a" : "#f0473f" } },
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
          style: { color: val.breakout === "up" ? "#20c46a" : val.breakout === "down" ? "#f0473f" : "var(--text5)" }
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
        lastClose && val.long && React.createElement("span", { style: { color: lastClose > val.long ? "#20c46a" : "#f0473f" } }, lastClose > val.long ? "Above Long" : "Below Long")
      ),
      ind.type === "heikinAshi" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 10, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "O: ", fmt(val.open)),
        React.createElement("span", null, "H: ", fmt(val.high)),
        React.createElement("span", null, "L: ", fmt(val.low)),
        React.createElement("span", null, "C: ", fmt(val.close)),
        React.createElement("span", { style: { color: val.trend === "bullish" ? "#20c46a" : val.trend === "bearish" ? "#f0473f" : "var(--text5)" } }, val.trend ? val.trend.toUpperCase() : "—")
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
        React.createElement("span", { style: { color: "#20c46a" } }, "R1: ", fmt(val.classic.R1)),
        React.createElement("span", { style: { color: "#20c46a" } }, "R2: ", fmt(val.classic.R2)),
        React.createElement("span", { style: { color: "#f0473f" } }, "S1: ", fmt(val.classic.S1)),
        React.createElement("span", { style: { color: "#f0473f" } }, "S2: ", fmt(val.classic.S2))
      ),
      ind.type === "aroon" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 12, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "Up: ", fmt(val.up)),
        React.createElement("span", null, "Down: ", fmt(val.down)),
        React.createElement("span", { style: { color: val.osc > 0 ? "#20c46a" : "#f0473f" } }, "Osc: ", fmt(val.osc))
      ),
      ind.type === "vortex" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 12, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", { style: { color: "#20c46a" } }, "VI+: ", fmt(val.plus)),
        React.createElement("span", { style: { color: "#f0473f" } }, "VI-: ", fmt(val.minus))
      ),
      ind.type === "rs" && val && typeof val === "object" && React.createElement("div", {
        style: { display: "flex", gap: 10, fontSize: 10, color: "var(--text5)", marginTop: 2 }
      },
        React.createElement("span", null, "RS: ", fmt(val.rs, 4)),
        val.mansfield != null && React.createElement("span", { style: { color: val.mansfield > 0 ? "#20c46a" : "#f0473f" } }, "Mansfield: ", fmt(val.mansfield, 2) + "%")
      ),
      deviation !== null && React.createElement("div", {
        style: {
          fontSize: 10, marginTop: 2,
          color: deviation >= 0 ? "#20c46a" : "#f0473f",
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
    var color = score.bull > score.bear ? "#20c46a" : score.bear > score.bull ? "#f0473f" : "#6b7280";

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
              background: "linear-gradient(90deg, #20c46a, #20c46a)",
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
              background: "linear-gradient(90deg, #f0473f, #dc2626)",
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
          style: { fontSize: 11, fontWeight: 800, color: "#20c46a", lineHeight: 1.2, fontFamily: "'Manrope',sans-serif" }
        }, score.bull),
        React.createElement("span", {
          style: { fontSize: 9, fontWeight: 600, color: "#6b7280", lineHeight: 1.2 }
        }, score.neutral),
        React.createElement("span", {
          style: { fontSize: 11, fontWeight: 800, color: "#f0473f", lineHeight: 1.2, fontFamily: "'Manrope',sans-serif" }
        }, score.bear)
      )
    );
  }

  /* ── Exit Score Card ────────────────────────────────────────────────── */
  function ExitScoreCard(candles, ind, buyPrice, buyDate, currentPrice, entryScore) {
    var es = TI.computeExitScore(candles, ind, {entryPrice: buyPrice, buyDate: buyDate, currentPrice: currentPrice, entryScore: entryScore});
    if (!es) return null;

    var factors = [
      { label: "Trend Breakdown", val: es.trend, max: es.trendMax, color: "#4a8fe0" },
      { label: "Momentum Exhaustion", val: es.momentum, max: es.momentumMax, color: "#a855f7" },
      { label: "Volume Distribution", val: es.volume, max: es.volumeMax, color: "#e0a527" },
      { label: "Structure Breakdown", val: es.structure, max: es.structureMax, color: "#ec4899" },
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
      rules.push({ label: "Take Profit (+4%)", price: target, trigger: cp >= target, active: cp >= target, type: "exit", color: "#20c46a" });
      rules.push({ label: "Stop Loss (1.5\u00d7ATR)", price: stopLoss, trigger: cp <= stopLoss, active: cp <= stopLoss, type: "exit", color: "#f0473f" });
      if (aboveEntry2Pct) {
        rules.push({ label: "Trailing Stop (2\u00d7ATR from high)", price: trailingStop, trigger: cp <= trailingStop, active: cp <= trailingStop, type: "exit", color: "#f0473f" });
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
        background: "var(--bg3)", border: "2px solid " + es.decision.color + "33",
      }
    },
      /* Header row */
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }
      },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "'Manrope',sans-serif" } }, "Exit Score"),
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
            React.createElement("div", { style: { fontSize: 12, fontWeight: 800, color: es.decision.color, fontFamily: "'Manrope',sans-serif" } }, es.decision.label)
          ),
          React.createElement("div", {
            style: {
              width: 56, height: 56, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: es.decision.color + "18", border: "2.5px solid " + es.decision.color,
              flexShrink: 0,
            }
          },
            React.createElement("span", {
              style: { fontSize: 20, fontWeight: 900, color: es.decision.color, fontFamily: "'Manrope',sans-serif", lineHeight: 1 }
            }, es.total)
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
            React.createElement("span", { style: { width: 40, fontSize: 10, fontWeight: 700, color: "var(--text4)", fontFamily: "'Manrope',sans-serif", textAlign: "right" } },
              f.val + "/" + f.max
            )
          );
        })
      ),

      /* Modifier summary (penalties/bonuses) */
      es.modifiers && (es.modifiers.penalties !== 0 || es.modifiers.bonuses !== 0) && React.createElement("div", {
        style: {
          marginTop: 6, padding: "8px 10px", borderRadius: 6,
          background: "var(--bg4)", border: "1px solid var(--border)",
        }
      },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: (es.modifiers.hardFilters && es.modifiers.hardFilters.length > 0) ? 4 : 0, fontSize: 10, color: "var(--text5)" } },
          React.createElement("span", { style: { fontWeight: 600 } }, "Base: " + es.modifiers.raw),
          es.modifiers.penalties !== 0 && React.createElement("span", { style: { color: "var(--text3)", fontWeight: 700 } }, "Penalties: " + es.modifiers.penalties),
          es.modifiers.bonuses !== 0 && React.createElement("span", { style: { color: "var(--text3)", fontWeight: 700 } }, "Bonuses: +" + es.modifiers.bonuses),
          React.createElement("span", { style: { fontWeight: 700, color: "var(--text3)", marginLeft: "auto" } }, "\u2192 " + es.total)
        ),
        es.modifiers.hardFilters && es.modifiers.hardFilters.length > 0 && React.createElement("div", { style: { marginTop: 2 } },
          es.modifiers.hardFilters.map(function (f, i) {
            var isBonus = f.indexOf("(+") >= 0;
            var valMatch = f.match(/\([+\-\u2212]?\d+\)$/);
            var valStr = valMatch ? valMatch[0] : "";
            var label = valStr ? f.replace(valStr, "").replace(/\s*—\s*/, " — ").trim() : f;
            return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, lineHeight: 1.6, fontSize: 10 } },
              React.createElement("span", { style: { color: "var(--text3)", flex: 1, minWidth: 0, overflow: "hidden", wordBreak: "break-word" } }, isBonus ? "\u2713 " + label : "\u26a0 " + label),
              valStr && React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "var(--text3)", background: "var(--bg4)", padding: "1px 6px", borderRadius: 4, fontFamily: "'Manrope',sans-serif", flexShrink: 0 } }, valStr)
            );
          })
        )
      ),

      /* Overrides */
      es.overrides.length > 0 && React.createElement("div", {
        style: {
          marginTop: 10, padding: "8px 12px", borderRadius: 8,
          background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)",
        }
      },
        React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#f0473f", marginBottom: 4 } }, "\u26a0 Critical Overrides"),
        es.overrides.map(function (o, i) {
          return React.createElement("div", { key: i, style: { fontSize: 10, color: "#f0473f", lineHeight: 1.5 } }, "\u2022 " + o);
        })
      ),

      /* ── Exit Price Recommendations ── */
      exitRecs && React.createElement("div", {
        style: {
          marginTop: 12, padding: "12px 14px", borderRadius: 10,
          background: "var(--bg4)", border: "1px solid var(--border)",
        }
      },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)", fontFamily: "'Manrope',sans-serif" } }, "Exit Price Recommendations"),
          React.createElement("div", { style: { display: "flex", gap: 12, fontSize: 10 } },
            React.createElement("span", { style: { color: "var(--text5)" } }, "Entry: \u20b9" + INR(ep)),
            React.createElement("span", { style: { color: "var(--text5)" } }, "Current: \u20b9" + INR(cp)),
            React.createElement("span", { style: { color: exitRecs.pnlPct >= 0 ? "#20c46a" : "#f0473f", fontWeight: 700 } }, (exitRecs.pnlPct >= 0 ? "+" : "") + exitRecs.pnlPct.toFixed(1) + "%"),
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
            "\u26a0 " + exitRecs.activeRule.type.toUpperCase() + " SIGNAL"
          ),
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text)" } }, exitRecs.activeRule.label),
          exitRecs.activeRule.price !== null && React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } },
            "At \u20b9" + INR(exitRecs.activeRule.price)
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
              React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: r.active ? "var(--text)" : "var(--text5)", fontFamily: "'Manrope',sans-serif" } },
                r.price !== null ? "\u20b9" + INR(r.price) : "\u2014"
              ),
              React.createElement("div", { style: { fontSize: 9, color: r.active ? r.color : "var(--text6)", marginTop: 2 } },
                r.active ? "\u25cf ACTIVE" : "Pending"
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
    var timerRef = useRef(null);

    var avKey = DF.getAVKey();

    var fetchData = useCallback(async function () {
      if (!ticker) return;
      setLoading(true);
      setError(null);
      try {
        var result = await DF.fetchOHLCVCached(ticker, timeframe);
        var data = result.data;
        var source = result.source;
        if (!data || data.length < 10) {
          setError("Insufficient data for " + ticker + ". Try a different timeframe or add an Alpha Vantage API key in settings for daily data.");
          setLoading(false);
          return;
        }
        setCandles(data);
        setDataSource(source);
        var ind = TI.computeAll(data);
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

    return React.createElement("div", null,
      /* ── Data source status ── */
      React.createElement("div", {
        style: {
          marginBottom: 14, padding: "8px 14px", borderRadius: 10,
          background: "var(--bg3)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text4)",
        }
      },
        React.createElement("span", {
          style: {
            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: avKey ? "#20c46a" : "var(--text6)",
          }
        }),
        avKey
          ? React.createElement("span", null, "Alpha Vantage: ", React.createElement("span", { style: { color: "#20c46a", fontWeight: 600 } }, "Connected"))
          : React.createElement("span", null, "Using Yahoo Finance fallback — set API key in ", React.createElement("span", { style: { fontWeight: 600 } }, "Settings → API Keys"))
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
            color: autoRefresh ? "#20c46a" : "var(--text5)",
            cursor: "pointer",
          }
        }, autoRefresh ? "● Live" : "○ Auto"),
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
        }, loading ? "Loading..." : "↻ Refresh")
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
          fontSize: 12, color: "#f0473f", lineHeight: 1.5,
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
      indicators && candles && ExitScoreCard(candles, indicators),

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
        " Daily OHLCV from Alpha Vantage (requires free API key) or Yahoo Finance (fallback).",
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
      background: active ? "linear-gradient(180deg, var(--accentbg), var(--accentbg2))" : "transparent",
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
        var ind = TI.computeAll(data);
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
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "'Manrope',sans-serif" } },
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
              color: autoRefresh ? "#20c46a" : "var(--text5)", cursor: "pointer",
            }
          }, autoRefresh ? "● Live" : "○ Auto"),
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
          fontSize: 11, color: "#f0473f",
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
        var col = sc.bull > sc.bear ? "#20c46a" : sc.bear > sc.bull ? "#f0473f" : "#6b7280";
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
                style: { width: bullPct + "%", height: "100%", background: "linear-gradient(90deg, #20c46a, #20c46a)" }
              }),
              neutralPct > 0 && React.createElement("div", {
                style: { width: neutralPct + "%", height: "100%", background: "linear-gradient(90deg, #6b7280, #9ca3af)" }
              }),
              bearPct > 0 && React.createElement("div", {
                style: { width: bearPct + "%", height: "100%", background: "linear-gradient(90deg, #f0473f, #dc2626)" }
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
            React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "#20c46a", lineHeight: 1.2, fontFamily: "'Manrope',sans-serif" } }, sc.bull),
            React.createElement("span", { style: { fontSize: 8, fontWeight: 600, color: "#6b7280", lineHeight: 1.2 } }, sc.neutral),
            React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "#f0473f", lineHeight: 1.2, fontFamily: "'Manrope',sans-serif" } }, sc.bear)
          )
        );
      })(),

      /* Exit Score */
      showExitScore && indicators && candles && ExitScoreCard(candles, indicators, buyPrice, buyDate, currentPrice, entryScore),

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
          if (sig === "bullish") { cardBg = "rgba(22,163,74,.06)"; cardBorderLeft = "3px solid #20c46a"; }
          else if (sig === "bearish") { cardBg = "rgba(239,68,68,.06)"; cardBorderLeft = "3px solid #f0473f"; }
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
              style: { fontSize: 14, fontWeight: 700, fontFamily: "'Manrope',sans-serif", color: "var(--text)" }
            }, formatValue(ind, val)),
            ind.type === "macd" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "MACD: " + fmt(val.macd, 4)),
              React.createElement("span", null, "Sig: " + fmt(val.signal, 4)),
              React.createElement("span", { style: { color: val.histogram >= 0 ? "#20c46a" : "#f0473f" } },
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
