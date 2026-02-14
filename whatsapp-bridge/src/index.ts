import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WAConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv'; // Changed from * as dotenv to default import
import pino from 'pino';
import fs from 'fs'; // Added
import path from 'path'; // Added

dotenv.config();

const logger = pino({ level: 'info' });
const app = express();
app.use(express.json());

const WEBHOOK_URL = process.env.API_URL || 'http://localhost:8000/api/v1/webhooks/whatsapp';
const WORKSPACE_ID = process.env.WORKSPACE_ID;

let sock: any = null;
let qrCode: string | null = null;
let connectionState: string = 'disconnected';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: logger as any,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger as any),
        },
    });

    sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCode = qr;
        }

        if (connection === 'close') {
            connectionState = 'disconnected';
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            logger.info('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            connectionState = 'connected';
            qrCode = null;
            logger.info('opened connection');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m: any) => {
        logger.info({ m }, 'Messages upsert received');
        if (m.type === 'notify') {
            for (const msg of m.messages) {
                if (!msg.key.fromMe && msg.message) {
                    const text = msg.message.conversation ||
                        msg.message.extendedTextMessage?.text ||
                        msg.message.imageMessage?.caption;

                    if (text) {
                        try {
                            // Prefer remoteJidAlt (actual phone JID) over remoteJid (can be LID)
                            const resolvedJid = msg.key.remoteJidAlt || msg.key.remoteJid;

                            logger.info({
                                webhook: WEBHOOK_URL,
                                payload: {
                                    chat_id: resolvedJid,
                                    original_jid: msg.key.remoteJid,
                                    alt_jid: msg.key.remoteJidAlt,
                                    text
                                }
                            }, 'Sending webhook');

                            const response = await axios.post(WEBHOOK_URL, {
                                workspace_id: WORKSPACE_ID,
                                chat_id: resolvedJid,
                                from_name: msg.pushName || 'WhatsApp User',
                                text: text,
                                message_id: msg.key.id,
                                metadata: {
                                    timestamp: msg.messageTimestamp
                                }
                            });
                            logger.info({ status: response.status }, 'Webhook sent successfully');
                        } catch (error) {
                            logger.error({ error }, 'Failed to send webhook');
                        }
                    }
                }
            }
        }
    });
}

// API Routes
app.get('/status', (req, res) => {
    res.json({ state: connectionState, qr: qrCode });
});

app.post('/connect', async (req, res) => {
    try {
        // Close any existing socket gracefully
        if (sock) {
            try {
                sock.end(undefined);
            } catch (_) { /* ignore */ }
            sock = null;
        }

        // Clear the old auth session so a fresh QR code is generated
        const sessionDir = path.join(__dirname, 'auth_info_baileys');
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }

        // Also check parent directory (compiled TS may resolve differently)
        const altSessionDir = path.resolve(process.cwd(), 'auth_info_baileys');
        if (fs.existsSync(altSessionDir)) {
            fs.rmSync(altSessionDir, { recursive: true, force: true });
        }

        qrCode = null;
        connectionState = 'disconnected';

        // Start a fresh connection — this will trigger QR code generation
        await connectToWhatsApp();

        // Wait briefly for QR to be generated
        await new Promise(resolve => setTimeout(resolve, 3000));

        res.json({
            success: true,
            state: connectionState,
            qr: qrCode,
            message: 'Connection restarted, QR code should appear shortly'
        });
    } catch (error) {
        logger.error({ error }, 'Failed to restart connection');
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

app.post('/send', async (req, res) => {
    const { chat_id, text } = req.body;
    if (!sock || connectionState !== 'connected') {
        return res.status(503).json({ error: 'WhatsApp not connected' });
    }

    try {
        const jid = chat_id.includes('@') ? chat_id : `${chat_id}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

app.post('/logout', async (req, res) => {
    try {
        if (sock) {
            await sock.logout();
            // Clear session folder
            const sessionDir = path.join(__dirname, 'auth_info_baileys'); // Corrected path
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            res.json({ success: true, message: 'Logged out and session cleared' });
            // Restart the connection to start fresh for a new login
            sock = null;
            qrCode = null; // Clear QR code on logout
            connectionState = 'disconnected'; // Update connection state
            connectToWhatsApp().catch(err => logger.error({ err }, 'Error restarting after logout'));
        } else {
            res.status(400).json({ success: false, error: 'No active session' });
        }
    } catch (error) {
        logger.error({ error }, 'Logout failed');
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

const PORT = process.env.WHATSAPP_BRIDGE_PORT || 3001; // Moved PORT definition
app.listen(PORT, () => {
    logger.info(`WhatsApp bridge listening on port ${PORT}`);
    connectToWhatsApp();
});
