import request from "supertest";
import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { COOKIE_NAME } from "../src/auth.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";

// FEAT-02 catalog tests: TEST-FEAT-02-01..03, 05..12 (see docs/sprints/sprint-1/FEAT-02-equipment-catalog.md).
const origin = "http://localhost:5173";
const password = "synthetic-test-password";
const suffix = randomUUID().slice(0, 8);
const ids = {
  alpha: `CAT-${suffix}-9`, // no loan
  bravo: `CAT-${suffix}-8`, // only a returned loan
  charlie: `CAT-${suffix}-7`, // active loan
  delta: `CAT-${suffix}-6`, // only a pending request
  retired: `CAT-${suffix}-5`,
  zetaTwo: `CAT-${suffix}-2`, // same name as zetaOne, inserted first
  zetaOne: `CAT-${suffix}-1`,
  free: `CAT-${suffix}-F`, // checkout agreement: available
  held: `CAT-${suffix}-H`, // checkout agreement: active loan
};
const names = {
  alpha: `Alpha ${suffix}`,
  bravo: `Bravo ${suffix}`,
  charlie: `Charlie ${suffix}`,
  delta: `Delta ${suffix}`,
  retired: `Echo ${suffix}`,
  zeta: `Zeta ${suffix}`,
  free: `Yankee ${suffix}`,
  held: `Xray ${suffix}`,
};
const fixtureIds = Object.values(ids);

let borrowerId: string;
let otherBorrowerId: string;
let custodianId: string;
const requestIds: string[] = [];

async function login(username: string) {
  const response = await request(app).post("/api/auth/login").set("Origin", origin).send({ username, password });
  expect(response.status).toBe(200);
  const cookie = (response.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
  return { cookie, csrf: response.headers["x-csrf-token"] as string };
}

async function pendingRequest(assetId: string, userId = borrowerId) {
  const created = await prisma.borrowRequest.create({ data: { assetId, borrowerId: userId } });
  requestIds.push(created.id);
  return created;
}

async function loanFor(assetId: string, returned: boolean) {
  const loanRequest = await pendingRequest(assetId, otherBorrowerId);
  await prisma.borrowRequest.update({ where: { id: loanRequest.id }, data: { status: "FULFILLED" } });
  return prisma.loan.create({ data: {
    requestId: loanRequest.id,
    assetId,
    borrowerId: otherBorrowerId,
    checkoutCustodianId: custodianId,
    checkedOutAt: new Date(Date.now() - 3_600_000),
    dueAt: new Date(Date.now() + 86_400_000),
    ...(returned ? { returnedAt: new Date(), returnCustodianId: custodianId } : {}),
  } });
}

type Item = { assetId: string; name: string; category: string; description: string; available: boolean; [key: string]: unknown };
const fixtureItems = (body: Item[]) => body.filter(item => fixtureIds.includes(item.assetId));

beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  const [borrower, otherBorrower, custodian] = await Promise.all([
    prisma.user.create({ data: { username: `cat-borrower-${suffix}`, passwordHash, role: Role.BORROWER } }),
    prisma.user.create({ data: { username: `cat-other-${suffix}`, passwordHash, role: Role.BORROWER } }),
    prisma.user.create({ data: { username: `cat-custodian-${suffix}`, passwordHash, role: Role.CUSTODIAN } }),
  ]);
  borrowerId = borrower.id;
  otherBorrowerId = otherBorrower.id;
  custodianId = custodian.id;

  const asset = (assetId: string, name: string, extra: object = {}) => ({
    assetId, name, category: "Test", description: `Synthetic ${assetId}`, ...extra,
  });
  // zetaTwo is inserted before zetaOne so database insertion order differs from the required order.
  for (const data of [
    asset(ids.zetaTwo, names.zeta), asset(ids.zetaOne, names.zeta),
    asset(ids.free, names.free), asset(ids.held, names.held),
    asset(ids.delta, names.delta), asset(ids.charlie, names.charlie),
    asset(ids.bravo, names.bravo), asset(ids.alpha, names.alpha),
    asset(ids.retired, names.retired, { retiredAt: new Date() }),
  ]) await prisma.asset.create({ data });

  await loanFor(ids.bravo, true);
  await loanFor(ids.charlie, false);
  await pendingRequest(ids.delta);
  await prisma.custodianAsset.createMany({ data: [
    { custodianId, assetId: ids.free }, { custodianId, assetId: ids.held },
  ] });
  await loanFor(ids.held, false);
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: [borrowerId, otherBorrowerId, custodianId] } } });
  await prisma.loan.deleteMany({ where: { assetId: { in: fixtureIds } } });
  await prisma.borrowRequest.deleteMany({ where: { assetId: { in: fixtureIds } } });
  await prisma.custodianAsset.deleteMany({ where: { assetId: { in: fixtureIds } } });
  await prisma.asset.deleteMany({ where: { assetId: { in: fixtureIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [borrowerId, otherBorrowerId, custodianId] } } });
  await prisma.$disconnect();
});

describe("FEAT-02 equipment catalog API", () => {
  it("TEST-FEAT-02-01 returns stored non-retired assets to both roles (retrieval)", async () => {
    for (const username of [`cat-borrower-${suffix}`, `cat-custodian-${suffix}`]) {
      const { cookie } = await login(username);
      const response = await request(app).get("/api/assets").set("Cookie", cookie);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const items = fixtureItems(response.body);
      expect(items.map((item: { assetId: string }) => item.assetId)).not.toContain(ids.retired);
      expect(items).toHaveLength(fixtureIds.length - 1);
      const stored = await prisma.asset.findMany({ where: { assetId: { in: fixtureIds }, retiredAt: null } });
      for (const row of stored) {
        const item = items.find((candidate: { assetId: string }) => candidate.assetId === row.assetId);
        expect(item).toMatchObject({ assetId: row.assetId, name: row.name, category: row.category, description: row.description });
      }
    }
  });

  it("TEST-FEAT-02-02 exposes exactly the five documented fields and nothing internal (response shape)", async () => {
    const borrower = await login(`cat-borrower-${suffix}`);
    const custodian = await login(`cat-custodian-${suffix}`);
    const asBorrower = await request(app).get("/api/assets").set("Cookie", borrower.cookie);
    const asCustodian = await request(app).get("/api/assets").set("Cookie", custodian.cookie);
    for (const item of fixtureItems(asBorrower.body)) {
      expect(Object.keys(item).sort()).toEqual(["assetId", "available", "category", "description", "name"]);
      expect(typeof item.available).toBe("boolean");
      for (const key of ["assetId", "name", "category", "description"]) expect(typeof item[key]).toBe("string");
    }
    const serialized = JSON.stringify(asBorrower.body);
    for (const forbidden of ["retiredAt", "loans", "requests", "custodianAssets", "borrowerId", "dueAt", "passwordHash"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(asCustodian.body).toEqual(asBorrower.body);
    expect(asBorrower.headers["cache-control"]).toContain("no-store");
  });

  it("TEST-FEAT-02-03 derives availability from loan state, not from requests (availability)", async () => {
    const { cookie } = await login(`cat-borrower-${suffix}`);
    const response = await request(app).get("/api/assets").set("Cookie", cookie);
    const availability = Object.fromEntries(fixtureItems(response.body).map((item: { assetId: string; available: boolean }) => [item.assetId, item.available]));
    expect(availability[ids.alpha]).toBe(true); // no loan
    expect(availability[ids.bravo]).toBe(true); // returned loan only
    expect(availability[ids.charlie]).toBe(false); // active loan
    expect(availability[ids.delta]).toBe(true); // pending request does not reserve
    expect(availability[ids.free]).toBe(true);
    expect(availability[ids.held]).toBe(false);
  });

  it("TEST-FEAT-02-05 agrees with checkout validation for the same assets (FR-05)", async () => {
    const custodian = await login(`cat-custodian-${suffix}`);
    const listed = await request(app).get("/api/assets").set("Cookie", custodian.cookie);
    const byId = Object.fromEntries(listed.body.map((item: { assetId: string; available: boolean }) => [item.assetId, item.available]));
    expect(byId[ids.free]).toBe(true);
    expect(byId[ids.held]).toBe(false);
    const dueAt = new Date(Date.now() + 86_400_000).toISOString();
    const queued = await pendingRequest(ids.held);
    const rejected = await request(app).post(`/api/requests/${queued.id}/checkout`).set("Origin", origin)
      .set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf).send({ assetId: ids.held, dueAt });
    expect(rejected.status).toBe(409);
    expect(await prisma.loan.count({ where: { assetId: ids.held, returnedAt: null } })).toBe(1);
    const free = await pendingRequest(ids.free);
    const accepted = await request(app).post(`/api/requests/${free.id}/checkout`).set("Origin", origin)
      .set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf).send({ assetId: ids.free, dueAt });
    expect(accepted.status).toBe(201);
  });

  it("TEST-FEAT-02-06 rejects missing, forged, expired and revoked sessions with 401", async () => {
    const anonymous = await request(app).get("/api/assets");
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    const forged = await request(app).get("/api/assets").set("Cookie", `${COOKIE_NAME}=${"a".repeat(43)}`);
    expect(forged.status).toBe(401);
    const expired = await login(`cat-borrower-${suffix}`);
    await prisma.session.updateMany({ where: { userId: borrowerId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get("/api/assets").set("Cookie", expired.cookie)).status).toBe(401);
    const revoked = await login(`cat-borrower-${suffix}`);
    await request(app).post("/api/auth/logout").set("Origin", origin).set("Cookie", revoked.cookie).set("X-CSRF-Token", revoked.csrf);
    const afterLogout = await request(app).get("/api/assets").set("Cookie", revoked.cookie);
    expect(afterLogout.status).toBe(401);
    expect(JSON.stringify(afterLogout.body)).not.toContain(ids.alpha);
  });

  it("TEST-FEAT-02-07 orders by name then assetId, repeatably (ordering)", async () => {
    const { cookie } = await login(`cat-custodian-${suffix}`);
    const expected = [ids.alpha, ids.bravo, ids.charlie, ids.delta, ids.held, ids.free, ids.zetaOne, ids.zetaTwo];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app).get("/api/assets").set("Cookie", cookie);
      expect(fixtureItems(response.body).map((item: { assetId: string }) => item.assetId)).toEqual(expected);
    }
  });

  it("TEST-FEAT-02-08 keeps Asset IDs unique in the database and seed data", async () => {
    await expect(prisma.asset.create({ data: { assetId: ids.alpha, name: "Duplicate", category: "Test", description: "Duplicate" } }))
      .rejects.toMatchObject({ code: "P2002" });
    const { seedAssets } = await import("../prisma/seed-data.js");
    const seedIds = seedAssets.map((asset: { assetId: string }) => asset.assetId);
    expect(new Set(seedIds).size).toBe(seedIds.length);
    const byName = new Map<string, number>();
    for (const asset of seedAssets as Array<{ name: string }>) byName.set(asset.name, (byName.get(asset.name) ?? 0) + 1);
    expect([...byName.values()].some(count => count >= 2)).toBe(true);
  });

  it("TEST-FEAT-02-09 leaves retired assets out of the catalog", async () => {
    const { cookie } = await login(`cat-borrower-${suffix}`);
    const response = await request(app).get("/api/assets").set("Cookie", cookie);
    expect(response.body.map((item: { assetId: string }) => item.assetId)).not.toContain(ids.retired);
  });

  it("TEST-FEAT-02-10 returns 200 and an empty array when there are no assets", async () => {
    const { cookie } = await login(`cat-borrower-${suffix}`);
    const spy = vi.spyOn(prisma.asset, "findMany").mockResolvedValueOnce([]);
    try {
      const response = await request(app).get("/api/assets").set("Cookie", cookie);
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("TEST-FEAT-02-11 returns a generic 500 for an unexpected failure", async () => {
    const { cookie } = await login(`cat-borrower-${suffix}`);
    const spy = vi.spyOn(prisma.asset, "findMany").mockRejectedValueOnce(new Error("sensitive database detail"));
    try {
      const response = await request(app).get("/api/assets").set("Cookie", cookie);
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
      expect(JSON.stringify(response.body)).not.toContain("sensitive");
    } finally {
      spy.mockRestore();
    }
  });

  it("TEST-FEAT-02-12 does not change any record and needs no CSRF token", async () => {
    const { cookie } = await login(`cat-borrower-${suffix}`);
    const count = async () => [await prisma.asset.count(), await prisma.loan.count(), await prisma.borrowRequest.count(), await prisma.user.count()];
    const before = await count();
    const plain = await request(app).get("/api/assets").set("Cookie", cookie);
    const withHeader = await request(app).get("/api/assets").set("Cookie", cookie).set("X-CSRF-Token", "ignored");
    expect(plain.status).toBe(200);
    expect(withHeader.status).toBe(200);
    expect(await count()).toEqual(before);
  });
});
