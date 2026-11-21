# UAT-E02 (#62): Checkout due date has no upper limit

| Field | Value |
|---|---|
| Finding | UAT-E02, from Team 7 (MyLittlePony) independent UAT. [Issue #62](https://github.com/gearstack-studio/kitloop/issues/62) |
| Requirement | BR-11, FEAT-04 due-date validation, SRS OQ-01 (loan-duration policy) |
| Branch / base | `fix/62-uat-checkout-due-date-limit`, from `a381de3` (`origin/sprint-1-staging`, includes merged PR #72) |
| Status | **Mechanism implemented and verified. The limit value is blocked on policy.** OQ-01 is still open, so production keeps **no maximum** until the department owner approves a value. |

## 1. Business rule and policy evidence

| Source | What it says |
|---|---|
| `docs/srs.md` BR-11 | "Checkout shall require a due date later than the checkout time. The chosen loan-period policy remains open in OQ-01." |
| `docs/srs.md` OQ-01 | "What loan duration or maximum due-date policy applies?" Owner: **Department owner / instructor**. To be agreed "before Sprint 2 acceptance". |
| `docs/sprints/sprint-1/FEAT-04-custodian-checkout.md` | "The department's maximum loan-duration policy is still OQ-01; no maximum or default is invented here." |
| `docs/feature-inventory.md`, `artifacts/sprint-1/integration/verification-summary.md` | OQ-01 recorded as open. No approval is recorded anywhere in the repository. |
| Issue #62 | First checklist item: "Department owner resolves OQ-01 (maximum loan period)". |

**No maximum loan duration has been approved.** This change therefore **does not choose one**. It adds a server-enforced, configurable maximum (`LOAN_MAX_DAYS`). The setting is unset by default, and unset keeps today's behaviour: no maximum.

### Proposal for the decision owner (not approved)

| Option | For | Against |
|---|---|---|
| **14 days (recommended proposal)** | A mistyped year becomes impossible. Equipment comes back within a fortnight and stays available to other borrowers. Covers a typical two-week project iteration. | Longer projects need a return and a new request, since there's no renewal feature. |
| 7 days | Fastest circulation and the tightest control | More friction for multi-week work |
| 30 days | Fits semester-long projects | A month-long mistake is still possible, and availability drops |

Two further points need the same decision:
1. **Meaning of "N days".** The implementation uses N × 24 hours from the actual checkout instant, inclusive. If the owner wants something else, such as end of the Nth calendar day or business days, the rule needs a change.
2. **Per-category limits** (for example, laptops vs. tripods) aren't supported. That would be a new requirement.

**Decision owner:** department owner / instructor (SRS OQ-01). **To apply an approved value:** set the GitHub environment variable `KITLOOP_LOAN_MAX_DAYS` on `lab5-production` and deploy. No code change or migration is needed.

## 2. Reproduction (before the fix)

1. As Custodian A, open the checkout form for a PENDING request. The picker has a `min` but no `max`, so a date 100 years ahead can be chosen.
2. Send `POST /api/requests/{id}/checkout` with `{"assetId":"<matching asset>","dueAt":"9999-12-31T23:59:59Z"}`. The response is **201**: a loan due in year 9999 is created. Team 7's probe used a mismatched asset, so it stopped at 409 after due-date validation had already passed.

## 3. Root cause

- `server/src/checkout.ts` `validateDueDate` checked only the lower bound (`dueAt <= checkedOutAt` → 400). No upper bound existed, because OQ-01 deliberately left the value open.
- `client/src/components/Checkout.tsx` set only `min` on the `datetime-local` picker.
- The database constraint is `dueAt > checkedOutAt`, so it doesn't bound the due date either.

## 4. Fix

| Area | Change |
|---|---|
| `server/src/config.ts` | `loanMaxDays(env)`: `LOAN_MAX_DAYS` unset or empty → `null` (no maximum); `1`–`3650` → that many days. Any other value is a **startup error**, also checked in `runtimeConfig`, so a typo can't silently disable the limit. 1–3650 is only a sanity range for the setting, not a policy. |
| `server/src/checkout.ts` | `validateDueDate(dueAt, checkedOutAt, maxDays)` also rejects `dueAt > checkedOutAt + maxDays × 24h` with **400 `VALIDATION_ERROR`**: message "Choose a due date within N days of checkout", field `dueAt`: "The due date must be no later than N days (N×24 hours) after checkout". It's called with `checkedOutAt` taken **inside the existing Serializable transaction**, after the row locks and before any write, so a rejection writes nothing. Authorization, CSRF, locking and the UAT-E01 auto-decline are unchanged. |
| `server/src/auth.ts` | Login and `/auth/me` `features` now include `loanMaxDays` (number or `null`). |
| `client/src/localDateTime.ts` | `latestDueInstant(days)` and `latestLocalMinute(days)`, which gives the latest whole browser-local minute within the period. |
| `client/src/components/Checkout.tsx` | When a maximum exists: the picker gets `max`, recomputed on every render and on focus or change along with `min`. The help text adds "Maximum loan period: N days from checkout." Submit and native `rangeOverflow` both show "Choose a due date within N days of checkout." with `aria-invalid`. Dates are still submitted as UTC ISO strings, in the browser's timezone. With no maximum configured, the form is unchanged. |
| `client/src/App.tsx` | Reads `features.loanMaxDays` (treated as `null` unless it's a positive integer), passes it to the form, and resets it on sign-out. Server rejections show the server message through the existing error path. |
| `infra/gcp/common.sh`, `release.sh`, `.github/workflows/deploy.yml` | `deploy` passes `KITLOOP_LOAN_MAX_DAYS` as `LOAN_MAX_DAYS` only when it's set. An invalid value is refused before any Cloud Run call. This lets the approved value take effect without code changes. |
| Docs | FEAT-04 contract and `infra/gcp/README.md` describe the setting and say it stays unset while OQ-01 is open. |

No database migration is needed. Existing loans are unchanged.

## 5. RED and GREEN

**RED:** the new tests, run against unmodified `a381de3` (evidence: `uat-e02-red.txt`).
- `server/tests/loan-duration.test.ts`: **7 failed, 5 passed.** Over-limit dates were accepted (`expected 201 to be 400`; the transaction resolved instead of rejecting), and the setting and `features.loanMaxDays` didn't exist. The 5 that passed were already-correct behaviour: within-limit accepted; past, current and invalid dates rejected; no maximum when unset.
- `client/tests/loan-duration.test.tsx`: **6 failed, 1 passed.** No `max`, no period text, no beyond-maximum refusal, and the App didn't pass the maximum through.

**GREEN** (evidence: `uat-e02-green.txt`). Test configuration is `LOAN_MAX_DAYS=21`, which is **not a policy**. It deliberately differs from the 14-day proposal.

| Scenario | Expected | Result |
|---|---|---|
| Within the maximum (7 days) | Accepted | ✓ 201, ACTIVE loan |
| Exactly at the maximum (checkout + 21 × 24h, from the transaction's checkout instant) | Accepted (inclusive) | ✓ |
| 1 second and 1 millisecond beyond | Rejected | ✓ 400 |
| 100 years ahead; `9999-12-31T23:59:59Z` | Rejected | ✓ 400 with the `dueAt` field message |
| Past; exactly current | Rejected | ✓ 400 |
| Missing timezone `2026-11-27T17:00:00` | Rejected | ✓ 400 |
| Impossible date `2027-02-30T10:00:00Z` | Rejected | ✓ 400 |
| Invalid input (`tomorrow`, `""`, `null`, `0`) | Rejected | ✓ 400 |
| Any rejected checkout | Request PENDING, no loan | ✓ checked after every case |
| Over-limit checkout with a competing request | Competitor stays PENDING; a valid retry then declines it, with exactly one active loan | ✓ UAT-E01 behaviour unchanged |
| `LOAN_MAX_DAYS` unset | No maximum (OQ-01 open) | ✓ |
| Invalid setting (`0`, `-1`, `1.5`, `14d`, ` 14`, `014`, `3651`, `abc`, `Infinity`) | Startup error | ✓ |
| Browser: picker `max`, period text, refusal message, native overflow, at-maximum submit, refresh as time passes | As specified | ✓ |

## 6. Full regression

| Check | Result |
|---|---|
| Server (all) | **PASS**, 15 files, 122/122 (was 110; +12 new) |
| Client (all) | **PASS**, 8 files, 49/49 (was 42; +7 new) |
| Browser E2E (Playwright, isolated `kitloop_e2e_pw`) | **PASS**, 35/35, including 4 new UAT-E02 tests |
| Server typecheck + build; client lint; client build; E2E typecheck | **PASS**, exit 0 |
| Release tooling `guards.test.sh` and 16 deployment guard cases | **PASS** |
| `bash -n` on all CI-checked scripts; `shellcheck -S warning` | **PASS** |
| Python infra unit tests | **PASS**: wif 28, persistence 14, deploy 12 |
| CI Docker Compose build, migrate/seed, smoke, production-image checks | **NOT RUN** locally (Docker engine not running on this machine); they run in PR CI |

E2E needs `NODE_OPTIONS=--dns-result-order=ipv4first` on this machine, which resets IPv6 `localhost` connections. This was already documented for UAT-E01. Two existing tests changed only to add the new `features.loanMaxDays: null` field to exact-equality assertions (`server/tests/auth.test.ts`, `server/tests/lifecycle-rollout.test.ts`).

## 7. Before and after

| | Before | After, `LOAN_MAX_DAYS=N` set | After, unset (production today) |
|---|---|---|---|
| API `dueAt` far in the future | 201, loan created | 400 `VALIDATION_ERROR`, nothing changes | 201, unchanged |
| Picker | `min` only | `min` and `max`, period stated, inline message | `min` only, unchanged |

## 8. Screenshots (browser E2E, test configuration of 21 days)

- `uat-e02-e2e-01-custodian-picker-shows-maximum.png`: the help text states "Maximum loan period: 21 days from checkout."
- `uat-e02-e2e-02-beyond-maximum-refused-in-browser.png`: a 22-day date is refused with "Choose a due date within 21 days of checkout." alongside the browser's native range message. No checkout request was sent, and the request stays PENDING.
- `uat-e02-e2e-03-api-probe-refused-request-still-pending.png`: after Team 7's year-9999 probe and a 100-year probe both returned 400, the request is still PENDING.
- `uat-e02-e2e-04-latest-allowed-due-date-checked-out.png`: the picker's maximum is accepted and an ACTIVE loan is created.

## 9. Team 7 retest instructions

**Precondition:** the department owner has approved a value N, `KITLOOP_LOAN_MAX_DAYS=N` is set on `lab5-production`, and the revision that contains this change is deployed. Until then, the deployed app intentionally still has no maximum. Team 7 should then record "deferred pending OQ-01" in Part 4 instead of a pass or fail.

1. As Custodian A, open the checkout form for a PENDING request. Check that the help text says "Maximum loan period: N days from checkout." and that the picker won't offer dates beyond N days.
2. Enter a date N+1 days ahead and click **Check out**. Expect "Choose a due date within N days of checkout.", with the request still PENDING and no loan.
3. Repeat EV-E02-01 with the **matching** asset: `POST /api/requests/{id}/checkout` `{"assetId":"<asset>","dueAt":"9999-12-31T23:59:59Z"}`. Expect **400 `VALIDATION_ERROR`** "Choose a due date within N days of checkout" with a `dueAt` field message. Queue and loans should be unchanged.
4. Controls: `2027-02-30T10:00:00Z` and `2026-11-27T17:00:00` still return 400.
5. Choose a date within N days and check out. Expect an ACTIVE loan with that due date.

## 10. Remaining limitations and deferred decisions

- **OQ-01 is open (blocking).** Production keeps no maximum until a value is approved and configured. Issue #62 should stay open until Team 7 retests with an approved value, or records the decision to defer.
- **Meaning of "N days":** 24-hour periods from the checkout instant. Calendar-day or end-of-day semantics would need a change once confirmed.
- **Client and server clocks:** the picker's bounds use the browser clock, while the server uses its own checkout instant and stays authoritative. With a skewed browser clock, a date the picker allows can still be refused, and the server message is then shown.
- **Rollback:** a revision without this change accepts any future date again. There's no data compatibility issue.
- **Not covered:** per-category limits, renewals or extensions, and existing loans that already have distant due dates. Those loans aren't modified; whether to review them is an owner decision.
