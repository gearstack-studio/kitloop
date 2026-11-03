# FEAT-04 Custodian Checkout Workflow

Status: Implementation candidate; teammate review and PR merge pending.

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
