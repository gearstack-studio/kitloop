# CR-01 frontend — MOCKED UI verification screenshots (#82)

**These are mocked frontend verification screenshots, not production or full-stack integration evidence.**

| Item | Value |
| --- | --- |
| Implementation | `725307b` (`feat(client): implement pending-request quota UI (#82)`) |
| Captured | 2026-11-27, about 11:18 ICT, on the developer workstation |
| Frontend | Local Vite dev server `http://127.0.0.1:5199` serving `client/` at `725307b` |
| API | **Mocked.** Every `http://localhost:3000/api/**` call was fulfilled by Playwright route interception (`ui-verify.mocked.cjs`) with synthetic data (user `mock.borrower`, assets such as `CAM-01`). No backend, database or PR #88 code was involved. |
| Browser | Playwright 1.64.1 Chromium 156, headless; reduced motion |
| Viewports | desktop 1280×800, mobile 390×844 (full-page captures) |
| Automated checks | `mocked-ui-verification.json`: 18/18 scenario-viewport runs PASS; horizontal overflow 0 px in every run |

| File prefix | State shown |
| --- | --- |
| `mocked-01-available-quota` | 1 of 2 pending requests; "You can submit 1 more request." |
| `mocked-02-full-quota` | 2 of 2; "Limit reached."; selector and Submit disabled |
| `mocked-03-historical-over-limit` | 3 of 2 (unclamped); meter capped at 100% |
| `mocked-04-loading` | "Loading borrowing limit…" (quota response held) |
| `mocked-05-error-and-retry`, `mocked-05b-after-retry` | Error alert with "Retry borrowing limit", then recovered panel |
| `mocked-06-recovery-after-cancellation`, `mocked-06b-after-cancel` | 2 of 2 → Cancel request → 1 of 2 |
| `mocked-07-catalog-eligibility-full` | Catalog precedence: "Limit reached", "Request pending", checked out |
| `mocked-08-feature-disabled` | `features.borrowingQuota: false`: no Borrowing limit panel |
| `mocked-09-malformed-response` | Malformed quota body treated as a failed read (error alert) |

Notes:
- "Submit disabled=true" in the JSON for the available state only means no asset was selected yet. Enabling after selection is covered by the jsdom suite (Q01, Q05, Q11, Q13).
- Pre-existing, not changed by #82: the disabled control of a checked-out asset still *shows* the text "Request to borrow" (its accessible name says it is checked out). Dates render in the workstation's locale.

## Provenance check (added 2026-11-27, post-review, at `9bc49cb`)

- **Source commit confirmed: `725307b`.** These screenshots were committed in `e14b914` (2026-11-27 11:19:57 ICT), about one minute after capture. `git diff 725307b e14b914 -- client/src client/index.html client/package.json` is empty, so the application source captured is exactly that of `725307b`.
- **They predate the review fixes.** `9bc49cb` changes `client/src/App.tsx`, `client/src/borrowEligibility.ts` and `client/src/components/Catalog.tsx`. In particular, `mocked-05-error-and-retry` shows the *My requests* panel retry. It does not show the catalog quota-error label and catalog Retry added in `9bc49cb`.
- These files are kept unchanged as the historical record. Post-review mocked screenshots for `9bc49cb` (catalog quota error, accessible Retry, recovery after Retry, and submission disabled during a delayed quota refresh) are in `../post-review-9bc49cb/`.
