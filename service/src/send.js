import './load-env.js';

// CI entrypoint: restore session -> connect -> send to recipients -> save session.
//
// Works from repo root or from service/: default recipients path is ./recipients.json
// in cwd, or ../recipients.json next to this package (repo root layout).
//
// Required env:  UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//                Either MESSAGE (plain text) or MESSAGE_SOURCE=redis (rotating quotes in Upstash).
// Optional env:  RECIPIENTS_FILE (path to JSON list), AUTH_DIR,
//                MIN_DELAY_MS / MAX_DELAY_MS (throttle between messages).
//                UPSTASH_QUOTES_KEY / UPSTASH_QUOTES_CURSOR_KEY (when using redis quotes).

import { DisconnectReason } from '@whiskeysockets/baileys';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getNextQuote } from './quotes.js';
import { restoreAuthDir, saveAuthDir } from './store.js';
import { openOnce } from './whatsapp.js';

const AUTH_DIR = process.env.AUTH_DIR || path.resolve(process.cwd(), 'auth_info');
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
/** Repo root when this app lives in service/src/ (one level up from service/). */
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

function resolveRecipientsPath() {
  const env = process.env.RECIPIENTS_FILE;
  if (env) {
    return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
  }
  const cwdCandidate = path.resolve(process.cwd(), 'recipients.json');
  const repoCandidate = path.resolve(REPO_ROOT, 'recipients.json');
  if (existsSync(cwdCandidate)) return cwdCandidate;
  if (existsSync(repoCandidate)) return repoCandidate;
  throw new Error(
    [
      'recipients.json not found. Tried:',
      `  ${cwdCandidate}`,
      `  ${repoCandidate}`,
      'Create the file, set RECIPIENTS_FILE, or run from the repo root.',
    ].join('\n')
  );
}
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS || 5_000);
const MAX_DELAY_MS = Number(process.env.MAX_DELAY_MS || 30_000);
const MAX_CONNECT_ATTEMPTS = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = () =>
  Math.floor(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));

// Accepts a bare number ("919876543210"), or a full jid for a group ("...@g.us").
function toJid(to) {
  if (to.includes('@')) return to;
  return `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
}

function personalize(template, recipient) {
  return template.replace(/\{\{\s*name\s*\}\}/g, recipient.name || '');
}

async function loadRecipients() {
  const file = resolveRecipientsPath();
  const list = JSON.parse(await readFile(file, 'utf-8'));
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${file} must be a non-empty JSON array`);
  }
  return list;
}

// Connect, retrying on the restart-required handshake. Throws on logout.
async function connect() {
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    const { sock, status, code } = await openOnce(AUTH_DIR);
    if (status === 'open') return sock;

    sock.end(undefined);
    if (code === DisconnectReason.loggedOut) {
      throw new Error(
        'Session logged out by WhatsApp. Re-run `npm run link` locally to re-pair.'
      );
    }
    console.warn(`connect attempt ${attempt} closed (code ${code}); retrying...`);
    await sleep(2_000);
  }
  throw new Error(`Could not establish a connection after ${MAX_CONNECT_ATTEMPTS} attempts`);
}

async function resolveMessage() {
  const source = (process.env.MESSAGE_SOURCE || 'env').toLowerCase();
  if (source === 'redis') {
    return getNextQuote();
  }
  const message = process.env.MESSAGE;
  if (!message?.trim()) {
    throw new Error(
      'Set MESSAGE, or set MESSAGE_SOURCE=redis with a JSON quote list in Upstash (see README).'
    );
  }
  return message;
}

async function main() {
  const message = await resolveMessage();

  const restored = await restoreAuthDir(AUTH_DIR);
  if (!restored) {
    throw new Error(
      'No session found in Upstash. Run `npm run link` locally once to seed it.'
    );
  }

  const recipients = await loadRecipients();
  const sock = await connect();

  try {
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      const jid = toJid(r.to ?? r);
      await sock.sendMessage(jid, { text: personalize(message, r) });
      console.log(`sent -> ${jid}`);

      if (i < recipients.length - 1) {
        const wait = randomDelay();
        console.log(`waiting ${(wait / 1000).toFixed(1)}s before next message...`);
        await sleep(wait);
      }
    }
  } finally {
    // ALWAYS save the (now mutated) session back, even if a send failed.
    await sleep(1_500); // let any in-flight creds.update flush to disk
    await saveAuthDir(AUTH_DIR);
    console.log('session saved back to Upstash');
    sock.end(undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
