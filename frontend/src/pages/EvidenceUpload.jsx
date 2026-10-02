import React, { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useWeb3 } from "../context/Web3Context.jsx";
import contractAbi from "../utils/contractAbi.json";
import api from "../services/api.js";

const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "application/pdf", "video/mp4", "application/zip", "text/plain"];

// Stage machine: idle -> uploading-ipfs -> awaiting-signature -> confirming -> success | error
export default function EvidenceUpload() {
  const { getContract, address } = useWeb3();
  const [file, setFile] = useState(null);
  const [caseId, setCaseId] = useState("");
  const [description, setDescription] = useState("");
  const [fileType, setFileType] = useState("");
  const [stage, setStage] = useState("idle");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const validateFile = (f) => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return `File type "${f.type}" is not allowed.`;
    }
    if (f.size > MAX_SIZE_BYTES) {
      return `File exceeds the 100MB limit.`;
    }
    return null;
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !caseId || !description || !fileType) {
      setError("All fields are required.");
      return;
    }
    setError(null);
    setResult(null);

    try {
      // Step 1: upload to backend -> Pinata/IPFS
      setStage("uploading-ipfs");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caseId", caseId);
      formData.append("description", description);
      formData.append("fileType", fileType);

      const { data: uploadResult } = await api.post("/evidence/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      // Step 2: officer signs the on-chain registration transaction
      setStage("awaiting-signature");
      const contract = getContract(true);
      const tx = await contract.registerEvidence(caseId, uploadResult.cid, description, fileType);

      setStage("confirming");
      const receipt = await tx.wait();

// Find the EvidenceRegistered event emitted by the contract.
const registeredEvent = receipt.logs
  .map((log) => {
    try {
      return contract.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((parsed) => parsed?.name === "EvidenceRegistered");

if (!registeredEvent) {
  throw new Error(
    "Blockchain transaction succeeded, but EvidenceRegistered event was not found."
  );
}

const evidenceId = Number(registeredEvent.args.evidenceId);

// Finalize the MongoDB draft with the real blockchain evidence ID.
await api.post("/evidence/finalize", {
  draftId: uploadResult.draftId,
  evidenceId,
  txHash: receipt.hash
});

setStage("success");

setResult({
  evidenceId,
  cid: uploadResult.cid,
  txHash: receipt.hash,
  blockNumber: receipt.blockNumber,
  registeredBy: address,
  timestamp: new Date().toISOString()
});
    } catch (err) {
      setStage("error");
      const errMsg = err.response?.data?.error || err.reason || err.message || "Registration failed";
      setError(errMsg);
    }
  };

  return (
    <Layout>
      <h1 className="text-lg font-semibold text-ocean-900 mb-6">Upload Evidence</h1>

      <form onSubmit={handleSubmit} className="max-w-xl bg-white border border-ocean-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="text-sm text-slate-600">Case ID</label>
          <input
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="mt-1 w-full bg-white border border-ocean-200 rounded px-3 py-2 text-sm"
            placeholder="CASE-2026-014"
          />
        </div>

        <div>
          <label className="text-sm text-slate-600">Evidence Type</label>
          <input
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            className="mt-1 w-full bg-white border border-ocean-200 rounded px-3 py-2 text-sm"
            placeholder="disk-image, screenshot, log-file..."
          />
        </div>

        <div>
          <label className="text-sm text-slate-600">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full bg-white border border-ocean-200 rounded px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <div>
          <label className="text-sm text-slate-600">Evidence File</label>
          <input type="file" onChange={handleFileChange} className="mt-1 w-full text-sm" />
        </div>

        <button
          type="submit"
          disabled={["uploading-ipfs", "awaiting-signature", "confirming"].includes(stage)}
          className="w-full py-3 rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-60 font-medium text-sm text-white"
        >
          {stage === "idle" && "Upload & Register Evidence"}
          {stage === "uploading-ipfs" && "Uploading to IPFS..."}
          {stage === "awaiting-signature" && "Confirm in MetaMask..."}
          {stage === "confirming" && "Waiting for block confirmation..."}
          {stage === "success" && "Registered ✓"}
          {stage === "error" && "Retry"}
        </button>

        {stage !== "idle" && (
          <div className="flex gap-2">
            {stage === "uploading-ipfs" && <StatusBadge tone="pending">Uploading to IPFS</StatusBadge>}
            {stage === "awaiting-signature" && <StatusBadge tone="pending">Awaiting Signature</StatusBadge>}
            {stage === "confirming" && <StatusBadge tone="pending">Confirming on Sepolia</StatusBadge>}
            {stage === "success" && <StatusBadge tone="success">Success</StatusBadge>}
            {stage === "error" && <StatusBadge tone="error">Error</StatusBadge>}
          </div>
        )}

        {error && (
          <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/30 rounded p-3">
            {error}
          </div>
        )}

        {result && (
          <div className="text-sm bg-status-ok/10 border border-status-ok/30 rounded p-3 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-600 font-medium">Registration Successful ✓</span>
              {result.evidenceId && (
                <Link
                  to={`/evidence/${result.evidenceId}`}
                  className="text-xs text-accent-700 hover:underline font-semibold"
                >
                  View Detail →
                </Link>
              )}
            </div>
            {result.evidenceId && (
              <div><span className="text-slate-500">Evidence ID:</span> <span className="font-mono text-accent-700 font-semibold">#{result.evidenceId}</span></div>
            )}
            <div><span className="text-slate-500">CID:</span> <span className="break-all font-mono text-xs">{result.cid}</span></div>
            <div><span className="text-slate-500">Tx Hash:</span> <span className="break-all font-mono text-xs">{result.txHash}</span></div>
            <div><span className="text-slate-500">Block:</span> {result.blockNumber}</div>
          </div>
        )}
      </form>
    </Layout>
  );
}
