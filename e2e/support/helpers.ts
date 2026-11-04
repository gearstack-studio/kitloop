import { expect, type Page, type TestInfo } from "@playwright/test";
import { API_BASE, APP_ORIGIN, USERS, type UserKey } from "./env";

export function credentials(key: UserKey) {
  const user = USERS[key];
  const password = process.env[user.envKey];
  if (!password) throw new Error(`${user.envKey} is not set. Run the tests through "npm run test:e2e" so global setup creates the e2e database and credentials.`);
  return { username: user.username, password };
}

export async function login(page: Page, key: UserKey) {
  const { username, password } = credentials(key);
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText(/(BORROWER|CUSTODIAN) WORKSPACE/)).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
}

export const catalog = (page: Page) => page.getByRole("region", { name: "Equipment catalog" });
export const card = (page: Page, assetId: string) => catalog(page).getByRole("article").filter({ hasText: assetId });
export const myRequests = (page: Page) => page.getByRole("region", { name: "My requests" });
export const pendingQueue = (page: Page) => page.getByRole("region", { name: "Pending requests" });
export const myLoans = (page: Page) => page.getByRole("region", { name: "My loans" });
export const activeLoans = (page: Page) => page.getByRole("region", { name: "Active loans" });

/** Local date-time string accepted by <input type="datetime-local">, `days` from now. */
export function futureLocal(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Saves a full-page screenshot to the HTML report so passing runs also leave visual evidence. */
export async function evidence(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

/**
 * Calls the real API with the signed-in browser context's session cookie. Mutating calls send the Origin and CSRF
 * token a browser page would. Used only where the UI offers no path to the request (role/scope restriction checks).
 */
export async function api(page: Page, method: "GET" | "POST", apiPath: string, body?: object) {
  let csrf = "";
  if (method !== "GET") {
    const me = await page.request.get(`${API_BASE}/auth/me`);
    csrf = me.headers()["x-csrf-token"] ?? "";
  }
  const response = await page.request.fetch(`${API_BASE}${apiPath}`, {
    method,
    headers: { Origin: APP_ORIGIN, ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
    ...(body ? { data: body } : {}),
  });
  let json: unknown = null;
  try { json = await response.json(); } catch { /* empty body */ }
  return { status: response.status(), body: json as any };
}
