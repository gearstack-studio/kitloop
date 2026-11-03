import request from "supertest";
import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";
import { requestAssetId } from "../src/borrow-requests.js";

const suffix = randomUUID();
const origin = "http://localhost:5173";
const password = "synthetic-request-test-password";
const userIds: string[] = [];
const assets: string[] = [];
type Session = { cookie: string; csrf: string; id: string };
let borrower: Session, other: Session, custodian: Session, foreignCustodian: Session;

async function session(role: Role): Promise<Session> {
  const user = await prisma.user.create({ data: { username: randomUUID(), role, passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  const result = await request(app).post("/api/auth/login").set("Origin", origin).send({ username: user.username, password });
  expect(result.status).toBe(200);
  return { id: user.id, cookie: result.headers["set-cookie"][0].split(";")[0], csrf: result.headers["x-csrf-token"] };
}
async function asset(retired = false) {
  const assetId = `REQ-${suffix}-${assets.length}`;
  assets.push(assetId);
  await prisma.asset.create({ data: { assetId, name: "Test camera", category: "Camera", description: "Synthetic", ...(retired ? { retiredAt: new Date() } : {}) } });
  await prisma.custodianAsset.create({ data: { assetId, custodianId: custodian.id } });
  return assetId;
}
function submit(who: Session, body: object) {
  return request(app).post("/api/requests").set("Origin", origin).set("Cookie", who.cookie).set("X-CSRF-Token", who.csrf).send(body);
}
function checkout(who: Session, id: string, assetId: string) {
  return request(app).post(`/api/requests/${id}/checkout`).set("Origin", origin)
    .set("Cookie", who.cookie).set("X-CSRF-Token", who.csrf)
    .send({ assetId, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
}
beforeAll(async () => {
  borrower = await session(Role.BORROWER); other = await session(Role.BORROWER);
  custodian = await session(Role.CUSTODIAN); foreignCustodian = await session(Role.CUSTODIAN);
});
afterAll(async () => {
  await prisma.loan.deleteMany({ where: { assetId: { in: assets } } });
  await prisma.borrowRequest.deleteMany({ where: { assetId: { in: assets } } });
  await prisma.custodianAsset.deleteMany({ where: { assetId: { in: assets } } });
  await prisma.asset.deleteMany({ where: { assetId: { in: assets } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("request payload unit validation", () => {
  it("accepts only a trimmed Asset ID", () => {
    expect(requestAssetId({ assetId: " CAMERA-1 " })).toBe("CAMERA-1");
    for (const body of [null, [], {}, { assetId: 1 }, { assetId: " " }, { assetId: "x".repeat(81) },
      { assetId: "A", status: "CHECKED_OUT" }, { assetId: "A", borrowerId: "foreign" }]) {
      expect(() => requestAssetId(body)).toThrow("Provide a valid assetId only");
    }
  });
});

describe("FEAT-03 borrowing workflow against PostgreSQL", () => {
  it("persists PENDING with server identity/time, exposes asset details, and never reserves", async () => {
    const assetId = await asset();
    const before = Date.now();
    const created = await submit(borrower, { assetId });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ borrowerId: borrower.id, assetId, status: "PENDING" });
    expect(new Date(created.body.submittedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await prisma.borrowRequest.findUnique({ where: { id: created.body.id } })).toMatchObject({ status: "PENDING", borrowerId: borrower.id });
    expect(await prisma.loan.count({ where: { assetId } })).toBe(0);
    const catalog = await request(app).get("/api/assets").set("Cookie", borrower.cookie);
    expect(catalog.body.find((item: { assetId: string }) => item.assetId === assetId).available).toBe(true);
    const mine = await request(app).get("/api/requests/mine").set("Cookie", borrower.cookie);
    expect(mine.body.find((item: { id: string }) => item.id === created.body.id).asset).toEqual({ assetId, name: "Test camera", category: "Camera" });
    // Multiple borrowers can compete; only the same borrower's duplicate is rejected.
    expect((await submit(other, { assetId })).status).toBe(201);
    const duplicate = await submit(borrower, { assetId });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("DUPLICATE_REQUEST");
    expect(await prisma.borrowRequest.count({ where: { assetId } })).toBe(2);
  });

  it("rejects concurrent duplicate submissions and the database independently guards uniqueness", async () => {
    const assetId = await asset();
    const results = await Promise.all([submit(borrower, { assetId }), submit(borrower, { assetId })]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.borrowRequest.count({ where: { assetId, borrowerId: borrower.id } })).toBe(1);
    await expect(prisma.borrowRequest.create({ data: { assetId, borrowerId: borrower.id } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows concurrent submissions by different borrowers without reserving", async () => {
    const assetId = await asset();
    const results = await Promise.all([submit(borrower, { assetId }), submit(other, { assetId })]);
    expect(results.map(result => result.status)).toEqual([201, 201]);
    expect(await prisma.loan.count({ where: { assetId } })).toBe(0);
  });

  it("rejects unknown, retired, malformed, and client-controlled fields without writes", async () => {
    const retired = await asset(true);
    const available = await asset();
    const count = await prisma.borrowRequest.count();
    expect((await submit(borrower, { assetId: `UNKNOWN-${suffix}` })).status).toBe(404);
    expect((await submit(borrower, { assetId: retired })).status).toBe(409);
    for (const body of [{}, { assetId: 42 }, { assetId: " " }, { assetId: "x".repeat(81) },
      { assetId: available, borrowerId: other.id }, { assetId: available, status: "CHECKED_OUT" }]) {
      const result = await submit(borrower, body);
      expect(result.status).toBe(400); expect(result.body.error.fields.assetId).toBeTruthy();
    }
    expect(await prisma.borrowRequest.count()).toBe(count);
  });

  it("enforces authentication, role and CSRF for creation", async () => {
    const assetId = await asset();
    expect((await request(app).post("/api/requests").send({ assetId })).status).toBe(401);
    expect((await submit(custodian, { assetId })).status).toBe(403);
    expect((await request(app).post("/api/requests").set("Cookie", borrower.cookie).set("Origin", origin).send({ assetId })).status).toBe(403);
    expect(await prisma.borrowRequest.count({ where: { assetId } })).toBe(0);
  });

  it("scopes lists/direct IDs, forbids status writes and checks out atomically", async () => {
    const assetId = await asset();
    const created = await submit(borrower, { assetId });
    const competing = await submit(other, { assetId });
    const foreignList = await request(app).get("/api/requests/mine").set("Cookie", other.cookie);
    expect(foreignList.body.some((item: { id: string }) => item.id === created.body.id)).toBe(false);
    const hidden = await request(app).get(`/api/requests/${created.body.id}`).set("Cookie", other.cookie);
    expect(hidden.status).toBe(404); expect(JSON.stringify(hidden.body)).not.toContain(assetId);
    const queue = await request(app).get("/api/requests/pending").set("Cookie", custodian.cookie);
    expect(queue.body.find((item: { id: string }) => item.id === created.body.id)).toMatchObject({ borrower: { id: borrower.id }, asset: { assetId } });
    const foreignQueue = await request(app).get("/api/requests/pending").set("Cookie", foreignCustodian.cookie);
    expect(foreignQueue.body).toEqual([]);
    expect((await request(app).get(`/api/requests/${created.body.id}`).set("Cookie", foreignCustodian.cookie)).status).toBe(404);
    expect((await checkout(foreignCustodian, created.body.id, assetId)).status).toBe(404);
    expect((await checkout(borrower, created.body.id, assetId)).status).toBe(403);
    const modification = await request(app).patch(`/api/requests/${created.body.id}`).set("Cookie", borrower.cookie)
      .set("Origin", origin).set("X-CSRF-Token", borrower.csrf).send({ status: "CHECKED_OUT" });
    expect(modification.status).toBe(404);
    expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe("PENDING");
    expect((await checkout(custodian, created.body.id, assetId)).status).toBe(201);
    expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe("CHECKED_OUT");
    expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: competing.body.id } })).status).toBe("PENDING");
    expect((await submit(borrower, { assetId })).body.error.code).toBe("ASSET_UNAVAILABLE");
    expect((await submit(other, { assetId })).status).toBe(409);
    expect((await checkout(custodian, competing.body.id, assetId)).status).toBe(409);
    expect(await prisma.loan.count({ where: { assetId, returnedAt: null } })).toBe(1);
    const history = await request(app).get("/api/requests/mine").set("Cookie", borrower.cookie);
    expect(history.body.find((item: { id: string }) => item.id === created.body.id).status).toBe("CHECKED_OUT");
    const refreshedQueue = await request(app).get("/api/requests/pending").set("Cookie", custodian.cookie);
    expect(refreshedQueue.body.some((item: { id: string }) => item.id === created.body.id)).toBe(false);
  });

  it("rolls back request fulfillment if loan creation fails", async () => {
    const assetId = await asset();
    const created = await submit(borrower, { assetId });
    // Reject the insert at the database boundary after status has been updated.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_test_loan() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."assetId" = '${assetId}' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER reject_test_loan BEFORE INSERT ON "Loan" FOR EACH ROW EXECUTE FUNCTION reject_test_loan()');
    try {
      const result = await checkout(custodian, created.body.id, assetId);
      expect(result.status).toBe(500);
      expect(result.body.error.message).toBe("An unexpected error occurred");
      expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe("PENDING");
      expect(await prisma.loan.count({ where: { assetId } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER reject_test_loan ON "Loan"');
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_test_loan()');
    }
  });

  it("does not expose database failure details during submission", async () => {
    const spy = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("private connection detail"));
    try {
      const response = await submit(borrower, { assetId: "synthetic" });
      expect(response.status).toBe(500); expect(JSON.stringify(response.body)).not.toContain("private");
    } finally { spy.mockRestore(); }
  });
});
