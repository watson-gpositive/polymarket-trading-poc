import fs from 'fs';
import path from 'path';

const root = process.cwd();
const logsDir = path.resolve(root, 'logs');
const comparePath = path.resolve(logsDir, 'compare-latest.json');
const eventsPath = path.resolve(logsDir, 'events.jsonl');

if (!fs.existsSync(comparePath) || !fs.existsSync(eventsPath)) {
  console.error('Missing compare-latest.json or events.jsonl');
  process.exit(1);
}

const compare = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
const rows = fs.readFileSync(eventsPath, 'utf8').split(/\r?\n/).filter(Boolean).map(l => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);

function computeBankrollPnl(prefix, bankrollEur = 5, feePct = 2) {
  const hedges = rows.filter(r => r.type === `${prefix}_hedge` && Number(r.hedgeQty || 0) > 0);
  let cost = 0;
  let payout = 0;
  let trades = 0;

  for (const h of hedges) {
    const totalCents = Number(h.totalCents || 0);
    const qty = Number(h.hedgeQty || 0);
    if (!qty || !totalCents) continue;

    const perShareCost = totalCents / 100;
    const maxQtyByBankroll = Math.max(0, Math.floor(bankrollEur / perShareCost));
    const q = Math.max(0, Math.min(qty, maxQtyByBankroll));
    if (!q) continue;

    cost += q * perShareCost;
    payout += q * (1 - feePct / 100);
    trades += 1;
  }

  return { trades, pnlEur: Number((payout - cost).toFixed(4)) };
}

function computeUnhedgedMinutes(prefix) {
  const entries = rows.filter(r => r.type === `${prefix}_entry`);
  const hedges = rows.filter(r => r.type === `${prefix}_hedge`);
  const byMarket = new Map();

  for (const e of entries) {
    const id = String(e.marketId);
    if (!byMarket.has(id)) byMarket.set(id, { entryTs: new Date(e.ts).getTime(), totalShares: Number(e.shares || 0), hedgedShares: 0, closedTs: null });
  }

  for (const h of hedges) {
    const id = String(h.marketId);
    const rec = byMarket.get(id);
    if (!rec) continue;
    rec.hedgedShares = Number(h.hedgedShares || rec.hedgedShares || 0);
    const totalShares = Number(h.totalShares || rec.totalShares || 0);
    if (totalShares > 0 && rec.hedgedShares >= totalShares) rec.closedTs = new Date(h.ts).getTime();
  }

  const closed = [...byMarket.values()].filter(x => x.entryTs && x.closedTs && x.closedTs > x.entryTs);
  if (!closed.length) return { closedCount: 0, avgMinutes: null, maxMinutes: null };

  const mins = closed.map(x => (x.closedTs - x.entryTs) / 60000);
  const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
  const max = Math.max(...mins);
  return { closedCount: closed.length, avgMinutes: Number(avg.toFixed(2)), maxMinutes: Number(max.toFixed(2)) };
}

function computeClosureRate(prefix) {
  const entries = rows.filter(r => r.type === `${prefix}_entry`);
  const hedges = rows.filter(r => r.type === `${prefix}_hedge`);
  const entryMarkets = new Set(entries.map(e => String(e.marketId)));
  const closedMarkets = new Set();
  for (const h of hedges) {
    const total = Number(h.totalShares || 0);
    const hedged = Number(h.hedgedShares || 0);
    if (total > 0 && hedged >= total) closedMarkets.add(String(h.marketId));
  }
  return entryMarkets.size ? closedMarkets.size / entryMarkets.size : 0;
}

function suggest(report) {
  const c = report.scriptC;
  const d = report.scriptD;
  const notes = [];

  if ((c.closureRate ?? 0) > (d.closureRate ?? 0)) notes.push('Script C έχει καλύτερο hedge closure rate από το D.');
  else notes.push('Script D έχει καλύτερο ή ίσο hedge closure rate από το C.');

  if ((d.urgentHedgeShare ?? 0) > 0.5) notes.push('Το Script D βασίζεται πολύ σε urgent hedges, θέλει tuning.');
  if ((c.urgentHedgeShare ?? 0) > 0.5) notes.push('Το Script C βασίζεται πολύ σε urgent hedges, θέλει tuning.');

  if ((report.pnl5?.scriptD?.pnlEur ?? 0) < (report.pnl5?.scriptC?.pnlEur ?? 0)) notes.push('Με bankroll €5, το Script C είναι πιο ασφαλές από το D προς το παρόν.');
  else notes.push('Με bankroll €5, το Script D δείχνει καλύτερο ή ίσο αποτέλεσμα από το C.');

  return notes;
}

const report = {
  ts: new Date().toISOString(),
  compare: {
    scriptA: compare.scriptA,
    scriptB: compare.scriptB,
    scriptC: { ...compare.scriptC, closureRate: computeClosureRate('script_c') },
    scriptD: { ...compare.scriptD, closureRate: computeClosureRate('script_d') },
  },
  pnl5: { scriptC: computeBankrollPnl('script_c', 5, 2), scriptD: computeBankrollPnl('script_d', 5, 2) },
  pnl50: { scriptC: computeBankrollPnl('script_c', 50, 2), scriptD: computeBankrollPnl('script_d', 50, 2) },
  pnl500: { scriptC: computeBankrollPnl('script_c', 500, 2), scriptD: computeBankrollPnl('script_d', 500, 2) },
  exposure: { scriptC: computeUnhedgedMinutes('script_c'), scriptD: computeUnhedgedMinutes('script_d') },
};

report.suggestions = suggest({
  ...report.compare,
  pnl5: report.pnl5,
});

const summaryLines = [
  `[${new Date().toISOString()}] Decision checkpoint`,
  `KPI 1 Hedge closure rate: C=${(report.compare.scriptC?.closureRate ?? 0).toFixed(3)} D=${(report.compare.scriptD?.closureRate ?? 0).toFixed(3)}`,
  `  meaning: πόσο συχνά ένα entry καταφέρνει να κλείσει hedge (υψηλότερο = πιο ασφαλές).`,
  `KPI 2 Urgent hedge share: C=${(report.compare.scriptC?.urgentHedgeShare ?? 0).toFixed(3)} D=${(report.compare.scriptD?.urgentHedgeShare ?? 0).toFixed(3)}`,
  `  meaning: πόσα hedges έγιναν "στο όριο" (χαμηλότερο = καλύτερη ποιότητα execution).`,
  `KPI 3 Bankroll PnL (€5/€50/€500): C=${report.pnl5.scriptC.pnlEur}/${report.pnl50.scriptC.pnlEur}/${report.pnl500.scriptC.pnlEur} D=${report.pnl5.scriptD.pnlEur}/${report.pnl50.scriptD.pnlEur}/${report.pnl500.scriptD.pnlEur}`,
  `  meaning: πόσο αποδίδει η ίδια λογική σε μικρό/μεσαίο/μεγαλύτερο κεφάλαιο.`,
  `KPI 4 Unhedged exposure time (avg min): C=${report.exposure.scriptC.avgMinutes ?? 'n/a'} D=${report.exposure.scriptD.avgMinutes ?? 'n/a'}`,
  `  meaning: πόση ώρα μένει ακάλυπτη θέση πριν κλείσει hedge (χαμηλότερο = λιγότερο ρίσκο).`,
  `Suggestions:`,
  ...report.suggestions.map(s => `- ${s}`),
];

fs.writeFileSync(path.resolve(logsDir, 'decision-kpis-latest.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.resolve(logsDir, 'decision-kpis-latest.txt'), summaryLines.join('\n') + '\n');
console.log(summaryLines.join('\n'));
