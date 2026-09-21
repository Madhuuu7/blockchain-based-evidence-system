import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listUsers, syncUserRole } from "../controllers/userController.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listUsers);
router.post("/role", syncUserRole);

export default router;
