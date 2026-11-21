import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { REPO_ROOT } from "../support/env";
import { evidence, login } from "../support/helpers";

// UAT-E04 (#64): borrowers see two persistent links, "Equipment dashboard" and "My requests", with the current page
// marked visually and by aria-current="page". Read-only journey: sign in and navigate; no records are written.
const SHOTS = path.join(REPO_ROOT, "artifacts", "sprint-1", "uat");
mkdirSync(SHOTS, { recursive: true });

const nav = (page: Page) => page.getByRole("navigation", { name: "Borrower pages" });
const dashboardLink = (page: Page) => nav(page).getByRole("link", { name: "Equipment dashboard" });
const requestsLink = (page: Page) => nav(page).getByRole("link", { name: "My requests" });

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `uat-e04-e2e-${name}.png`), fullPage: true });
  await evidence(page, testInfo, name);
}

/** Both links visible on screen with real hrefs, and only `current` marked as the current page. */
async function expectCurrent(page: Page, current: "dashboard" | "requests") {
  await expect(page).toHaveURL(new RegExp(`/${current}$`));
  await expect(nav(page).getByRole("link")).toHaveText(["Equipment dashboard", "My requests"]);
  await expect(dashboardLink(page)).toBeVisible();
  await expect(requestsLink(page)).toBeVisible();
  await expect(dashboardLink(page)).toHaveAttribute("href", "/dashboard");
  await expect(requestsLink(page)).toHaveAttribute("href", "/requests");
  await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
  const [on, off] = current === "dashboard" ? [dashboardLink(page), requestsLink(page)] : [requestsLink(page), dashboardLink(page)];
  await expect(on).toHaveAttribute("aria-current", "page");
  await expect(off).not.toHaveAttribute("aria-current", /.*/);
  // The current page is distinguishable without relying on the attribute: a different fill from the other link.
  const fill = (locator: typeof on) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await fill(on)).not.toBe(await fill(off));
}

test.describe("UAT-E04 (#64) persistent borrower navigation", () => {
  test("both links are visible on each page; only the current page is marked", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await expectCurrent(page, "dashboard");
    await expect(page.getByRole("link", { name: "My Requests page" })).toHaveCount(0);   // old toggle label is gone
    await shot(page, testInfo, "01-dashboard-current");
    await requestsLink(page).click();
    await expectCurrent(page, "requests");
    await expect(page.getByRole("heading", { name: "Request equipment" })).toBeVisible();
    await shot(page, testInfo, "02-requests-current");
    await dashboardLink(page).click();
    await expectCurrent(page, "dashboard");
    await expect(page.getByRole("heading", { name: "Equipment catalog" })).toBeVisible();
  });

  test("direct URL access marks the requested page", async ({ page }) => {
    await login(page, "borrowerA");
    await page.goto("/requests");
    await expectCurrent(page, "requests");
    await page.goto("/dashboard");
    await expectCurrent(page, "dashboard");
  });

  test("keyboard: Tab reaches both links with a visible focus indicator and Enter navigates", async ({ page }, testInfo) => {
    await login(page, "borrowerA");
    await page.getByRole("button", { name: "Sign out" }).focus();
    await page.keyboard.press("Tab");
    await expect(dashboardLink(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(requestsLink(page)).toBeFocused();
    const outline = await requestsLink(page).evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await shot(page, testInfo, "03-keyboard-focus");
    await page.keyboard.press("Enter");
    await expectCurrent(page, "requests");
    await expect(requestsLink(page)).toBeFocused();   // focus is not lost after an in-app navigation
  });

  test("browser Back and Forward restore the route and its current marker", async ({ page }) => {
    await login(page, "borrowerA");
    await requestsLink(page).click();
    await expectCurrent(page, "requests");
    await page.goBack();
    await expectCurrent(page, "dashboard");
    await page.goForward();
    await expectCurrent(page, "requests");
  });

  for (const width of [360, 375, 390]) {
    test(`usable at ${width}px: both links fully visible, tappable, no horizontal scroll`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await login(page, "borrowerA");
      for (const current of ["dashboard", "requests"] as const) {
        if (current === "requests") await requestsLink(page).click();
        await expectCurrent(page, current);
        const boxes = await Promise.all([dashboardLink(page), requestsLink(page)].map(async (locator) => {
          const box = (await locator.boundingBox())!;
          const clipped = await locator.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
          return { ...box, clipped };
        }));
        for (const box of boxes) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(box.height).toBeGreaterThanOrEqual(44);   // touch target
          expect(box.clipped).toBe(false);                 // label not cut off
        }
        const [a, b] = boxes;
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap).toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await shot(page, testInfo, `04-${width}-${current}`);
      }
    });
  }

  test("custodians do not get the borrower navigation", async ({ page }) => {
    await login(page, "custodianA");
    await expect(page.getByText("CUSTODIAN WORKSPACE")).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Equipment dashboard" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "My requests" })).toHaveCount(0);
  });

  for (const route of ["/dashboard", "/requests"]) {
    test(`signed out: ${route} still redirects to sign in, with no borrower navigation`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      await expect(nav(page)).toHaveCount(0);
    });
  }
});
