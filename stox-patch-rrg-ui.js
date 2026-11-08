#!/usr/bin/env node
"use strict";

/* stox-patch-rrg-ui.js — Upgrades the RRG chart with hover-highlighting 
   and progressive tail fading to eliminate clutter. */

const fs   = require("fs");
const path = require("path");
const SRC  = __dirname;
const DRY  = process.argv.includes("--dry-run");

function rd(f) { return fs.readFileSync(path.join(SRC, f), "utf8"); }
function wr(f, c) {
  if (DRY) return;
  const p = path.join(SRC, f);
  if (!fs.existsSync(p + ".bak-rrgui")) fs.copyFileSync(p, p + ".bak-rrgui");
  fs.writeFileSync(p, c, "utf8");
}

function patchFile(file, patches) {
  console.log("\n[ " + file + " ]\n");
  let src = rd(file);
  let changed = false;
  for (const p of patches) {
    if (src.includes(p.replaceId)) {
      console.log("  · " + p.name + "  (already applied)");
      continue;
    }
    const newSrc = src.split(p.find).join(p.replace);
    if (newSrc !== src) {
      src = newSrc;
      changed = true;
      console.log("  ✓ " + p.name);
    } else {
      console.log("  ✗ NOT FOUND: " + p.name);
    }
  }
  if (changed) wr(file, src);
}

console.log("🚀 Upgrading RRG UI for clarity and interactivity...\n");

patchFile("app-core.js", [
  {
    name: "Add hover state to SectorRotationPanel",
    find: "  var _b = useState(false); var busy = _b[0], setBusy = _b[1];",
    replace: "  var _b = useState(false); var busy = _b[0], setBusy = _b[1];\n  var _h = useState(null); var hovered = _h[0], setHovered = _h[1];",
    replaceId: "var hovered = _h[0], setHovered = _h[1];"
  },
  {
    name: "Rewrite the SVG mapping logic for interactive tails",
    find: `          secs.map(function (sec) {
            var c = sec.current;
            return React.createElement("g", { key: sec.key },
              sec.tail.length > 1 && React.createElement("polyline", { points: sec.tail.map(function (p) { return X(p.rsRatio).toFixed(1) + "," + Y(p.rsMomentum).toFixed(1); }).join(" "), fill: "none", stroke: sec.color, strokeWidth: 1.5, opacity: 0.35, strokeLinejoin: "round" }),
              sec.tail.map(function (p, i) {
                var isHead = i === sec.tail.length - 1;
                return React.createElement("circle", { key: i, cx: X(p.rsRatio), cy: Y(p.rsMomentum), r: isHead ? 5 : 2, fill: sec.color, opacity: isHead ? 1 : 0.45, stroke: isHead ? "var(--bg)" : "none", strokeWidth: isHead ? 1.5 : 0 });
              }),
              React.createElement("text", { x: X(c.rsRatio) + 8, y: Y(c.rsMomentum) + 3, fontSize: 10, fontWeight: 800, fill: "var(--text)", fontFamily: "var(--font-heading)" }, sec.name));
          })`,
    replace: `          secs.map(function (sec) {
            var c = sec.current;
            var isHovered = hovered === sec.key;
            var isFaded = hovered !== null && !isHovered;
            var baseOpacity = isFaded ? 0.1 : 1;
            
            return React.createElement("g", { 
              key: sec.key, 
              opacity: baseOpacity, 
              style: { transition: "opacity 0.2s" },
              onMouseEnter: function () { setHovered(sec.key); },
              onMouseLeave: function () { setHovered(null); }
            },
              // 1. Fading tail (line segments)
              sec.tail.map(function (p, i) {
                if (i === 0) return null;
                var prev = sec.tail[i - 1];
                var tailOpacity = isHovered ? 1 : 0.2 + (i / sec.tail.length) * 0.6;
                return React.createElement("line", {
                  key: "tail" + i,
                  x1: X(prev.rsRatio), y1: Y(prev.rsMomentum),
                  x2: X(p.rsRatio), y2: Y(p.rsMomentum),
                  stroke: sec.color, strokeWidth: isHovered ? 3 : 2, opacity: tailOpacity, strokeLinecap: "round"
                });
              }),
              // 2. Tail nodes
              sec.tail.slice(0, -1).map(function (p, i) {
                return React.createElement("circle", { key: "node" + i, cx: X(p.rsRatio), cy: Y(p.rsMomentum), r: isHovered ? 3 : 2, fill: sec.color });
              }),
              // 3. The Head (Current Day)
              React.createElement("circle", { cx: X(c.rsRatio), cy: Y(c.rsMomentum), r: isHovered ? 8 : 6, fill: sec.color, stroke: isHovered ? "var(--text)" : "var(--bg)", strokeWidth: 2 }),
              
              // 4. Invisible Hitbox for easy hovering
              React.createElement("circle", { cx: X(c.rsRatio), cy: Y(c.rsMomentum), r: 15, fill: "transparent", style: { cursor: "pointer" } }),
              
              // 5. Label (Only show if hovered to prevent clutter)
              isHovered && React.createElement("text", { x: X(c.rsRatio), y: Y(c.rsMomentum) - 12, textAnchor: "middle", fontSize: 12, fontWeight: 800, fill: sec.color, fontFamily: "var(--font-heading)", style: { paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 4 } }, sec.name)
            );
          })`,
    replaceId: "sec.tail.map(function (p, i) {\n                if (i === 0) return null;"
  },
  {
    name: "Make the side legend interactive (hover sync)",
    find: `                      return React.createElement("div", { key: s.key, style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0" } },`,
    replace: `                      return React.createElement("div", { 
                        key: s.key, 
                        style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 6px", margin: "0 -6px", borderRadius: 4, background: hovered === s.key ? "var(--bg5)" : "transparent", cursor: "pointer", transition: "background 0.2s" },
                        onMouseEnter: function () { setHovered(s.key); },
                        onMouseLeave: function () { setHovered(null); }
                      },`,
    replaceId: "background: hovered === s.key ? \"var(--bg5)\" : \"transparent\""
  }
]);

console.log("\n" + (DRY ? "[DRY RUN] no files written.\n" : "Done. The RRG chart is now clean and interactive.\n"));