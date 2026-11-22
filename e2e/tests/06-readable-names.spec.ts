import { createRequire } from "node:module";
import path from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { API_BASE, DB_NAME, SERVER_DIR, e2eDatabaseUrl } from "../support/env";
import { activeLoans, card, futureLocal, login, myLoans, myRequests, pendingQueue } from "../support/helpers";
import { captureEvidence } from "../support/evidence";

// UAT-E03 (#63): the signed-in user, equipment, borrowers and checkout custodians are shown by name in the real
// browser; UUIDs are only secondary "Record IDs". Synthetic e2e data only.
test.describe.configure({ mode: "serial" });

const LOANED = { assetId: "KL-E03-CAM", name: "Readable names camera" } as const;    // Borrower A, checked out
const PENDING = { assetId: "KL-E03-MIC", name: "Readable names microphone" } as const; // Borrower B, pending
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await captureEvidence(page, testInfo, "e03", name);
}
/** Text a sighted user sees in a record: collapsed <details> (secondary Record IDs) excluded. */
async function visible(record: Locator) {
  return record.evaluate((element) => {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll("details:not([open])").forEach((node) => node.remove());
    return clone.textContent ?? "";
  });
}
async function expectNoAccountUuid(page: Page) {
  await expect(page.getByText(/Account [0-9a-f]{8}/)).toHaveCount(0);
}
async function requestAs(page: Page, asset: { assetId: string; name: string }) {
  await card(page, asset.assetId).getByRole("button", { name: `Request to borrow ${asset.name}, ${asset.assetId}` }).click();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(myRequests(page).getByRole("article").filter({ hasText: asset.name })).toHaveCount(1);
}

test.beforeAll(async () => {
  const { PrismaClient } = createRequire(path.join(SERVER_DIR, "package.json"))("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: e2eDatabaseUrl() });
  try {
    const [{ db }] = (await prisma.$queryRawUnsafe("select current_database() as db")) as Array<{ db: string }>;
    if (db !== DB_NAME || !/^kitloop_e2e_/.test(db)) throw new Error(`Refusing to add readable-name fixtures to "${db}"`);
    const custodian = await prisma.user.findUniqueOrThrow({ where: { username: "e2e.custodian.a" } });
    for (const asset of [LOANED, PENDING]) {
      await prisma.asset.upsert({
        where: { assetId: asset.assetId }, update: {},
        create: { ...asset, category: "Readable names", description: "Synthetic e2e fixture: UAT-E03 readable-names spec",
          custodianAssets: { create: { custodianId: custodian.id } } },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test.describe("UAT-E03 (#63) readable user and equipment names in the browser", () => {
  test("setup: Borrower A's request is checked out by Custodian A; Borrower B's request is pending", async ({ page }) => {
    await login(page, "borrowerA");
    await requestAs(page, LOANED);
    await page.getByRole("button", { name: "Sign out" }).click();
    await login(page, "borrowerB");
    await requestAs(page, PENDING);
    await page.getByRole("button", { name: "Sign out" }).click();
    await login(page, "custodianA");
    const form = pendingQueue(page).getByRole("article").filter({ hasText: LOANED.name });
    await form.getByLabel(`Due date for ${LOANED.assetId}`).fill(futureLocal(7));
    await form.getByRole("button", { name: "Check out" }).click();
    await expect(page.getByText(/Checkout recorded/)).toBeVisible();
  });

  test("1. Borrower header and dashboard show the username, not an account UUID", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await expect(page.locator(".identity-tag")).toHaveText("Signed in as e2e.borrower.a");
    await expectNoAccountUuid(page);
    await shot(page, testInfo, "01-borrower-dashboard-header");
  });

  test("2. Borrower My requests shows equipment names; request IDs are secondary", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await page.getByRole("link", { name: "My requests" }).click();
    const record = myRequests(page).getByRole("article").filter({ hasText: LOANED.name });
    await expect(record).toContainText(`${LOANED.assetId} · CHECKED_OUT`);
    expect(await visible(record)).not.toMatch(UUID);
    await expect(record.locator("details summary")).toHaveText("Record IDs");
    await shot(page, testInfo, "02-borrower-my-requests");
  });

  test("3. Borrower My loans shows the equipment by name and no custodian identity", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    const record = myLoans(page).getByRole("article").filter({ hasText: LOANED.name });
    await expect(record).toContainText(`${LOANED.name} · ACTIVE`);
    await expect(record).toContainText("Due ");
    // Final privacy audit (FR-11): neither the page nor the borrower's loan API carries a custodian username.
    await expect(record).not.toContainText("Checked out by");
    await expect(record).not.toContainText("e2e.custodian");
    const response = await page.request.get(`${API_BASE}/loans/mine`);
    expect(await response.text()).not.toContain("e2e.custodian");
    expect(await visible(record)).not.toMatch(UUID);
    await record.scrollIntoViewIfNeeded();
    await shot(page, testInfo, "03-borrower-my-loans");
  });

  test("4. Custodian Pending requests shows borrower and equipment names; actions remain", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    await expect(page.locator(".identity-tag")).toHaveText("Signed in as e2e.custodian.a");
    await expectNoAccountUuid(page);
    const record = pendingQueue(page).getByRole("article").filter({ hasText: PENDING.name });
    await expect(record).toContainText("Borrower: e2e.borrower.b");
    expect(await visible(record)).not.toMatch(UUID);
    await expect(record.getByRole("button", { name: "Check out" })).toBeVisible();
    await expect(record.getByLabel(`Decline reason for ${PENDING.assetId}`)).toBeVisible();
    await shot(page, testInfo, "04-custodian-pending-requests");
  });

  test("5. Custodian Active loans shows equipment, borrower and checkout custodian names", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    const record = activeLoans(page).getByRole("article").filter({ hasText: LOANED.name });
    await expect(record).toContainText(`${LOANED.name} · ACTIVE`);
    await expect(record).toContainText("Borrower: e2e.borrower.a");
    await expect(record).toContainText("Checked out by: e2e.custodian.a");
    expect(await visible(record)).not.toMatch(UUID);
    await record.locator("summary").click();                  // IDs stay available for testers
    await expect(record.locator("details")).toContainText("Loan ");
    await expect(record.locator("details")).toContainText(UUID);
    await shot(page, testInfo, "05-custodian-active-loans-ids-expanded");
  });

  test("6. Mobile layout keeps names readable without horizontal scrolling", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      for (const [key, name, file] of [["borrowerA", "e2e.borrower.a", "06-mobile-borrower"], ["custodianA", "e2e.custodian.a", "07-mobile-custodian"]] as const) {
        await login(page, key);
        await expect(page.locator(".identity-tag")).toHaveText(`Signed in as ${name}`);
        await expect(page.locator(".identity-tag")).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await shot(page, testInfo, file);
        await page.getByRole("button", { name: "Sign out" }).click();
      }
    } finally {
      await context.close();
    }
  });
});
