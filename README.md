# WhatsApp automation — Phase 1 (send)

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
  src/store.js           read/write the auth state in Upstash
  src/whatsapp.js        open a Baileys connection
  src/link.js            ONE-TIME local pairing -> seeds Upstash
  src/send.js            CI entrypoint: restore -> send -> save
recipients.json          who to message (number or group jid + optional name)
.github/workflows/send.yml   manual + scheduled trigger
```

## One-time setup

1. **Create a free Upstash Redis database** at <https://upstash.com>. Copy the
   **REST URL** and **REST TOKEN** (REST, not the `redis://` URL).

2. **Pair the device locally** (use a dedicated number, not your main one):

   ```bash
   cd service
   npm install
   PHONE_NUMBER=919876543210 \
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io \
   UPSTASH_REDIS_REST_TOKEN=xxxxx \
   npm run link
   ```

   A pairing code prints. In WhatsApp: **Linked Devices → Link a device →
   "Link with phone number instead"**, enter the code. On success the session is
   saved to Upstash.

3. **Add GitHub repo secrets** (Settings → Secrets and variables → Actions):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

4. **Edit `recipients.json`** with the real numbers / group jid.
   - `to`: international number, digits only (e.g. `919876543210`), **or** a group
     jid ending in `@g.us`.
   - `name`: optional; `{{name}}` in the message is replaced with it.

## Sending

- **Manual:** Actions tab → *Send WhatsApp messages* → *Run workflow* → type a message.
- **Scheduled:** edit the `cron` in `.github/workflows/send.yml`. (GitHub cron is
  best-effort and can run late — fine for low-stakes sends.)

## Notes & limits

- **Anti-ban:** keep volume low, messages are throttled 5–30s apart (configurable
  via `MIN_DELAY_MS` / `MAX_DELAY_MS`). Prefer recipients who have your number saved.
- **Re-pairing:** WhatsApp drops linked devices occasionally. When sends start
  failing with a "logged out" error, just run `npm run link` again.
- **Baileys is unofficial** and against WhatsApp's ToS; numbers can be banned.

## Roadmap

- **Phase 2:** in-process scheduler (reliable timing), per-recipient queue, media
  messages, delivery/read receipts.
