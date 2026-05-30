// Daily message rotation in Upstash Redis.
//   list:   JSON array of strings             (KEYS.messages,       default wa:messages)
//   cursor: integer index of the next message (KEYS.messagesCursor, default wa:messages:cursor)
// The cursor wraps modulo the current list length, so the list can change size.

import { KEYS, redis } from './redis.js';

/** Read and validate the message list, throwing a friendly error if unusable. */
async function readMessageList() {
  const list = await redis().get(KEYS.messages);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(
      [
        `No messages in Upstash at key "${KEYS.messages}".`,
        'Seed a JSON array of strings with `npm run messages:seed` (see README), or via the Upstash console.',
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
 * Read the message at the current cursor WITHOUT advancing it.
 * The caller sends the message and then calls `advanceCursor` so a failed send
 * never skips a message.
 * @returns {Promise<{ text: string, index: number, count: number }>}
 */
export async function getCurrentMessage() {
  const list = await readMessageList();
  const index = normalizeCursor(await redis().get(KEYS.messagesCursor), list.length);

  const text = list[index];
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(`Message at index ${index} is missing or not a non-empty string`);
  }
  return { text: text.trim(), index, count: list.length };
}

/**
 * Move the cursor to the message after `index`, wrapping at `count`.
 * Call this once a message has been sent successfully.
 * @returns {Promise<number>} the new cursor value.
 */
export async function advanceCursor(index, count) {
  const next = (index + 1) % count;
  await redis().set(KEYS.messagesCursor, next);
  return next;
}

/**
 * Replace the message list in Upstash with `messages` (already validated strings).
 * @param {string[]} messages
 * @param {{ resetCursor?: boolean }} [options]
 */
export async function seedMessages(messages, { resetCursor = false } = {}) {
  await redis().set(KEYS.messages, messages);
  if (resetCursor) await redis().set(KEYS.messagesCursor, 0);
}
