import { config } from './utils/config.js';
import { logEvent } from './utils/logger.js';
import { fetchActiveMarkets } from './polymarket/client.js';
import { assessYesPairDepth } from './engine/depthCheck.js';

const inv = new Map();
let tickNo = 0;

function toCents(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function category(title = '', slug = '') {
  const t = `${title} ${slug}`.toLowerCase();
  if (/bitcoin|btc|eth|ethereum|solana|xrp|crypto|up or down|updown/.test(t)) return 'crypto';
  if (/nba|nhl|mlb|nfl|soccer|football|premier|vs\.|vs |cbb|fifa|ufc|tennis/.test(t)) return 'sports';
  if (/election|president|trump|biden|senate|house|politic/.test(t)) return 'politics';
  return 'other';
}

function caps() {
  const maxOpen = Math.min(config.v2MaxOpenPositions, config.dMaxOpenPositions);
  return {
    total: maxOpen,
    perCat: {
      crypto: Math.max(1, Math.floor(maxOpen * 0.4)),
      sports: Math.max(1, Math.floor(maxOpen * 0.4)),
      politics: Math.max(1, Math.floor(maxOpen * 0.2)),
      other: Math.max(1, Math.floor(maxOpen * 0.1)),
    }
  };
}

function candidates(markets) {
  const out = [];
  for (const m of markets) {
    if (!Array.isArray(m.outcomes) || m.outcomes.length !== 2) continue;
    const p0 = toCents(m.outcomes[0]?.price);
    const p1 = toCents(m.outcomes[1]?.price);
    if (p0 == null || p1 == null) continue;
    const low = Math.min(p0, p1);
    if (low < config.dMinEntryPriceCents || low > config.dMaxEntryPriceCents) continue;
    const side = p0 <= p1 ? 0 : 1;
    out.push({ marketId: m.id, title: m.title, c: category(m.title, m.raw?.slug ?? ''), p0, p1, side, low, type: 'YES_PAIR_ARB', legs: [
      { outcome: m.outcomes[0]?.name ?? 'A', tokenId: m.outcomes[0]?.tokenId, targetPriceCents: p0 },
      { outcome: m.outcomes[1]?.name ?? 'B', tokenId: m.outcomes[1]?.tokenId, targetPriceCents: p1 }
    ]});
  }
  return out.sort((a,b)=>a.low-b.low).slice(0,80);
}

function openByCategory() {
  const out = { crypto: 0, sports: 0, politics: 0, other: 0 };
  for (const p of inv.values()) if (p.hedgedShares < p.totalShares) out[p.category] = (out[p.category] || 0) + 1;
  return out;
}

function rebalance(pos, cand) {
  const age = tickNo - pos.openTick;
  const hedgePrice = pos.side === 0 ? cand.p1 : cand.p0;
  const total = pos.entryPriceCents + hedgePrice;
  const strictMax = Math.min(101, 100 - config.dMinNetEdgeCents);
  const dynamicMax = strictMax; // disable relaxed urgency hedges that lock losses
  const remaining = Math.max(0, pos.totalShares - pos.hedgedShares);

  if (total <= strictMax) {
    pos.hedgedShares += remaining;
    return { ok: true, qty: remaining, total, closeAll: true };
  }
  if (age >= 3 && total <= dynamicMax) {
    const qty = Math.min(remaining, Math.max(10, Math.floor(config.v2RebalanceStepShares * 0.75)));
    pos.hedgedShares += qty;
    return { ok: true, qty, total, urgent: true, dynamicMax };
  }

  if (age >= config.dMaxExposureTicks && total <= 100) {
    pos.hedgedShares += remaining;
    return { ok: true, qty: remaining, total, forced: true, closeAll: true, dynamicMax };
  }

  return { ok: false, total, dynamicMax };
}

async function tick() {
  if (!config.dEnabled) {
    logEvent('script_d_paused', { reason: 'D_ENABLED=false' });
    return;
  }
  tickNo += 1;
  const m = await fetchActiveMarkets(500);
  const cands = candidates(m);
  const limits = caps();

  let depthPassed = 0, entries = 0, hedges = 0, urgentHedges = 0, forcedHedges = 0, skippedByCap = 0;
  let entryBudget = config.dMaxNewEntriesPerTick;

  for (const c of cands) {
    const open = [...inv.values()].filter(x => x.hedgedShares < x.totalShares).length;
    if (open >= limits.total) break;
    const openCat = openByCategory();
    if ((openCat[c.c] || 0) >= (limits.perCat[c.c] || 1)) { skippedByCap++; continue; }

    const depth = await assessYesPairDepth(c, config);
    if (!depth.ok) continue;
    depthPassed += 1;

    const key = String(c.marketId);
    const existing = inv.get(key);
    if (!existing) {
      if (entryBudget <= 0) continue;
      inv.set(key, { marketId: c.marketId, title: c.title, category: c.c, side: c.side, entryPriceCents: c.side === 0 ? c.p0 : c.p1, totalShares: config.targetSharesPerTrade, hedgedShares: 0, openTick: tickNo });
      entries += 1;
      entryBudget -= 1;
      logEvent('script_d_entry', { marketId: c.marketId, title: c.title, category: c.c, side: c.side, entryPriceCents: c.side === 0 ? c.p0 : c.p1, shares: config.targetSharesPerTrade });
      continue;
    }

    if (existing.hedgedShares < existing.totalShares) {
      const r = rebalance(existing, c);
      if (r.ok) {
        hedges += 1;
        if (r.urgent) urgentHedges += 1;
        if (r.forced) forcedHedges += 1;
        logEvent('script_d_hedge', { marketId: c.marketId, title: c.title, urgent: Boolean(r.urgent), forced: Boolean(r.forced), closeAll: Boolean(r.closeAll), hedgeQty: r.qty, totalCents: r.total, hedgedShares: existing.hedgedShares, totalShares: existing.totalShares, dynamicMax: r.dynamicMax ?? null });
      }
    }
  }

  const openCount = [...inv.values()].filter(x => x.hedgedShares < x.totalShares).length;
  const fullyHedged = [...inv.values()].filter(x => x.hedgedShares >= x.totalShares).length;
  logEvent('script_d_tick_summary', { tickNo, markets: m.length, candidates: cands.length, depthPassed, entries, hedges, urgentHedges, forcedHedges, skippedByCap, openCount, fullyHedged });
}

async function main() {
  logEvent('script_d_startup', {
    loopIntervalSec: config.loopIntervalSec,
    maxOpenPositions: Math.min(config.v2MaxOpenPositions, config.dMaxOpenPositions),
    dMaxOpenPositions: config.dMaxOpenPositions,
    rebalanceStep: config.v2RebalanceStepShares,
    dMaxNewEntriesPerTick: config.dMaxNewEntriesPerTick,
    dMinEntryPriceCents: config.dMinEntryPriceCents,
    dMaxEntryPriceCents: config.dMaxEntryPriceCents,
    dMaxExposureTicks: config.dMaxExposureTicks,
    dMinNetEdgeCents: config.dMinNetEdgeCents
  });
  await tick();
  if (process.env.RUN_ONCE === 'true') return;
  setInterval(() => tick().catch(err => logEvent('script_d_tick_error', { error: String(err) })), config.loopIntervalSec * 1000);
}

main().catch(err => {
  logEvent('script_d_fatal', { error: String(err) });
  process.exit(1);
});
