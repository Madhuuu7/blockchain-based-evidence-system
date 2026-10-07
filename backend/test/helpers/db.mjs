import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

/**
 * An ephemeral MongoDB for the tests.
 *
 * The suite used to assert against the live Atlas cluster and a specific
 * historical document, which meant it could only pass on one laptop with one
 * database in one state. This starts a real mongod in a temp directory
 * instead: same driver, same queries, same index behaviour, but empty at the
 * start of every file and gone at the end.
 */
let mongod = null;

export async function startDb() {
  // The first run downloads a mongod binary; 10s (the default) is not enough.
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(mongod.getUri(), { dbName: "evidence-test" });
  return mongoose.connection;
}

export async function stopDb() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  mongod = null;
}

/** Empties every collection between tests without paying to restart mongod. */
export async function clearDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
