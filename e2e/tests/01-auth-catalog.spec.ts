import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { card, catalog, credentials, evidence, login, signOut } from "../support/helpers";

test.describe("Borrower login and equipment catalog", () => {
  test("rejects invalid credentials with one generic message", async ({ page }, testInfo) => {
    await page.goto("/login");
    // Unknown user, then a real user with a wrong (random) password: the message must not reveal which part was wrong.
    await page.getByLabel("Username").fill(`nobody-${randomUUID()}`);
    await page.getByLabel("Password").fill(randomUUID());
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("alert")).toHaveText("Invalid username or password.");

    await page.getByLabel("Username").fill(credentials("borrowerA").username);
    await page.getByLabel("Password").fill(randomUUID());
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("alert")).toHaveText("Invalid username or password.");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/WORKSPACE/)).toHaveCount(0);
    await evidence(page, testInfo, "invalid-credentials");
  });

  test("borrower signs in and sees the equipment catalog", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("BORROWER WORKSPACE")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Equipment catalog" })).toBeVisible();
    const cards = catalog(page).getByRole("article");
    await expect(cards).toHaveCount(4);
    // Ordered by name then Asset ID; two cameras share a name but have distinct IDs; the retired asset is not listed.
    await expect(cards.getByRole("heading", { level: 3 })).toHaveText(["Access-control microphone", "Development laptop", "Mirrorless camera", "Mirrorless camera"]);
    await expect(cards.locator("code")).toHaveText(["KL-ACC-001", "KL-LAP-001", "KL-CAM-001", "KL-CAM-002"]);
    await expect(catalog(page).getByText("KL-OLD-001")).toHaveCount(0);
    await expect(catalog(page).getByText("Available", { exact: true })).toHaveCount(4);
    await expect(card(page, "KL-CAM-001").getByRole("button", { name: /Request to borrow Mirrorless camera, KL-CAM-001/ })).toBeEnabled();
    await evidence(page, testInfo, "borrower-catalog");
  });

  test("session survives a reload and sign out returns to login", async ({ page }) => {
    await login(page, "borrowerA");
    await page.reload();
    await expect(page.getByText("BORROWER WORKSPACE")).toBeVisible();
    await signOut(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
