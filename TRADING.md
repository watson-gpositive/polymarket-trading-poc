# TRADING.md

Living trading journal for Polymarket paper-trading R&D.

Last updated: 2026-03-07T12:19:22.450Z

## Mission
Build a robust, risk-aware paper-trading system inspired by high-performing wallets, then evaluate promotion criteria for tiny live capital.

## Active Scripts

### Script A - Strict Pair Arb
- Logic: requires strict same-market pair conditions (YES pair threshold)
- Strength: mathematically clean
- Weakness: almost no opportunities in current market regime

### Script B - Inventory Dynamic Hedge (v1)
- Logic: broader entries with dynamic hedge attempt
- Strength: high opportunity throughput
- Weakness: poor hedge conversion, inventory risk

### Script C - Mimic Inventory Hedge (renamed from old Bv2)
- Logic: wallet-inspired mimic mode with controlled entries + urgency hedging
- Strength: good hedge closure quality in low-frequency mode
- Weakness: still depends too much on urgency hedges

### Script D - Capped Multi-Category Hedge
- Logic: multi-category inventory strategy with caps + rebalancing
- Strength: higher activity with safety caps
- Weakness: urgent hedge share too high, still negative PnL at current config

## Paper Trades - Key Observations (so far)
1. Strict arb windows are rare with current fee-aware constraints.
2. Depth-aware checks are essential. Price alone is misleading.
3. Partial-fill risk is a major source of hidden downside.
4. High entry count without hedge conversion is dangerous.
5. Script C currently behaves safer than Script D.

## Market Trends (Current)

### Microstructure trends
- Many two-outcome markets cluster near fair sums (~100c), reducing obvious strict arbitrage.
- Liquidity exists, but executable depth at desired prices is inconsistent.
- Urgency hedges are often needed when markets move quickly.

### Strategy trends
- Crypto short-window markets show repeatable candidate flow but low margin.
- Sports markets provide more candidates but also more inventory drift risk.
- Cross-market and timing-aware execution appears more important than static price rules.

## Lessons Learned
- "Edge before fees" is often fake edge.
- Lower unhedged exposure time is a better safety signal than raw candidate count.
- Hedge closure rate is a core quality KPI.
- For small bankrolls, execution friction dominates expected edge.

## Proposed Additions
1. Add GO/NO-GO decision gate from KPI thresholds.
2. Add per-category dynamic throttle when urgent hedge share rises.
3. Add regime detector (crypto micro vs sports broad) for automatic mode switching.
4. Add event-family risk caps to limit correlated exposure.
5. Add improved PnL accounting with realized/unrealized split and fee model variants.

## Cron Update History

(Automatically appended every hourly checkpoint run)

### 2026-03-07T12:19:22.450Z
- Script A: ticks=506, accepted=0
- Script B: entries=84, hedges=1, hedgeRate=0.012
- Script C: entries=1, hedges=2, closureRate=1.000, urgentShare=1.000
- Script D: entries=63, hedges=74, closureRate=0.538, urgentShare=0.838
- PnL (€5/€50/€500): C=-0.2/-1/-1 | D=-7.98/-31.02/-31.02
- Unhedged exposure avg min: C=2.01 | D=7.65
- Suggestion snapshot: Script C έχει καλύτερο hedge closure rate από το D. | Το Script D βασίζεται πολύ σε urgent hedges, θέλει tuning. | Το Script C βασίζεται πολύ σε urgent hedges, θέλει tuning. | Με bankroll €5, το Script C είναι πιο ασφαλές από το D προς το παρόν.
