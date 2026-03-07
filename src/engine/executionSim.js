function centsToEur(cents) {
  return cents / 100;
}

export function simulatePairedExecution(opportunity, depth, cfg) {
  const legs = opportunity?.legs ?? [];
  const perLegDepth = depth?.perLeg ?? [];
  if (legs.length !== 2 || perLegDepth.length !== 2) {
    return { ok: false, reason: 'invalid_legs' };
  }

  const requested = cfg.targetSharesPerTrade;
  const fillFactor = Math.max(0, Math.min(1, cfg.queueFillFactor));

  const fillA = Math.min(requested, Math.floor(perLegDepth[0].fillableShares * fillFactor));
  const fillB = Math.min(requested, Math.floor(perLegDepth[1].fillableShares * fillFactor));

  const hedgedShares = Math.min(fillA, fillB);
  const unhedgedA = Math.max(0, fillA - hedgedShares);
  const unhedgedB = Math.max(0, fillB - hedgedShares);

  const pA = legs[0].targetPriceCents;
  const pB = legs[1].targetPriceCents;

  const hedgedCostCents = hedgedShares * (pA + pB);
  const hedgedPayoutCents = hedgedShares * 100;
  const hedgedGrossCents = hedgedPayoutCents - hedgedCostCents;

  const unhedgedExposureCents = (unhedgedA * pA) + (unhedgedB * pB);
  const partial = unhedgedA > 0 || unhedgedB > 0;

  return {
    ok: true,
    requestedShares: requested,
    fillA,
    fillB,
    hedgedShares,
    partial,
    unhedgedA,
    unhedgedB,
    hedgedGrossCents,
    hedgedGrossEur: centsToEur(hedgedGrossCents),
    unhedgedExposureCents,
    unhedgedExposureEur: centsToEur(unhedgedExposureCents)
  };
}
