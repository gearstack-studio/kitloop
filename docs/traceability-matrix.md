# KitLoop Requirements Traceability Matrix

Status: Planned verification; teammate review pending.  
Baseline: [SRS](srs.md), repository revision `c9c8895`, 2026-11-02.  
Feature definitions and review gates: [Feature Inventory](feature-inventory.md).

## Reading the matrix

Every mandatory FR has one owning feature. BR mappings are many-to-many because constraints cross feature boundaries. Sprint means first verification from the SRS, not implementation completion. All TC IDs below are unique planned test cases, not executed tests or passing evidence. The existing `server/tests/health.test.ts` checks health only and does not establish coverage for these cases. Implementation PRs should reference TC IDs in automated tests or manual evidence and record results and commit references.

## Functional requirements and planned cases

Each row defines the named TC's acceptance checks. API checks include persisted state where the requirement changes data; UI checks confirm observable presentation where relevant.

| FR | Owning feature | Sprint | Related BR | Planned test case and acceptance checks |
| --- | --- | --- | --- | --- |
| FR-01 | FEAT-01 | 1 | BR-03 | TC-01: Seeded Borrower and Custodian can sign in; invalid credentials create no authenticated session. |
| FR-02 | FEAT-01 | 1 | BR-03 | TC-02: Logout ends a valid session; reusing it for a protected call is rejected. |
| FR-03 | FEAT-01 | 1 | BR-03 | TC-03: Current-user response exposes the correct identifier and role; unauthenticated access exposes no identity. |
| FR-04 | FEAT-02 | 1 | — | TC-04: Synthetic catalog lists Asset ID, name, category, description, and availability; separate copies have distinct IDs. |
| FR-05 | FEAT-02 | 1 | BR-08 (2), BR-13 (3) | TC-05: Catalog availability matches the borrowable state of seeded assets in Sprint 1. Extend with checkout/return readback in Sprint 2 and retired assets in Sprint 3. |
| FR-06 | FEAT-03 | 1 | BR-03, BR-10; BR-13 (3) | TC-06: Valid existing borrowable asset produces a returned and saved pending request with requester, asset, and submission time; missing, unknown, or non-borrowable asset is rejected without writes. |
| FR-07 | FEAT-03 | 1 | BR-03, BR-04 | TC-07: Borrower sees their newly submitted request with asset/status; another borrower's list and direct record ID cannot expose it. |
| FR-08 | FEAT-03 | 2 | BR-03, BR-05 | TC-08: Custodian queue includes pending requests with requester and Asset ID for authorized assets; out-of-scope requests are inaccessible. |
| FR-09 | FEAT-04 | 2 | BR-01, BR-02, BR-03, BR-05, BR-06, BR-08, BR-09, BR-11; BR-13 (3) | TC-09: Authorized checkout of an available asset with its pending request and future due date identifies a loan and checks out the request. Invalid role, scope, asset state, request state/asset match, or due date produces no transition. |
| FR-10 | FEAT-04 | 2 | BR-02, BR-06, BR-08, BR-09, BR-11 | TC-10: Checkout persists exactly one active loan with asset, borrower, request, checkout time, due date, and custodian; reload and restart preserve the record. |
| FR-11 | FEAT-05 | 2 | BR-03, BR-04 | TC-11: Borrower sees only their active and returned loans, with checkout/due/return information when present; foreign loan IDs are denied. |
| FR-12 | FEAT-04 | 2 | BR-03, BR-05, BR-07, BR-08 | TC-12: Authorized return closes an active loan with one return time and restores non-retired availability; wrong role/scope, inactive loan, and repeated return leave state unchanged. |
| FR-13 | FEAT-05 | 3 | BR-12 | TC-13: Every active loan shows its due date; controlled time before or exactly at due time is not overdue, after due time is overdue, and returned loans are never currently overdue. |
| FR-14 | FEAT-07 | 3 | BR-03, BR-05 | TC-14: Authorized create with unique Asset ID and required details appears in catalog; duplicate/missing details and unauthorized create fail without writes. |
| FR-15 | FEAT-07 | 3 | BR-02, BR-03, BR-05, BR-13 | TC-15: Authorized detail edits persist; retirement succeeds only without an active loan, prevents borrowing/checkout, and succeeds after return; unauthorized edits fail without writes. |
| FR-16 | FEAT-02 | 3 | BR-13 | TC-16: Search by Asset ID/name and category/availability filters, separately and combined, return matching assets; no-match results are empty and retired assets are excluded from borrowable results. |
| FR-17 | FEAT-06 | 3 | BR-03, BR-05, BR-08, BR-13 | TC-17: Authorized summary total/available/checked-out/retired counts agree with the scoped asset list after checkout, return, and retirement; foreign inventory is excluded. |

## Business-rule coverage

Dedicated rule cases supplement the FR cases; all rejected operations must preserve affected records.

| BR | Related features | First sprint | Planned verification |
| --- | --- | --- | --- |
| BR-01 | FEAT-04 | 2 | TC-09 rejects unavailable, retired, and out-of-scope checkout. Use seeded retired state before administration arrives. |
| BR-02 | FEAT-04, FEAT-07 | 2 | TC-10 and TC-19 verify at most one active loan per asset; TC-15 later checks retirement while loaned. |
| BR-03 | FEAT-01, FEAT-03, FEAT-04, FEAT-05, FEAT-06, FEAT-07 | 1 | TC-18: For every protected operation introduced, unauthenticated calls return unauthorized and wrong-role calls forbidden, without mutation. Extend each sprint. |
| BR-04 | FEAT-01, FEAT-03, FEAT-05 | 1 | TC-07 covers foreign requests including direct IDs; TC-11 extends ownership checks to loans in Sprint 2. |
| BR-05 | FEAT-01, FEAT-03, FEAT-04, FEAT-06, FEAT-07 | 2 | TC-08, TC-09, TC-12 check scoped queue/checkout/return; TC-14, TC-15, TC-17 extend to administration/reporting in Sprint 3. |
| BR-06 | FEAT-03, FEAT-04 | 2 | TC-09 checks pending status and Asset ID match; TC-20 checks atomic `PENDING` to `CHECKED_OUT` transition, loan creation, and failure rollback. |
| BR-07 | FEAT-04 | 2 | TC-12 checks active-only return, one timestamp, and unchanged state on repeat; TC-20 checks atomic return rollback. |
| BR-08 | FEAT-02, FEAT-04, FEAT-06 | 2 | TC-05, TC-09, TC-12 verify availability agrees with active-loan state after checkout/return; TC-17 later checks counts. |
| BR-09 | FEAT-04 | 2 | TC-19: Send concurrent checkouts of two pending requests for one Asset ID against PostgreSQL; exactly one succeeds, one active loan exists, and the loser receives conflict with its request still pending. |
| BR-10 | FEAT-03 | 1 | TC-21: Requests from two different borrowers for the same borrowable asset coexist as pending; submission creates no loan, reservation, or availability change. Duplicate pending submissions by the same borrower return 409, including concurrent submissions, and leave only one pending record. See the FEAT-03 implementation contract and automated tests. |
| BR-11 | FEAT-04 | 2 | TC-09 rejects missing, invalid, past, and exactly-current due dates; accepts a future due date using controlled checkout time. |
| BR-12 | FEAT-05 | 3 | TC-13 verifies the strict time boundary and exclusion of returned loans. |
| BR-13 | FEAT-02, FEAT-03, FEAT-04, FEAT-06, FEAT-07 | 3 | TC-05, TC-06, TC-09, TC-15, TC-16, TC-17 verify retired assets are non-borrowable, reject requests/checkout, and appear correctly in summary counts. |

## Cross-cutting quality requirements

These cases retain the SRS quality baseline without inventing additional product features.

| NFR | Related features | First sprint | Planned verification |
| --- | --- | --- | --- |
| NFR-01 | FEAT-01 and all protected domain operations | 1 | TC-18 plus TC-07/TC-11 for direct foreign-record access; extend to new endpoints each sprint. |
| NFR-02 | FEAT-01 | 1 | TC-22: Inspect seeded password storage for non-plaintext values, environment configuration, and ignore rules for secrets; verify valid/invalid sign-in through TC-01. Do not record secrets in evidence. |
| NFR-03 | All features as introduced | 1 | TC-23: Exercise missing, malformed, and rule-violating input on each write operation; expect a client error with usable field/rule message and unchanged database state. |
| NFR-04 | All features as introduced | 1 | TC-24: Force an internal integration-test failure; verify consistent error format with no stack, SQL, credentials, or internal paths. |
| NFR-05 | FEAT-02, FEAT-03, FEAT-04, FEAT-05, FEAT-07 | 2 | TC-25: Restart/readback of assets, requests, and loans against PostgreSQL; attempt duplicate Asset IDs and duplicate active loans and verify database constraints reject them. |
| NFR-06 | FEAT-04 | 2 | TC-20: Inject failure between related checkout writes and between return writes; verify complete rollback. Successful paths commit all related state. TC-19 covers simultaneous checkout. |
| NFR-07 | All features delivered through Sprint 2 | 2 | TC-26: Teammate follows clean-checkout prerequisites, environment examples, install, migration/seed, build, and test instructions for app/test database; record commands and results. |
| NFR-08 | All features | 3 | TC-27: Run documented client/server builds, review environment/migration deployment checklist, and record deployed health/sign-in/catalog/request/checkout/return smoke evidence with synthetic data. |
| NFR-09 | All features | 3 | TC-28: Audit implemented tests against every BR transition and authorization boundary in this RTM; run documented full build/test commands and record passing results before handoff. |

## Coverage and review disposition

The plan maps 17/17 FR to exactly one of seven features, 13/13 BR to planned cases, and 9/9 NFR to planned checks. Sprint 1 includes all seven in-scope FR (FR-01–FR-07), three BR (BR-03, BR-04, BR-10), and four NFR (NFR-01–NFR-04). Sprint 2 first verifies FR-08–FR-12, BR-01/BR-02/BR-05–BR-09/BR-11, and NFR-05–NFR-07. Sprint 3 first verifies FR-13–FR-17, BR-12/BR-13, and NFR-08/NFR-09. Earlier cases remain regression obligations.

Coverage here means planned traceability, not implemented behavior. TC-01–TC-28 remain planned until linked implementation evidence exists. Human review by both team members and a reviewed PR remain pending in the [inventory review table](feature-inventory.md#decisions-and-review). Reviewers should confirm the SRS baseline, complete ID coverage, non-overlapping FR ownership, sprint boundaries, negative cases, and unresolved OQ treatments before approval.
