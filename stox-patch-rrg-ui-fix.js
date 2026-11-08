#!/usr/bin/env node
"use strict";

/* stox-patch-rrg-ui-fix.js — Applies the hover sync to the side legend. */

const fs   = require("fs");
const path = require("path");
const SRC  = __dirname;
const DRY  = process.argv.includes("--dry-run");

function rd(f) { return fs.readFileSync(path.join(SRC, f), "utf8"); }
function wr(f, c) {
  if (DRY) return;
  const p = path.join(SRC, f);
  if (!fs.existsSync(p + ".bak-rrgui2")) fs.copyFileSync(p, p + ".bak-rrgui2");
  fs.writeFileSync(p, c, "utf8");
}

function patchRegex(file, patches) {
  console.log("\n[ " + file + " ]\n");
  let src = rd(file);
  let changed = false;
  
  for (const p of patches) {
    if (src.includes(p.replaceId)) {
      console.log("  · " + p.name + "  (already applied)");
      continue;
    }
    
    const newSrc = src.replace(p.regex, p.replace);
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

console.log("🚀 Patching the side legend hover sync...\n");

patchRegex("app-core.js", [
  {
    name: "Make side legend div interactive",
    replaceId: "background: hovered === s.key ? \"var(--bg5)\" : \"transparent\", cursor: \"pointer\"",
    regex: /key:\s*s\.key,\s*style:\s*\{[^}]+\}/,
    replace: `key: s.key, style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 6px", margin: "0 -6px", borderRadius: 4, background: hovered === s.key ? "var(--bg5)" : "transparent", cursor: "pointer", transition: "background 0.2s" }, onMouseEnter: function () { setHovered(s.key); }, onMouseLeave: function () { setHovered(null); }`
  }
]);

console.log("\n" + (DRY ? "[DRY RUN] no files written.\n" : "Done. The side legend is now interactive.\n"));