// Thin wrapper around Baileys: open a single connection backed by an auth folder.
//
// Baileys is event-driven and frequently asks for a reconnect right after the
// first handshake (DisconnectReason.restartRequired = 515), so callers should
// open in a loop and recreate the socket on that code. `openOnce` resolves once
// the connection either opens or closes, and reports the close code so the
// caller can decide whether to retry.

import makeWASocket, {
  Browsers,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

/**
 * Open a Baileys socket once.
 * @param {string} authDir - local folder holding the auth state.
 * @param {(sock: any) => Promise<void>} [onSocket] - optional hook called right
 *        after socket creation, before the connection opens (used by `link` to
 *        request a pairing code).
 * @param {{ onConnectionUpdate?: (update: any) => void }} [options] - e.g. `link`
 *        passes a handler to print QR codes from `update.qr`.
 * @returns {Promise<{ sock: any, status: 'open' | 'close', code?: number }>}
 */
export async function openOnce(authDir, onSocket, options) {
  const { onConnectionUpdate } = options ?? {};
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    // Match a normal WhatsApp Web client (Baileys default). A custom label like
    // "WhatsApp-Automation" is easy for the server to flag and reject during QR link.
    browser: Browsers.appropriate('Chrome'),
  });

  // Persist credential changes to the folder as they happen.
  sock.ev.on('creds.update', saveCreds);

  if (onSocket) await onSocket(sock);

  return await new Promise((resolve) => {
    sock.ev.on('connection.update', (update) => {
      onConnectionUpdate?.(update);
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        resolve({ sock, status: 'open' });
      } else if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        resolve({ sock, status: 'close', code });
      }
    });
  });
}
