import express from "express";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveSpa } from "../src/spa.js";

const app = express();
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "kitloop-spa-"));
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "index.html"), '<div id="root">SPA fixture</div>');
  await writeFile(path.join(directory, "assets", "app.js"), "console.log('fixture')");
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  serveSpa(app, directory);
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe("Single-origin SPA hosting", () => {
  it("serves root and deep links with revalidation", async () => {
    for (const route of ["/", "/requests", "/loans/history"]) {
      const result = await request(app).get(route).set("Accept", "text/html");
      expect(result.status).toBe(200);
      expect(result.text).toContain("SPA fixture");
      expect(result.headers["cache-control"]).toBe("no-cache");
    }
  });
  it("serves bundled assets and keeps missing assets/API routes out of the SPA fallback", async () => {
    expect((await request(app).get("/assets/app.js")).status).toBe(200);
    for (const route of ["/assets/missing.js", "/api", "/api/unknown"]) {
      const result = await request(app).get(route);
      expect(result.status).toBe(404);
      expect(result.text).not.toContain("SPA fixture");
    }
    expect((await request(app).get("/api/health")).body).toEqual({ status: "ok" });
  });
});
