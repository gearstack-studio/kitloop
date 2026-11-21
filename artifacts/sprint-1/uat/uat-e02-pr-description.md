## fix(checkout): enforce maximum loan duration (#62)

Refs #62 (UAT-E02). This doesn't close the issue: Team 7 retests, or records a deferral, after OQ-01 is decided.

### Summary
Checkout due dates had no upper bound: the API accepted `9999-12-31T23:59:59Z` and the picker had no maximum. This PR adds a **server-enforced, configurable maximum loan duration** (`LOAN_MAX_DAYS`) and matching picker bounds.

**SRS OQ-01 is still open**, so no value is chosen here. The setting is unset by default, which means no maximum, the same as today. An approved value can be applied later with a GitHub environment variable alone (`KITLOOP_LOAN_MAX_DAYS`), with no code change. I've proposed 14 days to the decision owner (department owner / instructor), but **it isn't approved**.

### Root cause
`validateDueDate` (`server/src/checkout.ts`) checked only `dueAt > checkedOutAt`, and the picker set only `min`. OQ-01 deliberately left the maximum undefined.

### Changes
- **Server:** `loanMaxDays(env)` reads `LOAN_MAX_DAYS`: unset means none; `1`–`3650` days; anything else is a startup error.
  - `validateDueDate` rejects `dueAt > checkedOutAt + N×24h` (the boundary itself is allowed) with `400 VALIDATION_ERROR` and a `dueAt` field message.
  - `checkedOutAt` is taken inside the existing Serializable transaction, after the locks and before any write.
  - `features.loanMaxDays` is added to login and `/auth/me`.
- **Client:** the picker sets `max` alongside `min`, refreshes both as time passes, states "Maximum loan period: N days from checkout.", and shows "Choose a due date within N days of checkout." on submit or on native overflow. Dates are still submitted as UTC ISO strings. Server rejections show through the existing error path.
- **Release tooling:** `release.sh deploy` passes `KITLOOP_LOAN_MAX_DAYS` only when set, and validates it before any Cloud Run call. `deploy.yml` reads `vars.KITLOOP_LOAN_MAX_DAYS`.
- **Docs:** the FEAT-04 contract, `infra/gcp/README.md`, and the Lab 6 report `artifacts/sprint-1/uat/uat-e02-lab6-report.md`.
- No migration, and no change to authorization, CSRF, locking or the UAT-E01 auto-decline.

### RED → GREEN
- **RED** (new tests on `a381de3`): server 7 failed / 5 passed, with over-limit dates returning 201. Client 6 failed / 1 passed.
- **GREEN:** every scenario passes. Within the limit and exactly at the boundary are accepted. The following are rejected, and every rejection leaves the request PENDING with no loan:
  - 1 second or 1 millisecond beyond the limit
  - 100 years ahead, or year 9999
  - past dates
  - no timezone, an impossible date, or invalid input

  An over-limit checkout also leaves competing requests PENDING. Tests use `LOAN_MAX_DAYS=21` as a **test configuration only**.

### Full regression
| Check | Result |
|---|---|
| Server | 15 files, 122/122 |
| Client | 8 files, 49/49 |
| Browser E2E | 35/35 (4 new UAT-E02 tests) |
| Typecheck, lint, server and client builds, E2E typecheck | pass |
| Release guard suites, `bash -n`, ShellCheck | pass |
| Python infra tests | 54 OK |
| Docker Compose CI steps | not run locally; run by PR CI |

### Evidence
- `artifacts/sprint-1/uat/uat-e02-red.txt` and `uat-e02-green.txt`
- screenshots `uat-e02-e2e-01…04-*.png`
- report `uat-e02-lab6-report.md`

### Limitations
- **The policy decision is outstanding.** Production has no maximum until OQ-01 is approved and `KITLOOP_LOAN_MAX_DAYS` is set.
- "N days" means N × 24 hours from the checkout instant.
- The browser clock only drives the picker; the server is authoritative.
- There are no per-category limits or renewals, and existing loans aren't modified.

### Team 7 retest
After OQ-01 is approved and configured, follow §9 of `uat-e02-lab6-report.md`. It covers the picker maximum and message, a day over the limit refused, EV-E02-01 with the matching asset returning 400, the controls, and a valid checkout. Until then, record "deferred pending OQ-01".
