# FEAT-04 Custodian Checkout Workflow

Status: **v1.0 — Accepted in Sprint 1 release `49cb6e3`.** Reviewed by `yiiipunn` and merged to `sprint-1-staging` through PR #18 (`52b187c`, 2026-11-03); released to `main` through PR #23. The original v0.1 status text ("Implementation candidate; teammate review and PR merge pending") is kept in Git history. See the [version history](#version-history) for what v1.0 changed.

Baseline: `sprint-1-staging` at `1e6717b`, 2026-11-03. Branch: `feature/custodian-checkout-workflow`.

## Scope and requirement alignment

F-04 implements the checkout portion of FEAT-04: FR-08 (scoped queue, owned by FEAT-03), FR-09, FR-10, and the shared FR-05 availability contract. BR-01, BR-02, BR-03, BR-05, BR-06, BR-08, BR-09, and BR-11 govern checkout. NFR-01, NFR-03–NFR-06 govern security, validation, safe errors, persistence, and atomicity. Existing borrower ownership boundaries remain in force.

This issue explicitly names the post-checkout request status `CHECKED_OUT`, replacing the prior `FULFILLED` enum label. The current SRS, Feature Inventory, RTM, SDS, application types, and regression tests use the new label. Historical evidence/contracts remain records of their original baseline. Neither label represents a separate approval stage.

Loan status is exposed as `ACTIVE` when the persisted `returnedAt` is null, otherwise `RETURNED`. The stored Loan contains borrower, asset, request, checkout custodian, checkout timestamp, due timestamp, and return facts. Status and equipment availability are derived from those facts rather than stored as independently editable values. This avoids partial inventory updates: committing the loan makes the next catalog query unavailable automatically.

The sprint plan targets checkout in Sprint 1; original baseline documents assign first verification to Sprint 2. This implementation delivers the Sprint 1 issue without claiming that the broader course/baseline allocation conflict recorded in `docs/sprints/plan.md` has been reviewed and resolved. Return, overdue rules, inventory retirement endpoints, and assignment management are outside this issue.

## Interface and state transitions

Custodians see authorized pending requests with request ID, borrower ID/username, asset ID/name/category, and submission time. Each request has a labeled checkout form with a local due-date input and handoff guidance. The form is disabled while busy or availability is unknown/unavailable. It converts a valid future local date to an ISO timestamp, while the server independently validates it.

`POST /api/requests/:id/checkout` requires an authenticated Custodian, trusted Origin, and valid session-bound CSRF token. Accept exactly:

```json
{ "assetId": "KL-CAM-001", "dueAt": "2030-01-02T09:00:00.000Z" }
```

The request ID comes from the route. Only `assetId` and `dueAt` are accepted in the body. Borrower, custodian, checkout time, loan/request status, and loan references are server assigned. Due dates require a valid calendar date and explicit timezone; missing, impossible, numeric/coercible, or timezone-free dates are rejected. The department's maximum loan-duration policy is still OQ-01; no maximum or default is invented here.

Success is 201 with the committed Loan DTO: `id`, `requestId`, `assetId`, `borrowerId`, `checkoutCustodianId`, `checkedOutAt`, `dueAt`, `returnedAt`, `returnCustodianId`, and derived `status: "ACTIVE"`. The request becomes `CHECKED_OUT`; the scoped pending queue no longer includes it. `/loans/active`, `/loans/mine`, and authorized direct loan reads return the same derived status. The UI refreshes queue, catalog, and loans and displays loan identifiers and timestamps after success.

| Failure | HTTP / behavior |
| --- | --- |
| Missing, expired, or revoked session | 401; client clears private state and redirects to login. |
| Borrower role, disallowed Origin, or invalid/missing CSRF | 403; no mutation. The client retains a valid session on authorization denial. |
| Unknown/malformed/inaccessible request ID | Generic 404; no disclosure of another custodian's request. |
| Invalid body/date or due date not after actual checkout time | 400 `VALIDATION_ERROR` with field feedback. |
| Asset mismatch | 409 `REQUEST_MISMATCH`. |
| Non-pending/already checked-out request | 409 `REQUEST_NOT_PENDING`. |
| Retired asset or existing active loan | 409 `ASSET_UNAVAILABLE`. |
| Concurrent uniqueness/serialization conflict | 409 `CHECKOUT_CONFLICT`; UI refreshes and asks for a current decision. |
| Unexpected internal failure | Sanitized 500; transaction rolls back. |

After 409 the UI refreshes availability/queue and disables checkout if the item is now unavailable. A committed checkout followed by a failed read is explicitly reported as successful with a refresh error; the UI does not offer the stale checkout form. Borrowers receive no checkout or loan-status modification interface, and no generic loan-status write API exists.

## Transaction and invariants

1. Resolve the request only within the signed-in custodian's inventory scope. Use its persisted asset reference, not the supplied Asset ID, to choose the lock.
2. In one serializable PostgreSQL transaction, lock the asset row, then the request row using parameterized `SELECT ... FOR UPDATE`.
3. Reload the scoped request; verify Asset ID match and `PENDING` status. Check retirement and active-loan count through the same canonical availability rules as catalog/request submission.
4. Capture server `checkedOutAt` after lock acquisition and require `dueAt > checkedOutAt`. A date that expired while waiting cannot create a loan.
5. Conditionally change the still-pending request to `CHECKED_OUT`, then create its loan using persisted borrower/asset/request references and server custodian/time. Any failure rolls back both writes.
6. Commit before returning 201. Derive `ACTIVE` and unavailable catalog state from the committed row.

`Loan.requestId` remains unique and the PostgreSQL partial unique index on `Loan(assetId)` where `returnedAt IS NULL` independently prevents duplicate active loans. Asset-then-request locking reduces conflicting work; serialization/unique conflicts still safely return 409. Repeated or concurrent checkout never updates the original loan's timestamps. Across two pending requests for the same asset, exactly one wins, and the losing request remains `PENDING`. No automatic retry chooses another request or silently repeats a handoff.

## Migration and deployment

Migration `20261103100000_checked_out_request_status` uses `ALTER TYPE ... RENAME VALUE` to rename `FULFILLED` to `CHECKED_OUT` in place. Existing request IDs, timestamps, loan foreign keys, and `PENDING` rows remain intact. Prior migrations are unchanged. A migration test executes the actual SQL against populated historic rows in an isolated temporary schema and verifies preserved values/references.

This is a coordinated API/client change: old Prisma code and clients expecting `FULFILLED` are incompatible with the renamed label. Back up the target database, stop the old API, apply **all** migrations with `npm run db:deploy`, regenerate Prisma with `npx prisma generate`, build/deploy the new client/API, then restart and smoke-test. Follow the F-03 duplicate-pending preflight if its migration has not yet been applied. Do not reset or reseed production data to apply this change. A rollback requires a coordinated reverse rename and matching application version; do not edit applied migration files.

## Acceptance and automated evidence

| Acceptance area | Automated evidence |
| --- | --- |
| Scoped queue with borrower and asset details | `server/tests/checkout.test.ts`; existing request authorization tests |
| Valid checkout, exact references/timestamps, one ACTIVE loan | `server/tests/checkout.test.ts` |
| `PENDING` → `CHECKED_OUT`, immediate catalog/queue/loan reads | `server/tests/checkout.test.ts`; updated F-03 regression cases |
| Unavailable/retired/mismatched/non-pending request | `server/tests/checkout.test.ts` |
| Repeated and concurrent same-request checkout | `server/tests/checkout.test.ts` |
| Two custodians, different requests, one exclusive asset | `server/tests/checkout.test.ts`; existing concurrency regression |
| Unauthorized role/scope/session/CSRF; forbidden status writes | `server/tests/checkout.test.ts`; existing authentication tests |
| Atomic rollback after request update but before loan insert | Retained database-failure trigger test in `server/tests/borrow-requests.test.ts`, now exercising the checkout service |
| Strict payload/calendar/timezone/date boundary validation | `server/tests/checkout-unit.test.ts` and `checkout.test.ts` |
| Loan status derivation and historic enum migration | `server/tests/checkout-unit.test.ts` and `checkout.test.ts` |
| Checkout form/date feedback, disabled states, loan display | `client/tests/checkout.test.tsx` |
| Success, duplicate clicks, 409 refresh, 403, 401, 500, post-success read failure | `client/tests/checkout-workflow.test.tsx` |

Run `npm test` and `npm run build` from `server/` against an isolated PostgreSQL test database configured in ignored `.env.test` after migration/Prisma generation. Run `npm test`, `npm run build`, and `npm run lint` from `client/`. Client tests use jsdom and mocked HTTP, not a live browser. See [verification record](../../../artifacts/sprint-1/custodian-checkout/evidence.md) for actual results and limitations.

Teammate review, live-browser borrower-request → custodian-checkout → borrower `CHECKED_OUT` history verification, PR approval, and merge remain pending. Both team members should review enum compatibility, authority boundaries, concurrent custody transitions, rollback, and the open due-date policy before acceptance.

## Acceptance criteria (v1.0 numbering)

> **Retroactive numbering.** v0.1 (commit `1346b2d`) listed these acceptance areas in the table above without IDs. v1.0 (2026-11-07) assigns stable IDs to the same areas, in the same order as Table F.6d of the Deliverable 1 report. No behavior was added or relaxed. The IDs were assigned **after** implementation.

| AC ID | Requirement links | Given / When | Then (observable outcome) |
| --- | --- | --- | --- |
| AC-FEAT-04-01 | FR-08, BR-05 / TC-08 | A Custodian opens the pending queue | Only `PENDING` requests for assets assigned to that Custodian, with borrower and equipment details |
| AC-FEAT-04-02 | FR-09, FR-10 / TC-09, TC-10 | An assigned Custodian checks out a pending request with a valid future `dueAt` | 201 Loan DTO; request → `CHECKED_OUT`; exactly one `ACTIVE` loan with persisted borrower/asset/request/custodian/time; catalog, queue and loan reads update immediately |
| AC-FEAT-04-03 | BR-01, BR-06 / TC-09 | Missing or malformed request ID, asset mismatch, non-pending request, or retired asset | 404 / 409 `REQUEST_MISMATCH` / 409 `REQUEST_NOT_PENDING` / 409 `ASSET_UNAVAILABLE`; nothing changes |
| AC-FEAT-04-04 | BR-11 / TC-09 | `dueAt` is missing, impossible, timezone-free, coercible, in the past, or not after the server checkout instant | 400 `VALIDATION_ERROR`; no loan; the request stays `PENDING` |
| AC-FEAT-04-05 | BR-02 / TC-19 | The same request is checked out again, or twice concurrently | One success; the others 409; the original loan is unchanged |
| AC-FEAT-04-06 | BR-02, BR-09 / TC-19 | Two Custodians check out two different pending requests for one asset at the same time | Exactly one wins; the losing request stays `PENDING`; one active loan |
| AC-FEAT-04-07 | BR-03, BR-05, NFR-01 / TC-18 | No session, Borrower role, bad CSRF/Origin, or a request outside the Custodian's scope; any loan-status write attempt | 401 / 403 / 403 / generic 404; no mutation; no loan-status write route exists |
| AC-FEAT-04-08 | NFR-06 / TC-20 | Failure after the request update but before the loan insert | Whole transaction rolls back: request `PENDING`, no loan, asset available; a clean retry succeeds |
| AC-FEAT-04-09 | NFR-05 | Loan status is read; the `FULFILLED`→`CHECKED_OUT` migration runs on historic rows | `ACTIVE`/`RETURNED` is derived from `returnedAt`; historic IDs and references are preserved |
| AC-FEAT-04-10 | FR-10, NFR-05 / TC-10, TC-25 | Page reload, or API restart, after checkout | The same request `CHECKED_OUT`, the same loan `ACTIVE`, the asset unavailable |
| AC-FEAT-04-11 | FR-09 | Custodian UI: due-date form, duplicate clicks, 409, 403, 401, 500, failed read after success | Field feedback; one submission in flight; a 409 refreshes and disables a stale form; a 401 logs out; success then a failed read is reported as success |

## Software Test Specification (v1.0)

Level key as in FEAT-03.

| Test ID | AC | Level | Precondition / input | Action | Expected result | Automated test (file › name) |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-FEAT-04-01 | AC-FEAT-04-01 | API+DB, E2E | Two Custodians, different assignments | GET `/api/requests/pending` | Scoped list with details | `server/tests/checkout.test.ts` › "shows only scoped pending requests with borrower and equipment details"; E2E › "BR-05: the assigned custodian sees the pending requests for their assets, and they persist after reload" |
| TEST-FEAT-04-02 | AC-FEAT-04-02 | API+DB, E2E | Pending request; future due date | POST `/api/requests/:id/checkout` | 201; one ACTIVE loan; reads updated | `checkout.test.ts` › "creates exactly one ACTIVE loan, checks out the request, and immediately updates all reads"; E2E › "Custodian A checks out Borrower A's request and an ACTIVE loan appears" |
| TEST-FEAT-04-03 | AC-FEAT-04-03 | API+DB | Missing, malformed, mismatched and retired cases | POST checkout | 404 / 409; no change | `checkout.test.ts` › "rejects a missing request, malformed ID, asset mismatch, and retired equipment" |
| TEST-FEAT-04-04 | AC-FEAT-04-04 | Unit, API+DB, E2E | Invalid and boundary due dates | Validate; POST checkout | 400; request PENDING; no loan | `server/tests/checkout-unit.test.ts` (4 tests); `checkout.test.ts` › "rejects invalid due dates and supplied status/identity without partial changes", "checks due date against checkout time inside the transaction, not an earlier form timestamp"; E2E › "a past due date is rejected by the server (400) without creating a loan" |
| TEST-FEAT-04-05 | AC-FEAT-04-05 | API+DB | Already checked-out request | Repeated and concurrent POST | One 201, rest 409 | `checkout.test.ts` › "rejects repeated and concurrent checkout of the same request" |
| TEST-FEAT-04-06 | AC-FEAT-04-06 | API+DB | Two Custodians assigned to one asset; two pending requests | Concurrent checkouts | Exactly one winner | `checkout.test.ts` › "allows one winner across different pending requests and custodians for one exclusive asset" |
| TEST-FEAT-04-07 | AC-FEAT-04-07 | API+DB, E2E | No session; Borrower; bad CSRF; foreign scope | POST checkout; attempt a loan-status write | 401 / 403 / 404; no loan | `checkout.test.ts` › "rejects missing sessions, wrong role, CSRF failures and foreign-scope requests", "does not expose a loan status mutation API to borrowers"; E2E › "a borrower cannot check out a request (403)…", "BR-05: an unassigned custodian cannot read or check out the request, and no loan is created" |
| TEST-FEAT-04-08 | AC-FEAT-04-08 | API+DB | Temporary trigger fails the loan insert | POST checkout, then retry | Full rollback; clean retry succeeds | `server/tests/borrow-requests.test.ts` › "rolls back failed loan creation, preserves availability, and permits a clean retry" |
| TEST-FEAT-04-09 | AC-FEAT-04-09 | Unit, DB | Loan rows; historic `FULFILLED` rows in a temporary schema | Project status; run the migration SQL | Derived status; rows preserved | `checkout-unit.test.ts` › "derives ACTIVE/RETURNED from persisted custody facts without editable state"; `checkout.test.ts` › "preserves historic rows when the enum migration renames FULFILLED to CHECKED_OUT" |
| TEST-FEAT-04-10 | AC-FEAT-04-10 | E2E | Completed checkout | Reload as Borrower; restart the API | Same loan and request state | E2E › "Availability (Borrower A view): asset unavailable, request CHECKED_OUT, loan ACTIVE, persisted after reload" (release `49cb6e3`); E2E-PER-01 after API restart (`52b187c` only; see report L7) |
| TEST-FEAT-04-11 | AC-FEAT-04-11 | jsdom | Mocked HTTP states | Render and interact | As specified | `client/tests/checkout.test.tsx` (4 tests); `client/tests/checkout-workflow.test.tsx` (7 tests) |

Executed result on release `49cb6e3`: all of the above **PASS** (backend 55/55, frontend 22/22, E2E 23/23; re-run 2026-11-07). The exception is TEST-FEAT-04-10's API-restart variant, which was executed on `52b187c` only.

## Definition of Done (FEAT-04)

FEAT-04 inherits the Product Definition of Done in `docs/sprints/plan.md` §9.

| DoD item | Evidence | Status |
| --- | --- | --- |
| AC-FEAT-04-01…11 enforced by the API and PostgreSQL (transaction, row locks, partial unique index) | `server/src` checkout service; migrations | Done |
| Every STS test executed and passing on the release commit | `49cb6e3`: 55/55, 22/22, 23/23 | Done (restart variant: `52b187c`) |
| Live-browser borrower → custodian checkout → `CHECKED_OUT` journey | Playwright `02-request-checkout-journey.spec.ts` | Done |
| Teammate review and staging integration | PR #18 approved by `yiiipunn`; merged `52b187c` | Done |
| Due-date maximum policy (OQ-01) | Open question; no maximum invented | Open — disclosed |
| Contract written and versioned **before** implementation | Contract and code arrived together in `1346b2d` | **Not met — disclosed** (report L3) |
| Red→Green TDD evidence for the checkout rules | No failing run was recorded | **Not met — disclosed** (report F.6) |

## Version history

| Version | Date | Commit | Change | Reason |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-11-03 | `1346b2d` | Initial contract delivered together with the implementation | — |
| 1.0 | 2026-11-07 | this branch | Status updated to accepted; numbered AC, STS, DoD and this history added | Close Part E gap L3; IDs assigned retroactively; behavior unchanged |
