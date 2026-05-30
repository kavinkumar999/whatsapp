// Remove the Baileys session snapshot from Upstash and delete local `./auth_info`
// under the current working directory (`force`: no error if it is already gone).
//
//   npm run auth:clear
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      UPSTASH_AUTH_KEY (default wa:auth_info)

import { printCliFailure } from '../lib/cli-print.js';
import { requireUpstashEnv } from '../lib/env.js';
import { authSnapshotKey, clearAuthSnapshot } from '../lib/redis.js';
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  requireUpstashEnv();
  await clearAuthSnapshot();
  // clear the local auth folder
  await fs.rm(path.resolve(process.cwd(), 'auth_info'), { recursive: true, force: true });
  console.log(
    `Cleared Upstash key "${authSnapshotKey}" and removed local ./auth_info (if it existed).`
  );
}

main().catch((err) => {
  printCliFailure(err, { title: 'auth:clear failed', titleIcon: '🧹' });
});
