import { createRequire } from "node:module";
import path from "node:path";
import { DB_NAME, SERVER_DIR, adminDatabaseUrl, assertSafeDatabaseName } from "./env";

// Drops the dedicated e2e database after the run (WITH FORCE closes the API's open connections).
// Set E2E_KEEP_DB=1 to keep it for inspection; the next run recreates it anyway.
export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DB === "1") return;
  assertSafeDatabaseName();
  const { PrismaClient } = createRequire(path.join(SERVER_DIR, "package.json"))("@prisma/client");
  const admin = new PrismaClient({ datasourceUrl: adminDatabaseUrl() });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
  } finally {
    await admin.$disconnect();
  }
}
