// Upload the recipient list to Upstash from a recipients.json file.
//
//   node src/commands/recipients-seed.js [path/to/recipients.json]
// Default file: recipients.json in the current directory or the repo root.
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      RECIPIENTS_FILE (path override, same as the optional CLI arg)
//      UPSTASH_RECIPIENTS_KEY (override the default key, wa:recipients)

import { readFile } from 'fs/promises';
import { requireUpstashEnv } from '../lib/env.js';
import { resolveDataFile } from '../lib/paths.js';
import { seedRecipients, validateRecipients } from '../lib/recipients.js';

async function main() {
  requireUpstashEnv();

  const file = resolveDataFile('recipients.json', process.argv[2] || process.env.RECIPIENTS_FILE);
  if (!file) {
    throw new Error(
      'Pass a recipients JSON path, or create recipients.json in the current directory or repo root.'
    );
  }

  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf-8'));
  } catch (err) {
    throw new Error(`Could not parse ${file} as JSON: ${err.message}`);
  }

  const entries = validateRecipients(data); // throws on a bad/empty list
  const count = await seedRecipients(entries);
  console.log(`Uploaded ${count} recipient(s) from ${file} to Upstash.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
