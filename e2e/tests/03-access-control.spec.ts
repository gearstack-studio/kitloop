import { expect, test } from "@playwright/test";
import { API_BASE } from "../support/env";
import { api, evidence, login, pendingQueue } from "../support/helpers";

test.describe("Unauthorized access and role restrictions (UI)", () => {
  for (const route of ["/dashboard", "/requests"]) {
    test(`anonymous visitor is redirected from ${route} to /login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Equipment catalog" })).toHaveCount(0);
    });
  }

  test("a custodian is redirected away from the borrower page and has no borrower controls", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    await page.goto("/requests");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("CUSTODIAN WORKSPACE")).toBeVisible();
    await expect(page.getByRole("link", { name: "My Requests page" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Request to borrow/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Request equipment" })).toHaveCount(0);
    await evidence(page, testInfo, "custodian-no-borrower-controls");
  });

  test("a borrower has no checkout or custodian queue controls", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await expect(page.getByRole("button", { name: "Check out" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Pending requests" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Active loans" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "My requests" })).toBeVisible();
    await evidence(page, testInfo, "borrower-no-custodian-controls");
  });
});

test.describe("Unauthorized access (API, no session)", () => {
  test("protected endpoints answer 401 without a session", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext();
    for (const path of ["/assets", "/requests/mine", "/requests/pending", "/loans/mine", "/loans/active", "/auth/me"]) {
      const response = await anonymous.get(`${API_BASE}${path}`);
      expect(response.status(), path).toBe(401);
    }
    await anonymous.dispose();
  });
});

// Role and scope restrictions that the UI never offers a path to. These use the real API with a real signed-in
// browser session (cookie, Origin and CSRF token exactly as the app sends them). They prove server enforcement.
test.describe("Role and scope restrictions (API, signed-in sessions)", () => {
  test.describe.configure({ mode: "serial" });
  let requestId = "";

  test("setup: Borrower A requests KL-ACC-001 (assigned to Custodian A)", async ({ page }) => {
    await login(page, "borrowerA");
    const created = await api(page, "POST", "/requests", { assetId: "KL-ACC-001" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ assetId: "KL-ACC-001", status: "PENDING" });
    requestId = created.body.id;
  });

  test("a borrower cannot check out a request (403) and the request stays PENDING", async ({ page }) => {
    await login(page, "borrowerA");
    const attempt = await api(page, "POST", `/requests/${requestId}/checkout`, { assetId: "KL-ACC-001", dueAt: new Date(Date.now() + 7 * 864e5).toISOString() });
    expect(attempt.status).toBe(403);
    expect((await api(page, "GET", `/requests/${requestId}`)).body.status).toBe("PENDING");
  });

  test("a custodian cannot submit a borrow request (403)", async ({ page }) => {
    await login(page, "custodianA");
    expect((await api(page, "POST", "/requests", { assetId: "KL-ACC-001" })).status).toBe(403);
  });

  test("BR-05: an unassigned custodian cannot read or check out the request, and no loan is created", async ({ page }) => {
    await login(page, "custodianB");
    const body = { assetId: "KL-ACC-001", dueAt: new Date(Date.now() + 7 * 864e5).toISOString() };
    expect((await api(page, "GET", `/requests/${requestId}`)).status).toBe(404);
    expect((await api(page, "POST", `/requests/${requestId}/checkout`, body)).status).toBe(404);
    const queue = await api(page, "GET", "/requests/pending");
    expect(queue.body.map((item: { id: string }) => item.id)).not.toContain(requestId);
    expect((await api(page, "GET", "/loans/active")).body.filter((loan: { assetId: string }) => loan.assetId === "KL-ACC-001")).toHaveLength(0);
  });

  test("BR-05: the assigned custodian sees it in the queue (UI) and the request is still PENDING", async ({ page }, testInfo) => {
    await login(page, "custodianA");
    await expect(pendingQueue(page).getByRole("article").filter({ hasText: "KL-ACC-001 · PENDING" })).toHaveCount(1);
    expect((await api(page, "GET", `/requests/${requestId}`)).body.status).toBe("PENDING");
    await evidence(page, testInfo, "assigned-custodian-sees-request");
  });

  test("another borrower cannot read the request by direct ID (404) or see it in their list", async ({ page }) => {
    await login(page, "borrowerB");
    expect((await api(page, "GET", `/requests/${requestId}`)).status).toBe(404);
    const mine = await api(page, "GET", "/requests/mine");
    expect(mine.body.map((item: { id: string }) => item.id)).not.toContain(requestId);
  });

  test("a past due date is rejected by the server (400) without creating a loan", async ({ page }) => {
    await login(page, "custodianA");
    const attempt = await api(page, "POST", `/requests/${requestId}/checkout`, { assetId: "KL-ACC-001", dueAt: new Date(Date.now() - 864e5).toISOString() });
    expect(attempt.status).toBe(400);
    expect((await api(page, "GET", "/loans/active")).body.filter((loan: { assetId: string }) => loan.assetId === "KL-ACC-001")).toHaveLength(0);
  });
});
