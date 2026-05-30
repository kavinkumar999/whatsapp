// Upload a JSON array of quote strings to Upstash for the daily rotation.
//
//   node src/commands/quotes-seed.js [path/to/quotes.json]
// Default file: quotes.json in the current directory or the repo root.
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      UPSTASH_QUOTES_KEY / UPSTASH_QUOTES_CURSOR_KEY (override default keys)
//      QUOTES_RESET_CURSOR=1   also reset the cursor to 0 after upload

import { readFile } from 'fs/promises';
import { requireUpstashEnv } from '../lib/env.js';
import { resolveDataFile } from '../lib/paths.js';
import { seedQuotes } from '../lib/quotes.js';

async function main() {
  requireUpstashEnv();

  const file = resolveDataFile('quotes.json', process.argv[2]);
  if (!file) {
    throw new Error(
      'Pass a quotes JSON path, or create quotes.json in the current directory or repo root. See quotes.example.json.'
    );
  }

  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf-8'));
  } catch (err) {
    throw new Error(`Could not parse ${file} as JSON: ${err.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${file} must be a non-empty JSON array of strings`);
  }

  const quotes = data.map((q, i) => {
    if (typeof q !== 'string' || !q.trim()) {
      throw new Error(`Entry ${i} must be a non-empty string`);
    }
    return q.trim();
  });

  const resetCursor = process.env.QUOTES_RESET_CURSOR === '1';
  await seedQuotes(quotes, { resetCursor });
  console.log(`Uploaded ${quotes.length} quotes to Upstash.`);
  if (resetCursor) console.log('Reset the cursor to 0 — the next send starts at the first quote.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
