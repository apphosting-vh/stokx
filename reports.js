// ============================================================================
// reports.js -- extracted from app-bundle.js | 12-tab Reports wrapper
// ============================================================================

/* global React, useMemo, useEffect, INR */
/* eslint-disable react/no-array-index-key */

// -- shared helpers ----------------------------------------------------------
const Icon = ({ name, n, size = 16, col, className = '' }) => {
  const iconName = name || n;
  const S = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: col || 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', display: 'inline-block', verticalAlign: 'middle' };
  const svg = (...ch) => React.createElement('svg', S, ...ch);
  const p = d => React.createElement('path', { d });
  const l = (x1,y1,x2,y2) => React.createElement('line', { x1,y1,x2,y2 });
  const c = (cx,cy,r) => React.createElement('circle', { cx,cy,r });
  const pl = pts => React.createElement('polyline', { points: pts });
  const rct = (x,y,w,h,rx) => React.createElement('rect', { x,y,width:w,height:h,rx:rx||0 });
  const pg = pts => React.createElement('polygon', { points: pts });
  switch(iconName) {
    case 'invest': return svg(pl('2 18 9 11 13 15 22 6'), pl('17 6 22 6 22 11'));
    case 'trenddown': return svg(pl('23 18 13.5 8.5 8.5 13.5 1 6'), pl('17 18 23 18 23 12'));
    case 'building': return svg(rct(4,2,16,20,2), l(9,22,9,18), l(15,22,15,18), l(9,6,15,6), l(9,10,15,10));
    case 'calendar': return svg(rct(3,4,18,18,2), l(16,2,16,6), l(8,2,8,6), l(3,10,21,10));
    case 'chart': return svg(pl('22 12 18 12 15 21 9 3 6 12 2 12'));
    case 'grid': return svg(rct(3,3,7,7,1), rct(14,3,7,7,1), rct(3,14,7,7,1), rct(14,14,7,7,1));
    case 'fire': return svg(p('M12 23c-4.97 0-9-3.58-9-8 0-3.19 2.13-6.04 4-8 0 3 2 4 3 2-1 2-2 5 2 6 1-3 4-4 5-7 1 3 3 5 3 7 0 4.42-4.03 8-8 8z'));
    case 'lightbulb': return svg(p('M9 21h6'), p('M9 18h6'), p('M12 2a7 7 0 00-3 13.33V17h6v-1.67A7 7 0 0012 2z'));
    case 'target': return svg(c(12,12,10), c(12,12,6), c(12,12,2));
    case 'shield': return svg(p('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'));
    case 'money': return svg(l(12,1,12,23), p('M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'));
    case 'expense': return svg(c(12,12,10), l(12,7,12,17), pl('8 13 12 17 16 13'));
    case 'warning': return svg(p('M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'), l(12,9,12,13), c(12,16,0.5));
    case 'checkcircle': return svg(c(12,12,10), pl('8 12 11 15 16 9'));
    case 'clock': return svg(c(12,12,10), l(12,6,12,12), pl('12 9 15 11'));
    case 'alarmclock': return svg(c(12,12,10), l(12,6,12,12), pl('12 9 15 11'), l(5,2,2,5), l(19,2,22,5));
    case 'list': return svg(l(8,6,21,6), l(8,12,21,12), l(8,18,21,18), rct(3,5,1.5,1.5,0.5), rct(3,11,1.5,1.5,0.5), rct(3,17,1.5,1.5,0.5));
    case 'search': return svg(c(11,11,7), l(16.5,16.5,21,21));
    case 'refresh': return svg(pl('23 4 23 10 17 10'), p('M20.49 15a9 9 0 11-2.12-9.36L23 10'));
    case 'info': return svg(c(12,12,10), l(12,16,12,12), l(12,8,12.01,8));
    case 'sun': return svg(c(12,12,4), l(12,2,12,5), l(12,19,12,22), l(4.93,4.93,7.05,7.05), l(16.95,16.95,19.07,19.07), l(2,12,5,12), l(19,12,22,12), l(4.93,19.07,7.05,16.95), l(16.95,7.05,19.07,4.93));
    case 'bolt': return svg(pg('13 2 3 14 12 14 11 22 21 10 12 10 13 2'));
    case 'delete': return svg(pl('3 6 5 6 21 6'), p('M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2'));
    case 'cloud': return svg(p('M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z'));
    case 'balance': return svg(l(12,3,12,21), p('M4 8h4l-4 8h4'), p('M20 8h-4l4 8h-4'), c(4,8,1), c(20,8,1));
    case 'compare': return svg(rct(4,3,4,18,1), rct(16,3,4,18,1));
    case 'crystal': return svg(pg('12 2 22 12 12 22 2 12'), l(12,2,12,22), l(2,12,22,12));
    case 'percent': return svg(c(9,9,2), c(15,15,2), l(20,4,4,20));
    default: return svg(c(12,12,4));
  }
};

const pnlColor = (v) => v > 0 ? '#10b981' : v < 0 ? '#ef4444' : '#94a3b8';
const fmtDays = (d) => d == null ? '—' : d === 0 ? '< 1d' : d < 1 ? `${Math.round(d * 24)}h` : `${Math.round(d)}d`;
const EmptyState = ({ icon = 'bar-chart', title, desc }) => (
  React.createElement('div', { style: { textAlign: 'center', padding: '48px 24px', color: '#64748b' } },
    React.createElement(Icon, { name: icon, size: 40 }),
    React.createElement('div', { style: { fontSize: 16, fontWeight: 600, marginTop: 12, color: '#e2e8f0' } }, title),
    React.createElement('div', { style: { fontSize: 13, marginTop: 4, maxWidth: 320, margin: '4px auto 0' } }, desc)
  )
);
const StatBox = ({ label, value, sub, color, small }) => (
  React.createElement('div', {
    style: {
      background: '#1e293b', borderRadius: 10, padding: small ? '10px 12px' : '14px 16px',
      flex: small ? '0 0 auto' : '1 1 0', minWidth: small ? 0 : 120,
      border: '1px solid #334155',
    }
  },
    React.createElement('div', { style: { fontSize: small ? 10 : 11, color: '#64748b', marginBottom: 4 } }, label),
    React.createElement('div', { style: { fontSize: small ? 16 : 20, fontWeight: 700, color: color || '#e2e8f0', lineHeight: 1.2 } }, value),
    sub && React.createElement('div', { style: { fontSize: 10, color: '#64748b', marginTop: 2 } }, sub)
  )
);
const ProfitabilityMetrics=({shares,soldShareSnapshots={}})=>{
  const[sortBy,setSortBy]=React.useState("pnl"); /* pnl | returnPct | xirr */
  const[sortDir,setSortDir]=React.useState("desc");
  const ret=(v)=>(v>=0?"+":"")+v.toFixed(2)+"%";

  /* ── Build unified trade list ── */
  const trades=React.useMemo(()=>{
    const list=[];
    /* Active holdings — treat currentPrice as "sell" for metrics */
    (shares||[]).forEach(sh=>{
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      const buyDate=sh.buyDate;
      const sellDate=TODAY(); /* active → mark-to-market as of today */
      const buyAmt=sh.qty*sh.buyPrice;
      const sellAmt=sh.qty*sh.currentPrice;
      const brokerage=+sh.brokerage||0;
      list.push({
        id:sh.id,type:"active",
        company:sh.company,ticker:sh.ticker,
        qty:sh.qty,buyPrice:sh.buyPrice,sellPrice:sh.currentPrice,
        buyDate,sellDate,
        buyAmt,sellAmt,brokerage,
        pnl:sellAmt-buyAmt,
        returnPct:buyAmt>0?((sellAmt-buyAmt)/buyAmt*100):0,
        pnlNet:sellAmt-buyAmt-brokerage,
        returnNetPct:buyAmt>0?(((sellAmt-buyAmt-brokerage)/buyAmt)*100):0,
      });
    });
    /* Sold snapshots */
    Object.values(soldShareSnapshots||{}).forEach(fySnaps=>{
      (fySnaps||[]).forEach(sn=>{
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate)return;
        const buyAmt=sn.qty*sn.buyPrice;
        const sellAmt=sn.qty*sn.sellPrice;
        const brokerage=+sn.brokerage||0;
        list.push({
          id:sn.id,type:"sold",
          company:sn.company,ticker:sn.ticker,
          qty:sn.qty,buyPrice:sn.buyPrice,sellPrice:sn.sellPrice,
          buyDate:sn.buyDate,sellDate:sn.savedAt,
          buyAmt,sellAmt,brokerage,
          pnl:sellAmt-buyAmt,
          returnPct:buyAmt>0?((sellAmt-buyAmt)/buyAmt*100):0,
          pnlNet:sellAmt-buyAmt-brokerage,
          returnNetPct:buyAmt>0?(((sellAmt-buyAmt-brokerage)/buyAmt)*100):0,
        });
      });
    });
    return list;
  },[shares,soldShareSnapshots]);

  /* ── Report 3: XIRR per trade ── */
  const tradesWithXirr=React.useMemo(()=>{
    return trades.map(t=>{
      let xirr=null;
      if(t.buyDate&&t.sellDate&&t.buyDate<t.sellDate){
        xirr=computeXIRR([-t.buyAmt,t.sellAmt],[t.buyDate,t.sellDate]);
      }
      return{...t,xirr};
    });
  },[trades]);

  /* ── Report 5: Overall XIRR across all trades ── */
  const overallXirr=React.useMemo(()=>{
    if(!trades.length)return null;
    const cfs=[];const dts=[];
    trades.forEach(t=>{
      cfs.push(-t.buyAmt);dts.push(t.buyDate);
      cfs.push(t.sellAmt);dts.push(t.sellDate);
    });
    return computeXIRR(cfs,dts);
  },[trades]);

  /* ── Report 5b: Overall XIRR brokerage-adjusted ── */
  const overallXirrNet=React.useMemo(()=>{
    if(!trades.length)return null;
    const hasBrokerage=trades.some(t=>t.brokerage>0);
    if(!hasBrokerage)return null;
    const cfs=[];const dts=[];
    trades.forEach(t=>{
      cfs.push(-(t.buyAmt+t.brokerage));dts.push(t.buyDate);
      cfs.push(t.sellAmt);dts.push(t.sellDate);
    });
    return computeXIRR(cfs,dts);
  },[trades]);

  /* ── Report 7: Time-Weighted vs Money-Weighted Return ── */
  const twrData=React.useMemo(()=>{
    if(trades.length<2)return null;
    const sorted=[...trades].sort((a,b)=>(a.sellDate||"").localeCompare(b.sellDate||""));
    const mwr=overallXirr;
    let cumGrowth=1;
    sorted.forEach(t=>{
      const periodReturn=t.buyAmt>0?(t.pnl/t.buyAmt):0;
      cumGrowth*=(1+periodReturn);
    });
    const twr=(cumGrowth-1)*100;
    const firstBuy=sorted[0].buyDate;
    const lastSell=sorted[sorted.length-1].sellDate;
    const totalDays=firstBuy&&lastSell?Math.max(1,Math.floor((new Date(lastSell+"T12:00:00")-new Date(firstBuy+"T12:00:00"))/864e5)):365;
    const years=totalDays/365.25;
    const twrAnnualized=years>0?(Math.pow(cumGrowth,1/years)-1)*100:twr;
    const mwrAnnualized=mwr;
    const divergence=mwrAnnualized!==null?mwrAnnualized-twrAnnualized:null;
    let interpretation="";
    if(divergence!==null){
      if(Math.abs(divergence)<1){interpretation="TWR and MWR are closely aligned — your timing of investments has minimal impact on returns.";}
      else if(divergence>0){interpretation="MWR > TWR — you tend to invest more money before good periods. Your timing adds value.";}
      else{interpretation="MWR < TWR — you tend to invest more money before bad periods. Consider smoothing entry timing (e.g., SIP).";}
    }
    return{twr,twrAnnualized,mwrAnnualized,divergence,totalDays,years,tradeCount:sorted.length,interpretation};
  },[trades,overallXirr]);

  /* ── Report 6: Rolling 12-month realised gains ── */
  const rollingGains=React.useMemo(()=>{
    const soldTrades=trades.filter(t=>t.type==="sold"&&t.sellDate);
    if(!soldTrades.length)return[];
    const monthMap={};
    soldTrades.forEach(t=>{
      const sellMonth=t.sellDate.slice(0,7); /* YYYY-MM */
      if(!monthMap[sellMonth])monthMap[sellMonth]={pnl:0,count:0,netPnl:0};
      monthMap[sellMonth].pnl+=t.pnl;
      monthMap[sellMonth].netPnl+=t.pnlNet;
      monthMap[sellMonth].count++;
    });
    const months=Object.keys(monthMap).sort();
    if(!months.length)return[];
    /* Build rolling 12-month windows */
    const result=[];
    for(let i=0;i<months.length;i++){
      const windowEnd=months[i];
      const windowStart=new Date(new Date(windowEnd+"-01").getTime()-365*864e5).toISOString().slice(0,7);
      let totalPnl=0,totalNet=0,totalCount=0;
      months.forEach(m=>{
        if(m>windowStart&&m<=windowEnd){
          totalPnl+=monthMap[m].pnl;
          totalNet+=monthMap[m].netPnl;
          totalCount+=monthMap[m].count;
        }
      });
      result.push({month:windowEnd,pnl:totalPnl,netPnl:totalNet,count:totalCount});
    }
    return result;
  },[trades]);

  /* ── Aggregate stats ── */
  const totalPnl=trades.reduce((s,t)=>s+t.pnl,0);
  const totalPnlNet=trades.reduce((s,t)=>s+t.pnlNet,0);
  const totalBuy=trades.reduce((s,t)=>s+t.buyAmt,0);
  const totalBrokerage=trades.reduce((s,t)=>s+t.brokerage,0);
  const winners=trades.filter(t=>t.pnl>0).length;
  const losers=trades.filter(t=>t.pnl<0).length;
  const winRate=trades.length>0?((winners/trades.length)*100).toFixed(1):"0.0";
  const avgReturn=trades.length>0?(trades.reduce((s,t)=>s+t.returnPct,0)/trades.length).toFixed(2):"0.00";

  /* ── Sorting ── */
  const sortedTrades=[...tradesWithXirr].sort((a,b)=>{
    let va,vb;
    if(sortBy==="pnl"){va=a.pnl;vb=b.pnl;}
    else if(sortBy==="returnPct"){va=a.returnPct;vb=b.returnPct;}
    else if(sortBy==="xirr"){va=a.xirr??-Infinity;vb=b.xirr??-Infinity;}
    else{va=a.pnl;vb=b.pnl;}
    return sortDir==="desc"?vb-va:va-vb;
  });

  /* ── Sortable column header helper ── */
  const SortHdr=({label,field,align})=>React.createElement("div",{
    onClick:()=>{if(sortBy===field)setSortDir(d=>d==="desc"?"asc":"desc");else{setSortBy(field);setSortDir("desc");}},
    style:{
      fontSize:9,fontWeight:700,color:sortBy===field?"var(--accent)":"var(--text6)",
      textTransform:"uppercase",letterSpacing:.7,cursor:"pointer",
      display:"flex",alignItems:"center",gap:3,justifyContent:align||"flex-start",
      padding:"6px 8px",
    }
  },label,sortBy===field&&React.createElement("span",{style:{fontSize:8}},sortDir==="desc"?"▼":"▲"));

  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"invest",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to Previous Trades to see profitability analytics.")
  );

  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},
    /* ══ Summary Stat Cards ══ */
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12}},
      /* Total P&L */
      React.createElement("div",{style:{background:totalPnl>=0?"rgba(22,163,74,.07)":"rgba(239,68,68,.07)",border:"1px solid "+(totalPnl>=0?"rgba(22,163,74,.2)":"rgba(239,68,68,.2)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Total P&L"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:totalPnl>=0?"#16a34a":"#ef4444"}},(totalPnl>=0?"+":"")+INR(totalPnl)),
        totalBrokerage>0&&React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Net: "+(totalPnlNet>=0?"+":"")+INR(totalPnlNet))
      ),
      /* Overall XIRR */
      overallXirr!==null&&React.createElement("div",{style:{background:"rgba(109,40,217,.07)",border:"1px solid rgba(109,40,217,.2)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Overall XIRR"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:overallXirr>=0?"#6d28d9":"#ef4444"}},(overallXirr>=0?"+":"")+overallXirr.toFixed(2)+"%"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Money-weighted p.a.")
      ),
      /* Win Rate */
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Win Rate"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},"%"+winRate),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},winners+"W / "+losers+"L of "+trades.length+" trades")
      ),
      /* Avg Return */
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Avg Return / Trade"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:+avgReturn>=0?"#16a34a":"#ef4444"}},(+avgReturn>=0?"+":"")+avgReturn+"%"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Mean return across all trades")
      ),
      /* Brokerage Total */
      totalBrokerage>0&&React.createElement("div",{style:{background:"rgba(245,158,11,.07)",border:"1px solid rgba(245,158,11,.2)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Total Brokerage"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#f59e0b"}},"-"+INR(totalBrokerage)),
        overallXirrNet!==null&&React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Adj. XIRR: "+(overallXirrNet>=0?"+":"")+overallXirrNet.toFixed(2)+"% p.a.")
      )
    ),

    /* ══ Report 1+2+3+4: Per-Trade Table ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      /* Table header */
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"chart",size:15}),"Per-Trade Profitability"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},trades.length+" trades")
      ),
      /* Desktop table */
      React.createElement("div",{className:"mobile-scroll-table",style:{overflowX:"auto"}},
        React.createElement("div",{style:{minWidth:820}},
          /* Column headers */
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"2fr 80px 90px 90px 100px 90px 90px 90px 80px",gap:0,borderBottom:"1px solid var(--border)",background:"var(--bg4)"}},
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px"}},"Trade"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"Qty"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Buy ₹"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Sell ₹"),
            React.createElement(SortHdr,{label:"Abs P&L",field:"pnl",align:"right"}),
            React.createElement(SortHdr,{label:"Return %",field:"returnPct",align:"right"}),
            React.createElement(SortHdr,{label:"XIRR p.a.",field:"xirr",align:"right"}),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Brokerage"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"Status")
          ),
          /* Rows */
          sortedTrades.map((t,i)=>{
            const isGain=t.pnl>=0;
            return React.createElement("div",{key:t.id||i,style:{display:"grid",gridTemplateColumns:"2fr 80px 90px 90px 100px 90px 90px 90px 80px",gap:0,borderBottom:"1px solid var(--border2)",background:i%2===0?"transparent":"var(--bg4)",transition:"background .1s"},onMouseEnter:e=>e.currentTarget.style.background="var(--accentbg2)",onMouseLeave:e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--bg4)"},
              /* Trade name */
              React.createElement("div",{style:{padding:"9px 8px",display:"flex",flexDirection:"column",gap:2,minWidth:0}},
                React.createElement("div",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},t.company),
                React.createElement("div",{style:{display:"flex",gap:4,alignItems:"center"}},
                  React.createElement("span",{style:{fontSize:9,padding:"1px 5px",borderRadius:4,background:"rgba(14,116,144,.1)",color:"#0e7490",fontWeight:600}},t.ticker||"—"),
                  React.createElement("span",{style:{fontSize:9,color:"var(--text6)"}},t.buyDate)
                )
              ),
              /* Qty */
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"center",color:"var(--text3)"}},t.qty),
              /* Buy price */
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",color:"var(--text4)",fontFamily:"'DM Mono',monospace"}},"₹"+Number(t.buyPrice).toLocaleString("en-IN")),
              /* Sell price */
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",color:isGain?"#16a34a":"#ef4444",fontFamily:"'DM Mono',monospace",fontWeight:600}},"₹"+Number(t.sellPrice).toLocaleString("en-IN")),
              /* Absolute P&L (Report 1) */
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"right",fontWeight:700,fontFamily:"'Sora',sans-serif",color:isGain?"#16a34a":"#ef4444"}},(isGain?"+":"")+INR(t.pnl)),
              /* Return % (Report 2) */
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",fontWeight:600,color:isGain?"#16a34a":"#ef4444"}},(t.returnPct>=0?"+":"")+t.returnPct.toFixed(2)+"%"),
              /* XIRR (Report 3) */
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",fontWeight:600,color:t.xirr!==null?(t.xirr>=0?"#16a34a":"#ef4444"):"var(--text6)"}},t.xirr!==null?(t.xirr>=0?"+":"")+t.xirr.toFixed(2)+"%":"—"),
              /* Brokerage (Report 4) */
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",color:t.brokerage>0?"#f59e0b":"var(--text6)"}},t.brokerage>0?"-"+INR(t.brokerage):"—"),
              /* Status badge */
              React.createElement("div",{style:{padding:"9px 8px",display:"flex",justifyContent:"center",alignItems:"center"}},
                React.createElement("span",{style:{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:6,
                  background:t.type==="sold"?"rgba(109,40,217,.1)":"rgba(22,163,74,.1)",
                  color:t.type==="sold"?"#6d28d9":"#16a34a",
                  border:"1px solid "+(t.type==="sold"?"rgba(109,40,217,.25)":"rgba(22,163,74,.25)")
                }},t.type==="sold"?"SOLD":"ACTIVE")
              )
            );
          })
        )
      ),
      /* Brokerage-adjusted row (Report 4) — shown below table when brokerage exists */
      totalBrokerage>0&&React.createElement("div",{style:{padding:"10px 16px",borderTop:"1px solid var(--border)",background:"rgba(245,158,11,.04)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}},
        React.createElement("span",{style:{fontSize:11,color:"#f59e0b",fontWeight:600,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"lightbulb",size:12,color:"#f59e0b"}),"Brokerage-Adjusted Returns:"),
        React.createElement("span",{style:{fontSize:11,color:"var(--text4)"}},"Gross P&L: "+(totalPnl>=0?"+":"")+INR(totalPnl)),
        React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}}," → "),
        React.createElement("span",{style:{fontSize:11,color:"var(--text3)",fontWeight:600}},"Net P&L: "+(totalPnlNet>=0?"+":"")+INR(totalPnlNet)),
        React.createElement("span",{style:{fontSize:10,color:"var(--text6)"}}," (after "+INR(totalBrokerage)+" brokerage)")
      )
    ),

    /* ══ Report 5: Overall XIRR Detail ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"money",size:15}),"Overall XIRR (Money-Weighted)"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"rgba(109,40,217,.1)",color:"#6d28d9",border:"1px solid rgba(109,40,217,.2)",fontWeight:600}},"All trades combined")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16}},
        /* Gross XIRR */
        overallXirr!==null?React.createElement("div",{style:{textAlign:"center",padding:16,background:overallXirr>=0?"rgba(22,163,74,.06)":"rgba(239,68,68,.06)",border:"1px solid "+(overallXirr>=0?"rgba(22,163,74,.18)":"rgba(239,68,68,.18)"),borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:1,marginBottom:6}},"Gross XIRR"),
          React.createElement("div",{style:{fontSize:32,fontFamily:"'Sora',sans-serif",fontWeight:800,color:overallXirr>=0?"#16a34a":"#ef4444",lineHeight:1.1}},(overallXirr>=0?"+":"")+overallXirr.toFixed(2)+"%"),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginTop:4}},"p.a. money-weighted")
        ):React.createElement("div",{style:{textAlign:"center",padding:16,color:"var(--text6)",fontSize:13}},"Insufficient data for XIRR"),
        /* Net XIRR */
        overallXirrNet!==null&&React.createElement("div",{style:{textAlign:"center",padding:16,background:overallXirrNet>=0?"rgba(245,158,11,.06)":"rgba(239,68,68,.06)",border:"1px solid "+(overallXirrNet>=0?"rgba(245,158,11,.18)":"rgba(239,68,68,.18)"),borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:1,marginBottom:6}},"Net XIRR (after brokerage)"),
          React.createElement("div",{style:{fontSize:32,fontFamily:"'Sora',sans-serif",fontWeight:800,color:overallXirrNet>=0?"#f59e0b":"#ef4444",lineHeight:1.1}},(overallXirrNet>=0?"+":"")+overallXirrNet.toFixed(2)+"%"),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginTop:4}},"p.a. brokerage-adjusted")
        ),
        /* Trade count + total invested */
        React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12}},
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Total Trades"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)"}},trades.length)
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Total Invested"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)"}},"₹"+Number(totalBuy).toLocaleString("en-IN"))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Date Range"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text3)"}},trades.length?trades.reduce((m,t)=>t.buyDate<m?t.buyDate:m,"9999")+" → "+trades.reduce((m,t)=>t.sellDate>m?t.sellDate:m,"0000"):"—")
          )
        )
      )
    ),

    /* ══ Report 6: Rolling 12-Month Realised Gains ══ */
    rollingGains.length>0&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"calendar",size:15}),"Rolling 12-Month Realised Gains"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},rollingGains.length+" windows")
      ),
      React.createElement("div",{style:{padding:"12px 16px"}},
        /* Bar chart — horizontal bars */
        React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8}},
          (()=>{
            const maxAbs=Math.max(...rollingGains.map(g=>Math.abs(g.pnl)),1);
            return rollingGains.map((g,i)=>{
              const isGain=g.pnl>=0;
              const barW=Math.min(100,(Math.abs(g.pnl)/maxAbs)*85);
              return React.createElement("div",{key:g.month,style:{display:"flex",alignItems:"center",gap:10}},
                React.createElement("div",{style:{width:70,fontSize:11,fontWeight:600,color:"var(--text4)",flexShrink:0,textAlign:"right"}},g.month),
                React.createElement("div",{style:{flex:1,height:24,background:"var(--bg5)",borderRadius:6,overflow:"hidden",position:"relative"}},
                  React.createElement("div",{style:{
                    height:"100%",width:barW+"%",
                    background:isGain?"linear-gradient(90deg,rgba(22,163,74,.25),rgba(22,163,74,.5))":"linear-gradient(90deg,rgba(239,68,68,.25),rgba(239,68,68,.5))",
                    borderRadius:6,transition:"width .5s",
                    display:"flex",alignItems:"center",paddingLeft:8,
                  }},
                    React.createElement("span",{style:{fontSize:10,fontWeight:700,color:isGain?"#16a34a":"#ef4444",whiteSpace:"nowrap"}},
                      (isGain?"+":"")+INR(g.pnl)
                    )
                  )
                ),
                React.createElement("div",{style:{width:55,fontSize:10,color:"var(--text6)",textAlign:"right"}},g.count+" trade"+(g.count!==1?"s":""))
              );
            });
          })()
        ),
        /* Net row */
        totalBrokerage>0&&React.createElement("div",{style:{marginTop:12,padding:"8px 12px",background:"rgba(245,158,11,.05)",border:"1px solid rgba(245,158,11,.15)",borderRadius:8,fontSize:11,color:"var(--text4)",display:"flex",justifyContent:"space-between"}},
          React.createElement("span",null,"Brokerage-adjusted net may differ from gross shown above"),
          React.createElement("span",{style:{fontWeight:600,color:"#f59e0b"}},"Total brokerage: -"+INR(totalBrokerage))
        )
      )
    ),


    /* ══ Report 7: Time-Weighted vs Money-Weighted Returns ══ */
    twrData&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},
          React.createElement(Icon,{n:"clock",size:15}),"Time-Weighted vs Money-Weighted Returns"
        ),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},
          twrData.tradeCount+" trades · "+twrData.years.toFixed(1)+"y span"
        )
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}},
          React.createElement("div",{style:{background:"rgba(14,116,144,.07)",border:"1px solid rgba(14,116,144,.2)",borderRadius:12,padding:"14px 16px"}},
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Time-Weighted Return (TWR)"),
            React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#0e7490"}},ret(twrData.twrAnnualized)+" p.a."),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Geometric chain of per-trade returns")
          ),
          React.createElement("div",{style:{background:"rgba(109,40,217,.07)",border:"1px solid rgba(109,40,217,.2)",borderRadius:12,padding:"14px 16px"}},
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Money-Weighted Return (MWR)"),
            React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#6d28d9"}},twrData.mwrAnnualized!==null?ret(twrData.mwrAnnualized)+" p.a.":"—"),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"XIRR — larger trades have more weight")
          )
        ),
        twrData.divergence!==null&&React.createElement("div",{style:{
          display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:10,
          background:Math.abs(twrData.divergence)<1?"rgba(22,163,74,.06)":twrData.divergence>0?"rgba(14,116,144,.06)":"rgba(239,68,68,.06)",
          border:"1px solid "+(Math.abs(twrData.divergence)<1?"rgba(22,163,74,.15)":twrData.divergence>0?"rgba(14,116,144,.15)":"rgba(239,68,68,.15)"),
          marginBottom:12
        }},
          React.createElement(Icon,{n:Math.abs(twrData.divergence)<1?"checkcircle":twrData.divergence>0?"invest":"warning",size:16,color:Math.abs(twrData.divergence)<1?"#16a34a":twrData.divergence>0?"#0e7490":"#ef4444"}),
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:12,fontWeight:700,color:Math.abs(twrData.divergence)<1?"#16a34a":twrData.divergence>0?"#0e7490":"#ef4444"}},"Divergence: "+(twrData.divergence>0?"+":"")+twrData.divergence.toFixed(2)+"% p.a."),
            React.createElement("div",{style:{fontSize:11,color:"var(--text4)",marginTop:2}},twrData.interpretation)
          )
        ),
        React.createElement("div",{style:{fontSize:11,color:"var(--text5)",lineHeight:1.6,padding:"8px 12px",background:"var(--bg5)",borderRadius:8}},
          React.createElement("strong",null,"Why do they differ? "),"TWR measures compound growth regardless of how much money was invested at each point — it answers 'how did my strategy perform?' MWR (XIRR) accounts for the timing and size of cash flows — it answers 'what return did my actual dollars earn?' If MWR > TWR, you invested larger amounts before winning trades. If MWR < TWR, larger investments preceded losing trades."
        )
      )
    ),

    /* ══ Methodology note ══ */
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "XIRR (Extended Internal Rate of Return) accounts for the exact timing of cash flows, making it the gold standard for comparing trades with different holding periods. A 20% gain in 3 months shows a much higher XIRR than the same gain over 3 years. Overall XIRR is money-weighted — larger trades have more influence. Rolling 12-month windows show trailing realised gains ending each month. Time-Weighted Return (TWR) geometrically chains per-trade returns, eliminating the effect of cash flow timing. Money-Weighted Return (MWR/XIRR) weights returns by capital deployed. Divergence reveals whether investment timing helps or hurts."
    )
  );
};


const TimeHoldingAnalysis=({shares,soldShareSnapshots={}})=>{

  /* ── Build unified trade list with computed fields ── */
  const trades=React.useMemo(()=>{
    const list=[];
    (shares||[]).forEach(sh=>{
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      const buyDate=new Date(sh.buyDate+"T12:00:00");
      const sellDate=new Date(TODAY()+"T12:00:00");
      const holdDays=Math.floor((sellDate-buyDate)/864e5);
      if(holdDays<0)return;
      const buyAmt=sh.qty*sh.buyPrice;
      const sellAmt=sh.qty*sh.currentPrice;
      list.push({
        id:sh.id,type:"active",company:sh.company,ticker:sh.ticker,
        qty:sh.qty,buyPrice:sh.buyPrice,sellPrice:sh.currentPrice,
        buyDateStr:sh.buyDate,sellDateStr:TODAY(),
        buyDate,sellDate,holdDays,
        buyAmt,sellAmt,pnl:sellAmt-buyAmt,
        returnPct:buyAmt>0?((sellAmt-buyAmt)/buyAmt*100):0,
        buyMonth:buyDate.getMonth(), /* 0-11 */
        buyQuarter:Math.floor(buyDate.getMonth()/3), /* 0-3 */
      });
    });
    Object.values(soldShareSnapshots||{}).forEach(fySnaps=>{
      (fySnaps||[]).forEach(sn=>{
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate||!sn.savedAt)return;
        const buyDate=new Date(sn.buyDate+"T12:00:00");
        const sellDate=new Date(sn.savedAt+"T12:00:00");
        const holdDays=Math.floor((sellDate-buyDate)/864e5);
        if(holdDays<0)return;
        const buyAmt=sn.qty*sn.buyPrice;
        const sellAmt=sn.qty*sn.sellPrice;
        list.push({
          id:sn.id,type:"sold",company:sn.company,ticker:sn.ticker,
          qty:sn.qty,buyPrice:sn.buyPrice,sellPrice:sn.sellPrice,
          buyDateStr:sn.buyDate,sellDateStr:sn.savedAt,
          buyDate,sellDate,holdDays,
          buyAmt,sellAmt,pnl:sellAmt-buyAmt,
          returnPct:buyAmt>0?((sellAmt-buyAmt)/buyAmt*100):0,
          buyMonth:buyDate.getMonth(),
          buyQuarter:Math.floor(buyDate.getMonth()/3),
        });
      });
    });
    return list;
  },[shares,soldShareSnapshots]);

  /* ── Report 1: Holding duration distribution (histogram) ── */
  const durationHistogram=React.useMemo(()=>{
    if(!trades.length)return[];
    const buckets=[
      {label:"< 1 week",min:0,max:7,count:0,pnl:0},
      {label:"1–2 weeks",min:7,max:14,count:0,pnl:0},
      {label:"2–4 weeks",min:14,max:30,count:0,pnl:0},
      {label:"1–3 months",min:30,max:91,count:0,pnl:0},
      {label:"3–6 months",min:91,max:183,count:0,pnl:0},
      {label:"6–12 months",min:183,max:365,count:0,pnl:0},
      {label:"1–2 years",min:365,max:730,count:0,pnl:0},
      {label:"2+ years",min:730,max:Infinity,count:0,pnl:0},
    ];
    trades.forEach(t=>{
      const b=buckets.find(b=>t.holdDays>=b.min&&t.holdDays<b.max);
      if(b){b.count++;b.pnl+=t.pnl;}
    });
    return buckets;
  },[trades]);

  /* ── Report 2+5: Average holding period per stock ── */
  const holdByStock=React.useMemo(()=>{
    const map={};
    trades.forEach(t=>{
      const key=t.ticker||t.company;
      if(!map[key])map[key]={ticker:t.ticker,company:t.company,totalDays:0,count:0,totalPnl:0,totalReturn:0,totalBuyAmt:0,minDays:Infinity,maxDays:0};
      map[key].totalDays+=t.holdDays;
      map[key].count++;
      map[key].totalPnl+=t.pnl;
      map[key].totalReturn+=t.returnPct;
      map[key].totalBuyAmt+=t.buyAmt;
      map[key].minDays=Math.min(map[key].minDays,t.holdDays);
      map[key].maxDays=Math.max(map[key].maxDays,t.holdDays);
    });
    return Object.values(map).map(s=>({
      ...s,
      avgDays:Math.round(s.totalDays/s.count),
      avgReturn:(s.totalReturn/s.count).toFixed(2),
    })).sort((a,b)=>b.avgDays-a.avgDays);
  },[trades]);

  /* ── Report 3: Best/worst month to buy ── */
  const monthAnalysis=React.useMemo(()=>{
    const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const data=months.map((name,i)=>{
      const monthTrades=trades.filter(t=>t.buyMonth===i);
      if(!monthTrades.length)return{name,month:i,count:0,avgReturn:0,totalPnl:0,winRate:0};
      const avgReturn=monthTrades.reduce((s,t)=>s+t.returnPct,0)/monthTrades.length;
      const totalPnl=monthTrades.reduce((s,t)=>s+t.pnl,0);
      const wins=monthTrades.filter(t=>t.pnl>0).length;
      return{name,month:i,count:monthTrades.length,avgReturn,totalPnl,winRate:(wins/monthTrades.length*100)};
    });
    return data;
  },[trades]);

  /* ── Report 4: Seasonality patterns (by quarter) ── */
  const quarterAnalysis=React.useMemo(()=>{
    const qLabels=["Q1 (Jan–Mar)","Q2 (Apr–Jun)","Q3 (Jul–Sep)","Q4 (Oct–Dec)"];
    return qLabels.map((label,i)=>{
      const qTrades=trades.filter(t=>t.buyQuarter===i);
      if(!qTrades.length)return{label,q:i,count:0,avgReturn:0,totalPnl:0,winRate:0,avgHoldDays:0};
      const avgReturn=qTrades.reduce((s,t)=>s+t.returnPct,0)/qTrades.length;
      const totalPnl=qTrades.reduce((s,t)=>s+t.pnl,0);
      const wins=qTrades.filter(t=>t.pnl>0).length;
      const avgHoldDays=Math.round(qTrades.reduce((s,t)=>s+t.holdDays,0)/qTrades.length);
      return{label,q:i,count:qTrades.length,avgReturn,totalPnl,winRate:(wins/qTrades.length*100),avgHoldDays};
    });
  },[trades]);

  /* ── Report 6: Position sizing patterns ── */
  const positionSizing=React.useMemo(()=>{
    if(trades.length<2)return null;
    /* Sort by buyAmt to find small vs large positions */
    const sorted=[...trades].sort((a,b)=>a.buyAmt-b.buyAmt);
    const median=sorted[Math.floor(sorted.length/2)].buyAmt;
    const small=sorted.filter(t=>t.buyAmt<=median);
    const large=sorted.filter(t=>t.buyAmt>median);
    const calcStats=(arr)=>{
      if(!arr.length)return{count:0,avgSize:0,avgReturn:0,winRate:0,totalPnl:0};
      const avgSize=arr.reduce((s,t)=>s+t.buyAmt,0)/arr.length;
      const avgReturn=arr.reduce((s,t)=>s+t.returnPct,0)/arr.length;
      const wins=arr.filter(t=>t.pnl>0).length;
      return{count:arr.length,avgSize,avgReturn,winRate:(wins/arr.length*100),totalPnl:arr.reduce((s,t)=>s+t.pnl,0)};
    };
    /* Correlation: does position size predict return? */
    const n=trades.length;
    const xs=trades.map(t=>t.buyAmt);
    const ys=trades.map(t=>t.returnPct);
    const mx=xs.reduce((a,b)=>a+b,0)/n;
    const my=ys.reduce((a,b)=>a+b,0)/n;
    let num=0,denX=0,denY=0;
    for(let i=0;i<n;i++){num+=(xs[i]-mx)*(ys[i]-my);denX+=(xs[i]-mx)**2;denY+=(ys[i]-my)**2;}
    const correlation=(denX>0&&denY>0)?num/Math.sqrt(denX*denY):0;
    return{small:calcStats(small),large:calcStats(large),median,correlation};
  },[trades]);

  /* ── Overall stats ── */
  const avgHoldAll=trades.length?Math.round(trades.reduce((s,t)=>s+t.holdDays,0)/trades.length):0;
  const medianHold=trades.length?[...trades].sort((a,b)=>a.holdDays-b.holdDays)[Math.floor(trades.length/2)].holdDays:0;

  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"clock",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to see time & holding pattern analysis.")
  );

  /* ── Helpers ── */
  const fmtDays=(d)=>{
    if(d<7)return d+"d";
    if(d<30)return Math.round(d/7)+"w";
    if(d<365)return(Math.round(d/30.4))+"mo";
    return(d/365.25).toFixed(1)+"y";
  };
  const MONTH_NAMES=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},
    /* ══ Top summary strip ══ */
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:12}},
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"13px 15px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Avg Hold Period"),
        React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},fmtDays(avgHoldAll)),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},avgHoldAll+" days · "+trades.length+" trades")
      ),
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"13px 15px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Median Hold Period"),
        React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},fmtDays(medianHold)),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},medianHold+" days")
      ),
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"13px 15px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Shortest Hold"),
        React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},fmtDays(Math.min(...trades.map(t=>t.holdDays)))),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"fastest exit")
      ),
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"13px 15px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Longest Hold"),
        React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},fmtDays(Math.max(...trades.map(t=>t.holdDays)))),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"longest conviction")
      )
    ),

    /* ══ Report 1: Holding Duration Distribution (Histogram) ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"chart",size:15}),"Holding Duration Distribution"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},"histogram")
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        (()=>{
          const maxCount=Math.max(...durationHistogram.map(b=>b.count),1);
          return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8}},
            durationHistogram.map((b,i)=>{
              const barW=(b.count/maxCount)*100;
              const avgPnl=b.count>0?(b.pnl/b.count):0;
              const isGain=avgPnl>=0;
              return React.createElement("div",{key:b.label,style:{display:"flex",alignItems:"center",gap:10}},
                React.createElement("div",{style:{width:90,fontSize:11,fontWeight:600,color:"var(--text4)",flexShrink:0,textAlign:"right"}},b.label),
                React.createElement("div",{style:{flex:1,height:28,background:"var(--bg5)",borderRadius:6,overflow:"hidden",position:"relative"}},
                  b.count>0&&React.createElement("div",{style:{
                    height:"100%",width:barW+"%",
                    background:b.pnl>=0?"linear-gradient(90deg,rgba(22,163,74,.2),rgba(22,163,74,.45))":"linear-gradient(90deg,rgba(239,68,68,.2),rgba(239,68,68,.45))",
                    borderRadius:6,transition:"width .5s",
                    display:"flex",alignItems:"center",paddingLeft:8,
                  }},
                    React.createElement("span",{style:{fontSize:10,fontWeight:700,color:isGain?"#16a34a":"#ef4444",whiteSpace:"nowrap"}},b.count+" trade"+(b.count!==1?"s":""))
                  )
                ),
                React.createElement("div",{style:{width:80,fontSize:10,color:"var(--text6)",textAlign:"right"}},b.count>0?"Avg: "+(isGain?"+":"")+INR(Math.round(avgPnl)):"—")
              );
            })
          );
        })()
      )
    ),

    /* ══ Report 2+5: Average Holding Period Per Stock ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"building",size:15}),"Avg Holding Period Per Stock"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"rgba(109,40,217,.1)",color:"#6d28d9",border:"1px solid rgba(109,40,217,.2)",fontWeight:600}},"conviction level")
      ),
      React.createElement("div",{className:"mobile-scroll-table",style:{overflowX:"auto"}},
        React.createElement("div",{style:{minWidth:600}},
          /* Header */
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"2fr 80px 80px 90px 80px 80px",gap:0,borderBottom:"1px solid var(--border)",background:"var(--bg4)"}},
            ["Stock","Trades","Avg Days","Avg Return","Min","Max"].map(h=>
              React.createElement("div",{key:h,style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:h==="Stock"?"left":"right"}},h)
            )
          ),
          holdByStock.map((s,i)=>{
            const avgRet=+s.avgReturn;
            return React.createElement("div",{key:s.ticker||s.company,style:{display:"grid",gridTemplateColumns:"2fr 80px 80px 90px 80px 80px",gap:0,borderBottom:"1px solid var(--border2)",background:i%2===0?"transparent":"var(--bg4)",transition:"background .1s"},onMouseEnter:e=>e.currentTarget.style.background="var(--accentbg2)",onMouseLeave:e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--bg4)"},
              React.createElement("div",{style:{padding:"9px 8px",display:"flex",flexDirection:"column",gap:2}},
                React.createElement("div",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},s.company),
                React.createElement("span",{style:{fontSize:9,padding:"1px 5px",borderRadius:4,background:"rgba(14,116,144,.1)",color:"#0e7490",fontWeight:600,width:"fit-content"}},s.ticker||"—")
              ),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"right",color:"var(--text3)"}},s.count),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"right",fontWeight:600,color:"var(--text)"}},fmtDays(s.avgDays)),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",fontWeight:600,color:avgRet>=0?"#16a34a":"#ef4444"}},(avgRet>=0?"+":"")+avgRet+"%"),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:10,textAlign:"right",color:"var(--text6)"}},fmtDays(s.minDays)),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:10,textAlign:"right",color:"var(--text6)"}},fmtDays(s.maxDays))
            );
          })
        )
      )
    ),

    /* ══ Report 3: Best/Worst Month to Buy ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"calendar",size:15}),"Best / Worst Month to Buy"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},"entry month analysis")
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        (()=>{
          const activeMonths=monthAnalysis.filter(m=>m.count>0);
          if(!activeMonths.length)return React.createElement("div",{style:{textAlign:"center",padding:20,color:"var(--text6)",fontSize:13}},"No data yet");
          const bestMonth=activeMonths.reduce((a,b)=>a.avgReturn>b.avgReturn?a:b);
          const worstMonth=activeMonths.reduce((a,b)=>a.avgReturn<b.avgReturn?a:b);
          const maxAbs=Math.max(...activeMonths.map(m=>Math.abs(m.avgReturn)),1);
          return React.createElement(React.Fragment,null,
            /* Best/Worst callout */
            React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}},
              React.createElement("div",{style:{padding:"12px 14px",borderRadius:10,background:"rgba(22,163,74,.06)",border:"1px solid rgba(22,163,74,.18)"}},
                React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:4}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"target",size:13})," Best Month to Buy")),
                React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#16a34a"}},bestMonth.name),
                React.createElement("div",{style:{fontSize:11,color:"var(--text4)",marginTop:2}},"Avg return: "+(bestMonth.avgReturn>=0?"+":"")+bestMonth.avgReturn.toFixed(2)+"% · "+bestMonth.count+" trades")
              ),
              React.createElement("div",{style:{padding:"12px 14px",borderRadius:10,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.18)"}},
                React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"#ef4444",textTransform:"uppercase",letterSpacing:1,marginBottom:4}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"warning",size:13})," Worst Month to Buy")),
                React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#ef4444"}},worstMonth.name),
                React.createElement("div",{style:{fontSize:11,color:"var(--text4)",marginTop:2}},"Avg return: "+(worstMonth.avgReturn>=0?"+":"")+worstMonth.avgReturn.toFixed(2)+"% · "+worstMonth.count+" trades")
              )
            ),
            /* Monthly bars */
            React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:6}},
              monthAnalysis.map((m,i)=>{
                const barW=m.count>0?(Math.abs(m.avgReturn)/maxAbs)*85:0;
                const isGain=m.avgReturn>=0;
                return React.createElement("div",{key:m.name,style:{display:"flex",alignItems:"center",gap:8}},
                  React.createElement("div",{style:{width:30,fontSize:11,fontWeight:600,color:"var(--text4)",flexShrink:0,textAlign:"right"}},m.name),
                  React.createElement("div",{style:{flex:1,height:22,background:"var(--bg5)",borderRadius:5,overflow:"hidden",position:"relative",display:"flex",alignItems:"center"}},
                    m.count>0&&React.createElement("div",{style:{
                      height:"100%",width:barW+"%",
                      background:isGain?"linear-gradient(90deg,rgba(22,163,74,.2),rgba(22,163,74,.4))":"linear-gradient(90deg,rgba(239,68,68,.2),rgba(239,68,68,.4))",
                      borderRadius:5,transition:"width .5s",
                      display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:6,
                    }},
                      React.createElement("span",{style:{fontSize:9,fontWeight:700,color:isGain?"#16a34a":"#ef4444",whiteSpace:"nowrap"}},(isGain?"+":"")+m.avgReturn.toFixed(1)+"%")
                    ),
                    m.count===0&&React.createElement("span",{style:{fontSize:9,color:"var(--text6)",paddingLeft:8}},"no trades")
                  ),
                  React.createElement("div",{style:{width:45,fontSize:10,color:"var(--text6)",textAlign:"right"}},m.count>0?m.count+" trades":"—"),
                  React.createElement("div",{style:{width:38,fontSize:9,textAlign:"right",fontWeight:600,color:m.winRate>=50?"#16a34a":"#ef4444"}},m.count>0?Math.round(m.winRate)+"%":"")
                );
              })
            )
          );
        })()
      )
    ),

    /* ══ Report 4: Seasonality Patterns (Quarterly) ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"calendar",size:15}),"Seasonality Patterns — Winners by Quarter"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},"do winners cluster?")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}},
        quarterAnalysis.map(q=>{
          const hasData=q.count>0;
          const isGain=q.avgReturn>=0;
          const qCol=["#3b82f6","#f59e0b","#10b981","#8b5cf6"][q.q];
          return React.createElement("div",{key:q.q,style:{
            padding:"14px 16px",borderRadius:12,
            background:hasData?(isGain?"rgba(22,163,74,.04)":"rgba(239,68,68,.04)"):"var(--bg4)",
            border:"1px solid "+(hasData?(isGain?"rgba(22,163,74,.15)":"rgba(239,68,68,.15)"):"var(--border)"),
          }},
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:10}},
              React.createElement("div",{style:{width:8,height:8,borderRadius:"50%",background:qCol}}),
              React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"var(--text)"}},"Q"+(q.q+1))
            ),
            hasData?React.createElement(React.Fragment,null,
              React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:isGain?"#16a34a":"#ef4444",marginBottom:4}},(isGain?"+":"")+q.avgReturn.toFixed(2)+"%"),
              React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginBottom:8}},"avg return · "+q.count+" trades"),
              React.createElement("div",{style:{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--text6)"}},
                React.createElement("span",null,"Win rate: "+Math.round(q.winRate)+"%"),
                React.createElement("span",null,"Avg hold: "+fmtDays(q.avgHoldDays))
              ),
              React.createElement("div",{style:{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--text6)",marginTop:3}},
                React.createElement("span",null,"Total P&L:"),
                React.createElement("span",{style:{fontWeight:600,color:q.totalPnl>=0?"#16a34a":"#ef4444"}},(q.totalPnl>=0?"+":"")+INR(q.totalPnl))
              )
            ):React.createElement("div",{style:{fontSize:12,color:"var(--text6)",textAlign:"center",padding:"12px 0"}},"No trades in this quarter")
          );
        })
      )
    ),

    /* ══ Report 6: Position Sizing Patterns ══ */
    positionSizing&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"grid",size:15}),"Position Sizing Patterns"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},"size vs outcome")
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        /* Small vs Large comparison */
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}},
          React.createElement("div",{style:{padding:"14px 16px",borderRadius:12,background:"var(--bg4)",border:"1px solid var(--border)"}},
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},"Smaller Positions"),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginBottom:8}},"≤ ₹"+Number(Math.round(positionSizing.median)).toLocaleString("en-IN")+" invested"),
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
              React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Trades"),
              React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"var(--text)"}},positionSizing.small.count)
            ),
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
              React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Size"),
              React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"var(--text)"}},"₹"+Number(Math.round(positionSizing.small.avgSize)).toLocaleString("en-IN"))
            ),
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
              React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Return"),
              React.createElement("span",{style:{fontSize:12,fontWeight:700,color:positionSizing.small.avgReturn>=0?"#16a34a":"#ef4444"}},(positionSizing.small.avgReturn>=0?"+":"")+positionSizing.small.avgReturn.toFixed(2)+"%")
            ),
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},
              React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Win Rate"),
              React.createElement("span",{style:{fontSize:12,fontWeight:700,color:positionSizing.small.winRate>=50?"#16a34a":"#ef4444"}},Math.round(positionSizing.small.winRate)+"%")
            )
          ),
          React.createElement("div",{style:{padding:"14px 16px",borderRadius:12,background:"var(--bg4)",border:"1px solid var(--border)"}},
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},"Larger Positions"),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginBottom:8}}," > ₹"+Number(Math.round(positionSizing.median)).toLocaleString("en-IN")+" invested"),
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
              React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Trades"),
              React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"var(--text)"}},positionSizing.large.count)
            ),
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
              React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Size"),
              React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"var(--text)"}},"₹"+Number(Math.round(positionSizing.large.avgSize)).toLocaleString("en-IN"))
            ),
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
              React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Return"),
              React.createElement("span",{style:{fontSize:12,fontWeight:700,color:positionSizing.large.avgReturn>=0?"#16a34a":"#ef4444"}},(positionSizing.large.avgReturn>=0?"+":"")+positionSizing.large.avgReturn.toFixed(2)+"%")
            ),
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},
              React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Win Rate"),
              React.createElement("span",{style:{fontSize:12,fontWeight:700,color:positionSizing.large.winRate>=50?"#16a34a":"#ef4444"}},Math.round(positionSizing.large.winRate)+"%")
            )
          )
        ),
        /* Correlation insight */
        React.createElement("div",{style:{padding:"12px 16px",borderRadius:10,background:Math.abs(positionSizing.correlation)>0.15?(positionSizing.correlation>0?"rgba(22,163,74,.06)":"rgba(239,68,68,.06)"):"var(--bg4)",border:"1px solid "+(Math.abs(positionSizing.correlation)>0.15?(positionSizing.correlation>0?"rgba(22,163,74,.18)":"rgba(239,68,68,.18)"):"var(--border)")}},
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,fontWeight:700,color:"var(--text3)"}},"Size–Return Correlation"),
            React.createElement("span",{style:{fontSize:14,fontFamily:"'Sora',sans-serif",fontWeight:800,color:Math.abs(positionSizing.correlation)>0.15?(positionSizing.correlation>0?"#16a34a":"#ef4444"):"var(--text5)"}},positionSizing.correlation.toFixed(3))
          ),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",lineHeight:1.5}},
            Math.abs(positionSizing.correlation)<0.1
              ?"No meaningful correlation — position size doesn't predict returns."
              :positionSizing.correlation>0
                ?"Positive correlation — you tend to make higher returns on larger positions. Your conviction seems well-placed!"
                :"Negative correlation — larger positions tend to underperform. Consider more uniform position sizing."
          )
        ),
        /* Total P&L comparison */
        React.createElement("div",{style:{marginTop:12,display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"var(--bg5)",borderRadius:8,fontSize:11}},
          React.createElement("span",{style:{color:"var(--text5)"}},"Small positions total P&L:"),
          React.createElement("span",{style:{fontWeight:700,color:positionSizing.small.totalPnl>=0?"#16a34a":"#ef4444"}},(positionSizing.small.totalPnl>=0?"+":"")+INR(positionSizing.small.totalPnl))
        ),
        React.createElement("div",{style:{marginTop:6,display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"var(--bg5)",borderRadius:8,fontSize:11}},
          React.createElement("span",{style:{color:"var(--text5)"}},"Large positions total P&L:"),
          React.createElement("span",{style:{fontWeight:700,color:positionSizing.large.totalPnl>=0?"#16a34a":"#ef4444"}},(positionSizing.large.totalPnl>=0?"+":"")+INR(positionSizing.large.totalPnl))
        )
      )
    ),

    /* ══ Methodology note ══ */
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Holding periods are measured in calendar days from buy date to sell date (or today for active holdings). Position sizing correlation uses Pearson's r — values above 0.15 or below -0.15 suggest a meaningful relationship between how much you invest and the outcome. Seasonality analysis groups trades by acquisition month/quarter to reveal timing patterns."
    )
  );
};


const WinLossPatterns=({shares,soldShareSnapshots={}})=>{
  React.useState("pnl"); /* pnl | returnPct | annReturn */
  React.useState("desc");

  /* ── Build unified trade list ── */
  const trades=React.useMemo(()=>{
    const list=[];
    (shares||[]).forEach(sh=>{
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      const buyDate=new Date(sh.buyDate+"T12:00:00");
      const sellDate=new Date(TODAY()+"T12:00:00");
      const holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
      const buyAmt=sh.qty*sh.buyPrice;
      const sellAmt=sh.qty*sh.currentPrice;
      const brokerage=+sh.brokerage||0;
      const pnl=sellAmt-buyAmt;
      const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
      const annReturn=holdDays>0?(Math.pow(1+returnPct/100,365/holdDays)-1)*100:returnPct;
      list.push({
        id:sh.id,type:"active",company:sh.company,ticker:sh.ticker,
        qty:sh.qty,buyPrice:sh.buyPrice,sellPrice:sh.currentPrice,
        buyDateStr:sh.buyDate,sellDateStr:TODAY(),
        buyDate,sellDate,holdDays,
        buyAmt,sellAmt,brokerage,pnl,returnPct,annReturn,
        pnlNet:pnl-brokerage,
        returnNetPct:buyAmt>0?((pnl-brokerage)/buyAmt*100):0,
      });
    });
    Object.values(soldShareSnapshots||{}).forEach(fySnaps=>{
      (fySnaps||[]).forEach(sn=>{
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate||!sn.savedAt)return;
        const buyDate=new Date(sn.buyDate+"T12:00:00");
        const sellDate=new Date(sn.savedAt+"T12:00:00");
        const holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
        const buyAmt=sn.qty*sn.buyPrice;
        const sellAmt=sn.qty*sn.sellPrice;
        const brokerage=+sn.brokerage||0;
        const pnl=sellAmt-buyAmt;
        const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
        const annReturn=holdDays>0?(Math.pow(1+returnPct/100,365/holdDays)-1)*100:returnPct;
        list.push({
          id:sn.id,type:"sold",company:sn.company,ticker:sn.ticker,
          qty:sn.qty,buyPrice:sn.buyPrice,sellPrice:sn.sellPrice,
          buyDateStr:sn.buyDate,sellDateStr:sn.savedAt,
          buyDate,sellDate,holdDays,
          buyAmt,sellAmt,brokerage,pnl,returnPct,annReturn,
          pnlNet:pnl-brokerage,
          returnNetPct:buyAmt>0?((pnl-brokerage)/buyAmt*100):0,
        });
      });
    });
    return list;
  },[shares,soldShareSnapshots]);

  /* ── Core metrics ── */
  const metrics=React.useMemo(()=>{
    if(!trades.length)return null;
    const winners=trades.filter(t=>t.pnl>0);
    const losers=trades.filter(t=>t.pnl<0);
    const breakeven=trades.filter(t=>t.pnl===0);
    const winRate=(winners.length/trades.length)*100;
    const totalProfit=winners.reduce((s,t)=>s+t.pnl,0);
    const totalLoss=Math.abs(losers.reduce((s,t)=>s+t.pnl,0));
    const profitFactor=totalLoss>0?totalProfit/totalLoss:totalProfit>0?Infinity:0;
    const avgWin=winners.length>0?totalProfit/winners.length:0;
    const avgLoss=losers.length>0?totalLoss/losers.length:0;
    const avgWinReturn=winners.length>0?winners.reduce((s,t)=>s+t.returnPct,0)/winners.length:0;
    const avgLossReturn=losers.length>0?losers.reduce((s,t)=>s+t.returnPct,0)/losers.length:0;
    const winLossRatio=avgLoss>0?avgWin/avgLoss:avgWin>0?Infinity:0;
    const largestWinner=[...winners].sort((a,b)=>b.pnl-a.pnl)[0]||null;
    const largestLoser=[...losers].sort((a,b)=>a.pnl-b.pnl)[0]||null;
    const largestWinnerPct=[...winners].sort((a,b)=>b.returnPct-a.returnPct)[0]||null;
    const largestLoserPct=[...losers].sort((a,b)=>a.returnPct-b.returnPct)[0]||null;
    /* Streak analysis — chronological order */
    const chrono=[...trades].sort((a,b)=>{
      const da=a.sellDateStr||a.buyDateStr||"";
      const db=b.sellDateStr||b.buyDateStr||"";
      if(da!==db)return da.localeCompare(db);
      return a.buyDateStr.localeCompare(b.buyDateStr);
    });
    let maxWinStreak=0,maxLossStreak=0,curWin=0,curLoss=0;
    let winStreakStart=null,winStreakEnd=null,lossStreakStart=null,lossStreakEnd=null;
    let tmpWinStart=null,tmpLossStart=null;
    chrono.forEach((t,i)=>{
      if(t.pnl>0){
        if(curWin===0)tmpWinStart=t;
        curWin++;
        if(curLoss>maxLossStreak){maxLossStreak=curLoss;lossStreakStart=tmpLossStart;lossStreakEnd=chrono[i-1];}
        curLoss=0;
      }else if(t.pnl<0){
        if(curLoss===0)tmpLossStart=t;
        curLoss++;
        if(curWin>maxWinStreak){maxWinStreak=curWin;winStreakStart=tmpWinStart;winStreakEnd=chrono[i-1];}
        curWin=0;
      }else{
        if(curWin>maxWinStreak){maxWinStreak=curWin;winStreakStart=tmpWinStart;winStreakEnd=chrono[i-1];}
        if(curLoss>maxLossStreak){maxLossStreak=curLoss;lossStreakStart=tmpLossStart;lossStreakEnd=chrono[i-1];}
        curWin=0;curLoss=0;
      }
    });
    if(curWin>maxWinStreak){maxWinStreak=curWin;winStreakStart=tmpWinStart;winStreakEnd=chrono[chrono.length-1];}
    if(curLoss>maxLossStreak){maxLossStreak=curLoss;lossStreakStart=tmpLossStart;lossStreakEnd=chrono[chrono.length-1];}
    return{
      total:trades.length,winners:winners.length,losers:losers.length,breakeven:breakeven.length,
      winRate,totalProfit,totalLoss,profitFactor,
      avgWin,avgLoss,avgWinReturn,avgLossReturn,winLossRatio,
      largestWinner,largestLoser,largestWinnerPct,largestLoserPct,
      maxWinStreak,maxLossStreak,
      winStreakStart,winStreakEnd,lossStreakStart,lossStreakEnd,
    };
  },[trades]);

  /* ── Per-stock aggregation ── */
  const stockStats=React.useMemo(()=>{
    const map={};
    trades.forEach(t=>{
      const key=t.ticker||t.company;
      if(!map[key])map[key]={ticker:t.ticker,company:t.company,trades:0,totalPnl:0,totalBuyAmt:0,totalReturn:0,wins:0,losses:0,totalHoldDays:0,bestPnl:-Infinity,worstPnl:Infinity,bestReturn:-Infinity,worstReturn:Infinity};
      const s=map[key];
      s.trades++;
      s.totalPnl+=t.pnl;
      s.totalBuyAmt+=t.buyAmt;
      s.totalReturn+=t.returnPct;
      s.totalHoldDays+=t.holdDays;
      if(t.pnl>0)s.wins++;
      if(t.pnl<0)s.losses++;
      s.bestPnl=Math.max(s.bestPnl,t.pnl);
      s.worstPnl=Math.min(s.worstPnl,t.pnl);
      s.bestReturn=Math.max(s.bestReturn,t.returnPct);
      s.worstReturn=Math.min(s.worstReturn,t.returnPct);
    });
    return Object.values(map).map(s=>{
      const avgReturn=s.trades>0?s.totalReturn/s.trades:0;
      const avgHoldDays=s.trades>0?Math.round(s.totalHoldDays/s.trades):0;
      const annReturn=avgHoldDays>0?(Math.pow(1+avgReturn/100,365/avgHoldDays)-1)*100:avgReturn;
      return{...s,avgReturn,avgHoldDays,annReturn,winRate:s.trades>0?(s.wins/s.trades*100):0};
    });
  },[trades]);

  /* Sortable column header helper */
  const SortHdr=({label,field,align})=>React.createElement("div",{
    onClick:()=>{if(sortBy===field)setSortDir(d=>d==="desc"?"asc":"desc");else{setSortBy(field);setSortDir("desc");}},
    style:{
      fontSize:9,fontWeight:700,color:sortBy===field?"var(--accent)":"var(--text6)",
      textTransform:"uppercase",letterSpacing:.7,cursor:"pointer",
      display:"flex",alignItems:"center",gap:3,justifyContent:align||"flex-start",
      padding:"6px 8px",
    }
  },label,sortBy===field&&React.createElement("span",{style:{fontSize:8}},sortDir==="desc"?"▼":"▲"));

  /* ── Empty state ── */
  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"target",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to Previous Trades to see win/loss pattern analytics.")
  );

  /* ── Best/worst stocks sorted views ── */
  const bestByPnl=[...stockStats].sort((a,b)=>b.totalPnl-a.totalPnl);
  const worstByPnl=[...stockStats].sort((a,b)=>a.totalPnl-b.totalPnl);
  const bestByReturn=[...stockStats].sort((a,b)=>b.avgReturn-a.avgReturn);
  const worstByReturn=[...stockStats].sort((a,b)=>a.avgReturn-b.avgReturn);
  const bestByAnn=[...stockStats].sort((a,b)=>b.annReturn-a.annReturn);
  const worstByAnn=[...stockStats].sort((a,b)=>a.annReturn-b.annReturn);

  /* ── Sorted stock table ── */
  let sortedStocks;
  if(sortBy==="pnl")sortedStocks=[...stockStats].sort((a,b)=>sortDir==="desc"?b.totalPnl-a.totalPnl:a.totalPnl-b.totalPnl);
  else if(sortBy==="returnPct")sortedStocks=[...stockStats].sort((a,b)=>sortDir==="desc"?b.avgReturn-a.avgReturn:a.avgReturn-b.avgReturn);
  else if(sortBy==="annReturn")sortedStocks=[...stockStats].sort((a,b)=>sortDir==="desc"?b.annReturn-a.annReturn:a.annReturn-b.annReturn);
  else sortedStocks=[...stockStats].sort((a,b)=>sortDir==="desc"?b.totalPnl-a.totalPnl:a.totalPnl-b.totalPnl);

  const m=metrics;
  const pfColor=m.profitFactor>=1.5?"#16a34a":m.profitFactor>=1?"#f59e0b":"#ef4444";
  const pfLabel=m.profitFactor>=1.5?"Healthy":m.profitFactor>=1?"Marginal":"Losing";

  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},
    /* ══ Summary Stat Cards ══ */
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12}},
      /* Win Rate */
      React.createElement("div",{style:{background:m.winRate>=50?"rgba(22,163,74,.07)":"rgba(239,68,68,.07)",border:"1px solid "+(m.winRate>=50?"rgba(22,163,74,.2)":"rgba(239,68,68,.2)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Win Rate"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:m.winRate>=50?"#16a34a":"#ef4444"}},m.winRate.toFixed(1)+"%"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},m.winners+"W / "+m.losers+"L / "+m.breakeven+" even")
      ),
      /* Profit Factor */
      React.createElement("div",{style:{background:m.profitFactor>=1.5?"rgba(22,163,74,.07)":m.profitFactor>=1?"rgba(245,158,11,.07)":"rgba(239,68,68,.07)",border:"1px solid "+(m.profitFactor>=1.5?"rgba(22,163,74,.2)":m.profitFactor>=1?"rgba(245,158,11,.2)":"rgba(239,68,68,.2)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Profit Factor"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:pfColor}},m.profitFactor===Infinity?"∞":m.profitFactor.toFixed(2)),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},pfLabel+" · gross ÷ gross loss")
      ),
      /* Win/Loss Ratio */
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Avg Win / Avg Loss"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:m.winLossRatio>=1.5?"#16a34a":m.winLossRatio>=1?"#f59e0b":"#ef4444"}},m.winLossRatio===Infinity?"∞":m.winLossRatio.toFixed(2)+"×"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Win avg: "+INR(m.avgWin)+" · Loss avg: "+INR(m.avgLoss))
      ),
      /* Win Streak */
      React.createElement("div",{style:{background:"rgba(22,163,74,.07)",border:"1px solid rgba(22,163,74,.2)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Best Win Streak"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#16a34a"}},m.maxWinStreak+" trades"),
        m.winStreakStart&&React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},(m.winStreakStart.ticker||"")+" → "+(m.winStreakEnd?.ticker||""))
      ),
      /* Loss Streak */
      React.createElement("div",{style:{background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.2)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Worst Loss Streak"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#ef4444"}},m.maxLossStreak+" trades"),
        m.lossStreakStart&&React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},(m.lossStreakStart.ticker||"")+" → "+(m.lossStreakEnd?.ticker||""))
      )
    ),

    /* ══ Report 1: Win/Loss Detail Cards ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"chart",size:15}),"Win vs Loss Breakdown"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},m.total+" trades")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16}},
        /* Winning trades */
        React.createElement("div",{style:{padding:16,background:"rgba(22,163,74,.06)",border:"1px solid rgba(22,163,74,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:8,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"checkcircle",size:12,color:"#16a34a"})," Winning Trades ("+m.winners+")"),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Total Profit"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"#16a34a",fontFamily:"'Sora',sans-serif"}},"+"+INR(m.totalProfit))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Win (₹)"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#16a34a"}},"+"+INR(m.avgWin))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Win (%)"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#16a34a"}},"+"+m.avgWinReturn.toFixed(2)+"%")
          ),
          m.largestWinner&&React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:8,borderTop:"1px solid rgba(22,163,74,.15)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Largest Win"),
            React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"#16a34a"}},"+"+INR(m.largestWinner.pnl))
          ),
          m.largestWinnerPct&&React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:4}},
            React.createElement("span",{style:{fontSize:10,color:"var(--text6)"}},"Highest Return %"),
            React.createElement("span",{style:{fontSize:11,fontWeight:600,color:"#16a34a"}},"+"+m.largestWinnerPct.returnPct.toFixed(2)+"% ("+m.largestWinnerPct.company+")")
          )
        ),
        /* Losing trades */
        React.createElement("div",{style:{padding:16,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#ef4444",textTransform:"uppercase",letterSpacing:1,marginBottom:8,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"delete",size:12,color:"#ef4444"})," Losing Trades ("+m.losers+")"),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Total Loss"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"#ef4444",fontFamily:"'Sora',sans-serif"}},"-"+INR(m.totalLoss))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Loss (₹)"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#ef4444"}},"-"+INR(m.avgLoss))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Loss (%)"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#ef4444"}},m.avgLossReturn.toFixed(2)+"%")
          ),
          m.largestLoser&&React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:8,borderTop:"1px solid rgba(239,68,68,.15)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Largest Loss"),
            React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"#ef4444"}},"-"+INR(Math.abs(m.largestLoser.pnl)))
          ),
          m.largestLoserPct&&React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:4}},
            React.createElement("span",{style:{fontSize:10,color:"var(--text6)"}},"Worst Return %"),
            React.createElement("span",{style:{fontSize:11,fontWeight:600,color:"#ef4444"}},m.largestLoserPct.returnPct.toFixed(2)+"% ("+m.largestLoserPct.company+")")
          )
        ),
        /* Profit factor insight */
        React.createElement("div",{style:{padding:16,background:m.profitFactor>=1.5?"rgba(22,163,74,.06)":"rgba(245,158,11,.06)",border:"1px solid "+(m.profitFactor>=1.5?"rgba(22,163,74,.18)":"rgba(245,158,11,.18)"),borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:8,display:"flex",alignItems:"center",gap:5}},React.createElement(Icon,{n:"lightbulb",size:13}),"Profit Factor Insight"),
          React.createElement("div",{style:{fontSize:12,color:"var(--text4)",lineHeight:1.6}},
            "Your profit factor is ",React.createElement("strong",{style:{color:pfColor}},m.profitFactor===Infinity?"∞":m.profitFactor.toFixed(2)),
            " — for every ₹1 lost, you make ₹"+(m.profitFactor===Infinity?"∞":m.profitFactor.toFixed(2))+". ",
            m.profitFactor>=1.5
              ?"This is healthy! A profit factor above 1.5 means your winners substantially outweigh your losers."
              :m.profitFactor>=1
                ?"This is marginal. Aim for a profit factor above 1.5 by either increasing win size or reducing loss size."
                :"This is below breakeven. Your losses outweigh your wins — review your exit strategy and position sizing."
          ),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginTop:8,lineHeight:1.5}},
            "Even with a ",React.createElement("strong",null,m.winRate.toFixed(1)+"% win rate"),
            ", your average win (₹"+Number(Math.round(m.avgWin)).toLocaleString("en-IN")+") vs average loss (₹"+Number(Math.round(m.avgLoss)).toLocaleString("en-IN")+") ratio is ",
            React.createElement("strong",{style:{color:m.winLossRatio>=1.5?"#16a34a":"#ef4444"}},m.winLossRatio===Infinity?"∞":m.winLossRatio.toFixed(2)+"×"),
            ". ",
            m.winLossRatio>=3?"Outstanding risk-reward — you can be profitable even with a low win rate."
              :m.winLossRatio>=1.5?"Good risk-reward balance."
              :"Your wins are not large enough relative to losses. Let winners run longer or cut losses quicker."
          )
        )
      )
    ),

    /* ══ Report 2: Streak Analysis ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"fire",size:15}),"Consecutive Streaks"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},"emotional patterns")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}},
        /* Win streak card */
        React.createElement("div",{style:{padding:16,background:"rgba(22,163,74,.06)",border:"1px solid rgba(22,163,74,.18)",borderRadius:12}},
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:12}},
            React.createElement(Icon,{n:"target",size:20,color:"#16a34a"}),
            React.createElement("div",null,
              React.createElement("div",{style:{fontSize:14,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#16a34a"}},m.maxWinStreak+" consecutive wins"),
              React.createElement("div",{style:{fontSize:11,color:"var(--text5)"}},"Best winning streak")
            )
          ),
          m.winStreakStart&&React.createElement("div",{style:{fontSize:11,color:"var(--text4)",lineHeight:1.6}},
            "From ",React.createElement("strong",null,m.winStreakStart.company||m.winStreakStart.ticker),
            " to ",React.createElement("strong",null,m.winStreakEnd?.company||m.winStreakEnd?.ticker),
            ". Consistent winners suggest a well-defined edge in this pattern."
          )
        ),
        /* Loss streak card */
        React.createElement("div",{style:{padding:16,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.18)",borderRadius:12}},
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:12}},
            React.createElement(Icon,{n:"warning",size:20,color:"#ef4444"}),
            React.createElement("div",null,
              React.createElement("div",{style:{fontSize:14,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#ef4444"}},m.maxLossStreak+" consecutive losses"),
              React.createElement("div",{style:{fontSize:11,color:"var(--text5)"}},"Worst losing streak")
            )
          ),
          m.lossStreakStart&&React.createElement("div",{style:{fontSize:11,color:"var(--text4)",lineHeight:1.6}},
            "From ",React.createElement("strong",null,m.lossStreakStart.company||m.lossStreakStart.ticker),
            " to ",React.createElement("strong",null,m.lossStreakEnd?.company||m.lossStreakEnd?.ticker),
            ". Long loss streaks may signal emotional trading — consider pausing after 3+ consecutive losses."
          )
        ),
        /* Streak insight */
        React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"lightbulb",size:13})," Streak Insight")),
          React.createElement("div",{style:{fontSize:12,color:"var(--text4)",lineHeight:1.6}},
            m.maxWinStreak>m.maxLossStreak
              ?"Your best winning streak ("+m.maxWinStreak+") exceeds your worst losing streak ("+m.maxLossStreak+"). This asymmetry is positive — you ride winners longer than you hold losers."
              :m.maxWinStreak===m.maxLossStreak
                ?"Your winning and losing streaks are equal at "+m.maxWinStreak+" each. Consider if there's a pattern in when streaks start — are you revenge-trading after losses?"
                :"Your worst losing streak ("+m.maxLossStreak+") exceeds your best winning streak ("+m.maxWinStreak+"). Watch for revenge trading patterns — consider a cooling-off rule after 3+ consecutive losses."
          )
        )
      )
    ),

    /* ══ Report 3: Best & Worst Performing Stocks ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"target",size:15}),"Best & Worst Stocks"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},stockStats.length+" stocks")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}},
        /* Best by absolute P&L */
        React.createElement("div",{style:{padding:16,borderRadius:12,background:"rgba(22,163,74,.04)",border:"1px solid rgba(22,163,74,.15)"}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"money",size:13})," Best by Absolute P&L")),
          bestByPnl.slice(0,5).map((s,i)=>React.createElement("div",{key:s.ticker||i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<4?"1px solid var(--border2)":"none"}},
            React.createElement("div",{style:{minWidth:0,flex:1}},
              React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}},s.company),
              React.createElement("span",{style:{fontSize:9,color:"var(--text6)"}},s.trades+" trades · "+s.winRate.toFixed(0)+"% win")
            ),
            React.createElement("span",{style:{fontSize:13,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"#16a34a",marginLeft:8,flexShrink:0}},"+"+INR(s.totalPnl))
          ))
        ),
        /* Worst by absolute P&L */
        React.createElement("div",{style:{padding:16,borderRadius:12,background:"rgba(239,68,68,.04)",border:"1px solid rgba(239,68,68,.15)"}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#ef4444",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"expense",size:13})," Worst by Absolute P&L")),
          worstByPnl.slice(0,5).map((s,i)=>React.createElement("div",{key:s.ticker||i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<4?"1px solid var(--border2)":"none"}},
            React.createElement("div",{style:{minWidth:0,flex:1}},
              React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}},s.company),
              React.createElement("span",{style:{fontSize:9,color:"var(--text6)"}},s.trades+" trades · "+s.winRate.toFixed(0)+"% win")
            ),
            React.createElement("span",{style:{fontSize:13,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"#ef4444",marginLeft:8,flexShrink:0}},"-"+INR(Math.abs(s.totalPnl)))
          ))
        ),
        /* Best by return % */
        React.createElement("div",{style:{padding:16,borderRadius:12,background:"rgba(109,40,217,.04)",border:"1px solid rgba(109,40,217,.15)"}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#6d28d9",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"invest",size:13})," Best by Avg Return %")),
          bestByReturn.slice(0,5).map((s,i)=>React.createElement("div",{key:s.ticker||i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<4?"1px solid var(--border2)":"none"}},
            React.createElement("div",{style:{minWidth:0,flex:1}},
              React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}},s.company),
              React.createElement("span",{style:{fontSize:9,color:"var(--text6)"}},s.trades+" trades · hold "+s.avgHoldDays+"d avg")
            ),
            React.createElement("span",{style:{fontSize:13,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"#6d28d9",marginLeft:8,flexShrink:0}},"+"+s.avgReturn.toFixed(2)+"%")
          ))
        ),
        /* Worst by return % */
        React.createElement("div",{style:{padding:16,borderRadius:12,background:"rgba(245,158,11,.04)",border:"1px solid rgba(245,158,11,.15)"}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",letterSpacing:1,marginBottom:10,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"trenddown",size:12,color:"#f59e0b"})," Worst by Avg Return %"),
          worstByReturn.slice(0,5).map((s,i)=>React.createElement("div",{key:s.ticker||i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<4?"1px solid var(--border2)":"none"}},
            React.createElement("div",{style:{minWidth:0,flex:1}},
              React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}},s.company),
              React.createElement("span",{style:{fontSize:9,color:"var(--text6)"}},s.trades+" trades · hold "+s.avgHoldDays+"d avg")
            ),
            React.createElement("span",{style:{fontSize:13,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"#f59e0b",marginLeft:8,flexShrink:0}},s.avgReturn.toFixed(2)+"%")
          ))
        ),
        /* Best by annualised return */
        React.createElement("div",{style:{padding:16,borderRadius:12,background:"rgba(14,116,144,.04)",border:"1px solid rgba(14,116,144,.15)"}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#0e7490",textTransform:"uppercase",letterSpacing:1,marginBottom:10,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"invest",size:12,color:"#0e7490"})," Best by Annualised Return"),
          bestByAnn.slice(0,5).map((s,i)=>React.createElement("div",{key:s.ticker||i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<4?"1px solid var(--border2)":"none"}},
            React.createElement("div",{style:{minWidth:0,flex:1}},
              React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}},s.company),
              React.createElement("span",{style:{fontSize:9,color:"var(--text6)"}},s.trades+" trades · "+s.avgHoldDays+"d hold")
            ),
            React.createElement("span",{style:{fontSize:13,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"#0e7490",marginLeft:8,flexShrink:0}},"+"+s.annReturn.toFixed(2)+"% p.a.")
          ))
        ),
        /* Worst by annualised return */
        React.createElement("div",{style:{padding:16,borderRadius:12,background:"rgba(225,29,72,.04)",border:"1px solid rgba(225,29,72,.15)"}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#e11d48",textTransform:"uppercase",letterSpacing:1,marginBottom:10,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"trenddown",size:12,color:"#e11d48"})," Worst by Annualised Return"),
          worstByAnn.slice(0,5).map((s,i)=>React.createElement("div",{key:s.ticker||i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:i<4?"1px solid var(--border2)":"none"}},
            React.createElement("div",{style:{minWidth:0,flex:1}},
              React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}},s.company),
              React.createElement("span",{style:{fontSize:9,color:"var(--text6)"}},s.trades+" trades · "+s.avgHoldDays+"d hold")
            ),
            React.createElement("span",{style:{fontSize:13,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"#e11d48",marginLeft:8,flexShrink:0}},s.annReturn.toFixed(2)+"% p.a.")
          ))
        )
      )
    ),

    /* ══ Report 4: Full Stock Performance Table ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"list",size:15}),"Stock-by-Stock Performance"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},sortedStocks.length+" stocks")
      ),
      React.createElement("div",{className:"mobile-scroll-table",style:{overflowX:"auto"}},
        React.createElement("div",{style:{minWidth:700}},
          /* Column headers */
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"2fr 60px 70px 100px 90px 100px 80px",gap:0,borderBottom:"1px solid var(--border)",background:"var(--bg4)"}},
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px"}},"Stock"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"Trades"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"Win %"),
            React.createElement(SortHdr,{label:"Total P&L",field:"pnl",align:"right"}),
            React.createElement(SortHdr,{label:"Avg Return",field:"returnPct",align:"right"}),
            React.createElement(SortHdr,{label:"Ann. Return",field:"annReturn",align:"right"}),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Avg Hold")
          ),
          /* Rows */
          sortedStocks.map((s,i)=>{
            const isGain=s.totalPnl>=0;
            return React.createElement("div",{key:s.ticker||i,style:{display:"grid",gridTemplateColumns:"2fr 60px 70px 100px 90px 100px 80px",gap:0,borderBottom:"1px solid var(--border2)",background:i%2===0?"transparent":"var(--bg4)",transition:"background .1s"},onMouseEnter:e=>e.currentTarget.style.background="var(--accentbg2)",onMouseLeave:e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--bg4)"},
              React.createElement("div",{style:{padding:"9px 8px",display:"flex",flexDirection:"column",gap:2,minWidth:0}},
                React.createElement("div",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},s.company),
                React.createElement("span",{style:{fontSize:9,padding:"1px 5px",borderRadius:4,background:"rgba(14,116,144,.1)",color:"#0e7490",fontWeight:600,width:"fit-content"}},s.ticker||"—")
              ),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"center",color:"var(--text3)"}},s.trades),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"center",fontWeight:600,color:s.winRate>=50?"#16a34a":"#ef4444"}},s.winRate.toFixed(0)+"%"),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"right",fontWeight:700,fontFamily:"'Sora',sans-serif",color:isGain?"#16a34a":"#ef4444"}},(isGain?"+":"")+INR(s.totalPnl)),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",fontWeight:600,color:s.avgReturn>=0?"#16a34a":"#ef4444"}},(s.avgReturn>=0?"+":"")+s.avgReturn.toFixed(2)+"%"),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",fontWeight:600,color:s.annReturn>=0?"#0e7490":"#e11d48"}},(s.annReturn>=0?"+":"")+s.annReturn.toFixed(2)+"%"),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",color:"var(--text4)"}},s.avgHoldDays+"d")
            );
          })
        )
      )
    ),

    /* ══ Methodology note ══ */
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Win rate = profitable trades ÷ total trades. Profit factor = gross profit ÷ gross loss (≥ 1.5 is healthy). Avg win/loss ratio compares mean winning trade to mean losing trade — even a 40% win rate is profitable if avg win is 3× avg loss. Streak analysis sorts trades chronologically by sell date to find maximum consecutive wins and losses. Annualised return uses (1 + return%)^(365 / hold days) − 1, compounded. Active holdings use current price as the exit price. All amounts are gross of brokerage unless noted."
    )
  );
};


const CapitalEfficiency=({shares,soldShareSnapshots={}})=>{
  const NIFTY_CAGR=0.12;
  const SENSEX_CAGR=0.125;
  const ret=(v)=>(v>=0?"+":"")+v.toFixed(2)+"%";

  /* ── Build unified trade list ── */
  const trades=React.useMemo(()=>{
    const list=[];
    (shares||[]).forEach(sh=>{
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      const buyDate=new Date(sh.buyDate+"T12:00:00");
      const sellDate=new Date(TODAY()+"T12:00:00");
      const holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
      const buyAmt=sh.qty*sh.buyPrice;
      const sellAmt=sh.qty*sh.currentPrice;
      const brokerage=+sh.brokerage||0;
      const pnl=sellAmt-buyAmt-brokerage;
      const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
      const annReturn=holdDays>0?(Math.pow(1+returnPct/100,365/holdDays)-1)*100:returnPct;
      const niftyReturn=buyAmt*(Math.pow(1+NIFTY_CAGR,holdDays/365)-1);
      const sensexReturn=buyAmt*(Math.pow(1+SENSEX_CAGR,holdDays/365)-1);
      const alphaVsNifty=pnl-niftyReturn;
      const alphaVsSensex=pnl-sensexReturn;
      let xirrVal=null;
      try{xirrVal=computeXIRR([-buyAmt,sellAmt],[buyDate,sellDate]);}catch{}
      list.push({
        id:sh.id,type:"active",company:sh.company,ticker:sh.ticker,
        qty:sh.qty,buyPrice:sh.buyPrice,sellPrice:sh.currentPrice,
        buyDateStr:sh.buyDate,sellDateStr:TODAY(),
        buyDate,sellDate,holdDays,
        buyAmt,sellAmt,brokerage,pnl,returnPct,annReturn,xirrVal,
        niftyReturn,sensexReturn,alphaVsNifty,alphaVsSensex,
      });
    });
    Object.values(soldShareSnapshots||{}).forEach(fySnaps=>{
      (fySnaps||[]).forEach(sn=>{
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate||!sn.savedAt)return;
        const buyDate=new Date(sn.buyDate+"T12:00:00");
        const sellDate=new Date(sn.savedAt+"T12:00:00");
        const holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
        const buyAmt=sn.qty*sn.buyPrice;
        const sellAmt=sn.qty*sn.sellPrice;
        const brokerage=+sn.brokerage||0;
        const pnl=sellAmt-buyAmt-brokerage;
        const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
        const annReturn=holdDays>0?(Math.pow(1+returnPct/100,365/holdDays)-1)*100:returnPct;
        const niftyReturn=buyAmt*(Math.pow(1+NIFTY_CAGR,holdDays/365)-1);
        const sensexReturn=buyAmt*(Math.pow(1+SENSEX_CAGR,holdDays/365)-1);
        const alphaVsNifty=pnl-niftyReturn;
        const alphaVsSensex=pnl-sensexReturn;
        let xirrVal=null;
        try{xirrVal=computeXIRR([-buyAmt,sellAmt],[buyDate,sellDate]);}catch{}
        list.push({
          id:sn.id,type:"sold",company:sn.company,ticker:sn.ticker,
          qty:sn.qty,buyPrice:sn.buyPrice,sellPrice:sn.sellPrice,
          buyDateStr:sn.buyDate,sellDateStr:sn.savedAt,
          buyDate,sellDate,holdDays,
          buyAmt,sellAmt,brokerage,pnl,returnPct,annReturn,xirrVal,
          niftyReturn,sensexReturn,alphaVsNifty,alphaVsSensex,
        });
      });
    });
    return list;
  },[shares,soldShareSnapshots]);

  /* ── Capital utilisation by month ── */
  const monthlyData=React.useMemo(()=>{
    if(!trades.length)return[];
    const sorted=[...trades].sort((a,b)=>a.buyDateStr.localeCompare(b.buyDateStr));
    const monthMap={};
    let cumulative=0;
    sorted.forEach(t=>{
      const ym=t.buyDateStr.slice(0,7);
      if(!monthMap[ym])monthMap[ym]={month:ym,deployed:0,cumulative:0,count:0};
      monthMap[ym].deployed+=t.buyAmt;
      monthMap[ym].count++;
      cumulative+=t.buyAmt;
      monthMap[ym].cumulative=cumulative;
    });
    const months=Object.values(monthMap).sort((a,b)=>a.month.localeCompare(b.month));
    const maxCum=months.length?months[months.length-1].cumulative:1;
    months.forEach(m=>{m.utilPct=maxCum>0?(m.cumulative/maxCum*100):0;});
    return months;
  },[trades]);

  /* ── Position sizing stats ── */
  const sizingStats=React.useMemo(()=>{
    if(!trades.length)return null;
    const buyAmts=trades.map(t=>t.buyAmt).sort((a,b)=>a-b);
    const total=buyAmts.reduce((s,v)=>s+v,0);
    const avg=total/buyAmts.length;
    const median=buyAmts.length%2===0?(buyAmts[buyAmts.length/2-1]+buyAmts[buyAmts.length/2])/2:buyAmts[Math.floor(buyAmts.length/2)];
    const min=buyAmts[0];
    const max=buyAmts[buyAmts.length-1];
    /* Distribution buckets */
    const bucketDefs=[
      {label:"< ₹10K",min:0,max:10000},
      {label:"₹10K–50K",min:10000,max:50000},
      {label:"₹50K–1L",min:50000,max:100000},
      {label:"₹1L–5L",min:100000,max:500000},
      {label:"₹5L–10L",min:500000,max:1000000},
      {label:"> ₹10L",min:1000000,max:Infinity},
    ];
    const buckets=bucketDefs.map(b=>({...b,count:buyAmts.filter(v=>v>=b.min&&v<b.max).length}));
    const maxBucket=Math.max(...buckets.map(b=>b.count),1);
    return{avg,median,min,max,total,count:buyAmts.length,buckets,maxBucket};
  },[trades]);

  /* ── Opportunity cost & alpha ── */
  const oppCost=React.useMemo(()=>{
    if(!trades.length)return null;
    const withXirr=trades.filter(t=>t.xirrVal!==null&&!isNaN(t.xirrVal));
    const avgXirr=withXirr.length>0?withXirr.reduce((s,t)=>s+t.xirrVal,0)/withXirr.length:0;
    const totalNiftyReturn=trades.reduce((s,t)=>s+t.niftyReturn,0);
    const totalSensexReturn=trades.reduce((s,t)=>s+t.sensexReturn,0);
    const totalPnl=trades.reduce((s,t)=>s+t.pnl,0);
    const totalAlphaVsNifty=trades.reduce((s,t)=>s+t.alphaVsNifty,0);
    const totalAlphaVsSensex=trades.reduce((s,t)=>s+t.alphaVsSensex,0);
    const totalBuyAmt=trades.reduce((s,t)=>s+t.buyAmt,0);
    const avgHoldDays=trades.reduce((s,t)=>s+t.holdDays,0)/trades.length;
    const avgAlphaNiftyPerTrade=trades.length>0?totalAlphaVsNifty/trades.length:0;
    const avgAlphaSensexPerTrade=trades.length>0?totalAlphaVsSensex/trades.length:0;
    return{
      avgXirr,totalNiftyReturn,totalSensexReturn,totalPnl,
      totalAlphaVsNifty,totalAlphaVsSensex,totalBuyAmt,avgHoldDays,
      avgAlphaNiftyPerTrade,avgAlphaSensexPerTrade,withXirrCount:withXirr.length,
    };
  },[trades]);

  /* ── Kelly criterion ── */
  const kellyData=React.useMemo(()=>{
    if(!trades.length)return null;
    const winners=trades.filter(t=>t.pnl>0);
    const losers=trades.filter(t=>t.pnl<0);
    const total=trades.length;
    if(!winners.length||!losers.length)return{winRate:winners.length/total,avgWin:0,avgLoss:0,winLossRatio:0,fullKelly:0,halfKelly:0,actualPct:0};
    const winRate=winners.length/total;
    const avgWin=winners.reduce((s,t)=>s+t.returnPct,0)/winners.length;
    const avgLoss=losers.reduce((s,t)=>s+Math.abs(t.returnPct),0)/losers.length;
    const winLossRatio=avgLoss>0?avgWin/avgLoss:avgWin>0?Infinity:0;
    let fullKelly=0;
    if(winLossRatio>0&&winLossRatio!==Infinity){
      fullKelly=winRate-((1-winRate)/winLossRatio);
    }else if(winLossRatio===Infinity){
      fullKelly=winRate;
    }
    fullKelly=Math.max(0,Math.min(1,fullKelly));
    const halfKelly=fullKelly/2;
    /* Actual avg position as % of total capital deployed */
    const totalBuy=trades.reduce((s,t)=>s+t.buyAmt,0);
    const actualPct=trades.length>0?(totalBuy/trades.length)/totalBuy*100:0;
    return{winRate,avgWin,avgLoss,winLossRatio,fullKelly,halfKelly,actualPct};
  },[trades]);

  /* ── Report 6: Stock-by-Stock Alpha vs Nifty ── */
  const stockAlphaData=React.useMemo(()=>{
    if(!trades.length)return[];
    const NIFTY_CAGR=0.12;
    const stockMap={};
    trades.forEach(t=>{
      const key=(t.ticker||t.company||"Unknown").toUpperCase();
      if(!stockMap[key])stockMap[key]={ticker:t.ticker||t.company||"Unknown",trades:[],totalPnl:0,totalNiftyReturn:0,totalAlpha:0,totalBuyAmt:0};
      const st=stockMap[key];
      st.trades.push(t);
      st.totalPnl+=t.pnl;
      st.totalBuyAmt+=t.buyAmt;
      const days=t.holdDays||Math.max(1,Math.floor((new Date(t.sellDate+"T12:00:00")-new Date(t.buyDate+"T12:00:00"))/864e5));
      const niftyReturn=t.buyAmt*(Math.pow(1+NIFTY_CAGR,days/365)-1);
      const alpha=t.pnl-niftyReturn;
      st.totalNiftyReturn+=niftyReturn;
      st.totalAlpha+=alpha;
    });
    return Object.values(stockMap).map(st=>({
      ...st,
      alphaPct:st.totalBuyAmt>0?(st.totalAlpha/st.totalBuyAmt*100):0,
      returnPct:st.totalBuyAmt>0?(st.totalPnl/st.totalBuyAmt*100):0,
      winRate:st.trades.length>0?(st.trades.filter(t=>t.pnl>=0).length/st.trades.length*100):0,
    })).sort((a,b)=>b.totalAlpha-a.totalAlpha);
  },[trades]);

  /* ── Empty state ── */
  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"crystal",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to Previous Trades to see capital efficiency analytics.")
  );

  const alphaColor=v=>v>=0?"#16a34a":"#ef4444";
  const alphaSign=v=>(v>=0?"+":"")+INR(v);
  const alphaSignPct=v=>(v>=0?"+":"")+v.toFixed(2)+"%";

  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},
    /* ══ Summary Stat Cards ══ */
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12}},
      /* Total Capital Deployed */
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Capital Deployed"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},INR(sizingStats?sizingStats.total:0)),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},(sizingStats?sizingStats.count:0)+" trades")
      ),
      /* Avg Trade Size */
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Avg Trade Size"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},INR(sizingStats?Math.round(sizingStats.avg):0)),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Median: "+INR(sizingStats?Math.round(sizingStats.median):0))
      ),
      /* Your XIRR */
      React.createElement("div",{style:{background:oppCost&&oppCost.avgXirr>=NIFTY_CAGR*100?"rgba(22,163,74,.07)":"rgba(245,158,11,.07)",border:"1px solid "+(oppCost&&oppCost.avgXirr>=NIFTY_CAGR*100?"rgba(22,163,74,.2)":"rgba(245,158,11,.2)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Your Avg XIRR"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:oppCost?alphaColor(oppCost.avgXirr-NIFTY_CAGR*100):"var(--text)"}},oppCost?oppCost.avgXirr.toFixed(2)+"%":"—"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},oppCost?oppCost.withXirrCount+" trades with XIRR":"")
      ),
      /* Alpha vs Nifty */
      React.createElement("div",{style:{background:oppCost&&oppCost.totalAlphaVsNifty>=0?"rgba(22,163,74,.07)":"rgba(239,68,68,.07)",border:"1px solid "+(oppCost&&oppCost.totalAlphaVsNifty>=0?"rgba(22,163,74,.2)":"rgba(239,68,68,.2)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Alpha vs Nifty 50"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:oppCost?alphaColor(oppCost.totalAlphaVsNifty):"var(--text)"}},oppCost?alphaSign(oppCost.totalAlphaVsNifty):"—"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"vs 12% CAGR benchmark")
      ),
      /* Kelly Full */
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Kelly Criterion"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:kellyData&&kellyData.fullKelly>0?"#0e7490":"var(--text4)"}},kellyData?(kellyData.fullKelly*100).toFixed(1)+"%":"—"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},kellyData?"Half-Kelly: "+(kellyData.halfKelly*100).toFixed(1)+"%":"")
      )
    ),

    /* ══ Report 1: Capital Utilisation Over Time ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"invest",size:15}),"Capital Utilisation Over Time"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},monthlyData.length+" months")
      ),
      React.createElement("div",{style:{padding:"16px 20px",overflowX:"auto"}},
        /* Month-by-month bars */
        React.createElement("div",{style:{display:"flex",gap:6,alignItems:"flex-end",minHeight:120,paddingBottom:24,position:"relative"}},
          monthlyData.map((md,i)=>{
            const maxCum=monthlyData[monthlyData.length-1].cumulative;
            const barH=maxCum>0?Math.max(4,(md.deployed/maxCum)*100):0;
            const cumH=maxCum>0?Math.max(4,(md.cumulative/maxCum)*100):0;
            return React.createElement("div",{key:md.month,style:{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flex:1,minWidth:36}},
              React.createElement("div",{style:{fontSize:9,color:alphaColor(md.deployed),fontWeight:600}},INR(md.deployed,1)),
              React.createElement("div",{style:{display:"flex",gap:2,alignItems:"flex-end",height:80}},
                React.createElement("div",{style:{width:14,height:barH+"%",background:"var(--accent)",borderRadius:"4px 4px 0 0",minHeight:3,title:"Deployed this month"}}),
                React.createElement("div",{style:{width:14,height:cumH+"%",background:"rgba(14,116,144,.3)",borderRadius:"4px 4px 0 0",minHeight:3,title:"Cumulative capital"}})
              ),
              React.createElement("div",{style:{fontSize:8,color:"var(--text6)",writingMode:"vertical-rl",transform:"rotate(180deg)",maxHeight:40,overflow:"hidden",whiteSpace:"nowrap"}},md.month),
              React.createElement("div",{style:{fontSize:8,color:"var(--text5)",marginTop:2}},md.utilPct.toFixed(0)+"%")
            );
          })
        ),
        /* Legend */
        React.createElement("div",{style:{display:"flex",gap:16,justifyContent:"center",marginTop:8,fontSize:10,color:"var(--text5)"}},
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:4}},React.createElement("div",{style:{width:10,height:10,background:"var(--accent)",borderRadius:3}}),"Deployed (month)"),
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:4}},React.createElement("div",{style:{width:10,height:10,background:"rgba(14,116,144,.3)",borderRadius:3}}),"Cumulative Capital")
        ),
        /* Summary row */
        monthlyData.length>1&&React.createElement("div",{style:{marginTop:12,paddingTop:10,borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text4)"}},
          React.createElement("span",null,"Peak monthly deployment: "+INR(Math.max(...monthlyData.map(m=>m.deployed)))),
          React.createElement("span",null,"Avg utilisation: "+(monthlyData.reduce((s,m)=>s+m.utilPct,0)/monthlyData.length).toFixed(1)+"%")
        )
      )
    ),

    /* ══ Report 2: Position Sizing Distribution ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"target",size:15}),"Position Sizing Distribution"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},sizingStats?sizingStats.count+" trades":"")
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        /* Stats row */
        sizingStats&&React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:16}},
          React.createElement("div",{style:{padding:"10px 12px",background:"var(--bg4)",borderRadius:10}},
            React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},"Average"),
            React.createElement("div",{style:{fontSize:15,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"var(--text)"}},INR(Math.round(sizingStats.avg)))
          ),
          React.createElement("div",{style:{padding:"10px 12px",background:"var(--bg4)",borderRadius:10}},
            React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},"Median"),
            React.createElement("div",{style:{fontSize:15,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"var(--text)"}},INR(Math.round(sizingStats.median)))
          ),
          React.createElement("div",{style:{padding:"10px 12px",background:"var(--bg4)",borderRadius:10}},
            React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},"Smallest"),
            React.createElement("div",{style:{fontSize:15,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"var(--text)"}},INR(Math.round(sizingStats.min)))
          ),
          React.createElement("div",{style:{padding:"10px 12px",background:"var(--bg4)",borderRadius:10}},
            React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},"Largest"),
            React.createElement("div",{style:{fontSize:15,fontFamily:"'Sora',sans-serif",fontWeight:700,color:"var(--text)"}},INR(Math.round(sizingStats.max)))
          )
        ),
        /* Distribution bars */
        React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8}},
          sizingStats&&sizingStats.buckets.map(b=>React.createElement("div",{key:b.label,style:{display:"flex",alignItems:"center",gap:10}},
            React.createElement("div",{style:{width:90,fontSize:11,color:"var(--text5)",textAlign:"right",flexShrink:0}},b.label),
            React.createElement("div",{style:{flex:1,height:20,background:"var(--bg4)",borderRadius:6,overflow:"hidden",position:"relative"}},
              React.createElement("div",{style:{height:"100%",width:(sizingStats.maxBucket>0?b.count/sizingStats.maxBucket*100:0)+"%",background:"var(--accent)",borderRadius:6,transition:"width .3s",minWidth:b.count>0?4:0}})
            ),
            React.createElement("div",{style:{width:36,fontSize:11,fontWeight:600,color:"var(--text)",textAlign:"right"}},b.count)
          ))
        ),
        /* Concentration insight */
        sizingStats&&React.createElement("div",{style:{marginTop:14,padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
          React.createElement("strong",{style:{color:"var(--accent)"}},"Concentration: "),
          sizingStats.max/sizingStats.avg>5
            ?"Your largest trade is "+(sizingStats.max/sizingStats.avg).toFixed(1)+"× your average — very concentrated. Consider diversifying position sizes."
            :sizingStats.median/sizingStats.avg<0.5
              ?"Your median is much lower than the mean — a few large trades are pulling the average up. Most trades are small."
              :"Your position sizes are relatively consistent. Good diversification across trade sizes."
        )
      )
    ),

    /* ══ Report 3: Opportunity Cost & Alpha ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"compare",size:15}),"Opportunity Cost Analysis"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},"vs index benchmarks")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16}},
        /* Your Returns vs Nifty */
        oppCost&&React.createElement("div",{style:{padding:16,background:oppCost.totalAlphaVsNifty>=0?"rgba(22,163,74,.06)":"rgba(239,68,68,.06)",border:"1px solid "+(oppCost.totalAlphaVsNifty>=0?"rgba(22,163,74,.18)":"rgba(239,68,68,.18)"),borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:1,marginBottom:10,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"chart",size:12})," vs Nifty 50 (12% CAGR)"),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Your Total P&L"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",color:alphaColor(oppCost.totalPnl)}},alphaSign(oppCost.totalPnl))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Index Would Have Earned"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#0e7490"}},"+"+INR(oppCost.totalNiftyReturn))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6,paddingTop:6,borderTop:"1px solid var(--border2)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Total Alpha"),
            React.createElement("span",{style:{fontSize:14,fontWeight:800,fontFamily:"'Sora',sans-serif",color:alphaColor(oppCost.totalAlphaVsNifty)}},alphaSign(oppCost.totalAlphaVsNifty))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Alpha / Trade"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:alphaColor(oppCost.avgAlphaNiftyPerTrade)}},alphaSign(oppCost.avgAlphaNiftyPerTrade))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Your Avg XIRR"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:alphaColor(oppCost.avgXirr-12)}},oppCost.avgXirr.toFixed(2)+"% (benchmark: 12%)")
          )
        ),
        /* Your Returns vs Sensex */
        oppCost&&React.createElement("div",{style:{padding:16,background:oppCost.totalAlphaVsSensex>=0?"rgba(22,163,74,.06)":"rgba(239,68,68,.06)",border:"1px solid "+(oppCost.totalAlphaVsSensex>=0?"rgba(22,163,74,.18)":"rgba(239,68,68,.18)"),borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"chart",size:13})," vs Sensex (12.5% CAGR)")),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Your Total P&L"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",color:alphaColor(oppCost.totalPnl)}},alphaSign(oppCost.totalPnl))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Index Would Have Earned"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#0e7490"}},"+"+INR(oppCost.totalSensexReturn))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6,paddingTop:6,borderTop:"1px solid var(--border2)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Total Alpha"),
            React.createElement("span",{style:{fontSize:14,fontWeight:800,fontFamily:"'Sora',sans-serif",color:alphaColor(oppCost.totalAlphaVsSensex)}},alphaSign(oppCost.totalAlphaVsSensex))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Alpha / Trade"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:alphaColor(oppCost.avgAlphaSensexPerTrade)}},alphaSign(oppCost.avgAlphaSensexPerTrade))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Your Avg XIRR"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:alphaColor(oppCost.avgXirr-12.5)}},oppCost.avgXirr.toFixed(2)+"% (benchmark: 12.5%)")
          )
        ),
        /* Insight */
        oppCost&&React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6,display:"flex",alignItems:"center",gap:5}},React.createElement(Icon,{n:"lightbulb",size:13}),"Opportunity Cost Insight"),
          React.createElement("div",{style:{fontSize:12,color:"var(--text4)",lineHeight:1.6}},
            "Across ",React.createElement("strong",null,trades.length)," trades totalling ",React.createElement("strong",null,INR(oppCost.totalBuyAmt))," deployed, ",
            oppCost.totalAlphaVsNifty>=0
              ?React.createElement(React.Fragment,null,"you generated ",React.createElement("strong",{style:{color:"#16a34a"}},alphaSign(oppCost.totalAlphaVsNifty))," in alpha vs Nifty 50. Your stock-picking is adding value above passive index investing.")
              :React.createElement(React.Fragment,null,"you underperformed Nifty 50 by ",React.createElement("strong",{style:{color:"#ef4444"}},INR(Math.abs(oppCost.totalAlphaVsNifty)))," on the same capital. A passive Nifty 50 index fund would have been more efficient."),
            " Average holding period: ",React.createElement("strong",null,Math.round(oppCost.avgHoldDays))," days."
          )
        )
      )
    ),

    /* ══ Report 4: Per-Trade Alpha Table ══ */
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"search",size:15}),"Per-Trade Alpha Breakdown"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},trades.length+" trades")
      ),
      React.createElement("div",{style:{overflowX:"auto"}},
        /* Header */
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr",minWidth:560,borderBottom:"1px solid var(--border)",background:"var(--bg5)"}},
          ["Stock","Capital","Hold Days","Your P&L","Nifty Return","Alpha"].map(h=>React.createElement("div",{key:h,style:{padding:"8px 10px",fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,textAlign:h==="Stock"?"left":"right"}},h))
        ),
        /* Rows */
        trades.slice(0,30).map(t=>React.createElement("div",{key:t.id+t.type,style:{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr",minWidth:560,borderBottom:"1px solid var(--border2)"}},
          React.createElement("div",{style:{padding:"9px 10px",fontSize:11,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},
            React.createElement("span",{style:{fontSize:9,padding:"1px 5px",borderRadius:4,background:t.type==="sold"?"var(--accentbg2)":"var(--bg4)",color:"var(--text5)",fontWeight:600}},t.type==="sold"?"S":"H"),
            t.company||t.ticker
          ),
          React.createElement("div",{style:{padding:"9px 10px",fontSize:11,textAlign:"right",fontWeight:600,color:"var(--text)"}},INR(t.buyAmt)),
          React.createElement("div",{style:{padding:"9px 10px",fontSize:11,textAlign:"right",color:"var(--text4)"}},t.holdDays+"d"),
          React.createElement("div",{style:{padding:"9px 10px",fontSize:11,textAlign:"right",fontWeight:600,color:alphaColor(t.pnl)}},alphaSign(t.pnl)),
          React.createElement("div",{style:{padding:"9px 10px",fontSize:11,textAlign:"right",color:"#0e7490"}},"+"+INR(t.niftyReturn)),
          React.createElement("div",{style:{padding:"9px 10px",fontSize:12,textAlign:"right",fontWeight:700,color:alphaColor(t.alphaVsNifty)}},alphaSign(t.alphaVsNifty))
        )),
        trades.length>30&&React.createElement("div",{style:{padding:"10px",textAlign:"center",fontSize:11,color:"var(--text5)",background:"var(--bg4)"}},"Showing 30 of "+trades.length+" trades")
      )
    ),

    /* ══ Report 5: Kelly Criterion Sizing ══ */
    kellyData&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"percent",size:15}),"Kelly Criterion Position Sizing"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},"optimal bet sizing")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16}},
        /* Kelly cards */
        React.createElement("div",{style:{padding:16,background:"rgba(14,116,144,.06)",border:"1px solid rgba(14,116,144,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#0e7490",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"chart",size:13})," Your Trading Edge")),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Win Rate"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"var(--text)"}},(kellyData.winRate*100).toFixed(1)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Win Return"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#16a34a"}},"+"+kellyData.avgWin.toFixed(2)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Loss Return"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#ef4444"}},"−"+kellyData.avgLoss.toFixed(2)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:6,borderTop:"1px solid var(--border2)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Win/Loss Ratio"),
            React.createElement("span",{style:{fontSize:14,fontWeight:800,fontFamily:"'Sora',sans-serif",color:kellyData.winLossRatio>=1.5?"#16a34a":kellyData.winLossRatio>=1?"#f59e0b":"#ef4444"}},kellyData.winLossRatio===Infinity?"∞":kellyData.winLossRatio.toFixed(2)+"×")
          )
        ),
        React.createElement("div",{style:{padding:16,background:"rgba(14,116,144,.06)",border:"1px solid rgba(14,116,144,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#0e7490",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"target",size:13})," Optimal Position Size")),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Full Kelly"),
            React.createElement("span",{style:{fontSize:18,fontWeight:800,fontFamily:"'Sora',sans-serif",color:"#0e7490"}},(kellyData.fullKelly*100).toFixed(1)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Half Kelly (conservative)"),
            React.createElement("span",{style:{fontSize:18,fontWeight:800,fontFamily:"'Sora',sans-serif",color:"#16a34a"}},(kellyData.halfKelly*100).toFixed(1)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:"1px solid var(--border2)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Actual Avg Position"),
            React.createElement("span",{style:{fontSize:14,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"var(--text)"}},kellyData.actualPct.toFixed(1)+"%")
          )
        ),
        /* Kelly formula explanation */
        React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6,display:"flex",alignItems:"center",gap:5}},React.createElement(Icon,{n:"lightbulb",size:13}),"Kelly Criterion Insight"),
          React.createElement("div",{style:{fontSize:12,color:"var(--text4)",lineHeight:1.6}},
            "The Kelly formula (",React.createElement("strong",null,"f* = W − (1−W)/R"),") suggests optimal bet sizing based on your edge. ",
            "Your full Kelly is ",React.createElement("strong",{style:{color:"#0e7490"}},(kellyData.fullKelly*100).toFixed(1)+"%"),
            " — meaning theoretically you should allocate ",(kellyData.fullKelly*100).toFixed(1)+"% of capital per trade. ",
            "Half-Kelly at ",React.createElement("strong",{style:{color:"#16a34a"}},(kellyData.halfKelly*100).toFixed(1)+"%"),
            " is recommended for real-world use (reduces variance by 50% while keeping 75% of growth). ",
            kellyData.winLossRatio<1
              ?"Your win/loss ratio is below 1 — Kelly suggests you should reduce position sizes or improve your edge before scaling up."
              :kellyData.fullKelly>0.25
                ?"Your edge is strong — you can afford larger position sizes. But never exceed half-Kelly in practice."
                :"Your edge is moderate. Focus on consistency rather than sizing up."
          )
        )
      )
    ),


    /* ══ Report 6: Stock-by-Stock Alpha vs Nifty ══ */
    stockAlphaData.length>0&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},
          React.createElement(Icon,{n:"chart",size:15}),"Stock-by-Stock Alpha vs Nifty"
        ),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},
          stockAlphaData.length+" stocks"
        )
      ),
      React.createElement("div",{className:"mobile-scroll-table",style:{overflowX:"auto"}},
        React.createElement("div",{style:{minWidth:700}},
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"2fr 60px 80px 80px 90px 70px 60px",gap:0,borderBottom:"1px solid var(--border)",background:"var(--bg4)"}},
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px"}},"Stock"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"Trades"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Your Return"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Nifty Return"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Alpha (₹)"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Alpha (%)"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"Win Rate")
          ),
          stockAlphaData.map((s,i)=>{
            const isPositiveAlpha=s.totalAlpha>=0;
            const niftyPct=s.totalBuyAmt>0?(s.totalNiftyReturn/s.totalBuyAmt*100):0;
            return React.createElement("div",{key:s.ticker||i,style:{display:"grid",gridTemplateColumns:"2fr 60px 80px 80px 90px 70px 60px",gap:0,borderBottom:"1px solid var(--border2)",background:i%2===0?"transparent":"var(--bg4)",transition:"background .1s"},onMouseEnter:e=>e.currentTarget.style.background="var(--accentbg2)",onMouseLeave:e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--bg4)"},
              React.createElement("div",{style:{padding:"9px 8px",display:"flex",flexDirection:"column",gap:2,minWidth:0}},
                React.createElement("div",{style:{fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},s.ticker)
              ),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"center",color:"var(--text3)"}},s.trades.length),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",fontWeight:600,color:s.returnPct>=0?"#16a34a":"#ef4444"}},(s.returnPct>=0?"+":"")+s.returnPct.toFixed(2)+"%"),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",color:"var(--text4)"}},(niftyPct>=0?"+":"")+niftyPct.toFixed(2)+"%"),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"right",fontWeight:700,fontFamily:"'Sora',sans-serif",color:isPositiveAlpha?"#16a34a":"#ef4444"}},(isPositiveAlpha?"+":"")+INR(s.totalAlpha)),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",fontWeight:600,color:isPositiveAlpha?"#16a34a":"#ef4444"}},(s.alphaPct>=0?"+":"")+s.alphaPct.toFixed(2)+"%"),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"center",fontWeight:600,color:s.winRate>=50?"#16a34a":"#ef4444"}},s.winRate.toFixed(0)+"%")
            );
          })
        )
      ),
      React.createElement("div",{style:{padding:"10px 16px",background:"var(--bg5)",borderTop:"1px solid var(--border)",fontSize:11,color:"var(--text5)",lineHeight:1.5}},
        "Alpha = Your P&L − Nifty return for same capital & holding period (12% CAGR benchmark). Positive alpha means you outperformed the index."
      )
    ),

    /* ══ Methodology note ══ */
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Capital deployed = sum of buy amounts (qty × buy price). Cumulative capital tracks total investment over time. Utilisation % = cumulative capital at month end ÷ total capital ever deployed. Position sizing uses gross buy amounts. Opportunity cost compares your net P&L against what the same capital would have earned in Nifty 50 (12% CAGR) or Sensex (12.5% CAGR) over identical holding periods: indexReturn = capital × ((1 + CAGR)^(days/365) − 1). Alpha = your P&L − index return. XIRR computed where both buy and sell dates are available. Kelly Criterion: f* = WinRate − (1−WinRate)/(AvgWin/AvgLoss), using return percentages. Half-Kelly is recommended for practical use. Active holdings use current price as exit. All amounts are gross of brokerage unless noted."
    )
  );
};


const BehaviouralPatterns=({shares,soldShareSnapshots={}})=>{

  /* ── Build unified trade list ── */
  const trades=React.useMemo(()=>{
    const list=[];
    (shares||[]).forEach(sh=>{
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      const buyDate=new Date(sh.buyDate+"T12:00:00");
      const sellDate=new Date(TODAY()+"T12:00:00");
      const holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
      const buyAmt=sh.qty*sh.buyPrice;
      const sellAmt=sh.qty*sh.currentPrice;
      const brokerage=+sh.brokerage||0;
      const pnl=sellAmt-buyAmt-brokerage;
      const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
      list.push({
        id:sh.id,type:"active",company:sh.company,ticker:sh.ticker,
        qty:sh.qty,buyPrice:sh.buyPrice,sellPrice:sh.currentPrice,
        buyDateStr:sh.buyDate,sellDateStr:TODAY(),
        buyDate,sellDate,holdDays,
        buyAmt,sellAmt,brokerage,pnl,returnPct,
      });
    });
    Object.values(soldShareSnapshots||{}).forEach(fySnaps=>{
      (fySnaps||[]).forEach(sn=>{
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate||!sn.savedAt)return;
        const buyDate=new Date(sn.buyDate+"T12:00:00");
        const sellDate=new Date(sn.savedAt+"T12:00:00");
        const holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
        const buyAmt=sn.qty*sn.buyPrice;
        const sellAmt=sn.qty*sn.sellPrice;
        const brokerage=+sn.brokerage||0;
        const pnl=sellAmt-buyAmt-brokerage;
        const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
        list.push({
          id:sn.id,type:"sold",company:sn.company,ticker:sn.ticker,
          qty:sn.qty,buyPrice:sn.buyPrice,sellPrice:sn.sellPrice,
          buyDateStr:sn.buyDate,sellDateStr:sn.savedAt,
          buyDate,sellDate,holdDays,
          buyAmt,sellAmt,brokerage,pnl,returnPct,
        });
      });
    });
    list.sort((a,b)=>a.buyDateStr.localeCompare(b.buyDateStr)||a.buyDate-b.buyDate);
    return list;
  },[shares,soldShareSnapshots]);

  /* ── Per-stock buy price series for dip detection ── */
  const stockBuySeries=React.useMemo(()=>{
    const map={};
    trades.forEach(t=>{
      const key=t.ticker||t.company;
      if(!map[key])map[key]=[];
      map[key].push({buyPrice:t.buyPrice,buyDate:t.buyDate,buyDateStr:t.buyDateStr,idx:map[key].length});
    });
    Object.values(map).forEach(arr=>{
      arr.forEach((entry,i)=>{
        if(i===0){entry.dipPct=0;entry.isDip=false;return;}
        const prevPrices=arr.slice(0,i).map(e=>e.buyPrice);
        const maxPrev=Math.max(...prevPrices);
        const avgPrev=prevPrices.reduce((s,v)=>s+v,0)/prevPrices.length;
        entry.dipPct=maxPrev>0?((maxPrev-entry.buyPrice)/maxPrev*100):0;
        entry.belowAvgPct=avgPrev>0?((avgPrev-entry.buyPrice)/avgPrev*100):0;
        entry.isDip=entry.dipPct>=5;
        entry.isMomentum=entry.buyPrice>=maxPrev;
      });
    });
    return map;
  },[trades]);

  /* ── Buy-the-dip vs momentum analysis ── */
  const dipVsMomentum=React.useMemo(()=>{
    if(trades.length<2)return null;
    const dipTrades=[];
    const momentumTrades=[];
    const neutralTrades=[];
    trades.forEach(t=>{
      const key=t.ticker||t.company;
      const series=stockBuySeries[key];
      if(!series)return;
      const entry=series.find(e=>e.buyDateStr===t.buyDateStr&&e.buyPrice===t.buyPrice);
      if(!entry||entry.idx===0){neutralTrades.push(t);return;}
      if(entry.isDip)dipTrades.push(t);
      else if(entry.isMomentum)momentumTrades.push(t);
      else neutralTrades.push(t);
    });
    const avgReturn=arr=>arr.length>0?arr.reduce((s,t)=>s+t.returnPct,0)/arr.length:0;
    const avgHold=arr=>arr.length>0?arr.reduce((s,t)=>s+t.holdDays,0)/arr.length:0;
    const winRate=arr=>arr.length>0?arr.filter(t=>t.pnl>0).length/arr.length*100:0;
    const totalPnl=arr=>arr.reduce((s,t)=>s+t.pnl,0);
    return{
      dip:{count:dipTrades.length,avgReturn:avgReturn(dipTrades),avgHold:avgHold(dipTrades),winRate:winRate(dipTrades),totalPnl:totalPnl(dipTrades)},
      momentum:{count:momentumTrades.length,avgReturn:avgReturn(momentumTrades),avgHold:avgHold(momentumTrades),winRate:winRate(momentumTrades),totalPnl:totalPnl(momentumTrades)},
      neutral:{count:neutralTrades.length,avgReturn:avgReturn(neutralTrades),avgHold:avgHold(neutralTrades),winRate:winRate(neutralTrades),totalPnl:totalPnl(neutralTrades)},
    };
  },[trades,stockBuySeries]);

  /* ── Premature exit bias ── */
  const prematureExits=React.useMemo(()=>{
    const soldTrades=trades.filter(t=>t.type==="sold");
    if(!soldTrades.length)return null;
    const currentPriceMap={};
    (shares||[]).forEach(sh=>{
      if(sh.ticker)currentPriceMap[sh.ticker]=sh.currentPrice;
      if(sh.company)currentPriceMap[sh.company]=sh.currentPrice;
    });
    const premature=[];
    const wellTimed=[];
    soldTrades.forEach(t=>{
      const currentPrice=currentPriceMap[t.ticker]||currentPriceMap[t.company];
      if(!currentPrice||!t.sellPrice)return;
      const continuedRise=((currentPrice-t.sellPrice)/t.sellPrice)*100;
      const entry={...t,continuedRise,currentPrice};
      if(continuedRise>10)premature.push(entry);
      else if(continuedRise<-5)wellTimed.push(entry);
    });
    const avgPrematureRise=premature.length>0?premature.reduce((s,t)=>s+t.continuedRise,0)/premature.length:0;
    const potentialMissed=premature.reduce((s,t)=>s+(t.qty*(t.currentPrice-t.sellPrice)),0);
    return{
      totalSold:soldTrades.length,
      premature:premature.sort((a,b)=>b.continuedRise-a.continuedRise),
      wellTimed,
      prematureCount:premature.length,
      wellTimedCount:wellTimed.length,
      avgPrematureRise,
      potentialMissed,
      prematurePct:soldTrades.length>0?(premature.length/soldTrades.length*100):0,
    };
  },[trades,shares]);

  /* ── Loss aversion indicator ── */
  const lossAversion=React.useMemo(()=>{
    if(!trades.length)return null;
    const winners=trades.filter(t=>t.pnl>0);
    const losers=trades.filter(t=>t.pnl<0);
    const avgWinHold=winners.length>0?winners.reduce((s,t)=>s+t.holdDays,0)/winners.length:0;
    const avgLossHold=losers.length>0?losers.reduce((s,t)=>s+t.holdDays,0)/losers.length:0;
    const holdRatio=avgWinHold>0?avgLossHold/avgWinHold:0;
    let severity="none";let severityColor="#16a34a";let severityLabel="Healthy";
    if(holdRatio>=1.5){severity="strong";severityColor="#ef4444";severityLabel="Strong Loss Aversion";}
    else if(holdRatio>=1.2){severity="moderate";severityColor="#f59e0b";severityLabel="Moderate Loss Aversion";}
    else if(holdRatio>=1){severity="mild";severityColor="#f59e0b";severityLabel="Mild Loss Aversion";}
    else if(holdRatio>=0.8){severity="balanced";severityColor="#16a34a";severityLabel="Balanced";}
    else{severity="fast-cut";severityColor="#0e7490";severityLabel="Quick Loss Cutter";}
    return{avgWinHold,avgLossHold,holdRatio,severity,severityColor,severityLabel,
      winnerCount:winners.length,loserCount:losers.length};
  },[trades]);

  /* ── Recency bias ── */
  const recencyBias=React.useMemo(()=>{
    if(trades.length<3)return null;
    const sorted=[...trades].sort((a,b)=>b.returnPct-a.returnPct);
    const bigWinThreshold=sorted[Math.floor(sorted.length*0.2)]?.returnPct||0;
    const bigWins=trades.filter(t=>t.returnPct>=bigWinThreshold&&t.pnl>0);
    if(!bigWins.length)return null;
    const POST_WINDOW=30;
    let postBigWinTrades=0;
    let postBigWinTotalAmt=0;
    let normalTradeCount=0;
    let normalTotalAmt=0;
    const bigWinDates=bigWins.map(b=>b.sellDateStr||b.buyDateStr);
    trades.forEach(t=>{
      const tDate=t.buyDateStr;
      const isAfter=bigWinDates.some(bd=>{
        const diff=(new Date(tDate+"T12:00:00")-new Date(bd+"T12:00:00"))/864e5;
        return diff>0&&diff<=POST_WINDOW;
      });
      if(isAfter){postBigWinTrades++;postBigWinTotalAmt+=t.buyAmt;}
      else{normalTradeCount++;normalTotalAmt+=t.buyAmt;}
    });
    const bigWinCount=bigWins.length;
    const avgPostTradesPerWin=bigWinCount>0?postBigWinTrades/bigWinCount:0;
    const totalDays=trades.length>1?Math.max(1,Math.floor((trades[trades.length-1].buyDate-trades[0].buyDate)/864e5)):1;
    const baselineTradesPer30=totalDays>0?(trades.length/totalDays*POST_WINDOW):0;
    const frequencyMultiplier=baselineTradesPer30>0?avgPostTradesPerWin/baselineTradesPer30:0;
    const avgPostAmt=postBigWinTrades>0?postBigWinTotalAmt/postBigWinTrades:0;
    const avgNormalAmt=normalTradeCount>0?normalTotalAmt/normalTradeCount:0;
    const sizeMultiplier=avgNormalAmt>0?avgPostAmt/avgNormalAmt:0;
    return{
      bigWinCount,bigWinThreshold:bigWinThreshold.toFixed(1),
      avgPostTradesPerWin:avgPostTradesPerWin.toFixed(1),
      baselineTradesPer30:baselineTradesPer30.toFixed(1),
      frequencyMultiplier:frequencyMultiplier.toFixed(2),
      avgPostAmt,avgNormalAmt,
      sizeMultiplier:sizeMultiplier.toFixed(2),
      isFreqBias:frequencyMultiplier>1.3,
      isSizeBias:sizeMultiplier>1.3,
    };
  },[trades]);

  /* ── Disposition effect score ── */
  const dispositionEffect=React.useMemo(()=>{
    if(!trades.length)return null;
    const holdDays=trades.map(t=>t.holdDays).sort((a,b)=>a-b);
    const medianHold=holdDays.length%2===0?(holdDays[holdDays.length/2-1]+holdDays[holdDays.length/2])/2:holdDays[Math.floor(holdDays.length/2)];
    const QUICK_THRESHOLD=Math.max(30,medianHold*0.5);
    const quickWins=trades.filter(t=>t.pnl>0&&t.holdDays<=QUICK_THRESHOLD);
    const quickLosses=trades.filter(t=>t.pnl<0&&t.holdDays<=QUICK_THRESHOLD);
    const slowWins=trades.filter(t=>t.pnl>0&&t.holdDays>QUICK_THRESHOLD);
    const slowLosses=trades.filter(t=>t.pnl<0&&t.holdDays>QUICK_THRESHOLD);
    const winners=trades.filter(t=>t.pnl>0);
    const losers=trades.filter(t=>t.pnl<0);
    const quickWinRate=winners.length>0?quickWins.length/winners.length:0;
    const quickLossRate=losers.length>0?quickLosses.length/losers.length:0;
    const dispositionScore=quickLossRate>0?quickWinRate/quickLossRate:quickWinRate>0?Infinity:0;
    let severity="none";let severityColor="#16a34a";let severityLabel="Balanced";
    if(dispositionScore>=2){severity="strong";severityColor="#ef4444";severityLabel="Strong Disposition Effect";}
    else if(dispositionScore>=1.5){severity="moderate";severityColor="#f59e0b";severityLabel="Moderate Disposition Effect";}
    else if(dispositionScore>=1.1){severity="mild";severityColor="#f59e0b";severityLabel="Mild Disposition Effect";}
    else if(dispositionScore>=0.7){severity="balanced";severityColor="#16a34a";severityLabel="Balanced";}
    else{severity="reverse";severityColor="#0e7490";severityLabel="Reverse Disposition (Good!)";}
    return{
      quickWins:quickWins.length,quickLosses:quickLosses.length,
      slowWins:slowWins.length,slowLosses:slowLosses.length,
      totalWins:winners.length,totalLosses:losers.length,
      quickWinRate:(quickWinRate*100).toFixed(1),
      quickLossRate:(quickLossRate*100).toFixed(1),
      dispositionScore:dispositionScore===Infinity?"∞":dispositionScore.toFixed(2),
      dispositionScoreNum:dispositionScore,
      severity,severityColor,severityLabel,
      quickThreshold:Math.round(QUICK_THRESHOLD),
      medianHold:Math.round(medianHold),
    };
  },[trades]);

  /* ── Empty state ── */
  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"lightbulb",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to Previous Trades to see behavioural pattern analytics.")
  );

  const pnlColor=v=>v>=0?"#16a34a":"#ef4444";
  const pnlSign=v=>(v>=0?"+":"")+INR(v);
  const sevBg=sevColor=>sevColor==="#ef4444"?"rgba(239,68,68,.07)":sevColor==="#f59e0b"?"rgba(245,158,11,.07)":sevColor==="#0e7490"?"rgba(14,116,144,.07)":"rgba(22,163,74,.07)";
  const sevBorder=sevColor=>sevColor==="#ef4444"?"rgba(239,68,68,.2)":sevColor==="#f59e0b"?"rgba(245,158,11,.2)":sevColor==="#0e7490"?"rgba(14,116,144,.2)":"rgba(22,163,74,.2)";

  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},
    /* ══ Summary Stat Cards ══ */
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12}},
      dispositionEffect&&React.createElement("div",{style:{background:sevBg(dispositionEffect.severityColor),border:"1px solid "+sevBorder(dispositionEffect.severityColor),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Disposition Score"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:dispositionEffect.severityColor}},dispositionEffect.dispositionScore),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},dispositionEffect.severityLabel)
      ),
      lossAversion&&React.createElement("div",{style:{background:sevBg(lossAversion.severityColor),border:"1px solid "+sevBorder(lossAversion.severityColor),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Loss Aversion Ratio"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:lossAversion.severityColor}},lossAversion.holdRatio.toFixed(2)+"×"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},lossAversion.severityLabel)
      ),
      dipVsMomentum&&React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Buy-the-Dip Rate"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},dipVsMomentum.dip.count+" / "+(dipVsMomentum.dip.count+dipVsMomentum.momentum.count+dipVsMomentum.neutral.count)),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},dipVsMomentum.dip.count+" dip buys found")
      ),
      prematureExits&&React.createElement("div",{style:{background:prematureExits.prematureCount>0?"rgba(239,68,68,.07)":"var(--bg4)",border:"1px solid "+(prematureExits.prematureCount>0?"rgba(239,68,68,.2)":"var(--border)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Premature Exits"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:prematureExits.prematureCount>0?"#ef4444":"var(--text)"}},prematureExits.prematureCount),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"of "+prematureExits.totalSold+" sold trades")
      ),
      recencyBias&&React.createElement("div",{style:{background:recencyBias.isFreqBias||recencyBias.isSizeBias?"rgba(245,158,11,.07)":"var(--bg4)",border:"1px solid "+(recencyBias.isFreqBias||recencyBias.isSizeBias?"rgba(245,158,11,.2)":"var(--border)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Recency Bias"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:recencyBias.isFreqBias||recencyBias.isSizeBias?"#f59e0b":"#16a34a"}},recencyBias.frequencyMultiplier+"×"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"freq after big wins")
      )
    ),

    /* ══ Report 1: Buy-the-Dip vs Momentum ══ */
    dipVsMomentum&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"trenddown",size:15}),"Buy-the-Dip vs ",React.createElement(Icon,{n:"invest",size:15})," Momentum"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},"entry timing analysis")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}},
        React.createElement("div",{style:{padding:16,background:"rgba(22,163,74,.06)",border:"1px solid rgba(22,163,74,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"trenddown",size:13})," Buy-the-Dip ("+dipVsMomentum.dip.count+")")),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginBottom:10}},"Entered ≥5% below previous buy price"),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Return"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:pnlColor(dipVsMomentum.dip.avgReturn)}},(dipVsMomentum.dip.avgReturn>=0?"+":"")+dipVsMomentum.dip.avgReturn.toFixed(2)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Win Rate"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)"}},dipVsMomentum.dip.winRate.toFixed(1)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Hold"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)"}},Math.round(dipVsMomentum.dip.avgHold)+" days")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:6,borderTop:"1px solid rgba(22,163,74,.15)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Total P&L"),
            React.createElement("span",{style:{fontSize:12,fontWeight:700,color:pnlColor(dipVsMomentum.dip.totalPnl)}},pnlSign(dipVsMomentum.dip.totalPnl))
          )
        ),
        React.createElement("div",{style:{padding:16,background:"rgba(14,116,144,.06)",border:"1px solid rgba(14,116,144,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#0e7490",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"invest",size:13})," Momentum ("+dipVsMomentum.momentum.count+")")),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginBottom:10}},"Entered at or above previous buy price"),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Return"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:pnlColor(dipVsMomentum.momentum.avgReturn)}},(dipVsMomentum.momentum.avgReturn>=0?"+":"")+dipVsMomentum.momentum.avgReturn.toFixed(2)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Win Rate"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)"}},dipVsMomentum.momentum.winRate.toFixed(1)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Hold"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)"}},Math.round(dipVsMomentum.momentum.avgHold)+" days")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:6,borderTop:"1px solid rgba(14,116,144,.15)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Total P&L"),
            React.createElement("span",{style:{fontSize:12,fontWeight:700,color:pnlColor(dipVsMomentum.momentum.totalPnl)}},pnlSign(dipVsMomentum.momentum.totalPnl))
          )
        ),
        dipVsMomentum.neutral.count>0&&React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"var(--text5)",textTransform:"uppercase",letterSpacing:1,marginBottom:8,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"balance",size:12})," Neutral / First Buys ("+dipVsMomentum.neutral.count+")"),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginBottom:10}},"First buy per stock (no prior reference)"),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Return"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:pnlColor(dipVsMomentum.neutral.avgReturn)}},(dipVsMomentum.neutral.avgReturn>=0?"+":"")+dipVsMomentum.neutral.avgReturn.toFixed(2)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Win Rate"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)"}},dipVsMomentum.neutral.winRate.toFixed(1)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Total P&L"),
            React.createElement("span",{style:{fontSize:12,fontWeight:700,color:pnlColor(dipVsMomentum.neutral.totalPnl)}},pnlSign(dipVsMomentum.neutral.totalPnl))
          )
        ),
        React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6,display:"flex",alignItems:"center",gap:5}},React.createElement(Icon,{n:"lightbulb",size:13}),"Entry Timing Insight"),
          React.createElement("div",{style:{fontSize:12,color:"var(--text4)",lineHeight:1.6}},
            dipVsMomentum.dip.count===0
              ?"No clear dip-buying pattern detected. You tend to buy at or above previous prices — this could be momentum chasing or averaging up intentionally."
              :dipVsMomentum.dip.avgReturn>dipVsMomentum.momentum.avgReturn
                ?React.createElement(React.Fragment,null,"Your dip buys average ",React.createElement("strong",{style:{color:"#16a34a"}},dipVsMomentum.dip.avgReturn.toFixed(1)+"%")," vs ",React.createElement("strong",null,dipVsMomentum.momentum.avgReturn.toFixed(1)+"%")," for momentum buys. Buying the dip is working — continue this discipline.")
                :dipVsMomentum.momentum.avgReturn>dipVsMomentum.dip.avgReturn
                  ?React.createElement(React.Fragment,null,"Your momentum buys (",React.createElement("strong",{style:{color:"#0e7490"}},dipVsMomentum.momentum.avgReturn.toFixed(1)+"%"),") outperform dip buys (",React.createElement("strong",null,dipVsMomentum.dip.avgReturn.toFixed(1)+"%"),"). You may be catching falling knives on dips — consider waiting for trend confirmation.")
                  :"Both strategies show similar returns. Your edge may come from stock selection rather than timing."
          )
        )
      )
    ),

    /* ══ Report 2: Premature Exit Bias ══ */
    prematureExits&&prematureExits.totalSold>0&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"bolt",size:15}),"Premature Exit Bias"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},prematureExits.prematureCount+" premature of "+prematureExits.totalSold)
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}},
        React.createElement("div",{style:{padding:16,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#ef4444",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"warning",size:13})," Premature Exits")),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Count"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"#ef4444"}},prematureExits.prematureCount+" trades")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"% of Sold Trades"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#ef4444"}},prematureExits.prematurePct.toFixed(1)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Rise After Sell"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#ef4444"}},"+"+prematureExits.avgPrematureRise.toFixed(1)+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:6,borderTop:"1px solid rgba(239,68,68,.15)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Potential ₹ Missed"),
            React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"#ef4444"}},"+"+INR(prematureExits.potentialMissed))
          )
        ),
        React.createElement("div",{style:{padding:16,background:"rgba(22,163,74,.06)",border:"1px solid rgba(22,163,74,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:8,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"checkcircle",size:12,color:"#16a34a"})," Well-Timed Exits"),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Count"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"#16a34a"}},prematureExits.wellTimedCount+" trades")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"% of Sold Trades"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#16a34a"}},prematureExits.totalSold>0?(prematureExits.wellTimedCount/prematureExits.totalSold*100).toFixed(1)+"%":"0%")
          ),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginTop:6}},"Price dropped >5% after selling — good exits")
        ),
        prematureExits.premature.length>0&&React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:8,display:"flex",alignItems:"center",gap:5}},React.createElement(Icon,{n:"search",size:13}),"Worst Premature Exits"),
          React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:6}},
            prematureExits.premature.slice(0,5).map((t,i)=>React.createElement("div",{key:t.id+t.type,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:i===0?"rgba(239,68,68,.08)":"transparent",borderRadius:6,fontSize:11}},
              React.createElement("span",{style:{color:"var(--text)",fontWeight:i===0?600:400}},(i+1)+". "+t.company),
              React.createElement("span",{style:{color:"#ef4444",fontWeight:600}},"+"+t.continuedRise.toFixed(1)+"% after sell (sold at "+INR(t.sellPrice)+", now "+INR(t.currentPrice)+")")
            ))
          ),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginTop:8,lineHeight:1.5}},
            React.createElement("strong",{style:{color:"var(--accent)"}},"Pattern: "),
            prematureExits.prematurePct>30
              ?"You prematurely exit "+prematureExits.prematurePct.toFixed(0)+"% of sold trades. Consider using trailing stop-losses instead of fixed targets to let winners run."
              :prematureExits.prematurePct>15
                ?"Some premature exits detected. Review your exit criteria — are you selling based on fear or fundamentals?"
                :"Your exits are generally well-timed. Few trades show significant post-sale price increases."
          )
        )
      )
    ),

    /* ══ Report 3: Loss Aversion Indicator ══ */
    lossAversion&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"warning",size:15}),"Loss Aversion Indicator"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:sevBg(lossAversion.severityColor),color:lossAversion.severityColor,border:"1px solid "+sevBorder(lossAversion.severityColor),fontWeight:600}},lossAversion.severityLabel)
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}},
        React.createElement("div",{style:{padding:16,background:"rgba(14,116,144,.06)",border:"1px solid rgba(14,116,144,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#0e7490",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"chart",size:13})," Hold Time Comparison")),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Winner Hold"),
            React.createElement("span",{style:{fontSize:14,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"#16a34a"}},Math.round(lossAversion.avgWinHold)+" days")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Loser Hold"),
            React.createElement("span",{style:{fontSize:14,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"#ef4444"}},Math.round(lossAversion.avgLossHold)+" days")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:"1px solid var(--border2)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Ratio (Loss ÷ Win)"),
            React.createElement("span",{style:{fontSize:16,fontWeight:800,fontFamily:"'Sora',sans-serif",color:lossAversion.severityColor}},lossAversion.holdRatio.toFixed(2)+"×")
          ),
          React.createElement("div",{style:{display:"flex",gap:12,marginTop:10,fontSize:10,color:"var(--text5)"}},
            React.createElement("span",null,lossAversion.winnerCount+" winners"),
            React.createElement("span",null,lossAversion.loserCount+" losers")
          )
        ),
        React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:1,marginBottom:12,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"compare",size:12})," Visual Hold Time"),
          React.createElement("div",{style:{marginBottom:10}},
            React.createElement("div",{style:{fontSize:10,color:"#16a34a",marginBottom:4}},"Winners: "+Math.round(lossAversion.avgWinHold)+" days"),
            React.createElement("div",{style:{height:18,background:"var(--bg5)",borderRadius:6,overflow:"hidden"}},
              React.createElement("div",{style:{height:"100%",width:Math.min(100,lossAversion.avgWinHold/Math.max(lossAversion.avgWinHold,lossAversion.avgLossHold)*100)+"%",background:"#16a34a",borderRadius:6}})
            )
          ),
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:10,color:"#ef4444",marginBottom:4}},"Losers: "+Math.round(lossAversion.avgLossHold)+" days"),
            React.createElement("div",{style:{height:18,background:"var(--bg5)",borderRadius:6,overflow:"hidden"}},
              React.createElement("div",{style:{height:"100%",width:Math.min(100,lossAversion.avgLossHold/Math.max(lossAversion.avgWinHold,lossAversion.avgLossHold)*100)+"%",background:"#ef4444",borderRadius:6}})
            )
          )
        ),
        React.createElement("div",{style:{padding:16,background:sevBg(lossAversion.severityColor),border:"1px solid "+sevBorder(lossAversion.severityColor),borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6,display:"flex",alignItems:"center",gap:5}},React.createElement(Icon,{n:"lightbulb",size:13}),"Loss Aversion Insight"),
          React.createElement("div",{style:{fontSize:12,color:"var(--text4)",lineHeight:1.6}},
            lossAversion.holdRatio>=1.5
              ?React.createElement(React.Fragment,null,"You hold losers ",React.createElement("strong",{style:{color:"#ef4444"}},lossAversion.holdRatio.toFixed(1)+"×")," longer than winners on average. This is a classic loss aversion bias — you're hoping losers will recover while cutting winners short. Consider setting strict stop-losses and letting winners run.")
              :lossAversion.holdRatio>=1.2
                ?React.createElement(React.Fragment,null,"Mild loss aversion detected — losers are held ",React.createElement("strong",{style:{color:"#f59e0b"}},lossAversion.holdRatio.toFixed(1)+"×")," longer. You're partially aware of this tendency. Enforce stop-losses to bring the ratio below 1.")
                :lossAversion.holdRatio>=0.8
                  ?React.createElement(React.Fragment,null,"Your hold times are balanced — ratio of ",React.createElement("strong",{style:{color:"#16a34a"}},lossAversion.holdRatio.toFixed(2)+"×"),". You're not showing strong loss aversion. Good discipline!")
                  :React.createElement(React.Fragment,null,"You cut losers faster than you hold winners — ratio of ",React.createElement("strong",{style:{color:"#0e7490"}},lossAversion.holdRatio.toFixed(2)+"×"),". This is the opposite of loss aversion and a strong trait. Keep it up!")
          )
        )
      )
    ),

    /* ══ Report 4: Recency Bias ══ */
    recencyBias&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"refresh",size:15}),"Recency Bias Analysis"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},recencyBias.bigWinCount+" big wins analysed")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}},
        React.createElement("div",{style:{padding:16,background:recencyBias.isFreqBias?"rgba(245,158,11,.06)":"rgba(22,163,74,.06)",border:"1px solid "+(recencyBias.isFreqBias?"rgba(245,158,11,.18)":"rgba(22,163,74,.18)"),borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:recencyBias.isFreqBias?"#f59e0b":"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"chart",size:13})," Trade Frequency After Big Wins")),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Trades (30d after win)"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"var(--text)"}},recencyBias.avgPostTradesPerWin)
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Baseline (30d avg)"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text4)"}},recencyBias.baselineTradesPer30)
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:6,borderTop:"1px solid var(--border2)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Multiplier"),
            React.createElement("span",{style:{fontSize:14,fontWeight:800,fontFamily:"'Sora',sans-serif",color:recencyBias.isFreqBias?"#f59e0b":"#16a34a"}},recencyBias.frequencyMultiplier+"×")
          ),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:6}},recencyBias.isFreqBias?"You trade "+recencyBias.frequencyMultiplier+"× more frequently after big wins":"Trade frequency is stable after wins")
        ),
        React.createElement("div",{style:{padding:16,background:recencyBias.isSizeBias?"rgba(245,158,11,.06)":"rgba(22,163,74,.06)",border:"1px solid "+(recencyBias.isSizeBias?"rgba(245,158,11,.18)":"rgba(22,163,74,.18)"),borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:recencyBias.isSizeBias?"#f59e0b":"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:10,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"money",size:12})," Trade Size After Big Wins"),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Avg Size After Win"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"var(--text)"}},"₹"+Number(Math.round(recencyBias.avgPostAmt)).toLocaleString("en-IN"))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Normal Avg Size"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text4)"}},"₹"+Number(Math.round(recencyBias.avgNormalAmt)).toLocaleString("en-IN"))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:6,borderTop:"1px solid var(--border2)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Size Multiplier"),
            React.createElement("span",{style:{fontSize:14,fontWeight:800,fontFamily:"'Sora',sans-serif",color:recencyBias.isSizeBias?"#f59e0b":"#16a34a"}},recencyBias.sizeMultiplier+"×")
          ),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:6}},recencyBias.isSizeBias?"You bet "+recencyBias.sizeMultiplier+"× bigger after big wins — overconfidence":"Position sizing stays consistent after wins")
        ),
        React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6,display:"flex",alignItems:"center",gap:5}},React.createElement(Icon,{n:"lightbulb",size:13}),"Recency Bias Insight"),
          React.createElement("div",{style:{fontSize:12,color:"var(--text4)",lineHeight:1.6}},
            recencyBias.isFreqBias&&recencyBias.isSizeBias
              ?React.createElement(React.Fragment,null,"Strong recency bias detected. After big wins (top 20%, ≥",recencyBias.bigWinThreshold,"% return), you trade ",React.createElement("strong",{style:{color:"#f59e0b"}},recencyBias.frequencyMultiplier+"×")," more often and bet ",React.createElement("strong",{style:{color:"#f59e0b"}},recencyBias.sizeMultiplier+"×")," bigger. This overconfidence often leads to giving back gains. Consider a cooling-off rule after big wins.")
              :recencyBias.isFreqBias
                ?React.createElement(React.Fragment,null,"You increase trade frequency (",React.createElement("strong",{style:{color:"#f59e0b"}},recencyBias.frequencyMultiplier+"×"),") after big wins but keep sizes steady. The increased activity may lead to lower-quality trades. Quality over quantity.")
                :recencyBias.isSizeBias
                  ?React.createElement(React.Fragment,null,"You increase position size (",React.createElement("strong",{style:{color:"#f59e0b"}},recencyBias.sizeMultiplier+"×"),") after big wins. This 'house money' effect can be dangerous — a single large loss can wipe out multiple small wins. Keep sizing consistent.")
                  :React.createElement(React.Fragment,null,"No significant recency bias detected. Your trade frequency and sizing remain consistent regardless of recent results. This is disciplined behaviour.")
          )
        )
      )
    ),

    /* ══ Report 5: Disposition Effect Score ══ */
    dispositionEffect&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"target",size:15}),"Disposition Effect Score"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:sevBg(dispositionEffect.severityColor),color:dispositionEffect.severityColor,border:"1px solid "+sevBorder(dispositionEffect.severityColor),fontWeight:600}},dispositionEffect.severityLabel)
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}},
        React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"chart",size:13})," Trade Exit Speed (threshold: "+dispositionEffect.quickThreshold+" days)")),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6,padding:"6px 8px",background:"rgba(22,163,74,.06)",borderRadius:6}},
            React.createElement("span",{style:{fontSize:11,color:"#16a34a"}},"Quick Wins (≤"+dispositionEffect.quickThreshold+"d)"),
            React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"#16a34a"}},dispositionEffect.quickWins+" / "+dispositionEffect.totalWins)
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6,padding:"6px 8px",background:"rgba(22,163,74,.03)",borderRadius:6}},
            React.createElement("span",{style:{fontSize:11,color:"#16a34a"}},"Slow Wins (>"+dispositionEffect.quickThreshold+"d)"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#16a34a"}},dispositionEffect.slowWins+" / "+dispositionEffect.totalWins)
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6,padding:"6px 8px",background:"rgba(239,68,68,.06)",borderRadius:6}},
            React.createElement("span",{style:{fontSize:11,color:"#ef4444"}},"Quick Losses (≤"+dispositionEffect.quickThreshold+"d)"),
            React.createElement("span",{style:{fontSize:12,fontWeight:700,color:"#ef4444"}},dispositionEffect.quickLosses+" / "+dispositionEffect.totalLosses)
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",padding:"6px 8px",background:"rgba(239,68,68,.03)",borderRadius:6}},
            React.createElement("span",{style:{fontSize:11,color:"#ef4444"}},"Slow Losses (>"+dispositionEffect.quickThreshold+"d)"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#ef4444"}},dispositionEffect.slowLosses+" / "+dispositionEffect.totalLosses)
          )
        ),
        React.createElement("div",{style:{padding:16,background:sevBg(dispositionEffect.severityColor),border:"1px solid "+sevBorder(dispositionEffect.severityColor),borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"target",size:13})," Disposition Score Breakdown")),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Quick Win Rate"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#16a34a"}},dispositionEffect.quickWinRate+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Quick Loss Rate"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"#ef4444"}},dispositionEffect.quickLossRate+"%")
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:"1px solid var(--border2)",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Score (WinRate ÷ LossRate)"),
            React.createElement("span",{style:{fontSize:16,fontWeight:800,fontFamily:"'Sora',sans-serif",color:dispositionEffect.severityColor}},dispositionEffect.dispositionScore)
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Median Hold Period"),
            React.createElement("span",{style:{fontSize:12,fontWeight:600,color:"var(--text)"}},dispositionEffect.medianHold+" days")
          )
        ),
        React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6,display:"flex",alignItems:"center",gap:5}},React.createElement(Icon,{n:"lightbulb",size:13}),"Disposition Effect Insight"),
          React.createElement("div",{style:{fontSize:12,color:"var(--text4)",lineHeight:1.6}},
            "The disposition effect is the tendency to sell winners quickly (to lock in gains) while holding losers (hoping for recovery). ",
            "Your score of ",React.createElement("strong",{style:{color:dispositionEffect.severityColor}},dispositionEffect.dispositionScore),
            " means: ",dispositionEffect.quickWinRate,"% of wins are realised within "+dispositionEffect.quickThreshold+" days vs ",
            dispositionEffect.quickLossRate,"% of losses. ",
            dispositionEffect.dispositionScoreNum>=2
              ?React.createElement(React.Fragment,null,"Strong disposition effect — you're locking in gains too early while letting losses run. Try the opposite: set profit targets that are 2-3× your stop-loss distance, and enforce stop-losses mechanically.")
              :dispositionEffect.dispositionScoreNum>=1.5
                ?React.createElement(React.Fragment,null,"Moderate disposition effect. You tend to sell winners faster than losers. Consider using trailing stops instead of fixed targets, and pre-define your exit criteria before entering.")
                :dispositionEffect.dispositionScoreNum>=0.7
                  ?React.createElement(React.Fragment,null,"Balanced exit behaviour — you're not showing a strong disposition effect. Your exit timing is relatively consistent across winners and losers.")
                  :React.createElement(React.Fragment,null,"Reverse disposition — you actually hold winners longer and cut losers quickly. This is the ideal pattern for long-term returns. Well done!")
          )
        )
      )
    ),

    /* ══ Methodology note ══ */
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Buy-the-dip detection: for each stock, a buy is classified as 'dip' if the buy price is ≥5% below the highest previous buy price for that stock, and 'momentum' if at or above. Premature exits: sold trades where the stock's current price is >10% above the sell price. Well-timed exits: price dropped >5% after selling. Loss aversion ratio = average loser hold days ÷ average winner hold days; >1.2 indicates loss aversion. Recency bias: compares trade frequency and size in the 30 days after a 'big win' (top 20% by return) to the overall baseline. Disposition score = (quick win rate) ÷ (quick loss rate), where 'quick' = held ≤30 days or half the median hold period (whichever is greater). Active holdings use current price as exit. All amounts are gross of brokerage."
    )
  );
};



const TradeTimingCorrelation=({shares,soldShareSnapshots={}})=>{

  /* ── Build unified trade list ── */
  const trades=React.useMemo(()=>{
    const list=[];
    (shares||[]).forEach(sh=>{
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      const buyDate=new Date(sh.buyDate+"T12:00:00");
      const sellDate=new Date(TODAY()+"T12:00:00");
      const holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
      const buyAmt=sh.qty*sh.buyPrice;
      const sellAmt=sh.qty*sh.currentPrice;
      const brokerage=+sh.brokerage||0;
      const pnl=sellAmt-buyAmt-brokerage;
      const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
      const buyDay=buyDate.getDay();
      const buyMonth=buyDate.getMonth();
      list.push({
        id:sh.id,type:"active",company:sh.company,ticker:sh.ticker,
        qty:sh.qty,buyPrice:sh.buyPrice,sellPrice:sh.currentPrice,
        buyDateStr:sh.buyDate,sellDateStr:TODAY(),
        buyDate,sellDate,holdDays,
        buyAmt,sellAmt,brokerage,pnl,returnPct,
        buyDay,buyMonth,sellDay:null,sellMonth:null,
      });
    });
    Object.values(soldShareSnapshots||{}).forEach(fySnaps=>{
      (fySnaps||[]).forEach(sn=>{
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate||!sn.savedAt)return;
        const buyDate=new Date(sn.buyDate+"T12:00:00");
        const sellDate=new Date(sn.savedAt+"T12:00:00");
        const holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
        const buyAmt=sn.qty*sn.buyPrice;
        const sellAmt=sn.qty*sn.sellPrice;
        const brokerage=+sn.brokerage||0;
        const pnl=sellAmt-buyAmt-brokerage;
        const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
        const buyDay=buyDate.getDay();
        const buyMonth=buyDate.getMonth();
        const sellDay=sellDate.getDay();
        const sellMonth=sellDate.getMonth();
        list.push({
          id:sn.id,type:"sold",company:sn.company,ticker:sn.ticker,
          qty:sn.qty,buyPrice:sn.buyPrice,sellPrice:sn.sellPrice,
          buyDateStr:sn.buyDate,sellDateStr:sn.savedAt,
          buyDate,sellDate,holdDays,
          buyAmt,sellAmt,brokerage,pnl,returnPct,
          buyDay,buyMonth,sellDay,sellMonth,
        });
      });
    });
    list.sort((a,b)=>a.buyDateStr.localeCompare(b.buyDateStr));
    return list;
  },[shares,soldShareSnapshots]);

  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  /* ── Buy day-of-week effect ── */
  const buyDayStats=React.useMemo(()=>{
    if(!trades.length)return null;
    const byDay=Array.from({length:7},()=>({count:0,totalPnl:0,totalReturn:0,totalBuyAmt:0,wins:0,holdDays:0}));
    trades.forEach(t=>{
      const d=t.buyDay;
      byDay[d].count++;
      byDay[d].totalPnl+=t.pnl;
      byDay[d].totalReturn+=t.returnPct;
      byDay[d].totalBuyAmt+=t.buyAmt;
      byDay[d].holdDays+=t.holdDays;
      if(t.pnl>0)byDay[d].wins++;
    });
    const stats=byDay.map((s,i)=>({
      day:i,label:DAYS[i],count:s.count,
      avgReturn:s.count>0?s.totalReturn/s.count:0,
      avgPnl:s.count>0?s.totalPnl/s.count:0,
      totalPnl:s.totalPnl,
      winRate:s.count>0?(s.wins/s.count*100):0,
      totalBuyAmt:s.totalBuyAmt,
      avgHold:s.count>0?Math.round(s.holdDays/s.count):0,
    }));
    const withTrades=stats.filter(s=>s.count>0);
    const best=withTrades.length?withTrades.reduce((a,b)=>b.avgReturn>a.avgReturn?b:a):null;
    const worst=withTrades.length?withTrades.reduce((a,b)=>b.avgReturn<a.avgReturn?b:a):null;
    return{stats,best,worst};
  },[trades]);

  /* ── Sell day-of-week effect ── */
  const sellDayStats=React.useMemo(()=>{
    const soldTrades=trades.filter(t=>t.type==="sold"&&t.sellDay!==null);
    if(!soldTrades.length)return null;
    const byDay=Array.from({length:7},()=>({count:0,totalPnl:0,totalReturn:0,wins:0}));
    soldTrades.forEach(t=>{
      const d=t.sellDay;
      byDay[d].count++;
      byDay[d].totalPnl+=t.pnl;
      byDay[d].totalReturn+=t.returnPct;
      if(t.pnl>0)byDay[d].wins++;
    });
    const stats=byDay.map((s,i)=>({
      day:i,label:DAYS[i],count:s.count,
      avgReturn:s.count>0?s.totalReturn/s.count:0,
      avgPnl:s.count>0?s.totalPnl/s.count:0,
      totalPnl:s.totalPnl,
      winRate:s.count>0?(s.wins/s.count*100):0,
    }));
    const withTrades=stats.filter(s=>s.count>0);
    const best=withTrades.length?withTrades.reduce((a,b)=>b.avgReturn>a.avgReturn?b:a):null;
    const worst=withTrades.length?withTrades.reduce((a,b)=>b.avgReturn<a.avgReturn?b:a):null;
    return{stats,best,worst,totalSold:soldTrades.length};
  },[trades]);

  /* ── Month-of-year entry performance ── */
  const monthStats=React.useMemo(()=>{
    if(!trades.length)return null;
    const byMonth=Array.from({length:12},()=>({count:0,totalPnl:0,totalReturn:0,wins:0,totalBuyAmt:0}));
    trades.forEach(t=>{
      const m=t.buyMonth;
      byMonth[m].count++;
      byMonth[m].totalPnl+=t.pnl;
      byMonth[m].totalReturn+=t.returnPct;
      byMonth[m].totalBuyAmt+=t.buyAmt;
      if(t.pnl>0)byMonth[m].wins++;
    });
    const stats=byMonth.map((s,i)=>({
      month:i,label:MONTHS[i],count:s.count,
      avgReturn:s.count>0?s.totalReturn/s.count:0,
      totalPnl:s.totalPnl,
      winRate:s.count>0?(s.wins/s.count*100):0,
      totalBuyAmt:s.totalBuyAmt,
    }));
    const withTrades=stats.filter(s=>s.count>0);
    const best=withTrades.length?withTrades.reduce((a,b)=>b.avgReturn>a.avgReturn?b:a):null;
    const worst=withTrades.length?withTrades.reduce((a,b)=>b.avgReturn<a.avgReturn?b:a):null;
    /* Sell-in-May analysis */
    const summerMonths=[4,5,6,7]; /* May-Aug */
    const winterMonths=[0,1,2,3,8,9,10,11]; /* rest */
    const summerTrades=trades.filter(t=>summerMonths.includes(t.buyMonth));
    const winterTrades=trades.filter(t=>winterMonths.includes(t.buyMonth));
    const avgReturn=arr=>arr.length>0?arr.reduce((s,t)=>s+t.returnPct,0)/arr.length:0;
    const winRate=arr=>arr.length>0?arr.filter(t=>t.pnl>0).length/arr.length*100:0;
    return{stats,best,worst,
      summer:{count:summerTrades.length,avgReturn:avgReturn(summerTrades),winRate:winRate(summerTrades)},
      winter:{count:winterTrades.length,avgReturn:avgReturn(winterTrades),winRate:winRate(winterTrades)},
    };
  },[trades]);

  /* ── Time-in-market distribution ── */
  const timeInMarket=React.useMemo(()=>{
    if(!trades.length)return null;
    /* Build day-by-day occupancy map */
    const allDates=trades.map(t=>({start:t.buyDate,end:t.sellDate}));
    const earliest=new Date(Math.min(...allDates.map(d=>d.start)));
    const latest=new Date(Math.max(...allDates.map(d=>d.end)));
    const totalCalendarDays=Math.max(1,Math.floor((latest-earliest)/864e5));
    /* For each calendar day, check if any trade was active */
    const MS_PER_DAY=864e5;
    let daysWithCapital=0;
    let daysWithMultiple=0;
    /* Use monthly buckets for distribution */
    const monthlyOccupancy={};
    for(let d=new Date(earliest);d<=latest;d=new Date(d.getTime()+MS_PER_DAY)){
      const ym=d.toISOString().slice(0,7);
      if(!monthlyOccupancy[ym])monthlyOccupancy[ym]={days:0,occupied:0};
      monthlyOccupancy[ym].days++;
      let activeCount=0;
      for(const t of allDates){
        if(d>=t.start&&d<=t.end){activeCount++;break;}
      }
      if(activeCount>0){daysWithCapital++;monthlyOccupancy[ym].occupied++;}
      if(activeCount>1)daysWithMultiple++;
    }
    const pct=totalCalendarDays>0?(daysWithCapital/totalCalendarDays*100):0;
    const months=Object.entries(monthlyOccupancy).map(([ym,v])=>({
      month:ym,occupied:v.occupied,total:v.days,
      pct:v.days>0?(v.occupied/v.days*100):0,
    })).sort((a,b)=>a.month.localeCompare(b.month));
    return{
      totalCalendarDays,daysWithCapital,daysWithMultiple,
      pct,daysIdle:totalCalendarDays-daysWithCapital,
      months,
    };
  },[trades]);

  /* ── Empty state ── */
  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"alarmclock",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to Previous Trades to see timing correlation analytics.")
  );

  const retColor=v=>v>=0?"#16a34a":"#ef4444";
  const retSign=v=>(v>=0?"+":"")+v.toFixed(2)+"%";

  /* Bar helper */
  const BarPct=({pct,color,maxPct=100})=>React.createElement("div",{style:{height:8,background:"var(--bg5)",borderRadius:4,overflow:"hidden",flex:1}},
    React.createElement("div",{style:{height:"100%",width:Math.min(100,pct/maxPct*100)+"%",background:color||"var(--accent)",borderRadius:4,transition:"width .3s"}})
  );

  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},
    /* ══ Summary Stat Cards ══ */
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12}},
      buyDayStats&&buyDayStats.best&&React.createElement("div",{style:{background:"rgba(22,163,74,.07)",border:"1px solid rgba(22,163,74,.2)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Best Buy Day"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#16a34a"}},buyDayStats.best.label),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},retSign(buyDayStats.best.avgReturn)+" avg ("+buyDayStats.best.count+" trades)")
      ),
      monthStats&&monthStats.best&&React.createElement("div",{style:{background:"rgba(22,163,74,.07)",border:"1px solid rgba(22,163,74,.2)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Best Entry Month"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#16a34a"}},monthStats.best.label),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},retSign(monthStats.best.avgReturn)+" avg ("+monthStats.best.count+" trades)")
      ),
      timeInMarket&&React.createElement("div",{style:{background:"rgba(14,116,144,.07)",border:"1px solid rgba(14,116,144,.2)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Time in Market"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#0e7490"}},timeInMarket.pct.toFixed(1)+"%"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},timeInMarket.daysWithCapital+" of "+timeInMarket.totalCalendarDays+" days")
      ),
      monthStats&&(()=>{
              const sellInMay=monthStats.summer.avgReturn<monthStats.winter.avgReturn;
              return React.createElement("div",{style:{background:sellInMay?"rgba(245,158,11,.07)":"rgba(22,163,74,.07)",border:"1px solid "+(sellInMay?"rgba(245,158,11,.2)":"rgba(22,163,74,.2)"),borderRadius:12,padding:"14px 16px"}},
                React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Sell in May?"),
                React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:sellInMay?"#f59e0b":"#16a34a"}},sellInMay?"Yes":"No"),
                React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Summer: "+retSign(monthStats.summer.avgReturn)+" vs Winter: "+retSign(monthStats.winter.avgReturn))
              );
            })()
    ),

    /* ══ Report 1: Buy Day-of-Week Effect ══ */
    buyDayStats&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"calendar",size:15}),"Buy Day-of-Week Effect"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},trades.length+" trades")
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        /* Header */
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"70px 1fr 60px 70px 70px 60px",gap:8,marginBottom:8,padding:"0 4px",fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},
          React.createElement("div",null,"Day"),
          React.createElement("div",null,"Avg Return"),
          React.createElement("div",{textAlign:"right"},"Count"),
          React.createElement("div",{textAlign:"right"},"Win %"),
          React.createElement("div",{textAlign:"right"},"Avg P&L"),
          React.createElement("div",{textAlign:"right"},"Avg Hold")
        ),
        /* Rows */
        buyDayStats.stats.filter(s=>s.count>0).sort((a,b)=>b.avgReturn-a.avgReturn).map(s=>{
          const isBest=buyDayStats.best&&s.day===buyDayStats.best.day;
          const isWorst=buyDayStats.worst&&s.day===buyDayStats.worst.day;
          const maxRet=Math.max(...buyDayStats.stats.filter(x=>x.count>0).map(x=>Math.abs(x.avgReturn)),1);
          return React.createElement("div",{key:s.day,style:{display:"grid",gridTemplateColumns:"70px 1fr 60px 70px 70px 60px",gap:8,padding:"8px 4px",borderBottom:"1px solid var(--border2)",background:isBest?"rgba(22,163,74,.04)":isWorst?"rgba(239,68,68,.04)":"transparent",borderRadius:isBest||isWorst?6:0}},
            React.createElement("div",{style:{fontSize:12,fontWeight:600,color:isBest?"#16a34a":isWorst?"#ef4444":"var(--text)"}},s.label,React.createElement("span",{style:{fontSize:9,color:"var(--text5)",marginLeft:4}},s.day===buyDayStats.best?.day?"★":s.day===buyDayStats.worst?.day?"▼":"")),
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6}},
              React.createElement(BarPct,{pct:Math.abs(s.avgReturn),maxPct:maxRet,color:retColor(s.avgReturn)}),
              React.createElement("span",{style:{fontSize:11,fontWeight:600,color:retColor(s.avgReturn),minWidth:52,textAlign:"right"}},retSign(s.avgReturn))
            ),
            React.createElement("div",{style:{fontSize:11,textAlign:"right",color:"var(--text4)"}},s.count),
            React.createElement("div",{style:{fontSize:11,textAlign:"right",fontWeight:600,color:s.winRate>=50?"#16a34a":"#ef4444"}},s.winRate.toFixed(0)+"%"),
            React.createElement("div",{style:{fontSize:11,textAlign:"right",fontWeight:600,color:retColor(s.avgPnl)}},(s.avgPnl>=0?"+":"")+INR(s.avgPnl)),
            React.createElement("div",{style:{fontSize:10,textAlign:"right",color:"var(--text5)"}},s.avgHold+"d")
          );
        }),
        /* Insight */
        buyDayStats.best&&buyDayStats.worst&&React.createElement("div",{style:{marginTop:12,padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
          React.createElement("strong",{style:{color:"var(--accent)"}},"Insight: "),
          buyDayStats.best.day===1
            ?React.createElement(React.Fragment,null,"Monday buys perform best (avg ",retSign(buyDayStats.best.avgReturn),"). This aligns with the documented 'Monday effect' — markets tend to dip on Mondays, offering better entry prices. ",buyDayStats.worst.day===5?"Friday buys perform worst — consider avoiding end-of-week entries.":"")
            :buyDayStats.best.day===5
              ?React.createElement(React.Fragment,null,"Friday buys perform best (avg ",retSign(buyDayStats.best.avgReturn),"). You may be capitalising on pre-weekend momentum or picking up stocks before positive Monday gaps.")
              :React.createElement(React.Fragment,null,"Your best entry day is ",buyDayStats.best.label," (avg ",retSign(buyDayStats.best.avgReturn),") and worst is ",buyDayStats.worst.label," (avg ",retSign(buyDayStats.worst.avgReturn),"). The spread of ",retSign(buyDayStats.best.avgReturn-buyDayStats.worst.avgReturn)," suggests a real day-of-week edge.")
        )
      )
    ),

    /* ══ Report 2: Sell Day-of-Week Effect ══ */
    sellDayStats&&sellDayStats.totalSold>0&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"calendar",size:15}),"Sell Day-of-Week Effect"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},sellDayStats.totalSold+" sold trades")
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"70px 1fr 60px 70px 70px",gap:8,marginBottom:8,padding:"0 4px",fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},
          React.createElement("div",null,"Day"),
          React.createElement("div",null,"Avg Return"),
          React.createElement("div",{textAlign:"right"},"Count"),
          React.createElement("div",{textAlign:"right"},"Win %"),
          React.createElement("div",{textAlign:"right"},"Avg P&L")
        ),
        sellDayStats.stats.filter(s=>s.count>0).sort((a,b)=>b.avgReturn-a.avgReturn).map(s=>{
          const isBest=sellDayStats.best&&s.day===sellDayStats.best.day;
          const isWorst=sellDayStats.worst&&s.day===sellDayStats.worst.day;
          const maxRet=Math.max(...sellDayStats.stats.filter(x=>x.count>0).map(x=>Math.abs(x.avgReturn)),1);
          return React.createElement("div",{key:s.day,style:{display:"grid",gridTemplateColumns:"70px 1fr 60px 70px 70px",gap:8,padding:"8px 4px",borderBottom:"1px solid var(--border2)",background:isBest?"rgba(22,163,74,.04)":isWorst?"rgba(239,68,68,.04)":"transparent",borderRadius:isBest||isWorst?6:0}},
            React.createElement("div",{style:{fontSize:12,fontWeight:600,color:isBest?"#16a34a":isWorst?"#ef4444":"var(--text)"}},s.label,React.createElement("span",{style:{fontSize:9,color:"var(--text5)",marginLeft:4}},s.day===sellDayStats.best?.day?"★":s.day===sellDayStats.worst?.day?"▼":"")),
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6}},
              React.createElement(BarPct,{pct:Math.abs(s.avgReturn),maxPct:maxRet,color:retColor(s.avgReturn)}),
              React.createElement("span",{style:{fontSize:11,fontWeight:600,color:retColor(s.avgReturn),minWidth:52,textAlign:"right"}},retSign(s.avgReturn))
            ),
            React.createElement("div",{style:{fontSize:11,textAlign:"right",color:"var(--text4)"}},s.count),
            React.createElement("div",{style:{fontSize:11,textAlign:"right",fontWeight:600,color:s.winRate>=50?"#16a34a":"#ef4444"}},s.winRate.toFixed(0)+"%"),
            React.createElement("div",{style:{fontSize:11,textAlign:"right",fontWeight:600,color:retColor(s.avgPnl)}},(s.avgPnl>=0?"+":"")+INR(s.avgPnl))
          );
        }),
        sellDayStats.best&&sellDayStats.worst&&React.createElement("div",{style:{marginTop:12,padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
          React.createElement("strong",{style:{color:"var(--accent)"}},"Insight: "),
          "Your best exit day is ",sellDayStats.best.label," (avg ",retSign(sellDayStats.best.avgReturn),") and worst is ",sellDayStats.worst.label," (avg ",retSign(sellDayStats.worst.avgReturn),"). ",
          sellDayStats.best.day===5
            ?"Friday exits outperform — traders may bid up prices before weekends, or you're capturing Friday profit-taking reversals."
            :sellDayStats.best.day===1
              ?"Monday exits are best — markets often gap up on Mondays from positive weekend news flow."
              :"Consider timing your exits towards "+sellDayStats.best.label+"s if the pattern holds across enough trades."
        )
      )
    ),

    /* ══ Report 3: Month-of-Year Entry Performance ══ */
    monthStats&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"calendar",size:15}),"Month-of-Year Entry Performance"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},"seasonality analysis")
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        /* Monthly grid */
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8,marginBottom:16}},
          monthStats.stats.map(s=>{
            const isBest=monthStats.best&&s.month===monthStats.best.month;
            const isWorst=monthStats.worst&&s.month===monthStats.worst.month;
            return React.createElement("div",{key:s.month,style:{padding:"10px 12px",borderRadius:10,border:"1px solid "+(isBest?"rgba(22,163,74,.3)":isWorst?"rgba(239,68,68,.3)":"var(--border)"),background:isBest?"rgba(22,163,74,.06)":isWorst?"rgba(239,68,68,.06)":"var(--bg4)"}},
              React.createElement("div",{style:{fontSize:11,fontWeight:700,color:isBest?"#16a34a":isWorst?"#ef4444":"var(--text)",marginBottom:4}},s.label,isBest?" ★":"",isWorst?" ▼":""),
              s.count>0?React.createElement(React.Fragment,null,
                React.createElement("div",{style:{fontSize:15,fontFamily:"'Sora',sans-serif",fontWeight:700,color:retColor(s.avgReturn)}},retSign(s.avgReturn)),
                React.createElement("div",{style:{fontSize:9,color:"var(--text5)",marginTop:2}},s.count+" trades · "+s.winRate.toFixed(0)+"% win")
              ):React.createElement("div",{style:{fontSize:11,color:"var(--text5)",fontStyle:"italic"}},"No trades")
            );
          })
        ),
        /* Sell-in-May analysis */
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}},
          React.createElement("div",{style:{padding:12,background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.18)",borderRadius:10}},
            React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",letterSpacing:1,marginBottom:6,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"sun",size:12,color:"#f59e0b"})," Summer (May–Aug)"),
            React.createElement("div",{style:{fontSize:14,fontFamily:"'Sora',sans-serif",fontWeight:700,color:retColor(monthStats.summer.avgReturn)}},retSign(monthStats.summer.avgReturn)),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},monthStats.summer.count+" trades · "+monthStats.summer.winRate.toFixed(0)+"% win")
          ),
          React.createElement("div",{style:{padding:12,background:"rgba(14,116,144,.06)",border:"1px solid rgba(14,116,144,.18)",borderRadius:10}},
            React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#0e7490",textTransform:"uppercase",letterSpacing:1,marginBottom:6,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"cloud",size:12,color:"#0e7490"})," Winter (Sep–Apr)"),
            React.createElement("div",{style:{fontSize:14,fontFamily:"'Sora',sans-serif",fontWeight:700,color:retColor(monthStats.winter.avgReturn)}},retSign(monthStats.winter.avgReturn)),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},monthStats.winter.count+" trades · "+monthStats.winter.winRate.toFixed(0)+"% win")
          )
        ),
        /* Insight */
        React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
          React.createElement("strong",{style:{color:"var(--accent)"}},"Insight: "),
          monthStats.best&&monthStats.worst
            ?React.createElement(React.Fragment,null,"Best entry month: ",React.createElement("strong",{style:{color:"#16a34a"}},monthStats.best.label)," (avg ",retSign(monthStats.best.avgReturn),"). Worst: ",React.createElement("strong",{style:{color:"#ef4444"}},monthStats.worst.label)," (avg ",retSign(monthStats.worst.avgReturn),"). ",
              monthStats.summer.avgReturn<monthStats.winter.avgReturn
                ?React.createElement(React.Fragment,null,"Your data supports 'Sell in May' — summer entries (",retSign(monthStats.summer.avgReturn),") underperform winter (",retSign(monthStats.winter.avgReturn),") by ",retSign(monthStats.winter.avgReturn-monthStats.summer.avgReturn),". Consider reducing summer exposure.")
                :React.createElement(React.Fragment,null,"Your data contradicts 'Sell in May' — summer entries (",retSign(monthStats.summer.avgReturn),") actually outperform winter (",retSign(monthStats.winter.avgReturn),"). Your edge may be in summer-specific sectors or patterns.")
            )
            :"Not enough data across months for seasonal analysis."
        )
      )
    ),

    /* ══ Report 4: Time-in-Market Distribution ══ */
    timeInMarket&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"clock",size:15}),"Time-in-Market Distribution"),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},timeInMarket.totalCalendarDays+" calendar days")
      ),
      React.createElement("div",{style:{padding:"16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}},
        /* Stats */
        React.createElement("div",{style:{padding:16,background:"rgba(14,116,144,.06)",border:"1px solid rgba(14,116,144,.18)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#0e7490",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"chart",size:13})," Capital Deployment Summary")),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Total Calendar Days"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"var(--text)"}},timeInMarket.totalCalendarDays.toLocaleString("en-IN"))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Days with Capital Deployed"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"#0e7490"}},timeInMarket.daysWithCapital.toLocaleString("en-IN"))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)"}},"Days Idle (no positions)"),
            React.createElement("span",{style:{fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"var(--text4)"}},timeInMarket.daysIdle.toLocaleString("en-IN"))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",paddingTop:6,borderTop:"1px solid var(--border2)"}},
            React.createElement("span",{style:{fontSize:11,color:"var(--text5)",fontWeight:600}},"Time in Market"),
            React.createElement("span",{style:{fontSize:16,fontWeight:800,fontFamily:"'Sora',sans-serif",color:"#0e7490"}},timeInMarket.pct.toFixed(1)+"%")
          )
        ),
        /* Visual occupancy bar */
        React.createElement("div",{style:{padding:16,background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12}},
          React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:1,marginBottom:10,display:"flex",alignItems:"center",gap:4}},React.createElement(Icon,{n:"calendar",size:12})," Monthly Occupancy"),
          React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:4,maxHeight:200,overflowY:"auto"}},
            timeInMarket.months.map(m=>React.createElement("div",{key:m.month,style:{display:"flex",alignItems:"center",gap:8,fontSize:10}},
              React.createElement("div",{style:{width:50,color:"var(--text5)",flexShrink:0}},m.month),
              React.createElement("div",{style:{flex:1,height:12,background:"var(--bg5)",borderRadius:3,overflow:"hidden"}},
                React.createElement("div",{style:{height:"100%",width:m.pct+"%",background:m.pct>80?"#0e7490":m.pct>50?"#16a34a":m.pct>0?"#f59e0b":"var(--bg5)",borderRadius:3}})
              ),
              React.createElement("div",{style:{width:36,textAlign:"right",color:"var(--text4)",fontWeight:600}},m.pct.toFixed(0)+"%")
            ))
          )
        ),
        /* Insight */
        React.createElement("div",{style:{padding:16,background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:12,gridColumn:"1 / -1"}},
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6,display:"flex",alignItems:"center",gap:5}},React.createElement(Icon,{n:"lightbulb",size:13}),"Time-in-Market Insight"),
          React.createElement("div",{style:{fontSize:12,color:"var(--text4)",lineHeight:1.6}},
            "Over ",React.createElement("strong",null,timeInMarket.totalCalendarDays.toLocaleString("en-IN"))," calendar days from your first buy to today, you had capital deployed for ",
            React.createElement("strong",{style:{color:"#0e7490"}},timeInMarket.daysWithCapital.toLocaleString("en-IN"))," days (",React.createElement("strong",null,timeInMarket.pct.toFixed(1)+"%"),"). ",
            timeInMarket.pct>80
              ?"You're almost always in the market — this is aggressive. Make sure idle periods aren't just 'dead money' in positions you've stopped tracking."
              :timeInMarket.pct>50
                ?React.createElement(React.Fragment,null,"You're in the market about half the time. The other ",timeInMarket.daysIdle.toLocaleString("en-IN")," days represent potential cash drag — or deliberate risk-off periods. ",
                  timeInMarket.daysWithMultiple>0?"On "+timeInMarket.daysWithMultiple+" days you had multiple concurrent positions — good diversification.":"")
                :React.createElement(React.Fragment,null,"You're frequently out of the market (",timeInMarket.pct.toFixed(1)+"%). This could mean: you're a short-term trader, you take long breaks between trades, or your positions are short-lived. ",
                  "The 'time in the market beats timing the market' principle suggests increasing deployment — but only if your entries are well-timed.")
          )
        )
      )
    ),

    /* ══ Methodology note ══ */
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Day-of-week and month-of-year effects are computed by grouping trades by their buy (or sell) date and comparing average returns across groups. The documented 'Monday effect' refers to the tendency of stock markets to deliver lower returns on Mondays. 'Sell in May and go away' is the hypothesis that summer months (May–Aug) underperform winter months (Sep–Apr). Time-in-market counts each calendar day from your first buy date to today where at least one position was open. Occupancy is the ratio of days with active positions to total calendar days. Active holdings are treated as open until today. All amounts are gross of brokerage."
    )
  );
};


const RiskMetrics=({shares,soldShareSnapshots={}})=>{

  /* ── Build unified trade list ── */
  const trades=React.useMemo(()=>{
    const list=[];
    (shares||[]).forEach(sh=>{
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      const buyAmt=sh.qty*sh.buyPrice;
      const sellAmt=sh.qty*sh.currentPrice;
      const brokerage=+sh.brokerage||0;
      const pnl=sellAmt-buyAmt-brokerage;
      const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
      list.push({
        id:sh.id,type:"active",company:sh.company,ticker:sh.ticker,
        qty:sh.qty,buyPrice:sh.buyPrice,sellPrice:sh.currentPrice,
        buyDate:sh.buyDate,sellDate:TODAY(),
        buyAmt,sellAmt,brokerage,pnl,returnPct,
      });
    });
    Object.values(soldShareSnapshots||{}).forEach(fySnaps=>{
      (fySnaps||[]).forEach(sn=>{
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate)return;
        const buyAmt=sn.qty*sn.buyPrice;
        const sellAmt=sn.qty*sn.sellPrice;
        const brokerage=+sn.brokerage||0;
        const pnl=sellAmt-buyAmt-brokerage;
        const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
        list.push({
          id:sn.id,type:"sold",company:sn.company,ticker:sn.ticker,
          qty:sn.qty,buyPrice:sn.buyPrice,sellPrice:sn.sellPrice,
          buyDate:sn.buyDate,sellDate:sn.savedAt,
          buyAmt,sellAmt,brokerage,pnl,returnPct,
        });
      });
    });
    return list;
  },[shares,soldShareSnapshots]);

  /* ── 1. Volatility of returns (std dev of per-trade return %) ── */
  const volatilityData=React.useMemo(()=>{
    if(trades.length<2)return{stdDev:0,returns:[]};
    const returns=trades.map(t=>t.returnPct);
    const mean=returns.reduce((s,r)=>s+r,0)/returns.length;
    const variance=returns.reduce((s,r)=>s+Math.pow(r-mean,2),0)/(returns.length-1);
    const stdDev=Math.sqrt(variance);
    return{stdDev,mean,returns};
  },[trades]);

  /* ── 2. Sharpe-like ratio (avg return / std deviation) ── */
  const sharpeData=React.useMemo(()=>{
    if(trades.length<2||volatilityData.stdDev===0)return null;
    return volatilityData.mean/volatilityData.stdDev;
  },[trades,volatilityData]);

  /* ── 3. Max drawdown equivalent — worst consecutive loss sequence as % of capital ── */
  const drawdownData=React.useMemo(()=>{
    if(!trades.length)return{maxDrawdown:0,streaks:[]};
    /* Sort trades by sell date (chronological) */
    const sorted=[...trades].sort((a,b)=>(a.sellDate||"").localeCompare(b.sellDate||""));
    /* Calculate cumulative P&L and track peak → trough */
    let cumPnl=0,cumInvested=0,peak=0,maxDD=0,maxDDPct=0;
    let ddStart="",ddEnd="",ddStreak=0;
    let curStreakLosses=0,curStreakPnl=0,curStreakStart="",curStreakEnd="";
    const streaks=[];
    sorted.forEach(t=>{
      cumPnl+=t.pnl;
      cumInvested+=t.buyAmt;
      /* Track current losing streak */
      if(t.pnl<0){
        if(curStreakLosses===0)curStreakStart=t.sellDate||t.buyDate;
        curStreakLosses++;
        curStreakPnl+=t.pnl;
        curStreakEnd=t.sellDate||t.buyDate;
      }else{
        if(curStreakLosses>=2){
          streaks.push({losses:curStreakLosses,pnl:curStreakPnl,start:curStreakStart,end:curStreakEnd});
        }
        curStreakLosses=0;curStreakPnl=0;curStreakStart="";curStreakEnd="";
      }
      /* Track drawdown from peak cumulative P&L */
      if(cumPnl>peak)peak=cumPnl;
      const dd=peak-cumPnl;
      const ddPct=cumInvested>0?(dd/cumInvested*100):0;
      if(ddPct>maxDDPct){
        maxDDPct=ddPct;maxDD=dd;
        ddEnd=t.sellDate||t.buyDate;
      }
    });
    /* Close any trailing streak */
    if(curStreakLosses>=2){
      streaks.push({losses:curStreakLosses,pnl:curStreakPnl,start:curStreakStart,end:curStreakEnd});
    }
    /* Sort streaks by total loss (worst first) */
    streaks.sort((a,b)=>a.pnl-b.pnl);
    return{maxDrawdown:maxDD,maxDrawdownPct:maxDDPct,streaks,cumInvested};
  },[trades]);

  /* ── 4. Concentration risk — % of P&L from top 3 stocks ── */
  const concentrationData=React.useMemo(()=>{
    if(!trades.length)return{top3Pct:0,byStock:[]};
    /* Aggregate P&L by ticker */
    const stockMap={};
    trades.forEach(t=>{
      const key=(t.ticker||t.company||"Unknown").toUpperCase();
      if(!stockMap[key])stockMap[key]={ticker:t.ticker||t.company||"Unknown",pnl:0,buyAmt:0,tradeCount:0};
      stockMap[key].pnl+=t.pnl;
      stockMap[key].buyAmt+=t.buyAmt;
      stockMap[key].tradeCount++;
    });
    const byStock=Object.values(stockMap).sort((a,b)=>Math.abs(b.pnl)-Math.abs(a.pnl));
    const totalAbsPnl=byStock.reduce((s,st)=>s+Math.abs(st.pnl),0);
    const top3=byStock.slice(0,3);
    const top3AbsPnl=top3.reduce((s,st)=>s+Math.abs(st.pnl),0);
    const top3Pct=totalAbsPnl>0?(top3AbsPnl/totalAbsPnl*100):0;
    return{top3Pct,byStock,totalPnl:byStock.reduce((s,st)=>s+st.pnl,0)};
  },[trades]);

  /* ── Helper functions ── */
  const ret=(v)=>(v>=0?"+":"")+v.toFixed(2)+"%";

  /* ── Risk rating helper ── */
  const riskRating=(label,value,thresholds)=>{
    /* thresholds: [green_max, yellow_max] — below green=low, between=medium, above=high */
    if(value<=thresholds[0])return{level:"Low",color:"#16a34a",bg:"rgba(22,163,74,.08)",border:"rgba(22,163,74,.2)"};
    if(value<=thresholds[1])return{level:"Medium",color:"#eab308",bg:"rgba(234,179,8,.08)",border:"rgba(234,179,8,.2)"};
    return{level:"High",color:"#ef4444",bg:"rgba(239,68,68,.08)",border:"rgba(239,68,68,.2)"};
  };

  /* ── Return distribution for histogram ── */
  const returnDistribution=React.useMemo(()=>{
    if(!volatilityData.returns.length)return[];
    const rets=volatilityData.returns;
    const min=Math.min(...rets),max=Math.max(...rets);
    if(min===max)return[{label:ret(min),count:rets.length,min,max}];
    const binCount=Math.min(Math.max(Math.ceil(Math.sqrt(rets.length)),5),15);
    const range=max-min;
    const binWidth=range/binCount;
    const bins=[];
    for(let i=0;i<binCount;i++){
      const bMin=min+i*binWidth;
      const bMax=bMin+binWidth;
      const count=rets.filter(r=>i===binCount-1?r>=bMin&&r<=max:r>=bMin&&r<bMax).length;
      bins.push({label:ret(bMin)+" to "+ret(bMax),count,bMin,bMax});
    }
    return bins;
  },[volatilityData]);

  /* ── Risk score (composite) ── */
  const compositeRisk=React.useMemo(()=>{
    if(trades.length<2)return null;
    let score=0;
    /* Volatility: 0-100 mapped to 0-30 points */
    score+=Math.min(volatilityData.stdDev/5*30,30);
    /* Sharpe: negative or <0.5 = high risk, 0.5-1 = medium, >1 = low */
    if(sharpeData!==null){
      if(sharpeData<0.3)score+=25;
      else if(sharpeData<0.7)score+=15;
      else if(sharpeData<1)score+=8;
      else score+=0;
    }else score+=20;
    /* Drawdown: >20% = high, 10-20% = medium, <10% = low */
    score+=Math.min(drawdownData.maxDrawdownPct/20*25,25);
    /* Concentration: >70% = high, 40-70% = medium, <40% = low */
    score+=Math.min(concentrationData.top3Pct/70*20,20);
    return Math.min(Math.round(score),100);
  },[trades,volatilityData,sharpeData,drawdownData,concentrationData]);

  /* ── 5. Value at Risk (VaR) ── */
  const varData=React.useMemo(()=>{
    if(volatilityData.returns.length<5)return null;
    const sorted=[...volatilityData.returns].sort((a,b)=>a-b);
    const n=sorted.length;
    const var95Idx=Math.floor(n*0.05);
    const var99Idx=Math.floor(n*0.01);
    const var95=sorted[var95Idx];
    const var99=sorted[Math.max(var99Idx,0)];
    const tailReturns=sorted.slice(0,var95Idx+1);
    const expectedShortfall=tailReturns.length>0?tailReturns.reduce((s,r)=>s+r,0)/tailReturns.length:var95;
    const z95=1.645;
    const z99=2.326;
    const parametricVar95=volatilityData.mean-z95*volatilityData.stdDev;
    const parametricVar99=volatilityData.mean-z99*volatilityData.stdDev;
    return{var95,var99,expectedShortfall,parametricVar95,parametricVar99,mean:volatilityData.mean,stdDev:volatilityData.stdDev,sampleSize:n,worstReturn:sorted[0],bestReturn:sorted[n-1]};
  },[volatilityData]);

  /* ── 6. Max Drawdown per Stock ── */
  const stockDrawdowns=React.useMemo(()=>{
    if(!trades.length)return[];
    const stockMap={};
    trades.forEach(t=>{
      const key=(t.ticker||t.company||"Unknown").toUpperCase();
      if(!stockMap[key])stockMap[key]={ticker:t.ticker||t.company||"Unknown",trades:[]};
      stockMap[key].trades.push(t);
    });
    return Object.values(stockMap).map(st=>{
      const sorted=[...st.trades].sort((a,b)=>(a.sellDate||"").localeCompare(b.sellDate||""));
      let cumPnl=0,peak=0,maxDD=0,maxDDPct=0;
      sorted.forEach(t=>{
        cumPnl+=t.pnl;
        if(cumPnl>peak)peak=cumPnl;
        const dd=peak-cumPnl;
        const ddPct=t.buyAmt>0?(dd/t.buyAmt*100):0;
        if(dd>maxDD){maxDD=dd;maxDDPct=ddPct;}
      });
      return{ticker:st.ticker,tradeCount:sorted.length,totalPnl:sorted.reduce((s,t)=>s+t.pnl,0),maxDrawdown:maxDD,maxDrawdownPct:maxDDPct,};
    }).sort((a,b)=>b.maxDrawdown-a.maxDrawdown);
  },[trades]);

  /* ── 7. Risk-Adjusted Rankings ── */
  const riskAdjustedRankings=React.useMemo(()=>{
    if(!trades.length)return[];
    const stockMap={};
    trades.forEach(t=>{
      const key=(t.ticker||t.company||"Unknown").toUpperCase();
      if(!stockMap[key])stockMap[key]={ticker:t.ticker||t.company||"Unknown",returns:[],pnl:0,buyAmt:0,tradeCount:0};
      const st=stockMap[key];
      st.returns.push(t.returnPct);
      st.pnl+=t.pnl;
      st.buyAmt+=t.buyAmt;
      st.tradeCount++;
    });
    return Object.values(stockMap).map(st=>{
      const mean=st.returns.reduce((s,r)=>s+r,0)/st.returns.length;
      const variance=st.returns.length>1?st.returns.reduce((s,r)=>s+Math.pow(r-mean,2),0)/(st.returns.length-1):0;
      const stdDev=Math.sqrt(variance);
      const sharpe=stdDev>0?mean/stdDev:(mean>0?Infinity:0);
      const winRate=st.returns.filter(r=>r>0).length/st.returns.length*100;
      return{...st,mean,stdDev,sharpe,winRate,avgReturn:mean};
    }).sort((a,b)=>b.sharpe-a.sharpe);
  },[trades]);

  /* ── 8. Tail Risk Analysis ── */
  const tailRiskData=React.useMemo(()=>{
    if(volatilityData.returns.length<5)return null;
    const sorted=[...volatilityData.returns].sort((a,b)=>a-b);
    const n=sorted.length;
    const mean=volatilityData.mean;
    const stdDev=volatilityData.stdDev;
    const p5=sorted[Math.floor(n*0.05)];
    const p10=sorted[Math.floor(n*0.10)];
    const p25=sorted[Math.floor(n*0.25)];
    const p50=sorted[Math.floor(n*0.50)];
    const p75=sorted[Math.floor(n*0.75)];
    const p90=sorted[Math.floor(n*0.90)];
    const p95=sorted[Math.floor(n*0.95)];
    const skewness=n>2?(sorted.reduce((s,r)=>s+Math.pow((r-mean)/stdDev,3),0)*n)/((n-1)*(n-2)):0;
    const kurtosis=n>3?((sorted.reduce((s,r)=>s+Math.pow((r-mean)/stdDev,4),0)*n*(n+1))/((n-1)*(n-2)*(n-3))-(3*(n-1)*(n-1))/((n-2)*(n-3))):0;
    const worst5=sorted.slice(0,5);
    const best5=sorted.slice(-5).reverse();
    const tail5Pct=Math.max(1,Math.floor(n*0.05));
    const avgWorst=sorted.slice(0,tail5Pct).reduce((s,r)=>s+r,0)/tail5Pct;
    const avgBest=sorted.slice(-tail5Pct).reduce((s,r)=>s+r,0)/tail5Pct;
    const tailRatio=avgWorst!==0?Math.abs(avgBest/avgWorst):Infinity;
    return{p5,p10,p25,p50,p75,p90,p95,skewness,kurtosis,worst5,best5,tailRatio,avgWorst,avgBest,sampleSize:n};
  },[volatilityData]);

  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"warning",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to Previous Trades to see risk metrics.")
  );

  const volRating=riskRating("Volatility",volatilityData.stdDev,[15,30]);
  const ddRating=riskRating("Drawdown",drawdownData.maxDrawdownPct,[10,20]);
  const concRating=riskRating("Concentration",100-concentrationData.top3Pct,[40,70]); /* inverted: high diversity = low risk */
  const concRiskActual=riskRating("Concentration",concentrationData.top3Pct,[40,70]);

  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},

    /* ══ Composite Risk Score ══ */
    compositeRisk!==null&&React.createElement("div",{style:{
      background:compositeRisk<30?"rgba(22,163,74,.07)":compositeRisk<60?"rgba(234,179,8,.07)":"rgba(239,68,68,.07)",
      border:"1px solid "+(compositeRisk<30?"rgba(22,163,74,.2)":compositeRisk<60?"rgba(234,179,8,.2)":"rgba(239,68,68,.2)"),
      borderRadius:14,padding:"20px 24px",textAlign:"center"
    }},
      React.createElement("div",{style:{fontSize:11,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}},"Composite Risk Score"),
      React.createElement("div",{style:{fontSize:42,fontFamily:"'Sora',sans-serif",fontWeight:800,color:compositeRisk<30?"#16a34a":compositeRisk<60?"#eab308":"#ef4444"}},compositeRisk+"/100"),
      React.createElement("div",{style:{fontSize:12,color:"var(--text5)",marginTop:4}},
        compositeRisk<30?"Low overall risk — your portfolio is well-diversified and stable."
        :compositeRisk<60?"Moderate risk — some areas need attention."
        :"High risk — consider reducing volatility, improving diversification, or cutting losing streaks."
      ),
      /* Progress bar */
      React.createElement("div",{style:{marginTop:12,height:6,borderRadius:3,background:"var(--bg5)",overflow:"hidden",maxWidth:300,margin:"12px auto 0"}},
        React.createElement("div",{style:{height:"100%",width:compositeRisk+"%",borderRadius:3,background:compositeRisk<30?"#16a34a":compositeRisk<60?"#eab308":"#ef4444",transition:"width .5s ease"}})
      )
    ),

    /* ══ Metric Cards ══ */
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}},
      /* Volatility */
      React.createElement("div",{style:{background:volRating.bg,border:"1px solid "+volRating.border,borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},"Volatility (σ)"),
          React.createElement("span",{style:{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:volRating.bg,color:volRating.color,border:"1px solid "+volRating.border}},volRating.level)
        ),
        React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:volRating.color}},volatilityData.stdDev.toFixed(2)+"%"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:3}},"Std deviation of per-trade returns"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginTop:2}},"Mean return: "+ret(volatilityData.mean))
      ),
      /* Sharpe-like ratio */
      React.createElement("div",{style:{background:sharpeData!==null?(sharpeData>=0.7?"rgba(22,163,74,.08)":sharpeData>=0?"rgba(234,179,8,.08)":"rgba(239,68,68,.08)"):"var(--accentbg2)",border:"1px solid "+(sharpeData!==null?(sharpeData>=0.7?"rgba(22,163,74,.2)":sharpeData>=0?"rgba(234,179,8,.2)":"rgba(239,68,68,.2)"):"var(--border2)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}},"Sharpe-like Ratio"),
        React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:sharpeData!==null?(sharpeData>=0.7?"#16a34a":sharpeData>=0?"#eab308":"#ef4444"):"var(--text5)"}},sharpeData!==null?sharpeData.toFixed(3):"—"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:3}},"Avg return ÷ σ (risk-adjusted)"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginTop:2}},sharpeData!==null?(sharpeData>=1?"Excellent — returns well exceed risk":sharpeData>=0.5?"Decent — reasonable risk-adjusted return":sharpeData>=0?"Weak — returns barely justify the risk":"Negative — risk not rewarded"):"Need ≥2 trades")
      ),
      /* Max Drawdown */
      React.createElement("div",{style:{background:ddRating.bg,border:"1px solid "+ddRating.border,borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},"Max Drawdown"),
          React.createElement("span",{style:{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:ddRating.bg,color:ddRating.color,border:"1px solid "+ddRating.border}},ddRating.level)
        ),
        React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:ddRating.color}},drawdownData.maxDrawdownPct.toFixed(2)+"%"),
        drawdownData.maxDrawdown>0&&React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},INR(drawdownData.maxDrawdown)+" peak-to-trough"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginTop:3}},"Worst consecutive loss sequence")
      ),
      /* Concentration Risk */
      React.createElement("div",{style:{background:concRiskActual.bg,border:"1px solid "+concRiskActual.border,borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},"Concentration Risk"),
          React.createElement("span",{style:{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,background:concRiskActual.bg,color:concRiskActual.color,border:"1px solid "+concRiskActual.border}},concRiskActual.level)
        ),
        React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:concRiskActual.color}},concentrationData.top3Pct.toFixed(1)+"%"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:3}},"P&L from top 3 stocks"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginTop:2}},concentrationData.top3Pct>70?"Highly concentrated — luck may dominate skill":concentrationData.top3Pct>40?"Moderately concentrated — some diversification":"Well diversified across positions")
      )
    ),

    /* ══ Return Distribution Histogram ══ */
    returnDistribution.length>1&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"chart",size:13})," Return Distribution")),
      React.createElement("div",{style:{display:"flex",alignItems:"flex-end",gap:4,height:120,padding:"0 4px"}},
        returnDistribution.map((bin,i)=>{
          const maxCount=Math.max(...returnDistribution.map(b=>b.count));
          const h=maxCount>0?(bin.count/maxCount*100):0;
          const midPct=(bin.bMin+bin.bMax)/2;
          const col=midPct>=0?"#16a34a":"#ef4444";
          return React.createElement("div",{key:i,style:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}},
            React.createElement("span",{style:{fontSize:9,fontWeight:600,color:"var(--text5)",marginBottom:3}},bin.count),
            React.createElement("div",{style:{width:"100%",height:Math.max(h,4)+"%",background:col,borderRadius:"4px 4px 0 0",opacity:.7,transition:"height .3s ease"}})
          );
        })
      ),
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:6,padding:"0 4px"}},
        React.createElement("span",{style:{fontSize:9,color:"var(--text6)"}},"← Losses"),
        React.createElement("span",{style:{fontSize:9,color:"var(--text6)"}},"Gains →")
      )
    ),

    /* ══ Losing Streaks Detail ══ */
    drawdownData.streaks.length>0&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"fire",size:15}),"Consecutive Loss Streaks"),
      React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8}},
        drawdownData.streaks.slice(0,5).map((streak,i)=>React.createElement("div",{key:i,style:{
          display:"grid",gridTemplateColumns:"auto 1fr auto auto",gap:12,alignItems:"center",
          padding:"10px 14px",background:i%2?"var(--bg5)":"transparent",borderRadius:8,
          border:"1px solid var(--border)"
        }},
          React.createElement("div",{style:{fontSize:18,fontWeight:800,fontFamily:"'Sora',sans-serif",color:"#ef4444",minWidth:28,textAlign:"center"}},streak.losses),
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:11,fontWeight:600,color:"var(--text3)"}},streak.losses+" consecutive losing trades"),
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginTop:2}},streak.start&&streak.end?streak.start+" → "+streak.end:"")
          ),
          React.createElement("div",{style:{fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"#ef4444"}},INR(streak.pnl)),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)"}},drawdownData.cumInvested>0?(streak.pnl/drawdownData.cumInvested*100).toFixed(2)+"% of capital":"")
        ))
      )
    ),

    /* ══ Concentration: Per-Stock P&L Breakdown ══ */
    concentrationData.byStock.length>1&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14}},React.createElement(React.Fragment,null,React.createElement(Icon,{n:"target",size:13})," P&L by Stock (Concentration View)")),
      React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:6}},
        concentrationData.byStock.slice(0,8).map((st,i)=>{
          const totalAbsPnl=concentrationData.byStock.reduce((s,x)=>s+Math.abs(x.pnl),0);
          const pctOfTotal=totalAbsPnl>0?(Math.abs(st.pnl)/totalAbsPnl*100):0;
          const isGain=st.pnl>=0;
          return React.createElement("div",{key:i,style:{display:"grid",gridTemplateColumns:"minmax(80px,1fr) 1fr 60px 70px",gap:10,alignItems:"center",padding:"8px 10px",background:i%2?"var(--bg5)":"transparent",borderRadius:6}},
            React.createElement("div",{style:{fontSize:12,fontWeight:600,color:"var(--text3)"}},st.ticker),
            React.createElement("div",{style:{position:"relative",height:8,borderRadius:4,background:"var(--bg5)",overflow:"hidden"}},
              React.createElement("div",{style:{position:"absolute",left:0,top:0,height:"100%",width:pctOfTotal+"%",borderRadius:4,background:isGain?"#16a34a":"#ef4444",opacity:.7}})
            ),
            React.createElement("div",{style:{fontSize:12,fontWeight:700,fontFamily:"'Sora',sans-serif",color:isGain?"#16a34a":"#ef4444",textAlign:"right"}},(isGain?"+":"")+INR(st.pnl)),
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textAlign:"right"}},pctOfTotal.toFixed(1)+"%")
          );
        }),
        concentrationData.byStock.length>8&&React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textAlign:"center",paddingTop:4}},"+"+((concentrationData.byStock.length-8))+" more stocks")
      ),
      /* Top 3 summary */
      React.createElement("div",{style:{marginTop:14,padding:"10px 14px",background:concentrationData.top3Pct>70?"rgba(239,68,68,.06)":concentrationData.top3Pct>40?"rgba(234,179,8,.06)":"rgba(22,163,74,.06)",border:"1px solid "+(concentrationData.top3Pct>70?"rgba(239,68,68,.15)":concentrationData.top3Pct>40?"rgba(234,179,8,.15)":"rgba(22,163,74,.15)"),borderRadius:8}},
        React.createElement("div",{style:{fontSize:11,fontWeight:600,color:"var(--text3)"}},"Top 3 stocks account for "+concentrationData.top3Pct.toFixed(1)+"% of absolute P&L"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:3}},
          concentrationData.top3Pct>70?"Your performance is heavily driven by a few positions. Luck plays a larger role — a single bad pick could dominate."
          :concentrationData.top3Pct>40?"Moderate concentration. Your top picks contribute meaningfully but you're not entirely dependent on them."
          :"Well diversified. No single stock dominates your P&L — skill over luck."
        )
      )
    ),


    /* ══ Report: Value at Risk (VaR) ══ */
    varData&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},
          React.createElement(Icon,{n:"shield",size:15}),"Value at Risk (VaR)"
        ),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},
          varData.sampleSize+" trades"
        )
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}},
          React.createElement("div",{style:{background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.2)",borderRadius:12,padding:"14px 16px"}},
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"95% VaR"),
            React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#ef4444"}},ret(varData.var95)),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Worst 5% threshold (historical)")
          ),
          React.createElement("div",{style:{background:"rgba(220,38,38,.07)",border:"1px solid rgba(220,38,38,.2)",borderRadius:12,padding:"14px 16px"}},
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"99% VaR"),
            React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#dc2626"}},ret(varData.var99)),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Worst 1% threshold")
          ),
          React.createElement("div",{style:{background:"rgba(245,158,11,.07)",border:"1px solid rgba(245,158,11,.2)",borderRadius:12,padding:"14px 16px"}},
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Expected Shortfall (CVaR)"),
            React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#f59e0b"}},ret(varData.expectedShortfall)),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Average loss when beyond 95% VaR")
          )
        ),
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}},
          React.createElement("div",{style:{padding:"10px 14px",background:"var(--bg5)",borderRadius:8,fontSize:11,color:"var(--text5)"}},
            React.createElement("div",{style:{fontWeight:600,color:"var(--text3)",marginBottom:4}},"Parametric VaR (Normal)"),
            React.createElement("div",null,"95%: ",React.createElement("strong",{style:{color:"#ef4444"}},ret(varData.parametricVar95))),
            React.createElement("div",null,"99%: ",React.createElement("strong",{style:{color:"#dc2626"}},ret(varData.parametricVar99)))
          ),
          React.createElement("div",{style:{padding:"10px 14px",background:"var(--bg5)",borderRadius:8,fontSize:11,color:"var(--text5)"}},
            React.createElement("div",{style:{fontWeight:600,color:"var(--text3)",marginBottom:4}},"Return Distribution"),
            React.createElement("div",null,"Mean: ",React.createElement("strong",null,ret(varData.mean))),
            React.createElement("div",null,"Std Dev: ",React.createElement("strong",null,ret(varData.stdDev))),
            React.createElement("div",null,"Worst: ",React.createElement("strong",{style:{color:"#ef4444"}},ret(varData.worstReturn))," | Best: ",React.createElement("strong",{style:{color:"#16a34a"}},ret(varData.bestReturn)))
          )
        ),
        React.createElement("div",{style:{fontSize:11,color:"var(--text5)",lineHeight:1.6,padding:"8px 12px",background:"var(--bg5)",borderRadius:8}},
          React.createElement("strong",null,"Interpretation: "),"95% VaR of "+ret(varData.var95)+" means that on 95% of trades, your return was better than this. The remaining 5% of trades had losses at or below this level. Expected Shortfall (CVaR) tells you the average loss when you do breach the 95% threshold — it captures tail severity. Parametric VaR assumes normal distribution; compare with historical VaR to check for fat tails."
        )
      )
    ),

    /* ══ Report: Max Drawdown per Stock ══ */
    stockDrawdowns.length>0&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},
          React.createElement(Icon,{n:"trenddown",size:15}),"Max Drawdown per Stock"
        ),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},
          stockDrawdowns.length+" stocks"
        )
      ),
      React.createElement("div",{className:"mobile-scroll-table",style:{overflowX:"auto"}},
        React.createElement("div",{style:{minWidth:550}},
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"2fr 60px 90px 100px 80px",gap:0,borderBottom:"1px solid var(--border)",background:"var(--bg4)"}},
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px"}},"Stock"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"Trades"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Total P&L"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Max Drawdown (₹)"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Max DD (%)")
          ),
          stockDrawdowns.map((s,i)=>{
            const isGain=s.totalPnl>=0;
            const ddColor=s.maxDrawdownPct<5?"#16a34a":s.maxDrawdownPct<15?"#f59e0b":"#ef4444";
            return React.createElement("div",{key:s.ticker||i,style:{display:"grid",gridTemplateColumns:"2fr 60px 90px 100px 80px",gap:0,borderBottom:"1px solid var(--border2)",background:i%2===0?"transparent":"var(--bg4)",transition:"background .1s"},onMouseEnter:e=>e.currentTarget.style.background="var(--accentbg2)",onMouseLeave:e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--bg4)"},
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},s.ticker),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"center",color:"var(--text3)"}},s.tradeCount),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"right",fontWeight:700,fontFamily:"'Sora',sans-serif",color:isGain?"#16a34a":"#ef4444"}},(isGain?"+":"")+INR(s.totalPnl)),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"right",fontWeight:700,fontFamily:"'Sora',sans-serif",color:"#ef4444"}},"−"+INR(s.maxDrawdown)),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",fontWeight:700,color:ddColor}},s.maxDrawdownPct.toFixed(1)+"%")
            );
          })
        )
      )
    ),

    /* ══ Report: Risk-Adjusted Rankings ══ */
    riskAdjustedRankings.length>0&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},
          React.createElement(Icon,{n:"target",size:15}),"Risk-Adjusted Rankings"
        ),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},
          riskAdjustedRankings.length+" stocks"
        )
      ),
      React.createElement("div",{className:"mobile-scroll-table",style:{overflowX:"auto"}},
        React.createElement("div",{style:{minWidth:600}},
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"40px 2fr 60px 80px 80px 80px 60px",gap:0,borderBottom:"1px solid var(--border)",background:"var(--bg4)"}},
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"#"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px"}},"Stock"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"Trades"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Avg Return"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Volatility (σ)"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"right"}},"Sharpe"),
            React.createElement("div",{style:{fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.7,padding:"8px",textAlign:"center"}},"Win %")
          ),
          riskAdjustedRankings.map((s,i)=>{
            const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
            const sharpeColor=s.sharpe>1?"#16a34a":s.sharpe>0.5?"#f59e0b":"#ef4444";
            return React.createElement("div",{key:s.ticker||i,style:{display:"grid",gridTemplateColumns:"40px 2fr 60px 80px 80px 80px 60px",gap:0,borderBottom:"1px solid var(--border2)",background:i%2===0?"transparent":"var(--bg4)",transition:"background .1s"},onMouseEnter:e=>e.currentTarget.style.background="var(--accentbg2)",onMouseLeave:e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--bg4)"},
              React.createElement("div",{style:{padding:"9px 8px",fontSize:13,textAlign:"center",color:medal?"var(--text3)":"var(--text6)"}},medal||(i+1)),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},s.ticker),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"center",color:"var(--text3)"}},s.tradeCount),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",fontWeight:600,color:s.avgReturn>=0?"#16a34a":"#ef4444"}},(s.avgReturn>=0?"+":"")+s.avgReturn.toFixed(2)+"%"),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"right",color:"var(--text4)"}},s.stdDev.toFixed(2)+"%"),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:12,textAlign:"right",fontWeight:700,fontFamily:"'Sora',sans-serif",color:sharpeColor}},s.sharpe===Infinity?"∞":s.sharpe.toFixed(2)),
              React.createElement("div",{style:{padding:"9px 8px",fontSize:11,textAlign:"center",fontWeight:600,color:s.winRate>=50?"#16a34a":"#ef4444"}},s.winRate.toFixed(0)+"%")
            );
          })
        )
      )
    ),

    /* ══ Report: Tail Risk Analysis ══ */
    tailRiskData&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}},
      React.createElement("div",{style:{padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg5)",display:"flex",alignItems:"center",gap:8}},
        React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)",display:"flex",alignItems:"center",gap:6}},
          React.createElement(Icon,{n:"warning",size:15}),"Tail Risk Analysis"
        ),
        React.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:10,background:"var(--accentbg2)",color:"var(--text5)",border:"1px solid var(--border2)",fontWeight:600}},
          tailRiskData.sampleSize+" trades"
        )
      ),
      React.createElement("div",{style:{padding:"16px 20px"}},
        /* Percentile strip */
        React.createElement("div",{style:{marginBottom:16}},
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}},"Return Distribution Percentiles"),
          React.createElement("div",{style:{position:"relative",height:32,borderRadius:8,background:"linear-gradient(90deg,#ef4444 0%,#f59e0b 30%,#16a34a 70%,#0e7490 100%)",opacity:.15}}),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9,color:"var(--text6)"}},
            React.createElement("div",{style:{textAlign:"center"}},
              React.createElement("div",{style:{fontWeight:700,color:"#ef4444"}},ret(tailRiskData.p5)),
              React.createElement("div",null,"P5")
            ),
            React.createElement("div",{style:{textAlign:"center"}},
              React.createElement("div",{style:{fontWeight:600}},ret(tailRiskData.p25)),
              React.createElement("div",null,"P25")
            ),
            React.createElement("div",{style:{textAlign:"center"}},
              React.createElement("div",{style:{fontWeight:700,color:"var(--text3)"}},ret(tailRiskData.p50)),
              React.createElement("div",null,"Median")
            ),
            React.createElement("div",{style:{textAlign:"center"}},
              React.createElement("div",{style:{fontWeight:600}},ret(tailRiskData.p75)),
              React.createElement("div",null,"P75")
            ),
            React.createElement("div",{style:{textAlign:"center"}},
              React.createElement("div",{style:{fontWeight:700,color:"#16a34a"}},ret(tailRiskData.p95)),
              React.createElement("div",null,"P95")
            )
          )
        ),
        /* Skewness & Kurtosis */
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}},
          React.createElement("div",{style:{padding:"12px 14px",background:tailRiskData.skewness<0?"rgba(239,68,68,.06)":"rgba(22,163,74,.06)",border:"1px solid "+(tailRiskData.skewness<0?"rgba(239,68,68,.15)":"rgba(22,163,74,.15)"),borderRadius:10}},
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Skewness"),
            React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:tailRiskData.skewness<0?"#ef4444":"#16a34a"}},tailRiskData.skewness.toFixed(3)),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},tailRiskData.skewness<0?"Left tail heavier — more crash risk":"Right tail heavier — more upside outliers")
          ),
          React.createElement("div",{style:{padding:"12px 14px",background:tailRiskData.kurtosis>0?"rgba(245,158,11,.06)":"rgba(22,163,74,.06)",border:"1px solid "+(tailRiskData.kurtosis>0?"rgba(245,158,11,.15)":"rgba(22,163,74,.15)"),borderRadius:10}},
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Excess Kurtosis"),
            React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:tailRiskData.kurtosis>0?"#f59e0b":"#16a34a"}},tailRiskData.kurtosis.toFixed(3)),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},tailRiskData.kurtosis>0?"Fat tails — more extreme events than normal":"Thinner tails — more predictable returns")
          ),
          React.createElement("div",{style:{padding:"12px 14px",background:"rgba(14,116,144,.06)",border:"1px solid rgba(14,116,144,.15)",borderRadius:10}},
            React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Tail Ratio"),
            React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#0e7490"}},tailRiskData.tailRatio===Infinity?"∞":tailRiskData.tailRatio.toFixed(2)+"×"),
            React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Avg best 5% ÷ avg worst 5%")
          )
        ),
        /* Worst 5 & Best 5 */
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}},
          React.createElement("div",{style:{padding:"10px 14px",background:"rgba(239,68,68,.04)",border:"1px solid rgba(239,68,68,.12)",borderRadius:8}},
            React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#ef4444",marginBottom:6}},"Worst 5 Returns"),
            tailRiskData.worst5.map((r,i)=>React.createElement("div",{key:i,style:{fontSize:11,color:"var(--text4)",padding:"2px 0"}},ret(r)))
          ),
          React.createElement("div",{style:{padding:"10px 14px",background:"rgba(22,163,74,.04)",border:"1px solid rgba(22,163,74,.12)",borderRadius:8}},
            React.createElement("div",{style:{fontSize:10,fontWeight:700,color:"#16a34a",marginBottom:6}},"Best 5 Returns"),
            tailRiskData.best5.map((r,i)=>React.createElement("div",{key:i,style:{fontSize:11,color:"var(--text4)",padding:"2px 0"}},ret(r)))
          )
        ),
        React.createElement("div",{style:{fontSize:11,color:"var(--text5)",lineHeight:1.6,padding:"8px 12px",background:"var(--bg5)",borderRadius:8}},
          React.createElement("strong",null,"What to watch: "),"Negative skewness means more extreme losses than gains — asymmetric risk. High kurtosis (>1) means more outlier events than a normal distribution would predict. A tail ratio >1 means your best trades outpace your worst, which is healthy."
        )
      )
    ),

    /* ══ Methodology note ══ */
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Volatility (σ) = population standard deviation of per-trade return percentages (sample std dev with n-1 denominator). Sharpe-like ratio = mean return ÷ σ; this is not the traditional Sharpe ratio (which uses excess return over risk-free rate) but serves as a relative risk-adjusted performance indicator. Max drawdown is computed as the largest peak-to-trough decline in cumulative P&L expressed as a percentage of total capital deployed. Losing streaks count consecutive trades with negative P&L. Concentration risk = (sum of |P&L| for top 3 stocks) ÷ (sum of |P&L| for all stocks) × 100; higher values indicate fewer stocks drive performance, increasing the role of luck. Composite risk score is a weighted aggregate: 30% volatility + 25% Sharpe weakness + 25% drawdown + 20% concentration. Active holdings use current price as exit. All amounts include brokerage. Value at Risk (VaR) shows the worst return at 95% and 99% confidence levels (historical and parametric). Expected Shortfall (CVaR) averages losses beyond VaR. Max Drawdown per Stock tracks the worst peak-to-trough decline for each position. Risk-Adjusted Rankings use Sharpe-like ratio (mean return ÷ σ) to rank stocks by risk-normalised performance. Tail Risk Analysis examines skewness, kurtosis, and extreme return percentiles."
    )
  );
};


const PatternMining=({shares,soldShareSnapshots={}})=>{

  const ret=(v)=>(v>=0?"+":"")+v.toFixed(2)+"%";

  /* ── Build unified trade list with holdDays ── */
  const trades=React.useMemo(()=>{
    const list=[];
    (shares||[]).forEach(sh=>{
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      const buyDate=new Date(sh.buyDate+"T12:00:00");
      const sellDate=new Date(TODAY()+"T12:00:00");
      const holdDays=Math.max(0,Math.floor((sellDate-buyDate)/864e5));
      const buyAmt=sh.qty*sh.buyPrice;
      const sellAmt=sh.qty*sh.currentPrice;
      const brokerage=+sh.brokerage||0;
      const pnl=sellAmt-buyAmt-brokerage;
      const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
      list.push({
        id:sh.id,type:"active",company:sh.company,ticker:(sh.ticker||sh.company||"").toUpperCase(),
        qty:sh.qty,buyPrice:sh.buyPrice,sellPrice:sh.currentPrice,
        buyDate:sh.buyDate,sellDate:TODAY(),holdDays,
        buyAmt,sellAmt,brokerage,pnl,returnPct,
      });
    });
    Object.values(soldShareSnapshots||{}).forEach(fySnaps=>{
      (fySnaps||[]).forEach(sn=>{
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate)return;
        const buyDate=new Date(sn.buyDate+"T12:00:00");
        const sellDate=new Date((sn.savedAt||sn.sellDate)+"T12:00:00");
        const holdDays=Math.max(0,Math.floor((sellDate-buyDate)/864e5));
        const buyAmt=sn.qty*sn.buyPrice;
        const sellAmt=sn.qty*sn.sellPrice;
        const brokerage=+sn.brokerage||0;
        const pnl=sellAmt-buyAmt-brokerage;
        const returnPct=buyAmt>0?(pnl/buyAmt*100):0;
        list.push({
          id:sn.id,type:"sold",company:sn.company,ticker:(sn.ticker||sn.company||"").toUpperCase(),
          qty:sn.qty,buyPrice:sn.buyPrice,sellPrice:sn.sellPrice,
          buyDate:sn.buyDate,sellDate:sn.savedAt||sn.sellDate,holdDays,
          buyAmt,sellAmt,brokerage,pnl,returnPct,
        });
      });
    });
    /* Sort by buyDate for revisit analysis */
    list.sort((a,b)=>(a.buyDate||"").localeCompare(b.buyDate||""));
    return list;
  },[shares,soldShareSnapshots]);

  /* ═══════════════════════════════════════════════════════════════
     1. Sweet-spot holding period — duration band with best avg return
     ═══════════════════════════════════════════════════════════════ */
  const sweetSpot=React.useMemo(()=>{
    if(!trades.length)return null;
    const bands=[
      {key:"1w",label:"< 1 week",min:0,max:7},
      {key:"2w",label:"1–2 weeks",min:7,max:14},
      {key:"1m",label:"2–4 weeks",min:14,max:30},
      {key:"3m",label:"1–3 months",min:30,max:91},
      {key:"6m",label:"3–6 months",min:91,max:183},
      {key:"1y",label:"6–12 months",min:183,max:365},
      {key:"2y",label:"1–2 years",min:365,max:730},
      {key:"2y+",label:"2+ years",min:730,max:Infinity},
    ];
    const bucketed=bands.map(b=>{
      const bt=trades.filter(t=>t.holdDays>=b.min&&t.holdDays<b.max);
      const avgReturn=bt.length>0?bt.reduce((s,t)=>s+t.returnPct,0)/bt.length:0;
      const avgPnl=bt.length>0?bt.reduce((s,t)=>s+t.pnl,0)/bt.length:0;
      const winRate=bt.length>0?(bt.filter(t=>t.pnl>0).length/bt.length*100):0;
      const totalPnl=bt.reduce((s,t)=>s+t.pnl,0);
      return{...b,trades:bt,count:bt.length,avgReturn,avgPnl,winRate,totalPnl};
    }).filter(b=>b.count>0);
    if(!bucketed.length)return null;
    const best=bucketed.reduce((a,b)=>b.avgReturn>a.avgReturn?b:a);
    const worst=bucketed.reduce((a,b)=>b.avgReturn<a.avgReturn?b:a);
    const mostTrades=bucketed.reduce((a,b)=>b.count>a.count?b:a);
    return{bands:bucketed,best,worst,mostTrades};
  },[trades]);

  /* ═══════════════════════════════════════════════════════════════
     2. Return decay curve — do returns improve or decay with hold time?
     ═══════════════════════════════════════════════════════════════ */
  const decayCurve=React.useMemo(()=>{
    if(!trades.length)return null;
    /* Bucket by hold days in finer granularity */
    const bands=[
      {label:"0–3d",min:0,max:4},{label:"4–7d",min:4,max:8},{label:"1–2w",min:7,max:15},
      {label:"2–3w",min:15,max:22},{label:"3–4w",min:22,max:31},{label:"1–2m",min:31,max:61},
      {label:"2–3m",min:61,max:92},{label:"3–6m",min:92,max:183},{label:"6–12m",min:183,max:366},
      {label:"1–2y",min:366,max:731},{label:"2y+",min:731,max:Infinity},
    ];
    const points=bands.map(b=>{
      const bt=trades.filter(t=>t.holdDays>=b.min&&t.holdDays<b.max);
      const avgReturn=bt.length>0?bt.reduce((s,t)=>s+t.returnPct,0)/bt.length:0;
      const medianReturn=bt.length>0?bt.map(t=>t.returnPct).sort((a,b)=>a-b)[Math.floor(bt.length/2)]:0;
      const winRate=bt.length>0?(bt.filter(t=>t.pnl>0).length/bt.length*100):0;
      return{label:b.label,count:bt.length,avgReturn,medianReturn,winRate};
    }).filter(p=>p.count>0);
    if(points.length<2)return null;
    /* Trend: positive slope = improving with time, negative = decay */
    const n=points.length;
    const xMean=(n-1)/2;
    const yMean=points.reduce((s,p)=>s+p.avgReturn,0)/n;
    let num=0,den=0;
    points.forEach((p,i)=>{
      num+=(i-xMean)*(p.avgReturn-yMean);
      den+=(i-xMean)*(i-xMean); /* sum of (xi - xMean)^2 */
    });
    const slope=den!==0?num/den:0;
    /* R² for fit quality */
    const yPred=points.map((_,i)=>yMean+slope*(i-xMean));
    const ssRes=points.reduce((s,p,i)=>s+Math.pow(p.avgReturn-yPred[i],2),0);
    const ssTot=points.reduce((s,p)=>s+Math.pow(p.avgReturn-yMean,2),0);
    const r2=ssTot>0?1-ssRes/ssTot:0;
    const trend=slope>0.5?"improving":slope<-0.5?"decaying":"flat";
    return{points,slope,r2,trend};
  },[trades]);

  /* ═══════════════════════════════════════════════════════════════
     3. Stock revisit success rate — 1st vs 2nd+ trades on same stock
     ═══════════════════════════════════════════════════════════════ */
  const revisitData=React.useMemo(()=>{
    if(!trades.length)return null;
    /* Group trades by ticker */
    const byTicker={};
    trades.forEach(t=>{
      if(!byTicker[t.ticker])byTicker[t.ticker]=[];
      byTicker[t.ticker].push(t);
    });
    /* Only stocks with 2+ trades */
    const multiTradeStocks=Object.entries(byTicker).filter(([,txs])=>txs.length>=2);
    if(!multiTradeStocks.length)return{stocks:[],summary:null};
    const stocks=multiTradeStocks.map(([ticker,txs])=>{
      /* Sort by buyDate */
      txs.sort((a,b)=>(a.buyDate||"").localeCompare(b.buyDate||""));
      const first=txs[0];
      const subsequent=txs.slice(1);
      const firstReturn=first.returnPct;
      const firstWin=first.pnl>0;
      const subAvgReturn=subsequent.length>0?subsequent.reduce((s,t)=>s+t.returnPct,0)/subsequent.length:0;
      const subWinRate=subsequent.length>0?(subsequent.filter(t=>t.pnl>0).length/subsequent.length*100):0;
      const subTotalPnl=subsequent.reduce((s,t)=>s+t.pnl,0);
      const improved=subAvgReturn>firstReturn;
      return{
        ticker,company:first.company||ticker,
        tradeCount:txs.length,
        firstReturn,firstWin,firstPnl:first.pnl,
        subAvgReturn,subWinRate,subTotalPnl,
        subCount:subsequent.length,
        improved,
        deltaReturn:subAvgReturn-firstReturn,
      };
    });
    /* Overall summary */
    const totalFirstReturn=stocks.reduce((s,st)=>s+st.firstReturn,0)/stocks.length;
    const totalSubReturn=stocks.reduce((s,st)=>s+st.subAvgReturn,0)/stocks.length;
    const firstWinRate=stocks.filter(st=>st.firstWin).length/stocks.length*100;
    const subWinRate=stocks.reduce((s,st)=>s+st.subWinRate,0)/stocks.length;
    const improvedCount=stocks.filter(st=>st.improved).length;
    const summary={
      stockCount:stocks.length,
      totalTrades:stocks.reduce((s,st)=>s+st.tradeCount,0),
      avgFirstReturn:totalFirstReturn,
      avgSubReturn:totalSubReturn,
      firstWinRate,subWinRate,
      improvedCount,improvedPct:stocks.length>0?(improvedCount/stocks.length*100):0,
    };
    return{stocks:stocks.sort((a,b)=>Math.abs(b.deltaReturn)-Math.abs(a.deltaReturn)),summary};
  },[trades]);

  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"bolt",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to Previous Trades to see pattern mining.")
  );

  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},

    /* ══ 1. SWEET SPOT HOLDING PERIOD ══ */
    sweetSpot&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:16,display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"target",size:15}),"Your Sweet-Spot Holding Period"),
      /* Best band highlight */
      React.createElement("div",{style:{
        background:sweetSpot.best.avgReturn>=0?"rgba(22,163,74,.07)":"rgba(239,68,68,.07)",
        border:"1px solid "+(sweetSpot.best.avgReturn>=0?"rgba(22,163,74,.2)":"rgba(239,68,68,.2)"),
        borderRadius:12,padding:"16px 20px",marginBottom:16,
      }},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Best Performing Duration"),
        React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:sweetSpot.best.avgReturn>=0?"#16a34a":"#ef4444"}},sweetSpot.best.label),
        React.createElement("div",{style:{display:"flex",gap:20,marginTop:8,flexWrap:"wrap"}},
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.4}},"Avg Return"),
            React.createElement("div",{style:{fontSize:15,fontWeight:700,fontFamily:"'Sora',sans-serif",color:sweetSpot.best.avgReturn>=0?"#16a34a":"#ef4444"}},ret(sweetSpot.best.avgReturn))
          ),
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.4}},"Win Rate"),
            React.createElement("div",{style:{fontSize:15,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"var(--text3)"}},sweetSpot.best.winRate.toFixed(1)+"%")
          ),
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.4}},"Trades"),
            React.createElement("div",{style:{fontSize:15,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"var(--text3)"}},sweetSpot.best.count)
          ),
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.4}},"Total P&L"),
            React.createElement("div",{style:{fontSize:15,fontWeight:700,fontFamily:"'Sora',sans-serif",color:sweetSpot.best.totalPnl>=0?"#16a34a":"#ef4444"}},(sweetSpot.best.totalPnl>=0?"+":"")+INR(sweetSpot.best.totalPnl))
          )
        )
      ),
      /* All bands table */
      React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:0,borderRadius:10,overflow:"hidden",border:"1px solid var(--border)"}},
        /* Header */
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"minmax(100px,1fr) 50px 75px 60px 80px",gap:8,padding:"8px 12px",background:"var(--bg5)",fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},
          React.createElement("div",null,"Duration"),
          React.createElement("div",{style:{textAlign:"center"}},"Trades"),
          React.createElement("div",{style:{textAlign:"right"}},"Avg Return"),
          React.createElement("div",{style:{textAlign:"right"}},"Win %"),
          React.createElement("div",{style:{textAlign:"right"}},"Total P&L")
        ),
        sweetSpot.bands.map((b,i)=>{
          const isBest=b.key===sweetSpot.best.key;
          const isWorst=b.key===sweetSpot.worst.key;
          return React.createElement("div",{key:b.key,style:{
            display:"grid",gridTemplateColumns:"minmax(100px,1fr) 50px 75px 60px 80px",gap:8,
            padding:"9px 12px",background:isBest?"rgba(22,163,74,.06)":isWorst?"rgba(239,68,68,.04)":(i%2?"var(--bg5)":"transparent"),
            borderBottom:i<sweetSpot.bands.length-1?"1px solid var(--border)":"none",
            alignItems:"center",
          }},
            React.createElement("div",{style:{fontSize:12,fontWeight:isBest?700:500,color:isBest?"#16a34a":"var(--text3)",display:"flex",alignItems:"center",gap:6}},
              b.label,
              isBest&&React.createElement("span",{style:{fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:8,background:"rgba(22,163,74,.12)",color:"#16a34a"}},"★ BEST")
            ),
            React.createElement("div",{style:{fontSize:12,fontWeight:600,color:"var(--text4)",textAlign:"center"}},b.count),
            React.createElement("div",{style:{fontSize:12,fontWeight:700,fontFamily:"'Sora',sans-serif",color:b.avgReturn>=0?"#16a34a":"#ef4444",textAlign:"right"}},ret(b.avgReturn)),
            React.createElement("div",{style:{fontSize:11,fontWeight:600,color:"var(--text4)",textAlign:"right"}},b.winRate.toFixed(0)+"%"),
            React.createElement("div",{style:{fontSize:11,fontWeight:600,color:b.totalPnl>=0?"#16a34a":"#ef4444",textAlign:"right"}},(b.totalPnl>=0?"+":"")+INR(b.totalPnl))
          );
        })
      ),
      /* Insight */
      React.createElement("div",{style:{marginTop:14,padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:8,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
        sweetSpot.best.key===sweetSpot.mostTrades.key
          ?React.createElement(React.Fragment,null,"Your best returns come from your most-traded duration band (",React.createElement("strong",{style:{color:"var(--accent)"}},sweetSpot.best.label),"). You're naturally gravitating toward what works.")
          :React.createElement(React.Fragment,null,"Your sweet spot is ",React.createElement("strong",{style:{color:"var(--accent)"}},sweetSpot.best.label)," but you trade most in ",React.createElement("strong",null,sweetSpot.mostTrades.label),". Consider aligning your holding period with your best-performing band.")
      )
    ),

    /* ══ 2. RETURN DECAY CURVE ══ */
    decayCurve&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:4,display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"invest",size:15}),"Return Decay Curve"),
      React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginBottom:16}},"Do your returns improve with longer holds, or peak at a certain duration?"),
      /* Trend indicator */
      React.createElement("div",{style:{
        display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,
        marginBottom:16,
        background:decayCurve.trend==="improving"?"rgba(22,163,74,.08)":decayCurve.trend==="decaying"?"rgba(239,68,68,.08)":"rgba(234,179,8,.08)",
        border:"1px solid "+(decayCurve.trend==="improving"?"rgba(22,163,74,.2)":decayCurve.trend==="decaying"?"rgba(239,68,68,.2)":"rgba(234,179,8,.2)")
      }},
        React.createElement("span",{style:{fontSize:16}},decayCurve.trend==="improving"?React.createElement(Icon,{n:"invest",size:16,color:"#16a34a"}):decayCurve.trend==="decaying"?React.createElement(Icon,{n:"trenddown",size:16,color:"#ef4444"}):"→"),
        React.createElement("span",{style:{fontSize:12,fontWeight:700,color:decayCurve.trend==="improving"?"#16a34a":decayCurve.trend==="decaying"?"#ef4444":"#eab308"}},
          decayCurve.trend==="improving"?"Returns improve with holding time"
          :decayCurve.trend==="decaying"?"Returns decay with longer holds"
          :"Returns are flat across holding periods"
        ),
        React.createElement("span",{style:{fontSize:10,color:"var(--text6)"}},"(R²="+decayCurve.r2.toFixed(2)+")")
      ),
      /* Chart bars */
      React.createElement("div",{style:{display:"flex",alignItems:"flex-end",gap:6,height:140,padding:"0 4px",marginBottom:4}},
        decayCurve.points.map((p,i)=>{
          const maxAbs=Math.max(...decayCurve.points.map(x=>Math.abs(x.avgReturn)),1);
          const barH=Math.min(Math.abs(p.avgReturn)/maxAbs*100,100);
          const col=p.avgReturn>=0?"#16a34a":"#ef4444";
          return React.createElement("div",{key:i,style:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}},
            React.createElement("span",{style:{fontSize:9,fontWeight:600,color:col,marginBottom:3}},ret(p.avgReturn)),
            React.createElement("div",{style:{width:"100%",height:Math.max(barH,3)+"%",background:col,borderRadius:"3px 3px 0 0",opacity:.7}}),
            React.createElement("span",{style:{fontSize:8,color:"var(--text6)",marginTop:3}},p.count)
          );
        })
      ),
      /* X-axis labels */
      React.createElement("div",{style:{display:"flex",gap:6,padding:"0 4px"}},
        decayCurve.points.map((p,i)=>React.createElement("div",{key:i,style:{flex:1,textAlign:"center"}},
          React.createElement("span",{style:{fontSize:8,color:"var(--text6)",writingMode:"vertical-lr",transform:"rotate(180deg)",maxHeight:60,display:"block",overflow:"hidden",textOverflow:"ellipsis"}},p.label)
        ))
      ),
      /* Win rate line */
      React.createElement("div",{style:{marginTop:16,display:"flex",gap:6,padding:"0 4px"}},
        decayCurve.points.map((p,i)=>React.createElement("div",{key:i,style:{flex:1,textAlign:"center"}},
          React.createElement("div",{style:{fontSize:8,color:"var(--text5)",fontWeight:600}},p.winRate.toFixed(0)+"% w/r")
        ))
      ),
      /* Interpretation */
      React.createElement("div",{style:{marginTop:14,padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:8,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
        decayCurve.trend==="improving"
          ?React.createElement(React.Fragment,null,"Your returns ",React.createElement("strong",{style:{color:"#16a34a"}},"improve")," the longer you hold. Patience is rewarded — your longer-held trades outperform quick flips. Consider extending your typical hold period.")
          :decayCurve.trend==="decaying"
            ?React.createElement(React.Fragment,null,"Your returns ",React.createElement("strong",{style:{color:"#ef4444"}},"decay")," with longer holds. Your best trades are shorter-duration — longer holds tend to mean-revert. Consider taking profits earlier or setting tighter stop-losses.")
            :React.createElement(React.Fragment,null,"Your returns are ",React.createElement("strong",{style:{color:"#eab308"}},"flat")," across holding periods — duration doesn't strongly predict your returns. Focus on entry quality and stock selection rather than timing exits.")
      )
    ),

    /* ══ 3. STOCK REVISIT SUCCESS RATE ══ */
    revisitData&&revisitData.summary&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:4,display:"flex",alignItems:"center",gap:6}},React.createElement(Icon,{n:"refresh",size:15}),"Stock Revisit Success Rate"),
      React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginBottom:16}},"When you trade the same stock again, are the subsequent trades better or worse than your first?"),
      /* Summary cards */
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:16}},
        React.createElement("div",{style:{background:"rgba(109,40,217,.07)",border:"1px solid rgba(109,40,217,.2)",borderRadius:10,padding:"12px 14px"}},
          React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.4,marginBottom:4}},"Stocks Revisited"),
          React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#7c3aed"}},revisitData.summary.stockCount),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},revisitData.summary.totalTrades+" total trades")
        ),
        React.createElement("div",{style:{background:revisitData.summary.avgFirstReturn>=0?"rgba(22,163,74,.07)":"rgba(239,68,68,.07)",border:"1px solid "+(revisitData.summary.avgFirstReturn>=0?"rgba(22,163,74,.2)":"rgba(239,68,68,.2)"),borderRadius:10,padding:"12px 14px"}},
          React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.4,marginBottom:4}},"1st Trade Avg Return"),
          React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:revisitData.summary.avgFirstReturn>=0?"#16a34a":"#ef4444"}},ret(revisitData.summary.avgFirstReturn)),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},revisitData.summary.firstWinRate.toFixed(0)+"% win rate")
        ),
        React.createElement("div",{style:{background:revisitData.summary.avgSubReturn>=0?"rgba(22,163,74,.07)":"rgba(239,68,68,.07)",border:"1px solid "+(revisitData.summary.avgSubReturn>=0?"rgba(22,163,74,.2)":"rgba(239,68,68,.2)"),borderRadius:10,padding:"12px 14px"}},
          React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.4,marginBottom:4}},"2nd+ Trade Avg Return"),
          React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:revisitData.summary.avgSubReturn>=0?"#16a34a":"#ef4444"}},ret(revisitData.summary.avgSubReturn)),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},revisitData.summary.subWinRate.toFixed(0)+"% win rate")
        ),
        React.createElement("div",{style:{background:revisitData.summary.improvedPct>=50?"rgba(22,163,74,.07)":"rgba(239,68,68,.07)",border:"1px solid "+(revisitData.summary.improvedPct>=50?"rgba(22,163,74,.2)":"rgba(239,68,68,.2)"),borderRadius:10,padding:"12px 14px"}},
          React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.4,marginBottom:4}},"Improved on Revisit"),
          React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:revisitData.summary.improvedPct>=50?"#16a34a":"#ef4444"}},revisitData.summary.improvedPct.toFixed(0)+"%"),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},revisitData.summary.improvedCount+" of "+revisitData.summary.stockCount+" stocks")
        )
      ),
      /* Per-stock detail */
      revisitData.stocks.length>0&&React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:0,borderRadius:10,overflow:"hidden",border:"1px solid var(--border)"}},
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"minmax(80px,1fr) 46px 65px 65px 65px 56px",gap:6,padding:"8px 12px",background:"var(--bg5)",fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},
          React.createElement("div",null,"Stock"),
          React.createElement("div",{style:{textAlign:"center"}},"#"),
          React.createElement("div",{style:{textAlign:"right"}},"1st Return"),
          React.createElement("div",{style:{textAlign:"right"}},"2nd+ Avg"),
          React.createElement("div",{style:{textAlign:"right"}},"Delta"),
          React.createElement("div",{style:{textAlign:"center"}},"Verdict")
        ),
        revisitData.stocks.slice(0,10).map((st,i)=>React.createElement("div",{key:st.ticker,style:{
          display:"grid",gridTemplateColumns:"minmax(80px,1fr) 46px 65px 65px 65px 56px",gap:6,
          padding:"9px 12px",background:i%2?"var(--bg5)":"transparent",
          borderBottom:i<Math.min(revisitData.stocks.length,10)-1?"1px solid var(--border)":"none",
          alignItems:"center",
        }},
          React.createElement("div",{style:{fontSize:11,fontWeight:600,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},st.company),
          React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"var(--text4)",textAlign:"center"}},st.tradeCount),
          React.createElement("div",{style:{fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",color:st.firstReturn>=0?"#16a34a":"#ef4444",textAlign:"right"}},ret(st.firstReturn)),
          React.createElement("div",{style:{fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",color:st.subAvgReturn>=0?"#16a34a":"#ef4444",textAlign:"right"}},ret(st.subAvgReturn)),
          React.createElement("div",{style:{fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",color:st.deltaReturn>=0?"#16a34a":"#ef4444",textAlign:"right"}},(st.deltaReturn>=0?"+":"")+st.deltaReturn.toFixed(1)+"%"),
          React.createElement("div",{style:{textAlign:"center"}},
            React.createElement("span",{style:{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:8,background:st.improved?"rgba(22,163,74,.1)":"rgba(239,68,68,.1)",color:st.improved?"#16a34a":"#ef4444"}},st.improved?"✓ Better":"✗ Worse")
          )
        )),
        revisitData.stocks.length>10&&React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textAlign:"center",padding:"8px 0"}},"+"+(revisitData.stocks.length-10)+" more stocks")
      ),
      /* Overall insight */
      React.createElement("div",{style:{marginTop:14,padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:8,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
        revisitData.summary.improvedPct>=60
          ?React.createElement(React.Fragment,null,"You're a ",React.createElement("strong",{style:{color:"#16a34a"}},"learning trader")," — revisit trades outperform first trades ",React.createElement("strong",null,revisitData.summary.improvedPct.toFixed(0)+"%")," of the time. Your experience with a stock improves your timing. Keep revisiting winners.")
          :revisitData.summary.improvedPct>=40
            ?React.createElement(React.Fragment,null,"Your revisit results are ",React.createElement("strong",{style:{color:"#eab308"}},"mixed")," — ",revisitData.summary.improvedPct.toFixed(0)+"% of stocks show improvement on repeat trades. Some stocks you've learned from, others you haven't. Analyze the winners vs losers for patterns.")
            :React.createElement(React.Fragment,null,"Repeat trades tend to ",React.createElement("strong",{style:{color:"#ef4444"}},"underperform")," your first trades. This could indicate: anchoring bias (holding onto losing theses), averaging down into losers, or chasing stocks you're emotionally attached to. Consider a rule: if a stock disappointed once, skip the revisit.")
      )
    ),

    /* ══ Methodology note ══ */
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Sweet-spot holding period groups trades into standard duration bands (< 1 week, 1-2 weeks, 2-4 weeks, 1-3 months, 3-6 months, 6-12 months, 1-2 years, 2+ years) and computes average return, win rate, and total P&L per band. The band with the highest average return is flagged as your sweet spot. Return decay curve uses finer-grained buckets and fits a linear regression (least squares) to detect whether returns improve (positive slope) or decay (negative slope) with holding duration; R² measures fit quality. Stock revisit analysis groups trades by ticker, identifies stocks with 2+ trades, and compares the first trade's return against the average of subsequent trades. 'Improved' means the 2nd+ average return exceeds the first trade's return. Active holdings use current price as exit. All amounts include brokerage."
    )
  );
};


const DrawdownRecoveryTracker=({shares,soldShareSnapshots={}})=>{
  const ret=(v)=>(v>=0?"+":"")+v.toFixed(2)+"%";

  const trades=React.useMemo(()=>{
    const list=[];
    (shares||[]).forEach(sh=>{
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      const buyAmt=sh.qty*sh.buyPrice;
      const sellAmt=sh.qty*sh.currentPrice;
      const brokerage=+sh.brokerage||0;
      list.push({id:sh.id,type:"active",company:sh.company,ticker:sh.ticker,buyDate:sh.buyDate,sellDate:TODAY(),buyAmt,sellAmt,pnl:sellAmt-buyAmt-brokerage,returnPct:buyAmt>0?((sellAmt-buyAmt-brokerage)/buyAmt*100):0});
    });
    Object.values(soldShareSnapshots||{}).forEach(fySnaps=>{
      (fySnaps||[]).forEach(sn=>{
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate)return;
        const buyAmt=sn.qty*sn.buyPrice;
        const sellAmt=sn.qty*sn.sellPrice;
        const brokerage=+sn.brokerage||0;
        list.push({id:sn.id,type:"sold",company:sn.company,ticker:sn.ticker,buyDate:sn.buyDate,sellDate:sn.savedAt,buyAmt,sellAmt,pnl:sellAmt-buyAmt-brokerage,returnPct:buyAmt>0?((sellAmt-buyAmt-brokerage)/buyAmt*100):0});
      });
    });
    return list.sort((a,b)=>(a.sellDate||"").localeCompare(b.sellDate||""));
  },[shares,soldShareSnapshots]);

  /* ── Equity curve with drawdown tracking ── */
  const equityData=React.useMemo(()=>{
    if(!trades.length)return{points:[],maxDrawdown:0,maxDrawdownPct:0,recoveryFactor:0,currentDD:0,currentDDPct:0,peakValue:0,drawdownPeriods:[]};
    let cumPnl=0,peak=0;
    const points=[];
    const drawdownPeriods=[];
    let inDrawdown=false,ddStartIdx=0,ddPeakVal=0;
    trades.forEach((t,i)=>{
      cumPnl+=t.pnl;
      if(cumPnl>peak){
        if(inDrawdown&&ddPeakVal>0){
          const recoveryDays=Math.max(1,Math.floor((new Date((t.sellDate||t.buyDate)+"T12:00:00")-new Date((trades[ddStartIdx].sellDate||trades[ddStartIdx].buyDate)+"T12:00:00"))/864e5));
          drawdownPeriods.push({startIdx:ddStartIdx,endIdx:i,depth:ddPeakVal,recoveryDays});
        }
        inDrawdown=false;peak=cumPnl;
      }
      const dd=peak-cumPnl;
      if(dd>0&&!inDrawdown){inDrawdown=true;ddStartIdx=i;ddPeakVal=dd;}
      if(dd>0&&dd>ddPeakVal)ddPeakVal=dd;
      points.push({date:t.sellDate||t.buyDate,cumPnl,drawdown:dd,peak});
    });
    if(inDrawdown)drawdownPeriods.push({startIdx:ddStartIdx,endIdx:trades.length-1,depth:ddPeakVal,recoveryDays:null});
    const maxDD=Math.max(...points.map(p=>p.drawdown),0);
    const totalInvested=trades.reduce((s,t)=>s+t.buyAmt,0);
    const maxDDPct=totalInvested>0?(maxDD/totalInvested*100):0;
    const totalPnl=trades.reduce((s,t)=>s+t.pnl,0);
    const recoveryFactor=maxDD>0?(totalPnl/maxDD):0;
    const currentPeak=points.length?points[points.length-1].peak:0;
    const currentDD=currentPeak-cumPnl;
    const currentDDPct=currentPeak>0?(currentDD/currentPeak*100):0;
    return{points,maxDrawdown:maxDD,maxDrawdownPct:maxDDPct,recoveryFactor,currentDD,currentDDPct,peakValue:currentPeak,drawdownPeriods,totalPnl,totalInvested};
  },[trades]);

  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"invest",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to Previous Trades to see drawdown analytics.")
  );

  const eq=equityData;
  const chartW=700,chartH=220;
  const maxPnl=Math.max(...eq.points.map(p=>p.cumPnl),0);
  const minPnl=Math.min(...eq.points.map(p=>p.cumPnl),0);
  const range=maxPnl-minPnl||1;
  const toY=(v)=>chartH-((v-minPnl)/range)*(chartH-40)-20;
  const toX=(i)=>(i/Math.max(eq.points.length-1,1))*(chartW-40)+20;
  const eqLine=eq.points.map((p,i)=>(i===0?"M":"L")+toX(i).toFixed(1)+","+toY(p.cumPnl).toFixed(1)).join(" ");
  const ddArea=eq.points.length>1
    ?"M"+toX(0).toFixed(1)+","+toY(eq.points[0].peak).toFixed(1)+" "+eq.points.map((p,i)=>"L"+toX(i).toFixed(1)+","+toY(Math.min(p.cumPnl,p.peak)).toFixed(1)).join(" ")+" L"+toX(eq.points.length-1).toFixed(1)+","+toY(eq.points[eq.points.length-1].peak).toFixed(1)+" Z"
    :"";

  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12}},
      React.createElement("div",{style:{background:eq.currentDDPct>0?"rgba(239,68,68,.07)":"rgba(22,163,74,.07)",border:"1px solid "+(eq.currentDDPct>0?"rgba(239,68,68,.2)":"rgba(22,163,74,.2)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Current Drawdown"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:eq.currentDDPct>0?"#ef4444":"#16a34a"}},eq.currentDDPct>0?"-"+eq.currentDDPct.toFixed(2)+"%":"None"),
        eq.currentDDPct>0&&React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},INR(eq.currentDD)+" below peak")
      ),
      React.createElement("div",{style:{background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.2)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Max Drawdown"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#ef4444"}},"-"+eq.maxDrawdownPct.toFixed(2)+"%"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},INR(eq.maxDrawdown)+" capital lost")
      ),
      React.createElement("div",{style:{background:eq.recoveryFactor>=2?"rgba(22,163,74,.07)":eq.recoveryFactor>=1?"rgba(234,179,8,.07)":"rgba(239,68,68,.07)",border:"1px solid "+(eq.recoveryFactor>=2?"rgba(22,163,74,.2)":eq.recoveryFactor>=1?"rgba(234,179,8,.2)":"rgba(239,68,68,.2)"),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Recovery Factor"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:eq.recoveryFactor>=2?"#16a34a":eq.recoveryFactor>=1?"#eab308":"#ef4444"}},eq.recoveryFactor.toFixed(2)+"×"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},eq.recoveryFactor>=2?"✓ Healthy (>2×)":eq.recoveryFactor>=1?"Marginal (<2×)":"⚠ Weak (<1×)")
      ),
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Peak Portfolio Value"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},INR(eq.peakValue)),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Cumulative P&L peak")
      )
    ),
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:8}},
        React.createElement(Icon,{n:"chart",size:16,color:"var(--accent)"}),"Equity Curve with Drawdown Shading"
      ),
      eq.points.length<2
        ?React.createElement("div",{style:{textAlign:"center",padding:"40px",fontSize:12,color:"var(--text6)"}},"Need at least 2 trades to plot equity curve")
        :React.createElement("div",{style:{overflowX:"auto"}},React.createElement("svg",{width:chartW,height:chartH,style:{display:"block"}},
          [0,0.25,0.5,0.75,1].map(pct=>{
            const y=toY(minPnl+pct*range);
            return React.createElement(React.Fragment,{key:pct},
              React.createElement("line",{x1:20,y1:y,x2:chartW-20,y2:y,stroke:"var(--border)",strokeWidth:0.5,strokeDasharray:"4,4"}),
              React.createElement("text",{x:18,y:y+3,fill:"var(--text6)",fontSize:8,textAnchor:"end",fontFamily:"'DM Sans'"},INR(minPnl+pct*range))
            );
          }),
          minPnl<0&&maxPnl>0&&React.createElement("line",{x1:20,y1:toY(0),x2:chartW-20,y2:toY(0),stroke:"var(--text6)",strokeWidth:0.5}),
          ddArea&&React.createElement("path",{d:ddArea,fill:"rgba(239,68,68,.12)",stroke:"none"}),
          React.createElement("path",{d:eqLine,fill:"none",stroke:eq.totalPnl>=0?"#16a34a":"#ef4444",strokeWidth:2.5,strokeLinejoin:"round",strokeLinecap:"round"}),
          eq.points.map((p,i)=>React.createElement("circle",{key:i,cx:toX(i),cy:toY(p.cumPnl),r:3,fill:p.cumPnl>=0?"#16a34a":"#ef4444",stroke:"var(--bg)",strokeWidth:1.5})),
          React.createElement("text",{x:chartW/2,y:chartH-2,fill:"var(--text6)",fontSize:9,textAnchor:"middle",fontFamily:"'DM Sans'"},"← Trade sequence →")
        ))
    ),
    eq.drawdownPeriods.length>0&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:8}},
        React.createElement(Icon,{n:"warning",size:16,color:"#ef4444"}),"Drawdown Periods"
      ),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"minmax(70px,1fr) minmax(70px,1fr) 80px 90px",gap:6,padding:"8px 12px",background:"var(--bg5)",fontSize:9,fontWeight:700,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5}},
        React.createElement("div",null,"Start"),React.createElement("div",null,"End"),React.createElement("div",{style:{textAlign:"right"}},"Depth"),React.createElement("div",{style:{textAlign:"right"}},"Recovery")
      ),
      eq.drawdownPeriods.slice(0,8).map((dp,i)=>{
        const startTrade=trades[dp.startIdx];const endTrade=trades[dp.endIdx];
        return React.createElement("div",{key:i,style:{display:"grid",gridTemplateColumns:"minmax(70px,1fr) minmax(70px,1fr) 80px 90px",gap:6,padding:"9px 12px",background:i%2?"var(--bg5)":"transparent",borderBottom:i<Math.min(eq.drawdownPeriods.length,8)-1?"1px solid var(--border)":"none",alignItems:"center"}},
          React.createElement("div",{style:{fontSize:11,color:"var(--text4)"}},startTrade.sellDate||startTrade.buyDate),
          React.createElement("div",{style:{fontSize:11,color:"var(--text4)"}},dp.recoveryDays?endTrade.sellDate||endTrade.buyDate:"Ongoing"),
          React.createElement("div",{style:{fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",color:"#ef4444",textAlign:"right"}},INR(dp.depth)),
          React.createElement("div",{style:{fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",color:dp.recoveryDays?"var(--text4)":"#eab308",textAlign:"right"}},dp.recoveryDays?dp.recoveryDays+" days":"Ongoing")
        );
      })
    ),
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Equity curve plots cumulative P&L (₹) per trade in chronological order. Drawdown shading shows the gap between the running peak and actual equity. Max drawdown is the deepest peak-to-trough decline as a % of total capital deployed. Recovery Factor = total net profit ÷ max drawdown (target >2×). Current drawdown shows how far below your all-time P&L peak you are right now. Active holdings use current price as exit. All amounts net of brokerage."
    )
  );
};


const MultiTimeframePerformance = ({ shares, soldShareSnapshots }) => {
  const ret = (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

  const trades = React.useMemo(() => {
    const list = [];
    (shares || []).forEach(sh => {
      if (!sh.qty || !sh.buyPrice || !sh.currentPrice || !sh.buyDate) return;
      const buyAmt = sh.qty * sh.buyPrice; const sellAmt = sh.qty * sh.currentPrice; const brokerage = +sh.brokerage || 0;
      list.push({ id: sh.id, type: "active", company: sh.company, ticker: sh.ticker, buyDate: sh.buyDate, sellDate: TODAY(), buyAmt, sellAmt, pnl: sellAmt - buyAmt - brokerage, returnPct: buyAmt > 0 ? ((sellAmt - buyAmt - brokerage) / buyAmt * 100) : 0 });
    });
    Object.values(soldShareSnapshots || {}).forEach(fySnaps => {
      (fySnaps || []).forEach(sn => {
        if (!sn.qty || !sn.buyPrice || !sn.sellPrice || !sn.buyDate) return;
        const buyAmt = sn.qty * sn.buyPrice; const sellAmt = sn.qty * sn.sellPrice; const brokerage = +sn.brokerage || 0;
        list.push({ id: sn.id, type: "sold", company: sn.company, ticker: sn.ticker, buyDate: sn.buyDate, sellDate: sn.savedAt, buyAmt, sellAmt, pnl: sellAmt - buyAmt - brokerage, returnPct: buyAmt > 0 ? ((sellAmt - buyAmt - brokerage) / buyAmt * 100) : 0 });
      });
    });
    return list.sort((a, b) => (a.sellDate || "").localeCompare(b.sellDate || ""));
  }, [shares, soldShareSnapshots]);

  const closedTrades = React.useMemo(() => trades.filter(t => t.type === "sold"), [trades]);

  const monthlyData = React.useMemo(() => {
    const map = {};
    closedTrades.forEach(t => {
      const month = (t.sellDate || t.buyDate || "").slice(0, 7); if (!month) return;
      if (!map[month]) map[month] = { month, pnl: 0, count: 0, winners: 0, losers: 0 };
      map[month].pnl += t.pnl; map[month].count++; if (t.pnl > 0) map[month].winners++; if (t.pnl < 0) map[month].losers++;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [closedTrades]);

  const streaks = React.useMemo(() => {
    if (!monthlyData.length) return { maxWin: 0, maxLoss: 0, curStreak: 0, curType: "none", consecMonths: [] };
    let maxWin = 0, maxLoss = 0, curStreak = 0, curType = monthlyData[0].pnl >= 0 ? "win" : "loss", bestWinStart = "", bestWinEnd = "", bestLossStart = "", bestLossEnd = "";
    let winStart = monthlyData[0].month, lossStart = monthlyData[0].month;
    const consecMonths = [];
    monthlyData.forEach((m, i) => {
      const type = m.pnl >= 0 ? "win" : "loss";
      if (type === curType) { curStreak++; }
      else {
        consecMonths.push({ type: curType, length: curStreak, start: i === 0 ? m.month : monthlyData[i - curStreak].month, end: monthlyData[i - 1].month });
        if (curType === "win" && curStreak > maxWin) { maxWin = curStreak; bestWinStart = winStart; bestWinEnd = monthlyData[i - 1].month; }
        if (curType === "loss" && curStreak > maxLoss) { maxLoss = curStreak; bestLossStart = lossStart; bestLossEnd = monthlyData[i - 1].month; }
        curType = type; curStreak = 1; if (type === "win") winStart = m.month; else lossStart = m.month;
      }
    });
    consecMonths.push({ type: curType, length: curStreak, start: monthlyData[monthlyData.length - curStreak].month, end: monthlyData[monthlyData.length - 1].month });
    if (curType === "win" && curStreak > maxWin) { maxWin = curStreak; bestWinStart = winStart; bestWinEnd = monthlyData[monthlyData.length - 1].month; }
    if (curType === "loss" && curStreak > maxLoss) { maxLoss = curStreak; bestLossStart = lossStart; bestLossEnd = monthlyData[monthlyData.length - 1].month; }
    return { maxWin, maxLoss, curStreak, curType, bestWinStart, bestWinEnd, bestLossStart, bestLossEnd, consecMonths };
  }, [monthlyData]);

  const weeklyData = React.useMemo(() => {
    const map = {};
    closedTrades.forEach(t => {
      const d = new Date((t.sellDate || t.buyDate) + "T12:00:00"); const ws = new Date(d); ws.setDate(d.getDate() - d.getDay()); const wk = ws.toISOString().slice(0, 10);
      if (!map[wk]) map[wk] = { week: wk, pnl: 0, count: 0, trades: [] };
      map[wk].pnl += t.pnl; map[wk].count++; map[wk].trades.push(t);
    });
    return Object.values(map).sort((a, b) => a.week.localeCompare(b.week));
  }, [closedTrades]);

  const bestWeek = weeklyData.reduce((best, w) => !best || w.pnl > best.pnl ? w : best, null);
  const worstWeek = weeklyData.reduce((worst, w) => !worst || w.pnl < worst.pnl ? w : worst, null);

  const heatmapData = React.useMemo(() => {
    if (!monthlyData.length) return { rows: [], maxAbs: 1 };
    const maxAbs = Math.max(...monthlyData.map(m => Math.abs(m.pnl)), 1);
    const byYear = {}; monthlyData.forEach(m => { const y = m.month.slice(0, 4); if (!byYear[y]) byYear[y] = {}; byYear[y][m.month.slice(5, 7)] = m; });
    const years = Object.keys(byYear).sort(); const months = ["01","02","03","04","05","06","07","08","09","10","11","12"];
    return { rows: years.map(y => ({ year: y, months: months.map(m => byYear[y]?.[m] || null) })), maxAbs };
  }, [monthlyData]);

  const [selectedMonth, setSelectedMonth] = React.useState(null);
  const tradesByMonth = React.useMemo(() => {
    const map = {};
    closedTrades.forEach(t => {
      const mk = (t.sellDate || t.buyDate || "").slice(0, 7); if (!mk) return;
      if (!map[mk]) map[mk] = []; map[mk].push(t);
    });
    return map;
  }, [closedTrades]);

  if (!closedTrades.length) return React.createElement(EmptyState, { icon: React.createElement(Icon, { n: "invest", size: 40 }), text: "No Closed Trades Yet", sub: "Sell shares or save snapshots to see multi-timeframe P&L analysis." });

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(175px,1fr))", gap: 12 } },
      React.createElement("div", { style: { background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Profitable Months"),
        React.createElement("div", { style: { fontSize: 20, fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#16a34a" } }, monthlyData.filter(m => m.pnl > 0).length + "/" + monthlyData.length),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, "of all months are green")
      ),
      React.createElement("div", { style: { background: streaks.maxWin >= 3 ? "rgba(22,163,74,.07)" : "var(--bg4)", border: "1px solid " + (streaks.maxWin >= 3 ? "rgba(22,163,74,.2)" : "var(--border)"), borderRadius: 12, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Best Win Streak"),
        React.createElement("div", { style: { fontSize: 20, fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#16a34a" } }, streaks.maxWin + " months"),
        streaks.bestWinStart && React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, streaks.bestWinStart + " \u2192 " + streaks.bestWinEnd)
      ),
      React.createElement("div", { style: { background: streaks.maxLoss >= 3 ? "rgba(239,68,68,.07)" : "var(--bg4)", border: "1px solid " + (streaks.maxLoss >= 3 ? "rgba(239,68,68,.2)" : "var(--border)"), borderRadius: 12, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Worst Loss Streak"),
        React.createElement("div", { style: { fontSize: 20, fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#ef4444" } }, streaks.maxLoss + " months"),
        streaks.bestLossStart && React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, streaks.bestLossStart + " \u2192 " + streaks.bestLossEnd)
      ),
      React.createElement("div", { style: { background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 } }, "Current Streak"),
        React.createElement("div", { style: { fontSize: 20, fontFamily: "'Sora',sans-serif", fontWeight: 800, color: streaks.curType === "win" ? "#16a34a" : "#ef4444" } }, streaks.curStreak + " " + streaks.curType + (streaks.curStreak !== 1 ? "s" : "")),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, streaks.curType === "win" ? "Keep it going!" : "Due for a turnaround")
      )
    ),
    React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, boxShadow: "var(--shadow-sm)" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text3)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 } },
        React.createElement(Icon, { n: "chart", size: 16, color: "var(--accent)" }), "Monthly P&L Heatmap"
      ),
      heatmapData.rows.length === 0
        ? React.createElement("div", { style: { textAlign: "center", padding: "40px", fontSize: 12, color: "var(--text6)" } }, "No monthly data")
        : React.createElement("div", null,
          React.createElement("div", { style: { overflowX: "auto" } },
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "50px repeat(12, 1fr)", gap: 3, minWidth: 500 } },
              React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", fontWeight: 700 } }, ""),
              ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => React.createElement("div", { key: m, style: { fontSize: 9, color: "var(--text6)", fontWeight: 700, textAlign: "center", padding: "4px 0" } }, m)),
              heatmapData.rows.map(r => React.createElement(React.Fragment, { key: r.year },
                React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text4)", display: "flex", alignItems: "center" } }, r.year),
                r.months.map((m, i) => {
                  if (!m) return React.createElement("div", { key: i, style: { background: "var(--bg5)", borderRadius: 4, minHeight: 32 } });
                  const intensity = Math.min(Math.abs(m.pnl) / heatmapData.maxAbs, 1);
                  const bg = m.pnl >= 0 ? "rgba(22,163,74," + (0.08 + intensity * 0.35).toFixed(2) + ")" : "rgba(239,68,68," + (0.08 + intensity * 0.35).toFixed(2) + ")";
                  const _pnlAbs = Math.abs(m.pnl); const _pnlStr = (m.pnl >= 0 ? "+" : "") + (_pnlAbs >= 100000 ? (m.pnl / 100000).toFixed(1) + "L" : _pnlAbs >= 1000 ? (m.pnl / 1000).toFixed(0) + "K" : m.pnl.toFixed(0));
                  const isSelected = selectedMonth === m.month;
                  return React.createElement("div", { key: i, onClick: () => setSelectedMonth(isSelected ? null : m.month), title: m.month + ": " + INR(m.pnl) + " (" + m.count + " trades) \u2014 click to inspect", style: { background: bg, borderRadius: 4, minHeight: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", outline: isSelected ? "2px solid var(--accent)" : "none", outlineOffset: isSelected ? 1 : "none", transition: "outline .12s,transform .1s", transform: isSelected ? "scale(1.06)" : "scale(1)" } },
                    React.createElement("div", { style: { fontSize: 10, fontWeight: 700, fontFamily: "'Sora',sans-serif", color: m.pnl >= 0 ? "#16a34a" : "#ef4444" } }, _pnlStr),
                    React.createElement("div", { style: { fontSize: 8, color: "var(--text6)" } }, m.count)
                  );
                })
              ))
            )
          ),
          selectedMonth && tradesByMonth[selectedMonth] && React.createElement("div", { style: { marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } },
              React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text3)", display: "flex", alignItems: "center", gap: 6 } },
                React.createElement(Icon, { n: "list", size: 14, color: "var(--accent)" }),
                (() => { const d = new Date(selectedMonth + "-01T12:00:00"); return d.toLocaleString("en-IN", { month: "long", year: "numeric" }); })(),
                React.createElement("span", { style: { fontSize: 11, fontWeight: 500, color: "var(--text5)", marginLeft: 4 } }, tradesByMonth[selectedMonth].length + " trade" + (tradesByMonth[selectedMonth].length !== 1 ? "s" : ""))
              ),
              React.createElement("div", { onClick: () => setSelectedMonth(null), style: { fontSize: 10, color: "var(--text6)", cursor: "pointer", padding: "3px 8px", borderRadius: 6, background: "var(--bg4)" }, "aria-label": "Close" }, "\u2715")
            ),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
              React.createElement("div", { style: { display: "grid", gridTemplateColumns: "2fr 1.1fr 1.1fr 1fr 1fr 0.9fr 1fr", gap: 6, padding: "6px 10px", borderRadius: "8px 8px 0 0", background: "var(--bg4)", fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: .4 } },
                React.createElement("div", null, "Ticker / Company"),
                React.createElement("div", null, "Buy Date"),
                React.createElement("div", null, "Sell Date"),
                React.createElement("div", { style: { textAlign: "right" } }, "Buy Value"),
                React.createElement("div", { style: { textAlign: "right" } }, "Sell Value"),
                React.createElement("div", { style: { textAlign: "right" } }, "Return %"),
                React.createElement("div", { style: { textAlign: "right" } }, "P&L")
              ),
              tradesByMonth[selectedMonth].map((t, idx) => {
                const isGain = t.pnl >= 0;
                const _abs = Math.abs(t.pnl); const _pStr = (_abs >= 100000 ? (t.pnl / 100000).toFixed(2) + "L" : _abs >= 1000 ? (t.pnl / 1000).toFixed(1) + "K" : t.pnl.toFixed(0));
                return React.createElement("div", { key: t.id || idx, style: { display: "grid", gridTemplateColumns: "2fr 1.1fr 1.1fr 1fr 1fr 0.9fr 1fr", gap: 6, padding: "8px 10px", borderRadius: idx === tradesByMonth[selectedMonth].length - 1 ? "0 0 8px 8px" : 0, background: idx % 2 === 0 ? "var(--bg3)" : "var(--bg4)", fontSize: 11, alignItems: "center", borderTop: "1px solid var(--border)" } },
                  React.createElement("div", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                    React.createElement("div", { style: { fontWeight: 600, color: "var(--text3)", fontSize: 11 } }, t.ticker || "\u2014"),
                    React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, t.company || "")
                  ),
                  React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontFamily: "'DM Mono',monospace" } }, t.buyDate || "\u2014"),
                  React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontFamily: "'DM Mono',monospace" } }, t.sellDate || "\u2014"),
                  React.createElement("div", { style: { textAlign: "right", fontSize: 10, color: "var(--text4)", fontFamily: "'DM Mono',monospace" } }, INR(t.buyAmt)),
                  React.createElement("div", { style: { textAlign: "right", fontSize: 10, color: "var(--text4)", fontFamily: "'DM Mono',monospace" } }, INR(t.sellAmt)),
                  React.createElement("div", { style: { textAlign: "right", fontWeight: 600, fontFamily: "'Sora',sans-serif", fontSize: 10, color: isGain ? "#16a34a" : "#ef4444" } }, ret(t.returnPct)),
                  React.createElement("div", { style: { textAlign: "right", fontWeight: 700, fontFamily: "'Sora',sans-serif", fontSize: 11, color: isGain ? "#16a34a" : "#ef4444" } }, (isGain ? "+" : "-") + "\u20b9" + _pStr)
                );
              })
            ),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "2fr 1.1fr 1.1fr 1fr 1fr 0.9fr 1fr", gap: 6, marginTop: 8, padding: "8px 10px", background: "var(--bg4)", borderRadius: 8, fontSize: 10, alignItems: "center" } },
              React.createElement("span", { style: { color: "var(--text5)", fontWeight: 700, gridColumn: "1 / 4" } }, "Month Total"),
              React.createElement("span", { style: { textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text4)" } }, INR(tradesByMonth[selectedMonth].reduce((s, t) => s + t.buyAmt, 0))),
              React.createElement("span", { style: { textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text4)" } }, INR(tradesByMonth[selectedMonth].reduce((s, t) => s + t.sellAmt, 0))),
              React.createElement("span", { style: { textAlign: "right" } }, ""),
              React.createElement("span", { style: { textAlign: "right", fontWeight: 800, fontFamily: "'Sora',sans-serif", fontSize: 12, color: (tradesByMonth[selectedMonth].reduce((s, t) => s + t.pnl, 0) >= 0) ? "#16a34a" : "#ef4444" } },
                (tradesByMonth[selectedMonth].reduce((s, t) => s + t.pnl, 0) >= 0 ? "+" : "") + INR(tradesByMonth[selectedMonth].reduce((s, t) => s + t.pnl, 0))
              )
            )
          )
        )
    ),
    (bestWeek || worstWeek) && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, boxShadow: "var(--shadow-sm)" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text3)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 } },
        React.createElement(Icon, { n: "fire", size: 16, color: "var(--accent)" }), "Best & Worst Weeks"
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
        bestWeek && React.createElement("div", { style: { background: "rgba(22,163,74,.05)", border: "1px solid rgba(22,163,74,.2)", borderRadius: 10, padding: "14px" } },
          React.createElement("div", { style: { fontSize: 10, color: "#16a34a", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 } }, "\u25b2 Best Week"),
          React.createElement("div", { style: { fontSize: 18, fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#16a34a", marginBottom: 4 } }, (bestWeek.pnl >= 0 ? "+" : "") + INR(bestWeek.pnl)),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 8 } }, "Week of " + bestWeek.week + " \u00b7 " + bestWeek.count + " trade" + (bestWeek.count !== 1 ? "s" : "")),
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
            bestWeek.trades.slice(0, 3).map((t, i) => React.createElement("div", { key: i, style: { fontSize: 10, color: "var(--text4)", display: "flex", justifyContent: "space-between" } },
              React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 } }, t.company || t.ticker),
              React.createElement("span", { style: { fontWeight: 700, color: t.pnl >= 0 ? "#16a34a" : "#ef4444", fontFamily: "'Sora'" } }, (t.pnl >= 0 ? "+" : "") + INR(t.pnl))
            ))
          )
        ),
        worstWeek && React.createElement("div", { style: { background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 10, padding: "14px" } },
          React.createElement("div", { style: { fontSize: 10, color: "#ef4444", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 } }, "\u25bc Worst Week"),
          React.createElement("div", { style: { fontSize: 18, fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#ef4444", marginBottom: 4 } }, (worstWeek.pnl >= 0 ? "+" : "") + INR(worstWeek.pnl)),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 8 } }, "Week of " + worstWeek.week + " \u00b7 " + worstWeek.count + " trade" + (worstWeek.count !== 1 ? "s" : "")),
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
            worstWeek.trades.slice(0, 3).map((t, i) => React.createElement("div", { key: i, style: { fontSize: 10, color: "var(--text4)", display: "flex", justifyContent: "space-between" } },
              React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 } }, t.company || t.ticker),
              React.createElement("span", { style: { fontWeight: 700, color: t.pnl >= 0 ? "#16a34a" : "#ef4444", fontFamily: "'Sora'" } }, (t.pnl >= 0 ? "+" : "") + INR(t.pnl))
            ))
          )
        )
      )
    ),
    streaks.consecMonths.length > 0 && React.createElement("div", { style: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, boxShadow: "var(--shadow-sm)" } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text3)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 } },
        React.createElement(Icon, { n: "list", size: 16, color: "var(--accent)" }), "Monthly Streaks"
      ),
      React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
        streaks.consecMonths.map((s, i) => React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, background: s.type === "win" ? "rgba(22,163,74,.08)" : "rgba(239,68,68,.08)", border: "1px solid " + (s.type === "win" ? "rgba(22,163,74,.2)" : "rgba(239,68,68,.2)") } },
          React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: s.type === "win" ? "#16a34a" : "#ef4444", fontFamily: "'Sora'" } }, s.length),
          React.createElement("span", { style: { fontSize: 9, color: "var(--text5)" } }, s.type === "win" ? "\u2713" : "\u2717"),
          React.createElement("span", { style: { fontSize: 9, color: "var(--text6)" } }, s.start)
        ))
      )
    ),
    React.createElement("div", { style: { padding: "10px 14px", background: "var(--accentbg2)", border: "1px solid var(--border2)", borderRadius: 10, fontSize: 11, color: "var(--text5)", lineHeight: 1.6 } },
      React.createElement("strong", { style: { color: "var(--accent)" } }, "Methodology: "),
      "Monthly P&L heatmap aggregates closed (sold) trades by sell-date month. Active holdings are excluded \u2014 only realised P&L is shown. Colour intensity scales from light (small P&L) to deep (large P&L). Streaks count consecutive profitable or unprofitable months. Best/worst weeks aggregate by week starting Sunday. All amounts net of brokerage."
    )
  );
};

const TradeFrequencyAnalytics=({shares,soldShareSnapshots={}})=>{
  const ret=(v)=>(v>=0?"+":"")+v.toFixed(2)+"%";
  const trades=React.useMemo(function(){
    var list=[];
    (shares||[]).forEach(function(sh){
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      var buyAmt=sh.qty*sh.buyPrice;var sellAmt=sh.qty*sh.currentPrice;var brokerage=+sh.brokerage||0;
      list.push({id:sh.id,type:"active",company:sh.company,ticker:sh.ticker,buyDate:sh.buyDate,sellDate:TODAY(),buyAmt:buyAmt,sellAmt:sellAmt,pnl:sellAmt-buyAmt-brokerage,returnPct:buyAmt>0?((sellAmt-buyAmt-brokerage)/buyAmt*100):0});
    });
    Object.values(soldShareSnapshots||{}).forEach(function(fySnaps){
      (fySnaps||[]).forEach(function(sn){
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate)return;
        var buyAmt=sn.qty*sn.buyPrice;var sellAmt=sn.qty*sn.sellPrice;var brokerage=+sn.brokerage||0;
        list.push({id:sn.id,type:"sold",company:sn.company,ticker:sn.ticker,buyDate:sn.buyDate,sellDate:sn.savedAt,buyAmt:buyAmt,sellAmt:sellAmt,pnl:sellAmt-buyAmt-brokerage,returnPct:buyAmt>0?((sellAmt-buyAmt-brokerage)/buyAmt*100):0});
      });
    });
    return list.sort(function(a,b){return (a.buyDate||"").localeCompare(b.buyDate||"");});
  },[shares,soldShareSnapshots]);
  var monthlyStats=React.useMemo(function(){
    var map={};
    trades.forEach(function(t){var m=(t.buyDate||"").slice(0,7);if(!m)return;if(!map[m])map[m]={month:m,count:0,pnl:0,buyAmt:0};map[m].count++;map[m].pnl+=t.pnl;map[m].buyAmt+=t.buyAmt;});
    return Object.values(map).sort(function(a,b){return a.month.localeCompare(b.month);});
  },[trades]);
  var weeklyStats=React.useMemo(function(){
    var map={};
    trades.forEach(function(t){var d=new Date(t.buyDate+"T12:00:00");var ws=new Date(d);ws.setDate(d.getDate()-d.getDay());var wk=ws.toISOString().slice(0,10);if(!map[wk])map[wk]={week:wk,count:0,pnl:0};map[wk].count++;map[wk].pnl+=t.pnl;});
    return Object.values(map).sort(function(a,b){return a.week.localeCompare(b.week);});
  },[trades]);
  var activityCorrelation=React.useMemo(function(){
    if(monthlyStats.length<3)return null;
    var avgCount=monthlyStats.reduce(function(s,m){return s+m.count;},0)/monthlyStats.length;
    var low=monthlyStats.filter(function(m){return m.count<avgCount;});
    var high=monthlyStats.filter(function(m){return m.count>=avgCount;});
    var lowAvgPnl=low.length?low.reduce(function(s,m){return s+m.pnl;},0)/low.length:0;
    var highAvgPnl=high.length?high.reduce(function(s,m){return s+m.pnl;},0)/high.length:0;
    var lowAvgReturn=low.length?low.reduce(function(s,m){return s+(m.buyAmt>0?m.pnl/m.buyAmt*100:0);},0)/low.length:0;
    var highAvgReturn=high.length?high.reduce(function(s,m){return s+(m.buyAmt>0?m.pnl/m.buyAmt*100:0);},0)/high.length:0;
    return{avgCount:avgCount,lowCount:low.length,highCount:high.length,lowAvgPnl:lowAvgPnl,highAvgPnl:highAvgPnl,lowAvgReturn:lowAvgReturn,highAvgReturn:highAvgReturn};
  },[monthlyStats]);
  var cooldownAnalysis=React.useMemo(function(){
    if(trades.length<3)return null;
    var afterLoss24h={count:0,pnl:0,returns:[]};var after3dayBreak={count:0,pnl:0,returns:[]};
    for(var i=1;i<trades.length;i++){
      var prev=trades[i-1];var cur=trades[i];
      var prevDate=new Date((prev.sellDate||prev.buyDate)+"T12:00:00");var curDate=new Date(cur.buyDate+"T12:00:00");
      var gapDays=Math.floor((curDate-prevDate)/864e5);
      if(prev.pnl<0&&gapDays<=1){afterLoss24h.count++;afterLoss24h.pnl+=cur.pnl;afterLoss24h.returns.push(cur.returnPct);}
      if(gapDays>=3){after3dayBreak.count++;after3dayBreak.pnl+=cur.pnl;after3dayBreak.returns.push(cur.returnPct);}
    }
    var avgAfterLoss=afterLoss24h.returns.length?afterLoss24h.returns.reduce(function(s,r){return s+r;},0)/afterLoss24h.returns.length:0;
    var avgAfterBreak=after3dayBreak.returns.length?after3dayBreak.returns.reduce(function(s,r){return s+r;},0)/after3dayBreak.returns.length:0;
    return{afterLoss24h:afterLoss24h,after3dayBreak:after3dayBreak,avgAfterLoss:avgAfterLoss,avgAfterBreak:avgAfterBreak};
  },[trades]);
  var idleAnalysis=React.useMemo(function(){
    if(trades.length<2)return null;
    var sorted=trades.slice().sort(function(a,b){return (a.buyDate||"").localeCompare(b.buyDate||"");});
    var totalIdleDays=0;var gaps=0;
    for(var i=1;i<sorted.length;i++){
      var prevEnd=new Date((sorted[i-1].sellDate||sorted[i-1].buyDate)+"T12:00:00");var curStart=new Date(sorted[i].buyDate+"T12:00:00");
      var gap=Math.floor((curStart-prevEnd)/864e5);if(gap>0){totalIdleDays+=gap;gaps++;}
    }
    var firstDate=new Date(sorted[0].buyDate+"T12:00:00");var lastDate=new Date((sorted[sorted.length-1].sellDate||sorted[sorted.length-1].buyDate)+"T12:00:00");
    var totalDays=Math.max(1,Math.floor((lastDate-firstDate)/864e5));
    var idlePct=totalDays>0?(totalIdleDays/totalDays*100):0;
    var avgGap=gaps>0?(totalIdleDays/gaps):0;
    return{totalIdleDays:totalIdleDays,totalDays:totalDays,idlePct:idlePct,avgGap:avgGap,gaps:gaps};
  },[trades]);
  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"invest",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to see trade frequency analytics.")
  );
  var _overtradeColor = activityCorrelation && activityCorrelation.lowAvgPnl > activityCorrelation.highAvgPnl ? "#eab308" : "#374151";
  var _overtradeText = activityCorrelation && activityCorrelation.lowAvgPnl > activityCorrelation.highAvgPnl ? "\u26a0 Likely" : "\u2713 None";
  var _overtradeBg = activityCorrelation && activityCorrelation.lowAvgPnl > activityCorrelation.highAvgPnl ? "rgba(22,163,74,.07)" : "var(--bg4)";
  var _overtradeBorder = activityCorrelation && activityCorrelation.lowAvgPnl > activityCorrelation.highAvgPnl ? "rgba(22,163,74,.2)" : "var(--border)";
  var _lossColor = cooldownAnalysis.avgAfterLoss < 0 ? "rgba(239,68,68,.05)" : "rgba(22,163,74,.05)";
  var _lossBorder = cooldownAnalysis.avgAfterLoss < 0 ? "rgba(239,68,68,.2)" : "rgba(22,163,74,.2)";
  var _lossTextColor = cooldownAnalysis.avgAfterLoss < 0 ? "#ef4444" : "#16a34a";
  var _idleBg = idleAnalysis.idlePct > 60 ? "rgba(234,179,8,.07)" : "rgba(22,163,74,.07)";
  var _idleBorder = idleAnalysis.idlePct > 60 ? "rgba(234,179,8,.2)" : "rgba(22,163,74,.2)";
  var _idleColor = idleAnalysis.idlePct > 60 ? "#eab308" : "#16a34a";
  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12}},
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Total Trades"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},trades.length),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},weeklyStats.length>0?(trades.length/Math.max(weeklyStats.length,1)).toFixed(1)+" per week avg":"")
      ),
      React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Active Months"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},monthlyStats.length),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},monthlyStats.length>0?(trades.length/monthlyStats.length).toFixed(1)+" trades/month":"")
      ),
      idleAnalysis?React.createElement("div",{style:{background:_idleBg,border:"1px solid "+(_idleBorder),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Idle Capital Time"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:_idleColor}},""+idleAnalysis.idlePct.toFixed(0)+"%"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"avg "+idleAnalysis.avgGap.toFixed(0)+" days between trades")
      ):null,
      activityCorrelation?React.createElement("div",{style:{background:_overtradeBg,border:"1px solid "+(_overtradeBorder),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Overtrading Signal"),
        React.createElement("div",{style:{fontSize:14,fontFamily:"'Sora',sans-serif",fontWeight:800,color:_overtradeColor}},_overtradeText),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Less-active months perform better")
      ):null
    ),
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:8}},
        React.createElement(Icon,{n:"chart",size:16,color:"var(--accent)"}),"Trade Frequency by Month"
      ),
      monthlyStats.length<2
        ?React.createElement("div",{style:{textAlign:"center",padding:"40px",fontSize:12,color:"var(--text6)"}},"Need at least 2 months of data")
        :React.createElement("div",{style:{overflowX:"auto"}},React.createElement("svg",{width:Math.max(660,monthlyStats.length*40+40),height:180,style:{display:"block"}},
          monthlyStats.map(function(m,i){
            var barW=24;var maxCount=0;monthlyStats.forEach(function(x){if(x.count>maxCount)maxCount=x.count;});
            var x=20+i*(barW+12);var barH=(m.count/maxCount)*130;var y=180-30-barH;
            return React.createElement(React.Fragment,{key:m.month},
              React.createElement("rect",{x:x,y:y,width:barW,height:barH,rx:3,fill:m.pnl>=0?"rgba(22,163,74,.6)":"rgba(239,68,68,.6)"}),
              React.createElement("text",{x:x+barW/2,y:y-4,fill:"var(--text6)",fontSize:9,textAnchor:"middle",fontWeight:700},m.count),
              React.createElement("text",{x:x+barW/2,y:180-12,fill:"var(--text6)",fontSize:7,textAnchor:"middle",transform:"rotate(-45,"+x+","+(180-12)+")"},m.month.slice(2))
            );
          })
        ))
    ),
    activityCorrelation&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:8}},
        React.createElement(Icon,{n:"target",size:16,color:"var(--accent)"}),"Activity vs P&L"
      ),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}},
        React.createElement("div",{style:{background:"rgba(109,40,217,.05)",border:"1px solid rgba(109,40,217,.2)",borderRadius:10,padding:"14px"}},
          React.createElement("div",{style:{fontSize:10,color:"#6d28d9",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}},"Low-Activity Months"),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginBottom:4}},"< "+activityCorrelation.avgCount.toFixed(1)+" trades/mo \u00b7 "+activityCorrelation.lowCount+" months"),
          React.createElement("div",{style:{fontSize:16,fontFamily:"'Sora',sans-serif",fontWeight:800,color:activityCorrelation.lowAvgPnl>=0?"#16a34a":"#ef4444"}},(activityCorrelation.lowAvgPnl>=0?"+":"")+INR(activityCorrelation.lowAvgPnl)+"/mo"),
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginTop:2}},ret(activityCorrelation.lowAvgReturn)+" avg return")
        ),
        React.createElement("div",{style:{background:"rgba(234,179,8,.05)",border:"1px solid rgba(234,179,8,.2)",borderRadius:10,padding:"14px"}},
          React.createElement("div",{style:{fontSize:10,color:"#ca8a04",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}},"High-Activity Months"),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginBottom:4}},"\u2265 "+activityCorrelation.avgCount.toFixed(1)+" trades/mo \u00b7 "+activityCorrelation.highCount+" months"),
          React.createElement("div",{style:{fontSize:16,fontFamily:"'Sora',sans-serif",fontWeight:800,color:activityCorrelation.highAvgPnl>=0?"#16a34a":"#ef4444"}},(activityCorrelation.highAvgPnl>=0?"+":"")+INR(activityCorrelation.highAvgPnl)+"/mo"),
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginTop:2}},ret(activityCorrelation.highAvgReturn)+" avg return")
        )
      ),
      activityCorrelation.lowAvgPnl>activityCorrelation.highAvgPnl&&React.createElement("div",{style:{marginTop:12,padding:"10px 14px",background:"rgba(234,179,8,.08)",border:"1px solid rgba(234,179,8,.25)",borderRadius:8,fontSize:11,color:"#92400e",lineHeight:1.5}},"\u26a0 Less-active months outperform by ",INR(activityCorrelation.lowAvgPnl-activityCorrelation.highAvgPnl),"/mo. Consider reducing trade frequency.")
    ),
    cooldownAnalysis&&React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:8}},
        React.createElement(Icon,{n:"alarmclock",size:16,color:"var(--accent)"}),"Cooldown Analysis"
      ),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}},
        React.createElement("div",{style:{background:_lossColor,border:"1px solid "+(_lossBorder),borderRadius:10,padding:"14px"}},
          React.createElement("div",{style:{fontSize:10,color:_lossTextColor,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}},"Within 24h of a Loss"),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginBottom:4}},cooldownAnalysis.afterLoss24h.count+" trades"),
          cooldownAnalysis.afterLoss24h.count>0?React.createElement(React.Fragment,null,React.createElement("div",{style:{fontSize:16,fontFamily:"'Sora',sans-serif",fontWeight:800,color:cooldownAnalysis.avgAfterLoss>=0?"#16a34a":"#ef4444"}},ret(cooldownAnalysis.avgAfterLoss)),React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginTop:2}},"avg return")):React.createElement("div",{style:{fontSize:11,color:"var(--text6)"}},"No trades found")
        ),
        React.createElement("div",{style:{background:"rgba(22,163,74,.05)",border:"1px solid rgba(22,163,74,.2)",borderRadius:10,padding:"14px"}},
          React.createElement("div",{style:{fontSize:10,color:"#16a34a",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}},"After 3+ Day Break"),
          React.createElement("div",{style:{fontSize:11,color:"var(--text5)",marginBottom:4}},cooldownAnalysis.after3dayBreak.count+" trades"),
          cooldownAnalysis.after3dayBreak.count>0?React.createElement(React.Fragment,null,React.createElement("div",{style:{fontSize:16,fontFamily:"'Sora',sans-serif",fontWeight:800,color:cooldownAnalysis.avgAfterBreak>=0?"#16a34a":"#ef4444"}},ret(cooldownAnalysis.avgAfterBreak)),React.createElement("div",{style:{fontSize:10,color:"var(--text6)",marginTop:2}},"avg return")):React.createElement("div",{style:{fontSize:11,color:"var(--text6)"}},"No trades found")
        )
      ),
      cooldownAnalysis.afterLoss24h.count>0&&cooldownAnalysis.after3dayBreak.count>0&&cooldownAnalysis.avgAfterLoss<cooldownAnalysis.avgAfterBreak&&React.createElement("div",{style:{marginTop:12,padding:"10px 14px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",borderRadius:8,fontSize:11,color:"#991b1b",lineHeight:1.5}},"\u26a0 Revenge trading detected. Post-loss avg ",ret(cooldownAnalysis.avgAfterLoss)," vs ",ret(cooldownAnalysis.avgAfterBreak)," after breaks. Consider a 48h pause."),
      cooldownAnalysis.afterLoss24h.count>0&&cooldownAnalysis.after3dayBreak.count>0&&cooldownAnalysis.avgAfterLoss>=cooldownAnalysis.avgAfterBreak&&React.createElement("div",{style:{marginTop:12,padding:"10px 14px",background:"rgba(22,163,74,.08)",border:"1px solid rgba(22,163,74,.25)",borderRadius:8,fontSize:11,color:"#166534",lineHeight:1.5}},"\u2713 No revenge trading pattern detected.")
    ),
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Trade frequency counted per calendar month by buy-date. Activity vs P&L splits months by above/below-average frequency. Cooldown compares trades within 24h of a loss vs after 3+ day gaps. Idle capital % = days with no position / total span."
    )
  );
};


const SwingHoldOptimizer=({shares,soldShareSnapshots={}})=>{
  var ret=function(v){return (v>=0?"+":"")+v.toFixed(2)+"%";};
  var trades=React.useMemo(function(){
    var list=[];
    (shares||[]).forEach(function(sh){
      if(!sh.qty||!sh.buyPrice||!sh.currentPrice||!sh.buyDate)return;
      var buyDate=new Date(sh.buyDate+"T12:00:00");var sellDate=new Date(TODAY()+"T12:00:00");
      var holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
      var buyAmt=sh.qty*sh.buyPrice;var sellAmt=sh.qty*sh.currentPrice;var brokerage=+sh.brokerage||0;
      list.push({id:sh.id,type:"active",company:sh.company,ticker:sh.ticker,buyDate:sh.buyDate,sellDate:TODAY(),holdDays:holdDays,buyAmt:buyAmt,sellAmt:sellAmt,buyPrice:sh.buyPrice,sellPrice:sh.currentPrice,pnl:sellAmt-buyAmt-brokerage,returnPct:buyAmt>0?((sellAmt-buyAmt-brokerage)/buyAmt*100):0,buyDay:buyDate.getDay(),sellDay:sellDate.getDay()});
    });
    Object.values(soldShareSnapshots||{}).forEach(function(fySnaps){
      (fySnaps||[]).forEach(function(sn){
        if(!sn.qty||!sn.buyPrice||!sn.sellPrice||!sn.buyDate||!sn.savedAt)return;
        var buyDate=new Date(sn.buyDate+"T12:00:00");var sellDate=new Date(sn.savedAt+"T12:00:00");
        var holdDays=Math.max(1,Math.floor((sellDate-buyDate)/864e5));
        var buyAmt=sn.qty*sn.buyPrice;var sellAmt=sn.qty*sn.sellPrice;var brokerage=+sn.brokerage||0;
        list.push({id:sn.id,type:"sold",company:sn.company,ticker:sn.ticker,buyDate:sn.buyDate,sellDate:sn.savedAt,holdDays:holdDays,buyAmt:buyAmt,sellAmt:sellAmt,buyPrice:sn.buyPrice,sellPrice:sn.sellPrice,pnl:sellAmt-buyAmt-brokerage,returnPct:buyAmt>0?((sellAmt-buyAmt-brokerage)/buyAmt*100):0,buyDay:buyDate.getDay(),sellDay:sellDate.getDay()});
      });
    });
    return list.sort(function(a,b){return (a.buyDate||"").localeCompare(b.buyDate||"");});
  },[shares,soldShareSnapshots]);
  var holdBands=[
    {key:"1d",label:"1 day",min:1,max:2},{key:"2d",label:"2-3 days",min:2,max:4},{key:"1w",label:"4-7 days",min:4,max:8},
    {key:"2w",label:"1-2 weeks",min:7,max:15},{key:"3w",label:"2-3 weeks",min:14,max:22},{key:"1m",label:"3-4 weeks",min:21,max:32},
    {key:"6w",label:"1-1.5 months",min:30,max:46},{key:"2m",label:"1.5-2 months",min:45,max:65},{key:"3m",label:"2-3 months",min:60,max:95},
    {key:"6m",label:"3-6 months",min:90,max:185},{key:"1y",label:"6-12 months",min:180,max:370},{key:"long",label:"1 year+",min:365,max:Infinity}
  ];
  var bandStats=React.useMemo(function(){
    return holdBands.map(function(b){
      var bandTrades=trades.filter(function(t){return t.holdDays>=b.min&&t.holdDays<b.max;});
      if(!bandTrades.length)return Object.assign({},b,{count:0,avgReturn:0,winRate:0,expectancy:0,totalPnl:0});
      var avgReturn=bandTrades.reduce(function(s,t){return s+t.returnPct;},0)/bandTrades.length;
      var wins=bandTrades.filter(function(t){return t.pnl>0;}).length;var winRate=(wins/bandTrades.length*100);
      var avgWin=bandTrades.filter(function(t){return t.pnl>0;}).reduce(function(s,t){return s+t.returnPct;},0)/(wins||1);
      var losses=bandTrades.filter(function(t){return t.pnl<=0;}).length;
      var avgLoss=bandTrades.filter(function(t){return t.pnl<=0;}).reduce(function(s,t){return s+t.returnPct;},0)/(losses||1);
      var expectancy=(winRate/100)*avgWin+((100-winRate)/100)*avgLoss;
      var totalPnl=bandTrades.reduce(function(s,t){return s+t.pnl;},0);
      return Object.assign({},b,{count:bandTrades.length,avgReturn:avgReturn,winRate:winRate,expectancy:expectancy,totalPnl:totalPnl,avgWin:avgWin,avgLoss:avgLoss,wins:wins,losses:losses});
    }).filter(function(b){return b.count>0;});
  },[trades]);
  var bestExpectancy=bandStats.reduce(function(best,b){return !best||b.expectancy>best.expectancy?b:best;},null);
  var timeStopData=React.useMemo(function(){
    if(trades.length<5)return null;
    var maxDays=Math.max.apply(null,trades.map(function(t){return t.holdDays;}));
    if(maxDays<30)maxDays=30;
    var bucketSize=Math.max(3,Math.ceil(maxDays/20));
    var buckets=[];
    for(var d=0;d<maxDays+bucketSize;d+=bucketSize){
      var band=trades.filter(function(t){return t.holdDays>=d&&t.holdDays<d+bucketSize;});
      if(band.length<2)continue;
      var avgReturn=band.reduce(function(s,t){return s+t.returnPct;},0)/band.length;
      var winRate=band.filter(function(t){return t.pnl>0;}).length/band.length*100;
      buckets.push({dayStart:d,dayEnd:d+bucketSize,count:band.length,avgReturn:avgReturn,winRate:winRate});
    }
    if(buckets.length<3)return null;
    var negativeIdx=-1;
    for(var bi=0;bi<buckets.length;bi++){if(buckets[bi].avgReturn<0){negativeIdx=bi;break;}}
    var n=buckets.length;var xMean=0;var yMean=0;
    for(var bi2=0;bi2<n;bi2++){xMean+=(buckets[bi2].dayStart+buckets[bi2].dayEnd)/2;yMean+=buckets[bi2].avgReturn;}
    xMean/=n;yMean/=n;
    var num=0;var den=0;
    for(var bi3=0;bi3<n;bi3++){var x=(buckets[bi3].dayStart+buckets[bi3].dayEnd)/2;num+=(x-xMean)*(buckets[bi3].avgReturn-yMean);den+=(x-xMean)*(x-xMean);}
    var slope=den>0?num/den:0;
    return{buckets:buckets,negativeIdx:negativeIdx,slope:slope,decayRate:slope<0?"negative":"positive"};
  },[trades]);
  var weekendData=React.useMemo(function(){
    if(trades.length<3)return null;
    var heldOverWeekend={count:0,pnl:0,returns:[]};var noWeekend={count:0,pnl:0,returns:[]};var closedFriday={count:0,pnl:0,returns:[]};
    trades.forEach(function(t){
      var buyD=new Date(t.buyDate+"T12:00:00");var sellD=new Date(t.sellDate+"T12:00:00");
      var hasWeekend=false;for(var d=new Date(buyD);d<=sellD;d.setDate(d.getDate()+1)){if(d.getDay()===6){hasWeekend=true;break;}}
      if(hasWeekend){heldOverWeekend.count++;heldOverWeekend.pnl+=t.pnl;heldOverWeekend.returns.push(t.returnPct);}
      else{noWeekend.count++;noWeekend.pnl+=t.pnl;noWeekend.returns.push(t.returnPct);}
      if(t.sellDay===5){closedFriday.count++;closedFriday.pnl+=t.pnl;closedFriday.returns.push(t.returnPct);}
    });
    var avgWeekend=heldOverWeekend.returns.length?heldOverWeekend.returns.reduce(function(s,r){return s+r;},0)/heldOverWeekend.returns.length:0;
    var avgNoWeekend=noWeekend.returns.length?noWeekend.returns.reduce(function(s,r){return s+r;},0)/noWeekend.returns.length:0;
    var avgFriday=closedFriday.returns.length?closedFriday.returns.reduce(function(s,r){return s+r;},0)/closedFriday.returns.length:0;
    return{heldOverWeekend:heldOverWeekend,closedFriday:closedFriday,noWeekend:noWeekend,avgWeekend:avgWeekend,avgNoWeekend:avgNoWeekend,avgFriday:avgFriday};
  },[trades]);
  var daysToTarget=React.useMemo(function(){
    var winners=trades.filter(function(t){return t.pnl>0;});if(!winners.length)return null;
    var days=winners.map(function(t){return t.holdDays;}).sort(function(a,b){return a-b;});
    var median=days.length%2===0?(days[days.length/2-1]+days[days.length/2])/2:days[Math.floor(days.length/2)];
    var p25=days[Math.floor(days.length*0.25)]||median;var p75=days[Math.floor(days.length*0.75)]||median;
    var avg=days.reduce(function(s,d){return s+d;},0)/days.length;
    return{median:median,p25:p25,p75:p75,avg:avg,min:days[0],max:days[days.length-1],count:winners.length};
  },[trades]);
  if(!trades.length)return React.createElement("div",{style:{textAlign:"center",padding:"48px 20px"}},
    React.createElement("div",{style:{fontSize:40,marginBottom:12,color:"var(--text6)"}},React.createElement(Icon,{n:"invest",size:40})),
    React.createElement("div",{style:{fontSize:15,fontWeight:600,color:"var(--text3)",marginBottom:4}},"No Trade Data"),
    React.createElement("div",{style:{fontSize:13,color:"var(--text6)"}},"Add shares or save snapshots to see holding period optimisation.")
  );
  var maxExpectancy=Math.max.apply(null,bandStats.map(function(b){return Math.abs(b.expectancy);}).concat([1]));
  var _sweetSpotColor = bestExpectancy ? "#16a34a" : "var(--text)";
  var _tsColor = timeStopData && timeStopData.negativeIdx >= 0 ? "#ef4444" : "#16a34a";
  var _tsBg = timeStopData && timeStopData.negativeIdx >= 0 ? "rgba(239,68,68,.07)" : "rgba(22,163,74,.07)";
  var _tsBorder = timeStopData && timeStopData.negativeIdx >= 0 ? "rgba(239,68,68,.2)" : "rgba(22,163,74,.2)";
  var _tsText = timeStopData && timeStopData.negativeIdx >= 0 ? "Day " + timeStopData.buckets[timeStopData.negativeIdx].dayStart + "+" : "Never goes -ve";
  var _tsSubText = timeStopData && timeStopData.negativeIdx >= 0 ? "Returns turn negative here" : "Avg return stays positive";
  var _weColor = weekendData && weekendData.avgWeekend < weekendData.avgNoWeekend ? "#eab308" : "#374151";
  var _weText = weekendData && weekendData.avgWeekend < weekendData.avgNoWeekend ? "\u26a0 Detected" : "\u2713 Low";
  var _weBg = weekendData && weekendData.avgWeekend < weekendData.avgNoWeekend ? "rgba(234,179,8,.07)" : "var(--bg4)";
  var _weBorder = weekendData && weekendData.avgWeekend < weekendData.avgNoWeekend ? "rgba(234,179,8,.2)" : "var(--border)";
  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:20}},
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:12}},
      bestExpectancy?React.createElement("div",{style:{background:"rgba(22,163,74,.07)",border:"1px solid rgba(22,163,74,.2)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Sweet Spot"),
        React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#16a34a"}},bestExpectancy.label),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Expectancy: "+ret(bestExpectancy.expectancy)+" per trade")
      ):null,
      daysToTarget?React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Median Days to Win"),
        React.createElement("div",{style:{fontSize:20,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},daysToTarget.median+" days"),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"P25: "+daysToTarget.p25+" \u00b7 P75: "+daysToTarget.p75)
      ):null,
      timeStopData?React.createElement("div",{style:{background:_tsBg,border:"1px solid "+(_tsBorder),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Time-Stop Zone"),
        React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:_tsColor}},_tsText),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},_tsSubText)
      ):null,
      weekendData?React.createElement("div",{style:{background:_weBg,border:"1px solid "+(_weBorder),borderRadius:12,padding:"14px 16px"}},
        React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Weekend Risk"),
        React.createElement("div",{style:{fontSize:14,fontFamily:"'Sora',sans-serif",fontWeight:800,color:_weColor}},_weText),
        React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},"Weekend: "+ret(weekendData.avgWeekend)+" vs no-weekend: "+ret(weekendData.avgNoWeekend))
      ):null
    ),
    React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:8}},
        React.createElement(Icon,{n:"target",size:16,color:"var(--accent)"}),"Expectancy by Holding Period"
      ),
      bandStats.length<2
        ?React.createElement("div",{style:{textAlign:"center",padding:"40px",fontSize:12,color:"var(--text6)"}},"Need at least 2 different holding periods")
        :React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:6}},
          bandStats.map(function(b,i){
            var barW=Math.max(4,Math.abs(b.expectancy)/maxExpectancy*100);
            var isBest=bestExpectancy&&b.key===bestExpectancy.key;
            return React.createElement("div",{key:b.key,style:{display:"grid",gridTemplateColumns:"110px 1fr 80px 70px 65px",gap:8,alignItems:"center",padding:"8px 10px",borderRadius:8,background:isBest?"rgba(22,163,74,.08)":"transparent",border:isBest?"1px solid rgba(22,163,74,.2)":"1px solid transparent"}},
              React.createElement("div",{style:{fontSize:11,fontWeight:isBest?700:500,color:isBest?"#16a34a":"var(--text4)"}},b.label+(isBest?" \u2605":"")),
              React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6}},
                React.createElement("div",{style:{flex:1,height:18,background:"var(--bg5)",borderRadius:4,overflow:"hidden",position:"relative"}},
                  React.createElement("div",{style:{position:"absolute",left:b.expectancy>=0?"50%":"auto",right:b.expectancy<0?"50%":"auto",top:0,height:"100%",width:barW+"%",background:b.expectancy>=0?"rgba(22,163,74,.4)":"rgba(239,68,68,.4)",borderRadius:4}})
                )
              ),
              React.createElement("div",{style:{fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",color:b.expectancy>=0?"#16a34a":"#ef4444",textAlign:"right"}},ret(b.expectancy)),
              React.createElement("div",{style:{fontSize:10,color:"var(--text5)",textAlign:"right"}},b.count+" trades"),
              React.createElement("div",{style:{fontSize:10,color:b.winRate>=50?"#16a34a":"#ef4444",textAlign:"right",fontWeight:600}},b.winRate.toFixed(0)+"% WR")
            );
          }),
          bestExpectancy?React.createElement("div",{style:{marginTop:14,padding:"10px 14px",background:"rgba(22,163,74,.08)",border:"1px solid rgba(22,163,74,.25)",borderRadius:8,fontSize:11,color:"#166534",lineHeight:1.5}},"Your sweet spot is ",React.createElement("strong",null,bestExpectancy.label)," with ",ret(bestExpectancy.expectancy)," expectancy and ",bestExpectancy.winRate.toFixed(0)+"% win rate across ",bestExpectancy.count," trades."):null
        )
    ),
    timeStopData?React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:8}},
        React.createElement(Icon,{n:"clock",size:16,color:"var(--accent)"}),"Return Decay Over Time"
      ),
      React.createElement("div",{style:{overflowX:"auto"}},
        React.createElement("svg",{width:Math.max(500,timeStopData.buckets.length*50+60),height:200,style:{display:"block"}},
          React.createElement("line",{x1:40,y1:100,x2:timeStopData.buckets.length*50+40,y2:100,stroke:"var(--border)",strokeWidth:1,strokeDasharray:"4,4"}),
          timeStopData.buckets.map(function(b,i){
            var x=40+i*50;var barH=Math.abs(b.avgReturn)*3;var y=b.avgReturn>=0?100-barH:100;
            return React.createElement(React.Fragment,{key:i},
              React.createElement("rect",{x:x+5,y:y,width:30,height:Math.max(barH,2),rx:3,fill:b.avgReturn>=0?"rgba(22,163,74,.5)":"rgba(239,68,68,.5)"}),
              React.createElement("text",{x:x+20,y:b.avgReturn>=0?y-5:y+barH+12,fill:b.avgReturn>=0?"#16a34a":"#ef4444",fontSize:9,fontWeight:700,textAnchor:"middle",fontFamily:"'Sora'"},ret(b.avgReturn)),
              React.createElement("text",{x:x+20,y:190,fill:"var(--text6)",fontSize:8,textAnchor:"middle"},"D"+b.dayStart+"-"+b.dayEnd)
            );
          }).concat(timeStopData.negativeIdx>=0?[React.createElement("rect",{key:"dd",x:40+timeStopData.negativeIdx*50,y:10,width:30,height:180,fill:"rgba(239,68,68,.05)",stroke:"rgba(239,68,68,.2)",strokeDasharray:"3,3"})]:[])
        )
      ),
      timeStopData.negativeIdx>=0?React.createElement("div",{style:{marginTop:10,padding:"10px 14px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",borderRadius:8,fontSize:11,color:"#991b1b",lineHeight:1.5}},"\u26a0 Returns turn negative after day ",timeStopData.buckets[timeStopData.negativeIdx].dayStart,". Set a time-stop at ",React.createElement("strong",null,timeStopData.buckets[timeStopData.negativeIdx].dayStart+" days"),". Decay: ",ret(timeStopData.slope)," per day."):null
    ):null,
    weekendData?React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:8}},
        React.createElement(Icon,{n:"warning",size:16,color:"var(--accent)"}),"Weekend & Overnight Risk"
      ),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}},
        React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}},"Held Over Weekend"),
          React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:weekendData.avgWeekend>=0?"#16a34a":"#ef4444"}},ret(weekendData.avgWeekend)),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},weekendData.heldOverWeekend.count+" trades")
        ),
        React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}},"No Weekend Hold"),
          React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:weekendData.avgNoWeekend>=0?"#16a34a":"#ef4444"}},ret(weekendData.avgNoWeekend)),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},weekendData.noWeekend.count+" trades")
        ),
        React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:10,padding:"14px",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:10,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}},"Closed on Friday"),
          React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:weekendData.avgFriday>=0?"#16a34a":"#ef4444"}},ret(weekendData.avgFriday)),
          React.createElement("div",{style:{fontSize:10,color:"var(--text5)",marginTop:2}},weekendData.closedFriday.count+" trades")
        )
      ),
      weekendData.avgWeekend < weekendData.avgNoWeekend - 0.5?React.createElement("div",{style:{marginTop:12,padding:"10px 14px",background:"rgba(234,179,8,.08)",border:"1px solid rgba(234,179,8,.25)",borderRadius:8,fontSize:11,color:"#92400e",lineHeight:1.5}},"Positions held over weekends underperform by ",ret(weekendData.avgNoWeekend-weekendData.avgWeekend),". Consider closing on Friday."):null
    ):null,
    daysToTarget?React.createElement("div",{style:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden",padding:20}},
      React.createElement("div",{style:{fontSize:13,fontWeight:700,color:"var(--text3)",marginBottom:14,display:"flex",alignItems:"center",gap:8}},
        React.createElement(Icon,{n:"clock",size:16,color:"var(--accent)"}),"Days to Target (Winning Trades)"
      ),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:12}},
        React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:10,padding:"12px",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Fastest"),
          React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#16a34a"}},daysToTarget.min+"d")
        ),
        React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:10,padding:"12px",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"P25"),
          React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},daysToTarget.p25+"d")
        ),
        React.createElement("div",{style:{background:"rgba(109,40,217,.07)",border:"1px solid rgba(109,40,217,.2)",borderRadius:10,padding:"12px",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:9,color:"#6d28d9",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Median \u2605"),
          React.createElement("div",{style:{fontSize:22,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#6d28d9"}},daysToTarget.median+"d")
        ),
        React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:10,padding:"12px",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"P75"),
          React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"var(--text)"}},daysToTarget.p75+"d")
        ),
        React.createElement("div",{style:{background:"var(--bg4)",border:"1px solid var(--border)",borderRadius:10,padding:"12px",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:9,color:"var(--text6)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}},"Slowest"),
          React.createElement("div",{style:{fontSize:18,fontFamily:"'Sora',sans-serif",fontWeight:800,color:"#ef4444"}},daysToTarget.max+"d")
        )
      ),
      React.createElement("div",{style:{marginTop:12,padding:"10px 14px",background:"rgba(109,40,217,.06)",border:"1px solid rgba(109,40,217,.18)",borderRadius:8,fontSize:11,color:"var(--text5)",lineHeight:1.5}},"Winning trades reach target in median ",React.createElement("strong",null,daysToTarget.median+" days"),". 50% complete between ",daysToTarget.p25," and ",daysToTarget.p75," days.")
    ):null,
    React.createElement("div",{style:{padding:"10px 14px",background:"var(--accentbg2)",border:"1px solid var(--border2)",borderRadius:10,fontSize:11,color:"var(--text5)",lineHeight:1.6}},
      React.createElement("strong",{style:{color:"var(--accent)"}},"Methodology: "),
      "Expectancy = (Win% \u00d7 Avg Win) + (Loss% \u00d7 Avg Loss). Sweet spot = highest expectancy band. Time-stop = day returns turn negative. Weekend risk compares held-over-weekend vs not. Days-to-target uses win-trade percentiles."
    )
  );
};



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ReportsPage â€” 12-tab wrapper
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const ReportsPage = ({ shares, soldShareSnapshots }) => {
  const [activeTab, setActiveTab] = React.useState("profitability");

  const tabs = [
    { key: "profitability", label: "Profitability", icon: "bar-chart" },
    { key: "timeholding", label: "Time & Holding", icon: "clock" },
    { key: "winloss", label: "Win/Loss", icon: "target" },
    { key: "capitaleff", label: "Capital Efficiency", icon: "invest" },
    { key: "behavioural", label: "Behavioural", icon: "lightbulb" },
    { key: "timing", label: "Trade Timing", icon: "calendar" },
    { key: "risk", label: "Risk Metrics", icon: "shield" },
    { key: "pattern", label: "Pattern Mining", icon: "bolt" },
    { key: "drawdown", label: "Drawdown", icon: "trenddown" },
    { key: "multitime", label: "Multi-Timeframe", icon: "chart" },
    { key: "frequency", label: "Trade Frequency", icon: "invest" },
    { key: "swing", label: "Swing/Hold", icon: "target" },
  ];

  const props = { shares, soldShareSnapshots };

  const renderTab = () => {
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
      default: return React.createElement(ProfitabilityMetrics, props);
    }
  };

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
    // Tab bar
    React.createElement("div", {
      style: {
        display: "flex", gap: 4, overflowX: "auto", padding: "4px 0",
        borderBottom: "1px solid var(--border)", background: "var(--bg4)",
        borderRadius: 12, padding: "6px 8px",
      }
    },
      tabs.map(tab =>
        React.createElement("button", {
          key: tab.key,
          onClick: () => setActiveTab(tab.key),
          style: {
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            background: activeTab === tab.key ? "var(--accent)" : "transparent",
            color: activeTab === tab.key ? "#fff" : "var(--text5)",
            fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
            transition: "all .15s",
          }
        },
          React.createElement(Icon, { n: tab.icon, size: 14 }),
          tab.label
        )
      )
    ),
    // Tab content
    React.createElement("div", { style: { minHeight: 400 } }, renderTab())
  );
};