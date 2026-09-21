import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  uploadEvidence,
  listEvidence,
  getEvidenceById,
  getEvidenceHistory,
  getEvidenceFile,
  verifyEvidence,
  finalizeEvidence
} from "../controllers/evidenceController.js";

const router = Router();

router.use(requireAuth);

router.post("/upload", requireRole("OFFICER"), upload.single("file"), uploadEvidence);
router.post("/finalize", requireRole("OFFICER"), finalizeEvidence);

router.get("/", listEvidence);
router.get("/:id", getEvidenceById);
router.get("/:id/history", getEvidenceHistory);
router.get("/:id/file", getEvidenceFile);
router.post("/:id/verify", requireRole("INVESTIGATOR", "JUDICIARY", "ADMIN"), verifyEvidence);

export default router;
