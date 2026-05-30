// Upload a JSON array of message strings to Upstash for the daily rotation.
//
//   node src/commands/messages-seed.js [path/to/messages.json]
// Default file: messages.json in the current directory or the repo root.
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      UPSTASH_MESSAGES_KEY / UPSTASH_MESSAGES_CURSOR_KEY (override default keys)
//      MESSAGES_RESET_CURSOR=1   also reset the cursor to 0 after upload

import { readFile } from 'fs/promises';
import { requireUpstashEnv } from '../lib/env.js';
import { seedMessages } from '../lib/messages.js';
import { resolveDataFile } from '../lib/paths.js';

async function main() {
  requireUpstashEnv();

  const file = resolveDataFile('messages.json', process.argv[2]);
  if (!file) {
    throw new Error(
      'Pass a messages JSON path, or create messages.json in the current directory or repo root. See messages.example.json.'
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

  const messages = data.map((m, i) => {
    if (typeof m !== 'string' || !m.trim()) {
      throw new Error(`Entry ${i} must be a non-empty string`);
    }
    return m.trim();
  });

  const resetCursor = process.env.MESSAGES_RESET_CURSOR === '1';
  await seedMessages(messages, { resetCursor });
  console.log(`Uploaded ${messages.length} messages to Upstash.`);
  if (resetCursor) console.log('Reset the cursor to 0 — the next send starts at the first message.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
