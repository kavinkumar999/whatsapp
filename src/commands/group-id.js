// Print WhatsApp group JIDs (@g.us) to paste into src/data/recipients.js.
//
//   npm run group-id -- --list
//       List every group the linked account is in.
//   npm run group-id -- https://chat.whatsapp.com/INVITE_CODE
//       Resolve a group JID from an invite link (or a bare invite code).
//
// Requires the same Upstash session as `send` (run `npm run link` once first).

import path from 'path';
import { printCliFailure } from '../lib/cli-print.js';
import { requireUpstashEnv } from '../lib/env.js';
import { restoreAuthDir, saveAuthDir } from '../lib/store.js';
import { sleep } from '../lib/util.js';
import { connectWithRetry } from '../lib/whatsapp.js';

const AUTH_DIR = process.env.AUTH_DIR || path.resolve(process.cwd(), 'auth_info');

const USAGE = `Usage:
  npm run group-id -- --list
      List all group JIDs for the linked account.

  npm run group-id -- https://chat.whatsapp.com/INVITE_CODE
  npm run group-id -- INVITE_CODE
      Resolve the group JID from an invite link (WhatsApp may reject invalid or expired invites).`;

/** Extract an invite code from a full URL or accept a bare code. */
function parseInviteCode(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  const fromUrl = s.match(/chat\.whatsapp\.com\/(?:invite\/)?([^/?#\s]+)/i);
  return fromUrl ? fromUrl[1] : s;
}

async function listGroups(sock) {
  const groups = await sock.groupFetchAllParticipating();
  const rows = Object.values(groups || {});
  if (rows.length === 0) {
    console.log('No groups returned (empty list or still syncing). Try again in a few seconds.');
    return;
  }
  console.log('Groups your linked account is in (use the id as a "to" in src/data/recipients.js):\n');
  for (const g of rows.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''))) {
    console.log(`  ${g.id}`);
    console.log(`    name: ${g.subject || '(no subject)'}\n`);
  }
}

async function resolveInvite(sock, inviteArg) {
  const code = parseInviteCode(inviteArg);
  const meta = await sock.groupGetInviteInfo(code);
  if (!meta?.id) {
    throw new Error('Unexpected response: no group id. Invite may be invalid or expired.');
  }
  console.log('\nUse this value as a "to" in src/data/recipients.js:\n');
  console.log(`  "${meta.id}"\n`);
  console.log(`Group name (from invite): ${meta.subject || '(unknown)'}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const listMode = argv.includes('--list') || argv.includes('-l');
  const inviteArg = argv.find((a) => !a.startsWith('-'));

  if (!listMode && !inviteArg) {
    console.log(USAGE);
    return;
  }

  requireUpstashEnv();
  const restored = await restoreAuthDir(AUTH_DIR);
  if (!restored) {
    throw new Error('No session in Upstash. Run `npm run link` locally first.');
  }

  const sock = await connectWithRetry(AUTH_DIR, {
    loggedOutMessage: 'Session logged out. Re-run `npm run link` locally to re-pair.',
  });

  try {
    if (listMode) {
      await listGroups(sock);
    } else {
      await resolveInvite(sock, inviteArg);
    }
  } finally {
    await sleep(1_000);
    await saveAuthDir(AUTH_DIR);
    sock.end(undefined);
  }
}

main().catch((err) => {
  printCliFailure(err, { title: 'group-id failed', titleIcon: '👥' });
});
