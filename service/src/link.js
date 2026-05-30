// ONE-TIME local linking. Run this on your machine to pair the device and seed
// the session into Upstash. After this succeeds, CI can send without re-pairing
// (until WhatsApp eventually drops the linked device, then run this again).
//
//   PHONE_NUMBER=919876543210 \
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
//   npm run link
//
// PHONE_NUMBER is your number in international format, digits only, no '+'.

import { DisconnectReason } from '@whiskeysockets/baileys';
import path from 'path';
import { restoreAuthDir, saveAuthDir } from './store.js';
import { openOnce } from './whatsapp.js';

const AUTH_DIR = process.env.AUTH_DIR || path.resolve(process.cwd(), 'auth_info');
const PHONE_NUMBER = process.env.PHONE_NUMBER;
const MAX_ATTEMPTS = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Start from whatever is already stored (lets you resume a half-finished link).
  await restoreAuthDir(AUTH_DIR);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { sock, status, code } = await openOnce(AUTH_DIR, async (sock) => {
      if (sock.authState.creds.registered) return;
      if (!PHONE_NUMBER) {
        throw new Error('Set PHONE_NUMBER (digits only, e.g. 919876543210) to request a pairing code');
      }
      await sleep(3_000); // Baileys recommends a brief pause before requesting
      const pairingCode = await sock.requestPairingCode(PHONE_NUMBER);
      console.log('\n=============================================');
      console.log(`  Pairing code:  ${pairingCode}`);
      console.log('  WhatsApp > Linked Devices > Link a device >');
      console.log('  "Link with phone number instead", then enter the code.');
      console.log('=============================================\n');
    });

    if (status === 'open') {
      console.log('Connected. Saving session to Upstash...');
      await sleep(2_000);
      await saveAuthDir(AUTH_DIR);
      console.log('Done. The session is seeded — CI can now send messages.');
      return;
    }

    sock.end(undefined);
    if (code === DisconnectReason.loggedOut) {
      throw new Error('Logged out during linking. Start over.');
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
