# FEAT-02 — Equipment Catalog and Availability Engineering Contract

**Version:** 0.2 (Draft; revised after inconsistency review; contract only; teammate review pending)

**Sprint:** 1 — Deliverable 1, 8 November 2026 (search and filtering, FR-16, is Sprint 3)

**Assigned developer:** `yiiipunn`

**Assigned reviewer:** `DEV4952` (review pending)

**Implementation and verification status:** Contract only. No FEAT-02 code, schema, migration, seed or test changes are made by this document. A catalog list route already exists in `server/src/domain.ts` from the FEAT-01 work; Section 1 records how it differs from this contract. Nothing in this document is evidence that FEAT-02 passes. Version 0.2 applies the review decisions recorded in Section 14; the Sprint 1 scope is the catalog list and its availability, with no detail route.

## 1. Feature overview and scope

FEAT-02 lets a signed-in Borrower or Custodian see the department's individually identified equipment copies and whether each can currently be borrowed. An **asset** is one physical copy with a unique Asset ID (SRS section 1, AD-01). Availability is **derived** from stored asset and loan facts; it is never stored or edited (SDS section 4).

| In scope | Out of scope (owner) |
| --- | --- |
| Catalog list: Asset ID, name, category, description, availability (FR-04, FR-05) | Borrow request creation and views (FEAT-03) |
| Every catalog item carries all FR-04 fields (Asset ID, name, category, description, availability), so the list itself is the equipment detail view | Checkout, return, loan state changes (FEAT-04) |
| One shared availability definition that FEAT-03 and FEAT-04 reuse | Loan lists, due dates, overdue (FEAT-05) |
| Catalog loading, empty, error and unavailable UI states | Search and filters, FR-16 (Sprint 3 extension of this feature) |
| Tests for retrieval, response shape, availability, authentication and ordering | Asset create, edit, retire (FEAT-07); inventory summary (FEAT-06); registration; a separate single-asset API route (not in the baseline, Section 5.2) |

**Terminology and file names.** The project documents use `FEAT-02`, `docs/feature-inventory.md`, `docs/traceability-matrix.md` and `docs/sds-system-level.md`. The paths `docs/features.md`, `docs/traceability.md` and `docs/system-sds.md` named in the assignment do not exist; `docs/sprints/plan.md` records the same mapping. This contract uses the existing names.

**Existing baseline (inspected, not changed here).** The merged FEAT-01 work (`373e173`, `2221fc3`, merge `de9a99a`) contains `GET /api/assets` in `server/src/domain.ts` and a catalog panel in `client/src/App.tsx`. The table lists where that baseline differs from this contract; closing these gaps is the implementation work for FEAT-02.

| # | Baseline observation | Contract expectation |
| --- | --- | --- |
| B1 | The response spreads the full Prisma row, so each item includes `retiredAt` (always `null` there). | Explicit five-field allowlist; no `retiredAt` or relation fields (Section 5.1). |
| B2 | Order is `name` only, so copies sharing a name have no defined order. | `name`, then `assetId` (primary key), Section 5.1. |
| B3 | Availability is computed inline in the list route; checkout (`POST /requests/:id/checkout`) has its own separate active-loan check. | One shared definition used by both (Section 7). |
| B4 | No single-asset route exists. | None is added in Sprint 1: no baseline requirement calls for one (Section 5.2). |
| B5 | No automated test exercises `GET /assets`; existing tests only cover `POST` and `PATCH /assets`. | Section 10. |
| B6 | The catalog panel heading renders empty (`<h2></h2>`); there is no loading, empty or retry state. | Section 4. |
| B7 | The seed has two assets, no checked-out example, and no two copies with the same name. | Seed additions listed in Section 6 (implementation phase). |
| B8 | `POST /requests` rejects unknown and retired assets but does not check availability. | Recorded as a FEAT-03 dependency and integration risk (Section 12). FEAT-02 does not change it. |

## 2. Requirement IDs and traceability

The exact baseline wording is quoted from `docs/srs.md`. "First verified" is the sprint the SRS assigns.

| Requirement | Exact baseline wording | Role in FEAT-02 | First verified |
| --- | --- | --- | --- |
| FR-04 | "The system shall list synthetic equipment assets with Asset ID, name, category, description, and current availability; distinct copies shall have distinct Asset IDs." | Catalog list and its fields. | Sprint 1 |
| FR-05 | "The system shall show whether each asset is available for checkout, using the same availability state that checkout validates." | Availability shown in the catalog and its agreement with checkout validation. | Sprint 1 |
| BR-08 | "Successful checkout shall make the asset unavailable; successful return shall make a non-retired asset available. Availability shall agree with loan state." | The catalog must reflect state changes made by checkout and return. FEAT-04 owns the changes. | **Sprint 2** |
| BR-10 | "Submitting a request shall not reserve an asset or create an active loan. Multiple pending requests may exist for the same asset; checkout resolves competition." | Pending requests never change catalog availability. FEAT-03 owns the rule. | Sprint 1 |
| BR-03 | "The backend shall require authentication and the appropriate Borrower or Custodian role for protected operations; a role mismatch shall not execute the operation." | Catalog read requires a FEAT-01 session. | Sprint 1 |
| BR-05 | "A Custodian may view, check out, return, edit, or report only assets in that Custodian's authorized inventory." | Not claimed by FEAT-02. See conflict C1 in Section 13. | Sprint 2 |
| BR-13 | "A retired asset shall be excluded from borrowable availability and shall not be checked out." | Not claimed in Sprint 1. The existing exclusion of retired assets is only guarded against regression (AC-FEAT-02-08). | Sprint 3 |
| NFR-01, NFR-03, NFR-04 | Protected API rejection; safe validation; consistent error response. | Authentication boundary and safe 500 on the catalog read. | Sprint 1 |
| NFR-05 | "database constraints shall prevent duplicate Asset IDs and more than one active loan per asset." | The existing primary key is the backing constraint for FR-04's distinct IDs. | Sprint 2 |
| FR-16 | Search and filter. | Out of scope; the list route stays compatible with later filters. | Sprint 3 |
| RTM cases | TC-04 (catalog fields and distinct IDs), TC-05 (availability matches the borrowable state of seeded assets in Sprint 1; "Extend with checkout/return readback in Sprint 2"). Cross-cutting: TC-18, TC-21 to TC-24. | Planned verification entries. | Sprint 1 |

**Sprint boundary between FR-05 and BR-08.** The feature inventory states for FEAT-02: "Included: FR-04, FR-05 using synthetic assets. FR-16 deferred to Sprint 3; custody-driven availability verified in Sprint 2." This contract follows that split:

| | Sprint 1 (FR-05) | Sprint 2 (BR-08) |
| --- | --- | --- |
| What is verified | The catalog reports availability derived from stored loan state, and checkout validation uses the same state. | Availability changes correctly after a successful checkout and after a successful return. |
| How | Fixture-created loans, read-only catalog calls, and a consistency check against checkout validation (AC-FEAT-02-03, AC-FEAT-02-04). | State-transition tests across the FEAT-04 operations (AC-FEAT-02-S2-01, deferred). |
| In the Sprint 1 Definition of Done | Yes | No |

No Sprint 2 behavior is moved into Sprint 1 by this contract. Return does not exist in the code today, so the return half of BR-08 cannot be tested yet.

Feature-to-AC-to-test mapping is in Section 10. The RTM's TC numbers remain planned entries in the draft matrix and are not marked passed by this contract.
## 3. Roles and permissions

| Operation | Unauthenticated | Borrower | Custodian | Enforcement owner |
| --- | --- | --- | --- | --- |
| List catalog | 401 | Allowed | Allowed | FEAT-01 authentication gate; FEAT-02 projection |
| Any catalog write | Not offered by FEAT-02 | Not offered | Not offered | `POST` and `PATCH /assets` belong to FEAT-07 and are not changed here |

**Read-only catalog access versus asset management.** FEAT-02 grants read-only catalog access to both authenticated roles and adds no management permission. This follows the documents as follows:

- SDS API table: `GET /assets` has access "Either authenticated role".
- SDS section 6: "The shared catalog is an intentional discovery projection for both authenticated roles. Custodian management views, requester details, mutations, and reports are restricted to authorized assets (BR-05)."
- SRS stakeholders: a Borrower "browses and searches equipment"; a Custodian "sees requests for inventory they are authorized to manage".

The SRS BR-05 wording ("may view, check out, return, edit, or report only assets in that Custodian's authorized inventory") can also be read as limiting a Custodian's catalog view. The documents therefore conflict, and the SDS itself asks for confirmation during OQ-02 review. This contract applies the SDS interpretation provisionally and records the conflict as C1 in Section 13. It creates no new business rule: no custodian-specific catalog filtering is specified, and BR-05 is not claimed by FEAT-02. No catalog item contains borrower, request, loan, due-date or custodian-assignment data.

Role and identity come from the FEAT-01 session; the client cannot select a role or user, and hiding a button is not authorization. FEAT-01 authentication behavior is unchanged.
## 4. UI design and interaction flow

The catalog is the equipment panel of the signed-in workspace (`client/src/App.tsx`). It is shown to both roles.

**Interaction flow**
1. After sign-in or a protected page reload, the client requests the catalog together with the role's request and loan views.
2. While the request is pending, the panel shows a loading state.
3. On success the panel lists one card per asset, in server order.
4. A Borrower sees a request control on each card (behavior owned by FEAT-03). It is disabled when the asset is not available, with an accessible explanation. Custodians see no request control.
5. After any FEAT-03 or FEAT-04 operation succeeds or returns a 409 conflict, the client refetches the catalog so the displayed state reflects the server. The client does not edit availability locally.
6. A 401 follows the FEAT-01 session-ended behavior and clears the catalog from client state.

**States**

| State | Required behavior |
| --- | --- |
| Heading | The panel has a non-empty visible heading with the text "Equipment catalog" (the baseline heading is empty, B6). It is a real heading element (for example `h2`, below the page's `h1`) with an `id`, and the section is labelled by it (`aria-labelledby`), so assistive technology lists it as a named region and in the heading outline. The text is not supplied only by CSS or an image. |
| Count | A separate text element next to the heading shows "1 asset" or "N assets". It is not part of the heading text. |
| Loading | A status message ("Loading equipment…") with `aria-busy`; no stale data from a previous session is shown. |
| Loaded | Per card: name, category, description, Asset ID in a monospace style, availability badge. |
| Empty | HTTP 200 with `[]` shows "No equipment is listed yet." No error styling. |
| Error | A non-sensitive message ("Equipment could not be loaded.") with a Retry button; the session stays valid unless the status was 401. The message never includes server internals. |
| Available | Badge text "Available". |
| Unavailable | Badge text "Checked out". No borrower, due date or reason is shown (FEAT-05 owns loan views). |
| Accessibility | The heading is reachable in heading navigation. Availability is conveyed by text, not color alone. Cards, Retry and the request control are keyboard reachable with visible focus. The layout wraps without horizontal overflow on narrow screens. Motion respects `prefers-reduced-motion`. |

## 5. API contracts

All paths are under `/api`, return JSON, use the SDS error shape `{ "error": { "code", "message", "fields"? } }`, and require the FEAT-01 `kitloop_session` cookie. `GET` requests need no CSRF token. The route writes no data. The SDS API table lists exactly one catalog read: `GET /assets`, "Either authenticated role", "200 catalog DTOs with canonical availability", first sprint "1 / FR-04, FR-05".

### 5.1 `GET /api/assets`

| Aspect | Contract |
| --- | --- |
| Access | Any authenticated user (Borrower or Custodian). |
| Query | None in Sprint 1. Unsupported query parameters are ignored and the full catalog is returned; FR-16 will define validated filters in Sprint 3. |
| 200 | A JSON array, possibly empty. |
| Ordering | `name` ascending, then `assetId` ascending. `assetId` is the primary key and unique, so the order is total and repeatable. The database performs the sort; the contract does not require a particular collation. |
| Item fields (the whole allowlist) | `assetId` string; `name` string; `category` string; `description` string; `available` boolean. |
| Excluded internal data | `retiredAt`; the relation data `loans`, `requests` and `custodianAssets`; any loan, request, user, custodian, due-date or credential data; any other database column added later unless a reviewed contract adds it. The response is built from this explicit list, not by spreading the database row. |
| `available` | True exactly when the asset's canonical state is `AVAILABLE` (Section 7). This keeps the field the current client already reads. No separate status field is introduced. |
| Retired assets | Not returned (Section 7, R5). |
| Headers | `Cache-Control: no-store`, since availability is volatile and the response is session-scoped. |
| 401 | `UNAUTHENTICATED` for a missing, forged, expired or revoked session. No catalog data is returned. |
| 500 | `INTERNAL_ERROR` with a generic message only (NFR-04). |

Example item: `{ "assetId": "KL-CAM-001", "name": "Mirrorless camera", "category": "Camera", "description": "Synthetic demo asset", "available": true }`. The catalog is not paginated in Sprint 1; the department dataset is small and synthetic.

### 5.2 No single-asset route in Sprint 1

A route such as `GET /api/assets/:assetId` is **not** part of this contract. No SRS requirement, no SDS API-table row and no RTM case calls for one: FR-04 requires the fields to appear in the list, and the list already carries all of them. Adding a route would need a baseline change first and is deferred; it is not required to meet FR-04 or FR-05. The existing `PATCH /assets/:assetId` is FEAT-07 scope and is not changed.
## 6. Data models and Prisma integration

**No new model, field, migration or index is introduced.** The existing schema (`server/prisma/schema.prisma`) already supports FR-04 and FR-05, and the FEAT-01 data model is preserved as is.

| Existing element | Use in FEAT-02 |
| --- | --- |
| `Asset.assetId` (`String`, primary key) | Unique Asset ID; the primary key is the database guarantee behind FR-04's distinct-ID rule and NFR-05. |
| `Asset.name`, `category`, `description` | Catalog fields, all required (non-null). |
| `Asset.retiredAt` (`DateTime?`) | Excludes retired assets. Internal; never serialized. |
| `Loan.assetId`, `Loan.returnedAt` | An active loan is a `Loan` with `returnedAt IS NULL`. |
| Index `Loan_one_active_per_asset` (partial unique on `Loan(assetId)` where `returnedAt IS NULL`) | Guarantees at most one active loan per asset, so availability is unambiguous. Also serves the availability lookup. |
| `Loan_assetId_idx` | Supports loan lookups by asset. |
| `BorrowRequest` | Read by nothing in FEAT-02; pending requests do not influence availability (BR-10). |
| `CustodianAsset` | Not used by the shared catalog. |

**Query shape.** One Prisma query reads non-retired assets with a count or existence of active loans, ordered by `name` then `assetId`, and maps each row to the five-field DTO with the shared availability function. It avoids one query per asset.

**Seed (implementation phase, not done in this pass).** `server/prisma/seed.ts` currently seeds `KL-CAM-001` and `KL-LAP-001`. To satisfy TC-04 and make "distinct copies" demonstrable, the implementation should add at least one more copy of an existing item with a different Asset ID. Checked-out and retired examples are created as fixtures inside tests, not seeded, so the demo catalog stays borrowable. The seed already uses `upsert`, so reruns do not duplicate assets.

## 7. Equipment availability business rules

**Canonical state** (SDS section 4), derived on every read:

1. If `Asset.retiredAt` is set, the state is `RETIRED`.
2. Else if the asset has an active loan (`Loan.returnedAt IS NULL`), the state is `CHECKED_OUT`.
3. Else the state is `AVAILABLE`.

Only `AVAILABLE` is borrowable. Rules:

| Rule | Statement |
| --- | --- |
| R1 | No stored or independently editable availability value exists. |
| R2 | A returned loan (`returnedAt` set) does not make an asset unavailable. |
| R3 | A pending request never changes availability (BR-10, AD-04). A fulfilled request matters only through its loan. |
| R4 | A valid database state cannot be both retired and actively loaned (SDS invariants). If seen, the asset is treated as `RETIRED` and omitted. |
| R5 | Sprint 1 catalog lists exclude `RETIRED` assets (OQ-04 provisional treatment: available and checked-out are shown, retired are excluded from borrowable results). |
| R6 | The catalog and FEAT-04 checkout must use one shared definition, for example a single helper that maps `(retiredAt, activeLoanCount)` to a state and a single active-loan query condition. Neither may re-implement it (baseline gap B3). |
| R7 | Availability is a read-time snapshot. An asset shown as available may be checked out by someone else immediately afterward. Checkout revalidates inside its own transaction and the partial unique index is the final guard (BR-09). The catalog never authorizes a custody change. |
| R8 | **Sprint 2 (BR-08), not a Sprint 1 acceptance item.** After a successful checkout the next catalog read shows the asset unavailable; after a successful return the next read of a non-retired asset shows it available again. FEAT-04 owns those transitions; FEAT-02 only needs to read the stored state through the shared definition. |

**Sprint 1 versus Sprint 2.** FR-05 (Sprint 1) is met by deriving availability from stored loan state and by checkout validating the same state. BR-08's transitions after checkout and return are Sprint 2 (Section 2).

**Consistency with FEAT-03.** FR-06 requires a "borrowable" asset. FEAT-03 is expected to use the shared definition (Section 12, risk I1). Because R3 holds, requests for the same available asset can still coexist, and checkout resolves the competition.

## 8. Input validation and error handling

| Case | Result |
| --- | --- |
| No session cookie, forged, malformed, expired or revoked cookie | 401 `UNAUTHENTICATED` from the FEAT-01 middleware; no data. |
| Authenticated Borrower or Custodian | Allowed. There is no 403 case on this read route. |
| Unsupported query string on the list | Ignored. |
| Unexpected failure (for example a database error) | 500 `INTERNAL_ERROR`, generic message; no stack, SQL, path or credential. |
| Response data | Built from the five-field allowlist. The read creates or alters no record. |

There is no Asset ID input on the Sprint 1 catalog route, so Asset ID format validation applies where Asset IDs are accepted (`POST` and `PATCH /assets`, FEAT-07 scope) and is not part of this feature. Asset ID uniqueness is enforced by the primary key and tested at the database level (AC-FEAT-02-07).
## 9. Acceptance criteria

Each AC lists the requirement it traces to and the tests in Section 10 that verify it. "Sprint" is the sprint in which the AC is required.

| AC ID | Observable expected outcome | Requirement trace | Tests | Sprint |
| --- | --- | --- | --- | --- |
| AC-FEAT-02-01 | **Catalog retrieval.** An authenticated Borrower and an authenticated Custodian each receive 200 and a JSON array that contains every non-retired asset in the database, with `assetId`, `name`, `category` and `description` equal to the stored values. | FR-04; BR-03 | TEST-FEAT-02-01 | 1 |
| AC-FEAT-02-02 | **Response shape.** Every item has exactly the keys `assetId`, `name`, `category`, `description`, `available`, with string values for the first four and a boolean for `available`. No item contains `retiredAt`, `loans`, `requests`, `custodianAssets`, user, borrower, custodian, due-date or credential data, and the Borrower and Custodian responses are identical. | FR-04; SDS "explicit response field allowlists"; read-only discovery projection | TEST-FEAT-02-02 | 1 |
| AC-FEAT-02-03 | **Availability representation.** An asset with no loan, or only returned loans, has `available: true`. An asset with an active loan has `available: false`. A pending request for an asset does not change its value. | FR-05; BR-10 | TEST-FEAT-02-03, TEST-FEAT-02-04 | 1 |
| AC-FEAT-02-04 | **Agreement with checkout validation.** For a fixture asset the catalog calls available, the checkout validation accepts it (as far as the request, scope and due-date inputs are valid); for a fixture asset with an active loan, which the catalog calls unavailable, checkout validation rejects it with 409 and creates no second active loan. Both use the same availability definition. | FR-05 ("using the same availability state that checkout validates") | TEST-FEAT-02-05 | 1; integration part blocked until FEAT-04 is accepted |
| AC-FEAT-02-05 | **Authentication.** A missing, forged, expired or revoked session cookie gets 401 `UNAUTHENTICATED` on `GET /api/assets`, with no catalog data in the body. A valid session of either role gets 200. | BR-03; NFR-01 | TEST-FEAT-02-06 | 1 |
| AC-FEAT-02-06 | **Ordering.** The list is ordered by `name` ascending, then `assetId` ascending, and the order is identical on repeated calls and for both roles. | FR-04 (listing); FEAT-02 contract decision, no baseline ordering requirement | TEST-FEAT-02-07 | 1 |
| AC-FEAT-02-07 | **Distinct Asset IDs.** No two items share an Asset ID. The database rejects a second asset with an existing Asset ID. The seeded catalog has at least two copies with the same name and different Asset IDs. | FR-04; NFR-05 (constraint already exists) | TEST-FEAT-02-08 | 1 |
| AC-FEAT-02-08 | **Retired assets stay out (regression guard).** An asset with `retiredAt` set (test fixture) is absent from the list. | Provisional under SRS OQ-04. BR-13 is first verified in Sprint 3 and is not claimed here. | TEST-FEAT-02-09 | 1 |
| AC-FEAT-02-09 | **Empty catalog.** When no assets exist the route returns 200 and `[]`, and the UI shows the empty state without an error. | FR-04 | TEST-FEAT-02-10, TEST-FEAT-02-14 | 1 |
| AC-FEAT-02-10 | **Safe failure.** An injected unexpected failure returns the generic 500 body with no stack, SQL, path or secret. | NFR-04 | TEST-FEAT-02-11 | 1 |
| AC-FEAT-02-11 | **Read-only.** Calling the list creates, changes or deletes no database record and needs no CSRF token. | FR-04; NFR-03 (no record altered) | TEST-FEAT-02-12 | 1 |
| AC-FEAT-02-12 | **UI states and heading.** The catalog panel has a non-empty, accessible "Equipment catalog" heading labelling its section, plus a separate count; it shows loading, loaded, empty and error (with Retry) states. "Checked out" assets show a text badge and no borrower or due-date data. It is correct for both roles, keyboard operable, and cleared on a 401. | FR-04, FR-05 (display) | TEST-FEAT-02-13, TEST-FEAT-02-14 | 1 |
| AC-FEAT-02-13 | **UI refresh.** After a successful request or checkout, or a 409 conflict, the client refetches the catalog and shows the server's current availability. | FR-05 (display of current state) | TEST-FEAT-02-14 | 1 |
| AC-FEAT-02-S2-01 | **State transitions (deferred).** After a successful checkout the asset reads unavailable in the catalog; after a successful return a non-retired asset reads available again. | BR-08 ("Successful checkout shall make the asset unavailable; successful return shall make a non-retired asset available.") | TEST-FEAT-02-15 | **2, not in the Sprint 1 DoD** |
## 10. Software Test Specification

Integration tests use real PostgreSQL through the existing pattern in `server/tests/auth.test.ts` (dedicated test database, `supertest`, suffix-named fixtures cleaned in `afterAll`, `fileParallelism: false`). New tests go in `server/tests/catalog.test.ts`. Assertions filter by the test's own suffixed Asset IDs so leftover rows cannot affect results. Fixture Asset IDs and names are chosen so their relative order is the same under any common database collation (same-case ASCII letters and digits), and tests do not assert collation-specific behavior.

| TEST ID | Linked AC | Level | Preconditions and input | Action | Expected result |
| --- | --- | --- | --- | --- | --- |
| TEST-FEAT-02-01 | AC-01 | API + database (catalog retrieval) | Fixtures: three non-retired assets and one retired; Borrower and Custodian sessions | `GET /api/assets` as each role | 200; every non-retired fixture is present with stored `assetId`, `name`, `category`, `description`; the retired fixture is absent. |
| TEST-FEAT-02-02 | AC-02 | API + database (response shape) | Same fixtures | `GET /api/assets` as each role | Each item's key set equals exactly `assetId`, `name`, `category`, `description`, `available`; value types are string and boolean; no forbidden key appears at any depth; the two role responses are deeply equal. |
| TEST-FEAT-02-03 | AC-03 | API + database (availability representation) | Fixtures: asset with no loan; asset with only a returned loan; asset with an active loan; asset with only a pending request | `GET /api/assets` | `available` is true, true, false, true respectively. |
| TEST-FEAT-02-04 | AC-03 | Unit | Pure state function with combinations of `retiredAt` and active-loan count | Call the function | `RETIRED`, `CHECKED_OUT`, `AVAILABLE` per Section 7, including the retired-and-loaned edge case. |
| TEST-FEAT-02-05 | AC-04 | API integration (FR-05 consistency) | Available fixture with a pending request and custodian scope; a second fixture with an active loan | For each fixture read the catalog, then submit checkout validation through the existing checkout endpoint | The available fixture is accepted (201) and the checked-out fixture is rejected with 409 and still has exactly one active loan; catalog and checkout agree. If FEAT-04 is not accepted for this sprint the test is marked BLOCKED, not passed. It does not assert post-checkout catalog changes (that is TEST-FEAT-02-15). |
| TEST-FEAT-02-06 | AC-05 | API (authentication) | No cookie; a 43-character forged cookie; an expired session; a logged-out session; valid Borrower and Custodian sessions | `GET /api/assets` | Invalid cases return 401 with the standard error body and no asset data; valid cases return 200. |
| TEST-FEAT-02-07 | AC-06 | API + database (ordering) | Fixtures with equal names and different IDs, and with different names, created out of order | `GET /api/assets` twice, as each role | Fixtures appear sorted by `name` then `assetId`; identical order every time. |
| TEST-FEAT-02-08 | AC-07 | Database + seed | Seeded database; a fixture reusing an existing Asset ID | Read seed copies; attempt a duplicate insert | Seed has two same-name copies with different IDs; the duplicate insert fails with the unique-key error; the list has no duplicate IDs. |
| TEST-FEAT-02-09 | AC-08 | API + database | Fixture with `retiredAt` set | `GET /api/assets` | The fixture is absent. |
| TEST-FEAT-02-10 | AC-09 | API (mocked data access) | Prisma asset query mocked to return no rows, because the shared test database is not guaranteed to be empty | `GET /api/assets` | 200 and `[]`. |
| TEST-FEAT-02-11 | AC-10 | API | Prisma asset query mocked to throw | `GET /api/assets` | 500 with `{ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } }`; the thrown text is absent. |
| TEST-FEAT-02-12 | AC-11 | API + database | Row counts of asset, loan, request and session tables | `GET /api/assets` with and without a CSRF header | Same status either way; row counts unchanged. |
| TEST-FEAT-02-13 | AC-12 | Selected UI/E2E (manual or scripted; no client test runner exists today and none is added by this contract) | Running UI, API and database; seeded accounts | Log in per role; inspect the heading outline and region name for "Equipment catalog"; observe loading, loaded and error (API stopped) states; confirm the text badge; trigger a 401 | Heading and named section are present; states and badges match Section 4; no borrower or due data shown; the panel is cleared on 401. |
| TEST-FEAT-02-14 | AC-09, AC-12, AC-13 | Selected UI/E2E | Same, plus an empty catalog, and a request or checkout action | View the empty state; perform an action and a conflicting action | Empty state shown without error styling; the catalog refetches and shows the server's availability after each. |
| TEST-FEAT-02-15 | AC-S2-01 | API integration (**Sprint 2, deferred**) | Available fixture, pending request, custodian scope; FEAT-04 checkout and return available | Read; checkout; read; return; read | Unavailable after checkout; available after return for a non-retired asset. Not run and not required in Sprint 1. |

Planned UI/E2E cases stay "not executed" until run; unit and integration tests are not counted as UI evidence.

### AC-to-requirement-to-test traceability

| Requirement | AC | Tests | Sprint |
| --- | --- | --- | --- |
| FR-04 | AC-01, AC-02, AC-06, AC-07, AC-09, AC-11, AC-12 | TEST-01, -02, -07, -08, -10, -12, -13, -14 | 1 |
| FR-05 | AC-03, AC-04, AC-12, AC-13 | TEST-03, -04, -05, -13, -14 | 1 |
| BR-03, NFR-01 | AC-01, AC-05 | TEST-01, -06 | 1 |
| BR-10 | AC-03 | TEST-03 | 1 |
| NFR-03 | AC-11 | TEST-12 | 1 |
| NFR-04 | AC-10 | TEST-11 | 1 |
| NFR-05 | AC-07 | TEST-08 | 1 (constraint exists; formal verification is Sprint 2) |
| BR-13 (regression guard only) | AC-08 | TEST-09 | 1; formal verification Sprint 3 |
| BR-08 | AC-S2-01 | TEST-15 | **2** |

Every Sprint 1 AC maps to at least one requirement and one test above.
## 11. Definition of Done

FEAT-02 is complete only when:

1. FR-04 and FR-05, and the Sprint 1 portions of BR-03, BR-10, NFR-01, NFR-03 and NFR-04, meet AC-FEAT-02-01 to AC-FEAT-02-13 on the integrated UI, API and PostgreSQL application. BR-08 (AC-FEAT-02-S2-01), BR-13 and BR-05 are not Sprint 1 completion criteria for this feature.
2. The catalog list returns exactly the five allowlisted fields in `name`, `assetId` order, reports availability from the shared definition, and baseline gaps B1 to B3, B5, B6 and B7 are closed or explicitly deferred with a reviewer decision. B8 is tracked as a FEAT-03 dependency and is not a FEAT-02 completion item.
3. Every Sprint 1 AC has an executed test with real assertions and a recorded command, result and version. Failed, skipped or blocked tests are disclosed (for example TEST-FEAT-02-05 if checkout is not accepted).
4. For meaningful rule changes (availability definition, DTO allowlist, ordering), a failing test is retained before the change and a passing result afterward; assertions are not weakened to obtain green output.
5. Frontend lint and build, server build and the full server test suite pass, with FEAT-01 tests still passing and FEAT-01 behavior unchanged.
6. The catalog panel has the accessible "Equipment catalog" heading verified by TEST-FEAT-02-13.
7. `yiiipunn` and `DEV4952` review the contract and implementation in their actual roles, with a teammate PR review into `sprint-1-staging`. No review or merge is asserted here.
8. The seed, README or contract is updated for any new setup step; no secret appears in the diff.
9. The unresolved baseline conflicts in Section 13 are either resolved through a reviewed baseline revision or recorded as accepted risks, and the RTM TC-04 and TC-05 mapping is updated.
## 12. Dependencies and integration boundaries

| Dependency | Boundary |
| --- | --- |
| FEAT-01 | FEAT-02 reuses `requireAuth` through `domainRouter` and the error format. It adds no new authentication or role logic and does not change FEAT-01 behavior. Tests reuse the FEAT-01 login helper pattern. |
| FEAT-03 | FEAT-03 owns request creation and is not modified by FEAT-02. See risk I1 below. |
| FEAT-04 | FEAT-04 owns checkout and return. Per FR-05, checkout must validate the same availability state the catalog shows. FEAT-02 only reads the result and is never the authority for custody. BR-08 transitions are Sprint 2. |
| FEAT-05 | FEAT-05 shows loans and due dates. The catalog never exposes them. |
| FEAT-06, FEAT-07 | Summary counts and retirement reuse the same state definition. FEAT-07 changes `retiredAt`; FEAT-02 then excludes the asset (BR-13, Sprint 3). The existing `POST` and `PATCH /assets` routes remain FEAT-07 scope. |
| Database and seed | Existing `Asset` and `Loan` tables and the active-loan partial unique index; seed additions per Section 6. No schema change. |
| Test infrastructure | Existing `.env.test`, `vitest.config.ts` guard and `fileParallelism: false`. |

Ownership rule: the availability definition lives in one place. Where checkout, request validation and the catalog disagree, the shared definition wins and the others are fixed by their owning features.

**Integration risks**

| ID | Risk | Evidence | Impact | Owner and handling |
| --- | --- | --- | --- | --- |
| I1 | **`POST /requests` has no availability validation.** FR-06 says a Borrower may request "an existing, borrowable Asset ID". The current handler in `server/src/domain.ts` rejects only unknown or retired assets. | `POST /requests` checks that the asset exists and `retiredAt` is null, then creates the request. It does not consult active loans. | A Borrower can submit a request for a checked-out asset through the API even though the catalog shows it unavailable and the UI disables the button. The UI disabling is not enforcement. | **FEAT-03 dependency.** FEAT-03's contract must require the shared availability definition and a state-conflict response (the SDS uses 409 for an "unavailable asset"). FEAT-02 does not modify this handler. A request-level test belongs to FEAT-03. |
| I2 | Duplicate availability logic. The catalog and checkout each compute availability separately today (B3). | Inline query in `GET /assets`; separate active-loan check in checkout. | The two could drift and break FR-05. | FEAT-02 supplies one shared definition (Section 7, R6); FEAT-04 adopts it. |
| I3 | Checkout-dependent test. TEST-FEAT-02-05 needs the checkout endpoint. | Checkout exists in code but belongs to FEAT-04 and is allocated to Sprint 2 in the baseline. | The test could be blocked or reported as covering more than FR-05. | Mark BLOCKED if FEAT-04 is not accepted; never count it as BR-08 evidence. |
## 13. Resolved decisions, unresolved conflicts and document notes

**Resolved by this revision**

| ID | Decision |
| --- | --- |
| R-D1 | No single-asset (detail) route in Sprint 1. No baseline requirement calls for it (Section 5.2). |
| R-D2 | The response DTO is the five fields in Section 5.1. `retiredAt` and relations are excluded, and no new `status` field is added. |
| R-D3 | Ordering is `name` then `assetId`, both existing columns. |
| R-D4 | FR-05 (Sprint 1) and BR-08 (Sprint 2) are separated and quoted in Section 2. Sprint 2 behavior is a deferred AC. |
| R-D5 | The catalog panel requires an accessible "Equipment catalog" heading. |
| R-D6 | The missing availability check in `POST /requests` is recorded as FEAT-03 risk I1. |

**Unresolved baseline conflicts (recorded, not resolved here)**

| ID | Conflict | How this contract treats it |
| --- | --- | --- |
| C1 | **BR-05 versus the shared catalog.** SRS BR-05 says a Custodian may "view" only assets in their authorized inventory. The SDS API table and SDS section 6 give both roles the shared catalog and ask for confirmation under OQ-02. The SDS role matrix row "Catalog / search" says "Catalog policy above" for both roles, and the policy above speaks only of "Default borrower catalog visibility". | The SDS interpretation (read-only catalog for both roles, management restricted) is applied provisionally. No new rule is invented and BR-05 is not claimed. Needs a reviewed baseline decision. |
| C2 | **Sprint allocation of availability.** The SRS first-verifies FR-05 in Sprint 1 and BR-08 in Sprint 2, and the inventory says custody-driven availability is verified in Sprint 2. `docs/sprints/plan.md` also makes a Sprint 1 checkout journey a course target. The FEAT-01 contract records the same conflict. | The split in Section 2 is followed; the checkout-dependent test may be blocked (I3). |
| C3 | **Retired and unavailable asset visibility.** SRS OQ-04 asks whether borrowers see unavailable and retired assets and leaves the display policy open until Sprint 3. | The SDS provisional treatment is used: checked-out assets are shown, retired assets are excluded. |
| C4 | **SRS FR-04 "distinct copies" versus the seed.** The seed holds two different items and no two copies of one item. | The implementation phase adds a second copy (Section 6). |

**Document notes**

1. `docs/features.md`, `docs/traceability.md` and `docs/system-sds.md` do not exist; the real files are `feature-inventory.md`, `traceability-matrix.md` and `sds-system-level.md`.
2. The catalog route was implemented before this contract (B1 to B5), so parts of this contract describe changes to existing code, not new code.
3. The baseline documents (SRS, SDS, inventory, RTM, plan) are not modified by this contract.
## 14. Version and change history

| Version | Date | Author / owner | Change | Review status |
| --- | --- | --- | --- | --- |
| 0.1 (Draft) | 2026-11-03 | `yiiipunn` (assigned developer; AI-assisted draft) | Initial FEAT-02 engineering contract: scope, traceability, roles, UI states, API, data, availability rules, validation, AC, STS and DoD. Documentation only. | `DEV4952` review pending; no approval claimed. |
| 0.2 (Draft) | 2026-11-03 | `yiiipunn` (assigned developer; AI-assisted revision) | Removed the proposed detail route; quoted FR-05, BR-08 and related wording and separated the Sprint 1 and Sprint 2 behavior; recorded the BR-05 versus catalog conflict without a new rule; fixed the five-field DTO and deterministic ordering; added response-shape, authentication and ordering tests; required an accessible catalog heading; recorded the `POST /requests` availability gap as a FEAT-03 risk; added AC-to-requirement-to-test traceability. Documentation only. | `DEV4952` review pending; no approval claimed. |
