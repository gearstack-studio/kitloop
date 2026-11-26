# CR-01 Borrowing Quota Management — Acceptance Criteria

| Document control | Value |
| --- | --- |
| Document ID | L7A-CR01-AC (evidence L7A-EV06) |
| Version | CR-01 contract r3 (draft); r1 added the AC01–AC12 expansion, r2 added AC13–AC20 (§4), r3 records their decision status |
| Status | **Proposed. Team agreement and DEV4952 review PENDING.** |
| Source | [Issue #78](https://github.com/gearstack-studio/kitloop/issues/78) §7: twelve criteria CR01-AC01–AC12, preserved verbatim below. **CR01-AC13–AC20 are proposed additions that are not in Issue #78.** Adopting them needs team agreement and, with permission, an Issue #78 amendment. |
| Baseline | `e5ed70d` (accepted Sprint 1); analysed tree `8ac350a` (identical) |
| Requirements | SRS FR-06 and FR-07 (CR-01 amendments), BR-10, **BR-14 (proposed)**, BR-03, BR-04, BR-06, BR-09 |
| Related | [Impact analysis](CR-01-impact-analysis.md) · [STS](CR-01-STS.md) · [FEAT-03 CR-01 revision](../../sprints/sprint-1/FEAT-03-borrow-request-workflow.md#cr-01-revision-borrowing-quota-proposed) |

## 1. Original criteria (Issue #78 §7, unchanged)

| AC ID | Scenario | Expected Result |
|---|---|---|
| CR01-AC01 | P=0, L=0 | Valid request accepted; HTTP 201 |
| CR01-AC02 | P=1, L=1 | Second pending request accepted; combined quota becomes 3 |
| CR01-AC03 | P=2, L=0 | Additional request rejected; HTTP 409; no writes |
| CR01-AC04 | P=1, L=2 or P=0, L=3 | Additional request rejected; HTTP 409 |
| CR01-AC05 | Checkout when P=2, L=1 | P=1, L=2; combined usage unchanged; exactly one persisted loan |
| CR01-AC06 | Terminal requests and returned loans exist | Historical terminal records excluded from quota |
| CR01-AC07 | Existing records exceed new limits | Preserve history; reject new submissions; preserve valid checkout |
| CR01-AC08 | Two concurrent submissions compete for one remaining slot | Exactly one succeeds; no quota overshoot |
| CR01-AC09 | Duplicate, unavailable asset, malformed input or unauthorized operation | Existing error behavior preserved |
| CR01-AC10 | Different borrowers and foreign record access | Independent quota calculation; ownership and scope enforced |
| CR01-AC11 | UI below, at or above limits; stale state and loading/error | Accurate quota display and actionable feedback |
| CR01-AC12 | Reload, restart and checkout readback | Correct quota derived from persisted records |

## 2. Conventions used in the scenarios

- **P, L.** P is the number of the borrower's `PENDING` requests. L is the number of the borrower's loans with `returnedAt IS NULL`. Both are counted from PostgreSQL for the **session** borrower ([impact analysis §4](CR-01-impact-analysis.md#4-quota-definition-and-boundary-table)).
- **"Otherwise-valid submission."** `POST /api/requests` from an authenticated Borrower with a valid Origin and CSRF token and body exactly `{ "assetId": "<id>" }`. The asset exists, is not retired, has no active loan, and the borrower has no PENDING request for that asset.
- **Quota DTO** (`GET /api/borrowing-quota`, HTTP 200, `Cache-Control: no-store`):

  ```json
  { "pendingRequests": P, "activeLoans": L, "combinedUsage": P+L,
    "maxPendingRequests": 2, "maxCombinedUsage": 3,
    "remainingRequestCapacity": max(0, min(2-P, 3-P-L)), "canSubmitRequest": P<2 && P+L<3 }
  ```

- **Quota rejection.** HTTP 409 with body `{ "error": { "code": "BORROWING_QUOTA_EXCEEDED", "message": <non-empty string> } }`.
- **"No writes."** After a rejected operation, every row in `BorrowRequest` and `Loan` is unchanged for all users: the same row counts, the same `status`, `closedAt`, `closeReason`, `closedById` and `returnedAt` values. Catalog availability for every asset is unchanged.
- **Activation precondition (r2).** AC01–AC18 and AC20 are stated for the quota **active**: `BORROWING_QUOTA=enabled`, which by the proposed coupling rule also means `REQUEST_LIFECYCLE_WRITES=enabled`. This is also the existing server and E2E test default for lifecycle writes. AC19 states the behavior when activation is off. The precondition does not change any Issue #78 criterion; it states the configuration in which each criterion is judged (OD-08, pending).
- Asset IDs such as `A1`… are distinct synthetic assets assigned to custodian `C1`. Borrowers are `B1` and `B2`. Fixtures are described in [STS §3](CR-01-STS.md#3-shared-synthetic-fixtures).

## 3. Expanded scenarios

### CR01-AC01: no usage, request accepted

**CR01-AC01-S1.** *Given* B1 has P = 0 and L = 0, and asset A1 is available. *When* B1 submits `{ "assetId": "A1" }`. *Then*:
- The response is **201** with `status: "PENDING"`, `borrowerId` equal to B1's session user ID, `assetId: "A1"`, and a server `submittedAt` inside the request window.
- Exactly one new `BorrowRequest` row exists with those values. No `Loan` row is created, and A1 is still `available: true` in `GET /api/assets`.
- `GET /api/borrowing-quota` returns `{1, 0, 1, 2, 3, 1, true}` (fields in DTO order).

**CR01-AC01-S2 (boundary, combined headroom).** *Given* B1 has P = 0 and L = 1. *When* B1 submits an otherwise-valid request. *Then* the response is 201, and the quota becomes P = 1, L = 1, combined 2, remaining 1, `canSubmitRequest: true`.

**CR01-AC01-S3 (quota read at zero).** *Given* B1 has no requests or loans. *When* B1 calls `GET /api/borrowing-quota`. *Then* the response is 200 with `{0, 0, 0, 2, 3, 2, true}`, and no row changes.

### CR01-AC02: last slot accepted, combined usage reaches 3

**CR01-AC02-S1.** *Given* B1 has P = 1 (pending on A1) and L = 1 (active loan on A2), and A3 is available. *When* B1 submits `{ "assetId": "A3" }`. *Then* the response is 201 and one new PENDING row exists. The quota is `{2, 1, 3, 2, 3, 0, false}`.

**CR01-AC02-S2 (combined limit binds before pending).** *Given* B1 has P = 0 and L = 2. *When* B1 submits an otherwise-valid request. *Then* the response is 201, and the quota is `{1, 2, 3, 2, 3, 0, false}`.

**CR01-AC02-S3 (pending boundary).** *Given* B1 has P = 1 and L = 0. *When* B1 submits an otherwise-valid request. *Then* the response is 201, and the quota is `{2, 0, 2, 2, 3, 0, false}`.

### CR01-AC03: pending limit reached, request rejected

**CR01-AC03-S1.** *Given* B1 has P = 2 (A1 and A2 pending) and L = 0, and A3 is available with no request from B1. *When* B1 submits `{ "assetId": "A3" }`. *Then*:
- The response is **409 `BORROWING_QUOTA_EXCEEDED`**.
- The no-writes rule holds: B1 still has exactly 2 PENDING requests, and there is no request for A3 by B1 and no loan.
- A3 is still available, and the quota is unchanged at `{2, 0, 2, 2, 3, 0, false}`.

**CR01-AC03-S2 (repeat attempts).** *Given* the state in S1. *When* B1 submits A3 three times in sequence. *Then* each attempt returns 409 `BORROWING_QUOTA_EXCEEDED`, and the row counts are unchanged after each attempt.

**CR01-AC03-S3 (RED meaning).** *Given* the unchanged pre-change revision. *When* S1 is executed. *Then* the test is expected to **fail**, because baseline `createBorrowRequest` has no aggregate limit and returns 201.

### CR01-AC04: combined limit reached, request rejected

**CR01-AC04-S1.** *Given* B1 has P = 1 and L = 2. *When* B1 submits an otherwise-valid request. *Then* the response is 409 `BORROWING_QUOTA_EXCEEDED`, and no writes occur. The quota is `{1, 2, 3, 2, 3, 0, false}`.

**CR01-AC04-S2.** *Given* B1 has P = 0 and L = 3. *When* B1 submits an otherwise-valid request. *Then* the response is 409 `BORROWING_QUOTA_EXCEEDED`, and no writes occur. The quota is `{0, 3, 3, 2, 3, 0, false}`.

**CR01-AC04-S3 (both limits).** *Given* B1 has P = 2 and L = 1. *When* B1 submits an otherwise-valid request. *Then* the response is 409 `BORROWING_QUOTA_EXCEEDED`, and no writes occur.

### CR01-AC05: checkout is quota-neutral

**CR01-AC05-S1.** *Given* B1 has P = 2 (R1 on A1, R2 on A2) and L = 1 (on A3). Custodian C1 is authorized for A1, and A1 is available. *When* C1 calls `POST /api/requests/R1/checkout` with `{ "assetId": "A1", "dueAt": <future ISO> }`. *Then*:
- The response is **201** with a loan DTO that has `requestId: R1`, `borrowerId: B1`, and `status: "ACTIVE"`.
- R1 is `CHECKED_OUT`, and exactly **one** `Loan` row references R1.
- B1's quota is `{1, 2, 3, 2, 3, 0, false}`: P went down by 1 and L went up by 1, so combined usage is unchanged.
- R2 is still PENDING.

**CR01-AC05-S2 (no new capacity).** *Given* the state after S1. *When* B1 submits an otherwise-valid request. *Then* the response is 409 `BORROWING_QUOTA_EXCEEDED`, because P + L = 3.

**CR01-AC05-S3 (checkout never quota-rejected).** *Given* B1 is at P = 2, L = 1. *When* checkout is performed. *Then* the response is never 409 `BORROWING_QUOTA_EXCEEDED`. Every checkout failure code (`REQUEST_MISMATCH`, `REQUEST_NOT_PENDING`, `ASSET_UNAVAILABLE`, `CHECKOUT_CONFLICT`, `VALIDATION_ERROR`) keeps its existing FEAT-04 meaning.

**CR01-AC05-S4 (failed checkout).** *Given* checkout fails with a 400 due date or a 409 mismatch. *When* B1's quota is read. *Then* it is still `{2, 1, 3, …}`, and no loan exists for R1.

### CR01-AC06: terminal requests and returned loans are excluded

**CR01-AC06-S1.** *Given* B1 has 1 PENDING request. B1 also has one request in each terminal status: `CHECKED_OUT` (its loan returned), `DECLINED`, `CANCELLED` and `EXPIRED`, with closure fields satisfying `BorrowRequest_closure_consistent`. B1 has one **active** loan and two **returned** loans (`returnedAt` and `returnCustodianId` set). *When* B1 reads the quota. *Then* the response is `{1, 1, 2, 2, 3, 1, true}`.

**CR01-AC06-S2.** *Given* the state in S1. *When* B1 submits an otherwise-valid request. *Then* the response is 201, and the quota becomes `{2, 1, 3, 2, 3, 0, false}`.

**CR01-AC06-S3.** *Given* the state after S2. *When* B1 submits another otherwise-valid request. *Then* the response is 409 `BORROWING_QUOTA_EXCEEDED`. This also shows the terminal records were not ignored by accident: the limit still applies to live records.

**CR01-AC06-S4.** *Given* any of the above. *When* the scenario completes. *Then* the terminal rows' `status`, `closedAt`, `closeReason`, `closedById` and `returnedAt` are unchanged.

### CR01-AC07: historical over-limit records

**CR01-AC07-S1.** *Given* B1 has P = 3 and L = 2. These rows are inserted directly as pre-CR-01 history on distinct assets. *When* B1 reads the quota. *Then* the response is `{3, 2, 5, 2, 3, 0, false}`, and no row has been modified or deleted.

**CR01-AC07-S2.** *Given* the state in S1. *When* B1 submits an otherwise-valid request. *Then* the response is 409 `BORROWING_QUOTA_EXCEEDED`, and no writes occur.

**CR01-AC07-S3 (valid checkout preserved).** *Given* the state in S1, with one of B1's pending requests on an available asset in C1's scope. *When* C1 checks it out with a valid due date. *Then* the response is 201 with exactly one new loan. The quota is `{2, 3, 5, 2, 3, 0, false}`, which is still over the limit.

**CR01-AC07-S4 (until both limits permit).** *Given* B1 at P = 2, L = 0 after historical requests have reached terminal states through fixture updates. *When* B1 submits. *Then* the response is 409. *Given* B1 at P = 1, L = 2. *When* B1 submits. *Then* the response is 409. *Given* B1 at P = 1, L = 1. *When* B1 submits. *Then* the response is 201.

### CR01-AC08: concurrent submissions do not overshoot

**CR01-AC08-S1 (combined slot).** *Given* B1 has P = 1 and L = 1, and assets A5 and A6 are available with no requests from B1. *When* B1 sends `{A5}` and `{A6}` concurrently with the same session. *Then*:
- Exactly **one** response is 201.
- The other is 409 with code `BORROWING_QUOTA_EXCEEDED`, or `CONFLICT` if the internal serialization retry budget is exhausted (OD-03). It is never 201 or 500.
- The final state is P = 2, L = 1, combined 3. Exactly one new row exists, for A5 or A6.

**CR01-AC08-S2 (pending slot).** *Given* B1 has P = 1 and L = 0. *When* two otherwise-valid submissions for distinct assets run concurrently. *Then* exactly one 201 is returned, and the final P is 2.

**CR01-AC08-S3 (capacity 2, three contenders).** *Given* B1 has P = 0 and L = 1. *When* three otherwise-valid submissions for distinct assets run concurrently. *Then* exactly two 201s are returned, and the final state is P = 2, L = 1.

**CR01-AC08-S4 (repetition).** S1 is repeated for at least 20 independent fixture sets. The invariant must hold in **every** iteration.

**CR01-AC08-S5 (RED meaning).** On the pre-change revision, S1 is expected to fail, because both submissions return 201 and the final P is 3.

### CR01-AC09: existing error behavior is preserved

At quota (P = 2, L = 0, or P + L = 3), each pre-existing error keeps its code. In every case there are no writes and the quota is unchanged.

| Scenario | Given | When | Then |
| --- | --- | --- | --- |
| S1 Duplicate | B1 at P = 2 with R1 pending on A1 | B1 submits `{A1}` | 409 `DUPLICATE_REQUEST` (not `BORROWING_QUOTA_EXCEEDED`) |
| S2 Unavailable | B1 at quota; A7 has an active loan for B2 | B1 submits `{A7}` | 409 `ASSET_UNAVAILABLE` |
| S3 Retired | B1 at quota; A8 retired | B1 submits `{A8}` | 409 `ASSET_UNAVAILABLE` |
| S4 Unknown | B1 at quota | B1 submits `{ "assetId": "UNKNOWN-…" }` | 404 `NOT_FOUND` |
| S5 Malformed | B1 at quota | Body `{}`, `{assetId: ""}`, `{assetId: 5}`, `{assetId, status: "CHECKED_OUT"}`, `{assetId, borrowerId}`, or an 81-character ID | 400 `VALIDATION_ERROR` with `fields.assetId` |
| S6 Invalid JSON / oversized | B1 at quota | Malformed JSON / body over 16 KB | 400 `INVALID_JSON` / 413 `PAYLOAD_TOO_LARGE` |
| S7 Unauthenticated | No cookie | `POST /api/requests`; `GET /api/borrowing-quota` | 401 `UNAUTHENTICATED` for both |
| S8 Wrong role | Custodian C1 session | `POST /api/requests`; `GET /api/borrowing-quota` | 403 `FORBIDDEN` for both |
| S9 CSRF / Origin | B1 below quota | POST without `X-CSRF-Token`, or with a foreign `Origin` | 403 `INVALID_CSRF` / `FORBIDDEN_ORIGIN`; no row created |
| S10 Below quota | B1 at P = 0, L = 0 | Same duplicate, unavailable and malformed cases | Same codes as at the baseline (characterization) |

### CR01-AC10: borrowers are isolated and ownership is enforced

**CR01-AC10-S1.** *Given* B1 has P = 2 and L = 1, and B2 has P = 0 and L = 0. *When* B2 submits an otherwise-valid request for A1, the same asset B1 has pending. *Then* the response is 201. B2's quota is `{1, 0, 1, 2, 3, 1, true}`, and B1's quota is unchanged.

**CR01-AC10-S2.** *Given* B1 and B2 with different usage. *When* each calls `GET /api/borrowing-quota`. *Then* each response matches only that caller's own P and L.

**CR01-AC10-S3 (revised in r2, OD-05).** *Given* B1's session. *When* B1 calls `GET /api/borrowing-quota?borrowerId=<B2 id>`, or with any other query parameter such as `?x=1`. *Then* the response is **400 `VALIDATION_ERROR`** with `fields.query`, and no quota figures appear in the body. Without parameters, the 200 body contains only the seven quota fields and no user, request or asset identifiers. If the team instead chooses "ignore" for OD-05, the expected result becomes B1's own quota with status 200.

**CR01-AC10-S4.** *Given* any user. *When* the user calls `GET /api/borrowing-quota`. *Then* the response carries `Cache-Control: no-store`.

**CR01-AC10-S5 (preserved scope).** *Given* B1. *When* B1 reads B2's request or loan by direct ID (`GET /api/requests/:id`, `GET /api/loans/:id`). *Then* the response is 404 `NOT_FOUND`. A custodian's pending queue still shows only authorized assets (TC-07, TC-08, TC-11).

**CR01-AC10-S6.** *Given* B1 at quota. *When* B2 is checked out or submits. *Then* B1's quota does not change.

### CR01-AC11: UI shows the quota and gives actionable feedback

These are client-level scenarios in jsdom with mocked HTTP. S8 is also covered by E2E.

| ID | Given | When | Then |
| --- | --- | --- | --- |
| S1 Below limit | Quota `{1, 0, 1, 2, 3, 1, true}` | B1 opens `/requests` | The quota panel shows "1 of 2 pending requests", "1 of 3 pending requests and active loans" and "You can submit 1 more request". Eligible equipment is selectable, and Submit is enabled after selection. |
| S2 At limit | Quota `{2, 1, 3, 2, 3, 0, false}` | B1 opens `/requests` and the dashboard | The panel states the limit is reached and explains how capacity frees up. The selector and Submit are disabled. Catalog "Request to borrow" buttons are disabled with an accessible quota reason. Assets already pending still show "Request pending". |
| S3 Above limit | Quota `{3, 2, 5, 2, 3, 0, false}` | B1 opens `/requests` | The actual usage is shown without clamping (5 of 3), remaining is 0, and submission is disabled. |
| S4 Loading | Quota request unresolved | Page renders | A "Loading borrowing limit…" status is shown, and Submit is disabled. |
| S5 Error | Quota GET returns 500 or a network error | Page renders | An alert reads "Borrowing limit could not be loaded" with a Retry button, and Submit is disabled. Retry then success restores S1. |
| S6 Stale | The client shows capacity 1, but the server returns 409 `BORROWING_QUOTA_EXCEEDED` | B1 submits | The server message is shown and no success notice appears. The quota, catalog, requests and loans are re-fetched, and the panel then shows the limit reached. |
| S7 Refresh after success | B1 submits successfully | Response 201 | The success notice is shown and the quota is re-fetched. If the refresh fails, the UI states that the request succeeded but updated records could not be loaded (existing pattern). |
| S8 Session expiry | The quota GET or POST returns 401 | — | The session ends, quota state is removed, and the sign-in screen shows "Your session has ended". |
| S9 User switch | B1 signs out and B2 signs in; a delayed B1 quota response arrives | — | The delayed response is ignored (session epoch), and only B2's quota is shown. |
| S10 Custodian | Custodian signed in | Dashboard renders | No quota panel, and no `GET /api/borrowing-quota` call. |

### CR01-AC12: quota is derived from persisted records

**CR01-AC12-S1 (reload).** *Given* B1 has submitted 2 requests through the API. *When* a new Prisma client and app instance (or a page reload in E2E) reads the quota. *Then* it returns P = 2.

**CR01-AC12-S2 (checkout readback).** *Given* AC05-S1 has completed. *When* `GET /api/borrowing-quota`, `GET /api/requests/mine` and `GET /api/loans/mine` are read. *Then* they agree: one fewer PENDING request, one more ACTIVE loan, and quota `{1, 2, 3, …}`.

**CR01-AC12-S3 (restart).** *Given* the CI "Verify production image, jobs and restart persistence" step or an equivalent restart. *When* the API restarts. *Then* the quota read after restart equals the quota read before it. Nothing is stored in memory.

**CR01-AC12-S4 (direct DB change).** *Given* a fixture sets one of B1's active loans `returnedAt` (simulating a later return). *When* B1 reads the quota. *Then* L decreases by 1 on the next read with no cache invalidation.

## 4. Proposed recovery and activation criteria (r2; not in Issue #78)

**Decision status (r3).** AC13–AC20 are **PROPOSED, awaiting DEV4952 confirmation**. None is agreed. See the dated register in [impact analysis §16.2](CR-01-impact-analysis.md#162-proposed-acceptance-criteria-ac13ac20-not-in-issue-78). If checkpoint DC-1 selects contingency K2a (pending-limit only; [impact analysis §20.12](CR-01-impact-analysis.md#2012-lab-7-deadline-contingency-and-decision-checkpoint-dc-1-l7a-ev15)), AC02, AC04, AC05-S2, AC15, AC16 and AC20-S4 must be revised, and the Issue #78 criteria amended with permission.

These criteria come from risk R-01 ([impact analysis §20](CR-01-impact-analysis.md#20-recovery-dependencies-and-controlled-activation-l7a-ev11)). They test **quota recalculation** after recovery operations. They do **not** re-specify how cancel, decline or return work. Those operations belong to their own contracts: the #61 lifecycle contract, and the future FR-12 return issue (DEP-RT). Criteria marked **[DEP-RT]** can be fully exercised only after return exists. Until then, the parts that use a persisted return set by a fixture are executable, and the parts that use the API are BLOCKED.

| AC ID | Scenario | Expected Result |
|---|---|---|
| CR01-AC13 | Pending limit reached; borrower cancels one of their own pending requests | Quota capacity recovers; next valid request accepted |
| CR01-AC14 | Pending limit reached; assigned custodian declines one request | Quota capacity recovers; next valid request accepted |
| CR01-AC15 | Combined limit reached; equipment returned **[DEP-RT]** | L decreases; capacity recovers; next valid request accepted |
| CR01-AC16 | Grandfathered over-limit borrower performs recovery steps | Recovery operations allowed; submissions stay rejected until both limits permit |
| CR01-AC17 | Unauthorized cancel, decline or return attempts | Rejected by existing authorization; no quota value changes |
| CR01-AC18 | Quota display after successful recovery (own and other-user actions) | UI shows the recovered quota and re-enables submission |
| CR01-AC19 | Recovery dependencies unavailable (activation off, or misconfiguration) | Quota not enforced; endpoint disabled; UI hides quota; enabling without lifecycle writes refused at startup |
| CR01-AC20 | Concurrent submission with checkout, cancel, auto-decline or return for the same borrower | No overshoot; outcomes consistent with a serial order; checkout never quota-rejected |

### CR01-AC13: recovery after borrower cancellation

**S1.** *Given* B1 has P = 2 (R1 on A1, R2 on A2) and L = 0, with the quota active. *When* B1 submits an otherwise-valid request for A3. *Then* the response is 409 `BORROWING_QUOTA_EXCEEDED`. *When* B1 then calls `POST /api/requests/R1/cancel`. *Then* the response is 200, R1 is `CANCELLED` with `closeReason: CANCELLED_BY_BORROWER`, and the quota is `{1,0,1,2,3,1,true}`. *When* B1 submits A3 again. *Then* the response is 201, and the quota is `{2,0,2,2,3,0,false}`.

**S2 (combined limit, pending part).** *Given* B1 has P = 1 and L = 2. *When* B1 cancels the pending request. *Then* the quota is `{0,2,2,2,3,1,true}`, and the next valid submission returns 201.

**S3.** *Given* any cancellation. *When* it is performed. *Then* it is never quota-checked and never returns `BORROWING_QUOTA_EXCEEDED`.

### CR01-AC14: recovery after custodian decline

**S1.** *Given* B1 has P = 2 and L = 0, and C1 is assigned to A1. *When* C1 calls `POST /api/requests/R1/decline` with `{ "reason": "BORROWER_NOT_ELIGIBLE" }`. *Then* the response is 200 and R1 is `DECLINED`. B1's quota is `{1,0,1,…,1,true}`, and B1's next valid submission returns 201.

**S2 (auto-decline).** *Given* B1 has R1 pending on A1 and is at P = 2, and B2 also has a pending request on A1. *When* C1 checks out B2's request. *Then* B1's R1 becomes `DECLINED` / `ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER`, B1's quota becomes P = 1, and B1's next valid submission returns 201.

### CR01-AC15: recovery from the combined limit after return [DEP-RT]

**S1.** *Given* B1 has P = 0 and L = 3. *When* one loan is returned. *Then* the quota is `{0,2,2,2,3,1,true}`, and the next valid submission returns 201.
- Executable now (S1a): set `returnedAt` and `returnCustodianId` through a fixture.
- After DEP-RT (S1b): call the return API as the assigned custodian.

**S2.** *Given* B1 has P = 1 and L = 2. *When* one loan is returned. *Then* the quota is `{1,1,2,2,3,1,true}`, and the next valid submission returns 201.

**S3.** *Given* B1 has P = 2 and L = 1. *When* one loan is returned. *Then* the quota is `{2,0,2,2,3,0,false}`, so submission is still rejected because of the pending limit. This shows the two limits are evaluated independently.

### CR01-AC16: grandfathered over-limit recovery

*Given* B1 has P = 3 and L = 2 (pre-CR-01 rows). *When* the steps below are performed in order. *Then* each recovery operation itself succeeds (200, or 201 for checkout) and is never quota-rejected, and after each step the submission result is:

| Step | State after the step | Submission |
| --- | --- | --- |
| Cancel one | (2, 2) | 409 |
| Cancel one | (1, 2) | 409 |
| Return one **[DEP-RT]**, or a fixture return in S1a | (1, 1) | **201** |

No historical row is modified except by the explicit recovery operation applied to it.

### CR01-AC17: unauthorized recovery operations do not change the quota

*Given* B1 at P = 2, L = 1 and a snapshot of B1's quota. *When* each attempt below is made. *Then* it fails with the existing code, B1's quota and all rows are unchanged, and B1 still cannot submit.

| Attempt | Expected (existing contract) |
| --- | --- |
| B2 cancels B1's request | 404 `NOT_FOUND` |
| C1 (a custodian) calls cancel | 403 `FORBIDDEN` |
| B1 calls decline | 403 `FORBIDDEN` |
| An unassigned custodian declines B1's request | 404 `NOT_FOUND` |
| Cancel or decline without a CSRF token | 403 `INVALID_CSRF` |
| Cancel with a body (`{ "status": "CANCELLED" }`) | 400 `VALIDATION_ERROR` |
| **[DEP-RT]** B1 returns their own loan; an unassigned custodian returns it; a repeated return | 403; 404; 409 (as the return contract will define) |

### CR01-AC18: quota display after recovery

| ID | Given | When | Then |
| --- | --- | --- | --- |
| S1 | B1 at the limit on `/requests` | B1 cancels a request in the UI and receives 200 | The success notice is shown and the quota is re-read. The panel shows the new values, and Submit and catalog buttons are re-enabled for eligible assets. |
| S2 | B1 at the limit; C1 declines B1's request in another session | B1 enters `/requests`, or presses the panel's Refresh | The panel shows the recovered capacity |
| S3 **[DEP-RT]** | B1 at the combined limit; C1 records a return | B1 enters `/requests` or refreshes | The panel shows L − 1 |
| S4 | Recovery succeeded but the quota re-read fails | — | The UI says the action succeeded but the limits could not be refreshed. Submission stays disabled until Retry succeeds. |

### CR01-AC19: release behavior when recovery dependencies are unavailable

| ID | Given | When | Then |
| --- | --- | --- | --- |
| S1 | `BORROWING_QUOTA` unset or `disabled` | B1 at P = 2 submits an otherwise-valid request | 201, exactly as at `e5ed70d` (characterization) |
| S2 | Activation off | B1 calls `GET /api/borrowing-quota` | 404 `BORROWING_QUOTA_DISABLED` (after the 401 and 403 checks) |
| S3 | Activation off | Login and `/auth/me` | `features.borrowingQuota: false`; the client makes no quota call and shows no panel |
| S4 | `BORROWING_QUOTA=enabled` and `REQUEST_LIFECYCLE_WRITES` unset or `disabled` | The server starts (`runtimeConfig`) | `ConfigurationError`; the process does not start |
| S5 | `BORROWING_QUOTA=yes` (invalid) | The server starts | `ConfigurationError` |
| S6 | Production | Activation is proposed | Allowed only after release gates RG-01–RG-04 are met (impact analysis §20.6). This is a procedural gate verified by evidence, not by an automated test. |

### CR01-AC20: concurrency with checkout and recovery

| ID | Given | Concurrent operations | Then |
| --- | --- | --- | --- |
| S1 | B1 (2, 0), R1 on available A1 | Submit A3 ∥ checkout R1 | Checkout is never `BORROWING_QUOTA_EXCEEDED`. Submission succeeds **only if** checkout succeeded. Final P = 2 − c + s, L = c. Never P > 2 or P + L > 3. |
| S2 | B1 (1, 1), R1 is the only pending request | Submit A3 ∥ checkout R1 | Submission is 201 or `CONFLICT`, **never** `BORROWING_QUOTA_EXCEEDED`. When both succeed the final state is (1, 2). |
| S3 | B1 (2, 0) | Submit A3 ∥ cancel R1 | Submission succeeds only if the cancel succeeded. Final P = 2 − x + s. |
| S4 **[DEP-RT]** | B1 (0, 3) | Submit ∥ return one loan | Submission succeeds only if the return succeeded |
| S5 | B1 (2, 0) with R1 on A1; B2 pending on A1 | B1 submits A3 ∥ C1 checks out B2's request (auto-decline) | B1's submission succeeds only if the checkout succeeded. The invariant holds for both borrowers. |

## 5. Coverage

| AC | Requirements | STS case |
| --- | --- | --- |
| CR01-AC01 | FR-06, BR-14 | CR01-TC01 |
| CR01-AC02 | FR-06, BR-14 | CR01-TC02 |
| CR01-AC03 | BR-14, NFR-03 (no writes) | CR01-TC03 |
| CR01-AC04 | BR-14 | CR01-TC04 |
| CR01-AC05 | BR-06, BR-14, FR-09, FR-10 | CR01-TC05 |
| CR01-AC06 | BR-14 | CR01-TC06 |
| CR01-AC07 | BR-14, BR-06 | CR01-TC07 |
| CR01-AC08 | BR-14, BR-10 | CR01-TC08 |
| CR01-AC09 | BR-03, BR-10, BR-13, NFR-01, NFR-03 | CR01-TC09 |
| CR01-AC10 | BR-04, BR-14, FR-07, NFR-01 | CR01-TC10 |
| CR01-AC11 | FR-07 (CR-01), BR-14 | CR01-TC11 |
| CR01-AC12 | BR-14, NFR-05 | CR01-TC12 |
| CR01-AC13 (proposed) | BR-14 (c), (d) | CR01-TC13 |
| CR01-AC14 (proposed) | BR-14 (c) | CR01-TC14 |
| CR01-AC15 (proposed) [DEP-RT] | BR-14 (c); FR-12 (dependency) | CR01-TC15 (a executable; b BLOCKED) |
| CR01-AC16 (proposed) | BR-14 (d) | CR01-TC16 |
| CR01-AC17 (proposed) | BR-03, BR-04, BR-05, BR-14 | CR01-TC17 |
| CR01-AC18 (proposed) | FR-07 (CR-01), BR-14 | CR01-TC18 |
| CR01-AC19 (proposed) | BR-14 (g) | CR01-TC19 |
| CR01-AC20 (proposed) | BR-14 (b), (e), BR-09 | CR01-TC20 |

All 12 Issue #78 criteria are preserved and expanded (12 of 12). Eight recovery and activation criteria are proposed (AC13–AC20, pending agreement). No criterion has been executed or accepted.
