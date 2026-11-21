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
- **The enum change is one-way, and pre-lifecycle revisions can't read the new values.** PostgreSQL can't drop enum values, and the Prisma client of `8b6e5a9` and earlier fails on `DECLINED`/`CANCELLED`/`EXPIRED` (PR #72 review P1). This is handled by the two-phase rollout and the rollback guards in §11.1; the enum is never dropped and statuses are never rewritten.
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
- [x] Committed and pushed as `5738ee1`; PR #72 opened to `sprint-1-staging`
- [x] Review findings P1 (rollback) and P2 (existing competing requests) reproduced, fixed and verified (§11)
- [x] Expiry deferral documented for Team 7 and #61 (§11.4, `uat-e01-team7-retest.md`)
- [x] Review RED/GREEN, rollback compatibility, reconciliation and full regression evidence captured (§11.5)
- [ ] Commit and push of the review fixes (waiting for authorisation)
- [x] Review fixes committed as `bbf8a36`; response posted; #61 records the expiry deferral
- [x] Re-review P1 (unsafe second rollback) reproduced, fixed and verified (§12)
- [ ] Commit and push of the re-review fix (waiting for authorisation)
- [ ] Post the re-review response on PR #72 (waiting for authorisation)
- [ ] Reviewer approval and merge
- [ ] After merge: phase 1 deploy, phase 2 enable, reconciliation dry run and apply, then Team 7 retest (§11.3)

## 11. PR #72 review response (P1, P2, expiry)

The reviewer's comment on `5738ee1` raised two findings and an expiry note. All work below is local and uncommitted on `fix/61-uat-request-lifecycle`. Only isolated local databases were used, and nothing was deployed. Paste-ready reply: [`uat-e01-pr72-review-response.md`](uat-e01-pr72-review-response.md).

### 11.1 P1: rollback to the previous revision returns 500

**Root cause.** The lifecycle migration adds `DECLINED`/`CANCELLED`/`EXPIRED` to `RequestStatus`. The previous revision's generated Prisma client (`8b6e5a9`) only knows `PENDING` and `CHECKED_OUT`, so any query that returns a lifecycle row throws `Value 'DECLINED' not found in enum 'RequestStatus'`. `release.sh rollback` only moves traffic. After PR #72 had closed any request, a rollback therefore made `GET /api/requests/mine` and `GET /api/requests/:id` return 500 for the affected borrowers.

**Reproduction with the real previous revision.** I used an `8b6e5a9` worktree with its own `npm ci` and generated client. `5738ee1` wrote `DECLINED` and `CANCELLED` to an isolated database, then the old server served the same database: Borrower B `/requests/mine` → **500**, `/requests/:id` → **500**. Borrower A, the custodian queue and request creation stayed 200/201.

**Resolution: two-phase compatibility rollout.** An already-deployed client can't be made to read new enum values. Instead, a lifecycle-aware revision is guaranteed to exist before any lifecycle value is written.

| | Phase 1 (`REQUEST_LIFECYCLE_WRITES` unset/`disabled`, the default) | Phase 2 (`enabled`) |
|---|---|---|
| Reads all statuses | yes | yes |
| Checkout | Sprint 1 behaviour: competing requests stay `PENDING` | declines competing requests (as reviewed) |
| Cancel / decline | `404 LIFECYCLE_ACTIONS_DISABLED`; hidden in the UI | enabled |
| `/auth/me` and login `features.requestLifecycleActions` | `false` | `true` |

- An invalid flag value fails at startup (`ConfigurationError`).
- **`release.sh deploy`** always sets the flag from `KITLOOP_REQUEST_LIFECYCLE_WRITES`; `deploy.yml` passes the GitHub environment variable, defaulting to `disabled`. It **refuses `enabled` while a pre-lifecycle revision is serving**, so automatic and manual rollback targets can always read lifecycle rows.
- ~~**`release.sh rollback`** refuses a pre-lifecycle target while phase 2 is serving unless the operator sets `KITLOOP_CONFIRM_PRE_LIFECYCLE_ROLLBACK=no-lifecycle-rows`.~~ **Superseded in §12.** The re-review showed this guard allowed phase 2 → phase 1 → pre-lifecycle. Every pre-lifecycle rollback now requires a fresh, verified zero-row database check, and the confirmation bypass is removed.
- No status is rewritten, no enum value is dropped, and no closure data is removed.

**Safe rollback targets.**

| Serving | Lifecycle rows exist? | Safe targets | Unsafe |
|---|---|---|---|
| Phase 1 | no | any earlier ready revision, including `8b6e5a9` | n/a |
| Phase 1 or phase 2 | yes | phase 1 (recommended) or phase 2 revisions of this release or later | `8b6e5a9` and earlier |

The full runbook is [`infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md`](../../../infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md), linked from `infra/gcp/README.md`.

**Verified with real servers on an isolated database:** phase 1 → `8b6e5a9`: no 5xx. Phase 2 → `8b6e5a9`: 500 (expected, now refused). Phase 2 → phase 1 revision: no 5xx.

### 11.2 P2: pre-existing competing requests stay PENDING

**Root cause.** Auto-decline runs inside new checkouts only. Requests that competed with a checkout made under Sprint 1 code, or in phase 1, are never revisited, and the migration deliberately doesn't rewrite rows. Team 7's original example therefore stays `PENDING` after deployment.

**Resolution: an explicitly executed, reviewed reconciliation** (`server/src/reconcile-competing-requests.ts`, CLI `server/src/lifecycle-cli.ts`, npm scripts `lifecycle` and `lifecycle:dev`).

- **Rule:** a `PENDING` request is stale when its asset has an **active** loan (`returnedAt IS NULL`). Such a request can't be checked out while the loan is active, which is exactly the state the new checkout would have closed.
  - **Stale requests** become `DECLINED`, with `closeReason = ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER`, `closedAt` = the reconciliation transaction time, and `closedById = NULL`. The null actor marks a system closure, unlike checkout-time declines, which record the custodian.
  - **Returned competing loan:** the request stays `PENDING` and is reported as `COMPETING_LOAN_RETURNED`.
  - **Terminal rows** are never touched.
- **Dry run by default**, in a `READ ONLY` transaction, reporting Before counts and the stale and kept requests.
- **Apply needs all of the following:**
  - `--apply`
  - `--confirm-database=<current_database()>`
  - `REQUEST_LIFECYCLE_WRITES=enabled`, so it can't write values a pre-lifecycle revision can't read during phase 1
- **Concurrency:** each asset is processed in a Serializable transaction that locks the `Asset` row first (the same order as checkout) and re-checks the rule under the lock. Serialization or deadlock aborts retry up to 5 times; leftovers are reported with exit code 3 for a rerun.
- **Idempotent:** a rerun changes nothing.
- **Scope:** `--asset=ID` (repeatable) restricts it to specific assets, for example a single UAT example.

**Verified on data created by the real `8b6e5a9` API** (reproduced in `uat-e01-review-green.txt`):

| Step | Result |
|---|---|
| Lifecycle migration over 6 existing rows | all kept their status; closure fields NULL |
| `rollback-check` (phase 1) | `lifecycleOnlyRows: 0`, pre-lifecycle safe |
| Dry run | Before: pending 4, stale 2 (Team 7-style B and C), kept 1 (loan returned); row snapshot unchanged |
| Apply without confirmation, with the wrong database, and in phase 1 | all refused (exit 2); nothing changed |
| Apply (phase 2) | closed 2; After: pending 2, stale 0, kept 1 |
| Rerun | closed 0; snapshot unchanged (closure timestamps preserved) |
| Retest through the API | B sees `DECLINED` + reason; custodian queue lists only fulfillable requests; checkout of B's request → 409 |

### 11.3 Deployment order and Team 7 retest

1. Merge, then `release.sh migrate`, then `release.sh deploy` with the flag unset (**phase 1**). Verify, run `rollback-check` (expect 0), and record the phase 1 revision.
2. `KITLOOP_REQUEST_LIFECYCLE_WRITES=enabled release.sh deploy` with the same SHA (**phase 2**). Also set the GitHub environment variable so automated deploys keep phase 2.
3. Run the reconciliation **dry run**, review it, then **apply**, then rerun the dry run (expect `staleOnActiveLoan: 0`). Keep the JSON as evidence.
4. Team 7 retests using [`uat-e01-team7-retest.md`](uat-e01-team7-retest.md): their original example, a fresh competing-request run, and cancel/decline.

### 11.4 Expiry policy (deferred)

`EXPIRED` is reserved. No code sets it, and no timeout was invented. Supported closures now:
- checkout (`CHECKED_OUT`)
- checkout auto-decline of competitors
- borrower cancel
- custodian decline with a reason
- the reconciliation in §11.2

Unattended requests stay `PENDING`. Automatic expiry needs an approved, documented, configurable policy, delivered as a separate change. The deferral is stated in the runbook and in the Team 7 retest note, ready to post on #61.

### 11.5 Tests and results

**New and changed tests**

| Test | Covers | RED (`5738ee1` code) | GREEN |
|---|---|---|---|
| `server/tests/lifecycle-rollout.test.ts` (9) | flag parsing; phase 1 checkout, 404 actions and features; **`8b6e5a9` client** reads phase 1 data and fails on `DECLINED`; phase 1 reads phase 2 data; `rollback-check` | 7 failed / 2 passed* | 9/9 |
| `server/tests/reconcile-competing-requests.test.ts` (6) | dry run (no changes), refusals, apply (only stale rows, reason, time, history kept), idempotency, race with borrower cancel, race with concurrent checkout | module missing (not run) | 6/6 |
| `client/tests/request-lifecycle.test.tsx` (+2) | no Cancel or Decline when lifecycle actions are off; statuses still shown | 2 failed | 7/7 |
| `infra/gcp/guards.test.sh` (+7) | flag declared by default, invalid value refused, phase 2 blocked over a pre-lifecycle revision, phase 2 → phase 1 rollback allowed, phase 2 → pre-lifecycle refused unless confirmed | first new case failed | all pass |
| `server/tests/auth.test.ts` (1 assertion) | `/auth/me` now includes `features` (intentional contract addition) | n/a | pass |

\* Expected to pass at RED: the hazard characterisation, which also proves the legacy client is real, and "phase 1 reads lifecycle rows", which `5738ee1` already did and the fix must keep.

The `8b6e5a9` client is generated at test time from [`server/tests/fixtures/schema-8b6e5a9.prisma`](../../../server/tests/fixtures/schema-8b6e5a9.prisma), a verbatim copy, into `server/node_modules/.cache`.

**Full regression** (final code, isolated databases)

| Check | Result |
|---|---|
| Server tests | **14 files, 106/106** |
| Client tests | **7 files, 42/42** |
| Browser E2E (Playwright, phase 2) | **31/31** (first attempt aborted at web-server startup with `ECONNRESET` before any test; clean rerun passed) |
| Server typecheck + build (emits `dist/lifecycle-cli.js`) | exit 0 |
| Client lint, client build, E2E typecheck | exit 0 |
| Infra guard suites (WSL Ubuntu, LF clone) | all pass, plus 16 deployment guard cases |
| Compiled CLI smoke test | bad args → exit 2; `rollback-check --apply` refused; dry run read-only |
| Migration | integrity tests in the server suite; real upgrade from `8b6e5a9` data (§11.2) |
| Rollback compatibility | real-server matrix (§11.1) and legacy-client tests |

Evidence: [`uat-e01-review-red.txt`](uat-e01-review-red.txt), [`uat-e01-review-green.txt`](uat-e01-review-green.txt). The E2E screenshots `uat-e01-e2e-*.png` were regenerated by this run, with the same scenarios.

### 11.6 Remaining risks

- ~~**Phase discipline is partly procedural.** `release.sh` can't see the database, so phase 2 → phase 1 → pre-lifecycle isn't blocked.~~ **Resolved in §12:** `release.sh` now runs a read-only database check before every pre-lifecycle rollback.
- **GitHub environment variable.** If `KITLOOP_REQUEST_LIFECYCLE_WRITES` isn't set to `enabled` in `lab5-production`, the next automated `main` deploy returns the service to phase 1. That's safe, but cancel and decline disappear.
- **Phase 1 still has the UAT-E01 behaviour.** Competing requests stay `PENDING` until phase 2 and the reconciliation run. Team 7 must retest only after step 3 of §11.3.
- **The reconciliation Cloud Run job is a template that hasn't been executed in GCP.** Review its IAM (runtime service account, database secret) before first use.
- **PostgreSQL versions.** The migration and reconciliation SQL were executed only on PostgreSQL 18.4 (Cloud SQL runs 17). Docker wasn't running, so 12–17 weren't tested.
- **Phase 1 in the browser.** The browser E2E covers phase 2 only. Phase 1 behaviour is covered by server tests, client tests and the real-server harness.
- **Reconciliation closure time.** Reconciled declines use the reconciliation time as `closedAt`, not the original checkout time. That's truthful about when the closure happened, but it's later than a borrower might expect.

## 12. PR #72 re-review: unsafe second rollback (P1)

The reviewer re-reviewed `bbf8a36` and held approval on one P1. All work below is local and uncommitted. Only isolated local databases and offline fake-gcloud infrastructure were used.

### 12.1 Root cause

The `bbf8a36` rollback guard asked the wrong question: *is the **serving revision** writing lifecycle rows?* The question that matters is *does the **database** contain lifecycle rows?* After phase 2 writes `DECLINED`/`CANCELLED` and the service rolls back to phase 1 (`REQUEST_LIFECYCLE_WRITES=disabled`), those rows remain. A further rollback to `8b6e5a9` then passed the guard without any check, and the old Prisma client returns 500 on borrower history.

`KITLOOP_CONFIRM_PRE_LIFECYCLE_ROLLBACK=no-lifecycle-rows` made it worse: it was an operator assertion, not a verified result. RED proves both: with the new tests, the `bbf8a36` scripts let *phase 2 → phase 1 → pre-lifecycle with lifecycle rows* move traffic.

### 12.2 Corrected safety invariant

> Pre-lifecycle code (`8b6e5a9` and earlier) may receive traffic only after a fresh, read-only check of the production database, run by `release.sh` in the same invocation and verified from its Cloud Run execution, reports **zero** lifecycle-only request rows. Nothing that can write such rows may be running: no serving revision with `REQUEST_LIFECYCLE_WRITES=enabled`, and no `kitloop-reconcile` job. If any part can't be established, the rollback is refused and traffic isn't changed.

### 12.3 Implementation

**Database check** (`server/src/lifecycle-rollout.ts`, `server/src/lifecycle-cli.ts`). `rollback-check --require-zero --expect-database=NAME`:
- runs in a `READ ONLY` transaction
- refuses (exit 2) unless `current_database()` is `NAME`
- exits **0 only for zero lifecycle-only rows**, 4 when rows exist, 1 when the database is unreachable or another error occurs
- prints JSON counts and a `SAFE`/`UNSAFE` line, never the connection string

**Rollback gate** (`infra/gcp/release.sh`, `infra/gcp/common.sh`). For every rollback whose target lacks `REQUEST_LIFECYCLE_WRITES`, regardless of the serving phase, the gate runs these steps:
1. Refuse if a serving revision has writes enabled, if the job list can't be read, or if `kitloop-reconcile` exists.
2. Select the check image from a serving lifecycle-aware revision. `KITLOOP_ROLLBACK_CHECK_REVISION` can name one, but only to select the image.
3. Typed confirmation.
4. Deploy and execute `kitloop-rollback-check`: app image, runtime service account, the service's `kitloop-database-url:1` secret and Cloud SQL connection, `--max-retries=0`, 120 s task timeout, 900 s client timeout.
5. Accept only a **new** execution that succeeded with exactly that image, command and arguments.
6. Re-read the serving set and repeat step 1.
7. `update-traffic`.

A rollback to the revision already serving 100% changes nothing and skips the check.

**Other changes**
- **Bypass removed:** `KITLOOP_CONFIRM_PRE_LIFECYCLE_ROLLBACK` is gone.
- **Deploy hole closed:** `release.sh deploy` refuses commits known to lack the lifecycle migration. Otherwise an old SHA could be redeployed without the check, and would also be mislabelled `REQUEST_LIFECYCLE_WRITES=disabled`.

**Race handling.**
- The service can't add lifecycle rows during the check, because phase 2 must not be serving.
- Reconciliation is the only other writer, and its job must not exist.
- The serving set and writer checks are repeated after the check and immediately before `update-traffic`.
- The remaining window between that re-check and `update-traffic` is closed only procedurally (§12.6).

### 12.4 Rollback sequences (offline fake-gcloud suite, `infra/gcp/guards.test.sh`)

| Scenario | Result | Traffic |
|---|---|---|
| Phase 2 → phase 1 → pre-lifecycle with lifecycle rows (**reviewer's sequence**) | **BLOCKED** (check fails) | unchanged |
| Phase 2 → pre-lifecycle with lifecycle rows | **BLOCKED** (writes enabled; no check run) | unchanged |
| Phase 2 → pre-lifecycle with zero rows | **BLOCKED** (rows could be written after the check) | unchanged |
| Phase 1 → pre-lifecycle with lifecycle rows | **BLOCKED** (check fails) | unchanged |
| Phase 1 → pre-lifecycle with verified zero rows | **ALLOWED**; check executed before `update-traffic`, with the runtime identity and service secret | moved |
| Check unavailable (database unreachable) | **BLOCKED** | unchanged |
| Check execution malformed | **BLOCKED** | unchanged |
| Check reports positive rows | **BLOCKED** | unchanged |
| Operator confirmation (`no-lifecycle-rows`, `yes`) with rows, or with the check unavailable | **BLOCKED** | unchanged |
| Reconciliation job exists, or jobs can't be listed | **BLOCKED** (no check run) | unchanged |
| Pre-lifecycle → pre-lifecycle with no lifecycle-aware image | **BLOCKED**; ALLOWED with `KITLOOP_ROLLBACK_CHECK_REVISION` after a passing check | unchanged / moved |
| Phase 2 → phase 1 | **ALLOWED**, no check needed | moved |
| Rollback to the revision already serving 100% | **ALLOWED**, no change | unchanged |
| `deploy` of pre-lifecycle commit `8b6e5a9` | **BLOCKED** | unchanged |
| Enable phase 2 while a pre-lifecycle revision serves | **BLOCKED** | unchanged |

Every blocked case asserts that `update-traffic` wasn't called, the serving revision didn't change, and the output says *"Traffic was not changed."*

### 12.5 RED / GREEN

| Test | RED (`bbf8a36` code + new tests) | GREEN |
|---|---|---|
| `infra/gcp/guards.test.sh`, normal run (stops at first failure) | **FAIL: phase 2 → phase 1 → pre-lifecycle with lifecycle rows (unexpected success)** | all pass, plus 16 deployment guard cases |
| Same suite, evidence-only run that continues after failures | every new BLOCKED case moved traffic; the check job never ran | n/a |
| `server/tests/lifecycle-rollout.test.ts`, 4 new gate tests (real CLI process, isolated test database) | 4 failed (`--require-zero` unknown) / 9 passed | 13/13 |

Full regression on the final code:

| Check | Result |
|---|---|
| Server tests | **14 files, 110/110** |
| Client tests | **7 files, 42/42** |
| Server typecheck + build | exit 0 |
| Client lint, client build, E2E typecheck | exit 0 |
| Browser E2E | **31/31**, with `NODE_OPTIONS=--dns-result-order=ipv4first` (see below) |
| Compiled `dist/lifecycle-cli.js` gate | wrong database → exit 2; missing `--expect-database` → exit 2; clean database → exit 0 `SAFE`; no connection string in output |

**E2E environment note.** Without the IPv4-first option, the E2E suite currently aborts in global setup with `read ECONNRESET` before any test runs. Something on this machine resets IPv6 `localhost` (`::1`) connections to the API port. The reviewed commit `bbf8a36` fails identically, and this round changed no code the app loads (only the CLI and tests). Evidence: [`uat-e01-rereview-red.txt`](uat-e01-rereview-red.txt), [`uat-e01-rereview-green.txt`](uat-e01-rereview-green.txt).

### 12.6 Remaining operational risks

- **Not executed in GCP.** The `kitloop-rollback-check` job, its IAM (runtime service account, database secret) and the real Cloud Run execution JSON shape were verified only against the offline fake. The first real pre-lifecycle rollback attempt is also the first real run of the gate. A failure there blocks the rollback (fails closed); it can't let an unsafe one through.
- **Window between the final re-check and `update-traffic`.** It's a few seconds. A concurrent manual `release.sh deploy` with `enabled`, or a new reconciliation job created in that window, isn't excluded by a lock. `deploy.yml` serialises automated releases, but manual operators must not run releases concurrently.
- **Changes outside `release.sh`.** Cloud Console traffic changes, or `gcloud run services update-traffic` run by hand, bypass every guard. The runbook's emergency step is to route to a lifecycle-aware revision.
- ~~**Deploying an unknown commit.** `release.sh deploy` refuses known pre-lifecycle commits only when the commit is present in the checkout. Release clones are full (`deploy.yml` uses `fetch-depth: 0`); a shallow manual clone wouldn't detect it.~~ *This was a P1 in the re-review of `402eafd` and is now fixed (§14): an unknown commit is refused.*
- **No path back after rows exist.** Once phase 2 has written any lifecycle row, no pre-lifecycle revision can become serving again through `release.sh`. That's intended, but recovery from a phase 1 defect then means fixing forward or using another lifecycle-aware revision.

## 13. Final pre-merge audit (2026-11-21)

An independent re-audit of the §12 implementation. Everything below was re-run against the latest local code, which is still `bbf8a36` plus uncommitted changes.

### 13.1 Defect found: a tagged phase-2 revision is still a lifecycle writer

The §12 preflight considered only revisions with a traffic share above 0%. But `release.sh deploy` gives each new revision the `candidate` tag. Cloud Run keeps tags across `update-traffic`, and a tag URL is invokable under the service's own invoker policy, which is public after `publish`.

After phase 2 → phase 1, the phase-2 revision therefore still answers at `https://candidate---…run.app` with writes enabled. Consider this sequence:

1. Phase 2 is deployed.
2. The service rolls back to phase 1.
3. A pre-lifecycle rollback is attempted while zero lifecycle rows exist.

§12 allowed that rollback. Afterwards, any signed-in borrower who sends a crafted request to the tag URL could cancel a request, which writes a `CANCELLED` row and returns the 500 hazard. A browser at the tag URL is stopped by the origin check, but a scripted client that sets `Origin` is not. The existing suite even asserted that this rollback was ALLOWED.

### 13.2 Fix

- `common.sh`: added `reachable_revisions`, which covers both traffic shares and tag URLs, and `traffic_snapshot`, which records revisions, percentages and tags.
- `release.sh` preflight now refuses when any reachable revision has writes enabled. For a tag, it names the tag and the `--remove-tags` command. Removing a tag doesn't move traffic.
- The re-check before `update-traffic` now compares the full traffic snapshot, including tags, not just the serving set.
- Runbook "Safe rollback targets" and the phase 1 rollback procedure updated to match.

### 13.3 RED / GREEN

- **RED** (working tree before the fix, new regression only): `FAIL: phase 2 -> phase 1 -> pre-lifecycle with zero rows while phase 2 keeps a tag URL (unexpected success)`. The precondition, that the phase-2 revision still holds `candidate` at 0%, held.
- **GREEN:** the guard suite passes. The new case is BLOCKED with both 1 row and 0 rows, and no check job runs. After the operator removes the tag:
  - the reviewer's sequence with rows is still BLOCKED by the database check;
  - the zero-row rollback is ALLOWED.

  The 16 deployment guard cases pass, and `bash -n` and `shellcheck -S warning` report nothing for `release.sh` and `common.sh`.
- **Regression:**
  - server 14 files 110/110
  - client 7 files 42/42
  - server typecheck and build, client lint and build, E2E typecheck: exit 0
  - `prisma validate` exit 0, and `migrate status` reports the isolated test database up to date
  - no existing migration modified
  - browser E2E 31/31 with `NODE_OPTIONS=--dns-result-order=ipv4first`

Evidence: `uat-e01-final-audit-evidence.txt`.

### 13.4 Still open after the audit

- The §12.6 risks are unchanged: the gate hasn't been run in GCP; there's an unlocked seconds-long window before `update-traffic`; console or raw-gcloud changes bypass the gate; deploying an unknown commit is only refused when the commit is in the checkout.
- **Classification:** a revision counts as pre-lifecycle only if it lacks `REQUEST_LIFECYCLE_WRITES`. That holds for every revision `release.sh` can produce from known commits, but a hand-deployed revision could be mislabelled.
- **Reconciliation reason label:** it records `ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER` even if the active loan belongs to the same borrower through an older request. The status outcome is still correct.

## 14. PR #72 re-review of `402eafd`: deploy source verification failed open (P1)

### 14.1 Root cause

The `deploy` guard was a single combined condition: *if the commit resolves locally **and** lacks the lifecycle migration, refuse*. For a full 40-character SHA that is absent from the checkout, the first clause is false, so the whole guard was skipped. `deploy` then continued with the registry image for that SHA. That image could be an old Prisma client, and `deploy` would label it `REQUEST_LIFECYCLE_WRITES=…`, which later made the rollback gate treat it as lifecycle-aware.

Two related gaps:
- Abbreviated SHAs were resolved in the current directory rather than the checkout containing `release.sh`.
- `migrate` and `bootstrap` did no source verification at all.

### 14.2 Fix

`release.sh` now has `verified_release_commit`, the first statement of `deploy`, `migrate` and `bootstrap`. It runs separate fail-closed steps, each with its own refusal ending *"Nothing was changed."*:
1. lowercase hex, 12–40 characters
2. Git available, and `release.sh` inside a Git checkout
3. `rev-parse --verify "$input^{object}"` succeeds in that checkout, which rejects unknown SHAs and ambiguous abbreviations
4. the resolved ID is 40 hex characters and starts with the input, which rejects a ref name that only looks like a SHA
5. `cat-file -t` is `commit`, which rejects blobs, trees and annotated tag objects
6. `$LIFECYCLE_MIGRATION` is a blob in that commit

The canonical full SHA then drives the image tags and the candidate's `/api/version` check. Rollback guards are unchanged.

### 14.3 Regression (`infra/gcp/guards.test.sh`)

The harness now runs a copy of `infra/gcp` inside a disposable Git repository of **real** commits. `SHA1..SHA6` are lifecycle-aware commits, and there are real pre-lifecycle, migration-removed, blob, tree and annotated-tag objects. Before, the SHAs were made-up strings that existed nowhere. The fake Cloud Run reports the commit each image was built from.

| Scenario | Result |
|---|---|
| Unknown full SHA whose registry images and completed migration job exist (reviewer's path) | REFUSED |
| Unknown abbreviated SHA | REFUSED |
| Known pre-lifecycle SHA, full and abbreviated | REFUSED |
| Commit with the lifecycle migration removed | REFUSED |
| Blob, tree, annotated tag object (full and abbreviated) | REFUSED |
| Tag name, `HEAD`, SHA-like branch name, uppercase, 11 or 41 characters, leading `-` | REFUSED |
| `migrate` / `bootstrap` of an unknown or pre-lifecycle SHA | REFUSED |
| Lifecycle-aware commit (abbreviated input, canonicalised) | ALLOWED |

Every refused case asserts:
- a nonzero exit and a specific message;
- **no** `gcloud artifacts docker`, `run jobs`, `run deploy`, `run services`, `run revisions`, `update-traffic`, `sql instances` or `builds` call;
- unchanged traffic.

**RED** (the new tests against the `402eafd` scripts): `FAIL: deploy of an unknown full SHA with registry images and a migration execution (unexpected success)`. The image was deployed and given 100% of traffic.

**GREEN:**
- `guards.test.sh` passes, and the 16 deployment guard cases pass
- `bash -n` and `shellcheck -S warning infra/gcp/*.sh infra/gcp/deploy/*.sh` are clean
- server 14 files 110/110
- client 7 files 42/42
- server typecheck and build, client lint and build, E2E typecheck: exit 0
- browser E2E 31/31 with `NODE_OPTIONS=--dns-result-order=ipv4first`

Evidence: `uat-e01-402eafd-red.txt`, `uat-e01-402eafd-green.txt`.

### 14.4 Remaining limitations

- **Image provenance.** Source verification proves the *commit*. The image is still found by the mutable tag `<sha[0:12]>` and bound to the commit only by its self-reported `BUILD_COMMIT_SHA`, checked before traffic. There's no signature or attestation, so anyone with Artifact Registry write access could defeat it. `prepare.sh` grants repository write only to the Cloud Build service account; project owners and editors also have it. The first deployment of a new service skips the candidate check.
- **Revision classification.** A rollback treats a revision as pre-lifecycle when it lacks `REQUEST_LIFECYCLE_WRITES`. No production revision was deployed by the PR's tooling, because it isn't merged, so no mislabelled revision can exist from the fail-open path.
- The §12.6 / §13.4 risks are unchanged: not run in GCP; a seconds-long window before `update-traffic`; changes outside `release.sh` bypass the gate.
