function toPriceCents(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function extractOutcomePrices(outcomes = []) {
  return outcomes
    .map(o => ({
      name: o?.name ?? o?.outcome ?? o?.title ?? 'outcome',
      yes: toPriceCents(o?.price ?? o?.yesPrice ?? o?.lastPrice),
      no: toPriceCents(o?.noPrice ?? (o?.price != null ? 100 - Number(o.price) * (o.price <= 1 ? 100 : 1) : null))
    }))
    .filter(o => o.yes != null);
}

export function detectTwoOutcomeArb(markets, cfg) {
  const opportunities = [];
  for (const m of markets) {
    const p = extractOutcomePrices(m.outcomes);
    if (p.length !== 2) continue;

    const yesSum = p[0].yes + p[1].yes;
    const no0 = p[0].no ?? (100 - p[0].yes);
    const no1 = p[1].no ?? (100 - p[1].yes);
    const noSum = no0 + no1;

    const threshold = 100 - cfg.minEdgeCents - cfg.slippageBufferCents;

    if (yesSum <= threshold) {
      opportunities.push({
        marketId: m.id,
        title: m.title,
        category: m.category,
        type: 'YES_PAIR_ARB',
        sumCents: yesSum,
        grossEdgeCents: 100 - yesSum
      });
    }

    if (noSum <= threshold) {
      opportunities.push({
        marketId: m.id,
        title: m.title,
        category: m.category,
        type: 'NO_PAIR_ARB',
        sumCents: noSum,
        grossEdgeCents: 100 - noSum
      });
    }
  }
  return opportunities.sort((a, b) => b.grossEdgeCents - a.grossEdgeCents);
}
