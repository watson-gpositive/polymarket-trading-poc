import { config } from './utils/config.js';
import { logEvent } from './utils/logger.js';
import { fetchActiveMarkets } from './polymarket/client.js';
import { assessYesPairDepth } from './engine/depthCheck.js';

const inventory = new Map(); // key marketId => { side:0|1, shares, entryPriceCents, hedged, openTick }
let tickNo = 0;

function toPriceCents(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function pickCandidates(markets) {
  const out = [];
  for (const m of markets) {
    if (!Array.isArray(m.outcomes) || m.outcomes.length !== 2) continue;
    const p0 = toPriceCents(m.outcomes[0]?.price);
    const p1 = toPriceCents(m.outcomes[1]?.price);
    if (p0 == null || p1 == null) continue;

    // inventory style: enter one side when it's cheap enough and liquid
    const low = Math.min(p0, p1);
    const side = p0 <= p1 ? 0 : 1;
    const total = p0 + p1;
    if (low < config.invEntryMinPriceCents) continue;
    if (low > config.invEntryMaxPriceCents) continue;
    const maxTotalByEdge = 100 - config.bMinNetEdgeCents;
    if (total > Math.min(config.bMaxEntryTotalCents, maxTotalByEdge)) continue;

    out.push({
      marketId: m.id,
      title: m.title,
      category: m.category,
      p0,
      p1,
      side,
      low,
      legs: [
        { outcome: m.outcomes[0]?.name ?? 'A', tokenId: m.outcomes[0]?.tokenId, targetPriceCents: p0 },
        { outcome: m.outcomes[1]?.name ?? 'B', tokenId: m.outcomes[1]?.tokenId, targetPriceCents: p1 }
      ],
      type: 'YES_PAIR_ARB'
    });
  }

  return out.sort((a, b) => a.low - b.low).slice(0, 30);
}

async function tick() {
  tickNo += 1;
  const markets = await fetchActiveMarkets(400);
  const cands = pickCandidates(markets);

  let entries = 0;
  let hedges = 0;
  let depthPassed = 0;

  for (const c of cands) {
    const depth = await assessYesPairDepth(c, config);
    if (!depth.ok) continue;
    depthPassed += 1;

    const key = c.marketId;
    const existing = inventory.get(key);

    if (!existing) {
      inventory.set(key, {
        side: c.side,
        shares: config.targetSharesPerTrade,
        entryPriceCents: c.side === 0 ? c.p0 : c.p1,
        hedged: false,
        openedAt: new Date().toISOString(),
        openTick: tickNo,
        p0: c.p0,
        p1: c.p1
      });
      entries += 1;
      logEvent('inventory_entry', {
        marketId: c.marketId,
        title: c.title,
        side: c.side,
        entryPriceCents: c.side === 0 ? c.p0 : c.p1,
        shares: config.targetSharesPerTrade
      });
      continue;
    }

    if (!existing.hedged) {
      const hedgePrice = existing.side === 0 ? c.p1 : c.p0;
      const total = existing.entryPriceCents + hedgePrice;
      const age = tickNo - (existing.openTick || tickNo);
      const strictMax = Math.min(config.invHedgeMaxTotalCents, 100 - config.bMinNetEdgeCents);
      const dynamicMax = strictMax; // disable loss-making urgency hedges
      const canHedge = total <= strictMax;

      if (canHedge) {
        existing.hedged = true;
        existing.hedgedAt = new Date().toISOString();
        existing.hedgePriceCents = hedgePrice;
        existing.totalCents = total;
        existing.grossEdgeCents = 100 - total;
        hedges += 1;
        logEvent('inventory_hedge', {
          marketId: c.marketId,
          title: c.title,
          totalCents: total,
          grossEdgeCents: existing.grossEdgeCents,
          shares: existing.shares,
          urgent: total > strictMax,
          dynamicMax
        });
      } else {
        logEvent('inventory_hedge_miss', {
          marketId: c.marketId,
          title: c.title,
          totalCents: total,
          strictMax,
          dynamicMax,
          ageTicks: age
        });
      }
    }
  }

  const openCount = [...inventory.values()].filter(x => !x.hedged).length;
  const hedgedCount = [...inventory.values()].filter(x => x.hedged).length;

  logEvent('inventory_tick_summary', {
    markets: markets.length,
    candidates: cands.length,
    depthPassed,
    entries,
    hedges,
    openCount,
    hedgedCount
  });
}

async function main() {
  logEvent('inventory_startup', {
    loopIntervalSec: config.loopIntervalSec,
    invEntryMinPriceCents: config.invEntryMinPriceCents,
    invEntryMaxPriceCents: config.invEntryMaxPriceCents,
    invHedgeMaxTotalCents: config.invHedgeMaxTotalCents,
    bHedgeUrgencyTicks: config.bHedgeUrgencyTicks,
    bMaxEntryTotalCents: config.bMaxEntryTotalCents,
    bMinNetEdgeCents: config.bMinNetEdgeCents,
    targetSharesPerTrade: config.targetSharesPerTrade
  });

  await tick();

  if (process.env.RUN_ONCE === 'true') return;
  setInterval(() => tick().catch(err => logEvent('inventory_tick_error', { error: String(err) })), config.loopIntervalSec * 1000);
}

main().catch(err => {
  logEvent('inventory_fatal', { error: String(err) });
  process.exit(1);
});
