import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const SERVER_DIR = path.join(REPO_ROOT, "server");
export const CLIENT_DIR = path.join(REPO_ROOT, "client");

// The suite owns its own ports so it never reuses (or disturbs) the developer's servers on 3000/5173.
export const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
export const APP_ORIGIN = `http://localhost:${WEB_PORT}`;
export const API_ORIGIN = `http://localhost:${API_PORT}`;
export const API_BASE = `${API_ORIGIN}/api`;

export const DB_NAME = process.env.E2E_DB_NAME ?? "kitloop_e2e_pw";

// Per-run session secret, never stored in a file. Assigning to process.env lets the Playwright workers inherit the same value.
process.env.E2E_SESSION_SECRET ??= randomBytes(32).toString("hex");

export function parseEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8").split(/\r?\n/).filter((line) => /^\w+=/.test(line)).map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
  );
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/**
 * Connection used only to CREATE/DROP the dedicated e2e database. It supplies host, port, user and password;
 * its own database is never modified. Source: E2E_ADMIN_DATABASE_URL, else server/.env.test (git-ignored, README setup).
 */
export function adminDatabaseUrl(): string {
  const url = process.env.E2E_ADMIN_DATABASE_URL ?? parseEnvFile(path.join(SERVER_DIR, ".env.test")).DATABASE_URL;
  if (!url) {
    throw new Error(
      "No PostgreSQL connection available for the e2e database. Create server/.env.test as described in the README " +
        "(or set E2E_ADMIN_DATABASE_URL). It is only used to create the separate '" + DB_NAME + "' database.",
    );
  }
  return url;
}

/** Safety rules: the e2e database must be a dedicated, clearly named database that is not the dev or test database. */
export function assertSafeDatabaseName(): void {
  if (!/^kitloop_e2e_[a-z0-9_]+$/.test(DB_NAME)) {
    throw new Error(`E2E_DB_NAME must match ^kitloop_e2e_[a-z0-9_]+$ (got "${DB_NAME}").`);
  }
  const protectedNames = [
    parseEnvFile(path.join(SERVER_DIR, ".env")).DATABASE_URL,
    parseEnvFile(path.join(SERVER_DIR, ".env.test")).DATABASE_URL,
    process.env.E2E_ADMIN_DATABASE_URL,
  ].filter((value): value is string => !!value).map(databaseName);
  if (protectedNames.includes(DB_NAME)) {
    throw new Error(`Refusing to use "${DB_NAME}": it is the development or test database named in server/.env or server/.env.test.`);
  }
}

/** The adminDatabaseUrl with the database swapped for the dedicated e2e database. Never logged. */
export function e2eDatabaseUrl(): string {
  assertSafeDatabaseName();
  const url = new URL(adminDatabaseUrl());
  url.pathname = `/${DB_NAME}`;
  return url.toString();
}

export const USERS = {
  borrowerA: { username: "e2e.borrower.a", role: "BORROWER", envKey: "E2E_PW_BORROWER_A" },
  borrowerB: { username: "e2e.borrower.b", role: "BORROWER", envKey: "E2E_PW_BORROWER_B" },
  custodianA: { username: "e2e.custodian.a", role: "CUSTODIAN", envKey: "E2E_PW_CUSTODIAN_A" },
  custodianB: { username: "e2e.custodian.b", role: "CUSTODIAN", envKey: "E2E_PW_CUSTODIAN_B" },
} as const;
export type UserKey = keyof typeof USERS;
