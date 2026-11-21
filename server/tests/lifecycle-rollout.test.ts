import request from "supertest";
import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { ConfigurationError, requestLifecycleWrites, runtimeConfig } from "../src/config.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";
import { legacyPrismaClient } from "./support/legacy-client.js";

// PR #72 review P1: a traffic-only rollback to the pre-lifecycle revision (8b6e5a9) cannot read DECLINED/CANCELLED/
// EXPIRED rows. The fix is a two-phase rollout: the lifecycle code first ships with REQUEST_LIFECYCLE_WRITES disabled
// (it reads every status but writes only PENDING/CHECKED_OUT, exactly like 8b6e5a9), so that revision is a safe rollback
// target before and after lifecycle values exist. Writes are enabled in a second deployment.
const origin = "http://localhost:5173";
const password = "synthetic-rollout-password";
const assetIds: string[] = [];
const userIds: string[] = [];
type Session = { id: string; cookie: string; csrf: string };
let borrowerA: Session, borrowerB: Session, custodian: Session;
let legacy: ReturnType<typeof legacyPrismaClient>;

async function session(role: Role): Promise<Session> {
  const user = await prisma.user.create({ data: { username: randomUUID(), role, passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  const result = await request(app).post("/api/auth/login").set("Origin", origin).send({ username: user.username, password });
  expect(result.status).toBe(200);
  return { id: user.id, cookie: result.headers["set-cookie"][0].split(";")[0], csrf: result.headers["x-csrf-token"] };
}
async function asset() {
  const assetId = `ROLLOUT-${randomUUID()}`;
  assetIds.push(assetId);
  await prisma.asset.create({ data: { assetId, name: "Rollout camera", category: "Camera", description: "Synthetic",
    custodianAssets: { create: { custodianId: custodian.id } } } });
  return assetId;
}
const post = (who: Session, path: string, body: object = {}) =>
  request(app).post(path).set("Cookie", who.cookie).set("Origin", origin).set("X-CSRF-Token", who.csrf).send(body);
async function submit(who: Session, assetId: string) {
  const result = await post(who, "/api/requests", { assetId });
  expect(result.status).toBe(201);
  return result.body.id as string;
}
const checkout = (requestId: string, assetId: string) =>
  post(custodian, `/api/requests/${requestId}/checkout`, { assetId, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
const stored = (id: string) => prisma.borrowRequest.findUniqueOrThrow({ where: { id } });
const mine = (who: Session) => request(app).get("/api/requests/mine").set("Cookie", who.cookie);
const withWrites = (value: "enabled" | "disabled") => {
  beforeEach(() => { process.env.REQUEST_LIFECYCLE_WRITES = value; });
  afterEach(() => { process.env.REQUEST_LIFECYCLE_WRITES = "enabled"; });
};

beforeAll(async () => {
  borrowerA = await session(Role.BORROWER); borrowerB = await session(Role.BORROWER); custodian = await session(Role.CUSTODIAN);
  legacy = legacyPrismaClient(process.env.DATABASE_URL!);
}, 120_000);
afterAll(async () => {
  await legacy?.$disconnect();
  await prisma.loan.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.borrowRequest.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.custodianAsset.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.asset.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("REQUEST_LIFECYCLE_WRITES configuration", () => {
  it("defaults to disabled and accepts only 'enabled' or 'disabled'", async () => {
    expect(requestLifecycleWrites({})).toBe(false);
    expect(requestLifecycleWrites({ REQUEST_LIFECYCLE_WRITES: "disabled" })).toBe(false);
    expect(requestLifecycleWrites({ REQUEST_LIFECYCLE_WRITES: "enabled" })).toBe(true);
    for (const value of ["true", "1", "ENABLED", " enabled", ""]) {
      expect(() => runtimeConfig({ REQUEST_LIFECYCLE_WRITES: value })).toThrow(ConfigurationError);
    }
    expect(runtimeConfig({ REQUEST_LIFECYCLE_WRITES: "disabled" })).toMatchObject({ port: 3000 });
  });
});

describe("Phase 1, compatibility release (REQUEST_LIFECYCLE_WRITES=disabled)", () => {
  withWrites("disabled");

  it("checkout keeps the pre-lifecycle behaviour: the competing request stays PENDING and no lifecycle value is written", async () => {
    const assetId = await asset();
    const a = await submit(borrowerA, assetId);
    const b = await submit(borrowerB, assetId);
    expect((await checkout(a, assetId)).status).toBe(201);
    expect((await stored(a)).status).toBe("CHECKED_OUT");
    expect(await stored(b)).toMatchObject({ status: "PENDING", closedAt: null, closeReason: null, closedById: null });
  });

  it("cancel and decline are unavailable (404 LIFECYCLE_ACTIONS_DISABLED) and change nothing", async () => {
    const assetId = await asset();
    const id = await submit(borrowerA, assetId);
    for (const result of [await post(borrowerA, `/api/requests/${id}/cancel`),
      await post(custodian, `/api/requests/${id}/decline`, { reason: "EQUIPMENT_UNAVAILABLE" })]) {
      expect(result.status).toBe(404);
      expect(result.body.error.code).toBe("LIFECYCLE_ACTIONS_DISABLED");
    }
    expect(await stored(id)).toMatchObject({ status: "PENDING", closedAt: null });
  });

  it("login and /auth/me tell the client that lifecycle actions are off", async () => {
    const me = await request(app).get("/api/auth/me").set("Cookie", borrowerA.cookie);
    expect(me.body).toMatchObject({ id: borrowerA.id, role: "BORROWER", features: { requestLifecycleActions: false } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: borrowerB.id } });
    const login = await request(app).post("/api/auth/login").set("Origin", origin).send({ username: user.username, password });
    expect(login.body).toMatchObject({ user: { id: borrowerB.id }, features: { requestLifecycleActions: false } });
  });

  it("everything it writes stays readable by the pre-lifecycle 8b6e5a9 client, so 8b6e5a9 remains a safe rollback target", async () => {
    const assetId = await asset();
    const a = await submit(borrowerA, assetId);
    const b = await submit(borrowerB, assetId);
    await checkout(a, assetId);
    await post(borrowerB, `/api/requests/${b}/cancel`);
    const rows = await legacy.borrowRequest.findMany({ where: { assetId } });
    expect(rows.map((row) => row.status).sort()).toEqual(["CHECKED_OUT", "PENDING"]);
  });

  it("still reads lifecycle rows written while writes were enabled, so it is a safe rollback target after them", async () => {
    const assetId = await asset();
    process.env.REQUEST_LIFECYCLE_WRITES = "enabled";
    const a = await submit(borrowerA, assetId);
    const b = await submit(borrowerB, assetId);
    await checkout(a, assetId);
    const c = await submit(borrowerB, await asset());
    await post(borrowerB, `/api/requests/${c}/cancel`);
    process.env.REQUEST_LIFECYCLE_WRITES = "disabled";

    const history = await mine(borrowerB);
    expect(history.status).toBe(200);
    expect(history.body.find((item: { id: string }) => item.id === b)).toMatchObject({ status: "DECLINED", closeReason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER" });
    expect(history.body.find((item: { id: string }) => item.id === c)).toMatchObject({ status: "CANCELLED", closeReason: "CANCELLED_BY_BORROWER" });
    expect((await request(app).get(`/api/requests/${b}`).set("Cookie", borrowerB.cookie)).status).toBe(200);
    const terminal = await checkout(b, assetId);
    expect(terminal.status).toBe(409);
  });
});

describe("Phase 2, lifecycle writes enabled (REQUEST_LIFECYCLE_WRITES=enabled)", () => {
  withWrites("enabled");

  it("login and /auth/me tell the client that lifecycle actions are on", async () => {
    const me = await request(app).get("/api/auth/me").set("Cookie", borrowerA.cookie);
    expect(me.body.features).toEqual({ requestLifecycleActions: true });
  });

  it("characterises the hazard: the 8b6e5a9 client cannot read a DECLINED row (why 8b6e5a9 is not a target after writes)", async () => {
    const assetId = await asset();
    const a = await submit(borrowerA, assetId);
    await submit(borrowerB, assetId);
    await checkout(a, assetId);
    await expect(legacy.borrowRequest.findMany({ where: { assetId } })).rejects.toThrow(/Value 'DECLINED' not found in enum 'RequestStatus'/);
  });
});

describe("Rollback safety check", () => {
  it("counts lifecycle-only statuses and says whether pre-lifecycle revisions are safe rollback targets", async () => {
    const { lifecycleRollbackReport } = await import("../src/lifecycle-rollout.js");
    const assetId = await asset();
    const a = await submit(borrowerA, assetId);
    const b = await submit(borrowerB, assetId);
    expect(await lifecycleRollbackReport(prisma, { assetIds: [assetId] })).toEqual({
      byStatus: { PENDING: 2 }, lifecycleOnlyRows: 0, preLifecycleRevisionsSafe: true,
    });
    process.env.REQUEST_LIFECYCLE_WRITES = "enabled";
    await checkout(a, assetId);
    expect(await lifecycleRollbackReport(prisma, { assetIds: [assetId] })).toEqual({
      byStatus: { CHECKED_OUT: 1, DECLINED: 1 }, lifecycleOnlyRows: 1, preLifecycleRevisionsSafe: false,
    });
    expect((await stored(b)).status).toBe("DECLINED");
  });
});
