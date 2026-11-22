import request from "supertest";
import { Prisma, PrismaClient, Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";

// UAT-E01 (#61): request lifecycle PENDING -> CHECKED_OUT | DECLINED | CANCELLED | EXPIRED.
const origin = "http://localhost:5173";
const password = "synthetic-lifecycle-password";
const assetIds: string[] = [];
const userIds: string[] = [];
type Session = { id: string; username: string; cookie: string; csrf: string };
let borrowerA: Session, borrowerB: Session, custodian: Session, foreignCustodian: Session;

async function session(role: Role): Promise<Session> {
  const user = await prisma.user.create({ data: { username: randomUUID(), role, passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  const result = await request(app).post("/api/auth/login").set("Origin", origin).send({ username: user.username, password });
  expect(result.status).toBe(200);
  return { id: user.id, username: user.username, cookie: result.headers["set-cookie"][0].split(";")[0], csrf: result.headers["x-csrf-token"] };
}
async function asset() {
  const assetId = `LIFECYCLE-${randomUUID()}`;
  assetIds.push(assetId);
  await prisma.asset.create({ data: { assetId, name: "Lifecycle camera", category: "Camera", description: "Synthetic",
    custodianAssets: { create: { custodianId: custodian.id } } } });
  return assetId;
}
function post(who: Session, path: string, body: object = {}) {
  return request(app).post(path).set("Cookie", who.cookie).set("Origin", origin).set("X-CSRF-Token", who.csrf).send(body);
}
async function submit(who: Session, assetId: string) {
  const result = await post(who, "/api/requests", { assetId });
  expect(result.status).toBe(201);
  expect(result.body.status).toBe("PENDING");
  return result.body.id as string;
}
const futureDue = () => new Date(Date.now() + 86_400_000).toISOString();
const checkout = (who: Session, requestId: string, assetId: string) =>
  post(who, `/api/requests/${requestId}/checkout`, { assetId, dueAt: futureDue() });
const cancel = (who: Session, requestId: string, body: object = {}) => post(who, `/api/requests/${requestId}/cancel`, body);
const decline = (who: Session, requestId: string, body: object = { reason: "EQUIPMENT_UNAVAILABLE" }) =>
  post(who, `/api/requests/${requestId}/decline`, body);
const stored = (id: string) => prisma.borrowRequest.findUniqueOrThrow({ where: { id } });
async function expectPending(id: string) {
  expect(await stored(id)).toMatchObject({ status: "PENDING", closedAt: null, closeReason: null, closedById: null });
}
async function history(who: Session, id: string) {
  const list = await request(app).get("/api/requests/mine").set("Cookie", who.cookie);
  expect(list.status).toBe(200);
  return list.body.find((item: { id: string }) => item.id === id);
}
async function queueIds(who: Session) {
  const queue = await request(app).get("/api/requests/pending").set("Cookie", who.cookie);
  expect(queue.status).toBe(200);
  return queue.body.map((item: { id: string }) => item.id) as string[];
}

beforeAll(async () => {
  borrowerA = await session(Role.BORROWER); borrowerB = await session(Role.BORROWER);
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

describe("UAT-E01 competing requests are closed by checkout", () => {
  it("declines every competing PENDING request with a reason in the checkout transaction, keeping history", async () => {
    const assetId = await asset();
    const otherAsset = await asset();
    const a = await submit(borrowerA, assetId);
    const b = await submit(borrowerB, assetId);
    const unrelated = await submit(borrowerB, otherAsset);
    await expectPending(a); await expectPending(b);
    expect(await queueIds(custodian)).toEqual(expect.arrayContaining([a, b, unrelated]));

    const result = await checkout(custodian, a, assetId);
    expect(result.status).toBe(201);
    expect(await stored(a)).toMatchObject({ status: "CHECKED_OUT", closedAt: null, closeReason: null });
    expect(await prisma.loan.count({ where: { assetId, returnedAt: null } })).toBe(1);
    const declined = await stored(b);
    expect(declined).toMatchObject({ status: "DECLINED", closeReason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER", closedById: custodian.id });
    expect(declined.closedAt?.toISOString()).toBe(result.body.checkedOutAt);
    expect(declined.submittedAt.getTime()).toBeLessThan(declined.closedAt!.getTime() + 1);
    await expectPending(unrelated);

    expect(await history(borrowerB, b)).toMatchObject({ status: "DECLINED", closeReason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER",
      closedAt: result.body.checkedOutAt, asset: { assetId } });
    const queue = await queueIds(custodian);
    expect(queue).not.toContain(a); expect(queue).not.toContain(b); expect(queue).toContain(unrelated);
    const terminal = await checkout(custodian, b, assetId);
    expect(terminal.status).toBe(409);
    expect(terminal.body.error.code).toBe("REQUEST_NOT_PENDING");
    expect(await prisma.loan.count({ where: { assetId } })).toBe(1);
  });

  it("rolls back the checkout, the loan and every decline when a competing decline fails", async () => {
    const assetId = await asset();
    const a = await submit(borrowerA, assetId);
    const b = await submit(borrowerB, assetId);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_test_decline() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."assetId" = '${assetId}' AND NEW."status"::text = 'DECLINED' THEN RAISE EXCEPTION 'synthetic decline failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER reject_test_decline BEFORE UPDATE ON "BorrowRequest" FOR EACH ROW EXECUTE FUNCTION reject_test_decline()');
    try {
      const result = await checkout(custodian, a, assetId);
      expect(result.status).toBe(500);
      expect(result.body.error.message).toBe("An unexpected error occurred");
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER reject_test_decline ON "BorrowRequest"');
      await prisma.$executeRawUnsafe("DROP FUNCTION reject_test_decline()");
    }
    await expectPending(a); await expectPending(b);
    expect(await prisma.loan.count({ where: { assetId } })).toBe(0);
    const retried = await checkout(custodian, a, assetId);
    expect(retried.status).toBe(201);
    expect((await stored(b)).status).toBe("DECLINED");
  });

  it("gives concurrent checkouts of competing requests exactly one winner, one loan, and a declined loser", async () => {
    const assetId = await asset();
    const a = await submit(borrowerA, assetId);
    const b = await submit(borrowerB, assetId);
    const results = await Promise.all([checkout(custodian, a, assetId), checkout(custodian, b, assetId)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const [winner, loser] = results[0].status === 201 ? [a, b] : [b, a];
    expect((await stored(winner)).status).toBe("CHECKED_OUT");
    expect(await stored(loser)).toMatchObject({ status: "DECLINED", closeReason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER" });
    expect(await prisma.loan.count({ where: { assetId } })).toBe(1);
    expect((await prisma.loan.findFirstOrThrow({ where: { assetId } })).requestId).toBe(winner);
  });
});

describe("UAT-E01 borrower cancellation", () => {
  it("lets a borrower cancel their own PENDING request once, keeping it in history and out of the queue", async () => {
    const assetId = await asset();
    const id = await submit(borrowerA, assetId);
    const result = await cancel(borrowerA, id);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id, status: "CANCELLED", closeReason: "CANCELLED_BY_BORROWER", asset: { assetId } });
    expect(await stored(id)).toMatchObject({ status: "CANCELLED", closeReason: "CANCELLED_BY_BORROWER", closedById: borrowerA.id });
    expect((await stored(id)).closedAt).toBeInstanceOf(Date);
    expect(await history(borrowerA, id)).toMatchObject({ status: "CANCELLED", closeReason: "CANCELLED_BY_BORROWER" });
    expect(await queueIds(custodian)).not.toContain(id);
    const again = await cancel(borrowerA, id);
    expect(again.status).toBe(409); expect(again.body.error.code).toBe("REQUEST_NOT_PENDING");
    expect((await checkout(custodian, id, assetId)).status).toBe(409);
    expect((await decline(custodian, id)).status).toBe(409);
    expect(await prisma.loan.count({ where: { assetId } })).toBe(0);
  });

  it("rejects cancelling another borrower's request, custodians, missing sessions, CSRF failures and status payloads", async () => {
    const assetId = await asset();
    const id = await submit(borrowerA, assetId);
    const foreign = await cancel(borrowerB, id);
    expect(foreign.status).toBe(404); expect(JSON.stringify(foreign.body)).not.toContain(assetId);
    expect((await cancel(custodian, id)).status).toBe(403);
    expect((await request(app).post(`/api/requests/${id}/cancel`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/requests/${id}/cancel`).set("Cookie", borrowerA.cookie).set("Origin", origin).send({})).status).toBe(403);
    expect((await request(app).post(`/api/requests/${id}/cancel`).set("Cookie", borrowerA.cookie).set("Origin", "https://foreign.invalid")
      .set("X-CSRF-Token", borrowerA.csrf).send({})).status).toBe(403);
    for (const body of [{ status: "CHECKED_OUT" }, { closeReason: "OTHER" }, { reason: "OTHER" }]) {
      const invalid = await cancel(borrowerA, id, body);
      expect(invalid.status).toBe(400); expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect((await cancel(borrowerA, randomUUID())).status).toBe(404);
    expect((await cancel(borrowerA, "not-a-uuid")).status).toBe(404);
    expect((await post(borrowerA, `/api/requests/${id}/expire`)).status).toBe(404);
    const generic = await request(app).patch(`/api/requests/${id}`).set("Cookie", borrowerA.cookie).set("Origin", origin)
      .set("X-CSRF-Token", borrowerA.csrf).send({ status: "CANCELLED" });
    expect(generic.status).toBe(404);
    await expectPending(id);
  });
});

describe("UAT-E01 custodian decline", () => {
  it("lets an assigned custodian decline a PENDING request with a valid reason", async () => {
    const assetId = await asset();
    const id = await submit(borrowerB, assetId);
    const result = await decline(custodian, id, { reason: "BORROWER_NOT_ELIGIBLE" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id, status: "DECLINED", closeReason: "BORROWER_NOT_ELIGIBLE", borrower: { id: borrowerB.id } });
    expect(await stored(id)).toMatchObject({ status: "DECLINED", closeReason: "BORROWER_NOT_ELIGIBLE", closedById: custodian.id });
    expect(await history(borrowerB, id)).toMatchObject({ status: "DECLINED", closeReason: "BORROWER_NOT_ELIGIBLE" });
    expect(await queueIds(custodian)).not.toContain(id);
    const again = await decline(custodian, id);
    expect(again.status).toBe(409); expect(again.body.error.code).toBe("REQUEST_NOT_PENDING");
    expect((await cancel(borrowerB, id)).status).toBe(409);
    const terminal = await checkout(custodian, id, assetId);
    expect(terminal.status).toBe(409); expect(terminal.body.error.code).toBe("REQUEST_NOT_PENDING");
  });

  it("requires a custodian-selectable reason and rejects unassigned custodians, borrowers and CSRF failures", async () => {
    const assetId = await asset();
    const id = await submit(borrowerB, assetId);
    for (const body of [{}, { reason: "" }, { reason: "because" }, { reason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER" },
      { reason: "CANCELLED_BY_BORROWER" }, { reason: "OTHER", status: "DECLINED" }, { reason: ["OTHER"] }]) {
      const invalid = await decline(custodian, id, body);
      expect(invalid.status).toBe(400); expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect((await decline(foreignCustodian, id)).status).toBe(404);
    expect((await decline(borrowerB, id)).status).toBe(403);
    expect((await request(app).post(`/api/requests/${id}/decline`).set("Cookie", custodian.cookie).set("Origin", origin)
      .send({ reason: "OTHER" })).status).toBe(403);
    expect((await decline(custodian, randomUUID())).status).toBe(404);
    await expectPending(id);
  });

  it("lets exactly one of a concurrent cancel and decline close the request", async () => {
    const assetId = await asset();
    const id = await submit(borrowerB, assetId);
    const results = await Promise.all([cancel(borrowerB, id), decline(custodian, id)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(["CANCELLED", "DECLINED"]).toContain((await stored(id)).status);
  });

  it("never leaves a loan for a request cancelled concurrently with its checkout", async () => {
    for (let round = 0; round < 3; round++) {
      const assetId = await asset();
      const id = await submit(borrowerA, assetId);
      const [checkedOut, cancelled] = await Promise.all([checkout(custodian, id, assetId), cancel(borrowerA, id)]);
      // Exactly one action wins; the other gets a 409 and changes nothing.
      expect([checkedOut.status === 201, cancelled.status === 200].filter(Boolean)).toHaveLength(1);
      expect(checkedOut.status === 201 ? cancelled.status : checkedOut.status).toBe(409);
      const final = await stored(id);
      expect(await prisma.loan.count({ where: { assetId } })).toBe(final.status === "CHECKED_OUT" ? 1 : 0);
      expect(["CHECKED_OUT", "CANCELLED"]).toContain(final.status);
    }
  });
});

describe("UAT-E01 requests after a terminal request", () => {
  it("allows a new request after a cancelled or declined one while the asset is available, and not while on loan", async () => {
    const assetId = await asset();
    const first = await submit(borrowerA, assetId);
    expect((await cancel(borrowerA, first)).status).toBe(200);
    const second = await submit(borrowerA, assetId);
    expect((await decline(custodian, second)).status).toBe(200);
    const third = await submit(borrowerA, assetId);
    expect(new Set([first, second, third]).size).toBe(3);
    const competing = await submit(borrowerB, assetId);
    expect((await checkout(custodian, third, assetId)).status).toBe(201);
    expect((await stored(competing)).status).toBe("DECLINED");
    const blocked = await post(borrowerB, "/api/requests", { assetId });
    expect(blocked.status).toBe(409); expect(blocked.body.error.code).toBe("ASSET_UNAVAILABLE");
  });

  it("does not expire old PENDING requests without an explicit expiry policy", async () => {
    const assetId = await asset();
    const id = await submit(borrowerA, assetId);
    await prisma.borrowRequest.update({ where: { id }, data: { submittedAt: new Date(Date.now() - 365 * 86_400_000) } });
    expect(await history(borrowerA, id)).toMatchObject({ status: "PENDING", closeReason: null });
    expect(await queueIds(custodian)).toContain(id);
  });
});

describe("UAT-E01 database lifecycle guards", () => {
  it("rejects inconsistent closure data and keeps one PENDING request per borrower and asset", async () => {
    const assetId = await asset();
    const id = await submit(borrowerA, assetId);
    for (const data of [
      { status: "DECLINED" }, { status: "CANCELLED", closedAt: new Date() }, { status: "EXPIRED", closeReason: "OTHER" },
      { closeReason: "OTHER", closedAt: new Date() }, { status: "CHECKED_OUT", closedAt: new Date(), closeReason: "OTHER" },
    ] as Prisma.BorrowRequestUpdateInput[]) {
      await expect(prisma.borrowRequest.update({ where: { id }, data })).rejects.toThrow(/BorrowRequest_closure_consistent/);
    }
    await expectPending(id);
    await expect(prisma.borrowRequest.create({ data: { borrowerId: borrowerA.id, assetId } })).rejects.toMatchObject({ code: "P2002" });
    expect((await cancel(borrowerA, id)).status).toBe(200);
    await expect(prisma.borrowRequest.create({ data: { borrowerId: borrowerA.id, assetId } })).resolves.toMatchObject({ status: "PENDING" });
  });

  it("migrates existing PENDING and CHECKED_OUT rows without rewriting them", async () => {
    const migration = await readFile(new URL("../prisma/migrations/20261121090000_request_lifecycle/migration.sql", import.meta.url), "utf8");
    const statements = migration.split(/;\s*$/m).map(sql => sql.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
    const schema = `migration_test_${randomUUID().replaceAll("-", "_")}`;
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("schema", schema);
    // A separate client pinned to a throwaway schema; statements autocommit so new enum labels become usable.
    const isolated = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    try {
      await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      for (const sql of [
        'CREATE TABLE "User" ("id" UUID PRIMARY KEY)',
        'CREATE TYPE "RequestStatus" AS ENUM (\'PENDING\', \'CHECKED_OUT\')',
        'CREATE TABLE "BorrowRequest" ("id" UUID PRIMARY KEY, "borrowerId" UUID NOT NULL REFERENCES "User"("id"), "assetId" TEXT NOT NULL, "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), "status" "RequestStatus" NOT NULL DEFAULT \'PENDING\')',
        'CREATE UNIQUE INDEX "BorrowRequest_one_pending_per_borrower_asset" ON "BorrowRequest" ("borrowerId", "assetId") WHERE "status" = \'PENDING\'',
        "INSERT INTO \"User\" VALUES ('00000000-0000-4000-8000-000000000001')",
        "INSERT INTO \"BorrowRequest\" (\"id\", \"borrowerId\", \"assetId\", \"submittedAt\", \"status\") VALUES " +
          "('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'CAM', '2026-11-01T00:00:00Z', 'CHECKED_OUT'), " +
          "('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'CAM', '2026-11-02T00:00:00Z', 'PENDING')",
      ]) await isolated.$executeRawUnsafe(sql);
      const before = await isolated.$queryRawUnsafe<unknown[]>('SELECT "id", "assetId", "submittedAt", "status"::text FROM "BorrowRequest" ORDER BY "id"');
      for (const sql of statements) await isolated.$executeRawUnsafe(sql);
      const after = await isolated.$queryRawUnsafe<Array<Record<string, unknown>>>(
        'SELECT "id", "assetId", "submittedAt", "status"::text, "closedAt", "closeReason"::text, "closedById" FROM "BorrowRequest" ORDER BY "id"');
      expect(after.map(({ closedAt: _a, closeReason: _r, closedById: _c, ...row }) => row)).toEqual(before);
      expect(after.every(row => row.closedAt === null && row.closeReason === null && row.closedById === null)).toBe(true);
      const labels = await isolated.$queryRawUnsafe<Array<{ label: string }>>(
        `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = 'RequestStatus' AND n.nspname = '${schema}' ORDER BY e.enumsortorder`);
      expect(labels.map(row => row.label)).toEqual(["PENDING", "CHECKED_OUT", "DECLINED", "CANCELLED", "EXPIRED"]);
      await expect(isolated.$executeRawUnsafe("UPDATE \"BorrowRequest\" SET \"status\" = 'DECLINED' WHERE \"id\" = '00000000-0000-4000-8000-0000000000a2'"))
        .rejects.toThrow(/BorrowRequest_closure_consistent/);
      await isolated.$executeRawUnsafe("UPDATE \"BorrowRequest\" SET \"status\" = 'DECLINED', \"closedAt\" = now(), \"closeReason\" = 'OTHER' WHERE \"id\" = '00000000-0000-4000-8000-0000000000a2'");
      await isolated.$executeRawUnsafe("INSERT INTO \"BorrowRequest\" (\"id\", \"borrowerId\", \"assetId\") VALUES ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001', 'CAM')");
      // The partial unique index still allows only one PENDING request per borrower and asset (23505).
      await expect(isolated.$executeRawUnsafe("INSERT INTO \"BorrowRequest\" (\"id\", \"borrowerId\", \"assetId\") VALUES ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-000000000001', 'CAM')"))
        .rejects.toMatchObject({ code: "P2010", meta: { code: "23505" } });
      const indexes = await isolated.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = '${schema}' AND indexname = 'BorrowRequest_one_pending_per_borrower_asset'`);
      expect(indexes).toHaveLength(1);
      expect(indexes[0].indexdef).toMatch(/WHERE \(status = 'PENDING'/);
    } finally {
      await isolated.$disconnect();
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  });
});
