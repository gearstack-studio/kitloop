# UAT-E03 (#63): Pages show internal IDs instead of user and equipment names

| Field | Value |
|---|---|
| Finding | UAT-E03, from Team 7 (MyLittlePony) independent UAT. [Issue #63](https://github.com/gearstack-studio/kitloop/issues/63) |
| Requirement | UAT-01 steps 2, 5, 6; UAT-05 steps 1, 5; AC-FEAT-01-12 (role UI follows server identity); FEAT-04 UI |
| Branch / base | `fix/63-uat-readable-names`, from `13df7d4` (`origin/sprint-1-staging`, includes merged PR #72 and #73) |
| Status | Implemented and verified locally. Issue #63 stays open until Team 7 retests. |

## 1. Root cause

| Where | Before |
|---|---|
| `client/src/App.tsx` | The header and the page heading both rendered `Account {identity.id.slice(0, 8)}`, because `/auth/me` and login returned only `id` and `role`. |
| `server/src/domain.ts` loan routes | `/loans/mine`, `/loans/active` and `/loans/:id` returned the bare Loan row: IDs only, with no equipment name and no person names. |
| `client/src/components/Loans.tsx` | The primary label was the Asset ID. Lines read `Loan <uuid>`, `Request <uuid>`, `Borrower <uuid>` and `Checked out by <uuid>`. |
| `client/src/components/Requests.tsx` | `Request <uuid>` was primary text, and the custodian view appended the borrower UUID after the username. |

The schema has **no display-name field**: `User.username` is the only human-readable name. This change shows usernames and invents nothing.

## 2. Changes

### API (additive, no migration)
| Endpoint | Added | Kept |
|---|---|---|
| `POST /api/auth/login` | `user.username` (the user's **own** username) | `user.id`, `user.role`, `features` |
| `GET /api/auth/me` | `username` (own) | `id`, `role`, `features` |
| `GET /api/loans/mine`, and `/loans/:id` as the **borrower** | `asset: { assetId, name }` **only** (§3a) | every existing field (`id`, `requestId`, `assetId`, `borrowerId`, `checkoutCustodianId`, dates, `status`) |
| `GET /api/loans/active`, and `/loans/:id` as a scoped **custodian** | `asset: { assetId, name }`, `borrower: { id, username }`, `checkoutCustodian: { id, username }` | every existing field |

- The username comes from the session lookup that already loads the user, so it adds no query.
- The loan names come from per-role Prisma `include` allowlists (`borrowerLoanDetails` and `custodianLoanDetails`, `server/src/checkout.ts`). Prisma batches each as one query per relation for the whole list, so there are no per-loan queries.
- The checkout `POST` response and the request endpoints are unchanged; pending requests already carried the borrower `{ id, username }`.

### UI
- **Header:** one tag showing the username, with a visually hidden "Signed in as" prefix for screen readers. It truncates with an ellipsis on narrow screens.
  - The duplicate tag in the page heading is removed; the role stays in the "BORROWER/CUSTODIAN WORKSPACE" eyebrow.
  - If an older API sends no username, the tag shows "Borrower account" or "Custodian account", never a UUID.
- **My requests and Pending requests:** equipment name first, then "Asset ID · status", the submitted and closed times, and the close reason. The custodian view adds "Borrower: username".
- **My loans (borrower):** "Equipment name · ACTIVE", the Asset ID, and the checkout, due and return times (FR-11). No person names, and no custodian ID in Record IDs (§3a).
- **Active loans (custodian):** as above, plus "Borrower: username" and "Checked out by: username".
- **IDs:** loan and request IDs (plus borrower and custodian IDs in custodian views) move into a collapsed, keyboard-accessible "Record IDs" disclosure (`<details>`). They stay available for support and testers, and every action still uses the IDs.
- **Missing names:** a missing equipment name falls back to the Asset ID, and a missing person name shows "Name unavailable". Names are never invented and a UUID is never shown as a name.

## 3. Security and privacy

| Check | Result |
|---|---|
| Person summaries are an allowlist | Exactly `{ id, username }` (asserted by key equality). No password hash, role, sessions or other fields. |
| Own identity | `/auth/me` and login return only the caller's own username. |
| Scope unchanged | Borrowers see only their own loans: another borrower's loan returns 404 and their username doesn't appear. A custodian with no assigned assets sees `[]` and a 404. A borrower calling `/loans/active` gets 403. |
| Borrower loan reads | Equipment name only. **No custodian username** reaches a borrower in any API response (tested on the response body, not only the UI); see §3a. |
| Custodian loan reads | Borrower and checkout-custodian `{ id, username }` for loans on assets they're assigned (BR-05). This is consistent with the FR-08 pending queue. |

### 3a. Final privacy audit (before the PR)

The first version also sent borrowers the checkout custodian's `{ id, username }` and showed "Checked out by: <username>" on My loans. The requirements were reviewed:

| Source | Says |
|---|---|
| SRS FR-08 / TC-08 | Custodian queue includes "the requester and Asset ID needed for checkout". Custodians are approved to see **borrower** identity. |
| SRS FR-11 / TC-11 | "A Borrower shall be able to view only their own active and returned loans, including checkout, due, and return information when present." **No custodian identity.** |
| SDS `GET /loans/mine` | "own active/returned loan DTOs with applicable timestamps". |
| SDS `GET /loans/active` | Custodian, "active loans for authorized assets … supports return selection" (FR-12). |
| FEAT-04 Loan DTO | Already carried the opaque `checkoutCustodianId` UUID. A username is different because it is also a **login identifier**. |

No requirement grants borrowers custodian usernames, and the borrower workflow (FR-11) doesn't need them. **Least-privilege correction:**
- `/loans/mine` and `/loans/:id` for a borrower return the equipment name only.
- The borrower UI shows no "Checked out by" line and no custodian ID.
- Custodian views are unchanged.

RED/GREEN: the stricter tests failed on the first version (server 3, client 1, Chromium 1; the borrower card read "Checked out by: e2e.custodian.a") and pass after the correction (`uat-e03-audit-red.txt`, `uat-e03-audit-green.txt`). If the product owner later wants borrowers to see who handed over their equipment, that should be added to FR-11 first.

**Fields returned per endpoint and role after the correction** (new fields in bold):

| Endpoint | Role | Person or identity data returned |
|---|---|---|
| `POST /auth/login`, `GET /auth/me` | any | own `id`, `role`, **own `username`** |
| `GET /loans/mine`, `GET /loans/:id` | Borrower (own loans only) | `borrowerId` (self), `checkoutCustodianId` (opaque UUID, pre-existing), **`asset { assetId, name }`** |
| `GET /loans/active`, `GET /loans/:id` | Custodian (assigned assets only) | IDs as above, **`asset { assetId, name }`**, **`borrower { id, username }`**, **`checkoutCustodian { id, username }`** |
| `GET /requests/pending`, decline response | Custodian | `borrower { id, username }`, pre-existing (FR-08) |
| `GET /requests/mine`, `/requests/:id`, cancel response | Borrower | own records; `closedById` (opaque UUID, pre-existing). Unchanged. |

Record IDs contain only opaque UUIDs that the API already returned. Every record endpoint is session-scoped (NFR-01: a foreign ID gives 404), so knowing an ID grants no access. Fallbacks are consistent: "Name unavailable" for any missing person name, the Asset ID for a missing equipment name, and "Borrower account"/"Custodian account" for a missing own username.

## 4. RED and GREEN

**RED:** the new tests against unmodified `13df7d4` (evidence: `uat-e03-red.txt`).
- `server/tests/readable-names.test.ts`: **5 failed, 1 passed**. The pass is the existing privacy boundary, which must stay true.
- `client/tests/readable-names.test.tsx`: **10 failed**.
- `e2e/tests/06-readable-names.spec.ts` (real Chromium): the setup passed, then test 1 failed because the header tag appeared **twice** ("Account `<uuid prefix>`"). Before screenshot: `uat-e03-before-borrower-header-account-uuid.png`.

**GREEN** (evidence: `uat-e03-green.txt`; after §3a, `uat-e03-audit-green.txt`): server 7/7, client 10/10, browser 7/7. The tests cover:
- the username in the header for both roles and from the login response
- the role fallback
- names on all four lists
- correct names across two borrowers, two custodians and two assets
- IDs kept, and collapsed by default
- the "Name unavailable" fallback
- privacy boundaries
- the 390 px mobile layout without horizontal scroll

## 5. Full regression

| Check | Result |
|---|---|
| Server (all) | **PASS**, 16 files, 129/129 (after §3a) |
| Client (all) | **PASS**, 9 files, 67/67 |
| Browser E2E (Playwright, isolated `kitloop_e2e_pw`) | **PASS**, 43/43, including 7 UAT-E03 tests; the UAT-E01 lifecycle and UAT-E02 loan-duration specs are unchanged and pass |
| Server typecheck + build; client lint; client build; E2E typecheck | **PASS**, exit 0 |

E2E needs `NODE_OPTIONS=--dns-result-order=ipv4first` on this machine, which resets IPv6 `localhost` connections.

Three existing tests changed, each only where it asserted the old ID-as-label text or an exact response body:
- `server/tests/auth.test.ts`: login and `/me` now include `username`.
- `client/tests/checkout.test.tsx`: the "Borrower ID" and "Custodian ID" labels, and the "Name unavailable" fallback.
- `e2e/tests/02-request-checkout-journey.spec.ts`: the loan label is now "Mirrorless camera · ACTIVE", with "KL-CAM-001" as secondary text.

## 6. Screenshots (real browser, synthetic data)

| File | Shows |
|---|---|
| `uat-e03-before-borrower-header-account-uuid.png` | **Before:** "Account `<uuid>`" in the header and again in the heading |
| `uat-e03-e2e-01-borrower-dashboard-header.png` | Borrower header shows `e2e.borrower.a` once |
| `uat-e03-e2e-02-borrower-my-requests.png` | My requests by equipment name, with Record IDs collapsed |
| `uat-e03-e2e-03-borrower-my-loans.png` | My loans: "Readable names camera · ACTIVE", the Asset ID and times; no custodian name (§3a) |
| `uat-e03-e2e-04-custodian-pending-requests.png` | Pending: equipment and "Borrower: e2e.borrower.b"; Check out and Decline still present |
| `uat-e03-e2e-05-custodian-active-loans-ids-expanded.png` | Active loans with borrower and custodian names; Record IDs expanded to show the IDs are still available |
| `uat-e03-e2e-06-mobile-borrower.png`, `-07-mobile-custodian.png` | 390 px layout, no horizontal scroll |

The UAT-E01 and UAT-E02 screenshots in this folder are historical evidence for those findings and still show the earlier ID text.

## 7. Changed files

- **Server:** `server/src/auth.ts` (own username in the principal, login and `/me`), `server/src/checkout.ts` (`borrowerLoanDetails` and `custodianLoanDetails` allowlists, generic `loanDto`), `server/src/domain.ts` (loan reads include the allowlist for the caller's role).
- **Client:**
  - `client/src/App.tsx` (header via `IdentityTag`; the duplicate heading tag removed)
  - `client/src/components/IdentityTag.tsx` (new)
  - `client/src/components/RecordIds.tsx` (new)
  - `client/src/personName.ts` (new)
  - `client/src/components/Loans.tsx`
  - `client/src/components/Requests.tsx`
  - `client/src/App.css` (identity truncation, visually hidden text, Record IDs styling)
- **Tests:**
  - new: `server/tests/readable-names.test.ts`, `client/tests/readable-names.test.tsx`, `e2e/tests/06-readable-names.spec.ts`
  - updated: `server/tests/auth.test.ts`, `client/tests/checkout.test.tsx`, `e2e/tests/02-request-checkout-journey.spec.ts`
- **Docs:** `docs/sprints/sprint-1/FEAT-01-authentication.md` (login and `/me` bodies), `docs/sprints/sprint-1/FEAT-04-custodian-checkout.md` (loan read names).

## 8. Team 7 retest instructions

Run these on the revision that contains this change.

1. Sign in as Borrower A. The header shows Borrower A's **username once**, and "Account `<id>`" appears nowhere.
2. Open **My Requests page**. Each request is titled by **equipment name**, with "Asset ID · status" beneath. No UUID is visible until you expand **Record IDs**.
3. On the dashboard, **My loans** shows "Equipment name · ACTIVE", the Asset ID, and the checkout and due times. No custodian name or ID is shown (§3a).
4. Sign in as Custodian A. **Pending requests** shows equipment name and "Borrower: `<username>`". Check out and Decline still work.
5. **Active loans** shows equipment name, **"Borrower: `<username>`"** and "Checked out by: `<username>`". Expanding Record IDs reveals the loan, request and person IDs.
6. Privacy: Borrower A doesn't see Borrower B's loans or username. As a borrower, `GET /api/loans/active` returns 403.
7. Optional: at a phone width, names stay readable without horizontal scrolling.

## 9. Remaining limitations

- **Usernames are the only names.** There's no separate display name; adding one would be a schema and requirements change.
- **Not covered:** `GET /api/requests/:id` and the checkout `POST` response are unchanged and still return IDs only. The UI doesn't display them.
- The UAT-E01 and UAT-E02 evidence screenshots predate this change.
