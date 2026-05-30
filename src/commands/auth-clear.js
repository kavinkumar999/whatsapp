// Remove the Baileys session snapshot from Upstash (the key `link` / `send` use).
// Does not touch local files — run `rm -rf auth_info` from your cwd if needed.
//
//   npm run auth:clear
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      UPSTASH_AUTH_KEY (default wa:auth_info)

import { requireUpstashEnv } from '../lib/env.js';
import { authSnapshotKey, clearAuthSnapshot } from '../lib/store.js';

async function main() {
  requireUpstashEnv();
  await clearAuthSnapshot();
  console.log(`Removed WhatsApp session snapshot from Upstash key "${authSnapshotKey}".`);
  console.log('Local folder not touched — if you have ./auth_info, delete it with: rm -rf auth_info');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
