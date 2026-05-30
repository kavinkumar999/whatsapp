import './load-env.js';

// Print WhatsApp group JIDs (@g.us) for recipients.json.
//
//   cd service
//   npm run group-id -- --list
//   npm run group-id -- https://chat.whatsapp.com/INVITE_CODE
//
// Requires the same Upstash session as send (run `npm run link` once).

import { DisconnectReason } from '@whiskeysockets/baileys';
import path from 'path';
import { restoreAuthDir, saveAuthDir } from './store.js';
import { openOnce } from './whatsapp.js';

const AUTH_DIR = process.env.AUTH_DIR || path.resolve(process.cwd(), 'auth_info');
const MAX_CONNECT_ATTEMPTS = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Invite code from a full URL or the code alone. */
function parseInviteCode(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  const fromUrl = s.match(/chat\.whatsapp\.com\/(?:invite\/)?([^/?#\s]+)/i);
  if (fromUrl) return fromUrl[1];
  return s;
}

async function connect() {
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    const { sock, status, code } = await openOnce(AUTH_DIR);
    if (status === 'open') return sock;

    sock.end(undefined);
    if (code === DisconnectReason.loggedOut) {
      throw new Error(
        'Session logged out. Re-run `npm run link` locally to re-pair.'
      );
    }
    console.warn(`connect attempt ${attempt} closed (code ${code}); retrying...`);
    await sleep(2_000);
  }
  throw new Error(`Could not connect after ${MAX_CONNECT_ATTEMPTS} attempts`);
}

async function main() {
  const argv = process.argv.slice(2);
  const listMode = argv.includes('--list') || argv.includes('-l');
  const inviteArg = argv.find((a) => !a.startsWith('-'));

  if (!listMode && !inviteArg) {
    console.log(`Usage:
  npm run group-id -- --list
      List all group JIDs for the linked account.

  npm run group-id -- https://chat.whatsapp.com/INVITE_CODE
  npm run group-id -- INVITE_CODE
      Resolve the group JID from an invite link (WhatsApp may reject invalid or expired invites).
`);
    process.exitCode = 1;
    return;
  }

  const restored = await restoreAuthDir(AUTH_DIR);
  if (!restored) {
    throw new Error('No session in Upstash. Run `npm run link` locally first.');
  }

  const sock = await connect();

  try {
    if (listMode) {
      const groups = await sock.groupFetchAllParticipating();
      const rows = Object.values(groups || {});
      if (rows.length === 0) {
        console.log('No groups returned (empty list or still syncing). Try again in a few seconds.');
        return;
      }
      console.log('Groups your linked account is in (use the id in recipients.json "to"):\n');
      for (const g of rows.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''))) {
        console.log(`  ${g.id}`);
        console.log(`    name: ${g.subject || '(no subject)'}\n`);
      }
      return;
    }

    const code = parseInviteCode(inviteArg);
    const meta = await sock.groupGetInviteInfo(code);
    if (!meta?.id) {
      throw new Error('Unexpected response: no group id. Invite may be invalid or expired.');
    }
    console.log('\nUse this value in recipients.json as "to":\n');
    console.log(`  "${meta.id}"\n`);
    console.log(`Group name (from invite): ${meta.subject || '(unknown)'}\n`);
  } finally {
    await sleep(1_000);
    await saveAuthDir(AUTH_DIR);
    sock.end(undefined);
  }
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
