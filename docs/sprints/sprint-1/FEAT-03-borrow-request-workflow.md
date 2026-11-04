# FEAT-03 Borrow Request Workflow

Status: Implementation candidate; teammate review and PR merge pending.

Baseline: `sprint-1-staging` commit `6524ef8`, 2026-11-03. Branch: `feature/borrow-request-workflow`.

F-04 compatibility update: the checkout result now uses request status `CHECKED_OUT` (formerly `FULFILLED`). Apply all current migrations and regenerate Prisma before starting the API; see [FEAT-04](FEAT-04-custodian-checkout.md). Historical F-03 evidence describes the earlier label.

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
