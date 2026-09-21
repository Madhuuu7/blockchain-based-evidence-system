import { Router } from "express";
import { requestNonce, verifySignature } from "../controllers/authController.js";

const router = Router();
router.post("/nonce", requestNonce);
router.post("/verify", verifySignature);

export default router;
