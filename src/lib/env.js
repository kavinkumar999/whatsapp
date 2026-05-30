// Loads `.env` and validates required environment variables.
//
// Importing this module (or anything that imports it, e.g. lib/redis.js) loads
// the repo-root `.env` first, then `<cwd>/.env`, so the file is read before any
// code touches `process.env` regardless of which command pulls it in or where
// it's run from. redis.js imports this so the load order is always correct.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..'); // lib/ -> src/ -> repo root

dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Throw a clear error if the Upstash REST credentials are missing.
 * Call this at the start of every command so the failure is obvious rather than
 * a generic error from deep inside the Redis client.
 */
export function requireUpstashEnv() {
  const missing = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'].filter(
    (key) => !process.env[key]?.trim()
  );
  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required environment ${missing.length > 1 ? 'variables' : 'variable'}: ${missing.join(', ')}.`,
        'Set them in .env (copy .env.example) or export them in your shell.',
        'Use the REST URL/token from the Upstash console, not the redis:// connection string.',
      ].join('\n')
    );
  }
}
