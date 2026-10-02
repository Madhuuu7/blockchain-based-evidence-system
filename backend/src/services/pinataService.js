import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import FormData from "form-data";
import fetch from "node-fetch";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";
import { env } from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "../../ipfs_cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

/**
 * Store evidence bytes and return the CID the chain will commit to.
 *
 * Returns `{ cid, storage }` rather than a bare CID. The CID is authentic
 * either way - it is derived from the bytes, so integrity verification works
 * regardless - but `storage` records whether the file was actually pinned to
 * IPFS or only cached on this host. Collapsing the two would let the chain
 * assert decentralised availability that does not exist, and nothing would
 * ever say otherwise.
 */
export async function uploadToPinata(fileBuffer, filename, metadata = {}) {
  // Always derive authentic IPFS CIDv1 from file bytes
  const localCid = await recomputeCid(fileBuffer);

  // Cache file locally by authentic CID for guaranteed availability during local demo/testing
  try {
    const cachePath = path.join(CACHE_DIR, localCid);
    fs.writeFileSync(cachePath, fileBuffer);
  } catch (cacheErr) {
    console.warn("[pinataService] Failed to write to local IPFS cache:", cacheErr.message);
  }

  // Attempt remote pinning to Pinata if JWT is configured
  if (env.pinataJwt) {
    try {
      const form = new FormData();
      form.append("file", fileBuffer, { filename });
      form.append("pinataMetadata", JSON.stringify({ name: filename, keyvalues: metadata }));
      form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

      const response = await fetch(PINATA_PIN_FILE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.pinataJwt}`, ...form.getHeaders() },
        body: form
      });

      if (response.ok) {
        const data = await response.json();
        return { cid: data.IpfsHash, storage: "pinata" };
      } else {
        const errorText = await response.text();
        console.warn(`[pinataService] Remote Pinata pin returned ${response.status}: ${errorText}. Falling back to the local IPFS cache.`);
      }
    } catch (err) {
      console.warn(`[pinataService] Remote Pinata request error: ${err.message}. Falling back to the local IPFS cache.`);
    }
  } else {
    console.warn("[pinataService] PINATA_JWT is not configured. Falling back to the local IPFS cache.");
  }

  return { cid: localCid, storage: "local-cache" };
}

export async function fetchFromIpfs(cid) {
  // Check local IPFS cache first
  const cachePath = path.join(CACHE_DIR, cid);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }

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