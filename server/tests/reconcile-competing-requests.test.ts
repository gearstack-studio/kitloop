import request from "supertest";
import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";

// PR #72 review P2: PENDING requests that competed with a checkout made before the lifecycle release are never closed
// by the new checkout transaction. A separately reviewed, explicitly executed reconciliation closes them.
// Business rule: a PENDING request is stale if its asset has an ACTIVE loan (returnedAt IS NULL). That request can never
// be checked out while the loan is active, which is exactly the state the new checkout transaction would have closed.
const origin = "http://localhost:5173";
const password = "synthetic-reconcile-password";
const assetIds: string[] = [];
const userIds: string[] = [];
type Session = { id: string; cookie: string; csrf: string };
let borrowerA: Session, borrowerB: Session, borrowerC: Session, custodian: Session;
type Reconcile = (db: typeof prisma, options: object) => Promise<any>;
let reconcile: Reconcile;
let ReconcileRefusal: new (...args: never[]) => Error;
let database: string;

async function session(role: Role): Promise<Session> {
  const user = await prisma.user.create({ data: { username: randomUUID(), role, passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  const result = await request(app).post("/api/auth/login").set("Origin", origin).send({ username: user.username, password });
  return { id: user.id, cookie: result.headers["set-cookie"][0].split(";")[0], csrf: result.headers["x-csrf-token"] };
}
async function asset() {
  const assetId = `RECONCILE-${randomUUID()}`;
  assetIds.push(assetId);
  await prisma.asset.create({ data: { assetId, name: "Reconcile camera", category: "Camera", description: "Synthetic",
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
const snapshot = (ids: string[]) => prisma.borrowRequest.findMany({ where: { assetId: { in: ids } }, orderBy: { id: "asc" } });

/** Data exactly as the pre-lifecycle checkout left it: checkouts made with lifecycle writes disabled. */
async function legacyData() {
  process.env.REQUEST_LIFECYCLE_WRITES = "disabled";
  try {
    // X: A checked out; B and C competed and are still PENDING (Team 7's UAT-E01 example).
    const x = await asset();
    const a = await submit(borrowerA, x), b = await submit(borrowerB, x), c = await submit(borrowerC, x);
    expect((await checkout(a, x)).status).toBe(201);
    // Y: the competing loan was later returned, so D is fulfillable again and must stay PENDING.
    const y = await asset();
    const e = await submit(borrowerA, y), d = await submit(borrowerB, y);
    expect((await checkout(e, y)).status).toBe(201);
    // No return API exists yet; record the return as a future return feature would (Loan_return_actor_together).
    await prisma.loan.update({ where: { requestId: e }, data: { returnedAt: new Date(), returnCustodianId: custodian.id } });
    // Z: no loan at all; F is an ordinary open request.
    const z = await asset();
    const f = await submit(borrowerB, z);
    return { x, y, z, a, b, c, d, e, f, assets: [x, y, z] };
  } finally {
    process.env.REQUEST_LIFECYCLE_WRITES = "enabled";
  }
}

beforeAll(async () => {
  borrowerA = await session(Role.BORROWER); borrowerB = await session(Role.BORROWER); borrowerC = await session(Role.BORROWER);
  custodian = await session(Role.CUSTODIAN);
  const [{ db }] = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  database = db;
  const module = await import("../src/reconcile-competing-requests.js") as Record<string, unknown>;
  reconcile = module.reconcileCompetingRequests as Reconcile;
  ReconcileRefusal = module.ReconcileRefusal as typeof ReconcileRefusal;
});
afterEach(() => { process.env.REQUEST_LIFECYCLE_WRITES = "enabled"; });
afterAll(async () => {
  await prisma.loan.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.borrowRequest.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.custodianAsset.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.asset.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("P2 reconciliation of pre-existing competing PENDING requests", () => {
  it("dry run reports stale requests (active loan) and kept requests (loan returned) without changing anything", async () => {
    const data = await legacyData();
    const before = await snapshot(data.assets);
    const report = await reconcile(prisma, { mode: "dry-run", assetIds: data.assets });
    expect(report).toMatchObject({ mode: "dry-run", database, closed: [], conflicts: [],
      before: { pending: 4, staleOnActiveLoan: 2, keptLoanReturned: 1 }, after: { pending: 4, staleOnActiveLoan: 2, keptLoanReturned: 1 } });
    expect(report.stale.map((item: { requestId: string }) => item.requestId).sort()).toEqual([data.b, data.c].sort());
    expect(report.stale[0]).toMatchObject({ assetId: data.x, activeLoanRequestId: data.a });
    expect(report.kept).toEqual([expect.objectContaining({ requestId: data.d, assetId: data.y, reason: "COMPETING_LOAN_RETURNED" })]);
    expect(await snapshot(data.assets)).toEqual(before);
  });

  it("refuses to apply without the matching database confirmation or while lifecycle writes are disabled", async () => {
    const data = await legacyData();
    const before = await snapshot(data.assets);
    await expect(reconcile(prisma, { mode: "apply", assetIds: data.assets })).rejects.toBeInstanceOf(ReconcileRefusal);
    await expect(reconcile(prisma, { mode: "apply", confirmDatabase: "kitloop_production", assetIds: data.assets })).rejects.toBeInstanceOf(ReconcileRefusal);
    await expect(reconcile(prisma, { mode: "apply", confirmDatabase: database, assetIds: data.assets,
      env: { REQUEST_LIFECYCLE_WRITES: "disabled" } })).rejects.toThrow(/REQUEST_LIFECYCLE_WRITES/);
    expect(await snapshot(data.assets)).toEqual(before);
  });

  it("apply declines only the stale requests, with reason and time, and keeps every other record and its history", async () => {
    const data = await legacyData();
    // An already-terminal record on the same asset must keep its own closure data.
    const g = await submit(borrowerA, data.z);
    await post(borrowerA, `/api/requests/${g}/cancel`);
    const cancelledBefore = await stored(g);
    const started = Date.now();
    const report = await reconcile(prisma, { mode: "apply", confirmDatabase: database, assetIds: data.assets });

    expect(report.closed.sort()).toEqual([data.b, data.c].sort());
    expect(report).toMatchObject({ before: { staleOnActiveLoan: 2 }, after: { pending: 2, staleOnActiveLoan: 0, keptLoanReturned: 1 } });
    for (const id of [data.b, data.c]) {
      const row = await stored(id);
      expect(row).toMatchObject({ status: "DECLINED", closeReason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER", closedById: null });
      expect(row.closedAt!.getTime()).toBeGreaterThanOrEqual(started - 1000);
      expect(row.closedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
    expect(await stored(data.a)).toMatchObject({ status: "CHECKED_OUT", closedAt: null });
    expect(await stored(data.d)).toMatchObject({ status: "PENDING", closedAt: null });
    expect(await stored(data.f)).toMatchObject({ status: "PENDING", closedAt: null });
    expect(await stored(g)).toEqual(cancelledBefore);
    expect(await prisma.borrowRequest.count({ where: { assetId: { in: data.assets } } })).toBe(7);

    // Borrower history shows the closure; the custodian queue no longer offers it.
    const history = await request(app).get("/api/requests/mine").set("Cookie", borrowerB.cookie);
    expect(history.body.find((item: { id: string }) => item.id === data.b)).toMatchObject({ status: "DECLINED", closeReason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER" });
    const queue = await request(app).get("/api/requests/pending").set("Cookie", custodian.cookie);
    expect(queue.body.map((item: { id: string }) => item.id)).not.toContain(data.b);
    expect(queue.body.map((item: { id: string }) => item.id)).toContain(data.d);
  });

  it("is idempotent: a second run closes nothing and leaves closure timestamps unchanged", async () => {
    const data = await legacyData();
    await reconcile(prisma, { mode: "apply", confirmDatabase: database, assetIds: data.assets });
    const afterFirst = await snapshot(data.assets);
    const second = await reconcile(prisma, { mode: "apply", confirmDatabase: database, assetIds: data.assets });
    expect(second).toMatchObject({ closed: [], before: { staleOnActiveLoan: 0 }, after: { staleOnActiveLoan: 0 } });
    expect(await snapshot(data.assets)).toEqual(afterFirst);
  });

  it("races safely with a borrower cancelling the same stale request: exactly one closure wins", async () => {
    for (let round = 0; round < 3; round++) {
      const data = await legacyData();
      const [report, cancel] = await Promise.all([
        reconcile(prisma, { mode: "apply", confirmDatabase: database, assetIds: data.assets }),
        post(borrowerB, `/api/requests/${data.b}/cancel`),
      ]);
      const row = await stored(data.b);
      if (cancel.status === 200) {
        expect(row).toMatchObject({ status: "CANCELLED", closeReason: "CANCELLED_BY_BORROWER", closedById: borrowerB.id });
        expect(report.closed).not.toContain(data.b);
      } else {
        expect(cancel.status).toBe(409);
        expect(row).toMatchObject({ status: "DECLINED", closeReason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER", closedById: null });
        expect(report.closed).toContain(data.b);
      }
      // Whatever the interleaving, C is closed (now or by a rerun) and nothing is left stale.
      const rerun = await reconcile(prisma, { mode: "apply", confirmDatabase: database, assetIds: data.assets });
      expect(rerun.after.staleOnActiveLoan).toBe(0);
      expect((await stored(data.c)).status).toBe("DECLINED");
    }
  });

  it("does not touch a request whose asset is checked out by a checkout that commits during the run", async () => {
    // A concurrent checkout locks the asset first; the reconciliation re-checks the rule under the same asset lock.
    const assetId = await asset();
    const a = await submit(borrowerA, assetId), b = await submit(borrowerB, assetId);
    const [report, result] = await Promise.all([
      reconcile(prisma, { mode: "apply", confirmDatabase: database, assetIds: [assetId] }),
      checkout(a, assetId),
    ]);
    expect(result.status).toBe(201);
    // Before the checkout commits there is no active loan, so B is not stale; once it commits, the checkout itself has
    // declined B (lifecycle writes enabled). Either way the reconciliation never closes or re-closes B.
    expect(await stored(b)).toMatchObject({ status: "DECLINED", closedById: custodian.id });
    expect(report.closed).not.toContain(b);
    expect(report.conflicts).toEqual([]);
  });
});
