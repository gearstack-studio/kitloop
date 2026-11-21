import request from "supertest";
import { Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/password.js";

// UAT-E03 (#63): the API gives the UI readable names (own username; equipment, borrower and checkout-custodian names on
// loans) while keeping every stable ID used for actions. Person summaries are an allowlist of { id, username } only.
const origin = "http://localhost:5173";
const password = "synthetic-readable-names-password";
const assetIds: string[] = [];
const userIds: string[] = [];
type Session = { id: string; username: string; cookie: string; csrf: string };
let alice: Session, bob: Session, carol: Session, dave: Session, outsider: Session;
const loans: Record<string, { id: string; requestId: string; assetId: string }> = {};

async function session(role: Role, label: string): Promise<Session> {
  const username = `${label}.${randomUUID().slice(0, 8)}`;
  const user = await prisma.user.create({ data: { username, role, passwordHash: await hashPassword(password) } });
  userIds.push(user.id);
  const result = await request(app).post("/api/auth/login").set("Origin", origin).send({ username, password });
  expect(result.status).toBe(200);
  return { id: user.id, username, cookie: result.headers["set-cookie"][0].split(";")[0], csrf: result.headers["x-csrf-token"] };
}
async function asset(name: string, custodians: Session[]) {
  const assetId = `NAMES-${randomUUID().slice(0, 8)}`;
  assetIds.push(assetId);
  await prisma.asset.create({ data: { assetId, name, category: "Camera", description: "Synthetic",
    custodianAssets: { create: custodians.map(c => ({ custodianId: c.id })) } } });
  return assetId;
}
async function lend(borrower: Session, custodian: Session, assetId: string) {
  const created = await request(app).post("/api/requests").set("Origin", origin)
    .set("Cookie", borrower.cookie).set("X-CSRF-Token", borrower.csrf).send({ assetId });
  expect(created.status).toBe(201);
  const loan = await request(app).post(`/api/requests/${created.body.id}/checkout`).set("Origin", origin)
    .set("Cookie", custodian.cookie).set("X-CSRF-Token", custodian.csrf)
    .send({ assetId, dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
  expect(loan.status).toBe(201);
  return { id: loan.body.id as string, requestId: created.body.id as string, assetId };
}
const get = (who: Session, path: string) => request(app).get(`/api/${path}`).set("Cookie", who.cookie);
const person = (who: Session) => ({ id: who.id, username: who.username });

beforeAll(async () => {
  alice = await session(Role.BORROWER, "alice"); bob = await session(Role.BORROWER, "bob");
  carol = await session(Role.CUSTODIAN, "carol"); dave = await session(Role.CUSTODIAN, "dave");
  outsider = await session(Role.CUSTODIAN, "outsider");
  const camera = await asset("Readable camera", [carol, dave]);
  const tripod = await asset("Readable tripod", [carol, dave]);
  loans.aliceCamera = await lend(alice, carol, camera);   // checked out by carol
  loans.bobTripod = await lend(bob, dave, tripod);        // checked out by dave
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

describe("UAT-E03 readable names: identity", () => {
  it("/auth/me and login return the signed-in user's own username with the existing id and role", async () => {
    for (const who of [alice, carol]) {
      const me = await get(who, "auth/me");
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ id: who.id, username: who.username });
      expect(me.body).not.toHaveProperty("passwordHash");
    }
    const login = await request(app).post("/api/auth/login").set("Origin", origin).send({ username: bob.username, password });
    expect(login.body.user).toEqual({ id: bob.id, role: "BORROWER", username: bob.username });
  });
});

describe("UAT-E03 readable names: loans", () => {
  // Final privacy audit: FR-11 gives a borrower checkout, due and return information for their own loans; no requirement
  // grants them custodian identity, and a username is also a login identifier. Borrower loan reads therefore carry the
  // equipment name only (least privilege); the existing FEAT-04 ID fields are unchanged.
  it("a borrower's loans carry the equipment name, keeping every ID, and no person names", async () => {
    const mine = await get(alice, "loans/mine");
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({
      id: loans.aliceCamera.id, requestId: loans.aliceCamera.requestId, assetId: loans.aliceCamera.assetId,
      borrowerId: alice.id, checkoutCustodianId: carol.id, status: "ACTIVE",
      asset: { assetId: loans.aliceCamera.assetId, name: "Readable camera" },
    });
    expect(mine.body[0]).not.toHaveProperty("checkoutCustodian");
    expect(mine.body[0]).not.toHaveProperty("borrower");
  });

  it("no borrower loan response contains a custodian's username anywhere in the body", async () => {
    for (const path of ["loans/mine", `loans/${loans.aliceCamera.id}`]) {
      const body = JSON.stringify((await get(alice, path)).body);
      expect(body).toContain("Readable camera");
      for (const custodian of [carol, dave, outsider]) expect(body).not.toContain(custodian.username);
    }
  });

  it("a custodian's active loans name each borrower, item and checkout custodian correctly across users and assets", async () => {
    const active = await get(carol, "loans/active");
    expect(active.status).toBe(200);
    const byId = Object.fromEntries((active.body as Array<{ id: string }>).map(loan => [loan.id, loan]));
    expect(byId[loans.aliceCamera.id]).toMatchObject({
      asset: { name: "Readable camera" }, borrower: person(alice), checkoutCustodian: person(carol) });
    expect(byId[loans.bobTripod.id]).toMatchObject({
      asset: { name: "Readable tripod" }, borrower: person(bob), checkoutCustodian: person(dave) });
  });

  it("a single loan read gives a scoped custodian the names and its owner the equipment name only", async () => {
    const forCustodian = await get(carol, `loans/${loans.aliceCamera.id}`);
    expect(forCustodian.status).toBe(200);
    expect(forCustodian.body).toMatchObject({ asset: { name: "Readable camera" }, borrower: person(alice), checkoutCustodian: person(carol) });
    const forOwner = await get(alice, `loans/${loans.aliceCamera.id}`);
    expect(forOwner.status).toBe(200);
    expect(forOwner.body).toMatchObject({ asset: { name: "Readable camera" } });
    expect(forOwner.body).not.toHaveProperty("checkoutCustodian");
    expect(forOwner.body).not.toHaveProperty("borrower");
  });
});

describe("UAT-E03 readable names: privacy boundaries", () => {
  it("person summaries expose exactly id and username, never credentials, role or sessions", async () => {
    const custodianLists = [(await get(carol, "loans/active")).body, [(await get(carol, `loans/${loans.bobTripod.id}`)).body]];
    for (const list of custodianLists) {
      for (const loan of list as Array<Record<string, Record<string, unknown>>>) {
        for (const key of ["borrower", "checkoutCustodian"]) expect(Object.keys(loan[key]).sort()).toEqual(["id", "username"]);
        expect(Object.keys(loan.asset).sort()).toEqual(["assetId", "name"]);
      }
    }
    for (const loan of (await get(alice, "loans/mine")).body as Array<Record<string, Record<string, unknown>>>) {
      expect(Object.keys(loan.asset).sort()).toEqual(["assetId", "name"]);
    }
  });

  it("does not reveal other borrowers' loans or names, nor loans outside a custodian's scope", async () => {
    const aliceLoans = JSON.stringify((await get(alice, "loans/mine")).body);
    expect(aliceLoans).not.toContain(bob.username);
    expect(aliceLoans).not.toContain(loans.bobTripod.id);
    expect((await get(alice, `loans/${loans.bobTripod.id}`)).status).toBe(404);
    expect((await get(outsider, "loans/active")).body).toEqual([]);
    expect((await get(outsider, `loans/${loans.aliceCamera.id}`)).status).toBe(404);
    expect((await get(alice, "loans/active")).status).toBe(403);
  });
});
