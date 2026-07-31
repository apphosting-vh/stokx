# StoX — Technical Indicator & Scoring Specification

> **App version:** 2.6.21  
> **Last updated:** 2026-07-31

---

## 1. Overview

The codebase at `indicators.js` (2659 lines) implements 40+ technical indicators divided into 5 sections (4.1–4.5), a session/risk-extras section (Section 5), plus two scoring systems for entry (Sections 7–11) and exit decisions. All scoring functions accept raw OHLCV candle arrays and compute indicators internally — no pre-computation required.

**Minimum data requirement:** 50 candles for any scoring function.

---

## 2. Indicator Reference (Sections 4.1–4.5 + 5)

### 2.1 Helpers

| Function | Description |
|----------|-------------|
| `closes(candles)` | Extract close prices |
| `highs(candles)` | Extract high prices |
| `lows(candles)` | Extract low prices |
| `opens(candles)` | Extract open prices |
| `volumes(candles)` | Extract volume array |
| `sma(arr, period)` | Simple Moving Average |
| `ema(arr, period)` | EWM with span = period (`adjust=false`), recursive from the first value, nulls skipped. Mirrors pandas `ewm(span=n, adjust=False)` |
| `wma(arr, period)` | Weighted Moving Average |
| `rollingStd(arr, period, ddof=1)` | Rolling standard deviation (ddof = 1, same as pandas `rolling.std()`) |
| `rollingMax(arr, period)` / `rollingMin(arr, period)` | Rolling window extrema |
| `round(val, dec)` | Round to `dec` places (default 2) |
| `lastVals(arr, count)` | Last `count` non-null values (most recent first) |

Wilder smoothing (ATR, RSI, ADX, MFI internals) is `ema` with `alpha = 1/period`.

### 2.2 Section 4.1 — Trend & Moving Averages

| Function | Defaults | Returns |
|----------|----------|---------|
| `calcSMA(candles, period=20)` | - | `number[]` |
| `calcEMA(candles, period=20)` | EWM `adjust=false` | `number[]` |
| `calcWMA(candles, period=20)` | - | `number[]` |
| `calcRollingVWAP(candles, period=10)` | - | `number[]` |
| `calcVWAP(candles)` | Shorthand for `calcRollingVWAP(10)` | `number[]` |
| `calcHMA(candles, period=20)` | Hull MA (WMA(√n) of 2×WMA(n/2) − WMA(n)) | `number[]` |
| `calcKAMA(candles, period=10, fast=2, slow=30)` | Kaufman's Adaptive MA | `number[]` |
| `calcMansfieldRS(c, idx_c, n=52)` | `(RS/avg(RS) − 1) × 100`, RS = stock close / index close | `number[]` |
| `calcPctFrom126dHigh(candles, n=126)` | `(close − 126d high) / high × 100` | `number[]` |
| `calcPctFrom126dLow(candles, n=126)` | `(close − 126d low) / low × 100` | `number[]` |
| `calcPctFrom52wHigh(candles, n=252)` | `(close / 252d max close − 1) × 100` | `number[]` |
| `calcPctFrom52wLow(candles, n=252)` | `(close / 252d min close − 1) × 100` | `number[]` |

### 2.3 Section 4.1 — Structure

| Function | Defaults | Returns |
|----------|----------|---------|
| `calcHeikinAshi(candles)` | - | `{ open, high, low, close, trend }` |
| `calcChandelierExit(candles, period=22, mult=3)` | Long + short stops | `{ long, short }` |
| `calcBeta(stockCandles, indexCandles, n=60)` | - | `number[]` |

### 2.4 Section 4.2 — Trend Direction & Strength

| Function | Defaults | Returns |
|----------|----------|---------|
| `calcTrueRange(candles)` | - | `number[]` |
| `calcATR(candles, period=14)` | Wilder EWM (`alpha = 1/period`) | `number[]` |
| `calcADX(candles, period=14)` | Wilder EWM smoothing | `{ adx, plusDI, minusDI }` |
| `calcSuperTrend(candles, period=10, multiplier=3)` | - | `number[]` |
| `calcParabolicSAR(candles)` | af=0.02, step=0.02, max=0.20 | `number[]` |
| `calcVortex(candles, period=14)` | - | `{ plus, minus }` |
| `calcAroon(candles, period=25)` | - | `{ up, down, osc }` |
| `calcIchimoku(candles)` | 9/26/52/26 | `{ tenkan, kijun, senkouA, senkouB, chikou }` |

`calcADX` returns three same-length arrays (`adx`, `plusDI`, `minusDI`) with nulls at the warm-up indices.

### 2.5 Section 4.2 — MACD, TSI, STC, AO

| Function | Defaults | Returns |
|----------|----------|---------|
| `calcMACD(candles, fast=12, slow=26, signal=9)` | - | `{ macd, signal, histogram }` |
| `calcTSI(candles, long=25, short=13)` | - | `number[]` |
| `calcSTC(candles, macdFast=23, macdSlow=50, stochPeriod=10)` | - | `number[]` |
| `calcAwesomeOscillator(candles)` | `sma(mid,5) − sma(mid,34)` | `number[]` |

### 2.6 Section 4.3 — Momentum Oscillators

| Function | Defaults | Returns |
|----------|----------|---------|
| `calcRSI(candles, period=14)` | Wilder EWM | `number[]` |
| `calcStochasticRSI(candles, rsiPeriod=14, kSmooth=3, dSmooth=3)` | - | `{ k, d }` |
| `calcWilliamsR(candles, period=14)` | - | `number[]` |
| `calcCCI(candles, period=20)` | - | `number[]` |
| `calcROC(candles, period=12)` | Rate of Change % | `number[]` |
| `calcMomentum(candles, period=10)` | Price difference | `number[]` |
| `calcMFI(candles, period=14)` | 0/0 → `null`, negMF=0 → 100 | `number[]` |
| `calcCMF(candles, period=20)` | Chaikin Money Flow | `number[]` |
| `calcForceIndex(candles, period=13)` | EMA of volume × (close − prevClose) | `number[]` |

### 2.7 Section 4.4 — Volume-Based Indicators

| Function | Defaults | Returns |
|----------|----------|---------|
| `calcOBV(candles)` | - | `number[]` |
| `calcPVT(candles)` | Price-Volume Trend, rounded to 2dp | `number[]` |
| `calcKVO(candles, fast=34, slow=55, signal=13)` | Klinger Volume Oscillator | `{ line, signal }` |
| `calcAnchoredVWAP(candles, anchorIdx=0)` | - | `number[]` |
| `calcVolumeProfile(candles, numBins=24, lookback=60)` | - | `{ bins, poc, pocVolume, vah, val, valueAreaHigh, valueAreaLow }` |
| `calcTTMSqueeze(candles, bbPeriod=20, bbMult=2, kcMult=1.5)` | - | `boolean[]` |
| `calcSqueezeMomentum(candles)` | Linear-regression slope × bars | `{ values, squeeze }` |
| `calcAccumDistComposite(candles)` | CMF20 (±0.05), OBV slope (5-bar diff), FI13, MFI14 (55/45) | `label` (ACCUMULATION/DISTRIBUTION/NEUTRAL) |

`calcKVO` uses the Klinger formula: `cm = (h + l + c) / 3`, `dm = |h − l|`, `trend = sign(cm − cm_prev)`, `vf = v × |2 × (dm/cm) − 1| × trend × 100`, then `line = EWM(vf, 34) − EWM(vf, 55)`, `signal = EWM(line, 13)`. Both rounded to 0dp.

`calcVolumeProfile` also exposes `valueAreaHigh` / `valueAreaLow` as aliases of `vah` / `val` for UI compatibility. The value area covers 70% of volume.

### 2.8 Section 4.5 — Structure & Volatility

| Function | Defaults | Returns |
|----------|----------|---------|
| `calcBollingerBands(candles, period=20, mult=2)` | std with ddof=1 | `{ upper, middle, lower, bandwidth }` |
| `calcKeltnerChannels(candles, period=20, mult=1.5)` | uses `ATR(period)` | `{ upper, middle, lower }` |
| `calcDonchianChannels(candles, period=20)` | - | `{ upper, middle, lower }` |
| `calcDarvasBox(candles, boxPeriod=20, confirmBars=3)` | recentLow over last `confirmBars` | `{ boxTop, boxBottom, top, bottom, boxRange, position, breakout, pctFromTop }` |
| `calcFibonacci(candles)` | Last 50 bars | `{ swingHigh, swingLow, retrace, extension }` |
| `calcPivotPoints(candles)` | Previous day | `{ classic: { P, R1–R3, S1–S3 }, camarilla: {…} }` |
| `calcWilliamsFractals(candles)` | - | `{ up, down }` |
| `calcZigZag(candles, pct=5%)` | Pivot threshold | `{ highs, lows }` (pivot indices) |
| `calcChoppinessIndex(candles, period=14)` | - | `number[]` |
| `calcSmartMoney(candles)` | Order blocks, BOS, CHOCH | `{ orderBlocks, bos, choch, swings }` |
| `calcMTFAlignment(candles)` | EMA9/21/50, SMA100/200 vs close | `number` (0–100%) |
| `calcWeek52HL(candles)` | - | `{ high52w, low52w, pctFromHigh, pctFromLow }` |
| `calcRelativeStrength(stockCandles, indexCandles)` | Mansfield uses 52-week window | `{ rs, mansfield }` |

### 2.9 Section 5 — Session & Risk Extras

| Function | Defaults | Returns |
|----------|----------|---------|
| `calcSessionVWAP(candles)` | Cumulative TP×V / V, resets at ISO-date session boundary | `number[]` |
| `calcDetectSpike(candles, lookback=20, spikeStdMult=2.5, atrMult=2.5)` | Flag when `\|ret\| > 2.5×rollingStd` **and** `\|ret\| > 2.5×ATR14%` | `boolean[]` |
| `calcStabilityScore(candles, lookback=10)` | `0.6×posFrac + 0.4×max(0, 1 − cv/2)`; 0 if mean ret ≤ 0, σ=0, or insufficient bars | `number` (0–1, rounded 2dp) |

### 2.10 Aggregation

| Function | Description |
|----------|-------------|
| `computeAll(candles)` | Computes all indicators; returns flat object with latest values (incl. `pct_from_52w_high`, `pct_from_52w_low`, `session_vwap`, `spike`, `stabilityScore`, `roc_12`, `kvo`/`kvoSignal`) |
| `computeAllWithIndex(candles, indexCandles)` | Same as `computeAll` + `rs_vs_nifty` + `beta_nifty` |
| `interpret(ind)` | Returns bullish/bearish/neutral signal per indicator |

---

## 3. Entry Score — `computeEntryScore(candles, indexCandles?)`

Implements spec Sections 7–11.

### 3.1 Architecture

```
Raw candles (≥50 bars)
  │  buildTFSnapshot(candles, indexCandles?) → sn   // single-pass indicator snapshot
  │
  ├─ Pillar 1: Trend (30 pts)
  │    ├─ scoreMaStackForTF(sn)        10 pts   (7.1)
  │    ├─ scoreMacdTsiStcAo(sn)        10 pts   (7.2)
  │    └─ scoreAdxStPsarViAroon(sn)    10 pts   (7.3)
  │
  ├─ Pillar 2: Momentum (30 pts)
  │    ├─ scoreRsiStochRsiWillR(sn)    10 pts   (8.1)
  │    ├─ scoreCciRocMomFi(sn)         10 pts   (8.2)
  │    └─ scoreMfiCmf(sn)              10 pts   (8.3)
  │
  ├─ Pillar 3: Volume (20 pts)
  │    ├─ scoreObvPvtKvo(sn)            8 pts   (9.1)
  │    ├─ scoreVwapAnchored(sn)         6 pts   (9.2)
  │    └─ scoreVpSqueezeAd(sn)          6 pts   (9.3)
  │
  └─ Pillar 4: Structure (20 pts)
       ├─ scoreBbKcDcChandelier(sn)     8 pts   (10.1)
       ├─ scoreIchimoku(sn)             6 pts   (10.2)
       └─ scoreDarvasStructure(sn)      6 pts   (10.3)
```

**Raw total:** 100 points (30 + 30 + 20 + 20)

All 12 sub-scores plus the Section-11 spike/stability sub-scores are produced per timeframe by `scoreEntryComponentsForTF(candles, indexCandles?, stabLookback)`. In the single-TF `computeEntryScore` they are summed into pillars directly; in the multi-TF path each sub-score is aggregated across H/D/W (see 5.1).

### 3.2 Classification Thresholds

| Classification | Score Range | Allocation % | Signal |
|---------------|-------------|--------------|--------|
| **STRONG_BUY** | ≥ 80 | 100% | STRONG_BUY |
| **BUY** | ≥ 65 | 70% | BUY |
| **WATCHLIST** | ≥ 50 | 40% | WATCHLIST |
| **NEUTRAL** | ≥ 35 | 0% | NEUTRAL |
| **AVOID** | < 35 | 0% | AVOID |

### 3.3 Score Formula

```
finalScore = clamp(rawTotal + penalties + bonuses, 0, 100)

where:
  rawTotal = trendScore(0-30) + momentumScore(0-30)
           + volumeScore(0-20) + structureScore(0-20)
  penalties ≤ 0
  bonuses ≥ 0
```

### 3.4 Penalty Rules

| # | Condition | Penalty |
|---|-----------|---------|
| 1 | RSI(14) > 80 (overbought) | −5 |
| 2 | Last 5 closes all rising AND last 5 volumes all declining | −8 |
| 3 | Weekly trend bearish AND daily bullish (weekly close < weekly EMA21 while daily close > daily EMA21) | −10 |
| 4 | Price within 1% below pivot R1 | −5 |
| 5 | Squeeze on for more than 10 bars | −3 |
| 6 | Beta > 1.5 AND ATR% > 3.0% (volatility spike) | −3 |
| 7 | Spike sub-score ≥ 7 (weighted, latest session spiked) | −15 |
| 8 | Spike sub-score ≥ 4 (weighted, spike fading) | −8 |
| 9 | Spike sub-score ≥ 2 (weighted, minor recent spike) | −4 |
| 10 | Stability sub-score ≥ 7 (erratic, weighted) | −10 |
| 11 | Stability sub-score ≥ 5 (moderately erratic, weighted) | −5 |

**Spike sub-score (0–10, higher = worse):** per TF, `calcDetectSpike(candles, 20, 2.5, 2.5)` → latest spike +5, prior-bar spike +3, any spike in the last 20 bars +2 (capped 10). **Stability sub-score (0–10, higher = worse):** `(1 − calcStabilityScore(candles, lookback)) × 10`, lookback 10 for H/D and 6 for W. Both are weighted `H×0.20 + D×0.50 + W×0.30` (renormalized over available TFs) before the thresholds above are applied.

The single-TF function proxies weekly trend with `close < SMA50` and daily bullish with `close > HMA16`; the multi-TF path recomputes rule 3 on real weekly/daily data (close vs own EMA21).

### 3.5 Bonus Rules

| # | Condition | Bonus |
|---|-----------|-------|
| 1 | Price > Donchian (20) upper AND volume > 1.5× avg(20) (20-day-high breakout on volume) | +5 |
| 2 | All timeframes bullish (H/D/W close > own EMA21) | +5 |
| 3 | `index_trend_score` > 60 | +3 |
| 4 | Accumulation label AND MTF Alignment > 80 | +3 |
| 5 | RS Mansfield > 5 AND Aroon Osc > 50 | +3 |
| 6 | Price > Pivot R1 AND > Fib 0.618 | +2 |

`index_trend_score` (0–100) = % of: EMA9 > EMA21 > EMA50 on the daily index, MACD > signal on the daily index, and price > EMA21 on the weekly index. The earnings-clarity bonus from the original draft is dropped entirely.

### 3.6 Component Scoring

**7.1 MA Stack (10 pts)** — `scoreMaStackForTF(sn)` (consumes a `buildTFSnapshot` snapshot)

| # | Condition | Points |
|---|-----------|--------|
| 1 | close > EMA9 | 0.5 |
| 2 | close > EMA21 | 0.5 |
| 3 | close > EMA50 | 0.5 |
| 4 | close > SMA200 | 0.5 |
| 5 | EMA9 > EMA21 > EMA50 | 2.0 |
| 6 | EMA9 > EMA21 OR EMA21 > EMA50 (partial) | 1.0 |
| 7 | SMA20 > SMA50 > SMA200 | 2.0 |
| 8 | SMA20 > SMA50 (partial) | 1.0 |
| 9 | Fast MAs bullish (close > HMA16, KAMA10, WMA20) × 0.67 each | cap 2.0 |
| 10 | HMA16 > prev HMA16 | 0.5 |
| 11 | RS Mansfield (52) > 0 | 0.5 |
| 12 | RS Mansfield > prev RS Mansfield | 0.5 |

Capped at 10.

**7.2 MACD + TSI + STC + AO (10 pts)** — MACD line > signal (1.0); MACD > 0 (0.5); histogram > 0 and rising (0.5); MACD crossed above signal within 3 bars (0.5); TSI > 0 (0.5); TSI rising while > 0 (0.5); TSI crossed zero within 3 bars (0.5); STC > 50 (0.5); STC rising (0.5); STC > 75 (0.5); STC crossed 25 within 3 bars (0.5); AO > 0 (0.5); AO rising (0.5); AO crossed zero (0.5); confluence ≥ 3 bullish (1.0).

**7.3 ADX + Supertrend + PSAR + Vortex + Aroon (10 pts)** — ADX ≥ 40 (1.0) or ≥ 25 (0.5); +DI > −DI (0.5); ADX rising with +DI > −DI (0.5); close > Supertrend (1.0); Supertrend flip to long (0.5); close > PSAR (0.5); PSAR flip to long (0.5); +VI > −VI (1.0); +VI rising & −VI falling (0.5); Aroon Osc > 50 (1.0) or > 0 (0.5); Aroon rising above 0 (0.5); all-bull confluence (1.0).

**8.1 RSI + StochRSI + Williams %R (10 pts)** — RSI 60–75 (2.0), 55–60 or 75–80 (1.0), 50–55 (0.5); RSI rising above 50 (1.0); RSI crossed 50 (0.5); StochRSI K > D (1.0); K 50–80 (0.5); K rising (0.5); W%R −50..−20 (1.0), −80..−50 (0.5); W%R rising above −50 (0.5); W%R > −20 (0.5); confluence (0.5).

**8.2 CCI + ROC + Momentum + Force Index (10 pts)** — CCI 100–200 (1.5), 50–100 (1.0), 0–50 (0.5); CCI rising above 0 (0.5); ROC > 0 and rising (1.5) or ROC > 0 (0.5); ROC > 2 (0.5); Momentum > 0 and rising (1.5) or > 0 (0.5); FI13 > 0 and rising (1.5) or > 0 (0.5); FI crossed 0 (0.5); all four positive (1.0).

**8.3 MFI + CMF (10 pts)** — MFI 60–80 (2.5), 50–60 (1.5), 40–50 or > 80 (1.0); MFI rising above 50 (1.5); MFI crossed 50 (1.0); CMF > 0.10 (2.0), > 0.05 (1.5), > 0 (1.0); CMF rising above 0 (1.0); MFI > 50 & CMF > 0 (0.5).

**9.1 OBV + PVT + KVO (8 pts)** — OBV > SMA20(OBV) (1.0); OBV slope > 0 (0.5); OBV slope rising (0.5); PVT > SMA20(PVT) (1.0); PVT slope > 0 (1.0); PVT slope rising (0.5); KVO > signal (1.5); KVO > 0 (0.5); KVO rising (0.5); KVO crossed signal within 3 bars (1.0).

**9.2 VWAP + Anchored VWAP (6 pts)** — close > VWAP10 (1.5, +0.5 if 0.5–3% above); VWAP10 rising (0.5); close > anchored VWAP (1.5); anchored VWAP rising (0.5); close above both (1.0).

**9.3 Volume Profile + TTM Squeeze + Accum/Dist (6 pts)** — close > POC (1.0); close > VAH (0.5); POC rising (0.5); squeeze released (1.0) or on (0.5); squeeze-momentum rising above 0 (1.5) or above 0 (0.5); ACCUMULATION label (1.5).

**10.1 BB + KC + Donchian + Chandelier (8 pts)** — BB position 0.5–0.8 (1.0) or 0.3–0.5 (0.5); BB width expanding (0.5); close > KC mid (0.5); close > KC upper (0.5); close ≥ 99% of Donchian upper (1.0) or > DC mid (0.5); close > Chandelier long (1.0); Chandelier rising (0.5); BB inside KC (0.5); ATR% 2–4% (0.5); Donchian breakout with BB width expanding (1.0).

**10.2 Ichimoku (6 pts)** — close above cloud top (2.0) or above cloud bottom (0.5); Tenkan > Kijun (1.0); Tenkan crossed Kijun within 3 bars (0.5); SenkouA > SenkouB (1.0); Chikou > prev close (0.5); full confluence (1.0).

**10.3 Darvas + HMA + KAMA + Fib + Pivot + ZigZag + Choppiness + MTF (6 pts)** — close ≥ Darvas top (1.5) or > box mid (0.5); close > HMA16 (0.25); HMA16 rising (0.25); close > KAMA10 (0.25); KAMA10 rising (0.25); fib bounce at 0.382/0.5/0.618 within 0.5% with close rising (0.5); close > pivot P (0.25); close > pivot R1 (0.25); Choppiness < 38.2 (0.5) or < 50 (0.25); ZigZag direction UP (0.5); MTF Alignment ≥ 80 (1.0) or ≥ 60 (0.5).

### 3.7 Return Shape

```typescript
{
  entry_score: number,           // 0-100 final score
  raw_score: number,             // raw total before adjustments
  trend: number,                 // pillar 1 (0-30)
  momentum: number,              // pillar 2 (0-30)
  volume: number,                // pillar 3 (0-20)
  structure: number,             // pillar 4 (0-20)
  penalties: number,             // net penalty (≤ 0)
  bonuses: number,               // net bonus (≥ 0)
  penalty_items: [{ reason: string, amount: number }],
  bonus_items: [{ reason: string, amount: number }],
  classification: string,        // STRONG_BUY | BUY | WATCHLIST | NEUTRAL | AVOID
  signal: string,                // same as classification
  allocation_pct: number,        // 100 | 70 | 40 | 0 | 0
  details: {
    maStack: number,             // + 11 other sub-scores (see 3.6)
    spike: number,               // spike sub-score 0-10 (higher = worse)
    stability: number,           // stability sub-score 0-10 (higher = worse)
    indexTrendScore: number | null
  }
}
```

---

## 4. Exit Score — `computeExitScore(candles, position, indexCandles?)`

### 4.1 Position Object

```typescript
position: {
  entry_price: number,        // buy price
  holding_days: number,       // days since entry
  entry_score?: number        // entry score at time of purchase (default 50)
}
```

### 4.2 Architecture

```
Raw candles (≥50 bars) + position
  │
  ├─ buildTFSnapshot(candles, indexCandles?)      ← one-pass indicator snapshot
  │
  ├─ Pillar 1: Trend Breakdown (25 pts)
  │    ├─ scoreExitTrendBreakdown()              7 pts   (12.1a MA crosses + stack collapse)
  │    ├─ scoreExitMacdTsiStcAo()                9 pts   (12.1b MACD + TSI + STC + AO rollover)
  │    └─ scoreExitAdxSupertrendPsarViAroon()    9 pts   (12.1c ADX + Supertrend + PSAR + Vortex + Aroon)
  │
  ├─ Pillar 2: Momentum Exhaustion (25 pts)
  │    ├─ scoreExitRsiStochRsiWillr()           10 pts   (13.1 RSI + StochRSI + Williams %R)
  │    ├─ scoreExitCciRocMomFi()                 8 pts   (13.2 CCI + ROC + Momentum + Force Index)
  │    └─ scoreExitMfiCmf()                      7 pts   (13.3 MFI + CMF outflow)
  │
  ├─ Pillar 3: Volume Distribution (25 pts)
  │    ├─ scoreExitObvPvtKvoFi()                 9 pts   (14.1 OBV + PVT + KVO + Force Index)
  │    ├─ scoreExitVwapAvwap()                   7 pts   (14.2 VWAP + Anchored VWAP break)
  │    └─ scoreExitSqueezeDist()                 9 pts   (14.3 TTM Squeeze + distribution confirmation)
  │
  └─ Pillar 4: Structure Breakdown (25 pts)
       ├─ scoreExitBbKcDcChandelier()           9 pts   (15.1 BB + KC + DC + Chandelier)
       ├─ scoreExitIchimoku()                   6 pts   (15.2 Ichimoku bearish flip)
       └─ scoreExitDarvasStructure()           10 pts   (15.3 Darvas + HMA + KAMA + MTF + Fib + Pivot)
  │
  └─ Section 16 modifiers on the snapshot:
       ├─ buildExitPenaltyItems(sn, ctx)        (index_trend_score driven, ≤ 0)
       └─ buildExitBonusItems(sn, ctx)          (≥ 0)
```

All 12 sub-scores are module-level functions taking a `buildTFSnapshot` result; `scoreExitComponentsForTF(sn, position)` returns them as a single object. `computeExitScore` computes the 4 pillar caps, applies Section 16 modifiers, and classifies.

**Raw total:** 100 points (4 pillars × 25 max each)

### 4.3 Classification Thresholds

| Classification | Score Range | Action |
|---------------|-------------|--------|
| **URGENT_EXIT** | ≥ 85 | Full exit immediately |
| **EXIT** | ≥ 70 | Full exit at current price or next bar open |
| **PARTIAL_EXIT** | ≥ 55 | Exit 50%, tighten trailing stop to 1.5× ATR(14) |
| **TIGHTEN_STOP** | ≥ 40 | Move stop to breakeven or 1.3× ATR(14) below current |
| **MONITOR** | ≥ 25 | No action — watch for escalation |
| **HOLD** | < 25 | All conditions intact — continue holding |

### 4.4 Score Formula

```
finalScore = clamp(rawTotal + penalties + bonuses, 0, 100)

where:
  rawTotal = trendBreakdown(0-25) + momentumExhaustion(0-25)
           + volumeDistribution(0-25) + structureBreakdown(0-25)
  penalties ≤ 0
  bonuses ≥ 0
```

### 4.5 Penalty Rules (Section 16 — `buildExitPenaltyItems(sn, ctx)`)

| # | Condition | Penalty |
|---|-----------|---------|
| 1 | `index_trend_score` ≥ 65 | −8 |
| 2 | EMA9 > EMA21 AND MACD > signal (only when rule 1 does not fire) | −5 |
| 3 | 3 consecutive price declines AND volume < 70% of avg(20) | −6 |
| 4 | Price within 1.5% above pivot S1 | −5 |
| 5 | Held < 3 days AND entry score > 70 | −5 |
| 6 | Price above pivot P AND above Fib 0.618 | −3 |

`ctx = { indexTrendScore, entryPrice, currentPrice, holdingDays, entryScore }`.
`index_trend_score` = `computeEntryScore(indexCandles).entry_score` (fallback from the same source as the entry engine's index trend). Rules 1 and 2 are mutually exclusive (rule 2 only fires when the index is not strongly bullish).

### 4.6 Bonus Rules (Section 16 — `buildExitBonusItems(sn, ctx)`)

| # | Condition | Bonus |
|---|-----------|-------|
| 1 | `index_trend_score` < 35 | +5 |
| 2 | Distribution day ratio ≥ 0.6 | +5 |
| 3 | Price < entry price × 0.97 (3%+ loss) | +5 |
| 4 | Price < entry price × 0.985 (1.5–3% loss) | +3 |
| 5 | Price < HMA16 (daily) AND < EMA9 (hourly) | +5 |
| 6 | Distribution label AND MTF Alignment < 40 | +3 |
| 7 | Beta > 1.5 AND `index_trend_score` < 40 | +3 |
| 8 | Price < Chandelier long AND < pivot S1 | +3 |
| 9 | KVO bearish cross (line < signal, prior bar above) | +3 |

Note: bonuses 3 and 4 are mutually exclusive (only the higher applies).

### 4.7 Return Shape

```typescript
{
  exit_score: number,              // 0-100 final score
  raw_score: number,               // raw total before adjustments
  trend_breakdown: number,         // pillar 1 (0-25)
  momentum_exhaustion: number,     // pillar 2 (0-25)
  volume_distribution: number,     // pillar 3 (0-25)
  structure_breakdown: number,     // pillar 4 (0-25)
  penalties: number,               // net penalty (≤ 0)
  bonuses: number,                 // net bonus (≥ 0)
  classification: string,          // URGENT_EXIT | EXIT | PARTIAL_EXIT | TIGHTEN_STOP | MONITOR | HOLD
  signal: string,                  // same as classification
  action: string,                  // human-readable action description
  details: {
    maBreakdown: number,
    macdTsiStcAoExit: number,
    adxStPsarViAroonExit: number,
    rsiStochRsiWillrExit: number,
    cciRocMomFiExit: number,
    mfiCmfExit: number,
    obvPvtKvoFiExit: number,
    vwapAvwapExit: number,
    squeezeDistExit: number,
    bbKcDcChandelierExit: number,
    ichimokuExit: number,
    darvasStructureExit: number
  }
}
```

---

## 5. Multi-Timeframe Aggregation

### 5.1 Entry — `computeMultiTFEntryScore(tfResults, indexCandles?, indexWeeklyCandles?)`

Every sub-score — all 12 spec components (7.1–10.3) **and** the spike/stability sub-scores — is computed per timeframe and aggregated with the same weights:

**Timeframe weights:**

| Timeframe | Weight |
|-----------|--------|
| Hourly (H) | **20%** |
| Daily (D) | **50%** |
| Weekly (W) | **30%** |

```
comp[tf]   = scoreEntryComponentsForTF(tf.candles, index_tf, stabLookback(tf))
             // 12 sub-scores + spike + stability; stabLookback = 10 (H/D), 6 (W)
sub[key]   = Σ(comp[tf][key] × w[tf]) / Σ(w[tf])          // renormalized over available TFs
trendScore = sub.maStack + sub.macdTsiStcAo + sub.adxStPsarViAroon
momentumScore = sub.rsiStochRsiWillR + sub.cciRocMomFi + sub.mfiCmf
volumeScore = sub.obvPvtKvo + sub.vwapAnchored + sub.vpSqueezeAd
structureScore = sub.bbKcDcChandelier + sub.ichimoku + sub.darvasStructure
finalScore = clamp(rawTotal + penalties + bonuses, 0, 100)
```

- The weekly-trend penalty (rule 3 in 3.4) uses the **real weekly close vs weekly EMA21** and **real daily close vs daily EMA21**.
- The all-TF bullish bonus uses **actual H/D/W closes vs their own EMA21**.
- Spike/stability penalty thresholds (rules 7–11 in 3.4) consume the **weighted** sub-scores.
- The per-TF snapshot's RS contribution uses the matching index timeframe where available (daily index for D, weekly index for W, none for H).
- `index_trend_score` is computed from the daily **and** weekly index (`indexWeeklyCandles`).
- When only some timeframes are available, the weights are renormalized over those present (e.g. D-only → 100% D).

**Return shape:**

```typescript
{
  multiTF_score: number,           // 0-100 final score
  raw_score: number,               // raw total before adjustments
  trend: number,                   // pillar 1 (0-30)
  momentum: number,                // pillar 2 (0-30)
  volume: number,                  // pillar 3 (0-20)
  structure: number,               // pillar 4 (0-20)
  maStackCrossTF: number,          // cross-TF MA-stack sub-score (0-10)
  penalties: number,               // net penalty (≤ 0)
  bonuses: number,                 // net bonus (≥ 0)
  penalty_items: [{ reason, amount }],
  bonus_items: [{ reason, amount }],
  classification: string,          // same thresholds as 3.2
  signal: string,
  allocation_pct: number,
  indexTrendScore: number | null,
  timeframesUsed: number,
  details: [{                      // per-TF rows for UI / compat
    timeframe: string,             // 'H' | 'D' | 'W'
    entryScore: number, trend: number, momentum: number,
    volume: number, structure: number,
    penalties: number, bonuses: number, raw_score: number,
    classification: string, allocation_pct: number
  }]
}
```

### 5.2 Exit — `computeMultiTFExitScore(tfResults, position, indexCandles?)`

**Weights:**

| Timeframe | Weight |
|-----------|--------|
| Hourly (H) | **25%** |
| Daily (D) | **50%** |
| Weekly (W) | **25%** |

**Formula:**

```
For each timeframe (H/D/W with weight w):
  sn[tf]    = buildTFSnapshot(tf.candles, indexCandles)
  comps[tf] = scoreExitComponentsForTF(sn[tf], position)   // same 12 sub-scores as single-TF
  score[tf] = min(12.1a+12.1b+12.1c, 25) + min(13.1+13.2+13.3, 25)
            + min(14.1+14.2+14.3, 25) + min(15.1+15.2+15.3, 25)

multiTF_raw = Σ(score[tf] × w[tf]) / Σ(w[tf])              // renormalized over available TFs

Section 16 modifiers are applied ONCE on the primary (Daily) snapshot:
  finalScore = clamp(multiTF_raw + penalties + bonuses, 0, 100)
```

Each pillar is the weighted average of its three sub-scores (also renormalized, capped at 25). Classification thresholds are the same as single-TF exit (≥85 / ≥70 / ≥55 / ≥40 / ≥25). When only some timeframes are available the weights renormalize over those present (e.g. D-only → 100% D).

**Return shape:**

```typescript
{
  multiTF_exit_score: number,           // final 0-100 (raw + one modifier pass)
  trend_breakdown: number,              // weighted avg pillar (0-25)
  momentum_exhaustion: number,
  volume_distribution: number,
  structure_breakdown: number,
  raw_score: number,                    // weighted raw before modifiers
  penalties: number,                    // net penalty (≤ 0)
  bonuses: number,                      // net bonus (≥ 0)
  penalty_items: [{ reason, amount }],
  bonus_items: [{ reason, amount }],
  classification: string,
  signal: string,
  action: string,
  timeframesUsed: number,
  details: [{
    timeframe: string,
    weight: string,
    exitScore: number,
    trend_breakdown: number,
    momentum_exhaustion: number,
    volume_distribution: number,
    structure_breakdown: number,
    classification: string
  }]
}
```

---

## 6. Public API (window.TechIndicators)

```typescript
{
  // Indicator computation
  computeAll(candles): object
  computeAllWithIndex(candles, indexCandles): object
  interpret(ind): object

  // Individual indicators (all 45+ functions)
  calcSMA, calcEMA, calcWMA, calcHMA, calcKAMA,
  calcMansfieldRS, calcPctFrom126dHigh, calcPctFrom126dLow,
  calcPctFrom52wHigh, calcPctFrom52wLow,
  calcHeikinAshi, calcChandelierExit, calcBeta,
  calcATR, calcTrueRange, calcADX, calcSuperTrend, calcParabolicSAR,
  calcVortex, calcAroon, calcIchimoku, calcMACD, calcTSI, calcSTC,
  calcAwesomeOscillator, calcRSI, calcStochasticRSI, calcWilliamsR,
  calcCCI, calcROC, calcMomentum, calcMFI, calcCMF, calcForceIndex,
  calcOBV, calcPVT, calcKVO, calcAnchoredVWAP, calcVolumeProfile,
  calcSqueezeMomentum, calcAccumDistComposite,
  calcBollingerBands, calcKeltnerChannels, calcDonchianChannels,
  calcDarvasBox, calcFibonacci, calcPivotPoints, calcWilliamsFractals,
  calcZigZag, calcChoppinessIndex, calcSmartMoney, calcMTFAlignment,
  calcWeek52HL, calcRelativeStrength,
  calcSessionVWAP, calcDetectSpike, calcStabilityScore,

  // Scoring
  computeEntryScore(candles, indexCandles?): EntryScore
  computeExitScore(candles, position, indexCandles?): ExitScore
  computeMultiTFEntryScore(tfResults, indexCandles?, indexWeeklyCandles?): MultiTFEntryScore
  computeMultiTFExitScore(tfResults, position, indexCandles?): MultiTFExitScore
}
```

---

## 7. Migration Notes (Old → New API)

| Aspect | Old | New |
|--------|-----|-----|
| `computeEntryScore` signature | `(candles, ind, lastClose)` | `(candles, indexCandles?)` |
| `computeExitScore` signature | `(candles, ind, position)` | `(candles, position, indexCandles?)` |
| `computeMultiTFEntryScore` signature | `(wData, wInd, dData, dInd, hData, hInd, lc)` | `(tfResults[], indexCandles?, indexWeeklyCandles?)` |
| `computeMultiTFExitScore` signature | `(wData, wInd, dData, dInd, hData, hInd, ep, d, es)` | `(tfResults[], position, indexCandles?)` |
| Pre-computed `ind` required | Yes (caller calls `TI.computeAll`) | No (functions compute internally) |
| Score field name | `total` | `entry_score` / `exit_score` |
| Decision field | `decision: { label, color }` | `classification: string` |
| Pillar field names | `trendScore` / `trendMax` | `trend` (max always implicit) |
| `tfResults[]` format | N/A | `{ timeframe: 'H'\|'D'\|'W', candles: [] }` |
| Mansfield period | 8 | 52 |
| ROC field | `roc_10` | `roc_12` |
| Momentum pillar max | 25 | 30 |
| Entry penalties | RSI > 78, weekly-bull clash, ROC bonus | RSI > 80, spike/stability penalties, index_trend_score bonus |
