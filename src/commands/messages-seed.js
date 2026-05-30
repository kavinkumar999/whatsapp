// Upload the message list to Upstash for the daily rotation.
//
//   npm run messages:seed
// Edit the list in src/data/messages.js, then run this to push it.
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      UPSTASH_MESSAGES_KEY / UPSTASH_MESSAGES_CURSOR_KEY (override default keys)
//      MESSAGES_RESET_CURSOR=1   also reset the cursor to 0 after upload

import messages from '../data/messages.js';
import { requireUpstashEnv } from '../lib/env.js';
import { seedMessages } from '../lib/messages.js';

async function main() {
  requireUpstashEnv();

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('src/data/messages.js must export a non-empty array of strings');
  }
  const cleaned = messages.map((m, i) => {
    if (typeof m !== 'string' || !m.trim()) {
      throw new Error(`src/data/messages.js entry ${i} must be a non-empty string`);
    }
    return m.trim();
  });

  const resetCursor = process.env.MESSAGES_RESET_CURSOR === '1';
  await seedMessages(cleaned, { resetCursor });
  console.log(`Uploaded ${cleaned.length} messages to Upstash.`);
  if (resetCursor) console.log('Reset the cursor to 0 — the next send starts at the first message.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
