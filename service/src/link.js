import './load-env.js';

// ONE-TIME local linking. Run this on your machine to pair the device and seed
// the session into Upstash. After this succeeds, CI can send without re-pairing
// (until WhatsApp eventually drops the linked device, then run this again).
//
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npm run link
//
// Default: scan the QR printed in the terminal (WhatsApp → Linked devices →
// Link a device → Scan QR code).
//
// Optional pairing-code flow (no QR): set PHONE_NUMBER (digits only), then
// "Link with phone number instead" on the phone.
//
// If linking dies with "logged out", reset and try again from `service/`:
//   LINK_FRESH=1 npm run link
//
// PHONE_NUMBER (pairing only): your number in international format, digits only, no '+'.

import { DisconnectReason } from '@whiskeysockets/baileys';
import { promises as fs } from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import {
  authSnapshotKey,
  clearAuthSnapshot,
  restoreAuthDir,
  saveAuthDir,
} from './store.js';
import { openOnce } from './whatsapp.js';

const AUTH_DIR = process.env.AUTH_DIR || path.resolve(process.cwd(), 'auth_info');
const PHONE_NUMBER = process.env.PHONE_NUMBER;
const MAX_ATTEMPTS = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const linkFresh = ['1', 'true', 'yes'].includes(
  String(process.env.LINK_FRESH || '').toLowerCase()
);

async function printQr(qr) {
  console.log('\n=============================================');
  console.log('  Scan with WhatsApp → Linked devices → Link a device');
  console.log('=============================================\n');
  console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
  console.log('');
}

async function main() {
  if (linkFresh) {
    await clearAuthSnapshot();
    await fs.rm(AUTH_DIR, { recursive: true, force: true });
    await fs.mkdir(AUTH_DIR, { recursive: true });
    console.warn(
      `LINK_FRESH: cleared Upstash key "${authSnapshotKey}" and local ${AUTH_DIR}\n`
    );
  } else {
    // Start from whatever is already stored (lets you resume a half-finished link).
    const hadStoredAuth = await restoreAuthDir(AUTH_DIR);
    if (hadStoredAuth) {
      console.warn(
        'Found existing auth in Redis/local. If linking fails before a QR appears, reset with:\n' +
          '  LINK_FRESH=1 npm run link\n'
      );
    }
  }

  const usePairingCode = Boolean(PHONE_NUMBER);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { sock, status, code } = await openOnce(
      AUTH_DIR,
      async (sock) => {
        if (sock.authState.creds.registered) return;
        if (usePairingCode) {
          await sleep(3_000); // Baileys recommends a brief pause before requesting
          const pairingCode = await sock.requestPairingCode(PHONE_NUMBER);
          console.log('\n=============================================');
          console.log(`  Pairing code:  ${pairingCode}`);
          console.log('  WhatsApp > Linked Devices > Link a device >');
          console.log('  "Link with phone number instead", then enter the code.');
          console.log('=============================================\n');
        } else {
          console.log(
            'Waiting for QR… (if nothing appears, widen your terminal)\n'
          );
        }
      },
      usePairingCode
        ? undefined
        : {
            onConnectionUpdate: (update) => {
              if (update.qr) {
                void printQr(update.qr).catch((err) => {
                  console.error('Could not render QR:', err.message || err);
                });
              }
            },
          }
    );

    if (status === 'open') {
      console.log('Connected. Saving session to Upstash...');
      await sleep(2_000);
      await saveAuthDir(AUTH_DIR);
      console.log('Done. The session is seeded — CI can now send messages.');
      return;
    }

    sock.end(undefined);
    if (code === DisconnectReason.loggedOut) {
      const hints = usePairingCode
        ? [
            '  3) Same phone as PHONE_NUMBER: Linked devices → remove old desktop/Chrome links if present',
            '  4) Enter the pairing code immediately under "Link with phone number instead"',
            '  Or omit PHONE_NUMBER and use QR linking instead:  npm run link',
          ]
        : [
            '  3) If no QR appeared: stale session — run LINK_FRESH=1 npm run link, then scan immediately',
            '  4) Linked devices → remove old linked "Chrome" / desktop sessions if you hit device limits',
            '  5) Scan the QR as soon as it appears (it refreshes)',
          ];
      throw new Error(
        [
          'WhatsApp ended linking as logged out (session rejected). Try:',
          `  1) Clean slate, then link again from service/:  LINK_FRESH=1 npm run link`,
          `  2) Or delete Redis key "${authSnapshotKey}" and rm -rf the auth folder: ${AUTH_DIR}`,
          ...hints,
        ].join('\n')
      );
    }
    // restartRequired (515) after pairing is normal — recreate and continue.
    console.warn(`link attempt ${attempt} closed (code ${code}); reconnecting...`);
    await sleep(2_000);
  }

  throw new Error(`Linking did not complete after ${MAX_ATTEMPTS} attempts`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
