// Independent verifier fixture (NOT part of the repository). Synthetic users and assets only.
// Run from D:/SWE_Project/kitloop-rg03-1dca78a/server with DATABASE_URL -> kitloop_rg03_realapi_test (127.0.0.1).
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = "D:/SWE_Project/kitloop-rg03-1dca78a/server/";
const { prisma } = await import(pathToFileURL(root + "src/db.ts").href);
const { hashPassword } = await import(pathToFileURL(root + "src/password.ts").href);

const db = (await prisma.$queryRaw`SELECT current_database() AS db`)[0].db as string;
if (db !== "kitloop_rg03_realapi_test") throw new Error(`refusing to seed ${db}`);
const url = new URL(process.env.DATABASE_URL!);
if (url.hostname !== "127.0.0.1") throw new Error("refusing non-local database");

const password = randomBytes(18).toString("base64url");
const passwordHash = await hashPassword(password);
const borrowers = ["borrowerA", "borrowerB", "r05Fixed", "c02Fixed", "e3", "e4", "e6", "e7", "e8", "e9a", "e9b", "auto1", "auto2", "rel1"];
const users: Record<string, string> = {};
for (const key of borrowers) users[key] = `partA.${key}`;
users.custodian = "partA.custodian";
users.unassigned = "partA.custodian.unassigned";
const ids: Record<string, string> = {};
for (const [key, username] of Object.entries(users)) {
  const role = key === "custodian" || key === "unassigned" ? "CUSTODIAN" : "BORROWER";
  ids[key] = (await prisma.user.create({ data: { username, role, passwordHash } })).id;
}
// Browser-script assets keep their established names; RG-xx assets serve the API rehearsal.
const assets: Array<[string, string, string]> = [["E2E-CAM-01", "Camera", "Camera"], ["E2E-LAP-01", "Laptop", "Computer"],
  ["E2E-TRI-01", "Tripod", "Camera"], ["E2E-MIC-01", "Microphone", "Audio"], ["E2E-PRJ-01", "Projector", "Display"]];
for (let i = 1; i <= 24; i++) assets.push([`RG-${String(i).padStart(2, "0")}`, `Rehearsal item ${i}`, "Test"]);
for (const [assetId, name, category] of assets) {
  await prisma.asset.create({ data: { assetId, name, category, description: `Synthetic ${name.toLowerCase()}`,
    custodianAssets: { create: { custodianId: ids.custodian } } } }); // the "unassigned" custodian has no assets
}
writeFileSync("D:/SWE_Project/kitloop-lab7-partA-evidence/scripts/.e2e-credentials.json", JSON.stringify({ users, ids, password }));
console.log(`seeded ${db}: ${Object.keys(users).length} users, ${assets.length} assets (all assigned to partA.custodian)`);
await prisma.$disconnect();
