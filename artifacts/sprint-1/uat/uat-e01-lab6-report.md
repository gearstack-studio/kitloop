# UAT-E01 / Issue #61: Request lifecycle (Lab 6 report)

| | |
|---|---|
| Issue | [#61](https://github.com/gearstack-studio/kitloop/issues/61) UAT-E01: competing requests stay PENDING after checkout |
| Branch | `fix/61-uat-request-lifecycle` → `sprint-1-staging` |
| Baseline | `8b6e5a9` (`origin/sprint-1-staging`) |
| Evidence | [`uat-e01-baseline-red.txt`](uat-e01-baseline-red.txt), [`uat-e01-green.txt`](uat-e01-green.txt), browser screenshots `uat-e01-e2e-*.png` (§7a) |
| Test database | Local, isolated `kitloop_auth_test`. The deployed production database was not used. |

## 1. Root cause analysis

**Symptom.** Borrowers A and B both request Asset X. A custodian checks out A's request. B's request stays `PENDING` indefinitely, even though it can never be fulfilled: it remains in the custodian's queue, B's history shows it as pending, and the only option on it is a checkout that always returns 409.

**Cause.** Sprint 1 modelled a request with just two states, `PENDING → CHECKED_OUT`. There was no terminal state other than a successful checkout, so:

1. `checkoutRequest()` (`server/src/checkout.ts`) updated only the winning request. Nothing in the transaction touched other requests for the same asset.
2. `RequestStatus` had no `DECLINED`, `CANCELLED` or `EXPIRED` value, and `BorrowRequest` had no columns recording when or why a request closed.
3. Neither borrowers nor custodians had an API or UI action to close a request.
4. Two Sprint 1 tests asserted the faulty behaviour: the competing request "stays PENDING" (`checkout.test.ts`, `borrow-requests.test.ts`). They were updated to match the approved lifecycle (see §4).

**RequestStatus assumptions found during inspection.**
- The client `BorrowRequest.status` type was the literal union `'PENDING' | 'CHECKED_OUT'`.
- The custodian queue (`GET /requests/pending`) filters on `status = PENDING`. This was kept unchanged, so closed requests drop out of the queue automatically.
- The partial unique index `BorrowRequest_one_pending_per_borrower_asset` applies only to `status = 'PENDING'`. Because of that, terminal requests don't block a new request, and the index was left unchanged.
- The checkout 409 message assumed that any non-pending request was "already checked out". It now distinguishes checked-out requests from other closed ones.
- `borrowEligibility.ts` only treats `PENDING` as blocking, so no change was needed there.

## 2. Implementation summary

**Lifecycle.** `PENDING` is the only open state. `CHECKED_OUT`, `DECLINED`, `CANCELLED` and `EXPIRED` are terminal. Every transition checks `status = PENDING` in its `WHERE` clause, so a terminal request can't be closed again or checked out (409 `REQUEST_NOT_PENDING`). Clients never send a status: each endpoint maps to exactly one transition.

| Transition | Who | Endpoint | Reason stored |
|---|---|---|---|
| PENDING → CHECKED_OUT | assigned custodian | `POST /api/requests/:id/checkout` (existing) | none |
| competing PENDING → DECLINED | system, inside checkout | (same transaction) | `ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER` |
| PENDING → CANCELLED | request owner (borrower) | `POST /api/requests/:id/cancel` | `CANCELLED_BY_BORROWER` |
| PENDING → DECLINED | assigned custodian | `POST /api/requests/:id/decline` `{ "reason": … }` | `EQUIPMENT_UNAVAILABLE` \| `BORROWER_NOT_ELIGIBLE` \| `DUPLICATE_REQUEST` \| `OTHER` |
| PENDING → EXPIRED | not implemented | none | reserved until an expiry policy is approved |

**Checkout transaction** (`checkoutRequest()`). The existing steps are unchanged: Serializable isolation; authorise the request by custodian scope; lock the `Asset` row, then the `BorrowRequest` row (`FOR UPDATE`); validate asset match, pending state and borrowability; guarded update to `CHECKED_OUT`; create one `ACTIVE` loan. After that, a single `updateMany` moves every other `PENDING` request for the asset to `DECLINED`, setting `closeReason = ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER`, `closedAt` = the checkout time and `closedById` = the custodian. Any failure rolls back the checkout, the loan and the declines together. Rows are updated, never deleted, so history is kept.

**Cancel / decline** (`server/src/request-lifecycle.ts`). Both run in one Serializable transaction:
1. Resolve the request within the caller's scope: the owner for cancel, the asset's assigned custodian for decline. Out-of-scope requests return 404, the same as checkout.
2. Lock the request row.
3. Reject non-pending requests with 409.
4. Apply a guarded update.

Serialization and deadlock aborts (`40001`/`40P01`) map to 409 `REQUEST_CONFLICT`. Both routes use the existing `requireAuth`, `requireRole` and `requireCsrf` middleware and the `ApiError` envelope. Cancel rejects any body field. Decline accepts only a `reason` from the custodian allowlist; the system-only reasons are rejected.

**Expiry.** `EXPIRED` exists in the schema so that a future policy doesn't need another enum migration, but nothing sets it. No timeout was invented. A test asserts that old `PENDING` requests stay `PENDING`.

**Frontend.**
- `Requests.tsx` shows the status, plus `Closed <time>` and `Reason: <label>` for closed requests.
- `requestLifecycle.ts` holds the shared status and reason types and the human-readable labels.
- `RequestActions.tsx` adds:
  - **Cancel request** for borrowers, rendered only for `PENDING` requests.
  - **Decline** for custodians: a reason `<select>` is required before the button is enabled, and only the four custodian reasons are offered.
- Both actions use the existing `act()` helper (CSRF header, busy state, status message, refetch), so history and queue refresh after each action, and closed requests drop out of the custodian queue on refresh. The only styling added is a `.request-actions` stack in `App.css` using existing design tokens; there's no redesign.

## 3. Database migration

`server/prisma/migrations/20261121090000_request_lifecycle/migration.sql`. The migration only adds objects; it rewrites and deletes nothing.

```sql
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'DECLINED' | 'CANCELLED' | 'EXPIRED';
CREATE TYPE "RequestCloseReason" AS ENUM (6 values);
ALTER TABLE "BorrowRequest" ADD COLUMN "closedAt" TIMESTAMPTZ(6), "closeReason", "closedById" UUID;  -- all nullable
FK "closedById" → "User"("id") ON DELETE SET NULL
CHECK "BorrowRequest_closure_consistent":
  PENDING/CHECKED_OUT ⇒ all closure fields NULL
  other statuses     ⇒ closedAt AND closeReason NOT NULL (closedById may be NULL: system expiry / deleted actor)
```

- **Existing data.** `PENDING` and `CHECKED_OUT` rows keep their status and get `NULL` closure fields, which satisfies the CHECK constraint without a backfill. The test *"migrates existing PENDING and CHECKED_OUT rows without rewriting them"* verifies this.
- **Partial unique index.** `BorrowRequest_one_pending_per_borrower_asset` is untouched. The test *"rejects inconsistent closure data and keeps one PENDING request per borrower and asset"* verifies the index and the CHECK constraint.
- **Transaction safety.** `ALTER TYPE … ADD VALUE` is allowed inside a transaction on PostgreSQL 12+ as long as the new labels aren't used in the same transaction, and the migration never references them.
- **Applied with** `prisma migrate deploy` against `kitloop_auth_test` (no `migrate reset`, no `db push --force-reset`). `prisma migrate status` then reports 4 migrations, schema up to date.

## 4. Changed files

| File | Change |
|---|---|
| `server/prisma/schema.prisma` | New enum values, `RequestCloseReason`, closure fields and relation |
| `server/prisma/migrations/20261121090000_request_lifecycle/migration.sql` | **new**: additive migration (above) |
| `server/src/checkout.ts` | Decline competing requests inside the checkout transaction; clearer 409 message |
| `server/src/request-lifecycle.ts` | **new**: cancel/decline input validation and guarded transitions |
| `server/src/domain.ts` | `POST /requests/:id/cancel` and `/decline` routes |
| `server/tests/request-lifecycle.test.ts` | **new**: 13 PostgreSQL integration tests |
| `server/tests/checkout.test.ts` | One assertion changed: the losing request is now `DECLINED` with a reason (was `PENDING`) |
| `server/tests/borrow-requests.test.ts` | One assertion changed: the same change for the competing request |
| `client/src/requestLifecycle.ts` | **new**: status/reason types, labels, decline allowlist |
| `client/src/components/RequestActions.tsx` | **new**: `CancelRequest`, `DeclineRequest` |
| `client/src/components/Requests.tsx` | Lifecycle status type; closed time and reason display |
| `client/src/App.tsx` | Wires cancel/decline into the existing `act()` flow |
| `client/src/App.css` | `.request-actions` layout for checkout and decline |
| `client/tests/request-lifecycle.test.tsx` | **new**: 5 component/integration tests (mocked HTTP) |
| `e2e/tests/04-request-lifecycle.spec.ts` | **new**: 8 Playwright browser tests against the real client, API and an isolated database (§7a) |
| `e2e/tests/02-request-checkout-journey.spec.ts` | Three assertions that encoded the #61 bug now expect DECLINED + reason; one stale UAT-F03 (#57) assertion corrected (§7a) |
| `artifacts/sprint-1/uat/uat-e01-*` | **new**: this report, RED/GREEN evidence, 11 E2E screenshots |

## 5. RED results (baseline `8b6e5a9` + new tests only)

Run in a detached worktree at the baseline with only the test files copied in. Full output: [`uat-e01-baseline-red.txt`](uat-e01-baseline-red.txt).

| Suite | Result |
|---|---|
| Server: `request-lifecycle`, `checkout`, `borrow-requests` | **14 failed** / 20 passed (34), exit 1 |
| Client: `request-lifecycle.test.tsx` | **4 failed** / 1 passed (5), exit 1 |

The failures match the defect:
- Competing request still `PENDING` after checkout: `expected {…} to match object { status: 'DECLINED' … }`
- Cancel and decline endpoints missing: `expected 404 to be 200`
- No reason shown and no Cancel/Decline controls: `Unable to find … /Reason: Equipment was checked out to another/`, `… button "Cancel request"`
- Migration file absent: `ENOENT`

Expected baseline passes:
- the no-auto-expiry guard
- the client check that a terminal request doesn't block a new one
- the unchanged Sprint 1 tests

## 6. GREEN results (after the fix)

Full output: [`uat-e01-green.txt`](uat-e01-green.txt).

| Suite | Result |
|---|---|
| Server targeted (3 files) | **34 / 34 passed** |
| Client targeted (1 file) | **5 / 5 passed** |

### Required test cases → tests

All tests are in `server/tests/request-lifecycle.test.ts` (S) or `client/tests/request-lifecycle.test.tsx` (C).

| Required case | Covered by | Result |
|---|---|---|
| Two borrowers request the same asset → both PENDING | S: *declines every competing PENDING request…* | ✅ |
| Custodian checks out A → A CHECKED_OUT | S: same test | ✅ |
| Competing request B → DECLINED with reason | S: same test, plus updated `checkout` and `borrow-requests` assertions | ✅ |
| B's history shows terminal status and reason | S: same test (`GET /requests/mine`); C: *shows terminal statuses with their closure reason and time* | ✅ |
| Custodian refreshes queue → B absent | S: same test (`GET /requests/pending`); C: *…removes the request from the refreshed queue* | ✅ |
| Checkout transaction fails → no partial changes | S: *rolls back the checkout, the loan and every decline…* (DB trigger forces the decline to fail) | ✅ |
| Borrower cancels own PENDING → CANCELLED | S: *lets a borrower cancel their own PENDING request once…*; C: *offers Cancel only for PENDING…* | ✅ |
| Borrower cancels another's request → rejected | S: *rejects cancelling another borrower's request…* (404) | ✅ |
| Custodian declines assigned request → DECLINED | S: *lets an assigned custodian decline…*; C: *requires a reason, posts it with CSRF…* | ✅ |
| Unauthorized custodian declines → rejected | S: *requires a custodian-selectable reason and rejects unassigned custodians…* (404) | ✅ |
| Terminal request checked out → 409 | S: first test, plus cancel test (`REQUEST_NOT_PENDING`) | ✅ |
| Concurrent checkouts → one winner, one loan | S: *gives concurrent checkouts … exactly one winner, one loan, and a declined loser*; `checkout.test.ts` cross-custodian race | ✅ |
| New request after terminal request → allowed if available | S: *allows a new request after a cancelled or declined one while the asset is available, and not while on loan* | ✅ |
| Migration integrity | S: *migrates existing PENDING and CHECKED_OUT rows…*, *rejects inconsistent closure data…* | ✅ |
| Role permissions and CSRF | S: cancel and decline rejection tests (wrong role 403, missing session 401, bad CSRF 403, status payload 400) | ✅ |
| Concurrent mutations | S: *exactly one of a concurrent cancel and decline*, *never leaves a loan for a request cancelled concurrently with its checkout* | ✅ |
| No invented expiry | S: *does not expire old PENDING requests without an explicit expiry policy* | ✅ |

## 7. Full regression

| Check | Command | Result |
|---|---|---|
| Server tests | `npm test` (server) | **12 files, 91 / 91 passed** |
| Client tests | `npm test` (client) | **7 files, 40 / 40 passed** |
| Server typecheck | `npm run typecheck` | exit 0 |
| Server build | `npm run build` | exit 0 |
| Client lint | `npm run lint` | exit 0, no warnings |
| Client build | `npm run build` | exit 0 |
| Migration status (test DB) | `prisma migrate status` | 4 migrations, up to date |
| Browser E2E (Playwright) | `npm run test:e2e` (e2e) | **31 / 31 passed** (§7a) |

### 7a. Browser end-to-end verification

**Setup.** The repository's Playwright suite (`e2e/`) was used unchanged:
- Global setup drops and recreates a dedicated database, `kitloop_e2e_pw`, and applies all committed migrations with `prisma migrate deploy`, including `20261121090000_request_lifecycle`.
- It seeds synthetic users with random per-run passwords.
- It starts its own API (`:3100`) and Vite client (`:5174`) with `reuseExistingServer: false`, and proves isolation by logging in as a user that exists only in that database.
- The database is dropped after the run.

No development, test or production data was used. Spec `04-request-lifecycle.spec.ts` adds four dedicated assets (`KL-E01-*`) to that database. All actions go through the real browser UI. Plain API calls with the signed-in browser sessions (cookie, Origin, CSRF) are used only for the authorization checks the UI offers no path to, and to read back stored state.

**Result:** 31 / 31 passed (Chromium, 57 s): spec 01 auth/catalog 3, spec 02 checkout journey 8, spec 03 access control 12, **spec 04 lifecycle 8**.

| # | Scenario | Verified in the browser | Screenshot |
|---|---|---|---|
| 1 | Borrower A and B request the same available asset | Both submitted from the catalog; both `PENDING` in My Requests; both in the custodian queue | `uat-e01-e2e-01-borrower-b-competing-request-pending.png`, `…-02-custodian-queue-two-competing-requests.png` |
| 2 | Custodian checks out to Borrower A | Due date entered, Check out clicked; notice *"Checkout recorded. Request CHECKED_OUT and active loan created. Any other pending requests for this equipment were declined."* | `…-03-custodian-queue-after-checkout-competitor-removed.png` |
| 3 | A's request becomes `CHECKED_OUT` | Shown in A's My Requests with no closure reason; API: `closeReason`/`closedAt` null | `…-04-borrower-a-request-checked-out.png` |
| 4 | B's request auto-`DECLINED` with the correct reason | API: `status DECLINED`, `closeReason ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER` | `…-05-borrower-b-my-requests-declined-with-reason.png` |
| 5 | Declined request leaves the actionable queue | Both requests absent from the queue immediately and after a reload; `GET /requests/pending` contains neither | `…-03-…` |
| 6 | B sees the reason in My Requests | *"KL-E01-CAM · DECLINED"*, *"Closed …"*, *"Reason: Equipment was checked out to another borrower"*; no Cancel button; asset no longer offered | `…-05-…` |
| 7 | Borrower cancellation | Cancel shown only for `PENDING`; after clicking: notice *"Request cancelled."*, `CANCELLED`, *"Reason: Cancelled by the borrower"*, Cancel removed; persists after reload; gone from the custodian queue; a new request for the same available asset is then allowed | `…-06-borrower-b-pending-request-with-cancel.png`, `…-07-borrower-b-request-cancelled.png` |
| 8 | Custodian decline | Decline disabled until a reason is chosen; only the 4 custodian reasons offered; after declining: notice *"Request declined."*, request gone from the queue; borrower sees `DECLINED` / *"Reason: Equipment unavailable"* | `…-08-custodian-decline-reason-selected.png`, `…-09-custodian-queue-after-decline.png`, `…-10-borrower-a-request-declined-by-custodian.png` |
| 9 | Unauthorized users rejected | Other borrower cancel → **404**; borrower decline → **403**; custodian cancel → **403**; unassigned custodian decline → **404**; owner without CSRF → **403**; client-supplied `status` → **400**; system-only reason → **400**; re-cancel / re-decline / checkout of a terminal request → **409** `REQUEST_NOT_PENDING`; target request unchanged afterwards | (API with real sessions) |
| 10 | UI errors and refresh | A custodian's queue goes stale after the borrower cancels in another browser. Declining shows the alert *"This request is no longer pending. Refresh to see its status."*, and the queue refreshes itself, removing the request. History and queue refresh after every successful action. | `…-11-custodian-stale-decline-conflict-message.png` |

**E2E maintenance done during this check.**
- **#61 assertions in spec 02.** `02-request-checkout-journey.spec.ts` asserted the old #61 behaviour: the competing request stays in the queue and is `PENDING` for Borrower B. Those three assertions now expect `DECLINED` with the reason, matching the server-test updates in §4.
- **Stale #57 assertion.** The same spec had been failing on `sprint-1-staging` since UAT-F03 (#57, `bb43c13`). It expected the catalog button to stay enabled after the borrower's own pending request, but #57 deliberately disables it ("Request pending"). Because the journey runs serially, that one failure stopped the 7 checkout tests after it from running. The assertion now checks the #57 behaviour. This was a pre-existing problem in the test, not a #61 regression.

### 7b. PostgreSQL compatibility

| Statement | Minimum PostgreSQL |
|---|---|
| `ALTER TYPE … ADD VALUE IF NOT EXISTS` | 9.3 (`IF NOT EXISTS`) |
| `ADD VALUE` inside a transaction block | **12** (new labels must not be used in the same transaction; this migration never uses them) |
| `CREATE TYPE … AS ENUM`, `ADD COLUMN` (nullable, no default), `ADD CONSTRAINT … FOREIGN KEY … ON DELETE SET NULL`, `CHECK` | all versions in support |

- **Compatible with PostgreSQL 12 and later**, based on the statement analysis above.
- **CHECK constraint.** It compares the enum column only with the pre-existing labels `PENDING` and `CHECKED_OUT`, so it doesn't depend on the newly added labels.
- **Nullable columns** with no default are a metadata-only change; no table rewrite.
- **Executed on:**
  - local PostgreSQL 18.4, as an upgrade of the existing test database with Sprint 1 data and as a fresh database in each E2E run
  - Deployment target: Cloud SQL PostgreSQL 17 (`infra/gcp`); docker-compose uses `postgres:17-bookworm`.
- **Not executed on PostgreSQL 12–17.** Docker's engine wasn't running, so the 12+ claim rests on the analysis above, and the deployed version (17) is inside the supported range.

### 7c. Branch reconciliation

`git fetch origin`, then compare with `origin/sprint-1-staging`: the feature branch is **0 behind and 0 ahead** (both at `8b6e5a9`), and all work is uncommitted on top of it. Nothing needed merging or rebasing, and nothing was overwritten. Because the base didn't change and no application code changed after §6, the regression in §7 is still current. Only E2E test files were added or edited, and the full E2E suite was run against them. The *local* `sprint-1-staging` ref is stale (`05b0582`), which doesn't matter as long as the PR targets the remote branch.

## 8. Remaining limitations

- **Expiry isn't implemented.** `EXPIRED` is reserved. Using it needs an approved, documented policy (duration, configuration key, scheduler or lazy evaluation). That should be a separate issue.
- **Decline reason `OTHER` has no free-text note.** A note field would need its own length/content validation and display rules.
- **No notifications.** Borrowers see the decline or cancellation only when they reload their history.
- **No custodian history view.** The custodian sees only the actionable pending queue; closed requests remain in the database and in the borrower's history.
- **Conflicts aren't retried automatically.** A serialization conflict returns 409 `REQUEST_CONFLICT` and the user refreshes. Nothing is half-applied.
- **The enum change is one-way.** PostgreSQL can't drop enum values. A rollback would mean a new forward migration that recreates the type; the change itself is safe to deploy forward.
- **Requires PostgreSQL 12 or later.** The migration was executed on PostgreSQL 18.4 only. The deployed Cloud SQL instance is PostgreSQL 17, inside the supported range by analysis (§7b), but the migration hasn't been run on a 12–17 server.
- **Browser E2E ran in Chromium at desktop width only.** Mobile width and other browsers weren't re-checked for the new Cancel/Decline controls.
- **RED setup.** The RED run used the shared test database and Prisma client, which already had the additive schema applied. The baseline code uses only a subset of that schema, so the failures reflect missing behaviour, not schema errors.
- **Windows test tip.** Run server tests from a `D:\` (upper-case drive letter) working directory. From `d:\…`, Vitest loads its runner twice and every file fails with *"Vitest failed to find the runner"*. This is environmental; there's no code defect.

## 9. Suggested PR

**Title:** `fix(requests): resolve competing pending requests and add lifecycle actions (#61)`

**Description:**

```markdown
Fixes #61 (UAT-E01): competing borrow requests stayed PENDING forever after the asset was checked out to another borrower.

## What changed
- **Lifecycle:** `RequestStatus` gains DECLINED, CANCELLED, EXPIRED (reserved). Only PENDING requests can transition; terminal requests return 409 `REQUEST_NOT_PENDING`.
- **Checkout:** inside the existing Serializable transaction, after the request becomes CHECKED_OUT and the ACTIVE loan is created, every other PENDING request for the asset becomes DECLINED with `closeReason = ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER`, `closedAt`, `closedById`. All-or-nothing.
- **New endpoints** (auth + role + CSRF, existing ApiError conventions):
  - `POST /api/requests/:id/cancel`: owner only → CANCELLED
  - `POST /api/requests/:id/decline` `{ reason }`: assigned custodian only, reason from an allowlist → DECLINED
- **UI:** borrower history shows status, closed time and reason, plus a Cancel button for PENDING requests. The custodian queue has a Decline form that requires a reason. Both refresh after the action.
- **Expiry:** intentionally not implemented (no approved policy).

## Migration
`20261121090000_request_lifecycle` only adds objects: enum values, the `RequestCloseReason` enum, nullable `closedAt/closeReason/closedById`, FK (SET NULL), and a closure-consistency CHECK constraint. Existing rows are unchanged; the pending-request partial unique index is unchanged. Requires PostgreSQL ≥ 12 (deployed: Cloud SQL 17; executed locally on 18.4).

## Tests
- RED on baseline 8b6e5a9: server 14 failed / 34, client 4 failed / 5
- GREEN: server 91/91, client 40/40; typecheck, lint and both builds pass
- Browser E2E (Playwright, real client + API + isolated DB): 31/31, including a new 8-test lifecycle spec
- Sprint 1 assertions that encoded the bug ("competing request stays PENDING") now expect DECLINED + reason: 2 server tests, 3 E2E assertions.
- Also fixes a stale E2E assertion from UAT-F03 (#57) that had kept the checkout journey red on `sprint-1-staging`.
- Evidence: `artifacts/sprint-1/uat/uat-e01-baseline-red.txt`, `uat-e01-green.txt`, `uat-e01-e2e-*.png`, `uat-e01-lab6-report.md`

## Not in scope
Request expiry policy, free-text decline notes, borrower notifications.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 10. Lab 6 evidence checklist

- [x] Issue #61 analysed; RequestStatus assumptions listed (§1)
- [x] Lifecycle defined; only PENDING can transition (§2)
- [x] Prisma schema updated, plus a new additive migration (§3)
- [x] Migration applied to an isolated test database; production database not used (§3, `uat-e01-green.txt`)
- [x] Checkout auto-declines competing requests atomically with a machine-readable reason (§2)
- [x] Borrower cancel endpoint (auth + CSRF + ownership) (§2)
- [x] Custodian decline endpoint (auth + CSRF + assignment + valid reason) (§2)
- [x] 403/404/409 consistent with existing conventions; clients can't set a status (§2, §6)
- [x] Borrower and custodian UI updated within the existing design system (§2)
- [x] Baseline commit recorded: `8b6e5a9` (§5)
- [x] RED output captured: `uat-e01-baseline-red.txt` (§5)
- [x] GREEN output captured: `uat-e01-green.txt` (§6)
- [x] All required test cases covered (§6 table)
- [x] Full regression: tests, typecheck, lint, builds, migration status (§7)
- [x] Browser E2E against the real client, API and an isolated database: 31/31; 11 screenshots (§7a)
- [x] PostgreSQL 12+ compatibility reviewed; deployed version 17 confirmed (§7b)
- [x] Branch reconciled with `origin/sprint-1-staging`: up to date, nothing overwritten (§7c)
- [x] Working tree contains only intended changes (§4)
- [x] Limitations documented (§8)
- [x] PR title and description drafted (§9)
- [ ] Commit and push (waiting for authorisation)
- [ ] Open PR to `sprint-1-staging` (waiting for authorisation)
- [ ] Reviewer approval and merge
