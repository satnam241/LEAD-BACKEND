import { Router } from 'express';
import {
  getConnectionStatus,
  sendText,
  startWhatsApp,
  resetWhatsAppSession,
} from '../services/baileysService';

const router = Router();

// GET /api/baileys/status — frontend polls this every few seconds to show the QR
// (when disconnected) or a "Connected" badge (once scanned).
router.get('/status', (_req, res) => {
  res.json(getConnectionStatus());
});

// POST /api/baileys/send — test sending a message directly via Baileys
router.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      res.status(400).json({ success: false, message: 'phone and message are required' });
      return;
    }

    const outcome = await sendText(phone, message);
    if (!outcome.success) {
      res.status(400).json(outcome);
      return;
    }

    res.json(outcome);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/baileys/reconnect — trigger reconnection if disconnected
router.post('/reconnect', async (_req, res) => {
  try {
    await startWhatsApp();
    res.json({
      success: true,
      message: 'Reconnection triggered',
      ...getConnectionStatus(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/baileys/reset — wipe auth session and generate a fresh QR code
router.post('/reset', async (_req, res) => {
  try {
    const outcome = await resetWhatsAppSession();
    res.json(outcome);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;