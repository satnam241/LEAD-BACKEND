import express from "express";

import {
connectGoogle,
googleCallback
}
from "../controllers/google.controller";

const router =
express.Router();

router.get("/auth",connectGoogle);

router.get("/callback",googleCallback);

export default router;