"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const baileysService_1 = require("../services/baileysService");
const adminAuth_1 = require("../middleware/adminAuth");
const security_middleware_1 = require("../middleware/security.middleware");
const router = (0, express_1.Router)();
router.use(adminAuth_1.adminAuth);
// Helper to resolve tenant ID: super admin of master tenant maps to master session
function resolveBaileysTenant(req) {
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
router.get('/status', security_middleware_1.baileysLimiter, (req, res) => {
    try {
        const tenantId = resolveBaileysTenant(req);
        res.json((0, baileysService_1.getConnectionStatus)(tenantId));
    }
    catch (err) {
        res.status(403).json({ success: false, error: err.message });
    }
});
// POST /api/baileys/send — test sending a message directly via Baileys
router.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) {
            res.status(400).json({ success: false, message: 'phone and message are required' });
            return;
        }
        const tenantId = resolveBaileysTenant(req);
        const outcome = await (0, baileysService_1.sendText)(phone, message, tenantId);
        if (!outcome.success) {
            res.status(400).json(outcome);
            return;
        }
        res.json(outcome);
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /api/baileys/reconnect — trigger reconnection if disconnected
router.post('/reconnect', async (req, res) => {
    try {
        const tenantId = resolveBaileysTenant(req);
        await (0, baileysService_1.startWhatsApp)(tenantId);
        res.json({
            success: true,
            message: 'Reconnection triggered',
            ...(0, baileysService_1.getConnectionStatus)(tenantId),
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /api/baileys/reset — wipe auth session and generate a fresh QR code
router.post('/reset', async (req, res) => {
    try {
        const tenantId = resolveBaileysTenant(req);
        const outcome = await (0, baileysService_1.resetWhatsAppSession)(tenantId);
        res.json(outcome);
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=baileys.routes.js.map