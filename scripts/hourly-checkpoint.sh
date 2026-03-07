#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/node/.openclaw/workspace/projects/polymarket-trading-poc"
cd "$ROOT"

# Refresh reports
npm run report:compare > logs/compare-latest.stdout.txt
npm run report:pnl -- 5 2 > logs/bankroll-pnl-latest.stdout.txt
npm run report:decision > logs/decision-kpis-latest.stdout.txt
npm run report:trading-md > logs/trading-md-update.stdout.txt

# Build lightweight hourly summary
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
SUMMARY_PATH="logs/hourly-summary-latest.txt"
HISTORY_PATH="logs/hourly-summary-history.log"

cat > "$SUMMARY_PATH" <<EOF
[$TS] Hourly checkpoint
$(cat logs/decision-kpis-latest.txt)
Files:
- logs/compare-latest.json
- logs/bankroll-pnl-latest.json
- logs/decision-kpis-latest.json
EOF

cat "$SUMMARY_PATH" >> "$HISTORY_PATH"
echo "" >> "$HISTORY_PATH"
