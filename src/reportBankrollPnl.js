import fs from 'fs';
import path from 'path';

const bankrollEur = Number(process.argv[2] || process.env.BANKROLL_EUR || 5);
const feePct = Number(process.argv[3] || process.env.WIN_FEE_PCT || 2); // winner payout fee approximation

const logPath = path.resolve(process.cwd(), 'logs', 'events.jsonl');
if (!fs.existsSync(logPath)) {
  console.error('events.jsonl not found');
  process.exit(1);
}

const rows = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).map(l => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);

function evalFor(prefix) {
  const hedges = rows.filter(r => r.type === `${prefix}_hedge` && Number(r.hedgeQty || 0) > 0);
  let cost = 0;
  let payout = 0;
  let scaledTrades = 0;

  for (const h of hedges) {
    const totalCents = Number(h.totalCents || 0);
    const qty = Number(h.hedgeQty || 0);
    if (!qty || !totalCents) continue;

    const perShareCost = totalCents / 100;
    const maxQtyByBankroll = Math.max(0, Math.floor(bankrollEur / perShareCost));
    const q = Math.max(0, Math.min(qty, maxQtyByBankroll));
    if (q === 0) continue;

    cost += q * perShareCost;
    payout += q * (1 - feePct / 100);
    scaledTrades += 1;
  }

  return {
    tradesCounted: scaledTrades,
    totalCostEur: Number(cost.toFixed(4)),
    totalPayoutEur: Number(payout.toFixed(4)),
    pnlEur: Number((payout - cost).toFixed(4)),
  };
}

const report = {
  ts: new Date().toISOString(),
  assumptions: { bankrollEur, feePct, note: 'paper approximation from hedge events only' },
  scriptC: evalFor('script_c'),
  scriptD: evalFor('script_d')
};

const out = path.resolve(process.cwd(), 'logs', 'bankroll-pnl-latest.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
