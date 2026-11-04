# Screenshot evidence index

All images are real captures of headless Edge (full page, 1280 px wide unless noted) taken by the run scripts at the moment named, against the live app, API and PostgreSQL. None is mocked or edited. Test IDs link to [e2e-test-report.md](e2e-test-report.md). "Reviewed" means I opened the image after the run and confirmed it shows what the caption says; other images were captured by the same steps but not individually opened.

| File | Test | Captured at | Reviewed |
| --- | --- | --- | --- |
| `screenshots/E2E-AUTH-01-unknown-user.png` | E2E-AUTH-01 | after submitting an unknown username | no |
| `screenshots/E2E-AUTH-01-wrong-password.png` | E2E-AUTH-01 | after submitting a wrong password for a real user | yes |
| `screenshots/E2E-AUTH-02-validation.png` | E2E-AUTH-02 | after submitting a whitespace-only username | no |
| `screenshots/E2E-AUTH-03-protected-redirect.png` | E2E-AUTH-03 | after the /requests deep link redirected to /login | no |
| `screenshots/E2E-AUTH-04-borrower-dashboard.png` | E2E-AUTH-04 | right after Borrower A signed in | no |
| `screenshots/E2E-AUTH-05-after-refresh.png` | E2E-AUTH-05 | after a full page reload | no |
| `screenshots/E2E-CAT-01-borrower-catalog.png` | E2E-CAT-01 | Borrower catalog, three assets | no |
| `screenshots/E2E-CAT-03-mobile-390.png` | E2E-CAT-03 | catalog at 390x844 viewport | yes |
| `screenshots/E2E-REQ-01-form-preselected.png` | E2E-REQ-01 | /requests with KL-CAM-001 preselected from the catalog | no |
| `screenshots/E2E-REQ-01-after-submit.png` | E2E-REQ-01 | after submitting the request (notice + PENDING record) | no |
| `screenshots/E2E-REQ-02-still-available.png` | E2E-REQ-02 | catalog after the request: still Available | no |
| `screenshots/E2E-REQ-06-form-preselected.png` | E2E-REQ-06 | /requests with KL-LAP-001 preselected | no |
| `screenshots/E2E-REQ-06-two-requests.png` | E2E-REQ-06 | My requests with two PENDING records | no |
| `screenshots/E2E-AUTH-06-after-logout.png` | E2E-AUTH-06 | after Sign out | no |
| `screenshots/E2E-REQ-04-form-preselected.png` | E2E-REQ-04 | Borrower B's form with KL-CAM-001 preselected | no |
| `screenshots/E2E-REQ-04-two-borrowers-pending.png` | E2E-REQ-04 | Borrower B dashboard: own single request, KL-CAM-001 still Available | yes |
| `screenshots/E2E-CHK-02-custodian-b-scoped-queue.png` | E2E-CHK-02 | Custodian B scoped queue | no |
| `screenshots/E2E-AUTH-07-custodian-dashboard.png` | E2E-AUTH-07 | right after Custodian A signed in | no |
| `screenshots/E2E-CHK-01-custodian-a-queue.png` | E2E-CHK-01 | Custodian A queue: two camera requests with requester | yes |
| `screenshots/E2E-CHK-03-past-due-rejected.png` | E2E-CHK-03 | past due date rejected in the form | yes |
| `screenshots/E2E-CHK-04-checkout-success.png` | E2E-CHK-04 | after checkout: notice, Checked out badge, active loan | yes |
| `screenshots/E2E-CHK-05-competing-request-blocked.png` | E2E-CHK-05 | competing request's disabled checkout form (same page state as after checkout) | yes |
| `screenshots/E2E-AVL-01-borrower-a-after-checkout.png` | E2E-AVL-01 | Borrower A: Checked out badge, CHECKED_OUT request, ACTIVE loan | yes |
| `screenshots/E2E-AVL-03-borrower-b-view.png` | E2E-AVL-03 | Borrower B's /requests after the forced-request checks | no |
| `screenshots/E2E-PER-01-borrower-a-after-restart.png` | E2E-PER-01 | Borrower A after the API restart | no |
| `screenshots/E2E-AVL-05-stale-form-preselected.png` | E2E-AVL-05 | stale page: KL-CAM-002 preselected before submit | no |
| `screenshots/E2E-AVL-05-conflict-message.png` | E2E-AVL-05 | after the 409: unavailable message, catalog refetched | yes |
| `screenshots/E2E-AVL-05-after-refresh.png` | E2E-AVL-05 | Equipment dashboard after the 409: KL-CAM-002 Checked out | no |
| `screenshots/E2E-PER-02-custodian-a-active-loans-after-restart.png` | E2E-CHK-08 | Custodian A: two active loans after restart | no |
| `screenshots/E2E-AUTH-09-session-ended.png` | E2E-AUTH-09 | after a 401 on submit; login screen with session-ended notice | yes |

Total: 30 screenshots.

## Other genuine browser screenshots already in the repository

These were not produced in this task. They are real headless-Edge captures made earlier in the sprint by the feature work, indexed here so the integration evidence is complete. I did not re-open them in this task, so "Reviewed" is **no** for all of them. They predate the merge of FEAT-03/FEAT-04, so they show the earlier UI.

### `artifacts/sprint-1/authentication/screenshots/` (live API, seeded dev database, 2026-11-02, uncommitted UI at the time)

| File | Shows (caption from that folder's `evidence.md`) | Reviewed |
| --- | --- | --- |
| `../authentication/screenshots/01-login-page.png` | Unauthenticated login form at `/login` | no |
| `../authentication/screenshots/02-invalid-credentials-generic-error.png` | Wrong password returns only the generic error | no |
| `../authentication/screenshots/03-borrower-dashboard.png` | `borrower.demo` reaches the borrower workspace | no |
| `../authentication/screenshots/04-borrower-refresh-restores-identity.png` | Reload keeps the session via `/auth/me` | no |
| `../authentication/screenshots/05-after-logout-login-page.png` | Sign out returns to `/login` | no |
| `../authentication/screenshots/06-protected-route-redirects-to-login.png` | `/dashboard` after logout redirects to `/login` | no |
| `../authentication/screenshots/07-custodian-dashboard.png` | `custodian.demo` reaches the custodian workspace | no |

### `artifacts/sprint-1/equipment-catalog/screenshots/` (FEAT-02 pass; **six of nine use a mocked API response and are not integration evidence**)

| File | Data source | Shows | Reviewed |
| --- | --- | --- | --- |
| `../equipment-catalog/screenshots/01-borrower-catalog-live.png` | live API | Borrower catalog | no |
| `../equipment-catalog/screenshots/02-unavailable-state-mocked-api.png` | **mocked** | Available and Checked-out cards | no |
| `../equipment-catalog/screenshots/03-empty-state-mocked-api.png` | **mocked** | Empty catalog state | no |
| `../equipment-catalog/screenshots/04-error-state-mocked-api.png` | **mocked** | Error with Retry | no |
| `../equipment-catalog/screenshots/05-loading-state-request-held.png` | live API, request held open | Loading state | no |
| `../equipment-catalog/screenshots/06-borrower-catalog-mobile-live.png` | live API | 390 px catalog | no |
| `../equipment-catalog/screenshots/07-custodian-catalog-live.png` | live API | Custodian catalog, no request buttons | no |
| `../equipment-catalog/screenshots/08-refetch-after-request-mocked.png` | **mocked** | Catalog refetch after a mocked 201 | no |
| `../equipment-catalog/screenshots/09-refetch-after-409-mocked.png` | **mocked** | Catalog refetch after a mocked 409 | no |

Repository-wide total: 7 + 9 + 30 = 46 images. No other screenshots exist in the repository outside `node_modules`, `dist` and the app's own asset folders.

## Missing screenshots (not fabricated, not in the repository)

The developer's own manual workflow (Borrower Login → Catalog → Request → Assigned Custodian queue → Checkout → Active Loan → Availability) was completed on the **development database with the demo accounts**, but **no screenshots of it were saved in the repository**. Only database-level evidence of its result exists (`logs/dev-db-user-workflow-readonly-inspection.log`). The following demo-account screenshots are therefore missing:

| Missing screenshot | Why it matters |
| --- | --- |
| `borrower.demo` catalog with `KL-LAP-001` Available before the request | start of the workflow on real demo data |
| `borrower.demo` My Requests showing `KL-LAP-001 · PENDING` | the request step (the developer reported this on screen; no image saved) |
| `custodian.demo` Pending requests: 0 records with the assigned-equipment message | BR-05 negative case on real demo data (reported by the developer; no image saved; the empty-state wording was added after that observation) |
| `custodian.other` Pending requests showing the `KL-LAP-001` request | BR-05 positive case on real demo data |
| `custodian.other` Active loans showing the new ACTIVE loan | checkout result |
| `borrower.demo` My loans (ACTIVE) and `KL-LAP-001` "Checked out" in the catalog | availability update on real demo data |

The equivalent states **were** captured on the synthetic throwaway database (`E2E-CHK-01`, `E2E-CHK-02`, `E2E-CHK-04`, `E2E-AVL-01`, `E2E-AVL-02` above), so the behaviour is evidenced in a browser; only the demo-account run lacks images.
