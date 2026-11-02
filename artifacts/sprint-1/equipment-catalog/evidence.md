# FEAT-02 Equipment Catalog and Availability: Evidence Index

> Later pass: see `pr-verification-summary.md` (final acceptance-criteria table, final test run) and `manual-integration-test.md`. The AC table below is the earlier snapshot.

Contract: `docs/sprints/sprint-1/FEAT-02-equipment-catalog.md` (v0.2, draft, review pending). Branch: `feature/equipment-catalog` (nothing committed). Collected 2026-11-03, local machine, PostgreSQL 18. No review or approval is claimed.

## Commands and results (logs in `logs/`)

| Step | Command (cwd) | Result | Exit | Log |
| --- | --- | --- | --- | --- |
| Red, attempt 1 | `npx vitest run --reporter=verbose` (`server`) | Invalid: the catalog suite failed in setup because of a bug in my test fixture (a returned loan older than its checkout time). Not product evidence. | 1 | `red-attempt-1-invalid-fixture-error.log` |
| Red, attempt 2 | same | Invalid: a cleanup statement in my own test hit the same fixture rule. 5 failed, but one failure was the test's fault. | 1 | `red-attempt-2-invalid-cleanup-error.log` |
| **Red (valid)** | same, tests only, no implementation | 4 failed, 27 passed (31 tests). Failures: TEST-02 response shape (extra `retiredAt` key), TEST-07 ordering, TEST-08 (`prisma/seed-data` missing), TEST-04 (`src/availability` missing). | 1 | `red-server-test.log` |
| **Green** | same, after implementation | 4 files passed, **31 of 31 tests passed**, 0 failed, 0 skipped (19 earlier FEAT-01 and health tests plus 12 new) | 0 | `green-server-test.log` |
| Server build | `npm run build` (`server`) | PASS (`tsc --noEmit`, includes tests) | 0 | `server-build.log` |
| Client lint | `npm run lint` (`client`) | PASS | 0 | `client-lint.log` |
| Client build | `npm run build` (`client`) | PASS | 0 | `client-build.log` |

Red notes: eight new tests (01, 03, 05, 06, 09, 10, 11, 12) already passed before implementation because they characterize existing behaviour (retrieval, availability, authentication, retired exclusion, empty, safe 500, read-only). Only the four above were genuine Red. The ordering test failed in Red because two same-name assets were inserted in the opposite order from the required tie-break.

## Acceptance criteria status

| AC | Status | Evidence |
| --- | --- | --- |
| AC-01 retrieval | VERIFIED | TEST-FEAT-02-01 |
| AC-02 response shape | VERIFIED | TEST-FEAT-02-02 (exact five keys, no forbidden fields, roles identical, `Cache-Control: no-store`); live check in `logs` summary below |
| AC-03 availability | VERIFIED | TEST-FEAT-02-03 and TEST-FEAT-02-04 (no loan, returned loan, active loan, pending request) |
| AC-04 agrees with checkout validation | VERIFIED against the existing checkout endpoint (unchanged) | TEST-FEAT-02-05 |
| AC-05 authentication | VERIFIED | TEST-FEAT-02-06 (none, forged, expired, revoked) |
| AC-06 ordering | VERIFIED | TEST-FEAT-02-07 |
| AC-07 distinct IDs | VERIFIED | TEST-FEAT-02-08 (database primary key and seed data) |
| AC-08 retired stays out | VERIFIED (regression guard; BR-13 is Sprint 3) | TEST-FEAT-02-09 |
| AC-09 empty | API VERIFIED (TEST-10); UI shown in screenshot 03 | |
| AC-10 safe 500 | VERIFIED | TEST-FEAT-02-11 |
| AC-11 read-only | VERIFIED | TEST-FEAT-02-12 |
| AC-12 UI states and heading | PARTIAL | Screenshots 01 to 07; no automated UI test (no client test runner exists). Loading, empty, error and unavailable states were captured using browser interception of the catalog request (screenshots 02 to 05); these show the real UI with a mocked API response. |
| AC-13 UI refresh after actions | NOT TESTED | `refreshData` now also resets the catalog state, but no request or checkout action was run in a browser |
| AC-S2-01 (BR-08 transitions) | NOT TESTED (Sprint 2) | |

## Live-application checks
Captured with headless Edge against the running Vite client and API. Credentials were read from the ignored `server/.env` in-process and are not shown.

- Live `GET /api/assets` as `borrower.demo`: status 200, `Cache-Control: no-store`, keys exactly `assetId, available, category, description, name`, IDs ordered `KL-LAP-001, KL-CAM-001` (name order).
- Custodian view shows the same catalog and no request buttons.

| Screenshot | Content |
| --- | --- |
| `screenshots/01-borrower-catalog-live.png` | Borrower, live API |
| `screenshots/02-unavailable-state-mocked-api.png` | Available and "Checked out" cards, disabled request buttons (mocked response) |
| `screenshots/03-empty-state-mocked-api.png` | Empty state (mocked response) |
| `screenshots/04-error-state-mocked-api.png` | Error with Retry (mocked 500) |
| `screenshots/05-loading-state-request-held.png` | Loading state (request held open) |
| `screenshots/06-borrower-catalog-mobile-live.png` | 390 px wide viewport, live API |
| `screenshots/07-custodian-catalog-live.png` | Custodian, live API |

## Known limits
- The dev database was **not** re-seeded, so the live catalog still shows two assets. The seed now defines a second camera copy (`KL-CAM-002`); run `npm run db:seed` locally when ready (it also resets the demo account passwords to the `.env` values).
- Checkout (FEAT-04) and `POST /requests` (FEAT-03) were not modified. Checkout still uses its own active-loan check, so the shared definition is used by the catalog only (integration risk I2). `POST /requests` still lacks an availability check (risk I1).
- The dashboard top bar overlaps the account tag and Sign out button on narrow screens; this is existing shared layout and was not changed.
