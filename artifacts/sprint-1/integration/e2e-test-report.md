# Sprint 1 browser E2E test report (yiiipunn portion)

Scope: FEAT-01 Authentication, FEAT-02 Equipment Catalog, browser-level FEAT-03 Borrow Request and FEAT-04 Custodian Checkout integration, and end-to-end availability.

## Execution summary

| Item | Value |
| --- | --- |
| Executed tests | 33 (33 PASS, 0 FAIL). Tests not run are listed in [verification-summary.md](verification-summary.md); none of them is counted here. |
| Execution window (script clock, ISO 8601 UTC; both phases) | 2026-11-03T05:20:25.372Z to 2026-11-03T05:23:22.888Z |
| Code under test | `sprint-1-staging` @ `52b187c` (merge of FEAT-04 PR #18); working tree had no tracked changes during the run |
| Browser | Microsoft Edge 156.0.4314.58, headless, driven over the Chrome DevTools Protocol from Node v24.19.0; desktop 1280x900 (CAT-03 emulates 390x844) |
| Client | Vite **dev** server (not a production build), http://localhost:5173 |
| API / database | KitLoop API (`tsx src/index.ts`) on :3000 against PostgreSQL 18.4, database `kitloop_e2e_test` — a **new throwaway database** created for this run, migrated with `prisma migrate deploy` (all 3 migrations) and filled by a purpose-written fixture script. The development database, the `kitloop_auth_test` suite database and the demo accounts were not used or modified; `db:seed` was not run. |
| Fixture | 2 Borrowers, 2 Custodians (random passwords kept outside the repo); assets KL-CAM-001 and KL-CAM-002 (same name), KL-LAP-001, retired KL-OLD-001. Custodian A scope: CAM-001, CAM-002, OLD-001; Custodian B scope: LAP-001. |
| API restart | Between phase 1 and phase 2 the API process was stopped (health endpoint stopped answering) and restarted on the same database. |
| Method | Steps written as "click", "sign in", "open", "enter", "reload" or "view" are real interactions in the page. Steps written as "force POST/GET" or "call ... from the page" run a real API request from inside the signed-in browser page (real session cookie and Origin) because the UI offers no path to that request; they prove server behaviour as seen from the browser, not UI behaviour. E2E-AVL-05 uses a Node API client only to set up the stale-page precondition; its assertions are made in the browser. |
| Raw evidence | `results/e2e-results.json` (every assertion), `results/api-network-log.json` (every /api call the browser made, with real timestamps and status), `screenshots/`, `logs/` |

A status is PASS only if every recorded assertion for the test held. Each "Actual" cell is generated from the recorded run, not typed.

## Results

### E2E-AUTH-01 — Invalid credentials show one generic error (unknown user vs wrong password)

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-02, AC-12; RTM TC-01 |
| Preconditions | Fixture DB `kitloop_e2e_test` (synthetic users/assets), API on :3000, Vite client on :5173; signed out |
| Steps | Open /login. Submit unknown username + any password. Then submit a real username with a wrong password. |
| Expected result | Both show the same generic "Invalid username or password."; stay on /login; no workspace shown. |
| Actual result | ✔ both failures show the identical generic message<br>✔ user stays on /login<br>✔ no authenticated workspace is shown<br>Observed — messages: ["Invalid username or password.","Invalid username or password."] |
| Executed | 2026-11-03T05:20:25.372Z → 2026-11-03T05:20:28.394Z (phase1) |
| Evidence path | `screenshots/E2E-AUTH-01-unknown-user.png`<br>`screenshots/E2E-AUTH-01-wrong-password.png` |

### E2E-AUTH-02 — Whitespace-only username is rejected with a validation message and no API call

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-12 (validation state) |
| Preconditions | Signed out |
| Steps | Open /login. Enter whitespace-only username and any password; submit. |
| Expected result | Client validation message shown; no /auth/login request sent. |
| Actual result | ✔ validation message "Enter both a username and password." displayed<br>✔ no /auth/login request was sent<br>Observed — apiCallsDuringValidation: 0 |
| Executed | 2026-11-03T05:20:28.395Z → 2026-11-03T05:20:29.893Z (phase1) |
| Evidence path | `screenshots/E2E-AUTH-02-validation.png` |

### E2E-AUTH-03 — Unauthenticated /dashboard and /requests redirect to /login

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-05, AC-12; RTM TC-18 |
| Preconditions | Signed out |
| Steps | Open /dashboard, then /requests directly. |
| Expected result | Both redirect to /login; no catalog content exposed. |
| Actual result | ✔ /dashboard redirected to /login<br>✔ /dashboard exposes no catalog<br>✔ /requests redirected to /login<br>✔ /requests exposes no catalog |
| Executed | 2026-11-03T05:20:29.893Z → 2026-11-03T05:20:32.302Z (phase1) |
| Evidence path | `screenshots/E2E-AUTH-03-protected-redirect.png` |

### E2E-AUTH-04 — Borrower login reaches the Borrower workspace with server-confirmed identity

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-01, AC-12; RTM TC-01/TC-03 |
| Preconditions | Signed out |
| Steps | Sign in as Borrower A (e2e.borrower.a) through the form. |
| Expected result | /dashboard shows BORROWER WORKSPACE and the account tag equal to the server user ID prefix. |
| Actual result | ✔ URL is /dashboard<br>✔ BORROWER WORKSPACE eyebrow shown<br>✔ account tag matches the borrower's server ID prefix (Account cf4a9935) |
| Executed | 2026-11-03T05:20:32.302Z → 2026-11-03T05:20:34.897Z (phase1) |
| Evidence path | `screenshots/E2E-AUTH-04-borrower-dashboard.png` |

### E2E-AUTH-05 — Page refresh restores the same identity without re-login

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-03; RTM TC-03 |
| Preconditions | Signed in as Borrower A |
| Steps | Reload /dashboard (full page load). |
| Expected result | Identity restored from the server session (same role and account tag) without signing in again. |
| Actual result | ✔ still BORROWER WORKSPACE after full page reload<br>✔ same account tag after reload |
| Executed | 2026-11-03T05:20:34.897Z → 2026-11-03T05:20:36.079Z (phase1) |
| Evidence path | `screenshots/E2E-AUTH-05-after-refresh.png` |

### E2E-AUTH-06 — Logout returns to login; /auth/me and a protected API return 401; /dashboard redirects to login

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-04 (partial), AC-12; RTM TC-02. Limit: the browser cookie is cleared by logout, so the old cookie value is not replayed here; replay of a revoked cookie is covered only by server tests (TEST-FEAT-01-04). |
| Preconditions | Signed in as Borrower A |
| Steps | Click Sign out. From the page call GET /auth/me and GET /requests/mine. Open /dashboard. |
| Expected result | Back on /login; both API calls 401; /dashboard redirects to /login. |
| Actual result | ✔ back on /login<br>✔ /auth/me returns 401 after logout<br>✔ protected /requests/mine returns 401<br>✔ /dashboard redirects to /login after logout<br>Observed — me after logout: 401 |
| Executed | 2026-11-03T05:21:10.235Z → 2026-11-03T05:21:13.416Z (phase1) |
| Evidence path | `screenshots/E2E-AUTH-06-after-logout.png` |

### E2E-AUTH-07 — Custodian login shows the Custodian workspace; no Borrower request controls

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-01, AC-12; BR-03 |
| Preconditions | Signed out |
| Steps | Sign in as Custodian A (e2e.custodian.a; scope KL-CAM-001, KL-CAM-002, KL-OLD-001). |
| Expected result | CUSTODIAN WORKSPACE with matching account tag; no Borrower navigation link. |
| Actual result | ✔ CUSTODIAN WORKSPACE with matching account tag<br>✔ Borrower navigation link absent |
| Executed | 2026-11-03T05:21:23.531Z → 2026-11-03T05:21:29.787Z (phase1) |
| Evidence path | `screenshots/E2E-AUTH-07-custodian-dashboard.png` |

### E2E-AUTH-08 — Custodian visiting /requests is redirected to /dashboard

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | BR-03 (UI route guard) |
| Preconditions | Signed in as Custodian A |
| Steps | Open /requests directly. |
| Expected result | Redirected to /dashboard. |
| Actual result | ✔ redirected to /dashboard |
| Executed | 2026-11-03T05:21:29.789Z → 2026-11-03T05:21:30.923Z (phase1) |
| Evidence path | — (assertions only; see `results/e2e-results.json`) |

### E2E-AUTH-09 — Session ended mid-action: 401 clears protected UI state and returns to login

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-12 (401 clears protected UI state). Limit: this does NOT replay a revoked token or test time-based expiry; the logout response also clears the cookie, so the 401 is for a request with no cookie. |
| Preconditions | Signed in as Borrower B (e2e.borrower.b) on /requests with KL-LAP-001 selected |
| Steps | End the session server-side (call POST /auth/logout from the page; the response clears the cookie). Click Submit request. |
| Expected result | POST /requests returns 401; UI shows "Your session has ended"; redirected to /login; no protected content remains. |
| Actual result | ✔ setup: session revoked server-side via logout call (204)<br>✔ POST /requests returned 401<br>✔ redirected to /login<br>✔ no protected content (catalog/requests/loans) remains in the page<br>Observed — revoke: 204; POST: [401] |
| Executed | 2026-11-03T05:23:18.129Z → 2026-11-03T05:23:22.888Z (phase2) |
| Evidence path | `screenshots/E2E-AUTH-09-session-ended.png` |

### E2E-CAT-01 — Borrower catalog lists non-retired assets in name then Asset ID order, all Available

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-02 AC-01, AC-03, AC-06, AC-07, AC-08, AC-12; RTM TC-04/TC-05 |
| Preconditions | Signed in as Borrower A. Fixture: KL-CAM-001, KL-CAM-002 (same name), KL-LAP-001, retired KL-OLD-001; no loans |
| Steps | View the dashboard catalog. |
| Expected result | Three non-retired assets in name then ID order, all Available, distinct IDs, retired asset hidden, h2 heading. |
| Actual result | ✔ order is Development laptop, then Mirrorless camera KL-CAM-001, KL-CAM-002<br>✔ retired KL-OLD-001 is not shown<br>✔ all three show Available<br>✔ Asset IDs are distinct; two cameras share a name<br>✔ catalog heading is an h2<br>Observed — cards: ["KL-LAP-001 \| Development laptop \| Available","KL-CAM-001 \| Mirrorless camera \| Available","KL-CAM-002 \| Mirrorless camera \| Available"] |
| Executed | 2026-11-03T05:20:36.079Z → 2026-11-03T05:20:36.148Z (phase1) |
| Evidence path | `screenshots/E2E-CAT-01-borrower-catalog.png` |

### E2E-CAT-02 — Custodian sees the catalog but no Request controls

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-02 AC-01; FEAT-03 (no request control for Custodian) |
| Preconditions | Signed in as Custodian A |
| Steps | View the catalog. |
| Expected result | Same three assets; no Request buttons. |
| Actual result | ✔ three cards shown<br>✔ no Request buttons for a Custodian |
| Executed | 2026-11-03T05:21:29.787Z → 2026-11-03T05:21:29.789Z (phase1) |
| Evidence path | — (assertions only; see `results/e2e-results.json`) |

### E2E-CAT-03 — Catalog renders at a 390x844 mobile viewport without horizontal overflow

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-02 AC-12 (responsive layout) |
| Preconditions | Signed in as Borrower A; viewport emulated 390x844 |
| Steps | Open /dashboard. |
| Expected result | Three cards, no horizontal overflow. |
| Actual result | ✔ no horizontal overflow (scrollWidth 390 <= clientWidth 390)<br>✔ three cards rendered<br>Observed — scrollWidth/clientWidth: {"sw":390,"cw":390} |
| Executed | 2026-11-03T05:20:36.156Z → 2026-11-03T05:20:37.394Z (phase1) |
| Evidence path | `screenshots/E2E-CAT-03-mobile-390.png` |

### E2E-CAT-04 — GET /assets is no-store and exposes only the five allowlisted fields

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-02 AC-02, NFR (no-store) |
| Preconditions | Signed in as Borrower A |
| Steps | Call GET /assets from the page. |
| Expected result | 200, Cache-Control no-store, only assetId/name/category/description/available. |
| Actual result | ✔ status 200<br>✔ Cache-Control contains no-store<br>✔ keys are exactly assetId, available, category, description, name<br>Observed — cache-control: "no-store"; keys: ["assetId","available","category","description","name"] |
| Executed | 2026-11-03T05:20:36.148Z → 2026-11-03T05:20:36.156Z (phase1) |
| Evidence path | — (assertions only; see `results/e2e-results.json`) |

### E2E-REQ-01 — Borrower A submits a request for KL-CAM-001 from the catalog; it is saved as PENDING

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-03 FR-06, FR-07; RTM TC-06/TC-07 |
| Preconditions | Borrower A signed in; no requests |
| Steps | Click "Request to borrow" on KL-CAM-001; confirm /requests preselects it; click Submit request. |
| Expected result | POST /requests 201; success notice; My requests lists KL-CAM-001 · PENDING with a server-assigned request ID. |
| Actual result | ✔ My requests lists KL-CAM-001 · PENDING<br>✔ request has a server-assigned ID<br>✔ exactly one POST /requests returned 201<br>Observed — myRequests: ["Mirrorless camera\nKL-CAM-001 · PENDING\nRequest 953ab7e2-dabb-4fdf-809d-0fe3d1aee206\nSubmitted 11/3/2026, 12:20:38 PM"]; POST /requests: [201] |
| Executed | 2026-11-03T05:20:37.394Z → 2026-11-03T05:20:40.729Z (phase1) |
| Evidence path | `screenshots/E2E-REQ-01-form-preselected.png`<br>`screenshots/E2E-REQ-01-after-submit.png` |

### E2E-REQ-02 — A pending request does not reserve equipment or create a loan

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-03 BR-10; RTM TC-21; FEAT-02 AC-13 |
| Preconditions | E2E-REQ-01 completed |
| Steps | Reload /dashboard; read the catalog; GET /loans/mine. |
| Expected result | KL-CAM-001 still Available with an enabled button; no loan exists (no reservation). |
| Actual result | ✔ catalog still shows KL-CAM-001 Available after the request<br>✔ Request button still enabled for another borrower<br>✔ GET /loans/mine returns no loan |
| Executed | 2026-11-03T05:20:40.729Z → 2026-11-03T05:20:54.901Z (phase1) |
| Evidence path | `screenshots/E2E-REQ-02-still-available.png` |

### E2E-REQ-03 — Duplicate pending request by the same borrower for the same asset is blocked

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-03 duplicate policy; BR-10; RTM TC-21 |
| Preconditions | Borrower A has a pending KL-CAM-001 request |
| Steps | Open /requests and read selectable assets; force POST /requests for KL-CAM-001 from the page. |
| Expected result | Selector omits KL-CAM-001; forced POST returns 409 DUPLICATE_REQUEST; still one request. |
| Actual result | ✔ UI selector no longer offers KL-CAM-001<br>✔ forced POST returns 409 DUPLICATE_REQUEST<br>✔ still exactly one KL-CAM-001 request<br>Observed — selectableAssets: ["","KL-LAP-001","KL-CAM-002"]; forced POST: {"status":409,"code":"DUPLICATE_REQUEST"} |
| Executed | 2026-11-03T05:20:54.901Z → 2026-11-03T05:20:56.062Z (phase1) |
| Evidence path | — (assertions only; see `results/e2e-results.json`) |

### E2E-REQ-04 — Borrower B requests the same KL-CAM-001; both pending requests coexist; B sees only own

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-03 BR-10, FR-07; RTM TC-07/TC-21 |
| Preconditions | Borrower B (e2e.borrower.b) has no requests; Borrower A has a pending KL-CAM-001 request |
| Steps | Sign in as B; request KL-CAM-001 through the UI; view My requests and the catalog. |
| Expected result | B has one PENDING request, does not see A's request, and KL-CAM-001 stays Available with two pending requests. |
| Actual result | ✔ B's My requests starts empty (A's requests not visible)<br>✔ B has one PENDING request for KL-CAM-001<br>✔ A's request ID is not shown to B<br>✔ KL-CAM-001 remains Available with two pending requests |
| Executed | 2026-11-03T05:21:13.416Z → 2026-11-03T05:21:19.629Z (phase1) |
| Evidence path | `screenshots/E2E-REQ-04-form-preselected.png`<br>`screenshots/E2E-REQ-04-two-borrowers-pending.png` |

### E2E-REQ-05 — Borrower B cannot read Borrower A's request by direct ID (404, no details)

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-07; BR-04; RTM TC-07 |
| Preconditions | Borrower B signed in; A's request ID known |
| Steps | GET /requests/<A's id> from the page; GET /requests/mine. |
| Expected result | 404 without A's details; list contains only B-owned requests. |
| Actual result | ✔ direct GET of A's request returns 404<br>✔ response does not leak A's user ID<br>✔ list contains only B-owned requests<br>Observed — status: 404 |
| Executed | 2026-11-03T05:21:19.629Z → 2026-11-03T05:21:19.690Z (phase1) |
| Evidence path | — (assertions only; see `results/e2e-results.json`) |

### E2E-REQ-06 — Borrower A submits a second request (KL-LAP-001) used for custodian scope checks

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-03 FR-06 (second request for scope tests) |
| Preconditions | Borrower A signed in |
| Steps | Request KL-LAP-001 through the UI. |
| Expected result | KL-LAP-001 · PENDING listed alongside the camera request (2 records). |
| Actual result | ✔ KL-LAP-001 · PENDING listed<br>✔ two requests listed for Borrower A |
| Executed | 2026-11-03T05:20:56.062Z → 2026-11-03T05:21:10.235Z (phase1) |
| Evidence path | `screenshots/E2E-REQ-06-form-preselected.png`<br>`screenshots/E2E-REQ-06-two-requests.png` |

### E2E-CHK-01 — Custodian A's queue shows both camera requests oldest-first with requester and Asset ID, not the laptop

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-03 FR-08; BR-05; RTM TC-08 |
| Preconditions | Pending: A→KL-CAM-001, B→KL-CAM-001, A→KL-LAP-001 |
| Steps | Sign in as Custodian A and read Pending requests. |
| Expected result | Only the two camera requests, oldest first, with requester username and Asset ID; laptop request absent. |
| Actual result | ✔ two pending requests<br>✔ first (oldest) is Borrower A's KL-CAM-001 request<br>✔ second is Borrower B's KL-CAM-001 request<br>✔ laptop request (other custodian) absent<br>Observed — queue: ["Mirrorless camera\nKL-CAM-001 · PENDING\nRequest 953ab7e2-dabb-4fdf-809d-0fe3d1aee206\nSubmitted 11/3/2026, 12:20:38 PM\nBorrower: e2e.borrower.a · cf4a9935-9f77-4d0d-86be-088d4d77275c\nDue date for KL-CAM-001\n\nConfirm the physical handoff before record… |
| Executed | 2026-11-03T05:21:30.923Z → 2026-11-03T05:21:32.605Z (phase1) |
| Evidence path | `screenshots/E2E-CHK-01-custodian-a-queue.png` |

### E2E-CHK-02 — Custodian B (KL-LAP-001 only) sees only the laptop request, not camera requests

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-03 FR-08; BR-05; FEAT-01 AC-08; RTM TC-08 |
| Preconditions | Same pending requests |
| Steps | Sign in as Custodian B and read Pending requests. |
| Expected result | Only the KL-LAP-001 request from Borrower A; camera requests absent. |
| Actual result | ✔ CUSTODIAN WORKSPACE shown<br>✔ queue holds exactly the KL-LAP-001 request from e2e.borrower.a<br>✔ camera requests absent from queue<br>Observed — queue: ["Development laptop\nKL-LAP-001 · PENDING\nRequest 48fcedcb-e91e-478b-9963-525bd5e001a5\nSubmitted 11/3/2026, 12:20:57 PM\nBorrower: e2e.borrower.a · cf4a9935-9f77-4d0d-86be-088d4d77275c\nDue date for KL-LAP-001\n\nConfirm the physical handoff before recor… |
| Executed | 2026-11-03T05:21:20.281Z → 2026-11-03T05:21:22.976Z (phase1) |
| Evidence path | `screenshots/E2E-CHK-02-custodian-b-scoped-queue.png` |

### E2E-CHK-03 — A past due date is rejected in the UI and no checkout request is sent

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-04 due-date validation; BR-11; RTM TC-09 |
| Preconditions | Custodian A on dashboard; request A→KL-CAM-001 pending |
| Steps | Enter a due date one day in the past and click Check out. |
| Expected result | UI message "Choose a valid due date later than the checkout time."; no POST .../checkout sent. |
| Actual result | ✔ message "Choose a valid due date later than the checkout time." shown<br>✔ no POST .../checkout was sent |
| Executed | 2026-11-03T05:21:32.606Z → 2026-11-03T05:21:44.962Z (phase1) |
| Evidence path | `screenshots/E2E-CHK-03-past-due-rejected.png` |

### E2E-CHK-04 — Custodian A checks out Borrower A's KL-CAM-001 request: request leaves queue, one ACTIVE loan with correct references

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-04 FR-09, FR-10; BR-01, BR-02, BR-06; RTM TC-09/TC-10 |
| Preconditions | Same; KL-CAM-001 Available |
| Steps | Enter a due date 7 days ahead and click Check out for Borrower A's request. |
| Expected result | POST checkout 201; request leaves the queue; Active loans shows one ACTIVE loan referencing the request, Borrower A and Custodian A; API dueAt equals the chosen date; returnedAt null. |
| Actual result | ✔ exactly one POST checkout returned 201<br>✔ A's request left the pending queue<br>✔ Active loans shows KL-CAM-001 · ACTIVE<br>✔ loan references the request, Borrower A and Custodian A IDs<br>✔ API: one ACTIVE loan with returnedAt null<br>✔ API dueAt equals the chosen due date (2026-11-10T05:21:00.000Z)<br>✔ checkedOutAt is before dueAt<br>Observed — POST checkout: [201]; activeLoansUi: ["KL-CAM-001 · ACTIVE\nLoan 3bdddbd1-319d-49c5-b8ca-fd7c17635d5a\nRequest 953ab7e2-dabb-4fdf-809d-0fe3d1aee206\nBorrower cf4a9935-9f77-4d0d-86be-088d4d77275c\nChecked out by 9a0c0b51-378b-41c6-94ce-061b4ad43933\nChecked out 11/3/2026, 12:21:45 PM\nDue 11/10…; loanApi: [{"id":"3bdddbd1-319d-49c5-b8ca-fd7c17635d5a","requestId":"953ab7e2-dabb-4fdf-809d-0fe3d1aee206","assetId":"KL-CAM-001","borrowerId":"cf4a9935-9f77-4d0d-86be-088d4d77275c","checkoutCustodianId":"9a0c0b51-378b-41c6-94ce-061b4ad43933","checkedOutAt":"2026-11-… |
| Executed | 2026-11-03T05:21:44.962Z → 2026-11-03T05:21:48.508Z (phase1) |
| Evidence path | `screenshots/E2E-CHK-04-checkout-success.png` |

### E2E-CHK-05 — Competing request for the now-unavailable asset stays PENDING; checkout disabled; forced checkout returns 409

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-04 BR-09, BR-02; RTM TC-19 (UI/API surface only) |
| Preconditions | KL-CAM-001 now checked out; B's request still pending |
| Steps | Inspect B's checkout form; force POST checkout for B's request from the page. |
| Expected result | Form disabled with "no longer available" message; forced POST 409 ASSET_UNAVAILABLE; request stays PENDING; still one active loan. |
| Actual result | ✔ Borrower B's request remains in the queue<br>✔ checkout button and due-date input are disabled<br>✔ message "Equipment is no longer available for checkout." shown<br>✔ forced POST returns 409 ASSET_UNAVAILABLE<br>✔ B's request is still PENDING<br>✔ still exactly one active loan<br>Observed — form: {"disabledBtn":true,"disabledInput":true,"msg":"Due date for KL-CAM-001\n\nConfirm the physical handoff before recording checkout. The due date uses your local timezone.\n\nEquipment is no longer available for checkout.\n\nCheck out"}; forced: {"status":409,"code":"ASSET_UNAVAILABLE"} |
| Executed | 2026-11-03T05:21:48.508Z → 2026-11-03T05:21:48.669Z (phase1) |
| Evidence path | `screenshots/E2E-CHK-05-competing-request-blocked.png` |

### E2E-CHK-06 — Borrower cannot check out: forced POST returns 403 and request stays PENDING

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-06; BR-03; RTM TC-18 |
| Preconditions | Borrower B signed in; B's pending request ID known |
| Steps | Force POST /requests/<id>/checkout as a Borrower. |
| Expected result | 403; request still PENDING; no loan created. |
| Actual result | ✔ POST checkout as Borrower returns 403<br>✔ request still PENDING<br>✔ no loan created<br>Observed — status: 403 |
| Executed | 2026-11-03T05:21:19.690Z → 2026-11-03T05:21:20.281Z (phase1) |
| Evidence path | — (assertions only; see `results/e2e-results.json`) |

### E2E-CHK-07 — Custodian B cannot check out another custodian's request (404) and nothing changes

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-08; BR-05; RTM TC-09 |
| Preconditions | Custodian B signed in; B-borrower's KL-CAM-001 request pending |
| Steps | Force POST checkout of that request as Custodian B. |
| Expected result | 404; no active loan exists. |
| Actual result | ✔ out-of-scope checkout returns 404<br>✔ no active loan exists<br>Observed — status: 404 |
| Executed | 2026-11-03T05:21:22.976Z → 2026-11-03T05:21:23.530Z (phase1) |
| Evidence path | — (assertions only; see `results/e2e-results.json`) |

### E2E-CHK-08 — Direct loan reads are scoped: Borrower B and Custodian B get 404; owner Borrower A and Custodian A get 200

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-01 AC-07/AC-08; BR-04, BR-05 |
| Preconditions | Loan from E2E-CHK-04; API restarted |
| Steps | Read GET /loans/<id> as Borrower B, Custodian B, Borrower A, Custodian A; read Custodian A's active loans. |
| Expected result | 404, 404, 200 (ACTIVE), 200; active list shows the two loans. |
| Actual result | ✔ Borrower B -> 404<br>✔ Custodian B (out of scope) -> 404<br>✔ Borrower A (owner) -> 200 ACTIVE<br>✔ Custodian A (scoped) -> 200<br>✔ Custodian A active loans after restart: the original loan and the setup loan (2)<br>Observed — statuses: {"borrowerB":404,"custodianB":404,"borrowerA":200,"custodianA":200,"activeIds":["9216a57f-7ab9-49c7-9627-b5cf6f233f3a","3bdddbd1-319d-49c5-b8ca-fd7c17635d5a"]} |
| Executed | 2026-11-03T05:23:02.862Z → 2026-11-03T05:23:18.129Z (phase2) |
| Evidence path | `screenshots/E2E-PER-02-custodian-a-active-loans-after-restart.png` |

### E2E-AVL-01 — Borrower A sees CHECKED_OUT request, ACTIVE loan, and KL-CAM-001 unavailable

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-02 AC-13, S2-01 (checkout half); FEAT-04; BR-08 |
| Preconditions | Checkout E2E-CHK-04 committed |
| Steps | Sign in as Borrower A; read catalog, My requests, My loans, and the request form options. |
| Expected result | KL-CAM-001 "Checked out" with disabled labelled button; request CHECKED_OUT; one ACTIVE loan; form omits KL-CAM-001. |
| Actual result | ✔ catalog badge "Checked out"<br>✔ Request button disabled with explanatory label<br>✔ My requests: KL-CAM-001 · CHECKED_OUT<br>✔ My requests: KL-LAP-001 still PENDING<br>✔ My loans: KL-CAM-001 · ACTIVE with the same loan ID<br>✔ request form no longer offers KL-CAM-001<br>Observed — requests: ["Development laptop\nKL-LAP-001 · PENDING\nRequest 48fcedcb-e91e-478b-9963-525bd5e001a5\nSubmitted 11/3/2026, 12:20:57 PM","Mirrorless camera\nKL-CAM-001 · CHECKED_OUT\nRequest 953ab7e2-dabb-4fdf-809d-0fe3d1aee206\nSubmitted 11/3/2026, 12:20:38 PM"]; loans: ["KL-CAM-001 · ACTIVE\nLoan 3bdddbd1-319d-49c5-b8ca-fd7c17635d5a\nRequest 953ab7e2-dabb-4fdf-809d-0fe3d1aee206\nBorrower cf4a9935-9f77-4d0d-86be-088d4d77275c\nChecked out by 9a0c0b51-378b-41c6-94ce-061b4ad43933\nChecked out 11/3/2026, 12:21:45 PM\nDue 11/10…; selectable: ["","KL-CAM-002"] |
| Executed | 2026-11-03T05:21:49.219Z → 2026-11-03T05:21:55.322Z (phase1) |
| Evidence path | `screenshots/E2E-AVL-01-borrower-a-after-checkout.png` |

### E2E-AVL-02 — Custodian catalog shows KL-CAM-001 Checked out after checkout

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-02 AC-03; BR-08 |
| Preconditions | Custodian A signed in after checkout |
| Steps | Read the Custodian catalog. |
| Expected result | KL-CAM-001 Checked out; KL-CAM-002 Available. |
| Actual result | ✔ KL-CAM-001 badge is "Checked out"<br>✔ second camera KL-CAM-002 remains Available |
| Executed | 2026-11-03T05:21:48.669Z → 2026-11-03T05:21:49.219Z (phase1) |
| Evidence path | — (assertions only; see `results/e2e-results.json`) |

### E2E-AVL-03 — Server rejects a new request for a checked-out asset (409 ASSET_UNAVAILABLE) and writes nothing

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-03 availability rule (I1); BR-13 partial; RTM TC-06 |
| Preconditions | KL-CAM-001 checked out; KL-OLD-001 retired; Borrower B signed in |
| Steps | Force POST /requests for KL-CAM-001 and for KL-OLD-001. |
| Expected result | Both 409 ASSET_UNAVAILABLE; request count unchanged. |
| Actual result | ✔ POST /requests returns 409 ASSET_UNAVAILABLE<br>✔ request count unchanged<br>✔ retired KL-OLD-001 request returns 409 ASSET_UNAVAILABLE<br>Observed — forced: {"status":409,"code":"ASSET_UNAVAILABLE"}; retired: {"status":409,"code":"ASSET_UNAVAILABLE"} |
| Executed | 2026-11-03T05:21:55.322Z → 2026-11-03T05:22:00.412Z (phase1) |
| Evidence path | `screenshots/E2E-AVL-03-borrower-b-view.png` |

### E2E-AVL-04 — Availability sequence Available -> (request) Available -> (checkout) Checked out holds for both roles

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | Plan: selected normal journey; BR-08 |
| Preconditions | Observations from REQ-02, AVL-01, AVL-02 |
| Steps | Compare recorded badges across the journey. |
| Expected result | Available → (request) Available → (checkout) Checked out for both roles. |
| Actual result | ✔ after request: Available (observed Available)<br>✔ borrower view after checkout: Checked out (observed Checked out)<br>✔ custodian view after checkout: Checked out (observed Checked out) |
| Executed | 2026-11-03T05:22:00.412Z → 2026-11-03T05:22:00.412Z (phase1) |
| Evidence path | — (assertions only; see `results/e2e-results.json`) |

### E2E-AVL-05 — Stale catalog: a request for an asset checked out meanwhile gets 409, the UI shows the message and refreshes availability

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-02 AC-13 on real endpoints; FEAT-03 I1 |
| Preconditions | Borrower A page open showing KL-CAM-002 Available; then KL-CAM-002 is requested and checked out via API setup |
| Steps | In the stale page click Request to borrow for KL-CAM-002 and Submit; then open the Equipment dashboard link. |
| Expected result | POST /requests 409; unavailable message shown; catalog refetched; KL-CAM-002 shows Checked out with no reload; no request written. |
| Actual result | ✔ precondition: KL-CAM-002 shown Available with enabled button in the open page<br>✔ setup: request 201 and checkout 201 via API client<br>✔ UI shows the server conflict message<br>✔ POST /requests returned 409<br>✔ catalog was re-fetched (GET /assets) after the 409<br>✔ KL-CAM-002 now shows Checked out without a page reload<br>✔ Borrower A has no request for KL-CAM-002 (nothing written)<br>Observed — setup: {"borrowerBRequest":201,"custodianCheckout":201}; message: "This equipment is unavailable. Choose another item."; POST: [409]; badge after refresh: "Checked out" |
| Executed | 2026-11-03T05:22:58.785Z → 2026-11-03T05:23:02.862Z (phase2) |
| Evidence path | `screenshots/E2E-AVL-05-stale-form-preselected.png`<br>`screenshots/E2E-AVL-05-conflict-message.png`<br>`screenshots/E2E-AVL-05-after-refresh.png` |

### E2E-PER-01 — After an API process restart, Borrower A still sees the same CHECKED_OUT request, ACTIVE loan and unavailable asset

| Field | Value |
| --- | --- |
| Status | **PASS** |
| Requirement | FEAT-04 FR-10 restart/readback; NFR-05; RTM TC-10/TC-25 |
| Preconditions | API process stopped (health check returned no response) and started again on the same database |
| Steps | Sign in as Borrower A; read catalog, requests, loans. |
| Expected result | Same request ID CHECKED_OUT, same loan ID ACTIVE, KL-CAM-001 Checked out. |
| Actual result | ✔ catalog: KL-CAM-001 Checked out after restart<br>✔ request keeps its ID and CHECKED_OUT status<br>✔ loan keeps its ID and ACTIVE status<br>Observed — requests: ["Development laptop\nKL-LAP-001 · PENDING\nRequest 48fcedcb-e91e-478b-9963-525bd5e001a5\nSubmitted 11/3/2026, 12:20:57 PM","Mirrorless camera\nKL-CAM-001 · CHECKED_OUT\nRequest 953ab7e2-dabb-4fdf-809d-0fe3d1aee206\nSubmitted 11/3/2026, 12:20:38 PM"]; loans: ["KL-CAM-001 · ACTIVE\nLoan 3bdddbd1-319d-49c5-b8ca-fd7c17635d5a\nRequest 953ab7e2-dabb-4fdf-809d-0fe3d1aee206\nBorrower cf4a9935-9f77-4d0d-86be-088d4d77275c\nChecked out by 9a0c0b51-378b-41c6-94ce-061b4ad43933\nChecked out 11/3/2026, 12:21:45 PM\nDue 11/10… |
| Executed | 2026-11-03T05:22:56.160Z → 2026-11-03T05:22:58.785Z (phase2) |
| Evidence path | `screenshots/E2E-PER-01-borrower-a-after-restart.png` |

## Not run

Cases that were planned or are required by the contracts but were **not executed in the browser** (NOT RUN / BLOCKED), with reasons, are in [verification-summary.md](verification-summary.md#untested-and-blocked). They are intentionally absent from the table above.
