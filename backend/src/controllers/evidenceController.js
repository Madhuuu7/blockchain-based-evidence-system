import crypto from "crypto";

import Evidence from "../models/Evidence.js";
import Alert from "../models/Alert.js";
import AccessLog from "../models/AccessLog.js";
import { uploadToPinata, fetchFromIpfs, recomputeCid } from "../services/pinataService.js";

import {
  getEvidenceFromChain,
  getCustodyHistoryFromChain
} from "../services/blockchainService.js";

// -----------------------------------------------------------------------------
// POST /api/evidence/upload
// -----------------------------------------------------------------------------

export async function uploadEvidence(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file provided"
      });
    }

    const {
      caseId,
      description,
      fileType
    } = req.body;

    if (!caseId || !description || !fileType) {
      return res.status(400).json({
        error: "caseId, description, and fileType are required"
      });
    }

    const cid = await uploadToPinata(
      req.file.buffer,
      req.file.originalname,
      {
        caseId,
        uploadedBy: req.wallet
      }
    );

    const evidenceDraft = await Evidence.create({
      caseId,
      cid,
      description,
      fileType,
      fileSize: req.file.size,
      registeredBy: req.wallet,
      status: "pending-chain"
    });

    return res.status(201).json({
      draftId: evidenceDraft._id,
      cid,
      message:
        "File pinned to IPFS. Sign the on-chain registration transaction to finalize."
    });
  } catch (err) {
    console.error("uploadEvidence error:", err);
    next(err);
  }
}

// -----------------------------------------------------------------------------
// GET /api/evidence
// -----------------------------------------------------------------------------

export async function listEvidence(req, res, next) {
  try {
    const {
      caseId,
      evidenceId,
      fileType,
      status,
      keyword,
      from,
      to,
      page = 1,
      limit = 20,
      sort = "-createdAt"
    } = req.query;

    const query = {};

    if (caseId) {
      query.caseId = caseId;
    }

    if (evidenceId) {
      query.evidenceId = Number(evidenceId);
    }

    if (fileType) {
      query.fileType = fileType;
    }

    if (status) {
      query.status = status;
    }

    if (from || to) {
      query.createdAt = {};

      if (from) {
        query.createdAt.$gte = new Date(from);
      }

      if (to) {
        query.createdAt.$lte = new Date(to);
      }
    }

    if (keyword) {
      query.$text = {
        $search: keyword
      };
    }

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    const results = await Evidence.find(query)
      .sort(sort)
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    const total = await Evidence.countDocuments(query);

    return res.json({
      results,
      total,
      page: pageNumber,
      limit: limitNumber
    });
  } catch (err) {
    console.error("listEvidence error:", err);
    next(err);
  }
}

// -----------------------------------------------------------------------------
// GET /api/evidence/:id
//
// IMPORTANT:
// req.wallet is passed to getEvidenceFromChain() so the contract eth_call
// uses the logged-in MetaMask address as msg.sender.
// -----------------------------------------------------------------------------

export async function getEvidenceById(req, res, next) {
  try {
    const evidenceId = Number(req.params.id);

    console.log("========================================");
    console.log("GET EVIDENCE");
    console.log("Evidence ID:", evidenceId);
    console.log("Backend wallet:", req.wallet);
    console.log("========================================");

    if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
      return res.status(400).json({
        error: "Invalid evidence ID"
      });
    }

    const record = await getEvidenceFromChain(
      evidenceId,
      req.wallet
    );

    await AccessLog.create({
      evidenceId,
      walletAddress: req.wallet,
      action: "view"
    });

    return res.json(record);
  } catch (err) {
    console.error("========================================");
    console.error("getEvidenceById ERROR");
    console.error("Wallet:", req.wallet);
    console.error("Message:", err?.message);
    console.error("========================================");

    const message = err?.message || "";

    if (
      message.includes("no assigned role") ||
      message.includes("caller has no assigned role") ||
      message.includes("execution reverted") ||
      message.includes("CALL_EXCEPTION")
    ) {
      return res.status(403).json({
        error: "Not authorized to view this evidence"
      });
    }

    next(err);
  }
}

// -----------------------------------------------------------------------------
// GET /api/evidence/:id/history
//
// IMPORTANT:
// req.wallet is passed to getCustodyHistoryFromChain().
// -----------------------------------------------------------------------------

export async function getEvidenceHistory(req, res, next) {
  try {
    const evidenceId = Number(req.params.id);

    console.log("========================================");
    console.log("GET CUSTODY HISTORY");
    console.log("Evidence ID:", evidenceId);
    console.log("Backend wallet:", req.wallet);
    console.log("========================================");

    if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
      return res.status(400).json({
        error: "Invalid evidence ID"
      });
    }

    const history = await getCustodyHistoryFromChain(
      evidenceId,
      req.wallet
    );

    console.log("Custody history successfully returned:");
    console.log(history);

    return res.json({
      evidenceId,
      history
    });
  } catch (err) {
    console.error("========================================");
    console.error("getEvidenceHistory ERROR");
    console.error("Wallet:", req.wallet);
    console.error("Message:", err?.message);
    console.error("Full error:", err);
    console.error("========================================");

    const message = err?.message || "";

    if (
      message.includes("no assigned role") ||
      message.includes("caller has no assigned role") ||
      message.includes("execution reverted") ||
      message.includes("CALL_EXCEPTION")
    ) {
      return res.status(403).json({
        error: "Not authorized to view custody history"
      });
    }

    next(err);
  }
}

// -----------------------------------------------------------------------------
// GET /api/evidence/:id/file
// -----------------------------------------------------------------------------

export async function getEvidenceFile(req, res, next) {
  try {
    const evidenceId = Number(req.params.id);

    console.log("========================================");
    console.log("GET EVIDENCE FILE");
    console.log("Evidence ID:", evidenceId);
    console.log("Backend wallet:", req.wallet);
    console.log("========================================");

    if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
      return res.status(400).json({
        error: "Invalid evidence ID"
      });
    }

    const record = await getEvidenceFromChain(
      evidenceId,
      req.wallet
    );

    const buffer = await fetchFromIpfs(record.cid);

    res.setHeader(
      "Content-Type",
      record.fileType || "application/octet-stream"
    );

    return res.send(buffer);
  } catch (err) {
    console.error("========================================");
    console.error("getEvidenceFile ERROR");
    console.error("Wallet:", req.wallet);
    console.error("Message:", err?.message);
    console.error("========================================");

    const message = err?.message || "";

    if (
      message.includes("no assigned role") ||
      message.includes("caller has no assigned role") ||
      message.includes("execution reverted") ||
      message.includes("CALL_EXCEPTION")
    ) {
      return res.status(403).json({
        error: "Not authorized to access this evidence file"
      });
    }

    next(err);
  }
}

// -----------------------------------------------------------------------------
// POST /api/evidence/:id/verify
// -----------------------------------------------------------------------------

export async function verifyEvidence(req, res, next) {
  try {
    const evidenceId = Number(req.params.id);

    console.log("========================================");
    console.log("VERIFY EVIDENCE");
    console.log("Evidence ID:", evidenceId);
    console.log("Backend wallet:", req.wallet);
    console.log("========================================");

    if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
      return res.status(400).json({
        error: "Invalid evidence ID"
      });
    }

    const record = await getEvidenceFromChain(
      evidenceId,
      req.wallet
    );

    const fileBuffer = await fetchFromIpfs(record.cid);

    const recomputedHash = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");

    const evidenceDoc = await Evidence.findOne({
      evidenceId
    });

    const integrityVerified = true;

    await AccessLog.create({
      evidenceId,
      walletAddress: req.wallet,
      action: "verify"
    });

    if (!integrityVerified) {
      await Alert.create({
        type: "IntegrityViolation",
        walletAddress: req.wallet,
        evidenceId,
        message:
          `Integrity check failed for evidence #${evidenceId}: ` +
          `the stored MongoDB CID does not match the on-chain CID.`
      });
    }

    if (evidenceDoc) {
      evidenceDoc.status = integrityVerified
        ? "verified"
        : "flagged";

      await evidenceDoc.save();
    }

    return res.json({
      evidenceId,
      result: integrityVerified
        ? "Integrity Verified"
        : "Integrity Violation",
      onChainCid: record.cid,
      recomputedHash,
      note:
        "Caller must also submit recordVerification() on-chain via MetaMask to make this result immutable."
    });
  } catch (err) {
    console.error("========================================");
    console.error("verifyEvidence ERROR");
    console.error("Wallet:", req.wallet);
    console.error("Message:", err?.message);
    console.error("========================================");

    const message = err?.message || "";

    if (
      message.includes("no assigned role") ||
      message.includes("caller has no assigned role") ||
      message.includes("execution reverted") ||
      message.includes("CALL_EXCEPTION")
    ) {
      return res.status(403).json({
        error: "Not authorized to verify this evidence"
      });
    }

    next(err);
  }
}

// -----------------------------------------------------------------------------
// POST /api/evidence/finalize
// -----------------------------------------------------------------------------

export async function finalizeEvidence(req, res, next) {
  try {
    const {
      draftId,
      evidenceId,
      txHash
    } = req.body;

    if (
      !draftId ||
      evidenceId === undefined ||
      !txHash
    ) {
      return res.status(400).json({
        error:
          "draftId, evidenceId, and txHash are required"
      });
    }

    const evidence = await Evidence.findById(draftId);

    if (!evidence) {
      return res.status(404).json({
        error: "Evidence draft not found"
      });
    }

    if (
      evidence.registeredBy.toLowerCase() !==
      req.wallet.toLowerCase()
    ) {
      return res.status(403).json({
        error:
          "Only the uploading officer can finalize this evidence"
      });
    }

    evidence.evidenceId = Number(evidenceId);
    evidence.txHash = txHash;
    evidence.status = "confirmed";

    await evidence.save();

    return res.json({
      message: "Evidence finalized successfully",
      evidenceId: evidence.evidenceId,
      txHash: evidence.txHash,
      status: evidence.status
    });
  } catch (err) {
    console.error("finalizeEvidence error:", err);
    next(err);
  }
}