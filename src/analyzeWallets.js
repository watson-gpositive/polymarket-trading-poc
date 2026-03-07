import fs from 'fs';

const wallets = {
  '0x732F1': { user: '0x732f189193d7a8c8bc8d8eb91f501a22736af081', path: '0x732F1' },
  '0xD9E0AACa471f48F91A26E8669A805f2': { user: '0xd9e0aaca471f489be338fd0f91a26e8669a805f2', path: '0xD9E0AACa471f48F91A26E8669A805f2' }
};

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function classify(title = '', slug = '') {
  const t = `${title} ${slug}`.toLowerCase();
  if (/nba|nhl|mlb|nfl|soccer|football|premier|vs\.|vs |cbb|fifa|ufc|tennis/.test(t)) return 'sports';
  if (/bitcoin|btc|eth|ethereum|solana|xrp|crypto|up or down|updown/.test(t)) return 'crypto';
  if (/election|president|trump|biden|senate|house|politic/.test(t)) return 'politics';
  return 'other';
}

async function fetchTrades(user, cap = 3000) {
  const out = [];
  const page = 500;
  for (let offset = 0; offset < cap; offset += page) {
    try {
      const arr = await getJson(`https://data-api.polymarket.com/trades?user=${user}&limit=${page}&offset=${offset}`);
      if (!Array.isArray(arr) || arr.length === 0) break;
      out.push(...arr);
      if (arr.length < page) break;
    } catch {
      break;
    }
  }
  return out;
}

function analyzeTrades(trades) {
  const bySide = { BUY: 0, SELL: 0 };
  const categoryCounts = { sports: 0, crypto: 0, politics: 0, other: 0 };
  let totalNotional = 0;
  let totalSize = 0;
  const events = new Set();
  const condMap = new Map();

  for (const tr of trades) {
    bySide[tr.side] = (bySide[tr.side] || 0) + 1;
    const size = Number(tr.size) || 0;
    const price = Number(tr.price) || 0;
    totalSize += size;
    totalNotional += size * price;
    events.add(tr.eventSlug || tr.slug || tr.conditionId);
    categoryCounts[classify(tr.title, tr.slug)] += 1;

    if (!condMap.has(tr.conditionId)) condMap.set(tr.conditionId, []);
    condMap.get(tr.conditionId).push(tr);
  }

  let dualOutcomeConditions = 0;
  let fastHedgeSignals = 0;

  for (const arr of condMap.values()) {
    const outcomes = new Set(arr.map(x => x.outcomeIndex));
    if (outcomes.size < 2) continue;
    dualOutcomeConditions += 1;

    const sorted = arr.slice().sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (a.side === 'BUY' && b.side === 'BUY' && a.outcomeIndex !== b.outcomeIndex && (b.timestamp - a.timestamp) <= 120) {
        fastHedgeSignals += 1;
        break;
      }
    }
  }

  return {
    trades: trades.length,
    bySide,
    uniqueEvents: events.size,
    avgTradeSize: trades.length ? totalSize / trades.length : 0,
    avgTradeNotional: trades.length ? totalNotional / trades.length : 0,
    categoryCounts,
    dualOutcomeConditions,
    fastHedgeSignals
  };
}

async function fetchProfile(path) {
  const html = await (await fetch(`https://polymarket.com/@${path}`)).text();
  const s = html.indexOf('<script id="__NEXT_DATA__"');
  const a = html.indexOf('>', s) + 1;
  const b = html.indexOf('</script>', a);
  const o = JSON.parse(html.slice(a, b));
  const queries = o.props.pageProps.dehydratedState.queries;
  const find = pred => queries.find(x => pred(x.queryKey))?.state?.data;

  return {
    stats: find(k => Array.isArray(k) && k[0] === 'user-stats'),
    volume: find(k => Array.isArray(k) && k[0] === '/api/profile/volume'),
    positionsValue: find(k => Array.isArray(k) && k[0] === 'positions' && k[1] === 'value')
  };
}

async function main() {
  const report = { ts: new Date().toISOString(), wallets: {} };

  for (const [label, w] of Object.entries(wallets)) {
    const profile = await fetchProfile(w.path);
    const trades = await fetchTrades(w.user, 3000);
    report.wallets[label] = {
      user: w.user,
      profile,
      analysis: analyzeTrades(trades),
      recentTrades: trades.slice(0, 10)
    };
  }

  fs.mkdirSync('logs', { recursive: true });
  fs.writeFileSync('logs/wallet-analysis-v1.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
