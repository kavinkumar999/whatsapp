// Preflight / doctor: validate configuration WITHOUT connecting or sending.
//
//   npm run doctor
//
// Verifies: Upstash credentials, a stored session, the recipient list, and the
// message list + cursor — then prints a readable summary (no raw stack traces here).

import { CLI_LINE, printCliFailure, wrapDetail } from '../lib/cli-print.js';
import { requireUpstashEnv } from '../lib/env.js';
import { getCurrentMessage } from '../lib/messages.js';
import { loadRecipients } from '../lib/recipients.js';
import { authSnapshotKey, hasStoredSession } from '../lib/redis.js';

const results = [];
const record = (ok, label, detail, icon = '') =>
  results.push({ ok, label, detail, icon });

const ROW_ICONS = {
  'Upstash credentials': '🔐',
  'Stored session': '🔗',
  Recipients: '👥',
  'Message list': '💬',
};

/** Run one check; record a pass with `onOk`'s detail, or a fail with the error. */
async function step(label, fn) {
  const icon = ROW_ICONS[label] || '•';
  try {
    record(true, label, await fn(), icon);
  } catch (err) {
    record(false, label, err.message || String(err), icon);
  }
}

async function main() {
  try {
    // Env first — every later check needs it, so short-circuit if it's missing.
    try {
      requireUpstashEnv();
      record(
        true,
        'Upstash credentials',
        'UPSTASH_REDIS_REST_URL and _TOKEN are set',
        ROW_ICONS['Upstash credentials']
      );
    } catch (err) {
      record(false, 'Upstash credentials', err.message, ROW_ICONS['Upstash credentials']);
      printReport();
      return;
    }

    await step('Stored session', async () => {
      const ok = await hasStoredSession();
      if (!ok) {
        throw new Error(
          `No session at key "${authSnapshotKey}". Run: npm run link`
        );
      }
      return `Session present (key "${authSnapshotKey}")`;
    });

    await step('Recipients', async () => {
      const recipients = await loadRecipients();
      return `${recipients.length} recipient(s) in Upstash`;
    });

    await step('Message list', async () => {
      const { text, index, count } = await getCurrentMessage(); // peek, never advances
      const preview = text.length > 60 ? `${text.slice(0, 57)}...` : text;
      return `${count} message(s); next is #${index + 1}: "${preview}"`;
    });

    printReport();
  } catch (err) {
    printUnexpected(err);
  }
}

function printReport() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log('');
  console.log('  🩺  Doctor');
  console.log('  ' + CLI_LINE);
  console.log('');

  for (const { ok, label, detail, icon } of results) {
    const mark = ok ? '✅' : '❌';
    console.log(`  ${mark}  ${icon}  ${label}`);
    console.log(wrapDetail(detail, '         ', 64));
    console.log('');
  }

  console.log('  ' + CLI_LINE);
  console.log(
    `  📊  Summary: ${passed} passed · ${failed} failed · ${results.length} total`
  );
  console.log('');

  if (failed > 0) {
    console.log('  ⚠️  Fix the failed items before running send.');
    console.log(
      '  💡  Session missing → `npm run link` · empty lists → `npm run messages:seed` / `npm run recipients:seed`'
    );
    console.log('');
    return;
  }

  console.log('  🚀  All checks passed — ready to send.');
  console.log('');
}

function printUnexpected(err) {
  printCliFailure(err, {
    banner: '🩺  Doctor',
    title: 'Unexpected error',
    titleIcon: '💥',
  });
}

main();
