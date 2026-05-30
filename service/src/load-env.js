// Load `.env` before any module reads `process.env` (e.g. store.js → Redis.fromEnv()).
// Checks `service/.env` first, then `<cwd>/.env`, so `npm run link` from service/
// and `node service/src/send.js` from repo root both pick up the same file.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(serviceRoot, '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
