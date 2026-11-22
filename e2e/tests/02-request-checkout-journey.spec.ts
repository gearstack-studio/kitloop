import { expect, test, type Page } from "@playwright/test";
import { activeLoans, card, evidence, futureLocal, login, myLoans, myRequests, pendingQueue, signOut } from "../support/helpers";

// One continuous journey on a fresh database:
//   Borrower request (PENDING) -> assigned Custodian's queue (BR-05) -> checkout -> ACTIVE loan -> availability update.
// Tests run in order and build on each other's data.
test.describe.configure({ mode: "serial" });

async function requestFromCatalog(page: Page, assetId: string) {
  await card(page, assetId).getByRole("button", { name: new RegExp(`Request to borrow .*${assetId}`) }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByLabel("Available equipment")).toHaveValue(assetId);
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Borrow request submitted with PENDING status.")).toBeVisible();
}

test.describe("FEAT-03 request -> BR-05 custodian queue -> FEAT-04 checkout -> availability", () => {
  test("Borrower A requests KL-CAM-001; it is PENDING and does not reserve the asset", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await requestFromCatalog(page, "KL-CAM-001");
    await expect(myRequests(page).getByRole("article").filter({ hasText: "KL-CAM-001 · PENDING" })).toHaveCount(1);
    await evidence(page, testInfo, "request-submitted");

    // A pending request is not a reservation: the catalog still offers the asset, also after a reload.
    await page.getByRole("link", { name: "Equipment dashboard" }).click();
    await page.reload();
    await expect(card(page, "KL-CAM-001").getByText("Available", { exact: true })).toBeVisible();
    // UAT-F03 (#57): the borrower's own pending request disables a duplicate request from the catalog card.
    await expect(card(page, "KL-CAM-001").getByRole("button", { name: /Request pending: you already have a pending request/ })).toBeDisabled();
    await expect(myLoans(page).getByRole("article")).toHaveCount(0);

    // The PENDING request persists across a reload.
    await page.getByRole("link", { name: "My requests" }).click();
    await page.reload();
    await expect(myRequests(page).getByRole("article").filter({ hasText: "KL-CAM-001 · PENDING" })).toHaveCount(1);
  });

  test("Borrower A requests the other custodian's laptop; Borrower B competes for KL-CAM-001", async ({ page }) => {
    await login(page, "borrowerA");
    await requestFromCatalog(page, "KL-LAP-001");
    await expect(myRequests(page).getByRole("article")).toHaveCount(2);
    await signOut(page);

    await login(page, "borrowerB");
    await expect(page.getByRole("link", { name: "My requests" })).toBeVisible();
    await requestFromCatalog(page, "KL-CAM-001");
    // Borrower B only ever sees their own request.
    await expect(myRequests(page).getByRole("article")).toHaveCount(1);
    await expect(myRequests(page).getByRole("article")).toContainText("KL-CAM-001 · PENDING");
  });

  test("BR-05: the assigned custodian sees the pending requests for their assets, and they persist after reload", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    const queue = pendingQueue(page).getByRole("article");
    await expect(queue).toHaveCount(2);
    await expect(queue.nth(0)).toContainText("KL-CAM-001 · PENDING");
    await expect(queue.nth(0)).toContainText("Borrower: e2e.borrower.a");
    await expect(queue.nth(1)).toContainText("Borrower: e2e.borrower.b");
    await expect(pendingQueue(page).getByText("KL-LAP-001")).toHaveCount(0);
    await evidence(page, testInfo, "custodian-a-queue");

    await page.reload();
    await expect(pendingQueue(page).getByRole("article")).toHaveCount(2);
    await expect(pendingQueue(page).getByText("2 records")).toBeVisible();
  });

  test("BR-05: the unassigned custodian does not see another custodian's requests", async ({ page }, testInfo) => {
    await login(page, "custodianB");
    const queue = pendingQueue(page).getByRole("article");
    await expect(queue).toHaveCount(1);
    await expect(queue).toContainText("KL-LAP-001 · PENDING");
    await expect(queue).toContainText("Borrower: e2e.borrower.a");
    await expect(pendingQueue(page).getByText("KL-CAM-001")).toHaveCount(0);
    await evidence(page, testInfo, "custodian-b-queue");
  });

  test("Custodian A checks out Borrower A's request and an ACTIVE loan appears", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    const form = pendingQueue(page).getByRole("article").filter({ hasText: "Borrower: e2e.borrower.a" });
    const due = form.getByLabel("Due date for KL-CAM-001");

    // A due date in the past is refused in the UI and nothing changes.
    await due.fill(futureLocal(-2));
    await form.getByRole("button", { name: "Check out" }).click();
    await expect(form.getByRole("alert")).toHaveText("Choose a valid due date later than the checkout time.");
    await expect(activeLoans(page).getByRole("article")).toHaveCount(0);

    await due.fill(futureLocal(14));
    await form.getByRole("button", { name: "Check out" }).click();
    await expect(page.getByText("Checkout recorded. Request CHECKED_OUT and active loan created.")).toBeVisible();

    // The request leaves the queue and one ACTIVE loan is shown. UAT-E01 (#61): Borrower B's competing request is
    // declined by the same checkout, so it leaves the actionable queue too.
    await expect(pendingQueue(page).getByRole("article")).toHaveCount(0);
    const loans = activeLoans(page).getByRole("article");
    await expect(loans).toHaveCount(1);
    // UAT-E03 (#63): the equipment name is the primary label; the Asset ID stays as secondary text.
    await expect(loans).toContainText("Mirrorless camera · ACTIVE");
    await expect(loans).toContainText("KL-CAM-001");
    await expect(loans).toContainText("Checked out by");
    await evidence(page, testInfo, "checkout-success");

    await page.reload();
    await expect(activeLoans(page).getByRole("article")).toHaveCount(1);
  });

  test("Availability (custodian view): KL-CAM-001 is Checked out, KL-CAM-002 is still Available, no competing checkout is offered", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    await expect(card(page, "KL-CAM-001").getByText("Checked out", { exact: true })).toBeVisible();
    await expect(card(page, "KL-CAM-002").getByText("Available", { exact: true })).toBeVisible();

    // UAT-E01 (#61): the competing request was declined at checkout, so there is nothing left to check out.
    await expect(pendingQueue(page).getByRole("article").filter({ hasText: "Borrower: e2e.borrower.b" })).toHaveCount(0);
    await evidence(page, testInfo, "custodian-availability");
  });

  test("Availability (Borrower A view): asset unavailable, request CHECKED_OUT, loan ACTIVE, persisted after reload", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await expect(card(page, "KL-CAM-001").getByText("Checked out", { exact: true })).toBeVisible();
    await expect(card(page, "KL-CAM-001").getByRole("button", { name: /is checked out and cannot be requested/ })).toBeDisabled();
    await expect(myRequests(page).getByRole("article").filter({ hasText: "KL-CAM-001 · CHECKED_OUT" })).toHaveCount(1);
    await expect(myRequests(page).getByRole("article").filter({ hasText: "KL-LAP-001 · PENDING" })).toHaveCount(1);
    await expect(myLoans(page).getByRole("article")).toContainText("Mirrorless camera · ACTIVE");
    await expect(myLoans(page).getByRole("article")).toContainText("KL-CAM-001");
    await evidence(page, testInfo, "borrower-a-after-checkout");

    await page.reload();
    await expect(card(page, "KL-CAM-001").getByText("Checked out", { exact: true })).toBeVisible();
    await expect(myLoans(page).getByRole("article")).toHaveCount(1);
  });

  test("Availability (Borrower B view): the checked-out asset can no longer be requested; own request was DECLINED with a reason", async ({ page }) => {
    await login(page, "borrowerB");
    await expect(card(page, "KL-CAM-001").getByText("Checked out", { exact: true })).toBeVisible();
    // UAT-E01 (#61): the competing request is closed, not left PENDING.
    await expect(myRequests(page).getByRole("article")).toContainText("KL-CAM-001 · DECLINED");
    await expect(myRequests(page).getByRole("article")).toContainText("Reason: Equipment was checked out to another borrower");
    await page.getByRole("link", { name: "My requests" }).click();
    await expect(page.getByLabel("Available equipment").locator("option", { hasText: "KL-CAM-001" })).toHaveCount(0);
  });
});
