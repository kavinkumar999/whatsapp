# WhatsApp automation (send)

Send WhatsApp messages with [Baileys](https://github.com/WhiskeySockets/Baileys),
triggered from GitHub Actions. The WhatsApp session is stored in **Upstash Redis**
so GitHub's ephemeral runners don't need to hold a stateful connection.

> **How the session works:** you pair the device **once** locally (`npm run link`),
> which seeds the auth state into Upstash. Every send then **restores → connects →
> sends → saves the mutated state back**. Baileys changes the session on each
> connection, so the save-back is mandatory — it's not store-once-read-forever.

## Layout

```
service/                 Baileys sender (Node, ESM)
  src/load-env.js        load service/.env (and cwd .env) before Redis/Baileys
  src/store.js           read/write the auth state in Upstash
  src/whatsapp.js        open a Baileys connection
  src/link.js            ONE-TIME local pairing -> seeds Upstash
  src/send.js            CI entrypoint: restore -> send -> save
  src/quotes.js          next quote from Upstash + advance cursor
  src/quotes-seed.js     upload/replace quote JSON array in Upstash
  src/group-id.js        print group @g.us JIDs (invite URL or --list)
recipients.json          who to message (number or group jid + optional name)
quotes.example.json      sample 30-day list; copy to quotes.json for seeding
.github/workflows/send.yml   manual + ~6 AM IST daily (Redis quote rotation)
```

## One-time setup

1. **Create a free Upstash Redis database** at <https://upstash.com>. Copy the
   **REST URL** and **REST TOKEN** (REST, not the `redis://` URL).

2. **Pair the device locally** (use a dedicated number, not your main one).

   Either export variables in the shell, or put them in **`service/.env`** (gitignored)
   — `link` and `send` load that file automatically before reading `process.env`.

   **Default: QR in the terminal** (no `PHONE_NUMBER` needed):

   ```bash
   cd service
   npm install
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io \
   UPSTASH_REDIS_REST_TOKEN=xxxxx \
   npm run link
   ```

   A QR code renders in the terminal. On the phone, open WhatsApp on the account you want
   to link and go: **Settings (or ⋮) → Linked devices → Link a device → Scan QR code**,
   then scan the terminal QR. On success the session is saved to Upstash.

   **Optional: pairing code instead of QR** — set `PHONE_NUMBER` (digits only, same account
   you are linking). Then choose **Link with phone number instead** and enter the code from
   the terminal quickly.

   **If linking fails or you never get a usable QR / code**

   - **Stale session:** if you retried with a different number or a half-finished link,
     delete the Redis snapshot key (default name `wa:auth_info` in Upstash) and remove any
     local `auth_info/` folder under the directory you run from, then run `npm run link`
     again.
   - **Same device confusion:** you cannot “link” the WhatsApp app that is already logged
     in on that phone to itself in a useful way for Baileys; use a **second number / test
     line** on another phone or a fresh WhatsApp account as the README recommends.
   - **"Logged out" right after scanning or entering a code:** stale or half-linked state.
     From `service/` run **`LINK_FRESH=1 npm run link`** once (clears the Upstash snapshot key
     and local `auth_info/`), then scan the **new** QR or enter the **new** code immediately.
     If you only saw "Waiting for QR…" and no QR, that is almost always stale auth — same fix.
     Or delete the Redis key `wa:auth_info` manually and remove the local `auth_info/` folder,
     then `npm run link` again.

   On success the session is saved to Upstash.

3. **Add GitHub repo secrets** (Settings → Secrets and variables → Actions):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

4. **Daily quotes (scheduled sends):** the workflow runs on a **6 AM India (IST)** cron
   (`30 0 * * *` UTC — IST is UTC+5:30 year-round). That run uses **`MESSAGE_SOURCE=redis`**:
   it reads a **JSON array of strings** from Upstash key **`wa:quotes`** (default), sends the
   string at the current **cursor** key **`wa:quotes:cursor`**, then stores the next index
   (wraps after the last item). You can change the list anytime in the Upstash console or by
   re-seeding; the cursor keeps advancing modulo the new length.

   **Seed or refresh the list from a file** (after `service/.env` has `UPSTASH_*`):

   ```bash
   cp quotes.example.json quotes.json   # edit quotes.json, then:
   cd service && npm run quotes:seed -- ../quotes.json
   ```

   Optional: **`QUOTES_RESET_CURSOR=1 npm run quotes:seed -- ../quotes.json`** resets the
   cursor to 0 so the next send starts at the first quote. Override keys with
   **`UPSTASH_QUOTES_KEY`** / **`UPSTASH_QUOTES_CURSOR_KEY`** in `.env` or GitHub env if needed.

5. **Edit `recipients.json`** with the real numbers / group jid.
   - `to`: international number, digits only (e.g. `919876543210`), **or** a group
     jid ending in `@g.us`.
   - `name`: optional; `{{name}}` in the message is replaced with it.

   **Groups:** The account you linked with `npm run link` must **already be in** that group.
   Set `to` to the full group JID (long id + `@g.us`), for example:

   ```json
   { "to": "120363123456789012@g.us", "name": "Team chat" }
   ```

   That id is **not** the same string as an invite link (`https://chat.whatsapp.com/…`).

6. **Find the id (after `npm run link` once, from `service/` with `service/.env` set):**

   - **You are already in the group:** list every group JID for the linked account:

     ```bash
     npm run group-id -- --list
     ```

   - **You have an invite link** (anyone can share it; you may not be a member yet):

     ```bash
     npm run group-id -- "https://chat.whatsapp.com/INVITE_CODE_HERE"
     ```

     The script prints the `"…@g.us"` string to paste into `recipients.json` as `to`.
     Invalid or expired invites will error from WhatsApp.

## Sending

- **Manual:** Actions tab → *Send WhatsApp messages* → *Run workflow* → type a message
  (uses `MESSAGE` from the form, not Redis quotes).
- **Scheduled:** ~**6:00 IST** daily (`30 0 * * *` UTC). Uses the **next quote** from Upstash
  and advances the cursor. (GitHub cron is best-effort and can run a few minutes late.)
- **Local (same vars as `export`, but in `service/.env`):** copy
  `service/.env.example` → `service/.env`, set `UPSTASH_*`, then either set **`MESSAGE`**
  or **`MESSAGE_SOURCE=redis`** (quotes must exist in Upstash). Run **`cd service && npm run send`**
  or from the **repo root**:

  ```bash
  node service/src/send.js
  ```

## Notes & limits

- **Anti-ban:** keep volume low, messages are throttled 5–30s apart (configurable
  via `MIN_DELAY_MS` / `MAX_DELAY_MS`). Prefer recipients who have your number saved.
- **Re-pairing:** WhatsApp drops linked devices occasionally. When sends start
  failing with a "logged out" error, just run `npm run link` again.
- **Baileys is unofficial** and against WhatsApp's ToS; numbers can be banned.

## Roadmap

- In-process scheduler (reliable timing), per-recipient queue, media messages,
  delivery/read receipts.
