# KitLoop Three-Sprint Development Plan

**Course checkpoint:** CPE 334 Project Deliverable 1, Part D  
**Planning status:** Provisional; the SRS, Feature Inventory, RTM, and SDS are drafts awaiting teammate review, and their Sprint 1 allocation conflicts with the course's Theme 2 example.  
**Team:** Two students (`yiiipunn`, primary plan owner; `DEV4952`, reviewer). Both participate in requirements, design, implementation, tests, review, integration, and release.

## 1. Introduction

KitLoop is a web application for a university department to track individual equipment copies by Asset ID and control their borrowing. A Borrower requests an available asset; an authorized Custodian records physical checkout, which creates a persistent active loan and changes availability. The planned implementation has a React/TypeScript UI, an Express/TypeScript API, and PostgreSQL with Prisma. Requests, loans, permissions, and availability must be enforced by the backend and survive an application restart.

The delivery strategy is a working vertical slice in Sprint 1, lifecycle and inventory expansion in Sprint 2, and remaining features plus integration and hardening in Sprint 3. Each sprint builds on the same application and requires feature contracts before implementation, automated verification, teammate review, and integrated acceptance evidence. Seeded accounts and synthetic equipment data keep the two-student scope manageable. A separate approval workflow is not planned; custodian checkout is the custody-changing step.

### Baseline and source status

- The current `docs/srs.md` contains FR-01–FR-17, BR-01–BR-13, and NFR-01–NFR-09. It labels itself a draft, not an approved SRS. This plan retains those exact IDs and does not claim any requirement is implemented.
- The requested paths `docs/features.md`, `docs/traceability.md`, and `docs/system-sds.md` do not exist. Their current counterparts are [Feature Inventory](../feature-inventory.md) (FEAT-01–FEAT-07), [Requirements Traceability Matrix](../traceability-matrix.md) (TC-01–TC-28, planned only), and [System-Level SDS](../sds-system-level.md). All three identify themselves as drafts or proposed design with teammate review pending; none establishes executed tests or approved scope changes.
- No `references/` directory exists in this repository. The supplied official PDFs were readable at `D:\group_project_spec_files\`: `group_work_specs_v1.pdf` (Theme 2 and common requirements), `project_deliverable_1_v1.pdf`, `project_deliverable_2_v1.pdf`, and `project_final_delivery_v1.pdf`. The course documents require Sprint 1 checkout, active-loan persistence, availability and duplicate-loan rules, and server-side access checks.
- **Baseline conflict requiring review:** The [SRS](../srs.md) sections 5–7 and 10, Feature Inventory (FEAT-03 queue, FEAT-04 checkout, FEAT-05 loan view), RTM (TC-08–TC-11, TC-19, TC-20, TC-25, TC-26), and SDS sections 3 and 8 defer the checkout/loan slice to Sprint 2. The official Theme 2 example and Deliverable 1 require checkout, a persisted active loan, availability and duplicate-loan rejection, and backend access checks in Sprint 1. The plan follows that course checkpoint without claiming the draft baseline is already reconciled. The SRS also assigns NFR-08 to Sprint 3, while Lab 5 requires Docker, CI/CD, and GCP by 15 November. Review and version the affected baseline documents before claiming Part D traceability is complete.
- Only FEAT-01–FEAT-07 and their linked SRS requirements are the proposed mandatory product baseline. The SRS section 4 exclusions (for example, notifications, fines, scanning, and automatic waitlists) have no Feature IDs or sprint commitments here.

## 2. Sprint 1 — Engineering baseline

**Deadline:** 8 November 2026, 23:59.  
**Goal:** Release a locally reproducible, tested request-to-checkout journey through UI, API, and PostgreSQL.

**Feature IDs:** FEAT-01 (identity), FEAT-02 (catalog/availability), FEAT-03 (request and custodian queue), FEAT-04 (checkout), and FEAT-05 (active-loan view). **Requirement anchors:** FR-01–FR-11; BR-01–BR-06, BR-08–BR-11; NFR-01–NFR-07, for the Sprint 1 portions noted below. FEAT-03 queue, FEAT-04 checkout, and FEAT-05 active-loan view are course-required Sprint 1 targets despite their later allocation in the current draft inventory.

| Work package | Dependencies | Expected completed outcome | Verification evidence |
| --- | --- | --- | --- |
| FEAT-01 identity and access (FR-01–FR-03; BR-03–BR-05; NFR-01, NFR-02) | Seeded Borrower and Custodian accounts; SDS session design and password hashing | Valid login, invalid-login rejection, current-user identity, and effective logout; backend role and record-ownership checks | RTM TC-01–TC-03, TC-18, TC-22; API tests for anonymous, wrong-role, cross-borrower, and out-of-scope custodian access; selected UI login/logout check |
| FEAT-02 seeded catalog and availability (FR-04, FR-05) | Asset ID and SDS CustodianAsset scope; reproducible seed | Borrower sees distinct synthetic assets and their available/unavailable state | RTM TC-04, TC-05; UI/API readback and database seed/uniqueness checks |
| FEAT-03 borrow request, personal view, and custodian queue (FR-06–FR-08; BR-10; NFR-03) | FEAT-01, FEAT-02 | Borrower requests an available asset and retrieves the persisted pending request; authorized Custodian can see it; request creates no loan or reservation | RTM TC-06–TC-08, TC-21, TC-23; API/database tests for saved data, invalid input, scope, and cross-borrower access; UI journey |
| FEAT-04 checkout and FEAT-05 active-loan view (FR-09–FR-11; BR-01, BR-02, BR-05, BR-06, BR-08, BR-09, BR-11; NFR-04–NFR-06) | FEAT-03 pending request, SDS asset-row lock and database constraints | Custodian checks out an available authorized asset; one active loan and fulfilled request persist; availability changes; Borrower sees own active loan after restart | RTM TC-09–TC-11, TC-19, TC-20, TC-24, TC-25; API/PostgreSQL transaction and concurrent-checkout tests; unavailable/duplicate rejection with no partial update; selected end-to-end UI journey and restart/readback |
| Local release readiness (NFR-07) | FEAT-01–FEAT-05 Sprint 1 portions | Another teammate can install, migrate/seed, run, build, and test the local increment from the documented steps | RTM TC-26; clean-checkout reproduction record, actual build/test output and tested release commit |

The selected normal journey is: Borrower login → view available Asset ID → submit and retrieve request → Custodian login → view authorized request → checkout → Borrower retrieves active loan → asset reads unavailable. The negative journey rejects checkout of an unavailable asset and a second active loan for the same Asset ID; failed operations leave records unchanged. Demonstrate a forbidden backend operation and cross-borrower access denial. Selected UI/end-to-end checks supplement unit and real API/database integration tests; UI-only evidence is insufficient.

The SRS currently combines some later behavior with Sprint 1 IDs: FR-11 also mentions returned loans, BR-01 mentions retired assets, BR-05 mentions later inventory/report operations, BR-08 includes return availability, and NFR-06 includes return atomicity. Sprint 1 must verify each ID's checkout/access portion; return and retirement portions are verified when those operations are introduced. The SRS should be split or clarified before final traceability so partial verification is never reported as complete coverage.

Sprint 1 ends with reviewed integration, an accepted release on `main`, a recorded tag/commit, current setup instructions, executed build/tests, and disclosed failures or incomplete work. Docker, completed CI/CD, and GCP deployment are **not** required for Deliverable 1; they are required in Lab 5.

## 3. Sprint 2 — Core expansion

**Deadline:** 29 November 2026, 23:59.  
**Goal:** Complete the core custody lifecycle through return and returned-loan readback while preserving the Sprint 1 checkout and access rules. Lab 5 deployment and Lab 6 UAT run alongside this increment.

| Work package and existing requirement IDs | Dependencies | Expected completed outcome | Required verification |
| --- | --- | --- | --- |
| FEAT-04 return and FEAT-05 returned-loan readback (FR-12; returned-loan portion of FR-11; BR-07 and return portion of BR-08/NFR-06) | FEAT-04 Sprint 1 active loan, FEAT-01 custodian scope, SDS transaction design | Custodian records one valid return; loan closes, return time persists, availability recovers, and Borrower can retrieve their returned loan | RTM TC-11, TC-12, TC-20; API/database tests for valid/repeated return, wrong role/scope, rollback, restart/readback, and selected UI return journey |
| Deployment and regression continuity (NFR-08 deployment portions, NFR-09 regression portions) | Accepted Sprint 1 release; Lab 5 pipeline; FEAT-01–FEAT-05 tests | Docker/CI/CD/GCP path remains usable; Sprint 1 and completed Sprint 2 journeys work together on an identified candidate | RTM TC-27 deployment checks and TC-28 coverage audit as applicable; actual build, test, CI, post-deployment persistence, and cross-feature results tied to version |

FEAT-04 and FEAT-05 are the existing Feature Inventory IDs; their Sprint 2 work is return and returned-loan behavior after the course-required Sprint 1 checkout/active-loan slice. FR-13 overdue and FR-14 inventory creation remain Sprint 3 in the current SRS, inventory, RTM, and SDS. Advancing them to Sprint 2 would require a reviewed baseline change, so this plan does not silently reassign them. All planned Sprint 2 work needs contracts, acceptance criteria, test specifications, review, integration, and executed verification before 29 November. The candidate on `main` must include Sprint 1, completed Sprint 2, and genuine Sprint 3 progress.

## 4. Sprint 3 — Completion and hardening

**Final deadline:** 13 December 2026, 23:59.  
**Goal:** Complete remaining baseline behavior and release the integrated, independently checked product.

| Work package and existing requirement IDs | Dependencies | Expected completed outcome | Required verification |
| --- | --- | --- | --- |
| FEAT-05 overdue status (FR-13; BR-12) | FEAT-04 persisted loan/due date and return state | Active loans past their due date are identified as overdue; returned loans are not currently overdue | RTM TC-13; controlled-time boundary checks before/at/after due time and UI/API readback |
| FEAT-07 asset creation, editing, and retirement (FR-14, FR-15; BR-13; BR-05 scope) | FEAT-01 custodian authority, FEAT-02 catalog, FEAT-04 active-loan state | Authorized Custodian creates a unique asset, updates details, and retires an eligible asset; active-loan retirement and retired-asset checkout are rejected | RTM TC-14, TC-15; API/database tests for uniqueness, permissions, valid/invalid transitions, persistence, and selected UI path |
| FEAT-02 search and filtering (FR-16) | FEAT-02 catalog metadata and canonical availability | Asset ID/name search and category/availability filters return matching assets | RTM TC-16; separate/combined query, empty-result, and UI/API checks |
| FEAT-06 inventory summaries (FR-17; BR-05 scope) | FEAT-02 state, FEAT-04 loans/returns, FEAT-07 retirement, custodian scope | Custodian sees total, available, checked-out, and retired counts for only authorized inventory | RTM TC-17; count reconciliation before/after checkout, return, and retirement; cross-custodian check |
| Integrated release and quality (NFR-09 and all earlier requirements) | Completed features, Lab 5 delivery path, Lab 6 UAT findings | Full normal and negative journeys work on one released version; accepted defects are retested; deployment and documentation match the release | Final build/regression/API/database and selected UI/system checks, independent UAT/re-tests, defect status, Docker/GCP smoke and persistence checks |

**Required progress by 29 November:** Define contracts, AC, and tests for the remaining FEAT-02, FEAT-05, FEAT-06, and FEAT-07 work; implement and test at least one meaningful Sprint 3 workflow or rule. FEAT-07 asset creation (FR-14, TC-14) is the proposed early candidate because it is a scoped, persisted inventory transaction; confirm this sequencing in the reviewed feature contracts. A placeholder screen or unexecuted test does not count. List exact unfinished AC, defects, owners, dependencies, and target dates for 13 December. Plan substantial completion by 29 November rather than reserving major workflows for the 1–11 December examination period.

## 5. Feature allocation matrix

The Feature IDs below come from `docs/feature-inventory.md`. They identify delivery slices of existing features; FEAT-03, FEAT-04, and FEAT-05 require reviewed Sprint 1 reallocation in the draft SRS, inventory, RTM, and SDS before this plan can be treated as an agreed baseline.

| Sprint | Goal | Feature IDs | Dependencies | Expected Outcome | Verification | Requirement anchors |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Working borrowing and checkout slice | FEAT-01, FEAT-02 catalog, FEAT-03 request/queue, FEAT-04 checkout, FEAT-05 active-loan view | Identity → asset/availability → request → checkout/loan | Persistent active loan; availability and access rules enforced | RTM TC-01–TC-11, TC-18–TC-26 as applicable; unit, API/PostgreSQL, selected UI/E2E, restart and rejection checks | FR-01–FR-11; BR-01–BR-06, BR-08–BR-11; NFR-01–NFR-07 |
| 2 | Return and returned-loan history; deployed candidate | FEAT-04 return, FEAT-05 returned-loan view | Active loan → return/history; Lab 5 delivery path → candidate | Completed return transition and reviewed integrated candidate | RTM TC-11, TC-12, TC-20, TC-27, TC-28 as applicable; boundary, ownership, rollback, persistence and regression checks | FR-12 and FR-11 returned-loan portion; BR-07 and BR-08/NFR-06 return portions; NFR-08 Lab 5 and NFR-09 regression portions |
| 3 | Overdue, inventory administration, search, summaries, and final release | FEAT-05 overdue, FEAT-07, FEAT-02 search, FEAT-06 | Active/returned loans → overdue; catalog/loan state → retirement, search and scoped summaries | Complete baseline on deployed final version | RTM TC-13–TC-17, TC-27, TC-28; cross-feature regression, independent UAT/re-tests, final build/deployment and durable-data checks | FR-13–FR-17; BR-12, BR-13; NFR-08/NFR-09 final verification |

Lab 5 is a separate 15 November checkpoint: Docker, PR build/test gate, repeatable deployment pipeline, and GCP persistence must be established after the Sprint 1 release. Its deployed smoke path uses the available Sprint 1 request-to-checkout journey; RTM TC-27's full return smoke must run only after FEAT-04 return exists. The current SRS and RTM place NFR-08 first verification in Sprint 3; that conflicts with the Lab 5 checkpoint and requires reviewed reconciliation. TC IDs above name planned RTM cases, not executed or passing tests.

## 6. Dependencies and sequencing

1. FEAT-01 seeded identities, password handling, and backend role/ownership checks precede protected FEAT-03–FEAT-07 operations.
2. FEAT-02 Asset IDs, catalog data, and canonical availability, plus the SDS's proposed CustodianAsset scope, precede FEAT-03 requests and FEAT-04 checkout.
3. A persisted FEAT-03 pending request precedes FEAT-04 checkout; checkout atomically creates the active loan, fulfills the request, and changes availability. FEAT-05 reads the resulting loan.
4. FEAT-04 active loans precede return, FEAT-05 overdue/returned-loan views, and FEAT-06 summaries. FEAT-07 retirement also depends on active-loan checks. FR-17 current inventory counts need current asset/loan state, not historical loan rows; history would be needed for a separate history-based report outside the baseline.
5. Integrated Sprint 1 behavior and a versioned release precede Lab 5 Docker/CI/CD/GCP work, Lab 6 independent UAT, and Sprint 2 regression.
6. Completed feature contracts and tests precede implementation; an integrated candidate precedes final regression, deployment checks, and release readiness review.

The Feature Inventory, RTM, and System-Level SDS now provide planned ownership and dependencies, but remain unreviewed drafts. The SDS proposes an opaque server session, CustodianAsset assignments, an asset-row lock, and a partial unique active-loan index; implementation contracts must confirm these choices and test them against PostgreSQL. The RTM maps 17 FR, 13 BR, and 9 NFR to planned TC-01–TC-28; it does not show executed results. Baseline sprint discrepancies listed above prevent a verified claim of consistent allocation until the documents are reconciled.

## 7. Engineering workflow

For each bounded feature: (1) version its feature SDS, acceptance criteria and software test specification; (2) link a GitHub Issue; (3) branch from the current sprint staging branch; (4) write meaningful failing rule tests where TDD applies, then implement and rerun tests; (5) obtain a substantive teammate review on a PR into sprint staging; (6) run sprint integration, system and acceptance checks; (7) use a reviewed release PR into `main`; and (8) record the release tag/commit and deploy through the pipeline when applicable. Both students rotate through design, code, tests, AI-output review, and PR review; neither approves their own PR. Record actual results and failed/skipped checks rather than claiming planned checks have passed.

This section describes the required future workflow; preparing this plan does not perform GitHub or release actions.

## 8. Risks and mitigation

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Short time remains before Deliverable 1; two students also need contracts and evidence | Sprint 1 checkout or verification may be incomplete | Keep the first slice to seeded assets/accounts and one checkout path; work in bounded reviewed features; prioritize database transaction, access checks, and a demonstrable end-to-end journey before optional UI polish. |
| Database/schema/API integration starts late or diverges | UI may appear complete without persistence | Agree on Asset, Request, Loan, User, and custodian-scope contracts early; migrate/seed locally; run API/PostgreSQL integration and restart/readback tests before UI completion claims. |
| Concurrent checkout of one Asset ID | Duplicate active loans or stale availability | Enforce a database invariant and transactional checkout; test competing attempts and verify exactly one active loan and a clean losing request. |
| Authentication or ownership defects | Borrowers or unrelated custodians access protected records | Put authorization in API handlers/services, seed multiple borrowers and scoped custodians, and test direct record-ID and role violations. |
| Test/evidence workload across three deliverables | Untested rules or unsupported completion claims | Link AC to planned tests before coding; automate critical transitions and access checks; save actual run counts, versions, and selected UI evidence at each checkpoint. |
| GCP access or deployment details arrive in Lab 5 | Deployed candidate may be delayed | Keep Docker-ready configuration and environment examples, avoid local-only storage, and reserve Lab 5 time for cloud provisioning, pipeline and persistence checks. |
| Final exams, 1–11 December | Too little time for major late features | Complete Sprint 2 and meaningful Sprint 3 progress by 29 November; leave bounded fixes, UAT re-tests, regression and submission preparation for the final period. |
| Draft baseline documents conflict with the official Sprint 1 and Lab 5 checkpoints | Feature IDs exist, but sprint traceability and completion claims can be inconsistent | Review and version the SRS, FEAT-03–FEAT-05 inventory entries, RTM TC-08–TC-11/TC-19/TC-20/TC-25/TC-26, SDS sprint labels, and NFR-08 timing together before claiming Part D completion. |

## 9. Milestones and Definition of Done

| Date (2026) | Milestone | Evidence-based outcome |
| --- | --- | --- |
| 8 November | Deliverable 1 / Sprint 1 | Accepted local release on `main` with a complete UI/API/database request-to-checkout journey, persisted readback, rule and access rejection, passing meaningful build/tests, reviewed integration, versioned contracts, and reproducible setup. |
| 15 November | Lab 5 | Docker build/run, CI PR checks and enforced failure gate, repeatable release pipeline, GCP deployment, and post-restart durable-data check on an identified version. |
| 22 November | Lab 6 | Independent cross-team UAT on a recorded release; defects triaged and relevant fixes retested with versioned results. |
| 29 November | Deliverable 2 and Lab 7 | Every planned Sprint 2 feature reviewed/integrated/tested; at least one meaningful Sprint 3 workflow/rule implemented and tested; GCP candidate, regression and explicit remaining-work list; Lab 7 change/regression evidence. |
| 13 December | Final Delivery | Complete baseline integrated and deployed on `main`, final build/regression and independent acceptance results, resolved critical defects or disclosed blockers, current documents/setup, and final demonstration evidence. |

**Product Definition of Done for a sprint feature:** Its linked requirements and approved AC are implemented; planned positive, negative, boundary, persistence and access tests appropriate to that feature have run with recorded results; selected UI/API/database behavior has been demonstrated; code and contract changes have received teammate review and staging integration; setup, traceability and known limitations are current; and the accepted release version is recorded. Failed, skipped, or incomplete checks remain visible and do not count as passed. A sprint is complete only when all its planned mandatory features meet this definition and its integrated journey passes on the identified release.
