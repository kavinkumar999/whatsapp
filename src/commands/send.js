// CI / local entrypoint: restore session -> connect -> send to recipients -> save.
//
// Baileys mutates the session on every connection, so we ALWAYS save it back in a
// finally block — even if a send fails — or the device will eventually log out.
//
// Required env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//               plus either MESSAGE (plain text) or MESSAGE_SOURCE=redis (rotating quotes).
// Optional env: RECIPIENTS_FILE, AUTH_DIR, MIN_DELAY_MS / MAX_DELAY_MS (throttle),
//               DRY_RUN=1 (resolve + print the plan, but don't connect or send).
//
// Usage: node src/commands/send.js [--dry-run]

import path from 'path';
import { requireUpstashEnv } from '../lib/env.js';
import { getNextQuote } from '../lib/quotes.js';
import { loadRecipients, personalize } from '../lib/recipients.js';
import { authSnapshotKey, restoreAuthDir, saveAuthDir } from '../lib/store.js';
import { sleep } from '../lib/util.js';
import { connectWithRetry } from '../lib/whatsapp.js';

const AUTH_DIR = process.env.AUTH_DIR || path.resolve(process.cwd(), 'auth_info');
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS || 5_000);
const MAX_DELAY_MS = Number(process.env.MAX_DELAY_MS || 30_000);
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

const randomDelay = () =>
  Math.floor(MIN_DELAY_MS + Math.random() * Math.max(0, MAX_DELAY_MS - MIN_DELAY_MS));

/** Resolve the message text from MESSAGE or the Redis quote rotation. */
async function resolveMessage({ advanceCursor }) {
  const source = (process.env.MESSAGE_SOURCE || 'env').toLowerCase();
  if (source === 'redis') {
    const { text } = await getNextQuote({ advance: advanceCursor });
    return text;
  }
  const message = process.env.MESSAGE;
  if (!message?.trim()) {
    throw new Error(
      'Set MESSAGE, or set MESSAGE_SOURCE=redis with a seeded quote list in Upstash (see README).'
    );
  }
  return message;
}

async function main() {
  requireUpstashEnv();

  // In a dry run, peek the quote (don't advance the cursor) so re-runs are stable.
  const message = await resolveMessage({ advanceCursor: !DRY_RUN });
  const { file, recipients } = await loadRecipients(process.env.RECIPIENTS_FILE);

  if (DRY_RUN) {
    console.log(`DRY RUN — nothing will be sent.\n`);
    console.log(`recipients (${recipients.length}) from ${file}:`);
    for (const r of recipients) {
      console.log(`  -> ${r.jid}`);
      console.log(`     ${personalize(message, r)}`);
    }
    return;
  }

  const restored = await restoreAuthDir(AUTH_DIR);
  if (!restored) {
    throw new Error(
      `No session found in Upstash (key "${authSnapshotKey}"). Run \`npm run link\` locally once to seed it.`
    );
  }

  const sock = await connectWithRetry(AUTH_DIR);

  try {
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      await sock.sendMessage(r.jid, { text: personalize(message, r) });
      console.log(`sent -> ${r.jid}`);

      if (i < recipients.length - 1) {
        const wait = randomDelay();
        console.log(`waiting ${(wait / 1000).toFixed(1)}s before next message...`);
        await sleep(wait);
      }
    }
  } finally {
    // ALWAYS save the (now mutated) session back, even if a send failed.
    await sleep(1_500); // let any in-flight creds.update flush to disk
    await saveAuthDir(AUTH_DIR);
    console.log('session saved back to Upstash');
    sock.end(undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
