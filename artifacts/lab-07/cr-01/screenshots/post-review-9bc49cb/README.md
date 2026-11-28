# CR-01 frontend — post-review MOCKED UI screenshots at `9bc49cb` (#82)

**These are mocked frontend verification screenshots, not production or full-stack integration evidence.**
They add the states introduced by the review fixes. The historical screenshots in `../frontend-green/` are unchanged
and remain the record of implementation `725307b`.

| Item | Value |
| --- | --- |
| Implementation | `9bc49cb73bd454c5b1d0c6c7c32b3c77fa693bd7` (`fix(client): block requests while quota refreshes (#82)`), the commit reviewed by DEV4952 |
| Source checkout | Isolated worktree, detached at `9bc49cb`, with no changes to `client/src` |
| Captured | 2026-11-27 21:24:32–21:24:40 ICT (`mocked-post-review-verification.json` has the UTC time) |
| Frontend | Local Vite dev server `http://127.0.0.1:5199` serving `client/` of that checkout |
| API | **Mocked.** Every `http://localhost:3000/api/**` call was fulfilled by Playwright route interception (`ui-verify-post-review.mocked.cjs`) with synthetic data. No backend, database or PR #88 code was involved. |
| Browser | Playwright 1.64.1 Chromium, headless, reduced motion |
| Viewports | Desktop 1280×800 and mobile 390×844 (full-page captures) |
| Automated checks | `mocked-post-review-verification.json`: 4/4 scenario-viewport runs PASS. Horizontal overflow was 0 px in every capture. Raw console output is in `../../frontend-post-review-9bc49cb/post-review-mocked-ui-capture.txt`. |

| File prefix | State shown | Checks recorded |
| --- | --- | --- |
| `mocked-catalog-quota-error` | Catalog after a failed quota read (HTTP 500): alert "Borrowing limit could not be loaded." and each available asset labelled "Borrowing limit unavailable" | Camera control disabled. A `button` named "Retry borrowing limit" is present, enabled and focusable (the capture shows it focused). |
| `mocked-catalog-after-retry` | After pressing Enter on "Retry borrowing limit" | The next quota read succeeds (0 of 2). The alert is gone and "Request to borrow Camera, CAM-01" is enabled. Two quota GETs were made. |
| `mocked-pending-refresh-after-409` | After `POST /api/requests` returned 409 `BORROWING_QUOTA_EXCEEDED` while the quota re-read is held open | "Loading borrowing limit…" is shown. Submit and the equipment selector are disabled. A forced second click left the POST count at 1. |
| `mocked-after-fresh-full-quota` | After the held quota re-read returned 2 of 2 | "2 of 2 pending requests" is shown. Submit stays disabled and the POST count stays at 1. |

Notes:
- The same behaviours are covered by the jsdom tests "keeps submission disabled while the quota refresh after a 409 is pending" and "shows a quota read failure on the catalog and lets the borrower retry there". Both pass at `9bc49cb` and fail at the pre-fix `e14b914`; see `../../frontend-green.txt`.
- Not changed by these fixes: the disabled control of a checked-out asset still *shows* the text "Request to borrow" (its accessible name says it is checked out). Dates render in the workstation's locale.
