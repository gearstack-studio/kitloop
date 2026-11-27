// Seeds the dedicated spec 09 users and assets into the quota e2e database only (CR-01 STS TC11, TC12, TC18).
// Run by quota-global-setup through tsx, after the shared global setup has created, migrated and seeded the database.
// It refuses to run anywhere except kitloop_e2e_quota and never touches the quota-off database used by specs 01-08.
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const serverDir = process.env.E2E_SERVER_DIR!;
const expectedDb = process.env.E2E_DB_NAME!;
const requireFromServer = createRequire(path.join(serverDir, "package.json"));
const { PrismaClient, Role } = requireFromServer("@prisma/client");
const { hashPassword } = await import(pathToFileURL(path.join(serverDir, "src", "password.ts")).href);

const prisma = new PrismaClient();
try {
  const [{ db }] = (await prisma.$queryRawUnsafe("select current_database() as db")) as Array<{ db: string }>;
  if (db !== expectedDb || db !== "kitloop_e2e_quota") throw new Error(`Refusing to seed quota fixtures into "${db}"`);
  if ((await prisma.user.count({ where: { username: { startsWith: "e2e.quota." } } })) > 0) {
    throw new Error("quota fixtures already present; global setup should have recreated the database");
  }

  const users = [
    ["e2e.quota.b1", Role.BORROWER, "E2E_PW_Q_B1"],
    ["e2e.quota.b2", Role.BORROWER, "E2E_PW_Q_B2"],
    ["e2e.quota.b3", Role.BORROWER, "E2E_PW_Q_B3"],
    ["e2e.quota.b4", Role.BORROWER, "E2E_PW_Q_B4"],
    ["e2e.quota.b5", Role.BORROWER, "E2E_PW_Q_B5"],
    ["e2e.quota.custodian", Role.CUSTODIAN, "E2E_PW_Q_CUSTODIAN"],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [username, role, key] of users) {
    const password = process.env[key];
    if (!password) throw new Error(`${key} is not set`);
    ids[username] = (await prisma.user.create({ data: { username, role, passwordHash: await hashPassword(password) } })).id;
  }

  // Eight available assets, all assigned to the quota custodian.
  for (let i = 1; i <= 8; i++) {
    const n = String(i).padStart(3, "0");
    await prisma.asset.create({ data: {
      assetId: `KL-Q-${n}`, name: `Quota item ${i}`, category: "Quota",
      description: "Synthetic e2e fixture: spec 09 borrowing quota journeys",
      custodianAssets: { create: { custodianId: ids["e2e.quota.custodian"] } },
    } });
  }
  console.log(`seeded ${users.length} quota users and 8 quota assets into ${db}`);
} finally {
  await prisma.$disconnect();
}
