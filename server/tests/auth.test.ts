import request from "supertest";
import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { COOKIE_NAME } from "../src/auth.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";

const origin = "http://localhost:5173";
const password = "synthetic-test-password";
const suffix = randomUUID().slice(0, 8);
const usernames = {
  borrowerA: `borrower-a-${suffix}`,
  borrowerB: `borrower-b-${suffix}`,
  custodianA: `custodian-a-${suffix}`,
  custodianB: `custodian-b-${suffix}`,
};
const assetA = `TEST-A-${suffix}`;
const assetB = `TEST-B-${suffix}`;

let borrowerAId: string;
let borrowerBId: string;
let custodianAId: string;
let custodianBId: string;
let requestAId: string;
let requestBId: string;
let loanBId: string;

beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  const [borrowerA, borrowerB, custodianA, custodianB] = await Promise.all([
    prisma.user.create({ data: { username: usernames.borrowerA, passwordHash, role: Role.BORROWER } }),
    prisma.user.create({ data: { username: usernames.borrowerB, passwordHash, role: Role.BORROWER } }),
    prisma.user.create({ data: { username: usernames.custodianA, passwordHash, role: Role.CUSTODIAN } }),
    prisma.user.create({ data: { username: usernames.custodianB, passwordHash, role: Role.CUSTODIAN } }),
  ]);
  borrowerAId = borrowerA.id;
  borrowerBId = borrowerB.id;
  custodianAId = custodianA.id;
  custodianBId = custodianB.id;

  await prisma.asset.createMany({ data: [
    { assetId: assetA, name: "Test camera", category: "Camera", description: "Synthetic test asset" },
    { assetId: assetB, name: "Test laptop", category: "Computer", description: "Synthetic test asset" },
  ] });
  await prisma.custodianAsset.createMany({ data: [
    { custodianId: custodianAId, assetId: assetA },
    { custodianId: custodianBId, assetId: assetB },
  ] });
  const [requestA, requestB] = await Promise.all([
    prisma.borrowRequest.create({ data: { borrowerId: borrowerAId, assetId: assetA } }),
    prisma.borrowRequest.create({ data: { borrowerId: borrowerBId, assetId: assetB } }),
  ]);
  requestAId = requestA.id;
  requestBId = requestB.id;
  const loanB = await prisma.loan.create({ data: {
    requestId: requestBId,
    assetId: assetB,
    borrowerId: borrowerBId,
    checkoutCustodianId: custodianBId,
    dueAt: new Date(Date.now() + 86_400_000),
  } });
  loanBId = loanB.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: [borrowerAId, borrowerBId, custodianAId, custodianBId] } } });
  await prisma.loan.deleteMany({ where: { requestId: { in: [requestAId, requestBId] } } });
  await prisma.borrowRequest.deleteMany({ where: { id: { in: [requestAId, requestBId] } } });
  await prisma.custodianAsset.deleteMany({ where: { assetId: { in: [assetA, assetB] } } });
  await prisma.asset.deleteMany({ where: { assetId: { in: [assetA, assetB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [borrowerAId, borrowerBId, custodianAId, custodianBId] } } });
  await prisma.$disconnect();
});

async function login(username: string) {
  const response = await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ username, password });
  expect(response.status).toBe(200);
  const cookie = (response.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
  return { cookie, csrf: response.headers["x-csrf-token"] as string, response };
}

describe("FEAT-01 authentication API", () => {
  it("rejects an unauthenticated current-user request", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Authentication required" },
    });
  });

  it("rejects invalid login without creating a session", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({ username: "unknown", password: "incorrect" });

    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("logs in both roles and retrieves server-derived identity", async () => {
    for (const [username, expectedId, role] of [
      [usernames.borrowerA, borrowerAId, Role.BORROWER],
      [usernames.custodianA, custodianAId, Role.CUSTODIAN],
    ] as const) {
      const { cookie, csrf, response } = await login(username);
      expect(response.body.user).toEqual({ id: expectedId, role });
      expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
      expect(csrf).toBeTruthy();
      const current = await request(app).get("/api/auth/me").set("Cookie", cookie);
      expect(current.status).toBe(200);
      expect(current.body).toEqual({ id: expectedId, role });
    }
  });

  it("replaces a presented session and stores only password and token hashes", async () => {
    const first = await login(usernames.borrowerA);
    const second = await request(app).post("/api/auth/login").set("Origin", origin)
      .set("Cookie", first.cookie).send({ username: usernames.borrowerA, password });
    expect(second.status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", first.cookie)).status).toBe(401);
    const nextCookie = (second.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    expect((await request(app).get("/api/auth/me").set("Cookie", nextCookie)).status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: borrowerAId } });
    const sessions = await prisma.session.findMany({ where: { userId: borrowerAId } });
    expect(user.passwordHash).not.toContain(password);
    expect(user.passwordHash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(sessions).not.toHaveLength(0);
    for (const session of sessions) {
      expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(first.cookie).not.toContain(session.tokenHash);
    }
  });

  it("returns the same generic error for unknown user and wrong password", async () => {
    const unknown = await request(app).post("/api/auth/login").set("Origin", origin)
      .send({ username: `unknown-${suffix}`, password: "wrong" });
    const wrong = await request(app).post("/api/auth/login").set("Origin", origin)
      .send({ username: usernames.borrowerA, password: "wrong" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("revokes the server session on logout and rejects reuse", async () => {
    const { cookie, csrf } = await login(usernames.borrowerA);
    const logout = await request(app).post("/api/auth/logout").set("Origin", origin)
      .set("Cookie", cookie).set("X-CSRF-Token", csrf);
    expect(logout.status).toBe(204);
    expect(logout.headers["set-cookie"][0]).toContain(`${COOKIE_NAME}=`);
    const reused = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(reused.status).toBe(401);
  });

  it("rejects forged and expired sessions", async () => {
    const forged = await request(app).get("/api/auth/me")
      .set("Cookie", `${COOKIE_NAME}=${"a".repeat(43)}`);
    expect(forged.status).toBe(401);

    const { cookie } = await login(usernames.borrowerA);
    await prisma.session.updateMany({
      where: { userId: borrowerAId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(expired.status).toBe(401);
  });

  it("rejects missing CSRF and disallowed login origin", async () => {
    const { cookie } = await login(usernames.borrowerA);
    const missingCsrf = await request(app).post("/api/auth/logout")
      .set("Origin", origin).set("Cookie", cookie);
    expect(missingCsrf.status).toBe(403);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
    const foreignOrigin = await request(app).post("/api/auth/login")
      .set("Origin", "https://example.invalid").send({ username: usernames.borrowerA, password });
    expect(foreignOrigin.status).toBe(403);
    const absentOrigin = await request(app).post("/api/auth/login")
      .send({ username: usernames.borrowerA, password });
    expect(absentOrigin.status).toBe(403);
    const wrongCsrf = await request(app).post("/api/auth/logout")
      .set("Origin", origin).set("Cookie", cookie).set("X-CSRF-Token", "forged");
    expect(wrongCsrf.status).toBe(403);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
  });

  it("validates login input and sanitizes malformed JSON errors", async () => {
    const missing = await request(app).post("/api/auth/login").set("Origin", origin).send({ username: "" });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.credentials).toBeTruthy();
    const roleClaim = await request(app).post("/api/auth/login").set("Origin", origin)
      .send({ username: usernames.borrowerA, password, role: "CUSTODIAN" });
    expect(roleClaim.status).toBe(400);
    expect(roleClaim.headers["set-cookie"]).toBeUndefined();
    const malformed = await request(app).post("/api/auth/login").set("Origin", origin)
      .set("Content-Type", "application/json").send("{");
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } });
  });

  it("returns a generic response for an unexpected authentication failure", async () => {
    const spy = vi.spyOn(prisma.user, "findUnique").mockRejectedValueOnce(new Error("sensitive database detail"));
    try {
      const response = await request(app).post("/api/auth/login").set("Origin", origin)
        .send({ username: usernames.borrowerA, password });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
    } finally {
      spy.mockRestore();
    }
  });

  it("marks session cookies Secure in production configuration", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { response } = await login(usernames.borrowerA);
      expect(response.headers["set-cookie"][0]).toContain("Secure");
      expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });

  it("rejects unauthenticated and wrong-role domain operations", async () => {
    const unauthenticated = await request(app).get("/api/requests/mine");
    expect(unauthenticated.status).toBe(401);

    const { cookie, csrf } = await login(usernames.borrowerA);
    const inventory = await request(app).post("/api/assets").set("Origin", origin)
      .set("Cookie", cookie).set("X-CSRF-Token", csrf)
      .send({ assetId: `NEW-${suffix}`, name: "Test", category: "Test", description: "Test" });
    expect(inventory.status).toBe(403);
    const checkout = await request(app).post(`/api/requests/${requestAId}/checkout`)
      .set("Origin", origin).set("Cookie", cookie).set("X-CSRF-Token", csrf)
      .send({ assetId: assetA, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(checkout.status).toBe(403);
    expect(await prisma.loan.count({ where: { assetId: assetA } })).toBe(0);
    const custodian = await login(usernames.custodianA);
    const borrow = await request(app).post("/api/requests").set("Origin", origin)
      .set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf)
      .send({ assetId: assetA });
    expect(borrow.status).toBe(403);
  });

  it("allows only the borrower's own direct request and loan records", async () => {
    const { cookie } = await login(usernames.borrowerA);
    const own = await request(app).get(`/api/requests/${requestAId}`).set("Cookie", cookie);
    const foreign = await request(app).get(`/api/requests/${requestBId}`).set("Cookie", cookie);
    const foreignLoan = await request(app).get(`/api/loans/${loanBId}`).set("Cookie", cookie);
    expect(own.status).toBe(200);
    expect(own.body.id).toBe(requestAId);
    expect(foreign.status).toBe(404);
    expect(foreignLoan.status).toBe(404);
    const ownList = await request(app).get("/api/requests/mine").set("Cookie", cookie);
    const loans = await request(app).get("/api/loans/mine").set("Cookie", cookie);
    expect(ownList.body.map((item: { id: string }) => item.id)).toContain(requestAId);
    expect(ownList.body.map((item: { id: string }) => item.id)).not.toContain(requestBId);
    expect(loans.body.map((item: { id: string }) => item.id)).not.toContain(loanBId);
    expect((await request(app).get("/api/loans/active").set("Cookie", cookie)).status).toBe(403);
  });

  it("derives a new request owner from the authenticated session", async () => {
    const borrower = await login(usernames.borrowerB);
    const forged = await request(app).post("/api/requests").set("Origin", origin)
      .set("Cookie", borrower.cookie).set("X-CSRF-Token", borrower.csrf)
      .send({ assetId: assetA, borrowerId: borrowerAId });
    expect(forged.status).toBe(400);
    const created = await request(app).post("/api/requests").set("Origin", origin)
      .set("Cookie", borrower.cookie).set("X-CSRF-Token", borrower.csrf)
      .send({ assetId: assetA });
    expect(created.status).toBe(201);
    expect(created.body.borrowerId).toBe(borrowerBId);
    expect(created.body.status).toBe("PENDING");
    expect(await prisma.loan.count({ where: { requestId: created.body.id } })).toBe(0);
    await prisma.borrowRequest.delete({ where: { id: created.body.id } });
  });

  it("scopes a custodian's request queue and rejects out-of-scope checkout", async () => {
    const { cookie, csrf } = await login(usernames.custodianA);
    const queue = await request(app).get("/api/requests/pending").set("Cookie", cookie);
    expect(queue.status).toBe(200);
    expect(queue.body.map((item: { id: string }) => item.id)).toContain(requestAId);
    expect(queue.body.map((item: { id: string }) => item.id)).not.toContain(requestBId);
    const active = await request(app).get("/api/loans/active").set("Cookie", cookie);
    expect(active.status).toBe(200);
    expect(active.body.map((item: { id: string }) => item.id)).not.toContain(loanBId);
    expect((await request(app).get(`/api/loans/${loanBId}`).set("Cookie", cookie)).status).toBe(404);
    expect((await request(app).get(`/api/requests/${requestBId}`).set("Cookie", cookie)).status).toBe(404);

    const foreignCheckout = await request(app).post(`/api/requests/${requestBId}/checkout`)
      .set("Origin", origin).set("Cookie", cookie).set("X-CSRF-Token", csrf)
      .send({ assetId: assetB, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(foreignCheckout.status).toBe(404);
    expect(await prisma.loan.count({ where: { requestId: requestBId } })).toBe(1);
  });

  it("restricts inventory editing to the assigned custodian", async () => {
    const custodian = await login(usernames.custodianA);
    const foreign = await request(app).patch(`/api/assets/${assetB}`).set("Origin", origin)
      .set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf)
      .send({ name: "Unauthorized change" });
    expect(foreign.status).toBe(404);
    expect((await prisma.asset.findUniqueOrThrow({ where: { assetId: assetB } })).name).toBe("Test laptop");
    const own = await request(app).patch(`/api/assets/${assetA}`).set("Origin", origin)
      .set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf)
      .send({ name: "Updated camera" });
    expect(own.status).toBe(200);
    expect(own.body.name).toBe("Updated camera");
    const borrower = await login(usernames.borrowerA);
    const forbidden = await request(app).patch(`/api/assets/${assetA}`).set("Origin", origin)
      .set("Cookie", borrower.cookie).set("X-CSRF-Token", borrower.csrf)
      .send({ name: "Borrower change" });
    expect(forbidden.status).toBe(403);
  });

  it("persists authorized checkout and prevents a duplicate active loan", async () => {
    const custodian = await login(usernames.custodianA);
    const dueAt = new Date(Date.now() + 86_400_000).toISOString();
    const checkout = await request(app).post(`/api/requests/${requestAId}/checkout`)
      .set("Origin", origin).set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf)
      .send({ assetId: assetA, dueAt });
    expect(checkout.status).toBe(201);
    expect(checkout.body.borrowerId).toBe(borrowerAId);
    expect(checkout.body.checkoutCustodianId).toBe(custodianAId);
    expect((await prisma.borrowRequest.findUniqueOrThrow({ where: { id: requestAId } })).status).toBe("FULFILLED");
    expect(await prisma.loan.count({ where: { assetId: assetA, returnedAt: null } })).toBe(1);
    const borrower = await login(usernames.borrowerA);
    const ownLoans = await request(app).get("/api/loans/mine").set("Cookie", borrower.cookie);
    expect(ownLoans.status).toBe(200);
    expect(ownLoans.body.map((item: { id: string }) => item.id)).toContain(checkout.body.id);
    expect((await request(app).get(`/api/loans/${checkout.body.id}`).set("Cookie", borrower.cookie)).status).toBe(200);

    const another = await prisma.borrowRequest.create({ data: { borrowerId: borrowerAId, assetId: assetA } });
    try {
      const duplicate = await request(app).post(`/api/requests/${another.id}/checkout`)
        .set("Origin", origin).set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf)
        .send({ assetId: assetA, dueAt });
      expect(duplicate.status).toBe(409);
      expect(await prisma.loan.count({ where: { assetId: assetA, returnedAt: null } })).toBe(1);
    } finally {
      await prisma.borrowRequest.delete({ where: { id: another.id } });
    }
  });

  it("allows only one checkout when two requests race for an available asset", async () => {
    const racingAsset = `TEST-RACE-${suffix}`;
    await prisma.asset.create({ data: { assetId: racingAsset, name: "Race asset", category: "Test", description: "Synthetic" } });
    await prisma.custodianAsset.create({ data: { assetId: racingAsset, custodianId: custodianAId } });
    const entries = await Promise.all([
      prisma.borrowRequest.create({ data: { assetId: racingAsset, borrowerId: borrowerAId } }),
      prisma.borrowRequest.create({ data: { assetId: racingAsset, borrowerId: borrowerBId } }),
    ]);
    try {
      const custodian = await login(usernames.custodianA);
      const dueAt = new Date(Date.now() + 86_400_000).toISOString();
      const results = await Promise.all(entries.map(entry => request(app)
        .post(`/api/requests/${entry.id}/checkout`).set("Origin", origin)
        .set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf)
        .send({ assetId: racingAsset, dueAt })));
      expect(results.map(result => result.status).sort()).toEqual([201, 409]);
      expect(await prisma.loan.count({ where: { assetId: racingAsset, returnedAt: null } })).toBe(1);
      expect(await prisma.borrowRequest.count({ where: { assetId: racingAsset, status: "FULFILLED" } })).toBe(1);
    } finally {
      await prisma.loan.deleteMany({ where: { assetId: racingAsset } });
      await prisma.borrowRequest.deleteMany({ where: { assetId: racingAsset } });
      await prisma.custodianAsset.deleteMany({ where: { assetId: racingAsset } });
      await prisma.asset.delete({ where: { assetId: racingAsset } });
    }
  });
});
