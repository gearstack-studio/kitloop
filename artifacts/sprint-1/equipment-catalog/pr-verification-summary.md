# FEAT-02 Equipment Catalog and Availability: PR verification summary

Branch `feature/equipment-catalog` (uncommitted), target `sprint-1-staging`. Contract: `docs/sprints/sprint-1/FEAT-02-equipment-catalog.md` v0.2 (draft; review pending). Verified 2026-11-03. No review or approval is claimed. Supersedes the AC table in `evidence.md`.

## Tests actually executed (final run)

| Check | Command (cwd) | Result | Exit | Log |
| --- | --- | --- | --- | --- |
| Backend, all suites | `npx vitest run --reporter=verbose` (`server`) | **31 of 31 passed** in 4 files; 0 failed, 0 skipped | 0 | `logs/final-server-test.log` |
| of which FEAT-02 | `catalog.test.ts` (11) and `availability.test.ts` (1) | 12 passed | 0 | same |
| of which regression | FEAT-01 `auth.test.ts` (18) and `health.test.ts` (1) | 19 passed | 0 | same |
| Server build | `npm run build` (`server`) | PASS | 0 | `logs/final-server-build.log` |
| Client lint | `npm run lint` (`client`) | PASS | 0 | `logs/final-client-lint.log` |
| Client build | `npm run build` (`client`) | PASS | 0 | `logs/final-client-build.log` |
| Browser checks, **mocked API** | DevTools-protocol script against the running app | 11 of 11 checks passed | 0 | `logs/final-ui-browser-checks.log` |

TDD: the tests were written first. The valid Red run had 4 failed and 27 passed (`logs/red-server-test.log`); two earlier Red attempts were invalid because of fixture bugs in my own tests and are kept as `logs/red-attempt-*.log`. Green is `logs/final-server-test.log`.

The browser checks use in-browser request interception: they exercise the real client code against mocked `/api/assets` and `POST /api/requests` responses. They never wrote to the database and do not prove integration with the real FEAT-03 or FEAT-04 endpoints.

## Acceptance criteria

| AC | Result | Evidence and limits |
| --- | --- | --- |
| AC-FEAT-02-01 catalog retrieval | **PASS** | TEST-FEAT-02-01 (both roles, stored values, retired absent) |
| AC-FEAT-02-02 response shape | **PASS** | TEST-FEAT-02-02 (exact five keys, no forbidden fields, roles identical, `no-store`); live API check in `evidence.md` |
| AC-FEAT-02-03 availability | **PASS** | TEST-FEAT-02-03 (no loan, returned loan, active loan, pending request) and TEST-FEAT-02-04 (unit) |
| AC-FEAT-02-04 agrees with checkout validation | **PASS**, with a caveat | TEST-FEAT-02-05 compares the catalog with the existing checkout endpoint on fixtures. The two use separate logic (risk I2), so agreement is verified only for the tested states |
| AC-FEAT-02-05 authentication | **PASS** | TEST-FEAT-02-06 (none, forged, expired, revoked; valid 200) |
| AC-FEAT-02-06 ordering | **PASS** | TEST-FEAT-02-07 (name then assetId, repeated); live check showed name order |
| AC-FEAT-02-07 distinct IDs | **PASS** | TEST-FEAT-02-08 (database duplicate rejected; seed data has same-name copies with distinct IDs). The seed was not run |
| AC-FEAT-02-08 retired stays out | **PASS** (regression guard; BR-13 is Sprint 3) | TEST-FEAT-02-09 |
| AC-FEAT-02-09 empty | **PASS** (API); UI shown | TEST-FEAT-02-10; screenshot 03 (mocked response) |
| AC-FEAT-02-10 safe failure | **PASS** | TEST-FEAT-02-11 |
| AC-FEAT-02-11 read-only | **PASS** | TEST-FEAT-02-12 |
| AC-FEAT-02-12 UI states and heading | **PARTIAL** | Executed (mocked API): heading is an `h2` in the outline and the section is a named region (A1, A2), request buttons have accessible names (A3), error plus Retry works (B1, B2), a 401 returns to login and clears the catalog (C1); loading, empty, unavailable shown in screenshots 02 to 05. **Not executed:** keyboard operation by a person, screen-reader use, narrow-screen catalog review beyond screenshot 06, an automated UI test |
| AC-FEAT-02-13 UI refresh after actions | **PARTIAL** | Executed (mocked API): the catalog is refetched after a successful request (D1) and after a 409 (E1, E2), screenshots 08 and 09. **Not executed:** against the real endpoints; see `manual-integration-test.md` |
| AC-FEAT-02-S2-01 BR-08 transitions | **NOT TESTED (Sprint 2, deferred)** | Needs FEAT-04 return |

Counts: PASS 11, PARTIAL 2, NOT TESTED 1 (deferred); no FAIL or BLOCKED. The contract's integration test TEST-FEAT-02-05 ran and passed rather than being blocked.

## Change made in this pass
AC-13 requires the catalog to refetch after a 409. `act()` in `client/src/App.tsx` did not refetch on errors, so I added a refetch on a 409 response only. It is client-side and does not touch `POST /requests`, checkout, or any server business logic. It is covered only by the mocked browser check E1/E2, not by a unit test.

## Dashboard header overlap on narrow screens
**Not fixed, and judged outside the approved FEAT-02 UI scope.** Contract section 4 specifies the catalog panel only. The overlap is in the shared top bar (account tag and Sign out button, which belongs to the layout and branding work and is duplicated by an account tag in the page heading). Fixing it would edit shared layout styles unrelated to the catalog. It stays an open item for the owner of that layout; screenshot 06 shows it.

## Integration dependencies and risks (unresolved)

| ID | Owner | Dependency |
| --- | --- | --- |
| I1 | **FEAT-03** | `POST /requests` checks only that the asset exists and is not retired (`server/src/domain.ts`). It does not enforce availability, although FR-06 requires a "borrowable" asset. A request for a checked-out asset is accepted through the API. FEAT-03's contract must require the shared definition in `server/src/availability.ts` and a 409 for an unavailable asset, with a test. FEAT-02 did not change this handler. |
| I2 | **FEAT-04** | Checkout still uses its own active-loan check inside its transaction. The two checks agree today (TEST-05) but can drift. FEAT-04 should adopt `assetState` and `activeLoanWhere` from `server/src/availability.ts`. FEAT-02 did not change checkout. |
| I3 | FEAT-04 (Sprint 2) | BR-08 transitions after checkout and return are untested until return exists. |
| I4 | Team | No frontend test runner exists. All UI verification is manual or scripted; none is a repeatable automated test in the repository. |
| I5 | Team | The dev database holds two assets. The seed now defines three (`KL-CAM-002` added) but was not run; running `npm run db:seed` also resets demo passwords and needs approval. |
| I6 | Layout owner | Dashboard top bar overlap on narrow screens (above). |
| C1 to C4 | Reviewers | Baseline conflicts recorded in contract section 13 (BR-05 versus the shared catalog, sprint allocation, OQ-04, seed coverage) remain unresolved. |

## Files modified (this feature, uncommitted)
- Edited: `server/src/domain.ts`, `server/prisma/seed.ts`, `client/src/App.tsx`, `client/src/App.css`.
- New: `server/src/availability.ts`, `server/prisma/seed-data.ts`, `server/tests/catalog.test.ts`, `server/tests/availability.test.ts`, `client/src/components/Catalog.tsx`.
- Documentation and evidence: `docs/sprints/sprint-1/FEAT-02-equipment-catalog.md` and `artifacts/sprint-1/equipment-catalog/**`.

## Evidence locations
`artifacts/sprint-1/equipment-catalog/`: `evidence.md`, `manual-integration-test.md`, this file, `logs/` (final, green, red and attempt logs), `screenshots/` (01 to 09; 02 to 05, 08 and 09 use mocked API responses, 01, 06 and 07 use the live API).

## PR readiness
**Ready for teammate review** as a draft PR with these conditions stated in the description: it carries I1 and I2 as explicit dependencies, the manual integration procedure is not yet run, UI coverage is manual and mocked rather than automated, and the contract is itself an unreviewed v0.2 draft. It should not be described as complete: AC-12 and AC-13 are partial, and BR-08 is deferred. Keep the unrelated header fix and any seed run out of this PR.
