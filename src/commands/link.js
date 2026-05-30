// ONE-TIME local linking. Run this on your machine to pair the device and seed
// the session into Upstash. After it succeeds, CI can send without re-pairing
// (until WhatsApp eventually drops the linked device, then run this again).
//
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npm run link
//
// A QR code prints in the terminal — scan it from WhatsApp → Linked devices →
// Link a device → Scan QR code.
//
// On success the process calls process.exit(0) so the terminal returns — Baileys
// may otherwise keep the event loop alive after sock.end.

import { promises as fs } from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { printCliFailure } from '../lib/cli-print.js';
import { requireUpstashEnv } from '../lib/env.js';
import { authSnapshotKey, clearAuthSnapshot, restoreAuthDir, saveAuthDir } from '../lib/redis.js';
import { sleep } from '../lib/util.js';
import { connectWithRetry } from '../lib/whatsapp.js';

const AUTH_DIR = process.env.AUTH_DIR || path.resolve(process.cwd(), 'auth_info');
const LINK_FRESH = ['1', 'true', 'yes'].includes(
  String(process.env.LINK_FRESH || '').toLowerCase()
);

const LOGGED_OUT_MESSAGE = [
  'WhatsApp ended linking as "logged out" (session rejected). Try, in order:',
  '  1) Clean slate, then link again:   LINK_FRESH=1 npm run link',
  `  2) Or clear the Redis key "${authSnapshotKey}" (npm run auth:clear) and rm -rf ${AUTH_DIR}`,
  '  3) Scan the QR the moment it appears (it refreshes every few seconds)',
  '  4) In WhatsApp → Linked devices, remove old "Chrome"/desktop sessions if at the device limit',
].join('\n');

async function printQr(qr) {
  console.log('\n=============================================');
  console.log('  Scan with WhatsApp → Linked devices → Link a device');
  console.log('=============================================\n');
  console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
  console.log('');
}

async function main() {
  requireUpstashEnv();

  if (LINK_FRESH) {
    await clearAuthSnapshot();
    await fs.rm(AUTH_DIR, { recursive: true, force: true });
    await fs.mkdir(AUTH_DIR, { recursive: true });
    console.warn(`LINK_FRESH: cleared Upstash key "${authSnapshotKey}" and local ${AUTH_DIR}\n`);
  } else {
    // Start from whatever is already stored (lets you resume a half-finished link).
    const hadStoredAuth = await restoreAuthDir(AUTH_DIR);
    if (hadStoredAuth) {
      console.warn(
        'Found existing auth in Redis/local. If linking stalls before a QR appears, reset with:\n' +
          '  LINK_FRESH=1 npm run link\n'
      );
    }
  }

  const sock = await connectWithRetry(AUTH_DIR, {
    onSocket: async (sock) => {
      if (sock.authState.creds.registered) return;
      console.log('Waiting for QR… (if nothing appears, widen your terminal)\n');
    },
    onConnectionUpdate: (update) => {
      if (update.qr) {
        void printQr(update.qr).catch((err) => {
          printCliFailure(err, {
            title: 'Could not render the QR in this terminal',
            titleIcon: '📱',
          });
        });
      }
    },
    loggedOutMessage: LOGGED_OUT_MESSAGE,
  });

  console.log('Connected. Saving session to Upstash...');
  await sleep(2_000);
  await saveAuthDir(AUTH_DIR);
  sock.end(undefined);
  console.log('Done. The session is seeded — CI can now send messages.');
  // Baileys can leave timers/sockets open; force a clean exit so the shell returns.
  process.exit(0);
}

main().catch((err) => {
  printCliFailure(err, { title: 'Link failed', titleIcon: '🔗' });
});
