# FEAT-03 Borrow Request Workflow

Status: Implementation candidate; teammate review and PR merge pending.

Baseline: `sprint-1-staging` commit `6524ef8`, 2026-11-03. Branch: `feature/borrow-request-workflow`.

F-04 compatibility update: the checkout result now uses request status `CHECKED_OUT` (formerly `FULFILLED`). Apply all current migrations and regenerate Prisma before starting the API; see [FEAT-04](FEAT-04-custodian-checkout.md). Historical F-03 evidence describes the earlier label.

CR-01 proposed revision (Lab 7, contract r1, draft): the sections below up to "CR-01 revision" are the historical Sprint 1 contract and are unchanged. The proposed borrowing-quota contract is the [CR-01 revision](#cr-01-revision-borrowing-quota-proposed) at the end of this document. Its status is **PENDING** team agreement and DEV4952 review.

## Scope and duplicate policy

Implements F-03 / FEAT-03: FR-06, FR-07, and scoped queue FR-08, integrated with the existing FR-09/FR-10 checkout. BR-03, BR-04, BR-05, BR-06, BR-10, and availability constraints apply. Return, approval, cancellation, and request expiration are outside this change.

Interpret “duplicate active requests” as repeated `PENDING` requests by the **same borrower for the same physical Asset ID**. Different borrowers may still compete through pending requests as required by BR-10; a request never reserves equipment. At most one active loan exists per Asset ID through the existing database constraint. No borrower can submit a new request for an asset with an active loan, even if the client catalog is stale. This refinement is reflected in BR-10, the SDS request workflow, and RTM TC-21 and requires teammate review. A global one-pending-request-per-asset rule would change the reservation policy and is not implemented.

## API and persistence

| Endpoint | Behavior |
| --- | --- |
| POST `/api/requests` | Borrower + valid session, trusted origin, CSRF token. Accepts only `{ assetId }`; rejects supplied status/borrower/other fields. Creates one persisted pending request with server identity/time. |
| GET `/api/requests/mine` | Borrower only; newest first with stable ID tie-breaker. Own history includes status, submission time, and asset ID/name/category. |
| GET `/api/requests/pending` | Custodian only; oldest first, scoped through CustodianAsset. Includes asset details and necessary requester ID/username. |
| GET `/api/requests/:id` | Own borrower record or scoped custodian record; inaccessible IDs return generic 404. |
| POST `/api/requests/:id/checkout` | Custodian-only transaction changes the matching pending request to `CHECKED_OUT` and creates a loan atomically using the shared availability definition. |

Unknown or malformed Asset IDs produce 404 or 400 respectively. Retired/checked-out equipment produces 409 `ASSET_UNAVAILABLE`; duplicate pending request produces 409 `DUPLICATE_REQUEST`. Input failures include an `assetId` field message. Missing authentication returns 401; wrong role or invalid CSRF returns 403. Unexpected failures return sanitized 500. Protected domain responses use `Cache-Control: no-store`. There is no endpoint allowing a borrower to approve or mutate request status.

Submission uses a serializable PostgreSQL transaction and at most three attempts on serialization conflicts. Every retry rechecks availability and duplicates. Exhausted contention returns a safe 409 and asks the user to refresh. The new partial unique index independently enforces one pending request per borrower/asset. Requests from different borrowers do not conflict under that index. Checkout retains the existing unique active-loan constraint and transaction rollback; no loan or availability field is written during submission.

### Migration deployment

Apply migrations with `npm run db:deploy` before running the new API. The migration intentionally fails if historical same-borrower duplicates exist; it never deletes or rewrites request history. Check for duplicates first:

```sql
SELECT "borrowerId", "assetId", COUNT(*)
FROM "BorrowRequest"
WHERE "status" = 'PENDING'
GROUP BY "borrowerId", "assetId"
HAVING COUNT(*) > 1;
```

If rows exist, have the inventory owner/team decide how to reconcile them before deployment. This feature does not invent a cancellation status to conceal duplicate history. Back up the target data and resolve any failed migration using the team's migration procedure after correcting its cause. The development seed and existing databases were not modified during verification; tests use an isolated synthetic database.

## Borrower and custodian UI

- Catalog request controls select the specific equipment and open `/requests`.
- The protected My Requests page provides an accessible selection form; only available equipment without the borrower's pending request can be selected. Loading or failed catalog/history reads disable submission.
- Requests show equipment name/ID, server status, and submission time. Loading, empty, failure/retry, and success messages are distinct.
- Successful submission refreshes catalog/history; 409 refreshes stale state and shows the server conflict message. A successful mutation followed by failed refresh explicitly reports that the action succeeded, preventing a misleading retry of the write.
- A 401 ends the client session and removes private state. Custodians use the existing scoped pending queue and due-date checkout controls; borrowers receive no checkout or status-edit controls.

## Automated verification

Server: `npm test` and `npm run build` from `server/`. Configure an isolated PostgreSQL test database through ignored `.env.test`, as described in the root README; apply all current migrations to it before running tests. Test fixtures are synthetic and cleaned up afterward. The rollback test installs and removes a temporary trigger on the isolated test database to force a failure between the request status change and loan creation.

Client: `npm ci`, `npm test`, `npm run build`, and `npm run lint` from `client/`. UI tests run in jsdom using React Testing Library. The app-level tests mock HTTP responses; they do not establish live-browser end-to-end integration.

| Coverage | Test location |
| --- | --- |
| Payload validation unit cases | `server/tests/borrow-requests.test.ts` |
| Persisted pending request, own history, no reservation, different borrowers | `server/tests/borrow-requests.test.ts` |
| Concurrent duplicate submissions and independent unique constraint | `server/tests/borrow-requests.test.ts` |
| Missing/retired/checked-out assets, malformed input, forged status/owner | `server/tests/borrow-requests.test.ts` |
| Authentication, CSRF, wrong role, foreign IDs and scoped queue | `server/tests/borrow-requests.test.ts` plus existing `auth.test.ts` |
| Checkout status/history/queue changes, duplicate loan rejection, rollback | `server/tests/borrow-requests.test.ts` plus existing checkout regression tests |
| Form selection, pending exclusion, disabled states, history, retry | `client/tests/requests.test.tsx` |
| Submit and refresh, 409 recovery, expired session, failed refresh after success, fresh-page history | `client/tests/borrow-workflow.test.tsx` |

Reviewers must verify this duplicate interpretation and migration preflight, run the documented commands, and exercise the borrower submit → custodian queue/checkout → borrower `CHECKED_OUT` history path in a live browser. Human review, live-browser evidence, and reviewed PR merge remain pending; automated results do not complete these gates.

## CR-01 revision: borrowing quota (proposed)

| Item | Value |
| --- | --- |
| Revision | CR-01 contract r2 (draft); base `e5ed70d` (accepted Sprint 1, PR #77). r2 adds controlled activation, a strict query rule, refresh triggers and recovery dependencies. |
| Change request | [Issue #78](https://github.com/gearstack-studio/kitloop/issues/78) |
| Requirements | FR-06 and FR-07 (CR-01 amendments), BR-10 (unchanged, cross-referenced), **BR-14** (proposed) |
| Companion documents | [Impact analysis](../../labs/lab-07/CR-01-impact-analysis.md) · [Acceptance criteria](../../labs/lab-07/CR-01-acceptance-criteria.md) · [STS](../../labs/lab-07/CR-01-STS.md) |
| Status | **Proposed. Not implemented. Team agreement and DEV4952 review PENDING.** |

### Policy

P is the borrower's `PENDING` requests and L is the borrower's loans with `returnedAt IS NULL`. A new otherwise-valid request is accepted only when **P < 2 and P + L < 3**. Remaining capacity is `max(0, min(2 − P, 3 − P − L))`. Terminal requests (`CHECKED_OUT`, `DECLINED`, `CANCELLED`, `EXPIRED`) and returned loans do not count. Existing records over a limit are kept unchanged, and that borrower's new submissions are rejected until both conditions hold. The duplicate policy above (one PENDING request per borrower and Asset ID) and non-reservation are unchanged.

### API changes

| Endpoint | Baseline | CR-01 r2 |
| --- | --- | --- |
| POST `/api/requests` | 201, or the errors listed above | Same, plus **409 `BORROWING_QUOTA_EXCEEDED`** when BR-14 fails. Same envelope `{ error: { code, message } }` without `fields`, and no writes. The 201 DTO is unchanged. |
| GET `/api/borrowing-quota` | *(none)* | **New.** Borrower only. Evaluation order: 401 without a session; 403 `FORBIDDEN` for a Custodian; 404 `BORROWING_QUOTA_DISABLED` while activation is off; **400 `VALIDATION_ERROR` with `fields.query` for any query parameter** (OD-05); otherwise 200 with `Cache-Control: no-store` and `Content-Type: application/json`, body below. Identity always comes from the session. |
| GET `/api/requests/mine`, `/api/requests/pending`, `/api/requests/:id`, checkout | — | Unchanged |

```json
{
  "pendingRequests": 1,
  "activeLoans": 2,
  "combinedUsage": 3,
  "maxPendingRequests": 2,
  "maxCombinedUsage": 3,
  "remainingRequestCapacity": 0,
  "canSubmitRequest": false
}
```

The quota body contains no identifiers. Fields are always integers and a boolean. `combinedUsage` and the counts are reported as stored and are **not** clamped, so an over-limit borrower may see `combinedUsage: 5`. `remainingRequestCapacity` is clamped at 0.

### Error precedence for POST `/api/requests`

1. 400 `INVALID_JSON` or 413 `PAYLOAD_TOO_LARGE` (app-wide body parser)
2. 401 `UNAUTHENTICATED`
3. 403 `FORBIDDEN` (role)
4. 403 `FORBIDDEN_ORIGIN` or `INVALID_CSRF`
5. 400 `VALIDATION_ERROR` (`fields.assetId`)
6. 404 `NOT_FOUND`
7. 409 `ASSET_UNAVAILABLE`
8. 409 `DUPLICATE_REQUEST`
9. **409 `BORROWING_QUOTA_EXCEEDED`**
10. 201

Retry exhaustion stays 409 `CONFLICT`. Steps 1–8 and their codes are unchanged from the baseline. Step 9 runs only while activation is on. A loser that observed the committed winner receives `BORROWING_QUOTA_EXCEEDED`. `CONFLICT` means all three attempts aborted and nothing was decided or written.

### Transaction

The quota counts run inside the existing Serializable submission transaction, after the duplicate read and before the insert. The existing three-attempt retry on serialization failure rechecks availability, duplicates **and** quota. PostgreSQL SSI aborts one of two concurrent same-borrower submissions that would together exceed a limit (write skew). The retried attempt then sees the committed row and is rejected. No migration, counter column, trigger or extra lock is added (see [impact analysis §10](../../labs/lab-07/CR-01-impact-analysis.md#10-concurrency-analysis-l7a-ev05)). Checkout (FEAT-04) is unchanged and quota-neutral.

### Borrower UI

- **Quota panel** on `/requests` (proposed component in `client/src/components/Requests.tsx`). It shows "N of 2 pending requests", "N of 3 pending requests and active loans" and the remaining capacity, using the server's `max*` values. At or above a limit it states which limit is reached and how capacity returns. For the pending limit alone (P = 2, L = 0), a custodian checking out one of the requests frees a slot. For the combined limit, a loan must be returned or a pending request closed (cancel or decline, only where lifecycle actions are enabled).
- **Eligibility** (`client/src/borrowEligibility.ts`) gains a `quota` state with precedence `unavailable` → `pending` → `quota` → `eligible`. The request form and the catalog "Request to borrow" buttons are disabled in the `quota` state with an accessible reason.
- **Loading and error.** Submission is disabled while the quota is loading or failed, matching the existing rule for catalog and history reads. A failed read shows an alert with Retry.
- **Refresh.** The quota is re-read, with the catalog, requests and loans, at these points:
  1. After sign-in or session restore, only for a borrower with `features.borrowingQuota: true`.
  2. Each time `/requests` is entered.
  3. After every successful mutation: submit, cancel, and any action shown on the borrower page.
  4. After **any** 409, including `BORROWING_QUOTA_EXCEEDED`. The server message is shown and no success notice appears.
  5. When the panel's **Refresh** button is pressed.

  There is no polling. Recovery done by another user (custodian decline, or return once it exists) appears at the next trigger. Each read carries a session epoch and a read sequence number, as `loadRequests` does, so a response from an earlier session or an older read is discarded. If the quota re-read fails after a successful mutation, the UI says the action succeeded but the limits could not be refreshed, and keeps Submit disabled until Retry succeeds.
- **Session.** A 401 on the quota read or the submission ends the session through the existing `endSession` path, which also clears quota state. Responses from an earlier session epoch are ignored. Custodians never load or see a quota. With `features.borrowingQuota: false` (or the flag absent) the client makes no quota call, shows no panel, and applies only the pre-CR-01 eligibility rules.

### Verification mapping

| Coverage | CR-01 case | Candidate location |
| --- | --- | --- |
| Boundaries, acceptance and rejection, no writes | CR01-TC01–TC04 | `server/tests/borrowing-quota.test.ts`, `borrowing-quota-unit.test.ts` |
| Checkout neutrality and over-limit checkout | CR01-TC05, TC07 | `server/tests/borrowing-quota.test.ts` |
| Terminal and returned exclusion | CR01-TC06 | same |
| Concurrent same-borrower submissions | CR01-TC08 | same |
| Error precedence, isolation, privacy | CR01-TC09, TC10 | same |
| UI states | CR01-TC11 | `client/tests/borrowing-quota.test.tsx`; `e2e/tests/09-borrowing-quota.spec.ts` |
| Persisted readback | CR01-TC12 | server and E2E |
| Recovery after cancel, decline and return (return parts BLOCKED until DEP-RT) | CR01-TC13–TC16 | `server/tests/borrowing-quota.test.ts` |
| Unauthorized recovery leaves the quota unchanged | CR01-TC17 | same |
| UI after recovery | CR01-TC18 | client and E2E |
| Activation off and misconfiguration | CR01-TC19 | server unit and API; client |
| Submission concurrent with checkout or recovery | CR01-TC20 | `server/tests/borrowing-quota.test.ts` |

The existing coverage table above remains a regression obligation. Existing suites that reuse one borrower across many submissions need fixture-only isolation changes; their assertions must not change ([impact analysis §14](../../labs/lab-07/CR-01-impact-analysis.md#14-regression-protection-strategy-l7a-ev12)).

### Controlled activation and recovery dependencies (r2, pending OD-01 and OD-08)

r1 recorded that, in the deployed configuration (`REQUEST_LIFECYCLE_WRITES=disabled`, and no return endpoint at `e5ed70d`), nothing lowers a borrower's P + L, so an active quota would lock borrowers out permanently. r2 does not accept that as a limitation. It proposes:

- **Activation setting** `BORROWING_QUOTA` (`disabled` by default). With it off, submission is exactly the pre-CR-01 contract, the read endpoint answers 404 `BORROWING_QUOTA_DISABLED`, and `features.borrowingQuota` is `false`.
- **Coupling.** The server refuses to start with the quota `enabled` unless lifecycle writes are `enabled`. Borrower cancel and custodian decline, the existing #61 actions, are then available as recovery paths.
- **Return gate.** Production activation also requires authorized return (FR-12) to be released and verified. Without it, borrowers with three active loans can never recover. Return is a **separate Sprint 2 dependency (DEP-RT)**, not part of this change.
- **Recovery is never quota-checked.** Cancel, decline, auto-decline, reconcile and return only lower P or L.

Dependency table, options, effort estimates and release gates: [impact analysis §20](../../labs/lab-07/CR-01-impact-analysis.md#20-recovery-dependencies-and-controlled-activation-l7a-ev11). Recovery criteria: CR01-AC13–AC20 (proposed).
