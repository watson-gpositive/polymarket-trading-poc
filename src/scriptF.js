import { config } from './utils/config.js';
import { logEvent } from './utils/logger.js';
import { fetchActiveMarkets, fetchOrderBook } from './polymarket/client.js';

let pnl = 0;
let trades = 0;

function hoursTo(dateStr) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / 3600000;
}

function n(x){const v=Number(x);return Number.isFinite(v)?v:0;}

async function tick() {
  if (!config.fEnabled) return logEvent('script_f_paused',{reason:'F_ENABLED=false'});
  const markets = await fetchActiveMarkets(300);

  let scanned = 0, candidates = 0, executed = 0;
  const regime = { eventDriven: 0, ignoredNoWindow: 0 };

  for (const m of markets) {
    const h = hoursTo(m.raw?.endDate || m.raw?.end_time || m.raw?.resolutionTime);
    if (h == null || h < 0 || h > config.fHoursToEventMax) { regime.ignoredNoWindow++; continue; }
    regime.eventDriven++;
    if (!Array.isArray(m.outcomes) || m.outcomes.length < 2) continue;

    for (const o of m.outcomes.slice(0,2)) {
      if (executed >= 5) break;
      if (!o?.tokenId) continue;
      scanned++;
      const ob = await fetchOrderBook(o.tokenId).catch(()=>null);
      const bid = ob?.bids?.[0]; const ask = ob?.asks?.[0];
      if (!bid || !ask) continue;
      const spread = Math.round((n(ask.price)-n(bid.price))*100);
      if (spread < config.fMinSpreadCents || spread > 20) continue;
      const qty = Math.min(config.fTargetQty, Math.floor(Math.min(n(bid.size), n(ask.size))));
      if (qty <= 0) continue;
      const netPerShare = (spread/100)*0.4 - 0.02;
      if (netPerShare <= 0) continue;

      candidates++; executed++; trades++;
      const tPnl = netPerShare * qty;
      pnl += tPnl;
      logEvent('script_f_trade', {
        marketId:m.id,title:m.title,outcome:o.name,spreadCents:spread,qty,
        netPerShareEur:Number(netPerShare.toFixed(4)),pnlEur:Number(tPnl.toFixed(4)),realizedPnlEur:Number(pnl.toFixed(4))
      });
    }
  }

  logEvent('script_f_tick_summary',{markets:markets.length,scanned,candidates,executed,tradesToday:trades,realizedPnlEur:Number(pnl.toFixed(4)),regime});
}

async function main(){
  logEvent('script_f_startup',{loopIntervalSec:config.loopIntervalSec,fHoursToEventMax:config.fHoursToEventMax,fMinSpreadCents:config.fMinSpreadCents,fTargetQty:config.fTargetQty});
  await tick();
  if (process.env.RUN_ONCE==='true') return;
  setInterval(()=>tick().catch(e=>logEvent('script_f_tick_error',{error:String(e)})), config.loopIntervalSec*1000);
}

main().catch(e=>{logEvent('script_f_fatal',{error:String(e)});process.exit(1);});
