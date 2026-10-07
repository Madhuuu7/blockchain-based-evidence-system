/**
 * Pins the environment the tests run under.
 *
 * Imported first by every test file, before anything that reads config, so the
 * suite never depends on whatever happens to be in backend/.env. A checkout
 * with no .env at all still runs the full suite - which is the point, since a
 * marker cloning this repo will not have one.
 *
 * dotenv does not overwrite variables that are already set, so assigning them
 * here wins over the real .env.
 */
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/evidence-test";
process.env.PINATA_JWT = "test-jwt-not-a-real-key";
process.env.PINATA_GATEWAY = "https://gateway.invalid/ipfs";
process.env.RPC_URL = "http://127.0.0.1:8545";
process.env.CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
process.env.JWT_SECRET = "test-secret-for-the-suite-only";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";

// The suite asserts on behaviour, not log noise. Several tests deliberately
// drive the failure paths, and those paths log loudly by design - which is
// correct in production and useless here, because it buries the one line that
// matters when something really breaks. Run with TEST_VERBOSE=1 to see it all.
if (!process.env.TEST_VERBOSE) {
  console.warn = () => {};
  console.log = () => {};
  console.error = () => {};
}
