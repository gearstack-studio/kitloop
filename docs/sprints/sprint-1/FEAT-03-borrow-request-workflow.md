# FEAT-03 Borrow Request Workflow

Status: **v1.0 — Accepted in Sprint 1 release `49cb6e3`.** Reviewed by `yiiipunn` and merged to `sprint-1-staging` through PR #16 (`1e6717b`, 2026-11-03); released to `main` through PR #23. The original v0.1 status text ("Implementation candidate; teammate review and PR merge pending") is kept in Git history. See the [version history](#version-history) for what v1.0 changed.

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

## Acceptance criteria (v1.0 numbering)

> **Retroactive numbering.** v0.1 (commit `d254ac0`) described these acceptance areas in prose and in the coverage table above, but gave them no IDs. v1.0 (2026-11-07) assigns stable IDs to those same areas, in the same order as Table F.6c of the Deliverable 1 report. No behavior was added or relaxed. The IDs were assigned **after** implementation and do not count as evidence of contract-first work.

| AC ID | Requirement links | Given / When | Then (observable outcome) |
| --- | --- | --- | --- |
| AC-FEAT-03-01 | FR-06, BR-10 / TC-06, TC-21 | A signed-in Borrower submits `{ assetId }` for an available asset | 201; one `PENDING` request is stored with server-assigned borrower and submission time; the asset stays *Available* (no reservation, no loan) |
| AC-FEAT-03-02 | BR-10 / TC-21 | The same Borrower already has a `PENDING` request for that Asset ID, including concurrent submissions | 409 `DUPLICATE_REQUEST`; exactly one pending row exists; the partial unique index rejects a direct duplicate insert |
| AC-FEAT-03-03 | BR-10 / TC-21 | Two different Borrowers request the same available asset | Both requests are stored as `PENDING`; neither reserves the asset |
| AC-FEAT-03-04 | FR-06, NFR-03 / TC-06, TC-23 | Unknown, malformed, retired or checked-out Asset ID, or a body with client-controlled fields (status, borrower) | 404 / 400 / 409 `ASSET_UNAVAILABLE` / 400 respectively; no row is written |
| AC-FEAT-03-05 | BR-03, NFR-01 / TC-18 | Submission without a session, by a Custodian, or without a valid CSRF token / trusted Origin | 401 / 403 / 403; no row is written |
| AC-FEAT-03-06 | FR-07, FR-08, BR-04, BR-05 / TC-07, TC-08 | A Borrower lists or reads requests; a Custodian opens the pending queue | Borrowers see only their own requests (foreign IDs → generic 404); Custodians see only requests for assigned assets; there is no status-write endpoint |
| AC-FEAT-03-07 | NFR-04 / TC-24 | An unexpected database failure occurs during submission | A sanitized 500 with no SQL, stack or connection details |
| AC-FEAT-03-08 | FR-06, FR-07 | Borrower UI: loading, empty, failure/retry, success, 409 and expired-session states | Submission is disabled while data is loading or failed; a 409 refreshes stale state and shows the server message; a 401 clears private state; success then a failed refresh is reported as success |

## Software Test Specification (v1.0)

Test level key: **API+DB** = Supertest against an isolated PostgreSQL test database; **Unit** = Vitest; **jsdom** = React Testing Library with mocked HTTP; **E2E** = Playwright/Chromium against the real API and a fresh PostgreSQL database.

| Test ID | AC | Level | Precondition / input | Action | Expected result | Automated test (file › name) |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-FEAT-03-01 | AC-FEAT-03-01 | API+DB, E2E | Seeded Borrower; available asset | POST `/api/requests`, then read the request and catalog | 201 `PENDING`, server identity/time; asset still available | `server/tests/borrow-requests.test.ts` › "persists PENDING with server identity/time, exposes asset details, and never reserves"; `e2e/tests/02-request-checkout-journey.spec.ts` › "Borrower A requests KL-CAM-001; it is PENDING and does not reserve the asset" |
| TEST-FEAT-03-02 | AC-FEAT-03-02 | API+DB | Same Borrower, same asset | Concurrent duplicate POSTs; direct duplicate insert | One 201, others 409; DB unique index rejects the insert | `borrow-requests.test.ts` › "rejects concurrent duplicate submissions and the database independently guards uniqueness" |
| TEST-FEAT-03-03 | AC-FEAT-03-03 | API+DB, E2E | Two Borrowers, one asset | Concurrent POSTs by each Borrower | Both 201 `PENDING`; asset available | `borrow-requests.test.ts` › "allows concurrent submissions by different borrowers without reserving"; E2E › "…Borrower B competes for KL-CAM-001" |
| TEST-FEAT-03-04 | AC-FEAT-03-04 | API+DB, Unit | Unknown, retired, checked-out and malformed IDs; forged fields | POST each variant | 404 / 409 / 400; row count unchanged | `borrow-requests.test.ts` › "rejects unknown, retired, malformed, and client-controlled fields without writes"; › "accepts only a trimmed Asset ID" |
| TEST-FEAT-03-05 | AC-FEAT-03-05 | API+DB, E2E | No session; Custodian session; missing CSRF | POST `/api/requests` | 401 / 403 / 403; no write | `borrow-requests.test.ts` › "enforces authentication, role and CSRF for creation"; `e2e/tests/03-access-control.spec.ts` › "a custodian cannot submit a borrow request (403)" |
| TEST-FEAT-03-06 | AC-FEAT-03-06 | API+DB, E2E | Two Borrowers; two Custodians with different assignments | List / direct-read / status-write attempts; open the queue | Own records only; foreign IDs 404; scoped queue | `borrow-requests.test.ts` › "scopes lists/direct IDs, forbids status writes and checks out atomically"; E2E › "BR-05: the unassigned custodian does not see another custodian's requests", "another borrower cannot read the request by direct ID (404)…" |
| TEST-FEAT-03-07 | AC-FEAT-03-07 | API | Forced database failure | POST `/api/requests` | 500 with a generic message only | `borrow-requests.test.ts` › "does not expose database failure details during submission" |
| TEST-FEAT-03-08 | AC-FEAT-03-08 | jsdom | Mocked HTTP states | Render pages and interact | Distinct states; disabled submit; 409 and 401 handling | `client/tests/requests.test.tsx` (5 tests); `client/tests/borrow-workflow.test.tsx` (6 tests) |

Executed result on release `49cb6e3`: all of the above **PASS** (backend 55/55, frontend 22/22, E2E 23/23; re-run 2026-11-07). See the Deliverable 1 report, Part F.4–F.5.

## Definition of Done (FEAT-03)

FEAT-03 inherits the Product Definition of Done in `docs/sprints/plan.md` §9. Feature-specific checks:

| DoD item | Evidence | Status |
| --- | --- | --- |
| AC-FEAT-03-01…08 implemented and enforced by the API/DB (not only the UI) | Routes and service in `server/src`; partial unique index migration | Done |
| Every STS test executed and passing on the release commit | `49cb6e3`: 55/55, 22/22, 23/23 | Done |
| Live-browser journey borrower submit → custodian queue → checkout → `CHECKED_OUT` history | Playwright `02-request-checkout-journey.spec.ts` | Done |
| Teammate review and staging integration | PR #16 approved by `yiiipunn`; merged `1e6717b` | Done |
| Contract written and versioned **before** implementation | Contract and code arrived together in `d254ac0` | **Not met — disclosed** (report L3) |
| Red→Green TDD evidence for the duplicate rule | No failing run was recorded | **Not met — disclosed** (report F.6) |

## Version history

| Version | Date | Commit | Change | Reason |
| --- | --- | --- | --- | --- |
| 0.1 | 2026-11-03 | `d254ac0` | Initial contract delivered together with the implementation | — |
| 0.2 | 2026-11-03 | `1346b2d` | `FULFILLED` renamed to `CHECKED_OUT` (FEAT-04 compatibility note) | FEAT-04 enum change |
| 1.0 | 2026-11-07 | this branch | Status updated to accepted; numbered AC, STS, DoD and this history added | Close Part E gap L3; IDs assigned retroactively; behavior unchanged |
