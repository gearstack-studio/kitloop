# KitLoop Feature Inventory

Status: Draft; teammate review pending.  
Baseline: [SRS](srs.md), repository revision `c9c8895`, 2026-11-02.  
Verification plan: [Requirements Traceability Matrix](traceability-matrix.md).

## Scope and priorities

This inventory decomposes the mandatory three-sprint product in SRS sections 4–6 and 10. Sprint numbers mean first verification; subsequent sprints retain earlier behavior. All features are mandatory. P1 means the Sprint 1 foundation; P2 means the Sprint 2 custody workflow; P3 means Sprint 3 completion. These priorities express delivery order, not optionality.

An asset is one physical copy with a unique Asset ID. A request does not transfer custody or reserve an asset. Only custodian checkout creates an active loan. There are two roles, Borrower and Custodian; inventory authority is separate from role membership. There is no separate approval stage.

## Feature inventory

BR references describe applicable constraints, including constraints introduced when dependent operations arrive. They do not move a BR's first-verification sprint earlier than the SRS.

| Feature ID | Feature and short description | Stakeholder need | Priority | Sprint 1 scope and later delivery | Related FR | Related BR |
| --- | --- | --- | --- | --- | --- | --- |
| FEAT-01 | User Authentication and RBAC: seeded sign-in, logout, current-user identity, and backend access enforcement. | Borrowers need private records; custodians need authorized access. | P1 | Included: identity and access boundaries for Sprint 1 operations. Extend enforcement to each later operation. | FR-01, FR-02, FR-03 | BR-03, BR-04, BR-05 |
| FEAT-02 | Equipment Catalog and Availability: list individually identified copies and consistent availability; later add search and filtering. | Borrowers need to identify an appropriate, borrowable copy. | P1; P3 search | Included: FR-04, FR-05 using synthetic assets. FR-16 deferred to Sprint 3; custody-driven availability verified in Sprint 2. | FR-04, FR-05, FR-16 | BR-08, BR-13 |
| FEAT-03 | Borrowing Request Management: submit pending requests, view personal requests, and provide a scoped custodian queue. | Borrowers need to express intent and track requests; custodians need handoff information. | P1; P2 queue | Included: FR-06, FR-07. FR-08 deferred to Sprint 2. Requests do not reserve equipment. | FR-06, FR-07, FR-08 | BR-03, BR-04, BR-05, BR-06, BR-10, BR-13 |
| FEAT-04 | Equipment Checkout and Return: authorized physical handoff and return with atomic request, loan, and availability transitions. | Custodians and the inventory owner need accurate custody and conflict protection. | P2 | Deferred to Sprint 2 in full. | FR-09, FR-10, FR-12 | BR-01, BR-02, BR-03, BR-05, BR-06, BR-07, BR-08, BR-09, BR-11, BR-13 |
| FEAT-05 | Active Loan and Overdue Tracking: personal active/returned loan history and due information; later identify overdue active loans. | Borrowers and custodians need to know who holds assets and when they are due. | P2; P3 overdue | Deferred: FR-11 to Sprint 2; FR-13 to Sprint 3. | FR-11, FR-13 | BR-03, BR-04, BR-12 |
| FEAT-06 | Inventory Reporting: scoped total, available, checked-out, and retired counts reconciled with the asset list. | Custodians and the inventory owner need a reliable inventory summary. | P3 | Deferred to Sprint 3 in full. | FR-17 | BR-03, BR-05, BR-08, BR-13 |
| FEAT-07 | Inventory Administration: add uniquely identified assets, edit catalog details, and retire eligible assets. | Custodians need to maintain inventory without losing custody accuracy. | P3 | Deferred to Sprint 3 in full. | FR-14, FR-15 | BR-02, BR-03, BR-05, BR-13 |

## Boundaries and dependencies

FEAT-01 owns identity and shared authorization enforcement; domain features own their operation-specific access checks. FEAT-02 reads availability; FEAT-04 changes it through checkout/return; FEAT-07 controls retirement. FEAT-03 owns request submission and views, while FEAT-04 alone fulfills requests. FEAT-05 reads loans; it does not create or close them. FEAT-06 aggregates authorized assets and does not introduce advanced analytics. Each FR has one owning feature in the RTM, preventing duplicate feature ownership.

Sprint 1 acceptance covers FR-01–FR-07, BR-03, BR-04, BR-10, and NFR-01–NFR-04. BR-04 loan access is verified when FR-11 arrives in Sprint 2; Sprint 1 verifies request ownership. Later operations extend the same security and validation baseline. The RTM also tracks later FR, BR, and NFR coverage so deferred work remains visible.

Payments, fines, notifications, scanning, university SSO, public registration, native mobile apps, advanced analytics, and automatic reservation/waitlists have no mandatory feature IDs or sprint commitments. Cancellation, request expiration, and separate approval states are not implied by FEAT-03.

## Decisions and review

Use the SRS provisional decisions: seeded accounts and synthetic assets; explicit seeded custodian-to-asset authority; a future due date entered at checkout. OQ-01 (loan period) and OQ-02 (authority model) need resolution before Sprint 2 acceptance. OQ-03 (cancellation), OQ-04 (retired catalog visibility), and OQ-05 (deployment evidence) remain with the owners and deadlines in SRS section 9. No instructor or stakeholder approval is asserted here.

| Review gate | Status | Required evidence |
| --- | --- | --- |
| Documentation preparation and coverage check | Prepared; see RTM coverage summary | Baseline and mapping checks in PR |
| Team member 1 review | Pending | Reviewer name, date, and PR review link |
| Team member 2 review | Pending | Reviewer name, date, and PR review link |
| Reviewed PR | Pending | PR URL, resolved review comments, and merge record |

Both team members must check scope, priorities, unique ownership, SRS IDs, and planned test coverage. Record their actual reviews in the PR and update this table with evidence. Preparing these documents does not complete the human review or reviewed-PR gates. When the SRS changes, update this inventory, RTM, test plans, and sprint allocation together.
