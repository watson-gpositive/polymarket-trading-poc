import fs from 'fs';
import path from 'path';

function loadEnvFile() {
  const p = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvFile();

const toNum = (v, d) => (v == null || v === '' ? d : Number(v));

export const config = {
  paperMode: (process.env.PAPER_MODE ?? 'true') === 'true',
  loopIntervalSec: toNum(process.env.LOOP_INTERVAL_SEC, 60),
  maxRiskPerMarketPct: toNum(process.env.MAX_RISK_PER_MARKET_PCT, 2),
  maxConcurrentPositions: toNum(process.env.MAX_CONCURRENT_POSITIONS, 8),
  dailyStopLossPct: toNum(process.env.DAILY_STOP_LOSS_PCT, 5),
  minEdgeCents: toNum(process.env.MIN_EDGE_CENTS, 3),
  slippageBufferCents: toNum(process.env.SLIPPAGE_BUFFER_CENTS, 1),
  arbTriggerMaxTotalCents: toNum(process.env.ARB_TRIGGER_MAX_TOTAL_CENTS, 98),
  minDepthSharesPerLeg: toNum(process.env.MIN_DEPTH_SHARES_PER_LEG, 50),
  targetSharesPerTrade: toNum(process.env.TARGET_SHARES_PER_TRADE, 50),
  queueFillFactor: toNum(process.env.QUEUE_FILL_FACTOR, 0.9),
  invEntryMinPriceCents: toNum(process.env.INV_ENTRY_MIN_PRICE_CENTS, 10),
  invEntryMaxPriceCents: toNum(process.env.INV_ENTRY_MAX_PRICE_CENTS, 55),
  invHedgeMaxTotalCents: toNum(process.env.INV_HEDGE_MAX_TOTAL_CENTS, 99),
  v2Mode: process.env.V2_MODE ?? 'mimic_732f1',
  v2MaxOpenPositions: toNum(process.env.V2_MAX_OPEN_POSITIONS, 40),
  v2RebalanceStepShares: toNum(process.env.V2_REBALANCE_STEP_SHARES, 10),
  v2HedgeUrgencyTicks: toNum(process.env.V2_HEDGE_URGENCY_TICKS, 6),
  dMaxNewEntriesPerTick: toNum(process.env.D_MAX_NEW_ENTRIES_PER_TICK, 6),
  dMinEntryPriceCents: toNum(process.env.D_MIN_ENTRY_PRICE_CENTS, 15),
  dMaxEntryPriceCents: toNum(process.env.D_MAX_ENTRY_PRICE_CENTS, 60),
  cMaxOpenPositions: toNum(process.env.C_MAX_OPEN_POSITIONS, 5),
  cTargetSharesPerTrade: toNum(process.env.C_TARGET_SHARES_PER_TRADE, 5),
  bHedgeUrgencyTicks: toNum(process.env.B_HEDGE_URGENCY_TICKS, 6),
  marketScope: process.env.MARKET_SCOPE ?? 'all',
  focusCategories: (process.env.FOCUS_CATEGORIES ?? 'politics,crypto').split(',').map(s => s.trim()).filter(Boolean),
  gammaBase: process.env.POLY_GAMMA_BASE ?? 'https://gamma-api.polymarket.com',
  clobBase: process.env.POLY_CLOB_BASE ?? 'https://clob.polymarket.com',
  referenceWallet: process.env.REFERENCE_WALLET ?? ''
};
