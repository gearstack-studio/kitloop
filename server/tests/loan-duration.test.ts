import request from "supertest";
import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { checkoutRequest, validateDueDate } from "../src/checkout.js";
import { loanMaxDays, runtimeConfig } from "../src/config.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";

// UAT-E02 (#62), BR-11, SRS OQ-01. The maximum loan duration is a deployment setting (LOAN_MAX_DAYS) because the
// department has not approved a value yet (OQ-01 is open). TEST_MAX_DAYS is a TEST CONFIGURATION ONLY, deliberately
// unrelated to any proposed policy; it exercises the mechanism. Unset means "no maximum" (today's behaviour).
const TEST_MAX_DAYS = 21;
const DAY = 86_400_000;
const origin = "http://localhost:5173";
const password = "synthetic-loan-duration-password";
const assetIds: string[] = [];
const userIds: string[] = [];
type Session = { id: string; cookie: string; csrf: string };
let borrower: Session, rival: Session, custodian: Session;

async function session(role: Role): Promise<Session> {
  const user = await prisma.user.create({ data: { username: randomUUID(), role, passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  const result = await request(app).post("/api/auth/login").set("Origin", origin).send({ username: user.username, password });
  expect(result.status).toBe(200);
  return { id: user.id, cookie: result.headers["set-cookie"][0].split(";")[0], csrf: result.headers["x-csrf-token"] };
}
async function requestAs(who: Session, assetId: string) {
  const result = await request(app).post("/api/requests").set("Origin", origin)
    .set("Cookie", who.cookie).set("X-CSRF-Token", who.csrf).send({ assetId });
  expect(result.status).toBe(201);
  return result.body.id as string;
}
async function fixture() {
  const assetId = `LOAN-MAX-${randomUUID()}`;
  assetIds.push(assetId);
  await prisma.asset.create({ data: { assetId, name: "Loan duration camera", category: "Camera", description: "Synthetic",
    custodianAssets: { create: { custodianId: custodian.id } } } });
  return { assetId, requestId: await requestAs(borrower, assetId) };
}
function checkout(requestId: string, assetId: string, dueAt: unknown) {
  return request(app).post(`/api/requests/${requestId}/checkout`).set("Cookie", custodian.cookie)
    .set("Origin", origin).set("X-CSRF-Token", custodian.csrf).send({ assetId, dueAt });
}
async function assertUntouched(requestId: string, assetId: string) {
  expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");
  expect(await prisma.loan.count({ where: { assetId } })).toBe(0);
}

beforeAll(async () => {
  borrower = await session(Role.BORROWER); rival = await session(Role.BORROWER); custodian = await session(Role.CUSTODIAN);
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

describe("UAT-E02 maximum loan duration: rule (validateDueDate)", () => {
  const checkedOutAt = new Date("2030-01-02T03:04:05.000Z");
  const latest = new Date(checkedOutAt.getTime() + TEST_MAX_DAYS * DAY);

  it("accepts a due date within the maximum and exactly at the inclusive boundary", () => {
    expect(() => validateDueDate(new Date(checkedOutAt.getTime() + 7 * DAY), checkedOutAt, TEST_MAX_DAYS)).not.toThrow();
    expect(() => validateDueDate(latest, checkedOutAt, TEST_MAX_DAYS)).not.toThrow();
  });
  it("rejects one second and one millisecond beyond the maximum, 100 years ahead and year 9999", () => {
    for (const dueAt of [new Date(latest.getTime() + 1000), new Date(latest.getTime() + 1),
      new Date(checkedOutAt.getTime() + 100 * 365 * DAY), new Date("9999-12-31T23:59:59Z")]) {
      expect(() => validateDueDate(dueAt, checkedOutAt, TEST_MAX_DAYS)).toThrow(`within ${TEST_MAX_DAYS} days`);
    }
  });
  it("still rejects past and exactly-current due dates when a maximum is configured", () => {
    for (const dueAt of [new Date(checkedOutAt.getTime() - 1), checkedOutAt, new Date(NaN)]) {
      expect(() => validateDueDate(dueAt, checkedOutAt, TEST_MAX_DAYS)).toThrow("later than checkout time");
    }
  });
  it("applies no maximum while OQ-01 is unresolved (LOAN_MAX_DAYS unset)", () => {
    expect(() => validateDueDate(new Date("9999-12-31T23:59:59Z"), checkedOutAt, null)).not.toThrow();
  });
});

describe("UAT-E02 maximum loan duration: configuration (LOAN_MAX_DAYS)", () => {
  it("is unset by default and accepts a whole number of days", () => {
    expect(loanMaxDays({})).toBeNull();
    expect(loanMaxDays({ LOAN_MAX_DAYS: "" })).toBeNull();
    expect(loanMaxDays({ LOAN_MAX_DAYS: "1" })).toBe(1);
    expect(loanMaxDays({ LOAN_MAX_DAYS: String(TEST_MAX_DAYS) })).toBe(TEST_MAX_DAYS);
    expect(loanMaxDays({ LOAN_MAX_DAYS: "3650" })).toBe(3650);
  });
  it("refuses to start with an invalid value", () => {
    for (const LOAN_MAX_DAYS of ["0", "-1", "1.5", "14d", " 14", "014", "3651", "abc", "Infinity"]) {
      expect(() => loanMaxDays({ LOAN_MAX_DAYS })).toThrow("LOAN_MAX_DAYS");
      expect(() => runtimeConfig({ LOAN_MAX_DAYS })).toThrow("LOAN_MAX_DAYS");
    }
  });
});

describe("UAT-E02 maximum loan duration: checkout API (PostgreSQL)", () => {
  beforeEach(() => { process.env.LOAN_MAX_DAYS = String(TEST_MAX_DAYS); });
  afterEach(() => { delete process.env.LOAN_MAX_DAYS; });

  it("accepts a due date within the configured maximum", async () => {
    const { requestId, assetId } = await fixture();
    const dueAt = new Date(Date.now() + 7 * DAY).toISOString();
    const result = await checkout(requestId, assetId, dueAt);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ requestId, assetId, dueAt, status: "ACTIVE" });
  });

  it("measures the boundary from the actual checkout time inside the transaction (inclusive)", async () => {
    const atBoundary = await fixture();
    const checkedOutAt = new Date(Date.now() + 1000);
    const latest = new Date(checkedOutAt.getTime() + TEST_MAX_DAYS * DAY);
    const loan = await checkoutRequest(custodian.id, atBoundary.requestId, { assetId: atBoundary.assetId, dueAt: latest },
      () => checkedOutAt);
    expect(loan.dueAt.toISOString()).toBe(latest.toISOString());

    // The same due date one second later than allowed: the form may have been opened earlier, but the rule uses the
    // checkout instant, so a later checkout time does not extend the limit.
    const beyond = await fixture();
    await expect(checkoutRequest(custodian.id, beyond.requestId,
      { assetId: beyond.assetId, dueAt: new Date(latest.getTime() + 1000) }, () => checkedOutAt))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await assertUntouched(beyond.requestId, beyond.assetId);
  });

  it("rejects due dates beyond the maximum with 400 VALIDATION_ERROR and a dueAt field message, changing nothing", async () => {
    const { requestId, assetId } = await fixture();
    for (const dueAt of [new Date(Date.now() + TEST_MAX_DAYS * DAY + 60_000).toISOString(),
      new Date(Date.now() + 100 * 365 * DAY).toISOString(), "9999-12-31T23:59:59Z"]) {
      const result = await checkout(requestId, assetId, dueAt);
      expect(result.status).toBe(400);
      expect(result.body.error).toMatchObject({ code: "VALIDATION_ERROR",
        message: `Choose a due date within ${TEST_MAX_DAYS} days of checkout` });
      expect(result.body.error.fields.dueAt).toContain(`${TEST_MAX_DAYS} days`);
      await assertUntouched(requestId, assetId);
    }
  });

  it("still rejects past, timezone-free, impossible and invalid due dates, changing nothing", async () => {
    const { requestId, assetId } = await fixture();
    for (const dueAt of [new Date(Date.now() - 60_000).toISOString(), "2026-11-27T17:00:00", "2027-02-30T10:00:00Z",
      "tomorrow", "", null, 0]) {
      const result = await checkout(requestId, assetId, dueAt);
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("VALIDATION_ERROR");
      await assertUntouched(requestId, assetId);
    }
  });

  it("a rejected over-limit checkout leaves competing requests PENDING (UAT-E01 auto-decline does not run)", async () => {
    const { requestId, assetId } = await fixture();
    const rivalId = await requestAs(rival, assetId);
    const result = await checkout(requestId, assetId, "9999-12-31T23:59:59Z");
    expect(result.status).toBe(400);
    await assertUntouched(requestId, assetId);
    expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: rivalId } })).status).toBe("PENDING");

    const ok = await checkout(requestId, assetId, new Date(Date.now() + DAY).toISOString());
    expect(ok.status).toBe(201);
    expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: rivalId } })).status).toBe("DECLINED");
    expect(await prisma.loan.count({ where: { assetId, returnedAt: null } })).toBe(1);
  });

  it("tells the client the configured maximum through login and /auth/me", async () => {
    const me = await request(app).get("/api/auth/me").set("Cookie", custodian.cookie);
    expect(me.body.features).toMatchObject({ loanMaxDays: TEST_MAX_DAYS });
    delete process.env.LOAN_MAX_DAYS;
    const unset = await request(app).get("/api/auth/me").set("Cookie", custodian.cookie);
    expect(unset.body.features).toMatchObject({ loanMaxDays: null });
  });
});
