# STATUS

Auditable project status for `polymarket-trading-poc`.

## How to verify work

1. Check latest commits in GitHub
2. Check `logs/progress.jsonl` for task-level updates
3. Check `logs/events.jsonl` for runtime execution output

## Logging protocol

- Every meaningful work chunk should append one `start` and one `done` (or `blocked`) record to `logs/progress.jsonl`.
- Each entry includes timestamp + current git short hash.

## Commands

```bash
npm run progress:start -- "task-name" "details"
npm run progress:done -- "task-name" "details"
npm run progress:blocked -- "task-name" "reason"
```
