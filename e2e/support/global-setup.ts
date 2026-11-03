import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import path from "node:path";
import { API_PORT, APP_ORIGIN, DB_NAME, SERVER_DIR, USERS, adminDatabaseUrl, assertSafeDatabaseName, e2eDatabaseUrl } from "./env";

const requireFromServer = createRequire(path.join(SERVER_DIR, "package.json"));

function run(label: string, script: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env: { ...process.env, ...env }, encoding: "utf8" });
  if (result.status !== 0) {
    // Output is passed through, so keep it free of connection strings: Prisma and the seed script print only names and counts.
    throw new Error(`${label} failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

/** Logs in through the HTTP API with the browser's Origin so we can prove which database the API is really using. */
function probeLogin(username: string, password: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ username, password });
    const request = http.request(
      { host: "localhost", port: API_PORT, path: "/api/auth/login", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Origin: APP_ORIGIN } },
      (response) => { response.resume(); response.on("end", () => resolve(response.statusCode ?? 0)); },
    );
    request.on("error", reject);
    request.end(body);
  });
}

export default async function globalSetup() {
  assertSafeDatabaseName();
  const adminUrl = adminDatabaseUrl();
  const e2eUrl = e2eDatabaseUrl();

  // 1. Fresh, dedicated database every run. The name is validated above (kitloop_e2e_*, never the dev/test database).
  const { PrismaClient } = requireFromServer("@prisma/client");
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
  } finally {
    await admin.$disconnect();
  }

  // 2. Apply every committed migration (deploy only: no reset, no dev migrate, no schema drift).
  const prismaCli = path.join(SERVER_DIR, "node_modules", "prisma", "build", "index.js");
  run("prisma migrate deploy", prismaCli, ["migrate", "deploy"], { DATABASE_URL: e2eUrl }, SERVER_DIR);

  // 3. Random credentials for this run only; tests read them from the environment (inherited by the workers).
  for (const user of Object.values(USERS)) process.env[user.envKey] = randomBytes(12).toString("base64url");

  // 4. Synthetic fixture, via the server's own password hashing.
  const tsxCli = path.join(SERVER_DIR, "node_modules", "tsx", "dist", "cli.mjs");
  run("e2e fixture", tsxCli, [path.join(__dirname, "seed-fixture.mts")],
    { DATABASE_URL: e2eUrl, E2E_DB_NAME: DB_NAME, E2E_SERVER_DIR: SERVER_DIR }, path.join(__dirname, ".."));

  // 5. Isolation proof: these users exist only in the e2e database, so a 200 means the API under test is using it
  //    and not a developer's database that a stray server might have been started against.
  const status = await probeLogin(USERS.borrowerA.username, process.env[USERS.borrowerA.envKey]!);
  if (status !== 200) {
    throw new Error(`The API on port ${API_PORT} did not accept the e2e fixture login (status ${status}); it is not using the e2e database. Aborting before any test runs.`);
  }
}
