/* ══════════════════════════════════════════════════════════════════════
   StoX Statistics Utilities
   Honest ranking, confidence intervals, permutation p-values, purged CV.
   ══════════════════════════════════════════════════════════════════════ */
window.StoxStats = (function () {

  function wilsonLowerBound(wins, n, z) {
    z = z || 1.96; if (n <= 0) return 0;
    var p = wins / n, denom = 1 + z * z / n, centre = p + z * z / (2 * n);
    var spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return Math.max(0, (centre - spread) / denom);
  }

  function wilsonCI(wins, n, z) {
    z = z || 1.96; if (n <= 0) return [0, 0];
    var p = wins / n, denom = 1 + z * z / n, centre = p + z * z / (2 * n);
    var spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [Math.max(0, (centre - spread) / denom), Math.min(1, (centre + spread) / denom)];
  }

  function permutationP(hits, n, iterations) {
    iterations = iterations || 500; if (n <= 0) return 1;
    var observed = hits / n, count = 0;
    for (var i = 0; i < iterations; i++) {
      var w = 0;
      for (var j = 0; j < n; j++) if (Math.random() < 0.5) w++;
      if (w / n >= observed) count++;
    }
    return (count + 1) / (iterations + 1);
  }

  function bootstrapCI(values, statistic, iterations, alpha) {
    iterations = iterations || 500; alpha = alpha || 0.05;
    if (!values || values.length < 5) return [null, null];
    var stats = [];
    for (var i = 0; i < iterations; i++) {
      var r = [];
      for (var j = 0; j < values.length; j++) r.push(values[Math.floor(Math.random() * values.length)]);
      stats.push(statistic(r));
    }
    stats.sort(function (a, b) { return a - b; });
    return [stats[Math.floor(iterations * alpha / 2)], stats[Math.ceil(iterations * (1 - alpha / 2)) - 1]];
  }

  function blockBootstrapCI(values, blockSize, statistic, iterations, alpha) {
    iterations = iterations || 500; alpha = alpha || 0.05; blockSize = blockSize || 5;
    if (!values || values.length < blockSize * 2) return [null, null];
    var n = values.length, nBlocks = Math.ceil(n / blockSize), stats = [];
    for (var i = 0; i < iterations; i++) {
      var r = [];
      for (var b = 0; b < nBlocks; b++) {
        var s = Math.floor(Math.random() * Math.max(1, n - blockSize + 1));
        for (var k = 0; k < blockSize && s + k < n; k++) r.push(values[s + k]);
      }
      if (r.length > n) r = r.slice(0, n);
      stats.push(statistic(r));
    }
    stats.sort(function (a, b) { return a - b; });
    return [stats[Math.floor(iterations * alpha / 2)], stats[Math.ceil(iterations * (1 - alpha / 2)) - 1]];
  }

  function purgedWalkForward(samples, nFolds, embargoDays) {
    nFolds = nFolds || 5; embargoDays = embargoDays || 7;
    if (!samples || !samples.length) return [];
    var sorted = samples.slice().sort(function (a, b) { return (a.entryDate || "").localeCompare(b.entryDate || ""); });
    var foldSize = Math.floor(sorted.length / nFolds), folds = [];
    for (var f = 0; f < nFolds; f++) {
      var testStart = f * foldSize, testEnd = f === nFolds - 1 ? sorted.length : (f + 1) * foldSize;
      var test = sorted.slice(testStart, testEnd), train = sorted.slice(0, testStart);
      if (test.length && embargoDays > 0) {
        var cutoff = new Date(test[0].entryDate + "T00:00:00").getTime() - embargoDays * 86400000;
        train = train.filter(function (s) { return new Date(s.entryDate + "T00:00:00").getTime() < cutoff; });
      }
      folds.push({ fold: f + 1, train: train, test: test, embargoDays: embargoDays });
    }
    return folds;
  }

  function scoreRank(stats) {
    if (!stats || !stats.n || stats.n <= 0) return -Infinity;
    var wrLB = wilsonLowerBound(stats.wins || 0, stats.n);
    var er = stats.expectancy != null ? stats.expectancy : 0;
    return wrLB * er;
  }

  /* Baseline hit rate: fraction of (close → max high in next H) windows that
     reached +targetPct. Null-h bars are dropped (Yahoo bad prints). */
  function baselineHitRate(candles, targetPct, holdingDays) {
    if (!candles || candles.length < holdingDays + 2) return null;
    var hits = 0, total = 0;
    var slip = 0.1, broker = 0.05;
    var exitCostFactor = (1 - slip / 100) * (1 - broker / 100);
    var costAdjTarget = (1 + slip / 100) * (1 + broker / 100) * (1 + targetPct / 100) / exitCostFactor;

    for (var i = 0; i < candles.length - holdingDays - 1; i++) {
      var entryBar = candles[i + 1];
      if (!entryBar || entryBar.o == null || !(entryBar.o > 0)) continue;
      var entryPriceAdj = entryBar.o * (1 + slip / 100) * (1 + broker / 100);
      var targetPrice = entryPriceAdj * costAdjTarget;
      
      var maxFwd = -Infinity, valid = false;
      for (var k = i + 1; k <= i + holdingDays + 1 && k < candles.length; k++) {
        var ch = candles[k]; if (!ch) continue;
        if (ch.h != null && isFinite(ch.h) && ch.h > 0) { valid = true; if (ch.h > maxFwd) maxFwd = ch.h; }
        else if (ch.c != null && isFinite(ch.c) && ch.c > 0) { valid = true; if (ch.c > maxFwd) maxFwd = ch.c; }
      }
      if (!valid || maxFwd === -Infinity) continue;
      if (maxFwd >= targetPrice) hits++;
      total++;
    }
    return total > 0 ? hits / total : null;
  }

  function evidenceScore(opts) {
    var n = opts.n || 0, excessWR = opts.excessWR != null ? opts.excessWR : 0;
    var pAdj = opts.pValue != null ? Math.min(1, opts.pValue * (opts.numTests || 1)) : null;
    var s = 0;
    if (excessWR >= 5) s += 2; else if (excessWR >= 3) s += 1; else if (excessWR < 0) s -= 2;
    if (pAdj != null) { if (pAdj < 0.05) s += 2; else if (pAdj < 0.1) s += 1; else if (pAdj > 0.2) s -= 1; }
    if (n >= 200) s += 1; else if (n < 50) s -= 1;
    return { score: s, pAdj: pAdj, evidenceLevel: s >= 3 ? "strong" : s >= 1 ? "moderate" : s <= -2 ? "reject" : "weak" };
  }

  function adaptiveThreshold(history, fallback, pct) {
    if (!history || history.length < 30) return fallback;
    var sorted = history.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.min(Math.floor(sorted.length * (pct / 100)), sorted.length - 1)];
  }

  return {
    wilsonLowerBound: wilsonLowerBound, wilsonCI: wilsonCI, permutationP: permutationP,
    bootstrapCI: bootstrapCI, blockBootstrapCI: blockBootstrapCI,
    purgedWalkForward: purgedWalkForward, scoreRank: scoreRank,
    baselineHitRate: baselineHitRate, evidenceScore: evidenceScore,
    adaptiveThreshold: adaptiveThreshold
  };
})();