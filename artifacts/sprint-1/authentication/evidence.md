# FEAT-01 Authentication and Authorization: Evidence Index

Prepared by QA for the Sprint 1 PR. Developer: `yiiipunn`. Reviewer: `DEV4952` (review pending). Target branch: `sprint-1-staging`.
Evidence collected: 2026-11-02, local Windows machine, Node v24.19.0, PostgreSQL 18. Nothing here claims review, approval or merge.

## 1. Feature and linked requirements

| Item | Value |
| --- | --- |
| Feature | FEAT-01 User Authentication and RBAC (called F-01 in chat) |
| Contract | `docs/sprints/sprint-1/FEAT-01-authentication.md` (v0.2, implementation candidate) |
| Functional | FR-01 login, FR-02 logout, FR-03 current user |
| Business rules | BR-03, BR-04, BR-05 (ownership and custodian scope exercised through domain endpoints) |
| Quality | NFR-01, NFR-02; NFR-03 and NFR-04 as cross-cutting API obligations |
| Source documents read | `docs/srs.md`, `docs/feature-inventory.md`, `docs/sds-system-level.md`, `docs/traceability-matrix.md`, `docs/sprints/plan.md`, the FEAT-01 contract (contains AC, STS and DoD) |

## 2. Git state (read-only inspection)

| Item | Value |
| --- | --- |
| Current branch | `feature/authentication` |
| HEAD | `373e173` "Implement FEAT-01 authentication and scoped access" (author `Codex`) |
| Remote | `origin/feature/authentication` is at `373e173`, so the auth work is already committed and pushed |
| Merge base with `sprint-1-staging` | `6f19d1a`; HEAD is exactly one commit ahead (22 files, +1936 / -414) |
| Working tree | 6 modified and 8 untracked paths, all under `client/` (the landing page and visual redesign; see section 8) |

## 3. Commands run and actual results

All logs are in `artifacts/sprint-1/authentication/logs/`. Each log records the working directory, command, date and exit code.

| # | Command (working directory) | Result | Exit code | Log |
| --- | --- | --- | --- | --- |
| 1 | `npm test` (`server`) | PASS: Test Files 2 passed (2); Tests 19 passed (19); 0 failed, 0 skipped | 0 | `server-test.log` |
| 2 | `npx vitest run --reporter=verbose` (`server`) | PASS: 19 named tests listed (section 4) | 0 | `server-test-verbose.log` |
| 3 | `npm run build` = `tsc --noEmit` (`server`) | PASS | 0 | `server-build.log` |
| 4 | `npx prisma migrate status` (`server`) | PASS: "Database schema is up to date!" | 0 | `server-prisma-migrate-status.log` |
| 5 | `npm run lint` (`client`, working tree) | PASS, no findings | 0 | `client-lint-worktree.log` |
| 6 | `npm run build` (`client`, working tree) | PASS | 0 | `client-build-worktree.log` |
| 7 | `npm run lint` (client at committed `373e173`, extracted with `git archive` into a scratch folder; `node_modules` linked, nothing installed) | PASS | 0 | `client-lint-head.log` |
| 8 | `npm run build` (client at committed `373e173`, same method) | PASS | 0 | `client-build-head.log` |
| 9 | Client tests | BLOCKED: `client/package.json` has no test script | n/a | none |

Rows 7 and 8 verify the exact content that is already committed, independent of the uncommitted redesign.
Server tests run against the dedicated `kitloop_auth_test` database. `server/vitest.config.ts` refuses to run unless the database name contains "test".

## 4. Test evidence files

- `server/tests/auth.test.ts`: 18 tests (name list below).
- `server/tests/health.test.ts`: 1 test, `GET /api/health`.

Executed tests (from `logs/server-test-verbose.log`): rejects an unauthenticated current-user request; rejects invalid login without creating a session; logs in both roles and retrieves server-derived identity; replaces a presented session and stores only password and token hashes; returns the same generic error for unknown user and wrong password; revokes the server session on logout and rejects reuse; rejects forged and expired sessions; rejects missing CSRF and disallowed login origin; validates login input and sanitizes malformed JSON errors; returns a generic response for an unexpected authentication failure; marks session cookies Secure in production configuration; rejects unauthenticated and wrong-role domain operations; allows only the borrower's own direct request and loan records; derives a new request owner from the authenticated session; scopes a custodian's request queue and rejects out-of-scope checkout; restricts inventory editing to the assigned custodian; persists authorized checkout and prevents a duplicate active loan; allows only one checkout when two requests race for an available asset; health route returns the service response.

## 5. Acceptance criteria status

| AC | Status | Evidence | Gap |
| --- | --- | --- | --- |
| AC-FEAT-01-01 valid login, both roles | VERIFIED | Test "logs in both roles…"; screenshots 03 and 07 | |
| AC-FEAT-01-02 invalid credentials | VERIFIED | Tests "rejects invalid login…" and "returns the same generic error…"; screenshot 02 | Session-row count is not asserted |
| AC-FEAT-01-03 current user | VERIFIED | `/me` assertions in the login test; screenshot 04 (page reload restores identity) | |
| AC-FEAT-01-04 logout | VERIFIED | Test "revokes the server session on logout…"; screenshots 05 and 06 | DB row deletion and reuse on a domain route are not asserted |
| AC-FEAT-01-05 missing, forged, revoked, expired | VERIFIED | Tests on `/me` and `/requests/mine` | Forged and expired are asserted only on `/me` |
| AC-FEAT-01-06 wrong role 403 | VERIFIED | Test "rejects unauthenticated and wrong-role domain operations" | |
| AC-FEAT-01-07 borrower ownership | VERIFIED | Test "allows only the borrower's own…" | No check that the 404 body leaks nothing |
| AC-FEAT-01-08 custodian scope | VERIFIED | Scoped queue, checkout and PATCH tests | |
| AC-FEAT-01-09 hashes, cookies, no leaks | PARTIAL | Hash-format and Secure-cookie assertions; static scan (section 7) | Full log and secret audit (TEST-FEAT-01-08) not executed |
| AC-FEAT-01-10 origin and CSRF | VERIFIED | Test "rejects missing CSRF and disallowed login origin" | |
| AC-FEAT-01-11 validation and safe 500 | VERIFIED | Validation and mocked-failure tests | Field feedback is a single `credentials` field |
| AC-FEAT-01-12 UI | PARTIAL, not a recorded test | Screenshots 01 to 07 and the API call list in section 6 | No automated E2E (TEST-FEAT-01-13). Not exercised: loading state, 401-mid-session clearing, 403 retaining the session. Captured on the uncommitted UI (section 6) |
| TEST-FEAT-01-01 and -12 (unit) | NOT TESTED | No unit test files exist | Contract itself discloses this |

## 6. Authentication scenarios verified in the running application

Captured on 2026-11-02 with headless Edge against the running Vite client (`http://localhost:5173`), API (`http://localhost:3000`) and the seeded dev database. Demo credentials were read from the ignored `server/.env` in-process and are not printed or captured. Passwords are masked or empty in every screenshot.

| Screenshot | What it shows |
| --- | --- |
| `screenshots/01-login-page.png` | Unauthenticated login form at `/login` |
| `screenshots/02-invalid-credentials-generic-error.png` | A wrong password returns only "Invalid username or password."; the password field is cleared |
| `screenshots/03-borrower-dashboard.png` | `borrower.demo` signs in and reaches the borrower workspace |
| `screenshots/04-borrower-refresh-restores-identity.png` | Full reload of `/dashboard` stays signed in via `/auth/me` |
| `screenshots/05-after-logout-login-page.png` | Sign out returns to `/login` |
| `screenshots/06-protected-route-redirects-to-login.png` | `/dashboard` after logout redirects to `/login` |
| `screenshots/07-custodian-dashboard.png` | `custodian.demo` reaches the custodian workspace |

API calls recorded during the run: login 401 for the wrong password, login 200 for each demo role, then assets, `/requests/mine` or `/requests/pending`, `/loans/mine` or `/loans/active` all 200, `/auth/me` 200 after reload, logout 204, `/auth/me` 401 afterwards. The 204 lines on login and logout are CORS preflight responses.

Limitation: these screenshots come from the working tree, which includes the uncommitted redesign. The authentication logic in `client/src/App.tsx` (`api`, `signIn`, `signOut`, session handling) is unchanged from the committed version, but the committed UI itself was not run in a browser. A reviewer wanting UI evidence for the exact PR content should rerun it from a clean checkout of `373e173`.

## 7. Safety checks

| Check | Result |
| --- | --- |
| Secret scan | Compared the values of every password, secret and database URL in `server/.env` and `server/.env.test` against all 74 tracked and untracked non-ignored files, including `artifacts/`: 0 matches |
| Env files | `server/.env` and `server/.env.test` are gitignored (`.gitignore` lines 5 and 6). Only `server/.env.example` and `server/.env.test.example` are tracked, and they hold placeholders |
| Generated files | `client/dist` and `node_modules` are ignored; none are tracked |
| Dependencies | The PR adds `@prisma/client` and `prisma` to `server/package.json`, both needed. `client/package.json` is unchanged |
| Server logging | The only `console` call in `server/src` is the startup line (no credentials or tokens) |
| Personal data | Seed users and assets are synthetic; the dashboard shows only an 8-character account id prefix |
| Note | During the earlier audit in this session, the test-only `SESSION_CSRF_SECRET` from the gitignored `server/.env.test` was printed once into the chat output. It is not in the repository, but rotate it if that transcript is shared |

## 8. TDD Red/Green evidence

- **Git history:** none. The authentication tests and implementation arrive together in the single commit `373e173`. `git log -- server/tests` shows that commit and the scaffold's health-test commit `32088e6`. There is no separate failing-test commit.
- **Retained output:** no saved Red-run output exists in the repository or in `artifacts/`.
- **Narrative only:** the contract section 8 records an "Execution and TDD record" (two failed then passed runs, a domain red run, 19 passed). That is a written account, not retained raw output.
- No retrospective Red/Green evidence has been created. DoD item 4 is therefore supported by narrative alone.

## 9. Missing or blocked verification

1. No automated UI/E2E test (AC-12, TEST-FEAT-01-13).
2. Unit tests for the credential verifier and role decisions (TEST-FEAT-01-01 and -12) do not exist.
3. No client test script.
4. Log and secret audit (TEST-FEAT-01-08) is only partly covered by static inspection.
5. No retained Red-phase test output.
6. Open DoD items: teammate review, RTM TC mapping update, and the Sprint 1 allocation conflict between the SRS and course requirements (contract section 1, DoD item 7).

## 10. Scope separation for the PR

**Authentication work (already in `373e173`, no new staging needed):**
`.gitignore`, `README.md`, `docs/sprints/sprint-1/FEAT-01-authentication.md`, `server/.env.example`, `server/.env.test.example`, `server/package.json`, `server/package-lock.json`, `server/prisma/**`, `server/src/{api-error,app,auth,db,domain,password}.ts`, `server/tests/auth.test.ts`, `server/vitest.config.ts`, and the committed client login UI (`client/src/App.tsx`, `App.css`, `index.css`).

**Uncommitted and unrelated to FEAT-01 (exclude from the auth PR; use a separate landing-page/visual PR):**
`client/index.html`, `client/public/favicon.svg`, `client/src/App.css`, `client/src/App.tsx`, `client/src/index.css`, `client/src/main.tsx`, `client/src/Landing.tsx`, `client/src/Landing.css`, `client/src/Login.css`, `client/src/SignUp.tsx`, `client/src/ui.css`, `client/src/navigation.ts`, `client/src/assets/light-trails.svg`, and `client/src/components/` (Ambient, Auth, Backdrop, Brand, KitLoopLogo, ambientPointer).

Mixed items to be aware of in that set:
- `client/src/App.tsx` combines routing (`/`, `/login`, `/signup`, `/dashboard`, redirects) with the login form. The auth functions are untouched.
- The dashboard's "Equipment catalog" heading is empty (`<h2></h2>`) in the working tree, where the committed version has the text; this is an accessibility regression to fix before that PR.
- The Sign Up page is a disabled preview and no backend registration exists.

**Evidence files (this task):** `artifacts/sprint-1/authentication/evidence.md`, `logs/*.log`, `screenshots/*.png`.

## 11. Readiness

- **Auth backend, committed work:** ready for teammate review, with the gaps above disclosed.
- **FEAT-01 Definition of Done:** not met until items in section 9 are closed.
- **Working tree:** not ready to stage. It contains unrelated work and should be separated first.

## 12. PR review checklist

- [ ] Confirm `sprint-1-staging` merge base is `6f19d1a` and the PR contains only `373e173` plus evidence.
- [ ] Re-run `npm test`, `npm run build` in `server`, and `npm run lint`, `npm run build` in `client`; compare with section 3.
- [ ] Verify `.env` and `.env.test` are not in the diff and examples hold placeholders only.
- [ ] Review `server/src/auth.ts`: cookie flags, origin and CSRF checks, session expiry, generic errors.
- [ ] Review `server/src/domain.ts`: every route behind `requireAuth`; role gates; ownership and custodian scope in queries; 404 for foreign records.
- [ ] Review `server/prisma/schema.prisma`, the migration and `seed.ts` (hashed passwords only).
- [ ] Review the test assertions listed under gaps in section 5.
- [ ] Decide how to close AC-12 (E2E test or documented manual evidence) and the unit-test gap.
- [ ] Confirm the Sprint 1 allocation conflict is resolved or recorded.
- [ ] Confirm the landing-page redesign is excluded from this PR.
