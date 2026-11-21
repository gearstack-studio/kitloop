import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { API_BASE, APP_ORIGIN, DB_NAME, REPO_ROOT, SERVER_DIR, e2eDatabaseUrl, type UserKey } from "../support/env";
import { api, card, evidence, futureLocal, login, myRequests, pendingQueue } from "../support/helpers";

// UAT-E01 (#61) request lifecycle, end to end: real React client, real Express API, isolated e2e PostgreSQL database.
//   competing requests -> checkout auto-declines the loser -> borrower cancel -> custodian decline -> scope/role
//   rejections -> stale-UI 409 handling. Tests run in order and build on each other's data.
test.describe.configure({ mode: "serial" });

// Dedicated assets (all assigned to Custodian A) so this spec does not depend on, or disturb, specs 01-03.
// They are inserted here rather than in the shared fixture because spec 01 asserts the exact fixture catalog.
const ASSETS = {
  contest: { assetId: "KL-E01-CAM", name: "Lifecycle camera" },
  cancel: { assetId: "KL-E01-MIC", name: "Lifecycle microphone" },
  decline: { assetId: "KL-E01-TRI", name: "Lifecycle tripod" },
  stale: { assetId: "KL-E01-LIT", name: "Lifecycle light" },
} as const;

const SHOTS = path.join(REPO_ROOT, "artifacts", "sprint-1", "uat");
mkdirSync(SHOTS, { recursive: true });

/** Lab 6 evidence: full-page screenshot saved under artifacts/sprint-1/uat and attached to the HTML report. */
async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `uat-e01-e2e-${name}.png`), fullPage: true });
  await evidence(page, testInfo, name);
}

const request = (page: Page, assetId: string) => myRequests(page).getByRole("article").filter({ hasText: assetId });
const queued = (page: Page, assetId: string) => pendingQueue(page).getByRole("article").filter({ hasText: assetId });

async function requestFromCatalog(page: Page, asset: { assetId: string; name: string }) {
  await card(page, asset.assetId).getByRole("button", { name: `Request to borrow ${asset.name}, ${asset.assetId}` }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByLabel("Available equipment")).toHaveValue(asset.assetId);
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Borrow request submitted with PENDING status.")).toBeVisible();
  await expect(request(page, asset.assetId).filter({ hasText: "· PENDING" })).toHaveCount(1);
}

/** The signed-in user's own request record for an asset, read through the real API. */
async function mine(page: Page, assetId: string, status?: string) {
  const list = (await api(page, "GET", "/requests/mine")).body as Array<{ id: string; assetId: string; status: string; closeReason: string | null; closedAt: string | null }>;
  return list.find((item) => item.assetId === assetId && (!status || item.status === status))!;
}

async function signedIn(browser: Browser, key: UserKey) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, key);
  return { page, close: () => context.close() };
}

const ids: Record<string, string> = {};

test.beforeAll(async () => {
  const { PrismaClient } = createRequire(path.join(SERVER_DIR, "package.json"))("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: e2eDatabaseUrl() });
  try {
    const [{ db }] = (await prisma.$queryRawUnsafe("select current_database() as db")) as Array<{ db: string }>;
    if (db !== DB_NAME || !/^kitloop_e2e_/.test(db)) throw new Error(`Refusing to add lifecycle fixtures to "${db}"`);
    const custodian = await prisma.user.findUniqueOrThrow({ where: { username: "e2e.custodian.a" } });
    for (const asset of Object.values(ASSETS)) {
      await prisma.asset.upsert({
        where: { assetId: asset.assetId }, update: {},
        create: { ...asset, category: "Lifecycle", description: "Synthetic e2e fixture: UAT-E01 lifecycle spec",
          custodianAssets: { create: { custodianId: custodian.id } } },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test.describe("UAT-E01 (#61) request lifecycle in the browser", () => {
  test("1. Borrower A and Borrower B both request the same available asset; both are PENDING", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await requestFromCatalog(page, ASSETS.contest);
    ids.contestA = (await mine(page, ASSETS.contest.assetId)).id;
    await page.getByRole("button", { name: "Sign out" }).click();

    await login(page, "borrowerB");
    await requestFromCatalog(page, ASSETS.contest);
    ids.contestB = (await mine(page, ASSETS.contest.assetId)).id;
    await expect(request(page, ASSETS.contest.assetId)).toContainText(`${ASSETS.contest.assetId} · PENDING`);
    await shot(page, testInfo, "01-borrower-b-competing-request-pending");
  });

  test("2-5. Custodian checks out Borrower A's request; B's request is auto-declined and leaves the queue", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    const competing = queued(page, ASSETS.contest.assetId);
    await expect(competing).toHaveCount(2);
    await expect(competing.filter({ hasText: "Borrower: e2e.borrower.a" })).toHaveCount(1);
    await expect(competing.filter({ hasText: "Borrower: e2e.borrower.b" })).toHaveCount(1);
    await shot(page, testInfo, "02-custodian-queue-two-competing-requests");

    const winner = competing.filter({ hasText: "Borrower: e2e.borrower.a" });
    await winner.getByLabel(`Due date for ${ASSETS.contest.assetId}`).fill(futureLocal(7));
    await winner.getByRole("button", { name: "Check out" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Checkout recorded." }))
      .toHaveText("Checkout recorded. Request CHECKED_OUT and active loan created. Any other pending requests for this equipment were declined.");

    // 5. Both requests leave the actionable queue: A is CHECKED_OUT, B is DECLINED. Still true after a reload.
    await expect(queued(page, ASSETS.contest.assetId)).toHaveCount(0);
    await shot(page, testInfo, "03-custodian-queue-after-checkout-competitor-removed");
    await page.reload();
    await expect(pendingQueue(page).getByRole("heading", { name: "Pending requests" })).toBeVisible();
    await expect(queued(page, ASSETS.contest.assetId)).toHaveCount(0);
    const queue = (await api(page, "GET", "/requests/pending")).body as Array<{ id: string }>;
    expect(queue.map((item) => item.id)).not.toContain(ids.contestB);
    expect(queue.map((item) => item.id)).not.toContain(ids.contestA);
  });

  test("3. Borrower A's request is CHECKED_OUT, with no closure reason", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await expect(request(page, ASSETS.contest.assetId)).toContainText(`${ASSETS.contest.assetId} · CHECKED_OUT`);
    await expect(request(page, ASSETS.contest.assetId).getByText(/^Reason:/)).toHaveCount(0);
    expect(await mine(page, ASSETS.contest.assetId)).toMatchObject({ id: ids.contestA, status: "CHECKED_OUT", closeReason: null, closedAt: null });
    await shot(page, testInfo, "04-borrower-a-request-checked-out");
  });

  test("4 + 6. Borrower B sees DECLINED with the reason and closure time in My Requests, and no Cancel action", async ({ page }, testInfo) => {
    await login(page, "borrowerB");
    await page.getByRole("link", { name: "My Requests page" }).click();
    await page.reload();
    const declined = request(page, ASSETS.contest.assetId);
    await expect(declined).toContainText(`${ASSETS.contest.assetId} · DECLINED`);
    await expect(declined).toContainText("Reason: Equipment was checked out to another borrower");
    await expect(declined.getByText(/^Closed /)).toBeVisible();
    await expect(declined.getByRole("button", { name: /Cancel request/ })).toHaveCount(0);
    expect(await mine(page, ASSETS.contest.assetId)).toMatchObject({
      id: ids.contestB, status: "DECLINED", closeReason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER",
    });
    // The asset is on loan, so a new request is not offered.
    await expect(page.getByLabel("Available equipment").locator("option", { hasText: ASSETS.contest.assetId })).toHaveCount(0);
    await shot(page, testInfo, "05-borrower-b-my-requests-declined-with-reason");
  });

  test("7. Borrower B cancels their own PENDING request; it becomes CANCELLED and a new request is allowed", async ({ page, browser }, testInfo) => {
    await login(page, "borrowerB");
    await requestFromCatalog(page, ASSETS.cancel);
    ids.cancel = (await mine(page, ASSETS.cancel.assetId)).id;
    const pending = request(page, ASSETS.cancel.assetId);
    const cancel = pending.getByRole("button", { name: `Cancel request for ${ASSETS.cancel.name}` });
    await expect(cancel).toBeEnabled();
    await shot(page, testInfo, "06-borrower-b-pending-request-with-cancel");

    await cancel.click();
    await expect(page.getByRole("status").filter({ hasText: "Request cancelled." })).toBeVisible();
    await expect(pending).toContainText(`${ASSETS.cancel.assetId} · CANCELLED`);
    await expect(pending).toContainText("Reason: Cancelled by the borrower");
    await expect(pending.getByRole("button", { name: /Cancel request/ })).toHaveCount(0);
    await shot(page, testInfo, "07-borrower-b-request-cancelled");
    await page.reload();
    await expect(request(page, ASSETS.cancel.assetId)).toContainText(`${ASSETS.cancel.assetId} · CANCELLED`);
    expect(await mine(page, ASSETS.cancel.assetId)).toMatchObject({ id: ids.cancel, status: "CANCELLED", closeReason: "CANCELLED_BY_BORROWER" });

    // The custodian's queue no longer offers the cancelled request.
    const custodian = await signedIn(browser, "custodianA");
    await expect(queued(custodian.page, ASSETS.cancel.assetId)).toHaveCount(0);
    await custodian.close();

    // A terminal request does not block a new request while the asset is available.
    await page.getByRole("link", { name: "Equipment dashboard" }).click();
    await requestFromCatalog(page, ASSETS.cancel);
    await expect(request(page, ASSETS.cancel.assetId)).toHaveCount(2);
    ids.cancelRetry = (await mine(page, ASSETS.cancel.assetId, "PENDING")).id;
  });

  test("8. Custodian declines an assigned PENDING request; a reason is required first", async ({ page, browser }, testInfo) => {
    const borrower = await signedIn(browser, "borrowerA");
    await requestFromCatalog(borrower.page, ASSETS.decline);
    ids.decline = (await mine(borrower.page, ASSETS.decline.assetId)).id;

    await login(page, "custodianA");
    const item = queued(page, ASSETS.decline.assetId);
    await expect(item).toHaveCount(1);
    const decline = item.getByRole("button", { name: "Decline" });
    await expect(decline).toBeDisabled();
    const reason = item.getByLabel(`Decline reason for ${ASSETS.decline.assetId}`);
    await expect(reason.locator("option")).toHaveText(["Choose a reason", "Equipment unavailable", "Borrower not eligible", "Duplicate request", "Other reason"]);
    await reason.selectOption("EQUIPMENT_UNAVAILABLE");
    await expect(decline).toBeEnabled();
    await shot(page, testInfo, "08-custodian-decline-reason-selected");

    await decline.click();
    await expect(page.getByRole("status").filter({ hasText: "Request declined." })).toBeVisible();
    await expect(queued(page, ASSETS.decline.assetId)).toHaveCount(0);
    await shot(page, testInfo, "09-custodian-queue-after-decline");

    await borrower.page.reload();
    const declined = request(borrower.page, ASSETS.decline.assetId);
    await expect(declined).toContainText(`${ASSETS.decline.assetId} · DECLINED`);
    await expect(declined).toContainText("Reason: Equipment unavailable");
    expect(await mine(borrower.page, ASSETS.decline.assetId)).toMatchObject({ id: ids.decline, status: "DECLINED", closeReason: "EQUIPMENT_UNAVAILABLE" });
    await shot(borrower.page, testInfo, "10-borrower-a-request-declined-by-custodian");
    await borrower.close();
  });

  test("9. Unauthorized users cannot cancel or decline other users' requests (real API, real sessions)", async ({ browser }) => {
    const target = ids.cancelRetry; // Borrower B's PENDING request for KL-E01-MIC, assigned to Custodian A.
    const borrowerA = await signedIn(browser, "borrowerA");
    const custodianB = await signedIn(browser, "custodianB");
    const custodianA = await signedIn(browser, "custodianA");
    const borrowerB = await signedIn(browser, "borrowerB");
    try {
      // Another borrower: the request is outside their scope, reported as 404 (same convention as checkout).
      expect((await api(borrowerA.page, "POST", `/requests/${target}/cancel`)).status).toBe(404);
      // Wrong role for the action: 403.
      expect((await api(borrowerA.page, "POST", `/requests/${target}/decline`, { reason: "OTHER" })).status).toBe(403);
      expect((await api(custodianA.page, "POST", `/requests/${target}/cancel`)).status).toBe(403);
      // A custodian not assigned to the asset: 404.
      expect((await api(custodianB.page, "POST", `/requests/${target}/decline`, { reason: "OTHER" })).status).toBe(404);
      // Owner, but no CSRF token: 403. A client-supplied status or a system-only reason: 400.
      const noCsrf = await borrowerB.page.request.post(`${API_BASE}/requests/${target}/cancel`, { headers: { Origin: APP_ORIGIN } });
      expect(noCsrf.status()).toBe(403);
      expect((await api(borrowerB.page, "POST", `/requests/${target}/cancel`, { status: "CHECKED_OUT" })).status).toBe(400);
      expect((await api(custodianA.page, "POST", `/requests/${target}/decline`, { reason: "ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER" })).status).toBe(400);
      // A terminal request cannot be closed again or checked out: 409.
      expect((await api(borrowerB.page, "POST", `/requests/${ids.cancel}/cancel`)).status).toBe(409);
      expect((await api(custodianA.page, "POST", `/requests/${ids.decline}/decline`, { reason: "OTHER" })).status).toBe(409);
      const terminalCheckout = await api(custodianA.page, "POST", `/requests/${ids.contestB}/checkout`,
        { assetId: ASSETS.contest.assetId, dueAt: new Date(Date.now() + 7 * 864e5).toISOString() });
      expect(terminalCheckout.status).toBe(409);
      expect(terminalCheckout.body.error.code).toBe("REQUEST_NOT_PENDING");
      // Nothing above changed the request.
      expect(await mine(borrowerB.page, ASSETS.cancel.assetId, "PENDING")).toMatchObject({ id: target, closeReason: null });
    } finally {
      await Promise.all([borrowerA, custodianB, custodianA, borrowerB].map((session) => session.close()));
    }
  });

  test("10. A stale custodian queue shows the conflict message and refreshes when the borrower cancelled first", async ({ page, browser }, testInfo) => {
    const borrower = await signedIn(browser, "borrowerB");
    await requestFromCatalog(borrower.page, ASSETS.stale);
    const staleId = (await mine(borrower.page, ASSETS.stale.assetId)).id;

    // The custodian loads the queue, then the borrower cancels in their own browser.
    await login(page, "custodianA");
    const item = queued(page, ASSETS.stale.assetId);
    await expect(item).toHaveCount(1);
    await borrower.page.reload();
    await request(borrower.page, ASSETS.stale.assetId).getByRole("button", { name: `Cancel request for ${ASSETS.stale.name}` }).click();
    await expect(borrower.page.getByRole("status").filter({ hasText: "Request cancelled." })).toBeVisible();
    await borrower.close();

    // The custodian's page is stale: declining now returns 409; the UI shows why and refreshes the queue.
    await item.getByLabel(`Decline reason for ${ASSETS.stale.assetId}`).selectOption("DUPLICATE_REQUEST");
    await item.getByRole("button", { name: "Decline" }).click();
    await expect(page.getByRole("alert")).toHaveText("This request is no longer pending. Refresh to see its status.");
    await expect(queued(page, ASSETS.stale.assetId)).toHaveCount(0);
    await shot(page, testInfo, "11-custodian-stale-decline-conflict-message");
    expect(((await api(page, "GET", `/requests/${staleId}`)).body as { status: string }).status).toBe("CANCELLED");
  });
});
