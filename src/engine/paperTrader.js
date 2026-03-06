import { logEvent } from '../utils/logger.js';

export class PaperTrader {
  constructor(cfg) {
    this.cfg = cfg;
    this.dayStartEquity = 100000;
    this.open = new Map();
  }

  canOpenMore() {
    return this.open.size < this.cfg.maxConcurrentPositions;
  }

  evaluateDailyGuard() {
    return true;
  }

  onOpportunities(opps) {
    const accepted = [];
    for (const o of opps) {
      if (!this.canOpenMore()) break;
      if (!this.evaluateDailyGuard()) break;
      const key = `${o.marketId}:${o.type}`;
      if (this.open.has(key)) continue;
      this.open.set(key, { ...o, openedAt: new Date().toISOString() });
      accepted.push(o);
      logEvent('paper_order_planned', {
        marketId: o.marketId,
        type: o.type,
        edgeCents: o.grossEdgeCents,
        category: o.category,
        title: o.title
      });
    }
    return accepted;
  }
}
