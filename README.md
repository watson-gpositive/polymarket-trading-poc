# Polymarket Trading PoC (Paper Mode)

Initial PoC scaffold for detecting 2-outcome mispricing/arbitrage opportunities and simulating execution in **paper mode only**.

## Current status

- ✅ Runtime scaffold
- ✅ `.env`/safe defaults
- ✅ Market fetcher with endpoint fallback
- ✅ 2-outcome YES/NO pair arb detector
- ✅ Paper execution planner (no live orders)
- ✅ JSONL event logging (`logs/events.jsonl`)
- 🚧 Wallet deep reconstruction (next)
- 🚧 Fill/fee/slippage realism (next)

## Run

```bash
cp .env.example .env
npm run start:once
# or
npm start
```

## Safety defaults

- `PAPER_MODE=true`
- `MAX_RISK_PER_MARKET_PCT=2`
- `MAX_CONCURRENT_POSITIONS=8`
- `DAILY_STOP_LOSS_PCT=5`

No live order execution exists in this codebase yet.

## Planned next milestones

1. Wallet history reconstruction for `0xD9E0AACa471f48F91A26E8669A805f2`
2. Net-edge model (fees + slippage + partial fills)
3. Category dashboards (politics/crypto)
4. Promotion criteria from paper -> tiny live (manual approval gate)
