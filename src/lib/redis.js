// Upstash Redis: lazy client, key names, and Baileys auth folder snapshot helpers.
//
// The client is created lazily on first use so importing this module never throws
// when credentials are absent (commands validate env first). `./env.js` is loaded
// before any UPSTASH_* read.
//
// Auth snapshots are read-AND-write: Baileys mutates the auth files on every
// connection, so each run must restore the folder, connect/send, then save the
// folder back under the same key.

import './env.js';
import { Redis } from '@upstash/redis';
import { promises as fs } from 'fs';
import path from 'path';

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

// --- Baileys auth: flat `auth_info/` folder ↔ one Redis JSON object ---

/** Redis key holding the auth folder snapshot (for docs / errors). */
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
