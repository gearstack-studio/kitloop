# CR-01 Borrowing Quota Management — Acceptance Criteria

| Document control | Value |
| --- | --- |
| Document ID | L7A-CR01-AC (evidence L7A-EV06) |
| Version | **CR-01 contract r4 (draft): pending-request quota (DC-1 K2a).** Supersedes r1–r3. |
| Status | **AGREED.** The r4 criteria were approved and merged in PR #79 (`7519274`) and confirmed by DEV4952 on 2026-11-26 at 21:48 ICT ([comment 7195363924](https://github.com/gearstack-studio/kitloop/issues/78#issuecomment-7195363924)), including AC13, AC14 and AC16–AC21. AC04 is superseded and AC15 is deferred. Not yet executed. |
| Source | [Issue #78](https://github.com/gearstack-studio/kitloop/issues/78) §7: AC01–AC12, written for the r1 combined quota (§1, historical). Proposed r2 additions AC13–AC20. New r4 AC21. |
| Related | [Impact analysis](CR-01-impact-analysis.md) · [STS](CR-01-STS.md) |

IDs are stable. A criterion whose meaning no longer applies is **Superseded** or **Deferred**; it is never renumbered or reused. No criterion has been executed or accepted.

## 1. Historical source: Issue #78 §7 (r1 combined-quota wording; superseded by DC-1)

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

## 2. Conventions (r4)

- **P** is the session borrower's `PENDING` requests. Loans are **never** counted.
- **Quota DTO**: `{pendingRequests, maxPendingRequests, remainingRequestCapacity, canSubmitRequest}`, written below as `{P, 2, max(0, 2−P), P<2}`. Example: `{1,2,1,true}`.
- **Rejection**: 409 `{ error: { code: "BORROWING_QUOTA_EXCEEDED", message } }`. **No writes** means every `BorrowRequest` and `Loan` row is unchanged and catalog availability is unchanged.
- **Otherwise-valid submission**: authenticated borrower, valid Origin and CSRF, body `{ assetId }`, the asset exists and is available, and no PENDING request by this borrower for it exists.
- **Activation precondition**: AC01–AC18, AC20 and AC21 are judged with `BORROWING_QUOTA=enabled` and `REQUEST_LIFECYCLE_WRITES=enabled`. AC19 covers activation off and the coupling.

## 3. r4 classification and mapping

Required-coverage numbers (C1–C16) refer to the r4 task list (§6).

| ID | r1–r3 meaning | r4 class | r4 criterion | Coverage | Test |
| --- | --- | --- | --- | --- | --- |
| AC01 | P=0, L=0 accepted | **Retained** (L removed) | P = 0: valid request → 201 | C1 | TC01 |
| AC02 | P=1, L=1 accepted; combined 3 | **Revised** | P = 1: valid request → 201; P becomes 2; capacity 0 | C2 | TC02 |
| AC03 | P=2, L=0 rejected | **Retained** | P = 2: 409, no writes | C3 | TC03 |
| AC04 | P+L limit rejects | **Superseded** (combined limit deferred) | — (replaced by AC21) | — | TC04 superseded |
| AC05 | Checkout quota-neutral | **Revised** | Checkout reduces P by 1 and frees capacity; never quota-rejected | C6 | TC05 |
| AC06 | Terminal requests and returned loans excluded | **Revised** | Terminal requests excluded; loans of any state irrelevant | policy | TC06 |
| AC07 | Over-limit history | **Revised** | P ≥ 3 history preserved; submissions rejected; checkout allowed | C5 | TC07 |
| AC08 | Concurrent last slot | **Revised** | At P = 1, two concurrent submissions → exactly one 201 | C10 | TC08 |
| AC09 | Existing errors preserved | **Retained** | Unchanged codes and precedence | C12 | TC09 |
| AC10 | Isolation | **Retained** (DTO revised) | Per-borrower quota; privacy; query 400 | C13 | TC10 |
| AC11 | UI states | **Revised** | Pending-only display; loading, error, full, stale | C14 | TC11 |
| AC12 | Persistence | **Revised** | P derived from persisted rows; reload, restart, refresh | C15 | TC12 |
| AC13 | Recovery by cancel | **Retained** (combined variant removed) | Cancel restores capacity | C7 | TC13 |
| AC14 | Recovery by decline and auto-decline | **Retained** | Decline and auto-decline restore capacity | C8, C9 | TC14 |
| AC15 | Recovery by return | **Deferred** (FR-12, #84) | — | — | TC15 deferred |
| AC16 | Grandfathered recovery | **Revised** (no return) | P ≥ 3 recovers through cancel, decline or checkout until P < 2 | C5 | TC16 |
| AC17 | Unauthorized recovery | **Revised** (return rows removed) | Rejected; quota unchanged | C12 | TC17 |
| AC18 | UI after recovery | **Revised** (return case removed) | Recovered capacity displayed | C14, C15 | TC18 |
| AC19 | Activation off and coupling | **Retained** (gate references revised) | Safe disabled behavior; startup coupling | C16 | TC19 |
| AC20 | Concurrency with checkout and recovery | **Revised** (return case removed; (1,1) case → P = 1) | Valid serial outcomes only | C11 | TC20 |
| **AC21** | — | **New (r4)** | Active loans never affect eligibility | C4 | TC21 |

## 4. Active r4 criteria

### CR01-AC01: P = 0
*Given* B1 has no PENDING requests, with any number of loans. *When* B1 submits an otherwise-valid request. *Then* the response is 201 with `status: "PENDING"`, `borrowerId` = session user. One PENDING row is created, no loan is created, and the asset is still available. The quota changes from `{0,2,2,true}` to `{1,2,1,true}`.

### CR01-AC02: P = 1
*Given* B1 has P = 1. *When* B1 submits an otherwise-valid request for a different asset. *Then* the response is 201, and the quota is `{2,2,0,false}`.

### CR01-AC03: P = 2 rejected
*Given* B1 has P = 2. *When* B1 submits an otherwise-valid request for a third asset. *Then* the response is 409 `BORROWING_QUOTA_EXCEEDED`, with no writes and the quota unchanged. The same holds for repeated attempts.

### CR01-AC05: checkout reduces pending usage
*Given* B1 has P = 2 (R1 on A1, R2 on A2), and A1 is in custodian C1's scope. *When* B1 submits A3. *Then* the response is 409.
*When* C1 checks out R1. *Then* the response is 201: R1 is `CHECKED_OUT`, exactly one loan exists, and the quota is `{1,2,1,true}`.
*When* B1 submits A3 again. *Then* the response is 201.

Checkout is never rejected with `BORROWING_QUOTA_EXCEEDED`. A failed checkout (400 due date, 409 mismatch) leaves P = 2.

### CR01-AC06: terminal requests excluded
*Given* B1 has one PENDING request and one request in each of `CHECKED_OUT`, `DECLINED`, `CANCELLED` and `EXPIRED` (closure fields valid), plus active and returned loans. *When* B1 reads the quota. *Then* it is `{1,2,1,true}`.
*When* B1 submits. *Then* the response is 201. *When* B1 submits again. *Then* the response is 409. Terminal rows are unchanged.

### CR01-AC07: historical P ≥ 3
*Given* B1 has P = 3 (inserted directly). *When* B1 reads the quota. *Then* it is `{3,2,0,false}`, unclamped. *When* B1 submits. *Then* the response is 409 with no writes.
*When* C1 checks out one of B1's requests. *Then* the response is 201 and P becomes 2.

### CR01-AC08: concurrent submissions at P = 1
*Given* B1 has P = 1. *When* two otherwise-valid submissions for distinct assets run concurrently. *Then* exactly one returns 201, and the other returns 409 `BORROWING_QUOTA_EXCEEDED` (or `CONFLICT` only on retry exhaustion). Final P = 2.
*Given* B1 has P = 0. *When* three such submissions run concurrently. *Then* exactly two return 201.

### CR01-AC09: existing behavior preserved (at and below the limit)
| Scenario | Expected |
| --- | --- |
| Duplicate asset already pending | 409 `DUPLICATE_REQUEST` (not quota) |
| Asset checked out or retired | 409 `ASSET_UNAVAILABLE` |
| Unknown asset | 404 `NOT_FOUND` |
| Malformed or extra fields | 400 `VALIDATION_ERROR` (`fields.assetId`) |
| Invalid JSON; body over 16 KB | 400 `INVALID_JSON`; 413 |
| No session (POST and GET) | 401 |
| Custodian (POST and GET) | 403 `FORBIDDEN` |
| Missing CSRF; foreign Origin | 403 `INVALID_CSRF`; `FORBIDDEN_ORIGIN` |

Every row: no writes, quota unchanged.

### CR01-AC10: isolation and privacy
- B2 at P = 0 can request an asset that B1 (at P = 2) has pending: 201. B1's quota is unchanged.
- Each borrower's GET reflects only their own P.
- `GET /api/borrowing-quota?borrowerId=…` (or any query parameter) → 400 `VALIDATION_ERROR` (`fields.query`).
- 200 bodies contain only the four fields; `Cache-Control: no-store`.
- Foreign request and loan IDs → 404 (unchanged).

### CR01-AC11: UI
| ID | Given | Then |
| --- | --- | --- |
| S1 | `{1,2,1,true}` | Panel: "1 of 2 pending requests · You can submit 1 more request"; Submit enabled for eligible assets |
| S2 | `{2,2,0,false}` | Panel states the limit is reached and that a checkout, cancel or decline frees a slot. Selector, Submit and catalog request buttons are disabled with an accessible quota reason. Already-pending assets still show "Request pending". |
| S3 | `{3,2,0,false}` | Shows "3 of 2", unclamped; disabled |
| S4 | Quota loading | Status "Loading borrowing limit…"; Submit disabled |
| S5 | Quota GET fails | Alert with Retry; Submit disabled until the read succeeds |
| S6 | Stale: client shows capacity, server returns 409 quota | Server message shown, no success notice; quota, catalog, requests and loans re-read |
| S7 | 201 success | Notice shown; quota re-read; a refresh failure is reported as "succeeded but could not refresh" |
| S8 | 401 on the GET or POST | Session ended; quota state cleared |
| S9 | User switch with a delayed response | The stale response is ignored (session epoch) |
| S10 | Custodian | No quota call or panel |

### CR01-AC12: persistence and refresh
- P is identical across an app or Prisma client restart.
- After a checkout, the GET, `/requests/mine` and `/loans/mine` agree. The GET shows P − 1; loans do not appear in the quota.
- After a direct fixture status change (for example to `CANCELLED`), the next GET reflects it with no cache.
- E2E: values persist across a page reload.

### CR01-AC13: recovery by cancel
*Given* B1 has P = 2. *When* B1 submits. *Then* the response is 409.
*When* B1 cancels R1. *Then* the response is 200, R1 is `CANCELLED`/`CANCELLED_BY_BORROWER`, and the quota is `{1,2,1,true}`.
*When* B1 submits. *Then* the response is 201. Cancel is never quota-checked.

### CR01-AC14: recovery by decline and auto-decline
- **S1 (decline).** *Given* B1 has P = 2. *When* B1 submits. *Then* 409. *When* the assigned custodian declines R1 (`BORROWER_NOT_ELIGIBLE`). *Then* 200, the quota is `{1,2,1,true}`, and B1's next submission returns 201.
- **S2 (auto-decline).** *Given* B1 has P = 2 with R1 on A1, and B2 is pending on A1. *When* C1 checks out B2's request. *Then* R1 becomes `DECLINED`/`ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER`, B1's quota is `{1,2,1,true}`, and B1's next submission returns 201.

### CR01-AC16: grandfathered recovery
*Given* B1 has P = 4 (historical). *When* the steps below are applied in order. *Then* each recovery operation succeeds and is never quota-checked, with the submission results shown.

| Step | P after the step | Submission |
| --- | --- | --- |
| Cancel | 3 | 409 |
| Decline | 2 | 409 |
| Checkout | 1 | **201** |

Only the operated rows change.

### CR01-AC17: unauthorized recovery leaves the quota unchanged
*Given* B1 at P = 2. *When* each attempt below is made. *Then* it fails with the listed code, and P, the quota and all rows are unchanged:
- B2 cancels B1's request → 404.
- A custodian calls cancel → 403.
- B1 calls decline → 403.
- An unassigned custodian declines → 404.
- Missing CSRF → 403.
- Cancel with a body → 400.
- An unassigned custodian checks out → 404.

### CR01-AC18: UI after recovery
- **S1.** Own cancel in the UI → quota re-read → panel `{1,2,1,true}` → Submit re-enabled.
- **S2.** A custodian declines or checks out in another session → the borrower sees the new capacity on entering `/requests` or pressing Refresh.
- **S3.** The re-read after recovery fails → "succeeded but could not refresh" is shown, and Submit stays disabled until Retry succeeds.

### CR01-AC19: activation off and coupling
| ID | Given | Then |
| --- | --- | --- |
| S1 | `BORROWING_QUOTA` unset or `disabled`; B1 at P = 2 | Submission → 201, exactly as at `e5ed70d` |
| S2 | Off | GET → 404 `BORROWING_QUOTA_DISABLED` (after the 401 and 403 checks) |
| S3 | Off | `features.borrowingQuota: false`; no client quota call or panel |
| S4 | `BORROWING_QUOTA=enabled` with lifecycle writes unset or `disabled` | Startup `ConfigurationError` |
| S5 | Invalid value | Startup `ConfigurationError` |
| S6 | Production | Activation only after RG-01, RG-03 and RG-04, then RG-05 ([impact analysis §20.3](CR-01-impact-analysis.md#203-release-gates-r4)). Procedural, verified by evidence. |

### CR01-AC20: concurrency with checkout and lifecycle
| ID | Given | Concurrent | Then |
| --- | --- | --- | --- |
| S1 | P = 2, R1 checkable | Submit ∥ checkout R1 | Submission 201 only if the checkout succeeded; final P = 2 − c + s; checkout never quota-rejected |
| S2 | P = 1, R1 the only pending request | Submit ∥ checkout R1 | Submission is 201 or `CONFLICT`, **never** `BORROWING_QUOTA_EXCEEDED`; final P = 1 when both succeed |
| S3 | P = 2 | Submit ∥ cancel R1 | Submission 201 only if the cancel succeeded |
| S4 | P = 2 | Submit ∥ custodian decline R1 | Submission 201 only if the decline succeeded |
| S5 | P = 2, R1 on A1; B2 pending on A1 | B1 submit ∥ checkout of B2's request (auto-decline) | B1's submission 201 only if the checkout succeeded |

In every scenario, P ≤ 2 always holds for borrowers who started at P ≤ 2.

### CR01-AC21: active loans never affect eligibility (new)
*Given* B1 has P = 0 with L = 3 or L = 5 active loans, or P = 1 with L = 3. *When* B1 submits an otherwise-valid request. *Then* the response is 201, and the quota shows only pending figures.

This is preserved-behavior protection, equal to the baseline. It guards against the combined limit being implemented by mistake.

## 5. Superseded and deferred criteria (not active)

| ID | Disposition | Reason / where it goes |
| --- | --- | --- |
| AC04 | **Superseded** | The combined P + L limit is not part of r4 (DC-1). Its scenarios (P=1, L=2; P=0, L=3) are now **accepted**, under AC21. |
| AC15 | **Deferred** | Return-based recovery belongs to a future combined-limit change after FR-12 (#84). |
| r1–r3 wording of AC02, AC05, AC06, AC11, AC12, AC16, AC17, AC18, AC20 | **Superseded** by the r4 text above | Commits `e1def2a` and `03bb7c7` |

## 6. Required r4 coverage

| # | Required coverage | AC |
| ---: | --- | --- |
| C1 | P = 0 accepted | AC01 |
| C2 | P = 1 accepted, reaching P = 2 | AC02 |
| C3 | P = 2 rejected, 409, no writes | AC03 |
| C4 | Active loans do not affect eligibility | AC21 |
| C5 | Historical P > 2 preserved; submissions rejected | AC07, AC16 |
| C6 | Checkout reduces pending usage | AC05 |
| C7 | Cancellation restores capacity | AC13 |
| C8 | Decline restores capacity | AC14-S1 |
| C9 | Auto-decline restores capacity | AC14-S2 |
| C10 | Concurrent submissions at P = 1 do not overshoot | AC08 |
| C11 | Concurrent submission and lifecycle transitions: valid serial outcomes | AC20 |
| C12 | Duplicate, unavailable, malformed and authorization behavior unchanged | AC09, AC17 |
| C13 | Borrower isolation | AC10 |
| C14 | UI loading, error, full and stale states | AC11, AC18 |
| C15 | Persistence, reload and refresh | AC12, AC18 |
| C16 | Feature disabled; lifecycle coupling | AC19 |

All 16 required items are covered by active criteria. AC04 and AC15 are inactive.
