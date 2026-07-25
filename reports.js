/* ══════════════════════════════════════════════════════════════════════════
   STOX REPORTS — Part 1
   Icon adapter · Shared utils · ReportsPage wrapper
   ProfitabilityMetrics · TimeHoldingAnalysis · WinLossPatterns
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Icon adapter: bridges StoX Icons object → {n,size,color} component ── */
const Icon = ({ n, size = 16, color, style = {} }) => {
  if (Icons[n]) return React.createElement("span", { style: { display: "inline-flex", verticalAlign: "middle", color: color || undefined, ...style } }, Icons[n](size));
  const S = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color || "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", display: "inline-block", verticalAlign: "middle", ...style };
  const svg = (...ch) => React.createElement("svg", S, ...ch);
  const p = d => React.createElement("path", { d });
  const l = (x1,y1,x2,y2) => React.createElement("line", { x1,y1,x2,y2 });
  const c = (cx,cy,r) => React.createElement("circle", { cx,cy,r });
  const pl = pts => React.createElement("polyline", { points: pts });
  const rct = (x,y,w,h,rx) => React.createElement("rect", { x,y,width:w,height:h,rx:rx||0 });
  switch(n){
    case "invest": return svg(pl("2 18 9 11 13 15 22 6"),pl("17 6 22 6 22 11"));
    case "building": return svg(rct(4,2,16,20,2),l(9,22,9,18),l(15,22,15,18),l(9,6,15,6),l(9,10,15,10));
    case "calendar": return svg(rct(3,4,18,18,2),l(16,2,16,6),l(8,2,8,6),l(3,10,21,10));
    case "grid": return svg(rct(3,3,7,7,1),rct(14,3,7,7,1),rct(3,14,7,7,1),rct(14,14,7,7,1));
    case "fire": return svg(p("M12 23c-4.97 0-9-3.58-9-8 0-3.19 2.13-6.04 4-8 0 3 2 4 3 2-1 2-2 5 2 6 1-3 4-4 5-7 1 3 3 5 3 7 0 4.42-4.03 8-8 8z"));
    case "warning": return svg(l(12,2,12,25),c(12,16,10),l(12,9,12,13));
    case "checkcircle": return svg(c(12,12,10),pl("8 12 11 15 16 9"));
    case "delete": case "trash": return svg(pl("3 6 5 6 21 6"),p("M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"));
    case "target": return svg(c(12,12,10),c(12,12,6),c(12,12,2));
    case "money": return svg(l(12,1,12,23),p("M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"));
    case "lightbulb": return svg(p("M9 21h6"),p("M9 18h6"),p("M12 2a7 7 0 00-3 13.33V17h6v-1.67A7 7 0 0012 2z"));
    case "list": return svg(l(8,6,21,6),l(8,12,21,12),l(8,18,21,18),rct(3,5,1.5,1.5,0.5),rct(3,11,1.5,1.5,0.5),rct(3,17,1.5,1.5,0.5));
    case "expense": return svg(c(12,12,10),l(12,7,12,17),pl("8 13 12 17 16 13"));
    case "trenddown": return svg(pl("23 18 13.5 8.5 8.5 13.5 1 6"),pl("17 18 23 18 23 12"));
    case "check": return svg(pl("20 6 9 17 4 12"));
    default: return svg(c(12,12,4));
  }
};

/* ── Shared helpers ── */
const pnlColor = v => v >= 0 ? "#20c46a" : "#f0473f";

const fmtDays = d => {
  if (d < 7) return d + "d";
  if (d < 30) return Math.round(d / 7) + "w";
  if (d < 365) return Math.round(d / 30.4) + "mo";
  return (d / 365.25).toFixed(1) + "y";
};

const EmptyState = ({ icon, text, sub }) =>
  React.createElement("div", { style: { textAlign: "center", padding: "48px 20px" } },
    React.createElement("div", { style: { fontSize: 40, marginBottom: 12, color: "var(--text6)" } }, icon),
    React.createElement("div", { style: { fontSize: 15, fontWeight: 600, color: "var(--text3)", marginBottom: 4 } }, text),
    sub && React.createElement("div", { style: { fontSize: 13, color: "var(--text6)" } }, sub)
  );

const StatBox = ({ label, value, sub, color, bg, border }) =>
  React.createElement("div", { style: { background: bg || "var(--bg4)", border: border || "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" } },
    React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, label),
    React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: color || "var(--text)" } }, value),
    sub && React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, sub)
  );

/* ── Unified trade list builder ── */
const buildTradeList = (shares, soldShareSnapshots) => {
  const list = [];
  (shares || []).forEach(sh => {
    if (!sh.qty || !sh.buyPrice || !sh.currentPrice || !sh.buyDate) return;
    const buyDate = new Date(sh.buyDate + "T12:00:00");
    const sellDate = new Date(TODAY() + "T12:00:00");
    const holdDays = Math.max(1, Math.floor((sellDate - buyDate) / 864e5));
    const buyAmt = sh.qty * sh.buyPrice;
    const sellAmt = sh.qty * sh.currentPrice;
    const brokerage = +sh.brokerage || 0;
    const pnl = sellAmt - buyAmt;
    const returnPct = buyAmt > 0 ? (pnl / buyAmt * 100) : 0;
    const annReturn = holdDays > 0 ? (Math.pow(1 + returnPct / 100, 365 / holdDays) - 1) * 100 : returnPct;
    list.push({
      id: sh.id, type: "active", company: sh.company, ticker: sh.ticker,
      qty: sh.qty, buyPrice: sh.buyPrice, sellPrice: sh.currentPrice,
      buyDateStr: sh.buyDate, sellDateStr: TODAY(),
      buyDate, sellDate, holdDays,
      buyAmt, sellAmt, brokerage, pnl, returnPct, annReturn,
      pnlNet: pnl - brokerage, returnNetPct: buyAmt > 0 ? ((pnl - brokerage) / buyAmt * 100) : 0,
      buyMonth: buyDate.getMonth(), buyQuarter: Math.floor(buyDate.getMonth() / 3),
    });
  });
  Object.values(soldShareSnapshots || {}).forEach(fySnaps => {
    (fySnaps || []).forEach(sn => {
      if (!sn.qty || !sn.buyPrice || !sn.sellPrice || !sn.buyDate || !sn.savedAt) return;
      const buyDate = new Date(sn.buyDate + "T12:00:00");
      const sellDate = new Date(sn.savedAt + "T12:00:00");
      const holdDays = Math.max(1, Math.floor((sellDate - buyDate) / 864e5));
      const buyAmt = sn.qty * sn.buyPrice;
      const sellAmt = sn.qty * sn.sellPrice;
      const brokerage = +sn.brokerage || 0;
      const pnl = sellAmt - buyAmt;
      const returnPct = buyAmt > 0 ? (pnl / buyAmt * 100) : 0;
      const annReturn = holdDays > 0 ? (Math.pow(1 + returnPct / 100, 365 / holdDays) - 1) * 100 : returnPct;
      list.push({
        id: sn.id, type: "sold", company: sn.company, ticker: sn.ticker,
        qty: sn.qty, buyPrice: sn.buyPrice, sellPrice: sn.sellPrice,
        buyDateStr: sn.buyDate, sellDateStr: sn.savedAt,
        buyDate, sellDate, holdDays,
        buyAmt, sellAmt, brokerage, pnl, returnPct, annReturn,
        pnlNet: pnl - brokerage, returnNetPct: buyAmt > 0 ? ((pnl - brokerage) / buyAmt * 100) : 0,
        buyMonth: buyDate.getMonth(), buyQuarter: Math.floor(buyDate.getMonth() / 3),
      });
    });
  });
  return list;
};

/* ══════════════════════════════════════════════════════════════════════════
   REPORTS PAGE — 12-tab analytics wrapper
   ══════════════════════════════════════════════════════════════════════════ */
const ReportsPage = ({ shares, soldShareSnapshots }) => {
  const [activeTab, setActiveTab] = React.useState("profitability");
  const tabs = [
    { key: "profitability", label: "Profitability", icon: "money" },
    { key: "timeholding", label: "Time & Holding", icon: "clock" },
    { key: "winloss", label: "Win / Loss", icon: "target" },
    { key: "capitaleff", label: "Capital Efficiency", icon: "invest" },
    { key: "behavioural", label: "Behavioural", icon: "brain" },
    { key: "timing", label: "Trade Timing", icon: "calendar" },
    { key: "risk", label: "Risk Metrics", icon: "warning" },
    { key: "pattern", label: "Pattern Mining", icon: "grid" },
    { key: "drawdown", label: "Drawdown", icon: "trenddown" },
    { key: "multitime", label: "Multi-Timeframe", icon: "chart" },
    { key: "frequency", label: "Frequency", icon: "fire" },
    { key: "swing", label: "Swing / Hold", icon: "list" },
  ];
  const renderTab = () => {
    const props = { shares, soldShareSnapshots };
    switch (activeTab) {
      case "profitability": return React.createElement(ProfitabilityMetrics, props);
      case "timeholding": return React.createElement(TimeHoldingAnalysis, props);
      case "winloss": return React.createElement(WinLossPatterns, props);
      case "capitaleff": return React.createElement(CapitalEfficiency, props);
      case "behavioural": return React.createElement(BehaviouralPatterns, props);
      case "timing": return React.createElement(TradeTimingCorrelation, props);
      case "risk": return React.createElement(RiskMetrics, props);
      case "pattern": return React.createElement(PatternMining, props);
      case "drawdown": return React.createElement(DrawdownRecoveryTracker, props);
      case "multitime": return React.createElement(MultiTimeframePerformance, props);
      case "frequency": return React.createElement(TradeFrequencyAnalytics, props);
      case "swing": return React.createElement(SwingHoldOptimizer, props);
      default: return null;
    }
  };
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
    React.createElement("div", { style: { fontSize: 22, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "var(--text)" } }, "Reports & Analytics"),
    React.createElement("div", { className: "reports-tabs-scroll", style: { overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", paddingBottom: 2 } },
      React.createElement("div", { style: { display: "flex", gap: 6, minWidth: "max-content" } },
        tabs.map(t =>
          React.createElement("button", {
            key: t.key,
            onClick: () => setActiveTab(t.key),
            style: {
              display: "flex", alignItems: "center", gap: 5,
              padding: "8px 14px", borderRadius: 20, border: "none", cursor: "pointer", whiteSpace: "nowrap",
              fontSize: 12, fontWeight: activeTab === t.key ? 700 : 500,
              background: activeTab === t.key ? "var(--accentbg)" : "var(--bg4)",
              color: activeTab === t.key ? "var(--accent)" : "var(--text5)",
              boxShadow: activeTab === t.key ? "0 2px 10px var(--accentbg5)" : "none",
              transition: "all .15s ease",
            }
          },
            React.createElement(Icon, { n: t.icon, size: 14 }),
            t.label
          )
        )
      )
    ),
    renderTab()
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   1. ProfitabilityMetrics — Profitability & Return Metrics
   ══════════════════════════════════════════════════════════════════════════ */
const ProfitabilityMetrics = ({ shares, soldShareSnapshots = {} }) => {
  const [sortBy, setSortBy] = React.useState("pnl");
  const [sortDir, setSortDir] = React.useState("desc");
  const ret = v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

  const trades = React.useMemo(() => {
    const list = [];
    (shares || []).forEach(sh => {
      if (!sh.qty || !sh.buyPrice || !sh.currentPrice || !sh.buyDate) return;
      const buyAmt = sh.qty * sh.buyPrice;
      const sellAmt = sh.qty * sh.currentPrice;
      const brokerage = +sh.brokerage || 0;
      list.push({
        id: sh.id, type: "active", company: sh.company, ticker: sh.ticker,
        qty: sh.qty, buyPrice: sh.buyPrice, sellPrice: sh.currentPrice,
        buyDate: sh.buyDate, sellDate: TODAY(),
        buyAmt, sellAmt, brokerage,
        pnl: sellAmt - buyAmt,
        returnPct: buyAmt > 0 ? ((sellAmt - buyAmt) / buyAmt * 100) : 0,
        pnlNet: sellAmt - buyAmt - brokerage,
        returnNetPct: buyAmt > 0 ? (((sellAmt - buyAmt - brokerage) / buyAmt) * 100) : 0,
      });
    });
    Object.values(soldShareSnapshots || {}).forEach(fySnaps => {
      (fySnaps || []).forEach(sn => {
        if (!sn.qty || !sn.buyPrice || !sn.sellPrice || !sn.buyDate) return;
        const buyAmt = sn.qty * sn.buyPrice;
        const sellAmt = sn.qty * sn.sellPrice;
        const brokerage = +sn.brokerage || 0;
        list.push({
          id: sn.id, type: "sold", company: sn.company, ticker: sn.ticker,
          qty: sn.qty, buyPrice: sn.buyPrice, sellPrice: sn.sellPrice,
          buyDate: sn.buyDate, sellDate: sn.savedAt,
          buyAmt, sellAmt, brokerage,
          pnl: sellAmt - buyAmt,
          returnPct: buyAmt > 0 ? ((sellAmt - buyAmt) / buyAmt * 100) : 0,
          pnlNet: sellAmt - buyAmt - brokerage,
          returnNetPct: buyAmt > 0 ? (((sellAmt - buyAmt - brokerage) / buyAmt) * 100) : 0,
        });
      });
    });
    return list;
  }, [shares, soldShareSnapshots]);

  const tradesWithXirr = React.useMemo(() =>
    trades.map(t => {
      let xirr = null;
      if (t.buyDate && t.sellDate && t.buyDate < t.sellDate) {
        xirr = computeXIRR([-t.buyAmt, t.sellAmt], [t.buyDate, t.sellDate]);
      }
      return { ...t, xirr };
    })
  , [trades]);

  const overallXirr = React.useMemo(() => {
    if (!trades.length) return null;
    const cfs = [], dts = [];
    trades.forEach(t => { cfs.push(-t.buyAmt); dts.push(t.buyDate); cfs.push(t.sellAmt); dts.push(t.sellDate); });
    return computeXIRR(cfs, dts);
  }, [trades]);

  const overallXirrNet = React.useMemo(() => {
    if (!trades.length) return null;
    if (!trades.some(t => t.brokerage > 0)) return null;
    const cfs = [], dts = [];
    trades.forEach(t => { cfs.push(-(t.buyAmt + t.brokerage)); dts.push(t.buyDate); cfs.push(t.sellAmt); dts.push(t.sellDate); });
    return computeXIRR(cfs, dts);
  }, [trades]);

  const twrData = React.useMemo(() => {
    if (trades.length < 2) return null;
    const sorted = [...trades].sort((a, b) => (a.sellDate || "").localeCompare(b.sellDate || ""));
    const mwr = overallXirr;
    let cumGrowth = 1;
    sorted.forEach(t => { const pr = t.buyAmt > 0 ? (t.pnl / t.buyAmt) : 0; cumGrowth *= (1 + pr); });
    const twr = (cumGrowth - 1) * 100;
    const firstBuy = sorted[0].buyDate;
    const lastSell = sorted[sorted.length - 1].sellDate;
    const totalDays = firstBuy && lastSell ? Math.max(1, Math.floor((new Date(lastSell + "T12:00:00") - new Date(firstBuy + "T12:00:00")) / 864e5)) : 365;
    const years = totalDays / 365.25;
    const twrAnnualized = years > 0 ? (Math.pow(cumGrowth, 1 / years) - 1) * 100 : twr;
    const mwrAnnualized = mwr;
    const divergence = mwrAnnualized !== null ? mwrAnnualized - twrAnnualized : null;
    let interpretation = "";
    if (divergence !== null) {
      if (Math.abs(divergence) < 1) interpretation = "TWR and MWR are closely aligned — your timing of investments has minimal impact on returns.";
      else if (divergence > 0) interpretation = "MWR > TWR — you tend to invest more money before good periods. Your timing adds value.";
      else interpretation = "MWR < TWR — you tend to invest more money before bad periods. Consider smoothing entry timing (e.g., SIP).";
    }
    return { twr, twrAnnualized, mwrAnnualized, divergence, totalDays, years, tradeCount: sorted.length, interpretation };
  }, [trades, overallXirr]);

  const rollingGains = React.useMemo(() => {
    const soldTrades = trades.filter(t => t.type === "sold" && t.sellDate);
    if (!soldTrades.length) return [];
    const monthMap = {};
    soldTrades.forEach(t => {
      const m = (t.sellDate || t.sellDateStr || "").slice(0, 7);
      if (!m) return;
      if (!monthMap[m]) monthMap[m] = { pnl: 0, count: 0, netPnl: 0 };
      monthMap[m].pnl += t.pnl; monthMap[m].netPnl += t.pnlNet; monthMap[m].count++;
    });
    const months = Object.keys(monthMap).sort();
    if (!months.length) return [];
    const result = [];
    for (let i = 0; i < months.length; i++) {
      const we = months[i];
      const ws = new Date(new Date(we + "-01").getTime() - 365 * 864e5).toISOString().slice(0, 7);
      let tPnl = 0, tNet = 0, tCnt = 0;
      months.forEach(m => { if (m > ws && m <= we) { tPnl += monthMap[m].pnl; tNet += monthMap[m].netPnl; tCnt += monthMap[m].count; } });
      result.push({ month: we, pnl: tPnl, netPnl: tNet, count: tCnt });
    }
    return result;
  }, [trades]);

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalPnlNet = trades.reduce((s, t) => s + t.pnlNet, 0);
  const totalBuy = trades.reduce((s, t) => s + t.buyAmt, 0);
  const totalBrokerage = trades.reduce((s, t) => s + t.brokerage, 0);
  const winners = trades.filter(t => t.pnl > 0).length;
  const losers = trades.filter(t => t.pnl < 0).length;
  const winRate = trades.length > 0 ? ((winners / trades.length) * 100).toFixed(1) : "0.0";
  const avgReturn = trades.length > 0 ? (trades.reduce((s, t) => s + t.returnPct, 0) / trades.length).toFixed(2) : "0.00";

  const sortedTrades = [...tradesWithXirr].sort((a, b) => {
    let va, vb;
    if (sortBy === "pnl") { va = a.pnl; vb = b.pnl; }
    else if (sortBy === "returnPct") { va = a.returnPct; vb = b.returnPct; }
    else if (sortBy === "xirr") { va = a.xirr ?? -Infinity; vb = b.xirr ?? -Infinity; }
    else { va = a.pnl; vb = b.pnl; }
    return sortDir === "desc" ? vb - va : va - vb;
  });

  const SortHdr = ({ label, field, align }) => React.createElement("div", {
    onClick: () => { if (sortBy === field) setSortDir(d => d === "desc" ? "asc" : "desc"); else { setSortBy(field); setSortDir("desc"); } },
    style: { fontSize: 9, fontWeight: 700, color: sortBy === field ? "var(--accent)" : "var(--text6)", textTransform: "uppercase", letterSpacing: .7, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, justifyContent: align || "flex-start", padding: "6px 8px" }
  }, label, sortBy === field && React.createElement("span", { style: { fontSize: 8 } }, sortDir === "desc" ? "\u25bc" : "\u25b2"));

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "invest", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to Previous Trades to see profitability analytics." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(175px,1fr))", gap: 12 } },
      React.createElement("div", { style: { background: totalPnl >= 0 ? "rgba(22,163,74,.07)" : "rgba(239,68,68,.07)", border: "1px solid " + (totalPnl >= 0 ? "rgba(22,163,74,.2)" : "rgba(239,68,68,.2)"), borderRadius: 12, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Total P&L"),
        React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: totalPnl >= 0 ? "#20c46a" : "#f0473f" } }, (totalPnl >= 0 ? "+" : "") + INR(totalPnl)),
        totalBrokerage > 0 && React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, "Net: " + (totalPnlNet >= 0 ? "+" : "") + INR(totalPnlNet))
      ),
      overallXirr !== null && React.createElement("div", { style: { background: "rgba(109,40,217,.07)", border: "1px solid rgba(109,40,217,.2)", borderRadius: 12, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Overall XIRR"),
        React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: overallXirr >= 0 ? "#6d28d9" : "#f0473f" } }, (overallXirr >= 0 ? "+" : "") + overallXirr.toFixed(2) + "%"),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, "Money-weighted p.a.")
      ),
      React.createElement("div", { style: { background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Win Rate"),
        React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "var(--text)" } }, "%" + winRate),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, winners + "W / " + losers + "L of " + trades.length + " trades")
      ),
      React.createElement("div", { style: { background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Avg Return / Trade"),
        React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: +avgReturn >= 0 ? "#20c46a" : "#f0473f" } }, (+avgReturn >= 0 ? "+" : "") + avgReturn + "%"),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, "Mean return across all trades")
      ),
      totalBrokerage > 0 && React.createElement("div", { style: { background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 12, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Total Brokerage"),
        React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#e0a527" } }, "-" + INR(totalBrokerage)),
        overallXirrNet !== null && React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, "Adj. XIRR: " + (overallXirrNet >= 0 ? "+" : "") + overallXirrNet.toFixed(2) + "% p.a.")
      )
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Per-Trade Profitability"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, trades.length + " trades")
      ),
      React.createElement("div", { className: "mobile-scroll-table", style: { overflowX: "auto" } },
        React.createElement("div", { style: { minWidth: 820 } },
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "2fr 80px 90px 90px 100px 90px 90px 90px 80px", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--bg4)" } },
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px" } }, "Trade"),
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: "center" } }, "Qty"),
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: "right" } }, "Buy \u20b9"),
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: "right" } }, "Sell \u20b9"),
            React.createElement(SortHdr, { label: "Abs P&L", field: "pnl", align: "right" }),
            React.createElement(SortHdr, { label: "Return %", field: "returnPct", align: "right" }),
            React.createElement(SortHdr, { label: "XIRR p.a.", field: "xirr", align: "right" }),
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: "right" } }, "Brokerage"),
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: "center" } }, "Status")
          ),
          sortedTrades.map((t, i) => {
            const isGain = t.pnl >= 0;
            return React.createElement("div", { key: t.id || i, style: { display: "grid", gridTemplateColumns: "2fr 80px 90px 90px 100px 90px 90px 90px 80px", gap: 0, borderBottom: "1px solid var(--border2)", background: i % 2 === 0 ? "transparent" : "var(--bg4)" } },
              React.createElement("div", { style: { padding: "9px 8px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } },
                React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, t.company),
                React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } },
                  React.createElement("span", { style: { fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(14,116,144,.1)", color: "#0e7490", fontWeight: 600 } }, t.ticker || "\u2014"),
                  React.createElement("span", { style: { fontSize: 9, color: "var(--text6)" } }, t.buyDate)
                )
              ),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 12, textAlign: "center", color: "var(--text3)" } }, t.qty),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", color: "var(--text4)" } }, "\u20b9" + Number(t.buyPrice).toLocaleString("en-IN")),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", color: isGain ? "#20c46a" : "#f0473f", fontWeight: 600 } }, "\u20b9" + Number(t.sellPrice).toLocaleString("en-IN")),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 12, textAlign: "right", fontWeight: 700, color: isGain ? "#20c46a" : "#f0473f" } }, (isGain ? "+" : "") + INR(t.pnl)),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: isGain ? "#20c46a" : "#f0473f" } }, (t.returnPct >= 0 ? "+" : "") + t.returnPct.toFixed(2) + "%"),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: t.xirr !== null ? (t.xirr >= 0 ? "#20c46a" : "#f0473f") : "var(--text6)" } }, t.xirr !== null ? (t.xirr >= 0 ? "+" : "") + t.xirr.toFixed(2) + "%" : "\u2014"),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", color: t.brokerage > 0 ? "#e0a527" : "var(--text6)" } }, t.brokerage > 0 ? "-" + INR(t.brokerage) : "\u2014"),
              React.createElement("div", { style: { padding: "9px 8px", display: "flex", justifyContent: "center", alignItems: "center" } },
                React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: t.type === "sold" ? "rgba(109,40,217,.1)" : "rgba(22,163,74,.1)", color: t.type === "sold" ? "#6d28d9" : "#20c46a", border: "1px solid " + (t.type === "sold" ? "rgba(109,40,217,.25)" : "rgba(22,163,74,.25)") } }, t.type === "sold" ? "SOLD" : "ACTIVE")
              )
            );
          })
        )
      ),
      totalBrokerage > 0 && React.createElement("div", { style: { padding: "10px 16px", borderTop: "1px solid var(--border)", background: "rgba(245,158,11,.04)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
        React.createElement("span", { style: { fontSize: 11, color: "#e0a527", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 } }, React.createElement(Icon, { n: "lightbulb", size: 12, color: "#e0a527" }), "Brokerage-Adjusted Returns:"),
        React.createElement("span", { style: { fontSize: 11, color: "var(--text4)" } }, "Gross P&L: " + (totalPnl >= 0 ? "+" : "") + INR(totalPnl)),
        React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, " \u2192 "),
        React.createElement("span", { style: { fontSize: 11, color: "var(--text3)", fontWeight: 600 } }, "Net P&L: " + (totalPnlNet >= 0 ? "+" : "") + INR(totalPnlNet)),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, " (after " + INR(totalBrokerage) + " brokerage)")
      )
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "money", size: 15 }), "Overall XIRR (Money-Weighted)"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(109,40,217,.1)", color: "#6d28d9", border: "1px solid rgba(109,40,217,.2)", fontWeight: 600 } }, "All trades combined")
      ),
      React.createElement("div", { style: { padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 } },
        overallXirr !== null ? React.createElement("div", { style: { textAlign: "center", padding: 16, background: overallXirr >= 0 ? "rgba(22,163,74,.06)" : "rgba(239,68,68,.06)", border: "1px solid " + (overallXirr >= 0 ? "rgba(22,163,74,.18)" : "rgba(239,68,68,.18)"), borderRadius: 12 } },
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 } }, "Gross XIRR"),
          React.createElement("div", { style: { fontSize: 32, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: overallXirr >= 0 ? "#20c46a" : "#f0473f", lineHeight: 1.1 } }, (overallXirr >= 0 ? "+" : "") + overallXirr.toFixed(2) + "%"),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 4 } }, "p.a. money-weighted")
        ) : React.createElement("div", { style: { textAlign: "center", padding: 16, color: "var(--text6)", fontSize: 13 } }, "Insufficient data for XIRR"),
        overallXirrNet !== null && React.createElement("div", { style: { textAlign: "center", padding: 16, background: overallXirrNet >= 0 ? "rgba(245,158,11,.06)" : "rgba(239,68,68,.06)", border: "1px solid " + (overallXirrNet >= 0 ? "rgba(245,158,11,.18)" : "rgba(239,68,68,.18)"), borderRadius: 12 } },
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 } }, "Net XIRR (after brokerage)"),
          React.createElement("div", { style: { fontSize: 32, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: overallXirrNet >= 0 ? "#e0a527" : "#f0473f", lineHeight: 1.1 } }, (overallXirrNet >= 0 ? "+" : "") + overallXirrNet.toFixed(2) + "%"),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 4 } }, "p.a. brokerage-adjusted")
        ),
        React.createElement("div", { style: { padding: 16, background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 12 } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 8 } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Total Trades"),
            React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)" } }, trades.length)
          ),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 8 } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Total Invested"),
            React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)" } }, "\u20b9" + Number(totalBuy).toLocaleString("en-IN"))
          ),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Date Range"),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--text3)" } }, trades.length ? trades.reduce((m, t) => t.buyDate < m ? t.buyDate : m, "9999") + " \u2192 " + trades.reduce((m, t) => (t.sellDate || "") > m ? (t.sellDate || "") : m, "0000") : "\u2014")
          )
        )
      )
    ),
    rollingGains.length > 0 && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "calendar", size: 15 }), "Rolling 12-Month Realised Gains"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, rollingGains.length + " windows")
      ),
      React.createElement("div", { style: { padding: "12px 16px" } },
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          (() => {
            const maxAbs = Math.max(...rollingGains.map(g => Math.abs(g.pnl)), 1);
            return rollingGains.map(g => {
              const isGain = g.pnl >= 0;
              const barW = Math.min(100, (Math.abs(g.pnl) / maxAbs) * 85);
              return React.createElement("div", { key: g.month, style: { display: "flex", alignItems: "center", gap: 10 } },
                React.createElement("div", { style: { width: 70, fontSize: 11, fontWeight: 600, color: "var(--text4)", flexShrink: 0, textAlign: "right" } }, g.month),
                React.createElement("div", { style: { flex: 1, height: 24, background: "var(--bg5)", borderRadius: 6, overflow: "hidden" } },
                  React.createElement("div", { style: { height: "100%", width: barW + "%", background: isGain ? "linear-gradient(90deg,rgba(22,163,74,.25),rgba(22,163,74,.5))" : "linear-gradient(90deg,rgba(239,68,68,.25),rgba(239,68,68,.5))", borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 8 } },
                    React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: isGain ? "#20c46a" : "#f0473f", whiteSpace: "nowrap" } }, (isGain ? "+" : "") + INR(g.pnl))
                  )
                ),
                React.createElement("div", { style: { width: 55, fontSize: 10, color: "var(--text6)", textAlign: "right" } }, g.count + " trade" + (g.count !== 1 ? "s" : ""))
              );
            });
          })()
        )
      )
    ),
    twrData && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "clock", size: 15 }), "Time-Weighted vs Money-Weighted Returns"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, twrData.tradeCount + " trades \u00b7 " + twrData.years.toFixed(1) + "y span")
      ),
      React.createElement("div", { style: { padding: "16px 20px" } },
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 } },
          React.createElement("div", { style: { background: "rgba(14,116,144,.07)", border: "1px solid rgba(14,116,144,.2)", borderRadius: 12, padding: "14px 16px" } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Time-Weighted Return (TWR)"),
            React.createElement("div", { style: { fontSize: 22, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#0e7490" } }, ret(twrData.twrAnnualized) + " p.a."),
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, "Geometric chain of per-trade returns")
          ),
          React.createElement("div", { style: { background: "rgba(109,40,217,.07)", border: "1px solid rgba(109,40,217,.2)", borderRadius: 12, padding: "14px 16px" } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Money-Weighted Return (MWR)"),
            React.createElement("div", { style: { fontSize: 22, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#6d28d9" } }, twrData.mwrAnnualized !== null ? ret(twrData.mwrAnnualized) + " p.a." : "\u2014"),
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, "XIRR \u2014 larger trades have more weight")
          )
        ),
        twrData.divergence !== null && React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: Math.abs(twrData.divergence) < 1 ? "rgba(22,163,74,.06)" : twrData.divergence > 0 ? "rgba(14,116,144,.06)" : "rgba(239,68,68,.06)", border: "1px solid " + (Math.abs(twrData.divergence) < 1 ? "rgba(22,163,74,.15)" : twrData.divergence > 0 ? "rgba(14,116,144,.15)" : "rgba(239,68,68,.15)"), marginBottom: 12 }
        },
          React.createElement(Icon, { n: Math.abs(twrData.divergence) < 1 ? "checkcircle" : twrData.divergence > 0 ? "invest" : "warning", size: 16, color: Math.abs(twrData.divergence) < 1 ? "#20c46a" : twrData.divergence > 0 ? "#0e7490" : "#f0473f" }),
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: Math.abs(twrData.divergence) < 1 ? "#20c46a" : twrData.divergence > 0 ? "#0e7490" : "#f0473f" } }, "Divergence: " + (twrData.divergence > 0 ? "+" : "") + twrData.divergence.toFixed(2) + "% p.a."),
            React.createElement("div", { style: { fontSize: 11, color: "var(--text4)", marginTop: 2 } }, twrData.interpretation)
          )
        ),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", lineHeight: 1.6, padding: "8px 12px", background: "var(--bg5)", borderRadius: 8 } },
          React.createElement("strong", null, "Why do they differ? "), "TWR measures compound growth regardless of how much money was invested at each point \u2014 it answers 'how did my strategy perform?' MWR (XIRR) accounts for the timing and size of cash flows \u2014 it answers 'what return did my actual dollars earn?' If MWR > TWR, you invested larger amounts before winning trades. If MWR < TWR, larger investments preceded losing trades."
        )
      )
    ),
    React.createElement("div", { style: { padding: "10px 14px", background: "var(--accentbg2)", border: "1px solid var(--border2)", borderRadius: 10, fontSize: 11, color: "var(--text5)", lineHeight: 1.6 } },
      React.createElement("strong", { style: { color: "var(--accent)" } }, "Methodology: "),
      "XIRR (Extended Internal Rate of Return) accounts for the exact timing of cash flows, making it the gold standard for comparing trades with different holding periods. Overall XIRR is money-weighted \u2014 larger trades have more influence. Rolling 12-month windows show trailing realised gains ending each month. Time-Weighted Return (TWR) geometrically chains per-trade returns, eliminating the effect of cash flow timing. Money-Weighted Return (MWR/XIRR) weights returns by capital deployed."
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   2. TimeHoldingAnalysis — Time & Holding Pattern Analysis
   ══════════════════════════════════════════════════════════════════════════ */
const TimeHoldingAnalysis = ({ shares, soldShareSnapshots = {} }) => {
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const durationHistogram = React.useMemo(() => {
    if (!trades.length) return [];
    const buckets = [
      { label: "< 1 week", min: 0, max: 7, count: 0, pnl: 0 },
      { label: "1\u20132 weeks", min: 7, max: 14, count: 0, pnl: 0 },
      { label: "2\u20134 weeks", min: 14, max: 30, count: 0, pnl: 0 },
      { label: "1\u20133 months", min: 30, max: 91, count: 0, pnl: 0 },
      { label: "3\u20136 months", min: 91, max: 183, count: 0, pnl: 0 },
      { label: "6\u201312 months", min: 183, max: 365, count: 0, pnl: 0 },
      { label: "1\u20132 years", min: 365, max: 730, count: 0, pnl: 0 },
      { label: "2+ years", min: 730, max: Infinity, count: 0, pnl: 0 },
    ];
    trades.forEach(t => { const b = buckets.find(b => t.holdDays >= b.min && t.holdDays < b.max); if (b) { b.count++; b.pnl += t.pnl; } });
    return buckets;
  }, [trades]);

  const holdByStock = React.useMemo(() => {
    const map = {};
    trades.forEach(t => {
      const key = t.ticker || t.company;
      if (!map[key]) map[key] = { ticker: t.ticker, company: t.company, totalDays: 0, count: 0, totalPnl: 0, totalReturn: 0, totalBuyAmt: 0, minDays: Infinity, maxDays: 0 };
      const s = map[key]; s.totalDays += t.holdDays; s.count++; s.totalPnl += t.pnl; s.totalReturn += t.returnPct; s.totalBuyAmt += t.buyAmt;
      s.minDays = Math.min(s.minDays, t.holdDays); s.maxDays = Math.max(s.maxDays, t.holdDays);
    });
    return Object.values(map).map(s => ({ ...s, avgDays: Math.round(s.totalDays / s.count), avgReturn: (s.totalReturn / s.count).toFixed(2) })).sort((a, b) => b.avgDays - a.avgDays);
  }, [trades]);

  const monthAnalysis = React.useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months.map((name, i) => {
      const mt = trades.filter(t => t.buyMonth === i);
      if (!mt.length) return { name, month: i, count: 0, avgReturn: 0, totalPnl: 0, winRate: 0 };
      const avgReturn = mt.reduce((s, t) => s + t.returnPct, 0) / mt.length;
      const totalPnl = mt.reduce((s, t) => s + t.pnl, 0);
      const wins = mt.filter(t => t.pnl > 0).length;
      return { name, month: i, count: mt.length, avgReturn, totalPnl, winRate: (wins / mt.length * 100) };
    });
  }, [trades]);

  const quarterAnalysis = React.useMemo(() => {
    const qLabels = ["Q1 (Jan\u2013Mar)", "Q2 (Apr\u2013Jun)", "Q3 (Jul\u2013Sep)", "Q4 (Oct\u2013Dec)"];
    return qLabels.map((label, i) => {
      const qt = trades.filter(t => t.buyQuarter === i);
      if (!qt.length) return { label, q: i, count: 0, avgReturn: 0, totalPnl: 0, winRate: 0, avgHoldDays: 0 };
      const avgReturn = qt.reduce((s, t) => s + t.returnPct, 0) / qt.length;
      const totalPnl = qt.reduce((s, t) => s + t.pnl, 0);
      const wins = qt.filter(t => t.pnl > 0).length;
      const avgHoldDays = Math.round(qt.reduce((s, t) => s + t.holdDays, 0) / qt.length);
      return { label, q: i, count: qt.length, avgReturn, totalPnl, winRate: (wins / qt.length * 100), avgHoldDays };
    });
  }, [trades]);

  const positionSizing = React.useMemo(() => {
    if (trades.length < 2) return null;
    const sorted = [...trades].sort((a, b) => a.buyAmt - b.buyAmt);
    const median = sorted[Math.floor(sorted.length / 2)].buyAmt;
    const small = sorted.filter(t => t.buyAmt <= median);
    const large = sorted.filter(t => t.buyAmt > median);
    const calcStats = arr => {
      if (!arr.length) return { count: 0, avgSize: 0, avgReturn: 0, winRate: 0, totalPnl: 0 };
      return { count: arr.length, avgSize: arr.reduce((s, t) => s + t.buyAmt, 0) / arr.length, avgReturn: arr.reduce((s, t) => s + t.returnPct, 0) / arr.length, winRate: (arr.filter(t => t.pnl > 0).length / arr.length * 100), totalPnl: arr.reduce((s, t) => s + t.pnl, 0) };
    };
    const n = trades.length; const xs = trades.map(t => t.buyAmt); const ys = trades.map(t => t.returnPct);
    const mx = xs.reduce((a, b) => a + b, 0) / n; const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); denX += (xs[i] - mx) ** 2; denY += (ys[i] - my) ** 2; }
    const correlation = (denX > 0 && denY > 0) ? num / Math.sqrt(denX * denY) : 0;
    return { small: calcStats(small), large: calcStats(large), median, correlation };
  }, [trades]);

  const avgHoldAll = trades.length ? Math.round(trades.reduce((s, t) => s + t.holdDays, 0) / trades.length) : 0;
  const medianHold = trades.length ? [...trades].sort((a, b) => a.holdDays - b.holdDays)[Math.floor(trades.length / 2)].holdDays : 0;

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "clock", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see time & holding pattern analysis." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 12 } },
      React.createElement(StatBox, { label: "Avg Hold Period", value: fmtDays(avgHoldAll), sub: avgHoldAll + " days \u00b7 " + trades.length + " trades" }),
      React.createElement(StatBox, { label: "Median Hold Period", value: fmtDays(medianHold), sub: medianHold + " days" }),
      React.createElement(StatBox, { label: "Shortest Hold", value: fmtDays(Math.min(...trades.map(t => t.holdDays))), sub: "fastest exit" }),
      React.createElement(StatBox, { label: "Longest Hold", value: fmtDays(Math.max(...trades.map(t => t.holdDays))), sub: "longest conviction" })
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Holding Duration Distribution"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, "histogram")
      ),
      React.createElement("div", { style: { padding: "16px 20px" } },
        (() => {
          const maxCount = Math.max(...durationHistogram.map(b => b.count), 1);
          return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
            durationHistogram.map(b => {
              const barW = (b.count / maxCount) * 100;
              const avgPnl = b.count > 0 ? (b.pnl / b.count) : 0;
              const isGain = avgPnl >= 0;
              return React.createElement("div", { key: b.label, style: { display: "flex", alignItems: "center", gap: 10 } },
                React.createElement("div", { style: { width: 90, fontSize: 11, fontWeight: 600, color: "var(--text4)", flexShrink: 0, textAlign: "right" } }, b.label),
                React.createElement("div", { style: { flex: 1, height: 28, background: "var(--bg5)", borderRadius: 6, overflow: "hidden" } },
                  b.count > 0 && React.createElement("div", { style: { height: "100%", width: barW + "%", background: b.pnl >= 0 ? "linear-gradient(90deg,rgba(22,163,74,.2),rgba(22,163,74,.45))" : "linear-gradient(90deg,rgba(239,68,68,.2),rgba(239,68,68,.45))", borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 8 } },
                    React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: isGain ? "#20c46a" : "#f0473f", whiteSpace: "nowrap" } }, b.count + " trade" + (b.count !== 1 ? "s" : ""))
                  )
                ),
                React.createElement("div", { style: { width: 80, fontSize: 10, color: "var(--text6)", textAlign: "right" } }, b.count > 0 ? "Avg: " + (isGain ? "+" : "") + INR(Math.round(avgPnl)) : "\u2014")
              );
            })
          );
        })()
      )
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "building", size: 15 }), "Avg Holding Period Per Stock"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(109,40,217,.1)", color: "#6d28d9", border: "1px solid rgba(109,40,217,.2)", fontWeight: 600 } }, "conviction level")
      ),
      React.createElement("div", { className: "mobile-scroll-table", style: { overflowX: "auto" } },
        React.createElement("div", { style: { minWidth: 600 } },
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "2fr 80px 80px 90px 80px 80px", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--bg4)" } },
            ["Stock", "Trades", "Avg Days", "Avg Return", "Min", "Max"].map(h =>
              React.createElement("div", { key: h, style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: h === "Stock" ? "left" : "right" } }, h)
            )
          ),
          holdByStock.map((s, i) => {
            const avgRet = +s.avgReturn;
            return React.createElement("div", { key: s.ticker || s.company, style: { display: "grid", gridTemplateColumns: "2fr 80px 80px 90px 80px 80px", gap: 0, borderBottom: "1px solid var(--border2)", background: i % 2 === 0 ? "transparent" : "var(--bg4)" } },
              React.createElement("div", { style: { padding: "9px 8px", display: "flex", flexDirection: "column", gap: 2 } },
                React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, s.company),
                React.createElement("span", { style: { fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(14,116,144,.1)", color: "#0e7490", fontWeight: 600, width: "fit-content" } }, s.ticker || "\u2014")
              ),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 12, textAlign: "right", color: "var(--text3)" } }, s.count),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 12, textAlign: "right", fontWeight: 600, color: "var(--text)" } }, fmtDays(s.avgDays)),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: avgRet >= 0 ? "#20c46a" : "#f0473f" } }, (avgRet >= 0 ? "+" : "") + avgRet + "%"),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 10, textAlign: "right", color: "var(--text6)" } }, fmtDays(s.minDays)),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 10, textAlign: "right", color: "var(--text6)" } }, fmtDays(s.maxDays))
            );
          })
        )
      )
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "calendar", size: 15 }), "Best / Worst Month to Buy"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, "entry month analysis")
      ),
      React.createElement("div", { style: { padding: "16px 20px" } },
        (() => {
          const activeMonths = monthAnalysis.filter(m => m.count > 0);
          if (!activeMonths.length) return React.createElement("div", { style: { textAlign: "center", padding: 20, color: "var(--text6)", fontSize: 13 } }, "No data yet");
          const bestMonth = activeMonths.reduce((a, b) => a.avgReturn > b.avgReturn ? a : b);
          const worstMonth = activeMonths.reduce((a, b) => a.avgReturn < b.avgReturn ? a : b);
          const maxAbs = Math.max(...activeMonths.map(m => Math.abs(m.avgReturn)), 1);
          return React.createElement(React.Fragment, null,
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 } },
              React.createElement("div", { style: { padding: "12px 14px", borderRadius: 10, background: "rgba(22,163,74,.06)", border: "1px solid rgba(22,163,74,.18)" } },
                React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "#20c46a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 } }, "\ud83c\udfaf Best Month to Buy"),
                React.createElement("div", { style: { fontSize: 18, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#20c46a" } }, bestMonth.name),
                React.createElement("div", { style: { fontSize: 11, color: "var(--text4)", marginTop: 2 } }, "Avg return: " + (bestMonth.avgReturn >= 0 ? "+" : "") + bestMonth.avgReturn.toFixed(2) + "% \u00b7 " + bestMonth.count + " trades")
              ),
              React.createElement("div", { style: { padding: "12px 14px", borderRadius: 10, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.18)" } },
                React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "#f0473f", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 } }, "\u26a0\ufe0f Worst Month to Buy"),
                React.createElement("div", { style: { fontSize: 18, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#f0473f" } }, worstMonth.name),
                React.createElement("div", { style: { fontSize: 11, color: "var(--text4)", marginTop: 2 } }, "Avg return: " + (worstMonth.avgReturn >= 0 ? "+" : "") + worstMonth.avgReturn.toFixed(2) + "% \u00b7 " + worstMonth.count + " trades")
              )
            ),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
              monthAnalysis.map(m => {
                const barW = m.count > 0 ? (Math.abs(m.avgReturn) / maxAbs) * 85 : 0;
                const isGain = m.avgReturn >= 0;
                return React.createElement("div", { key: m.name, style: { display: "flex", alignItems: "center", gap: 8 } },
                  React.createElement("div", { style: { width: 30, fontSize: 11, fontWeight: 600, color: "var(--text4)", flexShrink: 0, textAlign: "right" } }, m.name),
                  React.createElement("div", { style: { flex: 1, height: 22, background: "var(--bg5)", borderRadius: 5, overflow: "hidden", display: "flex", alignItems: "center" } },
                    m.count > 0 && React.createElement("div", { style: { height: "100%", width: barW + "%", background: isGain ? "linear-gradient(90deg,rgba(22,163,74,.2),rgba(22,163,74,.4))" : "linear-gradient(90deg,rgba(239,68,68,.2),rgba(239,68,68,.4))", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 } },
                      React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: isGain ? "#20c46a" : "#f0473f", whiteSpace: "nowrap" } }, (isGain ? "+" : "") + m.avgReturn.toFixed(1) + "%")
                    )
                  ),
                  React.createElement("div", { style: { width: 45, fontSize: 10, color: "var(--text6)", textAlign: "right" } }, m.count > 0 ? m.count + " trades" : "\u2014"),
                  React.createElement("div", { style: { width: 38, fontSize: 9, textAlign: "right", fontWeight: 600, color: m.winRate >= 50 ? "#20c46a" : "#f0473f" } }, m.count > 0 ? Math.round(m.winRate) + "%" : "")
                );
              })
            )
          );
        })()
      )
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "calendar", size: 15 }), "Seasonality Patterns \u2014 Winners by Quarter"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, "do winners cluster?")
      ),
      React.createElement("div", { style: { padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 } },
        quarterAnalysis.map(q => {
          const hasData = q.count > 0;
          const isGain = q.avgReturn >= 0;
          const qCol = ["#4a8fe0", "#e0a527", "#20c46a", "#8b5cf6"][q.q];
          return React.createElement("div", { key: q.q, style: { padding: "14px 16px", borderRadius: 12, background: hasData ? (isGain ? "rgba(22,163,74,.04)" : "rgba(239,68,68,.04)") : "var(--bg4)", border: "1px solid " + (hasData ? (isGain ? "rgba(22,163,74,.15)" : "rgba(239,68,68,.15)") : "var(--border)") } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 10 } },
              React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", background: qCol } }),
              React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Q" + (q.q + 1))
            ),
            hasData ? React.createElement(React.Fragment, null,
              React.createElement("div", { style: { fontSize: 22, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: isGain ? "#20c46a" : "#f0473f", marginBottom: 4 } }, (isGain ? "+" : "") + q.avgReturn.toFixed(2) + "%"),
              React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 8 } }, "avg return \u00b7 " + q.count + " trades"),
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text6)" } },
                React.createElement("span", null, "Win rate: " + Math.round(q.winRate) + "%"),
                React.createElement("span", null, "Avg hold: " + fmtDays(q.avgHoldDays))
              ),
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text6)", marginTop: 3 } },
                React.createElement("span", null, "Total P&L:"),
                React.createElement("span", { style: { fontWeight: 600, color: q.totalPnl >= 0 ? "#20c46a" : "#f0473f" } }, (q.totalPnl >= 0 ? "+" : "") + INR(q.totalPnl))
              )
            ) : React.createElement("div", { style: { fontSize: 12, color: "var(--text6)", textAlign: "center", padding: "12px 0" } }, "No trades in this quarter")
          );
        })
      )
    ),
    positionSizing && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "grid", size: 15 }), "Position Sizing Patterns"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, "size vs outcome")
      ),
      React.createElement("div", { style: { padding: "16px 20px" } },
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 } },
          React.createElement("div", { style: { padding: "14px 16px", borderRadius: 12, background: "var(--bg4)", border: "1px solid var(--border)" } },
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 } }, "Smaller Positions"),
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 8 } }, "\u2264 \u20b9" + Number(Math.round(positionSizing.median)).toLocaleString("en-IN") + " invested"),
            ["Trades", "Avg Size", "Avg Return", "Win Rate"].map((label, i) => {
              const vals = [positionSizing.small.count, "\u20b9" + Number(Math.round(positionSizing.small.avgSize)).toLocaleString("en-IN"), (positionSizing.small.avgReturn >= 0 ? "+" : "") + positionSizing.small.avgReturn.toFixed(2) + "%", Math.round(positionSizing.small.winRate) + "%"];
              const cols = ["var(--text)", "var(--text)", positionSizing.small.avgReturn >= 0 ? "#20c46a" : "#f0473f", positionSizing.small.winRate >= 50 ? "#20c46a" : "#f0473f"];
              return React.createElement("div", { key: label, style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, label),
                React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: cols[i] } }, vals[i])
              );
            })
          ),
          React.createElement("div", { style: { padding: "14px 16px", borderRadius: 12, background: "var(--bg4)", border: "1px solid var(--border)" } },
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 } }, "Larger Positions"),
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 8 } }, " > \u20b9" + Number(Math.round(positionSizing.median)).toLocaleString("en-IN") + " invested"),
            ["Trades", "Avg Size", "Avg Return", "Win Rate"].map((label, i) => {
              const vals = [positionSizing.large.count, "\u20b9" + Number(Math.round(positionSizing.large.avgSize)).toLocaleString("en-IN"), (positionSizing.large.avgReturn >= 0 ? "+" : "") + positionSizing.large.avgReturn.toFixed(2) + "%", Math.round(positionSizing.large.winRate) + "%"];
              const cols = ["var(--text)", "var(--text)", positionSizing.large.avgReturn >= 0 ? "#20c46a" : "#f0473f", positionSizing.large.winRate >= 50 ? "#20c46a" : "#f0473f"];
              return React.createElement("div", { key: label, style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, label),
                React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: cols[i] } }, vals[i])
              );
            })
          )
        ),
        React.createElement("div", { style: { padding: "12px 16px", borderRadius: 10, background: Math.abs(positionSizing.correlation) > 0.15 ? (positionSizing.correlation > 0 ? "rgba(22,163,74,.06)" : "rgba(239,68,68,.06)") : "var(--bg4)", border: "1px solid " + (Math.abs(positionSizing.correlation) > 0.15 ? (positionSizing.correlation > 0 ? "rgba(22,163,74,.18)" : "rgba(239,68,68,.18)") : "var(--border)") } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
            React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--text3)" } }, "Size\u2013Return Correlation"),
            React.createElement("span", { style: { fontSize: 14, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: Math.abs(positionSizing.correlation) > 0.15 ? (positionSizing.correlation > 0 ? "#20c46a" : "#f0473f") : "var(--text5)" } }, positionSizing.correlation.toFixed(3))
          ),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", lineHeight: 1.5 } },
            Math.abs(positionSizing.correlation) < 0.1 ? "No meaningful correlation \u2014 position size doesn't predict returns."
              : positionSizing.correlation > 0 ? "Positive correlation \u2014 you tend to make higher returns on larger positions. Your conviction seems well-placed!"
              : "Negative correlation \u2014 larger positions tend to underperform. Consider more uniform position sizing."
          )
        ),
        React.createElement("div", { style: { marginTop: 12, display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg5)", borderRadius: 8, fontSize: 11 } },
          React.createElement("span", { style: { color: "var(--text5)" } }, "Small positions total P&L:"),
          React.createElement("span", { style: { fontWeight: 700, color: positionSizing.small.totalPnl >= 0 ? "#20c46a" : "#f0473f" } }, (positionSizing.small.totalPnl >= 0 ? "+" : "") + INR(positionSizing.small.totalPnl))
        ),
        React.createElement("div", { style: { marginTop: 6, display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg5)", borderRadius: 8, fontSize: 11 } },
          React.createElement("span", { style: { color: "var(--text5)" } }, "Large positions total P&L:"),
          React.createElement("span", { style: { fontWeight: 700, color: positionSizing.large.totalPnl >= 0 ? "#20c46a" : "#f0473f" } }, (positionSizing.large.totalPnl >= 0 ? "+" : "") + INR(positionSizing.large.totalPnl))
        )
      )
    ),
    React.createElement("div", { style: { padding: "10px 14px", background: "var(--accentbg2)", border: "1px solid var(--border2)", borderRadius: 10, fontSize: 11, color: "var(--text5)", lineHeight: 1.6 } },
      React.createElement("strong", { style: { color: "var(--accent)" } }, "Methodology: "),
      "Holding periods are measured in calendar days from buy date to sell date (or today for active holdings). Position sizing correlation uses Pearson's r \u2014 values above 0.15 or below -0.15 suggest a meaningful relationship between how much you invest and the outcome. Seasonality analysis groups trades by acquisition month/quarter to reveal timing patterns."
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   3. WinLossPatterns — Streak analysis, profit factor, best/worst trades
   ══════════════════════════════════════════════════════════════════════════ */
const WinLossPatterns = ({ shares, soldShareSnapshots = {} }) => {
  const [sortBy, setSortBy] = React.useState("pnl");
  const [sortDir, setSortDir] = React.useState("desc");
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const metrics = React.useMemo(() => {
    if (!trades.length) return null;
    const winners = trades.filter(t => t.pnl > 0);
    const losers = trades.filter(t => t.pnl < 0);
    const breakeven = trades.filter(t => t.pnl === 0);
    const winRate = (winners.length / trades.length) * 100;
    const totalProfit = winners.reduce((s, t) => s + t.pnl, 0);
    const totalLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
    const avgWin = winners.length > 0 ? totalProfit / winners.length : 0;
    const avgLoss = losers.length > 0 ? totalLoss / losers.length : 0;
    const avgWinReturn = winners.length > 0 ? winners.reduce((s, t) => s + t.returnPct, 0) / winners.length : 0;
    const avgLossReturn = losers.length > 0 ? losers.reduce((s, t) => s + t.returnPct, 0) / losers.length : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
    const largestWinner = [...winners].sort((a, b) => b.pnl - a.pnl)[0] || null;
    const largestLoser = [...losers].sort((a, b) => a.pnl - b.pnl)[0] || null;
    const largestWinnerPct = [...winners].sort((a, b) => b.returnPct - a.returnPct)[0] || null;
    const largestLoserPct = [...losers].sort((a, b) => a.returnPct - b.returnPct)[0] || null;
    const chrono = [...trades].sort((a, b) => {
      const da = a.sellDateStr || a.buyDateStr || "";
      const db = b.sellDateStr || b.buyDateStr || "";
      return da !== db ? da.localeCompare(db) : a.buyDateStr.localeCompare(b.buyDateStr);
    });
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
    let winStreakStart = null, winStreakEnd = null, lossStreakStart = null, lossStreakEnd = null;
    let tmpWinStart = null, tmpLossStart = null;
    chrono.forEach((t, i) => {
      if (t.pnl > 0) {
        if (curWin === 0) tmpWinStart = t; curWin++;
        if (curLoss > maxLossStreak) { maxLossStreak = curLoss; lossStreakStart = tmpLossStart; lossStreakEnd = chrono[i - 1]; }
        curLoss = 0;
      } else if (t.pnl < 0) {
        if (curLoss === 0) tmpLossStart = t; curLoss++;
        if (curWin > maxWinStreak) { maxWinStreak = curWin; winStreakStart = tmpWinStart; winStreakEnd = chrono[i - 1]; }
        curWin = 0;
      } else {
        if (curWin > maxWinStreak) { maxWinStreak = curWin; winStreakStart = tmpWinStart; winStreakEnd = chrono[i - 1]; }
        if (curLoss > maxLossStreak) { maxLossStreak = curLoss; lossStreakStart = tmpLossStart; lossStreakEnd = chrono[i - 1]; }
        curWin = 0; curLoss = 0;
      }
    });
    if (curWin > maxWinStreak) { maxWinStreak = curWin; winStreakStart = tmpWinStart; winStreakEnd = chrono[chrono.length - 1]; }
    if (curLoss > maxLossStreak) { maxLossStreak = curLoss; lossStreakStart = tmpLossStart; lossStreakEnd = chrono[chrono.length - 1]; }
    return {
      total: trades.length, winners: winners.length, losers: losers.length, breakeven: breakeven.length,
      winRate, totalProfit, totalLoss, profitFactor, avgWin, avgLoss, avgWinReturn, avgLossReturn, winLossRatio,
      largestWinner, largestLoser, largestWinnerPct, largestLoserPct,
      maxWinStreak, maxLossStreak, winStreakStart, winStreakEnd, lossStreakStart, lossStreakEnd,
    };
  }, [trades]);

  const stockStats = React.useMemo(() => {
    const map = {};
    trades.forEach(t => {
      const key = t.ticker || t.company;
      if (!map[key]) map[key] = { ticker: t.ticker, company: t.company, trades: 0, totalPnl: 0, totalBuyAmt: 0, totalReturn: 0, wins: 0, losses: 0, totalHoldDays: 0, bestPnl: -Infinity, worstPnl: Infinity, bestReturn: -Infinity, worstReturn: Infinity };
      const s = map[key]; s.trades++; s.totalPnl += t.pnl; s.totalBuyAmt += t.buyAmt; s.totalReturn += t.returnPct; s.totalHoldDays += t.holdDays;
      if (t.pnl > 0) s.wins++; if (t.pnl < 0) s.losses++;
      s.bestPnl = Math.max(s.bestPnl, t.pnl); s.worstPnl = Math.min(s.worstPnl, t.pnl);
      s.bestReturn = Math.max(s.bestReturn, t.returnPct); s.worstReturn = Math.min(s.worstReturn, t.returnPct);
    });
    return Object.values(map).map(s => {
      const avgReturn = s.trades > 0 ? s.totalReturn / s.trades : 0;
      const avgHoldDays = s.trades > 0 ? Math.round(s.totalHoldDays / s.trades) : 0;
      const annReturn = avgHoldDays > 0 ? (Math.pow(1 + avgReturn / 100, 365 / avgHoldDays) - 1) * 100 : avgReturn;
      return { ...s, avgReturn, avgHoldDays, annReturn, winRate: s.trades > 0 ? (s.wins / s.trades * 100) : 0 };
    });
  }, [trades]);

  const SortHdr = ({ label, field, align }) => React.createElement("div", {
    onClick: () => { if (sortBy === field) setSortDir(d => d === "desc" ? "asc" : "desc"); else { setSortBy(field); setSortDir("desc"); } },
    style: { fontSize: 9, fontWeight: 700, color: sortBy === field ? "var(--accent)" : "var(--text6)", textTransform: "uppercase", letterSpacing: .7, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, justifyContent: align || "flex-start", padding: "6px 8px" }
  }, label, sortBy === field && React.createElement("span", { style: { fontSize: 8 } }, sortDir === "desc" ? "\u25bc" : "\u25b2"));

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "target", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see win/loss pattern analytics." });

  const bestByPnl = [...stockStats].sort((a, b) => b.totalPnl - a.totalPnl);
  const worstByPnl = [...stockStats].sort((a, b) => a.totalPnl - b.totalPnl);
  const bestByReturn = [...stockStats].sort((a, b) => b.avgReturn - a.avgReturn);
  const worstByReturn = [...stockStats].sort((a, b) => a.avgReturn - b.avgReturn);
  const bestByAnn = [...stockStats].sort((a, b) => b.annReturn - a.annReturn);
  const worstByAnn = [...stockStats].sort((a, b) => a.annReturn - b.annReturn);

  let sortedStocks;
  if (sortBy === "pnl") sortedStocks = [...stockStats].sort((a, b) => sortDir === "desc" ? b.totalPnl - a.totalPnl : a.totalPnl - b.totalPnl);
  else if (sortBy === "returnPct") sortedStocks = [...stockStats].sort((a, b) => sortDir === "desc" ? b.avgReturn - a.avgReturn : a.avgReturn - b.avgReturn);
  else if (sortBy === "annReturn") sortedStocks = [...stockStats].sort((a, b) => sortDir === "desc" ? b.annReturn - a.annReturn : a.annReturn - b.annReturn);
  else sortedStocks = [...stockStats].sort((a, b) => sortDir === "desc" ? b.totalPnl - a.totalPnl : a.totalPnl - b.totalPnl);

  const m = metrics;
  const pfColor = m.profitFactor >= 1.5 ? "#20c46a" : m.profitFactor >= 1 ? "#e0a527" : "#f0473f";
  const pfLabel = m.profitFactor >= 1.5 ? "Healthy" : m.profitFactor >= 1 ? "Marginal" : "Losing";

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 12 } },
      React.createElement(StatBox, { label: "Win Rate", value: m.winRate.toFixed(1) + "%", sub: m.winners + "W / " + m.losers + "L / " + m.breakeven + " even", color: m.winRate >= 50 ? "#20c46a" : "#f0473f", bg: m.winRate >= 50 ? "rgba(22,163,74,.07)" : "rgba(239,68,68,.07)", border: "1px solid " + (m.winRate >= 50 ? "rgba(22,163,74,.2)" : "rgba(239,68,68,.2)") }),
      React.createElement(StatBox, { label: "Profit Factor", value: m.profitFactor === Infinity ? "\u221e" : m.profitFactor.toFixed(2), sub: pfLabel + " \u00b7 gross \u00f7 gross loss", color: pfColor, bg: m.profitFactor >= 1.5 ? "rgba(22,163,74,.07)" : m.profitFactor >= 1 ? "rgba(245,158,11,.07)" : "rgba(239,68,68,.07)", border: "1px solid " + (m.profitFactor >= 1.5 ? "rgba(22,163,74,.2)" : m.profitFactor >= 1 ? "rgba(245,158,11,.2)" : "rgba(239,68,68,.2)") }),
      React.createElement(StatBox, { label: "Avg Win / Avg Loss", value: m.winLossRatio === Infinity ? "\u221e" : m.winLossRatio.toFixed(2) + "\u00d7", sub: "Win avg: " + INR(m.avgWin) + " \u00b7 Loss avg: " + INR(m.avgLoss), color: m.winLossRatio >= 1.5 ? "#20c46a" : m.winLossRatio >= 1 ? "#e0a527" : "#f0473f" }),
      React.createElement(StatBox, { label: "Best Win Streak", value: m.maxWinStreak + " trades", sub: m.winStreakStart ? (m.winStreakStart.ticker || "") + " \u2192 " + (m.winStreakEnd?.ticker || "") : null, color: "#20c46a", bg: "rgba(22,163,74,.07)", border: "1px solid rgba(22,163,74,.2)" }),
      React.createElement(StatBox, { label: "Worst Loss Streak", value: m.maxLossStreak + " trades", sub: m.lossStreakStart ? (m.lossStreakStart.ticker || "") + " \u2192 " + (m.lossStreakEnd?.ticker || "") : null, color: "#f0473f", bg: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)" })
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Win vs Loss Breakdown"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, m.total + " trades")
      ),
      React.createElement("div", { style: { padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 } },
        React.createElement("div", { style: { padding: 16, background: "rgba(22,163,74,.06)", border: "1px solid rgba(22,163,74,.18)", borderRadius: 12 } },
          React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#20c46a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 } }, React.createElement(Icon, { n: "checkcircle", size: 12, color: "#20c46a" }), " Winning Trades (" + m.winners + ")"),
          [["Total Profit", "+" + INR(m.totalProfit), "#20c46a"], ["Avg Win (\u20b9)", "+" + INR(m.avgWin), "#20c46a"], ["Avg Win (%)", "+" + m.avgWinReturn.toFixed(2) + "%", "#20c46a"]].map(([l, v, c]) =>
            React.createElement("div", { key: l, style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
              React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, l),
              React.createElement("span", { style: { fontSize: l.includes("Total") ? 13 : 12, fontWeight: 700, color: c, fontFamily: l.includes("Total") ? "'Manrope',sans-serif" : undefined } }, v)
            )
          ),
          m.largestWinner && React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(22,163,74,.15)" } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Largest Win"),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "#20c46a" } }, "+" + INR(m.largestWinner.pnl))
          ),
          m.largestWinnerPct && React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 4 } },
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "Highest Return %"),
            React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "#20c46a" } }, "+" + m.largestWinnerPct.returnPct.toFixed(2) + "% (" + m.largestWinnerPct.company + ")")
          )
        ),
        React.createElement("div", { style: { padding: 16, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.18)", borderRadius: 12 } },
          React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#f0473f", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 } }, React.createElement(Icon, { n: "delete", size: 12, color: "#f0473f" }), " Losing Trades (" + m.losers + ")"),
          [["Total Loss", "-" + INR(m.totalLoss), "#f0473f"], ["Avg Loss (\u20b9)", "-" + INR(m.avgLoss), "#f0473f"], ["Avg Loss (%)", m.avgLossReturn.toFixed(2) + "%", "#f0473f"]].map(([l, v, c]) =>
            React.createElement("div", { key: l, style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
              React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, l),
              React.createElement("span", { style: { fontSize: l.includes("Total") ? 13 : 12, fontWeight: 700, color: c, fontFamily: l.includes("Total") ? "'Manrope',sans-serif" : undefined } }, v)
            )
          ),
          m.largestLoser && React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(239,68,68,.15)" } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Largest Loss"),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "#f0473f" } }, "-" + INR(Math.abs(m.largestLoser.pnl)))
          ),
          m.largestLoserPct && React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 4 } },
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "Worst Return %"),
            React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "#f0473f" } }, m.largestLoserPct.returnPct.toFixed(2) + "% (" + m.largestLoserPct.company + ")")
          )
        ),
        React.createElement("div", { style: { padding: 16, background: m.profitFactor >= 1.5 ? "rgba(22,163,74,.06)" : "rgba(245,158,11,.06)", border: "1px solid " + (m.profitFactor >= 1.5 ? "rgba(22,163,74,.18)" : "rgba(245,158,11,.18)"), borderRadius: 12, gridColumn: "1 / -1" } },
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text3)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 } }, React.createElement(Icon, { n: "lightbulb", size: 13 }), "Profit Factor Insight"),
          React.createElement("div", { style: { fontSize: 12, color: "var(--text4)", lineHeight: 1.6 } },
            "Your profit factor is ", React.createElement("strong", { style: { color: pfColor } }, m.profitFactor === Infinity ? "\u221e" : m.profitFactor.toFixed(2)),
            " \u2014 for every \u20b91 lost, you make \u20b9" + (m.profitFactor === Infinity ? "\u221e" : m.profitFactor.toFixed(2)) + ". ",
            m.profitFactor >= 1.5 ? "This is healthy!" : m.profitFactor >= 1 ? "This is marginal. Aim for above 1.5." : "This is below breakeven."
          )
        )
      )
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "fire", size: 15 }), "Consecutive Streaks"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, "emotional patterns")
      ),
      React.createElement("div", { style: { padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 } },
        React.createElement("div", { style: { padding: 16, background: "rgba(22,163,74,.06)", border: "1px solid rgba(22,163,74,.18)", borderRadius: 12 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } },
            React.createElement(Icon, { n: "target", size: 20, color: "#20c46a" }),
            React.createElement("div", null,
              React.createElement("div", { style: { fontSize: 14, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#20c46a" } }, m.maxWinStreak + " consecutive wins"),
              React.createElement("div", { style: { fontSize: 11, color: "var(--text5)" } }, "Best winning streak")
            )
          ),
          m.winStreakStart && React.createElement("div", { style: { fontSize: 11, color: "var(--text4)", lineHeight: 1.6 } },
            "From ", React.createElement("strong", null, m.winStreakStart.company || m.winStreakStart.ticker),
            " to ", React.createElement("strong", null, m.winStreakEnd?.company || m.winStreakEnd?.ticker),
            "."
          )
        ),
        React.createElement("div", { style: { padding: 16, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.18)", borderRadius: 12 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } },
            React.createElement(Icon, { n: "warning", size: 20, color: "#f0473f" }),
            React.createElement("div", null,
              React.createElement("div", { style: { fontSize: 14, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#f0473f" } }, m.maxLossStreak + " consecutive losses"),
              React.createElement("div", { style: { fontSize: 11, color: "var(--text5)" } }, "Worst losing streak")
            )
          ),
          m.lossStreakStart && React.createElement("div", { style: { fontSize: 11, color: "var(--text4)", lineHeight: 1.6 } },
            "From ", React.createElement("strong", null, m.lossStreakStart.company || m.lossStreakStart.ticker),
            " to ", React.createElement("strong", null, m.lossStreakEnd?.company || m.lossStreakEnd?.ticker),
            "."
          )
        )
      )
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "target", size: 15 }), "Best & Worst Stocks"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, stockStats.length + " stocks")
      ),
      React.createElement("div", { style: { padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 } },
        [{ title: "Best by Absolute P&L", icon: "money", data: bestByPnl.slice(0, 5), col: "#20c46a", valFn: s => "+" + INR(s.totalPnl), subFn: s => s.trades + " trades \u00b7 " + s.winRate.toFixed(0) + "% win" },
         { title: "Worst by Absolute P&L", icon: "expense", data: worstByPnl.slice(0, 5), col: "#f0473f", valFn: s => "-" + INR(Math.abs(s.totalPnl)), subFn: s => s.trades + " trades \u00b7 " + s.winRate.toFixed(0) + "% win" },
         { title: "Best by Avg Return %", icon: "invest", data: bestByReturn.slice(0, 5), col: "#6d28d9", valFn: s => "+" + s.avgReturn.toFixed(2) + "%", subFn: s => s.trades + " trades \u00b7 hold " + s.avgHoldDays + "d avg" },
         { title: "Worst by Avg Return %", icon: "trenddown", data: worstByReturn.slice(0, 5), col: "#e0a527", valFn: s => s.avgReturn.toFixed(2) + "%", subFn: s => s.trades + " trades \u00b7 hold " + s.avgHoldDays + "d avg" },
         { title: "Best by Annualised Return", icon: "invest", data: bestByAnn.slice(0, 5), col: "#0e7490", valFn: s => "+" + s.annReturn.toFixed(2) + "% p.a.", subFn: s => s.trades + " trades \u00b7 " + s.avgHoldDays + "d hold" },
         { title: "Worst by Annualised Return", icon: "trenddown", data: worstByAnn.slice(0, 5), col: "#e11d48", valFn: s => s.annReturn.toFixed(2) + "% p.a.", subFn: s => s.trades + " trades \u00b7 " + s.avgHoldDays + "d hold" }
        ].map(card =>
          React.createElement("div", { key: card.title, style: { padding: 16, borderRadius: 12, background: card.col + "08", border: "1px solid " + card.col + "26" } },
            React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: card.col, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 4 } }, React.createElement(Icon, { n: card.icon, size: 13, color: card.col }), " " + card.title),
            card.data.map((s, i) => React.createElement("div", { key: s.ticker || i, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < 4 ? "1px solid var(--border2)" : "none" } },
              React.createElement("div", { style: { minWidth: 0, flex: 1 } },
                React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" } }, s.company),
                React.createElement("span", { style: { fontSize: 9, color: "var(--text6)" } }, card.subFn(s))
              ),
              React.createElement("span", { style: { fontSize: 13, fontFamily: "'Manrope',sans-serif", fontWeight: 700, color: card.col, marginLeft: 8, flexShrink: 0 } }, card.valFn(s))
            ))
          )
        )
      )
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" } },
      React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg5)", display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "list", size: 15 }), "Stock-by-Stock Performance"),
        React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)", fontWeight: 600 } }, sortedStocks.length + " stocks")
      ),
      React.createElement("div", { className: "mobile-scroll-table", style: { overflowX: "auto" } },
        React.createElement("div", { style: { minWidth: 700 } },
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "2fr 60px 70px 100px 90px 100px 80px", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--bg4)" } },
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px" } }, "Stock"),
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: "center" } }, "Trades"),
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: "center" } }, "Win %"),
            React.createElement(SortHdr, { label: "Total P&L", field: "pnl", align: "right" }),
            React.createElement(SortHdr, { label: "Avg Return", field: "returnPct", align: "right" }),
            React.createElement(SortHdr, { label: "Ann. Return", field: "annReturn", align: "right" }),
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: "right" } }, "Avg Hold")
          ),
          sortedStocks.map((s, i) => {
            const isGain = s.totalPnl >= 0;
            return React.createElement("div", { key: s.ticker || i, style: { display: "grid", gridTemplateColumns: "2fr 60px 70px 100px 90px 100px 80px", gap: 0, borderBottom: "1px solid var(--border2)", background: i % 2 === 0 ? "transparent" : "var(--bg4)" } },
              React.createElement("div", { style: { padding: "9px 8px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } },
                React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, s.company),
                React.createElement("span", { style: { fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(14,116,144,.1)", color: "#0e7490", fontWeight: 600, width: "fit-content" } }, s.ticker || "\u2014")
              ),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 12, textAlign: "center", color: "var(--text3)" } }, s.trades),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "center", fontWeight: 600, color: s.winRate >= 50 ? "#20c46a" : "#f0473f" } }, s.winRate.toFixed(0) + "%"),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 12, textAlign: "right", fontWeight: 700, color: isGain ? "#20c46a" : "#f0473f" } }, (isGain ? "+" : "") + INR(s.totalPnl)),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: s.avgReturn >= 0 ? "#20c46a" : "#f0473f" } }, (s.avgReturn >= 0 ? "+" : "") + s.avgReturn.toFixed(2) + "%"),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: s.annReturn >= 0 ? "#0e7490" : "#e11d48" } }, (s.annReturn >= 0 ? "+" : "") + s.annReturn.toFixed(2) + "%"),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", color: "var(--text4)" } }, s.avgHoldDays + "d")
            );
          })
        )
      )
    ),
    React.createElement("div", { style: { padding: "10px 14px", background: "var(--accentbg2)", border: "1px solid var(--border2)", borderRadius: 10, fontSize: 11, color: "var(--text5)", lineHeight: 1.6 } },
      React.createElement("strong", { style: { color: "var(--accent)" } }, "Methodology: "),
      "Win rate = profitable trades \u00f7 total trades. Profit factor = gross profit \u00f7 gross loss (\u2265 1.5 is healthy). Avg win/loss ratio compares mean winning trade to mean losing trade. Streak analysis sorts trades chronologically by sell date to find maximum consecutive wins and losses."
    )
  );
};


/* ══════════════════════════════════════════════════════════════════════════
   4. CapitalEfficiency — Capital utilisation, Kelly criterion, alpha vs Nifty
   ══════════════════════════════════════════════════════════════════════════ */
const CapitalEfficiency = ({ shares, soldShareSnapshots }) => {
  const NIFTY_CAGR = 0.12;
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const sizingStats = React.useMemo(() => {
    if (!trades.length) return null;
    const amounts = trades.map(t => t.buyAmt).sort((a, b) => a - b);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const median = amounts[Math.floor(amounts.length / 2)];
    return { avg, median, min: amounts[0], max: amounts[amounts.length - 1], total: amounts.reduce((a, b) => a + b, 0) };
  }, [trades]);

  const kellyData = React.useMemo(() => {
    if (trades.length < 3) return null;
    const winners = trades.filter(t => t.pnl > 0);
    const losers = trades.filter(t => t.pnl < 0);
    const winRate = winners.length / trades.length;
    const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.returnPct, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, t) => s + t.returnPct, 0) / losers.length) : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
    const kelly = winLossRatio > 0 ? ((winRate * winLossRatio - (1 - winRate)) / winLossRatio) : 0;
    return { winRate: winRate * 100, avgWin, avgLoss, winLossRatio, kelly: kelly * 100, halfKelly: (kelly / 2) * 100 };
  }, [trades]);

  const oppCost = React.useMemo(() => {
    if (!trades.length) return null;
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const totalBuy = trades.reduce((s, t) => s + t.buyAmt, 0);
    const niftyReturn = totalBuy > 0 ? ((totalPnl / totalBuy) / NIFTY_CAGR * 100) : 0;
    const avgXirr = trades.filter(t => t.xirr !== null).reduce((s, t) => s + t.xirr, 0) / Math.max(1, trades.filter(t => t.xirr !== null).length);
    return { totalPnl, totalBuy, avgXirr, alpha: avgXirr - (NIFTY_CAGR * 100) };
  }, [trades]);

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see capital efficiency analytics." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(175px,1fr))", gap: 12 } },
      React.createElement(StatBox, { label: "Capital Deployed", value: "₹" + Number(sizingStats.total).toLocaleString("en-IN"), sub: sizingStats.count + " trades" }),
      React.createElement(StatBox, { label: "Avg Trade Size", value: "₹" + Number(Math.round(sizingStats.avg)).toLocaleString("en-IN") }),
      oppCost && React.createElement(StatBox, { label: "Your Avg XIRR", value: (oppCost.avgXirr >= 0 ? "+" : "") + oppCost.avgXirr.toFixed(2) + "%", color: oppCost.avgXirr >= 0 ? "#20c46a" : "#f0473f" }),
      oppCost && React.createElement(StatBox, { label: "Alpha vs Nifty", value: (oppCost.alpha >= 0 ? "+" : "") + oppCost.alpha.toFixed(2) + "%", sub: "vs 12% CAGR", color: oppCost.alpha >= 0 ? "#20c46a" : "#f0473f", bg: oppCost.alpha >= 0 ? "rgba(22,163,74,.07)" : "rgba(239,68,68,.07)", border: "1px solid " + (oppCost.alpha >= 0 ? "rgba(22,163,74,.2)" : "rgba(239,68,68,.2)") }),
      kellyData && React.createElement(StatBox, { label: "Kelly Criterion", value: kellyData.kelly.toFixed(1) + "%", sub: "Optimal position size", bg: "rgba(109,40,217,.07)", border: "1px solid rgba(109,40,217,.2)", color: "#6d28d9" })
    ),
    /* Position Sizing Distribution */
    sizingStats && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Position Sizing Distribution"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 } },
        ["Min", "Median", "Avg", "Max"].map((label, i) => {
          const val = [sizingStats.min, sizingStats.median, sizingStats.avg, sizingStats.max][i];
          return React.createElement("div", { key: label, style: { padding: "10px 12px", background: "var(--bg4)", borderRadius: 10, border: "1px solid var(--border)", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, label),
            React.createElement("div", { style: { fontSize: 14, fontFamily: "'Manrope',sans-serif", fontWeight: 700, color: "var(--text)" } }, "₹" + Number(Math.round(val)).toLocaleString("en-IN"))
          );
        })
      )
    ),
    /* Opportunity Cost Analysis */
    oppCost && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Opportunity Cost Analysis"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
        React.createElement("div", { style: { padding: 16, background: "rgba(14,116,144,.06)", border: "1px solid rgba(14,116,144,.18)", borderRadius: 12 } },
          React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "#0e7490", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 } }, "vs Nifty 50 (12% CAGR)"),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } }, React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Your XIRR"), React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, (oppCost.avgXirr >= 0 ? "+" : "") + oppCost.avgXirr.toFixed(2) + "%")),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } }, React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Alpha"), React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: oppCost.alpha >= 0 ? "#20c46a" : "#f0473f" } }, (oppCost.alpha >= 0 ? "+" : "") + oppCost.alpha.toFixed(2) + "%"))
        ),
        React.createElement("div", { style: { padding: 16, background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 12 } },
          React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 } }, "Summary"),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } }, React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Total P&L"), React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: pnlColor(oppCost.totalPnl) } }, (oppCost.totalPnl >= 0 ? "+" : "") + INR(oppCost.totalPnl))),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } }, React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Total Invested"), React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "₹" + Number(Math.round(oppCost.totalBuy)).toLocaleString("en-IN")))
        )
      )
    ),
    /* Kelly Criterion */
    kellyData && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Kelly Criterion — Optimal Position Sizing"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 } },
        React.createElement("div", { style: { padding: 14, background: "var(--bg4)", borderRadius: 12, border: "1px solid var(--border)", textAlign: "center" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Win Rate"),
          React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: kellyData.winRate >= 50 ? "#20c46a" : "#f0473f" } }, kellyData.winRate.toFixed(1) + "%")
        ),
        React.createElement("div", { style: { padding: 14, background: "var(--bg4)", borderRadius: 12, border: "1px solid var(--border)", textAlign: "center" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Win/Loss Ratio"),
          React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "var(--text)" } }, kellyData.winLossRatio.toFixed(2) + "×")
        ),
        React.createElement("div", { style: { padding: 14, background: "rgba(109,40,217,.06)", borderRadius: 12, border: "1px solid rgba(109,40,217,.18)", textAlign: "center" } },
          React.createElement("div", { style: { fontSize: 9, color: "#6d28d9", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Half Kelly (Recommended)"),
          React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#6d28d9" } }, kellyData.halfKelly.toFixed(1) + "%")
        )
      ),
      React.createElement("div", { style: { marginTop: 12, padding: "8px 12px", background: "var(--accentbg2)", borderRadius: 8, fontSize: 11, color: "var(--text4)", lineHeight: 1.6 } },
        "Kelly = (Win% × Win/Loss Ratio − Loss%) / Win/Loss Ratio. Full Kelly is aggressive; half Kelly smooths drawdowns while capturing most growth."
      )
    )
  );
};
/* ══════════════════════════════════════════════════════════════════════════
   5. BehaviouralPatterns — Disposition effect, loss aversion, recency bias
   ══════════════════════════════════════════════════════════════════════════ */
const BehaviouralPatterns = ({ shares, soldShareSnapshots }) => {
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const lossAversion = React.useMemo(() => {
    const winners = trades.filter(t => t.pnl > 0);
    const losers = trades.filter(t => t.pnl < 0);
    if (!winners.length || !losers.length) return null;
    const avgHoldWin = winners.reduce((s, t) => s + t.holdDays, 0) / winners.length;
    const avgHoldLose = losers.reduce((s, t) => s + t.holdDays, 0) / losers.length;
    const ratio = avgHoldLose > 0 ? avgHoldWin / avgHoldLose : 1;
    let severity = "Balanced";
    if (ratio > 2) severity = "Strong loss aversion";
    else if (ratio > 1.5) severity = "Moderate loss aversion";
    else if (ratio < 0.5) severity = "Fast-cut losses";
    else if (ratio < 0.8) severity = "Mild loss aversion";
    return { avgHoldWin: Math.round(avgHoldWin), avgHoldLose: Math.round(avgHoldLose), ratio, severity };
  }, [trades]);

  const dipVsMomentum = React.useMemo(() => {
    if (trades.length < 3) return null;
    const dip = [], momentum = [], neutral = [];
    trades.forEach(t => {
      if (t.buyPrice < t.sellPrice * 0.95) dip.push(t);
      else if (t.buyPrice > t.sellPrice * 1.05) momentum.push(t);
      else neutral.push(t);
    });
    const calcStats = (arr) => {
      if (!arr.length) return { count: 0, avgReturn: 0, winRate: 0, totalPnl: 0 };
      return { count: arr.length, avgReturn: arr.reduce((s, t) => s + t.returnPct, 0) / arr.length, winRate: (arr.filter(t => t.pnl > 0).length / arr.length * 100), totalPnl: arr.reduce((s, t) => s + t.pnl, 0) };
    };
    return { dip: calcStats(dip), momentum: calcStats(momentum), neutral: calcStats(neutral) };
  }, [trades]);

  const dispositionScore = React.useMemo(() => {
    const winners = trades.filter(t => t.pnl > 0);
    const losers = trades.filter(t => t.pnl < 0);
    if (!winners.length || !losers.length) return null;
    const avgHoldWin = winners.reduce((s, t) => s + t.holdDays, 0) / winners.length;
    const avgHoldLose = losers.reduce((s, t) => s + t.holdDays, 0) / losers.length;
    const score = avgHoldLose > 0 ? Math.min(100, Math.round((avgHoldWin / avgHoldLose) * 30)) : 50;
    return { score, avgHoldWin: Math.round(avgHoldWin), avgHoldLose: Math.round(avgHoldLose) };
  }, [trades]);

  const recencyBias = React.useMemo(() => {
    if (trades.length < 5) return null;
    const sorted = [...trades].sort((a, b) => (a.sellDateStr || "").localeCompare(b.sellDateStr || ""));
    const bigWins = sorted.filter((_, i) => i >= Math.floor(sorted.length * 0.8));
    const rest = sorted.filter((_, i) => i < Math.floor(sorted.length * 0.8));
    if (!bigWins.length || !rest.length) return null;
    const avgFreqBig = bigWins.length;
    const avgFreqRest = rest.length;
    const avgSizeBig = bigWins.reduce((s, t) => s + t.buyAmt, 0) / bigWins.length;
    const avgSizeRest = rest.reduce((s, t) => s + t.buyAmt, 0) / rest.length;
    const sizeRatio = avgSizeRest > 0 ? avgSizeBig / avgSizeRest : 1;
    return { avgSizeBig, avgSizeRest, sizeRatio, bias: sizeRatio > 1.3 ? "Overconfidence after wins" : sizeRatio < 0.7 ? "Reduced sizing after wins" : "Balanced" };
  }, [trades]);

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see behavioural analytics." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 12 } },
      React.createElement(StatBox, { label: "Disposition Score", value: dispositionScore ? dispositionScore.score + "/100" : "—", sub: "Hold winners vs losers", color: dispositionScore && dispositionScore.score > 60 ? "#f0473f" : "#20c46a" }),
      React.createElement(StatBox, { label: "Loss Aversion", value: lossAversion ? lossAversion.ratio.toFixed(2) + "×" : "—", sub: lossAversion ? lossAversion.severity : "Need both W & L", color: lossAversion && lossAversion.ratio > 1.5 ? "#f0473f" : "#20c46a" }),
      React.createElement(StatBox, { label: "Buy-the-Dip Rate", value: dipVsMomentum ? dipVsMomentum.dip.count + "/" + trades.length : "—", sub: dipVsMomentum ? Math.round(dipVsMomentum.dip.count / trades.length * 100) + "% of trades" : null }),
      React.createElement(StatBox, { label: "Recency Bias", value: recencyBias ? recencyBias.bias : "—", sub: recencyBias ? "Size ratio: " + recencyBias.sizeRatio.toFixed(2) + "×" : "Need 5+ trades" })
    ),
    /* Loss Aversion */
    lossAversion && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Loss Aversion Indicator"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
        React.createElement("div", { style: { padding: 14, background: "rgba(22,163,74,.06)", border: "1px solid rgba(22,163,74,.18)", borderRadius: 12 } },
          React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "#20c46a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 } }, "Avg Hold — Winners"),
          React.createElement("div", { style: { fontSize: 22, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#20c46a" } }, fmtDays(lossAversion.avgHoldWin)),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)" } }, "You hold winners this long")
        ),
        React.createElement("div", { style: { padding: 14, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.18)", borderRadius: 12 } },
          React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "#f0473f", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 } }, "Avg Hold — Losers"),
          React.createElement("div", { style: { fontSize: 22, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#f0473f" } }, fmtDays(lossAversion.avgHoldLose)),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)" } }, "You hold losers this long")
        )
      ),
      React.createElement("div", { style: { marginTop: 12, padding: "8px 12px", background: lossAversion.ratio > 1.5 ? "rgba(239,68,68,.06)" : "var(--accentbg2)", border: "1px solid " + (lossAversion.ratio > 1.5 ? "rgba(239,68,68,.15)" : "var(--border2)"), borderRadius: 8, fontSize: 11, color: "var(--text4)", lineHeight: 1.6 } },
        lossAversion.ratio > 1.5
          ? "You hold losing positions " + lossAversion.ratio.toFixed(1) + "× longer than winners. This is the disposition effect — consider setting stop-losses to cut losers faster."
          : lossAversion.ratio < 0.8
            ? "You cut losses quickly — good discipline! Make sure you're not selling winners too early though."
            : "Your hold times for winners and losers are balanced. Good emotional control."
      )
    ),
    /* Disposition Effect */
    dispositionScore && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Disposition Effect Score"),
      React.createElement("div", { style: { textAlign: "center", padding: 16, background: dispositionScore.score > 60 ? "rgba(239,68,68,.06)" : "rgba(22,163,74,.06)", border: "1px solid " + (dispositionScore.score > 60 ? "rgba(239,68,68,.18)" : "rgba(22,163,74,.18)"), borderRadius: 12, marginBottom: 12 } },
        React.createElement("div", { style: { fontSize: 48, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: dispositionScore.score > 60 ? "#f0473f" : "#20c46a" } }, dispositionScore.score + "/100"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)" } }, dispositionScore.score > 60 ? "High disposition effect — you sell winners too early" : "Low disposition effect — good exit discipline")
      )
    ),
    /* Recency Bias */
    recencyBias && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Recency Bias Analysis"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 } },
        React.createElement("div", { style: { padding: 14, background: "var(--bg4)", borderRadius: 12, border: "1px solid var(--border)", textAlign: "center" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Avg Size (Recent Wins)"),
          React.createElement("div", { style: { fontSize: 16, fontFamily: "'Manrope',sans-serif", fontWeight: 700, color: "var(--text)" } }, "₹" + Number(Math.round(recencyBias.avgSizeBig)).toLocaleString("en-IN"))
        ),
        React.createElement("div", { style: { padding: 14, background: "var(--bg4)", borderRadius: 12, border: "1px solid var(--border)", textAlign: "center" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Avg Size (Other Trades)"),
          React.createElement("div", { style: { fontSize: 16, fontFamily: "'Manrope',sans-serif", fontWeight: 700, color: "var(--text)" } }, "₹" + Number(Math.round(recencyBias.avgSizeRest)).toLocaleString("en-IN"))
        ),
        React.createElement("div", { style: { padding: 14, background: "var(--bg4)", borderRadius: 12, border: "1px solid var(--border)", textAlign: "center" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Size Multiplier"),
          React.createElement("div", { style: { fontSize: 16, fontFamily: "'Manrope',sans-serif", fontWeight: 700, color: recencyBias.sizeRatio > 1.3 ? "#f0473f" : recencyBias.sizeRatio < 0.7 ? "#20c46a" : "var(--text)" } }, recencyBias.sizeRatio.toFixed(2) + "×")
        )
      ),
      React.createElement("div", { style: { marginTop: 12, padding: "8px 12px", background: "var(--accentbg2)", borderRadius: 8, fontSize: 11, color: "var(--text4)", lineHeight: 1.6 } },
        recencyBias.sizeRatio > 1.3
          ? "You increase position sizes after big wins — a classic overconfidence trap. Stick to fixed position sizing."
          : recencyBias.sizeRatio < 0.7
            ? "You reduce sizes after wins — possibly being too cautious. Winning streaks are normal; don't shrink from your edge."
            : "Your position sizing is consistent regardless of recent outcomes. Good discipline."
      )
    )
  );
};
/* ══════════════════════════════════════════════════════════════════════════
   6. TradeTimingCorrelation — Day-of-week analysis, entry/exit timing
   ══════════════════════════════════════════════════════════════════════════ */
const TradeTimingCorrelation = ({ shares, soldShareSnapshots }) => {
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const dayOfWeekAnalysis = React.useMemo(() => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days.map((name, i) => {
      const dayTrades = trades.filter(t => t.buyDate.getDay() === i);
      if (!dayTrades.length) return { name, day: i, count: 0, avgReturn: 0, winRate: 0, totalPnl: 0 };
      const avgReturn = dayTrades.reduce((s, t) => s + t.returnPct, 0) / dayTrades.length;
      const wins = dayTrades.filter(t => t.pnl > 0).length;
      return { name: name.slice(0, 3), day: i, count: dayTrades.length, avgReturn, winRate: (wins / dayTrades.length * 100), totalPnl: dayTrades.reduce((s, t) => s + t.pnl, 0) };
    }).filter(d => d.count > 0);
  }, [trades]);

  const monthEntry = React.useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months.map((name, i) => {
      const mt = trades.filter(t => t.buyMonth === i);
      if (!mt.length) return { name, month: i, count: 0, avgReturn: 0, winRate: 0 };
      return { name, month: i, count: mt.length, avgReturn: mt.reduce((s, t) => s + t.returnPct, 0) / mt.length, winRate: (mt.filter(t => t.pnl > 0).length / mt.length * 100) };
    }).filter(d => d.count > 0);
  }, [trades]);

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see trade timing analytics." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    /* Day of Week Analysis */
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Entry Day Analysis — Best Day to Buy"),
      (() => {
        if (!dayOfWeekAnalysis.length) return React.createElement("div", { style: { textAlign: "center", padding: 20, color: "var(--text6)" } }, "No data");
        const maxAbs = Math.max(...dayOfWeekAnalysis.map(d => Math.abs(d.avgReturn)), 1);
        return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          dayOfWeekAnalysis.map(d => {
            const barW = (Math.abs(d.avgReturn) / maxAbs) * 85;
            const isGain = d.avgReturn >= 0;
            return React.createElement("div", { key: d.day, style: { display: "flex", alignItems: "center", gap: 8 } },
              React.createElement("div", { style: { width: 35, fontSize: 11, fontWeight: 600, color: "var(--text4)", flexShrink: 0, textAlign: "right" } }, d.name),
              React.createElement("div", { style: { flex: 1, height: 24, background: "var(--bg5)", borderRadius: 5, overflow: "hidden", display: "flex", alignItems: "center" } },
                React.createElement("div", { style: { height: "100%", width: barW + "%", background: isGain ? "linear-gradient(90deg,rgba(22,163,74,.2),rgba(22,163,74,.4))" : "linear-gradient(90deg,rgba(239,68,68,.2),rgba(239,68,68,.4))", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 } },
                  React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: isGain ? "#20c46a" : "#f0473f" } }, (isGain ? "+" : "") + d.avgReturn.toFixed(1) + "%")
                )
              ),
              React.createElement("div", { style: { width: 60, fontSize: 10, color: "var(--text6)", textAlign: "right" } }, d.count + " trades · " + Math.round(d.winRate) + "% W")
            );
          })
        );
      })()
    ),
    /* Monthly Entry Analysis */
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Monthly Entry Analysis"),
      (() => {
        if (!monthEntry.length) return React.createElement("div", { style: { textAlign: "center", padding: 20, color: "var(--text6)" } }, "No data");
        const maxAbs = Math.max(...monthEntry.map(d => Math.abs(d.avgReturn)), 1);
        return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: 8 } },
          monthEntry.map(d => {
            const isGain = d.avgReturn >= 0;
            return React.createElement("div", { key: d.month, style: { padding: "10px 8px", borderRadius: 10, background: isGain ? "rgba(22,163,74,.06)" : "rgba(239,68,68,.06)", border: "1px solid " + (isGain ? "rgba(22,163,74,.15)" : "rgba(239,68,68,.15)"), textAlign: "center" } },
              React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)" } }, d.name),
              React.createElement("div", { style: { fontSize: 16, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: isGain ? "#20c46a" : "#f0473f" } }, (isGain ? "+" : "") + d.avgReturn.toFixed(1) + "%"),
              React.createElement("div", { style: { fontSize: 9, color: "var(--text6)" } }, d.count + " trades")
            );
          })
        );
      })()
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   7. RiskMetrics — Volatility, drawdown, concentration, risk score
   ══════════════════════════════════════════════════════════════════════════ */
const RiskMetrics = ({ shares, soldShareSnapshots }) => {
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const riskData = React.useMemo(() => {
    if (trades.length < 2) return null;
    const returns = trades.map(t => t.returnPct);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const volatility = Math.sqrt(variance);
    const sharpe = volatility > 0 ? mean / volatility : 0;

    /* Max drawdown */
    let cumPnl = 0, peak = 0, maxDD = 0;
    trades.forEach(t => { cumPnl += t.pnl; peak = Math.max(peak, cumPnl); const dd = peak > 0 ? ((peak - cumPnl) / peak * 100) : 0; maxDD = Math.max(maxDD, dd); });

    /* Concentration */
    const stockPnl = {};
    trades.forEach(t => { const k = t.ticker || t.company; stockPnl[k] = (stockPnl[k] || 0) + Math.abs(t.pnl); });
    const totalAbs = Object.values(stockPnl).reduce((a, b) => a + b, 0);
    const sortedPnl = Object.values(stockPnl).sort((a, b) => b - a);
    const top3 = sortedPnl.slice(0, 3).reduce((a, b) => a + b, 0);
    const concentration = totalAbs > 0 ? (top3 / totalAbs * 100) : 0;

    /* VaR */
    const sorted = [...returns].sort((a, b) => a - b);
    const var95 = sorted[Math.floor(sorted.length * 0.05)] || sorted[0];
    const var99 = sorted[Math.floor(sorted.length * 0.01)] || sorted[0];

    /* Risk score (0-100) */
    const volScore = Math.min(30, (volatility / 20) * 30);
    const ddScore = Math.min(25, (maxDD / 30) * 25);
    const concScore = Math.min(20, (concentration / 100) * 20);
    const sharpeWeakness = Math.max(0, 25 - sharpe * 12.5);
    const riskScore = Math.round(volScore + ddScore + concScore + sharpeWeakness);

    return { mean, volatility, sharpe, maxDD, concentration, var95, var99, riskScore, totalTrades: trades.length };
  }, [trades]);

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see risk analytics." });
  if (!riskData) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "Need 2+ Trades", sub: "Add more trades to calculate risk metrics." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 12 } },
      React.createElement(StatBox, { label: "Risk Score", value: riskData.riskScore + "/100", sub: riskData.riskScore < 40 ? "Low risk" : riskData.riskScore < 65 ? "Moderate" : "High risk", color: riskData.riskScore < 40 ? "#20c46a" : riskData.riskScore < 65 ? "#e0a527" : "#f0473f" }),
      React.createElement(StatBox, { label: "Volatility (σ)", value: riskData.volatility.toFixed(1) + "%", sub: "Return std deviation" }),
      React.createElement(StatBox, { label: "Sharpe-like Ratio", value: riskData.sharpe.toFixed(2), sub: "Mean ÷ σ", color: riskData.sharpe >= 1 ? "#20c46a" : riskData.sharpe >= 0 ? "#e0a527" : "#f0473f" }),
      React.createElement(StatBox, { label: "Max Drawdown", value: riskData.maxDD.toFixed(1) + "%", bg: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", color: "#f0473f" }),
      React.createElement(StatBox, { label: "Concentration", value: riskData.concentration.toFixed(0) + "%", sub: "Top 3 stocks share", color: riskData.concentration > 70 ? "#f0473f" : "var(--text)" })
    ),
    /* Risk Breakdown */
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 } }, React.createElement(Icon, { n: "chart", size: 15 }), "Risk Breakdown"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 } },
        React.createElement("div", { style: { padding: 14, background: "var(--bg4)", borderRadius: 12, border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 } }, "Value at Risk"),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "95% VaR"),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "#f0473f" } }, riskData.var95.toFixed(2) + "%")
          ),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "99% VaR"),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "#f0473f" } }, riskData.var99.toFixed(2) + "%")
          )
        ),
        React.createElement("div", { style: { padding: 14, background: "var(--bg4)", borderRadius: 12, border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 } }, "Return Distribution"),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Mean Return"),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: pnlColor(riskData.mean) } }, (riskData.mean >= 0 ? "+" : "") + riskData.mean.toFixed(2) + "%")
          ),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between" } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Trades"),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, riskData.totalTrades)
          )
        ),
        React.createElement("div", { style: { padding: 14, background: riskData.riskScore < 40 ? "rgba(22,163,74,.06)" : riskData.riskScore < 65 ? "rgba(245,158,11,.06)" : "rgba(239,68,68,.06)", borderRadius: 12, border: "1px solid " + (riskData.riskScore < 40 ? "rgba(22,163,74,.18)" : riskData.riskScore < 65 ? "rgba(245,158,11,.18)" : "rgba(239,68,68,.18)") } },
          React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 } }, "Composite Risk"),
          React.createElement("div", { style: { fontSize: 28, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: riskData.riskScore < 40 ? "#20c46a" : riskData.riskScore < 65 ? "#e0a527" : "#f0473f" } }, riskData.riskScore + "/100"),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text5)" } }, "30% vol + 25% Sharpe + 25% DD + 20% conc")
        )
      )
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   8. PatternMining — Sweet-spot duration, revisit patterns
   ══════════════════════════════════════════════════════════════════════════ */
const PatternMining = ({ shares, soldShareSnapshots }) => {
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const sweetSpot = React.useMemo(() => {
    if (trades.length < 3) return null;
    const buckets = [
      { label: "< 1 week", min: 0, max: 7, trades: [], avgReturn: 0, winRate: 0 },
      { label: "1-2 weeks", min: 7, max: 14, trades: [], avgReturn: 0, winRate: 0 },
      { label: "2-4 weeks", min: 14, max: 30, trades: [], avgReturn: 0, winRate: 0 },
      { label: "1-3 months", min: 30, max: 91, trades: [], avgReturn: 0, winRate: 0 },
      { label: "3-6 months", min: 91, max: 183, trades: [], avgReturn: 0, winRate: 0 },
      { label: "6-12 months", min: 183, max: 365, trades: [], avgReturn: 0, winRate: 0 },
      { label: "1-2 years", min: 365, max: 730, trades: [], avgReturn: 0, winRate: 0 },
      { label: "2+ years", min: 730, max: Infinity, trades: [], avgReturn: 0, winRate: 0 },
    ];
    trades.forEach(t => { const b = buckets.find(b => t.holdDays >= b.min && t.holdDays < b.max); if (b) b.trades.push(t); });
    buckets.forEach(b => {
      if (b.trades.length) {
        b.avgReturn = b.trades.reduce((s, t) => s + t.returnPct, 0) / b.trades.length;
        b.winRate = b.trades.filter(t => t.pnl > 0).length / b.trades.length * 100;
      }
    });
    const withData = buckets.filter(b => b.trades.length >= 2);
    const best = withData.length ? withData.reduce((a, b) => a.avgReturn > b.avgReturn ? a : b) : null;
    return { buckets, best };
  }, [trades]);

  const revisitPatterns = React.useMemo(() => {
    const stockCounts = {};
    trades.forEach(t => { const k = t.ticker || t.company; stockCounts[k] = (stockCounts[k] || 0) + 1; });
    return Object.entries(stockCounts).filter(([, c]) => c >= 2).map(([ticker, count]) => {
      const st = trades.filter(t => (t.ticker || t.company) === ticker);
      return {
        ticker, company: st[0].company, count,
        avgReturn: st.reduce((s, t) => s + t.returnPct, 0) / st.length,
        avgPnl: st.reduce((s, t) => s + t.pnl, 0) / st.length,
        winRate: st.filter(t => t.pnl > 0).length / st.length * 100,
      };
    }).sort((a, b) => b.count - a.count);
  }, [trades]);

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see pattern mining." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    sweetSpot && sweetSpot.best && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 } }, "Sweet-Spot Holding Duration"),
      React.createElement("div", { style: { padding: 14, background: "rgba(22,163,74,.06)", border: "1px solid rgba(22,163,74,.18)", borderRadius: 12, marginBottom: 14, textAlign: "center" } },
        React.createElement("div", { style: { fontSize: 10, color: "#20c46a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 } }, "Your Optimal Hold Period"),
        React.createElement("div", { style: { fontSize: 24, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "#20c46a" } }, sweetSpot.best.label),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)" } }, "Avg: " + (sweetSpot.best.avgReturn >= 0 ? "+" : "") + sweetSpot.best.avgReturn.toFixed(2) + "% · Win: " + Math.round(sweetSpot.best.winRate) + "%")
      ),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        sweetSpot.buckets.map(b => {
          const maxRet = Math.max(...sweetSpot.buckets.map(x => Math.abs(x.avgReturn)), 1);
          const barW = b.trades.length > 0 ? Math.min(100, (Math.abs(b.avgReturn) / maxRet) * 85) : 0;
          const isGain = b.avgReturn >= 0;
          const isBest = b === sweetSpot.best;
          return React.createElement("div", { key: b.label, style: { display: "flex", alignItems: "center", gap: 10, padding: isBest ? "4px 8px" : "0", background: isBest ? "rgba(22,163,74,.06)" : "transparent", borderRadius: 8 } },
            React.createElement("div", { style: { width: 90, fontSize: 11, fontWeight: isBest ? 700 : 600, color: isBest ? "#20c46a" : "var(--text4)", flexShrink: 0, textAlign: "right" } }, b.label),
            React.createElement("div", { style: { flex: 1, height: 24, background: "var(--bg5)", borderRadius: 5, overflow: "hidden" } },
              b.trades.length > 0 && React.createElement("div", { style: { height: "100%", width: barW + "%", background: isGain ? "linear-gradient(90deg,rgba(22,163,74,.2),rgba(22,163,74,.45))" : "linear-gradient(90deg,rgba(239,68,68,.2),rgba(239,68,68,.45))", borderRadius: 5, display: "flex", alignItems: "center", paddingLeft: 8 } },
                React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: isGain ? "#20c46a" : "#f0473f" } }, b.trades.length + " trades")
              )
            ),
            React.createElement("div", { style: { width: 100, fontSize: 10, color: "var(--text6)", textAlign: "right" } }, b.trades.length > 0 ? "Avg: " + (isGain ? "+" : "") + b.avgReturn.toFixed(1) + "%" : "—")
          );
        })
      )
    ),
    revisitPatterns.length > 0 && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 } }, "Revisit Patterns — Stocks You Trade Multiple Times"),
      React.createElement("div", { style: { overflowX: "auto" } },
        React.createElement("div", { style: { minWidth: 500 } },
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "2fr 60px 80px 90px 80px", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--bg4)" } },
            ["Stock", "Trades", "Avg Return", "Avg P&L", "Win Rate"].map(h => React.createElement("div", { key: h, style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: h === "Stock" ? "left" : "right" } }, h))
          ),
          revisitPatterns.map((s, i) =>
            React.createElement("div", { key: s.ticker, style: { display: "grid", gridTemplateColumns: "2fr 60px 80px 90px 80px", gap: 0, borderBottom: "1px solid var(--border2)", background: i % 2 === 0 ? "transparent" : "var(--bg4)" } },
              React.createElement("div", { style: { padding: "9px 8px" } },
                React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text)" } }, s.company),
                React.createElement("span", { style: { fontSize: 9, color: "#0e7490" } }, s.ticker)
              ),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 12, textAlign: "right", color: "var(--text3)" } }, s.count),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: pnlColor(s.avgReturn) } }, (s.avgReturn >= 0 ? "+" : "") + s.avgReturn.toFixed(2) + "%"),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 12, textAlign: "right", fontWeight: 700, fontFamily: "'Manrope',sans-serif", color: pnlColor(s.avgPnl) } }, (s.avgPnl >= 0 ? "+" : "") + INR(s.avgPnl)),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: s.winRate >= 50 ? "#20c46a" : "#f0473f" } }, Math.round(s.winRate) + "%")
            )
          )
        )
      )
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   9. DrawdownRecoveryTracker — Equity curve, max drawdown, recovery
   ══════════════════════════════════════════════════════════════════════════ */
const DrawdownRecoveryTracker = ({ shares, soldShareSnapshots }) => {
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const curveData = React.useMemo(() => {
    if (!trades.length) return null;
    const sorted = [...trades].sort((a, b) => (a.sellDateStr || "").localeCompare(b.sellDateStr || ""));
    let cumPnl = 0, peak = 0, maxDD = 0, maxDDPct = 0;
    const points = [];
    sorted.forEach(t => {
      cumPnl += t.pnl;
      peak = Math.max(peak, cumPnl);
      const dd = peak - cumPnl;
      const ddPct = peak > 0 ? (dd / peak * 100) : 0;
      maxDD = Math.max(maxDD, dd);
      maxDDPct = Math.max(maxDDPct, ddPct);
      points.push({ date: t.sellDateStr, pnl: t.pnl, cumPnl, peak, dd, ddPct });
    });
    const totalPnl = cumPnl;
    const currentDD = peak - cumPnl;
    const currentDDPct = peak > 0 ? (currentDD / peak * 100) : 0;
    const recovery = currentDD > 0 ? ((peak - currentDD) / peak * 100) : 100;
    return { points, totalPnl, peak, maxDD, maxDDPct, currentDD, currentDDPct, recovery, tradeCount: sorted.length };
  }, [trades]);

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see drawdown analytics." });
  if (!curveData) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "Need Trade Data", sub: "Add more trades to track drawdown." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 12 } },
      React.createElement(StatBox, { label: "Cumulative P&L", value: (curveData.totalPnl >= 0 ? "+" : "") + INR(curveData.totalPnl), color: pnlColor(curveData.totalPnl), bg: curveData.totalPnl >= 0 ? "rgba(22,163,74,.07)" : "rgba(239,68,68,.07)", border: "1px solid " + (curveData.totalPnl >= 0 ? "rgba(22,163,74,.2)" : "rgba(239,68,68,.2)") }),
      React.createElement(StatBox, { label: "Peak P&L", value: INR(curveData.peak), color: "#20c46a" }),
      React.createElement(StatBox, { label: "Max Drawdown", value: curveData.maxDDPct.toFixed(1) + "%", sub: INR(curveData.maxDD) + " peak-to-trough", bg: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", color: "#f0473f" }),
      React.createElement(StatBox, { label: "Current Drawdown", value: curveData.currentDDPct.toFixed(1) + "%", sub: curveData.currentDD > 0 ? INR(curveData.currentDD) + " from peak" : "At peak!", color: curveData.currentDD > 0 ? "#f0473f" : "#20c46a" })
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 } }, "Equity Curve (Cumulative P&L)"),
      React.createElement("div", { style: { position: "relative", height: 200, background: "var(--bg5)", borderRadius: 8, overflow: "hidden", padding: "8px 0" } },
        (() => {
          const pts = curveData.points;
          if (pts.length < 2) return React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text6)" } }, "Need 2+ trades");
          const minPnl = Math.min(...pts.map(p => p.cumPnl), 0);
          const maxPnl = Math.max(...pts.map(p => p.cumPnl), 1);
          const range = maxPnl - minPnl || 1;
          const w = 100 / (pts.length - 1);
          const pathD = pts.map((p, i) => {
            const x = i * w;
            const y = 100 - ((p.cumPnl - minPnl) / range * 80 + 10);
            return (i === 0 ? "M" : "L") + x + "," + y;
          }).join(" ");
          return React.createElement("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none", style: { width: "100%", height: "100%" } },
            React.createElement("path", { d: pathD, fill: "none", stroke: curveData.totalPnl >= 0 ? "#20c46a" : "#f0473f", strokeWidth: "0.5", vectorEffect: "non-scaling-stroke", className: "stx-chart-line" })
          );
        })()
      ),
      React.createElement("div", { style: { marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
        React.createElement("div", { style: { padding: 12, background: "var(--bg4)", borderRadius: 10, border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Recovery Factor"),
          React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: curveData.recovery >= 100 ? "#20c46a" : "#e0a527" } }, curveData.recovery.toFixed(1) + "%"),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text5)" } }, "Of peak P&L recovered")
        ),
        React.createElement("div", { style: { padding: 12, background: "var(--bg4)", borderRadius: 10, border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Trade Count"),
          React.createElement("div", { style: { fontSize: 20, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: "var(--text)" } }, curveData.tradeCount),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text5)" } }, "Trades in equity curve")
        )
      )
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   10. MultiTimeframePerformance — Monthly, quarterly, annual performance
   ══════════════════════════════════════════════════════════════════════════ */
const MultiTimeframePerformance = ({ shares, soldShareSnapshots }) => {
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const monthlyPerf = React.useMemo(() => {
    const map = {};
    trades.forEach(t => {
      const m = (t.sellDateStr || "").slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { pnl: 0, count: 0, wins: 0, totalReturn: 0 };
      map[m].pnl += t.pnl; map[m].count++; map[m].totalReturn += t.returnPct;
      if (t.pnl > 0) map[m].wins++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([month, d]) => ({
      month, pnl: d.pnl, count: d.count, winRate: d.count > 0 ? (d.wins / d.count * 100) : 0, avgReturn: d.count > 0 ? d.totalReturn / d.count : 0,
    }));
  }, [trades]);

  const quarterlyPerf = React.useMemo(() => {
    const map = {};
    trades.forEach(t => {
      const m = (t.sellDateStr || "").slice(0, 7);
      if (!m) return;
      const yr = m.slice(0, 4);
      const q = Math.floor((parseInt(m.slice(5, 7)) - 1) / 3);
      const key = yr + "-Q" + (q + 1);
      if (!map[key]) map[key] = { pnl: 0, count: 0, wins: 0 };
      map[key].pnl += t.pnl; map[key].count++;
      if (t.pnl > 0) map[key].wins++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([quarter, d]) => ({
      quarter, pnl: d.pnl, count: d.count, winRate: d.count > 0 ? (d.wins / d.count * 100) : 0,
    }));
  }, [trades]);

  const annualPerf = React.useMemo(() => {
    const map = {};
    trades.forEach(t => {
      const yr = (t.sellDateStr || "").slice(0, 4);
      if (!yr) return;
      if (!map[yr]) map[yr] = { pnl: 0, count: 0, wins: 0 };
      map[yr].pnl += t.pnl; map[yr].count++;
      if (t.pnl > 0) map[yr].wins++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([year, d]) => ({
      year, pnl: d.pnl, count: d.count, winRate: d.count > 0 ? (d.wins / d.count * 100) : 0,
    }));
  }, [trades]);

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see multi-timeframe performance." });

  const renderPerfTable = (data, labelField, pnlField) => {
    const maxPnl = Math.max(...data.map(d => Math.abs(d.pnl)), 1);
    return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
      data.map(d => {
        const barW = Math.min(100, (Math.abs(d.pnl) / maxPnl) * 80);
        const isGain = d.pnl >= 0;
        return React.createElement("div", { key: d[labelField], style: { display: "flex", alignItems: "center", gap: 10 } },
          React.createElement("div", { style: { width: 70, fontSize: 11, fontWeight: 600, color: "var(--text4)", flexShrink: 0, textAlign: "right" } }, d[labelField]),
          React.createElement("div", { style: { flex: 1, height: 26, background: "var(--bg5)", borderRadius: 5, overflow: "hidden", display: "flex", alignItems: "center" } },
            React.createElement("div", { style: { height: "100%", width: barW + "%", background: isGain ? "linear-gradient(90deg,rgba(22,163,74,.2),rgba(22,163,74,.45))" : "linear-gradient(90deg,rgba(239,68,68,.2),rgba(239,68,68,.45))", borderRadius: 5, display: "flex", alignItems: "center", paddingLeft: 8 } },
              React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: isGain ? "#20c46a" : "#f0473f" } }, (isGain ? "+" : "") + INR(d.pnl))
            )
          ),
          React.createElement("div", { style: { width: 70, fontSize: 10, color: "var(--text6)", textAlign: "right" } }, d.count + " trades · " + Math.round(d.winRate) + "% W")
        );
      })
    );
  };

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    monthlyPerf.length > 0 && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 } }, "Monthly Performance"),
      renderPerfTable(monthlyPerf, "month", "pnl")
    ),
    quarterlyPerf.length > 0 && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 } }, "Quarterly Performance"),
      renderPerfTable(quarterlyPerf, "quarter", "pnl")
    ),
    annualPerf.length > 0 && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 } }, "Annual Performance"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 } },
        annualPerf.map(d => {
          const isGain = d.pnl >= 0;
          return React.createElement("div", { key: d.year, style: { padding: 16, borderRadius: 12, background: isGain ? "rgba(22,163,74,.06)" : "rgba(239,68,68,.06)", border: "1px solid " + (isGain ? "rgba(22,163,74,.18)" : "rgba(239,68,68,.18)"), textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 4 } }, d.year),
            React.createElement("div", { style: { fontSize: 22, fontFamily: "'Manrope',sans-serif", fontWeight: 800, color: isGain ? "#20c46a" : "#f0473f" } }, (isGain ? "+" : "") + INR(d.pnl)),
            React.createElement("div", { style: { fontSize: 10, color: "var(--text6)" } }, d.count + " trades · " + Math.round(d.winRate) + "% W")
          );
        })
      )
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   11. TradeFrequencyAnalytics — Trades per month, activity patterns
   ══════════════════════════════════════════════════════════════════════════ */
const TradeFrequencyAnalytics = ({ shares, soldShareSnapshots }) => {
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const monthlyFreq = React.useMemo(() => {
    const map = {};
    trades.forEach(t => {
      const m = (t.sellDateStr || "").slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { count: 0, pnl: 0, totalBuy: 0 };
      map[m].count++; map[m].pnl += t.pnl; map[m].totalBuy += t.buyAmt;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([month, d]) => ({
      month, count: d.count, pnl: d.pnl, totalBuy: d.totalBuy,
    }));
  }, [trades]);

  const stats = React.useMemo(() => {
    if (!monthlyFreq.length) return null;
    const counts = monthlyFreq.map(m => m.count);
    const avgPerMonth = counts.reduce((a, b) => a + b, 0) / counts.length;
    const maxMonth = monthlyFreq.reduce((a, b) => a.count > b.count ? a : b);
    const minMonth = monthlyFreq.reduce((a, b) => a.count < b.count ? a : b);
    return { avgPerMonth: avgPerMonth.toFixed(1), maxMonth, minMonth, totalMonths: monthlyFreq.length, totalTrades: trades.length };
  }, [monthlyFreq, trades]);

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see trade frequency analytics." });
  if (!stats) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "Need Trade Data", sub: "Add more trades to see frequency patterns." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 12 } },
      React.createElement(StatBox, { label: "Avg Trades / Month", value: stats.avgPerMonth, sub: stats.totalMonths + " active months" }),
      React.createElement(StatBox, { label: "Busiest Month", value: stats.maxMonth.count + " trades", sub: stats.maxMonth.month, color: "#20c46a" }),
      React.createElement(StatBox, { label: "Quietest Month", value: stats.minMonth.count + " trade" + (stats.minMonth.count !== 1 ? "s" : ""), sub: stats.minMonth.month }),
      React.createElement(StatBox, { label: "Total Trades", value: stats.totalTrades, sub: "across all months" })
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 } }, "Monthly Trade Frequency"),
      (() => {
        const maxCount = Math.max(...monthlyFreq.map(m => m.count), 1);
        return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          monthlyFreq.map(m => {
            const barW = (m.count / maxCount) * 100;
            const isGain = m.pnl >= 0;
            return React.createElement("div", { key: m.month, style: { display: "flex", alignItems: "center", gap: 10 } },
              React.createElement("div", { style: { width: 70, fontSize: 11, fontWeight: 600, color: "var(--text4)", flexShrink: 0, textAlign: "right" } }, m.month),
              React.createElement("div", { style: { flex: 1, height: 24, background: "var(--bg5)", borderRadius: 5, overflow: "hidden", display: "flex", alignItems: "center" } },
                React.createElement("div", { style: { height: "100%", width: barW + "%", background: isGain ? "linear-gradient(90deg,rgba(22,163,74,.2),rgba(22,163,74,.45))" : "linear-gradient(90deg,rgba(239,68,68,.2),rgba(239,68,68,.45))", borderRadius: 5, display: "flex", alignItems: "center", paddingLeft: 8 } },
                  React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: isGain ? "#20c46a" : "#f0473f" } }, m.count + " trades")
                )
              ),
              React.createElement("div", { style: { width: 80, fontSize: 10, color: "var(--text6)", textAlign: "right" } }, "P&L: " + (isGain ? "+" : "") + INR(m.pnl))
            );
          })
        );
      })()
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   12. SwingHoldOptimizer — Optimal hold duration, revisit analysis
   ══════════════════════════════════════════════════════════════════════════ */
const SwingHoldOptimizer = ({ shares, soldShareSnapshots }) => {
  const trades = React.useMemo(() => buildTradeList(shares, soldShareSnapshots), [shares, soldShareSnapshots]);

  const optimalByStock = React.useMemo(() => {
    const stockMap = {};
    trades.forEach(t => {
      const k = t.ticker || t.company;
      if (!stockMap[k]) stockMap[k] = { ticker: t.ticker, company: t.company, trades: [] };
      stockMap[k].trades.push(t);
    });
    return Object.values(stockMap).map(s => {
      const best = [...s.trades].sort((a, b) => b.returnPct - a.returnPct)[0];
      const avgHold = Math.round(s.trades.reduce((st, t) => st + t.holdDays, 0) / s.trades.length);
      const avgReturn = s.trades.reduce((st, t) => st + t.returnPct, 0) / s.trades.length;
      return { ticker: s.ticker, company: s.company, tradeCount: s.trades.length, avgHold, avgReturn, bestHold: best.holdDays, bestReturn: best.returnPct };
    }).sort((a, b) => b.avgReturn - a.avgReturn);
  }, [trades]);

  if (!trades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "chart", size: 40 }), text: "No Trade Data", sub: "Add shares or save snapshots to see swing/hold optimisation." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 12 } },
      React.createElement(StatBox, { label: "Total Stocks", value: optimalByStock.length }),
      React.createElement(StatBox, { label: "Avg Hold (All)", value: fmtDays(Math.round(trades.reduce((s, t) => s + t.holdDays, 0) / trades.length)) }),
      React.createElement(StatBox, { label: "Total Trades", value: trades.length }),
      React.createElement(StatBox, { label: "Best Performer", value: optimalByStock.length ? optimalByStock[0].company : "—", sub: optimalByStock.length ? (optimalByStock[0].avgReturn >= 0 ? "+" : "") + optimalByStock[0].avgReturn.toFixed(2) + "%" : null, color: "#20c46a" })
    ),
    optimalByStock.length > 0 && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 } }, "Optimal Hold Duration Per Stock"),
      React.createElement("div", { style: { overflowX: "auto" } },
        React.createElement("div", { style: { minWidth: 600 } },
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "2fr 60px 80px 80px 80px", gap: 0, borderBottom: "1px solid var(--border)", background: "var(--bg4)" } },
            ["Stock", "Trades", "Avg Hold", "Best Hold", "Avg Return"].map(h => React.createElement("div", { key: h, style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .7, padding: "8px", textAlign: h === "Stock" ? "left" : "right" } }, h))
          ),
          optimalByStock.map((s, i) =>
            React.createElement("div", { key: s.ticker || i, style: { display: "grid", gridTemplateColumns: "2fr 60px 80px 80px 80px", gap: 0, borderBottom: "1px solid var(--border2)", background: i % 2 === 0 ? "transparent" : "var(--bg4)" } },
              React.createElement("div", { style: { padding: "9px 8px" } },
                React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text)" } }, s.company),
                React.createElement("span", { style: { fontSize: 9, color: "#0e7490" } }, s.ticker || "—")
              ),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 12, textAlign: "right", color: "var(--text3)" } }, s.tradeCount),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: "var(--text)" } }, fmtDays(s.avgHold)),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: "#20c46a" } }, fmtDays(s.bestHold)),
              React.createElement("div", { style: { padding: "9px 8px", fontSize: 11, textAlign: "right", fontWeight: 600, color: pnlColor(s.avgReturn) } }, (s.avgReturn >= 0 ? "+" : "") + s.avgReturn.toFixed(2) + "%")
            )
          )
        )
      )
    )
  );
};
