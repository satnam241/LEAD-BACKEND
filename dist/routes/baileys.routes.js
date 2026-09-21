"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const baileysService_1 = require("../services/baileysService");
const router = (0, express_1.Router)();
// GET /api/baileys/status — frontend polls this every few seconds to show the QR
// (when disconnected) or a "Connected" badge (once scanned).
router.get('/status', (_req, res) => {
    res.json((0, baileysService_1.getConnectionStatus)());
});
// POST /api/baileys/send — test sending a message directly via Baileys
router.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) {
            res.status(400).json({ success: false, message: 'phone and message are required' });
            return;
        }
        const outcome = await (0, baileysService_1.sendText)(phone, message);
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
router.post('/reconnect', async (_req, res) => {
    try {
        await (0, baileysService_1.startWhatsApp)();
        res.json({
            success: true,
            message: 'Reconnection triggered',
            ...(0, baileysService_1.getConnectionStatus)(),
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /api/baileys/reset — wipe auth session and generate a fresh QR code
router.post('/reset', async (_req, res) => {
    try {
        const outcome = await (0, baileysService_1.resetWhatsAppSession)();
        res.json(outcome);
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=baileys.routes.js.map