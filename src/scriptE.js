import { config } from './utils/config.js';
import { logEvent } from './utils/logger.js';
import { fetchActiveMarkets, fetchOrderBook } from './polymarket/client.js';

const state = {
  day: new Date().toISOString().slice(0, 10),
  realizedPnlEur: 0,
  trades: 0,
};

function resetDayIfNeeded() {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== state.day) {
    state.day = d;
    state.realizedPnlEur = 0;
    state.trades = 0;
  }
}

function n(x) { const v = Number(x); return Number.isFinite(v) ? v : 0; }

function best(book) {
  const bestBid = Array.isArray(book?.bids) && book.bids.length ? book.bids[0] : null;
  const bestAsk = Array.isArray(book?.asks) && book.asks.length ? book.asks[0] : null;
  if (!bestBid || !bestAsk) return null;
  return {
    bid: n(bestBid.price),
    bidQty: n(bestBid.size),
    ask: n(bestAsk.price),
    askQty: n(bestAsk.size),
  };
}

async function tick() {
  resetDayIfNeeded();

  if (!config.eEnabled) {
    logEvent('script_e_paused', { reason: 'E_ENABLED=false' });
    return;
  }
  if (state.realizedPnlEur <= -Math.abs(config.eDailyStopLossEur)) {
    logEvent('script_e_paused', { reason: 'daily_stop_loss', realizedPnlEur: state.realizedPnlEur });
    return;
  }

  const markets = await fetchActiveMarkets(250);
  let scanned = 0;
  let candidates = 0;
  let executed = 0;

  for (const m of markets) {
    if (executed >= config.eMaxTradesPerTick) break;
    if (!Array.isArray(m.outcomes) || m.outcomes.length !== 2) continue;

    for (const o of m.outcomes) {
      if (executed >= config.eMaxTradesPerTick) break;
      if (!o?.tokenId) continue;
      scanned += 1;

      const ob = await fetchOrderBook(o.tokenId).catch(() => null);
      const b = best(ob);
      if (!b) continue;

      const spread = Math.round((b.ask - b.bid) * 100);
      if (spread < config.eMinSpreadCents) continue;

      const qty = Math.min(config.eTargetQty, Math.floor(Math.min(b.bidQty, b.askQty)));
      if (qty <= 0) continue;

      const grossPerShare = (spread / 100);
      const feePerShare = 0.02; // conservative fee buffer
      const netPerShare = grossPerShare - feePerShare;
      const netCents = Math.round(netPerShare * 100);
      if (netCents < config.eMinNetEdgeCents) continue;

      candidates += 1;
      const pnl = netPerShare * qty;
      state.realizedPnlEur += pnl;
      state.trades += 1;
      executed += 1;

      logEvent('script_e_trade', {
        marketId: m.id,
        title: m.title,
        outcome: o.name,
        spreadCents: spread,
        qty,
        netPerShareEur: Number(netPerShare.toFixed(4)),
        pnlEur: Number(pnl.toFixed(4)),
        realizedPnlEur: Number(state.realizedPnlEur.toFixed(4)),
      });
    }
  }

  logEvent('script_e_tick_summary', {
    markets: markets.length,
    scanned,
    candidates,
    executed,
    tradesToday: state.trades,
    realizedPnlEur: Number(state.realizedPnlEur.toFixed(4)),
    minSpreadCents: config.eMinSpreadCents,
    minNetEdgeCents: config.eMinNetEdgeCents,
  });
}

async function main() {
  logEvent('script_e_startup', {
    loopIntervalSec: config.loopIntervalSec,
    eEnabled: config.eEnabled,
    eMinSpreadCents: config.eMinSpreadCents,
    eMinNetEdgeCents: config.eMinNetEdgeCents,
    eTargetQty: config.eTargetQty,
    eMaxTradesPerTick: config.eMaxTradesPerTick,
    eDailyStopLossEur: config.eDailyStopLossEur,
  });

  await tick();
  if (process.env.RUN_ONCE === 'true') return;
  setInterval(() => tick().catch(err => logEvent('script_e_tick_error', { error: String(err) })), config.loopIntervalSec * 1000);
}

main().catch(err => {
  logEvent('script_e_fatal', { error: String(err) });
  process.exit(1);
});
