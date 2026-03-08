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

function computeScriptEPnl(bankrollEur = 5) {
  const trades = rows.filter(r => r.type === 'script_e_trade');
  let pnl = 0;
  let counted = 0;
  for (const t of trades) {
    const qty = Number(t.qty || 0);
    const perShareCost = (100 - Number(t.spreadCents || 0)) / 100;
    const maxQty = Math.max(0, Math.floor(bankrollEur / Math.max(0.01, perShareCost)));
    const q = Math.min(qty, maxQty);
    if (!q) continue;
    pnl += Number(t.netPerShareEur || 0) * q;
    counted += 1;
  }
  return { trades: counted, pnlEur: Number(pnl.toFixed(4)) };
}

function computeScriptBBankrollPnl(bankrollEur = 5, feePct = 2) {
  const hedges = rows.filter(r => r.type === 'inventory_hedge' && Number(r.shares || 0) > 0);
  let cost = 0;
  let payout = 0;
  let trades = 0;
  for (const h of hedges) {
    const totalCents = Number(h.totalCents || 0);
    const qty = Number(h.shares || 0);
    if (!qty || !totalCents) continue;
    const perShareCost = totalCents / 100;
    const q = Math.min(qty, Math.max(0, Math.floor(bankrollEur / perShareCost)));
    if (!q) continue;
    cost += q * perShareCost;
    payout += q * (1 - feePct / 100);
    trades += 1;
  }
  return { trades, pnlEur: Number((payout - cost).toFixed(4)) };
}

function computeScriptAEstimate(bankrollEur = 5, feePct = 2) {
  const planned = rows.filter(r => r.type === 'paper_order_planned');
  let pnl = 0;
  let trades = 0;
  for (const p of planned) {
    const edgeCents = Number(p.edgeCents || 0);
    if (!edgeCents) continue;
    const q = Math.max(0, Math.floor(bankrollEur / 1.0));
    if (!q) continue;
    pnl += q * ((edgeCents / 100) - (feePct / 100));
    trades += 1;
  }
  return { trades, pnlEur: Number(pnl.toFixed(4)) };
}

function computeScriptA2Pnl(bankrollEur = 5) {
  const trades = rows.filter(r => r.type === 'script_a2_trade');
  let pnl = 0;
  let counted = 0;
  for (const t of trades) {
    const sumCents = Number(t.sumCents || 0);
    const microShares = Number(t.microShares || 0);
    const gross = Number(t.hedgedGrossEur || 0);
    if (!sumCents || !microShares || !Number.isFinite(gross)) continue;

    const perShareCost = sumCents / 100;
    const baseQty = microShares;
    const maxQtyByBankroll = Math.max(0, Math.floor(bankrollEur / perShareCost));
    const q = Math.min(baseQty, maxQtyByBankroll);
    if (!q) continue;

    const perShareGross = gross / baseQty;
    pnl += perShareGross * q;
    counted += 1;
  }
  return { trades: counted, pnlEur: Number(pnl.toFixed(4)), note: 'from script_a2_trade events' };
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
    scriptA2: compare.scriptA2,
    scriptB: compare.scriptB,
    scriptC: { ...compare.scriptC, closureRate: computeClosureRate('script_c') },
    scriptD: { ...compare.scriptD, closureRate: computeClosureRate('script_d') },
    scriptE: compare.scriptE,
  },
  pnl5: {
    scriptA: computeScriptAEstimate(5, 2),
    scriptA2: computeScriptA2Pnl(5),
    scriptB: computeScriptBBankrollPnl(5, 2),
    scriptC: computeBankrollPnl('script_c', 5, 2),
    scriptD: computeBankrollPnl('script_d', 5, 2),
    scriptE: computeScriptEPnl(5)
  },
  pnl50: {
    scriptA: computeScriptAEstimate(50, 2),
    scriptA2: computeScriptA2Pnl(50),
    scriptB: computeScriptBBankrollPnl(50, 2),
    scriptC: computeBankrollPnl('script_c', 50, 2),
    scriptD: computeBankrollPnl('script_d', 50, 2),
    scriptE: computeScriptEPnl(50)
  },
  pnl500: {
    scriptA: computeScriptAEstimate(500, 2),
    scriptA2: computeScriptA2Pnl(500),
    scriptB: computeScriptBBankrollPnl(500, 2),
    scriptC: computeBankrollPnl('script_c', 500, 2),
    scriptD: computeBankrollPnl('script_d', 500, 2),
    scriptE: computeScriptEPnl(500)
  },
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
  `KPI 3 Bankroll PnL (€5/€50/€500): A=${report.pnl5.scriptA.pnlEur}/${report.pnl50.scriptA.pnlEur}/${report.pnl500.scriptA.pnlEur} A2=${report.pnl5.scriptA2.pnlEur}/${report.pnl50.scriptA2.pnlEur}/${report.pnl500.scriptA2.pnlEur} B=${report.pnl5.scriptB.pnlEur}/${report.pnl50.scriptB.pnlEur}/${report.pnl500.scriptB.pnlEur} C=${report.pnl5.scriptC.pnlEur}/${report.pnl50.scriptC.pnlEur}/${report.pnl500.scriptC.pnlEur} D=${report.pnl5.scriptD.pnlEur}/${report.pnl50.scriptD.pnlEur}/${report.pnl500.scriptD.pnlEur} E=${report.pnl5.scriptE.pnlEur}/${report.pnl50.scriptE.pnlEur}/${report.pnl500.scriptE.pnlEur}`,
  `  meaning: πόσο αποδίδει η ίδια λογική σε μικρό/μεσαίο/μεγαλύτερο κεφάλαιο.`,
  `KPI 4 Unhedged exposure time (avg min): C=${report.exposure.scriptC.avgMinutes ?? 'n/a'} D=${report.exposure.scriptD.avgMinutes ?? 'n/a'}`,
  `  meaning: πόση ώρα μένει ακάλυπτη θέση πριν κλείσει hedge (χαμηλότερο = λιγότερο ρίσκο).`,
  `Suggestions:`,
  ...report.suggestions.map(s => `- ${s}`),
];

fs.writeFileSync(path.resolve(logsDir, 'decision-kpis-latest.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.resolve(logsDir, 'decision-kpis-latest.txt'), summaryLines.join('\n') + '\n');
console.log(summaryLines.join('\n'));
