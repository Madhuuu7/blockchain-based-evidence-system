/**
 * mock-gateway.js — a tiny local "IPFS gateway" for TESTING ONLY.
 *
 * Purpose: genuinely simulate a compromised/corrupted IPFS gateway that
 * serves different bytes than what a given CID actually commits to, so
 * you can demonstrate a real "Integrity Violation" result end-to-end.
 *
 * This does NOT touch your real Pinata pin or the real IPFS network —
 * it's a standalone Express server that intercepts requests for exactly
 * one CID and returns altered content, while proxying every other CID
 * through to the real Pinata gateway untouched.
 *
 * Usage:
 *   1. cd backend
 *   2. node mock-gateway.js <cidToTamperWith>
 *      (the CID of the evidence file you want to simulate tampering for —
 *       copy it from the evidence detail page's "CID" field)
 *   3. In backend/.env, temporarily change:
 *        PINATA_GATEWAY=http://localhost:5050/ipfs
 *      (instead of https://gateway.pinata.cloud/ipfs)
 *   4. Restart the backend (npm run dev), then click "Verify Integrity"
 *      on that evidence item — it will now fetch from this mock gateway,
 *      get back altered bytes, recompute a different CID, and correctly
 *      report "Integrity Violation".
 *   5. When done testing, revert PINATA_GATEWAY back to the real Pinata
 *      gateway and restart the backend again.
 */
import express from "express";
import fetch from "node-fetch";

const PORT = 5050;
const REAL_GATEWAY = "https://gateway.pinata.cloud/ipfs";

const targetCid = process.argv[2];
if (!targetCid) {
  console.error("Usage: node mock-gateway.js <cidToTamperWith>");
  process.exit(1);
}

const app = express();

app.get("/ipfs/:cid", async (req, res) => {
  const { cid } = req.params;

  if (cid === targetCid) {
    console.log(`[mock-gateway] Serving TAMPERED content for ${cid}`);
    res.setHeader("Content-Type", "text/plain");
    return res.send(
      `THIS CONTENT HAS BEEN TAMPERED WITH — simulated gateway corruption for testing. ` +
      `Original CID: ${cid}. Timestamp: ${new Date().toISOString()}`
    );
  }

  // Pass through untouched for every other CID
  console.log(`[mock-gateway] Proxying real content for ${cid}`);
  const upstream = await fetch(`${REAL_GATEWAY}/${cid}`);
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status).send(buffer);
});

app.listen(PORT, () => {
  console.log(`[mock-gateway] Listening on http://localhost:${PORT}`);
  console.log(`[mock-gateway] Will tamper with CID: ${targetCid}`);
  console.log(`[mock-gateway] Set PINATA_GATEWAY=http://localhost:${PORT}/ipfs in backend/.env, then restart the backend.`);
});