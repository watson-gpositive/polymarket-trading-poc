import { fetchOrderBook } from '../polymarket/client.js';

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fillableSharesAtOrBelow(asks, maxPrice) {
  return asks.reduce((acc, a) => {
    const p = toNum(a.price);
    const s = toNum(a.size);
    if (p <= maxPrice) return acc + s;
    return acc;
  }, 0);
}

export async function assessYesPairDepth(opportunity, cfg) {
  if (opportunity?.type !== 'YES_PAIR_ARB' || !Array.isArray(opportunity?.legs)) {
    return { ok: false, reason: 'not_yes_pair' };
  }

  const maxPriceBump = cfg.slippageBufferCents / 100;
  const perLeg = [];

  for (const leg of opportunity.legs) {
    if (!leg.tokenId) return { ok: false, reason: 'missing_token_id' };
    const book = await fetchOrderBook(leg.tokenId);
    const target = leg.targetPriceCents / 100;
    const limit = target + maxPriceBump;
    const fillable = fillableSharesAtOrBelow(book?.asks ?? [], limit);
    perLeg.push({ tokenId: leg.tokenId, targetPrice: target, limitPrice: limit, fillableShares: fillable });
  }

  const minFillableShares = Math.min(...perLeg.map(x => x.fillableShares));
  const ok = minFillableShares >= cfg.minDepthSharesPerLeg;
  return { ok, minFillableShares, perLeg, reason: ok ? null : 'insufficient_depth' };
}
