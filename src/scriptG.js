import { config } from './utils/config.js';
import { logEvent } from './utils/logger.js';
import { fetchActiveMarkets } from './polymarket/client.js';

let pnl = 0;
let trades = 0;

function toCents(x){const n=Number(x); if(Number.isNaN(n)) return null; return n<=1?Math.round(n*100):Math.round(n);}
function norm(s=''){return s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(will|the|a|an|in|of|to|by|for|on|before|after)\b/g,' ').replace(/\s+/g,' ').trim();}
function key(s=''){const w=norm(s).split(' ').filter(Boolean); return w.slice(0,8).join(' ');}

async function tick(){
  if(!config.gEnabled) return logEvent('script_g_paused',{reason:'G_ENABLED=false'});
  const markets=await fetchActiveMarkets(500);
  const groups=new Map();

  for(const m of markets){
    if(!Array.isArray(m.outcomes)||m.outcomes.length!==2) continue;
    const k=key(m.title||'');
    if(k.length<config.gMinSimilarityKeyLen) continue;
    const p0=toCents(m.outcomes[0]?.price), p1=toCents(m.outcomes[1]?.price);
    if(p0==null||p1==null) continue;
    if(!groups.has(k)) groups.set(k,[]);
    groups.get(k).push({id:m.id,title:m.title,p0,p1,cheap:Math.min(p0,p1),rich:Math.max(p0,p1)});
  }

  let scannedGroups=0,candidates=0,executed=0;
  for(const [k,arr] of groups){
    if(executed>=5) break;
    if(arr.length<2) continue;
    scannedGroups++;
    arr.sort((a,b)=>a.cheap-b.cheap);
    const lo=arr[0], hi=arr[arr.length-1];
    const divergence = hi.cheap - lo.cheap;
    if(divergence < config.gMinDivergenceCents) continue;

    candidates++;
    const qty=config.gTargetQty;
    const netPerShare = (divergence/100)*0.3 - 0.02; // conservative convergence capture
    if(netPerShare<=0) continue;

    executed++; trades++;
    const tPnl = netPerShare*qty;
    pnl += tPnl;
    logEvent('script_g_trade',{groupKey:k,marketBuy:lo.id,marketSell:hi.id,divergenceCents:divergence,qty,netPerShareEur:Number(netPerShare.toFixed(4)),pnlEur:Number(tPnl.toFixed(4)),realizedPnlEur:Number(pnl.toFixed(4))});
  }

  logEvent('script_g_tick_summary',{markets:markets.length,groups:groups.size,scannedGroups,candidates,executed,tradesToday:trades,realizedPnlEur:Number(pnl.toFixed(4)),minDivergenceCents:config.gMinDivergenceCents});
}

async function main(){
  logEvent('script_g_startup',{loopIntervalSec:config.loopIntervalSec,gMinDivergenceCents:config.gMinDivergenceCents,gTargetQty:config.gTargetQty});
  await tick();
  if(process.env.RUN_ONCE==='true') return;
  setInterval(()=>tick().catch(e=>logEvent('script_g_tick_error',{error:String(e)})), config.loopIntervalSec*1000);
}

main().catch(e=>{logEvent('script_g_fatal',{error:String(e)});process.exit(1);});
