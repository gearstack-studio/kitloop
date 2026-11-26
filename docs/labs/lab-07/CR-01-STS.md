# CR-01 Borrowing Quota Management — Software Test Specification

| Document control | Value |
| --- | --- |
| Document ID | L7A-CR01-STS (evidence L7A-EV07) |
| Version | **CR-01 contract r4 (draft): pending-request quota (DC-1 K2a).** Supersedes r1–r3. |
| Status | **Specified only. No case is implemented or executed.** Every case is NOT EXECUTED / NOT RUN. |
| Relationship | Supplements the canonical [RTM](../../traceability-matrix.md) (TC-01–TC-28, unchanged) |
| Criteria | [CR-01 acceptance criteria r4](CR-01-acceptance-criteria.md) |
| RED baseline | `8ac350a` (= `e5ed70d`); re-verify before RED (#80) |
| Owners (agreed at DC-1, OD-11a) | Backend cases: DEV4952. UI cases: yiiipunn. Production verification (RG-05): yiiipunn. Review: both. Who authors RED (OD-11b) is still PENDING. |

## 1. Strategy

| Phase | Rule |
| --- | --- |
| RED | Commit the **changed-behavior** cases (marked **RED** in §3) before implementation, and run them on the RED baseline. They must fail *because the baseline accepts an over-quota request or lacks the quota endpoint or setting*. Setup failures do not count. Record the command, commit, time and counts. |
| GREEN | Implement r4 and rerun the same cases without editing assertions |
| Preserved (**PRES**) | Characterization and regression cases; they must pass before **and** after |
| Regression | Full server and client suites plus selected E2E. Only fixture or configuration-fixture changes are allowed in existing tests ([impact analysis §14](CR-01-impact-analysis.md#14-regression-protection-strategy-l7a-ev12)). |
| Configuration | Test configuration sets `BORROWING_QUOTA: "enabled"` next to `REQUEST_LIFECYCLE_WRITES: "enabled"`. TC19 sets both explicitly and restores them. |
| Evidence | Proposed paths `artifacts/lab-07/cr-01/*-red.txt` and `*-green.txt`. Nothing recorded yet. |

**Levels.** U = server unit; I = API integration on isolated PostgreSQL; K = client (jsdom, mocked HTTP); E = Playwright E2E.

**Commands.**

| Level | Candidate file | Command |
| --- | --- | --- |
| U | `server/tests/borrowing-quota-unit.test.ts` | `cd server && npx vitest run tests/borrowing-quota-unit.test.ts` |
| I | `server/tests/borrowing-quota.test.ts` | `cd server && npx vitest run tests/borrowing-quota.test.ts` (isolated database in `server/.env.test`, migrations applied). CI: `docker compose --profile test run --rm test`. |
| K | `client/tests/borrowing-quota.test.tsx` | `cd client && npx vitest run tests/borrowing-quota.test.tsx` |
| E | `e2e/tests/09-borrowing-quota.spec.ts` | `cd e2e && npx playwright test tests/09-borrowing-quota.spec.ts` (guarded runs: `npm run test:e2e:guarded`) |
| Regression | existing suites | `cd server && npm test`; `cd client && npm test && npm run build && npm run lint`; E2E `02`, `04`–`07` |

## 2. Shared synthetic fixtures

Each case uses **fresh** synthetic borrowers (`randomUUID` names) and assets, cleaned up in `afterAll`.

| Fixture | Construction |
| --- | --- |
| `borrower()`, `custodian()` | User plus login, giving a cookie and CSRF token (existing pattern) |
| `asset()` | Asset plus `CustodianAsset` for C1 |
| `pending(b, n)` | n PENDING requests on n new assets (direct insert, for history) or via the API (when testing submission) |
| `loans(b, n)` | n `CHECKED_OUT` requests plus active loans on n new assets |
| `terminal(b, status)` | `DECLINED` / `CANCELLED` / `EXPIRED` with valid closure fields |
| `snapshot()` | All `BorrowRequest` and `Loan` rows for fixture IDs, compared by deep equality for "no writes" |
| `injectSerializationFailures(n, before?)` | `vi.spyOn(prisma, "$transaction")` rejects the next n calls with `P2034` after an optional hook. Relies on one call per attempt (true at `e5ed70d`). |

## 3. r4 classification and mapping

| TC | r1–r3 content | r4 class | r4 content | AC | RED / PRES |
| --- | --- | --- | --- | --- | --- |
| TC01 | P=0, L=0 accepted; quota read | **Retained** | P = 0 accepted; capacity unit grid | AC01 | 201 path PRES; endpoint and unit **RED** |
| TC02 | Boundaries (1,1), (0,2), (1,0) | **Revised** | P = 1 → 201 → P = 2 | AC02 | 201 PRES; endpoint **RED** |
| TC03 | P = 2 rejected | **Retained** | Same | AC03 | **RED** |
| TC04 | Combined-limit rejection | **Superseded** | Not in the active suite (see TC21) | AC04 | — |
| TC05 | Checkout quota-neutral | **Revised** | Checkout reduces P; next request accepted | AC05 | **RED** (rejection before checkout); checkout PRES |
| TC06 | Terminal and returned exclusion | **Revised** | Terminal excluded; loans irrelevant | AC06 | **RED** |
| TC07 | Over-limit history (P, L) | **Revised** | P ≥ 3 history | AC07 | **RED** |
| TC08 | Concurrency at (1,1) and others; injection | **Revised** | P = 1 race, P = 0 three-way race; normal versus exhaustion | AC08 | a, b **RED**; c, d PRES |
| TC09 | Precedence and errors | **Retained** | Same | AC09 | PRES (GET role row **RED**) |
| TC10 | Isolation | **Retained** (four-field DTO) | Same | AC10 | Endpoint **RED**; foreign IDs PRES |
| TC11 | UI (P, L) | **Revised** | Pending-only UI | AC11 | **RED** |
| TC12 | Persistence (P, L) | **Revised** | P persistence and refresh | AC12 | **RED** (endpoint) |
| TC13 | Cancel recovery (+ combined variant) | **Retained** (variant removed) | Cancel | AC13 | **RED** |
| TC14 | Decline and auto-decline | **Retained** (initial rejection added) | Same | AC14 | **RED** |
| TC15 | Return recovery | **Deferred** | Not in the active suite | AC15 | — |
| TC16 | Grandfathered recovery (cancel and return) | **Revised** | Cancel, decline, checkout | AC16 | **RED** |
| TC17 | Unauthorized recovery (return rows) | **Revised** | Return rows removed; checkout row added | AC17 | Attempts PRES; quota comparisons **RED** |
| TC18 | UI after recovery (return) | **Revised** | Return case removed | AC18 | **RED** |
| TC19 | Activation off and coupling | **Retained** | Same | AC19 | **RED** (configuration, GET); quota-off POST PRES |
| TC20 | Concurrency with checkout and recovery | **Revised** | P-only outcomes; return case removed | AC20 | S1, S3–S5 **RED** (order-dependent); S2 PRES |
| **TC21** | — | **New** | Active loans do not affect eligibility | AC21 | **PRES** |

**Active suite:** 19 cases (TC01–TC03, TC05–TC14, TC16–TC21). **Inactive:** TC04 (superseded) and TC15 (deferred). Neither contains active assertions.

## 4. Active test cases

Every case: **Actual result: NOT EXECUTED. Verdict: NOT RUN.** The "Predicted RED" lines are hypotheses, not results.

### CR01-TC01: P = 0 accepted
| Field | Specification |
| --- | --- |
| Req / AC | FR-06, BR-14 / AC01 |
| Level / type | U + I; positive, boundary |
| Fixtures / input | B1 with P = 0 (and, in a variant, `loans(B1, 3)`); asset A1. GET quota; POST `{assetId: A1}`; GET. U: `remaining(P)` and `canSubmit(P)` for P ∈ 0…5. |
| Expected | U: `max(0, 2−P)`, `P<2`. I: 200 `{0,2,2,true}`; 201 (`PENDING`, session `borrowerId`); 200 `{1,2,1,true}`; GET has exactly 4 keys and `no-store`. |
| Database | +1 PENDING row; no loan; A1 still available |
| Regression | TC-06, TC-21 |
| Predicted RED | POST passes (PRES); GET → 404 route; U fails (no module) |
| File | `borrowing-quota-unit.test.ts`, `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC02: P = 1 accepted, reaching P = 2
| Field | Specification |
| --- | --- |
| Req / AC | FR-06, BR-14 / AC02 |
| Level / type | I; boundary |
| Fixtures / input | B1 `pending(1)`; fresh asset; POST |
| Expected | 201; quota `{2,2,0,false}` |
| Database | Exactly one new row; everything else unchanged |
| Regression | TC-06 |
| Predicted RED | POST PRES; GET fails (404) |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC03: P = 2 rejected with no writes
| Field | Specification |
| --- | --- |
| Req / AC | BR-14, NFR-03 / AC03 |
| Level / type | I; negative, boundary |
| Fixtures / input | B1 `pending(2)`; fresh A3; POST ×3 |
| Expected | 409 `BORROWING_QUOTA_EXCEEDED` ×3 (no `fields`); quota `{2,2,0,false}` |
| Database | `snapshot()` unchanged after each attempt; A3 available |
| Regression | TC-23 |
| Predicted RED | **FAIL**: 201 |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC05: checkout reduces pending usage
| Field | Specification |
| --- | --- |
| Req / AC | BR-06, BR-14, FR-09, FR-10 / AC05 |
| Level / type | I; changed behavior plus checkout regression |
| Fixtures / input | B1 R1 (A1), R2 (A2) PENDING; C1 assigned; fresh A3. POST A3; checkout R1 (`dueAt` +2 d); GET; POST A3. Negative: a separate B1' at P = 2 gets checkout with a past `dueAt` (400) and an asset mismatch (409 `REQUEST_MISMATCH`). |
| Expected | 409 quota; 201 loan (`requestId` R1, `ACTIVE`); `{1,2,1,true}`; 201. Negatives keep their codes, and B1' stays at P = 2. Checkout never returns `BORROWING_QUOTA_EXCEEDED`. |
| Database | R1 `CHECKED_OUT`; exactly one loan for R1; R2 PENDING; negatives write nothing |
| Regression | TC-09, TC-10, TC-19, TC-20; `checkout.test.ts`, `loan-duration.test.ts` |
| Predicted RED | **FAIL** at the first POST (201) |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC06: terminal requests excluded
| Field | Specification |
| --- | --- |
| Req / AC | BR-14 / AC06 |
| Level / type | I |
| Fixtures / input | B1: 1 PENDING; one request each `CHECKED_OUT`, `DECLINED`, `CANCELLED`, `EXPIRED`; 1 active loan and 1 returned loan. GET; POST X; POST Y. |
| Expected | `{1,2,1,true}`; 201; 409 quota |
| Database | Terminal and loan rows unchanged; +1 row |
| Regression | lifecycle suites |
| Predicted RED | **FAIL** at the second POST (201) |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC07: historical P ≥ 3
| Field | Specification |
| --- | --- |
| Req / AC | BR-14 / AC07 |
| Level / type | I; historical data |
| Fixtures / input | B1 `pending(3)` inserted directly, one on an available asset in C1's scope; GET; POST; checkout of that request; GET |
| Expected | `{3,2,0,false}`; 409; 201; `{2,2,0,false}` |
| Database | Unchanged before the checkout; the checkout adds one loan; nothing is deleted |
| Regression | TC-09 |
| Predicted RED | **FAIL** at the POST (201) |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC08: concurrent submissions; normal versus exhaustion
| Field | Specification |
| --- | --- |
| Req / AC | BR-14, BR-10 / AC08 |
| Level / type | I; concurrency (a) and fault injection (b–d) |
| Fixtures / input | **a:** 20 iterations of `pending(1)` + 2 parallel POSTs (distinct assets), and 10 iterations of `pending(0)` + 3 parallel POSTs. **b:** `pending(1)`; `injectSerializationFailures(1, before = insert competing PENDING)`; POST. **c:** `injectSerializationFailures(3)`; POST at P = 0 and at P = 2. **d:** `injectSerializationFailures(1)` at P = 0; POST. |
| Expected | **a:** exactly 1 (or 2) × 201; others 409 with code ∈ {`BORROWING_QUOTA_EXCEEDED`, `CONFLICT`}; never 500. **b:** 409 `BORROWING_QUOTA_EXCEEDED`, 2 attempts. **c:** 409 `CONFLICT`, 3 attempts, 0 rows (both fixtures). **d:** 201, 2 attempts. |
| Database (always) | New rows = number of 201s; final P = 2; P ≤ 2 in every iteration |
| Diagnostics | Loser code distribution; a `CONFLICT` share above 10% is reported |
| Regression | TC-21 concurrency tests (with fresh fixtures); TC-19 |
| Predicted RED | **a, b FAIL** (all 201; retry succeeds); c, d PRES |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC09: existing errors and precedence
| Field | Specification |
| --- | --- |
| Req / AC | BR-03, BR-10, BR-13, NFR-01, NFR-03 / AC09 |
| Level / type | I; characterization |
| Fixtures / input | B1 `pending(2)` incl. R1 on A1; B2 active loan on A7; retired A8; custodian C1; the AC09 table, at P = 2 and at P = 0 |
| Expected | Codes as in AC09; never quota for these inputs. GET: 401 without a session; 403 for a custodian. |
| Database | Unchanged per row |
| Regression | TC-06, TC-18, TC-21, TC-23, TC-24 |
| Predicted RED | POST rows PRES; custodian GET **FAIL** (404 instead of 403) |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC10: isolation and privacy
| Field | Specification |
| --- | --- |
| Req / AC | BR-04, BR-14, FR-07, NFR-01 / AC10 |
| Level / type | I; security |
| Fixtures / input | B1 `pending(2)` incl. A1; B2 P = 0. B2 POST A1; GET as B1 and as B2; B1 `?borrowerId=<B2>` and `?x=1`; foreign request and loan IDs. |
| Expected | 201; B1 `{2,2,0,false}` unchanged; B2 `{1,2,1,true}`; both query variants 400 `VALIDATION_ERROR` (`fields.query`) with no figures; 404 ×2; 200 bodies have 4 keys, no UUIDs; `no-store` |
| Database | +1 row for B2 only |
| Regression | TC-07, TC-08, TC-11 |
| Predicted RED | Endpoint rows **FAIL**; POST and foreign IDs PRES |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC11: UI states
| Field | Specification |
| --- | --- |
| Req / AC | FR-07, BR-14 / AC11 S1–S10 |
| Level / type | K (primary); E smoke for S1, S2, S6 |
| Fixtures / input | Mocks `{1,2,1,true}`, `{2,2,0,false}`, `{3,2,0,false}`; a pending promise; 500; 409 quota; 401; two identities; a custodian |
| Expected | As AC11, asserted by role and accessible name. Call order: quota re-read after 201 and after 409. |
| Regression | `requests`, `borrow-workflow`, `navigation`, `borrower-navigation`, `request-lifecycle` (mock additions only); E2E `02`, `04`–`07` |
| Predicted RED | **FAIL** (no panel, no call, Submit enabled at the limit) |
| File | `client/tests/borrowing-quota.test.tsx`; `e2e/tests/09-borrowing-quota.spec.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC12: persistence and refresh
| Field | Specification |
| --- | --- |
| Req / AC | BR-14, NFR-05 / AC12 |
| Level / type | I + E |
| Fixtures / input | B1 submits 2 via the API; GET; `prisma.$disconnect()` and reconnect, GET; C1 checks out one; GET plus `/requests/mine` plus `/loans/mine`; fixture sets one request `CANCELLED`; GET. E: page reload. |
| Expected | `{2,2,0,false}` twice; `{1,2,1,true}`, consistent with the lists; `{0,2,2,true}` |
| Database | Only the checkout and fixture changes |
| Regression | TC-10, TC-25 |
| Predicted RED | **FAIL** (404 route) |
| File | `borrowing-quota.test.ts`; `09-borrowing-quota.spec.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC13: recovery by cancel
| Field | Specification |
| --- | --- |
| Req / AC | BR-14 / AC13 |
| Level / type | I; recovery |
| Fixtures / input | B1 R1, R2 PENDING; A3. POST A3; cancel R1; GET; POST A3. |
| Expected | 409 quota; 200 (`CANCELLED`/`CANCELLED_BY_BORROWER`); `{1,2,1,true}`; 201 |
| Database | First POST writes nothing; R1 closure fields set; +1 row at the end |
| Regression | `request-lifecycle.test.ts` cancel tests |
| Predicted RED | **FAIL** at the first POST (201) |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC14: recovery by decline and auto-decline
| Field | Specification |
| --- | --- |
| Req / AC | BR-14 / AC14 S1, S2 |
| Level / type | I; recovery |
| Fixtures / input | **S1:** B1 `pending(2)` incl. R1 (C1 assigned); POST; decline R1 `BORROWER_NOT_ELIGIBLE`; GET; POST. **S2:** B1 `pending(2)` incl. R1 on A1; B2 PENDING on A1; B1 POST; C1 checks out B2's request; GET B1; B1 POST. |
| Expected | 409 quota; 200 or 201; `{1,2,1,true}`; 201 |
| Database | R1 `DECLINED` with the reason, or `ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER` |
| Regression | `request-lifecycle.test.ts` decline and auto-decline tests |
| Predicted RED | **FAIL** at the first POST (201) |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC16: grandfathered recovery
| Field | Specification |
| --- | --- |
| Req / AC | BR-14 / AC16 |
| Level / type | I; historical data, recovery |
| Fixtures / input | B1 `pending(4)` direct (one on C1-scoped available asset Ac); cancel → POST → decline → POST → checkout (Ac) → POST |
| Expected | 200, 409, 200, 409, 201, **201**; the quota after each step is 3, 2, 1 |
| Database | Only the operated rows and the final new row differ from the snapshot |
| Regression | TC07 |
| Predicted RED | **FAIL** at the first POST (201) |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC17: unauthorized recovery leaves the quota unchanged
| Field | Specification |
| --- | --- |
| Req / AC | BR-03, BR-04, BR-05, BR-14 / AC17 |
| Level / type | I; negative, security |
| Fixtures / input | B1 `pending(2)` incl. R1 (C1 assigned); B2; unassigned C2; the AC17 attempt list |
| Expected | 404, 403, 403, 404, 403 `INVALID_CSRF`, 400, 404; quota `{2,2,0,false}` after each; B1 POST still 409 |
| Database | Unchanged |
| Regression | `request-lifecycle.test.ts`, `checkout.test.ts` authorization tests |
| Predicted RED | Attempts PRES; quota and POST checks **FAIL** |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC18: UI after recovery
| Field | Specification |
| --- | --- |
| Req / AC | FR-07, BR-14 / AC18 S1–S3 |
| Level / type | K; E for S1 and S2 |
| Fixtures / input | `features: { borrowingQuota: true, requestLifecycleActions: true }`; quota `{2,2,0,false}` → `{1,2,1,true}`; a failing re-read |
| Expected | Cancel POST, then quota GET; panel updated; Submit re-enabled. Route entry and Refresh re-read. Failure message, with Submit disabled until Retry. |
| Regression | `request-lifecycle.test.tsx`, `borrow-workflow.test.tsx` |
| Predicted RED | **FAIL** |
| File | `client/tests/borrowing-quota.test.tsx`; `09-borrowing-quota.spec.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC19: activation off and lifecycle coupling
| Field | Specification |
| --- | --- |
| Req / AC | BR-14 (g) / AC19 S1–S5 |
| Level / type | U, I, K |
| Fixtures / input | U: `runtimeConfig` for `BORROWING_QUOTA` ∈ {unset, `disabled`, `enabled`, `yes`} × `REQUEST_LIFECYCLE_WRITES` ∈ {unset, `disabled`, `enabled`}. I: quota off with B1 `pending(2)`, POST and GET. K: `features.borrowingQuota: false`. |
| Expected | U: `enabled` with unset or `disabled` lifecycle → `ConfigurationError`; `yes` → error; the rest start. I: POST 201; GET 404 `BORROWING_QUOTA_DISABLED`; `features.borrowingQuota: false`. K: no call, no panel. |
| Database | +1 row (baseline behavior) |
| Regression | `runtime-config.test.ts`, `lifecycle-rollout.test.ts` |
| Predicted RED | U **FAIL**; GET **FAIL** (route 404 `NOT_FOUND`); POST PRES |
| File | `borrowing-quota-unit.test.ts`, `borrowing-quota.test.ts`, `client/tests/borrowing-quota.test.tsx` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC20: concurrency with checkout and lifecycle
| Field | Specification |
| --- | --- |
| Req / AC | BR-14 (b), (e), BR-09 / AC20 S1–S5 |
| Level / type | I; concurrency (10 iterations per scenario) |
| Fixtures / input | `Promise.all([submit, op])` per the AC20 table (checkout, cancel, decline, checkout of a competitor) |
| Expected | op: checkout ∈ {201, 409 `CHECKOUT_CONFLICT`} and never quota; cancel or decline ∈ {200, 409 `REQUEST_CONFLICT`}. S1, S3, S4, S5: s = 1 only if op succeeded. S2: never `BORROWING_QUOTA_EXCEEDED`. |
| Database (always) | Final P = start − (op) + s; one loan per successful checkout; P ≤ 2 for every borrower in every iteration; new rows = s |
| Diagnostics | (op, s) distribution |
| Regression | TC-19; `request-lifecycle.test.ts` "never leaves a loan for a request cancelled concurrently with its checkout" |
| Predicted RED | S1, S3–S5 can fail (order-dependent). If no iteration fails, record "RED not observed", never "RED passed". S2 PRES. |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

### CR01-TC21: active loans do not affect eligibility (new, preserved)
| Field | Specification |
| --- | --- |
| Req / AC | BR-14 / AC21 |
| Level / type | I; preserved-behavior regression guard |
| Fixtures / input | Ba: `loans(3)`, P = 0. Bb: `loans(5)`, P = 0. Bc: `loans(3)`, `pending(1)`. One POST each; GET. |
| Expected | 201 ×3; quotas `{1,2,1,true}`, `{1,2,1,true}`, `{2,2,0,false}`; no loan fields in the DTO |
| Database | +1 row each; loans unchanged |
| Regression | TC-11 (loan views unaffected) |
| Predicted RED | POSTs **pass** (PRES: the baseline has no limit); GET fails (404). The POST assertions protect against the combined limit being implemented by mistake. |
| File | `borrowing-quota.test.ts` |
| Actual / Verdict | NOT EXECUTED / NOT RUN |

## 5. Coverage summary

| Required r4 coverage | TC | Class |
| --- | --- | --- |
| C1 P = 0 | TC01 | RED (endpoint) / PRES (201) |
| C2 P = 1 → 2 | TC02 | RED (endpoint) / PRES |
| C3 P = 2 rejected | TC03 | RED |
| C4 Loans irrelevant | TC21 | PRES |
| C5 Historical P > 2 | TC07, TC16 | RED |
| C6 Checkout reduces P | TC05 | RED |
| C7 Cancel | TC13 | RED |
| C8 Decline | TC14-S1 | RED |
| C9 Auto-decline | TC14-S2 | RED |
| C10 Concurrent at P = 1 | TC08 | RED (a, b) |
| C11 Concurrency with lifecycle | TC20 | RED (order-dependent) |
| C12 Existing errors and authorization | TC09, TC17 | PRES |
| C13 Isolation | TC10 | RED (endpoint) / PRES |
| C14 UI states | TC11, TC18 | RED |
| C15 Persistence and refresh | TC12, TC18 | RED |
| C16 Disabled and coupling | TC19 | RED / PRES |

19 active cases, all NOT EXECUTED / NOT RUN. Totals: 0 run, 0 passed, 0 failed, 0 skipped. TC04 and TC15 are inactive and carry no assertions.

## 6. Dependency verification and release evidence (not CR01 test cases)

| ID | Belongs to | Check | Status |
| --- | --- | --- | --- |
| DEP-LC (RG-01) | #83 (DEV4952 executes; yiiipunn verifies) | Phase 2 serving; cancel and decline verified on synthetic records; unauthorized attempts unchanged; reconcile evidence; rollback recorded ([impact analysis §20.3](CR-01-impact-analysis.md#203-release-gates-r4)) | PENDING |
| RG-02 | — | **N/A to r4.** The r3 FR-12 gate is deferred to #84 as that issue's own evidence. | N/A |
| RG-03 | Both | This STS's active suite GREEN plus regressions plus CI on the release SHA | PENDING |
| RG-04 | DEV4952 / yiiipunn | P ≥ 2 preflight | PENDING |
| RG-05.E1–E11 | DEV4952 deploys; yiiipunn verifies | Production activation and behavior ([impact analysis §20.4](CR-01-impact-analysis.md#204-rg-05-evidence-specification)) | PENDING |

Release evidence is recorded in dated records and never counted in CR01 pass, fail or skip totals. A deployment with the quota disabled is **not** verification of the changed behavior.
