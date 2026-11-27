import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { api, card, evidence, myRequests } from "../support/helpers";
import { QUOTA_USERS } from "../support/quota-global-setup";

// CR-01 STS spec 09: the borrowing quota in a real browser against the real, quota-ENABLED API and an isolated
// database (kitloop_e2e_quota). Run only through playwright.quota.config.ts. Covers TC11 (S1, S2, S6), TC12 (reload),
// TC18 (S1 cancel; S2 Refresh and route entry) and TC10 (isolation) at E level.
// Journeys run in order; each uses its own borrower. The only interception "holds" a REAL quota response: it is
// fetched from the API at once and delivered unchanged on release, so an intermediate state can be observed.
test.describe.configure({ mode: "serial" });

type QuotaUser = keyof typeof QUOTA_USERS;
const QUOTA_PATH = "/api/borrowing-quota";
const isQuotaGet = (r: Request) => r.method() === "GET" && new URL(r.url()).pathname === QUOTA_PATH;
const isRequestPost = (r: Request) => r.method() === "POST" && new URL(r.url()).pathname === "/api/requests";

const panel = (page: Page) => page.getByRole("region", { name: "Borrowing limit" });
const selector = (page: Page) => page.getByLabel("Available equipment");
const submit = (page: Page) => page.getByRole("button", { name: "Submit request" });

async function signIn(page: Page, key: QuotaUser) {
  const { username, envKey } = QUOTA_USERS[key];
  const password = process.env[envKey];
  if (!password) throw new Error(`${envKey} is not set. Run through "npm run test:e2e:quota" so the quota global setup creates it.`);
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText(/(BORROWER|CUSTODIAN) WORKSPACE/)).toBeVisible();
}

async function openMyRequests(page: Page) {
  await page.getByRole("link", { name: "My requests" }).first().click();
  await expect(page.getByRole("heading", { name: "Request equipment" })).toBeVisible();
}

async function submitViaForm(page: Page, assetId: string, expectedUsage: string) {
  await expect(selector(page)).toBeEnabled();
  await selector(page).selectOption(assetId);
  await submit(page).click();
  await expect(page.getByText("Borrow request submitted with PENDING status.")).toBeVisible();
  await expect(panel(page)).toContainText(expectedUsage);
}

/** Holds the real quota response: requested from the API immediately, delivered unchanged only after release(). */
async function holdQuota(page: Page) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const handler = async (route: Route) => {
    const response = await route.fetch();
    await released;
    await route.fulfill({ response });
  };
  await page.route(`**${QUOTA_PATH}`, handler);
  return { release: () => release(), stop: () => page.unroute(`**${QUOTA_PATH}`, handler) };
}

test.describe("CR-01 borrowing quota in the browser (spec 09)", () => {
  test("TC11 S1/S2: capacity is shown and the limit disables the form and catalog", async ({ page }, testInfo) => {
    await signIn(page, "b1");
    await openMyRequests(page);
    await expect(panel(page)).toContainText("0 of 2 pending requests");
    await submitViaForm(page, "KL-Q-001", "1 of 2 pending requests");
    await expect(panel(page)).toContainText("You can submit 1 more request.");
    await submitViaForm(page, "KL-Q-002", "2 of 2 pending requests");
    await expect(panel(page)).toContainText("Limit reached.");
    await expect(selector(page)).toBeDisabled();
    await expect(submit(page)).toBeDisabled();
    await evidence(page, testInfo, "tc11-s2-limit-reached");

    await page.getByRole("link", { name: "Equipment dashboard" }).first().click();
    const limited = card(page, "KL-Q-003").getByRole("button", { name: "Request limit reached: Quota item 3, KL-Q-003 cannot be requested now" });
    await expect(limited).toBeDisabled();
    await expect(limited).toHaveText("Limit reached");
    await expect(card(page, "KL-Q-001").getByRole("button", { name: /^Request pending/ })).toBeDisabled();
  });

  test("TC12 (E): a reload reads the quota from the server again and nothing is cached in the browser", async ({ page }) => {
    await signIn(page, "b1");
    await openMyRequests(page);
    await expect(panel(page)).toContainText("2 of 2 pending requests");
    const reread = page.waitForResponse((r) => isQuotaGet(r.request()) && r.status() === 200);
    await page.reload();
    expect(await (await reread).json()).toEqual({ pendingRequests: 2, maxPendingRequests: 2, remainingRequestCapacity: 0, canSubmitRequest: false });
    await expect(panel(page)).toContainText("2 of 2 pending requests");
    await expect(myRequests(page).getByRole("article").filter({ hasText: "· PENDING" })).toHaveCount(2);
    const stored = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
    expect(stored.filter((key) => /quota|borrow/i.test(key))).toEqual([]);
  });

  test("TC18 S1: cancelling re-reads the quota and re-enables submission", async ({ page }) => {
    await signIn(page, "b1");
    await openMyRequests(page);
    await expect(panel(page)).toContainText("2 of 2 pending requests");
    const events: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/cancel")) events.push("cancel");
      if (isQuotaGet(r)) events.push("quota");
    });
    await page.getByRole("button", { name: "Cancel request for Quota item 1" }).click();
    await expect(page.getByText("Request cancelled.")).toBeVisible();
    await expect(panel(page)).toContainText("1 of 2 pending requests");
    const cancelAt = events.indexOf("cancel");
    expect(cancelAt).toBeGreaterThanOrEqual(0);
    expect(events.slice(cancelAt + 1)).toContain("quota");
    await expect(selector(page)).toBeEnabled();
  });

  test("TC11 S6: a stale page gets the server's 409, shows it, re-reads the quota and sends one POST", async ({ page }, testInfo) => {
    await signIn(page, "b2");
    await openMyRequests(page);
    await submitViaForm(page, "KL-Q-003", "1 of 2 pending requests");
    // Another tab of the same borrower takes the last slot; this page still shows 1 of 2.
    expect((await api(page, "POST", "/requests", { assetId: "KL-Q-004" })).status).toBe(201);
    await expect(panel(page)).toContainText("1 of 2 pending requests");

    const events: string[] = [];
    page.on("request", (r) => { if (isRequestPost(r)) events.push("post"); if (isQuotaGet(r)) events.push("quota"); });
    await selector(page).selectOption("KL-Q-005");
    const [response] = await Promise.all([page.waitForResponse((r) => isRequestPost(r.request())), submit(page).click()]);
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("BORROWING_QUOTA_EXCEEDED");
    await expect(page.getByText(body.error.message)).toBeVisible();
    await expect(page.getByText("Borrow request submitted with PENDING status.")).toHaveCount(0);
    await expect(panel(page)).toContainText("2 of 2 pending requests");
    await expect(submit(page)).toBeDisabled();
    expect(events.filter((e) => e === "post")).toHaveLength(1);
    expect(events.slice(events.indexOf("post") + 1)).toContain("quota");
    await evidence(page, testInfo, "tc11-s6-stale-409");
  });

  test("TC18 S2 (Refresh): another user's decline is shown only after a real quota re-read", async ({ page, browser }, testInfo) => {
    const custodianContext = await browser.newContext();
    const custodian = await custodianContext.newPage();
    await signIn(custodian, "custodian");

    await signIn(page, "b3");
    await openMyRequests(page);
    await submitViaForm(page, "KL-Q-006", "1 of 2 pending requests");
    await submitViaForm(page, "KL-Q-007", "2 of 2 pending requests");
    const mine = (await api(page, "GET", "/requests/mine")).body as Array<{ id: string; assetId: string; status: string }>;
    const target = mine.find((item) => item.assetId === "KL-Q-006" && item.status === "PENDING")!;
    const declined = await api(custodian, "POST", `/requests/${target.id}/decline`, { reason: "BORROWER_NOT_ELIGIBLE" });
    expect(declined.status).toBe(200);
    await expect(panel(page)).toContainText("2 of 2 pending requests"); // nothing re-read yet

    const hold = await holdQuota(page);
    const issued = page.waitForRequest(isQuotaGet);
    await page.getByRole("button", { name: "Refresh borrowing limit" }).click();
    await issued; // the click itself sent a real GET /api/borrowing-quota
    await expect(panel(page)).toContainText("Loading borrowing limit…");
    await expect(selector(page)).toBeDisabled();
    await expect(submit(page)).toBeDisabled();
    await evidence(page, testInfo, "tc18-s2-refresh-pending");

    const delivered = page.waitForResponse((r) => isQuotaGet(r.request()));
    hold.release();
    const response = await delivered;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ pendingRequests: 1, maxPendingRequests: 2, remainingRequestCapacity: 1, canSubmitRequest: true });
    await hold.stop();
    await expect(panel(page)).toContainText("1 of 2 pending requests");
    await submitViaForm(page, "KL-Q-008", "2 of 2 pending requests");
    await custodianContext.close();
  });

  test("TC18 S2 (route entry): entering My requests invalidates the held quota; no POST while the re-read is pending", async ({ page }) => {
    await signIn(page, "b4"); // the dashboard loads the quota as 0 of 2
    // Two other tabs take both slots; this page still holds 0 of 2 and offers "Request to borrow".
    expect((await api(page, "POST", "/requests", { assetId: "KL-Q-001" })).status).toBe(201);
    expect((await api(page, "POST", "/requests", { assetId: "KL-Q-002" })).status).toBe(201);
    const posts: string[] = [];
    page.on("request", (r) => { if (isRequestPost(r)) posts.push(r.url()); });

    const hold = await holdQuota(page);
    const issued = page.waitForRequest(isQuotaGet);
    await card(page, "KL-Q-005").getByRole("button", { name: "Request to borrow Quota item 5, KL-Q-005" }).click();
    await expect(page).toHaveURL(/\/requests$/);
    await issued;
    await expect(panel(page)).toContainText("Loading borrowing limit…");
    await expect(selector(page)).toBeDisabled();
    await expect(submit(page)).toBeDisabled();
    await submit(page).click({ force: true, timeout: 2_000 }).catch(() => { /* a disabled button cannot be clicked */ });
    await page.locator("form.request-form").dispatchEvent("submit");
    expect(posts).toHaveLength(0);

    const delivered = page.waitForResponse((r) => isQuotaGet(r.request()));
    hold.release();
    await delivered;
    await hold.stop();
    await expect(panel(page)).toContainText("2 of 2 pending requests");
    await expect(submit(page)).toBeDisabled();
    expect(posts).toHaveLength(0);
  });

  test("TC10 (E): each borrower sees only their own quota and requests; query parameters are refused", async ({ page }) => {
    await signIn(page, "b5");
    await openMyRequests(page);
    await expect(panel(page)).toContainText("0 of 2 pending requests");
    await expect(myRequests(page).getByRole("article")).toHaveCount(0);
    const query = await api(page, "GET", "/borrowing-quota?borrowerId=e2e.quota.b1");
    expect(query.status).toBe(400);
    expect(query.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(query.body)).not.toContain("pendingRequests");
  });
});
