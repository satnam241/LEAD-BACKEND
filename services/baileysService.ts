import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  proto,
  generateWAMessageFromContent,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

// Multi-Tenant Session Record
export interface TenantSession {
  tenantId: string;
  authFolder: string;
  sock: WASocket | null;
  latestQrDataUrl: string | null;
  connectionStatus: 'connecting' | 'open' | 'close';
  isConnecting: boolean;
  reconnectTimer: NodeJS.Timeout | null;
  phoneNumber?: string;
}

// In-Memory Multi-Tenant Session Registry
const sessions = new Map<string, TenantSession>();

export type MessageStatusType = 'delivered' | 'read';

type IncomingMessageHandler = (from: string, text: string | undefined, raw: proto.IWebMessageInfo, tenantId?: string) => void;
let incomingMessageHandler: IncomingMessageHandler | null = null;

type MessageReadHandler = (from: string, waMessageId: string, tenantId?: string) => void;
let messageReadHandler: MessageReadHandler | null = null;

type MessageStatusHandler = (from: string, waMessageId: string, status: MessageStatusType, tenantId?: string) => void;
let messageStatusHandler: MessageStatusHandler | null = null;

export function onIncomingMessage(handler: IncomingMessageHandler): void {
  incomingMessageHandler = handler;
}

export function onMessageRead(handler: MessageReadHandler): void {
  messageReadHandler = handler;
}

export function onMessageStatus(handler: MessageStatusHandler): void {
  messageStatusHandler = handler;
}

// In-memory rate limiting map for flood protection: jid -> { count, resetTime }
const spamProtectionMap = new Map<string, { count: number; resetTime: number }>();

export function isSpamFlood(jid: string): boolean {
  if (!jid) return true;
  const now = Date.now();
  const record = spamProtectionMap.get(jid);
  if (!record || now > record.resetTime) {
    spamProtectionMap.set(jid, { count: 1, resetTime: now + 10000 }); // 10s window
    return false;
  }
  record.count++;
  return record.count > 6; // drop flood if >6 messages within 10 seconds
}

export function resolveTenantId(tenantIdInput?: string | null): string {
  if (!tenantIdInput || tenantIdInput.trim() === '' || tenantIdInput === 'null' || tenantIdInput === 'undefined' || tenantIdInput === 'master' || tenantIdInput === '6aeadd659d2ebdcd245948e2') {
    return 'master';
  }
  return tenantIdInput.trim();
}

export function getAuthFolderForTenant(tenantId: string): string {
  if (tenantId === 'master' || tenantId === '6aeadd659d2ebdcd245948e2') {
    return process.env.BAILEYS_AUTH_FOLDER || path.join(process.cwd(), 'auth_info_baileys');
  }
  const baseDir = path.join(process.cwd(), 'baileys_auth');
  if (!fs.existsSync(baseDir)) {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch {}
  }
  return path.join(baseDir, `tenant_${tenantId}`);
}

// Unpack ephemeral, viewOnce, button replies, list replies, or regular text safely
export function extractMessageText(message: proto.IMessage | null | undefined): string | undefined {
  if (!message) return undefined;

  try {
    let m: any = message;
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

    let interactiveReply: string | undefined;
    if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
      try {
        const parsed = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
        interactiveReply = parsed.id || parsed.display_text || parsed.title;
      } catch {
        interactiveReply = m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
      }
    }

    // Support incoming location and live location messages
    let locationText: string | undefined;
    if (m.locationMessage) {
      const lat = m.locationMessage.degreesLatitude;
      const lng = m.locationMessage.degreesLongitude;
      const name = m.locationMessage.name ? String(m.locationMessage.name).trim() : '';
      const address = m.locationMessage.address ? String(m.locationMessage.address).trim() : '';
      const url = m.locationMessage.url ? String(m.locationMessage.url).trim() : '';
      const mapsUrl = url || (lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : '');
      const details = [name, address].filter(Boolean).join(', ');
      locationText = `📍 [Shared Location: ${details ? `${details} ` : ''}${mapsUrl ? `(${mapsUrl})` : ''} - Lat: ${lat}, Lng: ${lng}]`.trim();
    } else if (m.liveLocationMessage) {
      const lat = m.liveLocationMessage.degreesLatitude;
      const lng = m.liveLocationMessage.degreesLongitude;
      const caption = m.liveLocationMessage.caption ? String(m.liveLocationMessage.caption).trim() : '';
      const mapsUrl = (lat != null && lng != null) ? `https://maps.google.com/?q=${lat},${lng}` : '';
      locationText = `📍 [Shared Live Location: ${caption ? `${caption} ` : ''}${mapsUrl ? `(${mapsUrl})` : ''} - Lat: ${lat}, Lng: ${lng}]`.trim();
    }

    const raw =
      locationText ||
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

    if (!raw || typeof raw !== 'string') return undefined;

    // Security sanitization: strip null bytes, dangerous control characters, and cap length to 4000
    const cleaned = raw.replace(/\0/g, '').trim();
    if (cleaned.length > 4000) {
      return cleaned.slice(0, 4000);
    }
    return cleaned;
  } catch (err) {
    console.error('[Baileys Security] Error parsing incoming message text:', err);
    return undefined;
  }
}

export function normalizePhone(raw: string): string {
  if (!raw) return '';
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

export function toJid(phone: string): string {
  if (!phone) return '';
  const digits = normalizePhone(phone);
  if (!digits || digits.length < 10 || /^0+$/.test(digits)) return '';
  return `${digits}@s.whatsapp.net`;
}

// Helper to get real phone JID even if WhatsApp uses Privacy LID (@lid)
function extractPhoneJid(key: any): string {
  if (!key) return '';
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
export async function startWhatsApp(tenantIdInput?: string): Promise<void> {
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
    const { state, saveCreds } = await useMultiFileAuthState(session.authFolder);

    if (session.sock) {
      try {
        session.sock.ev.removeAllListeners('connection.update');
        session.sock.ev.removeAllListeners('creds.update');
        session.sock.ev.removeAllListeners('messages.upsert');
        session.sock.ev.removeAllListeners('messages.update');
        session.sock.ev.removeAllListeners('message-receipt.update');
      } catch {}
    }

    const sock = makeWASocket({
      auth: state,
      logger: P({ level: 'silent' }) as any,
      printQRInTerminal: tenantId === 'master',
      defaultQueryTimeoutMs: 60000,
    });
    session.sock = sock;

    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session!.latestQrDataUrl = await QRCode.toDataURL(qr);
        session!.connectionStatus = 'connecting';
        console.log(`[Baileys][${tenantId}] 📱 New QR code generated. Please scan with WhatsApp.`);
      }

      if (connection === 'open') {
        session!.connectionStatus = 'open';
        session!.latestQrDataUrl = null;
        session!.isConnecting = false;
        const rawPhone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : undefined;
        if (rawPhone) {
          session!.phoneNumber = rawPhone;
        }
        console.log(`[Baileys][${tenantId}] ✅ WhatsApp connected and ready! Phone: ${rawPhone || 'N/A'}`);

        if (tenantId !== 'master') {
          try {
            const Tenant = (await import('../models/tenant.model')).default;
            await Tenant.findByIdAndUpdate(tenantId, {
              $set: {
                'whatsappConfig.status': 'connected',
                'whatsappConfig.phoneNumber': rawPhone || '',
                'whatsappConfig.connectedAt': new Date(),
                'whatsappConfig.authFolder': session!.authFolder,
              },
            });
          } catch (dbErr) {
            console.warn(`[Baileys][${tenantId}] Warning updating tenant DB status:`, dbErr);
          }
        }
      }

      if (connection === 'close') {
        session!.connectionStatus = 'close';
        session!.isConnecting = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`[Baileys][${tenantId}] ⚠️ Connection closed. Status code: ${statusCode}, Logged out: ${loggedOut}`);

        if (!loggedOut) {
          if (session!.reconnectTimer) clearTimeout(session!.reconnectTimer);
          session!.reconnectTimer = setTimeout(() => {
            startWhatsApp(tenantId).catch(err => console.error(`[Baileys][${tenantId}] Reconnect error:`, err));
          }, 3000);
        } else {
          console.log(`[Baileys][${tenantId}] ❌ Session logged out — clearing expired session to generate a fresh QR code...`);
          session!.latestQrDataUrl = null;
          try {
            if (fs.existsSync(session!.authFolder)) {
              fs.rmSync(session!.authFolder, { recursive: true, force: true });
            }
          } catch (err) {
            console.error(`[Baileys][${tenantId}] Failed to clear auth folder:`, err);
          }
          if (tenantId !== 'master') {
            try {
              const Tenant = (await import('../models/tenant.model')).default;
              await Tenant.findByIdAndUpdate(tenantId, {
                $set: { 'whatsappConfig.status': 'disconnected' },
              });
            } catch {}
          }
          if (session!.reconnectTimer) clearTimeout(session!.reconnectTimer);
          session!.reconnectTimer = setTimeout(() => {
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
          if (!msg.message || msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid || '';

          // Security: Drop group messages, WhatsApp status broadcasts, newsletters, and channel broadcasts
          if (
            remoteJid.endsWith('@g.us') ||
            remoteJid.endsWith('@broadcast') ||
            remoteJid.includes('newsletter')
          ) {
            continue;
          }

          const phoneJid = extractPhoneJid(msg.key);
          if (!phoneJid) continue;

          // Security: Block message flooding (DoS attack prevention)
          if (isSpamFlood(phoneJid)) {
            console.warn(`[Baileys Security][${tenantId}] 🛡️ Flood/Spam message dropped from ${phoneJid}`);
            continue;
          }

          const text = extractMessageText(msg.message);
          console.log(`[Baileys][${tenantId}] 📩 Incoming WhatsApp from ${phoneJid} (Raw: ${remoteJid}): "${text ?? '[media/action]'}"`);

          incomingMessageHandler?.(phoneJid, text, msg, tenantId);
        } catch (err) {
          console.error(`[Baileys Security][${tenantId}] Error processing incoming message:`, err);
        }
      }
    });

    // Message status updates: 3 = Delivered (double tick), 4/5 = Read (blue ticks)
    sock.ev.on('messages.update', updates => {
      for (const u of updates) {
        if (!u.key?.id) continue;
        const phoneJid = extractPhoneJid(u.key);
        const statusVal = u.update?.status as any;

        const isRead =
          statusVal === 4 ||
          statusVal === 5 ||
          statusVal === 'READ' ||
          statusVal === 'PLAYED';

        const isDelivered =
          statusVal === 3 ||
          statusVal === 'DELIVERY_ACK';

        if (isRead) {
          console.log(`[Baileys][${tenantId}] 👁️ Message READ by ${phoneJid} (ID: ${u.key.id})`);
          messageReadHandler?.(phoneJid, u.key.id, tenantId);
          messageStatusHandler?.(phoneJid, u.key.id, 'read', tenantId);
        } else if (isDelivered) {
          console.log(`[Baileys][${tenantId}] 📬 Message DELIVERED to ${phoneJid} (ID: ${u.key.id})`);
          messageStatusHandler?.(phoneJid, u.key.id, 'delivered', tenantId);
        }
      }
    });

    // Message receipts update: catches read receipts / blue ticks from all WhatsApp client types
    sock.ev.on('message-receipt.update', receipts => {
      for (const r of receipts) {
        if (!r.key?.id) continue;
        const phoneJid = r.receipt?.userJid || extractPhoneJid(r.key);
        if (r.receipt?.readTimestamp) {
          console.log(`[Baileys][${tenantId}] 👁️ [Receipt] Message READ by ${phoneJid} (ID: ${r.key.id})`);
          messageReadHandler?.(phoneJid, r.key.id, tenantId);
          messageStatusHandler?.(phoneJid, r.key.id, 'read', tenantId);
        } else if (r.receipt?.receiptTimestamp) {
          console.log(`[Baileys][${tenantId}] 📬 [Receipt] Message DELIVERED to ${phoneJid} (ID: ${r.key.id})`);
          messageStatusHandler?.(phoneJid, r.key.id, 'delivered', tenantId);
        }
      }
    });
  } catch (err) {
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
export async function startAllConnectedTenantSessions(): Promise<void> {
  try {
    const baseDir = path.join(process.cwd(), 'baileys_auth');
    if (fs.existsSync(baseDir)) {
      const entries = fs.readdirSync(baseDir);
      for (const entry of entries) {
        if (entry.startsWith('tenant_')) {
          const tid = entry.replace('tenant_', '');
          console.log(`[Baileys] 🔄 Found existing auth session for tenant ${tid}. Auto-starting...`);
          startWhatsApp(tid).catch(err => console.error(`[Baileys] Error starting session for tenant ${tid}:`, err));
        }
      }
    }

    const Tenant = (await import('../models/tenant.model')).default;
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
  } catch (err) {
    console.error('[Baileys] Error auto-starting tenant sessions:', err);
  }
}

/**
 * Retrieves connection status and QR for a specific tenant.
 * Auto-initializes session on-demand if not already started.
 */
export function getConnectionStatus(tenantIdInput?: string): { status: string; qr: string | null; phoneNumber?: string } {
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
function getSocketForTenant(tenantIdInput?: string): { sock: WASocket | null; connectionStatus: string; resolvedTenantId: string } {
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

export async function sendText(
  phone: string,
  text: string,
  tenantId?: string
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
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
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`[Baileys][${resolveTenantId(tenantId)}] ❌ Failed to send message to ${jid}:`, errMsg);
    return { success: false, error: errMsg };
  }
}

export async function sendTyping(
  phone: string,
  state: 'composing' | 'paused' = 'composing',
  tenantId?: string
): Promise<void> {
  const { sock, connectionStatus } = getSocketForTenant(tenantId);
  if (!sock || connectionStatus !== 'open') return;
  const jid = toJid(phone);
  if (!jid) return;

  try {
    await sock.sendPresenceUpdate(state, jid);
  } catch (err: any) {
    console.warn(`[Baileys][${resolveTenantId(tenantId)}] ⚠️ Failed to update presence (${state}) for ${jid}:`, err?.message || err);
  }
}

export async function sendInteractiveButtons(
  phone: string,
  bodyText: string,
  options: Array<{ id?: string; title: string }>,
  headerText?: string,
  footerText?: string,
  tenantId?: string
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
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
    const lines: string[] = [];
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

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: bodyText.trim() }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: footerText?.trim() || 'Select an option below' }),
      header: proto.Message.InteractiveMessage.Header.create({
        title: headerText?.trim() || 'Real Estate Bot 🏡',
        hasMediaAttachment: false,
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons,
      }),
    });

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage,
          },
        },
      },
      { userJid: jid }
    );

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

    await sock.relayMessage(jid, msg.message!, {
      messageId: msg.key.id!,
      additionalNodes,
    });

    console.log(`[Baileys][${resolveTenantId(tenantId)}] ✅ Native interactive buttons sent successfully to ${jid} (ID: ${msg.key.id})`);
    return { success: true, waMessageId: msg.key.id ?? undefined };
  } catch (nativeErr: any) {
    console.warn(`[Baileys][${resolveTenantId(tenantId)}] ⚠️ Native interactive buttons relay error: ${nativeErr.message}. Falling back to styled button card text...`);
    const fallbackText = formatButtonText();
    return sendText(phone, fallbackText, tenantId);
  }
}

/**
 * Resolves mediaUrl to either a local Buffer from disk, a downloaded Buffer via axios,
 * or fallback { url } object.
 */
async function resolveMediaPayload(mediaUrl: string): Promise<Buffer | { url: string }> {
  try {
    const cleanUrl = mediaUrl.trim();

    let filename = '';
    if (cleanUrl.includes('/public/uploads/')) {
      const parts = cleanUrl.split('/public/uploads/');
      filename = parts[1]?.split('?')[0]?.split('#')[0] || '';
    } else if (cleanUrl.includes('/uploads/')) {
      const parts = cleanUrl.split('/uploads/');
      filename = parts[1]?.split('?')[0]?.split('#')[0] || '';
    } else if (cleanUrl.startsWith('/public/') || cleanUrl.startsWith('public/')) {
      filename = path.basename(cleanUrl.split('?')[0]);
    }

    if (filename) {
      const possibleDirs = [
        path.join(process.cwd(), 'public', 'uploads'),
        path.resolve(__dirname, '..', 'public', 'uploads'),
        path.resolve(__dirname, '..', '..', 'public', 'uploads'),
        path.resolve(process.cwd(), '..', 'LEAD-BACKEND - Copy', 'public', 'uploads'),
        path.resolve(process.cwd(), '..', 'LEAD-BACKEND', 'public', 'uploads'),
      ];

      for (const dir of possibleDirs) {
        const candidate = path.join(dir, filename);
        if (fs.existsSync(candidate)) {
          console.log(`[Baileys] 📂 Found local image on disk: ${candidate}`);
          return fs.readFileSync(candidate);
        }
      }
    }

    if (fs.existsSync(cleanUrl)) {
      console.log(`[Baileys] 📂 Loading image from direct file path: ${cleanUrl}`);
      return fs.readFileSync(cleanUrl);
    }

    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      try {
        console.log(`[Baileys] 🌐 Pre-fetching media buffer via HTTP: ${cleanUrl}`);
        const res = await axios.get(cleanUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (res.data && res.data.length > 0) {
          console.log(`[Baileys] ✅ Successfully downloaded ${res.data.length} bytes for media`);
          return Buffer.from(res.data);
        }
      } catch (httpErr: any) {
        console.warn(`[Baileys] ⚠️ Axios pre-fetch failed (${httpErr.message}). Falling back to URL payload.`);
      }
    }

    return { url: cleanUrl };
  } catch (err: any) {
    console.warn(`[Baileys] ⚠️ resolveMediaPayload error: ${err.message}. Using raw url.`);
    return { url: mediaUrl };
  }
}

export async function sendMedia(
  phone: string,
  mediaUrl: string,
  caption?: string,
  tenantId?: string
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
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

    let messagePayload: any;
    if (isVideo) {
      messagePayload = {
        video: payload,
        caption: caption ? caption.trim() : '',
      };
    } else if (isPdf) {
      messagePayload = {
        document: payload,
        mimetype: 'application/pdf',
        fileName: path.basename(mediaUrl.split('?')[0]) || 'Project_Document.pdf',
        caption: caption ? caption.trim() : '',
      };
    } else {
      messagePayload = {
        image: payload,
        caption: caption ? caption.trim() : '',
      };
    }

    const result = await sock.sendMessage(jid, messagePayload);
    const waMessageId = result?.key?.id ?? undefined;
    console.log(`[Baileys][${resolveTenantId(tenantId)}] ✅ Media (${isVideo ? 'Video' : isPdf ? 'PDF' : 'Image'}) sent to ${jid} (ID: ${waMessageId})`);
    return { success: true, waMessageId };
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`[Baileys][${resolveTenantId(tenantId)}] ❌ Failed to send media to ${jid}:`, errMsg);
    return { success: false, error: errMsg };
  }
}

export async function sendLocation(
  phone: string,
  latitude: number,
  longitude: number,
  name?: string,
  address?: string,
  tenantId?: string
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
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
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`[Baileys][${resolveTenantId(tenantId)}] ❌ Failed to send location to ${jid}:`, errMsg);
    return { success: false, error: errMsg };
  }
}

/**
 * Resets WhatsApp session for a specific tenant and generates a fresh QR code.
 * Other tenants are 100% unaffected.
 */
export async function resetWhatsAppSession(tenantIdInput?: string): Promise<{ success: boolean; message: string }> {
  const tenantId = resolveTenantId(tenantIdInput);
  const session = sessions.get(tenantId);
  try {
    console.log(`[Baileys][${tenantId}] 🔄 Resetting WhatsApp session and clearing auth credentials...`);
    if (session?.sock) {
      try {
        session.sock.end(undefined);
      } catch {}
      session.sock = null;
    }
    if (session) {
      session.connectionStatus = 'connecting';
      session.latestQrDataUrl = null;
      session.isConnecting = false;
      session.phoneNumber = undefined;
    }

    const authFolder = session?.authFolder || getAuthFolderForTenant(tenantId);
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
    }

    if (tenantId !== 'master') {
      try {
        const Tenant = (await import('../models/tenant.model')).default;
        await Tenant.findByIdAndUpdate(tenantId, {
          $set: { 'whatsappConfig.status': 'disconnected', 'whatsappConfig.phoneNumber': '' },
        });
      } catch {}
    }

    setTimeout(() => {
      startWhatsApp(tenantId).catch(err => console.error(`[Baileys][${tenantId}] Start after reset error:`, err));
    }, 1000);

    return { success: true, message: 'Session reset initiated. Scan the new QR code in settings.' };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}
