#!/usr/bin/env node
"use strict";

/* stox-bump-v501.js — Bumps app version to 5.0.1 and SW cache to v479.
   - app-core.js: __STOX_APP_VERSION = "5.0.1"
   - sw.js:       CACHE_NAME = 'stox-v479'
   Idempotent. Backs up as *.bak-v501. */

const fs   = require("fs");
const path = require("path");
const SRC  = __dirname;
const DRY  = process.argv.includes("--dry-run");

function rd(f) { return fs.readFileSync(path.join(SRC, f), "utf8"); }
function wr(f, c) {
  if (DRY) return;
  const p = path.join(SRC, f);
  if (!fs.existsSync(p + ".bak-v501")) fs.copyFileSync(p, p + ".bak-v501");
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

console.log("🚀 Bumping versions for GitHub Pages deployment (v5.0.1)...\n");

patchRegex("app-core.js", [{
  name: "bump __STOX_APP_VERSION to 5.0.1",
  replaceId: 'window.__STOX_APP_VERSION = "5.0.1";',
  regex: /window\.__STOX_APP_VERSION\s*=\s*"[0-9]+\.[0-9]+\.[0-9]+";/,
  replace: 'window.__STOX_APP_VERSION = "5.0.1";'
}]);

patchRegex("sw.js", [{
  name: "bump CACHE_NAME to stox-v479",
  replaceId: "const CACHE_NAME = 'stox-v479';",
  regex: /const CACHE_NAME\s*=\s*'stox-v[0-9]+';/,
  replace: "const CACHE_NAME = 'stox-v479';"
}]);

console.log("\n" + (DRY ? "[DRY RUN] no files written.\n" : "Done. Ready to push to GitHub!\n"));