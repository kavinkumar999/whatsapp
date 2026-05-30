// Single Upstash Redis client + the key names this service uses.
//
// The client is created lazily on first use so that simply importing this module
// never throws when credentials are absent (commands can validate env first and
// print a friendly message). Importing `./env.js` here guarantees `.env` is
// loaded before we read any UPSTASH_* variable.

import './env.js';
import { Redis } from '@upstash/redis';

/** Redis keys, overridable via env so multiple deployments can share one DB. */
export const KEYS = {
  /** JSON snapshot of the Baileys auth folder. */
  auth: process.env.UPSTASH_AUTH_KEY || 'wa:auth_info',
  /** JSON array of quote strings for the daily rotation. */
  quotes: process.env.UPSTASH_QUOTES_KEY || 'wa:quotes',
  /** Integer index of the next quote to send. */
  quotesCursor: process.env.UPSTASH_QUOTES_CURSOR_KEY || 'wa:quotes:cursor',
};

let client;

/** Lazily-created shared Redis client (reads UPSTASH_REDIS_REST_* from env). */
export function redis() {
  if (!client) client = Redis.fromEnv();
  return client;
}
