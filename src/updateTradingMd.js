import fs from 'fs';
import path from 'path';

const root = process.cwd();
const tradingPath = path.resolve(root, 'TRADING.md');
const comparePath = path.resolve(root, 'logs', 'compare-latest.json');
const decisionPath = path.resolve(root, 'logs', 'decision-kpis-latest.json');

if (!fs.existsSync(tradingPath) || !fs.existsSync(comparePath) || !fs.existsSync(decisionPath)) {
  console.error('Missing TRADING.md or required report files');
  process.exit(1);
}

const compare = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
const decision = JSON.parse(fs.readFileSync(decisionPath, 'utf8'));

const ts = new Date().toISOString();
const block = [
  `### ${ts}`,
  `- Script A: ticks=${compare.scriptA?.ticks ?? 0}, accepted=${compare.scriptA?.accepted ?? 0}`,
  `- Script B: entries=${compare.scriptB?.entries ?? 0}, hedges=${compare.scriptB?.hedges ?? 0}, hedgeRate=${Number(compare.scriptB?.hedgeRatePerEntry ?? 0).toFixed(3)}`,
  `- Script C: entries=${compare.scriptC?.entries ?? 0}, hedges=${compare.scriptC?.hedges ?? 0}, closureRate=${Number(decision.compare?.scriptC?.closureRate ?? 0).toFixed(3)}, urgentShare=${Number(compare.scriptC?.urgentHedgeShare ?? 0).toFixed(3)}`,
  `- Script D: entries=${compare.scriptD?.entries ?? 0}, hedges=${compare.scriptD?.hedges ?? 0}, closureRate=${Number(decision.compare?.scriptD?.closureRate ?? 0).toFixed(3)}, urgentShare=${Number(compare.scriptD?.urgentHedgeShare ?? 0).toFixed(3)}`,
  `- PnL (\u20ac5/\u20ac50/\u20ac500): C=${decision.pnl5?.scriptC?.pnlEur ?? 0}/${decision.pnl50?.scriptC?.pnlEur ?? 0}/${decision.pnl500?.scriptC?.pnlEur ?? 0} | D=${decision.pnl5?.scriptD?.pnlEur ?? 0}/${decision.pnl50?.scriptD?.pnlEur ?? 0}/${decision.pnl500?.scriptD?.pnlEur ?? 0}`,
  `- Unhedged exposure avg min: C=${decision.exposure?.scriptC?.avgMinutes ?? 'n/a'} | D=${decision.exposure?.scriptD?.avgMinutes ?? 'n/a'}`,
  `- Suggestion snapshot: ${(decision.suggestions || []).join(' | ')}`,
  ''
].join('\n');

let body = fs.readFileSync(tradingPath, 'utf8');
body = body.replace(/Last updated: .*\n/, `Last updated: ${ts}\n`);
body += `\n${block}`;
fs.writeFileSync(tradingPath, body);
console.log('TRADING.md updated:', ts);
