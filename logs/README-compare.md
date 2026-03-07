# Πώς συγκρίνεις Script A/B/C/D

## 1) Τρέξε comparison report

```bash
npm run report:compare
```

Παράγει:
- `logs/compare-latest.json` (εύκολο summary)
- `logs/compare-latest.stdout.txt` (raw console output)

## 2) Πώς το διαβάζεις

- `scriptA` = strict pair-arb logic
- `scriptB` = inventory + dynamic hedge logic (v1)
- `scriptC` = mimic inventory + rebalance logic (rename από παλιό Bv2)
- `scriptD` = capped multi-category hedge logic (next evolution)

Κρίσιμα fields:
- `ticks`: πόσους κύκλους έτρεξε
- `accepted` (A): πόσα trades πέρασαν όλα τα φίλτρα
- `entries` / `hedges`: πόσα inventory entries άνοιξαν και πόσα hedge έγιναν
- `hedgeRatePerEntry`: πόσο συχνά κλείνει hedge
- `urgentHedgeShare` (C/D): πόσο από το hedge έγινε με urgency mode

## 3) Bankroll-aware PnL

```bash
npm run report:pnl -- 5 2
```

- 1ο arg: bankroll σε ευρώ (π.χ. 5)
- 2ο arg: fee % (π.χ. 2)

Output:
- `logs/bankroll-pnl-latest.json`

## 4) Ωριαίο checkpoint (auto)

Script:
- `scripts/hourly-checkpoint.sh`

Τι κάνει κάθε ώρα:
- τρέχει `report:compare`
- τρέχει `report:pnl -- 5 2`
- γράφει summary στα:
  - `logs/hourly-summary-latest.txt`
  - `logs/hourly-summary-history.log`

## 5) Πού είναι τα raw logs

- `logs/events.jsonl` = live events
- `logs/progress.jsonl` = audit log εργασιών/υλοποίησης
- log rotation ενεργό στο `events.jsonl` για έλεγχο μεγέθους
