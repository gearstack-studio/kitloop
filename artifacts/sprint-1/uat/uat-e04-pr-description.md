# fix(ui): add persistent borrower navigation (#64)

Refs #64. Team 7 retests after merge, so this PR does not close the issue.

## Problem

UAT-E04: borrowers had a single navigation button whose label flipped to name the *other* page ("My Requests page" on `/dashboard`, "Equipment dashboard" on `/requests`). Nothing showed which page was current.

## Change

- **`BorrowerNav` (new):** a `<nav aria-label="Borrower pages">` with two persistent links, **Equipment dashboard** (`/dashboard`) and **My requests** (`/requests`).
  - The current page is the filled (primary) link and has `aria-current="page"`.
  - The other link is outlined (secondary).
- **Ordinary links, not ARIA tabs**, because these are separate routes. This keeps Back and Forward, direct URLs and open-in-new-tab working. No router dependency is added.
- **`AmbientLink`** gains an optional `current` prop. Without the prop, rendering is unchanged.
- **Responsive:** at 420px and below the two links share the row, and long labels wrap rather than clip. Each link is at least 44px high.
- **Unchanged:**
  - the custodian view, which shows no borrower navigation;
  - route protection and redirects;
  - data loading;
  - request, checkout, loan and authentication behaviour.
  - There are no server changes.

## Tests

- **New `client/tests/borrower-navigation.test.tsx` (10 tests):**
  - both links on each page, with exactly one current;
  - a trailing slash still marks the right page;
  - clicking moves the current marker;
  - clicking the current link adds no history entry;
  - keyboard Tab and Enter;
  - Back and Forward;
  - custodians see no borrower navigation;
  - signed-out redirect.
- **New `e2e/tests/07-borrower-navigation.spec.ts` (10 tests, read-only):** the same behaviour in Chromium, plus direct URL access, a visible focus ring, a visual difference between the current and other link, and 360, 375 and 390px layouts (no horizontal scroll, no clipping or overlap, touch targets at least 44px).
- **Existing E2E specs 02, 03, 04 and 06:** the link locator is renamed from "My Requests page" to "My requests".

| | RED (unchanged code) | GREEN |
|---|---|---|
| Client borrower-navigation | 7 failed, 3 passed | 10/10 |
| Playwright 07-borrower-navigation | 7 failed, 3 passed | 10/10 |

The 3 tests that pass on RED are guards: custodians see no borrower navigation, and signed-out visitors are redirected.

Full regression:
- client 77/77, server 129/129, Playwright 53/53 (including the #61, #62 and #63 specs);
- client lint and build, server typecheck and build, and the E2E typecheck all exit 0.

Evidence is in `artifacts/sprint-1/uat/`:
- `uat-e04-lab6-report.md`
- `uat-e04-red.txt`, `uat-e04-green.txt`
- `uat-e04-before-*.png` and `uat-e04-e2e-*.png`

## Retest (Team 7)

Follow `uat-e04-lab6-report.md` §9. Sign in as a borrower and check:
- both links are visible on each page;
- the highlighted link matches the URL, including after Back and Forward and on a directly typed URL;
- keyboard focus is visible;
- the layout works at 360 to 390px;
- custodians do not see the borrower links.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
