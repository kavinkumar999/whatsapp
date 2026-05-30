// Load and validate recipients.json, and turn entries into WhatsApp JIDs.
//
// An entry is either a bare string ("919876543210" or "...@g.us") or an object
// { "to": "...", "name": "optional" }. `name` fills in {{name}} in the message.

import { readFile } from 'fs/promises';
import { resolveDataFile } from './paths.js';

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
 * Load, parse and validate recipients.json.
 * @param {string} [override] - explicit path (CLI/env); otherwise cwd or repo root.
 * @returns {Promise<{ file: string, recipients: Array<{to: string, name?: string, jid: string}> }>}
 */
export async function loadRecipients(override) {
  const file = resolveDataFile('recipients.json', override);
  if (!file) {
    throw new Error(
      [
        'recipients.json not found (looked in the current directory and the repo root).',
        'Create it, or set RECIPIENTS_FILE to its path. See the README for the format.',
      ].join('\n')
    );
  }

  let list;
  try {
    list = JSON.parse(await readFile(file, 'utf-8'));
  } catch (err) {
    throw new Error(`Could not parse ${file} as JSON: ${err.message}`);
  }
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${file} must be a non-empty JSON array`);
  }

  return { file, recipients: list.map(normalizeEntry) };
}
