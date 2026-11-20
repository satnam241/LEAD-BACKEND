import { Router } from 'express';
import {
  getConnectionStatus,
  sendText,
  startWhatsApp,
  resetWhatsAppSession,
} from '../services/baileysService';
import { adminAuth, AuthenticatedRequest } from '../middleware/adminAuth';
import { baileysLimiter } from '../middleware/security.middleware';

const router = Router();

router.use(adminAuth);

// Helper to resolve tenant ID: super admin of master tenant maps to master session
function resolveBaileysTenant(req: AuthenticatedRequest): string {
  const isSuperAdmin = req.userRole === 'super_admin' && (!req.tenantId || req.tenant?.isMaster);
  if (isSuperAdmin) {
    return 'master';
  }
  if (!req.tenantId) {
    throw new Error('Tenant context required');
  }
  return String(req.tenantId);
}

// GET /api/baileys/status — frontend polls this every few seconds to show the QR (Rate-limited)
router.get('/status', baileysLimiter, (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = resolveBaileysTenant(req);
    res.json(getConnectionStatus(tenantId));
  } catch (err: any) {
    res.status(403).json({ success: false, error: err.message });
  }
});

// POST /api/baileys/send — test sending a message directly via Baileys
router.post('/send', async (req: AuthenticatedRequest, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      res.status(400).json({ success: false, message: 'phone and message are required' });
      return;
    }

    const tenantId = resolveBaileysTenant(req);
    const outcome = await sendText(phone, message, tenantId);
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
router.post('/reconnect', async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = resolveBaileysTenant(req);
    await startWhatsApp(tenantId);
    res.json({
      success: true,
      message: 'Reconnection triggered',
      ...getConnectionStatus(tenantId),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/baileys/reset — wipe auth session and generate a fresh QR code
router.post('/reset', async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = resolveBaileysTenant(req);
    const outcome = await resetWhatsAppSession(tenantId);
    res.json(outcome);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
