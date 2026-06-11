// Daily message rotation in Upstash Redis.
//   list:    JSON array of strings (KEYS.messages,        default wa:messages)
//   cursor:  integer index of the next message (KEYS.messagesCursor)
//   count:   integer list length, set on seed (KEYS.messagesCount); repaired on read if stale
// The cursor is always normalized with `%` against the current list length so it
// cannot point past the last message.

import { KEYS, redis } from './redis.js';

export const MORNING_GREETING = '🌟✨ *வெற்றியின் காலை வணக்கம்!* ✨🌟';

/** Append the morning greeting to the end of a message body before sending. */
export function formatMessageForSend(text) {
  const body = text.trim();
  return body ? `${body}\n\n${MORNING_GREETING}` : MORNING_GREETING;
}

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

/** Normalize a raw cursor value into a valid index in `[0, length)` (Euclidean mod). */
export function normalizeCursor(raw, length) {
  if (!Number.isFinite(length) || length <= 0) return 0;
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
  const len = list.length;

  const [rawCursor, rawCount] = await Promise.all([
    redis().get(KEYS.messagesCursor),
    redis().get(KEYS.messagesCount),
  ]);
  const n = Number(rawCount);
  if (!Number.isFinite(n) || n !== len) {
    await redis().set(KEYS.messagesCount, len);
  }

  const index = normalizeCursor(rawCursor, len);

  const text = list[index];
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(`Message at index ${index} is missing or not a non-empty string`);
  }
  return { text: formatMessageForSend(text), index, count: len };
}

/**
 * Move the cursor to the message after `index`, wrapping at `count`.
 * Call this once a message has been sent successfully.
 * @returns {Promise<number>} the new cursor value.
 */
export async function advanceCursor(index, count) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const safe = normalizeCursor(index, count);
  const next = (safe + 1) % count;
  await redis().set(KEYS.messagesCursor, next);
  return next;
}

/**
 * Replace the message list in Upstash and reset the cursor to **0** so the next
 * send starts at the first message. Also stores the list length under `messagesCount`
 * so metadata stays aligned with the array.
 *
 * @param {string[]} messages — non-empty validated strings
 */
export async function seedMessages(messages) {
  const len = messages.length;
  await redis().set(KEYS.messages, messages);
  await redis().set(KEYS.messagesCursor, 0);
  await redis().set(KEYS.messagesCount, len);
}
