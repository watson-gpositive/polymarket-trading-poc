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
  marketScope: process.env.MARKET_SCOPE ?? 'all',
  focusCategories: (process.env.FOCUS_CATEGORIES ?? 'politics,crypto').split(',').map(s => s.trim()).filter(Boolean),
  gammaBase: process.env.POLY_GAMMA_BASE ?? 'https://gamma-api.polymarket.com',
  clobBase: process.env.POLY_CLOB_BASE ?? 'https://clob.polymarket.com',
  referenceWallet: process.env.REFERENCE_WALLET ?? ''
};
