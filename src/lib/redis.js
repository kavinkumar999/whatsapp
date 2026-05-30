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
  /** JSON array of message strings for the daily rotation. */
  messages: process.env.UPSTASH_MESSAGES_KEY || 'wa:messages',
  /** Integer index of the next message to send. */
  messagesCursor: process.env.UPSTASH_MESSAGES_CURSOR_KEY || 'wa:messages:cursor',
  /** JSON array of recipients ({ to, name? } or bare strings). */
  recipients: process.env.UPSTASH_RECIPIENTS_KEY || 'wa:recipients',
};

let client;

/** Lazily-created shared Redis client (reads UPSTASH_REDIS_REST_* from env). */
export function redis() {
  if (!client) client = Redis.fromEnv();
  return client;
}
