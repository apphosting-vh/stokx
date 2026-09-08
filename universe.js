/* ══════════════════════════════════════════════════════════════════════════
   Universe Filter — StoX
   Defines the eligible equity universe as NIFTY_200 = Nifty100 ∪ Nifty Next 100.
   The 200-ticker list is the one already defined by the app in app-core.js
   (window.NIFTY_200 = [{ t: "RELIANCE.NS", n: "...", cap: "L" | "M" }]).
   The existing cap tagging is reused directly:
       cap "L" (Nifty100, first 100)     → tier "large"
       cap "M" (Nifty Next 100)          → tier "mid"
   universe.js loads BEFORE app-core.js, so NIFTY_200 is never captured at load
   time; the index is built lazily on first access and re-checked until the
   list is available (runtime access is always post-DOM-ready, after app-core
   has executed).
   ══════════════════════════════════════════════════════════════════════════ */

window.StoxUniverse = (function () {

  function normalize(sym) {
    if (!sym) return "";
    return String(sym).trim().toUpperCase().replace(/\.NS$/, "").replace(/\.BO$/, "");
  }

  // Read the app's NIFTY_200 ticker list (may not exist until app-core.js runs).
  function sourceList() {
    var list = (typeof window !== "undefined" && window.NIFTY_200) ||
      (typeof NIFTY_200 !== "undefined" ? NIFTY_200 : null);
    return (list && Array.isArray(list)) ? list : null;
  }

  /* Lazy-built index. Stored as:
       _index = { large: {TICK: true}, mid: {TICK: true} }
       _lists = { large: [TICK, ...], mid: [TICK, ...] }  (bare, deduped) */
  var _index = null;
  var _lists = null;

  function buildIndex() {
    var list = sourceList();
    if (!list || !list.length) { _index = null; _lists = null; return false; }
    var byTier = { large: {}, mid: {} };
    var lists = { large: [], mid: [] };
    var seen = { large: {}, mid: {} };
    list.forEach(function (s) {
      if (!s || !s.t) return;
      var t = normalize(s.t);
      if (!t) return;
      var cap = String(s.cap || "").toUpperCase();
      if (cap !== "L" && cap !== "M") return; // only L/M tagged names qualify
      var tier = cap === "L" ? "large" : "mid";
      byTier[tier][t] = true;
      if (!seen[tier][t]) { seen[tier][t] = true; lists[tier].push(t); }
    });
    _index = byTier;
    _lists = lists;
    return true;
  }

  function getIndex() {
    if (_index) return _index;
    if (buildIndex()) return _index;
    return null;
  }

  /**
   * Get the cap tier for a symbol.
   * Returns "large" (Nifty100), "mid" (Nifty Next 100), or null (not in
   * universe / NIFTY_200 not yet loaded).
   */
  function getCapTier(symbol) {
    var idx = getIndex();
    if (!idx) return null;
    var s = normalize(symbol);
    if (!s) return null;
    if (idx.large[s]) return "large";
    if (idx.mid[s]) return "mid";
    return null;
  }

  /**
   * Check if a symbol is in the eligible trading universe
   * (NIFTY_200 = Nifty100 ∪ Nifty Next 100).
   */
  function inUniverse(symbol) {
    return getCapTier(symbol) != null;
  }

  /**
   * All eligible universe symbols (large + mid), deduplicated, bare names.
   */
  function getAllSymbols() {
    var idx = getIndex();
    if (!idx) return [];
    var out = [];
    var seen = {};
    (_lists.large.concat(_lists.mid)).forEach(function (s) {
      if (!seen[s]) { seen[s] = true; out.push(s); }
    });
    return out;
  }

  function getSymbolsByTier(tier) {
    var lists = _lists || (buildIndex() ? _lists : null);
    if (!lists) return [];
    if (tier === "large") return lists.large.slice();
    if (tier === "mid") return lists.mid.slice();
    return getAllSymbols();
  }

  function tierList(tier) {
    var lists = _lists || (buildIndex() ? _lists : null);
    if (!lists) return [];
    return lists[tier] ? lists[tier].slice() : [];
  }

  return {
    get NIFTY100() { return tierList("large"); },
    get NIFTY_NEXT100() { return tierList("mid"); },
    getCapTier: getCapTier,
    inUniverse: inUniverse,
    getAllSymbols: getAllSymbols,
    getSymbolsByTier: getSymbolsByTier
  };
})();