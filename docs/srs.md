# KitLoop Software Requirements Specification

**Course deliverable:** CPE 334 Project Deliverable 1 — Part A  
**Status:** Draft for team and instructor review  
**Product:** Technology Equipment Inventory & Borrowing Management System  
**Implementation context:** React, TypeScript, Vite, Express, PostgreSQL, Prisma

**Source basis:** `group_work_specs_v1.pdf` (especially Sections 5-8 and Theme 2), `project_deliverable_1_v1.pdf` (Part A and the Sprint 1 outcome), `project_deliverable_2_v1.pdf`, and `project_final_delivery_v1.pdf`. The four supplied PDFs were reviewed at `D:\group_project_spec_files\`; they were not present in this repository's `references/` directory. The group specification labels itself a draft for instructor review. Its Theme 2 brief and the deliverable rubrics are treated as the supplied course baseline, while KitLoop-specific choices are labeled as working product decisions below.

This is a **proposed product baseline**, not a claim of instructor approval or completed implementation. The course documents also require separate feature inventory, System-Level SDS, sprint contracts, tests, reviewed integration, and release evidence. This SRS defines product requirements and sprint verification targets; it does not stand in for those other artifacts.

## 1. Introduction and stakeholder problem

A university department needs a reliable way to identify equipment copies, show whether they can be borrowed, record requests, and account for physical checkout and return. A catalog entry alone cannot establish who holds a particular copy or when it is due. KitLoop provides one web interface for borrowers and custodians and stores the resulting request, asset, and loan records in a database.

An **asset** is one physical equipment copy identified by a unique Asset ID. A **request** is a borrower's intent to borrow a specific asset; it does not transfer custody. A **loan** is created only when a custodian performs checkout. An **active loan** has been checked out and not yet returned. These terms are used consistently below.

## 2. Product objectives

1. Make the department's synthetic demo inventory and each asset's current availability visible to borrowers.
2. Let borrowers request an asset and track their own requests and loans without seeing another borrower's private records.
3. Require an authorized custodian to record physical checkout and return before custody or availability changes.
4. Preserve an accurate, auditable relationship among Asset IDs, requests, borrowers, due dates, and loans, including conflicting checkout attempts.
5. Deliver a reproducible three-sprint implementation that a two-student team can build and verify.

## 3. Stakeholders and actor responsibilities

| Stakeholder or actor | Responsibility or interest |
| --- | --- |
| Borrower | Signs in, browses and searches equipment, submits requests, and views only their own requests and loans. |
| Custodian | Signs in, sees requests for inventory they are authorized to manage, maintains that inventory, and records checkout and return. |
| Department inventory owner | Defines which custodians may manage which assets and decides local borrowing policy; this authority may be represented by project seed data until clarified. |
| Project team and instructor | Review scope and acceptance evidence against CPE 334 deliverables; unresolved policy questions require their decision where applicable. |

The application has two user roles: **Borrower** and **Custodian**. Authorization is enforced by the backend, independently of what the interface displays.

## 4. Product scope and exclusions

### Mandatory product scope

The course-required three-sprint product covers authentication and backend authorization; a persistent UI-to-API-to-database workflow; equipment availability; borrowing, custodian checkout and return; overdue status; and inventory reporting. Sprint 1 must include a seeded catalog, a borrower request, custodian checkout that creates a persistent active loan and changes availability, and tested rejection of unavailable checkout and duplicate active loans. Borrowers must see their own requests and loans; custodians control authorized inventory and loans. The selected implementation stack is React, TypeScript, Vite, Express, PostgreSQL, and Prisma. Seeded demo accounts and synthetic equipment data are permitted.

**KitLoop product decisions:** Track individual physical copies by unique Asset ID; use Borrower and Custodian roles; treat a request as non-reserving; require custodian checkout before a loan becomes active; and omit a separate approval stage. These decisions specialize the Theme 2 brief and remain subject to instructor/TA review where the course asks teams to resolve ambiguity.

### Explicit exclusions and optional enhancements

The required workflow has **no separate multi-stage approval**: a request remains pending until an authorized custodian checks out the asset. Payments, fines, email or SMS notifications, barcode or QR scanning, external university sign-on, public registration, native mobile apps, advanced analytics, and automated reservation or waitlist allocation are outside the mandatory scope. They may be proposed later as optional enhancements only if the mandatory requirements are complete and the team agrees to a scope change.

## 5. Functional requirements

All FR items below are **mandatory within the proposed KitLoop baseline**. Some details specialize the course brief; Section 8 identifies those choices. “Verification sprint” is the first sprint in which the stated behavior must be demonstrated; later sprints must retain it. The Sprint 1 checkout journey must run through the UI, API, and persistent database.

| ID | Requirement and observable acceptance condition | Verification sprint |
| --- | --- | --- |
| FR-01 | The system shall sign in a seeded demo Borrower or Custodian with valid credentials and reject invalid credentials without creating an authenticated session. | 1 |
| FR-02 | The system shall let a signed-in user log out; a subsequent request using the ended session shall be treated as unauthenticated. | 1 |
| FR-03 | The system shall provide the signed-in user's identifier and role to the client; an unauthenticated request shall not expose a user identity. | 1 |
| FR-04 | The system shall list synthetic equipment assets with Asset ID, name, category, description, and current availability; distinct copies shall have distinct Asset IDs. | 1 |
| FR-05 | The system shall show whether each asset is available for checkout, using the same availability state that checkout validates. | 1 |
| FR-06 | A Borrower shall be able to submit a request for an existing, borrowable Asset ID; the system shall save the requester, asset, submission time, and pending status and return the created request. | 1 |
| FR-07 | A Borrower shall be able to view their own requests with asset and status information, including a newly submitted request. | 1 |
| FR-08 | A Custodian shall be able to view pending requests for assets within their authorized inventory, including the requester and Asset ID needed for checkout. | 1 |
| FR-09 | An authorized Custodian shall be able to check out an available asset against a pending request by supplying a future due date; the system shall identify the resulting loan and mark the request fulfilled. | 1 |
| FR-10 | Successful checkout shall create and persist one active loan containing the Asset ID, borrower, request reference, checkout time, due date, and custodian identifier; retrieving it after application restart shall return the same loan. | 1 |
| FR-11 | A Borrower shall be able to view only their own active loans, including the asset, checkout time, and due date, immediately after checkout. | 1 |
| FR-12 | An authorized Custodian shall be able to return an active loan, recording the return time and making the asset available again. | 2 |
| FR-13 | The system shall identify an active loan as overdue when its due date has passed; returned loans shall not appear as currently overdue. | 2 |
| FR-14 | An authorized Custodian shall be able to add an asset with a unique Asset ID and required catalog details; the new asset shall appear in the catalog. | 2 |
| FR-15 | An authorized Custodian shall be able to update catalog details and retire an asset from borrowing; an asset with an active loan shall not be retired until returned. | 3 |
| FR-16 | A user shall be able to search the catalog by Asset ID or name and filter it by category and availability; displayed results shall match the supplied criteria. | 3 |
| FR-17 | An authorized Custodian shall be able to view an inventory summary for their authorized assets showing total, available, checked-out, and retired counts; the counts shall agree with the asset list. | 3 |
| FR-18 | A Borrower shall be able to view only their own returned loans, including the recorded return time. | 2 |

## 6. Business rules

These rules apply on the server for every relevant request, regardless of client behavior. A rejected operation shall leave the affected records unchanged.

| ID | Rule and verification condition | Verification sprint |
| --- | --- | --- |
| BR-01 | Checkout is prohibited when the selected asset is unavailable or outside the custodian's authorized inventory. | 1 |
| BR-02 | An exclusive asset identified by one Asset ID may have at most one active loan at a time. | 1 |
| BR-03 | The backend shall require authentication and the appropriate Borrower or Custodian role for protected operations; a role mismatch shall not execute the operation. | 1 |
| BR-04 | A Borrower may retrieve only requests and loans belonging to that Borrower, including when a different record ID is supplied directly. | 1 |
| BR-05 | A Custodian may view, check out, return, edit, or report only assets in that Custodian's authorized inventory. Sprint 1 shall verify request viewing and checkout; later operations inherit the same restriction. | 1 |
| BR-06 | Checkout is valid only for a pending request for the same Asset ID. A successful checkout shall change that request to fulfilled and create the active loan as one operation; a failed checkout shall do neither. | 1 |
| BR-07 | Return is valid only for an active loan. A successful return shall record one return time and close that loan; a repeated return shall not change it. | 2 |
| BR-08 | Successful checkout shall make the asset unavailable. Availability shall agree with the active-loan state. | 1 |
| BR-09 | Concurrent checkout attempts for the same Asset ID shall produce at most one successful active loan; the losing attempt shall receive a conflict response and leave its request pending. | 1 |
| BR-10 | Submitting a request shall not reserve an asset or create an active loan. Multiple pending requests may exist for the same asset; checkout resolves competition. | 1 |
| BR-11 | Checkout shall require a due date later than the checkout time. The chosen loan-period policy remains open in OQ-01. | 1 |
| BR-12 | An active loan is overdue only when the current time is later than its due date. A returned loan is not currently overdue. | 2 |
| BR-13 | A retired asset shall be excluded from borrowable availability and shall not be checked out. | 3 |
| BR-14 | Successful return shall make a non-retired asset available and close its active loan in one operation; failure shall leave both unchanged. | 2 |

## 7. Non-functional requirements

Each NFR has a measurable acceptance target and verification method. These targets concern correctness and delivery; no unsupported response-time or load targets are assumed.

| ID | Requirement and measurable target | Verification method | Verification sprint |
| --- | --- | --- | --- |
| NFR-01 | Every protected API operation, as introduced, shall reject an unauthenticated caller with an unauthorized response and an authenticated wrong-role caller with a forbidden response; cross-borrower record access shall be denied. | Automated API tests for each protected operation and direct record-ID access, extended as later operations are added. | 1 |
| NFR-02 | Demo credentials shall not be stored as plaintext passwords in the database; authentication secrets and database credentials shall be supplied through local environment configuration and excluded from version control. | Inspect seed/configuration and ignore rules; test valid and invalid sign-in. | 1 |
| NFR-03 | Invalid or missing required input shall produce a client error with a usable field or rule message and shall not create or alter a record. | API tests with malformed, missing, and rule-violating fields; inspect database state afterward. | 1 |
| NFR-04 | Unexpected server errors shall return a consistent error response without stack traces, SQL text, credentials, or internal file paths. | Force an internal failure in an integration test and inspect the response. | 1 |
| NFR-05 | Sprint 1 requests, assets, and loans shall remain accurate after application restart; database constraints shall prevent duplicate Asset IDs and more than one active loan per asset. Later entity changes shall preserve this property. | PostgreSQL integration tests, restart/readback of a checked-out loan, and constraint checks. | 1 |
| NFR-06 | Checkout shall commit request, loan, and availability changes atomically; two simultaneous checkout attempts for one asset shall result in exactly one active loan. Return shall receive the same atomicity when introduced. | Transaction and concurrent-request integration tests against PostgreSQL; extend tests for return in Sprint 2. | 1 |
| NFR-07 | A teammate shall be able to reproduce the local Sprint 1 application and database from a clean checkout using documented prerequisites, environment examples, install, migration/seed, build, and test commands. Instructions shall stay current as features are added. | Follow the documented steps on a clean workspace and record actual command results. | 1 |
| NFR-08 | The Sprint 1 release shall be packageable with Docker and deployable on GCP with durable database storage through a repeatable release pipeline by Lab 5; the deployed version shall answer the health endpoint and complete the Sprint 1 request-to-checkout journey after restart/redeployment. Later releases shall retain deployment capability. | Docker build/run, GCP deployment and restart/readback checks tied to the released version. | 2 / Lab 5 |
| NFR-09 | The automated suite shall cover each mandatory business-rule transition and authorization boundary as introduced; build and regression checks shall pass on the Sprint 2 candidate and final release, with failed or skipped tests disclosed. | Map tests to BR IDs; run build, integration, and regression suites on the identified versions. | 2; final recheck 3 |
| NFR-10 | Relevant pull requests shall run automated build and test checks, and a failed required check shall block the normal merge/release path; accepted releases shall deploy from `main` through the documented pipeline. | Inspect CI configuration and demonstrate one passing and one controlled failing check, then trace a release to its deployment. | 2 / Lab 5 |

## 8. Assumptions and design decisions

| ID | Working assumption or decision | Consequence |
| --- | --- | --- |
| AD-01 | Each physical copy has a unique Asset ID; requests and loans refer to that copy. | Availability and loan conflicts are checked per Asset ID. |
| AD-02 | The only application roles are Borrower and Custodian. | A custodian's inventory authority is scoped separately from role membership. |
| AD-03 | There is no separate approval stage. | Pending request → custodian checkout → fulfilled request and active loan. |
| AD-04 | A request does not reserve equipment; checkout is the custody-changing event. | Competing pending requests may coexist; only one can be checked out while an exclusive asset is unavailable. |
| AD-05 | Sprint 1 uses seeded demo accounts and synthetic assets. | Real university identity and production data imports are excluded. |
| AD-06 | Due date is recorded at checkout, when the custodian confirms the physical handoff. | A loan cannot become active without a future due date. |
| AD-07 | An asset is exclusive to one active borrower at a time. | One active loan per Asset ID is mandatory. |

These are working project decisions for the SRS. Any change agreed with the instructor or department owner should update the affected FR, BR, tests, and sprint plan together.

## 9. Open questions and resolutions

No item below is represented as instructor-approved. Until resolved, the provisional treatment is used for design and acceptance planning.

| ID | Open question / decision owner | Provisional treatment and resolution needed |
| --- | --- | --- |
| OQ-01 | What loan duration or maximum due-date policy applies? **Department owner / instructor** | Sprint 1 checkout accepts a future due date (BR-11) without an assumed maximum. Agree on any default or allowed range before Sprint 2 overdue-policy acceptance. |
| OQ-02 | How is a custodian's authorized inventory determined? **Department owner / project team** | Seed explicit custodian-to-asset authority for Sprint 1 and test an out-of-scope custodian. Decide the maintained assignment model before Sprint 2 inventory administration. |
| OQ-03 | May a borrower cancel a pending request, and may a custodian close an unfulfilled request? **Department owner / instructor** | Neither action is mandatory in this SRS. Resolve before adding cancellation or expiration states. |
| OQ-04 | Should catalog visibility include unavailable and retired assets for borrowers? **Department owner / project team** | Show available and checked-out assets with availability; exclude retired assets from borrowable results. Confirm display policy before Sprint 3 search acceptance. |
| OQ-05 | Which GCP services and access method will Lab 5 provide? **Instructor / project team** | Design for Docker and durable PostgreSQL now; finalize cloud components when Lab 5 guidance is supplied. GCP deployment is required at Lab 5, not at Deliverable 1. |
| OQ-06 | Which final-demo time limit and rubric split apply? **Instructor** | The final-delivery PDF says “at most 10 minutes” in Section 2 but “Maximum 4 minutes” in Section 3.5. The group specification also shows an 8-point video plus 2-point summary, while the final-delivery PDF shows a 10-point Part E. Seek clarification; these are course-delivery conflicts, not product FR changes. |

**Course-source mismatch:** Deliverable 1 names `group_work_specs.docx` as its master specification, whereas the supplied group work file is `group_work_specs_v1.pdf`. The content used here is the readable supplied PDF; the team should confirm whether a newer DOCX exists. The group work PDF itself is marked “Draft for instructor review.” No instructor approval is inferred.

## 10. Requirements summary and sprint allocation

The proposed mandatory baseline contains **18 FR**, **14 BR**, and **10 NFR** items. The table assigns first verification; later sprints must preserve earlier behavior. Optional enhancements in Section 4 have no sprint commitment.

| Sprint | Primary outcome | First-verified requirements |
| --- | --- | --- |
| 1 | Seeded identity and catalog; borrower request; custodian checkout; active loan and availability persisted in PostgreSQL; rule and access rejection | FR-01–FR-11; BR-01–BR-06, BR-08–BR-11; NFR-01–NFR-07 |
| 2 | Return, overdue status, initial inventory administration, returned-loan history; Docker/CI/CD/GCP through Lab 5 | FR-12–FR-14, FR-18; BR-07, BR-12, BR-14; NFR-08–NFR-10 |
| 3 | Catalog editing/retirement, search, inventory summaries, integration and final hardening | FR-15–FR-17; BR-13; final verification of all earlier requirements |

**Sprint 1 acceptance path:** A Borrower signs in, views a seeded available asset, submits a request, and retrieves it. An authorized Custodian signs in, views the request, checks out that asset, and the Borrower retrieves the persisted active loan; the asset is unavailable afterward and the result survives restart. Tests must reject unavailable checkout, duplicate active loans, anonymous access, borrower checkout/inventory mutation, and cross-borrower access. A selected UI journey, real API/database integration tests, and build/test results must accompany the release. This is the Theme 2 example; any thinner alternative requires instructor/TA agreement.

Sprint 2 completes returns, overdue behavior, and the first catalog administration workflow. Lab 5 establishes Docker, CI/CD, and GCP deployment after Deliverable 1; Lab 6 adds independent UAT and defect re-tests. By Deliverable 2, all planned Sprint 2 features must be complete and at least one meaningful Sprint 3 workflow or rule must be implemented and tested; FR-17 inventory summaries are the proposed early Sprint 3 candidate, subject to the feature plan. Sprint 3 completes FR-15–FR-17 and final integrated verification by Final Delivery. Feature inventory, traceability, SDS, contracts, acceptance criteria, test specifications, review history, and release evidence remain separate required course artifacts; this SRS does not claim they already exist.
