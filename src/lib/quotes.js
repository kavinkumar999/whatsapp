// Daily quote rotation in Upstash Redis.
//   list:   JSON array of strings           (KEYS.quotes,       default wa:quotes)
//   cursor: integer index of the next quote (KEYS.quotesCursor, default wa:quotes:cursor)
// The cursor wraps modulo the current list length, so the list can change size.

import { KEYS, redis } from './redis.js';

/** Read and validate the quote list, throwing a friendly error if unusable. */
async function readQuoteList() {
  const list = await redis().get(KEYS.quotes);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(
      [
        `No quotes in Upstash at key "${KEYS.quotes}".`,
        'Seed a JSON array of strings with `npm run quotes:seed` (see README), or via the Upstash console.',
      ].join(' ')
    );
  }
  return list;
}

/** Normalize a raw cursor value into a valid index for a list of `length`. */
function normalizeCursor(raw, length) {
  const idx = Number(raw);
  if (!Number.isFinite(idx)) return 0;
  return ((Math.trunc(idx) % length) + length) % length;
}

/**
 * Return the quote at the current cursor.
 * @param {{ advance?: boolean }} [options] - when true (default) the cursor is
 *        moved to the next quote; pass false to peek without side effects.
 * @returns {Promise<{ text: string, index: number, count: number }>}
 */
export async function getNextQuote({ advance = true } = {}) {
  const list = await readQuoteList();
  const index = normalizeCursor(await redis().get(KEYS.quotesCursor), list.length);

  const text = list[index];
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(`Quote at index ${index} is missing or not a non-empty string`);
  }

  if (advance) {
    await redis().set(KEYS.quotesCursor, (index + 1) % list.length);
  }
  return { text: text.trim(), index, count: list.length };
}

/**
 * Replace the quote list in Upstash with `quotes` (already validated strings).
 * @param {string[]} quotes
 * @param {{ resetCursor?: boolean }} [options]
 */
export async function seedQuotes(quotes, { resetCursor = false } = {}) {
  await redis().set(KEYS.quotes, quotes);
  if (resetCursor) await redis().set(KEYS.quotesCursor, 0);
}
