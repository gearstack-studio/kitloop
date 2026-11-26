# CR-01 Borrowing Quota Management — Change Impact Analysis

| Document control | Value |
| --- | --- |
| Document ID | L7A-CR01-IA |
| Version | **CR-01 contract r2 (draft)**. Supersedes r1 (draft); r1 → r2 changes are listed in §21. |
| Status | **Proposed. Team agreement, open decisions OD-01–OD-09 and teammate contract review all PENDING.** |
| Change request | [Issue #78](https://github.com/gearstack-studio/kitloop/issues/78) — CR-01 Borrowing Quota Management |
| Accepted Sprint 1 baseline | `e5ed70dbd65ac03d633fc7b8e0b73a72aa262490` (merge of release PR [#77](https://github.com/gearstack-studio/kitloop/pull/77)) |
| Analysed pre-change revision | `8ac350a0bd75f9e1922ea394b83850a78ca32ce5` (tree-identical to the baseline; see §1) |
| Working branch | `docs/lab7-cr01-borrowing-quota-contract` (uncommitted draft) |
| Prepared by | yiiipunn (contract and impact-analysis lead, as proposed in Issue #78 §12) |
| Reviewer | DEV4952: **PENDING** (§19) |
| Companion documents | [Acceptance criteria](CR-01-acceptance-criteria.md) · [Software Test Specification](CR-01-STS.md) · [SRS](../../srs.md) · [System SDS](../../sds-system-level.md) · [FEAT-03](../../sprints/sprint-1/FEAT-03-borrow-request-workflow.md) · [FEAT-04](../../sprints/sprint-1/FEAT-04-custodian-checkout.md) · [RTM](../../traceability-matrix.md) |

This analysis is documentation only. It claims no implementation, test execution, approval or deployment. Where the text says "proposed", "candidate" or "planned", the item does not exist yet. Effort figures are estimates made from reading the code. They are not measurements or commitments.

**Approval basis.** The latest instructor announcement for Lab 7 removed the requirement for Instructor or TA approval of the Sprint 1 change request. Team agreement and a substantive teammate review are still required. Neither has happened; both are PENDING in §19.

## Evidence index

| Evidence ID | Content | Location |
| --- | --- | --- |
| L7A-EV01 | Repository and baseline verification record | §1 |
| L7A-EV02 | Change request source (Issue #78 body; no comments at time of audit) | Issue #78; §2 |
| L7A-EV03 | Old and new contract excerpts | §3 |
| L7A-EV04 | Requirement → feature → code traceability | §5 |
| L7A-EV05 | Transaction and concurrency analysis, including recovery operations | §10 |
| L7A-EV06 | Acceptance criteria CR01-AC01–AC12 (Issue #78), plus proposed AC13–AC20 | [CR-01-acceptance-criteria.md](CR-01-acceptance-criteria.md) |
| L7A-EV07 | Software Test Specification CR01-TC01–TC20, dependency checks and release gates | [CR-01-STS.md](CR-01-STS.md) |
| L7A-EV08 | Revised RTM, CR-01 section | [traceability-matrix.md](../../traceability-matrix.md#cr-01-revision-borrowing-quota-management) |
| L7A-EV09 | Teammate contract review record (PENDING) | §19 |
| L7A-EV10 | Team agreement record (PENDING) | §19 |
| L7A-EV11 | Recovery dependencies, release options and controlled activation | §20 |
| L7A-EV12 | Per-suite regression fixture analysis | §14 |

## 1. Baseline and pre-change version (L7A-EV01)

The checks below were run from the local clone with read-only Git and authenticated GitHub CLI commands on 2026-11-26, after `git fetch origin`.

| Check | Command (summary) | Observed result |
| --- | --- | --- |
| Current branch | `git branch --show-current` | `docs/lab7-cr01-borrowing-quota-contract` |
| Remote | `git remote -v` | `origin https://github.com/gearstack-studio/kitloop.git` |
| HEAD | `git rev-parse HEAD` | `8ac350a0bd75f9e1922ea394b83850a78ca32ce5` (merge of PR #76) |
| Baseline commit | `git log -1 e5ed70d` | `e5ed70d` "Merge pull request #77 from gearstack-studio/sprint-1-staging", 2026-11-22 21:31:14 +0700 |
| Baseline parents | `git log -1 --format=%P e5ed70d` | `bea69d3…` (previous main) and `8ac350a…` (staging tip) |
| HEAD vs baseline | `git rev-list --count e5ed70d..HEAD` → `0`; `git diff --quiet 8ac350a e5ed70d` | HEAD is the baseline's second parent. The **trees are identical**. |
| Remote tips | `git rev-parse origin/main origin/sprint-1-staging` | `origin/main` = `e5ed70d`; `origin/sprint-1-staging` = `8ac350a` |
| Intervening development | `git log HEAD..origin/sprint-1-staging` | None |
| PR #77 | `gh pr view 77` | MERGED 2026-11-22T14:31:15Z (21:31 ICT) into `main`; merge commit `e5ed70d` |
| Working tree | `git status --short` | Four untracked `artifacts/sprint-1/uat/uat-e05-*.webm`. These are not staged and must not be staged by CR-01. |
| Production lifecycle setting | `gh variable list --env lab5-production` | `KITLOOP_REQUEST_LIFECYCLE_WRITES=disabled` (updated 2026-11-21T13:33:36Z). No `KITLOOP_LOAN_MAX_DAYS` at environment or repository level. |
| Test-environment lifecycle setting | `server/vitest.config.ts`; `e2e/playwright.config.ts` | Server tests run with `REQUEST_LIFECYCLE_WRITES: "enabled"`, and only `lifecycle-rollout.test.ts` switches to phase 1. E2E also runs `enabled`, with `LOAN_MAX_DAYS: "21"`. **The test configuration differs from production** (§17 #11). |
| Lifecycle issue | `gh issue view 61` | #61 (UAT-E01) is CLOSED (2026-11-23). Code for cancel, decline, auto-decline and reconcile exists, gated by `REQUEST_LIFECYCLE_WRITES`. Issue #78 §9 says the Team 7 retest was blocked because writes are disabled in production. |
| Return functionality | `grep` of `server/src`; `gh issue list --state all` | **No return route** exists at `e5ed70d`, and **no issue for return (FR-12)** was found. `docs/sprints/plan.md` §3 plans return for Sprint 2. |
| Live deployed revision | Not checked in this phase | **NOT VERIFIED.** Issue #78 records revision `kitloop-e5ed70dbd65a-20261122152107` from run 45033262619. Re-verify before RED. |
| Independent UAT acceptance | Issue #78 §2 | Team 7, 22 November 2026, 23:08 ICT. Quoted, not independently re-verified. |

**Conclusion.** The actual pre-change revision is `8ac350a`, with content equal to `e5ed70d`. All code references are to that tree.

## 2. Change summary

| Item | Value |
| --- | --- |
| Type | Adaptive maintenance of the accepted Sprint 1 scope (Issue #78) |
| Policy (unchanged in r2) | P = PENDING requests owned by the borrower; L = the borrower's loans with `returnedAt IS NULL`. A new otherwise-valid request is allowed only if **P < 2 and P + L < 3**. Remaining capacity = `max(0, min(2 − P, 3 − P − L))`. |
| New rule ID | **BR-14.** Verified unused (the SRS defines BR-01–BR-13; no occurrence in the repository). |
| New error codes | `409 BORROWING_QUOTA_EXCEEDED`. r2 also proposes `404 BORROWING_QUOTA_DISABLED` for the quota read while activation is off (OD-08). Both verified unused. |
| New read API | `GET /api/borrowing-quota`. Verified unused. |
| Controlled activation (r2) | Proposed deployment setting `BORROWING_QUOTA` (`disabled` by default, `enabled`). It is only allowed together with `REQUEST_LIFECYCLE_WRITES=enabled`, and production activation is gated on the recovery dependencies (§20). **Pending OD-01 and OD-08.** |
| Recovery dependencies (r2) | DEP-LC: production enablement of the existing #61 lifecycle actions. DEP-RT: authorized equipment return (FR-12), which is unimplemented and has no issue. **Neither is part of CR-01** (§20.4). |
| Schema or migration | None (§12) |
| Dependencies or CI pipeline | No package changes. The deploy configuration needs a new variable (§20.5, Part B and separately reviewed). |

## 3. Old and proposed contracts (L7A-EV03)

Historical text is quoted from baseline `e5ed70d`. Proposed text is the CR-01 wording in the documents listed. No historical wording has been deleted from those documents.

| Contract | Baseline excerpt (`e5ed70d`) | Proposed CR-01 contract (r2) |
| --- | --- | --- |
| SRS FR-06 | "A Borrower shall be able to submit a request for an existing, borrowable Asset ID; the system shall save the requester, asset, submission time, and pending status and return the created request." | Unchanged, plus an amendment: an otherwise-valid submission is also subject to BR-14. An over-quota submission returns 409 `BORROWING_QUOTA_EXCEEDED` and writes nothing. |
| SRS FR-07 | "A Borrower shall be able to view their own requests with asset and status information, including a newly submitted request." | Unchanged, plus an amendment: the Borrower can view their **own** quota while enforcement is active. No user can view another borrower's quota. |
| SRS BR-10 | "…A borrower may have at most one pending request per Asset ID; duplicate submission is rejected without writes." | Unchanged, cross-referenced. The per-asset rule stays independent and keeps precedence. |
| SRS BR-14 | *(did not exist)* | New rule, clauses (a)–(f) as in r1, plus **(g)**: enforcement is a controlled activation. Production enablement is only allowed after authorized cancel or decline and authorized return are available and verified. |
| SDS §5.3 | "Within a short serializable transaction, read the asset and active-loan count… Reject an existing pending request for the same borrower and asset; otherwise insert…" | When active, the same transaction counts P and L after the duplicate check and rejects with `BORROWING_QUOTA_EXCEEDED`. The retry revalidates. The read endpoint uses one snapshot; activation and recovery rules are in §5.3.1. |
| FEAT-03 errors | "Retired/checked-out equipment produces 409 `ASSET_UNAVAILABLE`; duplicate pending request produces 409 `DUPLICATE_REQUEST`." | Adds `409 BORROWING_QUOTA_EXCEEDED` after both, and the full precedence for POST and GET. |
| FEAT-04 checkout | "Conditionally change the still-pending request to `CHECKED_OUT`, then create its loan…" | Unchanged. No quota check; the quota-neutral invariant P − 1, L + 1 is recorded. |

## 4. Quota definition and boundary table

| Term | Definition (exact predicate) |
| --- | --- |
| P | `COUNT(*) FROM "BorrowRequest" WHERE "borrowerId" = :principal AND "status" = 'PENDING'` |
| L | `COUNT(*) FROM "Loan" WHERE "borrowerId" = :principal AND "returnedAt" IS NULL` (the `activeLoanWhere` predicate in `server/src/availability.ts`) |
| Excluded requests | `CHECKED_OUT`, `DECLINED`, `CANCELLED`, `EXPIRED` (`EXPIRED` is reserved; nothing sets it at the baseline) |
| Excluded loans | `returnedAt IS NOT NULL` |
| `combinedUsage` | P + L (not clamped) |
| `remainingRequestCapacity` | `max(0, min(2 − P, 3 − P − L))` |
| `canSubmitRequest` | `remainingRequestCapacity > 0`, which for integers is equivalent to `P < 2 && P + L < 3` |
| `:principal` | Always `request.principal.id` from the server session |

| P | L | P + L | 2 − P | 3 − P − L | Remaining | New request | AC |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 0 | 0 | 0 | 2 | 3 | 2 | Allowed | AC01 |
| 1 | 0 | 1 | 1 | 2 | 1 | Allowed | AC01/AC02 |
| 0 | 1 | 1 | 2 | 2 | 2 | Allowed | AC01 |
| 0 | 2 | 2 | 2 | 1 | 1 | Allowed (combined limit binds) | AC02 |
| 1 | 1 | 2 | 1 | 1 | 1 | Allowed; combined usage becomes 3 | AC02 |
| 2 | 0 | 2 | 0 | 1 | 0 | **Rejected** (pending limit) | AC03 |
| 1 | 2 | 3 | 1 | 0 | 0 | **Rejected** (combined limit) | AC04 |
| 0 | 3 | 3 | 2 | 0 | 0 | **Rejected** (combined limit) | AC04 |
| 2 | 1 | 3 | 0 | 0 | 0 | **Rejected** (both limits) | AC04/AC05 |
| 3 | 2 | 5 | −1 | −2 | 0 | **Rejected** (historical over-limit) | AC07/AC16 |

## 5. Requirement → feature → code traceability (L7A-EV04)

Paths are relative to the repository root. "Candidate" marks a proposed Part B change. Nothing has been changed in this phase.

| Requirement | Feature | Existing module (baseline) | CR-01 candidate change | Existing tests (regression) | CR-01 tests |
| --- | --- | --- | --- | --- | --- |
| FR-06, BR-10, BR-14 | FEAT-03 | `server/src/borrow-requests.ts` `createBorrowRequest` (Serializable transaction, at most 3 attempts) | Quota check after the duplicate check, inside the same transaction, when active | `server/tests/borrow-requests.test.ts` | CR01-TC01–TC04, TC06–TC10, TC20 |
| BR-14 policy | FEAT-03 | *(none)* | New `server/src/borrowing-quota.ts`: constants, shared P/L snapshot query, capacity function | — | CR01-TC01–TC04 |
| BR-14 (g) activation | FEAT-03 | `server/src/config.ts` (`requestLifecycleWrites`, `loanMaxDays`, `runtimeConfig`), `server/src/auth.ts` `clientFeatures` | `borrowingQuota(env)` parser plus startup coupling check; `features.borrowingQuota` | `runtime-config.test.ts`, `lifecycle-rollout.test.ts` | CR01-TC19 |
| FR-07 (quota view), BR-03, BR-04, BR-14 | FEAT-03 | `server/src/domain.ts` (`domainRouter`: `requireAuth`, router-wide `Cache-Control: no-store`) | Route `GET /borrowing-quota` | `server/tests/auth.test.ts` | CR01-TC09, TC10, TC12 |
| FR-09, FR-10, BR-06, BR-09 | FEAT-04 | `server/src/checkout.ts` | **No change**; quota-neutral | `checkout.test.ts`, `checkout-unit.test.ts`, `loan-duration.test.ts` | CR01-TC05, TC07, TC20 |
| Recovery: cancel and decline (#61) | FEAT-03 | `server/src/request-lifecycle.ts`, `server/src/reconcile-competing-requests.ts` | **No change.** These lower P; the quota is never evaluated on them. | `request-lifecycle.test.ts`, `lifecycle-rollout.test.ts`, `reconcile-competing-requests.test.ts` | CR01-TC13, TC14, TC16–TC18, TC20 |
| Recovery: return (FR-12) | FEAT-04 | *(none; Sprint 2)* | **Not CR-01.** Dependency DEP-RT (§20). | — | CR01-TC15b, TC16b, TC17 (return rows), TC20-S4: BLOCKED until DEP-RT |
| FR-11, BR-04 | FEAT-05 | `GET /loans/mine` in `server/src/domain.ts` | No change | `checkout.test.ts`, `readable-names.test.ts` | CR01-TC10, TC12 |
| Availability | FEAT-02 | `server/src/availability.ts` | No change | `availability.test.ts`, `catalog.test.ts` | CR01-TC09 |
| FR-06/FR-07 UI | FEAT-03 | `client/src/borrowEligibility.ts`, `client/src/components/Requests.tsx`, `client/src/App.tsx` | Quota state, panel, load and refresh, clear on session end, gating on `features.borrowingQuota` | `client/tests/requests.test.tsx`, `borrow-workflow.test.tsx`, others in §14.3 | CR01-TC11, TC18, TC19 |
| Catalog request control | FEAT-02 (UI) | `client/src/components/Catalog.tsx` | Quota-blocked button state | `client/tests/borrow-workflow.test.tsx` | CR01-TC11 |
| End-to-end | All | `e2e/tests/02`–`07` | New `e2e/tests/09-borrowing-quota.spec.ts`; fixture changes (§14.4) | `02`–`07` | CR01-TC11, TC12, TC18 |

## 6. API callers and dependencies

| API | Callers at baseline | Dependencies | CR-01 effect |
| --- | --- | --- | --- |
| `POST /api/requests` | `client/src/App.tsx` `act('/requests', …)` from `BorrowRequestForm`; `Catalog` only navigates. Server tests through supertest; E2E UI helpers in `02`–`06`. | `express.json` → `requireAuth` → `requireRole(BORROWER)` → `requireCsrf` → `requestAssetId` → `createBorrowRequest` | One new 409 outcome when active. The 201 DTO is unchanged. |
| `GET /api/borrowing-quota` *(proposed)* | Candidate `App.tsx` triggers listed in FEAT-03 "Borrower UI" | `requireAuth` → router `no-store` → `requireRole(BORROWER)` → activation check → query check → shared snapshot | New, read-only |
| `POST /api/requests/:id/cancel`, `/decline` | Borrower `CancelRequest` and custodian `DeclineRequest` when `features.requestLifecycleActions` | `request-lifecycle.ts`; 404 `LIFECYCLE_ACTIONS_DISABLED` in phase 1 | Unchanged. They become **quota recovery paths**, and the client re-reads the quota after them. |
| `POST /api/requests/:id/checkout` | Custodian `Checkout` | `checkout.ts` | Unchanged; quota-neutral |
| `POST /api/loans/:id/return` *(does not exist)* | — | DEP-RT | Future recovery path; not CR-01 |
| `/auth/login`, `/auth/me` | `App.tsx` | `clientFeatures()` | Candidate: add `features.borrowingQuota: boolean` (OD-08) |

## 7. Backend and frontend validation

### 7.1 `POST /api/requests` evaluation order

| # | Check | Outcome on failure | Source |
| ---: | --- | --- | --- |
| 1 | JSON body parse / size (`express.json`, app-wide) | 400 `INVALID_JSON` / 413 `PAYLOAD_TOO_LARGE` | `app.ts`, `api-error.ts` |
| 2 | Session | 401 `UNAUTHENTICATED` | `requireAuth` |
| 3 | Role BORROWER | 403 `FORBIDDEN` | `requireRole` |
| 4 | Trusted Origin, then CSRF | 403 `FORBIDDEN_ORIGIN` / 403 `INVALID_CSRF` | `requireCsrf` |
| 5 | Body exactly `{ assetId }` | 400 `VALIDATION_ERROR` (`fields.assetId`) | `requestAssetId` |
| 6 | Asset exists | 404 `NOT_FOUND` | `createBorrowRequest` |
| 7 | Asset borrowable | 409 `ASSET_UNAVAILABLE` | same |
| 8 | No PENDING (borrower, asset) | 409 `DUPLICATE_REQUEST` (read check or P2002) | same, plus partial unique index |
| **9** | **BR-14, only when activation is on** | **409 `BORROWING_QUOTA_EXCEEDED`** | **candidate** |
| 10 | Insert | 201 | same |
| — | Serialization failure on all 3 attempts | 409 `CONFLICT` (unchanged) | same |

### 7.2 `GET /api/borrowing-quota` evaluation order (proposed)

| # | Check | Outcome on failure |
| ---: | --- | --- |
| 1 | Session | 401 `UNAUTHENTICATED` |
| 2 | Role BORROWER | 403 `FORBIDDEN` |
| 3 | Activation on (OD-08) | 404 `BORROWING_QUOTA_DISABLED` ("Borrowing limits are not enabled on this deployment"). This mirrors `LIFECYCLE_ACTIONS_DISABLED`, which is also checked after role and before input. |
| 4 | No query parameters (OD-05) | 400 `VALIDATION_ERROR`, `fields.query`: "This endpoint takes no parameters; it always reports the signed-in borrower's own quota" |
| 5 | Snapshot read | 200 with the DTO in FEAT-03 "API changes"; unexpected failure → sanitized 500 |

**Why 400 for query parameters (OD-05, r2).** No existing GET route validates its query string. However, every write endpoint rejects unknown fields with 400 `VALIDATION_ERROR`, and the convention specifically rejects client attempts to supply identity: `requestAssetId` rejects `{ assetId, borrowerId }` with 400. A `?borrowerId=` on the quota read is the same kind of attempt to select another person's data. Rejecting it makes misuse visible instead of silently returning a different borrower's figures than the caller asked for. Our client never sends query parameters. `no-store` makes cache-busting parameters unnecessary.

**Frontend (advisory only).** Submission is disabled while the quota is loading or failed, or reports `canSubmitRequest: false`. Eligibility precedence is unavailable → pending → quota → eligible. A server 409 always wins (FEAT-03 "Borrower UI").

## 8. Authentication, roles and ownership

| Concern | Contract |
| --- | --- |
| Identity | The quota is computed only for `request.principal.id`. A query parameter gives 400 (§7.2). No body or path input exists. |
| Role | 401 without a session; 403 for a Custodian. Custodians never load a quota. |
| Privacy | The response has exactly seven numeric and boolean fields: no request, asset or user identifiers. It is `Cache-Control: no-store` (router-wide). No quota values are logged. |
| Isolation | P and L filter on `borrowerId`. Another borrower's actions can only *lower* this borrower's P (phase-2 auto-decline). |
| Recovery authorization | CR-01 adds none. Cancel (own request only), decline (assigned custodian only) and the future return (assigned custodian only) keep their own authorization contracts. CR-01 verifies only that an **unauthorized** recovery attempt changes no quota value (CR01-TC17). |

## 9. Persistence and transaction consistency

- **Source of truth.** Derived from `BorrowRequest` and `Loan` rows. No counter, cache or new column.
- **Submission.** Counts inside the existing Serializable transaction, after the duplicate read and before the insert. A rejection rolls back.
- **Read endpoint.** Both counts run in one Prisma batch transaction at `RepeatableRead`, so they come from one snapshot. The value is advisory.
- **Indexes.** `BorrowRequest_borrowerId_idx` and `Loan_borrowerId_idx` exist (migration `20261102125822_auth_baseline`).
- **Checkout.** Exactly one PENDING request becomes CHECKED_OUT and exactly one loan is inserted for that request's borrower in one transaction: P − 1, L + 1.
- **Recovery writes.** Cancel and decline set a terminal status with closure fields in a Serializable transaction (P − 1). Return (DEP-RT, future) would set `returnedAt` and `returnCustodianId` once (L − 1). These columns and constraints already exist.

## 10. Concurrency analysis (L7A-EV05)

### 10.1 Is the existing Serializable + retry strategy sufficient?

| Operation | ΔP | ΔL | Δ(P + L) | Isolation at baseline | Can break BR-14? |
| --- | ---: | ---: | ---: | --- | --- |
| Submit request | +1 | 0 | +1 | Serializable, 3 attempts | **Yes, if concurrent for one borrower.** This is the only increasing operation. |
| Checkout | −1 | +1 | 0 | Serializable, no retry | No (neutral) |
| Checkout auto-decline (phase 2) | −k (others) | 0 | −k | same transaction | No |
| Cancel / decline (phase 2) | −1 | 0 | −1 | Serializable | No |
| Reconcile apply (phase 2, operator) | −k | 0 | −k | Serializable / RepeatableRead | No |
| Return (DEP-RT, future) | 0 | −1 | −1 | Must be a transaction (SDS §5.5) | No (lowers usage) |
| Bootstrap / seed | 0 | 0 | 0 | ReadCommitted; users and assets only | No |

The hazard is **write skew**. Take two same-borrower transactions with one slot left. Each reads P = 1 and L = 1 and inserts a request for a *different* asset. Neither writes a row the other read, so row locks and the `(borrowerId, assetId)` partial unique index do not help, and under Read Committed both would commit. PostgreSQL Serializable (SSI; PostgreSQL documentation §13.2.3) makes the outcome of concurrently committed Serializable transactions equal some serial order. The mutual read-write dependency forces one abort (SQLSTATE 40001, Prisma `P2034`). The retry takes a new snapshot, sees the winner's row and rejects. **Conclusion: SSI prevents overshoot under these conditions** (SDS §5.3.1 contract rules):

1. Every quota-increasing writer runs at Serializable. Today that is only `createBorrowRequest`.
2. P and L are read in the same transaction as the insert.
3. Retry exhaustion is safe: `409 CONFLICT`, never a 201 without a commit.
4. False-positive aborts are possible. Relation-level predicate locks on small tables can make different borrowers conflict; the existing retry absorbs this.

Decreasing operations need no coupling. A submission serialized before a concurrent cancel, decline or return may be rejected although capacity is freed an instant later. That is correct under the serial order, and the UI recovers on refresh.

### 10.2 Alternatives evaluated

| Option | Assessment | Decision |
| --- | --- | --- |
| A. Existing Serializable transaction, quota reads inside it, existing retry | Correct under conditions 1–4. No new mechanism. | **Proposed** |
| B. Per-borrower `SELECT … FROM "User" … FOR UPDATE` | Under Serializable or Repeatable Read the snapshot is fixed at the first statement, so a waiter still reads stale data and SSI remains the guard. It would only be decisive under Read Committed, which changes the isolation contract of existing checks, and it adds a lock-ordering concern next to checkout. | Rejected |
| C. Denormalised counters on `User` | Duplicated state maintained by every lifecycle, reconcile, checkout and return path; migration and backfill. | Rejected |
| D. Counting trigger or constraint | Same write-skew problem unless it also locks or runs Serializable; migration. | Rejected |
| E. `pg_advisory_xact_lock(borrower)` | Same snapshot caveat as B; new raw-SQL convention | Rejected; reconsider only with TC08 evidence |

### 10.3 Interaction scenarios

| ID | Concurrent operations | Expected result | Test |
| --- | --- | --- | --- |
| C1 | Same borrower, distinct assets, one slot left ((1, 1) or (0, 2)) | Exactly one 201. The loser gets 409 `BORROWING_QUOTA_EXCEEDED` (normal) or `CONFLICT` (retry exhaustion). Final P + L = 3. | CR01-TC08a/b/c |
| C2 | Same borrower, one pending slot (1, 0) | Exactly one 201; final P = 2 | CR01-TC08a |
| C3 | Same borrower, (0, 1), three submissions | Exactly two 201s | CR01-TC08a |
| C4 | Same borrower, same asset twice | Unchanged: one 201, one `DUPLICATE_REQUEST` | TC-21, CR01-TC09 |
| C5 | Different borrowers | Independent; both 201 (possibly after an internal retry) | TC-21, CR01-TC10 |
| C6 | Submission ∥ checkout of the same borrower's request | See §10.5 | CR01-TC20 S1, S2 |
| C7 | Submission ∥ cancel of own request (phase 2) | The submission succeeds only if the cancel is serialized first | CR01-TC20 S3 |
| C8 | Submission ∥ checkout of *another* borrower's request on an asset this borrower also requested (phase 2 auto-decline) | The submission succeeds only if the auto-decline is serialized first | CR01-TC20 S5 |
| C9 | Submission ∥ return of own loan (DEP-RT) | The submission succeeds only if the return is serialized first | CR01-TC20 S4 (BLOCKED) |
| C10 | Quota read ∥ writes | Consistent (P, L) pair from one snapshot; may be stale | CR01-TC12 |

### 10.4 Proposed submission transaction

```mermaid
sequenceDiagram
    actor B as Borrower
    participant UI as Borrower UI
    participant API as POST /api/requests
    participant DB as PostgreSQL (SERIALIZABLE)
    B->>UI: Submit selected asset
    UI->>API: { assetId } + session cookie + CSRF
    API->>API: 401 / 403 role / 403 Origin-CSRF / 400 body
    loop at most 3 attempts on 40001 (P2034)
        API->>DB: BEGIN ISOLATION LEVEL SERIALIZABLE
        API->>DB: asset + active-loan count
        alt missing or unavailable
            DB-->>API: 404 NOT_FOUND / 409 ASSET_UNAVAILABLE (rollback)
        end
        API->>DB: pending request for (borrower, asset)?
        alt exists
            DB-->>API: 409 DUPLICATE_REQUEST (rollback)
        end
        opt quota activation on (BR-14 g)
            API->>DB: P = count PENDING (borrower); L = count Loan returnedAt IS NULL (borrower)
            alt P >= 2 or P + L >= 3
                DB-->>API: 409 BORROWING_QUOTA_EXCEEDED (rollback, no writes)
            end
        end
        API->>DB: INSERT BorrowRequest PENDING
        API->>DB: COMMIT (may raise 40001 and retry)
    end
    API-->>UI: 201 | 409 code | 409 CONFLICT after 3 failed attempts
    UI->>API: GET /api/borrowing-quota (with catalog/requests/loans refresh)
```

### 10.5 Concurrency outcomes and error semantics (r2)

**Two kinds of 409 for the losing submission.** They must be distinguished in tests and are never treated as interchangeable.

| Loser path | Mechanism | Response | Meaning | How CR01-TC08 verifies it |
| --- | --- | --- | --- | --- |
| Normal | Attempt *n* (n ≤ 3) sees the winner's committed row in its snapshot, either at its first attempt or after a 40001 retry | 409 `BORROWING_QUOTA_EXCEEDED` | The quota was evaluated against committed state | TC08b: deterministic injection of one 40001 after a competing commit; expect the quota code and exactly 2 transaction attempts |
| Exhaustion | Three consecutive 40001 aborts; no attempt reached a decision | 409 `CONFLICT` ("Equipment changed while submitting. Refresh and try again.") | The server could not decide; nothing was written | TC08c: deterministic injection of three 40001; expect `CONFLICT`, 3 attempts, zero new rows, both below and at quota |

TC08a (natural concurrency) accepts either code for the loser. It **always** asserts the exact number of 201 responses, that the number of new rows equals the number of 201s, and the final invariant (P ≤ 2, P + L ≤ 3, with the exact expected final P and L). It records the observed code distribution as diagnostic output, not as a pass condition.

**Submission ∥ checkout, same borrower** (outcome table for CR01-TC20). Let c = 1 if checkout returned 201, and s = 1 if submission returned 201.

| Start (P, L) | Valid serial orders | Allowed (c, s) | Final state | Forbidden |
| --- | --- | --- | --- | --- |
| (2, 0), checkout of R1 | checkout → submit: (1, 1) → (2, 1). Submit → checkout: rejected → (1, 1). | (1, 1), (1, 0); also (0, 0) if checkout aborted with `CHECKOUT_CONFLICT` | P = 2 − c + s, L = c | **s = 1 with c = 0** (overshoot to P = 3) |
| (1, 1), checkout of R1 (the only pending request) | Either order: capacity is 1 throughout | (1, 1); s = 0 allowed only with `CONFLICT` | (1, 2) when both succeed | Submission 409 `BORROWING_QUOTA_EXCEEDED` (that would mean double counting) |

Checkout has no retry by design (BR-09, "no automatic retry"). An SSI false-positive abort surfaces as the existing `409 CHECKOUT_CONFLICT`, with the request still PENDING. That is an existing outcome, not a new one, and TC20 accepts it while still asserting the final state. With lifecycle writes on, checkout can also auto-decline another borrower's request (C8). That only lowers usage, and the same rule applies: a submission may succeed only in a serial order that frees the capacity first.

## 11. Historical data handling

- Existing rows are **never** deleted, closed or rewritten by CR-01. No migration or reconciliation step is added.
- An over-limit borrower (such as P = 3, L = 2) keeps every record. Their quota reports `remainingRequestCapacity: 0`, and new submissions are rejected until P < 2 **and** P + L < 3.
- An otherwise-valid checkout for an over-limit borrower is **allowed**. Cancel, decline and return on their records are **never quota-checked**. Recovery reaches an accepting state only when both conditions hold (CR01-AC16).
- Read-only preflight, to run against the target database before activation (release gate RG-04). **It was not run in this phase:**

```sql
WITH p AS (SELECT "borrowerId", COUNT(*) AS pending FROM "BorrowRequest" WHERE "status" = 'PENDING' GROUP BY 1),
     l AS (SELECT "borrowerId", COUNT(*) AS active  FROM "Loan" WHERE "returnedAt" IS NULL GROUP BY 1)
SELECT COALESCE(p."borrowerId", l."borrowerId") AS "borrowerId",
       COALESCE(p.pending, 0) AS pending, COALESCE(l.active, 0) AS active
FROM p FULL OUTER JOIN l ON p."borrowerId" = l."borrowerId"
WHERE COALESCE(p.pending, 0) >= 2 OR COALESCE(p.pending, 0) + COALESCE(l.active, 0) >= 3;
```

## 12. Migration justification

No schema change or migration is required for CR-01:

1. P and L are computable from existing columns.
2. Supporting indexes exist.
3. Limits are constants (OD-02).
4. The activation setting is an environment variable, not data.

DEP-RT also needs no migration: `returnedAt`, `returnCustodianId` and the `Loan_return_*` constraints exist since `20261102125822_auth_baseline`. A CR-01 build rolls back to `e5ed70d` with no database action.

## 13. Unaffected behavior (must be preserved)

| Area | Preserved behavior | Protected by |
| --- | --- | --- |
| Authentication and sessions | Login, logout, `/auth/me`, expiry, CSRF and Origin checks | TC-01–TC-03, TC-18; `auth.test.ts` |
| Catalog and availability | DTO allowlist, derived availability, retired exclusion | TC-04, TC-05; `catalog.test.ts`, `availability.test.ts` |
| Non-reservation and duplicates (BR-10) | Competing requests allowed; 409 `DUPLICATE_REQUEST` | TC-21; CR01-TC09 |
| Error precedence | §7.1 steps 1–8 | CR01-TC09 |
| Checkout | Locks, validation, DTO, `LOAN_MAX_DAYS`, conflicts, rollback | TC-09, TC-10, TC-19, TC-20; checkout suites |
| Lifecycle (#61) | Phase 1 and phase 2 behavior, auto-decline, reconcile, rollout gate | lifecycle suites |
| Ownership (BR-04) | Own records only; foreign IDs → 404 | TC-07, TC-11 |
| Readable names (#63) | Borrower loan reads carry no person names | `readable-names.test.ts` |
| Safe errors (NFR-04) | Sanitized 500 | TC-24 |
| **Activation off (r2)** | With `BORROWING_QUOTA` disabled, `POST /api/requests` behaves exactly as at `e5ed70d` | CR01-TC19 |

## 14. Regression protection strategy (L7A-EV12)

### 14.1 Principles

1. Test-first: CR-01 tests are committed before implementation, run RED against `8ac350a`/`e5ed70d`, then GREEN unchanged.
2. Existing tests may receive only **fixture isolation** or **configuration fixture** changes. Assertions, expected codes and coverage are not removed or weakened. Each change is listed in the Part B PR with the reason from this section.
3. Proposed test configuration: `server/vitest.config.ts` and `e2e/playwright.config.ts` set `BORROWING_QUOTA: "enabled"` next to the existing `REQUEST_LIFECYCLE_WRITES: "enabled"`. Existing suites then run under the target production configuration, and a dedicated case (CR01-TC19) covers activation off. Running the regression suites only with the quota disabled would hide fixture interactions and is not proposed.
4. Fresh-borrower helper: each affected suite gets a helper that creates and logs in a new synthetic borrower. Tests that need an isolated quota call it instead of reusing the file-level borrower. The existing `session(Role.BORROWER)` helpers already do this; only the call sites move.

### 14.2 Server suites: exact impact

Traces assume Vitest's in-file sequential order (`fileParallelism: false`) and the phase-2 default. "First rejection" is the first API submission at which the shared borrower's live (P, L) already fails BR-14. Direct Prisma inserts are never quota-checked.

| Suite | Shared fixture | Trace to first BR-14 rejection | Tests that fail as written | Required fixture change |
| --- | --- | --- | --- | --- |
| `borrow-requests.test.ts` | `borrower`, `other` (`beforeAll`, L40–41) | "persists PENDING…" (L77) → borrower (1,0), other (1,0). "rejects concurrent duplicate…" (L98) → borrower (2,0). **"allows concurrent submissions by different borrowers…" (L106)**: borrower's POST → 409 quota, so `[201, 201]` fails. | L106; L135 "scopes lists/direct IDs…" (borrower and other both at P = 2); L169 "rolls back failed loan creation…" | Fresh borrower(s) in L106, L135, L169. Unaffected: L65, L77, L98, L113 (404/409 unavailable/400 precede the quota), L127, L202. |
| `request-lifecycle.test.ts` | `borrowerA`, `borrowerB` (L62–63) | borrowerB: L81–82 → (2,0), auto-decline → (1,0); L109 → (2,0) → (1,0); L130; L186 decline; L202 left PENDING → (2,·). **L218 rejected (deterministic).** borrowerA: loans from checkouts at L86 and L122 → (0,2); the race at L131 gives A L = 3 if A wins. **L144 is then rejected (race-dependent)**; otherwise L161 leaves A at (1,2) and **L227 is rejected (deterministic)**. | L144, L161 (possible); L218; L224 loop (L227); L240 test (L242–248); L255 (L257); L265 (L267) | Fresh borrowers per test, or per `describe` where a test relies on another test's records (none found) |
| `lifecycle-rollout.test.ts` | `borrowerA`, `borrowerB` (L57) | Phase-1 block: L88/89 → A (0,1) after checkout, B (1,0) kept PENDING; L97 → A (1,1); L116/117 + checkout → A (1,2), B (2,0). **L127 (A) and L128 (B) rejected.** | L124 "still reads lifecycle rows…" and every later submitting test: L152 (L154–155), L180 (L182), L190 (L192–193), L226 (L229–230) | Fresh borrowers per test. **Configuration fixture:** every place that sets `REQUEST_LIFECYCLE_WRITES=disabled` (L52 `beforeEach`, L132, L196) also sets `BORROWING_QUOTA=disabled`, and every re-enable sets both back. This follows the proposed coupling rule (phase 1 ⇒ quota off) and reproduces production phase 1 faithfully. |
| `reconcile-competing-requests.test.ts` | `borrowerA/B/C` (L73); `legacyData()` (L50–70) called by 5 tests | `legacyData()` runs phase 1 (lifecycle disabled). With the quota on, the **first call (L94) rejects borrowerB's third submission `f` (L65)**: B has `b` and `d` PENDING. Even with the quota off inside `legacyData()`, A collects one active loan per call, so **L118 `submit(borrowerA, data.z)` is rejected** at the third call (A has L = 3). | L93 test (via `legacyData`), L115 (L118), L155, L178 (L181) | **Configuration fixture:** `legacyData()` sets `BORROWING_QUOTA=disabled` together with `REQUEST_LIFECYCLE_WRITES=disabled` (legacy data was created by phase 1, where the quota cannot be on). Plus fresh borrowers per `legacyData()` call, returned in its result. |
| `checkout.test.ts` | `borrower` (L46) via `fixture()` (L25) | L61 fixture: checkout 413 → (1,0). L73 fixture: list only → (2,0). **L86 `fixture()` → 409, so `expect(201)` in the fixture fails.** | L85 and every later test that calls `fixture()`: L113, L124, L132, L146, L157, L167, L183 | `fixture()` creates a fresh borrower per call and returns its session. Tests that reference `borrower` (403 checks, `borrowerId` expectations) use the returned session. |
| `loan-duration.test.ts` | `borrower` (L53) via `fixture()` (L36) | L110 fixture + checkout → (0,1). L118 `atBoundary` + checkout → (0,2). L127 `beyond`: checkout rejected → (1,2). **L135 `fixture()` rejected.** | L134, L147, L158 | Fresh borrower per `fixture()`. `rival` (one submission) is unaffected. |
| `auth.test.ts` | direct Prisma inserts; API POST at L292 by borrowerB at P = 1 | No rejection (borrowerB goes to P = 2) | none | none |
| `catalog.test.ts`, `readable-names.test.ts` | direct inserts / one `lend()` per borrower | No rejection | none | none |
| `availability`, `bootstrap`, `checkout-unit`, `health`, `runtime-config`, `seed-policy`, `spa` | no submissions | — | none | none. The `runtime-config` cases keep passing because `BORROWING_QUOTA` defaults to disabled. New coupling cases go to CR01-TC19. |

### 14.3 Client suites

App-level tests stub `fetch` and **throw `Unexpected API call: <path>`** for unmocked paths (for example `client/tests/borrow-workflow.test.tsx`). A borrower session with the quota active makes a new `GET /api/borrowing-quota` call. Unmocked, it rejects, the UI enters the quota-error state, and Submit is disabled. Borrower submission tests would therefore fail.

| Suite | Renders `App` as a borrower | Required change |
| --- | --- | --- |
| `borrow-workflow.test.tsx` | yes | Mock `/borrowing-quota` with an allowing DTO; `/auth/me` and `login` mocks add `features.borrowingQuota` |
| `request-lifecycle.test.tsx`, `borrower-navigation.test.tsx`, `loans-workflow.test.tsx`, `readable-names.test.tsx` | yes | Same mock addition |
| `navigation.test.tsx` | to verify in Part B | Same, if a borrower identity is rendered |
| `checkout-workflow.test.tsx`, `loan-duration.test.tsx` | custodian | None expected (no quota call for custodians) |
| `requests.test.tsx` (component) | `BorrowRequestForm` props | If the form gains a quota prop, supply an allowing value. The expectation "Submit enabled when ready and valid" holds for an allowing quota. |

Mocks that omit `features.borrowingQuota` should mean "off", which keeps today's behavior, so suites that do not test the quota need no further change.

### 14.4 E2E suites

The specs run serially (`workers: 1`) on one seeded database with `REQUEST_LIFECYCLE_WRITES: "enabled"`. Borrower A: spec `02` requests `KL-CAM-001` and the laptop and gets CAM checked out → (1,1). Spec `03` setup requests `KL-ACC-001`, which stays PENDING → (2,1). **Spec `04` test 1 (`requestFromCatalog` for Borrower A) is then blocked.** The catalog button would also be disabled with the quota label, so the click helper fails. `05` (tests 1 and 5) and `06` (setup) are affected the same way.

Required change (Part B): add dedicated synthetic borrowers in `e2e/support/seed-fixture.mts` for specs `04`–`06`, or move those specs to a borrower with known usage. The assertions stay the same. **Evidence caution:** since #63 these specs show usernames in screenshots that are accepted UAT evidence (`artifacts/sprint-1/uat/uat-e01-*`, `uat-e02-*`, `uat-e03-*`). A rerun with changed users must not overwrite them; use the guarded runner `npm run test:e2e:guarded` and keep the exports off.

### 14.5 Existing expectations that genuinely change

Under the recommended design (controlled activation, coupled to phase 2), **no existing assertion's expected value changes**. Every failure above comes from fixture accumulation or configuration fixtures. The only behavior that differs from today is behavior no existing test asserts: an over-quota submission is now rejected. Under the **unflagged** alternative (§20, option A or D), the phase-1 behavior asserted indirectly by `lifecycle-rollout.test.ts` L86–L118 and `reconcile` `legacyData()` would change. Phase-1 submissions would be quota-checked, so those tests' fixture expectation that "phase-1 submissions are accepted" (`submit()` expects 201) would be revised from "201" to "201 only while BR-14 permits". This is one more reason the unflagged options are not recommended.

## 15. Risk assessment

| ID | Risk | Likelihood | Impact | Mitigation (r2) | Owner |
| --- | --- | --- | --- | --- | --- |
| R-01 | **Permanent lockout if the quota is active without recovery paths.** Production is phase 1 (cancel and decline 404; reconcile refuses) and there is no return endpoint. Checkout keeps P + L. Borrowers at P + L ≥ 3 can never recover. | High if activated now | High | Controlled activation (§20). The quota may only be enabled with lifecycle writes (enforced at startup) and, by release gate, after DEP-RT. **OD-01 pending.** | Both |
| R-02 | Stale PENDING requests block a borrower at P = 2 | High in phase 1 | Medium–High | Same as R-01. Under phase 2 the borrower can cancel, and the reconcile apply declines stale requests (DEP-LC step). | Both |
| R-03 | Shared fixtures cause false regressions | Certain (§14.2) | Medium | Exact fixture list in §14; assertions unchanged | Test lead |
| R-04 | More SSI aborts → `CONFLICT` for valid submissions, or `CHECKOUT_CONFLICT` | Low–Medium | Medium | Retry budget kept; TC08 and TC20 distinguish and record outcomes; TC-19 and TC-21 stay green | Backend |
| R-05 | A future non-Serializable writer bypasses SSI | Low | High | SDS §5.3.1 rule 1; DEP-RT return must also use a transaction (it lowers usage, so it is safe either way) | Reviewer |
| R-06 | UI shows stale capacity, especially after recovery done by another user (decline, return) | Medium | Low | Refresh triggers in FEAT-03, including route entry and manual refresh; server authoritative | Frontend |
| R-07 | Quota leak across users or sessions | Low | High | Session identity, 400 on query parameters, `no-store`, epoch-guarded client state; TC10, TC11 | Both |
| R-08 | A quota check is added to checkout or recovery operations | Low | High | Explicit non-goal; TC05, TC07, TC13–TC16 | Reviewer |
| R-09 | Deployed revision differs from the analysed tree | Low | Medium | Re-verify before RED | Release lead |
| R-10 | Limits drift between server and client | Medium | Low | The client renders server `max*` values | Frontend |
| R-11 (new) | Phase 2 → phase 1 rollback while the quota is enabled | Medium | High (silent lockout) if unguarded | Startup refuses `BORROWING_QUOTA=enabled` without lifecycle writes, so the rollback revision fails to become ready and traffic stays on the old revision (fail safe). The procedure is to disable the quota first. Mirror the check in `infra/gcp/common.sh` (Part B). | Release lead |
| R-12 (new) | DEP-RT (return) is not delivered before the Lab 7 deadline | Medium–High | Medium | The quota stays disabled in production and is honestly reported as **not activated**. Changed behavior is verified in CI and test environments only (§20.3, option B fallback). | Both |
| R-13 (new) | Enabling phase 2 (DEP-LC) removes pre-lifecycle revisions as rollback targets once lifecycle rows exist | Certain once enabled | Medium | Existing procedure in `infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md`. Owned by the lifecycle rollout, not CR-01. | Release lead |
| R-14 (new) | E2E fixture changes alter accepted UAT evidence content | Medium | Medium | Guarded runner; no evidence export; new users only for affected specs (§14.4) | Test lead |

## 16. Open decision register

All decisions are **PENDING actual team agreement**. Recommendations are the author's and are not decisions. Record each decision as a dated comment on Issue #78 or the contract PR, then update the "Approval status" column with the link.

| ID | Decision | Alternatives | Recommendation | Rationale | Approval status |
| --- | --- | --- | --- | --- | --- |
| OD-01 | How to prevent the R-01 lockout while keeping the 2/3 policy | A. Activate unconditionally (r1). B. Controlled activation; enable in production only after DEP-LC and DEP-RT are verified. C. Controlled activation; enable after DEP-LC only and accept residual lockout for L ≥ 3. D. No flag; release CR-01 only after the dependencies. E. Redefine P to exclude stale requests. | **B.** If DEP-RT cannot be delivered in time, keep the quota disabled in production and report it as not activated. Choose C only by explicit team acceptance of the residual lockout. | Keeps the Issue #78 policy and definitions. Only B guarantees recovery from every blocked state (§20.2). Unlike D, B survives a phase-2 rollback without silent lockout. A causes R-01, and E deviates from Issue #78. | **PENDING** (no recorded decision by yiiipunn or DEV4952) |
| OD-02 | Limit values: constants or configuration | Constants / `BORROWING_MAX_*` variables | Constants (2, 3) | Fixed policy; configurable values add untested states | **PENDING** |
| OD-03 | Code when the retry budget is exhausted | Keep `CONFLICT` / map to `BORROWING_QUOTA_EXCEEDED` | Keep `CONFLICT` | Existing behavior. The server genuinely did not evaluate the quota (§10.5). | **PENDING** |
| OD-04 | Quota snapshot in the 409 body | No / add `quota` object | No | Keeps the error envelope; the client re-reads the GET | **PENDING** |
| OD-05 | Query parameters on `GET /api/borrowing-quota` | Ignore (r1) / **400 `VALIDATION_ERROR`** | **400** (revised in r2) | Consistent with the strict-input convention that rejects client-supplied identity (`requestAssetId` rejects `borrowerId`). Makes cross-borrower probing visible. Other GET routes ignore queries, so this is a deliberate, documented stricter case. | **PENDING** |
| OD-06 | Dedicated endpoint or client-derived quota | Endpoint / derive from `/requests/mine` + `/loans/mine` | Endpoint | One snapshot and one definition; avoids duplicating the policy on the client | **PENDING** |
| OD-07 | Where the quota is shown | `/requests` only / also the dashboard | Panel on `/requests`, plus the catalog button state on the dashboard | Submission happens on `/requests`, and the catalog is the entry point | **PENDING** |
| OD-08 (new) | Activation mechanism and behavior when off | Environment flag with startup coupling / flag without coupling / release sequencing only | Flag `BORROWING_QUOTA` (`disabled` default) with startup refusal unless `REQUEST_LIFECYCLE_WRITES=enabled`. When off: no enforcement, GET → 404 `BORROWING_QUOTA_DISABLED`, `features.borrowingQuota: false`. | Follows the existing `REQUEST_LIFECYCLE_WRITES` and `LOAN_MAX_DAYS` patterns (startup validation, 404 `…_DISABLED`, `features`). Return availability cannot be detected by configuration, so it is a release gate (RG-02). | **PENDING** |
| OD-09 (new) | Ownership of the recovery dependencies | Fold into CR-01 / separate issues | Separate: DEP-LC under a lifecycle rollout record (follow-up to #61); DEP-RT as a **new Sprint 2 FR-12 issue**, to be created by the team (not created by this phase) | Keeps the CR-01 maintenance change honest and reviewable. Return is planned Sprint 2 scope (`plan.md` §3). | **PENDING** |

## 17. Documentation inconsistencies found (not corrected by CR-01)

| # | Document | Statement | Implemented behavior at `e5ed70d` |
| ---: | --- | --- | --- |
| 1 | SDS §4 | "BorrowRequest status is `PENDING` or `CHECKED_OUT`." | Also `DECLINED`, `CANCELLED`, `EXPIRED` and closure fields (#61) |
| 2 | SDS §1, header | Baseline `881c4d6`; domain endpoints "are planned" | Implemented and accepted |
| 3 | SDS §3 | Omits `/requests/:id/cancel`, `/decline`, `/api/version`, `/api/ready` | Routes exist |
| 4 | SRS OQ-03 | Cancel and close unresolved | Implemented behind a flag; disabled in production |
| 5 | FEAT-04 | No mention of phase-2 auto-decline | `checkout.ts` lines 109–121 |
| 6 | FEAT-03 / FEAT-04 headers | "teammate review and PR merge pending" | Merged and accepted (PR #77) |
| 7 | FEAT-03 | Exhausted contention "safe 409" without naming the code | `CONFLICT` |
| 8 | SDS §3 | No precedence between body parsing and authentication | Body-parser errors precede 401 |
| 9 | RTM | "TC-01–TC-28 remain planned"; baseline `c9c8895` | Sprint 1 tests and evidence exist |
| 10 | SRS §5 | FR-08–FR-10 sprint 2 | Delivered in Sprint 1 |
| 11 (new) | Test configuration vs production | Server and E2E tests run with lifecycle writes enabled | Production runs phase 1. Only `lifecycle-rollout.test.ts` and `legacyData()` exercise phase 1. |
| 12 (new) | `docs/sprints/plan.md` §6 | States "The RTM maps 17 FR, 13 BR…" | CR-01 r2 adds BR-14 (proposed); the plan's count is historical |
| 13 (new) | FEAT-02 §4 item 4 | The request control is disabled only for unavailable assets | It is also disabled for the borrower's own pending request (`borrowEligibility` `pending` state; FEAT-03) |

## 18. Other affected documents

| Document | Why affected | r2 action |
| --- | --- | --- |
| `docs/feature-inventory.md` | BR mapping per feature; dependency boundaries | **Updated:** FEAT-03 row BR list (BR-14, proposed); one dependency paragraph |
| `docs/sprints/sprint-1/FEAT-02-equipment-catalog.md` | The catalog request control gains a quota-blocked state | **Updated:** §4 item 4 note; §14 history row |
| `docs/sprints/plan.md` | Sequencing: CR-01 activation depends on Sprint 2 return and lifecycle phase 2 | **Updated:** §6 dependency item |
| `e2e/README.md` | Spec inventory and seeded users | **Not updated.** No change is true yet: spec `09` and any new users arrive in Part B, and the README is updated with them (§14.4). |
| `infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md` | Rollback must also disable the quota (R-11) | **Not updated** (infrastructure procedure; Part B with the flag) |
| `artifacts/sprint-1/**` | Historical evidence | **Do not edit** |

## 19. Team agreement and contract review record (L7A-EV09, L7A-EV10)

Nothing in this section has happened. The named people complete it with real dates and links.

| Gate | Person | Status | Evidence required |
| --- | --- | --- | --- |
| Team agreement on CR-01 policy and scope (Issue #78) | yiiipunn | **PENDING** | Dated Issue #78 comment |
| Team agreement on CR-01 policy and scope (Issue #78) | DEV4952 | **PENDING** | Dated Issue #78 comment |
| Agreement to amend Issue #78 with AC13–AC20 and the activation strategy | Both | **PENDING** | Issue comment; the issue body is edited only with permission |
| Decisions OD-01–OD-09 recorded | Both | **PENDING** | One comment per decision, linked in §16 |
| Separate issues for DEP-LC and DEP-RT created and linked | Both | **PENDING** | Issue URLs |
| Substantive contract review of the r2 document set | DEV4952 | **PENDING** | PR review comments |
| Review comments resolved | yiiipunn | **PENDING** | Linked commits or replies |
| Contract PR merged into `sprint-1-staging` before implementation | Both | **PENDING** | PR URL and merge commit |

## 20. Recovery dependencies and controlled activation (L7A-EV11)

### 20.1 Which transitions free capacity, and where they exist

| Transition | ΔP | ΔL | Implemented at `e5ed70d` | Available in production today | Owner |
| --- | ---: | ---: | --- | --- | --- |
| Borrower cancel (own PENDING) | −1 | 0 | Yes (#61, `request-lifecycle.ts`) | **No**: 404 `LIFECYCLE_ACTIONS_DISABLED` | DEP-LC |
| Custodian decline (assigned asset) | −1 | 0 | Yes | **No** | DEP-LC |
| Checkout auto-decline of competing requests | −k (others) | 0 | Yes | **No** | DEP-LC |
| Reconcile apply (stale requests) | −k | 0 | Yes (operator CLI) | **No** (refuses in phase 1) | DEP-LC |
| Checkout | −1 | +1 | Yes | Yes | FEAT-04 (existing) |
| Return (FR-12) | 0 | −1 | **No** | **No** | DEP-RT |
| Expiry | −1 | 0 | No (`EXPIRED` reserved) | No | Out of scope (Issue #78 §9) |

### 20.2 Recovery coverage per blocked state

| Blocked state (P, L) | Today (checkout only) | With DEP-LC only | With DEP-RT only | With both |
| --- | --- | --- | --- | --- |
| (2, 0), requests can be checked out | Recovers via checkout → (1, 1) | Yes | Yes | Yes |
| (2, 0), both requests stale | **No** | Cancel or decline → (1, 0) | Only after the competing borrower's return and then a checkout | Yes |
| (1, 2) | **No** | Cancel → (0, 2) | Return → (1, 1) | Yes |
| (2, 1) | **No** | Cancel → (1, 1) | Return → (2, 0), still blocked, then needs a checkout | Yes |
| (0, 3) | **No** | **No** | Return → (0, 2) | Yes |
| Over-limit (3, 2) | **No** | Cancel ×2 → (1, 2), still blocked | Return ×2 → (3, 0), still blocked | Yes (for example cancel ×2 + return ×1 → (1, 1)) |
| Any L ≥ 3 | **No** | **No** | Yes | Yes |

**Conclusion.** Recovery from every blocked state needs **both** DEP-LC and DEP-RT. DEP-LC alone leaves every borrower with L ≥ 3 permanently blocked.

### 20.3 Release options compared

The effort figures are rough person-day estimates for this two-person team, based on reading the code. Nothing has been built.

| Option | CR-01 work | Dependency work | Regression risk | Release implication |
| --- | --- | --- | --- | --- |
| A. Activate unconditionally (r1) | Core ≈ 2.5–4 pd | none | Fixture churn as in §14 | **Production lockout (R-01).** Not acceptable without an explicit team decision. |
| **B. Flag; enable after DEP-LC + DEP-RT verified** (recommended) | Core ≈ 2.5–4 pd + flag ≈ 0.5–1 pd | DEP-LC ≈ 0.5–1 pd of operations plus Team 7 retest coordination; DEP-RT ≈ 3–5 pd | Two configuration states to test (TC19); the flag adds one more deployment variable | Production behaves exactly like `e5ed70d` until activated, then is fully recoverable. Production verification of changed behavior happens only after activation. |
| B fallback: B with DEP-RT not delivered | as B | DEP-LC optional | as B | The quota ships **dark**. CR-01 changed behavior is verified in CI and test environments only. Release readiness for activation is honestly **NOT READY**. |
| C. Flag; enable after DEP-LC only | as B | DEP-LC only | as B | Residual permanent lockout for borrowers with L ≥ 3; needs explicit, recorded team acceptance |
| D. No flag; merge or deploy only after the dependencies | Core only | both | Phase 2 → 1 rollback silently re-creates the lockout; the release is coupled to two other changes | Not recommended |
| E. Exclude stale pending from P | ≈ +1 pd, extra edge cases | none | Contradicts the Issue #78 definitions | Rejected |

**What the estimates cover.**
- *Core:* `borrowing-quota.ts`, the transaction change, the GET route, client panel and eligibility, CR01 tests, and the §14 fixture changes in about 7 server suites, 5 client suites and 3 E2E specs.
- *Flag:* `config.ts` parser and coupling, `clientFeatures`, a 404 route branch, client gating, tests for both states, and mirrors in `infra/gcp/common.sh` and `deploy.yml`.
- *DEP-LC:* code exists. The work is setting `KITLOOP_REQUEST_LIFECYCLE_WRITES=enabled`, deploying, running reconcile dry-run and apply with retained evidence, verifying cancel and decline in production, and requesting the Team 7 #61 retest. Lab-visible time depends on the other team.
- *DEP-RT:* `POST /api/loans/:id/return` per SDS §5.5 (asset → loan lock, scope, single return, 409 on repeat, rollback), custodian UI on `/loans/active`, server, client and E2E tests, plus a feature contract and STS. No migration.

### 20.4 Scope separation

| Deliverable | CR-01 (Issue #78) | DEP-LC (lifecycle rollout, follow-up to #61) | DEP-RT (new FR-12 issue) |
| --- | --- | --- | --- |
| BR-14 enforcement, read endpoint, UI, activation flag | **Yes** | — | — |
| Cancel and decline semantics and authorization | No (consumed) | Already implemented; **production enablement and verification** | — |
| Return endpoint and UI | No (consumed) | — | **Yes** |
| Quota recalculation after cancel, decline or return | **Yes** (CR01-TC13–TC18) | — | — |
| Tests of cancel, decline or return themselves | No | Existing #61 suites; DEP-LC checks | Its own STS; DEP-RT checks |
| Production activation decision and post-activation check | **Yes** (RG-05) | Prerequisite RG-01 | Prerequisite RG-02 |

### 20.5 Proposed controlled-activation contract (OD-08; Part B)

| Aspect | Contract |
| --- | --- |
| Setting | `BORROWING_QUOTA` = `disabled` (default when unset) \| `enabled`. Any other value is a startup `ConfigurationError`, as with `REQUEST_LIFECYCLE_WRITES`. |
| Coupling | `runtimeConfig` refuses `BORROWING_QUOTA=enabled` unless `REQUEST_LIFECYCLE_WRITES=enabled`. The deploy tooling mirrors the check before any Cloud Run call (`KITLOOP_BORROWING_QUOTA`, default `disabled`). |
| Off | `POST /api/requests` identical to `e5ed70d`; `GET /api/borrowing-quota` → 404 `BORROWING_QUOTA_DISABLED` after the 401/403 checks; `features.borrowingQuota: false`; no client quota call or panel |
| On | Full BR-14 contract |
| Return gate | Not detectable by configuration, so enforced by release gate RG-02 (evidence that the return endpoint is released and verified in production) |
| Rollback | Phase 2 → phase 1: set `KITLOOP_BORROWING_QUOTA=disabled` in the same deploy. Otherwise the new revision fails startup and traffic stays on the current revision (fail safe). Rolling back to a revision that predates activation needs nothing extra. |
| Later cleanup | Once lifecycle writes and return are permanent, defaulting or removing the flag is a separate reviewed change, as `REQUEST-LIFECYCLE-ROLLOUT.md` "Later cleanup" describes for lifecycle |

### 20.6 Release gates for production activation (all PENDING)

| Gate | Condition | Evidence |
| --- | --- | --- |
| RG-01 | DEP-LC: a phase-2 revision is serving; cancel and decline verified in production; reconcile dry-run and apply evidence retained | Revision name, env value, smoke results, reconcile JSON |
| RG-02 | DEP-RT: return released and verified in production (authorized return lowers L; repeat return 409) | Return issue or PR, deployed commit, smoke results |
| RG-03 | CR01-TC01–TC20 GREEN on the release candidate, with TC15b, TC16b, TC17 return rows and TC20-S4 executed after DEP-RT | Raw test output per STS §1 |
| RG-04 | §11 preflight run on production, result recorded | Query output (borrower UUIDs only) |
| RG-05 | Recorded team decision to activate; `KITLOOP_BORROWING_QUOTA=enabled` deployed; post-deployment check of enforcement and one recovery path | Decision link, revision name, smoke results |

## 21. Revision history

| Revision | Change | Status |
| --- | --- | --- |
| r1 (draft) | Initial impact analysis, AC01–AC12 expansion, STS TC01–TC12, SRS, SDS, FEAT and RTM revisions | Superseded by r2 (uncommitted) |
| r2 (draft) | R-01 resolution design (§20): recovery dependencies, release options, controlled activation, release gates. AC13–AC20 and TC13–TC20 proposed. TC08 split into normal and exhaustion semantics (§10.5). Submission ∥ checkout and recovery concurrency. Exact regression fixture analysis (§14). OD-05 revised to 400. OD-08 and OD-09 added; decision register expanded. Four additional documents reviewed (§18). | **Proposed; review PENDING** |
