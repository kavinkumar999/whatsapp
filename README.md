# WhatsApp automation (send)

Send WhatsApp messages with [Baileys](https://github.com/WhiskeySockets/Baileys),
triggered from GitHub Actions. The WhatsApp session lives in **Upstash Redis** so
GitHub's ephemeral runners don't need to hold a stateful connection.

> **How the session works:** you pair the device **once** locally (`npm run link`),
> which seeds the auth state into Upstash. Every send then **restores → connects →
> sends → saves the mutated state back**. Baileys changes the session on each
> connection, so the save-back is mandatory — it's not store-once-read-forever.

## Layout

```
src/lib/                     shared modules (no side effects beyond import)
  env.js                       loads .env + validates required env vars
  redis.js                     one lazy Upstash client + the Redis key names
  store.js                     read/write the Baileys auth snapshot in Redis
  whatsapp.js                  open a connection (with retry on the 515 handshake)
  messages.js                  message rotation: read current / advance / seed
  recipients.js                load/validate recipients from Redis, build JIDs
  paths.js                     find data files from cwd or repo root
  util.js                      tiny helpers (sleep)
src/commands/                CLI entrypoints (one per npm script)
  link.js                      ONE-TIME local pairing -> seeds Upstash
  send.js                      restore -> send -> save  (supports --dry-run)
  check.js                     validate config without connecting (doctor)
  group-id.js                  print group @g.us JIDs (invite URL or --list)
  messages-seed.js             upload/replace the message list in Upstash
  recipients-seed.js           upload/replace the recipient list in Upstash
  auth-clear.js                delete the stored session from Upstash
recipients.json              seed source for recipients (number/group jid + name)
messages.example.json        sample 30-day message list; copy to messages.json to seed
.github/workflows/send.yml   manual + ~6 AM IST daily (Redis message rotation)
```

Both the message list **and** the recipient list live in Upstash; the JSON files are
just editable seed sources you upload with the `*:seed` commands.

Run every command from the repo root (`npm run <script>`, or `node src/commands/<name>.js`).

## Commands

| npm script | What it does |
| --- | --- |
| `npm run link` | One-time device pairing; seeds the session into Upstash. |
| `npm run check` | Validate env, session, recipients, and messages — **no send**. |
| `npm run send` | Send to every recipient. Add `-- --dry-run` to preview only. |
| `npm run messages:seed -- <file>` | Upload the message list (JSON array of strings) to Upstash. |
| `npm run recipients:seed -- <file>` | Upload the recipient list to Upstash. |
| `npm run group-id -- --list` | List the linked account's group JIDs. |
| `npm run group-id -- <invite-url>` | Resolve a group JID from an invite link. |
| `npm run auth:clear` | Delete the stored session from Upstash. |

## One-time setup

1. **Create a free Upstash Redis database** at <https://upstash.com>. Copy the
   **REST URL** and **REST TOKEN** (the REST pair, not the `redis://` URL).

2. **Configure credentials.** Copy `.env.example` → `.env` and fill in
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. (`.env` is gitignored;
   you can also export the variables in your shell instead.)

3. **Pair the device** (use a dedicated/second number, not your main one):

   ```bash
   npm install
   npm run link
   ```

   A QR code renders in the terminal. On the phone, open WhatsApp on the account you
   want to link and go **Settings (or ⋮) → Linked devices → Link a device → Scan QR
   code**, then scan the terminal QR. On success the session is saved to Upstash.

4. **Add the same two values as GitHub repo secrets**
   (Settings → Secrets and variables → Actions):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

5. **Seed the recipient and message lists into Upstash:**

   ```bash
   # edit recipients.json (see below), then upload it:
   npm run recipients:seed

   cp messages.example.json messages.json   # edit messages.json, then upload it:
   npm run messages:seed
   ```

6. **Verify everything** before the first real send:

   ```bash
   npm run check               # env + session + recipients + messages
   npm run send -- --dry-run   # prints exactly what would be sent, sends nothing
   ```

### If linking fails or no usable QR appears

Almost always stale auth. Run:

```bash
LINK_FRESH=1 npm run link   # clears the Upstash key + local auth_info/, then shows a fresh QR
```

Then scan the **new** QR immediately (it refreshes every few seconds). Other tips:

- You can't usefully "link" the WhatsApp app that's already logged in on that phone
  to itself — use a **second number / test line** or a fresh account.
- If you hit a device limit, remove old **Chrome/desktop** entries under
  WhatsApp → Linked devices.
- `npm run auth:clear` deletes the Redis snapshot only; also `rm -rf auth_info` if a
  local folder is lingering, then `npm run link` again.

## Recipients

The recipient list is stored in Upstash (key `wa:recipients`). You edit it as a JSON
file and upload it with `npm run recipients:seed`; `send` then reads it from Upstash.
Each entry is a bare string or an object:

```json
[
  { "to": "919876543210", "name": "Asha" },
  { "to": "120363123456789012@g.us", "name": "Team chat" }
]
```

- **`to`** — an international number (digits only, e.g. `919876543210`) **or** a group
  JID ending in `@g.us`.
- **`name`** — optional; `{{name}}` in the message is replaced with it (blank if absent).

Re-run `npm run recipients:seed` whenever you change the list. By default it uploads
`recipients.json` from the current directory or repo root; pass a path
(`npm run recipients:seed -- path/to/file.json`) or set `RECIPIENTS_FILE` to override.

**Groups:** the linked account must **already be a member** of the group, and the JID
is the long `…@g.us` id — **not** the `https://chat.whatsapp.com/…` invite link. Find the
JID with (run after `npm run link`):

```bash
npm run group-id -- --list                                   # you're already in the group
npm run group-id -- "https://chat.whatsapp.com/INVITE_CODE"  # resolve from an invite link
```

## The message list (Redis)

Every send — manual or scheduled — uses the message list stored in Upstash; there is
no per-send message text. The list is a **JSON array of strings** at key `wa:messages`,
and a **cursor** (`wa:messages:cursor`) is the index of the next message to send. Each
run reads the message at the cursor, sends it to every recipient, and **then** advances
the cursor (wrapping after the last item). Advancing only after a successful send means
a failed run retries the same message instead of skipping it. The cursor stays valid
modulo the list length, so you can change the list size anytime.

Seed or refresh the list from a file:

```bash
cp messages.example.json messages.json   # edit messages.json, then:
npm run messages:seed                     # (or: npm run messages:seed -- path/to/messages.json)
```

Add `MESSAGES_RESET_CURSOR=1` to also reset the cursor to 0 so the next send starts at the
first message. Override the keys with `UPSTASH_MESSAGES_KEY` / `UPSTASH_MESSAGES_CURSOR_KEY`.

## Sending

- **Manual:** Actions → *Send WhatsApp messages* → *Run workflow*. Sends the message at
  the current cursor and advances it (same as the scheduled run) — handy for testing.
- **Scheduled:** ~**6:00 IST** daily (`30 0 * * *` UTC; GitHub cron is best-effort and can
  run a few minutes late).
- **Local:** with `.env` set and the list seeded:

  ```bash
  npm run send                   # or: node src/commands/send.js
  ```

  Append `-- --dry-run` (or set `DRY_RUN=1`) to print the current message and the
  resolved recipients **without connecting, sending, or advancing the cursor**.

## Notes & limits

- **Anti-ban:** keep volume low; messages are throttled 5–30s apart (tune with
  `MIN_DELAY_MS` / `MAX_DELAY_MS`). Prefer recipients who have your number saved.
- **Re-pairing:** WhatsApp drops linked devices occasionally. When sends fail with a
  "logged out" error, run `npm run link` again.
- **Baileys is unofficial** and against WhatsApp's ToS; numbers can be banned.

## Roadmap

- In-process scheduler (reliable timing), per-recipient queue, media messages,
  delivery/read receipts.
