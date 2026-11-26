# CR-01 Borrowing Quota Management — Software Test Specification

| Document control | Value |
| --- | --- |
| Document ID | L7A-CR01-STS (evidence L7A-EV07) |
| Version | CR-01 contract r2 (draft). r2 revises TC05, TC08 and TC10, adds TC13–TC20, and adds separate dependency checks (§6). |
| Status | **Specified only. No case has been implemented or executed. DEV4952 review PENDING.** TC13–TC20 trace to *proposed* AC13–AC20, which are not in Issue #78 (pending agreement). |
| Relationship to existing test catalog | Supplements the canonical [RTM](../../traceability-matrix.md) (TC-01–TC-28), which remains the Sprint 1 test catalog. The repository had no standalone STS before CR-01, so this versioned supplement adds CR01-TC01–TC12 without renumbering or replacing any existing TC. |
| Change request | [Issue #78](https://github.com/gearstack-studio/kitloop/issues/78) |
| Baseline under test (RED) | `8ac350a` (tree-identical to accepted `e5ed70d`). Re-verify before RED. |
| Criteria | [CR-01 acceptance criteria](CR-01-acceptance-criteria.md) |

## 1. Strategy

| Phase | Rule |
| --- | --- |
| RED | Commit CR01 tests first. Run them unchanged against the pre-change implementation. A **changed-behavior** case must fail *because the old code accepts an over-quota request or lacks the quota endpoint*. Setup errors, typos and fixture failures do not count as RED. Record the command, tested commit, time, and pass/fail/skip counts. |
| GREEN | Implement the agreed BR-14 contract. Rerun the **same** tests without editing assertions. |
| Characterization | Cases marked "C" must pass before **and** after the change. They prove the preserved behavior was really tested. |
| Regression | Run the existing full server and client suites and the selected E2E specs. Only fixture-isolation edits are allowed in existing tests ([impact analysis §14](CR-01-impact-analysis.md#14-regression-protection-strategy-l7a-ev12)). |
| Evidence | Store raw outputs as `artifacts/lab-07/cr-01/*-red.txt` and `*-green.txt` (proposed paths) in Part B. Nothing is recorded in this phase. |
| Scope boundary (r2) | CR01 cases verify the **quota**. Behavior of cancel, decline and return themselves is verified by their own suites and by the dependency checks in §6 (DEP-LC, DEP-RT), which are **not CR-01 tests**. |
| BLOCKED | A case or row marked **[DEP-RT]** needs the return endpoint, which does not exist at `e5ed70d`. Until DEP-RT is released it is reported as BLOCKED, never as passed or skipped-as-passing. |
| Configuration (proposed, Part B) | The server and E2E test configuration sets `BORROWING_QUOTA: "enabled"` next to the existing `REQUEST_LIFECYCLE_WRITES: "enabled"`. Cases that need activation off (TC19) or phase 1 set both variables explicitly and restore them, as `lifecycle-rollout.test.ts` does. |

**Test levels.**
- U: server unit (Vitest, no database).
- I: API integration (Vitest + supertest against an isolated PostgreSQL database).
- K: client component and app tests (Vitest + React Testing Library, jsdom, mocked HTTP).
- E: Playwright E2E against the dedicated `kitloop_e2e_*` database.

## 2. Environment and commands

| Level | Candidate file (Part B, new unless noted) | Command | Prerequisites |
| --- | --- | --- | --- |
| U | `server/tests/borrowing-quota-unit.test.ts` | `cd server && npx vitest run tests/borrowing-quota-unit.test.ts` | Node per `server/package.json`; Prisma client generated |
| I | `server/tests/borrowing-quota.test.ts` | `cd server && npx vitest run tests/borrowing-quota.test.ts` | Isolated test database in ignored `server/.env.test`; all migrations applied (`npm run db:deploy` against the test database). CI equivalent: `docker compose --profile test run --rm test`. |
| I (regression) | existing `server/tests/*.test.ts` | `cd server && npm test` | Same |
| K | `client/tests/borrowing-quota.test.tsx` | `cd client && npx vitest run tests/borrowing-quota.test.tsx` | `npm ci` in `client/` |
| K (regression) | existing `client/tests/*.test.tsx` | `cd client && npm test && npm run build && npm run lint` | Same |
| E | `e2e/tests/09-borrowing-quota.spec.ts` | `cd e2e && npx playwright test tests/09-borrowing-quota.spec.ts` | E2E environment per `e2e/README.md`; global setup recreates and seeds the e2e database |
| E (regression) | `e2e/tests/02`, `04`–`07` | `cd e2e && npx playwright test tests/02-request-checkout-journey.spec.ts tests/04-request-lifecycle.spec.ts tests/05-loan-duration.spec.ts tests/06-readable-names.spec.ts tests/07-borrower-navigation.spec.ts` | Same. Do not overwrite accepted UAT evidence; the guarded run is `npm run test:e2e:guarded`. |

## 3. Shared synthetic fixtures

All data is synthetic and created per test. Identifiers carry a `randomUUID()` suffix, as the existing suites do, and records are removed in `afterAll`. **Each CR01 case uses fresh borrowers**, so usage never leaks between cases (R-03).

| Fixture | Construction |
| --- | --- |
| `borrower()` | `prisma.user.create` with role `BORROWER` and a hashed synthetic password, then `POST /api/auth/login` for the session cookie and `X-CSRF-Token` (pattern from `borrow-requests.test.ts`) |
| `custodian()` | Same with role `CUSTODIAN` |
| `asset({ retired? })` | `Asset` row plus `CustodianAsset` for custodian C1. Distinct ID per call. |
| `pending(b, a)` | `BorrowRequest { borrowerId: b, assetId: a, status: PENDING }` inserted directly (simulates history) or created through the API (when the case tests submission) |
| `activeLoan(b, a)` | `BorrowRequest { status: CHECKED_OUT }` plus `Loan { requestId, assetId: a, borrowerId: b, checkoutCustodianId: C1, checkedOutAt: now − 1 h, dueAt: now + 7 d, returnedAt: null }`. Needs a distinct asset per active loan (`Loan_one_active_per_asset`). |
| `returnedLoan(b, a)` | As `activeLoan` with `returnedAt: now − 1 min`, `returnCustodianId: C1` (`Loan_return_actor_together`, `Loan_return_after_checkout`) |
| `terminal(b, a, status)` | `BorrowRequest` with status `DECLINED`, `CANCELLED` or `EXPIRED`, plus `closedAt`, `closeReason` and `closedById` (C1 or the borrower), satisfying `BorrowRequest_closure_consistent` |
| `usage(b, P, L)` | `P × pending` plus `L × activeLoan`, each on a new asset |
| `quota(s)` | `GET /api/borrowing-quota` with session `s` |
| `snapshot()` | Ordered dump of all `BorrowRequest` and `Loan` rows for the fixture's asset IDs and user IDs. Used to assert "no writes" by deep equality. |
| `cancel(s, id)`, `decline(c, id, reason)` | Existing lifecycle API calls (`POST /api/requests/:id/cancel` and `/decline`), with Origin and CSRF, as in `request-lifecycle.test.ts` |
| `fixtureReturn(loanId)` | `prisma.loan.update({ returnedAt: now, returnCustodianId: C1 })`. This simulates a persisted return exactly as `reconcile-competing-requests.test.ts` already does ("No return API exists yet"). It verifies quota derivation only, not the return operation. |
| `injectSerializationFailures(n, before?)` | `vi.spyOn(prisma, "$transaction")`. The next *n* calls reject with `Prisma.PrismaClientKnownRequestError` code `P2034`; the optional `before` hook (for example, committing a competing row) runs first; later calls pass through. The call count is the number of attempts. This follows the existing spy pattern in `borrow-requests.test.ts` L202. **Seam dependency:** it relies on one `prisma.$transaction` call per attempt, as at `e5ed70d`. |

## 4. Test cases

Every case has **Actual result: NOT EXECUTED** and **Verdict: NOT RUN**. The "predicted pre-change outcome" is a hypothesis for planning RED. It is not a result.

### CR01-TC01: accept a request at zero usage

| Field | Specification |
| --- | --- |
| Requirement / AC | FR-06, BR-14 / CR01-AC01 (S1–S3) |
| Objective | Below-limit submissions succeed exactly as before, and the quota reports correct values at 0 and 1 usage |
| Level / type | U + I; positive, boundary, characterization (201) plus changed behavior (endpoint) |
| Preconditions | Isolated database migrated; C1, B1 and assets A1, A2 created |
| Fixtures | `usage(B1, 0, 0)`; for S2, a fresh B1' with `usage(B1', 0, 1)` |
| Input | `POST /api/requests { "assetId": A1 }` with B1 session, Origin `http://localhost:5173` and CSRF; `GET /api/borrowing-quota` |
| Steps | 1. U: assert `remainingCapacity(P, L)` and `canSubmit(P, L)` for every P, L ∈ {0…4} against the formula table in [IA §4](CR-01-impact-analysis.md#4-quota-definition-and-boundary-table). 2. I: GET quota and expect `{0,0,0,2,3,2,true}`. 3. POST A1. 4. Assert response and database. 5. GET quota. 6. S2: repeat for B1'. |
| Expected HTTP | Step 2: 200. Step 3: 201. S2 POST: 201. |
| Expected response | 201 body `status: "PENDING"`, `borrowerId` equals B1's ID, `assetId: A1`, `submittedAt` within the step window. Quota after step 3: `{1,0,1,2,3,1,true}`. Quota after S2: `{1,1,2,2,3,1,true}`. Quota responses have exactly these 7 keys and `Cache-Control: no-store`. |
| Expected database | One new PENDING row for (B1, A1); no `Loan` rows; A1 `available: true` in `GET /api/assets` |
| Regression obligations | TC-06 and TC-21 (non-reservation, persisted pending request) |
| Predicted pre-change outcome | Steps 3–4 pass (C). Steps 2 and 5 fail: `GET /api/borrowing-quota` returns 404 `NOT_FOUND` "API route not found". U fails because the module does not exist. |
| Files / command | `server/tests/borrowing-quota-unit.test.ts`, `server/tests/borrowing-quota.test.ts`; see §2 |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC02: last slot accepted at each boundary

| Field | Specification |
| --- | --- |
| Requirement / AC | FR-06, BR-14 / CR01-AC02 (S1–S3) |
| Objective | A request that brings usage exactly to a limit is accepted (no off-by-one), and capacity becomes 0 |
| Level / type | I; boundary, positive |
| Preconditions | As TC01 |
| Fixtures | Three fresh borrowers: Ba `usage(1,1)`, Bb `usage(0,2)`, Bc `usage(1,0)`; one fresh available asset each |
| Input | One otherwise-valid POST per borrower |
| Steps | For each borrower: GET quota, POST, assert, GET quota |
| Expected HTTP | 201 ×3 |
| Expected response | Ba `{2,1,3,2,3,0,false}`; Bb `{1,2,3,2,3,0,false}`; Bc `{2,0,2,2,3,0,false}` |
| Expected database | Exactly one new PENDING row per borrower; no other rows changed (`snapshot()` diff contains only the inserted row) |
| Regression obligations | TC-06 |
| Predicted pre-change outcome | POSTs pass (C); quota reads fail with 404 |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC03: pending limit rejects with no writes (RED)

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14, NFR-03 / CR01-AC03 (S1–S3) |
| Objective | At P = 2 a further otherwise-valid request is rejected with the new code and nothing changes |
| Level / type | I; negative, boundary, changed behavior |
| Preconditions | As TC01 |
| Fixtures | B1 `usage(2,0)` (A1, A2 pending, inserted directly); A3 available |
| Input | `POST /api/requests { "assetId": A3 }` ×3 in sequence |
| Steps | 1. `before = snapshot()`. 2. POST A3 and assert. 3. Assert `snapshot()` deep-equals `before`. 4. Repeat steps 2–3 twice. 5. GET quota. 6. `GET /api/assets` and check A3 is available. |
| Expected HTTP | 409 ×3 |
| Expected response | `{ error: { code: "BORROWING_QUOTA_EXCEEDED", message: <non-empty> } }` with no `fields`. Quota `{2,0,2,2,3,0,false}`. |
| Expected database | Unchanged (deep equality); no row for (B1, A3) |
| Regression obligations | TC-23 (rule violation leaves no writes) |
| Predicted pre-change outcome | **FAIL**: first POST returns 201 and a third PENDING row is created. This is meaningful RED. |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC04: combined limit rejects (RED)

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14 / CR01-AC04 (S1–S3) |
| Objective | The combined limit is enforced independently of the pending limit |
| Level / type | I (parameterized with `it.each`); negative, boundary, changed behavior |
| Preconditions | As TC01 |
| Fixtures | Fresh borrowers: `usage(1,2)`, `usage(0,3)`, `usage(2,1)`; one fresh available asset each |
| Input | One otherwise-valid POST per borrower |
| Steps | `before = snapshot()`; POST; assert response; assert snapshot unchanged; GET quota |
| Expected HTTP | 409 ×3 |
| Expected response | Code `BORROWING_QUOTA_EXCEEDED`. Quotas `{1,2,3,2,3,0,false}`, `{0,3,3,2,3,0,false}`, `{2,1,3,2,3,0,false}`. |
| Expected database | Unchanged |
| Regression obligations | TC-23 |
| Predicted pre-change outcome | **FAIL**: each returns 201 |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC05: checkout is quota-neutral and never quota-rejected

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-06, BR-14, FR-09, FR-10 / CR01-AC05 (S1–S4) |
| Objective | Checkout converts one pending request into one active loan, keeps P + L, and stays unaffected by quota |
| Level / type | I; regression, positive and negative |
| Preconditions | Quota active, so phase 2 (`REQUEST_LIFECYCLE_WRITES=enabled`, the test default). r2 change: r1 specified phase 1, which the proposed coupling rule makes an invalid combination with the quota on. Checkout without the quota in phase 1 stays covered by `lifecycle-rollout.test.ts`. |
| Fixtures | B1: R1 pending on A1 and R2 pending on A2 (through the API or directly), plus `activeLoan(B1, A3)`; C1 authorized for A1–A3. V2: B2 also has a pending request on A1. |
| Input | `POST /api/requests/R1/checkout { assetId: A1, dueAt: now + 2 d }` by C1. Then a B1 POST for fresh A4. Negative S4: a separate B1'' at P = 2, L = 1 attempts checkout with `dueAt` in the past (400), then with `assetId` mismatch (409 `REQUEST_MISMATCH`). |
| Steps | 1. GET quota and expect `{2,1,3,…}`. 2. Checkout. 3. Assert loan and request. 4. GET quota. 5. B1 POST A4. 6. V2: assert B2's request on A1 is `DECLINED`/`ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER` and B2's P decreased. 7. S4 negatives: assert the snapshot is unchanged. |
| Expected HTTP | Step 2: 201. Step 5: 409 `BORROWING_QUOTA_EXCEEDED`. S4: 400 `VALIDATION_ERROR`, 409 `REQUEST_MISMATCH`. Never 409 `BORROWING_QUOTA_EXCEEDED` from checkout. |
| Expected response | Loan DTO `requestId: R1`, `borrowerId: B1`, `status: "ACTIVE"`. Quota after step 2: `{1,2,3,2,3,0,false}`. |
| Expected database | R1 `CHECKED_OUT`; exactly one `Loan` with `requestId = R1`; R2 still PENDING; A1 unavailable; step 5 writes nothing |
| Regression obligations | TC-09, TC-10, TC-19, TC-20; `checkout.test.ts`, `loan-duration.test.ts`, `lifecycle-rollout.test.ts` unchanged and green |
| Predicted pre-change outcome | Steps 2–3 pass (C). Step 4 fails (404 route). **Step 5 fails** (201). |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC06: terminal requests and returned loans are excluded

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14 / CR01-AC06 (S1–S4) |
| Objective | Only PENDING requests and loans with `returnedAt IS NULL` count, and limits still apply to live records |
| Level / type | I; positive and negative, changed behavior |
| Preconditions | As TC01 |
| Fixtures | B1: `pending` ×1; `terminal(DECLINED)`, `terminal(CANCELLED)`, `terminal(EXPIRED)`; `activeLoan` ×1 (its request is `CHECKED_OUT`); `returnedLoan` ×2 (their requests are `CHECKED_OUT`). Totals: 8 requests and 3 loans on 8 distinct assets. Two fresh available assets for submission. |
| Input | GET quota; POST asset X; POST asset Y |
| Steps | 1. GET quota. 2. POST X. 3. GET quota. 4. POST Y. 5. Compare terminal and returned rows with the fixture values. |
| Expected HTTP | 200, 201, 200, 409 |
| Expected response | Step 1 `{1,1,2,2,3,1,true}`; step 3 `{2,1,3,2,3,0,false}`; step 4 `BORROWING_QUOTA_EXCEEDED` |
| Expected database | Terminal and returned rows byte-for-byte unchanged; one new PENDING row (X) |
| Regression obligations | `request-lifecycle.test.ts`, `reconcile-competing-requests.test.ts` |
| Predicted pre-change outcome | Step 2 passes (C); steps 1 and 3 fail (404); **step 4 fails** (201) |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC07: historical over-limit records

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14, BR-06 / CR01-AC07 (S1–S4) |
| Objective | Pre-existing over-limit data is preserved; new submissions are blocked until both limits permit; checkout stays allowed |
| Level / type | I; negative and positive, changed behavior plus preservation |
| Preconditions | As TC01 |
| Fixtures | B1 `usage(3,2)` inserted directly; one pending request (Rp) is on available asset Ap in C1's scope. Fresh asset Z for submission. |
| Input | GET quota; POST Z; checkout Rp; POST Z; then fixture transitions (set pending rows to `CANCELLED` with closure fields, set `returnedAt`) to reach (2,0), (1,2) and (1,1), with POST Z after each |
| Steps | 1. `before = snapshot()`; GET quota. 2. POST Z and assert. 3. Checkout Rp. 4. GET quota. 5. POST Z. 6. Transition and POST at each target state. |
| Expected HTTP | 200; 409; 201; 200; 409; then 409 at (2,0), 409 at (1,2), 201 at (1,1) |
| Expected response | Step 1 `{3,2,5,2,3,0,false}`; step 4 `{2,3,5,2,3,0,false}`; rejections use `BORROWING_QUOTA_EXCEEDED` |
| Expected database | After steps 1–2, identical to `before`. Step 3 creates exactly one loan and nothing is deleted. Fixture rows are only ever changed by the test's own explicit transitions. |
| Regression obligations | TC-09, TC-10 |
| Predicted pre-change outcome | **Step 2 fails** (201). Step 3 passes (C). |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC08: concurrent submissions for distinct assets (RED)

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14, BR-10 / CR01-AC08 (S1–S5) |
| Objective | Serializable transaction plus retry prevents write-skew overshoot. The test distinguishes the **normal** retry path (409 `BORROWING_QUOTA_EXCEEDED`, decided against committed state) from **retry exhaustion** (409 `CONFLICT`, nothing decided or written). See [impact analysis §10.5](CR-01-impact-analysis.md#105-concurrency-outcomes-and-error-semantics-r2). |
| Level / type | I; concurrency (TC08a) and deterministic fault injection (TC08b–d); changed behavior plus characterization |
| Preconditions | Real PostgreSQL; Prisma connection pool of at least 3 so requests overlap (TC08a). TC08b–d use `injectSerializationFailures`. |
| Fixtures | Fresh borrower and assets per iteration or sub-case. TC08a: S1 `usage(1,1)` plus A, B (20 iterations); S2 `usage(1,0)` plus A, B (10 iterations); S3 `usage(0,1)` plus A, B, C (10 iterations). TC08b: `usage(1,1)` plus A, plus competitor asset K. TC08c: `usage(0,0)` and `usage(2,0)` plus A. TC08d: `usage(0,0)` plus A. |
| Input | TC08a: `Promise.all` of POSTs for distinct assets with one session. TC08b: `injectSerializationFailures(1, before = insert PENDING (borrower, K) directly)`, then POST A. TC08c: `injectSerializationFailures(3)`, then POST A. TC08d: `injectSerializationFailures(1)`, then POST A. |
| Steps | Per sub-case: `before = snapshot()`; execute; collect status and code; count new rows; read the quota; for b–d also read the spy call count; restore the spy. |
| Expected HTTP / code | **TC08a:** exactly 1 (S1, S2) or 2 (S3) responses are 201; each other response is 409 with code ∈ {`BORROWING_QUOTA_EXCEEDED`, `CONFLICT`}; never 500. **TC08b:** 409 `BORROWING_QUOTA_EXCEEDED` with exactly **2** attempts. **TC08c:** 409 `CONFLICT` with message "Equipment changed while submitting. Refresh and try again." and exactly **3** attempts, in both the below-quota and at-quota fixtures. **TC08d:** 201 with exactly 2 attempts. |
| Expected database (always asserted) | TC08a: new PENDING rows = number of 201s. Final state S1 (2,1); S2 (2,0); S3 (2,1). P ≤ 2 and P + L ≤ 3 in **every** iteration. TC08b: exactly one new row (the injected competitor K) and none for A; final (2,1). TC08c: zero new rows. TC08d: exactly one new row. |
| Diagnostics (not pass conditions) | Per iteration, record the loser code in TC08a. Any `CONFLICT` share above 10% of losers is reported for investigation (R-04). |
| Regression obligations | `borrow-requests.test.ts` "rejects concurrent duplicate submissions" and "allows concurrent submissions by different borrowers" (TC-21) green with fresh-borrower fixtures; TC-19 green |
| Predicted pre-change outcome | **TC08a FAIL**: all submissions 201; S1 final P = 3. **TC08b FAIL**: the retry succeeds with 201. TC08c passes (C: existing `CONFLICT` path). TC08d passes (C). |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC09: existing error behavior and precedence preserved

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-03, BR-10, BR-13, NFR-01, NFR-03 / CR01-AC09 (S1–S10) |
| Objective | The quota is evaluated after every pre-existing check; existing codes are unchanged at and below quota |
| Level / type | I; negative, characterization plus precedence |
| Preconditions | As TC01 |
| Fixtures | B1 `usage(2,0)` with R1 on A1; B2 `activeLoan` on A7; retired A8; custodian C1; B0 `usage(0,0)` for S10 |
| Input | Table in AC09: duplicate A1, A7, A8, unknown ID, malformed bodies, raw invalid JSON, a 17 KB body, no cookie, custodian session, missing CSRF, foreign Origin. `GET /api/borrowing-quota` with no cookie and with C1. |
| Steps | For each row: `before = snapshot()`; send; assert status and code; assert snapshot unchanged |
| Expected HTTP / code | 409 `DUPLICATE_REQUEST`; 409 `ASSET_UNAVAILABLE` ×2; 404 `NOT_FOUND`; 400 `VALIDATION_ERROR` (with `fields.assetId`); 400 `INVALID_JSON`; 413 `PAYLOAD_TOO_LARGE`; 401 `UNAUTHENTICATED` (POST and GET); 403 `FORBIDDEN` (POST and GET); 403 `INVALID_CSRF`; 403 `FORBIDDEN_ORIGIN` |
| Expected response | Existing envelope; never `BORROWING_QUOTA_EXCEEDED` for these inputs |
| Expected database | Unchanged in every row |
| Regression obligations | TC-06, TC-18, TC-21, TC-23, TC-24; `auth.test.ts`, `borrow-requests.test.ts` |
| Predicted pre-change outcome | POST rows pass (C). The unauthenticated GET also passes (401), because the router-wide `requireAuth` on `domainRouter` runs before the `/api` 404 fallback. **The custodian GET fails**: it falls through to 404 `NOT_FOUND`, not 403. |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC10: borrower isolation and privacy

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-04, BR-14, FR-07, NFR-01 / CR01-AC10 (S1–S6) |
| Objective | Quotas are independent per borrower; the endpoint **rejects** borrower selectors and any query parameter with 400 (OD-05, r2); no foreign data or cacheable response is exposed |
| Level / type | I; security, isolation |
| Preconditions | As TC01 |
| Fixtures | B1 `usage(2,1)` with R1 pending on A1; B2 `usage(0,0)` |
| Input | B2 POST A1; GET quota as B1 and as B2; B1 `GET /api/borrowing-quota?borrowerId=<B2>`; B1 `GET /api/borrowing-quota?x=1`; B1 `GET /api/requests/<B2 request id>`; B1 `GET /api/loans/<B2 loan id>` (fixture) |
| Steps | Execute and assert in order; compare B1's quota before and after B2's activity |
| Expected HTTP | 201; 200; 200; **400**; **400**; 404; 404 |
| Expected response | B2 `{1,0,1,2,3,1,true}`; B1 `{2,1,3,2,3,0,false}` before and after. Both query requests return `{ error: { code: "VALIDATION_ERROR", message, fields: { query } } }` with no quota figures (if OD-05 resolves to "ignore", expect 200 with B1's own quota instead). 200 bodies contain only the 7 keys (no UUID-shaped strings). Header `Cache-Control: no-store` on every response. |
| Expected database | One new row for B2; B1 rows unchanged |
| Regression obligations | TC-07, TC-08, TC-11 |
| Predicted pre-change outcome | B2 POST passes (C); quota reads fail (404); foreign-ID 404s pass (C) |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC11: borrower UI quota display and feedback

| Field | Specification |
| --- | --- |
| Requirement / AC | FR-07 (CR-01), BR-14 / CR01-AC11 (S1–S10) |
| Objective | The UI shows the server's quota accurately, blocks submission when the quota is unknown or exhausted, recovers from stale state, and never leaks quota across sessions |
| Level / type | K (primary), E (S1, S2, S6 smoke); UI, state handling |
| Preconditions | K: `client/tests/setup.ts` fetch mocks extended with `/borrowing-quota`. E: e2e database seeded; distinct synthetic borrower for CR-01. |
| Fixtures | Mocked quota DTOs `{1,0,1,2,3,1,true}`, `{2,1,3,2,3,0,false}`, `{3,2,5,2,3,0,false}`; a delayed promise for loading; a 500 for error; 409 `BORROWING_QUOTA_EXCEEDED` for stale; 401 for expiry; two identities for the user switch |
| Input | Render `App` at `/requests` and `/dashboard`; select an asset; submit; click Retry; sign out and in |
| Steps | One test per AC11 row S1–S10. Assert accessible text by role (`status`, `alert`, `button` name and disabled state), the HTTP calls made, and their order (quota re-fetched after 201 and after 409). |
| Expected result | As AC11 table. Key assertions: Submit disabled for S2–S5; catalog buttons disabled with a quota `aria-label` in S2; the server message shown in S6 without a success notice; quota state cleared in S8; a stale B1 response ignored in S9; no quota call for a custodian in S10. |
| Expected HTTP | Mocked per row |
| Expected database | n/a (K). E: as TC01 and TC03 for the borrower. |
| Regression obligations | `requests.test.tsx`, `borrow-workflow.test.tsx`, `navigation.test.tsx`, `borrower-navigation.test.tsx`, `request-lifecycle.test.tsx`, `checkout-workflow.test.tsx` unchanged except mock additions; E2E `02`, `04`–`07` |
| Predicted pre-change outcome | **FAIL**: no quota panel, no quota call, and Submit enabled at the limit |
| Files / command | `client/tests/borrowing-quota.test.tsx`; `e2e/tests/09-borrowing-quota.spec.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC12: quota derived from persisted records

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14, NFR-05 / CR01-AC12 (S1–S4) |
| Objective | The quota is computed from PostgreSQL on every read; reload, restart and checkout readback agree |
| Level / type | I + E; persistence |
| Preconditions | As TC01. For restart, the CI job "Verify production image, jobs and restart persistence" or a local `docker compose restart` of the API. |
| Fixtures | B1 with 2 API-submitted requests; then checkout of one by C1; then a fixture `returnedAt` on that loan |
| Input | GET quota; `prisma.$disconnect()` and reconnect (new client), GET again; checkout; GET quota, `/requests/mine`, `/loans/mine`; set `returnedAt`; GET quota. E: reload the `/requests` page. |
| Steps | Assert after each step |
| Expected HTTP | 200 for every GET; 201 checkout |
| Expected response | `{2,0,2,…}` before and after reconnect; after checkout `{1,1,2,2,3,1,true}`, agreeing with one PENDING row in `/requests/mine` and one ACTIVE loan in `/loans/mine`; after `returnedAt` `{1,0,1,2,3,1,true}`. E: the panel shows the same values after reload. |
| Expected database | Only the checkout and the fixture `returnedAt` change rows |
| Regression obligations | TC-10, TC-25 |
| Predicted pre-change outcome | **FAIL** (404 route) |
| Files / command | `server/tests/borrowing-quota.test.ts`; `e2e/tests/09-borrowing-quota.spec.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC13: recovery after borrower cancellation

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14 (c), (d) / CR01-AC13 (S1–S3) (proposed) |
| Objective | A borrower's own authorized cancellation frees quota capacity, which the next submission and the quota read reflect |
| Level / type | I; recovery, changed behavior |
| Preconditions | Quota active (phase 2) |
| Fixtures | B1 with R1 (A1) and R2 (A2) PENDING, L = 0; A3 available. Variant: B1' `usage(1,2)` plus A4. |
| Input | POST A3; `cancel(B1, R1)`; GET quota; POST A3. Variant: `cancel` of the pending request, GET quota, POST A4. |
| Steps | Assert after each call; `snapshot()` around the first POST |
| Expected HTTP | 409 `BORROWING_QUOTA_EXCEEDED`; 200; 200; 201. Variant: 200; 200; 201. |
| Expected response | After the cancel, `{1,0,1,2,3,1,true}`; after the final POST, `{2,0,2,2,3,0,false}`. Variant after the cancel: `{0,2,2,2,3,1,true}`. The cancel response never carries `BORROWING_QUOTA_EXCEEDED`. |
| Expected database | The first POST writes nothing. R1 becomes `CANCELLED`/`CANCELLED_BY_BORROWER` with `closedAt` and `closedById = B1`. Exactly one new PENDING row at the end. |
| Regression obligations | `request-lifecycle.test.ts` cancel tests (DEP-LC scope) unchanged |
| Predicted pre-change outcome | **FAIL** at the first POST (201 instead of 409) |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC14: recovery after custodian decline and auto-decline

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14 (c) / CR01-AC14 (S1–S2) (proposed) |
| Objective | An assigned custodian's decline, and the checkout auto-decline, free the borrower's capacity |
| Level / type | I; recovery |
| Preconditions | Quota active (phase 2) |
| Fixtures | S1: B1 `usage(2,0)` with R1 on A1 (C1 assigned). S2: B1 `usage(2,0)` with R1 on A1, B2 pending on A1. |
| Input | S1: `decline(C1, R1, "BORROWER_NOT_ELIGIBLE")`, GET quota, B1 POST new asset. S2: checkout of B2's request by C1, GET B1 quota, B1 POST new asset. |
| Steps | Assert after each call |
| Expected HTTP | S1: 200, 200, 201. S2: 201 (checkout), 200, 201. |
| Expected response | Quota after the recovery: `{1,0,1,2,3,1,true}` |
| Expected database | R1 `DECLINED` with the reason (S1) or `ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER` (S2) |
| Regression obligations | `request-lifecycle.test.ts` decline and auto-decline tests unchanged |
| Predicted pre-change outcome | Quota reads fail (404 route); POSTs pass (C). The RED signal comes from the reads. |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC15: recovery from the combined limit after return [DEP-RT partly]

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14 (c); FR-12 (dependency) / CR01-AC15 (S1–S3) (proposed) |
| Objective | A returned loan stops counting, so capacity recovers. The pending limit is still evaluated independently. |
| Level / type | I; recovery |
| Preconditions | Quota active. **TC15a** is executable now (`fixtureReturn`). **TC15b** needs the return API (DEP-RT) and is BLOCKED until it exists. |
| Fixtures | Ba `usage(0,3)`; Bb `usage(1,2)`; Bc `usage(2,1)`; one fresh asset each |
| Input | For each borrower: POST (expect a rejection), return one active loan (a: `fixtureReturn`; b: return API as C1), GET quota, POST |
| Steps | Assert after each call |
| Expected HTTP | Ba and Bb: 409 → 200 → **201**. Bc: 409 → 200 → **409** (pending limit). |
| Expected response | After the return: Ba `{0,2,2,2,3,1,true}`; Bb `{1,1,2,2,3,1,true}`; Bc `{2,0,2,2,3,0,false}` |
| Expected database | The returned loan has `returnedAt` and `returnCustodianId`; no other loan changes |
| Regression obligations | TC-12 (return, DEP-RT scope) when it exists |
| Predicted pre-change outcome | **FAIL** at the first POST (201) |
| Files / command | `server/tests/borrowing-quota.test.ts` (TC15b is enabled when DEP-RT merges) |
| Actual result | NOT EXECUTED (TC15a, TC15b) |
| Verdict | NOT RUN (TC15b BLOCKED by DEP-RT) |

### CR01-TC16: grandfathered over-limit recovery

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14 (d) / CR01-AC16 (proposed) |
| Objective | Recovery operations on over-limit history are never quota-checked; submission is accepted only once both limits permit |
| Level / type | I; recovery, historical data |
| Preconditions | Quota active. TC16a uses `fixtureReturn`; TC16b uses the return API [DEP-RT, BLOCKED]. |
| Fixtures | B1 `usage(3,2)` inserted directly; fresh asset Z |
| Input | cancel → POST Z → cancel → POST Z → return one loan → POST Z |
| Steps | `snapshot()` before; assert each step; diff the snapshot at the end |
| Expected HTTP | Cancel 200; POST 409; cancel 200; POST 409; return (fixture or 200 via API); POST **201** |
| Expected response | Quotas `{2,2,4,…,0,false}`, `{1,2,3,…,0,false}`, `{1,1,2,2,3,1,true}` |
| Expected database | Only the two cancelled requests, the one returned loan and the new request differ from the snapshot |
| Regression obligations | TC07 (CR-01) |
| Predicted pre-change outcome | **FAIL** at the first POST (201) |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN (TC16b BLOCKED by DEP-RT) |

### CR01-TC17: unauthorized recovery attempts leave the quota unchanged

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-03, BR-04, BR-05, BR-14 / CR01-AC17 (proposed) |
| Objective | Existing authorization on recovery operations is preserved, and failed attempts cannot change P, L or the quota |
| Level / type | I; security, negative |
| Preconditions | Quota active |
| Fixtures | B1 `usage(2,1)` with R1 on A1 (C1 assigned); B2; unassigned custodian C2 |
| Input | The AC17 attempt table. Return rows [DEP-RT] are BLOCKED. |
| Steps | For each attempt: `before = snapshot()` and quota; attempt; assert the status and code; assert the snapshot and quota are unchanged; then B1 POST is still 409 |
| Expected HTTP / code | 404, 403, 403, 404, 403 `INVALID_CSRF`, 400 `VALIDATION_ERROR`; return rows as the DEP-RT contract defines |
| Expected response | Existing envelopes; quota unchanged `{2,1,3,2,3,0,false}` |
| Expected database | Unchanged |
| Regression obligations | `request-lifecycle.test.ts` authorization tests |
| Predicted pre-change outcome | The attempt rows pass (C); the quota comparisons fail (404 route) |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN (return rows BLOCKED by DEP-RT) |

### CR01-TC18: quota display after recovery

| Field | Specification |
| --- | --- |
| Requirement / AC | FR-07 (CR-01), BR-14 / CR01-AC18 (S1–S4) (proposed) |
| Objective | The UI re-reads and shows the recovered quota after the borrower's own cancel, on route entry or Refresh after other users' recovery actions, and handles a failed re-read |
| Level / type | K (primary); E (S1, S2) |
| Preconditions | K: mocks with `features.borrowingQuota: true` and `requestLifecycleActions: true`. E: quota-active E2E configuration and a dedicated synthetic borrower. |
| Fixtures | Quota sequence `{2,0,2,2,3,0,false}` → `{1,0,1,2,3,1,true}`; a failing re-read for S4 |
| Input | Click "Cancel request for …"; navigate away and back to `/requests`; click the panel's Refresh |
| Steps | Assert the call order (cancel POST → quota GET), the panel text, and the Submit and catalog button states |
| Expected result | As AC18 S1–S4. S3 [DEP-RT] is E only and BLOCKED. |
| Expected database | n/a (K); E as TC13 and TC14 |
| Regression obligations | `request-lifecycle.test.tsx`, `borrow-workflow.test.tsx` (mock additions only) |
| Predicted pre-change outcome | **FAIL** (no panel and no quota call) |
| Files / command | `client/tests/borrowing-quota.test.tsx`; `e2e/tests/09-borrowing-quota.spec.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN (S3 BLOCKED by DEP-RT) |

### CR01-TC19: release behavior when activation is off or misconfigured

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14 (g) / CR01-AC19 (S1–S5) (proposed); S6 is release gate RG-01–RG-04, verified by evidence (§6) |
| Objective | With activation off the system behaves exactly as `e5ed70d`; an invalid or unsafe configuration cannot start |
| Level / type | U (configuration), I (API), K (UI) |
| Preconditions | Each test sets `BORROWING_QUOTA` and `REQUEST_LIFECYCLE_WRITES` explicitly and restores them (`beforeEach`/`afterEach`) |
| Fixtures | B1 `usage(2,1)`; fresh asset |
| Input | U: `runtimeConfig({ BORROWING_QUOTA: v, REQUEST_LIFECYCLE_WRITES: w })` for v ∈ {unset, `disabled`, `enabled`, `yes`} × w ∈ {unset, `disabled`, `enabled`}. I: POST and GET with the quota off. K: App with `features.borrowingQuota: false`. |
| Steps | Assert the expected results below |
| Expected result | U: `enabled` + (unset or `disabled`) → `ConfigurationError`; `yes` → `ConfigurationError`; all other combinations start. I: POST → **201** (no quota); GET → 404 `BORROWING_QUOTA_DISABLED`; login and `/auth/me` → `features.borrowingQuota: false`. K: no `/borrowing-quota` call and no panel; Submit governed only by the existing rules. |
| Expected database | One new PENDING row for the POST (as at the baseline) |
| Regression obligations | `runtime-config.test.ts`, `lifecycle-rollout.test.ts` configuration cases unchanged |
| Predicted pre-change outcome | U fails (no `BORROWING_QUOTA` handling: `enabled` with lifecycle disabled starts). I POST passes (C). The GET returns route 404 `NOT_FOUND`, not `BORROWING_QUOTA_DISABLED`, so it fails. |
| Files / command | `server/tests/borrowing-quota.test.ts`, `server/tests/borrowing-quota-unit.test.ts`, `client/tests/borrowing-quota.test.tsx` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN |

### CR01-TC20: concurrent submission with checkout and recovery, same borrower

| Field | Specification |
| --- | --- |
| Requirement / AC | BR-14 (b), (e), BR-09 / CR01-AC20 (S1–S5) (proposed) |
| Objective | Concurrent quota-neutral (checkout) and quota-lowering (cancel, auto-decline, return) operations never let a submission overshoot. Every observed outcome matches a valid serial order ([impact analysis §10.5](CR-01-impact-analysis.md#105-concurrency-outcomes-and-error-semantics-r2)). |
| Level / type | I; concurrency |
| Preconditions | Real PostgreSQL, pool of at least 3, quota active |
| Fixtures | Fresh borrowers and assets per iteration; 10 iterations per scenario. S1 B (2,0) with R1 on available A1. S2 B (1,1) with R1 the only pending request. S3 B (2,0). S4 [DEP-RT] B (0,3). S5 B1 (2,0) with R1 on A1, plus B2 pending on A1. |
| Input | `Promise.all([submit(B, X), op])`, where op is checkout(R1), cancel(R1), checkout of B2's request, or return [DEP-RT] |
| Steps | Collect both responses; let c (or x) = 1 when op succeeded, s = 1 when the submission returned 201; read P and L; count loans for R1 and new request rows |
| Expected HTTP / code | op: checkout ∈ {201, 409 `CHECKOUT_CONFLICT`}, never `BORROWING_QUOTA_EXCEEDED`; cancel ∈ {200, 409 `REQUEST_CONFLICT`}. Submission ∈ {201, 409 `BORROWING_QUOTA_EXCEEDED`, 409 `CONFLICT`}. **S1, S3, S4, S5:** s = 1 only if op succeeded. **S2:** the submission is never `BORROWING_QUOTA_EXCEEDED`. |
| Expected database (always asserted) | S1: P = 2 − c + s, L = c, loans for R1 = c. S2: when c = s = 1, (1, 2). S3: P = 2 − x + s. S5: B1 P = 2 − c + s; B2 L = c. P ≤ 2 and P + L ≤ 3 for every borrower in every iteration. New request rows = s. |
| Diagnostics | Record the distribution of (op, s) outcomes per scenario |
| Regression obligations | TC-19 (concurrent checkout), `request-lifecycle.test.ts` "never leaves a loan for a request cancelled concurrently with its checkout" |
| Predicted pre-change outcome | **S1, S3 and S5 can fail** (an s = 1 with op failed, or P = 3, is possible because there is no quota). The failure is order-dependent, so RED may need several iterations. If no iteration fails, the case is recorded as "RED not observed", never as passed RED. S2 passes (C). |
| Files / command | `server/tests/borrowing-quota.test.ts` |
| Actual result | NOT EXECUTED |
| Verdict | NOT RUN (S4 BLOCKED by DEP-RT) |

## 5. Coverage summary

| TC | AC | Requirements | Level | Changed behavior (RED expected) | Characterization included | Actual / verdict |
| --- | --- | --- | --- | --- | --- | --- |
| CR01-TC01 | AC01 | FR-06, BR-14 | U, I | Endpoint and unit | 201 path | NOT EXECUTED / NOT RUN |
| CR01-TC02 | AC02 | FR-06, BR-14 | I | Endpoint | 201 path | NOT EXECUTED / NOT RUN |
| CR01-TC03 | AC03 | BR-14, NFR-03 | I | **Yes** | — | NOT EXECUTED / NOT RUN |
| CR01-TC04 | AC04 | BR-14 | I | **Yes** | — | NOT EXECUTED / NOT RUN |
| CR01-TC05 | AC05 | BR-06, BR-14, FR-09, FR-10 | I | **Yes** (post-checkout submit) | Checkout | NOT EXECUTED / NOT RUN |
| CR01-TC06 | AC06 | BR-14 | I | **Yes** | 201 path | NOT EXECUTED / NOT RUN |
| CR01-TC07 | AC07 | BR-14, BR-06 | I | **Yes** | Checkout | NOT EXECUTED / NOT RUN |
| CR01-TC08 | AC08 | BR-14, BR-10 | I | **Yes** (a, b) | Exhaustion and retry (c, d) | NOT EXECUTED / NOT RUN |
| CR01-TC09 | AC09 | BR-03, BR-10, BR-13, NFR-01, NFR-03 | I | GET role only | All POST errors | NOT EXECUTED / NOT RUN |
| CR01-TC10 | AC10 | BR-04, BR-14, FR-07, NFR-01 | I | Endpoint, query 400 | Foreign IDs | NOT EXECUTED / NOT RUN |
| CR01-TC11 | AC11 | FR-07, BR-14 | K, E | **Yes** | — | NOT EXECUTED / NOT RUN |
| CR01-TC12 | AC12 | BR-14, NFR-05 | I, E | Endpoint | — | NOT EXECUTED / NOT RUN |
| CR01-TC13 | AC13 (proposed) | BR-14 | I | **Yes** | Cancel | NOT EXECUTED / NOT RUN |
| CR01-TC14 | AC14 (proposed) | BR-14 | I | Endpoint | Decline, auto-decline | NOT EXECUTED / NOT RUN |
| CR01-TC15 | AC15 (proposed) | BR-14; FR-12 (dependency) | I | **Yes** | — | NOT EXECUTED / NOT RUN (b BLOCKED) |
| CR01-TC16 | AC16 (proposed) | BR-14 | I | **Yes** | Cancel | NOT EXECUTED / NOT RUN (b BLOCKED) |
| CR01-TC17 | AC17 (proposed) | BR-03, BR-04, BR-05, BR-14 | I | Endpoint | Authorization rows | NOT EXECUTED / NOT RUN (return rows BLOCKED) |
| CR01-TC18 | AC18 (proposed) | FR-07, BR-14 | K, E | **Yes** | — | NOT EXECUTED / NOT RUN (S3 BLOCKED) |
| CR01-TC19 | AC19 (proposed) | BR-14 (g) | U, I, K | **Yes** (configuration, GET) | Quota-off POST | NOT EXECUTED / NOT RUN |
| CR01-TC20 | AC20 (proposed) | BR-14, BR-09 | I | Order-dependent (S1, S3, S5) | S2 | NOT EXECUTED / NOT RUN (S4 BLOCKED) |

The 12 Issue #78 criteria map one-to-one to CR01-TC01–TC12. The 8 proposed criteria map one-to-one to CR01-TC13–TC20. Every case maps to at least one SRS requirement. Execution totals are 0 run, 0 passed, 0 failed, 0 skipped. Five cases contain sub-parts BLOCKED by DEP-RT.

## 6. Dependency verification and release gates (not CR-01 tests)

These checks belong to other changes. CR-01 depends on their results but does not own, implement or claim them. They are listed so the boundary is explicit and the release gates in [impact analysis §20.6](CR-01-impact-analysis.md#206-release-gates-for-production-activation-all-pending) can cite evidence.

| ID | Belongs to | Check | Existing or planned source | Status |
| --- | --- | --- | --- | --- |
| DEP-LC-01 | Lifecycle rollout (follow-up to #61) | A phase-2 revision is serving production (`REQUEST_LIFECYCLE_WRITES=enabled`) | `infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md` "Phase 2" | NOT DONE |
| DEP-LC-02 | same | Borrower cancel and custodian decline work in production with their authorization (smoke) | Existing suites `request-lifecycle.test.ts`, `e2e/tests/04-request-lifecycle.spec.ts`; production smoke | NOT RUN in production |
| DEP-LC-03 | same | Reconcile dry-run and apply run with evidence; rerun shows `staleOnActiveLoan: 0` | Rollout document "Reconcile…" | NOT DONE |
| DEP-LC-04 | #61 / Team 7 | Independent retest of UAT-E01 under phase 2 | `artifacts/sprint-1/uat/uat-e01-team7-retest.md` | NOT DONE (previously blocked, per Issue #78 §9) |
| DEP-RT-01 | New FR-12 return issue (to be created) | Return contract and STS exist (FR-12, BR-07, BR-08, NFR-06) | — | NOT STARTED |
| DEP-RT-02 | same | Authorized return closes one active loan once; a repeat gives 409; wrong role or scope gives 403/404; rollback | RTM TC-12, TC-20 | NOT STARTED |
| DEP-RT-03 | same | Return released and verified in production | — | NOT STARTED |
| RG-01–RG-05 | CR-01 release (activation) | Impact analysis §20.6 | — | PENDING |
