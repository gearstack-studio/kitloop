# Sprint 1 integration defect log

Scope: issues found while preparing the yiiipunn portion of Sprint 1 Integration & Verification (see [e2e-test-report.md](e2e-test-report.md)).

**No browser E2E test failed.** 33 of 33 executed tests passed; no functional defect in FEAT-01 to FEAT-04 was observed. The entries below are visual and environment issues that were actually observed, plus one earlier failure that has since been fixed. Nothing here has been fixed in application code (this task forbids changing application logic).

| ID | Severity | Type | Status | Summary |
| --- | --- | --- | --- | --- |
| D-01 | Medium | UI layout | Open | On a 390 px viewport the account tag in the top bar overlaps/crowds the logo and Sign out button |
| D-02 | Low | UI layout | Open | The same "Account xxxxxxxx" tag appears twice on every dashboard (top bar and page heading) |
| D-03 | Low | UI copy | Open | Record counts read "1 records" / "0 records" |
| D-04 | Low | UI layout | Open | Notice/alert sits flush against the button beneath it on `/requests` |
| D-05 | High (environment), resolved | Test environment | Closed | `kitloop_auth_test` was missing two migrations: 8 server tests failed and 11 were skipped |
| D-06 | Medium | Test environment | Open | `client/node_modules` lacks `vitest`, so `npm test` cannot run in the repository's `client/` |
| D-07 | Medium (reported), not a code defect | Integration / data expectation | Closed — no application defect | Borrower's `KL-LAP-001` request was "missing" from `custodian.demo`'s Pending requests; the asset is assigned to `custodian.other` (BR-05 working as designed) |

---

## D-01 Account tag overlaps the top bar on mobile

- **Observed:** in `screenshots/E2E-CAT-03-mobile-390.png` (Borrower A, 390x844) the "Account cf4a9935" pill is drawn over the area between the KitLoop logo and the Sign out button; the two controls are stacked/crowded and the pill clips the top edge of Sign out.
- **Steps:** sign in as any user, emulate a 390x844 viewport, open `/dashboard`.
- **Expected:** logo, account tag and Sign out are laid out without overlapping.
- **Impact:** cosmetic; every function still worked in the same run (E2E-CAT-03 asserts no horizontal overflow and passed). Not a FEAT-02 to FEAT-04 acceptance failure.
- **Origin:** the top bar is shared shell code, outside the FEAT-02 UI scope in the contract. This is the issue previously recorded as I6 in `artifacts/sprint-1/equipment-catalog/pr-verification-summary.md`; this run reproduces it on the merged `sprint-1-staging` (`52b187c`) with live data.
- **Next step:** a separate small UI fix outside the FEAT PRs; re-capture the 390 px screenshot afterwards.

## D-02 Duplicate account tag

- **Observed:** every dashboard screenshot (for example `E2E-AVL-01-borrower-a-after-checkout.png`) shows the same "Account xxxxxxxx" pill in the top bar and again beside the page heading.
- **Impact:** redundant UI; contributes to D-01 on narrow screens. No functional effect.
- **Next step:** remove one of the two, together with the D-01 fix.

## D-03 "1 records"

- **Observed:** section counters show "1 records" and "0 records" (My requests, My loans, Pending requests, Active loans, for example `E2E-CHK-04-checkout-success.png`). The catalog counter handles the singular ("1 asset") correctly.
- **Next step:** pluralise the counters like the catalog does.

## D-04 No spacing under the alert on `/requests`

- **Observed:** in `screenshots/E2E-AVL-05-conflict-message.png` the error alert and the "Equipment dashboard" button touch with no gap.
- **Impact:** cosmetic.

## D-05 Test database missing migrations (fixed)

- **Observed:** the server suite reported 36 passed, 8 failed, 11 skipped, 4 failed files (counts as reported by the developer; the failing run was not saved as a log by me). Failures: Postgres `22P02` for `RequestStatus` value `CHECKED_OUT`; checkout returning 500; concurrent checkout returning `[500, 500]`; direct duplicate pending insert succeeding instead of raising Prisma `P2002`; catalog fixture setup failing.
- **Root cause (read-only inspection):** `kitloop_auth_test` had only `20261102125822_auth_baseline` applied. `20261103090000_unique_pending_request` (partial unique index) and `20261103100000_checked_out_request_status` (enum rename `FULFILLED` to `CHECKED_OUT`) were pending. This was a database setup gap, not an application bug.
- **Fix:** `npx prisma migrate deploy` against `kitloop_auth_test` only (no reset, drop, truncate or seed); applied both pending migrations. `prisma migrate status` then reported the database up to date.
- **Verification:** `logs/server-vitest.log` — 7 files, 55 of 55 tests passed, exit 0 (re-run during this task).
- **Follow-up:** every other machine or CI database used by `npm test` needs `npm run db:deploy` after merging FEAT-03/FEAT-04. The README documents this, but the merge itself does not apply it.

## D-06 Client test dependencies not installed

- **Observed:** `npm test` in `client/` exited 1 with `'vitest' is not recognized as an internal or external command` (the first attempt of `logs/client-vitest.log` was overwritten by the successful copy run, see below).
- **Cause:** `client/node_modules` in the working copy predates the merged `client/package.json`, which now lists `vitest`, `jsdom` and Testing Library as dev dependencies.
- **Not fixed in place:** running `npm ci` there would delete `node_modules` while the Vite dev server on :5173 was using it. Instead, an identical copy of `client/` (0 differences in source, tests and config) was installed and tested in the session scratchpad: 4 files, 21 of 21 tests passed (`logs/client-vitest.log`, which states this at the top).
- **Next step:** run `npm ci` in `client/` after stopping Vite, then re-run `npm test` there.

## D-07 Request not visible in the Custodian Dashboard (reported) — not an application defect

- **Reported:** `borrower.demo` (UI label `1959cc29`) submitted a PENDING request for `KL-LAP-001`; the Custodian Workspace labelled `7d1d033d` showed Pending requests 0 and Active loans 0.
- **Root cause (verified against full IDs in `kitloop_auth_dev`, read-only):** `7d1d033d…` is `custodian.demo`, who is assigned only `KL-CAM-001`. `KL-LAP-001` is assigned to `custodian.other` (`d8a29e68…`), as defined in `server/prisma/seed.ts` (custodian index 1 gets the laptop). The request row was correct: PENDING, the right asset and borrower, valid foreign keys. The queue filter in `server/src/domain.ts` (`status = PENDING` and the asset has a `CustodianAsset` row for the caller) returned `[]` for `custodian.demo` and `["KL-LAP-001"]` for `custodian.other`. This is correct BR-05 behaviour, not a seed mismatch and not an integration bug. Evidence: `logs/dev-db-br05-readonly-inspection.log` (current state) — the first inspection, made while the request was still PENDING, was reported in the conversation only and was not saved as a file.
- **Actual resolution:** no authorization or query code was changed, and visibility was not widened. Changes made to prevent the confusion:
  - `README.md` now states which custodian owns which asset.
  - `client/src/components/Requests.tsx` shows a custodian-specific empty-queue message (assigned equipment only), with a client test.
  - `server/tests/borrow-requests.test.ts` has a regression test: the assigned custodian sees the new request across repeated fetches and can check it out (201, one ACTIVE loan); the unassigned custodian never sees it and gets 404 on checkout with no loan created.
- **Outcome confirmed in the database:** the developer then signed in as the assigned custodian and completed the workflow. `logs/dev-db-user-workflow-readonly-inspection.log` shows the request `6bdb2c55…` now `CHECKED_OUT`, one ACTIVE loan for `KL-LAP-001` created by `custodian.other` for `borrower.demo`, and `KL-LAP-001` deriving as unavailable.
- **Not evidenced:** screenshots of this demo-account run (see "Missing screenshots" in `screenshot-index.md`) and a browser view of the new empty-state wording (NOT VERIFIED in a browser).
