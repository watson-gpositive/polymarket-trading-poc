import fs from 'fs';
import { fetchActiveMarkets } from './polymarket/client.js';

function toPriceCents(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function getPair(m) {
  const arr = (m.outcomes || []).map(o => ({ name: o.name, p: toPriceCents(o.price) })).filter(x => x.p != null);
  if (arr.length !== 2) return null;
  return arr;
}

function bucket(cat='unknown') {
  const c = cat.toLowerCase();
  if (c.includes('politic')) return 'politics';
  if (c.includes('crypto') || c.includes('bitcoin') || c.includes('ethereum')) return 'crypto';
  return 'other';
}

const markets = await fetchActiveMarkets(1500);
const rows = [];
for (const m of markets) {
  const pair = getPair(m);
  if (!pair) continue;
  const sum = pair[0].p + pair[1].p;
  const strictEdge = 98 - sum; // assumes 2% winning payout fee
  rows.push({
    marketId: m.id,
    title: m.title,
    category: m.category,
    bucket: bucket(m.category),
    pA: pair[0].p,
    pB: pair[1].p,
    sum,
    strictEdge
  });
}

const strict = rows.filter(r => r.strictEdge > 0).sort((a,b)=>b.strictEdge-a.strictEdge);
const near = rows.filter(r => r.sum <= 101).sort((a,b)=>a.sum-b.sum).slice(0,50);

const byBucket = ['politics','crypto','other'].reduce((acc,b)=>{
  const items = rows.filter(r=>r.bucket===b);
  acc[b] = {
    markets: items.length,
    strictArb: items.filter(r=>r.strictEdge>0).length,
    atOrUnder100: items.filter(r=>r.sum<=100).length,
    at101: items.filter(r=>r.sum===101).length
  };
  return acc;
}, {});

const report = {
  ts: new Date().toISOString(),
  sample: {
    activeMarketsFetched: markets.length,
    twoOutcomePricedMarkets: rows.length
  },
  summary: {
    strictArbCount: strict.length,
    atOrUnder100Count: rows.filter(r=>r.sum<=100).length,
    exactly100Count: rows.filter(r=>r.sum===100).length,
    exactly101Count: rows.filter(r=>r.sum===101).length
  },
  byBucket,
  strictTop: strict.slice(0,20),
  nearTop: near.slice(0,20)
};

fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync('logs/paper-report-v1.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
