#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/node/.openclaw/workspace/projects/polymarket-trading-poc"
cd "$ROOT"

# Refresh comparison + bankroll-aware pnl snapshot
npm run report:compare > logs/compare-latest.stdout.txt
npm run report:pnl -- 5 2 > logs/bankroll-pnl-latest.stdout.txt

# Build lightweight hourly summary
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
SUMMARY_PATH="logs/hourly-summary-latest.txt"
HISTORY_PATH="logs/hourly-summary-history.log"

A_TICKS=$(node -e "const j=require('./logs/compare-latest.json'); console.log(j.scriptA.ticks)")
A_ACC=$(node -e "const j=require('./logs/compare-latest.json'); console.log(j.scriptA.accepted)")
B_ENT=$(node -e "const j=require('./logs/compare-latest.json'); console.log(j.scriptB.entries)")
B_HDG=$(node -e "const j=require('./logs/compare-latest.json'); console.log(j.scriptB.hedges)")
C_ENT=$(node -e "const j=require('./logs/compare-latest.json'); console.log(j.scriptC.entries)")
C_HDG=$(node -e "const j=require('./logs/compare-latest.json'); console.log(j.scriptC.hedges)")
D_ENT=$(node -e "const j=require('./logs/compare-latest.json'); console.log(j.scriptD.entries)")
D_HDG=$(node -e "const j=require('./logs/compare-latest.json'); console.log(j.scriptD.hedges)")
PNL_C=$(node -e "const j=require('./logs/bankroll-pnl-latest.json'); console.log(j.scriptC.pnlEur)")
PNL_D=$(node -e "const j=require('./logs/bankroll-pnl-latest.json'); console.log(j.scriptD.pnlEur)")

cat > "$SUMMARY_PATH" <<EOF
[$TS] Hourly checkpoint
A: ticks=$A_TICKS accepted=$A_ACC
B: entries=$B_ENT hedges=$B_HDG
C: entries=$C_ENT hedges=$C_HDG pnl5eur=$PNL_C
D: entries=$D_ENT hedges=$D_HDG pnl5eur=$PNL_D
Files: logs/compare-latest.json, logs/bankroll-pnl-latest.json
EOF

cat "$SUMMARY_PATH" >> "$HISTORY_PATH"
echo "" >> "$HISTORY_PATH"
