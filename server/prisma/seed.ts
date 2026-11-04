import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/password.js";
import { seedAssets } from "./seed-data.js";

const borrowerPassword = process.env.DEMO_BORROWER_PASSWORD;
const custodianPassword = process.env.DEMO_CUSTODIAN_PASSWORD;
if (!borrowerPassword || !custodianPassword) {
  throw new Error("Set DEMO_BORROWER_PASSWORD and DEMO_CUSTODIAN_PASSWORD before seeding");
}

const prisma = new PrismaClient();

async function main() {
  const [borrowerHash, custodianHash] = await Promise.all([
    hashPassword(borrowerPassword!),
    hashPassword(custodianPassword!),
  ]);

  for (const username of ["borrower.demo", "borrower.other"]) {
    await prisma.user.upsert({
      where: { username },
      create: { username, passwordHash: borrowerHash, role: Role.BORROWER },
      update: { passwordHash: borrowerHash, role: Role.BORROWER },
    });
  }

  const custodians = [];
  for (const username of ["custodian.demo", "custodian.other"]) {
    custodians.push(await prisma.user.upsert({
      where: { username },
      create: { username, passwordHash: custodianHash, role: Role.CUSTODIAN },
      update: { passwordHash: custodianHash, role: Role.CUSTODIAN },
    }));
  }

  const assets = seedAssets;
  for (const asset of assets) {
    await prisma.asset.upsert({ where: { assetId: asset.assetId }, create: asset, update: asset });
  }

  // custodian.demo manages the cameras; custodian.other manages the laptop (unchanged scope per asset).
  const scope: Array<[number, string]> = [[0, "KL-CAM-001"], [0, "KL-CAM-002"], [1, "KL-LAP-001"]];
  for (const [index, assetId] of scope) {
    await prisma.custodianAsset.upsert({
      where: { custodianId_assetId: { custodianId: custodians[index].id, assetId } },
      create: { custodianId: custodians[index].id, assetId },
      update: {},
    });
  }
}

try {
  await main();
  console.log("Seeded synthetic KitLoop demo accounts and assets");
} finally {
  await prisma.$disconnect();
}
