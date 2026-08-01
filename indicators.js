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
      var m = -Infinity;
      for (var j = i - period + 1; j <= i; j++) { if (arr[j] > m) m = arr[j]; }
      out.push(m);
    }
    return out;
  }

  function rollingMin(arr, period) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var m = Infinity;
      for (var j = i - period + 1; j <= i; j++) { if (arr[j] < m) m = arr[j]; }
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
    var fastSC = 2 / (fast + 1);
    var slowSC = 2 / (slow + 1);
    var out = [];
    var prev = null;
    for (var i = 0; i < cl.length; i++) {
      if (i < period) { out.push(null); continue; }
      var direction = Math.abs(cl[i] - cl[i - period]);
      var volatility = 0;
      for (var j = i - period + 1; j <= i; j++) {
        volatility += Math.abs(cl[j] - cl[j - 1]);
      }
      var er = volatility !== 0 ? direction / volatility : 0;
      var sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
      if (prev === null) {
        prev = cl[i];
      } else {
        prev = prev + sc * (cl[i] - prev);
      }
      out.push(round(prev, 4));
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

  function calcAnchoredVWAP(candles, anchorIdx) {
    anchorIdx = anchorIdx || 0;
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

  function calcAccumDistComposite(candles) {
    if (!candles || candles.length < 20) return null;
    var cmf20 = calcCMF(candles, 20);
    var obvArr = calcOBV(candles);
    var fi13 = calcForceIndex(candles, 13);
    var mfi14 = calcMFI(candles, 14);
    var obvSlope = [];
    for (var i = 0; i < obvArr.length; i++) {
      if (i < 5 || obvArr[i] === null || obvArr[i - 5] === null) { obvSlope.push(null); continue; }
      obvSlope.push(obvArr[i] - obvArr[i - 5]);
    }
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < 20 || cmf20[i] === null || obvSlope[i] === null || fi13[i] === null || mfi14[i] === null) { out.push(null); continue; }
      var bull = 0, bear = 0;
      if (cmf20[i] > 0.05) bull++; else if (cmf20[i] < -0.05) bear++;
      if (obvSlope[i] > 0) bull++; else if (obvSlope[i] < 0) bear++;
      if (fi13[i] > 0) bull++; else if (fi13[i] < 0) bear++;
      if (mfi14[i] > 55) bull++; else if (mfi14[i] < 45) bear++;
      out.push(bull >= 3 ? 'ACCUMULATION' : bear >= 3 ? 'DISTRIBUTION' : 'NEUTRAL');
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

  function calcDarvasBox(candles, boxPeriod, confirmBars) {
    boxPeriod = boxPeriod || 20;
    confirmBars = confirmBars || 3;
    if (candles.length < boxPeriod) return null;
    var recentHigh = -Infinity, recentLow = Infinity;
    var start = Math.max(0, candles.length - boxPeriod);
    for (var i = start; i < candles.length; i++) { if (candles[i].h > recentHigh) recentHigh = candles[i].h; }
    for (var i = Math.max(0, candles.length - confirmBars); i < candles.length; i++) { if (candles[i].l < recentLow) recentLow = candles[i].l; }
    var lastC = candles[candles.length - 1].c;
    var position = lastC >= recentHigh ? "at_upper" : lastC <= recentLow ? "at_lower" : "inside";
    var boxHigh = round(recentHigh, 2); var boxLow = round(recentLow, 2);
    var boxRange = round(recentHigh - recentLow, 2);
    var breakout = lastC > recentHigh ? "up" : lastC < recentLow ? "down" : "none";
    return { boxTop: boxHigh, boxBottom: boxLow, top: boxHigh, bottom: boxLow, boxRange: boxRange, position: position, breakout: breakout, pctFromTop: boxRange > 0 ? round((recentHigh - lastC) / boxRange * 100, 1) : 0 };
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
    if (meanRet <= 0 || stdRet === 0) return 0;
    var posFrac = 0;
    for (var i = 0; i < rets.length; i++) if (rets[i] > 0) posFrac++;
    posFrac /= rets.length;
    var cv = stdRet / meanRet;
    var cvScore = Math.max(0, 1 - cv / 2);
    var score = 0.6 * posFrac + 0.4 * cvScore;
    return round(Math.max(0, Math.min(1, score)), 2);
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
    signals.sma_20 = lc > ind.sma_20 ? 'bullish' : 'bearish';
    signals.sma_50 = ind.sma_200 ? (lc > ind.sma_50 ? 'bullish' : 'bearish') : null;
    signals.sma_200 = ind.sma_200 != null ? (lc > ind.sma_200 ? 'bullish' : 'bearish') : null;
    signals.ema_9 = lc > ind.ema_9 ? 'bullish' : 'bearish';
    signals.ema_21 = lc > ind.ema_21 ? 'bullish' : 'bearish';
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
    var ctx = { indexTrendScore: idxEntryScoreVal, entryPrice: position.entry_price || sn.c, currentPrice: sn.c, holdingDays: position.holding_days || 0, entryScore: position.entry_score != null ? position.entry_score : 50 };

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
    if (sn.stochRsiK !== null && sn.stochRsiK < 20) s += 0.5;
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
    if (sn.mfi14 !== null && sn.mfi14 < 30) s += 0.5;
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
    if (sn.c < sn.vwap10 && sn.pc >= sn.prevVwap10) s += 2.0;
    else if (sn.c < sn.vwap10) { var pct = (sn.vwap10 - sn.c) / sn.vwap10 * 100; if (pct > 2.0) s += 1.5; else if (pct > 1.0) s += 1.0; else s += 0.5; }
    if (sn.vwap10 < sn.prevVwap10) s += 0.5;
    if (sn.c < sn.anchoredVwap) s += 1.5;
    if (sn.anchoredVwap < sn.prevAnchoredVwap) s += 0.5;
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
    if (sn.c < sn.bbMid && sn.pc >= sn.bbMidPrev) s += 2.0; else if (sn.c < sn.bbMid) s += 0.5;
    if (sn.c < sn.bbLower) s += 1.0;
    if (sn.bbWidth > sn.bbWidthPrev && sn.c < sn.bbMid) s += 0.5;
    if (sn.c < sn.kcMid && sn.pc >= sn.kcMidPrev) s += 1.0; else if (sn.c < sn.kcMid) s += 0.5;
    if (sn.c <= sn.dcLower * 1.01) s += 1.0;
    if (sn.c < sn.chandelierLong) s += 1.0;
    if (sn.chandelierLong < sn.chandelierLongPrev) s += 0.5;
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
    if (sn.hma16 < sn.prevHma16) s += 0.5;
    if (sn.kama10 < sn.prevKama10) s += 0.5;
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
    if (s >= 80) return { classification: 'STRONG_BUY', signal: 'STRONG_BUY', allocation_pct: 100 };
    if (s >= 65) return { classification: 'BUY', signal: 'BUY', allocation_pct: 70 };
    if (s >= 50) return { classification: 'WATCHLIST', signal: 'WATCHLIST', allocation_pct: 40 };
    if (s >= 35) return { classification: 'NEUTRAL', signal: 'NEUTRAL', allocation_pct: 0 };
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
  function buildTFSnapshot(candles, indexCandles) {
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
    for (var i = accumDist.length - 1; i >= 0; i--) { if (accumDist[i] !== null) { accumDistLabel = accumDist[i]; break; } }

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

    var zigzagArr = calcZigZag(candles);
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
      for (var v = Math.max(0, L - dVolLookback); v < L; v++) { dSumVol += vo[v]; dCnt++; }
      var dAvgVol = dCnt > 0 ? dSumVol / dCnt : 0;
      var dDist = 0;
      for (var v = L - 5; v < L; v++) { if (v > 0 && cl[v] < cl[v - 1] && vo[v] > dAvgVol) dDist++; }
      distDayRatio = round(dDist / 5, 2);
      if (L >= 6) {
        var dSumVolPrev = 0, dCntPrev = 0;
        for (var v = Math.max(0, L - 1 - dVolLookback); v < L - 1; v++) { dSumVolPrev += vo[v]; dCntPrev++; }
        var dAvgVolPrev = dCntPrev > 0 ? dSumVolPrev / dCntPrev : 0;
        var dDistPrev = 0;
        for (var v = L - 6; v < L - 1; v++) { if (v > 0 && cl[v] < cl[v - 1] && vo[v] > dAvgVolPrev) dDistPrev++; }
        prevDistDayRatio = round(dDistPrev / 5, 2);
      }
    }

    return {
      cl: cl, vo: vo, c: c, pc: pc,
      sma20: sma20, sma50: sma50, ema9: ema9, ema9Prev: ema9Prev, ema21: ema21, ema50: ema50, wma20: wma20,
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
    if (sn.chikou !== null && sn.pc !== null && sn.chikou > sn.pc) s += 0.5;
    if (sn.senkouA !== null && sn.senkouB !== null && sn.tenkan !== null && sn.kijun !== null && sn.chikou !== null && sn.pc !== null &&
        sn.c > Math.max(sn.senkouA, sn.senkouB) && sn.tenkan > sn.kijun && sn.senkouA > sn.senkouB && sn.chikou > sn.pc) s += 1.0;
    return Math.min(s, 6);
  }

  /* ── 10.3 Darvas + HMA + KAMA + Fib + Pivot + ZigZag + Choppiness + MTF (0-6) ── */
  function scoreDarvasStructure(sn) {
    var s = 0;
    if (sn.darvasTop !== null && sn.darvasBottom !== null) {
      if (sn.c >= sn.darvasTop) s += 1.5; else if (sn.c > (sn.darvasTop + sn.darvasBottom) / 2) s += 0.5;
    }
    if (sn.hma16 !== null && sn.c > sn.hma16) s += 0.25;
    if (sn.hma16 !== null && sn.prevHma16 !== null && sn.hma16 > sn.prevHma16) s += 0.25;
    if (sn.kama10 !== null && sn.c > sn.kama10) s += 0.25;
    if (sn.kama10 !== null && sn.prevKama10 !== null && sn.kama10 > sn.prevKama10) s += 0.25;
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

  /* Runs all 12 spec sub-scores (plus spike/stability) for one timeframe. */
  function scoreEntryComponentsForTF(candles, indexCandles, stabLookback) {
    var sn = buildTFSnapshot(candles, indexCandles);
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
        if (sn.vo[sn.cl.length - 1] > 1.5 * avgVol) items.push({ reason: "Donchian breakout + high volume", amount: 5 });
      }
    }
    if (opts.hourlyBullish && opts.dailyBullish && opts.weeklyBullish) items.push({ reason: "All TFs bullish (D/W/H)", amount: 5 });
    if (opts.idxTrendScore !== null && opts.idxTrendScore > 60) items.push({ reason: "Index trend score >60", amount: 3 });
    if (sn.accumDistLabel === 'ACCUMULATION' && sn.mtfAlign !== null && sn.mtfAlign > 80) items.push({ reason: "Accumulation + MTF>80", amount: 3 });
    if (sn.rsMansfield !== null && sn.aroonOsc !== null && sn.rsMansfield > 5 && sn.aroonOsc > 50) items.push({ reason: "RS Mansfield>5 + Aroon>50", amount: 3 });
    if (sn.pivotR1 !== null && sn.fibLevels !== null && sn.fibLevels['0.618'] !== null && sn.c > sn.pivotR1 && sn.c > sn.fibLevels['0.618']) items.push({ reason: "Above pivot R1 + fib 0.618", amount: 2 });
    return items;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Entry Score (single timeframe) — Full spec Sections 7-11
     ══════════════════════════════════════════════════════════════════════════ */
  function computeEntryScore(candles, indexCandles) {
    if (!candles || candles.length < 50) return { entry_score: null, reason: 'insufficient_data', need: 50, got: candles ? candles.length : 0 };
    var comps = scoreEntryComponentsForTF(candles, indexCandles);
    var sn = comps.sn;

    /* ── compute pillar scores from the 12 sub-scores ── */
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
      stabSub: comps.stability
    });

    /* ── bonuses (Section 11) ── */
    var idxTrendScore = computeIndexTrendScore(indexCandles);
    var bonusItems = buildEntryBonusItems(sn, {
      hourlyBullish: sn.c > sn.hma16,
      dailyBullish: sn.c > sn.ema21,
      weeklyBullish: sn.sma50 !== null && sn.c > sn.sma50,
      idxTrendScore: idxTrendScore
    });

    var penalties = 0;
    penaltyItems.forEach(function(it) { penalties += it.amount; });
    var bonuses = 0;
    bonusItems.forEach(function(it) { bonuses += it.amount; });

    var finalScore = Math.max(0, Math.min(100, rawTotal + penalties + bonuses));

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
     Multi-timeframe Entry Score — spec Sections 7-11 model:
     ALL 12 sub-scores (7.1-10.3) plus spike/stability are computed per
     timeframe and aggregated H*0.20 + D*0.50 + W*0.30, renormalized over the
     available timeframes. Section 11 penalties/bonuses use real H/D/W data.
     ══════════════════════════════════════════════════════════════════════════ */
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
    var baseTF = dTF || wTF || hTF || tfResults[0];
    if (!baseTF || !baseTF.candles || baseTF.candles.length < 50) return { multiTF_score: null, reason: 'no_valid_scores' };

    /* ── per-timeframe component snapshots (12 sub-scores + spike/stability) ── */
    var perTF = {};
    perTF.H = (hTF && hTF.candles && hTF.candles.length >= 50) ? scoreEntryComponentsForTF(hTF.candles, indexCandles, stabLookbackFor('H')) : null;
    perTF.D = (dTF && dTF.candles && dTF.candles.length >= 50) ? scoreEntryComponentsForTF(dTF.candles, indexCandles, stabLookbackFor('D')) : null;
    perTF.W = (wTF && wTF.candles && wTF.candles.length >= 50) ? scoreEntryComponentsForTF(wTF.candles, indexWeeklyCandles || indexCandles, stabLookbackFor('W')) : null;
    if (!perTF.H && !perTF.D && !perTF.W) return { multiTF_score: null, reason: 'no_valid_scores' };

    var SUBKEYS = ['maStack', 'macdTsiStcAo', 'adxStPsarViAroon', 'rsiStochRsiWillR', 'cciRocMomFi', 'mfiCmf',
                   'obvPvtKvo', 'vwapAnchored', 'vpSqueezeAd', 'bbKcDcChandelier', 'ichimoku', 'darvasStructure',
                   'spike', 'stability'];
    var weights = { H: 0.20, D: 0.50, W: 0.30 };

    /* ── weighted aggregation H*0.20 + D*0.50 + W*0.30 (renormalized) ── */
    var comps = {};
    SUBKEYS.forEach(function (key) {
      var wSum = 0, acc = 0;
      ['H', 'D', 'W'].forEach(function (label) {
        var c = perTF[label];
        if (c && c[key] !== null && c[key] !== undefined) { var w = weights[label]; acc += w * c[key]; wSum += w; }
      });
      comps[key] = wSum > 0 ? acc / wSum : 0;
    });

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
    var penaltyItems = buildEntryPenaltyItems(baseSn, {
      weeklyTrend: weeklyBearish ? 'bearish' : 'bullish',
      dailyBullish: dailyBullish,
      spikeSub: comps.spike,
      stabSub: comps.stability
    });

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
      idxTrendScore: idxTrendScore
    });

    var penalties = 0;
    penaltyItems.forEach(function (it) { penalties += it.amount; });
    var bonuses = 0;
    bonusItems.forEach(function (it) { bonuses += it.amount; });

    var finalScore = Math.max(0, Math.min(100, rawTotal + penalties + bonuses));
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
      var primary = tfResults.filter(function(tf) { return weights[tf.timeframe] === 0.50; })[0] || tfResults[0];
      try { if (primary && primary.candles) primarySn = buildTFSnapshot(primary.candles, indexCandles); } catch(e) {}
    }
    var penaltyItems = [], bonusItems = [];
    if (primarySn) {
      var ctx = { indexTrendScore: idxEntryScoreVal, entryPrice: position.entry_price || primarySn.c, currentPrice: primarySn.c, holdingDays: position.holding_days || 0, entryScore: position.entry_score != null ? position.entry_score : 50 };
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
      multiTF_exit_score: finalScore,
      trend_breakdown: round(Math.min(avgC('tf1a') + avgC('tf1b') + avgC('tf1c'), 25), 1),
      momentum_exhaustion: round(Math.min(avgC('tf2a') + avgC('tf2b') + avgC('tf2c'), 25), 1),
      volume_distribution: round(Math.min(avgC('tf3a') + avgC('tf3b') + avgC('tf3c'), 25), 1),
      structure_breakdown: round(Math.min(avgC('tf4a') + avgC('tf4b') + avgC('tf4c'), 25), 1),
      raw_score: multiTF,
      penalties: penalties, bonuses: bonuses,
      penalty_items: penaltyItems, bonus_items: bonusItems,
      classification: cls.classification, signal: cls.signal, action: cls.action,
      timeframesUsed: activeTFs, details: tfDetails
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
    var stopLoss, target;

    if (ep != null && cp != null) {
      target = ep * 1.04;
      stopLoss = atr != null ? ep - (atr * 1.5) : null;

      /* Layer 1: Hard Rules */
      if (cp >= target) return Object.assign({}, exitResult, { signal: 'EXIT', reason: 'Target hit (+4%)', action: 'Full exit', exit_score: exitScore });
      if (stopLoss != null && cp <= stopLoss) return Object.assign({}, exitResult, { signal: 'EXIT', reason: 'Stop loss triggered', action: 'Full exit', exit_score: exitScore });
      if (days >= 15 && cp < ep * 1.02) return Object.assign({}, exitResult, { signal: 'EXIT', reason: 'Time stop (15 days, <2%)', action: 'Full exit', exit_score: exitScore });
    }

    /* Layer 2: Exit Score */
    if (exitResult && exitResult.exit_score != null) {
      if (exitScore >= 85) return Object.assign({}, exitResult, { reason: 'Score ' + exitScore });
      if (exitScore >= 70) return Object.assign({}, exitResult, { reason: 'Score ' + exitScore });
      if (exitScore >= 55) return Object.assign({}, exitResult, { reason: 'Score ' + exitScore });
      if (exitScore >= 40 && cp != null && atr != null) {
        var newStop = Math.max(stopLoss || 0, cp - atr * 1.5);
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
    integratedExitDecision: integratedExitDecision
  };
})();