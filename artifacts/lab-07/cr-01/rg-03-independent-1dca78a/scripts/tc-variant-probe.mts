// STS variant probe (reproduction only): executes the CR-01 STS variants that the mapped suites do not exercise
// literally (PR #93 review finding 1). Integration level, in-process against the checkout's own server/src, real PostgreSQL.
// Usage (from <repo>/server, DATABASE_URL -> local kitloop_rg03_variants_test, migrated and empty):
//   npx tsx ../artifacts/lab-07/cr-01/rg-03-independent-1dca78a/scripts/tc-variant-probe.mts
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const paths = createRequire(import.meta.url)(path.join(scriptsDir, "paths.cjs"));
const database = paths.assertSafeDatabase("kitloop_rg03_variants_test"); // before any app or DB module loads

const ORIGIN = "http://localhost:5173";
process.env.APP_ORIGIN = ORIGIN;
process.env.REQUEST_LIFECYCLE_WRITES = "enabled";
process.env.BORROWING_QUOTA = "enabled";
process.env.SESSION_CSRF_SECRET ??= randomBytes(32).toString("hex");

const serverDir = path.join(paths.REPO_ROOT, "server");
const request = createRequire(path.join(serverDir, "package.json"))("supertest");
const { default: app } = await import(pathToFileURL(path.join(serverDir, "src", "app.ts")).href);
const { prisma } = await import(pathToFileURL(path.join(serverDir, "src", "db.ts")).href);
const { hashPassword } = await import(pathToFileURL(path.join(serverDir, "src", "password.ts")).href);

const password = randomBytes(18).toString("base64url");
const passwordHash = await hashPassword(password);
type Session = { id: string; cookie: string; csrf: string };
const results: Array<{ tc: string; variant: string; pass: boolean; detail: unknown }> = [];
const check = (tc: string, variant: string, pass: boolean, detail: unknown) => {
  results.push({ tc, variant, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${tc} :: ${variant} :: ${JSON.stringify(detail)}`);
};

async function user(role: "BORROWER" | "CUSTODIAN" = "BORROWER") {
  return prisma.user.create({ data: { username: `variant.${randomUUID()}`, role, passwordHash } });
}
async function login(u: { id: string; username: string }): Promise<Session> {
  const r = await request(app).post("/api/auth/login").set("Origin", ORIGIN).send({ username: u.username, password });
  if (r.status !== 200) throw new Error(`login ${r.status}`);
  return { id: u.id, cookie: r.headers["set-cookie"][0].split(";")[0], csrf: r.headers["x-csrf-token"] };
}
let custodianUser: { id: string; username: string };
async function asset(opts: { retired?: boolean } = {}) {
  const assetId = `VAR-${randomUUID()}`;
  await prisma.asset.create({ data: { assetId, name: "Variant item", category: "Test", description: "Synthetic",
    retiredAt: opts.retired ? new Date() : null, custodianAssets: { create: { custodianId: custodianUser.id } } } });
  return assetId;
}
const pending = (borrowerId: string, assetId: string) => prisma.borrowRequest.create({ data: { borrowerId, assetId, status: "PENDING" } });
const post = (s: Session, url: string, body: unknown) =>
  request(app).post(url).set("Cookie", s.cookie).set("Origin", ORIGIN).set("X-CSRF-Token", s.csrf).send(body as object);
const quota = async (s: Session) => {
  const r = await request(app).get("/api/borrowing-quota").set("Cookie", s.cookie);
  return { status: r.status, body: r.body, keys: Object.keys(r.body ?? {}).sort().join(","), noStore: r.headers["cache-control"] === "no-store" };
};
const q = (p: number) => ({ pendingRequests: p, maxPendingRequests: 2, remainingRequestCapacity: Math.max(0, 2 - p), canSubmitRequest: p < 2 });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const snapshot = async () => JSON.stringify([
  await prisma.borrowRequest.findMany({ orderBy: { id: "asc" } }), await prisma.loan.findMany({ orderBy: { id: "asc" } })]);
const due = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const code = (r: { body?: { error?: { code?: string } } }) => r.body?.error?.code ?? null;
const KEYS = "canSubmitRequest,maxPendingRequests,pendingRequests,remainingRequestCapacity";

try {
  const dbName = ((await prisma.$queryRaw`SELECT current_database() AS db`) as Array<{ db: string }>)[0].db;
  if (dbName !== database) throw new Error(`connected to ${dbName}, expected ${database}`);
  custodianUser = await user("CUSTODIAN");
  const cust = await login(custodianUser);

  // TC01 (I): P = 0 -> GET, POST, GET; DTO shape; no loan; asset still available.
  {
    const b = await login(await user()); const a1 = await asset();
    const g0 = await quota(b); const r = await post(b, "/api/requests", { assetId: a1 }); const g1 = await quota(b);
    const catalog = await request(app).get("/api/assets").set("Cookie", b.cookie);
    const available = catalog.body.find((x: { assetId: string }) => x.assetId === a1)?.available;
    check("TC01", "I: GET {0,2,2,true} -> POST 201 PENDING (session borrowerId) -> GET {1,2,1,true}; 4 keys; no-store; no loan; asset available",
      g0.status === 200 && same(g0.body, q(0)) && g0.keys === KEYS && g0.noStore && r.status === 201 && r.body.status === "PENDING"
      && r.body.borrowerId === b.id && same(g1.body, q(1)) && (await prisma.loan.count({ where: { assetId: a1 } })) === 0 && available === true,
      { before: g0.body, post: [r.status, r.body.status], after: g1.body, noStore: g0.noStore, available });
  }
  // TC01 (capacity grid at API level, P = 0..5). The STS asks for a U-level unit grid; no unit test exists (see README).
  {
    const grid: Record<string, unknown> = {}; let ok = true;
    for (let p = 0; p <= 5; p++) {
      const u = await user(); for (let i = 0; i < p; i++) await pending(u.id, await asset());
      const g = await quota(await login(u)); grid[p] = g.body; ok &&= same(g.body, q(p));
    }
    check("TC01", "capacity grid P = 0..5 through GET (remaining = max(0, 2-P), canSubmit = P < 2)", ok, grid);
  }
  // TC05 negatives: B1' at P = 2; checkout with a past dueAt (400) and an asset mismatch (409 REQUEST_MISMATCH).
  {
    const b = await login(await user()); const a1 = await asset(), a2 = await asset(), other = await asset();
    const r1 = await pending(b.id, a1); await pending(b.id, a2); const before = await snapshot();
    const past = await post(cust, `/api/requests/${r1.id}/checkout`, { assetId: a1, dueAt: due(-1) });
    const mismatch = await post(cust, `/api/requests/${r1.id}/checkout`, { assetId: other, dueAt: due(2) });
    const g = await quota(b);
    check("TC05", "negatives at P = 2: past dueAt -> 400; asset mismatch -> 409 REQUEST_MISMATCH; P stays 2; nothing written; never quota",
      past.status === 400 && code(past) === "VALIDATION_ERROR" && mismatch.status === 409 && code(mismatch) === "REQUEST_MISMATCH"
      && same(g.body, q(2)) && (await snapshot()) === before,
      { past: [past.status, code(past)], mismatch: [mismatch.status, code(mismatch)], quota: g.body });
  }
  // TC06: 1 PENDING + CHECKED_OUT, DECLINED, CANCELLED, EXPIRED + 1 active loan + 1 returned loan; GET; POST X; POST Y.
  {
    const bu = await user(); const b = await login(bu);
    await pending(bu.id, await asset());
    const aActive = await asset(), aReturned = await asset();
    const rA = await pending(bu.id, aActive), rR = await pending(bu.id, aReturned);
    await post(cust, `/api/requests/${rA.id}/checkout`, { assetId: aActive, dueAt: due(3) });
    await post(cust, `/api/requests/${rR.id}/checkout`, { assetId: aReturned, dueAt: due(3) });
    await prisma.loan.update({ where: { requestId: rR.id }, data: { returnedAt: new Date(), returnCustodianId: custodianUser.id } });
    const d = await pending(bu.id, await asset()); await post(cust, `/api/requests/${d.id}/decline`, { reason: "BORROWER_NOT_ELIGIBLE" });
    const c = await pending(bu.id, await asset()); await post(b, `/api/requests/${c.id}/cancel`, {});
    const e = await pending(bu.id, await asset());
    await prisma.borrowRequest.update({ where: { id: e.id }, data: { status: "EXPIRED", closedAt: new Date(), closeReason: "OTHER" } });
    const terminalBefore = JSON.stringify(await prisma.borrowRequest.findMany({ where: { borrowerId: bu.id, status: { not: "PENDING" } }, orderBy: { id: "asc" } }));
    const loansBefore = JSON.stringify(await prisma.loan.findMany({ where: { borrowerId: bu.id }, orderBy: { id: "asc" } }));
    const g = await quota(b); const x = await post(b, "/api/requests", { assetId: await asset() }); const y = await post(b, "/api/requests", { assetId: await asset() });
    const terminalAfter = JSON.stringify(await prisma.borrowRequest.findMany({ where: { borrowerId: bu.id, status: { not: "PENDING" } }, orderBy: { id: "asc" } }));
    const loansAfter = JSON.stringify(await prisma.loan.findMany({ where: { borrowerId: bu.id }, orderBy: { id: "asc" } }));
    check("TC06", "terminal history + active and returned loans: GET {1,2,1,true}; POST X 201; POST Y 409 quota; terminal and loan rows unchanged",
      same(g.body, q(1)) && x.status === 201 && y.status === 409 && code(y) === "BORROWING_QUOTA_EXCEEDED" && terminalBefore === terminalAfter && loansBefore === loansAfter,
      { quota: g.body, x: x.status, y: [y.status, code(y)] });
  }
  // TC07: pending(3) inserted directly; GET {3}; POST 409; checkout of the scoped request 201; GET {2}; nothing deleted.
  {
    const bu = await user(); const b = await login(bu); const ac = await asset();
    const rc = await pending(bu.id, ac); await pending(bu.id, await asset()); await pending(bu.id, await asset());
    const rowsBefore = await prisma.borrowRequest.count({ where: { borrowerId: bu.id } });
    const g3 = await quota(b); const p = await post(b, "/api/requests", { assetId: await asset() });
    const co = await post(cust, `/api/requests/${rc.id}/checkout`, { assetId: ac, dueAt: due(3) }); const g2 = await quota(b);
    check("TC07", "historical P = 3: GET {3,2,0,false}; POST 409; checkout from P = 3 -> 201; GET {2,2,0,false}; nothing deleted",
      same(g3.body, q(3)) && p.status === 409 && code(p) === "BORROWING_QUOTA_EXCEEDED" && co.status === 201 && same(g2.body, q(2))
      && (await prisma.borrowRequest.count({ where: { borrowerId: bu.id } })) === rowsBefore,
      { before: g3.body, post: [p.status, code(p)], checkout: co.status, after: g2.body });
  }
  // TC09: the AC09 table at P = 0 and P = 2 (duplicate needs P >= 1, so its low variant runs at P = 1).
  {
    const b2u = await user(); const onLoan = await asset(); const lr = await pending(b2u.id, onLoan);
    await post(cust, `/api/requests/${lr.id}/checkout`, { assetId: onLoan, dueAt: due(3) });
    const retired = await asset({ retired: true });
    for (const level of [0, 2]) {
      const bu = await user(); const b = await login(bu);
      const dupAsset = await asset();
      if (level === 2) { await pending(bu.id, dupAsset); await pending(bu.id, await asset()); }
      const target = await asset();
      const before = await snapshot(); const qBefore = await quota(b);
      const raw = (body: string, headers: Record<string, string>) => {
        let r = request(app).post("/api/requests").set("Content-Type", "application/json");
        for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
        return r.send(body);
      };
      const auth = { Cookie: b.cookie, Origin: ORIGIN, "X-CSRF-Token": b.csrf };
      const rows: Array<[string, { status: number; body: { error?: { code?: string; fields?: Record<string, string> } } }, number, string | null]> = [
        ["asset checked out (on loan)", await post(b, "/api/requests", { assetId: onLoan }), 409, "ASSET_UNAVAILABLE"],
        ["asset retired", await post(b, "/api/requests", { assetId: retired }), 409, "ASSET_UNAVAILABLE"],
        ["unknown asset", await post(b, "/api/requests", { assetId: `UNKNOWN-${randomUUID()}` }), 404, "NOT_FOUND"],
        ["malformed field (number)", await post(b, "/api/requests", { assetId: 5 }), 400, "VALIDATION_ERROR"],
        ["extra field", await post(b, "/api/requests", { assetId: target, status: "PENDING" }), 400, "VALIDATION_ERROR"],
        ["invalid JSON", await raw("{not json", auth), 400, "INVALID_JSON"],
        ["body over 16 KB", await post(b, "/api/requests", { assetId: target, pad: "x".repeat(17_000) }), 413, null],
        ["POST without session", await request(app).post("/api/requests").set("Origin", ORIGIN).send({ assetId: target }), 401, null],
        ["GET quota without session", await request(app).get("/api/borrowing-quota"), 401, null],
        ["custodian POST", await post(cust, "/api/requests", { assetId: target }), 403, "FORBIDDEN"],
        ["custodian GET quota", await request(app).get("/api/borrowing-quota").set("Cookie", cust.cookie), 403, "FORBIDDEN"],
        ["missing CSRF", await request(app).post("/api/requests").set("Cookie", b.cookie).set("Origin", ORIGIN).send({ assetId: target }), 403, "INVALID_CSRF"],
        ["foreign Origin", await request(app).post("/api/requests").set("Cookie", b.cookie).set("Origin", "https://evil.example").set("X-CSRF-Token", b.csrf).send({ assetId: target }), 403, "FORBIDDEN_ORIGIN"],
      ];
      const after = await snapshot(); const qAfter = await quota(b);
      for (const [name, r, status, expectedCode] of rows) {
        const fieldsOk = expectedCode !== "VALIDATION_ERROR" || !!r.body?.error?.fields?.assetId;
        check("TC09", `P = ${level}: ${name} -> ${status}${expectedCode ? " " + expectedCode : ""}; never quota`,
          r.status === status && (expectedCode === null || r.body?.error?.code === expectedCode) && r.body?.error?.code !== "BORROWING_QUOTA_EXCEEDED" && fieldsOk,
          { status: r.status, code: r.body?.error?.code ?? null });
      }
      check("TC09", `P = ${level}: database unchanged and quota unchanged after every AC09 row`, after === before && same(qBefore.body, qAfter.body), { quota: qAfter.body });
      // Duplicate: low variant at P = 1 (impossible at P = 0), high variant at P = 2.
      const du = level === 0 ? await user() : bu; const ds = level === 0 ? await login(du) : b;
      if (level === 0) await pending(du.id, dupAsset);
      const dBefore = await snapshot(); const dup = await post(ds, "/api/requests", { assetId: dupAsset });
      check("TC09", `P = ${level === 0 ? 1 : 2}: duplicate -> 409 DUPLICATE_REQUEST; never quota; no write`,
        dup.status === 409 && code(dup) === "DUPLICATE_REQUEST" && (await snapshot()) === dBefore, { status: dup.status, code: code(dup) });
    }
  }
  // TC10: foreign request and loan IDs -> 404 x2; 200 bodies have no UUIDs.
  {
    const ou = await user(); const o = await login(ou); const b = await login(await user());
    const a = await asset(); const r = await pending(ou.id, a);
    await post(cust, `/api/requests/${r.id}/checkout`, { assetId: a, dueAt: due(3) });
    const loan = await prisma.loan.findUniqueOrThrow({ where: { requestId: r.id } });
    const fr = await request(app).get(`/api/requests/${r.id}`).set("Cookie", b.cookie);
    const fl = await request(app).get(`/api/loans/${loan.id}`).set("Cookie", b.cookie);
    const own = await quota(o);
    const uuidFree = !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(own.body));
    check("TC10", "foreign request ID -> 404 and foreign loan ID -> 404; 200 quota body has no UUIDs",
      fr.status === 404 && fl.status === 404 && own.status === 200 && uuidFree, { foreignRequest: fr.status, foreignLoan: fl.status, uuidFree });
  }
  // TC12 (I): 2 via API -> {2}; checkout one -> {1} consistent with /requests/mine and /loans/mine; direct CANCELLED -> {0}.
  {
    const bu = await user(); const b = await login(bu); const a1 = await asset(), a2 = await asset();
    const r1 = await post(b, "/api/requests", { assetId: a1 }); const r2 = await post(b, "/api/requests", { assetId: a2 });
    const g2 = await quota(b);
    await post(cust, `/api/requests/${r1.body.id}/checkout`, { assetId: a1, dueAt: due(3) });
    const g1 = await quota(b);
    const mine = (await request(app).get("/api/requests/mine").set("Cookie", b.cookie)).body as Array<{ status: string }>;
    const loans = (await request(app).get("/api/loans/mine").set("Cookie", b.cookie)).body as Array<{ status: string }>;
    await prisma.borrowRequest.update({ where: { id: r2.body.id }, data: { status: "CANCELLED", closedAt: new Date(), closeReason: "CANCELLED_BY_BORROWER", closedById: bu.id } });
    const g0 = await quota(b);
    const consistent = mine.filter(x => x.status === "PENDING").length === 1 && loans.filter(x => x.status === "ACTIVE").length === 1;
    check("TC12", "I: {2,2,0,false}; after checkout {1,2,1,true} consistent with /requests/mine and /loans/mine; direct CANCELLED -> {0,2,2,true}",
      same(g2.body, q(2)) && same(g1.body, q(1)) && consistent && same(g0.body, q(0)), { two: g2.body, afterCheckout: g1.body, consistent, afterFixture: g0.body });
  }
  // TC17: the missing-CSRF attempt reports INVALID_CSRF and leaves the quota unchanged.
  {
    const bu = await user(); const b = await login(bu); const r1 = await pending(bu.id, await asset()); await pending(bu.id, await asset());
    const before = await snapshot();
    const noCsrf = await request(app).post(`/api/requests/${r1.id}/cancel`).set("Cookie", b.cookie).set("Origin", ORIGIN).send({});
    const g = await quota(b);
    check("TC17", "missing CSRF on cancel -> 403 INVALID_CSRF; quota {2,2,0,false}; nothing written",
      noCsrf.status === 403 && code(noCsrf) === "INVALID_CSRF" && same(g.body, q(2)) && (await snapshot()) === before, { status: noCsrf.status, code: code(noCsrf) });
  }
} catch (error) {
  check("PROBE", "unexpected error", false, { message: String((error as Error).message).split("\n")[0] });
} finally {
  await prisma.$disconnect();
  writeFileSync(paths.outputPath("tc-variant-probe.json"), JSON.stringify({ database, results }, null, 2) + "\n");
  const failed = results.filter(r => !r.pass).length;
  console.log(`SUMMARY ${results.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
