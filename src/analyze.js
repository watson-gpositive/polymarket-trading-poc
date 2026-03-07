import { fetchActiveMarkets } from './polymarket/client.js';

function toPriceCents(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function outcomePrices(m) {
  const arr = (m.outcomes || []).map(o => toPriceCents(o.price)).filter(v => v != null);
  if (arr.length !== 2) return null;
  return arr;
}

const markets = await fetchActiveMarkets(1000);
const rows = [];
for (const m of markets) {
  const p = outcomePrices(m);
  if (!p) continue;
  const sum = p[0] + p[1];
  rows.push({ id: m.id, title: m.title, category: m.category, p0: p[0], p1: p[1], sum });
}

rows.sort((a,b)=>a.sum-b.sum);
const stats = {
  totalActive: markets.length,
  twoOutcomeWithPrices: rows.length,
  under100: rows.filter(r=>r.sum<100).length,
  at100: rows.filter(r=>r.sum===100).length,
  over100: rows.filter(r=>r.sum>100).length,
  minSum: rows[0]?.sum ?? null,
  maxSum: rows.at(-1)?.sum ?? null,
};

console.log(JSON.stringify({stats, topCheapest: rows.slice(0,15)}, null, 2));
