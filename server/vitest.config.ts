import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.test", override: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/test/i.test(new URL(databaseUrl).pathname)) {
  throw new Error("Tests require a dedicated database whose name includes 'test' in .env.test");
}

export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
