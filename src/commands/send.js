// CI / local entrypoint: restore session -> connect -> send to recipients -> save.
//
// Both the message and the recipients come from Upstash: the message is the one
// at the current cursor (key wa:messages / cursor wa:messages:cursor) and the
// recipient list is key wa:recipients. The same message goes to every recipient;
// the cursor is advanced only AFTER the send succeeds, so a failed run retries the
// same message rather than skipping it.
//
// Baileys mutates the session on every connection, so we ALWAYS save it back in a
// finally block — even if a send fails — or the device will eventually log out.
//
// Required env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// Optional env: AUTH_DIR, MIN_DELAY_MS / MAX_DELAY_MS (throttle),
//               DRY_RUN=1 (resolve + print the plan, but don't connect or send).
//
// Usage: node src/commands/send.js [--dry-run]

import path from 'path';
import { printCliFailure } from '../lib/cli-print.js';
import { requireUpstashEnv } from '../lib/env.js';
import { advanceCursor, getCurrentMessage } from '../lib/messages.js';
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

async function main() {
  requireUpstashEnv();

  // Peek the current message; we advance the cursor only after a successful send.
  const { text, index, count } = await getCurrentMessage();
  const recipients = await loadRecipients();

  if (DRY_RUN) {
    console.log('DRY RUN — nothing will be sent, cursor not advanced.\n');
    console.log(`message #${index + 1}/${count}: "${text}"\n`);
    console.log(`recipients (${recipients.length}) from Upstash:`);
    for (const r of recipients) {
      console.log(`  -> ${r.jid}`);
      console.log(`     ${personalize(text, r)}`);
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
      await sock.sendMessage(r.jid, { text: personalize(text, r) });
      console.log(`sent -> ${r.jid}`);

      if (i < recipients.length - 1) {
        const wait = randomDelay();
        console.log(`waiting ${(wait / 1000).toFixed(1)}s before next message...`);
        await sleep(wait);
      }
    }

    // Every recipient got the message — advance the cursor for the next run.
    const next = await advanceCursor(index, count);
    console.log(`sent message #${index + 1}/${count}; cursor advanced to ${next}`);
  } finally {
    // ALWAYS save the (now mutated) session back, even if a send failed.
    await sleep(1_500); // let any in-flight creds.update flush to disk
    await saveAuthDir(AUTH_DIR);
    console.log('session saved back to Upstash');
    sock.end(undefined);
  }
}

main().catch((err) => {
  printCliFailure(err, { title: 'Send failed', titleIcon: '📤' });
});
