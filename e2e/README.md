# KitLoop browser end-to-end tests (Playwright)

Real-browser tests of the integrated app: React/Vite client, Express API and PostgreSQL. They cover login and the catalog, borrow requests, assigned-custodian visibility (BR-05), checkout and the ACTIVE loan, availability after checkout, and role/access restrictions.

This is a self-contained package (`e2e/`). Installing it does not touch `client/` or `server/` dependencies.

## One-time setup

Prerequisites: Node.js, PostgreSQL running locally, and the `server/` and `client/` dependencies installed (`npm ci` in each, as in the root README).

1. `server/.env.test` must exist (root README, "Verification"). The suite reads **only the PostgreSQL host, port, user and password** from it, to create its own separate database. It never writes to the database named in that file.
   - To use a different connection instead, set `E2E_ADMIN_DATABASE_URL` in your shell (a PostgreSQL URL for a role that may `CREATE`/`DROP DATABASE`).
2. From `e2e/`:
   ```
   npm ci
   npm run install:browsers
   ```
   `install:browsers` downloads Playwright's Chromium into your user cache (outside the repository). To use an installed system browser instead, skip it and set `E2E_BROWSER_CHANNEL=msedge` (or `chrome`).

## Running

From `e2e/`:

| Command | What it does |
| --- | --- |
| `npm run test:e2e` | Full suite, headless |
| `npm run test:e2e:headed` | Same, with a visible browser |
| `npx playwright test tests/02-request-checkout-journey.spec.ts` | One spec file |
| `npx playwright test -g "BR-05"` | Tests whose title matches |
| `npm run test:e2e:report` | Open the HTML report of the last run |
| `npm run typecheck` | Type-check the tests and support code |

Each invocation starts from scratch, so it can be re-run at will. Do **not** use `--repeat-each` or `--retries` to repeat a journey within one run: checkout cannot be undone until the return feature exists, so repeated attempts inside the same database would fail for legitimate reasons.

## How isolation and reproducibility work

- **Dedicated database.** Global setup drops and recreates `kitloop_e2e_pw` (override with `E2E_DB_NAME`; it must match `^kitloop_e2e_[a-z0-9_]+$`). It refuses to run if that name equals the database in `server/.env` or `server/.env.test`. The database is dropped again after the run; set `E2E_KEEP_DB=1` to keep it for inspection.
- **Migrations only.** `prisma migrate deploy` applies the committed migrations. There is no `migrate reset`, and `npm run db:seed` is never run.
- **Own servers, own ports.** The API runs on `:3100` and Vite on `:5174` (`E2E_API_PORT`, `E2E_WEB_PORT`), started by Playwright with `reuseExistingServer: false`. Your normal dev servers on `:3000`/`:5173`, and whatever database they use, are never reused or affected.
- **Isolation proof.** Before any test runs, setup logs in through the API on `:3100` as a fixture user that exists only in the e2e database. If that fails, the run aborts.
- **Synthetic, deterministic data.** `support/seed-fixture.mts` creates two Borrowers, two Custodians and five assets (cameras and `KL-ACC-001` for Custodian A, a laptop for Custodian B, one retired asset). It uses the server's own password hashing and refuses to run against any database that is not `kitloop_e2e_*`.
- **No credentials in code.** Passwords are random per run, generated in setup and passed through environment variables (`E2E_PW_*`). The session secret is random per run. Connection details come from the git-ignored `server/.env.test`.

## Output

All under `e2e/` and git-ignored:

- `test-results/results.json`: machine-readable results.
- `playwright-report/`: HTML report, including screenshots attached at key steps of the main journeys (also for passing tests).
- `test-results/artifacts/<test>/`: for **failed** tests only: `test-failed-1.png`, `video.webm`, `trace.zip`, `error-context.md`. Open a trace with `npx playwright show-trace <path>/trace.zip`.

A trace or video of a failed test can contain the credentials typed in that run. They are random and belong to a database that is dropped at the end of the run, but do not publish these folders.

## What is covered

| Spec | Tests |
| --- | --- |
| `01-auth-catalog` | Generic invalid-credential message; borrower login; catalog contents, order and availability; reload; sign out |
| `02-request-checkout-journey` (serial) | Request → PENDING and no reservation; second borrower competes; **BR-05**: assigned custodian sees the requests (and after reload), unassigned custodian does not; past due date refused; checkout → ACTIVE loan; availability for the custodian and both borrowers |
| `03-access-control` | Anonymous redirects; custodian/borrower UI restrictions; 401 without a session; 403 for wrong role; **BR-05**: unassigned custodian gets 404 on read and checkout; other borrower gets 404; server rejects a past due date |

The access-control cases that use `api(...)` call the real API with a real signed-in browser session (cookie, Origin, CSRF) because the UI offers no path to those requests. They prove server enforcement, not UI behaviour.

## Limitations

- Chromium only. The UI is tested at desktop size; there is no mobile-viewport, keyboard-navigation or screen-reader test.
- The client runs on the Vite dev server, not a production build.
- A 403 or a 500 shown in the UI, the loading/error/retry states, and concurrent checkout/duplicate-submission races are not covered here; the server and jsdom suites cover them.
- Time-based session expiry and replay of a revoked cookie are not exercised in the browser.
- The suite assumes the current UI text and roles (for example "Request to borrow", "Check out"). A wording change in the app needs a matching test update.
- Return, overdue and inventory-management features do not exist yet and are not tested.
