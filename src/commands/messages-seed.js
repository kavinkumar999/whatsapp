// Upload the message list to Upstash for the daily rotation.
//
//   npm run messages:seed
// Edit the list in src/data/messages.js, then run this to push it.
// The message cursor is always reset to 0 so the next send starts at the first line.
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      UPSTASH_MESSAGES_KEY / UPSTASH_MESSAGES_CURSOR_KEY (override default keys)

import messages from '../data/messages.js';
import { printCliFailure } from '../lib/cli-print.js';
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

  await seedMessages(cleaned);
  console.log(`Uploaded ${cleaned.length} messages to Upstash (count key + cursor reset).`);
  console.log('Cursor reset to 0 — the next send starts at the first message.');
}

main().catch((err) => {
  printCliFailure(err, { title: 'messages:seed failed', titleIcon: '💬' });
});
