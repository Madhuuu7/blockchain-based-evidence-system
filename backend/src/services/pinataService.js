import FormData from "form-data";
import fetch from "node-fetch";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";
import { env } from "../config/env.js";

const PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

export async function uploadToPinata(fileBuffer, filename, metadata = {}) {
  if (!env.pinataJwt) {
    throw new Error("PINATA_JWT not configured — cannot upload to IPFS.");
  }

  const form = new FormData();
  form.append("file", fileBuffer, { filename });
  form.append("pinataMetadata", JSON.stringify({ name: filename, keyvalues: metadata }));
  // cidVersion 1 with raw codec — matches the CID recomputation logic below.
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const response = await fetch(PINATA_PIN_FILE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.pinataJwt}`, ...form.getHeaders() },
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata upload failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.IpfsHash; // CID
}

export async function fetchFromIpfs(cid) {
  const url = `${env.pinataGateway}/${cid}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch CID ${cid} from IPFS gateway (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Recomputes the CIDv1 for a buffer of bytes and returns it as a string,
 * for comparison against the CID stored on-chain. This is genuine
 * content-integrity verification: unlike comparing two copies of the same
 * CID string, this independently re-derives the CID from the actual bytes
 * a gateway returned, so it will only match if those bytes are exactly
 * what the original CID committed to.
 *
 * NOTE: this assumes single-block, raw-codec CIDv1 (matches Pinata's
 * `cidVersion: 1` pin option for typical file uploads via pinFileToIPFS).
 * Very large files that Pinata chunks into a UnixFS DAG will produce a
 * *different* wrapping CID than a raw single-block hash — for those,
 * you'd need to reconstruct the full UnixFS DAG (e.g. via the `ipfs-unixfs-importer`
 * package) rather than a flat sha256-over-bytes. For this academic
 * prototype's typical evidence file sizes, the raw single-block approach
 * below is accurate and sufficient; note the limitation in your report.
 */
export async function recomputeCid(fileBuffer) {
  const hash = await sha256.digest(fileBuffer);
  const cid = CID.createV1(raw.code, hash);
  return cid.toString();
}