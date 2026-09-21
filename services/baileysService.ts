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

const AUTH_FOLDER = process.env.BAILEYS_AUTH_FOLDER || path.join(process.cwd(), 'auth_info_baileys');

let sock: WASocket | null = null;
let latestQrDataUrl: string | null = null;
let connectionStatus: 'connecting' | 'open' | 'close' = 'connecting';
let isConnecting = false;
let reconnectTimer: NodeJS.Timeout | null = null;

export type MessageStatusType = 'delivered' | 'read';

type IncomingMessageHandler = (from: string, text: string | undefined, raw: proto.IWebMessageInfo) => void;
let incomingMessageHandler: IncomingMessageHandler | null = null;

type MessageReadHandler = (from: string, waMessageId: string) => void;
let messageReadHandler: MessageReadHandler | null = null;

type MessageStatusHandler = (from: string, waMessageId: string, status: MessageStatusType) => void;
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

    const raw =
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
  if (!digits) return '';
  return `${digits}@s.whatsapp.net`;
}

export async function startWhatsApp(): Promise<void> {
  if (isConnecting) {
    console.log('[Baileys] Connection attempt already in progress, skipping duplicate call.');
    return;
  }
  isConnecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    if (sock) {
      try {
        sock.ev.removeAllListeners('connection.update');
        sock.ev.removeAllListeners('creds.update');
        sock.ev.removeAllListeners('messages.upsert');
        sock.ev.removeAllListeners('messages.update');
        sock.ev.removeAllListeners('message-receipt.update');
      } catch {}
    }

    sock = makeWASocket({
      auth: state,
      logger: P({ level: 'silent' }) as any,
      printQRInTerminal: true,
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQrDataUrl = await QRCode.toDataURL(qr);
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
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`[Baileys] ⚠️ Connection closed. Status code: ${statusCode}, Logged out: ${loggedOut}`);

        if (!loggedOut) {
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            startWhatsApp().catch(err => console.error('[Baileys] Reconnect error:', err));
          }, 3000);
        } else {
          console.log('[Baileys] ❌ Session logged out — clearing expired session to generate a fresh QR code...');
          latestQrDataUrl = null;
          try {
            if (fs.existsSync(AUTH_FOLDER)) {
              fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
            }
          } catch (err) {
            console.error('[Baileys] Failed to clear auth folder:', err);
          }
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            startWhatsApp().catch(err => console.error('[Baileys] Restart error after logout:', err));
          }, 1500);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Helper to get real phone JID even if WhatsApp uses Privacy LID (@lid)
    const extractPhoneJid = (key: any): string => {
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
    };

    // Incoming messages with Anti-Attack & Anti-Spam Shield
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
            console.warn(`[Baileys Security] 🛡️ Flood/Spam message dropped from ${phoneJid}`);
            continue;
          }

          const text = extractMessageText(msg.message);
          console.log(`[Baileys] 📩 Incoming WhatsApp from ${phoneJid} (Raw: ${remoteJid}): "${text ?? '[media/action]'}"`);

          incomingMessageHandler?.(phoneJid, text, msg);
        } catch (err) {
          console.error('[Baileys Security] Error processing incoming message:', err);
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
          console.log(`[Baileys] 👁️ Message READ by ${phoneJid} (ID: ${u.key.id})`);
          messageReadHandler?.(phoneJid, u.key.id);
          messageStatusHandler?.(phoneJid, u.key.id, 'read');
        } else if (isDelivered) {
          console.log(`[Baileys] 📬 Message DELIVERED to ${phoneJid} (ID: ${u.key.id})`);
          messageStatusHandler?.(phoneJid, u.key.id, 'delivered');
        }
      }
    });

    // Message receipts update: catches read receipts / blue ticks from all WhatsApp client types
    sock.ev.on('message-receipt.update', receipts => {
      for (const r of receipts) {
        if (!r.key?.id) continue;
        const phoneJid = r.receipt?.userJid || extractPhoneJid(r.key);
        if (r.receipt?.readTimestamp) {
          console.log(`[Baileys] 👁️ [Receipt] Message READ by ${phoneJid} (ID: ${r.key.id})`);
          messageReadHandler?.(phoneJid, r.key.id);
          messageStatusHandler?.(phoneJid, r.key.id, 'read');
        } else if (r.receipt?.receiptTimestamp) {
          console.log(`[Baileys] 📬 [Receipt] Message DELIVERED to ${phoneJid} (ID: ${r.key.id})`);
          messageStatusHandler?.(phoneJid, r.key.id, 'delivered');
        }
      }
    });
  } catch (err) {
    isConnecting = false;
    connectionStatus = 'close';
    console.error('[Baileys] Failed to initialize WhatsApp socket:', err);
  }
}

export function getConnectionStatus(): { status: string; qr: string | null } {
  return { status: connectionStatus, qr: latestQrDataUrl };
}

export async function sendText(
  phone: string,
  text: string
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
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
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`[Baileys] ❌ Failed to send message to ${jid}:`, errMsg);
    return { success: false, error: errMsg };
  }
}

export async function sendInteractiveButtons(
  phone: string,
  bodyText: string,
  options: Array<{ id?: string; title: string }>,
  headerText?: string,
  footerText?: string
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
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

  // Fallback text generator: Clean button-style card representation
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
    console.log(`[Baileys] 🔘 Attempting to send native interactive buttons to ${jid}...`);

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

    console.log(`[Baileys] ✅ Native interactive buttons sent successfully to ${jid} (ID: ${msg.key.id})`);
    return { success: true, waMessageId: msg.key.id ?? undefined };
  } catch (nativeErr: any) {
    console.warn(`[Baileys] ⚠️ Native interactive buttons relay error: ${nativeErr.message}. Falling back to styled button card text...`);
    const fallbackText = formatButtonText();
    return sendText(phone, fallbackText);
  }
}

export async function sendMedia(
  phone: string,
  mediaUrl: string,
  caption?: string
): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
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

    let imagePayload: any = { url: mediaUrl };

    // Resolve local file path if mediaUrl is a local path or uploaded file
    let localFilePath = '';
    if (mediaUrl.startsWith('/public/') || mediaUrl.startsWith('public/')) {
      localFilePath = path.join(process.cwd(), mediaUrl.replace(/^\//, ''));
    } else if (mediaUrl.includes('/public/uploads/')) {
      const parts = mediaUrl.split('/public/uploads/');
      localFilePath = path.join(process.cwd(), 'public', 'uploads', parts[1]);
    } else if (fs.existsSync(mediaUrl)) {
      localFilePath = mediaUrl;
    }

    if (localFilePath && fs.existsSync(localFilePath)) {
      console.log(`[Baileys] 📂 Loading local image buffer directly from disk: ${localFilePath}`);
      imagePayload = fs.readFileSync(localFilePath);
    }

    const result = await sock.sendMessage(jid, {
      image: imagePayload,
      caption: caption ? caption.trim() : '',
    });
    const waMessageId = result?.key?.id ?? undefined;
    console.log(`[Baileys] ✅ Media sent to ${jid} (ID: ${waMessageId})`);
    return { success: true, waMessageId };
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`[Baileys] ❌ Failed to send media to ${jid}:`, errMsg);
    return { success: false, error: errMsg };
  }
}

export async function resetWhatsAppSession(): Promise<{ success: boolean; message: string }> {
  try {
    console.log('[Baileys] 🔄 Resetting WhatsApp session and clearing auth credentials...');
    if (sock) {
      try {
        sock.end(undefined);
      } catch {}
      sock = null;
    }
    connectionStatus = 'connecting';
    latestQrDataUrl = null;
    isConnecting = false;

    if (fs.existsSync(AUTH_FOLDER)) {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    }

    setTimeout(() => {
      startWhatsApp().catch(err => console.error('[Baileys] Start after reset error:', err));
    }, 1000);

    return { success: true, message: 'Session reset initiated. Scan the new QR code in settings.' };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}