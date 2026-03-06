import fs from 'fs';
import path from 'path';

const logPath = path.resolve(process.cwd(), 'logs', 'events.jsonl');

export function logEvent(type, payload = {}) {
  const row = { ts: new Date().toISOString(), type, ...payload };
  const line = JSON.stringify(row);
  console.log(line);
  fs.appendFileSync(logPath, line + '\n');
}
