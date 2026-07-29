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

  function ema(arr, period) {
    var out = [];
    var k = 2 / (period + 1);
    var prev = null;
    for (var i = 0; i < arr.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      if (prev === null) {
        var sum = 0;
        for (var j = i - period + 1; j <= i; j++) sum += arr[j];
        prev = sum / period;
      } else {
        prev = arr[i] * k + prev * (1 - k);
      }
      out.push(prev);
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
    n = n || 8;
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
    period = period || 14; mult = mult || 2;
    var hi = highs(candles);
    var lo = lows(candles);
    var atrArr = calcATR(candles, 14);
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
    n = n || 30;
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
    var out = [];
    var atr = null;
    for (var i = 0; i < tr.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      if (atr === null) {
        var sum = 0;
        for (var j = i - period + 1; j <= i; j++) sum += tr[j];
        atr = sum / period;
      } else {
        atr = (atr * (period - 1) + tr[i]) / period;
      }
      out.push(round(atr, 4));
    }
    return out;
  }

  function calcADX(candles, period) {
    period = period || 14;
    if (candles.length < period + 1) return null;
    var plusDM = [], minusDM = [], trArr = [];
    for (var i = 1; i < candles.length; i++) {
      var upMove = candles[i].h - candles[i - 1].h;
      var downMove = candles[i - 1].l - candles[i].l;
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
      trArr.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c)));
    }
    var sTR = 0, sPDM = 0, sMDM = 0;
    for (var i = 0; i < period; i++) { sTR += trArr[i]; sPDM += plusDM[i]; sMDM += minusDM[i]; }
    var smTR = [sTR], smPDM = [sPDM], smMDM = [sMDM];
    for (var i = period; i < trArr.length; i++) {
      smTR.push(smTR[smTR.length - 1] - smTR[smTR.length - 1] / period + trArr[i]);
      smPDM.push(smPDM[smPDM.length - 1] - smPDM[smPDM.length - 1] / period + plusDM[i]);
      smMDM.push(smMDM[smMDM.length - 1] - smMDM[smMDM.length - 1] / period + minusDM[i]);
    }
    var plusDI = smPDM.map(function (v, i) { return smTR[i] > 0 ? 100 * v / smTR[i] : 0; });
    var minusDI = smMDM.map(function (v, i) { return smTR[i] > 0 ? 100 * v / smTR[i] : 0; });
    var dx = plusDI.map(function (v, i) { var sum = v + minusDI[i]; return sum > 0 ? 100 * Math.abs(v - minusDI[i]) / sum : 0; });
    var adxSum = 0;
    for (var i = 0; i < period; i++) adxSum += dx[i];
    var adxArr = [round(adxSum / period, 2)];
    for (var i = period; i < dx.length; i++) {
      adxArr.push(round((adxArr[adxArr.length - 1] * (period - 1) + dx[i]) / period, 2));
    }
    var padLen = trArr.length + 1 - adxArr.length;
    var out = [];
    for (var i = 0; i < padLen; i++) out.push(null);
    for (var i = 0; i < adxArr.length; i++) out.push(adxArr[i]);
    return { adx: out, plusDI: plusDI, minusDI: minusDI };
  }

  function calcSuperTrend(candles, period, multiplier) {
    period = period || 14;
    multiplier = multiplier || 2.5;
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
    var out = [];
    var isLong = candles[1].c > candles[0].c;
    var af = 0.02, afStep = 0.02, afMax = 0.20;
    var ep = isLong ? candles[0].h : candles[0].l;
    var sar = isLong ? candles[0].l : candles[0].h;
    out.push(null); out.push(round(sar, 2));
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
    var out = [];
    if (cl.length < period + 1) return cl.map(function () { return null; });
    var gains = [], losses = [];
    for (var i = 1; i < cl.length; i++) {
      var diff = cl[i] - cl[i - 1];
      gains.push(diff > 0 ? diff : 0);
      losses.push(diff < 0 ? -diff : 0);
    }
    var avgGain = 0, avgLoss = 0;
    for (var i = 0; i < period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
    avgGain /= period; avgLoss /= period;
    out.push(null);
    for (var i = 0; i < period - 1; i++) out.push(null);
    if (avgLoss === 0) out.push(100); else out.push(round(100 - 100 / (1 + avgGain / avgLoss), 2));
    for (var i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      if (avgLoss === 0) out.push(100); else out.push(round(100 - 100 / (1 + avgGain / avgLoss), 2));
    }
    return out;
  }

  function calcStochasticRSI(candles, rsiPeriod, kSmooth, dSmooth) {
    rsiPeriod = rsiPeriod || 14;
    kSmooth = kSmooth || 5; dSmooth = dSmooth || 5;
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
    period = period || 10;
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
      var ratio = negMF === 0 ? 100 : posMF / negMF;
      out.push(round(100 - 100 / (1 + ratio), 2));
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
    period = period || 14;
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
      out.push(round(out[i - 1] + candles[i].v * ((candles[i].c - candles[i - 1].c) / candles[i - 1].c), 0));
    }
    return out;
  }

  function calcKVO(candles, fast, slow, signal) {
    fast = fast || 34; slow = slow || 55; signal = signal || 13;
    var trend = [];
    for (var i = 0; i < candles.length; i++) {
      if (i === 0) { trend.push(1); continue; }
      trend.push(candles[i].h + candles[i].l + candles[i].c > candles[i - 1].h + candles[i - 1].l + candles[i - 1].c ? 1 : -1);
    }
    var vf = [];
    for (var i = 0; i < candles.length; i++) {
      var hlc = candles[i].h + candles[i].l + candles[i].c;
      var dm = Math.abs(2 * (candles[i].h - candles[i].l) / (hlc || 1) - 1);
      vf.push(candles[i].v * dm * trend[i] * 100);
    }
    var emaFast = ema(vf, fast), emaSlow = ema(vf, slow);
    var line = [];
    for (var i = 0; i < candles.length; i++) {
      if (emaFast[i] === null || emaSlow[i] === null) { line.push(null); continue; }
      line.push(round(emaFast[i] - emaSlow[i], 0));
    }
    var sigValid = [], sigIdx = [];
    for (var i = 0; i < line.length; i++) { if (line[i] !== null) { sigValid.push(line[i]); sigIdx.push(i); } }
    var sigEma = ema(sigValid, signal);
    var signalArr = line.map(function () { return null; });
    for (var i = 0; i < sigEma.length; i++) { signalArr[sigIdx[i]] = round(sigEma[i], 0); }
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

  function calcVolumeProfile(candles, numBins) {
    numBins = numBins || 20;
    if (!candles || candles.length < 2) return null;
    var hi = -Infinity, lo = Infinity;
    var cl = closes(candles);
    for (var i = 0; i < cl.length; i++) { if (cl[i] > hi) hi = cl[i]; if (cl[i] < lo) lo = cl[i]; }
    if (hi === lo) return null;
    var binSize = (hi - lo) / numBins;
    var bins = [];
    for (var b = 0; b < numBins; b++) {
      bins.push({ priceFrom: round(lo + b * binSize, 2), priceTo: round(lo + (b + 1) * binSize, 2), volume: 0 });
    }
    for (var i = 0; i < cl.length; i++) {
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
    return { bins: bins, poc: poc, pocVolume: pocBin.volume, vah: vah, val: val };
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
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var hh = -Infinity, ll = Infinity;
      for (var j = i - period + 1; j <= i; j++) { if (candles[j].h > hh) hh = candles[j].h; if (candles[j].l < ll) ll = candles[j].l; }
      var series = [];
      for (var j = i - period + 1; j <= i; j++) { series.push(cl[j] - (hh + ll) / 2); }
      var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (var j = 0; j < period; j++) { sumX += j; sumY += series[j]; sumXY += j * series[j]; sumX2 += j * j; }
      var slope = (period * sumXY - sumX * sumY) / (period * sumX2 - sumX * sumX);
      out.push(round(slope * (period - 1) + (sumY - slope * sumX) / period, 4));
    }
    return { values: out, squeeze: squeeze };
  }

  function calcAccumDistComposite(candles) {
    if (!candles || candles.length < 20) return null;
    var cmf20 = calcCMF(candles, 20);
    var obvArr = calcOBV(candles);
    var fi14 = calcForceIndex(candles, 14);
    var mfi14 = calcMFI(candles, 14);
    var obvSlope = [];
    for (var i = 0; i < obvArr.length; i++) {
      if (i < 10 || obvArr[i] === null || obvArr[i - 10] === null) { obvSlope.push(null); continue; }
      obvSlope.push(obvArr[i] - obvArr[i - 10]);
    }
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < 20 || cmf20[i] === null || obvSlope[i] === null || fi14[i] === null || mfi14[i] === null) { out.push(null); continue; }
      var bull = 0, bear = 0;
      if (cmf20[i] > 0.04) bull++; else if (cmf20[i] < -0.04) bear++;
      if (obvSlope[i] > 0) bull++; else if (obvSlope[i] < 0) bear++;
      if (fi14[i] > 0) bull++; else if (fi14[i] < 0) bear++;
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
      var std = Math.sqrt(sumSq / period);
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
    var atr = calcATR(candles, 14);
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

  function calcDarvasBox(candles, boxPeriod) {
    boxPeriod = boxPeriod || 20;
    if (candles.length < boxPeriod) return null;
    var recentHigh = -Infinity, recentLow = Infinity;
    var start = Math.max(0, candles.length - boxPeriod);
    for (var i = start; i < candles.length; i++) { if (candles[i].h > recentHigh) recentHigh = candles[i].h; if (candles[i].l < recentLow) recentLow = candles[i].l; }
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
    pct = pct || 3;
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
    var sum52 = 0, cnt52 = Math.min(rsArr.length, 252);
    for (var i = rsArr.length - cnt52; i < rsArr.length; i++) sum52 += rsArr[i].rs;
    var avg52 = sum52 / cnt52;
    var mansfield = avg52 > 0 ? round((latestRS / avg52 - 1) * 100, 2) : null;
    return { rs: round(latestRS, 4), mansfield: mansfield };
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
      cci_20: last(calcCCI(candles, 20)), roc_10: last(calcROC(candles, 10)), momentum_10: last(calcMomentum(candles, 10)),
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
      smartMoney: smc, mtfAlignment: last(calcMTFAlignment(candles)),
      week52HL: last(calcWeek52HL(candles)), lastClose: lastClose
    };
  }

  function computeAllWithIndex(candles, indexCandles) {
    var base = computeAll(candles);
    if (!base) return null;
    if (indexCandles && indexCandles.length > 10) {
      base.rs_vs_nifty = calcRelativeStrength(candles, indexCandles);
      base.beta_nifty = calcBeta(candles, indexCandles);
    }
    return base;
  }

  function interpret(ind) {
    if (!ind) return {};
    var signals = {};
    var lc = ind.lastClose;
    signals.sma_20 = lc > ind.sma_20 ? 'bullish' : 'bearish';
    signals.sma_50 = ind.sma_200 ? (lc > ind.sma_50 ? 'bullish' : 'bearish') : null;
    signals.ema_9 = lc > ind.ema_9 ? 'bullish' : 'bearish';
    signals.ema_21 = lc > ind.ema_21 ? 'bullish' : 'bearish';
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

    /* ── extract all indicator values from raw candles ── */
    var cl = closes(candles), hi = highs(candles), lo = lows(candles), vo = volumes(candles);
    var L = cl.length, L1 = L - 1, L2 = L - 2;

    function gv(arr) { return arr !== null && arr !== undefined && arr.length > L1 ? arr[L1] : null; }
    function pv(arr) { return arr !== null && arr !== undefined && arr.length > L2 ? arr[L2] : null; }

    var c = cl[L1], pc = cl[L2];

    var sma20_s = calcSMA(candles, 20), sma20 = gv(sma20_s);
    var sma50_s = calcSMA(candles, 50), sma50 = gv(sma50_s);
    var sma100_s = candles.length >= 100 ? calcSMA(candles, 100) : null;
    var sma100 = sma100_s ? gv(sma100_s) : null;
    var ema9_s = calcEMA(candles, 9), ema9 = gv(ema9_s), ema9Prev = pv(ema9_s);
    var ema21_s = calcEMA(candles, 21), ema21 = gv(ema21_s);
    var ema50_s = calcEMA(candles, 50), ema50 = gv(ema50_s);
    var wma20_s = calcWMA(candles, 20), wma20 = gv(wma20_s);
    var hma20_s = calcHMA(candles, 20), hma20 = gv(hma20_s), prevHma20 = pv(hma20_s);
    var kama10_s = calcKAMA(candles, 10), kama10 = gv(kama10_s), prevKama10 = pv(kama10_s);

    var vwap10_s = calcRollingVWAP(candles, 10), vwap10 = gv(vwap10_s), prevVwap10 = pv(vwap10_s);
    var anchoredVwap_s = calcAnchoredVWAP(candles), anchoredVwap = gv(anchoredVwap_s), prevAnchoredVwap = pv(anchoredVwap_s);
    var haRes = calcHeikinAshi(candles), haClose = gv(haRes.close), prevHaClose = pv(haRes.close);

    var macdRes = calcMACD(candles);
    var macd_s = macdRes.macd, macdL = gv(macd_s), macdPrev = pv(macd_s);
    var sig_s = macdRes.signal, sigL = gv(sig_s), sigPrev = pv(sig_s);
    var hist_s = macdRes.histogram, histL = gv(hist_s), histPrev = pv(hist_s);

    var tsi_s = calcTSI(candles), tsiL = gv(tsi_s), tsiPrev = pv(tsi_s);
    var stc_s = calcSTC(candles), stcL = gv(stc_s), stcPrev = pv(stc_s);
    var ao_s = calcAwesomeOscillator(candles), aoL = gv(ao_s), aoPrev = pv(ao_s);

    var adxRes = calcADX(candles);
    var adx_s = adxRes.adx, adxL = gv(adx_s), adxPrev = pv(adx_s);
    var plusDI_s = adxRes.plusDI, plusDI = gv(plusDI_s), plusDIPrev = pv(plusDI_s);
    var minusDI_s = adxRes.minusDI, minusDI = gv(minusDI_s), minusDIPrev = pv(minusDI_s);

    var st_s = calcSuperTrend(candles), stL = gv(st_s), stPrev = pv(st_s);
    var psar_s = calcParabolicSAR(candles), psar = gv(psar_s), psarPrev = pv(psar_s);

    var vxRes = calcVortex(candles);
    var viPlus_s = vxRes.plus, viPlus = gv(viPlus_s), viPlusPrev = pv(viPlus_s);
    var viMinus_s = vxRes.minus, viMinus = gv(viMinus_s), viMinusPrev = pv(viMinus_s);

    var arRes = calcAroon(candles);
    var aroonOsc_s = arRes.osc, aroonOsc = gv(aroonOsc_s), aroonOscPrev = pv(aroonOsc_s);

    var bbRes = calcBollingerBands(candles);
    var bbUpper = gv(bbRes.upper), bbMid = gv(bbRes.middle), bbLower = gv(bbRes.lower);
    var bbMidPrev = pv(bbRes.middle), bbLowerPrev = pv(bbRes.lower);
    var bbWidth = bbMid > 0 && bbUpper !== null && bbLower !== null ? round((bbUpper - bbLower) / bbMid, 4) : null;
    var prevBbWidth_s = [];
    for (var i = 0; i < bbRes.upper.length; i++) {
      if (bbRes.middle[i] !== null && bbRes.middle[i] > 0 && bbRes.upper[i] !== null && bbRes.lower[i] !== null) {
        prevBbWidth_s.push(round((bbRes.upper[i] - bbRes.lower[i]) / bbRes.middle[i], 4));
      } else { prevBbWidth_s.push(null); }
    }
    var bbWidthPrev = pv(prevBbWidth_s);

    var kcRes = calcKeltnerChannels(candles);
    var kcMid = gv(kcRes.middle), kcMidPrev = pv(kcRes.middle);
    var dcRes = calcDonchianChannels(candles);
    var dcUpper = gv(dcRes.upper), dcLower = gv(dcRes.lower);
    var chandelierRes = calcChandelierExit(candles);
    var chandelierLong = gv(chandelierRes.long), chandelierLongPrev = pv(chandelierRes.long);

    var atr14_s = calcATR(candles, 14), atr14 = gv(atr14_s);

    var rsi14_s = calcRSI(candles, 14), rsi14 = gv(rsi14_s), rsi14Prev = pv(rsi14_s);
    var stochRsiRes = calcStochasticRSI(candles);
    var stochRsiK = gv(stochRsiRes.k), stochRsiKPrev = pv(stochRsiRes.k);
    var stochRsiD = gv(stochRsiRes.d), stochRsiDPrev = pv(stochRsiRes.d);
    var willr_s = calcWilliamsR(candles), willr = gv(willr_s), willrPrev = pv(willr_s);

    var cci20_s = calcCCI(candles, 20), cci20 = gv(cci20_s), cci20Prev = pv(cci20_s);
    var roc10_s = calcROC(candles, 10), roc10 = gv(roc10_s), roc10Prev = pv(roc10_s);
    var mom10_s = calcMomentum(candles, 10), mom10 = gv(mom10_s), mom10Prev = pv(mom10_s);
    var fi14_s = calcForceIndex(candles, 14), fi14 = gv(fi14_s), fi14Prev = pv(fi14_s);

    var mfi14_s = calcMFI(candles, 14), mfi14 = gv(mfi14_s), mfi14Prev = pv(mfi14_s);
    var cmf20_s = calcCMF(candles, 20), cmf20 = gv(cmf20_s), cmf20Prev = pv(cmf20_s);

    var obv_s = calcOBV(candles), obv = gv(obv_s);
    var obvSma10 = gv(sma(obv_s, 10));
    var obvSlopeVal = slope(obv_s, 10), obvSlopePrev = slope(obv_s.slice(0, -1), 10);
    var pvt_s = calcPVT(candles), pvt = gv(pvt_s);
    var pvtSma10 = gv(sma(pvt_s, 10));
    var pvtSlopeVal = slope(pvt_s, 10);
    var kvoRes = calcKVO(candles);
    var kvoL = gv(kvoRes.line), kvoPrev = pv(kvoRes.line);
    var kvoSig = gv(kvoRes.signal), kvoSigPrev = pv(kvoRes.signal);

    /* ── distribution day ratio (5 of last 5) ── */
    function distributionDayRatio() {
      var period = 5, volLookback = 20;
      if (L < period) return 0;
      var sumVol = 0;
      for (var i = L - volLookback; i < L; i++) sumVol += vo[i];
      var avgVol = sumVol / volLookback;
      var distDays = 0;
      for (var i = L - period; i < L; i++) { if (i > 0 && cl[i] < cl[i - 1] && vo[i] > avgVol) distDays++; }
      return distDays / period;
    }
    var distDayRatio = distributionDayRatio();
    var prevDistDayRatio = (function () {
      if (L < 6) return 0;
      var period = 5, volLookback = 20;
      var sumVol = 0;
      for (var i = L - 1 - volLookback; i < L - 1; i++) sumVol += vo[i];
      var avgVol = sumVol / volLookback;
      var distDays = 0;
      for (var i = L - 1 - period; i < L - 1; i++) { if (i > 0 && cl[i] < cl[i - 1] && vo[i] > avgVol) distDays++; }
      return distDays / period;
    })();

    var smRes = calcSqueezeMomentum(candles);
    var squeezeOn = null, squeezeMomVal = null, squeezeMomPrev = null;
    var sqArr = smRes.squeeze;
    for (var i = sqArr.length - 1; i >= 0; i--) { if (sqArr[i] !== null) { squeezeOn = sqArr[i]; break; } }
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

    var fibRes = calcFibonacci(candles);
    var fibLevels = fibRes ? fibRes.retrace : {};
    var pivotRes = calcPivotPoints(candles);
    var pivotP = pivotRes ? pivotRes.classic.P : null;
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
    var chopIndex = gv(calcChoppinessIndex(candles)), prevChopIndex = pv(calcChoppinessIndex(candles));
    var mtfAlign = gv(calcMTFAlignment(candles));
    var mtfAllArr = calcMTFAlignment(candles), mtfAlignPrev = pv(mtfAllArr);

    var rsMansfield8w = null, rsMansfield8wPrev = null;
    if (indexCandles && indexCandles.length > 10) {
      try {
        var rsRes = calcRelativeStrength(candles, indexCandles);
        if (rsRes && rsRes.mansfield != null) rsMansfield8w = rsRes.mansfield;
        if (rsRes && rsRes.rs != null) {
          var indexCl = closes(indexCandles);
          var rsArr = [];
          for (var i = 0; i < indexCandles.length; i++) { if (cl[i] != null && indexCl[i] > 0) rsArr.push(cl[i] / indexCl[i]); }
          if (rsArr.length > 40) {
            var sum8w = 0;
            for (var j = rsArr.length - 40; j < rsArr.length - 1; j++) sum8w += rsArr[j];
            var prevAvg = sum8w / 40;
            var prevRs = rsArr.length > 1 ? rsArr[rsArr.length - 2] : null;
            rsMansfield8wPrev = prevAvg > 0 && prevRs !== null ? round((prevRs / prevAvg - 1) * 100, 2) : null;
          }
        }
      } catch(e) {}
    }

    /* ── position context ── */
    var entryPrice = position.entry_price || c;
    var currentPrice = c;
    var holdingDays = position.holding_days || 0;
    var entryScore = position.entry_score || 50;

    /* ── 12.1 MA Breakdown (9 pts) ── */
    function scoreMaBreakdown() {
      var s = 0;
      if (c < ema9 && pc >= ema9Prev) s += 1.5; else if (c < ema9) s += 0.5;
      if (c < ema21) s += 0.5;
      if (c < ema50) s += 0.5;
      if (sma100 !== null && c < sma100) s += 0.5;
      if (ema9 < ema21) s += 0.5;
      if (ema21 < ema50) s += 0.5;
      if (hma20 < prevHma20) s += 0.5;
      if (kama10 < prevKama10) s += 0.5;
      if (c < wma20) s += 0.5;
      if (sma20 < sma50) s += 0.5;
      if (rsMansfield8w !== null && rsMansfield8wPrev !== null && rsMansfield8w < 0 && rsMansfield8w < rsMansfield8wPrev) s += 1.0;
      if (haClose < prevHaClose && c < sma20) s += 0.5;
      if (c < chandelierLong) s += 0.5;
      return Math.min(s, 9);
    }

    /* ── 12.2 MACD + TSI + STC + AO Rollover (8 pts) ── */
    function scoreMacdTsiStcAoExit() {
      var s = 0;
      if (macdL !== null && sigL !== null && macdPrev !== null && sigPrev !== null) {
        if (macdL < sigL && macdPrev >= sigPrev) s += 2.0; else if (macdL < sigL) s += 1.0;
      }
      if (macdL !== null && macdPrev !== null && macdL < 0 && macdPrev >= 0) s += 1.0;
      if (histL !== null && histPrev !== null && histL < 0 && histL < histPrev) s += 0.5;
      if (tsiL !== null && tsiPrev !== null && tsiL < 0 && tsiPrev >= 0) s += 1.0; else if (tsiL !== null && tsiL < 0) s += 0.5;
      if (tsiL !== null && tsiPrev !== null && tsiL < tsiPrev) s += 0.5;
      if (stcL !== null && stcL < 25) s += 0.5;
      if (stcL !== null && stcPrev !== null && stcL < stcPrev && stcL < 75) s += 0.5;
      if (aoL !== null && aoPrev !== null && aoL < 0 && aoPrev >= 0) s += 1.0; else if (aoL !== null && aoL < 0) s += 0.5;
      if (aoL !== null && aoPrev !== null && aoL < aoPrev) s += 0.5;
      return Math.min(s, 8);
    }

    /* ── 12.3 ADX + Supertrend + PSAR + Vortex + Aroon Breakdown (8 pts) ── */
    function scoreAdxStPsarViAroonExit() {
      var s = 0;
      if (adxL !== null && adxPrev !== null) { if (adxL < adxPrev && adxL < 20) s += 1.5; else if (adxL < adxPrev) s += 0.5; }
      if (minusDI !== null && plusDI !== null && minusDIPrev !== null && plusDIPrev !== null && minusDI > plusDI && minusDIPrev <= plusDIPrev) s += 1.5;
      if (stL !== null && c < stL) s += 1.0;
      if (stL !== null && stPrev !== null && pc !== null && pc >= stPrev && c < stL) s += 0.5;
      if (psar !== null && c < psar) s += 0.5;
      if (psar !== null && psarPrev !== null && pc !== null && pc >= psarPrev && c < psar) s += 0.5;
      if (viMinus !== null && viPlus !== null && viMinusPrev !== null && viPlusPrev !== null && viMinus > viPlus && viMinusPrev <= viPlusPrev) s += 1.0;
      else if (viMinus !== null && viPlus !== null && viMinus > viPlus) s += 0.5;
      if (aroonOsc !== null) { if (aroonOsc < -50) s += 1.0; else if (aroonOsc < 0) s += 0.5; }
      if (aroonOsc !== null && aroonOscPrev !== null && aroonOsc < aroonOscPrev) s += 0.5;
      return Math.min(s, 8);
    }

    /* ── 13.1 RSI + StochRSI + Williams %R Exhaustion (9 pts) ── */
    function scoreRsiStochRsiWillrExit() {
      var s = 0;
      if (rsi14 !== null) { if (rsi14 > 75) s += 2.0; else if (rsi14 > 65) s += 1.0; }
      if (rsi14 !== null && rsi14Prev !== null && rsi14 < rsi14Prev && rsi14Prev > 65) s += 1.0;
      if (rsi14 !== null && rsi14Prev !== null && rsi14 < 50 && rsi14Prev >= 50) s += 0.5;
      if (stochRsiK !== null && stochRsiD !== null && stochRsiKPrev !== null && stochRsiDPrev !== null && stochRsiK < stochRsiD && stochRsiKPrev >= stochRsiDPrev) s += 1.5;
      else if (stochRsiK !== null && stochRsiD !== null && stochRsiK < stochRsiD) s += 0.5;
      if (stochRsiK !== null && stochRsiK < 20) s += 0.5;
      if (willr !== null && willr < -70) s += 1.0;
      if (willr !== null && willrPrev !== null && willr < -45 && willrPrev >= -45) s += 1.0;
      if (willr !== null && willrPrev !== null && willr < willrPrev && willr < -45) s += 0.5;
      return Math.min(s, 9);
    }

    /* ── 13.2 CCI + ROC + Momentum + Force Index Reversal (8 pts) ── */
    function scoreCciRocMomFiExit() {
      var s = 0;
      if (cci20 !== null) { if (cci20 > 160) s += 1.0; else if (cci20 > 80) s += 0.5; }
      if (cci20 !== null && cci20Prev !== null && cci20 < cci20Prev && cci20Prev > 80) s += 1.0;
      if (cci20 !== null && cci20Prev !== null && cci20 < 0 && cci20Prev >= 0) s += 0.5;
      if (roc10 !== null && roc10Prev !== null && roc10 < 0 && roc10Prev >= 0) s += 1.0; else if (roc10 !== null && roc10 < 0) s += 0.5;
      if (mom10 !== null && mom10Prev !== null && mom10 < 0 && mom10Prev >= 0) s += 1.0; else if (mom10 !== null && mom10 < 0) s += 0.5;
      if (fi14 !== null && fi14Prev !== null && fi14 < 0 && fi14Prev >= 0) s += 1.0; else if (fi14 !== null && fi14 < 0) s += 0.5;
      if (fi14 !== null && fi14Prev !== null && fi14 < fi14Prev && fi14 < 0) s += 0.5;
      return Math.min(s, 8);
    }

    /* ── 13.3 MFI + CMF Outflow (8 pts) ── */
    function scoreMfiCmfExit() {
      var s = 0;
      if (mfi14 !== null) { if (mfi14 > 78) s += 2.0; else if (mfi14 > 68) s += 1.0; }
      if (mfi14 !== null && mfi14Prev !== null && mfi14 < mfi14Prev && mfi14Prev > 68) s += 1.0;
      if (mfi14 !== null && mfi14Prev !== null && mfi14 < 50 && mfi14Prev >= 50) s += 0.5;
      if (mfi14 !== null && mfi14 < 30) s += 0.5;
      if (cmf20 !== null) { if (cmf20 < -0.04) s += 2.0; else if (cmf20 < 0) s += 1.0; }
      if (cmf20 !== null && cmf20Prev !== null && cmf20 < cmf20Prev && cmf20 < 0) s += 0.5;
      return Math.min(s, 8);
    }

    /* ── 14.1 OBV + PVT + KVO + Force Index Decline (9 pts) ── */
    function scoreObvPvtKvoFiExit() {
      var s = 0;
      if (obv !== null && obvSma10 !== null && obv < obvSma10) s += 1.0;
      if (obvSlopeVal !== null && obvSlopePrev !== null && obvSlopeVal < 0 && obvSlopePrev > 0) s += 0.5;
      else if (obvSlopeVal !== null && obvSlopeVal < 0) s += 0.5;
      if (pvt !== null && pvtSma10 !== null && pvt < pvtSma10) s += 1.0;
      if (pvtSlopeVal !== null && pvtSlopeVal < 0) s += 0.5;
      if (kvoL !== null && kvoSig !== null && kvoPrev !== null && kvoSigPrev !== null && kvoL < kvoSig && kvoPrev >= kvoSigPrev) s += 1.5;
      else if (kvoL !== null && kvoSig !== null && kvoL < kvoSig) s += 0.5;
      if (kvoL !== null && kvoL < 0) s += 0.5;
      if (fi14 !== null && fi14 < 0) s += 1.0;
      if (fi14 !== null && fi14Prev !== null && fi14 < fi14Prev && fi14 < 0) s += 0.5;
      return Math.min(s, 9);
    }

    /* ── 14.2 VWAP + Anchored VWAP Break (8 pts) ── */
    function scoreVwapAvwapExit() {
      var s = 0;
      if (c < vwap10 && pc >= prevVwap10) s += 2.0;
      else if (c < vwap10) { var pct = (vwap10 - c) / vwap10 * 100; if (pct > 1.5) s += 1.5; else if (pct > 0.8) s += 1.0; else s += 0.5; }
      if (vwap10 < prevVwap10) s += 0.5;
      if (c < anchoredVwap) s += 1.5;
      if (anchoredVwap < prevAnchoredVwap) s += 0.5;
      if (c < vwap10 && c < anchoredVwap) s += 1.0;
      return Math.min(s, 8);
    }

    /* ── 14.3 TTM Squeeze + Distribution Confirmation (8 pts) ── */
    function scoreSqueezeDistExit() {
      var s = 0;
      if (squeezeMomVal !== null && squeezeMomPrev !== null && squeezeMomVal < 0 && squeezeMomPrev >= 0) s += 2.5;
      else if (squeezeMomVal !== null && squeezeMomVal < 0) s += 1.5;
      if (squeezeMomVal !== null && squeezeMomPrev !== null && squeezeMomVal < squeezeMomPrev && squeezeMomVal < 0) s += 1.0;
      if (squeezeOn && squeezeMomVal < 0) s += 1.0;
      if (distDayRatio >= 0.6) s += 2.5; else if (distDayRatio >= 0.4) s += 1.5;
      if (distDayRatio > prevDistDayRatio) s += 1.0;
      return Math.min(s, 8);
    }

    /* ── 15.1 BB + KC + DC + Chandelier Breakdown (9 pts) ── */
    function scoreBbKcDcChandelierExit() {
      var s = 0;
      if (c < bbMid && pc >= bbMidPrev) s += 2.0; else if (c < bbMid) s += 0.5;
      if (c < bbLower) s += 1.0;
      if (bbWidth > bbWidthPrev && c < bbMid) s += 0.5;
      if (c < kcMid && pc >= kcMidPrev) s += 1.0; else if (c < kcMid) s += 0.5;
      if (c <= dcLower * 1.01) s += 1.0;
      if (c < chandelierLong) s += 1.0;
      if (chandelierLong < chandelierLongPrev) s += 0.5;
      if (atr14 !== null && c > 0) { var atrPct = atr14 / c * 100; if (atrPct > 3.0) s += 0.5; }
      return Math.min(s, 9);
    }

    /* ── 15.2 Ichimoku Bearish Flip (6 pts) ── */
    function scoreIchimokuExit() {
      var s = 0;
      if (senkouA !== null && senkouB !== null) {
        var cloudBottom = Math.min(senkouA, senkouB);
        if (c < cloudBottom) s += 2.0; else if (c < Math.max(senkouA, senkouB)) s += 0.5;
      }
      if (tenkan !== null && kijun !== null && tenkanPrev !== null && kijunPrev !== null && tenkan < kijun && tenkanPrev >= kijunPrev) s += 1.5;
      else if (tenkan !== null && kijun !== null && tenkan < kijun) s += 0.5;
      if (senkouA !== null && senkouB !== null && senkouA < senkouB) s += 0.5;
      if (c < pc) s += 0.5;
      if (senkouA !== null && senkouB !== null && tenkan !== null && kijun !== null && c < Math.min(senkouA, senkouB) && tenkan < kijun && senkouA < senkouB) s += 0.5;
      return Math.min(s, 6);
    }

    /* ── 15.3 Darvas + HMA + KAMA + MTF + Fib + Pivot + Fractals Breakdown (10 pts) ── */
    function scoreDarvasStructureExit() {
      var s = 0;
      if (darvasBottom !== null) { if (c <= darvasBottom) s += 2.0; else if (darvasTop !== null && c < (darvasTop + darvasBottom) / 2) s += 0.5; }
      if (hma20 < prevHma20) s += 0.5;
      if (kama10 < prevKama10) s += 0.5;
      if (c < hma20 && c < kama10) s += 0.5;
      if (mtfAlign !== null) { if (mtfAlign < 40) s += 1.5; else if (mtfAlign < 60) s += 0.5; }
      if (mtfAlign !== null && mtfAlignPrev !== null && mtfAlign < mtfAlignPrev) s += 0.5;
      if (fibLevels && fibLevels['0.618'] !== null && c < fibLevels['0.618']) s += 1.0;
      if (fibLevels && fibLevels['0.786'] !== null && c < fibLevels['0.786']) s += 0.5;
      if (pivotS1 !== null && c < pivotS1) s += 0.5;
      if (pivotS2 !== null && c < pivotS2) s += 0.5;
      if (zigzagDirection === 'DOWN') s += 0.5;
      if (chopIndex !== null && prevChopIndex !== null && chopIndex > prevChopIndex && chopIndex > 61.8) s += 0.5;
      if (atr14 !== null && entryPrice !== null && entryPrice > 0) {
        var stopLoss = entryPrice - atr14 * 1.3;
        var target = entryPrice * 1.035;
        var risk = currentPrice - stopLoss;
        var reward = target - currentPrice;
        if (risk > 0 && reward > 0) { var rr = reward / risk; if (rr < 1.0) s += 1.5; else if (rr < 1.5) s += 0.5; }
        else if (reward <= 0) s += 1.0;
      }
      return Math.min(s, 10);
    }

    /* ── compute pillar scores ── */
    var trendBD = scoreMaBreakdown() + scoreMacdTsiStcAoExit() + scoreAdxStPsarViAroonExit();
    var momExh = scoreRsiStochRsiWillrExit() + scoreCciRocMomFiExit() + scoreMfiCmfExit();
    var volDist = scoreObvPvtKvoFiExit() + scoreVwapAvwapExit() + scoreSqueezeDistExit();
    var strucBD = scoreBbKcDcChandelierExit() + scoreIchimokuExit() + scoreDarvasStructureExit();
    var rawTotal = trendBD + momExh + volDist + strucBD;

    /* ── penalties (reduce exit urgency) ── */
    var penaltyItems = [];
    var weeklyEmaAligned = ema9 !== null && ema21 !== null && ema9 > ema21;
    var weeklyMacdBullish = macdL !== null && sigL !== null && macdL > sigL;
    if (weeklyEmaAligned && weeklyMacdBullish) penaltyItems.push({ reason: "Weekly EMA+MACD bullish", amount: -8 });
    var priceDecl3 = true;
    for (var i = L - 3; i < L; i++) { if (i > L - 3 && cl[i] >= cl[i - 1]) { priceDecl3 = false; break; } }
    var avgVol20 = 0;
    for (var i = L - 20; i < L; i++) avgVol20 += vo[i];
    avgVol20 /= 20;
    if (priceDecl3 && vo[L1] < 0.7 * avgVol20) penaltyItems.push({ reason: "Price decline 3 + low volume", amount: -6 });
    if (pivotS1 !== null && c > 0) { var distToSupport = (c - pivotS1) / c; if (distToSupport < 0.015 && distToSupport >= 0) penaltyItems.push({ reason: "Near support", amount: -5 }); }
    if (holdingDays < 3 && entryScore > 70) penaltyItems.push({ reason: "Held <3 days + high entry score", amount: -5 });
    if (fibLevels && fibLevels['0.618'] !== null && pivotP !== null && c > fibLevels['0.618'] && c > pivotP) penaltyItems.push({ reason: "Above fib 0.618 + pivot", amount: -3 });

    /* ── bonuses (increase exit urgency) ── */
    var bonusItems = [];
    if (indexCandles && indexCandles.length > 10) {
      var idxClose = closes(indexCandles);
      if (idxClose && idxClose.length > 5) {
        var idxInd = computeAll(indexCandles);
        if (idxInd && idxInd.ema_9 !== null && idxClose[idxClose.length - 1] < idxInd.ema_9 && idxInd.ema_9 < idxInd.ema_21) bonusItems.push({ reason: "Index bearish EMA9<21", amount: 5 });
      }
    }
    if (distDayRatio >= 0.6) bonusItems.push({ reason: "Distribution days >=60%", amount: 5 });
    if (entryPrice !== null && entryPrice > 0) { if (currentPrice < entryPrice * 0.97) bonusItems.push({ reason: "Price <97% entry", amount: 5 }); else if (currentPrice < entryPrice * 0.985) bonusItems.push({ reason: "Price <98.5% entry", amount: 3 }); }
    var dailyBearish = hma20 !== null && c < hma20;
    var hourlyBearish = ema9 !== null && c < ema9;
    if (dailyBearish && hourlyBearish) bonusItems.push({ reason: "Daily+Hourly bearish", amount: 5 });
    if (accumDistLabel === 'DISTRIBUTION' && mtfAlign !== null && mtfAlign < 40) bonusItems.push({ reason: "Distribution + MTF<40", amount: 3 });
    var betaVal = null;
    try { if (indexCandles && indexCandles.length > 10) betaVal = calcBeta(candles, indexCandles); } catch(e) {}
    if (betaVal !== null && betaVal > 1.5) { var idxInd2 = null;
      try { if (indexCandles && indexCandles.length > 10) { idxInd2 = computeAll(indexCandles); } } catch(e) {}
      if (idxInd2 && idxInd2.ema_9 !== null && idxClose && idxClose[idxClose.length - 1] < idxInd2.ema_9) bonusItems.push({ reason: "High beta + index bearish", amount: 3 });
    }
    if (c < chandelierLong && pivotS1 !== null && c < pivotS1) bonusItems.push({ reason: "Below Chandelier + S1", amount: 3 });

    var penalties = 0;
    penaltyItems.forEach(function(it) { penalties += it.amount; });
    var bonuses = 0;
    bonusItems.forEach(function(it) { bonuses += it.amount; });

    var finalScore = Math.max(0, Math.min(100, rawTotal + penalties + bonuses));

    /* ── classification ── */
    var classification, signal, action;
    if (finalScore >= 85) { classification = 'URGENT_EXIT'; signal = 'URGENT_EXIT'; action = 'Full exit immediately'; }
    else if (finalScore >= 70) { classification = 'EXIT'; signal = 'EXIT'; action = 'Full exit at current price or next bar open'; }
    else if (finalScore >= 55) { classification = 'PARTIAL_EXIT'; signal = 'PARTIAL_EXIT'; action = 'Exit 50%, tighten trailing stop to 1.5x ATR(14)'; }
    else if (finalScore >= 40) { classification = 'TIGHTEN_STOP'; signal = 'TIGHTEN_STOP'; action = 'Move stop to breakeven or 1.3x ATR(14) below current'; }
    else if (finalScore >= 25) { classification = 'MONITOR'; signal = 'MONITOR'; action = 'No action — watch for escalation'; }
    else { classification = 'HOLD'; signal = 'HOLD'; action = 'All conditions intact — continue holding'; }

    return {
      exit_score: round(finalScore, 1),
      raw_score: round(rawTotal, 1),
      trend_breakdown: round(trendBD, 1), momentum_exhaustion: round(momExh, 1),
      volume_distribution: round(volDist, 1), structure_breakdown: round(strucBD, 1),
      penalties: round(penalties, 1), bonuses: round(bonuses, 1),
      penalty_items: penaltyItems, bonus_items: bonusItems,
      classification: classification, signal: signal, action: action,
      details: {
        maBreakdown: round(scoreMaBreakdown(), 2), macdTsiStcAoExit: round(scoreMacdTsiStcAoExit(), 2), adxStPsarViAroonExit: round(scoreAdxStPsarViAroonExit(), 2),
        rsiStochRsiWillrExit: round(scoreRsiStochRsiWillrExit(), 2), cciRocMomFiExit: round(scoreCciRocMomFiExit(), 2), mfiCmfExit: round(scoreMfiCmfExit(), 2),
        obvPvtKvoFiExit: round(scoreObvPvtKvoFiExit(), 2), vwapAvwapExit: round(scoreVwapAvwapExit(), 2), squeezeDistExit: round(scoreSqueezeDistExit(), 2),
        bbKcDcChandelierExit: round(scoreBbKcDcChandelierExit(), 2), ichimokuExit: round(scoreIchimokuExit(), 2), darvasStructureExit: round(scoreDarvasStructureExit(), 2)
      }
    };
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

  /* ══════════════════════════════════════════════════════════════════════════
     Entry Score (single timeframe) — Full spec Sections 7-11
     ══════════════════════════════════════════════════════════════════════════ */
  function computeEntryScore(candles, indexCandles) {
    if (!candles || candles.length < 50) return { entry_score: null, reason: 'insufficient_data', need: 50, got: candles ? candles.length : 0 };

    /* ── extract all indicator values from raw candles ── */
    var cl = closes(candles), hi = highs(candles), lo = lows(candles), vo = volumes(candles);
    var L = cl.length, L1 = L - 1, L2 = L - 2;

    function gv(arr) { return arr !== null && arr !== undefined && arr.length > L1 ? arr[L1] : null; }
    function pv(arr) { return arr !== null && arr !== undefined && arr.length > L2 ? arr[L2] : null; }
    function gva(arr, idx) { return arr !== null && arr !== undefined && arr.length > idx ? arr[idx] : null; }

    var c = cl[L1], pc = cl[L2];

    var sma20_s = calcSMA(candles, 20), sma20 = gv(sma20_s);
    var sma50_s = calcSMA(candles, 50), sma50 = gv(sma50_s);
    var sma100_s = candles.length >= 100 ? calcSMA(candles, 100) : null;
    var sma100 = sma100_s ? gv(sma100_s) : null;
    var ema9_s = calcEMA(candles, 9), ema9 = gv(ema9_s);
    var ema21_s = calcEMA(candles, 21), ema21 = gv(ema21_s);
    var ema50_s = calcEMA(candles, 50), ema50 = gv(ema50_s);
    var wma20_s = calcWMA(candles, 20), wma20 = gv(wma20_s);
    var hma20_s = calcHMA(candles, 20), hma20 = gv(hma20_s), prevHma20 = pv(hma20_s);
    var kama10_s = calcKAMA(candles, 10), kama10 = gv(kama10_s), prevKama10 = pv(kama10_s);

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
    var plusDI_s = adxRes.plusDI, plusDI = gv(plusDI_s), minusDI = gv(adxRes.minusDI);

    var st_s = calcSuperTrend(candles), stL = gv(st_s), stPrev = pv(st_s);
    var psar_s = calcParabolicSAR(candles), psar = gv(psar_s), psarPrev = pv(psar_s);

    var vxRes = calcVortex(candles);
    var viPlus_s = vxRes.plus, viPlus = gv(viPlus_s), viPlusPrev = pv(viPlus_s);
    var viMinus_s = vxRes.minus, viMinus = gv(viMinus_s), viMinusPrev = pv(viMinus_s);

    var arRes = calcAroon(candles);
    var aroonOsc_s = arRes.osc, aroonOsc = gv(aroonOsc_s), aroonOscPrev = pv(aroonOsc_s);

    var bbRes = calcBollingerBands(candles);
    var bbUpper = gv(bbRes.upper), bbMid = gv(bbRes.middle), bbLower = gv(bbRes.lower);
    var bbWidth = bbMid > 0 && bbUpper !== null && bbLower !== null ? round((bbUpper - bbLower) / bbMid, 4) : null;
    var prevBbWidth_s = [];
    for (var i = 0; i < bbRes.upper.length; i++) {
      if (bbRes.middle[i] !== null && bbRes.middle[i] > 0 && bbRes.upper[i] !== null && bbRes.lower[i] !== null) {
        prevBbWidth_s.push(round((bbRes.upper[i] - bbRes.lower[i]) / bbRes.middle[i], 4));
      } else { prevBbWidth_s.push(null); }
    }
    var bbWidthPrev = pv(prevBbWidth_s);

    var kcRes = calcKeltnerChannels(candles);
    var kcUpper = gv(kcRes.upper), kcMid = gv(kcRes.middle), kcLower = gv(kcRes.lower);
    var dcRes = calcDonchianChannels(candles);
    var dcUpper = gv(dcRes.upper), dcLower = gv(dcRes.lower);
    var chandelierRes = calcChandelierExit(candles);
    var chandelierLong = gv(chandelierRes.long), chandelierLongPrev = pv(chandelierRes.long);

    var atr14_s = calcATR(candles, 14), atr14 = gv(atr14_s);

    var rsi14_s = calcRSI(candles, 14), rsi14 = gv(rsi14_s), rsi14Prev = pv(rsi14_s);
    var stochRsiRes = calcStochasticRSI(candles);
    var stochRsiK = gv(stochRsiRes.k), stochRsiKPrev = pv(stochRsiRes.k);
    var stochRsiD = gv(stochRsiRes.d);
    var willr_s = calcWilliamsR(candles), willr = gv(willr_s), willrPrev = pv(willr_s);

    var cci20_s = calcCCI(candles, 20), cci20 = gv(cci20_s), cci20Prev = pv(cci20_s);
    var roc10_s = calcROC(candles, 10), roc10 = gv(roc10_s), roc10Prev = pv(roc10_s);
    var roc21_s = calcROC(candles, 21), roc21 = gv(roc21_s);
    var mom10_s = calcMomentum(candles, 10), mom10 = gv(mom10_s), mom10Prev = pv(mom10_s);
    var fi14_s = calcForceIndex(candles, 14), fi14 = gv(fi14_s), fi14Prev = pv(fi14_s);

    var mfi14_s = calcMFI(candles, 14), mfi14 = gv(mfi14_s), mfi14Prev = pv(mfi14_s);
    var cmf20_s = calcCMF(candles, 20), cmf20 = gv(cmf20_s), cmf20Prev = pv(cmf20_s);

    var obv_s = calcOBV(candles), obv = gv(obv_s);
    var obvSma10 = gv(sma(obv_s, 10));
    var obvSlopeVal = slope(obv_s, 10), obvSlopePrev = slope(obv_s.slice(0, -1), 10);
    var pvt_s = calcPVT(candles), pvt = gv(pvt_s);
    var pvtSma10 = gv(sma(pvt_s, 10));
    var pvtSlopeVal = slope(pvt_s, 10), pvtSlopePrev = slope(pvt_s.slice(0, -1), 10);
    var kvoRes = calcKVO(candles);
    var kvoL = gv(kvoRes.line), kvoPrev = pv(kvoRes.line);
    var kvoSig = gv(kvoRes.signal);

    var vpRes = calcVolumeProfile(candles);
    var poc = vpRes ? vpRes.poc : null, prevPoc = null;
    var vah = vpRes ? vpRes.vah : null;
    if (vpRes && vpRes.bins && vpRes.bins.length > 1) {
      var prevPocBin = vpRes.bins[0];
      for (var b = 1; b < vpRes.bins.length; b++) { if (vpRes.bins[b].volume > prevPocBin.volume) prevPocBin = vpRes.bins[b]; }
      prevPoc = prevPocBin ? round((prevPocBin.priceFrom + prevPocBin.priceTo) / 2, 2) : poc;
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
    var tenkan = gv(ichRes.tenkan), kijun = gv(ichRes.kijun);
    var senkouA = gv(ichRes.senkouA), senkouB = gv(ichRes.senkouB);
    var chikou = gv(ichRes.chikou);

    var fibRes = calcFibonacci(candles);
    var fibLevels = fibRes ? fibRes.retrace : null;
    var pivotRes = calcPivotPoints(candles);
    var pivotP = pivotRes ? pivotRes.classic.P : null;
    var pivotR1 = pivotRes ? pivotRes.classic.R1 : null;
    var darvasRes = calcDarvasBox(candles);
    var darvasTop = darvasRes ? darvasRes.top : null;
    var darvasBottom = darvasRes ? darvasRes.bottom : null;

    var zigzagArr = calcZigZag(candles);
    var zigzagDirection = null;
    if (zigzagArr && zigzagArr.length >= 2) {
      var lastPivot = zigzagArr[zigzagArr.length - 1], prevPivot = zigzagArr[zigzagArr.length - 2];
      zigzagDirection = cl[lastPivot] > cl[prevPivot] ? 'UP' : 'DOWN';
    }
    var chopIndex = gv(calcChoppinessIndex(candles));
    var mtfAlign = gv(calcMTFAlignment(candles));

    var beta = null;
    var rsMansfield8w = null, rsMansfield8wPrev = null, rsMansfield4w = null;
    if (indexCandles && indexCandles.length > 10) {
      try {
        beta = calcBeta(candles, indexCandles);
        var rsRes = calcRelativeStrength(candles, indexCandles);
        if (rsRes && rsRes.mansfield != null) rsMansfield8w = rsRes.mansfield;
        if (rsRes && rsRes.rs != null) {
          var indexCl = closes(indexCandles);
          var rsArr = [];
          for (var i = 0; i < indexCandles.length; i++) { if (cl[i] != null && indexCl[i] > 0) rsArr.push(cl[i] / indexCl[i]); }
          if (rsArr.length > 40) {
            var sum4w = 0;
            for (var j = rsArr.length - 20; j < rsArr.length; j++) sum4w += rsArr[j];
            rsMansfield4w = sum4w / 20 > 0 ? round((rsArr[rsArr.length - 1] / (sum4w / 20) - 1) * 100, 2) : null;
            var sum8w = 0;
            for (var j = rsArr.length - 40; j < rsArr.length - 1; j++) sum8w += rsArr[j];
            var prevAvg8w = sum8w / 40;
            var prevRs = rsArr.length > 1 ? rsArr[rsArr.length - 2] : null;
            rsMansfield8wPrev = prevAvg8w > 0 && prevRs !== null ? round((prevRs / prevAvg8w - 1) * 100, 2) : null;
          }
        }
      } catch(e) {}
    }

    /* ── 7.1 MA Stack (10 pts) ── */
    function scoreMaStack() {
      var s = 0;
      if (c > ema9) s += 0.5; if (c > ema21) s += 0.5; if (c > ema50) s += 0.5; if (sma100 !== null && c > sma100) s += 0.5;
      if (ema9 !== null && ema21 !== null && ema50 !== null && ema9 > ema21 && ema21 > ema50) s += 2.0;
      else if (ema9 !== null && ema21 !== null && (ema9 > ema21 || ema21 > ema50)) s += 1.0;
      if (sma20 !== null && sma50 !== null && sma100 !== null && sma20 > sma50 && sma50 > sma100) s += 2.0;
      else if (sma20 !== null && sma50 !== null && sma20 > sma50) s += 1.0;
      var fastBull = 0;
      if (hma20 !== null && c > hma20) fastBull++; if (kama10 !== null && c > kama10) fastBull++; if (wma20 !== null && c > wma20) fastBull++;
      s += Math.min(fastBull * 0.67, 2.0);
      if (hma20 !== null && prevHma20 !== null && hma20 > prevHma20) s += 0.5;
      if (rsMansfield8w !== null && rsMansfield8w > 0) s += 0.5;
      if (rsMansfield8w !== null && rsMansfield8wPrev !== null && rsMansfield8w > rsMansfield8wPrev && rsMansfield4w !== null && rsMansfield4w > 0) s += 0.5;
      return Math.min(s, 10);
    }

    /* ── 7.2 MACD + TSI + STC + AO (10 pts) ── */
    function scoreMacdTsiStcAo() {
      var s = 0;
      if (macdL !== null && sigL !== null && macdL > sigL) s += 1.0;
      if (macdL !== null && macdL > 0) s += 0.5;
      if (histL !== null && histPrev !== null && histL > 0 && histL > histPrev) s += 0.5;
      if (macdL !== null && sigL !== null && hasCrossedAbove(macd_s, sig_s)) s += 0.5;
      if (tsiL !== null && tsiL > 0) s += 0.5;
      if (tsiL !== null && tsiPrev !== null && tsiL > tsiPrev && tsiL > 0) s += 0.5;
      if (tsiL !== null && justCrossedAbove(tsi_s, cl.map(function(){return 0;}), 3)) s += 0.5;
      if (stcL !== null && stcL > 50) s += 0.5;
      if (stcL !== null && stcPrev !== null && stcL > stcPrev) s += 0.5;
      if (stcL !== null && stcL > 75) s += 0.5;
      if (stcL !== null && justCrossedAbove(stc_s, cl.map(function(){return 25;}), 3)) s += 0.5;
      if (aoL !== null && aoL > 0) s += 0.5;
      if (aoL !== null && aoPrev !== null && aoL > aoPrev) s += 0.5;
      if (aoL !== null && aoPrev !== null && aoL > 0 && aoPrev <= 0) s += 0.5;
      var confluence = 0;
      if (macdL !== null && sigL !== null && macdL > sigL) confluence++; if (tsiL !== null && tsiL > 0) confluence++;
      if (stcL !== null && stcL > 50) confluence++; if (aoL !== null && aoL > 0) confluence++;
      if (confluence >= 3) s += 1.0;
      return Math.min(s, 10);
    }

    /* ── 7.3 ADX + Supertrend + PSAR + Vortex + Aroon (10 pts) ── */
    function scoreAdxStPsarViAroon() {
      var s = 0;
      if (adxL !== null) { if (adxL >= 35) s += 1.0; else if (adxL >= 20) s += 0.5; }
      if (plusDI !== null && minusDI !== null && plusDI > minusDI) s += 0.5;
      if (adxL !== null && adxPrev !== null && plusDI !== null && minusDI !== null && adxL > adxPrev && plusDI > minusDI) s += 0.5;
      if (stL !== null && c > stL) s += 1.0;
      if (stL !== null && stPrev !== null && pc !== null && pc <= stPrev && c > stL) s += 0.5;
      if (psar !== null && c > psar) s += 0.5;
      if (psar !== null && psarPrev !== null && pc !== null && pc <= psarPrev && c > psar) s += 0.5;
      if (viPlus !== null && viMinus !== null && viPlus > viMinus) s += 1.0;
      if (viPlus !== null && viMinus !== null && viPlusPrev !== null && viMinusPrev !== null && viPlus > viPlusPrev && viMinus < viMinusPrev) s += 0.5;
      if (aroonOsc !== null) { if (aroonOsc > 50) s += 1.0; else if (aroonOsc > 0) s += 0.5; }
      if (aroonOsc !== null && aroonOscPrev !== null && aroonOsc > aroonOscPrev && aroonOsc > 0) s += 0.5;
      var allBull = (stL !== null && c > stL) && (psar !== null && c > psar) && (plusDI !== null && minusDI !== null && plusDI > minusDI) &&
                    (viPlus !== null && viMinus !== null && viPlus > viMinus) && (aroonOsc !== null && aroonOsc > 0);
      if (allBull) s += 1.0;
      return Math.min(s, 10);
    }

    /* ── 8.1 RSI + StochRSI + Williams %R (10 pts) ── */
    function scoreRsiStochRsiWillR() {
      var s = 0;
      if (rsi14 !== null) {
        if (rsi14 >= 58 && rsi14 <= 72) s += 2.0; else if (rsi14 >= 52 && rsi14 < 58) s += 1.0; else if (rsi14 > 72 && rsi14 <= 78) s += 1.0; else if (rsi14 >= 48 && rsi14 < 52) s += 0.5;
      }
      if (rsi14 !== null && rsi14Prev !== null && rsi14 > rsi14Prev && rsi14 > 50) s += 1.0;
      if (rsi14 !== null && rsi14Prev !== null && rsi14Prev <= 50 && rsi14 > 50) s += 0.5;
      if (stochRsiK !== null && stochRsiD !== null && stochRsiK > stochRsiD) s += 1.0;
      if (stochRsiK !== null && stochRsiK >= 50 && stochRsiK <= 80) s += 0.5;
      if (stochRsiK !== null && stochRsiKPrev !== null && stochRsiK > stochRsiKPrev) s += 0.5;
      if (willr !== null) {
        if (willr >= -45 && willr <= -15) s += 1.0; else if (willr >= -70 && willr < -45) s += 0.5;
      }
      if (willr !== null && willrPrev !== null && willr > willrPrev && willr > -45) s += 0.5;
      if (willr !== null && willr > -15) s += 0.5;
      if (rsi14 !== null && stochRsiK !== null && stochRsiD !== null && willr !== null && rsi14 > 55 && stochRsiK > stochRsiD && willr > -45) s += 0.5;
      return Math.min(s, 10);
    }

    /* ── 8.2 CCI + ROC + Momentum + Force Index (10 pts) ── */
    function scoreCciRocMomFi() {
      var s = 0;
      if (cci20 !== null) {
        if (cci20 >= 80 && cci20 <= 160) s += 1.5; else if (cci20 >= 40 && cci20 < 80) s += 1.0; else if (cci20 >= 0 && cci20 < 40) s += 0.5;
      }
      if (cci20 !== null && cci20Prev !== null && cci20 > cci20Prev && cci20 > 0) s += 0.5;
      if (roc10 !== null && roc10Prev !== null && roc10 > 0 && roc10 > roc10Prev) s += 1.5;
      else if (roc10 !== null && roc10 > 0) s += 0.5;
      if (roc10 !== null && roc21 !== null && roc10 > 3 && roc21 > 5) s += 0.5;
      if (mom10 !== null && mom10Prev !== null && mom10 > 0 && mom10 > mom10Prev) s += 1.5;
      else if (mom10 !== null && mom10 > 0) s += 0.5;
      if (fi14 !== null && fi14Prev !== null && fi14 > 0 && fi14 > fi14Prev) s += 1.5;
      else if (fi14 !== null && fi14 > 0) s += 0.5;
      if (fi14 !== null && fi14Prev !== null && fi14 > 0 && fi14Prev <= 0) s += 0.5;
      if (cci20 !== null && roc10 !== null && mom10 !== null && fi14 !== null && cci20 > 0 && roc10 > 0 && mom10 > 0 && fi14 > 0) s += 1.0;
      return Math.min(s, 10);
    }

    /* ── 8.3 MFI + CMF (10 pts) ── */
    function scoreMfiCmf() {
      var s = 0;
      if (mfi14 !== null) {
        if (mfi14 >= 58 && mfi14 <= 78) s += 2.5; else if (mfi14 >= 50 && mfi14 < 58) s += 1.5; else if (mfi14 >= 42 && mfi14 < 50) s += 1.0; else if (mfi14 > 78) s += 1.0;
      }
      if (mfi14 !== null && mfi14Prev !== null && mfi14 > mfi14Prev && mfi14 > 50) s += 1.5;
      if (mfi14 !== null && mfi14Prev !== null && mfi14Prev <= 50 && mfi14 > 50) s += 1.0;
      if (cmf20 !== null) { if (cmf20 > 0.08) s += 2.0; else if (cmf20 > 0.04) s += 1.5; else if (cmf20 > 0) s += 1.0; }
      if (cmf20 !== null && cmf20Prev !== null && cmf20 > cmf20Prev && cmf20 > 0) s += 1.0;
      if (mfi14 !== null && cmf20 !== null && mfi14 > 50 && cmf20 > 0) s += 0.5;
      return Math.min(s, 10);
    }

    /* ── 9.1 OBV + PVT + KVO (8 pts) ── */
    function scoreObvPvtKvo() {
      var s = 0;
      if (obv !== null && obvSma10 !== null && obv > obvSma10) s += 1.0;
      if (obvSlopeVal !== null && obvSlopeVal > 0) s += 0.5;
      if (obvSlopeVal !== null && obvSlopePrev !== null && obvSlopeVal > obvSlopePrev) s += 0.5;
      if (pvt !== null && pvtSma10 !== null && pvt > pvtSma10) s += 1.0;
      if (pvtSlopeVal !== null && pvtSlopeVal > 0) s += 1.0;
      if (pvtSlopeVal !== null && pvtSlopePrev !== null && pvtSlopeVal > pvtSlopePrev) s += 0.5;
      if (kvoL !== null && kvoSig !== null && kvoL > kvoSig) s += 1.5;
      if (kvoL !== null && kvoL > 0) s += 0.5;
      if (kvoL !== null && kvoPrev !== null && kvoL > kvoPrev) s += 0.5;
      if (kvoL !== null && kvoSig !== null && justCrossedAbove(kvoRes.line, kvoRes.signal, 3)) s += 1.0;
      return Math.min(s, 8);
    }

    /* ── 9.2 Rolling VWAP + Anchored VWAP (6 pts) ── */
    function scoreVwapAnchored() {
      var s = 0;
      if (c !== null && vwap10 !== null && c > vwap10) {
        s += 1.5;
        var pct = (c - vwap10) / vwap10 * 100;
        if (pct >= 0.3 && pct <= 2.0) s += 0.5;
        if (vwap10 !== null && prevVwap10 !== null && vwap10 > prevVwap10) s += 0.5;
      }
      if (c !== null && anchoredVwap !== null && c > anchoredVwap) s += 1.5;
      if (anchoredVwap !== null && prevAnchoredVwap !== null && anchoredVwap > prevAnchoredVwap) s += 0.5;
      if (c !== null && vwap10 !== null && anchoredVwap !== null && c > vwap10 && c > anchoredVwap) s += 1.0;
      return Math.min(s, 6);
    }

    /* ── 9.3 VP + TTM Squeeze + Accum/Dist (6 pts) ── */
    function scoreVpSqueezeAd() {
      var s = 0;
      if (c !== null && poc !== null && c > poc) s += 1.0;
      if (c !== null && vah !== null && c > vah) s += 0.5;
      if (poc !== null && prevPoc !== null && poc > prevPoc) s += 0.5;
      if (squeezeOn !== null && squeezeOnPrev !== null) { if (!squeezeOn && squeezeOnPrev) s += 1.0; else if (squeezeOn) s += 0.5; }
      if (squeezeMomVal !== null && squeezeMomPrev !== null && squeezeMomVal > 0 && squeezeMomVal > squeezeMomPrev) s += 1.5;
      else if (squeezeMomVal !== null && squeezeMomVal > 0) s += 0.5;
      if (accumDistLabel === 'ACCUMULATION') s += 1.5;
      return Math.min(s, 6);
    }

    /* ── 10.1 BB + KC + DC + Chandelier (8 pts) ── */
    function scoreBbKcDcChandelier() {
      var s = 0;
      if (bbUpper !== null && bbLower !== null) {
        var bbPos = (c - bbLower) / (bbUpper - bbLower);
        if (bbPos >= 0.5 && bbPos <= 0.8) s += 1.0; else if (bbPos >= 0.3 && bbPos < 0.5) s += 0.5;
      }
      if (bbWidth !== null && bbWidthPrev !== null && bbWidth > bbWidthPrev) s += 0.5;
      if (kcMid !== null && c > kcMid) s += 0.5;
      if (kcUpper !== null && c > kcUpper) s += 0.5;
      if (dcUpper !== null && dcLower !== null) { if (c >= dcUpper * 0.99) s += 1.0; else if (c > (dcUpper + dcLower) / 2) s += 0.5; }
      if (chandelierLong !== null && c > chandelierLong) s += 1.0;
      if (chandelierLong !== null && chandelierLongPrev !== null && chandelierLong > chandelierLongPrev) s += 0.5;
      if (bbUpper !== null && kcUpper !== null && bbLower !== null && kcLower !== null && bbUpper < kcUpper && bbLower > kcLower) s += 0.5;
      if (atr14 !== null && c !== null && c > 0) { var atrPct = atr14 / c * 100; if (atrPct >= 1.2 && atrPct <= 2.2) s += 0.5; }
      if (dcUpper !== null && c > dcUpper && bbWidth !== null && bbWidthPrev !== null && bbWidth > bbWidthPrev) s += 1.0;
      return Math.min(s, 8);
    }

    /* ── 10.2 Ichimoku (6 pts) ── */
    function scoreIchimoku() {
      var s = 0;
      if (senkouA !== null && senkouB !== null) {
        var cloudTop = Math.max(senkouA, senkouB);
        if (c > cloudTop) s += 2.0; else if (c > Math.min(senkouA, senkouB)) s += 0.5;
      }
      if (tenkan !== null && kijun !== null && tenkan > kijun) s += 1.0;
      if (tenkan !== null && kijun !== null && hasCrossedAbove(ichRes.tenkan, ichRes.kijun)) s += 0.5;
      if (senkouA !== null && senkouB !== null && senkouA > senkouB) s += 1.0;
      if (chikou !== null && pc !== null && chikou > pc) s += 0.5;
      if (senkouA !== null && senkouB !== null && tenkan !== null && kijun !== null && chikou !== null && pc !== null &&
          c > Math.max(senkouA, senkouB) && tenkan > kijun && senkouA > senkouB && chikou > pc) s += 1.0;
      return Math.min(s, 6);
    }

    /* ── 10.3 Darvas + HMA + KAMA + Fib + Pivot + ZigZag + Choppiness + MTF + Beta (6 pts) ── */
    function scoreDarvasStructure() {
      var s = 0;
      if (darvasTop !== null && darvasBottom !== null) {
        if (c >= darvasTop) s += 1.5; else if (c > (darvasTop + darvasBottom) / 2) s += 0.5;
      }
      if (hma20 !== null && c > hma20) s += 0.25;
      if (hma20 !== null && prevHma20 !== null && hma20 > prevHma20) s += 0.25;
      if (kama10 !== null && c > kama10) s += 0.25;
      if (kama10 !== null && prevKama10 !== null && kama10 > prevKama10) s += 0.25;
      if (fibLevels !== null && pc !== null) {
        for (var key in fibLevels) { if (key === '0.382' || key === '0.5' || key === '0.618') { if (Math.abs(c - fibLevels[key]) / c < 0.005 && c > pc) { s += 0.5; break; } } }
      }
      if (pivotP !== null && c > pivotP) s += 0.25;
      if (pivotR1 !== null && c > pivotR1) s += 0.25;
      if (chopIndex !== null && chopIndex < 38.2) s += 0.5; else if (chopIndex !== null && chopIndex < 50) s += 0.25;
      if (zigzagDirection === 'UP') s += 0.5;
      if (mtfAlign !== null) { if (mtfAlign >= 80) s += 1.0; else if (mtfAlign >= 60) s += 0.5; }
      return Math.min(s, 6);
    }

    /* ── compute pillar scores ── */
    var trendScore = scoreMaStack() + scoreMacdTsiStcAo() + scoreAdxStPsarViAroon();
    var momentumScore = scoreRsiStochRsiWillR() + scoreCciRocMomFi() + scoreMfiCmf();
    var volumeScore = scoreObvPvtKvo() + scoreVwapAnchored() + scoreVpSqueezeAd();
    var structureScore = scoreBbKcDcChandelier() + scoreIchimoku() + scoreDarvasStructure();
    var rawTotal = trendScore + momentumScore + volumeScore + structureScore;

    /* ── penalties ── */
    var penaltyItems = [];
    if (rsi14 !== null && rsi14 > 78) penaltyItems.push({ reason: "RSI overbought", amount: -5 });
    var rising5 = true, declining5 = true;
    for (var i = Math.max(0, L - 5); i < L; i++) { if (i > Math.max(0, L - 5) && cl[i] <= cl[i - 1]) rising5 = false; if (i > Math.max(0, L - 5) && vo[i] >= vo[i - 1]) declining5 = false; }
    if (cl.length >= 5) { if (rising5 && declining5) penaltyItems.push({ reason: "Rising price + declining volume 5 days", amount: -8 }); }
    if (cl.length >= 5 && hma20_s && hma20_s.length > 1) {
      var weeklyTrend = 'neutral'; var dailyBullish = false;
      if (hma20 !== null && c > hma20) dailyBullish = true;
      if (weeklyTrend === 'bearish' && dailyBullish) penaltyItems.push({ reason: "Weekly bearish + daily bullish clash", amount: -10 });
    }
    if (pivotR1 !== null && c !== null && pivotR1 > 0) { var distToRes = (pivotR1 - c) / c; if (distToRes < 0.01 && distToRes >= 0) penaltyItems.push({ reason: "Near resistance", amount: -5 }); }
    if (squeezeOn !== null) { var sqDuration = 0;
      for (var i = sqArr.length - 1; i >= 0; i--) { if (sqArr[i] === true) sqDuration++; else break; }
      if (squeezeOn && sqDuration > 10) penaltyItems.push({ reason: "Squeeze over 10 bars", amount: -3 });
    }
    if (beta !== null && beta > 1.5 && atr14 !== null && c > 0) { var atrPct = atr14 / c * 100; if (atrPct > 3.0) penaltyItems.push({ reason: "High beta + high ATR", amount: -3 }); }

    /* ── bonuses ── */
    var bonusItems = [];
    if (dcUpper !== null) { var prevDcUpper = pv(dcRes && dcRes.upper ? dcRes.upper : null);
      if (c > dcUpper) { var avgVol = 0, avgVolCount = 0;
        for (var i = Math.max(0, L - 20); i < L; i++) { avgVol += vo[i]; avgVolCount++; }
        avgVol = avgVolCount > 0 ? avgVol / avgVolCount : 0;
        if (vo[L1] > 1.5 * avgVol) bonusItems.push({ reason: "Donchian breakout + high volume", amount: 5 });
      }
    }
    var hourlyBullish = false, dailyBullish = false, weeklyBullish = false;
    if (c > ema21) dailyBullish = true;
    if (hma20 !== null && c > hma20) hourlyBullish = true;
    if (sma50 !== null && c > sma50) weeklyBullish = true;
    if (dailyBullish && weeklyBullish && hourlyBullish) bonusItems.push({ reason: "All TFs bullish (D/W/H)", amount: 5 });
    if (indexCandles && indexCandles.length > 10) {
      var idxClose = closes(indexCandles);
      if (idxClose && idxClose.length > 5) { var idxInd = computeAll(indexCandles);
        if (idxInd && idxInd.ema_9 !== null && idxClose[idxClose.length - 1] > idxInd.ema_9) bonusItems.push({ reason: "Index above EMA(9)", amount: 3 }); }
    }
    if (accumDistLabel === 'ACCUMULATION' && mtfAlign !== null && mtfAlign > 80) bonusItems.push({ reason: "Accumulation + MTF>80", amount: 3 });
    if (rsMansfield8w !== null && aroonOsc !== null && rsMansfield8w > 5 && aroonOsc > 50) bonusItems.push({ reason: "RS Mansfield>5 + Aroon>50", amount: 3 });
    if (pivotR1 !== null && fibLevels !== null && fibLevels['0.618'] !== null && c > pivotR1 && c > fibLevels['0.618']) bonusItems.push({ reason: "Above pivot R1 + fib 0.618", amount: 2 });
    if (roc10 !== null && roc21 !== null && roc10 > 3 && roc21 > 5) bonusItems.push({ reason: "ROC(10)>3 + ROC(21)>5", amount: 4 });

    var penalties = 0;
    penaltyItems.forEach(function(it) { penalties += it.amount; });
    var bonuses = 0;
    bonusItems.forEach(function(it) { bonuses += it.amount; });

    var finalScore = Math.max(0, Math.min(100, rawTotal + penalties + bonuses));

    /* ── classification ── */
    var classification, signal, allocation;
    if (finalScore >= 80) { classification = 'STRONG_BUY'; signal = 'STRONG_BUY'; allocation = 100; }
    else if (finalScore >= 65) { classification = 'BUY'; signal = 'BUY'; allocation = 70; }
    else if (finalScore >= 50) { classification = 'WATCHLIST'; signal = 'WATCHLIST'; allocation = 40; }
    else if (finalScore >= 35) { classification = 'NEUTRAL'; signal = 'NEUTRAL'; allocation = 0; }
    else { classification = 'AVOID'; signal = 'AVOID'; allocation = 0; }

    return {
      entry_score: round(finalScore, 1),
      raw_score: round(rawTotal, 1),
      trend: round(trendScore, 1), momentum: round(momentumScore, 1),
      volume: round(volumeScore, 1), structure: round(structureScore, 1),
      penalties: round(penalties, 1), bonuses: round(bonuses, 1),
      penalty_items: penaltyItems, bonus_items: bonusItems,
      classification: classification, signal: signal, allocation_pct: allocation,
      details: {
        maStack: round(scoreMaStack(), 2), macdTsiStcAo: round(scoreMacdTsiStcAo(), 2), adxStPsarViAroon: round(scoreAdxStPsarViAroon(), 2),
        rsiStochRsiWillR: round(scoreRsiStochRsiWillR(), 2), cciRocMomFi: round(scoreCciRocMomFi(), 2), mfiCmf: round(scoreMfiCmf(), 2),
        obvPvtKvo: round(scoreObvPvtKvo(), 2), vwapAnchored: round(scoreVwapAnchored(), 2), vpSqueezeAd: round(scoreVpSqueezeAd(), 2),
        bbKcDcChandelier: round(scoreBbKcDcChandelier(), 2), ichimoku: round(scoreIchimoku(), 2), darvasStructure: round(scoreDarvasStructure(), 2)
      }
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Multi-timeframe Entry Score — weights: H=20%, D=55%, W=25%
     ══════════════════════════════════════════════════════════════════════════ */
  function computeMultiTFEntryScore(tfResults, indexCandles) {
    if (!tfResults || tfResults.length === 0) return { multiTF_score: null, reason: 'no_timeframes' };

    var weights = { H: 0.20, h: 0.20, '1h': 0.20, hourly: 0.20, '1H': 0.20,
                    D: 0.55, d: 0.55, day: 0.55, daily: 0.55, '1D': 0.55,
                    W: 0.25, w: 0.25, week: 0.25, weekly: 0.25, '1W': 0.25 };
    var totalScore = 0, totalWeight = 0;
    var activeTFs = 0, tfDetails = [];
    var pillarTotal = { trend: 0, momentum: 0, volume: 0, structure: 0 };

    var totalRaw = 0, totalPenalties = 0, totalBonuses = 0;
    var penaltyMap = {}, bonusMap = {};

    tfResults.forEach(function (tf) {
      var w = weights[tf.timeframe] || 0;
      if (w === 0 || !tf.candles) return;
      var score = computeEntryScore(tf.candles, indexCandles);
      if (!score || score.entry_score == null) return;

      var weightedScore = score.entry_score * w;
      totalScore += weightedScore;
      totalWeight += w;
      activeTFs++;
      pillarTotal.trend += (score.trend || 0) * w;
      pillarTotal.momentum += (score.momentum || 0) * w;
      pillarTotal.volume += (score.volume || 0) * w;
      pillarTotal.structure += (score.structure || 0) * w;
      totalRaw += (score.raw_score || 0) * w;
      totalPenalties += (score.penalties || 0) * w;
      totalBonuses += (score.bonuses || 0) * w;
      if (score.penalty_items) { score.penalty_items.forEach(function(it) { penaltyMap[it.reason] = (penaltyMap[it.reason] || 0) + it.amount * w; }); }
      if (score.bonus_items) { score.bonus_items.forEach(function(it) { bonusMap[it.reason] = (bonusMap[it.reason] || 0) + it.amount * w; }); }
      tfDetails.push({
        timeframe: tf.timeframe, weight: round(w * 100, 0) + '%',
        entryScore: score.entry_score, trend: score.trend, momentum: score.momentum,
        volume: score.volume, structure: score.structure,
        penalties: score.penalties, bonuses: score.bonuses,
        raw_score: score.raw_score,
        classification: score.classification, allocation_pct: score.allocation_pct
      });
    });

    if (totalWeight === 0) return { multiTF_score: null, reason: 'no_valid_scores', details: tfDetails };

    var multiTF = round(totalScore / totalWeight, 1);
    var classification, signal, allocation;
    if (multiTF >= 80) { classification = 'STRONG_BUY'; signal = 'STRONG_BUY'; allocation = 100; }
    else if (multiTF >= 65) { classification = 'BUY'; signal = 'BUY'; allocation = 70; }
    else if (multiTF >= 50) { classification = 'WATCHLIST'; signal = 'WATCHLIST'; allocation = 40; }
    else if (multiTF >= 35) { classification = 'NEUTRAL'; signal = 'NEUTRAL'; allocation = 0; }
    else { classification = 'AVOID'; signal = 'AVOID'; allocation = 0; }

    var allPenaltyItems = [], allBonusItems = [];
    Object.keys(penaltyMap).forEach(function(key) { allPenaltyItems.push({ reason: key, amount: round(penaltyMap[key] / totalWeight, 1) }); });
    Object.keys(bonusMap).forEach(function(key) { allBonusItems.push({ reason: key, amount: round(bonusMap[key] / totalWeight, 1) }); });

    return {
      multiTF_score: multiTF,
      trend: round(pillarTotal.trend / totalWeight, 1),
      momentum: round(pillarTotal.momentum / totalWeight, 1),
      volume: round(pillarTotal.volume / totalWeight, 1),
      structure: round(pillarTotal.structure / totalWeight, 1),
      raw_score: round(totalRaw / totalWeight, 1),
      penalties: round(totalPenalties / totalWeight, 1),
      bonuses: round(totalBonuses / totalWeight, 1),
      penalty_items: allPenaltyItems, bonus_items: allBonusItems,
      classification: classification, signal: signal, allocation_pct: allocation,
      timeframesUsed: activeTFs, details: tfDetails
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     Multi-timeframe Exit Score — weights: H=30%, D=50%, W=20%
     ══════════════════════════════════════════════════════════════════════════ */
  function computeMultiTFExitScore(tfResults, position, indexCandles) {
    if (!tfResults || tfResults.length === 0) return { multiTF_exit_score: null, reason: 'no_timeframes' };

    var weights = { H: 0.30, h: 0.30, '1h': 0.30, hourly: 0.30, '1H': 0.30,
                    D: 0.50, d: 0.50, day: 0.50, daily: 0.50, '1D': 0.50,
                    W: 0.20, w: 0.20, week: 0.20, weekly: 0.20, '1W': 0.20 };
    var totalScore = 0, totalWeight = 0;
    var activeTFs = 0, tfDetails = [];
    var pillarTotal = { trend_breakdown: 0, momentum_exhaustion: 0, volume_distribution: 0, structure_breakdown: 0 };
    var totalRaw = 0, totalPenalties = 0, totalBonuses = 0;
    var penaltyMap = {}, bonusMap = {};

    tfResults.forEach(function (tf) {
      var w = weights[tf.timeframe] || 0;
      if (w === 0 || !tf.candles) return;
      var score = computeExitScore(tf.candles, position, indexCandles);
      if (!score || score.exit_score == null) return;

      totalScore += score.exit_score * w;
      totalWeight += w;
      activeTFs++;
      pillarTotal.trend_breakdown += (score.trend_breakdown || 0) * w;
      pillarTotal.momentum_exhaustion += (score.momentum_exhaustion || 0) * w;
      pillarTotal.volume_distribution += (score.volume_distribution || 0) * w;
      pillarTotal.structure_breakdown += (score.structure_breakdown || 0) * w;
      totalRaw += (score.raw_score || 0) * w;
      totalPenalties += (score.penalties || 0) * w;
      totalBonuses += (score.bonuses || 0) * w;
      if (score.penalty_items) { score.penalty_items.forEach(function(it) { penaltyMap[it.reason] = (penaltyMap[it.reason] || 0) + it.amount * w; }); }
      if (score.bonus_items) { score.bonus_items.forEach(function(it) { bonusMap[it.reason] = (bonusMap[it.reason] || 0) + it.amount * w; }); }
      tfDetails.push({
        timeframe: tf.timeframe, weight: round(w * 100, 0) + '%',
        exitScore: score.exit_score, trend_breakdown: score.trend_breakdown,
        momentum_exhaustion: score.momentum_exhaustion,
        volume_distribution: score.volume_distribution,
        structure_breakdown: score.structure_breakdown,
        penalties: score.penalties, bonuses: score.bonuses, raw_score: score.raw_score,
        classification: score.classification
      });
    });

    if (totalWeight === 0) return { multiTF_exit_score: null, reason: 'no_valid_scores', details: tfDetails };

    var multiTF = round(totalScore / totalWeight, 1);
    var classification, signal, action;
    if (multiTF >= 85) { classification = 'URGENT_EXIT'; signal = 'URGENT_EXIT'; action = 'Full exit immediately'; }
    else if (multiTF >= 70) { classification = 'EXIT'; signal = 'EXIT'; action = 'Full exit at current price or next bar open'; }
    else if (multiTF >= 55) { classification = 'PARTIAL_EXIT'; signal = 'PARTIAL_EXIT'; action = 'Exit 50%, tighten trailing stop to 1.5x ATR(14)'; }
    else if (multiTF >= 40) { classification = 'TIGHTEN_STOP'; signal = 'TIGHTEN_STOP'; action = 'Move stop to breakeven or 1.3x ATR(14) below current'; }
    else if (multiTF >= 25) { classification = 'MONITOR'; signal = 'MONITOR'; action = 'No action watch for escalation'; }
    else { classification = 'HOLD'; signal = 'HOLD'; action = 'All conditions intact continue holding'; }

    var allPenaltyItems = [], allBonusItems = [];
    Object.keys(penaltyMap).forEach(function(key) { allPenaltyItems.push({ reason: key, amount: round(penaltyMap[key] / totalWeight, 1) }); });
    Object.keys(bonusMap).forEach(function(key) { allBonusItems.push({ reason: key, amount: round(bonusMap[key] / totalWeight, 1) }); });

    return {
      multiTF_exit_score: multiTF,
      trend_breakdown: round(pillarTotal.trend_breakdown / totalWeight, 1),
      momentum_exhaustion: round(pillarTotal.momentum_exhaustion / totalWeight, 1),
      volume_distribution: round(pillarTotal.volume_distribution / totalWeight, 1),
      structure_breakdown: round(pillarTotal.structure_breakdown / totalWeight, 1),
      raw_score: totalWeight > 0 ? round(totalRaw / totalWeight, 1) : null,
      penalties: totalWeight > 0 ? round(totalPenalties / totalWeight, 1) : 0,
      bonuses: totalWeight > 0 ? round(totalBonuses / totalWeight, 1) : 0,
      penalty_items: allPenaltyItems, bonus_items: allBonusItems,
      classification: classification, signal: signal, action: action,
      timeframesUsed: activeTFs, details: tfDetails
    };
  }

  /* --------------------------------------------------------------------------
     Public API
     -------------------------------------------------------------------------- */

  return {
    closes: closes, highs: highs, lows: lows, volumes: volumes,
    sma: cl_sma, smaSeries: calcSMA, ema: cl_ema, emaSeries: calcEMA, wma: calcWMA, hma: calcHMA, kama: calcKAMA,
    rollingVWAP: calcRollingVWAP, vwap: calcVWAP,
    pctFrom126dHigh: calcPctFrom126dHigh, pctFrom126dLow: calcPctFrom126dLow,
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
    computeMultiTFExitScore: computeMultiTFExitScore
  };
})();