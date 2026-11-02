# FEAT-01 — Authentication and Authorization Engineering Contract

**Version:** 0.2 (Implementation candidate; teammate review pending)

**Sprint:** 1 — Deliverable 1, 8 November 2026

**Assigned developer:** `yiiipunn`

**Assigned reviewer:** `DEV4952` (review pending)
**Implementation and verification status:** Local API, database migration, seeded data, and React UI implemented. PostgreSQL API tests and builds passed as recorded in Section 8. Browser UI/E2E verification and teammate review remain pending.

## 1. Feature overview

FEAT-01 supplies seeded sign-in, logout, current-user identity, and the shared authentication and role checks used by protected KitLoop operations. Borrowers and Custodians are the two actors. A Borrower acts on their own requests and loans; a Custodian acts on assigned assets and their related requests and loans. Authentication establishes a server-derived principal; domain services enforce the record-specific rules.

| Contract link | Existing IDs | Scope in this contract |
| --- | --- | --- |
| Functional requirements | FR-01, FR-02, FR-03 | Login, logout, and current-user identity. |
| Business rules | BR-03, BR-04, BR-05 | Shared authentication/role gate; borrower ownership and custodian asset-scope checks exercised through domain operations. FEAT-01 does not own those domain queries. |
| Quality requirements | NFR-01, NFR-02; NFR-03 and NFR-04 as cross-cutting API obligations | Protected API rejection, hashed passwords and secret handling, input validation, and safe errors. |
| Related feature dependencies | FEAT-03 and FEAT-04; FEAT-05 when loan views exist | Their endpoints and seeded records are needed for ownership, custodian-scope, and forbidden-checkout acceptance tests. |

The contract follows the proposed system design in `docs/sds-system-level.md`: PostgreSQL-backed opaque server sessions, an HttpOnly cookie, a server-resolved role, and scoped domain queries. Self-registration, password recovery, email verification, multi-role accounts, role/asset assignment administration, university SSO, and separate approval are outside FEAT-01. The public health endpoint and authentication entry point do not disclose private user or loan data.

**Source conflict and review gate:** The official Theme 2 and Deliverable 1 Sprint 1 requirements call for checkout, a persisted loan, and tested borrower/custodian access restrictions. The current draft SRS places FR-08–FR-11, BR-05's first verification, and several checkout rules in Sprint 2; the Feature Inventory, RTM, and SDS follow that later allocation. This FEAT-01 contract specifies the access behavior needed for the official Sprint 1 journey, but does not silently approve a change to those documents or claim FEAT-03/FEAT-04 are implemented. The team must review and version the baseline reconciliation before declaring the Sprint 1 contracts complete.

## 2. Feature-level SDS

### Login and session creation

1. The browser submits a username and password to `POST /api/auth/login` over the configured trusted origin. The API validates required string fields and rejects unexpected identity/role claims in the payload.
2. The server looks up the user by unique username and compares the supplied password with the stored salted password hash. An unknown username and an incorrect password produce the same generic authentication failure; neither creates a session.
3. On success, the server generates a cryptographically random opaque session token, stores only its hash with `userId` and `expiresAt` in PostgreSQL, and sends the session token in an HttpOnly cookie. A sign-in replaces any session token presented for that browser session. The response contains the user's ID and role, never the password hash or session token. A separate session-bound CSRF value is returned in an `X-CSRF-Token` response header on successful login and current-user retrieval for use on state-changing requests.
4. Session duration defaults to 12 hours and is configurable with `SESSION_TTL_HOURS`. The cookie is `kitloop_session`, HttpOnly, SameSite=Lax, scoped to `/api`, and Secure when `NODE_ENV=production`. The API requires `APP_ORIGIN` on state-changing requests. The browser can read the CSRF response header through credentialed CORS from that origin.

### Current user, logout, and protected requests

- `GET /api/auth/me` resolves the cookie to a non-expired session and loads the current user from server records. It returns the server-derived identifier and role. Missing, forged, revoked, or expired sessions return 401 without private data.
- `POST /api/auth/logout` requires a valid session, trusted origin, and session-bound anti-CSRF token. It deletes the stored session, clears the cookie, and returns 204. Reuse of the old cookie fails with 401; logout does not merely clear client state.
- Authentication middleware validates the cookie, token hash, expiry, and current user on every protected request. Shared role middleware allows only the operation's permitted role. The browser, a query parameter, or JSON body cannot select a user ID, role, or custodian authority.
- The domain endpoint applies the final record check: FEAT-03 filters requests by the authenticated Borrower ID or custodian asset assignment; FEAT-04 restricts checkout to assets assigned to the authenticated Custodian; FEAT-05 filters loans by Borrower ID. Direct record-ID access repeats those checks. A foreign record ID returns 404 without revealing whether it exists; a wrong role returns 403. Failed checks cause no mutation.
- Role or custodian-assignment changes take effect from fresh server lookups; protected operations do not trust cached client role data. The interface may hide a control for usability, but that is not authorization.

### Failure and boundary behavior

Malformed or missing fields return 400 with a safe validation message. Invalid credentials return 401 with a generic message. Missing/ended/expired sessions return 401. A signed-in wrong role or failed origin/CSRF check returns 403. An inaccessible record ID returns 404 from its domain endpoint. Unexpected failures return a consistent generic 500 response without stack traces, SQL, internal paths, passwords, tokens, or secrets. Errors follow the SDS shape `{ "error": { "code": "...", "message": "...", "fields": {} } }`, omitting `fields` when irrelevant. Server logs must not print credentials or raw session tokens.

## 3. UI specification

| UI state or action | Required behavior |
| --- | --- |
| Unauthenticated | Show a username/password form; protected views require a valid server session. No role selector or client-supplied user ID. |
| Form validation | Require both fields before submission and show field feedback for missing values. Do not echo passwords in error messages or logs. |
| Submitting | Disable repeat submission, show a loading state, then clear the password field. Network/server errors are safe and retryable. |
| Invalid credentials | Show one generic credential error; do not reveal whether the username exists. Keep the user unauthenticated. |
| Successful login | Fetch or use server-returned identity, retain the separate CSRF value in memory for state-changing calls, then show navigation appropriate to the server-derived Borrower or Custodian role. Refreshing the page rechecks `/api/auth/me` and its CSRF header rather than trusting stored UI state. |
| Forbidden operation | Show an access-denied state for 403 while retaining a valid session. Do not treat hidden buttons as the enforcement mechanism. |
| Expired or revoked session | On a protected 401, clear client identity and protected cached data and route to login with a non-sensitive session-ended message. |
| Logout | Submit the server logout request with CSRF protection, clear local identity and protected data after success, and show login. A subsequent protected request must fail server authentication. |

The React login and role-specific workspace are implemented in `client/src/App.tsx`. They need a browser/E2E check before AC-FEAT-01-12 is complete.

## 4. API specification

All endpoints use JSON where a body is present, the SDS `/api` prefix, HTTPS in deployment, and credentialed requests from the configured origin. The examples name response fields rather than fixing an unreviewed visual design. Error bodies use the safe SDS error shape above.

| Method and path | Authentication / request | Success | Errors, validation, and authorization |
| --- | --- | --- | --- |
| `POST /api/auth/login` | Public entry point; JSON `{ "username": "...", "password": "..." }`; trusted origin required. | 200 with `{ "user": { "id": "...", "role": "BORROWER or CUSTODIAN" } }`, a new HttpOnly session cookie, and a session-bound `X-CSRF-Token` response header. | 400 for absent/non-string fields; 401 for incorrect credentials; 403 for rejected origin; safe 500 for unexpected failure. No session is created on failure. A body-supplied role/user ID is not accepted. |
| `POST /api/auth/logout` | Valid session cookie and `X-CSRF-Token` request header carrying the session-bound anti-CSRF value; no JSON body required. | 204 with empty body; server session revoked and cookie cleared. | 401 for missing, expired, or revoked session; 403 for missing/invalid CSRF or rejected origin; safe 500 for unexpected failure. The user may revoke only the presented session. |
| `GET /api/auth/me` | Valid session cookie; no request body. | 200 with `{ "id": "...", "role": "BORROWER or CUSTODIAN" }` from server records and the session-bound `X-CSRF-Token` response header. | 401 for missing, forged, revoked, or expired session; safe 500 for unexpected failure. No password hash, session token, or private domain records are returned. |

Shared middleware applies 401 for no valid principal and 403 for a principal with the wrong role. Domain endpoints additionally apply ownership or asset scope and return 404 for inaccessible record IDs. No new authorization endpoint is introduced. The implemented CSRF handoff uses the `X-CSRF-Token` response header and requires the configured Origin on writes. The browser must treat the CSRF value as in-memory state. This implementation choice remains subject to teammate review.

## 5. Data specification

| Entity / field | Requirement and constraint |
| --- | --- |
| `User.id` | UUID primary key; immutable server identity. |
| `User.username` | Required, unique login name. |
| `User.passwordHash` | Required salted password hash produced by an appropriate password hashing function; no plaintext password column or stored seed password. |
| `User.role` | Required enum with exactly `BORROWER` or `CUSTODIAN`; one role per seeded user. |
| `Session.tokenHash` | Primary key or unique stored hash of a cryptographically random opaque token. Raw token appears only in the protected cookie and is never stored in the database. |
| `Session.userId` | Required foreign key to `User.id`; a session cannot identify a nonexistent user. |
| `Session.expiresAt` | Required timezone-aware expiry instant, checked for each protected request. Expired/revoked sessions grant no access. |
| `CustodianAsset(custodianId, assetId)` | Proposed SDS composite-key assignment used by domain services for asset scope; only Custodian accounts may be assigned. FEAT-01 reads identity/role; it does not add an assignment-management endpoint. |

The migration creates `User`, `Session`, `CustodianAsset`, and the minimum `Asset`, `BorrowRequest`, and `Loan` tables needed for real authorization tests. The seed creates two Borrowers, two Custodians, and two distinguishable synthetic assets. Passwords are salted scrypt hashes; session tokens are random and only their SHA-256 hashes are stored. Local credentials and secrets are read from ignored environment files; placeholder examples are committed. See `README.md` for setup. The application has no assignment-management API; the seed establishes Custodian asset scope.

## 6. Role and permission matrix

| Operation | Unauthenticated | Borrower | Custodian | Enforcement owner |
| --- | --- | --- | --- | --- |
| Health and login entry | Health/login allowed; private data denied | Allowed | Allowed | Public route boundary; login validates origin. |
| Current identity and logout | 401 | Own session | Own session | FEAT-01 middleware and session service. |
| Catalog read | 401 under proposed SDS authenticated-catalog policy | Shared catalog without private borrowing details | Shared catalog without private borrowing details | FEAT-01 authenticates; FEAT-02 defines catalog projection. |
| Submit request | 401 | As self only | 403 | FEAT-01 role gate; FEAT-03 derives requester from session. |
| Personal requests and loans | 401 | Own records only; foreign IDs return 404 | 403 on Borrower endpoints | FEAT-01 role gate; FEAT-03/FEAT-05 enforce owner in query. |
| Pending request queue and active-loan management view | 401 | 403 | Assigned assets only; foreign IDs return 404 | FEAT-01 role gate; FEAT-03/FEAT-04 enforce assignment. |
| Checkout and return | 401 | 403 | Assigned assets only | FEAT-01 role gate; FEAT-04 enforces asset scope and state. |
| Add/edit/retire inventory; summary | 401 | 403 | Authorized inventory only | FEAT-01 role gate; FEAT-07/FEAT-06 enforce scope. |

FEAT-01 is responsible for authentication, session validity, and coarse role permissions. It does not replace FEAT-03–FEAT-07's record ownership, custodian scope, or domain-state checks. Sprint 1 tests exercise the request/checkout scope actually required by the course; later endpoints inherit the same shared controls and require their own integration tests when introduced.

## 7. Acceptance criteria

AC-FEAT-01-01 through AC-FEAT-01-11 have executed API/database evidence to the extent noted in Section 8. AC-FEAT-01-12 remains open pending browser/E2E verification. Teammate review remains open for all AC.

| AC ID | Observable expected outcome |
| --- | --- |
| AC-FEAT-01-01 | Valid seeded Borrower and Custodian credentials each return 200, correct server-derived ID/role, a usable session cookie, and a separate CSRF response header; no password hash or raw session token appears in JSON. Signing in again with an existing session replaces that session. |
| AC-FEAT-01-02 | Wrong password and unknown username each return the same generic 401 response, create no session, and disclose neither username existence nor a credential value. |
| AC-FEAT-01-03 | A valid cookie returns the correct user ID and role from `/api/auth/me`; a page refresh restores only that server-confirmed identity. |
| AC-FEAT-01-04 | Logout revokes the presented server session and clears its cookie; reuse of the old cookie for `/api/auth/me` or another protected route returns 401. |
| AC-FEAT-01-05 | Missing, forged, revoked, and expired session cookies each receive 401 on protected APIs and expose no private data or mutation. |
| AC-FEAT-01-06 | A signed-in Borrower attempting custodian checkout or inventory mutation receives 403 and causes no change; a Custodian attempting a Borrower-only request receives 403. |
| AC-FEAT-01-07 | Borrower A cannot list or retrieve Borrower B's requests or loans, including a direct foreign ID; the foreign record is absent from lists, direct access returns 404, and no private fields leak. |
| AC-FEAT-01-08 | A Custodian sees only requests/loans for assigned assets and cannot read or mutate an out-of-scope asset's protected records; direct foreign IDs return 404 and failed writes leave records unchanged. |
| AC-FEAT-01-09 | Seeded user passwords are stored only as salted hashes, session tokens only as hashes in PostgreSQL, and session cookies use the SDS security attributes for the environment; no credential or token is logged or returned in API JSON. |
| AC-FEAT-01-10 | Login rejects a disallowed origin; logout rejects a missing/invalid session-bound CSRF token or disallowed origin with 403, without creating or revoking an unrelated session. |
| AC-FEAT-01-11 | Missing/malformed login input returns 400 with safe field feedback; an unexpected auth-service failure returns a generic 500 without stack, SQL, path, credential, or token details. |
| AC-FEAT-01-12 | UI login shows validation/loading/generic invalid-credential states, authenticated navigation follows server identity, expired-session 401 clears protected UI state, forbidden 403 retains the session, and successful logout returns to login. |

## 8. Software Test Specification

The table defines stable test designs. Executed integration tests use real PostgreSQL through `server/tests/auth.test.ts`; `server/tests/health.test.ts` covers the public health route. A dedicated test database is required. Some planned unit and browser cases remain unexecuted and are identified below.

| TEST ID | Linked AC | Level | Preconditions and input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-FEAT-01-01 | AC-FEAT-01-01, AC-FEAT-01-09 | Unit | Known salted hash; correct and incorrect passwords | Call credential verifier with each password | Only the correct password matches. |
| TEST-FEAT-01-02 | AC-FEAT-01-01, AC-FEAT-01-02 | API + database integration | Seed one Borrower and one Custodian; clean session table | Login with each valid account, sign in again using an existing cookie, then try wrong password and unknown username | Valid calls return 200 and correct roles/new cookies, the old presented session is invalidated; invalid calls return identical generic 401 bodies and add no session. |
| TEST-FEAT-01-03 | AC-FEAT-01-03, AC-FEAT-01-05 | API + database integration | Valid, absent, forged, revoked, and past-expiry cookies | Call `/api/auth/me` and a protected route under each condition | Valid returns current ID/role; all invalid cases return 401 without private data. |
| TEST-FEAT-01-04 | AC-FEAT-01-04 | API + database integration | Logged-in Borrower with valid CSRF token | POST logout, then reuse saved cookie for `/api/auth/me` and request view | 204/cleared cookie, session record revoked, both reused-cookie calls return 401. |
| TEST-FEAT-01-05 | AC-FEAT-01-05, AC-FEAT-01-06 | API + database integration | Seeded Borrower/Custodian and protected request, checkout, inventory operations | Call anonymously, then call custodian mutations as Borrower and Borrower-only request as Custodian | Anonymous calls return 401; wrong-role calls return 403; database state is unchanged. |
| TEST-FEAT-01-06 | AC-FEAT-01-07 | API + database integration | Borrowers A/B with distinct requests and loans | As A, list records and request B's direct IDs | Only A's records appear; direct foreign IDs return 404 without B's details. |
| TEST-FEAT-01-07 | AC-FEAT-01-08 | API + database integration | Two Custodians with different asset assignments, pending requests and active loans | As Custodian A, list scoped records and use direct IDs or checkout for B's asset | B's records are absent; direct access returns 404; out-of-scope mutation fails with unchanged database state. |
| TEST-FEAT-01-08 | AC-FEAT-01-09 | Database/configuration inspection | Seeded user/session rows and environment examples | Inspect passwordHash/tokenHash values, absence of plaintext columns, ignored secrets and response/log fields | Hashes are stored; plaintext passwords, raw session tokens and real secrets are absent from database, API JSON and logs. |
| TEST-FEAT-01-09 | AC-FEAT-01-01, AC-FEAT-01-09 | API integration | Valid login in development and production-like cookie configuration | Inspect `Set-Cookie`, `X-CSRF-Token`, and auth JSON | HttpOnly is set; production has Secure and SameSite=Lax; CSRF value is separate from the session cookie; JSON omits password hash/session token; configured origins alone receive credentialed CORS. |
| TEST-FEAT-01-10 | AC-FEAT-01-10 | API + database integration | Valid session, CSRF value obtained from login or `/api/auth/me`, missing/wrong CSRF value and disallowed origins | POST login/logout under each origin/token condition | Allowed login/logout work using `X-CSRF-Token`; rejected calls return 403 and do not create/revoke a session. |
| TEST-FEAT-01-11 | AC-FEAT-01-11 | API integration | Missing/non-string login fields and injected auth-service failure | POST login in each condition | Validation returns 400 with usable field feedback; injected failure returns sanitized generic 500. |
| TEST-FEAT-01-12 | AC-FEAT-01-05, AC-FEAT-01-06 | Unit | Principal/role and controlled session expiry time | Exercise authentication/role decision functions | Invalid or expired principal is rejected; authenticated wrong role is forbidden; valid matching role proceeds to domain check. |
| TEST-FEAT-01-13 | AC-FEAT-01-03, AC-FEAT-01-04, AC-FEAT-01-12 | Selected UI/E2E | Running UI/API/database, seeded accounts | Login as each role, refresh, trigger protected 401 and 403, then logout | Navigation follows server identity; 401 clears protected UI state; 403 preserves session; logout returns to login and old cookie cannot access private data. |

### Execution and TDD record (local working tree, 2026-11-02)

| Evidence | Actual command/result | Linked TEST and AC |
| --- | --- | --- |
| First red run | `npm test` from `server/`: two new authentication tests failed with 404 instead of expected 401; health passed (2 failed, 1 passed). Auth routes did not yet exist. | TEST-FEAT-01-02/03; AC-FEAT-01-02/05. |
| First green run | `npm test`: 3 passed, 0 failed after auth routes were implemented. | TEST-FEAT-01-02/03; AC-FEAT-01-02/05. |
| Domain red run | `npm test`: after adding authorization cases, 3 tests failed on missing domain routes (404 instead of 401/200); 8 passed. An earlier run also found a 31-character local test secret, below the server's 32-character minimum; this private test configuration was corrected without lowering validation. | TEST-FEAT-01-05/06/07; AC-FEAT-01-05–08. |
| Domain green and expanded regression | `npm test`: 19 passed, 0 failed, 0 skipped across two files, using `kitloop_auth_test` PostgreSQL. Includes concurrent checkout (one 201, one 409), scoped inventory editing, request-owner spoof rejection, stored hash assertions, expiry, CSRF, generic 500, and production Secure-cookie configuration. | TEST-FEAT-01-02–11 (integration coverage); AC-FEAT-01-01–11. |
| Build and lint | `npm run build` in `server/` passed TypeScript `--noEmit`; `npm run build` and `npm run lint` in `client/` passed. | Implementation gate; no UI behavior claimed. |
| Database | `npm exec prisma migrate status` reported one migration and `kitloop_auth_dev` schema up to date. Test database was migrated and integration tests performed read/write cleanup. `npm run db:seed` succeeded locally before the expanded tests. | TEST-FEAT-01-08 (partial configuration/database inspection); AC-FEAT-01-09. |
| UI check attempt | Local API and Vite servers started, but browser automation returned “The browser access host is unavailable”; no UI action or visual outcome was observed. | TEST-FEAT-01-13 / AC-FEAT-01-12 **not executed**. |

`TEST-FEAT-01-01` and `TEST-FEAT-01-12` remain unexecuted as isolated unit cases; their credential and role behavior has API integration coverage. `TEST-FEAT-01-08` has partial inspection coverage; a full secret/log audit is pending. `TEST-FEAT-01-13` is unexecuted. The RTM's TC IDs remain planned in the draft matrix and are not marked passed by these feature tests. No release commit, PR review, staging integration, or instructor approval is asserted.

## 9. Definition of Done

FEAT-01 is complete only when:

1. FR-01–FR-03 and the Sprint 1 portions of BR-03–BR-05/NFR-01–NFR-04 meet their AC on the integrated UI/API/PostgreSQL application; later operations receive the same gates when added.
2. Authentication, role checks, session expiry, logout invalidation, ownership and custodian scope are enforced on the backend. Passwords and raw session tokens are not stored in plaintext.
3. Every AC above has one or more executed, meaningful tests with actual assertions and recorded result/version. Unit tests cover credential/expiry logic; API/database tests cover sessions, ownership and scope; a selected UI/E2E journey covers login, identity, expiry/forbidden behavior and logout. Failed or skipped tests are disclosed and not called complete.
4. For meaningful access-rule work, preserve a failing intended-behavior test before correction and a passing result afterward; do not weaken assertions to obtain green output.
5. `yiiipunn` and `DEV4952` review the contract and implementation in their actual roles, with a substantive teammate PR review into sprint staging; reviewed integration and acceptance checks precede the release PR. No review or merge is asserted here.
6. Current setup, seed, environment examples, session configuration, API/data conventions, RTM mapping, and known limitations are documented. Real secrets stay out of Git and the client.
7. The SRS/inventory/RTM/SDS Sprint 1 allocation conflict noted above is resolved through a reviewed baseline revision or explicitly recorded instructor/TA agreement before claiming the complete course Sprint 1 outcome.

## 10. Traceability summary

| Requirement ID | Feature ID | AC ID | TEST ID | Planned verification level |
| --- | --- | --- | --- | --- |
| FR-01 | FEAT-01 | AC-FEAT-01-01, AC-FEAT-01-02, AC-FEAT-01-12 | TEST-FEAT-01-01, TEST-FEAT-01-02, TEST-FEAT-01-09, TEST-FEAT-01-13 | Unit; API/database integration; UI/E2E |
| FR-02 | FEAT-01 | AC-FEAT-01-04, AC-FEAT-01-10, AC-FEAT-01-12 | TEST-FEAT-01-04, TEST-FEAT-01-10, TEST-FEAT-01-13 | API/database integration; UI/E2E |
| FR-03 | FEAT-01 | AC-FEAT-01-03, AC-FEAT-01-05, AC-FEAT-01-12 | TEST-FEAT-01-03, TEST-FEAT-01-13 | API/database integration; UI/E2E |
| BR-03 | FEAT-01 | AC-FEAT-01-05, AC-FEAT-01-06 | TEST-FEAT-01-03, TEST-FEAT-01-05, TEST-FEAT-01-12 | Unit; API/database integration |
| BR-04 | FEAT-01 shared gate; FEAT-03/FEAT-05 record check | AC-FEAT-01-07 | TEST-FEAT-01-06 | API/database integration |
| BR-05 | FEAT-01 shared gate; FEAT-03/FEAT-04 scoped query | AC-FEAT-01-08 | TEST-FEAT-01-07 | API/database integration |
| NFR-01 | FEAT-01 and protected domain endpoints | AC-FEAT-01-05, AC-FEAT-01-06, AC-FEAT-01-07, AC-FEAT-01-08 | TEST-FEAT-01-03, TEST-FEAT-01-05, TEST-FEAT-01-06, TEST-FEAT-01-07, TEST-FEAT-01-12 | Unit; API/database integration |
| NFR-02 | FEAT-01 | AC-FEAT-01-09 | TEST-FEAT-01-01, TEST-FEAT-01-08, TEST-FEAT-01-09 | Unit; database/configuration inspection; API integration |
| NFR-03 (cross-cutting) | FEAT-01 API boundary | AC-FEAT-01-11 | TEST-FEAT-01-11 | API integration |
| NFR-04 (cross-cutting) | FEAT-01 API boundary | AC-FEAT-01-11 | TEST-FEAT-01-11 | API integration |

All twelve AC have a TEST mapping in Section 8. AC-FEAT-01-12 is pending UI execution. BR-04 and BR-05 now have integration coverage through minimum request, checkout, loan, and inventory-create routes, while full later-sprint inventory/return/report operations remain out of scope. The RTM currently schedules loan/checkout and their scope tests in Sprint 2, while the official course Sprint 1 slice needs those paths; this is an **allocation conflict**, not missing IDs. Teammate review and staging integration remain open.

## 11. Version and change history

| Version | Date | Author / owner | Change | Review status |
| --- | --- | --- | --- | --- |
| 0.1 (Draft) | 2026-11-02 | `yiiipunn` (assigned developer; AI-assisted draft) | Initial FEAT-01 feature SDS, UI/API/data contract, AC, STS, DoD, and traceability; recorded Sprint 1 baseline conflict. | `DEV4952` review pending; no approval claimed. |
| 0.2 (Implementation candidate) | 2026-11-02 | Local implementation by AI assistant for assigned developer review | Fixed 12-hour default and cookie/CSRF handoff, added API/database/UI implementation, migration/seed, red/green and 19-test evidence, and disclosed unexecuted UI/isolated unit cases. | `DEV4952` review pending; no approval claimed. |

**Open decisions for review:** Confirm the chosen 12-hour default, cookie name, CSRF header handoff, seeded CustodianAsset assignment, and authenticated catalog-visibility policy under SRS OQ-02. The team must reconcile the Sprint 1 allocation conflict in the draft baseline. Do not infer instructor approval from this implementation candidate.
