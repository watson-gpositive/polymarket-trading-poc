import fs from 'fs';
import path from 'path';

const logsDir = path.resolve(process.cwd(), 'logs');
const logPath = path.join(logsDir, 'events.jsonl');
const maxBytes = Number(process.env.LOG_MAX_BYTES || 2_000_000); // ~2MB default
const keepFiles = Number(process.env.LOG_KEEP_FILES || 5);

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(logPath)) return;
    const stat = fs.statSync(logPath);
    if (stat.size < maxBytes) return;

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rotated = path.join(logsDir, `events-${ts}.jsonl`);
    fs.renameSync(logPath, rotated);

    const archived = fs.readdirSync(logsDir)
      .filter(f => /^events-.*\.jsonl$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(logsDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);

    for (const old of archived.slice(keepFiles)) {
      fs.unlinkSync(path.join(logsDir, old.f));
    }
  } catch {
    // non-fatal
  }
}

export function logEvent(type, payload = {}) {
  const row = { ts: new Date().toISOString(), type, ...payload };
  const line = JSON.stringify(row);
  console.log(line);
  fs.mkdirSync(logsDir, { recursive: true });
  rotateIfNeeded();
  fs.appendFileSync(logPath, line + '\n');
}
