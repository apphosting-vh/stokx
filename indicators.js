/* --------------------------------------------------------------------------
   Technical Indicators Library � Pure calculation functions
   All functions return arrays; the last element is the "current" value.
   Rewritten per Python/pandas spec (Sections 4.1�4.5).
   -------------------------------------------------------------------------- */
window.TechIndicators = (function () {

  function closes(candles) { return candles.map(function (c) { return c.c; }); }
  function highs(candles) { return candles.map(function (c) { return c.h; }); }
  function lows(candles) { return candles.map(function (c) { return c.l; }); }
  function opens(candles) { return candles.map(function (c) { return c.o; }); }
  function volumes(candles) { return candles.map(function (c) { return c.v; }); }

  function sma(arr, period) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var sum = 0;
      for (var j = i - period + 1; j <= i; j++) sum += arr[j];
      out.push(sum / period);
    }
    return out;
  }

  function ewmAlpha(arr, alpha) {
    var out = [];
    var prev = null;
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v === null || v === undefined || isNaN(v)) { out.push(null); continue; }
      prev = prev === null ? v : v * alpha + prev * (1 - alpha);
      out.push(prev);
    }
    return out;
  }

  function ema(arr, period) {
    return ewmAlpha(arr, 2 / (period + 1));
  }

  function rollingStd(arr, period, ddof) {
    ddof = ddof === undefined ? 1 : ddof;
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var vals = [];
      for (var j = Math.max(0, i - period + 1); j <= i; j++) {
        var v = arr[j];
        if (v === null || v === undefined || isNaN(v)) continue;
        vals.push(v);
      }
      if (vals.length < period) { out.push(null); continue; }
      var mean = 0;
      for (var k = 0; k < vals.length; k++) mean += vals[k];
      mean /= vals.length;
      var sq = 0;
      for (var k = 0; k < vals.length; k++) sq += (vals[k] - mean) * (vals[k] - mean);
      var denom = vals.length - ddof;
      out.push(denom > 0 ? Math.sqrt(sq / denom) : 0);
    }
    return out;
  }

  function rollingMax(arr, period) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var m = null;
      for (var j = i - period + 1; j <= i; j++) { if (arr[j] != null && (m === null || arr[j] > m)) m = arr[j]; }
      out.push(m);
    }
    return out;
  }

  function rollingMin(arr, period) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var m = null;
      for (var j = i - period + 1; j <= i; j++) { if (arr[j] != null && (m === null || arr[j] < m)) m = arr[j]; }
      out.push(m);
    }
    return out;
  }

  function round(val, dec) {
    if (val === null || val === undefined || isNaN(val)) return null;
    var f = Math.pow(10, dec || 2);
    return Math.round(val * f) / f;
  }

  var cl_sma = sma;
  var cl_ema = ema;

  /* --------------------------------------------------------------------------
     Section 4.1 — Trend & Moving Averages
     -------------------------------------------------------------------------- */

  function calcSMA(candles, period) {
    period = period || 20;
    return sma(closes(candles), period);
  }

  function calcEMA(candles, period) {
    period = period || 20;
    return ema(closes(candles), period);
  }

  function calcWMA(candles, period) {
    period = period || 20;
    var cl = closes(candles);
    var out = [];
    var denom = period * (period + 1) / 2;
    for (var i = 0; i < cl.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var sum = 0;
      for (var j = 0; j < period; j++) {
        sum += cl[i - period + 1 + j] * (j + 1);
      }
      out.push(sum / denom);
    }
    return out;
  }

  function calcRollingVWAP(candles, period) {
    period = period || 10;
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var tpvSum = 0, volSum = 0;
      for (var j = i - period + 1; j <= i; j++) {
        var tp = (candles[j].h + candles[j].l + candles[j].c) / 3;
        tpvSum += tp * candles[j].v;
        volSum += candles[j].v;
      }
      out.push(volSum > 0 ? round(tpvSum / volSum, 2) : null);
    }
    return out;
  }

  function calcVWAP(candles) { return calcRollingVWAP(candles, 10); }

  function calcHMA(candles, period) {
    period = period || 20;
    var half = Math.floor(period / 2);
    var sqrtP = Math.max(1, Math.floor(Math.round(Math.sqrt(period))));
    var halfWma = calcWMA(candles, half);
    var fullWma = calcWMA(candles, period);
    var diff = [];
    for (var i = 0; i < candles.length; i++) {
      if (halfWma[i] === null || fullWma[i] === null) { diff.push(null); continue; }
      diff.push(2 * halfWma[i] - fullWma[i]);
    }
    var denom = sqrtP * (sqrtP + 1) / 2;
    var out = [];
    for (var i = 0; i < diff.length; i++) {
      if (diff[i] === null || i < sqrtP - 1) { out.push(null); continue; }
      var sum = 0; var valid = true;
      for (var j = 0; j < sqrtP; j++) {
        if (diff[i - sqrtP + 1 + j] === null) { valid = false; break; }
        sum += diff[i - sqrtP + 1 + j] * (j + 1);
      }
      out.push(valid ? round(sum / denom, 4) : null);
    }
    return out;
  }

  function calcKAMA(candles, period, fast, slow) {
    period = period || 10;
    fast = fast || 2;
    slow = slow || 30;
    var cl = closes(candles);
    var n = cl.length;
    var fastSC = 2 / (fast + 1);
    var slowSC = 2 / (slow + 1);
    var out = [];
    for (var i = 0; i < n; i++) out.push(null);
    if (n < period) return out;
    var diff = [];
    diff.push(0);
    for (var i = 1; i < n; i++) diff.push(Math.abs(cl[i] - cl[i - 1]));
    var volSum = 0;
    for (var i = 1; i <= period; i++) volSum += diff[i];
    var prev = null;
    for (var i = period; i < n; i++) {
      var direction = Math.abs(cl[i] - cl[i - period]);
      var er = volSum !== 0 ? direction / volSum : 0;
      var sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
      if (prev === null) {
        prev = cl[i];
      } else {
        prev = prev + sc * (cl[i] - prev);
      }
      out[i] = round(prev, 4);
      if (i < n - 1) { volSum += diff[i + 1]; volSum -= diff[i + 1 - period]; }
    }
    return out;
  }

  function calcMansfieldRS(c, idx_c, n) {
    n = n || 52;
    if (!c || !idx_c || c.length < n || idx_c.length < n) return null;
    var cl = closes(c), ix = closes(idx_c);
    var len = Math.min(cl.length, ix.length);
    var rsArr = [];
    for (var i = 0; i < len; i++) {
      if (cl[i] != null && ix[i] != null && ix[i] > 0) {
        rsArr.push(cl[i] / ix[i] * 100);
      } else {
        rsArr.push(null);
      }
    }
    var out = [];
    for (var i = 0; i < len; i++) {
      if (rsArr[i] === null || i < n - 1) { out.push(null); continue; }
      var sum = 0, cnt = 0;
      for (var j = i - n + 1; j <= i; j++) {
        if (rsArr[j] !== null) { sum += rsArr[j]; cnt++; }
      }
      if (cnt > 0) {
        var avg = sum / cnt;
        out.push(avg > 0 ? round((rsArr[i] / avg - 1) * 100, 2) : null);
      } else {
        out.push(null);
      }
    }
    return out;
  }

  function calcPctFrom126dHigh(candles, n) {
    n = n || 126;
    var hi = highs(candles), cl = closes(candles);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < n - 1) { out.push(null); continue; }
      var hMax = -Infinity;
      for (var j = i - n + 1; j <= i; j++) { if (hi[j] > hMax) hMax = hi[j]; }
      out.push(hMax > 0 ? round((cl[i] - hMax) / hMax * 100, 2) : null);
    }
    return out;
  }

  function calcPctFrom126dLow(candles, n) {
    n = n || 126;
    var lo = lows(candles), cl = closes(candles);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < n - 1) { out.push(null); continue; }
      var lMin = Infinity;
      for (var j = i - n + 1; j <= i; j++) { if (lo[j] < lMin) lMin = lo[j]; }
      out.push(lMin > 0 ? round((cl[i] - lMin) / lMin * 100, 2) : null);
    }
    return out;
  }

  function calcPctFrom52wHigh(candles, n) {
    n = n || 252;
    var cl = closes(candles);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < n - 1) { out.push(null); continue; }
      var hMax = -Infinity;
      for (var j = i - n + 1; j <= i; j++) { if (cl[j] > hMax) hMax = cl[j]; }
      out.push(hMax > 0 ? round((cl[i] / hMax - 1) * 100, 2) : null);
    }
    return out;
  }

  function calcPctFrom52wLow(candles, n) {
    n = n || 252;
    var cl = closes(candles);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < n - 1) { out.push(null); continue; }
      var lMin = Infinity;
      for (var j = i - n + 1; j <= i; j++) { if (cl[j] < lMin) lMin = cl[j]; }
      out.push(lMin > 0 ? round((cl[i] / lMin - 1) * 100, 2) : null);
    }
    return out;
  }

  function calcHeikinAshi(candles) {
    var haClose = [], haOpen = [];
    for (var i = 0; i < candles.length; i++) {
      haClose.push(round((candles[i].o + candles[i].h + candles[i].l + candles[i].c) / 4, 2));
      if (i === 0) { haOpen.push(round((candles[i].o + candles[i].c) / 2, 2)); }
      else { haOpen.push(round((haOpen[i - 1] + haClose[i - 1]) / 2, 2)); }
    }
    var haHigh = [], haLow = [], trend = [];
    for (var i = 0; i < candles.length; i++) {
      haHigh.push(Math.max(candles[i].h, haOpen[i], haClose[i]));
      haLow.push(Math.min(candles[i].l, haOpen[i], haClose[i]));
      trend.push(haClose[i] > haOpen[i] ? 'bullish' : haClose[i] < haOpen[i] ? 'bearish' : 'neutral');
    }
    return { open: haOpen, high: haHigh, low: haLow, close: haClose, trend: trend };
  }

  function calcChandelierExit(candles, period, mult) {
    period = period || 22; mult = mult || 3;
    var hi = highs(candles);
    var lo = lows(candles);
    var atrArr = calcATR(candles, period);
    var longArr = [], shortArr = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period - 1 || atrArr[i] == null) { longArr.push(null); shortArr.push(null); continue; }
      var hMax = -Infinity, lMin = Infinity;
      for (var j = i - period + 1; j <= i; j++) {
        if (hi[j] > hMax) hMax = hi[j];
        if (lo[j] < lMin) lMin = lo[j];
      }
      longArr.push(round(hMax - atrArr[i] * mult, 2));
      shortArr.push(round(lMin + atrArr[i] * mult, 2));
    }
    return { long: longArr, short: shortArr };
  }

  /* Beta = regression slope of stock returns on the index returns (paired by
     timestamp), rolling over the trailing `n` (default 60) bars. Benchmark is the
     index series passed in (daily Nifty in production). In the entry score it only
     penalizes when combined with ATR% > 3.0, so high-beta names are not penalized
     unconditionally. */
  function calcBeta(stockCandles, indexCandles, n) {
    n = n || 60;
    if (!stockCandles || !indexCandles || stockCandles.length < n || indexCandles.length < n) return null;
    var sMap = {};
    for (var i = 0; i < stockCandles.length; i++) sMap[stockCandles[i].t] = stockCandles[i].c;
    var pairs = [];
    for (var i = 1; i < indexCandles.length; i++) {
      var sv = sMap[indexCandles[i].t], svPrev = sMap[indexCandles[i - 1].t];
      if (sv != null && svPrev != null && svPrev > 0 && indexCandles[i - 1].c > 0) {
        pairs.push({ s: (sv - svPrev) / svPrev, idx: (indexCandles[i].c - indexCandles[i - 1].c) / indexCandles[i - 1].c });
      }
    }
    if (pairs.length < n) return null;
    var out = [];
    for (var i = 0; i < pairs.length; i++) {
      if (i < n - 1) { out.push(null); continue; }
      var sMean = 0, iMean = 0, c = 0;
      for (var k = i - n + 1; k <= i; k++) { sMean += pairs[k].s; iMean += pairs[k].idx; c++; }
      sMean /= c; iMean /= c;
      var cov = 0, iVar = 0;
      for (var k = i - n + 1; k <= i; k++) {
        cov += (pairs[k].s - sMean) * (pairs[k].idx - iMean);
        iVar += (pairs[k].idx - iMean) * (pairs[k].idx - iMean);
      }
      out.push(iVar > 0 ? round(cov / iVar, 4) : null);
    }
    return out;
  }
  /* --------------------------------------------------------------------------
     Section 4.2 � Trend Direction & Strength
     -------------------------------------------------------------------------- */

  function calcTrueRange(candles) {
    var tr = [];
    for (var i = 0; i < candles.length; i++) {
      if (i === 0) { tr.push(candles[i].h - candles[i].l); continue; }
      tr.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c)));
    }
    return tr;
  }

  function calcATR(candles, period) {
    period = period || 14;
    var tr = calcTrueRange(candles);
    return ewmAlpha(tr, 1 / period).map(function (v) {
      return v === null ? null : round(v, 4);
    });
  }

  function calcADX(candles, period) {
    period = period || 14;
    if (candles.length < period + 1) return null;
    var plusDM = [0], minusDM = [0], trArr = [candles[0].h - candles[0].l];
    for (var i = 1; i < candles.length; i++) {
      var upMove = candles[i].h - candles[i - 1].h;
      var downMove = candles[i - 1].l - candles[i].l;
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
      trArr.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c)));
    }
    var atrArr = ewmAlpha(trArr, 1 / period);
    var pdmSmooth = ewmAlpha(plusDM, 1 / period);
    var mdmSmooth = ewmAlpha(minusDM, 1 / period);
    var plusDI = [], minusDI = [], dx = [];
    for (var i = 0; i < trArr.length; i++) {
      var pd = atrArr[i] > 0 ? 100 * pdmSmooth[i] / atrArr[i] : 0;
      var md = atrArr[i] > 0 ? 100 * mdmSmooth[i] / atrArr[i] : 0;
      plusDI.push(pd); minusDI.push(md);
      var sum = pd + md;
      dx.push(sum > 0 ? 100 * Math.abs(pd - md) / sum : 0);
    }
    var adxArr = ewmAlpha(dx, 1 / period).map(function (v) { return v === null ? null : round(v, 2); });
    return { adx: adxArr, plusDI: plusDI, minusDI: minusDI };
  }

  function calcSuperTrend(candles, period, multiplier) {
    period = period || 10;
    multiplier = multiplier || 3;
    var atr = calcATR(candles, period);
    var out = [];
    var prevUpper = null, prevLower = null, prevST = null;
    for (var i = 0; i < candles.length; i++) {
      if (atr[i] === null) { out.push(null); continue; }
      var hl2 = (candles[i].h + candles[i].l) / 2;
      var rawUpper = hl2 + multiplier * atr[i];
      var rawLower = hl2 - multiplier * atr[i];
      var upperBand = (prevUpper !== null && rawUpper < prevUpper) ? rawUpper : (prevUpper !== null ? Math.min(rawUpper, prevUpper) : rawUpper);
      var lowerBand = (prevLower !== null && rawLower > prevLower) ? rawLower : (prevLower !== null ? Math.max(rawLower, prevLower) : rawLower);
      var st;
      if (prevST === null) { st = candles[i].c > upperBand ? lowerBand : upperBand; }
      else if (prevST === prevUpper) { st = candles[i].c > upperBand ? lowerBand : upperBand; }
      else { st = candles[i].c < lowerBand ? upperBand : lowerBand; }
      prevUpper = upperBand; prevLower = lowerBand; prevST = st;
      out.push(round(st, 2));
    }
    return out;
  }

  function calcParabolicSAR(candles) {
    var n = candles.length;
    if (n < 2) return candles.map(function () { return null; });
    var out = [null];
    var isLong = candles[1].c > candles[0].c;
    var af = 0.02, afStep = 0.02, afMax = 0.20;
    var ep = isLong ? candles[0].h : candles[0].l;
    var sar = isLong ? candles[0].l : candles[0].h;
    for (var i = 1; i < n; i++) {
      var prevSar = sar;
      sar = prevSar + af * (ep - prevSar);
      if (isLong) {
        sar = Math.min(sar, candles[i - 1].l);
        if (i >= 2) sar = Math.min(sar, candles[i - 2].l);
      } else {
        sar = Math.max(sar, candles[i - 1].h);
        if (i >= 2) sar = Math.max(sar, candles[i - 2].h);
      }
      if (isLong) {
        if (candles[i].l < sar) { isLong = false; sar = ep; ep = candles[i].l; af = afStep; }
        else if (candles[i].h > ep) { ep = candles[i].h; af = Math.min(af + afStep, afMax); }
      } else {
        if (candles[i].h > sar) { isLong = true; sar = ep; ep = candles[i].h; af = afStep; }
        else if (candles[i].l < ep) { ep = candles[i].l; af = Math.min(af + afStep, afMax); }
      }
      out.push(round(sar, 2));
    }
    return out;
  }

  function calcVortex(candles, period) {
    period = period || 14;
    var hi = highs(candles), lo = lows(candles), cl = closes(candles);
    var vmPlus = [0], vmMinus = [0], tr = [];
    for (var i = 0; i < candles.length; i++) {
      if (i === 0) { tr.push(hi[i] - lo[i]); continue; }
      vmPlus.push(Math.abs(hi[i] - lo[i - 1]));
      vmMinus.push(Math.abs(lo[i] - hi[i - 1]));
      tr.push(Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1])));
    }
    var viPlus = [], viMinus = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period - 1) { viPlus.push(null); viMinus.push(null); continue; }
      var sP = 0, sM = 0, sT = 0;
      for (var j = i - period + 1; j <= i; j++) { sP += vmPlus[j]; sM += vmMinus[j]; sT += tr[j]; }
      viPlus.push(sT > 0 ? round(sP / sT, 4) : null);
      viMinus.push(sT > 0 ? round(sM / sT, 4) : null);
    }
    return { plus: viPlus, minus: viMinus };
  }

  function calcAroon(candles, period) {
    period = period || 25;
    var hi = highs(candles), lo = lows(candles);
    var up = [], down = [], osc = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period) { up.push(null); down.push(null); osc.push(null); continue; }
      var bestIdx = i, worstIdx = i;
      for (var j = i - period; j <= i; j++) { if (hi[j] > hi[bestIdx]) bestIdx = j; if (lo[j] < lo[worstIdx]) worstIdx = j; }
      var upVal = round((period - (i - bestIdx)) / period * 100, 2);
      var dnVal = round((period - (i - worstIdx)) / period * 100, 2);
      up.push(upVal); down.push(dnVal); osc.push(round(upVal - dnVal, 2));
    }
    return { up: up, down: down, osc: osc };
  }

  function calcIchimoku(candles) {
    function periodHL(arr, len, idx) {
      var hi = -Infinity, lo = Infinity;
      for (var j = idx - len + 1; j <= idx; j++) {
        if (arr[j].h > hi) hi = arr[j].h;
        if (arr[j].l < lo) lo = arr[j].l;
      }
      return (hi + lo) / 2;
    }
    var tenkan = [], kijun = [], senkouA = [], senkouB = [], chikou = [];
    var n = candles.length;
    for (var i = 0; i < n; i++) {
      if (i < 8) { tenkan.push(null); kijun.push(null); senkouA.push(null); senkouB.push(null); chikou.push(null); continue; }
      tenkan.push(round(periodHL(candles, 9, i), 2));
      kijun.push(i >= 25 ? round(periodHL(candles, 26, i), 2) : null);
      var ta = periodHL(candles, 9, i);
      var kj = i >= 25 ? periodHL(candles, 26, i) : null;
      senkouA.push(kj !== null ? round((ta + kj) / 2, 2) : null);
      senkouB.push(i >= 51 ? round(periodHL(candles, 52, i), 2) : null);
      chikou.push(i >= 26 ? round(candles[i - 26].c, 2) : null);
    }
    var senkouAShifted = candles.map(function () { return null; });
    var senkouBShifted = candles.map(function () { return null; });
    for (var i = 0; i < senkouA.length; i++) {
      if (senkouA[i] !== null && i + 26 < n) { senkouAShifted[i + 26] = senkouA[i]; }
      if (senkouB[i] !== null && i + 26 < n) { senkouBShifted[i + 26] = senkouB[i]; }
    }
    return { tenkan: tenkan, kijun: kijun, senkouA: senkouAShifted, senkouB: senkouBShifted, chikou: chikou };
  }

  function calcMACD(candles, fast, slow, signal) {
    fast = fast || 12; slow = slow || 26; signal = signal || 9;
    var cl = closes(candles);
    var emaFast = ema(cl, fast), emaSlow = ema(cl, slow);
    var macdLine = [];
    for (var i = 0; i < cl.length; i++) {
      if (emaFast[i] === null || emaSlow[i] === null) { macdLine.push(null); continue; }
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
    var validMacd = [], validIdx = [];
    for (var i = 0; i < macdLine.length; i++) { if (macdLine[i] !== null) { validMacd.push(macdLine[i]); validIdx.push(i); } }
    var sigEma = ema(validMacd, signal);
    var signalLine = macdLine.map(function () { return null; });
    for (var i = 0; i < sigEma.length; i++) { signalLine[validIdx[i]] = sigEma[i]; }
    var histogram = [];
    for (var i = 0; i < cl.length; i++) {
      if (macdLine[i] === null || signalLine[i] === null) { histogram.push(null); continue; }
      histogram.push(round(macdLine[i] - signalLine[i], 4));
    }
    return { macd: macdLine.map(function (v) { return v !== null ? round(v, 4) : null; }), signal: signalLine.map(function (v) { return v !== null ? round(v, 4) : null; }), histogram: histogram };
  }

  function calcTSI(candles, longPeriod, shortPeriod) {
    longPeriod = longPeriod || 25; shortPeriod = shortPeriod || 13;
    var cl = closes(candles);
    if (cl.length < 3) return cl.map(function () { return null; });
    var momentum = [null];
    for (var i = 1; i < cl.length; i++) momentum.push(cl[i] - cl[i - 1]);
    var smoothed1 = ema(momentum, longPeriod), smoothed2 = ema(smoothed1, shortPeriod);
    var absMom = momentum.map(function (m) { return m !== null ? Math.abs(m) : null; });
    var absSmoothed1 = ema(absMom, longPeriod), absSmoothed2 = ema(absSmoothed1, shortPeriod);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (smoothed2[i] === null || absSmoothed2[i] === null || absSmoothed2[i] === 0) { out.push(null); }
      else { out.push(round(100 * smoothed2[i] / absSmoothed2[i], 2)); }
    }
    return out;
  }

  function calcSTC(candles, macdFast, macdSlow, stochPeriod) {
    macdFast = macdFast || 23; macdSlow = macdSlow || 50; stochPeriod = stochPeriod || 10;
    var cl = closes(candles);
    var macdResult = calcMACD(candles, macdFast, macdSlow, 0);
    var macdLine = macdResult.macd;
    var rawK = [];
    for (var i = 0; i < macdLine.length; i++) {
      if (macdLine[i] === null || i < stochPeriod - 1) { rawK.push(null); continue; }
      var hi = -Infinity, lo = Infinity;
      for (var j = i - stochPeriod + 1; j <= i; j++) {
        if (macdLine[j] === null) continue;
        if (macdLine[j] > hi) hi = macdLine[j];
        if (macdLine[j] < lo) lo = macdLine[j];
      }
      rawK.push(hi - lo > 0 ? 100 * (macdLine[i] - lo) / (hi - lo) : 50);
    }
    function smoothArr(arr, span) {
      var valid = [], idx = [];
      for (var i = 0; i < arr.length; i++) { if (arr[i] !== null) { valid.push(arr[i]); idx.push(i); } }
      if (valid.length === 0) return arr.map(function () { return null; });
      var sm = ema(valid, span);
      var out = arr.map(function () { return null; });
      for (var i = 0; i < sm.length; i++) out[idx[i]] = sm[i];
      return out;
    }
    var halfCycle = Math.max(1, Math.floor(stochPeriod / 2));
    var d = smoothArr(rawK, halfCycle);
    var ll2 = d.map(function () { return null; }), hh2 = d.map(function () { return null; });
    for (var i = 0; i < d.length; i++) {
      if (d[i] === null || i < stochPeriod - 1) continue;
      var h = -Infinity, l = Infinity;
      for (var j = i - stochPeriod + 1; j <= i; j++) {
        if (d[j] === null) continue;
        if (d[j] > h) h = d[j];
        if (d[j] < l) l = d[j];
      }
      hh2[i] = h; ll2[i] = l;
    }
    var kk = [];
    for (var i = 0; i < d.length; i++) {
      if (d[i] === null || hh2[i] === null || ll2[i] === null || hh2[i] === ll2[i]) { kk.push(null); continue; }
      kk.push(100 * (d[i] - ll2[i]) / (hh2[i] - ll2[i]));
    }
    return smoothArr(kk, halfCycle).map(function (v) { return v !== null ? round(v, 2) : null; });
  }

  function calcAwesomeOscillator(candles) {
    var mid = candles.map(function(c) { return (c.h + c.l) / 2; });
    var sma5 = sma(mid, 5), sma34 = sma(mid, 34);
    var out = [];
    for (var i = 0; i < mid.length; i++) {
      out.push(sma5[i] != null && sma34[i] != null ? round(sma5[i] - sma34[i], 2) : null);
    }
    return out;
  }

  /* --------------------------------------------------------------------------
     Section 4.3 � Momentum Oscillators
     -------------------------------------------------------------------------- */

  function calcRSI(candles, period) {
    period = period || 14;
    var cl = closes(candles);
    if (cl.length < 2) return cl.map(function () { return null; });
    var gains = [0], losses = [0];
    for (var i = 1; i < cl.length; i++) {
      var diff = cl[i] - cl[i - 1];
      gains.push(diff > 0 ? diff : 0);
      losses.push(diff < 0 ? -diff : 0);
    }
    var avgGain = ewmAlpha(gains, 1 / period);
    var avgLoss = ewmAlpha(losses, 1 / period);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (avgLoss[i] === 0) out.push(100);
      else out.push(round(100 - 100 / (1 + avgGain[i] / avgLoss[i]), 2));
    }
    return out;
  }

  function calcStochasticRSI(candles, rsiPeriod, kSmooth, dSmooth) {
    rsiPeriod = rsiPeriod || 14;
    kSmooth = kSmooth || 3; dSmooth = dSmooth || 3;
    var rsi = calcRSI(candles, rsiPeriod);
    var n = rsi.length;
    var rawK = [];
    for (var i = 0; i < n; i++) {
      if (rsi[i] === null || i < rsiPeriod - 1) { rawK.push(null); continue; }
      var hi = -Infinity, lo = Infinity;
      for (var j = i - rsiPeriod + 1; j <= i; j++) {
        if (rsi[j] === null) continue;
        if (rsi[j] > hi) hi = rsi[j];
        if (rsi[j] < lo) lo = rsi[j];
      }
      rawK.push(hi - lo > 0 ? 100 * (rsi[i] - lo) / (hi - lo) : 50);
    }
    var validK = [], validIdx = [];
    for (var i = 0; i < rawK.length; i++) { if (rawK[i] !== null) { validK.push(rawK[i]); validIdx.push(i); } }
    var smK = sma(validK, kSmooth);
    var kOut = rawK.map(function () { return null; });
    for (var i = 0; i < smK.length; i++) { kOut[validIdx[i]] = smK[i] !== null ? round(smK[i], 2) : null; }
    var validK2 = [], validIdx2 = [];
    for (var i = 0; i < kOut.length; i++) { if (kOut[i] !== null) { validK2.push(kOut[i]); validIdx2.push(i); } }
    var smD = sma(validK2, dSmooth);
    var dOut = kOut.map(function () { return null; });
    for (var i = 0; i < smD.length; i++) { dOut[validIdx2[i]] = smD[i] !== null ? round(smD[i], 2) : null; }
    return { k: kOut, d: dOut };
  }

  function calcWilliamsR(candles, period) {
    period = period || 14;
    var hi = highs(candles), lo = lows(candles), cl = closes(candles);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var hh = -Infinity, ll = Infinity;
      for (var j = i - period + 1; j <= i; j++) { if (hi[j] > hh) hh = hi[j]; if (lo[j] < ll) ll = lo[j]; }
      out.push(hh - ll > 0 ? round((hh - cl[i]) / (hh - ll) * -100, 2) : null);
    }
    return out;
  }

  function calcCCI(candles, period) {
    period = period || 20;
    var tp = candles.map(function (c) { return (c.h + c.l + c.c) / 3; });
    var out = [];
    for (var i = 0; i < tp.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var sum = 0;
      for (var j = i - period + 1; j <= i; j++) sum += tp[j];
      var mean = sum / period;
      var mad = 0;
      for (var j = i - period + 1; j <= i; j++) mad += Math.abs(tp[j] - mean);
      mad /= period;
      out.push(mad > 0 ? round((tp[i] - mean) / (0.015 * mad), 2) : null);
    }
    return out;
  }

  function calcROC(candles, period) {
    period = period || 12;
    var cl = closes(candles);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < period || cl[i - period] === 0) { out.push(null); continue; }
      out.push(round(((cl[i] - cl[i - period]) / cl[i - period]) * 100, 2));
    }
    return out;
  }

  function calcMomentum(candles, period) {
    period = period || 10;
    var cl = closes(candles);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < period) { out.push(null); continue; }
      out.push(round(cl[i] - cl[i - period], 2));
    }
    return out;
  }

  function calcMFI(candles, period) {
    period = period || 14;
    if (candles.length < period + 1) return candles.map(function () { return null; });
    var tp = candles.map(function (c) { return (c.h + c.l + c.c) / 3; });
    var mf = [];
    for (var i = 0; i < candles.length; i++) { mf.push(tp[i] * candles[i].v); }
    var out = [null];
    for (var i = 1; i < candles.length; i++) {
      if (i < period) { out.push(null); continue; }
      var posMF = 0, negMF = 0;
      for (var j = i - period + 1; j <= i; j++) {
        if (tp[j] > tp[j - 1]) posMF += mf[j];
        else if (tp[j] < tp[j - 1]) negMF += mf[j];
      }
      var mfiVal;
      if (negMF === 0 && posMF === 0) mfiVal = null;
      else if (negMF === 0) mfiVal = 100;
      else mfiVal = 100 - 100 / (1 + posMF / negMF);
      out.push(mfiVal === null ? null : round(mfiVal, 2));
    }
    return out;
  }

  function calcCMF(candles, period) {
    period = period || 20;
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var mfvSum = 0, volSum = 0;
      for (var j = i - period + 1; j <= i; j++) {
        var hl = candles[j].h - candles[j].l;
        var mfv = hl > 0 ? ((candles[j].c - candles[j].l) - (candles[j].h - candles[j].c)) / hl * candles[j].v : 0;
        mfvSum += mfv; volSum += candles[j].v;
      }
      out.push(volSum > 0 ? round(mfvSum / volSum, 4) : null);
    }
    return out;
  }

  function calcForceIndex(candles, period) {
    period = period || 13;
    var cl = closes(candles), vol = volumes(candles);
    var raw = [null];
    for (var i = 1; i < cl.length; i++) { raw.push((cl[i] - cl[i - 1]) * vol[i]); }
    var valid = [];
    for (var i = 0; i < raw.length; i++) { if (raw[i] !== null) valid.push(raw[i]); }
    var out = ema(valid, period);
    var pad = [];
    for (var i = 0; i < raw.length - out.length; i++) pad.push(null);
    return pad.concat(out.map(function(v) { return v != null ? round(v, 0) : null; }));
  }

  /* --------------------------------------------------------------------------
     Section 4.4 � Volume-Based Indicators
     -------------------------------------------------------------------------- */

  function calcOBV(candles) {
    var out = [0];
    for (var i = 1; i < candles.length; i++) {
      if (candles[i].c > candles[i - 1].c) { out.push(out[i - 1] + candles[i].v); }
      else if (candles[i].c < candles[i - 1].c) { out.push(out[i - 1] - candles[i].v); }
      else { out.push(out[i - 1]); }
    }
    return out;
  }

  function calcPVT(candles) {
    var out = [0];
    for (var i = 1; i < candles.length; i++) {
      if (candles[i - 1].c === 0) { out.push(out[i - 1]); continue; }
      out.push(round(out[i - 1] + candles[i].v * ((candles[i].c - candles[i - 1].c) / candles[i - 1].c), 2));
    }
    return out;
  }

  function calcKVO(candles, fast, slow, signal) {
    fast = fast || 34; slow = slow || 55; signal = signal || 13;
    var n = candles.length;
    var cmSeries = [], trend = [], vf = [];
    for (var i = 0; i < n; i++) {
      var dm = Math.abs(candles[i].h - candles[i].l);
      var cm = (candles[i].h + candles[i].l + candles[i].c) / 3;
      cmSeries.push(cm);
      trend.push(i === 0 ? 1 : (cm >= cmSeries[i - 1] ? 1 : -1));
      vf.push(cm !== 0 ? candles[i].v * Math.abs(2 * (dm / cm) - 1) * trend[i] * 100 : 0);
    }
    var emaFast = ema(vf, fast), emaSlow = ema(vf, slow);
    var line = [];
    for (var i = 0; i < n; i++) line.push(round(emaFast[i] - emaSlow[i], 0));
    var signalArr = ema(line, signal).map(function (v) { return v === null ? null : round(v, 0); });
    return { line: line, signal: signalArr };
  }

  /* Anchored VWAP anchored at the START of the trailing 252 sessions (≈1 year) by
     default, so the value is reproducible regardless of how much history was fetched
     (previously it anchored at bar 0, making it depend on the caller's fetch depth).
     Pass an absolute anchorIdx to override. */
  function calcAnchoredVWAP(candles, anchorIdx) {
    if (anchorIdx == null) anchorIdx = Math.max(0, candles.length - 252);
    var out = [];
    var cumTPVol = 0, cumVol = 0;
    for (var i = 0; i < candles.length; i++) {
      if (i < anchorIdx) { out.push(null); continue; }
      var tp = (candles[i].h + candles[i].l + candles[i].c) / 3;
      cumTPVol += tp * candles[i].v; cumVol += candles[i].v;
      out.push(cumVol > 0 ? round(cumTPVol / cumVol, 2) : null);
    }
    return out;
  }

  /* Volume Profile: `numBins` (default 24) equal-width price bins over the trailing
     `lookback` (default 60) sessions. POC = midpoint of the highest-volume bin.
     VAH/VAL = bounds of the 70% value area: bins sorted by volume are added until
     cumulative volume reaches 70% of total volume. */
  function calcVolumeProfile(candles, numBins, lookback) {
    numBins = numBins || 24;
    lookback = lookback || 60;
    if (!candles || candles.length < 2) return null;
    var start = Math.max(0, candles.length - lookback);
    var hi = -Infinity, lo = Infinity;
    var cl = closes(candles);
    for (var i = start; i < cl.length; i++) { if (cl[i] > hi) hi = cl[i]; if (cl[i] < lo) lo = cl[i]; }
    if (hi === lo) return null;
    var binSize = (hi - lo) / numBins;
    var bins = [];
    for (var b = 0; b < numBins; b++) {
      bins.push({ priceFrom: round(lo + b * binSize, 2), priceTo: round(lo + (b + 1) * binSize, 2), volume: 0 });
    }
    for (var i = start; i < cl.length; i++) {
      var binIdx = Math.min(numBins - 1, Math.max(0, Math.floor((cl[i] - lo) / binSize)));
      bins[binIdx].volume += candles[i].v;
    }
    var maxVol = 0;
    for (var b = 0; b < bins.length; b++) { if (bins[b].volume > maxVol) maxVol = bins[b].volume; }
    for (var b = 0; b < bins.length; b++) { bins[b].pctOfMax = maxVol > 0 ? round(bins[b].volume / maxVol * 100, 1) : 0; }
    var pocBin = bins[0];
    for (var b = 1; b < bins.length; b++) { if (bins[b].volume > pocBin.volume) pocBin = bins[b]; }
    var poc = round((pocBin.priceFrom + pocBin.priceTo) / 2, 2);
    var totalVol = 0;
    for (var b = 0; b < bins.length; b++) totalVol += bins[b].volume;
    var order = [];
    for (var b = 0; b < bins.length; b++) order.push(b);
    order.sort(function (a, b) { return bins[b].volume - bins[a].volume; });
    var cum = 0, included = [];
    for (var k = 0; k < order.length; k++) {
      cum += bins[order[k]].volume; included.push(order[k]);
      if (cum >= 0.70 * totalVol) break;
    }
    var vah = round(bins[Math.max.apply(null, included)].priceTo, 2);
    var val = round(bins[Math.min.apply(null, included)].priceFrom, 2);
    return { bins: bins, poc: poc, pocVolume: pocBin.volume, vah: vah, val: val, valueAreaHigh: vah, valueAreaLow: val };
  }

  function calcTTMSqueeze(candles, bbPeriod, bbMult, kcMult) {
    bbPeriod = bbPeriod || 20; bbMult = bbMult || 2; kcMult = kcMult || 1.5;
    var bb = calcBollingerBands(candles, bbPeriod, bbMult);
    var kc = calcKeltnerChannels(candles, bbPeriod, kcMult);
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (bb.upper[i] === null || kc.upper[i] === null) { out.push(null); continue; }
      out.push(bb.upper[i] < kc.upper[i] && bb.lower[i] > kc.lower[i]);
    }
    return out;
  }

  function calcSqueezeMomentum(candles) {
    var squeeze = calcTTMSqueeze(candles);
    var cl = closes(candles);
    var period = 20;
    var hh = rollingMax(highs(candles), period);
    var ll = rollingMin(lows(candles), period);
    var series = [];
    for (var i = 0; i < cl.length; i++) {
      series.push(hh[i] !== null ? cl[i] - (hh[i] + ll[i]) / 2 : null);
    }
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < period - 1 || series[i] === null) { out.push(null); continue; }
      var valid = true, sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, cnt = 0;
      for (var j = i - period + 1; j <= i; j++) {
        if (series[j] === null) { valid = false; break; }
        var x = j - (i - period + 1);
        sumX += x; sumY += series[j]; sumXY += x * series[j]; sumX2 += x * x;
        cnt++;
      }
      if (!valid || cnt === 0) { out.push(null); continue; }
      var denom = cnt * sumX2 - sumX * sumX;
      var slope = denom !== 0 ? (cnt * sumXY - sumX * sumY) / denom : 0;
      var intercept = (sumY - slope * sumX) / cnt;
      out.push(round(slope * cnt + intercept, 4));
    }
    return { values: out, squeeze: squeeze };
  }

  /* Classic Chaikin Accumulation/Distribution line: cumulative CLV*volume, where
     CLV = ((C-L)-(H-C))/(H-L). Label = sign of the 20-bar ADL % change.
     Built directly from H/L/C/V so it does NOT re-score CMF/OBV/FI/MFI, which the
     entry engine already counts in the volume & momentum pillars (8.2/8.3/9.1). */
  function calcAccumDistComposite(candles) {
    if (!candles || candles.length < 20) return null;
    var cl = closes(candles), hi = highs(candles), lo = lows(candles), vo = volumes(candles);
    var adl = [];
    var acc = 0;
    for (var i = 0; i < candles.length; i++) {
      var c = cl[i], h = hi[i], l = lo[i], v = vo[i];
      var range = (h !== null && l !== null && h !== l) ? h - l : 0;
      var clv = (range > 0 && c !== null && h !== null && l !== null) ? ((c - l) - (h - c)) / range : 0;
      acc += (v != null ? v : 0) * clv;
      adl.push(acc);
    }
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < 20) { out.push(null); continue; }
      var base = Math.abs(adl[i - 20]) > 0 ? Math.abs(adl[i - 20]) : 1;
      var pct = (adl[i] - adl[i - 20]) / base;
      out.push(pct >= 0.05 ? 'ACCUMULATION' : pct <= -0.05 ? 'DISTRIBUTION' : 'NEUTRAL');
    }
    return out;
  }
  /* --------------------------------------------------------------------------
     Section 4.5 � Structure & Volatility
     -------------------------------------------------------------------------- */

  function calcBollingerBands(candles, period, mult) {
    period = period || 20; mult = mult || 2;
    var cl = closes(candles);
    var mid = sma(cl, period);
    var upper = [], lower = [];
    for (var i = 0; i < cl.length; i++) {
      if (mid[i] === null) { upper.push(null); lower.push(null); continue; }
      var sumSq = 0;
      for (var j = i - period + 1; j <= i; j++) { sumSq += Math.pow(cl[j] - mid[i], 2); }
      var std = Math.sqrt(sumSq / (period - 1));
      upper.push(round(mid[i] + mult * std, 2));
      lower.push(round(mid[i] - mult * std, 2));
    }
    var bandwidth = [];
    for (var i = 0; i < cl.length; i++) {
      if (upper[i] === null || lower[i] === null || mid[i] === null || mid[i] === 0) { bandwidth.push(null); continue; }
      bandwidth.push(round((upper[i] - lower[i]) / mid[i], 4));
    }
    return { upper: upper, middle: mid.map(function (v) { return v !== null ? round(v, 2) : null; }), lower: lower, bandwidth: bandwidth };
  }

  function calcKeltnerChannels(candles, period, mult) {
    period = period || 20; mult = mult || 1.5;
    var cl = closes(candles);
    var mid = ema(cl, period);
    var atr = calcATR(candles, period);
    var upper = [], lower = [];
    for (var i = 0; i < candles.length; i++) {
      if (mid[i] === null || atr[i] === null) { upper.push(null); lower.push(null); continue; }
      upper.push(round(mid[i] + mult * atr[i], 2));
      lower.push(round(mid[i] - mult * atr[i], 2));
    }
    return { upper: upper, middle: mid.map(function (v) { return v !== null ? round(v, 2) : null; }), lower: lower };
  }

  function calcDonchianChannels(candles, period) {
    period = period || 20;
    var upper = [], lower = [], middle = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period - 1) { upper.push(null); lower.push(null); middle.push(null); continue; }
      var hi = -Infinity, lo = Infinity;
      for (var j = i - period + 1; j <= i; j++) { if (candles[j].h > hi) hi = candles[j].h; if (candles[j].l < lo) lo = candles[j].l; }
      upper.push(round(hi, 2)); lower.push(round(lo, 2)); middle.push(round((hi + lo) / 2, 2));
    }
    return { upper: upper, middle: middle, lower: lower };
  }

  /* True Darvas box: box top = the most recent swing high (a `boxPeriod`-bar max at
     its own bar) that HOLDED for `confirmBars` without being taken out; box bottom =
     the lowest low printed since that high. This makes the box a discrete, confirmed
     range rather than a running 20-bar max — which would simply duplicate the
     Donchian channel already scored in 10.1. Falls back to the rolling 20-bar
     high / 3-bar low when no holding high exists in the window. */
  function calcDarvasBox(candles, boxPeriod, confirmBars) {
    boxPeriod = boxPeriod || 20;
    confirmBars = confirmBars || 3;
    var n = candles.length;
    if (n < boxPeriod) return null;
    var boxTop = null, boxBottom = null, topIdx = -1;
    for (var i = n - 1; i >= boxPeriod - 1 && boxTop === null; i--) {
      var isMax = true;
      for (var j = i - boxPeriod + 1; j <= i; j++) { if (candles[j].h > candles[i].h) { isMax = false; break; } }
      if (!isMax) continue;
      var heldBars = Math.min(confirmBars, n - 1 - i);
      var held = true;
      for (var j = i + 1; j <= i + heldBars; j++) { if (candles[j].h > candles[i].h) { held = false; break; } }
      if (!held) continue;
      boxTop = candles[i].h;
      topIdx = i;
      break;
    }
    if (boxTop === null) {
      boxTop = -Infinity;
      for (var j = n - boxPeriod; j < n; j++) { if (candles[j].h > boxTop) boxTop = candles[j].h; }
      boxBottom = Infinity;
      for (var j = Math.max(0, n - confirmBars); j < n; j++) { if (candles[j].l < boxBottom) boxBottom = candles[j].l; }
    } else {
      boxBottom = Infinity;
      for (var j = topIdx; j < n; j++) { if (candles[j].l < boxBottom) boxBottom = candles[j].l; }
    }
    var lastC = candles[n - 1].c;
    var position = lastC >= boxTop ? "at_upper" : lastC <= boxBottom ? "at_lower" : "inside";
    var boxHigh = round(boxTop, 2); var boxLow = round(boxBottom, 2);
    var boxRange = round(boxTop - boxBottom, 2);
    var breakout = lastC > boxTop ? "up" : lastC < boxBottom ? "down" : "none";
    return { boxTop: boxHigh, boxBottom: boxLow, top: boxHigh, bottom: boxLow, boxRange: boxRange, position: position, breakout: breakout, pctFromTop: boxRange > 0 ? round((boxTop - lastC) / boxRange * 100, 1) : 0 };
  }

  function calcFibonacci(candles) {
    var hi = highs(candles), lo = lows(candles);
    var n = Math.min(candles.length, 50);
    var start = candles.length - n;
    var swingHigh = -Infinity, swingLow = Infinity;
    for (var i = start; i < candles.length; i++) { if (hi[i] > swingHigh) swingHigh = hi[i]; if (lo[i] < swingLow) swingLow = lo[i]; }
    var diff = swingHigh - swingLow;
    return { swingHigh: round(swingHigh, 2), swingLow: round(swingLow, 2),
      retrace: { '0.236': round(swingHigh - diff * 0.236, 2), '0.382': round(swingHigh - diff * 0.382, 2), '0.500': round(swingHigh - diff * 0.5, 2), '0.618': round(swingHigh - diff * 0.618, 2), '0.786': round(swingHigh - diff * 0.786, 2) },
      extension: { '1.272': round(swingHigh + diff * 0.272, 2), '1.618': round(swingHigh + diff * 0.618, 2) } };
  }

  function calcPivotPoints(candles) {
    if (candles.length < 2) return null;
    var prev = candles[candles.length - 2];
    var H = prev.h, L = prev.l, C = prev.c;
    var P = (H + L + C) / 3;
    var rng = H - L;
    return { classic: { P: round(P, 2), R1: round(2 * P - L, 2), R2: round(P + rng, 2), R3: round(P + 2 * rng, 2), S1: round(2 * P - H, 2), S2: round(P - rng, 2), S3: round(P - 2 * rng, 2) },
      camarilla: { R1: round(C + rng * 1.1 / 12, 2), R2: round(C + rng * 1.1 / 6, 2), R3: round(C + rng * 1.1 / 4, 2), R4: round(C + rng * 1.1 / 2, 2), S1: round(C - rng * 1.1 / 12, 2), S2: round(C - rng * 1.1 / 6, 2), S3: round(C - rng * 1.1 / 4, 2), S4: round(C - rng * 1.1 / 2, 2) } };
  }

  function calcWilliamsFractals(candles) {
    var hi = highs(candles), lo = lows(candles);
    var up = [], down = [];
    for (var i = 2; i < candles.length - 2; i++) {
      var wH = [hi[i-2], hi[i-1], hi[i], hi[i+1], hi[i+2]];
      var wL = [lo[i-2], lo[i-1], lo[i], lo[i+1], lo[i+2]];
      if (hi[i] === Math.max.apply(null, wH)) up.push(i);
      if (lo[i] === Math.min.apply(null, wL)) down.push(i);
    }
    return { up: up.slice(-10), down: down.slice(-10) };
  }

  function calcZigZag(candles, pct) {
    pct = pct || 5;
    var cl = closes(candles);
    var pivots = [0], direction = 0;
    for (var i = 1; i < cl.length; i++) {
      var prevP = cl[pivots[pivots.length - 1]];
      var change = prevP > 0 ? (cl[i] - prevP) / prevP * 100 : 0;
      if (direction >= 0 && change <= -pct) { pivots.push(i); direction = -1; }
      else if (direction <= 0 && change >= pct) { pivots.push(i); direction = 1; }
    }
    return pivots.slice(-12);
  }

  function calcChoppinessIndex(candles, period) {
    period = period || 14;
    var hi = highs(candles), lo = lows(candles);
    var tr = calcTrueRange(candles);
    var out = [];
    for (var i = 0; i < tr.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var sumTR = 0, hMax = -Infinity, lMin = Infinity;
      for (var j = i - period + 1; j <= i; j++) { sumTR += tr[j]; if (hi[j] > hMax) hMax = hi[j]; if (lo[j] < lMin) lMin = lo[j]; }
      var rng = hMax - lMin;
      out.push(rng > 0 ? round(100 * Math.log10(sumTR / rng) / Math.log10(period), 2) : null);
    }
    return out;
  }

  function calcSmartMoney(candles) {
    if (!candles || candles.length < 10) return null;
    var orderBlocks = [];
    var threshold = 2;
    var atr = calcATR(candles, 14);
    for (var i = 3; i < candles.length; i++) {
      if (atr[i] === null || atr[i] === 0) continue;
      var body = Math.abs(candles[i].c - candles[i].o);
      if (body > threshold * atr[i]) {
        if (candles[i].c > candles[i].o && candles[i - 1].c < candles[i - 1].o) {
          orderBlocks.push({ type: "bullish_ob", high: candles[i - 1].h, low: candles[i - 1].l, idx: i - 1 });
        }
        if (candles[i].c < candles[i].o && candles[i - 1].c > candles[i - 1].o) {
          orderBlocks.push({ type: "bearish_ob", high: candles[i - 1].h, low: candles[i - 1].l, idx: i - 1 });
        }
      }
    }
    var bullOBs = orderBlocks.filter(function (b) { return b.type === "bullish_ob"; }).slice(-3);
    var bearOBs = orderBlocks.filter(function (b) { return b.type === "bearish_ob"; }).slice(-3);
    var swingHighs = [], swingLows = [];
    for (var i = 2; i < candles.length - 2; i++) {
      if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i - 2].h && candles[i].h > candles[i + 1].h && candles[i].h > candles[i + 2].h) {
        swingHighs.push({ price: candles[i].h, idx: i });
      }
      if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i - 2].l && candles[i].l < candles[i + 1].l && candles[i].l < candles[i + 2].l) {
        swingLows.push({ price: candles[i].l, idx: i });
      }
    }
    var lastC = candles[candles.length - 1].c;
    var lastSwingHigh = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : null;
    var lastSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1] : null;
    var bos = "none";
    if (lastSwingHigh && lastC > lastSwingHigh.price) bos = "bullish_bos";
    if (lastSwingLow && lastC < lastSwingLow.price) bos = "bearish_bos";
    var choch = "none";
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      var prevHigh = swingHighs[swingHighs.length - 2], prevLow = swingLows[swingLows.length - 2];
      if (lastSwingHigh && lastC > lastSwingHigh.price && lastSwingLow && lastSwingLow.idx > prevHigh.idx) { choch = "bullish_choch"; }
      if (lastSwingLow && lastC < lastSwingLow.price && lastSwingHigh && lastSwingHigh.idx > prevLow.idx) { choch = "bearish_choch"; }
    }
    return { orderBlocks: { bullish: bullOBs, bearish: bearOBs }, bos: bos, choch: choch, swingHighs: swingHighs.slice(-3), swingLows: swingLows.slice(-3) };
  }

  function calcMTFAlignment(candles) {
    var ema9 = calcEMA(candles, 9), ema21 = calcEMA(candles, 21), ema50 = calcEMA(candles, 50);
    var sma100 = candles.length >= 100 ? calcSMA(candles, 100) : candles.map(function () { return null; });
    var sma200 = candles.length >= 200 ? calcSMA(candles, 200) : candles.map(function () { return null; });
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (ema50[i] === null) { out.push(null); continue; }
      var score = 0, total = 0, cl = candles[i].c;
      if (ema9[i] !== null && ema21[i] !== null) { total++; if (ema9[i] > ema21[i]) score++; }
      if (ema21[i] !== null) { total++; if (ema21[i] > ema50[i]) score++; }
      total++; if (cl > ema50[i]) score++;
      if (sma100[i] !== null) { total++; if (ema50[i] > sma100[i]) score++; }
      if (sma200[i] !== null) { total++; if (sma100[i] > sma200[i]) score++; }
      if (sma200[i] !== null) { total++; if (cl > sma200[i]) score++; }
      out.push(total > 0 ? round(score / total * 100, 1) : null);
    }
    return out;
  }

  function calcWeek52HL(candles) {
    var hi = highs(candles), lo = lows(candles), cl = closes(candles);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < 251) { out.push(null); continue; }
      var h52 = -Infinity, l52 = Infinity;
      for (var j = i - 251; j <= i; j++) { if (hi[j] > h52) h52 = hi[j]; if (lo[j] < l52) l52 = lo[j]; }
      out.push({ high52w: round(h52, 2), low52w: round(l52, 2), pctFromHigh: h52 > 0 ? round((cl[i] - h52) / h52 * 100, 2) : null, pctFromLow: l52 > 0 ? round((cl[i] - l52) / l52 * 100, 2) : null });
    }
    return out;
  }

  function calcRelativeStrength(stockCandles, indexCandles) {
    if (!stockCandles || !indexCandles || stockCandles.length < 5 || indexCandles.length < 5) return null;
    var sc = closes(stockCandles), ic = closes(indexCandles);
    var sMap = {};
    for (var i = 0; i < stockCandles.length; i++) sMap[stockCandles[i].t] = sc[i];
    var rsArr = [];
    for (var i = 0; i < indexCandles.length; i++) {
      var sv = sMap[indexCandles[i].t];
      if (sv != null && ic[i] > 0) rsArr.push({ rs: sv / ic[i], t: indexCandles[i].t });
    }
    if (rsArr.length < 5) return null;
    var latestRS = rsArr[rsArr.length - 1].rs;
    var sum52 = 0, cnt52 = Math.min(rsArr.length, 52);
    for (var i = rsArr.length - cnt52; i < rsArr.length; i++) sum52 += rsArr[i].rs;
    var avg52 = sum52 / cnt52;
    var mansfield = avg52 > 0 ? round((latestRS / avg52 - 1) * 100, 2) : null;
    return { rs: round(latestRS, 4), mansfield: mansfield };
  }

  function calcSessionVWAP(candles) {
    var out = [];
    var cumTPVol = 0, cumVol = 0, sessionKey = null;
    for (var i = 0; i < candles.length; i++) {
      var t = candles[i].t;
      var key;
      if (t === null || t === undefined) key = 'all';
      else if (typeof t === 'number') key = new Date(t).toISOString().slice(0, 10);
      else key = String(t).slice(0, 10);
      if (sessionKey === null) sessionKey = key;
      if (key !== sessionKey) { sessionKey = key; cumTPVol = 0; cumVol = 0; }
      var tp = (candles[i].h + candles[i].l + candles[i].c) / 3;
      cumTPVol += tp * candles[i].v; cumVol += candles[i].v;
      out.push(cumVol > 0 ? round(cumTPVol / cumVol, 2) : null);
    }
    return out;
  }

  function calcDetectSpike(candles, lookback, spikeStdMult, atrMult) {
    lookback = lookback || 20;
    spikeStdMult = spikeStdMult || 2.5;
    atrMult = atrMult || 2.5;
    var cl = closes(candles);
    var ret = [null];
    for (var i = 1; i < cl.length; i++) ret.push(cl[i - 1] !== 0 ? cl[i] / cl[i - 1] - 1 : null);
    var rollStd = rollingStd(ret, lookback);
    var atr14 = calcATR(candles, 14);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      var atrPct = (i > 0 && cl[i - 1] !== 0) ? atr14[i] / cl[i - 1] : null;
      if (ret[i] === null || rollStd[i] === null || atrPct === null) { out.push(null); continue; }
      var rAbs = Math.abs(ret[i]);
      out.push(rAbs > spikeStdMult * rollStd[i] && rAbs > atrMult * atrPct);
    }
    return out;
  }

  function calcStabilityScore(candles, lookback) {
    lookback = lookback || 10;
    var cl = closes(candles);
    if (cl.length < lookback + 1) return 0;
    var rets = [];
    for (var i = cl.length - lookback; i < cl.length; i++) {
      if (cl[i - 1] === 0) return 0;
      rets.push(cl[i] / cl[i - 1] - 1);
    }
    var meanRet = 0;
    for (var i = 0; i < rets.length; i++) meanRet += rets[i];
    meanRet /= rets.length;
    var stdRet = 0;
    for (var i = 0; i < rets.length; i++) stdRet += Math.pow(rets[i] - meanRet, 2);
    stdRet = Math.sqrt(stdRet / (rets.length - 1));
    if (stdRet === 0) return 1;
    if (meanRet <= 0) return 0;
    var posFrac = 0;
    for (var i = 0; i < rets.length; i++) if (rets[i] > 0) posFrac++;
    posFrac /= rets.length;
    var cv = stdRet / meanRet;
    var cvScore = Math.max(0, 1 - cv / 2);
    var score = 0.6 * posFrac + 0.4 * cvScore;
    return round(Math.max(0, Math.min(1, score)), 2);
  }

  /* ── Spike/Stability Guard (hybrid of our volatility-adaptive detection + spec 11.1) ──
     Daily-only, once per session. todaySpike = our latest-bar spike (2.5x rolling-std
     AND 2.5x ATR%) OR the spec's open-gap trigger (|gap| > max(3.5, 1.5 x ATR%)).
     dominanceRatio = largest single-day |move| / |net 5-day move| (1.0 if net < 0.5%).
     efficiencyRatio10 = KAMA efficiency ratio, n=10 (net move / total path length). */
  function computeSpikeGuard(candles) {
    var guard = { todaySpike: false, sessionReturnPct: null, gapPct: null, dominanceRatio: null, efficiencyRatio10: null };
    try {
      if (!candles || candles.length < 12) return guard;
      var cl = closes(candles);
      var L = cl.length;
      var cLast = cl[L - 1], cPrev = cl[L - 2];
      if (cPrev === 0) return guard;
      var atr14 = calcATR(candles, 14);
      var atrVal = atr14 && atr14[atr14.length - 1] != null ? atr14[atr14.length - 1] : 0;
      var atrPct = atrVal > 0 ? atrVal / cPrev * 100 : 0;

      var sessionReturnPct = (cLast - cPrev) / cPrev * 100;
      var openLast = opens(candles)[L - 1];
      var gapPct = openLast != null ? (openLast - cPrev) / cPrev * 100 : 0;
      guard.sessionReturnPct = round(sessionReturnPct, 2);
      guard.gapPct = round(gapPct, 2);

      var spikeArr = calcDetectSpike(candles, 20, 2.5, 2.5);
      var latestSpike = false;
      if (spikeArr && spikeArr.length) {
        for (var i = spikeArr.length - 1; i >= 0; i--) { if (spikeArr[i] === true || spikeArr[i] === false) { latestSpike = spikeArr[i] === true; break; } }
      }
      var gapSpike = Math.abs(gapPct) > Math.max(3.5, 1.5 * atrPct);
      guard.todaySpike = latestSpike || gapSpike;

      var nWindow = 5;
      if (L >= nWindow + 1) {
        var largest = 0, pctCh;
        for (var i = L - nWindow; i < L; i++) {
          pctCh = cl[i - 1] !== 0 ? (cl[i] - cl[i - 1]) / cl[i - 1] * 100 : 0;
          if (Math.abs(pctCh) > largest) largest = Math.abs(pctCh);
        }
        var net5 = cl[L - 1 - nWindow] !== 0 ? (cLast - cl[L - 1 - nWindow]) / cl[L - 1 - nWindow] * 100 : 0;
        guard.dominanceRatio = Math.abs(net5) < 0.5 ? 1 : round(largest / Math.abs(net5), 2);
      }

      var erN = 10;
      if (L >= erN + 1) {
        var direction = Math.abs(cLast - cl[L - 1 - erN]);
        var volat = 0;
        for (var i = L - erN; i < L; i++) volat += Math.abs(cl[i] - cl[i - 1]);
        guard.efficiencyRatio10 = volat > 0 ? round(direction / volat, 3) : 0;
      }
    } catch (e) {}
    return guard;
  }
  /* --------------------------------------------------------------------------
     Compute all indicators at once
     -------------------------------------------------------------------------- */

  function computeAll(candles) {
    if (!candles || candles.length < 5) return null;

    var macd = calcMACD(candles);
    var bb = calcBollingerBands(candles);
    var ich = calcIchimoku(candles);
    var dc = calcDonchianChannels(candles);
    var kc = calcKeltnerChannels(candles);
    var stochRSI = calcStochasticRSI(candles);
    var supertrendArr = calcSuperTrend(candles);
    var squeezeMom = calcSqueezeMomentum(candles);
    var smc = calcSmartMoney(candles);
    var kvoResult = calcKVO(candles);
    var chandelierRes = calcChandelierExit(candles);
    var haRes = calcHeikinAshi(candles);
    var vx = calcVortex(candles);
    var ar = calcAroon(candles);
    var adxResult = calcADX(candles);

    function last(arr) {
      if (!arr) return null;
      for (var i = arr.length - 1; i >= 0; i--) { if (arr[i] !== null && arr[i] !== undefined) return arr[i]; }
      return null;
    }

    function lastObj(obj) {
      var out = {};
      if (!obj) return out;
      for (var key in obj) {
        if (obj.hasOwnProperty(key) && Array.isArray(obj[key])) out[key] = last(obj[key]);
      }
      return out;
    }

    var cl = closes(candles);
    var lastClose = last(cl);
    var li = haRes.close.length - 1;

    return {
      sma_20: last(calcSMA(candles, 20)), sma_50: last(calcSMA(candles, 50)), sma_200: candles.length >= 200 ? last(calcSMA(candles, 200)) : null,
      ema_9: last(calcEMA(candles, 9)), ema_21: last(calcEMA(candles, 21)), ema_50: last(calcEMA(candles, 50)),
      wma_20: last(calcWMA(candles, 20)), hma_20: last(calcHMA(candles, 20)), kama_10: last(calcKAMA(candles, 10)),
      vwap: last(calcVWAP(candles)), roll_vwap_adj: last(calcRollingVWAP(candles, 10)),
      pct_from_126d_high: last(calcPctFrom126dHigh(candles)), pct_from_126d_low: last(calcPctFrom126dLow(candles)),
      pct_from_52w_high: last(calcPctFrom52wHigh(candles)), pct_from_52w_low: last(calcPctFrom52wLow(candles)),
      session_vwap: last(calcSessionVWAP(candles)),
      psar: last(calcParabolicSAR(candles)),
      heikinAshi: { open: haRes.open[li], high: haRes.high[li], low: haRes.low[li], close: haRes.close[li], trend: haRes.trend[li] },
      chandelier: lastObj(chandelierRes),
      beta_nifty: null, rs_vs_nifty: null,
      atr_14: last(calcATR(candles, 14)),
      adx_14: last(adxResult ? adxResult.adx : null), plusDI: last(adxResult ? adxResult.plusDI : null), minusDI: last(adxResult ? adxResult.minusDI : null),
      supertrend: last(supertrendArr),
      vortex: lastObj(vx),
      aroon: lastObj(ar),
      ichimoku: lastObj(ich), macd: lastObj(macd),
      tsi: last(calcTSI(candles)), stc: last(calcSTC(candles)),
      awesomeOsc: last(calcAwesomeOscillator(candles)),
      rsi_14: last(calcRSI(candles, 14)), stochRSI: lastObj(stochRSI), williamsR: last(calcWilliamsR(candles)),
      cci_20: last(calcCCI(candles, 20)), roc_12: last(calcROC(candles, 12)), momentum_10: last(calcMomentum(candles, 10)),
      mfi_14: last(calcMFI(candles, 14)), cmf_20: last(calcCMF(candles, 20)), forceIndex: last(calcForceIndex(candles)),
      obv: last(calcOBV(candles)), pvt: last(calcPVT(candles)),
      kvo: last(kvoResult.line), kvoSignal: last(kvoResult.signal),
      anchored_vwap: last(calcAnchoredVWAP(candles)),
      volumeProfile: calcVolumeProfile(candles),
      ttmSqueeze: last(squeezeMom.squeeze), squeezeMomentum: last(squeezeMom.values),
      accumDist: last(calcAccumDistComposite(candles)),
      bb: lastObj(bb), keltner: lastObj(kc), donchian: lastObj(dc),
      darvasBox: calcDarvasBox(candles), fibonacci: calcFibonacci(candles), pivotPoints: calcPivotPoints(candles),
      fractals: calcWilliamsFractals(candles), zigZag: calcZigZag(candles),
      choppiness: last(calcChoppinessIndex(candles)),
      spike: last(calcDetectSpike(candles)), stabilityScore: calcStabilityScore(candles),
      smartMoney: smc, mtfAlignment: last(calcMTFAlignment(candles)),
      week52HL: last(calcWeek52HL(candles)), lastClose: lastClose
    };
  }

  function computeAllWithIndex(candles, indexCandles) {
    var base = computeAll(candles);
    if (!base) return null;
    if (indexCandles && indexCandles.length > 10) {
      base.rs_vs_nifty = calcRelativeStrength(candles, indexCandles);
      base.beta_nifty = last(calcBeta(candles, indexCandles));
    }
    return base;
  }

  function interpret(ind) {
    if (!ind) return {};
    var signals = {};
    var lc = ind.lastClose;
    signals.sma_20 = ind.sma_20 != null ? (lc > ind.sma_20 ? 'bullish' : 'bearish') : null;
    signals.sma_50 = ind.sma_50 != null ? (lc > ind.sma_50 ? 'bullish' : 'bearish') : null;
    signals.sma_200 = ind.sma_200 != null ? (lc > ind.sma_200 ? 'bullish' : 'bearish') : null;
    signals.ema_9 = ind.ema_9 != null ? (lc > ind.ema_9 ? 'bullish' : 'bearish') : null;
    signals.ema_21 = ind.ema_21 != null ? (lc > ind.ema_21 ? 'bullish' : 'bearish') : null;
    signals.ema_50 = ind.ema_50 != null ? (lc > ind.ema_50 ? 'bullish' : 'bearish') : null;
    signals.wma_20 = ind.wma_20 != null ? (lc > ind.wma_20 ? 'bullish' : 'bearish') : null;
    signals.vwap = ind.vwap != null ? (lc > ind.vwap ? 'bullish' : 'bearish') : null;
    signals.rsi_14 = ind.rsi_14 > 70 ? 'overbought' : ind.rsi_14 < 30 ? 'oversold' : 'neutral';
    if (ind.macd && ind.macd.histogram !== null) signals.macd = ind.macd.histogram > 0 ? 'bullish' : 'bearish';
    if (ind.bb && ind.bb.upper && ind.bb.lower) signals.bb = lc > ind.bb.upper ? 'overbought' : lc < ind.bb.lower ? 'oversold' : 'neutral';
    if (ind.stochRSI && ind.stochRSI.k !== null) signals.stochRSI = ind.stochRSI.k > 80 ? 'overbought' : ind.stochRSI.k < 20 ? 'oversold' : 'neutral';
    if (ind.adx_14 !== null) signals.adx = ind.adx_14 > 25 ? 'trending' : 'ranging';
    if (ind.supertrend !== null) signals.supertrend = lc > ind.supertrend ? 'bullish' : 'bearish';
    if (ind.cci_20 !== null) signals.cci = ind.cci_20 > 100 ? 'overbought' : ind.cci_20 < -100 ? 'oversold' : 'neutral';
    if (ind.psar !== null) signals.psar = lc > ind.psar ? 'bullish' : 'bearish';
    if (ind.ichimoku && ind.ichimoku.tenkan !== null && ind.ichimoku.kijun !== null) signals.ichimoku = ind.ichimoku.tenkan > ind.ichimoku.kijun ? 'bullish' : 'bearish';
    if (ind.keltner && ind.keltner.upper && ind.keltner.lower) signals.keltner = lc > ind.keltner.upper ? 'overbought' : lc < ind.keltner.lower ? 'oversold' : 'neutral';
    if (ind.donchian && ind.donchian.upper && ind.donchian.lower) signals.donchian = lc >= ind.donchian.upper ? 'bullish' : lc <= ind.donchian.lower ? 'bearish' : 'neutral';
    if (ind.hma_20 !== null) signals.hma_20 = lc > ind.hma_20 ? 'bullish' : 'bearish';
    if (ind.kama_10 !== null) signals.kama_10 = lc > ind.kama_10 ? 'bullish' : 'bearish';
    if (ind.tsi !== null) signals.tsi = ind.tsi > 0 ? 'bullish' : 'bearish';
    if (ind.stc !== null) signals.stc = ind.stc > 50 ? 'bullish' : 'bearish';
    if (ind.mfi_14 !== null) signals.mfi_14 = ind.mfi_14 > 80 ? 'overbought' : ind.mfi_14 < 20 ? 'oversold' : 'neutral';
    if (ind.roc_12 !== null) signals.roc_12 = ind.roc_12 > 0 ? 'bullish' : 'bearish';
    if (ind.momentum_10 !== null) signals.momentum_10 = ind.momentum_10 > 0 ? 'bullish' : 'bearish';
    if (ind.kvo !== null) signals.kvo = ind.kvo > 0 ? 'bullish' : 'bearish';
    if (ind.ttmSqueeze !== null) signals.ttmSqueeze = ind.ttmSqueeze ? 'oversold' : 'neutral';
    if (ind.squeezeMomentum !== null) signals.squeezeMomentum = ind.squeezeMomentum > 0 ? 'bullish' : 'bearish';
    if (ind.darvasBox) signals.darvasBox = ind.darvasBox.breakout === 'up' ? 'bullish' : ind.darvasBox.breakout === 'down' ? 'bearish' : 'neutral';
    if (ind.smartMoney) signals.smartMoney = ind.smartMoney.bos === 'bullish_bos' || ind.smartMoney.choch === 'bullish_choch' ? 'bullish' : ind.smartMoney.bos === 'bearish_bos' || ind.smartMoney.choch === 'bearish_choch' ? 'bearish' : 'neutral';
    if (ind.mtfAlignment !== null) signals.mtfAlignment = ind.mtfAlignment >= 70 ? 'bullish' : ind.mtfAlignment <= 30 ? 'bearish' : 'neutral';
    if (ind.week52HL) signals.week52HL = ind.week52HL.pctFromHigh > -5 ? 'bullish' : ind.week52HL.pctFromHigh > -15 ? 'neutral' : 'bearish';
    if (ind.chandelier && ind.chandelier.long != null) signals.chandelier = lc > ind.chandelier.long ? 'bullish' : 'bearish';
    if (ind.heikinAshi) signals.heikinAshi = ind.heikinAshi.trend === 'bullish' ? 'bullish' : ind.heikinAshi.trend === 'bearish' ? 'bearish' : 'neutral';
    if (ind.choppiness != null) signals.choppiness = ind.choppiness < 38.2 ? 'trending' : ind.choppiness > 61.8 ? 'ranging' : 'neutral';
    if (ind.williamsR != null) signals.williamsR = ind.williamsR > -20 ? 'overbought' : ind.williamsR < -80 ? 'oversold' : 'neutral';
    if (ind.awesomeOsc != null) signals.awesomeOsc = ind.awesomeOsc > 0 ? 'bullish' : 'bearish';
    if (ind.forceIndex != null) signals.forceIndex = ind.forceIndex > 0 ? 'bullish' : 'bearish';
    if (ind.aroon && ind.aroon.osc != null) signals.aroon = ind.aroon.osc > 50 ? 'bullish' : ind.aroon.osc < -50 ? 'bearish' : 'neutral';
    if (ind.vortex && ind.vortex.plus != null && ind.vortex.minus != null) signals.vortex = ind.vortex.plus > ind.vortex.minus ? 'bullish' : 'bearish';
    if (ind.rs_vs_nifty && ind.rs_vs_nifty.mansfield != null) signals.rs_vs_nifty = ind.rs_vs_nifty.mansfield > 0 ? 'bullish' : 'bearish';
    if (ind.beta_nifty != null) signals.beta_nifty = ind.beta_nifty > 1.2 ? 'overbought' : ind.beta_nifty < 0.5 ? 'oversold' : 'neutral';
    if (ind.accumDist != null) signals.accumDist = ind.accumDist === 'ACCUMULATION' ? 'bullish' : ind.accumDist === 'DISTRIBUTION' ? 'bearish' : 'neutral';
    var bullCount = 0, bearCount = 0, total = 0;
    Object.keys(signals).forEach(function (k) { if (!signals[k]) return; total++; if (signals[k] === 'bullish' || signals[k] === 'oversold') bullCount++; if (signals[k] === 'bearish' || signals[k] === 'overbought') bearCount++; });
    signals._overall = total > 0 ? (bullCount > bearCount ? 'bullish' : bearCount > bullCount ? 'bearish' : 'neutral') : null;
    signals._score = { bull: bullCount, bear: bearCount, neutral: total - bullCount - bearCount, total: total };
    return signals;
  }

  /* --------------------------------------------------------------------------
     Scoring functions
     -------------------------------------------------------------------------- */

  function computeExitScore(candles, position, indexCandles) {
    if (!candles || candles.length < 50) return { exit_score: null, reason: 'insufficient_data' };
    position = position || {};

    var sn = buildTFSnapshot(candles, indexCandles);
    if (!sn || sn.c === null) return { exit_score: null, reason: 'insufficient_data' };

    var comps = scoreExitComponentsForTF(sn, position);
    var trendBD = Math.min(comps.tf1a + comps.tf1b + comps.tf1c, 25);
    var momExh = Math.min(comps.tf2a + comps.tf2b + comps.tf2c, 25);
    var volDist = Math.min(comps.tf3a + comps.tf3b + comps.tf3c, 25);
    var strucBD = Math.min(comps.tf4a + comps.tf4b + comps.tf4c, 25);
    var rawTotal = trendBD + momExh + volDist + strucBD;

    var idxEntryScoreVal = null;
    try { if (indexCandles && indexCandles.length >= 50) { var idxEntryRes = computeEntryScore(indexCandles); if (idxEntryRes && idxEntryRes.entry_score != null) idxEntryScoreVal = idxEntryRes.entry_score; } } catch(e) {}
    var guard = computeSpikeGuard(candles);
    var ctx = { indexTrendScore: idxEntryScoreVal, entryPrice: position.entry_price || sn.c, currentPrice: sn.c, holdingDays: position.holding_days || 0, entryScore: position.entry_score != null ? position.entry_score : 50, guard: guard };

    var penaltyItems = buildExitPenaltyItems(sn, ctx);
    var bonusItems = buildExitBonusItems(sn, ctx);
    var penalties = 0, bonuses = 0;
    penaltyItems.forEach(function(it) { penalties += it.amount; });
    bonusItems.forEach(function(it) { bonuses += it.amount; });
    var finalScore = Math.max(0, Math.min(100, rawTotal + penalties + bonuses));

    var cls = classifyExitScore(finalScore);
    return {
      exit_score: round(finalScore, 1),
      raw_score: round(rawTotal, 1),
      trend_breakdown: round(trendBD, 1), momentum_exhaustion: round(momExh, 1),
      volume_distribution: round(volDist, 1), structure_breakdown: round(strucBD, 1),
      penalties: round(penalties, 1), bonuses: round(bonuses, 1),
      penalty_items: penaltyItems, bonus_items: bonusItems,
      classification: cls.classification, signal: cls.signal, action: cls.action,
      todaySpike: guard.todaySpike, sessionReturnPct: guard.sessionReturnPct, gapPct: guard.gapPct,
      dominanceRatio: guard.dominanceRatio, efficiencyRatio10: guard.efficiencyRatio10,
      stabilityScore: round(sn.stabilityScore, 2), rsi14: round(sn.rsi14, 1), distDayRatio: round(sn.distDayRatio, 2),
      details: {
        maBreakdown: round(comps.tf1a, 2), macdTsiStcAoExit: round(comps.tf1b, 2), adxStPsarViAroonExit: round(comps.tf1c, 2),
        rsiStochRsiWillrExit: round(comps.tf2a, 2), cciRocMomFiExit: round(comps.tf2b, 2), mfiCmfExit: round(comps.tf2c, 2),
        obvPvtKvoFiExit: round(comps.tf3a, 2), vwapAvwapExit: round(comps.tf3b, 2), squeezeDistExit: round(comps.tf3c, 2),
        bbKcDcChandelierExit: round(comps.tf4a, 2), ichimokuExit: round(comps.tf4b, 2), darvasStructureExit: round(comps.tf4c, 2)
      }
    };
  }

  function classifyExitScore(s) {
    if (s >= 85) return { classification: 'URGENT_EXIT', signal: 'URGENT_EXIT', action: 'Full exit immediately' };
    if (s >= 70) return { classification: 'EXIT', signal: 'EXIT', action: 'Full exit at current price or next bar open' };
    if (s >= 55) return { classification: 'PARTIAL_EXIT', signal: 'PARTIAL_EXIT', action: 'Exit 50%, tighten trailing stop to 1.5x ATR' };
    if (s >= 40) return { classification: 'TIGHTEN_STOP', signal: 'TIGHTEN_STOP', action: 'Move stop to breakeven or 1x ATR below current' };
    if (s >= 25) return { classification: 'MONITOR', signal: 'MONITOR', action: 'No action — watch for escalation next bar' };
    return { classification: 'HOLD', signal: 'HOLD', action: 'All conditions intact — continue holding' };
  }

  /* ── 12.1a Trend Breakdown (7 pts) — MA crosses + stack collapse ── */
  function scoreExitTrendBreakdown(sn) {
    var s = 0, c = sn.c, pc = sn.pc;
    if (c < sn.ema9 && pc >= sn.ema9Prev) s += 1.5; else if (c < sn.ema9) s += 0.5;
    if (c < sn.ema21) s += 0.5;
    if (c < sn.ema50) s += 0.5;
    if (sn.sma200 !== null && c < sn.sma200) s += 0.5;
    if (sn.ema9 < sn.ema21) s += 0.5;
    if (sn.ema21 < sn.ema50) s += 0.5;
    if (sn.hma16 < sn.prevHma16) s += 0.5;
    if (sn.kama10 < sn.prevKama10) s += 0.5;
    if (c < sn.wma20) s += 0.5;
    if (sn.sma20 < sn.sma50) s += 0.5;
    if (sn.rsMansfield !== null && sn.rsMansfieldPrev !== null && sn.rsMansfield < 0 && sn.rsMansfield < sn.rsMansfieldPrev) s += 1.0;
    if (sn.haClose < sn.prevHaClose && c < sn.sma20) s += 0.5;
    return Math.min(s, 7);
  }

  /* ── 12.1b MACD + TSI + STC + AO Rollover (9 pts) ── */
  function scoreExitMacdTsiStcAo(sn) {
    var s = 0;
    if (sn.macdL !== null && sn.sigL !== null && sn.macdPrev !== null && sn.sigPrev !== null) {
      if (sn.macdL < sn.sigL && sn.macdPrev >= sn.sigPrev) s += 2.0; else if (sn.macdL < sn.sigL) s += 1.0;
    }
    if (sn.macdL !== null && sn.macdPrev !== null && sn.macdL < 0 && sn.macdPrev >= 0) s += 1.0;
    if (sn.histL !== null && sn.histPrev !== null && sn.histL < 0 && sn.histL < sn.histPrev) s += 0.5;
    if (sn.tsiL !== null && sn.tsiPrev !== null && sn.tsiL < 0 && sn.tsiPrev >= 0) s += 1.0; else if (sn.tsiL !== null && sn.tsiL < 0) s += 0.5;
    if (sn.tsiL !== null && sn.tsiPrev !== null && sn.tsiL < sn.tsiPrev) s += 0.5;
    if (sn.stcL !== null && sn.stcL < 25) s += 0.5;
    if (sn.stcL !== null && sn.stcPrev !== null && sn.stcL < sn.stcPrev && sn.stcL < 75) s += 0.5;
    if (sn.aoL !== null && sn.aoPrev !== null && sn.aoL < 0 && sn.aoPrev >= 0) s += 1.0; else if (sn.aoL !== null && sn.aoL < 0) s += 0.5;
    if (sn.aoL !== null && sn.aoPrev !== null && sn.aoL < sn.aoPrev) s += 0.5;
    return Math.min(s, 9);
  }

  /* ── 12.1c ADX + Supertrend + PSAR + Vortex + Aroon Breakdown (9 pts) ── */
  function scoreExitAdxSupertrendPsarViAroon(sn) {
    var s = 0;
    if (sn.adxL !== null && sn.adxPrev !== null) { if (sn.adxL < sn.adxPrev && sn.adxL < 25) s += 1.5; else if (sn.adxL < sn.adxPrev) s += 0.5; }
    if (sn.minusDI !== null && sn.plusDI !== null && sn.minusDIPrev !== null && sn.plusDIPrev !== null && sn.minusDI > sn.plusDI && sn.minusDIPrev <= sn.plusDIPrev) s += 1.5;
    if (sn.stL !== null && sn.c < sn.stL) s += 1.0;
    if (sn.stL !== null && sn.stPrev !== null && sn.pc !== null && sn.pc >= sn.stPrev && sn.c < sn.stL) s += 0.5;
    if (sn.psar !== null && sn.c < sn.psar) s += 0.5;
    if (sn.psar !== null && sn.psarPrev !== null && sn.pc !== null && sn.pc >= sn.psarPrev && sn.c < sn.psar) s += 0.5;
    if (sn.viMinus !== null && sn.viPlus !== null && sn.viMinusPrev !== null && sn.viPlusPrev !== null && sn.viMinus > sn.viPlus && sn.viMinusPrev <= sn.viPlusPrev) s += 1.0;
    else if (sn.viMinus !== null && sn.viPlus !== null && sn.viMinus > sn.viPlus) s += 0.5;
    if (sn.aroonOsc !== null) { if (sn.aroonOsc < -50) s += 1.0; else if (sn.aroonOsc < 0) s += 0.5; }
    if (sn.aroonOsc !== null && sn.aroonOscPrev !== null && sn.aroonOsc < sn.aroonOscPrev) s += 0.5;
    return Math.min(s, 9);
  }

  /* ── 13.1 RSI + StochRSI + Williams %R Exhaustion (10 pts) ── */
  function scoreExitRsiStochRsiWillr(sn) {
    var s = 0;
    if (sn.rsi14 !== null) { if (sn.rsi14 > 80) s += 2.0; else if (sn.rsi14 > 70) s += 1.0; }
    if (sn.rsi14 !== null && sn.rsi14Prev !== null && sn.rsi14 < sn.rsi14Prev && sn.rsi14Prev > 70) s += 1.0;
    if (sn.rsi14 !== null && sn.rsi14Prev !== null && sn.rsi14 < 50 && sn.rsi14Prev >= 50) s += 0.5;
    if (sn.stochRsiK !== null && sn.stochRsiD !== null && sn.stochRsiKPrev !== null && sn.stochRsiDPrev !== null && sn.stochRsiK < sn.stochRsiD && sn.stochRsiKPrev >= sn.stochRsiDPrev) s += 1.5;
    else if (sn.stochRsiK !== null && sn.stochRsiD !== null && sn.stochRsiK < sn.stochRsiD) s += 0.5;
    /* StochRSI < 20 is oversold (bullish), not exhaustion — removed inverted logic */
    if (sn.willr !== null && sn.willr < -80) s += 1.0;
    if (sn.willr !== null && sn.willrPrev !== null && sn.willr < -50 && sn.willrPrev >= -50) s += 1.0;
    if (sn.willr !== null && sn.willrPrev !== null && sn.willr < sn.willrPrev && sn.willr < -50) s += 0.5;
    return Math.min(s, 10);
  }

  /* ── 13.2 CCI + ROC + Momentum + Force Index Reversal (8 pts) ── */
  function scoreExitCciRocMomFi(sn) {
    var s = 0;
    if (sn.cci20 !== null) { if (sn.cci20 > 200) s += 1.0; else if (sn.cci20 > 100) s += 0.5; }
    if (sn.cci20 !== null && sn.cci20Prev !== null && sn.cci20 < sn.cci20Prev && sn.cci20Prev > 100) s += 1.0;
    if (sn.cci20 !== null && sn.cci20Prev !== null && sn.cci20 < 0 && sn.cci20Prev >= 0) s += 0.5;
    if (sn.roc12 !== null && sn.roc12Prev !== null && sn.roc12 < 0 && sn.roc12Prev >= 0) s += 1.0; else if (sn.roc12 !== null && sn.roc12 < 0) s += 0.5;
    if (sn.mom10 !== null && sn.mom10Prev !== null && sn.mom10 < 0 && sn.mom10Prev >= 0) s += 1.0; else if (sn.mom10 !== null && sn.mom10 < 0) s += 0.5;
    if (sn.fi13 !== null && sn.fi13Prev !== null && sn.fi13 < 0 && sn.fi13Prev >= 0) s += 1.0; else if (sn.fi13 !== null && sn.fi13 < 0) s += 0.5;
    if (sn.fi13 !== null && sn.fi13Prev !== null && sn.fi13 < sn.fi13Prev && sn.fi13 < 0) s += 0.5;
    return Math.min(s, 8);
  }

  /* ── 13.3 MFI + CMF Outflow (7 pts) ── */
  function scoreExitMfiCmf(sn) {
    var s = 0;
    if (sn.mfi14 !== null) { if (sn.mfi14 > 80) s += 2.0; else if (sn.mfi14 > 70) s += 1.0; }
    if (sn.mfi14 !== null && sn.mfi14Prev !== null && sn.mfi14 < sn.mfi14Prev && sn.mfi14Prev > 70) s += 1.0;
    if (sn.mfi14 !== null && sn.mfi14Prev !== null && sn.mfi14 < 50 && sn.mfi14Prev >= 50) s += 0.5;
    /* MFI < 30 is oversold (bullish), not exit signal — removed inverted logic */
    if (sn.cmf20 !== null) { if (sn.cmf20 < -0.05) s += 2.0; else if (sn.cmf20 < 0) s += 1.0; }
    if (sn.cmf20 !== null && sn.cmf20Prev !== null && sn.cmf20 < sn.cmf20Prev && sn.cmf20 < 0) s += 0.5;
    return Math.min(s, 7);
  }

  /* ── 14.1 OBV + PVT + KVO + Force Index Decline (9 pts) ── */
  function scoreExitObvPvtKvoFi(sn) {
    var s = 0;
    if (sn.obv !== null && sn.obvSma20 !== null && sn.obv < sn.obvSma20) s += 1.0;
    if (sn.obvSlopeVal !== null && sn.obvSlopePrev !== null && sn.obvSlopeVal < 0 && sn.obvSlopePrev > 0) s += 0.5;
    else if (sn.obvSlopeVal !== null && sn.obvSlopeVal < 0) s += 0.5;
    if (sn.pvt !== null && sn.pvtSma20 !== null && sn.pvt < sn.pvtSma20) s += 1.0;
    if (sn.pvtSlopeVal !== null && sn.pvtSlopeVal < 0) s += 0.5;
    if (sn.kvoL !== null && sn.kvoSig !== null && sn.kvoPrev !== null && sn.kvoSigPrev !== null && sn.kvoL < sn.kvoSig && sn.kvoPrev >= sn.kvoSigPrev) s += 1.5;
    else if (sn.kvoL !== null && sn.kvoSig !== null && sn.kvoL < sn.kvoSig) s += 0.5;
    if (sn.kvoL !== null && sn.kvoL < 0) s += 0.5;
    if (sn.fi13 !== null && sn.fi13 < 0) s += 1.0;
    if (sn.fi13 !== null && sn.fi13Prev !== null && sn.fi13 < sn.fi13Prev && sn.fi13 < 0) s += 0.5;
    return Math.min(s, 9);
  }

  /* ── 14.2 VWAP + Anchored VWAP Break (7 pts) ── */
  function scoreExitVwapAvwap(sn) {
    var s = 0;
    if (sn.c < sn.vwap10 && sn.prevVwap10 !== null && sn.pc >= sn.prevVwap10) s += 2.0;
    else if (sn.c < sn.vwap10) { var pct = (sn.vwap10 - sn.c) / sn.vwap10 * 100; if (pct > 2.0) s += 1.5; else if (pct > 1.0) s += 1.0; else s += 0.5; }
    if (sn.vwap10 !== null && sn.prevVwap10 !== null && sn.vwap10 < sn.prevVwap10) s += 0.5;
    if (sn.c < sn.anchoredVwap) s += 1.5;
    if (sn.anchoredVwap !== null && sn.prevAnchoredVwap !== null && sn.anchoredVwap < sn.prevAnchoredVwap) s += 0.5;
    if (sn.c < sn.vwap10 && sn.c < sn.anchoredVwap) s += 1.0;
    return Math.min(s, 7);
  }

  /* ── 14.3 TTM Squeeze + Distribution Confirmation (9 pts) ── */
  function scoreExitSqueezeDist(sn) {
    var s = 0;
    if (sn.squeezeMomVal !== null && sn.squeezeMomPrev !== null && sn.squeezeMomVal < 0 && sn.squeezeMomPrev >= 0) s += 2.5;
    else if (sn.squeezeMomVal !== null && sn.squeezeMomVal < 0) s += 1.5;
    if (sn.squeezeMomVal !== null && sn.squeezeMomPrev !== null && sn.squeezeMomVal < sn.squeezeMomPrev && sn.squeezeMomVal < 0) s += 1.0;
    if (sn.squeezeOn && sn.squeezeMomVal < 0) s += 1.0;
    if (sn.distDayRatio >= 0.6) s += 2.5; else if (sn.distDayRatio >= 0.4) s += 1.5;
    if (sn.distDayRatio > sn.prevDistDayRatio) s += 1.0;
    return Math.min(s, 9);
  }

  /* ── 15.1 BB + KC + DC + Chandelier Breakdown (9 pts) ── */
  function scoreExitBbKcDcChandelier(sn) {
    var s = 0;
    if (sn.c < sn.bbMid && sn.bbMidPrev !== null && sn.pc >= sn.bbMidPrev) s += 2.0; else if (sn.c < sn.bbMid) s += 0.5;
    if (sn.c < sn.bbLower) s += 1.0;
    if (sn.bbWidthPrev !== null && sn.bbWidth > sn.bbWidthPrev && sn.c < sn.bbMid) s += 0.5;
    if (sn.c < sn.kcMid && sn.kcMidPrev !== null && sn.pc >= sn.kcMidPrev) s += 1.0; else if (sn.c < sn.kcMid) s += 0.5;
    if (sn.c <= sn.dcLower * 1.01) s += 1.0;
    if (sn.chandelierLong !== null && sn.c < sn.chandelierLong) s += 1.0;
    if (sn.chandelierLong !== null && sn.chandelierLongPrev !== null && sn.chandelierLong < sn.chandelierLongPrev) s += 0.5;
    if (sn.atr14 !== null && sn.c > 0) { var atrPct = sn.atr14 / sn.c * 100; if (atrPct > 5.0) s += 0.5; }
    return Math.min(s, 9);
  }

  /* ── 15.2 Ichimoku Bearish Flip (6 pts) ── */
  function scoreExitIchimoku(sn) {
    var s = 0;
    if (sn.senkouA !== null && sn.senkouB !== null) {
      var cloudBottom = Math.min(sn.senkouA, sn.senkouB);
      if (sn.c < cloudBottom) s += 2.0; else if (sn.c < Math.max(sn.senkouA, sn.senkouB)) s += 0.5;
    }
    if (sn.tenkan !== null && sn.kijun !== null && sn.tenkanPrev !== null && sn.kijunPrev !== null && sn.tenkan < sn.kijun && sn.tenkanPrev >= sn.kijunPrev) s += 1.5;
    else if (sn.tenkan !== null && sn.kijun !== null && sn.tenkan < sn.kijun) s += 0.5;
    if (sn.senkouA !== null && sn.senkouB !== null && sn.senkouA < sn.senkouB) s += 0.5;
    if (sn.c < sn.pc) s += 0.5;
    if (sn.senkouA !== null && sn.senkouB !== null && sn.tenkan !== null && sn.kijun !== null && sn.c < Math.min(sn.senkouA, sn.senkouB) && sn.tenkan < sn.kijun && sn.senkouA < sn.senkouB) s += 0.5;
    return Math.min(s, 6);
  }

  /* ── 15.3 Darvas + HMA + KAMA + MTF + Fib + Pivot + Fractals Breakdown (10 pts) ── */
  function scoreExitDarvasStructure(sn, position) {
    var s = 0;
    var entryPrice = (position && position.entry_price) || sn.c;
    var currentPrice = sn.c;
    if (sn.darvasBottom !== null) { if (sn.c <= sn.darvasBottom) s += 2.0; else if (sn.darvasTop !== null && sn.c < (sn.darvasTop + sn.darvasBottom) / 2) s += 0.5; }
    /* HMA/KAMA declining already scored in tf1a (scoreExitTrendBreakdown) — not repeated here to avoid double-count */
    if (sn.c < sn.hma16 && sn.c < sn.kama10) s += 0.5;
    if (sn.mtfAlign !== null) { if (sn.mtfAlign < 40) s += 1.5; else if (sn.mtfAlign < 60) s += 0.5; }
    if (sn.mtfAlign !== null && sn.mtfAlignPrev !== null && sn.mtfAlign < sn.mtfAlignPrev) s += 0.5;
    if (sn.fibLevels && sn.fibLevels['0.618'] !== null && sn.c < sn.fibLevels['0.618']) s += 1.0;
    if (sn.fibLevels && sn.fibLevels['0.786'] !== null && sn.c < sn.fibLevels['0.786']) s += 0.5;
    if (sn.pivotS1 !== null && sn.c < sn.pivotS1) s += 0.5;
    if (sn.pivotS2 !== null && sn.c < sn.pivotS2) s += 0.5;
    if (sn.zigzagDirection === 'DOWN') s += 0.5;
    if (sn.chopIndex !== null && sn.prevChopIndex !== null && sn.chopIndex > sn.prevChopIndex && sn.chopIndex > 61.8) s += 0.5;
    if (sn.atr14 !== null && entryPrice > 0) {
      var stopLoss = entryPrice - sn.atr14 * 1.5;
      var target = entryPrice * 1.04;
      var risk = currentPrice - stopLoss;
      var reward = target - currentPrice;
      if (risk > 0 && reward > 0) { var rr = reward / risk; if (rr < 1.0) s += 1.5; else if (rr < 1.5) s += 0.5; }
      else if (risk <= 0) s += 1.5;
      else if (reward <= 0) s += 1.0;
    }
    return Math.min(s, 10);
  }

  function scoreExitComponentsForTF(sn, position) {
    return {
      tf1a: scoreExitTrendBreakdown(sn),
      tf1b: scoreExitMacdTsiStcAo(sn),
      tf1c: scoreExitAdxSupertrendPsarViAroon(sn),
      tf2a: scoreExitRsiStochRsiWillr(sn),
      tf2b: scoreExitCciRocMomFi(sn),
      tf2c: scoreExitMfiCmf(sn),
      tf3a: scoreExitObvPvtKvoFi(sn),
      tf3b: scoreExitVwapAvwap(sn),
      tf3c: scoreExitSqueezeDist(sn),
      tf4a: scoreExitBbKcDcChandelier(sn),
      tf4b: scoreExitIchimoku(sn),
      tf4c: scoreExitDarvasStructure(sn, position)
    };
  }

  /* ── Section 16 exit modifiers (index_trend_score driven) ── */
  function buildExitPenaltyItems(sn, ctx) {
    var items = [];
    var c = sn.c, pc = sn.pc, cl = sn.cl, vo = sn.vo, L = cl.length, L1 = L - 1;
    if (ctx.indexTrendScore !== null && ctx.indexTrendScore >= 65) items.push({ reason: "Index trend score >=65", amount: -8 });
    else if (sn.ema9 !== null && sn.ema21 !== null && sn.macdL !== null && sn.sigL !== null && sn.ema9 > sn.ema21 && sn.macdL > sn.sigL) items.push({ reason: "EMA9>EMA21 + MACD bullish", amount: -5 });
    var priceDecl3 = true;
    for (var i = L - 3; i < L; i++) { if (i > L - 3 && cl[i] >= cl[i - 1]) { priceDecl3 = false; break; } }
    var avgVol20 = 0;
    for (var i = L - 20; i < L; i++) avgVol20 += vo[i];
    avgVol20 /= 20;
    if (priceDecl3 && vo[L1] < 0.7 * avgVol20) items.push({ reason: "Price decline 3 + low volume", amount: -6 });
    if (sn.pivotS1 !== null && c > 0) { var distToSupport = (c - sn.pivotS1) / c; if (distToSupport < 0.015 && distToSupport >= 0) items.push({ reason: "Near support", amount: -5 }); }
    if (ctx.holdingDays < 3 && ctx.entryScore > 70) items.push({ reason: "Held <3 days + high entry score", amount: -5 });
    if (sn.fibLevels && sn.fibLevels['0.618'] !== null && sn.pivotP !== null && c > sn.fibLevels['0.618'] && c > sn.pivotP) items.push({ reason: "Above fib 0.618 + pivot", amount: -3 });
    return items;
  }

  function buildExitBonusItems(sn, ctx) {
    var items = [];
    var c = sn.c;
    if (ctx.indexTrendScore !== null && ctx.indexTrendScore < 35) items.push({ reason: "Index trend score <35", amount: 5 });
    if (sn.distDayRatio >= 0.6) items.push({ reason: "Distribution days >=60%", amount: 5 });
    if (ctx.entryPrice !== null && ctx.entryPrice > 0) { if (c < ctx.entryPrice * 0.97) items.push({ reason: "Price <97% entry", amount: 5 }); else if (c < ctx.entryPrice * 0.985) items.push({ reason: "Price <98.5% entry", amount: 3 }); }
    if (c < sn.hma16 && c < sn.ema9) items.push({ reason: "Daily+Hourly bearish", amount: 5 });
    if (sn.accumDistLabel === 'DISTRIBUTION' && sn.mtfAlign !== null && sn.mtfAlign < 40) items.push({ reason: "Distribution + MTF<40", amount: 3 });
    if (sn.beta !== null && sn.beta > 1.5 && ctx.indexTrendScore !== null && ctx.indexTrendScore < 40) items.push({ reason: "High beta + index trend <40", amount: 3 });
    if (c < sn.chandelierLong && sn.pivotS1 !== null && c < sn.pivotS1) items.push({ reason: "Below Chandelier + S1", amount: 3 });
    if (sn.kvoL !== null && sn.kvoSig !== null && sn.kvoPrev !== null && sn.kvoSigPrev !== null && sn.kvoL < sn.kvoSig && sn.kvoPrev >= sn.kvoSigPrev) items.push({ reason: "KVO bearish cross", amount: 3 });

    /* ── Spike/Stability Guard (exit side) — bonus only, gated to avoid double-counting:
         E1 golden-exit nudge: an up-spike while holding that carries us NEAR the 4% target.
            Near-target profit (entry-price based) is not measured by any pillar (12.x–15.x)
            or bonus (the only entry-price bonus, "Price <97% entry", is for losses), so it is
            genuinely additive; RSI exhaustion (13.1) is an independent momentum signal and
            stacks legitimately. Requires c >= 21-EMA so 12.x downtrend breakdowns are not
            active, and excludes profit >= 4% (the hard target rule already exits there).
            +5 at 3.0–4.0% profit, +3 at 2.0–3.0%.
         E2 stability collapse (whipsaw): only when distDayRatio < 0.6 (14.3 + the >=60%
            distribution bonus already cover heavy distribution) and today is not a spike day
            (E1 owns the single-session case).
         NOTE: no down-spike bonus — on a panic day 13.2 (ROC/Mom/FI), 14.1 (OBV/PVT/KVO)
            and 15.1 (BB/DC/Chandelier) already fire, so an extra bonus would double-count. */
    var guard = ctx.guard || null;
    if (guard && guard.todaySpike && guard.sessionReturnPct != null && guard.sessionReturnPct > 0 && c >= sn.ema21 && ctx.entryPrice != null && ctx.entryPrice > 0) {
      var profitPct = (c - ctx.entryPrice) / ctx.entryPrice * 100;
      if (profitPct >= 3.0 && profitPct < 4.0) items.push({ reason: "Golden exit opportunity (spike near 4% target)", amount: 5 });
      else if (profitPct >= 2.0 && profitPct < 3.0) items.push({ reason: "Spike toward 4% target", amount: 3 });
    }
    if (sn.stabilityScore != null && sn.stabilityScore < 0.35 && sn.distDayRatio < 0.6 && !(guard && guard.todaySpike)) items.push({ reason: "Erratic whipsaw \u2014 stability collapse", amount: 3 });
    return items;
  }

  /* ── helpers used by scoring ── */
  function last(arr) {
    if (!arr) return null;
    for (var i = arr.length - 1; i >= 0; i--) { if (arr[i] !== null && arr[i] !== undefined) return arr[i]; }
    return null;
  }
  function nthLast(arr, n) {
    if (!arr) return null; var found = 0;
    for (var i = arr.length - 1; i >= 0; i--) { if (arr[i] !== null && arr[i] !== undefined) { found++; if (found === n) return arr[i]; } }
    return null;
  }
  function hasCrossedAbove(series, ref) {
    for (var i = series.length - 1; i >= 1; i--) { if (series[i] !== null && ref[i] !== null && series[i - 1] !== null && ref[i - 1] !== null) { return series[i] > ref[i] && series[i - 1] <= ref[i - 1]; } }
    return false;
  }
  function justCrossedAbove(series, ref, lookback) {
    lookback = lookback || 3;
    for (var k = 0; k < lookback; k++) {
      var i = series.length - 1 - k;
      if (i <= 0) break;
      if (series[i] !== null && ref[i] !== null && series[i - 1] !== null && ref[i - 1] !== null) { if (series[i] > ref[i] && series[i - 1] <= ref[i - 1]) return true; }
    }
    return false;
  }
  function isCrossedAbove(val, prevVal, ref, prevRef) {
    return val > ref && prevVal <= prevRef;
  }
  function slope(arr, period) {
    period = period || 10;
    var n = arr.length; if (n < period) return null;
    var idx = [], vals = [];
    for (var i = n - period; i < n; i++) { if (arr[i] === null || arr[i] === undefined) return null; idx.push(i - (n - period)); vals.push(arr[i]); }
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var j = 0; j < period; j++) { sumX += j; sumY += vals[j]; sumXY += j * vals[j]; sumX2 += j * j; }
    var denom = period * sumX2 - sumX * sumX;
    return denom !== 0 ? (period * sumXY - sumX * sumY) / denom : 0;
  }

  /* ── shared entry-score helpers (spec Sections 7-11) ── */
  function lastVals(arr, count) {
    var out = [];
    if (!arr) return out;
    for (var i = arr.length - 1; i >= 0 && out.length < count; i--) {
      if (arr[i] !== null && arr[i] !== undefined) out.push(arr[i]);
    }
    return out;
  }
  function classifyScore(s) {
    var t = SCORE_CONFIG.classification;
    if (s >= t.strongBuy) return { classification: 'STRONG_BUY', signal: 'STRONG_BUY', allocation_pct: 100 };
    if (s >= t.buy) return { classification: 'BUY', signal: 'BUY', allocation_pct: 70 };
    if (s >= t.watchlist) return { classification: 'WATCHLIST', signal: 'WATCHLIST', allocation_pct: 40 };
    if (s >= t.neutral) return { classification: 'NEUTRAL', signal: 'NEUTRAL', allocation_pct: 0 };
    return { classification: 'AVOID', signal: 'AVOID', allocation_pct: 0 };
  }
  function computeIndexTrendScore(indexCandles, indexWeeklyCandles) {
    try {
      if (!indexCandles || indexCandles.length < 50) return null;
      var ind = computeAll(indexCandles);
      if (!ind) return null;
      var idxCl = closes(indexCandles);
      var idxC = idxCl[idxCl.length - 1];
      var conditions = 0, met = 0;
      if (ind.ema_9 !== null && ind.ema_21 !== null && ind.ema_50 !== null) { conditions++; if (ind.ema_9 > ind.ema_21 && ind.ema_21 > ind.ema_50) met++; }
      if (ind.macd && ind.macd.macd !== null && ind.macd.signal !== null) { conditions++; if (ind.macd.macd > ind.macd.signal) met++; }
      if (indexWeeklyCandles && indexWeeklyCandles.length >= 20) {
        var wEma21v = lastVals(calcEMA(indexWeeklyCandles, 21), 1);
        var wEma21 = wEma21v.length ? wEma21v[0] : null;
        var wCv = lastVals(closes(indexWeeklyCandles), 1);
        var wC = wCv.length ? wCv[0] : null;
        conditions++; if (wC !== null && wEma21 !== null && wC > wEma21) met++;
      } else if (ind.ema_21 !== null) {
        conditions++; if (idxC > ind.ema_21) met++;
      }
      return conditions > 0 ? round(met / conditions * 100, 1) : null;
    } catch (e) { return null; }
  }
  /* Builds all indicator values for one timeframe in a single pass. Every
     score_* component and the Section-11 modifiers consume this snapshot. */
  function buildTFSnapshot(candles, indexCandles, zigzagPct) {
    var cl = closes(candles), hi = highs(candles), lo = lows(candles), vo = volumes(candles);
    var L = cl.length, L1 = L - 1, L2 = L - 2;

    function gv(arr) { return arr !== null && arr !== undefined && arr.length > L1 ? arr[L1] : null; }
    function pv(arr) { return arr !== null && arr !== undefined && arr.length > L2 ? arr[L2] : null; }

    var c = cl[L1], pc = cl[L2];

    var sma20_s = calcSMA(candles, 20), sma20 = gv(sma20_s);
    var sma50_s = calcSMA(candles, 50), sma50 = gv(sma50_s);
    var ema9_s = calcEMA(candles, 9), ema9 = gv(ema9_s), ema9Prev = pv(ema9_s);
    var ema21_s = calcEMA(candles, 21), ema21 = gv(ema21_s);
    var ema50_s = calcEMA(candles, 50), ema50 = gv(ema50_s);
    var wma20_s = calcWMA(candles, 20), wma20 = gv(wma20_s);
    var hma16_s = calcHMA(candles, 16), hma16 = gv(hma16_s), prevHma16 = pv(hma16_s);
    var kama10_s = calcKAMA(candles, 10), kama10 = gv(kama10_s), prevKama10 = pv(kama10_s);
    var sma200_s = candles.length >= 200 ? calcSMA(candles, 200) : null;
    var sma200 = sma200_s ? gv(sma200_s) : null;
    var haRes = calcHeikinAshi(candles), haClose = gv(haRes.close), prevHaClose = pv(haRes.close);

    var vwap10_s = calcRollingVWAP(candles, 10), vwap10 = gv(vwap10_s), prevVwap10 = pv(vwap10_s);
    var anchoredVwap_s = calcAnchoredVWAP(candles), anchoredVwap = gv(anchoredVwap_s), prevAnchoredVwap = pv(anchoredVwap_s);

    var macdRes = calcMACD(candles);
    var macd_s = macdRes.macd, macdL = gv(macd_s), macdPrev = pv(macd_s);
    var sig_s = macdRes.signal, sigL = gv(sig_s), sigPrev = pv(sig_s);
    var hist_s = macdRes.histogram, histL = gv(hist_s), histPrev = pv(hist_s);

    var tsi_s = calcTSI(candles), tsiL = gv(tsi_s), tsiPrev = pv(tsi_s);
    var stc_s = calcSTC(candles), stcL = gv(stc_s), stcPrev = pv(stc_s);
    var ao_s = calcAwesomeOscillator(candles), aoL = gv(ao_s), aoPrev = pv(ao_s);

    var adxRes = calcADX(candles);
    var adx_s = adxRes.adx, adxL = gv(adx_s), adxPrev = pv(adx_s);
    var plusDI = gv(adxRes.plusDI), plusDIPrev = pv(adxRes.plusDI);
    var minusDI = gv(adxRes.minusDI), minusDIPrev = pv(adxRes.minusDI);

    var st_s = calcSuperTrend(candles), stL = gv(st_s), stPrev = pv(st_s);
    var psar_s = calcParabolicSAR(candles), psar = gv(psar_s), psarPrev = pv(psar_s);

    var vxRes = calcVortex(candles);
    var viPlus = gv(vxRes.plus), viPlusPrev = pv(vxRes.plus);
    var viMinus = gv(vxRes.minus), viMinusPrev = pv(vxRes.minus);

    var arRes = calcAroon(candles);
    var aroonOsc = gv(arRes.osc), aroonOscPrev = pv(arRes.osc);

    var bbRes = calcBollingerBands(candles);
    var bbUpper = gv(bbRes.upper), bbMid = gv(bbRes.middle), bbLower = gv(bbRes.lower), bbMidPrev = pv(bbRes.middle);
    var bbWidth = bbMid > 0 && bbUpper !== null && bbLower !== null ? round((bbUpper - bbLower) / bbMid, 4) : null;
    var prevBbWidth_s = [];
    for (var i = 0; i < bbRes.upper.length; i++) {
      if (bbRes.middle[i] !== null && bbRes.middle[i] > 0 && bbRes.upper[i] !== null && bbRes.lower[i] !== null) {
        prevBbWidth_s.push(round((bbRes.upper[i] - bbRes.lower[i]) / bbRes.middle[i], 4));
      } else { prevBbWidth_s.push(null); }
    }
    var bbWidthPrev = pv(prevBbWidth_s);

    var kcRes = calcKeltnerChannels(candles);
    var kcUpper = gv(kcRes.upper), kcMid = gv(kcRes.middle), kcLower = gv(kcRes.lower), kcMidPrev = pv(kcRes.middle);
    var dcRes = calcDonchianChannels(candles);
    var dcUpper = gv(dcRes.upper), dcLower = gv(dcRes.lower);
    var prevDcUpper = pv(dcRes.upper);
    var chandelierRes = calcChandelierExit(candles);
    var chandelierLong = gv(chandelierRes.long), chandelierLongPrev = pv(chandelierRes.long);

    var atr14_s = calcATR(candles, 14), atr14 = gv(atr14_s);

    var rsi14_s = calcRSI(candles, 14), rsi14 = gv(rsi14_s), rsi14Prev = pv(rsi14_s);
    var stochRsiRes = calcStochasticRSI(candles);
    var stochRsiK = gv(stochRsiRes.k), stochRsiKPrev = pv(stochRsiRes.k);
    var stochRsiD = gv(stochRsiRes.d), stochRsiDPrev = pv(stochRsiRes.d);
    var willr_s = calcWilliamsR(candles), willr = gv(willr_s), willrPrev = pv(willr_s);

    var cci20_s = calcCCI(candles, 20), cci20 = gv(cci20_s), cci20Prev = pv(cci20_s);
    var roc12_s = calcROC(candles, 12), roc12 = gv(roc12_s), roc12Prev = pv(roc12_s);
    var mom10_s = calcMomentum(candles, 10), mom10 = gv(mom10_s), mom10Prev = pv(mom10_s);
    var fi13_s = calcForceIndex(candles, 13), fi13 = gv(fi13_s), fi13Prev = pv(fi13_s);

    var mfi14_s = calcMFI(candles, 14), mfi14 = gv(mfi14_s), mfi14Prev = pv(mfi14_s);
    var cmf20_s = calcCMF(candles, 20), cmf20 = gv(cmf20_s), cmf20Prev = pv(cmf20_s);

    var obv_s = calcOBV(candles), obv = gv(obv_s);
    var obvSma20 = gv(sma(obv_s, 20));
    var obvSlopeVal = slope(obv_s, 10), obvSlopePrev = slope(obv_s.slice(0, -1), 10);
    var pvt_s = calcPVT(candles), pvt = gv(pvt_s);
    var pvtSma20 = gv(sma(pvt_s, 20));
    var pvtSlopeVal = slope(pvt_s, 10), pvtSlopePrev = slope(pvt_s.slice(0, -1), 10);
    var kvoRes = calcKVO(candles);
    var kvoL = gv(kvoRes.line), kvoPrev = pv(kvoRes.line);
    var kvoSig = gv(kvoRes.signal), kvoSigPrev = pv(kvoRes.signal);

    var vpRes = calcVolumeProfile(candles);
    var poc = vpRes ? vpRes.poc : null, prevPoc = null;
    var vah = vpRes ? vpRes.vah : null;
    if (vpRes && vpRes.bins && vpRes.bins.length > 1) {
      var prevVp = null;
      try { prevVp = calcVolumeProfile(candles.slice(0, -1)); } catch (e) {}
      prevPoc = prevVp && prevVp.poc != null ? prevVp.poc : poc;
    }
    var smRes = calcSqueezeMomentum(candles);
    var squeezeOn = null, squeezeOnPrev = null, squeezeMomVal = null, squeezeMomPrev = null;
    var sqArr = smRes.squeeze;
    for (var i = sqArr.length - 1; i >= 0; i--) { if (sqArr[i] !== null) { squeezeOn = sqArr[i]; break; } }
    for (var i = sqArr.length - 2; i >= 0; i--) { if (sqArr[i] !== null) { squeezeOnPrev = sqArr[i]; break; } }
    var sqMomArr = smRes.values;
    for (var i = sqMomArr.length - 1; i >= 0; i--) { if (sqMomArr[i] !== null) { squeezeMomVal = sqMomArr[i]; break; } }
    for (var i = sqMomArr.length - 2; i >= 0; i--) { if (sqMomArr[i] !== null) { squeezeMomPrev = sqMomArr[i]; break; } }
    var accumDist = calcAccumDistComposite(candles);
    var accumDistLabel = null;
    if (accumDist) { for (var i = accumDist.length - 1; i >= 0; i--) { if (accumDist[i] !== null) { accumDistLabel = accumDist[i]; break; } } }

    var ichRes = calcIchimoku(candles);
    var tenkan = gv(ichRes.tenkan), tenkanPrev = pv(ichRes.tenkan);
    var kijun = gv(ichRes.kijun), kijunPrev = pv(ichRes.kijun);
    var senkouA = gv(ichRes.senkouA), senkouB = gv(ichRes.senkouB);
    var chikou = gv(ichRes.chikou);

    var fibRes = calcFibonacci(candles);
    var fibLevels = fibRes ? fibRes.retrace : null;
    var pivotRes = calcPivotPoints(candles);
    var pivotP = pivotRes ? pivotRes.classic.P : null;
    var pivotR1 = pivotRes ? pivotRes.classic.R1 : null;
    var pivotS1 = pivotRes ? pivotRes.classic.S1 : null;
    var pivotS2 = pivotRes ? pivotRes.classic.S2 : null;
    var darvasRes = calcDarvasBox(candles);
    var darvasTop = darvasRes ? darvasRes.top : null;
    var darvasBottom = darvasRes ? darvasRes.bottom : null;

    /* ZigZag reversal threshold scaled by timeframe: a fixed 5% is far too large
       for hourly bars (almost never triggers), so the multi-TF path passes 2/3/5
       for H/D/W. Default stays 5 for single-TF/display callers. */
    var zigzagArr = calcZigZag(candles, zigzagPct);
    var zigzagDirection = null;
    if (zigzagArr && zigzagArr.length >= 2) {
      var lastPivot = zigzagArr[zigzagArr.length - 1], prevPivot = zigzagArr[zigzagArr.length - 2];
      zigzagDirection = cl[lastPivot] > cl[prevPivot] ? 'UP' : 'DOWN';
    }
    var chopArr = calcChoppinessIndex(candles);
    var chopIndex = gv(chopArr), prevChopIndex = pv(chopArr);
    var mtfAllArr = calcMTFAlignment(candles), mtfAlign = gv(mtfAllArr), mtfAlignPrev = pv(mtfAllArr);

    var beta = null;
    var rsMansfield = null, rsMansfieldPrev = null;
    if (indexCandles && indexCandles.length > 10) {
      try {
        beta = last(calcBeta(candles, indexCandles));
        var rsSeries = calcMansfieldRS(candles, indexCandles, 52);
        if (rsSeries) {
          var rv = lastVals(rsSeries, 2);
          if (rv.length > 0) rsMansfield = rv[0];
          if (rv.length > 1) rsMansfieldPrev = rv[1];
        }
      } catch(e) {}
    }

    var stabilityScore = calcStabilityScore(candles, 10);
    var spikeArr = calcDetectSpike(candles, 20, 2.5, 2.5);
    var spikeLast = null;
    if (spikeArr && spikeArr.length) {
      for (var i = spikeArr.length - 1; i >= 0; i--) { if (spikeArr[i] === true || spikeArr[i] === false) { spikeLast = spikeArr[i]; break; } }
    }

    /* ── distribution-day ratio: share of last 5 sessions closing down on above-average volume ── */
    var distDayRatio = 0, prevDistDayRatio = 0;
    if (L >= 5) {
      var dVolLookback = 20, dSumVol = 0, dCnt = 0;
      /* Compute average volume BEFORE the 5-bar test window to avoid inflating the baseline */
      var avgStart = Math.max(0, L - dVolLookback - 5);
      var avgEnd = L - 5;
      for (var v = avgStart; v < avgEnd; v++) { dSumVol += vo[v]; dCnt++; }
      var dAvgVol = dCnt > 0 ? dSumVol / dCnt : 0;
      var dDist = 0;
      for (var v = L - 5; v < L; v++) { if (v > 0 && cl[v] < cl[v - 1] && vo[v] > dAvgVol) dDist++; }
      distDayRatio = round(dDist / 5, 2);
      if (L >= 6) {
        var dSumVolPrev = 0, dCntPrev = 0;
        var avgStartPrev = Math.max(0, L - 1 - dVolLookback - 5);
        var avgEndPrev = L - 1 - 5;
        for (var v = avgStartPrev; v < avgEndPrev; v++) { dSumVolPrev += vo[v]; dCntPrev++; }
        var dAvgVolPrev = dCntPrev > 0 ? dSumVolPrev / dCntPrev : 0;
        var dDistPrev = 0;
        for (var v = L - 6; v < L - 1; v++) { if (v > 0 && cl[v] < cl[v - 1] && vo[v] > dAvgVolPrev) dDistPrev++; }
        prevDistDayRatio = round(dDistPrev / 5, 2);
      }
    }

    return {
      cl: cl, vo: vo, c: c, pc: pc,
      sma20: sma20, sma50: sma50, ema9: ema9, ema9Prev: ema9Prev, ema21: ema21, ema50: ema50, wma20: wma20,
      ema9_s: ema9_s, ema21_s: ema21_s, rsi14_s: rsi14_s,
      hma16: hma16, prevHma16: prevHma16, kama10: kama10, prevKama10: prevKama10, sma200: sma200,
      vwap10: vwap10, prevVwap10: prevVwap10, anchoredVwap: anchoredVwap, prevAnchoredVwap: prevAnchoredVwap,
      macdL: macdL, macdPrev: macdPrev, sigL: sigL, sigPrev: sigPrev, histL: histL, histPrev: histPrev,
      macd_s: macd_s, sig_s: sig_s, tsi_s: tsi_s, stc_s: stc_s,
      tsiL: tsiL, tsiPrev: tsiPrev, stcL: stcL, stcPrev: stcPrev, aoL: aoL, aoPrev: aoPrev,
      haClose: haClose, prevHaClose: prevHaClose,
      adxL: adxL, adxPrev: adxPrev, plusDI: plusDI, minusDI: minusDI, plusDIPrev: plusDIPrev, minusDIPrev: minusDIPrev,
      stL: stL, stPrev: stPrev, psar: psar, psarPrev: psarPrev,
      viPlus: viPlus, viMinus: viMinus, viPlusPrev: viPlusPrev, viMinusPrev: viMinusPrev,
      aroonOsc: aroonOsc, aroonOscPrev: aroonOscPrev,
      bbUpper: bbUpper, bbMid: bbMid, bbLower: bbLower, bbWidth: bbWidth, bbWidthPrev: bbWidthPrev, bbMidPrev: bbMidPrev,
      kcUpper: kcUpper, kcMid: kcMid, kcLower: kcLower, kcMidPrev: kcMidPrev,
      dcUpper: dcUpper, dcLower: dcLower, dcRes: dcRes, prevDcUpper: prevDcUpper,
      chandelierLong: chandelierLong, chandelierLongPrev: chandelierLongPrev, atr14: atr14,
      rsi14: rsi14, rsi14Prev: rsi14Prev, stochRsiK: stochRsiK, stochRsiKPrev: stochRsiKPrev, stochRsiD: stochRsiD, stochRsiDPrev: stochRsiDPrev,
      willr: willr, willrPrev: willrPrev,
      cci20: cci20, cci20Prev: cci20Prev, roc12: roc12, roc12Prev: roc12Prev,
      mom10: mom10, mom10Prev: mom10Prev, fi13: fi13, fi13Prev: fi13Prev,
      mfi14: mfi14, mfi14Prev: mfi14Prev, cmf20: cmf20, cmf20Prev: cmf20Prev,
      obv: obv, obvSma20: obvSma20, obvSlopeVal: obvSlopeVal, obvSlopePrev: obvSlopePrev,
      pvt: pvt, pvtSma20: pvtSma20, pvtSlopeVal: pvtSlopeVal, pvtSlopePrev: pvtSlopePrev,
      kvoL: kvoL, kvoPrev: kvoPrev, kvoSig: kvoSig, kvoSigPrev: kvoSigPrev, kvoRes: kvoRes,
      poc: poc, prevPoc: prevPoc, vah: vah,
      squeezeOn: squeezeOn, squeezeOnPrev: squeezeOnPrev, squeezeMomVal: squeezeMomVal, squeezeMomPrev: squeezeMomPrev, sqArr: sqArr,
      accumDistLabel: accumDistLabel,
      tenkan: tenkan, kijun: kijun, senkouA: senkouA, senkouB: senkouB, chikou: chikou, ichRes: ichRes, tenkanPrev: tenkanPrev, kijunPrev: kijunPrev,
      fibLevels: fibLevels, pivotP: pivotP, pivotR1: pivotR1, pivotS1: pivotS1, pivotS2: pivotS2,
      darvasTop: darvasTop, darvasBottom: darvasBottom,
      zigzagDirection: zigzagDirection, chopIndex: chopIndex, prevChopIndex: prevChopIndex, mtfAlign: mtfAlign, mtfAlignPrev: mtfAlignPrev,
      beta: beta, rsMansfield: rsMansfield, rsMansfieldPrev: rsMansfieldPrev,
      stabilityScore: stabilityScore, spikeLast: spikeLast,
      distDayRatio: distDayRatio, prevDistDayRatio: prevDistDayRatio
    };
  }

  /* ── 7.1 Moving Average Stack (0-10), spec literals ── */
  function scoreMaStackForTF(sn) {
    var s = 0;
    if (sn.ema9 !== null && sn.c > sn.ema9) s += 0.5;
    if (sn.ema21 !== null && sn.c > sn.ema21) s += 0.5;
    if (sn.ema50 !== null && sn.c > sn.ema50) s += 0.5;
    if (sn.sma200 !== null && sn.c > sn.sma200) s += 0.5;
    if (sn.ema9 !== null && sn.ema21 !== null && sn.ema50 !== null) {
      if (sn.ema9 > sn.ema21 && sn.ema21 > sn.ema50) s += 2.0;
      else if (sn.ema9 > sn.ema21 || sn.ema21 > sn.ema50) s += 1.0;
    }
    if (sn.sma20 !== null && sn.sma50 !== null && sn.sma200 !== null) {
      if (sn.sma20 > sn.sma50 && sn.sma50 > sn.sma200) s += 2.0;
      else if (sn.sma20 > sn.sma50) s += 1.0;
    } else if (sn.sma20 !== null && sn.sma50 !== null && sn.sma20 > sn.sma50) s += 1.0;
    var fastBull = 0;
    if (sn.hma16 !== null && sn.c > sn.hma16) fastBull++;
    if (sn.kama10 !== null && sn.c > sn.kama10) fastBull++;
    if (sn.wma20 !== null && sn.c > sn.wma20) fastBull++;
    s += Math.min(fastBull * 0.67, 2.0);
    if (sn.hma16 !== null && sn.prevHma16 !== null && sn.hma16 > sn.prevHma16) s += 0.5;
    if (sn.rsMansfield !== null && sn.rsMansfield > 0) s += 0.5;
    if (sn.rsMansfield !== null && sn.rsMansfieldPrev !== null && sn.rsMansfield > sn.rsMansfieldPrev) s += 0.5;
    return Math.min(s, 10);
  }

  /* ── 7.2 MACD + TSI + STC + Awesome Oscillator (0-10) ── */
  function scoreMacdTsiStcAo(sn) {
    var s = 0;
    if (sn.macdL !== null && sn.sigL !== null && sn.macdL > sn.sigL) s += 1.0;
    if (sn.macdL !== null && sn.macdL > 0) s += 0.5;
    if (sn.histL !== null && sn.histPrev !== null && sn.histL > 0 && sn.histL > sn.histPrev) s += 0.5;
    if (sn.macdL !== null && sn.sigL !== null && justCrossedAbove(sn.macd_s, sn.sig_s, 3)) s += 0.5;
    if (sn.tsiL !== null && sn.tsiL > 0) s += 0.5;
    if (sn.tsiL !== null && sn.tsiPrev !== null && sn.tsiL > sn.tsiPrev && sn.tsiL > 0) s += 0.5;
    if (sn.tsiL !== null && justCrossedAbove(sn.tsi_s, sn.cl.map(function(){return 0;}), 3)) s += 0.5;
    if (sn.stcL !== null && sn.stcL > 50) s += 0.5;
    if (sn.stcL !== null && sn.stcPrev !== null && sn.stcL > sn.stcPrev) s += 0.5;
    if (sn.stcL !== null && sn.stcL > 75) s += 0.5;
    if (sn.stcL !== null && justCrossedAbove(sn.stc_s, sn.cl.map(function(){return 25;}), 3)) s += 0.5;
    if (sn.aoL !== null && sn.aoL > 0) s += 0.5;
    if (sn.aoL !== null && sn.aoPrev !== null && sn.aoL > sn.aoPrev) s += 0.5;
    if (sn.aoL !== null && sn.aoPrev !== null && sn.aoL > 0 && sn.aoPrev <= 0) s += 0.5;
    var confluence = 0;
    if (sn.macdL !== null && sn.sigL !== null && sn.macdL > sn.sigL) confluence++;
    if (sn.tsiL !== null && sn.tsiL > 0) confluence++;
    if (sn.stcL !== null && sn.stcL > 50) confluence++;
    if (sn.aoL !== null && sn.aoL > 0) confluence++;
    if (confluence >= 3) s += 1.0;
    return Math.min(s, 10);
  }

  /* ── 7.3 ADX + Supertrend + PSAR + Vortex + Aroon (0-10) ── */
  function scoreAdxStPsarViAroon(sn) {
    var s = 0;
    if (sn.adxL !== null) { if (sn.adxL >= 40) s += 1.0; else if (sn.adxL >= 25) s += 0.5; }
    if (sn.plusDI !== null && sn.minusDI !== null && sn.plusDI > sn.minusDI) s += 0.5;
    if (sn.adxL !== null && sn.adxPrev !== null && sn.plusDI !== null && sn.minusDI !== null && sn.adxL > sn.adxPrev && sn.plusDI > sn.minusDI) s += 0.5;
    if (sn.stL !== null && sn.c > sn.stL) s += 1.0;
    if (sn.stL !== null && sn.stPrev !== null && sn.pc !== null && sn.pc <= sn.stPrev && sn.c > sn.stL) s += 0.5;
    if (sn.psar !== null && sn.c > sn.psar) s += 0.5;
    if (sn.psar !== null && sn.psarPrev !== null && sn.pc !== null && sn.pc <= sn.psarPrev && sn.c > sn.psar) s += 0.5;
    if (sn.viPlus !== null && sn.viMinus !== null && sn.viPlus > sn.viMinus) s += 1.0;
    if (sn.viPlus !== null && sn.viMinus !== null && sn.viPlusPrev !== null && sn.viMinusPrev !== null && sn.viPlus > sn.viPlusPrev && sn.viMinus < sn.viMinusPrev) s += 0.5;
    if (sn.aroonOsc !== null) { if (sn.aroonOsc > 50) s += 1.0; else if (sn.aroonOsc > 0) s += 0.5; }
    if (sn.aroonOsc !== null && sn.aroonOscPrev !== null && sn.aroonOsc > sn.aroonOscPrev && sn.aroonOsc > 0) s += 0.5;
    var allBull = (sn.stL !== null && sn.c > sn.stL) && (sn.psar !== null && sn.c > sn.psar) && (sn.plusDI !== null && sn.minusDI !== null && sn.plusDI > sn.minusDI) &&
                  (sn.viPlus !== null && sn.viMinus !== null && sn.viPlus > sn.viMinus) && (sn.aroonOsc !== null && sn.aroonOsc > 0);
    if (allBull) s += 1.0;
    return Math.min(s, 10);
  }

  /* ── 8.1 RSI + StochRSI + Williams %R (0-10) ── */
  function scoreRsiStochRsiWillR(sn) {
    var s = 0;
    if (sn.rsi14 !== null) {
      if (sn.rsi14 >= 60 && sn.rsi14 <= 75) s += 2.0; else if (sn.rsi14 >= 55 && sn.rsi14 < 60) s += 1.0; else if (sn.rsi14 > 75 && sn.rsi14 <= 80) s += 1.0; else if (sn.rsi14 >= 50 && sn.rsi14 < 55) s += 0.5;
    }
    if (sn.rsi14 !== null && sn.rsi14Prev !== null && sn.rsi14 > sn.rsi14Prev && sn.rsi14 > 50) s += 1.0;
    if (sn.rsi14 !== null && sn.rsi14Prev !== null && sn.rsi14Prev <= 50 && sn.rsi14 > 50) s += 0.5;
    if (sn.stochRsiK !== null && sn.stochRsiD !== null && sn.stochRsiK > sn.stochRsiD) s += 1.0;
    if (sn.stochRsiK !== null && sn.stochRsiK >= 50 && sn.stochRsiK <= 80) s += 0.5;
    if (sn.stochRsiK !== null && sn.stochRsiKPrev !== null && sn.stochRsiK > sn.stochRsiKPrev) s += 0.5;
    if (sn.willr !== null) {
      if (sn.willr >= -50 && sn.willr <= -20) s += 1.0; else if (sn.willr >= -80 && sn.willr < -50) s += 0.5;
    }
    if (sn.willr !== null && sn.willrPrev !== null && sn.willr > sn.willrPrev && sn.willr > -50) s += 0.5;
    if (sn.willr !== null && sn.willr > -20) s += 0.5;
    if (sn.rsi14 !== null && sn.stochRsiK !== null && sn.stochRsiD !== null && sn.willr !== null && sn.rsi14 > 55 && sn.stochRsiK > sn.stochRsiD && sn.willr > -50) s += 0.5;
    return Math.min(s, 10);
  }

  /* ── 8.2 CCI + ROC + Momentum + Force Index (0-10) ── */
  function scoreCciRocMomFi(sn) {
    var s = 0;
    if (sn.cci20 !== null) {
      if (sn.cci20 >= 100 && sn.cci20 <= 200) s += 1.5; else if (sn.cci20 >= 50 && sn.cci20 < 100) s += 1.0; else if (sn.cci20 >= 0 && sn.cci20 < 50) s += 0.5;
    }
    if (sn.cci20 !== null && sn.cci20Prev !== null && sn.cci20 > sn.cci20Prev && sn.cci20 > 0) s += 0.5;
    if (sn.roc12 !== null && sn.roc12Prev !== null && sn.roc12 > 0 && sn.roc12 > sn.roc12Prev) s += 1.5;
    else if (sn.roc12 !== null && sn.roc12 > 0) s += 0.5;
    if (sn.roc12 !== null && sn.roc12 > 2) s += 0.5;
    if (sn.mom10 !== null && sn.mom10Prev !== null && sn.mom10 > 0 && sn.mom10 > sn.mom10Prev) s += 1.5;
    else if (sn.mom10 !== null && sn.mom10 > 0) s += 0.5;
    if (sn.fi13 !== null && sn.fi13Prev !== null && sn.fi13 > 0 && sn.fi13 > sn.fi13Prev) s += 1.5;
    else if (sn.fi13 !== null && sn.fi13 > 0) s += 0.5;
    if (sn.fi13 !== null && sn.fi13Prev !== null && sn.fi13 > 0 && sn.fi13Prev <= 0) s += 0.5;
    if (sn.cci20 !== null && sn.roc12 !== null && sn.mom10 !== null && sn.fi13 !== null && sn.cci20 > 0 && sn.roc12 > 0 && sn.mom10 > 0 && sn.fi13 > 0) s += 1.0;
    return Math.min(s, 10);
  }

  /* ── 8.3 MFI + CMF (0-10) ── */
  function scoreMfiCmf(sn) {
    var s = 0;
    if (sn.mfi14 !== null) {
      if (sn.mfi14 >= 60 && sn.mfi14 <= 80) s += 2.5; else if (sn.mfi14 >= 50 && sn.mfi14 < 60) s += 1.5; else if (sn.mfi14 >= 40 && sn.mfi14 < 50) s += 1.0; else if (sn.mfi14 > 80) s += 1.0;
    }
    if (sn.mfi14 !== null && sn.mfi14Prev !== null && sn.mfi14 > sn.mfi14Prev && sn.mfi14 > 50) s += 1.5;
    if (sn.mfi14 !== null && sn.mfi14Prev !== null && sn.mfi14Prev <= 50 && sn.mfi14 > 50) s += 1.0;
    if (sn.cmf20 !== null) { if (sn.cmf20 > 0.10) s += 2.0; else if (sn.cmf20 > 0.05) s += 1.5; else if (sn.cmf20 > 0) s += 1.0; }
    if (sn.cmf20 !== null && sn.cmf20Prev !== null && sn.cmf20 > sn.cmf20Prev && sn.cmf20 > 0) s += 1.0;
    if (sn.mfi14 !== null && sn.cmf20 !== null && sn.mfi14 > 50 && sn.cmf20 > 0) s += 0.5;
    return Math.min(s, 10);
  }

  /* ── 9.1 OBV + PVT + KVO (0-8) ── */
  function scoreObvPvtKvo(sn) {
    var s = 0;
    if (sn.obv !== null && sn.obvSma20 !== null && sn.obv > sn.obvSma20) s += 1.0;
    if (sn.obvSlopeVal !== null && sn.obvSlopeVal > 0) s += 0.5;
    if (sn.obvSlopeVal !== null && sn.obvSlopePrev !== null && sn.obvSlopeVal > sn.obvSlopePrev) s += 0.5;
    if (sn.pvt !== null && sn.pvtSma20 !== null && sn.pvt > sn.pvtSma20) s += 1.0;
    if (sn.pvtSlopeVal !== null && sn.pvtSlopeVal > 0) s += 1.0;
    if (sn.pvtSlopeVal !== null && sn.pvtSlopePrev !== null && sn.pvtSlopeVal > sn.pvtSlopePrev) s += 0.5;
    if (sn.kvoL !== null && sn.kvoSig !== null && sn.kvoL > sn.kvoSig) s += 1.5;
    if (sn.kvoL !== null && sn.kvoL > 0) s += 0.5;
    if (sn.kvoL !== null && sn.kvoPrev !== null && sn.kvoL > sn.kvoPrev) s += 0.5;
    if (sn.kvoL !== null && sn.kvoSig !== null && justCrossedAbove(sn.kvoRes.line, sn.kvoRes.signal, 3)) s += 1.0;
    return Math.min(s, 8);
  }

  /* ── 9.2 VWAP + Anchored VWAP (0-6) ── */
  function scoreVwapAnchored(sn) {
    var s = 0;
    if (sn.c !== null && sn.vwap10 !== null && sn.c > sn.vwap10) {
      s += 1.5;
      var pct = (sn.c - sn.vwap10) / sn.vwap10 * 100;
      if (pct >= 0.5 && pct <= 3.0) s += 0.5;
    }
    if (sn.vwap10 !== null && sn.prevVwap10 !== null && sn.vwap10 > sn.prevVwap10) s += 0.5;
    if (sn.c !== null && sn.anchoredVwap !== null && sn.c > sn.anchoredVwap) s += 1.5;
    if (sn.anchoredVwap !== null && sn.prevAnchoredVwap !== null && sn.anchoredVwap > sn.prevAnchoredVwap) s += 0.5;
    if (sn.c !== null && sn.vwap10 !== null && sn.anchoredVwap !== null && sn.c > sn.vwap10 && sn.c > sn.anchoredVwap) s += 1.0;
    return Math.min(s, 6);
  }

  /* ── 9.3 VP + TTM Squeeze + Accum/Dist (0-6) ── */
  function scoreVpSqueezeAd(sn) {
    var s = 0;
    if (sn.c !== null && sn.poc !== null && sn.c > sn.poc) s += 1.0;
    if (sn.c !== null && sn.vah !== null && sn.c > sn.vah) s += 0.5;
    if (sn.poc !== null && sn.prevPoc !== null && sn.poc > sn.prevPoc) s += 0.5;
    if (sn.squeezeOn !== null && sn.squeezeOnPrev !== null) { if (!sn.squeezeOn && sn.squeezeOnPrev) s += 1.0; else if (sn.squeezeOn) s += 0.5; }
    if (sn.squeezeMomVal !== null && sn.squeezeMomPrev !== null && sn.squeezeMomVal > 0 && sn.squeezeMomVal > sn.squeezeMomPrev) s += 1.5;
    else if (sn.squeezeMomVal !== null && sn.squeezeMomVal > 0) s += 0.5;
    if (sn.accumDistLabel === 'ACCUMULATION') s += 1.5;
    return Math.min(s, 6);
  }

  /* ── 10.1 BB + KC + DC + Chandelier (0-8) ── */
  function scoreBbKcDcChandelier(sn) {
    var s = 0;
    if (sn.bbUpper !== null && sn.bbLower !== null) {
      var bbPos = (sn.c - sn.bbLower) / (sn.bbUpper - sn.bbLower);
      if (bbPos >= 0.5 && bbPos <= 0.8) s += 1.0; else if (bbPos >= 0.3 && bbPos < 0.5) s += 0.5;
    }
    if (sn.bbWidth !== null && sn.bbWidthPrev !== null && sn.bbWidth > sn.bbWidthPrev) s += 0.5;
    if (sn.kcMid !== null && sn.c > sn.kcMid) s += 0.5;
    if (sn.kcUpper !== null && sn.c > sn.kcUpper) s += 0.5;
    if (sn.dcUpper !== null && sn.dcLower !== null) { if (sn.c >= sn.dcUpper * 0.99) s += 1.0; else if (sn.c > (sn.dcUpper + sn.dcLower) / 2) s += 0.5; }
    if (sn.chandelierLong !== null && sn.c > sn.chandelierLong) s += 1.0;
    if (sn.chandelierLong !== null && sn.chandelierLongPrev !== null && sn.chandelierLong > sn.chandelierLongPrev) s += 0.5;
    if (sn.bbUpper !== null && sn.kcUpper !== null && sn.bbLower !== null && sn.kcLower !== null && sn.bbUpper < sn.kcUpper && sn.bbLower > sn.kcLower) s += 0.5;
    if (sn.atr14 !== null && sn.c !== null && sn.c > 0) { var atrPct = sn.atr14 / sn.c * 100; if (atrPct >= 2.0 && atrPct <= 4.0) s += 0.5; }
    if (sn.dcUpper !== null && sn.c > sn.dcUpper && sn.bbWidth !== null && sn.bbWidthPrev !== null && sn.bbWidth > sn.bbWidthPrev) s += 1.0;
    return Math.min(s, 8);
  }

  /* ── 10.2 Ichimoku (0-6) ── */
  function scoreIchimoku(sn) {
    var s = 0;
    if (sn.senkouA !== null && sn.senkouB !== null) {
      var cloudTop = Math.max(sn.senkouA, sn.senkouB);
      if (sn.c > cloudTop) s += 2.0; else if (sn.c > Math.min(sn.senkouA, sn.senkouB)) s += 0.5;
    }
    if (sn.tenkan !== null && sn.kijun !== null && sn.tenkan > sn.kijun) s += 1.0;
    if (sn.tenkan !== null && sn.kijun !== null && justCrossedAbove(sn.ichRes.tenkan, sn.ichRes.kijun, 3)) s += 0.5;
    if (sn.senkouA !== null && sn.senkouB !== null && sn.senkouA > sn.senkouB) s += 1.0;
    /* Chikou Span confirmation, real-time computable (no look-ahead): the Chikou
       at chart position t holds close[t+26]; the live version compares the current
       close against the close from 26 bars ago, i.e. sn.c > sn.chikou (chikou[i]=close[i-26]).
       The old `chikou > prev_close` compared close[t-26] vs close[t-1], which fired
       bullish while price was actually falling for 25 bars. */
    if (sn.chikou !== null && sn.c !== null && sn.c > sn.chikou) s += 0.5;
    if (sn.senkouA !== null && sn.senkouB !== null && sn.tenkan !== null && sn.kijun !== null && sn.chikou !== null &&
        sn.c > Math.max(sn.senkouA, sn.senkouB) && sn.tenkan > sn.kijun && sn.senkouA > sn.senkouB && sn.c > sn.chikou) s += 1.0;
    return Math.min(s, 6);
  }

  /* ── 10.3 Darvas + Fib + Pivot + ZigZag + Choppiness + MTF (0-6) ──
     HMA & KAMA are deliberately NOT re-scored here: they already count in the
     MA Stack (7.1), so scoring them again would double-count the same fast-MA data. */
  function scoreDarvasStructure(sn) {
    var s = 0;
    if (sn.darvasTop !== null && sn.darvasBottom !== null) {
      if (sn.c >= sn.darvasTop) s += 1.5; else if (sn.c > (sn.darvasTop + sn.darvasBottom) / 2) s += 0.5;
    }
    if (sn.fibLevels !== null && sn.pc !== null) {
      for (var key in sn.fibLevels) { if (key === '0.382' || key === '0.5' || key === '0.618') { if (Math.abs(sn.c - sn.fibLevels[key]) / sn.c < 0.005 && sn.c > sn.pc) { s += 0.5; break; } } }
    }
    if (sn.pivotP !== null && sn.c > sn.pivotP) s += 0.25;
    if (sn.pivotR1 !== null && sn.c > sn.pivotR1) s += 0.25;
    if (sn.chopIndex !== null && sn.chopIndex < 38.2) s += 0.5; else if (sn.chopIndex !== null && sn.chopIndex < 50) s += 0.25;
    if (sn.zigzagDirection === 'UP') s += 0.5;
    if (sn.mtfAlign !== null) { if (sn.mtfAlign >= 80) s += 1.0; else if (sn.mtfAlign >= 60) s += 0.5; }
    return Math.min(s, 6);
  }

  /* ── Section 11 spike & stability sub-scores (0-10 per TF, higher = worse) ── */
  function scoreSpikeForTF(candles) {
    try {
      var arr = calcDetectSpike(candles, 20, 2.5, 2.5);
      if (!arr || !arr.length) return 0;
      var latest = null, prior = null;
      for (var i = arr.length - 1; i >= 0; i--) { if (arr[i] === true || arr[i] === false) { latest = arr[i]; break; } }
      for (var i = arr.length - 2; i >= 0; i--) { if (arr[i] === true || arr[i] === false) { prior = arr[i]; break; } }
      var count = 0;
      for (var i = Math.max(0, arr.length - 20); i < arr.length; i++) { if (arr[i] === true) count++; }
      var s = 0;
      if (latest === true) s += 5;
      if (prior === true) s += 3;
      if (count > 0) s += 2;
      return Math.min(s, 10);
    } catch (e) { return 0; }
  }
  function scoreStabilityPenaltyForTF(candles, lookback) {
    try {
      var st = calcStabilityScore(candles, lookback || 10);
      if (st === null || st === undefined) return 0;
      return round(Math.max(0, Math.min(10, (1 - st) * 10)), 1);
    } catch (e) { return 0; }
  }

  /* Runs all 12 spec sub-scores (plus spike/stability) for one timeframe.
     `zigzagPct` scales the ZigZag reversal threshold (H=2, D=3, W=5). */
  function scoreEntryComponentsForTF(candles, indexCandles, stabLookback, zigzagPct) {
    var sn = buildTFSnapshot(candles, indexCandles, zigzagPct);
    return {
      maStack: scoreMaStackForTF(sn),
      macdTsiStcAo: scoreMacdTsiStcAo(sn),
      adxStPsarViAroon: scoreAdxStPsarViAroon(sn),
      rsiStochRsiWillR: scoreRsiStochRsiWillR(sn),
      cciRocMomFi: scoreCciRocMomFi(sn),
      mfiCmf: scoreMfiCmf(sn),
      obvPvtKvo: scoreObvPvtKvo(sn),
      vwapAnchored: scoreVwapAnchored(sn),
      vpSqueezeAd: scoreVpSqueezeAd(sn),
      bbKcDcChandelier: scoreBbKcDcChandelier(sn),
      ichimoku: scoreIchimoku(sn),
      darvasStructure: scoreDarvasStructure(sn),
      spike: scoreSpikeForTF(candles),
      stability: scoreStabilityPenaltyForTF(candles, stabLookback || 10),
      sn: sn
    };
  }

  /* Section 11 penalty modifiers (single-pass on the base/daily snapshot). */
  function buildEntryPenaltyItems(sn, opts) {
    var items = [];
    if (sn.rsi14 !== null && sn.rsi14 > 80) items.push({ reason: "RSI overbought", amount: -5 });
    var rising5 = true, declining5 = true;
    var cl = sn.cl, vo = sn.vo;
    var L = cl.length;
    for (var i = Math.max(0, L - 5); i < L; i++) { if (i > Math.max(0, L - 5) && cl[i] <= cl[i - 1]) rising5 = false; if (i > Math.max(0, L - 5) && vo[i] >= vo[i - 1]) declining5 = false; }
    if (cl.length >= 5) { if (rising5 && declining5) items.push({ reason: "Rising price + declining volume 5 days", amount: -8 }); }
    if (opts.weeklyTrend === 'bearish' && opts.dailyBullish) items.push({ reason: "Weekly bearish + daily bullish clash", amount: -10 });
    if (sn.pivotR1 !== null && sn.c !== null && sn.pivotR1 > 0) { var distToRes = (sn.pivotR1 - sn.c) / sn.c; if (distToRes < 0.01 && distToRes >= 0) items.push({ reason: "Near resistance", amount: -5 }); }
    if (sn.squeezeOn !== null && sn.sqArr) { var sqDuration = 0;
      for (var i = sn.sqArr.length - 1; i >= 0; i--) { if (sn.sqArr[i] === true) sqDuration++; else break; }
      if (sn.squeezeOn && sqDuration > 10) items.push({ reason: "Squeeze over 10 bars", amount: -3 });
    }
    if (sn.beta !== null && sn.beta > 1.5 && sn.atr14 !== null && sn.c > 0) { var atrPct = sn.atr14 / sn.c * 100; if (atrPct > 3.0) items.push({ reason: "High beta + high ATR", amount: -3 }); }
    var spikeSub = opts.spikeSub != null ? opts.spikeSub : 0;
    if (spikeSub >= 7) items.push({ reason: "Abnormal single-session spike (latest session)", amount: -15 });
    else if (spikeSub >= 4) items.push({ reason: "Abnormal spike (fading)", amount: -8 });
    else if (spikeSub >= 2) items.push({ reason: "Minor spike recent bars", amount: -4 });
    var stabSub = opts.stabSub != null ? opts.stabSub : 0;
    if (stabSub >= 7) items.push({ reason: "Erratic price action (stability)", amount: -10 });
    else if (stabSub >= 5) items.push({ reason: "Moderately erratic price action (stability)", amount: -5 });
    if (opts.dominanceRatio != null && opts.dominanceRatio > 0.6 && spikeSub < 4) items.push({ reason: "One session dominates the 5-day move (dominance)", amount: -12 });
    return items;
  }

  /* Section 11 bonus modifiers (single-pass on the base/daily snapshot). */
  function buildEntryBonusItems(sn, opts) {
    var items = [];
    if (sn.dcUpper !== null) {
      if (sn.c > sn.dcUpper) {
        var avgVol = 0, avgVolCount = 0;
        for (var i = Math.max(0, sn.cl.length - 20); i < sn.cl.length; i++) { avgVol += sn.vo[i]; avgVolCount++; }
        avgVol = avgVolCount > 0 ? avgVol / avgVolCount : 0;
        if (sn.vo[sn.cl.length - 1] > 1.5 * avgVol && !opts.todaySpike) items.push({ reason: "Donchian breakout + high volume", amount: 5 });
      }
    }
    if (opts.hourlyBullish && opts.dailyBullish && opts.weeklyBullish) items.push({ reason: "All TFs bullish (D/W/H)", amount: 5 });
    if (opts.idxTrendScore !== null && opts.idxTrendScore > 60) items.push({ reason: "Index trend score >60", amount: 3 });
    if (sn.accumDistLabel === 'ACCUMULATION' && sn.mtfAlign !== null && sn.mtfAlign > 80) items.push({ reason: "Accumulation + MTF>80", amount: 3 });
    if (sn.rsMansfield !== null && sn.aroonOsc !== null && sn.rsMansfield > 5 && sn.aroonOsc > 50) items.push({ reason: "RS Mansfield>5 + Aroon>50", amount: 3 });
    if (sn.pivotR1 !== null && sn.fibLevels !== null && sn.fibLevels['0.618'] !== null && sn.c > sn.pivotR1 && sn.c > sn.fibLevels['0.618']) items.push({ reason: "Above pivot R1 + fib 0.618", amount: 2 });
    if (opts.efficiencyRatio10 != null && opts.efficiencyRatio10 > 0.6 && !opts.todaySpike) items.push({ reason: "Smooth steady climb (efficiency)", amount: 3 });
    return items;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Entry Score (single timeframe) — Full spec Sections 7-11
     ══════════════════════════════════════════════════════════════════════════ */
  /* Money-flow family cap (Concern 1): MFI+CMF (8.3) and OBV+PVT+KVO (9.1) are all
     volume-price flow measures (typical pairwise correlation > 0.7), so a strong
     accumulation day can stack +10 to +14 raw points from one underlying signal.
     Cap their joint contribution so genuine accumulation still scores, but a
     single signal can't inflate the entry score 5-8 points on its own. */
  var MF_CLUSTER_CAP = 9;

  function applyMoneyFlowCap(comps) {
    var cluster = (comps.mfiCmf || 0) + (comps.obvPvtKvo || 0);
    if (cluster > MF_CLUSTER_CAP && cluster > 0) {
      var scale = MF_CLUSTER_CAP / cluster;
      comps.mfiCmf = round(comps.mfiCmf * scale, 4);
      comps.obvPvtKvo = round(comps.obvPvtKvo * scale, 4);
    }
    return comps;
  }

  /* Confluence persistence (Concern 3): count consecutive recent bars holding the
     core bullish alignment close > EMA9 > EMA21 with MACD > signal and RSI 50-80.
     Rewards setups that built up gradually over time instead of flipping in a
     single bar. */
  function calcConfluencePersistence(sn) {
    try {
      if (!sn || !sn.cl || sn.cl.length < 40) return 0;
      var bars = 0;
      for (var i = sn.cl.length - 1; i >= 0; i--) {
        if (sn.cl[i] == null || sn.ema9_s[i] == null || sn.ema21_s[i] == null ||
            sn.macd_s[i] == null || sn.sig_s[i] == null || sn.rsi14_s[i] == null) break;
        if (!(sn.cl[i] > sn.ema9_s[i] && sn.ema9_s[i] > sn.ema21_s[i] &&
              sn.macd_s[i] > sn.sig_s[i] && sn.rsi14_s[i] >= 50 && sn.rsi14_s[i] <= 80)) break;
        bars++;
      }
      return bars;
    } catch (e) { return 0; }
  }

  /* Reversal-risk counterfactual (Concern 2): scores 0-10 for hidden-bearish
     signals that the bullish score can't see - RSI divergence at new highs,
     volume climax at highs, exhaustion gaps, key-reversal bars. Higher = the
     breakout is more likely a blow-off top. Fed back as a conservative penalty
     so a strong-looking chart that is actually breaking down doesn't score 90+. */
  function calcReversalRisk(candles) {
    try {
      if (!candles || candles.length < 30) return 0;
      var cl = closes(candles), hi = highs(candles), lo = lows(candles), op = opens(candles), vo = volumes(candles);
      var L = cl.length;
      var c = cl[L - 1], prevC = cl[L - 2], openL = op[L - 1];
      if (c == null || prevC == null || openL == null || prevC <= 0) return 0;
      var rsiS = calcRSI(candles, 14);
      var rsiNow = rsiS[L - 1];
      var risk = 0;
      var avgVol = 0, vc = 0;
      for (var i = Math.max(0, L - 20); i < L; i++) { avgVol += vo[i]; vc++; }
      avgVol = vc > 0 ? avgVol / vc : 0;
      var atr14 = calcATR(candles, 14);
      var atrV = atr14 && atr14[L - 1] != null ? atr14[L - 1] : 0;
      var hi10 = -Infinity, hi10Idx = -1, hi20 = -Infinity;
      for (var i = Math.max(0, L - 11); i < L - 1; i++) { if (hi[i] > hi10) { hi10 = hi[i]; hi10Idx = i; } }
      for (var i = Math.max(0, L - 21); i < L - 1; i++) { if (hi[i] > hi20) hi20 = hi[i]; }
      var rsiAtHi = hi10Idx >= 0 ? rsiS[hi10Idx] : null;
      var lastRet = (c - prevC) / prevC * 100;
      var gapPct = (openL - prevC) / prevC * 100;
      var priorRun = cl[Math.max(0, L - 11)] != null ? (c - cl[Math.max(0, L - 11)]) / cl[Math.max(0, L - 11)] * 100 : 0;

      /* 1. Hidden bearish divergence: new 10-bar high with RSI >= 6pts lower than at the prior peak */
      if (rsiNow != null && rsiAtHi != null && c > hi10 && hi20 > 0 && c >= hi20 && rsiNow < rsiAtHi - 6) risk += 5;
      /* 2. Weak RSI at highs: new/near 20-bar high while RSI already < 50 */
      if (rsiNow != null && hi20 > 0 && rsiNow < 50 && c >= hi20 * 0.98) risk += 2;
      /* 3. Volume climax at highs: 2.5x average volume on a >=2% up day at 10-bar highs */
      if (avgVol > 0 && vo[L - 1] >= 2.5 * avgVol && lastRet >= 2.0 && hi10 > 0 && c >= hi10 * 0.98) risk += 3;
      /* 4. Exhaustion gap: >=2.5% gap up on 1.8x volume after a >=4% run */
      if (gapPct >= 2.5 && avgVol > 0 && vo[L - 1] >= 1.8 * avgVol && priorRun >= 4) risk += 2;
      /* 5. Key-reversal bar: long upper wick (>1.5x body) after an up day */
      if (c < openL) {
        var body = Math.abs(openL - c);
        var wickTop = hi[L - 1] - Math.max(c, openL);
        if (wickTop > body * 1.5 && body > 0) risk += 2;
      }
      /* 6. Bearish engulfing at highs: gap up, close <= prev close, at 10-bar highs */
      if (hi10 > 0 && c >= hi10 * 0.98 && openL > prevC && c < openL && c <= prevC) risk += 2;
      return Math.min(risk, 10);
    } catch (e) { return 0; }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     NEW ENTRY ENGINE — 4-pillar model (0-100):
      Trend Health (28) + Pullback Quality (24) + 4% Probability (28) + Swing Potential (20) = 100,
     then ±15 modifiers. Designed to keep scores stable on shallow 1-1.5%
     dips toward support (pillar inputs are dip-insensitive, pullback pillar
     even gains on a dip to SMA20/lower-BB support).
     ══════════════════════════════════════════════════════════════════════════ */

  /* Weekly Heikin-Ashi trend (higher timeframe), synthesized from daily bars
     when no weekly timeframe is provided. Returns { bullish } or null. */
  function _isoWeekKey(t) {
    var d = new Date(String(t).slice(0, 10) + 'T00:00:00Z');
    if (isNaN(d.getTime())) return null;
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var y = d.getUTCFullYear();
    var first = new Date(Date.UTC(y, 0, 1));
    var week = Math.ceil((((d - first) / 86400000) + 1) / 7);
    return y + '-W' + week;
  }
  function _mergeCandles(group) {
    var o = group[0].o, h = -Infinity, l = Infinity, c = group[group.length - 1].c, v = 0, t = group[0].t;
    for (var i = 0; i < group.length; i++) { if (group[i].h > h) h = group[i].h; if (group[i].l < l) l = group[i].l; v += group[i].v || 0; }
    return { t: t, o: o, h: h, l: l, c: c, v: v };
  }
  function synthWeeklyCandles(candles) {
    try {
      if (!candles || !candles.length) return null;
      var hasDates = candles.some(function (x) { return x && x.t != null; });
      var out = [];
      if (hasDates) {
        var groups = {}, keys = [];
        candles.forEach(function (x) {
          var k = _isoWeekKey(x.t);
          if (k === null) return;
          if (!groups[k]) { groups[k] = []; keys.push(k); }
          groups[k].push(x);
        });
        keys.forEach(function (k) { out.push(_mergeCandles(groups[k])); });
      } else {
        for (var i = 0; i < candles.length; i += 5) out.push(_mergeCandles(candles.slice(i, i + 5)));
      }
      return out.length >= 2 ? out : null;
    } catch (e) { return null; }
  }
  function calcWeeklyHA(candles, isWeekly) {
    try {
      var bars = isWeekly ? candles : synthWeeklyCandles(candles);
      if (!bars || bars.length < 2) return null;
      var ha = calcHeikinAshi(bars);
      var L = ha.close.length;
      var close = ha.close[L - 1], open = ha.open[L - 1];
      if (close == null || open == null) return null;
      return { close: close, open: open, bullish: close > open };
    } catch (e) { return null; }
  }

   /* Slim entry snapshot: only the fields the 4 pillars + modifiers consume.
     (Exit scoring keeps the full buildTFSnapshot.) `tf` controls the weekly-HA
     component: real weekly candles for W, synthesized weekly from daily for D,
     none for H. */
  function buildEntrySnapshot(candles, indexCandles, tf) {
    try {
      var cl = closes(candles), hi = highs(candles), lo = lows(candles), op = opens(candles), vo = volumes(candles);
      var L = cl.length;
      if (!L) return null;
      var L1 = L - 1;
      function gv(arr) { return arr !== null && arr !== undefined && arr.length > L1 ? arr[L1] : null; }
      var c = cl[L1];

      var sma20_s = calcSMA(candles, 20), sma20 = gv(sma20_s);
      var sma50 = gv(calcSMA(candles, 50));
      var anchoredVwap = gv(calcAnchoredVWAP(candles));
      var adxRes = calcADX(candles);
      var adxL = gv(adxRes.adx), plusDI = gv(adxRes.plusDI), minusDI = gv(adxRes.minusDI);
      var macdRes = calcMACD(candles);
      var macdL = gv(macdRes.macd), sigL = gv(macdRes.signal);

      var rsMansfield = null;
      if (indexCandles && indexCandles.length > 10) {
        try { var rsSeries = calcMansfieldRS(candles, indexCandles, 52); if (rsSeries) rsMansfield = lastVals(rsSeries, 1)[0] || null; } catch (e) {}
      }

      var bbRes = calcBollingerBands(candles);
      var bbUpper = gv(bbRes.upper);
      var bbLower = gv(bbRes.lower);
      var bbWidthArr = [];
      for (var i = 0; i < bbRes.upper.length; i++) {
        if (bbRes.middle[i] !== null && bbRes.middle[i] > 0 && bbRes.upper[i] !== null && bbRes.lower[i] !== null) {
          bbWidthArr.push((bbRes.upper[i] - bbRes.lower[i]) / bbRes.middle[i]);
        } else { bbWidthArr.push(null); }
      }
      var bbWidth = gv(bbWidthArr);
      var bbWidthPrev5 = (L1 - 5 >= 0 && L1 - 5 < bbWidthArr.length) ? bbWidthArr[L1 - 5] : null;

      var upDayVol = 0, dnDayVol = 0;
      for (var j = Math.max(1, L - 20); j < L; j++) {
        if (cl[j] >= cl[j - 1]) upDayVol += vo[j]; else dnDayVol += vo[j];
      }
      var upDownVolRatio = (dnDayVol > 0) ? upDayVol / dnDayVol : (upDayVol > 0 ? 2 : 1);

      var stochRsiK = gv(calcStochasticRSI(candles).k);
      var rsi14 = gv(calcRSI(candles, 14));
      var atr14 = gv(calcATR(candles, 14));
      var atr10 = gv(calcATR(candles, 10));

      var efficiencyRatio10 = null;
      if (L >= 11) {
        var dir = Math.abs(c - cl[L - 11]);
        var path = 0;
        for (var j = L - 10; j < L; j++) path += Math.abs(cl[j] - cl[j - 1]);
        efficiencyRatio10 = path > 0 ? dir / path : 0;
      }

      var avgVol = 0, vc = 0;
      for (var j = Math.max(0, L - 20); j < L; j++) { avgVol += vo[j]; vc++; }
      avgVol = vc > 0 ? avgVol / vc : 0;
      var volRatio = avgVol > 0 ? vo[L1] / avgVol : null;

      var beta = null;
      if (indexCandles && indexCandles.length > 10) {
        try { beta = last(calcBeta(candles, indexCandles)); } catch (e) {}
      }

      var stability20 = calcStabilityScore(candles, 20);
      var spikeArr = calcDetectSpike(candles, 20, 2.5, 2.5);
      var spikeLast = null;
      if (spikeArr && spikeArr.length) {
        for (var i = spikeArr.length - 1; i >= 0; i--) { if (spikeArr[i] === true || spikeArr[i] === false) { spikeLast = spikeArr[i]; break; } }
      }

      var gapPct = null;
      if (L >= 2) {
        var prevC = cl[L1 - 1], openL = op[L1] != null ? op[L1] : c;
        if (prevC != null && prevC > 0) gapPct = (openL - prevC) / prevC * 100;
      }

      var weeklyHABullish = null;
      var wha = tf === 'W' ? calcWeeklyHA(candles, true) : (tf === 'D' ? calcWeeklyHA(candles, false) : null);
      if (wha) weeklyHABullish = wha.bullish;

      var sma20Slope5 = sma20_s ? slope(sma20_s, 5) : null;

      var swingHigh20 = null, swingHigh20Idx = null;
      for (var j = Math.max(0, L - 20); j < L; j++) { if (hi[j] != null && (swingHigh20 === null || hi[j] > swingHigh20)) { swingHigh20 = hi[j]; swingHigh20Idx = j; } }
      var barsSinceHigh20 = swingHigh20Idx != null ? (L1 - swingHigh20Idx) : null;
      var pullbackDepth = (swingHigh20 != null && swingHigh20 > 0 && c != null) ? (swingHigh20 - c) / swingHigh20 : null;

      var supportLevels = [sma20, bbLower, anchoredVwap, sma50];
      var nearSupportCount = 0;
      if (c != null && c > 0 && atr14 != null) {
        for (var j = 0; j < supportLevels.length; j++) {
          if (supportLevels[j] != null && Math.abs(c - supportLevels[j]) / c < atr14 / c * 0.5) nearSupportCount++;
        }
      }

      /* Pick nearest support level at or below the PRIOR bar's close as buyRef.
         Using pc (not c) avoids same-bar circularity in the undercut & reclaim check.
         If no support is below pc, fall back to nearest any-direction support.
         Order: SMA(20) → BB Lower → Anchored VWAP → SMA(50) → null */
      var buyRef = null;
      var refPrice = (L >= 2 && cl[L1 - 1] != null && cl[L1 - 1] > 0) ? cl[L1 - 1] : c;
      if (refPrice != null && refPrice > 0) {
        var bestDist = Infinity;
        for (var j = 0; j < supportLevels.length; j++) {
          var lv = supportLevels[j];
          if (lv != null && lv > 0 && lv <= refPrice) {
            var d = refPrice - lv;
            if (d < bestDist) { bestDist = d; buyRef = lv; }
          }
        }
        /* If no support below refPrice, pick nearest above (least-bad anchor) */
        if (buyRef == null) {
          var bestAbove = Infinity;
          for (var j = 0; j < supportLevels.length; j++) {
            var lv = supportLevels[j];
            if (lv != null && lv > 0 && lv > refPrice) {
              var d = lv - refPrice;
              if (d < bestAbove) { bestAbove = d; buyRef = lv; }
            }
          }
        }
      }
      if (buyRef == null) buyRef = sma20 != null ? sma20 : (bbLower != null ? bbLower : (anchoredVwap != null ? anchoredVwap : (sma50 != null ? sma50 : null)));

      return {
        c: c, pc: L >= 2 ? cl[L1 - 1] : null, o: op[L1] != null ? op[L1] : c, h: hi[L1], l: lo[L1],
        cl: cl, vo: vo, volRatio: volRatio,
        sma20: sma20, sma50: sma50, sma20Slope5: sma20Slope5, anchoredVwap: anchoredVwap,
        adxL: adxL, plusDI: plusDI, minusDI: minusDI, macdL: macdL, sigL: sigL, rsMansfield: rsMansfield,
        bbUpper: bbUpper, bbLower: bbLower, bbWidth: bbWidth, bbWidthPrev5: bbWidthPrev5,
        stochRsiK: stochRsiK, rsi14: rsi14, atr14: atr14, atr10: atr10,
        efficiencyRatio10: efficiencyRatio10, upDownVolRatio: upDownVolRatio,
        beta: beta, stability20: stability20, spikeLast: spikeLast, gapPct: gapPct,
        weeklyHABullish: weeklyHABullish,
        buyRef: buyRef,
        pullbackDepth: pullbackDepth, nearSupportCount: nearSupportCount,
        swingHigh20: swingHigh20, barsSinceHigh20: barsSinceHigh20
      };
    } catch (e) { return null; }
  }

  /* ── Volatility Normalization Helpers ──────────────────────────────────────
     Compute ATR percentile rank over a lookback window to normalize
     thresholds across different volatility regimes (large cap vs mid cap).
     ────────────────────────────────────────────────────────────────────────── */

  /* Compute ATR percentile rank: where current ATR% sits vs historical.
     Returns 0-100 where 50 = median volatility, 90 = very high vol regime. */
  function calcATRPercentileRank(candles, period) {
    period = period || 14;
    var lookback = 100;
    if (!candles || candles.length < lookback + period) return null;
    var cl = closes(candles), hi = highs(candles), lo = lows(candles);
    var atrVals = [];
    for (var i = period; i < cl.length; i++) {
      var tr = Math.max(hi[i] - lo[i], Math.abs(hi[i] - cl[i - 1]), Math.abs(lo[i] - cl[i - 1]));
      atrVals.push(tr);
    }
    if (atrVals.length < 20) return null;
    /* Use SMA of ATR values over recent window */
    var recentWindow = Math.min(50, atrVals.length);
    var currentATR = 0;
    for (var i = atrVals.length - recentWindow; i < atrVals.length; i++) currentATR += atrVals[i];
    currentATR /= recentWindow;
    /* Count how many historical ATR values are below current */
    var belowCount = 0;
    for (var i = 0; i < atrVals.length - recentWindow; i++) {
      if (atrVals[i] < currentATR) belowCount++;
    }
    var baseCount = atrVals.length - recentWindow;
    return baseCount > 0 ? Math.round(belowCount / baseCount * 100) : null;
  }

  /* Compute volatility regime: { atrPct, atrPercentile, regime }
     regime = 'low' | 'normal' | 'high' based on percentile rank */
  function calcVolRegime(sn, candles) {
    var atrPct = (sn.atr14 != null && sn.c != null && sn.c > 0) ? sn.atr14 / sn.c * 100 : null;
    var atrPercentile = calcATRPercentileRank(candles, 14);
    var regime = atrPercentile == null ? 'normal' : (atrPercentile >= 75 ? 'high' : (atrPercentile <= 25 ? 'low' : 'normal'));
    return { atrPct: atrPct, atrPercentile: atrPercentile, regime: regime };
  }

  /* ── Configurable Entry Score Parameters ─────────────────────────────────
     All thresholds and weights are stored here so the UI can tune them
     without editing source code. Updated via setScoreConfig(). */
  var SCORE_CONFIG = {
    /* Horizon for confidence calculation */
    horizonDays: 10,
    /* Pillar max scores — original 3 pillars (100 total) + Swing Potential (20 bonus).
       Raw total can exceed 100; final score is clamped to [0, 100]. */
    pillarMax: { trendHealth: 35, pullbackQuality: 30, prob4: 35, swingPotential: 20 },
    /* MTF weights */
    tfWeights: { D: 0.55, H: 0.30, W: 0.15 },

    /* Pillar 1: Trend Health (max 35) */
    trendHealth: {
      priceAboveSMA50: 5,
      SMA20AboveSMA50: 5,
      priceAboveSMA20_or_VWAP: 5,
      ADX_DI: 5,
      adxThreshold: 25,
      mansfieldRS: 5,
      mansfieldRSThreshold: 0,
      macdCross: 5,
      weeklyHABullish: 2.5,
      sma20Slope: 2.5,
      sma20SlopeThreshold: 0,
    },
    /* Pillar 2: Pullback Quality (max 30) */
    pullbackQuality: {
      distATR_inner: 7,
      distATR_innerRange: 1.0,
      distATR_outer: 3,
      distATR_outerRange: 1.5,
      candleColor: 4,
      bbWidthSqueeze: 3,
      rsiOversold: 3,
      stochRSIThreshold: 20,
      rsiOversoldNormal: 40,
      rsiOversoldHighVol: 35,
      volumeConfirm: 4,
      volRatioThreshold: 1.5,
      pullbackDepthIdeal: 6,
      pullbackDepthLo: 0.05,
      pullbackDepthHi: 0.15,
      pullbackDepthMax: 0.25,
      supportConfluence: 3,
      supportConfluenceThreshold: 2,
    },
    /* Pillar 3: 4% Probability (max 35) */
    prob4: {
      targetReachable_T1: 10,
      targetATR_threshold1: 2.0,
      targetReachable_T2: 8,
      targetATR_threshold2: 1.5,
      targetReachable_T3: 5,
      targetATR_threshold3: 1.0,
      targetReachable_T4: 2,
      targetDist_T1: 5,
      targetDist_range1_lo: 0.25,
      targetDist_range1_hi: 2.0,
      targetDist_T2: 4,
      targetDist_range2_lo: 0,
      targetDist_range2_hi: 3.0,
      volSweet_T1: 8,
      volPercentile_lo: 30,
      volPercentile_hi: 70,
      volSweet_T2: 4,
      volPercentile_lo2: 20,
      volPercentile_hi2: 80,
      efficiencyRatio: 4,
      efficiencyRatioThreshold: 0.4,
      upDayVolBonus: 5,
      upDayVol_threshold: 1.2,
      upDayVolPenalty: -5,
      upDayVol_low: 0.7,
      directionalBias: 5,
      resistancePenalty: -5,
      resistanceThreshold: 0.04,
      targetPct: 0.04,
    },
    /* Pillar 4: Swing Potential (max 20) */
    swingPotential: { reversalProbability: 14, turnConfirm: 6, higherLow: 2.5, reversalCandle: 2, rsiUpturn: 1.5 },
    /* Modifiers */
    modifiers: {
      lowBetaThreshold: 0.5,
      lowATRPercentile: 25,
      lowExpansionPenalty: -10,
      spikePenalty: -10,
      spikeGapThreshold: 3,
      stabilityThreshold: 0.3,
      stabilityPenalty: -15,
      mtfAlignBonus: 10,
      mtfAlignThreshold: 65,
      mtfAlignFloor: 50,
      highVolATRPercentile: 80,
      highVolERThreshold: 0.5,
      highVolBonus: 5,
    },
    /* Classification thresholds */
    classification: {
      strongBuy: 80,
      buy: 65,
      watchlist: 50,
      neutral: 35,
    },
  };

  var SCORE_CONFIG_DEFAULTS = JSON.parse(JSON.stringify(SCORE_CONFIG));
  /* Bump this whenever pillarMax or any pillar's sub-score weights change.
     Used to auto-discard stale localStorage configs. */
  var SCORE_CONFIG_VERSION = 2;
  function getScoreConfig() { return JSON.parse(JSON.stringify(SCORE_CONFIG)); }
  function getScoreConfigVersion() { return SCORE_CONFIG_VERSION; }
  function getDefaultScoreConfig() { return JSON.parse(JSON.stringify(SCORE_CONFIG_DEFAULTS)); }
  function setScoreConfig(patch) {
    if (!patch) return;
    function merge(target, source) {
      Object.keys(source).forEach(function (k) {
        if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k]) && target[k] && typeof target[k] === 'object') {
          merge(target[k], source[k]);
        } else if (source[k] !== undefined) {
          target[k] = source[k];
        }
      });
    }
    merge(SCORE_CONFIG, patch);
    // Invalidate cached classification for backtest engine
    if (window.TechIndicators) window.TechIndicators._scoreConfigClassification = null;
  }

  /* Pillar 1: Trend Health (max 35).
     Volatility-normalized: ADX threshold stays at 25 (already normalized),
     Mansfield RS threshold tightened to > 0 for cleaner signal. */
  function calcTrendHealthScore(sn) {
    var c = SCORE_CONFIG.trendHealth;
    var s = 0;
    if (sn.c != null && sn.sma50 != null && sn.c > sn.sma50) s += c.priceAboveSMA50;
    if (sn.sma20 != null && sn.sma50 != null && sn.sma20 > sn.sma50) s += c.SMA20AboveSMA50;
    if (sn.c != null && sn.sma20 != null && sn.c > sn.sma20) s += c.priceAboveSMA20_or_VWAP;
    else if (sn.c != null && sn.anchoredVwap != null && sn.c > sn.anchoredVwap) s += c.priceAboveSMA20_or_VWAP;
    if (sn.adxL != null && sn.plusDI != null && sn.minusDI != null && sn.adxL >= c.adxThreshold && sn.plusDI > sn.minusDI) s += c.ADX_DI;
    if (sn.rsMansfield != null && sn.rsMansfield > c.mansfieldRSThreshold) s += c.mansfieldRS;
    if (sn.macdL != null && sn.sigL != null && sn.macdL > sn.sigL) s += c.macdCross;
    if (sn.weeklyHABullish === true) s += c.weeklyHABullish;
    if (sn.sma20Slope5 != null && sn.sma20Slope5 > c.sma20SlopeThreshold && sn.c != null && sn.sma20 != null && sn.c > sn.sma20) s += c.sma20Slope;
    return Math.min(s, SCORE_CONFIG.pillarMax.trendHealth);
  }

   /* Pillar 2: Pullback / Setup Quality (max 30).
     Volatility-normalized: distance to buyRef measured in ATR terms instead of
     fixed percentage. For large cap (1.5% ATR), 1.0 ATR ~ 1.5%. For mid cap
     (3% ATR), 1.0 ATR ~ 3%. This naturally adapts to the stock's volatility. */
  function calcPullbackScore(sn, volRegime) {
    var c = SCORE_CONFIG.pullbackQuality;
    var s = 0;
    if (sn.c != null && sn.buyRef != null && sn.buyRef > 0 && sn.atr14 != null && sn.atr14 > 0) {
      var distATR = (sn.c - sn.buyRef) / sn.atr14;
      if (distATR >= -c.distATR_innerRange && distATR <= c.distATR_innerRange) s += c.distATR_inner;
      else if (distATR >= -c.distATR_outerRange && distATR <= c.distATR_outerRange) s += c.distATR_outer;
    }
    if (sn.c != null && sn.o != null && sn.c > sn.o) s += c.candleColor;
    if (sn.bbWidth != null && sn.bbWidthPrev5 != null && sn.bbWidth < sn.bbWidthPrev5) s += c.bbWidthSqueeze;
    var rsiOversold = (volRegime && volRegime.regime === 'high') ? c.rsiOversoldHighVol : c.rsiOversoldNormal;
    if ((sn.stochRsiK != null && sn.stochRsiK < c.stochRSIThreshold) || (sn.rsi14 != null && sn.rsi14 < rsiOversold)) s += c.rsiOversold;
    if (sn.volRatio != null && sn.volRatio > c.volRatioThreshold && sn.c != null && sn.o != null && sn.c > sn.o) s += c.volumeConfirm;
    if (sn.pullbackDepth != null && sn.pullbackDepth >= c.pullbackDepthLo && sn.pullbackDepth <= c.pullbackDepthHi) s += c.pullbackDepthIdeal;
    if (sn.nearSupportCount != null && sn.nearSupportCount >= c.supportConfluenceThreshold) s += c.supportConfluence;
    return Math.min(s, SCORE_CONFIG.pillarMax.pullbackQuality);
  }

   /* Pillar 3: 4% Probability (max 35).
     Volatility-normalized: ATR percentile rank replaces fixed ATR% ranges,
     and target distance is measured in ATR terms. Horizon-aware: reachability
     thresholds scale with sqrt(horizonDays/10) so a longer holding period
     gives more time to reach the target at the same daily volatility. */
  function calcProb4Score(sn, volRegime) {
    var c = SCORE_CONFIG.prob4;
    var s = 0;
    var atrPct = volRegime ? volRegime.atrPct : (sn.atr14 != null && sn.c != null && sn.c > 0 ? sn.atr14 / sn.c * 100 : null);
    var atrPercentile = volRegime ? volRegime.atrPercentile : 50;

    /* Horizon scaling: longer horizon → more time → target more reachable at same ATR */
    var horizonDays = SCORE_CONFIG.horizonDays || 10;
    var hScale = Math.sqrt(horizonDays / 10);

    if (sn.c != null && sn.c > 0 && sn.atr14 != null && sn.atr14 > 0) {
      var targetATR = (c.targetPct * sn.c) / sn.atr14;
      if (targetATR > c.targetATR_threshold1 * hScale) s += c.targetReachable_T1;
      else if (targetATR > c.targetATR_threshold2 * hScale) s += c.targetReachable_T2;
      else if (targetATR > c.targetATR_threshold3 * hScale) s += c.targetReachable_T3;
      else s += c.targetReachable_T4;
    }

    if (sn.c != null && sn.c > 0 && sn.buyRef != null && sn.buyRef > 0 && sn.atr14 != null && sn.atr14 > 0) {
      var target4 = sn.buyRef * (1 + c.targetPct);
      var distATR = (target4 - sn.c) / sn.atr14;
      if (distATR >= c.targetDist_range1_lo * hScale && distATR <= c.targetDist_range1_hi * hScale) s += c.targetDist_T1;
      else if (distATR >= c.targetDist_range2_lo * hScale && distATR <= c.targetDist_range2_hi * hScale) s += c.targetDist_T2;
    }

    if (atrPercentile != null && atrPercentile >= c.volPercentile_lo && atrPercentile <= c.volPercentile_hi) s += c.volSweet_T1;
    else if (atrPercentile != null && atrPercentile >= c.volPercentile_lo2 && atrPercentile <= c.volPercentile_hi2) s += c.volSweet_T2;

    if (sn.efficiencyRatio10 != null && sn.efficiencyRatio10 > c.efficiencyRatioThreshold) s += c.efficiencyRatio;

    if (sn.upDownVolRatio != null) {
      if (sn.upDownVolRatio >= c.upDayVol_threshold) s += c.upDayVolBonus;
      else if (sn.upDownVolRatio <= c.upDayVol_low) s += c.upDayVolPenalty;
    }

    if (sn.adxL != null && sn.adxL >= 25 && sn.plusDI != null && sn.minusDI != null) {
      if (sn.plusDI > sn.minusDI) s += c.directionalBias;
    }

    if (sn.bbUpper != null && sn.c != null && sn.c > 0) {
      var headroom = (sn.bbUpper - sn.c) / sn.c;
      if (headroom < c.resistanceThreshold) s += c.resistancePenalty;
    }

    return Math.min(s, SCORE_CONFIG.pillarMax.prob4);
  }

  /* ── Pillar 4: Swing Potential (max 20) ──────────────────────────────────
     Reversal-from-pullback probability, not breakout/momentum. Zero unless
     the stock is structurally in a pullback right now. */

  /* Gate only — no scoring here. Uses sn.pullbackDepth / sn.swingHigh20 /
     sn.barsSinceHigh20, all computed once in buildEntrySnapshot (FIX-1). */
  function detectPullbackState(sn) {
    if (sn.pullbackDepth == null || sn.barsSinceHigh20 == null || sn.swingHigh20 == null) return null;
    var inPullback = sn.pullbackDepth >= 0.04 && sn.pullbackDepth <= 0.25 &&
                      sn.barsSinceHigh20 >= 2 && sn.barsSinceHigh20 <= 15;
    return { inPullback: inPullback, barsSinceHigh: sn.barsSinceHigh20, swingHigh20: sn.swingHigh20 };
  }

  function empiricalReversalRate(candles, horizonDays) {
    var cl = closes(candles), hi = highs(candles), L = cl.length;
    if (L < 80) return null;
    var hits = 0, total = 0;
    for (var i = 25; i < L - horizonDays; i++) {
      var swHi = -Infinity, hIdx = i;
      for (var j = Math.max(0, i - 19); j <= i; j++) { if (hi[j] > swHi) { swHi = hi[j]; hIdx = j; } }
      var depth = swHi > 0 ? (swHi - cl[i]) / swHi : null;
      var barsSince = i - hIdx;
      if (depth == null || depth < 0.04 || depth > 0.25 || barsSince < 2 || barsSince > 15) continue;
      var maxFwd = -Infinity;
      for (var k = i + 1; k <= i + horizonDays && k < L; k++) { if (hi[k] > maxFwd) maxFwd = hi[k]; }
      total++;
      if (maxFwd >= swHi * 0.98) hits++;
    }
    return total >= 8 ? { rate: hits / total, n: total } : null;
  }

  /* Mean-reversion-adjusted GBM barrier touch. Same closed-form reflection
     formula as computeHorizonConfidence's logProbTouch, reversion drift
     instead of trend drift, recovery barrier instead of +4% target.
     Sigma now comes from the SHARED helper (FIX-2). */
  function lognormalReversalProb(candles, sn, pbState, horizonDays) {
    var cl = closes(candles), L = cl.length;
    if (L < 60) return null;
    var sma20 = calcSMA(candles, 20);
    var rets = [], dev = [];
    for (var i = L - 60; i < L - 1; i++) {
      if (cl[i] > 0 && cl[i + 1] > 0 && sma20[i] != null && sma20[i] > 0) {
        rets.push(Math.log(cl[i + 1] / cl[i]));
        dev.push(Math.log(cl[i] / sma20[i]));
      }
    }
    if (rets.length < 30) return null;
    var n = rets.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) { sx += dev[i]; sy += rets[i]; sxx += dev[i] * dev[i]; sxy += dev[i] * rets[i]; }
    var denom = n * sxx - sx * sx;
    if (denom === 0) return null;
    var theta = (n * sxy - sx * sy) / denom;
    var alpha = (sy - theta * sx) / n;
    var atrPct = (sn.atr14 != null && sn.c > 0) ? sn.atr14 / sn.c * 100 : null;
    var sigmaDaily = calcBlendedDailySigma(candles, atrPct);
    if (!sigmaDaily || sigmaDaily <= 0) return null;

    var curDev = Math.log(cl[L - 1] / sma20[L - 1]);
    var muDaily = alpha + theta * curDev;
    var muLog = muDaily - 0.5 * sigmaDaily * sigmaDaily;
    var b = Math.log(pbState.swingHigh20 / cl[L - 1]);
    if (b <= 0) return { prob: 0.95 };
    var sdN = sigmaDaily * Math.sqrt(horizonDays);
    var muT = muLog * horizonDays;
    var p = normCdf((muT - b) / sdN) + Math.exp(2 * muLog * b / (sigmaDaily * sigmaDaily)) * normCdf((-muT - b) / sdN);
    return { prob: Math.max(1e-6, Math.min(1 - 1e-6, p)) };
  }

  var SWING_CAL = { p0: 0.30, k: 34.0 };

  function calcSwingPotentialScore(candles, sn) {
    var c = SCORE_CONFIG.swingPotential;
    var horizonDays = SCORE_CONFIG.horizonDays || 10;
    var pbState = detectPullbackState(sn);
    if (!pbState || !pbState.inPullback) return 0;

    var emp = empiricalReversalRate(candles, horizonDays);
    var logM = lognormalReversalProb(candles, sn, pbState, horizonDays);
    var p = emp ? emp.rate : (logM ? logM.prob : null);
    if (p == null) return 0;

    var display = 50 + (Math.log(p / (1 - p)) - Math.log(SWING_CAL.p0 / (1 - SWING_CAL.p0))) * SWING_CAL.k;
    var probScore = (clamp(display, 0, 100) / 100) * c.reversalProbability;

    var cl = closes(candles), hi = highs(candles), lo = lows(candles), op = opens(candles), L = cl.length;

    var priorLow = Infinity;
    for (var i = Math.max(0, L - pbState.barsSinceHigh - 5); i < L - 1; i++) { if (lo[i] < priorLow) priorLow = lo[i]; }
    var turnScore = 0;
    if (lo[L - 1] > priorLow) turnScore += c.higherLow;

    /* [FIX-3] Pure hammer shape — body near top of range, long lower wick,
       short upper wick. No close>open requirement, so this no longer
       duplicates Pullback Quality's candleColor condition. */
    var body = Math.abs(cl[L - 1] - op[L - 1]);
    var lowerWick = Math.min(cl[L - 1], op[L - 1]) - lo[L - 1];
    var upperWick = hi[L - 1] - Math.max(cl[L - 1], op[L - 1]);
    var range = hi[L - 1] - lo[L - 1];
    if (range > 0 && lowerWick > 2 * body && upperWick < body &&
        (Math.max(cl[L - 1], op[L - 1]) - lo[L - 1]) / range > 0.6) {
      turnScore += c.reversalCandle;
    }

    var r3 = lastVals(calcRSI(candles, 14), 3);
    if (r3.length === 3 && r3[0] != null && r3[2] != null && r3[0] < 40 && r3[2] > r3[0]) turnScore += c.rsiUpturn;

    /* Cap turn confirmation sub-components at turnConfirm max */
    turnScore = Math.min(turnScore, c.turnConfirm);

    return Math.min(SCORE_CONFIG.pillarMax.swingPotential, probScore + turnScore);
  }

  /* Modifiers (±15 each): low-expansion, spike day, stability, MTF alignment (gradient).
     Volatility-normalized: use ATR percentile rank instead of fixed ATR%. */
  function buildEntryModifiers(sn, opts) {
    opts = opts || {};
    var items = [];
    var volRegime = opts.volRegime || null;
    var atrPercentile = volRegime ? volRegime.atrPercentile : 50;
    var mc = SCORE_CONFIG.modifiers;

    if (sn && sn.beta != null && sn.beta < mc.lowBetaThreshold && atrPercentile != null && atrPercentile < mc.lowATRPercentile) {
      items.push({ reason: "Low beta + low volatility percentile (no expansion)", amount: mc.lowExpansionPenalty });
    }

    if (opts.spikeDay) items.push({ reason: "Spike detected (gap/abnormal move) — also triggers hard cap ≤49", amount: mc.spikePenalty });

    if (sn && sn.stability20 != null && sn.stability20 < mc.stabilityThreshold) {
      items.push({ reason: "Unstable price action (stability < " + mc.stabilityThreshold + ")", amount: mc.stabilityPenalty });
    }

    if (opts.mtfAlignFactor > 0) {
      var mtfAmt = Math.round(mc.mtfAlignBonus * opts.mtfAlignFactor * 10) / 10;
      items.push({ reason: "MTF alignment (" + Math.round(opts.mtfAlignFactor * 100) + "%)", amount: mtfAmt });
    }

    if (atrPercentile != null && atrPercentile >= mc.highVolATRPercentile && sn && sn.efficiencyRatio10 != null && sn.efficiencyRatio10 > mc.highVolERThreshold) {
      items.push({ reason: "High momentum in high-vol regime", amount: mc.highVolBonus });
    }

    return items;
  }

   /* Per-timeframe 4-pillar scoring. `tf` is 'H' | 'D' | 'W'. */
  function scoreEntryPillarsForTF(candles, indexCandles, tf) {
    var sn = buildEntrySnapshot(candles, indexCandles, tf);
    if (!sn) return null;
    var volRegime = calcVolRegime(sn, candles);
    return {
      trendHealth: calcTrendHealthScore(sn),
      pullbackQuality: calcPullbackScore(sn, volRegime),
      prob4: calcProb4Score(sn, volRegime),
      /* Swing Potential is daily-only: the 2–15 bar pullback window is
         inherently a daily-scale judgment. Returning null for H/W lets
         the MTF aggregation's wSum exclusion handle it — no dilution. */
      swingPotential: tf === 'D' ? calcSwingPotentialScore(candles, sn) : null,
      spike: sn.spikeLast === true ? 5 : 0,
      stability: round(Math.max(0, Math.min(10, (1 - (sn.stability20 != null ? sn.stability20 : 1)) * 10)), 1),
      volRegime: volRegime,
      sn: sn
    };
  }

   /* Entry Score (single timeframe, daily) — new 4-pillar model. */
  function computeEntryScore(candles, indexCandles) {
    if (!candles || candles.length < 50) return { entry_score: null, reason: 'insufficient_data', need: 50, got: candles ? candles.length : 0 };
    var sn = buildEntrySnapshot(candles, indexCandles, 'D');
    if (!sn || sn.c == null) return { entry_score: null, reason: 'insufficient_data' };

    var volRegime = calcVolRegime(sn, candles);
    var trendHealth = calcTrendHealthScore(sn);
    var pullbackQuality = calcPullbackScore(sn, volRegime);
    var prob4 = calcProb4Score(sn, volRegime);
    var swingPotential = calcSwingPotentialScore(candles, sn);
    var rawTotal = trendHealth + pullbackQuality + prob4 + swingPotential;

    var spikeDay = sn.spikeLast === true || (sn.gapPct != null && Math.abs(sn.gapPct) > SCORE_CONFIG.modifiers.spikeGapThreshold);
    var modifierItems = buildEntryModifiers(sn, { spikeDay: spikeDay, volRegime: volRegime });

    var penalties = 0, bonuses = 0, penaltyItems = [], bonusItems = [];
    modifierItems.forEach(function (it) {
      if (it.amount < 0) { penalties += it.amount; penaltyItems.push(it); } else { bonuses += it.amount; bonusItems.push(it); }
    });
    var modifiers = penalties + bonuses;

    var finalScore = Math.max(0, Math.min(100, rawTotal + modifiers));

    /* Spike gate (hard override): never score above NEUTRAL on the day of an abnormal print */
    var guard = computeSpikeGuard(candles);
    if (guard.todaySpike) finalScore = Math.min(finalScore, 49);

    var cls = classifyScore(finalScore);

    return {
      entry_score: round(finalScore, 1),
      raw_score: round(rawTotal, 1),
      trendHealth: round(trendHealth, 1), trendHealthMax: SCORE_CONFIG.pillarMax.trendHealth,
      pullbackQuality: round(pullbackQuality, 1), pullbackQualityMax: SCORE_CONFIG.pillarMax.pullbackQuality,
      prob4: round(prob4, 1), prob4Max: SCORE_CONFIG.pillarMax.prob4,
      swingPotential: round(swingPotential, 1), swingPotentialMax: SCORE_CONFIG.pillarMax.swingPotential,
      modifiers: round(modifiers, 1),
      penalties: round(penalties, 1), bonuses: round(bonuses, 1),
      penalty_items: penaltyItems, bonus_items: bonusItems,
      classification: cls.classification, signal: cls.signal, allocation_pct: cls.allocation_pct,
      todaySpike: guard.todaySpike, sessionReturnPct: guard.sessionReturnPct, gapPct: guard.gapPct,
      dominanceRatio: guard.dominanceRatio, efficiencyRatio10: guard.efficiencyRatio10,
      volRegime: volRegime,
      details: {
        trendHealth: round(trendHealth, 2), pullbackQuality: round(pullbackQuality, 2), prob4: round(prob4, 2), swingPotential: round(swingPotential, 2),
        spike: sn.spikeLast === true ? 5 : 0,
        stability: round(Math.max(0, Math.min(10, (1 - (sn.stability20 != null ? sn.stability20 : 1)) * 10)), 1)
      }
    };
  }

   /* Multi-timeframe Entry Score — new 4-pillar model:
      each pillar is computed per timeframe, then each pillar is aggregated across
      timeframes as D*0.55 + H*0.30 + W*0.15 (renormalized over available timeframes
      via wSum division) and capped at its pillar max (35 / 30 / 35 / 20) at the combined
     level. Modifiers run once on the Daily snapshot only (the primary decision
     frame); the MTF +10 needs weekly+daily ≥ 65. */
  function computeMultiTFEntryScore(tfResults, indexCandles, indexWeeklyCandles) {
    if (!tfResults || tfResults.length === 0) return { multiTF_score: null, reason: 'no_timeframes' };

    function findTF(label) {
      var aliases = { H: ['H', 'h', '1h', 'hourly', '1H'], D: ['D', 'd', '1d', 'day', 'daily', '1D'], W: ['W', 'w', '1w', 'week', 'weekly', '1W'] };
      for (var i = 0; i < tfResults.length; i++) {
        var t = tfResults[i].timeframe;
        if (aliases[label] && aliases[label].indexOf(t) !== -1) return tfResults[i];
      }
      return null;
    }

    var hTF = findTF('H'), dTF = findTF('D'), wTF = findTF('W');
    var baseTF = (dTF && dTF.candles && dTF.candles.length >= 50) ? dTF
               : (wTF && wTF.candles && wTF.candles.length >= 50) ? wTF
               : (hTF && hTF.candles && hTF.candles.length >= 50) ? hTF
               : tfResults[0] || null;
    if (!baseTF || !baseTF.candles || baseTF.candles.length < 50) return { multiTF_score: null, reason: 'no_valid_scores' };

    var perTF = {};
    perTF.H = (hTF && hTF.candles && hTF.candles.length >= 50) ? scoreEntryPillarsForTF(hTF.candles, indexCandles, 'H') : null;
    perTF.D = (dTF && dTF.candles && dTF.candles.length >= 50) ? scoreEntryPillarsForTF(dTF.candles, indexCandles, 'D') : null;
    perTF.W = (wTF && wTF.candles && wTF.candles.length >= 50) ? scoreEntryPillarsForTF(wTF.candles, indexWeeklyCandles || indexCandles, 'W') : null;
    if (!perTF.H && !perTF.D && !perTF.W) return { multiTF_score: null, reason: 'no_valid_scores' };

    var weights = SCORE_CONFIG.tfWeights;
    var PILLARS = [
      { key: 'trendHealth', max: SCORE_CONFIG.pillarMax.trendHealth },
      { key: 'pullbackQuality', max: SCORE_CONFIG.pillarMax.pullbackQuality },
      { key: 'prob4', max: SCORE_CONFIG.pillarMax.prob4 },
      { key: 'swingPotential', max: SCORE_CONFIG.pillarMax.swingPotential }
    ];
    var agg = {};
    PILLARS.forEach(function (pillar) {
      var wSum = 0, acc = 0;
      ['D', 'H', 'W'].forEach(function (label) {
        var p = perTF[label];
        if (p && p[pillar.key] !== null && p[pillar.key] !== undefined) { var w = weights[label]; acc += w * p[pillar.key]; wSum += w; }
      });
      agg[pillar.key] = wSum > 0 ? Math.min(pillar.max, acc / wSum) : 0;
    });
    var rawTotal = agg.trendHealth + agg.pullbackQuality + agg.prob4 + agg.swingPotential;

    var baseSn = null;
    if (dTF && dTF.candles && dTF.candles.length >= 50) {
      baseSn = (perTF.D && perTF.D.sn) || buildEntrySnapshot(dTF.candles, indexCandles, 'D');
    }
    if (!baseSn) {
      var fbLabel = (wTF && wTF.candles && wTF.candles.length >= 50) ? 'W' : 'H';
      var fbTF = (wTF && wTF.candles && wTF.candles.length >= 50) ? wTF : hTF;
      baseSn = (perTF[fbLabel] && perTF[fbLabel].sn) || buildEntrySnapshot(fbTF.candles, indexCandles, fbLabel);
    }

    /* Alignment check: "is the core trend aligned daily-vs-weekly?"
       Excludes Swing Potential entirely — it's a daily-only reversal bonus,
       not a trend-alignment signal. Both ceilings are 100, no normalization. */
    var wRaw = perTF.W ? (perTF.W.trendHealth + perTF.W.pullbackQuality + perTF.W.prob4) : null;
    var dRaw = perTF.D ? (perTF.D.trendHealth + perTF.D.pullbackQuality + perTF.D.prob4) : null;
    var mc = SCORE_CONFIG.modifiers;
    var _mtfFloor = mc.mtfAlignFloor != null ? mc.mtfAlignFloor : 50;
    var _mtfRange = (mc.mtfAlignThreshold || 65) - _mtfFloor;
    var _wFactor = wRaw !== null && _mtfRange > 0 ? Math.max(0, Math.min(1, (wRaw - _mtfFloor) / _mtfRange)) : 0;
    var _dFactor = dRaw !== null && _mtfRange > 0 ? Math.max(0, Math.min(1, (dRaw - _mtfFloor) / _mtfRange)) : 0;
    var mtfAlignFactor = _wFactor * _dFactor;

    var spikeDay = false;
    if (dTF && dTF.candles && perTF.D) {
      spikeDay = perTF.D.sn.spikeLast === true || (perTF.D.sn.gapPct != null && Math.abs(perTF.D.sn.gapPct) > mc.spikeGapThreshold);
    }
    var volRegime = perTF.D && perTF.D.volRegime ? perTF.D.volRegime : (baseSn ? calcVolRegime(baseSn, dTF ? dTF.candles : null) : null);
    var modifierItems = buildEntryModifiers(baseSn, { spikeDay: spikeDay, mtfAlignFactor: mtfAlignFactor, volRegime: volRegime });

    var penalties = 0, bonuses = 0, penaltyItems = [], bonusItems = [];
    modifierItems.forEach(function (it) {
      if (it.amount < 0) { penalties += it.amount; penaltyItems.push(it); } else { bonuses += it.amount; bonusItems.push(it); }
    });
    var modifiers = penalties + bonuses;

    var finalScore = Math.max(0, Math.min(100, rawTotal + modifiers));

    /* Spike gate (hard override): never score above NEUTRAL on the day of an abnormal print */
    if (spikeDay) finalScore = Math.min(finalScore, 49);

    var cls = classifyScore(finalScore);

    var tfDetails = [];
    ['D', 'H', 'W'].forEach(function (label) {
      var tf = findTF(label);
      var p = perTF[label];
      if (tf && p) {
        var tRaw = p.trendHealth + p.pullbackQuality + p.prob4 + p.swingPotential;
        var tCls = classifyScore(tRaw);
        tfDetails.push({
          timeframe: tf.timeframe,
          weight: String(Math.round(weights[label] * 100)) + '%',
          entryScore: round(tRaw, 1),
          trendHealth: round(p.trendHealth, 1), trendHealthMax: SCORE_CONFIG.pillarMax.trendHealth,
          pullbackQuality: round(p.pullbackQuality, 1), pullbackQualityMax: SCORE_CONFIG.pillarMax.pullbackQuality,
          prob4: round(p.prob4, 1), prob4Max: SCORE_CONFIG.pillarMax.prob4,
          swingPotential: round(p.swingPotential, 1), swingPotentialMax: SCORE_CONFIG.pillarMax.swingPotential,
          modifiers: 0,
          penalties: 0, bonuses: 0,
          raw_score: round(tRaw, 1),
          spike: round(p.spike, 1), stability: round(p.stability, 1),
          classification: tCls.classification,
          allocation_pct: tCls.allocation_pct
        });
      }
    });

    var guard = dTF && dTF.candles ? computeSpikeGuard(dTF.candles) : { todaySpike: false, sessionReturnPct: null, gapPct: null, dominanceRatio: null, efficiencyRatio10: null };

    return {
      multiTF_score: round(finalScore, 1),
      raw_score: round(rawTotal, 1),
      trendHealth: round(agg.trendHealth, 1), trendHealthMax: SCORE_CONFIG.pillarMax.trendHealth,
      pullbackQuality: round(agg.pullbackQuality, 1), pullbackQualityMax: SCORE_CONFIG.pillarMax.pullbackQuality,
      prob4: round(agg.prob4, 1), prob4Max: SCORE_CONFIG.pillarMax.prob4,
      swingPotential: round(agg.swingPotential, 1), swingPotentialMax: SCORE_CONFIG.pillarMax.swingPotential,
      modifiers: round(modifiers, 1),
      penalties: round(penalties, 1), bonuses: round(bonuses, 1),
      penalty_items: penaltyItems, bonus_items: bonusItems,
      classification: cls.classification, signal: cls.signal, allocation_pct: cls.allocation_pct,
      todaySpike: guard.todaySpike, sessionReturnPct: guard.sessionReturnPct, gapPct: guard.gapPct,
      dominanceRatio: guard.dominanceRatio, efficiencyRatio10: guard.efficiencyRatio10,
      timeframesUsed: tfDetails.length, details: tfDetails
    };
  }

  function computeEntryScoreLegacy(candles, indexCandles) {
    if (!candles || candles.length < 50) return { entry_score: null, reason: 'insufficient_data', need: 50, got: candles ? candles.length : 0 };
    var comps = scoreEntryComponentsForTF(candles, indexCandles);
    var sn = comps.sn;
    var guard = computeSpikeGuard(candles);

    /* ── compute pillar scores from the 12 sub-scores (money-flow family capped first) ── */
    applyMoneyFlowCap(comps);
    var trendScore = comps.maStack + comps.macdTsiStcAo + comps.adxStPsarViAroon;
    var momentumScore = comps.rsiStochRsiWillR + comps.cciRocMomFi + comps.mfiCmf;
    var volumeScore = comps.obvPvtKvo + comps.vwapAnchored + comps.vpSqueezeAd;
    var structureScore = comps.bbKcDcChandelier + comps.ichimoku + comps.darvasStructure;
    var rawTotal = trendScore + momentumScore + volumeScore + structureScore;

    /* ── penalties (Section 11) ── */
    var penaltyItems = buildEntryPenaltyItems(sn, {
      weeklyTrend: sn.sma50 !== null ? (sn.c < sn.sma50 ? 'bearish' : 'bullish') : 'neutral',
      dailyBullish: sn.hma16 !== null && sn.c > sn.hma16,
      spikeSub: comps.spike,
      stabSub: comps.stability,
      dominanceRatio: guard.dominanceRatio
    });

    /* ── reversal-risk counterfactual penalty (divergence / climax / exhaustion) ── */
    var reversalRisk = calcReversalRisk(candles);
    if (reversalRisk >= 7) penaltyItems.push({ reason: "High reversal risk (divergence/climax)", amount: -8 });
    else if (reversalRisk >= 5) penaltyItems.push({ reason: "Reversal risk (divergence/climax)", amount: -4 });

    /* ── bonuses (Section 11) ── */
    var idxTrendScore = computeIndexTrendScore(indexCandles);
    var bonusItems = buildEntryBonusItems(sn, {
      hourlyBullish: sn.hma16 != null && sn.c > sn.hma16,
      dailyBullish: sn.c > sn.ema21,
      weeklyBullish: sn.sma50 !== null && sn.c > sn.sma50,
      idxTrendScore: idxTrendScore,
      efficiencyRatio10: guard.efficiencyRatio10,
      todaySpike: guard.todaySpike
    });

    /* ── confluence-persistence bonus (built-up alignment vs single-bar flip) ── */
    var persist = calcConfluencePersistence(sn);
    if (persist >= 8) bonusItems.push({ reason: "Confluence aligned " + persist + " bars", amount: 3 });
    else if (persist >= 4) bonusItems.push({ reason: "Confluence aligned " + persist + " bars", amount: 2 });
    else if (persist >= 2) bonusItems.push({ reason: "Confluence aligned " + persist + " bars", amount: 1 });

    var penalties = 0;
    penaltyItems.forEach(function(it) { penalties += it.amount; });
    var bonuses = 0;
    bonusItems.forEach(function(it) { bonuses += it.amount; });

    var finalScore = Math.max(0, Math.min(100, rawTotal + penalties + bonuses));

    /* ── Spike gate (hard override): never score above NEUTRAL on the day of an abnormal print ── */
    if (guard.todaySpike) finalScore = Math.min(finalScore, 49);

    /* ── classification ── */
    var cls = classifyScore(finalScore);

    return {
      entry_score: round(finalScore, 1),
      raw_score: round(rawTotal, 1),
      trend: round(trendScore, 1), momentum: round(momentumScore, 1),
      volume: round(volumeScore, 1), structure: round(structureScore, 1),
      penalties: round(penalties, 1), bonuses: round(bonuses, 1),
      penalty_items: penaltyItems, bonus_items: bonusItems,
      classification: cls.classification, signal: cls.signal, allocation_pct: cls.allocation_pct,
      todaySpike: guard.todaySpike, dominanceRatio: guard.dominanceRatio, efficiencyRatio10: guard.efficiencyRatio10,
      details: {
        maStack: round(comps.maStack, 2), macdTsiStcAo: round(comps.macdTsiStcAo, 2), adxStPsarViAroon: round(comps.adxStPsarViAroon, 2),
        rsiStochRsiWillR: round(comps.rsiStochRsiWillR, 2), cciRocMomFi: round(comps.cciRocMomFi, 2), mfiCmf: round(comps.mfiCmf, 2),
        obvPvtKvo: round(comps.obvPvtKvo, 2), vwapAnchored: round(comps.vwapAnchored, 2), vpSqueezeAd: round(comps.vpSqueezeAd, 2),
        bbKcDcChandelier: round(comps.bbKcDcChandelier, 2), ichimoku: round(comps.ichimoku, 2), darvasStructure: round(comps.darvasStructure, 2),
        spike: comps.spike, stability: comps.stability, indexTrendScore: idxTrendScore
      }
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LEGACY Multi-timeframe Entry Score — old 12-sub-score model (7.1-10.3).
     Kept only for regression/back-compat harnesses. Production entry scoring
     uses the new 4-pillar computeMultiTFEntryScore above.
     ══════════════════════════════════════════════════════════════════════════ */
  function computeMultiTFEntryScoreLegacy(tfResults, indexCandles, indexWeeklyCandles) {
    if (!tfResults || tfResults.length === 0) return { multiTF_score: null, reason: 'no_timeframes' };

    function findTF(label) {
      var aliases = { H: ['H', 'h', '1h', 'hourly', '1H'], D: ['D', 'd', '1d', 'day', 'daily', '1D'], W: ['W', 'w', '1w', 'week', 'weekly', '1W'] };
      for (var i = 0; i < tfResults.length; i++) {
        var t = tfResults[i].timeframe;
        if (aliases[label] && aliases[label].indexOf(t) !== -1) return tfResults[i];
      }
      return null;
    }
    function lastCloseOf(cands) {
      if (!cands || !cands.length) return null;
      var cl = closes(cands);
      return cl.length ? cl[cl.length - 1] : null;
    }
    function lastEma21Of(cands) {
      if (!cands || cands.length < 21) return null;
      var v = lastVals(calcEMA(cands, 21), 1);
      return v.length ? v[0] : null;
    }
    function stabLookbackFor(label) {
      return label === 'W' ? 6 : 10;
    }

    var hTF = findTF('H'), dTF = findTF('D'), wTF = findTF('W');
    var baseTF = (dTF && dTF.candles && dTF.candles.length >= 50) ? dTF
               : (wTF && wTF.candles && wTF.candles.length >= 50) ? wTF
               : (hTF && hTF.candles && hTF.candles.length >= 50) ? hTF
               : tfResults[0] || null;
    if (!baseTF || !baseTF.candles || baseTF.candles.length < 50) return { multiTF_score: null, reason: 'no_valid_scores' };

    /* ── per-timeframe component snapshots (12 sub-scores + spike/stability) ── */
    var perTF = {};
    perTF.H = (hTF && hTF.candles && hTF.candles.length >= 50) ? scoreEntryComponentsForTF(hTF.candles, indexCandles, stabLookbackFor('H'), 2) : null;
    perTF.D = (dTF && dTF.candles && dTF.candles.length >= 50) ? scoreEntryComponentsForTF(dTF.candles, indexCandles, stabLookbackFor('D'), 3) : null;
    perTF.W = (wTF && wTF.candles && wTF.candles.length >= 50) ? scoreEntryComponentsForTF(wTF.candles, indexWeeklyCandles || indexCandles, stabLookbackFor('W'), 5) : null;
    if (!perTF.H && !perTF.D && !perTF.W) return { multiTF_score: null, reason: 'no_valid_scores' };

    var SUBKEYS = ['maStack', 'macdTsiStcAo', 'adxStPsarViAroon', 'rsiStochRsiWillR', 'cciRocMomFi', 'mfiCmf',
                   'obvPvtKvo', 'vwapAnchored', 'vpSqueezeAd', 'bbKcDcChandelier', 'ichimoku', 'darvasStructure',
                   'spike', 'stability'];
    var weights = { H: 0.30, D: 0.50, W: 0.20 };

    /* ── weighted aggregation H*0.30 + D*0.50 + W*0.20 (renormalized) ── */
    var comps = {};
    SUBKEYS.forEach(function (key) {
      var wSum = 0, acc = 0;
      ['H', 'D', 'W'].forEach(function (label) {
        var c = perTF[label];
        if (c && c[key] !== null && c[key] !== undefined) { var w = weights[label]; acc += w * c[key]; wSum += w; }
      });
      comps[key] = wSum > 0 ? acc / wSum : 0;
    });

    /* ── aggregate pillars from the 12 sub-scores (money-flow family capped first) ── */
    applyMoneyFlowCap(comps);
    var trendScore = comps.maStack + comps.macdTsiStcAo + comps.adxStPsarViAroon;
    var momentumScore = comps.rsiStochRsiWillR + comps.cciRocMomFi + comps.mfiCmf;
    var volumeScore = comps.obvPvtKvo + comps.vwapAnchored + comps.vpSqueezeAd;
    var structureScore = comps.bbKcDcChandelier + comps.ichimoku + comps.darvasStructure;
    var rawTotal = trendScore + momentumScore + volumeScore + structureScore;

    /* ── Section 11 penalties (real H/D/W bullishness + weighted spike/stability) ── */
    var weeklyCl = lastCloseOf(wTF ? wTF.candles : null);
    var weeklyEma21 = lastEma21Of(wTF ? wTF.candles : null);
    var dailyCl = lastCloseOf(dTF ? dTF.candles : baseTF.candles);
    var dailyEma21 = lastEma21Of(dTF ? dTF.candles : baseTF.candles);
    var weeklyBearish = weeklyCl !== null && weeklyEma21 !== null && weeklyCl < weeklyEma21;
    var dailyBullish = dailyCl !== null && dailyEma21 !== null && dailyCl > dailyEma21;
    var baseSn = (perTF.D || perTF.H || perTF.W).sn;
    var guard = dTF && dTF.candles ? computeSpikeGuard(dTF.candles) : { todaySpike: false, sessionReturnPct: null, gapPct: null, dominanceRatio: null, efficiencyRatio10: null };
    var penaltyItems = buildEntryPenaltyItems(baseSn, {
      weeklyTrend: weeklyBearish ? 'bearish' : 'bullish',
      dailyBullish: dailyBullish,
      spikeSub: comps.spike,
      stabSub: comps.stability,
      dominanceRatio: guard.dominanceRatio
    });

    /* ── reversal-risk counterfactual penalty on the base/daily candles ── */
    var baseCandles = (dTF && dTF.candles) || (baseTF && baseTF.candles) || null;
    var reversalRisk = calcReversalRisk(baseCandles);
    if (reversalRisk >= 7) penaltyItems.push({ reason: "High reversal risk (divergence/climax)", amount: -8 });
    else if (reversalRisk >= 5) penaltyItems.push({ reason: "Reversal risk (divergence/climax)", amount: -4 });

    /* ── Section 11 bonuses (real H/D/W bullishness + index D+W trend score) ── */
    var hourlyBullish = false, weeklyBullish = false;
    var hCl = lastCloseOf(hTF ? hTF.candles : null), hEma21 = lastEma21Of(hTF ? hTF.candles : null);
    if (hCl !== null && hEma21 !== null && hCl > hEma21) hourlyBullish = true;
    if (weeklyCl !== null && weeklyEma21 !== null && weeklyCl > weeklyEma21) weeklyBullish = true;
    var idxTrendScore = computeIndexTrendScore(indexCandles, indexWeeklyCandles);
    var bonusItems = buildEntryBonusItems(baseSn, {
      hourlyBullish: hourlyBullish,
      dailyBullish: dailyBullish,
      weeklyBullish: weeklyBullish,
      idxTrendScore: idxTrendScore,
      efficiencyRatio10: guard.efficiencyRatio10,
      todaySpike: guard.todaySpike
    });

    /* ── confluence-persistence bonus (built-up alignment vs single-bar flip) ── */
    var persist = calcConfluencePersistence(baseSn);
    if (persist >= 8) bonusItems.push({ reason: "Confluence aligned " + persist + " bars", amount: 3 });
    else if (persist >= 4) bonusItems.push({ reason: "Confluence aligned " + persist + " bars", amount: 2 });
    else if (persist >= 2) bonusItems.push({ reason: "Confluence aligned " + persist + " bars", amount: 1 });

    var penalties = 0;
    penaltyItems.forEach(function (it) { penalties += it.amount; });
    var bonuses = 0;
    bonusItems.forEach(function (it) { bonuses += it.amount; });

    var finalScore = Math.max(0, Math.min(100, rawTotal + penalties + bonuses));

    /* ── Spike gate (hard override): never score above NEUTRAL on the day of an abnormal print ── */
    if (guard.todaySpike) finalScore = Math.min(finalScore, 49);

    var cls = classifyScore(finalScore);

    /* ── per-TF detail rows for the UI / compat shim ── */
    var tfDetails = [];
    ['H', 'D', 'W'].forEach(function (label) {
      var tf = findTF(label);
      var c = perTF[label];
      if (tf && c) {
        var tTrend = c.maStack + c.macdTsiStcAo + c.adxStPsarViAroon;
        var tMom = c.rsiStochRsiWillR + c.cciRocMomFi + c.mfiCmf;
        var tVol = c.obvPvtKvo + c.vwapAnchored + c.vpSqueezeAd;
        var tStruct = c.bbKcDcChandelier + c.ichimoku + c.darvasStructure;
        var tRaw = tTrend + tMom + tVol + tStruct;
        var tCls = classifyScore(tRaw);
        tfDetails.push({
          timeframe: tf.timeframe,
          weight: String(Math.round(weights[label] * 100)) + '%',
          entryScore: round(tRaw, 1),
          trend: round(tTrend, 1), momentum: round(tMom, 1),
          volume: round(tVol, 1), structure: round(tStruct, 1),
          penalties: 0, bonuses: 0,
          raw_score: round(tRaw, 1),
          spike: round(c.spike, 1), stability: round(c.stability, 1),
          classification: tCls.classification,
          allocation_pct: tCls.allocation_pct
        });
      }
    });

    return {
      multiTF_score: round(finalScore, 1),
      raw_score: round(rawTotal, 1),
      trend: round(trendScore, 1), momentum: round(momentumScore, 1),
      volume: round(volumeScore, 1), structure: round(structureScore, 1),
      maStackCrossTF: round(comps.maStack, 2),
      penalties: round(penalties, 1), bonuses: round(bonuses, 1),
      penalty_items: penaltyItems, bonus_items: bonusItems,
      classification: cls.classification, signal: cls.signal, allocation_pct: cls.allocation_pct,
      indexTrendScore: idxTrendScore,
      spike: round(comps.spike, 1), stability: round(comps.stability, 1),
      todaySpike: guard.todaySpike, sessionReturnPct: guard.sessionReturnPct, gapPct: guard.gapPct,
      dominanceRatio: guard.dominanceRatio, efficiencyRatio10: guard.efficiencyRatio10,
      timeframesUsed: tfDetails.length, details: tfDetails
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Multi-timeframe Exit Score — weights: H=25%, D=50%, W=25%
     ══════════════════════════════════════════════════════════════════════════ */
  function computeMultiTFExitScore(tfResults, position, indexCandles) {
    if (!tfResults || tfResults.length === 0) return { multiTF_exit_score: null, reason: 'no_timeframes' };
    position = position || {};

    var weights = { H: 0.25, h: 0.25, '1h': 0.25, hourly: 0.25, '1H': 0.25,
                    D: 0.50, d: 0.50, day: 0.50, daily: 0.50, '1D': 0.50,
                    W: 0.25, w: 0.25, week: 0.25, weekly: 0.25, '1W': 0.25 };
    var totalScore = 0, totalWeight = 0;
    var activeTFs = 0, tfDetails = [];
    var compTotal = { tf1a: 0, tf1b: 0, tf1c: 0, tf2a: 0, tf2b: 0, tf2c: 0, tf3a: 0, tf3b: 0, tf3c: 0, tf4a: 0, tf4b: 0, tf4c: 0 };
    var primarySn = null;

    tfResults.forEach(function (tf) {
      var w = weights[tf.timeframe] || 0;
      if (w === 0 || !tf.candles || tf.candles.length < 50) return;
      var sn = null;
      try { sn = buildTFSnapshot(tf.candles, indexCandles); } catch(e) {}
      if (!sn || sn.c === null) return;
      var comps = scoreExitComponentsForTF(sn, position);

      var trendBD = Math.min(comps.tf1a + comps.tf1b + comps.tf1c, 25);
      var momExh = Math.min(comps.tf2a + comps.tf2b + comps.tf2c, 25);
      var volDist = Math.min(comps.tf3a + comps.tf3b + comps.tf3c, 25);
      var strucBD = Math.min(comps.tf4a + comps.tf4b + comps.tf4c, 25);
      var tfScore = trendBD + momExh + volDist + strucBD;

      totalScore += tfScore * w;
      totalWeight += w;
      activeTFs++;
      compTotal.tf1a += comps.tf1a * w; compTotal.tf1b += comps.tf1b * w; compTotal.tf1c += comps.tf1c * w;
      compTotal.tf2a += comps.tf2a * w; compTotal.tf2b += comps.tf2b * w; compTotal.tf2c += comps.tf2c * w;
      compTotal.tf3a += comps.tf3a * w; compTotal.tf3b += comps.tf3b * w; compTotal.tf3c += comps.tf3c * w;
      compTotal.tf4a += comps.tf4a * w; compTotal.tf4b += comps.tf4b * w; compTotal.tf4c += comps.tf4c * w;
      if (primarySn === null && w === 0.50) primarySn = sn;

      tfDetails.push({
        timeframe: tf.timeframe, weight: round(w * 100, 0) + '%',
        exitScore: round(tfScore, 1), trend_breakdown: round(trendBD, 1),
        momentum_exhaustion: round(momExh, 1),
        volume_distribution: round(volDist, 1),
        structure_breakdown: round(strucBD, 1),
        penalties: 0, bonuses: 0, raw_score: round(tfScore, 1),
        classification: classifyExitScore(tfScore).classification
      });
    });

    if (totalWeight === 0) return { multiTF_exit_score: null, reason: 'no_valid_scores', details: tfDetails };

    var multiTF = round(totalScore / totalWeight, 1);

    /* ── single modifier pass on the primary (D) timeframe ── */
    var idxEntryScoreVal = null;
    try { if (indexCandles && indexCandles.length >= 50) { var idxEntryRes = computeEntryScore(indexCandles); if (idxEntryRes && idxEntryRes.entry_score != null) idxEntryScoreVal = idxEntryRes.entry_score; } } catch(e) {}
    if (primarySn === null) {
      var primary = tfResults.filter(function(tf) { return weights[tf.timeframe] === 0.50 && tf.candles && tf.candles.length >= 50; })[0]
                || tfResults.filter(function(tf) { return tf.candles && tf.candles.length >= 50; })[0]
                || null;
      try { if (primary && primary.candles) primarySn = buildTFSnapshot(primary.candles, indexCandles); } catch(e) {}
    }
    var primaryTF = tfResults.filter(function(tf) { return weights[tf.timeframe] === 0.50; })[0] || tfResults[0];
    var dailyTF = tfResults.filter(function(tf) { return weights[tf.timeframe] === 0.50; })[0] || null;
    var guard = dailyTF && dailyTF.candles ? computeSpikeGuard(dailyTF.candles) : { todaySpike: false, sessionReturnPct: null, gapPct: null, dominanceRatio: null, efficiencyRatio10: null };
    var penaltyItems = [], bonusItems = [];
    if (primarySn) {
      var ctx = { indexTrendScore: idxEntryScoreVal, entryPrice: position.entry_price || primarySn.c, currentPrice: primarySn.c, holdingDays: position.holding_days || 0, entryScore: position.entry_score != null ? position.entry_score : 50, guard: guard };
      penaltyItems = buildExitPenaltyItems(primarySn, ctx);
      bonusItems = buildExitBonusItems(primarySn, ctx);
    }
    var penalties = 0, bonuses = 0;
    penaltyItems.forEach(function(it) { penalties += it.amount; });
    bonusItems.forEach(function(it) { bonuses += it.amount; });
    var finalScore = Math.max(0, Math.min(100, multiTF + penalties + bonuses));

    var cls = classifyExitScore(finalScore);
    var avgC = function(k) { return totalWeight > 0 ? compTotal[k] / totalWeight : 0; };
    return {
      multiTF_exit_score: round(finalScore, 1),
      trend_breakdown: round(Math.min(avgC('tf1a') + avgC('tf1b') + avgC('tf1c'), 25), 1),
      momentum_exhaustion: round(Math.min(avgC('tf2a') + avgC('tf2b') + avgC('tf2c'), 25), 1),
      volume_distribution: round(Math.min(avgC('tf3a') + avgC('tf3b') + avgC('tf3c'), 25), 1),
      structure_breakdown: round(Math.min(avgC('tf4a') + avgC('tf4b') + avgC('tf4c'), 25), 1),
      raw_score: multiTF,
      penalties: penalties, bonuses: bonuses,
      penalty_items: penaltyItems, bonus_items: bonusItems,
      classification: cls.classification, signal: cls.signal, action: cls.action,
      timeframesUsed: activeTFs, details: tfDetails,
      todaySpike: guard.todaySpike, sessionReturnPct: guard.sessionReturnPct, gapPct: guard.gapPct,
      dominanceRatio: guard.dominanceRatio, efficiencyRatio10: guard.efficiencyRatio10,
      stabilityScore: primarySn ? round(primarySn.stabilityScore, 2) : null
    };
  }

  /* ── Compatibility wrapper: uses MTF when multiple timeframes provided, single-TF otherwise ── */
  function computeCompatExitScore(candles, weeklyCandles, dailyCandles, hourlyCandles, position, indexCandles) {
    var tfResults = [];
    if (weeklyCandles && weeklyCandles.length >= 50) tfResults.push({ timeframe: 'W', candles: weeklyCandles });
    if (dailyCandles && dailyCandles.length >= 50) tfResults.push({ timeframe: 'D', candles: dailyCandles });
    if (hourlyCandles && hourlyCandles.length >= 50) tfResults.push({ timeframe: 'H', candles: hourlyCandles });
    if (tfResults.length > 1) {
      var multi = computeMultiTFExitScore(tfResults, position, indexCandles);
      if (multi) {
        multi.exit_score = multi.multiTF_exit_score != null ? multi.multiTF_exit_score : (multi.multiTF_score != null ? multi.multiTF_score : null);
        multi.compat_mode = 'mtf';
      }
      return multi;
    }
    var single = computeExitScore(candles, position, indexCandles);
    if (single) single.compat_mode = 'single';
    return single;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Integrated Exit Decision — Hard Rules + Score + Collapse + Trail + Lock
     ══════════════════════════════════════════════════════════════════════════ */
  function integratedExitDecision(position, currentData, indexCandles) {
    if (!position || !currentData) return { signal: 'HOLD', reason: 'Missing position or data', action: 'Continue holding' };
    var ep = position.entry_price, cp = position.current_price, days = position.holding_days || 0;
    var atr = position.current_atr, es = position.entry_score, prevClose = position.prev_close;

    var exitResult = computeExitScore(currentData, { entry_price: ep, holding_days: days, entry_score: es }, indexCandles);
    var exitScore = exitResult && exitResult.exit_score != null ? exitResult.exit_score : 0;
    var stopLoss = (ep != null && atr != null) ? ep - (atr * 1.5) : null;
    var target = ep != null ? ep * 1.04 : null;

    /* Layer 1: Hard Rules */
    if (ep != null && cp != null) {
      if (target != null && cp >= target) return Object.assign({}, exitResult, { signal: 'EXIT', reason: 'Target hit (+4%)', action: 'Full exit', exit_score: exitScore });
      if (stopLoss != null && cp <= stopLoss) return Object.assign({}, exitResult, { signal: 'EXIT', reason: 'Stop loss triggered', action: 'Full exit', exit_score: exitScore });
      if (days >= 15 && cp < ep * 1.02) return Object.assign({}, exitResult, { signal: 'EXIT', reason: 'Time stop (15 days, <2%)', action: 'Full exit', exit_score: exitScore });
    }

    /* Layer 2: Exit Score */
    if (exitResult && exitResult.exit_score != null) {
      if (exitScore >= 85) return Object.assign({}, exitResult, { reason: 'Score ' + exitScore });
      if (exitScore >= 70) return Object.assign({}, exitResult, { reason: 'Score ' + exitScore });
      if (exitScore >= 55) return Object.assign({}, exitResult, { reason: 'Score ' + exitScore });
      if (exitScore >= 40 && cp != null && atr != null) {
        var newStop = (stopLoss != null) ? Math.max(stopLoss, cp - atr * 1.5) : cp - atr * 1.5;
        return Object.assign({}, exitResult, { reason: 'Move to ' + round(newStop, 2), action: 'Move stop to ' + round(newStop, 2) });
      }
    }

    /* Layer 3: Entry Score Collapse */
    var curEntryRes = computeEntryScore(currentData, indexCandles);
    var curEntry = curEntryRes && curEntryRes.entry_score != null ? curEntryRes.entry_score : null;
    if (days >= 5 && curEntry !== null && curEntry < 40 && es != null && es > 65) {
      return Object.assign({}, exitResult || {}, { signal: 'EXIT', reason: 'Entry score collapsed', action: 'Full exit at current price or next bar open', exit_score: exitScore });
    }

    /* Layer 4: Trailing Stop after +2% */
    if (ep != null && cp != null && atr != null && prevClose != null && cp >= ep * 1.02) {
      var trailStop = cp - (atr * 2);
      if (prevClose <= trailStop) return Object.assign({}, exitResult || {}, { signal: 'EXIT', reason: 'Trailing stop after +2%', action: 'Full exit', exit_score: exitScore });
    }

    /* Layer 5: Partial Profit-Lock */
    if (ep != null && cp != null && cp >= ep * 1.02 && days >= 3 && exitScore >= 30) {
      return Object.assign({}, exitResult || {}, { signal: 'PARTIAL_EXIT', reason: 'Lock gains', action: 'Exit 50%', exit_score: exitScore });
    }

    return Object.assign({}, exitResult || {}, { signal: 'HOLD', reason: 'Exit score ' + exitScore + ' conditions intact', action: 'Continue holding', exit_score: exitScore });
  }

  /* ── Premature Exit Analysis ─────────────────────────────────────────────
     Evaluates whether a stock that has hit +4% target still has technical
     momentum to continue higher. Used to prevent premature exits on stocks
     with strong continuation potential.

     Returns { score: 0-100, signal: 'HOLD' | 'CONSIDER_EXIT' | 'EXIT',
               components: { trendStrength, momentumHeadroom, volumeConfirm,
                             resistanceRoom, multiTFAlignment },
               reasons: string[] }.

     Score bands:
       80-100  Strong continuation — hold for more gains
       60-79   Moderate continuation — consider holding
       40-59   Neutral — standard exit rules apply
       20-39   Weak continuation — lean toward exit
       0-19    No continuation — exit now
  ────────────────────────────────────────────────────────────────────────── */
  function computePrematureExitScore(candles, indexCandles, opts) {
    opts = opts || {};
    var result = {
      score: null, signal: 'NEUTRAL', reasons: [],
      components: {
        trendStrength: { score: 0, max: 25, details: [] },
        momentumHeadroom: { score: 0, max: 25, details: [] },
        volumeConfirm: { score: 0, max: 20, details: [] },
        resistanceRoom: { score: 0, max: 15, details: [] },
        multiTFAlignment: { score: 0, max: 15, details: [] }
      }
    };

    try {
      if (!candles || candles.length < 50) return result;

      var L = candles.length - 1;
      var cl = candles.map(function (c) { return c.c; });
      var hi = candles.map(function (c) { return c.h; });
      var lo = candles.map(function (c) { return c.l; });
      var vo = candles.map(function (c) { return c.v; });
      var c = cl[L], pc = cl[L - 1];

      /* Helper: get last non-null value from array */
      var lastVal = function (arr) {
        if (!arr || arr.length === 0) return null;
        for (var i = arr.length - 1; i >= 0; i--) {
          if (arr[i] !== null && arr[i] !== undefined) return arr[i];
        }
        return null;
      };

      /* ── Component 1: Trend Strength (25 pts) ── */
      var trendScore = 0;
      var trendDetails = [];

      // ADX strength
      var adxObj = calcADX(candles, 14);
      var adxVal = adxObj && adxObj.adx ? lastVal(adxObj.adx) : null;
      var plusDI = adxObj && adxObj.plusDI ? lastVal(adxObj.plusDI) : null;
      var minusDI = adxObj && adxObj.minusDI ? lastVal(adxObj.minusDI) : null;
      if (adxVal != null) {
        if (adxVal >= 30 && plusDI > minusDI) { trendScore += 8; trendDetails.push('ADX ' + adxVal.toFixed(0) + ' +DI>DI (strong)'); }
        else if (adxVal >= 25 && plusDI > minusDI) { trendScore += 5; trendDetails.push('ADX ' + adxVal.toFixed(0) + ' (trending)'); }
        else if (adxVal >= 20) { trendScore += 2; trendDetails.push('ADX ' + adxVal.toFixed(0) + ' (moderate)'); }
        else { trendDetails.push('ADX ' + adxVal.toFixed(0) + ' (weak)'); }
      }

      // MACD momentum
      var macdObj = calcMACD(candles);
      var macdVal = macdObj && macdObj.macd ? lastVal(macdObj.macd) : null;
      var macdSig = macdObj && macdObj.signal ? lastVal(macdObj.signal) : null;
      if (macdVal != null && macdSig != null) {
        if (macdVal > macdSig && macdVal > 0) { trendScore += 7; trendDetails.push('MACD bullish + above zero'); }
        else if (macdVal > macdSig) { trendScore += 4; trendDetails.push('MACD above signal'); }
        else { trendDetails.push('MACD bearish'); }
      }

      // MA alignment (SMA20 > SMA50)
      var sma20Arr = calcSMA(candles, 20);
      var sma50Arr = calcSMA(candles, 50);
      var sma20 = lastVal(sma20Arr);
      var sma50 = lastVal(sma50Arr);
      if (sma20 != null && sma50 != null) {
        if (sma20 > sma50 && c > sma20) { trendScore += 6; trendDetails.push('Price > SMA20 > SMA50'); }
        else if (sma20 > sma50) { trendScore += 3; trendDetails.push('SMA20 > SMA50'); }
        else { trendDetails.push('MA bearish'); }
      }

      // Price above SMA20 (short-term trend intact)
      if (sma20 != null && c > sma20) { trendScore += 4; trendDetails.push('Above SMA20'); }

      result.components.trendStrength.score = Math.min(trendScore, 25);
      result.components.trendStrength.details = trendDetails;

      /* ── Component 2: Momentum Headroom (25 pts) ── */
      var momentumScore = 0;
      var momentumDetails = [];

      // RSI headroom (not overbought)
      var rsiArr = calcRSI(candles, 14);
      var rsi = lastVal(rsiArr);
      if (rsi != null) {
        if (rsi < 60) { momentumScore += 8; momentumDetails.push('RSI ' + rsi.toFixed(0) + ' (headroom)'); }
        else if (rsi < 70) { momentumScore += 5; momentumDetails.push('RSI ' + rsi.toFixed(0) + ' (moderate)'); }
        else if (rsi < 80) { momentumScore += 2; momentumDetails.push('RSI ' + rsi.toFixed(0) + ' (elevated)'); }
        else { momentumDetails.push('RSI ' + rsi.toFixed(0) + ' (overbought)'); }
      }

      // StochRSI headroom
      var stochRSI = calcStochasticRSI(candles);
      var stochRsiK = stochRSI && stochRSI.k ? lastVal(stochRSI.k) : null;
      if (stochRsiK != null) {
        if (stochRsiK < 70) { momentumScore += 6; momentumDetails.push('StochRSI ' + stochRsiK.toFixed(0) + ' (headroom)'); }
        else if (stochRsiK < 85) { momentumScore += 3; momentumDetails.push('StochRSI ' + stochRsiK.toFixed(0) + ' (elevated)'); }
        else { momentumDetails.push('StochRSI ' + stochRsiK.toFixed(0) + ' (stretched)'); }
      }

      // Rate of change (ROC)
      if (L >= 12) {
        var roc = (c - cl[L - 12]) / cl[L - 12] * 100;
        if (roc > 2 && roc < 8) { momentumScore += 6; momentumDetails.push('ROC ' + roc.toFixed(1) + '% (healthy)'); }
        else if (roc >= 8 && roc < 15) { momentumScore += 3; momentumDetails.push('ROC ' + roc.toFixed(1) + '% (extended)'); }
        else if (roc >= 15) { momentumDetails.push('ROC ' + roc.toFixed(1) + '% (overextended)'); }
        else { momentumDetails.push('ROC ' + roc.toFixed(1) + '% (weak)'); }
      }

      // Efficiency Ratio (clean trend)
      if (L >= 11) {
        var erDir = Math.abs(c - cl[L - 11]);
        var erPath = 0;
        for (var ej = L - 10; ej < L; ej++) erPath += Math.abs(cl[ej] - cl[ej - 1]);
        var er10 = erPath > 0 ? erDir / erPath : 0;
        if (er10 > 0.6) { momentumScore += 5; momentumDetails.push('ER ' + er10.toFixed(2) + ' (efficient trend)'); }
        else if (er10 > 0.4) { momentumScore += 3; momentumDetails.push('ER ' + er10.toFixed(2) + ' (moderate)'); }
        else { momentumDetails.push('ER ' + er10.toFixed(2) + ' (choppy)'); }
      }

      result.components.momentumHeadroom.score = Math.min(momentumScore, 25);
      result.components.momentumHeadroom.details = momentumDetails;

      /* ── Component 3: Volume Confirmation (20 pts) ── */
      var volScore = 0;
      var volDetails = [];

      // Volume trend (increasing on up days)
      if (L >= 20) {
        var recentVol = vo.slice(-5).reduce(function (a, b) { return a + b; }, 0) / 5;
        var avgVol = vo.slice(-20, -5).reduce(function (a, b) { return a + b; }, 0) / 15;
        var volRatio = avgVol > 0 ? recentVol / avgVol : 1;
        if (volRatio > 1.5) { volScore += 8; volDetails.push('Volume expanding ' + volRatio.toFixed(1) + 'x'); }
        else if (volRatio > 1.0) { volScore += 5; volDetails.push('Volume steady ' + volRatio.toFixed(1) + 'x'); }
        else { volDetails.push('Volume declining ' + volRatio.toFixed(1) + 'x'); }
      }

      // OBV trend
      var obv = calcOBV(candles);
      if (obv && obv.length >= 20) {
        var obvSlice = obv.slice(-20);
        var obvSum = obvSlice.reduce(function (a, b) { return a + b; }, 0);
        var obvSma20 = obvSum / 20;
        var obvLast = lastVal(obv);
        if (obvLast != null && obvLast > obvSma20) { volScore += 6; volDetails.push('OBV above SMA20 (accumulation)'); }
        else { volDetails.push('OBV below SMA20'); }
      }

      // MFI confirmation
      var mfiArr = calcMFI(candles, 14);
      var mfi = lastVal(mfiArr);
      if (mfi != null) {
        if (mfi > 50 && mfi < 80) { volScore += 6; volDetails.push('MFI ' + mfi.toFixed(0) + ' (healthy flow)'); }
        else if (mfi >= 80) { volDetails.push('MFI ' + mfi.toFixed(0) + ' (overbought flow)'); }
        else { volDetails.push('MFI ' + mfi.toFixed(0) + ' (weak flow)'); }
      }

      result.components.volumeConfirm.score = Math.min(volScore, 20);
      result.components.volumeConfirm.details = volDetails;

      /* ── Component 4: Resistance Room (15 pts) ── */
      var resistScore = 0;
      var resistDetails = [];

      // Distance to 52-week high
      if (L >= 252) {
        var high52w = Math.max.apply(null, hi.slice(-252));
        var pctFromHigh = (high52w - c) / c * 100;
        if (pctFromHigh > 10) { resistScore += 5; resistDetails.push(pctFromHigh.toFixed(1) + '% below 52w high'); }
        else if (pctFromHigh > 5) { resistScore += 3; resistDetails.push(pctFromHigh.toFixed(1) + '% below 52w high'); }
        else { resistDetails.push(pctFromHigh.toFixed(1) + '% near 52w high'); }
      }

      // Distance to Bollinger upper
      var bb = calcBollingerBands(candles, 20, 2);
      var bbUpper = bb && bb.upper ? lastVal(bb.upper) : null;
      if (bbUpper != null) {
        var pctToBB = (bbUpper - c) / c * 100;
        if (pctToBB > 3) { resistScore += 5; resistDetails.push(pctToBB.toFixed(1) + '% to BB upper'); }
        else if (pctToBB > 1) { resistScore += 3; resistDetails.push(pctToBB.toFixed(1) + '% to BB upper'); }
        else { resistDetails.push('Near BB upper'); }
      }

      // Distance to Donchian upper
      if (L >= 20) {
        var dcUpper = Math.max.apply(null, hi.slice(-20));
        var pctToDC = (dcUpper - c) / c * 100;
        if (pctToDC > 2) { resistScore += 5; resistDetails.push(pctToDC.toFixed(1) + '% to Donchian upper'); }
        else if (pctToDC > 0.5) { resistScore += 2; resistDetails.push(pctToDC.toFixed(1) + '% to Donchian upper'); }
        else { resistDetails.push('At Donchian upper'); }
      }

      result.components.resistanceRoom.score = Math.min(resistScore, 15);
      result.components.resistanceRoom.details = resistDetails;

      /* ── Component 5: Multi-TF Alignment (15 pts) ── */
      var mtfScore = 0;
      var mtfDetails = [];

      // Weekly trend — requires enough candles to synthesize ~40 weekly bars
      if (candles.length >= 200) {
        try {
          var weeklyData = synthWeeklyCandles(candles);
          if (weeklyData && weeklyData.length >= 50) {
            var wSma20Arr = calcSMA(weeklyData, 20);
            var wSma50Arr = calcSMA(weeklyData, 50);
            var wSma20 = lastVal(wSma20Arr);
            var wSma50 = lastVal(wSma50Arr);
            var wClose = weeklyData[weeklyData.length - 1].c;
            if (wSma20 != null && wSma50 != null && wClose > wSma20 && wSma20 > wSma50) {
              mtfScore += 8; mtfDetails.push('Weekly: Price > SMA20 > SMA50');
            } else if (wSma20 != null && wClose > wSma20) {
              mtfScore += 4; mtfDetails.push('Weekly: Above SMA20');
            } else {
              mtfDetails.push('Weekly: Weak');
            }

            // Weekly RSI
            var wRsiArr = calcRSI(weeklyData, 14);
            var wRsi = lastVal(wRsiArr);
            if (wRsi != null && wRsi < 70) {
              mtfScore += 4; mtfDetails.push('Weekly RSI ' + wRsi.toFixed(0) + ' (headroom)');
            } else if (wRsi != null) {
              mtfDetails.push('Weekly RSI ' + wRsi.toFixed(0) + ' (overbought)');
            }

            // Weekly MACD
            var wMacdObj = calcMACD(weeklyData);
            var wMacdVal = wMacdObj && wMacdObj.macd ? lastVal(wMacdObj.macd) : null;
            var wMacdSig = wMacdObj && wMacdObj.signal ? lastVal(wMacdObj.signal) : null;
            if (wMacdVal != null && wMacdSig != null && wMacdVal > wMacdSig) {
              mtfScore += 3; mtfDetails.push('Weekly MACD bullish');
            } else {
              mtfDetails.push('Weekly MACD bearish');
            }
          }
        } catch (e) { mtfDetails.push('Weekly synthesis failed'); }
      }

      result.components.multiTFAlignment.score = Math.min(mtfScore, 15);
      result.components.multiTFAlignment.details = mtfDetails;

      /* ── Final Score ── */
      var totalScore = result.components.trendStrength.score +
                       result.components.momentumHeadroom.score +
                       result.components.volumeConfirm.score +
                       result.components.resistanceRoom.score +
                       result.components.multiTFAlignment.score;

      result.score = totalScore;

      // Determine signal
      if (totalScore >= 80) {
        result.signal = 'STRONG_HOLD';
        result.reasons.push('Strong continuation potential — hold for more gains');
      } else if (totalScore >= 60) {
        result.signal = 'HOLD';
        result.reasons.push('Moderate continuation — consider holding');
      } else if (totalScore >= 40) {
        result.signal = 'NEUTRAL';
        result.reasons.push('Neutral — standard exit rules apply');
      } else if (totalScore >= 20) {
        result.signal = 'CONSIDER_EXIT';
        result.reasons.push('Weak continuation — lean toward exit');
      } else {
        result.signal = 'EXIT';
        result.reasons.push('No continuation — exit now');
      }

      // Add specific reasons based on components
      if (result.components.trendStrength.score < 10) result.reasons.push('Weak trend structure');
      if (result.components.momentumHeadroom.score < 10) result.reasons.push('Momentum stretched');
      if (result.components.volumeConfirm.score < 8) result.reasons.push('Volume not confirming');
      if (result.components.resistanceRoom.score < 5) result.reasons.push('Near resistance levels');
      if (result.components.multiTFAlignment.score < 5) result.reasons.push('Multi-TF not aligned');

    } catch (e) {
      result.score = null;
      result.reasons = ['Analysis failed: ' + (e.message || e)];
      result.error = e.message || String(e);
    }

    return result;
  }

  /* ── Session Confidence Score ─────────────────────────────────────────────
     "Will this position reach the target profit within today's session?" 0–100.
     Driven SOLELY by the stock's own intraday 15m tape plus the two mechanical
     constraints of the session itself (time left, average range consumed).
     Deliberately excludes index, beta and daily-trend inputs.

       +20  VWAP position + slope      (session VWAP anchor, 15m)
       +20  Intraday ADX/±DI           (trend strength & direction, 15m)
       +15  MFI(14) money flow         (volume-confirmed buying, not exhausted)
       +10  ROC(5) acceleration        (short-term momentum still rising)
       +15  ADR headroom               (avg daily range not yet consumed)
       +10  Time remaining in session  (09:15–15:30 IST)
       −10  Overextension penalty      (intraday RSI(5) stretched / too far > VWAP)

     Returns { confidence, reason, components, flags }.
     Confidence is normalized to the weight actually available when data is
     too thin early in the session (e.g. ADX not yet meaningful). */
  function computeSessionConfidence(intradayCandles, dailyCandles, position) {
    var base = {
      confidence: null, reason: 'insufficient_intraday_data',
      components: { vwap: null, vwapSlope: null, adx: null, plusDI: null, minusDI: null, mfi: null, roc5: null, rsi5: null, rangeUsedPct: null, atrPct: null, remainingPct: null, timeRemainingMin: null },
      flags: { inTargetBand: false, alreadyAtTarget: false }
    };
    try {
      if (!intradayCandles || intradayCandles.length < 10) return base;
      position = position || {};
      var entry = position.entry_price || position.entry || 0;
      var targetPct = position.target_pct != null ? position.target_pct : 4;
      if (entry <= 0) { base.reason = 'no_entry_price'; return base; }

      /* isolate today's session bars (same IST date as the last bar) */
      var lastT = intradayCandles[intradayCandles.length - 1].t;
      var sessionKey = lastT == null ? null : String(lastT).slice(0, 10);
      var session = [];
      for (var i = 0; i < intradayCandles.length; i++) {
        var key = intradayCandles[i].t == null ? (sessionKey || 'all') : String(intradayCandles[i].t).slice(0, 10);
        if (key === sessionKey) session.push(intradayCandles[i]);
      }
      if (session.length < 6) { base.reason = 'insufficient_session_bars'; return base; }

      var cur = session[session.length - 1];
      var c = cur.c;
      var profitPct = (c - entry) / entry * 100;
      var remainingPct = targetPct - profitPct;
      base.components.remainingPct = round(remainingPct, 2);
      if (remainingPct <= 0) {
        base.confidence = 100; base.flags.alreadyAtTarget = true;
        base.flags.inTargetBand = profitPct >= 2.0 && profitPct < targetPct;
        base.reason = 'already_at_target';
        return base;
      }
      base.flags.inTargetBand = profitPct >= 2.0 && profitPct < targetPct;

      var vwapSer = calcSessionVWAP(session);
      var vwap = last(vwapSer);
      var vwapSlopePct = null;
      if (vwap != null && session.length >= 4 && vwapSer[session.length - 4] != null) {
        vwapSlopePct = (vwap - vwapSer[session.length - 4]) / vwap * 100;
      }

      var adxRes = session.length >= 15 ? calcADX(session, 14) : null;
      var adx = adxRes ? last(adxRes.adx) : null;
      var plusDI = adxRes ? last(adxRes.plusDI) : null;
      var minusDI = adxRes ? last(adxRes.minusDI) : null;

      var mfi = last(calcMFI(session, 14));
      var roc5 = last(calcROC(session, 5));
      var rsi5 = last(calcRSI(session, 5));

      var rangeUsedPct = null, atrPct = null;
      if (dailyCandles && dailyCandles.length >= 16) {
        var dayHigh = 0, dayLow = Infinity;
        for (var k = 0; k < session.length; k++) {
          if (session[k].h > dayHigh) dayHigh = session[k].h;
          if (session[k].l < dayLow) dayLow = session[k].l;
        }
        var prevClose = dailyCandles[dailyCandles.length - 1].c;
        if (prevClose > 0 && dayLow < Infinity) {
          rangeUsedPct = (dayHigh - dayLow) / prevClose * 100;
          var atrV = last(calcATR(dailyCandles, 14));
          atrPct = atrV != null ? atrV / prevClose * 100 : null;
        }
      }

      base.components = {
        vwap: vwap != null ? round(vwap, 2) : null,
        vwapSlope: vwapSlopePct != null ? round(vwapSlopePct, 3) : null,
        adx: adx != null ? round(adx, 1) : null,
        plusDI: plusDI != null ? round(plusDI, 1) : null,
        minusDI: minusDI != null ? round(minusDI, 1) : null,
        mfi: mfi != null ? round(mfi, 1) : null,
        roc5: roc5 != null ? round(roc5, 2) : null,
        rsi5: rsi5 != null ? round(rsi5, 1) : null,
        rangeUsedPct: rangeUsedPct != null ? round(rangeUsedPct, 2) : null,
        atrPct: atrPct != null ? round(atrPct, 2) : null,
        remainingPct: round(remainingPct, 2),
        timeRemainingMin: null
      };

      var total = 0;

      /* Session clock — minutes elapsed vs 09:15 open (fallback: middle of day).
         Unknown components below use a NEUTRAL 50% fill so early-session reads are
         conservatively weighted and rise as the tape confirms. */
      var elapsedFrac = 0.5, timeScore = 5, remainMin = null;
      if (lastT != null) {
        var tm = String(lastT).match(/(\d{2}):(\d{2})/);
        if (tm) {
          var minutes = parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10);
          var elapsed = minutes - 555; /* 09:15 IST = 555 min */
          if (elapsed >= 0) {
            elapsedFrac = Math.min(1, elapsed / 375);
            remainMin = Math.max(0, 375 - elapsed);
            timeScore = 10 * (remainMin / 375);
            base.components.timeRemainingMin = remainMin;
          }
        }
      }
      total += timeScore;

      /* ADR headroom (15) — typical range left for the day, minus any abnormal
         over-consumption so far; vs the distance still needed to the target. */
      var headScore = 7.5;
      if (atrPct != null && rangeUsedPct != null) {
        var normUsed = atrPct * elapsedFrac;
        var excessUsed = Math.max(0, rangeUsedPct - normUsed);
        var avail = Math.max(0, atrPct * (1 - elapsedFrac) - excessUsed);
        var roomRatio = avail / Math.max(remainingPct, 0.05);
        headScore = 15 * Math.max(0, Math.min(1, roomRatio));
      }
      total += headScore;

      /* VWAP position + slope (20) */
      var vwapScore = 10;
      if (vwap != null) {
        var distPct = (c - vwap) / vwap * 100;
        var posScore = distPct > 0 ? 12 * Math.min(1, distPct / 1.5) : 0;
        var slopeScore = 0;
        if (vwapSlopePct != null && vwapSlopePct > 0) slopeScore = 8 * Math.min(1, vwapSlopePct / 0.2);
        vwapScore = posScore + slopeScore;
      }
      total += vwapScore;

      /* ADX/DI trend strength (20) */
      var adxScore = 10;
      if (adx != null && plusDI != null && minusDI != null) {
        var dir = plusDI > minusDI ? 1 : 0;
        adxScore = 20 * dir * Math.max(0, Math.min(1, adx / 40));
      }
      total += adxScore;

      /* MFI money flow (15) */
      var mfiScore = 7.5;
      if (mfi != null) {
        if (mfi > 45 && mfi < 70) mfiScore = 15 * ((mfi - 45) / 25);
        else if (mfi >= 70 && mfi <= 85) mfiScore = 15;
        else if (mfi > 85) mfiScore = 15 * ((100 - mfi) / 15);
      }
      total += mfiScore;

      /* ROC(5) acceleration (10) */
      var rocScore = 5;
      if (roc5 != null) rocScore = 10 * (roc5 > 0 ? Math.min(1, roc5 / 0.8) : 0);
      total += rocScore;

      /* Overextension penalty (−10) */
      var pen = 0;
      if (rsi5 != null) { if (rsi5 >= 90) pen += 7; else if (rsi5 >= 85) pen += 4; }
      if (vwap != null) { var d2 = (c - vwap) / vwap * 100; if (d2 > 3) pen += 3; else if (d2 > 2) pen += 2; }
      total -= Math.min(10, pen);

      total = Math.max(0, Math.min(100, total));
      base.confidence = round(total, 1);
      base.reason = 'ok';
      return base;
    } catch (e) {
      base.reason = 'error';
      return base;
    }
  }

  /* ── probabilistic helpers for the horizon-confidence model ── */
  function normCdf(x) {
    if (x === null || x === undefined || isNaN(x)) return null;
    if (x > 6) return 1;
    if (x < -6) return 0;
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989422804014327 * Math.exp(-x * x / 2);
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x > 0 ? 1 - p : p;
  }
  function sampleStdDev(arr) {
    if (!arr || arr.length < 2) return null;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i];
    var mean = sum / arr.length;
    var sq = 0;
    for (var j = 0; j < arr.length; j++) { var d = arr[j] - mean; sq += d * d; }
    return Math.sqrt(sq / (arr.length - 1));
  }
  function calcBlendedDailySigma(dailyCandles, atrPct) {
    var sigmaDaily = null;
    if (dailyCandles && dailyCandles.length >= 31) {
      var rets = [];
      for (var r = dailyCandles.length - 1; r > 0 && rets.length < 60; r--) {
        var pc0 = dailyCandles[r - 1].c, pc1 = dailyCandles[r].c;
        if (pc0 > 0 && pc1 > 0) rets.push(Math.log(pc1 / pc0));
      }
      var longVol = sampleStdDev(rets);
      if (rets.length >= 40) {
        var shortVol = sampleStdDev(rets.slice(0, 20));
        sigmaDaily = shortVol != null ? 0.7 * shortVol + 0.3 * longVol : longVol;
      } else { sigmaDaily = longVol; }
    }
    if (atrPct != null) {
      var atrSigma = atrPct / 100 * Math.sqrt(Math.PI / 8);
      sigmaDaily = sigmaDaily != null ? (sigmaDaily + atrSigma) / 2 : atrSigma;
    }
    if (sigmaDaily != null) sigmaDaily = Math.max(0.008, sigmaDaily);
    return sigmaDaily;
  }
  /* R² of a straight-line fit over a numeric series (e.g. ln closes): 1 = the
     series marches in a clean line (trending regime), →0 = squiggly range
     (chop). Used to gate the ADX trend-strength boost. */
  function rSquaredFit(y) {
    if (!y || y.length < 5) return null;
    var n = y.length, xm = (n - 1) / 2, ym = 0, sxx = 0, syy = 0, sxy = 0;
    for (var i = 0; i < n; i++) ym += y[i];
    ym /= n;
    for (var j = 0; j < n; j++) {
      var dx = j - xm, dy = y[j] - ym;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    if (sxx <= 0 || syy <= 0) return 0;
    var r = sxy / Math.sqrt(sxx * syy);
    return r * r;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* Relative strength for the horizon model: slope of ln(stock/index) over the
     last ~60 daily bars (relative momentum, in units of its own daily vol) plus
     the current RS position vs its 50-bar norm. Returns { score:[-1,1],
     momentum, level, rs } or null when stock/index data is too short/misaligned. */
  function calcHorizonRS(stockCandles, indexCandles) {
    if (!stockCandles || !indexCandles || stockCandles.length < 20 || indexCandles.length < 20) return null;
    var sc = closes(stockCandles), ic = closes(indexCandles);
    var sMap = {};
    for (var i = 0; i < stockCandles.length; i++) sMap[stockCandles[i].t] = sc[i];
    var rsArr = [];
    for (var j = 0; j < indexCandles.length; j++) {
      var sv = sMap[indexCandles[j].t];
      if (sv != null && sv > 0 && ic[j] > 0) rsArr.push(sv / ic[j]);
    }
    if (rsArr.length < 20) return null;
    var n = Math.min(rsArr.length, 60);
    var ln = [];
    for (var k = rsArr.length - n; k < rsArr.length; k++) ln.push(Math.log(rsArr[k]));
    var xm = (n - 1) / 2, num = 0, den = 0, sumLn = 0;
    for (var m = 0; m < n; m++) { sumLn += ln[m]; num += (m - xm) * ln[m]; den += (m - xm) * (m - xm); }
    var slope = den > 0 ? num / den : 0;
    var meanLn = sumLn / n;
    var dS = 0;
    for (var d = 1; d < n; d++) { var dd = ln[d] - ln[d - 1]; dS += dd * dd; }
    var rsSd = n > 2 ? Math.sqrt(dS / (n - 1)) : 0;
    var c50 = Math.min(ln.length, 50), sum50 = 0;
    for (var q = ln.length - c50; q < ln.length; q++) sum50 += ln[q];
    var mean50 = sum50 / c50;
    var momentum = rsSd > 0 ? slope / rsSd : 0;
    var level = rsSd > 0 ? (ln[ln.length - 1] - mean50) / rsSd : 0;
    var score = Math.max(-1, Math.min(1,
      0.6 * Math.max(-2, Math.min(2, momentum)) / 2 +
      0.4 * Math.max(-2, Math.min(2, level)) / 2));
    return { score: score, momentum: momentum, level: level, rs: rsArr[rsArr.length - 1] };
  }

   /* ── Horizon Confidence Score (Next N Days) ────────────────────────────────
     "Will the stock reach the target % within the NEXT N trading days?"
     0–100. Statistical core: touch probability via the reflection principle:

       P(touch b) = N(−d₁) + exp(2μb/σ²) × N(−d₂)

     where b = ln(1 + remainingPct/100), d₁ = (b − μN)/(σ√N),
     d₂ = (b + μN)/(σ√N), μ = daily drift, σ = daily vol.

     σ = realized vol of daily log returns blended 50/50 with ATR-derived vol
     (ATR ≈ σ·√(2/π) → σ ≈ ATR·√(π/2)), floored at 0.8%/day.
     μ = driftScore × 0.0025, a composite of daily trend (EMA stack, price vs
     EMA21, MACD > 0), hourly trend/structure/momentum, RS-vs-Nifty (slope +
     position), recent drift and up-bar volume — damped by a daily-ADX regime
     multiplier (a +DI/−DI cross in a choppy regime counts for far less).

     Remaining time decays with days held (N_rem = N − daysHeld). The
     displayScore is logit-calibrated against empirical hit rates:
       displayScore = 50 + (logit(P) − logit(calP0)) × calK
     where calP0 / calK are OLS-calibrated constants from the backtest
     harness (calibrateConfidence). A neutral stock (P ≈ 0.20) reads ~50.
     The raw probability stays in components.probTouch. Missing vol data →
     neutral 50 fill. Overextension penalty (continuous RSI + price-VWAP
     stretch, amplified near target) applies a larger haircut to stretched
     entries.
     Returns { confidence, reason, components, flags }. */
  function computeHorizonConfidence(hourlyCandles, dailyCandles, cfg) {
    cfg = cfg || {};
    var horizonDays = cfg.horizonDays != null ? cfg.horizonDays : 10;
    var windowSessions = cfg.windowSessions != null ? cfg.windowSessions : 40;
    var targetPct = cfg.target_pct != null ? cfg.target_pct : (cfg.targetPct != null ? cfg.targetPct : 4);
    var holdingDays = cfg.holding_days != null ? cfg.holding_days : (cfg.holdingDays != null ? cfg.holdingDays : 0);
    var ctx = cfg.entryScoreContext || {};
    var base = {
      confidence: null, confidenceLognormal: null, confidenceEmpirical: null, reason: 'insufficient_hourly_data',
      components: { horizonDays: horizonDays, targetPct: targetPct, profitPct: null, remainingPct: null, daysHeld: holdingDays, sessions: 0, hourlyAdx: null, hourlyPlusDI: null, hourlyMinusDI: null, hourlyVwap: null, hourlyVwapSlope: null, hourlyRsi14: null, roc10: null, ema9: null, ema21: null, dailyEmaBullish: false, dailyMacdBullish: false, dailyMacdAboveZero: false, dailyPriceAboveEma21: false, dailyAdx: null, regimeMult: 1, regimeQuality: null, rsScore: null, atrPct: null, horizonReachPct: null, reachRatio: null, driftPct: null, volConfirm: null, sigmaDaily: null, muDaily: null, driftScore: null, zScore: null, probTerminal: null, probTouch: null, displayScore: null, calP0: 0.38, calK: 38.0, entryScoreUsed: false, entryScore: null, trendHealth: null, pullbackQuality: null, prob4: null, hourDrift: null, dayDrift: null, penalty: null, empiricalMethod: 'lognormal', empiricalSampleCount: 0 },
      flags: { alreadyAtTarget: false, withinReach: false }
    };
    try {
      if (!hourlyCandles || hourlyCandles.length < 60) return base;
      /* ── Hourly data-quality ramp ─────────────────────────────────────
         60 bars: ADX/EMA/RSI are noisier → scale hourly contribution to 50%
         120+ bars: full 100% contribution
         Linear interpolation between. Prevents a 65-bar result from getting
         the same hourDrift weight as a 250-bar result. */
      var hourlyDataQuality = clamp((hourlyCandles.length - 60) / 60, 0.5, 1.0);
      var entry = cfg.entry_price || cfg.entry || 0;
      if (entry <= 0) { base.reason = 'no_entry_price'; return base; }
      var cur = hourlyCandles[hourlyCandles.length - 1];
      var c = cur.c;
      var profitPct = (c - entry) / entry * 100;
      var remainingPct = targetPct - profitPct;
      base.components.targetPct = targetPct;
      base.components.profitPct = round(profitPct, 2);
      base.components.remainingPct = round(remainingPct, 2);
      if (remainingPct <= 0) { base.confidence = 100; base.flags.alreadyAtTarget = true; base.reason = 'already_at_target'; return base; }
      var remainingDays = Math.max(1, horizonDays - holdingDays);
      var seen = {}, keys = [];
      for (var i = hourlyCandles.length - 1; i >= 0 && keys.length < windowSessions; i--) {
        var k = String(hourlyCandles[i].t).slice(0, 10);
        if (!seen[k]) { seen[k] = true; keys.push(k); }
      }
      var recent = [];
      for (var j = 0; j < hourlyCandles.length; j++) {
        if (seen[String(hourlyCandles[j].t).slice(0, 10)]) recent.push(hourlyCandles[j]);
      }
      base.components.sessions = keys.length;
      if (recent.length < 20) { base.reason = 'insufficient_hourly_window'; return base; }
      var adxRes = hourlyCandles.length >= 30 ? calcADX(hourlyCandles, 14) : null;
      var adx = adxRes ? last(adxRes.adx) : null;
      var plusDI = adxRes ? last(adxRes.plusDI) : null;
      var minusDI = adxRes ? last(adxRes.minusDI) : null;
      var rsi14 = last(calcRSI(hourlyCandles, 14));
      var roc10 = last(calcROC(hourlyCandles, 10));
      var ema9 = last(calcEMA(hourlyCandles, 9));
      var ema21 = last(calcEMA(hourlyCandles, 21));
      var vwapSer = calcSessionVWAP(recent);
      var vwap = last(vwapSer);
      var vwapSlope = null;
      if (vwap != null && recent.length >= 4 && vwapSer[recent.length - 4] != null) vwapSlope = (vwap - vwapSer[recent.length - 4]) / vwap * 100;
      var dailyEmaBullish = false, dailyMacdBullish = false, atrPct = null, dailyAvailable = false;
      var dailyMacdAboveZero = false, dailyPriceAboveEma21 = false;
      if (dailyCandles && dailyCandles.length >= 30) {
        dailyAvailable = true;
        var dCl = closes(dailyCandles);
        var prevClose = dCl[dCl.length - 1];
        var de9 = last(calcEMA(dailyCandles, 9)), de21 = last(calcEMA(dailyCandles, 21));
        dailyEmaBullish = de9 != null && de21 != null && de9 > de21;
        var macdRes = calcMACD(dailyCandles);
        dailyMacdBullish = macdRes && macdRes.macd != null && macdRes.signal != null && macdRes.macd > macdRes.signal;
        dailyMacdAboveZero = dailyMacdBullish && macdRes.macd > 0;
        dailyPriceAboveEma21 = de21 != null && c > de21;
        var atrV = last(calcATR(dailyCandles, 14));
        if (prevClose > 0 && atrV != null) atrPct = atrV / prevClose * 100;
      }
      var dailyAdx = null, regimeMult = 1, regimeQuality = null;
      if (dailyAvailable) {
        var dAdxRes = calcADX(dailyCandles, 14);
        if (dAdxRes) dailyAdx = last(dAdxRes.adx);
        if (ctx.trendHealth != null) {
          regimeQuality = clamp(ctx.trendHealth / 25, 0.2, 1.0);
        } else if (dailyCandles.length >= 25) {
          var logC = [];
          for (var q = dailyCandles.length - 20; q < dailyCandles.length; q++) logC.push(Math.log(dailyCandles[q].c));
          var r2 = rSquaredFit(logC);
          if (r2 != null) {
            var qualLong = Math.max(0, Math.min(1, r2 * 1.2 - 0.2));
            var qualShort = qualLong;
            if (dailyCandles.length >= 35) {
              var logC10 = [];
              for (var q2 = dailyCandles.length - 10; q2 < dailyCandles.length; q2++) logC10.push(Math.log(dailyCandles[q2].c));
              var r2s = rSquaredFit(logC10);
              if (r2s != null) qualShort = Math.max(0, Math.min(1, r2s * 1.2 - 0.2));
            }
            regimeQuality = 0.6 * qualLong + 0.4 * qualShort;
          }
        }
        base.components.regimeQuality = regimeQuality != null ? round(regimeQuality, 2) : null;
        var qualityGate = regimeQuality != null ? 0.3 + 0.7 * regimeQuality : 1;
        if (dailyAdx != null) regimeMult = clamp(0.6 + (dailyAdx / 35) * qualityGate, 0.6, 1.5);
      }
      var rsScore = 0;
      if (dailyCandles && cfg.indexCandles && cfg.indexCandles.length >= 60 && dailyCandles.length >= 60) {
        var rsRes = calcHorizonRS(dailyCandles, cfg.indexCandles);
        rsScore = rsRes ? rsRes.score : 0;
      }
      var startClose = recent[0].o > 0 ? recent[0].o : recent[0].c;
      var driftPct = (c - startClose) / startClose * 100;
      var upVol = 0, dnVol = 0, upCount = 0, dnCount = 0;
      for (var n = 0; n < recent.length; n++) {
        if (recent[n].c >= recent[n].o) { upVol += recent[n].v; upCount++; }
        else { dnVol += recent[n].v; dnCount++; }
      }
      var avgUp = upCount > 0 ? upVol / upCount : 0;
      var avgDn = dnCount > 0 ? dnVol / dnCount : 0;
      var volConfirm = (avgUp + avgDn) > 0 ? avgUp / (avgUp + avgDn) : 0.5;
      var horizonReach = atrPct != null ? atrPct * Math.sqrt(horizonDays) : null;
      var reachRatio = horizonReach != null ? horizonReach / Math.max(remainingPct, 0.05) : null;
      if (horizonReach != null) {
        base.components.atrPct = round(atrPct, 2);
        base.components.horizonReachPct = round(horizonReach, 2);
        base.components.reachRatio = round(reachRatio, 2);
        base.flags.withinReach = reachRatio >= 1;
      }
      var sigmaDaily = calcBlendedDailySigma(dailyCandles, atrPct);
      var hourDrift = 0;
      if (adx != null && plusDI != null && minusDI != null) {
        var dirH = plusDI > minusDI ? 1 : -1;
        hourDrift += 0.30 * dirH * clamp(adx / 35, 0, 1);
      }
      if (vwap != null) {
        var dPctH = (c - vwap) / vwap * 100;
        hourDrift += 0.25 * (dPctH > 0 ? 1 : -1) * clamp(Math.abs(dPctH) / 1.5, 0, 1);
        if (vwapSlope != null) hourDrift += 0.20 * clamp(vwapSlope / 0.2, -1, 1);
      }
      if (ema9 != null && ema21 != null) hourDrift += 0.15 * (ema9 > ema21 ? 1 : -1);
      if (rsi14 != null) hourDrift += 0.10 * (rsi14 < 30 ? 0.5 : rsi14 > 70 ? -0.5 : 0);
      hourDrift = clamp(hourDrift, -1, 1);
      var hourDecay = clamp(Math.pow(Math.min(1, 10 / horizonDays), 1.2), 0.3, 1.0);
      hourDrift *= hourDecay;
      hourDrift *= hourlyDataQuality;
      var dayDrift;
      if (ctx.trendHealth != null) {
        dayDrift = clamp((ctx.trendHealth - 15) / 15, -1, 1);
      } else if (dailyAvailable) {
        var dS = (dailyEmaBullish ? 1 : 0) + (dailyPriceAboveEma21 ? 1 : 0) + (dailyMacdAboveZero ? 1 : 0);
        dayDrift = dS / 3 * 2 - 1;
      } else { dayDrift = 0; }
      var pullbackBoost = 0;
      if (ctx.pullbackQuality != null) pullbackBoost = clamp((ctx.pullbackQuality - 15) / 15, -0.1, 0.15);
      var driftS = clamp(driftPct / 2, -1, 1);
      var volFlowS = clamp((volConfirm - 0.5) * 2, -1, 1);
      var volGate = 0.5 + 0.5 * (regimeQuality != null ? regimeQuality : 1);
      var prob4Adjust = 0;
      if (ctx.prob4 != null) prob4Adjust = clamp((ctx.prob4 - 20) / 200, -0.1, 0.1);
      var driftScore;
      if (rsScore !== 0 && !isNaN(rsScore)) {
        driftScore = regimeMult * (0.15 * hourDrift + 0.15 * rsScore + 0.10 * driftS) +
                     0.35 * dayDrift + 0.15 * volFlowS * volGate + 0.10 * pullbackBoost + prob4Adjust;
      } else {
        driftScore = regimeMult * (0.20 * hourDrift + 0.10 * driftS) +
                     0.40 * dayDrift + 0.20 * volFlowS * volGate + 0.10 * pullbackBoost + prob4Adjust;
      }
      driftScore = clamp(driftScore, -1, 1);
      base.components.driftPct = round(driftPct, 2);
      base.components.volConfirm = round(volConfirm, 2);
      base.components.dailyAdx = dailyAdx != null ? round(dailyAdx, 1) : null;
      base.components.regimeMult = round(regimeMult, 2);
      base.components.rsScore = rsScore != null ? round(rsScore, 3) : null;
      base.components.hourDrift = round(hourDrift, 3);
      base.components.dayDrift = round(dayDrift, 3);
      var displayScore = null, zScore = null, probTerminal = null, probTouch = null, muDaily = null, muLog = null;
      var displayScoreLog = null, displayScoreEmp = null;
      var calP0 = 0.38, calK = 38.0;
      var empiricalMethod = 'lognormal';
      var empiricalSampleCount = 0;
      var requiredReturn = remainingPct / 100;

      /* ── Empirical: scan historical daily candles for forward N-day windows ── */
      var empProbTouch = null;
      if (dailyCandles && dailyCandles.length >= remainingDays + 10 && requiredReturn >= 0) {
        var hitsTouch = 0, hitsTerminal = 0, totalWindows = 0;
        var minLookback = Math.max(0, dailyCandles.length - 200);
        for (var ei = minLookback; ei <= dailyCandles.length - remainingDays - 1; ei++) {
          var eStart = dailyCandles[ei].c;
          if (!(eStart > 0)) continue;
          var maxH = 0;
          for (var ej = ei + 1; ej <= ei + remainingDays && ej < dailyCandles.length; ej++) {
            if (dailyCandles[ej].h > maxH) maxH = dailyCandles[ej].h;
          }
          var endC = dailyCandles[ei + remainingDays].c;
          if (!(endC > 0) || !(maxH > 0)) continue;
          var maxRet = (maxH - eStart) / eStart;
          var termRet = (endC - eStart) / eStart;
          if (maxRet >= requiredReturn) hitsTouch++;
          if (termRet >= requiredReturn) hitsTerminal++;
          totalWindows++;
        }
        if (totalWindows >= 10) {
          empiricalMethod = 'empirical';
          empiricalSampleCount = totalWindows;
          empProbTouch = hitsTouch / totalWindows;
          empProbTouch = Math.max(1e-6, Math.min(1 - 1e-6, empProbTouch));
        }
      }

      /* ── Lognormal: always compute when sigma is available ────────────────── */
      var logProbTouch = null;
      if (sigmaDaily != null) {
        muDaily = driftScore * 0.0025;
        muLog = muDaily - 0.5 * sigmaDaily * sigmaDaily;
        var b = Math.log((1 + targetPct / 100) / (1 + profitPct / 100));
        b = Math.max(b, 0.0005);
        var sdN = sigmaDaily * Math.sqrt(remainingDays);
        var muT = muLog * remainingDays;
        zScore = (b - muT) / sdN;
        logProbTouch = normCdf((muT - b) / sdN) + Math.exp(2 * muLog * b / (sigmaDaily * sigmaDaily)) * normCdf((-muT - b) / sdN);
        logProbTouch = Math.max(1e-6, Math.min(1 - 1e-6, logProbTouch));
      }

      /* ── Use empirical as primary, lognormal as secondary ────────────────── */
      probTouch = empProbTouch != null ? empProbTouch : logProbTouch;
      if (empProbTouch != null) {
        displayScoreEmp = 50 + (Math.log(empProbTouch / (1 - empProbTouch)) - Math.log(calP0 / (1 - calP0))) * calK;
      }
      if (logProbTouch != null) {
        displayScoreLog = 50 + (Math.log(logProbTouch / (1 - logProbTouch)) - Math.log(calP0 / (1 - calP0))) * calK;
      }
      displayScore = displayScoreEmp != null ? displayScoreEmp : displayScoreLog;

      var pen = 0;
      if (displayScore != null) {
        if (rsi14 != null && rsi14 > 85) pen += 5 * clamp((rsi14 - 85) / 10, 0, 1);
        if (vwap != null && atrPct != null) {
          var vwScale = atrPct / 100 * c;
          var vwapExt = vwScale > 0 ? (c - vwap) / vwScale : 0;
          if (vwapExt > 2.0) pen += 4 * clamp((vwapExt - 2.0) / 3, 0, 1);
        }
        if (pen > 0 && remainingPct != null) pen *= (1 + 0.3 * clamp(1 - remainingPct / 2.5, 0, 1));
        displayScore -= Math.min(15, pen);
        if (displayScoreLog != null) displayScoreLog -= Math.min(15, pen);
        if (displayScoreEmp != null) displayScoreEmp -= Math.min(15, pen);
        base.components.penalty = round(pen, 1);

        /* Apply entry score blending to both */
        var finalScoreLog = displayScoreLog, finalScoreEmp = displayScoreEmp;
        if (ctx.entryScore != null) {
          if (displayScoreLog != null) {
            finalScoreLog = 0.60 * displayScoreLog + 0.40 * ctx.entryScore;
            if (ctx.entryScore < 50) finalScoreLog = Math.min(finalScoreLog, 45);
            if (ctx.entryScore < 35) finalScoreLog = Math.min(finalScoreLog, 30);
          }
          if (displayScoreEmp != null) {
            finalScoreEmp = 0.60 * displayScoreEmp + 0.40 * ctx.entryScore;
            if (ctx.entryScore < 50) finalScoreEmp = Math.min(finalScoreEmp, 45);
            if (ctx.entryScore < 35) finalScoreEmp = Math.min(finalScoreEmp, 30);
          }
          base.components.entryScoreUsed = true;
          base.components.entryScore = ctx.entryScore;
          base.components.trendHealth = ctx.trendHealth;
          base.components.pullbackQuality = ctx.pullbackQuality;
          base.components.prob4 = ctx.prob4;
        } else {
          finalScoreLog = displayScoreLog;
          finalScoreEmp = displayScoreEmp;
        }
        base.confidence = round(Math.max(0, Math.min(100, finalScoreEmp != null ? finalScoreEmp : finalScoreLog)), 1);
        base.confidenceLognormal = finalScoreLog != null ? round(Math.max(0, Math.min(100, finalScoreLog)), 1) : null;
        base.confidenceEmpirical = finalScoreEmp != null ? round(Math.max(0, Math.min(100, finalScoreEmp)), 1) : null;
      }
      base.components.calP0 = calP0;
      base.components.calK = calK;
      base.components.sigmaDaily = sigmaDaily != null ? round(sigmaDaily * 100, 2) : null;
      base.components.muDaily = muDaily != null ? round(muDaily * 100, 3) : null;
      base.components.driftScore = round(driftScore, 3);
      base.components.zScore = zScore != null ? round(zScore, 3) : null;
      base.components.probTerminal = probTerminal != null ? round(probTerminal * 100, 1) : null;
      base.components.probTouch = probTouch != null ? round(probTouch * 100, 1) : null;
      base.components.displayScore = displayScore != null ? round(displayScore, 1) : null;
      base.components.empiricalMethod = empiricalMethod;
      base.components.empiricalSampleCount = empiricalSampleCount;
      base.components.hourlyAdx = adx != null ? round(adx, 1) : null;
      base.components.hourlyPlusDI = plusDI != null ? round(plusDI, 1) : null;
      base.components.hourlyMinusDI = minusDI != null ? round(minusDI, 1) : null;
      base.components.hourlyVwap = vwap != null ? round(vwap, 2) : null;
      base.components.hourlyVwapSlope = vwapSlope != null ? round(vwapSlope, 3) : null;
      base.components.hourlyRsi14 = rsi14 != null ? round(rsi14, 1) : null;
      base.components.roc10 = roc10 != null ? round(roc10, 2) : null;
      base.components.ema9 = ema9 != null ? round(ema9, 2) : null;
      base.components.ema21 = ema21 != null ? round(ema21, 2) : null;
      base.components.dailyEmaBullish = dailyEmaBullish;
      base.components.dailyMacdBullish = dailyMacdBullish;
      base.components.dailyMacdAboveZero = dailyMacdAboveZero;
      base.components.dailyPriceAboveEma21 = dailyPriceAboveEma21;
      var classification;
      if (base.confidence >= 75) classification = 'HIGH_CONVICTION';
      else if (base.confidence >= 60) classification = 'CONFIDENT';
      else if (base.confidence >= 45) classification = 'MODERATE';
      else if (base.confidence >= 30) classification = 'LOW_CONVICTION';
      else classification = 'UNFAVORABLE';
      base.classification = classification;
      var flags = [];
      if (reachRatio != null && reachRatio < 0.5) flags.push('TARGET_TOO_FAR');
      if (reachRatio != null && reachRatio > 2.0) flags.push('TARGET_EASILY_REACHABLE');
      if (regimeQuality != null && regimeQuality < 0.3) flags.push('CHOPPY_REGIME');
      if (regimeQuality != null && regimeQuality > 0.7) flags.push('STRONG_TREND');
      if (pen > 5) flags.push('OVEREXTENDED_ENTRY');
      if (ctx.entryScore != null && ctx.entryScore >= 65) flags.push('HIGH_ENTRY_SCORE');
      if (ctx.pullbackQuality != null && ctx.pullbackQuality >= 25) flags.push('EXCELLENT_PULLBACK_SETUP');
      base.components.flags = flags;
      if (displayScore == null) base.reason = 'insufficient_daily_data';
      else base.reason = 'ok';
      return base;
    } catch (e) {
      base.reason = 'error';
      return base;
    }
  }

  /* Entry-position wrapper: "will THIS holding reach its target within the next
     5 trading days?" — hourly window = last 20 sessions. */
  function computeForwardConfidence(hourlyCandles, dailyCandles, position) {
    position = position || {};
    var entry = position.entry_price || position.entry || 0;
    return computeHorizonConfidence(hourlyCandles, dailyCandles, {
      horizonDays: 5, windowSessions: 20,
      entry_price: entry,
      targetPct: position.target_pct != null ? position.target_pct : (position.targetPct != null ? position.targetPct : 4),
      holdingDays: position.holding_days != null ? position.holding_days : (position.holdingDays != null ? position.holdingDays : null),
      indexCandles: position.indexCandles || null
    });
  }

  /* Stock-level wrapper: "will THIS stock rise +4% from its CURRENT price within
     the next 10 trading days?" — hourly window = last 40 sessions; optional
     daily ^NSEI candles for RS-vs-Nifty / regime context. */
  function computeTenDayForwardConfidence(hourlyCandles, dailyCandles, indexCandles, entryScoreResult) {
    var entryScoreContext = entryScoreResult || null;
    var _hd = SCORE_CONFIG.horizonDays != null ? SCORE_CONFIG.horizonDays : 10;
    if (!hourlyCandles || hourlyCandles.length === 0) {
      return computeHorizonConfidence(hourlyCandles, dailyCandles, { horizonDays: _hd, windowSessions: 40, entry_price: 0, indexCandles: indexCandles, entryScoreContext: entryScoreContext });
    }
    var cur = hourlyCandles[hourlyCandles.length - 1];
    return computeHorizonConfidence(hourlyCandles, dailyCandles, {
      horizonDays: _hd, windowSessions: 40,
      entry_price: cur.c,
      targetPct: 4,
      holdingDays: null,
      indexCandles: indexCandles,
      entryScoreContext: entryScoreContext
    });
  }

  /* ── Optimum Entry Price ──────────────────────────────────────────────────
     "At what price should I enter so that +4% within the next 10 trading
     sessions is realistic?" Derives limit levels from the stock's OWN last
     ~15 hourly sessions (current market, session VWAP, hourly EMA21, the
     typical intraday dip, recent swing support) and scores each one with:
       • A fill-probability layer: lognormal touch-probability with sigma
         scaled to remaining session time (fraction of ~6.25h trading day),
         mu ≈ 0, time-of-day weighted. Uses 15m candles when available for
         better intraday sigma accuracy.
       • The 10-day horizon-confidence model for longer-term odds.
     If the market is closed, fill probabilities are null (no intraday edge).
     Returns { reason, currentPrice, optimumEntryPrice, discountPct,
               entryConfidence, currentConfidence, advantagePct, overextended,
               fillRange, components, candidates }. */
  function computeOptimumEntryPrice(hourlyCandles, dailyCandles, indexCandles, entryScoreContext, intraCandles) {
    var entryScoreCtx = entryScoreContext || {};
    var base = {
      reason: 'insufficient_hourly_data',
      currentPrice: null, optimumEntryPrice: null, discountPct: null,
      entryConfidence: null, currentConfidence: null, advantagePct: null,
      overextended: false, fillRange: null,
      todayHigh: null, todayLow: null, probToTodayLowLognormal: null, probToTodayLowEmpirical: null,
      components: {
        atrPct: null, horizonReachPct: null, vwap: null, ema21: null,
        high15: null, low15: null, swingLow: null, dipDepthPct: null,
        vDistPct: null, highGapPct: null, rsi14: null,
        hourlyAdx: null, hourlyPlusDI: null, hourlyMinusDI: null,
        dailyEmaBullish: false, dailyMacdBullish: false,
        dailyAdx: null, regimeMult: 1, rsScore: null,
        atrCapPct: null, sessionFraction: null, todWeight: null,
        sigmaIntraday: null, atrSigmaDaily: null, marketClosed: false,
        empiricalSampleCount: 0, empiricalMethod: 'lognormal'
      },
      candidates: []
    };
    try {
      if (!hourlyCandles || hourlyCandles.length < 60) return base;
      var cur = hourlyCandles[hourlyCandles.length - 1];
      var c = cur.c;
      if (!(c > 0)) return base;
      base.currentPrice = round(c, 2);

      /* ── 1. Remaining session time ─────────────────────────────────────── */
      var TRADING_HOURS = 6.25;
      var now = new Date();
      var marketOpen = new Date(now);
      marketOpen.setHours(9, 15, 0, 0);
      var marketClose = new Date(now);
      marketClose.setHours(15, 30, 0, 0);
      var hoursLeft = 0;
      var marketClosed = false;
      if (now >= marketOpen && now <= marketClose) {
        hoursLeft = (marketClose - now) / 3600000;
      } else if (now > marketClose) {
        hoursLeft = 0;
        marketClosed = true;
      } else {
        hoursLeft = TRADING_HOURS;
      }
      var fraction = Math.max(0.02, Math.min(1, hoursLeft / TRADING_HOURS));
      base.components.sessionFraction = round(fraction, 3);
      base.components.marketClosed = marketClosed;

      /* ── 2. ATR + intraday sigma ───────────────────────────────────────── */
      var atrPct = null, atrAbs = null;
      if (dailyCandles && dailyCandles.length >= 30) {
        var prevClose = dailyCandles[dailyCandles.length - 1].c;
        var atrV = last(calcATR(dailyCandles, 14));
        if (prevClose > 0 && atrV != null) {
          atrPct = atrV / prevClose * 100;
          atrAbs = atrV;
        }
      }
      base.components.atrPct = atrPct != null ? round(atrPct, 2) : null;
      var atrSigmaDaily = atrPct != null ? atrPct / 100 * Math.sqrt(Math.PI / 8) : null;
      base.components.atrSigmaDaily = atrSigmaDaily != null ? round(atrSigmaDaily * 100, 3) : null;

      /* Prefer 15m returns for intraday sigma when available (more granular) */
      var sigmaIntraday = null;
      if (intraCandles && intraCandles.length >= 30) {
        var intraRets = [];
        for (var ir = intraCandles.length - 1; ir > 0 && intraRets.length < 120; ir--) {
          var ip0 = intraCandles[ir - 1].c, ip1 = intraCandles[ir].c;
          if (ip0 > 0 && ip1 > 0) intraRets.push(Math.log(ip1 / ip0));
        }
        if (intraRets.length >= 20) {
          var intraVol = sampleStdDev(intraRets);
          if (intraVol != null) {
            sigmaIntraday = intraVol * Math.sqrt(fraction);
          }
        }
      }
      /* Fallback: derive from daily ATR */
      if (sigmaIntraday == null && atrSigmaDaily != null) {
        sigmaIntraday = atrSigmaDaily * Math.sqrt(fraction);
      }
      base.components.sigmaIntraday = sigmaIntraday != null ? round(sigmaIntraday * 100, 3) : null;

      /* ── 3. Empirical drawdown model (5m data when available) ──────────────
         Non-parametric: for each historical day at the same time-of-day bin,
         compute the remaining session's max drawdown, normalize by ATR.
         Fill probability = fraction of historical drawdowns >= required.
         Uses 5m candles for finer granularity (75 bars per 75-min bin). */
      var empiricalDrawdowns = [];
      var empiricalSampleCount = 0;
      var empiricalMethod = 'lognormal';
      if (intraCandles && intraCandles.length >= 100 && atrPct != null && atrPct > 0) {
        var TRADING_MINUTES = 375;
        var BIN_SIZE = 75;
        var NUM_BINS = 5;
        var nowMinutes = (now.getHours() - 9) * 60 + (now.getMinutes() - 15);
        var currentBin = Math.max(0, Math.min(NUM_BINS - 1, Math.floor(nowMinutes / BIN_SIZE)));
        var binStartMin = currentBin * BIN_SIZE;
        var binEndMin = (currentBin + 1) * BIN_SIZE;

        /* Group 5m bars by date */
        var barsByDate = {};
        for (var bd = 0; bd < intraCandles.length; bd++) {
          var bKey = String(intraCandles[bd].t).slice(0, 10);
          if (!barsByDate[bKey]) barsByDate[bKey] = [];
          barsByDate[bKey].push(intraCandles[bd]);
        }
        var dateKeys = Object.keys(barsByDate);

        /* For each historical day, find the bar at the same time-of-day bin
           and compute the remaining session's max drawdown */
        for (var dk = 0; dk < dateKeys.length; dk++) {
          var dayBars = barsByDate[dateKeys[dk]];
          if (!dayBars || dayBars.length < 20) continue;

          /* Find the bar in this day that falls in the same time-of-day bin */
          for (var db = 0; db < dayBars.length; db++) {
            var barTime = dayBars[db].t;
            var barMinutes = 0;
            if (typeof barTime === 'string') {
              var parts = barTime.split(' ');
              if (parts.length >= 2) {
                var timeParts = parts[1].split(':');
                barMinutes = (parseInt(timeParts[0], 10) - 9) * 60 + (parseInt(timeParts[1], 10) - 15);
              }
            } else {
              var bd2 = new Date(barTime);
              barMinutes = (bd2.getHours() - 9) * 60 + (bd2.getMinutes() - 15);
            }
            if (barMinutes < binStartMin || barMinutes >= binEndMin) continue;

            /* Compute remaining session drawdown from this bar */
            var barC = dayBars[db].c;
            if (!(barC > 0)) continue;
            var minAfter = barC;
            for (var da = db + 1; da < dayBars.length; da++) {
              if (dayBars[da].l < minAfter) minAfter = dayBars[da].l;
            }
            var drawdown = (barC - minAfter) / barC;
            var normalizedDD = drawdown / (atrPct / 100);
            empiricalDrawdowns.push(normalizedDD);
            empiricalSampleCount++;
            break;
          }
        }

        if (empiricalSampleCount >= 10) {
          empiricalDrawdowns.sort(function (a, b) { return a - b; });
          empiricalMethod = 'empirical';
        }
      }
      base.components.empiricalSampleCount = empiricalSampleCount;
      base.components.empiricalMethod = empiricalMethod;

      /* ── 4. Fill-probability: separate lognormal + empirical ─────────────── */
      function fillProbLognormal(P) {
        if (marketClosed) return null;
        if (P <= 0 || c <= 0) return null;
        if (P >= c - 1e-9) return 1;
        if (sigmaIntraday == null) return null;
        var b = Math.log(c / P);
        var sdN = sigmaIntraday;
        if (sdN < 1e-10) return null;
        var z = b / sdN;
        var raw = normCdf(z) + Math.exp(2 * 0 * b / (sigmaIntraday * sigmaIntraday)) * normCdf((-0 - b) / sdN);
        raw = Math.max(0, Math.min(1, raw));
        var weighted = Math.pow(raw, Math.sqrt(fraction));
        return Math.max(0, Math.min(1, weighted));
      }

      function fillProbEmpirical(P) {
        if (marketClosed) return null;
        if (P <= 0 || c <= 0) return null;
        if (P >= c - 1e-9) return 1;
        if (empiricalMethod !== 'empirical' || empiricalDrawdowns.length < 10) return null;
        var requiredDD = (c - P) / c;
        var normRequired = requiredDD / (atrPct / 100);
        var hits = 0;
        for (var ed = 0; ed < empiricalDrawdowns.length; ed++) {
          if (empiricalDrawdowns[ed] >= normRequired) hits++;
        }
        var raw = hits / empiricalDrawdowns.length;
        var binFraction = Math.max(0.02, Math.min(1, (binEndMin - nowMinutes) / BIN_SIZE));
        var decayed = Math.pow(raw, Math.sqrt(binFraction));
        return Math.max(0, Math.min(1, decayed));
      }

      function fillProb(P) {
        var em = fillProbEmpirical(P);
        if (em != null) return em;
        return fillProbLognormal(P);
      }

      /* ── 4. 10-day horizon context from current price ─────────────────── */
      var ctx = computeHorizonConfidence(hourlyCandles, dailyCandles, {
        horizonDays: SCORE_CONFIG.horizonDays != null ? SCORE_CONFIG.horizonDays : 10, windowSessions: 40, entry_price: c, targetPct: 4,
        holdingDays: 0, indexCandles: indexCandles, entryScoreContext: entryScoreCtx
      });
      if (ctx.reason !== 'ok' || ctx.confidence == null) { base.reason = ctx.reason || base.reason; return base; }
      base.currentConfidence = ctx.confidence;

      var cp = ctx.components;
      base.components.horizonReachPct = cp.horizonReachPct;
      base.components.vwap = cp.hourlyVwap;
      base.components.ema21 = cp.ema21;
      base.components.rsi14 = cp.hourlyRsi14;
      base.components.hourlyAdx = cp.hourlyAdx;
      base.components.hourlyPlusDI = cp.hourlyPlusDI;
      base.components.hourlyMinusDI = cp.hourlyMinusDI;
      base.components.dailyEmaBullish = cp.dailyEmaBullish;
      base.components.dailyMacdBullish = cp.dailyMacdBullish;
      base.components.dailyAdx = cp.dailyAdx;
      base.components.regimeMult = cp.regimeMult;
      base.components.rsScore = cp.rsScore;

      /* ── 5. Isolate last 15 hourly sessions ───────────────────────────── */
      var seen = {}, keys = [];
      for (var i = hourlyCandles.length - 1; i >= 0 && keys.length < 15; i--) {
        var k = String(hourlyCandles[i].t).slice(0, 10);
        if (!seen[k]) { seen[k] = true; keys.push(k); }
      }
      var todayKey = String(cur.t).slice(0, 10);
      var recent = [];
      for (var j = 0; j < hourlyCandles.length; j++) {
        if (seen[String(hourlyCandles[j].t).slice(0, 10)]) recent.push(hourlyCandles[j]);
      }
      if (recent.length < 20) { base.reason = 'insufficient_hourly_window'; return base; }

      var high15 = -Infinity, low15 = Infinity, sessionOp = {}, sessionLo = {};
      for (var n = 0; n < recent.length; n++) {
        if (recent[n].h > high15) high15 = recent[n].h;
        if (recent[n].l < low15) low15 = recent[n].l;
        var sk = String(recent[n].t).slice(0, 10);
        if (sk === todayKey) continue;
        if (sessionOp[sk] == null) sessionOp[sk] = recent[n].o;
        if (sessionLo[sk] == null || recent[n].l < sessionLo[sk]) sessionLo[sk] = recent[n].l;
      }
      base.components.high15 = round(high15, 2);
      base.components.low15 = round(low15, 2);

      /* ── 6. Typical dip: median pullback from today's open to session low ─ */
      var dips = [];
      for (var sk2 in sessionLo) {
        var op = sessionOp[sk2];
        if (op > 0) dips.push((op - sessionLo[sk2]) / op * 100);
      }
      dips.sort(function (a, b) { return a - b; });
      var dipDepthPct = 0;
      if (dips.length > 0) {
        var mid = Math.floor(dips.length / 2);
        dipDepthPct = dips.length % 2 === 0 ? (dips[mid - 1] + dips[mid]) / 2 : dips[mid];
      }
      base.components.dipDepthPct = round(dipDepthPct, 2);

      /* ── 7. Recent support = lowest low of the last 3 completed sessions ─ */
      var last3 = {}, cnt3 = 0;
      for (var m = recent.length - 1; m >= 0 && cnt3 < 3; m--) {
        var mk = String(recent[m].t).slice(0, 10);
        if (mk === todayKey) continue;
        if (!last3[mk]) { last3[mk] = recent[m].l; cnt3++; }
      }
      var swingLow = Infinity;
      for (var sk3 in last3) if (last3[sk3] < swingLow) swingLow = last3[sk3];
      base.components.swingLow = swingLow === Infinity ? null : round(swingLow, 2);

      /* ── 8. VWAP distance, high gap ────────────────────────────────────── */
      var vwap = cp.hourlyVwap;
      var vDistPct = vwap != null && vwap > 0 ? (c - vwap) / vwap * 100 : null;
      var highGapPct = (high15 - c) / high15 * 100;
      base.components.vDistPct = vDistPct != null ? round(vDistPct, 2) : null;
      base.components.highGapPct = round(highGapPct, 2);

      /* ── 9. Overextended: ATR-normalized VWAP stretch + RSI ────────────── */
      var vwapExt = 0;
      if (vwap != null && atrPct != null) {
        var vwScale = atrPct / 100 * c;
        vwapExt = vwScale > 0 ? (c - vwap) / vwScale : 0;
      }
      var overextended = vwapExt > 2.0;
      if (cp.hourlyRsi14 != null && cp.hourlyRsi14 >= 85) overextended = true;
      base.overextended = overextended;

      /* ── 10. ATR-scaled discount cap ───────────────────────────────────── */
      var capPct = atrPct != null ? clamp(1.5 * atrPct, 2.0, 6.0) : 3.5;
      base.components.atrCapPct = round(capPct, 2);
      var floorP = c * (1 - capPct / 100);

      /* ── 11. Build candidate levels ────────────────────────────────────── */
      var cand = {};
      cand[c] = 'current';
      if (vwap != null && vwap > 0) cand[vwap] = 'VWAP';
      if (cp.ema21 != null && cp.ema21 > 0) cand[cp.ema21] = 'EMA21';
      if (dipDepthPct > 0.25) cand[c * (1 - dipDepthPct / 100)] = 'Typical dip';
      if (swingLow !== Infinity) cand[swingLow] = 'Swing low';

      var prices = Object.keys(cand).map(Number).filter(function (p) {
        return p > 0 && p <= c;
      }).sort(function (a, b) { return b - a; });
      if (prices.length === 0) prices = [c];

      /* ── 12. Score each candidate: fill probability + horizon confidence ─ */
      var candData = [];
      for (var p2 = 0; p2 < prices.length; p2++) {
        var P = prices[p2];
        var fp = fillProb(P);
        var res = computeHorizonConfidence(hourlyCandles, dailyCandles, {
          horizonDays: SCORE_CONFIG.horizonDays != null ? SCORE_CONFIG.horizonDays : 10, windowSessions: 40, entry_price: P, targetPct: 4,
          holdingDays: 0, indexCandles: indexCandles, entryScoreContext: entryScoreCtx
        });
        var isAggressive = P < floorP;
        candData.push({
          price: round(P, 2),
          fillProb: fp != null ? round(fp * 100, 1) : null,
          horizonConf: res.confidence != null ? round(res.confidence, 1) : null,
          tag: cand[P],
          aggressive: isAggressive
        });
      }
      base.candidates = candData;

      /* ── 13. Pick optimum entry: highest price with fillProb ≥ 50% ────── */
      var chosen;
      var strong = null;
      for (var q = 0; q < candData.length; q++) {
        if (candData[q].fillProb != null && candData[q].fillProb >= 50 && candData[q].price < c - 1e-9) {
          strong = candData[q]; break;
        }
      }
      if (!overextended && ctx.confidence >= 60) {
        chosen = candData[0];
      } else if (strong) {
        chosen = strong;
      } else {
        var best = candData[0];
        for (var r2 = 1; r2 < candData.length; r2++) {
          var a = candData[r2].fillProb != null ? candData[r2].fillProb : -1;
          var b = best.fillProb != null ? best.fillProb : -1;
          if (a > b) best = candData[r2];
        }
        chosen = best;
      }

      base.optimumEntryPrice = chosen.price;
      base.entryConfidence = chosen.horizonConf;
      base.discountPct = round((c - chosen.price) / c * 100, 2);
      base.advantagePct = chosen.horizonConf != null && ctx.confidence != null ? round(chosen.horizonConf - ctx.confidence, 1) : null;

      /* ── 14. Fill range: aggressive / moderate / conservative ──────────── */
      var aggressive = null, moderate = null, conservative = null;
      for (var r3 = 0; r3 < candData.length; r3++) {
        var cd = candData[r3];
        if (cd.price >= c - 1e-9) continue;
        if (cd.fillProb == null) continue;
        if (!conservative && cd.fillProb >= 30) conservative = cd;
        if (!moderate && cd.fillProb >= 50) moderate = cd;
        if (!aggressive && cd.fillProb >= 70) aggressive = cd;
      }
      base.fillRange = {
        aggressive: aggressive ? { price: aggressive.price, fillProb: aggressive.fillProb, tag: aggressive.tag } : null,
        moderate: moderate ? { price: moderate.price, fillProb: moderate.fillProb, tag: moderate.tag } : null,
        conservative: conservative ? { price: conservative.price, fillProb: conservative.fillProb, tag: conservative.tag } : null
      };

      /* ── 15. Today's high/low from intraday candles ─────────────────────── */
      var todayHi = -Infinity, todayLo = Infinity;
      var todaySource = intraCandles && intraCandles.length > 0 ? intraCandles : hourlyCandles;
      if (todaySource && todayKey) {
        for (var td = 0; td < todaySource.length; td++) {
          var tdKey = String(todaySource[td].t).slice(0, 10);
          if (tdKey === todayKey) {
            if (todaySource[td].h > todayHi) todayHi = todaySource[td].h;
            if (todaySource[td].l < todayLo) todayLo = todaySource[td].l;
          }
        }
      }
      base.todayHigh = todayHi !== -Infinity ? round(todayHi, 2) : null;
      base.todayLow = todayLo !== Infinity ? round(todayLo, 2) : null;

      /* ── 16. Probability of price falling to today's low ────────────────── */
      if (base.todayLow != null && base.todayLow < c - 1e-9 && !marketClosed) {
        var lnProb = fillProbLognormal(base.todayLow);
        base.probToTodayLowLognormal = lnProb != null ? round(lnProb * 100, 1) : null;
        var emProb = fillProbEmpirical(base.todayLow);
        base.probToTodayLowEmpirical = emProb != null ? round(emProb * 100, 1) : null;
      }

      base.reason = 'ok';
      return base;
    } catch (e) {
      base.reason = 'error';
      return base;
    }
  }

  /* --------------------------------------------------------------------------
     CANDLE PATTERN DETECTION
     Detects well-established 3-candle bullish and bearish patterns across the
     visible chart. Returns an array of detected patterns, each with:
       { name, type: "bullish"|"bearish", desc, bar, startBar, startTime, endTime }
     Capped at 20 most recent patterns to keep the chart readable.
     -------------------------------------------------------------------------- */
  function detectCandlePatterns(candles) {
    if (!candles || candles.length < 3) return [];
    var patterns = [];
    var L = candles.length;

    function body(c) { return Math.abs(c.c - c.o); }
    function isBullish(c) { return c.c > c.o; }
    function isBearish(c) { return c.c < c.o; }
    function mid(c) { return (c.o + c.c) / 2; }

    function add(name, type, desc, endIdx, startIdx) {
      var si = startIdx != null ? startIdx : endIdx;
      var startTime = candles[si] ? candles[si].t : "";
      var endTime = candles[endIdx] ? candles[endIdx].t : "";
      patterns.push({ name: name, type: type, desc: desc, bar: endIdx, startBar: si, startTime: startTime, endTime: endTime });
    }

    for (var i = L - 1; i >= 2; i--) {
      var c = candles[i];
      var c1 = candles[i - 2];
      var c2 = candles[i - 1];

      /* Morning Star: bearish, small body star, bullish close above midpoint */
      if (isBearish(c1) && body(c2) < body(c1) * 0.3 && isBullish(c) && c.c > mid(c1)) {
        add("Morning Star", "bullish", "Three-candle reversal: bearish, small body, then bullish close above midpoint. Classic bottom pattern.", i, i - 2);
      }

      /* Evening Star: bullish, small body star, bearish close below midpoint */
      if (isBullish(c1) && body(c2) < body(c1) * 0.3 && isBearish(c) && c.c < mid(c1)) {
        add("Evening Star", "bearish", "Three-candle reversal: bullish, small body, then bearish close below midpoint. Classic top pattern.", i, i - 2);
      }

      /* Three White Soldiers: three consecutive bullish candles with rising closes */
      if (isBullish(c1) && isBullish(c2) && isBullish(c) && c.c > c2.c && c2.c > c1.c && c.o > c1.o) {
        add("Three White Soldiers", "bullish", "Three consecutive bullish candles with rising closes. Strong bullish continuation.", i, i - 2);
      }

      /* Three Black Crows: three consecutive bearish candles with falling closes */
      if (isBearish(c1) && isBearish(c2) && isBearish(c) && c.c < c2.c && c2.c < c1.c && c.o < c1.o) {
        add("Three Black Crows", "bearish", "Three consecutive bearish candles with falling closes. Strong bearish continuation.", i, i - 2);
      }

      /* Bullish Abandoned Baby: bearish candle, doji gaps below, bullish candle gaps above doji */
      var c1Low = Math.min(c1.o, c1.c);
      var c3High = Math.max(c.o, c.c);
      if (isBearish(c1) && body(c2) < body(c1) * 0.1 && c2.c < c1Low && c2.o < c1Low &&
          isBullish(c) && c.o > c3High && c.o > Math.max(c2.o, c2.c)) {
        add("Bullish Abandoned Baby", "bullish", "Bearish candle, doji gaps below, bullish candle gaps above. High-reliability bottom reversal.", i, i - 2);
      }

      /* Bearish Abandoned Baby: bullish candle, doji gaps above, bearish candle gaps below doji */
      var c1High = Math.max(c1.o, c1.c);
      var c3Low = Math.min(c.o, c.c);
      if (isBullish(c1) && body(c2) < body(c1) * 0.1 && c2.o > c1High && c2.c > c1High &&
          isBearish(c) && c.o < c3Low && c.o < Math.min(c2.o, c2.c)) {
        add("Bearish Abandoned Baby", "bearish", "Bullish candle, doji gaps above, bearish candle gaps below. High-reliability top reversal.", i, i - 2);
      }

      /* Three Inside Up: bearish candle, bullish inside candle, then bullish close above first candle */
      if (isBearish(c1) && isBullish(c2) && c2.c < c1.o && c2.o > c1.c && isBullish(c) && c.c > c1.o) {
        add("Three Inside Up", "bullish", "Bearish, bullish inside bar, then close above first candle high. Confirmation reversal pattern.", i, i - 2);
      }

      /* Three Inside Down: bullish candle, bearish inside candle, then bearish close below first candle */
      if (isBullish(c1) && isBearish(c2) && c2.c > c1.o && c2.o < c1.c && isBearish(c) && c.c < c1.o) {
        add("Three Inside Down", "bearish", "Bullish, bearish inside bar, then close below first candle low. Confirmation reversal pattern.", i, i - 2);
      }

      /* Three-Line Strike (bullish): three bearish candles then a single bullish candle engulfing all three */
      if (isBearish(c1) && isBearish(c2) && isBearish(c) && c.c < c2.c && c2.c < c1.c &&
          isBullish(c) && c.c > c1.o && c.o < c.c) {
        add("Three-Line Strike", "bullish", "Three bearish candles followed by a bullish engulfing candle. Counter-trend continuation signal.", i, i - 2);
      }

      /* Three-Line Strike (bearish): three bullish candles then a single bearish candle engulfing all three */
      if (isBullish(c1) && isBullish(c2) && isBullish(c) && c.c > c2.c && c2.c > c1.c &&
          isBearish(c) && c.c < c1.o && c.o > c.c) {
        add("Three-Line Strike", "bearish", "Three bullish candles followed by a bearish engulfing candle. Counter-trend continuation signal.", i, i - 2);
      }
    }

    if (patterns.length > 20) patterns = patterns.slice(0, 20);
    return patterns;
  }

  /* --------------------------------------------------------------------------
     Public API
     -------------------------------------------------------------------------- */

  return {
    closes: closes, highs: highs, lows: lows, volumes: volumes,
    sma: cl_sma, smaSeries: calcSMA, ema: cl_ema, emaSeries: calcEMA, wma: calcWMA, hma: calcHMA, kama: calcKAMA,
    rollingVWAP: calcRollingVWAP, vwap: calcVWAP,
    pctFrom126dHigh: calcPctFrom126dHigh, pctFrom126dLow: calcPctFrom126dLow,
    pctFrom52wHigh: calcPctFrom52wHigh, pctFrom52wLow: calcPctFrom52wLow,
    sessionVWAP: calcSessionVWAP,
    detectSpike: calcDetectSpike, stabilityScore: calcStabilityScore,
    heikinAshi: calcHeikinAshi, chandelierExit: calcChandelierExit,
    beta: calcBeta, atr: calcATR, trueRange: calcTrueRange, adx: calcADX,
    parabolicSAR: calcParabolicSAR, supertrend: calcSuperTrend,
    vortex: calcVortex, aroon: calcAroon,
    ichimoku: calcIchimoku, macd: calcMACD, tsi: calcTSI, stc: calcSTC,
    awesomeOscillator: calcAwesomeOscillator, rsi: calcRSI, stochasticRSI: calcStochasticRSI,
    williamsR: calcWilliamsR, cci: calcCCI, roc: calcROC, momentum: calcMomentum,
    mfi: calcMFI, cmf: calcCMF, forceIndex: calcForceIndex,
    obv: calcOBV, pvt: calcPVT, kvo: calcKVO, anchoredVWAP: calcAnchoredVWAP,
    volumeProfile: calcVolumeProfile, squeezeMomentum: calcSqueezeMomentum,
    accumDistComposite: calcAccumDistComposite,
    bollingerBands: calcBollingerBands, keltnerChannels: calcKeltnerChannels,
    donchianChannels: calcDonchianChannels, darvasBox: calcDarvasBox,
    fibonacci: calcFibonacci, pivotPoints: calcPivotPoints,
    williamsFractals: calcWilliamsFractals, zigZag: calcZigZag,
    choppinessIndex: calcChoppinessIndex,
    smartMoney: calcSmartMoney, mtfAlignment: calcMTFAlignment,
    week52HL: calcWeek52HL, relativeStrength: calcRelativeStrength,
    computeAll: computeAll, computeAllWithIndex: computeAllWithIndex,
    interpret: interpret,
    computeExitScore: computeExitScore,
    computeEntryScore: computeEntryScore,
    computeMultiTFEntryScore: computeMultiTFEntryScore,
    computeMultiTFExitScore: computeMultiTFExitScore,
    computeCompatExitScore: computeCompatExitScore,
    computeSessionConfidence: computeSessionConfidence,
    computePrematureExitScore: computePrematureExitScore,
    computeForwardConfidence: computeForwardConfidence,
    computeTenDayForwardConfidence: computeTenDayForwardConfidence,
    computeHorizonConfidence: computeHorizonConfidence,
    computeOptimumEntryPrice: computeOptimumEntryPrice,
    integratedExitDecision: integratedExitDecision,
    detectCandlePatterns: detectCandlePatterns,
    getScoreConfig: getScoreConfig,
    getScoreConfigVersion: getScoreConfigVersion,
    getDefaultScoreConfig: getDefaultScoreConfig,
    setScoreConfig: setScoreConfig
  };
})();