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
