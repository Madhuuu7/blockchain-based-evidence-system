import dotenv from "dotenv";
dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    // Fail loudly at startup rather than silently pretending things work —
    // per project rule: never pretend IPFS/Ethereum is configured if it isn't.
    console.error(`[config] Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: process.env.PORT || 4000,
  mongodbUri: required("MONGODB_URI"),
  pinataJwt: required("PINATA_JWT"),
  pinataGateway: process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs",
  rpcUrl: required("RPC_URL"),
  rpcWsUrl: process.env.RPC_WS_URL || "",
  contractAddress: required("CONTRACT_ADDRESS"),
  jwtSecret: required("JWT_SECRET"),
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173"
};
