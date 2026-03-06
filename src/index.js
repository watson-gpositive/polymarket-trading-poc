import { config } from './utils/config.js';
import { logEvent } from './utils/logger.js';
import { fetchActiveMarkets, fetchWalletProfile } from './polymarket/client.js';
import { detectTwoOutcomeArb } from './strategy/arbDetector.js';
import { PaperTrader } from './engine/paperTrader.js';

const trader = new PaperTrader(config);

function focusSummary(opps, focusCategories) {
  const out = {};
  for (const c of focusCategories) out[c] = 0;
  for (const o of opps) {
    for (const c of focusCategories) {
      if ((o.category || '').includes(c)) out[c] += 1;
    }
  }
  return out;
}

async function tick() {
  const markets = await fetchActiveMarkets(400);
  const opps = detectTwoOutcomeArb(markets, config);
  const accepted = trader.onOpportunities(opps);
  const focus = focusSummary(opps, config.focusCategories);

  logEvent('tick_summary', {
    markets: markets.length,
    opportunities: opps.length,
    accepted: accepted.length,
    focus
  });
}

async function main() {
  logEvent('startup', {
    paperMode: config.paperMode,
    loopIntervalSec: config.loopIntervalSec,
    focusCategories: config.focusCategories,
    referenceWallet: config.referenceWallet
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
