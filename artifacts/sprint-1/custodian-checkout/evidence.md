# F-04 Custodian Checkout verification record

Date: 2026-11-03. Base: `sprint-1-staging` at `1e6717b`. Branch: `feature/custodian-checkout-workflow`.

## Executed checks

| Check | Actual result |
| --- | --- |
| Prisma client generation | Passed for the schema using request status `CHECKED_OUT`. |
| Prisma migration deploy to isolated PostgreSQL `kitloop_f03_test` | Applied `20261103100000_checked_out_request_status`; existing baseline and pending-uniqueness migrations remained applied. |
| `npm test` in `server/` | 55 tests passed in 7 files, including 5 checkout unit cases and 10 checkout integration/migration cases, plus the existing 40 regression cases updated for the new status label. |
| `npm run build` in `server/` | Passed (`tsc --noEmit`). |
| `npm test` in `client/` | 21 tests passed in 4 files: 4 checkout component cases, 7 checkout app workflow cases, and 10 existing borrower/request regression cases. |
| `npm run build` in `client/` | Passed (TypeScript and Vite production build). |
| `npm run lint` in `client/` | Passed. |

## Observed behavior

- A successful checkout persisted exact borrower, asset, request, custodian, checkout time, and due time; returned `status: ACTIVE`; changed the request to `CHECKED_OUT`; removed it from the pending queue; and made the next catalog read unavailable.
- Same-request concurrent attempts returned one 201 and one 409, and a subsequent repeat preserved the original loan unchanged.
- Two authorized custodians checking out different pending requests for one asset produced one 201, one 409, and one active loan. The losing request remained pending. A direct duplicate-loan insert was also rejected by PostgreSQL's unique constraint.
- Unknown/malformed IDs, asset mismatch, retired/unavailable equipment, invalid/past due dates, client-controlled fields, wrong roles/scopes, and missing session/CSRF were rejected without partial changes.
- A controlled checkout clock verified that the due date is checked inside the transaction. The existing F-03 injected database-failure test verified rollback after the request update when loan insertion fails.
- The actual enum migration SQL ran against populated historic rows in a temporary PostgreSQL schema: the old request retained its identifier and loan reference while its label changed from `FULFILLED` to `CHECKED_OUT`; a pending row stayed pending.
- App tests verified success refresh, duplicate-click suppression, conflict refresh/unavailable controls, permission/session/internal errors, and a committed write followed by failed refresh.

## Limits and outstanding gates

Server integration tests use real PostgreSQL and synthetic fixtures; temporary migration-test schema and fixture rows are removed afterward. Client checks use jsdom and mocked HTTP, so they do not establish live-browser end-to-end behavior. Test results are recorded from command output; this change does not claim a retained red-before-green TDD history.

Initial startup retry could not open an existing PostgreSQL log; a readiness check confirmed the existing isolated test server was already accepting connections, after which migrations/tests passed. No development seed or production database was reset.

Existing deployments require a coordinated enum/API/client rollout as described in the [feature contract](../../../docs/sprints/sprint-1/FEAT-04-custodian-checkout.md). Old clients expecting `FULFILLED` are incompatible with the new label. OQ-01's maximum loan-duration policy remains unresolved. Live-browser smoke verification, both team members' review, PR approval, and merge remain pending.
