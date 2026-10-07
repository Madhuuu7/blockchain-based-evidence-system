import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

import authRoutes from "./routes/authRoutes.js";
import evidenceRoutes from "./routes/evidenceRoutes.js";
import caseRoutes from "./routes/caseRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import userRoutes from "./routes/userRoutes.js";

/**
 * Builds the Express application without starting it or touching the network.
 *
 * Kept separate from server.js so the tests can mount the real routing stack -
 * the same middleware, in the same order - against an in-memory database,
 * instead of testing a hand-assembled app that only resembles the running one.
 *
 * `options.rateLimit` turns the limiter off for tests, where several hundred
 * requests from one address is the normal case rather than an attack.
 */
export function createApp(options = {}) {
  const { rateLimit: enableRateLimit = true, logging = true } = options;
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  app.use(express.json());

  if (logging) {
    app.use(morgan("dev"));
  }

  if (enableRateLimit) {
    // Basic protection against brute-force / abusive API access
    app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
  }

  app.get("/api/health", (req, res) =>
    res.json({ status: "ok", time: new Date().toISOString() })
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/evidence", evidenceRoutes);
  app.use("/api/cases", caseRoutes);
  app.use("/api/alerts", alertRoutes);
  app.use("/api/users", userRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
