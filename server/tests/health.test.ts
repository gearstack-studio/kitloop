import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";

describe("GET /api/health", () => {
  it("returns the service health response", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "KitLoop API",
    });
  });
});

describe("GET /api/ready", () => {
  it("returns 200 when PostgreSQL responds", async () => {
    const query = vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([{ '?column?': 1 }]);
    try {
      const response = await request(app).get("/api/ready");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ready" });
      expect(query).toHaveBeenCalledOnce();
    } finally {
      query.mockRestore();
    }
  });

  it("returns a generic 503 when PostgreSQL is unavailable", async () => {
    const query = vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("sensitive database detail"));
    try {
      const response = await request(app).get("/api/ready");
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: "unavailable" });
      expect(response.text).not.toContain("sensitive database detail");
    } finally {
      query.mockRestore();
    }
  });
});

describe("Public release metadata and security headers", () => {
  it("returns the full build commit without authentication and prevents caching", async () => {
    const commit = "0123456789abcdef0123456789abcdef01234567";
    vi.stubEnv("BUILD_COMMIT_SHA", commit);
    try {
      const response = await request(app).get("/api/version");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ commit });
      expect(response.headers["cache-control"]).toBe("no-store");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not disclose invalid build metadata", async () => {
    vi.stubEnv("BUILD_COMMIT_SHA", "invalid-build-value");
    try {
      const response = await request(app).get("/api/version");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ commit: null });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("sets browser security headers and omits the framework banner", async () => {
    const { headers } = await request(app).head("/api/health");
    expect(headers["content-security-policy"]).toContain("script-src 'self'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toBe("max-age=31536000");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
