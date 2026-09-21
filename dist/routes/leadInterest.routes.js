"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leadInterest_controller_1 = require("../controllers/leadInterest.controller");
const router = (0, express_1.Router)();
router.get('/', leadInterest_controller_1.listLeadInterest);
router.get('/:leadId', leadInterest_controller_1.getLeadInterestById);
exports.default = router;
//# sourceMappingURL=leadInterest.routes.js.map