import './load-env.js';

// Upload a JSON array of quote strings to Upstash for daily rotation.
//
// Usage (from repo root or service/):
//   node service/src/quotes-seed.js [path/to/quotes.json]
// Default file: ../quotes.json from service/, or ./quotes.json in cwd.
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      UPSTASH_QUOTES_KEY (default wa:quotes)
//      QUOTES_RESET_CURSOR=1  — also set cursor to 0 after upload

import { Redis } from '@upstash/redis';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const redis = Redis.fromEnv();
const LIST_KEY = process.env.UPSTASH_QUOTES_KEY || 'wa:quotes';
const CURSOR_KEY = process.env.UPSTASH_QUOTES_CURSOR_KEY || 'wa:quotes:cursor';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

function resolveQuotesPath() {
  const arg = process.argv[2];
  if (arg) return path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
  const cwd = path.resolve(process.cwd(), 'quotes.json');
  const repo = path.resolve(REPO_ROOT, 'quotes.json');
  if (existsSync(cwd)) return cwd;
  if (existsSync(repo)) return repo;
  throw new Error(
    'Pass quotes JSON path, or create quotes.json in cwd or repo root. See quotes.example.json.'
  );
}

async function main() {
  const file = resolveQuotesPath();
  const data = JSON.parse(await readFile(file, 'utf-8'));
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${file} must be a non-empty JSON array of strings`);
  }
  const normalized = data.map((q, i) => {
    if (typeof q !== 'string' || !q.trim()) {
      throw new Error(`Entry ${i} must be a non-empty string`);
    }
    return q.trim();
  });

  await redis.set(LIST_KEY, normalized);
  console.log(`Uploaded ${normalized.length} quotes to Upstash key "${LIST_KEY}"`);

  if (process.env.QUOTES_RESET_CURSOR === '1') {
    await redis.set(CURSOR_KEY, 0);
    console.log(`Reset cursor key "${CURSOR_KEY}" to 0`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
