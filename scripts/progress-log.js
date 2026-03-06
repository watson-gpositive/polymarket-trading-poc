#!/usr/bin/env node
import fs from 'fs';
import { execSync } from 'child_process';

const [,, phase='note', task='unspecified', ...rest] = process.argv;
const details = rest.join(' ');

function gitHash() {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'no-commit'; }
}

const row = {
  ts: new Date().toISOString(),
  phase,
  task,
  details,
  git: gitHash()
};

fs.mkdirSync('logs', { recursive: true });
fs.appendFileSync('logs/progress.jsonl', JSON.stringify(row) + '\n');
console.log(JSON.stringify(row));
