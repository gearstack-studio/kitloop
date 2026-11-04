# Sprint 1 integration: verified vs untested (yiiipunn portion)

Written for: the teammate reviewer (`DEV4952`) and the Sprint 1 release decision.

Companion files: [e2e-test-report.md](e2e-test-report.md) · [screenshot-index.md](screenshot-index.md) · [defect-log.md](defect-log.md). Nothing in this task was committed, pushed or opened as a PR, no application code was changed, and no database was reset, reseeded or dropped.

## What was read and what already existed

- Read before testing: `docs/sprints/sprint-1/FEAT-01` to `FEAT-04`, `docs/traceability-matrix.md` (RTM), `docs/sprints/plan.md`, `README.md`, and the per-feature records under `artifacts/sprint-1/{authentication,equipment-catalog,borrow-requests,custodian-checkout}/`.
- `artifacts/sprint-1/integration/` **did not exist**; there was no earlier integration evidence to reuse. Everything here is from this run.
- No separate "STS" document exists. The software test specifications are the per-feature tables (FEAT-01 section 8 `TEST-FEAT-01-xx`, FEAT-02 `TEST-FEAT-02-xx`, FEAT-03/FEAT-04 coverage tables) and the RTM test cases (TC-01 to TC-28, which the RTM itself calls "planned, not executed"). FEAT-03 and FEAT-04 have no numbered AC IDs, so they are cited by contract section and RTM TC.
- The FEAT-03 and FEAT-04 contracts and evidence records both state that live-browser verification was still pending. This run supplies it for the paths listed below.

## Actual executions

| Execution | Result | Evidence |
| --- | --- | --- |
| Browser E2E (headless Edge 156 → Vite dev client → API → PostgreSQL 18.4, throwaway DB `kitloop_e2e_test`) | 33 PASS, 0 FAIL | `e2e-test-report.md`, `results/`, `screenshots/` (30) |
| Server `vitest run` against `kitloop_auth_test` | 7 files, 55 of 55 passed | `logs/server-vitest.log` |
| Server `npm run build` | exit 0 | `logs/server-build.log` |
| Client `vitest run` (jsdom, mocked HTTP) | 4 files, 21 of 21 passed — run in an identical copy of `client/` (see defect D-06) | `logs/client-vitest.log` |
| Client `npm run lint`, `npm run build` | both exit 0 | `logs/client-lint.log`, `logs/client-build.log` |

Both E2E phases ran against commit `52b187c` (`sprint-1-staging`). The API process was genuinely stopped and restarted between the phases.

## Verified by this run (browser, live API and database)

| Area | Requirement | Tests |
| --- | --- | --- |
| FEAT-01 | AC-01 (identity and role after sign-in, both roles), AC-02 (generic failure), AC-03 (refresh restores identity), AC-12 (validation state, invalid-credential state, identity-driven navigation, 401 clears protected state, logout) | AUTH-01 to AUTH-09 |
| FEAT-01 | AC-06 (Borrower checkout → 403), AC-07 (foreign request/loan → 404), AC-08 (Custodian scope → 404) — via forced API calls from the signed-in page | REQ-05, CHK-06, CHK-07, CHK-08 |
| FEAT-02 | AC-01, AC-02, AC-03, AC-06, AC-07, AC-08, AC-13 (success refresh and 409 refresh on real endpoints), AC-12 (heading, count, populated state, mobile layout) | CAT-01 to CAT-04, AVL-05, CHK-04 |
| FEAT-03 | FR-06, FR-07, FR-08, BR-10 (no reservation, two borrowers coexist, duplicate blocked), availability rule at submission for checked-out and retired assets (the earlier I1 gap) | REQ-01 to REQ-06, CHK-01, CHK-02, AVL-03, AVL-05 |
| FEAT-04 | FR-09, FR-10, BR-01/02/06/11 (one ACTIVE loan with correct references, exact due date, past-date rejection, competing request blocked and left PENDING, scoped checkout) | CHK-03 to CHK-08 |
| Availability | Available → (request) Available → (checkout) Checked out for both roles; stale page meets server rule; state survives API restart | AVL-01 to AVL-05, PER-01 |

## Untested and blocked

Status words: **NOT RUN** = no execution of this case in a browser during this task. **BLOCKED** = could not be run for a stated reason. "Automated" means an executed server or jsdom test exists (see the log table above) but it is not browser evidence.

| Item | Status | Reason / what exists instead |
| --- | --- | --- |
| FEAT-01 AC-12 — 403 keeps the session in the UI | NOT RUN | The UI offers no path to a 403; only forced calls were possible and they do not exercise the UI handler. jsdom `checkout-workflow.test.tsx` covers a mocked 403. |
| FEAT-01 AC-12 — loading state ("Signing in…") | NOT RUN | Not asserted or captured. |
| FEAT-01 AC-04/AC-05 — replay of a revoked, forged or time-expired cookie | NOT RUN in browser | Logout clears the cookie, so the old token was not replayed. Automated: `auth.test.ts`. |
| FEAT-01 AC-09, AC-10, AC-11 — cookie attributes, hashed storage, origin/CSRF rejection, server 400/500 | NOT RUN in browser | Automated only. (Every browser mutation sent a valid CSRF token and Origin and succeeded.) |
| FEAT-01 AC-06 — Custodian sending a Borrower-only request → 403 | NOT RUN in browser | Automated only. |
| FEAT-02 AC-04, AC-05, AC-09, AC-10, AC-11 | NOT RUN in browser against the real API | Automated server tests. Empty/error/loading catalog states were captured earlier with a **mocked** API (`artifacts/sprint-1/equipment-catalog/screenshots/02`–`05`), not in this run. |
| FEAT-02 AC-12 — keyboard and screen-reader use | NOT RUN | No assistive-technology test was done by anyone; only the accessibility tree was checked earlier, with mocked responses. |
| FEAT-02 AC-S2-01 — return transition | NOT TESTABLE | Return is Sprint 2; only the checkout half was observed (AVL-01). |
| FEAT-03 — validation of malformed or unknown Asset IDs, forged status/owner fields, CSRF/origin | NOT RUN in browser | Automated: `borrow-requests.test.ts`. |
| FEAT-03 — concurrent duplicate submissions and the 3-attempt serialization retry | NOT RUN in browser | Automated only; a real browser race needs two coordinated sessions. |
| FEAT-03 — loading/error/retry states of My requests; success followed by failed refresh | NOT RUN live | jsdom `borrow-workflow.test.tsx` (mocked HTTP). |
| FEAT-04 — `REQUEST_MISMATCH`, repeat checkout of the same request, concurrent checkout (TC-19) | NOT RUN in browser | Automated `checkout.test.ts`. CHK-05 covers only a **sequential** competing request, not a race. |
| FEAT-04 — rollback after partial failure (TC-20), enum migration on populated rows | NOT RUN in browser | Automated only (trigger-based rollback test, migration test). |
| FEAT-04 — 500 handling, duplicate-click suppression, post-success read failure in the UI | NOT RUN live | jsdom `checkout-workflow.test.tsx` only. |
| Mobile layout of `/requests` and the checkout form | NOT RUN | Only the dashboard was captured at 390 px (and it shows D-01). |
| Production build (`vite build` output served), browsers other than Edge, time zones other than the machine's | NOT RUN | E2E used the Vite dev server in headless Edge only. |
| The real development database and seeded demo accounts | NOT RUN | By instruction `db:seed` was not run and the dev DB was not touched; the dev DB was not queried this session (as of the last check it lacked `KL-CAM-002`). The demo path on the demo data is unverified. |
| Repo `client/` `npm test` in place | BLOCKED | D-06: dependencies not installed there. |
| RTM TC-01 to TC-28 status update | NOT DONE | The RTM still says "planned". Mapping evidence to TCs is proposed in the report but the RTM file was not edited. |

## Outstanding release blockers and risks

No functional failure was found, so nothing in the code blocks release on the evidence gathered. These items remain open before the Sprint 1 release can be called accepted:

1. **Review gates:** `DEV4952` has not reviewed the FEAT-03/FEAT-04 integration evidence or the open contracts; the plan forbids self-approval. This evidence does not substitute for review.
2. **D-06:** the repository `client/` cannot run its own tests until `npm ci` is run there. The 21-test result comes from an identical copy.
3. **D-05 follow-up:** any database used by `npm test` must have `npm run db:deploy` applied after this merge, otherwise the same 8 failures recur.
4. **Untested paths above**, especially the race conditions (TC-19, concurrent duplicate submission) and error/loading states, which have automated coverage only.
5. **Requirement-level items not resolved by testing:** BR-08 and FR-09/FR-10 are first-verified in Sprint 2 in the SRS/RTM but delivered in Sprint 1 (baseline conflict recorded in `docs/sprints/plan.md`); the maximum loan-duration policy (OQ-01) is open; the duplicate-request interpretation in FEAT-03 awaits review.
6. **UI defects D-01 to D-04:** cosmetic, none blocks a user action, D-01 is the most visible on mobile.
7. **Scope of this evidence:** one synthetic database, one browser, one run (about three minutes), dev server. It shows the integrated paths work on `52b187c`; it is not a regression history.

## Reproducing the run

The scripts are in `scripts/` (they contain machine-specific paths and expect a `e2e-creds.json` written by the fixture script; no credentials are stored in this repository):
1. Create the throwaway database (`e2e-create-db.mjs`), run `npx prisma migrate deploy` against it, then run `e2e-fixture.mts` (refuses any database not named `kitloop_e2e_test`).
2. Start the API with `DATABASE_URL` pointing at it and `APP_ORIGIN=http://localhost:5173`; start the client with `npm run dev`.
3. `node e2e-phase1.mjs`, restart the API process, `node e2e-phase2.mjs`, then `node e2e-report-gen.mjs`.

## State left behind

- The API process I started was stopped. The Vite dev server on :5173 was already running and was left running.
- Database `kitloop_e2e_test` still exists on the local PostgreSQL server (4 requests, 2 active loans). It is mine and disposable; I did not drop it because dropping a database was outside what you authorized. Drop it with `DROP DATABASE kitloop_e2e_test;` when no longer needed.
- Throwaway fixture credentials and Edge profile folders are in the session scratchpad, outside the repository.
