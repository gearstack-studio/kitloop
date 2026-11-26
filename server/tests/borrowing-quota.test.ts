import request from "supertest";
import { Prisma, RequestStatus, Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { ConfigurationError, runtimeConfig } from "../src/config.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";

const origin = "http://localhost:5173";
const password = "synthetic-quota-test-password";
const path = "/api/borrowing-quota";
const userIds: string[] = [];
const assetIds: string[] = [];
type Session = { id: string; cookie: string; csrf: string };
let custodian: Session;
let passwordHash: string;

async function session(role: Role = Role.BORROWER): Promise<Session> {
  const user = await prisma.user.create({ data: { username: randomUUID(), role, passwordHash } });
  userIds.push(user.id);
  const response = await request(app).post("/api/auth/login").set("Origin", origin)
    .send({ username: user.username, password });
  expect(response.status).toBe(200);
  return { id: user.id, cookie: response.headers["set-cookie"][0].split(";")[0], csrf: response.headers["x-csrf-token"] };
}

async function asset(retired = false) {
  const assetId = `QUOTA-${randomUUID()}`;
  assetIds.push(assetId);
  await prisma.asset.create({ data: {
    assetId, name: "Test camera", category: "Camera", description: "Synthetic",
    retiredAt: retired ? new Date() : null, custodianAssets: { create: { custodianId: custodian.id } },
  } });
  return assetId;
}

const post = (who: Session, url: string, body: object) => request(app).post(url)
  .set("Cookie", who.cookie).set("Origin", origin).set("X-CSRF-Token", who.csrf).send(body);
const submit = (who: Session, assetId: string) => post(who, "/api/requests", { assetId });
const checkout = (id: string, assetId: string) => post(custodian, `/api/requests/${id}/checkout`, {
  assetId, dueAt: new Date(Date.now() + 86_400_000).toISOString(),
});
const decline = (id: string) => post(custodian, `/api/requests/${id}/decline`, { reason: "BORROWER_NOT_ELIGIBLE" });
const cancel = (who: Session, id: string) => post(who, `/api/requests/${id}/cancel`, {});
const quota = (who: Session, query = "") => request(app).get(path + query).set("Cookie", who.cookie);
const rows = (who: Session) => prisma.borrowRequest.findMany({ where: { borrowerId: who.id }, orderBy: { id: "asc" } });

async function pending(who: Session, assetId: string) {
  return prisma.borrowRequest.create({ data: { borrowerId: who.id, assetId, status: RequestStatus.PENDING } });
}

async function expectQuota(who: Session, pendingRequests: number) {
  const response = await quota(who);
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body).toEqual({
    pendingRequests, maxPendingRequests: 2, remainingRequestCapacity: Math.max(0, 2 - pendingRequests),
    canSubmitRequest: pendingRequests < 2,
  });
}

async function expectBlocked(who: Session, assetId: string) {
  const before = await rows(who);
  const response = await submit(who, assetId);
  expect(response.status).toBe(409);
  expect(response.body.error).toMatchObject({ code: "BORROWING_QUOTA_EXCEEDED" });
  expect(response.body.error).not.toHaveProperty("fields");
  expect(await rows(who)).toEqual(before);
  expect(await prisma.loan.count({ where: { assetId } })).toBe(0);
}

beforeAll(async () => {
  passwordHash = await hashPassword(password);
  custodian = await session(Role.CUSTODIAN);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

it("TC01–TC03: accepts the first two requests and rejects repeated attempts at capacity without writes", async () => {
  const borrower = await session();
  const a1 = await asset(), a2 = await asset(), a3 = await asset();
  await expectQuota(borrower, 0);
  const first = await submit(borrower, a1);
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({ borrowerId: borrower.id, assetId: a1, status: "PENDING" });
  await expectQuota(borrower, 1);
  expect((await submit(borrower, a2)).status).toBe(201);
  await expectQuota(borrower, 2);
  for (let attempt = 0; attempt < 3; attempt++) await expectBlocked(borrower, a3);
  const catalog = await request(app).get("/api/assets").set("Cookie", borrower.cookie);
  expect(catalog.body).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: a3, available: true })]));
});

it.each(["checkout", "cancel", "decline", "auto-decline"] as const)(
  "TC05/TC13/TC14: %s lowers the pending count exactly once and reopens capacity", async action => {
    const borrower = await session();
    const a1 = await asset(), a2 = await asset(), a3 = await asset();
    const closing = await pending(borrower, a1);
    const waiting = await pending(borrower, a2);
    await expectBlocked(borrower, a3);
    if (action === "checkout") {
      const result = await checkout(closing.id, a1);
      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({ requestId: closing.id, status: "ACTIVE" });
    } else if (action === "cancel") {
      const result = await cancel(borrower, closing.id);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ status: "CANCELLED", closeReason: "CANCELLED_BY_BORROWER" });
    } else if (action === "decline") {
      const result = await decline(closing.id);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ status: "DECLINED", closeReason: "BORROWER_NOT_ELIGIBLE" });
    } else {
      const rival = await session();
      const competing = await pending(rival, a1);
      expect((await checkout(competing.id, a1)).status).toBe(201);
      expect(await prisma.borrowRequest.findUniqueOrThrow({ where: { id: closing.id } }))
        .toMatchObject({ status: "DECLINED", closeReason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER" });
      await expectQuota(rival, 0);
    }
    expect(await prisma.borrowRequest.findUniqueOrThrow({ where: { id: waiting.id } })).toEqual(waiting);
    await expectQuota(borrower, 1);
    expect((await submit(borrower, a3)).status).toBe(201);
    await expectQuota(borrower, 2);
  },
);

it("TC07/TC16: historical over-capacity rows remain and recovery works down to P = 1", async () => {
  const borrower = await session();
  const [a1, a2, a3, a4, a5] = await Promise.all(Array.from({ length: 5 }, () => asset()));
  const first = await pending(borrower, a1);
  const second = await pending(borrower, a2);
  const third = await pending(borrower, a3);
  const fourth = await pending(borrower, a4);
  await expectQuota(borrower, 4);
  expect((await cancel(borrower, first.id)).status).toBe(200);
  await expectQuota(borrower, 3);
  await expectBlocked(borrower, a5);
  expect((await decline(second.id)).status).toBe(200);
  await expectQuota(borrower, 2);
  await expectBlocked(borrower, a5);
  expect((await checkout(third.id, a3)).status).toBe(201);
  await expectQuota(borrower, 1);
  expect((await submit(borrower, a5)).status).toBe(201);
  expect(await rows(borrower)).toHaveLength(5);
  expect(await prisma.borrowRequest.findUniqueOrThrow({ where: { id: fourth.id } })).toEqual(fourth);
});

it.each([[1, 2, 20], [0, 3, 10]])(
  "TC08a: starting at P = %i with %i parallel writes, capacity is never exceeded", async (initial, parallel, runs) => {
    const outcomes: string[] = [];
    for (let round = 0; round < runs; round++) {
      const borrower = await session();
      if (initial) await pending(borrower, await asset());
      const targets = await Promise.all(Array.from({ length: parallel }, () => asset()));
      const results = await Promise.all(targets.map(assetId => submit(borrower, assetId)));
      for (const result of results.filter(result => result.status !== 201)) {
        expect(result.status).toBe(409);
        expect(["BORROWING_QUOTA_EXCEEDED", "CONFLICT"]).toContain(result.body.error.code);
        outcomes.push(result.body.error.code);
      }
      expect(results.filter(result => result.status === 201)).toHaveLength(2 - initial);
      expect(await rows(borrower)).toHaveLength(2);
    }
    console.info(`TC08a P=${initial}, rounds=${runs}: ${JSON.stringify(outcomes)}`);
  }, 30_000,
);

it.each([[1, 0, 201, 2], [1, 1, 409, 2], [3, 0, 409, 3], [3, 2, 409, 3]])(
  "TC08b–d: retries %i injected failures at P = %i", async (failures, initial, status, attempts) => {
    const borrower = await session();
    for (let count = 0; count < initial; count++) await pending(borrower, await asset());
    const target = await asset();
    const competing = failures === 1 && initial === 1 ? await asset() : null;
    const transact = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction");
    for (let attempt = 0; attempt < failures; attempt++) {
      spy.mockImplementationOnce(async () => {
        if (competing) await pending(borrower, competing);
        throw new Prisma.PrismaClientKnownRequestError("Synthetic serialization failure", {
          code: "P2034", clientVersion: Prisma.prismaVersion.client,
        });
      });
    }
    spy.mockImplementation(transact);
    const result = await submit(borrower, target);
    expect(spy).toHaveBeenCalledTimes(attempts);
    expect(result.status).toBe(status);
    if (status === 409) {
      expect(result.body.error.code).toBe(failures === 3 ? "CONFLICT" : "BORROWING_QUOTA_EXCEEDED");
    }
    expect(await prisma.borrowRequest.count({ where: { assetId: target } })).toBe(status === 201 ? 1 : 0);
  },
);

it("TC09/TC10: preserves request precedence and reads only the authenticated borrower's quota", async () => {
  const borrower = await session();
  const other = await session();
  const shared = await asset(), retired = await asset(true);
  await pending(borrower, shared);
  await pending(borrower, await asset());
  const onLoan = await asset();
  const loanRequest = await pending(other, onLoan);
  expect((await checkout(loanRequest.id, onLoan)).status).toBe(201);
  const before = await rows(borrower);
  for (const [target, status, code] of [
    [randomUUID(), 404, "NOT_FOUND"], [retired, 409, "ASSET_UNAVAILABLE"],
    [onLoan, 409, "ASSET_UNAVAILABLE"], [shared, 409, "DUPLICATE_REQUEST"],
  ] as const) {
    const result = await submit(borrower, target);
    expect(result.status).toBe(status);
    expect(result.body.error.code).toBe(code);
  }
  expect(await rows(borrower)).toEqual(before);
  expect((await submit(other, shared)).status).toBe(201);
  expect((await request(app).get(path)).status).toBe(401);
  expect((await quota(custodian)).status).toBe(403);
  await expectQuota(borrower, 2);
  await expectQuota(other, 1);
  for (const query of [`?borrowerId=${other.id}`, "?x=1", "?x"]) {
    const result = await quota(borrower, query);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: {
      code: "VALIDATION_ERROR", message: expect.any(String), fields: { query: expect.any(String) },
    } });
  }
});

it("TC19: startup validates the flag and the off state preserves submissions", async () => {
  for (const REQUEST_LIFECYCLE_WRITES of [undefined, "disabled", "enabled"]) {
    for (const BORROWING_QUOTA of [undefined, "disabled", "enabled", "yes"]) {
      const start = () => runtimeConfig({ BORROWING_QUOTA, REQUEST_LIFECYCLE_WRITES });
      if (BORROWING_QUOTA === "yes" || (BORROWING_QUOTA === "enabled" && REQUEST_LIFECYCLE_WRITES !== "enabled")) {
        expect(start).toThrow(ConfigurationError);
      } else {
        expect(start).not.toThrow();
      }
    }
  }
  vi.stubEnv("BORROWING_QUOTA", "disabled");
  const borrower = await session();
  await pending(borrower, await asset());
  await pending(borrower, await asset());
  expect((await submit(borrower, await asset())).status).toBe(201);
  const disabled = await quota(borrower, "?x=1");
  expect(disabled.status).toBe(404);
  expect(disabled.body.error.code).toBe("BORROWING_QUOTA_DISABLED");
  expect((await quota(custodian)).status).toBe(403);
  const me = await request(app).get("/api/auth/me").set("Cookie", borrower.cookie);
  expect(me.body.features.borrowingQuota).toBe(false);
});

it("TC21: three active loans do not prevent a borrower from submitting two pending requests", async () => {
  const borrower = await session();
  for (let count = 0; count < 3; count++) {
    const assetId = await asset();
    const creation = await submit(borrower, assetId);
    expect(creation.status).toBe(201);
    expect((await checkout(creation.body.id, assetId)).status).toBe(201);
  }
  expect(await prisma.loan.count({ where: { borrowerId: borrower.id, returnedAt: null } })).toBe(3);
  expect((await submit(borrower, await asset())).status).toBe(201);
  expect((await submit(borrower, await asset())).status).toBe(201);
});


it("TC06/TC12: counts pending rows across reconnects and excludes terminal requests and loans", async () => {
  const borrower = await session();
  const activeAsset = await asset(), returnedAsset = await asset();
  const active = await pending(borrower, activeAsset), returned = await pending(borrower, returnedAsset);
  expect((await checkout(active.id, activeAsset)).status).toBe(201);
  expect((await checkout(returned.id, returnedAsset)).status).toBe(201);
  await prisma.loan.update({ where: { requestId: returned.id }, data: {
    returnedAt: new Date(), returnCustodianId: custodian.id,
  } });
  expect((await cancel(borrower, (await pending(borrower, await asset())).id)).status).toBe(200);
  expect((await decline((await pending(borrower, await asset())).id)).status).toBe(200);
  const expired = await pending(borrower, await asset());
  await prisma.borrowRequest.update({ where: { id: expired.id }, data: {
    status: "EXPIRED", closedAt: new Date(), closeReason: "OTHER",
  } });
  await expectQuota(borrower, 0);
  const first = await pending(borrower, await asset());
  await expectQuota(borrower, 1);
  expect((await submit(borrower, await asset())).status).toBe(201);
  await prisma.$disconnect();
  await expectQuota(borrower, 2);
  expect((await cancel(borrower, first.id)).status).toBe(200);
  await expectQuota(borrower, 1);
});

it("TC17: unauthorized recovery and invalid inputs leave pending rows unchanged", async () => {
  const borrower = await session(), other = await session(), unassigned = await session(Role.CUSTODIAN);
  const a1 = await asset();
  const closing = await pending(borrower, a1);
  await pending(borrower, await asset());
  const base = `/api/requests/${closing.id}`;
  const before = await rows(borrower);
  const attempts = [
    [() => cancel(other, closing.id), 404],
    [() => cancel(custodian, closing.id), 403],
    [() => post(borrower, base + "/decline", { reason: "OTHER" }), 403],
    [() => post(unassigned, base + "/decline", { reason: "OTHER" }), 404],
    [() => request(app).post(base + "/cancel").set("Cookie", borrower.cookie).set("Origin", origin).send({}), 403],
    [() => post(borrower, base + "/cancel", { status: "CANCELLED" }), 400],
    [() => post(unassigned, base + "/checkout", { assetId: a1, dueAt: new Date(Date.now() + 86_400_000).toISOString() }), 404],
  ] as const;
  for (const [attempt, status] of attempts) {
    expect((await attempt()).status).toBe(status);
    expect(await rows(borrower)).toEqual(before);
    await expectQuota(borrower, 2);
  }
  await expectBlocked(borrower, await asset());
});

it.each([
  ["checkout", 2], ["checkout", 1], ["cancel", 2], ["decline", 2], ["auto-decline", 2],
] as const)("TC20: submission racing %s at P = %i obeys the capacity invariant", async (operation, initial) => {
  const outcomes: Record<string, number> = {};
  for (let round = 0; round < 10; round++) {
    const borrower = await session();
    const a1 = await asset(), target = await asset();
    const closing = await pending(borrower, a1);
    if (initial === 2) await pending(borrower, await asset());

    let recovery;
    if (operation === "cancel") recovery = cancel(borrower, closing.id);
    else if (operation === "decline") recovery = decline(closing.id);
    else if (operation === "checkout") recovery = checkout(closing.id, a1);
    else recovery = checkout((await pending(await session(), a1)).id, a1);

    const [submission, closure] = await Promise.all([submit(borrower, target), recovery]);
    const makesLoan = operation === "checkout" || operation === "auto-decline";
    const closed = Number(closure.status === (makesLoan ? 201 : 200));
    const submitted = Number(submission.status === 201);
    if (!closed) {
      expect(closure.status).toBe(409);
      expect(closure.body.error.code).toBe(makesLoan ? "CHECKOUT_CONFLICT" : "REQUEST_CONFLICT");
    }
    if (!submitted) {
      expect(submission.status).toBe(409);
      expect(initial === 1 ? ["CONFLICT"] : ["CONFLICT", "BORROWING_QUOTA_EXCEEDED"]).toContain(submission.body.error.code);
    }
    if (initial === 2 && submitted) expect(closed).toBe(1);
    const current = await rows(borrower);
    const pendingCount = current.filter(row => row.status === RequestStatus.PENDING).length;
    expect(pendingCount).toBe(initial - closed + submitted);
    expect(pendingCount).toBeLessThanOrEqual(2);
    expect(current.filter(row => row.assetId === target)).toHaveLength(submitted);
    expect(await prisma.loan.count({ where: { assetId: a1 } })).toBe(makesLoan ? closed : 0);
    const outcome = `${closure.status}/${submission.status}`;
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  console.info(`TC20 ${operation}, P=${initial}: ${JSON.stringify(outcomes)}`);
}, 30_000);

