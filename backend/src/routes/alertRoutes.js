import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listAlerts, resolveAlert } from "../controllers/alertController.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listAlerts);
router.post("/:id/resolve", resolveAlert);

export default router;
