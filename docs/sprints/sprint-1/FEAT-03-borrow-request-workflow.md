# FEAT-03 Borrow Request Workflow

Status: Implementation candidate; teammate review and PR merge pending.

Baseline: `sprint-1-staging` commit `6524ef8`, 2026-11-03. Branch: `feature/borrow-request-workflow`.

F-04 compatibility update: the checkout result now uses request status `CHECKED_OUT` (formerly `FULFILLED`). Apply all current migrations and regenerate Prisma before starting the API; see [FEAT-04](FEAT-04-custodian-checkout.md). Historical F-03 evidence describes the earlier label.

CR-01 proposed revision (Lab 7, contract r4, draft): the sections above "CR-01 revision" are the historical Sprint 1 contract and are unchanged. The proposed pending-request quota contract is the [CR-01 revision](#cr-01-revision-pending-request-quota-proposed-r4) at the end of this document. Scope was agreed at DC-1; PR #79 approval is PENDING.

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

## CR-01 revision: pending-request quota (proposed, r4)

| Item | Value |
| --- | --- |
| Revision | CR-01 contract r4 (draft), DC-1 option K2a; base `e5ed70d` (PR #77). Supersedes the r1–r3 combined quota ([impact analysis §21](../../labs/lab-07/CR-01-impact-analysis.md#21-superseded-and-deferred-record-r1r3)). |
| Change request / issues | [Issue #78](https://github.com/gearstack-studio/kitloop/issues/78); #80 RED, #81 backend, #82 frontend, #83 lifecycle activation, #85 release |
| Requirements | FR-06 and FR-07 (CR-01 amendments), BR-10 (cross-referenced), **BR-14 r4** |
| Companion documents | [Impact analysis](../../labs/lab-07/CR-01-impact-analysis.md) · [Acceptance criteria](../../labs/lab-07/CR-01-acceptance-criteria.md) · [STS](../../labs/lab-07/CR-01-STS.md) |
| Status | **Proposed. Not implemented.** Scope agreed 2026-11-26 (DC-1); PR #79 approval PENDING. |

### Policy

P is the borrower's `PENDING` requests. A new otherwise-valid request is accepted only when **P < 2**; remaining capacity is `max(0, 2 − P)`.

- **Active loans do not affect eligibility.**
- Terminal requests do not count.
- Existing over-limit records are preserved, and that borrower's submissions are rejected until P < 2.
- Checkout, borrower cancel, custodian decline and checkout auto-decline each lower P by one and restore capacity. None of them is quota-checked.
- The duplicate policy above and non-reservation are unchanged: different borrowers may still request the same available asset.

### API changes

| Endpoint | Baseline | CR-01 r4 |
| --- | --- | --- |
| POST `/api/requests` | 201 or the errors above | Same, plus **409 `BORROWING_QUOTA_EXCEEDED`** when activation is on and P ≥ 2 (envelope without `fields`, no writes). 201 DTO unchanged. |
| GET `/api/borrowing-quota` | — | **New.** Borrower only. Order: 401 → 403 (Custodian) → 404 `BORROWING_QUOTA_DISABLED` (activation off) → **400 `VALIDATION_ERROR` with `fields.query` for any query parameter** → 200 with `Cache-Control: no-store`. Identity comes from the session. One `COUNT(*)` statement; no explicit transaction (OD-12). |
| Others | — | Unchanged |

```json
{ "pendingRequests": 1, "maxPendingRequests": 2, "remainingRequestCapacity": 1, "canSubmitRequest": true }
```

`pendingRequests` is not clamped (historical values above 2 appear). There are no identifiers and no loan fields. The r3 fields `activeLoans`, `combinedUsage` and `maxCombinedUsage` are removed.

### Error precedence for POST `/api/requests`

1. 400 `INVALID_JSON` / 413
2. 401
3. 403 role
4. 403 Origin / CSRF
5. 400 `VALIDATION_ERROR`
6. 404
7. 409 `ASSET_UNAVAILABLE`
8. 409 `DUPLICATE_REQUEST`
9. **409 `BORROWING_QUOTA_EXCEEDED`** (activation on)
10. 201

Retry exhaustion stays 409 `CONFLICT`. A loser whose retry sees the committed winner gets `BORROWING_QUOTA_EXCEEDED`.

### Transaction

P is counted inside the existing Serializable submission transaction, after the duplicate read and before the insert. SSI aborts one of two concurrent same-borrower submissions that together would exceed P = 2; the retry then rejects. No migration, counter, trigger or extra lock is added ([impact analysis §10](../../labs/lab-07/CR-01-impact-analysis.md#10-concurrency-analysis-l7a-ev05)).

### Borrower UI

- **Quota panel** on `/requests`: "N of 2 pending requests" and "You can submit K more request(s)", rendered from the server's `maxPendingRequests`. At the limit it explains that a checkout, a cancel or a custodian decline frees a slot. Active loans are not shown as quota usage.
- **Eligibility** (`borrowEligibility`): precedence `unavailable` → `pending` → `quota` → `eligible`. The form and catalog "Request to borrow" buttons are disabled in the `quota` state with an accessible reason.
- **Loading and error:** submission is disabled while the quota is loading or failed; a failed read shows an alert with Retry.
- **Refresh triggers:** after sign-in or restore (borrower with `features.borrowingQuota: true`); on entering `/requests`; after each successful submit or cancel; after **any** 409; and on the panel's Refresh button. There is no polling. Responses from an older session epoch or read are discarded. If the re-read after a successful mutation fails, the UI says the action succeeded but the limits could not be refreshed, and keeps Submit disabled until Retry succeeds.
- **Session:** a 401 ends the session and clears quota state. Custodians never load a quota. With `features.borrowingQuota: false` there is no call, no panel and pre-CR-01 eligibility.

### Controlled activation and dependency

- `BORROWING_QUOTA` is off by default.
- Startup refuses `enabled` unless `REQUEST_LIFECYCLE_WRITES=enabled`, so a borrower can always cancel their own request and lockout is impossible.
- Production activation requires verified lifecycle actions (**#83**, RG-01), then RG-03, RG-04 and RG-05.
- **FR-12 return (#84) is not a dependency.**
- A production deployment with the quota disabled does not verify this contract's changed behavior.

Gates, deployment procedure (PENDING) and rollback: [impact analysis §20](../../labs/lab-07/CR-01-impact-analysis.md#20-recovery-activation-and-release-l7a-ev11-l7a-ev13-l7a-ev14).

### Verification mapping

| Coverage | CR-01 cases (active) | Location |
| --- | --- | --- |
| Boundaries P = 0, 1, 2; no writes; loans irrelevant | TC01–TC03, TC21 | `server/tests/borrowing-quota.test.ts`, `borrowing-quota-unit.test.ts` |
| Checkout reduces P; over-limit history | TC05, TC07, TC16 | same |
| Terminal exclusion | TC06 | same |
| Concurrency (normal versus exhaustion); concurrency with lifecycle | TC08, TC20 | same |
| Precedence, isolation, privacy; unauthorized recovery | TC09, TC10, TC17 | same |
| Recovery by cancel, decline, auto-decline | TC13, TC14 | same |
| UI states; UI after recovery | TC11, TC18 | `client/tests/borrowing-quota.test.tsx`; `e2e/tests/09-borrowing-quota.spec.ts` |
| Persistence | TC12 | server and E2E |
| Activation off and coupling | TC19 | server unit and API; client |

TC04 (combined limit) is superseded and TC15 (return recovery) is deferred; neither is in the active suite. The existing coverage table above remains a regression obligation. Required fixture-only changes: [impact analysis §14](../../labs/lab-07/CR-01-impact-analysis.md#14-regression-protection-strategy-l7a-ev12).
