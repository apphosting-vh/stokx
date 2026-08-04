# StoX — Detailed Calculation Specification

**App version:** 2.7.2 · **Cache:** stox-v83 · **Last updated:** 2026-08-01

This is the companion deep-dive to `SPEC.md`. `SPEC.md` summarises the API and
the rules; this document explains exactly how every number is produced, down to
the condition literals and point values used in `indicators.js`.

All references are to `C:\Users\vivek\Downloads\yz12\indicators.js`.

---

## 0. How to read this document

- Every formula shows the exact math used in the code (not an "industry
  standard" version, which sometimes differs in warm-up or rounding).
- Score tables list every condition and its point contribution in the order the
  code evaluates them. Conditions are short-circuit tested in that order.
- `gv` (get value) = last element of an array, `pv` (prev value) = element at
  index `len-2` (the literal previous bar).
- A condition like `c < ema9 && pc >= ema9Prev` means "closed below the EMA9
  this bar, having been at/above it last bar" — i.e. a fresh cross-down.

---

## 1. Data model

A **candle** is `{ o, h, l, c, v, t? }`:

| Field | Meaning |
|---|---|
| `o, h, l, c` | open, high, low, close (numbers) |
| `v` | volume |
| `t` | timestamp. Optional. `"YYYY-MM-DD HH:MM"` string or epoch ms. Used only for cross-series matching (`calcBeta`, `calcRelativeStrength`, `calcMansfieldRS`) and `calcSessionVWAP` session keying. |

**Timeframes.** Two of three labels are used:

| Label | Aliases recognised |
|---|---|
| `H` | `H, h, 1h, hourly, 1H` |
| `D` | `D, d, 1d, day, daily, 1D` |
| `W` | `W, w, 1w, week, weekly, 1W` |

**Minimum data.** Every scoring function requires **50 candles**; below that it
returns `{ ..., reason: 'insufficient_data' }`. Indicators that cannot be
computed on short history return `null` at those positions rather than erroring.

Enforcement is uniform across all scoring entry points:
- `computeEntryScore` / `computeExitScore` — `< 50` → `insufficient_data`.
- `computeMultiTFEntryScore` / `computeMultiTFExitScore` — any TF with `< 50`
  candles is omitted; when no TF qualifies → `no_valid_scores` (no results →
  `no_timeframes`).
- `computeCompatEntryScore` (app-core) / `computeCompatExitScore` — pre-filter
  each TF at `>= 50` and return `null` / `no_valid_scores` when none qualify.
- `integratedExitDecision` — inherits the guard transitively via
  `computeExitScore` / `computeEntryScore`.

The session/horizon helpers are **not** scoring engines: `computeSessionConfidence`
(≥ 10 intraday bars, ≥ 6 session bars), `computeHorizonConfidence` / forward /
optimum-entry (≥ 60 hourly bars; daily context ≥ 30 bars, degrading to
`false`/`null` when absent).

**No trimming.** Entry and exit scoring both consume the full candle series
verbatim, including any in-progress (still-forming) bar. Nothing is dropped.

---

## 2. Rounding

```js
round(val, dec) = Math.round(val * 10^dec) / 10^dec
```
Returns `null` for `null`/`undefined`/`NaN`. Default `dec = 2`.

Indicators round at 2–4 decimals (HMA/KAMA/ATR 4dp, most others 2dp). Scores
round to 1 decimal in the top-level result and 2 decimals in `details`.

---

## 3. Core series primitives

### 3.1 `sma(arr, period)`
Null until index `period-1`, then the arithmetic mean of the trailing `period`
values: `sum(a[i-period+1 .. i]) / period`.

### 3.2 `ewmAlpha(arr, alpha)` (exponential smoothing)
```
prev = null
for each v:
  skip null → push null
  prev = prev === null ? v : v*alpha + prev*(1-alpha)
  push prev
```
Note: seeded with the first valid value (equivalent to pandas `adjust=False`).
`null` values are skipped and do not advance the running value.

### 3.3 `ema(arr, period)` = `ewmAlpha(arr, 2/(period+1))`
Standard EMA smoothing constant.

### 3.4 `rollingStd(arr, period, ddof=1)`
Uses only non-null values in the window; if fewer than `period` remain, `null`.
Sample standard deviation (`ddof=1`, denominator `n-1`). If denominator ≤ 0, `0`.

### 3.5 `rollingMax` / `rollingMin(arr, period)`
`null` until index `period-1`, then the max/min of the trailing window.

### 3.6 `last(arr)` / `nthLast(arr, n)`
`last` returns the last non-null element (scanning back). `nthLast` returns the
nth non-null from the end.

### 3.7 `slope(arr, period=10)`
Linear-regression slope over the last `period` non-null points, x = 0..period-1:
```
sumX = sum(x), sumY = sum(y), sumXY, sumX2
slope = (period*sumXY - sumX*sumY) / (period*sumX2 - sumX*sumX)
```
`null` if any of the last `period` values is null; `0` if denominator is 0.

### 3.8 `hasCrossedAbove`, `justCrossedAbove(series, ref, lookback=3)`, `isCrossedAbove`
`hasCrossedAbove`: first (rightmost) bar where `series[i] > ref[i]` and
`series[i-1] <= ref[i-1]`.
`justCrossedAbove`: true if such a cross happened within the last `lookback`
bars.
`isCrossedAbove(val, prevVal, ref, prevRef)` = `val > ref && prevVal <= prevRef`.

---

## 4. Indicator formulas

### 4.1 Trend & moving averages

| Indicator | Formula (per bar, current value = last element) |
|---|---|
| `calcSMA(c, 20/50/200)` | `sma(closes, period)` (3.1) |
| `calcEMA(c, 9/21/50)` | `ema(closes, period)` (3.3) |
| `calcWMA(c, 20)` | weight `j+1` for the newest of `period` closes; denom `period*(period+1)/2`; null before index `period-1` |
| `calcHMA(c, 16)` | `half=floor(16/2)=8`, `sqrtP=floor(round(sqrt(16)))=4`; `diff = 2*WMA(8) − WMA(16)`; result = `WMA(diff, 4)`. (General: half = floor(p/2), sqrtP = round(sqrt(p)).) |
| `calcKAMA(c, 10, fast=2, slow=30)` | `ER = |cl[i]−cl[i−p]| / Σ|cl[j]−cl[j−1]|` (j over window); `SC=(ER*(2/3−2/31)+2/31)²`; `kama = kama + SC*(cl−kama)`, seeded at `cl[p]`; null for first `p` bars |
| `calcRollingVWAP(c, 10)` | `Σ TP·v / Σ v` over window, `TP=(h+l+c)/3`; null if vol=0 |
| `calcMansfieldRS(c, idx, 52)` | per-bar ratio `rs = c_stock/c_index*100` (matched by index), then `(rs_current / SMA(rs,52) − 1) * 100` |
| `calcPctFrom126dHigh(c)` | `(cl − max(h,126)) / max(h,126) * 100` |
| `calcPctFrom126dLow(c)` | `(cl − min(l,126)) / min(l,126) * 100` |
| `calcPctFrom52wHigh(c)` | `(cl / max(cl,252) − 1) * 100` |
| `calcPctFrom52wLow(c)` | `(cl / min(cl,252) − 1) * 100` |
| `calcHeikinAshi` | `haClose=(o+h+l+c)/4`; `haOpen[0]=(o+c)/2`, else `(haOpen[i−1]+haClose[i−1])/2`; `haHigh=max(h,haOpen,haClose)`; `haLow=min(l,haOpen,haClose)`; trend = sign(haClose−haOpen) |
| `calcChandelierExit(c, 22, 3)` | `long = max(h,22) − 3·ATR(22)`; `short = min(l,22) + 3·ATR(22)` |
| `calcBeta(c, idx, 60)` | Match stock closes to index closes by timestamp `t`; pair returns; beta = `cov(stockRet,idxRet)/var(idxRet)` over last 60 pairs; `null` if fewer than 60 pairs |

### 4.2 Trend direction & strength

| Indicator | Formula |
|---|---|
| `calcTrueRange` | `TR[0]=h−l`; else `max(h−l, |h−prevC|, |l−prevC|)` |
| `calcATR(c, 14)` | `ewmAlpha(TR, 1/period)` (Wilder smoothing), 4dp |
| `calcADX(c, 14)` | `+DM=max(h−hPrev,0)` if `> −DM`; `−DM=max(lPrev−l,0)` if `> +DM`; both smoothed with `ewmAlpha(.,1/14)`; `+DI=100·+DM/ATR`; `DX=100·|+DI−−DI|/(+DI+−DI)`; `ADX=ewmAlpha(DX,1/14)` |
| `calcSuperTrend(c, 10, 3)` | `rawUp=hl2+3·ATR(10)`, `rawDn=hl2−3·ATR(10)`; bands ratchet: upper = `rawUp < prevUpper ? rawUp : prevUpper`; lower = `rawDn > prevLower ? rawDn : prevLower`. First value: `c > upper ? lower : upper`. Flip: when `prevST === prevUpper`, stays bull until `c < lower`; when `prevST === prevLower`, stays bear until `c > upper` |
| `calcParabolicSAR` | Start: long if `c[1]>c[0]`; `AF=0.02`, step 0.02, max 0.20; standard SAR with prior two bars' extreme clamping |
| `calcVortex(c, 14)` | `VI+ = Σ|h[i]−l[i−1]| / ΣTR` over window; `VI−` symmetric |
| `calcAroon(c, 25)` | `up = (25 − barsSinceHighestHigh)/25·100`; `osc = up − down` |
| `calcIchimoku` | `tenkan = (max(h,9)+min(l,9))/2`; `kijun = (max(h,26)+min(l,26))/2`; `senkouA=(tenkan+kijun)/2` **shifted +26 bars**; `senkouB=(max(h,52)+min(l,52))/2` **shifted +26**; `chikou = close[i−26]` (lagging line) |
| `calcMACD(c, 12, 26, 9)` | `macd = ema(12) − ema(26)`; signal = `ema(validMacd, 9)` re-mapped to original indices; `hist = macd − signal` |
| `calcTSI(c, 25, 13)` | `mom = c − cPrev`; `tsi = 100 · ema(ema(mom,25),13) / ema(ema(|mom|,25),13)` |
| `calcSTC(c, 23, 50, 10)` | Schaff: `macd = MACD(23,50)` line; `rawK = stochastic(macd, 10)` (50 when range 0); `d = ema(rawK, halfCycle=5)`; `hh2/ll2 = max/min(d, 10)`; `kk = stochastic(d, 10)`; result = `ema(kk, 5)` |
| `calcAwesomeOscillator` | `SMA(mid,5) − SMA(mid,34)`, `mid=(h+l)/2` |

### 4.3 Momentum oscillators

| Indicator | Formula |
|---|---|
| `calcRSI(c, 14)` | gains/losses from closes; `avgGain=ewmAlpha(gains,1/14)`, `avgLoss=ewmAlpha(losses,1/14)`; `RSI = 100 − 100/(1+avgGain/avgLoss)`; `avgLoss==0 → 100` |
| `calcStochasticRSI(c, 14, 3, 3)` | `rawK = stochastic(RSI(14), 14)` (50 on flat); `K = SMA(rawK, 3)`; `D = SMA(K, 3)` |
| `calcWilliamsR(c, 14)` | `(hh − cl)/(hh − ll) · −100` |
| `calcCCI(c, 20)` | `TP=(h+l+c)/3`; `CCI = (TP − mean) / (0.015 · MAD)` |
| `calcROC(c, 12)` | `(cl[i] − cl[i−12])/cl[i−12] · 100` |
| `calcMomentum(c, 10)` | `cl[i] − cl[i−10]` |
| `calcMFI(c, 14)` | `TP=(h+l+c)/3`, `MF=TP·v`; `posMF`/`negMF` summed over window vs previous TP; `MFI=100−100/(1+posMF/negMF)`; `negMF==0 → 100`; both 0 → null |
| `calcCMF(c, 20)` | `MFV = ((c−l)−(h−c))/(h−l) · v`; `CMF = ΣMFV / Σv` |
| `calcForceIndex(c, 13)` | `raw = (cl − clPrev) · v`; `ema(raw, 13)` |

### 4.4 Volume-based indicators

| Indicator | Formula |
|---|---|
| `calcOBV` | `OBV[i] = OBV[i−1] + v` (up close), `− v` (down close), `0` (flat) |
| `calcPVT` | `PVT[i] = PVT[i−1] + v · (cl[i]−cl[i−1])/cl[i−1]` |
| `calcKVO(c, 34, 55, 13)` | `DM=|h−l|`; `CM=(h+l+c)/3`; `trend=sign(CM−CMPrev)`; `VF = v·|2·(DM/CM)−1|·trend·100`; `line = ema(VF,34) − ema(VF,55)`; `signal = ema(line,13)` |
| `calcAnchoredVWAP(c, anchor?)` | cumulative `ΣTP·v / Σv` from anchor; anchor defaults to `max(0, len−252)` (trailing ~1 year, reproducible regardless of fetch depth), null-prefixed before the anchor |
| `calcVolumeProfile(c, 24 bins, 60 bars)` | closes binned into 24 equal-price bins; POC = midpoint of max-volume bin; value area = bins from the top by volume until ≥70% of total volume; `VAH = priceTo` of highest included bin, `VAL = priceFrom` of lowest included bin |
| `calcTTMSqueeze(c, 20, 2, 1.5)` | `bbUpper < kcUpper && bbLower > kcLower` (Bollinger inside Keltner) |
| `calcSqueezeMomentum` | series `close − (HH20+LL20)/2`; least-squares line over 20 bars; value = fitted line at the last bar (`slope·20 + intercept`) |
| `calcAccumDistComposite` | 4 signals: `CMF20>0.05`, `OBV slope(5)>0`, `FI13>0`, `MFI14>55`; ≥3 bull → `ACCUMULATION`, ≥3 bear → `DISTRIBUTION`, else `NEUTRAL` |

### 4.5 Structure & volatility

| Indicator | Formula |
|---|---|
| `calcBollingerBands(c, 20, 2)` | `mid=SMA20`; `std=sqrt(Σ(cl−mid)²/(20−1))`; `upper=mid+2std`, `lower=mid−2std`; `bandwidth=(upper−lower)/mid` |
| `calcKeltnerChannels(c, 20, 1.5)` | `mid=EMA20`; `upper=mid+1.5·ATR(20)`; `lower=mid−1.5·ATR(20)` |
| `calcDonchianChannels(c, 20)` | `upper=max(h,20)`, `lower=min(l,20)`, `middle=(upper+lower)/2` |
| `calcDarvasBox(c, 20, 3)` | box top = most recent 20-bar swing high that held 3 bars (fallback: rolling 20-bar max); box bottom = lowest low since that high; position/breakout vs last close; `pctFromTop=(boxTop−c)/range·100` |
| `calcFibonacci` | swing high/low over last `min(len,50)` bars; retracements 0.236/0.382/0.5/0.618/0.786 from high; extensions 1.272/1.618 above high |
| `calcPivotPoints` | Classic (from **previous** bar `H,L,C`): `P=(H+L+C)/3`, `R1=2P−L`, `R2=P+(H−L)`, `R3=P+2(H−L)`, `S1=2P−H`, `S2=P−(H−L)`, `S3=P−2(H−L)`. Camarilla (from **current** close `C` and previous range `rng`): `R1=C+rng·1.1/12`, `R2=C+rng·1.1/6`, `R3=C+rng·1.1/4`, `R4=C+rng·1.1/2` (mirrored for S1..S4) |
| `calcWilliamsFractals` | 5-bar pattern (bar `i` is max of `i−2..i+2` highs / min of lows); last 10 each direction |
| `calcZigZag(c, 5%)` | pivots on ≥pct swings; last 12; multi-TF entry passes H=2%, D=3%, W=5% |
| `calcChoppinessIndex(c, 14)` | `100 · log10(ΣTR / (maxH−minL)) / log10(14)` |
| `calcSmartMoney` | order blocks: bar body `> 2·ATR(14)` with the prior bar opposite-colored; swing highs/lows = 5-bar extremes; `bos` = close above last swing high / below last swing low; `choch` uses the previous two swings' sequence |
| `calcMTFAlignment` | score of 6 conditions: `ema9>ema21`, `ema21>ema50`, `c>ema50`, `ema50>sma100`, `sma100>sma200`, `c>sma200`; `alignment = met/available·100` |
| `calcWeek52HL` | `max(h,252)` / `min(l,252)`; `pctFromHigh`/`pctFromLow` vs close |
| `calcRelativeStrength(c, idx)` | latest `rs=c/idxClose` vs 52-bar average → `mansfield = (rs/avg52 − 1)·100` |
| `calcSessionVWAP` | cumulative VWAP restarted each session (date part of `t`) |
| `calcDetectSpike(c, 20, 2.5, 2.5)` | return `r = cl/clPrev − 1`; spike if `|r| > 2.5·rollingStd(r,20)` **and** `|r| > 2.5·ATR14/clPrev` |
| `calcStabilityScore(c, 10)` | returns over last 10 bars; `posFrac` = share of positive returns; `cv = std/mean`; `cvScore=max(0,1−cv/2)`; `score = 0.6·posFrac + 0.4·cvScore` (0..1); `mean≤0` or flat → 0 |

### 4.6 `computeAll(candles)` / `computeAllWithIndex`

`computeAll` runs every indicator above and returns the **last non-null value**
for each (keys `sma_20`, `ema_9`, `rsi_14`, `bb`, `donchian`, `heikinAshi`,
`pivotPoints`, `volumeProfile`, `smartMoney`, …). `computeAllWithIndex` adds
`rs_vs_nifty` and `beta_nifty`. `interpret(ind)` converts each value into a
bullish/bearish/neutral/overbought/oversold label and tallies an overall
sentiment count (see `interpret` thresholds: RSI>70/30, CCI ±100, ADX 25,
Aroon ±50, StochRSI 80/20, WilliamsR −20/−80, choppiness 38.2/61.8, MTF 70/30,
Mansfield ±0).

---

## 5. `buildTFSnapshot(candles, indexCandles)` — one-pass snapshot

All entry and exit sub-scores consume a single snapshot so every sub-score sees
identical inputs. `c = close[last]`, `pc = close[last-1]`. Fields marked `prev`
are the literal previous bar's value (index `len-2`); a few non-bar fields scan
back for the last non-null (squeeze flags, accumulation label, Mansfield RS).

| Group | Snapshot fields |
|---|---|
| Price/volume | `cl, vo` (full arrays), `c, pc` |
| MAs | `sma20, sma50, sma200, ema9, ema9Prev, ema21, ema50, wma20, hma16, prevHma16, kama10, prevKama10` |
| Heikin-Ashi | `haClose, prevHaClose` |
| VWAP | `vwap10, prevVwap10, anchoredVwap, prevAnchoredVwap` |
| MACD | `macdL, macdPrev, sigL, sigPrev, histL, histPrev` (+ `macd_s, sig_s, tsi_s, stc_s` series for cross detection) |
| Oscillators | `tsiL, tsiPrev, stcL, stcPrev, aoL, aoPrev` |
| ADX | `adxL, adxPrev, plusDI, plusDIPrev, minusDI, minusDIPrev` |
| Trend/vol | `stL, stPrev, psar, psarPrev, viPlus, viPlusPrev, viMinus, viMinusPrev, aroonOsc, aroonOscPrev` |
| Bands | `bbUpper, bbMid, bbMidPrev, bbLower, bbWidth, bbWidthPrev, kcUpper, kcMid, kcMidPrev, kcLower, dcUpper, dcLower, prevDcUpper, chandelierLong, chandelierLongPrev, atr14` |
| Momentum | `rsi14, rsi14Prev, stochRsiK, stochRsiKPrev, stochRsiD, stochRsiDPrev, willr, willrPrev, cci20, cci20Prev, roc12, roc12Prev, mom10, mom10Prev, fi13, fi13Prev` |
| Flow | `mfi14, mfi14Prev, cmf20, cmf20Prev, obv, obvSma20, obvSlopeVal, obvSlopePrev, pvt, pvtSma20, pvtSlopeVal, pvtSlopePrev, kvoL, kvoPrev, kvoSig, kvoSigPrev` |
| Volume profile | `poc, prevPoc, vah` |
| Squeeze | `squeezeOn, squeezeOnPrev, squeezeMomVal, squeezeMomPrev, sqArr` |
| Accumulation | `accumDistLabel` (last non-null of Accum/Dist composite) |
| Ichimoku | `tenkan, tenkanPrev, kijun, kijunPrev, senkouA, senkouB, chikou` |
| Levels | `fibLevels, pivotP, pivotR1, pivotS1, pivotS2, darvasTop, darvasBottom` |
| Structure | `zigzagDirection, chopIndex, prevChopIndex, mtfAlign, mtfAlignPrev` |
| Cross-series | `beta, rsMansfield, rsMansfieldPrev` (only when `indexCandles` provided, `len>10`) |
| Spike/stability | `stabilityScore, spikeLast` |
| Distribution days | `distDayRatio, prevDistDayRatio` |

### 5.1 Distribution-day ratio (exit-specific)

```
avgVol20 = mean(volume over last 20 bars)
distDay  = count of the last 5 bars v with  close[v] < close[v-1]  AND  volume[v] > avgVol20
distDayRatio = distDay / 5          (rounded 2dp)
prevDistDayRatio = same computed over window ending one bar earlier
```

---

## 6. Entry scoring (three-pillar model)

### 6.1 Architecture

`computeEntryScore(candles, indexCandles)` (single TF):

```
sn            = buildEntrySnapshot(candles, indexCandles, 'D')  # slim snapshot
trendHealth    = calcTrendHealthScore(sn)    (max 30)
pullbackQuality= calcPullbackScore(sn)       (max 30)
prob4          = calcProb4Score(sn)          (max 40)
rawTotal       = trendHealth + pullbackQuality + prob4    (max 100)

modifierItems  = buildEntryModifiers(sn, { spikeDay })   # penalties + bonuses
modifiers      = Σ modifierItems
finalScore     = clamp(rawTotal + modifiers, 0, 100)
```

Each pillar caps itself, giving a natural 0–100 raw scale (30+30+40 = 100).
The framework uses exactly four modifiers (three penalties, one bonus) applied
as-is; the final clamp bounds the result.

### 6.2 Pillar tables

**Pillar 1 — Trend Health (max 30)** — `calcTrendHealthScore(sn)`

| # | Condition | Pts |
|---|---|---|
| 1 | `c > sma50` | 5 |
| 2 | `sma20 != null && sma50 != null && sma20 > sma50` | 5 |
| 3 | `c > sma20`, else `c > anchoredVwap` | 5 |
| 4 | `adxL >= 25 && plusDI > minusDI` | 5 |
| 5 | `rsMansfield > -5` | 5 |
| 6 | `macdL > sigL` | 5 |
| 7 | `weeklyHABullish === true` — weekly Heikin-Ashi `close > open`, synthesized from daily candles (`synthWeeklyCandles` groups by ISO week, then `calcHeikinAshi`); D timeframe only | 2.5 |
| 8 | `sma20Slope5 > 0 && c > sma20` (`sma20Slope5` = 5-bar SMA20 slope) | 2.5 |

**Pillar 2 — Pullback / Setup Quality (max 30)** — `calcPullbackScore(sn)`

| # | Condition | Pts |
|---|---|---|
| 1 | `buyRef != null && -2 <= (c - buyRef)/buyRef*100 <= 2` — at-to-near support | 10 |
| 2 | `c > o` (bullish candle) | 5 |
| 3 | `bbWidth < bbWidthPrev5` (5-bar Bollinger-width compression) | 5 |
| 4 | `stochRsiK < 20` OR `rsi14 < 40` (oversold near support) | 5 |
| 5 | `volRatio > 1.5 && c > o` (volume > 1.5× 20-bar avg on an up bar) | 5 |

**Pillar 3 — 4% Probability (max 40)** — `calcProb4Score(sn)`

| # | Condition | Pts |
|---|---|---|
| 1 | `(0.04·c) / atr14 > 1.5` — a 4% move fits in ≈ 2.67× daily ATR | 15 |
| 2 | `target4 = buyRef·1.04`; `0.5 <= (target4 - c)/c*100 <= 4.0` — close enough to the target, window wide enough to survive shallow 1–1.5% dips toward support | 10 |
| 3 | `atr10pct = atr10/c·100`; `1.5 <= atr10pct <= 3.5` (healthy volatility) | 10 |
| 4 | `efficiencyRatio10 > 0.4` (direct, low-noise path) | 5 |

**Snapshot helpers (`buildEntrySnapshot`)**

| Field | Formula |
|---|---|
| `buyRef` | SMA20 when present, else lower Bollinger band |
| `weeklyHABullish` | close of synthesized weekly HA bar > HA open (D TF only) |
| `spikeLast` | latest-bar volatility-adaptive spike (`calcDetectSpike`) |
| `stability20` | `calcStabilityScore(candles, 20)` — 0 (erratic) to 1 (stable) |

### 6.3 Spike & stability (modifier inputs)

| Snapshot field | Formula | Use |
|---|---|---|
| `spikeLast` | latest-bar spike via `calcDetectSpike(candles, 20, 2.5, 2.5)` | spike-day modifier (−10) when true or `|gapPct| > 3` |
| `stability20` | `calcStabilityScore(candles, 20)` — 0 (erratic) to 1 (stable); a zero-variance path returns 1 (most stable), a non-positive mean returns 0 | stability modifier (−15) when `< 0.3` |

The old graded spike sub-score (0–10 with three penalty tiers) and stability
sub-score (0–10 with two penalty tiers) are replaced by the two flat modifiers
above. The per-TF `details.spike`/`details.stability` fields still report the
0–10 (higher = worse) views for the UI bars.

### 6.4 Modifiers (`buildEntryModifiers`)

The framework uses exactly four modifiers — three penalties and one bonus. The
spike-day and MTF-confirmation flags are passed in as options:

| # | Condition | Pts |
|---|---|---|
| 1 | Low beta trap — `beta < 0.5` and `atr10/c·100 < 1.5` (unlikely to deliver the 4% move in 2 weeks) | −10 |
| 2 | Spike day — `spikeLast === true` OR `|gapPct| > 3` (never chase a spike) | −10 |
| 3 | Stability risk — `stability20 < 0.3` (erratic action, unsuitable for a measured 4% target) | −15 |
| 4 | Multi-TF confirmation — weekly raw ≥ 65 AND daily raw ≥ 65 from this same model (multi-TF only, appended by `computeMultiTFEntryScore`) | +10 |

Penalty/bonus items are summed into `modifiers`; the final score is clamped to
[0, 100]. No earnings-date bonus exists (dropped — no reliable in-app source).

### 6.5 Spike / Stability Guard (hard gate)

Computed once per session on the **daily** candles by `computeSpikeGuard(candles)`:

| Metric | Formula | Use |
|---|---|---|
| `todaySpike` | latest-bar detection (`calcDetectSpike`: `|ret| > 2.5·rollingStd(20)` **and** `> 2.5·ATR14%`) **or** open-gap trigger `|gap%| > max(3.5, 1.5·ATR%)` | **hard gate**: `final = min(final, 49)` → never above NEUTRAL on the day of an abnormal print |
| `dominanceRatio` | largest single-day `|move%|` ÷ `|net 5-day move%|` (1.0 if `|net| < 0.5%`) | informational — shown on the guard card; no longer a scored penalty (the spike modifier −10 and the hard gate already cover abnormal sessions) |
| `efficiencyRatio10` | `|close − close[10]|` ÷ Σ`|diffs|` over 10 (identical to the KAMA efficiency ratio) | feeds the 4% Probability pillar (+5 when `> 0.4`) |

The gate is applied after all modifiers in both `computeEntryScore` and
`computeMultiTFEntryScore`; classification is re-derived from the capped score.
The spike/stability **modifiers** (6.4) remain per-timeframe on the base
snapshot; dominance/ER/gate are daily-only.

**No-overlap rules (anti-double-count):**
- The spike modifier (−10) and the hard gate are complementary: the cap stops BUY on a strong-pillar spike day; the −10 keeps a moderate spike day lower even when pillars are weak. Both rely on the same `todaySpike` detection, so they never conflict.
- `calcStabilityScore`: a zero-variance path (`stdRet === 0`, e.g. perfectly smooth climb) returns **1** (most stable → no stability penalty). A non-positive mean still returns 0.

---

## 7. Exit scoring (SPEC Sections 12–16)

### 7.1 Architecture

`computeExitScore(candles, position, indexCandles)` (single TF):

```
sn     = buildTFSnapshot(candles, indexCandles)
comps  = scoreExitComponentsForTF(sn, position)
trendBD  = min(12.1a + 12.1b + 12.1c, 25)
momExh   = min(13.1 + 13.2 + 13.3, 25)
volDist  = min(14.1 + 14.2 + 14.3, 25)
strucBD  = min(15.1 + 15.2 + 15.3, 25)
rawTotal = trendBD + momExh + volDist + strucBD        (max 100)

ctx.indexTrendScore = computeEntryScore(indexCandles).entry_score   (index treated as a "stock")
ctx = { indexTrendScore, entryPrice=position.entry_price || c, currentPrice=c,
        holdingDays=position.holding_days || 0, entryScore=position.entry_score || 50 }

penalties = Σ buildExitPenaltyItems(sn, ctx)
bonuses   = Σ buildExitBonusItems(sn, ctx)
finalScore = clamp(rawTotal + penalties + bonuses, 0, 100)
```

Exit is **higher = worse** (a score is "exit pressure"). Pillars are capped at
25 each, giving a clean 0–100 raw scale.

### 7.2 Sub-score tables

**12.1a MA Breakdown (max 7)**

| # | Condition | Pts |
|---|---|---|
| 1 | `c < ema9 && pc >= ema9Prev` (fresh cross-down) | 1.5 |
| 1a | else `c < ema9` | 0.5 |
| 2 | `c < ema21` | 0.5 |
| 3 | `c < ema50` | 0.5 |
| 4 | `sma200 != null && c < sma200` | 0.5 |
| 5 | `ema9 < ema21` | 0.5 |
| 6 | `ema21 < ema50` | 0.5 |
| 7 | `hma16 < prevHma16` | 0.5 |
| 8 | `kama10 < prevKama10` | 0.5 |
| 9 | `c < wma20` | 0.5 |
| 10 | `sma20 < sma50` | 0.5 |
| 11 | `rsMansfield < 0 && rsMansfield < rsMansfieldPrev` | 1.0 |
| 12 | `haClose < prevHaClose && c < sma20` | 0.5 |

**12.1b MACD + TSI + STC + AO Rollover (max 9)**

| # | Condition | Pts |
|---|---|---|
| 1 | `macdL < sigL && macdPrev >= sigPrev` (bearish cross) | 2.0 |
| 1a | else `macdL < sigL` | 1.0 |
| 2 | `macdL < 0 && macdPrev >= 0` | 1.0 |
| 3 | `histL < 0 && histL < histPrev` | 0.5 |
| 4 | `tsiL < 0 && tsiPrev >= 0` | 1.0 |
| 4a | else `tsiL < 0` | 0.5 |
| 5 | `tsiL < tsiPrev` | 0.5 |
| 6 | `stcL < 25` | 0.5 |
| 7 | `stcL < stcPrev && stcL < 75` | 0.5 |
| 8 | `aoL < 0 && aoPrev >= 0` | 1.0 |
| 8a | else `aoL < 0` | 0.5 |
| 9 | `aoL < aoPrev` | 0.5 |

**12.1c ADX + Supertrend + PSAR + Vortex + Aroon (max 9)**

| # | Condition | Pts |
|---|---|---|
| 1 | `adxL < adxPrev && adxL < 25` (weakening trend) | 1.5 |
| 1a | else `adxL < adxPrev` | 0.5 |
| 2 | `minusDI > plusDI && minusDIPrev <= plusDIPrev` (+DI/−DI flip) | 1.5 |
| 3 | `c < stL` (below supertrend) | 1.0 |
| 4 | `pc >= stPrev && c < stL` (supertrend flip down) | 0.5 |
| 5 | `c < psar` | 0.5 |
| 6 | `pc >= psarPrev && c < psar` (PSAR flip down) | 0.5 |
| 7 | `viMinus > viPlus && viMinusPrev <= viPlusPrev` (vortex flip) | 1.0 |
| 7a | else `viMinus > viPlus` | 0.5 |
| 8 | `aroonOsc < −50` / `< 0` | 1.0 / 0.5 |
| 9 | `aroonOsc < aroonOscPrev` | 0.5 |

**13.1 RSI + StochRSI + Williams %R Exhaustion (max 10)**

| # | Condition | Pts |
|---|---|---|
| 1 | `rsi > 80` / `> 70` | 2.0 / 1.0 |
| 2 | `rsi < rsiPrev && rsiPrev > 70` (rolling over from overbought) | 1.0 |
| 3 | `rsi < 50 && rsiPrev >= 50` (cross below mid) | 0.5 |
| 4 | `K < D && KPrev >= DPrev` (StochRSI bearish cross) | 1.5 |
| 4a | else `K < D` | 0.5 |
| 5 | `K < 20` | 0.5 |
| 6 | `willr < −80` | 1.0 |
| 7 | `willr < −50 && willrPrev >= −50` | 1.0 |
| 8 | `willr < willrPrev && willr < −50` | 0.5 |

**13.2 CCI + ROC + Momentum + Force Index Reversal (max 8)**

| # | Condition | Pts |
|---|---|---|
| 1 | `cci > 200` / `> 100` (exhaustion overbought) | 1.0 / 0.5 |
| 2 | `cci < cciPrev && cciPrev > 100` (rolling over) | 1.0 |
| 3 | `cci < 0 && cciPrev >= 0` | 0.5 |
| 4 | `roc < 0 && rocPrev >= 0` | 1.0 |
| 4a | else `roc < 0` | 0.5 |
| 5 | `mom < 0 && momPrev >= 0` | 1.0 |
| 5a | else `mom < 0` | 0.5 |
| 6 | `fi < 0 && fiPrev >= 0` | 1.0 |
| 6a | else `fi < 0` | 0.5 |
| 7 | `fi < fiPrev && fi < 0` | 0.5 |

**13.3 MFI + CMF Outflow (max 7)**

| # | Condition | Pts |
|---|---|---|
| 1 | `mfi > 80` / `> 70` | 2.0 / 1.0 |
| 2 | `mfi < mfiPrev && mfiPrev > 70` | 1.0 |
| 3 | `mfi < 50 && mfiPrev >= 50` | 0.5 |
| 4 | `mfi < 30` (deep outflow) | 0.5 |
| 5 | `cmf < −0.05` / `< 0` | 2.0 / 1.0 |
| 6 | `cmf < cmfPrev && cmf < 0` | 0.5 |

**14.1 OBV + PVT + KVO + Force Index Decline (max 9)**

| # | Condition | Pts |
|---|---|---|
| 1 | `obv < obvSma20` | 1.0 |
| 2 | `obvSlope < 0 && obvSlopePrev > 0` | 0.5 |
| 2a | else `obvSlope < 0` | 0.5 |
| 3 | `pvt < pvtSma20` | 1.0 |
| 4 | `pvtSlope < 0` | 0.5 |
| 5 | `kvoL < kvoSig && kvoPrev >= kvoSigPrev` (KVO bearish cross) | 1.5 |
| 5a | else `kvoL < kvoSig` | 0.5 |
| 6 | `kvoL < 0` | 0.5 |
| 7 | `fi < 0` | 1.0 |
| 8 | `fi < fiPrev && fi < 0` | 0.5 |

**14.2 VWAP + Anchored VWAP Break (max 7)**

| # | Condition | Pts |
|---|---|---|
| 1 | `c < vwap10 && pc >= prevVwap10` (break below VWAP) | 2.0 |
| 1a | else `c < vwap10`: `pct=(vwap10−c)/vwap10` → `>2%` / `>1%` / else | 1.5 / 1.0 / 0.5 |
| 2 | `vwap10 < prevVwap10` | 0.5 |
| 3 | `c < anchoredVwap` | 1.5 |
| 4 | `anchoredVwap < prevAnchoredVwap` | 0.5 |
| 5 | `c < vwap10 && c < anchoredVwap` | 1.0 |

**14.3 TTM Squeeze + Distribution Confirmation (max 9)**

| # | Condition | Pts |
|---|---|---|
| 1 | `squeezeMom < 0 && squeezeMomPrev >= 0` (momentum flip down) | 2.5 |
| 1a | else `squeezeMom < 0` | 1.5 |
| 2 | `squeezeMom < squeezeMomPrev && squeezeMom < 0` | 1.0 |
| 3 | `squeezeOn && squeezeMom < 0` | 1.0 |
| 4 | `distDayRatio >= 0.6` / `>= 0.4` | 2.5 / 1.5 |
| 5 | `distDayRatio > prevDistDayRatio` | 1.0 |

**15.1 BB + KC + DC + Chandelier Breakdown (max 9)**

| # | Condition | Pts |
|---|---|---|
| 1 | `c < bbMid && pc >= bbMidPrev` (break below mid) | 2.0 |
| 1a | else `c < bbMid` | 0.5 |
| 2 | `c < bbLower` | 1.0 |
| 3 | `bbWidth > bbWidthPrev && c < bbMid` (expansion + below mid) | 0.5 |
| 4 | `c < kcMid && pc >= kcMidPrev` | 1.0 |
| 4a | else `c < kcMid` | 0.5 |
| 5 | `c <= 1.01·dcLower` (at/below Donchian floor) | 1.0 |
| 6 | `c < chandelierLong` | 1.0 |
| 7 | `chandelierLong < chandelierLongPrev` | 0.5 |
| 8 | `atr14/c > 5%` | 0.5 |

**15.2 Ichimoku Bearish Flip (max 6)**

| # | Condition | Pts |
|---|---|---|
| 1 | `c < min(senkouA, senkouB)` (below cloud) | 2.0 |
| 1a | else `c < max(senkouA, senkouB)` (inside cloud) | 0.5 |
| 2 | `tenkan < kijun && tenkanPrev >= kijunPrev` (flip) | 1.5 |
| 2a | else `tenkan < kijun` | 0.5 |
| 3 | `senkouA < senkouB` (cloud turning red) | 0.5 |
| 4 | `c < pc` (falling close) | 0.5 |
| 5 | all bearish: `c < cloudBottom && tenkan < kijun && senkouA < senkouB` | 0.5 |

**15.3 Darvas + Structure + Risk/Reward (max 10)**

| # | Condition | Pts |
|---|---|---|
| 1 | `c <= darvasBottom` (broke out of box bottom) | 2.0 |
| 1a | else `c < (darvasTop+darvasBottom)/2` (below box mid) | 0.5 |
| 2 | `hma16 < prevHma16` | 0.5 |
| 3 | `kama10 < prevKama10` | 0.5 |
| 4 | `c < hma16 && c < kama10` | 0.5 |
| 5 | `mtfAlign < 40` / `< 60` | 1.5 / 0.5 |
| 6 | `mtfAlign < mtfAlignPrev` | 0.5 |
| 7 | `c < fib 0.618` | 1.0 |
| 8 | `c < fib 0.786` | 0.5 |
| 9 | `c < pivotS1` | 0.5 |
| 10 | `c < pivotS2` | 0.5 |
| 11 | `zigzagDirection == 'DOWN'` | 0.5 |
| 12 | `chopIndex > prevChopIndex && chopIndex > 61.8` (getting choppier) | 0.5 |
| 13 | Risk/Reward: `stop = entry − 1.5·ATR`, `target = entry·1.04`; `rr = (target−c)/(c−stop)`; `rr < 1.0` | 1.5 |
| 13a | `1.0 ≤ rr < 1.5` | 0.5 |
| 13b | `target − c <= 0` (already beyond target) | 1.0 |
| 13c | `c <= stop` (price at/below stop → maximum exit pressure; RR undefined, so it must not fall through to 0) | 1.5 |

Note: rows 1 (Darvas bottom break) and 13/13c (stop breach) can fire **simultaneously** on a crash through both levels. They measure different things — the box's structural low vs. the trade's stop-loss distance from entry — so stacking is intentional; the section's 10-point cap bounds the total. A Darvas-bottom break often coincides with a stop breach only when entry was near the box low, which is the normal case for entries in the box.

### 7.3 Section 16 exit modifiers

`indexTrendScore` here = the **entry score of the index** (`computeEntryScore(indexCandles)`), i.e. how bullish the index is. A high index score suppresses exit pressure; a low index score amplifies it.

**Penalties (`buildExitPenaltyItems`)** — first rule that matches wins:

| # | Condition | Pts |
|---|---|---|
| 1 | `indexTrendScore >= 65` (index still very bullish) | −8 |
| 2 | else `ema9 > ema21 && macdL > sigL` (stock itself strong) | −5 |
| 3 | last 3 closes strictly declining **and** last-bar volume < 0.7 × 20-bar avg | −6 |
| 4 | price within 1.5% above pivot S1 (`0 ≤ (c−S1)/c < 0.015`) | −5 |
| 5 | `holdingDays < 3 && entryScore > 70` (too soon / great entry) | −5 |
| 6 | `c > fib 0.618 && c > pivotP` | −3 |

**Bonuses (`buildExitBonusItems`)**:

| # | Condition | Pts |
|---|---|---|
| 1 | `indexTrendScore < 35` | +5 |
| 2 | `distDayRatio >= 0.6` | +5 |
| 3 | `c < 0.97·entryPrice` | +5 |
| 3a | else `c < 0.985·entryPrice` | +3 |
| 4 | `c < hma16 && c < ema9` (label: "Daily+Hourly bearish") | +5 |
| 5 | `accumDistLabel == 'DISTRIBUTION' && mtfAlign < 40` | +3 |
| 6 | `beta > 1.5 && indexTrendScore < 40` | +3 |
| 7 | `c < chandelierLong && c < pivotS1` | +3 |
| 8 | KVO bearish cross (`kvoL < kvoSig && kvoPrev >= kvoSigPrev`) | +3 |
| 9 | **Guard E1 (golden exit):** `todaySpike` **and** `sessionReturnPct > 0` **and** `c >= ema21` **and** cumulative position profit `p = (c − entry_price)/entry_price·100` in `[3.0, 4.0)` (spike carried us near the 4% target) | +5 |

  `sessionReturnPct` = latest-session % return `(c − prevClose)/prevClose·100` from `computeSpikeGuard` (null when < 12 candles) — used **only** as the up-spike direction gate. The profit context `p` is the **cumulative** position profit `(c − entry_price)/entry_price·100` (from `entry_price`), which no pillar (12.x–15.x) or bonus uses — so a stock up +3% total but only +0.5% today still qualifies if `todaySpike` is true, and one up +3% today but −2% from entry does not.
| 9a | same, profit `2.0 ≤ p < 3.0`% | +3 |
| 10 | **Guard E2:** `stabilityScore < 0.35` **and** `distDayRatio < 0.6` **and** `not todaySpike` (erratic whipsaw) | +3 |

  `stabilityScore` here is the **raw `calcStabilityScore(candles, 10)` 0–1 value** from the daily snapshot (higher = more stable; 1 = zero-variance, 0 = non-positive mean), so `< 0.35` means poor stability. It is **not** the Section 6.3 stability **sub-score** `(1 − calcStabilityScore)·10` (0–10, higher = worse) used in entry scoring.

**No-overlap rules (exit side, same guard as §6.5):**
- **E1** nudges the user to bank the gain when a sudden up-spike brings the position near the 4% target (2.0–4.0% profit), before the hard target rule fires at ≥ 4%. The near-target profit context is derived from `entry_price`, which no pillar (12.x–15.x) or bonus uses (the only entry-price bonus, "Price < 97% entry", is for losses), so it is genuinely additive. RSI exhaustion (§13.1) is an independent momentum signal and stacks legitimately; `c >= ema21` keeps 12.x downtrend breakdowns from being simultaneously active. Profit ≥ 4% is excluded because the hard target rule already exits there.
- **E2** fires only when `distDayRatio < 0.6` — heavy distribution (≥ 0.6) is already scored by §14.3 and bonus row 2. It is also suppressed on a spike day so it never stacks with E1.
- **No down-spike bonus by design:** a panic (down) spike day already fires §13.2 (ROC/Mom/FI < 0), §14.1 (OBV/PVT/KVO decline) and §15.1 (BB/DC/Chandelier breaks) — adding an extra bonus for the same crash would double-count.
- The guard bonuses are computed once on the primary (Daily) snapshot with `ctx.guard = computeSpikeGuard(dailyCandles)` in both single-TF and multi-TF paths; they never touch the raw pillar points.

---

## 8. Multi-timeframe aggregation

### 8.1 Entry — `computeMultiTFEntryScore(tfResults, indexCandles, indexWeeklyCandles)`

```
weights = { D: 0.55, H: 0.30, W: 0.15 }

for each of the 3 pillar keys (trendHealth, pullbackQuality, prob4):
    wSum = 0, acc = 0
    for label in D, H, W:
        if perTF[label] has a value: acc += weight[label]·value;  wSum += weight[label]
    agg[key] = min(pillarMax, acc / wSum)        # renormalised over available TFs, cap at combined level

rawTotal = agg.trendHealth + agg.pullbackQuality + agg.prob4   # pillars cap at 30/30/40 here

# Modifiers run ONCE on the Daily snapshot only (daily is the primary decision frame):
baseSn   = perTF.D.sn                                   # daily only
spikeDay = (perTF.D present) && (perTF.D.sn.spikeLast === true || |gapPct| > 3)
items    = buildEntryModifiers(baseSn, { spikeDay, mtfAlign })
mtfAlign = (perTF.W.raw >= 65) && (perTF.D.raw >= 65)   # both genuinely present & strong

finalScore = clamp(rawTotal + Σ items, 0, 100)
```

Notes:
- Missing timeframes are simply omitted and weights renormalised over the
  available ones (e.g. only D+W available → wSum = 0.70, so D = 0.55/0.70 =
  78.6% and W = 0.15/0.70 = 21.4%).
- Pillars aggregate **per-pillar** (not per old sub-score); the three pillar
  values are each the renormalised weighted average across D/H/W.
- Pillar caps apply at the **combined level**: each aggregated pillar is clamped
  to its max (Trend Health ≤ 30, Pullback Quality ≤ 30, 4% Probability ≤ 40)
  before summing into `rawTotal`.
- Modifiers run **once**, on the Daily snapshot only — never per timeframe.
  The +10 bonus is the only modifier that needs both weekly and daily raw ≥ 65.
- `todaySpike` hard gate (cap 49) runs once on the daily candles.
- Output adds `timeframesUsed` and a per-TF `details` array. Each row's
  `entryScore` is that TF's **raw** pillar sum (`trendHealth + pullbackQuality +
  prob4`) — i.e. it always equals the sum of the breakdown bars displayed beside
  it — classified with `classifyScore` on that raw sum. Per-TF
  `penalties`/`bonuses`/`modifiers` are 0: modifiers are applied once at the
  combined level, never per timeframe.

### 8.2 Exit — `computeMultiTFExitScore(tfResults, position, indexCandles)`

```
weights = { H: 0.25, D: 0.50, W: 0.25 }   (aliases map each label)

for each TF with weight > 0 and ≥ 50 candles:
    sn     = buildTFSnapshot(tf.candles, indexCandles)
    comps  = scoreExitComponentsForTF(sn, position)
    trendBD = min(tf1a + tf1b + tf1c, 25)   # per-TF pillar caps again
    momExh  = min(tf2a + tf2b + tf2c, 25)
    volDist = min(tf3a + tf3b + tf3c, 25)
    strucBD = min(tf4a + tf4b + tf4c, 25)
    tfScore = sum of the four pillars
    totalScore += tfScore · weight;   totalWeight += weight

multiTF = totalScore / totalWeight               # renormalised weighted mean

# single modifier pass on the PRIMARY (Daily) snapshot:
primarySn = first TF whose weight == 0.50 (D), else first TF
ctx = { indexTrendScore: computeEntryScore(indexCandles).entry_score,
        entryPrice, currentPrice: primarySn.c, holdingDays, entryScore,
        guard: computeSpikeGuard(primary.candles) }   # daily-only guard; DISABLED (neutral) when no daily timeframe is present
penalties/bonuses = buildExitPenaltyItems(primarySn, ctx) / buildExitBonusItems(primarySn, ctx)
finalScore = clamp(multiTF + penalties + bonuses, 0, 100)
```

Key properties:
- Pillar caps (25) are applied **per timeframe before** the weighted sum, and
  again to the weighted component averages in the returned breakdown.
- Modifiers (Section 16) are computed **once**, from the Daily snapshot and
  index data — they are not per-TF.
- `raw_score` = the renormalised `multiTF` (before modifiers).
- Returned pillar breakdowns come from weighted component averages:
  `avgC(k) = Σ comps.k·weight / totalWeight`, capped at 25.

### 8.3 Compatibility wrapper — `computeCompatExitScore(...)`

```
tfResults = [W if ≥50 candles, D if ≥50, H if ≥50]
if len > 1 → computeMultiTFExitScore(...), add compat_mode='mtf'
else      → computeExitScore(...), add compat_mode='single'
```

---

## 9. Classification thresholds

**Entry (`classifyScore`):**

| Score | Classification | Signal | Allocation |
|---|---|---|---|
| ≥ 80 | STRONG_BUY | STRONG_BUY | 100% |
| ≥ 65 | BUY | BUY | 70% |
| ≥ 50 | WATCHLIST | WATCHLIST | 40% |
| ≥ 35 | NEUTRAL | NEUTRAL | 0% |
| < 35 | AVOID | AVOID | 0% |

**Exit (`classifyExitScore`):**

| Score | Classification | Signal | Action |
|---|---|---|---|
| ≥ 85 | URGENT_EXIT | URGENT_EXIT | Full exit immediately |
| ≥ 70 | EXIT | EXIT | Full exit at current price or next bar open |
| ≥ 55 | PARTIAL_EXIT | PARTIAL_EXIT | Exit 50%, tighten trailing stop to 1.5× ATR |
| ≥ 40 | TIGHTEN_STOP | TIGHTEN_STOP | Move stop to breakeven or 1× ATR below current |
| ≥ 25 | MONITOR | MONITOR | No action — watch for escalation next bar |
| < 25 | HOLD | HOLD | All conditions intact — continue holding |

**Index trend score (`computeIndexTrendScore`)**: % of met conditions among
`ema9>ema21>ema50`, `macd>signal`, and weekly close > weekly EMA21 (falls back
to daily close > daily EMA21 when no weekly candles). 0–100, `null` if < 50
index candles.

---

## 10. Worked example

Synthetic flat drift up with noise (harness at `tests/exit-harness.js`):

**Single TF exit** — raw pillar sums 46.5 (trend 10.0 + momentum 12.5 +
volume 12.0 + structure 12.0). Section 16: index trend score low → +5, price
> 3% below entry → +5, distribution days ≥ 60% → +5 → **final 61.5**
(`PARTIAL_EXIT`).

**Multi-TF exit** — per-TF raws of D=52.0, W=34.0, H=22.0:
```
multiTF = (0.50·52.0 + 0.25·34.0 + 0.25·22.0) / (0.50+0.25+0.25)
        = (26.0 + 8.5 + 5.5) / 1.0
        = 40.0        → round 40.0 (raw_score)
+ 15 modifiers → final 55.0 (PARTIAL_EXIT), timeframesUsed=3
```
Weighted component averages: `avgC(tf1a) = (0.50·a_D + 0.25·a_W + 0.25·a_H)/1.0`,
etc., then each pillar re-capped at 25 for the breakdown.

---

## 11. Edge cases & guarantees

- **Short data:** < 50 candles → `insufficient_data` (need 50, got n); MTF with
  no valid TF → `no_valid_scores`; no TF results → `no_timeframes`. Entry
  snapshots require 50 bars (`buildEntrySnapshot`); exit requires 50 too.
- **Missing index:** entry/exit skip index-derived fields (`beta`,
  `rsMansfield`), leaving `null`; pillar and modifier functions check
  `!= null` before every index-dependent condition.
- **Index used as "stock":** exit `indexTrendScore` reuses `computeEntryScore`
  on the index candles — cheap, no extra state. Entry no longer scores the index
  directly; RS/beta only.
- **In-progress bar:** included as-is in every series (no trimming, entry or
  exit).
- **Clamping:** final score always `clamp(..., 0, 100)` after modifiers.
- **Hard gate:** when `todaySpike` is true the final entry score is capped at 49
  (NEUTRAL) after modifiers, in both single-TF and MTF entry.
- **Rounding:** pillar sub-scores accumulate unrounded internally, capped per
  pillar, summed to `rawTotal`, then rounded at output (1 dp).
- **Determinism:** all series are pure functions of the candle array; snapshot
  caching is per-call, no shared mutable state.
