import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/password.js";

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

  const assets = [
    { assetId: "KL-CAM-001", name: "Mirrorless camera", category: "Camera", description: "Synthetic demo asset" },
    { assetId: "KL-LAP-001", name: "Development laptop", category: "Computer", description: "Synthetic demo asset" },
  ];
  for (const asset of assets) {
    await prisma.asset.upsert({ where: { assetId: asset.assetId }, create: asset, update: asset });
  }

  await prisma.custodianAsset.upsert({
    where: { custodianId_assetId: { custodianId: custodians[0].id, assetId: assets[0].assetId } },
    create: { custodianId: custodians[0].id, assetId: assets[0].assetId },
    update: {},
  });
  await prisma.custodianAsset.upsert({
    where: { custodianId_assetId: { custodianId: custodians[1].id, assetId: assets[1].assetId } },
    create: { custodianId: custodians[1].id, assetId: assets[1].assetId },
    update: {},
  });
}

try {
  await main();
  console.log("Seeded synthetic KitLoop demo accounts and assets");
} finally {
  await prisma.$disconnect();
}
