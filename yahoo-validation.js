/* ══════════════════════════════════════════════════════════════════════
   Yahoo OHLCV Sanitizer
   Repair bad prints, drop null-close rows, dedupe, guard split staleness.
   Idempotent — safe to call multiple times on the same data.
   ══════════════════════════════════════════════════════════════════════ */
window.YahooValidation = (function () {

  function sanitize(bars, opts) {
    opts = opts || {};
    var out = [];
    var report = { total: bars ? bars.length : 0, kept: 0, droppedNullClose: 0, droppedNullOpen: 0,
      droppedNullHigh: 0, droppedNullLow: 0, droppedDupe: 0, droppedZeroRangeNoVol: 0, repaired: 0, nullVolume: 0 };
    if (!bars || !bars.length) return { candles: out, report: report };
    var seen = {};
    for (var i = 0; i < bars.length; i++) {
      var b = bars[i]; if (!b) continue;
      if (b.c == null || !isFinite(b.c) || b.c <= 0) { report.droppedNullClose++; continue; }
      if (b.o == null || !isFinite(b.o) || b.o <= 0) { report.droppedNullOpen++; continue; }
      if (b.h == null || !isFinite(b.h) || b.h <= 0) { report.droppedNullHigh++; continue; }
      if (b.l == null || !isFinite(b.l) || b.l <= 0) { report.droppedNullLow++; continue; }
      if (b.t != null) {
        var ts = String(b.t);
        if (seen[ts]) { report.droppedDupe++; continue; }
        seen[ts] = true;
      }
      var o = b.o, h = b.h, l = b.l, c = b.c, v = b.v, repaired = false;
      if (h < l) { var t = h; h = l; l = t; repaired = true; }
      if (h < c) { h = c; repaired = true; }
      if (h < o) { h = o; repaired = true; }
      if (l > c) { l = c; repaired = true; }
      if (l > o) { l = o; repaired = true; }
      if (repaired) report.repaired++;
      if (h === l && (!v || v <= 0)) { report.droppedZeroRangeNoVol++; continue; }
      if (v == null || !isFinite(v) || v < 0) { v = 0; report.nullVolume++; }
      out.push({ t: b.t, o: o, h: h, l: l, c: c, v: v });
    }
    report.kept = out.length;
    return { candles: out, report: report };
  }

  function logIfProblematic(symbol, report, opts) {
    if (!report || !report.total) return;
    var rate = (report.total - report.kept) / report.total;
    var th = (opts && opts.threshold) || 0.05;
    if (rate >= th) {
      console.warn("[YahooValidation] " + symbol + ": kept " + report.kept + "/" + report.total +
        " bars (" + Math.round(rate * 100) + "% dropped).", report);
    }
  }

  /* Split-adjustment staleness: if live/cached ratio is outside [0.67, 1.5],
     a split likely landed after the last backtest — absolute-price features
     (AnchoredVWAP, POC) are on the pre-split scale. */
  function isStaleForSplit(cachedClose, livePrice) {
    if (!(cachedClose > 0) || !(livePrice > 0)) return false;
    var ratio = livePrice / cachedClose;
    return ratio > 1.5 || ratio < 0.67;
  }

  return { sanitize: sanitize, logIfProblematic: logIfProblematic, isStaleForSplit: isStaleForSplit };
})();