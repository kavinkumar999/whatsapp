# WhatsApp automation (send)

Send scheduled WhatsApp messages with [Baileys](https://github.com/WhiskeySockets/Baileys),
driven by GitHub Actions. The message list, the recipient list, and the WhatsApp session
all live in **Upstash Redis**, so GitHub's ephemeral runners stay stateless — they just
restore the session, send, and save it back.

## How it works

- **Session in Redis.** You pair the device **once** locally (`npm run link`), which seeds
  the Baileys auth state into Upstash. Every send then **restores → connects → sends →
  saves the mutated state back**. Baileys changes the session on each connection, so the
  save-back is mandatory — it's not store-once-read-forever.
- **Messages rotate via a cursor.** The message list (`wa:messages`) is an array of
  strings; a cursor (`wa:messages:cursor`) points at the next one. Each run sends the
  message at the cursor to every recipient, then advances the cursor (wrapping at the
  end). The cursor advances **only after a successful send**, so a failed run retries the
  same message instead of skipping it.
- **Recipients in Redis.** The recipient list (`wa:recipients`) is read at send time.
- **You edit lists as code.** `src/data/messages.js` and `src/data/recipients.js` are
  plain arrays; `npm run messages:seed` / `npm run recipients:seed` push them to Upstash.
- **Two triggers.** A GitHub Actions cron (~6 AM IST) and a manual "Run workflow" button
  both do the same thing: send the next message and advance the cursor.

## Quick start

```bash
# 1. Install deps
npm install

# 2. Create an Upstash Redis DB (https://upstash.com), then add credentials:
cp .env.example .env        # fill in UPSTASH_REDIS_REST_URL and _TOKEN

# 3. Pair the device once (scan the QR with WhatsApp → Linked devices)
npm run link

# 4. Edit the lists, then push them to Upstash
#    src/data/recipients.js   and   src/data/messages.js
npm run recipients:seed
npm run messages:seed

# 5. Sanity-check and preview without sending
npm run doctor
npm run send -- --dry-run

# 6. (CI) Add UPSTASH_REDIS_REST_URL / _TOKEN as GitHub Actions secrets
```

Run every command from the repo root — `npm run <script>` or `node src/commands/<name>.js`.

## Commands

| npm script | What it does |
| --- | --- |
| `npm run link` | One-time device pairing; seeds the session into Upstash. |
| `npm run doctor` | Validate env, session, recipients, and messages — **no send**. |
| `npm run send` | Send the current message to every recipient. Add `-- --dry-run` to preview. |
| `npm run messages:seed` | Push `src/data/messages.js` to Upstash. |
| `npm run recipients:seed` | Push `src/data/recipients.js` to Upstash. |
| `npm run group-id -- --list` | List the linked account's group JIDs. |
| `npm run group-id -- <invite-url>` | Resolve a group JID from an invite link. |
| `npm run auth:clear` | Remove the session from Upstash **and** delete local `./auth_info`. |

## Configuration

Set these in `.env` (gitignored) or export them in the shell. CI only needs the two
required secrets.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | ✅ | — | Upstash **REST** URL (not the `redis://` one). |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | — | Upstash REST token. |
| `MIN_DELAY_MS` / `MAX_DELAY_MS` | | `5000` / `30000` | Random throttle between messages (anti-ban). |
| `DRY_RUN` | | — | `1` = preview without sending (same as `--dry-run`). |
| `AUTH_DIR` | | `./auth_info` | Local folder the session is restored into. |
| `LINK_FRESH` | | — | `1` = wipe stored + local auth before linking. |
| `MESSAGES_RESET_CURSOR` | | — | `1` = reset the cursor to 0 when seeding messages. |
| `LOG_LEVEL` | | `silent` | Pino level; set `debug` to see Baileys internals. |
| `UPSTASH_AUTH_KEY` | | `wa:auth_info` | Redis key for the session snapshot. |
| `UPSTASH_MESSAGES_KEY` | | `wa:messages` | Redis key for the message list. |
| `UPSTASH_MESSAGES_CURSOR_KEY` | | `wa:messages:cursor` | Redis key for the cursor. |
| `UPSTASH_RECIPIENTS_KEY` | | `wa:recipients` | Redis key for the recipient list. |

## Setup in detail

1. **Create a free Upstash Redis database** at <https://upstash.com>. Copy the
   **REST URL** and **REST TOKEN** (the REST pair, not the `redis://` URL).

2. **Configure credentials.** Copy `.env.example` → `.env` and fill in
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

3. **Pair the device** (use a dedicated/second number, not your main one):

   ```bash
   npm install
   npm run link
   ```

   A QR code renders in the terminal. On the phone, open WhatsApp on the account you
   want to link and go **Settings (or ⋮) → Linked devices → Link a device → Scan QR
   code**, then scan the terminal QR. On success the session is saved to Upstash.

4. **Add the same two values as GitHub repo secrets**
   (Settings → Secrets and variables → Actions): `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.

5. **Edit the lists** (`src/data/recipients.js`, `src/data/messages.js`) and push them:
   `npm run recipients:seed && npm run messages:seed`.

6. **Verify** before the first real send: `npm run doctor` then `npm run send -- --dry-run`.

### If linking fails or no usable QR appears

Almost always stale auth. Run:

```bash
LINK_FRESH=1 npm run link   # clears the Upstash key + local auth_info/, then shows a fresh QR
```

Then scan the **new** QR immediately (it refreshes every few seconds). Other tips:

- You can't usefully "link" the WhatsApp app that's already logged in on that phone to
  itself — use a **second number / test line** or a fresh account.
- If you hit a device limit, remove old **Chrome/desktop** entries under
  WhatsApp → Linked devices.
- `npm run auth:clear` clears the Redis snapshot **and** removes local `./auth_info`; then run `npm run link` again.

## Editing the lists

Both lists live in Upstash; you edit them as arrays in `src/data/*.js` and re-run the
matching seed command whenever you change them.

### Messages — `src/data/messages.js`

```js
export default [
  'Good morning {{name}}! ☀️',
  'Second message in the rotation.',
  // ...add as many as you like; the cursor wraps after the last one
];
```

```bash
npm run messages:seed                         # push the list
MESSAGES_RESET_CURSOR=1 npm run messages:seed  # ...and restart from the first message
```

`{{name}}` is replaced with each recipient's `name` (blank when omitted). You can change
the list size anytime — the cursor stays valid modulo the new length.

### Recipients — `src/data/recipients.js`

```js
export default [
  { to: '919876543210', name: 'Asha' },
  { to: '120363123456789012@g.us', name: 'Team chat' },
  '919999999999', // bare string also works (no name)
];
```

- **`to`** — an international number (digits only, e.g. `919876543210`) **or** a group
  JID ending in `@g.us`.
- **`name`** — optional; fills in `{{name}}`.

Re-run `npm run recipients:seed` after editing.

**Groups:** the linked account must **already be a member** of the group, and the JID is
the long `…@g.us` id — **not** the `https://chat.whatsapp.com/…` invite link. Find it with
(after `npm run link`):

```bash
npm run group-id -- --list                                   # you're already in the group
npm run group-id -- "https://chat.whatsapp.com/INVITE_CODE"  # resolve from an invite link
```

## Sending

- **Manual:** Actions → *Send WhatsApp messages* → *Run workflow*. Sends the message at
  the current cursor and advances it (identical to the scheduled run) — handy for testing.
- **Scheduled:** ~**6:00 IST** daily (`30 0 * * *` UTC; IST is UTC+5:30, no DST). GitHub
  cron is best-effort and can run a few minutes late.
- **Local:** with `.env` set and the lists seeded:

  ```bash
  npm run send                   # or: node src/commands/send.js
  npm run send -- --dry-run      # print the message + recipients; send nothing
  ```

  A dry run prints the current message and the resolved recipients **without connecting,
  sending, or advancing the cursor**.

> Concurrency: the workflow uses a `concurrency` group so two runs never touch the session
> at once (overlapping runs would clobber each other's saved auth state).

## Layout

```
src/lib/                     shared modules (no side effects beyond import)
  env.js                       loads .env + validates required env vars
  redis.js                     one lazy Upstash client + the Redis key names
  store.js                     read/write the Baileys auth snapshot in Redis
  whatsapp.js                  open a connection (with retry on the 515 handshake)
  messages.js                  message rotation: read current / advance / seed
  recipients.js                load/validate recipients from Redis, build JIDs
  util.js                      tiny helpers (sleep)
src/data/                    editable lists you push to Upstash with *:seed
  messages.js                  the message list (array of strings)
  recipients.js                the recipient list (numbers / group jids)
src/commands/                CLI entrypoints (one per npm script)
  link.js                      ONE-TIME local pairing -> seeds Upstash
  send.js                      restore -> send -> save  (supports --dry-run)
  doctor.js                    validate config without connecting
  group-id.js                  print group @g.us JIDs (invite URL or --list)
  messages-seed.js             push src/data/messages.js to Upstash
  recipients-seed.js           push src/data/recipients.js to Upstash
  auth-clear.js                delete the stored session from Upstash
.github/workflows/send.yml   manual + ~6 AM IST daily (Redis message rotation)
```

## Notes & limits

- **Anti-ban:** keep volume low; messages are throttled 5–30s apart (tune with
  `MIN_DELAY_MS` / `MAX_DELAY_MS`). Prefer recipients who have your number saved.
- **Re-pairing:** WhatsApp drops linked devices occasionally. When sends fail with a
  "logged out" error, run `npm run link` again.
- **Baileys is unofficial** and against WhatsApp's ToS; numbers can be banned. Use a
  throwaway/secondary number.
- **Requirements:** Node ≥ 20.

## Roadmap

- In-process scheduler (reliable timing), per-recipient queue, media messages,
  delivery/read receipts.
