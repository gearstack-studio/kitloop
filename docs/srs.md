# KitLoop Software Requirements Specification

**Course deliverable:** CPE 334 Project Deliverable 1 — Part A  
**Status:** Draft for team and instructor review  
**Product:** Technology Equipment Inventory & Borrowing Management System  
**Implementation context:** React, TypeScript, Vite, Express, PostgreSQL, Prisma

This SRS records the product requirements agreed in the project brief. The original course handout was not available in the workspace or as an identifiable public source when this draft was prepared. The team should compare this document with the original Part A rubric before submission. Decisions listed here are project working decisions, not claims of instructor approval.

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

The three-sprint product covers authentication and current-user identity; a catalog of individually identified assets; availability; borrow requests; personal request and loan views; custodian checkout and return; due-date and overdue tracking; authorized inventory administration; search and filtering; and inventory summaries. PostgreSQL is the persistent store and Prisma is the planned data access layer. Sprint 1 uses seeded demo accounts and synthetic equipment data.

### Explicit exclusions and optional enhancements

The required workflow has **no separate multi-stage approval**: a request remains pending until an authorized custodian checks out the asset. Payments, fines, email or SMS notifications, barcode or QR scanning, external university sign-on, public registration, native mobile apps, advanced analytics, and automated reservation or waitlist allocation are outside the mandatory scope. They may be proposed later as optional enhancements only if the mandatory requirements are complete and the team agrees to a scope change.

## 5. Functional requirements

All FR items below are **mandatory**. “Verification sprint” is the first sprint in which the stated behavior must be demonstrated; later sprints must retain it.

| ID | Requirement and observable acceptance condition | Verification sprint |
| --- | --- | --- |
| FR-01 | The system shall sign in a seeded demo Borrower or Custodian with valid credentials and reject invalid credentials without creating an authenticated session. | 1 |
| FR-02 | The system shall let a signed-in user log out; a subsequent request using the ended session shall be treated as unauthenticated. | 1 |
| FR-03 | The system shall provide the signed-in user's identifier and role to the client; an unauthenticated request shall not expose a user identity. | 1 |
| FR-04 | The system shall list synthetic equipment assets with Asset ID, name, category, description, and current availability; distinct copies shall have distinct Asset IDs. | 1 |
| FR-05 | The system shall show whether each asset is available for checkout, using the same availability state that checkout validates. | 1 |
| FR-06 | A Borrower shall be able to submit a request for an existing, borrowable Asset ID; the system shall save the requester, asset, submission time, and pending status and return the created request. | 1 |
| FR-07 | A Borrower shall be able to view their own requests with asset and status information, including a newly submitted request. | 1 |
| FR-08 | A Custodian shall be able to view pending requests for assets within their authorized inventory, including the requester and Asset ID needed for checkout. | 2 |
| FR-09 | An authorized Custodian shall be able to check out an available asset against a pending request by supplying a valid due date; the system shall identify the resulting loan and mark the request fulfilled. | 2 |
| FR-10 | Successful checkout shall create and persist one active loan containing the Asset ID, borrower, request reference, checkout time, due date, and custodian identifier; a reload shall show the same loan. | 2 |
| FR-11 | A Borrower shall be able to view only their own active and returned loans, including checkout, due, and return information when present. | 2 |
| FR-12 | An authorized Custodian shall be able to return an active loan, recording the return time and making the asset available again. | 2 |
| FR-13 | The system shall display the due date of each active loan and identify an active loan as overdue when its due date has passed; returned loans shall not appear as currently overdue. | 3 |
| FR-14 | An authorized Custodian shall be able to add an asset with a unique Asset ID and required catalog details; the new asset shall appear in the catalog. | 3 |
| FR-15 | An authorized Custodian shall be able to update catalog details and retire an asset from borrowing; an asset with an active loan shall not be retired until returned. | 3 |
| FR-16 | A user shall be able to search the catalog by Asset ID or name and filter it by category and availability; displayed results shall match the supplied criteria. | 3 |
| FR-17 | An authorized Custodian shall be able to view an inventory summary for their authorized assets showing total, available, checked-out, and retired counts; the counts shall agree with the asset list. | 3 |

## 6. Business rules

These rules apply on the server for every relevant request, regardless of client behavior. A rejected operation shall leave the affected records unchanged.

| ID | Rule and verification condition | Verification sprint |
| --- | --- | --- |
| BR-01 | Checkout is prohibited when the selected asset is unavailable, retired, or outside the custodian's authorized inventory. | 2 |
| BR-02 | An exclusive asset identified by one Asset ID may have at most one active loan at a time. | 2 |
| BR-03 | The backend shall require authentication and the appropriate Borrower or Custodian role for protected operations; a role mismatch shall not execute the operation. | 1 |
| BR-04 | A Borrower may retrieve only requests and loans belonging to that Borrower, including when a different record ID is supplied directly. | 1 |
| BR-05 | A Custodian may view, check out, return, edit, or report only assets in that Custodian's authorized inventory. | 2 |
| BR-06 | Checkout is valid only for a pending request for the same Asset ID. A successful checkout shall change that request to fulfilled and create the active loan as one operation; a failed checkout shall do neither. | 2 |
| BR-07 | Return is valid only for an active loan. A successful return shall record one return time and close that loan; a repeated return shall not change it. | 2 |
| BR-08 | Successful checkout shall make the asset unavailable; successful return shall make a non-retired asset available. Availability shall agree with loan state. | 2 |
| BR-09 | Concurrent checkout attempts for the same Asset ID shall produce at most one successful active loan; the losing attempt shall receive a conflict response and leave its request pending. | 2 |
| BR-10 | Submitting a request shall not reserve an asset or create an active loan. Multiple pending requests from different borrowers may exist for the same asset; checkout resolves competition. A borrower may have at most one pending request per Asset ID; duplicate submission is rejected without writes. | 1 |
| BR-11 | Checkout shall require a due date later than the checkout time. The chosen loan-period policy remains open in OQ-01. | 2 |
| BR-12 | An active loan is overdue only when the current time is later than its due date. A returned loan is not currently overdue. | 3 |
| BR-13 | A retired asset shall be excluded from borrowable availability and shall not be checked out. | 3 |

## 7. Non-functional requirements

Each NFR has a measurable acceptance target and verification method. These targets concern correctness and delivery; no unsupported response-time or load targets are assumed.

| ID | Requirement and measurable target | Verification method | Verification sprint |
| --- | --- | --- | --- |
| NFR-01 | Every protected API operation, as introduced, shall reject an unauthenticated caller with an unauthorized response and an authenticated wrong-role caller with a forbidden response; cross-borrower record access shall be denied. | Automated API tests for each protected operation and direct record-ID access, extended as later operations are added. | 1 |
| NFR-02 | Demo credentials shall not be stored as plaintext passwords in the database; authentication secrets and database credentials shall be supplied through local environment configuration and excluded from version control. | Inspect seed/configuration and ignore rules; test valid and invalid sign-in. | 1 |
| NFR-03 | Invalid or missing required input shall produce a client error with a usable field or rule message and shall not create or alter a record. | API tests with malformed, missing, and rule-violating fields; inspect database state afterward. | 1 |
| NFR-04 | Unexpected server errors shall return a consistent error response without stack traces, SQL text, credentials, or internal file paths. | Force an internal failure in an integration test and inspect the response. | 1 |
| NFR-05 | Requests, assets, and loans shall remain accurate after an application restart; database constraints shall prevent duplicate Asset IDs and more than one active loan per asset. | PostgreSQL integration tests plus a restart/readback check and constraint checks. | 2 |
| NFR-06 | Checkout and return shall commit their related state changes atomically; two simultaneous checkout attempts for one asset shall result in exactly one active loan. | Transaction and concurrent-request integration tests against PostgreSQL. | 2 |
| NFR-07 | A teammate shall be able to reproduce the local application and test database from a clean checkout using documented prerequisites, environment example files, install, migration/seed, build, and test commands. | Follow the documented steps on a clean workspace and record the command results. | 2 |
| NFR-08 | The client and server shall build for deployment using documented commands; required environment variables and migrations shall be documented; a deployed instance shall answer the health endpoint and complete a sign-in, catalog, request, checkout, and return smoke path using synthetic data. | Build logs, deployment checklist, and deployed smoke-test record. | 3 |
| NFR-09 | The automated suite shall cover each mandatory business-rule state transition and authorization boundary, and the documented build and test commands shall pass before the Sprint 3 handoff. | Map tests to BR IDs and run the full build and test suite. | 3 |

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
| OQ-01 | What loan duration or maximum due-date policy applies? **Department owner / instructor** | Custodian enters a future due date at checkout (BR-11). Agree on allowed range or default before Sprint 2 acceptance. |
| OQ-02 | How is a custodian's authorized inventory determined? **Department owner / project team** | Seed explicit custodian-to-asset authority for demos. Choose the maintained assignment model before Sprint 2 authorization tests. |
| OQ-03 | May a borrower cancel a pending request, and may a custodian close an unfulfilled request? **Department owner / instructor** | Neither action is mandatory in this SRS. Resolve before adding cancellation or expiration states. |
| OQ-04 | Should catalog visibility include unavailable and retired assets for borrowers? **Department owner / project team** | Show available and checked-out assets with availability; exclude retired assets from borrowable results. Confirm display policy before Sprint 3 search acceptance. |
| OQ-05 | What deployment environment and submission evidence does Part A or the final course rubric require? **Instructor / project team** | Maintain local build and test evidence; confirm hosting and artifact format before Sprint 3 deployment verification. |

## 10. Requirements summary and sprint allocation

The mandatory baseline contains **17 FR**, **13 BR**, and **9 NFR** items. The table assigns first verification; later sprints must preserve earlier behavior. Optional enhancements in Section 4 have no sprint commitment.

| Sprint | Primary outcome | First-verified requirements |
| --- | --- | --- |
| 1 | Seeded identity, catalog, request submission, and personal requests | FR-01–FR-07; BR-03, BR-04, BR-10; NFR-01–NFR-04 |
| 2 | Authorized custody workflow, persistent loans, returns, and conflict protection | FR-08–FR-12; BR-01, BR-02, BR-05–BR-09, BR-11; NFR-05–NFR-07 |
| 3 | Due/overdue visibility, inventory administration, search, summaries, and deployment evidence | FR-13–FR-17; BR-12, BR-13; NFR-08, NFR-09 |

Sprint 1 may use seeded data, but its authentication, request ownership, and catalog contracts must be testable. Sprint 2 introduces database-backed custody transitions and resolves OQ-01 and OQ-02 before acceptance. Sprint 3 completes the required product and verifies the full regression path. This allocation keeps optional enhancements outside the two-person team's mandatory delivery plan.
