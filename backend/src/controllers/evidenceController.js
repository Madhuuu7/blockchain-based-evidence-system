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

    const { cid, storage } = await uploadToPinata(
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
      storage,
      status: "pending-chain"
    });

    return res.status(201).json({
      draftId: evidenceDraft._id,
      cid,
      storage,
      // Say which of the two actually happened. The CID is authentic either
      // way, but "pinned to IPFS" and "cached on this server" are different
      // promises and the officer signing the transaction should know which
      // one they are committing to the chain.
      message:
        storage === "pinata"
          ? "File pinned to IPFS. Sign the on-chain registration transaction to finalize."
          : "IPFS pinning unavailable - the file is held in this server's local cache. " +
            "The CID is genuine, but the file is not yet replicated on the IPFS network. " +
            "Sign the on-chain registration transaction to finalize."
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

    // Step 1: Retrieve immutable record from blockchain
    const record = await getEvidenceFromChain(
      evidenceId,
      req.wallet
    );

    // Step 2: Fetch actual file bytes from IPFS gateway
    const fileBuffer = await fetchFromIpfs(record.cid);

    // Step 3: Recompute genuine IPFS CIDv1 from file bytes
    const recomputedCid = await recomputeCid(fileBuffer);
    const sha256Hash = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");

    // Step 4: Locate the off-chain mirror of this evidence.
    //
    // Identity is the case plus the on-chain id - the pair that cannot change.
    // A redeployed contract restarts evidenceId at 1 while MongoDB keeps the
    // documents from earlier runs, so the caseId is what separates them.
    //
    // Deliberately NOT matched on the CID: a lookup keyed by the CID can only
    // ever return documents that already agree with the chain, which is the
    // one thing this check exists to test.
    const evidenceDoc =
      (await Evidence.findOne({ caseId: record.caseId, evidenceId })) ||
      (await Evidence.findOne({ caseId: record.caseId }));

    // Step 5: Check integrity.
    //
    // The blockchain is the source of truth and IPFS holds the bytes, so the
    // verdict is whether the content still hashes to the CID the chain
    // recorded. The MongoDB mirror is reported alongside it rather than folded
    // into it: a mirror that disagrees is a database problem worth an alert,
    // and a mirror that is missing is neither a pass nor a violation - it is a
    // fact the caller should see instead of a silent success.
    const integrityVerified = recomputedCid === record.cid;

    const mirrorState = !evidenceDoc
      ? "missing"
      : evidenceDoc.cid === record.cid
        ? "consistent"
        : "divergent";

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
          `Integrity check failed for evidence #${evidenceId}: content served ` +
          `by IPFS does not match the on-chain CID (recomputed: ${recomputedCid}, ` +
          `on-chain: ${record.cid})`
      });
    }

    // A mirror that disagrees with the chain is its own incident: the file is
    // intact, but the database someone reads for case metadata is not.
    if (mirrorState === "divergent") {
      await Alert.create({
        type: "IntegrityViolation",
        walletAddress: req.wallet,
        evidenceId,
        message:
          `Database mismatch for evidence #${evidenceId}: the stored CID ` +
          `(${evidenceDoc.cid}) does not match the on-chain CID (${record.cid}). ` +
          `The blockchain record is authoritative.`
      });
    }

    if (mirrorState === "missing") {
      console.warn(
        `[verifyEvidence] No MongoDB record for evidence #${evidenceId} in case ` +
          `${record.caseId}. Verified against the chain and IPFS only.`
      );
    }

    if (evidenceDoc) {
      evidenceDoc.status =
        integrityVerified && mirrorState === "consistent"
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
      recomputedCid,
      sha256Hash,
      // "missing" | "consistent" | "divergent" - the state of the off-chain
      // copy, kept separate from the verdict so neither hides the other.
      databaseRecord: mirrorState,
      status: integrityVerified ? "verified" : "flagged",
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