import request from "supertest";
import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";
import { checkoutRequest } from "../src/checkout.js";

const origin = "http://localhost:5173";
const password = "synthetic-checkout-password";
const assetIds: string[] = [];
const userIds: string[] = [];
type Session = { id: string; username: string; cookie: string; csrf: string };
let borrower: Session, other: Session, custodian: Session, foreignCustodian: Session;

async function session(role: Role) {
  const user = await prisma.user.create({ data: { username: randomUUID(), role, passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  const result = await request(app).post("/api/auth/login").set("Origin", origin).send({ username: user.username, password });
  expect(result.status).toBe(200);
  return { id: user.id, username: user.username, cookie: result.headers["set-cookie"][0].split(";")[0], csrf: result.headers["x-csrf-token"] };
}
async function fixture() {
  const assetId = `CHECKOUT-${randomUUID()}`;
  assetIds.push(assetId);
  await prisma.asset.create({ data: { assetId, name: "Checkout camera", category: "Camera", description: "Synthetic",
    custodianAssets: { create: { custodianId: custodian.id } } } });
  const result = await request(app).post("/api/requests").set("Origin", origin)
    .set("Cookie", borrower.cookie).set("X-CSRF-Token", borrower.csrf).send({ assetId });
  expect(result.status).toBe(201);
  return { assetId, requestId: result.body.id as string };
}
const futureDue = () => new Date(Date.now() + 86_400_000).toISOString();
function checkout(who: Session, requestId: string, assetId: string, extra: object = {}) {
  return request(app).post(`/api/requests/${requestId}/checkout`).set("Cookie", who.cookie)
    .set("Origin", origin).set("X-CSRF-Token", who.csrf).send({ assetId, dueAt: futureDue(), ...extra });
}
async function assertUntouched(requestId: string, assetId: string) {
  expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");
  expect(await prisma.loan.count({ where: { assetId } })).toBe(0);
}

beforeAll(async () => {
  borrower = await session(Role.BORROWER); other = await session(Role.BORROWER);
  custodian = await session(Role.CUSTODIAN); foreignCustodian = await session(Role.CUSTODIAN);
});
afterAll(async () => {
  await prisma.loan.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.borrowRequest.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.custodianAsset.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.asset.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("F-04 Custodian Checkout Workflow (PostgreSQL)", () => {
  it("shows only scoped pending requests with borrower and equipment details", async () => {
    const { requestId, assetId } = await fixture();
    const response = await request(app).get("/api/requests/pending").set("Cookie", custodian.cookie);
    expect(response.status).toBe(200);
    expect(response.body.find((item: { id: string }) => item.id === requestId)).toMatchObject({
      status: "PENDING", asset: { assetId, name: "Checkout camera" }, borrower: { id: borrower.id, username: borrower.username },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|sessions/);
    const foreign = await request(app).get("/api/requests/pending").set("Cookie", foreignCustodian.cookie);
    expect(foreign.body).toEqual([]);
    expect((await request(app).get("/api/requests/pending").set("Cookie", borrower.cookie)).status).toBe(403);
  });

  it("creates exactly one ACTIVE loan, checks out the request, and immediately updates all reads", async () => {
    const { requestId, assetId } = await fixture();
    const dueAt = futureDue();
    const before = Date.now();
    const result = await checkout(custodian, requestId, assetId, { dueAt });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ requestId, assetId, borrowerId: borrower.id, checkoutCustodianId: custodian.id, dueAt, status: "ACTIVE", returnedAt: null });
    const checkedOutAt = new Date(result.body.checkedOutAt).getTime();
    expect(checkedOutAt).toBeGreaterThanOrEqual(before);
    expect(checkedOutAt).toBeLessThanOrEqual(Date.now());
    expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("CHECKED_OUT");
    expect(await prisma.loan.count({ where: { assetId, returnedAt: null } })).toBe(1);
    const stored = await prisma.loan.findUniqueOrThrow({ where: { requestId } });
    expect(stored.dueAt.toISOString()).toBe(dueAt);
    expect(stored.checkedOutAt.toISOString()).toBe(result.body.checkedOutAt);
    const catalog = await request(app).get("/api/assets").set("Cookie", borrower.cookie);
    expect(catalog.body.find((item: { assetId: string }) => item.assetId === assetId).available).toBe(false);
    const queue = await request(app).get("/api/requests/pending").set("Cookie", custodian.cookie);
    expect(queue.body.some((item: { id: string }) => item.id === requestId)).toBe(false);
    for (const [path, who] of [["/api/loans/active", custodian], ["/api/loans/mine", borrower]] as const) {
      const list = await request(app).get(path).set("Cookie", who.cookie);
      expect(list.body.find((item: { id: string }) => item.id === result.body.id)).toMatchObject({ status: "ACTIVE", requestId });
    }
    const detail = await request(app).get(`/api/loans/${result.body.id}`).set("Cookie", custodian.cookie);
    expect(detail.body.status).toBe("ACTIVE");
    expect((await request(app).get(`/api/loans/${result.body.id}`).set("Cookie", foreignCustodian.cookie)).status).toBe(404);
  });

  it("rejects invalid due dates and supplied status/identity without partial changes", async () => {
    const { requestId, assetId } = await fixture();
    for (const extra of [{ dueAt: null }, { dueAt: 0 }, { dueAt: "" }, { dueAt: "2030-02-30T00:00:00Z" },
      { dueAt: new Date(Date.now() - 1000).toISOString() }, { status: "ACTIVE" }, { borrowerId: other.id }, { checkedOutAt: futureDue() }]) {
      const result = await checkout(custodian, requestId, assetId, extra);
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("VALIDATION_ERROR");
      await assertUntouched(requestId, assetId);
    }
  });

  it("checks due date against checkout time inside the transaction, not an earlier form timestamp", async () => {
    const { requestId, assetId } = await fixture();
    const dueAt = new Date(Date.now() + 60_000);
    await expect(checkoutRequest(custodian.id, requestId, { assetId, dueAt }, () => new Date(dueAt.getTime() + 1)))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await assertUntouched(requestId, assetId);
  });

  it("rejects missing sessions, wrong role, CSRF failures and foreign-scope requests", async () => {
    const { requestId, assetId } = await fixture();
    expect((await request(app).post(`/api/requests/${requestId}/checkout`).send({ assetId, dueAt: futureDue() })).status).toBe(401);
    expect((await checkout(borrower, requestId, assetId)).status).toBe(403);
    expect((await checkout(foreignCustodian, requestId, assetId)).status).toBe(404);
    const csrf = await request(app).post(`/api/requests/${requestId}/checkout`).set("Origin", origin)
      .set("Cookie", custodian.cookie).send({ assetId, dueAt: futureDue() });
    expect(csrf.status).toBe(403);
    const foreignOrigin = await request(app).post(`/api/requests/${requestId}/checkout`).set("Origin", "https://foreign.invalid")
      .set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf).send({ assetId, dueAt: futureDue() });
    expect(foreignOrigin.status).toBe(403);
    await assertUntouched(requestId, assetId);
  });

  it("rejects a missing request, malformed ID, asset mismatch, and retired equipment", async () => {
    const { requestId, assetId } = await fixture();
    expect((await checkout(custodian, randomUUID(), assetId)).status).toBe(404);
    expect((await checkout(custodian, "not-a-uuid", assetId)).status).toBe(404);
    expect((await checkout(custodian, requestId, "ANOTHER-ASSET")).status).toBe(409);
    await assertUntouched(requestId, assetId);
    await prisma.asset.update({ where: { assetId }, data: { retiredAt: new Date() } });
    expect((await checkout(custodian, requestId, assetId)).status).toBe(409);
    await assertUntouched(requestId, assetId);
  });

  it("rejects repeated and concurrent checkout of the same request", async () => {
    const { requestId, assetId } = await fixture();
    const results = await Promise.all([checkout(custodian, requestId, assetId), checkout(custodian, requestId, assetId)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const stored = await prisma.loan.findUniqueOrThrow({ where: { requestId } });
    expect((await checkout(custodian, requestId, assetId)).status).toBe(409);
    expect(await prisma.loan.count({ where: { assetId } })).toBe(1);
    expect(await prisma.loan.findUnique({ where: { requestId } })).toEqual(stored);
  });

  it("allows one winner across different pending requests and custodians for one exclusive asset", async () => {
    const { requestId, assetId } = await fixture();
    await prisma.custodianAsset.create({ data: { assetId, custodianId: foreignCustodian.id } });
    const competing = await prisma.borrowRequest.create({ data: { assetId, borrowerId: other.id } });
    const results = await Promise.all([checkout(custodian, requestId, assetId), checkout(foreignCustodian, competing.id, assetId)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const loserId = results[0].status === 409 ? requestId : competing.id;
    expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: loserId } })).status).toBe("PENDING");
    expect(await prisma.loan.count({ where: { assetId, returnedAt: null } })).toBe(1);
    expect((await checkout(custodian, loserId, assetId)).status).toBe(409);
    await expect(prisma.loan.create({ data: { requestId: loserId, assetId, borrowerId: other.id,
      checkoutCustodianId: custodian.id, dueAt: new Date(futureDue()) } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("does not expose a loan status mutation API to borrowers", async () => {
    const { requestId, assetId } = await fixture();
    const created = await checkout(custodian, requestId, assetId);
    const result = await request(app).patch(`/api/loans/${created.body.id}`).set("Cookie", borrower.cookie)
      .set("Origin", origin).set("X-CSRF-Token", borrower.csrf).send({ status: "RETURNED", returnedAt: new Date().toISOString() });
    expect(result.status).toBe(404);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: created.body.id } })).returnedAt).toBeNull();
  });

  it("preserves historic rows when the enum migration renames FULFILLED to CHECKED_OUT", async () => {
    const migration = await readFile(new URL("../prisma/migrations/20261103100000_checked_out_request_status/migration.sql", import.meta.url), "utf8");
    const schema = `migration_test_${randomUUID().replaceAll("-", "_")}`;
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe('CREATE TYPE "RequestStatus" AS ENUM (\'PENDING\', \'FULFILLED\')');
      await tx.$executeRawUnsafe('CREATE TABLE history (id TEXT PRIMARY KEY, status "RequestStatus", loan_ref TEXT)');
      await tx.$executeRawUnsafe("INSERT INTO history VALUES ('old-request', 'FULFILLED', 'old-loan'), ('waiting', 'PENDING', NULL)");
      await tx.$executeRawUnsafe(migration);
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; loan_ref: string | null }>>`SELECT id, status::text, loan_ref FROM history ORDER BY id`;
      expect(rows).toEqual([{ id: "old-request", status: "CHECKED_OUT", loan_ref: "old-loan" }, { id: "waiting", status: "PENDING", loan_ref: null }]);
      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  });
});
