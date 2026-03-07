import { config } from './utils/config.js';
import { logEvent } from './utils/logger.js';
import { fetchActiveMarkets } from './polymarket/client.js';
import { assessYesPairDepth } from './engine/depthCheck.js';

const inventory = new Map();
let tickNo = 0;

function toPriceCents(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function modeParams() {
  if (config.v2Mode === 'mimic_d9e0') return { entryMin: 18, entryMax: 65, hedgeMax: 100, marketBias: 'sports' };
  return { entryMin: 20, entryMax: 80, hedgeMax: 101, marketBias: 'crypto' };
}

function classifyMarket(title = '', slug = '') {
  const t = `${title} ${slug}`.toLowerCase();
  if (/bitcoin|btc|eth|ethereum|solana|xrp|crypto|up or down|updown/.test(t)) return 'crypto';
  if (/nba|nhl|mlb|nfl|soccer|football|premier|vs\.|vs |cbb|fifa|ufc|tennis/.test(t)) return 'sports';
  if (/election|president|trump|biden|senate|house|politic/.test(t)) return 'politics';
  return 'other';
}

function getCandidates(markets) {
  const p = modeParams();
  const out = [];
  for (const m of markets) {
    if (!Array.isArray(m.outcomes) || m.outcomes.length !== 2) continue;
    const c = classifyMarket(m.title, m.raw?.slug ?? '');
    if (p.marketBias !== 'all' && c !== p.marketBias) continue;
    const p0 = toPriceCents(m.outcomes[0]?.price);
    const p1 = toPriceCents(m.outcomes[1]?.price);
    if (p0 == null || p1 == null) continue;
    const low = Math.min(p0, p1);
    const side = p0 <= p1 ? 0 : 1;
    if (low < p.entryMin || low > p.entryMax) continue;

    out.push({
      marketId: m.id, title: m.title, category: c, p0, p1, side, low, type: 'YES_PAIR_ARB',
      legs: [
        { outcome: m.outcomes[0]?.name ?? 'A', tokenId: m.outcomes[0]?.tokenId, targetPriceCents: p0 },
        { outcome: m.outcomes[1]?.name ?? 'B', tokenId: m.outcomes[1]?.tokenId, targetPriceCents: p1 }
      ]
    });
  }
  return out.sort((a, b) => a.low - b.low).slice(0, 60);
}

function rebalance(position, c) {
  const hedgePrice = position.side === 0 ? c.p1 : c.p0;
  const total = position.entryPriceCents + hedgePrice;
  const p = modeParams();
  const age = tickNo - position.openTick;
  const strictMax = Math.min(config.cHedgeMaxTotalCents, p.hedgeMax);
  const dynamicMax = Math.min(104, strictMax + Math.floor(age / 2));
  const remaining = Math.max(0, position.totalShares - position.hedgedShares);

  if (total <= strictMax) {
    position.hedgedShares += remaining;
    return { hedged: true, total, qty: remaining, closeAll: true };
  }
  if (age >= config.cHedgeUrgencyTicks && total <= dynamicMax) {
    const qty = Math.min(remaining, config.v2RebalanceStepShares);
    position.hedgedShares += qty;
    return { hedged: true, total, qty, urgent: true, dynamicMax };
  }
  return { hedged: false, total, dynamicMax };
}

async function tick() {
  tickNo += 1;
  const markets = await fetchActiveMarkets(500);
  const cands = getCandidates(markets);
  let depthPassed = 0, entries = 0, hedges = 0, urgentHedges = 0;

  for (const c of cands) {
    if ([...inventory.values()].filter(x => x.hedgedShares < x.totalShares).length >= config.cMaxOpenPositions) break;
    const depth = await assessYesPairDepth(c, config);
    if (!depth.ok) continue;
    depthPassed += 1;

    const key = String(c.marketId);
    const existing = inventory.get(key);
    if (!existing) {
      inventory.set(key, { marketId: c.marketId, title: c.title, category: c.category, side: c.side, entryPriceCents: c.side === 0 ? c.p0 : c.p1, totalShares: config.cTargetSharesPerTrade, hedgedShares: 0, openTick: tickNo });
      entries += 1;
      logEvent('script_c_entry', { marketId: c.marketId, title: c.title, category: c.category, side: c.side, entryPriceCents: c.side === 0 ? c.p0 : c.p1, shares: config.cTargetSharesPerTrade });
      continue;
    }

    if (existing.hedgedShares < existing.totalShares) {
      const res = rebalance(existing, c);
      if (res.hedged) {
        hedges += 1;
        if (res.urgent) urgentHedges += 1;
        logEvent('script_c_hedge', { marketId: c.marketId, title: c.title, urgent: Boolean(res.urgent), closeAll: Boolean(res.closeAll), hedgeQty: res.qty ?? 0, totalCents: res.total, hedgedShares: existing.hedgedShares, totalShares: existing.totalShares, dynamicMax: res.dynamicMax ?? null });
      }
    }
  }

  const openCount = [...inventory.values()].filter(x => x.hedgedShares < x.totalShares).length;
  const fullyHedged = [...inventory.values()].filter(x => x.hedgedShares >= x.totalShares).length;
  logEvent('script_c_tick_summary', { mode: config.v2Mode, tickNo, markets: markets.length, candidates: cands.length, depthPassed, entries, hedges, urgentHedges, openCount, fullyHedged });
}

async function main() {
  logEvent('script_c_startup', {
    loopIntervalSec: config.loopIntervalSec,
    mode: config.v2Mode,
    cMaxOpenPositions: config.cMaxOpenPositions,
    cTargetSharesPerTrade: config.cTargetSharesPerTrade,
    v2RebalanceStepShares: config.v2RebalanceStepShares,
    cHedgeMaxTotalCents: config.cHedgeMaxTotalCents,
    cHedgeUrgencyTicks: config.cHedgeUrgencyTicks
  });
  await tick();
  if (process.env.RUN_ONCE === 'true') return;
  setInterval(() => tick().catch(err => logEvent('script_c_tick_error', { error: String(err) })), config.loopIntervalSec * 1000);
}

main().catch(err => {
  logEvent('script_c_fatal', { error: String(err) });
  process.exit(1);
});
