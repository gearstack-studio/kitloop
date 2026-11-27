// Reviewer fixture (NOT part of the PR): synthetic users and assets for the #91 real-API browser checks.
// Run from D:/SWE_Project/kitloop-91-verify/server with DATABASE_URL pointing at kitloop_91_e2e_test.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = "D:/SWE_Project/kitloop-91-verify/server/";
const { prisma } = await import(pathToFileURL(root + "src/db.ts").href);
const { hashPassword } = await import(pathToFileURL(root + "src/password.ts").href);

const db = (await prisma.$queryRaw`SELECT current_database() AS db`)[0].db as string;
if (db !== "kitloop_91_e2e_test") throw new Error(`refusing to seed ${db}`);

const password = randomBytes(18).toString("base64url");
const passwordHash = await hashPassword(password);
// One borrower per scenario so runs never share state.
const users = {
  borrowerA: "e2e91.full.a", borrowerB: "e2e91.full.b",
  r05Fixed: "e2e91.r05.fixed", r05Prefix: "e2e91.r05.prefix",
  c02Fixed: "e2e91.c02.fixed", c02Prefix: "e2e91.c02.prefix",
  custodian: "e2e91.custodian",
};
const ids: Record<string, string> = {};
for (const [key, username] of Object.entries(users)) {
  const user = await prisma.user.create({ data: { username, role: key === "custodian" ? "CUSTODIAN" : "BORROWER", passwordHash } });
  ids[key] = user.id;
}
const assets = [["E2E-CAM-01", "Camera", "Camera"], ["E2E-LAP-01", "Laptop", "Computer"], ["E2E-TRI-01", "Tripod", "Camera"],
  ["E2E-MIC-01", "Microphone", "Audio"], ["E2E-PRJ-01", "Projector", "Display"]];
for (const [assetId, name, category] of assets) {
  await prisma.asset.create({ data: { assetId, name, category, description: `Synthetic ${name.toLowerCase()} for full-stack verification`,
    custodianAssets: { create: { custodianId: ids.custodian } } } });
}
writeFileSync("D:/SWE_Project/kitloop-followup-91-evidence/scripts/.e2e-credentials.json", JSON.stringify({ users, ids, password }));
console.log(`seeded ${db}: ${Object.values(users).length} users; assets ${assets.map(a => a[0]).join(", ")}`);
await prisma.$disconnect();
