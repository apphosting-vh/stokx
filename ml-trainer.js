/* ══════════════════════════════════════════════════════════════════════════
   ML Trainer — StoX
   In-browser machine learning using a custom lightweight neural network
   (no external dependencies). Trains on backtest feature data stored
   in PatternStore and produces prediction-ready models.

   Architecture:
     - Simple Dense NN: input(10) → dense(32, ReLU) → dense(16, ReLU) → output(1, Sigmoid)
     - Trained via mini-batch SGD with binary cross-entropy loss
     - Models stored in PatternStore as serializable weight arrays

   Dependencies: window.PatternStore

   Usage:
     await PatternStore.init();
     var trainer = MLTrainer.create({ hiddenUnits: [32, 16], learningRate: 0.01, epochs: 50 });
     var result = await trainer.train({ onEpoch: (epoch, loss, acc) => {} });
     var prediction = MLTrainer.predict(features); // 0-1 probability
   ══════════════════════════════════════════════════════════════════════════ */

window.MLTrainer = (function () {

  /* ── Math Utilities ──────────────────────────────────────────────────── */
  function sigmoid(x) {
    if (x > 500) return 1;
    if (x < -500) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function relu(x) { return Math.max(0, x); }

  function randomNormal() {
    // Box-Muller transform
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

  function zeros(rows, cols) {
    var m = [];
    for (var i = 0; i < rows; i++) {
      m[i] = [];
      for (var j = 0; j < cols; j++) m[i][j] = 0;
    }
    return m;
  }

  function matMul(A, B) {
    // A: m×n, B: n×p → C: m×p
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

  function transpose(A) {
    var m = A.length, n = A[0].length;
    var T = [];
    for (var j = 0; j < n; j++) {
      T[j] = [];
      for (var i = 0; i < m; i++) T[j][i] = A[i][j];
    }
    return T;
  }

  /* ── Feature Normalizer ─────────────────────────────────────────────── */
  function createNormalizer() {
    var means = {};
    var stds = {};

    function fit(data) {
      // data: array of { features: { rsi, macd_hist, ... } }
      var keys = data.length > 0 ? Object.keys(data[0].features) : [];
      keys.forEach(function (k) {
        var vals = data.map(function (d) { return d.features[k]; }).filter(function (v) { return v != null && !isNaN(v); });
        if (vals.length < 5) { means[k] = 0; stds[k] = 1; return; }
        var sum = vals.reduce(function (s, v) { return s + v; }, 0);
        means[k] = sum / vals.length;
        var variance = vals.reduce(function (s, v) { return s + (v - means[k]) * (v - means[k]); }, 0) / vals.length;
        stds[k] = Math.sqrt(variance) > 1e-8 ? Math.sqrt(variance) : 1;
      });
    }

    function transform(features) {
      var result = {};
      Object.keys(features).forEach(function (k) {
        result[k] = ((features[k] || 0) - (means[k] || 0)) / (stds[k] || 1);
      });
      return result;
    }

    function getParams() { return { means: means, stds: stds }; }

    return { fit: fit, transform: transform, getParams: getParams };
  }

  /* ── Dense Neural Network ────────────────────────────────────────────── */

  function createDenseNN(inputSize, hiddenUnits) {
    hiddenUnits = hiddenUnits || [32, 16];
    var layers = [];
    var prevSize = inputSize;

    // Create weight matrices and bias vectors
    hiddenUnits.forEach(function (units) {
      layers.push({
        W: [], // weights: prevSize × units
        b: new Array(units), // bias: units
        activation: "relu"
      });
      // Initialize weights with He initialization
      for (var i = 0; i < prevSize; i++) {
        layers[layers.length - 1].W[i] = [];
        for (var j = 0; j < units; j++) {
          layers[layers.length - 1].W[i][j] = heInit(prevSize);
        }
      }
      for (var j = 0; j < units; j++) {
        layers[layers.length - 1].b[j] = 0;
      }
      prevSize = units;
    });

    // Output layer: 1 unit, sigmoid
    layers.push({
      W: [],
      b: [0],
      activation: "sigmoid"
    });
    for (var i = 0; i < prevSize; i++) {
      layers[layers.length - 1].W[i] = [heInit(prevSize)];
    }

    return { layers: layers, inputSize: inputSize, hiddenUnits: hiddenUnits };
  }

  function forward(nn, inputVector) {
    // inputVector: array of length inputSize
    var activations = [inputVector.slice()];
    var preActivations = [];

    for (var l = 0; l < nn.layers.length; l++) {
      var layer = nn.layers[l];
      var prev = activations[activations.length - 1];
      var output = new Array(layer.b.length);

      for (var j = 0; j < layer.b.length; j++) {
        var sum = layer.b[j];
        for (var i = 0; i < prev.length; i++) {
          sum += prev[i] * layer.W[i][j];
        }
        output[j] = layer.activation === "sigmoid" ? sigmoid(sum) : relu(sum);
      }

      preActivations.push(output.slice());
      activations.push(output);
    }

    return { output: activations[activations.length - 1][0], activations: activations, preActivations: preActivations };
  }

  function backward(nn, inputVector, target, lr) {
    // Binary cross-entropy loss gradient
    var lr_layer = lr || 0.01;
    var result = forward(nn, inputVector);
    var predicted = result.output;
    var activations = result.activations;

    var numLayers = nn.layers.length;
    var deltas = new Array(numLayers);

    // Output layer delta (sigmoid + BCE)
    var outputIdx = numLayers - 1;
    deltas[outputIdx] = [predicted - target];

    // Hidden layer deltas
    for (var l = numLayers - 2; l >= 0; l--) {
      var layer = nn.layers[l];
      var nextLayer = nn.layers[l + 1];
      deltas[l] = new Array(layer.b.length);

      for (var i = 0; i < layer.b.length; i++) {
        var sum = 0;
        for (var j = 0; j < nextLayer.b.length; j++) {
          sum += nextLayer.W[i][j] * deltas[l + 1][j];
        }
        // ReLU derivative
        deltas[l][i] = activations[l + 1][i] > 0 ? sum : 0;
      }
    }

    // Update weights and biases
    for (var l = 0; l < numLayers; l++) {
      var layer = nn.layers[l];
      var prevAct = activations[l];

      // Update biases
      for (var j = 0; j < layer.b.length; j++) {
        layer.b[j] -= lr_layer * deltas[l][j];
      }

      // Update weights
      for (var i = 0; i < prevAct.length; i++) {
        for (var j = 0; j < layer.b.length; j++) {
          layer.W[i][j] -= lr_layer * prevAct[i] * deltas[l][j];
        }
      }
    }

    return predicted;
  }

  /* ── Feature Keys ────────────────────────────────────────────────────── */
  var FEATURE_KEYS = [
    "rsi", "macd_hist", "bb_position", "atr_pct",
    "obv_trend", "supertrend_dir", "adx", "ema_slope",
    "volume_ratio", "entry_score"
  ];

  /* ── Training ────────────────────────────────────────────────────────── */

  /**
   * Create an ML trainer instance.
   */
  function create(cfg) {
    cfg = cfg || {};
    var hiddenUnits = cfg.hiddenUnits || [32, 16];
    var learningRate = cfg.learningRate || 0.01;
    var epochs = cfg.epochs || 50;
    var batchSize = cfg.batchSize || 32;
    var validationSplit = cfg.validationSplit || 0.2;

    var normalizer = createNormalizer();
    var nn = null;
    var trainingLog = [];

    /**
     * Train the model on features stored in PatternStore.
     */
    async function train(opts) {
      opts = opts || {};
      var onEpoch = opts.onEpoch || function () {};
      var onProgress = opts.onProgress || function () {};

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

      if (validSamples.length < 50) {
        throw new Error("Valid samples too few: " + validSamples.length);
      }

      // Shuffle and split
      var shuffled = shuffle(validSamples);
      var valIdx = Math.floor(shuffled.length * (1 - validationSplit));
      var trainSamples = shuffled.slice(0, valIdx);
      var valSamples = shuffled.slice(valIdx);

      // Fit normalizer on training data only
      normalizer.fit(trainSamples);

      // Create network
      nn = createDenseNN(FEATURE_KEYS.length, hiddenUnits);
      trainingLog = [];

      onProgress(0, epochs, "Training...");

      for (var epoch = 0; epoch < epochs; epoch++) {
        var epochLoss = 0;
        var epochCorrect = 0;
        var trainBatches = shuffle(trainSamples);
        var numBatches = Math.ceil(trainBatches.length / batchSize);

        for (var b = 0; b < numBatches; b++) {
          var batchStart = b * batchSize;
          var batchEnd = Math.min(batchStart + batchSize, trainBatches.length);

          for (var s = batchStart; s < batchEnd; s++) {
            var sample = trainBatches[s];
            var normalized = normalizer.transform(sample.features);
            var inputVector = FEATURE_KEYS.map(function (k) { return normalized[k]; });
            var target = sample.label.is_winner ? 1 : 0;

            var predicted = backward(nn, inputVector, target, learningRate);

            // BCE loss
            var pClamped = Math.max(1e-7, Math.min(1 - 1e-7, predicted));
            epochLoss += -(target * Math.log(pClamped) + (1 - target) * Math.log(1 - pClamped));

            if ((predicted >= 0.5 && target === 1) || (predicted < 0.5 && target === 0)) {
              epochCorrect++;
            }
          }
        }

        var avgLoss = epochLoss / trainSamples.length;
        var trainAcc = (epochCorrect / trainSamples.length) * 100;

        // Validation accuracy
        var valCorrect = 0;
        valSamples.forEach(function (sample) {
          var normalized = normalizer.transform(sample.features);
          var inputVector = FEATURE_KEYS.map(function (k) { return normalized[k]; });
          var result = forward(nn, inputVector);
          if ((result.output >= 0.5 && sample.label.is_winner) || (result.output < 0.5 && !sample.label.is_winner)) {
            valCorrect++;
          }
        });
        var valAcc = (valCorrect / valSamples.length) * 100;

        var logEntry = {
          epoch: epoch + 1,
          loss: Math.round(avgLoss * 1000) / 1000,
          trainAcc: Math.round(trainAcc * 10) / 10,
          valAcc: Math.round(valAcc * 10) / 10
        };
        trainingLog.push(logEntry);
        onEpoch(epoch + 1, avgLoss, trainAcc, valAcc);

        // Yield to UI
        if (epoch % 5 === 0) {
          await new Promise(function (r) { setTimeout(r, 0); });
        }
      }

      onProgress(1, 1, "Saving model...");

      // Save model to PatternStore
      var model = serialize(nn, normalizer);
      if (window.PatternStore) {
        await PatternStore.setMeta("ml_model", model);
        await PatternStore.setMeta("ml_model_meta", {
          trainedAt: Date.now(),
          trainSamples: trainSamples.length,
          valSamples: valSamples.length,
          epochs: epochs,
          finalLoss: trainingLog[trainingLog.length - 1].loss,
          finalTrainAcc: trainingLog[trainingLog.length - 1].trainAcc,
          finalValAcc: trainingLog[trainingLog.length - 1].valAcc,
          featureKeys: FEATURE_KEYS,
          hiddenUnits: hiddenUnits
        });
      }

      return {
        success: true,
        epochs: epochs,
        trainSamples: trainSamples.length,
        valSamples: valSamples.length,
        finalLoss: trainingLog[trainingLog.length - 1].loss,
        finalTrainAcc: trainingLog[trainingLog.length - 1].trainAcc,
        finalValAcc: trainingLog[trainingLog.length - 1].valAcc,
        trainingLog: trainingLog
      };
    }

    return {
      train: train,
      getTrainingLog: function () { return trainingLog; },
      getNetwork: function () { return nn; },
      getNormalizer: function () { return normalizer; }
    };
  }

  /* ── Prediction ─────────────────────────────────────────────────────── */

  /**
   * Predict win probability for a feature vector.
   * features: { rsi, macd_hist, bb_position, atr_pct, obv_trend, supertrend_dir, adx, ema_slope, volume_ratio, entry_score }
   */
  function predict(features) {
    // Try loading saved model
    return _loadModel().then(function (model) {
      if (!model) return null;

      var nn = deserialize(model.network);
      var normParams = model.normalizer;

      // Normalize features
      var normalized = {};
      FEATURE_KEYS.forEach(function (k) {
        var val = features[k] || 0;
        var mean = normParams.means[k] || 0;
        var std = normParams.stds[k] || 1;
        normalized[k] = (val - mean) / std;
      });

      var inputVector = FEATURE_KEYS.map(function (k) { return normalized[k]; });
      var result = forward(nn, inputVector);
      return {
        winProbability: Math.round(result.output * 1000) / 1000,
        recommendation: result.output >= 0.65 ? "STRONG_BUY" :
                         result.output >= 0.55 ? "BUY" :
                         result.output >= 0.45 ? "WATCHLIST" :
                         result.output >= 0.35 ? "NEUTRAL" : "AVOID"
      };
    });
  }

  /**
   * Get model info without loading full weights.
   */
  async function getModelInfo() {
    var meta = null;
    if (window.PatternStore) {
      try {
        await PatternStore.init();
        meta = await PatternStore.getMeta("ml_model_meta");
      } catch (e) {}
    }
    return meta;
  }

  /**
   * Check if a trained model exists.
   */
  async function hasModel() {
    var meta = await getModelInfo();
    return meta != null;
  }

  /* ── Serialization ──────────────────────────────────────────────────── */

  function serialize(nn, normalizer) {
    var networkData = {
      inputSize: nn.inputSize,
      hiddenUnits: nn.hiddenUnits,
      layers: nn.layers.map(function (layer) {
        return {
          W: layer.W,
          b: layer.b,
          activation: layer.activation
        };
      })
    };

    return {
      version: 1,
      network: networkData,
      normalizer: normalizer.getParams(),
      featureKeys: FEATURE_KEYS
    };
  }

  function deserialize(data) {
    var nn = {
      inputSize: data.inputSize,
      hiddenUnits: data.hiddenUnits,
      layers: data.layers.map(function (layer) {
        return {
          W: layer.W,
          b: layer.b,
          activation: layer.activation
        };
      })
    };
    return nn;
  }

  var _cachedModel = null;

  function _loadModel() {
    if (_cachedModel) return Promise.resolve(_cachedModel);
    if (!window.PatternStore) return Promise.resolve(null);
    return PatternStore.init().then(function () {
      return PatternStore.getMeta("ml_model");
    }).then(function (model) {
      _cachedModel = model;
      return model;
    }).catch(function () { return null; });
  }

  function invalidateModelCache() {
    _cachedModel = null;
  }

  return {
    create: create,
    predict: predict,
    getModelInfo: getModelInfo,
    hasModel: hasModel,
    invalidateModelCache: invalidateModelCache,
    FEATURE_KEYS: FEATURE_KEYS
  };
})();
