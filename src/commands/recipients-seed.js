// Upload the recipient list to Upstash.
//
//   npm run recipients:seed
// Edit the list in src/data/recipients.js, then run this to push it.
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      UPSTASH_RECIPIENTS_KEY (override the default key, wa:recipients)

import recipients from '../data/recipients.js';
import { printCliFailure } from '../lib/cli-print.js';
import { requireUpstashEnv } from '../lib/env.js';
import { seedRecipients, validateRecipients } from '../lib/recipients.js';

async function main() {
  requireUpstashEnv();

  const entries = validateRecipients(recipients); // throws on a bad/empty list
  const count = await seedRecipients(entries);
  console.log(`Uploaded ${count} recipient(s) to Upstash.`);
}

main().catch((err) => {
  printCliFailure(err, { title: 'recipients:seed failed', titleIcon: '📇' });
});
