# [TEST] Sprint 1 Integration & Verification

Backend verification completed locally on **2026-11-03, Asia/Bangkok (UTC+07:00)**.

Branch: `test/sprint-1-integration-verification`.
Base: `sprint-1-staging` / `d94831fc66de53a099ecc6e384516f11483e9653`.
The tested tree adds rollback/retry assertions to `server/tests/borrow-requests.test.ts`; no application, authorization, schema, migration, or seed implementation was changed.
The [tested source manifest](../../../artifacts/sprint-1/integration-verification/tested-source.json) records SHA-256 hashes for backend source, tests, migrations, package/lockfile and test configuration, including the uncommitted test change.

## Actual results

| Check | Result | Evidence |
| --- | --- | --- |
| FEAT-03/04 focused run | **24 passed, 0 failed**, 3 files; 7.02 seconds; started 18:48:57 Bangkok | [Verbose log](../../../artifacts/sprint-1/integration-verification/logs/feat-03-04.log) |
| Full backend regression | **55 passed, 0 failed, 0 skipped/pending**, 7 files; 12.18 seconds; started 18:49:28 Bangkok | [Verbose log](../../../artifacts/sprint-1/integration-verification/logs/backend-regression.log), [Vitest JSON](../../../artifacts/sprint-1/integration-verification/backend-results.json) |
| Backend TypeScript build | **PASS**, exit 0 | [Build log](../../../artifacts/sprint-1/integration-verification/logs/backend-build.log) |
| Database cleanup | **PASS**: all six table counts match the empty preflight; no rollback trigger or migration-test schema remains | [Preflight](../../../artifacts/sprint-1/integration-verification/preflight.json), [Postflight](../../../artifacts/sprint-1/integration-verification/postflight.json) |

Focused and regression results are overlapping executions, not 79 distinct tests. The strengthened rollback assertions remain in the existing test, so the regression count stays 55.

## Checklist and traceability

Test names below are searchable verbatim in the verbose logs and JSON report. All checklist items describe the current Sprint 1 backend slice.

- [x] Borrow Request — Valid, Invalid & Duplicate Submissions
- [x] Concurrent Borrow Requests — One Accepted per Borrower/Asset
- [x] Custodian Assignment Scope — BR-05 (request queue/read, checkout, and loan access; catalog caveat below)
- [x] Checkout Authorization & Input Validation
- [x] Duplicate / Concurrent Checkout Protection
- [x] Atomic Transaction & Rollback Verification
- [x] Active Loan Creation & Availability Consistency
- [x] Full Backend Regression Tests
- [x] Backend Test Logs & Integration Report

| Area | Executed test evidence | Asserted API and database behavior |
| --- | --- | --- |
| Valid requests and duplicates | `borrow-requests.test.ts`: “persists PENDING with server identity/time, exposes asset details, and never reserves” | 201 persists server-owned identity/time and PENDING; no loan is created and catalog remains available. Another borrower can submit; a duplicate from the same borrower returns 409 `DUPLICATE_REQUEST`. |
| Invalid request submissions | “rejects unknown, retired, malformed, and client-controlled fields without writes”; “enforces authentication, role and CSRF for creation” | Unknown asset 404; retired asset 409; malformed/forged payload 400; missing session 401; wrong role or missing CSRF 403. Request count unchanged on rejected attempts. Existing workflow also rejects new requests while an active loan exists. |
| Concurrent requests | “rejects concurrent duplicate submissions and the database independently guards uniqueness”; “allows concurrent submissions by different borrowers without reserving” | Same borrower/asset: simultaneous responses [201,409], exactly one stored request; direct duplicate insertion fails P2002. Different borrowers: [201,201], no loan/reservation. |
| BR-05 request scope | `borrow-requests.test.ts`: “scopes lists/direct IDs, forbids status writes and checks out atomically”; `checkout.test.ts`: “shows only scoped pending requests with borrower and equipment details” | Assigned custodian sees the pending request; unassigned queue is empty, direct read and checkout return generic 404. Another borrower cannot read the request. Queue responses exclude password/token/session fields. |
| Checkout authorization and input | `checkout.test.ts`: “rejects missing sessions, wrong role, CSRF failures and foreign-scope requests”; “rejects invalid due dates and supplied status/identity without partial changes”; “rejects a missing request, malformed ID, asset mismatch, and retired equipment”; checkout unit tests | Missing session 401; Borrower/CSRF/foreign Origin 403; inaccessible ID 404; invalid date or forged fields 400; asset mismatch/retirement 409. Rejected operations leave PENDING and zero loans. Date validity is also checked against the actual checkout instant inside the transaction. |
| Duplicate/same-request checkout | “rejects repeated and concurrent checkout of the same request” | Concurrent responses [201,409]; repeat returns 409; exactly one loan; persisted loan including timestamps remains unchanged. |
| Competing checkout | “allows one winner across different pending requests and custodians for one exclusive asset” | Two assigned custodians and competing requests yield [201,409]; exactly one active loan; loser stays PENDING; retry conflicts; independent direct insert fails P2002 under the active-loan unique index. |
| Atomic rollback and recovery | `borrow-requests.test.ts`: “rolls back failed loan creation, preserves availability, and permits a clean retry” | A real PostgreSQL BEFORE INSERT trigger rejects the loan after the request update. API returns sanitized 500; stored request reverts to PENDING, zero loans, catalog available, request still queued. After trigger removal, retry returns 201 ACTIVE, request CHECKED_OUT, exactly one active loan, catalog unavailable. |
| Active loan and read consistency | `checkout.test.ts`: “creates exactly one ACTIVE loan, checks out the request, and immediately updates all reads” | Correct request/asset/borrower/custodian, due/checkout timestamps and null return facts persist; catalog is immediately unavailable; request leaves pending queue; borrower/assigned custodian loan lists and direct read agree. Unassigned custodian loan read returns 404. |
| Regression and compatibility | All seven backend files; “preserves historic rows when the enum migration renames FULFILLED to CHECKED_OUT” | Authentication/session/ownership, catalog, availability, request, checkout, input unit and health regressions pass. Actual rename SQL is applied to historic synthetic rows in an isolated schema; IDs and loan reference survive. |

## Environment and database isolation

- Windows, Node `v24.14.0`, npm `11.9.0`, Prisma Client `6.19.3`, Vitest `5.0.5`, PostgreSQL `18.4`.
- Integration target: local `127.0.0.1:55439`, database `kitloop_f03_test`, role `kitloop_test`, loaded from ignored `server/.env.test`. This differs from development `kitloop` on port 5432. No credentials or connection strings are included in the evidence.
- All three migrations were already applied with no rollback flags: `20261102125822_auth_baseline`, `20261103090000_unique_pending_request`, `20261103100000_checked_out_request_status`. No migration deployment, reset, or seeding was needed for this verification.
- `vitest.config.ts` loads `.env.test` with `override: true`, rejects database names without `test`, and disables file parallelism. The preflight additionally confirmed a local host and a different development target.
- Suites use Supertest against the real Express application and real PostgreSQL, with isolated synthetic fixtures and `afterAll` cleanup. Promise.all races issue concurrent operations within a test; files run sequentially. Do not run another suite against this database at the same time, especially during the rollback-trigger test.
- Preflight and postflight both show zero users, assets, requests, loans, sessions, and assignments, no `reject_test_loan` trigger, and no `migration_test_%` schemas.

## Reproduction

Use installed lockfile dependencies, generate Prisma Client when needed with the API stopped, and configure a dedicated migrated local test database as described in the root README. Do not copy a development DATABASE_URL into `.env.test`.

From `server/`, these are the executed test/build arguments (the recorded runs also used PowerShell Tee-Object to retain stdout/stderr and appended the process exit code):

```powershell
npm.cmd test -- tests/borrow-requests.test.ts tests/checkout.test.ts tests/checkout-unit.test.ts --reporter=verbose --no-color
npm.cmd test -- --reporter=verbose --reporter=json --outputFile.json=../artifacts/sprint-1/integration-verification/backend-results.json --no-color
npm.cmd run build
```

The raw test logs retain PowerShell's `NativeCommandError` formatting around dotenv's informational stderr message “injected env (3) from .env.test”. Both test processes exited 0; the full JSON report independently records `success: true`, 55 passed, zero failed and zero pending. This formatting is not a failing test. Tests ran outside the restricted sandbox so Vite could write its temporary configuration.

## Limits and release handoff

- Concurrency evidence covers the tested two-operation races and database uniqueness guards. It is not a load, soak, or exhaustive concurrency proof.
- BR-05 is verified for implemented private management operations. The shared authenticated discovery catalog remains visible to both roles. The existing [FEAT-02 contract, C1](FEAT-02-equipment-catalog.md) records the SRS-versus-SDS interpretation conflict; these results do not resolve it or claim strict assignment filtering for the catalog. Later return/reporting/assignment-management flows are not certified here.
- The teammate-reported Playwright **23/23** result was not rerun in this backend task. Local staging base `d94831f` is the merge commit for PR #20 (`test/sprint-1-playwright-e2e`), so the earlier quoted “PR ready for review” message predates this local baseline. Final review must reference the actual Playwright run/CI evidence; backend results do not certify browser E2E.
- This is a completed backend verification record, not final Sprint 1 release approval. Human review, baseline/scope decisions, and reconciliation with the Playwright evidence remain before final Integration Test Report acceptance, issue closure, and a release PR to `main`.
- This record describes the local verification run before publication. Publishing its tests and evidence for review does not close the integration issue, merge a PR, or authorize the Sprint 1 release. [Issue/PR handoff text](../../../artifacts/sprint-1/integration-verification/issue-comment.md) accompanies the evidence.
