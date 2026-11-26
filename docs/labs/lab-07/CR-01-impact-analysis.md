# CR-01 Borrowing Quota Management — Change Impact Analysis

| Document control | Value |
| --- | --- |
| Document ID | L7A-CR01-IA |
| Version | **CR-01 contract r4 (draft): pending-request quota (DC-1 option K2a).** Supersedes r3 (`03bb7c7`), r2 (`e1def2a`) and r1 (never committed). Superseded content is summarized in §21 and preserved in Git history. |
| Status | **r4 approved and merged** (PR [#79](https://github.com/gearstack-studio/kitloop/pull/79), merge `7519274`). **Decision record r4.1:** the remaining technical decisions, the RED/GREEN ownership and the deployment procedure were agreed on 2026-11-26 at 21:48 ICT (§16). Still pending: authorization to enable `LAB5_DEPLOY_ENABLED`, lifecycle verification (#83) before activation, and the announcement source. |
| Change request | [Issue #78](https://github.com/gearstack-studio/kitloop/issues/78). Its body still describes the r1 combined quota, and a revision is prepared but not yet applied (§18). |
| Accepted Sprint 1 baseline | `e5ed70dbd65ac03d633fc7b8e0b73a72aa262490` (PR [#77](https://github.com/gearstack-studio/kitloop/pull/77)) |
| Analysed pre-change revision | `8ac350a` (tree-identical to the baseline, §1) |
| Working branch | `docs/lab7-cr01-borrowing-quota-contract`; r3 at `03bb7c7`; r4 uncommitted |
| Related issues | #80 RED tests · #81 backend and GREEN · #82 frontend · #83 DEP-LC lifecycle activation · #84 FR-12 return (separate Sprint 2 work; **not** a CR-01 dependency) · #85 regression and production verification · #86 metrics and report |
| Companion documents | [Acceptance criteria](CR-01-acceptance-criteria.md) · [STS](CR-01-STS.md) · [SRS](../../srs.md) · [System SDS](../../sds-system-level.md) · [FEAT-03](../../sprints/sprint-1/FEAT-03-borrow-request-workflow.md) · [FEAT-04](../../sprints/sprint-1/FEAT-04-custodian-checkout.md) · [RTM](../../traceability-matrix.md) |

Documentation only. No implementation, test execution, approval or deployment is claimed. Effort figures are estimates.

## Evidence index

| Evidence ID | Content | Location |
| --- | --- | --- |
| L7A-EV01 | Repository and baseline verification | §1 |
| L7A-EV02 | Change request source | Issue #78; §2, §21 |
| L7A-EV03 | Old and new contract excerpts (baseline, superseded r1–r3, active r4) | §3 |
| L7A-EV04 | Requirement → feature → code traceability | §5 |
| L7A-EV05 | Transaction and concurrency analysis | §10 |
| L7A-EV06 | Acceptance criteria and their r4 classification | [CR-01-acceptance-criteria.md](CR-01-acceptance-criteria.md) |
| L7A-EV07 | STS with the r4 test mapping | [CR-01-STS.md](CR-01-STS.md) |
| L7A-EV08 | RTM, CR-01 section | [traceability-matrix.md](../../traceability-matrix.md#cr-01-revision-borrowing-quota-management) |
| L7A-EV09 | Review and agreement record | §19 |
| L7A-EV10 | Team decision register (DC-1) | §16 |
| L7A-EV11 | Recovery paths and controlled activation | §20.1, §20.2 |
| L7A-EV12 | Regression fixture analysis | §14 |
| L7A-EV13 | Deployment procedure (proposed) and rollback | §20.5, §20.6 |
| L7A-EV14 | Release gates and RG-05 evidence specification | §20.3, §20.4 |
| L7A-EV15 | Contingency outcome | §20.7 |
| L7A-EV16 | Reviewer-feedback resolution | §22 |

## Approval basis and announcement source

The latest instructor announcement removed the need for Instructor or TA approval of the Sprint 1 change request. Team agreement and teammate review are still required (§16, §19).

| Item | Value |
| --- | --- |
| Exact wording (as supplied by yiiipunn in the CR-01 task brief, 2026-11-26) | "Announcement. Lab 7 Spec Sheet Change. You need not get Instructor or TA Approval for your change request to Sprint 1. Think of a good change to Sprint 1 among yourselves, but do try to make it a complex enough added feature and not just a trivial change." |
| URL, publication date, capture | **PENDING SOURCE EVIDENCE.** Not present in Issue #78, PR #79 or the repository. Nothing is fabricated; either developer should supply the original. |
| Relevance to K2a | The reduced scope keeps the substantive parts: a cross-feature business rule, a concurrency-safe transactional check, a new read API, UI eligibility and refresh, lifecycle-based recovery, controlled activation and production verification. The team judged it sufficient at DC-1 (§16). |

## 1. Baseline and pre-change version (L7A-EV01)

All checks below were run with read-only Git and authenticated GitHub CLI commands. The r4 checks were rerun on 2026-11-26 after `git fetch`.

| Check | Observed result |
| --- | --- |
| Branch / HEAD | `docs/lab7-cr01-borrowing-quota-contract` at `03bb7c78bbef12aff6b748b7b167444ba214b3f4` (r3); equals `origin/docs/lab7-cr01-borrowing-quota-contract` |
| Branch history | `03bb7c7` (r3) ← `e1def2a` (r2) ← `8ac350a` |
| Baseline relation | `8ac350a` is the second parent of `e5ed70d` (PR #77 merge, 2026-11-22 21:31 ICT); the trees are identical. `origin/main` = `e5ed70d`, `origin/sprint-1-staging` = `8ac350a`. |
| Working tree | Only the r4 documentation edits, plus four untracked `artifacts/sprint-1/uat/uat-e05-*.webm` (preserved, not staged) |
| PR #79 | OPEN, `reviewDecision: REVIEW_REQUIRED`, head `03bb7c7`; no formal review submitted |
| Production configuration | `lab5-production` environment variable `KITLOOP_REQUEST_LIFECYCLE_WRITES=disabled`. Repository variable `LAB5_DEPLOY_ENABLED=false` (updated 2026-11-22T15:34:51Z). No `KITLOOP_LOAN_MAX_DAYS`. |
| Production approvals | `lab5-production`: required reviewer **DEV4952**, `prevent_self_review: true`, deployment branch `main` only. `main`: protected, 1 approving review, required check "Build, test and Docker smoke", applies to admins. `sprint-1-staging`: ruleset 27310627 "PR review and CI". |
| Deploy workflow | `.github/workflows/deploy.yml`: `on: push` to `main` only (no `workflow_dispatch`). It deploys only if CI succeeds, the ref is protected and `vars.LAB5_DEPLOY_ENABLED == 'true'`. Its steps are build, migrate, `release.sh deploy`, verify, and automatic rollback on failure. Last deploy run: 45033262619 (`e5ed70d`, success). |
| Test configuration | Server and E2E tests run with `REQUEST_LIFECYCLE_WRITES=enabled` (`server/vitest.config.ts`, `e2e/playwright.config.ts`) |
| Return functionality | No return route at `e5ed70d`. FR-12 is tracked in #84 and is out of CR-01 scope in r4. |
| Live deployed revision | **NOT VERIFIED** in this phase. Re-verify before RED (#80). |

## 2. Change summary (r4, K2a)

| Item | r4 value |
| --- | --- |
| Policy | P = the borrower's `PENDING` requests. A new otherwise-valid request is allowed only if **P < 2**. Remaining capacity = `max(0, 2 − P)`. **Active loans do not affect eligibility.** |
| Rule ID | BR-14 (r4 wording, SRS §6) |
| Error | `409 BORROWING_QUOTA_EXCEEDED`, with no writes |
| Read API | `GET /api/borrowing-quota` → `{ pendingRequests, maxPendingRequests, remainingRequestCapacity, canSubmitRequest }` (§7.3) |
| Recovery | Checkout (P − 1), borrower cancel (P − 1), custodian decline (P − 1), checkout auto-decline of competing requests (P − 1 for each affected borrower), operator reconcile (P − k) |
| Required release dependency | **DEP-LC (#83)**: enable and verify the existing lifecycle actions in production |
| Out of scope | Combined pending-plus-active-loan limit (deferred); FR-12 return (#84) and its verification as a CR-01 prerequisite; reservations or waitlists; unrelated Sprint 2 work |
| Activation | Off-by-default setting `BORROWING_QUOTA`, coupled to `REQUEST_LIFECYCLE_WRITES=enabled` (OD-08, proposed) |
| Schema / migration | None |

## 3. Old and new contracts (L7A-EV03)

| Contract | Baseline `e5ed70d` | r1–r3 (superseded) | **r4 (active proposal)** |
| --- | --- | --- | --- |
| Aggregate limit | None: "Borrowers may submit requests for distinct available assets without an aggregate per-borrower limit" (Issue #78 §3) | P < 2 **and** P + L < 3; capacity `max(0, min(2 − P, 3 − P − L))` | **P < 2 only**; capacity `max(0, 2 − P)` |
| Active loans | Irrelevant to submission | Counted in P + L | **Irrelevant to submission** (unchanged from the baseline) |
| SRS FR-06 | "…save the requester, asset, submission time, and pending status and return the created request." | + BR-14 (combined) | + BR-14 (pending only); 409 `BORROWING_QUOTA_EXCEEDED`; no writes |
| SRS FR-07 | "…view their own requests with asset and status information…" | + own quota (P, L, combined, limits) | + own pending quota (P, limit, remaining, can-submit) |
| SRS BR-10 | Per-asset duplicate rule | Cross-referenced | Cross-referenced (unchanged) |
| Checkout | One PENDING → CHECKED_OUT, one loan | "Quota-neutral" (P − 1, L + 1) | **Reduces pending usage by one** (P − 1). The new loan does not count. |
| Recovery dependency | — | Lifecycle **and** FR-12 return | **Lifecycle only (#83)** |
| Quota DTO | — | 7 fields including `activeLoans`, `combinedUsage`, `maxCombinedUsage` | **4 fields** (§7.3) |

## 4. Quota definition and boundary table

| Term | Definition |
| --- | --- |
| P | `COUNT(*) FROM "BorrowRequest" WHERE "borrowerId" = :principal AND "status" = 'PENDING'` |
| Excluded | `CHECKED_OUT`, `DECLINED`, `CANCELLED`, `EXPIRED` (reserved) |
| Not considered | Loans of any state |
| `remainingRequestCapacity` | `max(0, 2 − P)` |
| `canSubmitRequest` | `P < 2` |
| `:principal` | `request.principal.id` (the session) only |

| P | Any L | Remaining | New otherwise-valid request | AC |
| ---: | --- | ---: | --- | --- |
| 0 | 0, 1, 3, 5 | 2 | Accepted (201) | AC01, AC21 |
| 1 | any | 1 | Accepted; P becomes 2 | AC02, AC21 |
| 2 | any | 0 | **Rejected** (409, no writes) | AC03 |
| 3+ (historical) | any | 0 | **Rejected**; history preserved | AC07 |

## 5. Requirement → feature → code traceability (L7A-EV04)

| Requirement | Feature | Existing module | r4 candidate change (Part B) | Issue | CR-01 tests |
| --- | --- | --- | --- | --- | --- |
| FR-06, BR-10, BR-14 | FEAT-03 | `server/src/borrow-requests.ts` `createBorrowRequest` (Serializable, 3 attempts) | Count P after the duplicate check, inside the same transaction, when active | #81 | TC01–TC03, TC06–TC09, TC20, TC21 |
| BR-14 policy | FEAT-03 | — | New `server/src/borrowing-quota.ts` (constant 2, count, capacity) | #81 | TC01 (unit) |
| BR-14 activation | FEAT-03 | `server/src/config.ts`, `server/src/auth.ts` `clientFeatures`; deploy: `.github/workflows/deploy.yml`, `infra/gcp/common.sh`, `infra/gcp/release.sh` L247 | `BORROWING_QUOTA` parser and startup coupling; `features.borrowingQuota`; `KITLOOP_BORROWING_QUOTA` plumbing | #81 (code), #83/#85 (configuration) | TC19 |
| FR-07 quota view | FEAT-03 | `server/src/domain.ts` (`domainRouter`, `no-store`) | `GET /borrowing-quota` | #81 | TC09, TC10, TC12 |
| Checkout (BR-06, BR-09) | FEAT-04 | `server/src/checkout.ts` | **None**; P − 1 is already a consequence of the transition | — | TC05, TC07, TC20 |
| Lifecycle recovery (#61) | FEAT-03 | `server/src/request-lifecycle.ts`, `reconcile-competing-requests.ts` | None | #83 (production activation) | TC13, TC14, TC16, TC17, TC20 |
| UI | FEAT-03, FEAT-02 (UI) | `client/src/App.tsx`, `borrowEligibility.ts`, `components/Requests.tsx`, `components/Catalog.tsx` | Quota state, panel, eligibility, refresh, gating | #82 | TC11, TC18, TC19 |
| End-to-end | All | `e2e/tests/02`–`07` | New `09-borrowing-quota.spec.ts`; fixture changes (§14.4) | #85 | TC11, TC12, TC18 |

## 6. API callers and dependencies

| API | Callers | CR-01 r4 effect |
| --- | --- | --- |
| `POST /api/requests` | `App.tsx` `act('/requests')` from `BorrowRequestForm`; server tests; E2E `02`–`06` | New 409 `BORROWING_QUOTA_EXCEEDED` when active and P ≥ 2 |
| `GET /api/borrowing-quota` (new) | `App.tsx` refresh triggers (FEAT-03) | Read-only |
| `POST /api/requests/:id/cancel`, `/decline` | Borrower and custodian UI while `features.requestLifecycleActions` | Unchanged; recovery paths; the client re-reads the quota after them |
| `POST /api/requests/:id/checkout` | Custodian UI | Unchanged; lowers the borrower's P |
| `/auth/login`, `/auth/me` | `App.tsx` | Add `features.borrowingQuota` |

## 7. Validation, error precedence and API contract

### 7.1 `POST /api/requests`

| # | Check | Failure |
| ---: | --- | --- |
| 1 | JSON parse / size (app-wide) | 400 `INVALID_JSON` / 413 `PAYLOAD_TOO_LARGE` |
| 2 | Session | 401 `UNAUTHENTICATED` |
| 3 | Role BORROWER | 403 `FORBIDDEN` |
| 4 | Origin, then CSRF | 403 `FORBIDDEN_ORIGIN` / `INVALID_CSRF` |
| 5 | Body exactly `{ assetId }` | 400 `VALIDATION_ERROR` (`fields.assetId`) |
| 6 | Asset exists | 404 `NOT_FOUND` |
| 7 | Asset borrowable | 409 `ASSET_UNAVAILABLE` |
| 8 | No PENDING (borrower, asset) | 409 `DUPLICATE_REQUEST` |
| **9** | **P < 2 (only when active)** | **409 `BORROWING_QUOTA_EXCEEDED`**, no `fields`, no writes |
| 10 | Insert | 201 (DTO unchanged) |
| — | Three serialization failures | 409 `CONFLICT` (unchanged) |

Steps 1–8 are unchanged. Proposed message: "You already have 2 pending requests, the maximum. Wait for a checkout, cancel or decline before requesting more."

### 7.2 `GET /api/borrowing-quota` evaluation order

401 `UNAUTHENTICATED` → 403 `FORBIDDEN` (Custodian) → 404 `BORROWING_QUOTA_DISABLED` (activation off) → 400 `VALIDATION_ERROR` with `fields.query` (any query parameter; OD-05) → 200.

### 7.3 Response (r4)

```json
{
  "pendingRequests": 1,
  "maxPendingRequests": 2,
  "remainingRequestCapacity": 1,
  "canSubmitRequest": true
}
```

| Field | Type | Rule |
| --- | --- | --- |
| `pendingRequests` | integer ≥ 0 | P as stored; **not clamped** (historical values above 2 are shown) |
| `maxPendingRequests` | integer | Server constant 2; the client renders it and never hard-codes it |
| `remainingRequestCapacity` | integer ≥ 0 | `max(0, 2 − P)` |
| `canSubmitRequest` | boolean | `P < 2` |

The r3 fields `activeLoans`, `combinedUsage` and `maxCombinedUsage` are **removed**. They existed only for the deferred combined limit.

Headers: `Cache-Control: no-store` (router-wide) and `Content-Type: application/json`. The body contains no identifiers.

**Frontend (advisory).** Submission is disabled while the quota is loading or failed, or `canSubmitRequest` is false. Eligibility precedence is unavailable → pending (duplicate) → quota → eligible. A server 409 always wins.

## 8. Authentication, roles and ownership

| Concern | Contract |
| --- | --- |
| Identity | Session only; any query parameter gets 400 |
| Role | 401 / 403 (Custodian); custodians never load a quota |
| Privacy | Four numeric and boolean fields only; `no-store`; no logging of quota values |
| Isolation | P filters on `borrowerId`. Others can only lower it (checkout auto-decline). |
| Recovery authorization | Unchanged existing contracts: cancel is own-request only; decline is assigned custodian only; checkout is assigned custodian only |

## 9. Persistence and read strategy

- **Source of truth.** P is derived from `BorrowRequest` rows. No counter, cache or column. The `BorrowRequest_borrowerId_idx` index exists.
- **Submission.** The P count runs inside the existing Serializable transaction, after the duplicate read and before the insert. A rejection rolls back.
- **Read endpoint: Repeatable Read is no longer needed (OD-12, proposed).** In r3 the endpoint read two aggregates (P and L) that had to come from one snapshot, so it used a two-query `RepeatableRead` transaction. In r4 the result depends on **one aggregate from one SQL statement**. PostgreSQL evaluates every statement against a single snapshot even at the default Read Committed level, so `SELECT COUNT(*) … WHERE "borrowerId" = $1 AND "status" = 'PENDING'` is internally consistent without an explicit transaction. The read is advisory and may be stale as soon as it returns; staleness is handled by server enforcement and UI refresh, not by isolation. Proposed implementation: one `prisma.borrowRequest.count(...)` call shared with the submission path, which runs it inside its own Serializable transaction.

## 10. Concurrency analysis (L7A-EV05)

| Operation | ΔP for the affected borrower | Isolation | Can break BR-14? |
| --- | ---: | --- | --- |
| Submit | +1 | Serializable, 3 attempts | **Yes, if concurrent for one borrower** |
| Checkout | −1 (request owner) | Serializable, no retry | No |
| Checkout auto-decline (phase 2) | −1 for each competing borrower | same transaction | No |
| Cancel / decline (phase 2) | −1 | Serializable | No |
| Reconcile apply (operator, phase 2) | −k | Serializable / RepeatableRead | No |

**Write skew.** Two same-borrower submissions at P = 1 for **different** assets each read P = 1, each insert, and under Read Committed both commit, giving P = 3. The `(borrowerId, assetId)` partial unique index cannot prevent this because the assets differ. Under Serializable (SSI), each transaction reads the predicate the other's insert satisfies. The resulting read-write cycle forces one abort (40001, Prisma `P2034`). The retry sees the committed row and rejects. Conditions (SDS §5.3.1):

1. Every P-increasing writer is Serializable. Today that is only `createBorrowRequest`.
2. P is read in the same transaction as the insert.
3. Exhaustion gives 409 `CONFLICT` and never a 201 without a commit.
4. False-positive aborts are absorbed by the retry.

Alternatives evaluated in r2 and still rejected: a per-borrower `FOR UPDATE` lock (under SSI it reads the pre-lock snapshot), counters, triggers, advisory locks.

**Loser semantics (unchanged from r2).**
- **Normal:** a retry that sees the committed winner → 409 `BORROWING_QUOTA_EXCEEDED`.
- **Exhaustion:** three aborts → 409 `CONFLICT`, nothing decided or written.

TC08 tests the two deterministically and separately, and always asserts the write count and the final state.

**Interactions** (c or x = 1 if the concurrent operation succeeded; s = 1 if the submission got 201):

| ID | Start | Concurrent | Valid outcomes | Forbidden |
| --- | --- | --- | --- | --- |
| C1 | P = 1 | 2 submissions, distinct assets | Exactly one 201; final P = 2 | Two 201s |
| C2 | P = 0 | 3 submissions | Exactly two 201s; final P = 2 | Three 201s |
| C3 | P = 2, R1 checkable | Submit ∥ checkout R1 | (c, s) ∈ {(1,1), (1,0), (0,0)}; final P = 2 − c + s | s = 1 with c = 0 |
| C4 | P = 1, R1 is the only pending request | Submit ∥ checkout R1 | The submission is 201 (or `CONFLICT`) in either order. Final P = 1 when both succeed. | Submission `BORROWING_QUOTA_EXCEEDED` |
| C5 | P = 2 | Submit ∥ cancel R1 | s = 1 only if x = 1; final P = 2 − x + s | s = 1 with x = 0 |
| C6 | P = 2, R1 on A1; another borrower pending on A1 | Submit ∥ checkout of the other borrower's request (auto-decline of R1) | s = 1 only if the checkout succeeded | s = 1 with c = 0 |
| C7 | P = 2 | Submit ∥ custodian decline R1 | As C5 | As C5 |
| C8 | any | Quota read ∥ writes | One-statement snapshot; may be stale | — |

## 11. Historical data handling

- No row is deleted, closed or rewritten by CR-01.
- A borrower with P ≥ 3 keeps every record, and the quota reports `pendingRequests: P, remainingRequestCapacity: 0`.
- New submissions are rejected until P < 2.
- Checkout, cancel and decline on those records are never quota-checked. Each lowers P.
- Preflight for RG-04 (read-only, not run in this phase):

```sql
SELECT "borrowerId", COUNT(*) AS pending
FROM "BorrowRequest" WHERE "status" = 'PENDING'
GROUP BY "borrowerId" HAVING COUNT(*) >= 2;
```

## 12. Migration justification

None:
1. P comes from existing columns and an existing index.
2. The limit is a constant (OD-02).
3. Activation is an environment variable.

A CR-01 build rolls back to `e5ed70d` with no database action.

## 13. Unaffected behavior

| Area | Preserved | Protected by |
| --- | --- | --- |
| Authentication, sessions, CSRF | as at the baseline | TC-01–TC-03, TC-18 |
| Catalog and availability (pending requests never change `available`) | as at the baseline | TC-04, TC-05 |
| Non-reservation and duplicates (BR-10) | Different borrowers may request the same asset; 409 `DUPLICATE_REQUEST` | TC-21; CR01-TC09, TC10 |
| Error precedence | §7.1 steps 1–8 | CR01-TC09 |
| Checkout (locks, validation, DTO, `LOAN_MAX_DAYS`, conflicts, rollback) | as at the baseline | TC-09, TC-10, TC-19, TC-20 |
| **Active loans and submission** | Loans never block a request (as at the baseline) | **CR01-TC21** |
| Lifecycle (#61) in both phases | as at the baseline | lifecycle suites |
| Ownership (BR-04), readable names (#63), safe errors | as at the baseline | TC-07, TC-11, TC-24 |
| Activation off | Submission identical to `e5ed70d` | CR01-TC19 |

## 14. Regression protection strategy (L7A-EV12)

**Rules.**
- Only fixture isolation or configuration fixtures may change in existing tests. Assertions are not weakened, and each change is listed in the Part B PR.
- Test configuration (proposed): `BORROWING_QUOTA: "enabled"` next to the existing `REQUEST_LIFECYCLE_WRITES: "enabled"` in `server/vitest.config.ts` and `e2e/playwright.config.ts`.
- Recomputed for r4: only P matters, so traces involving loans no longer apply.

### 14.1 Server suites (r4 traces; in-file sequential order, phase-2 default)

| Suite | Shared fixture | First rejection under r4 | Tests that fail as written | Required change |
| --- | --- | --- | --- | --- |
| `borrow-requests.test.ts` | `borrower`, `other` (L40–41) | borrower P = 2 after L77 and L98 → **L106** "allows concurrent submissions by different borrowers…" | L106, L135, L169 | Fresh borrowers in those tests |
| `request-lifecycle.test.ts` | `borrowerA/B` (L62–63) | borrowerB: `unrelated` (L82) stays PENDING, and L202 is left PENDING → P = 2 → **L218** rejected. borrowerA: L161 and L257 are left PENDING → P = 2 → **L267** rejected. | L218, L240 test (L248 `competing`), L265 | Fresh borrowers per test |
| `lifecycle-rollout.test.ts` | `borrowerA/B` (L57) | borrowerB: L89 and L117 kept PENDING (phase 1) → **L128** rejected. borrowerA reaches P = 2 at L182 → **L192** rejected. | L124 (L128, L130), L152 (L155), L190 (L192–193), L226 (L229–230) | Fresh borrowers per test. **Configuration fixture:** every `REQUEST_LIFECYCLE_WRITES=disabled` (L52, L132, L196) pairs with `BORROWING_QUOTA=disabled`, per the coupling rule. |
| `reconcile-competing-requests.test.ts` | `borrowerA/B/C` (L73); `legacyData()` (L50–70) | With the quota on, `legacyData()`'s B submission `f` (L65) is rejected (B has `b`, `d`). With the configuration fixture, B still accumulates PENDING requests per call → **L181** rejected. | L93 (via `legacyData`), L178 | **Configuration fixture** in `legacyData()` (`BORROWING_QUOTA=disabled` with lifecycle disabled), plus fresh borrowers per call |
| `checkout.test.ts` | `borrower` via `fixture()` (L25) | L61 and L73 requests stay PENDING → **L86** `fixture()` rejected | L85, L113, L124, L132, L146, L157, L167, L183 | Fresh borrower per `fixture()`; tests use the returned session |
| `loan-duration.test.ts` | `borrower` via `fixture()` (L36) | L127 `beyond` stays PENDING, and L135's request stays PENDING → **L148** rejected | L147, L158 | Fresh borrower per `fixture()` |
| `auth`, `catalog`, `readable-names`, `availability`, `bootstrap`, `checkout-unit`, `health`, `runtime-config`, `seed-policy`, `spa` | — | none | none | none |

### 14.2 Client suites

**Corrected in r4.1.** r4 said five existing borrower suites need a `/borrowing-quota` mock. That is unnecessary under r4's own activation rule: the client makes **no** quota call unless `features.borrowingQuota` is `true` (FEAT-03 "Borrower UI"). None of the existing client mocks return that feature, so their behavior is unchanged and they need **no** modification. The frontend baseline on 2026-11-26 was 80/80 passing (`artifacts/lab-07/cr-01/frontend-baseline.txt`). `requests.test.tsx` also needs no change provided any new `BorrowRequestForm` quota prop is optional. Quota-enabled client behavior is covered only by the new `client/tests/borrowing-quota.test.tsx`.

### 14.3 Expectation changes

**None.** Every failure above comes from fixture accumulation or the configuration coupling. No existing assertion encodes unlimited pending requests.

### 14.4 E2E

Borrower A reaches P = 2 after spec `02` (laptop pending) and spec `03` (`KL-ACC-001` pending). **Spec `04` test 1 is then blocked**, and specs `05` and `06` are affected the same way. Use dedicated synthetic borrowers in `e2e/support/seed-fixture.mts` for the affected specs. Run with `npm run test:e2e:guarded` and never overwrite the accepted `uat-e01`/`e02`/`e03` evidence. `e2e/README.md` is updated in Part B with the new users and spec.

## 15. Risk assessment

| ID | Risk | Likelihood / impact | Mitigation | Owner (agreed in DC-1 unless marked) |
| --- | --- | --- | --- | --- |
| R-01 (r4) | Lockout if the quota is active while lifecycle writes are disabled (stale PENDING requests cannot be checked out or closed) | High / High if misconfigured | Startup coupling (OD-08); RG-01 before activation; stays off otherwise | DEV4952 |
| R-02 | #83 is not verified in production in time | Medium / High (no deployed changed behavior) | §20.7: the quota stays disabled; disclose; **NOT READY** for activation | Both |
| R-03 | Shared-fixture false regressions | Certain / Medium | §14 fixture list | Test owners per #80/#81/#82 |
| R-04 | SSI false positives → `CONFLICT`, `CHECKOUT_CONFLICT` | Low–Medium / Medium | Retry budget; TC08, TC20 diagnostics | DEV4952 |
| R-05 | A future non-Serializable P-increasing writer | Low / High | SDS §5.3.1 rule 1; review | Reviewer |
| R-06 | Stale UI capacity after another user's action | Medium / Low | Refresh triggers; server authoritative | yiiipunn |
| R-07 | Cross-user leak | Low / High | Session identity, 400 on query parameters, `no-store`, epoch-guarded state | Both |
| R-08 | A quota check added to checkout or lifecycle | Low / High | Non-goal; TC05, TC13, TC14 | Reviewer |
| R-09 | Deployment blocked by `LAB5_DEPLOY_ENABLED=false` or approval rules | Medium / High | §20.5: authorization step; yiiipunn merges so that DEV4952 can approve | Both (PENDING) |
| R-10 | Phase 2 → 1 rollback while the quota is on | Medium / High | Startup refusal (fail safe); disable both in one deploy | DEV4952 |
| R-11 | Enabling phase 2 removes pre-lifecycle rollback targets once lifecycle rows exist | Certain once enabled / Medium | `infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md` | DEV4952 |
| R-12 | E2E fixture changes alter accepted evidence | Medium / Medium | Guarded runner, new users only | yiiipunn |
| R-13 | Phase 2 also enables checkout auto-decline in production, a visible behavior change outside CR-01 | Certain / Low–Medium | This is existing #61 behavior; verified under #83 and disclosed in the release record | DEV4952 |

## 16. Team decision register (L7A-EV10)

**Rule.** An item is **AGREED** only when both developers have confirmed it in linked, dated GitHub comments. Times are ICT; UTC is in brackets.

**Discussion record.**
- **D1:** DEV4952, PR #79 [comment 7194003912](https://github.com/gearstack-studio/kitloop/pull/79#issuecomment-7194003912), 2026-11-26 20:54 (13:54:31Z). DC-1 preference for K2a, provided cancel and decline can be enabled and verified in production within the Lab 7 timeline. Proposes the ownership split.
- **D2:** yiiipunn, PR #79 [comment 7194104131](https://github.com/gearstack-studio/kitloop/pull/79#issuecomment-7194104131), 20:58 (13:58:49Z). "I agree with K2a and the proposed division of responsibilities." Proposes the deployment procedure.
- **D3:** yiiipunn, Issue #78 [comment 7195306742](https://github.com/gearstack-studio/kitloop/issues/78#issuecomment-7195306742), 21:46 (14:46:27Z). Proposes the final resolutions for OD-02–OD-08 and OD-11b, asks for confirmation of OD-12 and the revised acceptance criteria, and proposes OD-13.
- **D4:** DEV4952, Issue #78 [comment 7195363924](https://github.com/gearstack-studio/kitloop/issues/78#issuecomment-7195363924), **21:48 (14:48:42Z)**: "I agree with OD-02 through OD-08, OD-11b, OD-12, and the revised acceptance criteria in the merged r4 contract … I'll own backend RED/GREEN in #80 and #81 … For OD-13, I agree with using the existing GitHub Actions pipeline, with you merging the release PR and me approving the production deployment. Let's record explicit team authorization before enabling LAB5_DEPLOY_ENABLED and verify lifecycle recovery in #83 before activating the quota."
- **Contract approval:** DEV4952 APPROVED PR #79 at 21:22 (14:22:56Z) and merged it at 21:25 (`7519274`).

### 16.1 Agreed (both developers)

| ID | Decision | Date (ICT) | Participants | Reference | Status |
| --- | --- | --- | --- | --- | --- |
| OD-10 / DC-1 | **K2a**: at most 2 pending requests per borrower; active loans not counted; combined limit deferred. **Condition:** cancel and decline enabled and verified in production (#83) before activation. | 2026-11-26 20:54 / 20:58 | DEV4952, yiiipunn | D1, D2 | **AGREED (conditional)** |
| OD-09 (r4) | FR-12 stays in #84 and is not a CR-01 prerequisite; lifecycle activation is tracked in #83 | 20:54 / 20:58 | both | D1, D2 | **AGREED** |
| OD-11a | DEV4952: quota backend, lifecycle activation (#83), deployment. yiiipunn: quota UI, production behavior verification. Both: regression and release evidence review. | 20:54 / 20:58 | both | D1, D2 | **AGREED** |
| OD-11b | **RED/GREEN ownership:** DEV4952 owns backend RED/GREEN (#80, #81); yiiipunn owns frontend RED/GREEN (#80, #82); evidence reviewed together. yiiipunn owns the engineering contract. This supersedes the "RED tests: yiiipunn" row in the original Issue #78 §12 plan. | 21:46 / **21:48** | both | D3, D4 | **AGREED** |
| OD-02 | Fixed maximum of 2 pending requests (constant) | 21:46 / 21:48 | both | D3, D4 | **AGREED** |
| OD-03 | Preserve `CONFLICT` on serialization retry exhaustion | 21:46 / 21:48 | both | D3, D4 | **AGREED** |
| OD-04 | No quota figures in the 409 body | 21:46 / 21:48 | both | D3, D4 | **AGREED** |
| OD-05 | Reject any query parameter on the quota GET with 400 `VALIDATION_ERROR` | 21:46 / 21:48 | both | D3, D4 | **AGREED** |
| OD-06 | Dedicated borrower-only `GET /api/borrowing-quota` with the four-field r4 response (§7.3) | 21:46 / 21:48 | both | D3, D4 | **AGREED** |
| OD-07 | "Borrowing limit" panel on `/requests`, plus quota-aware catalog eligibility | 21:46 / 21:48 | both | D3, D4 | **AGREED** |
| OD-08 | `BORROWING_QUOTA` off by default; startup coupling to `REQUEST_LIFECYCLE_WRITES=enabled`; activation only after verified lifecycle recovery | 21:46 / 21:48 | both | D3, D4 | **AGREED** |
| OD-12 | A single aggregate count of the authenticated borrower's pending requests for the quota read (§9); no `RepeatableRead` transaction | 21:48 | both (D4 confirms D3's request) | D3, D4 | **AGREED** |
| Acceptance criteria | The revised r4 criteria as merged, AC01–AC03, AC05–AC14 and AC16–AC21 (including AC13, AC14 and AC16–AC21, which r4 listed as proposed) | 21:46 / 21:48 | both | D3, D4 | **AGREED** |
| OD-13 | **Deployment procedure:** the existing reviewed GitHub Actions pipeline (§20.5). yiiipunn merges the release PR; DEV4952 approves the `lab5-production` deployment. | 21:46 / 21:48 | both | D3, D4 | **AGREED (procedure only)** |

### 16.2 Still pending

| Item | Required before | Status |
| --- | --- | --- |
| **Explicit team authorization to set `LAB5_DEPLOY_ENABLED=true`** (D4: "Let's record explicit team authorization before enabling") | Any production deployment (§20.5 D0) | **PENDING** |
| Lifecycle recovery verified in production (#83, RG-01) | Quota activation (RG-05) | **PENDING** |
| Activation decision (RG-05.E1) | Setting `KITLOOP_BORROWING_QUOTA=enabled` | **PENDING** |
| Instructor announcement URL and publication date | Part A evidence completeness | **PENDING SOURCE EVIDENCE** |

### 16.3 Done, superseded or deferred

| ID | Disposition |
| --- | --- |
| Issue edits (#78, #80–#85) | **DONE**: applied on 2026-11-26 at 21:21 ICT under yiiipunn's authorization |
| OD-01 (activation after both dependencies) | **SUPERSEDED** by OD-10 |
| OD-02 (limits 2 and 3), OD-06 (seven-field DTO), OD-08 (FR-12 gate), OD-09 (DEP-RT issue) | **REVISED** into the agreed r4 rows above |
| AC04 (combined-limit rejection) | **SUPERSEDED**; replaced by AC21 |
| AC15 (recovery by return) | **DEFERRED** with the combined limit (§21) |

## 17. Documentation inconsistencies found (not corrected by CR-01)

These are unchanged from r3. They are recorded and not fixed here:
1. SDS §4 status enum (lacks the #61 statuses).
2. SDS §1 baseline is stale.
3. SDS §3 omits the cancel, decline, version and ready routes.
4. SRS OQ-03 treats cancel and close as unresolved, although they are implemented.
5. FEAT-04 lacks the phase-2 auto-decline.
6. The FEAT-03 and FEAT-04 headers still say "merge pending".
7. FEAT-03 does not name the `CONFLICT` code.
8. Body-parser errors precede 401, which the docs do not state.
9. The RTM says "planned".
10. FR-08–FR-10 are marked Sprint 2 but were delivered in Sprint 1.
11. Test configuration (phase 2) differs from production (phase 1).
12. The `plan.md` counts are historical.
13. FEAT-02 §4 omits the "pending" control state.

New in r4:

14. Issue #78 and issues #80–#85 still describe the combined quota or the FR-12 gate (revisions prepared, §18).
15. The `REQUEST-LIFECYCLE-ROLLOUT.md` phase-2 step says to redeploy "the same SHA", but `deploy.yml` has no manual trigger. In the pipeline that requires the next push to `main`; otherwise use manual `release.sh` (§20.5).

## 18. Other affected documents and issues

| Item | r4 action |
| --- | --- |
| `docs/feature-inventory.md`, `docs/sprints/plan.md` | Updated: the FR-12 dependency is removed |
| `FEAT-02` §4 note | Reviewed. Still correct for K2a ("no remaining request capacity"); no change. |
| `e2e/README.md`, `infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md` | Not updated in this phase. They are revised in Part B with the spec and the activation plumbing. |
| Issues #78, #80, #81, #82, #83, #84, #85 | Revised titles and bodies are **prepared, not applied**. Issue edits need explicit authorization. #86 needs no change. |
| `artifacts/**` | Never edited |

## 19. Review and agreement record (L7A-EV09)

| Event | Person | Date (ICT) | Reference |
| --- | --- | --- | --- |
| r2 committed; PR #79 opened | yiiipunn | 2026-11-26 20:06 | `e1def2a`, PR #79 |
| Review requested | yiiipunn | 20:09 | [7192959503](https://github.com/gearstack-studio/kitloop/pull/79#issuecomment-7192959503) |
| r2 review feedback (approval withheld) | DEV4952 | 20:25 | [7193331525](https://github.com/gearstack-studio/kitloop/pull/79#issuecomment-7193331525) |
| Proposed decisions | yiiipunn | 20:28 | [7193398804](https://github.com/gearstack-studio/kitloop/pull/79#issuecomment-7193398804) |
| r3 response; DC-1 options requested | yiiipunn | 20:43 | [7193749481](https://github.com/gearstack-studio/kitloop/pull/79#issuecomment-7193749481); r3 commit `03bb7c7` |
| DC-1 preference K2a (conditional) and ownership proposal | DEV4952 | 20:54 | D1 |
| DC-1 agreement and deployment procedure proposal | yiiipunn | 20:58 | D2 |
| r4 revision | yiiipunn | uncommitted | this document |
| r4 committed and published; issues realigned; final review requested | yiiipunn | 21:20–21:22 | `37a4420`; [comment 7194726604](https://github.com/gearstack-studio/kitloop/pull/79#issuecomment-7194726604) |
| **PR #79 approved** | DEV4952 | 21:22 (14:22:56Z) | Review on `37a4420`. It asked for the remaining decisions and OD-13 to be recorded. |
| PR #79 merged | DEV4952 | 21:25 | merge `7519274` |
| Final decisions proposed | yiiipunn | 21:46 | D3 |
| **Final decisions confirmed** | DEV4952 | **21:48** | D4 |
| Decision record r4.1 (this update) | yiiipunn | uncommitted at preparation | follow-up PR |

## 20. Recovery, activation and release (L7A-EV11, L7A-EV13, L7A-EV14)

### 20.1 Recovery paths (r4)

| Path | ΔP | Exists at `e5ed70d` | Available in production today | Verified by |
| --- | ---: | --- | --- | --- |
| Checkout (assigned custodian) | −1 | Yes | Yes | TC05, RG-05.E7 |
| Borrower cancel | −1 | Yes (#61) | **No** (phase 1) | TC13; #83; RG-05.E5 |
| Custodian decline | −1 | Yes | **No** | TC14; #83; RG-05.E6 |
| Checkout auto-decline | −1 per competitor | Yes | **No** | TC14-S2; #83 |
| Reconcile apply (operator) | −k | Yes | **No** | #83 |

Under phase 2 every blocked borrower (P ≥ 2) can always recover by cancelling their own request, so **no lockout state exists**. Under phase 1, stale requests can block a borrower permanently, which is why activation is coupled to lifecycle writes.

### 20.2 Controlled activation contract (OD-08, proposed)

| Aspect | Contract |
| --- | --- |
| Server setting | `BORROWING_QUOTA` = `disabled` (default) \| `enabled`; any other value is a startup `ConfigurationError` |
| Coupling | `runtimeConfig` refuses `enabled` unless `REQUEST_LIFECYCLE_WRITES=enabled` |
| Deploy variable | `KITLOOP_BORROWING_QUOTA` in `lab5-production` (proposed; **does not exist yet**). It needs `deploy.yml` env, a `common.sh` validation and the `release.sh` L247 `--set-env-vars` entry (#81 / #85). |
| Off | Submission identical to `e5ed70d`; GET → 404 `BORROWING_QUOTA_DISABLED`; `features.borrowingQuota: false`; no client call or panel |
| On | Full BR-14 r4 |

### 20.3 Release gates (r4)

| Gate | r4 definition | Executor / verifier (DC-1) | Status |
| --- | --- | --- | --- |
| RG-01 | **DEP-LC (#83):** a phase-2 revision is serving with `REQUEST_LIFECYCLE_WRITES=enabled`. Borrower cancel and custodian decline are verified on synthetic records, with before and after state. Unauthorized and out-of-scope attempts leave state unchanged. Reconcile dry-run and apply JSON are retained (rerun shows `staleOnActiveLoan: 0`). Rollback steps are recorded. | DEV4952 / yiiipunn | PENDING |
| RG-02 | **NOT APPLICABLE to r4 (DEFERRED).** The r3 FR-12 return gate (RG-02.E1–E10) is no longer a CR-01 prerequisite. It is offered to #84 as recommended evidence (§21). | — | N/A |
| RG-03 | Active r4 CR01 tests (STS §5) GREEN on the release SHA, with the same assertions as RED. Relevant server, client and selected E2E regressions pass. CI "Build, test and Docker smoke" passes on the release SHA. 0 failed; every skip justified. | Both | PENDING |
| RG-04 | §11 preflight (P ≥ 2) run on production; output recorded (borrower UUIDs only) | DEV4952 / yiiipunn | PENDING |
| RG-05 | Activation and production verification per §20.4 (RG-05.E1–E11) | DEV4952 deploys / yiiipunn verifies | PENDING |

Only a fully met RG-05 counts as deployed verification of the changed behavior. A deployment with the quota disabled never does.

### 20.4 RG-05 evidence specification

The dated record goes in `artifacts/lab-07/cr-01/rg-05-activation-verification.md` (proposed). It uses only authorized synthetic accounts and assets, listed by ID; how they are provisioned in production is agreed under OD-13.

| Item | Pass condition |
| --- | --- |
| E1 | Dated activation decision by **both** developers, citing the RG-01, RG-03 and RG-04 records, plus the dated `LAB5_DEPLOY_ENABLED` authorization (§16.2) |
| E2 | `GET /api/version` equals the release SHA. The Cloud Run revision name and deploy run ID are recorded. The serving revision env shows `BORROWING_QUOTA=enabled` and `REQUEST_LIFECYCLE_WRITES=enabled`. |
| E3 | Quota GET: borrower → 200 with the four-field DTO and `no-store`; custodian → 403; any query parameter → 400; values match the borrower's PENDING records |
| E4 | Enforcement: a synthetic borrower at P = 2 gets 409 `BORROWING_QUOTA_EXCEEDED`, with no new row |
| E5 | Recovery by cancel: cancel one → P = 1, remaining 1 → a valid request gets 201 |
| E6 | Recovery by decline: the assigned custodian declines one → P − 1 → a valid request gets 201 |
| E7 | Recovery by checkout: checkout of one pending request → 201; P − 1 → a valid request gets 201 |
| E8 | A borrower with at least 1 active loan and P < 2 can submit a valid request (201): loans do not count |
| E9 | Preserved behavior: duplicate → 409 `DUPLICATE_REQUEST`; unavailable asset → 409 `ASSET_UNAVAILABLE`; custodian POST → 403; foreign request ID → 404; two borrowers can both request one available asset |
| E10 | UI: the panel shows pending count, limit and remaining capacity matching the GET; Submit and catalog controls are disabled at the limit and re-enabled after recovery (dated screenshots of synthetic accounts) |
| E11 | Dated record: ICT times, revision, operator, verifier, record IDs, a result per item; deviations recorded |

### 20.5 Deployment procedure (OD-13 agreed 2026-11-26 21:48 ICT; flag authorization pending)

These are the existing reviewed controls, verified on 2026-11-26 (§1). This document changes none of them.

| Step | Action | Who (proposed) | Verification |
| ---: | --- | --- | --- |
| D0 | Procedure **agreed** (OD-13, D4). **Still required:** an explicit, dated team authorization to set the repository variable `LAB5_DEPLOY_ENABLED=true` for the release window, recorded before the change | Both | Dated GitHub comment (**PENDING**) |
| D1 | Verify the configuration before each release: `gh variable list` (repository) and `gh variable list --env lab5-production`. Expect `LAB5_DEPLOY_ENABLED`, `KITLOOP_REQUEST_LIFECYCLE_WRITES`, `KITLOOP_BORROWING_QUOTA` (absent = disabled) and `KITLOOP_LOAN_MAX_DAYS` (unset) at their intended values. | DEV4952 | Output in the release record |
| D2 | Release PR `sprint-1-staging` → `main`: one approving review and the required check "Build, test and Docker smoke" | Both | PR link |
| D3 | **yiiipunn merges** the release PR. `lab5-production` requires DEV4952's approval with `prevent_self_review`, so a run triggered by DEV4952's own merge could not be approved. | yiiipunn | Merge commit |
| D4 | DEV4952 approves the `lab5-production` deployment. The workflow runs build, migrate, `release.sh deploy`, verify, and rolls back automatically on failure. | DEV4952 | Run ID |
| D5 | Verify the deployed version: `GET /api/version` = merge SHA; record the Cloud Run revision | yiiipunn | Release record |

**Activation sequence** (each configuration change takes effect only at the next deploy):
1. **Release 1** (#81, #82 merged): CR-01 code with the quota **disabled** and lifecycle disabled. Verify baseline behavior and that the GET returns 404 `BORROWING_QUOTA_DISABLED`.
2. **#83 lifecycle activation:** set `KITLOOP_REQUEST_LIFECYCLE_WRITES=enabled`; redeploy (see below); RG-01. This step needs no CR-01 code and can also be done earlier on `e5ed70d`.
3. **RG-03, RG-04.**
4. **Quota activation:** after RG-05.E1, set `KITLOOP_BORROWING_QUOTA=enabled`; redeploy; RG-05.

**Redeploying a configuration-only change.** `deploy.yml` triggers only on a push to `main`, so a configuration-only change needs one of:
- (a) the next reviewed merge to `main` (D2–D5); or
- (b) the documented manual path `KITLOOP_REQUEST_LIFECYCLE_WRITES=enabled bash infra/gcp/release.sh deploy <SHA>` (`infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md` Phase 2; `infra/gcp/README.md` runbook), run by DEV4952 with recorded output.

Choosing between (a) and (b) is part of OD-13.

### 20.6 Rollback

| Situation | Action | Result |
| --- | --- | --- |
| Quota problem | Set `KITLOOP_BORROWING_QUOTA=disabled`; redeploy the same SHA (§20.5 a or b), or `release.sh rollback <pre-activation revision>` | Enforcement off; no data change (the quota writes nothing) |
| Lifecycle (phase 2) problem | Disable **both** in the same deploy. Disabling only lifecycle makes the new revision fail startup, and traffic stays on the current revision (fail safe). | Phase 1 with the quota off. Lifecycle rows remain (R-11). |
| CR-01 code defect | `release.sh rollback <previous revision>` | No migration involved |
| Failed release | Automatic `release.sh rollback` in `deploy.yml` | Previous revision serving |

### 20.7 Contingency outcome (DC-1)

K2a was chosen on the condition in OD-10. **If #83 cannot be enabled and verified safely in production within the Lab 7 timeline:**
- The quota is not activated.
- RG-01 and RG-05 are reported as unmet, with the reason.
- Part B's deployed changed-behavior verification is reported as **not passed**.
- CR-01 is reported as verified in CI and test environments only.
- Part D declares the activated CR-01 **NOT READY**.

r4 estimated effort is about 3–5.5 person-days, versus about 6.5–11 for the superseded K1.

## 21. Superseded and deferred record (r1–r3)

These items were active proposals in r1–r3 and are **not active requirements in r4**. The full text remains in commits `e1def2a` (r2) and `03bb7c7` (r3).

| Superseded or deferred item | Former content | r4 status |
| --- | --- | --- |
| Combined limit | "A new otherwise-valid request is permitted only when P < 2 **and** P + L < 3"; capacity `max(0, min(2 − P, 3 − P − L))` (Issue #78 §4; r1–r3 BR-14) | **DEFERRED** until FR-12 return exists (#84); would need a new CR |
| Quota DTO fields | `activeLoans`, `combinedUsage`, `maxCombinedUsage` | **REMOVED** |
| Read strategy | Two-query `RepeatableRead` snapshot | **SUPERSEDED** by a one-statement count (OD-12) |
| "Quota-neutral checkout" invariant (P − 1, L + 1) | FEAT-04 r1–r3 | **SUPERSEDED**: checkout now reduces usage |
| Recovery through return; return-dependent tests (TC15, TC16b, TC17 return rows, TC20-S4) | r2–r3 | **DEFERRED** |
| RG-02 (FR-12 production evidence, E1–E10) | r3 §20.10 | **N/A to r4.** Recommended to #84 as its own release evidence. |
| Lockout analysis for L ≥ 3 | r2–r3 §20.2 | **N/A** (loans no longer count) |
| Options K1, K2b, K3 | r3 §20.12 | K2a chosen. K3's disclosure rule is kept as the §20.7 fallback. |

## 22. Reviewer-feedback resolution (PR #79) (L7A-EV16)

| Review Finding | Requested Change | Revised Document / Section | Resolution Status | Evidence |
|---|---|---|---|---|
| F1 (r2 review, 20:25). Activation plan, FR-12 verifier, RG-02 evidence | Confirm the plan and evidence | r3 §20.6–§20.11. **r4: FR-12 removed from CR-01 (OD-09 agreed); RG-02 N/A; RG-05 respecified (§20.4); deployment procedure §20.5** | Resolved by the DC-1 scope change; deployment procedure PENDING | D1, D2 |
| F2 (20:25). Part B contingency if FR-12 is late | Record how Part B is addressed | r3 §20.12 → **DC-1 chose K2a**; fallback §20.7 | **Decided (conditional)** | D1, D2 |
| F3 (20:25). Instructor announcement link | Add URL and date | "Approval basis" | **PENDING SOURCE EVIDENCE** | — |
| F4 (20:25). Dated decisions OD-01–OD-09, AC13–AC20 | Dated register | §16 (confirmed, proposed, superseded); AC classification | Partly agreed (OD-10, OD-09, OD-11a); the rest PROPOSED | D1, D2 |
| F5 (DC-1, 20:54). Record the dated decision; update #78, BR-14, AC, STS, #80 RED scope and the release checks to the pending-only policy; confirm the deployment procedure | r4 | §16, SRS BR-14, AC, STS, RTM, §20.3–§20.5; issue texts prepared (§18) | **Contract updated (r4).** Issue edits applied at 21:21 ICT; OD-13 agreed at 21:48 (§16). | `37a4420` |
| F6 (PR #79 approval, 21:22). Record the outcome of the remaining technical decisions; close OD-13 by confirming who authorizes the deployment flag change and who runs the workflow | Dated register | §16 (r4.1) | **Resolved.** All agreed at 21:48. The `LAB5_DEPLOY_ENABLED` authorization itself remains a separate pending record, as D4 requires. | D3, D4 |

## 23. Revision history

| Revision | Change | Status |
| --- | --- | --- |
| r1 | Initial combined-quota contract (uncommitted) | Superseded |
| r2 (`e1def2a`) | Recovery dependencies, controlled activation, AC13–AC20, TC13–TC20, fixture analysis | Superseded |
| r3 (`03bb7c7`) | Activation plan, RG-02 and RG-05 evidence, contingency K1–K3, decision register | Superseded |
| **r4 (draft)** | **DC-1 K2a:** pending-only BR-14, four-field DTO, one-statement read, checkout reduces P, lifecycle-only dependency, recomputed fixtures, revised gates (RG-02 N/A), deployment procedure, decision register with the actual DC-1 record, AC and TC classification, prepared issue revisions | Approved and merged (`7519274`) |
| **r4.1 (decision record)** | Records the 21:48 ICT agreements (OD-02–OD-08, OD-11b, OD-12, OD-13, revised AC). Corrects the client-mock assumption (§14.2) and the TC19 client classification. No scope or requirement change. | **Proposed; review PENDING** |
