Thanks, confirmed and fixed. At `13d748c`, native constraint validation ran against the `max` from the last render before React's submit handler. A date that became valid while the form stayed open was refused without the current time ever being checked.

### Fix (client only; the server check is unchanged)
- The checkout form is now `noValidate`. `min` and `max` stay as picker guidance only.
- The submit handler checks, against **one `now` captured per attempt**: present, parseable, after `now`, and at most `now + N × 24h` when a maximum is configured. Each attempt also refreshes the displayed bounds.
- The `onInvalid` path is removed. Inline errors keep `role="alert"`, `aria-invalid` and `aria-describedby`.
- Files: `client/src/components/Checkout.tsx`, `client/src/localDateTime.ts`.

### Regression
**Playwright, real Chromium** (`e2e/tests/05-loan-duration.spec.ts`, test 5):
1. The browser clock starts an hour behind real time.
2. The test enters a date 30 minutes over the picker's maximum (the input reports `rangeOverflow`).
3. It moves the clock to real time without touching the input, and confirms the DOM `max` is unchanged.
4. It clicks Check out.

It expects exactly one `POST …/checkout`, an ACTIVE loan, and `dueAt` equal to the chosen local time in UTC.
- **RED on `13d748c`:** blocked. The textbox is `[invalid]`, "Choose a due date within 21 days of checkout." is shown, and no POST is sent.
- **GREEN:** checked out.

**Component tests** (real submit-button clicks) add:
- a date still beyond the current maximum after time passes
- a valid date, and the exact maximum
- past and empty dates
- the maximum changing while mounted (21 → 7 → none)
- no maximum configured
- no duplicate submission while busy
- accessibility attributes

RED was 2 failed / 13 passed; GREEN passes.

### Results
| Check | Result |
|---|---|
| Focused client tests | 27/27 |
| Full client | 57/57 |
| Full server | 122/122 |
| Browser E2E | 36/36 |
| Lint, typecheck, builds | clean |

One full client run had an intermittent failure in `tests/navigation.test.tsx`, a file this change doesn't touch. It passed alone and in two reruns.

Evidence: `artifacts/sprint-1/uat/uat-e02-pr73-red.txt`, `uat-e02-pr73-green.txt`, `uat-e02-pr73-red-stale-maximum-blocked.png`, `uat-e02-e2e-05-stale-maximum-date-checked-out.png`. Report: `uat-e02-lab6-report.md` §11.

Agreed on #62: it stays open until the department owner approves a maximum (OQ-01), `KITLOOP_LOAN_MAX_DAYS` is deployed, and Team 7 retests. No value is chosen in this PR.
