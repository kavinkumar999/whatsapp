// Daily quote rotation in Upstash Redis (same instance as auth).
// List: JSON array of strings (default key wa:quotes).
// Cursor: integer index for next send (default key wa:quotes:cursor), wraps with list length.

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const LIST_KEY = process.env.UPSTASH_QUOTES_KEY || 'wa:quotes';
const CURSOR_KEY = process.env.UPSTASH_QUOTES_CURSOR_KEY || 'wa:quotes:cursor';

/**
 * Returns the quote at the current cursor and advances cursor (mod list length).
 * @returns {Promise<string>}
 */
export async function getNextQuote() {
  const list = await redis.get(LIST_KEY);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(
      [
        `No quotes in Upstash at key "${LIST_KEY}".`,
        'Set a JSON array of strings (e.g. `npm run quotes:seed` from service/, or Upstash console).',
        `Optional env: UPSTASH_QUOTES_KEY (list), UPSTASH_QUOTES_CURSOR_KEY (cursor).`,
      ].join(' ')
    );
  }

  const raw = await redis.get(CURSOR_KEY);
  let idx = Number(raw);
  if (!Number.isFinite(idx)) idx = 0;
  idx = ((idx % list.length) + list.length) % list.length;

  const text = list[idx];
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(`Quote at index ${idx} is missing or not a non-empty string`);
  }

  const next = (idx + 1) % list.length;
  await redis.set(CURSOR_KEY, next);

  return text.trim();
}
