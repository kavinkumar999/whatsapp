// Persists the Baileys auth state (the `auth_info/` folder) in Upstash Redis.
//
// IMPORTANT: this is read-AND-write. Baileys mutates the auth files on every
// connection (consumes pre-keys, ratchets group sender-keys, etc.), so each run
// must restore the folder, send, then save the mutated folder back under the
// same key. Storing it once read-only will desync and get the device logged out.
//
// We treat each auth file as opaque text and snapshot the whole folder into one
// Redis key, so we never have to understand Baileys' internal serialization.

import { promises as fs } from 'fs';
import path from 'path';
import { KEYS, redis } from './redis.js';

/** Redis key holding the Baileys auth folder snapshot (exported for docs / errors). */
export const authSnapshotKey = KEYS.auth;

/** True if a non-empty session snapshot is stored in Redis. */
export async function hasStoredSession() {
  const snapshot = await redis().get(authSnapshotKey);
  return Boolean(snapshot) && typeof snapshot === 'object' && Object.keys(snapshot).length > 0;
}

/** Remove the stored session from Upstash (e.g. before a clean `npm run link`). */
export async function clearAuthSnapshot() {
  await redis().del(authSnapshotKey);
}

/**
 * Restore the auth folder from Redis into `dir`.
 * @returns {Promise<boolean>} true if an existing session was restored.
 */
export async function restoreAuthDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  const snapshot = await redis().get(authSnapshotKey); // { filename: contents } | null
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
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const snapshot = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue; // Baileys stores flat files; skip anything else
    snapshot[entry.name] = await fs.readFile(path.join(dir, entry.name), 'utf-8');
  }
  await redis().set(authSnapshotKey, snapshot);
}
