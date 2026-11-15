import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { bootstrap, parseBootstrap } from "./bootstrap.js";
import { ConfigurationError, databaseUrl } from "./config.js";

async function main() {
  databaseUrl(process.env);
  const input = parseBootstrap(process.env.BOOTSTRAP_INPUT);
  const prisma = new PrismaClient();
  try {
    await bootstrap(prisma, input);
    console.log("Bootstrap completed; existing passwords and records preserved");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof ConfigurationError ? error.message : "Bootstrap failed; transaction rolled back");
  process.exitCode = error instanceof ConfigurationError ? 2 : 1;
});
