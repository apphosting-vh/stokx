/* ══════════════════════════════════════════════════════════════════════════
   Technical Indicators Library — Pure calculation functions
   Accepts arrays of { o, h, l, c, v } candle objects (or plain close arrays).
   All functions return arrays; the last element is the "current" value.
   ══════════════════════════════════════════════════════════════════════════ */
window.TechIndicators = (function () {

  /* ── Helpers ────────────────────────────────────────────────────────────── */

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

  /* ═══ 1. SMA — Simple Moving Average ══════════════════════════════════════ */
  function calcSMA(candles, period) {
    period = period || 20;
    var cl = closes(candles);
    return sma(cl, period);
  }

  /* ═══ 2. EMA — Exponential Moving Average ═════════════════════════════════ */
  function calcEMA(candles, period) {
    period = period || 20;
    var cl = closes(candles);
    return ema(cl, period);
  }

  /* ═══ 3. WMA — Weighted Moving Average ════════════════════════════════════ */
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

  /* ═══ 4. VWAP — Volume Weighted Average Price ═════════════════════════════ */
  function calcVWAP(candles) {
    var out = [];
    var cumTPVol = 0;
    var cumVol = 0;
    for (var i = 0; i < candles.length; i++) {
      var tp = (candles[i].h + candles[i].l + candles[i].c) / 3;
      cumTPVol += tp * candles[i].v;
      cumVol += candles[i].v;
      out.push(cumVol > 0 ? round(cumTPVol / cumVol, 2) : null);
    }
    return out;
  }

  /* ═══ 5. RSI — Relative Strength Index ════════════════════════════════════ */
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
    for (var i = 0; i < period; i++) {
      avgGain += gains[i];
      avgLoss += losses[i];
    }
    avgGain /= period;
    avgLoss /= period;

    out.push(null); // first candle has no RSI
    for (var i = 0; i < period - 1; i++) out.push(null);

    if (avgLoss === 0) out.push(100);
    else out.push(round(100 - 100 / (1 + avgGain / avgLoss), 2));

    for (var i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      if (avgLoss === 0) out.push(100);
      else out.push(round(100 - 100 / (1 + avgGain / avgLoss), 2));
    }
    return out;
  }

  /* ═══ 6. MACD — Moving Average Convergence Divergence ═════════════════════ */
  function calcMACD(candles, fast, slow, signal) {
    fast = fast || 12;
    slow = slow || 26;
    signal = signal || 9;
    var cl = closes(candles);
    var emaFast = ema(cl, fast);
    var emaSlow = ema(cl, slow);
    var macdLine = [];
    for (var i = 0; i < cl.length; i++) {
      if (emaFast[i] === null || emaSlow[i] === null) { macdLine.push(null); continue; }
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
    // signal line = EMA of MACD line
    var validMacd = [];
    var validIdx = [];
    for (var i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== null) { validMacd.push(macdLine[i]); validIdx.push(i); }
    }
    var sigEma = ema(validMacd, signal);
    var signalLine = macdLine.map(function () { return null; });
    for (var i = 0; i < sigEma.length; i++) {
      signalLine[validIdx[i]] = sigEma[i];
    }
    var histogram = [];
    for (var i = 0; i < cl.length; i++) {
      if (macdLine[i] === null || signalLine[i] === null) { histogram.push(null); continue; }
      histogram.push(round(macdLine[i] - signalLine[i], 4));
    }
    return {
      macd: macdLine.map(function (v) { return v !== null ? round(v, 4) : null; }),
      signal: signalLine.map(function (v) { return v !== null ? round(v, 4) : null; }),
      histogram: histogram
    };
  }

  /* ═══ 7. ATR — Average True Range ════════════════════════════════════════ */
  function calcATR(candles, period) {
    period = period || 14;
    var tr = [];
    for (var i = 0; i < candles.length; i++) {
      if (i === 0) {
        tr.push(candles[i].h - candles[i].l);
        continue;
      }
      var hl = candles[i].h - candles[i].l;
      var hc = Math.abs(candles[i].h - candles[i - 1].c);
      var lc = Math.abs(candles[i].l - candles[i - 1].c);
      tr.push(Math.max(hl, hc, lc));
    }
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

  /* ═══ 8. Bollinger Bands ══════════════════════════════════════════════════ */
  function calcBollingerBands(candles, period, mult) {
    period = period || 20;
    mult = mult || 2;
    var cl = closes(candles);
    var mid = sma(cl, period);
    var upper = [], lower = [];
    for (var i = 0; i < cl.length; i++) {
      if (mid[i] === null) { upper.push(null); lower.push(null); continue; }
      var sumSq = 0;
      for (var j = i - period + 1; j <= i; j++) {
        sumSq += Math.pow(cl[j] - mid[i], 2);
      }
      var std = Math.sqrt(sumSq / period);
      upper.push(round(mid[i] + mult * std, 2));
      lower.push(round(mid[i] - mult * std, 2));
    }
    return {
      upper: upper,
      middle: mid.map(function (v) { return v !== null ? round(v, 2) : null; }),
      lower: lower
    };
  }

  /* ═══ 9. ADX — Average Directional Index ═════════════════════════════════ */
  function calcADX(candles, period) {
    period = period || 14;
    if (candles.length < period + 1) return candles.map(function () { return null; });

    var plusDM = [], minusDM = [], trArr = [];
    for (var i = 1; i < candles.length; i++) {
      var upMove = candles[i].h - candles[i - 1].h;
      var downMove = candles[i - 1].l - candles[i].l;
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
      var hl = candles[i].h - candles[i].l;
      var hc = Math.abs(candles[i].h - candles[i - 1].c);
      var lc = Math.abs(candles[i].l - candles[i - 1].c);
      trArr.push(Math.max(hl, hc, lc));
    }

    // Smoothed TR, +DM, -DM
    var smTR = [], smPDM = [], smMDM = [];
    var sTR = 0, sPDM = 0, sMDM = 0;
    for (var i = 0; i < period; i++) {
      sTR += trArr[i]; sPDM += plusDM[i]; sMDM += minusDM[i];
    }
    smTR.push(sTR); smPDM.push(sPDM); smMDM.push(sMDM);

    for (var i = period; i < trArr.length; i++) {
      smTR.push(smTR[smTR.length - 1] - smTR[smTR.length - 1] / period + trArr[i]);
      smPDM.push(smPDM[smPDM.length - 1] - smPDM[smPDM.length - 1] / period + plusDM[i]);
      smMDM.push(smMDM[smMDM.length - 1] - smMDM[smMDM.length - 1] / period + minusDM[i]);
    }

    var plusDI = smPDM.map(function (v, i) { return smTR[i] > 0 ? 100 * v / smTR[i] : 0; });
    var minusDI = smMDM.map(function (v, i) { return smTR[i] > 0 ? 100 * v / smTR[i] : 0; });

    var dx = plusDI.map(function (v, i) {
      var sum = v + minusDI[i];
      return sum > 0 ? 100 * Math.abs(v - minusDI[i]) / sum : 0;
    });

    // ADX = smoothed DX
    var adxArr = [];
    if (dx.length < period) return candles.map(function () { return null; });
    var adxSum = 0;
    for (var i = 0; i < period; i++) adxSum += dx[i];
    adxArr.push(round(adxSum / period, 2));

    for (var i = period; i < dx.length; i++) {
      adxArr.push(round((adxArr[adxArr.length - 1] * (period - 1) + dx[i]) / period, 2));
    }

    // Pad to match candle length
    var out = [];
    var padLen = candles.length - adxArr.length;
    for (var i = 0; i < padLen; i++) out.push(null);
    for (var i = 0; i < adxArr.length; i++) out.push(adxArr[i]);
    return out;
  }

  /* ═══ 10. SuperTrend ══════════════════════════════════════════════════════ */
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
      if (prevST === null) {
        st = candles[i].c > upperBand ? lowerBand : upperBand;
      } else {
        if (prevST === prevUpper) {
          st = candles[i].c > upperBand ? lowerBand : upperBand;
        } else {
          st = candles[i].c < lowerBand ? upperBand : lowerBand;
        }
      }

      prevUpper = upperBand;
      prevLower = lowerBand;
      prevST = st;
      out.push(round(st, 2));
    }
    return out;
  }

  /* ═══ 11. Ichimoku Cloud ══════════════════════════════════════════════════ */
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

    // Shift Senkou A & B forward by 26 periods
    var senkouAShifted = candles.map(function () { return null; });
    var senkouBShifted = candles.map(function () { return null; });
    for (var i = 0; i < senkouA.length; i++) {
      if (senkouA[i] !== null && i + 26 < n) {
        senkouAShifted[i + 26] = senkouA[i];
      }
      if (senkouB[i] !== null && i + 26 < n) {
        senkouBShifted[i + 26] = senkouB[i];
      }
    }

    return {
      tenkan_sen: tenkan,
      kijun_sen: kijun,
      senkou_span_a: senkouAShifted,
      senkou_span_b: senkouBShifted,
      chikou_span: chikou
    };
  }

  /* ═══ 12. Donchian Channels ══════════════════════════════════════════════ */
  function calcDonchianChannels(candles, period) {
    period = period || 20;
    var upper = [], lower = [], middle = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period - 1) { upper.push(null); lower.push(null); middle.push(null); continue; }
      var hi = -Infinity, lo = Infinity;
      for (var j = i - period + 1; j <= i; j++) {
        if (candles[j].h > hi) hi = candles[j].h;
        if (candles[j].l < lo) lo = candles[j].l;
      }
      upper.push(round(hi, 2));
      lower.push(round(lo, 2));
      middle.push(round((hi + lo) / 2, 2));
    }
    return { upper: upper, middle: middle, lower: lower };
  }

  /* ═══ 13. Keltner Channels ═══════════════════════════════════════════════ */
  function calcKeltnerChannels(candles, period, mult) {
    period = period || 20;
    mult = mult || 1.5;
    var cl = closes(candles);
    var mid = ema(cl, period);
    var atr = calcATR(candles, period);
    var upper = [], lower = [];
    for (var i = 0; i < candles.length; i++) {
      if (mid[i] === null || atr[i] === null) { upper.push(null); lower.push(null); continue; }
      upper.push(round(mid[i] + mult * atr[i], 2));
      lower.push(round(mid[i] - mult * atr[i], 2));
    }
    return {
      upper: upper,
      middle: mid.map(function (v) { return v !== null ? round(v, 2) : null; }),
      lower: lower
    };
  }

  /* ═══ 14. OBV — On Balance Volume ════════════════════════════════════════ */
  function calcOBV(candles) {
    var out = [0];
    for (var i = 1; i < candles.length; i++) {
      if (candles[i].c > candles[i - 1].c) {
        out.push(out[i - 1] + candles[i].v);
      } else if (candles[i].c < candles[i - 1].c) {
        out.push(out[i - 1] - candles[i].v);
      } else {
        out.push(out[i - 1]);
      }
    }
    return out;
  }

  /* ═══ 15. CMF — Chaikin Money Flow ═══════════════════════════════════════ */
  function calcCMF(candles, period) {
    period = period || 20;
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var mfvSum = 0, volSum = 0;
      for (var j = i - period + 1; j <= i; j++) {
        var hl = candles[j].h - candles[j].l;
        var mfv = hl > 0 ? ((candles[j].c - candles[j].l) - (candles[j].h - candles[j].c)) / hl * candles[j].v : 0;
        mfvSum += mfv;
        volSum += candles[j].v;
      }
      out.push(volSum > 0 ? round(mfvSum / volSum, 4) : null);
    }
    return out;
  }

  /* ═══ 16. Stochastic RSI ═════════════════════════════════════════════════ */
  function calcStochasticRSI(candles, rsiPeriod, stochPeriod, kSmooth, dSmooth) {
    rsiPeriod = rsiPeriod || 14;
    stochPeriod = stochPeriod || 14;
    kSmooth = kSmooth || 3;
    dSmooth = dSmooth || 3;

    var rsi = calcRSI(candles, rsiPeriod);
    var n = rsi.length;
    var stochK = [], stochD = [];

    // Stochastic of RSI
    var rawK = [];
    for (var i = 0; i < n; i++) {
      if (rsi[i] === null || i < stochPeriod - 1) { rawK.push(null); continue; }
      var hi = -Infinity, lo = Infinity;
      for (var j = i - stochPeriod + 1; j <= i; j++) {
        if (rsi[j] === null) continue;
        if (rsi[j] > hi) hi = rsi[j];
        if (rsi[j] < lo) lo = rsi[j];
      }
      rawK.push(hi - lo > 0 ? 100 * (rsi[i] - lo) / (hi - lo) : 50);
    }

    // Smooth K
    var validK = [];
    var validIdx = [];
    for (var i = 0; i < rawK.length; i++) {
      if (rawK[i] !== null) { validK.push(rawK[i]); validIdx.push(i); }
    }
    var smK = sma(validK, kSmooth);
    var kOut = rawK.map(function () { return null; });
    for (var i = 0; i < smK.length; i++) {
      kOut[validIdx[i]] = smK[i] !== null ? round(smK[i], 2) : null;
    }

    // Smooth D (SMA of K)
    var validK2 = [];
    var validIdx2 = [];
    for (var i = 0; i < kOut.length; i++) {
      if (kOut[i] !== null) { validK2.push(kOut[i]); validIdx2.push(i); }
    }
    var smD = sma(validK2, dSmooth);
    var dOut = kOut.map(function () { return null; });
    for (var i = 0; i < smD.length; i++) {
      dOut[validIdx2[i]] = smD[i] !== null ? round(smD[i], 2) : null;
    }

    return { k: kOut, d: dOut };
  }

  /* ═══ 17. CCI — Commodity Channel Index ══════════════════════════════════ */
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

  /* ═══ 18. ROC — Rate of Change ═══════════════════════════════════════════ */
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

  /* ═══ 19. Momentum ═══════════════════════════════════════════════════════ */
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

  /* ═══ 20. Parabolic SAR ══════════════════════════════════════════════════ */
  function calcParabolicSAR(candles) {
    var n = candles.length;
    if (n < 2) return candles.map(function () { return null; });

    var out = [];
    var isLong = candles[1].c > candles[0].c;
    var af = 0.02;
    var afStep = 0.02;
    var afMax = 0.2;
    var ep = isLong ? candles[0].h : candles[0].l;
    var sar = isLong ? candles[0].l : candles[0].h;

    out.push(null); // first point
    out.push(round(sar, 2));

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
        if (candles[i].l < sar) {
          isLong = false;
          sar = ep;
          ep = candles[i].l;
          af = afStep;
        } else {
          if (candles[i].h > ep) { ep = candles[i].h; af = Math.min(af + afStep, afMax); }
        }
      } else {
        if (candles[i].h > sar) {
          isLong = true;
          sar = ep;
          ep = candles[i].h;
          af = afStep;
        } else {
          if (candles[i].l < ep) { ep = candles[i].l; af = Math.min(af + afStep, afMax); }
        }
      }

      out.push(round(sar, 2));
    }
    return out;
  }

  /* ═══ 21. HMA — Hull Moving Average ══════════════════════════════════════ */
  function calcHMA(candles, period) {
    period = period || 16;
    var cl = closes(candles);
    var halfWma = calcWMA(candles, Math.floor(period / 2));
    var fullWma = calcWMA(candles, period);
    var diff = [];
    for (var i = 0; i < cl.length; i++) {
      if (halfWma[i] === null || fullWma[i] === null) { diff.push(null); continue; }
      diff.push(2 * halfWma[i] - fullWma[i]);
    }
    // WMA of the diff with sqrt(period) length
    var sqrtP = Math.max(1, Math.floor(Math.sqrt(period)));
    var out = [];
    var denom = sqrtP * (sqrtP + 1) / 2;
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

  /* ═══ 22. KAMA — Kaufman's Adaptive Moving Average ══════════════════════ */
  function calcKAMA(candles, period) {
    period = period || 10;
    var cl = closes(candles);
    var fastSC = 2 / (2 + 1);
    var slowSC = 2 / (30 + 1);
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

  /* ═══ 23. TSI — True Strength Index ══════════════════════════════════════ */
  function calcTSI(candles, longPeriod, shortPeriod) {
    longPeriod = longPeriod || 25;
    shortPeriod = shortPeriod || 13;
    var cl = closes(candles);
    if (cl.length < 3) return cl.map(function () { return null; });
    // First-order smoothed momentum
    var momentum = [null];
    for (var i = 1; i < cl.length; i++) momentum.push(cl[i] - cl[i - 1]);
    var smoothed1 = ema(momentum, longPeriod);
    var smoothed2 = ema(smoothed1, shortPeriod);
    // First-order smoothed |momentum|
    var absMom = momentum.map(function (m) { return m !== null ? Math.abs(m) : null; });
    var absSmoothed1 = ema(absMom, longPeriod);
    var absSmoothed2 = ema(absSmoothed1, shortPeriod);
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (smoothed2[i] === null || absSmoothed2[i] === null || absSmoothed2[i] === 0) {
        out.push(null);
      } else {
        out.push(round(100 * smoothed2[i] / absSmoothed2[i], 2));
      }
    }
    return out;
  }

  /* ═══ 24. STC — Schaff Trend Cycle ══════════════════════════════════════ */
  function calcSTC(candles, macdFast, macdSlow, stochPeriod, kSmooth, dSmooth) {
    macdFast = macdFast || 23;
    macdSlow = macdSlow || 50;
    stochPeriod = stochPeriod || 10;
    kSmooth = kSmooth || 3;
    dSmooth = dSmooth || 3;
    var cl = closes(candles);
    var macdResult = calcMACD(candles, macdFast, macdSlow, 0);
    var macdLine = macdResult.macd;
    // Stochastic of MACD
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
    // Smooth K then D, apply twice
    function smoothArr(arr, per) {
      var valid = []; var idx = [];
      for (var i = 0; i < arr.length; i++) { if (arr[i] !== null) { valid.push(arr[i]); idx.push(i); } }
      var sm = sma(valid, per);
      var out = arr.map(function () { return null; });
      for (var i = 0; i < sm.length; i++) out[idx[i]] = sm[i];
      return out;
    }
    var k1 = smoothArr(rawK, kSmooth);
    var d1 = smoothArr(k1, dSmooth);
    var k2 = smoothArr(d1, kSmooth);
    var stc = smoothArr(k2, dSmooth);
    return stc;
  }

  /* ═══ 25. MFI — Money Flow Index ════════════════════════════════════════ */
  function calcMFI(candles, period) {
    period = period || 14;
    if (candles.length < period + 1) return candles.map(function () { return null; });
    var tp = candles.map(function (c) { return (c.h + c.l + c.c) / 3; });
    var mf = [];
    for (var i = 0; i < candles.length; i++) {
      mf.push(tp[i] * candles[i].v);
    }
    var out = [null];
    for (var i = 1; i < candles.length; i++) {
      if (i < period) { out.push(null); continue; }
      var posMF = 0, negMF = 0;
      for (var j = i - period + 1; j <= i; j++) {
        if (mf[j] > mf[j - 1]) posMF += mf[j];
        else negMF += mf[j];
      }
      var ratio = negMF === 0 ? 100 : posMF / negMF;
      out.push(round(100 - 100 / (1 + ratio), 2));
    }
    return out;
  }

  /* ═══ 26. PVT — Price Volume Trend ══════════════════════════════════════ */
  function calcPVT(candles) {
    var out = [0];
    for (var i = 1; i < candles.length; i++) {
      if (candles[i - 1].c === 0) { out.push(out[i - 1]); continue; }
      var pctChg = (candles[i].c - candles[i - 1].c) / candles[i - 1].c;
      out.push(round(out[i - 1] + candles[i].v * pctChg, 0));
    }
    return out;
  }

  /* ═══ 27. KVO — Klinger Volume Oscillator ═══════════════════════════════ */
  function calcKVO(candles, fast, slow) {
    fast = fast || 34;
    slow = slow || 55;
    // Trend: high+low+close vs previous
    var trend = [];
    for (var i = 0; i < candles.length; i++) {
      if (i === 0) { trend.push(1); continue; }
      var hlMid = candles[i].h + candles[i].l + candles[i].c;
      var prevHL = candles[i - 1].h + candles[i - 1].l + candles[i - 1].c;
      trend.push(hlMid > prevHL ? 1 : -1);
    }
    // Volume Force = V * |2*(H-L)/(H+L+C) - 1| * trend * 100
    var vf = [];
    for (var i = 0; i < candles.length; i++) {
      var hlc = candles[i].h + candles[i].l + candles[i].c;
      var dm = Math.abs(2 * (candles[i].h - candles[i].l) / (hlc || 1) - 1);
      vf.push(candles[i].v * dm * trend[i] * 100);
    }
    var emaFast = ema(vf, fast);
    var emaSlow = ema(vf, slow);
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (emaFast[i] === null || emaSlow[i] === null) { out.push(null); continue; }
      out.push(round(emaFast[i] - emaSlow[i], 0));
    }
    return out;
  }

  /* ═══ 28. Anchored VWAP ═════════════════════════════════════════════════ */
  function calcAnchoredVWAP(candles, anchorIdx) {
    anchorIdx = anchorIdx || 0;
    var out = [];
    var cumTPVol = 0, cumVol = 0;
    for (var i = 0; i < candles.length; i++) {
      if (i < anchorIdx) { out.push(null); continue; }
      var tp = (candles[i].h + candles[i].l + candles[i].c) / 3;
      cumTPVol += tp * candles[i].v;
      cumVol += candles[i].v;
      out.push(cumVol > 0 ? round(cumTPVol / cumVol, 2) : null);
    }
    return out;
  }

  /* ═══ 29. Volume Profile ════════════════════════════════════════════════ */
  function calcVolumeProfile(candles, numBins) {
    numBins = numBins || 12;
    if (!candles || candles.length < 2) return null;
    var hi = -Infinity, lo = Infinity;
    for (var i = 0; i < candles.length; i++) {
      if (candles[i].h > hi) hi = candles[i].h;
      if (candles[i].l < lo) lo = candles[i].l;
    }
    if (hi === lo) return null;
    var binSize = (hi - lo) / numBins;
    var bins = [];
    for (var b = 0; b < numBins; b++) {
      bins.push({ priceFrom: round(lo + b * binSize, 2), priceTo: round(lo + (b + 1) * binSize, 2), volume: 0 });
    }
    for (var i = 0; i < candles.length; i++) {
      var mid = (candles[i].h + candles[i].l) / 2;
      var binIdx = Math.min(numBins - 1, Math.max(0, Math.floor((mid - lo) / binSize)));
      bins[binIdx].volume += candles[i].v;
    }
    var maxVol = 0;
    for (var b = 0; b < bins.length; b++) { if (bins[b].volume > maxVol) maxVol = bins[b].volume; }
    for (var b = 0; b < bins.length; b++) {
      bins[b].pctOfMax = maxVol > 0 ? round(bins[b].volume / maxVol * 100, 1) : 0;
    }
    // POC = price level with highest volume
    var pocBin = bins[0];
    for (var b = 1; b < bins.length; b++) { if (bins[b].volume > pocBin.volume) pocBin = bins[b]; }
    return { bins: bins, poc: round((pocBin.priceFrom + pocBin.priceTo) / 2, 2), pocVolume: pocBin.volume };
  }

  /* ═══ 30. TTM Squeeze ═══════════════════════════════════════════════════ */
  function calcTTMSqueeze(candles, bbPeriod, bbMult, kcPeriod, kcMult) {
    bbPeriod = bbPeriod || 20; bbMult = bbMult || 2;
    kcPeriod = kcPeriod || 20; kcMult = kcMult || 1.5;
    var bb = calcBollingerBands(candles, bbPeriod, bbMult);
    var kc = calcKeltnerChannels(candles, kcPeriod, kcMult);
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (bb.upper[i] === null || kc.upper[i] === null) { out.push(null); continue; }
      out.push(bb.upper[i] < kc.upper[i] && bb.lower[i] > kc.lower[i]); // true = squeeze on
    }
    return out;
  }

  /* ═══ 31. Squeeze Momentum Indicator ════════════════════════════════════ */
  function calcSqueezeMomentum(candles) {
    var squeeze = calcTTMSqueeze(candles);
    var cl = closes(candles);
    // Linear regression of (close - (highest_h + lowest_l)/2) over 20 periods
    var period = 20;
    var out = [];
    for (var i = 0; i < cl.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var hh = -Infinity, ll = Infinity;
      for (var j = i - period + 1; j <= i; j++) {
        if (candles[j].h > hh) hh = candles[j].h;
        if (candles[j].l < ll) ll = candles[j].l;
      }
      var series = [];
      for (var j = i - period + 1; j <= i; j++) {
        series.push(cl[j] - (hh + ll) / 2);
      }
      // Simple linear regression value (last point)
      var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (var j = 0; j < period; j++) {
        sumX += j; sumY += series[j]; sumXY += j * series[j]; sumX2 += j * j;
      }
      var slope = (period * sumXY - sumX * sumY) / (period * sumX2 - sumX * sumX);
      var intercept = (sumY - slope * sumX) / period;
      var regVal = slope * (period - 1) + intercept;
      out.push(round(regVal, 4));
    }
    return { values: out, squeeze: squeeze };
  }

  /* ═══ 32. Darvas Box ════════════════════════════════════════════════════ */
  function calcDarvasBox(candles, boxPeriod) {
    boxPeriod = boxPeriod || 20;
    if (candles.length < boxPeriod) return null;
    // Find highest high and lowest low in the lookback period
    var recentHigh = -Infinity, recentLow = Infinity;
    var start = Math.max(0, candles.length - boxPeriod);
    for (var i = start; i < candles.length; i++) {
      if (candles[i].h > recentHigh) recentHigh = candles[i].h;
      if (candles[i].l < recentLow) recentLow = candles[i].l;
    }
    var lastC = candles[candles.length - 1].c;
    var position = lastC >= recentHigh ? "at_upper" : lastC <= recentLow ? "at_lower" : "inside";
    var boxHigh = round(recentHigh, 2);
    var boxLow = round(recentLow, 2);
    var boxRange = round(recentHigh - recentLow, 2);
    var pctFromTop = round((recentHigh - lastC) / (boxRange || 1) * 100, 1);
    var breakout = lastC > recentHigh ? "up" : lastC < recentLow ? "down" : "none";
    return { boxHigh: boxHigh, boxLow: boxLow, boxRange: boxRange, position: position, breakout: breakout, pctFromTop: pctFromTop };
  }

  /* ═══ 33. Smart Money Concepts ══════════════════════════════════════════ */
  function calcSmartMoney(candles) {
    if (!candles || candles.length < 10) return null;

    // Detect Order Blocks: last opposing candle before a strong move
    var orderBlocks = [];
    var threshold = 2; // ATR multiplier for "strong move"
    var atr = calcATR(candles, 14);
    for (var i = 3; i < candles.length; i++) {
      if (atr[i] === null || atr[i] === 0) continue;
      var body = Math.abs(candles[i].c - candles[i].o);
      if (body > threshold * atr[i]) {
        // Strong bullish candle: look for last bearish candle before it
        if (candles[i].c > candles[i].o && candles[i - 1].c < candles[i - 1].o) {
          orderBlocks.push({ type: "bullish_ob", high: candles[i - 1].h, low: candles[i - 1].l, idx: i - 1 });
        }
        // Strong bearish candle: look for last bullish candle before it
        if (candles[i].c < candles[i].o && candles[i - 1].c > candles[i - 1].o) {
          orderBlocks.push({ type: "bearish_ob", high: candles[i - 1].h, low: candles[i - 1].l, idx: i - 1 });
        }
      }
    }
    // Keep last 3 of each type
    var bullOBs = orderBlocks.filter(function (b) { return b.type === "bullish_ob"; }).slice(-3);
    var bearOBs = orderBlocks.filter(function (b) { return b.type === "bearish_ob"; }).slice(-3);

    // Break of Structure (BOS): price breaks the most recent swing high or swing low
    var swingHighs = [], swingLows = [];
    for (var i = 2; i < candles.length - 2; i++) {
      if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i - 2].h &&
          candles[i].h > candles[i + 1].h && candles[i].h > candles[i + 2].h) {
        swingHighs.push({ price: candles[i].h, idx: i });
      }
      if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i - 2].l &&
          candles[i].l < candles[i + 1].l && candles[i].l < candles[i + 2].l) {
        swingLows.push({ price: candles[i].l, idx: i });
      }
    }
    var lastC = candles[candles.length - 1].c;
    var lastSwingHigh = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : null;
    var lastSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1] : null;
    var bos = "none";
    if (lastSwingHigh && lastC > lastSwingHigh.price) bos = "bullish_bos";
    if (lastSwingLow && lastC < lastSwingLow.price) bos = "bearish_bos";

    // Change of Character (CHoCH): first break after trend reversal
    var choch = "none";
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      var prevHigh = swingHighs[swingHighs.length - 2];
      var prevLow = swingLows[swingLows.length - 2];
      if (lastSwingHigh && lastC > lastSwingHigh.price && lastSwingLow && lastSwingLow.idx > prevHigh.idx) {
        choch = "bullish_choch";
      }
      if (lastSwingLow && lastC < lastSwingLow.price && lastSwingHigh && lastSwingHigh.idx > prevLow.idx) {
        choch = "bearish_choch";
      }
    }

    return {
      orderBlocks: { bullish: bullOBs, bearish: bearOBs },
      bos: bos, choch: choch,
      swingHighs: swingHighs.slice(-3), swingLows: swingLows.slice(-3)
    };
  }

  /* ═══ 34. Multi-Timeframe Trend Alignment ══════════════════════════════ */
  function calcMTFAlignment(candles) {
    // Approximate MTF using different-period MAs on single timeframe
    // Short (5m equivalent): EMA 9, Medium (1h equivalent): EMA 21, Long (daily equivalent): EMA 50
    var ema9 = calcEMA(candles, 9);
    var ema21 = calcEMA(candles, 21);
    var ema50 = calcEMA(candles, 50);
    var sma100 = candles.length >= 100 ? calcSMA(candles, 100) : candles.map(function () { return null; });
    var sma200 = candles.length >= 200 ? calcSMA(candles, 200) : candles.map(function () { return null; });

    var out = [];
    for (var i = 0; i < candles.length; i++) {
      if (ema50[i] === null) { out.push(null); continue; }
      var score = 0; var total = 0;
      var cl = candles[i].c;
      // EMA 9 > EMA 21: +1
      if (ema9[i] !== null && ema21[i] !== null) { total++; if (ema9[i] > ema21[i]) score++; }
      // EMA 21 > EMA 50: +1
      if (ema21[i] !== null) { total++; if (ema21[i] > ema50[i]) score++; }
      // Price > EMA 50: +1
      total++; if (cl > ema50[i]) score++;
      // EMA 50 > SMA 100: +1
      if (sma100[i] !== null) { total++; if (ema50[i] > sma100[i]) score++; }
      // SMA 100 > SMA 200: +1
      if (sma200[i] !== null) { total++; if (sma100[i] > sma200[i]) score++; }
      // Price > SMA 200: +1
      if (sma200[i] !== null) { total++; if (cl > sma200[i]) score++; }

      out.push(total > 0 ? round(score / total * 100, 1) : null);
    }
    return out;
  }

  /* ═══ Compute all indicators at once ═════════════════════════════════════ */
  function computeAll(candles) {
    if (!candles || candles.length < 5) return null;

    var macd = calcMACD(candles);
    var bb = calcBollingerBands(candles);
    var ich = calcIchimoku(candles);
    var dc = calcDonchianChannels(candles);
    var kc = calcKeltnerChannels(candles);
    var stochRSI = calcStochasticRSI(candles);
    var supertrend = calcSuperTrend(candles);
    var squeezeMom = calcSqueezeMomentum(candles);
    var smc = calcSmartMoney(candles);

    function last(arr) {
      if (!arr) return null;
      if (Array.isArray(arr)) {
        for (var i = arr.length - 1; i >= 0; i--) {
          if (arr[i] !== null && arr[i] !== undefined) return arr[i];
        }
        return null;
      }
      return null;
    }

    function lastPair(obj) {
      return { k: last(obj.k), d: last(obj.d) };
    }

    function lastTriple(obj) {
      return { upper: last(obj.upper), middle: last(obj.middle), lower: last(obj.lower) };
    }

    function lastIch(obj) {
      return {
        tenkan: last(obj.tenkan_sen),
        kijun: last(obj.kijun_sen),
        senkouA: last(obj.senkou_span_a),
        senkouB: last(obj.senkou_span_b),
        chikou: last(obj.chikou_span)
      };
    }

    function lastMacd(obj) {
      return { macd: last(obj.macd), signal: last(obj.signal), histogram: last(obj.histogram) };
    }

    var cl = closes(candles);
    var lastClose = last(cl);

    return {
      sma_20: last(calcSMA(candles, 20)),
      sma_50: last(calcSMA(candles, 50)),
      sma_200: candles.length >= 200 ? last(calcSMA(candles, 200)) : null,
      ema_9: last(calcEMA(candles, 9)),
      ema_21: last(calcEMA(candles, 21)),
      ema_50: last(calcEMA(candles, 50)),
      wma_20: last(calcWMA(candles, 20)),
      hma_16: last(calcHMA(candles, 16)),
      kama_10: last(calcKAMA(candles, 10)),
      vwap: last(calcVWAP(candles)),
      rsi_14: last(calcRSI(candles, 14)),
      macd: lastMacd(macd),
      atr_14: last(calcATR(candles, 14)),
      bb: lastTriple(bb),
      adx_14: last(calcADX(candles, 14)),
      supertrend: last(supertrend),
      ichimoku: lastIch(ich),
      donchian: lastTriple(dc),
      keltner: lastTriple(kc),
      obv: last(calcOBV(candles)),
      cmf_20: last(calcCMF(candles, 20)),
      stochRSI: lastPair(stochRSI),
      cci_20: last(calcCCI(candles, 20)),
      roc_12: last(calcROC(candles, 12)),
      momentum_10: last(calcMomentum(candles, 10)),
      psar: last(calcParabolicSAR(candles)),
      tsi: last(calcTSI(candles)),
      stc: last(calcSTC(candles)),
      mfi_14: last(calcMFI(candles, 14)),
      pvt: last(calcPVT(candles)),
      kvo: last(calcKVO(candles)),
      anchored_vwap: last(calcAnchoredVWAP(candles)),
      volumeProfile: calcVolumeProfile(candles),
      ttmSqueeze: squeezeMom ? (function () { var sq = squeezeMom.squeeze; for (var i = sq.length - 1; i >= 0; i--) { if (sq[i] !== null) return sq[i]; } return null; })() : null,
      squeezeMomentum: last(squeezeMom ? squeezeMom.values : null),
      darvasBox: calcDarvasBox(candles),
      smartMoney: smc,
      mtfAlignment: last(calcMTFAlignment(candles)),
      lastClose: lastClose
    };
  }

  /* ═══ Signal interpretation ══════════════════════════════════════════════ */
  function interpret(ind) {
    if (!ind) return {};
    var signals = {};
    var lc = ind.lastClose;

    // SMA signals
    signals.sma_20 = lc > ind.sma_20 ? 'bullish' : 'bearish';
    signals.sma_50 = ind.sma_200 ? (lc > ind.sma_50 ? 'bullish' : 'bearish') : null;

    // EMA signals
    signals.ema_9 = lc > ind.ema_9 ? 'bullish' : 'bearish';
    signals.ema_21 = lc > ind.ema_21 ? 'bullish' : 'bearish';

    // RSI
    signals.rsi_14 = ind.rsi_14 > 70 ? 'overbought' : ind.rsi_14 < 30 ? 'oversold' : 'neutral';

    // MACD
    if (ind.macd.histogram !== null) {
      signals.macd = ind.macd.histogram > 0 ? 'bullish' : 'bearish';
    }

    // Bollinger
    if (ind.bb.upper && ind.bb.lower) {
      if (lc > ind.bb.upper) signals.bb = 'overbought';
      else if (lc < ind.bb.lower) signals.bb = 'oversold';
      else signals.bb = 'neutral';
    }

    // Stoch RSI
    if (ind.stochRSI.k !== null) {
      signals.stochRSI = ind.stochRSI.k > 80 ? 'overbought' : ind.stochRSI.k < 20 ? 'oversold' : 'neutral';
    }

    // ADX
    if (ind.adx_14 !== null) {
      signals.adx = ind.adx_14 > 25 ? 'trending' : 'ranging';
    }

    // SuperTrend
    if (ind.supertrend !== null) {
      signals.supertrend = lc > ind.supertrend ? 'bullish' : 'bearish';
    }

    // CCI
    if (ind.cci_20 !== null) {
      signals.cci = ind.cci_20 > 100 ? 'overbought' : ind.cci_20 < -100 ? 'oversold' : 'neutral';
    }

    // PSAR
    if (ind.psar !== null) {
      signals.psar = lc > ind.psar ? 'bullish' : 'bearish';
    }

    // Ichimoku
    if (ind.ichimoku.tenkan !== null && ind.ichimoku.kijun !== null) {
      signals.ichimoku = ind.ichimoku.tenkan > ind.ichimoku.kijun ? 'bullish' : 'bearish';
    }

    // Keltner
    if (ind.keltner.upper && ind.keltner.lower) {
      if (lc > ind.keltner.upper) signals.keltner = 'overbought';
      else if (lc < ind.keltner.lower) signals.keltner = 'oversold';
      else signals.keltner = 'neutral';
    }

    // Donchian
    if (ind.donchian.upper && ind.donchian.lower) {
      if (lc >= ind.donchian.upper) signals.donchian = 'bullish';
      else if (lc <= ind.donchian.lower) signals.donchian = 'bearish';
      else signals.donchian = 'neutral';
    }

    // HMA
    if (ind.hma_16 !== null) {
      signals.hma_16 = lc > ind.hma_16 ? 'bullish' : 'bearish';
    }

    // KAMA
    if (ind.kama_10 !== null) {
      signals.kama_10 = lc > ind.kama_10 ? 'bullish' : 'bearish';
    }

    // TSI
    if (ind.tsi !== null) {
      signals.tsi = ind.tsi > 0 ? 'bullish' : 'bearish';
    }

    // STC
    if (ind.stc !== null) {
      signals.stc = ind.stc > 50 ? 'bullish' : 'bearish';
    }

    // MFI
    if (ind.mfi_14 !== null) {
      signals.mfi_14 = ind.mfi_14 > 80 ? 'overbought' : ind.mfi_14 < 20 ? 'oversold' : 'neutral';
    }

    // KVO
    if (ind.kvo !== null) {
      signals.kvo = ind.kvo > 0 ? 'bullish' : 'bearish';
    }

    // TTM Squeeze
    if (ind.ttmSqueeze !== null) {
      signals.ttmSqueeze = ind.ttmSqueeze ? 'oversold' : 'neutral'; // squeeze on = potential explosion coming
    }

    // Squeeze Momentum
    if (ind.squeezeMomentum !== null) {
      signals.squeezeMomentum = ind.squeezeMomentum > 0 ? 'bullish' : 'bearish';
    }

    // Darvas Box
    if (ind.darvasBox) {
      signals.darvasBox = ind.darvasBox.breakout === 'up' ? 'bullish' : ind.darvasBox.breakout === 'down' ? 'bearish' : 'neutral';
    }

    // Smart Money
    if (ind.smartMoney) {
      signals.smartMoney = ind.smartMoney.bos === 'bullish_bos' || ind.smartMoney.choch === 'bullish_choch' ? 'bullish'
        : ind.smartMoney.bos === 'bearish_bos' || ind.smartMoney.choch === 'bearish_choch' ? 'bearish' : 'neutral';
    }

    // MTF Alignment
    if (ind.mtfAlignment !== null) {
      signals.mtfAlignment = ind.mtfAlignment >= 70 ? 'bullish' : ind.mtfAlignment <= 30 ? 'bearish' : 'neutral';
    }

    // Overall
    var bullCount = 0, bearCount = 0, total = 0;
    Object.keys(signals).forEach(function (k) {
      if (!signals[k]) return;
      total++;
      if (signals[k] === 'bullish' || signals[k] === 'oversold') bullCount++;
      if (signals[k] === 'bearish' || signals[k] === 'overbought') bearCount++;
    });
    signals._overall = total > 0 ? (bullCount > bearCount ? 'bullish' : bearCount > bullCount ? 'bearish' : 'neutral') : null;
    signals._score = { bull: bullCount, bear: bearCount, neutral: total - bullCount - bearCount, total: total };

    return signals;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     EXIT SCORE — Momentum Trading Exit Scoring Engine (0–100)
     5 factors: Trend(35) + Momentum(25) + Volume(20) + Volatility(10) + Structure(10)
     ═══════════════════════════════════════════════════════════════════════ */
  function computeExitScore(candles, ind, position) {
    if (!candles || candles.length < 10 || !ind) return null;

    var lc = ind.lastClose;
    if (lc === null || lc === undefined) return null;

    var prevClose = candles.length >= 2 ? candles[candles.length - 2].c : lc;

    /* ── Helper: get last N values from a raw array ── */
    function lastN(arr, n) {
      var out = [];
      for (var i = arr.length - 1; i >= 0 && out.length < n; i--) {
        if (arr[i] !== null && arr[i] !== undefined) out.unshift(arr[i]);
      }
      return out;
    }

    function last(arr) {
      if (!arr || !Array.isArray(arr)) return null;
      for (var i = arr.length - 1; i >= 0; i--) {
        if (arr[i] !== null && arr[i] !== undefined) return arr[i];
      }
      return null;
    }

    /* ── Raw arrays for slope/crossover detection ── */
    var obvArr = calcOBV(candles);
    var pvtArr = calcPVT(candles);
    var atrArr = calcATR(candles, 14);

    var obvLast2 = lastN(obvArr, 2);
    var pvtLast2 = lastN(pvtArr, 2);
    var atrLast2 = lastN(atrArr, 2);

    var obvSma20 = (function () {
      var sma = [];
      for (var i = 0; i < obvArr.length; i++) {
        if (i < 19 || obvArr[i] === null) { sma.push(null); continue; }
        var s = 0;
        for (var j = i - 19; j <= i; j++) s += obvArr[j];
        sma.push(round(s / 20, 2));
      }
      return sma;
    })();

    var pvtSma20 = (function () {
      var sma = [];
      for (var i = 0; i < pvtArr.length; i++) {
        if (i < 19 || pvtArr[i] === null) { sma.push(null); continue; }
        var s = 0;
        for (var j = i - 19; j <= i; j++) s += pvtArr[j];
        sma.push(round(s / 20, 2));
      }
      return sma;
    })();

    var obvSma20Last = last(obvSma20);
    var pvtSma20Last = last(pvtSma20);
    var prevObvSma20 = obvSma20.length >= 2 ? obvSma20[obvSma20.length - 2] : null;
    var prevPvtSma20 = pvtSma20.length >= 2 ? pvtSma20[pvtSma20.length - 2] : null;

    /* ── OBV/PVT slopes (5-bar) ── */
    var obvSlope = (function () {
      if (obvArr.length < 6) return 0;
      var vals = lastN(obvArr, 6);
      if (vals.length < 2) return 0;
      return vals[vals.length - 1] - vals[0];
    })();
    var prevObvSlope = (function () {
      if (obvArr.length < 7) return 0;
      var vals = lastN(obvArr, 7);
      if (vals.length < 3) return 0;
      return vals[vals.length - 2] - vals[0];
    })();
    var pvtSlope = (function () {
      if (pvtArr.length < 6) return 0;
      var vals = lastN(pvtArr, 6);
      if (vals.length < 2) return 0;
      return vals[vals.length - 1] - vals[0];
    })();

    /* ── KVO signal (9-period EMA of KVO) ── */
    var kvoArr = calcKVO(candles);
    var kvoSignalArr = (function () {
      var kvoClean = [];
      for (var i = 0; i < kvoArr.length; i++) {
        kvoClean.push(kvoArr[i] !== null ? kvoArr[i] : 0);
      }
      return ema(kvoClean, 9);
    })();
    var kvoLast = last(kvoArr);
    var kvoSignalLast = last(kvoSignalArr);
    var prevKvo = kvoArr.length >= 2 ? kvoArr[kvoArr.length - 2] : null;
    var prevKvoSignal = kvoSignalArr.length >= 2 ? kvoSignalArr[kvoSignalArr.length - 2] : null;

    /* ── Prior indicators for crossover detection ── */
    var indPrior = candles.length >= 12 ? computeAll(candles.slice(0, -1)) : null;

    var prev_close_prior = indPrior ? indPrior.lastClose : prevClose;
    var prev_ema9 = indPrior ? indPrior.ema_9 : null;
    var prev_hma16 = indPrior ? indPrior.hma_16 : null;
    var prev_kama10 = indPrior ? indPrior.kama_10 : null;

    /* ── Compute +DI / -DI for ADX section ── */
    var diData = (function () {
      var period = 14;
      if (candles.length < period + 1) return null;
      var plusDM = [], minusDM = [], trArr = [];
      for (var i = 1; i < candles.length; i++) {
        var upMove = candles[i].h - candles[i - 1].h;
        var downMove = candles[i - 1].l - candles[i].l;
        plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
        var hl = candles[i].h - candles[i].l;
        var hc = Math.abs(candles[i].h - candles[i - 1].c);
        var lc2 = Math.abs(candles[i].l - candles[i - 1].c);
        trArr.push(Math.max(hl, hc, lc2));
      }
      var smTR = [], smPDM = [], smMDM = [];
      var sTR = 0, sPDM = 0, sMDM = 0;
      for (var i = 0; i < period; i++) {
        sTR += trArr[i]; sPDM += plusDM[i]; sMDM += minusDM[i];
      }
      smTR.push(sTR); smPDM.push(sPDM); smMDM.push(sMDM);
      for (var i = period; i < trArr.length; i++) {
        smTR.push(smTR[smTR.length - 1] - smTR[smTR.length - 1] / period + trArr[i]);
        smPDM.push(smPDM[smPDM.length - 1] - smPDM[smPDM.length - 1] / period + plusDM[i]);
        smMDM.push(smMDM[smMDM.length - 1] - smMDM[smMDM.length - 1] / period + minusDM[i]);
      }
      var plusDI = smPDM.map(function (v, i) { return smTR[i] > 0 ? 100 * v / smTR[i] : 0; });
      var minusDI = smMDM.map(function (v, i) { return smTR[i] > 0 ? 100 * v / smTR[i] : 0; });
      return { plusDI: plusDI, minusDI: minusDI };
    })();

    var plusDI = diData ? diData.plusDI[diData.plusDI.length - 1] : null;
    var minusDI = diData ? diData.minusDI[diData.minusDI.length - 1] : null;
    var prev_plusDI = diData && diData.plusDI.length >= 2 ? diData.plusDI[diData.plusDI.length - 2] : null;
    var prev_minusDI = diData && diData.minusDI.length >= 2 ? diData.minusDI[diData.minusDI.length - 2] : null;

    /* ── VWAP prior ── */
    var prev_vwap = ind.vwap;
    var prev_avwap = ind.anchored_vwap;
    if (indPrior) {
      if (indPrior.vwap !== undefined) prev_vwap = indPrior.vwap;
      if (indPrior.anchored_vwap !== undefined) prev_avwap = indPrior.anchored_vwap;
    }

    /* ── Smart Money status ── */
    var smStatus = "NONE";
    if (ind.smartMoney) {
      if (ind.smartMoney.bos === 'bearish_bos' || ind.smartMoney.choch === 'bearish_choch') smStatus = "SELLING";
      else if (ind.smartMoney.bos === 'bullish_bos' || ind.smartMoney.choch === 'bullish_choch') smStatus = "BUYING";
    }
    var prevSmStatus = "NONE";
    if (indPrior && indPrior.smartMoney) {
      if (indPrior.smartMoney.bos === 'bearish_bos' || indPrior.smartMoney.choch === 'bearish_choch') prevSmStatus = "SELLING";
      else if (indPrior.smartMoney.bos === 'bullish_bos' || indPrior.smartMoney.choch === 'bullish_choch') prevSmStatus = "BUYING";
    }

    /* ═══════════════════════════════════════════════════════════════════
       11. TREND BREAKDOWN (Max 25 pts)
       ═══════════════════════════════════════════════════════════════════ */

    /* 11.1 Moving Average Breakdown (9 pts) ────────────────────────── */
    var maBreakdown = 0;
    if (ind.ema_9 !== null && lc < ind.ema_9) {
      if (prev_close_prior !== null && prev_ema9 !== null && prev_close_prior >= prev_ema9) maBreakdown += 1.5;
      else maBreakdown += 0.5;
    }
    if (ind.ema_21 !== null && lc < ind.ema_21) maBreakdown += 1.0;
    if (ind.ema_50 !== null && lc < ind.ema_50) maBreakdown += 1.0;
    if (ind.sma_200 !== null && lc < ind.sma_200) maBreakdown += 1.0;
    if (ind.ema_9 !== null && ind.ema_21 !== null && ind.ema_9 < ind.ema_21) maBreakdown += 1.0;
    if (ind.ema_21 !== null && ind.ema_50 !== null && ind.ema_21 < ind.ema_50) maBreakdown += 0.5;
    if (ind.hma_16 !== null && prev_hma16 !== null && ind.hma_16 < prev_hma16) maBreakdown += 1.0;
    if (ind.kama_10 !== null && prev_kama10 !== null && ind.kama_10 < prev_kama10) maBreakdown += 0.5;
    if (ind.wma_20 !== null && lc < ind.wma_20) maBreakdown += 0.5;
    if (ind.sma_20 !== null && ind.sma_50 !== null && ind.sma_20 < ind.sma_50) maBreakdown += 1.0;
    maBreakdown = Math.min(maBreakdown, 9.0);

    /* 11.2 MACD + TSI + STC Rollover (8 pts) ──────────────────────── */
    var macdTsiStc = 0;
    if (ind.macd) {
      var macdVal = ind.macd.macd, signalVal = ind.macd.signal, histVal = ind.macd.histogram;
      var prev_macd = indPrior && indPrior.macd ? indPrior.macd.macd : null;
      var prev_signal = indPrior && indPrior.macd ? indPrior.macd.signal : null;
      var prev_hist = indPrior && indPrior.macd ? indPrior.macd.histogram : null;
      if (macdVal !== null && signalVal !== null && prev_macd !== null && prev_signal !== null) {
        if (macdVal < signalVal && prev_macd >= prev_signal) macdTsiStc += 2.0;
        else if (macdVal < signalVal) macdTsiStc += 1.0;
      }
      if (macdVal !== null && prev_macd !== null) {
        if (macdVal < 0 && prev_macd >= 0) macdTsiStc += 1.0;
      }
      if (histVal !== null && prev_hist !== null) {
        if (histVal < 0 && histVal < prev_hist) macdTsiStc += 0.5;
      }
    }
    if (ind.tsi !== null) {
      var prev_tsi = indPrior ? indPrior.tsi : null;
      if (prev_tsi !== null) {
        if (ind.tsi < 0 && prev_tsi >= 0) macdTsiStc += 1.0;
        else if (ind.tsi < 0) macdTsiStc += 0.5;
      } else if (ind.tsi < 0) {
        macdTsiStc += 0.5;
      }
      if (prev_tsi !== null && ind.tsi < prev_tsi) macdTsiStc += 0.5;
    }
    if (ind.stc !== null) {
      var prev_stc = indPrior ? indPrior.stc : null;
      if (ind.stc < 25) macdTsiStc += 1.0;
      if (prev_stc !== null && ind.stc < prev_stc && ind.stc < 75) macdTsiStc += 1.0;
    }
    macdTsiStc = Math.min(macdTsiStc, 8.0);

    /* 11.3 ADX + Supertrend + PSAR Breakdown (8 pts) ───────────────── */
    var adxStPsar = 0;
    if (ind.adx_14 !== null) {
      var prev_adx = indPrior ? indPrior.adx_14 : null;
      if (prev_adx !== null) {
        if (ind.adx_14 < prev_adx && ind.adx_14 < 25) adxStPsar += 1.5;
        else if (ind.adx_14 < prev_adx) adxStPsar += 0.5;
      }
      if (plusDI !== null && minusDI !== null && prev_plusDI !== null && prev_minusDI !== null) {
        if (minusDI > plusDI && prev_minusDI <= prev_plusDI) adxStPsar += 2.0;
        else if (minusDI > plusDI) adxStPsar += 1.0;
      }
    }
    if (ind.supertrend !== null) {
      var prev_st = indPrior ? indPrior.supertrend : null;
      if (lc < ind.supertrend) adxStPsar += 1.5;
      if (prev_close_prior !== null && prev_st !== null && prev_close_prior >= prev_st && lc < ind.supertrend) adxStPsar += 1.0;
    }
    if (ind.psar !== null) {
      var prev_psar = indPrior ? indPrior.psar : null;
      if (lc < ind.psar) adxStPsar += 1.0;
      if (prev_close_prior !== null && prev_psar !== null && prev_close_prior >= prev_psar && lc < ind.psar) adxStPsar += 0.5;
    }
    adxStPsar = Math.min(adxStPsar, 8.0);

    var trendBreakdown = Math.min(maBreakdown + macdTsiStc + adxStPsar, 25.0);

    /* ═══════════════════════════════════════════════════════════════════
       12. MOMENTUM EXHAUSTION (Max 25 pts)
       ═══════════════════════════════════════════════════════════════════ */

    /* 12.1 RSI + Stochastic RSI Exhaustion (9 pts) ─────────────────── */
    var rsiStochrsi = 0;
    if (ind.rsi_14 !== null) {
      var prev_rsi = indPrior ? indPrior.rsi_14 : null;
      if (ind.rsi_14 > 80) rsiStochrsi += 2.5;
      else if (ind.rsi_14 > 70) rsiStochrsi += 1.5;
      if (prev_rsi !== null && ind.rsi_14 < prev_rsi && prev_rsi > 70) rsiStochrsi += 1.5;
      if (prev_rsi !== null && ind.rsi_14 < 70 && prev_rsi >= 70) rsiStochrsi += 0.5;
      if (prev_rsi !== null && ind.rsi_14 < 50 && prev_rsi >= 50) rsiStochrsi += 1.0;
    }
    if (ind.stochRSI && ind.stochRSI.k !== null && ind.stochRSI.d !== null) {
      var prev_k = indPrior && indPrior.stochRSI ? indPrior.stochRSI.k : null;
      var prev_d = indPrior && indPrior.stochRSI ? indPrior.stochRSI.d : null;
      if (prev_k !== null && prev_d !== null) {
        if (ind.stochRSI.k < ind.stochRSI.d && prev_k >= prev_d) rsiStochrsi += 1.5;
        else if (ind.stochRSI.k < ind.stochRSI.d) rsiStochrsi += 0.5;
      }
      if (ind.stochRSI.k < 20) rsiStochrsi += 1.0;
      if (prev_k !== null && ind.stochRSI.k < prev_k) rsiStochrsi += 0.5;
    }
    rsiStochrsi = Math.min(rsiStochrsi, 9.0);

    /* 12.2 CCI + ROC + Momentum Reversal (8 pts) ──────────────────── */
    var cciRocMom = 0;
    if (ind.cci_20 !== null) {
      var prev_cci = indPrior ? indPrior.cci_20 : null;
      if (ind.cci_20 > 200) cciRocMom += 1.5;
      else if (ind.cci_20 > 100) cciRocMom += 0.5;
      if (prev_cci !== null && ind.cci_20 < prev_cci && prev_cci > 100) cciRocMom += 1.5;
      if (prev_cci !== null && ind.cci_20 < 0 && prev_cci >= 0) cciRocMom += 1.0;
    }
    if (ind.roc_12 !== null) {
      var prev_roc = indPrior ? indPrior.roc_12 : null;
      if (prev_roc !== null && ind.roc_12 < 0 && prev_roc >= 0) cciRocMom += 1.5;
      else if (ind.roc_12 < 0) cciRocMom += 0.5;
      if (prev_roc !== null && ind.roc_12 < prev_roc) cciRocMom += 0.5;
    }
    if (ind.momentum_10 !== null) {
      var prev_mom = indPrior ? indPrior.momentum_10 : null;
      if (prev_mom !== null && ind.momentum_10 < 0 && prev_mom >= 0) cciRocMom += 1.0;
      else if (ind.momentum_10 < 0) cciRocMom += 0.5;
      if (prev_mom !== null && ind.momentum_10 < prev_mom) cciRocMom += 0.5;
    }
    cciRocMom = Math.min(cciRocMom, 8.0);

    /* 12.3 MFI + CMF Outflow (8 pts) ──────────────────────────────── */
    var mfiCmf = 0;
    if (ind.mfi_14 !== null) {
      var prev_mfi = indPrior ? indPrior.mfi_14 : null;
      if (ind.mfi_14 > 80) mfiCmf += 2.0;
      else if (ind.mfi_14 > 70) mfiCmf += 1.0;
      if (prev_mfi !== null && ind.mfi_14 < prev_mfi && prev_mfi > 70) mfiCmf += 1.5;
      if (prev_mfi !== null && ind.mfi_14 < 50 && prev_mfi >= 50) mfiCmf += 1.0;
      if (ind.mfi_14 < 30) mfiCmf += 1.0;
    }
    if (ind.cmf_20 !== null) {
      var prev_cmf = indPrior ? indPrior.cmf_20 : null;
      if (ind.cmf_20 < -0.05) mfiCmf += 2.0;
      else if (ind.cmf_20 < 0) mfiCmf += 1.0;
      if (prev_cmf !== null && ind.cmf_20 < prev_cmf && ind.cmf_20 < 0) mfiCmf += 1.0;
    }
    mfiCmf = Math.min(mfiCmf, 8.0);

    var momentumExhaustion = Math.min(rsiStochrsi + cciRocMom + mfiCmf, 25.0);

    /* ═══════════════════════════════════════════════════════════════════
       13. VOLUME DISTRIBUTION (Max 25 pts)
       ═══════════════════════════════════════════════════════════════════ */

    /* 13.1 OBV + PVT + KVO Decline (9 pts) ─────────────────────────── */
    var obvPvtKvo = 0;
    if (obvLast2.length === 2) {
      if (ind.obv !== null && obvSma20Last !== null && ind.obv < obvSma20Last) obvPvtKvo += 1.5;
      if (obvSlope < 0 && prevObvSlope > 0) obvPvtKvo += 1.0;
      else if (obvSlope < 0) obvPvtKvo += 0.5;
    }
    if (pvtLast2.length === 2) {
      if (ind.pvt !== null && pvtSma20Last !== null && ind.pvt < pvtSma20Last) obvPvtKvo += 1.5;
      if (pvtSlope < 0) obvPvtKvo += 1.0;
    }
    if (kvoLast !== null && kvoSignalLast !== null && prevKvo !== null && prevKvoSignal !== null) {
      if (kvoLast < kvoSignalLast && prevKvo >= prevKvoSignal) obvPvtKvo += 1.5;
      else if (kvoLast < kvoSignalLast) obvPvtKvo += 0.5;
    }
    if (kvoLast !== null && kvoLast < 0) obvPvtKvo += 1.0;
    if (kvoLast !== null && prevKvo !== null && kvoLast < prevKvo) obvPvtKvo += 0.5;
    obvPvtKvo = Math.min(obvPvtKvo, 9.0);

    /* 13.2 VWAP + Anchored VWAP Break (8 pts) ──────────────────────── */
    var vwapAvwap = 0;
    if (ind.vwap !== null) {
      var pVwap = indPrior && indPrior.vwap !== undefined ? indPrior.vwap : ind.vwap;
      if (lc < ind.vwap && prevClose >= pVwap) {
        vwapAvwap += 2.0;
      } else if (lc < ind.vwap) {
        var pct = (ind.vwap - lc) / ind.vwap * 100;
        if (pct > 2.0) vwapAvwap += 1.5;
        else if (pct > 1.0) vwapAvwap += 1.0;
        else vwapAvwap += 0.5;
      }
      if (ind.vwap !== null && pVwap !== null && ind.vwap < pVwap) vwapAvwap += 0.5;
    }
    if (ind.anchored_vwap !== null) {
      if (lc < ind.anchored_vwap) vwapAvwap += 1.5;
      if (prev_avwap !== null && ind.anchored_vwap < prev_avwap) vwapAvwap += 0.5;
    }
    if (ind.vwap !== null && ind.anchored_vwap !== null && lc < ind.vwap && lc < ind.anchored_vwap) {
      vwapAvwap += 1.0;
    }
    vwapAvwap = Math.min(vwapAvwap, 8.0);

    /* 13.3 TTM Squeeze + Smart Money Exit (8 pts) ──────────────────── */
    var squeezeSm = 0;
    var prevSqueezeMom = indPrior ? indPrior.squeezeMomentum : null;
    var prevSqueezeOn = indPrior ? indPrior.ttmSqueeze : null;
    if (ind.squeezeMomentum !== null) {
      if (prevSqueezeMom !== null && ind.squeezeMomentum < 0 && prevSqueezeMom >= 0) squeezeSm += 2.5;
      else if (ind.squeezeMomentum < 0) squeezeSm += 1.5;
      if (ind.squeezeMomentum < prevSqueezeMom && ind.squeezeMomentum < 0) squeezeSm += 1.0;
    }
    if (ind.ttmSqueeze && ind.squeezeMomentum !== null && ind.squeezeMomentum < 0) squeezeSm += 1.0;
    if (smStatus === "SELLING") squeezeSm += 2.5;
    else if (smStatus === "DISTRIBUTING") squeezeSm += 1.5;
    else if (smStatus === "NONE" && (prevSmStatus === "BUYING" || prevSmStatus === "ACCUMULATING")) squeezeSm += 1.0;
    squeezeSm = Math.min(squeezeSm, 8.0);

    var volumeDistribution = Math.min(obvPvtKvo + vwapAvwap + squeezeSm, 25.0);

    /* ═══════════════════════════════════════════════════════════════════
       14. STRUCTURE BREAKDOWN (Max 25 pts)
       ═══════════════════════════════════════════════════════════════════ */

    /* 14.1 BB + KC + DC Breakdown (9 pts) ──────────────────────────── */
    var bbKcDc = 0;
    if (ind.bb && ind.bb.upper !== null && ind.bb.lower !== null) {
      var prevBbMid = indPrior && indPrior.bb ? indPrior.bb.middle : ind.bb.middle;
      if (lc < ind.bb.middle && prevClose >= prevBbMid) bbKcDc += 2.0;
      else if (lc < ind.bb.middle) bbKcDc += 0.5;
      if (lc < ind.bb.lower) bbKcDc += 1.5;
      var prevBbWidth = indPrior && indPrior.bb ? (indPrior.bb.upper - indPrior.bb.lower) : null;
      var bbWidth = ind.bb.upper - ind.bb.lower;
      if (prevBbWidth !== null && bbWidth > prevBbWidth && lc < ind.bb.middle) bbKcDc += 1.0;
    }
    if (ind.keltner && ind.keltner.middle !== null) {
      var prevKcMid = indPrior && indPrior.keltner ? indPrior.keltner.middle : ind.keltner.middle;
      if (lc < ind.keltner.middle && prevClose >= prevKcMid) bbKcDc += 1.5;
      else if (lc < ind.keltner.middle) bbKcDc += 0.5;
    }
    if (ind.donchian && ind.donchian.lower !== null && ind.donchian.upper !== null) {
      if (lc <= ind.donchian.lower * 1.01) bbKcDc += 1.5;
      else if (lc < (ind.donchian.upper + ind.donchian.lower) / 2) bbKcDc += 0.5;
    }
    if (ind.atr_14 !== null && ind.atr_14 > 0) {
      var atrPct = (ind.atr_14 / lc) * 100;
      if (atrPct > 5.0) bbKcDc += 1.0;
    }
    bbKcDc = Math.min(bbKcDc, 9.0);

    /* 14.2 Ichimoku Bearish Flip (6 pts) ───────────────────────────── */
    var ichimokuExit = 0;
    if (ind.ichimoku) {
      var tenkan = ind.ichimoku.tenkan, kijun = ind.ichimoku.kijun;
      var senkouA = ind.ichimoku.senkouA, senkouB = ind.ichimoku.senkouB;
      if (senkouA !== null && senkouB !== null) {
        var cloudBottom = Math.min(senkouA, senkouB);
        var cloudTop = Math.max(senkouA, senkouB);
        if (lc < cloudBottom) ichimokuExit += 2.0;
        else if (lc < cloudTop) ichimokuExit += 0.5;
      }
      var prevTenkan = indPrior && indPrior.ichimoku ? indPrior.ichimoku.tenkan : null;
      var prevKijun = indPrior && indPrior.ichimoku ? indPrior.ichimoku.kijun : null;
      if (tenkan !== null && kijun !== null && prevTenkan !== null && prevKijun !== null) {
        if (tenkan < kijun && prevTenkan >= prevKijun) ichimokuExit += 1.5;
        else if (tenkan < kijun) ichimokuExit += 0.5;
      }
      if (senkouA !== null && senkouB !== null && senkouA < senkouB) ichimokuExit += 1.0;
      if (lc < prevClose) ichimokuExit += 0.5;
      if (senkouA !== null && senkouB !== null && tenkan !== null && kijun !== null) {
        var cloudBot = Math.min(senkouA, senkouB);
        if (lc < cloudBot && tenkan < kijun && senkouA < senkouB) ichimokuExit += 0.5;
      }
    }
    ichimokuExit = Math.min(ichimokuExit, 6.0);

    /* 14.3 Darvas + HMA + KAMA + MTF Breakdown (10 pts) ────────────── */
    var darvasHmaMtf = 0;
    if (ind.darvasBox) {
      var db = ind.darvasBox;
      if (db.bottom !== null && db.top !== null) {
        if (lc <= db.bottom) darvasHmaMtf += 2.0;
        else if (lc < (db.top + db.bottom) / 2) darvasHmaMtf += 0.5;
      } else if (db.breakout === 'down') {
        darvasHmaMtf += 2.0;
      }
    }
    if (ind.hma_16 !== null && prev_hma16 !== null && ind.hma_16 < prev_hma16) darvasHmaMtf += 1.0;
    if (ind.kama_10 !== null && prev_kama10 !== null && ind.kama_10 < prev_kama10) darvasHmaMtf += 1.0;
    if (ind.hma_16 !== null && ind.kama_10 !== null && lc < ind.hma_16 && lc < ind.kama_10) darvasHmaMtf += 0.5;
    if (ind.mtfAlignment !== null) {
      var prevMtf = indPrior ? indPrior.mtfAlignment : null;
      if (ind.mtfAlignment < 40) darvasHmaMtf += 2.0;
      else if (ind.mtfAlignment < 60) darvasHmaMtf += 1.0;
      if (prevMtf !== null && ind.mtfAlignment < prevMtf) darvasHmaMtf += 0.5;
    }
    var ep = position && position.entryPrice ? position.entryPrice : null;
    if (ep && ind.atr_14 && ind.atr_14 > 0) {
      var stopLoss = ep - (ind.atr_14 * 1.5);
      var target = ep * 1.04;
      var risk = lc - stopLoss;
      var reward = target - lc;
      if (risk > 0 && reward > 0) {
        var rr = reward / risk;
        if (rr < 1.0) darvasHmaMtf += 2.0;
        else if (rr < 1.5) darvasHmaMtf += 1.0;
      } else if (reward <= 0) {
        darvasHmaMtf += 1.5;
      }
    }
    darvasHmaMtf = Math.min(darvasHmaMtf, 10.0);

    var structureBreakdown = Math.min(bbKcDc + ichimokuExit + darvasHmaMtf, 25.0);

    /* ═══════════════════════════════════════════════════════════════════
       15. RAW EXIT SCORE + MODIFIERS
       ═══════════════════════════════════════════════════════════════════ */
    var raw = trendBreakdown + momentumExhaustion + volumeDistribution + structureBreakdown;

    /* ── Normalize indicator values — unavailable → 0 / false ──────────── */
    var mtfAlign = ind.mtfAlignment !== null ? ind.mtfAlignment : 0;
    var macdHist = (ind.macd && ind.macd.histogram !== null) ? ind.macd.histogram : 0;
    var ema9 = ind.ema_9 !== null ? ind.ema_9 : 0;
    var ema21 = ind.ema_21 !== null ? ind.ema_21 : 0;
    var adxVal = ind.adx_14 !== null ? ind.adx_14 : 0;
    var bbLower = (ind.bb && ind.bb.lower !== null) ? ind.bb.lower : 0;
    var kcLower = (ind.keltner && ind.keltner.lower !== null) ? ind.keltner.lower : 0;
    var epVal = (ep && ep > 0) ? ep : 0;
    var posBuyDate = (position && position.buyDate) ? position.buyDate : null;
    var posEntryScore = (position && position.entryScore) ? position.entryScore : 0;

    /* ── Penalty Modifiers (reduce exit urgency) ──────────────────── */
    var penalties = 0;
    var hardFilters = [];

    // Weekly Trend Intact (−8): approximate with MTF alignment +60 and MACD bullish
    if (mtfAlign >= 60 && macdHist > 0) {
      penalties -= 8;
      hardFilters.push("Weekly Trend Intact \u2014 MTF alignment " + round(mtfAlign,1) + ", MACD hist " + round(macdHist,2) + " (\u22128)");
    }

    // Low-Volume Pullback (−6): price declining 3d + volume < 70% avg
    if (candles.length >= 6) {
      var c3 = candles[candles.length - 1].c;
      var c2 = candles[candles.length - 2].c;
      var c1 = candles[candles.length - 3].c;
      var priceDeclining = c3 < c2 && c2 < c1;
      var avgVol = 0, vc = 0;
      for (var vi = Math.max(0, candles.length - 21); vi < candles.length - 1; vi++) {
        avgVol += candles[vi].v; vc++;
      }
      avgVol = vc > 0 ? avgVol / vc : 0;
      var curVol = candles[candles.length - 1].v;
      if (priceDeclining && avgVol > 0 && curVol < avgVol * 0.7) {
        var volRatio = avgVol > 0 ? round(curVol / avgVol * 100, 0) : 0;
        penalties -= 6;
        hardFilters.push("Low-Volume Pullback \u2014 price declining 3d, vol " + volRatio + "% of avg (\u22126)");
      }
    }

    // Near Support (−5): within 1.5% of major support (single check, only when above)
    var nearSupport = false;
    var nearSupportDist = "";
    if (lc > 0) {
      if (bbLower > 0 && lc > bbLower) {
        var dBB = (lc - bbLower) / lc;
        if (dBB < 0.015) { nearSupport = true; nearSupportDist = "BB lower " + round(bbLower,2) + " (" + round(dBB * 100,2) + "%)"; }
      }
      if (!nearSupport && kcLower > 0 && lc > kcLower) {
        var dKC = (lc - kcLower) / lc;
        if (dKC < 0.015) { nearSupport = true; nearSupportDist = "KC lower " + round(kcLower,2) + " (" + round(dKC * 100,2) + "%)"; }
      }
    }
    if (nearSupport) {
      penalties -= 5;
      hardFilters.push("Near Support \u2014 " + nearSupportDist + " (\u22125)");
    }

    // Fresh Entry (−5): holding < 3 days + entry score was > 70
    if (posBuyDate) {
      var holdDays = Math.floor((new Date() - new Date(posBuyDate + "T12:00:00")) / 864e5);
      if (holdDays < 3 && posEntryScore > 70) {
        penalties -= 5;
        hardFilters.push("Fresh Entry \u2014 held " + holdDays + "d, entry score " + posEntryScore + " (\u22125)");
      }
    }

    /* ── Bonus Modifiers (increase exit urgency) ──────────────────── */
    var bonuses = 0;

    // Deep Loss: >3% loss → +5, >1.5% loss → +3
    if (epVal > 0) {
      var lossPct = (epVal - lc) / epVal;
      if (lossPct > 0.03) {
        bonuses += 5;
        hardFilters.push("Deep Loss \u2014 " + round(lossPct * 100, 1) + "% below entry (" + round(epVal,2) + " → " + round(lc,2) + ") (+5)");
      } else if (lossPct > 0.015) {
        bonuses += 3;
        hardFilters.push("Moderate Loss \u2014 " + round(lossPct * 100, 1) + "% below entry (" + round(epVal,2) + " → " + round(lc,2) + ") (+3)");
      }
    }

    // Dual TF Breakdown (≈ +5): below both EMA9 and EMA21 with MACD bearish
    var macdBearish = macdHist < 0;
    var belowFastMA = (ema9 > 0 && lc < ema9) && (ema21 > 0 && lc < ema21);
    if (belowFastMA && macdBearish && adxVal > 20) {
      bonuses += 5;
      hardFilters.push("Dual TF Breakdown \u2014 price " + round(lc,2) + " < EMA9 " + round(ema9,2) + " & EMA21 " + round(ema21,2) + ", MACD " + round(macdHist,2) + " (+5)");
    }

    // Smart Money Exit (≈ +3): SELLING + MTF misalignment
    if (smStatus === "SELLING" && ind.mtfAlignment !== null && mtfAlign < 40) {
      bonuses += 3;
      hardFilters.push("Smart Money Exit \u2014 MTF alignment " + round(mtfAlign,1) + " (+3)");
    }

    /* ═══════════════════════════════════════════════════════════════════
       16. FINAL EXIT SCORE + DECISION
       ═══════════════════════════════════════════════════════════════════ */
    var total = Math.max(0, Math.min(100, Math.round(raw + penalties + bonuses)));

    var decision;
    if (total >= 85) decision = { label: "URGENT EXIT", action: "exitNow", color: "#dc2626" };
    else if (total >= 70) decision = { label: "EXIT", action: "exitAll", color: "#ef4444" };
    else if (total >= 55) decision = { label: "PARTIAL EXIT", action: "exit50", color: "#f97316" };
    else if (total >= 40) decision = { label: "TIGHTEN STOP", action: "tighten", color: "#eab308" };
    else if (total >= 25) decision = { label: "MONITOR", action: "monitor", color: "#84cc16" };
    else decision = { label: "HOLD", action: "hold", color: "#22c55e" };

    /* ── Critical Overrides ─────────────────────────────────────────── */
    var overrides = [];

    if (ind.supertrend !== null && lc < ind.supertrend && ind.ema_21 !== null && lc < ind.ema_21) {
      overrides.push("SuperTrend Sell + Close below EMA(21)");
    }

    var obvFalling = obvLast2.length === 2 && obvLast2[1] < obvLast2[0];
    if (ind.anchored_vwap !== null && lc < ind.anchored_vwap && obvFalling && ind.cmf_20 !== null && ind.cmf_20 < 0) {
      overrides.push("Close below AVWAP + OBV falling + CMF bearish");
    }

    var tsiBearish = ind.tsi !== null && ind.tsi <= 0;
    var stcBearish = ind.stc !== null && ind.stc <= 50;
    if (macdBearish && tsiBearish && stcBearish) {
      overrides.push("MACD + TSI + STC all bearish simultaneously");
    }

    var vpBreak = ind.volumeProfile && ind.volumeProfile.poc !== null && lc < ind.volumeProfile.poc;
    var darvasBreak = ind.darvasBox && (ind.darvasBox.breakout === 'down' || (ind.darvasBox.bottom !== null && lc <= ind.darvasBox.bottom));
    if (vpBreak || darvasBreak) {
      var avgV = 0, volC = 0;
      for (var vi2 = Math.max(0, candles.length - 21); vi2 < candles.length - 1; vi2++) {
        avgV += candles[vi2].v; volC++;
      }
      avgV = volC > 0 ? avgV / volC : 0;
      if (avgV > 0 && candles[candles.length - 1].v > avgV * 1.5) {
        overrides.push(vpBreak ? "Volume Profile POC breakdown on strong volume" : "Darvas Box breakdown on strong volume");
      }
    }

    return {
      total: total,
      trend: trendBreakdown, trendMax: 25,
      momentum: momentumExhaustion, momentumMax: 25,
      volume: volumeDistribution, volumeMax: 25,
      structure: structureBreakdown, structureMax: 25,
      decision: decision, overrides: overrides,
      subScores: {
        maBreakdown: round(maBreakdown, 1),
        macdTsiStc: round(macdTsiStc, 1),
        adxStPsar: round(adxStPsar, 1),
        rsiStochrsi: round(rsiStochrsi, 1),
        cciRocMom: round(cciRocMom, 1),
        mfiCmf: round(mfiCmf, 1),
        obvPvtKvo: round(obvPvtKvo, 1),
        vwapAvwap: round(vwapAvwap, 1),
        squeezeSm: round(squeezeSm, 1),
        bbKcDc: round(bbKcDc, 1),
        ichimokuExit: round(ichimokuExit, 1),
        darvasHmaMtf: round(darvasHmaMtf, 1)
      },
      modifiers: { penalties: penalties, bonuses: bonuses, raw: round(raw, 1), hardFilters: hardFilters }
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ENTRY SCORE — Momentum Trading Entry Scoring Engine (0–100)
     4 components: Trend(30) + Momentum(30) + Volume(20) + Structure(20)
     Each component has 3 sub-scores. Per-timeframe scoring.
     ═══════════════════════════════════════════════════════════════════════ */
  function computeEntryScore(candles, ind, currentPrice) {
    if (!candles || candles.length < 12 || !ind) return null;

    var lc = (currentPrice && currentPrice > 0) ? currentPrice : ind.lastClose;
    if (lc === null || lc === undefined) return null;

    /* ── Helpers ── */
    function lastN(arr, n) {
      var out = [];
      for (var i = arr.length - 1; i >= 0 && out.length < n; i--) {
        if (arr[i] !== null && arr[i] !== undefined) out.unshift(arr[i]);
      }
      return out;
    }
    function slope(arr, lookback) {
      var vals = lastN(arr, lookback || 2);
      if (vals.length < 2) return 0;
      return vals[vals.length - 1] - vals[vals.length - 2];
    }
    function crossedAbove(cur, prev, level) {
      return cur > level && prev !== null && prev <= level;
    }

    /* ── Compute +DI / -DI ── */
    var diData = (function () {
      var period = 14;
      if (candles.length < period + 1) return { plusDI: null, minusDI: null, prevPlusDI: null, prevMinusDI: null };
      var plusDM = [], minusDM = [], trArr = [];
      for (var i = 1; i < candles.length; i++) {
        var upMove = candles[i].h - candles[i - 1].h;
        var downMove = candles[i - 1].l - candles[i].l;
        plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
        var hl = candles[i].h - candles[i].l;
        var hc = Math.abs(candles[i].h - candles[i - 1].c);
        var lc2 = Math.abs(candles[i].l - candles[i - 1].c);
        trArr.push(Math.max(hl, hc, lc2));
      }
      var smTR = 0, smPDM = 0, smMDM = 0;
      for (var i = 0; i < period; i++) { smTR += trArr[i]; smPDM += plusDM[i]; smMDM += minusDM[i]; }
      var pDArr = [], mDArr = [];
      for (var i = period; i < trArr.length; i++) {
        smTR = smTR - smTR / period + trArr[i];
        smPDM = smPDM - smPDM / period + plusDM[i];
        smMDM = smMDM - smMDM / period + minusDM[i];
        pDArr.push(smTR > 0 ? 100 * smPDM / smTR : 0);
        mDArr.push(smTR > 0 ? 100 * smMDM / smTR : 0);
      }
      var len = pDArr.length;
      return {
        plusDI: len > 0 ? round(pDArr[len - 1], 2) : null,
        minusDI: len > 0 ? round(mDArr[len - 1], 2) : null,
        prevPlusDI: len > 1 ? round(pDArr[len - 2], 2) : null,
        prevMinusDI: len > 1 ? round(mDArr[len - 2], 2) : null
      };
    })();

    /* ── Previous candle indicators ── */
    var indPrior = candles.length >= 13 ? computeAll(candles.slice(0, -1)) : null;
    var indPrior2 = candles.length >= 14 ? computeAll(candles.slice(0, -2)) : null;

    /* ── Arrays for slopes / crossover detection ── */
    var obvArr = calcOBV(candles);
    var pvtArr = calcPVT(candles);
    var atrArr = calcATR(candles, 14);
    var vwapArr = calcVWAP(candles);
    var anchoredVwapArr = calcAnchoredVWAP(candles);
    var hmaArr = calcHMA(candles, 16);
    var kamaArr = calcKAMA(candles, 10);
    var macdObj = calcMACD(candles);
    var bbArr = calcBollingerBands(candles);
    var squeezeMom = calcSqueezeMomentum(candles);
    var obvSma20 = (function () {
      if (!obvArr) return null;
      var sum = 0;
      for (var i = 0; i < obvArr.length; i++) {
        sum += obvArr[i] || 0;
        if (i >= 19) {
          if (i === 19) { /* return null for early */ }
        }
      }
      var out = [];
      var s = 0;
      for (var i = 0; i < obvArr.length; i++) {
        s += obvArr[i] || 0;
        out.push(i >= 19 ? s / 20 : null);
        if (i >= 19) s -= (obvArr[i - 19] || 0);
      }
      return out;
    })();
    var pvtSma20 = (function () {
      if (!pvtArr) return null;
      var out = [];
      var s = 0;
      for (var i = 0; i < pvtArr.length; i++) {
        s += pvtArr[i] || 0;
        out.push(i >= 19 ? s / 20 : null);
        if (i >= 19) s -= (pvtArr[i - 19] || 0);
      }
      return out;
    })();

    /* ═══════════════════════════════════════════════════════════════════
       COMPONENT 1: TREND SCORE (max 10+10+10 = 30)
       ═══════════════════════════════════════════════════════════════════ */
    var trendMA = 0;
    var trendMACD = 0;
    var trendADX = 0;

    /* ── 4.1 Moving Average Stack (10 pts) ── */
    (function () {
      var s = 0;
      if (lc > ind.ema_9)  s += 0.5;
      if (lc > ind.ema_21) s += 0.5;
      if (lc > ind.ema_50) s += 0.5;
      if (ind.sma_200 !== null && lc > ind.sma_200) s += 0.5;

      if (ind.ema_9 > ind.ema_21 && ind.ema_21 > ind.ema_50) s += 2.0;
      else if (ind.ema_9 > ind.ema_21 || ind.ema_21 > ind.ema_50) s += 1.0;

      if (ind.sma_20 !== null && ind.sma_50 !== null) {
        if (ind.sma_200 !== null) {
          if (ind.sma_20 > ind.sma_50 && ind.sma_50 > ind.sma_200) s += 2.0;
          else if (ind.sma_20 > ind.sma_50) s += 1.0;
        } else {
          if (ind.sma_20 > ind.sma_50) s += 1.5;
        }
      }

      var fastBull = 0;
      if (ind.hma_16 !== null && lc > ind.hma_16) fastBull += 1;
      if (ind.kama_10 !== null && lc > ind.kama_10) fastBull += 1;
      if (ind.wma_20 !== null && lc > ind.wma_20) fastBull += 1;
      s += Math.min(fastBull * 0.67, 2.0);

      var prevHMA = indPrior && indPrior.hma_16 !== null ? indPrior.hma_16 : null;
      if (ind.hma_16 !== null && prevHMA !== null && ind.hma_16 > prevHMA) s += 1.0;

      trendMA = Math.min(s, 10.0);
    })();

    /* ── 4.2 MACD + TSI + STC Confluence (10 pts) ── */
    (function () {
      var s = 0;
      var mMacd = ind.macd ? ind.macd.macd || 0 : 0;
      var mSig = ind.macd ? ind.macd.signal || 0 : 0;
      var mHist = ind.macd ? ind.macd.histogram : 0;
      var prevHist = indPrior && indPrior.macd ? indPrior.macd.histogram : null;
      var prevHist2 = indPrior2 && indPrior2.macd ? indPrior2.macd.histogram : null;

      if (mMacd > mSig) s += 1.5;
      if (mMacd > 0) s += 0.5;
      if (mHist > 0 && prevHist !== null && mHist > prevHist) s += 1.0;
      if (mMacd > mSig && prevHist !== null && prevHist2 !== null && prevHist <= (indPrior.macd ? indPrior.macd.signal || 0 : 0)) s += 0.5;

      var tsi = ind.tsi !== null ? ind.tsi : null;
      var prevTsi = indPrior && indPrior.tsi !== null ? indPrior.tsi : null;
      if (tsi !== null) {
        if (tsi > 0) s += 0.5;
        if (tsi > 0 && prevTsi !== null && tsi > prevTsi) s += 1.0;
        if (tsi > 0 && prevTsi !== null && prevTsi <= 0) s += 0.5;
      }

      var stc = ind.stc !== null ? ind.stc : null;
      var prevStc = indPrior && indPrior.stc !== null ? indPrior.stc : null;
      var prevStc2 = indPrior2 && indPrior2.stc !== null ? indPrior2.stc : null;
      if (stc !== null) {
        if (stc > 50) s += 0.5;
        if (prevStc !== null && stc > prevStc) s += 1.0;
        if (stc > 75) s += 0.5;
        if (prevStc !== null && prevStc2 !== null && stc > 25 && prevStc <= 25) s += 1.0;
      }

      var bullCount = 0;
      if (mMacd > mSig) bullCount++;
      if (tsi !== null && tsi > 0) bullCount++;
      if (stc !== null && stc > 50) bullCount++;
      if (bullCount === 3) s += 1.5;

      trendMACD = Math.min(s, 10.0);
    })();

    /* ── 4.3 ADX + Supertrend + Parabolic SAR (10 pts) ── */
    (function () {
      var s = 0;
      var adx = ind.adx_14;
      var prevAdx = indPrior && indPrior.adx_14 !== null ? indPrior.adx_14 : null;

      if (adx !== null) {
        if (adx >= 40) s += 1.5;
        else if (adx >= 25) s += 1.0;
        else if (adx >= 20) s += 0.5;
        if (diData.plusDI !== null && diData.minusDI !== null && diData.plusDI > diData.minusDI) s += 1.0;
        if (adx !== null && prevAdx !== null && adx > prevAdx && diData.plusDI !== null && diData.minusDI !== null && diData.plusDI > diData.minusDI) s += 0.5;
      }

      var st = ind.supertrend;
      var prevST = indPrior && indPrior.supertrend !== null ? indPrior.supertrend : null;
      var prevClose2 = candles.length >= 2 ? candles[candles.length - 2].c : null;
      if (st !== null) {
        if (lc > st) s += 2.0;
        if (prevST !== null && prevClose2 !== null && prevClose2 <= prevST && lc > st) s += 1.5;
      }

      var psar = ind.psar;
      var prevPsar = indPrior && indPrior.psar !== null ? indPrior.psar : null;
      var prevClose3 = candles.length >= 3 ? candles[candles.length - 3].c : null;
      if (psar !== null) {
        if (lc > psar) s += 1.5;
        if (prevPsar !== null && prevClose3 !== null && prevClose3 <= prevPsar && lc > psar) s += 1.0;
      }

      if (st !== null && lc > st && psar !== null && lc > psar && diData.plusDI !== null && diData.minusDI !== null && diData.plusDI > diData.minusDI) s += 1.0;

      trendADX = Math.min(s, 10.0);
    })();

    var trendScore = Math.round((trendMA + trendMACD + trendADX) * 10) / 10;

    /* ═══════════════════════════════════════════════════════════════════
       COMPONENT 2: MOMENTUM SCORE (max 10+10+10 = 30)
       ═══════════════════════════════════════════════════════════════════ */
    var momRSI = 0;
    var momCCIROC = 0;
    var momMFI = 0;

    /* ── 5.1 RSI + Stochastic RSI (10 pts) ── */
    (function () {
      var s = 0;
      var rsi = ind.rsi_14;
      var prevRsi = indPrior && indPrior.rsi_14 !== null ? indPrior.rsi_14 : null;

      if (rsi !== null) {
        if (rsi >= 60 && rsi <= 75) s += 2.5;
        else if (rsi >= 55 && rsi < 60) s += 1.5;
        else if (rsi > 75 && rsi <= 80) s += 1.5;
        else if (rsi >= 50 && rsi < 55) s += 1.0;
        else s += 0.5;

        if (rsi > 50 && prevRsi !== null && rsi > prevRsi) s += 1.5;
        if (prevRsi !== null && rsi > 50 && prevRsi <= 50) s += 1.0;
      }

      if (ind.stochRSI) {
        var sk = ind.stochRSI.k, sd = ind.stochRSI.d;
        var prevSK = indPrior && indPrior.stochRSI ? indPrior.stochRSI.k : null;
        if (sk !== null && sd !== null) {
          if (sk > sd) s += 1.5;
          if (sk >= 50 && sk <= 80) s += 1.0;
          if (prevSK !== null && sk > prevSK) s += 0.5;
        }
      }

      if (rsi !== null && rsi > 55 && ind.stochRSI && ind.stochRSI.k !== null && ind.stochRSI.d !== null && ind.stochRSI.k > ind.stochRSI.d) s += 0.5;

      momRSI = Math.min(s, 10.0);
    })();

    /* ── 5.2 CCI + ROC + Momentum (10 pts) ── */
    (function () {
      var s = 0;
      var cci = ind.cci_20;
      var prevCci = indPrior && indPrior.cci_20 !== null ? indPrior.cci_20 : null;
      if (cci !== null) {
        if (cci >= 100 && cci <= 200) s += 2.0;
        else if (cci >= 50 && cci < 100) s += 1.5;
        else if (cci >= 0 && cci < 50) s += 1.0;
        else if (cci > 200) s += 1.0;
        if (cci > 0 && prevCci !== null && cci > prevCci) s += 0.5;
      }

      var roc = ind.roc_12;
      var prevRoc = indPrior && indPrior.roc_12 !== null ? indPrior.roc_12 : null;
      if (roc !== null) {
        if (roc > 0 && prevRoc !== null && roc > prevRoc) s += 2.0;
        else if (roc > 0) s += 1.0;
        if (roc > 2) s += 0.5;
      }

      var mom = ind.momentum_10;
      var prevMom = indPrior && indPrior.momentum_10 !== null ? indPrior.momentum_10 : null;
      if (mom !== null) {
        if (mom > 0 && prevMom !== null && mom > prevMom) s += 2.0;
        else if (mom > 0) s += 1.0;
        if (prevMom !== null && mom > prevMom) s += 0.5;
      }

      if (cci !== null && cci > 0 && roc !== null && roc > 0 && mom !== null && mom > 0) s += 1.0;

      momCCIROC = Math.min(s, 10.0);
    })();

    /* ── 5.3 MFI + CMF — Money Flow (10 pts) ── */
    (function () {
      var s = 0;
      var mfi = ind.mfi_14;
      var prevMfi = indPrior && indPrior.mfi_14 !== null ? indPrior.mfi_14 : null;
      if (mfi !== null) {
        if (mfi >= 60 && mfi <= 80) s += 2.5;
        else if (mfi >= 50 && mfi < 60) s += 1.5;
        else if (mfi >= 40 && mfi < 50) s += 1.0;
        else if (mfi > 80) s += 1.0;
        if (mfi > 50 && prevMfi !== null && mfi > prevMfi) s += 1.5;
        if (mfi > 50 && prevMfi !== null && prevMfi <= 50) s += 1.0;
      }

      var cmf = ind.cmf_20;
      var prevCmf = indPrior && indPrior.cmf_20 !== null ? indPrior.cmf_20 : null;
      if (cmf !== null) {
        if (cmf > 0.10) s += 2.0;
        else if (cmf > 0.05) s += 1.5;
        else if (cmf > 0) s += 1.0;
        if (cmf > 0 && prevCmf !== null && cmf > prevCmf) s += 1.0;
      }

      if (mfi !== null && mfi > 50 && cmf !== null && cmf > 0) s += 0.5;

      momMFI = Math.min(s, 10.0);
    })();

    var momentumScore = Math.round((momRSI + momCCIROC + momMFI) * 10) / 10;

    /* ═══════════════════════════════════════════════════════════════════
       COMPONENT 3: VOLUME SCORE (max 8+6+6 = 20)
       ═══════════════════════════════════════════════════════════════════ */
    var volOBV = 0;
    var volVWAP = 0;
    var volProfile = 0;

    /* ── 6.1 OBV + PVT + KVO (8 pts) ── */
    (function () {
      var s = 0;
      var obvLast = obvArr ? obvArr[obvArr.length - 1] : null;
      var obvSma = obvSma20 ? obvSma20[obvSma20.length - 1] : null;
      var obvSlope = slope(obvArr, 3);
      var prevObvSlope = obvArr && obvArr.length >= 5 ? (function () {
        var v1 = obvArr[obvArr.length - 3], v2 = obvArr[obvArr.length - 5];
        return (v1 !== null && v2 !== null) ? v1 - v2 : 0;
      })() : 0;

      if (obvLast !== null && obvSma !== null && obvLast > obvSma) s += 1.0;
      if (obvSlope > 0) s += 0.5;
      if (obvSlope > prevObvSlope) s += 0.5;

      var pvtLast = pvtArr ? pvtArr[pvtArr.length - 1] : null;
      var pvtSma = pvtSma20 ? pvtSma20[pvtSma20.length - 1] : null;
      var pvtSlope = slope(pvtArr, 3);
      var prevPvtSlope = pvtArr && pvtArr.length >= 5 ? (function () {
        var v1 = pvtArr[pvtArr.length - 3], v2 = pvtArr[pvtArr.length - 5];
        return (v1 !== null && v2 !== null) ? v1 - v2 : 0;
      })() : 0;

      if (pvtLast !== null && pvtSma !== null && pvtLast > pvtSma) s += 1.0;
      if (pvtSlope > 0) s += 1.0;
      if (pvtSlope > prevPvtSlope) s += 0.5;

      var kvo = ind.kvo;
      var prevKvo = indPrior && indPrior.kvo !== null ? indPrior.kvo : null;
      var prevKvo2 = indPrior2 && indPrior2.kvo !== null ? indPrior2.kvo : null;
      if (kvo !== null) {
        if (prevKvo !== null && kvo > prevKvo) s += 1.5;
        else if (kvo > 0) s += 0.5;
        if (kvo > 0) s += 0.5;
        if (prevKvo !== null && prevKvo2 !== null && kvo > prevKvo && prevKvo <= prevKvo2) s += 1.0;
      }

      volOBV = Math.min(s, 8.0);
    })();

    /* ── 6.2 VWAP + Anchored VWAP (6 pts) ── */
    (function () {
      var s = 0;
      if (ind.vwap !== null) {
        if (lc > ind.vwap) {
          s += 1.5;
          var pct = (lc - ind.vwap) / ind.vwap * 100;
          if (pct >= 0.5 && pct <= 3.0) s += 0.5;
        }
        var vwapSlope = slope(vwapArr, 3);
        if (vwapSlope > 0) s += 0.5;
      }
      if (ind.anchored_vwap !== null) {
        if (lc > ind.anchored_vwap) s += 1.5;
        var avSlope = slope(anchoredVwapArr, 3);
        if (avSlope > 0) s += 0.5;
      }
      if (ind.vwap !== null && lc > ind.vwap && ind.anchored_vwap !== null && lc > ind.anchored_vwap) s += 1.0;

      volVWAP = Math.min(s, 6.0);
    })();

    /* ── 6.3 Volume Profile + TTM Squeeze + Smart Money (6 pts) ── */
    (function () {
      var s = 0;
      if (ind.volumeProfile) {
        var vp = ind.volumeProfile;
        if (vp.poc !== null && lc > vp.poc) s += 1.0;
        if (vp.vah !== null && lc > vp.vah) s += 0.5;
      }
      if (ind.ttmSqueeze !== null) {
        if (ind.ttmSqueeze === true) s += 0.5;
      }
      if (ind.squeezeMomentum !== null) {
        var prevSqMom = indPrior && indPrior.squeezeMomentum !== null ? indPrior.squeezeMomentum : null;
        if (ind.squeezeMomentum > 0 && prevSqMom !== null && ind.squeezeMomentum > prevSqMom) s += 1.5;
        else if (ind.squeezeMomentum > 0) s += 0.5;
      }
      if (ind.smartMoney) {
        var sm = ind.smartMoney;
        if (sm.bos === 'bullish_bos' && sm.choch === 'bullish_choch') s += 1.5;
        else if (sm.bos === 'bullish_bos' || sm.choch === 'bullish_choch') s += 1.0;
      }

      volProfile = Math.min(s, 6.0);
    })();

    var volumeScore = Math.round((volOBV + volVWAP + volProfile) * 10) / 10;

    /* ═══════════════════════════════════════════════════════════════════
       COMPONENT 4: STRUCTURE SCORE (max 8+6+6 = 20)
       ═══════════════════════════════════════════════════════════════════ */
    var structBB = 0;
    var structIch = 0;
    var structDarvas = 0;

    /* ── 7.1 Bollinger + Keltner + Donchian (8 pts) ── */
    (function () {
      var s = 0;
      if (ind.bb && ind.bb.upper !== null && ind.bb.lower !== null && ind.bb.middle !== null) {
        var bbRange = ind.bb.upper - ind.bb.lower;
        var bbPos = bbRange > 0 ? (lc - ind.bb.lower) / bbRange : 0.5;
        if (bbPos >= 0.5 && bbPos <= 0.8) s += 1.0;
        else if (bbPos >= 0.3 && bbPos < 0.5) s += 0.5;

        var prevBbW = null, curBbW = null;
        if (bbArr) {
          for (var bi = bbArr.length - 2; bi < bbArr.length; bi++) {
            if (bbArr[bi] && bbArr[bi].upper !== null && bbArr[bi].middle !== null && bbArr[bi].lower !== null && bbArr[bi].middle > 0) {
              var w = (bbArr[bi].upper - bbArr[bi].lower) / bbArr[bi].middle;
              if (prevBbW === null) prevBbW = w; else curBbW = w;
            }
          }
        }
        if (curBbW !== null && prevBbW !== null && curBbW > prevBbW) s += 0.5;
      }

      if (ind.keltner) {
        if (lc > (ind.keltner.middle || 0)) s += 1.0;
        if (ind.keltner.upper !== null && lc > ind.keltner.upper) s += 0.5;
      }

      if (ind.donchian) {
        if (ind.donchian.upper !== null && ind.donchian.lower !== null) {
          var dcMid = (ind.donchian.upper + ind.donchian.lower) / 2;
          if (ind.donchian.upper !== null && lc >= ind.donchian.upper * 0.99) s += 1.5;
          else if (lc > dcMid) s += 0.5;
        }
      }

      if (ind.bb && ind.keltner && ind.bb.upper !== null && ind.keltner.upper !== null && ind.bb.lower !== null && ind.keltner.lower !== null) {
        if (ind.bb.upper < ind.keltner.upper && ind.bb.lower > ind.keltner.lower) s += 1.0;
      }

      if (ind.atr_14 !== null && lc > 0) {
        var atrPct = (ind.atr_14 / lc) * 100;
        if (atrPct >= 2.0 && atrPct <= 4.0) s += 1.0;
        else if (atrPct >= 1.5 && atrPct < 2.0) s += 0.5;
      }

      if (ind.donchian && ind.donchian.upper !== null && lc > ind.donchian.upper && prevBbW !== null && curBbW !== null && curBbW > prevBbW) s += 1.5;

      structBB = Math.min(s, 8.0);
    })();

    /* ── 7.2 Ichimoku Cloud (6 pts) ── */
    (function () {
      var s = 0;
      if (ind.ichimoku) {
        var ich = ind.ichimoku;
        var cloudTop = Math.max(ich.senkouA || 0, ich.senkouB || 0);
        var cloudBot = Math.min(ich.senkouA || 0, ich.senkouB || 0);
        var prevClose = candles.length >= 2 ? candles[candles.length - 2].c : null;

        if (lc > cloudTop) s += 2.0;
        else if (lc > cloudBot) s += 0.5;

        if (ich.tenkan !== null && ich.kijun !== null && ich.tenkan > ich.kijun) s += 1.0;
        var prevTenkan = indPrior && indPrior.ichimoku ? indPrior.ichimoku.tenkan : null;
        var prevKijun = indPrior && indPrior.ichimoku ? indPrior.ichimoku.kijun : null;
        if (prevTenkan !== null && prevKijun !== null && ich.tenkan !== null && ich.kijun !== null) {
          if (ich.tenkan > ich.kijun && prevTenkan <= prevKijun) s += 0.5;
        }

        if (ich.senkouA !== null && ich.senkouB !== null && ich.senkouA > ich.senkouB) s += 1.0;

        if (ich.chikou !== null && prevClose !== null && ich.chikou > prevClose) s += 0.5;

        if (lc > cloudTop && ich.tenkan !== null && ich.kijun !== null && ich.tenkan > ich.kijun &&
            ich.senkouA !== null && ich.senkouB !== null && ich.senkouA > ich.senkouB &&
            ich.chikou !== null && prevClose !== null && ich.chikou > prevClose) s += 1.0;
      }

      structIch = Math.min(s, 6.0);
    })();

    /* ── 7.3 Darvas Box + HMA + KAMA + MTF Alignment (6 pts) ── */
    (function () {
      var s = 0;
      if (ind.darvasBox) {
        var db = ind.darvasBox;
        if (db.top !== null && lc >= db.top) s += 2.0;
        else if (db.top !== null && db.bottom !== null && lc > (db.top + db.bottom) / 2) s += 1.0;
      }

      if (ind.hma_16 !== null) {
        if (lc > ind.hma_16) s += 0.5;
        var prevHMA = indPrior && indPrior.hma_16 !== null ? indPrior.hma_16 : null;
        if (prevHMA !== null && ind.hma_16 > prevHMA) s += 0.5;
      }
      if (ind.kama_10 !== null) {
        if (lc > ind.kama_10) s += 0.5;
        var prevKAMA = indPrior && indPrior.kama_10 !== null ? indPrior.kama_10 : null;
        if (prevKAMA !== null && ind.kama_10 > prevKAMA) s += 0.5;
      }

      if (ind.mtfAlignment !== null) {
        if (ind.mtfAlignment >= 80) s += 1.5;
        else if (ind.mtfAlignment >= 60) s += 1.0;
        var prevMtf = indPrior && indPrior.mtfAlignment !== null ? indPrior.mtfAlignment : null;
        if (prevMtf !== null && ind.mtfAlignment > prevMtf) s += 0.5;
      }

      structDarvas = Math.min(s, 6.0);
    })();

    var structureScore = Math.round((structBB + structIch + structDarvas) * 10) / 10;

    /* ═══════════════════════════════════════════════════════════════════
       RAW SCORE & DECISION
       ═══════════════════════════════════════════════════════════════════ */
    var rawScore = trendScore + momentumScore + volumeScore + structureScore;
    var total = Math.round(rawScore * 10) / 10;
    total = Math.max(0, Math.min(100, total));

    var decision;
    if (total >= 80) decision = { label: "Strong Buy", action: "strongBuy", color: "#15803d", position: "Full position (100%)" };
    else if (total >= 65) decision = { label: "Buy", action: "buy", color: "#22c55e", position: "Standard position (70%)" };
    else if (total >= 50) decision = { label: "Watchlist", action: "watchlist", color: "#eab308", position: "Half position (40%)" };
    else if (total >= 35) decision = { label: "Neutral", action: "neutral", color: "#f97316", position: "No action" };
    else decision = { label: "Avoid", action: "avoid", color: "#ef4444", position: "Do not enter" };

    return {
      total: total, rawScore: rawScore,
      trendScore: trendScore, trendMax: 30,
      trendMA: trendMA, trendMACD: trendMACD, trendADX: trendADX,
      momentumScore: momentumScore, momentumMax: 30,
      momRSI: momRSI, momCCIROC: momCCIROC, momMFI: momMFI,
      volumeScore: volumeScore, volumeMax: 20,
      volOBV: volOBV, volVWAP: volVWAP, volProfile: volProfile,
      structureScore: structureScore, structureMax: 20,
      structBB: structBB, structIch: structIch, structDarvas: structDarvas,
      decision: decision
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     MULTI-TIMEFRAME ENTRY SCORE
     H×0.20 + D×0.50 + W×0.30
     Penalty/bonus modifiers
     ═══════════════════════════════════════════════════════════════════════ */
  function computeMultiTFEntryScore(candlesWeekly, indW, candlesDaily, indD, candlesHourly, indH, currentPrice) {
    var weekly = candlesWeekly && indW ? computeEntryScore(candlesWeekly, indW, currentPrice) : null;
    var daily = candlesDaily && indD ? computeEntryScore(candlesDaily, indD, currentPrice) : null;
    var hourly = candlesHourly && indH ? computeEntryScore(candlesHourly, indH, currentPrice) : null;

    var wTotal = weekly ? weekly.total : 0;
    var dTotal = daily ? daily.total : 0;
    var hTotal = hourly ? hourly.total : 0;

    var wCount = weekly ? 1 : 0;
    var dCount = daily ? 1 : 0;
    var hCount = hourly ? 1 : 0;
    var denom = wCount * 0.30 + dCount * 0.50 + hCount * 0.20;

    var baseScore = denom > 0 ? Math.round(((wTotal * 0.30 + dTotal * 0.50 + hTotal * 0.20) / denom) * 10) / 10 : 0;

    var lc = (currentPrice && currentPrice > 0) ? currentPrice : (indD ? indD.lastClose : null);

    /* ── Normalize indicator values — unavailable → 0 / false ── */
    var rsiVal = (indD && indD.rsi_14 !== null) ? indD.rsi_14 : 0;
    var dEma9 = (indD && indD.ema_9 !== null) ? indD.ema_9 : 0;
    var dEma21 = (indD && indD.ema_21 !== null) ? indD.ema_21 : 0;
    var dEma50 = (indD && indD.ema_50 !== null) ? indD.ema_50 : 0;
    var wEma9 = (indW && indW.ema_9 !== null) ? indW.ema_9 : 0;
    var wEma21 = (indW && indW.ema_21 !== null) ? indW.ema_21 : 0;
    var wEma50 = (indW && indW.ema_50 !== null) ? indW.ema_50 : 0;
    var hEma9 = (indH && indH.ema_9 !== null) ? indH.ema_9 : 0;
    var hEma21 = (indH && indH.ema_21 !== null) ? indH.ema_21 : 0;
    var hEma50 = (indH && indH.ema_50 !== null) ? indH.ema_50 : 0;

    /* ── Penalty Modifiers ── */
    var penalties = 0;
    var hardFilters = [];

    /* Overbought RSI > 80 → −5 */
    if (indD && rsiVal > 80) {
      penalties -= 5;
      hardFilters.push("RSI > 80 \u2014 RSI " + round(rsiVal,1) + " (\u22125)");
    }

    /* Volume Divergence: price up 5d, volume down 5d → −8 */
    if (candlesDaily && candlesDaily.length >= 10) {
      var priceUp5d = candlesDaily[candlesDaily.length - 1].c > candlesDaily[candlesDaily.length - 6].c;
      var volRecent = 0, volPrev = 0;
      for (var i = 0; i < 5; i++) { volRecent += candlesDaily[candlesDaily.length - 1 - i].v || 0; volPrev += candlesDaily[candlesDaily.length - 6 - i].v || 0; }
      if (priceUp5d && volRecent < volPrev) {
        var volChg = volPrev > 0 ? round((volRecent - volPrev) / volPrev * 100, 0) : 0;
        penalties -= 8;
        hardFilters.push("Volume Divergence \u2014 price up 5d, vol " + volChg + "% (\u22128)");
      }
    }

    /* Conflicting Timeframes: daily bullish but weekly bearish → −10 */
    var dailyBull = (dEma9 > 0 && dEma21 > 0 && dEma50 > 0 && dEma9 > dEma21 && dEma21 > dEma50);
    var weeklyBear = (wEma9 > 0 && wEma21 > 0 && (wEma9 < wEma21 || (wEma50 > 0 && wEma21 < wEma50)));
    if (daily && weekly && dailyBull && weeklyBear) {
      penalties -= 10;
      hardFilters.push("Conflicting Timeframes \u2014 daily EMA " + round(dEma9,0) + "/" + round(dEma21,0) + "/" + round(dEma50,0) + " vs weekly " + round(wEma9,0) + "/" + round(wEma21,0) + "/" + round(wEma50,0) + " (\u221210)");
    }

    /* Near Resistance: price within 1% of major resistance → −5 */
    if (indD && lc && lc > 0) {
      var resistances = [];
      var resistLabels = [];
      if (indD.bb && indD.bb.upper !== null) { resistances.push(indD.bb.upper); resistLabels.push("BB"); }
      if (indD.keltner && indD.keltner.upper !== null) { resistances.push(indD.keltner.upper); resistLabels.push("KC"); }
      if (indD.donchian && indD.donchian.upper !== null) { resistances.push(indD.donchian.upper); resistLabels.push("DC"); }
      for (var ri = 0; ri < resistances.length; ri++) {
        if (resistances[ri] > 0 && Math.abs(resistances[ri] - lc) / lc < 0.01) {
          var resDist = round(Math.abs(resistances[ri] - lc) / lc * 100, 2);
          penalties -= 5;
          hardFilters.push("Near Resistance \u2014 " + resistLabels[ri] + " " + round(resistances[ri],2) + " (" + resDist + "% away) (\u22125)");
          break;
        }
      }
    }

    /* Prolonged Squeeze: TTM Squeeze ON for > 10 bars → −3 */
    if (indD && indD.ttmSqueeze === true) {
      if (candlesDaily && candlesDaily.length > 10) {
        var squeezeOnCount = 0;
        var sqMomArr = calcSqueezeMomentum(candlesDaily);
        if (sqMomArr && sqMomArr.squeeze) {
          for (var si = sqMomArr.squeeze.length - 1; si >= 0; si--) {
            if (sqMomArr.squeeze[si] === true) squeezeOnCount++;
            else break;
          }
        }
        if (squeezeOnCount > 10) {
          penalties -= 3;
          hardFilters.push("Prolonged Squeeze \u2014 TTM Squeeze ON for " + squeezeOnCount + " bars (\u22123)");
        }
      }
    }

    /* ── Bonus Modifiers ── */
    var bonuses = 0;

    /* Fresh Breakout: price > 20d high + volume > 1.5x avg → +5 */
    if (candlesDaily && candlesDaily.length >= 20 && lc) {
      var high20 = 0;
      for (var i = candlesDaily.length - 20; i < candlesDaily.length; i++) { if (candlesDaily[i].h > high20) high20 = candlesDaily[i].h; }
      var avgVol20 = 0;
      for (var i = candlesDaily.length - 20; i < candlesDaily.length; i++) avgVol20 += candlesDaily[i].v || 0;
      avgVol20 = avgVol20 / 20;
      var curVol = candlesDaily[candlesDaily.length - 1].v || 0;
      if (lc > high20 && avgVol20 > 0 && curVol > avgVol20 * 1.5) {
        var volMult = round(curVol / avgVol20, 1);
        bonuses += 5;
        hardFilters.push("Fresh Breakout \u2014 price " + round(lc,2) + " > 20d high " + round(high20,2) + ", vol " + volMult + "x avg (+5)");
      }
    }

    /* Multi-TF Alignment: all 3 bullish → +5 */
    var wBull = (wEma9 > 0 && wEma21 > 0 && wEma50 > 0 && wEma9 > wEma21 && wEma21 > wEma50);
    var dBull = (dEma9 > 0 && dEma21 > 0 && dEma50 > 0 && dEma9 > dEma21 && dEma21 > dEma50);
    var hBull = (hEma9 > 0 && hEma21 > 0 && hEma50 > 0 && hEma9 > hEma21 && hEma21 > hEma50);
    if (weekly && daily && hourly && wBull && dBull && hBull) {
      bonuses += 5;
      hardFilters.push("Multi-TF Alignment \u2014 W " + round(wEma9,0)+"/"+round(wEma21,0)+"/"+round(wEma50,0) + " D " + round(dEma9,0)+"/"+round(dEma21,0)+"/"+round(dEma50,0) + " H " + round(hEma9,0)+"/"+round(hEma21,0)+"/"+round(hEma50,0) + " (+5)");
    }

    /* Smart Money + MTF Confirmation → +3 */
    var smBull = (indD && indD.smartMoney) ? (indD.smartMoney.bos === 'bullish_bos' || indD.smartMoney.choch === 'bullish_choch') : false;
    var smMTFReady = (daily && daily.trendScore >= 20) ? true : false;
    if (smBull && smMTFReady) {
      bonuses += 3;
      hardFilters.push("Smart Money + MTF \u2014 trend score " + daily.trendScore + " (+3)");
    }

    var finalScore = Math.round((baseScore + penalties + bonuses) * 10) / 10;
    finalScore = Math.max(0, Math.min(100, finalScore));

    var decision;
    if (finalScore >= 80) decision = { label: "Strong Buy", action: "strongBuy", color: "#15803d", position: "Full position (100%)" };
    else if (finalScore >= 65) decision = { label: "Buy", action: "buy", color: "#22c55e", position: "Standard position (70%)" };
    else if (finalScore >= 50) decision = { label: "Watchlist", action: "watchlist", color: "#eab308", position: "Half position (40%)" };
    else if (finalScore >= 35) decision = { label: "Neutral", action: "neutral", color: "#f97316", position: "No action" };
    else decision = { label: "Avoid", action: "avoid", color: "#ef4444", position: "Do not enter" };

    return {
      weekly: weekly, daily: daily, hourly: hourly,
      baseScore: baseScore, penalties: penalties, bonuses: bonuses,
      finalScore: finalScore, decision: decision,
      hardFilters: hardFilters, overrides: hardFilters,
      lastClose: lc
    };
  }

  return {
    calcSMA: calcSMA,
    calcEMA: calcEMA,
    calcWMA: calcWMA,
    calcVWAP: calcVWAP,
    calcRSI: calcRSI,
    calcMACD: calcMACD,
    calcATR: calcATR,
    calcBollingerBands: calcBollingerBands,
    calcADX: calcADX,
    calcSuperTrend: calcSuperTrend,
    calcIchimoku: calcIchimoku,
    calcDonchianChannels: calcDonchianChannels,
    calcKeltnerChannels: calcKeltnerChannels,
    calcOBV: calcOBV,
    calcCMF: calcCMF,
    calcStochasticRSI: calcStochasticRSI,
    calcCCI: calcCCI,
    calcROC: calcROC,
    calcMomentum: calcMomentum,
    calcParabolicSAR: calcParabolicSAR,
    calcHMA: calcHMA,
    calcKAMA: calcKAMA,
    calcTSI: calcTSI,
    calcSTC: calcSTC,
    calcMFI: calcMFI,
    calcPVT: calcPVT,
    calcKVO: calcKVO,
    calcAnchoredVWAP: calcAnchoredVWAP,
    calcVolumeProfile: calcVolumeProfile,
    calcTTMSqueeze: calcTTMSqueeze,
    calcSqueezeMomentum: calcSqueezeMomentum,
    calcDarvasBox: calcDarvasBox,
    calcSmartMoney: calcSmartMoney,
    calcMTFAlignment: calcMTFAlignment,
    computeAll: computeAll,
    interpret: interpret,
    computeExitScore: computeExitScore,
    computeEntryScore: computeEntryScore,
    computeMultiTFEntryScore: computeMultiTFEntryScore,
    round: round
  };
})();
