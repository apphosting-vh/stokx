/* rebuild-rows.js — run in the browser console on the page that hosts the EV engine.
 *
 * Fixes "rows.json is half empty": the calibration walk is batched (a few
 * dates per call) and can be interrupted, and a pre-EV-4.9.3c meta ledger
 * (range-only, no exact date list) makes the walk skip its old [oldest,
 * newest] span even when the row store was cleared. This script:
 *   1. DIAGNOSES  - meta ledger vs row store, month histogram, newest row.
 *   2. REPAIRS    - stale/legacy meta => clears the calibration family and
 *                   row store so the walk starts clean (they self-rebuild;
 *                   live episode stores are NOT touched).
 *   3. DRIVES     - loops the app's stoxRunEvCalibration() until the row
 *                   count plateaus (the walk is complete).
 *   4. VERIFIES   - prints the criteria a complete export must satisfy.
 *
 * After it finishes, run export-rows.js and re-run the A/B harness.
 */
(async () => {
  'use strict';
  const KEY = 'stox_ev_calibration_v12';
  const REPAIR = true;          /* set false to only diagnose */

  /* ---- helpers ---- */
  const readRows = () => new Promise((res) => {
    try {
      if (!indexedDB || !indexedDB.databases) return res([]);
      indexedDB.databases().then((dbs) => {
        if (!dbs.some((d) => d.name === 'stox_ev_rows')) return res([]);
        const q = indexedDB.open('stox_ev_rows');
        q.onsuccess = () => {
          const db = q.result;
          if (!db.objectStoreNames.contains('rows')) { db.close(); return res([]); }
          const g = db.transaction('rows', 'readonly').objectStore('rows').getAll();
          g.onsuccess = () => { db.close(); res(g.result || []); };
          g.onerror = () => { db.close(); res([]); };
        };
        q.onerror = q.onabort = () => res([]);
      }).catch(() => res([]));
    } catch (e) { res([]); }
  });
  const clearRows = () => new Promise((res) => {
    try {
      const q = indexedDB.open('stox_ev_rows');
      q.onsuccess = () => {
        const db = q.result;
        try { if (db.objectStoreNames.contains('rows')) db.transaction('rows', 'readwrite').objectStore('rows').clear(); } catch (e) {}
        db.close(); res();
      };
      q.onerror = q.onabort = () => res();
    } catch (e) { res(); }
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const monthHistogram = (rows) => {
    const m = {};
    rows.forEach((r) => { const k = (r && r.date || '?').slice(0, 7); m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).sort().map((k) => k + ':' + m[k]).join('  ');
  };

  /* ---- 1. diagnose ---- */
  let env = null;
  try { env = JSON.parse(localStorage.getItem(KEY + '_txn') || 'null'); } catch (e) {}
  const meta = (env && env.meta) || {};
  const syms = Object.keys(meta);
  const legacy = syms.filter((s) => meta[s] && !meta[s].dates && meta[s].count > 0);
  const counts = syms.map((s) => (meta[s] && meta[s].count) || 0).sort((a, b) => a - b);
  const ledgerTotal = counts.reduce((a, b) => a + b, 0);
  const rows = await readRows();
  const dates = rows.map((r) => r && r.date).filter(Boolean).sort();

  console.log('== DIAGNOSIS ==');
  console.log('meta ledger: ' + syms.length + ' symbols, ' + ledgerTotal + ' logged dates, median ' + (counts[counts.length >> 1] || 0) + '/symbol');
  console.log('row store:   ' + rows.length + ' rows' + (dates.length ? ', span ' + dates[0] + ' .. ' + dates[dates.length - 1] : ''));
  console.log('by month:    ' + (monthHistogram(rows) || '(empty)'));
  const today = new Date().toISOString().slice(0, 10);
  const newest = dates[dates.length - 1] || '(none)';
  const staleMeta = syms.length > 0 && (rows.length < ledgerTotal * 0.5 || legacy.length > 0);

  /* ---- 2. repair ---- */
  if (staleMeta) {
    console.warn('STALE/LEGACY META: ' + legacy.length + ' range-only entries' +
      (rows.length < ledgerTotal * 0.5 ? ', and the row store (' + rows.length + ') is far below the ledger (' + ledgerTotal + ')' : '') +
      ' - the walk would skip its old span forever.');
    if (REPAIR) {
      console.log('REPAIR: clearing calibration family + row store (self-rebuilding; live episodes untouched)...');
      [KEY, KEY + '_meta', KEY + '_rel', KEY + '_sig', KEY + '_txn'].forEach((k) => localStorage.removeItem(k));
      await clearRows();
      console.log('cleared. The next pass rebuilds from scratch with an exact ledger.');
    } else {
      console.log('REPAIR is off (REPAIR = false). Clear ' + KEY + '_txn etc manually, then re-run.');
      return;
    }
  } else {
    console.log('meta ledger looks healthy (exact date lists, rows consistent).');
  }

  /* ---- 3. drive to completion ---- */
  const driver = window.stoxRunEvCalibration ||
    (window.StoX && (window.StoX.runEvCalibration || window.StoX.stoxRunEvCalibration));
  if (typeof driver !== 'function') {
    console.error('No stoxRunEvCalibration() found on this page. Run whatever drives calibrateFromHistory in a LOOP until every symbol reports remaining === 0 / "up_to_date", then re-run this script to verify.');
    return;
  }
  console.log('\n== DRIVING stoxRunEvCalibration() until the row count plateaus ==');
  let prev = -1, flat = 0;
  for (let pass = 0; pass < 500; pass++) {
    try { await driver(); } catch (e) { console.error('driver threw:', e); break; }
    await sleep(300);                                   /* let async IndexedDB writes land */
    const n = (await readRows()).length;
    console.log('pass ' + pass + ': rows=' + n);
    if (n === prev) { if (++flat >= 2) { console.log('plateau reached - walk complete (or the driver is not advancing).'); break; } }
    else flat = 0;
    prev = n;
  }

  /* ---- 4. verify ---- */
  const rows2 = await readRows();
  const d2 = rows2.map((r) => r && r.date).filter(Boolean).sort();
  const bySym = {};
  rows2.forEach((r) => { const k = (r && r.sym) || '?'; bySym[k] = (bySym[k] || 0) + 1; });
  const perSym = Object.keys(bySym).map((k) => bySym[k]).sort((a, b) => a - b);
  console.log('\n== VERIFY ==');
  console.log('rows: ' + rows2.length + ' | span ' + (d2[0] || '?') + ' .. ' + (d2[d2.length - 1] || '?') + ' | median ' + (perSym[perSym.length >> 1] || 0) + ' rows/symbol');
  console.log('by month: ' + (monthHistogram(rows2) || '(empty)'));
  const okRecent = d2.length && (new Date(today) - new Date(d2[d2.length - 1])) < 14 * 86400000;
  console.log(okRecent
    ? 'OK: newest row is within ~2 weeks of today - export now (export-rows.js) and re-run the A/B with --holdout 0.5.'
    : 'NOT DONE: newest row ' + d2[d2.length - 1] + ' is stale vs today ' + today + ' - the driver is not reaching recent dates (check its data feed / loop budget).');
})();
