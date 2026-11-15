# Sprint 1 Integration & Verification — test report

Written for: the teammate reviewer (`DEV4952`) and the Sprint 1 release decision.

Scope: FEAT-01 Authentication, FEAT-02 Equipment Catalog, FEAT-03 Borrow Request, FEAT-04 Custodian Checkout, and the end-to-end journey Borrower login → catalog → request → assigned Custodian's pending queue → checkout → active loan → availability update. Defects are in [defect-log.md](defect-log.md), screenshots in [screenshot-index.md](screenshot-index.md), the verified/untested analysis in [verification-summary.md](verification-summary.md) and the per-test browser detail in [e2e-test-report.md](e2e-test-report.md).

**Status words.** PASS = executed and every assertion held. FAIL = executed and failed. NOT RUN = not executed in this task (or only partly). Nothing is PASS without an execution record that exists in this folder.

## 1. Baseline and environment

| Item | Value |
| --- | --- |
| Branch / commit | `sprint-1-staging` @ `52b187c` (merge of FEAT-04 PR #18) plus **uncommitted** working-tree changes: `README.md`, `client/src/components/Requests.tsx`, `client/tests/requests.test.tsx`, `server/tests/borrow-requests.test.ts` (custodian-queue clarity and a BR-05 regression test; no authorization or query code changed). Nothing was committed, pushed, branched or opened as a PR. |
| Requirements read | `docs/sprints/sprint-1/FEAT-01` to `FEAT-04`, `docs/traceability-matrix.md` (RTM), `docs/sprints/plan.md`, `README.md`. No separate STS file exists: the STS is the per-feature test tables plus RTM TC-01 to TC-28 (the RTM calls them "planned"). FEAT-03/FEAT-04 have no numbered AC IDs, so they are cited by contract section / RTM TC / BR. |
| Browser E2E | Headless Edge 156.0.4314.58, Vite dev client :5173, API :3000, PostgreSQL 18.4, throwaway database `kitloop_e2e_test` (synthetic fixture). Dev database, `kitloop_auth_test` and demo accounts not modified by it. |
| Automated tests | `kitloop_auth_test` (migrations all applied; see defect D-05) |
| Database safety | No `db:seed`, reset, drop or truncate was run. The development database was only read with SELECT queries. |

## 2. Commands executed (this task, against the current working tree)

| Command | Result | Evidence |
| --- | --- | --- |
| `npx vitest run --reporter=verbose` in `server/` | **PASS** — 56 of 56 tests, 7 files | `logs/final-server-vitest-verbose.log` |
| `npm run build` in `server/` (`tsc --noEmit`) | **PASS** (exit 0) | `logs/final-server-build.log` |
| `npx vitest run --reporter=verbose` for the client (jsdom, mocked HTTP) | **PASS** — 22 of 22 tests, 4 files. Run in an identical scratchpad copy of `client/`, because the repository's `client/node_modules` lacks `vitest` (defect D-06) | `logs/final-client-vitest-verbose.log` (first line states the copy) |
| `npm run lint` in `client/` | **PASS** (exit 0) | `logs/final-client-lint.log` |
| `npm run build` in `client/` | **PASS** (exit 0) | `logs/final-client-build.log` |
| Browser E2E scripts (2 phases, API restarted between) | **33 PASS, 0 FAIL** of 33 | `results/e2e-results.json`, `results/api-network-log.json` |
| Read-only dev-DB inspections (SELECT only) | executed, see section 4 | `logs/dev-db-br05-readonly-inspection.log`, `logs/dev-db-user-workflow-readonly-inspection.log` |

Earlier logs in `logs/` without the `final-` prefix (`server-vitest.log`, `queue-fix-*.log`, and so on) are intermediate runs kept for history; the `final-` files are the current ones.

## 3. Journey coverage (summary)

| Journey step | Browser (synthetic DB) | Developer's manual run (dev DB, demo accounts) |
| --- | --- | --- |
| Borrower login | PASS — E2E-AUTH-04 | reported by developer; no screenshot saved |
| Equipment catalog | PASS — E2E-CAT-01 | reported; no screenshot saved |
| Borrow request (PENDING) | PASS — E2E-REQ-01 | request row exists as the DB log shows; no screenshot saved |
| Assigned custodian's pending queue | PASS — E2E-CHK-01, E2E-CHK-02 | assigned custodian completed the checkout (DB log); queue view not captured |
| Checkout → active loan | PASS — E2E-CHK-04 | loan ACTIVE in DB log (request `6bdb2c55…` CHECKED_OUT, loan by `custodian.other`) |
| Availability update | PASS — E2E-AVL-01, -02, -04 | DB log: `KL-LAP-001` derives unavailable; UI view not captured |

## 4. BR-05 custodian authorization scenario

| ID | Test steps | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| TC-BR05-01 | Browser. Borrowers A and B request `KL-CAM-001`, Borrower A requests `KL-LAP-001`. Sign in as Custodian A (assigned both cameras) and read Pending requests. | **Assigned custodian sees the pending request**: both camera requests, oldest first, with requester and Asset ID. | 4/4 assertions held: two pending requests; first (oldest) is Borrower A's KL-CAM-001 request; second is Borrower B's KL-CAM-001 request; laptop request (other custodian) absent | **PASS** | `screenshots/E2E-CHK-01-custodian-a-queue.png` |
| TC-BR05-02 | Browser. Sign in as Custodian B (assigned only `KL-LAP-001`) and read Pending requests. | Assigned custodian sees the laptop request. | 3/3 assertions held: CUSTODIAN WORKSPACE shown; queue holds exactly the KL-LAP-001 request from e2e.borrower.a; camera requests absent from queue | **PASS** | `screenshots/E2E-CHK-02-custodian-b-scoped-queue.png` |
| TC-BR05-03 | Same two sessions as TC-BR05-01/02. | **Unassigned custodian cannot see another custodian's request**: Custodian A's queue has no laptop request; Custodian B's has no camera requests. | Asserted inside E2E-CHK-01 ("laptop request (other custodian) absent") and E2E-CHK-02 ("camera requests absent from queue") — both held. | **PASS** | `screenshots/E2E-CHK-01-custodian-a-queue.png`, `screenshots/E2E-CHK-02-custodian-b-scoped-queue.png` |
| TC-BR05-04 | Browser page, signed in as Custodian B: force `POST /requests/<Borrower B's KL-CAM-001 request>/checkout`. | Unassigned custodian cannot check out: 404, no loan. | 2/2 assertions held: out-of-scope checkout returns 404; no active loan exists (forced API call from the page, not a UI click: the UI never lists the request) | **PASS** | `results/e2e-results.json` (E2E-CHK-07) |
| TC-BR05-05 | API + PostgreSQL regression: `shows a new PENDING request only to the custodian assigned to its asset, across refreshes, until checkout` (new). Two custodians own different assets; a borrower requests one. | Assigned custodian sees it on every refetch; unassigned never does; unassigned checkout is 404 with no loan; assigned checkout is 201 with one ACTIVE loan and the request leaves the queue; queues never mix. | executed and passed | **PASS** | `logs/final-server-vitest-verbose.log`; test in `server/tests/borrow-requests.test.ts` |
| TC-BR05-06 | API + PostgreSQL: existing scope tests (`scopes a custodian's request queue…`, `scopes lists/direct IDs…`, `shows only scoped pending requests…`, `rejects … foreign-scope requests`). | Foreign custodian queue empty/404 on read and checkout. | all four executed and passed | **PASS** | `logs/final-server-vitest-verbose.log` |
| TC-BR05-07 | Read-only SELECT on the **dev DB**: resolve UI prefixes `1959cc29` and `7d1d033d` to full IDs; read `CustodianAsset` rows for `KL-LAP-001`; evaluate the pending-queue filter for each custodian's exact ID. | `7d1d033d…` (`custodian.demo`) is not assigned `KL-LAP-001`; `d8a29e68…` (`custodian.other`) is. | Both prefixes matched exactly one user. `KL-LAP-001` is assigned only to `custodian.other`; `custodian.demo` is assigned only `KL-CAM-001`. The saved log is from after checkout, so both queues are empty there; the earlier PENDING-state query (`custodian.demo` → empty, `custodian.other` → the laptop request) was seen in the conversation but was **not saved as a file**. | **PASS** for the assignment facts; the pre-checkout queue output is not evidenced by a saved log | `logs/dev-db-br05-readonly-inspection.log` |
| TC-BR05-08 | Dev DB, read-only: persisted result of the developer's manual workflow. | The assigned custodian completed checkout: request `CHECKED_OUT`, one ACTIVE loan, asset unavailable. | Request `6bdb2c55…` CHECKED_OUT; one loan, `returnedAt` null, checked out by `custodian.other` for `borrower.demo`; `KL-LAP-001` derives unavailable. Database evidence only. | **PASS** (database level) | `logs/dev-db-user-workflow-readonly-inspection.log` |
| TC-BR05-09 | Browser, **demo accounts on the dev DB**: view both custodians' dashboards. | `custodian.demo`: 0 pending with the assigned-equipment message; `custodian.other`: the request, then the loan. | The developer reported seeing 0 pending for `custodian.demo`. No screenshot or recording of the demo-account run is in the repository. | **NOT RUN** (not evidenced) | — see "Missing screenshots" in `screenshot-index.md` |
| TC-BR05-10 | Browser: custodian empty-queue wording added after the report. | Message states only assigned equipment is listed. | Covered by jsdom test `tells a custodian with an empty queue…` (PASS). Not seen in a real browser. | **NOT RUN** in a browser | `logs/final-client-vitest-verbose.log` |

## 5. Browser E2E test cases (headless Edge, live app, API and PostgreSQL)

Each Actual cell lists the recorded assertions that held. "Force POST/GET" steps call the real API from inside the signed-in page because the UI offers no path to that request; they prove server behaviour, not UI behaviour.

| Test Case ID | Requirement / AC | Test steps | Expected result | Actual result | Status | Evidence path |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-AUTH-01 | FEAT-01 AC-02, AC-12; RTM TC-01 | Open /login. Submit unknown username + any password. Then submit a real username with a wrong password. | Both show the same generic "Invalid username or password."; stay on /login; no workspace shown. | 3/3 assertions held: both failures show the identical generic message; user stays on /login; no authenticated workspace is shown | **PASS** | `screenshots/E2E-AUTH-01-unknown-user.png`<br>`screenshots/E2E-AUTH-01-wrong-password.png` |
| E2E-AUTH-02 | FEAT-01 AC-12 (validation state) | Open /login. Enter whitespace-only username and any password; submit. | Client validation message shown; no /auth/login request sent. | 2/2 assertions held: validation message "Enter both a username and password." displayed; no /auth/login request was sent | **PASS** | `screenshots/E2E-AUTH-02-validation.png` |
| E2E-AUTH-03 | FEAT-01 AC-05, AC-12; RTM TC-18 | Open /dashboard, then /requests directly. | Both redirect to /login; no catalog content exposed. | 4/4 assertions held: /dashboard redirected to /login; /dashboard exposes no catalog; /requests redirected to /login; /requests exposes no catalog | **PASS** | `screenshots/E2E-AUTH-03-protected-redirect.png` |
| E2E-AUTH-04 | FEAT-01 AC-01, AC-12; RTM TC-01/TC-03 | Sign in as Borrower A (e2e.borrower.a) through the form. | /dashboard shows BORROWER WORKSPACE and the account tag equal to the server user ID prefix. | 3/3 assertions held: URL is /dashboard; BORROWER WORKSPACE eyebrow shown; account tag matches the borrower's server ID prefix (Account cf4a9935) | **PASS** | `screenshots/E2E-AUTH-04-borrower-dashboard.png` |
| E2E-AUTH-05 | FEAT-01 AC-03; RTM TC-03 | Reload /dashboard (full page load). | Identity restored from the server session (same role and account tag) without signing in again. | 2/2 assertions held: still BORROWER WORKSPACE after full page reload; same account tag after reload | **PASS** | `screenshots/E2E-AUTH-05-after-refresh.png` |
| E2E-CAT-01 | FEAT-02 AC-01, AC-03, AC-06, AC-07, AC-08, AC-12; RTM TC-04/TC-05 | View the dashboard catalog. | Three non-retired assets in name then ID order, all Available, distinct IDs, retired asset hidden, h2 heading. | 5/5 assertions held: order is Development laptop, then Mirrorless camera KL-CAM-001, KL-CAM-002; retired KL-OLD-001 is not shown; all three show Available; Asset IDs are distinct; two cameras share a name; catalog heading is an h2 | **PASS** | `screenshots/E2E-CAT-01-borrower-catalog.png` |
| E2E-CAT-04 | FEAT-02 AC-02, NFR (no-store) | Call GET /assets from the page. | 200, Cache-Control no-store, only assetId/name/category/description/available. | 3/3 assertions held: status 200; Cache-Control contains no-store; keys are exactly assetId, available, category, description, name | **PASS** | `results/e2e-results.json` |
| E2E-CAT-03 | FEAT-02 AC-12 (responsive layout) | Open /dashboard. | Three cards, no horizontal overflow. | 2/2 assertions held: no horizontal overflow (scrollWidth 390 <= clientWidth 390); three cards rendered | **PASS** | `screenshots/E2E-CAT-03-mobile-390.png` |
| E2E-REQ-01 | FEAT-03 FR-06, FR-07; RTM TC-06/TC-07 | Click "Request to borrow" on KL-CAM-001; confirm /requests preselects it; click Submit request. | POST /requests 201; success notice; My requests lists KL-CAM-001 · PENDING with a server-assigned request ID. | 3/3 assertions held: My requests lists KL-CAM-001 · PENDING; request has a server-assigned ID; exactly one POST /requests returned 201 | **PASS** | `screenshots/E2E-REQ-01-form-preselected.png`<br>`screenshots/E2E-REQ-01-after-submit.png` |
| E2E-REQ-02 | FEAT-03 BR-10; RTM TC-21; FEAT-02 AC-13 | Reload /dashboard; read the catalog; GET /loans/mine. | KL-CAM-001 still Available with an enabled button; no loan exists (no reservation). | 3/3 assertions held: catalog still shows KL-CAM-001 Available after the request; Request button still enabled for another borrower; GET /loans/mine returns no loan | **PASS** | `screenshots/E2E-REQ-02-still-available.png` |
| E2E-REQ-03 | FEAT-03 duplicate policy; BR-10; RTM TC-21 | Open /requests and read selectable assets; force POST /requests for KL-CAM-001 from the page. | Selector omits KL-CAM-001; forced POST returns 409 DUPLICATE_REQUEST; still one request. | 3/3 assertions held: UI selector no longer offers KL-CAM-001; forced POST returns 409 DUPLICATE_REQUEST; still exactly one KL-CAM-001 request | **PASS** | `results/e2e-results.json` |
| E2E-REQ-06 | FEAT-03 FR-06 (second request for scope tests) | Request KL-LAP-001 through the UI. | KL-LAP-001 · PENDING listed alongside the camera request (2 records). | 2/2 assertions held: KL-LAP-001 · PENDING listed; two requests listed for Borrower A | **PASS** | `screenshots/E2E-REQ-06-form-preselected.png`<br>`screenshots/E2E-REQ-06-two-requests.png` |
| E2E-AUTH-06 | FEAT-01 AC-04 (partial), AC-12; RTM TC-02. Limit: the browser cookie is cleared by logout, so the old cookie value is not replayed here; replay of a revoked cookie is covered only by server tests (TEST-FEAT-01-04). | Click Sign out. From the page call GET /auth/me and GET /requests/mine. Open /dashboard. | Back on /login; both API calls 401; /dashboard redirects to /login. | 4/4 assertions held: back on /login; /auth/me returns 401 after logout; protected /requests/mine returns 401; /dashboard redirects to /login after logout | **PASS** | `screenshots/E2E-AUTH-06-after-logout.png` |
| E2E-REQ-04 | FEAT-03 BR-10, FR-07; RTM TC-07/TC-21 | Sign in as B; request KL-CAM-001 through the UI; view My requests and the catalog. | B has one PENDING request, does not see A's request, and KL-CAM-001 stays Available with two pending requests. | 4/4 assertions held: B's My requests starts empty (A's requests not visible); B has one PENDING request for KL-CAM-001; A's request ID is not shown to B; KL-CAM-001 remains Available with two pending requests | **PASS** | `screenshots/E2E-REQ-04-form-preselected.png`<br>`screenshots/E2E-REQ-04-two-borrowers-pending.png` |
| E2E-REQ-05 | FEAT-01 AC-07; BR-04; RTM TC-07 | GET /requests/<A's id> from the page; GET /requests/mine. | 404 without A's details; list contains only B-owned requests. | 3/3 assertions held: direct GET of A's request returns 404; response does not leak A's user ID; list contains only B-owned requests | **PASS** | `results/e2e-results.json` |
| E2E-CHK-06 | FEAT-01 AC-06; BR-03; RTM TC-18 | Force POST /requests/<id>/checkout as a Borrower. | 403; request still PENDING; no loan created. | 3/3 assertions held: POST checkout as Borrower returns 403; request still PENDING; no loan created | **PASS** | `results/e2e-results.json` |
| E2E-CHK-02 | FEAT-03 FR-08; BR-05; FEAT-01 AC-08; RTM TC-08 | Sign in as Custodian B and read Pending requests. | Only the KL-LAP-001 request from Borrower A; camera requests absent. | 3/3 assertions held: CUSTODIAN WORKSPACE shown; queue holds exactly the KL-LAP-001 request from e2e.borrower.a; camera requests absent from queue | **PASS** | `screenshots/E2E-CHK-02-custodian-b-scoped-queue.png` |
| E2E-CHK-07 | FEAT-01 AC-08; BR-05; RTM TC-09 | Force POST checkout of that request as Custodian B. | 404; no active loan exists. | 2/2 assertions held: out-of-scope checkout returns 404; no active loan exists | **PASS** | `results/e2e-results.json` |
| E2E-AUTH-07 | FEAT-01 AC-01, AC-12; BR-03 | Sign in as Custodian A (e2e.custodian.a; scope KL-CAM-001, KL-CAM-002, KL-OLD-001). | CUSTODIAN WORKSPACE with matching account tag; no Borrower navigation link. | 2/2 assertions held: CUSTODIAN WORKSPACE with matching account tag; Borrower navigation link absent | **PASS** | `screenshots/E2E-AUTH-07-custodian-dashboard.png` |
| E2E-CAT-02 | FEAT-02 AC-01; FEAT-03 (no request control for Custodian) | View the catalog. | Same three assets; no Request buttons. | 2/2 assertions held: three cards shown; no Request buttons for a Custodian | **PASS** | `results/e2e-results.json` |
| E2E-AUTH-08 | BR-03 (UI route guard) | Open /requests directly. | Redirected to /dashboard. | 1/1 assertions held: redirected to /dashboard | **PASS** | `results/e2e-results.json` |
| E2E-CHK-01 | FEAT-03 FR-08; BR-05; RTM TC-08 | Sign in as Custodian A and read Pending requests. | Only the two camera requests, oldest first, with requester username and Asset ID; laptop request absent. | 4/4 assertions held: two pending requests; first (oldest) is Borrower A's KL-CAM-001 request; second is Borrower B's KL-CAM-001 request; laptop request (other custodian) absent | **PASS** | `screenshots/E2E-CHK-01-custodian-a-queue.png` |
| E2E-CHK-03 | FEAT-04 due-date validation; BR-11; RTM TC-09 | Enter a due date one day in the past and click Check out. | UI message "Choose a valid due date later than the checkout time."; no POST .../checkout sent. | 2/2 assertions held: message "Choose a valid due date later than the checkout time." shown; no POST .../checkout was sent | **PASS** | `screenshots/E2E-CHK-03-past-due-rejected.png` |
| E2E-CHK-04 | FEAT-04 FR-09, FR-10; BR-01, BR-02, BR-06; RTM TC-09/TC-10 | Enter a due date 7 days ahead and click Check out for Borrower A's request. | POST checkout 201; request leaves the queue; Active loans shows one ACTIVE loan referencing the request, Borrower A and Custodian A; API dueAt equals the chosen date; returnedAt null. | 7/7 assertions held: exactly one POST checkout returned 201; A's request left the pending queue; Active loans shows KL-CAM-001 · ACTIVE; loan references the request, Borrower A and Custodian A IDs; API: one ACTIVE loan with returnedAt null; API dueAt equals the chosen due date (2026-11-10T05:21:00.000Z); checkedOutAt is before dueAt | **PASS** | `screenshots/E2E-CHK-04-checkout-success.png` |
| E2E-CHK-05 | FEAT-04 BR-09, BR-02; RTM TC-19 (UI/API surface only) | Inspect B's checkout form; force POST checkout for B's request from the page. | Form disabled with "no longer available" message; forced POST 409 ASSET_UNAVAILABLE; request stays PENDING; still one active loan. | 6/6 assertions held: Borrower B's request remains in the queue; checkout button and due-date input are disabled; message "Equipment is no longer available for checkout." shown; forced POST returns 409 ASSET_UNAVAILABLE; B's request is still PENDING; still exactly one active loan | **PASS** | `screenshots/E2E-CHK-05-competing-request-blocked.png` |
| E2E-AVL-02 | FEAT-02 AC-03; BR-08 | Read the Custodian catalog. | KL-CAM-001 Checked out; KL-CAM-002 Available. | 2/2 assertions held: KL-CAM-001 badge is "Checked out"; second camera KL-CAM-002 remains Available | **PASS** | `results/e2e-results.json` |
| E2E-AVL-01 | FEAT-02 AC-13, S2-01 (checkout half); FEAT-04; BR-08 | Sign in as Borrower A; read catalog, My requests, My loans, and the request form options. | KL-CAM-001 "Checked out" with disabled labelled button; request CHECKED_OUT; one ACTIVE loan; form omits KL-CAM-001. | 6/6 assertions held: catalog badge "Checked out"; Request button disabled with explanatory label; My requests: KL-CAM-001 · CHECKED_OUT; My requests: KL-LAP-001 still PENDING; My loans: KL-CAM-001 · ACTIVE with the same loan ID; request form no longer offers KL-CAM-001 | **PASS** | `screenshots/E2E-AVL-01-borrower-a-after-checkout.png` |
| E2E-AVL-03 | FEAT-03 availability rule (I1); BR-13 partial; RTM TC-06 | Force POST /requests for KL-CAM-001 and for KL-OLD-001. | Both 409 ASSET_UNAVAILABLE; request count unchanged. | 3/3 assertions held: POST /requests returns 409 ASSET_UNAVAILABLE; request count unchanged; retired KL-OLD-001 request returns 409 ASSET_UNAVAILABLE | **PASS** | `screenshots/E2E-AVL-03-borrower-b-view.png` |
| E2E-AVL-04 | Plan: selected normal journey; BR-08 | Compare recorded badges across the journey. | Available → (request) Available → (checkout) Checked out for both roles. | 3/3 assertions held: after request: Available (observed Available); borrower view after checkout: Checked out (observed Checked out); custodian view after checkout: Checked out (observed Checked out) | **PASS** | `results/e2e-results.json` |
| E2E-PER-01 | FEAT-04 FR-10 restart/readback; NFR-05; RTM TC-10/TC-25 | Sign in as Borrower A; read catalog, requests, loans. | Same request ID CHECKED_OUT, same loan ID ACTIVE, KL-CAM-001 Checked out. | 3/3 assertions held: catalog: KL-CAM-001 Checked out after restart; request keeps its ID and CHECKED_OUT status; loan keeps its ID and ACTIVE status | **PASS** | `screenshots/E2E-PER-01-borrower-a-after-restart.png` |
| E2E-AVL-05 | FEAT-02 AC-13 on real endpoints; FEAT-03 I1 | In the stale page click Request to borrow for KL-CAM-002 and Submit; then open the Equipment dashboard link. | POST /requests 409; unavailable message shown; catalog refetched; KL-CAM-002 shows Checked out with no reload; no request written. | 7/7 assertions held: precondition: KL-CAM-002 shown Available with enabled button in the open page; setup: request 201 and checkout 201 via API client; UI shows the server conflict message; POST /requests returned 409; catalog was re-fetched (GET /assets) after the 409; KL-CAM-002 now shows Checked out without a page reload; Borrower A has no request for KL-CAM-002 (nothing written) | **PASS** | `screenshots/E2E-AVL-05-stale-form-preselected.png`<br>`screenshots/E2E-AVL-05-conflict-message.png`<br>`screenshots/E2E-AVL-05-after-refresh.png` |
| E2E-CHK-08 | FEAT-01 AC-07/AC-08; BR-04, BR-05 | Read GET /loans/<id> as Borrower B, Custodian B, Borrower A, Custodian A; read Custodian A's active loans. | 404, 404, 200 (ACTIVE), 200; active list shows the two loans. | 5/5 assertions held: Borrower B -> 404; Custodian B (out of scope) -> 404; Borrower A (owner) -> 200 ACTIVE; Custodian A (scoped) -> 200; Custodian A active loans after restart: the original loan and the setup loan (2) | **PASS** | `screenshots/E2E-PER-02-custodian-a-active-loans-after-restart.png` |
| E2E-AUTH-09 | FEAT-01 AC-12 (401 clears protected UI state). Limit: this does NOT replay a revoked token or test time-based expiry; the logout response also clears the cookie, so the 401 is for a request with no cookie. | End the session server-side (call POST /auth/logout from the page; the response clears the cookie). Click Submit request. | POST /requests returns 401; UI shows "Your session has ended"; redirected to /login; no protected content remains. | 4/4 assertions held: setup: session revoked server-side via logout call (204); POST /requests returned 401; redirected to /login; no protected content (catalog/requests/loans) remains in the page | **PASS** | `screenshots/E2E-AUTH-09-session-ended.png` |

## 6. Automated test cases (executed in this task)

Steps and expected results of these tests are the tests' own assertions in `server/tests/*.ts` and `client/tests/*.tsx`; the report lists name, requirement area and result only.

### Server (PostgreSQL, `kitloop_auth_test`) — 56 tests

| Test Case ID (file › name) | Requirement area | Status | Evidence |
| --- | --- | --- | --- |
| tests/auth.test.ts › FEAT-01 authentication API > rejects an unauthenticated current-user request | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > rejects invalid login without creating a session | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > logs in both roles and retrieves server-derived identity | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > replaces a presented session and stores only password and token hashes | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > returns the same generic error for unknown user and wrong password | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > revokes the server session on logout and rejects reuse | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > rejects forged and expired sessions | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > rejects missing CSRF and disallowed login origin | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > validates login input and sanitizes malformed JSON errors | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > returns a generic response for an unexpected authentication failure | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > marks session cookies Secure in production configuration | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > rejects unauthenticated and wrong-role domain operations | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > allows only the borrower's own direct request and loan records | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > derives a new request owner from the authenticated session | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > scopes a custodian's request queue and rejects out-of-scope checkout **(BR-05)** | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > restricts inventory editing to the assigned custodian **(BR-05)** | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > persists authorized checkout and prevents a duplicate active loan | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/auth.test.ts › FEAT-01 authentication API > allows only one checkout when two requests race for an available asset | FEAT-01 AC-01 to AC-11 (API/DB) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-01 returns stored non-retired assets to both roles (retrieval) | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-02 exposes exactly the five documented fields and nothing internal (response shape) | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-03 derives availability from loan state, not from requests (availability) | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-05 agrees with checkout validation for the same assets (FR-05) | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-06 rejects missing, forged, expired and revoked sessions with 401 | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-07 orders by name then assetId, repeatably (ordering) | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-08 keeps Asset IDs unique in the database and seed data | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-09 leaves retired assets out of the catalog | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-10 returns 200 and an empty array when there are no assets | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-11 returns a generic 500 for an unexpected failure | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/catalog.test.ts › FEAT-02 equipment catalog API > TEST-FEAT-02-12 does not change any record and needs no CSRF token | FEAT-02 AC-01 to AC-12 (API/DB; TEST-FEAT-02-xx) | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › request payload unit validation > accepts only a trimmed Asset ID | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › FEAT-03 borrowing workflow against PostgreSQL > persists PENDING with server identity/time, exposes asset details, and never reserves | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › FEAT-03 borrowing workflow against PostgreSQL > rejects concurrent duplicate submissions and the database independently guards uniqueness | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › FEAT-03 borrowing workflow against PostgreSQL > allows concurrent submissions by different borrowers without reserving | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › FEAT-03 borrowing workflow against PostgreSQL > rejects unknown, retired, malformed, and client-controlled fields without writes | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › FEAT-03 borrowing workflow against PostgreSQL > enforces authentication, role and CSRF for creation | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › FEAT-03 borrowing workflow against PostgreSQL > scopes lists/direct IDs, forbids status writes and checks out atomically **(BR-05)** | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › FEAT-03 borrowing workflow against PostgreSQL > shows a new PENDING request only to the custodian assigned to its asset, across refreshes, until checkout **(BR-05)** | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › FEAT-03 borrowing workflow against PostgreSQL > rolls back request fulfillment if loan creation fails | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/borrow-requests.test.ts › FEAT-03 borrowing workflow against PostgreSQL > does not expose database failure details during submission | FEAT-03 FR-06 to FR-08, BR-05, BR-10 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > shows only scoped pending requests with borrower and equipment details **(BR-05)** | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > creates exactly one ACTIVE loan, checks out the request, and immediately updates all reads | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > rejects invalid due dates and supplied status/identity without partial changes | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > checks due date against checkout time inside the transaction, not an earlier form timestamp | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > rejects missing sessions, wrong role, CSRF failures and foreign-scope requests **(BR-05)** | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > rejects a missing request, malformed ID, asset mismatch, and retired equipment | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > rejects repeated and concurrent checkout of the same request | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > allows one winner across different pending requests and custodians for one exclusive asset **(BR-05)** | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > does not expose a loan status mutation API to borrowers | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout.test.ts › F-04 Custodian Checkout Workflow (PostgreSQL) > preserves historic rows when the enum migration renames FULFILLED to CHECKED_OUT | FEAT-04 FR-09, FR-10, BR-01 to BR-11 | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/health.test.ts › GET /api/health > returns the service health response | Health route | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout-unit.test.ts › Checkout validation and loan projection > accepts an explicit Asset ID and a timezone-aware due date | FEAT-04 due-date/loan validation | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout-unit.test.ts › Checkout validation and loan projection > rejects invalid bodies and client-assigned loan or identity fields | FEAT-04 due-date/loan validation | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout-unit.test.ts › Checkout validation and loan projection > rejects coercible, impossible, malformed, and timezone-free dates | FEAT-04 due-date/loan validation | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout-unit.test.ts › Checkout validation and loan projection > requires the due date strictly after the actual checkout instant | FEAT-04 due-date/loan validation | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/checkout-unit.test.ts › Checkout validation and loan projection > derives ACTIVE/RETURNED from persisted custody facts without editable state | FEAT-04 due-date/loan validation | **PASS** | `logs/final-server-vitest-verbose.log` |
| tests/availability.test.ts › FEAT-02 availability definition > TEST-FEAT-02-04 maps retirement and active loans to one canonical state | FEAT-02 FR-05 canonical availability | **PASS** | `logs/final-server-vitest-verbose.log` |

### Client (jsdom, mocked HTTP — not live-browser evidence) — 22 tests

| Test Case ID (file › name) | Status | Evidence |
| --- | --- | --- |
| tests/checkout.test.tsx › Custodian checkout form > requires a due date and submits only the selected request with its local date converted to UTC | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/requests.test.tsx › Borrow Request UI > offers only available equipment without an existing pending request | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/requests.test.tsx › Borrow Request UI > disables submission while loading, busy, or selection becomes unavailable | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout.test.tsx › Custodian checkout form > rejects past due dates locally without invoking checkout | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout.test.tsx › Custodian checkout form > blocks unavailable, still-loading, busy and non-pending requests | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout.test.tsx › Custodian checkout form > shows persisted loan identifiers, checkout and due timestamps, and status | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/requests.test.tsx › Borrow Request UI > renders history with equipment name and status without checkout controls | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/requests.test.tsx › Borrow Request UI > distinguishes loading, error/retry and empty history | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/requests.test.tsx › Borrow Request UI > tells a custodian with an empty queue that only assigned equipment is listed | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout-workflow.test.tsx › Custodian checkout app workflow (mocked HTTP) > submits the selected request and refreshes queue, availability and the ACTIVE loan | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/borrow-workflow.test.tsx › Borrower workflow integration in the React app (mocked HTTP) > submits from My Requests, refreshes persisted history, and prevents a second selection | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout-workflow.test.tsx › Custodian checkout app workflow (mocked HTTP) > prevents duplicate clicks while a checkout is in flight | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/borrow-workflow.test.tsx › Borrower workflow integration in the React app (mocked HTTP) > refreshes stale history after a 409 without displaying success | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout-workflow.test.tsx › Custodian checkout app workflow (mocked HTTP) > refreshes after a 409, disables checkout of the now unavailable item, and shows the conflict | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout-workflow.test.tsx › Custodian checkout app workflow (mocked HTTP) > keeps the session after a 403 and reports lack of permission | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/borrow-workflow.test.tsx › Borrower workflow integration in the React app (mocked HTTP) > ends an expired session and removes private history | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout-workflow.test.tsx › Custodian checkout app workflow (mocked HTTP) > clears private custodian state when the session expires | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout-workflow.test.tsx › Custodian checkout app workflow (mocked HTTP) > shows safe server failures without claiming success | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/borrow-workflow.test.tsx › Borrower workflow integration in the React app (mocked HTTP) > distinguishes successful creation from a failed history refresh and blocks resubmission | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/borrow-workflow.test.tsx › Borrower workflow integration in the React app (mocked HTTP) > loads request history on a fresh visit to the page | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/checkout-workflow.test.tsx › Custodian checkout app workflow (mocked HTTP) > distinguishes a committed checkout from a failed refresh and hides repeat checkout controls | **PASS** | `logs/final-client-vitest-verbose.log` |
| tests/borrow-workflow.test.tsx › Borrower workflow integration in the React app (mocked HTTP) > ignores a delayed history retry after logout and a different borrower signs in | **PASS** | `logs/final-client-vitest-verbose.log` |

## 7. NOT RUN and unverified cases

Full list with reasons: [verification-summary.md](verification-summary.md#untested-and-blocked). The ones that matter most for release:

| Case | Status | Reason |
| --- | --- | --- |
| Demo-account browser run (Borrower → `custodian.other` → checkout) with screenshots | NOT RUN (not evidenced) | Done by hand by the developer; nothing saved in the repository. Database evidence only (section 4). |
| `custodian.demo` empty-queue wording in a real browser | NOT RUN | jsdom only. |
| Concurrent checkout race (TC-19) and concurrent duplicate submission in a browser | NOT RUN | Server tests only; browser run covered a sequential competing request. |
| 403-retains-session in the UI; loading/error/retry states on the live API | NOT RUN | No UI path to a 403; those states were exercised only with mocks (jsdom, earlier mocked screenshots). |
| Replay of a revoked/forged/expired cookie from a browser | NOT RUN | Logout clears the cookie; server tests cover replay. |
| Keyboard and screen-reader use of the catalog | NOT RUN | No assistive-technology test by anyone. |
| Production build served; browsers other than Edge; mobile `/requests` and checkout | NOT RUN | E2E used the Vite dev server and headless Edge; only the dashboard was captured at 390 px. |
| Repository `client/` tests in place | BLOCKED | `vitest` missing from `client/node_modules` (D-06); run in an identical copy. |
| RTM TC-01 to TC-28 status update; return flow (Sprint 2) | NOT DONE / out of scope | RTM file not edited; return not implemented. |

## 8. Defects and their actual resolution

Details in [defect-log.md](defect-log.md).

| ID | Summary | Actual resolution / status |
| --- | --- | --- |
| D-01 | Account tag overlaps the top bar at 390 px | **Open** — not fixed (shared shell, outside the FEAT PRs) |
| D-02 | Account tag shown twice | **Open** |
| D-03 | "1 records" wording | **Open** |
| D-04 | No gap under the alert on `/requests` | **Open** |
| D-05 | Test DB missing two migrations (8 failed, 11 skipped) | **Closed** — `prisma migrate deploy` on `kitloop_auth_test` only; 55/55 then 56/56 passing. Other machines still need `npm run db:deploy` |
| D-06 | `vitest` not installed in repo `client/` | **Open** — tests run in an identical copy; `npm ci` in `client/` needed |
| D-07 | Request "missing" from `custodian.demo`'s queue | **Closed, no application defect** — BR-05 worked; the asset belongs to `custodian.other`. Clarity changes only (README, empty-state text, regression test). No authorization code changed |

No browser or automated test failed in the runs recorded here.

## 9. Evidence hygiene

A script scanned every text file under `artifacts/sprint-1/` (59 files, including logs, JSON results, scripts and these reports) for:
- the **actual values** of `DEMO_BORROWER_PASSWORD`, `DEMO_CUSTODIAN_PASSWORD`, `SESSION_CSRF_SECRET` and the database connection strings/passwords from `server/.env` and `server/.env.test`, and the four throwaway fixture passwords (10 values);
- patterns for database connection strings (the PostgreSQL URL scheme),`kitloop_session` cookie values, `Set-Cookie`/`Cookie` header values, CSRF token values, 64-hex token hashes, JWT-like strings, bearer tokens, quoted `password` literals and scrypt hashes (10 patterns).

**Result: 0 hits (no secret value or secret-shaped pattern found). The scanner's own source file is the only file excluded, because it contains the pattern definitions.** The script (`scripts/evidence-scan.mjs`) prints only counts and file names, never matched text. Only the database name (`kitloop_auth_dev`, `kitloop_e2e_test`) appears in logs, not a connection string.

Limits: the 46 PNG screenshots cannot be text-scanned. In the ones I opened, password inputs are empty or masked and no token is visible; the others were not opened. User IDs and usernames of synthetic and demo accounts appear in evidence; they are not secrets.

## 9a. Missing evidence (summary)

1. Screenshots of the developer's demo-account browser run (six listed in [screenshot-index.md](screenshot-index.md#missing-screenshots-not-fabricated-not-in-the-repository)).
2. A saved log of the dev-DB queue state **before** checkout (the PENDING-state output exists only in the conversation).
3. A real-browser view of the new custodian empty-queue message.
4. Race, error-state, keyboard/screen-reader, production-build and cross-browser coverage (section 7).
