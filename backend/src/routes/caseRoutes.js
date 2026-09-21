import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createCase, getCase, listCases } from "../controllers/caseController.js";

const router = Router();
router.use(requireAuth);

router.post("/", requireRole("OFFICER", "ADMIN"), createCase);
router.get("/", listCases);
router.get("/:caseId", getCase);

export default router;
