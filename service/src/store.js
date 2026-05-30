// Persists the Baileys auth state (the `auth_info/` folder) in Upstash Redis.
//
// IMPORTANT: this is read-AND-write. Baileys mutates the auth files on every
// connection (consumes pre-keys, ratchets group sender-keys, etc.), so each run
// must restore the folder, send, then save the mutated folder back under the
// same key. Storing it once read-only will desync and get the device logged out.
//
// We treat each auth file as opaque text and snapshot the whole folder into one
// Redis key, so we never have to understand Baileys' internal serialization.

import { Redis } from '@upstash/redis';
import { promises as fs } from 'fs';
import path from 'path';

const AUTH_KEY = process.env.UPSTASH_AUTH_KEY || 'wa:auth_info';

// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the environment.
const redis = Redis.fromEnv();

/**
 * Restore the auth folder from Redis into `dir`.
 * @returns {Promise<boolean>} true if an existing session was restored.
 */
export async function restoreAuthDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  const snapshot = await redis.get(AUTH_KEY); // { filename: contents } | null
  if (!snapshot || typeof snapshot !== 'object') return false;

  for (const [name, contents] of Object.entries(snapshot)) {
    await fs.writeFile(path.join(dir, name), contents, 'utf-8');
  }
  return Object.keys(snapshot).length > 0;
}

/**
 * Snapshot every file in `dir` and save it back to Redis.
 * Call this after a send, in a finally block, so a mutated session is never lost.
 */
export async function saveAuthDir(dir) {
  const files = await fs.readdir(dir);
  const snapshot = {};
  for (const name of files) {
    snapshot[name] = await fs.readFile(path.join(dir, name), 'utf-8');
  }
  await redis.set(AUTH_KEY, snapshot);
}
