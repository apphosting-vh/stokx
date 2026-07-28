/* ══════════════════════════════════════════════════════════════════════════
   SYNC MODULE — StoX
   File System Access API auto-save + Google Drive 2-way sync
   ══════════════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────────────────
   PART 1 — FILE SYSTEM ACCESS API (FSA) AUTO-SAVE
   ────────────────────────────────────────────────────────────────────────── */

var FSA_IDB_NAME = "stox_fsa_db";
var FSA_IDB_STORE = "handles";
var FSA_IDB_KEY = "saveFileHandle";

var fsaSupported = function() {
  if (typeof window.showSaveFilePicker !== "function") return false;
  if (typeof FileSystemFileHandle === "undefined" || typeof FileSystemFileHandle.prototype.createWritable !== "function") return false;
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean")
    return !navigator.userAgentData.mobile;
  return !/Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/* ── FSA IndexedDB (separate from StoX main DB) ── */
var _fsaDbOpen = function() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(FSA_IDB_NAME, 1);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(FSA_IDB_STORE)) db.createObjectStore(FSA_IDB_STORE);
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function(e) { reject(e.target.error); };
  });
};

var fsaGetHandle = async function() {
  try {
    var db = await _fsaDbOpen();
    return await new Promise(function(resolve, reject) {
      var tx = db.transaction(FSA_IDB_STORE, "readonly");
      var req = tx.objectStore(FSA_IDB_STORE).get(FSA_IDB_KEY);
      req.onsuccess = function(e) { resolve(e.target.result || null); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  } catch (e) { return null; }
};

var fsaSetHandle = async function(handle) {
  try {
    var db = await _fsaDbOpen();
    await new Promise(function(resolve, reject) {
      var tx = db.transaction(FSA_IDB_STORE, "readwrite");
      var req = tx.objectStore(FSA_IDB_STORE).put(handle, FSA_IDB_KEY);
      req.onsuccess = function() { resolve(); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  } catch (e) {}
};

var fsaClearHandle = async function() {
  try {
    var db = await _fsaDbOpen();
    await new Promise(function(resolve, reject) {
      var tx = db.transaction(FSA_IDB_STORE, "readwrite");
      var req = tx.objectStore(FSA_IDB_STORE).delete(FSA_IDB_KEY);
      req.onsuccess = function() { resolve(); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  } catch (e) {}
};

/* ── Permission helpers ── */
var fsaQueryPermission = async function(handle) {
  try { return await handle.queryPermission({ mode: "readwrite" }); }
  catch (e) { return "denied"; }
};
var fsaRequestPermission = async function(handle) {
  try { return await handle.requestPermission({ mode: "readwrite" }); }
  catch (e) { return "denied"; }
};
var fsaVerifyPermission = async function(handle) {
  var q = await fsaQueryPermission(handle);
  if (q === "granted") return true;
  var r = await fsaRequestPermission(handle);
  return r === "granted";
};

/* ── FSA Write: builds StoX envelope and writes to file ── */
var fsaWriteFile = async function(handle, stateData) {
  try {
    var payload = await window.__stoxBuildSyncPayload(stateData, true);
    var writable = await handle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return true;
  } catch (e) {
    console.warn("[FSA] Write failed:", e);
    window.dispatchEvent(new CustomEvent("fsa:write-failed"));
    return false;
  }
};

/* ── FSA Read: parses envelope and returns raw StoX state ── */
var fsaReadFile = async function(handle) {
  try {
    var file = await handle.getFile();
    var text = await file.text();
    var parsed = JSON.parse(text);
    var d = null;
    if (parsed && parsed.data && parsed.app === "StoX") d = parsed.data;
    else if (parsed && parsed.data && parsed.data.holdings) d = parsed.data;
    else if (parsed && parsed.holdings) d = parsed;
    if (!d) return null;
    return {
      holdings: d.holdings || [],
      soldShareSnapshots: d.soldShareSnapshots || {},
      watchlist: d.watchlist || [],
      entryScores: d.entryScores || [],
      entrySnapshots: d.entrySnapshots || [],
      entryPerfPrices: d.entryPerfPrices || {},
      screenerData: d.screenerData || null,
      screenerSnapshots: d.screenerSnapshots || []
    };
  } catch (e) {
    console.warn("[FSA] Read failed:", e);
    return null;
  }
};

/* ── Global FSA singleton ── */
window.__fsa = { handle: null, filename: "", lastSaved: null, ready: false, writeNow: null };


/* ──────────────────────────────────────────────────────────────────────────
   PART 2 — SHARED SYNC PAYLOAD BUILDER
   ────────────────────────────────────────────────────────────────────────── */

window.__stoxBuildSyncPayload = async function(stateData, autoSave) {
  var entryScores = [];
  var entrySnapshots = [];
  var screenerData = null;
  var screenerSnapshots = [];
  var entryPerfPrices = {};
  try { entryScores = (await dbGetSetting("mm_entry_scores")) || []; } catch (e) {}
  try { entrySnapshots = (await dbGetSetting("mm_entry_score_snapshots")) || []; } catch (e) {}
  try { screenerData = (await dbGetSetting("stox_screener_data")) || null; } catch (e) {}
  try { screenerSnapshots = (await dbGetSetting("stox_screener_snapshots")) || []; } catch (e) {}
  try { entryPerfPrices = (await dbGetSetting("mm_entry_perf_prices")) || {}; } catch (e) {}

  return {
    app: "StoX",
    version: 3,
    exportedAt: new Date().toISOString(),
    autoSave: !!autoSave,
    summary: {
      holdings: (stateData.holdings || []).length,
      watchlist: (stateData.watchlist || []).length,
      pastTrades: Object.values(stateData.soldShareSnapshots || {}).reduce(function(s, a) { return s + a.length; }, 0),
      entryScores: entryScores.length,
      entrySnapshots: entrySnapshots.length,
      screenerStocks: screenerData && screenerData.results ? screenerData.results.length : 0,
      screenerSnapshots: screenerSnapshots.length
    },
    data: {
      holdings: stateData.holdings || [],
      soldShareSnapshots: stateData.soldShareSnapshots || {},
      watchlist: stateData.watchlist || [],
      entryScores: entryScores,
      entrySnapshots: entrySnapshots,
      entryPerfPrices: entryPerfPrices,
      screenerData: screenerData,
      screenerSnapshots: screenerSnapshots
    }
  };
};

/* ── Restore helper: writes FSA/read data into IDB + returns basic state ── */
window.__stoxRestoreFromPayload = async function(data) {
  try {
    if (data.holdings) {
      var db = await openDB();
      var tx = db.transaction(["holdings", "watchlist"], "readwrite");
      tx.objectStore("holdings").clear();
      tx.objectStore("watchlist").clear();
      await new Promise(function(res, rej) {
        tx.oncomplete = function() { db.close(); res(); };
        tx.onerror = function(e) { db.close(); rej(e.target.error); };
      });
      for (var i = 0; i < data.holdings.length; i++) await dbPut("holdings", data.holdings[i]);
      for (var j = 0; j < (data.watchlist || []).length; j++) await dbPut("watchlist", data.watchlist[j]);
    }
    if (data.entryScores) {
      var currentScores = [];
      try { currentScores = (await dbGetSetting("mm_entry_scores")) || []; } catch (e) {}
      var localMap = {};
      currentScores.forEach(function(e) { localMap[e.id] = e; });
      var merged = data.entryScores.map(function(imported) {
        var local = localMap[imported.id];
        if (local) {
          return Object.assign({}, imported, {
            currentPrice: local.currentPrice,
            frozenResult: local.frozenResult || imported.frozenResult,
            result: local.result || imported.result,
            indicators: local.indicators || imported.indicators
          });
        }
        return imported;
      });
      await dbSetSetting("mm_entry_scores", merged);
    }
    if (data.entrySnapshots) await dbSetSetting("mm_entry_score_snapshots", data.entrySnapshots);
    if (data.entryPerfPrices) await dbSetSetting("mm_entry_perf_prices", data.entryPerfPrices);
    if (data.soldShareSnapshots && typeof data.soldShareSnapshots === "object") {
      try { await dbPut("settings", { key: "soldShareSnapshots", value: data.soldShareSnapshots }); } catch (e) {}
    }
    if (data.screenerData) await dbSetSetting("stox_screener_data", data.screenerData);
    if (data.screenerSnapshots) await dbSetSetting("stox_screener_snapshots", data.screenerSnapshots);
  } catch (e) {
    console.warn("[Sync] Restore error:", e);
  }
};


/* ──────────────────────────────────────────────────────────────────────────
   PART 3 — GOOGLE DRIVE SYNC
   ────────────────────────────────────────────────────────────────────────── */

var GDRIVE_SYNC_FILENAME = "stox-sync.json";
var GDRIVE_LS_TOKEN = "stox_gdrive_token";
var GDRIVE_LS_EXPIRE = "stox_gdrive_token_exp";
var GDRIVE_LS_FILEID = "stox_gdrive_file_id";
var GDRIVE_LS_LAST_WRITE = "stox_gdrive_last_write";
var GDRIVE_LS_REFRESH_TOKEN = "stox_gdrive_refresh_token";
var GDRIVE_LS_CLIENT_SECRET = "stox_gdrive_client_secret";
var GDRIVE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
var LS_GDRIVE_LAST_SYNC = "stox_gdrive_last_sync";
var LS_LAST_LOCAL_EDIT = "stox_lastEdit";

var LS_AUTO_BACKUP_DATE = "stox_auto_backup_date";
var LS_AUTO_BACKUP_TIME = "stox_auto_backup_time";
var LS_AUTO_BACKUP_STATUS = "stox_auto_backup_status";
var LS_AUTO_BACKUP_FILE = "stox_auto_backup_file";
var LS_AUTO_BACKUP_FOLDER_ID = "stox_auto_backup_folder";

/* ── cloudSyncSupported ── */
var cloudSyncSupported = function() {
  try {
    return typeof google !== "undefined" && google.accounts && typeof google.accounts.oauth2 === "object";
  } catch (e) { return false; }
};

/* ── Device detection ── */
var _isAndroidDevice = function() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean")
    return navigator.userAgentData.mobile;
  return /Android/i.test(navigator.userAgent);
};
var _isStandalonePWA = function() {
  try { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
  catch (e) { return false; }
};

/* ── Token helpers ── */
var _gdriveGetToken = function() {
  try { return localStorage.getItem(GDRIVE_LS_TOKEN) || ""; } catch (e) { return ""; }
};
var _gdriveRefreshTimer = null;

var _gdriveScheduleTokenRefresh = function(expiresInSeconds) {
  if (_gdriveRefreshTimer) clearTimeout(_gdriveRefreshTimer);
  var delayMs = Math.max(0, (expiresInSeconds - 300)) * 1000;
  _gdriveRefreshTimer = setTimeout(async function() {
    console.log("[GDrive] Proactively refreshing access token...");
    var tok = await gdriveRequestTokenSilent();
    if (tok) return;
    if (typeof _gdriveRefreshAccessToken !== "undefined") {
      await _gdriveRefreshAccessToken();
    }
  }, delayMs);
};

var _gdriveSetToken = function(tok, expiresIn) {
  try {
    localStorage.setItem(GDRIVE_LS_TOKEN, tok);
    if (expiresIn) {
      localStorage.setItem(GDRIVE_LS_EXPIRE, String(Date.now() + expiresIn * 1000));
      _gdriveScheduleTokenRefresh(expiresIn);
    }
  } catch (e) {}
};
var _gdriveClearToken = function() {
  if (_gdriveRefreshTimer) { clearTimeout(_gdriveRefreshTimer); _gdriveRefreshTimer = null; }
  try {
    localStorage.removeItem(GDRIVE_LS_TOKEN);
    localStorage.removeItem(GDRIVE_LS_EXPIRE);
  } catch (e) {}
};
var _gdriveTokenExpired = function() {
  try { return Date.now() > +(localStorage.getItem(GDRIVE_LS_EXPIRE) || 0); }
  catch (e) { return true; }
};

/* ── Get CID from localStorage ── */
var _gdriveGetCid = function() {
  try { return localStorage.getItem("stox_gdrive_cid") || ""; } catch (e) { return ""; }
};

/* ── Refresh token helpers ── */
var _gdriveGetRefreshToken = function() {
  try { return localStorage.getItem(GDRIVE_LS_REFRESH_TOKEN) || ""; } catch (e) { return ""; }
};
var _gdriveSetRefreshToken = function(rt) {
  try { if (rt) localStorage.setItem(GDRIVE_LS_REFRESH_TOKEN, rt); } catch (e) {}
};
var _gdriveClearRefreshToken = function() {
  try { localStorage.removeItem(GDRIVE_LS_REFRESH_TOKEN); } catch (e) {}
};
var _gdriveGetClientSecret = function() {
  try { return localStorage.getItem(GDRIVE_LS_CLIENT_SECRET) || ""; } catch (e) { return ""; }
};
var _gdriveRedirectUri = function() { return window.location.origin; };

/* ── Popup cooldown ── */
var _gdriveLastPopupTime = 0;
var GDRIVE_POPUP_COOLDOWN_MS = 10000;

/* ── Silent token refresh (GIS browser session) ── */
var gdriveRequestTokenSilent = function() {
  return new Promise(function(resolve) {
    try {
      var cid = _gdriveGetCid();
      if (!cid || typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) { resolve(""); return; }
      if (_isAndroidDevice() && _isStandalonePWA()) { resolve(""); return; }
      if (Date.now() - _gdriveLastPopupTime < GDRIVE_POPUP_COOLDOWN_MS) { resolve(""); return; }
      var client = google.accounts.oauth2.initTokenClient({
        client_id: cid,
        scope: "https://www.googleapis.com/auth/drive.file",
        prompt: "none",
        callback: function(resp) {
          if (resp && resp.access_token) {
            _gdriveSetToken(resp.access_token, resp.expires_in);
            resolve(resp.access_token);
          } else { resolve(""); }
        },
        error_callback: function() { resolve(""); }
      });
      client.requestAccessToken({ prompt: "none" });
    } catch (e) { resolve(""); }
  });
};

/* ── Interactive token request (GIS popup) ── */
var gdriveRequestToken = function() {
  return new Promise(function(resolve) {
    try {
      var client = google.accounts.oauth2.initTokenClient({
        client_id: _gdriveGetCid(),
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: function(resp) {
          if (resp && resp.access_token) {
            _gdriveSetToken(resp.access_token, resp.expires_in);
            resolve(resp.access_token);
          } else { resolve(""); }
        },
        error_callback: function() { resolve(""); }
      });
      client.requestAccessToken();
    } catch (e) { resolve(""); }
  });
};

/* ── Refresh token exchange ── */
var _gdriveExchangeCodeForTokens = async function(authCode) {
  var cid = _gdriveGetCid();
  var secret = _gdriveGetClientSecret();
  if (!cid || !secret || !authCode) return null;
  try {
    var resp = await fetch(GDRIVE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: authCode, client_id: cid, client_secret: secret,
        redirect_uri: _gdriveRedirectUri(), grant_type: "authorization_code"
      })
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) { return null; }
};

var _gdriveRefreshAccessToken = async function() {
  var refreshToken = _gdriveGetRefreshToken();
  var cid = _gdriveGetCid();
  var secret = _gdriveGetClientSecret();
  if (!refreshToken || !cid || !secret) return "";
  try {
    var resp = await fetch(GDRIVE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken, client_id: cid, client_secret: secret, grant_type: "refresh_token"
      })
    });
    if (!resp.ok) {
      var err = await resp.json().catch(function() { return {}; });
      if (err.error === "invalid_grant") _gdriveClearRefreshToken();
      return "";
    }
    var data = await resp.json();
    if (data.access_token) {
      _gdriveSetToken(data.access_token, data.expires_in || 3600);
      if (data.refresh_token) _gdriveSetRefreshToken(data.refresh_token);
      return data.access_token;
    }
    return "";
  } catch (e) { return ""; }
};

var gdriveRequestTokenWithRefresh = function() {
  return new Promise(function(resolve) {
    try {
      var cid = _gdriveGetCid();
      if (!cid || typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) { resolve(""); return; }
      var client = google.accounts.oauth2.initCodeClient({
        client_id: cid,
        scope: "https://www.googleapis.com/auth/drive.file",
        ux_mode: "popup",
        callback: async function(response) {
          if (!response || !response.code) { resolve(""); return; }
          var tokens = await _gdriveExchangeCodeForTokens(response.code);
          if (tokens && tokens.access_token) {
            _gdriveSetToken(tokens.access_token, tokens.expires_in || 3600);
            if (tokens.refresh_token) _gdriveSetRefreshToken(tokens.refresh_token);
            resolve(tokens.access_token);
          } else { resolve(""); }
        },
        error_callback: function() { resolve(""); }
      });
      client.requestCode({ access_type: "offline", prompt: "consent" });
    } catch (e) { resolve(""); }
  });
};

/* ── Ensure token (V2 with refresh token support) ── */
var _gdriveAuthInProgress = false;
var _gdriveEnsureTokenV2 = async function(silent) {
  if (_gdriveAuthInProgress) {
    for (var i = 0; i < 50; i++) {
      await new Promise(function(r) { setTimeout(r, 200); });
      if (!_gdriveAuthInProgress) break;
    }
    var tok = _gdriveGetToken();
    if (tok && !_gdriveTokenExpired()) return tok;
    return "";
  }
  _gdriveAuthInProgress = true;
  try {
    var tok2 = _gdriveGetToken();
    if (tok2 && !_gdriveTokenExpired()) return tok2;
    if (_gdriveGetRefreshToken() && _gdriveGetClientSecret()) {
      tok2 = await _gdriveRefreshAccessToken();
      if (tok2) return tok2;
    }
    tok2 = await gdriveRequestTokenSilent();
    if (tok2) return tok2;
    if (silent) return "";
    _gdriveLastPopupTime = Date.now();
    if (_gdriveGetClientSecret()) {
      tok2 = await gdriveRequestTokenWithRefresh();
      if (tok2) return tok2;
    }
    _gdriveLastPopupTime = Date.now();
    tok2 = await gdriveRequestToken();
    return tok2;
  } finally {
    _gdriveAuthInProgress = false;
  }
};

/* ── Boot-time token restore ── */
(function() {
  try {
    var exp = +(localStorage.getItem(GDRIVE_LS_EXPIRE) || 0);
    if (exp > Date.now()) {
      _gdriveScheduleTokenRefresh(Math.floor((exp - Date.now()) / 1000));
    } else if (_gdriveGetRefreshToken() && _gdriveGetClientSecret()) {
      setTimeout(function() { _gdriveRefreshAccessToken(); }, 1500);
    }
  } catch (e) {}
})();

/* ── Persistent sync timestamps ── */
var _syncGetLocal = function() {
  try { return localStorage.getItem(LS_GDRIVE_LAST_SYNC) || ""; } catch (e) { return ""; }
};
var _syncSaveLocal = function(ts) {
  try { if (ts) localStorage.setItem(LS_GDRIVE_LAST_SYNC, ts); } catch (e) {}
};
var _syncGetLocalEdit = function() {
  try {
    var explicit = localStorage.getItem(LS_LAST_LOCAL_EDIT) || "";
    if (explicit) return explicit;
    return localStorage.getItem(LS_GDRIVE_LAST_SYNC) || "";
  } catch (e) { return ""; }
};
var _syncSaveLocalEdit = function(ts) {
  try {
    if (ts) {
      localStorage.setItem(LS_LAST_LOCAL_EDIT, ts);
      window.dispatchEvent(new CustomEvent("stox:local-edit", { detail: { time: ts } }));
    }
  } catch (e) {}
};
var _syncRemoteTimeFromPayload = function(payload) {
  return (payload && (payload.exportedAt || payload.modifiedTime || (payload.data && payload.data.exportedAt))) || "";
};

/* ── Drive API helpers ── */
var _gdriveFindFile = async function(token) {
  try {
    var q = encodeURIComponent("name='" + GDRIVE_SYNC_FILENAME + "' and trashed=false and 'root' in parents");
    var r = await fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&orderBy=modifiedTime+desc&pageSize=5&fields=files(id,modifiedTime)&spaces=drive", {
      headers: { Authorization: "Bearer " + token }, cache: "no-store"
    });
    if (!r.ok) { if (r.status === 401 || r.status === 403) _gdriveClearToken(); return ""; }
    var j = await r.json();
    var files = j.files || [];
    if (files.length > 0) {
      try { localStorage.setItem(GDRIVE_LS_FILEID, files[0].id); } catch (e) {}
      return files[0].id;
    }
    return "";
  } catch (e) { return ""; }
};

var _gdriveCreateFile = async function(token, content) {
  try {
    var metadata = { name: GDRIVE_SYNC_FILENAME, parents: ["root"] };
    var boundary = "stox_sync_" + Date.now();
    var body = [
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n",
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + content + "\r\n",
      "--" + boundary + "--"
    ].join("");
    var r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + boundary },
      body: body
    });
    if (!r.ok) { if (r.status === 401 || r.status === 403) _gdriveClearToken(); return ""; }
    var j = await r.json();
    if (j.id) { try { localStorage.setItem(GDRIVE_LS_FILEID, j.id); } catch (e) {} }
    return j.id || "";
  } catch (e) { return ""; }
};

var _gdriveUpdateFile = async function(token, fileId, content) {
  try {
    var r = await fetch("https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media&fields=id,modifiedTime", {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: content
    });
    if (!r.ok && (r.status === 401 || r.status === 403)) _gdriveClearToken();
    return r.ok;
  } catch (e) { return false; }
};

var _gdriveDownloadFile = async function(token, fileId) {
  try {
    var r = await fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media", {
      headers: { Authorization: "Bearer " + token }, cache: "no-store"
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
};

/* ── Throttle gate ── */
var _gdriveCanWrite = function() {
  if (!_isAndroidDevice()) return true;
  try {
    var last = +(localStorage.getItem(GDRIVE_LS_LAST_WRITE) || 0);
    return Date.now() - last >= 10000;
  } catch (e) { return true; }
};
var _gdriveMarkWritten = function() {
  try { localStorage.setItem(GDRIVE_LS_LAST_WRITE, String(Date.now())); } catch (e) {}
};

/* ── gdriveReadSyncFile ── */
var gdriveReadSyncFile = async function(silent) {
  try {
    if (!cloudSyncSupported()) return null;
    var token = await _gdriveEnsureTokenV2(silent !== false);
    if (!token) return null;
    var fileId = "";
    try { fileId = localStorage.getItem(GDRIVE_LS_FILEID) || ""; } catch (e) {}
    if (!fileId) fileId = await _gdriveFindFile(token);
    if (!fileId) return { notFound: true };
    var data = await _gdriveDownloadFile(token, fileId);
    if (!data || !data.data) {
      try { localStorage.removeItem(GDRIVE_LS_FILEID); } catch (e) {}
      var freshId = await _gdriveFindFile(token);
      if (!freshId) return { notFound: true };
      if (freshId !== fileId) data = await _gdriveDownloadFile(token, freshId);
      if (!data || !data.data) return null;
    }
    var remoteExportedAt = data.exportedAt || "";
    var localLastEdit = _syncGetLocalEdit();
    if (remoteExportedAt && localLastEdit && remoteExportedAt <= localLastEdit) return null;
    return {
      state: {
        holdings: (data.data.holdings || []),
        soldShareSnapshots: data.data.soldShareSnapshots || {},
        watchlist: data.data.watchlist || [],
        entryScores: data.data.entryScores || [],
        entrySnapshots: data.data.entrySnapshots || [],
        entryPerfPrices: data.data.entryPerfPrices || {},
        screenerData: data.data.screenerData || null,
        screenerSnapshots: data.data.screenerSnapshots || []
      },
      modifiedTime: remoteExportedAt
    };
  } catch (e) {
    console.warn("[GDrive] read failed:", e);
    return null;
  }
};

/* ── gdriveUpsertSyncFile ── */
var gdriveUpsertSyncFile = async function(stateData, manual) {
  try {
    if (!cloudSyncSupported()) return false;
    if (!manual && !_gdriveCanWrite()) return true;
    var token = await _gdriveEnsureTokenV2(!manual);
    if (!token) return false;
    var localEditAt = _syncGetLocalEdit();
    var fileId = "";
    try { fileId = localStorage.getItem(GDRIVE_LS_FILEID) || ""; } catch (e) {}
    if (!fileId) fileId = await _gdriveFindFile(token);
    if (fileId) {
      var remotePayload = await _gdriveDownloadFile(token, fileId);
      if (!remotePayload && !manual) return false;
      var remoteExportedAt = _syncRemoteTimeFromPayload(remotePayload);
      if (remoteExportedAt && localEditAt && remoteExportedAt >= localEditAt) {
        _syncSaveLocal(remoteExportedAt);
        return true;
      }
    }
    var exportedAt = localEditAt || new Date().toISOString();
    if (!localEditAt && manual) _syncSaveLocalEdit(exportedAt);
    var payload = await window.__stoxBuildSyncPayload(stateData, true);
    payload.exportedAt = exportedAt;
    payload.cloudSync = true;
    var content = JSON.stringify(payload, null, 2);

    var _writeAndMark = async function(id) {
      var ok = await _gdriveUpdateFile(token, id, content);
      if (ok) { _gdriveMarkWritten(); _syncSaveLocal(exportedAt); return true; }
      return false;
    };
    if (fileId && await _writeAndMark(fileId)) return true;
    fileId = await _gdriveFindFile(token);
    if (fileId && await _writeAndMark(fileId)) return true;
    var newId = await _gdriveCreateFile(token, content);
    if (newId) { _gdriveMarkWritten(); _syncSaveLocal(exportedAt); return true; }
    return false;
  } catch (e) {
    console.warn("[GDrive] upsert failed:", e);
    return false;
  }
};

/* ── Daily Auto-Backup ── */
var _autoBackupTodayIST = function() {
  var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
};
var _autoBackupGetLastDate = function() { try { return localStorage.getItem(LS_AUTO_BACKUP_DATE) || ""; } catch (e) { return ""; } };
var _autoBackupGetLastTime = function() { try { return localStorage.getItem(LS_AUTO_BACKUP_TIME) || ""; } catch (e) { return ""; } };
var _autoBackupGetStatus = function() { try { return localStorage.getItem(LS_AUTO_BACKUP_STATUS) || ""; } catch (e) { return ""; } };
var _autoBackupGetFile = function() { try { return localStorage.getItem(LS_AUTO_BACKUP_FILE) || ""; } catch (e) { return ""; } };
var _autoBackupSetOk = function(ts, fname) {
  try {
    localStorage.setItem(LS_AUTO_BACKUP_DATE, _autoBackupTodayIST());
    localStorage.setItem(LS_AUTO_BACKUP_TIME, ts);
    localStorage.setItem(LS_AUTO_BACKUP_STATUS, "ok");
    localStorage.setItem(LS_AUTO_BACKUP_FILE, fname);
  } catch (e) {}
};
var _autoBackupSetFailed = function() { try { localStorage.setItem(LS_AUTO_BACKUP_STATUS, "failed"); } catch (e) {} };
var _autoBackupSetPending = function() { try { localStorage.setItem(LS_AUTO_BACKUP_STATUS, "pending"); } catch (e) {} };

var _autoBackupFilename = function() {
  var now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  var pad = function(n) { return String(n).padStart(2, "0"); };
  var ds = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  var ts = pad(now.getHours()) + "-" + pad(now.getMinutes()) + "-" + pad(now.getSeconds());
  return "stox-backup-" + ds + "_" + ts + ".json";
};

var _autoBackupCreateFile = async function(token, filename, content, parentId) {
  try {
    var metadata = { name: filename, parents: [parentId || "root"] };
    var boundary = "stox_ab_" + Date.now();
    var body = [
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n",
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + content + "\r\n",
      "--" + boundary + "--"
    ].join("");
    var r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + boundary },
      body: body
    });
    if (!r.ok) { if (r.status === 401 || r.status === 403) _gdriveClearToken(); return ""; }
    var j = await r.json();
    return j.id || "";
  } catch (e) { return ""; }
};

var _autoBackupEnsureFolder = async function(token) {
  try {
    var cached = "";
    try { cached = localStorage.getItem(LS_AUTO_BACKUP_FOLDER_ID) || ""; } catch (e) {}
    if (cached) return cached;
    var q = encodeURIComponent("name='StoX Daily Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents");
    var r = await fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&pageSize=5&fields=files(id,name)&spaces=drive", {
      headers: { Authorization: "Bearer " + token }, cache: "no-store"
    });
    if (r.ok) {
      var j = await r.json();
      var files = j.files || [];
      if (files.length > 0) {
        try { localStorage.setItem(LS_AUTO_BACKUP_FOLDER_ID, files[0].id); } catch (e) {}
        return files[0].id;
      }
    }
    var metadata = { name: "StoX Daily Backups", mimeType: "application/vnd.google-apps.folder", parents: ["root"] };
    var cr = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(metadata)
    });
    if (cr.ok) {
      var cj = await cr.json();
      if (cj.id) { try { localStorage.setItem(LS_AUTO_BACKUP_FOLDER_ID, cj.id); } catch (e) {} return cj.id; }
    }
    return "";
  } catch (e) { return ""; }
};

var gdriveAutoBackup = async function(stateData) {
  try {
    if (!cloudSyncSupported()) return;
    var cid = _gdriveGetCid();
    if (!cid || cid.length < 10) return;
    var today = _autoBackupTodayIST();
    if (_autoBackupGetLastDate() === today && _autoBackupGetStatus() === "ok") return;
    _autoBackupSetPending();
    var token = await _gdriveEnsureTokenV2(true);
    if (!token) { _autoBackupSetFailed(); return; }
    var exportedAt = new Date().toISOString();
    var filename = _autoBackupFilename();
    var payload = await window.__stoxBuildSyncPayload(stateData, true);
    payload.exportedAt = exportedAt;
    payload.backupType = "auto-daily";
    payload.backupDate = today;
    var content = JSON.stringify(payload, null, 2);
    var folderId = await _autoBackupEnsureFolder(token);
    var fileId = await _autoBackupCreateFile(token, filename, content, folderId);
    if (fileId) {
      _autoBackupSetOk(exportedAt, filename);
      window.dispatchEvent(new CustomEvent("stox:auto-backup-done", { detail: { date: today, time: exportedAt, filename: filename } }));
    } else {
      _autoBackupSetFailed();
    }
  } catch (e) {
    _autoBackupSetFailed();
    console.warn("[AutoBackup] Error:", e);
  }
};
window._gdriveAutoBackup = gdriveAutoBackup;


/* ──────────────────────────────────────────────────────────────────────────
   PART 4 — FSA STORAGE PANEL (Settings UI)
   ────────────────────────────────────────────────────────────────────────── */

window.FSAStoragePanel = function(props) {
  var stateData = props.stateData;
  var stateDataRef = React.useRef(stateData);
  stateDataRef.current = stateData;
  var _s = React.useState(function() { return !!(window.__fsa && window.__fsa.handle && window.__fsa.ready); });
  var connected = _s[0], setConnected = _s[1];
  var _s2 = React.useState(function() { return (window.__fsa && window.__fsa.filename) || ""; });
  var filename = _s2[0], setFilename = _s2[1];
  var _s3 = React.useState(function() { return (window.__fsa && window.__fsa.lastSaved) || null; });
  var lastSaved = _s3[0], setLastSaved = _s3[1];
  var _s4 = React.useState(false);
  var permNeeded = _s4[0], setPermNeeded = _s4[1];
  var _s5 = React.useState(false);
  var busy = _s5[0], setBusy = _s5[1];
  var _s6 = React.useState({ text: "", ok: true });
  var msg = _s6[0], setMsg = _s6[1];

  var say = function(text, ok) {
    if (ok === undefined) ok = true;
    setMsg({ text: text, ok: ok });
    setTimeout(function() { setMsg({ text: "", ok: true }); }, 5000);
  };

  React.useEffect(function() {
    var onSaved = function() { setLastSaved(new Date(window.__fsa.lastSaved)); };
    var onWriteFailed = function() {
      say("Auto-save failed - file may have been moved, deleted, or permission has lapsed.", false);
      if (window.__fsa && window.__fsa.handle && !window.__fsa.ready) {
        window.dispatchEvent(new CustomEvent("fsa:permission-needed"));
      }
    };
    var onGranted = function() { setConnected(true); setPermNeeded(false); setFilename(window.__fsa.filename || ""); };
    window.addEventListener("fsa:saved", onSaved);
    window.addEventListener("fsa:write-failed", onWriteFailed);
    window.addEventListener("fsa:permission-granted", onGranted);
    return function() {
      window.removeEventListener("fsa:saved", onSaved);
      window.removeEventListener("fsa:write-failed", onWriteFailed);
      window.removeEventListener("fsa:permission-granted", onGranted);
    };
  }, []);

  React.useEffect(function() {
    if (!fsaSupported()) return;
    (async function() {
      try {
        var h = await fsaGetHandle();
        if (!h) return;
        var perm = await fsaQueryPermission(h);
        if (perm === "granted") {
          window.__fsa.handle = h; window.__fsa.filename = h.name; window.__fsa.ready = true;
          window.__fsa.writeNow = async function() {
            if (!window.__fsa.handle || !window.__fsa.ready) return false;
            var ok = await fsaWriteFile(window.__fsa.handle, stateDataRef.current);
            if (ok) { window.__fsa.lastSaved = new Date(); window.dispatchEvent(new CustomEvent("fsa:saved")); }
            return ok;
          };
          setConnected(true); setFilename(h.name);
          setTimeout(function() { if (window.__fsa.writeNow) window.__fsa.writeNow(); }, 50);
        } else {
          window.__fsa.handle = h; window.__fsa.filename = h.name; window.__fsa.ready = false;
          setFilename(h.name); setPermNeeded(true);
          window.dispatchEvent(new CustomEvent("fsa:permission-needed"));
        }
      } catch (e) {}
    })();
  }, []);

  var handleConnect = async function() {
    if (!fsaSupported()) { say("File System Access API is not supported. Please use Chrome or Edge on desktop.", false); return; }
    setBusy(true);
    try {
      var handle = await window.showSaveFilePicker({
        suggestedName: "stox-data.json",
        types: [{ description: "StoX Data", accept: { "application/json": [".json"] } }]
      });
      var perm = await fsaVerifyPermission(handle);
      if (!perm) { setPermNeeded(true); setBusy(false); say("Write permission was denied. Click 'Re-grant Permission' to enable auto-save.", false); return; }
      await fsaSetHandle(handle);
      window.__fsa.handle = handle; window.__fsa.filename = handle.name; window.__fsa.ready = true;
      window.__fsa.writeNow = async function() {
        if (!window.__fsa.handle || !window.__fsa.ready) return false;
        var ok = await fsaWriteFile(window.__fsa.handle, stateDataRef.current);
        if (ok) { window.__fsa.lastSaved = new Date(); window.dispatchEvent(new CustomEvent("fsa:saved")); }
        return ok;
      };
      setConnected(true); setFilename(handle.name); setPermNeeded(false);
      var ok = await fsaWriteFile(handle, stateDataRef.current);
      if (ok) { window.__fsa.lastSaved = new Date(); setLastSaved(window.__fsa.lastSaved); say("Connected! Current data saved to " + handle.name); }
      else say("File connected, but initial write failed. Try 'Save Now'.", false);
    } catch (e) { if (e.name !== "AbortError") say("Could not connect file: " + e.message, false); }
    setBusy(false);
  };

  var handleOpenFile = async function() {
    if (!fsaSupported()) { say("File System Access API is not supported.", false); return; }
    setBusy(true);
    try {
      var handles = await window.showOpenFilePicker({
        types: [{ description: "StoX Data", accept: { "application/json": [".json"] } }],
        multiple: false
      });
      var handle = handles[0];
      var data = await fsaReadFile(handle);
      if (!data) { say("Could not read the file or the file is empty.", false); setBusy(false); return; }
      await window.__stoxRestoreFromPayload(data);
      var permGranted = await fsaRequestPermission(handle);
      if (permGranted === "granted") {
        window.__fsa.handle = handle; window.__fsa.filename = handle.name; window.__fsa.ready = true;
        await fsaSetHandle(handle);
        setConnected(true); setFilename(handle.name); setPermNeeded(false);
      } else {
        window.__fsa.handle = handle; window.__fsa.filename = handle.name; window.__fsa.ready = false;
        await fsaSetHandle(handle);
        setPermNeeded(true); setFilename(handle.name);
      }
      say("Data loaded from " + handle.name + ". Refreshing...");
      setTimeout(function() { window.location.reload(); }, 1800);
    } catch (e) { if (e.name !== "AbortError") say("Could not open file: " + e.message, false); }
    setBusy(false);
  };

  var handleSaveNow = async function() {
    if (!window.__fsa || !window.__fsa.handle) return;
    setBusy(true);
    var ok = await fsaVerifyPermission(window.__fsa.handle);
    if (!ok) { say("Permission denied. Please click 'Re-grant Permission'.", false); setBusy(false); return; }
    window.__fsa.ready = true;
    var saved = await fsaWriteFile(window.__fsa.handle, stateData);
    if (saved) { window.__fsa.lastSaved = new Date(); setLastSaved(window.__fsa.lastSaved); say("Saved to " + window.__fsa.filename); }
    else say("Write failed - the file may have been moved or deleted.", false);
    setBusy(false);
  };

  var handleGrantPerm = async function() {
    if (!window.__fsa || !window.__fsa.handle) return;
    setBusy(true);
    var granted = await fsaVerifyPermission(window.__fsa.handle);
    if (granted) {
      window.__fsa.ready = true;
      window.__fsa.writeNow = async function() {
        if (!window.__fsa.handle || !window.__fsa.ready) return false;
        var ok = await fsaWriteFile(window.__fsa.handle, stateDataRef.current);
        if (ok) { window.__fsa.lastSaved = new Date(); window.dispatchEvent(new CustomEvent("fsa:saved")); }
        return ok;
      };
      var ok = await window.__fsa.writeNow();
      setPermNeeded(false); setConnected(true);
      say(ok ? "Permission granted - data saved to " + window.__fsa.filename : "Permission granted - save queued.");
      window.dispatchEvent(new CustomEvent("fsa:permission-granted"));
    } else say("Permission was denied.", false);
    setBusy(false);
  };
  window.__fsa.grantPermission = handleGrantPerm;

  var handleDisconnect = async function() {
    await fsaClearHandle();
    window.__fsa.handle = null; window.__fsa.filename = ""; window.__fsa.ready = false; window.__fsa.lastSaved = null; window.__fsa.writeNow = null;
    setConnected(false); setFilename(""); setPermNeeded(false); setLastSaved(null);
    say("File storage disconnected. Data continues to save to browser storage.");
  };

  var fmtTime = function(d) {
    if (!d) return "\u2014";
    try { return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
    catch (e) { return "\u2014"; }
  };

  var supported = fsaSupported();
  var isMobileDevice = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.userAgentData && navigator.userAgentData.mobile === true);

  return React.createElement("div", null,
    React.createElement("div", { style: { marginBottom: 16 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "File Storage"),
      React.createElement("p", { style: { color: "var(--text5)", fontSize: 12, marginTop: 4 } }, "Auto-save your data to any file on your PC. Requires Chrome or Edge on desktop.")
    ),
    React.createElement("div", { style: {
      display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
      padding: "10px 14px", borderRadius: 10,
      background: supported ? "rgba(22,163,74,.07)" : isMobileDevice ? "rgba(234,179,8,.07)" : "rgba(239,68,68,.07)",
      border: "1px solid " + (supported ? "rgba(22,163,74,.2)" : isMobileDevice ? "rgba(234,179,8,.3)" : "rgba(239,68,68,.2)")
    }},
      React.createElement("div", { style: { fontSize: 18 } }, supported ? "\u2705" : isMobileDevice ? "\ud83d\udcf1" : "\u26a0\ufe0f"),
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: supported ? "#16a34a" : isMobileDevice ? "#b45309" : "#ef4444" } },
          supported ? "File System Access API \u2014 Supported" : isMobileDevice ? "Not available on mobile" : "Not supported in this browser"
        ),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } },
          supported ? "Chrome / Edge on desktop." : isMobileDevice ? "Auto-save to browser storage only." : "Please open in Chrome or Edge."
        )
      )
    ),
    React.createElement("div", { className: "stx-card", style: { marginBottom: 12 } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 600, marginBottom: 6 } }, "Connection Status"),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("span", { style: { width: 9, height: 9, borderRadius: "50%", display: "inline-block", background: connected ? "#16a34a" : permNeeded ? "#b45309" : "#ef4444" } }),
            React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: connected ? "#16a34a" : permNeeded ? "#b45309" : "var(--text4)" } },
              connected ? "Connected & Auto-saving" : permNeeded ? "Permission Needed" : "Disconnected")
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          connected && React.createElement("button", { className: "stx-btn", onClick: handleSaveNow, disabled: busy, style: { fontSize: 12 } }, "Save Now"),
          connected && React.createElement("button", { className: "stx-btn stx-btn-ghost", onClick: handleDisconnect, disabled: busy, style: { fontSize: 12, color: "#ef4444" } }, "Disconnect"),
          permNeeded && React.createElement("button", { className: "stx-btn", onClick: handleGrantPerm, disabled: busy, style: { fontSize: 12 } }, "Re-grant Permission"),
          permNeeded && React.createElement("button", { className: "stx-btn stx-btn-ghost", onClick: handleDisconnect, disabled: busy, style: { fontSize: 12, color: "#ef4444" } }, "Disconnect")
        )
      ),
      (connected || permNeeded) && React.createElement("div", { style: { marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)" } },
        React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, filename),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 3 } },
          connected ? "Last saved: " + fmtTime(lastSaved) + " \u00b7 Auto-save active" : "Grant write permission to enable auto-save."
        )
      )
    ),
    !connected && !permNeeded && React.createElement("div", { className: "stx-card", style: { marginBottom: 12 } },
      React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        React.createElement("button", { className: "stx-btn stx-btn-primary", onClick: handleConnect, disabled: busy || !supported, style: { flex: "1 1 200px", justifyContent: "center" } },
          busy ? "Working..." : "Connect New Save File"),
        React.createElement("button", { className: "stx-btn", onClick: handleOpenFile, disabled: busy || !supported, style: { flex: "1 1 200px", justifyContent: "center" } },
          "Load from Existing File")
      )
    ),
    msg.text && React.createElement("div", {
      style: {
        padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, marginTop: 4,
        background: msg.ok ? "rgba(22,163,74,.1)" : "rgba(239,68,68,.1)",
        border: "1px solid " + (msg.ok ? "rgba(22,163,74,.3)" : "rgba(239,68,68,.3)"),
        color: msg.ok ? "#16a34a" : "#ef4444"
      }
    }, msg.text)
  );
};


/* ──────────────────────────────────────────────────────────────────────────
   PART 5 — CLOUD BACKUP PANEL (Settings UI)
   ────────────────────────────────────────────────────────────────────────── */

window.CloudBackupPanel = function(props) {
  var stateData = props.stateData;
  var _s = React.useState(function() { try { return localStorage.getItem("stox_gdrive_cid") || ""; } catch (e) { return ""; } });
  var cidInput = _s[0], setCidInput = _s[1];
  var _s2 = React.useState(function() { try { return localStorage.getItem(GDRIVE_LS_CLIENT_SECRET) || ""; } catch (e) { return ""; } });
  var secretInput = _s2[0], setSecretInput = _s2[1];
  var _s3 = React.useState(false);
  var cidSaved = _s3[0], setCidSaved = _s3[1];
  var _s4 = React.useState(false);
  var secretSaved = _s4[0], setSecretSaved = _s4[1];
  var _s5 = React.useState(_syncGetLocal);
  var lastSync = _s5[0], setLastSync = _s5[1];
  var _s6 = React.useState(_syncGetLocalEdit);
  var localEdit = _s6[0], setLocalEdit = _s6[1];
  var _s7 = React.useState("");
  var pushMsg = _s7[0], setPushMsg = _s7[1];
  var _s8 = React.useState("");
  var pullMsg = _s8[0], setPullMsg = _s8[1];
  var _s9 = React.useState(false);
  var pushing = _s9[0], setPushing = _s9[1];
  var _s10 = React.useState(false);
  var pulling = _s10[0], setPulling = _s10[1];
  var _s11 = React.useState(false);
  var reauthing = _s11[0], setReauthing = _s11[1];
  var _s12 = React.useState(false);
  var tokenOk = _s12[0], setTokenOk = _s12[1];
  var _s13 = React.useState(function() { return !!_gdriveGetRefreshToken(); });
  var hasRefresh = _s13[0], setHasRefresh = _s13[1];
  var _s14 = React.useState(false);
  var showSecret = _s14[0], setShowSecret = _s14[1];
  var _s15 = React.useState(_autoBackupGetLastDate);
  var abDate = _s15[0], setAbDate = _s15[1];
  var _s16 = React.useState(_autoBackupGetLastTime);
  var abTime = _s16[0], setAbTime = _s16[1];
  var _s17 = React.useState(_autoBackupGetStatus);
  var abStatus = _s17[0], setAbStatus = _s17[1];
  var _s18 = React.useState(_autoBackupGetFile);
  var abFile = _s18[0], setAbFile = _s18[1];
  var _s19 = React.useState(false);
  var abRunning = _s19[0], setAbRunning = _s19[1];
  var _s20 = React.useState("");
  var abMsg = _s20[0], setAbMsg = _s20[1];

  React.useEffect(function() {
    var refreshTimes = function() { setLastSync(_syncGetLocal()); setLocalEdit(_syncGetLocalEdit()); };
    var onPulled = function(e) { if (e && e.detail && e.detail.time) _syncSaveLocal(e.detail.time); refreshTimes(); setHasRefresh(!!_gdriveGetRefreshToken()); };
    var onSynced = function() { refreshTimes(); setHasRefresh(!!_gdriveGetRefreshToken()); };
    var refreshAbStatus = function() { setAbDate(_autoBackupGetLastDate()); setAbTime(_autoBackupGetLastTime()); setAbStatus(_autoBackupGetStatus()); setAbFile(_autoBackupGetFile()); };
    var onAbDone = function() { refreshAbStatus(); setAbRunning(false); };
    window.addEventListener("stox:gdrive:synced", onSynced);
    window.addEventListener("stox:gdrive:pulled", onPulled);
    window.addEventListener("stox:local-edit", refreshTimes);
    window.addEventListener("stox:auto-backup-done", onAbDone);
    var tick = setInterval(function() { refreshTimes(); refreshAbStatus(); }, 5000);
    return function() {
      window.removeEventListener("stox:gdrive:synced", onSynced);
      window.removeEventListener("stox:gdrive:pulled", onPulled);
      window.removeEventListener("stox:local-edit", refreshTimes);
      window.removeEventListener("stox:auto-backup-done", onAbDone);
      clearInterval(tick);
    };
  }, []);

  React.useEffect(function() { setTokenOk(!_gdriveTokenExpired() && !!_gdriveGetToken()); }, []);

  var hasCid = cidInput.trim().length > 10;
  var hasSecret = secretInput.trim().length > 0;
  var isConfigured = hasCid;
  var syncCompare = localEdit && lastSync
    ? (localEdit === lastSync ? "match" : (localEdit > lastSync ? "local-newer" : "drive-newer"))
    : "unknown";
  var syncLabel = syncCompare === "match" ? "Up to date" : syncCompare === "local-newer" ? "Local newer" : syncCompare === "drive-newer" ? "Drive newer" : "Waiting for sync";
  var syncColor = syncCompare === "match" ? "#16a34a" : syncCompare === "unknown" ? "var(--text5)" : "#b45309";

  var fmtTs = function(iso) {
    if (!iso) return "Never";
    try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }); }
    catch (e) { return iso; }
  };

  var saveCid = function() {
    var newCid = cidInput.trim();
    try {
      var oldCid = localStorage.getItem("stox_gdrive_cid") || "";
      if (oldCid && oldCid !== newCid) {
        _gdriveClearToken(); _gdriveClearRefreshToken();
        try { localStorage.removeItem(GDRIVE_LS_FILEID); } catch (e) {}
        setTokenOk(false); setHasRefresh(false);
      }
      localStorage.setItem("stox_gdrive_cid", newCid);
    } catch (e) {}
    setCidSaved(true);
    setTimeout(function() { setCidSaved(false); }, 2500);
  };

  var saveSecret = function() {
    try { localStorage.setItem(GDRIVE_LS_CLIENT_SECRET, secretInput.trim()); } catch (e) {}
    setSecretSaved(true);
    setTimeout(function() { setSecretSaved(false); }, 2500);
  };

  var clearCreds = async function() {
    if (!await window.showConfirm("Disconnect Google Drive? Sync will stop until you reconnect.")) return;
    try {
      localStorage.removeItem("stox_gdrive_cid");
      localStorage.removeItem(GDRIVE_LS_CLIENT_SECRET);
      _gdriveClearToken(); _gdriveClearRefreshToken();
      try { localStorage.removeItem(GDRIVE_LS_FILEID); } catch (e) {}
    } catch (e) {}
    setCidInput(""); setSecretInput(""); setTokenOk(false); setHasRefresh(false);
    setPushMsg("Disconnected.");
  };

  var handleReauth = async function() {
    if (!hasCid) { setPushMsg("Enter your Client ID first."); return; }
    if (!hasSecret) { setPushMsg("Enter your Client Secret first."); return; }
    setReauthing(true);
    setPushMsg("Opening Google authorisation window...");
    try {
      _gdriveClearRefreshToken(); setHasRefresh(false);
      var tok = await gdriveRequestTokenWithRefresh();
      if (tok) { setTokenOk(true); setHasRefresh(!!_gdriveGetRefreshToken()); setPushMsg("Re-authorised! Refresh token stored."); }
      else { setPushMsg("Authorisation failed or was cancelled."); }
    } catch (e) { setPushMsg(e.message || "Unknown error"); }
    setReauthing(false);
    setTimeout(function() { setPushMsg(""); }, 6000);
  };

  var handlePush = async function() {
    if (!hasCid) { setPushMsg("Enter your Google Client ID first."); return; }
    setPushing(true); setPushMsg("Pushing to Google Drive...");
    try {
      var ok = await gdriveUpsertSyncFile(stateData, true);
      if (ok) { setLastSync(_syncGetLocal()); setTokenOk(!_gdriveTokenExpired() && !!_gdriveGetToken()); setHasRefresh(!!_gdriveGetRefreshToken()); setPushMsg("Pushed to Google Drive successfully!"); }
      else { setTokenOk(!_gdriveTokenExpired() && !!_gdriveGetToken()); setPushMsg("Push failed. Check credentials and try again."); }
    } catch (e) { setPushMsg(e.message || "Unknown error"); }
    setPushing(false);
    setTimeout(function() { setPushMsg(""); }, 5000);
  };

  var handlePull = async function() {
    if (!hasCid) { setPullMsg("Enter your Google Client ID first."); return; }
    setPulling(true); setPullMsg("Checking Google Drive for newer data...");
    try {
      var savedSync = _syncGetLocal();
      var remote = await gdriveReadSyncFile(false);
      if (!remote || !remote.state) {
        if (remote && remote.notFound) setPullMsg("No sync file found on Drive yet. Push your data first to create it.");
        else setPullMsg("Your local data is already up-to-date.");
        setPulling(false); setTimeout(function() { setPullMsg(""); }, 5000);
        return;
      }
      if (!await window.showConfirm("A newer version was found on Google Drive (saved " + fmtTs(remote.modifiedTime) + ").\n\nRestore from Drive? This will overwrite your current local data.")) {
        setPullMsg("Pull cancelled."); setPulling(false); setTimeout(function() { setPullMsg(""); }, 2500);
        return;
      }
      await window.__stoxRestoreFromPayload(remote.state);
      _syncSaveLocal(remote.modifiedTime);
      _syncSaveLocalEdit(remote.modifiedTime);
      setLastSync(remote.modifiedTime);
      setPullMsg("Restored from Drive (" + fmtTs(remote.modifiedTime) + "). Refreshing...");
      setTimeout(function() { window.location.reload(); }, 1800);
    } catch (e) {
      setPullMsg("Pull failed: " + (e.message || "Unknown error"));
      setPulling(false); setTimeout(function() { setPullMsg(""); }, 5000);
    }
  };

  var handleManualBackup = async function() {
    if (!hasCid) { setAbMsg("Enter your Google Client ID first."); return; }
    setAbRunning(true); setAbMsg("Running backup to Google Drive...");
    var savedDate = _autoBackupGetLastDate();
    try { localStorage.removeItem(LS_AUTO_BACKUP_DATE); } catch (e) {}
    try {
      await gdriveAutoBackup(stateData);
      var newStatus = _autoBackupGetStatus();
      if (newStatus === "ok") {
        setAbDate(_autoBackupGetLastDate()); setAbTime(_autoBackupGetLastTime()); setAbStatus("ok"); setAbFile(_autoBackupGetFile());
        setAbMsg("Backup created successfully!");
      } else {
        try { if (savedDate) localStorage.setItem(LS_AUTO_BACKUP_DATE, savedDate); } catch (e) {}
        setAbMsg("Backup failed - check Drive credentials.");
      }
    } catch (e) {
      try { if (savedDate) localStorage.setItem(LS_AUTO_BACKUP_DATE, savedDate); } catch (e) {}
      setAbMsg(e.message || "Unknown error");
    }
    setAbRunning(false);
    setTimeout(function() { setAbMsg(""); }, 6000);
  };

  var StatusDot = function(p) {
    return React.createElement("span", {
      style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: p.on ? "#16a34a" : p.warn ? "#b45309" : "#475569" }
    });
  };
  var subHdr = { fontSize: 11, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 600, marginBottom: 6 };

  return React.createElement("div", null,
    React.createElement("div", { style: { marginBottom: 16 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Cloud Backup & Sync"),
      React.createElement("p", { style: { color: "var(--text5)", fontSize: 12, marginTop: 4 } },
        "Two-way sync between devices via Google Drive."
      )
    ),
    /* Client ID */
    React.createElement("div", { className: "stx-card", style: { marginBottom: 12 } },
      React.createElement("div", { style: subHdr }, "Google OAuth Client ID"),
      React.createElement("p", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 10 } },
        "Create at ", React.createElement("a", { href: "https://console.cloud.google.com/apis/credentials", target: "_blank", rel: "noopener", style: { color: "var(--accent)" } }, "console.cloud.google.com"), " \u2192 Credentials (Web application)."
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" } },
        React.createElement("div", { style: { flex: "1 1 300px" } },
          React.createElement("label", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 4, display: "block" } }, "Client ID"),
          React.createElement("input", {
            className: "inp", type: "text",
            placeholder: "123456789-abc.apps.googleusercontent.com",
            value: cidInput, onChange: function(e) { setCidInput(e.target.value); setCidSaved(false); },
            style: { fontFamily: "monospace", fontSize: 12 }
          })
        ),
        React.createElement("button", { className: "stx-btn stx-btn-primary", onClick: saveCid, disabled: !cidInput.trim(), style: { minWidth: 110 } }, cidSaved ? "\u2713 Saved" : "Save Client ID")
      ),
      hasCid && React.createElement("div", { style: { marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#16a34a" } },
        React.createElement(StatusDot, { on: true }), "Client ID configured"
      )
    ),
    /* Client Secret */
    React.createElement("div", { className: "stx-card", style: { marginBottom: 12 } },
      React.createElement("div", { style: subHdr }, "OAuth Client Secret"),
      React.createElement("p", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 10 } },
        "Required for refresh token flow. Stored only on this device."
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" } },
        React.createElement("div", { style: { flex: "1 1 260px" } },
          React.createElement("label", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 4, display: "block" } }, "Client Secret"),
          React.createElement("div", { style: { position: "relative" } },
            React.createElement("input", {
              className: "inp", type: showSecret ? "text" : "password",
              placeholder: "GOCSPX-...",
              value: secretInput, onChange: function(e) { setSecretInput(e.target.value); setSecretSaved(false); },
              style: { fontFamily: "monospace", fontSize: 12, paddingRight: 36 }
            })
          )
        ),
        React.createElement("button", { className: "stx-btn stx-btn-primary", onClick: saveSecret, disabled: !secretInput.trim(), style: { minWidth: 110 } }, secretSaved ? "\u2713 Saved" : "Save Secret")
      ),
      hasSecret
        ? React.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "#16a34a", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(StatusDot, { on: true }), "Refresh token flow enabled")
        : React.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "#b45309", display: "flex", alignItems: "center", gap: 6 } }, React.createElement(StatusDot, { warn: true }), "Without a secret, OAuth popup every hour")
    ),
    /* Sync Status */
    React.createElement("div", { className: "stx-card", style: { marginBottom: 12 } },
      React.createElement("div", { style: subHdr }, "Sync Status"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 } },
        React.createElement("div", { style: { background: "var(--bg4)", borderRadius: 8, padding: "8px 10px" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 } }, "Connection"),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
            React.createElement(StatusDot, { on: isConfigured }),
            React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: isConfigured ? "#16a34a" : "var(--text5)" } }, isConfigured ? "Configured" : "Not set")
          )
        ),
        React.createElement("div", { style: { background: "var(--bg4)", borderRadius: 8, padding: "8px 10px" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 } }, "Access Token"),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
            React.createElement(StatusDot, { on: tokenOk }),
            React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: tokenOk ? "#16a34a" : "#b45309" } }, tokenOk ? "Active" : "Expired")
          )
        ),
        React.createElement("div", { style: { background: "var(--bg4)", borderRadius: 8, padding: "8px 10px" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 } }, "Refresh Token"),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
            React.createElement(StatusDot, { on: hasRefresh, warn: !hasRefresh && hasSecret }),
            React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: hasRefresh ? "#16a34a" : "#b45309" } }, hasRefresh ? "Stored" : "Not stored")
          )
        )
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 } },
        React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg4)", borderRadius: 8, border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)" } }, "Local edit"),
          React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text3)", marginTop: 2 } }, fmtTs(localEdit))
        ),
        React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg4)", borderRadius: 8, border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)" } }, "Drive sync"),
          React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text3)", marginTop: 2 } }, fmtTs(lastSync))
        ),
        React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg4)", borderRadius: 8, border: "1px solid var(--border)" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)" } }, "Status"),
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: syncColor, marginTop: 2 } }, syncLabel)
        )
      )
    ),
    /* Re-authorise */
    hasCid && hasSecret && React.createElement("div", { className: "stx-card", style: { marginBottom: 12 } },
      React.createElement("div", { style: subHdr }, hasRefresh ? "Re-Authorise" : "First Authorisation"),
      React.createElement("p", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 10 } },
        hasRefresh ? "Force a new Google consent screen to get a fresh refresh token." : "Open the Google consent screen. A refresh token will be stored for silent renewal."
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
        React.createElement("button", {
          className: "stx-btn", onClick: handleReauth, disabled: reauthing,
          style: { background: "rgba(109,40,217,.13)", border: "1px solid rgba(109,40,217,.35)", color: "#6d28d9" }
        }, reauthing ? "Authorising..." : hasRefresh ? "Re-Authorise Drive" : "Authorise & Store Refresh Token"),
        hasRefresh && React.createElement("span", { style: { fontSize: 12, color: "#16a34a" } }, "Refresh token stored")
      )
    ),
    /* Manual sync */
    React.createElement("div", { className: "stx-card", style: { marginBottom: 12 } },
      React.createElement("div", { style: subHdr }, "Manual Sync"),
      React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        React.createElement("button", {
          className: "stx-btn", onClick: handlePush, disabled: pushing || !hasCid,
          style: { background: "rgba(22,163,74,.13)", border: "1px solid rgba(22,163,74,.35)", color: "#16a34a", opacity: !hasCid ? 0.5 : 1 }
        }, pushing ? "Pushing..." : "Push to Drive"),
        React.createElement("button", {
          className: "stx-btn", onClick: handlePull, disabled: pulling || !hasCid,
          style: { background: "rgba(14,116,144,.13)", border: "1px solid rgba(14,116,144,.35)", color: "#0e7490", opacity: !hasCid ? 0.5 : 1 }
        }, pulling ? "Checking Drive..." : "Pull from Drive")
      ),
      (pushMsg || pullMsg) && React.createElement("div", { style: { marginTop: 10 } },
        pushMsg && React.createElement("div", { style: { fontSize: 12, color: pushMsg.startsWith("\u2713") || pushMsg.startsWith("Pushed") || pushMsg.startsWith("Re-auth") ? "#16a34a" : pushMsg.startsWith("\u2717") || pushMsg.startsWith("Push failed") ? "#ef4444" : "var(--text4)", marginBottom: pullMsg ? 4 : 0 } }, pushMsg),
        pullMsg && React.createElement("div", { style: { fontSize: 12, color: pullMsg.startsWith("\u2713") || pullMsg.startsWith("Restored") ? "#16a34a" : pullMsg.startsWith("\u2717") || pullMsg.startsWith("Pull failed") ? "#ef4444" : "var(--text4)" } }, pullMsg)
      )
    ),
    /* Daily Auto-Backup */
    isConfigured && React.createElement("div", { className: "stx-card", style: { marginBottom: 12 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("div", { style: { width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg4)", fontSize: 14 } }, "\ud83d\uddc4\ufe0f"),
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text2)", fontFamily: "var(--font-heading)" } }, "Daily Auto-Backup"),
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)" } }, "One automatic backup to Drive each day")
          )
        ),
        React.createElement("div", { style: {
          display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
          background: abStatus === "ok" && abDate === _autoBackupTodayIST() ? "rgba(22,163,74,.12)" : "var(--bg4)",
          color: abStatus === "ok" && abDate === _autoBackupTodayIST() ? "#16a34a" : "var(--text5)"
        } }, abStatus === "ok" && abDate === _autoBackupTodayIST() ? "Done Today" : abStatus === "failed" ? "Not Yet" : "Not Run")
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 } },
        React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg4)", borderRadius: 8 } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", marginBottom: 3 } }, "Last Backup"),
          React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--text2)" } }, abDate || "Never")
        ),
        React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg4)", borderRadius: 8 } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", marginBottom: 3 } }, "Time"),
          React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text2)" } },
            abTime ? fmtTs(abTime) : "\u2014"
          )
        ),
        React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg4)", borderRadius: 8 } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textTransform: "uppercase", marginBottom: 3 } }, "File"),
          React.createElement("div", { style: { fontSize: 9, fontFamily: "monospace", color: "var(--accent)", wordBreak: "break-all" } }, abFile || "\u2014")
        )
      ),
      React.createElement("button", {
        className: "stx-btn stx-btn-primary", onClick: handleManualBackup, disabled: abRunning || !hasCid,
        style: { opacity: !hasCid ? 0.5 : 1 }
      }, abRunning ? "Creating backup..." : "Backup Now")
    )
  );
};
