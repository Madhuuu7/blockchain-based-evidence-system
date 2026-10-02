import fetch from "node-fetch";
import FormData from "form-data";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";

async function testUpload() {
  const token = jwt.sign({ wallet: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" }, env.jwtSecret, { expiresIn: "1h" });

  const form = new FormData();
  form.append("caseId", "CASE-TEST-004");
  form.append("description", "Testing upload via HTTP API");
  form.append("fileType", "text/plain");
  form.append("file", Buffer.from("CYBERCRIME DIGITAL EVIDENCE RECORD - TEST CONTENT"), {
    filename: "CYBERCRIME DIGITAL EVIDENCE RECORD.txt",
    contentType: "text/plain"
  });

  const res = await fetch("http://localhost:4000/api/evidence/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders()
    },
    body: form
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response body:", data);
}

testUpload().catch(console.error);
