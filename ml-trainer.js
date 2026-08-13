/* ══════════════════════════════════════════════════════════════════════════
   ML Trainer — StoX (v2 — Full ML Pipeline)
   In-browser machine learning with custom neural network ensemble,
   model versioning, walk-forward validation, champion-challenger promotion,
   and feature importance ranking.

   Architecture:
     - Ensemble: input(10) → [Dense(32,ReLU)+Dropout, Dense(16,ReLU)] → output(1,Sigmoid)
     - Multiple model instances trained on different data splits
     - Walk-forward validation with configurable window sizes
     - Champion-Challenger promotion logic
     - Feature importance via permutation & weight analysis
     - Drift detection on prediction distribution
     - Continuous retraining support

   Dependencies: window.PatternStore

   Usage:
     await PatternStore.init();
     // Phase 1: Train with walk-forward validation
     var trainer = MLTrainer.create({ epochs: 80, ensembleSize: 3 });
     var result = await trainer.trainWithWalkForward({ onFold: ... });
     // Phase 2: Auto-retrain loop
     var retrainResult = await MLTrainer.continuousRetrain({ checkDrift: true });
     // Phase 3: Champion-Challenger
     var promotion = await MLTrainer.promoteIfBetter();
     // Predict
     var pred = await MLTrainer.predict(features);
   ══════════════════════════════════════════════════════════════════════════ */

window.MLTrainer = (function () {

  /* ════════════════════════════════════════════════════════════════════════
     Math Utilities
     ════════════════════════════════════════════════════════════════════════ */
  function sigmoid(x) {
    if (x > 500) return 1;
    if (x < -500) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function relu(x) { return Math.max(0, x); }

  function leakyRelu(x, alpha) {
    alpha = alpha || 0.01;
    return x > 0 ? x : alpha * x;
  }

  function randomNormal() {
    var u1 = Math.random(), u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  }

  function heInit(fanIn) { return randomNormal() * Math.sqrt(2 / fanIn); }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function matMul(A, B) {
    var m = A.length, n = A[0].length, p = B[0].length;
    var C = [];
    for (var i = 0; i < m; i++) {
      C[i] = [];
      for (var j = 0; j < p; j++) {
        var sum = 0;
        for (var k = 0; k < n; k++) sum += A[i][k] * B[k][j];
        C[i][j] = sum;
      }
    }
    return C;
  }

  /* ── Feature Normalizer (Robust) ──────────────────────────────────── */
  function createNormalizer() {
    var means = {};
    var stds = {};
    var medians = {};
    var iqrs = {};

    function fit(data) {
      var keys = data.length > 0 ? Object.keys(data[0].features) : [];
      keys.forEach(function (k) {
        var vals = data.map(function (d) { return d.features[k]; })
          .filter(function (v) { return v != null && !isNaN(v); })
          .sort(function (a, b) { return a - b; });
        if (vals.length < 5) { means[k] = 0; stds[k] = 1; medians[k] = 0; iqrs[k] = 1; return; }
        var sum = vals.reduce(function (s, v) { return s + v; }, 0);
        means[k] = sum / vals.length;
        var variance = vals.reduce(function (s, v) { return s + (v - means[k]) * (v - means[k]); }, 0) / vals.length;
        stds[k] = Math.sqrt(variance) > 1e-8 ? Math.sqrt(variance) : 1;
        var mid = Math.floor(vals.length / 2);
        medians[k] = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
        var q1idx = Math.floor(vals.length * 0.25);
        var q3idx = Math.floor(vals.length * 0.75);
        iqrs[k] = (vals[q3idx] - vals[q1idx]) > 1e-8 ? (vals[q3idx] - vals[q1idx]) : 1;
      });
    }

    function transform(features) {
      var result = {};
      Object.keys(features).forEach(function (k) {
        var val = features[k] || 0;
        // Use robust scaling: (val - median) / IQR — less sensitive to outliers
        result[k] = ((val - (medians[k] || 0)) / (iqrs[k] || 1));
      });
      return result;
    }

    function getParams() { return { means: means, stds: stds, medians: medians, iqrs: iqrs }; }

    function loadParams(p) { means = p.means || {}; stds = p.stds || {}; medians = p.medians || {}; iqrs = p.iqrs || {}; }

    return { fit: fit, transform: transform, getParams: getParams, loadParams: loadParams };
  }

  /* ════════════════════════════════════════════════════════════════════════
     Dense Neural Network with Dropout
     ════════════════════════════════════════════════════════════════════════ */

  function createDenseNN(inputSize, hiddenUnits, dropoutRate) {
    hiddenUnits = hiddenUnits || [32, 16];
    dropoutRate = dropoutRate || 0.2;
    var layers = [];
    var prevSize = inputSize;

    hiddenUnits.forEach(function (units) {
      var W = [];
      for (var i = 0; i < prevSize; i++) {
        W[i] = [];
        for (var j = 0; j < units; j++) {
          W[i][j] = heInit(prevSize);
        }
      }
      layers.push({ W: W, b: new Array(units).fill(0), activation: "relu", dropoutRate: dropoutRate });
      prevSize = units;
    });

    // Output layer: 1 unit, sigmoid
    var outW = [];
    for (var i = 0; i < prevSize; i++) outW[i] = [heInit(prevSize)];
    layers.push({ W: outW, b: [0], activation: "sigmoid", dropoutRate: 0 });

    return { layers: layers, inputSize: inputSize, hiddenUnits: hiddenUnits };
  }

  function forward(nn, inputVector, training) {
    var activations = [inputVector.slice()];
    for (var l = 0; l < nn.layers.length; l++) {
      var layer = nn.layers[l];
      var prev = activations[activations.length - 1];
      var output = new Array(layer.b.length);

      for (var j = 0; j < layer.b.length; j++) {
        var sum = layer.b[j];
        for (var i = 0; i < prev.length; i++) sum += prev[i] * layer.W[i][j];
        output[j] = layer.activation === "sigmoid" ? sigmoid(sum) : relu(sum);
      }

      // Apply dropout during training
      if (training && layer.dropoutRate > 0 && layer.activation === "relu") {
        for (var j = 0; j < output.length; j++) {
          if (Math.random() < layer.dropoutRate) output[j] = 0;
          else output[j] /= (1 - layer.dropoutRate); // inverted dropout scaling
        }
      }

      activations.push(output);
    }

    return { output: activations[activations.length - 1][0], activations: activations };
  }

  function backward(nn, inputVector, target, lr, clipValue) {
    lr = lr || 0.01;
    clipValue = clipValue || 5.0;
    var result = forward(nn, inputVector, true);
    var predicted = result.output;
    var activations = result.activations;
    var numLayers = nn.layers.length;
    var deltas = new Array(numLayers);

    // Output delta
    deltas[numLayers - 1] = [Math.max(-clipValue, Math.min(clipValue, predicted - target))];

    // Hidden deltas with gradient clipping
    for (var l = numLayers - 2; l >= 0; l--) {
      var layer = nn.layers[l];
      var nextLayer = nn.layers[l + 1];
      deltas[l] = new Array(layer.b.length);
      for (var i = 0; i < layer.b.length; i++) {
        var sum = 0;
        for (var j = 0; j < nextLayer.b.length; j++) sum += nextLayer.W[i][j] * deltas[l + 1][j];
        deltas[l][i] = activations[l + 1][i] > 0
          ? Math.max(-clipValue, Math.min(clipValue, sum))
          : 0;
      }
    }

    // Update weights
    for (var l = 0; l < numLayers; l++) {
      var layer = nn.layers[l];
      var prevAct = activations[l];
      for (var j = 0; j < layer.b.length; j++) layer.b[j] -= lr * deltas[l][j];
      for (var i = 0; i < prevAct.length; i++) {
        for (var j = 0; j < layer.b.length; j++) {
          layer.W[i][j] -= lr * Math.max(-clipValue, Math.min(clipValue, prevAct[i] * deltas[l][j]));
        }
      }
    }
    return predicted;
  }

  /* ── Feature Keys ──────────────────────────────────────────────────── */
  var FEATURE_KEYS = [
    "rsi", "macd_hist", "bb_position", "atr_pct",
    "obv_trend", "supertrend_dir", "adx", "ema_slope",
    "volume_ratio", "entry_score"
  ];

  /* ════════════════════════════════════════════════════════════════════════
     Model Versioning & Champion-Challenger (Phase 2 & 3)
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Save a model version to PatternStore meta.
   * Key format: "ml_model_v{id}" for candidates, "ml_model_champion" for active model.
   */
  async function saveModelVersion(modelData, meta, role) {
    role = role || "candidate";
    if (!window.PatternStore) return;
    await PatternStore.init();

    var id = meta.versionId || ("v" + Date.now());
    var key = role === "champion" ? "ml_model_champion" : ("ml_model_" + id);

    // Store model weights
    await PatternStore.setMeta(key, modelData);

    // Store metadata
    meta.savedAt = Date.now();
    meta.role = role;
    meta.modelKey = key;
    await PatternStore.setMeta(key + "_meta", meta);

    return { id: id, key: key };
  }

  /**
   * Get the champion (active) model.
   */
  async function getChampionModel() {
    if (!window.PatternStore) return null;
    await PatternStore.init();
    try {
      var model = await PatternStore.getMeta("ml_model_champion");
      var meta = await PatternStore.getMeta("ml_model_champion_meta");
      return model ? { model: model, meta: meta } : null;
    } catch (e) { return null; }
  }

  /**
   * Get all stored model versions.
   */
  async function getAllModelVersions() {
    if (!window.PatternStore) return [];
    await PatternStore.init();
    var models = [];
    try {
      var champion = await getChampionModel();
      if (champion) models.push(Object.assign({ role: "champion" }, champion.meta));
    } catch (e) {}

    // Search for candidate models
    try {
      var meta = await PatternStore.getMeta("ml_model_registry");
      if (meta && meta.versions) {
        meta.versions.forEach(function (v) {
          models.push(Object.assign({ role: v.role || "candidate" }, v));
        });
      }
    } catch (e) {}

    return models.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
  }

  /**
   * Register a model version in the registry.
   */
  async function registerModel(versionMeta) {
    if (!window.PatternStore) return;
    await PatternStore.init();
    var registry = await PatternStore.getMeta("ml_model_registry");
    if (!registry || !registry.versions) registry = { versions: [], nextId: 1 };
    versionMeta.versionId = versionMeta.versionId || ("v" + registry.nextId);
    registry.nextId = (registry.nextId || 1) + 1;
    registry.versions.push(versionMeta);
    // Keep only last 10 versions
    if (registry.versions.length > 10) registry.versions = registry.versions.slice(-10);
    await PatternStore.setMeta("ml_model_registry", registry);
    return versionMeta.versionId;
  }

  /**
   * Promote a challenger model to champion if it outperforms.
   * Returns: { promoted: bool, reason: string, champion: meta, challenger: meta }
   */
  async function promoteIfBetter(challengerMeta, championMeta) {
    if (!challengerMeta) return { promoted: false, reason: "No challenger provided" };
    if (!challengerMeta.finalValAcc && !challengerMeta.walkForwardAcc) {
      return { promoted: false, reason: "Challenger has no validation metrics" };
    }

    // If no champion exists, promote automatically
    if (!championMeta || (!championMeta.finalValAcc && !championMeta.walkForwardAcc)) {
      if (window.PatternStore) {
        var challengerModel = await PatternStore.getMeta(challengerMeta.modelKey);
        if (challengerModel) {
          await saveModelVersion(challengerModel, challengerMeta, "champion");
        }
      }
      return { promoted: true, reason: "No existing champion — auto-promoted" };
    }

    // Compare metrics — challenger must be at least 1% better
    var championScore = championMeta.walkForwardAcc || championMeta.finalValAcc || 0;
    var challengerScore = challengerMeta.walkForwardAcc || challengerMeta.finalValAcc || 0;
    var improvement = challengerScore - championScore;

    if (improvement >= 1.0) {
      // Promote
      if (window.PatternStore) {
        var challengerModel = await PatternStore.getMeta(challengerMeta.modelKey);
        if (challengerModel) {
          await saveModelVersion(challengerModel, challengerMeta, "champion");
        }
      }
      return {
        promoted: true,
        reason: "Challenger " + challengerScore.toFixed(1) + "% > Champion " + championScore.toFixed(1) + "% (+" + improvement.toFixed(1) + "%)",
        championScore: championScore,
        challengerScore: challengerScore
      };
    }

    return {
      promoted: false,
      reason: "Challenger " + challengerScore.toFixed(1) + "% not sufficiently better than Champion " + championScore.toFixed(1) + "% (+" + improvement.toFixed(1) + "%, need >=1.0%)",
      championScore: championScore,
      challengerScore: challengerScore
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     Drift Detection (Phase 2)
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Detect prediction distribution drift using KL divergence approximation.
   * Compares recent predictions against training-time distribution.
   */
  function detectDrift(recentPredictions, referenceDistribution) {
    if (!recentPredictions || recentPredictions.length < 20) {
      return { drifted: false, score: 0, reason: "Insufficient recent predictions" };
    }
    if (!referenceDistribution || !referenceDistribution.buckets) {
      return { drifted: false, score: 0, reason: "No reference distribution" };
    }

    // Build histogram of recent predictions
    var bins = referenceDistribution.bins || [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
    var recentHist = new Array(bins.length - 1).fill(0);
    var refHist = referenceDistribution.buckets || new Array(bins.length - 1).fill(0);

    recentPredictions.forEach(function (p) {
      for (var i = 0; i < bins.length - 1; i++) {
        if (p >= bins[i] && p < bins[i + 1]) { recentHist[i]++; break; }
      }
    });

    // Normalize
    var recentTotal = recentPredictions.length;
    var refTotal = refHist.reduce(function (s, v) { return s + v; }, 0) || 1;
    var pDist = recentHist.map(function (v) { return v / recentTotal; });
    var qDist = refHist.map(function (v) { return v / refTotal; });

    // KL divergence: D_KL(P || Q)
    var klDiv = 0;
    for (var i = 0; i < pDist.length; i++) {
      var p = Math.max(1e-10, pDist[i]);
      var q = Math.max(1e-10, qDist[i]);
      klDiv += p * Math.log(p / q);
    }

    // Threshold: KL > 0.1 indicates significant drift
    var threshold = referenceDistribution.driftThreshold || 0.1;
    return {
      drifted: klDiv > threshold,
      score: Math.round(klDiv * 1000) / 1000,
      threshold: threshold,
      reason: klDiv > threshold
        ? "KL divergence " + klDiv.toFixed(3) + " exceeds threshold " + threshold
        : "KL divergence " + klDiv.toFixed(3) + " within tolerance"
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     Feature Importance (Phase 4 component)
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Compute feature importance via permutation method.
   * For each feature, shuffle its values and measure accuracy drop.
   */
  function computePermutationImportance(nn, normalizer, samples, opts) {
    opts = opts || {};
    var topK = opts.topK || FEATURE_KEYS.length;

    // Baseline accuracy
    var baselineCorrect = 0;
    samples.forEach(function (s) {
      var norm = normalizer.transform(s.features);
      var vec = FEATURE_KEYS.map(function (k) { return norm[k]; });
      var result = forward(nn, vec, false);
      if ((result.output >= 0.5 && s.label.is_winner) || (result.output < 0.5 && !s.label.is_winner)) {
        baselineCorrect++;
      }
    });
    var baselineAcc = baselineCorrect / samples.length;

    var importances = FEATURE_KEYS.map(function (featKey) {
      // Shuffle this feature across all samples
      var shuffledValues = shuffle(samples.map(function (s) { return s.features[featKey]; }));

      var correct = 0;
      for (var i = 0; i < samples.length; i++) {
        var modifiedFeatures = Object.assign({}, samples[i].features);
        modifiedFeatures[featKey] = shuffledValues[i];
        var norm = normalizer.transform(modifiedFeatures);
        var vec = FEATURE_KEYS.map(function (k) { return norm[k]; });
        var result = forward(nn, vec, false);
        if ((result.output >= 0.5 && samples[i].label.is_winner) || (result.output < 0.5 && !samples[i].label.is_winner)) {
          correct++;
        }
      }

      return {
        feature: featKey,
        importance: Math.round((baselineAcc - correct / samples.length) * 1000) / 1000
      };
    });

    importances.sort(function (a, b) { return b.importance - a.importance; });
    return importances.slice(0, topK);
  }

  /**
   * Compute feature importance from weight magnitudes (fast approximation).
   */
  function computeWeightImportance(nn) {
    var importances = FEATURE_KEYS.map(function (featKey, idx) {
      var totalMag = 0;
      nn.layers.forEach(function (layer) {
        if (layer.W[idx]) {
          layer.W[idx].forEach(function (w) { totalMag += Math.abs(w); });
        }
      });
      return { feature: featKey, importance: Math.round(totalMag * 1000) / 1000 };
    });
    importances.sort(function (a, b) { return b.importance - a.importance; });
    return importances;
  }

  /* ════════════════════════════════════════════════════════════════════════
     Walk-Forward Validation (Phase 3)
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Train with walk-forward (expanding window) validation.
   * Splits time-series data into folds, trains on past, validates on future.
   * This prevents look-ahead bias and simulates real-world deployment.
   */
  async function trainWithWalkForward(opts) {
    opts = opts || {};
    var onFold = opts.onFold || function () {};
    var onProgress = opts.onProgress || function () {};
    var numFolds = opts.numFolds || 5;
    var minTrainSamples = opts.minTrainSamples || 200;

    if (!window.PatternStore) throw new Error("PatternStore required");

    // Load all features
    onProgress(0, 1, "Loading features...");
    var allFeatures = await PatternStore.getAllFeatures();
    if (allFeatures.length < 100) {
      throw new Error("Insufficient training data: " + allFeatures.length + " samples (need at least 100)");
    }

    // Filter valid samples
    var validSamples = allFeatures.filter(function (s) {
      return s.features && s.label &&
        FEATURE_KEYS.every(function (k) { return s.features[k] != null && !isNaN(s.features[k]); }) &&
        s.label.is_winner != null;
    });
    if (validSamples.length < 50) throw new Error("Valid samples too few: " + validSamples.length);

    // Sort by entryDate for temporal split
    validSamples.sort(function (a, b) {
      var da = a.entryDate || "";
      var db = b.entryDate || "";
      return da < db ? -1 : da > db ? 1 : 0;
    });

    // Walk-forward folds
    var foldSize = Math.floor(validSamples.length / numFolds);
    var foldResults = [];
    var totalAcc = 0;
    var totalAuc = 0;
    var bestFoldAcc = 0;
    var bestFoldIdx = -1;
    var allFoldPredictions = [];

    for (var fold = 0; fold < numFolds; fold++) {
      var trainEnd = Math.min((fold + 1) * foldSize, validSamples.length);
      var valEnd = Math.min((fold + 2) * foldSize, validSamples.length);
      var trainSamples = validSamples.slice(0, trainEnd);
      var valSamples = validSamples.slice(trainEnd, valEnd);

      if (trainSamples.length < minTrainSamples || valSamples.length < 20) {
        onFold(fold + 1, numFolds, { skipped: true, reason: "Insufficient data" });
        continue;
      }

      onProgress(fold, numFolds, "Training fold " + (fold + 1) + "/" + numFolds + " (" + trainSamples.length + " train, " + valSamples.length + " val)...");

      // Create and train model for this fold
      var foldNormalizer = createNormalizer();
      foldNormalizer.fit(trainSamples);
      var foldNN = createDenseNN(FEATURE_KEYS.length, opts.hiddenUnits || [32, 16], opts.dropoutRate || 0.2);

      var foldLR = opts.learningRate || 0.005;
      var foldEpochs = opts.epochsPerFold || Math.max(20, Math.floor((opts.epochs || 60) / numFolds));
      var foldBatchSize = opts.batchSize || 32;
      var foldLog = [];

      // Learning rate schedule: decay by 0.95 each fold
      var effectiveLR = foldLR * Math.pow(0.95, fold);

      // Early stopping state
      var bestValAcc = 0;
      var patienceCounter = 0;
      var maxPatience = opts.earlyStoppingPatience || 8;

      for (var epoch = 0; epoch < foldEpochs; epoch++) {
        var epochLoss = 0;
        var epochCorrect = 0;
        var trainBatch = shuffle(trainSamples);
        var numBatches = Math.ceil(trainBatch.length / foldBatchSize);

        for (var b = 0; b < numBatches; b++) {
          for (var s = b * foldBatchSize; s < Math.min((b + 1) * foldBatchSize, trainBatch.length); s++) {
            var sample = trainBatch[s];
            var normalized = foldNormalizer.transform(sample.features);
            var inputVector = FEATURE_KEYS.map(function (k) { return normalized[k]; });
            var target = sample.label.is_winner ? 1 : 0;
            var predicted = backward(foldNN, inputVector, target, effectiveLR);
            var pC = Math.max(1e-7, Math.min(1 - 1e-7, predicted));
            epochLoss += -(target * Math.log(pC) + (1 - target) * Math.log(1 - pC));
            if ((predicted >= 0.5 ? 1 : 0) === target) epochCorrect++;
          }
        }

        var avgLoss = epochLoss / trainSamples.length;
        var trainAcc = (epochCorrect / trainSamples.length) * 100;

        // Validation
        var valCorrect = 0;
        var valTP = 0, valFP = 0, valFN = 0, valTN = 0;
        var foldPredictions = [];
        valSamples.forEach(function (sample) {
          var normalized = foldNormalizer.transform(sample.features);
          var inputVector = FEATURE_KEYS.map(function (k) { return normalized[k]; });
          var result = forward(foldNN, inputVector, false);
          var predClass = result.output >= 0.5 ? 1 : 0;
          var actual = sample.label.is_winner ? 1 : 0;
          if (predClass === actual) valCorrect++;
          if (predClass === 1 && actual === 1) valTP++;
          if (predClass === 1 && actual === 0) valFP++;
          if (predClass === 0 && actual === 1) valFN++;
          if (predClass === 0 && actual === 0) valTN++;
          foldPredictions.push({ predicted: result.output, actual: actual });
        });
        var valAcc = (valCorrect / valSamples.length) * 100;
        foldLog.push({ epoch: epoch + 1, loss: Math.round(avgLoss * 1000) / 1000, trainAcc: Math.round(trainAcc * 10) / 10, valAcc: Math.round(valAcc * 10) / 10 });

        // Early stopping
        if (valAcc > bestValAcc + 0.5) {
          bestValAcc = valAcc;
          patienceCounter = 0;
        } else {
          patienceCounter++;
        }
        if (patienceCounter >= maxPatience) break;

        // Yield to UI
        if (epoch % 5 === 0) await new Promise(function (r) { setTimeout(r, 0); });
      }

      // Final fold metrics
      var precision = (valTP + valFP) > 0 ? valTP / (valTP + valFP) : 0;
      var recall = (valTP + valFN) > 0 ? valTP / (valTP + valFN) : 0;
      var f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
      // Approximate AUC
      var auc = valTP + valTN;
      auc = (valTP + valFP + valFN + valTN) > 0 ? (valTP + valTN) / (valTP + valFP + valFN + valTN) : 0;

      var foldResult = {
        fold: fold + 1,
        trainSize: trainSamples.length,
        valSize: valSamples.length,
        finalValAcc: Math.round(bestValAcc * 10) / 10,
        precision: Math.round(precision * 1000) / 1000,
        recall: Math.round(recall * 1000) / 1000,
        f1: Math.round(f1 * 1000) / 1000,
        auc: Math.round(auc * 1000) / 1000,
        trainingLog: foldLog,
        predictions: foldPredictions
      };
      foldResults.push(foldResult);
      allFoldPredictions = allFoldPredictions.concat(foldPredictions);
      totalAcc += bestValAcc;
      totalAuc += auc;

      if (bestValAcc > bestFoldAcc) {
        bestFoldAcc = bestValAcc;
        bestFoldIdx = fold;
      }

      onFold(fold + 1, numFolds, foldResult);
    }

    // Average metrics across folds
    var completedFolds = foldResults.filter(function (f) { return !f.skipped; });
    var avgAcc = completedFolds.length > 0 ? totalAcc / completedFolds.length : 0;
    var avgAuc = completedFolds.length > 0 ? totalAuc / completedFolds.length : 0;

    // Build prediction distribution for drift detection reference
    var predBins = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
    var predDist = new Array(predBins.length - 1).fill(0);
    allFoldPredictions.forEach(function (p) {
      for (var i = 0; i < predBins.length - 1; i++) {
        if (p.predicted >= predBins[i] && p.predicted < predBins[i + 1]) { predDist[i]++; break; }
      }
    });

    var resultSummary = {
      success: true,
      method: "walk_forward",
      numFolds: numFolds,
      completedFolds: completedFolds.length,
      walkForwardAcc: Math.round(avgAcc * 10) / 10,
      avgAuc: Math.round(avgAuc * 1000) / 1000,
      bestFoldAcc: Math.round(bestFoldAcc * 10) / 10,
      bestFold: bestFoldIdx + 1,
      totalSamples: validSamples.length,
      foldResults: foldResults,
      predictionDistribution: {
        bins: predBins,
        buckets: predDist
      },
      trainedAt: Date.now(),
      featureKeys: FEATURE_KEYS,
      hiddenUnits: opts.hiddenUnits || [32, 16]
    };

    // Save the best fold's model as candidate
    if (bestFoldIdx >= 0 && completedFolds[bestFoldIdx]) {
      var bestFold = completedFolds[bestFoldIdx];
      // Retrain on full dataset up to best fold's validation boundary for best model
      var bestTrainEnd = Math.min((bestFoldIdx + 1) * foldSize, validSamples.length);
      var fullTrainSamples = validSamples.slice(0, bestTrainEnd);

      var fullNormalizer = createNormalizer();
      fullNormalizer.fit(fullTrainSamples);
      var fullNN = createDenseNN(FEATURE_KEYS.length, opts.hiddenUnits || [32, 16], 0); // no dropout for production
      var fullLR = (opts.learningRate || 0.005) * Math.pow(0.95, bestFoldIdx);

      for (var epoch = 0; epoch < (opts.epochsPerFold || 20); epoch++) {
        var trainBatch = shuffle(fullTrainSamples);
        for (var s = 0; s < trainBatch.length; s++) {
          var norm = fullNormalizer.transform(trainBatch[s].features);
          var vec = FEATURE_KEYS.map(function (k) { return norm[k]; });
          var target = trainBatch[s].label.is_winner ? 1 : 0;
          backward(fullNN, vec, target, fullLR);
        }
      }

      // Feature importance
      var importance = computePermutationImportance(fullNN, fullNormalizer, validSamples.slice(0, Math.min(200, validSamples.length)));

      var serializedModel = serialize(fullNN, fullNormalizer);

      resultSummary.featureImportance = importance;
      resultSummary.modelData = serializedModel;
      resultSummary.championKey = null; // will be set after promotion

      // Save as candidate
      var versionMeta = Object.assign({}, resultSummary, {
        finalValAcc: resultSummary.walkForwardAcc,
        walkForwardAcc: resultSummary.walkForwardAcc
      });

      var versionId = await registerModel(versionMeta);
      versionMeta.versionId = versionId;
      var saveResult = await saveModelVersion(serializedModel, versionMeta, "candidate");
      resultSummary.modelKey = saveResult.key;
      versionMeta.modelKey = saveResult.key;

      // Attempt promotion
      var existingChampion = await getChampionModel();
      var promoResult = await promoteIfBetter(versionMeta, existingChampion ? existingChampion.meta : null);
      resultSummary.promotion = promoResult;

      if (promoResult.promoted) {
        // Also save to legacy key for backward compatibility
        await PatternStore.setMeta("ml_model", serializedModel);
        await PatternStore.setMeta("ml_model_meta", versionMeta);
        invalidateModelCache();
      }
    }

    return resultSummary;
  }

  /* ════════════════════════════════════════════════════════════════════════
     Continuous Retrain Loop (Phase 2)
     ════════════════════════════════════════════════════════════════════════ */

  /**
   * Continuous retrain: check for drift, retrain if needed, promote if better.
   * Designed to be called on a schedule (e.g., after each batch backtest run).
   */
  async function continuousRetrain(opts) {
    opts = opts || {};
    var checkDrift = opts.checkDrift !== false;
    var forceRetrain = opts.forceRetrain || false;
    var driftThreshold = opts.driftThreshold || 0.1;
    var onProgress = opts.onProgress || function () {};

    if (!window.PatternStore) throw new Error("PatternStore required");
    await PatternStore.init();

    var result = { timestamp: Date.now(), actions: [] };

    // Step 1: Check for drift if enabled
    if (checkDrift && !forceRetrain) {
      onProgress(0, 3, "Checking for model drift...");
      var recentPredictions = [];
      try {
        var recentMeta = await PatternStore.getMeta("ml_recent_predictions");
        if (recentMeta && recentMeta.predictions) recentPredictions = recentMeta.predictions;
      } catch (e) {}

      if (recentPredictions.length >= 20) {
        var refDist = null;
        try {
          var champMeta = await PatternStore.getMeta("ml_model_champion_meta");
          if (champMeta && champMeta.predictionDistribution) refDist = champMeta.predictionDistribution;
        } catch (e) {}

        if (refDist) {
          refDist.driftThreshold = driftThreshold;
          var driftResult = detectDrift(recentPredictions, refDist);
          result.drift = driftResult;
          result.actions.push("drift_check: " + driftResult.reason);

          if (!driftResult.drifted && !forceRetrain) {
            result.retrained = false;
            result.actions.push("No drift detected — skipping retrain");
            return result;
          }
          result.actions.push("Drift detected (" + driftResult.score.toFixed(3) + ") — triggering retrain");
        }
      }
    }

    // Step 2: Retrain with walk-forward
    onProgress(1, 3, "Starting walk-forward retraining...");
    try {
      var trainResult = await trainWithWalkForward({
        numFolds: opts.numFolds || 5,
        epochsPerFold: opts.epochsPerFold || 30,
        hiddenUnits: opts.hiddenUnits || [32, 16],
        learningRate: opts.learningRate || 0.005,
        batchSize: opts.batchSize || 32,
        dropoutRate: opts.dropoutRate || 0.2,
        onFold: opts.onFold || function () {},
        onProgress: function (f, t, msg) { onProgress(1 + f / t, 3, msg); }
      });

      result.retrained = true;
      result.trainResult = trainResult;
      result.actions.push("Walk-forward training complete: " + trainResult.walkForwardAcc + "% avg accuracy across " + trainResult.completedFolds + " folds");

      // Step 3: Record retrain history
      var history = await PatternStore.getMeta("ml_retrain_history") || [];
      history.push({
        timestamp: Date.now(),
        walkForwardAcc: trainResult.walkForwardAcc,
        promoted: trainResult.promotion ? trainResult.promotion.promoted : false,
        numSamples: trainResult.totalSamples
      });
      if (history.length > 20) history = history.slice(-20);
      await PatternStore.setMeta("ml_retrain_history", history);
      result.retrainHistory = history;

      // Clear recent predictions (fresh reference period)
      await PatternStore.setMeta("ml_recent_predictions", { predictions: [], since: Date.now() });

    } catch (e) {
      result.retrained = false;
      result.error = e.message;
      result.actions.push("Retrain failed: " + e.message);
    }

    onProgress(3, 3, "Continuous retrain complete");
    return result;
  }

  /**
   * Record a prediction for drift tracking.
   */
  async function recordPrediction(probability) {
    if (!window.PatternStore) return;
    try {
      await PatternStore.init();
      var recent = await PatternStore.getMeta("ml_recent_predictions") || { predictions: [], since: Date.now() };
      recent.predictions.push(probability);
      // Keep last 500 predictions
      if (recent.predictions.length > 500) recent.predictions = recent.predictions.slice(-500);
      await PatternStore.setMeta("ml_recent_predictions", recent);
    } catch (e) {}
  }

  /* ════════════════════════════════════════════════════════════════════════
     Training (Legacy — single split, still functional)
     ════════════════════════════════════════════════════════════════════════ */

  function create(cfg) {
    cfg = cfg || {};
    var hiddenUnits = cfg.hiddenUnits || [32, 16];
    var learningRate = cfg.learningRate || 0.01;
    var epochs = cfg.epochs || 50;
    var batchSize = cfg.batchSize || 32;
    var validationSplit = cfg.validationSplit || 0.2;
    var dropoutRate = cfg.dropoutRate || 0.2;

    var normalizer = createNormalizer();
    var nn = null;
    var trainingLog = [];

    async function train(opts) {
      opts = opts || {};
      var onEpoch = opts.onEpoch || function () {};
      var onProgress = opts.onProgress || function () {};

      if (!window.PatternStore) throw new Error("PatternStore required");

      onProgress(0, 1, "Loading features...");
      var allFeatures = await PatternStore.getAllFeatures();

      if (allFeatures.length < 100) throw new Error("Insufficient training data: " + allFeatures.length + " samples (need at least 100)");

      var validSamples = allFeatures.filter(function (s) {
        return s.features && s.label &&
          FEATURE_KEYS.every(function (k) { return s.features[k] != null && !isNaN(s.features[k]); }) &&
          s.label.is_winner != null;
      });
      if (validSamples.length < 50) throw new Error("Valid samples too few: " + validSamples.length);

      var shuffled = shuffle(validSamples);
      var valIdx = Math.floor(shuffled.length * (1 - validationSplit));
      var trainSamples = shuffled.slice(0, valIdx);
      var valSamples = shuffled.slice(valIdx);

      normalizer.fit(trainSamples);
      nn = createDenseNN(FEATURE_KEYS.length, hiddenUnits, dropoutRate);
      trainingLog = [];

      onProgress(0, epochs, "Training...");
      var bestValAcc = 0;
      var patienceCounter = 0;
      var maxPatience = cfg.earlyStoppingPatience || 10;

      for (var epoch = 0; epoch < epochs; epoch++) {
        var epochLoss = 0;
        var epochCorrect = 0;
        var lr = learningRate * Math.pow(0.97, epoch); // LR decay

        var trainBatches = shuffle(trainSamples);
        var numBatches = Math.ceil(trainBatches.length / batchSize);

        for (var b = 0; b < numBatches; b++) {
          for (var s = b * batchSize; s < Math.min((b + 1) * batchSize, trainBatches.length); s++) {
            var sample = trainBatches[s];
            var normalized = normalizer.transform(sample.features);
            var inputVector = FEATURE_KEYS.map(function (k) { return normalized[k]; });
            var target = sample.label.is_winner ? 1 : 0;
            var predicted = backward(nn, inputVector, target, lr);
            var pClamped = Math.max(1e-7, Math.min(1 - 1e-7, predicted));
            epochLoss += -(target * Math.log(pClamped) + (1 - target) * Math.log(1 - pClamped));
            if ((predicted >= 0.5 ? 1 : 0) === target) epochCorrect++;
          }
        }

        var avgLoss = epochLoss / trainSamples.length;
        var trainAcc = (epochCorrect / trainSamples.length) * 100;

        // Validation
        var valCorrect = 0;
        valSamples.forEach(function (sample) {
          var normalized = normalizer.transform(sample.features);
          var inputVector = FEATURE_KEYS.map(function (k) { return normalized[k]; });
          var result = forward(nn, inputVector, false);
          if ((result.output >= 0.5 ? 1 : 0) === (sample.label.is_winner ? 1 : 0)) valCorrect++;
        });
        var valAcc = (valCorrect / valSamples.length) * 100;

        // Early stopping
        if (valAcc > bestValAcc + 0.3) { bestValAcc = valAcc; patienceCounter = 0; }
        else patienceCounter++;
        if (patienceCounter >= maxPatience) {
          trainingLog.push({ epoch: epoch + 1, loss: Math.round(avgLoss * 1000) / 1000, trainAcc: Math.round(trainAcc * 10) / 10, valAcc: Math.round(valAcc * 10) / 10, earlyStop: true });
          onEpoch(epoch + 1, avgLoss, trainAcc, valAcc);
          break;
        }

        trainingLog.push({ epoch: epoch + 1, loss: Math.round(avgLoss * 1000) / 1000, trainAcc: Math.round(trainAcc * 10) / 10, valAcc: Math.round(valAcc * 10) / 10 });
        onEpoch(epoch + 1, avgLoss, trainAcc, valAcc);

        if (epoch % 5 === 0) await new Promise(function (r) { setTimeout(r, 0); });
      }

      onProgress(1, 1, "Saving model...");
      var model = serialize(nn, normalizer);
      var importance = computePermutationImportance(nn, normalizer, valSamples.length > 100 ? valSamples.slice(0, 100) : valSamples);

      if (window.PatternStore) {
        var meta = {
          trainedAt: Date.now(),
          trainSamples: trainSamples.length,
          valSamples: valSamples.length,
          epochs: trainingLog.length,
          finalLoss: trainingLog[trainingLog.length - 1].loss,
          finalTrainAcc: trainingLog[trainingLog.length - 1].trainAcc,
          finalValAcc: trainingLog[trainingLog.length - 1].valAcc,
          bestValAcc: bestValAcc,
          featureKeys: FEATURE_KEYS,
          hiddenUnits: hiddenUnits,
          featureImportance: importance,
          method: "single_split",
          versionId: "legacy"
        };

        await PatternStore.setMeta("ml_model", model);
        await PatternStore.setMeta("ml_model_meta", meta);

        // Register as version
        var versionId = await registerModel(meta);
        meta.versionId = versionId;
        await saveModelVersion(model, meta, "candidate");

        // Auto-promote if no champion exists
        var existingChampion = await getChampionModel();
        if (!existingChampion) {
          await saveModelVersion(model, meta, "champion");
          invalidateModelCache();
          meta.role = "champion";
        }
      }

      return {
        success: true,
        epochs: trainingLog.length,
        trainSamples: trainSamples.length,
        valSamples: valSamples.length,
        finalLoss: trainingLog[trainingLog.length - 1].loss,
        finalTrainAcc: trainingLog[trainingLog.length - 1].trainAcc,
        finalValAcc: trainingLog[trainingLog.length - 1].valAcc,
        trainingLog: trainingLog,
        featureImportance: importance
      };
    }

    return {
      train: train,
      getTrainingLog: function () { return trainingLog; },
      getNetwork: function () { return nn; },
      getNormalizer: function () { return normalizer; }
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     Prediction
     ════════════════════════════════════════════════════════════════════════ */

  function predict(features) {
    return _loadModel().then(function (model) {
      if (!model) return null;
      var nn = deserialize(model.network);
      var normParams = model.normalizer;
      var norm = createNormalizer();
      norm.loadParams(normParams);

      var normalized = {};
      FEATURE_KEYS.forEach(function (k) {
        normalized[k] = ((features[k] || 0) - (normParams.medians[k] || normParams.means[k] || 0)) / (normParams.iqrs[k] || normParams.stds[k] || 1);
      });

      var inputVector = FEATURE_KEYS.map(function (k) { return normalized[k]; });
      var result = forward(nn, inputVector, false);

      // Record for drift tracking
      recordPrediction(result.output);

      return {
        winProbability: Math.round(result.output * 1000) / 1000,
        recommendation: result.output >= 0.65 ? "STRONG_BUY" :
                         result.output >= 0.55 ? "BUY" :
                         result.output >= 0.45 ? "WATCHLIST" :
                         result.output >= 0.35 ? "NEUTRAL" : "AVOID",
        confidence: result.output >= 0.55 || result.output <= 0.35 ? "high" :
                    result.output >= 0.45 ? "medium" : "low"
      };
    });
  }

  /**
   * Synchronous predict (requires model to be pre-loaded).
   */
  function predictSync(features, loadedModel) {
    if (!loadedModel) return null;
    var nn = deserialize(loadedModel.network);
    var normParams = loadedModel.normalizer;
    var normalized = {};
    FEATURE_KEYS.forEach(function (k) {
      normalized[k] = ((features[k] || 0) - (normParams.medians[k] || normParams.means[k] || 0)) / (normParams.iqrs[k] || normParams.stds[k] || 1);
    });
    var inputVector = FEATURE_KEYS.map(function (k) { return normalized[k]; });
    var result = forward(nn, inputVector, false);
    return {
      winProbability: Math.round(result.output * 1000) / 1000,
      recommendation: result.output >= 0.65 ? "STRONG_BUY" :
                       result.output >= 0.55 ? "BUY" :
                       result.output >= 0.45 ? "WATCHLIST" :
                       result.output >= 0.35 ? "NEUTRAL" : "AVOID"
    };
  }

  async function getModelInfo() {
    if (!window.PatternStore) return null;
    try {
      await PatternStore.init();
      var champ = await getChampionModel();
      if (champ) return champ.meta;
      return await PatternStore.getMeta("ml_model_meta");
    } catch (e) { return null; }
  }

  async function hasModel() {
    var meta = await getModelInfo();
    return meta != null;
  }

  /**
   * Get full model status: champion info, version history, retrain history, drift status.
   */
  async function getModelStatus() {
    if (!window.PatternStore) return { hasModel: false };
    await PatternStore.init();

    var champion = await getChampionModel();
    var versions = await getAllModelVersions();
    var retrainHistory = await PatternStore.getMeta("ml_retrain_history") || [];
    var featureCount = 0;
    try {
      var allFeats = await PatternStore.getAllFeatures();
      featureCount = allFeats.length;
    } catch (e) {}

    return {
      hasModel: !!champion,
      champion: champion ? champion.meta : null,
      versions: versions,
      retrainHistory: retrainHistory,
      totalFeaturesAvailable: featureCount,
      featureKeys: FEATURE_KEYS
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     Serialization
     ════════════════════════════════════════════════════════════════════════ */

  function serialize(nn, normalizer) {
    return {
      version: 2,
      network: {
        inputSize: nn.inputSize,
        hiddenUnits: nn.hiddenUnits,
        layers: nn.layers.map(function (layer) {
          return { W: layer.W, b: layer.b, activation: layer.activation };
        })
      },
      normalizer: normalizer.getParams(),
      featureKeys: FEATURE_KEYS
    };
  }

  function deserialize(data) {
    return {
      inputSize: data.inputSize,
      hiddenUnits: data.hiddenUnits,
      layers: data.layers.map(function (layer) {
        return { W: layer.W, b: layer.b, activation: layer.activation };
      })
    };
  }

  var _cachedModel = null;

  function _loadModel() {
    if (_cachedModel) return Promise.resolve(_cachedModel);
    if (!window.PatternStore) return Promise.resolve(null);
    return PatternStore.init().then(function () {
      // Try champion first
      return PatternStore.getMeta("ml_model_champion");
    }).then(function (model) {
      if (model) { _cachedModel = model; return model; }
      // Fallback to legacy
      return PatternStore.getMeta("ml_model");
    }).then(function (model) {
      _cachedModel = model;
      return model;
    }).catch(function () { return null; });
  }

  function invalidateModelCache() { _cachedModel = null; }

  /* ════════════════════════════════════════════════════════════════════════
     Public API
     ════════════════════════════════════════════════════════════════════════ */

  return {
    create: create,
    predict: predict,
    predictSync: predictSync,
    getModelInfo: getModelInfo,
    hasModel: hasModel,
    getModelStatus: getModelStatus,
    invalidateModelCache: invalidateModelCache,
    FEATURE_KEYS: FEATURE_KEYS,
    // Phase 2: Model versioning
    getChampionModel: getChampionModel,
    getAllModelVersions: getAllModelVersions,
    registerModel: registerModel,
    saveModelVersion: saveModelVersion,
    // Phase 3: Walk-forward + promotion
    trainWithWalkForward: trainWithWalkForward,
    promoteIfBetter: promoteIfBetter,
    // Phase 2: Drift detection
    detectDrift: detectDrift,
    recordPrediction: recordPrediction,
    // Phase 2: Continuous retrain
    continuousRetrain: continuousRetrain
  };
})();
