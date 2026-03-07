import fs from 'fs';
import path from 'path';

const logPath = path.resolve(process.cwd(), 'logs', 'events.jsonl');
if (!fs.existsSync(logPath)) {
  console.error('events.jsonl not found');
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
const rows = lines.map(l => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);

const A = {
  script: 'A_strict_pair_arb',
  ticks: 0,
  opportunities: 0,
  depthChecked: 0,
  tradableAfterDepth: 0,
  accepted: 0,
  partialSimulations: 0,
};

const B = {
  script: 'B_inventory_dynamic_hedge',
  ticks: 0,
  candidates: 0,
  depthPassed: 0,
  entries: 0,
  hedges: 0,
  openCountLast: 0,
  hedgedCountLast: 0,
};

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
}

const B2 = {
  script: 'B_v2_mimic_inventory_hedge',
  ticks: 0,
  candidates: 0,
  depthPassed: 0,
  entries: 0,
  hedges: 0,
  urgentHedges: 0,
  openCountLast: 0,
  fullyHedgedLast: 0,
};

for (const r of rows) {
  if (r.type === 'inventory_v2_tick_summary') {
    B2.ticks += 1;
    B2.candidates += Number(r.candidates || 0);
    B2.depthPassed += Number(r.depthPassed || 0);
    B2.entries += Number(r.entries || 0);
    B2.hedges += Number(r.hedges || 0);
    B2.urgentHedges += Number(r.urgentHedges || 0);
    B2.openCountLast = Number(r.openCount || 0);
    B2.fullyHedgedLast = Number(r.fullyHedged || 0);
  }
}

const report = {
  ts: new Date().toISOString(),
  window: { firstTs, lastTs, totalRows: rows.length },
  scriptA: {
    ...A,
    avgOpportunitiesPerTick: A.ticks ? A.opportunities / A.ticks : 0,
    avgTradableAfterDepthPerTick: A.ticks ? A.tradableAfterDepth / A.ticks : 0,
  },
  scriptB: {
    ...B,
    avgCandidatesPerTick: B.ticks ? B.candidates / B.ticks : 0,
    avgDepthPassedPerTick: B.ticks ? B.depthPassed / B.ticks : 0,
    hedgeRatePerEntry: B.entries ? B.hedges / B.entries : 0,
  },
  scriptBv2: {
    ...B2,
    avgCandidatesPerTick: B2.ticks ? B2.candidates / B2.ticks : 0,
    avgDepthPassedPerTick: B2.ticks ? B2.depthPassed / B2.ticks : 0,
    hedgeRatePerEntry: B2.entries ? B2.hedges / B2.entries : 0,
    urgentHedgeShare: B2.hedges ? B2.urgentHedges / B2.hedges : 0,
  }
};

const outPath = path.resolve(process.cwd(), 'logs', 'compare-latest.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
