import { describe, expect, it } from "vitest";
import { databaseUrl, runtimeConfig } from "../src/config.js";

const production = {
  NODE_ENV: "production", DATABASE_URL: "postgresql://fixture:fixture@localhost/kitloop_test",
  APP_ORIGIN: "https://kitloop.test", SESSION_CSRF_SECRET: "synthetic-config-secret-at-least-32-characters",
};

describe("Runtime configuration", () => {
  it("accepts HTTPS production and Cloud SQL Unix-socket URLs", () => {
    expect(runtimeConfig({ ...production, PORT: "8087" })).toEqual({ port: 8087 });
    expect(databaseUrl({ DATABASE_URL: "postgresql://fixture:fixture@localhost/db?host=/cloudsql/project:region:instance" }))
      .toContain("/cloudsql/");
  });
  it("preserves development defaults and rejects invalid ports/session durations", () => {
    expect(runtimeConfig({})).toEqual({ port: 3000 });
    for (const PORT of ["0", "65536", "3e3", "NaN", ""]) {
      expect(() => runtimeConfig({ PORT })).toThrow("PORT");
    }
    for (const SESSION_TTL_HOURS of ["0", "-1", "Infinity", "bad"]) {
      expect(() => runtimeConfig({ SESSION_TTL_HOURS })).toThrow("SESSION_TTL_HOURS");
    }
  });
  it("rejects missing/invalid production secrets and database configuration without echoing values", () => {
    for (const DATABASE_URL of [undefined, "https://private.invalid/secret", "postgresql://localhost"]) {
      expect(() => runtimeConfig({ ...production, DATABASE_URL })).toThrow("DATABASE_URL");
    }
    expect(() => runtimeConfig({ ...production, SESSION_CSRF_SECRET: "short" })).toThrow("SESSION_CSRF_SECRET");
  });
  it("requires an exact HTTPS origin without credentials, path or query", () => {
    for (const APP_ORIGIN of [undefined, "http://localhost:8080", "https://kitloop.test/", "https://private:secret@kitloop.test", "https://kitloop.test?x=1"]) {
      expect(() => runtimeConfig({ ...production, APP_ORIGIN })).toThrow("APP_ORIGIN");
    }
  });
});
