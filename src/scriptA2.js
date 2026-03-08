import { config } from './utils/config.js';
import { logEvent } from './utils/logger.js';
import { fetchActiveMarkets } from './polymarket/client.js';
import { detectTwoOutcomeArb } from './strategy/arbDetector.js';
import { assessYesPairDepth } from './engine/depthCheck.js';
import { simulatePairedExecution } from './engine/executionSim.js';

function withThreshold(base, threshold, microShares = null) {
  return {
    ...base,
    arbTriggerMaxTotalCents: threshold,
    ...(microShares != null ? { targetSharesPerTrade: microShares } : {})
  };
}

async function tick() {
  const markets = await fetchActiveMarkets(400);

  const observed = detectTwoOutcomeArb(markets, withThreshold(config, config.aObserveMaxTotalCents));
  const tradableCandidates = detectTwoOutcomeArb(markets, withThreshold(config, config.aTradeMaxTotalCents));

  let depthPass = 0;
  let simPass = 0;
  let accepted = 0;

  for (const o of tradableCandidates.slice(0, 30)) {
    if (o.type !== 'YES_PAIR_ARB') continue;
    try {
      const depth = await assessYesPairDepth(o, config);
      if (!depth.ok) continue;
      depthPass += 1;

      const sim = simulatePairedExecution(o, depth, withThreshold(config, config.aTradeMaxTotalCents, config.aMicroSharesPerTrade));
      if (!sim?.ok || sim.partial) continue;
      simPass += 1;
      accepted += 1;

      logEvent('script_a2_trade', {
        marketId: o.marketId,
        title: o.title,
        sumCents: o.sumCents,
        edgeCents: o.grossEdgeCents,
        microShares: config.aMicroSharesPerTrade,
        hedgedGrossEur: sim.hedgedGrossEur,
      });
    } catch (err) {
      logEvent('script_a2_error', { marketId: o.marketId, error: String(err) });
    }
  }

  logEvent('script_a2_tick_summary', {
    markets: markets.length,
    observeThreshold: config.aObserveMaxTotalCents,
    tradeThreshold: config.aTradeMaxTotalCents,
    observedCount: observed.length,
    tradableCandidateCount: tradableCandidates.length,
    depthPass,
    simPass,
    accepted,
    microShares: config.aMicroSharesPerTrade,
  });
}

async function main() {
  logEvent('script_a2_startup', {
    loopIntervalSec: config.loopIntervalSec,
    observeThreshold: config.aObserveMaxTotalCents,
    tradeThreshold: config.aTradeMaxTotalCents,
    microShares: config.aMicroSharesPerTrade,
  });

  await tick();
  if (process.env.RUN_ONCE === 'true') return;
  setInterval(() => tick().catch(err => logEvent('script_a2_fatal_tick', { error: String(err) })), config.loopIntervalSec * 1000);
}

main().catch(err => {
  logEvent('script_a2_fatal', { error: String(err) });
  process.exit(1);
});
