import dns from "dns";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { createApp } from "./app.js";

// Some Windows setups cannot resolve MongoDB Atlas's SRV records through the
// configured resolver, and the connection fails with a DNS error that looks
// nothing like a DNS problem. Overriding the resolver fixes it.
//
// Off by default: this is a workaround for one machine, and forcing every
// lookup in the process through a public resolver is not something a server
// should do to its host without being asked. Set DNS_SERVERS to switch it on,
// e.g. DNS_SERVERS=8.8.8.8,8.8.4.4
if (process.env.DNS_SERVERS) {
  const servers = process.env.DNS_SERVERS.split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  try {
    dns.setServers(servers);
    console.log("[server] DNS resolver overridden:", servers.join(", "));
  } catch (e) {
    console.warn("[server] Could not set custom DNS servers:", e.message);
  }
}

const { startEventListener } = await import("./services/eventListener.js");

const app = createApp();

async function start() {
  try {
    await mongoose.connect(env.mongodbUri);
    console.log("[server] Connected to MongoDB");
  } catch (err) {
    console.error("[server] MongoDB connection failed:", err.message);
    console.error("[server] Continuing to start HTTP server, but data endpoints will fail until MongoDB is reachable.");
  }

  try {
    startEventListener();
  } catch (err) {
    console.error("[server] Event listener failed to start:", err.message);
  }

  app.listen(env.port, () => {
    console.log(`[server] Listening on port ${env.port}`);
  });
}

start();
