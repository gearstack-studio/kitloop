// Seeds the dedicated e2e database with synthetic data. Run by global-setup through tsx (it reuses the server's own password hashing).
// This is NOT `npm run db:seed` and never touches the development database: it refuses to run anywhere except the e2e database.
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
  if (db !== expectedDb || !/^kitloop_e2e_/.test(db)) throw new Error(`Refusing to seed database "${db}"`);
  if ((await prisma.user.count()) > 0) throw new Error("e2e database is not empty; global setup should have recreated it");

  const users = [
    ["e2e.borrower.a", Role.BORROWER, "E2E_PW_BORROWER_A"],
    ["e2e.borrower.b", Role.BORROWER, "E2E_PW_BORROWER_B"],
    ["e2e.custodian.a", Role.CUSTODIAN, "E2E_PW_CUSTODIAN_A"],
    ["e2e.custodian.b", Role.CUSTODIAN, "E2E_PW_CUSTODIAN_B"],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [username, role, key] of users) {
    const password = process.env[key];
    if (!password) throw new Error(`${key} is not set`);
    ids[username] = (await prisma.user.create({ data: { username, role, passwordHash: await hashPassword(password) } })).id;
  }

  // Custodian A manages the cameras and the access-control asset; Custodian B manages the laptop (BR-05 needs two scopes).
  const assets = [
    { assetId: "KL-CAM-001", name: "Mirrorless camera", category: "Camera", description: "Synthetic e2e fixture: first copy", owner: "e2e.custodian.a" },
    { assetId: "KL-CAM-002", name: "Mirrorless camera", category: "Camera", description: "Synthetic e2e fixture: second copy", owner: "e2e.custodian.a" },
    { assetId: "KL-LAP-001", name: "Development laptop", category: "Computer", description: "Synthetic e2e fixture: other custodian", owner: "e2e.custodian.b" },
    { assetId: "KL-ACC-001", name: "Access-control microphone", category: "Audio", description: "Synthetic e2e fixture: used only by the access-control spec", owner: "e2e.custodian.a" },
    { assetId: "KL-OLD-001", name: "Retired tripod", category: "Support", description: "Synthetic e2e fixture: retired", owner: "e2e.custodian.a", retiredAt: new Date("2026-01-01T00:00:00Z") },
  ];
  for (const { owner, ...asset } of assets) {
    await prisma.asset.create({ data: { ...asset, custodianAssets: { create: { custodianId: ids[owner] } } } });
  }
  console.log(`seeded ${users.length} users and ${assets.length} assets into ${db}`);
} finally {
  await prisma.$disconnect();
}
