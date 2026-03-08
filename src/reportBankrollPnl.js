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

function evalFromHedges(prefix) {
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

function evalScriptA2() {
  const trades = rows.filter(r => r.type === 'script_a2_trade');
  let pnl = 0;
  let counted = 0;
  for (const t of trades) {
    const sumCents = Number(t.sumCents || 0);
    const microShares = Number(t.microShares || 0);
    const gross = Number(t.hedgedGrossEur || 0);
    if (!sumCents || !microShares || !Number.isFinite(gross)) continue;

    const perShareCost = sumCents / 100;
    const q = Math.min(microShares, Math.max(0, Math.floor(bankrollEur / perShareCost)));
    if (!q) continue;

    pnl += (gross / microShares) * q;
    counted += 1;
  }
  return { tradesCounted: counted, pnlEur: Number(pnl.toFixed(4)), note: 'from script_a2_trade events' };
}

function evalScriptB() {
  const hedges = rows.filter(r => r.type === 'inventory_hedge' && Number(r.shares || 0) > 0);
  let cost = 0;
  let payout = 0;
  let scaledTrades = 0;

  for (const h of hedges) {
    const totalCents = Number(h.totalCents || 0);
    const qty = Number(h.shares || 0);
    if (!qty || !totalCents) continue;

    const perShareCost = totalCents / 100;
    const maxQtyByBankroll = Math.max(0, Math.floor(bankrollEur / perShareCost));
    const q = Math.max(0, Math.min(qty, maxQtyByBankroll));
    if (!q) continue;

    cost += q * perShareCost;
    payout += q * (1 - feePct / 100);
    scaledTrades += 1;
  }

  return {
    tradesCounted: scaledTrades,
    totalCostEur: Number(cost.toFixed(4)),
    totalPayoutEur: Number(payout.toFixed(4)),
    pnlEur: Number((payout - cost).toFixed(4)),
    note: 'estimated from inventory_hedge events'
  };
}

function evalScriptAEstimate() {
  const planned = rows.filter(r => r.type === 'paper_order_planned');
  let pnl = 0;
  let counted = 0;

  for (const p of planned) {
    const edgeCents = Number(p.edgeCents || 0);
    if (!edgeCents) continue;
    const assumedPairCost = 1.0; // conservative: lock ~1€ notional per paired share
    const q = Math.max(0, Math.floor(bankrollEur / assumedPairCost));
    if (!q) continue;
    // estimated net after winner fee
    const netPerShare = (edgeCents / 100) - (feePct / 100);
    pnl += q * netPerShare;
    counted += 1;
  }

  return {
    tradesCounted: counted,
    pnlEur: Number(pnl.toFixed(4)),
    note: 'rough estimate from planned opportunities, not realized fills'
  };
}

const report = {
  ts: new Date().toISOString(),
  assumptions: { bankrollEur, feePct, note: 'paper approximation from event logs' },
  scriptA: evalScriptAEstimate(),
  scriptA2: evalScriptA2(),
  scriptB: evalScriptB(),
  scriptC: evalFromHedges('script_c'),
  scriptD: evalFromHedges('script_d')
};

const out = path.resolve(process.cwd(), 'logs', 'bankroll-pnl-latest.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
