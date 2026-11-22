import { createRequire } from "node:module";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { DB_NAME, SERVER_DIR, e2eDatabaseUrl } from "../support/env";
import { api, card, futureLocal, login, myRequests, pendingQueue } from "../support/helpers";
import { captureEvidence } from "../support/evidence";

// UAT-E02 (#62), BR-11, SRS OQ-01: checkout due dates are bounded by the configured maximum loan duration. The e2e API
// runs with LOAN_MAX_DAYS=21 (playwright.config.ts), a TEST CONFIGURATION ONLY; the approved value is still undecided.
test.describe.configure({ mode: "serial" });

const MAX_DAYS = 21;
const ASSET = { assetId: "KL-E02-CAM", name: "Loan period camera" } as const;
const STALE = { assetId: "KL-E02-LEN", name: "Loan period lens" } as const;   // PR #73 P2 stale-maximum regression

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await captureEvidence(page, testInfo, "e02", name);
}
const queued = (page: Page) => pendingQueue(page).getByRole("article").filter({ hasText: ASSET.assetId });
const ids: Record<string, string> = {};

async function pendingRequestState(page: Page) {
  const list = (await api(page, "GET", "/requests/pending")).body as Array<{ id: string; status: string }>;
  const loans = (await api(page, "GET", "/loans/active")).body as Array<{ assetId: string }>;
  return { pending: list.some((item) => item.id === ids.request), loans: loans.filter((loan) => loan.assetId === ASSET.assetId).length };
}

test.beforeAll(async () => {
  const { PrismaClient } = createRequire(path.join(SERVER_DIR, "package.json"))("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: e2eDatabaseUrl() });
  try {
    const [{ db }] = (await prisma.$queryRawUnsafe("select current_database() as db")) as Array<{ db: string }>;
    if (db !== DB_NAME || !/^kitloop_e2e_/.test(db)) throw new Error(`Refusing to add loan-duration fixtures to "${db}"`);
    const custodian = await prisma.user.findUniqueOrThrow({ where: { username: "e2e.custodian.a" } });
    for (const asset of [ASSET, STALE]) {
      await prisma.asset.upsert({
        where: { assetId: asset.assetId }, update: {},
        create: { ...asset, category: "Loan period", description: "Synthetic e2e fixture: UAT-E02 loan-duration spec",
          custodianAssets: { create: { custodianId: custodian.id } } },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test.describe("UAT-E02 (#62) checkout due-date maximum in the browser", () => {
  test("1. The custodian's picker shows the maximum loan period and bounds the date", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await card(page, ASSET.assetId).getByRole("button", { name: `Request to borrow ${ASSET.name}, ${ASSET.assetId}` }).click();
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(myRequests(page).getByRole("article").filter({ hasText: `${ASSET.assetId} · PENDING` })).toHaveCount(1);
    await page.getByRole("button", { name: "Sign out" }).click();

    await login(page, "custodianA");
    await expect(queued(page)).toHaveCount(1);
    ids.request = ((await api(page, "GET", "/requests/pending")).body as Array<{ id: string; assetId: string }>)
      .find((item) => item.assetId === ASSET.assetId)!.id;
    const due = queued(page).getByLabel(`Due date for ${ASSET.assetId}`);
    await expect(queued(page)).toContainText(`Maximum loan period: ${MAX_DAYS} days from checkout.`);
    const [min, max] = [await due.getAttribute("min"), await due.getAttribute("max")];
    expect(min).toBeTruthy();
    expect(max).toBeTruthy();
    const span = new Date(max!).getTime() - new Date(min!).getTime();
    expect(span).toBeGreaterThan((MAX_DAYS - 1) * 86_400_000);
    expect(span).toBeLessThanOrEqual(MAX_DAYS * 86_400_000);
    await shot(page, testInfo, "01-custodian-picker-shows-maximum");
  });

  test("2. A due date beyond the maximum is refused in the browser and no checkout is sent", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    const posts: string[] = [];
    page.on("request", (req) => { if (req.method() === "POST" && req.url().includes("/checkout")) posts.push(req.url()); });
    await queued(page).getByLabel(`Due date for ${ASSET.assetId}`).fill(futureLocal(MAX_DAYS + 1));
    await queued(page).getByRole("button", { name: "Check out" }).click();
    await expect(queued(page).getByRole("alert")).toHaveText(`Choose a due date within ${MAX_DAYS} days of checkout.`);
    expect(posts).toEqual([]);
    expect(await pendingRequestState(page)).toEqual({ pending: true, loans: 0 });
    await shot(page, testInfo, "02-beyond-maximum-refused-in-browser");
  });

  test("3. The API refuses Team 7's year-9999 probe and a 100-year date; the request stays PENDING", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    for (const dueAt of ["9999-12-31T23:59:59Z", new Date(Date.now() + 100 * 365 * 86_400_000).toISOString()]) {
      const probe = await api(page, "POST", `/requests/${ids.request}/checkout`, { assetId: ASSET.assetId, dueAt });
      expect(probe.status).toBe(400);
      expect(probe.body.error).toMatchObject({ code: "VALIDATION_ERROR", message: `Choose a due date within ${MAX_DAYS} days of checkout` });
      expect(probe.body.error.fields.dueAt).toContain(`${MAX_DAYS} days`);
    }
    expect(await pendingRequestState(page)).toEqual({ pending: true, loans: 0 });
    await page.reload();
    await expect(queued(page)).toContainText(`${ASSET.assetId} · PENDING`);
    await shot(page, testInfo, "03-api-probe-refused-request-still-pending");
  });

  test("4. The latest allowed due date is accepted and an ACTIVE loan is created", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    const due = queued(page).getByLabel(`Due date for ${ASSET.assetId}`);
    await due.focus();
    await due.fill((await due.getAttribute("max"))!);
    await queued(page).getByRole("button", { name: "Check out" }).click();
    await expect(page.getByText(/Checkout recorded\. Request CHECKED_OUT and active loan created\./)).toBeVisible();
    expect(await pendingRequestState(page)).toEqual({ pending: false, loans: 1 });
    await shot(page, testInfo, "04-latest-allowed-due-date-checked-out");
  });

  // PR #73 review P2. Chromium's native constraint validation runs before React's submit handler. A date that was over
  // the picker's max when entered, and became valid while the form stayed open, must still check out: the stale DOM
  // max must not block the current-time validation. The browser clock starts one hour behind real time, so after it is
  // moved to real time the date is within the limit for both the browser and the real server.
  test("5. A due date that becomes valid while the form stays open checks out (stale picker maximum)", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await card(page, STALE.assetId).getByRole("button", { name: `Request to borrow ${STALE.name}, ${STALE.assetId}` }).click();
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(myRequests(page).getByRole("article").filter({ hasText: `${STALE.assetId} · PENDING` })).toHaveCount(1);
    await page.getByRole("button", { name: "Sign out" }).click();

    const browserStart = Date.now() - 3_600_000;
    await page.clock.install({ time: browserStart });
    await login(page, "custodianA");
    const form = pendingQueue(page).getByRole("article").filter({ hasText: STALE.assetId });
    const due = form.getByLabel(`Due date for ${STALE.assetId}`);
    const browserNow = await page.evaluate(() => Date.now());
    const chosen = new Date(browserNow + MAX_DAYS * 86_400_000 + 30 * 60_000);   // 30 minutes over the initial max
    const p = (n: number) => String(n).padStart(2, "0");
    const value = `${chosen.getFullYear()}-${p(chosen.getMonth() + 1)}-${p(chosen.getDate())}T${p(chosen.getHours())}:${p(chosen.getMinutes())}`;
    await due.fill(value);
    const staleMax = await due.getAttribute("max");
    expect(await due.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);

    await page.clock.setSystemTime(Date.now());                    // an hour passes; the input is not touched
    expect(await due.getAttribute("max")).toBe(staleMax);          // the DOM max is stale
    const posts: string[] = [];
    page.on("request", (req) => { if (req.method() === "POST" && req.url().includes("/checkout")) posts.push(req.url()); });
    await form.getByRole("button", { name: "Check out" }).click();

    await expect(page.getByText(/Checkout recorded\. Request CHECKED_OUT and active loan created\./)).toBeVisible();
    expect(posts).toHaveLength(1);
    const loan = ((await api(page, "GET", "/loans/active")).body as Array<{ assetId: string; dueAt: string }>)
      .find((item) => item.assetId === STALE.assetId);
    expect(loan?.dueAt).toBe(new Date(value).toISOString());
    await shot(page, testInfo, "05-stale-maximum-date-checked-out");
  });
});
