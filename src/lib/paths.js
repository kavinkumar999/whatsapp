// Locate data files (recipients.json, messages.json) whether a command is run from
// the repo root or a subdirectory.

import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: lib/ -> src/ -> repo root. */
export const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Resolve a data file by name.
 * @param {string} filename - e.g. "recipients.json".
 * @param {string} [override] - explicit path (absolute, or relative to cwd) that
 *        wins if provided (typically from a CLI arg or env var).
 * @returns {string | null} an existing absolute path, or null if none found.
 */
export function resolveDataFile(filename, override) {
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
  }
  const candidates = [
    path.resolve(process.cwd(), filename),
    path.resolve(REPO_ROOT, filename),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}
