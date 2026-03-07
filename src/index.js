import { config } from './utils/config.js';
import { logEvent } from './utils/logger.js';
import { fetchActiveMarkets, fetchWalletProfile } from './polymarket/client.js';
import { detectTwoOutcomeArb } from './strategy/arbDetector.js';
import { PaperTrader } from './engine/paperTrader.js';
import { assessYesPairDepth } from './engine/depthCheck.js';
import { simulatePairedExecution } from './engine/executionSim.js';

const trader = new PaperTrader(config);

function categorySummary(opps) {
  const out = {};
  for (const o of opps) {
    const c = (o.category || 'unknown').toLowerCase();
    out[c] = (out[c] || 0) + 1;
  }
  return out;
}

async function tick() {
  const markets = await fetchActiveMarkets(400);
  const opps = detectTwoOutcomeArb(markets, config);

  const checked = [];
  for (const o of opps.slice(0, 20)) {
    if (o.type !== 'YES_PAIR_ARB') continue;
    try {
      const depth = await assessYesPairDepth(o, config);
      const sim = depth.ok ? simulatePairedExecution(o, depth, config) : null;
      checked.push({ ...o, depth, sim });

      if (sim?.ok) {
        logEvent('paper_execution_sim', {
          marketId: o.marketId,
          title: o.title,
          partial: sim.partial,
          requestedShares: sim.requestedShares,
          fillA: sim.fillA,
          fillB: sim.fillB,
          hedgedShares: sim.hedgedShares,
          hedgedGrossEur: sim.hedgedGrossEur,
          unhedgedExposureEur: sim.unhedgedExposureEur
        });
      }
    } catch (err) {
      logEvent('depth_check_error', { marketId: o.marketId, error: String(err) });
    }
  }

  const tradable = checked.filter(x => x.depth?.ok && x.sim?.ok && !x.sim?.partial);
  const accepted = trader.onOpportunities(tradable);
  const categories = categorySummary(opps);
  const partialCount = checked.filter(x => x.sim?.partial).length;

  logEvent('tick_summary', {
    markets: markets.length,
    opportunities: opps.length,
    depthChecked: checked.length,
    tradableAfterDepth: tradable.length,
    partialSimulations: partialCount,
    accepted: accepted.length,
    categories
  });
}

async function main() {
  logEvent('startup', {
    paperMode: config.paperMode,
    loopIntervalSec: config.loopIntervalSec,
    focusCategories: config.focusCategories,
    referenceWallet: config.referenceWallet,
    arbTriggerMaxTotalCents: config.arbTriggerMaxTotalCents,
    minDepthSharesPerLeg: config.minDepthSharesPerLeg,
    targetSharesPerTrade: config.targetSharesPerTrade,
    queueFillFactor: config.queueFillFactor
  });

  const wallet = await fetchWalletProfile(config.referenceWallet);
  if (wallet) logEvent('reference_wallet', wallet);

  await tick();

  if (process.env.RUN_ONCE === 'true') return;
  setInterval(() => tick().catch(err => logEvent('tick_error', { error: String(err) })), config.loopIntervalSec * 1000);
}

main().catch(err => {
  logEvent('fatal', { error: String(err) });
  process.exit(1);
});
