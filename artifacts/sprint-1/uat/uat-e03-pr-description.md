## fix(ui): display readable user and equipment names (#63)

Refs #63 (UAT-E03). This doesn't close the issue; Team 7 retests first.

### Summary
The header showed "Account `<uuid prefix>`" twice, and request and loan cards used UUIDs and Asset IDs as labels. Now:
- the signed-in **username** is shown once;
- every request and loan is titled by **equipment name**;
- custodians' loan views name the **borrower** and the **checkout custodian**;
- UUIDs move into a collapsed **Record IDs** disclosure.

Every ID used for actions is unchanged.

### Root cause
`/auth/me` and login returned only `id` and `role`, and the loan reads returned bare Loan rows with no relations. So the UI could only render IDs: `client/src/App.tsx`, `components/Loans.tsx` and `components/Requests.tsx`.

### Changes
- **API, additive with no migration:**
  - Login `user.username` and `/auth/me` `username`: the caller's own name, taken from the session's existing user lookup.
  - Borrower loan reads (`/loans/mine`, and `/loans/:id` as owner) add `asset { assetId, name }` **only**.
  - Custodian loan reads (`/loans/active`, and `/loans/:id` in scope) add `asset`, `borrower { id, username }` and `checkoutCustodian { id, username }`.
  - Both come from per-role allowlisted Prisma includes, batched with no per-loan queries.
- **UI:**
  - a single `IdentityTag` with a visually hidden "Signed in as" prefix, falling back to the role when there's no username;
  - names as primary labels;
  - a native `<details>` "Record IDs" disclosure;
  - "Name unavailable" or Asset ID fallbacks, with no invented names;
  - the duplicate heading tag removed.
- **Docs:** the FEAT-01 login and `/me` bodies, and the FEAT-04 loan read fields.

### RED → GREEN
| | RED (`13df7d4`) | GREEN |
|---|---|---|
| `server/tests/readable-names.test.ts` | 5 failed / 1 passed (the existing privacy boundary) | 7/7 |
| `client/tests/readable-names.test.tsx` | 10 failed | 10/10 |
| `e2e/tests/06-readable-names.spec.ts` (Chromium) | header tag found **twice** ("Account `<uuid>`") | 7/7 |

### Full regression
| Check | Result |
|---|---|
| Server | 16 files, 129/129 |
| Client | 9 files, 67/67 |
| Browser E2E | 43/43 |
| Server typecheck and build, client lint and build, E2E typecheck | clean |

Three existing assertions were updated only where they encoded the old ID labels or exact auth bodies.

### Security and privacy
- Person summaries are exactly `{ id, username }`. No password hash, role or sessions.
- Scope is unchanged: borrowers see only their own loans (another borrower's returns 404), custodians see only their assets, and a borrower calling `/loans/active` gets 403.
- **Least privilege (final audit):** borrowers receive no custodian username, in the API or the UI. FR-11 covers checkout, due and return information only, and a username is also a login identifier. Custodians get borrower and checkout-custodian names for their assigned assets (FR-08, FR-12, BR-05). Audit RED/GREEN: `uat-e03-audit-red.txt` and `uat-e03-audit-green.txt`; the field-by-role table is in report §3a.

### Evidence
- Report: `artifacts/sprint-1/uat/uat-e03-lab6-report.md`
- Logs: `uat-e03-red.txt`, `uat-e03-green.txt`
- Screenshots:
  - `uat-e03-before-borrower-header-account-uuid.png` (before)
  - `uat-e03-e2e-01…05-*.png` (borrower header, My requests, My loans; custodian Pending and Active loans)
  - `uat-e03-e2e-06/07-mobile-*.png` (390 px)

### Limitations
- Usernames are the only names in the schema.
- `GET /requests/:id` and the checkout POST response still return IDs only; the UI doesn't display them.
- The UAT-E01 and UAT-E02 screenshots predate this change.

### Team 7 retest
Follow §8 of the report: the header username, names on all four lists, Record IDs collapsed, and the privacy checks.
