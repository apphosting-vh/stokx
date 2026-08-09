/* ══════════════════════════════════════════════════════════════════════════
   StoX — Stock Analysis & Portfolio Tracking for Indian Equities
   app-core.js — React application (in-browser Babel compilation)
   ══════════════════════════════════════════════════════════════════════════ */
window.__STOX_APP_VERSION = "2.13.0";

/* Apply saved score config on startup — discard if version mismatch */
(function() {
  try {
    var saved = JSON.parse(localStorage.getItem("stox_score_config"));
    var curVer = (window.TechIndicators && window.TechIndicators.getScoreConfigVersion) ? window.TechIndicators.getScoreConfigVersion() : null;
    if (saved && curVer != null && saved._v !== curVer) {
      localStorage.removeItem("stox_score_config");
      saved = null;
    }
    if (saved && window.TechIndicators && window.TechIndicators.setScoreConfig) {
      window.TechIndicators.setScoreConfig(saved);
    }
  } catch(e) {}
})();

const { useState, useReducer, useRef, useEffect, useCallback, useMemo } = React;

/* ══════════════════════════════════════════════════════════════════════════
   SVG ICON SYSTEM — Modern minimal icons
   ══════════════════════════════════════════════════════════════════════════ */
const _ico = (size, color, paths, extra) => {
  const props = Object.assign({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color || "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }, extra || {});
  return React.createElement("svg", props, paths.map((d, i) => {
    if (typeof d === "string") return React.createElement("path", { key: i, d: d });
    if (d.circle) return React.createElement("circle", { key: i, cx: d.circle[0], cy: d.circle[1], r: d.circle[2], fill: d.fill || color || "currentColor", stroke: d.stroke || "none" });
    if (d.line) return React.createElement("line", { key: i, x1: d.line[0], y1: d.line[1], x2: d.line[2], y2: d.line[3] });
    if (d.polyline) return React.createElement("polyline", { key: i, points: d.polyline });
    if (d.rect) return React.createElement("rect", { key: i, x: d.rect[0], y: d.rect[1], width: d.rect[2], height: d.rect[3], rx: d.rect[4] || 0, fill: d.fill || "none" });
    if (d.polygon) return React.createElement("polygon", { key: i, points: d.polygon, fill: d.fill || "none", stroke: d.stroke || color || "currentColor" });
    return null;
  }));
};
const Ico = {
  // Arrows
  chevronUp: (s, c) => _ico(s||14, c, ["M18 15l-6-6-6 6"]),
  chevronDown: (s, c) => _ico(s||14, c, ["M6 9l6 6 6-6"]),
  arrowUp: (s, c) => _ico(s||14, c, ["M12 19V5", "M5 12l7-7 7 7"]),
  arrowDown: (s, c) => _ico(s||14, c, ["M12 5v14", "M19 12l-7 7-7-7"]),
  arrowRight: (s, c) => _ico(s||14, c, ["M5 12h14", "M12 5l7 7-7 7"]),
  arrowLeft: (s, c) => _ico(s||14, c, ["M19 12H5", "M12 19l-7-7 7-7"]),
  sortUp: (s, c) => _ico(s||14, c, ["M12 5l5 8H7l5-8z"], { fill: c || "currentColor", stroke: "none" }),
  sortDown: (s, c) => _ico(s||14, c, ["M12 19l5-8H7l5 8z"], { fill: c || "currentColor", stroke: "none" }),
  triangleUp: (s, c) => _ico(s||12, c, ["M12 4l8 14H4l8-14z"], { fill: c || "currentColor", stroke: "none" }),
  triangleDown: (s, c) => _ico(s||12, c, ["M12 20l-8-14h16l-8 14z"], { fill: c || "currentColor", stroke: "none" }),

  // Check / Cross
  check: (s, c) => _ico(s||16, c, ["M5 13l4 4L19 7"]),
  x: (s, c) => _ico(s||16, c, ["M18 6L6 18", "M6 6l12 12"]),
  checkCircle: (s, c) => _ico(s||16, c, ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", "M9 12l2 2 4-4"]),
  xCircle: (s, c) => _ico(s||16, c, ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", "M15 9l-6 6", "M9 9l6 6"]),

  // Warning
  alertTriangle: (s, c) => _ico(s||16, c, ["M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z", { line: [12, 9, 12, 13] }, { line: [12, 17, 12.01, 17] }]),
  alertCircle: (s, c) => _ico(s||16, c, ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", { line: [12, 8, 12, 12] }, { line: [12, 16, 12.01, 16] }]),

  // Status dots
  dot: (s, c) => React.createElement("svg", { width: s||8, height: s||8, viewBox: "0 0 8 8" }, React.createElement("circle", { cx: 4, cy: 4, r: 3.5, fill: c || "currentColor" })),
  dotOutline: (s, c) => React.createElement("svg", { width: s||8, height: s||8, viewBox: "0 0 8 8" }, React.createElement("circle", { cx: 4, cy: 4, r: 3, fill: "none", stroke: c || "currentColor", strokeWidth: 1.5 })),

  // Star
  star: (s, c) => _ico(s||14, c, ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"], { fill: c || "currentColor" }),
  starOutline: (s, c) => _ico(s||14, c, ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"]),

  // Medals
  medal1: (s, c) => _ico(s||16, c, ["M8 21l4-8 4 8", { circle: [12, 8, 5], fill: c || "#fbbf24", stroke: "none" }, { line: [12, 6, 12, 10] }, { line: [10, 8, 14, 8] }]),
  medal2: (s, c) => _ico(s||16, c, ["M8 21l4-8 4 8", { circle: [12, 8, 5], fill: c || "#94a3b8", stroke: "none" }, { line: [12, 6, 12, 10] }]),
  medal3: (s, c) => _ico(s||16, c, ["M8 21l4-8 4 8", { circle: [12, 8, 5], fill: c || "#d97706", stroke: "none" }, { line: [10, 8, 14, 8] }]),

  // UI
  refresh: (s, c) => _ico(s||16, c, ["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"]),
  download: (s, c) => _ico(s||16, c, ["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"]),
  upload: (s, c) => _ico(s||16, c, ["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"]),
  camera: (s, c) => _ico(s||16, c, ["M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z", { circle: [12, 13, 4] }]),
  folder: (s, c) => _ico(s||16, c, ["M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"]),
  folderOpen: (s, c) => _ico(s||16, c, ["M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v1", { polyline: [2, 15, 7, 10, 12, 15, 22, 5] }]),
  hourglass: (s, c) => _ico(s||16, c, ["M5 22h14", "M5 2h14", { path: "M17 22v-4.172a2 2 0 00-.586-1.414L12 12l-4.414 4.414A2 2 0 007 17.828V22", fill: "none" }, { path: "M7 2v4.172a2 2 0 00.586 1.414L12 12l4.414-4.414A2 2 0 0017 6.172V2", fill: "none" }]),
  inbox: (s, c) => _ico(s||16, c, ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"]),
  save: (s, c) => _ico(s||16, c, ["M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z", { polyline: [17, 21, 17, 13, 7, 13, 7, 21] }, { polyline: [7, 3, 7, 8, 15, 8] }]),
  file: (s, c) => _ico(s||16, c, ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", { polyline: [14, 2, 14, 8, 20, 8] }]),
  fileText: (s, c) => _ico(s||16, c, ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", { polyline: [14, 2, 14, 8, 20, 8] }, { line: [16, 13, 8, 13] }, { line: [16, 17, 8, 17] }, { polyline: [10, 9, 9, 9, 8, 9] }]),
  smartphone: (s, c) => _ico(s||16, c, ["M5 2h14a1 1 0 011 1v18a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z", { line: [12, 18, 12.01, 18] }]),
  database: (s, c) => _ico(s||16, c, ["M12 2C6.48 2 2 3.79 2 6v12c0 2.21 4.48 4 10 4s10-1.79 10-4V6c0-2.21-4.48-4-10-4z", { ellipse: [12, 6, 10, 4] }, { ellipse: [12, 12, 10, 4] }]),
  clock: (s, c) => _ico(s||16, c, ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", { polyline: [12, 6, 12, 12, 16, 14] }]),
  zap: (s, c) => _ico(s||16, c, ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"]),
  shield: (s, c) => _ico(s||16, c, ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"]),
  copy: (s, c) => _ico(s||16, c, ["M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2", { rect: [8, 2, 8, 8, 0], rx: 0 }]),
  trash: (s, c) => _ico(s||16, c, ["M3 6h18", "M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"]),
  edit: (s, c) => _ico(s||16, c, ["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7", "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"]),
  search: (s, c) => _ico(s||16, c, ["M11 19a8 8 0 100-16 8 8 0 000 16z", { line: [21, 21, 16.65, 16.65] }]),
  settings: (s, c) => _ico(s||16, c, ["M12 15a3 3 0 100-6 3 3 0 000 6z", { path: "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" }]),
  info: (s, c) => _ico(s||16, c, ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", { line: [12, 16, 12, 12] }, { line: [12, 8, 12.01, 8] }]),
  bookmark: (s, c) => _ico(s||16, c, ["M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"]),
  bookmarkFilled: (s, c) => _ico(s||16, c, ["M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"], { fill: c || "currentColor" }),
  grid: (s, c) => _ico(s||16, c, ["M3 3h7v7H3V3z", "M14 3h7v7h-7V3z", "M14 14h7v7h-7v-7z", "M3 14h7v7H3v-7z"]),
  list: (s, c) => _ico(s||16, c, ["M8 6h13", "M8 12h13", "M8 18h13", { line: [3, 6, 3.01, 6] }, { line: [3, 12, 3.01, 12] }, { line: [3, 18, 3.01, 18] }]),
  barChart: (s, c) => _ico(s||16, c, ["M12 20V10", "M18 20V4", "M6 20v-4"]),
  trendingUp: (s, c) => _ico(s||16, c, ["M23 6l-9.5 9.5-5-5L1 18"]),
  trendingDown: (s, c) => _ico(s||16, c, ["M23 18l-9.5-9.5-5 5L1 6"]),
  activity: (s, c) => _ico(s||16, c, ["M22 12h-4l-3 9L9 3l-3 9H2"]),
  globe: (s, c) => _ico(s||16, c, ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", { line: [2, 12, 22, 12] }, { path: "M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" }]),
  user: (s, c) => _ico(s||16, c, ["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", { circle: [12, 7, 4] }]),
  target: (s, c) => _ico(s||16, c, ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", { circle: [12, 12, 6] }, { circle: [12, 12, 1] }]),
  layers: (s, c) => _ico(s||16, c, ["M12 2L2 7l10 5 10-5-10-5z", { path: "M2 17l10 5 10-5", fill: "none" }, { path: "M2 12l10 5 10-5", fill: "none" }]),
  cpu: (s, c) => _ico(s||16, c, ["M9 3v2", "M15 3v2", "M9 19v2", "M15 19v2", { rect: [5, 5, 14, 14, 2] }, { line: [9, 9, 15, 15] }, { line: [15, 9, 9, 15] }]),
  crosshair: (s, c) => _ico(s||16, c, ["M12 2v4", "M12 18v4", "M2 12h4", "M18 12h4", { circle: [12, 12, 4] }]),
  home: (s, c) => _ico(s||16, c, ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z", { polyline: [9, 22, 9, 12, 15, 12, 15, 22] }]),
  briefcase: (s, c) => _ico(s||16, c, ["M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z", { path: "M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" }]),
  bell: (s, c) => _ico(s||16, c, ["M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9", { path: "M13.73 21a2 2 0 01-3.46 0" }]),
  externalLink: (s, c) => _ico(s||16, c, ["M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6", { polyline: [15, 3, 21, 3, 21, 9] }, { line: [10, 14, 21, 3] }]),
  link: (s, c) => _ico(s||16, c, ["M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"]),
  share: (s, c) => _ico(s||16, c, ["M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8", { polyline: [16, 6, 12, 2, 8, 6] }, { line: [12, 2, 12, 15] }]),
  code: (s, c) => _ico(s||16, c, ["M16 18l6-6-6-6", "M8 6l-6 6 6 6"]),
  terminal: (s, c) => _ico(s||16, c, ["M4 17l6-5-6-5", { line: [12, 19, 20, 19] }]),
  moon: (s, c) => _ico(s||16, c, ["M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"]),
  sun: (s, c) => _ico(s||16, c, ["M12 17a5 5 0 100-10 5 5 0 000 10z", { line: [12, 1, 12, 3] }, { line: [12, 21, 12, 23] }, { line: [4.22, 4.22, 5.64, 5.64] }, { line: [18.36, 18.36, 19.78, 19.78] }, { line: [1, 12, 3, 12] }, { line: [21, 12, 23, 12] }, { line: [4.22, 19.78, 5.64, 18.36] }, { line: [18.36, 5.64, 19.78, 4.22] }]),
  filter: (s, c) => _ico(s||16, c, ["M22 3H2l8 9.46V19l4 2v-8.54L22 3z"]),
  mail: (s, c) => _ico(s||16, c, ["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z", { polyline: [22, 6, 12, 13, 2, 6] }]),
  lock: (s, c) => _ico(s||16, c, ["M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z", { path: "M7 11V7a5 5 0 0110 0v4" }]),
  unlock: (s, c) => _ico(s||16, c, ["M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z", { path: "M7 11V7a5 5 0 019.9-1" }]),
  key: (s, c) => _ico(s||16, c, ["M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"]),
  cloud: (s, c) => _ico(s||16, c, ["M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"]),
  cloudDownload: (s, c) => _ico(s||16, c, ["M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z", { polyline: [8, 21, 12, 17, 16, 21] }, { line: [12, 17, 12, 12] }]),
  sync: (s, c) => _ico(s||16, c, ["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0114.85-3.36L23 10", "M1 14l4.64 4.36A9 9 0 0020.49 15"]),
  play: (s, c) => _ico(s||16, c, ["M5 3l14 9-14 9V3z"], { fill: c || "currentColor", stroke: "none" }),
  pause: (s, c) => _ico(s||16, c, ["M6 4h4v16H6V4z", "M14 4h4v16h-4V4z"], { fill: c || "currentColor", stroke: "none" }),
  stop: (s, c) => _ico(s||16, c, ["M4 4h16v16H4V4z"], { fill: c || "currentColor", stroke: "none" }),
  moreVertical: (s, c) => _ico(s||16, c, [{ circle: [12, 5, 1] }, { circle: [12, 12, 1] }, { circle: [12, 19, 1] }]),
  plus: (s, c) => _ico(s||16, c, ["M12 5v14", "M5 12h14"]),
  minus: (s, c) => _ico(s||16, c, ["M5 12h14"]),
  max: (s, c) => _ico(s||14, c, ["M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"]),
  min: (s, c) => _ico(s||14, c, ["M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"]),
};
window.Ico = Ico;

/* ══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════════════════ */
const _inrFmt = {
  0: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  2: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};
const INR = (n, d = 0) => { const v = (!n || !isFinite(n)) ? 0 : n; return (_inrFmt[d] || _inrFmt[0]).format(v); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
const TODAY = () => { const istMs = Date.now() + (5.5 * 60 * 60 * 1000); return new Date(istMs).toISOString().split("T")[0]; };
const pct = (v, b) => b ? (((v - b) / b) * 100) : 0;
const pctStr = (v, b) => b ? (((v - b) / b) * 100).toFixed(2) : "0.00";
const round2 = (v) => Math.round((v || 0) * 100) / 100;

/* ── Offline OHLCV Storage (IndexedDB) ── */
const OfflineOHLCV = {
  DB_NAME: "stox_ohlcv_offline",
  STORE: "candles",
  VERSION: 1,

  _open() {
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(OfflineOHLCV.DB_NAME, OfflineOHLCV.VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(OfflineOHLCV.STORE)) {
          db.createObjectStore(OfflineOHLCV.STORE, { keyPath: "ticker" });
        }
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  },

  async getAll() {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OfflineOHLCV.STORE, "readonly");
      var store = tx.objectStore(OfflineOHLCV.STORE);
      var req = store.getAll();
      req.onsuccess = function() { resolve(req.result || []); db.close(); };
      req.onerror = function() { reject(req.error); db.close(); };
    });
  },

  async get(ticker) {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OfflineOHLCV.STORE, "readonly");
      var store = tx.objectStore(OfflineOHLCV.STORE);
      var req = store.get(ticker);
      req.onsuccess = function() { resolve(req.result || null); db.close(); };
      req.onerror = function() { reject(req.error); db.close(); };
    });
  },

  async put(record) {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OfflineOHLCV.STORE, "readwrite");
      var store = tx.objectStore(OfflineOHLCV.STORE);
      var req = store.put(record);
      req.onsuccess = function() { resolve(); db.close(); };
      req.onerror = function() { reject(req.error); db.close(); };
    });
  },

  async putBulk(records) {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OfflineOHLCV.STORE, "readwrite");
      var store = tx.objectStore(OfflineOHLCV.STORE);
      for (var i = 0; i < records.length; i++) { store.put(records[i]); }
      tx.oncomplete = function() { resolve(); db.close(); };
      tx.onerror = function() { reject(tx.error); db.close(); };
    });
  },

  async clear() {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OfflineOHLCV.STORE, "readwrite");
      var store = tx.objectStore(OfflineOHLCV.STORE);
      var req = store.clear();
      req.onsuccess = function() { resolve(); db.close(); };
      req.onerror = function() { reject(req.error); db.close(); };
    });
  },

  async getMeta() {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OfflineOHLCV.STORE, "readonly");
      var store = tx.objectStore(OfflineOHLCV.STORE);
      var req = store.getAll();
      req.onsuccess = function() {
        var recs = req.result || [];
        var tickers = recs.map(function(r) { return r.ticker; });
        var downloadedAt = recs.length > 0 ? Math.max.apply(null, recs.map(function(r) { return r.downloadedAt || 0; })) : null;
        var totalBars = recs.reduce(function(sum, r) {
          /* v1 schema: r.data; v2 schema: r.daily + r.hourly + r.weekly */
          var bars = (r.data ? r.data.length : 0) + (r.daily ? r.daily.length : 0) + (r.hourly ? r.hourly.length : 0) + (r.weekly ? r.weekly.length : 0);
          return sum + bars;
        }, 0);
        var hasMultiTF = recs.length > 0 && recs.some(function(r) { return r.daily != null; });
        resolve({ count: tickers.length, totalBars: totalBars, downloadedAt: downloadedAt, tickers: tickers, multiTF: hasMultiTF });
        db.close();
      };
      req.onerror = function() { reject(req.error); db.close(); };
    });
  }
};

const NSE_HOLIDAYS = new Set([
  "2025-01-26","2025-02-19","2025-03-14","2025-03-31",
  "2025-04-10","2025-04-14","2025-04-18",
  "2025-05-01","2025-08-15","2025-08-27",
  "2025-10-02","2025-10-21","2025-10-22",
  "2025-11-05","2025-12-25",
  "2026-01-26","2026-03-19","2026-03-20",
  "2026-04-02","2026-04-03","2026-04-06","2026-04-14",
  "2026-05-01","2026-06-19","2026-08-17",
  "2026-10-02","2026-11-24","2026-12-25",
]);

const isTradingWeekday = () => {
  const istMs = Date.now() + (5.5 * 60 * 60 * 1000);
  const istDate = new Date(istMs);
  const d = istDate.getUTCDay();
  if (d < 1 || d > 5) return false;
  return !NSE_HOLIDAYS.has(istDate.toISOString().split("T")[0]);
};

/* ── XIRR for single-buy holdings (Newton–Raphson) ── */
function xirrSingleBuy(costBasis, currentVal, buyDateStr) {
  if (!buyDateStr || costBasis <= 0 || currentVal <= 0) return null;
  const buyD = new Date(buyDateStr + "T12:00:00");
  const now = new Date();
  const days = (now - buyD) / 86400000;
  if (days <= 0) return null;
  const years = days / 365;
  if (years < 0.01) return null;
  /* Simple annualised return: (currentVal/costBasis)^(1/years) - 1 */
  const rate = Math.pow(currentVal / costBasis, 1 / years) - 1;
  return isFinite(rate) ? rate * 100 : null;
}

/* ── XIRR for multi-cashflow (Newton–Raphson) ── */
const computeXIRR = (cashflows, dates, guess = 0.1) => {
  if (!cashflows || cashflows.length < 2) return null;
  if (dates[0] === dates[dates.length - 1]) return null;
  const t0 = new Date(dates[0]).getTime();
  const yr = dates.map(d => (new Date(d).getTime() - t0) / (365.25 * 86400000));
  const npv = r => cashflows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, yr[i]), 0);
  const dnpv = r => cashflows.reduce((s, cf, i) => s - yr[i] * cf / Math.pow(1 + r, yr[i] + 1), 0);
  let r = guess;
  for (let i = 0; i < 200; i++) {
    const f = npv(r), df = dnpv(r);
    if (Math.abs(df) < 1e-12) break;
    const nr = r - f / df;
    if (Math.abs(nr - r) < 1e-9) { r = nr; break; }
    r = nr;
    if (r <= -1) r = -0.9999;
  }
  if (!isFinite(r) || r <= -1 || r > 5) return null;
  return Math.round(r * 10000) / 100;
};

/* ── Capital gains classification (Indian tax rules) ── */
function capitalGainsInfo(buyDateStr) {
  if (!buyDateStr) return null;
  const buyD = new Date(buyDateStr + "T12:00:00");
  const now = new Date();
  const daysHeld = Math.floor((now - buyD) / 86400000);
  if (daysHeld < 0) return null;
  const isLT = daysHeld > 365;
  const cgType = isLT ? "LTCG" : "STCG";
  const taxRate = isLT ? "12.5%" : "20%";
  const daysToLT = isLT ? 0 : 365 - daysHeld;
  return { daysHeld, isLT, cgType, taxRate, daysToLT };
}

/* ── Day change calc (placeholder — uses prevClose from prices) ── */
function dayChangeInfo(currentPrice, prevClose) {
  if (!prevClose || !currentPrice || prevClose <= 0) return null;
  const abs = currentPrice - prevClose;
  const pctVal = (abs / prevClose) * 100;
  return { abs, pct: pctVal };
}

/* ── Indian Financial Year key (April–March) ── */
function getFYKey(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const yr = d.getFullYear();
  const mo = d.getMonth();
  const fyStart = mo >= 3 ? yr : yr - 1;
  return "FY" + fyStart + "-" + String(fyStart + 1).slice(-2);
}

/* ── Persist snapshots to IDB settings store ── */
async function persistSnapshots(soldShareSnapshots) {
  await dbPut("settings", { key: "soldShareSnapshots", value: soldShareSnapshots });
}

async function loadSnapshots() {
  try {
    const rows = await dbGetAll("settings");
    const row = rows.find((r) => r.key === "soldShareSnapshots");
    const snaps = row ? row.value : {};
    Object.keys(snaps).forEach(fyKey => {
      (snaps[fyKey] || []).forEach(sn => {
        if (sn.chartPts && sn.chartPts.length > 0 && sn.chartPts[0].close == null && sn.chartPts[0].value != null) {
          const q = Number(sn.qty) || 1;
          sn.chartPts = sn.chartPts.map(p => ({ date: p.date, close: q > 0 ? p.value / q : p.value }));
        }
      });
    });
    return snaps;
  } catch { return {}; }
}

/* ══════════════════════════════════════════════════════════════════════════
   DATA LAYER — LocalStorage / IndexedDB persistence
   ══════════════════════════════════════════════════════════════════════════ */
const DB_NAME = "stox_db";
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("holdings")) db.createObjectStore("holdings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("watchlist")) db.createObjectStore("watchlist", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "date" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = (e) => { db.close(); resolve(e.target.result || []); };
    req.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbPut(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbGetSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readonly");
    const req = tx.objectStore("settings").get(key);
    req.onsuccess = (e) => { db.close(); resolve(e.target.result ? e.target.result.value : undefined); };
    req.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbSetSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key, value });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

async function dbDeleteSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (e) => { db.close(); reject(e.target.error); };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   PRICE FETCHER — Yahoo Finance + Stooq for Indian stocks
   ══════════════════════════════════════════════════════════════════════════ */
const _fetchX = (url, opts = {}, ms = 5000) => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  const isExt = typeof location !== "undefined" && url.startsWith("http") && !url.startsWith(location.origin);
  return fetch(url, { ...(isExt ? { credentials: "omit" } : {}), ...opts, signal: ctrl.signal, cache: "no-store" })
    .finally(() => clearTimeout(tid));
};

const _readBody = (r, ms = 4000) => Promise.race([r.text(), new Promise((_, rej) => setTimeout(() => rej(new Error("body timeout")), ms))]);
const _unwrap = (txt) => { try { const j = JSON.parse(txt); if (typeof j?.contents === "string") return j.contents; } catch {} return txt; };

const PROXY_FNS = [
  (u) => "https://api.cors.lol/?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?" + encodeURIComponent(u),
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
];

async function fetchTickerPrice(rawTicker) {
  const ticker = (rawTicker || "").trim().toUpperCase();
  if (!ticker) return null;
    const symbols = [ticker + ".NS"];
  for (const sym of symbols) {
    for (const proxy of PROXY_FNS) {
      try {
        const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?interval=1d&range=1d&_t=" + Date.now();
        const r = await _fetchX(proxy(url), {}, 6000);
        if (!r.ok) continue;
        const txt = await _readBody(r);
        const json = JSON.parse(_unwrap(txt));
        const result = json?.chart?.result?.[0];
        if (!result) continue;
        const meta = result.meta;
        if (meta && meta.regularMarketPrice > 0) {
          return { price: Math.round(meta.regularMarketPrice * 100) / 100, currency: meta.currency || "INR", previousClose: meta.chartPreviousClose || null };
        }
      } catch { continue; }
    }
  }
  return null;
}

async function fetchMultiplePrices(tickers) {
  const results = {};
  const promises = tickers.map(async (t) => {
    const data = await fetchTickerPrice(t);
    if (data) results[t.toUpperCase()] = data;
  });
  await Promise.allSettled(promises);
  return results;
}

/* ── Historical daily prices fetcher (buyDate → today) ── */
const fetchHistoricalPrices = async (rawTicker, fromDate) => {
  const ticker = (rawTicker || "").trim().toUpperCase();
  if (!ticker || !fromDate) return null;
  let _resolve;
  const capTimer = new Promise(r => { _resolve = r; setTimeout(() => _resolve(null), 30000); });
  const _fetch = async () => {
    const period1 = Math.floor(new Date(fromDate + "T00:00:00Z").getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000) + 86400;
    const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  const symbols = [ticker + ".NS"];
    const proxyFns = [
      u => "https://api.cors.lol/?url=" + encodeURIComponent(u),
      u => "https://corsproxy.io/?" + encodeURIComponent(u),
      u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    ];
    for (const sym of symbols) {
      for (const host of hosts) {
        const yUrl = "https://" + host + "/v8/finance/chart/" + encodeURIComponent(sym) + "?interval=1d&period1=" + period1 + "&period2=" + period2;
        for (const mkProxy of proxyFns) {
          try {
            const r = await _fetchX(mkProxy(yUrl), {}, 10000);
            if (!r.ok) continue;
            const txt = await _readBody(r, 8000);
            let json; try { json = JSON.parse(txt); } catch { continue; }
            const payload = json?.contents ? JSON.parse(json.contents) : json;
            const result = payload?.chart?.result?.[0];
            if (!result) continue;
            const timestamps = result.timestamp || [];
            const closes = result.indicators?.quote?.[0]?.close || [];
            if (timestamps.length < 2) continue;
            const pts = [];
            for (let i = 0; i < timestamps.length; i++) {
              const c = closes[i];
              if (c == null || isNaN(c) || c <= 0) continue;
              const istMs = timestamps[i] * 1000 + (5.5 * 60 * 60 * 1000);
              const istDate = new Date(istMs).toISOString().split("T")[0];
              pts.push({ date: istDate, close: Math.round(c * 100) / 100 });
            }
            if (pts.length >= 2) { _resolve(pts); return pts; }
          } catch {}
        }
      }
    }
    _resolve(null);
    return null;
  };
  return Promise.race([_fetch(), capTimer]);
};

/* ══════════════════════════════════════════════════════════════════════════
   MARKET INDICES FETCHER — NSE India + Stooq commodities
   ══════════════════════════════════════════════════════════════════════════ */
const MARKET_INDEX_MAP = [
  { nseKey: "NIFTY 50", name: "Nifty 50", group: "Broad" },
  { nseKey: "NIFTY 100", name: "Nifty 100", group: "Broad" },
  { nseKey: "NIFTY MIDCAP 50", name: "Nifty Midcap 50", group: "Broad" },
  { nseKey: "NIFTY MIDCAP 100", name: "Nifty Midcap 100", group: "Broad" },
  { nseKey: "NIFTY BANK", name: "Bank Nifty", group: "Sector" },
  { nseKey: "NIFTY IT", name: "Nifty IT", group: "Sector" },
  { nseKey: "NIFTY PHARMA", name: "Nifty Pharma", group: "Sector" },
  { nseKey: "NIFTY AUTO", name: "Nifty Auto", group: "Sector" },
  { nseKey: "NIFTY FMCG", name: "Nifty FMCG", group: "Sector" },
  { nseKey: "NIFTY METAL", name: "Nifty Metal", group: "Sector" },
  { nseKey: "NIFTY REALTY", name: "Nifty Realty", group: "Sector" },
  { nseKey: "NIFTY ENERGY", name: "Nifty Energy", group: "Sector" },
];

const COMMODITY_LIST = [
  { stooq: "xauusd", name: "Gold", currency: "USD" },
  { stooq: "xagusd", name: "Silver", currency: "USD" },
  { stooq: "cl.f", name: "Crude Oil (WTI)", currency: "USD" },
];

async function fetchMarketIndices() {
  const out = [];
  const overallCap = new Promise(r => setTimeout(() => r(null), 18000));

  const _fetch = async () => {
    /* ── NSE India API for all Indian indexes ── */
    const nseUrl = "https://www.nseindia.com/api/allIndices";
    const nseProxies = [
      "https://api.cors.lol/?url=" + encodeURIComponent(nseUrl),
      "https://corsproxy.io/?" + encodeURIComponent(nseUrl),
      "https://api.allorigins.win/raw?url=" + encodeURIComponent(nseUrl),
    ];
    let nseData = null;
    for (const proxyUrl of nseProxies) {
      try {
        const r = await _fetchX(proxyUrl, {}, 10000);
        if (!r.ok) continue;
        const txt = await _readBody(r, 8000);
        let json;
        try { json = JSON.parse(txt); } catch { continue; }
        const payload = json?.contents ? JSON.parse(json.contents) : json;
        if (Array.isArray(payload?.data)) { nseData = payload.data; break; }
      } catch {}
    }

    if (nseData) {
      const bySym = {};
      nseData.forEach(d => { if (d.indexSymbol) bySym[d.indexSymbol] = d; });
      for (const cfg of MARKET_INDEX_MAP) {
        const d = bySym[cfg.nseKey];
        if (!d) continue;
        const price = parseFloat(d.last);
        const prevClose = parseFloat(d.previousClose);
        const change = parseFloat(d.variation) || 0;
        const changePct = parseFloat(d.percentChange) || 0;
        if (isNaN(price)) continue;
        out.push({
          symbol: cfg.nseKey, name: cfg.name, group: cfg.group,
          price, prevClose: !isNaN(prevClose) ? prevClose : null,
          change, changePct, currency: "INR",
        });
      }
    }

    /* ── Commodities via Stooq ── */
    const fetchStooq = async (item) => {
      const stooqUrl = "https://stooq.com/q/l/?s=" + encodeURIComponent(item.stooq) + "&f=sd2t2ohlcv&h&e=csv";
      const proxies = [
        "https://api.cors.lol/?url=" + encodeURIComponent(stooqUrl),
        "https://corsproxy.io/?" + encodeURIComponent(stooqUrl),
        "https://api.allorigins.win/raw?url=" + encodeURIComponent(stooqUrl),
      ];
      for (const proxyUrl of proxies) {
        try {
          const r = await _fetchX(proxyUrl, {}, 8000);
          if (!r.ok) continue;
          const csv = _unwrap(await _readBody(r, 6000));
          const lines = csv.trim().split("\n");
          if (lines.length < 2) continue;
          const cols = lines[1].split(",");
          const close = parseFloat(cols[6]);
          const open = parseFloat(cols[3]);
          if (isNaN(close) || close <= 0) continue;
          const change = !isNaN(open) && open > 0 ? close - open : 0;
          const changePct = !isNaN(open) && open > 0 ? (change / open * 100) : 0;
          return {
            symbol: item.stooq, name: item.name, group: "Commodity",
            price: Math.round(close * 100) / 100, prevClose: null,
            change: Math.round(change * 100) / 100,
            changePct: Math.round(changePct * 100) / 100,
            currency: item.currency,
          };
        } catch {}
      }
      return null;
    };

    const commodityResults = await Promise.all(COMMODITY_LIST.map(c => fetchStooq(c)));
    commodityResults.forEach(r => { if (r) out.push(r); });
    return out;
  };

  return Promise.race([_fetch(), overallCap]).then(r => r || []);
}

/* ══════════════════════════════════════════════════════════════════════════
   OHLCV DATA FETCHER — for technical analysis
   ══════════════════════════════════════════════════════════════════════════ */
const Y_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

async function fetchOHLCV(ticker, timeframe) {
  timeframe = timeframe || "daily";
  ticker = (ticker || "").trim().toUpperCase();
  if (!ticker) return null;
  var yfInterval, yfRange;
  switch (timeframe) {
    case "1m": yfInterval = "1m"; yfRange = "1d"; break;
    case "5m": yfInterval = "5m"; yfRange = "5d"; break;
    case "15m": yfInterval = "15m"; yfRange = "1mo"; break;
    case "30m": yfInterval = "30m"; yfRange = "1mo"; break;
    case "1h": yfInterval = "1h"; yfRange = "3mo"; break;
    case "2h": yfInterval = "2h"; yfRange = "3mo"; break;
    case "weekly": yfInterval = "1wk"; yfRange = "5y"; break;
    default: yfInterval = "1d"; yfRange = "2y"; break;
  }
  var symbols = [ticker + ".NS"];
  for (var s = 0; s < symbols.length; s++) {
    for (var h = 0; h < Y_HOSTS.length; h++) {
      for (var p = 0; p < PROXY_FNS.length; p++) {
        try {
          var yUrl = "https://" + Y_HOSTS[h] + "/v8/finance/chart/" + encodeURIComponent(symbols[s]) + "?interval=" + yfInterval + "&range=" + yfRange;
          var r = await _fetchX(PROXY_FNS[p](yUrl), {}, 10000);
          if (!r.ok) continue;
          var txt = await _readBody(r, 8000);
          var json = JSON.parse(_unwrap(txt));
          var result = json?.chart?.result?.[0];
          if (!result) continue;
          var timestamps = result.timestamp || [];
          var quotes = result.indicators?.quote?.[0] || {};
          if (timestamps.length < 2) continue;
          var candles = [];
          for (var i = 0; i < timestamps.length; i++) {
            var o = quotes.open?.[i], h2 = quotes.high?.[i], l = quotes.low?.[i], c = quotes.close?.[i], v = quotes.volume?.[i];
            if (c == null || isNaN(c) || c <= 0) continue;
            var istMs = timestamps[i] * 1000 + (5.5 * 60 * 60 * 1000);
            var d = new Date(istMs);
            candles.push({
              t: d.toISOString().split("T")[0] + " " + d.toISOString().split("T")[1].substring(0, 5),
              o: Math.round((o || c) * 100) / 100,
              h: Math.round((h2 || c) * 100) / 100,
              l: Math.round((l || c) * 100) / 100,
              c: Math.round(c * 100) / 100,
              v: v || 0
            });
          }
          if (candles.length >= 10) return candles;
        } catch { continue; }
      }
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   TECHNICAL INDICATORS ENGINE
   ══════════════════════════════════════════════════════════════════════════ */
/* ── Global indicator definitions (available to all components) ── */
var ALL_INDS = [
  { name: "SMA (20)", key: "sma_20", cat: "Trend", type: "line" },
  { name: "SMA (50)", key: "sma_50", cat: "Trend", type: "line" },
  { name: "SMA (200)", key: "sma_200", cat: "Trend", type: "line" },
  { name: "EMA (9)", key: "ema_9", cat: "Trend", type: "line" },
  { name: "EMA (21)", key: "ema_21", cat: "Trend", type: "line" },
  { name: "EMA (50)", key: "ema_50", cat: "Trend", type: "line" },
  { name: "WMA (20)", key: "wma_20", cat: "Trend", type: "line" },
  { name: "VWAP", key: "vwap", cat: "Volume", type: "line" },
  { name: "RSI (14)", key: "rsi_14", cat: "Momentum", type: "oscillator", range: [0, 100] },
  { name: "MACD", key: "macd", cat: "Momentum", type: "macd" },
  { name: "ATR (14)", key: "atr_14", cat: "Volatility", type: "line" },
  { name: "Bollinger Bands", key: "bb", cat: "Volatility", type: "bands" },
  { name: "ADX (14)", key: "adx_14", cat: "Trend", type: "oscillator", range: [0, 100] },
  { name: "SuperTrend", key: "supertrend", cat: "Trend", type: "line" },
  { name: "Ichimoku Cloud", key: "ichimoku", cat: "Trend", type: "ichimoku" },
  { name: "Donchian Channels", key: "donchian", cat: "Volatility", type: "bands" },
  { name: "Keltner Channels", key: "keltner", cat: "Volatility", type: "bands" },
  { name: "OBV", key: "obv", cat: "Volume", type: "volume" },
  { name: "CMF (20)", key: "cmf_20", cat: "Volume", type: "oscillator", range: [-1, 1] },
  { name: "Stochastic RSI", key: "stochRSI", cat: "Momentum", type: "stoch" },
  { name: "CCI (20)", key: "cci_20", cat: "Momentum", type: "oscillator", range: [-200, 200] },
  { name: "ROC (12)", key: "roc_12", cat: "Momentum", type: "oscillator" },
  { name: "Momentum (10)", key: "momentum_10", cat: "Momentum", type: "oscillator" },
  { name: "Parabolic SAR", key: "psar", cat: "Trend", type: "line" },
  { name: "HMA (20)", key: "hma_20", cat: "Trend", type: "line" },
  { name: "KAMA (10)", key: "kama_10", cat: "Trend", type: "line" },
  { name: "TSI", key: "tsi", cat: "Momentum", type: "oscillator" },
  { name: "STC", key: "stc", cat: "Momentum", type: "oscillator", range: [0, 100] },
  { name: "MFI (14)", key: "mfi_14", cat: "Volume", type: "oscillator", range: [0, 100] },
  { name: "PVT", key: "pvt", cat: "Volume", type: "volume" },
  { name: "KVO", key: "kvo", cat: "Volume", type: "oscillator" },
  { name: "Anchored VWAP", key: "anchored_vwap", cat: "Volume", type: "line" },
  { name: "Volume Profile", key: "volumeProfile", cat: "Volume", type: "volumeProfile" },
  { name: "TTM Squeeze", key: "ttmSqueeze", cat: "Volatility", type: "squeeze" },
  { name: "Squeeze Momentum", key: "squeezeMomentum", cat: "Momentum", type: "oscillator" },
  { name: "Darvas Box", key: "darvasBox", cat: "Volatility", type: "darvas" },
  { name: "Smart Money", key: "smartMoney", cat: "Volume", type: "smartMoney" },
  { name: "MTF Alignment", key: "mtfAlignment", cat: "Trend", type: "oscillator", range: [0, 100] },
  { name: "Chandelier Exit", key: "chandelier", cat: "Volatility", type: "chandelier" },
  { name: "Heikin-Ashi", key: "heikinAshi", cat: "Trend", type: "heikinAshi" },
  { name: "Choppiness Index", key: "choppiness", cat: "Volatility", type: "oscillator", range: [0, 100] },
  { name: "Williams %R", key: "williamsR", cat: "Momentum", type: "oscillator", range: [-100, 0] },
  { name: "Awesome Oscillator", key: "awesomeOsc", cat: "Momentum", type: "oscillator" },
  { name: "Force Index", key: "forceIndex", cat: "Volume", type: "volume" },
  { name: "Fibonacci Levels", key: "fibonacci", cat: "Structure", type: "fibonacci" },
  { name: "Pivot Points", key: "pivotPoints", cat: "Structure", type: "pivotPoints" },
  { name: "Williams Fractals", key: "fractals", cat: "Structure", type: "fractals" },
  { name: "Aroon", key: "aroon", cat: "Trend", type: "aroon" },
  { name: "Zig Zag", key: "zigZag", cat: "Structure", type: "zigZag" },
  { name: "Vortex Indicator", key: "vortex", cat: "Trend", type: "vortex" },
  { name: "RS vs Nifty50", key: "rs_vs_nifty", cat: "Trend", type: "rs" },
  { name: "Beta vs Nifty50", key: "beta_nifty", cat: "Momentum", type: "line" },
];
var ALL_CATS = ["Trend", "Momentum", "Volatility", "Volume", "Structure"];
var CHART_OVERLAY_DEFS = [
  { key: "ma", label: "MA" },
  { key: "bb", label: "Bollinger" },
  { key: "vwap", label: "VWAP" },
  { key: "st", label: "SuperTrend" },
  { key: "sar", label: "PSAR" },
  { key: "lvl", label: "Levels" }
];
var CHART_OSC_DEFS = [
  { key: "none", label: "None" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" }
];
window.STOX_INDICATORS = ALL_INDS;
window.STOX_CATEGORIES = ALL_CATS;

const TechIndicators = window.TechIndicators;

/* ══════════════════════════════════════════════════════════════════════════
   NIFTY 50 / SENSEX REFERENCE DATA
   ══════════════════════════════════════════════════════════════════════════ */
const INDICES = [
  { name: "NIFTY 50", ticker: "^NSEI", exchange: "NSE" },
  { name: "SENSEX", ticker: "^BSESN", exchange: "BSE" },
  { name: "NIFTY BANK", ticker: "^NSEBANK", exchange: "NSE" },
  { name: "NIFTY IT", ticker: "^CNXIT", exchange: "NSE" },
];

const POPULAR_STOCKS = [
  { ticker: "RELIANCE", name: "Reliance Industries" },
  { ticker: "TCS", name: "Tata Consultancy Services" },
  { ticker: "HDFCBANK", name: "HDFC Bank" },
  { ticker: "INFY", name: "Infosys" },
  { ticker: "ICICIBANK", name: "ICICI Bank" },
  { ticker: "HINDUNILVR", name: "Hindustan Unilever" },
  { ticker: "ITC", name: "ITC Limited" },
  { ticker: "SBIN", name: "State Bank of India" },
  { ticker: "BHARTIARTL", name: "Bharti Airtel" },
  { ticker: "KOTAKBANK", name: "Kotak Mahindra Bank" },
  { ticker: "LT", name: "Larsen & Toubro" },
  { ticker: "AXISBANK", name: "Axis Bank" },
  { ticker: "BAJFINANCE", name: "Bajaj Finance" },
  { ticker: "MARUTI", name: "Maruti Suzuki" },
  { ticker: "SUNPHARMA", name: "Sun Pharmaceutical" },
  { ticker: "TATAMOTORS", name: "Tata Motors" },
  { ticker: "WIPRO", name: "Wipro" },
  { ticker: "HCLTECH", name: "HCL Technologies" },
  { ticker: "ADANIENT", name: "Adani Enterprises" },
  { ticker: "TITAN", name: "Titan Company" },
  { ticker: "ASIANPAINT", name: "Asian Paints" },
  { ticker: "BAJAJFINSV", name: "Bajaj Finserv" },
  { ticker: "TECHM", name: "Tech Mahindra" },
  { ticker: "POWERGRID", name: "Power Grid Corp" },
  { ticker: "NTPC", name: "NTPC Limited" },
];

const SECTORS = [
  "Technology", "Banking & Finance", "Energy", "Consumer", "Healthcare",
  "Automobile", "Infrastructure", "Telecom", "Pharma", "FMCG",
  "Metal & Mining", "Real Estate", "Media", "Chemicals", "Textiles"
];

/* ══════════════════════════════════════════════════════════════════════════
   ICONS — SVG icon helpers
   ══════════════════════════════════════════════════════════════════════════ */
const Icons = {
  home: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M4 10.5L12 3l8 7.5V20a1 1 0 0 1-1 1h-4v-5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v5H5a1 1 0 0 1-1-1V10.5z" })
  ),
  search: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 11, cy: 11, r: 7 }),
    React.createElement("line", { x1: 16.5, y1: 16.5, x2: 21, y2: 21 })
  ),
  chart: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "22 12 18 12 15 21 9 3 6 12 2 12" })
  ),
  briefcase: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("rect", { x: 2, y: 7, width: 20, height: 14, rx: 2 }),
    React.createElement("path", { d: "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" })
  ),
  eye: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" }),
    React.createElement("circle", { cx: 12, cy: 12, r: 3 })
  ),
  settings: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 12, cy: 12, r: 3 }),
    React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })
  ),
  plus: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("line", { x1: 12, y1: 5, x2: 12, y2: 19 }),
    React.createElement("line", { x1: 5, y1: 12, x2: 19, y2: 12 })
  ),
  trash: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "3 6 5 6 21 6" }),
    React.createElement("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })
  ),
  x: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("line", { x1: 18, y1: 6, x2: 6, y2: 18 }),
    React.createElement("line", { x1: 6, y1: 6, x2: 18, y2: 18 })
  ),
  refresh: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "23 4 23 10 17 10" }),
    React.createElement("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
  ),
  sun: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 12, cy: 12, r: 4 }),
    React.createElement("line", { x1: 12, y1: 2, x2: 12, y2: 5 }),
    React.createElement("line", { x1: 12, y1: 19, x2: 12, y2: 22 }),
    React.createElement("line", { x1: 4.93, y1: 4.93, x2: 7.05, y2: 7.05 }),
    React.createElement("line", { x1: 16.95, y1: 16.95, x2: 19.07, y2: 19.07 }),
    React.createElement("line", { x1: 2, y1: 12, x2: 5, y2: 12 }),
    React.createElement("line", { x1: 19, y1: 12, x2: 22, y2: 12 }),
    React.createElement("line", { x1: 4.93, y1: 19.07, x2: 7.05, y2: 16.95 }),
    React.createElement("line", { x1: 16.95, y1: 7.05, x2: 19.07, y2: 4.93 })
  ),
  moon: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" })
  ),
  trendingUp: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "23 6 13.5 15.5 8.5 10.5 1 18" }),
    React.createElement("polyline", { points: "17 6 23 6 23 12" })
  ),
  trendingDown: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "23 18 13.5 8.5 8.5 13.5 1 6" }),
    React.createElement("polyline", { points: "17 18 23 18 23 12" })
  ),
  arrowUp: (s = 16) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "18 15 12 9 6 15" })
  ),
  arrowDown: (s = 16) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polyline", { points: "6 9 12 15 18 9" })
  ),
  rupee: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M6 3h12" }),
    React.createElement("path", { d: "M6 8h12" }),
    React.createElement("path", { d: "M6 3c0 4.5 6 6 6 11" }),
    React.createElement("path", { d: "M18 3c0 4.5-6 6-6 11" }),
    React.createElement("path", { d: "M6 14c3 2 9 2 12 0" })
  ),
  star: (s = 20, filled = false) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: filled ? "currentColor" : "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polygon", { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" })
  ),
  unicorn: (s = 20, filled = false) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: filled ? "currentColor" : "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M12 2C9 8 7 12 7 16c0 3.3 2.2 6 5 6s5-2.7 5-6c0-4-2-8-5-14z" }),
    React.createElement("path", { d: "M9.5 13h5" }),
    React.createElement("path", { d: "M10 16h4" })
  ),
  edit: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }),
    React.createElement("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })
  ),
  clock: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 12, cy: 12, r: 10 }),
    React.createElement("polyline", { points: "12 6 12 12 16 14" })
  ),
  save: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" }),
    React.createElement("polyline", { points: "17 21 17 13 7 13 7 21" }),
    React.createElement("polyline", { points: "7 3 7 8 15 8" })
  ),
  filter: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("polygon", { points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" })
  ),
  info: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("circle", { cx: 12, cy: 12, r: 10 }),
    React.createElement("line", { x1: 12, y1: 16, x2: 12, y2: 12 }),
    React.createElement("line", { x1: 12, y1: 8, x2: 12.01, y2: 8 })
  ),
  pen: (s = 20) => React.createElement("svg", { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" })
  ),
};

/* ══════════════════════════════════════════════════════════════════════════
   TOAST SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */
let _toastId = 0;
let _toasts = [];
let _setToasts = null;

function showToast(msg, duration = 3000, action) {
  if (!_setToasts) return;
  const id = ++_toastId;
  _setToasts((prev) => [...prev, { id, msg, action, persistent: duration === 0 }]);
  if (duration > 0) {
    setTimeout(() => {
      _setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }
}

window.addEventListener('stox:update-ready', function() {
  showToast('New version available \u2014 updating\u2026', 5000);
  var reg = window.__swReg;
  if (reg && reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
});

window.addEventListener('fsa:permission-needed', function() {
  if (window.__fsa && window.__fsa.handle && !window.__fsa.ready) {
    showToast("File auto-save needs write permission", 15000, { label: "Grant Permission", onClick: function() {
      if (window.__fsa && window.__fsa.grantPermission) window.__fsa.grantPermission();
    }});
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   THEMES & FONTS
   ══════════════════════════════════════════════════════════════════════════ */
const THEMES = [
  { id: "violet",      name: "Violet Light",  desc: "Rich purple-violet",   dark: false, preview: ["#f8f6ff","#7c3aed","#ddd8f5","#6d28d9"] },
  { id: "indigo",      name: "Indigo Light",  desc: "Deep indigo-blue",     dark: false, preview: ["#eef2ff","#4f46e5","#c8d4f8","#4338ca"] },
  { id: "blue",        name: "Blue Light",    desc: "Classic bright blue",  dark: false, preview: ["#eff6ff","#2563eb","#bfdbfe","#1d4ed8"] },
  { id: "green",       name: "Green Light",   desc: "Fresh emerald green",  dark: false, preview: ["#f0fdf4","#16a34a","#bbf7d0","#15803d"] },
  { id: "yellow",      name: "Yellow Light",  desc: "Warm golden yellow",   dark: false, preview: ["#fffbeb","#ca8a04","#fde68a","#a16207"] },
  { id: "orange",      name: "Orange Light",  desc: "Vibrant fiery orange", dark: false, preview: ["#fff7ed","#ea580c","#fed7aa","#c2410c"] },
  { id: "red",         name: "Red Light",     desc: "Bold crimson red",     dark: false, preview: ["#fef2f2","#dc2626","#fecaca","#b91c1c"] },
  { id: "violet-dark", name: "Violet Dark",   desc: "Deep violet night",    dark: true,  preview: ["#0c0818","#a78bfa","#38245e","#8b5cf6"] },
  { id: "indigo-dark", name: "Indigo Dark",   desc: "Indigo midnight",      dark: true,  preview: ["#08081a","#818cf8","#2e2c62","#6366f1"] },
  { id: "blue-dark",   name: "Blue Dark",     desc: "Deep ocean blue",      dark: true,  preview: ["#070c18","#60a5fa","#26406a","#3b82f6"] },
  { id: "green-dark",  name: "Green Dark",    desc: "Forest emerald",       dark: true,  preview: ["#060e08","#4ade80","#224232","#22c55e"] },
  { id: "yellow-dark", name: "Yellow Dark",   desc: "Dark amber glow",      dark: true,  preview: ["#100c04","#facc15","#4e462a","#eab308"] },
  { id: "orange-dark", name: "Orange Dark",   desc: "Ember orange night",   dark: true,  preview: ["#120a04","#fb923c","#523e24","#f97316"] },
  { id: "red-dark",    name: "Red Dark",      desc: "Dark blood red",       dark: true,  preview: ["#140606","#f87171","#582828","#ef4444"] },
];
const FONTS = [
  { id: "dm-sans",            name: "DM Sans",            stack: "'DM Sans', sans-serif" },
  { id: "inter",              name: "Inter",              stack: "'Inter', sans-serif" },
  { id: "plus-jakarta-sans",  name: "Plus Jakarta Sans",  stack: "'Plus Jakarta Sans', sans-serif" },
  { id: "manrope",            name: "Manrope",            stack: "'Manrope', sans-serif" },
  { id: "outfit",             name: "Outfit",             stack: "'Outfit', sans-serif" },
  { id: "space-grotesk",      name: "Space Grotesk",      stack: "'Space Grotesk', sans-serif" },
];
const loadTheme = () => { try { const t = localStorage.getItem("stox_theme_id"); if (t && THEMES.find(th => th.id === t)) return t; } catch {} return "green"; };
const saveTheme = id => { try { localStorage.setItem("stox_theme_id", id); } catch {} };
const applyTheme = id => {
  const th = THEMES.find(t => t.id === id) || THEMES[0];
  document.documentElement.setAttribute("data-theme", id);
  document.documentElement.setAttribute("data-mode", th.dark ? "dark" : "light");
  if (th.dark) { document.documentElement.style.setProperty("color-scheme", "dark"); }
  else { document.documentElement.style.removeProperty("color-scheme"); }
};
const loadFont = () => { try { const f = localStorage.getItem("stox_font_id"); if (f && FONTS.find(fo => fo.id === f)) return f; } catch {} return "dm-sans"; };
const saveFont = id => { try { localStorage.setItem("stox_font_id", id); } catch {} };
const applyFont = id => {
  const font = FONTS.find(f => f.id === id) || FONTS[0];
  document.documentElement.style.setProperty("--font-body", font.stack);
};

var _confirmResolve = null;
function showConfirm(msg) {
  return new Promise(function(resolve) {
    _confirmResolve = resolve;
    var el = document.createElement("div");
    el.className = "modal-bd";
    el.id = "stox-confirm-modal";
    el.style.zIndex = "3000";
    el.onclick = function(e) { if (e.target === e.currentTarget) { el.remove(); _confirmResolve = null; resolve(false); } };
    el.innerHTML = '<div class="stx-card stx-fu" style="max-width:400px;margin:40px auto;width:92vw;padding:24px;text-align:center">'
      + '<p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 20px;line-height:1.5">' + msg + '</p>'
      + '<div style="display:flex;gap:10px;justify-content:center">'
      + '<button id="stox-confirm-cancel" class="stx-btn stx-btn-ghost" style="padding:8px 20px;font-size:13px">Cancel</button>'
      + '<button id="stox-confirm-ok" class="stx-btn" style="padding:8px 20px;font-size:13px;background:#ef4444;color:#fff;border-color:#ef4444">Confirm</button>'
      + '</div></div>';
    document.body.appendChild(el);
    document.getElementById("stox-confirm-cancel").onclick = function() { el.remove(); _confirmResolve = null; resolve(false); };
    document.getElementById("stox-confirm-ok").onclick = function() { el.remove(); _confirmResolve = null; resolve(true); };
  });
}
window.showConfirm = showConfirm;

function ToastHost() {
  const [toasts, setToasts] = useState([]);
  _setToasts = setToasts;
  if (toasts.length === 0) return null;
  return React.createElement("div", { className: "stx-toast-host" },
    toasts.map((t) =>
      React.createElement("div", { key: t.id, className: "stx-toast" + (t.persistent ? " stx-toast-persistent" : ""), style: t.persistent ? { background: "var(--accent)", color: "#fff", border: "none", fontWeight: 700, boxShadow: "0 4px 24px rgba(0,0,0,.25)" } : {} },
        t.persistent && React.createElement("span", { style: { marginRight: 6, display: "inline-flex" } }, Ico.alertTriangle(13, "#f59e0b")),
        React.createElement("span", { className: "stx-toast-msg" }, t.msg),
        t.action && React.createElement("button", {
          className: "stx-toast-action",
          onClick: () => { t.action.onClick(); setToasts((prev) => prev.filter((x) => x.id !== t.id)); }
        }, t.action.label),
        React.createElement("button", {
          className: "stx-toast-close",
          style: t.persistent ? { color: "rgba(255,255,255,.8)" } : {},
          onClick: () => setToasts((prev) => prev.filter((x) => x.id !== t.id))
        }, Ico.x(14))
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: StatCard
   ══════════════════════════════════════════════════════════════════════════ */
function StatCard({ label, value, sub, icon, color, className }) {
  return React.createElement("div", {
    className: "stx-card stx-statcard " + (className || ""),
    style: { borderLeft: color ? "3px solid " + color : undefined }
  },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 } },
      React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", letterSpacing: 0.5 } }, label),
      icon && React.createElement("span", { style: { color: color || "var(--accent)", opacity: 0.7 } }, icon)
    ),
    React.createElement("div", { style: { fontSize: 22, fontWeight: 800, fontFamily: "var(--font-heading)", color: color || "var(--text)", lineHeight: 1.2 } }, value),
    sub && React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 4 } }, sub)
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: SignalBadge
   ══════════════════════════════════════════════════════════════════════════ */
const SIGNAL_COLORS = {
  bullish: { bg: "var(--profitbg)", border: "var(--profitborder)", text: "var(--profit)", label: "Bullish" },
  bearish: { bg: "var(--lossbg)", border: "var(--lossborder)", text: "var(--loss)", label: "Bearish" },
  overbought: { bg: "var(--warnbg)", border: "var(--warnborder)", text: "var(--warn)", label: "Overbought" },
  oversold: { bg: "var(--infobg)", border: "var(--infoborder)", text: "var(--info)", label: "Oversold" },
  neutral: { bg: "var(--bg5)", border: "var(--border)", text: "var(--text5)", label: "Neutral" },
  trending: { bg: "rgba(168,85,247,.12)", border: "rgba(168,85,247,.3)", text: "#a855f7", label: "Trending" },
  ranging: { bg: "var(--bg5)", border: "var(--border)", text: "var(--text5)", label: "Ranging" },
};

function SignalBadge(signal) {
  if (!signal) return null;
  var s = SIGNAL_COLORS[signal] || SIGNAL_COLORS.neutral;
  return React.createElement("span", {
    style: { display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, background: s.bg, border: "1px solid " + s.border, color: s.text, textTransform: "uppercase" }
  }, s.label);
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: MiniSparkline
   ══════════════════════════════════════════════════════════════════════════ */
function MiniSparkline({ data, width = 100, height = 32, color }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return x + "," + y;
  }).join(" ");
  const isUp = data[data.length - 1] >= data[0];
  const lineColor = color || (isUp ? "var(--profit)" : "var(--loss)");
  return React.createElement("svg", { width, height, style: { overflow: "visible" } },
    React.createElement("polyline", { points, fill: "none", stroke: lineColor, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" })
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MarketTicker — live scrolling ticker for Indian indices + commodities
   ══════════════════════════════════════════════════════════════════════════ */
const MarketTicker = React.memo(function MarketTicker() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const scrollRef = useRef(null);
  const autoScrollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await fetchMarketIndices();
      if (d.length) { setData(d); setLastUpdated(new Date()); }
      else setError("Could not fetch market data");
    } catch (e) { setError(e.message || "Failed to load"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);

  /* Auto-scroll animation */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || data.length < 2) return;
    let pos = 0, dir = 1, paused = false;
    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("touchstart", onEnter, { passive: true });
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("touchend", onLeave);
    const tick = () => {
      if (!paused && el.scrollWidth > el.clientWidth) {
        pos += dir * 0.5;
        if (pos >= el.scrollWidth - el.clientWidth - 2) dir = -1;
        if (pos <= 0) dir = 1;
        el.scrollLeft = pos;
      }
      autoScrollRef.current = requestAnimationFrame(tick);
    };
    autoScrollRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(autoScrollRef.current);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("touchstart", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("touchend", onLeave);
    };
  }, [data]);

  if (!data.length && !loading && !error) return null;

  const fmtPrice = (v, cur) => {
    if (v == null) return "--";
    if (cur === "USD") return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return "\u20b9" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return React.createElement("div", { style: { marginBottom: 24 } },
    /* Header row */
    React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
        React.createElement("div", { style: { width: 3, height: 14, borderRadius: 2, background: "#16a34a", flexShrink: 0 } }),
        React.createElement("span", { style: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text5)" } }, "Market Indices"),
        loading && React.createElement("span", { style: { fontSize: 12, color: "var(--text6)" } }, "\u27f3")
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        lastUpdated && React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", whiteSpace: "nowrap" } },
          "Updated " + lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        ),
        React.createElement("button", {
          onClick: load, disabled: loading,
          style: { fontSize: 10, padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(22,163,74,.3)", background: loading ? "var(--bg5)" : "rgba(22,163,74,.08)", color: "#16a34a", cursor: loading ? "default" : "pointer", fontFamily: "inherit", fontWeight: 600, opacity: loading ? 0.5 : 1 }
        }, loading ? "\u27f3 \u2026" : "\u27f3 Refresh")
      )
    ),
    /* Ticker strip */
    error && !data.length
      ? React.createElement("div", { style: { padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)", fontSize: 12, color: "#ef4444", textAlign: "center" } }, error)
      : React.createElement("div", { ref: scrollRef, style: {
          display: "flex", gap: 10, overflowX: "auto", overflowY: "hidden",
          paddingBottom: 6, scrollbarWidth: "thin",
          WebkitOverflowScrolling: "touch",
        }},
        data.map((item, idx) => {
          const isUp = item.change >= 0;
          const col = isUp ? "#16a34a" : "#ef4444";
          const bgCol = isUp ? "rgba(22,163,74,.06)" : "rgba(239,68,68,.06)";
          const borderCol = isUp ? "rgba(22,163,74,.18)" : "rgba(239,68,68,.18)";
          const groupCol = item.group === "Commodity" ? "#b45309" : item.group === "Sector" ? "#6d28d9" : "#0e7490";
          return React.createElement("div", { key: item.symbol + idx, style: {
            flex: "0 0 auto", minWidth: 155, maxWidth: 200,
            padding: "10px 14px", borderRadius: 10,
            background: bgCol, border: "1px solid " + borderCol,
          }},
            /* Group badge + currency */
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 } },
              React.createElement("span", { style: { fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: groupCol + "18", color: groupCol, border: "1px solid " + groupCol + "30", textTransform: "uppercase", letterSpacing: 0.6 } }, item.group),
              item.currency === "USD" && React.createElement("span", { style: { fontSize: 8, fontWeight: 600, color: "var(--text6)" } }, "USD")
            ),
            /* Index name */
            React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text2)", marginBottom: 6, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, item.name),
            /* Price */
            React.createElement("div", { style: { fontWeight: 800, fontSize: 15, color: "var(--text)", marginBottom: 4, whiteSpace: "nowrap", fontFamily: "var(--font-mono)" } }, fmtPrice(item.price, item.currency)),
            /* Change row */
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" } },
              React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: col, lineHeight: 1 } },
                isUp ? Ico.triangleUp(10, "#22c55e") : Ico.triangleDown(10, "#ef4444"), " ",
                item.currency === "USD"
                  ? "$" + Math.abs(item.change).toFixed(2)
                  : "\u20b9" + Math.abs(item.change).toFixed(2)
              ),
              React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: col, background: col + "15", padding: "1px 5px", borderRadius: 4 } },
                (isUp ? "+" : "") + item.changePct.toFixed(2) + "%"
              )
            )
          );
        })
    )
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   MARKET NEWS PANEL — RSS Feeds (ET, Moneycontrol, HinduBL)
   ══════════════════════════════════════════════════════════════════════════ */
const RSS_FEEDS = [
  { name: "Economic Times", url: "https://economictimes.indiatimes.com/rssfeeds/13357109.cms" },
  { name: "Moneycontrol", url: "https://www.moneycontrol.com/rss/MCtopnews.xml" },
  { name: "The Hindu BusinessLine", url: "https://www.thehindubusinessline.com/feeder/default.rss" }
];

function MarketNewsPanel({ holdings }) {
  const [news, setNews] = React.useState([]);
  const [stockNews, setStockNews] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("market");
  const [expanded, setExpanded] = React.useState({});

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    return days + "d ago";
  };

  const stripHtml = (html) => {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, "\"");
  };

  // Fetch all RSS feeds on mount
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(RSS_FEEDS.map(function (feed) {
      var rssUrl = encodeURIComponent(feed.url);
      return fetch("https://api.rss2json.com/v1/api.json?rss_url=" + rssUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.status !== "ok" || !data.items) return [];
          return data.items.map(function (item) {
            return {
              title: item.title || "",
              description: item.description || "",
              image_url: item.thumbnail || null,
              source: feed.name,
              published_at: item.pubDate || "",
              url: item.link || "",
              uuid: item.guid || item.link || Math.random().toString(36)
            };
          });
        })
        .catch(function () { return []; });
    })).then(function (results) {
      if (cancelled) return;
      var all = results.flat();
      var seen = {};
      var unique = [];
      for (var i = 0; i < all.length; i++) {
        var key = (all[i].title || "").toLowerCase().slice(0, 60);
        if (seen[key]) continue;
        seen[key] = true;
        unique.push(all[i]);
      }
      unique.sort(function (a, b) { return new Date(b.published_at) - new Date(a.published_at); });
      var top = unique.slice(0, 15);
      setNews(top);
      if (holdings && holdings.length > 0) {
        var keywords = [];
        for (var j = 0; j < holdings.length; j++) {
          var tk = (holdings[j].ticker || "").toLowerCase();
          var co = (holdings[j].company || "").toLowerCase();
          if (co && keywords.indexOf(co) === -1) keywords.push(co);
          if (tk && keywords.indexOf(tk) === -1) keywords.push(tk);
        }
        var filtered = [];
        for (var k = 0; k < top.length; k++) {
          var text = (top[k].title + " " + top[k].description).toLowerCase();
          for (var m = 0; m < keywords.length; m++) {
            if (text.indexOf(keywords[m]) !== -1) { filtered.push(top[k]); break; }
          }
        }
        setStockNews(filtered.slice(0, 12));
      } else {
        setStockNews([]);
      }
      setLoading(false);
    }).catch(function () { if (!cancelled) setLoading(false); });
    return function () { cancelled = true; };
  }, [holdings]);

  const renderNewsCard = (article, idx) => {
    var isExp = expanded[article.uuid];
    var desc = stripHtml(article.description || "");
    var shortDesc = desc.length > 140 ? desc.slice(0, 140) + "..." : desc;
    var hasImage = !!article.image_url;

    return React.createElement("div", {
      key: article.uuid || idx,
      className: "stx-card",
      style: { padding: "14px 16px", marginBottom: 0, animation: "stxFadeIn .35s ease " + (idx * 0.04) + "s both", cursor: "pointer", transition: "border-color .15s, box-shadow .15s" },
      onClick: function () { if (article.url) window.open(article.url, "_blank", "noopener"); },
      onMouseEnter: function (e) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; },
      onMouseLeave: function (e) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }
    },
      React.createElement("div", { style: { display: "flex", gap: 12 } },
        hasImage && React.createElement("div", {
          style: { width: 72, height: 72, borderRadius: 8, backgroundSize: "cover", backgroundPosition: "center", backgroundImage: "url(" + article.image_url + ")", flexShrink: 0 }
        }),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.35, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } }, article.title),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", lineHeight: 1.4, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: isExp ? 10 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" } }, isExp ? desc : shortDesc),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", fontWeight: 600 } }, article.source || "Unknown"),
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "\u00b7"),
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, timeAgo(article.published_at))
          )
        )
      )
    );
  };

  return React.createElement("div", { style: { marginTop: 24 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 } },
      React.createElement("h2", { style: { fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Market News"),
      React.createElement("div", { style: { display: "flex", gap: 2, background: "var(--bg5)", borderRadius: 8, padding: 2, border: "1px solid var(--border)" } },
        React.createElement("button", {
          onClick: function () { setActiveTab("market"); },
          style: { padding: "4px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: activeTab === "market" ? "var(--accent)" : "transparent", color: activeTab === "market" ? "#fff" : "var(--text5)", transition: "all .15s", fontFamily: "var(--font-body)" }
        }, "Indian Markets"),
        holdings && holdings.length > 0 && React.createElement("button", {
          onClick: function () { setActiveTab("stock"); },
          style: { padding: "4px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: activeTab === "stock" ? "var(--accent)" : "transparent", color: activeTab === "stock" ? "#fff" : "var(--text5)", transition: "all .15s", fontFamily: "var(--font-body)" }
        }, "My Holdings")
      ),
      React.createElement("div", { style: { marginLeft: "auto", fontSize: 10, color: "var(--text6)" } }, "RSS Feeds: ET, Moneycontrol, HinduBL")
    ),

    activeTab === "market" && React.createElement("div", null,
      loading && React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text5)" } },
        React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite" } }, Ico.refresh(20)),
        React.createElement("div", { style: { marginTop: 8, fontSize: 12 } }, "Loading market news...")
      ),
      !loading && news.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 32, color: "var(--text6)", fontSize: 12 } }, "No news available right now."),
      !loading && news.length > 0 && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 } },
        news.map(function (a, i) { return renderNewsCard(a, i); })
      )
    ),

    activeTab === "stock" && React.createElement("div", null,
      loading && React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text5)" } },
        React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite" } }, Ico.refresh(20)),
        React.createElement("div", { style: { marginTop: 8, fontSize: 12 } }, "Loading news for your holdings...")
      ),
      !loading && stockNews.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 32, color: "var(--text6)", fontSize: 12 } }, "No relevant news found for your holdings."),
      !loading && stockNews.length > 0 && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 } },
        stockNews.map(function (a, i) { return renderNewsCard(a, i); })
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Dashboard
   ══════════════════════════════════════════════════════════════════════════ */
function Dashboard({ holdings, watchlist, prices, navigate, refreshPrices }) {
  const [loading, setLoading] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | "testing" | { ok, msg }

  const testConnectivity = async function () {
    setTestStatus("testing");
    var results = [];
    for (var pi = 0; pi < PROXY_FNS.length; pi++) {
      var ok = false, err = null;
      try {
        var url = PROXY_FNS[pi]("https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=1d&_t=" + Date.now());
        var r = await _fetchX(url, {}, 6000);
        if (r.ok) { var txt = await _readBody(r); var j = JSON.parse(_unwrap(txt)); ok = !!(j?.chart?.result?.[0]?.meta?.regularMarketPrice); if (!ok) err = "no price in response"; }
        else err = "HTTP " + r.status;
      } catch (e) { err = e.message || "timeout/error"; }
      var proxyName = "https://" + (url.match(/https?:\/\/([^\/]+)/) || [])[1] || ("Proxy " + (pi + 1));
      results.push({ proxy: proxyName, ok: ok, err: err });
    }
    var passed = results.filter(function (r) { return r.ok; }).length;
    var total = results.length;
    var lines = results.map(function (r) { return (r.ok ? "Pass" : "Fail") + " " + r.proxy.replace("https://", "") + (r.ok ? "" : ": " + r.err); }).join("\n");
    setTestStatus({ ok: passed > 0, msg: passed + "/" + total + " proxies working\n" + lines });
    setTimeout(function () { setTestStatus(null); }, 8000);
  };

  const totalInvested = useMemo(() => {
    return holdings.reduce((s, h) => s + ((h.buyPrice || h.avgPrice || 0) * h.qty), 0);
  }, [holdings]);

  const totalCurrent = useMemo(() => {
    return holdings.reduce((s, h) => {
      const p = prices[h.ticker]?.price || h.currentPrice || h.buyPrice || h.avgPrice || 0;
      return s + (p * h.qty);
    }, 0);
  }, [holdings, prices]);

  const totalPnL = totalCurrent - totalInvested;
  const totalPnLPct = totalInvested > 0 ? ((totalPnL / totalInvested) * 100) : 0;
  const todayStr = TODAY();

  return React.createElement("div", null,
    // Header
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "DASHBOARD"),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Market Overview"),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", marginTop: 4 } }, todayStr + (isTradingWeekday() ? " \u00b7 Market Open" : " \u00b7 Market Closed"))
      ),
      React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
        React.createElement("button", {
          className: "stx-btn stx-btn-ghost",
          disabled: loading,
          onClick: async function() { setLoading(true); try { await refreshPrices(); } catch(e) {} setLoading(false); },
          style: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 14px", borderRadius: 8 }
        }, React.createElement("span", { style: { display: "inline-block", animation: loading ? "screener-spin .8s linear infinite" : "none" } }, Icons.refresh(14)), loading ? "Refreshing..." : "Refresh"),
        React.createElement("button", {
          disabled: testStatus === "testing",
          onClick: testConnectivity,
          style: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg4)", color: testStatus === "testing" ? "var(--text6)" : "var(--text5)", cursor: testStatus === "testing" ? "wait" : "pointer", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }
         }, testStatus === "testing" ? React.createElement(React.Fragment, null, Ico.hourglass(13, "#f59e0b"), " Testing...") : React.createElement(React.Fragment, null, Ico.zap(13), " Test API"))
      )
    ),

    // Test result banner
    testStatus && testStatus !== "testing" && React.createElement("div", { style: { padding: "8px 14px", borderRadius: 8, marginBottom: 14, background: testStatus.ok ? "rgba(22,163,74,.08)" : "rgba(239,68,68,.08)", border: "1px solid " + (testStatus.ok ? "rgba(22,163,74,.25)" : "rgba(239,68,68,.25)"), fontSize: 11, color: testStatus.ok ? "var(--profit)" : "var(--loss)", whiteSpace: "pre-line", lineHeight: 1.6 } }, testStatus.msg),

    // Stats row
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 24 } },
      React.createElement(StatCard, { label: "Total Invested", value: INR(totalInvested), color: "var(--info)" }),
      React.createElement(StatCard, { label: "Current Value", value: INR(totalCurrent), color: "var(--accent)" }),
      React.createElement(StatCard, { label: "Total P&L", value: INR(totalPnL), sub: (totalPnLPct >= 0 ? "+" : "") + totalPnLPct.toFixed(2) + "%", color: totalPnL >= 0 ? "var(--profit)" : "var(--loss)" }),
      React.createElement(StatCard, { label: "Holdings", value: holdings.length.toString(), sub: watchlist.length + " in watchlist", color: "var(--warn)" })
    ),

    // Market Indices
    React.createElement(MarketTicker),

    // Market News
    React.createElement(MarketNewsPanel, { holdings: holdings })
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Stock Analysis
   ══════════════════════════════════════════════════════════════════════════ */
function StockAnalysis({ ticker: initialTicker, prices, holdings, onBack }) {
  const [ticker, setTicker] = useState(initialTicker || "");

  const isMobile = window.innerWidth < 768;

  const price = prices[ticker?.toUpperCase()]?.price;
  const holding = (holdings || []).find(h => h.ticker === (ticker || "").toUpperCase());

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
      React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } },
          onBack && React.createElement("button", {
            onClick: onBack,
            className: "stx-btn stx-btn-ghost",
            style: { fontSize: 11, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }
          }, "\u2190 Back to Portfolio"),
          React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase" } }, "ANALYSIS")
        ),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Stock Analysis")
      )
    ),

    // Price header
    ticker && price && React.createElement("div", { className: "stx-card", style: { marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 20, fontWeight: 800, fontFamily: "var(--font-heading)" } }, ticker),
        React.createElement("div", { style: { fontSize: 28, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--accent)" } }, INR(price, 2))
      )
    ),

    // Indicator Guide (collapsible, shows actual values when available)
    React.createElement("div", {
      style: { marginBottom: 16, borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }
    },
      React.createElement("div", {
        onClick: function (e) { var n = e.currentTarget.nextElementSibling; if (n) n.style.display = n.style.display === "none" ? "block" : "none"; },
        style: { padding: "8px 14px", background: "var(--bg4)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: "var(--text)", userSelect: "none" }
      }, "\u2139\uFE0F " + ticker + " \u2014 " + (price > 0 ? "Price: " + INR(price, 2) : "Indicator Guide")),
      React.createElement("div", { style: { padding: "10px 14px", fontSize: 11, lineHeight: 1.7, color: "var(--text4)", background: "var(--bg3)", borderTop: "1px solid var(--border)" } },
        React.createElement("div", { style: { marginBottom: 6 } },
          React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "How to use this page: "),
          "The ", React.createElement("span", { style: { fontWeight: 600, color: "var(--accent)" } }, "Technical Indicators"),
          " panel below shows computed values for all indicators. Hover over the ", React.createElement("span", { style: { fontWeight: 700, color: "var(--accent)", background: "var(--accentbg)", padding: "0 4px", borderRadius: 3 } }, "?"),
          " button in the panel to see a dynamic guide with actual indicator values for " + ticker + "."
        ),
        React.createElement("div", { style: { marginBottom: 6 } },
          React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "Signals: "),
          "Each indicator shows a ",
          React.createElement("span", { style: { color: "#16a34a", fontWeight: 600 } }, "Bullish"),
          "/", React.createElement("span", { style: { color: "#ef4444", fontWeight: 600 } }, "Bearish"),
          "/Neutral badge. These are rule-based (e.g., price above MA = bullish)."
        ),
        React.createElement("div", { style: { marginBottom: 6 } },
          React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "Categories: "),
          "Trend \u2014 MAs, MACD, ADX, SuperTrend. Momentum \u2014 RSI, CCI, MFI. Volume \u2014 VWAP, OBV, TTM Squeeze. ",
          "Volatility \u2014 Bollinger, ATR, Donchian. Structure \u2014 Ichimoku, Pivots, Choppiness."
        ),
        React.createElement("div", null,
          React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "Scoring: "),
          "The Entry/Exit Score (0\u2013100) aggregates all indicators into four pillars. " + (holding ? "Your holding: entry $" + INR(holding.buyPrice, 2) + " on " + new Date(holding.buyDate).toLocaleDateString() + "." : "")
        )
      )
    ),

    // Exit Score Trend (active holdings only)
    ticker && holding && React.createElement(ExitScoreTrend, {
      ticker: ticker,
      buyPrice: holding.buyPrice,
      buyDate: holding.buyDate,
      entryScore: holding.entryScore,
    }),

    // Session Confidence — will this holding reach +4% today? (active holdings only)
    ticker && holding && React.createElement(SessionConfidencePanel, {
      ticker: ticker,
      buyPrice: holding.buyPrice,
      buyDate: holding.buyDate,
      entryScore: holding.entryScore,
    }),

    // Forward Confidence — will this stock reach +4% from current price within the next 5 trading days?
    ticker && React.createElement(ForwardConfidencePanel, {
      ticker: ticker,
    }),

    // Premature Exit Analysis — should you hold for more gains after hitting +4%?
    ticker && React.createElement(PrematureExitPanel, {
      ticker: ticker,
      buyPrice: holding ? holding.buyPrice : null,
    }),

    // Full technical indicators panel
    React.createElement(window.TechnicalIndicatorsPanel, { shares: holdings || [], isMobile: isMobile })
  );
}

function scoreMathBlock(r) {
  if (!r || r.finalScore == null) return null;
  var f1 = function (v) { return v != null ? Number(v).toFixed(1) : "\u2014"; };
  var f2 = function (v) { return v != null ? Number(v).toFixed(2) : "\u2014"; };
  var order = [
    { key: "weekly", label: "Weekly", nominal: 0.15 },
    { key: "daily", label: "Daily", nominal: 0.55 },
    { key: "hourly", label: "Hourly", nominal: 0.30 }
  ];
  var present = order.filter(function (t) { var s = r[t.key]; return s && s.total != null; });
  var wSum = present.reduce(function (a, t) { return a + t.nominal; }, 0);
  var pct = function (v) {
    var x = v * 100;
    return (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1)) + "%";
  };
  return React.createElement("div", { style: { marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)", fontSize: 10, color: "var(--text5)", lineHeight: 1.7, fontFamily: "var(--font-mono)" } },
    React.createElement("div", { style: { fontWeight: 700, color: "var(--text6)", fontFamily: "var(--font-heading)", marginBottom: 3 } }, "How the score is calculated"),
    present.length > 0 && wSum > 0 && present.map(function (t) {
      var s = r[t.key];
      var eff = t.nominal / wSum;
      return React.createElement("div", { key: t.key, style: { display: "flex", alignItems: "center", gap: 6 } },
        React.createElement("span", { style: { color: s.decision ? s.decision.color : "var(--text3)", fontWeight: 700, width: 52 } }, t.label),
        React.createElement("span", { style: { color: "var(--text3)", fontWeight: 700 } }, f1(s.total)),
        React.createElement("span", { style: { color: "var(--text6)" } }, " \u00d7 " + pct(eff) + " = "),
        React.createElement("span", { style: { color: "var(--text3)", fontWeight: 700 } }, f2(s.total * eff))
      );
    }),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 2, paddingTop: 4, borderTop: "1px solid var(--border)", fontWeight: 800 } },
      React.createElement("span", { style: { color: "var(--text6)" } }, "= Raw"),
      React.createElement("span", { style: { color: "var(--text3)" } }, r.baseScore != null ? f1(r.baseScore) : "\u2014")
    ),
    React.createElement("div", { style: { marginTop: 2 } },
      React.createElement("span", { style: { color: "var(--text6)" } }, "Raw "),
      React.createElement("span", { style: { fontWeight: 800, color: "var(--text3)" } }, r.baseScore != null ? f1(r.baseScore) : "\u2014"),
      (r.penalties || 0) < 0
        ? React.createElement("span", { style: { color: "#f0473f", fontWeight: 700 } }, " \u2212 " + f1(-(r.penalties || 0)) + " penalties")
        : React.createElement("span", { style: { color: "var(--text6)" } }, " + " + f1(r.penalties || 0) + " penalties"),
      (r.bonuses || 0) > 0
        ? React.createElement("span", { style: { color: "#20c46a", fontWeight: 700 } }, " + " + f1(r.bonuses || 0) + " bonuses")
        : React.createElement("span", { style: { color: "var(--text6)" } }, " + 0 bonuses"),
      React.createElement("span", { style: { color: "var(--text6)" } }, " = Final "),
      React.createElement("span", { style: { fontWeight: 900, color: r.decision ? r.decision.color : "var(--text6)" } }, r.finalScore)
    )
  );
}

function EntryScoreAnalysis({ entry, onBack }) {
  const [activeTF, setActiveTF] = useState("daily");
  const [catFilter, setCatFilter] = useState("all");
  const [showGuide, setShowGuide] = useState(false);
  const [freshIndicators, setFreshIndicators] = useState(null);
  const r = entry.result || {};
  const ind = entry.indicators || {};
  const price = entry.currentPrice || r.lastClose || 0;

  const INDS = window.STOX_INDICATORS || [];
  const CATS = window.STOX_CATEGORIES || [];
  const _fmt = function (v, d) { return v != null ? Number(v).toFixed(d != null ? d : 2) : "\u2014"; };
  const _TI = window.TechIndicators;

  useEffect(() => {
    if (!entry.ticker || !_TI || !window.OHLCVFetcher) return;
    let cancelled = false;
    (async () => {
      try {
        const DF = window.OHLCVFetcher;
        const tk = entry.ticker.toUpperCase();
        const [resW, resD, resH] = await Promise.all([
          DF.fetchOHLCVCached(tk, "weekly"),
          DF.fetchOHLCVCached(tk, "daily"),
          DF.fetchOHLCVCached(tk, "1h"),
        ]);
        if (cancelled) return;
        const indW = resW.data && resW.data.length >= 12 ? _TI.computeAll(resW.data) : null;
        const indD = resD.data && resD.data.length >= 12 ? _TI.computeAll(resD.data) : null;
        const indH = resH.data && resH.data.length >= 12 ? _TI.computeAll(resH.data) : null;
        setFreshIndicators({ weekly: indW, daily: indD, hourly: indH });
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [entry.ticker, _TI]);

  const computedInd = freshIndicators || ind;

  const _fmtVal = (def, val) => {
    if (val == null) return "\u2014";
    if (typeof val === "number") {
      if (def.type === "volume") {
        if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + "B";
        if (Math.abs(val) >= 1e7) return (val / 1e7).toFixed(2) + "Cr";
        if (Math.abs(val) >= 1e5) return (val / 1e5).toFixed(2) + "L";
        if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1) + "K";
      }
      return _fmt(val, 2);
    }
    if (typeof val === "object") {
      switch (def.type) {
        case "macd": return _fmt(val.macd, 4);
        case "bands": return _fmt(val.upper, 2);
        case "stoch": return _fmt(val.k, 2);
        case "ichimoku": return _fmt(val.tenkan ?? val.tenkan_sen, 2);
        case "chandelier": return _fmt(val.long, 2);
        case "heikinAshi": return (val.trend || "\u2014").toUpperCase();
        case "aroon": return "Up: " + _fmt(val.up) + " / Dn: " + _fmt(val.down);
        case "vortex": return "+: " + _fmt(val.plus) + " / -: " + _fmt(val.minus);
        case "volumeProfile": return val.poc ? "POC: " + _fmt(val.poc) : "\u2014";
        case "rs": return val.rs ? "RS: " + _fmt(val.rs, 4) : "\u2014";
        case "squeeze": return val.active ? "Squeeze ON" : "Squeeze OFF";
        case "darvas": return val.boxTop ? _fmt(val.boxTop) + " / " + _fmt(val.boxBottom) : "\u2014";
        case "smartMoney": return val.bos ? val.bos.replace("_", " ").toUpperCase() : "\u2014";
        case "fibonacci": return val.swingHigh ? _fmt(val.swingHigh) + " \u2014 " + _fmt(val.swingLow) : "\u2014";
        case "pivotPoints": return val.classic ? "P: " + _fmt(val.classic.P) : "\u2014";
        case "fractals": return (val.up ? val.up.length : 0) + "\u2191 / " + (val.down ? val.down.length : 0) + "\u2193";
        case "zigZag": return val ? val.length + " pivots" : "\u2014";
        default: return "\u2014";
      }
    }
    return String(val);
  };

  const TF_DEFS = [
    { key: "weekly", label: "Weekly", weight: "15%" },
    { key: "daily", label: "Daily", weight: "55%" },
    { key: "hourly", label: "Hourly", weight: "30%" },
  ];

  const activeScore = r[activeTF] || null;
  const activeInd = computedInd[activeTF] || null;
  const stabVal = activeScore && activeScore.stability != null ? activeScore.stability
    : (activeInd && activeInd.stabilityScore != null ? Math.round(Math.max(0, Math.min(10, (1 - activeInd.stabilityScore) * 10)) * 10) / 10 : null);
  const spikeVal = activeScore && activeScore.spike != null ? activeScore.spike
    : (activeInd && activeInd.spike != null ? (activeInd.spike === true ? 5 : 0) : null);

  const factorBar = (label, val, max, color) => {
    if (val == null || max == null) return null;
    const pct = max > 0 ? (Math.abs(val) / max * 100) : 0;
    const barColor = val < 0 ? "#f0473f" : color;
    return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
      React.createElement("span", { style: { width: 90, fontSize: 11, fontWeight: 600, color: "var(--text4)", textAlign: "right", flexShrink: 0 } }, label),
      React.createElement("div", { style: { flex: 1, height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
        React.createElement("div", { style: { width: pct + "%", height: "100%", borderRadius: 3, background: barColor, transition: "width .3s" } })
      ),
      React.createElement("span", { style: { width: 44, fontSize: 10, fontWeight: 700, color: val < 0 ? "#f0473f" : "var(--text4)", fontFamily: "var(--font-mono)", textAlign: "right" } }, (val >= 0 ? "+" : "") + val + "/" + max)
    );
  };

  const renderIndicators = (indData) => {
    if (!indData) return React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", padding: "6px 0" } }, "No indicator data available for this timeframe");
    const signals = _TI && _TI.interpret ? _TI.interpret(indData) : {};
    const filtered = catFilter === "all" ? INDS : INDS.filter(function (i) { return i.cat === catFilter; });
    const catKeys = ["all"].concat(CATS);

    return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", gap: 3, marginBottom: 10, flexWrap: "wrap", alignItems: "center" } },
        catKeys.map(function (cat) {
          var label = cat === "all" ? "All" : cat;
          var count = cat === "all" ? INDS.length : INDS.filter(function (i) { return i.cat === cat; }).length;
          var active = catFilter === cat;
          return React.createElement("button", {
            key: cat,
            onClick: function () { setCatFilter(cat); },
            style: {
              padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: active ? 700 : 500,
              border: "none", cursor: "pointer",
              background: active ? "var(--accent)" : "var(--bg4)",
              color: active ? "#fff" : "var(--text5)",
              transition: "all .15s",
            }
          }, label + " (" + count + ")");
        }),
        React.createElement("button", {
          onClick: function () { setShowGuide(!showGuide); },
          title: "Indicator guide",
          style: {
            padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
            border: "1px solid " + (showGuide ? "var(--accent)" : "var(--border)"),
            background: showGuide ? "var(--accentbg)" : "var(--bg4)",
            color: showGuide ? "var(--accent)" : "var(--text5)", cursor: "pointer",
          }
        }, "?")
      ),
      React.createElement("div", {
        style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 }
      },
        filtered.map(function (def) {
          var val = indData[def.key];
          if (val === null || val === undefined) return null;
          var sig = signals[def.key] || null;
          var sigStyle = sig ? SIGNAL_COLORS[sig] || SIGNAL_COLORS.neutral : null;

          var cardBg = "var(--bg4)";
          var cardBorderLeft = "none";
          if (sig === "bullish") { cardBg = "rgba(22,163,74,.06)"; cardBorderLeft = "3px solid #20c46a"; }
          else if (sig === "bearish") { cardBg = "rgba(239,68,68,.06)"; cardBorderLeft = "3px solid #f0473f"; }
          else if (sig === "overbought") { cardBg = "rgba(234,88,12,.05)"; cardBorderLeft = "3px solid #ea580c"; }
          else if (sig === "oversold") { cardBg = "rgba(37,99,235,.05)"; cardBorderLeft = "3px solid #2563eb"; }
          else if (sig === "trending") { cardBg = "rgba(168,85,247,.05)"; cardBorderLeft = "3px solid #a855f7"; }
          else if (sig === "ranging") { cardBg = "rgba(107,114,128,.04)"; cardBorderLeft = "3px solid #6b7280"; }

          return React.createElement("div", {
            key: def.key,
            style: {
              padding: "8px 10px", borderRadius: 8,
              background: cardBg, border: "1px solid var(--border)", borderLeft: cardBorderLeft,
              display: "flex", flexDirection: "column", gap: 2,
              transition: "background .3s, border-color .3s",
            }
          },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.3 } }, def.name),
              sigStyle && sig !== "neutral" && React.createElement("span", {
                style: {
                  fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 6,
                  background: sigStyle.bg, border: "1px solid " + sigStyle.border, color: sigStyle.text,
                  textTransform: "uppercase",
                }
              }, sigStyle.label)
            ),
            React.createElement("div", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text)" } }, _fmtVal(def, val)),
            def.type === "macd" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "MACD: " + _fmt(val.macd, 4)),
              React.createElement("span", null, "Sig: " + _fmt(val.signal, 4)),
              React.createElement("span", { style: { color: val.histogram >= 0 ? "#20c46a" : "#f0473f" } },
                "Hist: " + _fmt(val.histogram, 4))
            ),
            def.type === "bands" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "U: " + _fmt(val.upper)),
              React.createElement("span", null, "M: " + _fmt(val.middle)),
              React.createElement("span", null, "L: " + _fmt(val.lower))
            ),
            def.type === "stoch" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "%K: " + _fmt(val.k)),
              React.createElement("span", null, "%D: " + _fmt(val.d))
            ),
            def.type === "ichimoku" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 6, flexWrap: "wrap" }
            },
              React.createElement("span", null, "T: " + _fmt(val.tenkan ?? val.tenkan_sen)),
              React.createElement("span", null, "K: " + _fmt(val.kijun ?? val.kijun_sen)),
              React.createElement("span", null, "SA: " + _fmt(val.senkouA ?? val.senkou_span_a)),
              React.createElement("span", null, "SB: " + _fmt(val.senkouB ?? val.senkou_span_b))
            ),
            def.type === "chandelier" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "L: " + _fmt(val.long)),
              React.createElement("span", null, "S: " + _fmt(val.short))
            ),
            def.type === "heikinAshi" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 6 }
            },
              React.createElement("span", null, "O: " + _fmt(val.open)),
              React.createElement("span", null, "H: " + _fmt(val.high)),
              React.createElement("span", null, "L: " + _fmt(val.low)),
              React.createElement("span", null, "C: " + _fmt(val.close))
            ),
            def.type === "aroon" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "Up: " + _fmt(val.up)),
              React.createElement("span", null, "Dn: " + _fmt(val.down)),
              React.createElement("span", { style: { color: val.osc > 0 ? "#20c46a" : "#f0473f" } }, "Osc: " + _fmt(val.osc))
            ),
            def.type === "vortex" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", { style: { color: "#20c46a" } }, "VI+: " + _fmt(val.plus)),
              React.createElement("span", { style: { color: "#f0473f" } }, "VI-: " + _fmt(val.minus))
            ),
            def.type === "volumeProfile" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "POC: " + _fmt(val.poc)),
              val.valueAreaHigh && React.createElement("span", null, "VAH: " + _fmt(val.valueAreaHigh)),
              val.valueAreaLow && React.createElement("span", null, "VAL: " + _fmt(val.valueAreaLow))
            ),
            def.type === "darvas" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8, flexWrap: "wrap" }
            },
              React.createElement("span", null, "Top: " + _fmt(val.boxTop)),
              React.createElement("span", null, "Bottom: " + _fmt(val.boxBottom)),
              val.breakout && React.createElement("span", {
                style: { color: val.breakout === "up" ? "#16a34a" : val.breakout === "down" ? "#ef4444" : "var(--text6)" }
              }, "Breakout: " + val.breakout.toUpperCase())
            ),
            def.type === "rs" && val && typeof val === "object" && React.createElement("div", {
              style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 }
            },
              React.createElement("span", null, "RS: " + _fmt(val.rs, 4)),
              val.mansfield != null && React.createElement("span", { style: { color: val.mansfield > 0 ? "#20c46a" : "#f0473f" } }, "Mans: " + _fmt(val.mansfield, 2) + "%")
            )
          );
        })
      )
    );
  };

  var _sc = function(key, bullish) {
    var map = {
      sma_20: ["Institutional buy orders step in on tests of the 20/50 SMA.", "Price rallies but rejected at MA from below."],
      ema_9: ["Short-term trend supported by institutional flow.", "EMA turns into resistance on pullback attempts."],
      macd: ["Surging institutional momentum; expanding histogram confirms.", "Fading institutional support; histogram shrinking."],
      adx_14: ["+DI > -DI confirms strong trend.", "-DI > +DI = bearish trend control."],
      supertrend: ["Institutional uptrend control.", "Institutional support has ended."],
      rsi_14: ["RSI 40-80; bounces off 40-50 signal institutional re-entries.", "Bearish divergence or break below 40 = institutional exit."],
      atr_14: ["", ""],
      bb: ["Walking upper band with volume = aggressive institutional expansion.", "Upper band touch + long wick = liquidity sweep, then breakdown."],
      ichimoku: ["Price above cloud = bullish; Tenkan/Kijun cross = signal.", "Price below cloud = bearish."],
      vwap: ["Dips to VWAP bought by institutional algorithms.", "Price below VWAP; institutions offload on rallies to VWAP."],
      darvasBox: ["Breakout above box = institutional accumulation.", "Breakdown below box = institutional distribution."]
    };
    var entry = map[key];
    if (!entry) return null;
    return React.createElement("div", { style: { color: "var(--text6)", lineHeight: 1.3, marginTop: 1 } }, bullish ? entry[0] : entry[1]);
  };

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
      React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } },
          onBack && React.createElement("button", {
            onClick: onBack,
            className: "stx-btn stx-btn-ghost",
            style: { fontSize: 11, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }
          }, "\u2190 Back to Entry Score"),
          React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "#f97316", letterSpacing: 1.4, textTransform: "uppercase" } }, "ENTRY SCORE ANALYSIS")
        ),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, entry.ticker)
      )
    ),
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 2 } }, "Current Price"),
          React.createElement("div", { style: { fontSize: 28, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--accent)" } }, price > 0 ? INR(price, 2) : "\u2014")
        ),
        React.createElement("div", { style: { textAlign: "right" } },
          React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600, marginBottom: 2 } }, "Final Score"),
          React.createElement("div", { style: { fontSize: 36, fontWeight: 900, color: r.decision ? r.decision.color : "var(--text6)", fontFamily: "var(--font-heading)", lineHeight: 1 } }, r.finalScore != null ? r.finalScore : "\u2014")
        )
      ),
      scoreMathBlock(r),
    ),
    r.decision && React.createElement("div", { className: "stx-card", style: { marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
        React.createElement("div", { style: { padding: "6px 14px", borderRadius: 8, background: r.decision.color + "18", border: "1px solid " + r.decision.color + "33" } },
          React.createElement("span", { style: { fontSize: 14, fontWeight: 800, color: r.decision.color, fontFamily: "var(--font-heading)" } }, r.decision.label)
        ),
        React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", fontStyle: "italic" } }, r.decision.position)
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", textAlign: "right" } },
          "Base: ", React.createElement("span", { style: { fontWeight: 700, color: "var(--text3)" } }, r.baseScore),
          " \u00b7 Pen: ", React.createElement("span", { style: { fontWeight: 700, color: r.penalties < 0 ? "#f0473f" : "var(--text3)" } }, r.penalties),
          " \u00b7 Bonus: ", React.createElement("span", { style: { fontWeight: 700, color: r.bonuses > 0 ? "#20c46a" : "var(--text3)" } }, r.bonuses)
        )
      )
    ),
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("div", { style: { display: "flex", gap: 2, background: "var(--bg4)", borderRadius: 8, padding: 3, marginBottom: 14 } },
        TF_DEFS.map(function (tf) {
          var score = r[tf.key];
          var isActive = activeTF === tf.key;
          return React.createElement("button", {
            key: tf.key,
            onClick: function () { setActiveTF(tf.key); setCatFilter("all"); },
            style: {
              flex: 1, padding: "8px 12px", borderRadius: 6, fontSize: 11, fontWeight: isActive ? 700 : 500,
              border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "#fff" : "var(--text5)",
              transition: "all .15s",
            }
          },
            React.createElement("span", null, tf.label + " (" + tf.weight + ")"),
            score && score.decision ? React.createElement("span", { style: { fontSize: 14, fontWeight: 900, fontFamily: "var(--font-heading)", color: isActive ? "#fff" : score.decision.color, lineHeight: 1 } }, score.total) : React.createElement("span", { style: { fontSize: 10 } }, "N/A"),
            score && score.decision && React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: isActive ? "rgba(255,255,255,.8)" : score.decision.color } }, score.decision.label)
          );
        })
      ),
      activeScore && React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 } },
          factorBar("Trend Health", activeScore.trendHealthScore, activeScore.trendHealthMax, "#4a8fe0"),
          factorBar("Pullback", activeScore.pullbackScore, activeScore.pullbackMax, "#a855f7"),
          factorBar("4% Prob", activeScore.prob4Score, activeScore.prob4Max, "#06b6d4"),
          activeScore.swingPotentialScore != null && activeScore.swingPotentialScore > 0 && factorBar("Swing Potential", activeScore.swingPotentialScore, activeScore.swingPotentialMax, "#f59e0b"),
          stabVal != null && factorBar("Stability", -stabVal, 10, "#22c55e"),
          spikeVal != null && factorBar("Spike", -spikeVal, 10, "#f97316")
        ),
        React.createElement("div", { style: { borderTop: "1px solid var(--border)", paddingTop: 10 } },
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text4)", marginBottom: 8 } }, "Technical Indicators"),
          renderIndicators(activeInd),
          showGuide && activeInd && React.createElement("div", {
            style: { marginTop: 10, borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden", fontSize: 10, lineHeight: 1.5, color: "var(--text5)" }
          },
            React.createElement("div", { style: { padding: "6px 10px", background: "var(--bg4)", fontWeight: 600, fontSize: 10, color: "var(--text)", borderBottom: "1px solid var(--border)" } },
              entry.ticker + " Indicators (" + activeTF + ")"
            ),
            React.createElement("div", { style: { padding: "8px 10px", background: "var(--bg3)", maxHeight: 300, overflowY: "auto" } },
              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
                React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  React.createElement("span", { style: { fontWeight: 600, color: "var(--text)" } }, "Price: "),
                  React.createElement("span", { style: { fontWeight: 700, color: "var(--accent)" } }, _fmt(price)), " \u00b7 ",
                  "Score: ", React.createElement("span", { style: { fontWeight: 700 } }, activeScore ? activeScore.total : "\u2014")
                ),
                activeInd.sma_20 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "SMA(20): ", React.createElement("span", { style: { fontWeight: 600, color: price > activeInd.sma_20 ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.sma_20)),
                  " \u2014 price ", price > activeInd.sma_20 ? "above = bullish" : "below = bearish",
                  _sc("sma_20", price > activeInd.sma_20)
                ),
                activeInd.ema_9 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "EMA(9): ", React.createElement("span", { style: { fontWeight: 600, color: price > activeInd.ema_9 ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ema_9)),
                  " \u2014 ", price > activeInd.ema_9 ? "price above (bullish)" : "price below (bearish)",
                  _sc("ema_9", price > activeInd.ema_9)
                ),
                activeInd.macd && activeInd.macd.macd != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "MACD: ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.macd.histogram >= 0 ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.macd.macd, 4)),
                  " Hist: ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.macd.histogram >= 0 ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.macd.histogram, 4)),
                  " \u2014 ", activeInd.macd.histogram >= 0 ? "bullish momentum" : "bearish momentum",
                  _sc("macd", activeInd.macd.histogram >= 0)
                ),
                activeInd.adx_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "ADX: ", React.createElement("span", { style: { fontWeight: 600, color: "#eab308" } }, _fmt(activeInd.adx_14)),
                  " \u2014 ", activeInd.adx_14 > 25 ? "trending" : activeInd.adx_14 > 20 ? "borderline" : "ranging"
                ),
                activeInd.plusDI != null && activeInd.minusDI != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "+DI: ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.plusDI > activeInd.minusDI ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.plusDI)), " / -DI: ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.plusDI > activeInd.minusDI ? "#ef4444" : "#16a34a" } }, _fmt(activeInd.minusDI)),
                  " \u2014 ", activeInd.plusDI > activeInd.minusDI ? "bullish" : "bearish"
                ),
                activeInd.supertrend != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "SuperTrend: ", React.createElement("span", { style: { fontWeight: 600, color: price > activeInd.supertrend ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.supertrend)),
                  " \u2014 ", price > activeInd.supertrend ? "uptrend" : "downtrend",
                  _sc("supertrend", price > activeInd.supertrend)
                ),
                activeInd.rsi_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "RSI(14): ", React.createElement("span", { style: { fontWeight: 600, color: activeInd.rsi_14 > 70 ? "#ef4444" : activeInd.rsi_14 < 30 ? "#2563eb" : "#2563eb" } }, _fmt(activeInd.rsi_14)),
                  " \u2014 ", activeInd.rsi_14 > 70 ? "overbought (reversal risk)" : activeInd.rsi_14 < 30 ? "oversold (bounce potential)" : "neutral range",
                  _sc("rsi_14", activeInd.rsi_14 > 50)
                ),
                activeInd.atr_14 != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "ATR(14): ", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, _fmt(activeInd.atr_14)),
                  " \u2014 ", activeInd.atr_14 > 0 && price > 0 ? "stop ~" + _fmt(activeInd.atr_14 * 1.5) + " (" + (activeInd.atr_14 / price * 100).toFixed(1) + "% of price)" : ""
                ),
                activeInd.bb && activeInd.bb.upper != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "Bollinger: U:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, _fmt(activeInd.bb.upper)), " M:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, _fmt(activeInd.bb.middle)), " L:", React.createElement("span", { style: { color: "#eab308", fontWeight: 600 } }, _fmt(activeInd.bb.lower)),
                  price >= activeInd.bb.upper * 0.99 ? " \u2014 at upper band" : price <= activeInd.bb.lower * 1.01 ? " \u2014 at lower band" : " \u2014 inside bands",
                  _sc("bb", price > activeInd.bb.middle)
                ),
                activeInd.ichimoku && (activeInd.ichimoku.tenkan ?? activeInd.ichimoku.tenkan_sen) != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "Ichimoku: T:", React.createElement("span", { style: { fontWeight: 600, color: price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ichimoku.tenkan ?? activeInd.ichimoku.tenkan_sen)), " K:", React.createElement("span", { style: { fontWeight: 600, color: price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ichimoku.kijun ?? activeInd.ichimoku.kijun_sen)),
                  " SA:", React.createElement("span", { style: { fontWeight: 600, color: price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a)), " SB:", React.createElement("span", { style: { fontWeight: 600, color: price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b)),
                  " \u2014 price ", price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0) ? "above cloud" : "below cloud",
                  _sc("ichimoku", price > Math.max((activeInd.ichimoku.senkouA ?? activeInd.ichimoku.senkou_span_a) || 0, (activeInd.ichimoku.senkouB ?? activeInd.ichimoku.senkou_span_b) || 0))
                ),
                activeInd.vwap != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "VWAP: ", React.createElement("span", { style: { fontWeight: 600, color: price > activeInd.vwap ? "#16a34a" : "#ef4444" } }, _fmt(activeInd.vwap)),
                  " \u2014 price ", price > activeInd.vwap ? "above (bullish)" : "below (bearish)",
                  _sc("vwap", price > activeInd.vwap)
                ),
                activeInd.darvasBox && activeInd.darvasBox.boxTop != null && React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)" } },
                  "Darvas Box: ", React.createElement("span", { style: { fontWeight: 600, color: price >= activeInd.darvasBox.boxTop ? "#16a34a" : price <= activeInd.darvasBox.boxBottom ? "#ef4444" : "#eab308" } }, _fmt(activeInd.darvasBox.boxTop)), " / ", React.createElement("span", { style: { fontWeight: 600, color: price >= activeInd.darvasBox.boxTop ? "#16a34a" : price <= activeInd.darvasBox.boxBottom ? "#ef4444" : "#eab308" } }, _fmt(activeInd.darvasBox.boxBottom)),
                  " \u2014 ", price >= activeInd.darvasBox.boxTop ? "breakout above (bullish)" : price <= activeInd.darvasBox.boxBottom ? "breakdown below (bearish)" : "inside box",
                  _sc("darvasBox", price >= activeInd.darvasBox.boxTop)
                ),
                React.createElement("div", { style: { padding: "4px 6px", borderRadius: 4, background: "var(--bg4)", fontSize: 9, color: "var(--text6)" } },
                  "Signals are rule-based (price vs indicator). Scores aggregate across the Trend Health, Pullback Quality, 4% Probability, and Swing Potential pillars. Switch timeframes above for multi-TF context."
                )
              )
            )
          )
        )
      ),
      !activeScore && React.createElement("div", { style: { textAlign: "center", padding: 16, color: "var(--text6)", fontSize: 11 } }, "No score data for " + activeTF)
    ),
    (r.todaySpike != null || r.sessionReturnPct != null || r.gapPct != null || r.dominanceRatio != null || r.efficiencyRatio10 != null) && React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 8 } }, "Spike / Stability Guard"),
      (r.todaySpike || r.sessionReturnPct != null || r.gapPct != null || r.dominanceRatio != null || r.efficiencyRatio10 != null) ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text5)" } },
          React.createElement("span", null, "Today spike (session \u00b7 gap)"),
           React.createElement("span", { style: { fontWeight: 700, color: r.todaySpike ? "#f97316" : "#22c55e" } }, r.todaySpike ? React.createElement(React.Fragment, null, Ico.x(11, "#f97316"), " Capped at Neutral") : React.createElement(React.Fragment, null, Ico.check(11, "#22c55e"), " Clear"))
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text5)" } },
          React.createElement("span", null, "Session return / Gap %"),
          React.createElement("span", { style: { fontWeight: 600, color: "var(--text3)", fontFamily: "var(--font-mono)" } }, _fmt(r.sessionReturnPct) + "% / " + _fmt(r.gapPct) + "%")
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text5)" } },
          React.createElement("span", null, "Dominance ratio (5d)"),
          React.createElement("span", { style: { fontWeight: 700, color: r.dominanceRatio != null && r.dominanceRatio > 0.6 ? "#f0473f" : "var(--text3)", fontFamily: "var(--font-mono)" } }, _fmt(r.dominanceRatio))
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text5)" } },
          React.createElement("span", null, "Efficiency ratio (10d)"),
          React.createElement("span", { style: { fontWeight: 700, color: r.efficiencyRatio10 != null && r.efficiencyRatio10 > 0.6 ? "#20c46a" : "var(--text3)", fontFamily: "var(--font-mono)" } }, _fmt(r.efficiencyRatio10))
        )
      ) : React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", lineHeight: 1.5 } },
        "Disabled \u2014 no daily timeframe. The spike gate, dominance, and efficiency checks run on daily candles only; without daily data they are turned off (per-TF spike/stability modifiers still apply on the available timeframes)."
      )
    ),
    r.hardFilters && r.hardFilters.length > 0 && React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text3)", marginBottom: 8 } }, "Penalties & Bonuses"),
      r.hardFilters.map((f, i) => {
        var isBonus = f.indexOf("(+") >= 0;
        var valMatch = f.match(/\([+\-\u2212]?\d+\)$/);
        var valStr = valMatch ? valMatch[0] : "";
        var label = valStr ? f.replace(valStr, "").replace(/\s*\u2014\s*/, " \u2014 ").trim() : f;
        return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" } },
          React.createElement("span", { style: { color: "var(--text3)", fontSize: 12, flex: 1 } }, isBonus ? React.createElement(React.Fragment, null, Ico.check(12, "#22c55e"), " ", label) : React.createElement(React.Fragment, null, Ico.alertTriangle(12, "#f59e0b"), " ", label)),
          valStr && React.createElement("span", { style: { fontSize: 11, fontWeight: 800, color: isBonus ? "#20c46a" : "#f0473f", background: isBonus ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", padding: "2px 8px", borderRadius: 4, fontFamily: "var(--font-mono)" } }, valStr)
        );
      })
    ),
    React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", textAlign: "center", padding: "8px 0" } },
      "Added " + new Date(entry.addedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HOLDING VALUE HISTORY CHART
   ══════════════════════════════════════════════════════════════════════════ */
const HoldingValueChart = ({ pts, qty, buyPrice, color, gradId }) => {
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const svgRef = React.useRef(null);
  if (!pts || pts.length < 2) return null;
  color = color || "#10b981";
  gradId = gradId || "hvh0";
  const INRshort = v => {
    if (v >= 10000000) return "\u20b9" + (v / 10000000).toFixed(2) + "Cr";
    if (v >= 100000) return "\u20b9" + (v / 100000).toFixed(2) + "L";
    if (v >= 1000) return "\u20b9" + (v / 1000).toFixed(1) + "K";
    return "\u20b9" + Math.round(v);
  };
  const fmtLbl = dateStr => {
    const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m = parseInt(dateStr.slice(5, 7));
    const d = dateStr.slice(8);
    return d + "-" + mn[m - 1];
  };
  const W = 1200, padL = 136, padR = 64, padT = 36, padB = 64;
  const h = 480;
  const chartW = W - padL - padR, chartH = h - padT - padB;
  const costBasis = qty * buyPrice;
  const vals = pts.map(d => d.value);
  const allVals = [...vals, costBasis];
  const rawMn = Math.min(...allVals), rawMx = Math.max(...allVals, 1);
  const pad4 = (rawMx - rawMn) * 0.04;
  const mn = rawMn - pad4, mx = rawMx + pad4;
  const range = mx - mn || 1;
  const xStep = chartW / (pts.length - 1);
  const yFn = v => padT + chartH * (1 - (v - mn) / range);
  const ptStr = pts.map((d, i) => `${padL + i * xStep},${yFn(d.value)}`).join(" ");
  const polyFill = `${padL},${padT + chartH} ${ptStr} ${padL + (pts.length - 1) * xStep},${padT + chartH}`;
  const yCostBasis = yFn(costBasis);
  const yTicks = [rawMn, rawMn + (rawMx - rawMn) * 0.5, rawMx];
  const greenGradId = gradId + "_g";
  const redGradId = gradId + "_r";
  const clipAboveId = gradId + "_ca";
  const clipBelowId = gradId + "_cb";
  const clipAboveRect = `0 0 ${W} ${yCostBasis}`;
  const clipBelowRect = `0 ${yCostBasis} ${W} ${h - yCostBasis}`;
  const handleMouseMove = e => {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width) - padL;
    const idx = Math.round(svgX / xStep);
    setHoverIdx(Math.max(0, Math.min(pts.length - 1, idx)));
  };
  const hp = hoverIdx !== null ? pts[hoverIdx] : null;
  const hx = hoverIdx !== null ? padL + hoverIdx * xStep : null;
  const hy = hoverIdx !== null ? yFn(pts[hoverIdx].value) : null;
  const tipW = 392, tipH = 160;
  const tipX = hx !== null ? (hx + tipW + padR + 12 > W ? hx - tipW - 20 : hx + 20) : 0;
  const tipY = hy !== null ? Math.max(padT, Math.min(padT + chartH - tipH, hy - tipH / 2)) : 0;
  const labelGap = Math.max(82, Math.ceil(19 * 0.58 * 7 + 24));
  const stride = Math.max(1, Math.ceil(labelGap / xStep));
  const lastStrideIdx = Math.floor((pts.length - 1) / stride) * stride;
  const showLastLabel = (pts.length - 1) % stride !== 0 && ((pts.length - 1) - lastStrideIdx) * xStep >= labelGap;

  return React.createElement("svg", {
    ref: svgRef, width: "100%", viewBox: `0 0 ${W} ${h}`,
    style: { display: "block", cursor: "crosshair", overflow: "visible" },
    onMouseMove: handleMouseMove, onMouseLeave: () => setHoverIdx(null)
  },
    React.createElement("defs", null,
      React.createElement("linearGradient", { id: greenGradId, x1: "0", y1: "0", x2: "0", y2: "1" },
        React.createElement("stop", { offset: "0%", stopColor: "#10b981", stopOpacity: .28 }),
        React.createElement("stop", { offset: "100%", stopColor: "#10b981", stopOpacity: .02 })
      ),
      React.createElement("linearGradient", { id: redGradId, x1: "0", y1: "0", x2: "0", y2: "1" },
        React.createElement("stop", { offset: "0%", stopColor: "#ef4444", stopOpacity: .28 }),
        React.createElement("stop", { offset: "100%", stopColor: "#ef4444", stopOpacity: .02 })
      ),
      React.createElement("clipPath", { id: clipAboveId },
        React.createElement("rect", { x: 0, y: 0, width: W, height: yCostBasis })
      ),
      React.createElement("clipPath", { id: clipBelowId },
        React.createElement("rect", { x: 0, y: yCostBasis, width: W, height: h - yCostBasis })
      )
    ),
    yTicks.map((v, i) => {
      const gy = yFn(v);
      return React.createElement("g", { key: "yt" + i },
        React.createElement("line", { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: "var(--border2)", strokeWidth: 1.4, strokeDasharray: "6,8" }),
        React.createElement("text", { x: padL - 10, y: gy + 7, textAnchor: "end", fill: "var(--text5)", fontSize: 19, fontWeight: 500 }, INRshort(v))
      );
    }),
    React.createElement("line", { x1: padL, y1: yCostBasis, x2: W - padR, y2: yCostBasis, stroke: "#f59e0b", strokeWidth: 2.8, strokeDasharray: "12,8", opacity: .8 }),
    React.createElement("text", { x: W - padR + 6, y: yCostBasis + 7, fill: "#f59e0b", fontSize: 15, fontWeight: 700, textAnchor: "start" }, "Cost"),
    React.createElement("polygon", { points: polyFill, fill: "url(#" + greenGradId + ")", clipPath: "url(#" + clipAboveId + ")" }),
    React.createElement("polygon", { points: polyFill, fill: "url(#" + redGradId + ")", clipPath: "url(#" + clipBelowId + ")" }),
    React.createElement("polyline", { points: ptStr, fill: "none", stroke: pts[pts.length - 1].value >= costBasis ? "#10b981" : "#ef4444", strokeWidth: 4.4, strokeLinejoin: "round", strokeLinecap: "round" }),
    React.createElement("line", { x1: padL, y1: padT + chartH, x2: W - padR, y2: padT + chartH, stroke: "var(--border)", strokeWidth: 2 }),
    (() => {
      const dotR = pts.length <= 20 ? 4.8 : pts.length <= 40 ? 3.2 : pts.length <= 70 ? 2.2 : 0;
      if (dotR === 0) return null;
      return pts.map((d, i) => i === hoverIdx ? null : React.createElement("circle", { key: "d" + i, cx: padL + i * xStep, cy: yFn(d.value), r: dotR, fill: d.value >= costBasis ? "#10b981" : "#ef4444", opacity: .6 }));
    })(),
    pts.map((d, i) => {
      const isStrideHit = i % stride === 0;
      const isLast = i === pts.length - 1;
      if (!isStrideHit && !(isLast && showLastLabel)) return null;
      return React.createElement("text", { key: "xl" + i, x: padL + i * xStep, y: h - 8, textAnchor: "middle", fill: "var(--text6)", fontSize: 19 }, fmtLbl(d.date));
    }),
    hoverIdx !== null && React.createElement("g", null,
      React.createElement("line", { x1: hx, y1: padT, x2: hx, y2: padT + chartH, stroke: color, strokeWidth: 2.4, strokeDasharray: "8,6", opacity: .5 }),
      React.createElement("circle", { cx: hx, cy: hy, r: 18, fill: color, opacity: .13 }),
      React.createElement("circle", { cx: hx, cy: hy, r: 12, fill: "white", stroke: color, strokeWidth: 5 }),
      React.createElement("circle", { cx: hx, cy: hy, r: 6, fill: color }),
      React.createElement("rect", { x: tipX + 4, y: tipY + 6, width: tipW, height: tipH, rx: 16, fill: "rgba(0,0,0,.18)", style: { filter: "blur(6px)" } }),
      React.createElement("rect", { x: tipX, y: tipY, width: tipW, height: tipH, rx: 16, fill: "var(--modal-bg)", stroke: color, strokeWidth: 3 }),
      React.createElement("rect", { x: tipX, y: tipY, width: tipW, height: 8, rx: 16, fill: color }),
      React.createElement("rect", { x: tipX, y: tipY + 4, width: tipW, height: 8, fill: color }),
      React.createElement("text", { x: tipX + 24, y: tipY + 40, fill: "var(--text4)", fontSize: 19, fontWeight: 600, letterSpacing: .3 }, hp.date),
      React.createElement("text", { x: tipX + 24, y: tipY + 84, fill: color, fontSize: 30, fontWeight: 800, fontFamily: "'Sora',sans-serif" }, INR(hp.value)),
      (() => {
        const diff = hp.value - costBasis;
        const diffPct = costBasis > 0 ? ((diff / costBasis) * 100).toFixed(2) : "0.00";
        const col = diff >= 0 ? "#10b981" : "#ef4444";
         const sign = diff >= 0 ? "+" : "";
        return React.createElement("text", { x: tipX + 24, y: tipY + 122, fill: col, fontSize: 18, fontWeight: 600 }, sign + INR(Math.abs(diff)) + " (" + Math.abs(diffPct) + "%)");
      })()
    )
  );
};

const ExitScoreTrend = ({ ticker, buyPrice, buyDate, entryScore }) => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [trendData, setTrendData] = React.useState([]);
  const [expanded, setExpanded] = React.useState(true);
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const svgRef = React.useRef(null);

  React.useEffect(() => {
    if (!ticker || !DF || !TI) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [resW, resD, resH] = await Promise.all([
          DF.fetchOHLCVCached(ticker, "weekly"),
          DF.fetchOHLCVCached(ticker, "daily"),
          DF.fetchOHLCVCached(ticker, "1h"),
        ]);
        if (cancelled) return;
        const computeSeries = (candles) => {
          if (!candles || candles.length < 12) return [];
          const minCandles = 40;
          let startIdx = 0;
          if (buyDate) {
            const bd = buyDate + "T00:00:00";
            for (let j = 0; j < candles.length; j++) {
              const ct = candles[j].t ? candles[j].t.split(" ")[0] : "";
              if (ct >= buyDate) { startIdx = j; break; }
            }
          }
          startIdx = Math.max(startIdx, minCandles - 1);
          const total = candles.length;
          if (total - startIdx < 2) return [];
          const sampleCount = Math.min(20, total - startIdx);
          const step = Math.max(1, Math.floor((total - startIdx - 1) / (sampleCount - 1)));
          const pts = [];
          for (let s = 0; s < sampleCount; s++) {
            const endIdx = Math.min(startIdx + s * step, total - 1);
            const slice = candles.slice(0, endIdx + 1);
            if (slice.length < 12) continue;
            const lastCandle = slice[slice.length - 1];
            const histClose = lastCandle.c;
            const dateStr = lastCandle.t ? lastCandle.t.split(" ")[0] : "";
            if (!dateStr) continue;
            try {
              const ind = TI.computeAll(slice);
              const es = TI.computeExitScore(slice, { entry_price: buyPrice || 0, entry_score: entryScore || 0 });
              if (es && es.exit_score != null) pts.push({ date: dateStr, score: es.exit_score, decision: es.classification, open: lastCandle.o, close: lastCandle.c, prevClose: slice.length >= 2 ? slice[slice.length - 2].c : null });
            } catch {}
          }
          return pts;
        };
        const weeklyPts = computeSeries(resW.data);
        const dailyPts = computeSeries(resD.data);
        const hourlyPts = computeSeries(resH.data);
        const dateSet = new Set();
        weeklyPts.forEach(p => dateSet.add(p.date));
        dailyPts.forEach(p => dateSet.add(p.date));
        hourlyPts.forEach(p => dateSet.add(p.date));
        const allDates = Array.from(dateSet).sort();
        const wMap = {}; weeklyPts.forEach(p => { wMap[p.date] = p; });
        const dMap = {}; dailyPts.forEach(p => { dMap[p.date] = p; });
        const hMap = {}; hourlyPts.forEach(p => { hMap[p.date] = p; });
        const merged = allDates.map(date => ({ date, weekly: wMap[date] || null, daily: dMap[date] || null, hourly: hMap[date] || null }));
        if (!cancelled) setTrendData(merged);
      } catch (e) {
        if (!cancelled) setError("Failed to compute exit score trend");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ticker, buyPrice, buyDate, entryScore]);

  if (loading) {
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Exit Score Trend"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "Computing...")
      )
    );
  }
  if (error || !trendData.length) {
    return null;
  }
  const hasW = trendData.some(p => p.weekly);
  const hasD = trendData.some(p => p.daily);
  const hasH = trendData.some(p => p.hourly);
  const series = [
    { key: "weekly", color: "#ec4899", label: "W", show: hasW },
    { key: "daily", color: "#a855f7", label: "D", show: hasD },
    { key: "hourly", color: "#3b82f6", label: "H", show: hasH },
  ].filter(s => s.show);
  if (!series.length) return null;
  const W = 800, padL = 68, padR = 14, padT = 16, padB = 28;
  const H = 140;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const xStep = trendData.length > 1 ? chartW / (trendData.length - 1) : chartW;
  const yFn = v => padT + chartH * (1 - v / 100);
  const thresholds = [
    { val: 25, color: "#84cc16", label: "MONITOR" },
    { val: 40, color: "#eab308", label: "TIGHTEN STOP" },
    { val: 55, color: "#f97316", label: "PARTIAL EXIT" },
    { val: 70, color: "#ef4444", label: "EXIT" },
  ];
  const buildPolyline = (key) => {
    const pts = trendData.map((d, i) => {
      const v = d[key] ? d[key].score : null;
      return v !== null ? `${padL + i * xStep},${yFn(v)}` : null;
    }).filter(Boolean);
    return pts.length >= 2 ? pts.join(" ") : null;
  };
  const handleMouseMove = e => {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width) - padL;
    const idx = Math.round(svgX / xStep);
    setHoverIdx(Math.max(0, Math.min(trendData.length - 1, idx)));
  };
  const hp = hoverIdx !== null ? trendData[hoverIdx] : null;
  const hx = hoverIdx !== null ? padL + hoverIdx * xStep : null;
  const fmtDate = d => {
    if (!d) return "";
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const parts = d.split("-");
    return parseInt(parts[2]) + " " + m[parseInt(parts[1]) - 1];
  };
  const scoreColor = s => {
    if (s == null) return "var(--text6)";
    if (s >= 70) return "#ef4444";
    if (s >= 55) return "#f97316";
    if (s >= 40) return "#eab308";
    if (s >= 25) return "#84cc16";
    return "#22c55e";
  };
  const stride = Math.max(1, Math.ceil(trendData.length / 6));
  const latest = trendData[trendData.length - 1];
  return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px" } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Exit Score Trend"),
        React.createElement("div", { style: { display: "flex", gap: 6, fontSize: 9 } },
          series.map(s => React.createElement("span", { key: s.key, style: { display: "flex", alignItems: "center", gap: 3, color: s.color, fontWeight: 600 } },
            React.createElement("span", { style: { width: 8, height: 2, borderRadius: 1, background: s.color, display: "inline-block" } }), s.label
          ))
        )
      ),
      React.createElement("button", {
        onClick: () => setExpanded(!expanded),
        style: { background: "none", border: "none", color: "var(--text5)", cursor: "pointer", fontSize: 12, padding: "2px 4px" }
      }, React.createElement("span", { style: { display: "inline-flex", transition: "transform .2s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" } }, Ico.chevronDown(12)))
    ),
    expanded && React.createElement(React.Fragment, null,
      React.createElement("svg", {
        ref: svgRef, width: "100%", viewBox: `0 0 ${W} ${H}`,
        style: { display: "block", cursor: "crosshair", overflow: "visible" },
        onMouseMove: handleMouseMove, onMouseLeave: () => setHoverIdx(null)
      },
        thresholds.map((th, i) => React.createElement("g", { key: "yt" + i },
          React.createElement("line", { x1: padL, y1: yFn(th.val), x2: W - padR, y2: yFn(th.val), stroke: th.color, strokeWidth: 0.7, strokeDasharray: "3,5", opacity: 0.3 }),
          React.createElement("text", { x: padL - 4, y: yFn(th.val) + 3, textAnchor: "end", fill: th.color, fontSize: 7, fontWeight: 600, opacity: 0.8 }, th.label)
        )),
        [0, 50, 100].map(v => React.createElement("text", { key: "ytv" + v, x: padL - 4, y: yFn(v) + 3, textAnchor: "end", fill: "var(--text6)", fontSize: 7 }, v)),
        series.map(s => {
          const line = buildPolyline(s.key);
          return line ? React.createElement("polyline", { key: s.key, points: line, fill: "none", stroke: s.color, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round", opacity: 0.85 }) : null;
        }),
        trendData.map((d, i) => {
          if (i % stride !== 0 && i !== trendData.length - 1) return null;
          return React.createElement("text", { key: "xl" + i, x: padL + i * xStep, y: H - 4, textAnchor: "middle", fill: "var(--text6)", fontSize: 8 }, fmtDate(d.date));
        }),
        hp && React.createElement("g", null,
          React.createElement("line", { x1: hx, y1: padT, x2: hx, y2: padT + chartH, stroke: "var(--text5)", strokeWidth: 1, strokeDasharray: "3,3", opacity: 0.5 }),
          series.map(s => {
            const v = hp[s.key] ? hp[s.key].score : null;
            if (v == null) return null;
            return React.createElement("circle", { key: "dot_" + s.key, cx: hx, cy: yFn(v), r: 4, fill: s.color, stroke: "#fff", strokeWidth: 1.5 });
          }),
          (() => {
            const ohlcPt = hp.weekly || hp.daily || hp.hourly;
            const o = ohlcPt ? ohlcPt.open : null;
            const c = ohlcPt ? ohlcPt.close : null;
            const pc = ohlcPt ? ohlcPt.prevClose : null;
            const pctChg = (o != null && c != null && pc) ? ((c - pc) / pc * 100) : null;
            const tipW = 160, tipH = 80;
            const tipX = hx + tipW + padR + 10 > W ? hx - tipW - 10 : hx + 10;
            const tipY = Math.max(padT, Math.min(padT + chartH - tipH, yFn(hp[series[0].key] ? hp[series[0].key].score : 50) - tipH / 2));
            return React.createElement("g", null,
              React.createElement("rect", { x: tipX, y: tipY, width: tipW, height: tipH, rx: 6, fill: "var(--modal-bg)", stroke: "var(--border)", strokeWidth: 1 }),
              React.createElement("text", { x: tipX + 8, y: tipY + 12, fill: "var(--text4)", fontSize: 9, fontWeight: 600 }, fmtDate(hp.date)),
              o != null && React.createElement("text", { x: tipX + 8, y: tipY + 24, fill: "var(--text5)", fontSize: 8 },
                "Open " + o.toFixed(2)
              ),
              c != null && React.createElement("text", { x: tipX + 8, y: tipY + 35, fill: "var(--text5)", fontSize: 8 },
                "Close " + c.toFixed(2)
              ),
              pctChg != null && React.createElement("text", { x: tipX + 8, y: tipY + 46, fill: pctChg >= 0 ? "#22c55e" : "#ef4444", fontSize: 8, fontWeight: 700 },
                (pctChg >= 0 ? "+" : "") + pctChg.toFixed(1) + "% vs prev close"
              ),
              series.map((s, si) => {
                const v = hp[s.key] ? hp[s.key].score : null;
                return React.createElement("text", { key: s.key, x: tipX + 8, y: tipY + 58 + si * 10, fill: s.color, fontSize: 8, fontWeight: 700 },
                  s.label + " " + (v != null ? v : "\u2014")
                );
              })
            );
          })()
        )
      ),
      React.createElement("div", { style: { display: "flex", gap: 12, marginTop: 4, fontSize: 9, color: "var(--text6)" } },
        series.map(s => {
          const val = latest[s.key] ? latest[s.key].score : null;
          const dec = latest[s.key] && latest[s.key].decision ? latest[s.key].decision : "";
          return React.createElement("span", { key: s.key, style: { color: s.color, fontWeight: 600 } },
            s.label + ": " + (val != null ? val + " " + dec : "\u2014")
          );
        }),
        React.createElement("span", { style: { marginLeft: "auto", color: "var(--text6)" } }, trendData.length + " pts")
      )
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   SESSION CONFIDENCE PANEL
   "Will this position reach the +4% target within today's session?" 0–100,
   driven by the stock's own intraday 15m tape + session mechanics.
   ══════════════════════════════════════════════════════════════════════════ */
const SessionConfidencePanel = ({ ticker, buyPrice, buyDate, entryScore }) => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [loading, setLoading] = React.useState(true);
  const [conf, setConf] = React.useState(null);
  const [exitScore, setExitScore] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    if (!ticker || !DF || !TI) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setErr(null); setConf(null); setExitScore(null);
    Promise.all([DF.fetchOHLCVCached(ticker, "daily"), DF.fetchOHLCVCached(ticker, "15m")])
      .then((res) => {
        if (cancelled) return;
        const d = res[0] && res[0].data;
        const i15 = res[1] && res[1].data;
        if (!d || d.length < 50) { setErr("insufficient_daily"); return; }
        const entry = buyPrice || 0;
        if (entry <= 0) { setErr("no_entry"); return; }
        const buyD = buyDate ? new Date(buyDate + "T12:00:00") : null;
        const holdingDays = buyD ? Math.max(0, Math.floor((Date.now() - buyD.getTime()) / 86400000)) : 0;
        const c = TI.computeSessionConfidence(i15, d, { entry_price: entry, target_pct: 4 });
        const e = TI.computeExitScore(d, { entry_price: entry, holding_days: holdingDays, entry_score: entryScore != null ? entryScore : 50 });
        setConf(c);
        setExitScore(e && e.exit_score != null ? e.exit_score : null);
      })
      .catch(() => { if (!cancelled) setErr("fetch"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, buyPrice, buyDate, entryScore]);

  if (loading) {
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Session Confidence"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "Computing intraday read...")
      )
    );
  }
  if (err || !conf) return null;

  const profitPct = conf.components.remainingPct != null ? Math.round((4 - conf.components.remainingPct) * 100) / 100 : null;
  const sc = conf.confidence;
  const inBand = conf.flags.inTargetBand;
  const tone = inBand && sc != null
    ? (sc >= 70 ? { c: "#16a34a", bg: "var(--profitbg)", bd: "var(--profitborder)" } : sc >= 40 ? { c: "#d97706", bg: "var(--warnbg)", bd: "var(--warnborder)" } : { c: "#dc2626", bg: "var(--lossbg)", bd: "var(--lossborder)" })
    : { c: "var(--text5)", bg: "var(--bg5)", bd: "var(--border)" };
  const label = sc == null ? "Insufficient intraday data"
    : !inBand ? (profitPct != null && profitPct >= 4 ? "Target hit \u2014 hard exit rule applies" : "Confidence applies at 2.0\u20134.0% profit")
    : sc >= 70 ? "Let it ride \u2014 strong chance of tagging +4% today"
    : sc >= 40 ? "Wait & watch \u2014 keep a tight stop"
    : "Low odds \u2014 bank the gain today";
  const cp = conf.components;
  const chips = [
    { k: "VWAP", v: cp.vwap != null ? cp.vwap.toFixed(2) : "\u2014", hint: cp.vwapSlope != null ? "slope " + (cp.vwapSlope > 0 ? "+" : "") + cp.vwapSlope + "%" : null },
    { k: "ADX", v: cp.adx != null ? cp.adx + " (+DI " + cp.plusDI + " / \u2212DI " + cp.minusDI + ")" : "\u2014" },
    { k: "MFI", v: cp.mfi != null ? cp.mfi : "\u2014" },
    { k: "ROC5", v: cp.roc5 != null ? cp.roc5 + "%" : "\u2014" },
    { k: "RSI5", v: cp.rsi5 != null ? cp.rsi5 : "\u2014" },
    { k: "Range", v: cp.rangeUsedPct != null ? cp.rangeUsedPct + "% of ATR " + cp.atrPct + "%" : "\u2014" },
  ];
  const chipRow = (c) => React.createElement("div", { key: c.k, style: { padding: "7px 11px", borderRadius: 7, background: "var(--bg4)", border: "1px solid var(--border)", fontSize: 12, width: 175 } },
    React.createElement("div", { style: { color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 2 } }, c.k),
    React.createElement("div", { style: { color: "var(--text2)", fontWeight: 700, fontFamily: "var(--font-heading)", fontSize: 12.5 } }, c.v),
    c.hint && React.createElement("div", { style: { color: "var(--text6)", marginTop: 2, fontSize: 10.5 } }, c.hint)
  );

  return React.createElement("div", { className: "stx-card", style: { marginBottom: 14, padding: "12px 16px", border: "1px solid " + tone.bd } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)" } }, "Session Confidence"),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--text6)", marginTop: 2 } }, "Reach +4% target within today's session \u00b7 15m intraday read")
      ),
      sc != null && React.createElement("div", { style: { textAlign: "right" } },
        React.createElement("div", { style: { fontSize: 26, fontWeight: 800, fontFamily: "var(--font-heading)", color: tone.c, lineHeight: 1 } }, sc + "/100"),
        profitPct != null && React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", marginTop: 3 } }, "at +" + profitPct + "% \u00b7 " + (cp.timeRemainingMin != null ? cp.timeRemainingMin + " min left" : "")),
        exitScore != null && React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", marginTop: 1 } }, "Exit score " + exitScore)
      )
    ),
    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: tone.c, padding: "7px 12px", borderRadius: 7, background: tone.bg, marginBottom: 10 } }, label),
    sc != null && React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, chips.map(chipRow))
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   FORWARD CONFIDENCE PANEL (NEXT 5 DAYS)
   "Will this stock rise +4% from its CURRENT price within the next 5 trading
   days?" 0–100, stock-level (no entry position needed). Same model as the
   10-day panel — 40-session hourly tape + regime drift + BS probability —
   with a 5-day horizon and tighter decay on hourly momentum.
   ══════════════════════════════════════════════════════════════════════════ */
const ForwardConfidencePanel = ({ ticker }) => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [loading, setLoading] = React.useState(true);
  const [conf, setConf] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    if (!ticker || !DF || !TI) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setErr(null); setConf(null);
    Promise.all([DF.fetchOHLCVCached(ticker, "daily"), DF.fetchOHLCVCached(ticker, "1h"), DF.fetchOHLCVCached("^NSEI", "daily")])
      .then((res) => {
        if (cancelled) return;
        const d = res[0] && res[0].data;
        const h1 = res[1] && res[1].data;
        const idxD = res[2] && res[2].data;
        if (!d || d.length < 30 || !h1 || h1.length < 60) { setErr("insufficient_data"); return; }
        var cur = h1[h1.length - 1];
        const c = TI.computeHorizonConfidence(h1, d, {
          horizonDays: 5, windowSessions: 40,
          entry_price: cur.c,
          targetPct: 4,
          holdingDays: null,
          indexCandles: idxD
        });
        setConf(c);
      })
      .catch(() => { if (!cancelled) setErr("fetch"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading) {
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Confidence Score \u2014 Next 5 Days"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "Reading 40-session hourly tape...")
      )
    );
  }
  if (err || !conf) return null;

  const sc = conf.confidence;
  const cp = conf.components;
  const remainingPct = cp.remainingPct != null ? Math.round(cp.remainingPct * 100) / 100 : null;
  const tone = sc != null
    ? (sc >= 70 ? { c: "#16a34a", bg: "var(--profitbg)", bd: "var(--profitborder)" } : sc >= 40 ? { c: "#d97706", bg: "var(--warnbg)", bd: "var(--warnborder)" } : { c: "#dc2626", bg: "var(--lossbg)", bd: "var(--lossborder)" })
    : { c: "var(--text5)", bg: "var(--bg5)", bd: "var(--border)" };
  const label = sc == null ? "Insufficient hourly data for a 5-day read"
    : sc >= 70 ? "Strong odds \u2014 expect +4% within 5 trading days"
    : sc >= 40 ? "Moderate \u2014 needs the hourly trend to cooperate"
    : "Low odds \u2014 unlikely to reach +4% in 5 days";
  const chips = [
    { k: "Hrly ADX", v: cp.hourlyAdx != null ? cp.hourlyAdx + " (+DI " + cp.hourlyPlusDI + " / \u2212DI " + cp.hourlyMinusDI + ")" : "\u2014", x: "Hourly trend strength (0\u2013100) \u2014 how strongly the stock is trending right now." },
    { k: "Hrly VWAP", v: cp.hourlyVwap != null ? cp.hourlyVwap.toFixed(2) : "\u2014", hint: cp.hourlyVwapSlope != null ? "slope " + (cp.hourlyVwapSlope > 0 ? "+" : "") + cp.hourlyVwapSlope + "%" : null, x: "Intraday average price \u2014 above it means buyers are in control; slope shows direction." },
    { k: "RSI14", v: cp.hourlyRsi14 != null ? cp.hourlyRsi14 + " \u00b7 ROC " + (cp.roc10 != null ? cp.roc10 + "%" : "\u2014") : "\u2014", x: "14-hour momentum gauge \u2014 high = overbought, low = oversold (ROC = 10h change)." },
    { k: "Daily", v: cp.dailyEmaBullish && cp.dailyMacdBullish ? "EMA+MACD bull" : cp.dailyEmaBullish ? "EMA bull" : cp.dailyMacdBullish ? "MACD bull" : "flat/weak", x: "Daily EMA + MACD confirmation \u2014 does the longer-term trend back the hourly move?" },
    { k: "Range", v: cp.atrPct != null ? cp.atrPct + "% ATR" : "\u2014", x: "Daily ATR \u2014 the stock's typical single-day move; higher ATR = more room to reach +4%." },
    { k: "Reach", v: cp.horizonReachPct != null ? cp.horizonReachPct + "% vs " + (remainingPct != null ? remainingPct + "%" : "\u2014") + " to go" : "\u2014", hint: (cp.driftPct != null ? "drift " + (cp.driftPct > 0 ? "+" : "") + cp.driftPct + "% in window" : "") + (cp.volConfirm != null ? " \u00b7 buy vol " + Math.round(cp.volConfirm * 100) + "%" : ""), x: "Typical 5-day travel (ATR\u00d7\u221a5) vs +4% gap, plus recent drift and buy-volume strength." },
  ];
  const chipRow = (c) => React.createElement("div", { key: c.k, style: { padding: "7px 11px", borderRadius: 7, background: "var(--bg4)", border: "1px solid var(--border)", fontSize: 12, width: 250 } },
    React.createElement("div", { style: { color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 2 } }, c.k),
    React.createElement("div", { style: { color: "var(--text2)", fontWeight: 700, fontFamily: "var(--font-heading)", fontSize: 12.5 } }, c.v),
    c.hint && React.createElement("div", { style: { color: "var(--text6)", marginTop: 2, fontSize: 10.5 } }, c.hint),
    c.x && React.createElement("div", { style: { color: "var(--text6)", marginTop: 3, fontSize: 11, lineHeight: 1.4 } }, c.x)
  );

  return React.createElement("div", { className: "stx-card", style: { marginBottom: 14, padding: "12px 16px", border: "1px solid " + tone.bd } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)" } }, "Confidence Score \u2014 Next 5 Days"),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--text6)", marginTop: 2 } }, "Chance of +4% from current price within 5 trading days \u00b7 40-session hourly read")
      ),
      sc != null && React.createElement("div", { style: { textAlign: "right" } },
        React.createElement("div", { style: { fontSize: 26, fontWeight: 800, fontFamily: "var(--font-heading)", color: tone.c, lineHeight: 1 } }, sc + "/100"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", marginTop: 3 } },
          "from current price \u00b7 +4% = " + (remainingPct != null ? remainingPct + "%" : "\u2014") + " away" + (cp.sessions != null ? " \u00b7 " + cp.sessions + " sessions" : ""))
      )
    ),
    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: tone.c, padding: "7px 12px", borderRadius: 7, background: tone.bg, marginBottom: 10 } }, label),
    sc != null && React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, chips.map(chipRow))
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   PREMATURE EXIT ANALYSIS PANEL
   Evaluates whether a stock that has hit +4% target still has technical
   momentum to continue higher. Shows trend strength, momentum headroom,
   volume confirmation, resistance room, and multi-TF alignment.
   ══════════════════════════════════════════════════════════════════════════ */
const PrematureExitPanel = ({ ticker, buyPrice }) => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [loading, setLoading] = React.useState(true);
  const [result, setResult] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    if (!ticker || !DF || !TI) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setErr(null); setResult(null);
    DF.fetchOHLCVCached(ticker, "daily")
      .then((res) => {
        if (cancelled) return;
        const d = res && res.data;
        if (!d || d.length < 50) { setErr("insufficient_data"); return; }
        const idxD = null;
        const analysis = TI.computePrematureExitScore(d, idxD, { entry_price: buyPrice });
        if (!cancelled) setResult(analysis);
      })
      .catch(() => { if (!cancelled) setErr("fetch"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, buyPrice]);

  if (loading) {
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Premature Exit Analysis"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "Analyzing continuation potential...")
      )
    );
  }
  if (err) {
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text5)", marginBottom: 4 } }, "Premature Exit Analysis"),
      React.createElement("div", { style: { fontSize: 11, color: "var(--text6)" } }, "Unable to load data (" + err + ")")
    );
  }
  if (!result || result.score == null) {
    var errMsg = result && result.error ? result.error : (result && result.reasons && result.reasons[0]) || "unknown";
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px", border: "1px solid var(--lossborder)" } },
      React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--loss)", marginBottom: 4 } }, "Premature Exit Analysis"),
      React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", fontFamily: "var(--font-mono)" } }, "Error: " + errMsg)
    );
  }

  const score = result.score;
  const signal = result.signal;
  const comps = result.components;
  const reasons = result.reasons || [];

  const tone = score >= 80 ? { c: "#16a34a", bg: "var(--profitbg)", bd: "var(--profitborder)" }
    : score >= 60 ? { c: "#059669", bg: "#ecfdf5", bd: "#a7f3d0" }
    : score >= 40 ? { c: "#d97706", bg: "var(--warnbg)", bd: "var(--warnborder)" }
    : score >= 20 ? { c: "#ea580c", bg: "#fff7ed", bd: "#fed7aa" }
    : { c: "#dc2626", bg: "var(--lossbg)", bd: "var(--lossborder)" };

  const signalLabel = signal === 'STRONG_HOLD' ? 'Strong Continuation'
    : signal === 'HOLD' ? 'Moderate Continuation'
    : signal === 'NEUTRAL' ? 'Neutral'
    : signal === 'CONSIDER_EXIT' ? 'Weak Continuation'
    : 'Exit Now';

  const progressColor = function (pct) {
    if (pct >= 80) return '#16a34a';
    if (pct >= 60) return '#059669';
    if (pct >= 40) return '#d97706';
    if (pct >= 20) return '#ea580c';
    return '#dc2626';
  };

  const compBar = function (comp) {
    const pct = comp.max > 0 ? Math.round(comp.score / comp.max * 100) : 0;
    const col = progressColor(pct);
    return React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 } },
        React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text3)" } }, comp.label),
        React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: col } }, comp.score + "/" + comp.max)
      ),
      React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
        React.createElement("div", { style: { height: "100%", width: pct + "%", background: col, borderRadius: 3, transition: "width 0.3s" } })
      ),
      comp.details && comp.details.length > 0 && React.createElement("div", { style: { marginTop: 4, fontSize: 10, color: "var(--text6)", lineHeight: 1.5 } },
        comp.details.map((d, i) => React.createElement("div", { key: i }, d))
      )
    );
  };

  return React.createElement("div", { className: "stx-card", style: { marginBottom: 14, padding: "12px 16px", border: "1px solid " + tone.bd } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)" } }, "Premature Exit Analysis"),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--text6)", marginTop: 2 } }, "Should you hold for more gains after hitting +4%?")
      ),
      React.createElement("div", { style: { textAlign: "right" } },
        React.createElement("div", { style: { fontSize: 26, fontWeight: 800, fontFamily: "var(--font-heading)", color: tone.c, lineHeight: 1 } }, score + "/100"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", marginTop: 3 } }, signalLabel)
      )
    ),
    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: tone.c, padding: "7px 12px", borderRadius: 7, background: tone.bg, marginBottom: 12 } },
      reasons[0] || "Analysis complete"
    ),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
      React.createElement("div", null,
        compBar({ label: "Trend Strength", score: comps.trendStrength.score, max: comps.trendStrength.max, details: comps.trendStrength.details }),
        compBar({ label: "Momentum Headroom", score: comps.momentumHeadroom.score, max: comps.momentumHeadroom.max, details: comps.momentumHeadroom.details }),
        compBar({ label: "Volume Confirmation", score: comps.volumeConfirm.score, max: comps.volumeConfirm.max, details: comps.volumeConfirm.details })
      ),
      React.createElement("div", null,
        compBar({ label: "Resistance Room", score: comps.resistanceRoom.score, max: comps.resistanceRoom.max, details: comps.resistanceRoom.details }),
        compBar({ label: "Multi-TF Alignment", score: comps.multiTFAlignment.score, max: comps.multiTFAlignment.max, details: comps.multiTFAlignment.details })
      )
    ),
    reasons.length > 1 && React.createElement("div", { style: { marginTop: 10, padding: "8px 10px", borderRadius: 7, background: "var(--bg4)", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text6)", marginBottom: 4, textTransform: "uppercase" } }, "Key Factors"),
      React.createElement("div", { style: { fontSize: 11, color: "var(--text3)", lineHeight: 1.6 } },
        reasons.slice(1).map((r, i) => React.createElement("div", { key: i }, "\u2022 " + r))
      )
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   PATTERN MINING PANEL
   Scans the selected timeframe's candle data for well-established
   bullish and bearish candlestick patterns. Displays each detected
   pattern as a chip with type, name, and description.
   Rendered in Single Stock Analysis (Pulse tab).
   ══════════════════════════════════════════════════════════════════════════ */
const PatternMiningPanel = ({ candles, timeframe }) => {
  const TI = window.TechIndicators;

  if (!candles || candles.length < 3) return null;

  var detected = TI && TI.detectCandlePatterns ? TI.detectCandlePatterns(candles) : [];
  if (detected.length === 0) return null;

  var bullish = detected.filter(function (p) { return p.type === "bullish"; });
  var bearish = detected.filter(function (p) { return p.type === "bearish"; });

  var tfLabel = timeframe || "daily";
  var fmtTs = function (t) {
    if (!t) return "";
    var parts = String(t).split(" ");
    var datePart = parts[0] || "";
    var timePart = parts[1] || "";
    var dParts = datePart.split("-");
    var shortDate = dParts.length === 3 ? dParts[2] + "/" + dParts[1] + "/" + dParts[0].slice(2) : datePart;
    return shortDate + (timePart ? " " + timePart : "");
  };
  var chipRow = function (c) {
    var isBull = c.type === "bullish";
    var accentColor = isBull ? "var(--profit)" : "var(--loss)";
    var bg = isBull ? "rgba(22,163,74,.06)" : "rgba(239,68,68,.06)";
    var timeLabel = c.startTime && c.endTime
      ? (c.startTime === c.endTime ? fmtTs(c.startTime) : fmtTs(c.startTime) + " \u2192 " + fmtTs(c.endTime))
      : "";
    return React.createElement("div", { key: c.name + "_" + c.bar, style: { padding: "7px 11px", borderRadius: 7, background: bg, border: "1px solid var(--border)", borderLeft: "3px solid " + accentColor, fontSize: 12, width: 250 } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 } },
        React.createElement("div", { style: { color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 } }, c.name),
        React.createElement("div", { style: { fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 6, background: accentColor + "22", border: "1px solid " + accentColor, color: accentColor, textTransform: "uppercase" } }, c.type)
      ),
      React.createElement("div", { style: { color: "var(--text2)", fontWeight: 700, fontFamily: "var(--font-heading)", fontSize: 12.5 } }, c.desc),
      timeLabel && React.createElement("div", { style: { color: "var(--text6)", marginTop: 3, fontSize: 10.5, fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 4 } },
        React.createElement("span", { style: { fontSize: 9 } }, "\u23f1"),
        timeLabel
      )
    );
  };

  return React.createElement("div", { className: "stx-card", style: { marginBottom: 14, padding: "12px 16px", border: "1px solid rgba(139,92,246,.25)" } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)" } }, "Pattern Mining"),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--text6)", marginTop: 2 } }, detected.length + " pattern" + (detected.length !== 1 ? "s" : "") + " detected on " + tfLabel + " chart")
      ),
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        bullish.length > 0 && React.createElement("div", { style: { padding: "3px 8px", borderRadius: 6, background: "rgba(22,163,74,.1)", border: "1px solid rgba(22,163,74,.3)", fontSize: 10, fontWeight: 700, color: "var(--profit)" } }, bullish.length + " Bullish"),
        bearish.length > 0 && React.createElement("div", { style: { padding: "3px 8px", borderRadius: 6, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", fontSize: 10, fontWeight: 700, color: "var(--loss)" } }, bearish.length + " Bearish")
      )
    ),
    React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, detected.map(chipRow))
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   TEN-DAY FORWARD CONFIDENCE PANEL (NEXT 10 DAYS)
   "Will THIS stock rise +4% from its CURRENT price within the next 10 trading
   days?" 0–100, stock-level (no entry position needed). Driven by the stock's
   own HOURLY tape over the last ~15 sessions plus how far +4% is vs the
   stock's typical 10-day range. Rendered in Single Stock Analysis (Pulse tab).
   ══════════════════════════════════════════════════════════════════════════ */
const TenDayConfidencePanel = ({ ticker }) => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [loading, setLoading] = React.useState(true);
  const [conf, setConf] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    if (!ticker || !DF || !TI) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setErr(null); setConf(null);
    Promise.all([DF.fetchOHLCVCached(ticker, "daily"), DF.fetchOHLCVCached(ticker, "1h"), DF.fetchOHLCVCached("^NSEI", "daily"), DF.fetchOHLCVCached(ticker, "weekly"), DF.fetchOHLCVCached("^NSEI", "weekly")])
      .then((res) => {
        if (cancelled) return;
        const d = res[0] && res[0].data;
        const h1 = res[1] && res[1].data;
        const idxD = res[2] && res[2].data;
        const w = res[3] && res[3].data;
        const idxW = res[4] && res[4].data;
        if (!d || d.length < 30 || !h1 || h1.length < 60) { setErr("insufficient_data"); return; }
        var entryScoreContext = null;
        try {
          var result = computeCompatEntryScore(w && w.length >= 50 ? w : null, d, h1 && h1.length >= 100 ? h1 : null, idxD, idxW);
          if (result) entryScoreContext = buildEntryScoreContext(result);
        } catch(e) {}
        const c = TI.computeTenDayForwardConfidence(h1, d, idxD, entryScoreContext);
        setConf(c);
      })
      .catch(() => { if (!cancelled) setErr("fetch"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading) {
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 12, padding: "10px 14px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Confidence Score \u2014 Next 10 Days"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "Reading 15-day hourly tape...")
      )
    );
  }
  if (err || !conf) return null;

  const sc = conf.confidence;
  const scLog = conf.confidenceLognormal;
  const scEmp = conf.confidenceEmpirical;
  const cp = conf.components;
  const remainingPct = cp.remainingPct != null ? Math.round(cp.remainingPct * 100) / 100 : null;
  function confColor(v) { return v != null ? (v >= 70 ? "#16a34a" : v >= 40 ? "#d97706" : "#dc2626") : "var(--text5)"; }
  function confBg(v) { return v != null ? (v >= 70 ? "var(--profitbg)" : v >= 40 ? "var(--warnbg)" : "var(--lossbg)") : "var(--bg5)"; }
  function confBd(v) { return v != null ? (v >= 70 ? "var(--profitborder)" : v >= 40 ? "var(--warnborder)" : "var(--lossborder)") : "var(--border)"; }
  const tone = { c: confColor(sc), bg: confBg(sc), bd: confBd(sc) };
  const _hd = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().horizonDays || 10) : 10;
  const label = sc == null ? "Insufficient hourly data for a " + _hd + "-day read"
    : sc >= 70 ? "Strong odds \u2014 expect +4% within " + _hd + " trading days"
    : sc >= 40 ? "Moderate \u2014 needs the hourly trend to cooperate"
    : "Low odds \u2014 unlikely to reach +4% in " + _hd + " days";
  const chips = [
    { k: "Hrly ADX", v: cp.hourlyAdx != null ? cp.hourlyAdx + " (+DI " + cp.hourlyPlusDI + " / \u2212DI " + cp.hourlyMinusDI + ")" : "\u2014", x: "Hourly trend strength (0\u2013100) \u2014 how strongly the stock is trending right now." },
    { k: "Hrly VWAP", v: cp.hourlyVwap != null ? cp.hourlyVwap.toFixed(2) : "\u2014", hint: cp.hourlyVwapSlope != null ? "slope " + (cp.hourlyVwapSlope > 0 ? "+" : "") + cp.hourlyVwapSlope + "%" : null, x: "Intraday average price \u2014 above it means buyers are in control; slope shows direction." },
    { k: "RSI14", v: cp.hourlyRsi14 != null ? cp.hourlyRsi14 + " \u00b7 ROC " + (cp.roc10 != null ? cp.roc10 + "%" : "\u2014") : "\u2014", x: "14-hour momentum gauge \u2014 high = overbought, low = oversold (ROC = 10h change)." },
    { k: "Daily", v: cp.dailyEmaBullish && cp.dailyMacdBullish ? "EMA+MACD bull" : cp.dailyEmaBullish ? "EMA bull" : cp.dailyMacdBullish ? "MACD bull" : "flat/weak", x: "Daily EMA + MACD confirmation \u2014 does the longer-term trend back the hourly move?" },
    { k: "Range", v: cp.atrPct != null ? cp.atrPct + "% ATR" : "\u2014", x: "Daily ATR \u2014 the stock's typical single-day move; higher ATR = more room to reach +4%." },
    { k: "Reach", v: cp.horizonReachPct != null ? cp.horizonReachPct + "% vs " + (remainingPct != null ? remainingPct + "%" : "\u2014") + " to go" : "\u2014", hint: (cp.driftPct != null ? "drift " + (cp.driftPct > 0 ? "+" : "") + cp.driftPct + "% in window" : "") + (cp.volConfirm != null ? " \u00b7 buy vol " + Math.round(cp.volConfirm * 100) + "%" : ""), x: "Typical " + _hd + "-day travel (ATR\u00d7\u221a" + _hd + ") vs +4% gap, plus recent drift and buy-volume strength." },
    { k: "Model", v: cp.empiricalMethod === 'empirical' ? "Empirical (" + cp.empiricalSampleCount + " samples)" : "Lognormal fallback", x: "Whether the model used real historical forward-window hit rates or fell back to the lognormal distribution. 60+ samples needed for empirical." },
    cp.entryScoreUsed ? { k: "Entry Score", v: cp.entryScore != null ? cp.entryScore + "/100" : "\u2014", x: "Entry score blended 60/40 with the raw confidence. Low entry scores (<35) cap the final confidence." } : null,
  ].filter(Boolean);
  const chipRow = (c) => React.createElement("div", { key: c.k, style: { padding: "7px 11px", borderRadius: 7, background: "var(--bg4)", border: "1px solid var(--border)", fontSize: 12, width: 250 } },
    React.createElement("div", { style: { color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 2 } }, c.k),
    React.createElement("div", { style: { color: "var(--text2)", fontWeight: 700, fontFamily: "var(--font-heading)", fontSize: 12.5 } }, c.v),
    c.hint && React.createElement("div", { style: { color: "var(--text6)", marginTop: 2, fontSize: 10.5 } }, c.hint),
    c.x && React.createElement("div", { style: { color: "var(--text6)", marginTop: 3, fontSize: 11, lineHeight: 1.4 } }, c.x)
  );

  return React.createElement("div", { className: "stx-card", style: { marginBottom: 14, padding: "12px 16px", border: "1px solid " + tone.bd } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)" } }, "Confidence Score \u2014 Next 10 Days"),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--text6)", marginTop: 2 } }, "Chance of +4% from current price within " + _hd + " trading days \u00b7 15-day hourly read")
      ),
      sc != null && React.createElement("div", { style: { display: "flex", gap: 16, textAlign: "right" } },
        scLog != null && React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 22, fontWeight: 800, fontFamily: "var(--font-heading)", color: confColor(scLog), lineHeight: 1 } }, scLog + "/100"),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } }, "Lognormal")
        ),
        scEmp != null && React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 22, fontWeight: 800, fontFamily: "var(--font-heading)", color: confColor(scEmp), lineHeight: 1 } }, scEmp + "/100"),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } }, "Empirical")
        ),
        scLog == null && scEmp == null && React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 22, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text5)", lineHeight: 1 } }, "\u2014")
        )
      )
    ),
    React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", marginBottom: 6 } },
      "from current price \u00b7 +4% = " + (remainingPct != null ? remainingPct + "%" : "\u2014") + " away" + (cp.sessions != null ? " \u00b7 " + cp.sessions + " sessions" : "") + (cp.entryScoreUsed ? " \u00b7 entry-score blended" : "")
    ),
    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: tone.c, padding: "7px 12px", borderRadius: 7, background: tone.bg, marginBottom: 10 } }, label),
    sc != null && React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, chips.map(chipRow))
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   OPTIMUM ENTRY PRICE PANEL
   "At what price should I enter so that +4% within the next 10 trading
   sessions is realistic?" Scores the stock's own 15-session entry levels
   (current, VWAP, EMA21, typical dip, swing support) and recommends the
   highest-priced limit that keeps strong odds — no chasing the day's high.
   Rendered in Single Stock Analysis (Pulse tab).
   ══════════════════════════════════════════════════════════════════════════ */
const OptimumEntryPanel = ({ ticker, entryScoreContext }) => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [loading, setLoading] = React.useState(true);
  const [res, setRes] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const _hd = (TI && TI.getScoreConfig) ? (TI.getScoreConfig().horizonDays || 10) : 10;

  React.useEffect(() => {
    if (!ticker || !DF || !TI) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setErr(null); setRes(null);
    Promise.all([DF.fetchOHLCVCached(ticker, "daily"), DF.fetchOHLCVCached(ticker, "1h"), DF.fetchOHLCVCached("^NSEI", "daily"), DF.fetchOHLCVCached(ticker, "5m")])
      .then((r) => {
        if (cancelled) return;
        const d = r[0] && r[0].data;
        const h1 = r[1] && r[1].data;
        const idxD = r[2] && r[2].data;
        const i5 = r[3] && r[3].data;
        if (!d || d.length < 30 || !h1 || h1.length < 60) { setErr("insufficient_data"); return; }
        setRes(TI.computeOptimumEntryPrice(h1, d, idxD, entryScoreContext || null, i5 || null));
      })
      .catch(() => { if (!cancelled) setErr("fetch"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, entryScoreContext]);

  if (loading) {
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 14, padding: "12px 16px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)" } }, "Optimum Entry Price"),
        React.createElement("span", { style: { fontSize: 11, color: "var(--text6)" } }, "Scoring entry levels...")
      )
    );
  }
  if (err || !res || res.currentPrice == null) return null;

  const price = (v) => v == null ? "\u2014" : "\u20b9" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const entry = res.optimumEntryPrice;
  const confE = res.entryConfidence;
  const confC = res.currentConfidence;
  const disc = res.discountPct;
  const cp = res.components;
  const fr = res.fillRange;
  const tone = confE != null
    ? (confE >= 70 ? { c: "#16a34a", bg: "var(--profitbg)", bd: "var(--profitborder)" } : confE >= 40 ? { c: "#d97706", bg: "var(--warnbg)", bd: "var(--warnborder)" } : { c: "#dc2626", bg: "var(--lossbg)", bd: "var(--lossborder)" })
    : { c: "var(--text5)", bg: "var(--bg5)", bd: "var(--border)" };
  const label = confE == null ? "Insufficient hourly data for an entry read"
    : !res.overextended && confC >= 60 ? "Enter at market \u2014 not stretched, strong odds at current price"
    : res.overextended && disc > 0 ? "Don't chase the high \u2014 wait for a pullback to this level"
    : disc > 0 ? "Lower entry improves the odds \u2014 place a limit at this level"
    : "Weak odds at any level \u2014 consider waiting for a better setup";

  const chips = [
    { k: "Current", v: price(res.currentPrice), x: "The latest market price \u2014 paying the full ask means no entry edge." },
    { k: "Today High", v: res.todayHigh != null ? price(res.todayHigh) : "\u2014", x: "Highest price traded today." },
    { k: "Today Low", v: res.todayLow != null ? price(res.todayLow) : "\u2014", x: "Lowest price traded today." },
    { k: "Drop to Low (LN)", v: res.probToTodayLowLognormal != null ? "\u2248" + res.probToTodayLowLognormal + "%" : (res.todayLow != null && res.todayLow >= res.currentPrice - 0.01 ? "At low" : "\u2014"), x: res.todayLow != null && res.todayLow < res.currentPrice - 0.01 ? "Lognormal model \u2014 probability of price touching " + price(res.todayLow) + " before close." : "Current price is at or near today's low." },
    { k: "Drop to Low (EM)", v: res.probToTodayLowEmpirical != null ? "\u2248" + res.probToTodayLowEmpirical + "%" : (res.todayLow != null && res.todayLow >= res.currentPrice - 0.01 ? "At low" : (cp.empiricalMethod === 'empirical' ? "Insufficient samples" : "\u2014")), x: res.todayLow != null && res.todayLow < res.currentPrice - 0.01 ? "Empirical model (" + cp.empiricalSampleCount + " samples) \u2014 non-parametric estimate using 5m intraday data." : cp.empiricalMethod !== 'empirical' ? "Insufficient 5m data for empirical estimate." : "Current price is at or near today's low." },
    { k: "Optimum Entry", v: price(entry), hint: disc != null && disc > 0 ? "limit " + disc + "% below current" : disc != null ? "at current price" : null, x: "Best limit price \u2014 highest level with strong odds of +4% in 10 sessions." },
    { k: "Odds @ entry", v: confE != null ? confE + "/100" : "\u2014", hint: confC != null ? "vs " + confC + " at current" : null, x: _hd + "-day +4% confidence if bought at the optimum price." },
    { k: "Advantage", v: res.advantagePct != null ? (res.advantagePct > 0 ? "+" : "") + res.advantagePct + " pts" : "\u2014", x: "Extra confidence gained by buying at the limit instead of market." },
    { k: "VWAP", v: cp.vwap != null ? price(cp.vwap) : "\u2014", x: "Session average price \u2014 natural pullback target." },
    { k: "EMA21", v: cp.ema21 != null ? price(cp.ema21) : "\u2014", x: "21-hour trend average \u2014 bounces here in uptrends." },
    { k: "Dip (median)", v: cp.dipDepthPct != null ? cp.dipDepthPct + "%" : "\u2014", x: "Median intraday pullback from session open (excl. today)." },
    { k: "Support", v: cp.swingLow != null ? price(cp.swingLow) : "\u2014", x: "Lowest low of last 3 sessions \u2014 below this the setup breaks." },
    { k: "ATR cap", v: cp.atrCapPct != null ? cp.atrCapPct + "%" : "\u2014", x: "Volatility-scaled discount cap (1.5\u00d7 daily ATR%)." },
    { k: "Session left", v: cp.marketClosed ? "Closed" : (cp.sessionFraction != null ? Math.round(cp.sessionFraction * 100) + "%" : "\u2014"), x: cp.marketClosed ? "Market is closed \u2014 fill probabilities are unavailable." : "Fraction of today's 6.25h trading session remaining." },
    { k: "Fill model", v: cp.empiricalMethod === 'empirical' ? "Empirical (" + cp.empiricalSampleCount + " samples)" : "Lognormal", x: cp.empiricalMethod === 'empirical' ? "Non-parametric drawdown model using " + cp.empiricalSampleCount + " historical intraday samples." : "Parametric model (lognormal) \u2014 insufficient 15m data for empirical estimate." },
    { k: "Range", v: cp.horizonReachPct != null ? cp.horizonReachPct + "% / " + _hd + "d" : "\u2014", x: "Typical " + _hd + "-day travel (ATR\u00d7\u221a" + _hd + ")." },
  ];
  const chipRow = (c) => React.createElement("div", { key: c.k, style: { padding: "7px 11px", borderRadius: 7, background: "var(--bg4)", border: "1px solid var(--border)", fontSize: 12, width: 250 } },
    React.createElement("div", { style: { color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginBottom: 2 } }, c.k),
    React.createElement("div", { style: { color: "var(--text2)", fontWeight: 700, fontFamily: "var(--font-heading)", fontSize: 12.5 } }, c.v),
    c.hint && React.createElement("div", { style: { color: "var(--text6)", marginTop: 2, fontSize: 10.5 } }, c.hint),
    c.x && React.createElement("div", { style: { color: "var(--text6)", marginTop: 3, fontSize: 11, lineHeight: 1.4 } }, c.x)
  );

  var fillRangeEl = null;
  if (cp.marketClosed) {
    fillRangeEl = React.createElement("div", { style: { marginTop: 8, padding: "8px 12px", borderRadius: 7, background: "var(--bg4)", border: "1px solid var(--border)", textAlign: "center" } },
      React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 } }, "Fill Probability Range"),
      React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", fontWeight: 600 } }, "Market closed \u2014 fill probabilities unavailable until market opens (9:15 AM)")
    );
  } else if (res.todayLow != null && res.todayLow < res.currentPrice - 0.01) {
    var lnFill = res.probToTodayLowLognormal;
    var emFill = res.probToTodayLowEmpirical;
    fillRangeEl = React.createElement("div", { style: { marginTop: 8, padding: "8px 12px", borderRadius: 7, background: "var(--bg4)", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 } }, "Fill Probability Range (today)"),
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } },
        React.createElement("div", { style: { flex: "1 1 0", minWidth: 140, textAlign: "center" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", fontWeight: 600, marginBottom: 2 } }, "Drop to Today Low (LN)"),
          React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: lnFill != null ? (lnFill >= 70 ? "#16a34a" : lnFill >= 40 ? "#d97706" : "#dc2626") : "var(--text6)", lineHeight: 1.1 } }, price(res.todayLow)),
          React.createElement("div", { style: { fontSize: 11, color: lnFill != null ? (lnFill >= 70 ? "#16a34a" : lnFill >= 40 ? "#d97706" : "#dc2626") : "var(--text6)", fontWeight: 700, marginTop: 2 } }, lnFill != null ? "\u2248" + lnFill + "% chance" : "\u2014"),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 1 } }, "Lognormal model")
        ),
        React.createElement("div", { style: { flex: "1 1 0", minWidth: 140, textAlign: "center" } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", fontWeight: 600, marginBottom: 2 } }, "Drop to Today Low (EM)"),
          React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: emFill != null ? (emFill >= 70 ? "#16a34a" : emFill >= 40 ? "#d97706" : "#dc2626") : "var(--text6)", lineHeight: 1.1 } }, price(res.todayLow)),
          React.createElement("div", { style: { fontSize: 11, color: emFill != null ? (emFill >= 70 ? "#16a34a" : emFill >= 40 ? "#d97706" : "#dc2626") : "var(--text6)", fontWeight: 700, marginTop: 2 } }, emFill != null ? "\u2248" + emFill + "% chance" : "Insufficient samples"),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 1 } }, cp.empiricalMethod === 'empirical' ? "Empirical (" + cp.empiricalSampleCount + " samples)" : "Lognormal fallback")
        )
      )
    );
  } else if (res.todayLow != null && res.todayLow >= res.currentPrice - 0.01) {
    fillRangeEl = React.createElement("div", { style: { marginTop: 8, padding: "8px 12px", borderRadius: 7, background: "var(--bg4)", border: "1px solid var(--border)", textAlign: "center" } },
      React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 } }, "Fill Probability Range (today)"),
      React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", fontWeight: 600 } }, "Current price is at or near today's low \u2014 no further drop expected today")
    );
  }

  return React.createElement("div", { className: "stx-card", style: { marginBottom: 14, padding: "12px 16px", border: "1px solid " + tone.bd } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)" } }, "Optimum Entry Price"),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--text6)", marginTop: 2 } }, "Fill probability \u00b7 " + _hd + "-day horizon \u00b7 15-session read")
      ),
      entry != null && React.createElement("div", { style: { textAlign: "right" } },
        React.createElement("div", { style: { fontSize: 26, fontWeight: 800, fontFamily: "var(--font-heading)", color: tone.c, lineHeight: 1 } }, price(entry)),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", marginTop: 3 } },
          "target " + price(entry != null ? entry * 1.04 : null) + (disc != null ? " \u00b7 " + disc + "% below current" : ""))
      )
    ),
    React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: tone.c, padding: "7px 12px", borderRadius: 7, background: tone.bg, marginBottom: 10 } }, label),
    confE != null && React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, chips.map(chipRow)),
    fillRangeEl
  );
};


/* ══════════════════════════════════════════════════════════════════════════
   SINGLE STOCK ANALYSIS — SNAPSHOT SUPPORT
   Captures the current chart (Daily + Hourly candles), Overall Signal,
   Entry Score, "Confidence Score — Next 10 Days", Optimum Entry Price and a
   compact daily-indicator panel into a snapshot persisted in IndexedDB and
   browsable grouped by year → month → day.
   ══════════════════════════════════════════════════════════════════════════ */
const SS_SNAP_KEY = "stox_single_stock_snapshots";
const SS_DAILY_BARS = 60;
const SS_HOURLY_BARS = 120;

const SS_IND_KEYS = [
  ["rsi_14", "RSI(14)"], ["adx_14", "ADX(14)"], ["macd", "MACD"],
  ["stochRSI", "Stoch RSI"], ["ema_9", "EMA 9"], ["ema_21", "EMA 21"],
  ["ema_50", "EMA 50"], ["sma_20", "SMA 20"], ["sma_50", "SMA 50"],
  ["supertrend", "Supertrend"], ["psar", "PSAR"], ["atr_14", "ATR(14)"],
  ["vwap", "VWAP"], ["bb", "Bollinger"], ["cci_20", "CCI(20)"],
  ["mfi_14", "MFI(14)"], ["obv", "OBV"], ["roc_12", "ROC(12)"],
  ["cmf_20", "CMF(20)"], ["williamsR", "Williams %R"], ["choppiness", "Choppiness"],
  ["tsi", "TSI"], ["stc", "STC"], ["week52HL", "52W"]
];

const pickCompactIndicators = (ind) => {
  if (!ind) return null;
  const out = {};
  SS_IND_KEYS.forEach((pair) => {
    const k = pair[0];
    const v = ind[k];
    if (v === null || v === undefined) return;
    out[k] = v;
  });
  return out;
};

const renderMiniCandles = (data, opts) => {
  if (!data || !data.length) return null;
  const maxN = opts && opts.max;
  const w = (opts && opts.w) || 300;
  const h = (opts && opts.h) || 72;
  const filtered = data.filter(c => c && typeof c.o === "number" && !isNaN(c.o) && typeof c.h === "number" && !isNaN(c.h) && typeof c.l === "number" && !isNaN(c.l) && typeof c.c === "number" && !isNaN(c.c));
  if (filtered.length < 2) return null;
  const sliced = maxN ? filtered.slice(-maxN) : filtered;
  const padL = 40, padR = 6, padT = 6, padB = 16;
  const cw = w - padL - padR;
  const ph = h - padT - padB;
  const hi = Math.max.apply(null, sliced.map(c => c.h));
  const lo = Math.min.apply(null, sliced.map(c => c.l));
  const range = hi - lo || 1;
  const gap = cw / sliced.length;
  const barW = Math.max(1, Math.floor(gap) - 1);
  const yScale = (v) => padT + ph - ((v - lo) / range) * ph;
  const lastC = sliced[sliced.length - 1];
  const lastY = yScale(lastC.c);
  const fmtY = (v) => "\u20b9" + Number(v).toFixed(v >= 1000 ? 0 : 2);
  const gridEls = [0, 0.25, 0.5, 0.75, 1].map((pct, gi) => {
    const y = padT + ph * (1 - pct);
    const val = lo + range * pct;
    return React.createElement("g", { key: "g" + gi },
      React.createElement("line", { x1: padL, y1: y, x2: w - padR, y2: y, stroke: "var(--border)", strokeWidth: 0.4, strokeDasharray: "2,3" }),
      React.createElement("text", { x: padL - 3, y: y + 3, fontSize: 7, fill: "var(--text6)", textAnchor: "end", fontFamily: "var(--font-mono)" }, fmtY(val))
    );
  });
  const candleEls = sliced.map((c, i) => {
    const x = padL + i * gap + gap / 2;
    const isUp = c.c >= c.o;
    const color = isUp ? "#22c55e" : "#ef4444";
    const bodyTop = yScale(Math.max(c.o, c.c));
    const bodyBot = yScale(Math.min(c.o, c.c));
    return React.createElement("g", { key: "c" + i },
      React.createElement("line", { x1: x, y1: yScale(c.h), x2: x, y2: yScale(c.l), stroke: color, strokeWidth: 0.8 }),
      React.createElement("rect", { x: x - barW / 2, y: bodyTop, width: barW, height: Math.max(1, bodyBot - bodyTop), fill: color, rx: 0.4 })
    );
  });
  return React.createElement("svg", { viewBox: "0 0 " + w + " " + h, style: { width: "100%", height: "auto" } },
    gridEls,
    candleEls,
    React.createElement("line", { x1: padL, y1: lastY, x2: w - padR, y2: lastY, stroke: "var(--accent)", strokeWidth: 0.6, strokeDasharray: "3,3" }),
    React.createElement("text", { x: w - padR - 2, y: lastY - 2, fontSize: 7, fill: "var(--accent)", textAnchor: "end", fontFamily: "var(--font-mono)" }, fmtY(lastC.c))
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   HOLDING HISTORY PANEL
   Fetches daily closing prices from buyDate → today, renders chart
   ══════════════════════════════════════════════════════════════════════════ */
const HoldingHistoryPanel = ({ h, prices }) => {
  const [histLoading, setHistLoading] = React.useState(false);
  const [histPts, setHistPts] = React.useState(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const tkr = (h.ticker || "").trim().toUpperCase();
  const isGain = (prices[h.ticker]?.price || h.currentPrice || 0) >= (h.buyPrice || h.avgPrice || 0);
  const costBasisVal = h.qty * (h.buyPrice || h.avgPrice || 0);
  const safeId = "hvh_" + (h.id || "x").replace(/[^a-zA-Z0-9]/g, "_");

  React.useEffect(() => {
    if (!tkr || !h.buyDate) { setHistPts(null); setHistLoading(false); return; }
    let cancelled = false;
    setHistLoading(true);
    setHistPts(null);
    fetchHistoricalPrices(tkr, h.buyDate)
      .then(pts => {
        if (cancelled) return;
        setHistPts(pts && pts.length >= 2 ? pts : []);
        setHistLoading(false);
      })
      .catch(() => { if (!cancelled) { setHistPts([]); setHistLoading(false); } });
    return () => { cancelled = true; };
  }, [tkr, h.buyDate, refreshKey]);

  if (histLoading) return React.createElement("div", { style: {
    marginTop: 16, padding: "14px 18px", borderRadius: 12,
    background: "var(--bg4)", border: "1px solid var(--border2)",
    display: "flex", alignItems: "center", gap: 10
  }},
    React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite" } }, Ico.refresh(16)),
    React.createElement("span", { style: { fontSize: 13, color: "var(--text5)", flex: 1 } }, "Fetching price history since " + h.buyDate + "...")
  );

  if (histPts && histPts.length >= 2) {
    const chartPts = histPts.map(p => ({ date: p.date, value: h.qty * p.close }));
    const latestVal = chartPts[chartPts.length - 1].value;
    const oldestVal = chartPts[0].value;
    const overallChg = latestVal - oldestVal;
    const overallChgPct = oldestVal > 0 ? ((overallChg / oldestVal) * 100).toFixed(2) : "0.00";
    const chgCol = overallChg >= 0 ? "#10b981" : "#ef4444";
    return React.createElement("div", { style: { marginTop: 20, marginBottom: 6, background: "var(--bg4)", borderRadius: 14, padding: "20px 20px 14px", border: "1px solid var(--border2)" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 } },
        React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: "var(--text4)", textTransform: "uppercase", letterSpacing: .5 } }, "Holding Value History"),
        React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", background: "var(--accentbg2)", border: "1px solid var(--border2)", borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" } }, chartPts[0].date + " \u2192 " + chartPts[chartPts.length - 1].date),
        React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { style: { fontSize: 12, padding: "3px 10px", borderRadius: 8, fontWeight: 700, background: overallChg >= 0 ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.12)", border: "1px solid " + (overallChg >= 0 ? "rgba(16,185,129,.25)" : "rgba(239,68,68,.25)"), color: chgCol, display: "inline-flex", alignItems: "center", gap: 3 } }, (overallChg >= 0 ? React.createElement(React.Fragment, null, Ico.triangleUp(9, chgCol), " +") : React.createElement(React.Fragment, null, Ico.triangleDown(9, chgCol), " ")), Math.abs(overallChgPct) + "%"),
          React.createElement("span", { style: { fontSize: 12, color: "var(--text6)" } }, chartPts.length + " days"),
          React.createElement("button", {
            onClick: () => { if (histLoading) return; setHistPts(null); setRefreshKey(k => k + 1); },
            disabled: histLoading,
            style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 7, border: "1px solid rgba(16,185,129,.3)", background: "rgba(16,185,129,.08)", color: "var(--accent)", cursor: histLoading ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, opacity: histLoading ? .5 : 1 }
          }, React.createElement(React.Fragment, null, Ico.refresh(12), " Refresh"))
        )
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 8, fontSize: 12, color: "var(--text6)" } },
        React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } },
          React.createElement("span", { style: { display: "inline-block", width: 24, height: 3, background: isGain ? "#10b981" : "#ef4444", borderRadius: 2, verticalAlign: "middle" } }),
          "Holding value"
        ),
        React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } },
          React.createElement("span", { style: { display: "inline-block", width: 24, height: 0, borderTop: "3px dashed #f59e0b", verticalAlign: "middle" } }),
          "Cost basis (" + INR(costBasisVal) + ")"
        )
      ),
      React.createElement(HoldingValueChart, { pts: chartPts, qty: h.qty, buyPrice: h.buyPrice || h.avgPrice || 0, color: isGain ? "#10b981" : "#ef4444", gradId: safeId })
    );
  }

  if (histPts !== null && histPts.length === 0 && h.buyDate) {
    return React.createElement("div", { style: {
      marginTop: 12, padding: "10px 14px", borderRadius: 9, fontSize: 12,
      background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.18)",
      color: "#ef4444", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
    }},
      React.createElement("span", { style: { flex: 1 } }, Ico.alertTriangle(13, "#f59e0b"), " Could not fetch price history for " + h.ticker + ". Check connection or try again."),
      React.createElement("button", {
        onClick: () => { setHistPts(null); setRefreshKey(k => k + 1); },
        style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 7, border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.08)", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 600 }
      }, React.createElement(React.Fragment, null, Ico.refresh(12), " Retry"))
    );
  }

  return null;
};

/* ══════════════════════════════════════════════════════════════════════════
   SNAPSHOT CHART PANEL (for Trade History — uses saved chartPts or fetches)
   ══════════════════════════════════════════════════════════════════════════ */
const SnapshotChartPanel = ({ sn, dispatch }) => {
  const hasChart = sn.chartPts && sn.chartPts.length >= 2;
  const canLoad = !hasChart && sn.ticker && sn.buyDate && sn.savedAt;
  const [loadingChart, setLoadingChart] = React.useState(false);
  const [chartError, setChartError] = React.useState(null);
  if (!hasChart && !canLoad) return null;
  if (!hasChart && canLoad) return React.createElement("div", { style: {
    marginTop: 12, padding: "10px 14px", borderRadius: 9,
    background: "var(--bg5)", border: "1px solid var(--border2)",
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
  }},
    React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", flex: 1 } },
      chartError ? React.createElement(React.Fragment, null, Ico.alertTriangle(13, "#f59e0b"), " " + chartError) : "No chart data saved with this snapshot."
    ),
    React.createElement("button", {
      disabled: loadingChart,
      onClick: async () => {
        setLoadingChart(true); setChartError(null);
        const tkr__ = (sn.ticker || "").trim().toUpperCase();
        try {
          const raw = await fetchHistoricalPrices(tkr__, sn.buyDate);
          if (raw && raw.length >= 2) {
            const cutoff = sn.savedAt || TODAY();
            const pts = raw.filter(p => p.date <= cutoff).map(p => ({ date: p.date, close: p.close }));
            if (pts.length >= 2) {
              if (dispatch) {
                dispatch({ type: "UPDATE_SNAPSHOT_CHART", snapshotId: sn.id, chartPts: pts });
              }
            } else { setChartError("No price data found for this date range."); }
          } else { setChartError("Could not fetch price history. Check ticker or internet connection."); }
        } catch (e) { setChartError("Fetch failed. Try again later."); }
        setLoadingChart(false);
      },
      style: {
        display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7,
        cursor: loadingChart ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600,
        fontFamily: "var(--font-body)", border: "1px solid rgba(109,40,217,.35)",
        background: loadingChart ? "var(--bg5)" : "rgba(109,40,217,.08)", color: "#6d28d9",
        opacity: loadingChart ? 0.6 : 1
      }
    },
      loadingChart ? React.createElement(React.Fragment, null, React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite" } }, Ico.refresh(14)), " Fetching\u2026")
        : React.createElement(React.Fragment, null, "\u{1F4C8} Load Chart")
    )
  );
  return null;
};

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Portfolio Management
   ══════════════════════════════════════════════════════════════════════════ */
function PortfolioPage({ holdings, setHoldings, prices, navigate, saveSnapshot, refreshPrices, setSoldShareSnapshots }) {
  const DF = window.OHLCVFetcher;
  const TI = window.TechIndicators;
  const [showAdd, setShowAdd] = useState(false);
  const [editShare, setEditShare] = useState(null);
  const [mode, setMode] = useState("active"); /* "active" | "past" */
  const [analyzingTicker, setAnalyzingTicker] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({
    company: "", ticker: "", qty: "", buyPrice: "", currentPrice: "",
    buyDate: TODAY(), sellDate: "", sellPrice: "",
    brokerage: "", notes: "", entryScore: "", sector: "Technology"
  });
  const [exitInfo, setExitInfo] = useState({});

  /* ── Golden exit + Session Confidence detector: per holding, run the exit guard
        on daily data (surfacing the E1 up-spike bonus) and the intraday Confidence
        Score on 15m data (how confident we are of tagging the 4% target today). ── */
  useEffect(() => {
    if (!holdings || holdings.length === 0) { setExitInfo({}); return; }
    if (!DF) return;
    let cancelled = false;
    setExitInfo({});
    holdings.forEach((h) => {
      const ticker = String(h.ticker || "").toUpperCase();
      if (!ticker) return;
      Promise.all([DF.fetchOHLCVCached(ticker, "daily"), DF.fetchOHLCVCached("^NSEI", "daily"), DF.fetchOHLCVCached(ticker, "15m")])
        .then((res) => {
          if (cancelled) return;
          const d = res[0] && res[0].data;
          const idxD = res[1] && res[1].data;
          const i15 = res[2] && res[2].data;
          if (!d || d.length < 50) return;
          const buyD = h.buyDate ? new Date(h.buyDate + "T12:00:00") : null;
          const holdingDays = buyD ? Math.max(0, Math.floor((Date.now() - buyD.getTime()) / 86400000)) : 0;
          const entry = h.buyPrice || h.avgPrice || 0;
          const pos = { entry_price: entry, holding_days: holdingDays, entry_score: h.entryScore != null ? h.entryScore : 50 };
          const resX = TI.computeExitScore(d, pos, idxD);
          let golden = null;
          if (resX && resX.bonus_items) {
            for (let i = 0; i < resX.bonus_items.length; i++) {
              const it = resX.bonus_items[i];
              if (it.reason === "Golden exit opportunity (spike near 4% target)" || it.reason === "Spike toward 4% target") {
                golden = { amount: it.amount, reason: it.reason, exit_score: resX.exit_score };
                break;
              }
            }
          }
          const conf = TI.computeSessionConfidence(i15, d, { entry_price: entry, target_pct: 4 });
          const update = { golden: golden, conf: conf };
          if (golden || (conf && conf.confidence != null)) {
            setExitInfo((prev) => { const next = Object.assign({}, prev); next[h.id] = update; return next; });
          }
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [holdings]);

  const resetForm = () => {
    setForm({ company: "", ticker: "", qty: "", buyPrice: "", currentPrice: "", buyDate: TODAY(), sellDate: "", sellPrice: "", brokerage: "", notes: "", entryScore: "", sector: "Technology" });
    setMode("active");
  };

  const handleAdd = async () => {
    if (!form.ticker || !form.qty || !form.buyPrice) { showToast("Please fill ticker, quantity and buy price"); return; }
    const ticker = form.ticker.toUpperCase();
    const qty = parseFloat(form.qty);
    const buyPrice = parseFloat(form.buyPrice);

    /* ── Past trade mode: log directly to Trade History snapshots, not holdings ── */
    if (mode === "past") {
      if (!form.sellDate) { showToast("Please fill date of selling"); return; }
      const sellPrice = parseFloat(form.sellPrice) || buyPrice;
      const costBasis = qty * buyPrice;
      const currentVal = qty * sellPrice;
      const pnl = currentVal - costBasis;
      const snap = {
        id: uid(),
        savedAt: form.sellDate,
        company: form.company || ticker,
        ticker: ticker,
        qty: qty,
        buyPrice: buyPrice,
        buyDate: form.buyDate || "",
        sellPrice: sellPrice,
        currentVal: currentVal,
        costBasis: costBasis,
        pnl: pnl,
        pnlPct: costBasis > 0 ? ((pnl / costBasis) * 100) : 0,
        brokerage: parseFloat(form.brokerage) || 0,
        sector: form.sector,
        entryScore: form.entryScore ? parseFloat(form.entryScore) : null,
        notes: form.notes || "",
        priceTs: Date.now(),
        chartPts: []
      };
      await saveSnapshot(snap);
      if (form.buyDate) {
        fetchHistoricalPrices(ticker, form.buyDate).then(pts => {
          if (pts && pts.length >= 2) {
            const chartData = pts.filter(p => p.date <= form.sellDate).map(p => ({ date: p.date, close: p.close }));
            if (chartData.length >= 2) {
              const updatedSnap = { ...snap, chartPts: chartData };
              const fyKey = getFYKey(snap.savedAt);
              setSoldShareSnapshots(prev => {
                const snaps = (prev[fyKey] || []).map(s => s.id === snap.id ? updatedSnap : s);
                const updated = { ...prev, [fyKey]: snaps };
                persistSnapshots(updated);
                return updated;
              });
            }
          }
        }).catch(() => {});
      }
      resetForm();
      setShowAdd(false);
      showToast(ticker + " saved to Trade History");
      return;
    }

    const holding = {
      id: uid(),
      ticker: ticker,
      company: form.company || ticker,
      qty: qty,
      buyPrice: buyPrice,
      avgPrice: buyPrice,
      currentPrice: parseFloat(form.currentPrice) || buyPrice,
      sector: form.sector,
      buyDate: form.buyDate || TODAY(),
      brokerage: parseFloat(form.brokerage) || 0,
      notes: form.notes || "",
      entryScore: form.entryScore ? parseFloat(form.entryScore) : null,
      priceTs: Date.now(),
      createdAt: Date.now()
    };
    await dbPut("holdings", holding);
    setHoldings((prev) => [...prev, holding]);
    resetForm();
    setShowAdd(false);
    showToast(ticker + " added to portfolio");
  };

  const handleEdit = async () => {
    if (!editShare) return;
    const updated = {
      ...editShare,
      ticker: (editShare.ticker || "").toUpperCase(),
      company: (editShare.company || "").trim(),
      qty: parseFloat(editShare.qty) || 0,
      buyPrice: parseFloat(editShare.buyPrice) || 0,
      avgPrice: parseFloat(editShare.buyPrice) || 0,
      currentPrice: parseFloat(editShare.currentPrice) || 0,
      brokerage: parseFloat(editShare.brokerage) || 0,
      entryScore: editShare.entryScore ? parseFloat(editShare.entryScore) : null,
    };
    await dbPut("holdings", updated);
    setHoldings((prev) => prev.map((h) => h.id === updated.id ? updated : h));
    setEditShare(null);
    showToast(updated.ticker + " updated");
  };

  const handleDelete = async (id) => {
    await dbDelete("holdings", id);
    setHoldings((prev) => prev.filter((h) => h.id !== id));
    showToast("Holding removed");
  };

  const f = form; /* shorthand */

  return React.createElement("div", null,
    /* ── Inline analysis view ── */
    analyzingTicker && React.createElement(StockAnalysis, {
      ticker: analyzingTicker,
      prices,
      holdings,
      onBack: () => setAnalyzingTicker(null)
    }),

    /* ── Portfolio view (hidden when analyzing) ── */
    !analyzingTicker && React.createElement(React.Fragment, null,

    /* ── Header ── */
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "PORTFOLIO"),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Active Holdings"),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", marginTop: 2 } }, holdings.length + " position" + (holdings.length !== 1 ? "s" : "") + " \u00b7 " + TODAY())
      ),
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        React.createElement("button", {
          className: "stx-btn stx-btn-ghost",
          disabled: refreshing,
          onClick: async function() { setRefreshing(true); try { await refreshPrices(); } catch(e) {} setRefreshing(false); showToast("Prices updated"); },
          style: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 12px", borderRadius: 8 }
        }, React.createElement("span", { style: { display: "inline-block", animation: refreshing ? "screener-spin .8s linear infinite" : "none" } }, Icons.refresh(14)), refreshing ? "..." : "Refresh"),
        React.createElement("button", { className: "stx-btn stx-btn-primary", onClick: () => { setShowAdd(true); resetForm(); } }, "+ Add Holding")
      )
    ),

    /* ── Summary stats row ── */
    holdings.length > 0 && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 } },
      React.createElement(StatCard, {
        label: "Total Invested",
        value: INR(holdings.reduce((s, h) => s + ((h.buyPrice || h.avgPrice || 0) * h.qty), 0)),
        color: "var(--info)"
      }),
      React.createElement(StatCard, {
        label: "Current Value",
        value: INR(holdings.reduce((s, h) => {
          const p = prices[h.ticker]?.price || h.currentPrice || h.buyPrice || h.avgPrice || 0;
          return s + (p * h.qty);
        }, 0)),
        color: "var(--accent)"
      }),
      (() => {
        const invested = holdings.reduce((s, h) => s + ((h.buyPrice || h.avgPrice || 0) * h.qty), 0);
        const current = holdings.reduce((s, h) => {
          const p = prices[h.ticker]?.price || h.currentPrice || h.buyPrice || h.avgPrice || 0;
          return s + (p * h.qty);
        }, 0);
        const pnl = current - invested;
        const pnlPct = invested > 0 ? ((pnl / invested) * 100) : 0;
        return React.createElement(StatCard, {
          label: "Total P&L",
          value: (pnl >= 0 ? "+" : "") + INR(pnl),
          sub: (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(2) + "%",
          color: pnl >= 0 ? "var(--profit)" : "var(--loss)"
        });
      })(),
      React.createElement(StatCard, {
        label: "Holdings",
        value: holdings.length.toString(),
        sub: holdings.filter((h) => { const cg = capitalGainsInfo(h.buyDate); return cg && cg.isLT; }).length + " long-term",
        color: "var(--warn)"
      })
    ),

    /* ── Add Share Modal ── */
    showAdd && React.createElement("div", { className: "modal-bd", onClick: (e) => { if (e.target === e.currentTarget) { setShowAdd(false); resetForm(); } } },
      React.createElement("div", { className: "stx-card stx-fu", style: { maxWidth: 520, margin: "40px auto", width: "92vw" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement("h2", { style: { fontSize: 17, fontWeight: 700, fontFamily: "var(--font-heading)" } }, "Add Share"),
          React.createElement("button", { onClick: () => { setShowAdd(false); resetForm(); }, style: { background: "transparent", border: "none", color: "var(--text5)", cursor: "pointer", display: "inline-flex" } }, Ico.x(20))
        ),

        /* ── Mode toggle: Active holding vs Past trade ── */
        React.createElement("div", { style: { display: "flex", borderRadius: 9, overflow: "hidden", border: "1px solid var(--border2)", marginBottom: 16 } },
          React.createElement("button", {
            onClick: () => setMode("active"),
            style: { flex: 1, padding: "8px 10px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", transition: "all .15s", background: mode === "active" ? "var(--accent)" : "var(--bg4)", color: mode === "active" ? "#fff" : "var(--text5)" }
          }, Icons.briefcase(13), " Active Holding"),
          React.createElement("button", {
            onClick: () => setMode("past"),
            style: { flex: 1, padding: "8px 10px", border: "none", borderLeft: "1px solid var(--border2)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", transition: "all .15s", background: mode === "past" ? "#6d28d9" : "var(--bg4)", color: mode === "past" ? "#fff" : "var(--text5)" }
          }, Icons.clock(12), " Past Trade (Sold)")
        ),

        /* ── Common fields ── */
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Company Name"),
            React.createElement("input", { className: "inp", placeholder: "e.g. Reliance Industries", value: f.company, onChange: (e) => setForm({ ...form, company: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Ticker Symbol *"),
            React.createElement("input", { className: "inp", placeholder: "e.g. RELIANCE", value: f.ticker, onChange: (e) => setForm({ ...form, ticker: e.target.value.toUpperCase() }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Quantity *"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0", value: f.qty, onChange: (e) => setForm({ ...form, qty: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Buy Price (\u20b9) *"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0", value: f.buyPrice, onChange: (e) => setForm({ ...form, buyPrice: e.target.value }) })
          )
        ),

        /* ── Active holding: Acquisition date + current price ── */
        mode === "active" && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Acquisition"),
            React.createElement("input", { className: "inp", type: "date", value: f.buyDate, onChange: (e) => setForm({ ...form, buyDate: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Current Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0", value: f.currentPrice, onChange: (e) => setForm({ ...form, currentPrice: e.target.value }) })
          )
        ),

        /* ── Past trade: sell date + sell price ── */
        mode === "past" && React.createElement(React.Fragment, null,
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 } },
            React.createElement("div", null,
              React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Acquisition"),
              React.createElement("input", { className: "inp", type: "date", value: f.buyDate, onChange: (e) => setForm({ ...form, buyDate: e.target.value }) })
            ),
            React.createElement("div", null,
              React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Selling"),
              React.createElement("input", { className: "inp", type: "date", value: f.sellDate, max: TODAY(), onChange: (e) => setForm({ ...form, sellDate: e.target.value }) })
            )
          ),
          React.createElement("div", { style: { marginTop: 12 } },
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Sell Price (\u20b9 per share)"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0", value: f.sellPrice, onChange: (e) => setForm({ ...form, sellPrice: e.target.value }) })
          ),
          /* P&L preview */
          (f.qty && f.buyPrice && f.sellPrice) && (() => {
            const pnlPreview = (+f.sellPrice - +f.buyPrice) * +f.qty;
            const pnlPctPreview = +f.buyPrice > 0 ? ((+f.sellPrice - +f.buyPrice) / +f.buyPrice * 100) : 0;
            const isG = pnlPreview >= 0;
            return React.createElement("div", {
              style: { padding: "8px 12px", borderRadius: 8, marginTop: 12, background: isG ? "var(--profitbg)" : "var(--lossbg)", border: "1px solid " + (isG ? "var(--profitborder)" : "var(--lossborder)"), display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }
            },
              React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", fontWeight: 600 } }, isG ? React.createElement(React.Fragment, null, Ico.triangleUp(10, "var(--profit)"), " Profit") : React.createElement(React.Fragment, null, Ico.triangleDown(10, "var(--loss)"), " Loss")),
              React.createElement("span", { style: { fontWeight: 700, color: isG ? "var(--profit)" : "var(--loss)", fontFamily: "var(--font-heading)", fontSize: 14 } }, (isG ? "+" : "") + INR(pnlPreview)),
              React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isG ? "+" : "") + pnlPctPreview.toFixed(2) + "%")
            );
          })()
        ),

        /* ── Extra fields ── */
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Sector"),
            React.createElement("select", { className: "inp", value: f.sector, onChange: (e) => setForm({ ...form, sector: e.target.value }) },
              SECTORS.map((s) => React.createElement("option", { key: s, value: s }, s))
            )
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Brokerage / Fees (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", placeholder: "0 (optional)", value: f.brokerage, onChange: (e) => setForm({ ...form, brokerage: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Entry Score (0\u2013100)"),
            React.createElement("input", { className: "inp", type: "number", min: "0", max: "100", placeholder: "0 (optional)", value: f.entryScore, onChange: (e) => setForm({ ...form, entryScore: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Notes"),
            React.createElement("input", { className: "inp", placeholder: "Broker, strategy notes\u2026", value: f.notes, onChange: (e) => setForm({ ...form, notes: e.target.value }) })
          )
        ),

        /* ── Action buttons ── */
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 16 } },
          React.createElement("button", { className: "stx-btn stx-btn-primary", style: { flex: 1 }, onClick: handleAdd }, mode === "active" ? "Add Share" : "Save to Previous Trades"),
          React.createElement("button", { className: "stx-btn stx-btn-ghost", onClick: () => { setShowAdd(false); resetForm(); } }, "Cancel")
        )
      )
    ),

    /* ── Edit Share Modal ── */
    editShare && React.createElement("div", { className: "modal-bd", onClick: (e) => { if (e.target === e.currentTarget) setEditShare(null); } },
      React.createElement("div", { className: "stx-card stx-fu", style: { maxWidth: 520, margin: "40px auto", width: "92vw" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement("h2", { style: { fontSize: 17, fontWeight: 700, fontFamily: "var(--font-heading)" } }, "Edit Holding"),
          React.createElement("button", { onClick: () => setEditShare(null), style: { background: "transparent", border: "none", color: "var(--text5)", cursor: "pointer", display: "inline-flex" } }, Ico.x(20))
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Company Name"),
            React.createElement("input", { className: "inp", value: editShare.company || "", onChange: (e) => setEditShare({ ...editShare, company: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Ticker Symbol"),
            React.createElement("input", { className: "inp", value: editShare.ticker || "", onChange: (e) => setEditShare({ ...editShare, ticker: e.target.value.toUpperCase() }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Quantity"),
            React.createElement("input", { className: "inp", type: "number", value: editShare.qty, onChange: (e) => setEditShare({ ...editShare, qty: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Buy Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editShare.buyPrice, onChange: (e) => setEditShare({ ...editShare, buyPrice: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Current Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editShare.currentPrice, onChange: (e) => setEditShare({ ...editShare, currentPrice: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Acquisition"),
            React.createElement("input", { className: "inp", type: "date", value: editShare.buyDate || "", onChange: (e) => setEditShare({ ...editShare, buyDate: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Brokerage / Fees (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editShare.brokerage || "", onChange: (e) => setEditShare({ ...editShare, brokerage: e.target.value }) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Entry Score (0\u2013100)"),
            React.createElement("input", { className: "inp", type: "number", min: "0", max: "100", placeholder: "0", value: editShare.entryScore || "", onChange: (e) => setEditShare({ ...editShare, entryScore: e.target.value }) })
          )
        ),
        React.createElement("div", { style: { marginTop: 12 } },
          React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Notes"),
          React.createElement("textarea", { className: "inp", value: editShare.notes || "", onChange: (e) => setEditShare({ ...editShare, notes: e.target.value }), placeholder: "Broker, target price, holding notes\u2026", style: { resize: "vertical", minHeight: 60, lineHeight: 1.6, fontSize: 12 } })
        ),
        /* P&L preview */
        editShare.qty && editShare.buyPrice && editShare.currentPrice && (() => {
          const pnl = (+editShare.currentPrice - +editShare.buyPrice) * (+editShare.qty);
          const pnlPct = +editShare.buyPrice > 0 ? ((+editShare.currentPrice - +editShare.buyPrice) / +editShare.buyPrice * 100) : 0;
          const isG = pnl >= 0;
          return React.createElement("div", { style: { padding: "8px 12px", borderRadius: 8, marginTop: 12, background: isG ? "var(--profitbg)" : "var(--lossbg)", border: "1px solid " + (isG ? "var(--profitborder)" : "var(--lossborder)"), display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 } },
            React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", fontWeight: 600 } }, isG ? React.createElement(React.Fragment, null, Ico.triangleUp(10, "var(--profit)"), " Profit") : React.createElement(React.Fragment, null, Ico.triangleDown(10, "var(--loss)"), " Loss")),
            React.createElement("span", { style: { fontWeight: 700, color: isG ? "var(--profit)" : "var(--loss)", fontFamily: "var(--font-heading)", fontSize: 14 } }, (isG ? "+" : "") + INR(pnl)),
            React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isG ? "+" : "") + pnlPct.toFixed(2) + "%")
          );
        })(),
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
          React.createElement("button", { className: "stx-btn stx-btn-primary", style: { flex: 1 }, onClick: handleEdit }, "Save Changes"),
          React.createElement("button", { className: "stx-btn stx-btn-ghost", onClick: () => setEditShare(null) }, "Cancel")
        )
      )
    ),

    /* ── Holdings card grid ── */
    holdings.length > 0
      ? React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 } },
          holdings.map((h) => {
            const livePrice = prices[h.ticker]?.price;
            const currentPrice = livePrice || h.currentPrice || h.buyPrice || h.avgPrice || 0;
            const currentVal = h.qty * currentPrice;
            const costBasis = h.qty * (h.buyPrice || h.avgPrice || 0);
            const pnl = currentVal - costBasis;
            const pnlPct = costBasis > 0 ? ((pnl / costBasis) * 100) : 0;
            const isGain = pnl >= 0;
            const priceDiff = currentPrice - (h.buyPrice || h.avgPrice || 0);
            const hasLivePrice = !!livePrice;
            const xirr = xirrSingleBuy(costBasis, currentVal, h.buyDate);
            const cg = capitalGainsInfo(h.buyDate);

            return React.createElement("div", { key: h.id, className: "stx-card", style: { animation: "stxFadeIn .35s ease both" } },

              /* ── Header: company + ticker + market value ── */
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 } },
                React.createElement("div", null,
                  React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4, lineHeight: 1.3 } }, h.company || h.ticker),
                  React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
                    React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: "var(--r-pill)", fontSize: 11, fontWeight: 600, background: "var(--infobg)", border: "1px solid var(--infoborder)", color: "var(--info)" } }, h.ticker),
                     hasLivePrice && React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: "var(--profitbg)", color: "var(--profit)", border: "1px solid var(--profitborder)", display: "inline-flex", alignItems: "center", gap: 3 } }, Ico.dot(6, "var(--profit)"), " LIVE"),
                    h.buyDate && React.createElement("span", { style: { fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)" } }, "since " + h.buyDate)
                  )
                ),
                React.createElement("div", { style: { textAlign: "right" } },
                  React.createElement("div", { style: { fontSize: 18, fontFamily: "var(--font-heading)", fontWeight: 800, color: "var(--accent)" } }, INR(currentVal)),
                  React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 1 } }, h.qty + " shares" + (h.sector ? " \u00b7 " + h.sector : ""))
                )
              ),

              /* ── Buy price vs Current price ── */
              React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderRadius: 9, overflow: "hidden", marginBottom: 10, border: "1px solid var(--border)" } },
                React.createElement("div", { style: { padding: "9px 12px", background: "var(--bg5)" } },
                  React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, "Buy Price"),
                  React.createElement("div", { style: { fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text3)" } }, "\u20b9" + Number(h.buyPrice || h.avgPrice || 0).toLocaleString("en-IN"))
                ),
                React.createElement("div", { style: { padding: "9px 12px", background: "var(--bg4)", textAlign: "right" } },
                  React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, hasLivePrice ? "Live Price" : "Current Price"),
                  React.createElement("div", { style: { fontSize: 15, fontWeight: 700, fontFamily: "var(--font-heading)", color: isGain ? "var(--profit)" : "var(--loss)" } }, "\u20b9" + Number(currentPrice).toLocaleString("en-IN"))
                )
              ),

              /* ── P&L box ── */
              React.createElement("div", { style: {
                padding: "10px 13px", borderRadius: 9, marginBottom: 10,
                background: isGain ? "var(--profitbg)" : "var(--lossbg)",
                border: "1px solid " + (isGain ? "var(--profitborder)" : "var(--lossborder)")
              } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                   React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: isGain ? "var(--profit)" : "var(--loss)", display: "inline-flex", alignItems: "center", gap: 3 } }, isGain ? Ico.triangleUp(10, "var(--profit)") : Ico.triangleDown(10, "var(--loss)"), " ", isGain ? "Profit" : "Loss"),
                  React.createElement("div", { style: { textAlign: "right" } },
                    React.createElement("div", { style: { fontSize: 16, fontFamily: "var(--font-heading)", fontWeight: 800, color: isGain ? "var(--profit)" : "var(--loss)" } }, (isGain ? "+" : "") + INR(pnl)),
                    React.createElement("div", { style: { fontSize: 11, color: isGain ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isGain ? "+" : "") + pnlPct.toFixed(2) + "% \u00b7 \u20b9" + (priceDiff >= 0 ? "+" : "") + Number(priceDiff).toFixed(2) + " per share")
                  )
                ),
                /* XIRR row */
                xirr !== null && React.createElement("div", { style: {
                  marginTop: 7, paddingTop: 7, borderTop: "1px solid " + (isGain ? "var(--profitborder)" : "var(--lossborder)"),
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                } },
                  React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", fontWeight: 600 } }, "XIRR (annualised)"),
                  React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: xirr >= 0 ? "var(--profit)" : "var(--loss)" } }, (xirr >= 0 ? "+" : "") + xirr.toFixed(2) + "% p.a.")
                )
              ),

              /* ── Capital Gains classification ── */
              cg && React.createElement("div", { style: {
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 10px", borderRadius: 7, marginBottom: 8,
                background: cg.isLT ? "var(--profitbg)" : "var(--warnbg)",
                border: "1px solid " + (cg.isLT ? "var(--profitborder)" : "var(--warnborder)")
              } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
                  React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: cg.isLT ? "var(--profit)" : "var(--warn)", color: "#fff" } }, cg.cgType),
                  React.createElement("span", { style: { fontSize: 11, color: "var(--text4)" } }, "held " + cg.daysHeld + " days \u00b7 " + cg.taxRate + " tax rate")
                ),
                !cg.isLT && cg.daysToLT > 0 && React.createElement("span", { style: { fontSize: 10, color: "var(--warn)", fontWeight: 600 } }, cg.daysToLT + "d to LTCG"),
                cg.isLT && pnl > 0 && React.createElement("span", { style: { fontSize: 10, color: "var(--profit)", fontWeight: 600 } }, "LTCG: " + INR(Math.round(pnl)))
              ),

              /* ── Entry score badge ── */
              h.entryScore != null && h.entryScore > 0 && React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 } },
                React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, "Entry Score:"),
                React.createElement("span", { style: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: h.entryScore >= 70 ? "var(--profitbg)" : h.entryScore >= 40 ? "var(--warnbg)" : "var(--lossbg)", color: h.entryScore >= 70 ? "var(--profit)" : h.entryScore >= 40 ? "var(--warn)" : "var(--loss)", border: "1px solid " + (h.entryScore >= 70 ? "var(--profitborder)" : h.entryScore >= 40 ? "var(--warnborder)" : "var(--lossborder)") } }, h.entryScore + "/100")
              ),

              /* ── Golden exit callout (E1 up-spike near 4% target) ── */
              exitInfo[h.id] && exitInfo[h.id].golden && React.createElement("div", { style: {
                display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                padding: "8px 12px", borderRadius: 8,
                background: "linear-gradient(90deg, rgba(251,191,36,.16), rgba(251,191,36,.04))",
                border: "1px solid rgba(251,191,36,.5)"
              } },
                React.createElement("span", { style: { fontSize: 13 } }, "\u2728"),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                  React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "#d97706" } },
                    exitInfo[h.id].golden.amount >= 5 ? "Golden Exit Opportunity" : "Spike Toward 4% Target"
                  ),
                  React.createElement("div", { style: { fontSize: 10.5, color: "var(--text5)", marginTop: 1, lineHeight: 1.4 } },
                    "Up-spike carrying this holding near the +4% target \u00b7 spikes often precede a sharp reversal \u2014 consider banking the gain"
                  )
                ),
                exitInfo[h.id].golden.exit_score != null && React.createElement("span", { style: { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(251,191,36,.18)", color: "#d97706", border: "1px solid rgba(251,191,36,.4)", whiteSpace: "nowrap" } }, "EXIT " + exitInfo[h.id].golden.exit_score)
              ),

              /* ── Session Confidence Score (reach +4% today, 2.0–4.0% profit band) ── */
              (function () {
                const ci = exitInfo[h.id] && exitInfo[h.id].conf;
                if (!ci || ci.confidence == null || !ci.flags || !ci.flags.inTargetBand) return null;
                const sc = ci.confidence;
                const tone = sc >= 70 ? { c: "#16a34a", bg: "var(--profitbg)", bd: "var(--profitborder)" } : sc >= 40 ? { c: "#d97706", bg: "var(--warnbg)", bd: "var(--warnborder)" } : { c: "#dc2626", bg: "var(--lossbg)", bd: "var(--lossborder)" };
                const label = sc >= 70 ? "Let it ride \u2014 strong chance of tagging +4% today" : sc >= 40 ? "Wait & watch \u2014 keep a tight stop" : "Low odds \u2014 bank the gain today";
                return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 12px", borderRadius: 8, background: tone.bg, border: "1px solid " + tone.bd } },
                  React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                    React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: tone.c } }, "Reach +4% today"),
                    React.createElement("div", { style: { fontSize: 10.5, color: "var(--text5)", marginTop: 1, lineHeight: 1.4 } }, label + (ci.components && ci.components.timeRemainingMin != null ? " \u00b7 " + ci.components.timeRemainingMin + " min left" : ""))
                  ),
                  React.createElement("div", { style: { fontSize: 17, fontWeight: 800, fontFamily: "var(--font-heading)", color: tone.c, whiteSpace: "nowrap" } }, sc + "/100")
                );
              })(),

              /* ── Notes preview ── */
              h.notes && React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 8, fontStyle: "italic" } }, h.notes),

              /* ── Action buttons ── */
              React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" } },
                React.createElement("button", {
                  onClick: () => setEditShare({ ...h, qty: String(h.qty || ""), buyPrice: String(h.buyPrice || h.avgPrice || ""), currentPrice: String(h.currentPrice || ""), brokerage: String(h.brokerage || 0) }),
                  style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--infoborder)", background: "var(--infobg)", color: "var(--info)", transition: "all .15s" },
                  title: "Edit this holding"
                }, Icons.edit(13), " Edit"),
                React.createElement("button", {
                  onClick: async () => {
                    const snapId = uid();
                    const liveP = prices[h.ticker]?.price || h.currentPrice || h.buyPrice || h.avgPrice || 0;
                    const snap = {
                      id: snapId,
                      savedAt: TODAY(),
                      company: h.company || h.ticker,
                      ticker: h.ticker,
                      qty: h.qty,
                      buyPrice: h.buyPrice || h.avgPrice || 0,
                      buyDate: h.buyDate || "",
                      sellPrice: liveP,
                      currentVal: h.qty * liveP,
                      costBasis: h.qty * (h.buyPrice || h.avgPrice || 0),
                      pnl: 0,
                      pnlPct: 0,
                      brokerage: h.brokerage || 0,
                      priceTs: Date.now(),
                      notes: h.notes || "",
                      chartPts: [],
                    };
                    snap.pnl = snap.currentVal - snap.costBasis;
                    snap.pnlPct = snap.costBasis > 0 ? ((snap.pnl / snap.costBasis) * 100) : 0;
                    saveSnapshot(snap);
                    showToast(h.ticker + " snapshot saved to Trade History");
                    if (h.buyDate) {
                      fetchHistoricalPrices(h.ticker, h.buyDate).then(pts => {
                        if (pts && pts.length >= 2) {
                          const chartData = pts.filter(p => p.date <= TODAY()).map(p => ({ date: p.date, close: p.close }));
                          if (chartData.length >= 2) {
                            const updatedSnap = { ...snap, chartPts: chartData };
                            const fyKey = getFYKey(snap.savedAt);
                            setSoldShareSnapshots(prev => {
                              const snaps = (prev[fyKey] || []).map(s => s.id === snapId ? updatedSnap : s);
                              const updated = { ...prev, [fyKey]: snaps };
                              persistSnapshots(updated);
                              return updated;
                            });
                          }
                        }
                      }).catch(() => {});
                    }
                  },
                  style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid rgba(109,40,217,.35)", background: "rgba(109,40,217,.08)", color: "#6d28d9", transition: "all .15s" },
                  title: "Save a snapshot of this holding to Trade History"
                }, Icons.save(13), " Save Snapshot"),
                React.createElement("button", {
                  onClick: async () => { if (await showConfirm("Remove " + h.ticker + " from portfolio?")) handleDelete(h.id); },
                  style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--lossborder)", background: "var(--lossbg)", color: "var(--loss)", transition: "all .15s" },
                  title: "Remove this holding"
                }, Icons.trash(13), " Remove"),
                React.createElement("button", {
                  onClick: async () => { try { await fetchSinglePrice(h.ticker); } catch(e) {} setAnalyzingTicker(h.ticker); },
                  style: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--accentborder)", background: "rgba(16,185,129,.08)", color: "var(--accent)", transition: "all .15s" },
                  title: "Analyze this stock"
                }, Icons.chart(13), " Analyze")
              ),
              React.createElement(HoldingHistoryPanel, { h: h, prices: prices }),
              React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", fontStyle: "italic", marginTop: 4 } }, "Save Snapshot captures current values to Trade History before selling")
            );
          })
        )
      : React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: "48px 24px" } },
          React.createElement("div", { style: { marginBottom: 16, opacity: 0.2 } }, Ico.folder(48, "var(--text5)")),
          React.createElement("h3", { style: { fontSize: 16, fontWeight: 700, color: "var(--text2)", marginBottom: 8 } }, "No Holdings Yet"),
          React.createElement("p", { style: { fontSize: 13, color: "var(--text5)", marginBottom: 20, maxWidth: 360, margin: "0 auto 20px" } }, "Add your first stock to start tracking your portfolio performance with live prices, P&L, and tax classification."),
          React.createElement("button", { className: "stx-btn stx-btn-primary", onClick: () => { setShowAdd(true); resetForm(); } }, "+ Add First Holding")
        )
    ) /* end Fragment */
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Trade History
   ══════════════════════════════════════════════════════════════════════════ */
function TradeHistoryPage({ soldShareSnapshots = {}, deleteSnapshot, editSnapshot, setSoldShareSnapshots }) {
  const fyKeys = Object.keys(soldShareSnapshots).sort().reverse();
  const [expanded, setExpanded] = useState({});
  const [monthExpanded, setMonthExpanded] = useState({});
  const [editSnap, setEditSnap] = useState(null);

  const exportTrades = () => {
    const payload = {
      app: "StoX",
      type: "trade-history",
      version: 1,
      exportDate: new Date().toISOString(),
      soldShareSnapshots: soldShareSnapshots
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stox-trades-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported " + totalSnapshots + " trade snapshot" + (totalSnapshots !== 1 ? "s" : ""), 3000);
  };

  const importTrades = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.type !== "trade-history" || !data.soldShareSnapshots || typeof data.soldShareSnapshots !== "object") {
          showToast("Invalid trade history file", 3000);
          return;
        }
        const importCount = Object.values(data.soldShareSnapshots).reduce((s, a) => s + a.length, 0);
        if (!await showConfirm("Import " + importCount + " trade snapshot" + (importCount !== 1 ? "s" : "") + "?\nExisting snapshots with the same ID will be replaced.")) return;
        const merged = {};
        Object.keys(soldShareSnapshots).forEach(fy => { merged[fy] = [...soldShareSnapshots[fy]]; });
        Object.keys(data.soldShareSnapshots).forEach(fy => {
          const existing = merged[fy] || [];
          const imported = data.soldShareSnapshots[fy] || [];
          const snapMap = {};
          existing.forEach(s => { snapMap[s.id] = s; });
          imported.forEach(s => { snapMap[s.id] = s; });
          merged[fy] = Object.values(snapMap);
        });
        setSoldShareSnapshots(merged);
        persistSnapshots(merged);
        showToast("Imported " + importCount + " trade snapshot" + (importCount !== 1 ? "s" : ""), 3000);
      } catch (err) {
        showToast("Import failed: " + err.message, 5000);
      }
    };
    input.click();
  };

  const toggleFY = (fy) => setExpanded((p) => ({ ...p, [fy]: !p[fy] }));
  const toggleMonth = (mk) => setMonthExpanded((p) => ({ ...p, [mk]: !p[mk] }));
  const expandAll = () => {
    const c = {};
    fyKeys.forEach((fy) => {
      c[fy] = true;
      const snaps = soldShareSnapshots[fy] || [];
      snaps.forEach((sn) => {
        const d = new Date(sn.savedAt + "T12:00:00");
        const mk = fy + "-" + d.toLocaleString("en-IN", { month: "long" });
        c[mk] = true;
      });
    });
    setExpanded(c);
    setMonthExpanded(c);
  };
  const collapseAll = () => { setExpanded({}); setMonthExpanded({}); };

  const saveEditedSnapshot = () => {
    if (!editSnap) return;
    const { fyKey: _editFyKey, ...snapData } = editSnap;
    const qty = +editSnap.qty || 0;
    const buyPrice = +editSnap.buyPrice || 0;
    const sellPrice = +editSnap.sellPrice || 0;
    const costBasis = qty * buyPrice;
    const currentVal = qty * sellPrice;
    const pnl = currentVal - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    editSnapshot(_editFyKey, {
      ...snapData,
      company: (editSnap.company || "").trim(),
      ticker: (editSnap.ticker || "").trim().toUpperCase(),
      qty, buyPrice, sellPrice, currentVal, costBasis, pnl, pnlPct,
      brokerage: +editSnap.brokerage || 0,
      savedAt: editSnap.savedAt || TODAY(),
      buyDate: editSnap.buyDate || "",
      notes: editSnap.notes || "",
    });
    setEditSnap(null);
  };

  const totalSnapshots = fyKeys.reduce((s, fy) => s + (soldShareSnapshots[fy] || []).length, 0);

  if (!fyKeys.length) {
  return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "#6d28d9", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "TRADE HISTORY"),
          React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Previous Trades")
        )
      ),
      React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: "48px 24px" } },
        React.createElement("div", { style: { width: 60, height: 60, borderRadius: 16, background: "rgba(109,40,217,.1)", border: "1px solid rgba(109,40,217,.25)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 } }, Icons.save(28)),
        React.createElement("h3", { style: { fontSize: 16, fontWeight: 700, color: "var(--text2)", marginBottom: 8 } }, "No Trade Snapshots"),
        React.createElement("p", { style: { fontSize: 13, color: "var(--text5)", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" } }, "Go to Portfolio \u2192 click \"Save Snapshot\" on any active holding to capture its current values as a historical record here."),
        React.createElement("button", { onClick: importTrades, className: "stx-btn", style: { fontSize: 11, padding: "8px 16px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)" } }, React.createElement(React.Fragment, null, Ico.upload(11), " Import from JSON"))
      )
    );
  }

  return React.createElement("div", null,
    /* ── Header ── */
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "#6d28d9", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "TRADE HISTORY"),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Previous Trades"),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", marginTop: 2 } }, totalSnapshots + " snapshot" + (totalSnapshots !== 1 ? "s" : "") + " across " + fyKeys.length + " financial year" + (fyKeys.length !== 1 ? "s" : ""))
      ),
      React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
        React.createElement("button", { onClick: exportTrades, className: "stx-btn", style: { fontSize: 10, padding: "5px 10px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)" } }, React.createElement(React.Fragment, null, Ico.download(10), " Export")),
        React.createElement("button", { onClick: importTrades, className: "stx-btn", style: { fontSize: 10, padding: "5px 10px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)" } }, React.createElement(React.Fragment, null, Ico.upload(10), " Import")),
        React.createElement("button", { onClick: expandAll, className: "stx-btn stx-btn-ghost", style: { fontSize: 11, padding: "5px 10px" } }, "Expand All"),
        React.createElement("button", { onClick: collapseAll, className: "stx-btn stx-btn-ghost", style: { fontSize: 11, padding: "5px 10px" } }, "Collapse All")
      )
    ),

    /* ── FY groups ── */
    fyKeys.map((fy) => {
      const snaps = soldShareSnapshots[fy] || [];
      if (!snaps.length) return null;
      const isCollapsedFY = !expanded[fy];
      const totalPnl = snaps.reduce((s, sn) => s + sn.pnl, 0);
      const totalCost = snaps.reduce((s, sn) => s + sn.costBasis, 0);

      return React.createElement("div", { key: fy, style: { marginBottom: 24 } },
        /* ── FY header row ── */
        React.createElement("div", {
          onClick: () => toggleFY(fy),
          style: {
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderRadius: 10, marginBottom: isCollapsedFY ? 0 : 14, cursor: "pointer",
            background: "var(--bg4)", border: "1px solid var(--border2)", transition: "all .15s",
          }
        },
          React.createElement("span", { style: { color: "var(--text6)", transition: "transform .2s", display: "inline-flex", transform: isCollapsedFY ? "rotate(-90deg)" : "rotate(0deg)" } }, Ico.chevronDown(14)),
          React.createElement("span", { style: { fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 700, color: "var(--text)", flex: 1 } }, fy),
          React.createElement("span", { style: { fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "rgba(109,40,217,.1)", color: "#6d28d9", border: "1px solid rgba(109,40,217,.2)", fontWeight: 600 } }, snaps.length + " trade" + (snaps.length !== 1 ? "s" : "")),
          totalCost > 0 && React.createElement("span", { style: { fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 8, background: totalPnl >= 0 ? "var(--profitbg)" : "var(--lossbg)", color: totalPnl >= 0 ? "var(--profit)" : "var(--loss)", border: "1px solid " + (totalPnl >= 0 ? "var(--profitborder)" : "var(--lossborder)") } }, "Net P&L: " + (totalPnl >= 0 ? "+" : "") + INR(totalPnl))
        ),

        /* ── Month groups ── */
        !isCollapsedFY && (() => {
          const monthGroups = {};
          snaps.forEach((sn) => {
            const d = new Date(sn.savedAt + "T12:00:00");
            const mKey = fy + "-" + d.toLocaleString("en-IN", { month: "long" });
            const mLabel = d.toLocaleString("en-IN", { month: "long", year: "numeric" });
            if (!monthGroups[mKey]) monthGroups[mKey] = { label: mLabel, snaps: [] };
            monthGroups[mKey].snaps.push(sn);
          });
          const mKeys = Object.keys(monthGroups).sort((a, b) => {
            const aD = new Date(monthGroups[a].snaps[0].savedAt + "T12:00:00");
            const bD = new Date(monthGroups[b].snaps[0].savedAt + "T12:00:00");
            return bD - aD;
          });

          return mKeys.map((mk) => {
            const mg = monthGroups[mk];
            const mIsCollapsed = !monthExpanded[mk];
            const mPnl = mg.snaps.reduce((s, sn) => s + sn.pnl, 0);

            return React.createElement("div", { key: mk, style: { marginBottom: 12, marginLeft: 12, borderLeft: "2px solid var(--border2)", paddingLeft: 12 } },
              /* ── Month header ── */
              React.createElement("div", {
                onClick: () => toggleMonth(mk),
                style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, marginBottom: mIsCollapsed ? 0 : 8, cursor: "pointer", background: "var(--bg5)", border: "1px solid var(--border)", transition: "all .15s" }
              },
                React.createElement("span", { style: { color: "var(--text6)", transition: "transform .2s", display: "inline-flex", transform: mIsCollapsed ? "rotate(-90deg)" : "rotate(0deg)" } }, Ico.chevronDown(10)),
                React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--text3)", flex: 1 } }, mg.label),
                React.createElement("span", { style: { fontSize: 10, padding: "2px 7px", borderRadius: 7, background: "rgba(109,40,217,.08)", color: "#6d28d9", border: "1px solid rgba(109,40,217,.15)", fontWeight: 600 } }, mg.snaps.length + " trade" + (mg.snaps.length !== 1 ? "s" : "")),
                React.createElement("span", { style: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 7, background: mPnl >= 0 ? "var(--profitbg)" : "var(--lossbg)", color: mPnl >= 0 ? "var(--profit)" : "var(--loss)", border: "1px solid " + (mPnl >= 0 ? "var(--profitborder)" : "var(--lossborder)") } }, (mPnl >= 0 ? "+" : "") + INR(mPnl))
              ),

              /* ── Snapshot cards ── */
              !mIsCollapsed && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 } },
                mg.snaps.map((sn, idx) => {
                  const isGain = sn.pnl >= 0;
                  const priceDiff = sn.sellPrice - sn.buyPrice;
                  const buyD = sn.buyDate ? new Date(sn.buyDate + "T12:00:00") : null;
                  const sellD = new Date(sn.savedAt + "T12:00:00");
                  const daysHeld = buyD ? Math.floor((sellD - buyD) / 86400000) : null;
                  const isLT = daysHeld !== null && daysHeld > 365;
                  const cgType = isLT ? "LTCG" : "STCG";
                  const taxRate = isLT ? "12.5%" : "20%";
                  const estTax = isLT ? Math.max(0, (sn.pnl - 100000) * 0.125) * 1.04 : sn.pnl > 0 ? sn.pnl * 0.20 * 1.04 : 0;

                  return React.createElement("div", { key: sn.id || idx, className: "stx-card", style: { border: "1px solid " + (isGain ? "var(--profitborder)" : "var(--lossborder)"), position: "relative", overflow: "hidden" } },
                    /* Snapshot badge */
                    React.createElement("div", { style: { position: "absolute", top: 10, right: 10, fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(109,40,217,.12)", color: "#6d28d9", border: "1px solid rgba(109,40,217,.25)", textTransform: "uppercase", letterSpacing: 0.5 } }, "Snapshot \u00b7 " + sn.savedAt),

                    /* Company + ticker */
                    React.createElement("div", { style: { marginBottom: 10 } },
                      React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4, paddingRight: 100 } }, sn.company),
                      React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
                        React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: "var(--r-pill)", fontSize: 11, fontWeight: 600, background: "var(--infobg)", border: "1px solid var(--infoborder)", color: "var(--info)" } }, sn.ticker || "\u2014"),
                        sn.buyDate && React.createElement("span", { style: { fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: "var(--accentbg2)", color: "var(--text5)", border: "1px solid var(--border2)" } }, "bought " + sn.buyDate)
                      )
                    ),

                    /* Price grid: Buy vs Sell */
                    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderRadius: 9, overflow: "hidden", marginBottom: 10, border: "1px solid var(--border)" } },
                      React.createElement("div", { style: { padding: "9px 12px", background: "var(--bg5)" } },
                        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, "Buy Price"),
                        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text3)" } }, "\u20b9" + Number(sn.buyPrice).toLocaleString("en-IN"))
                      ),
                      React.createElement("div", { style: { padding: "9px 12px", background: "var(--bg4)", textAlign: "right" } },
                        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, "Sell / Snapshot Price"),
                        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-heading)", color: isGain ? "var(--profit)" : "var(--loss)" } }, "\u20b9" + Number(sn.sellPrice).toLocaleString("en-IN")),
                        React.createElement("div", { style: { fontSize: 10, color: isGain ? "var(--profit)" : "var(--loss)", fontWeight: 700, marginTop: 2 } }, (priceDiff >= 0 ? "+\u20b9" : "-\u20b9") + Math.abs(priceDiff).toFixed(2) + " / share")
                      )
                    ),

                    /* P&L box */
                    React.createElement("div", { style: { padding: "9px 12px", borderRadius: 9, marginBottom: 8, background: isGain ? "var(--profitbg)" : "var(--lossbg)", border: "1px solid " + (isGain ? "var(--profitborder)" : "var(--lossborder)"), display: "flex", justifyContent: "space-between", alignItems: "center" } },
                      React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: isGain ? "var(--profit)" : "var(--loss)", marginBottom: 2, display: "flex", alignItems: "center", gap: 3 } }, isGain ? Ico.triangleUp(9, "var(--profit)") : Ico.triangleDown(9, "var(--loss)"), " ", isGain ? "Profit" : "Loss"),
                        React.createElement("div", { style: { fontSize: 10, color: "var(--text6)" } }, sn.qty + " shares \u00b7 cost " + INR(sn.costBasis))
                      ),
                      React.createElement("div", { style: { textAlign: "right" } },
                        React.createElement("div", { style: { fontSize: 17, fontFamily: "var(--font-heading)", fontWeight: 800, color: isGain ? "var(--profit)" : "var(--loss)" } }, (isGain ? "+" : "") + INR(sn.pnl)),
                        React.createElement("div", { style: { fontSize: 11, color: isGain ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isGain ? "+" : "") + sn.pnlPct.toFixed(2) + "%")
                      )
                    ),

                    /* STCG/LTCG badge */
                    daysHeld !== null && daysHeld >= 0 && React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 9px", borderRadius: 7, marginBottom: 8, background: isLT ? "var(--profitbg)" : "var(--warnbg)", border: "1px solid " + (isLT ? "var(--profitborder)" : "var(--warnborder)"), fontSize: 11 } },
                      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                        React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: isLT ? "var(--profit)" : "var(--warn)", color: "#fff" } }, cgType),
                        React.createElement("span", { style: { color: "var(--text4)" } }, daysHeld + " days held \u00b7 " + taxRate)
                      ),
                      sn.pnl > 0 && estTax > 0 && React.createElement("span", { style: { color: "var(--loss)", fontWeight: 600, fontSize: 10 } }, "Est. tax: " + INR(Math.round(estTax)))
                    ),

                    /* Notes */
                    sn.notes && React.createElement("div", { style: { fontSize: 11, color: "var(--text4)", lineHeight: 1.5, padding: "6px 9px", borderRadius: 7, background: "var(--accentbg2)", border: "1px solid var(--border2)", marginBottom: 8, whiteSpace: "pre-wrap" } }, sn.notes),

                    /* Edit / Delete buttons */
                    React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 } },
                      React.createElement("button", {
                        onClick: () => setEditSnap({ ...sn, fyKey: fy, qty: String(sn.qty || ""), buyPrice: String(sn.buyPrice || ""), sellPrice: String(sn.sellPrice || ""), brokerage: String(sn.brokerage || 0) }),
                        style: { fontSize: 10, padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--infoborder)", background: "var(--infobg)", color: "var(--info)" }
                      }, Icons.edit(12), " Edit"),
                      React.createElement("button", {
                        onClick: async () => { if (await showConfirm("Remove this snapshot? This cannot be undone.")) deleteSnapshot(fy, sn.id); },
                        style: { fontSize: 10, padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-body)", border: "1px solid var(--lossborder)", background: "var(--lossbg)", color: "var(--loss)" }
                      },                        React.createElement(React.Fragment, null, Ico.x(10), " Remove"))
                    ),
                    React.createElement(SnapshotChartPanel, { sn: sn }),
                    sn.chartPts && sn.chartPts.length >= 2 && (() => {
                      const snIsGain = sn.pnl >= 0;
                      const snGradId = "snlg_" + (sn.id || "x").replace(/[^a-zA-Z0-9]/g, "_");
                      const snChartPts = sn.chartPts.map(p => ({ date: p.date, value: p.close != null ? (sn.qty || 0) * p.close : (p.value || 0) }));
                      if (snChartPts.length < 2) return null;
                      const snChgAbs = snChartPts[snChartPts.length - 1].value - snChartPts[0].value;
                      const snChgPct = snChartPts[0].value > 0 ? ((snChgAbs / snChartPts[0].value) * 100).toFixed(2) : "0.00";
                      const snChgCol = snChgAbs >= 0 ? "#16a34a" : "#ef4444";
                      return React.createElement("div", { style: { marginTop: 14, marginBottom: 8, background: "var(--bg5)", borderRadius: 12, padding: "14px 16px 10px", border: "1px solid var(--border2)" } },
                        React.createElement("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 8 } },
                          React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--text5)", textTransform: "uppercase", letterSpacing: .5 } }, "Holding Value History"),
                          React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", background: "var(--accentbg2)", border: "1px solid var(--border2)", borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap" } },
                            sn.chartPts[0].date + " \u2192 " + sn.chartPts[sn.chartPts.length - 1].date
                          ),
                          React.createElement("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 } },
                            React.createElement("span", { style: { fontSize: 11, padding: "2px 8px", borderRadius: 7, fontWeight: 700, background: snChgAbs >= 0 ? "rgba(22,163,74,.12)" : "rgba(239,68,68,.12)", border: "1px solid " + (snChgAbs >= 0 ? "rgba(22,163,74,.25)" : "rgba(239,68,68,.25)"), color: snChgCol, display: "inline-flex", alignItems: "center", gap: 3 } }, (snChgAbs >= 0 ? React.createElement(React.Fragment, null, Ico.triangleUp(8, snChgCol), " +") : React.createElement(React.Fragment, null, Ico.triangleDown(8, snChgCol), " ")), Math.abs(snChgPct) + "%"),
                            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, sn.chartPts.length + " days")
                          )
                        ),
                        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, marginBottom: 6, fontSize: 11, color: "var(--text6)" } },
                          React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 4 } },
                            React.createElement("span", { style: { display: "inline-block", width: 20, height: 3, background: snIsGain ? "#16a34a" : "#ef4444", borderRadius: 2, verticalAlign: "middle" } }),
                            "Holding value"
                          ),
                          React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 4 } },
                            React.createElement("span", { style: { display: "inline-block", width: 20, height: 0, borderTop: "3px dashed #f59e0b", verticalAlign: "middle" } }),
                            "Cost basis (" + INR(sn.costBasis) + ")"
                          )
                        ),
                        React.createElement(HoldingValueChart, { pts: snChartPts, qty: sn.qty, buyPrice: sn.buyPrice, color: snIsGain ? "#16a34a" : "#ef4444", gradId: snGradId })
                      );
                    })()
                  );
                })
              )
            );
          });
        })()
      );
    }),

    /* ── Edit Snapshot Modal ── */
    editSnap && React.createElement("div", { className: "modal-bd", onClick: (e) => { if (e.target === e.currentTarget) setEditSnap(null); } },
      React.createElement("div", { className: "stx-card stx-fu", style: { maxWidth: 520, margin: "40px auto", width: "92vw" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
          React.createElement("h2", { style: { fontSize: 17, fontWeight: 700, fontFamily: "var(--font-heading)" } }, "Edit Snapshot"),
          React.createElement("button", { onClick: () => setEditSnap(null), style: { background: "transparent", border: "none", color: "var(--text5)", cursor: "pointer", display: "inline-flex" } }, Ico.x(20))
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Company"),
            React.createElement("input", { className: "inp", value: editSnap.company || "", onChange: (e) => setEditSnap((p) => ({ ...p, company: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Ticker"),
            React.createElement("input", { className: "inp", value: editSnap.ticker || "", onChange: (e) => setEditSnap((p) => ({ ...p, ticker: e.target.value.toUpperCase() })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Quantity"),
            React.createElement("input", { className: "inp", type: "number", value: editSnap.qty, onChange: (e) => setEditSnap((p) => ({ ...p, qty: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Buy Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editSnap.buyPrice, onChange: (e) => setEditSnap((p) => ({ ...p, buyPrice: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Sell Price (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editSnap.sellPrice, onChange: (e) => setEditSnap((p) => ({ ...p, sellPrice: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Snapshot Date"),
            React.createElement("input", { className: "inp", type: "date", value: editSnap.savedAt || "", onChange: (e) => setEditSnap((p) => ({ ...p, savedAt: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Date of Acquisition"),
            React.createElement("input", { className: "inp", type: "date", value: editSnap.buyDate || "", onChange: (e) => setEditSnap((p) => ({ ...p, buyDate: e.target.value })) })
          ),
          React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Brokerage / Fees (\u20b9)"),
            React.createElement("input", { className: "inp", type: "number", value: editSnap.brokerage || "", onChange: (e) => setEditSnap((p) => ({ ...p, brokerage: e.target.value })) })
          )
        ),
        React.createElement("div", { style: { marginTop: 12 } },
          React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", textTransform: "uppercase", display: "block", marginBottom: 4 } }, "Notes"),
          React.createElement("textarea", { className: "inp", value: editSnap.notes || "", onChange: (e) => setEditSnap((p) => ({ ...p, notes: e.target.value })), placeholder: "Broker, exchange, strategy notes\u2026", style: { resize: "vertical", minHeight: 60, lineHeight: 1.6, fontSize: 12 } })
        ),
        /* P&L preview */
        editSnap.qty && editSnap.buyPrice && editSnap.sellPrice && (() => {
          const pnl = (+editSnap.sellPrice - +editSnap.buyPrice) * (+editSnap.qty);
          const pnlPct = +editSnap.buyPrice > 0 ? ((+editSnap.sellPrice - +editSnap.buyPrice) / +editSnap.buyPrice * 100) : 0;
          const isG = pnl >= 0;
          return React.createElement("div", { style: { padding: "8px 12px", borderRadius: 8, marginTop: 12, background: isG ? "var(--profitbg)" : "var(--lossbg)", border: "1px solid " + (isG ? "var(--profitborder)" : "var(--lossborder)"), display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 } },
            React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", fontWeight: 600 } }, isG ? React.createElement(React.Fragment, null, Ico.triangleUp(10, "var(--profit)"), " Profit") : React.createElement(React.Fragment, null, Ico.triangleDown(10, "var(--loss)"), " Loss")),
            React.createElement("span", { style: { fontWeight: 700, color: isG ? "var(--profit)" : "var(--loss)", fontFamily: "var(--font-heading)", fontSize: 14 } }, (isG ? "+" : "") + INR(pnl)),
            React.createElement("span", { style: { color: isG ? "var(--profit)" : "var(--loss)", opacity: 0.8 } }, (isG ? "+" : "") + pnlPct.toFixed(2) + "%")
          );
        })(),
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
          React.createElement("button", { className: "stx-btn stx-btn-primary", style: { flex: 1 }, onClick: saveEditedSnapshot }, "Save Changes"),
          React.createElement("button", { className: "stx-btn stx-btn-ghost", onClick: () => setEditSnap(null) }, "Cancel")
        )
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Entry Score Panel — Momentum Trading Entry Scoring Engine
   ══════════════════════════════════════════════════════════════════════════ */
const LS_ENTRY_SCORES = "mm_entry_scores";
const LS_ENTRY_SNAPSHOTS = "mm_entry_score_snapshots";
const LS_ENTRY_PERF_PRICES = "mm_entry_perf_prices";
const EntryScorePanel = ({ shares }) => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [entries, setEntries] = useState([]);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addTicker, setAddTicker] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [expandedIds, setExpandedIds] = useState({});
  const [viewingAnalysis, setViewingAnalysis] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const val = await dbGetSetting(LS_ENTRY_SCORES);
        if (val && Array.isArray(val)) {
          const backfilled = val.map(e => {
            let changed = false;
            let ne = e;
            if (!e.frozenResult && e.result) { ne = Object.assign({}, ne, { frozenResult: JSON.parse(JSON.stringify(e.result)) }); changed = true; }
            if (!ne.addedAt) { ne = Object.assign({}, ne, { addedAt: new Date(ne.id || Date.now()).toISOString() }); changed = true; }
            return ne;
          });
          setEntries(backfilled);
          const needsSave = backfilled.some((e, i) => e !== val[i]);
          if (needsSave) dbSetSetting(LS_ENTRY_SCORES, backfilled);
        }
      } catch {}
      setEntriesLoaded(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const val = await dbGetSetting(LS_ENTRY_SNAPSHOTS);
        if (val && Array.isArray(val)) setSnapshots(val);
      } catch {}
      setSnapshotsLoaded(true);
    })();
  }, []);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [expandedYear, setExpandedYear] = useState(null);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [perfTrackerExpanded, setPerfTrackerExpanded] = useState(false);
  const [perfTrackerRefreshing, setPerfTrackerRefreshing] = useState(false);
  const [perfTrackerPrices, setPerfTrackerPrices] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const val = await dbGetSetting(LS_ENTRY_PERF_PRICES);
        if (val && typeof val === "object" && Object.keys(val).length) setPerfTrackerPrices(val);
      } catch {}
    })();
  }, []);

  const saveEntries = (arr) => { setEntries(arr); dbSetSetting(LS_ENTRY_SCORES, arr); window.dispatchEvent(new CustomEvent("stox:data-changed")); };
  const deleteEntry = (id) => { saveEntries(entries.filter(e => e.id !== id)); };

  const refreshPerfTracker = async () => {
    if (!entries.length || perfTrackerRefreshing) return;
    setPerfTrackerRefreshing(true);
    const oldPrices = { ...perfTrackerPrices };
    const prices = {};
    for (const entry of entries) {
      try {
        const data = await fetchTickerPrice(entry.ticker);
        if (data && data.price > 0) prices[entry.ticker] = data.price;
      } catch {}
    }
    setPerfTrackerPrices(prices);
    dbSetSetting(LS_ENTRY_PERF_PRICES, prices);
    try { if (window.__fsa && window.__fsa.writeNow) await window.__fsa.writeNow(); } catch(e) {}
    setPerfTrackerRefreshing(false);
    const changes = [];
    const noChanges = [];
    entries.forEach(entry => {
      const oldPrice = oldPrices[entry.ticker];
      const newPrice = prices[entry.ticker];
      const priceOnAdd = entry.currentPrice || entry.frozenResult?.lastClose || entry.result?.lastClose || 0;
      if (!oldPrice || !newPrice || !priceOnAdd) { noChanges.push(entry.ticker); return; }
      const oldPct = ((oldPrice - priceOnAdd) / priceOnAdd * 100);
      const newPct = ((newPrice - priceOnAdd) / priceOnAdd * 100);
      const diff = Math.round((newPct - oldPct) * 100) / 100;
      const label = entry.ticker.replace(".NS", "");
      if (Math.abs(diff) >= 0.01) {
        const sign = diff > 0 ? "+" : "";
        changes.push(label + " " + sign + diff.toFixed(2) + "% (" + oldPct.toFixed(1) + "% \u2192 " + newPct.toFixed(1) + "%)");
      } else {
        noChanges.push(label);
      }
    });
    if (changes.length > 0) {
      var msg = changes.length + " % change" + (changes.length !== 1 ? "s" : "") + " updated: " + changes.join(", ");
      if (noChanges.length > 0) msg += " \u00b7 " + noChanges.length + " unchanged";
      showToast(msg, 0);
    } else {
      showToast("Prices refreshed \u2014 no % change updates", 0);
    }
  };

  useEffect(() => {
    if (!entries.length || !TI || !DF) return;
    const OLD_KEYWORDS = /Overbought|price up, volume down|bullish, weekly bearish|within 1% of upper|new 20d high with volume surge|all 3 timeframes bullish|institutional buying|rising OBV|ADX > 20 all|MTF alignment strong|declining on thin volume|within 1.5% of lower|held < 3 days with strong|> 3% below entry|> 1.5% below entry|below EMAs \+ MACD|institutional selling/;
    const stale = entries.filter(e => {
      if (!e.result) return false;
      if (!e.result.hardFilters || !e.result.hardFilters.length) return true;
      if (e.result.hardFilters.some(f => OLD_KEYWORDS.test(f))) return true;
      const tfKeys = ['weekly', 'daily', 'hourly'];
      for (let k = 0; k < tfKeys.length; k++) {
        const t = e.result[tfKeys[k]];
        if (t && t.total != null && (t.trendHealthScore != null || t.trendScore != null)) {
          if (t.trendScore != null) return true;
          const pillarSum = (t.trendHealthScore || 0) + (t.pullbackScore || 0) + (t.prob4Score || 0) + (t.swingPotentialScore || 0);
          if (Math.abs(pillarSum - t.total) > 0.5) return true;
        }
      }
      return false;
    });
    if (!stale.length) return;
    (async () => {
      const updated = [...entries];
      let _idxD = null, _idxW = null;
      try { const _r1 = await DF.fetchOHLCVCached("^NSEI", "daily"); _idxD = (_r1 && _r1.data) || null; } catch(e) {}
      try { const _r2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); _idxW = (_r2 && _r2.data) || null; } catch(e) {}
      for (const entry of stale) {
        try {
          const tk = entry.ticker.toUpperCase();
          const [resW, resD, resH] = await Promise.all([DF.fetchOHLCVCached(tk, "weekly"), DF.fetchOHLCVCached(tk, "daily"), DF.fetchOHLCVCached(tk, "1h")]);
          if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) continue;
          const indW = TI.computeAll(resW.data);
          const indD = TI.computeAll(resD.data);
          const indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
          const result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, _idxD, _idxW);
          if (result) result.lastClose = entry.currentPrice || resD.data[resD.data.length - 1].c;
          const idx = updated.findIndex(e => e.id === entry.id);
          if (idx >= 0) updated[idx] = { ...updated[idx], result, indicators: { weekly: indW, daily: indD, hourly: indH } };
        } catch (e) {}
      }
      saveEntries(updated);
    })();
  }, []);

  useEffect(() => {
    if (!entries.length || !TI || !DF || perfTrackerRefreshing) return;
    if (Object.keys(perfTrackerPrices).length > 0) return;
    (async () => {
      setPerfTrackerRefreshing(true);
      const prices = {};
      for (const entry of entries) {
        try {
          const data = await fetchTickerPrice(entry.ticker);
          if (data && data.price > 0) prices[entry.ticker] = data.price;
        } catch {}
      }
      setPerfTrackerPrices(prices);
      dbSetSetting(LS_ENTRY_PERF_PRICES, prices);
      try { if (window.__fsa && window.__fsa.writeNow) await window.__fsa.writeNow(); } catch(e) {}
      setPerfTrackerRefreshing(false);
    })();
  }, [entriesLoaded]);

  const refreshEntries = async () => {
    if (!entries.length || refreshing) return;
    setRefreshing(true);
    const oldScores = {};
    entries.forEach(e => { oldScores[e.ticker] = e.result ? e.result.finalScore : null; });
    const updated = [...entries];
    let _idxD = null, _idxW = null;
    try { const _r1 = await DF.fetchOHLCVCached("^NSEI", "daily"); _idxD = (_r1 && _r1.data) || null; } catch(e) {}
    try { const _r2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); _idxW = (_r2 && _r2.data) || null; } catch(e) {}
    for (let i = 0; i < updated.length; i++) {
      const entry = updated[i];
      const tk = entry.ticker.toUpperCase();
      try {
        const [resW, resD, resH] = await Promise.all([
          DF.fetchOHLCVCached(tk, "weekly"),
          DF.fetchOHLCVCached(tk, "daily"),
          DF.fetchOHLCVCached(tk, "1h"),
        ]);
        if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) continue;
        const indW = TI.computeAll(resW.data);
        const indD = TI.computeAll(resD.data);
        const indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
        const lastClose = resD.data[resD.data.length - 1]?.close || entry.currentPrice || 0;
        const result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, _idxD, _idxW);
        if (result) result.lastClose = lastClose;
        updated[i] = { ...updated[i], currentPrice: entry.currentPrice || lastClose, result, indicators: { weekly: indW, daily: indD, hourly: indH } };
      } catch {}
    }
    saveEntries(updated);
    setRefreshing(false);
    const changes = [];
    updated.forEach(e => {
      const old = oldScores[e.ticker];
      const now = e.result ? e.result.finalScore : null;
      if (old !== null && now !== null && old !== now) {
        const diff = Math.round((now - old) * 10) / 10;
        const sign = diff > 0 ? "+" : "";
        changes.push(e.ticker + " " + sign + diff + " (" + (e.result.decision ? e.result.decision.label : "") + ")");
      }
    });
    if (changes.length > 0) {
      showToast("Scores updated: " + changes.join(", "), 0);
    } else {
      showToast("Entry scores refreshed \u2014 no changes", 0);
    }
  };

  const exportEntryScores = () => {
    const payload = {
      app: "StoX",
      type: "entry-scores",
      version: 1,
      exportDate: new Date().toISOString(),
      entries: entries,
      snapshots: snapshots,
      perfTrackerPrices: perfTrackerPrices
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stox-entry-scores-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported " + entries.length + " entries" + (snapshots.length ? " + " + snapshots.length + " snapshots" : ""), 3000);
  };

  const exportEntryScoreCSV = () => {
    var rows = [["Stock","Date Added","Hourly","Daily","Weekly","Base","Bonus/Pen","Final","10DLN","10DEM","Price on Add","Days","Current Price","% Change"]];
    var now = new Date();
    entries.forEach(function(entry) {
      var addedDate = new Date(entry.addedAt);
      var _startMs = Date.UTC(addedDate.getFullYear(), addedDate.getMonth(), addedDate.getDate());
      var _endMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      var daysElapsed = 0;
      for (var _t = _startMs; _t < _endMs; _t += 86400000) { var _day = new Date(_t).getUTCDay(); if (_day !== 0 && _day !== 6) daysElapsed++; }
      var fr = entry.frozenResult || entry.result;
      var hourly = fr && fr.hourly ? fr.hourly.total : "";
      var daily = fr && fr.daily ? fr.daily.total : "";
      var weekly = fr && fr.weekly ? fr.weekly.total : "";
      var base = fr && fr.baseScore != null ? fr.baseScore : "";
      var final = fr ? fr.finalScore : "";
      var bonus = fr && fr.hardFilters && fr.hardFilters.length > 0 ? fr.hardFilters.join("; ") : "";
      var priceOnAdd = entry.currentPrice || entry.frozenResult?.lastClose || entry.result?.lastClose || "";
      var currentPrice = perfTrackerPrices[entry.ticker] || "";
      var pct = priceOnAdd > 0 && currentPrice > 0 ? ((currentPrice - priceOnAdd) / priceOnAdd * 100).toFixed(2) : "";
      var dateStr = addedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      function esc(v) { var s = String(v); return s.indexOf(",") >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s; }
      rows.push([esc(entry.ticker), esc(dateStr), hourly, daily, weekly, base, esc(bonus), final, entry.conf10dLog != null ? entry.conf10dLog : "", entry.conf10dEmp != null ? entry.conf10dEmp : "", priceOnAdd, daysElapsed, currentPrice, pct].join(","));
    });
    var csv = rows.join("\r\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "stox-entry-scores-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported " + entries.length + " entries to CSV", 3000);
  };

  const importEntryScores = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.type !== "entry-scores" || !Array.isArray(data.entries)) {
          showToast("Invalid entry score file", 3000);
          return;
        }
        if (!await showConfirm("Import " + data.entries.length + " entry scores" + (data.snapshots && data.snapshots.length ? " + " + data.snapshots.length + " snapshots" : "") + "?\nExisting entries with the same ticker will be replaced.")) return;
        const localMap = {};
        entries.forEach(e => { localMap[e.id] = e; });
        const importedMap = {};
        data.entries.forEach(e => { importedMap[e.id] = e; });
        const merged = data.entries.map(imp => {
          const local = entries.find(e => e.ticker === imp.ticker && e.id !== imp.id);
          if (local) {
            return Object.assign({}, imp, {
              id: local.id,
              currentPrice: local.currentPrice,
              addedAt: local.addedAt,
              frozenResult: local.frozenResult || imp.frozenResult,
              result: local.result || imp.result,
              indicators: local.indicators || imp.indicators
            });
          }
          return imp;
        });
        entries.forEach(e => {
          if (!importedMap[e.id] && !data.entries.find(ie => ie.ticker === e.ticker)) {
            merged.push(e);
          }
        });
        saveEntries(merged);
        if (data.snapshots && Array.isArray(data.snapshots)) {
          const snapMap = {};
          snapshots.forEach(s => { snapMap[s.id] = s; });
          data.snapshots.forEach(s => { snapMap[s.id] = s; });
          const mergedSnaps = Object.values(snapMap);
          saveSnapshots(mergedSnaps);
        }
        if (data.perfTrackerPrices && typeof data.perfTrackerPrices === "object") {
          setPerfTrackerPrices(data.perfTrackerPrices);
          dbSetSetting(LS_ENTRY_PERF_PRICES, data.perfTrackerPrices);
          window.dispatchEvent(new CustomEvent("stox:data-changed"));
        }
        showToast("Imported " + data.entries.length + " entries successfully", 3000);
      } catch (err) {
        showToast("Import failed: " + err.message, 5000);
      }
    };
    input.click();
  };

  const saveSnapshots = (arr) => { setSnapshots(arr); dbSetSetting(LS_ENTRY_SNAPSHOTS, arr); window.dispatchEvent(new CustomEvent("stox:data-changed")); };
  const saveSnapshot = (entry) => {
    const snap = { id: Date.now(), ticker: entry.ticker, currentPrice: entry.currentPrice, savedAt: new Date().toISOString(), result: JSON.parse(JSON.stringify(entry.result)), indicators: entry.indicators ? JSON.parse(JSON.stringify(entry.indicators)) : null, entryAddedAt: entry.addedAt };
    saveSnapshots([snap, ...snapshots]);
  };
  const deleteSnapshot = (id) => { saveSnapshots(snapshots.filter(s => s.id !== id)); };
  const deleteSnapshotsWhere = (pred) => { saveSnapshots(snapshots.filter(s => !pred(s))); };

  const groupSnapshots = () => {
    const years = {};
    snapshots.forEach(snap => {
      const d = new Date(snap.savedAt);
      const yKey = String(d.getFullYear());
      const mKey = yKey + "-" + d.toLocaleString("en-IN", { month: "long" });
      const dayKey = mKey + "-" + d.getDate();
      const dayLabel = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      if (!years[yKey]) years[yKey] = {};
      if (!years[yKey][mKey]) years[yKey][mKey] = {};
      if (!years[yKey][mKey][dayKey]) years[yKey][mKey][dayKey] = { label: dayLabel, snaps: [] };
      years[yKey][mKey][dayKey].snaps.push(snap);
    });
    return years;
  };

  const fetchAndScore = async () => {
    if (!addTicker.trim()) { setAddErr("Enter a ticker."); return; }
    setAdding(true); setAddErr("");
    try {
      const tk = addTicker.trim().toUpperCase();
      const [resW, resD, resH] = await Promise.all([
        DF.fetchOHLCVCached(tk, "weekly"),
        DF.fetchOHLCVCached(tk, "daily"),
        DF.fetchOHLCVCached(tk, "1h"),
      ]);
      if (!resW.data || resW.data.length < 12) { setAddErr("Insufficient weekly data for " + tk); setAdding(false); return; }
      if (!resD.data || resD.data.length < 12) { setAddErr("Insufficient daily data for " + tk); setAdding(false); return; }
      const lastDailyClose = resD.data[resD.data.length - 1].c;
      const price = parseFloat(addPrice) || lastDailyClose || 0;
      const indW = TI.computeAll(resW.data);
      const indD = TI.computeAll(resD.data);
      const indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
      let _idxD = null, _idxW = null;
      try { const _r1 = await DF.fetchOHLCVCached("^NSEI", "daily"); _idxD = (_r1 && _r1.data) || null; } catch (e) {}
      try { const _r2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); _idxW = (_r2 && _r2.data) || null; } catch (e) {}
      const result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, _idxD, _idxW);
      if (result) result.lastClose = lastDailyClose;
      let conf10d = null, conf10dLog = null, conf10dEmp = null;
      try {
        const _conf = TI.computeTenDayForwardConfidence(resH.data, resD.data, _idxD, buildEntryScoreContext(result));
        if (_conf) { conf10dLog = _conf.confidenceLognormal; conf10dEmp = _conf.confidenceEmpirical; if (_conf.confidence != null) conf10d = Math.round(_conf.confidence * 10) / 10; }
      } catch (e) {}
      const entry = { id: Date.now(), ticker: tk, currentPrice: price, addedAt: new Date().toISOString(), result, frozenResult: JSON.parse(JSON.stringify(result || {})), conf10d, conf10dLog, conf10dEmp, indicators: { weekly: indW, daily: indD, hourly: indH } };
      saveEntries([entry, ...entries]);
      setAddTicker(""); setAddPrice(""); setShowAdd(false);
    } catch (e) { setAddErr("Error: " + (e.message || "Failed")); }
    setAdding(false);
  };

  const factorBar = (label, val, max, color, hasNeg) => {
    const pct = max > 0 ? (Math.abs(val) / max * 100) : 0;
    const barColor = val < 0 ? "#ef4444" : color;
    return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
      React.createElement("span", { style: { width: 90, fontSize: 9, fontWeight: 600, color: "var(--text4)", textAlign: "right", flexShrink: 0 } }, label),
      React.createElement("div", { style: { flex: 1, height: 5, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
        React.createElement("div", { style: { width: pct + "%", height: "100%", borderRadius: 3, background: barColor, transition: "width .3s" } })
      ),
      React.createElement("span", { style: { width: 38, fontSize: 9, fontWeight: 700, color: val < 0 ? "#ef4444" : "var(--text4)", fontFamily: "var(--font-mono)", textAlign: "right" } }, (val >= 0 ? "+" : "") + val + "/" + max)
    );
  };

  const entryStabVal = (score, ind) => {
    if (score && score.stability != null) return score.stability;
    if (ind && ind.stabilityScore != null) return Math.round(Math.max(0, Math.min(10, (1 - ind.stabilityScore) * 10)) * 10) / 10;
    return null;
  };
  const entrySpikeVal = (score, ind) => {
    if (score && score.spike != null) return score.spike;
    if (ind && ind.spike != null) return ind.spike === true ? 5 : 0;
    return null;
  };

  const tfSection = (label, score, ind) => {
    if (!score) return React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", padding: "4px 0" } }, label + ": No data");
    const sv = entryStabVal(score, ind);
    const pv = entrySpikeVal(score, ind);
    return React.createElement("div", { style: { marginBottom: 8 } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 } },
        React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: "var(--text3)" } }, label),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
          React.createElement("span", { style: { fontSize: 11, fontWeight: 800, color: score.decision.color, fontFamily: "var(--font-heading)" } }, score.total + " · " + score.decision.label)
        )
      ),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
        factorBar("Trend Health", score.trendHealthScore, score.trendHealthMax, "#3b82f6", false),
        factorBar("Pullback", score.pullbackScore, score.pullbackMax, "#a855f7", false),
        factorBar("4% Prob", score.prob4Score, score.prob4Max, "#06b6d4", false),
        score.swingPotentialScore != null && score.swingPotentialScore > 0 && factorBar("Swing Potential", score.swingPotentialScore, score.swingPotentialMax, "#f59e0b", false),
        sv != null && factorBar("Stability", -sv, 10, "#22c55e", false),
        pv != null && factorBar("Spike", -pv, 10, "#f97316", false)
      )
    );
  };

  const [snapExpanded, setSnapExpanded] = useState({});
  const [snapTech, setSnapTech] = useState({});

  const snapshotCard = (snap) => {
    const r = snap.result;
    const ind = snap.indicators || {};
    const isExp = !!snapExpanded[snap.id];
    const isTech = !!snapTech[snap.id];
    const snapFactorBar = (label, val, max, color) => {
      if (val == null || max == null) return null;
      const pct = max > 0 ? (Math.abs(val) / max * 100) : 0;
      const barColor = val < 0 ? "#ef4444" : color;
      return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
        React.createElement("span", { style: { width: 65, fontSize: 8, fontWeight: 600, color: "var(--text5)", textAlign: "right", flexShrink: 0 } }, label),
        React.createElement("div", { style: { flex: 1, height: 4, borderRadius: 2, background: "var(--bg5)", overflow: "hidden" } },
          React.createElement("div", { style: { width: pct + "%", height: "100%", borderRadius: 2, background: barColor } })
        ),
        React.createElement("span", { style: { width: 32, fontSize: 8, fontWeight: 700, color: val < 0 ? "#ef4444" : "var(--text5)", fontFamily: "var(--font-mono)", textAlign: "right" } }, (val >= 0 ? "+" : "") + val + "/" + max)
      );
    };
    const snapTfSection = (label, score) => {
      if (!score) return null;
      const sv = entryStabVal(score, ind);
      const pv = entrySpikeVal(score, ind);
      return React.createElement("div", { style: { marginBottom: 6 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 } },
          React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: "var(--text3)" } }, label),
          React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: score.decision.color, fontFamily: "var(--font-heading)" } }, score.total + " · " + score.decision.label)
        ),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
          snapFactorBar("Trend Health", score.trendHealthScore, score.trendHealthMax, "#3b82f6"),
          snapFactorBar("Pullback", score.pullbackScore, score.pullbackMax, "#a855f7"),
          snapFactorBar("4% Prob", score.prob4Score, score.prob4Max, "#06b6d4"),
          score.swingPotentialScore != null && score.swingPotentialScore > 0 && snapFactorBar("Swing Potential", score.swingPotentialScore, score.swingPotentialMax, "#f59e0b"),
          sv != null && snapFactorBar("Stability", -sv, 10, "#22c55e"),
          pv != null && snapFactorBar("Spike", -pv, 10, "#f97316")
        )
      );
    };
    const indRow = (label, val, signal) => {
      if (val == null) return null;
      const sigColor = signal === "bullish" ? "#22c55e" : signal === "bearish" ? "#ef4444" : signal === "overbought" ? "#f59e0b" : signal === "oversold" ? "#3b82f6" : "var(--text5)";
      return React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" } },
        React.createElement("span", { style: { fontSize: 9, color: "var(--text5)" } }, label),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
          React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: "var(--text3)", fontFamily: "var(--font-mono)" } }, typeof val === "number" ? val.toFixed(2) : "\u2014"),
          signal && React.createElement("span", { style: { fontSize: 7, fontWeight: 700, color: sigColor, padding: "1px 4px", borderRadius: 3, background: sigColor + "15" } }, signal)
        )
      );
    };
    const renderIndicators = (indData) => {
      if (!indData) return React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", padding: "4px 0" } }, "No data");
      const lc = indData.lastClose;
      return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px" } },
        indRow("RSI (14)", indData.rsi_14, indData.rsi_14 > 70 ? "overbought" : indData.rsi_14 < 30 ? "oversold" : "neutral"),
        indRow("ADX (14)", indData.adx_14, indData.adx_14 > 25 ? "trending" : "ranging"),
        indRow("MACD", indData.macd ? indData.macd.macd : null, indData.macd && indData.macd.histogram > 0 ? "bullish" : "bearish"),
        indRow("MACD Signal", indData.macd ? indData.macd.signal : null),
        indRow("EMA 9", indData.ema_9, lc && indData.ema_9 ? lc > indData.ema_9 ? "bullish" : "bearish" : null),
        indRow("EMA 21", indData.ema_21, lc && indData.ema_21 ? lc > indData.ema_21 ? "bullish" : "bearish" : null),
        indRow("EMA 50", indData.ema_50, lc && indData.ema_50 ? lc > indData.ema_50 ? "bullish" : "bearish" : null),
        indRow("SMA 20", indData.sma_20, lc && indData.sma_20 ? lc > indData.sma_20 ? "bullish" : "bearish" : null),
        indRow("SMA 50", indData.sma_50, lc && indData.sma_50 ? lc > indData.sma_50 ? "bullish" : "bearish" : null),
        indRow("Supertrend", indData.supertrend, lc && indData.supertrend ? lc > indData.supertrend ? "bullish" : "bearish" : null),
        indRow("ATR (14)", indData.atr_14),
        indRow("CCI (20)", indData.cci_20, indData.cci_20 > 100 ? "overbought" : indData.cci_20 < -100 ? "oversold" : "neutral"),
        indRow("MFI (14)", indData.mfi_14, indData.mfi_14 > 80 ? "overbought" : indData.mfi_14 < 20 ? "oversold" : "neutral"),
        indRow("Stoch RSI K", indData.stochRSI ? indData.stochRSI.k : null, indData.stochRSI && indData.stochRSI.k > 80 ? "overbought" : indData.stochRSI && indData.stochRSI.k < 20 ? "oversold" : "neutral"),
        indRow("BB Upper", indData.bb ? indData.bb.upper : null),
        indRow("BB Lower", indData.bb ? indData.bb.lower : null),
        indRow("OBV", indData.obv),
        indRow("VWAP", indData.vwap),
        indRow("ROC (12)", indData.roc_12, indData.roc_12 > 0 ? "bullish" : "bearish"),
        indRow("PSAR", indData.psar, lc && indData.psar ? lc > indData.psar ? "bullish" : "bearish" : null),
        indRow("WMA 20", indData.wma_20),
        indRow("HMA (20)", indData.hma_20),
        indRow("KAMA 10", indData.kama_10),
        indRow("CMF (20)", indData.cmf_20, indData.cmf_20 > 0 ? "bullish" : "bearish"),
        indRow("TSI", indData.tsi, indData.tsi > 0 ? "bullish" : "bearish"),
        indRow("STC", indData.stc, indData.stc > 0 ? "bullish" : "bearish"),
        indRow("KVO", indData.kvo, indData.kvo > 0 ? "bullish" : "bearish"),
        indRow("PVT", indData.pvt),
        indRow("Chandelier Long", indData.chandelier ? indData.chandelier.long : null, lc && indData.chandelier && indData.chandelier.long ? lc > indData.chandelier.long ? "bullish" : "bearish" : null),
        indRow("Chandelier Short", indData.chandelier ? indData.chandelier.short : null, lc && indData.chandelier && indData.chandelier.short ? lc > indData.chandelier.short ? "bullish" : "bearish" : null),
        indRow("Choppiness", indData.choppiness, indData.choppiness != null ? indData.choppiness < 38.2 ? "trending" : indData.choppiness > 61.8 ? "ranging" : "neutral" : null),
        indRow("Williams %R", indData.williamsR, indData.williamsR != null ? indData.williamsR > -20 ? "overbought" : indData.williamsR < -80 ? "oversold" : "neutral" : null),
        indRow("Awesome Osc", indData.awesomeOsc, indData.awesomeOsc != null ? indData.awesomeOsc > 0 ? "bullish" : "bearish" : null),
        indRow("Force Index", indData.forceIndex, indData.forceIndex != null ? indData.forceIndex > 0 ? "bullish" : "bearish" : null),
        indRow("Aroon Up", indData.aroon ? indData.aroon.up : null),
        indRow("Aroon Down", indData.aroon ? indData.aroon.down : null),
        indRow("Aroon Osc", indData.aroon ? indData.aroon.osc : null, indData.aroon && indData.aroon.osc != null ? indData.aroon.osc > 50 ? "bullish" : indData.aroon.osc < -50 ? "bearish" : "neutral" : null),
        indRow("Vortex +", indData.vortex ? indData.vortex.plus : null),
        indRow("Vortex -", indData.vortex ? indData.vortex.minus : null, indData.vortex && indData.vortex.plus != null && indData.vortex.minus != null ? indData.vortex.plus > indData.vortex.minus ? "bullish" : "bearish" : null),
        indRow("HA Trend", indData.heikinAshi ? indData.heikinAshi.trend : null, indData.heikinAshi ? indData.heikinAshi.trend : null),
        indRow("52W %From High", indData.week52HL ? indData.week52HL.pctFromHigh : null, indData.week52HL ? indData.week52HL.pctFromHigh > -5 ? "bullish" : indData.week52HL.pctFromHigh > -15 ? "neutral" : "bearish" : null),
        indRow("52W High", indData.week52HL ? indData.week52HL.high52w : null),
        indRow("52W Low", indData.week52HL ? indData.week52HL.low52w : null)
      );
    };
    return React.createElement("div", { key: snap.id, style: { padding: 12, borderRadius: 10, background: "var(--bg4)", border: "1px solid var(--border)", marginBottom: 8 } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, snap.ticker),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } }, "\u23f0 " + new Date(snap.savedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 1 } }, "\u2022 Price: " + (snap.currentPrice > 0 ? INR(snap.currentPrice) : (r.lastClose ? INR(r.lastClose) + " (Last Close)" : "Last Close")))
        ),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
          React.createElement("div", { textAlign: "right" },
            React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, "Score"),
            React.createElement("div", { style: { fontSize: 20, fontWeight: 900, color: r.decision.color, fontFamily: "var(--font-heading)", lineHeight: 1 } }, r.finalScore)
          ),
          React.createElement("div", { onClick: () => deleteSnapshot(snap.id), style: { cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--text6)", title: "Delete snapshot", display: "inline-flex" } }, Ico.x(14))
        )
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, background: r.decision.color + "12", marginBottom: 6 } },
        React.createElement("span", { style: { fontSize: 11, fontWeight: 800, color: r.decision.color, fontFamily: "var(--font-heading)" } }, r.decision.label),
        React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text5)", fontStyle: "italic" } }, r.decision.position),
        r.hardFilters && r.hardFilters.length > 0 && React.createElement("span", { style: { fontSize: 8, fontWeight: 700, color: "#ef4444", padding: "1px 4px", borderRadius: 3, background: "rgba(239,68,68,.1)" } }, r.hardFilters.length + " filter")
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 } },
        ["weekly", "daily", "hourly"].map(tf => {
          const s = r[tf];
          const label = tf === "weekly" ? "Weekly" : tf === "daily" ? "Daily" : "Hourly";
          return React.createElement("div", { key: tf, style: { padding: "4px 6px", borderRadius: 6, background: "var(--bg5)", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 8, fontWeight: 600, color: "var(--text5)", marginBottom: 1 } }, label),
            React.createElement("div", { style: { fontSize: 12, fontWeight: 800, color: s ? s.decision.color : "var(--text6)", fontFamily: "var(--font-heading)" } }, s ? s.total : "N/A"),
            s && React.createElement("div", { style: { fontSize: 8, color: s.decision.color, fontWeight: 600 } }, s.decision.label)
          );
        })
      ),
      scoreMathBlock(r),
      React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 12, marginTop: 8 } },
        React.createElement("div", { onClick: () => setSnapExpanded(p => ({ ...p, [snap.id]: !p[snap.id] })), style: { fontSize: 9, color: "var(--accent)", cursor: "pointer", fontWeight: 600 } },
          React.createElement(React.Fragment, null, isExp ? Ico.chevronUp(12) : Ico.chevronDown(12), " ", isExp ? "Hide Details" : "Show Details")
        ),
        ind && React.createElement("div", { onClick: () => setSnapTech(p => ({ ...p, [snap.id]: !p[snap.id] })), style: { fontSize: 9, color: isTech ? "var(--text5)" : "#f97316", cursor: "pointer", fontWeight: 600 } },
          React.createElement(React.Fragment, null, Ico.activity(13), " " + (isTech ? "Hide Technicals" : "Technicals"))
        )
      ),
      isExp && React.createElement("div", { style: { marginTop: 8, padding: "6px 0" } },
        r.daily && snapTfSection("Daily (55%)", r.daily),
        r.weekly && snapTfSection("Weekly (15%)", r.weekly),
        r.hourly && snapTfSection("Hourly (30%)", r.hourly),
        r.hardFilters && r.hardFilters.length > 0 && React.createElement("div", { style: { marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)" } },
          React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text3)", marginBottom: 3 } }, "Penalties & Bonuses"),
          r.hardFilters.map((f, i) => {
            var isBonus = f.indexOf("(+") >= 0;
            var valMatch = f.match(/\([+\-\u2212]?\d+\)$/);
            var valStr = valMatch ? valMatch[0] : "";
            var label = valStr ? f.replace(valStr, "").replace(/\s*—\s*/, " — ").trim() : f;
            return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, fontSize: 9, lineHeight: 1.4 } },
                  React.createElement("span", { style: { color: "var(--text3)", flex: 1, minWidth: 0, overflow: "hidden", wordBreak: "break-word" } }, isBonus ? React.createElement(React.Fragment, null, Ico.check(12, "#22c55e"), " ", label) : React.createElement(React.Fragment, null, Ico.alertTriangle(12, "#f59e0b"), " ", label)),
              valStr && React.createElement("span", { style: { fontSize: 9, fontWeight: 800, color: "var(--text3)", background: "var(--bg4)", padding: "1px 5px", borderRadius: 3, fontFamily: "var(--font-mono)", flexShrink: 0 } }, valStr)
            );
          }),
          React.createElement("div", { style: { fontSize: 8, color: "var(--text5)", marginTop: 3 } },
            "Base: " + r.baseScore + " | Penalties: " + r.penalties + " | Bonuses: " + r.bonuses + " \u2192 Final: " + r.finalScore
          )
        )
      ),
      isTech && ind && React.createElement("div", { style: { marginTop: 8, padding: 8, borderRadius: 8, background: "var(--bg5)", border: "1px solid var(--border)" } },
        React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: "var(--text4)", marginBottom: 6 } }, "Technical Indicators"),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
          ind.weekly && React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--text5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: .5 } }, "Weekly"),
            renderIndicators(ind.weekly)
          ),
          ind.daily && React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--text5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: .5 } }, "Daily"),
            renderIndicators(ind.daily)
          ),
          ind.hourly && React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--text5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: .5 } }, "Hourly"),
            renderIndicators(ind.hourly)
          )
        )
      )
    );
  };

  const renderSnapshots = () => {
    const grouped = groupSnapshots();
    const yKeys = Object.keys(grouped).sort().reverse();
    if (yKeys.length === 0) return React.createElement("div", { style: { textAlign: "center", padding: 30, color: "var(--text6)", fontSize: 12 } }, "No saved snapshots yet.");
    return yKeys.map(yKey => {
      const months = grouped[yKey];
      const isYExp = expandedYear === yKey;
      const totalSnaps = Object.values(months).reduce((a, m) => a + Object.values(m).reduce((b, d) => b + d.snaps.length, 0), 0);
      return React.createElement("div", { key: yKey, style: { marginBottom: 10, borderRadius: 10, background: "var(--bg3)", border: "1px solid var(--border)", overflow: "hidden" } },
        React.createElement("div", { onClick: () => setExpandedYear(isYExp ? null : yKey), style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", cursor: "pointer", background: isYExp ? "var(--bg4)" : "transparent" } },
          React.createElement("span", { style: { fontSize: 13, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)" } }, (isYExp ? "\u25be " : "\u25b8 ") + yKey),
          React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, totalSnaps + " snapshot" + (totalSnaps !== 1 ? "s" : ""))
        ),
        isYExp && Object.keys(months).sort().reverse().map(mKey => {
          const days = months[mKey];
          const isMExp = expandedMonth === mKey;
          const mSnaps = Object.values(days).reduce((a, d) => a + d.snaps.length, 0);
          return React.createElement("div", { key: mKey, style: { borderTop: "1px solid var(--border)" } },
            React.createElement("div", { onClick: () => setExpandedMonth(isMExp ? null : mKey), style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px 8px 28px", cursor: "pointer", background: isMExp ? "var(--bg4)" : "transparent" } },
              React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, (isMExp ? "\u25be " : "\u25b8 ") + mKey.split("-").slice(1).join("-")),
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, mSnaps + " snap" + (mSnaps !== 1 ? "s" : "")),
                React.createElement("span", { onClick: async (e) => { e.stopPropagation(); if (await showConfirm("Delete all " + mSnaps + " snapshot" + (mSnaps !== 1 ? "s" : "") + " in " + mKey.split("-").slice(1).join("-") + "?")) deleteSnapshotsWhere(s => { const d = new Date(s.savedAt); return String(d.getFullYear()) + "-" + d.toLocaleString("en-IN", { month: "long" }) === mKey; }); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, mSnaps === 1 ? "Delete" : "Delete All")
              )
            ),
            isMExp && Object.keys(days).sort().reverse().map(dayKey => {
              const day = days[dayKey];
              const isDExp = expandedDay === dayKey;
              return React.createElement("div", { key: dayKey, style: { borderTop: "1px solid var(--border)" } },
                React.createElement("div", { onClick: () => setExpandedDay(isDExp ? null : dayKey), style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 14px 6px 42px", cursor: "pointer", background: isDExp ? "var(--bg4)" : "transparent" } },
                  React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--text3)" } }, (isDExp ? "\u25be " : "\u25b8 ") + day.label),
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                    React.createElement("span", { style: { fontSize: 9, color: "var(--text5)" } }, day.snaps.length + " snap" + (day.snaps.length !== 1 ? "s" : "")),
                    React.createElement("span", { onClick: async (e) => { e.stopPropagation(); if (await showConfirm("Delete all " + day.snaps.length + " snapshot" + (day.snaps.length !== 1 ? "s" : "") + " on " + day.label + "?")) deleteSnapshotsWhere(s => { const d = new Date(s.savedAt); const dk = mKey + "-" + d.getDate(); return dk === dayKey; }); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, day.snaps.length === 1 ? "Delete" : "Delete All")
                  )
                ),
                isDExp && React.createElement("div", { style: { padding: "6px 14px 6px 56px" } },
                  day.snaps.map(snap => snapshotCard(snap))
                )
              );
            })
          );
        })
      );
    });
  };

  return React.createElement("div", null,
    viewingAnalysis && React.createElement(EntryScoreAnalysis, {
      entry: viewingAnalysis,
      onBack: () => setViewingAnalysis(null)
    }),
    !viewingAnalysis && React.createElement(React.Fragment, null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Entry Score"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } }, "Momentum Trading Entry Engine \u00b7 Daily(55%) + Hourly(30%) + Weekly(15%)")
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        React.createElement("button", {
          onClick: exportEntryScores, disabled: !entries.length,
          className: "stx-btn",
          style: { fontSize: 10, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: entries.length ? "pointer" : "default", opacity: entries.length ? 1 : 0.5 }
        }, React.createElement(React.Fragment, null, Ico.download(10), " Export")),
        React.createElement("button", {
          onClick: importEntryScores,
          className: "stx-btn",
          style: { fontSize: 10, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" }
        }, React.createElement(React.Fragment, null, Ico.upload(10), " Import")),
        React.createElement("button", {
          onClick: refreshEntries, disabled: refreshing || !entries.length,
          className: "stx-btn stx-btn-ghost",
          style: { fontSize: 12, padding: "8px 14px", opacity: refreshing || !entries.length ? 0.5 : 1, cursor: refreshing ? "wait" : "pointer" }
        }, refreshing ? "Refreshing..." : React.createElement(React.Fragment, null, Ico.refresh(12), " Refresh")),
        React.createElement("button", { onClick: () => setShowAdd(true), className: "stx-btn stx-btn-primary", style: { fontSize: 12, padding: "8px 16px" } },
          "+ Add Entry"
        )
      )
    ),
    showAdd && React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 } }, "Add New Entry"),
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Ticker"),
          React.createElement("input", { className: "inp", type: "text", placeholder: "e.g. RELIANCE", value: addTicker, onChange: e => setAddTicker(e.target.value.toUpperCase()), style: { width: 140 } })
        ),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Current Price (\u20b9) (optional)"),
          React.createElement("input", { className: "inp", type: "number", placeholder: "Optional \u2014 uses last close", value: addPrice, onChange: e => setAddPrice(e.target.value), style: { width: 120 } })
        ),
        React.createElement("button", {
          onClick: fetchAndScore, disabled: adding, className: "stx-btn stx-btn-primary",
          style: { padding: "8px 18px", fontSize: 12, opacity: adding ? 0.6 : 1, cursor: adding ? "wait" : "pointer" }
        }, adding ? "Calculating..." : "Calculate Score"),
        React.createElement("button", { onClick: () => { setShowAdd(false); setAddErr(""); }, className: "stx-btn stx-btn-ghost", style: { fontSize: 12 } }, "Cancel")
      ),
      addErr && React.createElement("div", { style: { marginTop: 8, fontSize: 11, color: addErr.startsWith("Error") ? "#ef4444" : "#eab308" } }, addErr)
    ),
    entries.length === 0 && React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: 40, color: "var(--text6)", fontSize: 13 } },
      "No entry scores yet. Click \"+ Add Entry\" to analyze a stock."
    ),
    (() => {
      var sortedEntries = entries.slice().sort(function(a, b) { return new Date(b.addedAt) - new Date(a.addedAt); });
      var monthGroups = {};
      sortedEntries.forEach(function(entry) {
        var d = new Date(entry.addedAt);
        var monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        var dayKey = monthKey + "-" + String(d.getDate()).padStart(2, "0");
        var monthLabel = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        var dayLabel = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        if (!monthGroups[monthKey]) monthGroups[monthKey] = { label: monthLabel, days: {} };
        if (!monthGroups[monthKey].days[dayKey]) monthGroups[monthKey].days[dayKey] = { label: dayLabel, entries: [] };
        monthGroups[monthKey].days[dayKey].entries.push(entry);
      });
      var monthKeys = Object.keys(monthGroups).sort().reverse();
      var totalGroups = monthKeys.length;
      var expandedCount = 0;
      monthKeys.forEach(function(mk) {
        if (expandedGroups[mk]) { expandedCount++; return; }
        Object.keys(monthGroups[mk].days).forEach(function(dk) {
          if (expandedGroups[dk]) expandedCount++;
        });
      });
      var allExpanded = expandedCount > 0;
      var toggleAll = function() {
        if (allExpanded) { setExpandedGroups({}); }
        else {
          var newExpanded = {};
          monthKeys.forEach(function(mk) { newExpanded[mk] = true; });
          setExpandedGroups(newExpanded);
        }
      };
      var renderEntryCard = function(entry) {
        var r = entry.result;
        var isExpanded = !!expandedIds[entry.id];
        var capStock = NIFTY_200_UNIQUE.find(function(s) { return s.t === entry.ticker.replace(/\.NS$|\.BO$/, "") + ".NS"; });
        return React.createElement("div", { key: entry.id, className: "stx-card", style: { border: "2px solid " + r.decision.color + "33" } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 } },
            React.createElement("div", null,
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, entry.ticker),
                capStock && capStock.cap ? React.createElement("span", { style: { padding: "2px 7px", borderRadius: 4, background: capStock.cap === "L" ? "rgba(59,130,246,.12)" : "rgba(168,85,247,.12)", color: capStock.cap === "L" ? "#3b82f6" : "#a855f7", border: "1px solid " + (capStock.cap === "L" ? "rgba(59,130,246,.25)" : "rgba(168,85,247,.25)"), fontWeight: 700, fontSize: 9, letterSpacing: 0.3 } }, capStock.cap === "L" ? "Large" : "Mid") : null
              ),
              React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } }, "Added " + new Date(entry.addedAt).toLocaleDateString() + " \u00b7 " + (entry.currentPrice > 0 ? INR(entry.currentPrice) : (r.lastClose ? INR(r.lastClose) + " (Last Close)" : "Last Close")))
            ),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
              React.createElement("div", { textAlign: "right" },
                React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, "Final Score"),
                React.createElement("div", { style: { fontSize: 22, fontWeight: 900, color: r.decision.color, fontFamily: "var(--font-heading)", lineHeight: 1 } }, r.finalScore)
              ),
              React.createElement("div", { onClick: function() { saveSnapshot(entry); }, style: { cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--accent)", fontSize: 13, title: "Save Snapshot" } }, Icons.save(14)),
              React.createElement("div", { onClick: function() { deleteEntry(entry.id); }, style: { cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--text6)", fontSize: 14 }, title: "Delete" }, Icons.trash(14))
            )
          ),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "6px 10px", borderRadius: 8, background: r.decision.color + "12" } },
            React.createElement("span", { style: { fontSize: 12, fontWeight: 800, color: r.decision.color, fontFamily: "var(--font-heading)" } }, r.decision.label),
            React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text5)", fontStyle: "italic" } }, r.decision.position),
            r.todaySpike && React.createElement("span", { title: "Abnormal single-session spike or gap \u2014 score capped at Neutral", style: { fontSize: 8, fontWeight: 700, color: "#f97316", padding: "2px 5px", borderRadius: 3, background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.25)", display: "inline-flex", alignItems: "center", gap: 3 } }, Ico.alertTriangle(8, "#f97316"), " Spike Day"),
            r.hardFilters && r.hardFilters.length > 0 && React.createElement("span", { style: { fontSize: 8, fontWeight: 700, color: "#ef4444", padding: "2px 5px", borderRadius: 3, background: "rgba(239,68,68,.1)" } }, r.hardFilters.length + " filter" + (r.hardFilters.length > 1 ? "s" : ""))
          ),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 } },
            ["weekly", "daily", "hourly"].map(function(tf) {
              var s = r[tf];
              var label = tf === "weekly" ? "Weekly (15%)" : tf === "daily" ? "Daily (55%)" : "Hourly (30%)";
              return React.createElement("div", { key: tf, style: { padding: "6px 8px", borderRadius: 8, background: "var(--bg4)", textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: "var(--text5)", marginBottom: 2 } }, label),
                React.createElement("div", { style: { fontSize: 14, fontWeight: 800, color: s ? s.decision.color : "var(--text6)", fontFamily: "var(--font-heading)" } }, s ? s.total : "N/A"),
                s && React.createElement("div", { style: { fontSize: 8, color: s.decision.color, fontWeight: 600 } }, s.decision.label)
              );
            })
          ),
          scoreMathBlock(r),
          React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 12, marginBottom: 6 } },
            React.createElement("div", { onClick: function() { setExpandedIds(function(prev) { var next = Object.assign({}, prev); next[entry.id] = !next[entry.id]; return next; }); }, style: { fontSize: 10, color: "var(--accent)", cursor: "pointer", fontWeight: 600 } },
              React.createElement(React.Fragment, null, isExpanded ? Ico.chevronUp(10) : Ico.chevronDown(10), " ", isExpanded ? "Hide Details" : "Show Details")
            ),
            window.TechnicalIndicatorsInline && React.createElement("div", { onClick: function() { setViewingAnalysis(viewingAnalysis && viewingAnalysis.id === entry.id ? null : entry); }, style: { fontSize: 10, color: "#f97316", cursor: "pointer", fontWeight: 600 } },
              React.createElement(React.Fragment, null, Ico.activity(13), " Technicals")
            )
          ),
          isExpanded && React.createElement("div", { style: { marginTop: 8 } },
            r.daily && tfSection("Daily Breakdown", r.daily, entry.indicators),
            r.weekly && tfSection("Weekly Breakdown", r.weekly, entry.indicators),
            r.hourly && tfSection("Hourly Breakdown", r.hourly, entry.indicators),
            r.hardFilters && r.hardFilters.length > 0 && React.createElement("div", { style: { marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)" } },
              React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "var(--text3)", marginBottom: 4 } }, "Penalties & Bonuses"),
              r.hardFilters.map(function(f, i) {
                var isBonus = f.indexOf("(+") >= 0;
                var valMatch = f.match(/\([+\-\u2212]?\d+\)$/);
                var valStr = valMatch ? valMatch[0] : "";
                var label = valStr ? f.replace(valStr, "").replace(/\s*—\s*/, " — ").trim() : f;
                return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, lineHeight: 1.5, fontSize: 10 } },
              React.createElement("span", { style: { color: "var(--text3)", flex: 1, minWidth: 0, overflow: "hidden", wordBreak: "break-word" } }, isBonus ? React.createElement(React.Fragment, null, Ico.check(12, "#22c55e"), " ", label) : React.createElement(React.Fragment, null, Ico.alertTriangle(12, "#f59e0b"), " ", label)),
                  valStr && React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "var(--text3)", background: "var(--bg4)", padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", flexShrink: 0 } }, valStr)
                );
              }),
              React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", marginTop: 4 } },
                "Base: " + r.baseScore + " | Penalties: " + r.penalties + " | Bonuses: " + r.bonuses + " \u2192 Final: " + r.finalScore
              )
            )
          )
        );
      };
      return React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", fontWeight: 600 } },
            entries.length + " entr" + (entries.length !== 1 ? "ies" : "y") + " \u00b7 " + monthKeys.length + " group" + (monthKeys.length !== 1 ? "s" : "")
          ),
          entries.length > 0 && React.createElement("div", { onClick: toggleAll, style: { fontSize: 11, color: "var(--accent)", cursor: "pointer", fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "var(--bg4)" } },
            allExpanded ? "\u25b8 Collapse All" : "\u25be Expand All"
          )
        ),
        monthKeys.map(function(monthKey) {
          var mg = monthGroups[monthKey];
          var monthExpanded = !!expandedGroups[monthKey];
          var dayKeys = Object.keys(mg.days).sort().reverse();
          var monthEntryCount = dayKeys.reduce(function(sum, dk) { return sum + mg.days[dk].entries.length; }, 0);
          var allMonthDaysExpanded = dayKeys.length > 0 && dayKeys.every(function(dk) { return expandedGroups[dk]; });
          return React.createElement("div", { key: monthKey, style: { marginBottom: 16 } },
            React.createElement("div", { onClick: function() { setExpandedGroups(function(prev) { var next = Object.assign({}, prev); if (prev[monthKey]) delete next[monthKey]; else next[monthKey] = true; return next; }); }, style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "var(--bg3)", cursor: "pointer", marginBottom: 6, border: "1px solid var(--border)" } },
              React.createElement("span", { style: { fontSize: 12, color: "var(--text)", fontWeight: 700, fontFamily: "var(--font-heading)" } }, monthExpanded ? "\u25be" : "\u25b8"),
              React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, mg.label),
              React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, monthEntryCount + " entr" + (monthEntryCount !== 1 ? "ies" : "y")),
              React.createElement("div", { style: { flex: 1 } }),
              React.createElement("span", { onClick: async function(e) { e.stopPropagation(); var allMonthEntryIds = []; dayKeys.forEach(function(dk) { mg.days[dk].entries.forEach(function(en) { allMonthEntryIds.push(en.id); }); }); if (await showConfirm("Delete all " + monthEntryCount + " entr" + (monthEntryCount !== 1 ? "ies" : "y") + " in " + mg.label + "?")) { saveEntries(entries.filter(function(en) { return allMonthEntryIds.indexOf(en.id) === -1; })); } }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, monthEntryCount === 1 ? "Delete" : "Delete All"),
              React.createElement("div", { onClick: function(e) { e.stopPropagation(); var next = Object.assign({}, expandedGroups); dayKeys.forEach(function(dk) { if (allMonthDaysExpanded) delete next[dk]; else next[dk] = true; }); setExpandedGroups(next); }, style: { fontSize: 10, color: "var(--accent)", cursor: "pointer", fontWeight: 600, padding: "2px 6px", borderRadius: 4 } },
                allMonthDaysExpanded ? "Collapse" : "Expand"
              )
            ),
            monthExpanded && dayKeys.map(function(dayKey) {
              var dg = mg.days[dayKey];
              var dayExpanded = !!expandedGroups[dayKey];
              return React.createElement("div", { key: dayKey, style: { marginBottom: 8 } },
                React.createElement("div", { onClick: function() { setExpandedGroups(function(prev) { var next = Object.assign({}, prev); if (prev[dayKey]) delete next[dayKey]; else next[dayKey] = true; return next; }); }, style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 28px", borderRadius: 6, background: "var(--bg2)", cursor: "pointer", marginBottom: 4 } },
                  React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, dayExpanded ? "\u25be" : "\u25b8"),
                  React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text2)" } }, dg.label),
                  React.createElement("span", { style: { fontSize: 9, color: "var(--text6)" } }, dg.entries.length + " entr" + (dg.entries.length !== 1 ? "ies" : "y")),
                  React.createElement("span", { onClick: async function(e) { e.stopPropagation(); var dayEntryIds = dg.entries.map(function(en) { return en.id; }); if (await showConfirm("Delete all " + dg.entries.length + " entr" + (dg.entries.length !== 1 ? "ies" : "y") + " on " + dg.label + "?")) { saveEntries(entries.filter(function(en) { return dayEntryIds.indexOf(en.id) === -1; })); } }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", marginLeft: 4, whiteSpace: "nowrap" } }, dg.entries.length === 1 ? "Delete" : "Delete All")
                ),
                dayExpanded && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))", gap: 14, paddingLeft: 28 } },
                  dg.entries.map(function(entry) { return renderEntryCard(entry); })
                )
              );
            })
          );
        })
      );
    })(),

    // Performance Tracker section
    !viewingAnalysis && entries.length > 0 && React.createElement("div", { style: { marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 } },
      React.createElement("div", { onClick: function() { setPerfTrackerExpanded(!perfTrackerExpanded); }, style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: perfTrackerExpanded ? 12 : 0, padding: "8px 0" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, (perfTrackerExpanded ? "\u25be " : "\u25b8 ") + "Entry Score Performance Tracker")
        ),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          perfTrackerExpanded && React.createElement("div", { onClick: function(e) { e.stopPropagation(); exportEntryScoreCSV(); }, style: { fontSize: 10, color: "var(--text6)", cursor: "pointer", fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "var(--bg4)" } }, React.createElement(React.Fragment, null, Ico.download(10), " CSV")),
          perfTrackerExpanded && React.createElement("div", { onClick: function(e) { e.stopPropagation(); refreshPerfTracker(); }, style: { fontSize: 10, color: perfTrackerRefreshing ? "var(--text6)" : "var(--accent)", cursor: perfTrackerRefreshing ? "wait" : "pointer", fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "var(--bg4)" } }, perfTrackerRefreshing ? "Refreshing..." : React.createElement(React.Fragment, null, Ico.refresh(12), " Refresh Prices"))
        )
      ),
      perfTrackerExpanded && React.createElement("div", { style: { overflowX: "auto", marginTop: 4 } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 11 } },
          React.createElement("thead", null,
            React.createElement("tr", null,
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Stock"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Date Added"),
              React.createElement("th", { colSpan: 6, style: { padding: "8px 10px", textAlign: "center", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "none", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Entry Score"),
              React.createElement("th", { title: ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-day forward confidence (lognormal) frozen on the date added", style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "none", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "10DLN"),
              React.createElement("th", { title: ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-day forward confidence (empirical) frozen on the date added", style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "none", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "10DEM"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "none", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Price on Add"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "none", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Days"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "none", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "Current Price"),
              React.createElement("th", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "none", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, "% Change")
            ),
            React.createElement("tr", null,
              React.createElement("th", { style: { padding: "4px 10px", background: "var(--bg3)", borderBottom: "2px solid var(--border)" } }),
              React.createElement("th", { style: { padding: "4px 10px", background: "var(--bg3)", borderBottom: "2px solid var(--border)" } }),
              ["Hourly", "Daily", "Weekly", "Base", "Bonus/Pen", "Final"].map(function(sub) {
                return React.createElement("th", { key: sub, style: { padding: "4px 10px", textAlign: "center", fontWeight: 600, color: "var(--text5)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" } }, sub);
              }),
              React.createElement("th", { style: { padding: "4px 10px", background: "var(--bg3)", borderBottom: "2px solid var(--border)" } }),
              React.createElement("th", { style: { padding: "4px 10px", background: "var(--bg3)", borderBottom: "2px solid var(--border)" } }),
              React.createElement("th", { style: { padding: "4px 10px", background: "var(--bg3)", borderBottom: "2px solid var(--border)" } }),
              React.createElement("th", { style: { padding: "4px 10px", background: "var(--bg3)", borderBottom: "2px solid var(--border)" } }),
              React.createElement("th", { style: { padding: "4px 10px", background: "var(--bg3)", borderBottom: "2px solid var(--border)" } }),
              React.createElement("th", { style: { padding: "4px 10px", background: "var(--bg3)", borderBottom: "2px solid var(--border)" } })
            )
          ),
          React.createElement("tbody", null,
            entries.map(function(entry) {
              var addedDate = new Date(entry.addedAt);
              var now = new Date();
              var _startMs = Date.UTC(addedDate.getFullYear(), addedDate.getMonth(), addedDate.getDate());
              var _endMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
              var daysElapsed = 0;
              for (var _t = _startMs; _t < _endMs; _t += 86400000) { var _day = new Date(_t).getUTCDay(); if (_day !== 0 && _day !== 6) daysElapsed++; }
              var fr = entry.frozenResult || entry.result;
              var dailyScore = fr && fr.daily ? fr.daily.total : null;
              var weeklyScore = fr && fr.weekly ? fr.weekly.total : null;
              var hourlyScore = fr && fr.hourly ? fr.hourly.total : null;
              var priceOnAdd = entry.currentPrice || entry.frozenResult?.lastClose || entry.result?.lastClose || 0;
              var currentPrice = perfTrackerPrices[entry.ticker] || 0;
              var pctChange = priceOnAdd > 0 && currentPrice > 0 ? ((currentPrice - priceOnAdd) / priceOnAdd * 100) : null;
              var pctColor = pctChange === null ? "var(--text6)" : pctChange >= 0 ? "#22c55e" : "#ef4444";
              var scoreCellStyle = { padding: "8px 10px", textAlign: "center", fontWeight: 800, fontFamily: "var(--font-heading)", fontSize: 11 };
              var dailyColor = fr && fr.daily && fr.daily.decision ? fr.daily.decision.color : "var(--text6)";
              var weeklyColor = fr && fr.weekly && fr.weekly.decision ? fr.weekly.decision.color : "var(--text6)";
              var hourlyColor = fr && fr.hourly && fr.hourly.decision ? fr.hourly.decision.color : "var(--text6)";
              var finalScore = fr ? fr.finalScore : null;
              var finalColor = fr && fr.decision ? fr.decision.color : "var(--text6)";
              var rowBg = "rgba(220, 170, 190, 0.10)";
              return React.createElement("tr", { key: entry.id, style: { borderBottom: "1px solid var(--border)", background: rowBg } },
                React.createElement("td", { style: { padding: "8px 10px", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", whiteSpace: "nowrap" } }, entry.ticker),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", color: "var(--text3)", whiteSpace: "nowrap" } }, addedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: hourlyColor }) }, hourlyScore !== null ? hourlyScore : "—"),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: dailyColor }) }, dailyScore !== null ? dailyScore : "—"),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: weeklyColor }) }, weeklyScore !== null ? weeklyScore : "—"),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: "var(--text4)", fontSize: 10 }) }, fr && fr.baseScore != null ? fr.baseScore : "—"),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "left", whiteSpace: "normal", wordBreak: "break-word", maxWidth: 180 } },
                  fr && fr.hardFilters && fr.hardFilters.length > 0 ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
                    fr.hardFilters.map(function(hf, hi) {
                      var isBonus = hf.indexOf("(+") >= 0;
                      return React.createElement("span", { key: hi, style: { fontSize: 9, fontWeight: 600, color: isBonus ? "#22c55e" : "#ef4444", background: isBonus ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", padding: "1px 5px", borderRadius: 3, lineHeight: 1.5 } }, hf);
                    })
                  ) : "—"
                ),
                React.createElement("td", { style: Object.assign({}, scoreCellStyle, { color: finalColor, fontWeight: 900 }) }, finalScore !== null ? finalScore : "—"),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: entry.conf10dLog != null ? (entry.conf10dLog >= 70 ? "#16a34a" : entry.conf10dLog >= 40 ? "#d97706" : "#dc2626") : "var(--text6)", fontFamily: "var(--font-mono)" } }, entry.conf10dLog != null ? Number(entry.conf10dLog).toFixed(0) : "—"),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: entry.conf10dEmp != null ? (entry.conf10dEmp >= 70 ? "#16a34a" : entry.conf10dEmp >= 40 ? "#d97706" : "#dc2626") : "var(--text6)", fontFamily: "var(--font-mono)" } }, entry.conf10dEmp != null ? Number(entry.conf10dEmp).toFixed(0) : "—"),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", color: "var(--text2)", fontFamily: "var(--font-mono)" } }, priceOnAdd > 0 ? INR(priceOnAdd) : "—"),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", color: "var(--text4)" } }, daysElapsed),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", color: "var(--text2)", fontFamily: "var(--font-mono)" } }, currentPrice > 0 ? INR(currentPrice) : (perfTrackerRefreshing ? "..." : "—")),
                React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 700, color: pctColor, fontFamily: "var(--font-mono)" } }, pctChange !== null ? (pctChange >= 0 ? "+" : "") + pctChange.toFixed(2) + "%" : "—")
              );
            })
          )
        )
      )
    ),

    // Snapshots section
    !viewingAnalysis && React.createElement("div", { style: { marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 } },
      React.createElement("div", { onClick: () => setShowSnapshots(!showSnapshots), style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: showSnapshots ? 12 : 0, padding: "8px 0" } },
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, (showSnapshots ? "\u25be " : "\u25b8 ") + "Saved Snapshots"),
        snapshots.length > 0 && React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", background: "var(--bg4)", padding: "3px 8px", borderRadius: 10 } }, snapshots.length + " snapshot" + (snapshots.length !== 1 ? "s" : ""))
      ),
      showSnapshots && React.createElement("div", { style: { marginTop: 4 } }, renderSnapshots())
    )
    ) /* end Fragment */
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: 10 Days Confidence Score Performance Tracker (Pulse sub-tab)
   Tracks whether the 10-day confidence score actually pays off. Each added
   stock freezes Date Added, Confidence Score (next 10 days), Entry Score and
   Price at add time; Days is computed live from the added date; Current Price
   & % Change update whenever the table is refreshed.
   ══════════════════════════════════════════════════════════════════════════ */
const LS_CONF_TRACKER = "stox_conf_tracker";
const LS_CONF_PERF_PRICES = "stox_conf_tracker_prices";

const ConfidenceTracker = () => {
  const TI = window.TechIndicators;
  const DF = window.OHLCVFetcher;
  const [tracked, setTracked] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [pricesBackfilled, setPricesBackfilled] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addTicker, setAddTicker] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [prices, setPrices] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState({});
  const [sortKey, setSortKey] = useState("addedAt");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    (async () => {
      try {
        const val = await dbGetSetting(LS_CONF_TRACKER);
        if (val && Array.isArray(val)) setTracked(val);
      } catch (e) {}
      try {
        const p = await dbGetSetting(LS_CONF_PERF_PRICES);
        if (p && typeof p === "object" && Object.keys(p).length) { setPrices(p); setPricesBackfilled(true); }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const saveTracked = (arr) => {
    setTracked(arr);
    setSelected((prev) => {
      const ids = new Set(arr.map((t) => t.id));
      const next = {};
      Object.keys(prev).forEach((id) => { if (ids.has(Number(id))) next[id] = true; });
      return next;
    });
    dbSetSetting(LS_CONF_TRACKER, arr);
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  };

  const savePrices = (p) => { setPrices(p); dbSetSetting(LS_CONF_PERF_PRICES, p); };

  /* Backfill current prices on first load when none cached */
  useEffect(() => {
    if (!loaded || pricesBackfilled || !tracked.length || !DF || refreshing) return;
    (async () => {
      setRefreshing(true);
      const p = {};
      for (let i = 0; i < tracked.length; i++) {
        try {
          const d = await fetchTickerPrice(tracked[i].ticker);
          if (d && d.price > 0) p[tracked[i].ticker] = d.price;
        } catch (e) {}
      }
      savePrices(p);
      setPricesBackfilled(true);
      setRefreshing(false);
    })();
  }, [loaded]);

  const refreshPrices = async () => {
    if (!tracked.length || refreshing) return;
    setRefreshing(true);
    const oldPrices = { ...prices };
    const p = {};
    for (let i = 0; i < tracked.length; i++) {
      try {
        const d = await fetchTickerPrice(tracked[i].ticker);
        if (d && d.price > 0) p[tracked[i].ticker] = d.price;
      } catch (e) {}
    }
    savePrices(p);
    try { if (window.__fsa && window.__fsa.writeNow) await window.__fsa.writeNow(); } catch (e) {}
    setRefreshing(false);
    const changes = [];
    const noChanges = [];
    tracked.forEach((tr) => {
      const oldPrice = oldPrices[tr.ticker];
      const newPrice = p[tr.ticker];
      const base = tr.currentPrice || 0;
      if (!oldPrice || !newPrice || !base) { noChanges.push(tr.ticker); return; }
      const oldPct = (oldPrice - base) / base * 100;
      const newPct = (newPrice - base) / base * 100;
      const diff = Math.round((newPct - oldPct) * 100) / 100;
      const label = tr.ticker.replace(".NS", "");
      if (Math.abs(diff) >= 0.01) {
        changes.push(label + " " + (diff > 0 ? "+" : "") + diff.toFixed(2) + "% (" + oldPct.toFixed(1) + "% \u2192 " + newPct.toFixed(1) + "%)");
      } else {
        noChanges.push(label);
      }
    });
    if (changes.length > 0) {
      let msg = changes.length + " % change" + (changes.length !== 1 ? "s" : "") + " updated: " + changes.join(", ");
      if (noChanges.length > 0) msg += " \u00b7 " + noChanges.length + " unchanged";
      showToast(msg, 0);
    } else {
      showToast("Prices refreshed \u2014 no % change updates", 0);
    }
  };

  const addAndTrack = async () => {
    if (!addTicker.trim()) { setAddErr("Enter a ticker."); return; }
    if (!TI || !DF) { setAddErr("Analysis engine not ready."); return; }
    setAdding(true); setAddErr("");
    try {
      const tk = addTicker.trim().toUpperCase().replace(/\.NS$|\.BO$/, "");
      if (!tk) { setAddErr("Enter a valid ticker."); setAdding(false); return; }
      const [resW, resD, resH] = await Promise.all([
        DF.fetchOHLCVCached(tk, "weekly"),
        DF.fetchOHLCVCached(tk, "daily"),
        DF.fetchOHLCVCached(tk, "1h"),
      ]);
      if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) {
        setAddErr("Insufficient data for " + tk); setAdding(false); return;
      }
      const lastDailyClose = resD.data[resD.data.length - 1].c;
      const price = parseFloat(addPrice) || lastDailyClose || 0;
      let _idxD = null, _idxW = null;
      try { const _r1 = await DF.fetchOHLCVCached("^NSEI", "daily"); _idxD = (_r1 && _r1.data) || null; } catch (e) {}
      try { const _r2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); _idxW = (_r2 && _r2.data) || null; } catch (e) {}
      const result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, _idxD, _idxW);
      let confidence = null, conf10dLog = null, conf10dEmp = null;
      try {
        const conf = TI.computeTenDayForwardConfidence(resH.data, resD.data, _idxD, buildEntryScoreContext(result));
        if (conf && conf.confidence != null) { confidence = conf.confidence; conf10dLog = conf.confidenceLognormal; conf10dEmp = conf.confidenceEmpirical; }
      } catch (e) {}
      const row = {
        id: Date.now(),
        ticker: tk,
        addedAt: new Date().toISOString(),
        confidence: confidence != null ? Math.round(confidence * 10) / 10 : null,
        conf10dLog: conf10dLog != null ? Math.round(conf10dLog * 10) / 10 : null,
        conf10dEmp: conf10dEmp != null ? Math.round(conf10dEmp * 10) / 10 : null,
        entryScore: result && result.finalScore != null ? result.finalScore : null,
        entryDecision: result && result.decision ? result.decision.label : null,
        currentPrice: price
      };
      saveTracked([row, ...tracked]);
      if (price > 0) savePrices(Object.assign({}, prices, { [tk]: price }));
      setAddTicker(""); setAddPrice(""); setShowAdd(false);
      showToast("Added " + tk + " to the Confidence tracker" + (confidence != null ? " \u00b7 Conf " + confidence + "/100" : ""), 3000);
    } catch (e) { setAddErr("Error: " + (e.message || "Failed")); }
    setAdding(false);
  };

  const deleteTracked = async (id) => {
    const row = tracked.find((t) => t.id === id);
    if (row && !(await showConfirm("Remove " + row.ticker + " from the Confidence Score tracker?"))) return;
    saveTracked(tracked.filter((t) => t.id !== id));
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = Object.assign({}, prev);
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = Object.assign({}, prev);
      const allChecked = sorted.length > 0 && sorted.every((t) => next[t.id]);
      sorted.forEach((t) => { if (allChecked) delete next[t.id]; else next[t.id] = true; });
      return next;
    });
  };

  const deleteSelected = async () => {
    const ids = Object.keys(selected).filter((id) => selected[id]).map(Number);
    if (!ids.length) return;
    const names = tracked.filter((t) => ids.indexOf(t.id) >= 0).map((t) => t.ticker);
    if (!(await showConfirm("Remove " + names.length + " stock" + (names.length !== 1 ? "s" : "") + " from the Confidence Score tracker? (" + names.join(", ") + ")"))) return;
    saveTracked(tracked.filter((t) => ids.indexOf(t.id) < 0));
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const exportConfCSV = () => {
    var rows = [["Stock", "Date Added", "10DLN", "10DEM", "Entry Score", "Price on Add", "Days", "Current Price", "% Change"]];
    var now = new Date();
    tracked.forEach(function (tr) {
      var addedDate = new Date(tr.addedAt);
      var _startMs = Date.UTC(addedDate.getFullYear(), addedDate.getMonth(), addedDate.getDate());
      var _endMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      var days = 0;
      for (var _t = _startMs; _t < _endMs; _t += 86400000) { var _day = new Date(_t).getUTCDay(); if (_day !== 0 && _day !== 6) days++; }
      var current = prices[tr.ticker] || "";
      var pct = tr.currentPrice > 0 && current > 0 ? ((current - tr.currentPrice) / tr.currentPrice * 100).toFixed(2) : "";
      var dateStr = addedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      function esc(v) { var s = String(v); return s.indexOf(",") >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s; }
      rows.push([esc(tr.ticker), esc(dateStr), tr.conf10dLog != null ? tr.conf10dLog : "", tr.conf10dEmp != null ? tr.conf10dEmp : "", tr.entryScore != null ? tr.entryScore : "", tr.currentPrice || "", days, current, pct].join(","));
    });
    var csv = rows.join("\r\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "stox-confidence-tracker-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Exported " + tracked.length + " tracked stocks to CSV", 3000);
  };

  var now = new Date();
  var tradingDays = function (addedAt) {
    var addedDate = new Date(addedAt);
    var _startMs = Date.UTC(addedDate.getFullYear(), addedDate.getMonth(), addedDate.getDate());
    var _endMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    var days = 0;
    for (var _t = _startMs; _t < _endMs; _t += 86400000) { var _day = new Date(_t).getUTCDay(); if (_day !== 0 && _day !== 6) days++; }
    return days;
  };
  var rowPct = function (tr) {
    var priceOnAdd = tr.currentPrice || 0;
    var currentPrice = prices[tr.ticker] || 0;
    return priceOnAdd > 0 && currentPrice > 0 ? ((currentPrice - priceOnAdd) / priceOnAdd * 100) : null;
  };
  var sorted = tracked.slice().sort(function (a, b) {
    var dir = sortDir === "desc" ? -1 : 1;
    var av, bv;
    if (sortKey === "ticker") { av = a.ticker; bv = b.ticker; return dir * av.localeCompare(bv); }
    if (sortKey === "addedAt") { av = new Date(a.addedAt).getTime(); bv = new Date(b.addedAt).getTime(); return dir * (av - bv); }
    if (sortKey === "confidence") { av = a.conf10dLog != null ? a.conf10dLog : -1; bv = b.conf10dLog != null ? b.conf10dLog : -1; }
    else if (sortKey === "entryScore") { av = a.entryScore != null ? a.entryScore : -1; bv = b.entryScore != null ? b.entryScore : -1; }
    else if (sortKey === "priceOnAdd") { av = a.currentPrice || 0; bv = b.currentPrice || 0; }
    else if (sortKey === "days") { av = tradingDays(a.addedAt); bv = tradingDays(b.addedAt); }
    else if (sortKey === "currentPrice") { av = prices[a.ticker] || 0; bv = prices[b.ticker] || 0; }
    else if (sortKey === "pct") { av = rowPct(a); bv = rowPct(b); av = av == null ? -999 : av; bv = bv == null ? -999 : bv; }
    else { av = 0; bv = 0; }
    return dir * (av - bv);
  });
  var selectedCount = Object.keys(selected).filter(function(id) { return selected[id]; }).length;
  var arrow = function (key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? React.createElement("span", { style: { display: "inline-flex", verticalAlign: "middle" } }, Ico.triangleUp(10, "var(--accent)")) : React.createElement("span", { style: { display: "inline-flex", verticalAlign: "middle" } }, Ico.triangleDown(10, "var(--accent)"));
  };
  var thStyle = { padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, background: "var(--bg3)" };
  var thRight = Object.assign({}, thStyle, { textAlign: "right" });
  var tdStyle = { padding: "8px 10px", fontSize: 11, borderBottom: "1px solid var(--border)" };
  var tdRight = Object.assign({}, tdStyle, { textAlign: "right" });

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "10 Days Confidence Score Performance Tracker"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } },
          "Tracks whether the " + ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-day confidence score pays off \u00b7 Confidence, Entry Score & Price frozen at add \u00b7 Current Price & % Change refresh live"
        )
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        tracked.length > 0 && React.createElement("button", {
          onClick: refreshPrices, disabled: refreshing,
          className: "stx-btn",
          style: { fontSize: 10, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: refreshing ? "var(--text6)" : "var(--accent)", cursor: refreshing ? "wait" : "pointer" }
        }, refreshing ? "Refreshing..." : React.createElement(React.Fragment, null, Ico.refresh(12), " Refresh Prices")),
        tracked.length > 0 && React.createElement("button", {
          onClick: exportConfCSV,
          className: "stx-btn",
          style: { fontSize: 10, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" }
        }, React.createElement(React.Fragment, null, Ico.download(10), " CSV")),
        React.createElement("button", {
          onClick: () => { setShowAdd(!showAdd); setAddErr(""); },
          className: "stx-btn stx-btn-primary",
          style: { fontSize: 12, padding: "8px 16px" }
        }, showAdd ? "Cancel" : "+ Add Entry")
      )
    ),
    showAdd && React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
      React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 } }, "Add Stock to Tracker"),
      React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 10 } },
        "Freezes Date Added, " + ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-day Confidence Score, Entry Score and price at this moment."
      ),
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Ticker"),
          React.createElement("input", { className: "inp", type: "text", placeholder: "e.g. RELIANCE", value: addTicker, onChange: (e) => setAddTicker(e.target.value.toUpperCase()), style: { width: 140 } })
        ),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Current Price (\u20b9) (optional)"),
          React.createElement("input", { className: "inp", type: "number", placeholder: "Optional \u2014 uses last close", value: addPrice, onChange: (e) => setAddPrice(e.target.value), style: { width: 120 } })
        ),
        React.createElement("button", {
          onClick: addAndTrack, disabled: adding, className: "stx-btn stx-btn-primary",
          style: { padding: "8px 18px", fontSize: 12, opacity: adding ? 0.6 : 1, cursor: adding ? "wait" : "pointer" }
        }, adding ? "Adding..." : "Add & Freeze")
      ),
      addErr && React.createElement("div", { style: { marginTop: 8, fontSize: 11, color: addErr.indexOf("Error") === 0 ? "#ef4444" : "#eab308" } }, addErr)
    ),
    !tracked.length && React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: 40, color: "var(--text6)", fontSize: 13 } },
      "No tracked stocks yet. Click \"+ Add Entry\" to start tracking a stock's " + ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-day confidence score."
    ),
    selectedCount > 0 && React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(6,182,212,.08)", border: "1px solid rgba(6,182,212,.25)" } },
      React.createElement("span", { style: { fontSize: 11, color: "var(--text)", fontWeight: 600 } }, selectedCount + " selected"),
      React.createElement("button", {
        onClick: deleteSelected,
        className: "stx-btn",
        style: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, padding: "5px 12px", border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.08)", color: "#ef4444", cursor: "pointer", fontFamily: "inherit" }
      }, Icons.trash(12), " Delete " + selectedCount),
      React.createElement("button", {
        onClick: () => setSelected({}),
        className: "stx-btn",
        style: { fontSize: 10, padding: "5px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" }
      }, "Clear")
    ),
    tracked.length > 0 && React.createElement("div", { style: { overflowX: "auto", marginTop: 4 } },
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 11 } },
        React.createElement("thead", null,
          React.createElement("tr", null,
            React.createElement("th", { style: Object.assign({}, thStyle, { textAlign: "center", width: 36 }) },
              React.createElement("input", { type: "checkbox", checked: sorted.length > 0 && sorted.every(function(t) { return selected[t.id]; }), onChange: toggleSelectAll, style: { accentColor: "var(--accent)", cursor: "pointer", width: 13, height: 13 } })
            ),
            React.createElement("th", { style: thStyle, title: "Sort by stock", onClick: function() { toggleSort("ticker"); } }, ["Stock", arrow("ticker")]),
            React.createElement("th", { style: thStyle, title: "Sort by date added", onClick: function() { toggleSort("addedAt"); } }, ["Date Added", arrow("addedAt")]),
            React.createElement("th", { style: Object.assign({}, thStyle, { textAlign: "center" }), title: "Sort by lognormal confidence score", onClick: function() { toggleSort("confidence"); } }, ["10DLN", arrow("confidence")]),
            React.createElement("th", { style: Object.assign({}, thStyle, { textAlign: "center" }) }, "10DEM"),
            React.createElement("th", { style: Object.assign({}, thStyle, { textAlign: "center" }), title: "Sort by entry score", onClick: function() { toggleSort("entryScore"); } }, ["Entry Score", arrow("entryScore")]),
            React.createElement("th", { style: thRight, title: "Sort by price on add", onClick: function() { toggleSort("priceOnAdd"); } }, ["Price on Add", arrow("priceOnAdd")]),
            React.createElement("th", { style: thRight, title: "Sort by days held", onClick: function() { toggleSort("days"); } }, ["Days", arrow("days")]),
            React.createElement("th", { style: thRight, title: "Sort by current price", onClick: function() { toggleSort("currentPrice"); } }, ["Current Price", arrow("currentPrice")]),
            React.createElement("th", { style: thRight, title: "Sort by % change", onClick: function() { toggleSort("pct"); } }, ["% Change", arrow("pct")]),
            React.createElement("th", { style: Object.assign({}, thStyle, { width: 40 }) })
          )
        ),
        React.createElement("tbody", null,
          sorted.map(function (tr) {
            var addedDate = new Date(tr.addedAt);
            var daysElapsed = tradingDays(tr.addedAt);
            var priceOnAdd = tr.currentPrice || 0;
            var currentPrice = prices[tr.ticker] || 0;
            var pctChange = rowPct(tr);
            var pctColor = pctChange === null ? "var(--text6)" : pctChange >= 0 ? "#22c55e" : "#ef4444";
            var esColor = "var(--text6)";
            if (tr.entryDecision && SCREENER_DECISION_MAP[tr.entryDecision]) esColor = SCREENER_DECISION_MAP[tr.entryDecision].color;
            var rowBg = "rgba(220, 170, 190, 0.10)";
            return React.createElement("tr", { key: tr.id, style: { borderBottom: "1px solid var(--border)", background: selected[tr.id] ? "rgba(6,182,212,.12)" : rowBg } },
              React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center", width: 36 }) },
                React.createElement("input", { type: "checkbox", checked: !!selected[tr.id], onChange: function() { toggleSelect(tr.id); }, style: { accentColor: "var(--accent)", cursor: "pointer", width: 13, height: 13 } })
              ),
              React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", whiteSpace: "nowrap" }) }, tr.ticker),
              React.createElement("td", { style: Object.assign({}, tdStyle, { color: "var(--text3)", whiteSpace: "nowrap" }) }, addedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })),
              React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center", fontWeight: 800, fontFamily: "var(--font-heading)", color: tr.conf10dLog != null ? (tr.conf10dLog >= 70 ? "#16a34a" : tr.conf10dLog >= 40 ? "#d97706" : "#dc2626") : "var(--text6)" }) }, tr.conf10dLog != null ? Number(tr.conf10dLog).toFixed(0) : "\u2014"),
              React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center", fontWeight: 800, fontFamily: "var(--font-heading)", color: tr.conf10dEmp != null ? (tr.conf10dEmp >= 70 ? "#16a34a" : tr.conf10dEmp >= 40 ? "#d97706" : "#dc2626") : "var(--text6)" }) }, tr.conf10dEmp != null ? Number(tr.conf10dEmp).toFixed(0) : "\u2014"),
              React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center", fontWeight: 800, fontFamily: "var(--font-heading)", color: esColor }) }, tr.entryScore != null ? tr.entryScore : "\u2014"),
              React.createElement("td", { style: Object.assign({}, tdRight, { color: "var(--text2)", fontFamily: "var(--font-mono)" }) }, priceOnAdd > 0 ? INR(priceOnAdd) : "\u2014"),
              React.createElement("td", { style: Object.assign({}, tdRight, { color: "var(--text4)" }) }, daysElapsed),
              React.createElement("td", { style: Object.assign({}, tdRight, { color: "var(--text2)", fontFamily: "var(--font-mono)" }) }, currentPrice > 0 ? INR(currentPrice) : (refreshing ? "..." : "\u2014")),
              React.createElement("td", { style: Object.assign({}, tdRight, { fontWeight: 700, color: pctColor, fontFamily: "var(--font-mono)" }) }, pctChange !== null ? (pctChange >= 0 ? "+" : "") + pctChange.toFixed(2) + "%" : "\u2014"),
              React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                React.createElement("button", {
                  onClick: () => deleteTracked(tr.id),
                  title: "Remove from tracker",
                  style: { border: "none", background: "transparent", cursor: "pointer", padding: 2, color: "var(--text6)" }
                }, Icons.trash(13))
              )
            );
          })
        )
      )
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: Backtesting (Pulse sub-tab)
   Replays a ticker's last N trading days as-of historical dates. At each past
   date D the daily/hourly/weekly/index series are sliced to end at D (no
   lookahead) and the SAME production engines run — computeMultiTFEntryScore
   (Entry Score, H/D/W) and computeTenDayForwardConfidence (10-Day Confidence).
   The +4% / 10-session target is then graded on candles strictly after D
   (Touch Hit = intraday high reaches +4%; Close Hit = a close reaches +4%).
   Output: score-bucket accuracy tables + correlations + per-date CSV.
   ══════════════════════════════════════════════════════════════════════════ */

function _btDateStr(c) { return String(c && c.t).slice(0, 10); }

function _btSliceByDate(arr, dateStr) {
  if (!arr || !arr.length) return null;
  var n = 0;
  for (var i = 0; i < arr.length; i++) {
    if (_btDateStr(arr[i]) <= dateStr) n = i + 1;
    else break;
  }
  return n > 0 ? arr.slice(0, n) : null;
}

function _btHourlyUpTo(hourly, dateStr, maxBars) {
  if (!hourly || !hourly.length) return null;
  var end = 0;
  for (var i = 0; i < hourly.length; i++) {
    if (_btDateStr(hourly[i]) <= dateStr) end = i + 1;
    else break;
  }
  if (end === 0) return null;
  var start = Math.max(0, end - (maxBars || 420));
  return hourly.slice(start, end);
}

function _btDailyUpTo(daily, dateStr, maxBars) {
  if (!daily || !daily.length) return null;
  var end = 0;
  for (var i = 0; i < daily.length; i++) {
    if (_btDateStr(daily[i]) <= dateStr) end = i + 1;
    else break;
  }
  if (end === 0) return null;
  var start = Math.max(0, end - (maxBars || 600));
  return daily.slice(start, end);
}

function _btPearson(xs, ys) {
  var n = xs.length;
  if (n < 3) return null;
  var sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (var i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i]; sxy += xs[i] * ys[i];
  }
  var denom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return denom === 0 ? null : (n * sxy - sx * sy) / denom;
}

function _btEvalOne(TI, d1, h1, w1, idxD, i) {
  var D = _btDateStr(d1[i]);
  var entry = d1[i].c;
  var daySlice = _btDailyUpTo(d1, D, 250);
  var wSlice = _btSliceByDate(w1, D);
  var idxSlice = _btSliceByDate(idxD, D);
  if (idxSlice && idxSlice.length > 300) idxSlice = idxSlice.slice(idxSlice.length - 300);
  var hSliceC = _btHourlyUpTo(h1, D, 420);
  var hSliceE = _btHourlyUpTo(h1, D, 120);

  var entryScore = null;
  try {
    var mtf = TI.computeMultiTFEntryScore([
      { timeframe: "H", candles: hSliceE },
      { timeframe: "D", candles: daySlice },
      { timeframe: "W", candles: wSlice }
    ], idxSlice, null);
    entryScore = mtf && mtf.multiTF_score != null ? mtf.multiTF_score : null;
  } catch (e) {}

  var conf = null, confLog = null, confEmp = null;
  try {
    var btEntryCtx = mtf ? { entryScore: mtf.multiTF_score, trendHealth: mtf.trendHealth, pullbackQuality: mtf.pullbackQuality, prob4: mtf.prob4, swingPotential: mtf.swingPotential } : null;
    var cr = TI.computeTenDayForwardConfidence(hSliceC, daySlice, idxSlice, btEntryCtx);
    if (cr) { conf = cr.confidence != null ? cr.confidence : null; confLog = cr.confidenceLognormal; confEmp = cr.confidenceEmpirical; }
  } catch (e) {}

  var touchHit = false, closeHit = false, maxHi = entry, minLo = entry;
  for (var k = i + 1; k <= i + 10 && k < d1.length; k++) {
    if (d1[k].h >= entry * 1.04) touchHit = true;
    if (d1[k].c >= entry * 1.04) closeHit = true;
    if (d1[k].h > maxHi) maxHi = d1[k].h;
    if (d1[k].l < minLo) minLo = d1[k].l;
  }
  var fwd5 = i + 5 < d1.length ? (d1[i + 5].c / entry - 1) * 100 : null;
  var fwd10 = i + 10 < d1.length ? (d1[i + 10].c / entry - 1) * 100 : null;
  var fwd20 = i + 20 < d1.length ? (d1[i + 20].c / entry - 1) * 100 : null;
  return {
    date: D, entry: entry, entryScore: entryScore, conf: conf, confLog: confLog, confEmp: confEmp,
    fwd5: fwd5, fwd10: fwd10, fwd20: fwd20,
    touchHit: touchHit, closeHit: closeHit,
    lossHit: fwd10 != null && fwd10 <= -3,
    maxFav: (maxHi / entry - 1) * 100, maxAdv: (minLo / entry - 1) * 100
  };
}

function _btSummarize(rows) {
  var entryBuckets = [
    { label: "70\u2013100", lo: 70, hi: 101, n: 0, s5: 0, s10: 0, s20: 0, s5n: 0, s20n: 0, touch: 0, close: 0, loss: 0, sScore: 0 },
    { label: "50\u201369", lo: 50, hi: 70, n: 0, s5: 0, s10: 0, s20: 0, s5n: 0, s20n: 0, touch: 0, close: 0, loss: 0, sScore: 0 },
    { label: "0\u201349", lo: 0, hi: 50, n: 0, s5: 0, s10: 0, s20: 0, s5n: 0, s20n: 0, touch: 0, close: 0, loss: 0, sScore: 0 }
  ];
  var confBuckets = [
    { label: "70\u2013100", lo: 70, hi: 101, n: 0, touch: 0, close: 0, sConf: 0 },
    { label: "50\u201369", lo: 50, hi: 70, n: 0, touch: 0, close: 0, sConf: 0 },
    { label: "30\u201349", lo: 30, hi: 50, n: 0, touch: 0, close: 0, sConf: 0 },
    { label: "0\u201329", lo: 0, hi: 30, n: 0, touch: 0, close: 0, sConf: 0 }
  ];
  var eXs = [], eYs = [], cXs = [], cTs = [], cCs = [];
  var sumScore = 0, sN = 0, sumConf = 0, cN = 0, sum10 = 0;

  rows.forEach(function (r) {
    if (r.entryScore != null) {
      sumScore += r.entryScore; sN++;
      for (var b = 0; b < entryBuckets.length; b++) {
        var eb = entryBuckets[b];
        if (r.entryScore >= eb.lo && r.entryScore < eb.hi) {
          eb.n++;
          eb.s10 += r.fwd10 != null ? r.fwd10 : 0;
          eb.sScore += r.entryScore;
          eb.s5 += r.fwd5 != null ? r.fwd5 : 0; if (r.fwd5 != null) eb.s5n++;
          eb.s20 += r.fwd20 != null ? r.fwd20 : 0; if (r.fwd20 != null) eb.s20n++;
          if (r.touchHit) eb.touch++;
          if (r.closeHit) eb.close++;
          if (r.lossHit) eb.loss++;
          break;
        }
      }
      if (r.fwd10 != null) { eXs.push(r.entryScore); eYs.push(r.fwd10); sum10 += r.fwd10; }
    }
    if (r.conf != null) {
      sumConf += r.conf; cN++;
      for (var b2 = 0; b2 < confBuckets.length; b2++) {
        var cb = confBuckets[b2];
        if (r.conf >= cb.lo && r.conf < cb.hi) {
          cb.n++; cb.sConf += r.conf;
          if (r.touchHit) cb.touch++;
          if (r.closeHit) cb.close++;
          break;
        }
      }
      cXs.push(r.conf); cTs.push(r.touchHit ? 1 : 0); cCs.push(r.closeHit ? 1 : 0);
    }
  });

  var out = {
    n: rows.length,
    avgEntry: sN ? sumScore / sN : null,
    avgConf: cN ? sumConf / cN : null,
    avgFwd10: eXs.length ? sum10 / eXs.length : null
  };

  entryBuckets.forEach(function (b) {
    out.entryBuckets = out.entryBuckets || [];
    out.entryBuckets.push({
      label: b.label, n: b.n,
      avgScore: b.n ? b.sScore / b.n : null,
      avg5: b.s5n ? b.s5 / b.s5n : null,
      avg10: b.n ? b.s10 / b.n : null,
      avg20: b.s20n ? b.s20 / b.s20n : null,
      touchRate: b.n ? b.touch / b.n : null,
      closeRate: b.n ? b.close / b.n : null,
      lossRate: b.n ? b.loss / b.n : null
    });
  });
  confBuckets.forEach(function (b) {
    out.confBuckets = out.confBuckets || [];
    out.confBuckets.push({
      label: b.label, n: b.n,
      avgConf: b.n ? b.sConf / b.n : null,
      touchRate: b.n ? b.touch / b.n : null,
      closeRate: b.n ? b.close / b.n : null
    });
  });

  out.corrEntry = _btPearson(eXs, eYs);
  out.corrTouch = _btPearson(cXs, cTs);
  out.corrClose = _btPearson(cXs, cCs);

  var ePop = (out.entryBuckets || []).filter(function (b) { return b.n > 0; });
  var cPop = (out.confBuckets || []).filter(function (b) { return b.n > 0; });
  out.verdict = {
    entryGap: ePop.length >= 2 && ePop[0].avg10 != null && ePop[ePop.length - 1].avg10 != null ? ePop[0].avg10 - ePop[ePop.length - 1].avg10 : null,
    confSpread: cPop.length >= 2 && cPop[0].touchRate != null && cPop[cPop.length - 1].touchRate != null ? (cPop[0].touchRate - cPop[cPop.length - 1].touchRate) * 100 : null,
    hiEntryAvg10: ePop.length ? ePop[0].avg10 : null,
    loEntryAvg10: ePop.length ? ePop[ePop.length - 1].avg10 : null,
    hiConfTouch: cPop.length ? cPop[0].touchRate : null,
    loConfTouch: cPop.length ? cPop[cPop.length - 1].touchRate : null
  };
  return out;
}

async function _btRun(bundle, daysBack, onProgress, onDone, onErr, isCancelled) {
  var TI = window.TechIndicators;
  var d1 = bundle.d1, h1 = bundle.h1, w1 = bundle.w1, idxD = bundle.idxD;
  try {
    if (!d1 || d1.length < 50) { onErr("Not enough daily history for " + bundle.ticker + " (need 50+ daily bars)."); return; }
    if (!h1 || h1.length < 60) { onErr("Hourly data unavailable for " + bundle.ticker + " \u2014 try a liquid NSE ticker."); return; }
    var L = d1.length;
    var first = Math.max(0, L - daysBack);
    var idx = [];
    for (var i = first; i < L; i++) if (i + 10 < L) idx.push(i);
    var pending = (L - first) - idx.length;
    var sampleNote = null;
    var MAX_DATES = 280;
    if (idx.length > MAX_DATES) {
      var step = Math.ceil(idx.length / MAX_DATES);
      var sampled = [];
      for (var s = 0; s < idx.length; s += step) sampled.push(idx[s]);
      if (sampled[sampled.length - 1] !== idx[idx.length - 1]) sampled.push(idx[idx.length - 1]);
      sampleNote = "evenly sampled " + sampled.length + " of " + idx.length + " sessions";
      idx = sampled;
    }
    var rows = [];
    var CHUNK = 6;
    for (var c = 0; c < idx.length; c += CHUNK) {
      if (isCancelled && isCancelled()) { onErr("Backtest cancelled \u2014 partial results discarded."); return; }
      var chunkEnd = Math.min(c + CHUNK, idx.length);
      for (var k = c; k < chunkEnd; k++) rows.push(_btEvalOne(TI, d1, h1, w1, idxD, idx[k]));
      if (onProgress) onProgress(Math.min(c + CHUNK, idx.length), idx.length);
      if (c + CHUNK < idx.length) await new Promise(function (res) { setTimeout(res, 0); });
    }
    onDone(rows, idx.length, pending, sampleNote);
  } catch (e) {
    onErr((e && e.message) || String(e));
  }
}

var _btBundleCache = {};
var _btLastResult = null;
var LS_BT_RESULT = "stox_bt_result";
var LS_BT_INPUT = "stox_bt_input";

const BacktestPanel = () => {
  const DF = window.OHLCVFetcher;
  const [ticker, setTicker] = useState(function () { try { var t = JSON.parse(localStorage.getItem(LS_BT_INPUT)); return (t && t.ticker) || ""; } catch (e) { return ""; } });
  const [days, setDays] = useState(function () { try { var t = JSON.parse(localStorage.getItem(LS_BT_INPUT)); return (t && t.days) || 60; } catch (e) { return 60; } });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const [result, setResultState] = useState(function () {
    if (_btLastResult) return _btLastResult;
    try { var v = JSON.parse(localStorage.getItem(LS_BT_RESULT)); if (v && v.log && v.log.length) return v; } catch (e) {}
    return null;
  });
  const setResult = (v) => { _btLastResult = v; try { localStorage.setItem(LS_BT_RESULT, JSON.stringify(v)); } catch (e) {} setResultState(v); };
  const cancelRef = useRef(false);
  const RANGES = [30, 60, 90, 180, 270, 365, 500, 730];

  const run = async () => {
    const tk = (ticker || "").trim().toUpperCase();
    if (!tk) { setErr("Enter a ticker first, e.g. RELIANCE."); return; }
    if (running) return;
    try { localStorage.setItem(LS_BT_INPUT, JSON.stringify({ ticker: tk, days: days })); } catch (e) {}
    setErr(""); setResult(null);
    setProgress({ phase: "Fetching 1h / 1d / 1wk + Nifty history\u2026", done: 0, total: 0 });
    setRunning(true); cancelRef.current = false;
    try {
      let bundle = _btBundleCache[tk];
      if (!bundle) {
        const [h1, d1, w1, idxD] = await Promise.all([
          DF.fetchFromYahooIntraday(tk, "1h", "2y"),
          DF.fetchFromYahooIntraday(tk, "1d", "5y"),
          DF.fetchFromYahooIntraday(tk, "1wk", "5y"),
          DF.fetchFromYahooIntraday("^NSEI", "1d", "5y")
        ]);
        bundle = { ticker: tk, h1, d1, w1, idxD };
        if (d1 && d1.length) _btBundleCache[tk] = bundle;
      }
      await new Promise(function (res) { setTimeout(res, 20); });
      if (cancelRef.current) { setErr("Backtest cancelled \u2014 partial results discarded."); return; }
      await _btRun(bundle, days,
        function (done, total) { setProgress({ phase: "Scoring " + total + " historical sessions\u2026", done: done, total: total }); },
        function (rows, total, pending, sampleNote) {
          if (!rows.length) { setErr("No scorable sessions in this window (need a full 10-session forward window)."); setResult(null); return; }
          var sum = _btSummarize(rows);
          var confCovered = rows.filter(function (r) { return r.conf != null; }).length;
          setResult(Object.assign({
            ticker: tk, days: days, matured: rows.length, pending: pending,
            confCovered: confCovered, sampleNote: sampleNote || null,
            rangeStart: rows[0].date, rangeEnd: rows[rows.length - 1].date,
            log: rows
          }, sum));
        },
        function (msg) { setErr(msg); setResult(null); },
        function () { return cancelRef.current; }
      );
    } catch (e) {
      setErr((e && e.message) || String(e));
    } finally {
      setRunning(false); setProgress(null);
    }
  };

  function escCsv(v) { const s = String(v == null ? "" : Math.round(v * 100) / 100); return s.indexOf(",") >= 0 || s.indexOf('"') >= 0 || s.indexOf("\n") >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s; }

  const exportCSV = () => {
    if (!result || !result.log || !result.log.length) return;
    const header = ["Date", "Entry", "EntryScore", "Conf10d", "10DLN", "10DEM", "Fwd5d%", "Fwd10d%", "Fwd20d%", "TouchHit(+4%)", "CloseHit(+4%)", "Loss(\u2264-3%)", "MaxFav%", "MaxAdv%"];
    const lines = [header.join(",")].concat(result.log.map(function (r) {
      return [r.date, escCsv(r.entry), r.entryScore != null ? r.entryScore : "", r.conf != null ? r.conf : "", r.confLog != null ? r.confLog : "", r.confEmp != null ? r.confEmp : "",
        escCsv(r.fwd5), escCsv(r.fwd10), escCsv(r.fwd20), r.touchHit ? "1" : "0", r.closeHit ? "1" : "0", r.lossHit ? "1" : "0",
        escCsv(r.maxFav), escCsv(r.maxAdv)].join(",");
    }));
    const csv = lines.join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "stox-backtest-" + result.ticker + "-" + result.days + "d-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast("Exported " + result.log.length + " backtested sessions to CSV", 3000);
  };

  var fmt2 = function (v) { return v == null ? "\u2014" : v.toFixed(1); };
  var fmtR = function (v) { return v == null ? "\u2014" : (v > 0 ? "+" : "") + v.toFixed(1) + "%"; };
  var fmtPct = function (v) { return v == null ? "\u2014" : Math.round(v * 100) + "%"; };
  var fmtS = function (v) { return v == null ? "\u2014" : Math.round(v); };
  var retColor = function (v) { return v == null ? "var(--text2)" : v > 0 ? "#22c55e" : v < 0 ? "#ef4444" : "var(--text2)"; };
  var th = { padding: "8px 10px", textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text5)", fontWeight: 700, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  var td = { padding: "8px 10px", fontSize: 12, color: "var(--text2)", borderBottom: "1px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" };
  var tdL = Object.assign({}, td, { textAlign: "left", fontFamily: "var(--font-body)", fontWeight: 700, color: "var(--text)" });

  var Stat = function (label, val, sub, color) {
    return React.createElement("div", { style: { flex: 1, minWidth: 130, padding: "12px 14px", borderRadius: 10, background: "var(--bg4)", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text6)", fontWeight: 700 } }, label),
      React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: color || "var(--text)", marginTop: 3 } }, val),
      sub ? React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, sub) : null
    );
  };

  const cell = (txt, style) => React.createElement("td", { style: style || td }, txt);

  return React.createElement("div", null,

    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Backtesting"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } },
          "Replays the last N trading days as-of-date \u00b7 Entry Score & 10-Day Confidence graded against the next 10 sessions (+4% target)"
        )
      )
    ),

    React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
      React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Stock Ticker"),
          React.createElement("input", { className: "inp", type: "text", placeholder: "e.g. RELIANCE", value: ticker, onChange: function (e) { setTicker(e.target.value.toUpperCase()); }, style: { width: 160 } })
        ),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Backtest Window"),
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            RANGES.map(function (d) {
              return React.createElement("button", {
                key: d, onClick: function () { setDays(d); },
                style: {
                  padding: "8px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                  border: "1px solid " + (days === d ? "var(--accent)" : "var(--border)"),
                  background: days === d ? "rgba(6,182,212,.12)" : "var(--bg4)",
                  color: days === d ? "var(--accent)" : "var(--text5)"
                }
              }, d + "d");
            })
          )
        ),
        React.createElement("button", { onClick: run, disabled: running, className: "stx-btn stx-btn-primary", style: { padding: "8px 18px", fontSize: 12, opacity: running ? 0.6 : 1, cursor: running ? "wait" : "pointer" } },
          running ? "Running\u2026" : "\u25b6 Run Backtest"
        ),
        running && React.createElement("button", { onClick: function () { cancelRef.current = true; }, className: "stx-btn", style: { fontSize: 11, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "#eab308", cursor: "pointer" } }, "Cancel"),
        result && !running && React.createElement("button", { onClick: exportCSV, className: "stx-btn", style: { fontSize: 10, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" } }, React.createElement(React.Fragment, null, Ico.download(10), " CSV"))
      ),
      err && React.createElement("div", { style: { marginTop: 10, fontSize: 11, color: err.indexOf("cancelled") >= 0 ? "#eab308" : "#ef4444" } }, err),
      progress && React.createElement("div", { style: { marginTop: 12 } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 6, fontFamily: "var(--font-mono)" } },
          progress.phase + (progress.total ? " " + progress.done + " / " + progress.total : "")
        ),
        React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg4)", overflow: "hidden" } },
          React.createElement("div", { style: { height: "100%", width: progress.total ? Math.round(progress.done / progress.total * 100) + "%" : "100%", background: "var(--accent)", transition: "width .2s" } })
        )
      )
    ),

    result && result.matured > 0 && React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 } },
        Stat("Matured Sessions", result.matured, result.sampleNote || (result.pending > 0 ? result.pending + " recent sessions pending (no forward window)" : "full 10-session window each")),
        Stat("Period", result.rangeStart + " \u2192 " + result.rangeEnd, result.ticker + " \u00b7 " + result.days + " day window"),
        Stat("Avg Entry Score", result.avgEntry != null ? fmtS(result.avgEntry) : "\u2014", "0\u2013100 quality score"),
        Stat("Avg 10-Day Conf", result.avgConf != null ? fmtS(result.avgConf) : "\u2014", "chance of +4% in 10 sessions"),
        Stat("Avg 10d Return", result.avgFwd10 != null ? fmtR(result.avgFwd10) : "\u2014", "buy & hold, close\u2192close", retColor(result.avgFwd10))
      ),

      (result.verdict && (result.verdict.entryGap != null || result.verdict.confSpread != null)) && React.createElement("div", { style: { padding: "12px 14px", borderRadius: 10, marginBottom: 16, background: "rgba(6,182,212,.06)", border: "1px solid rgba(6,182,212,.2)", fontSize: 12, color: "var(--text2)", lineHeight: 1.6 } },
        result.verdict.entryGap != null && React.createElement("div", null,
          React.createElement("span", { style: { color: "var(--accent)", fontWeight: 700 } }, "Entry Score: "),
          "top scores (70+) returned avg " + fmtR(result.verdict.hiEntryAvg10) + " over 10 sessions vs " + fmtR(result.verdict.loEntryAvg10) + " for sub-50 scores " +
          "(\u0394 " + (result.verdict.entryGap > 0 ? "+" : "") + fmt2(result.verdict.entryGap) + "pts)" +
          (result.corrEntry != null ? " \u00b7 correlation r = " + fmt2(result.corrEntry) : "") + "."
        ),
        result.verdict.confSpread != null && React.createElement("div", { style: { marginTop: 4 } },
          React.createElement("span", { style: { color: "var(--accent)", fontWeight: 700 } }, "10-Day Confidence: "),
          "confidence \u226570 hit +4% in " + fmtPct(result.verdict.hiConfTouch) + " of sessions vs " + fmtPct(result.verdict.loConfTouch) + " for <30 " +
          "(spread " + (result.verdict.confSpread > 0 ? "+" : "") + fmtS(result.verdict.confSpread) + "pts)" +
          (result.corrTouch != null ? " \u00b7 point-biserial r = " + fmt2(result.corrTouch) + " (touch), " + fmt2(result.corrClose) + " (close)" : "") + "."
        )
      ),

      React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
        React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", marginBottom: 10 } }, "Entry Score Accuracy"),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 10 } },
          "Scores recomputed as-of each date (H/D/W) \u00b7 forward returns measured from that day's close"
        ),
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null,
              React.createElement("tr", null,
                cell("Score Bucket", tdL), cell("N", td), cell("Avg Score", td), cell("Avg 5d", td), cell("Avg 10d", td), cell("Avg 20d", td), cell("+4% Touch", td), cell("+4% Close", td), cell("\u2264 -3% Loss", td)
              )
            ),
            React.createElement("tbody", null,
              result.entryBuckets.map(function (b) {
                return React.createElement("tr", { key: b.label },
                  cell(b.label, tdL),
                  cell(b.n),
                  cell(b.avgScore != null ? fmtS(b.avgScore) : "\u2014"),
                  cell(b.avg5 != null ? React.createElement("span", { style: { color: retColor(b.avg5) } }, fmtR(b.avg5)) : "\u2014"),
                  cell(b.avg10 != null ? React.createElement("span", { style: { color: retColor(b.avg10), fontWeight: 700 } }, fmtR(b.avg10)) : "\u2014"),
                  cell(b.avg20 != null ? React.createElement("span", { style: { color: retColor(b.avg20) } }, fmtR(b.avg20)) : "\u2014"),
                  cell(fmtPct(b.touchRate)),
                  cell(fmtPct(b.closeRate)),
                  cell(fmtPct(b.lossRate))
                );
              })
            )
          )
        )
      ),

      React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
        React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", marginBottom: 10 } }, "10-Day Confidence Accuracy"),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 10 } },
          "Confidence recomputed as-of each date \u00b7 Touch = intraday high reaches +4% \u00b7 Close = closing price reaches +4% within 10 sessions"
        ),
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null,
              React.createElement("tr", null,
                cell("Confidence Bucket", tdL), cell("N", td), cell("Avg Conf", td), cell("+4% Touch Hit", td), cell("+4% Close Hit", td)
              )
            ),
            React.createElement("tbody", null,
              result.confBuckets.map(function (b) {
                return React.createElement("tr", { key: b.label },
                  cell(b.label, tdL),
                  cell(b.n),
                  cell(b.avgConf != null ? fmtS(b.avgConf) : "\u2014"),
                  cell(React.createElement("span", { style: { color: b.touchRate != null && b.touchRate >= 0.5 ? "#22c55e" : "var(--text2)", fontWeight: b.touchRate != null && b.touchRate >= 0.5 ? 700 : 400 } }, fmtPct(b.touchRate))),
                  cell(fmtPct(b.closeRate))
                );
              })
            )
          )
        )
      ),

      result && result.log && result.log.length > 0 && React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
        React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", marginBottom: 10 } }, "Session Log (" + result.log.length + " sessions)"),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 10 } },
          "Each row = one backtested date \u00b7 10DLN = Lognormal model \u00b7 10DEM = Empirical model \u00b7 Fwd = buy-and-hold return from that day's close"
        ),
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null,
              React.createElement("tr", null,
                cell("Date", tdL), cell("Entry", td), cell("Score", td), cell("10DLN", td), cell("10DEM", td), cell("5d", td), cell("10d", td), cell("20d", td), cell("+4% Touch", td), cell("+4% Close", td)
              )
            ),
            React.createElement("tbody", null,
              result.log.map(function (r) {
                return React.createElement("tr", { key: r.date },
                  cell(r.date, tdL),
                  cell(escCsv(r.entry)),
                  cell(r.entryScore != null ? fmtS(r.entryScore) : "\u2014"),
                  cell(r.confLog != null ? React.createElement("span", { style: { fontWeight: 700, color: r.confLog >= 70 ? "#16a34a" : r.confLog >= 40 ? "#d97706" : "#dc2626" } }, fmtS(r.confLog)) : "\u2014"),
                  cell(r.confEmp != null ? React.createElement("span", { style: { fontWeight: 700, color: r.confEmp >= 70 ? "#16a34a" : r.confEmp >= 40 ? "#d97706" : "#dc2626" } }, fmtS(r.confEmp)) : "\u2014"),
                  cell(r.fwd5 != null ? React.createElement("span", { style: { color: retColor(r.fwd5) } }, fmtR(r.fwd5)) : "\u2014"),
                  cell(r.fwd10 != null ? React.createElement("span", { style: { color: retColor(r.fwd10), fontWeight: 700 } }, fmtR(r.fwd10)) : "\u2014"),
                  cell(r.fwd20 != null ? React.createElement("span", { style: { color: retColor(r.fwd20) } }, fmtR(r.fwd20)) : "\u2014"),
                  cell(r.touchHit ? React.createElement("span", { style: { color: "#22c55e", fontWeight: 700, display: "inline-flex" } }, Ico.check(12, "#22c55e")) : "\u2014"),
                  cell(r.closeHit ? React.createElement("span", { style: { color: "#22c55e", fontWeight: 700, display: "inline-flex" } }, Ico.check(12, "#22c55e")) : "\u2014")
                );
              })
            )
          )
        )
      ),

      React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", lineHeight: 1.6, padding: "0 2px" } },
        "Methodology: at each date D the daily / hourly / weekly / Nifty series are sliced to end at D (no lookahead) and the production Entry Score & 10-Day Confidence engines run on that exact snapshot. " +
        "Entry = close at D. Target = +4% within the next 10 trading sessions. Only dates with a full 10-session forward window are graded (earlier dates in the window are included even if the hourly history only reaches a limited depth)." +
        (result.sampleNote ? " To keep long windows fast, " + result.sampleNote + " spread evenly across the period (the full date range is still covered)." : "") +
        (result.confCovered != null && result.confCovered < result.matured ? " Note: the 10-Day Confidence engine requires hourly bars and Yahoo 1h history spans ~2 years \u2014 for this window the confidence columns cover " + result.confCovered + " of " + result.matured + " dates (the Entry Score still evaluates every date on daily + weekly)." : "")
      )
    ),

    result && result.matured === 0 && React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: 40, color: "var(--text6)", fontSize: 13 } },
      "No scorable sessions in this window \u2014 need at least 10 trading days of forward data for each backtested date."
    ),

    !result && !running && React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: 40, color: "var(--text6)", fontSize: 13 } },
      "Enter a ticker and run a backtest to see how the Entry Score and 10-Day Confidence Score actually performed over the last 30\u2013180 days."
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   NIFTY_200 TICKER LIST
   ══════════════════════════════════════════════════════════════════════════ */
var NIFTY_200 = [
  {t:"360ONE.NS",n:"360 One",cap:"M"},{t:"ABB.NS",n:"ABB India",cap:"L"},{t:"APLAPOLLO.NS",n:"APL Apollo Tubes",cap:"M"},{t:"AUBANK.NS",n:"AU Small Finance Bank",cap:"M"},{t:"ADANIENSOL.NS",n:"Adani Energy Solutions",cap:"L"},
  {t:"ADANIENT.NS",n:"Adani Enterprises",cap:"L"},{t:"ADANIGREEN.NS",n:"Adani Green Energy",cap:"L"},{t:"ADANIPORTS.NS",n:"Adani Ports & SEZ",cap:"L"},{t:"ADANIPOWER.NS",n:"Adani Power",cap:"L"},{t:"ATGL.NS",n:"Adani Total Gas",cap:"M"},
  {t:"ABCAPITAL.NS",n:"Aditya Birla Capital",cap:"M"},{t:"ALKEM.NS",n:"Alkem Laboratories",cap:"M"},{t:"AMBUJACEM.NS",n:"Ambuja Cements",cap:"L"},{t:"APOLLOHOSP.NS",n:"Apollo Hospitals",cap:"L"},{t:"ASHOKLEY.NS",n:"Ashok Leyland",cap:"M"},
  {t:"ASIANPAINT.NS",n:"Asian Paints",cap:"L"},{t:"ASTRAL.NS",n:"Astral",cap:"M"},{t:"AUROPHARMA.NS",n:"Aurobindo Pharma",cap:"M"},{t:"DMART.NS",n:"Avenue Supermarts",cap:"L"},{t:"AXISBANK.NS",n:"Axis Bank",cap:"L"},
  {t:"BSE.NS",n:"BSE",cap:"M"},{t:"BAJAJ-AUTO.NS",n:"Bajaj Auto",cap:"L"},{t:"BAJFINANCE.NS",n:"Bajaj Finance",cap:"L"},{t:"BAJAJFINSV.NS",n:"Bajaj Finserv",cap:"L"},{t:"BAJAJHLDNG.NS",n:"Bajaj Holdings",cap:"L"},
  {t:"BANKBARODA.NS",n:"Bank of Baroda",cap:"L"},{t:"BANKINDIA.NS",n:"Bank of India",cap:"M"},{t:"BDL.NS",n:"Bharat Dynamics",cap:"M"},{t:"BEL.NS",n:"Bharat Electronics",cap:"L"},{t:"BHARATFORG.NS",n:"Bharat Forge",cap:"M"},
  {t:"BHEL.NS",n:"Bharat Heavy Electricals",cap:"M"},{t:"BPCL.NS",n:"Bharat Petroleum",cap:"L"},{t:"BHARTIARTL.NS",n:"Bharti Airtel",cap:"L"},{t:"GROWW.NS",n:"Groww",cap:"M"},{t:"BIOCON.NS",n:"Biocon",cap:"M"},
  {t:"BLUESTARCO.NS",n:"Blue Star",cap:"M"},{t:"BOSCHLTD.NS",n:"Bosch",cap:"L"},{t:"BRITANNIA.NS",n:"Britannia Industries",cap:"L"},{t:"CGPOWER.NS",n:"CG Power & Industrial",cap:"L"},{t:"CANBK.NS",n:"Canara Bank",cap:"L"},
  {t:"CHOLAFIN.NS",n:"Cholamandalam Finance",cap:"L"},{t:"CIPLA.NS",n:"Cipla",cap:"L"},{t:"COALINDIA.NS",n:"Coal India",cap:"L"},{t:"COCHINSHIP.NS",n:"Cochin Shipyard",cap:"M"},{t:"COFORGE.NS",n:"Coforge",cap:"M"},
  {t:"COLPAL.NS",n:"Colgate-Palmolive",cap:"M"},{t:"CONCOR.NS",n:"Container Corp",cap:"M"},{t:"COROMANDEL.NS",n:"Coromandel International",cap:"M"},{t:"CUMMINSIND.NS",n:"Cummins India",cap:"L"},{t:"DLF.NS",n:"DLF",cap:"L"},
  {t:"DABUR.NS",n:"Dabur India",cap:"M"},{t:"DIVISLAB.NS",n:"Divi's Laboratories",cap:"L"},{t:"DIXON.NS",n:"Dixon Technologies",cap:"M"},{t:"DRREDDY.NS",n:"Dr. Reddy's Laboratories",cap:"L"},{t:"EICHERMOT.NS",n:"Eicher Motors",cap:"L"},
  {t:"ETERNAL.NS",n:"Eternal",cap:"L"},{t:"EXIDEIND.NS",n:"Exide Industries",cap:"M"},{t:"NYKAA.NS",n:"FSN E-Commerce Ventures",cap:"M"},{t:"FEDERALBNK.NS",n:"Federal Bank",cap:"M"},{t:"FORTIS.NS",n:"Fortis Healthcare",cap:"M"},
  {t:"GAIL.NS",n:"GAIL India",cap:"L"},{t:"GVT&D.NS",n:"GVT&D",cap:"M"},{t:"GMRAIRPORT.NS",n:"GMR Airports",cap:"M"},{t:"GLENMARK.NS",n:"Glenmark Pharmaceuticals",cap:"M"},{t:"GODFRYPHLP.NS",n:"Godfrey Phillips",cap:"M"},
  {t:"GODREJCP.NS",n:"Godrej Consumer Products",cap:"L"},{t:"GODREJPROP.NS",n:"Godrej Properties",cap:"M"},{t:"GRASIM.NS",n:"Grasim Industries",cap:"L"},{t:"HCLTECH.NS",n:"HCL Technologies",cap:"L"},{t:"HDFCAMC.NS",n:"HDFC Asset Management",cap:"L"},
  {t:"HDFCBANK.NS",n:"HDFC Bank",cap:"L"},{t:"HDFCLIFE.NS",n:"HDFC Life Insurance",cap:"L"},{t:"HAVELLS.NS",n:"Havells India",cap:"M"},{t:"HEROMOTOCO.NS",n:"Hero MotoCorp",cap:"M"},{t:"HINDALCO.NS",n:"Hindalco Industries",cap:"L"},
  {t:"HAL.NS",n:"Hindustan Aeronautics",cap:"L"},{t:"HINDPETRO.NS",n:"Hindustan Petroleum",cap:"M"},{t:"HINDUNILVR.NS",n:"Hindustan Unilever",cap:"L"},{t:"HINDZINC.NS",n:"Hindustan Zinc",cap:"L"},{t:"POWERINDIA.NS",n:"Hindustan Powerworks",cap:"M"},
  {t:"HUDCO.NS",n:"HUDCO",cap:"M"},{t:"HYUNDAI.NS",n:"Hyundai Motor India",cap:"L"},{t:"ICICIBANK.NS",n:"ICICI Bank",cap:"L"},{t:"ICICIGI.NS",n:"ICICI Lombard",cap:"M"},{t:"ICICIAMC.NS",n:"ICICI Prudential AMC",cap:"M"},
  {t:"IDFCFIRSTB.NS",n:"IDFC First Bank",cap:"M"},{t:"ITC.NS",n:"ITC",cap:"L"},{t:"INDIANB.NS",n:"Indian Bank",cap:"M"},{t:"INDHOTEL.NS",n:"Indian Hotels",cap:"L"},{t:"IOC.NS",n:"Indian Oil",cap:"L"},
  {t:"IRCTC.NS",n:"IRCTC",cap:"M"},{t:"IRFC.NS",n:"Indian Railway Finance",cap:"L"},{t:"IREDA.NS",n:"IREDA",cap:"M"},{t:"INDUSTOWER.NS",n:"Indus Towers",cap:"M"},{t:"INDUSINDBK.NS",n:"IndusInd Bank",cap:"M"},
  {t:"NAUKRI.NS",n:"Info Edge",cap:"M"},{t:"INFY.NS",n:"Infosys",cap:"L"},{t:"INDIGO.NS",n:"InterGlobe Aviation",cap:"L"},{t:"JSWENERGY.NS",n:"JSW Energy",cap:"M"},{t:"JSWSTEEL.NS",n:"JSW Steel",cap:"L"},
  {t:"JINDALSTEL.NS",n:"Jindal Steel & Power",cap:"L"},{t:"JIOFIN.NS",n:"Jio Financial Services",cap:"L"},{t:"JUBLFOOD.NS",n:"Jubilant Foodworks",cap:"M"},{t:"KEI.NS",n:"KEI Industries",cap:"M"},{t:"KPITTECH.NS",n:"KPIT Technologies",cap:"M"},
  {t:"KALYANKJIL.NS",n:"Kalyan Jewellers",cap:"M"},{t:"KOTAKBANK.NS",n:"Kotak Mahindra Bank",cap:"L"},{t:"LTF.NS",n:"L&T Finance",cap:"M"},{t:"LGEINDIA.NS",n:"LG Electronics India",cap:"M"},{t:"LICHSGFIN.NS",n:"LIC Housing Finance",cap:"M"},
  {t:"LTM.NS",n:"LTIMindtree",cap:"L"},{t:"LT.NS",n:"Larsen & Toubro",cap:"L"},{t:"LAURUSLABS.NS",n:"Laurus Labs",cap:"M"},{t:"LENSKART.NS",n:"Lenskart",cap:"M"},{t:"LODHA.NS",n:"Macrotech Developers",cap:"L"},
  {t:"LUPIN.NS",n:"Lupin",cap:"M"},{t:"MRF.NS",n:"MRF",cap:"M"},{t:"M&MFIN.NS",n:"Mahindra & Mahindra Financial",cap:"M"},{t:"M&M.NS",n:"Mahindra & Mahindra",cap:"L"},{t:"MANKIND.NS",n:"Mankind Pharma",cap:"M"},
  {t:"MARICO.NS",n:"Marico",cap:"M"},{t:"MARUTI.NS",n:"Maruti Suzuki",cap:"L"},{t:"MFSL.NS",n:"Max Financial Services",cap:"M"},{t:"MAXHEALTH.NS",n:"Max Healthcare",cap:"L"},{t:"MAZDOCK.NS",n:"Mazagon Dock Shipbuilders",cap:"L"},
  {t:"MOTILALOFS.NS",n:"Motilal Oswal Financial",cap:"M"},{t:"MPHASIS.NS",n:"Mphasis",cap:"M"},{t:"MCX.NS",n:"Multi Commodity Exchange",cap:"M"},{t:"MUTHOOTFIN.NS",n:"Muthoot Finance",cap:"L"},{t:"NHPC.NS",n:"NHPC",cap:"M"},
  {t:"NMDC.NS",n:"NMDC",cap:"M"},{t:"NTPC.NS",n:"NTPC",cap:"L"},{t:"NATIONALUM.NS",n:"National Aluminium",cap:"M"},{t:"NESTLEIND.NS",n:"Nestle India",cap:"L"},{t:"OBEROIRLTY.NS",n:"Oberoi Realty",cap:"M"},
  {t:"ONGC.NS",n:"Oil & Natural Gas Corp",cap:"L"},{t:"OIL.NS",n:"Oil India",cap:"M"},{t:"PAYTM.NS",n:"One97 Communications",cap:"M"},{t:"OFSS.NS",n:"Oracle Financial Services",cap:"M"},{t:"POLICYBZR.NS",n:"PB Fintech",cap:"M"},
  {t:"PIIND.NS",n:"PI Industries",cap:"M"},{t:"PAGEIND.NS",n:"Page Industries",cap:"M"},{t:"PATANJALI.NS",n:"Patanjali",cap:"M"},{t:"PERSISTENT.NS",n:"Persistent Systems",cap:"M"},{t:"PHOENIXLTD.NS",n:"Phoenix Mills",cap:"M"},
  {t:"PIDILITIND.NS",n:"Pidilite Industries",cap:"L"},{t:"POLYCAB.NS",n:"Polycab India",cap:"M"},{t:"PFC.NS",n:"Power Finance Corp",cap:"L"},{t:"POWERGRID.NS",n:"Power Grid Corp",cap:"L"},{t:"PREMIERENE.NS",n:"Premier Energies",cap:"M"},
  {t:"PRESTIGE.NS",n:"Prestige Estates",cap:"M"},{t:"PNB.NS",n:"Punjab National Bank",cap:"L"},{t:"RECLTD.NS",n:"REC",cap:"L"},{t:"RADICO.NS",n:"Radico Khaitan",cap:"M"},{t:"RVNL.NS",n:"Rail Vikas Nigam",cap:"M"},
  {t:"RELIANCE.NS",n:"Reliance Industries",cap:"L"},{t:"SBICARD.NS",n:"SBI Cards",cap:"M"},{t:"SBILIFE.NS",n:"SBI Life Insurance",cap:"L"},{t:"SRF.NS",n:"SRF",cap:"M"},{t:"MOTHERSON.NS",n:"Motherson Sumi",cap:"L"},
  {t:"SHREECEM.NS",n:"Shree Cement",cap:"L"},{t:"SHRIRAMFIN.NS",n:"Shriram Finance",cap:"L"},{t:"ENRIN.NS",n:"Enrin India",cap:"L"},{t:"SIEMENS.NS",n:"Siemens",cap:"L"},{t:"SOLARINDS.NS",n:"Solar Industries",cap:"L"},
  {t:"SBIN.NS",n:"State Bank of India",cap:"L"},{t:"SAIL.NS",n:"Steel Authority",cap:"M"},{t:"SUNPHARMA.NS",n:"Sun Pharmaceutical",cap:"L"},{t:"SUPREMEIND.NS",n:"Supreme Industries",cap:"M"},{t:"SUZLON.NS",n:"Suzlon Energy",cap:"M"},
  {t:"SWIGGY.NS",n:"Swiggy",cap:"M"},{t:"TVSMOTOR.NS",n:"TVS Motor",cap:"L"},{t:"TATACAP.NS",n:"Tata Capital",cap:"L"},{t:"TATACOMM.NS",n:"Tata Communications",cap:"M"},{t:"TCS.NS",n:"Tata Consultancy Services",cap:"L"},
  {t:"TATACONSUM.NS",n:"Tata Consumer Products",cap:"L"},{t:"TATAELXSI.NS",n:"Tata Elxsi",cap:"M"},{t:"TATAINVEST.NS",n:"Tata Investment Corp",cap:"M"},{t:"TMCV.NS",n:"Tata Motors CV",cap:"L"},{t:"TMPV.NS",n:"Tata Motors PV",cap:"L"},
  {t:"TATAPOWER.NS",n:"Tata Power",cap:"L"},{t:"TATASTEEL.NS",n:"Tata Steel",cap:"L"},{t:"TECHM.NS",n:"Tech Mahindra",cap:"L"},{t:"TITAN.NS",n:"Titan Company",cap:"L"},{t:"TORNTPHARM.NS",n:"Torrent Pharma",cap:"L"},
  {t:"TRENT.NS",n:"Trent",cap:"L"},{t:"TIINDIA.NS",n:"Tube Investments",cap:"M"},{t:"UPL.NS",n:"UPL",cap:"M"},{t:"ULTRACEMCO.NS",n:"UltraTech Cement",cap:"L"},{t:"UNIONBANK.NS",n:"Union Bank of India",cap:"L"},
  {t:"UNITDSPR.NS",n:"United Spirits",cap:"L"},{t:"VBL.NS",n:"Varun Beverages",cap:"L"},{t:"VEDL.NS",n:"Vedanta",cap:"L"},{t:"VMM.NS",n:"VMM",cap:"M"},{t:"IDEA.NS",n:"Vodafone Idea",cap:"M"},
  {t:"VOLTAS.NS",n:"Voltas",cap:"M"},{t:"WAAREEENER.NS",n:"Waaree Energies",cap:"M"},{t:"WIPRO.NS",n:"Wipro",cap:"L"},{t:"YESBANK.NS",n:"Yes Bank",cap:"M"},{t:"ZYDUSLIFE.NS",n:"Zydus Lifesciences",cap:"L"}
];
var _nseen = new Set();
var NIFTY_200_UNIQUE = NIFTY_200.filter(function(s) { if (_nseen.has(s.t)) return false; _nseen.add(s.t); return true; });

/* ══════════════════════════════════════════════════════════════════════════
   BACKTEST SUITE — StoX Backtesting Engine UI
   Option 1  Single-symbol detailed analysis
   Option 2  Batch backtest across the NIFTY 200 universe
   Option 3  Walk-forward out-of-sample analysis
   Engine: backtest-engine.js (window.BacktestEngine), scoring via the same
   production computeEntryScore (Trend 35 / Pullback 30 / 4% Prob 35 / Swing 20).
   ══════════════════════════════════════════════════════════════════════════ */
var _bt2LastResult = null;
var LS_BT2_RESULT = "stox_bt2_result";
var LS_BT2_INPUT = "stox_bt2_input";

const BacktestSuitePanel = () => {
  const DF = window.OHLCVFetcher;
  const TI = window.TechIndicators;
  const BE = window.BacktestEngine;

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  const [mode, setMode] = useState(function () { try { var m = JSON.parse(localStorage.getItem(LS_BT2_INPUT)); return (m && m.mode) || "single"; } catch (e) { return "single"; } });
  const [ticker, setTicker] = useState(function () { try { var m = JSON.parse(localStorage.getItem(LS_BT2_INPUT)); return (m && m.ticker) || ""; } catch (e) { return ""; } });
  const [target, setTarget] = useState(function () { try { var m = JSON.parse(localStorage.getItem(LS_BT2_INPUT)); return (m && m.target) || 4; } catch (e) { return 4; } });
  const [holding, setHolding] = useState(function () { try { var m = JSON.parse(localStorage.getItem(LS_BT2_INPUT)); return (m && m.holding) || 14; } catch (e) { return 14; } });
  const [threshold, setThreshold] = useState(function () { try { var m = JSON.parse(localStorage.getItem(LS_BT2_INPUT)); return (m && m.threshold) || 65; } catch (e) { return 65; } });
  const [batchCap, setBatchCap] = useState(function () { try { var m = JSON.parse(localStorage.getItem(LS_BT2_INPUT)); return (m && m.batchCap) || "20"; } catch (e) { return "20"; } });
  const [folds, setFolds] = useState(function () { try { var m = JSON.parse(localStorage.getItem(LS_BT2_INPUT)); return (m && m.folds) || 4; } catch (e) { return 4; } });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const [singleResult, setSingleResult] = useState(function () {
    try { var v = JSON.parse(localStorage.getItem(LS_BT2_RESULT)); if (v && v.mode === "single" && v.data) return v.data; } catch (e) {}
    return null;
  });
  const [batchResult, setBatchResult] = useState(function () {
    try { var v = JSON.parse(localStorage.getItem(LS_BT2_RESULT)); if (v && v.mode === "batch" && v.data) return v.data; } catch (e) {}
    return null;
  });
  const [wfResult, setWfResult] = useState(function () {
    try { var v = JSON.parse(localStorage.getItem(LS_BT2_RESULT)); if (v && v.mode === "walkforward" && v.data) return v.data; } catch (e) {}
    return null;
  });
  const [multiTickers, setMultiTickers] = useState(function () {
    try { var v = JSON.parse(localStorage.getItem(LS_BT2_RESULT)); if (v && v.mode === "multiSymbol" && v.tickers) return v.tickers; } catch (e) {}
    return [];
  });
  const [multiResult, setMultiResult] = useState(function () {
    try { var v = JSON.parse(localStorage.getItem(LS_BT2_RESULT)); if (v && v.mode === "multiSymbol" && v.data) return v.data; } catch (e) {}
    return null;
  });
  const setModeResult = (v) => { _bt2LastResult = v; try { localStorage.setItem(LS_BT2_RESULT, JSON.stringify(v)); } catch (e) {} if (v.mode === "single") setSingleResult(v.data); else if (v.mode === "batch") setBatchResult(v.data); else if (v.mode === "walkforward") setWfResult(v.data); else if (v.mode === "multiSymbol") { setMultiResult(v.data); setMultiTickers(v.tickers || []); } };
  const cancelRef = useRef(false);
  const [offlineMeta, setOfflineMeta] = useState(null);
  const [pathTicker, setPathTicker] = useState("");
  const [pathEntryDate, setPathEntryDate] = useState("");
  const [pathExitDate, setPathExitDate] = useState("");
  const [pathResult, setPathResult] = useState(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathErr, setPathErr] = useState("");

  useEffect(function() {
    OfflineOHLCV.getMeta().then(function(meta) { setOfflineMeta(meta); }).catch(function() {});
  }, []);

  useEffect(function() {
    var refresh = function() { OfflineOHLCV.getMeta().then(function(meta) { setOfflineMeta(meta); }).catch(function() {}); };
    window.addEventListener("stox:offline-data-changed", refresh);
    return function() { window.removeEventListener("stox:offline-data-changed", refresh); };
  }, []);

  useEffect(function() {
    var handler = function(e) {
      var detail = e && e.detail;
      var ticks = detail && detail.tickers;
      if (!ticks || !ticks.length) return;
      setMode("multiSymbol");
      setMultiTickers(ticks);
      setTimeout(function() { runMultiBacktest(ticks); }, 100);
    };
    window.addEventListener("stox:add-to-backtest", handler);
    return function() { window.removeEventListener("stox:add-to-backtest", handler); };
  }, []);

  const persist = () => { try { localStorage.setItem(LS_BT2_INPUT, JSON.stringify({ mode: mode, ticker: ticker, target: target, holding: holding, threshold: threshold, batchCap: batchCap, folds: folds })); } catch (e) {} };

  /* Score adapter: grades bar idx with NO lookahead — candles + Nifty index
     are both sliced to end at the entry bar before running the production
     Entry Score engine. */
  const buildScoreFn = (idxCandles, multiTFMap) => (candles, idx, symbol) => {
    const bar = candles[idx];
    if (!bar) return null;
    const ts = bar.t;
    let idxSlice = null;
    if (idxCandles && idxCandles.length && ts != null) {
      let lo = 0, hi = idxCandles.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (idxCandles[mid].t <= ts) lo = mid + 1; else hi = mid; }
      if (lo > 0) idxSlice = idxCandles.slice(0, lo);
    }

    /* Try multi-TF scoring if data available */
    var tfData = multiTFMap && symbol ? multiTFMap[symbol] : null;
    if (tfData && (tfData.daily || tfData.hourly || tfData.weekly)) {
      function sliceBefore(arr) {
        if (!arr) return null;
        var fi = arr.findIndex(function(b) { return b.t > ts; });
        return arr.slice(0, fi === -1 ? arr.length : fi);
      }
      var dailySlice = sliceBefore(tfData.daily);
      var hourlySlice = sliceBefore(tfData.hourly);
      var weeklySlice = sliceBefore(tfData.weekly);
      var tfResults = [];
      if (dailySlice && dailySlice.length >= 50) tfResults.push({ timeframe: "D", candles: dailySlice });
      if (hourlySlice && hourlySlice.length >= 50) tfResults.push({ timeframe: "H", candles: hourlySlice });
      if (weeklySlice && weeklySlice.length >= 50) tfResults.push({ timeframe: "W", candles: weeklySlice });
      if (tfResults.length >= 2) {
        try {
          var mtf = TI.computeMultiTFEntryScore(tfResults, idxSlice, null);
          if (mtf && mtf.multiTF_score != null) {
            return { entryScore: mtf.multiTF_score, raw_score: mtf.raw_score, classification: mtf.classification, trendHealth: mtf.trendHealth, pullbackQuality: mtf.pullbackQuality, prob4: mtf.prob4, swingPotential: mtf.swingPotential, modifiers: mtf.modifiers };
          }
        } catch (e) {}
      }
    }

    /* Fall back to single-TF daily scoring */
    let res;
    try { res = TI.computeEntryScore(candles.slice(0, idx + 1), idxSlice && idxSlice.length ? idxSlice : null); } catch (e) { return null; }
    if (!res || res.entry_score == null) return null;
    return {
      entryScore: res.entry_score,
      raw_score: res.raw_score,
      classification: res.classification,
      trendHealth: res.trendHealth,
      pullbackQuality: res.pullbackQuality,
      prob4: res.prob4,
      swingPotential: res.swingPotential != null ? res.swingPotential : 0,
      modifiers: res.modifiers
    };
  };

  const makeEngine = (idxCandles, multiTFMap) => BE.create({
    scoreFn: buildScoreFn(idxCandles, multiTFMap),
    multiTFMap: multiTFMap,
    indexCandles: idxCandles,
    targetProfitPct: Number(target) || 4,
    holdingPeriodDays: Number(holding) || 14,
    threshold: Number(threshold) || 65,
    warmup: 60
  });

  const normTicker = (t) => (t || "").trim().toUpperCase().replace(/\.NS$/, "");

  /* Resolve the correct offline IndexedDB key — offline stores "RELIANCE.NS" but normTicker strips .NS */
  const resolveOfflineKey = (tk) => {
    if (!offlineMeta || !offlineMeta.tickers) return null;
    if (offlineMeta.tickers.indexOf(tk) >= 0) return tk;
    var withNS = tk + ".NS";
    if (offlineMeta.tickers.indexOf(withNS) >= 0) return withNS;
    return null;
  };

  const runSingle = async () => {
    const tk = normTicker(ticker);
    if (!tk) { setErr("Enter a ticker first, e.g. RELIANCE."); return; }
    persist();
    if (running) return;
    setErr(""); cancelRef.current = false;
    setProgress({ phase: "Fetching daily + Nifty history\u2026", done: 0, total: 0 });
    setRunning(true);
    try {
      /* Fetch Nifty index (always live) */
      const idxRes = await DF.fetchOHLCVCached("^NSEI", "daily");
      const idx = idxRes && idxRes.data ? idxRes.data : null;

      /* Try offline data first for the stock */
      var candles = null;
      var multiTFData = null;
      var _offlineTk = resolveOfflineKey(tk);
      if (_offlineTk) {
        setProgress({ phase: "Loading " + tk + " from offline data\u2026", done: 0, total: 0 });
        try {
          var rec = await OfflineOHLCV.get(_offlineTk);
          if (rec) {
            candles = rec.daily || rec.data || null;
            if (candles) multiTFData = { daily: rec.daily || null, hourly: rec.hourly || null, weekly: rec.weekly || null };
          }
        } catch (e) {}
      }
      /* Fall back to live fetch */
      if (!candles) {
        setProgress({ phase: "Fetching daily + Nifty history\u2026", done: 0, total: 0 });
        const stockRes = await DF.fetchOHLCVCached(tk, "daily");
        candles = stockRes && stockRes.data ? stockRes.data : null;
        if (candles) {
          var [hRes, wRes] = await Promise.all([
            DF.fetchOHLCVCached(tk, "1h").catch(function() { return null; }),
            DF.fetchOHLCVCached(tk, "weekly").catch(function() { return null; })
          ]);
          multiTFData = { daily: candles, hourly: hRes && hRes.data ? hRes.data : null, weekly: wRes && wRes.data ? wRes.data : null };
        }
      }
      if (!candles || candles.length < 60) { setErr("Insufficient daily history for " + tk + " (need ~60+ bars)."); return; }
      var multiTFMap = multiTFData ? (function() { var m = {}; m[tk] = multiTFData; return m; })() : {};
      const eng = makeEngine(idx, multiTFMap);
      const res = await eng.runSingle(candles, { symbol: tk }, {
        onBar: (d, t) => setProgress({ phase: "Scoring " + t + " sessions as-of-date (no lookahead)\u2026", done: d, total: t })
      });
      if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
      setModeResult({ mode: "single", data: res });
    } catch (e) { setErr((e && e.message) || String(e)); }
    finally { setRunning(false); setProgress(null); }
  };

  const runBatch = async () => {
    persist();
    if (running) return;
    setErr(""); cancelRef.current = false;
    setProgress({ phase: "Fetching Nifty index history\u2026", done: 0, total: 1 });
    setRunning(true);
    try {
      const idxRes = await DF.fetchOHLCVCached("^NSEI", "daily");
      const idx = idxRes && idxRes.data ? idxRes.data : null;
      let syms = shuffleArray(NIFTY_200).map(s => s.t);
      if (batchCap === "nifty100") {
        syms = shuffleArray(NIFTY_200.filter(function(s) { return s.cap === "L"; })).map(function(s) { return s.t; });
      }
      const cap = batchCap === "all" || batchCap === "nifty100" ? syms.length : Math.min(parseInt(batchCap, 10) || 20, syms.length);
      syms = syms.slice(0, cap);
      const total = syms.length;
      const dataMap = {};
      const multiTFMap = {};

      /* Check if offline data is available */
      var useOffline = offlineMeta && offlineMeta.count > 0;
      var offlineTickers = useOffline ? new Set(offlineMeta.tickers) : null;

      if (useOffline) {
        setProgress({ phase: "Loading from offline data\u2026", done: 0, total: total });
        for (let i = 0; i < syms.length; i++) {
          if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
          if (offlineTickers.has(syms[i])) {
            try {
              var rec = await OfflineOHLCV.get(syms[i]);
              if (rec) {
                var dailyCandles = rec.daily || rec.data || null;
                if (dailyCandles && dailyCandles.length >= 60) {
                  dataMap[syms[i]] = dailyCandles;
                  multiTFMap[syms[i]] = { daily: rec.daily || null, hourly: rec.hourly || null, weekly: rec.weekly || null };
                }
              }
            } catch (e) {}
          }
          setProgress({ phase: "Loading from offline data\u2026", done: i + 1, total: total });
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      /* Fall back to live fetch if offline had no matching stocks */
      var needLive = Object.keys(dataMap).length === 0;
      if (needLive) {
        setProgress({ phase: "Fetching daily+hourly+weekly\u2026", done: 0, total: total });
        for (let i = 0; i < syms.length; i += 5) {
          if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
          const chunk = syms.slice(i, i + 5);
          await Promise.all(chunk.map(async (s) => {
            try {
              const r = await DF.fetchOHLCVCached(s, "daily");
              if (r && r.data && r.data.length >= 60) {
                dataMap[s] = r.data;
                var [hRes, wRes] = await Promise.all([
                  DF.fetchOHLCVCached(s, "1h").catch(function() { return null; }),
                  DF.fetchOHLCVCached(s, "weekly").catch(function() { return null; })
                ]);
                multiTFMap[s] = {
                  daily: r.data,
                  hourly: hRes && hRes.data ? hRes.data : null,
                  weekly: wRes && wRes.data ? wRes.data : null
                };
              }
            } catch (e) {}
          }));
          await new Promise((r) => setTimeout(r, 60));
          setProgress({ phase: "Fetching D+H+W history \u2026", done: Math.min(i + 5, total), total: total });
        }
      }
      if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
      const ready = Object.keys(dataMap);
      if (!ready.length) { setErr("Could not fetch daily history for any symbol."); return; }
      const eng = makeEngine(idx, multiTFMap);
      const res = await eng.runBatch(dataMap, { symbols: ready }, {
        onSymbol: (d, t) => setProgress({ phase: "Backtesting " + t + " symbols\u2026", done: d, total: t })
      });
      res.targetProfitPct = Number(target) || 4;
      res.holdingPeriodDays = Number(holding) || 14;
      res.threshold = Number(threshold) || 65;
      if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
      setModeResult({ mode: "batch", data: res });
    } catch (e) { setErr((e && e.message) || String(e)); }
    finally { setRunning(false); setProgress(null); }
  };

  const runWalkForward = async () => {
    const tk = normTicker(ticker);
    if (!tk) { setErr("Enter a ticker first, e.g. RELIANCE."); return; }
    persist();
    if (running) return;
    setErr(""); cancelRef.current = false;
    setProgress({ phase: "Fetching daily + Nifty history\u2026", done: 0, total: 0 });
    setRunning(true);
    try {
      /* Fetch Nifty index (always live) */
      const idxRes = await DF.fetchOHLCVCached("^NSEI", "daily");
      const idx = idxRes && idxRes.data ? idxRes.data : null;

      /* Try offline data first for the stock */
      var candles = null;
      var multiTFData = null;
      var _offlineTk = resolveOfflineKey(tk);
      if (_offlineTk) {
        setProgress({ phase: "Loading " + tk + " from offline data\u2026", done: 0, total: 0 });
        try {
          var rec = await OfflineOHLCV.get(_offlineTk);
          if (rec) {
            candles = rec.daily || rec.data || null;
            if (candles) multiTFData = { daily: rec.daily || null, hourly: rec.hourly || null, weekly: rec.weekly || null };
          }
        } catch (e) {}
      }
      /* Fall back to live fetch */
      if (!candles) {
        setProgress({ phase: "Fetching daily + Nifty history\u2026", done: 0, total: 0 });
        const stockRes = await DF.fetchOHLCVCached(tk, "daily");
        candles = stockRes && stockRes.data ? stockRes.data : null;
        if (candles) {
          var [hRes, wRes] = await Promise.all([
            DF.fetchOHLCVCached(tk, "1h").catch(function() { return null; }),
            DF.fetchOHLCVCached(tk, "weekly").catch(function() { return null; })
          ]);
          multiTFData = { daily: candles, hourly: hRes && hRes.data ? hRes.data : null, weekly: wRes && wRes.data ? wRes.data : null };
        }
      }
      if (!candles || candles.length < 120) { setErr("Walk-forward needs longer history (120+ daily bars)."); return; }
      var multiTFMap = multiTFData ? (function() { var m = {}; m[tk] = multiTFData; return m; })() : {};
      const eng = makeEngine(idx, multiTFMap);
      const res = await eng.runWalkForward(candles, { symbol: tk, folds: Number(folds) || 4, minInSample: 120 }, {
        onFold: (f, t) => setProgress({ phase: "Evaluating out-of-sample fold " + f + " / " + t + "\u2026", done: f, total: t })
      });
      if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
      setModeResult({ mode: "walkforward", data: res });
    } catch (e) { setErr((e && e.message) || String(e)); }
    finally { setRunning(false); setProgress(null); }
  };

  const runMultiBacktest = async function(ticks) {
    var symbols = ticks || multiTickers;
    if (!symbols || !symbols.length) { setErr("No symbols selected. Select stocks in the Screener and click Backtest."); return; }
    persist();
    if (running) return;
    setErr(""); cancelRef.current = false;
    setProgress({ phase: "Fetching Nifty index history\u2026", done: 0, total: 1 });
    setRunning(true);
    try {
      const idxRes = await DF.fetchOHLCVCached("^NSEI", "daily");
      const idx = idxRes && idxRes.data ? idxRes.data : null;
      const total = symbols.length;
      const dataMap = {};
      const multiTFMap = {};

      var useOffline = offlineMeta && offlineMeta.count > 0;
      var offlineTickers = useOffline ? new Set(offlineMeta.tickers) : null;

      if (useOffline) {
        setProgress({ phase: "Loading from offline data\u2026", done: 0, total: total });
        for (let i = 0; i < symbols.length; i++) {
          if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
          if (offlineTickers.has(symbols[i])) {
            try {
              var rec = await OfflineOHLCV.get(symbols[i]);
              if (rec) {
                var dailyCandles = rec.daily || rec.data || null;
                if (dailyCandles && dailyCandles.length >= 60) {
                  dataMap[symbols[i]] = dailyCandles;
                  multiTFMap[symbols[i]] = { daily: rec.daily || null, hourly: rec.hourly || null, weekly: rec.weekly || null };
                }
              }
            } catch (e) {}
          }
          setProgress({ phase: "Loading from offline data\u2026", done: i + 1, total: total });
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      var needLive = Object.keys(dataMap).length === 0;
      if (needLive) {
        setProgress({ phase: "Fetching daily+hourly+weekly\u2026", done: 0, total: total });
        for (let i = 0; i < symbols.length; i += 5) {
          if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
          const chunk = symbols.slice(i, i + 5);
          await Promise.all(chunk.map(async (s) => {
            try {
              const r = await DF.fetchOHLCVCached(s, "daily");
              if (r && r.data && r.data.length >= 60) {
                dataMap[s] = r.data;
                var [hRes, wRes] = await Promise.all([
                  DF.fetchOHLCVCached(s, "1h").catch(function() { return null; }),
                  DF.fetchOHLCVCached(s, "weekly").catch(function() { return null; })
                ]);
                multiTFMap[s] = {
                  daily: r.data,
                  hourly: hRes && hRes.data ? hRes.data : null,
                  weekly: wRes && wRes.data ? wRes.data : null
                };
              }
            } catch (e) {}
          }));
          await new Promise((r) => setTimeout(r, 60));
          setProgress({ phase: "Fetching D+H+W history \u2026", done: Math.min(i + 5, total), total: total });
        }
      }
      if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
      const ready = Object.keys(dataMap);
      if (!ready.length) { setErr("Could not fetch daily history for any selected symbol."); return; }
      const eng = makeEngine(idx, multiTFMap);
      const res = await eng.runBatch(dataMap, { symbols: ready }, {
        onSymbol: (d, t) => setProgress({ phase: "Backtesting " + d + " / " + t + " symbols\u2026", done: d, total: t })
      });
      res.targetProfitPct = Number(target) || 4;
      res.holdingPeriodDays = Number(holding) || 14;
      res.threshold = Number(threshold) || 65;
      res.sourceLabel = "Selected from Screener";
      if (cancelRef.current) { setErr("Cancelled \u2014 partial results discarded."); return; }
      setModeResult({ mode: "multiSymbol", tickers: symbols, data: res });
    } catch (e) { setErr((e && e.message) || String(e)); }
    finally { setRunning(false); setProgress(null); }
  };

  const runPathAnalysis = async function() {
    var tk = normTicker(pathTicker);
    if (!tk) { setPathErr("Enter a ticker first."); return; }
    if (!pathEntryDate || !pathExitDate) { setPathErr("Select both Entry and Exit dates."); return; }
    var entryDate = pathEntryDate;
    var exitDate = pathExitDate;
    if (exitDate <= entryDate) { setPathErr("Exit date must be after Entry date."); return; }
    setPathErr(""); setPathLoading(true); setPathResult(null);
    try {
      var candles = null;
      var _offlineTk = resolveOfflineKey(tk);
      if (_offlineTk) {
        try { var rec = await OfflineOHLCV.get(_offlineTk); if (rec) candles = rec.daily || rec.data || null; } catch(e) {}
      }
      if (!candles) {
        var res = await DF.fetchOHLCVCached(tk, "daily");
        candles = res && res.data ? res.data : null;
      }
      if (!candles || !candles.length) { setPathErr("No daily data found for " + tk + "."); setPathLoading(false); return; }
      var filtered = candles.filter(function(b) {
        var bDate = String(b.t || "").slice(0, 10);
        return bDate >= entryDate && bDate <= exitDate;
      });
      if (filtered.length < 2) { setPathErr("Not enough daily data between the selected dates (need at least 2 bars)."); setPathLoading(false); return; }
      var rows = [];
      var cumChange = 0;
      for (var i = 0; i < filtered.length; i++) {
        var bar = filtered[i];
        var dateStr = String(bar.t || "").slice(0, 10);
        if (i === 0) {
          rows.push({ date: dateStr, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v || 0, dailyPct: null, cumPct: 0, prevClose: null });
        } else {
          var prevClose = filtered[i - 1].c;
          var dailyPct = prevClose > 0 ? (bar.c - prevClose) / prevClose * 100 : 0;
          cumChange += dailyPct;
          rows.push({ date: dateStr, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v || 0, dailyPct: Math.round(dailyPct * 100) / 100, cumPct: Math.round(cumChange * 100) / 100, prevClose: prevClose });
        }
      }
      var firstClose = filtered[0].c;
      var lastClose = filtered[filtered.length - 1].c;
      var netPct = firstClose > 0 ? Math.round((lastClose - firstClose) / firstClose * 100 * 100) / 100 : 0;
      var upDays = rows.filter(function(r) { return r.dailyPct != null && r.dailyPct > 0; }).length;
      var dnDays = rows.filter(function(r) { return r.dailyPct != null && r.dailyPct < 0; }).length;
      var flatDays = rows.filter(function(r) { return r.dailyPct != null && r.dailyPct === 0; }).length;
      setPathResult({ ticker: tk, entryDate: pathEntryDate, exitDate: pathExitDate, entryClose: firstClose, exitClose: lastClose, netPct: netPct, tradingDays: filtered.length, upDays: upDays, dnDays: dnDays, flatDays: flatDays, rows: rows });
    } catch(e) { setPathErr((e && e.message) || String(e)); }
    setPathLoading(false);
  };

  const renderPathResult = function(d) {
    var netColor = d.netPct > 0 ? "#16a34a" : d.netPct < 0 ? "#dc2626" : "var(--text)";
    var maxCum = 0, minCum = 0;
    d.rows.forEach(function(r) { if (r.cumPct > maxCum) maxCum = r.cumPct; if (r.cumPct < minCum) minCum = r.cumPct; });
    var range = Math.max(Math.abs(maxCum), Math.abs(minCum), 1);
    return React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: "12px 16px" } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, d.ticker + " \u2014 Path Analysis"),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } }, d.entryDate + " \u2192 " + d.exitDate + " \u00b7 " + d.tradingDays + " trading days")
        ),
        React.createElement("div", { style: { textAlign: "right" } },
          React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, "Net Change"),
          React.createElement("div", { style: { fontSize: 22, fontWeight: 800, fontFamily: "var(--font-heading)", color: netColor, lineHeight: 1 } }, (d.netPct > 0 ? "+" : "") + d.netPct + "%")
        )
      ),
      React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 } },
        React.createElement("div", { style: { padding: "6px 12px", borderRadius: 8, background: "var(--bg4)", fontSize: 11 } },
          React.createElement("span", { style: { color: "var(--text5)" } }, "Entry Close: "),
          React.createElement("span", { style: { fontWeight: 700, color: "var(--text2)" } }, "\u20b9" + d.entryClose.toFixed(2))
        ),
        React.createElement("div", { style: { padding: "6px 12px", borderRadius: 8, background: "var(--bg4)", fontSize: 11 } },
          React.createElement("span", { style: { color: "var(--text5)" } }, "Exit Close: "),
          React.createElement("span", { style: { fontWeight: 700, color: "var(--text2)" } }, "\u20b9" + d.exitClose.toFixed(2))
        ),
        React.createElement("div", { style: { padding: "6px 12px", borderRadius: 8, background: "rgba(22,163,74,.08)", fontSize: 11, color: "#16a34a", fontWeight: 600 } }, d.upDays + " up"),
        React.createElement("div", { style: { padding: "6px 12px", borderRadius: 8, background: "rgba(239,68,68,.08)", fontSize: 11, color: "#dc2626", fontWeight: 600 } }, d.dnDays + " down"),
        d.flatDays > 0 && React.createElement("div", { style: { padding: "6px 12px", borderRadius: 8, background: "var(--bg4)", fontSize: 11, color: "var(--text5)" } }, d.flatDays + " flat")
      ),
      React.createElement("div", { style: { overflowX: "auto" } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
          React.createElement("thead", null, React.createElement("tr", null,
            ["Day", "Date", "Open", "High", "Low", "Close", "Volume", "Prev Close", "Daily %", "Cumulative %", "Path"].map(function(h) {
              return React.createElement("th", { key: h, style: { padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "var(--text5)", textAlign: h === "Day" || h === "Volume" || h === "Daily %" || h === "Cumulative %" || h === "Path" ? "center" : "right", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap" } }, h);
            })
          )),
          React.createElement("tbody", null, d.rows.map(function(r, i) {
            var barPct = r.dailyPct != null ? Math.abs(r.dailyPct) : 0;
            var barW = Math.min(100, Math.round(barPct / 5 * 100));
            var barColor = r.dailyPct != null ? (r.dailyPct > 0 ? "#16a34a" : r.dailyPct < 0 ? "#dc2626" : "var(--text6)") : "transparent";
            var cumBarPct = Math.abs(r.cumPct);
            var cumBarW = Math.min(100, Math.round(cumBarPct / 5 * 100));
            var cumBarColor = r.cumPct > 0 ? "#16a34a" : r.cumPct < 0 ? "#dc2626" : "var(--text6)";
            return React.createElement("tr", { key: i, style: { background: i === 0 ? "rgba(6,182,212,.04)" : "transparent" } },
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, color: "var(--text6)", textAlign: "center", borderBottom: "1px solid var(--border)" } }, i + 1),
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, color: "var(--text3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } }, r.date),
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, color: "var(--text3)", textAlign: "right", borderBottom: "1px solid var(--border)" } }, r.open.toFixed(2)),
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, color: "var(--text3)", textAlign: "right", borderBottom: "1px solid var(--border)" } }, r.high.toFixed(2)),
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, color: "var(--text3)", textAlign: "right", borderBottom: "1px solid var(--border)" } }, r.low.toFixed(2)),
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, fontWeight: 700, color: "var(--text2)", textAlign: "right", borderBottom: "1px solid var(--border)" } }, r.close.toFixed(2)),
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, color: "var(--text5)", textAlign: "center", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)" } }, r.volume >= 1e6 ? (r.volume / 1e6).toFixed(2) + "M" : r.volume >= 1e3 ? (r.volume / 1e3).toFixed(1) + "K" : String(r.volume)),
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, color: "var(--text5)", textAlign: "right", borderBottom: "1px solid var(--border)" } }, r.prevClose != null ? r.prevClose.toFixed(2) : "\u2014"),
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, fontWeight: 700, color: r.dailyPct != null ? (r.dailyPct > 0 ? "#16a34a" : r.dailyPct < 0 ? "#dc2626" : "var(--text5)") : "var(--text6)", textAlign: "center", borderBottom: "1px solid var(--border)" } }, r.dailyPct != null ? (r.dailyPct > 0 ? "+" : "") + r.dailyPct.toFixed(2) + "%" : "\u2014"),
              React.createElement("td", { style: { padding: "5px 8px", fontSize: 10, fontWeight: 700, color: r.cumPct > 0 ? "#16a34a" : r.cumPct < 0 ? "#dc2626" : "var(--text5)", textAlign: "center", borderBottom: "1px solid var(--border)" } }, (r.cumPct > 0 ? "+" : "") + r.cumPct.toFixed(2) + "%"),
              React.createElement("td", { style: { padding: "5px 8px", borderBottom: "1px solid var(--border)", minWidth: 80 } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
                  React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg5)", width: 60, overflow: "hidden", position: "relative" } },
                    React.createElement("div", { style: { height: "100%", width: barW + "%", background: barColor, borderRadius: 3, transition: "width .3s" } })
                  ),
                  React.createElement("span", { style: { fontSize: 8, color: "var(--text6)", minWidth: 24 } }, r.dailyPct != null ? (r.dailyPct > 0 ? "+" : "") + r.dailyPct.toFixed(1) : "")
                )
              )
            );
          }))
        )
      )
    );
  };

  const exportCSV = () => {
    const activeData = mode === "single" ? singleResult : mode === "batch" ? batchResult : mode === "multiSymbol" ? multiResult : wfResult;
    if (!activeData || !BE) return;
    let csv = "", name = "stox-bt2-";
    if (mode === "single") { csv = BE.exportSingleCSV(activeData); name += "single-" + (activeData.symbol || ""); }
    else if (mode === "batch") { csv = BE.exportBatchCSV(activeData); name += "batch"; }
    else if (mode === "multiSymbol") { csv = BE.exportBatchCSV(activeData); name += "multi-symbol"; }
    else { csv = BE.exportWalkForwardCSV(activeData); name += "walkforward-" + (activeData.symbol || ""); }
    if (!csv) return;
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast("Exported backtest CSV", 3000);
  };

  var fmt2 = function (v) { return v == null || isNaN(v) ? "\u2014" : v.toFixed(1); };
  var fmtR = function (v) { return v == null || isNaN(v) ? "\u2014" : (v > 0 ? "+" : "") + v.toFixed(1) + "%"; };
  var fmtPct = function (v) { return v == null || isNaN(v) ? "\u2014" : Math.round(v * 10) / 10 + "%"; };
  var fmtPF = function (v) { return v == null || isNaN(v) ? "\u2014" : v === "\u221e" || v === Infinity ? "\u221e" : Number(v).toFixed(2); };
  var fmtS = function (v) { return v == null || isNaN(v) ? "\u2014" : Math.round(v); };
  var fmtInr = function (v) { return v == null || isNaN(v) ? "\u2014" : "\u20b9" + Number(v).toFixed(2); };
  var symName = function (t) { return String(t || "").replace(/\.NS$/, ""); };
  var retColor = function (v) { return v == null || isNaN(v) ? "var(--text2)" : v > 0 ? "#22c55e" : v < 0 ? "#ef4444" : "var(--text2)"; };
  var th = { padding: "8px 10px", textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text5)", fontWeight: 700, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  var td = { padding: "8px 10px", fontSize: 12, color: "var(--text2)", borderBottom: "1px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" };
  var tdL = Object.assign({}, td, { textAlign: "left", fontFamily: "var(--font-body)", fontWeight: 700, color: "var(--text)" });

  const Stat = (label, val, sub, color) =>
    React.createElement("div", { style: { flex: 1, minWidth: 130, padding: "12px 14px", borderRadius: 10, background: "var(--bg4)", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text6)", fontWeight: 700 } }, label),
      React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: color || "var(--text)", marginTop: 3 } }, val),
      sub ? React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } }, sub) : null
    );

  const cell = (txt, style) => React.createElement("td", { style: style || td }, txt);
  const card = (title, sub, children) => React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
    React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)", marginBottom: 10 } }, title),
    sub ? React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 10 } }, sub) : null,
    children
  );
  const field = (label, child) => React.createElement("div", null,
    React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, label),
    child
  );
  const numInput = (v, setV, w) => React.createElement("input", { className: "inp", type: "number", value: v, min: 1, onChange: (e) => setV(parseFloat(e.target.value) || 0), style: { width: w || 80 } });

  const renderSingle = (d) => {
    const st = d.stats || {};
    const buckets = (st.scoreBrackets || {});
    const ORDER = ["STRONG_BUY", "BUY", "WATCHLIST", "NEUTRAL", "AVOID"];
    const _scRS = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? window.TechIndicators.getScoreConfig() : {};
    const _pmRS = _scRS.pillarMax || {};
    return React.createElement("div", null,
      (d.currentScore) && React.createElement("div", { style: { padding: "12px 14px", borderRadius: 10, marginBottom: 16, background: "rgba(6,182,212,.06)", border: "1px solid rgba(6,182,212,.2)", fontSize: 12, color: "var(--text2)", lineHeight: 1.6 } },
        React.createElement("span", { style: { color: "var(--accent)", fontWeight: 700 } }, "Current session: "),
        "Entry Score " + fmtS(d.currentScore.entryScore) + " (" + (d.currentScore.classification || "\u2014") + ")" +
        " \u00b7 Trend " + fmt2(d.currentScore.trendHealth) + "/" + (_pmRS.trendHealth != null ? _pmRS.trendHealth : 35) + " \u00b7 Pullback " + fmt2(d.currentScore.pullbackQuality) + "/" + (_pmRS.pullbackQuality != null ? _pmRS.pullbackQuality : 30) + " \u00b7 4% Prob " + fmt2(d.currentScore.prob4) + "/" + (_pmRS.prob4 != null ? _pmRS.prob4 : 35) +
        (d.currentScore.swingPotential != null && d.currentScore.swingPotential > 0 ? " \u00b7 Swing " + fmt2(d.currentScore.swingPotential) + "/" + (_pmRS.swingPotential != null ? _pmRS.swingPotential : 20) : "") +
        (d.currentScore.modifiers != null ? " \u00b7 modifiers " + (d.currentScore.modifiers >= 0 ? "+" : "") + fmt2(d.currentScore.modifiers) : "") +
        ". Data is as-of the last close \u2014 this is the score you would have seen."
      ),
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 } },
        Stat("Signals", fmtS(st.totalSignals), d.symbol + " \u00b7 " + (d.rangeStart || "") + " \u2192 " + (d.rangeEnd || "")),
        Stat("Win Rate", st.totalSignals ? fmtPct(st.winRate) : "\u2014", "+" + fmt2(d.targetProfitPct) + "% target within " + d.holdingPeriodDays + " sessions", st.totalSignals ? retColor(st.winRate - 50) : undefined),
        Stat("Avg Return", st.totalSignals ? React.createElement("span", { style: { color: retColor(st.avgReturnPct) } }, fmtR(st.avgReturnPct)) : "\u2014", "per trade, close\u2192close"),
        Stat("Avg Win / Loss", st.totalSignals ? fmtR(st.avgWinPct) + " / " + fmtR(st.avgLossPct) : "\u2014", "hit target vs timed-out trades"),
        Stat("Avg Days to Target", st.totalSignals && st.avgDaysToTarget != null ? fmt2(st.avgDaysToTarget) : "\u2014", "winning trades only"),
        Stat("Profit Factor", st.totalSignals ? fmtPF(st.profitFactor) : "\u2014", "gross profit \u00f7 gross loss"),
        Stat("Max Consecutive", st.totalSignals ? st.maxConsecutiveWins + "W / " + st.maxConsecutiveLosses + "L" : "\u2014", "winning / losing streaks")
      ),
      st.totalSignals === 0 && React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: 24, color: "var(--text6)", fontSize: 12, marginBottom: 16 } },
        (st.message || "No trade signals generated") + " \u2014 try lowering the min score or a longer window."
      ),
      card("Score Lift", "Every scored session grouped by classification, measured against the same +" + fmt2(d.targetProfitPct) + "% / " + d.holdingPeriodDays + "-session target. Shows whether higher scores actually raised the +4% hit rate.",
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null, React.createElement("tr", null, cell("Score Bucket", tdL), cell("N", td), cell("Win Rate", td), cell("Avg Forward Return", td))),
            React.createElement("tbody", null, (st.lift || []).map((b) => React.createElement("tr", { key: b.bucket },
              cell(b.bucket, tdL), cell(b.n),
              cell(b.winRate != null ? React.createElement("span", { style: { color: retColor(b.winRate - 50), fontWeight: 700 } }, fmtPct(b.winRate)) : "\u2014"),
              cell(b.avgReturn != null ? React.createElement("span", { style: { color: retColor(b.avgReturn) } }, fmtR(b.avgReturn)) : "\u2014")
            )))
          )
        )
      ),
      card("Score Brackets", "Trades only (signals \u2265 " + fmtS(d.threshold) + ") split by classification.",
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null, React.createElement("tr", null, cell("Bracket", tdL), cell("Trades", td), cell("Win Rate", td), cell("Avg Return", td))),
            React.createElement("tbody", null, ORDER.filter((k) => buckets[k]).map((k) => {
              const b = buckets[k];
              return React.createElement("tr", { key: k }, cell(k, tdL), cell(b.trades),
                cell(React.createElement("span", { style: { color: retColor(b.winRate - 50), fontWeight: 700 } }, fmtPct(b.winRate))),
                cell(React.createElement("span", { style: { color: retColor(b.avgReturn) } }, fmtR(b.avgReturn))));
            }))
          )
        )
      ),
      d.calibration && d.calibration.buckets && d.calibration.buckets.length > 0 && card("Confidence Calibration", "10-Day Confidence model calibration: probTouch deciles vs actual +4% hit rate. Derived calP0 = " + (d.calibration.calP0 != null ? d.calibration.calP0 : "\u2014") + " (anchor) and calK = " + (d.calibration.calK != null ? d.calibration.calK : "\u2014") + " (slope). Current defaults: calP0=0.38, calK=38.",
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null, React.createElement("tr", null,
              cell("Decile", td), cell("Avg probTouch", td), cell("Range", td), cell("N", td), cell("Hits", td), cell("Empirical Hit Rate", td), cell("vs 50%", td)
            )),
            React.createElement("tbody", null, d.calibration.buckets.map(function(b) {
              var diff = b.hitRate - 50;
              return React.createElement("tr", { key: b.decile },
                cell(b.decile), cell(b.avgProbTouch != null ? b.avgProbTouch.toFixed(2) : "\u2014"),
                cell(b.probTouchRange ? b.probTouchRange[0].toFixed(2) + "\u2013" + b.probTouchRange[1].toFixed(2) : "\u2014"),
                cell(b.n), cell(b.hits),
                cell(React.createElement("span", { style: { fontWeight: 700, color: retColor(diff) } }, b.hitRate != null ? b.hitRate.toFixed(1) + "%" : "\u2014")),
                cell(React.createElement("span", { style: { color: diff > 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "var(--text5)", fontSize: 11 } }, (diff > 0 ? "+" : "") + diff.toFixed(1)))
              );
            }))
          )
        )
      ),
      (st.monthlyBreakdown && st.monthlyBreakdown.length) && card("Monthly Breakdown", "Aggregate by entry month.",
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null, React.createElement("tr", null, cell("Month", tdL), cell("Trades", td), cell("Win Rate", td), cell("Avg Return", td), cell("Avg Score", td))),
            React.createElement("tbody", null, st.monthlyBreakdown.map((b) => React.createElement("tr", { key: b.month },
              cell(b.month, tdL), cell(b.trades),
              cell(b.winRate != null ? React.createElement("span", { style: { color: retColor(b.winRate - 50) } }, fmtPct(b.winRate)) : "\u2014"),
              cell(b.avgReturn != null ? React.createElement("span", { style: { color: retColor(b.avgReturn) } }, fmtR(b.avgReturn)) : "\u2014"),
              cell(b.avgScore != null ? fmtS(b.avgScore) : "\u2014")
            )))
          )
        )
      ),
      card("Trades (" + (st.trades || []).length + ")", "Most recent first.",
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null, React.createElement("tr", null,
              cell("Entry", tdL), cell("Exit", tdL), cell("Score", td), cell("10DLN", td), cell("10DEM", td), cell("Signal", tdL), cell("Entry", td), cell("Exit", td), cell("Days", td), cell("Return", td), cell("Hit", td)
            )),
            React.createElement("tbody", null, (st.trades || []).slice(0, 30).map((t, i) => React.createElement("tr", { key: t.entryDate + "-" + i },
              cell(t.entryDate, tdL), cell(t.exitDate, tdL), cell(fmtS(t.entryScore)),
              cell(t.confLog != null ? React.createElement("span", { style: { color: t.confLog * 100 >= 50 ? "#22c55e" : "#ef4444", fontWeight: 700 } }, fmt2(t.confLog * 100)) : "\u2014"),
              cell(t.confEmp != null ? React.createElement("span", { style: { color: t.confEmp * 100 >= 50 ? "#22c55e" : "#ef4444", fontWeight: 700 } }, fmt2(t.confEmp * 100)) : "\u2014"),
              cell(t.signal, tdL),
              cell(fmtInr(t.entryPrice)), cell(fmtInr(t.exitPrice)), cell(t.daysToTarget != null ? t.daysToTarget : "\u2014"),
              cell(React.createElement("span", { style: { color: retColor(t.finalReturnPct), fontWeight: 700 } }, fmtR(t.finalReturnPct))),
              cell(t.hitTarget ? React.createElement("span", { style: { color: "#22c55e", fontWeight: 700 } }, "YES") : React.createElement("span", { style: { color: "#eab308" } }, "no"))
            )))
          )
        )
      )
    );
  };

  const renderBatch = (d) => {
    const s = d.summary || {};
    const errors = (d.allResults || []).filter(r => r.error).length;
    return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 } },
        Stat("Symbols Tested", fmtS(s.symbolsTested), errors > 0 ? errors + " fetch/score failures skipped" : (d.sourceLabel || "NIFTY 200 universe")),
        Stat("With Signals", fmtS(s.symbolsWithSignals), fmtS(s.symbolsNoSignals) + " had no qualifying signals"),
        Stat("Total Signals", fmtS(s.totalSignals), "across all symbols"),
        Stat("Overall Win Rate", s.overallWinRate != null ? fmtPct(s.overallWinRate) : "\u2014", "all pooled signals", s.overallWinRate != null ? retColor(s.overallWinRate - 50) : undefined),
        Stat("Avg Symbol Win Rate", s.avgWinRate != null ? fmtPct(s.avgWinRate) : "\u2014", "per-symbol average"),
        Stat("Avg Return", s.avgReturn != null ? React.createElement("span", { style: { color: retColor(s.avgReturn) } }, fmtR(s.avgReturn)) : "\u2014", "per trade, close\u2192close"),
        Stat("Avg Profit Factor", s.avgProfitFactor != null ? fmtPF(s.avgProfitFactor) : "\u2014", "across profitable symbols")
      ),
      s.bestByWinRate && React.createElement("div", { style: { padding: "10px 14px", borderRadius: 10, marginBottom: 16, background: "rgba(6,182,212,.06)", border: "1px solid rgba(6,182,212,.2)", fontSize: 12, color: "var(--text2)", lineHeight: 1.6 } },
        React.createElement("span", { style: { color: "#22c55e", fontWeight: 700 } }, "Best by win rate: " + symName(s.bestByWinRate) + " (" + fmtPct(s.bestWinRate) + ")"),
        s.worstByWinRate ? React.createElement("span", { style: { color: "#ef4444", fontWeight: 700 } }, " \u00b7 Worst: " + symName(s.worstByWinRate) + " (" + fmtPct(s.worstWinRate) + ")") : null,
        s.bestByReturn ? React.createElement("span", null, " \u00b7 Highest avg return: " + symName(s.bestByReturn) + " (" + fmtR(s.bestReturn) + ")") : null
      ),
      (function() {
        var exportRankingCSV = function() {
          if (!d.results || !d.results.length) return;
          var headers = ["Symbol", "Signals", "Wins", "Losses", "Win Rate %", "Avg Return %", "Profit Factor", "Avg Hold Days", "Avg 10DLN", "Avg 10DEM", "Avg Score", "Avg Trend", "Avg Pullback", "Avg Prob4", "Avg Swing"];
          var rows = d.results.map(function(r) {
            return [r.symbol, r.totalSignals, r.winningTrades, r.losingTrades, r.winRate != null ? r.winRate : "", r.avgReturnPct != null ? r.avgReturnPct : "", r.profitFactor, r.avgHoldDays != null ? r.avgHoldDays : "", r.avgConfLog != null ? Math.round(r.avgConfLog * 1000) / 10 : "", r.avgConfEmp != null ? Math.round(r.avgConfEmp * 1000) / 10 : "", r.avgEntryScore != null ? r.avgEntryScore : "", r.avgTrend != null ? r.avgTrend : "", r.avgPullback != null ? r.avgPullback : "", r.avgProb4 != null ? r.avgProb4 : "", r.avgSwing != null ? r.avgSwing : ""];
          });
          var csv = [headers.join(",")].concat(rows.map(function(r) { return r.map(function(v) { var s = String(v == null ? "" : v); return s.indexOf(",") >= 0 || s.indexOf('"') >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(","); })).join("\r\n");
          var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a"); a.href = url; a.download = "stox-batch-ranking-" + (d.symbol || "batch") + ".csv"; a.click();
          URL.revokeObjectURL(url);
          showToast("Exported ranking CSV", 3000);
        };
        var exportRankingXLSX = function() {
          if (typeof XLSX === "undefined") { showToast("XLSX library still loading — try again in a moment", 3000); return; }
          if (!d.results || !d.results.length) return;
          var rows = d.results.map(function(r) {
            return { "Symbol": r.symbol, "Signals": r.totalSignals, "Wins": r.winningTrades, "Losses": r.losingTrades, "Win Rate %": r.winRate, "Avg Return %": r.avgReturnPct, "Profit Factor": typeof r.profitFactor === "string" ? r.profitFactor : r.profitFactor, "Avg Hold Days": r.avgHoldDays, "Avg 10DLN": r.avgConfLog != null ? Math.round(r.avgConfLog * 1000) / 10 : null, "Avg 10DEM": r.avgConfEmp != null ? Math.round(r.avgConfEmp * 1000) / 10 : null, "Avg Score": r.avgEntryScore, "Avg Trend": r.avgTrend, "Avg Pullback": r.avgPullback, "Avg Prob4": r.avgProb4, "Avg Swing": r.avgSwing };
          });
          var ws = XLSX.utils.json_to_sheet(rows);
          var wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Ranking");
          var colWidths = [{ wch: 18 }, { wch: 8 }, { wch: 6 }, { wch: 7 }, { wch: 10 }, { wch: 11 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
          ws["!cols"] = colWidths;
          XLSX.writeFile(wb, "stox-batch-ranking-" + (d.symbol || "batch") + ".xlsx");
          showToast("Exported ranking XLSX", 3000);
        };
        var btnStyle = { fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", marginLeft: 6, fontWeight: 600 };
        return React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } },
            React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Ranking by Win Rate"),
            React.createElement("div", { style: { display: "flex", gap: 4 } },
              React.createElement("button", { onClick: exportRankingCSV, style: btnStyle }, "CSV"),
              React.createElement("button", { onClick: exportRankingXLSX, style: btnStyle }, "XLSX")
            )
          ),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 10 } }, (d.results || []).length + " symbols with qualifying signals \u00b7 +" + fmt2(d.targetProfitPct) + "% / " + d.holdingPeriodDays + "d."),
          React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null, React.createElement("tr", null,
              cell("Symbol", tdL), cell("Signals", td), cell("Wins", td), cell("Losses", td), cell("Win Rate", td), cell("Avg Return", td), cell("Profit Factor", td), cell("Avg Hold", td), cell("Avg 10DLN", td), cell("Avg 10DEM", td), cell("Avg Score", td),
              React.createElement("td", { style: Object.assign({}, td, { color: "var(--accent)" }), title: "Average Trend Health pillar score across all trades for this symbol" }, "Avg Trend"),
              React.createElement("td", { style: Object.assign({}, td, { color: "var(--accent)" }), title: "Average Pullback Quality pillar score across all trades for this symbol" }, "Avg Pullback"),
              React.createElement("td", { style: Object.assign({}, td, { color: "var(--accent)" }), title: "Average 4% Probability pillar score across all trades for this symbol" }, "Avg Prob4"),
              React.createElement("td", { style: Object.assign({}, td, { color: "var(--accent)" }), title: "Average Swing Potential pillar score across all trades for this symbol" }, "Avg Swing")
            )),
            React.createElement("tbody", null, (d.results || []).map((r) => React.createElement("tr", { key: r.symbol },
              cell(symName(r.symbol), tdL), cell(r.totalSignals), cell(r.winningTrades), cell(r.losingTrades),
              cell(React.createElement("span", { style: { color: retColor(r.winRate - 50), fontWeight: 700 } }, fmtPct(r.winRate))),
              cell(React.createElement("span", { style: { color: retColor(r.avgReturnPct) } }, fmtR(r.avgReturnPct))),
              cell(fmtPF(r.profitFactor)),
              cell(r.avgHoldDays != null ? fmt2(r.avgHoldDays) : "\u2014"),
              cell(r.avgConfLog != null ? React.createElement("span", { style: { fontWeight: 700, color: r.avgConfLog * 100 >= 50 ? "#22c55e" : "#ef4444" } }, fmt2(r.avgConfLog * 100)) : "\u2014"),
              cell(r.avgConfEmp != null ? React.createElement("span", { style: { fontWeight: 700, color: r.avgConfEmp * 100 >= 50 ? "#22c55e" : "#ef4444" } }, fmt2(r.avgConfEmp * 100)) : "\u2014"),
              cell(r.avgEntryScore != null ? React.createElement("span", { style: { fontWeight: 700, color: retColor(r.avgEntryScore - 50) } }, fmt2(r.avgEntryScore)) : "\u2014"),
              React.createElement("td", { style: Object.assign({}, td, { color: r.avgTrend != null ? "var(--text)" : "var(--text6)" }) }, r.avgTrend != null ? fmt2(r.avgTrend) : "\u2014"),
              React.createElement("td", { style: Object.assign({}, td, { color: r.avgPullback != null ? "var(--text)" : "var(--text6)" }) }, r.avgPullback != null ? fmt2(r.avgPullback) : "\u2014"),
              React.createElement("td", { style: Object.assign({}, td, { color: r.avgProb4 != null ? "var(--text)" : "var(--text6)" }) }, r.avgProb4 != null ? fmt2(r.avgProb4) : "\u2014"),
              React.createElement("td", { style: Object.assign({}, td, { color: r.avgSwing != null ? "var(--text)" : "var(--text6)" }) }, r.avgSwing != null ? fmt2(r.avgSwing) : "\u2014")
            )))
          )
        )
        );
      })(),
      React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", lineHeight: 1.6, padding: "0 2px" } },
        "Each symbol is scored on its full daily history as-of-date (no lookahead); a trade is opened whenever the Entry Score \u2265 " + fmtS(d.threshold) + " and closed at +" + fmt2(d.targetProfitPct) + "% or after " + d.holdingPeriodDays + " sessions."
      ),
      (function() {
        var calSymbols = (d.allResults || []).filter(function(r) { return r.detail && r.detail.calibration && r.detail.calibration.calP0 != null; });
        if (calSymbols.length === 0) return null;
        var totalN = calSymbols.reduce(function(s, r) { return s + (r.detail.calibration.n || 0); }, 0);
        if (totalN < 20) return null;
        var weightedP0 = calSymbols.reduce(function(s, r) { return s + (r.detail.calibration.calP0 || 0.38) * (r.detail.calibration.n || 0); }, 0) / totalN;
        var weightedK = calSymbols.reduce(function(s, r) { return s + (r.detail.calibration.calK || 38) * (r.detail.calibration.n || 0); }, 0) / totalN;
        var allBuckets = {};
        calSymbols.forEach(function(r) {
          (r.detail.calibration.buckets || []).forEach(function(b) {
            if (!allBuckets[b.decile]) allBuckets[b.decile] = { hits: 0, total: 0, sumPT: 0 };
            allBuckets[b.decile].hits += b.hits;
            allBuckets[b.decile].total += b.n;
            allBuckets[b.decile].sumPT += b.avgProbTouch * b.n;
          });
        });
        var aggBuckets = Object.keys(allBuckets).sort(function(a, b) { return Number(a) - Number(b); }).map(function(k) {
          var b = allBuckets[k];
          return { decile: Number(k), avgProbTouch: b.total > 0 ? Math.round(b.sumPT / b.total * 100) / 100 : 0, n: b.total, hitRate: b.total > 0 ? Math.round((b.hits / b.total) * 1000) / 10 : 0 };
        });
        return card("Confidence Calibration (Aggregate)", calSymbols.length + " symbols, " + totalN + " trades with valid probTouch. Derived calP0 = " + weightedP0.toFixed(3) + ", calK = " + weightedK.toFixed(1) + ".",
          React.createElement("div", { style: { overflowX: "auto" } },
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
              React.createElement("thead", null, React.createElement("tr", null,
                cell("Decile", td), cell("Avg probTouch", td), cell("N", td), cell("Empirical Hit Rate", td), cell("vs 50%", td)
              )),
              React.createElement("tbody", null, aggBuckets.map(function(b) {
                var diff = b.hitRate - 50;
                return React.createElement("tr", { key: b.decile },
                  cell(b.decile), cell(b.avgProbTouch.toFixed(2)),
                  cell(b.n),
                  cell(React.createElement("span", { style: { fontWeight: 700, color: retColor(diff) } }, b.hitRate.toFixed(1) + "%")),
                  cell(React.createElement("span", { style: { color: diff > 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "var(--text5)", fontSize: 11 } }, (diff > 0 ? "+" : "") + diff.toFixed(1)))
                );
              }))
            )
          )
        );
      })()
    );
  };

  const renderWalkForward = (d) => {
    const a = d.aggregate || {};
    return React.createElement("div", null,
      a.verdict && React.createElement("div", { style: { padding: "12px 14px", borderRadius: 10, marginBottom: 16, background: "rgba(6,182,212,.06)", border: "1px solid rgba(6,182,212,.2)", fontSize: 12, color: "var(--text2)", lineHeight: 1.6 } }, a.verdict),
      React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 } },
        Stat("Folds", fmtS(a.folds), fmtS(a.foldsWithSignals) + " with out-of-sample signals"),
        Stat("OOS Signals", fmtS(a.totalOosSignals), "+" + fmt2(d.targetProfitPct) + "% / " + d.holdingPeriodDays + "d target"),
        Stat("OOS Win Rate", a.overallWinRate != null ? fmtPct(a.overallWinRate) : "\u2014", "pooled across folds", a.overallWinRate != null ? retColor(a.overallWinRate - 50) : undefined),
        Stat("Avg Fold Win Rate", a.avgFoldWinRate != null ? fmtPct(a.avgFoldWinRate) : "\u2014", "unweighted mean of folds"),
        Stat("Avg OOS Return", a.avgOosReturn != null ? React.createElement("span", { style: { color: retColor(a.avgOosReturn) } }, fmtR(a.avgOosReturn)) : "\u2014", "per trade, close\u2192close"),
        Stat("Consistency", a.consistency != null ? fmtPct(a.consistency) : "\u2014", "% of folds with win rate \u2265 40%"),
        Stat("Train\u2013Test Gap", a.avgTrainTestGap != null ? fmt2(a.avgTrainTestGap) + "pts" : "\u2014", "OOS win rate \u2212 in-sample win rate"),
        Stat("Positive Folds", a.positiveFolds + " / " + fmtS(a.folds), "folds with positive avg return")
      ),
      card("Folds", "Each fold: in-sample (everything before the window) vs out-of-sample (the window itself).",
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null, React.createElement("tr", null,
              cell("Fold", tdL), cell("Period", tdL), cell("IS Signals", td), cell("IS Win Rate", td), cell("OOS Signals", td), cell("OOS Win Rate", td), cell("OOS Avg Return", td), cell("OOS PF", td)
            )),
            React.createElement("tbody", null, (d.folds || []).map((f) => React.createElement("tr", { key: f.fold },
              cell("Fold " + f.fold, tdL), cell(f.period[0] + " \u2192 " + f.period[1], tdL),
              cell(f.inSample.totalSignals), cell(f.inSample.winRate != null ? fmtPct(f.inSample.winRate) : "\u2014"),
              cell(f.oos.totalSignals), cell(f.oos.winRate != null ? React.createElement("span", { style: { color: retColor(f.oos.winRate - 50), fontWeight: 700 } }, fmtPct(f.oos.winRate)) : "\u2014"),
              cell(f.oos.avgReturnPct != null ? React.createElement("span", { style: { color: retColor(f.oos.avgReturnPct) } }, fmtR(f.oos.avgReturnPct)) : "\u2014"),
              cell(f.oos.profitFactor != null ? fmtPF(f.oos.profitFactor) : "\u2014")
            )))
          )
        )
      ),
      d.calibration && d.calibration.buckets && d.calibration.buckets.length > 0 && card("Confidence Calibration (OOS)", "10-Day Confidence model calibration across all out-of-sample folds. Derived calP0 = " + (d.calibration.calP0 != null ? d.calibration.calP0 : "\u2014") + ", calK = " + (d.calibration.calK != null ? d.calibration.calK : "\u2014") + ".",
        React.createElement("div", { style: { overflowX: "auto" } },
          React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
            React.createElement("thead", null, React.createElement("tr", null,
              cell("Decile", td), cell("Avg probTouch", td), cell("N", td), cell("Empirical Hit Rate", td), cell("vs 50%", td)
            )),
            React.createElement("tbody", null, d.calibration.buckets.map(function(b) {
              var diff = b.hitRate - 50;
              return React.createElement("tr", { key: b.decile },
                cell(b.decile), cell(b.avgProbTouch != null ? b.avgProbTouch.toFixed(2) : "\u2014"),
                cell(b.n),
                cell(React.createElement("span", { style: { fontWeight: 700, color: retColor(diff) } }, b.hitRate != null ? b.hitRate.toFixed(1) + "%" : "\u2014")),
                cell(React.createElement("span", { style: { color: diff > 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "var(--text5)", fontSize: 11 } }, (diff > 0 ? "+" : "") + diff.toFixed(1)))
              );
            }))
          )
        )
      )
    );
  };

  const runFn = () => { if (mode === "pathAnalysis") return runPathAnalysis(); if (mode === "single") return runSingle(); if (mode === "batch") return runBatch(); if (mode === "multiSymbol") return runMultiBacktest(); return runWalkForward(); };
  const runLabel = mode === "pathAnalysis" ? "\u25b6 Chart the Path" : mode === "single" ? "\u25b6 Run Analysis" : mode === "batch" ? "\u25b6 Run Batch" : mode === "multiSymbol" ? "\u25b6 Run Backtest" : "\u25b6 Run Walk-Forward";

  return React.createElement("div", null,

    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Backtesting"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } },
          (function() { var _pm = (TI && TI.getScoreConfig) ? (TI.getScoreConfig().pillarMax || {}) : {}; var _th = _pm.trendHealth != null ? _pm.trendHealth : 35; var _pb = _pm.pullbackQuality != null ? _pm.pullbackQuality : 30; var _p4 = _pm.prob4 != null ? _pm.prob4 : 35; var _sw = _pm.swingPotential != null ? _pm.swingPotential : 20; return "StoX engine \u00b7 grades the Entry Score (Trend " + _th + " / Pullback " + _pb + " / 4% Prob " + _p4 + " / Swing " + _sw + " + modifiers) as-of-date against a +" + fmt2(target) + "% target over " + fmtS(holding) + " sessions"; })()
        )
      )
    ),

    React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" } },
      [["single", "Single Symbol"], ["batch", "Batch Backtest"], ["walkforward", "Walk-Forward"], ["multiSymbol", "Multi Symbol"], ["pathAnalysis", "Path Analysis"]].map(function (m) {
        return React.createElement("button", {
          key: m[0], onClick: function () { setMode(m[0]); },
          style: {
            padding: "8px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: "pointer",
            border: "1px solid " + (mode === m[0] ? "var(--accent)" : "var(--border)"),
            background: mode === m[0] ? "rgba(6,182,212,.12)" : "var(--bg4)",
            color: mode === m[0] ? "var(--accent)" : "var(--text5)"
          }
        }, m[1]);
      })
    ),

    React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16, display: mode === "pathAnalysis" ? "none" : "" } },
      React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" } },
        mode !== "batch" && mode !== "multiSymbol" && field("Stock Ticker",
          React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } },
            React.createElement("input", { className: "inp", list: "bt2-symbols", type: "text", placeholder: "e.g. RELIANCE", value: ticker, onChange: (e) => setTicker(e.target.value.toUpperCase()), style: { width: 170 } }),
            React.createElement("datalist", { id: "bt2-symbols" }, NIFTY_200.map((s) => React.createElement("option", { key: s.t, value: s.t.replace(".NS", "") }, s.n)))
          )
        ),
        mode === "batch" && field("Universe Size",
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            [["20", "Random 20"], ["50", "Random 50"], ["100", "Random 100"], ["150", "Random 150"], ["nifty100", "NIFTY 100"], ["200", "NIFTY 200"], ["all", "All"]].map(function (c) {
              return React.createElement("button", {
                key: c[0], onClick: function () { setBatchCap(c[0]); },
                style: {
                  padding: "7px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                  border: "1px solid " + (String(batchCap) === c[0] ? "var(--accent)" : "var(--border)"),
                  background: String(batchCap) === c[0] ? "rgba(6,182,212,.12)" : "var(--bg4)",
                  color: String(batchCap) === c[0] ? "var(--accent)" : "var(--text5)"
                }
              }, c[1]);
            })
          )
        ),
        mode === "multiSymbol" && React.createElement("div", { style: { padding: "6px 12px", borderRadius: 8, background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.2)", fontSize: 11, color: "#f97316", fontWeight: 600 } },
          multiTickers.length > 0 ? multiTickers.length + " symbols selected from Screener" : "Select stocks in Screener and click Backtest"
        ),
        field("Target %", numInput(target, setTarget, 80)),
        field("Hold (sessions)", numInput(holding, setHolding, 80)),
        field("Min Score", numInput(threshold, setThreshold, 80)),
        mode === "walkforward" && field("Folds",
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            [2, 3, 4, 5, 6].map(function (f) {
              return React.createElement("button", {
                key: f, onClick: function () { setFolds(f); },
                style: {
                  padding: "7px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                  border: "1px solid " + (folds === f ? "var(--accent)" : "var(--border)"),
                  background: folds === f ? "rgba(6,182,212,.12)" : "var(--bg4)",
                  color: folds === f ? "var(--accent)" : "var(--text5)"
                }
              }, f);
            })
          )
        ),
        (mode !== "pathAnalysis") && React.createElement("button", { onClick: runFn, disabled: running, className: "stx-btn stx-btn-primary", style: { padding: "8px 18px", fontSize: 12, opacity: running ? 0.6 : 1, cursor: running ? "wait" : "pointer" } },
          running ? "Running\u2026" : runLabel
        ),
        running && React.createElement("button", { onClick: function () { cancelRef.current = true; }, className: "stx-btn", style: { fontSize: 11, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "#eab308", cursor: "pointer" } }, "Cancel"),
        mode === "multiSymbol" && multiResult && !running ? React.createElement("button", { onClick: function() { setMultiResult(null); setMultiTickers([]); setModeResult({ mode: "multiSymbol", tickers: [], data: null }); }, className: "stx-btn", style: { fontSize: 11, padding: "8px 12px", border: "1px solid #ef4444", background: "rgba(239,68,68,.08)", color: "#ef4444", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 } }, Ico.x(10, "#ef4444"), " Clear") : null,
        (singleResult || batchResult || wfResult || multiResult) && !running && React.createElement("button", { onClick: exportCSV, className: "stx-btn", style: { fontSize: 10, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" } }, React.createElement(React.Fragment, null, Ico.download(10), " CSV"))
      ),
      err && React.createElement("div", { style: { marginTop: 10, fontSize: 11, color: err.indexOf("cancelled") >= 0 ? "#eab308" : "#ef4444" } }, err),
      progress && React.createElement("div", { style: { marginTop: 12 } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 6, fontFamily: "var(--font-mono)" } },
          progress.phase + (progress.total ? " " + progress.done + " / " + progress.total : "")
        ),
        React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg4)", overflow: "hidden" } },
          React.createElement("div", { style: { height: "100%", width: progress.total ? Math.round(progress.done / progress.total * 100) + "%" : "100%", background: "var(--accent)", transition: "width .2s" } })
        )
      )
    ),

    React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: "8px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)" } }, "Offline Data:"),
      offlineMeta && offlineMeta.count > 0
        ? React.createElement("span", { style: { fontSize: 10, color: "#22c55e", fontWeight: 600 } }, offlineMeta.count + " stocks (" + offlineMeta.totalBars + " bars" + (offlineMeta.multiTF ? " D+H+W" : " daily only") + ") \u2014 downloaded " + (offlineMeta.downloadedAt ? new Date(offlineMeta.downloadedAt).toLocaleDateString() : ""))
        : React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "No offline data. Download from Score Tuner to speed up backtest.")
    ),

    React.createElement("div", { style: { display: mode === "single" ? "" : "none" } }, singleResult && !running && renderSingle(singleResult)),
    React.createElement("div", { style: { display: mode === "batch" ? "" : "none" } }, batchResult && !running && renderBatch(batchResult)),
    React.createElement("div", { style: { display: mode === "walkforward" ? "" : "none" } }, wfResult && !running && renderWalkForward(wfResult)),
    React.createElement("div", { style: { display: mode === "multiSymbol" ? "" : "none" } }, multiResult && !running && renderBatch(multiResult)),

    mode === "pathAnalysis" && React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
      React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 } },
        React.createElement("div", null,
          React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", display: "block", marginBottom: 3 } }, "Stock Ticker"),
          React.createElement("input", { className: "inp", list: "path-symbols", type: "text", placeholder: "e.g. RELIANCE", value: pathTicker, onChange: function(e) { setPathTicker(e.target.value.toUpperCase()); }, style: { width: 150 } }),
          React.createElement("datalist", { id: "path-symbols" }, NIFTY_200.map(function(s) { return React.createElement("option", { key: s.t, value: s.t.replace(".NS", "") }, s.n); }))
        ),
        React.createElement("div", null,
          React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", display: "block", marginBottom: 3 } }, "Entry Date"),
          React.createElement("input", { className: "inp", type: "date", value: pathEntryDate, onChange: function(e) { setPathEntryDate(e.target.value); }, style: { width: 150 } })
        ),
        React.createElement("div", null,
          React.createElement("label", { style: { fontSize: 10, fontWeight: 600, color: "var(--text5)", display: "block", marginBottom: 3 } }, "Exit Date"),
          React.createElement("input", { className: "inp", type: "date", value: pathExitDate, onChange: function(e) { setPathExitDate(e.target.value); }, style: { width: 150 } })
        ),
        React.createElement("button", { onClick: runPathAnalysis, disabled: pathLoading, className: "stx-btn stx-btn-primary", style: { padding: "8px 18px", fontSize: 12, opacity: pathLoading ? 0.6 : 1, cursor: pathLoading ? "wait" : "pointer" } },
          pathLoading ? "Loading\u2026" : "\u25b6 Chart the Path"
        ),
        pathResult && React.createElement("button", { onClick: function() { setPathResult(null); }, className: "stx-btn", style: { fontSize: 11, padding: "8px 12px", border: "1px solid #ef4444", background: "rgba(239,68,68,.08)", color: "#ef4444", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 } }, Ico.x(10, "#ef4444"), " Clear")
      ),
      pathErr && React.createElement("div", { style: { fontSize: 11, color: "#ef4444", marginBottom: 8 } }, pathErr)
    ),
    mode === "pathAnalysis" && pathResult && renderPathResult(pathResult),

    (singleResult || batchResult || wfResult || multiResult) && !running && React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", lineHeight: 1.6, padding: "0 2px" } },
      "Methodology: at each entry date D the daily series (and the Nifty index used for beta / relative strength) are sliced to end at D \u2014 no lookahead \u2014 and the production Entry Score engine runs on that exact snapshot. " +
      "A trade opens when the score \u2265 " + fmtS(threshold) + ", priced at D's close, and closes at +" + fmt2(target) + "% (target touched intraday) or at the close of the " + fmtS(holding) + "th session. " +
      "Periods with a full " + fmtS(holding) + "-session forward window are graded only."
    ),

    !(singleResult || batchResult || wfResult || multiResult) && !running && React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: 40, color: "var(--text6)", fontSize: 13 } },
      "Pick a mode and run a backtest. Single Symbol replays every session on one stock; Batch ranks the NIFTY 200 universe; Walk-Forward tests out-of-sample consistency fold by fold; Multi Symbol backtests stocks selected from the Screener; Path Analysis charts the daily price path for any ticker over a date range."
    )
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   SCORE TUNER — Entry Score sensitivity & component analysis
   ══════════════════════════════════════════════════════════════════════════ */
const ScoreTunerPanel = () => {
  const DF = window.OHLCVFetcher;
  const TI = window.TechIndicators;
  const BE = window.BacktestEngine;

  const [universe, setUniverse] = useState("random50");
  const [target, setTarget] = useState(4);
  const [holding, setHolding] = useState(14);
  const [threshold, setThreshold] = useState(65);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState("threshold");
  const cancelRef = useRef(false);
  const [showConfig, setShowConfig] = useState(false);
  const [scoreConfig, setScoreConfigState] = useState(function() {
    try {
      var defaults = TI.getScoreConfig ? TI.getScoreConfig() : {};
      var curVer = (TI.getScoreConfigVersion) ? TI.getScoreConfigVersion() : null;
      var saved = JSON.parse(localStorage.getItem("stox_score_config"));
      if (saved && curVer != null && saved._v !== curVer) {
        localStorage.removeItem("stox_score_config");
        saved = null;
      }
      if (saved) {
        // Merge with defaults to ensure new sections exist
        Object.keys(defaults).forEach(function(k) { if (!(k in saved)) saved[k] = defaults[k]; });
        return saved;
      }
      return defaults;
    } catch(e) { return TI.getScoreConfig ? TI.getScoreConfig() : {}; }
  });
  const [offlineMeta, setOfflineMeta] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);

  const UNIVERSES = [
    { key: "random20", label: "Random 20", desc: "Random 20 large+mid cap (~1 min)", filter: function(s) { return true; }, limit: 20, random: true },
    { key: "random50", label: "Random 50", desc: "Random 50 large+mid cap (~2 min)", filter: function(s) { return true; }, limit: 50, random: true },
    { key: "random100", label: "Random 100", desc: "Random 100 large+mid cap (~5 min)", filter: function(s) { return true; }, limit: 100, random: true },
    { key: "random150", label: "Random 150", desc: "Random 150 large+mid cap (~10 min)", filter: function(s) { return true; }, limit: 150, random: true },
    { key: "nifty100", label: "NIFTY 100", desc: "Large + mid cap (~100 stocks, ~5 min)", filter: function(s) { return true; }, limit: 100 },
    { key: "nifty200", label: "NIFTY 200", desc: "Full universe (~200 stocks, ~15 min)", filter: function(s) { return true; } },
  ];

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function updateScoreConfig(path, value) {
    var parts = path.split(".");
    var newCfg = JSON.parse(JSON.stringify(scoreConfig));
    var obj = newCfg;
    for (var i = 0; i < parts.length - 1; i++) { obj = obj[parts[i]]; }
    obj[parts[parts.length - 1]] = parseFloat(value) || 0;

    setScoreConfigState(newCfg);
    newCfg._v = (TI.getScoreConfigVersion) ? TI.getScoreConfigVersion() : undefined;
    try { localStorage.setItem("stox_score_config", JSON.stringify(newCfg)); } catch(e) {}
    if (TI.setScoreConfig) TI.setScoreConfig(newCfg);
  }

  function resetScoreConfig() {
    var def = TI.getDefaultScoreConfig ? TI.getDefaultScoreConfig() : (TI.getScoreConfig ? TI.getScoreConfig() : {});
    setScoreConfigState(def);
    try { localStorage.removeItem("stox_score_config"); } catch(e) {}
    if (TI.setScoreConfig) TI.setScoreConfig(def);
  }

  /* ── Offline data: load metadata on mount ── */
  useEffect(function() {
    OfflineOHLCV.getMeta().then(function(meta) { setOfflineMeta(meta); }).catch(function() {});
  }, []);

  /* ── Download all NIFTY 200 daily+hourly+weekly candles to JSON file ── */
  const downloadAllDaily = async () => {
    setDownloading(true); setDownloadProgress({ phase: "Starting...", done: 0, total: 0 }); cancelRef.current = false;
    try {
      var stockList = NIFTY_200.slice();
      var symbols = stockList.map(function(s) { return s.t; });
      var timeframes = ["daily", "1h", "weekly"];
      var totalFetches = symbols.length * timeframes.length;
      setDownloadProgress({ phase: "Fetching " + timeframes.join("+") + " candles for " + symbols.length + " stocks...", done: 0, total: totalFetches });
      var dataMap = {};
      var errors = [];
      var fetchIdx = 0;
      for (var i = 0; i < symbols.length; i++) {
        dataMap[symbols[i]] = {};
        for (var ti = 0; ti < timeframes.length; ti++) {
          if (cancelRef.current) throw new Error("cancelled");
          var tf = timeframes[ti];
          try {
            var r = await DF.fetchOHLCVCached(symbols[i], tf);
            var c = (r && r.data) || null;
            var minBars = tf === "daily" ? 80 : tf === "1h" ? 40 : 30;
            if (c && c.length >= minBars) {
              dataMap[symbols[i]][tf] = c;
            } else {
              errors.push(symbols[i] + " " + tf + ": " + (c ? c.length + " bars" : "no data"));
            }
          } catch (e) { errors.push(symbols[i] + " " + tf + ": " + (e.message || e)); }
          fetchIdx++;
          setDownloadProgress({ phase: "Fetching " + tf + " candles...", done: fetchIdx, total: totalFetches });
          await new Promise(function(r) { setTimeout(r, 0); });
        }
      }
      var validCount = Object.keys(dataMap).filter(function(t) { return Object.keys(dataMap[t]).length > 0; }).length;
      if (validCount === 0) throw new Error("No valid data fetched. " + errors.length + " failures.");

      /* Save to IndexedDB */
      var records = Object.keys(dataMap).map(function(ticker) {
        return { ticker: ticker, daily: dataMap[ticker].daily || null, hourly: dataMap[ticker]["1h"] || null, weekly: dataMap[ticker].weekly || null, downloadedAt: Date.now() };
      });
      await OfflineOHLCV.clear();
      await OfflineOHLCV.putBulk(records);
      var meta = await OfflineOHLCV.getMeta();
      setOfflineMeta(meta);
      window.dispatchEvent(new CustomEvent("stox:offline-data-changed"));

      /* Also download as JSON file — normalize keys to daily/hourly/weekly */
      var exportData = {};
      Object.keys(dataMap).forEach(function(ticker) {
        exportData[ticker] = { daily: dataMap[ticker].daily || null, hourly: dataMap[ticker]["1h"] || null, weekly: dataMap[ticker].weekly || null };
      });
      var exportObj = { version: 2, downloadedAt: new Date().toISOString(), timeframes: timeframes, stockCount: validCount, errors: errors, data: exportData };
      var blob = new Blob([JSON.stringify(exportObj)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = "stox-ohlcv-multi-tf-" + TODAY() + ".json"; a.click();
      URL.revokeObjectURL(url);

      setDownloadProgress(null);
    } catch (e) {
      if ((e && e.message) !== "cancelled") setErr((e && e.message) || String(e));
      setDownloadProgress(null);
    }
    setDownloading(false);
  };

  /* ── Load offline data from JSON file ── */
  const loadOfflineData = async () => {
    try {
      var content = await readFromFileInput(".json");
      var obj = JSON.parse(content);
      var dataMap = obj.data || obj;
      var dlAt = obj.downloadedAt ? new Date(obj.downloadedAt).getTime() : Date.now();
      var records = Object.keys(dataMap).map(function(ticker) {
        var entry = dataMap[ticker];
        /* v2 schema: entry is { daily: [...], hourly: [...], weekly: [...] } */
        if (entry && (entry.daily || entry.hourly || entry["1h"] || entry.weekly)) {
          return { ticker: ticker, daily: entry.daily || null, hourly: entry.hourly || entry["1h"] || null, weekly: entry.weekly || null, downloadedAt: dlAt };
        }
        /* v1 schema: entry is raw candle array */
        return { ticker: ticker, data: entry, downloadedAt: dlAt };
      });
      await OfflineOHLCV.clear();
      await OfflineOHLCV.putBulk(records);
      var meta = await OfflineOHLCV.getMeta();
      setOfflineMeta(meta);
      window.dispatchEvent(new CustomEvent("stox:offline-data-changed"));
    } catch (e) {
      setErr("Failed to load file: " + (e.message || e));
    }
  };

  /* ── Clear offline data ── */
  const clearOfflineData = async () => {
    await OfflineOHLCV.clear();
    setOfflineMeta(null);
    window.dispatchEvent(new CustomEvent("stox:offline-data-changed"));
  };

  const getUniverseConfig = function() {
    return UNIVERSES.find(function(u) { return u.key === universe; }) || UNIVERSES[0];
  };

  const buildScoreFn = (idxCandles, multiTFMap) => (candles, idx, symbol) => {
    const bar = candles[idx];
    if (!bar) return null;
    const ts = bar.t;
    let idxSlice = null;
    if (idxCandles && idxCandles.length && ts != null) {
      let lo = 0, hi = idxCandles.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (idxCandles[mid].t <= ts) lo = mid + 1; else hi = mid; }
      if (lo > 0) idxSlice = idxCandles.slice(0, lo);
    }

    /* Try multi-TF scoring if data available */
    var tfData = multiTFMap && symbol ? multiTFMap[symbol] : null;
    if (tfData && (tfData.daily || tfData.hourly || tfData.weekly)) {
      function sliceBefore(arr) {
        if (!arr) return null;
        var fi = arr.findIndex(function(b) { return b.t > ts; });
        return arr.slice(0, fi === -1 ? arr.length : fi);
      }
      var dailySlice = sliceBefore(tfData.daily);
      var hourlySlice = sliceBefore(tfData.hourly);
      var weeklySlice = sliceBefore(tfData.weekly);
      var tfResults = [];
      if (dailySlice && dailySlice.length >= 50) tfResults.push({ timeframe: "D", candles: dailySlice });
      if (hourlySlice && hourlySlice.length >= 50) tfResults.push({ timeframe: "H", candles: hourlySlice });
      if (weeklySlice && weeklySlice.length >= 50) tfResults.push({ timeframe: "W", candles: weeklySlice });
      if (tfResults.length >= 2) {
        try {
          var mtf = TI.computeMultiTFEntryScore(tfResults, idxSlice, null);
          if (mtf && mtf.multiTF_score != null) {
            return { entryScore: mtf.multiTF_score, raw_score: mtf.raw_score, classification: mtf.classification, trendHealth: mtf.trendHealth, pullbackQuality: mtf.pullbackQuality, prob4: mtf.prob4, swingPotential: mtf.swingPotential, modifiers: mtf.modifiers };
          }
        } catch (e) {}
      }
    }

    /* Fall back to single-TF daily scoring */
    let res;
    try { res = TI.computeEntryScore(candles.slice(0, idx + 1), idxSlice && idxSlice.length ? idxSlice : null); } catch (e) { return null; }
    if (!res || res.entry_score == null) return null;
    return { entryScore: res.entry_score, raw_score: res.raw_score, classification: res.classification, trendHealth: res.trendHealth, pullbackQuality: res.pullbackQuality, prob4: res.prob4, swingPotential: res.swingPotential, modifiers: res.modifiers };
  };

  const runSweep = async () => {
    setRunning(true); setErr(""); setResult(null); setProgress({ phase: "Fetching data...", done: 0, total: 0 }); cancelRef.current = false;
    try {
      const ucfg = getUniverseConfig();
      var stockList = NIFTY_200.filter(ucfg.filter);
      if (ucfg.random) stockList = shuffleArray(stockList);
      if (ucfg.limit) stockList = stockList.slice(0, ucfg.limit);
      const symbols = stockList.map(s => s.t);

      // Adaptive sampling: larger universes sample more aggressively
      const sampleEvery = symbols.length > 150 ? 4 : symbols.length > 80 ? 3 : 2;

      const dataMap = {};
      const multiTFMap = {};
      const idxSym = "^NSEI";
      let idxCandles = null;

      /* Check offline data first */
      var useOffline = offlineMeta && offlineMeta.count > 0;
      if (useOffline) {
        setProgress({ phase: "Loading from offline data (" + offlineMeta.count + " stocks)...", done: 0, total: symbols.length });
        try { const r = await DF.fetchOHLCVCached(idxSym, "daily"); idxCandles = (r && r.data) || null; } catch (e) {}
        var offlineTickers = new Set(offlineMeta.tickers);
        for (let i = 0; i < symbols.length; i++) {
          if (cancelRef.current) throw new Error("cancelled");
          if (offlineTickers.has(symbols[i])) {
            try {
              var rec = await OfflineOHLCV.get(symbols[i]);
              if (rec) {
                /* v2 schema: rec.daily, rec.hourly, rec.weekly */
                var dailyCandles = rec.daily || rec.data || null;
                if (dailyCandles && dailyCandles.length >= 80) {
                  dataMap[symbols[i]] = dailyCandles;
                  multiTFMap[symbols[i]] = { daily: rec.daily || null, hourly: rec.hourly || null, weekly: rec.weekly || null };
                }
              }
            } catch (e) {}
          }
          setProgress({ phase: "Loading from offline data...", done: i + 1, total: symbols.length });
          await new Promise(r => setTimeout(r, 0));
        }
      }

      /* Fall back to live fetch if offline had no matching stocks */
      var needLive = Object.keys(dataMap).length === 0;
      if (needLive) {
        setProgress({ phase: "Fetching daily+hourly+weekly for " + symbols.length + " stocks...", done: 0, total: symbols.length });
        try { const r = await DF.fetchOHLCVCached(idxSym, "daily"); idxCandles = (r && r.data) || null; } catch (e) {}
        var fetchErrors = [];
        for (let i = 0; i < symbols.length; i++) {
          if (cancelRef.current) throw new Error("cancelled");
          try {
            const r = await DF.fetchOHLCVCached(symbols[i], "daily");
            const c = (r && r.data) || null;
            if (c && c.length >= 80) {
              dataMap[symbols[i]] = c;
              /* Fetch hourly and weekly in parallel */
              var [hRes, wRes] = await Promise.all([
                DF.fetchOHLCVCached(symbols[i], "1h").catch(function() { return null; }),
                DF.fetchOHLCVCached(symbols[i], "weekly").catch(function() { return null; })
              ]);
              multiTFMap[symbols[i]] = {
                daily: c,
                hourly: hRes && hRes.data ? hRes.data : null,
                weekly: wRes && wRes.data ? wRes.data : null
              };
            } else {
              fetchErrors.push(symbols[i] + ": " + (c ? c.length + " bars" : "no data"));
            }
          } catch (e) { fetchErrors.push(symbols[i] + ": " + (e.message || e)); }
          setProgress({ phase: "Fetching candles...", done: i + 1, total: symbols.length });
          await new Promise(r => setTimeout(r, 0));
        }
      }
      const validCount = Object.keys(dataMap).length;
      if (validCount === 0) {
        var debugMsg = "No valid data found. ";
        if (needLive && typeof fetchErrors !== "undefined") {
          debugMsg += fetchErrors.length + " failures.";
          if (fetchErrors.length > 0) debugMsg += " First 5: " + fetchErrors.slice(0, 5).join("; ");
        } else {
          debugMsg += "Offline data has no matching stocks for this universe. Try downloading data first.";
        }
        throw new Error(debugMsg);
      }

      setProgress({ phase: "Running sweep on " + validCount + " stocks...", done: 0, total: 1 });

      const engine = BE.create({
        scoreFn: buildScoreFn(idxCandles, multiTFMap),
        targetProfitPct: target,
        holdingPeriodDays: holding,
        threshold: threshold
      });

      const sweepResult = await engine.sweepEntryScore(dataMap, {
        symbols: Object.keys(dataMap),
        scoreThresholds: [40, 45, 50, 55, 60, 65, 70, 75, 80],
        pillarSweep: { trendHealth: [0, 5, 10, 15, 20, 25, 30, 35], pullbackQuality: [0, 5, 10, 15, 20, 25, 30], prob4: [0, 5, 10, 15, 20, 25, 30, 35], swingPotential: [0, 5, 10, 15, 20] },
        sampleEvery: sampleEvery
      }, {
        onProgress: (done, total, label) => { if (!cancelRef.current) setProgress({ phase: label, done, total }); }
      });

      setProgress({ phase: "Analyzing components...", done: 0, total: 1 });
      const componentResult = await engine.analyzeComponentPower(dataMap, {
        symbols: Object.keys(dataMap),
        sampleEvery: sampleEvery
      }, {
        onSymbol: (done, total) => { if (!cancelRef.current) setProgress({ phase: "Component analysis...", done, total }); }
      });

      setResult({ sweep: sweepResult, components: componentResult, engine: engine, universeLabel: ucfg.label, stockCount: validCount });
      setProgress(null);
    } catch (e) {
      setErr((e && e.message) || String(e));
      setProgress(null);
    }
    setRunning(false);
  };

  const exportCSV = (type) => {
    if (!result || !result.engine) return;
    const csv = result.engine.exportSweepCSV(result.sweep, type);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "stox_sweep_" + type + ".csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const th = { fontSize: 11, fontWeight: 600, color: "var(--text3)", padding: "6px 8px", textAlign: "left", borderBottom: "1px solid var(--border)" };
  const thR = { fontSize: 11, fontWeight: 600, color: "var(--text3)", padding: "6px 8px", textAlign: "right", borderBottom: "1px solid var(--border)" };
  const td = { fontSize: 11, color: "var(--text)", padding: "6px 8px", borderBottom: "1px solid var(--border)" };
  const tdR = Object.assign({}, td, { textAlign: "right" });

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Score Tuner"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } }, "Sweep entry score thresholds to find optimal filters. Tests each pillar independently to measure predictive power.")
      )
    ),

    React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 16 } },
      React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Universe"),
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            UNIVERSES.map(u => React.createElement("button", {
              key: u.key, onClick: () => setUniverse(u.key),
              title: u.desc,
              style: { padding: "7px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", border: "1px solid " + (universe === u.key ? "var(--accent)" : "var(--border)"), background: universe === u.key ? "rgba(6,182,212,.12)" : "var(--bg4)", color: universe === u.key ? "var(--accent)" : "var(--text5)" }
            }, u.label))
          ),
          React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } }, getUniverseConfig().desc)
        ),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Target %"),
          React.createElement("input", { className: "inp", type: "number", value: target, onChange: e => setTarget(parseFloat(e.target.value) || 4), style: { width: 70 } })
        ),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Hold Days"),
          React.createElement("input", { className: "inp", type: "number", value: holding, onChange: e => setHolding(parseInt(e.target.value) || 14), style: { width: 70 } })
        ),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text5)", marginBottom: 4 } }, "Base Threshold"),
          React.createElement("input", { className: "inp", type: "number", value: threshold, onChange: e => setThreshold(parseInt(e.target.value) || 65), style: { width: 70 } })
        ),
        React.createElement("button", { onClick: runSweep, disabled: running, className: "stx-btn stx-btn-primary", style: { padding: "8px 18px", fontSize: 12, opacity: running ? 0.6 : 1, cursor: running ? "wait" : "pointer" } },
          running ? "Running..." : "Run Sweep"
        ),
        running && React.createElement("button", { onClick: () => { cancelRef.current = true; }, className: "stx-btn", style: { fontSize: 11, padding: "8px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "#eab308", cursor: "pointer" } }, "Cancel")
      ),
      err && React.createElement("div", { style: { marginTop: 10, fontSize: 11, color: err.indexOf("cancelled") >= 0 ? "#eab308" : "#ef4444" } }, err),
      progress && React.createElement("div", { style: { marginTop: 12 } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 6, fontFamily: "var(--font-mono)" } },
          progress.phase + (progress.total ? " " + progress.done + " / " + progress.total : "")
        ),
        React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg4)", overflow: "hidden" } },
          React.createElement("div", { style: { height: "100%", width: progress.total ? Math.round(progress.done / progress.total * 100) + "%" : "100%", background: "var(--accent)", transition: "width .2s" } })
        )
      )
    ),

    React.createElement("div", { className: "stx-card", style: { marginBottom: 16, padding: 12 } },
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
        React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text3)" } }, "Offline Data:"),
        React.createElement("button", { onClick: downloadAllDaily, disabled: downloading, className: "stx-btn stx-btn-primary", style: { fontSize: 11, padding: "6px 12px", opacity: downloading ? 0.6 : 1, cursor: downloading ? "wait" : "pointer" } },
          downloading ? "Downloading..." : "Download D+H+W"
        ),
        React.createElement("button", { onClick: loadOfflineData, className: "stx-btn", style: { fontSize: 11, padding: "6px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)" } }, "Load from File"),
        offlineMeta && offlineMeta.count > 0 && React.createElement("button", { onClick: clearOfflineData, className: "stx-btn", style: { fontSize: 11, padding: "6px 12px", border: "1px solid var(--border)", background: "var(--bg4)", color: "#ef4444" } }, "Clear"),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)" } },
          offlineMeta && offlineMeta.count > 0
            ? React.createElement("span", null, React.createElement("span", { style: { color: "#22c55e", fontWeight: 600 } }, offlineMeta.count + " stocks"), " (" + offlineMeta.totalBars + " bars" + (offlineMeta.multiTF ? " D+H+W" : " daily only") + ") downloaded " + (offlineMeta.downloadedAt ? new Date(offlineMeta.downloadedAt).toLocaleDateString() : ""))
            : React.createElement("span", { style: { color: "var(--text6)" } }, "No offline data. Download D+H+W for multi-timeframe scoring.")
        )
      ),
      downloading && downloadProgress && React.createElement("div", { style: { marginTop: 8 } },
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 4, fontFamily: "var(--font-mono)" } },
          downloadProgress.phase + (downloadProgress.total ? " " + downloadProgress.done + " / " + downloadProgress.total : "")
        ),
        React.createElement("div", { style: { height: 4, borderRadius: 2, background: "var(--bg4)", overflow: "hidden" } },
          React.createElement("div", { style: { height: "100%", width: downloadProgress.total ? Math.round(downloadProgress.done / downloadProgress.total * 100) + "%" : "100%", background: "var(--accent)", transition: "width .2s" } })
        )
      )
    ),

    React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 0 } },
        [["threshold", "Threshold Sweep"], ["pillar", "Pillar Sweep"], ["component", "Component Power"], ["config", "Score Config"]].map(([k, label]) =>
          React.createElement("button", {
            key: k, onClick: () => setActiveResultTab(k),
            style: { padding: "8px 14px", fontSize: 11, fontWeight: activeResultTab === k ? 700 : 600, background: "transparent", border: "none", borderBottom: "2px solid " + (activeResultTab === k ? "var(--accent)" : "transparent"), color: activeResultTab === k ? "var(--accent)" : "var(--text5)", cursor: "pointer" }
          }, label)
        ),
        React.createElement("div", { style: { flex: 1 } }),
        result && activeResultTab !== "config" && React.createElement("button", { onClick: () => exportCSV(activeResultTab), className: "stx-btn", style: { fontSize: 11, padding: "6px 10px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer", marginBottom: 4 } }, "Export CSV")
      ),

      result && activeResultTab === "threshold" && React.createElement("div", { className: "stx-card", style: { padding: 12, overflowX: "auto" } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text)" } }, "Total Score Threshold Sweep"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 10 } }, "How changing the minEntryScore filter affects win rate, avg return, and profit factor across the universe."),
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
          React.createElement("thead", null, React.createElement("tr", null,
            [React.createElement("th", { key: "h", style: th, title: "Min total entry score (0\u2013100) required to trigger a buy signal" }, "Threshold"),
             React.createElement("th", { key: "s", style: thR, title: "Number of qualifying entry signals across all symbols at this threshold" }, "Signals"),
             React.createElement("th", { key: "w", style: thR, title: "% of signals that hit the +target% within the holding period" }, "Win Rate"),
             React.createElement("th", { key: "r", style: thR, title: "Average per-trade return, weighted by trade count across all symbols" }, "Avg Return"),
             React.createElement("th", { key: "p", style: thR, title: "Profit factor = gross profit / gross loss; >1.0 = profitable system" }, "Avg PF"),
             React.createElement("th", { key: "y", style: thR, title: "Number of symbols with at least one qualifying signal" }, "Symbols")]
          )),
          React.createElement("tbody", null, (result.sweep.thresholdSweep || []).map(r =>
            React.createElement("tr", { key: r.threshold },
              React.createElement("td", { style: td }, React.createElement("strong", null, ">= " + r.threshold)),
              React.createElement("td", { style: tdR }, r.signals),
              React.createElement("td", { style: Object.assign({}, tdR, { color: r.winRate >= 50 ? "#22c55e" : r.winRate >= 40 ? "#eab308" : "#ef4444", fontWeight: 700 }) }, r.winRate != null ? r.winRate + "%" : "--"),
              React.createElement("td", { style: Object.assign({}, tdR, { color: (r.avgReturn || 0) >= 0 ? "#22c55e" : "#ef4444" }) }, r.avgReturn != null ? r.avgReturn.toFixed(2) + "%" : "--"),
              React.createElement("td", { style: tdR }, r.avgProfitFactor != null ? r.avgProfitFactor.toFixed(2) : "--"),
              React.createElement("td", { style: tdR }, r.symbolsTested)
            )
          ))
        )
      ),

      result && activeResultTab === "pillar" && React.createElement("div", { className: "stx-card", style: { padding: 12, overflowX: "auto" } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text)" } }, "Pillar-Level Sweep"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 10 } }, "Each pillar tested independently across all scored bars (no total score filter). Higher correlation with win rate = more predictive."),
        Object.keys(result.sweep.pillarSweep || {}).map(pillar =>
          React.createElement("div", { key: pillar, style: { marginBottom: 16 } },
            React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 4, textTransform: "capitalize" } }, pillar.replace(/([A-Z])/g, " $1").trim()),
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
              React.createElement("thead", null, React.createElement("tr", null,
                [React.createElement("th", { key: "m", style: th, title: "Min pillar score to include in this filter" }, "Min Value"),
                 React.createElement("th", { key: "s", style: thR, title: "Entry signals meeting this pillar threshold" }, "Signals"),
                 React.createElement("th", { key: "w", style: thR, title: "% of signals that hit the +target% within holding period" }, "Win Rate"),
                 React.createElement("th", { key: "r", style: thR, title: "Average per-trade return, weighted by trade count" }, "Avg Return"),
                 React.createElement("th", { key: "p", style: thR, title: "Profit factor = gross profit / gross loss; >1.0 = profitable" }, "Avg PF")]
              )),
              React.createElement("tbody", null, (result.sweep.pillarSweep[pillar] || []).map(r =>
                React.createElement("tr", { key: r.minValue },
                  React.createElement("td", { style: td }, ">= " + r.minValue),
                  React.createElement("td", { style: tdR }, r.signals),
                  React.createElement("td", { style: Object.assign({}, tdR, { color: r.winRate >= 50 ? "#22c55e" : r.winRate >= 40 ? "#eab308" : "#ef4444", fontWeight: 700 }) }, r.winRate != null ? r.winRate + "%" : "--"),
                  React.createElement("td", { style: Object.assign({}, tdR, { color: (r.avgReturn || 0) >= 0 ? "#22c55e" : "#ef4444" }) }, r.avgReturn != null ? r.avgReturn.toFixed(2) + "%" : "--"),
                  React.createElement("td", { style: tdR }, r.avgProfitFactor != null ? r.avgProfitFactor.toFixed(2) : "--")
                )
              ))
            )
          )
        )
      ),

      result && activeResultTab === "pillar" && result.components && result.components.pillarConsumption && React.createElement("div", { className: "stx-card", style: { padding: 12, marginTop: 16 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 4, color: "var(--text)" } }, "Pillar Score Consumption"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 10 } }, "How much of each pillar's max score was actually used in this run. If max touched is far below the configured max, increasing it further has no effect."),
        React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } },
          ["trendHealth", "pullbackQuality", "prob4", "swingPotential"].map(function(p) {
            var pc = result.components.pillarConsumption[p];
            if (!pc) return null;
            var label = p.replace(/([A-Z])/g, " $1").trim();
            var pctUsed = pc.max > 0 ? Math.round((pc.touched / pc.max) * 100) : 0;
            var barColor = pctUsed >= 90 ? "#22c55e" : pctUsed >= 60 ? "#eab308" : "#ef4444";
            return React.createElement("div", { key: p, style: { flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: 10, background: "var(--bg4)", border: "1px solid var(--border)" } },
              React.createElement("div", { style: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text6)", fontWeight: 700, marginBottom: 6 } }, label),
              React.createElement("div", { style: { display: "flex", gap: 16, marginBottom: 6 } },
                React.createElement("div", null,
                  React.createElement("div", { style: { fontSize: 9, color: "var(--text6)" } }, "Max Touched"),
                  React.createElement("div", { style: { fontSize: 16, fontWeight: 800, fontFamily: "var(--font-heading)", color: barColor } }, pc.touched + " / " + pc.max)
                ),
                React.createElement("div", null,
                  React.createElement("div", { style: { fontSize: 9, color: "var(--text6)" } }, "At Max"),
                  React.createElement("div", { style: { fontSize: 16, fontWeight: 800, fontFamily: "var(--font-heading)" } }, pc.atMaxPct + "%")
                ),
                React.createElement("div", null,
                  React.createElement("div", { style: { fontSize: 9, color: "var(--text6)" } }, "Average"),
                  React.createElement("div", { style: { fontSize: 16, fontWeight: 800, fontFamily: "var(--font-heading)" } }, pc.avg)
                )
              ),
              React.createElement("div", { style: { height: 4, borderRadius: 2, background: "var(--bg3)", overflow: "hidden", marginBottom: 4 } },
                React.createElement("div", { style: { height: "100%", width: pctUsed + "%", background: barColor, transition: "width .3s" } })
              ),
              React.createElement("div", { style: { fontSize: 9, color: "var(--text6)" } }, pc.symbols + " symbols \u00b7 " + pc.count + " scored bars")
            );
          })
        )
      ),

      result && activeResultTab === "component" && React.createElement("div", { className: "stx-card", style: { padding: 12, overflowX: "auto" } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text)" } }, "Component Predictive Power"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 10 } }, "Point-biserial correlation of each component with forward hit rate. Higher abs(correlation) = more predictive. Info Value > 0.1 = meaningful."),
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
          React.createElement("thead", null, React.createElement("tr", null,
            [React.createElement("th", { key: "c", style: th, title: "Score component being evaluated for predictive power" }, "Component"),
             React.createElement("th", { key: "r", style: thR, title: "Point-biserial correlation with forward hit rate; |r|>0.1 = meaningful" }, "Correlation"),
             React.createElement("th", { key: "i", style: thR, title: "Information Value; >0.1 = strong predictive power, <0.05 = weak" }, "Info Value"),
             React.createElement("th", { key: "n", style: thR, title: "Total scored bars contributing to this analysis" }, "N"),
             React.createElement("th", { key: "q", style: th, title: "Win rate split into 5 equal groups sorted low\u2192high by component value" }, "Win Rate by Quintile")]
          )),
          React.createElement("tbody", null, Object.keys((result.components && result.components.components) || {}).map(k => {
            const c = result.components.components[k];
            if (!c || c.error) return null;
            const quintiles = (c.bucketWinRates || []).map(b => b.winRate + "%").join(" > ");
            return React.createElement("tr", { key: k },
              React.createElement("td", { style: td }, React.createElement("strong", null, k === "entryScore" ? "Total Score" : k.replace(/([A-Z])/g, " $1").trim())),
              React.createElement("td", { style: Object.assign({}, tdR, { color: Math.abs(c.correlation) >= 0.1 ? "#22c55e" : Math.abs(c.correlation) >= 0.05 ? "#eab308" : "var(--text5)", fontWeight: 700 }) }, c.correlation.toFixed(3)),
              React.createElement("td", { style: Object.assign({}, tdR, { color: c.infoValue >= 0.1 ? "#22c55e" : "var(--text5)" }) }, c.infoValue.toFixed(3)),
              React.createElement("td", { style: tdR }, c.n),
              React.createElement("td", { style: Object.assign({}, td, { fontSize: 11, fontFamily: "var(--font-mono)" }) }, quintiles || "--")
            );
          }))
        )
      ),

      activeResultTab === "config" && React.createElement("div", { className: "stx-card", style: { padding: 16 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, "Score Configuration"),
            React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginTop: 2 } }, "Adjust weights and thresholds. Changes apply immediately to entry score calculations. Saved to localStorage.")
          ),
          React.createElement("button", { onClick: resetScoreConfig, className: "stx-btn", style: { fontSize: 11, padding: "6px 10px", border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" } }, "Reset Defaults")
        ),
        /* Pillar Max Scores */
        React.createElement("div", { style: { marginBottom: 16 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, "Confidence Horizon"),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
            React.createElement("span", { style: { fontSize: 11, color: "var(--text5)" } }, "Forward horizon (trading days)"),
            React.createElement("input", { className: "inp", type: "range", min: 3, max: 30, step: 1, value: scoreConfig.horizonDays || 10, onChange: function(e) { updateScoreConfig("horizonDays", e.target.value); }, style: { width: 160, accentColor: "var(--accent)" } }),
            React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-mono)", minWidth: 30 } }, scoreConfig.horizonDays || 10),
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "days")
          )
        ),
        /* Pillar Max Scores */
        React.createElement("div", { style: { marginBottom: 16 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, "Pillar Max Scores"),

          React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } },
            [["pillarMax.trendHealth", "Trend Health"], ["pillarMax.pullbackQuality", "Pullback Quality"], ["pillarMax.prob4", "4% Probability"], ["pillarMax.swingPotential", "Swing Potential"]].map(([path, label]) =>
              React.createElement("div", { key: path, style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", minWidth: 110 } }, label),
                React.createElement("input", { className: "inp", type: "number", value: scoreConfig.pillarMax[path.split(".")[1]], onChange: e => updateScoreConfig(path, e.target.value), style: { width: 75, fontSize: 11 } })
              )
            )
          )
        ),
        /* MTF Weights */
        React.createElement("div", { style: { marginBottom: 16 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, "Timeframe Weights"),
          React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } },
            [["tfWeights.D", "Daily"], ["tfWeights.H", "Hourly"], ["tfWeights.W", "Weekly"]].map(([path, label]) =>
              React.createElement("div", { key: path, style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", minWidth: 60 } }, label),
                React.createElement("input", { className: "inp", type: "number", step: 0.05, min: 0, max: 1, value: scoreConfig.tfWeights[path.split(".")[1]], onChange: e => updateScoreConfig(path, e.target.value), style: { width: 75, fontSize: 11 } })
              )
            )
          )
        ),
        /* Pillar 1: Trend Health */
        React.createElement("div", { style: { marginBottom: 16 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, "Pillar 1: Trend Health"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 } },
            [["trendHealth.priceAboveSMA50", "Price > SMA50", 0, 10], ["trendHealth.SMA20AboveSMA50", "SMA20 > SMA50", 0, 10], ["trendHealth.priceAboveSMA20_or_VWAP", "Price > SMA20/VWAP", 0, 10],
             ["trendHealth.ADX_DI", "ADX + DI", 0, 10], ["trendHealth.adxThreshold", "ADX Threshold", 10, 40], ["trendHealth.mansfieldRS", "Mansfield RS", 0, 10],
             ["trendHealth.mansfieldRSThreshold", "Mansfield Threshold", -10, 10], ["trendHealth.macdCross", "MACD Cross", 0, 10], ["trendHealth.weeklyHABullish", "Weekly HA Bull", 0, 5],
             ["trendHealth.sma20Slope", "SMA20 Slope", 0, 5], ["trendHealth.sma20SlopeThreshold", "Slope Threshold", -0.1, 0.2]
            ].map(([path, label, min, max]) =>
              React.createElement("div", { key: path, style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", minWidth: 130 } }, label),
                React.createElement("input", { className: "inp", type: "number", step: 0.5, min: min, max: max, value: scoreConfig.trendHealth[path.split(".")[1]], onChange: e => updateScoreConfig(path, e.target.value), style: { width: 75, fontSize: 11 } })
              )
            )
          )
        ),
        /* Pillar 2: Pullback Quality */
        React.createElement("div", { style: { marginBottom: 16 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, "Pillar 2: Pullback Quality"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 } },
            [["pullbackQuality.distATR_inner", "ATR Dist Inner", 0, 15], ["pullbackQuality.distATR_innerRange", "Inner Range (ATR)", 0.5, 3],
             ["pullbackQuality.distATR_outer", "ATR Dist Outer", 0, 10], ["pullbackQuality.distATR_outerRange", "Outer Range (ATR)", 1, 5],
             ["pullbackQuality.candleColor", "Candle Color", 0, 10], ["pullbackQuality.bbWidthSqueeze", "BB Squeeze", 0, 10],
             ["pullbackQuality.rsiOversold", "RSI Oversold", 0, 10], ["pullbackQuality.stochRSIThreshold", "StochRSI Threshold", 5, 40],
             ["pullbackQuality.rsiOversoldNormal", "RSI Normal Threshold", 20, 50], ["pullbackQuality.rsiOversoldHighVol", "RSI HighVol Threshold", 15, 45],
             ["pullbackQuality.volumeConfirm", "Volume Confirm", 0, 10], ["pullbackQuality.volRatioThreshold", "Vol Ratio Threshold", 0.5, 3]
            ].map(([path, label, min, max]) =>
              React.createElement("div", { key: path, style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", minWidth: 150 } }, label),
                React.createElement("input", { className: "inp", type: "number", step: 0.5, min: min, max: max, value: scoreConfig.pullbackQuality[path.split(".")[1]], onChange: e => updateScoreConfig(path, e.target.value), style: { width: 75, fontSize: 11 } })
              )
            )
          )
        ),
        /* Pillar 3: 4% Probability */
        React.createElement("div", { style: { marginBottom: 16 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, "Pillar 3: 4% Probability"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 } },
            [["prob4.targetPct", "Target %", 0.01, 0.10], ["prob4.targetReachable_T1", "Reachable T1", 0, 20], ["prob4.targetATR_threshold1", "ATR Thresh 1", 0.5, 4],
             ["prob4.targetReachable_T2", "Reachable T2", 0, 20], ["prob4.targetATR_threshold2", "ATR Thresh 2", 0.5, 4],
             ["prob4.targetReachable_T3", "Reachable T3", 0, 20], ["prob4.targetATR_threshold3", "ATR Thresh 3", 0.5, 4],
             ["prob4.targetReachable_T4", "Reachable T4", 0, 20],
             ["prob4.targetDist_T1", "Dist T1", 0, 15], ["prob4.targetDist_range1_lo", "Range1 Lo (ATR)", 0, 2],
             ["prob4.targetDist_range1_hi", "Range1 Hi (ATR)", 1, 5], ["prob4.targetDist_T2", "Dist T2", 0, 10],
             ["prob4.targetDist_range2_lo", "Range2 Lo (ATR)", -1, 2], ["prob4.targetDist_range2_hi", "Range2 Hi (ATR)", 1, 6],
             ["prob4.volSweet_T1", "Vol Sweet T1", 0, 15], ["prob4.volPercentile_lo", "Pctl Lo", 10, 40],
             ["prob4.volPercentile_hi", "Pctl Hi", 50, 90], ["prob4.volSweet_T2", "Vol Sweet T2", 0, 10],
             ["prob4.volPercentile_lo2", "Pctl Lo2", 5, 30], ["prob4.volPercentile_hi2", "Pctl Hi2", 70, 95],
             ["prob4.efficiencyRatio", "Efficiency Ratio", 0, 10], ["prob4.efficiencyRatioThreshold", "ER Threshold", 0.1, 0.8]
            ].map(([path, label, min, max]) =>
              React.createElement("div", { key: path, style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", minWidth: 150 } }, label),
                React.createElement("input", { className: "inp", type: "number", step: 0.5, min: min, max: max, value: scoreConfig.prob4[path.split(".")[1]], onChange: e => updateScoreConfig(path, e.target.value), style: { width: 75, fontSize: 11 } })
              )
            )
          )
        ),
        /* Pillar 4: Swing Potential */
        React.createElement("div", { style: { marginBottom: 16 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, "Pillar 4: Swing Potential"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 } },
            [["swingPotential.reversalProbability", "Reversal Probability", 0, 20], ["swingPotential.turnConfirm", "Turn Confirm", 0, 10],
             ["swingPotential.higherLow", "Higher Low", 0, 5], ["swingPotential.reversalCandle", "Reversal Candle", 0, 5],
             ["swingPotential.rsiUpturn", "RSI Upturn", 0, 3]
            ].map(([path, label, min, max]) =>
              React.createElement("div", { key: path, style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", minWidth: 140 } }, label),
                React.createElement("input", { className: "inp", type: "number", step: 0.5, min: min, max: max, value: scoreConfig.swingPotential[path.split(".")[1]], onChange: e => updateScoreConfig(path, e.target.value), style: { width: 75, fontSize: 11 } })
              )
            )
          )
        ),
        /* Modifiers */
        React.createElement("div", { style: { marginBottom: 16 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, "Modifiers"),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 } },
            [["modifiers.lowBetaThreshold", "Low Beta Threshold", 0, 1], ["modifiers.lowATRPercentile", "Low ATR Pctl", 5, 50],
             ["modifiers.lowExpansionPenalty", "Low Expansion Penalty", -20, 0], ["modifiers.spikePenalty", "Spike Penalty", -20, 0],
             ["modifiers.spikeGapThreshold", "Spike Gap %", 1, 10], ["modifiers.stabilityThreshold", "Stability Threshold", 0.1, 0.8],
             ["modifiers.stabilityPenalty", "Stability Penalty", -25, 0], ["modifiers.mtfAlignBonus", "MTF Align Bonus", 0, 20],
             ["modifiers.mtfAlignThreshold", "MTF Align Threshold", 40, 80], ["modifiers.mtfAlignFloor", "MTF Align Floor", 30, 65], ["modifiers.highVolATRPercentile", "High Vol Pctl", 60, 95],
             ["modifiers.highVolERThreshold", "High Vol ER Thresh", 0.2, 0.9], ["modifiers.highVolBonus", "High Vol Bonus", 0, 15]
            ].map(([path, label, min, max]) =>
              React.createElement("div", { key: path, style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", minWidth: 155 } }, label),
                React.createElement("input", { className: "inp", type: "number", step: 0.5, min: min, max: max, value: scoreConfig.modifiers[path.split(".")[1]], onChange: e => updateScoreConfig(path, e.target.value), style: { width: 75, fontSize: 11 } })
              )
            )
          )
        ),
        /* Classification Thresholds */
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 } }, "Classification Thresholds"),
          React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", marginBottom: 8 } }, "Score boundaries for BUY / WATCHLIST / NEUTRAL signals. Must be in descending order."),
          React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } },
            [["classification.strongBuy", "STRONG_BUY ≥", 60, 100], ["classification.buy", "BUY ≥", 40, 90],
             ["classification.watchlist", "WATCHLIST ≥", 25, 80], ["classification.neutral", "NEUTRAL ≥", 10, 60]
            ].map(([path, label, min, max]) =>
              React.createElement("div", { key: path, style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "var(--text5)", minWidth: 110 } }, label),
                React.createElement("input", { className: "inp", type: "number", step: 5, min: min, max: max, value: scoreConfig.classification[path.split(".")[1]], onChange: e => updateScoreConfig(path, e.target.value), style: { width: 75, fontSize: 11 } })
              )
            )
          )
        )
      )
    ),

    !result && !running && React.createElement("div", { className: "stx-card", style: { textAlign: "center", padding: 40, color: "var(--text6)", fontSize: 13 } },
      "Run a sweep to find the optimal entry score threshold. Tests 9 thresholds (40-80) and 5 values per pillar across the selected universe. NIFTY 50: ~2 min, NIFTY 100: ~5 min, NIFTY 200: ~15 min."
    )
  );
};
var SCREENER_DECISION_MAP = {
  STRONG_BUY: { label: 'STRONG_BUY', color: '#22c55e' },
  BUY:         { label: 'BUY',         color: '#16a34a' },
  WATCHLIST:   { label: 'WATCHLIST',   color: '#eab308' },
  NEUTRAL:     { label: 'NEUTRAL',     color: '#a855f7' },
  AVOID:       { label: 'AVOID',       color: '#ef4444' },
};

/* Wraps the new computeMultiTFEntryScore + per-timeframe computeEntryScore
   into the old result shape { finalScore, decision, baseScore, penalties, bonuses, weekly, daily, hourly } */
function computeCompatEntryScore(weeklyCandles, dailyCandles, hourlyCandles, indexCandles, indexWeeklyCandles) {
  if (!window.TechIndicators) return null;
  var TI = window.TechIndicators;
  var tfResults = [];
  if (weeklyCandles && weeklyCandles.length >= 50) tfResults.push({ timeframe: 'W', candles: weeklyCandles });
  if (dailyCandles && dailyCandles.length >= 50) tfResults.push({ timeframe: 'D', candles: dailyCandles });
  if (hourlyCandles && hourlyCandles.length >= 50) tfResults.push({ timeframe: 'H', candles: hourlyCandles });
  if (!tfResults.length) return null;
  var multi = TI.computeMultiTFEntryScore(tfResults, indexCandles || null, indexWeeklyCandles || null);
  if (!multi || multi.multiTF_score == null) return null;
  function toDec(cls) {
    return SCREENER_DECISION_MAP[cls] || { label: cls, color: 'var(--text6)' };
  }
    var _sc = (TI.getScoreConfig && TI.getScoreConfig()) || {};
    var _pm = _sc.pillarMax || {};
    var _modCfg = _sc.modifiers || {};
    var _modMax = (_modCfg.mtfAlignBonus || 10) + (_modCfg.highVolBonus || 5);
    var out = {
    finalScore: multi.multiTF_score,
    decision: toDec(multi.classification),
    baseScore: multi.raw_score != null ? multi.raw_score : multi.multiTF_score,
    penalties: multi.penalties || 0,
    bonuses: multi.bonuses || 0,
    hardFilters: [],
    lastClose: null,
    todaySpike: !!multi.todaySpike,
    sessionReturnPct: multi.sessionReturnPct != null ? multi.sessionReturnPct : null,
    gapPct: multi.gapPct != null ? multi.gapPct : null,
    dominanceRatio: multi.dominanceRatio != null ? multi.dominanceRatio : null,
    efficiencyRatio10: multi.efficiencyRatio10 != null ? multi.efficiencyRatio10 : null,
    aggTrendHealth: multi.trendHealth != null ? multi.trendHealth : null,
    aggPullbackQuality: multi.pullbackQuality != null ? multi.pullbackQuality : null,
    aggProb4: multi.prob4 != null ? multi.prob4 : null,
    aggSwingPotential: multi.swingPotential != null ? multi.swingPotential : null,
    weekly: null, daily: null, hourly: null
  };
  if (multi.details) multi.details.forEach(function(d) {
    var scoreObj = {
      total: d.entryScore,
      decision: toDec(d.classification),
      trendHealthScore: d.trendHealth, trendHealthMax: _pm.trendHealth != null ? _pm.trendHealth : 35,
      pullbackScore: d.pullbackQuality, pullbackMax: _pm.pullbackQuality != null ? _pm.pullbackQuality : 30,
      prob4Score: d.prob4, prob4Max: _pm.prob4 != null ? _pm.prob4 : 35,
      swingPotentialScore: d.swingPotential, swingPotentialMax: _pm.swingPotential != null ? _pm.swingPotential : 20,
      modifiersScore: d.modifiers != null ? d.modifiers : 0, modifiersMax: _modMax,
      penalties: d.penalties, bonuses: d.bonuses, raw_score: d.raw_score,
      spike: d.spike != null ? d.spike : null, stability: d.stability != null ? d.stability : null
    };
    if (d.timeframe === 'W' || d.timeframe === 'weekly' || d.timeframe === '1W') out.weekly = scoreObj;
    else if (d.timeframe === 'D' || d.timeframe === 'daily' || d.timeframe === '1D') out.daily = scoreObj;
    else if (d.timeframe === 'H' || d.timeframe === 'hourly' || d.timeframe === '1h') out.hourly = scoreObj;
  });
  if (multi.penalty_items && multi.penalty_items.length) {
    multi.penalty_items.forEach(function(it) {
      out.hardFilters.push(it.reason + " (" + it.amount + ")");
    });
  }
  if (multi.bonus_items && multi.bonus_items.length) {
    multi.bonus_items.forEach(function(it) {
      out.hardFilters.push(it.reason + " (+" + it.amount + ")");
    });
  }
  return out;
}

function buildEntryScoreContext(result) {
  if (!result) return null;
  return { entryScore: result.finalScore, trendHealth: result.aggTrendHealth, pullbackQuality: result.aggPullbackQuality, prob4: result.aggProb4, swingPotential: result.aggSwingPotential };
}

function StockScreener(props) {
  props = props || {};
  var onOpenStock = props.onOpenStock;
  var TI = window.TechIndicators;
  var DF = window.OHLCVFetcher;
  var _s = useState([]);
  var results = _s[0], setResults = _s[1];
  var _s2 = useState(false);
  var scanning = _s2[0], setScanning = _s2[1];
  var _s3 = useState({ done: 0, total: 0, current: "" });
  var progress = _s3[0], setProgress = _s3[1];
  var _s4 = useState("finalScore");
  var sortKey = _s4[0], setSortKey = _s4[1];
  var _s5 = useState("desc");
  var sortDir = _s5[0], setSortDir = _s5[1];
  var _s6 = useState("");
  var scanErr = _s6[0], setScanErr = _s6[1];
  var _s7 = useState("all");
  var filter = _s7[0], setFilter = _s7[1];
  var _s8 = useState({});
  var timestamps = _s8[0], setTimestamps = _s8[1];
  var _s9 = useState(0);
  var scanTime = _s9[0], setScanTime = _s9[1];
  var _s10 = useState({});
  var refreshingMap = _s10[0], setRefreshingMap = _s10[1];
  var _s11 = useState([]);
  var snapshots = _s11[0], setSnapshots = _s11[1];
  var _s13 = useState({});
  var selected = _s13[0], setSelected = _s13[1];
  var _s14 = useState("");
  var manualTicker = _s14[0], setManualTicker = _s14[1];
  var _s15 = useState(false);
  var manualLoading = _s15[0], setManualLoading = _s15[1];
  var _s16 = useState(false);
  var bgRefreshing = _s16[0], setBgRefreshing = _s16[1];
  var _s17 = useState({ done: 0, total: 0, current: "" });
  var bgProgress = _s17[0], setBgProgress = _s17[1];
  var _s18 = useState({});
  var bookmarks = _s18[0], setBookmarks = _s18[1];
  var _bookmarksLoadedRef = useRef(false);
  var _s18b = useState({});
  var unicorns = _s18b[0], setUnicorns = _s18b[1];
  var _unicornsLoadedRef = useRef(false);
  var _resultsRef = useRef(results);
  _resultsRef.current = results;

  /* Load cached data from IndexedDB on mount */
  React.useEffect(function() {
    (async function() {
      try {
        var cached = await dbGetSetting("stox_screener_data");
        if (cached && Array.isArray(cached.results)) {
          setResults(cached.results);
          setTimestamps(cached.timestamps || {});
          setScanTime(cached.scanTime || 0);
        }
      } catch(e) {}
      try {
        var snaps = await dbGetSetting("stox_screener_snapshots");
        if (Array.isArray(snaps)) setSnapshots(snaps);
      } catch(e) {}
      try {
        var bkm = await dbGetSetting("stox_screener_bookmarks");
        if (bkm && typeof bkm === "object") setBookmarks(function(prev) { return Object.assign({}, bkm, prev); });
      } catch(e) {}
      try {
        var uni = await dbGetSetting("stox_screener_unicorns");
        if (uni && typeof uni === "object") setUnicorns(function(prev) { return Object.assign({}, uni, prev); });
      } catch(e) {}
      _bookmarksLoadedRef.current = true;
      _unicornsLoadedRef.current = true;
    })();
  }, []);

  /* Persist to IndexedDB whenever data changes */
  React.useEffect(function() {
    if (results.length > 0 || scanTime > 0) {
      dbSetSetting("stox_screener_data", { results: results, timestamps: timestamps, scanTime: scanTime });
    }
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  }, [results, timestamps, scanTime]);

  React.useEffect(function() {
    if (!_bookmarksLoadedRef.current) return;
    dbSetSetting("stox_screener_bookmarks", bookmarks).then(function() {
      window.dispatchEvent(new CustomEvent("stox:data-changed"));
    });
  }, [bookmarks]);

  React.useEffect(function() {
    if (!_unicornsLoadedRef.current) return;
    dbSetSetting("stox_screener_unicorns", unicorns).then(function() {
      window.dispatchEvent(new CustomEvent("stox:data-changed"));
    });
  }, [unicorns]);

  /* Sync background refresh state on mount and listen for progress */
  React.useEffect(function() {
    if (window.__stoxScreenerBg && window.__stoxScreenerBg.active) {
      setBgRefreshing(true);
      setBgProgress({ done: window.__stoxScreenerBg.done, total: window.__stoxScreenerBg.total, current: window.__stoxScreenerBg.current || "" });
    }
    var handler = function(e) {
      var d = e.detail;
      setBgProgress({ done: d.done, total: d.total, current: d.current });
      if (d.results) setResults(d.results);
      if (d.timestamps) setTimestamps(d.timestamps);
      if (!d.active) setBgRefreshing(false);
    };
    window.addEventListener("stox:screener-bg-progress", handler);
    return function() { window.removeEventListener("stox:screener-bg-progress", handler); };
  }, []);

  /* Inject spin keyframes */
  React.useEffect(function() {
    var id = "screener-spin-keyframes";
    if (!document.getElementById(id)) {
      var s = document.createElement("style"); s.id = id;
      s.textContent = "@keyframes screener-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
      document.head.appendChild(s);
    }
    return function() { var el = document.getElementById(id); if (el) el.remove(); };
  }, []);

  var saveSnapshot = function() {
    if (!results.length) return;
    var snap = { id: Date.now(), scanTime: scanTime, results: JSON.parse(JSON.stringify(results)), timestamps: JSON.parse(JSON.stringify(timestamps)) };
    var updated = [snap].concat(snapshots);
    setSnapshots(updated);
    dbSetSetting("stox_screener_snapshots", updated);
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  };

  var deleteSnapshot = function(id) {
    var updated = snapshots.filter(function(s) { return s.id !== id; });
    setSnapshots(updated);
    dbSetSetting("stox_screener_snapshots", updated);
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  };

  var deleteSnapshotsBatch = function(ids) {
    var idSet = new Set(ids);
    var updated = snapshots.filter(function(s) { return !idSet.has(s.id); });
    setSnapshots(updated);
    dbSetSetting("stox_screener_snapshots", updated);
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  };

  var purgeData = function() {
    dbDeleteSetting("stox_screener_data");
    setResults([]);
    setTimestamps({});
    setScanTime(0);
  };

  var exportJSON = function() {
    if (!results.length) return;
    var payload = {
      appVersion: window.__STOX_APP_VERSION || "2.4.25",
      exportDate: new Date().toISOString(),
      scanTime: scanTime,
      results: results,
      timestamps: timestamps
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "stox-screener-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  var exportExcel = function() {
    if (!results.length) return;
    var cols = [
      function(r) { return r.s ? r.s.t.replace(/\.NS$/, "") : ""; },
      function(r) { return r.s ? r.s.n : ""; },
      function(r) { return r.s ? r.s.cap : ""; },
      function(r) { return r.lc; },
      function(r) { return r.todayChg; },
      function(r) { return r.dayChg; },
      function(r) { return r.weekChg; },
      function(r) { return r.monthChg; },
      function(r) { return r.yearChg; },
      function(r) { return r.result ? r.result.aggTrendHealth : null; },
      function(r) { return r.result ? r.result.aggPullbackQuality : null; },
      function(r) { return r.result ? r.result.aggProb4 : null; },
      function(r) { return r.result ? r.result.aggSwingPotential : null; },
      function(r) { return r.result ? r.result.finalScore : null; },
      function(r) { return r.result ? r.result.weekly : null; },
      function(r) { return r.result ? r.result.daily : null; },
      function(r) { return r.result ? r.result.hourly : null; },
      function(r) { return r.conf10dLog; },
      function(r) { return r.conf10dEmp; }
    ];
    var headers = ["Ticker","Company","Cap","Price","Today %","1D Chg %","1W Chg %","1M Chg %","Yearly %","Trend","Pullback","Prob4","Swing","Score","Weekly","Daily","Hourly","Conf 10DLN","Conf 10DEM"];
    function csvEsc(v) { if (v == null) return ""; var s = String(v); if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) return '"' + s.replace(/"/g, '""') + '"'; return s; }
    var rows = [headers.join(",")];
    results.forEach(function(r) {
      var row = cols.map(function(fn) { return csvEsc(fn(r)); });
      rows.push(row.join(","));
    });
    var csv = "\uFEFF" + rows.join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "stox-screener-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  var importJSON = function() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async function(e) {
      var file = e.target.files[0];
      if (!file) return;
      try {
        var text = await file.text();
        var data = JSON.parse(text);
        if (!data.results || !Array.isArray(data.results)) {
          setScanErr("Invalid file: missing results array");
          return;
        }
        setResults(data.results);
        setTimestamps(data.timestamps || {});
        setScanTime(data.scanTime || 0);
        setScanErr("");
      } catch (err) {
        setScanErr("Failed to import: " + err.message);
      }
    };
    input.click();
  };

  var refreshStock = async function(s, indexDaily, indexWeekly) {
    if (!TI || !DF) return;
    setRefreshingMap(function(p) { var c = Object.assign({}, p); c[s.t] = true; return c; });
    try {
      var tk = s.t.replace(".NS", "");
      if (!indexDaily) { try { var _idxR = await DF.fetchOHLCVCached("^NSEI", "daily"); indexDaily = (_idxR && _idxR.data) || null; } catch(e) {} }
      if (!indexWeekly) { try { var _idxR2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); indexWeekly = (_idxR2 && _idxR2.data) || null; } catch(e) {} }
      var [resW, resD, resH] = await Promise.all([
        DF.fetchOHLCVCached(tk, "weekly"),
        DF.fetchOHLCVCached(tk, "daily"),
        DF.fetchOHLCVCached(tk, "1h")
      ]);
      if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) {
        setRefreshingMap(function(p) { var c = Object.assign({}, p); c[s.t] = false; return c; }); return;
      }
      var livePriceRes = await fetchTickerPrice(tk);
      var dc = resD.data;
      var _dc_d = dc[dc.length - 1].t, _dc_n = new Date(Date.now() + 19800000).toISOString().split("T")[0], _dc_skip = _dc_d && _dc_d.length >= 10 && _dc_d.substring(0, 10) === _dc_n && dc.length >= 2 ? 1 : 0;
      var _yi = dc.length - 1 - _dc_skip;
      var lastDailyClose = dc[_yi].c;
      var quotePrice = livePriceRes && livePriceRes.price != null ? livePriceRes.price : null;
      var lc = quotePrice != null ? quotePrice : lastDailyClose;
      var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, indexDaily, indexWeekly);
      var conf10d = null, conf10dLog = null, conf10dEmp = null;
      try { var _c10 = TI.computeTenDayForwardConfidence(resH.data, resD.data, indexDaily, buildEntryScoreContext(result)); if (_c10) { conf10dLog = _c10.confidenceLognormal; conf10dEmp = _c10.confidenceEmpirical; conf10d = _c10.confidence; } } catch(e) {}
      var yesterdayClose = quotePrice != null && livePriceRes.previousClose != null && livePriceRes.previousClose > 0 ? livePriceRes.previousClose : lastDailyClose;
      var dbyClose = _yi - 1 >= 0 ? dc[_yi - 1].c : null;
      var c5d = _yi - 5 >= 0 ? dc[_yi - 5].c : null;
      var c21d = _yi - 21 >= 0 ? dc[_yi - 21].c : null;
      var c252d = _yi - 252 >= 0 ? dc[_yi - 252].c : null;
      var todayChg = quotePrice != null && lc > 0 && yesterdayClose > 0 ? Math.round((lc - yesterdayClose) / yesterdayClose * 10000) / 100 : null;
      var dayChg = quotePrice != null && lc > 0 && dbyClose > 0 ? Math.round((lc - dbyClose) / dbyClose * 10000) / 100 : null;
      var weekChg = lc > 0 && c5d > 0 ? Math.round((lc - c5d) / c5d * 10000) / 100 : null;
      var monthChg = lc > 0 && c21d > 0 ? Math.round((lc - c21d) / c21d * 10000) / 100 : null;
      var yearChg = lc > 0 && c252d > 0 ? Math.round((lc - c252d) / c252d * 10000) / 100 : null;
      setResults(function(p) {
        var idx = p.findIndex(function(r) { return r.s.t === s.t; });
        if (idx >= 0) { var copy = p.slice(); copy[idx] = { s: s, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, yearChg: yearChg, todayChg: todayChg, conf10d: conf10d, conf10dLog: conf10dLog, conf10dEmp: conf10dEmp }; return copy; }
        return p.concat([{ s: s, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, yearChg: yearChg, todayChg: todayChg, conf10d: conf10d, conf10dLog: conf10dLog, conf10dEmp: conf10dEmp }]);
      });
      setTimestamps(function(p) { var c = Object.assign({}, p); c[s.t] = Date.now(); return c; });
    } catch(e) {}
    setRefreshingMap(function(p) { var c = Object.assign({}, p); c[s.t] = false; return c; });
  };

  var addManualStock = async function() {
    if (!TI || !DF || !manualTicker.trim()) return;
    var tk = manualTicker.trim().toUpperCase().replace(/\.NS$|\.BO$/, "");
    if (!tk) return;
    var existing = results.find(function(r) { return r.s.t === tk + ".NS"; });
    if (existing) { setScanErr(tk + " already in results"); setManualTicker(""); return; }
    setManualLoading(true); setScanErr("");
    var found = NIFTY_200_UNIQUE.find(function(s) { return s.t === tk + ".NS"; });
    var stockObj = found ? found : { t: tk + ".NS", n: tk };
    try {
      var indexDaily = null, indexWeekly = null;
      try { var _idxR = await DF.fetchOHLCVCached("^NSEI", "daily"); indexDaily = (_idxR && _idxR.data) || null; } catch(e) {}
      try { var _idxR2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); indexWeekly = (_idxR2 && _idxR2.data) || null; } catch(e) {}
      var [resW, resD, resH] = await Promise.all([
        DF.fetchOHLCVCached(tk, "weekly"),
        DF.fetchOHLCVCached(tk, "daily"),
        DF.fetchOHLCVCached(tk, "1h")
      ]);
      if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) {
        setScanErr("Insufficient data for " + tk); setManualLoading(false); setManualTicker(""); return;
      }
      var livePriceRes = await fetchTickerPrice(tk);
      var dc = resD.data;
      var _dc_d = dc[dc.length - 1].t, _dc_n = new Date(Date.now() + 19800000).toISOString().split("T")[0], _dc_skip = _dc_d && _dc_d.length >= 10 && _dc_d.substring(0, 10) === _dc_n && dc.length >= 2 ? 1 : 0;
      var _yi = dc.length - 1 - _dc_skip;
      var lastDailyClose = dc[_yi].c;
      var quotePrice = livePriceRes && livePriceRes.price != null ? livePriceRes.price : null;
      var lc = quotePrice != null ? quotePrice : lastDailyClose;
      var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, indexDaily, indexWeekly);
      var conf10d = null, conf10dLog = null, conf10dEmp = null;
      try { var _c10 = TI.computeTenDayForwardConfidence(resH.data, resD.data, indexDaily, buildEntryScoreContext(result)); if (_c10) { conf10dLog = _c10.confidenceLognormal; conf10dEmp = _c10.confidenceEmpirical; conf10d = _c10.confidence; } } catch(e) {}
      var yesterdayClose = quotePrice != null && livePriceRes.previousClose != null && livePriceRes.previousClose > 0 ? livePriceRes.previousClose : lastDailyClose;
      var dbyClose = _yi - 1 >= 0 ? dc[_yi - 1].c : null;
      var c5d = _yi - 5 >= 0 ? dc[_yi - 5].c : null;
      var c21d = _yi - 21 >= 0 ? dc[_yi - 21].c : null;
      var c252d = _yi - 252 >= 0 ? dc[_yi - 252].c : null;
      var todayChg = quotePrice != null && lc > 0 && yesterdayClose > 0 ? Math.round((lc - yesterdayClose) / yesterdayClose * 10000) / 100 : null;
      var dayChg = quotePrice != null && lc > 0 && dbyClose > 0 ? Math.round((lc - dbyClose) / dbyClose * 10000) / 100 : null;
      var weekChg = lc > 0 && c5d > 0 ? Math.round((lc - c5d) / c5d * 10000) / 100 : null;
      var monthChg = lc > 0 && c21d > 0 ? Math.round((lc - c21d) / c21d * 10000) / 100 : null;
      var yearChg = lc > 0 && c252d > 0 ? Math.round((lc - c252d) / c252d * 10000) / 100 : null;
      setResults(function(p) { return p.concat([{ s: stockObj, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, yearChg: yearChg, todayChg: todayChg, conf10d: conf10d, conf10dLog: conf10dLog, conf10dEmp: conf10dEmp }]); });
      setTimestamps(function(p) { var c = Object.assign({}, p); c[stockObj.t] = Date.now(); return c; });
    } catch(e) { setScanErr("Failed to fetch " + tk); }
    setManualLoading(false); setManualTicker("");
  };

  var refreshSelected = async function() {
    if (!TI || !DF) return;
    var tickers = Object.keys(selected).filter(function(t) { return selected[t]; });
    if (!tickers.length) return;
    var batch = results.filter(function(r) { return tickers.indexOf(r.s.t) >= 0; });
    var oldScores = {};
    batch.forEach(function(r) { oldScores[r.s.t] = r.result ? r.result.finalScore : null; });
    var indexDaily = null, indexWeekly = null;
    try { var _idxR = await DF.fetchOHLCVCached("^NSEI", "daily"); indexDaily = (_idxR && _idxR.data) || null; } catch(e) {}
    try { var _idxR2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); indexWeekly = (_idxR2 && _idxR2.data) || null; } catch(e) {}
    for (var i = 0; i < batch.length; i++) {
      await refreshStock(batch[i].s, indexDaily, indexWeekly);
    }
    var updatedResults = _resultsRef.current;
    var changes = [];
    var noChanges = [];
    batch.forEach(function(r) {
      var tk = r.s.t;
      var oldScore = oldScores[tk];
      var fresh = updatedResults.find(function(u) { return u.s.t === tk; });
      var newScore = fresh && fresh.result ? fresh.result.finalScore : null;
      var label = tk.replace(".NS", "");
      if (oldScore !== null && newScore !== null && oldScore !== newScore) {
        var diff = Math.round((newScore - oldScore) * 10) / 10;
        var sign = diff > 0 ? "+" : "";
        var color = diff > 0 ? "\u2191" : "\u2193";
        changes.push(label + " " + sign + diff + " (" + oldScore + " \u2192 " + newScore + ")");
      } else {
        noChanges.push(label);
      }
    });
    if (changes.length > 0) {
      var msg = changes.length + " score" + (changes.length !== 1 ? "s" : "") + " changed: " + changes.join(", ");
      if (noChanges.length > 0) msg += " \u00b7 " + noChanges.length + " unchanged";
      showToast(msg, 0);
    } else {
      showToast(batch.length + " stock" + (batch.length !== 1 ? "s" : "") + " refreshed \u2014 no score changes", 0);
    }
    setSelected({});
  };

  var refreshSelectedBackground = async function() {
    if (!TI || !DF || bgRefreshing) return;
    var tickers = Object.keys(selected).filter(function(t) { return selected[t]; });
    if (!tickers.length) return;
    var batch = results.filter(function(r) { return tickers.indexOf(r.s.t) >= 0; });
    if (!batch.length) return;
    var bg = window.__stoxScreenerBg = window.__stoxScreenerBg || {};
    bg.active = true;
    bg.results = JSON.parse(JSON.stringify(results));
    bg.timestamps = Object.assign({}, timestamps);
    bg.done = 0;
    bg.total = batch.length;
    bg.current = "";
    setBgRefreshing(true);
    setBgProgress({ done: 0, total: batch.length, current: "" });
    setSelected({});
    var indexDaily = null, indexWeekly = null;
    try { var _idxR = await DF.fetchOHLCVCached("^NSEI", "daily"); indexDaily = (_idxR && _idxR.data) || null; } catch(e) {}
    try { var _idxR2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); indexWeekly = (_idxR2 && _idxR2.data) || null; } catch(e) {}
    for (var i = 0; i < batch.length; i++) {
      if (!bg.active) break;
      var stk = batch[i].s;
      var tk = stk.t.replace(".NS", "");
      bg.current = tk;
      window.dispatchEvent(new CustomEvent("stox:screener-bg-progress", { detail: { done: i, total: batch.length, current: tk, active: true } }));
      try {
        var [resW, resD, resH] = await Promise.all([
          DF.fetchOHLCVCached(tk, "weekly"),
          DF.fetchOHLCVCached(tk, "daily"),
          DF.fetchOHLCVCached(tk, "1h")
        ]);
        if (resW.data && resW.data.length >= 12 && resD.data && resD.data.length >= 12) {
          var livePriceRes = await fetchTickerPrice(tk);
          var dc = resD.data;
          var _dc_d = dc[dc.length - 1].t, _dc_n = new Date(Date.now() + 19800000).toISOString().split("T")[0], _dc_skip = _dc_d && _dc_d.length >= 10 && _dc_d.substring(0, 10) === _dc_n && dc.length >= 2 ? 1 : 0;
          var _yi = dc.length - 1 - _dc_skip;
          var lastDailyClose = dc[_yi].c;
          var quotePrice = livePriceRes && livePriceRes.price != null ? livePriceRes.price : null;
          var lc = quotePrice != null ? quotePrice : lastDailyClose;
          var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, indexDaily, indexWeekly);
           var conf10d = null, conf10dLog = null, conf10dEmp = null;
           try { var _c10 = TI.computeTenDayForwardConfidence(resH.data, resD.data, indexDaily, buildEntryScoreContext(result)); if (_c10) { conf10dLog = _c10.confidenceLognormal; conf10dEmp = _c10.confidenceEmpirical; conf10d = _c10.confidence; } } catch(e) {}
           var yesterdayClose = quotePrice != null && livePriceRes.previousClose != null && livePriceRes.previousClose > 0 ? livePriceRes.previousClose : lastDailyClose;
           var dbyClose = _yi - 1 >= 0 ? dc[_yi - 1].c : null;
           var c5d = _yi - 5 >= 0 ? dc[_yi - 5].c : null;
           var c21d = _yi - 21 >= 0 ? dc[_yi - 21].c : null;
           var c252d = _yi - 252 >= 0 ? dc[_yi - 252].c : null;
           var todayChg = quotePrice != null && lc > 0 && yesterdayClose > 0 ? Math.round((lc - yesterdayClose) / yesterdayClose * 10000) / 100 : null;
           var dayChg = quotePrice != null && lc > 0 && dbyClose > 0 ? Math.round((lc - dbyClose) / dbyClose * 10000) / 100 : null;
           var weekChg = lc > 0 && c5d > 0 ? Math.round((lc - c5d) / c5d * 10000) / 100 : null;
           var monthChg = lc > 0 && c21d > 0 ? Math.round((lc - c21d) / c21d * 10000) / 100 : null;
           var yearChg = lc > 0 && c252d > 0 ? Math.round((lc - c252d) / c252d * 10000) / 100 : null;
           var idx = bg.results.findIndex(function(r) { return r.s.t === stk.t; });
           if (idx >= 0) bg.results[idx] = { s: stk, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, yearChg: yearChg, todayChg: todayChg, conf10d: conf10d, conf10dLog: conf10dLog, conf10dEmp: conf10dEmp };
          bg.timestamps[stk.t] = Date.now();
        }
      } catch(e) {}
      bg.done = i + 1;
      try { await dbSetSetting("stox_screener_data", { results: bg.results, timestamps: bg.timestamps, scanTime: scanTime }); } catch(e) {}
      try { if (window.__fsa && window.__fsa.writeNow) await window.__fsa.writeNow(); } catch(e) {}
      window.dispatchEvent(new CustomEvent("stox:screener-bg-progress", { detail: { done: i + 1, total: batch.length, current: tk, results: bg.results, timestamps: bg.timestamps, active: i + 1 < batch.length } }));
    }
    bg.active = false;
    bg.current = "";
    setBgRefreshing(false);
    try { await dbSetSetting("stox_screener_data", { results: bg.results, timestamps: bg.timestamps, scanTime: scanTime }); } catch(e) {}
    try { if (window.__fsa && window.__fsa.writeNow) await window.__fsa.writeNow(); } catch(e) {}
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
    showToast("Background refresh complete: " + batch.length + " stock" + (batch.length !== 1 ? "s" : "") + " updated", 3000);
  };

  var toggleSelect = function(ticker) {
    setSelected(function(p) { var c = Object.assign({}, p); c[ticker] = !c[ticker]; return c; });
  };

  var toggleSelectAll = function() {
    var filteredTickers = filtered.map(function(r) { return r.s.t; });
    var allSelected = filteredTickers.length > 0 && filteredTickers.every(function(t) { return selected[t]; });
    setSelected(function(p) {
      var c = Object.assign({}, p);
      filteredTickers.forEach(function(t) { c[t] = !allSelected; });
      return c;
    });
  };

  var toggleBookmark = function(ticker) {
    setBookmarks(function(p) {
      var c = Object.assign({}, p);
      if (c[ticker]) { delete c[ticker]; } else { c[ticker] = true; }
      return c;
    });
  };

  var toggleUnicorn = function(ticker) {
    setUnicorns(function(p) {
      var c = Object.assign({}, p);
      if (c[ticker]) { delete c[ticker]; } else { c[ticker] = true; }
      return c;
    });
  };

  var selectedCount = Object.keys(selected).filter(function(t) { return selected[t]; }).length;

  var batchAddToES = async function() {
    var tickers = Object.keys(selected).filter(function(t) { return selected[t]; }).map(function(t) { return t.replace(/\.NS$/, ""); });
    if (!tickers.length) return;
    var existing = await dbGetSetting("mm_entry_scores");
    var entries = (Array.isArray(existing) ? existing : []);
    var existingSet = new Set(entries.map(function(e) { return e.ticker; }));
    var toAdd = tickers.filter(function(t) { return !existingSet.has(t); });
    if (!toAdd.length) { showToast("All selected stocks already in Entry Score", 2500); return; }
    var _idxD = null, _idxW = null;
    try { var _r1 = await DF.fetchOHLCVCached("^NSEI", "daily"); _idxD = (_r1 && _r1.data) || null; } catch(e) {}
    try { var _r2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); _idxW = (_r2 && _r2.data) || null; } catch(e) {}
    var added = 0;
    for (var i = 0; i < toAdd.length; i++) {
      var tk = toAdd[i];
      try {
        var [resW, resD, resH] = await Promise.all([
          DF.fetchOHLCVCached(tk, "weekly"), DF.fetchOHLCVCached(tk, "daily"), DF.fetchOHLCVCached(tk, "1h")
        ]);
        if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) continue;
        var lc = resD.data[resD.data.length - 1].c;
        var indW = TI.computeAll(resW.data);
        var indD = TI.computeAll(resD.data);
        var indH = resH.data && resH.data.length >= 12 ? TI.computeAll(resH.data) : null;
        var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, _idxD, _idxW);
        if (result) result.lastClose = lc;
        var conf10d = null, conf10dLog = null, conf10dEmp = null;
        try { var _conf = TI.computeTenDayForwardConfidence(resH.data, resD.data, _idxD, buildEntryScoreContext(result)); if (_conf) { conf10dLog = _conf.confidenceLognormal; conf10dEmp = _conf.confidenceEmpirical; conf10d = _conf.confidence != null ? Math.round(_conf.confidence * 10) / 10 : null; } } catch(e) {}
        entries.unshift({ id: Date.now() + i, ticker: tk, currentPrice: lc || 0, addedAt: new Date().toISOString(), result: result, frozenResult: JSON.parse(JSON.stringify(result || {})), conf10d: conf10d, conf10dLog: conf10dLog, conf10dEmp: conf10dEmp, indicators: { weekly: indW, daily: indD, hourly: indH } });
        added++;
      } catch(e) {}
    }
    if (added > 0) {
      await dbSetSetting("mm_entry_scores", entries);
      window.dispatchEvent(new CustomEvent("stox:data-changed"));
    }
    showToast(added + " of " + toAdd.length + " added to Entry Score", 2500);
    setSelected({});
  };

  var batchAddToCS = async function() {
    var tickers = Object.keys(selected).filter(function(t) { return selected[t]; }).map(function(t) { return t.replace(/\.NS$/, ""); });
    if (!tickers.length) return;
    var existing = await dbGetSetting(LS_CONF_TRACKER);
    var entries = (Array.isArray(existing) ? existing : []);
    var existingSet = new Set(entries.map(function(e) { return e.ticker; }));
    var toAdd = tickers.filter(function(t) { return !existingSet.has(t); });
    if (!toAdd.length) { showToast("All selected stocks already in Confidence Tracker", 2500); return; }
    var _idxD = null;
    try { var _r1 = await DF.fetchOHLCVCached("^NSEI", "daily"); _idxD = (_r1 && _r1.data) || null; } catch(e) {}
    var added = 0;
    for (var i = 0; i < toAdd.length; i++) {
      var tk = toAdd[i];
      try {
        var [resW, resD, resH] = await Promise.all([
          DF.fetchOHLCVCached(tk, "weekly"), DF.fetchOHLCVCached(tk, "daily"), DF.fetchOHLCVCached(tk, "1h")
        ]);
        if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) continue;
        var lc = resD.data[resD.data.length - 1].c;
        var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, _idxD, null);
        var confidence = null, conf10dLog = null, conf10dEmp = null;
        try { var conf = TI.computeTenDayForwardConfidence(resH.data, resD.data, _idxD, buildEntryScoreContext(result)); if (conf && conf.confidence != null) { confidence = conf.confidence; conf10dLog = conf.confidenceLognormal; conf10dEmp = conf.confidenceEmpirical; } } catch(e) {}
        entries.unshift({ id: Date.now() + i, ticker: tk, addedAt: new Date().toISOString(), confidence: confidence != null ? Math.round(confidence * 10) / 10 : null, conf10dLog: conf10dLog != null ? Math.round(conf10dLog * 10) / 10 : null, conf10dEmp: conf10dEmp != null ? Math.round(conf10dEmp * 10) / 10 : null, entryScore: result && result.finalScore != null ? result.finalScore : null, entryDecision: result && result.decision ? result.decision.label : null, currentPrice: lc || 0 });
        added++;
      } catch(e) {}
    }
    if (added > 0) {
      await dbSetSetting(LS_CONF_TRACKER, entries);
      window.dispatchEvent(new CustomEvent("stox:data-changed"));
    }
    showToast(added + " of " + toAdd.length + " added to Confidence Tracker", 2500);
    setSelected({});
  };

  var startScan = async function() {
    if (scanning || !TI || !DF) return;
    setScanning(true); setResults([]); setScanErr("");
    var stocks = NIFTY_200_UNIQUE;
    var total = stocks.length;
    setProgress({ done: 0, total: total, current: "Starting..." });
    var out = [];
    var BATCH = 3;
    var indexDaily = null, indexWeekly = null;
    try { var _idxR = await DF.fetchOHLCVCached("^NSEI", "daily"); indexDaily = (_idxR && _idxR.data) || null; } catch(e) {}
    try { var _idxR2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); indexWeekly = (_idxR2 && _idxR2.data) || null; } catch(e) {}
    for (var i = 0; i < stocks.length; i += BATCH) {
      var batch = stocks.slice(i, i + BATCH);
      var promises = batch.map(async function(s) {
        try {
          var tk = s.t.replace(".NS", "");
          var [resW, resD, resH] = await Promise.all([
            DF.fetchOHLCVCached(tk, "weekly"),
            DF.fetchOHLCVCached(tk, "daily"),
            DF.fetchOHLCVCached(tk, "1h")
          ]);
          if (!resW.data || resW.data.length < 12 || !resD.data || resD.data.length < 12) return null;
          var livePriceRes = await fetchTickerPrice(tk);
          var dc = resD.data;
          var _dc_d = dc[dc.length - 1].t, _dc_n = new Date(Date.now() + 19800000).toISOString().split("T")[0], _dc_skip = _dc_d && _dc_d.length >= 10 && _dc_d.substring(0, 10) === _dc_n && dc.length >= 2 ? 1 : 0;
          var _yi = dc.length - 1 - _dc_skip;
          var lastDailyClose = dc[_yi].c;
          var quotePrice = livePriceRes && livePriceRes.price != null ? livePriceRes.price : null;
          var lc = quotePrice != null ? quotePrice : lastDailyClose;
          var result = computeCompatEntryScore(resW.data, resD.data, resH.data && resH.data.length >= 100 ? resH.data : null, indexDaily, indexWeekly);
          var conf10d = null, conf10dLog = null, conf10dEmp = null;
          try { var _c10 = TI.computeTenDayForwardConfidence(resH.data, resD.data, indexDaily, buildEntryScoreContext(result)); if (_c10) { conf10dLog = _c10.confidenceLognormal; conf10dEmp = _c10.confidenceEmpirical; conf10d = _c10.confidence; } } catch(e) {}
          var yesterdayClose = quotePrice != null && livePriceRes.previousClose != null && livePriceRes.previousClose > 0 ? livePriceRes.previousClose : lastDailyClose;
          var dbyClose = _yi - 1 >= 0 ? dc[_yi - 1].c : null;
          var c5d = _yi - 5 >= 0 ? dc[_yi - 5].c : null;
          var c21d = _yi - 21 >= 0 ? dc[_yi - 21].c : null;
          var c252d = _yi - 252 >= 0 ? dc[_yi - 252].c : null;
          var todayChg = quotePrice != null && lc > 0 && yesterdayClose > 0 ? Math.round((lc - yesterdayClose) / yesterdayClose * 10000) / 100 : null;
          var dayChg = quotePrice != null && lc > 0 && dbyClose > 0 ? Math.round((lc - dbyClose) / dbyClose * 10000) / 100 : null;
          var weekChg = lc > 0 && c5d > 0 ? Math.round((lc - c5d) / c5d * 10000) / 100 : null;
          var monthChg = lc > 0 && c21d > 0 ? Math.round((lc - c21d) / c21d * 10000) / 100 : null;
          var yearChg = lc > 0 && c252d > 0 ? Math.round((lc - c252d) / c252d * 10000) / 100 : null;
          return { s: s, result: result, lc: lc, dayChg: dayChg, weekChg: weekChg, monthChg: monthChg, yearChg: yearChg, todayChg: todayChg, conf10d: conf10d, conf10dLog: conf10dLog, conf10dEmp: conf10dEmp };
        } catch(e) { return null; }
      });
      var batchResults = await Promise.all(promises);
      batchResults.forEach(function(r) { if (r) out.push(r); });
      setProgress({ done: Math.min(i + BATCH, total), total: total, current: batch.map(function(s) { return s.t.replace(".NS", ""); }).join(", ") });
      if (i + BATCH < stocks.length) await new Promise(function(r) { setTimeout(r, 300); });
    }
    out = out.filter(function(r) { return r && r.result; });
    out.sort(function(a, b) { return (b.result.finalScore || 0) - (a.result.finalScore || 0); });
    setResults(out);
    var now = Date.now();
    var ts = {};
    out.forEach(function(r) { ts[r.s.t] = now; });
    setTimestamps(ts);
    setScanTime(now);
    setScanning(false);
    setProgress({ done: total, total: 0, current: "" });
  };

  var toggleSort = function(key) {
    if (sortKey === key) setSortDir(function(d) { return d === "desc" ? "asc" : "desc"; });
    else { setSortKey(key); setSortDir("desc"); }
  };

  var sorted = results.slice().sort(function(a, b) {
    var av, bv;
    if (sortKey === "ticker") { av = a.s.t; bv = b.s.t; return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av); }
    if (sortKey === "name") { av = a.s.n; bv = b.s.n; return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av); }
    if (sortKey === "cap") { av = a.s.cap === "L" ? 0 : a.s.cap === "M" ? 1 : 2; bv = b.s.cap === "L" ? 0 : b.s.cap === "M" ? 1 : 2; return sortDir === "asc" ? av - bv : bv - av; }
    if (sortKey === "price") { av = a.lc; bv = b.lc; }
    else if (sortKey === "todayChg") { av = a.todayChg != null ? a.todayChg : -999; bv = b.todayChg != null ? b.todayChg : -999; }
    else if (sortKey === "dayChg") { av = a.dayChg != null ? a.dayChg : -999; bv = b.dayChg != null ? b.dayChg : -999; }
    else if (sortKey === "weekChg") { av = a.weekChg != null ? a.weekChg : -999; bv = b.weekChg != null ? b.weekChg : -999; }
    else if (sortKey === "monthChg") { av = a.monthChg != null ? a.monthChg : -999; bv = b.monthChg != null ? b.monthChg : -999; }
    else if (sortKey === "yearChg") { av = a.yearChg != null ? a.yearChg : -999; bv = b.yearChg != null ? b.yearChg : -999; }
    else if (sortKey === "weekly") { av = a.result.weekly ? a.result.weekly.total : 0; bv = b.result.weekly ? b.result.weekly.total : 0; }
    else if (sortKey === "daily") { av = a.result.daily ? a.result.daily.total : 0; bv = b.result.daily ? b.result.daily.total : 0; }
    else if (sortKey === "hourly") { av = a.result.hourly ? a.result.hourly.total : 0; bv = b.result.hourly ? b.result.hourly.total : 0; }
    else if (sortKey === "conf10dLog") { av = a.conf10dLog != null ? a.conf10dLog : -1; bv = b.conf10dLog != null ? b.conf10dLog : -1; }
    else if (sortKey === "conf10dEmp") { av = a.conf10dEmp != null ? a.conf10dEmp : -1; bv = b.conf10dEmp != null ? b.conf10dEmp : -1; }
    else { av = a.result.finalScore; bv = b.result.finalScore; }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  var _cfg = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? window.TechIndicators.getScoreConfig().classification : null;
  var _buyTh = _cfg ? _cfg.buy : 65, _wlTh = _cfg ? _cfg.watchlist : 50;

  var filtered = filter === "all" ? sorted : sorted.filter(function(r) {
    if (filter === "buy") return r.result.finalScore >= _buyTh;
    if (filter === "watch") return r.result.finalScore >= _wlTh && r.result.finalScore < _buyTh;
    if (filter === "avoid") return r.result.finalScore < _wlTh;
    return true;
  });

  var countBuy = results.filter(function(r) { return r.result.finalScore >= _buyTh; }).length;
  var countWatch = results.filter(function(r) { return r.result.finalScore >= _wlTh && r.result.finalScore < _buyTh; }).length;
  var countAvoid = results.filter(function(r) { return r.result.finalScore < _wlTh; }).length;

  var arrow = function(key) {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? React.createElement("span", { style: { display: "inline-flex", verticalAlign: "middle" } }, Ico.triangleDown(10, "var(--accent)")) : React.createElement("span", { style: { display: "inline-flex", verticalAlign: "middle" } }, Ico.triangleUp(10, "var(--accent)"));
  };

  var thStyle = { padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "var(--text5)", textAlign: "left", borderBottom: "2px solid var(--border)", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" };
  var tdStyle = { padding: "7px 10px", fontSize: 11, borderBottom: "1px solid var(--border)" };

  return React.createElement("div", { style: { marginTop: 4 } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Nifty 200 Screener"),
        React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginTop: 2 } },
          "Real-time multi-timeframe entry score for all Nifty 200 stocks",
          scanTime && !scanning ? React.createElement("span", { style: { marginLeft: 6, color: "var(--text6)", fontSize: 9 } }, "Last scanned: " + new Date(scanTime).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })) : ""
        )
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
        results.length > 0 && !scanning && !bgRefreshing && selectedCount > 0 ? React.createElement("button", {
          onClick: refreshSelected,
          className: "stx-btn stx-btn-primary",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 700, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", cursor: "pointer" }
        }, React.createElement(React.Fragment, null, Ico.refresh(12), " Refresh Selected (" + selectedCount + ")")) : null,
        results.length > 0 && !scanning && selectedCount > 0 ? React.createElement("button", {
          onClick: refreshSelectedBackground,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: bgRefreshing ? "var(--bg5)" : "var(--bg4)", color: bgRefreshing ? "var(--text6)" : "var(--text4)", cursor: bgRefreshing ? "wait" : "pointer" }
        }, bgRefreshing ? React.createElement(React.Fragment, null, Ico.refresh(12), " BG (" + bgProgress.done + "/" + bgProgress.total + ")") : React.createElement(React.Fragment, null, Ico.refresh(12), " Background (" + selectedCount + ")")) : null,
        results.length > 0 && !scanning && selectedCount > 0 ? React.createElement("button", {
          onClick: function() {
            var tickers = Object.keys(selected).filter(function(t) { return selected[t]; });
            if (!tickers.length) return;
            window.dispatchEvent(new CustomEvent("stox:add-to-backtest", { detail: { tickers: tickers } }));
          },
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 700, border: "1px solid #f97316", background: "rgba(249,115,22,.08)", color: "#f97316", cursor: "pointer" }
        }, "\u25b6 Backtest (" + selectedCount + ")") : null,
        results.length > 0 && !scanning && selectedCount > 0 ? React.createElement("button", {
          onClick: batchAddToES,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 700, border: "1px solid #22c55e", background: "rgba(34,197,94,.08)", color: "#22c55e", cursor: "pointer" }
        }, "+ ES (" + selectedCount + ")") : null,
        results.length > 0 && !scanning && selectedCount > 0 ? React.createElement("button", {
          onClick: batchAddToCS,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 700, border: "1px solid #06b6d4", background: "rgba(6,182,212,.08)", color: "#06b6d4", cursor: "pointer" }
        }, "+ CS (" + selectedCount + ")") : null,
        results.length > 0 && !scanning ? React.createElement("button", {
          onClick: saveSnapshot,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--accent)", background: "var(--accentbg)", color: "var(--accent)", cursor: "pointer" }
        }, "Save Snapshot") : null,
        results.length > 0 && !scanning ? React.createElement("button", {
          onClick: exportJSON,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" }
        }, React.createElement(React.Fragment, null, Ico.download(10), " Export")) : null,
        results.length > 0 && !scanning ? React.createElement("button", {
          onClick: exportExcel,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid #16a34a", background: "rgba(22,163,74,.08)", color: "#16a34a", cursor: "pointer" }
        }, React.createElement(React.Fragment, null, Ico.download(10), " Excel")) : null,
        React.createElement("button", {
          onClick: importJSON,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text4)", cursor: "pointer" }
        }, React.createElement(React.Fragment, null, Ico.upload(10), " Import")),
        results.length > 0 && !scanning ? React.createElement("button", {
          onClick: purgeData,
          className: "stx-btn",
          style: { padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text5)", cursor: "pointer" }
        }, "Purge Data") : null,
        React.createElement("button", {
          onClick: startScan, disabled: scanning,
          className: "stx-btn stx-btn-primary",
          style: { padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: scanning ? "wait" : "pointer" }
        }, scanning ? "Scanning... (" + progress.done + "/" + progress.total + ")" : "Scan Nifty 200"),
        React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } },
          React.createElement("input", {
            type: "text", placeholder: "Add ticker...", value: manualTicker,
            onChange: function(e) { setManualTicker(e.target.value); },
            onKeyDown: function(e) { if (e.key === "Enter") addManualStock(); },
            style: { width: 110, padding: "7px 10px", fontSize: 11, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", outline: "none", fontFamily: "var(--font-mono)" }
          }),
          React.createElement("button", {
            onClick: addManualStock, disabled: manualLoading || !manualTicker.trim(),
            className: "stx-btn",
            style: { padding: "7px 12px", fontSize: 11, fontWeight: 600, border: "1px solid var(--accent)", background: "var(--accentbg)", color: "var(--accent)", cursor: manualLoading || !manualTicker.trim() ? "not-allowed" : "pointer", opacity: manualLoading || !manualTicker.trim() ? 0.5 : 1 }
          }, manualLoading ? "\u27f3" : "+ Add")
        )
      )
    ),
    scanning && React.createElement("div", { style: { marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
        React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text3)" } },
          "Progress: " + progress.done + "/" + (progress.total || NIFTY_200_UNIQUE.length) + " stocks"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, progress.current)
      ),
      React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
        React.createElement("div", { style: { height: "100%", borderRadius: 3, background: "var(--accent)", transition: "width .3s", width: (progress.total > 0 ? (progress.done / progress.total * 100) : 0) + "%" } })
      )
    ),
    scanErr && React.createElement("div", { style: { marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.15)", fontSize: 11, color: "#ef4444" } }, scanErr),
    bgRefreshing && React.createElement("div", { style: { marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
        React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "var(--text3)" } },
          "Background: " + bgProgress.done + "/" + bgProgress.total + " stocks"),
        React.createElement("span", { style: { fontSize: 10, color: "var(--text5)" } }, bgProgress.current)
      ),
      React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden" } },
        React.createElement("div", { style: { height: "100%", borderRadius: 3, background: "var(--accent)", transition: "width .3s", width: (bgProgress.total > 0 ? (bgProgress.done / bgProgress.total * 100) : 0) + "%" } })
      )
    ),
    results.length > 0 && React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" } },
        [{ k: "all", l: "All (" + results.length + ")" }, { k: "buy", l: "Buy (" + countBuy + ")" }, { k: "watch", l: "Watch (" + countWatch + ")" }, { k: "avoid", l: "Avoid (" + countAvoid + ")" }].map(function(f) {
          return React.createElement("button", { key: f.k, onClick: function() { setFilter(f.k); }, className: "stx-btn" + (filter === f.k ? " stx-btn-primary" : ""), style: { padding: "5px 12px", fontSize: 10, fontWeight: filter === f.k ? 700 : 500 } }, f.l);
        })
      ),
      React.createElement("div", { style: { overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg3)" } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 1640 } },
          React.createElement("thead", null,
            React.createElement("tr", null,
              ["select", "ticker", "name", "cap", "price", "todayChg", "dayChg", "weekChg", "monthChg", "yearChg", "avgTrend", "avgPullback", "avgProb4", "avgSwingPotential", "finalScore", "weekly", "daily", "hourly", "conf10dLog", "conf10dEmp", "actions"].map(function(k) {
                if (k === "select") {
                  var allFilteredSelected = filtered.length > 0 && filtered.every(function(r) { return selected[r.s.t]; });
                  return React.createElement("th", { key: k, style: Object.assign({}, thStyle, { cursor: "default", textAlign: "center", width: 36 }) },
                    React.createElement("input", { type: "checkbox", checked: allFilteredSelected, onChange: toggleSelectAll, style: { accentColor: "var(--accent)", cursor: "pointer", width: 14, height: 14 } })
                  );
                }
                var labels = { ticker: "Ticker", name: "Company", cap: "Cap", price: "Price (\u20b9)", todayChg: "Today %", dayChg: "1D Chg %", weekChg: "1W Chg %", monthChg: "1M Chg %", yearChg: "Yearly %", avgTrend: "Trend", avgPullback: "Pullback", avgProb4: "Prob4", avgSwingPotential: "Swing", finalScore: "Score", weekly: "Weekly", daily: "Daily", hourly: "Hourly", conf10dLog: "Conf " + ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "DLN", conf10dEmp: "Conf " + ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "DEM", actions: "Last Refreshed" };
                return React.createElement("th", { key: k, title: k === "conf10dLog" ? ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-Day Confidence \u2014 Lognormal Model" : k === "conf10dEmp" ? ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-Day Confidence \u2014 Empirical Model" : undefined, style: Object.assign({}, thStyle, { cursor: k === "actions" ? "default" : "pointer" }), onClick: k === "actions" ? undefined : function() { toggleSort(k); } }, [labels[k], (k === "actions" ? null : arrow(k))]);
              })
            )
          ),
          React.createElement("tbody", null,
            filtered.map(function(r) {
              var d = r.result.decision;
              return React.createElement("tr", { key: r.s.t, style: { background: selected[r.s.t] ? "var(--accentbg)" : "var(--bg3)", transition: "background .15s" } },
                React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                  React.createElement("input", { type: "checkbox", checked: !!selected[r.s.t], onChange: function() { toggleSelect(r.s.t); }, style: { accentColor: "var(--accent)", cursor: "pointer", width: 14, height: 14 } })
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle) },
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
                    React.createElement("button", {
                      onClick: function(e) { e.stopPropagation(); toggleBookmark(r.s.t); },
                      title: bookmarks[r.s.t] ? "Remove bookmark" : "Bookmark this stock",
                      style: {
                        width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center",
                        border: "none", background: "transparent", cursor: "pointer", padding: 0, flexShrink: 0,
                        color: bookmarks[r.s.t] ? "#fbbf24" : "var(--text6)", opacity: bookmarks[r.s.t] ? 1 : 0.35,
                        transition: "all .15s"
                      }
                    }, Icons.star(14, !!bookmarks[r.s.t])),
                    React.createElement("button", {
                      onClick: function(e) { e.stopPropagation(); toggleUnicorn(r.s.t); },
                      title: unicorns[r.s.t] ? "Remove unicorn" : "Mark as unicorn stock",
                      style: {
                        width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center",
                        border: "none", background: "transparent", cursor: "pointer", padding: 0, flexShrink: 0,
                        color: unicorns[r.s.t] ? "#166534" : "var(--text6)", opacity: unicorns[r.s.t] ? 1 : 0.35,
                        transition: "all .15s"
                      }
                    }, Icons.unicorn(14, !!unicorns[r.s.t])),
                    React.createElement("button", {
                      onClick: function(e) { e.stopPropagation(); if (onOpenStock) onOpenStock(r.s.t.replace(".NS", "")); },
                      title: "Open in Single Stock Analysis",
                      style: { border: "none", background: "transparent", cursor: "pointer", padding: 0, fontWeight: 700, fontSize: 11, color: "var(--text)", fontFamily: "var(--font-heading)", whiteSpace: "nowrap", textAlign: "left" }
                    }, r.s.t.replace(".NS", ""))
                  )
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { color: "var(--text4)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) }, r.s.n),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontSize: 10 }) },
                  r.s.cap ? React.createElement("span", { style: { padding: "2px 7px", borderRadius: 4, background: r.s.cap === "L" ? "rgba(59,130,246,.12)" : "rgba(168,85,247,.12)", color: r.s.cap === "L" ? "#3b82f6" : "#a855f7", border: "1px solid " + (r.s.cap === "L" ? "rgba(59,130,246,.25)" : "rgba(168,85,247,.25)"), fontWeight: 700, letterSpacing: 0.3 } }, r.s.cap === "L" ? "Large" : "Mid") : "\u2014"
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, color: "var(--text3)", fontFamily: "var(--font-heading)" }) }, "\u20b9" + Number(Math.round(r.lc)).toLocaleString("en-IN")),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.todayChg != null ? (r.todayChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.todayChg != null ? (r.todayChg >= 0 ? "+" : "") + Number(r.todayChg).toFixed(2) + "%" : "--"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.dayChg != null ? (r.dayChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.dayChg != null ? (r.dayChg >= 0 ? "+" : "") + Number(r.dayChg).toFixed(2) + "%" : "--"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.weekChg != null ? (r.weekChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.weekChg != null ? (r.weekChg >= 0 ? "+" : "") + Number(r.weekChg).toFixed(2) + "%" : "--"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.monthChg != null ? (r.monthChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.monthChg != null ? (r.monthChg >= 0 ? "+" : "") + Number(r.monthChg).toFixed(2) + "%" : "--"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.yearChg != null ? (r.yearChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.yearChg != null ? (r.yearChg >= 0 ? "+" : "") + Number(r.yearChg).toFixed(2) + "%" : "--"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                  r.result.aggTrendHealth != null
                    ? React.createElement("span", { title: "Trend Health contribution to entry score " + r.result.finalScore, style: { fontWeight: 700, color: "var(--accent)" } }, Number(r.result.aggTrendHealth).toFixed(1))
                    : "\u2014"
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                  r.result.aggPullbackQuality != null
                    ? React.createElement("span", { title: "Pullback Quality contribution to entry score " + r.result.finalScore, style: { fontWeight: 700, color: "var(--accent)" } }, Number(r.result.aggPullbackQuality).toFixed(1))
                    : "\u2014"
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                  r.result.aggProb4 != null
                    ? React.createElement("span", { title: "4% Probability contribution to entry score " + r.result.finalScore, style: { fontWeight: 700, color: "var(--accent)" } }, Number(r.result.aggProb4).toFixed(1))
                    : "\u2014"
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                  r.result.aggSwingPotential != null && r.result.aggSwingPotential > 0
                    ? React.createElement("span", { title: "Swing Potential contribution to entry score " + r.result.finalScore, style: { fontWeight: 700, color: "var(--accent)" } }, Number(r.result.aggSwingPotential).toFixed(1))
                    : "\u2014"
                ),
                React.createElement("td", { style: tdStyle },
                  React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
                    React.createElement("span", { style: { fontSize: 13, fontWeight: 900, color: d.color, fontFamily: "var(--font-heading)" } }, r.result.finalScore),
                    React.createElement("span", { style: { fontSize: 9, fontWeight: 700, color: d.color, padding: "2px 6px", borderRadius: 4, background: d.color + "18" } }, d.label)
                  )
                ),
                React.createElement("td", { style: tdStyle }, r.result.weekly ? React.createElement("span", { style: { fontWeight: 700, color: r.result.weekly.decision.color } }, r.result.weekly.total) : "\u2014"),
                React.createElement("td", { style: tdStyle }, r.result.daily ? React.createElement("span", { style: { fontWeight: 700, color: r.result.daily.decision.color } }, r.result.daily.total) : "\u2014"),
                React.createElement("td", { style: tdStyle }, r.result.hourly ? React.createElement("span", { style: { fontWeight: 700, color: r.result.hourly.decision.color } }, r.result.hourly.total) : "\u2014"),
                React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                   r.conf10dLog != null
                    ? React.createElement("span", { title: ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-Day Confidence \u2014 Lognormal (" + Number(r.conf10dLog).toFixed(1) + "/100)", style: { fontWeight: 700, fontFamily: "var(--font-mono)", color: r.conf10dLog >= 70 ? "#16a34a" : r.conf10dLog >= 40 ? "#d97706" : "#dc2626", fontSize: 11 } }, Number(r.conf10dLog).toFixed(0))
                    : React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "\u2014")
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { textAlign: "center" }) },
                   r.conf10dEmp != null
                    ? React.createElement("span", { title: ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-Day Confidence \u2014 Empirical (" + Number(r.conf10dEmp).toFixed(1) + "/100)", style: { fontWeight: 700, fontFamily: "var(--font-mono)", color: r.conf10dEmp >= 70 ? "#16a34a" : r.conf10dEmp >= 40 ? "#d97706" : "#dc2626", fontSize: 11 } }, Number(r.conf10dEmp).toFixed(0))
                    : React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "\u2014")
                ),
                React.createElement("td", { style: Object.assign({}, tdStyle, { whiteSpace: "nowrap" }) },
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                    React.createElement("button", {
                      onClick: function() { refreshStock(r.s); }, disabled: !!refreshingMap[r.s.t],
                      style: { width: 24, height: 24, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg4)", cursor: refreshingMap[r.s.t] ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, padding: 0, color: "var(--text5)", flexShrink: 0 }
                    }, refreshingMap[r.s.t] ? React.createElement("span", { style: { display: "inline-block", animation: "screener-spin .8s linear infinite" } }, Ico.refresh(14)) : Ico.refresh(14)),
                    React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, timestamps[r.s.t] ? new Date(timestamps[r.s.t]).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "\u2014")
                  )
                )
              );
            })
          )
        )
      ),
      React.createElement("div", { style: { marginTop: 8, fontSize: 9, color: "var(--text6)", textAlign: "center" } },
        "Sorted by Today % " + (sortDir === "desc" ? "descending" : "ascending") + " \u00b7 " + filtered.length + " stocks shown"
      )
    ),
    !scanning && results.length === 0 && React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text6)", fontSize: 13 } },
      "Click \"Scan Nifty 200\" to analyze all stocks"
    ),
    React.createElement(ScreenerSnapshots, { snapshots: snapshots, deleteSnapshot: deleteSnapshot, deleteSnapshotsBatch: deleteSnapshotsBatch })
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SCREENER SNAPSHOTS (expandable Year > Month > Day tree)
   ══════════════════════════════════════════════════════════════════════════ */
function ScreenerSnapshots(props) {
  var snapshots = props.snapshots;
  var deleteSnapshot = props.deleteSnapshot;
  var deleteSnapshotsBatch = props.deleteSnapshotsBatch;

  var _s = useState({});
  var openSnaps = _s[0], setOpenSnaps = _s[1];
  var _s2 = useState({});
  var openGroups = _s2[0], setOpenGroups = _s2[1];

  if (!snapshots.length) return null;

  var fmtDate = function(ts) {
    var d = new Date(ts);
    return { year: d.getFullYear(), month: d.toLocaleString("en-IN", { month: "long" }), day: d.getDate(), dayStr: d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), time: d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
  };

  var grouped = {};
  snapshots.forEach(function(snap) {
    var f = fmtDate(snap.scanTime);
    var yk = String(f.year);
    var mk = yk + "-" + f.month;
    var dk = mk + "-" + f.day;
    if (!grouped[yk]) grouped[yk] = {};
    if (!grouped[yk][mk]) grouped[yk][mk] = {};
    if (!grouped[yk][mk][dk]) grouped[yk][mk][dk] = [];
    grouped[yk][mk][dk].push(Object.assign({}, snap, { _f: f }));
  });

  var toggleGroup = function(k) { setOpenGroups(function(p) { var c = Object.assign({}, p); c[k] = !c[k]; return c; }); };
  var toggleSnap = function(k) { setOpenSnaps(function(p) { var c = Object.assign({}, p); c[k] = !c[k]; return c; }); };

  var cardStyle = { background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 16, overflow: "hidden" };
  var headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "10px 14px", userSelect: "none", transition: "background .15s" };
  var arrowStyle = function(open) { return { display: "inline-block", transition: "transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)", fontSize: 10, marginRight: 8, color: "var(--text5)" }; };

  var snapThStyle = { padding: "5px 8px", fontSize: 9, fontWeight: 700, color: "var(--text6)", textAlign: "left", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  var snapTdStyle = { padding: "4px 8px", fontSize: 10, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };

  var renderSnapTable = function(results) {
    return React.createElement("div", { style: { overflowX: "auto" } },
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 900 } },
        React.createElement("thead", null,
          React.createElement("tr", null,
            ["ticker", "name", "price", "todayChg", "dayChg", "weekChg", "monthChg", "finalScore", "weekly", "daily", "hourly"].map(function(k) {
              var labels = { ticker: "Ticker", name: "Company", price: "Price (\u20b9)", todayChg: "Today %", dayChg: "1D Chg %", weekChg: "1W Chg %", monthChg: "1M Chg %", finalScore: "Score", weekly: "Weekly", daily: "Daily", hourly: "Hourly" };
              return React.createElement("th", { key: k, style: snapThStyle }, labels[k]);
            })
          )
        ),
        React.createElement("tbody", null,
          results.map(function(r) {
            var d = r.result.decision;
            return React.createElement("tr", { key: r.s.t },
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" }) }, r.s.t.replace(".NS", "")),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { color: "var(--text4)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }) }, r.s.n),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, color: "var(--text3)", fontFamily: "var(--font-heading)" }) }, "\u20b9" + Number(Math.round(r.lc)).toLocaleString("en-IN")),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.todayChg != null ? (r.todayChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.todayChg != null ? (r.todayChg >= 0 ? "+" : "") + Number(r.todayChg).toFixed(2) + "%" : "--"),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.dayChg != null ? (r.dayChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.dayChg != null ? (r.dayChg >= 0 ? "+" : "") + Number(r.dayChg).toFixed(2) + "%" : "--"),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.weekChg != null ? (r.weekChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.weekChg != null ? (r.weekChg >= 0 ? "+" : "") + Number(r.weekChg).toFixed(2) + "%" : "--"),
              React.createElement("td", { style: Object.assign({}, snapTdStyle, { fontWeight: 600, fontFamily: "var(--font-heading)", color: r.monthChg != null ? (r.monthChg >= 0 ? "#22c55e" : "#ef4444") : "var(--text6)" }) }, r.monthChg != null ? (r.monthChg >= 0 ? "+" : "") + Number(r.monthChg).toFixed(2) + "%" : "--"),
              React.createElement("td", { style: snapTdStyle },
                React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 4 } },
                  React.createElement("span", { style: { fontSize: 11, fontWeight: 900, color: d.color, fontFamily: "var(--font-heading)" } }, r.result.finalScore),
                  React.createElement("span", { style: { fontSize: 8, fontWeight: 700, color: d.color, padding: "1px 5px", borderRadius: 3, background: d.color + "18" } }, d.label)
                )
              ),
              React.createElement("td", { style: snapTdStyle }, r.result.weekly ? React.createElement("span", { style: { fontWeight: 700, color: r.result.weekly.decision.color } }, r.result.weekly.total) : "\u2014"),
              React.createElement("td", { style: snapTdStyle }, r.result.daily ? React.createElement("span", { style: { fontWeight: 700, color: r.result.daily.decision.color } }, r.result.daily.total) : "\u2014"),
              React.createElement("td", { style: snapTdStyle }, r.result.hourly ? React.createElement("span", { style: { fontWeight: 700, color: r.result.hourly.decision.color } }, r.result.hourly.total) : "\u2014")
            );
          })
        )
      )
    );
  };

  return React.createElement("div", { style: { marginTop: 20 } },
    React.createElement("div", { style: { fontSize: 14, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)", marginBottom: 4 } }, "Saved Snapshots"),
    React.createElement("div", { style: { fontSize: 10, color: "var(--text5)", marginBottom: 14 } }, "Historical screener snapshots grouped by date"),
    Object.keys(grouped).sort(function(a, b) { return b - a; }).map(function(year) {
      var yearKey = "y-" + year;
      var yearOpen = !!openGroups[yearKey];
      var months = grouped[year];
      return React.createElement("div", { key: year, style: cardStyle },
        React.createElement("div", { style: Object.assign({}, headerStyle, { background: "var(--bg4)" }), onClick: function() { toggleGroup(yearKey); } },
          React.createElement("div", null, React.createElement("span", { style: arrowStyle(yearOpen) }, "\u25b6"), React.createElement("span", { style: { fontSize: 13, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)" } }, year),
            React.createElement("span", { style: { fontSize: 10, color: "var(--text6)", marginLeft: 8 } }, Object.values(months).reduce(function(a, m) { return a + Object.values(m).reduce(function(b, d) { return b + d.length; }, 0); }, 0) + " snapshots")
          )
        ),
        yearOpen && React.createElement("div", { style: { padding: "0 10px 10px" } },
          Object.keys(months).sort(function(a, b) { return months[b].length - months[a].length || b.localeCompare(a); }).map(function(month) {
            var mk = yearKey + "-" + month;
            var monthOpen = !!openGroups[mk];
            var days = months[month];
            var monthSnapCount = Object.values(days).reduce(function(a, d) { return a + d.length; }, 0);
            return React.createElement("div", { key: month, style: { marginBottom: 8 } },
              React.createElement("div", { style: Object.assign({}, headerStyle, { padding: "6px 10px", borderRadius: 6, background: "var(--bg5)" }), onClick: function() { toggleGroup(mk); } },
                React.createElement("div", null, React.createElement("span", { style: arrowStyle(monthOpen) }, "\u25b6"), React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--text4)" } }, month),
                  React.createElement("span", { style: { fontSize: 9, color: "var(--text6)", marginLeft: 6 } }, monthSnapCount + " snapshots")
                ),
                React.createElement("span", { onClick: async function(e) { e.stopPropagation(); var ids = Object.values(days).flat().map(function(s) { return s.id; }); if (await showConfirm("Delete all " + monthSnapCount + " snapshot" + (monthSnapCount !== 1 ? "s" : "") + " in " + month + "?")) deleteSnapshotsBatch(ids); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, monthSnapCount === 1 ? "Delete" : "Delete All")
              ),
              monthOpen && React.createElement("div", { style: { paddingLeft: 14 } },
                Object.keys(days).sort(function(a, b) { return b.localeCompare(a); }).map(function(dayKey) {
                  var dk = mk + "-" + dayKey;
                  var dayOpen = !!openGroups[dk];
                  var snaps = days[dayKey];
                  return React.createElement("div", { key: dayKey, style: { marginBottom: 4 } },
                    snaps.map(function(snap) {
                      var snapKey = dk + "-" + snap.id;
                      var isOpen = !!openSnaps[snapKey];
                      return React.createElement("div", { key: snap.id, style: { marginBottom: 4, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg3)" } },
                        React.createElement("div", { style: Object.assign({}, headerStyle, { padding: "7px 10px" }), onClick: function() { toggleSnap(snapKey); } },
                          React.createElement("div", null,
                            React.createElement("span", { style: arrowStyle(isOpen) }, "\u25b6"),
                            React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--text3)" } }, snap._f.dayStr + " " + snap._f.time),
                            React.createElement("span", { style: { fontSize: 9, color: "var(--text6)", marginLeft: 6 } }, snap.results.length + " stocks")
                          ),
                          React.createElement("button", {
                            onClick: function(e) { e.stopPropagation(); deleteSnapshot(snap.id); },
                            className: "stx-btn",
                            style: { padding: "3px 8px", fontSize: 9, fontWeight: 600, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.06)", color: "#ef4444", cursor: "pointer" }
                          }, "Delete")
                        ),
                        isOpen && renderSnapTable(snap.results)
                      );
                    })
                  );
                })
              )
            );
          })
        )
      );
    })
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT: Single Stock Analysis (Pulse sub-tab)
   ══════════════════════════════════════════════════════════════════════════ */
function SingleStockAnalysis({ requestedTicker }) {
  var TI = window.TechIndicators;
  var DF = window.OHLCVFetcher;

  var _LS_KEY = "stox_single_stock";
  var _saved = (function () { try { return JSON.parse(localStorage.getItem(_LS_KEY)) || {}; } catch (e) { return {}; } })();
  var _initial = requestedTicker || _saved.ticker || "";

  var _a = useState(_initial), ticker = _a[0], setTicker = _a[1];
  var _b = useState(_saved.timeframe || "daily"), timeframe = _b[0], setTimeframe = _b[1];
  var _c = useState(null), candles = _c[0], setCandles = _c[1];
  var _d = useState(false), loading = _d[0], setLoading = _d[1];
  var _e = useState(null), error = _e[0], setError = _e[1];
  var _f = useState(null), indicators = _f[0], setIndicators = _f[1];
  var _g = useState(null), signals = _g[0], setSignals = _g[1];
  var _h = useState(!!_saved.autoRefresh), autoRefresh = _h[0], setAutoRefresh = _h[1];
  var _i = useState(null), lastUpdated = _i[0], setLastUpdated = _i[1];
  var _j = useState(_saved.category || "all"), category = _j[0], setCategory = _j[1];
  var _k = useState(0), refreshTick = _k[0], setRefreshTick = _k[1];
  var _l = useState(null), dataSource = _l[0], setDataSource = _l[1];
  var _m = useState(_initial), inputVal = _m[0], setInputVal = _m[1];
  var timerRef = useRef(null);
  var fetchIdRef = useRef(0);
  var _n = useState("none"), oscPane = _n[0], setOscPane = _n[1];
  var _o = useState({ ma: false, bb: false, vwap: false, st: false, sar: false, lvl: false }), overlays = _o[0], setOverlays = _o[1];
  var _p = useState(null), quote = _p[0], setQuote = _p[1];
  var _q = useState(null), mtf = _q[0], setMtf = _q[1];
  var _r = useState(false), mtfLoading = _r[0], setMtfLoading = _r[1];
  var _s = useState([]), snapshots = _s[0], setSnapshots = _s[1];
  var _t = useState(false), savingSnap = _t[0], setSavingSnap = _t[1];
  var _v = useState(null), snapYear = _v[0], setSnapYear = _v[1];
  var _w = useState(null), snapMonth = _w[0], setSnapMonth = _w[1];
  var _x = useState(null), snapDay = _x[0], setSnapDay = _x[1];
  var _y = useState({}), snapOpen = _y[0], setSnapOpen = _y[1];
  var _z = useState(null), hoverCandle = _z[0], setHoverCandle = _z[1];
  var _zz = useState(null), mousePos = _zz[0], setMousePos = _zz[1];
  var _zm = useState(null), zoomCandles = _zm[0], setZoomCandles = _zm[1];
  var _zp = useState(0), panOffset = _zp[0], setPanOffset = _zp[1];
  var _zd = useState(false), isDragging = _zd[0], setIsDragging = _zd[1];
  var _dl = useState(null), dragStartX = _dl[0], setDragStartX = _dl[1];
  var _dp = useState(null), dragStartPan = _dp[0], setDragStartPan = _dp[1];

  useEffect(function () {
    try { localStorage.setItem(_LS_KEY, JSON.stringify({ ticker: ticker, timeframe: timeframe, category: category, autoRefresh: autoRefresh })); } catch (e) {}
  }, [ticker, timeframe, category, autoRefresh]);

  useEffect(function () {
    if (requestedTicker && requestedTicker !== ticker) {
      setTicker(requestedTicker);
      setInputVal(requestedTicker);
      DF.clearCache();
    }
  }, [requestedTicker]);

  var TF_DEFS = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "1h", label: "1H" },
    { key: "15m", label: "15m" },
    { key: "5m", label: "5m" },
    { key: "1m", label: "1m" },
  ];

  var fetchData = useCallback(async function () {
    if (!ticker) return;
    var fid = Date.now();
    fetchIdRef.current = fid;
    setLoading(true); setError(null);
    DF.fetchQuoteCached(ticker).then(function (q) { if (fetchIdRef.current === fid) setQuote(q); });
    try {
      var result = await DF.fetchOHLCVCached(ticker, timeframe);
      if (fetchIdRef.current !== fid) return;
      var data = result.data;
      var source = result.source;
      if (!data || data.length < 10) {
        setError("Could not fetch data for " + ticker + ". Check the ticker or try a different timeframe.");
        setLoading(false); return;
      }
      setCandles(data); setDataSource(source);
      var ind = TI.computeAll(data);
      if (fetchIdRef.current !== fid) return;
      setIndicators(ind);
      var sig = TI.interpret(ind);
      if (fetchIdRef.current !== fid) return;
      setSignals(sig);
      setLastUpdated(new Date());
    } catch (e) {
      if (fetchIdRef.current !== fid) return;
      setError("Failed to fetch data: " + (e.message || "error"));
    }
    if (fetchIdRef.current === fid) setLoading(false);
  }, [ticker, timeframe]);

  /* Load W/D/H entry score + RS vs Nifty / Beta using daily index candles */
  var loadMtf = useCallback(async function (tk) {
    if (!tk) return;
    setMtfLoading(true);
    try {
      var resW = await DF.fetchOHLCVCached(tk, "weekly");
      var resD = await DF.fetchOHLCVCached(tk, "daily");
      var resH = await DF.fetchOHLCVCached(tk, "1h");
      var idxD = await DF.fetchOHLCVCached("^NSEI", "daily");
      var idxW = await DF.fetchOHLCVCached("^NSEI", "weekly");
      var entry = null;
      if (resW && resW.data && resD && resD.data) {
        entry = computeCompatEntryScore(resW.data, resD.data, resH && resH.data && resH.data.length >= 100 ? resH.data : null, idxD && idxD.data, idxW && idxW.data);
      }
      var rs = null, beta = null;
      if (idxD && idxD.data && resD && resD.data) {
        var r = TI.relativeStrength(resD.data, idxD.data);
        if (r) rs = r;
        var bArr = TI.beta(resD.data, idxD.data);
        if (bArr && bArr.length) {
          for (var bi = bArr.length - 1; bi >= 0; bi--) { if (bArr[bi] != null) { beta = bArr[bi]; break; } }
        }
      }
      setMtf({ entry: entry, rs: rs, beta: beta });
    } catch (e) {
      setMtf({ entry: null, rs: null, beta: null });
    }
    setMtfLoading(false);
  }, []);

  useEffect(function () { setMtf(null); loadMtf(ticker); }, [ticker, loadMtf]);

  useEffect(function () { fetchData(); }, [fetchData]);

  useEffect(function () {
    if (!autoRefresh) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(function () { DF.clearCache(); setRefreshTick(function (t) { return t + 1; }); }, 60000);
    return function () { clearInterval(timerRef.current); };
  }, [autoRefresh]);

  useEffect(function () { fetchData(); }, [refreshTick, fetchData]);

  useEffect(function () {
    var cancelled = false;
    dbGetSetting(SS_SNAP_KEY).then(function (val) {
      if (cancelled) return;
      if (val && Array.isArray(val)) setSnapshots(val);
    }).catch(function () {});
    return function () { cancelled = true; };
  }, []);

  var persistSnapshots = function (arr) {
    setSnapshots(arr);
    dbSetSetting(SS_SNAP_KEY, arr);
    window.dispatchEvent(new CustomEvent("stox:data-changed"));
  };
  var deleteSnapshot = function (id) { persistSnapshots(snapshots.filter(function (s) { return s.id !== id; })); };
  var deleteSnapshotsWhere = function (pred) { persistSnapshots(snapshots.filter(function (s) { return !pred(s); })); };

  var saveSnapshot = useCallback(async function () {
    if (!ticker || savingSnap) return;
    setSavingSnap(true);
    try {
      var resD = await DF.fetchOHLCVCached(ticker, "daily");
      var resH = await DF.fetchOHLCVCached(ticker, "1h");
      var d = resD && resD.data;
      var h1 = resH && resH.data;
      var dailyBar = d && d.length ? d[d.length - 1] : null;
      var currentPrice = quote && quote.price > 0 ? quote.price : (dailyBar ? dailyBar.c : null);
      var tenDayConf = null, optimumRes = null, indCompact = null;
      if (d && h1 && d.length >= 30 && h1.length >= 60) {
        var idxD = null;
        try { var _idxR = await DF.fetchOHLCVCached("^NSEI", "daily"); idxD = (_idxR && _idxR.data) || null; } catch (e) {}
        var i15 = null;
        try { var _r15 = await DF.fetchOHLCVCached(ticker, "5m"); i15 = (_r15 && _r15.data) || null; } catch (e) {}
        var _snapEntryCtx = mtf && mtf.entry ? buildEntryScoreContext(mtf.entry) : null;
        tenDayConf = TI.computeTenDayForwardConfidence(h1, d, idxD, _snapEntryCtx);
        optimumRes = TI.computeOptimumEntryPrice(h1, d, idxD, _snapEntryCtx, i15);
        try { indCompact = pickCompactIndicators(TI.computeAll(d)); } catch (e) {}
      }
      var entry = mtf && mtf.entry ? mtf.entry : null;
      if (!entry) {
        try {
          var resW = await DF.fetchOHLCVCached(ticker, "weekly");
          var idxW = null;
          try { var _idxR2 = await DF.fetchOHLCVCached("^NSEI", "weekly"); idxW = (_idxR2 && _idxR2.data) || null; } catch (e) {}
          if (resW && resW.data && d && resW.data.length >= 12 && d.length >= 12) {
            entry = computeCompatEntryScore(resW.data, d, h1 && h1.length >= 100 ? h1 : null, idxD, idxW);
          }
        } catch (e) {}
      }
      var snap = {
        id: Date.now(),
        savedAt: new Date().toISOString(),
        ticker: ticker,
        timeframe: timeframe,
        currentPrice: currentPrice,
        overall: signals && signals._score && signals._score.total > 0
          ? { bull: signals._score.bull, neutral: signals._score.neutral, bear: signals._score.bear, total: signals._score.total }
          : null,
        entryScore: entry ? { finalScore: entry.finalScore, decision: entry.decision, weekly: entry.weekly, daily: entry.daily, hourly: entry.hourly } : null,
        rsBeta: mtf ? { rs: mtf.rs, beta: mtf.beta } : null,
        tenDayConfidence: tenDayConf,
        optimumEntry: optimumRes,
        indicators: indCompact,
        daily: d ? d.slice(-SS_DAILY_BARS).map(function (c) { return { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }; }) : null,
        hourly: h1 ? h1.slice(-SS_HOURLY_BARS).map(function (c) { return { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }; }) : null
      };
      var next = [snap].concat(snapshots).slice(0, 200);
      persistSnapshots(next);
      showToast("Snapshot saved for " + ticker + ".NS", 0);
    } catch (e) {
      showToast("Snapshot failed: " + (e.message || "error"), 0);
    }
    setSavingSnap(false);
  }, [ticker, timeframe, savingSnap, snapshots, signals, mtf, quote]);

  var groupSnapshots = function () {
    var years = {};
    snapshots.forEach(function (snap) {
      var d = new Date(snap.savedAt);
      var yKey = String(d.getFullYear());
      var mKey = yKey + "-" + d.toLocaleString("en-IN", { month: "long" });
      var dayKey = mKey + "-" + d.getDate();
      var dayLabel = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      if (!years[yKey]) years[yKey] = {};
      if (!years[yKey][mKey]) years[yKey][mKey] = {};
      if (!years[yKey][mKey][dayKey]) years[yKey][mKey][dayKey] = { label: dayLabel, snaps: [] };
      years[yKey][mKey][dayKey].snaps.push(snap);
    });
    return years;
  };

  var filteredIndicators = useMemo(function () {
    if (category === "all") return ALL_INDS;
    return ALL_INDS.filter(function (ind) { return ind.cat === category; });
  }, [category]);

  var catKeys = ["all"].concat(ALL_CATS);

  var handleSubmit = function () {
    var t = inputVal.trim().toUpperCase().replace(/\.NS$/i, "").replace(/\.BO$/i, "");
    if (t) { setTicker(t); DF.clearCache(); }
  };

  var _fmt = function (v, d) { return v != null ? Number(v).toFixed(d != null ? d : 2) : "\u2014"; };
  var _fmtVal = function (def, val) {
    if (val === null || val === undefined) return "\u2014";
    if (typeof val === "object") {
      if (def.type === "macd") return _fmt(val.macd, 4);
      if (def.type === "stoch") return "%K: " + _fmt(val.k) + " / %D: " + _fmt(val.d);
      if (def.type === "bands") return _fmt(val.middle);
      if (def.type === "ichimoku") return _fmt(val.tenkan);
      if (def.type === "darvas") return val.boxTop ? _fmt(val.boxTop) + " / " + _fmt(val.boxBottom) : "\u2014";
      if (def.type === "smartMoney") return val.bos ? val.bos.replace("_", " ").toUpperCase() : "\u2014";
      if (def.type === "volumeProfile") return val.poc ? "POC: " + _fmt(val.poc) : "\u2014";
      if (def.type === "chandelier") return "L: " + _fmt(val.long) + " / S: " + _fmt(val.short);
      if (def.type === "heikinAshi") return (val.trend || "\u2014").toUpperCase();
      if (def.type === "fibonacci") return val.swingHigh ? _fmt(val.swingHigh) + " \u2014 " + _fmt(val.swingLow) : "\u2014";
      if (def.type === "pivotPoints") return val.classic ? "P: " + _fmt(val.classic.P) : "\u2014";
      if (def.type === "aroon") return "Up: " + _fmt(val.up) + " / Dn: " + _fmt(val.down);
      if (def.type === "vortex") return "+: " + _fmt(val.plus) + " / -: " + _fmt(val.minus);
      if (def.type === "rs") return val.rs ? "RS: " + _fmt(val.rs, 4) : "\u2014";
      if (def.type === "fractals") return (val.up ? val.up.length : 0) + "\u2191 / " + (val.down ? val.down.length : 0) + "\u2193";
      if (def.type === "zigZag") return val ? val.length + " pivots" : "\u2014";
      return "\u2014";
    }
    if (def.type === "volume") {
      if (val >= 1e9) return (val / 1e9).toFixed(2) + "B";
      if (val >= 1e7) return (val / 1e7).toFixed(2) + "Cr";
      if (val >= 1e5) return (val / 1e5).toFixed(2) + "L";
      if (val >= 1000) return (val / 1000).toFixed(1) + "K";
      return val.toString();
    }
    if (def.type === "squeeze") return val ? "Squeeze ON" : "Squeeze OFF";
    return _fmt(val);
  };

  var fmtNum = function (v) {
    if (v == null || isNaN(v)) return "\u2014";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e7) return (v / 1e7).toFixed(2) + "Cr";
    if (v >= 1e5) return (v / 1e5).toFixed(2) + "L";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return Number(v).toFixed(0);
  };

  var quoteCell = function (label, value, sub, color) {
    return React.createElement("div", { style: { padding: "8px 10px", borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 } },
      React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.3 } }, label),
      React.createElement("span", { style: { fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: color || "var(--text)" } }, value),
      sub ? React.createElement("span", { style: { fontSize: 9, fontFamily: "var(--font-mono)", color: color || "var(--text5)" } }, sub) : null
    );
  };

  var rsCell = function (label, value, sub) {
    var color = "var(--text)";
    if (value != null && !isNaN(value)) color = value < 0 ? "var(--loss)" : "var(--profit)";
    return React.createElement("div", { style: { minWidth: 130, padding: "8px 10px", borderRadius: 8, background: "var(--bg3)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 } },
      React.createElement("span", { style: { fontSize: 9, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.3 } }, label),
      React.createElement("span", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: value != null ? color : "var(--text6)" } }, value != null ? _fmt(value, 2) : "\u2014"),
      sub ? React.createElement("span", { style: { fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text5)" } }, sub) : null
    );
  };

  var renderCandleChart = function () {
    if (!candles || candles.length < 2) return null;
    var data = candles.filter(function (c) {
      return c && typeof c.o === "number" && !isNaN(c.o) && typeof c.h === "number" && !isNaN(c.h) &&
             typeof c.l === "number" && !isNaN(c.l) && typeof c.c === "number" && !isNaN(c.c);
    });
    if (data.length < 2) return null;
    var full = data;
    var defaultMax = timeframe === "5m" ? 390 : timeframe === "15m" ? 300 : timeframe === "1m" ? 200 : timeframe === "1h" ? 200 : 80;
    var maxCandles = zoomCandles != null ? Math.max(10, Math.min(full.length, zoomCandles)) : defaultMax;
    var visCount = Math.min(maxCandles, full.length);
    var maxPan = full.length - visCount;
    var effectivePan = Math.max(0, Math.min(maxPan, panOffset));
    var sliceEnd = full.length - effectivePan;
    var sliceStart = Math.max(0, sliceEnd - visCount);
    data = full.slice(sliceStart, sliceEnd);
    var startIdx = sliceStart;
    var oscOn = oscPane === "rsi" || oscPane === "macd";
    var oscH = oscOn ? 64 : 0;
    var volH = 24;
    var w = 700, padL = 50, padR = 10, padT = 14, padB = 50;
    var ch = 180;

    var _detectedRaw = TI && TI.detectCandlePatterns ? TI.detectCandlePatterns(full) : [];
    var _visPatterns = _detectedRaw.filter(function (p) {
      var vs = p.startBar - (full.length - data.length);
      var ve = p.bar - (full.length - data.length);
      return ve >= 0 && vs < data.length;
    });

    var cw = w - padL - padR;
    var h = padT + ch + 8 + volH + (oscOn ? 8 + oscH : 0) + padB;
    var priceBottom = padT + ch;
    var volTop = priceBottom + 8, volBottom = volTop + volH;
    var oscTop = oscOn ? volBottom + 8 : 0, oscBottom = oscTop + oscH;
    var allH = data.map(function (c) { return c.h; });
    var allL = data.map(function (c) { return c.l; });
    var hi = Math.max.apply(null, allH), lo = Math.min.apply(null, allL);
    if (isNaN(hi) || isNaN(lo)) return null;
    var range = hi - lo || 1;
    var barW = Math.max(1, Math.floor(cw / data.length) - 1);
    var gap = cw / data.length;
    var yScale = function (v) { return padT + ch - ((v - lo) / range) * ch; };

    var sma20 = TI.smaSeries(full, 20), sma50 = TI.smaSeries(full, 50), sma200 = TI.smaSeries(full, 200);
    var ema9 = TI.emaSeries(full, 9), ema21 = TI.emaSeries(full, 21);
    var vwapSeries = TI.vwap(full);
    var bbRes = TI.bollingerBands(full);
    var stSeries = TI.supertrend(full);
    var psarSeries = TI.parabolicSAR(full);
    var rsiSeries = TI.rsi(full, 14);
    var macdRes = TI.macd(full);
    var fibRes = TI.fibonacci(full);
    var pivotRes = TI.pivotPoints(full);
    var vpRes = TI.volumeProfile(full);

    function ts(series) { return series ? series.slice(startIdx) : []; }
    function linePts(series) {
      var pts = [];
      for (var i = 0; i < series.length; i++) {
        var v = series[i];
        if (v == null || isNaN(v)) continue;
        var y = yScale(v);
        if (y < padT - 4 || y > priceBottom + 4) continue;
        pts.push((padL + i * gap + gap / 2).toFixed(1) + "," + y.toFixed(1));
      }
      return pts.join(" ");
    }
    function lineEl(series, color, width, key) {
      var p = linePts(series);
      if (p.indexOf(" ") === -1) return null;
      return React.createElement("polyline", { key: key, points: p, fill: "none", stroke: color, strokeWidth: width || 1, opacity: 0.9 });
    }
    function levelLine(v, color, dash, label) {
      if (v == null || isNaN(v)) return null;
      var y = yScale(v);
      if (y < padT - 4 || y > priceBottom + 4) return null;
      return React.createElement("g", { key: "lvl" + label },
        React.createElement("line", { x1: padL, y1: y, x2: w - padR, y2: y, stroke: color, strokeWidth: 0.6, strokeDasharray: dash }),
        React.createElement("text", { x: padL + 3, y: y - 2, fontSize: 7, fill: color, fontFamily: "var(--font-mono)" }, label)
      );
    }

    var isIntra = timeframe !== "daily" && timeframe !== "weekly";
    var formatXLabel = function (ts) {
      if (ts == null) return "";
      var d;
      if (typeof ts === "number") {
        d = new Date(ts * 1000);
      } else {
        var s = String(ts).trim();
        if (s.indexOf("T") !== -1 || s.indexOf(":") !== -1) {
          d = new Date(s.indexOf("T") !== -1 ? s : s.replace(" ", "T"));
        } else {
          d = new Date(s + "T00:00:00");
        }
      }
      if (isNaN(d.getTime())) return "";
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      if (isIntra) {
        var h2 = d.getHours(), m = d.getMinutes();
        var ampm = h2 >= 12 ? "PM" : "AM";
        var h12 = h2 % 12 || 12;
        return months[d.getMonth()] + " " + d.getDate() + " " + h12 + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
      }
      return months[d.getMonth()] + " " + d.getDate();
    };

    var fmtY = function (v) {
      if (v == null || isNaN(v)) return "\u2014";
      return "\u20b9" + Number(v).toFixed(v >= 1000 ? 0 : 2);
    };

    var yLabel = "Price (\u20b9)";
    var xLabel = isIntra ? "Time" : "Date";

    var gridLines = [0, 0.25, 0.5, 0.75, 1].map(function (pct, gi) {
      var y = padT + ch * (1 - pct);
      var val = lo + range * pct;
      return React.createElement("g", { key: "g" + gi },
        React.createElement("line", { x1: padL, y1: y, x2: w - padR, y2: y, stroke: "var(--border)", strokeWidth: 0.5, strokeDasharray: "3,3" }),
        React.createElement("text", { x: padL - 4, y: y + 3, fontSize: 8, fill: "var(--text6)", textAnchor: "end", fontFamily: "var(--font-mono)" }, fmtY(val))
      );
    });

    var daySepEls = [];
    if (isIntra && data.length > 1) {
      var mode = (document.documentElement.getAttribute("data-mode") || "dark");
      var sepColor = mode === "light" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.35)";
      for (var si = 1; si < data.length; si++) {
        var prevDate = String(data[si - 1].t).substring(0, 10);
        var currDate = String(data[si].t).substring(0, 10);
        if (currDate !== prevDate) {
          var sx = padL + si * gap + gap / 2;
          daySepEls.push(React.createElement("line", { key: "ds" + si, x1: sx, y1: padT, x2: sx, y2: padT + ch, stroke: sepColor, strokeWidth: 0.5, strokeDasharray: "4,4" }));
        }
      }
    }

    var xTickCount = Math.min(6, data.length);
    var minLabelGap = isIntra ? 80 : 50;
    var xTickStep = Math.max(1, Math.ceil((minLabelGap / gap)));
    var xTicks = [];
    for (var xi = 0; xi < data.length; xi += xTickStep) {
      xTicks.push(xi);
    }
    if (xTicks[xTicks.length - 1] !== data.length - 1) xTicks.push(data.length - 1);

    var xTickEls = xTicks.map(function (idx) {
      var x = padL + idx * gap + gap / 2;
      var label = formatXLabel(data[idx].t);
      return React.createElement("text", { key: "xt" + idx, x: x, y: h - 18, fontSize: 8, fill: "var(--text6)", textAnchor: "middle", fontFamily: "var(--font-mono)" }, label);
    });

    var candleEls = data.map(function (c, ci) {
      var x = padL + ci * gap + gap / 2;
      var isUp = c.c >= c.o;
      var color = isUp ? "var(--profit)" : "var(--loss)";
      var bodyTop = yScale(Math.max(c.o, c.c));
      var bodyBot = yScale(Math.min(c.o, c.c));
      var bodyH = Math.max(1, bodyBot - bodyTop);
      return React.createElement("g", { key: ci },
        React.createElement("line", { x1: x, y1: yScale(c.h), x2: x, y2: yScale(c.l), stroke: color, strokeWidth: 1 }),
        React.createElement("rect", { x: x - barW / 2, y: bodyTop, width: barW, height: bodyH, fill: color, rx: 0.5 })
      );
    });

    var patternHighlightEls = [];
    var patternLabelEls = [];
    var patternColors = { bullish: "#22c55e", bearish: "#ef4444" };
    var placedLabelYs = [];
    var highestCandleY = yScale(hi);
    for (var pi = 0; pi < _visPatterns.length; pi++) {
      var pat = _visPatterns[pi];
      var pColor = patternColors[pat.type] || "#6b7280";
      var visStart = Math.max(0, pat.startBar - startIdx);
      var visEnd = Math.min(data.length - 1, pat.bar - startIdx);
      var x0 = padL + visStart * gap;
      var x1 = padL + visEnd * gap + gap;
      var bw = x1 - x0;
      var midX = x0 + bw / 2;

      patternHighlightEls.push(
        React.createElement("rect", { key: "ph_bg_" + pi, x: x0, y: padT, width: bw, height: ch, fill: pColor, opacity: 0.04, rx: 2 }),
        React.createElement("line", { key: "ph_ln_" + pi, x1: x0, y1: padT + ch, x2: x1, y2: padT + ch, stroke: pColor, strokeWidth: 2, opacity: 0.6 })
      );

      var lblText = pat.name;
      var lblWords = lblText.split(" ");
      var maxWordLen = 0;
      for (var wi = 0; wi < lblWords.length; wi++) { if (lblWords[wi].length > maxWordLen) maxWordLen = lblWords[wi].length; }
      var lblW = maxWordLen * 4.2 + 8;
      var lineH = 7;
      var lblLines = lblWords.length;
      var lblH = lblLines * lineH + 3;
      var lblY = highestCandleY - lblH - 3;
      var settled = false;
      while (!settled) {
        settled = true;
        for (var ly = 0; ly < placedLabelYs.length; ly++) {
          var prev = placedLabelYs[ly];
          var overlapX = Math.abs(midX - prev.x) < (lblW + prev.w) / 2 + 3;
          var overlapY = Math.abs(lblY - prev.y) < lblH + 2;
          if (overlapX && overlapY) { lblY = prev.y - lblH - 2; settled = false; break; }
        }
      }
      if (lblY < 2) lblY = 2;
      placedLabelYs.push({ x: midX, y: lblY, w: lblW });
      var bgX = midX - lblW / 2;
      var lblTSpan = [];
      for (var li = 0; li < lblWords.length; li++) {
        lblTSpan.push(React.createElement("tspan", { key: "ls" + pi + "_" + li, x: midX, dy: li === 0 ? "1em" : "1em" }, lblWords[li]));
      }
      patternLabelEls.push(
        React.createElement("rect", { key: "ph_lbl_bg_" + pi, x: bgX, y: lblY, width: lblW, height: lblH, rx: 3, fill: pColor, opacity: 0.85 }),
        React.createElement("text", { key: "ph_lbl_" + pi, x: midX, y: lblY + 1, fontSize: 6, fill: "#fff", textAnchor: "middle", fontWeight: 700, fontFamily: "var(--font-mono)" }, lblTSpan),
        React.createElement("line", { key: "ph_pin_" + pi, x1: midX, y1: lblY + lblH, x2: midX, y2: padT + ch, stroke: pColor, strokeWidth: 0.8, strokeDasharray: "2,3", opacity: 0.4 })
      );
    }

    var overlayEls = [];
    if (overlays.ma) {
      overlayEls.push(lineEl(ts(sma20), "#3b82f6", 1, "ma20"));
      overlayEls.push(lineEl(ts(sma50), "#a855f7", 1, "ma50"));
      overlayEls.push(lineEl(ts(sma200), "#f59e0b", 1, "ma200"));
      overlayEls.push(lineEl(ts(ema9), "#38bdf8", 1, "ema9"));
      overlayEls.push(lineEl(ts(ema21), "#22c55e", 1, "ema21"));
    }
    if (overlays.bb && bbRes) {
      overlayEls.push(lineEl(ts(bbRes.upper), "#94a3b8", 0.8, "bbu"));
      overlayEls.push(lineEl(ts(bbRes.middle), "#94a3b8", 0.8, "bbm"));
      overlayEls.push(lineEl(ts(bbRes.lower), "#94a3b8", 0.8, "bbl"));
    }
    if (overlays.vwap) overlayEls.push(lineEl(ts(vwapSeries), "#fb923c", 1, "vwap"));
    if (overlays.st) overlayEls.push(lineEl(ts(stSeries), "#ec4899", 1, "st"));
    if (overlays.sar) {
      var sarPts = [];
      ts(psarSeries).forEach(function (v, i) {
        if (v == null) return;
        var y = yScale(v);
        if (y < padT - 4 || y > priceBottom + 4) return;
        sarPts.push(React.createElement("circle", { key: "sar" + i, cx: padL + i * gap + gap / 2, cy: y, r: 1.6, fill: "#22d3ee" }));
      });
      if (sarPts.length) overlayEls.push(React.createElement("g", { key: "sargrp" }, sarPts));
    }
    if (overlays.lvl) {
      if (pivotRes && pivotRes.classic) {
        [["P", pivotRes.classic.P], ["R1", pivotRes.classic.R1], ["R2", pivotRes.classic.R2], ["S1", pivotRes.classic.S1], ["S2", pivotRes.classic.S2]].forEach(function (pp) {
          var el = levelLine(pp[1], "#fbbf24", "4,3", pp[0]);
          if (el) overlayEls.push(el);
        });
      }
      if (fibRes && fibRes.retrace) {
        [["100", fibRes.swingHigh], ["0.786", fibRes.retrace["0.786"]], ["0.618", fibRes.retrace["0.618"]], ["0.5", fibRes.retrace["0.5"]], ["0.382", fibRes.retrace["0.382"]], ["0", fibRes.swingLow]].forEach(function (pp) {
          var el = levelLine(pp[1], "#818cf8", "2,2", pp[0]);
          if (el) overlayEls.push(el);
        });
      }
      if (vpRes && vpRes.poc != null) {
        var el2 = levelLine(vpRes.poc, "#f472b6", "3,3", "POC");
        if (el2) overlayEls.push(el2);
        if (vpRes.vah != null) { var el3 = levelLine(vpRes.vah, "#a3a3a3", "3,3", "VAH"); if (el3) overlayEls.push(el3); }
        if (vpRes.val != null) { var el4 = levelLine(vpRes.val, "#a3a3a3", "3,3", "VAL"); if (el4) overlayEls.push(el4); }
      }
    }

    var oscEls = [];
    if (oscOn) {
      function paneLine(series, color, key, mapper) {
        var pts = [];
        for (var i = 0; i < series.length; i++) {
          var v = series[i];
          if (v == null || isNaN(v)) continue;
          var y = mapper(v);
          if (y < oscTop - 4 || y > oscBottom + 4) continue;
          pts.push((padL + i * gap + gap / 2).toFixed(1) + "," + y.toFixed(1));
        }
        if (pts.length < 2) return null;
        return React.createElement("polyline", { key: key, points: pts.join(" "), fill: "none", stroke: color, strokeWidth: 1 });
      }
      if (oscPane === "rsi") {
        var yOscR = function (v) { return oscTop + oscH - (v / 100) * oscH; };
        [30, 70].forEach(function (lv) {
          oscEls.push(React.createElement("line", { key: "r" + lv, x1: padL, y1: yOscR(lv), x2: w - padR, y2: yOscR(lv), stroke: "var(--border)", strokeWidth: 0.5, strokeDasharray: "3,3" }));
        });
        oscEls.push(React.createElement("text", { key: "rlbl", x: padL + 3, y: oscTop + 9, fontSize: 7, fill: "var(--text6)", fontFamily: "var(--font-mono)" }, "RSI(14)"));
        var rp = paneLine(ts(rsiSeries), "#22c55e", "rsiline", yOscR);
        if (rp) oscEls.push(rp);
      } else if (macdRes) {
        var mSer = ts(macdRes.macd), sSer = ts(macdRes.signal), hSer = ts(macdRes.histogram);
        var mVals = [];
        mSer.forEach(function (v) { if (v != null) mVals.push(v); });
        sSer.forEach(function (v) { if (v != null) mVals.push(v); });
        if (mVals.length) {
          var mAbs = 0;
          mVals.forEach(function (v) { if (Math.abs(v) > mAbs) mAbs = Math.abs(v); });
          var mRange = mAbs > 0 ? mAbs : 1;
          var yOscM = function (v) { return oscTop + oscH / 2 - (v / mRange) * (oscH / 2); };
          oscEls.push(React.createElement("line", { key: "m0", x1: padL, y1: yOscM(0), x2: w - padR, y2: yOscM(0), stroke: "var(--border)", strokeWidth: 0.5, strokeDasharray: "3,3" }));
          hSer.forEach(function (v, i) {
            if (v == null) return;
            var y0 = yOscM(0), yv = yOscM(v);
            var bw = Math.max(1, barW - 1);
            oscEls.push(React.createElement("rect", { key: "h" + i, x: padL + i * gap + gap / 2 - bw / 2, y: Math.min(y0, yv), width: bw, height: Math.max(1, Math.abs(y0 - yv)), fill: v >= 0 ? "var(--profit)" : "var(--loss)", opacity: 0.6 }));
          });
          oscEls.push(React.createElement("text", { key: "mlbl", x: padL + 3, y: oscTop + 9, fontSize: 7, fill: "var(--text6)", fontFamily: "var(--font-mono)" }, "MACD(12,26,9)"));
          var mp = paneLine(mSer, "#38bdf8", "macdl", yOscM);
          if (mp) oscEls.push(mp);
          var sp = paneLine(sSer, "#fb923c", "macds", yOscM);
          if (sp) oscEls.push(sp);
        }
      }
    }

    var legendItems = [];
    if (overlays.ma) { legendItems.push({ label: "EMA9", c: "#38bdf8" }, { label: "EMA21", c: "#22c55e" }, { label: "SMA20", c: "#3b82f6" }, { label: "SMA50", c: "#a855f7" }, { label: "SMA200", c: "#f59e0b" }); }
    if (overlays.bb) legendItems.push({ label: "BB(20,2)", c: "#94a3b8" });
    if (overlays.vwap) legendItems.push({ label: "VWAP", c: "#fb923c" });
    if (overlays.st) legendItems.push({ label: "ST", c: "#ec4899" });
    if (overlays.sar) legendItems.push({ label: "SAR", c: "#22d3ee" });
    if (overlays.lvl) legendItems.push({ label: "Pivot", c: "#fbbf24" }, { label: "Fib", c: "#818cf8" }, { label: "POC", c: "#f472b6" });
    var legendEl = legendItems.length ? React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6, fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text6)" } }, legendItems.map(function (it) {
      return React.createElement("span", { key: it.label, style: { display: "inline-flex", alignItems: "center", gap: 3 } },
        React.createElement("span", { style: { width: 8, height: 2, background: it.c, display: "inline-block" } }), it.label);
    })) : null;
    var isZoomed = zoomCandles != null && zoomCandles !== defaultMax;
    var zoomBar = React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text5)" } },
      React.createElement("span", { style: { cursor: "pointer", padding: "1px 5px", borderRadius: 3, background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--text4)" },
        onClick: function () { var cur = zoomCandles != null ? zoomCandles : defaultMax; setZoomCandles(Math.max(10, Math.round(cur * 0.7))); } }, "\u2212"),
      React.createElement("span", { style: { flex: 1, height: 3, borderRadius: 2, background: "var(--bg5)", position: "relative", cursor: "pointer" },
        onClick: function (e) { var r = e.currentTarget.getBoundingClientRect(); var pct = (e.clientX - r.left) / r.width; setZoomCandles(Math.max(10, Math.round(full.length * (1 - pct * 0.9)))); setPanOffset(0); } },
        React.createElement("span", { style: { position: "absolute", left: 0, top: 0, height: "100%", width: ((zoomCandles != null ? zoomCandles : defaultMax) / full.length * 100) + "%", borderRadius: 2, background: "var(--accent)", opacity: 0.6 } })
      ),
      React.createElement("span", { style: { cursor: "pointer", padding: "1px 5px", borderRadius: 3, background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--text4)" },
        onClick: function () { var cur = zoomCandles != null ? zoomCandles : defaultMax; setZoomCandles(Math.min(full.length, Math.round(cur * 1.4))); } }, "+"),
      React.createElement("span", null, data.length + "/" + full.length),
      isZoomed && React.createElement("span", { style: { cursor: "pointer", padding: "1px 4px", borderRadius: 3, background: "var(--bg4)", border: "1px solid var(--border)", color: "var(--accent)", fontSize: 8 },
        onClick: function () { setZoomCandles(null); setPanOffset(0); } }, "Reset")
    );

    var lastC = data[data.length - 1];
    var firstC = data[0];
    var priceColor = lastC.c >= firstC.c ? "var(--profit)" : "var(--loss)";
    var chartPct = firstC && firstC.c > 0 ? ((lastC.c - firstC.c) / firstC.c) * 100 : null;
    var chartPctColor = chartPct == null ? "var(--text6)" : chartPct >= 0 ? "var(--profit)" : "var(--loss)";

    var vMax = Math.max.apply(null, data.map(function (c) { return c.v || 0; })) || 1;
    var volEls = data.map(function (c, ci) {
      var x = padL + ci * gap + gap / 2;
      var v = c.v || 0;
      var vh = (v / vMax) * volH;
      var isUp = c.c >= c.o;
      var vcolor = isUp ? "var(--profit)" : "var(--loss)";
      return React.createElement("rect", { key: "vol" + ci, x: x - barW / 2, y: volBottom - vh, width: barW, height: Math.max(1, vh), fill: vcolor, opacity: 0.55, rx: 0.5 });
    });

    var hoverHitEls = data.map(function (c, ci) {
      var x = padL + ci * gap + gap / 2;
      return React.createElement("rect", { key: "hit" + ci, x: x - gap / 2, y: padT, width: gap, height: ch + 8 + volH, fill: "transparent", style: { cursor: "crosshair" },
        onMouseEnter: function () { setHoverCandle(ci); },
        onMouseLeave: function () { setHoverCandle(null); setMousePos(null); },
        onMouseMove: function (e) { var r = e.currentTarget.closest("svg").getBoundingClientRect(); setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top }); }
      });
    });

    var hoverEls = [];
    if (hoverCandle != null && hoverCandle >= 0 && hoverCandle < data.length) {
      var hc = data[hoverCandle];
      var hx = padL + hoverCandle * gap + gap / 2;
      hoverEls.push(
        React.createElement("line", { key: "hcross", x1: hx, y1: padT, x2: hx, y2: padT + ch, stroke: "var(--text6)", strokeWidth: 0.7, strokeDasharray: "3,3", opacity: 0.6 }),
        React.createElement("circle", { key: "hdot", cx: hx, cy: yScale(hc.c), r: 3, fill: hc.c >= hc.o ? "var(--profit)" : "var(--loss)", stroke: "#fff", strokeWidth: 1 })
      );
      if (mousePos) {
        var svgEl = document.querySelector && document.querySelector("svg[viewBox]");
        if (svgEl) {
          var svgRect = svgEl.getBoundingClientRect();
          var svgY = (mousePos.y / svgRect.height) * h;
          var clampedSvgY = Math.max(padT, Math.min(padT + ch, svgY));
          var hoverPrice = lo + ((padT + ch - clampedSvgY) / ch) * range;
          hoverEls.push(
            React.createElement("line", { key: "vcross", x1: padL, y1: clampedSvgY, x2: padL + cw, y2: clampedSvgY, stroke: "var(--text6)", strokeWidth: 0.7, strokeDasharray: "3,3", opacity: 0.6 }),
            React.createElement("rect", { key: "hprice_bg", x: 0, y: clampedSvgY - 7, width: padL - 2, height: 14, rx: 2, fill: "var(--bg4)", stroke: "var(--border)", strokeWidth: 0.5 }),
            React.createElement("text", { key: "hprice_tx", x: padL - 4, y: clampedSvgY + 3.5, fontSize: 8, fill: "var(--text4)", textAnchor: "end", fontFamily: "var(--font-mono)" }, _fmt(hoverPrice))
          );
        }
      }
    }

    var tooltipEl = null;
    if (hoverCandle != null && hoverCandle >= 0 && hoverCandle < data.length && mousePos) {
      var tc = data[hoverCandle];
      var tcIsUp = tc.c >= tc.o;
      var tcColor = tcIsUp ? "var(--profit)" : "var(--loss)";
      var tParts = String(tc.t || "").split(" ");
      var tDate = tParts[0] || "";
      var tTime = tParts[1] || "";
      var tDP = tDate.split("-");
      var tDateFmt = tDP.length === 3 ? tDP[2] + "/" + tDP[1] + "/" + tDP[0] : tDate;
      var ttx = mousePos.x + 14;
      var tty = mousePos.y - 10;
      if (ttx + 150 > w) ttx = mousePos.x - 160;
      if (tty < 2) tty = 2;
      if (tty + 100 > h) tty = h - 100;
      tooltipEl = React.createElement("div", { style: { position: "absolute", left: ttx, top: tty, background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px", fontSize: 10, fontFamily: "var(--font-mono)", lineHeight: 1.6, pointerEvents: "none", zIndex: 10, minWidth: 140, boxShadow: "0 2px 8px rgba(0,0,0,.3)" } },
        React.createElement("div", { style: { fontWeight: 700, color: "var(--text)", marginBottom: 2, fontSize: 11 } }, tDateFmt + (tTime ? " " + tTime : "")),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 8px", color: "var(--text5)" } },
          React.createElement("span", null, "O"),
          React.createElement("span", { style: { color: "var(--text2)", fontWeight: 600 } }, _fmt(tc.o)),
          React.createElement("span", null, "H"),
          React.createElement("span", { style: { color: "var(--text2)", fontWeight: 600 } }, _fmt(tc.h)),
          React.createElement("span", null, "L"),
          React.createElement("span", { style: { color: "var(--text2)", fontWeight: 600 } }, _fmt(tc.l)),
          React.createElement("span", null, "C"),
          React.createElement("span", { style: { color: tcColor, fontWeight: 700 } }, _fmt(tc.c)),
          React.createElement("span", null, "Vol"),
          React.createElement("span", { style: { color: "var(--text2)" } }, tc.v != null ? fmtNum(tc.v) : "\u2014")
        )
      );
    }

    function handleWheel(e) {
      e.preventDefault();
      var dir = e.deltaY > 0 ? 1 : -1;
      var cur = zoomCandles != null ? zoomCandles : defaultMax;
      var step = Math.max(5, Math.round(cur * 0.15));
      var next = Math.max(10, Math.min(full.length, cur + dir * step));
      setZoomCandles(next);
      setPanOffset(function (prev) { return Math.max(0, Math.min(full.length - next, prev)); });
    }
    function handleMouseDown(e) {
      if (e.button !== 0) return;
      setIsDragging(true);
      setDragStartX(e.clientX);
      setDragStartPan(panOffset);
    }
    function handleMouseMove(e) {
      if (!isDragging || dragStartX == null) return;
      var svgRect = e.currentTarget.querySelector("svg").getBoundingClientRect();
      var pxPerCandle = svgRect.width / visCount;
      var dx = dragStartX - e.clientX;
      var candleDx = Math.round(dx / pxPerCandle);
      var newPan = Math.max(0, Math.min(full.length - visCount, dragStartPan + candleDx));
      setPanOffset(newPan);
    }
    function handleMouseUp() { setIsDragging(false); setDragStartX(null); setDragStartPan(null); }

    return React.createElement("div", { style: { background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 12px 8px", marginBottom: 12, overflow: "hidden", position: "relative", cursor: isDragging ? "grabbing" : "default" }, onWheel: handleWheel, onMouseDown: handleMouseDown, onMouseMove: handleMouseMove, onMouseUp: handleMouseUp, onMouseLeave: handleMouseUp },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
        React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
          React.createElement("span", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: priceColor } }, "\u20b9" + _fmt(lastC.c)),
          React.createElement("span", { title: "% change from first candle to last candle in this " + timeframe + " chart", style: { fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: chartPctColor, padding: "1px 6px", borderRadius: 5, background: chartPctColor === "var(--text6)" ? "transparent" : chartPct >= 0 ? "rgba(22,163,74,.1)" : "rgba(239,68,68,.1)", border: "1px solid " + (chartPctColor === "var(--text6)" ? "transparent" : chartPct >= 0 ? "rgba(22,163,74,.3)" : "rgba(239,68,68,.3)") } }, chartPct != null ? (chartPct >= 0 ? "+" : "") + chartPct.toFixed(2) + "%" : "\u2014"),
          React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, "O: " + _fmt(lastC.o) + " H: " + _fmt(lastC.h) + " L: " + _fmt(lastC.l) + " C: " + _fmt(lastC.c))
        )
      ),
      legendEl,
      zoomBar,
      React.createElement("svg", { viewBox: "0 0 " + w + " " + h, style: { width: "100%", height: "auto", cursor: isDragging ? "grabbing" : "crosshair" } },
        React.createElement("text", { x: 8, y: padT + ch / 2, fontSize: 8, fill: "var(--text6)", textAnchor: "middle", fontFamily: "var(--font-mono)", transform: "rotate(-90, 8, " + (padT + ch / 2) + ")" }, yLabel),
        React.createElement("text", { x: padL + cw / 2, y: h - 2, fontSize: 8, fill: "var(--text6)", textAnchor: "middle", fontFamily: "var(--font-mono)" }, xLabel),
        gridLines,
        daySepEls,
        overlayEls,
        patternHighlightEls,
        candleEls,
        hoverEls,
        patternLabelEls,
        React.createElement("line", { x1: padL, y1: volTop - 4, x2: w - padR, y2: volTop - 4, stroke: "var(--border)", strokeWidth: 0.5, strokeDasharray: "2,2" }),
        volEls,
        oscEls,
        xTickEls,
        hoverHitEls
      ),
      tooltipEl
    );
  };

  var renderGauge = function () {
    if (!signals || !signals._score) return null;
    var sc = signals._score;
    if (sc.total === 0) return null;
    var bullPct = sc.bull / sc.total * 100;
    var neutralPct = sc.neutral / sc.total * 100;
    var bearPct = sc.bear / sc.total * 100;
    var col = sc.bull > sc.bear ? "var(--profit)" : sc.bear > sc.bull ? "var(--loss)" : "#6b7280";
    return React.createElement("div", {
      style: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, marginBottom: 12, background: "var(--bg4)", border: "1px solid var(--border)" }
    },
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--text4)", marginBottom: 4 } }, "Overall Signal"),
        React.createElement("div", { style: { height: 6, borderRadius: 3, background: "var(--bg5)", overflow: "hidden", display: "flex" } },
          bullPct > 0 && React.createElement("div", { style: { width: bullPct + "%", height: "100%", background: "var(--profit)" } }),
          neutralPct > 0 && React.createElement("div", { style: { width: neutralPct + "%", height: "100%", background: "#9ca3af" } }),
          bearPct > 0 && React.createElement("div", { style: { width: bearPct + "%", height: "100%", background: "var(--loss)" } })
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: "var(--text5)" } },
          React.createElement("span", null, sc.bull + " Bull"),
          React.createElement("span", null, sc.neutral + " Neutral"),
          React.createElement("span", null, sc.bear + " Bear")
        )
      ),
      React.createElement("div", { style: { width: 48, height: 48, borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: col + "15", border: "2px solid " + col, flexShrink: 0 } },
        React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "var(--profit)", lineHeight: 1.2, fontFamily: "var(--font-mono)" } }, sc.bull),
        React.createElement("span", { style: { fontSize: 8, fontWeight: 600, color: "#6b7280", lineHeight: 1.2 } }, sc.neutral),
        React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "var(--loss)", lineHeight: 1.2, fontFamily: "var(--font-mono)" } }, sc.bear)
      )
    );
  };

  var renderMtfCard = function () {
    if (!mtf && !mtfLoading) return null;
    var entryScore = null, entryDec = null;
    if (mtf && mtf.entry) { entryScore = mtf.entry.finalScore; entryDec = mtf.entry.decision; }
    return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 10, marginBottom: 12, background: "var(--bg4)", border: "1px solid var(--border)" } },
      React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--text4)" } }, "Multi-Timeframe Context (W/D/H + Nifty50)"),
      !mtf && mtfLoading && React.createElement("div", { style: { fontSize: 10, color: "var(--text6)" } }, "Loading..."),
      mtf && React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" } },
        React.createElement("div", { style: { flex: 1, minWidth: 220 } },
          React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 } }, "Entry Score"),
          entryScore != null
            ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } },
                React.createElement("span", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-mono)", color: entryDec && entryDec.color ? entryDec.color : "var(--text)" } }, entryScore),
                entryDec && React.createElement("span", { style: { fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: (entryDec.color || "#6b7280") + "22", border: "1px solid " + (entryDec.color || "#6b7280"), color: entryDec.color || "var(--text5)" } }, entryDec.label)
              )
            : React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", marginBottom: 6 } }, "Insufficient data"),
          entryScore != null && React.createElement("div", { style: { display: "flex", gap: 8 } },
            [["W", mtf.entry.weekly], ["D", mtf.entry.daily], ["H", mtf.entry.hourly]].map(function (t) {
              var s = t[1];
              var total = s && s.total != null ? s.total : null;
              var _cbCfg = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? window.TechIndicators.getScoreConfig().classification : null;
              var _cbSB = _cbCfg ? _cbCfg.strongBuy : 80, _cbB = _cbCfg ? _cbCfg.buy : 65, _cbW = _cbCfg ? _cbCfg.watchlist : 50, _cbN = _cbCfg ? _cbCfg.neutral : 35;
              return React.createElement("div", { key: t[0], style: { flex: 1 } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 8, color: "var(--text6)", fontFamily: "var(--font-mono)" } },
                  React.createElement("span", null, t[0]),
                  React.createElement("span", null, total != null ? total : "\u2014")
                ),
                React.createElement("div", { style: { height: 4, borderRadius: 2, background: "var(--bg5)", marginTop: 2, overflow: "hidden" } },
                  total != null && React.createElement("div", { style: { width: Math.min(100, Math.max(0, total)) + "%", height: "100%", background: total >= _cbSB ? "var(--profit)" : total >= _cbB ? "#22c55e" : total >= _cbW ? "#fbbf24" : total >= _cbN ? "#fb923c" : "var(--loss)", borderRadius: 2 } })
                )
              );
            })
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" } },
          rsCell("RS vs Nifty50", mtf.rs ? mtf.rs.rs : null, mtf.rs && mtf.rs.mansfield != null ? "Mansfield: " + (mtf.rs.mansfield > 0 ? "+" : "") + _fmt(mtf.rs.mansfield, 2) + "%" : null),
          rsCell("Beta (30d)", mtf.beta, null)
        )
      )
    );
  };

  var ssPrice = function (v) { return v == null ? "\u2014" : "\u20b9" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var formatSnapshotIndValue = function (k, v) {
    if (v == null) return "\u2014";
    if (typeof v === "object") {
      if (k === "macd") return v.macd != null ? v.macd.toFixed(3) : "\u2014";
      if (k === "stochRSI") return v.k != null ? v.k.toFixed(1) + " / " + v.d.toFixed(1) : "\u2014";
      if (k === "bb") return v.upper != null ? v.upper.toFixed(2) + " / " + v.lower.toFixed(2) : "\u2014";
      if (k === "week52HL") return v.pctFromHigh != null ? (v.pctFromHigh > 0 ? "+" : "") + v.pctFromHigh.toFixed(1) + "% from high" : "\u2014";
      return "\u2014";
    }
    if (typeof v === "number") {
      if (k === "atr_14") return v.toFixed(2);
      if (k === "adx_14") return v.toFixed(1);
      if (k === "obv") return v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0);
      if (k === "vwap" || k === "supertrend" || k === "psar" || k === "ema_9" || k === "ema_21" || k === "ema_50" || k === "sma_20" || k === "sma_50") return ssPrice(v);
      return v.toFixed(2);
    }
    return String(v);
  };

  var snapshotCard = function (snap) {
    var isOpen = !!snapOpen[snap.id];
    var r = snap.entryScore;
    var td = snap.tenDayConfidence;
    var oe = snap.optimumEntry;
    var overall = snap.overall;
    var ind = snap.indicators;
    var confScore = td && td.confidence != null ? td.confidence : null;
    var confLog = td && td.confidenceLognormal != null ? td.confidenceLognormal : null;
    var confEmp = td && td.confidenceEmpirical != null ? td.confidenceEmpirical : null;
    function ssConfColor(v) { return v != null ? (v >= 70 ? "#16a34a" : v >= 40 ? "#d97706" : "#dc2626") : "var(--text5)"; }
    var confTone = ssConfColor(confScore);
    var entryTone = r && r.decision && r.decision.color ? r.decision.color : "var(--text5)";
    var oeConf = oe && oe.entryConfidence != null ? oe.entryConfidence : null;
    var oeTone = oeConf != null ? (oeConf >= 70 ? "#16a34a" : oeConf >= 40 ? "#d97706" : "#dc2626") : "var(--text5)";
    var _hdVal = (TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10;
    var confLabel = confScore == null ? "No " + _hdVal + "-day read"
      : confScore >= 70 ? "Strong odds \u2014 +4% likely in 10 sessions"
      : confScore >= 40 ? "Moderate odds" : "Low odds";
    var oeLabel = oe == null ? null
      : oe.components && oe.components.marketClosed ? "Market closed"
      : oe.overextended && oe.discountPct > 0 ? "Wait for pullback"
      : oe.discountPct > 0 ? "Limit " + oe.discountPct + "% below" : "Enter at market";
    var oeFillProb = oe && !oe.components.marketClosed && oe.probToTodayLowEmpirical != null ? oe.probToTodayLowEmpirical : null;
    if (oeLabel && oeFillProb != null) oeLabel += " \u00b7 \u2248" + oeFillProb + "% today-low fill";
    var hasCharts = (snap.daily && snap.daily.length > 1) || (snap.hourly && snap.hourly.length > 1);

    var scoreTile = function (label, value, sub, color) {
      return React.createElement("div", { style: { flex: 1, minWidth: 130, padding: "8px 10px", borderRadius: 8, background: "var(--bg5)", border: "1px solid var(--border)" } },
        React.createElement("div", { style: { fontSize: 8.5, fontWeight: 600, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, label),
        React.createElement("div", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: color || "var(--text)", lineHeight: 1.1 } }, value),
        sub ? React.createElement("div", { style: { fontSize: 9, color: "var(--text5)", marginTop: 3, fontFamily: "var(--font-mono)" } }, sub) : null
      );
    };

    var overallEl = null;
    if (overall && overall.total > 0) {
      var bullPct = overall.bull / overall.total * 100;
      var neutralPct = overall.neutral / overall.total * 100;
      var bearPct = overall.bear / overall.total * 100;
      overallEl = React.createElement("div", { style: { marginBottom: 8 } },
        React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 } }, "Overall Signal"),
        React.createElement("div", { style: { height: 5, borderRadius: 3, background: "var(--bg5)", overflow: "hidden", display: "flex" } },
          bullPct > 0 && React.createElement("div", { style: { width: bullPct + "%", height: "100%", background: "#22c55e" } }),
          neutralPct > 0 && React.createElement("div", { style: { width: neutralPct + "%", height: "100%", background: "#9ca3af" } }),
          bearPct > 0 && React.createElement("div", { style: { width: bearPct + "%", height: "100%", background: "#ef4444" } })
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 8, color: "var(--text5)" } },
          React.createElement("span", null, overall.bull + " Bull"),
          React.createElement("span", null, overall.neutral + " Neutral"),
          React.createElement("span", null, overall.bear + " Bear")
        )
      );
    }

    var tfRow = null;
    if (r && (r.weekly || r.daily || r.hourly)) {
      tfRow = React.createElement("div", { style: { display: "flex", gap: 5, marginTop: 8 } },
        [["Weekly", r.weekly], ["Daily", r.daily], ["Hourly", r.hourly]].map(function (t) {
          var s = t[1];
          var total = s && s.total != null ? s.total : null;
          var col = s && s.decision && s.decision.color ? s.decision.color : "var(--text5)";
          return React.createElement("div", { key: t[0], style: { flex: 1, padding: "4px 6px", borderRadius: 6, background: "var(--bg4)", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 8, fontWeight: 600, color: "var(--text6)" } }, t[0]),
            React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: col, fontFamily: "var(--font-heading)" } }, total != null ? total : "\u2014")
          );
        })
      );
    }

    var chartsEl = null;
    if (isOpen && hasCharts) {
      chartsEl = React.createElement("div", { style: { marginTop: 8 } },
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 } },
          snap.daily && snap.daily.length > 1 && React.createElement("div", { style: { padding: 8, borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)" } },
            React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 } }, "Daily \u00b7 last " + snap.daily.length + " sessions"),
            renderMiniCandles(snap.daily, { max: SS_DAILY_BARS })
          ),
          snap.hourly && snap.hourly.length > 1 && React.createElement("div", { style: { padding: 8, borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)" } },
            React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 } }, "Hourly \u00b7 last " + snap.hourly.length + " bars"),
            renderMiniCandles(snap.hourly, { max: SS_HOURLY_BARS })
          )
        )
      );
    }

    var indEl = null;
    if (isOpen && ind) {
      var rows = [];
      SS_IND_KEYS.forEach(function (pair) {
        var k = pair[0];
        var v = ind[k];
        if (v === null || v === undefined) return;
        rows.push(React.createElement("div", { key: k, style: { padding: "5px 7px", borderRadius: 6, background: "var(--bg4)", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 } },
          React.createElement("span", { style: { fontSize: 8.5, color: "var(--text6)", fontWeight: 600 } }, pair[1]),
          React.createElement("span", { style: { fontSize: 9.5, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text2)" } }, formatSnapshotIndValue(k, v))
        ));
      });
      indEl = React.createElement("div", { style: { marginTop: 8 } },
        React.createElement("div", { style: { fontSize: 8, fontWeight: 700, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 } }, "Indicators (Daily)"),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 5 } }, rows)
      );
    }

    return React.createElement("div", { key: snap.id, style: { padding: 12, borderRadius: 10, background: "var(--bg4)", border: "1px solid var(--border)", marginBottom: 8 } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, snap.ticker + ".NS"),
          React.createElement("div", { style: { fontSize: 9.5, color: "var(--text6)", marginTop: 2 } }, "\u23f0 " + new Date(snap.savedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })),
          React.createElement("div", { style: { fontSize: 9.5, color: "var(--text6)", marginTop: 1 } }, "\u2022 " + ssPrice(snap.currentPrice) + " \u00b7 view: " + (snap.timeframe || "daily"))
        ),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
          r && React.createElement("div", { textAlign: "right" },
            React.createElement("div", { style: { fontSize: 8, color: "var(--text5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 } }, "Entry Score"),
            React.createElement("div", { style: { fontSize: 18, fontWeight: 900, color: entryTone, fontFamily: "var(--font-heading)", lineHeight: 1 } }, r.finalScore != null ? r.finalScore : "\u2014")
          ),
           React.createElement("div", { onClick: function () { deleteSnapshot(snap.id); }, style: { cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--text6)", title: "Delete snapshot", display: "inline-flex" } }, Ico.x(13))
        )
      ),
      overallEl,
      React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 } },
        scoreTile("Entry Score", r ? (r.finalScore != null ? r.finalScore : "\u2014") : "\u2014", r && r.decision ? r.decision.label : "\u2014", entryTone),
        confLog != null && scoreTile("Conf 10DLN", confLog + "/100", confLabel, ssConfColor(confLog)),
        confEmp != null && scoreTile("Conf 10DEM", confEmp + "/100", td && td.components ? (td.components.empiricalMethod === 'empirical' ? "Empirical (" + td.components.empiricalSampleCount + " samples)" : "Lognormal fallback") : "", ssConfColor(confEmp)),
        confLog == null && confEmp == null && scoreTile("Conf. Next 10D", confScore != null ? confScore + "/100" : "\u2014", confLabel, confTone),
        scoreTile("Optimum Entry", oe ? ssPrice(oe.optimumEntryPrice) : "\u2014", oeLabel, oeTone)
      ),
      tfRow,
      React.createElement("div", { style: { display: "flex", gap: 12, justifyContent: "center", marginTop: 8 } },
        React.createElement("div", { onClick: function () { setSnapOpen(function (p) { var n = Object.assign({}, p); n[snap.id] = !n[snap.id]; return n; }); }, style: { fontSize: 9, color: "var(--accent)", cursor: "pointer", fontWeight: 600 } },
          React.createElement(React.Fragment, null, isOpen ? Ico.chevronUp(10) : Ico.chevronDown(10), " ", isOpen ? "Hide Details" : "Show Details")
        )
      ),
      isOpen && chartsEl,
      isOpen && indEl
    );
  };

  var renderSnapshots = function () {
    var grouped = groupSnapshots();
    var yKeys = Object.keys(grouped).sort().reverse();
    if (yKeys.length === 0) return React.createElement("div", { style: { textAlign: "center", padding: 30, color: "var(--text6)", fontSize: 12 } }, "No saved snapshots yet.");
    return yKeys.map(function (yKey) {
      var months = grouped[yKey];
      var isYExp = snapYear === yKey;
      var totalSnaps = Object.values(months).reduce(function (a, m) { return a + Object.values(m).reduce(function (b, d) { return b + d.snaps.length; }, 0); }, 0);
      return React.createElement("div", { key: yKey, style: { marginBottom: 10, borderRadius: 10, background: "var(--bg3)", border: "1px solid var(--border)", overflow: "hidden" } },
        React.createElement("div", { onClick: function () { setSnapYear(isYExp ? null : yKey); }, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", cursor: "pointer", background: isYExp ? "var(--bg4)" : "transparent" } },
          React.createElement("span", { style: { fontSize: 13, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)" } }, (isYExp ? "\u25be " : "\u25b8 ") + yKey),
          React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, totalSnaps + " snapshot" + (totalSnaps !== 1 ? "s" : ""))
        ),
        isYExp && Object.keys(months).sort().reverse().map(function (mKey) {
          var days = months[mKey];
          var isMExp = snapMonth === mKey;
          var mSnaps = Object.values(days).reduce(function (a, d) { return a + d.snaps.length; }, 0);
          return React.createElement("div", { key: mKey, style: { borderTop: "1px solid var(--border)" } },
            React.createElement("div", { onClick: function () { setSnapMonth(isMExp ? null : mKey); }, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px 8px 28px", cursor: "pointer", background: isMExp ? "var(--bg4)" : "transparent" } },
              React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: "var(--text)" } }, (isMExp ? "\u25be " : "\u25b8 ") + mKey.split("-").slice(1).join("-")),
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement("span", { style: { fontSize: 10, color: "var(--text5)", fontWeight: 600 } }, mSnaps + " snap" + (mSnaps !== 1 ? "s" : "")),
                React.createElement("span", { onClick: async function (e) { e.stopPropagation(); if (await showConfirm("Delete all " + mSnaps + " snapshot" + (mSnaps !== 1 ? "s" : "") + " in " + mKey.split("-").slice(1).join("-") + "?")) deleteSnapshotsWhere(function (s) { var d = new Date(s.savedAt); return String(d.getFullYear()) + "-" + d.toLocaleString("en-IN", { month: "long" }) === mKey; }); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, mSnaps === 1 ? "Delete" : "Delete All")
              )
            ),
            isMExp && Object.keys(days).sort().reverse().map(function (dayKey) {
              var day = days[dayKey];
              var isDExp = snapDay === dayKey;
              return React.createElement("div", { key: dayKey, style: { borderTop: "1px solid var(--border)" } },
                React.createElement("div", { onClick: function () { setSnapDay(isDExp ? null : dayKey); }, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 14px 6px 42px", cursor: "pointer", background: isDExp ? "var(--bg4)" : "transparent" } },
                  React.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "var(--text3)" } }, (isDExp ? "\u25be " : "\u25b8 ") + day.label),
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                    React.createElement("span", { style: { fontSize: 9, color: "var(--text5)" } }, day.snaps.length + " snap" + (day.snaps.length !== 1 ? "s" : "")),
                    React.createElement("span", { onClick: async function (e) { e.stopPropagation(); if (await showConfirm("Delete all " + day.snaps.length + " snapshot" + (day.snaps.length !== 1 ? "s" : "") + " on " + day.label + "?")) deleteSnapshotsWhere(function (s) { var d = new Date(s.savedAt); var dk = mKey + "-" + d.getDate(); return dk === dayKey; }); }, style: { fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", whiteSpace: "nowrap" } }, day.snaps.length === 1 ? "Delete" : "Delete All")
                  )
                ),
                isDExp && React.createElement("div", { style: { padding: "6px 14px 6px 56px" } },
                  day.snaps.map(function (snap) { return snapshotCard(snap); })
                )
              );
            })
          );
        })
      );
    });
  };

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14, alignItems: "center" } },
      React.createElement("input", {
        type: "text", value: inputVal, placeholder: "Enter ticker (e.g. RELIANCE, TCS, INFY)",
        onChange: function (e) { setInputVal(e.target.value); },
        onKeyDown: function (e) { if (e.key === "Enter") handleSubmit(); },
        style: { flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 600, outline: "none" }
      }),
      React.createElement("button", {
        onClick: handleSubmit, disabled: loading || !inputVal.trim(),
        className: "stx-btn stx-btn-primary",
        style: { padding: "10px 18px", fontSize: 12, fontWeight: 700, cursor: loading ? "wait" : "pointer", whiteSpace: "nowrap" }
      }, loading ? "Loading..." : "Analyze")
    ),

    !ticker && React.createElement("div", { style: { textAlign: "center", padding: "60px 20px", color: "var(--text6)", fontSize: 13 } },
      "Enter a stock ticker above and click Analyze to view technical indicators and candlestick chart."
    ),

    ticker && React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-heading)" } }, ticker + ".NS"),
          lastUpdated && React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", marginTop: 2 } },
            timeframe + " \u00b7 " + lastUpdated.toLocaleTimeString() + (dataSource ? " \u00b7 " + dataSource : "")
          )
        ),
        React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
          React.createElement("div", { style: { display: "flex", gap: 2, background: "var(--bg4)", borderRadius: 6, padding: 2 } },
            TF_DEFS.map(function (tf) {
              return React.createElement("button", {
                key: tf.key, onClick: function () { setTimeframe(tf.key); DF.clearCache(); },
                style: { padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: timeframe === tf.key ? 700 : 500, border: "none", cursor: "pointer", background: timeframe === tf.key ? "var(--accent)" : "transparent", color: timeframe === tf.key ? "#fff" : "var(--text5)", transition: "all .15s" }
              }, tf.label);
            })
          ),
          React.createElement("button", {
            onClick: function () { setAutoRefresh(!autoRefresh); },
            style: { padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid " + (autoRefresh ? "rgba(22,163,74,.4)" : "var(--border)"), background: autoRefresh ? "rgba(22,163,74,.1)" : "var(--bg4)", color: autoRefresh ? "var(--profit)" : "var(--text5)", cursor: "pointer" }
          }, autoRefresh ? React.createElement(React.Fragment, null, Ico.dot(7, "#22c55e"), " Live") : React.createElement(React.Fragment, null, Ico.dotOutline(7, "var(--text5)"), " Auto")),
          React.createElement("button", {
            onClick: function () { DF.clearCache(); setRefreshTick(function (t) { return t + 1; }); },
            disabled: loading,
            style: { padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid var(--border)", background: "var(--bg4)", color: "var(--text5)", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1 }
          }, loading ? "..." : Ico.refresh(14)),
          React.createElement("button", {
            onClick: saveSnapshot, disabled: savingSnap || loading || !candles,
            title: "Capture current chart, signal, entry score, " + ((TI.getScoreConfig && TI.getScoreConfig().horizonDays) || 10) + "-day confidence and optimum entry",
            style: { padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, border: "1px solid rgba(139,92,246,.4)", background: savingSnap ? "var(--bg4)" : "rgba(139,92,246,.1)", color: "#a78bfa", cursor: savingSnap || loading || !candles ? "wait" : "pointer", opacity: savingSnap || loading || !candles ? 0.6 : 1, whiteSpace: "nowrap" }
          }, savingSnap ? React.createElement(React.Fragment, null, Ico.hourglass(13, "#f59e0b"), " Saving...") : React.createElement(React.Fragment, null, Ico.camera(13), " Snapshot"))
        )
      ),
      error && React.createElement("div", { style: { padding: "8px 12px", borderRadius: 8, marginBottom: 10, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", fontSize: 11, color: "var(--loss)" } }, error),
      loading && !candles && React.createElement("div", { style: { textAlign: "center", padding: 30, color: "var(--text6)", fontSize: 12 } }, "Fetching data..."),
      candles && React.createElement("div", null,
        quote && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6, marginBottom: 10 } },
          quoteCell("Live", "\u20b9" + _fmt(quote.price), quote.change != null ? (quote.change >= 0 ? "+" : "") + _fmt(quote.change, 2) + " (" + (quote.changePercent >= 0 ? "+" : "") + _fmt(quote.changePercent, 2) + "%)" : null, quote.change != null ? (quote.change >= 0 ? "var(--profit)" : "var(--loss)") : "var(--text)"),
          quoteCell("Day Range", quote.dayLow != null && quote.dayHigh != null ? _fmt(quote.dayLow) + " \u2013 " + _fmt(quote.dayHigh) : "\u2014", null, "var(--text)"),
          quoteCell("52W Range", quote.low52 != null && quote.high52 != null ? _fmt(quote.low52) + " \u2013 " + _fmt(quote.high52) : "\u2014", null, "var(--text)"),
          quoteCell("Mkt Cap", quote.marketCap != null ? fmtNum(quote.marketCap) : "\u2014", null, "var(--text)"),
          quoteCell("P/E", quote.pe != null ? _fmt(quote.pe, 2) : "\u2014", null, "var(--text)"),
          quoteCell("Volume", quote.volume != null ? fmtNum(quote.volume) : "\u2014", quote.avgVolume != null ? "Avg: " + fmtNum(quote.avgVolume) : null, "var(--text)")
        ),
        React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 } },
          React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: "var(--text6)" } }, "Overlays:"),
          CHART_OVERLAY_DEFS.map(function (od) {
            var active = overlays[od.key];
            return React.createElement("button", {
              key: od.key,
              onClick: function () { setOverlays(function (o) { var n = Object.assign({}, o); n[od.key] = !n[od.key]; return n; }); },
              style: { padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: active ? 700 : 500, border: "none", cursor: "pointer", background: active ? "var(--accent)" : "var(--bg4)", color: active ? "#fff" : "var(--text5)", transition: "all .15s" }
            }, od.label);
          }),
          React.createElement("button", {
            key: "ovall",
            onClick: function () { setOverlays({ ma: true, bb: true, vwap: true, st: true, sar: true, lvl: true }); },
            style: { padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: CHART_OVERLAY_DEFS.every(function (od) { return overlays[od.key]; }) ? 700 : 500, border: "1px solid var(--border)", cursor: "pointer", background: CHART_OVERLAY_DEFS.every(function (od) { return overlays[od.key]; }) ? "var(--accent)" : "var(--bg4)", color: CHART_OVERLAY_DEFS.every(function (od) { return overlays[od.key]; }) ? "#fff" : "var(--text5)", transition: "all .15s" }
          }, "All"),
          React.createElement("button", {
            key: "ovnone",
            onClick: function () { setOverlays({ ma: false, bb: false, vwap: false, st: false, sar: false, lvl: false }); },
            style: { padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: CHART_OVERLAY_DEFS.every(function (od) { return !overlays[od.key]; }) ? 700 : 500, border: "1px solid var(--border)", cursor: "pointer", background: CHART_OVERLAY_DEFS.every(function (od) { return !overlays[od.key]; }) ? "var(--accent)" : "var(--bg4)", color: CHART_OVERLAY_DEFS.every(function (od) { return !overlays[od.key]; }) ? "#fff" : "var(--text5)", transition: "all .15s" }
          }, "None"),
          React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: "var(--text6)", marginLeft: 8 } }, "Pane:"),
          CHART_OSC_DEFS.map(function (od) {
            var active = oscPane === od.key;
            return React.createElement("button", {
              key: od.key,
              onClick: function () { setOscPane(od.key); },
              style: { padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: active ? 700 : 500, border: "none", cursor: "pointer", background: active ? "var(--accent)" : "var(--bg4)", color: active ? "#fff" : "var(--text5)", transition: "all .15s" }
            }, od.label);
          })
        ),
        renderCandleChart(),
        renderGauge(),
        renderMtfCard(),
        React.createElement(PatternMiningPanel, { candles: candles, timeframe: timeframe }),
        React.createElement(TenDayConfidencePanel, { ticker: ticker }),
        React.createElement(OptimumEntryPanel, { ticker: ticker, entryScoreContext: mtf && mtf.entry ? buildEntryScoreContext(mtf.entry) : null }),
        React.createElement("div", { style: { display: "flex", gap: 3, marginBottom: 10, flexWrap: "wrap" } },
          catKeys.map(function (cat) {
            var label = cat === "all" ? "All" : cat;
            var count = cat === "all" ? filteredIndicators.length : filteredIndicators.filter(function (i) { return i.cat === cat; }).length;
            var active = category === cat;
            return React.createElement("button", {
              key: cat, onClick: function () { setCategory(cat); },
              style: { padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: active ? 700 : 500, border: "none", cursor: "pointer", background: active ? "var(--accent)" : "var(--bg4)", color: active ? "#fff" : "var(--text5)", transition: "all .15s" }
            }, label + " (" + count + ")");
          })
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 } },
          filteredIndicators.map(function (def) {
            var val = indicators ? indicators[def.key] : undefined;
            if (val === null || val === undefined) return null;
            var sig = signals ? signals[def.key] || null : null;
            var sigStyle = sig ? SIGNAL_COLORS[sig] || SIGNAL_COLORS.neutral : null;
            var cardBg = "var(--bg4)", cardBorderLeft = "none";
            if (sig === "bullish") { cardBg = "rgba(22,163,74,.06)"; cardBorderLeft = "3px solid var(--profit)"; }
            else if (sig === "bearish") { cardBg = "rgba(239,68,68,.06)"; cardBorderLeft = "3px solid var(--loss)"; }
            else if (sig === "overbought") { cardBg = "rgba(234,88,12,.05)"; cardBorderLeft = "3px solid var(--warn)"; }
            else if (sig === "oversold") { cardBg = "rgba(37,99,235,.05)"; cardBorderLeft = "3px solid var(--info)"; }
            else if (sig === "trending") { cardBg = "rgba(168,85,247,.05)"; cardBorderLeft = "3px solid #a855f7"; }
            else if (sig === "ranging") { cardBg = "rgba(107,114,128,.04)"; cardBorderLeft = "3px solid #6b7280"; }
            return React.createElement("div", {
              key: def.key,
              style: { padding: "8px 10px", borderRadius: 8, background: cardBg, border: "1px solid var(--border)", borderLeft: cardBorderLeft, display: "flex", flexDirection: "column", gap: 2, transition: "background .3s, border-color .3s" }
            },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text6)", textTransform: "uppercase", letterSpacing: 0.3 } }, def.name),
                sigStyle && sig !== "neutral" && React.createElement("span", { style: { fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 6, background: sigStyle.bg, border: "1px solid " + sigStyle.border, color: sigStyle.text, textTransform: "uppercase" } }, sigStyle.label)
              ),
              React.createElement("div", { style: { fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text)" } }, _fmtVal(def, val)),
              def.type === "macd" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "MACD: " + _fmt(val.macd, 4)),
                React.createElement("span", null, "Sig: " + _fmt(val.signal, 4)),
                React.createElement("span", { style: { color: val.histogram >= 0 ? "var(--profit)" : "var(--loss)" } }, "Hist: " + _fmt(val.histogram, 4))
              ),
              def.type === "bands" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "U: " + _fmt(val.upper)),
                React.createElement("span", null, "M: " + _fmt(val.middle)),
                React.createElement("span", null, "L: " + _fmt(val.lower))
              ),
              def.type === "stoch" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "%K: " + _fmt(val.k)),
                React.createElement("span", null, "%D: " + _fmt(val.d))
              ),
              def.type === "ichimoku" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 6, flexWrap: "wrap" } },
                React.createElement("span", null, "T: " + _fmt(val.tenkan ?? val.tenkan_sen)),
                React.createElement("span", null, "K: " + _fmt(val.kijun ?? val.kijun_sen)),
                React.createElement("span", null, "SA: " + _fmt(val.senkouA ?? val.senkou_span_a)),
                React.createElement("span", null, "SB: " + _fmt(val.senkouB ?? val.senkou_span_b))
              ),
              def.type === "chandelier" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "L: " + _fmt(val.long)),
                React.createElement("span", null, "S: " + _fmt(val.short))
              ),
              def.type === "heikinAshi" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 6 } },
                React.createElement("span", null, "O: " + _fmt(val.open)),
                React.createElement("span", null, "H: " + _fmt(val.high)),
                React.createElement("span", null, "L: " + _fmt(val.low)),
                React.createElement("span", null, "C: " + _fmt(val.close))
              ),
              def.type === "aroon" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "Up: " + _fmt(val.up)),
                React.createElement("span", null, "Dn: " + _fmt(val.down)),
                React.createElement("span", { style: { color: val.osc > 0 ? "var(--profit)" : "var(--loss)" } }, "Osc: " + _fmt(val.osc))
              ),
              def.type === "vortex" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", { style: { color: "var(--profit)" } }, "VI+: " + _fmt(val.plus)),
                React.createElement("span", { style: { color: "var(--loss)" } }, "VI-: " + _fmt(val.minus))
              ),
              def.type === "volumeProfile" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "POC: " + _fmt(val.poc)),
                val.valueAreaHigh && React.createElement("span", null, "VAH: " + _fmt(val.valueAreaHigh)),
                val.valueAreaLow && React.createElement("span", null, "VAL: " + _fmt(val.valueAreaLow))
              ),
              def.type === "darvas" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8, flexWrap: "wrap" } },
                React.createElement("span", null, "Top: " + _fmt(val.boxTop)),
                React.createElement("span", null, "Bottom: " + _fmt(val.boxBottom)),
                val.breakout && React.createElement("span", {
                  style: { color: val.breakout === "up" ? "var(--profit)" : val.breakout === "down" ? "var(--loss)" : "var(--text6)" }
                }, "Breakout: " + val.breakout.toUpperCase())
              ),
              def.type === "rs" && val && typeof val === "object" && React.createElement("div", { style: { fontSize: 9, color: "var(--text6)", display: "flex", gap: 8 } },
                React.createElement("span", null, "RS: " + _fmt(val.rs, 4)),
                val.mansfield != null && React.createElement("span", { style: { color: val.mansfield > 0 ? "var(--profit)" : "var(--loss)" } }, "Mans: " + _fmt(val.mansfield, 2) + "%")
              )
            );
          })
        ),
        React.createElement("div", { style: { marginTop: 16 } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } },
            React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-heading)" } }, "Saved Snapshots"),
            snapshots.length > 0 && React.createElement("span", { style: { fontSize: 10, color: "var(--text6)" } }, snapshots.length + " total")
          ),
          renderSnapshots()
        )
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Pulse (Watchlist + Entry Score + Stock Screener)
   ══════════════════════════════════════════════════════════════════════════ */
function PulsePage({ holdings }) {
  const [activeTab, setActiveTab] = useState("screener");
  const [pendingTicker, setPendingTicker] = useState("");

  const openStock = (tk) => { setPendingTicker(tk); setActiveTab("singlestock"); };

  const TABS = [
    { key: "screener", label: "Stock Screener", icon: Icons.chart },
    { key: "entryscore", label: "Entry Score", icon: Icons.trendingUp },
    { key: "confidencescore", label: "Confidence Score", icon: Icons.eye },
    { key: "singlestock", label: "Single Stock Analysis", icon: Icons.search },
    { key: "backtest", label: "Backtesting", icon: Icons.clock },
    { key: "scoretuner", label: "Score Tuner", icon: Icons.settings },
  ];

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 } },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "PULSE"),
        React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "Market Pulse")
      )
    ),

    React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0, overflowX: "auto", WebkitOverflowScrolling: "touch" } },
      TABS.map(t => React.createElement("button", {
        key: t.key,
        onClick: () => setActiveTab(t.key),
        style: {
          padding: "8px 16px", fontSize: 12, fontWeight: activeTab === t.key ? 700 : 600,
          background: "transparent", border: "none", borderBottom: "2px solid " + (activeTab === t.key ? "var(--accent)" : "transparent"),
          color: activeTab === t.key ? "var(--accent)" : "var(--text5)", cursor: "pointer", transition: "all .15s",
          display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0
        }
      }, t.icon(14), t.label))
    ),

    React.createElement("div", null,
      activeTab === "screener" && React.createElement(StockScreener, { onOpenStock: openStock }),
      activeTab === "entryscore" && React.createElement(EntryScorePanel, { shares: holdings || [] }),
      activeTab === "confidencescore" && React.createElement(ConfidenceTracker, null),
      activeTab === "singlestock" && React.createElement(SingleStockAnalysis, { requestedTicker: pendingTicker }),
      React.createElement("div", { style: { display: activeTab === "backtest" ? "" : "none" } }, React.createElement(BacktestSuitePanel, null)),
      React.createElement("div", { style: { display: activeTab === "scoretuner" ? "" : "none" } }, React.createElement(ScoreTunerPanel, null))
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Info (Changelog & Version History)
   ══════════════════════════════════════════════════════════════════════════ */
function InfoPage() {
  var _m = React.useState(null), openM = _m[0], setOpenM = _m[1];
  var subH = { fontSize: 13, fontWeight: 700, color: "var(--text)", marginTop: 10, marginBottom: 4 };
  var subSub = { fontSize: 12, fontWeight: 600, color: "var(--text2)", marginTop: 8, marginBottom: 2 };
  var secStyle = { fontSize: 12, color: "var(--text4)", lineHeight: 1.7, padding: "8px 0 0 0" };
  function handleToggle(k) { setOpenM(openM === k ? null : k); }
  function MethSection(props) {
    var isOpen = openM === props.stateKey;
    return React.createElement("button", {
      style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--cardbg2)", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", textAlign: "left" },
      onClick: function() { handleToggle(props.stateKey); }
    }, React.createElement("span", null, props.label), React.createElement("span", null, isOpen ? "\u25BC" : "\u25B6"));
  }
  function MethContent(props) {
    if (openM !== props.stateKey) return null;
    return React.createElement("div", { style: secStyle }, props.children);
  }

  return React.createElement("div", null,
    React.createElement("div", { style: { marginBottom: 24 } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "INFO"),
      React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: -0.5 } }, "About StoX")
    ),

    /* App identity card */
    React.createElement("div", { className: "stx-card", style: { marginBottom: 20, display: "flex", alignItems: "center", gap: 16 } },
      React.createElement("div", { style: { width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg, var(--accent), var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontFamily: "var(--font-heading)", fontSize: 24, flexShrink: 0, boxShadow: "0 4px 16px var(--accentbg)" } }, "S"),
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
          React.createElement("span", { style: { fontSize: 18, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Sto", React.createElement("span", { style: { color: "var(--accent)" } }, "X")),
          React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentbg)", padding: "2px 8px", borderRadius: 6 } }, "v" + (window.__STOX_APP_VERSION || "2.4.25"))
        ),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text5)", marginTop: 3 } }, "Stock Analysis & Portfolio Tracking for Indian Equities"),
        React.createElement("div", { style: { fontSize: 11, color: "var(--text6)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" } },
          React.createElement("span", null, "NSE \u00b7 BSE"),
          React.createElement("span", null, "50+ Indicators"),
          React.createElement("span", null, "100% On-Device")
        )
      )
    ),

    /* Methodology reference */
    React.createElement("div", { className: "stx-card", style: { marginBottom: 20 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text)" } }, "Methodology"),
      React.createElement("div", { style: { fontSize: 12, color: "var(--text4)", lineHeight: 1.7 } },
        React.createElement("p", null, "All scoring uses SMAClub\u2019s proprietary multi-timeframe technical analysis system. Scores range 0\u2013100 and are computed from 50+ indicators across four pillars (Trend Health, Pullback Quality, 4% Probability, Swing Potential) plus penalty/bonus modifiers."),
        React.createElement("p", { style: { marginTop: 6 } }, "Select a section below for full detail.")
      ),
      React.createElement("div", { style: { marginTop: 12, display: "flex", flexDirection: "column", gap: 4 } },

        // INDICATORS
        React.createElement(MethSection, { label: "Technical Indicators Used", stateKey: "ind" }),
        React.createElement(MethContent, { stateKey: "ind" },
          React.createElement("div", { style: subSub }, "Trend / MA"),
          React.createElement("p", null, "SMA(20, 50, 100), EMA(9, 21, 50), WMA(20), HMA(16), KAMA(10), Ichimoku (Tenkan/Kijun/Senkou A/B/Chikou)"),
          React.createElement("div", { style: subSub }, "Momentum"),
          React.createElement("p", null, "RSI(14), Stochastic RSI(14,3,3), Williams %R(14), CCI(20), ROC(12), Momentum(10), MACD(12,26,9), TSI(25,13), STC(20,23,10), AO(5,34)"),
          React.createElement("div", { style: subSub }, "Volume / Flow"),
          React.createElement("p", null, "OBV, PVT, KVO(34,55,13), Force Index(13), MFI(14), CMF(20), Volume Profile (POC, VAH), OBV/PVT Slope(10)"),
          React.createElement("div", { style: subSub }, "Volatility / Structure"),
          React.createElement("p", null, "Bollinger Bands(20,2), Keltner Channels(20,1.5), Donchian Channels(20), Chandelier Exit(22,3), ATR(14), SuperTrend(10,3), PSAR(0.02,0.2), Vortex(14), Aroon(25)"),
          React.createElement("div", { style: subSub }, "Pattern / Composite"),
          React.createElement("p", null, "Darvas Box, Fibonacci Retracement, Pivot Points (Classic), ZigZag(5%), Williams Fractals, Choppiness Index(14), MTF Alignment, TTM Squeeze, Accum/Dist Composite, Relative Strength/Mansfield(40w), Beta")
        ),

        // ENTRY SCORE
        React.createElement(MethSection, { label: "Entry Score (100 raw pts)", stateKey: "entry" }),
        React.createElement(MethContent, { stateKey: "entry" },
          React.createElement("p", { style: subH }, (function() { var _pm = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pillarMax || {}) : {}; var _th = _pm.trendHealth != null ? _pm.trendHealth : 35; var _pb = _pm.pullbackQuality != null ? _pm.pullbackQuality : 30; var _p4 = _pm.prob4 != null ? _pm.prob4 : 35; var _sw = _pm.swingPotential != null ? _pm.swingPotential : 20; return "4 Pillars \u2014 Trend Health(" + _th + ") | Pullback Quality(" + _pb + ") | 4% Probability(" + _p4 + ") | Swing Potential(" + _sw + ")"; })()),
          React.createElement("p", { style: subSub }, (function() { var _pm = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pillarMax || {}) : {}; var _th = _pm.trendHealth != null ? _pm.trendHealth : 35; return "1. Trend Health (" + _th + " pts)"; })()),
          React.createElement("p", null, (function() { var _pm = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pillarMax || {}) : {}; var _th = _pm.trendHealth != null ? _pm.trendHealth : 35; return "Price > SMA(50) (+5). SMA(20) > SMA(50) (+5). Price > SMA(20) OR > Anchored VWAP (+5). ADX(14) >=25 AND +DI > -DI (+5). Mansfield RS(52w) > -5 (+5). MACD(12,26,9) above signal (+5). Weekly Heikin-Ashi bullish, synthesized from daily for the D timeframe (+2.5). SMA(20) 5-bar slope >0 AND price > SMA(20) (+2.5). Cap " + _th + "."; })()),
          React.createElement("p", { style: subSub }, (function() { var _pm = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pillarMax || {}) : {}; var _pb = _pm.pullbackQuality != null ? _pm.pullbackQuality : 30; return "2. Pullback / Setup Quality (" + _pb + " pts)"; })()),
          React.createElement("p", null, (function() { var _pm = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pillarMax || {}) : {}; var _pb = _pm.pullbackQuality != null ? _pm.pullbackQuality : 30; var _sc = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pullbackQuality || {}) : {}; return "ATR distance to buyRef within inner range (+" + (_sc.distATR_inner != null ? _sc.distATR_inner : 7) + ") or outer range (+" + (_sc.distATR_outer != null ? _sc.distATR_outer : 3) + "). Bullish candle c > o (+" + (_sc.candleColor != null ? _sc.candleColor : 4) + "). BB squeeze vs 5 bars ago (+" + (_sc.bbWidthSqueeze != null ? _sc.bbWidthSqueeze : 3) + "). StochRSI K < " + (_sc.stochRSIThreshold != null ? _sc.stochRSIThreshold : 20) + " OR RSI(14) < 40 (+" + (_sc.rsiOversold != null ? _sc.rsiOversold : 3) + "). Volume > " + (_sc.volRatioThreshold != null ? _sc.volRatioThreshold : 1.5) + "\u00d7 avg AND c > o (+" + (_sc.volumeConfirm != null ? _sc.volumeConfirm : 4) + "). Pullback depth 5\u201315% from swing high (+" + (_sc.pullbackDepthIdeal != null ? _sc.pullbackDepthIdeal : 6) + "). Support confluence >= " + (_sc.supportConfluenceThreshold != null ? _sc.supportConfluenceThreshold : 2) + " levels (+" + (_sc.supportConfluence != null ? _sc.supportConfluence : 3) + "). Cap " + _pb + "."; })()),
          React.createElement("p", { style: subSub }, (function() { var _pm = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pillarMax || {}) : {}; var _p4 = _pm.prob4 != null ? _pm.prob4 : 35; return "3. 4% Probability (" + _p4 + " pts)"; })()),
          React.createElement("p", null, (function() { var _pm = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pillarMax || {}) : {}; var _p4 = _pm.prob4 != null ? _pm.prob4 : 35; var _sc = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().prob4 || {}) : {}; return "ATR-adjusted target reachability: T1 (+" + (_sc.targetReachable_T1 != null ? _sc.targetReachable_T1 : 10) + "), T2 (+" + (_sc.targetReachable_T2 != null ? _sc.targetReachable_T2 : 8) + "), T3 (+" + (_sc.targetReachable_T3 != null ? _sc.targetReachable_T3 : 5) + "), T4 (+" + (_sc.targetReachable_T4 != null ? _sc.targetReachable_T4 : 2) + "). Distance to target: T1 (+" + (_sc.targetDist_T1 != null ? _sc.targetDist_T1 : 5) + "), T2 (+" + (_sc.targetDist_T2 != null ? _sc.targetDist_T2 : 4) + "). Volatility sweet spot: T1 (+" + (_sc.volSweet_T1 != null ? _sc.volSweet_T1 : 8) + "), T2 (+" + (_sc.volSweet_T2 != null ? _sc.volSweet_T2 : 4) + "). Efficiency ratio (+" + (_sc.efficiencyRatio != null ? _sc.efficiencyRatio : 4) + "). Up-day volume bonus/penalty (\u00b1" + Math.abs(_sc.upDayVolBonus != null ? _sc.upDayVolBonus : 5) + "). Directional bias (+" + (_sc.directionalBias != null ? _sc.directionalBias : 5) + "). Resistance penalty (" + (_sc.resistancePenalty != null ? _sc.resistancePenalty : -5) + ", headroom <4% to BB upper). Cap " + _p4 + "."; })()),
          React.createElement("p", { style: subSub }, (function() { var _pm = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pillarMax || {}) : {}; var _sw = _pm.swingPotential != null ? _pm.swingPotential : 20; return "4. Swing Potential (" + _sw + " pts)"; })()),
          React.createElement("p", null, (function() { var _sc = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().swingPotential || {}) : {}; return "Zero unless stock is in a 4\u201325% pullback from 20-bar high (2\u201315 bars ago). Reversal Probability (+" + (_sc.reversalProbability != null ? _sc.reversalProbability : 14) + "): empirical scan of matching historical pullbacks + lognormal GBM barrier-touch model blended via logit calibration. Turn Confirmation (+" + (_sc.turnConfirm != null ? _sc.turnConfirm : 6) + "): higher low (+2.5), hammer-style close (+2), RSI(14) upturn from below 40 (+1.5)."; })()),
          React.createElement("p", { style: subH }, "Modifiers (penalties / bonuses)"),
          React.createElement("p", null, "Low beta trap \u2014 Beta < 0.5 AND ATR(10) < 1.5% (unlikely to deliver the 4% move) (-10). Spike day \u2014 open gap > 3% or latest-bar volatility-adaptive spike (never chase a spike) (-10). Stability risk \u2014 calcStabilityScore(20) < 0.3 (erratic action) (-15). Multi-TF confirmation \u2014 weekly + daily raw both >=65 from this same model (+10)."),
          React.createElement("p", { style: subH }, "Classification"),
          React.createElement("p", null, (function() { var _cc = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().classification || {}) : {}; var _sb = _cc.strongBuy != null ? _cc.strongBuy : 80; var _bu = _cc.buy != null ? _cc.buy : 65; var _wl = _cc.watchlist != null ? _cc.watchlist : 50; var _nt = _cc.neutral != null ? _cc.neutral : 35; return _sb + "+ STRONG_BUY (100% alloc) | " + _bu + "+ BUY (70%) | " + _wl + "+ WATCHLIST (40%) | " + _nt + "+ NEUTRAL (0%) | <" + _nt + " AVOID (0%)"; })()),
          React.createElement("p", { style: subH }, "MTF Weights"),
          React.createElement("p", null, "Daily 55% | Hourly 30% | Weekly 15%")
        ),

        // SPIKE / STABILITY GUARD
        React.createElement(MethSection, { label: "Spike & Stability Guard", stateKey: "spike" }),
        React.createElement(MethContent, { stateKey: "spike" },
          React.createElement("p", { style: subH }, "Daily anti-chase filter (computed once per session, on top of the per-TF modifiers)"),
          React.createElement("p", null, "Daily-only: the hard gate, dominance ratio, and efficiency ratio are computed on daily candles. When no daily timeframe is present the guard is disabled entirely (the per-TF spike/stability modifiers still apply on the available timeframes)."),
          React.createElement("p", { style: subSub }, "Spike modifier (per TF)"),
          React.createElement("p", null, "Latest bar is a volatility-adaptive spike (calcDetectSpike) or the open gap > 3% \u2192 -10. Covers the old spike sub-score tiers in a single, simpler penalty."),
          React.createElement("p", { style: subSub }, "Stability modifier (per TF)"),
          React.createElement("p", null, "calcStabilityScore(20) < 0.3 (erratic price action) \u2192 -15. A smooth steady climb has zero variance and is fully stable \u2014 no penalty."),
          React.createElement("p", { style: subSub }, "Hard Gate \u2014 todaySpike"),
          React.createElement("p", null, "Latest daily bar is a volatility-adaptive spike (|move| > 2.5x rolling std(20) AND > 2.5x ATR14%) or an open gap > max(3.5%, 1.5x ATR%). Caps the final score at 49 (NEUTRAL) after all penalties/bonuses - never chase an abnormal single-session print."),
          React.createElement("p", { style: subSub }, "Dominance Ratio (informational)"),
          React.createElement("p", null, "Largest single-day |move| / |net 5-day move| (1.0 if |net| < 0.5%). Displayed on the guard card for context; no longer a separate penalty \u2014 the spike modifier and hard gate already handle abnormal sessions."),
          React.createElement("p", { style: subSub }, "Efficiency Ratio 10"),
          React.createElement("p", null, "Efficiency ratio 10 = |close - close[10]| / sum|daily diffs| (the KAMA ratio). Feeds the 4% Probability pillar: +5 when > 0.4 (a direct, efficient path to the target). Choppy paths are covered by the stability modifier."),
          React.createElement("p", { style: subSub }, "Exit side (bonus only, no double-count)"),
          React.createElement("p", null, "Golden exit nudge: an up-spike while holding that carries you near the 4% target (+5 at 3.0\u20134.0% profit, +3 at 2.0\u20133.0%) \u2014 the spike is often the top before a sharp reversal, so bank the gain. Suppressed past 4% (hard target rule exits there) and below 2% (too far from target). Stability collapse +3 when distribution ratio < 0.6 and not a spike day. No down-spike bonus: a panic day already fires the 13.2 / 14.1 / 15.1 pillars.")
        ),

        // EXIT SCORE
        React.createElement(MethSection, { label: "Exit Score (100 raw pts)", stateKey: "exit" }),
        React.createElement(MethContent, { stateKey: "exit" },
          React.createElement("p", { style: subH }, "4 Pillars \u2014 Trend BD(25) | Mom Exh(25) | Vol Dist(25) | Struc BD(25)"),
          React.createElement("p", { style: subSub }, "12.1 MA Breakdown (7 pts)"),
          React.createElement("p", null, "Price < EMA(9) cross, < EMA(21), < EMA(50), < SMA(200). EMA bearish stacking. HMA(16) declining, KAMA(10) declining, price < WMA(20). SMA(20) < SMA(50). RS Mansfield <0 & declining. HA close < prev + price < SMA(20)."),
          React.createElement("p", { style: subSub }, "12.2 MACD + TSI + STC + AO Rollover (9 pts)"),
          React.createElement("p", null, "MACD cross below signal, MACD <0 cross. Histogram <0 & declining. TSI <0 cross, TSI <0, TSI declining. STC <25, STC declining & <75. AO <0 cross, AO <0, AO declining."),
          React.createElement("p", { style: subSub }, "12.3 ADX + ST + PSAR + VI + Aroon BD (9 pts)"),
          React.createElement("p", null, "ADX declining & <25. -DI > +DI cross. Price < SuperTrend, ST flip. Price < PSAR, PSAR flip. VI- > VI+ cross. Aroon < -50 / <0, Aroon declining."),
          React.createElement("p", { style: subSub }, "13.1 RSI + StochRSI + WillR Exhaustion (10 pts)"),
          React.createElement("p", null, "RSI >80 (+2) / >70 (+1). RSI declining from >70. RSI <50 cross. StochRSI K < D cross, K <20. Williams %R < -80 (+1), cross below -50, declining & < -50."),
          React.createElement("p", { style: subSub }, "13.2 CCI + ROC + Mom + FI Reversal (8 pts)"),
          React.createElement("p", null, "CCI >200 (+1) / >100 (+0.5), declining from >100, <0 cross. ROC(12) <0 cross, ROC <0. Mom(10) <0 cross, Mom <0. FI(13) <0 cross, FI <0, FI declining & <0."),
          React.createElement("p", { style: subSub }, "13.3 MFI + CMF Outflow (7 pts)"),
          React.createElement("p", null, "MFI >80 (+2) / >70 (+1). MFI declining from >70. MFI <50 cross, MFI <30. CMF < -0.05 (+2) / <0 (+1). CMF declining & <0."),
          React.createElement("p", { style: subSub }, "14.1 OBV + PVT + KVO + FI Decline (9 pts)"),
          React.createElement("p", null, "OBV < SMA(20). OBV slope <0 cross, OBV slope <0. PVT < SMA(20). PVT slope <0. KVO < signal cross, KVO <0. FI(13) <0, FI declining & <0."),
          React.createElement("p", { style: subSub }, "14.2 VWAP + AVWAP Break (7 pts)"),
          React.createElement("p", null, "Price < VWAP(10) cross (+2), else pct bands 2.0% / 1.0% / else. VWAP declining. Price < Anchored VWAP (+1.5), AVWAP declining. Both VWAPs broken (+1)."),
          React.createElement("p", { style: subSub }, "14.3 Squeeze + Distribution (9 pts)"),
          React.createElement("p", null, "Squeeze momentum <0 cross, <0, declining & <0. Squeeze on + neg momentum. Distribution days >=60% / >=40%. Dist days rising."),
          React.createElement("p", { style: subSub }, "15.1 BB + KC + DC + Chandelier BD (9 pts)"),
          React.createElement("p", null, "Price < BB mid cross, < BB lower. BB width expanding + below mid. Price < KC mid cross. Price <= DC lower. Price < Chandelier Long, CL declining. ATR% >5%."),
          React.createElement("p", { style: subSub }, "15.2 Ichimoku Bearish Flip (6 pts)"),
          React.createElement("p", null, "Price < cloud bottom (+2) / < cloud max. Tenkan < Kijun cross (+1.5) / Tenkan < Kijun. Senkou A < B. Price declining. All confluence (+0.5)."),
          React.createElement("p", { style: subSub }, "15.3 Darvas + HMA + KAMA + MTF + Fib + Pivot + Fractals (10 pts)"),
          React.createElement("p", null, "Darvas bottom break (+2) / below mid. HMA declining, KAMA declining, price below both. MTF <40 / <60 & declining. Fib 0.618/0.786 broken. Pivot S1/S2 broken. ZigZag DOWN. Choppiness >61.8 & rising. Risk:reward <1.0 / <1.5 or reward <=0."),
          React.createElement("p", { style: subH }, "Penalties (-max)"),
          React.createElement("p", null, "Index trend score >=65 (-8). EMA9>EMA21 + MACD bullish (-5). Price decline 3 + low volume (-6). Near support <1.5% (-5). Held <3d + high entry >70 (-5). Above fib 0.618 + pivot (-3)."),
          React.createElement("p", { style: subH }, "Bonuses (+max)"),
          React.createElement("p", null, "Index trend score <35 (+5). Distribution days >=60% (+5). Price <97% entry (+5) / <98.5% (+3). Daily+Hourly bearish (+5). Distribution + MTF<40 (+3). High beta + index <40 (+3). Below Chandelier + S1 (+3). KVO bearish cross (+3)."),
          React.createElement("p", { style: subH }, "Classification"),
          React.createElement("p", null, "85+ URGENT EXIT | 70+ EXIT | 55+ PARTIAL EXIT | 40+ TIGHTEN STOP | 25+ MONITOR | <25 HOLD"),
          React.createElement("p", { style: subH }, "MTF Weights"),
          React.createElement("p", null, "Daily 50% | Weekly 25% | Hourly 25%")
        ),

        // INTEGRATED DECISION
        React.createElement(MethSection, { label: "Integrated Decision Engine", stateKey: "integrated" }),
        React.createElement(MethContent, { stateKey: "integrated" },
          React.createElement("p", { style: subSub }, "Layer 1 \u2014 Hard Rules"),
          React.createElement("p", null, "Target hit (+4%) \u2192 EXIT. Stop loss (entry - ATR\u00d71.5) \u2192 EXIT. Time stop (15 days, <2%) \u2192 EXIT."),
          React.createElement("p", { style: subSub }, "Layer 2 \u2014 Exit Score"),
          React.createElement("p", null, "Delegates to Exit Score classification. TIGHTEN STOP computes specific price: max(stop_loss, close - ATR\u00d71.5)."),
          React.createElement("p", { style: subSub }, "Layer 3 \u2014 Entry Score Collapse"),
          React.createElement("p", null, "If holding >=5 days, current entry score <40, and original entry >65 \u2192 EXIT."),
          React.createElement("p", { style: subSub }, "Layer 4 \u2014 Trailing Stop"),
          React.createElement("p", null, "If close >= entry\u00d71.02 and prev_close <= close - ATR\u00d72.0 \u2192 EXIT."),
          React.createElement("p", { style: subSub }, "Layer 5 \u2014 Partial Profit-Lock"),
          React.createElement("p", null, "If close >= entry\u00d71.02, holding >=3 days, exit score >=30 \u2192 PARTIAL EXIT."),
          React.createElement("p", { style: subH }, "Execution Order"),
          React.createElement("p", null, "Layers evaluated sequentially 1\u21925. First match wins. TIGHTEN STOP from Layer 2 is overridden only by Layer 1 hard rules.")
        ),

        // METHODOLOGY
        React.createElement(MethSection, { label: "Calculation Mechanics", stateKey: "mechanics" }),
        React.createElement(MethContent, { stateKey: "mechanics" },
          React.createElement("p", { style: subSub }, "Data Fetching"),
          React.createElement("p", null, "All OHLCV data from Yahoo Finance v8 chart endpoint. Daily: 260 bars (252+ for 52W HL). Weekly: 60 bars. Hourly: 100 bars. Index: ^NSEI for RS, Beta, index trend score."),
          React.createElement("p", { style: subSub }, "Variable Extraction"),
          React.createElement("p", null, "Each scoring function re-computes all indicators from raw OHLCV using last 2 closing values for cross-detection. Periods hardcoded per spec."),
          React.createElement("p", { style: subSub }, "Scoring Formula"),
          React.createElement("p", null, "Raw score = sum of the four pillars (Trend Health + Pullback Quality + 4% Probability + Swing Potential), each capped at its max. Final = clamp(raw + modifiers, 0, 100), where modifiers are the penalty/bonus items. The todaySpike hard gate can cap the final at 49."),
          React.createElement("p", { style: subSub }, "Multi-Timeframe Aggregation"),
          React.createElement("p", null, (function() { var _tw = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().tfWeights || {}) : {}; var _d = _tw.D != null ? Math.round(_tw.D * 100) : 55; var _w = _tw.W != null ? Math.round(_tw.W * 100) : 15; var _h = _tw.H != null ? Math.round(_tw.H * 100) : 30; return "Each timeframe scored independently. Weighted average applied: entry D=" + _d + "%/W=" + _w + "%/H=" + _h + "%, exit D=50%/W=25%/H=25%. Entry pillars aggregate per-pillar and are renormalized over the available timeframes, capped at their pillar max at the combined level; modifiers run once on the Daily snapshot only."; })()),
          React.createElement("p", { style: subSub }, "Position Monitoring"),
          React.createElement("p", null, "Auto-runs every 15 min during market hours (09:15\u201315:30 IST). Fetches daily candles per holding, computes exit score + integrated decision. Toast alert for each new score >=55. Deduplicated per session.")
        )
      )
    ),

    /* Data sources note */
    React.createElement("div", { className: "stx-card", style: { marginTop: 0, marginBottom: 20, padding: "14px 18px" } },
      React.createElement("h3", { style: { fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text)" } }, "Data Sources & Disclaimer"),
      React.createElement("div", { style: { fontSize: 11, color: "var(--text5)", lineHeight: 1.7 } },
        React.createElement("p", null, "Stock prices sourced from Yahoo Finance via CORS proxies. Data may be delayed 15+ minutes."),
        React.createElement("p", null, "Market index data from NSE India API. Commodity prices from Stooq."),
        React.createElement("p", null, "News from RSS feeds: Economic Times, Moneycontrol, The Hindu BusinessLine."),
        React.createElement("p", { style: { marginTop: 6, color: "var(--text6)" } }, "This application is for informational purposes only and does not constitute financial advice. Always do your own research before investing.")
      )
    ),
    React.createElement("div", { className: "stx-card", style: { padding: "14px 18px" } },
      React.createElement("h3", { style: { fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text)" } }, "Key Features"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 } },
        [
          { icon: Icons.chart(14), label: "50+ Technical Indicators", desc: "SMA, EMA, RSI, MACD, SuperTrend, Ichimoku, Darvas Box, and more" },
          { icon: Icons.briefcase(14), label: "Portfolio Tracking", desc: "Buy/sell transactions with P&L, XIRR, and capital gains" },
          { icon: Icons.search(14), label: "Stock Screener", desc: "Filter and score stocks with custom criteria" },
          { icon: Icons.trendingUp(14), label: "Entry & Exit Scores", desc: "Multi-timeframe analysis with actionable recommendations" },
          { icon: Icons.eye(14), label: "Market Pulse", desc: "Live indices, commodities, and market news" },
          { icon: Icons.clock(14), label: "Trade History", desc: "Complete transaction log with FY classification" },
        ].map(function (f, i) {
          return React.createElement("div", { key: i, style: { padding: "10px 12px", borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-start" } },
            React.createElement("span", { style: { color: "var(--accent)", marginTop: 1, flexShrink: 0 } }, f.icon),
            React.createElement("div", null,
              React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 2 } }, f.label),
              React.createElement("div", { style: { fontSize: 10, color: "var(--text6)", lineHeight: 1.4 } }, f.desc)
            )
          );
        })
      )
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGE: Settings
   ══════════════════════════════════════════════════════════════════════════ */
function SettingsPage({ holdings, setHoldings, soldShareSnapshots, setSoldShareSnapshots, watchlist, setWatchlist, themeId, setTheme, fontId, setFont }) {

  return React.createElement("div", null,
    React.createElement("div", { style: { marginBottom: 20 } },
      React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "var(--accent)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 } }, "SETTINGS"),
      React.createElement("h1", { style: { fontSize: 24, fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--text)" } }, "Settings")
    ),

    // Theme picker
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 12 } }, "Theme"),
      React.createElement("div", { className: "stx-theme-grid" },
        THEMES.map(function (th) {
          var active = themeId === th.id;
          return React.createElement("button", {
            key: th.id,
            className: "stx-theme-swatch" + (active ? " active" : ""),
            onClick: function () { setTheme(th.id); },
            style: { background: th.preview[0] }
          },
            React.createElement("div", {
              className: "stx-theme-swatch-preview",
              style: { background: "linear-gradient(135deg, " + th.preview[1] + ", " + th.preview[2] + ")" }
            }),
            React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: active ? th.preview[3] : "var(--text3)", marginTop: 6, textAlign: "center" } }, th.name),
            React.createElement("div", { style: { fontSize: 8, color: "var(--text5)", textAlign: "center", marginTop: 1 } }, th.desc)
          );
        })
      )
    ),

    // Font picker
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 12 } }, "Font"),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        FONTS.map(function (fo) {
          var active = fontId === fo.id;
          return React.createElement("button", {
            key: fo.id,
            onClick: function () { setFont(fo.id); },
            style: {
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              padding: "10px 14px", borderRadius: 10, border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
              background: active ? "var(--accentbg)" : "transparent", cursor: "pointer", transition: "all .15s",
              fontFamily: fo.stack
            }
          },
            React.createElement("span", { style: { fontSize: 13, fontWeight: active ? 700 : 500, color: active ? "var(--accent)" : "var(--text)" } }, fo.name),
            React.createElement("span", { style: { fontSize: 11, color: active ? "var(--accent)" : "var(--text5)", fontStyle: "italic" } }, "Aa Bb Cc 123")
          );
        })
      )
    ),

    // Backup / Restore / Import
    React.createElement(DataBackupSection, {
      holdings, setHoldings, soldShareSnapshots, setSoldShareSnapshots, watchlist, setWatchlist
    }),

    // File System Access auto-save
    window.FSAStoragePanel ? React.createElement(window.FSAStoragePanel, {
      stateData: { holdings, watchlist, soldShareSnapshots }
    }) : null,

    // Google Drive cloud backup
    window.CloudBackupPanel ? React.createElement(window.CloudBackupPanel, {
      stateData: { holdings, watchlist, soldShareSnapshots }
    }) : null,

    // About
    React.createElement("div", { className: "stx-card", style: { marginBottom: 16 } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, "About StoX"),
      React.createElement("div", { style: { fontSize: 12, color: "var(--text4)", lineHeight: 1.7 } },
        React.createElement("p", null, "StoX is a stock analysis and portfolio tracking app for Indian equities (NSE/BSE)."),
        React.createElement("p", null, "All data is stored locally. No data is sent to any server."),
        React.createElement("p", { style: { marginTop: 8 } }, "Version: ", window.__STOX_APP_VERSION || "2.4.25"),
        React.createElement("p", { style: { marginTop: 4, color: "var(--text5)" } }, (function() { var _pm = (window.TechIndicators && window.TechIndicators.getScoreConfig) ? (window.TechIndicators.getScoreConfig().pillarMax || {}) : {}; var _th = _pm.trendHealth != null ? _pm.trendHealth : 35; var _pb = _pm.pullbackQuality != null ? _pm.pullbackQuality : 30; var _p4 = _pm.prob4 != null ? _pm.prob4 : 35; var _sw = _pm.swingPotential != null ? _pm.swingPotential : 20; return "Latest: Entry score rebuilt on four pillars \u2014 Trend Health(" + _th + ") + Pullback Quality(" + _pb + ") + 4% Probability(" + _p4 + ") + Swing Potential(" + _sw + ") \u2014 with spike/stability/reversal modifiers and the todaySpike hard gate (cap 49). Blow-off/stability-collapse urgency bonuses remain on exit. No double-counted penalties."; })()),
        React.createElement("p", null, "Data: Yahoo Finance via CORS proxies. Prices may be delayed.")
      )
    ),

    // Data management (danger zone)
    React.createElement("div", { className: "stx-card", style: { border: "1px solid rgba(239,68,68,.25)", background: "rgba(239,68,68,.04)" } },
      React.createElement("h3", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#ef4444" } }, "Danger Zone"),
      React.createElement("p", { style: { fontSize: 12, color: "var(--text4)", marginBottom: 12 } }, "Permanently delete all data from this browser. Download a backup first."),
      React.createElement("button", {
        className: "stx-btn stx-btn-ghost",
        style: { color: "var(--loss)", borderColor: "var(--lossborder)" },
        onClick: async () => {
          if (await showConfirm("Clear ALL data? This cannot be undone.")) {
            localStorage.clear();
            const db = await openDB();
            const stores = ["holdings", "watchlist", "snapshots", "settings"];
            stores.forEach((s) => { try { db.transaction(s, "readwrite").objectStore(s).clear(); } catch {} });
            showToast("All data cleared. Reload to see changes.");
          }
        }
      }, "Clear All Data")
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════════════════════════════════ */
function App() {
  const [page, setPage] = useState("dashboard");
  const [pageParam, setPageParam] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [prices, setPrices] = useState({});
  const [soldShareSnapshots, setSoldShareSnapshots] = useState({});
  const [themeId, setThemeId] = useState(loadTheme);
  const [fontId, setFontId] = useState(loadFont);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [loading, setLoading] = useState(true);

  const setTheme = id => { setThemeId(id); applyTheme(id); saveTheme(id); };
  const setFont = id => { setFontId(id); applyFont(id); saveFont(id); };

  // Init theme & font
  useEffect(() => { applyTheme(themeId); }, [themeId]);
  useEffect(() => { applyFont(fontId); }, [fontId]);

  // Track mobile
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Load data from IDB on mount
  useEffect(() => {
    (async () => {
      try {
        const [h, w, snaps, cachedPrices] = await Promise.all([
          dbGetAll("holdings"), dbGetAll("watchlist"), loadSnapshots(),
          dbGetSetting("stox_prices_cache")
        ]);
        setHoldings(h);
        setWatchlist(w);
        setSoldShareSnapshots(snaps);
        if (cachedPrices) setPrices(cachedPrices);
      } catch (e) { console.warn("Failed to load data:", e); }
      setLoading(false);
    })();
  }, []);

  // Restore a previously connected FSA file handle so auto-save works from any page
  useEffect(() => {
    if (window.__fsaInit) window.__fsaInit().catch(function() {});
  }, []);

  // Persist prices to IDB after every successful fetch so stale data never shows
  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    var timer = setTimeout(function() { dbSetSetting("stox_prices_cache", prices).catch(function() {}); }, 500);
    return function() { clearTimeout(timer); };
  }, [prices]);

  // Fetch prices for all tracked tickers
  const allTickers = useMemo(() => {
    const set = new Set();
    holdings.forEach((h) => set.add(h.ticker));
    watchlist.forEach((w) => set.add(w.ticker));
    return [...set];
  }, [holdings, watchlist]);

  useEffect(() => {
    if (allTickers.length === 0) return;
    let cancelled = false;
    (async () => {
      const result = await fetchMultiplePrices(allTickers);
      if (!cancelled) setPrices((prev) => ({ ...prev, ...result }));
    })();
    return () => { cancelled = true; };
  }, [allTickers.join(",")]);

  // Auto-write FSA file when any app data changes (debounced 2s)
  const _fsaTimerRef = React.useRef(null);
  // Keep a live snapshot of current state so FSA auto-save never writes stale holdings
  useEffect(() => {
    if (window.__fsa) window.__fsa.state = { holdings, watchlist, soldShareSnapshots };
  }, [holdings, watchlist, soldShareSnapshots]);
  useEffect(() => {
    if (_fsaTimerRef.current) clearTimeout(_fsaTimerRef.current);
    _fsaTimerRef.current = setTimeout(() => {
      if (window.__fsa && window.__fsa.writeNow) {
        window.__fsa.writeNow().catch(function() {});
      }
    }, 2000);
    return () => { if (_fsaTimerRef.current) clearTimeout(_fsaTimerRef.current); };
  }, [holdings, watchlist, soldShareSnapshots, prices]);

  // Track local data edits so GDrive push/pull compares timestamps correctly.
  // Skips the initial IDB load (loading flag) so a fresh page load never marks
  // the app as "newer" than Drive and blocks a pull.
  const _editBumpInitRef = React.useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!_editBumpInitRef.current) { _editBumpInitRef.current = true; return; }
    if (window._syncSaveLocalEdit) window._syncSaveLocalEdit(new Date().toISOString());
  }, [holdings, watchlist, soldShareSnapshots, loading]);

  // Auto-write FSA when screener/entry-score data changes (outside main state)
  const _fsaExternalRef = React.useRef(null);
  useEffect(() => {
    const handler = () => {
      if (_fsaExternalRef.current) clearTimeout(_fsaExternalRef.current);
      _fsaExternalRef.current = setTimeout(() => {
        if (window.__fsa && window.__fsa.writeNow) {
          window.__fsa.writeNow().catch(function() {});
        }
      }, 2000);
      if (window._syncSaveLocalEdit) window._syncSaveLocalEdit(new Date().toISOString());
    };
    window.addEventListener("stox:data-changed", handler);
    return () => { window.removeEventListener("stox:data-changed", handler); if (_fsaExternalRef.current) clearTimeout(_fsaExternalRef.current); };
  }, []);

  // Auto-refresh every 60s
  useEffect(() => {
    if (allTickers.length === 0) return;
    const timer = setInterval(async () => {
      const result = await fetchMultiplePrices(allTickers);
      setPrices((prev) => ({ ...prev, ...result }));
    }, 60000);
    return () => clearInterval(timer);
  }, [allTickers.join(",")]);

  // Position monitoring every 15 min during market hours (09:15–15:30 IST)
  var shownAlertsRef = React.useRef({});
  useEffect(() => {
    if (holdings.length === 0) return;
    var timer = setInterval(async () => {
      var now = new Date(Date.now() + 5.5 * 3600000);
      var h = now.getUTCHours(), m = now.getUTCMinutes() + h * 60;
      if (m < 555 || m > 930) return; // outside 09:15–15:30 IST
      try {
        var alerts = await monitorPositions(holdings);
        alerts.forEach(function(a) {
          var key = a.symbol + '|' + a.action + '|' + a.reason;
          if (shownAlertsRef.current[key]) return;
          shownAlertsRef.current[key] = true;
          var msg = a.symbol + ': ' + (a.action || a.classification || 'ALERT') + (a.pnl_pct != null ? ' (' + a.pnl_pct + '%)' : '') + ' — ' + a.reason;
          showToast(msg, 8000);
        });
      } catch(e) {}
    }, 15 * 60 * 1000);
    return function() { clearInterval(timer); };
  }, [holdings.length]);

  const navigate = (p, param) => { setPage(p); setPageParam(param); window.scrollTo(0, 0); };

  const refreshPrices = async () => {
    if (allTickers.length === 0) return;
    const result = await fetchMultiplePrices(allTickers);
    setPrices((prev) => ({ ...prev, ...result }));
  };

  const fetchSinglePrice = async (ticker) => {
    const data = await fetchTickerPrice(ticker);
    if (data) setPrices((prev) => ({ ...prev, [ticker.toUpperCase()]: data }));
  };

  // Hide splash
  useEffect(() => {
    const splash = document.getElementById("stox-splash");
    if (splash) {
      setTimeout(() => {
        splash.style.transition = "opacity .5s ease";
        splash.style.opacity = "0";
        setTimeout(() => splash.remove(), 500);
      }, 3200);
    }
  }, []);

  // Snapshot CRUD helpers
  const saveSnapshot = async (snapshot) => {
    const savedAt = snapshot.savedAt || TODAY();
    const fyKey = getFYKey(savedAt);
    setSoldShareSnapshots((prev) => {
      const updated = { ...prev, [fyKey]: [...(prev[fyKey] || []), { ...snapshot, savedAt }] };
      persistSnapshots(updated);
      return updated;
    });
  };

  const editSnapshot = async (fyKey, snapshot) => {
    setSoldShareSnapshots((prev) => {
      const newFyKey = getFYKey(snapshot.savedAt || TODAY());
      const updated = { ...prev };
      if (fyKey === newFyKey) {
        const snaps = (prev[fyKey] || []).map((s) => s.id === snapshot.id ? snapshot : s).sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
        if (snaps.length > 0) updated[fyKey] = snaps;
        else delete updated[fyKey];
      } else {
        const oldSnaps = (prev[fyKey] || []).filter((s) => s.id !== snapshot.id);
        const newSnaps = [...(prev[newFyKey] || []), snapshot].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
        if (oldSnaps.length > 0) updated[fyKey] = oldSnaps;
        else delete updated[fyKey];
        updated[newFyKey] = newSnaps;
      }
      persistSnapshots(updated);
      return updated;
    });
  };

  const deleteSnapshot = async (fyKey, snapId) => {
    setSoldShareSnapshots((prev) => {
      const snaps = (prev[fyKey] || []).filter((s) => s.id !== snapId);
      const updated = { ...prev };
      if (snaps.length > 0) updated[fyKey] = snaps;
      else delete updated[fyKey];
      persistSnapshots(updated);
      return updated;
    });
  };

  const pageProps = { holdings, setHoldings, watchlist, setWatchlist, prices, navigate, soldShareSnapshots, setSoldShareSnapshots, saveSnapshot, editSnapshot, deleteSnapshot, refreshPrices };

  const renderPage = () => {
    switch (page) {
      case "dashboard": return React.createElement(Dashboard, pageProps);
      case "analysis": return React.createElement(StockAnalysis, { ticker: pageParam, prices, holdings, onBack: () => setPage("portfolio") });
      case "portfolio": return React.createElement(PortfolioPage, pageProps);
      case "tradehistory": return React.createElement(TradeHistoryPage, pageProps);
      case "reports": return React.createElement(ReportsPage, { shares: holdings, soldShareSnapshots });
      case "watchlist": return React.createElement(PulsePage, { holdings });
      case "settings": return React.createElement(SettingsPage, { ...pageProps, themeId, setTheme, fontId, setFont });
      case "info": return React.createElement(InfoPage, null);
      case "notepad": return React.createElement(window.NotepadPage, null);
      default: return React.createElement(Dashboard, pageProps);
    }
  };

  const NAV_ITEMS = [
    { key: "dashboard", label: "Dashboard", icon: Icons.home },
    { key: "portfolio", label: "Portfolio", icon: Icons.briefcase },
    { key: "tradehistory", label: "Trades", icon: Icons.clock },
    { key: "reports", label: "Reports", icon: Icons.chart },
    { key: "watchlist", label: "Pulse", icon: Icons.eye },
    { key: "settings", label: "Settings", icon: Icons.settings },
    { key: "notepad", label: "Notes", icon: Icons.pen },
    { key: "info", label: "Info", icon: Icons.info },
    { key: "gfinance", label: "Google Finance", icon: Icons.search, external: true, url: "https://www.google.com/finance" },
  ];

  const NAV_COLORS = {
    dashboard: "#fbbf24",
    portfolio: "#38bdf8",
    tradehistory: "#f472b6",
    reports: "#a78bfa",
    watchlist: "#2dd4bf",
    settings: "#93c5fd",
    notepad: "#f59e0b",
    info: "#bef264",
    gfinance: "#fbbc05",
  };

  const hexAlpha = (hex, a) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  };

  // Desktop sidebar + content
  if (!isMobile) {
    return React.createElement("div", { style: { display: "flex", height: "100vh", overflow: "hidden" } },
      // Sidebar
      React.createElement("div", {
        className: "stx-sidebar",
        style: {
          width: 240, minWidth: 240, display: "flex", flexDirection: "column",
          padding: "14px 0", flexShrink: 0, height: "100vh", overflowY: "auto"
        }
      },
        React.createElement("div", { style: { padding: "0 16px 16px", borderBottom: "1px solid var(--border)" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
            React.createElement("div", { style: { width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,var(--accent),var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontFamily: "var(--font-heading)", fontSize: 17, boxShadow: "0 4px 12px var(--accentbg3)" } }, "S"),
            React.createElement("div", null,
              React.createElement("div", { style: { fontWeight: 800, fontSize: 17, color: "var(--sidebar-text)", fontFamily: "var(--font-heading)", letterSpacing: "-0.3px" } }, "Sto", React.createElement("span", { style: { color: "var(--accent)" } }, "X")),
              React.createElement("div", { style: { fontSize: 9, color: "var(--sidebar-text3)", letterSpacing: 1.5, fontWeight: 500, textTransform: "uppercase" } }, "Stock Analysis")
            )
          )
        ),
        React.createElement("div", { style: { padding: "12px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 1 } },
          NAV_ITEMS.map((item) => {
            const active = page === item.key;
            const col = NAV_COLORS[item.key] || "var(--accent)";
            return React.createElement("button", {
              key: item.key, onClick: () => item.external ? window.open(item.url, "_blank", "noopener") : navigate(item.key),
              style: {
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px",
                borderRadius: 8, border: "none", cursor: "pointer",
                transition: "all .2s var(--ease-out)",
                background: active ? "var(--sidebar-active-bg)" : "transparent",
                color: active ? "var(--accent)" : "var(--sidebar-text)",
                fontWeight: active ? 700 : 500, fontSize: 13,
                fontFamily: "var(--font-body)", textAlign: "left",
                borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent"
              }
            },
              React.createElement("span", null, item.icon(18)),
              React.createElement("span", null, item.label)
            );
          })
        ),
        // Market status footer
        React.createElement("div", { style: { padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--sidebar-text4)" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
            React.createElement("div", { style: { width: 6, height: 6, borderRadius: "50%", background: isTradingWeekday() ? "var(--accent)" : "var(--sidebar-text4)", boxShadow: isTradingWeekday() ? "0 0 6px var(--accentbg5)" : "none" } }),
            React.createElement("span", { style: { fontWeight: 600, letterSpacing: ".3px" } }, isTradingWeekday() ? "Market Open" : "Market Closed")
          ),
          React.createElement("div", { style: { marginTop: 4, letterSpacing: ".5px" } }, "NSE \u00b7 BSE")
        )
      ),
      // Content
      React.createElement("div", { style: { flex: 1, overflowY: "auto", minHeight: 0, padding: "16px 20px 32px", background: "var(--bg)" } },
        renderPage()
      ),
      React.createElement(ToastHost, null)
    );
  }

  // Mobile layout
  return React.createElement("div", { className: "stx-has-botnav", style: { padding: "14px 10px 32px" } },
    React.createElement("div", { style: { maxWidth: 600, margin: "0 auto" } },
      renderPage()
    ),
    // Bottom nav
    React.createElement("div", { className: "stx-botnav" },
      NAV_ITEMS.map((item) => {
        const col = NAV_COLORS[item.key] || "var(--accent)";
        return React.createElement("button", {
          key: item.key,
          className: "stx-botnav-item" + (page === item.key ? " active" : ""),
          onClick: () => item.external ? window.open(item.url, "_blank", "noopener") : navigate(item.key),
          style: page === item.key ? { color: col } : {}
        },
          React.createElement("span", null, item.icon(18)),
          React.createElement("span", null, item.label)
        );
      })
    ),
    React.createElement(ToastHost, null)
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SCANNING & MONITORING PIPELINE  (Section 19)
   ══════════════════════════════════════════════════════════════════════════ */

/* 19.1 Entry Scan — run daily after market close (15:30 IST) */
async function scanEntries(universe) {
  if (!universe || !universe.length) return [];
  var DF = window.OHLCVFetcher, TI = window.TechIndicators;
  if (!DF || !TI) return [];
  var _scCfg = (TI.getScoreConfig) ? TI.getScoreConfig().classification : null;
  var _scanBuyTh = _scCfg ? _scCfg.buy : 65;
  var idxD = await DF.fetchOHLCVCached('^NSEI', 'daily');
  var idxW = await DF.fetchOHLCVCached('^NSEI', 'weekly');
  var results = [];
  for (var i = 0; i < universe.length; i++) {
    var sym = universe[i];
    try {
      var h = await DF.fetchOHLCVCached(sym, '1h');
      var d = await DF.fetchOHLCVCached(sym, 'daily');
      var w = await DF.fetchOHLCVCached(sym, 'weekly');
      if (!d || d.length < 50) continue;
      var tfResults = [
        { timeframe: 'H', candles: h },
        { timeframe: 'D', candles: d },
        { timeframe: 'W', candles: w }
      ];
      var score = TI.computeMultiTFEntryScore(tfResults, idxD, idxW);
      var entryScore = score && score.multiTF_score != null ? score.multiTF_score : (score && score.entry_score != null ? score.entry_score : null);
      if (entryScore != null && entryScore >= _scanBuyTh) {
        results.push({
          symbol: sym, score: Math.round(entryScore * 10) / 10,
          classification: score.classification || 'BUY',
          details: score
        });
      }
    } catch(e) { /* skip symbol */ }
  }
  results.sort(function(a, b) { return b.score - a.score; });
  return results;
}

/* 19.2 Position Monitoring — run every 15–60 min during market hours (09:15–15:30 IST) */
async function monitorPositions(portfolio) {
  if (!portfolio || !portfolio.length) return [];
  var DF = window.OHLCVFetcher, TI = window.TechIndicators;
  if (!DF || !TI) return [];
  var alerts = [];
  for (var i = 0; i < portfolio.length; i++) {
    var pos = portfolio[i];
    try {
      var ticker = pos.ticker || pos.symbol || '';
      var d = await DF.fetchOHLCVCached(ticker, 'daily');
      if (!d || d.length < 50) continue;
      var idxD = await DF.fetchOHLCVCached('^NSEI', 'daily');
      var lastCandle = d[d.length - 1];
      var prevCandle = d.length > 1 ? d[d.length - 2] : null;
      var entryPrice = pos.buyPrice || pos.avgPrice || pos.entry_price || 0;
      var currentPrice = pos.currentPrice || pos.current_price || (lastCandle ? lastCandle.c : null);
      var buyDate = pos.buyDate || pos.buy_date || null;
      var holdingDays = buyDate ? Math.max(1, Math.floor((Date.now() - new Date(buyDate).getTime()) / 86400000)) : (pos.holding_days || 0);
      var posData = {
        entry_price: entryPrice,
        current_price: currentPrice,
        holding_days: holdingDays,
        current_atr: pos.current_atr || null,
        entry_score: pos.entryScore || pos.entry_score || 50,
        prev_close: pos.prev_close || (prevCandle ? prevCandle.c : null)
      };
      var exitRes = TI.computeExitScore(d, { entry_price: posData.entry_price, holding_days: posData.holding_days, entry_score: posData.entry_score }, idxD);
      var integratedRes = TI.integratedExitDecision(posData, d, idxD);
      if (exitRes && exitRes.exit_score >= 55) {
        var pnl = posData.current_price && posData.entry_price ? (posData.current_price - posData.entry_price) / posData.entry_price * 100 : null;
        alerts.push({
          symbol: ticker,
          exit_score: exitRes.exit_score,
          action: integratedRes ? integratedRes.signal : exitRes.signal,
          reason: integratedRes ? integratedRes.reason : 'Score threshold',
          pnl_pct: pnl != null ? Math.round(pnl * 100) / 100 : null,
          classification: exitRes.classification,
          details: exitRes
        });
      }
    } catch(e) { /* skip position */ }
  }
  alerts.sort(function(a, b) { return b.exit_score - a.exit_score; });
  return alerts;
}

/* ══════════════════════════════════════════════════════════════════════════
   MOUNT
   ══════════════════════════════════════════════════════════════════════════ */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
