// Independent verifier fixture (reproduction only). Synthetic users and assets in a dedicated local test database.
// Usage (from <repo>/server, DATABASE_URL -> local kitloop_rg03_realapi_test):
//   npx tsx ../artifacts/lab-07/cr-01/rg-03-independent-1dca78a/scripts/fixture.mts
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const paths = createRequire(import.meta.url)(path.join(scriptsDir, "paths.cjs"));

// Safety first: validate host and database name before the application's database module is even loaded.
const expectedDb = paths.assertSafeDatabase("kitloop_rg03_realapi_test");

const serverDir = path.join(paths.REPO_ROOT, "server");
const { prisma } = await import(pathToFileURL(path.join(serverDir, "src", "db.ts")).href);
const { hashPassword } = await import(pathToFileURL(path.join(serverDir, "src", "password.ts")).href);

try {
  const db = (await prisma.$queryRaw`SELECT current_database() AS db`)[0].db as string;
  if (db !== expectedDb) throw new Error(`refusing to seed ${db}`);
  if ((await prisma.user.count()) > 0) throw new Error(`${db} is not empty; recreate it before seeding`);

  const password = randomBytes(18).toString("base64url"); // random per run, never logged
  const passwordHash = await hashPassword(password);
  const borrowers = ["borrowerA", "borrowerB", "r05Fixed", "c02Fixed", "s6", "e3", "e4", "e6", "e7", "e8", "e9a", "e9b", "auto1", "auto2", "rel1"];
  const users: Record<string, string> = {};
  for (const key of borrowers) users[key] = `partA.${key}`;
  users.custodian = "partA.custodian";
  users.unassigned = "partA.custodian.unassigned";
  const ids: Record<string, string> = {};
  for (const [key, username] of Object.entries(users)) {
    const role = key === "custodian" || key === "unassigned" ? "CUSTODIAN" : "BORROWER";
    ids[key] = (await prisma.user.create({ data: { username, role, passwordHash } })).id;
  }
  const assets: Array<[string, string, string]> = [["E2E-CAM-01", "Camera", "Camera"], ["E2E-LAP-01", "Laptop", "Computer"],
    ["E2E-TRI-01", "Tripod", "Camera"], ["E2E-MIC-01", "Microphone", "Audio"], ["E2E-PRJ-01", "Projector", "Display"]];
  for (let i = 1; i <= 24; i++) assets.push([`RG-${String(i).padStart(2, "0")}`, `Rehearsal item ${i}`, "Test"]);
  for (const [assetId, name, category] of assets) {
    await prisma.asset.create({ data: { assetId, name, category, description: `Synthetic ${name.toLowerCase()}`,
      custodianAssets: { create: { custodianId: ids.custodian } } } }); // "unassigned" custodian has no assets
  }
  writeFileSync(paths.CREDENTIALS_FILE, JSON.stringify({ users, ids, password }), { mode: 0o600 });
  console.log(`seeded ${db}: ${Object.keys(users).length} users, ${assets.length} assets; credentials -> ${path.relative(paths.REPO_ROOT, paths.CREDENTIALS_FILE)}`);
} finally {
  await prisma.$disconnect();
}
