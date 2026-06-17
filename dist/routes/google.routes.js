"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const google_controller_1 = require("../controllers/google.controller");
const router = express_1.default.Router();
router.get("/auth", google_controller_1.connectGoogle);
router.get("/callback", google_controller_1.googleCallback);
exports.default = router;
//# sourceMappingURL=google.routes.js.map