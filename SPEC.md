# StoX — Technical Indicator & Scoring Specification

> **App version:** 2.7.0  
> **Last updated:** 2026-08-01

---

## 1. Overview

The codebase at `indicators.js` implements 40+ technical indicators divided into 5 sections (4.1–4.5), a session/risk-extras section (Section 5), plus two scoring systems for entry (three-pillar model) and exit decisions. All scoring functions accept raw OHLCV candle arrays and compute indicators internally — no pre-computation required.

**Minimum data requirement:** 50 candles for any scoring function. Enforced at **every scoring entry point**: `computeEntryScore` / `computeExitScore` return `insufficient_data` below 50; `computeMultiTFEntryScore` / `computeMultiTFExitScore` omit any TF below 50 and return `no_valid_scores` when none qualify; the `computeCompat*` wrappers pre-filter each TF at `>= 50` and return `null`/`no_valid_scores` when nothing qualifies; `integratedExitDecision` inherits the guard transitively. The session/horizon helpers (`computeSessionConfidence`, `computeHorizonConfidence`, `computeForwardConfidence`, `computeTenDayForwardConfidence`, `computeOptimumEntryPrice`) are **not** part of the scoring engines and use their own documented thresholds (hourly ≥ 60 bars; daily context ≥ 30 bars, degrading gracefully to `false`/`null` when absent).

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
| `calcAnchoredVWAP(candles, anchorIdx?)` | anchorIdx defaults to the start of the trailing 252 sessions (`max(0, len−252)`), null-prefixed before the anchor | `number[]` |
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
| `calcDarvasBox(candles, boxPeriod=20, confirmBars=3)` | box top = most recent `boxPeriod`-bar swing high that **held** `confirmBars` (fallback: rolling max); box bottom = lowest low since that high | `{ boxTop, boxBottom, top, bottom, boxRange, position, breakout, pctFromTop }` |
| `calcFibonacci(candles)` | Last 50 bars | `{ swingHigh, swingLow, retrace, extension }` |
| `calcPivotPoints(candles)` | Previous day | `{ classic: { P, R1–R3, S1–S3 }, camarilla: {…} }` |
| `calcWilliamsFractals(candles)` | - | `{ up, down }` |
| `calcZigZag(candles, pct=5%)` | Pivot threshold; multi-TF entry path scales per timeframe (H=2%, D=3%, W=5%) | `{ highs, lows }` (pivot indices) |
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

Three-pillar model: **Trend Health (30) + Pullback Quality (30) + 4% Probability (40)**, adjusted by a small set of modifiers. The earlier 12-sub-score design (spec Sections 7–10) is retired; its functions remain in the codebase as internal `computeEntryScoreLegacy` / `computeMultiTFEntryScoreLegacy` dead code (not exported).

### 3.1 Architecture

```
Raw candles (≥50 bars)
  │  buildEntrySnapshot(candles, indexCandles?, tf) → sn   // slim single-pass snapshot
  │
  ├─ Pillar 1: Trend Health (30 pts)
  │    ├─ close > SMA50                                        +5
  │    ├─ SMA20 > SMA50                                        +5
  │    ├─ close > SMA20  OR  close > AnchoredVWAP              +5
  │    ├─ ADX14 ≥ 25 AND +DI > −DI                             +5
  │    ├─ Mansfield RS(52w) > −5                               +5
  │    ├─ MACD(12,26,9) > signal                               +5
  │    ├─ weekly Heikin-Ashi bullish (synthesized from daily, D TF only)  +2.5
  │    └─ SMA20 5-bar slope > 0 AND close > SMA20              +2.5
  │
  ├─ Pillar 2: Pullback / Setup Quality (30 pts)
  │    ├─ close within ±2% of buyRef (SMA20, else lower BB)  +10
  │    ├─ bullish candle (close > open)                        +5
  │    ├─ Bollinger width < 5 bars ago                         +5
  │    ├─ StochRSI K < 20  OR  RSI14 < 40                      +5
  │    └─ volume > 1.5× avg(20) AND close > open               +5
  │
  └─ Pillar 3: 4% Probability (40 pts)
       ├─ (0.04·close)/ATR14 > 1.5                             +15
       ├─ close 0.5–4% below target4 = buyRef·1.04             +10
       ├─ ATR10 1.5%–3.5% of price                             +10
       └─ efficiency_ratio_10 > 0.4                             +5
```

**Raw total:** 100 points (30 + 30 + 40), each pillar capped at its max.

Each pillar is computed per timeframe by `scoreEntryPillarsForTF(candles, indexCandles, tf)`. In the single-TF `computeEntryScore` the pillars are summed directly; in the multi-TF path each pillar is aggregated D/H/W with weights and renormalized over the available timeframes (see 5.1). Modifiers run once on the Daily snapshot only.

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
finalScore = clamp(rawTotal + modifiers, 0, 100)
           = clamp(rawTotal + penalties + bonuses, 0, 100)

where:
  rawTotal = trendHealth(0-30) + pullbackQuality(0-30) + prob4(0-40)
  penalties = Σ(negative modifiers) ≤ 0
  bonuses   = Σ(positive modifiers) ≥ 0
```

### 3.4 Modifiers (penalties)

The framework uses exactly four modifiers — three penalties and one bonus. Each is applied as-is (no per-item cap above the listed magnitude); the final score is clamped to [0, 100].

| # | Condition | Penalty |
|---|-----------|---------|
| 1 | Low beta trap — Beta < 0.5 AND ATR10 < 1.5% of price (unlikely to deliver the 4% move in 2 weeks) | −10 |
| 2 | Spike day — latest bar is a volatility-adaptive spike (`calcDetectSpike`) OR open gap > 3% (never chase a spike; wait for the pullback) | −10 |
| 3 | Stability risk — `calcStabilityScore(candles, 20) < 0.3` (highly erratic action is unsuitable for a measured 4% target) | −15 |

Rules 1–3 take the base snapshot directly (daily-preferred in the multi-TF path).

**Spike/Stability Guard (daily, once per session):** `computeSpikeGuard(dailyCandles)` returns `todaySpike`, `dominanceRatio`, `efficiencyRatio10`, `sessionReturnPct` (latest-session `(c − prevClose)/prevClose·100`, used by exit Guard E1), and `gapPct`. When daily candles are absent the guard is **disabled entirely** (returns neutral values): the hard gate is a daily-only concept, and running the 2.5× rolling-std window on 20 hourly/weekly bars would be a materially different (more/less sensitive) signal. Per-TF spike/stability **modifiers** still run independently on each timeframe's own window.
- `todaySpike` = latest-bar spike (volatility-adaptive) **or** open-gap trigger `|gap%| > max(3.5, 1.5·ATR%)`. When true, a **hard gate** caps the final score at **49 (NEUTRAL)** after all penalties/bonuses — never chase an abnormal single-session print.
- `dominanceRatio` = largest single-day `|move%|` ÷ `|net 5-day move%|` (1.0 if `|net| < 0.5%`). Informational in the new model (shown on the guard card); it is no longer a scored penalty — the spike modifier (−10) and the hard gate already handle abnormal sessions.
- `efficiencyRatio10` = `|close − close[10]|` ÷ Σ`|diffs|` over 10 (the KAMA ER). Feeds the 4% Probability pillar (+5 when > 0.4). Choppy paths are covered by the stability modifier.

### 3.5 Modifiers (bonuses)

| # | Condition | Bonus |
|---|-----------|-------|
| 1 | Multi-TF confirmation — weekly raw ≥ 65 AND daily raw ≥ 65 from this same model (higher-probability setup with larger trend alignment; multi-TF only) | +10 |

The earnings-clarity bonus from the original draft is dropped entirely (no reliable in-app source).

### 3.6 Component Scoring

All pillars consume the `buildEntrySnapshot(candles, indexCandles?, tf)` snapshot. `buyRef` = SMA20 when present, else the lower Bollinger band; `target4 = buyRef × 1.04`.

**Pillar 1 — Trend Health (max 30)** — `calcTrendHealthScore(sn)`

| # | Condition | Points |
|---|-----------|--------|
| 1 | close > SMA50 | 5 |
| 2 | SMA20 > SMA50 | 5 |
| 3 | close > SMA20, else close > AnchoredVWAP | 5 |
| 4 | ADX14 ≥ 25 AND +DI > −DI | 5 |
| 5 | Mansfield RS(52) > −5 | 5 |
| 6 | MACD(12,26,9) > signal | 5 |
| 7 | Weekly Heikin-Ashi bullish — synthesized from daily candles (`synthWeeklyCandles` + `calcHeikinAshi`), D timeframe only | 2.5 |
| 8 | SMA20 5-bar slope > 0 AND close > SMA20 | 2.5 |

**Pillar 2 — Pullback / Setup Quality (max 30)** — `calcPullbackScore(sn)`

| # | Condition | Points |
|---|-----------|--------|
| 1 | close within ±2% of `buyRef` (at-to-near support, the pullback window) | 10 |
| 2 | Bullish candle (close > open) | 5 |
| 3 | Bollinger width < 5 bars ago (compression) | 5 |
| 4 | StochRSI K < 20 OR RSI14 < 40 (oversold near support) | 5 |
| 5 | Volume > 1.5× 20-bar average AND close > open (accumulation bar) | 5 |

**Pillar 3 — 4% Probability (max 40)** — `calcProb4Score(sn)`

| # | Condition | Points |
|---|-----------|--------|
| 1 | `(0.04 × close) / ATR14 > 1.5` — a 4% move fits in ≈ 2.67× daily ATR | 15 |
| 2 | `close` 0.5–4.0% below `target4` — the target is close enough to reach; the window is wide enough to survive shallow 1–1.5% dips toward support, but breaking below support exits it | 10 |
| 3 | ATR10 between 1.5% and 3.5% of price (healthy volatility) | 10 |
| 4 | `efficiencyRatio10 > 0.4` (direct, low-noise path to the target) | 5 |

### 3.7 Return Shape

```typescript
{
  entry_score: number,           // 0-100 final score
  raw_score: number,             // raw total before adjustments
  trendHealth: number,           // pillar 1 (0-30)
  trendHealthMax: number,        // 30
  pullbackQuality: number,       // pillar 2 (0-30)
  pullbackQualityMax: number,    // 30
  prob4: number,                 // pillar 3 (0-40)
  prob4Max: number,              // 40
  modifiers: number,             // net modifier total (penalties + bonuses)
  penalties: number,             // net penalty (≤ 0)
  bonuses: number,               // net bonus (≥ 0)
  penalty_items: [{ reason: string, amount: number }],
  bonus_items: [{ reason: string, amount: number }],
  classification: string,        // STRONG_BUY | BUY | WATCHLIST | NEUTRAL | AVOID
  signal: string,                // same as classification
  allocation_pct: number,        // 100 | 70 | 40 | 0 | 0
  todaySpike: boolean,           // daily guard
  sessionReturnPct: number | null,
  gapPct: number | null,
  dominanceRatio: number | null,
  efficiencyRatio10: number | null,
  details: {
    trendHealth: number,
    pullbackQuality: number,
    prob4: number,
    spike: number,               // 5 (spike) or 0
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
| 10 | Golden exit (blow-off): `today_spike` + up-session + price ≥ 21-EMA + cumulative profit from entry `p = (c − entry_price)/entry_price·100` in 3.0–4.0% (spike near the 4% target) | +5 |
| 10a | same, p in 2.0–3.0% | +3 |
| 11 | Stability collapse: raw `calcStabilityScore` 0–1 (higher = more stable) < 0.35 on the daily snapshot + distribution ratio < 0.6 + not a spike day | +3 |

Note: bonuses 3 and 4 are mutually exclusive (only the higher applies).

**Exit-side no-double-count rules:** the guard bonuses (10, 11) fire only when the equivalent pre-existing exit signal is *not* already scoring the event. E1's near-target profit context (cumulative `p`, from `entry_price`; `sessionReturnPct > 0` is only the up-spike direction gate) is unused by any pillar or bonus, so it is genuinely additive; it is suppressed once profit ≥ 4% because the hard target rule already exits there, and requires price ≥ 21-EMA so 12.x breakdowns are not simultaneously active. E2 uses the raw `calcStabilityScore` 0–1 (not the 0–10 entry sub-score), requires distribution ratio < 0.6 (14.3 + bonus 2 cover heavy distribution) and no spike today. There is deliberately **no down-spike bonus**: a panic day already fires 13.2 (ROC/Mom/FI), 14.1 (OBV/PVT/KVO) and 15.1 (BB/DC/Chandelier), so an extra bonus would double-count the crash. Both rules run once on the primary Daily snapshot in single- and multi-TF exit (and are disabled entirely when no daily timeframe is present); they add urgency only, never pillar points.

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

Each of the three pillars is computed per timeframe with `scoreEntryPillarsForTF` and aggregated with the same weights:

**Timeframe weights:**

| Timeframe | Weight |
|-----------|--------|
| Daily (D) | **55%** |
| Hourly (H) | **30%** |
| Weekly (W) | **15%** |

```
pillar[tf] = scoreEntryPillarsForTF(tf.candles, index_tf, tf)
agg[key]   = min(pillarMax[key], Σ(pillar[tf][key] × w[tf]) / Σ(w[tf]))   // renormalized over available TFs, capped at combined level
rawTotal   = agg.trendHealth + agg.pullbackQuality + agg.prob4             // pillars cap at 30 / 30 / 40 here
finalScore = clamp(rawTotal + modifiers, 0, 100)
```

- Pillars aggregate per-pillar (not per-component): `trendHealth`, `pullbackQuality`, and `prob4` are each the weighted average of the per-TF pillar values, renormalized over the timeframes present (e.g. D+W only → wSum = 0.70, so D = 78.6%, W = 21.4%; D-only → 100% D).
- Pillar caps apply at the **combined level**: each aggregated pillar is clamped to its max (Trend Health ≤ 30, Pullback Quality ≤ 30, 4% Probability ≤ 40) before summing into `rawTotal`.
- Modifiers run **once**, on the **Daily snapshot only** (`perTF.D.sn`) — daily is the primary decision frame. Low-expansion (beta/ATR), spike day, stability < 0.3 are evaluated there; the spike-day flag uses the daily snapshot (`spikeLast` or `|gap| > 3%`).
- The MTF alignment bonus (+10) requires **weekly raw ≥ 65 AND daily raw ≥ 65** (both timeframes genuinely present and strong) — an H-only or D-only result cannot earn it.
- `todaySpike` hard gate (cap 49) runs once on the daily candles.
- When only some timeframes are available, the weights are renormalized over those present.

**Return shape:**

```typescript
{
  multiTF_score: number,           // 0-100 final score
  raw_score: number,               // raw total before adjustments
  trendHealth: number,             // pillar 1 (0-30)
  trendHealthMax: number,          // 30
  pullbackQuality: number,         // pillar 2 (0-30)
  pullbackQualityMax: number,      // 30
  prob4: number,                   // pillar 3 (0-40)
  prob4Max: number,                // 40
  modifiers: number,               // net modifier total
  penalties: number,               // net penalty (≤ 0)
  bonuses: number,                 // net bonus (≥ 0)
  penalty_items: [{ reason, amount }],
  bonus_items: [{ reason, amount }],
  classification: string,          // same thresholds as 3.2
  signal: string,
  allocation_pct: number,
  todaySpike: boolean,
  sessionReturnPct: number | null,
  gapPct: number | null,
  dominanceRatio: number | null,
  efficiencyRatio10: number | null,
  timeframesUsed: number,
  details: [{                      // per-TF rows for UI / compat
    timeframe: string,             // 'H' | 'D' | 'W'
    weight: string,                // '55%' | '30%' | '15%'
    entryScore: number,            // per-TF pillar sum (raw)
    trendHealth: number, trendHealthMax: number,
    pullbackQuality: number, pullbackQualityMax: number,
    prob4: number, prob4Max: number,
    modifiers: number,             // 0 at per-TF level (modifiers run once)
    penalties: number, bonuses: number, raw_score: number,
    spike: number, stability: number,
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

Section 16 modifiers are applied ONCE on the primary (Daily) snapshot (the weight-0.50 timeframe; when daily is absent the primary falls back to the first available timeframe, weekly → hourly):
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
| Pillar field names | `trendScore` / `trendMax` | `trendHealth`/`trendHealthMax`, `pullbackQuality`/`pullbackQualityMax`, `prob4`/`prob4Max` |
| `tfResults[]` format | N/A | `{ timeframe: 'H'\|'D'\|'W', candles: [] }` |
| Mansfield period | 8 | 52 |
| ROC field | `roc_10` | `roc_12` |
| Momentum pillar max | 25 | 30 |
| Entry penalties | RSI > 78, weekly-bull clash, ROC bonus | modifier set: low-expansion −10, spike day −10, stability < 0.3 −15, MTF alignment +10; `todaySpike` hard gate 49 |
