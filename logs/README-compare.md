# Πώς συγκρίνεις Script A vs Script B

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
- `scriptBv2` = mimic inventory + rebalance logic (v2)

Κρίσιμα fields:
- `ticks`: πόσους κύκλους έτρεξε
- `accepted` (A): πόσα trades πέρασαν όλα τα φίλτρα
- `entries` / `hedges` (B): πόσα inventory entries άνοιξαν και πόσα hedge έγιναν
- `hedgeRatePerEntry`: πόσο συχνά το B καταφέρνει να κλείσει hedge

## 3) Πού είναι τα raw logs

- `logs/events.jsonl` = live events και των 2 scripts
- `logs/progress.jsonl` = audit log εργασιών/υλοποίησης
