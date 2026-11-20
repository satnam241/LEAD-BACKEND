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
exports.resolveTenantId = resolveTenantId;
exports.getAuthFolderForTenant = getAuthFolderForTenant;
exports.extractMessageText = extractMessageText;
exports.normalizePhone = normalizePhone;
exports.toJid = toJid;
exports.startWhatsApp = startWhatsApp;
exports.startAllConnectedTenantSessions = startAllConnectedTenantSessions;
exports.getConnectionStatus = getConnectionStatus;
exports.sendText = sendText;
exports.sendTyping = sendTyping;
exports.sendInteractiveButtons = sendInteractiveButtons;
exports.sendMedia = sendMedia;
exports.sendLocation = sendLocation;
exports.resetWhatsAppSession = resetWhatsAppSession;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const pino_1 = __importDefault(require("pino"));
const qrcode_1 = __importDefault(require("qrcode"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const axios_1 = __importDefault(require("axios"));
// In-Memory Multi-Tenant Session Registry
const sessions = new Map();
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
function resolveTenantId(tenantIdInput) {
    if (!tenantIdInput || tenantIdInput.trim() === '' || tenantIdInput === 'null' || tenantIdInput === 'undefined' || tenantIdInput === 'master' || tenantIdInput === '6aeadd659d2ebdcd245948e2') {
        return 'master';
    }
    return tenantIdInput.trim();
}
function getAuthFolderForTenant(tenantId) {
    if (tenantId === 'master' || tenantId === '6aeadd659d2ebdcd245948e2') {
        return process.env.BAILEYS_AUTH_FOLDER || path_1.default.join(process.cwd(), 'auth_info_baileys');
    }
    const baseDir = path_1.default.join(process.cwd(), 'baileys_auth');
    if (!fs_1.default.existsSync(baseDir)) {
        try {
            fs_1.default.mkdirSync(baseDir, { recursive: true });
        }
        catch { }
    }
    return path_1.default.join(baseDir, `tenant_${tenantId}`);
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
        // Support incoming location and live location messages
        let locationText;
        if (m.locationMessage) {
            const lat = m.locationMessage.degreesLatitude;
            const lng = m.locationMessage.degreesLongitude;
            const name = m.locationMessage.name ? String(m.locationMessage.name).trim() : '';
            const address = m.locationMessage.address ? String(m.locationMessage.address).trim() : '';
            const url = m.locationMessage.url ? String(m.locationMessage.url).trim() : '';
            const mapsUrl = url || (lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : '');
            const details = [name, address].filter(Boolean).join(', ');
            locationText = `📍 [Shared Location: ${details ? `${details} ` : ''}${mapsUrl ? `(${mapsUrl})` : ''} - Lat: ${lat}, Lng: ${lng}]`.trim();
        }
        else if (m.liveLocationMessage) {
            const lat = m.liveLocationMessage.degreesLatitude;
            const lng = m.liveLocationMessage.degreesLongitude;
            const caption = m.liveLocationMessage.caption ? String(m.liveLocationMessage.caption).trim() : '';
            const mapsUrl = (lat != null && lng != null) ? `https://maps.google.com/?q=${lat},${lng}` : '';
            locationText = `📍 [Shared Live Location: ${caption ? `${caption} ` : ''}${mapsUrl ? `(${mapsUrl})` : ''} - Lat: ${lat}, Lng: ${lng}]`.trim();
        }
        const raw = locationText ||
            interactiveReply ||
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
    if (!digits || digits.length < 10 || /^0+$/.test(digits))
        return '';
    return `${digits}@s.whatsapp.net`;
}
// Helper to get real phone JID even if WhatsApp uses Privacy LID (@lid)
function extractPhoneJid(key) {
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
}
/**
 * Initializes and starts WhatsApp socket specifically for a given tenant.
 * Defaults to 'master' (legacy/master tenant).
 */
async function startWhatsApp(tenantIdInput) {
    const tenantId = resolveTenantId(tenantIdInput);
    let session = sessions.get(tenantId);
    if (!session) {
        session = {
            tenantId,
            authFolder: getAuthFolderForTenant(tenantId),
            sock: null,
            latestQrDataUrl: null,
            connectionStatus: 'connecting',
            isConnecting: false,
            reconnectTimer: null,
        };
        sessions.set(tenantId, session);
    }
    if (session.isConnecting) {
        console.log(`[Baileys][${tenantId}] Connection attempt already in progress, skipping duplicate call.`);
        return;
    }
    session.isConnecting = true;
    try {
        const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(session.authFolder);
        if (session.sock) {
            try {
                session.sock.ev.removeAllListeners('connection.update');
                session.sock.ev.removeAllListeners('creds.update');
                session.sock.ev.removeAllListeners('messages.upsert');
                session.sock.ev.removeAllListeners('messages.update');
                session.sock.ev.removeAllListeners('message-receipt.update');
            }
            catch { }
        }
        const sock = (0, baileys_1.default)({
            auth: state,
            logger: (0, pino_1.default)({ level: 'silent' }),
            printQRInTerminal: tenantId === 'master',
            defaultQueryTimeoutMs: 60000,
        });
        session.sock = sock;
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                session.latestQrDataUrl = await qrcode_1.default.toDataURL(qr);
                session.connectionStatus = 'connecting';
                console.log(`[Baileys][${tenantId}] 📱 New QR code generated. Please scan with WhatsApp.`);
            }
            if (connection === 'open') {
                session.connectionStatus = 'open';
                session.latestQrDataUrl = null;
                session.isConnecting = false;
                const rawPhone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : undefined;
                if (rawPhone) {
                    session.phoneNumber = rawPhone;
                }
                console.log(`[Baileys][${tenantId}] ✅ WhatsApp connected and ready! Phone: ${rawPhone || 'N/A'}`);
                if (tenantId !== 'master') {
                    try {
                        const Tenant = (await Promise.resolve().then(() => __importStar(require('../models/tenant.model')))).default;
                        await Tenant.findByIdAndUpdate(tenantId, {
                            $set: {
                                'whatsappConfig.status': 'connected',
                                'whatsappConfig.phoneNumber': rawPhone || '',
                                'whatsappConfig.connectedAt': new Date(),
                                'whatsappConfig.authFolder': session.authFolder,
                            },
                        });
                    }
                    catch (dbErr) {
                        console.warn(`[Baileys][${tenantId}] Warning updating tenant DB status:`, dbErr);
                    }
                }
            }
            if (connection === 'close') {
                session.connectionStatus = 'close';
                session.isConnecting = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = statusCode === baileys_1.DisconnectReason.loggedOut;
                console.log(`[Baileys][${tenantId}] ⚠️ Connection closed. Status code: ${statusCode}, Logged out: ${loggedOut}`);
                if (!loggedOut) {
                    if (session.reconnectTimer)
                        clearTimeout(session.reconnectTimer);
                    session.reconnectTimer = setTimeout(() => {
                        startWhatsApp(tenantId).catch(err => console.error(`[Baileys][${tenantId}] Reconnect error:`, err));
                    }, 3000);
                }
                else {
                    console.log(`[Baileys][${tenantId}] ❌ Session logged out — clearing expired session to generate a fresh QR code...`);
                    session.latestQrDataUrl = null;
                    try {
                        if (fs_1.default.existsSync(session.authFolder)) {
                            fs_1.default.rmSync(session.authFolder, { recursive: true, force: true });
                        }
                    }
                    catch (err) {
                        console.error(`[Baileys][${tenantId}] Failed to clear auth folder:`, err);
                    }
                    if (tenantId !== 'master') {
                        try {
                            const Tenant = (await Promise.resolve().then(() => __importStar(require('../models/tenant.model')))).default;
                            await Tenant.findByIdAndUpdate(tenantId, {
                                $set: { 'whatsappConfig.status': 'disconnected' },
                            });
                        }
                        catch { }
                    }
                    if (session.reconnectTimer)
                        clearTimeout(session.reconnectTimer);
                    session.reconnectTimer = setTimeout(() => {
                        startWhatsApp(tenantId).catch(err => console.error(`[Baileys][${tenantId}] Restart error after logout:`, err));
                    }, 1500);
                }
            }
        });
        sock.ev.on('creds.update', saveCreds);
        // Incoming messages
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
                        console.warn(`[Baileys Security][${tenantId}] 🛡️ Flood/Spam message dropped from ${phoneJid}`);
                        continue;
                    }
                    const text = extractMessageText(msg.message);
                    console.log(`[Baileys][${tenantId}] 📩 Incoming WhatsApp from ${phoneJid} (Raw: ${remoteJid}): "${text ?? '[media/action]'}"`);
                    incomingMessageHandler?.(phoneJid, text, msg, tenantId);
                }
                catch (err) {
                    console.error(`[Baileys Security][${tenantId}] Error processing incoming message:`, err);
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
                    console.log(`[Baileys][${tenantId}] 👁️ Message READ by ${phoneJid} (ID: ${u.key.id})`);
                    messageReadHandler?.(phoneJid, u.key.id, tenantId);
                    messageStatusHandler?.(phoneJid, u.key.id, 'read', tenantId);
                }
                else if (isDelivered) {
                    console.log(`[Baileys][${tenantId}] 📬 Message DELIVERED to ${phoneJid} (ID: ${u.key.id})`);
                    messageStatusHandler?.(phoneJid, u.key.id, 'delivered', tenantId);
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
                    console.log(`[Baileys][${tenantId}] 👁️ [Receipt] Message READ by ${phoneJid} (ID: ${r.key.id})`);
                    messageReadHandler?.(phoneJid, r.key.id, tenantId);
                    messageStatusHandler?.(phoneJid, r.key.id, 'read', tenantId);
                }
                else if (r.receipt?.receiptTimestamp) {
                    console.log(`[Baileys][${tenantId}] 📬 [Receipt] Message DELIVERED to ${phoneJid} (ID: ${r.key.id})`);
                    messageStatusHandler?.(phoneJid, r.key.id, 'delivered', tenantId);
                }
            }
        });
    }
    catch (err) {
        if (session) {
            session.isConnecting = false;
            session.connectionStatus = 'close';
        }
        console.error(`[Baileys][${tenantId}] Failed to initialize WhatsApp socket:`, err);
    }
}
/**
 * On server startup, automatically connects all active tenants with existing auth folders
 */
async function startAllConnectedTenantSessions() {
    try {
        const baseDir = path_1.default.join(process.cwd(), 'baileys_auth');
        if (fs_1.default.existsSync(baseDir)) {
            const entries = fs_1.default.readdirSync(baseDir);
            for (const entry of entries) {
                if (entry.startsWith('tenant_')) {
                    const tid = entry.replace('tenant_', '');
                    console.log(`[Baileys] 🔄 Found existing auth session for tenant ${tid}. Auto-starting...`);
                    startWhatsApp(tid).catch(err => console.error(`[Baileys] Error starting session for tenant ${tid}:`, err));
                }
            }
        }
        const Tenant = (await Promise.resolve().then(() => __importStar(require('../models/tenant.model')))).default;
        const connectedTenants = await Tenant.find({
            'whatsappConfig.status': 'connected',
            isMaster: false,
        }).select('_id').lean();
        for (const t of connectedTenants) {
            const tid = t._id.toString();
            if (!sessions.has(tid)) {
                console.log(`[Baileys] 🔄 Starting DB connected tenant WhatsApp: ${tid}`);
                startWhatsApp(tid).catch(err => console.error(`[Baileys] Error starting tenant ${tid}:`, err));
            }
        }
    }
    catch (err) {
        console.error('[Baileys] Error auto-starting tenant sessions:', err);
    }
}
/**
 * Retrieves connection status and QR for a specific tenant.
 * Auto-initializes session on-demand if not already started.
 */
function getConnectionStatus(tenantIdInput) {
    const tid = resolveTenantId(tenantIdInput);
    let session = sessions.get(tid);
    if (!session) {
        startWhatsApp(tid).catch(err => console.error(`[Baileys] Error starting on-demand session for ${tid}:`, err));
        session = sessions.get(tid);
    }
    return {
        status: session?.connectionStatus || 'connecting',
        qr: session?.latestQrDataUrl || null,
        phoneNumber: session?.phoneNumber,
    };
}
/**
 * Resolves the active socket for a given tenant, falling back to master socket if needed.
 */
function getSocketForTenant(tenantIdInput) {
    const tid = resolveTenantId(tenantIdInput);
    let session = sessions.get(tid);
    if (session && session.connectionStatus === 'open' && session.sock) {
        return { sock: session.sock, connectionStatus: 'open', resolvedTenantId: tid };
    }
    // Graceful fallback to master tenant if this specific tenant is not connected yet
    if (tid !== 'master') {
        const masterSession = sessions.get('master');
        if (masterSession && masterSession.connectionStatus === 'open' && masterSession.sock) {
            console.log(`[Baileys] ℹ️ Tenant ${tid} socket not open. Falling back to master socket.`);
            return { sock: masterSession.sock, connectionStatus: 'open', resolvedTenantId: 'master' };
        }
    }
    return {
        sock: session?.sock || null,
        connectionStatus: session?.connectionStatus || 'close',
        resolvedTenantId: tid,
    };
}
async function sendText(phone, text, tenantId) {
    const { sock, connectionStatus } = getSocketForTenant(tenantId);
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
        console.log(`[Baileys][${resolveTenantId(tenantId)}] 📤 Sending text message to ${jid}...`);
        const result = await sock.sendMessage(jid, { text: text.trim() });
        const waMessageId = result?.key?.id ?? undefined;
        console.log(`[Baileys][${resolveTenantId(tenantId)}] ✅ Message sent to ${jid} (ID: ${waMessageId})`);
        return { success: true, waMessageId };
    }
    catch (err) {
        const errMsg = err.message;
        console.error(`[Baileys][${resolveTenantId(tenantId)}] ❌ Failed to send message to ${jid}:`, errMsg);
        return { success: false, error: errMsg };
    }
}
async function sendTyping(phone, state = 'composing', tenantId) {
    const { sock, connectionStatus } = getSocketForTenant(tenantId);
    if (!sock || connectionStatus !== 'open')
        return;
    const jid = toJid(phone);
    if (!jid)
        return;
    try {
        await sock.sendPresenceUpdate(state, jid);
    }
    catch (err) {
        console.warn(`[Baileys][${resolveTenantId(tenantId)}] ⚠️ Failed to update presence (${state}) for ${jid}:`, err?.message || err);
    }
}
async function sendInteractiveButtons(phone, bodyText, options, headerText, footerText, tenantId) {
    const { sock, connectionStatus } = getSocketForTenant(tenantId);
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
    const formatButtonText = () => {
        const lines = [];
        if (headerText?.trim()) {
            lines.push(`*${headerText.trim()}*`);
            lines.push('');
        }
        lines.push(bodyText.trim());
        lines.push('');
        options.forEach(opt => {
            lines.push(`🔘 [ ${opt.title} ]`);
        });
        lines.push('');
        lines.push(footerText?.trim() ? `_${footerText.trim()}_` : `_Tap an option button or reply with your choice_`);
        return lines.join('\n');
    };
    try {
        console.log(`[Baileys][${resolveTenantId(tenantId)}] 🔘 Attempting to send native interactive buttons to ${jid}...`);
        const buttons = options.map((opt, index) => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: opt.title,
                id: opt.id || `btn_${index + 1}`,
            }),
        }));
        const interactiveMessage = baileys_1.proto.Message.InteractiveMessage.create({
            body: baileys_1.proto.Message.InteractiveMessage.Body.create({ text: bodyText.trim() }),
            footer: baileys_1.proto.Message.InteractiveMessage.Footer.create({ text: footerText?.trim() || 'Select an option below' }),
            header: baileys_1.proto.Message.InteractiveMessage.Header.create({
                title: headerText?.trim() || 'Real Estate Bot 🏡',
                hasMediaAttachment: false,
            }),
            nativeFlowMessage: baileys_1.proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons,
            }),
        });
        const msg = (0, baileys_1.generateWAMessageFromContent)(jid, {
            viewOnceMessage: {
                message: {
                    interactiveMessage,
                },
            },
        }, { userJid: jid });
        const additionalNodes = [
            {
                tag: 'biz',
                attrs: {
                    actual_actors: '2',
                    host_storage: '2',
                    privacy_mode_ts: String(Math.floor(Date.now() / 1e3)),
                },
                content: [
                    {
                        tag: 'interactive',
                        attrs: { type: 'native_flow', v: '1' },
                        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
                    },
                ],
            },
        ];
        await sock.relayMessage(jid, msg.message, {
            messageId: msg.key.id,
            additionalNodes,
        });
        console.log(`[Baileys][${resolveTenantId(tenantId)}] ✅ Native interactive buttons sent successfully to ${jid} (ID: ${msg.key.id})`);
        return { success: true, waMessageId: msg.key.id ?? undefined };
    }
    catch (nativeErr) {
        console.warn(`[Baileys][${resolveTenantId(tenantId)}] ⚠️ Native interactive buttons relay error: ${nativeErr.message}. Falling back to styled button card text...`);
        const fallbackText = formatButtonText();
        return sendText(phone, fallbackText, tenantId);
    }
}
/**
 * Resolves mediaUrl to either a local Buffer from disk, a downloaded Buffer via axios,
 * or fallback { url } object.
 */
async function resolveMediaPayload(mediaUrl) {
    try {
        const cleanUrl = mediaUrl.trim();
        let filename = '';
        if (cleanUrl.includes('/public/uploads/')) {
            const parts = cleanUrl.split('/public/uploads/');
            filename = parts[1]?.split('?')[0]?.split('#')[0] || '';
        }
        else if (cleanUrl.includes('/uploads/')) {
            const parts = cleanUrl.split('/uploads/');
            filename = parts[1]?.split('?')[0]?.split('#')[0] || '';
        }
        else if (cleanUrl.startsWith('/public/') || cleanUrl.startsWith('public/')) {
            filename = path_1.default.basename(cleanUrl.split('?')[0]);
        }
        if (filename) {
            const possibleDirs = [
                path_1.default.join(process.cwd(), 'public', 'uploads'),
                path_1.default.resolve(__dirname, '..', 'public', 'uploads'),
                path_1.default.resolve(__dirname, '..', '..', 'public', 'uploads'),
                path_1.default.resolve(process.cwd(), '..', 'LEAD-BACKEND - Copy', 'public', 'uploads'),
                path_1.default.resolve(process.cwd(), '..', 'LEAD-BACKEND', 'public', 'uploads'),
            ];
            for (const dir of possibleDirs) {
                const candidate = path_1.default.join(dir, filename);
                if (fs_1.default.existsSync(candidate)) {
                    console.log(`[Baileys] 📂 Found local image on disk: ${candidate}`);
                    return fs_1.default.readFileSync(candidate);
                }
            }
        }
        if (fs_1.default.existsSync(cleanUrl)) {
            console.log(`[Baileys] 📂 Loading image from direct file path: ${cleanUrl}`);
            return fs_1.default.readFileSync(cleanUrl);
        }
        if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
            try {
                console.log(`[Baileys] 🌐 Pre-fetching media buffer via HTTP: ${cleanUrl}`);
                const res = await axios_1.default.get(cleanUrl, {
                    responseType: 'arraybuffer',
                    timeout: 15000,
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                });
                if (res.data && res.data.length > 0) {
                    console.log(`[Baileys] ✅ Successfully downloaded ${res.data.length} bytes for media`);
                    return Buffer.from(res.data);
                }
            }
            catch (httpErr) {
                console.warn(`[Baileys] ⚠️ Axios pre-fetch failed (${httpErr.message}). Falling back to URL payload.`);
            }
        }
        return { url: cleanUrl };
    }
    catch (err) {
        console.warn(`[Baileys] ⚠️ resolveMediaPayload error: ${err.message}. Using raw url.`);
        return { url: mediaUrl };
    }
}
async function sendMedia(phone, mediaUrl, caption, tenantId) {
    const { sock, connectionStatus } = getSocketForTenant(tenantId);
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
        console.log(`[Baileys][${resolveTenantId(tenantId)}] 📤 Sending media message to ${jid}: ${mediaUrl}...`);
        const payload = await resolveMediaPayload(mediaUrl);
        const cleanUrl = mediaUrl.toLowerCase().split('?')[0];
        const isVideo = cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mkv');
        const isPdf = cleanUrl.endsWith('.pdf');
        let messagePayload;
        if (isVideo) {
            messagePayload = {
                video: payload,
                caption: caption ? caption.trim() : '',
            };
        }
        else if (isPdf) {
            messagePayload = {
                document: payload,
                mimetype: 'application/pdf',
                fileName: path_1.default.basename(mediaUrl.split('?')[0]) || 'Project_Document.pdf',
                caption: caption ? caption.trim() : '',
            };
        }
        else {
            messagePayload = {
                image: payload,
                caption: caption ? caption.trim() : '',
            };
        }
        const result = await sock.sendMessage(jid, messagePayload);
        const waMessageId = result?.key?.id ?? undefined;
        console.log(`[Baileys][${resolveTenantId(tenantId)}] ✅ Media (${isVideo ? 'Video' : isPdf ? 'PDF' : 'Image'}) sent to ${jid} (ID: ${waMessageId})`);
        return { success: true, waMessageId };
    }
    catch (err) {
        const errMsg = err.message;
        console.error(`[Baileys][${resolveTenantId(tenantId)}] ❌ Failed to send media to ${jid}:`, errMsg);
        return { success: false, error: errMsg };
    }
}
async function sendLocation(phone, latitude, longitude, name, address, tenantId) {
    const { sock, connectionStatus } = getSocketForTenant(tenantId);
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
        console.log(`[Baileys][${resolveTenantId(tenantId)}] 📍 Sending location pin to ${jid}: (${latitude}, ${longitude}) - ${name || ''}...`);
        const result = await sock.sendMessage(jid, {
            location: {
                degreesLatitude: latitude,
                degreesLongitude: longitude,
                name: name ? name.trim() : undefined,
                address: address ? address.trim() : undefined,
            },
        });
        const waMessageId = result?.key?.id ?? undefined;
        console.log(`[Baileys][${resolveTenantId(tenantId)}] ✅ Location pin sent to ${jid} (ID: ${waMessageId})`);
        return { success: true, waMessageId };
    }
    catch (err) {
        const errMsg = err.message;
        console.error(`[Baileys][${resolveTenantId(tenantId)}] ❌ Failed to send location to ${jid}:`, errMsg);
        return { success: false, error: errMsg };
    }
}
/**
 * Resets WhatsApp session for a specific tenant and generates a fresh QR code.
 * Other tenants are 100% unaffected.
 */
async function resetWhatsAppSession(tenantIdInput) {
    const tenantId = resolveTenantId(tenantIdInput);
    const session = sessions.get(tenantId);
    try {
        console.log(`[Baileys][${tenantId}] 🔄 Resetting WhatsApp session and clearing auth credentials...`);
        if (session?.sock) {
            try {
                session.sock.end(undefined);
            }
            catch { }
            session.sock = null;
        }
        if (session) {
            session.connectionStatus = 'connecting';
            session.latestQrDataUrl = null;
            session.isConnecting = false;
            session.phoneNumber = undefined;
        }
        const authFolder = session?.authFolder || getAuthFolderForTenant(tenantId);
        if (fs_1.default.existsSync(authFolder)) {
            fs_1.default.rmSync(authFolder, { recursive: true, force: true });
        }
        if (tenantId !== 'master') {
            try {
                const Tenant = (await Promise.resolve().then(() => __importStar(require('../models/tenant.model')))).default;
                await Tenant.findByIdAndUpdate(tenantId, {
                    $set: { 'whatsappConfig.status': 'disconnected', 'whatsappConfig.phoneNumber': '' },
                });
            }
            catch { }
        }
        setTimeout(() => {
            startWhatsApp(tenantId).catch(err => console.error(`[Baileys][${tenantId}] Start after reset error:`, err));
        }, 1000);
        return { success: true, message: 'Session reset initiated. Scan the new QR code in settings.' };
    }
    catch (err) {
        return { success: false, message: err.message };
    }
}
//# sourceMappingURL=baileysService.js.map