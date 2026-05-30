// Recipients are stored in Upstash Redis (key wa:recipients) and seeded from
// src/data/recipients.js with `npm run recipients:seed`.
//
// An entry is either a bare string ("919876543210" or "...@g.us") or an object
// { "to": "...", "name": "optional" }. `name` fills in {{name}} in the message.

import { KEYS, redis } from './redis.js';

/**
 * Convert a recipient address to a WhatsApp JID.
 * Accepts a bare number ("919876543210") or any full jid (e.g. a group "...@g.us").
 */
export function toJid(to) {
  const raw = String(to).trim();
  if (raw.includes('@')) return raw; // already a jid (group @g.us or full @s.whatsapp.net)
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) {
    throw new Error(`Invalid recipient "${to}": expected a digits-only number or a jid ending in @g.us`);
  }
  return `${digits}@s.whatsapp.net`;
}

/** Replace {{name}} (with optional inner spaces) in `template`. */
export function personalize(template, recipient) {
  return template.replace(/\{\{\s*name\s*\}\}/g, recipient.name || '');
}

/** Validate one raw entry and return a normalized { to, name, jid }. */
function normalizeEntry(entry, index) {
  const to = typeof entry === 'string' ? entry : entry?.to;
  if (typeof to !== 'string' || !to.trim()) {
    throw new Error(
      `recipients[${index}] has no "to" — expected a number like 919876543210 or a group jid like 1203...@g.us`
    );
  }
  const name = entry && typeof entry === 'object' ? entry.name : undefined;
  return { to: to.trim(), name, jid: toJid(to) };
}

/**
 * Validate a raw array of entries (e.g. from src/data/recipients.js).
 * @returns {Array<{to: string, name?: string, jid: string}>}
 */
export function validateRecipients(list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('recipients must be a non-empty array');
  }
  return list.map(normalizeEntry);
}

/**
 * Load and validate recipients from Redis (key wa:recipients).
 * @returns {Promise<Array<{to: string, name?: string, jid: string}>>}
 */
export async function loadRecipients() {
  const list = await redis().get(KEYS.recipients);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(
      `No recipients in Upstash at key "${KEYS.recipients}". Seed them with \`npm run recipients:seed\` (see README).`
    );
  }
  return validateRecipients(list);
}

/**
 * Replace the recipient list in Redis. Stores the cleaned { to, name } entries
 * (the jid is derived on read, so it isn't persisted).
 * @param {Array<{to: string, name?: string}>} entries - already validated.
 * @returns {Promise<number>} how many entries were stored.
 */
export async function seedRecipients(entries) {
  const stored = entries.map(({ to, name }) => (name ? { to, name } : { to }));
  await redis().set(KEYS.recipients, stored);
  return stored.length;
}
