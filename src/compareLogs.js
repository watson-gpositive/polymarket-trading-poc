import fs from 'fs';
import path from 'path';

const logPath = path.resolve(process.cwd(), 'logs', 'events.jsonl');
if (!fs.existsSync(logPath)) {
  console.error('events.jsonl not found');
  process.exit(1);
}

const rows = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).map(l => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);

const A = { script: 'A_strict_pair_arb', ticks: 0, opportunities: 0, depthChecked: 0, tradableAfterDepth: 0, accepted: 0, partialSimulations: 0 };
const B = { script: 'B_inventory_dynamic_hedge', ticks: 0, candidates: 0, depthPassed: 0, entries: 0, hedges: 0, openCountLast: 0, hedgedCountLast: 0 };
const C = { script: 'C_mimic_inventory_hedge', ticks: 0, candidates: 0, depthPassed: 0, entries: 0, hedges: 0, urgentHedges: 0, openCountLast: 0, fullyHedgedLast: 0 };
const D = { script: 'D_capped_multi_category_hedge', ticks: 0, candidates: 0, depthPassed: 0, entries: 0, hedges: 0, urgentHedges: 0, skippedByCap: 0, openCountLast: 0, fullyHedgedLast: 0 };

let firstTs = null;
let lastTs = null;

for (const r of rows) {
  if (!firstTs) firstTs = r.ts;
  lastTs = r.ts;

  if (r.type === 'tick_summary') {
    A.ticks += 1;
    A.opportunities += Number(r.opportunities || 0);
    A.depthChecked += Number(r.depthChecked || 0);
    A.tradableAfterDepth += Number(r.tradableAfterDepth || 0);
    A.accepted += Number(r.accepted || 0);
    A.partialSimulations += Number(r.partialSimulations || 0);
  }
  if (r.type === 'inventory_tick_summary') {
    B.ticks += 1;
    B.candidates += Number(r.candidates || 0);
    B.depthPassed += Number(r.depthPassed || 0);
    B.entries += Number(r.entries || 0);
    B.hedges += Number(r.hedges || 0);
    B.openCountLast = Number(r.openCount || 0);
    B.hedgedCountLast = Number(r.hedgedCount || 0);
  }
  if (r.type === 'script_c_tick_summary') {
    C.ticks += 1;
    C.candidates += Number(r.candidates || 0);
    C.depthPassed += Number(r.depthPassed || 0);
    C.entries += Number(r.entries || 0);
    C.hedges += Number(r.hedges || 0);
    C.urgentHedges += Number(r.urgentHedges || 0);
    C.openCountLast = Number(r.openCount || 0);
    C.fullyHedgedLast = Number(r.fullyHedged || 0);
  }
  if (r.type === 'script_d_tick_summary') {
    D.ticks += 1;
    D.candidates += Number(r.candidates || 0);
    D.depthPassed += Number(r.depthPassed || 0);
    D.entries += Number(r.entries || 0);
    D.hedges += Number(r.hedges || 0);
    D.urgentHedges += Number(r.urgentHedges || 0);
    D.skippedByCap += Number(r.skippedByCap || 0);
    D.openCountLast = Number(r.openCount || 0);
    D.fullyHedgedLast = Number(r.fullyHedged || 0);
  }
}

const withAvg = s => ({
  ...s,
  avgCandidatesPerTick: s.ticks ? s.candidates / s.ticks : undefined,
  avgDepthPassedPerTick: s.ticks ? s.depthPassed / s.ticks : undefined,
  hedgeRatePerEntry: s.entries ? s.hedges / s.entries : undefined,
});

const report = {
  ts: new Date().toISOString(),
  window: { firstTs, lastTs, totalRows: rows.length },
  scriptA: {
    ...A,
    avgOpportunitiesPerTick: A.ticks ? A.opportunities / A.ticks : 0,
    avgTradableAfterDepthPerTick: A.ticks ? A.tradableAfterDepth / A.ticks : 0,
  },
  scriptB: withAvg(B),
  scriptC: { ...withAvg(C), urgentHedgeShare: C.hedges ? C.urgentHedges / C.hedges : 0 },
  scriptD: { ...withAvg(D), urgentHedgeShare: D.hedges ? D.urgentHedges / D.hedges : 0 },
};

const outPath = path.resolve(process.cwd(), 'logs', 'compare-latest.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
