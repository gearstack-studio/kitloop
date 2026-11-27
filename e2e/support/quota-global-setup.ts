import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { API_PORT, APP_ORIGIN, DB_NAME, SERVER_DIR, e2eDatabaseUrl } from "./env";

// Second global-setup step of playwright.quota.config.ts (spec 09 only). The shared global setup has already
// dropped, recreated, migrated and seeded the dedicated quota database; this step adds spec 09's own users and assets
// and proves the API under test is the quota-ENABLED server on that database before any test runs.

export const QUOTA_USERS = {
  b1: { username: "e2e.quota.b1", envKey: "E2E_PW_Q_B1" },
  b2: { username: "e2e.quota.b2", envKey: "E2E_PW_Q_B2" },
  b3: { username: "e2e.quota.b3", envKey: "E2E_PW_Q_B3" },
  b4: { username: "e2e.quota.b4", envKey: "E2E_PW_Q_B4" },
  b5: { username: "e2e.quota.b5", envKey: "E2E_PW_Q_B5" },
  custodian: { username: "e2e.quota.custodian", envKey: "E2E_PW_Q_CUSTODIAN" },
} as const;

function login(username: string, password: string): Promise<{ status: number; features: unknown }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ username, password });
    const request = http.request(
      { host: "localhost", port: API_PORT, path: "/api/auth/login", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Origin: APP_ORIGIN } },
      (response) => {
        let text = "";
        response.on("data", (chunk) => { text += chunk; });
        response.on("end", () => {
          let features: unknown = null;
          try { features = JSON.parse(text).features; } catch { /* non-JSON body */ }
          resolve({ status: response.statusCode ?? 0, features });
        });
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

export default async function quotaGlobalSetup() {
  if (DB_NAME !== "kitloop_e2e_quota") throw new Error(`quota setup must use kitloop_e2e_quota (got "${DB_NAME}")`);

  // Random credentials for this run only; inherited by the workers through the environment.
  for (const user of Object.values(QUOTA_USERS)) process.env[user.envKey] = randomBytes(12).toString("base64url");

  const tsxCli = path.join(SERVER_DIR, "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(process.execPath, [tsxCli, path.join(__dirname, "seed-quota-fixture.mts")], {
    cwd: path.join(__dirname, ".."), encoding: "utf8",
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl(), E2E_DB_NAME: DB_NAME, E2E_SERVER_DIR: SERVER_DIR },
  });
  if (result.status !== 0) throw new Error(`quota fixture failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`);

  // Isolation and configuration proof: a quota-only user can sign in, and the server reports the quota as enabled.
  const probe = await login(QUOTA_USERS.b5.username, process.env[QUOTA_USERS.b5.envKey]!);
  const enabled = (probe.features as { borrowingQuota?: boolean } | null)?.borrowingQuota === true;
  if (probe.status !== 200 || !enabled) {
    throw new Error(`The API on port ${API_PORT} is not the quota-enabled server on ${DB_NAME} (status ${probe.status}, borrowingQuota=${enabled}). Aborting before any test runs.`);
  }
}
