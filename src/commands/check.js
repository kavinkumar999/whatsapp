// Preflight / doctor: validate configuration WITHOUT connecting or sending.
//
//   npm run check
//
// Verifies: Upstash credentials, recipients.json, a stored session, the quote
// list + cursor, and the message source — then prints a pass/fail summary.
// Exits non-zero if anything that would break a real send is wrong.

import { requireUpstashEnv } from '../lib/env.js';
import { getNextQuote } from '../lib/quotes.js';
import { loadRecipients, personalize } from '../lib/recipients.js';
import { authSnapshotKey, hasStoredSession } from '../lib/store.js';

const results = [];
const record = (ok, label, detail) => results.push({ ok, label, detail });

/** Run one check; record a pass with `onOk`'s detail, or a fail with the error. */
async function step(label, fn) {
  try {
    record(true, label, await fn());
  } catch (err) {
    record(false, label, err.message || String(err));
  }
}

async function main() {
  // Env first — every later check needs it, so short-circuit if it's missing.
  try {
    requireUpstashEnv();
    record(true, 'Upstash credentials', 'UPSTASH_REDIS_REST_URL and _TOKEN are set');
  } catch (err) {
    record(false, 'Upstash credentials', err.message);
    return report();
  }

  await step('Stored session', async () => {
    const ok = await hasStoredSession();
    if (!ok) throw new Error(`none at key "${authSnapshotKey}" — run \`npm run link\` once`);
    return `present at key "${authSnapshotKey}"`;
  });

  await step('recipients.json', async () => {
    const { file, recipients } = await loadRecipients(process.env.RECIPIENTS_FILE);
    return `${recipients.length} recipient(s) from ${file}`;
  });

  // Message: either a literal MESSAGE, or the rotating Redis quotes.
  const source = (process.env.MESSAGE_SOURCE || 'env').toLowerCase();
  if (source === 'redis') {
    await step('Quotes (MESSAGE_SOURCE=redis)', async () => {
      const { text, index, count } = await getNextQuote({ advance: false }); // peek
      const preview = text.length > 60 ? `${text.slice(0, 57)}...` : text;
      return `${count} quote(s); next is #${index + 1}: "${preview}"`;
    });
  } else {
    await step('Message (MESSAGE)', async () => {
      if (!process.env.MESSAGE?.trim()) {
        throw new Error('MESSAGE is empty — set it, or use MESSAGE_SOURCE=redis');
      }
      return `"${personalize(process.env.MESSAGE, {})}"`;
    });
  }

  report();
}

function report() {
  console.log('\nConfiguration check\n');
  for (const { ok, label, detail } of results) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log('');
  if (failed > 0) {
    console.log(`${failed} check(s) failed — fix the above before sending.`);
    process.exit(1);
  }
  console.log('All checks passed. Ready to send.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
