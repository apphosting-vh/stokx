window.SectorRRG=(function(){
var SEC=[
{key:"BANK",name:"Bank",yahoo:"^NSEBANK",color:"#3b82f6"},
{key:"IT",name:"IT",yahoo:"^CNXIT",color:"#a855f7"},
{key:"AUTO",name:"Auto",yahoo:"^CNXAUTO",color:"#f97316"},
{key:"PHARMA",name:"Pharma",yahoo:"^CNXPHARMA",color:"#22c55e"},
{key:"FMCG",name:"FMCG",yahoo:"^CNXFMCG",color:"#eab308"},
{key:"METAL",name:"Metal",yahoo:"^CNXMETAL",color:"#64748b"},
{key:"REALTY",name:"Realty",yahoo:"^CNXREALTY",color:"#ec4899"},
{key:"ENERGY",name:"Energy",yahoo:"^CNXENERGY",color:"#ef4444"},
{key:"PSUBANK",name:"PSU Bank",yahoo:"^CNXPSUBANK",color:"#0ea5e9"},
{key:"MEDIA",name:"Media",yahoo:"^CNXMEDIA",color:"#84cc16"},
{key:"FINSRV",name:"Fin Svcs",yahoo:"^CNXFIN",color:"#06b6d4"},
{key:"CAPGOODS",name:"Capital Goods",yahoo:null,basket:true,color:"#14b8a6"},
{key:"DEFENCE",name:"Defence",yahoo:null,basket:true,color:"#6366f1"},
{key:"INFRA",name:"Infra & Logistics",yahoo:null,basket:true,color:"#f59e0b"},
{key:"CEMENT",name:"Cement",yahoo:null,basket:true,color:"#a8a29e"},
{key:"CHEM",name:"Chemicals & Agri",yahoo:null,basket:true,color:"#b45309"},
{key:"TELECOM",name:"Telecom",yahoo:null,basket:true,color:"#d946ef"},
{key:"CONSUMER",name:"Consumer & Retail",yahoo:null,basket:true,color:"#fb7185"},
{key:"HEALTHSVC",name:"Healthcare Svcs",yahoo:null,basket:true,color:"#10b981"}
];
var BENCH="^NSEI",W=14,TAIL=5,ZS=10,TTL=3600000;
var MAP={HDFCBANK:"BANK",ICICIBANK:"BANK",KOTAKBANK:"BANK",AXISBANK:"BANK",INDUSINDBK:"BANK",FEDERALBNK:"BANK",IDFCFIRSTB:"BANK",AUBANK:"BANK",YESBANK:"BANK",SBIN:"PSUBANK",BANKBARODA:"PSUBANK",PNB:"PSUBANK",CANBK:"PSUBANK",UNIONBANK:"PSUBANK",INDIANB:"PSUBANK",BANKINDIA:"PSUBANK",TCS:"IT",INFY:"IT",WIPRO:"IT",HCLTECH:"IT",TECHM:"IT",LTM:"IT",PERSISTENT:"IT",COFORGE:"IT",MPHASIS:"IT",OFSS:"IT",KPITTECH:"IT",TATAELXSI:"IT",MARUTI:"AUTO","M&M":"AUTO",M_M:"AUTO",EICHERMOT:"AUTO","BAJAJ-AUTO":"AUTO",BAJAJAUTO:"AUTO",HEROMOTOCO:"AUTO",TVSMOTOR:"AUTO",MOTHERSON:"AUTO",BOSCHLTD:"AUTO",ASHOKLEY:"AUTO",MRF:"AUTO",EXIDEIND:"AUTO",HYUNDAI:"AUTO",TMCV:"AUTO",TMPV:"AUTO",TIINDIA:"AUTO",BHARATFORG:"AUTO",SUNPHARMA:"PHARMA",DRREDDY:"PHARMA",CIPLA:"PHARMA",DIVISLAB:"PHARMA",LUPIN:"PHARMA",AUROPHARMA:"PHARMA",ALKEM:"PHARMA",TORNTPHARM:"PHARMA",ZYDUSLIFE:"PHARMA",BIOCON:"PHARMA",LAURUSLABS:"PHARMA",GLENMARK:"PHARMA",MANKIND:"PHARMA",APOLLOHOSP:"PHARMA",FORTIS:"PHARMA",MAXHEALTH:"PHARMA",HINDUNILVR:"FMCG",ITC:"FMCG",NESTLEIND:"FMCG",BRITANNIA:"FMCG",DABUR:"FMCG",MARICO:"FMCG",GODREJCP:"FMCG",COLPAL:"FMCG",TATACONSUM:"FMCG",UBL:"FMCG",VBL:"FMCG",PATANJALI:"FMCG",RADICO:"FMCG",UNITDSPR:"FMCG",GODFRYPHLP:"FMCG",TATASTEEL:"METAL",JSWSTEEL:"METAL",HINDALCO:"METAL",VEDL:"METAL",JINDALSTEL:"METAL",SAIL:"METAL",NMDC:"METAL",NATIONALUM:"METAL",HINDZINC:"METAL",APLAPOLLO:"METAL",DLF:"REALTY",GODREJPROP:"REALTY",OBEROIRLTY:"REALTY",LODHA:"REALTY",PRESTIGE:"REALTY",PHOENIXLTD:"REALTY",RELIANCE:"ENERGY",ONGC:"ENERGY",NTPC:"ENERGY",POWERGRID:"ENERGY",BPCL:"ENERGY",IOC:"ENERGY",HINDPETRO:"ENERGY",GAIL:"ENERGY",OIL:"ENERGY",ATGL:"ENERGY",ADANIGREEN:"ENERGY",ADANIPOWER:"ENERGY",ADANIENSOL:"ENERGY",TATAPOWER:"ENERGY",JSWENERGY:"ENERGY",COALINDIA:"ENERGY",NHPC:"ENERGY",POWERINDIA:"ENERGY",SUZLON:"ENERGY",WAAREEENER:"ENERGY",PREMIERENE:"ENERGY",ZEEL:"MEDIA",SUNTV:"MEDIA",PVRINOX:"MEDIA",NAZARA:"MEDIA",BAJFINANCE:"FINSRV",BAJAJFINSV:"FINSRV",BAJAJHLDNG:"FINSRV",HDFCLIFE:"FINSRV",SBILIFE:"FINSRV",ICICIGI:"FINSRV",ICICIPRULI:"FINSRV",MUTHOOTFIN:"FINSRV",CHOLAFIN:"FINSRV",SBICARD:"FINSRV",SHRIRAMFIN:"FINSRV",JIOFIN:"FINSRV",LICHSGFIN:"FINSRV",HDFCAMC:"FINSRV",ICICIAMC:"FINSRV",TATACAP:"FINSRV",LTF:"FINSRV",PFC:"FINSRV",RECLTD:"FINSRV","360ONE":"FINSRV",ABCAPITAL:"FINSRV",MFSL:"FINSRV",MOTILALOFS:"FINSRV",MCX:"FINSRV",HUDCO:"FINSRV",IRFC:"FINSRV",IREDA:"FINSRV","M&MFIN":"FINSRV",M_MFIN:"FINSRV",BSE:"FINSRV",GROWW:"FINSRV",PAYTM:"FINSRV",TATACAPITAL:"FINSRV"};
/* ---- Chart-only sector buckets (added) ------------------------------------
   MAP stays exactly as it was and still drives getSectorQuadrantForSymbol(), so
   the RS-gate override behaves as before. MAP2 = MAP + the new buckets and is
   exposed as STOCK_SECTOR_ALL for the sector charts. Hospitals are moved from
   PHARMA to HEALTHSVC and TATAINVEST/POLICYBZR join FINSRV in MAP2 only.
   Set GATE_INCLUDES_BASKETS=true to let the new buckets (and these moves) feed
   the RS gate too. */
var NEWMAP={"ABB":"CAPGOODS","BHEL":"CAPGOODS","CGPOWER":"CAPGOODS","CUMMINSIND":"CAPGOODS","GVT&D":"CAPGOODS","HAVELLS":"CAPGOODS","KEI":"CAPGOODS","POLYCAB":"CAPGOODS","SIEMENS":"CAPGOODS","ENRIN":"CAPGOODS","VOLTAS":"CAPGOODS","BLUESTARCO":"CAPGOODS","ASTRAL":"CAPGOODS","SUPREMEIND":"CAPGOODS","BDL":"DEFENCE","BEL":"DEFENCE","HAL":"DEFENCE","MAZDOCK":"DEFENCE","COCHINSHIP":"DEFENCE","SOLARINDS":"DEFENCE","LT":"INFRA","ADANIENT":"INFRA","ADANIPORTS":"INFRA","CONCOR":"INFRA","GMRAIRPORT":"INFRA","INDIGO":"INFRA","IRCTC":"INFRA","RVNL":"INFRA","AMBUJACEM":"CEMENT","GRASIM":"CEMENT","SHREECEM":"CEMENT","ULTRACEMCO":"CEMENT","COROMANDEL":"CHEM","PIIND":"CHEM","SRF":"CHEM","UPL":"CHEM","PIDILITIND":"CHEM","BHARTIARTL":"TELECOM","INDUSTOWER":"TELECOM","TATACOMM":"TELECOM","IDEA":"TELECOM","ASIANPAINT":"CONSUMER","TITAN":"CONSUMER","TRENT":"CONSUMER","DMART":"CONSUMER","VMM":"CONSUMER","PAGEIND":"CONSUMER","KALYANKJIL":"CONSUMER","JUBLFOOD":"CONSUMER","INDHOTEL":"CONSUMER","ETERNAL":"CONSUMER","SWIGGY":"CONSUMER","NYKAA":"CONSUMER","LENSKART":"CONSUMER","NAUKRI":"CONSUMER","DIXON":"CONSUMER","LGEINDIA":"CONSUMER","APOLLOHOSP":"HEALTHSVC","FORTIS":"HEALTHSVC","MAXHEALTH":"HEALTHSVC","TATAINVEST":"FINSRV","POLICYBZR":"FINSRV"};
var MAP2={};(function(){var k;for(k in MAP)MAP2[k]=MAP[k];for(k in NEWMAP)MAP2[k]=NEWMAP[k];})();
var GATE_INCLUDES_BASKETS=false;
var GATE_MAP=GATE_INCLUDES_BASKETS?MAP2:MAP;
function norm(s){if(!s)return"";return String(s).trim().toUpperCase().replace(/\.NS$/,"").replace(/\.BO$/,"").replace(/\s+/g,"");}
function zs(a,w){var o=[];for(var i=0;i<a.length;i++){if(i<w-1){o.push(null);continue;}var s=0,v=true;for(var j=i-w+1;j<=i;j++){if(a[j]==null||isNaN(a[j])){v=false;break;}s+=a[j];}if(!v){o.push(null);continue;}var m=s/w,q=0;for(var k=i-w+1;k<=i;k++){var d=a[k]-m;q+=d*d;}var sd=Math.sqrt(q/w);o.push(sd<1e-10?0:(a[i]-m)/sd);}return o;}
function align(a,b){var bm={};for(var i=0;i<b.length;i++){if(b[i]&&b[i].t!=null)bm[String(b[i].t).slice(0,10)]=b[i];}var o=[];for(var j=0;j<a.length;j++){if(!a[j]||a[j].t==null)continue;var d=String(a[j].t).slice(0,10);var m=bm[d];if(m&&a[j].c>0&&m.c>0)o.push({d:d,s:a[j].c,b:m.c});}return o;}
function quad(r,m){if(r==null||m==null)return null;var hi=r>=100,mo=m>=100;if(hi&&mo)return"Leading";if(hi&&!mo)return"Weakening";if(!hi&&!mo)return"Lagging";return"Improving";}
function compute(sc,bc,meta){var al=align(sc,bc);if(al.length<W*2+TAIL+5)return null;var rl=al.map(function(p){return p.s/p.b;});var rz=zs(rl,W);var rr=rz.map(function(z){return z==null?null:100+z*ZS;});var mz=zs(rr,W);var rm=mz.map(function(z){return z==null?null:100+z*ZS;});var pts=[];for(var i=0;i<al.length;i++){if(rr[i]!=null&&rm[i]!=null)pts.push({d:al[i].d,rsRatio:Math.round(rr[i]*100)/100,rsMomentum:Math.round(rm[i]*100)/100,quadrant:quad(rr[i],rm[i])});}if(!pts.length)return null;var tl=pts.slice(-TAIL);var cur=tl[tl.length-1];var pv=tl.length>=2?tl[tl.length-2]:null;var vel=pv?{rsRatio:Math.round((cur.rsRatio-pv.rsRatio)*100)/100,rsMomentum:Math.round((cur.rsMomentum-pv.rsMomentum)*100)/100}:{rsRatio:0,rsMomentum:0};var dq=1;for(var d2=pts.length-2;d2>=0;d2--){if(pts[d2].quadrant===cur.quadrant)dq++;else break;}return{key:meta.key,name:meta.name,color:meta.color,basket:!!meta.basket,current:cur,tail:tl,quadrant:cur.quadrant,velocity:vel,daysInQuadrant:dq,historyDays:pts.length};}

/* ---- Equal-weighted sector baskets ----------------------------------------
   For sectors with no index ticker. Each day the basket moves by the average of
   its members' returns (daily rebalanced), chained from 100. OHLC come from the
   members' own open/high/low/close relative to their previous close, so ATR/ADX
   behave like an index. "v" is total traded VALUE (price x shares) so one
   low-priced stock cannot dominate volume. Inputs may use .t or .d for the date. */
var BASKET_MIN=3,_bk={},_bkp={};
var _sec20Map={};
function bkDate(c){var t=c&&(c.d!=null?c.d:c.t);return t==null?"":String(t).slice(0,10);}
function buildBasket(list){
  var per=[],i,j,k;
  for(i=0;i<list.length;i++){
    var raw=list[i]||[],tmp=[];
    for(j=0;j<raw.length;j++){
      var c=raw[j];if(!c)continue;
      var cl=Number(c.c),d=bkDate(c);
      if(!(cl>0)||!/^\d{4}-\d{2}-\d{2}$/.test(d))continue;
      var o=Number(c.o),h=Number(c.h),l=Number(c.l),v=Number(c.v);
      tmp.push({d:d,c:cl,o:o>0?o:cl,h:h>0?h:cl,l:l>0?l:cl,v:v>0?v:0});
    }
    tmp.sort(function(a,b){return a.d<b.d?-1:a.d>b.d?1:0;});
    var ded=[];
    for(j=0;j<tmp.length;j++){if(ded.length&&ded[ded.length-1].d===tmp[j].d)ded[ded.length-1]=tmp[j];else ded.push(tmp[j]);}
    var byD={};
    for(j=1;j<ded.length;j++){
      var p=ded[j-1],q=ded[j],rc=q.c/p.c;
      if(!(rc>0.6&&rc<1.6))continue; /* bad print / unadjusted split: ignore this stock-day */
      byD[q.d]={o:q.o/p.c,h:Math.max(q.h,q.o,q.c)/p.c,l:Math.min(q.l,q.o,q.c)/p.c,c:rc,t:q.c*q.v};
    }
    per.push(byD);
  }
  if(per.length<2)return[];
  var dset={};
  for(i=0;i<per.length;i++)for(k in per[i])dset[k]=1;
  var ds=Object.keys(dset).sort(),need=Math.max(2,Math.ceil(per.length*0.5)),out=[],idx=100;
  for(i=0;i<ds.length;i++){
    var dd=ds[i],n=0,so=0,sh=0,sl=0,sc=0,sv=0;
    for(j=0;j<per.length;j++){var r=per[j][dd];if(!r)continue;n++;so+=r.o;sh+=r.h;sl+=r.l;sc+=r.c;sv+=r.t;}
    if(n<need)continue;
    var O=idx*so/n,H=idx*sh/n,L=idx*sl/n,C=idx*sc/n;
    H=Math.max(H,O,C);L=Math.min(L,O,C);
    out.push({t:dd,o:O,h:H,l:L,c:C,v:sv});idx=C;
  }
  return out;
}
function bkSleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
async function fetchMember(DF,sym){
  try{
    var r=await DF.fetchOHLCVCached(sym+".NS","daily");
    if(r&&r.data&&r.data.length)return r.data;
    var d=await DF.fetchOHLCV(sym+".NS","daily"); /* bypass a memoised failure */
    if(d&&d.candles&&d.candles.length)return d.candles;
  }catch(e){}
  return null;
}
function membersOf(key){var o=[],k;for(k in MAP2){if(MAP2[k]===key)o.push(k);}return o;}
/* Daily candles for any sector: the index for index-based sectors, the basket otherwise. */
async function fetchSectorCandles(sec){
  var DF=window.OHLCVFetcher;if(!DF)throw new Error("OHLCVFetcher not loaded");
  if(!sec.basket){var r=await DF.fetchOHLCVCached(sec.yahoo,"daily");return r&&r.data?r.data:null;}
  var hit=_bk[sec.key];if(hit&&Date.now()-hit.ts<TTL)return hit.candles;
  if(_bkp[sec.key])return _bkp[sec.key];
  var p=(async function(){
    var mem=membersOf(sec.key),lists=[];
    for(var i=0;i<mem.length;i+=4){ /* small batches: the data proxies are flaky under load */
      var got=await Promise.all(mem.slice(i,i+4).map(function(m){return fetchMember(DF,m);}));
      for(var j=0;j<got.length;j++)if(got[j])lists.push(got[j]);
      await bkSleep(120);
    }
    if(lists.length<BASKET_MIN)return null;
    var c=buildBasket(lists);
    if(c.length<40)return null;
    _bk[sec.key]={ts:Date.now(),candles:c};
    return c;
  })();
  _bkp[sec.key]=p;
  try{return await p;}finally{delete _bkp[sec.key];}
}
var _s=null,_l=null,_u=[];
function notify(){_u.slice().forEach(function(fn){try{fn(_s);}catch(e){}});}
function onUpdate(fn){_u.push(fn);return function(){var i=_u.indexOf(fn);if(i>=0)_u.splice(i,1);};}
async function load(opts){opts=opts||{};var force=!!opts.force;var DF=window.OHLCVFetcher;if(!DF)throw new Error("OHLCVFetcher not loaded");if(!force&&_s&&(Date.now()-_s.ts<TTL))return _s;if(_l&&!force)return _l;var pr=opts.onProgress||function(){};if(force)_bk={};_sec20Map={};_l=(async function(){try{pr(0,SEC.length+1,"Benchmark...");var bR=await DF.fetchOHLCVCached(BENCH,"daily");var b=bR&&bR.data?bR.data:null;if(!b||b.length<40)throw new Error("Benchmark data unavailable");var secs=[],tot=SEC.length+1,dn=1;for(var i=0;i<SEC.length;i++){var s=SEC[i];pr(dn,tot,"Fetching "+s.name);try{var c=await fetchSectorCandles(s);if(c&&c.length>=40){var cc=compute(c,b,s);if(cc)secs.push(cc);if(!s.basket&&c.length>=21){var _m20=c.length-1;if(c[_m20].c>0&&c[_m20-20].c>0){var _s20=(c[_m20].c-c[_m20-20].c)/c[_m20-20].c*100;_sec20Map[s.key]=Math.round(_s20*100)/100;}}}}catch(e){}dn++;await new Promise(function(r){setTimeout(r,30);});}pr(tot,tot,"Computed");_s={ts:Date.now(),sectors:secs,benchmark:b};notify();return _s;}finally{_l=null;}})();return _l;}
function getState(){return _s;}
function getSectorQuadrantForSymbol(sym){if(!_s||!_s.sectors)return null;var k=GATE_MAP[norm(sym)];if(!k)return null;for(var i=0;i<_s.sectors.length;i++)if(_s.sectors[i].key===k)return _s.sectors[i];return null;}
function getMarketRegime(){if(!_s||!_s.benchmark)return null;var b=_s.benchmark;if(b.length<200)return{isDowntrend:false};var s=0;for(var i=b.length-200;i<b.length;i++)s+=b[i].c;var ma=s/200,last=b[b.length-1].c;return{isDowntrend:last<ma,benchmarkClose:Math.round(last*100)/100,benchmarkSMA200:Math.round(ma*100)/100,distancePct:Math.round((last/ma-1)*10000)/100};}
/* v21: sync lookup for the sector-outlier modifier. Returns the sector's
   20-day % return so the entry scorer can compute stock-vs-sector excess.
   Returns null if: sector state not loaded / stale, sector is a basket
   (too noisy), or the symbol isn't mapped to a sector. Zero I/O. */
function getSector20dPct(symbol){
  if(!_s||!_sec20Map)return null;
  if(Date.now()-_s.ts>24*3600*1000)return null;
  var k=GATE_MAP[norm(symbol)];
  if(!k)return null;
  var sec=null;
  for(var i=0;i<SEC.length;i++)if(SEC[i].key===k){sec=SEC[i];break;}
  if(!sec)return null;
  if(sec.basket)return null;
  var pct=_sec20Map[k];
  if(pct==null)return null;
  return{sectorKey:k,sectorName:sec.name,sectorPct:pct};
}
setTimeout(function(){try{load({force:false}).catch(function(){});}catch(e){}},5000);
return{SECTORS:SEC,load:load,getState:getState,getSectorQuadrantForSymbol:getSectorQuadrantForSymbol,getSector20dPct:getSector20dPct,getMarketRegime:getMarketRegime,onUpdate:onUpdate,STOCK_SECTOR:MAP,STOCK_SECTOR_ALL:MAP2,fetchSectorCandles:fetchSectorCandles,buildBasket:buildBasket,GATE_INCLUDES_BASKETS:GATE_INCLUDES_BASKETS};
})();