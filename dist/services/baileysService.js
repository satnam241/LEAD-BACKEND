"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onIncomingMessage = onIncomingMessage;
exports.onMessageRead = onMessageRead;
exports.onMessageStatus = onMessageStatus;
exports.isSpamFlood = isSpamFlood;
exports.extractMessageText = extractMessageText;
exports.normalizePhone = normalizePhone;
exports.toJid = toJid;
exports.startWhatsApp = startWhatsApp;
exports.getConnectionStatus = getConnectionStatus;
exports.sendText = sendText;
exports.sendInteractiveButtons = sendInteractiveButtons;
exports.sendMedia = sendMedia;
exports.resetWhatsAppSession = resetWhatsAppSession;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const pino_1 = __importDefault(require("pino"));
const qrcode_1 = __importDefault(require("qrcode"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const AUTH_FOLDER = process.env.BAILEYS_AUTH_FOLDER || path_1.default.join(process.cwd(), 'auth_info_baileys');
let sock = null;
let latestQrDataUrl = null;
let connectionStatus = 'connecting';
let isConnecting = false;
let reconnectTimer = null;
let incomingMessageHandler = null;
let messageReadHandler = null;
let messageStatusHandler = null;
function onIncomingMessage(handler) {
    incomingMessageHandler = handler;
}
function onMessageRead(handler) {
    messageReadHandler = handler;
}
function onMessageStatus(handler) {
    messageStatusHandler = handler;
}
// In-memory rate limiting map for flood protection: jid -> { count, resetTime }
const spamProtectionMap = new Map();
function isSpamFlood(jid) {
    if (!jid)
        return true;
    const now = Date.now();
    const record = spamProtectionMap.get(jid);
    if (!record || now > record.resetTime) {
        spamProtectionMap.set(jid, { count: 1, resetTime: now + 10000 }); // 10s window
        return false;
    }
    record.count++;
    return record.count > 6; // drop flood if >6 messages within 10 seconds
}
// Unpack ephemeral, viewOnce, button replies, list replies, or regular text safely
function extractMessageText(message) {
    if (!message)
        return undefined;
    try {
        let m = message;
        if (m.ephemeralMessage?.message)
            m = m.ephemeralMessage.message;
        if (m.viewOnceMessage?.message)
            m = m.viewOnceMessage.message;
        if (m.viewOnceMessageV2?.message)
            m = m.viewOnceMessageV2.message;
        if (m.documentWithCaptionMessage?.message)
            m = m.documentWithCaptionMessage.message;
        let interactiveReply;
        if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
            try {
                const parsed = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                interactiveReply = parsed.id || parsed.display_text || parsed.title;
            }
            catch {
                interactiveReply = m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
            }
        }
        const raw = interactiveReply ||
            m.conversation ||
            m.extendedTextMessage?.text ||
            m.buttonsResponseMessage?.selectedDisplayText ||
            m.buttonsResponseMessage?.selectedButtonId ||
            m.templateButtonReplyMessage?.selectedDisplayText ||
            m.templateButtonReplyMessage?.selectedId ||
            m.listResponseMessage?.title ||
            m.listResponseMessage?.singleSelectReply?.selectedRowId ||
            m.imageMessage?.caption ||
            m.videoMessage?.caption ||
            undefined;
        if (!raw || typeof raw !== 'string')
            return undefined;
        // Security sanitization: strip null bytes, dangerous control characters, and cap length to 4000
        const cleaned = raw.replace(/\0/g, '').trim();
        if (cleaned.length > 4000) {
            return cleaned.slice(0, 4000);
        }
        return cleaned;
    }
    catch (err) {
        console.error('[Baileys Security] Error parsing incoming message text:', err);
        return undefined;
    }
}
function normalizePhone(raw) {
    if (!raw)
        return '';
    const cleanPart = raw.toString().trim().split('@')[0].split(':')[0];
    let digits = cleanPart.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) {
        digits = digits.slice(1);
    }
    if (digits.length === 10) {
        digits = '91' + digits;
    }
    return digits;
}
function toJid(phone) {
    if (!phone)
        return '';
    const digits = normalizePhone(phone);
    if (!digits)
        return '';
    return `${digits}@s.whatsapp.net`;
}
async function startWhatsApp() {
    if (isConnecting) {
        console.log('[Baileys] Connection attempt already in progress, skipping duplicate call.');
        return;
    }
    isConnecting = true;
    try {
        const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(AUTH_FOLDER);
        if (sock) {
            try {
                sock.ev.removeAllListeners('connection.update');
                sock.ev.removeAllListeners('creds.update');
                sock.ev.removeAllListeners('messages.upsert');
                sock.ev.removeAllListeners('messages.update');
                sock.ev.removeAllListeners('message-receipt.update');
            }
            catch { }
        }
        sock = (0, baileys_1.default)({
            auth: state,
            logger: (0, pino_1.default)({ level: 'silent' }),
            printQRInTerminal: true,
            defaultQueryTimeoutMs: 60000,
        });
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                latestQrDataUrl = await qrcode_1.default.toDataURL(qr);
                connectionStatus = 'connecting';
                console.log('[Baileys] 📱 New QR code generated. Please scan with WhatsApp.');
            }
            if (connection === 'open') {
                connectionStatus = 'open';
                latestQrDataUrl = null;
                isConnecting = false;
                console.log('[Baileys] ✅ WhatsApp connected and ready!');
            }
            if (connection === 'close') {
                connectionStatus = 'close';
                isConnecting = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = statusCode === baileys_1.DisconnectReason.loggedOut;
                console.log(`[Baileys] ⚠️ Connection closed. Status code: ${statusCode}, Logged out: ${loggedOut}`);
                if (!loggedOut) {
                    if (reconnectTimer)
                        clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(() => {
                        startWhatsApp().catch(err => console.error('[Baileys] Reconnect error:', err));
                    }, 3000);
                }
                else {
                    console.log('[Baileys] ❌ Session logged out — clearing expired session to generate a fresh QR code...');
                    latestQrDataUrl = null;
                    try {
                        if (fs_1.default.existsSync(AUTH_FOLDER)) {
                            fs_1.default.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                        }
                    }
                    catch (err) {
                        console.error('[Baileys] Failed to clear auth folder:', err);
                    }
                    if (reconnectTimer)
                        clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(() => {
                        startWhatsApp().catch(err => console.error('[Baileys] Restart error after logout:', err));
                    }, 1500);
                }
            }
        });
        sock.ev.on('creds.update', saveCreds);
        // Helper to get real phone JID even if WhatsApp uses Privacy LID (@lid)
        const extractPhoneJid = (key) => {
            if (!key)
                return '';
            const rJid = key.remoteJid || '';
            const altJid = key.remoteJidAlt || '';
            const partAlt = key.participantAlt || '';
            const part = key.participant || '';
            for (const jid of [rJid, altJid, partAlt, part]) {
                if (typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) {
                    return jid;
                }
            }
            return altJid || rJid || '';
        };
        // Incoming messages with Anti-Attack & Anti-Spam Shield
        sock.ev.on('messages.upsert', ({ messages }) => {
            for (const msg of messages) {
                try {
                    if (!msg.message || msg.key.fromMe)
                        continue;
                    const remoteJid = msg.key.remoteJid || '';
                    // Security: Drop group messages, WhatsApp status broadcasts, newsletters, and channel broadcasts
                    if (remoteJid.endsWith('@g.us') ||
                        remoteJid.endsWith('@broadcast') ||
                        remoteJid.includes('newsletter')) {
                        continue;
                    }
                    const phoneJid = extractPhoneJid(msg.key);
                    if (!phoneJid)
                        continue;
                    // Security: Block message flooding (DoS attack prevention)
                    if (isSpamFlood(phoneJid)) {
                        console.warn(`[Baileys Security] 🛡️ Flood/Spam message dropped from ${phoneJid}`);
                        continue;
                    }
                    const text = extractMessageText(msg.message);
                    console.log(`[Baileys] 📩 Incoming WhatsApp from ${phoneJid} (Raw: ${remoteJid}): "${text ?? '[media/action]'}"`);
                    incomingMessageHandler?.(phoneJid, text, msg);
                }
                catch (err) {
                    console.error('[Baileys Security] Error processing incoming message:', err);
                }
            }
        });
        // Message status updates: 3 = Delivered (double tick), 4/5 = Read (blue ticks)
        sock.ev.on('messages.update', updates => {
            for (const u of updates) {
                if (!u.key?.id)
                    continue;
                const phoneJid = extractPhoneJid(u.key);
                const statusVal = u.update?.status;
                const isRead = statusVal === 4 ||
                    statusVal === 5 ||
                    statusVal === 'READ' ||
                    statusVal === 'PLAYED';
                const isDelivered = statusVal === 3 ||
                    statusVal === 'DELIVERY_ACK';
                if (isRead) {
                    console.log(`[Baileys] 👁️ Message READ by ${phoneJid} (ID: ${u.key.id})`);
                    messageReadHandler?.(phoneJid, u.key.id);
                    messageStatusHandler?.(phoneJid, u.key.id, 'read');
                }
                else if (isDelivered) {
                    console.log(`[Baileys] 📬 Message DELIVERED to ${phoneJid} (ID: ${u.key.id})`);
                    messageStatusHandler?.(phoneJid, u.key.id, 'delivered');
                }
            }
        });
        // Message receipts update: catches read receipts / blue ticks from all WhatsApp client types
        sock.ev.on('message-receipt.update', receipts => {
            for (const r of receipts) {
                if (!r.key?.id)
                    continue;
                const phoneJid = r.receipt?.userJid || extractPhoneJid(r.key);
                if (r.receipt?.readTimestamp) {
                    console.log(`[Baileys] 👁️ [Receipt] Message READ by ${phoneJid} (ID: ${r.key.id})`);
                    messageReadHandler?.(phoneJid, r.key.id);
                    messageStatusHandler?.(phoneJid, r.key.id, 'read');
                }
                else if (r.receipt?.receiptTimestamp) {
                    console.log(`[Baileys] 📬 [Receipt] Message DELIVERED to ${phoneJid} (ID: ${r.key.id})`);
                    messageStatusHandler?.(phoneJid, r.key.id, 'delivered');
                }
            }
        });
    }
    catch (err) {
        isConnecting = false;
        connectionStatus = 'close';
        console.error('[Baileys] Failed to initialize WhatsApp socket:', err);
    }
}
function getConnectionStatus() {
    return { status: connectionStatus, qr: latestQrDataUrl };
}
async function sendText(phone, text) {
    if (!sock || connectionStatus !== 'open') {
        return {
            success: false,
            error: `WhatsApp is not connected (status: ${connectionStatus}). Please scan the QR code to connect.`,
        };
    }
    const jid = toJid(phone);
    if (!jid) {
        return { success: false, error: 'Invalid recipient phone number' };
    }
    if (!text || !text.trim()) {
        return { success: false, error: 'Message text cannot be empty' };
    }
    try {
        console.log(`[Baileys] 📤 Sending text message to ${jid}...`);
        const result = await sock.sendMessage(jid, { text: text.trim() });
        const waMessageId = result?.key?.id ?? undefined;
        console.log(`[Baileys] ✅ Message sent to ${jid} (ID: ${waMessageId})`);
        return { success: true, waMessageId };
    }
    catch (err) {
        const errMsg = err.message;
        console.error(`[Baileys] ❌ Failed to send message to ${jid}:`, errMsg);
        return { success: false, error: errMsg };
    }
}
async function sendInteractiveButtons(phone, bodyText, options, headerText, footerText) {
    if (!sock || connectionStatus !== 'open') {
        return {
            success: false,
            error: `WhatsApp is not connected (status: ${connectionStatus}). Please scan the QR code to connect.`,
        };
    }
    const jid = toJid(phone);
    if (!jid) {
        return { success: false, error: 'Invalid recipient phone number' };
    }
    // Fallback text generator: Clean button card representation
    const formatButtonText = () => {
        const lines = [];
        if (headerText?.trim()) {
            lines.push(`*${headerText.trim()}*`);
            lines.push('');
        }
        lines.push(bodyText.trim());
        lines.push('');
        options.forEach((opt, idx) => {
            lines.push(`🔘 *[ ${idx + 1} ]* ${opt.title}`);
        });
        lines.push('');
        lines.push(footerText?.trim() ? `_${footerText.trim()}_` : `_Reply with the number (e.g. 1, 2) or option name_`);
        return lines.join('\n');
    };
    try {
        console.log(`[Baileys] 🔘 Attempting to send native interactive buttons to ${jid}...`);
        const buttons = options.map((opt, index) => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: opt.title,
                id: opt.id || String(index + 1),
            }),
        }));
        const interactiveMessage = baileys_1.proto.Message.InteractiveMessage.create({
            body: baileys_1.proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
            footer: baileys_1.proto.Message.InteractiveMessage.Footer.create({ text: footerText || 'Select an option below' }),
            header: baileys_1.proto.Message.InteractiveMessage.Header.create({
                title: headerText || 'Real Estate Bot 🏡',
                hasMediaAttachment: false,
            }),
            nativeFlowMessage: baileys_1.proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons,
            }),
        });
        const msg = (0, baileys_1.generateWAMessageFromContent)(jid, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2,
                    },
                    interactiveMessage,
                },
            },
        }, { userJid: sock.user?.id || '' });
        await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
        console.log(`[Baileys] ✅ Native interactive buttons sent successfully to ${jid} (ID: ${msg.key.id})`);
        return { success: true, waMessageId: msg.key.id ?? undefined };
    }
    catch (nativeErr) {
        console.warn(`[Baileys] ⚠️ Native interactive buttons relay error: ${nativeErr.message}. Falling back to styled button card text...`);
        const fallbackText = formatButtonText();
        return sendText(phone, fallbackText);
    }
}
async function sendMedia(phone, mediaUrl, caption) {
    if (!sock || connectionStatus !== 'open') {
        return {
            success: false,
            error: `WhatsApp is not connected (status: ${connectionStatus}). Please scan the QR code to connect.`,
        };
    }
    const jid = toJid(phone);
    if (!jid) {
        return { success: false, error: 'Invalid recipient phone number' };
    }
    try {
        console.log(`[Baileys] 📤 Sending media message to ${jid}: ${mediaUrl}...`);
        let imagePayload = { url: mediaUrl };
        // Resolve local file path if mediaUrl is a local path or uploaded file
        let localFilePath = '';
        if (mediaUrl.startsWith('/public/') || mediaUrl.startsWith('public/')) {
            localFilePath = path_1.default.join(process.cwd(), mediaUrl.replace(/^\//, ''));
        }
        else if (mediaUrl.includes('/public/uploads/')) {
            const parts = mediaUrl.split('/public/uploads/');
            localFilePath = path_1.default.join(process.cwd(), 'public', 'uploads', parts[1]);
        }
        else if (fs_1.default.existsSync(mediaUrl)) {
            localFilePath = mediaUrl;
        }
        if (localFilePath && fs_1.default.existsSync(localFilePath)) {
            console.log(`[Baileys] 📂 Loading local image buffer directly from disk: ${localFilePath}`);
            imagePayload = fs_1.default.readFileSync(localFilePath);
        }
        const result = await sock.sendMessage(jid, {
            image: imagePayload,
            caption: caption ? caption.trim() : '',
        });
        const waMessageId = result?.key?.id ?? undefined;
        console.log(`[Baileys] ✅ Media sent to ${jid} (ID: ${waMessageId})`);
        return { success: true, waMessageId };
    }
    catch (err) {
        const errMsg = err.message;
        console.error(`[Baileys] ❌ Failed to send media to ${jid}:`, errMsg);
        return { success: false, error: errMsg };
    }
}
async function resetWhatsAppSession() {
    try {
        console.log('[Baileys] 🔄 Resetting WhatsApp session and clearing auth credentials...');
        if (sock) {
            try {
                sock.end(undefined);
            }
            catch { }
            sock = null;
        }
        connectionStatus = 'connecting';
        latestQrDataUrl = null;
        isConnecting = false;
        if (fs_1.default.existsSync(AUTH_FOLDER)) {
            fs_1.default.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        }
        setTimeout(() => {
            startWhatsApp().catch(err => console.error('[Baileys] Start after reset error:', err));
        }, 1000);
        return { success: true, message: 'Session reset initiated. Scan the new QR code in settings.' };
    }
    catch (err) {
        return { success: false, message: err.message };
    }
}
//# sourceMappingURL=baileysService.js.map