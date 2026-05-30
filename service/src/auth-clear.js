import './load-env.js';

// Remove the Baileys session snapshot from Upstash (same key `link` / `send` use).
// Does not delete local files — run `rm -rf auth_info` from your service cwd if needed.
//
//   cd service && npm run auth:clear
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// Optional: UPSTASH_AUTH_KEY (default wa:auth_info)

import { authSnapshotKey, clearAuthSnapshot } from './store.js';

async function main() {
  await clearAuthSnapshot();
  console.log(
    `Removed WhatsApp session snapshot from Upstash key "${authSnapshotKey}".`
  );
  console.log(
    'Local folder not touched — if you have ./auth_info, delete it with: rm -rf auth_info'
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
