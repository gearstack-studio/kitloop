# UAT-E04 (#64): Borrower page switch is a single toggle button

| Field | Entry |
|---|---|
| Issue | [#64](https://github.com/gearstack-studio/kitloop/issues/64), reported by Team 7 (independent UAT), classified Enhancement (UI) |
| Linked requirement | FEAT-03 borrower UI; UAT-01 step 3, UAT-02 step 4 |
| Branch / base | `fix/64-uat-borrower-navigation` on `sprint-1-staging` at `b9883f1` (includes merged PR #74, UAT-E03) |
| Test data | Synthetic only: the isolated e2e database `kitloop_e2e_pw` (dropped after each run) and jsdom fetch stubs. No production data was read or changed. |
| Status | Implemented and verified locally. Not committed, not pushed, no PR. Issue #64 stays open for Team 7's retest. |

## 1. Reproduction (before)

1. Sign in as a borrower. `/dashboard` shows one button: **My Requests page** (`uat-e04-before-dashboard-toggle.png`).
2. Click it. `/requests` shows the same single button, now labelled **Equipment dashboard** (`uat-e04-before-requests-toggle.png`).

The only navigation control always names the *other* page. Nothing on screen or in the accessibility tree says which page is current.

## 2. Root cause

[App.tsx](../../../client/src/App.tsx) rendered a single `AmbientLink` inside `<nav aria-label="Borrower pages">`. Both its `href` and its label were computed as "the page you are not on":

```tsx
<AmbientLink href={route === '/requests' ? '/dashboard' : '/requests'}>
  {route === '/requests' ? 'Equipment dashboard' : 'My Requests page'}</AmbientLink>
```

So the control acted as a toggle. The current page had no link, no visual state and no `aria-current`, and the two pages were never visible together. Routing itself was correct: `/dashboard` and `/requests` are real paths handled by `navigation.ts` (History API plus `popstate`), with route protection in `App.tsx`. Only the navigation control was the problem.

## 3. Changes

| Area | Change |
|---|---|
| `client/src/components/BorrowerNav.tsx` (new) | `<nav aria-label="Borrower pages">` with a `<ul>` of two links in a fixed order: **Equipment dashboard** (`/dashboard`) and **My requests** (`/requests`). The current page's link is the filled (primary) variant and has `aria-current="page"`. The other link is outlined (secondary). |
| `client/src/components/Ambient.tsx` | `AmbientLink` takes an optional `current` prop that renders `aria-current="page"`. When the prop is omitted the output is unchanged, so the other uses (Back to home, the landing page) are not affected. |
| `client/src/App.tsx` | The toggle is replaced by `<BorrowerNav path={route} />`. It is still rendered only when `identity.role === 'BORROWER'`. Route handling, redirects, data loading and the custodian view are untouched. |
| `client/src/App.css` | `.borrower-nav`: a flex row with no list bullets and a default cursor on the current link. At 420px and below, the two links share the row equally and long labels wrap rather than clip. |
| Existing E2E specs 02, 03, 04, 06 | The link locator changes from "My Requests page" to "My requests" (the new label). This is a test-only rename; the assertions are the same. |

Design decisions:
- **Links, not ARIA tabs.** The two pages are separate URLs, with their own history entries, deep links and open-in-new-tab support. `role="tab"` would promise arrow-key tab behaviour and a single tab stop, which do not fit page navigation. The pattern used here is a `nav` landmark, ordinary `<a href>` links and `aria-current="page"`.
- **No router dependency.** The existing `linkClick` and `navigate` handle plain clicks. Modified clicks (Ctrl, Cmd, Shift, middle button) stay native, so a page can still open in a new tab.
- **The current page is still a link.** It stays in the tab order with a valid `href`. Clicking it is a no-op: `navigate()` returns early on the same path, so no duplicate history entry is added (this is tested).
- **Existing design.** The links reuse the KitLoop `.btn--primary` and `.btn--secondary` styles: Ice Silver fill for the current page and an outline on the Obsidian surface for the other. The focus ring is the existing `.btn:focus-visible` style (2px `--kl-focus` with a 3px offset).
- **Label.** "My requests" matches the page's section heading ("My requests") and the wording Team 7 proposed. The old "My Requests page" label is gone.

## 4. Accessibility verification

| Check | Result | Evidence |
|---|---|---|
| Landmark | One `navigation` landmark named "Borrower pages", shown to borrowers only | client and E2E tests |
| Current page conveyed programmatically | Exactly one link has `aria-current="page"` and it matches the URL (including a trailing slash) | client tests 1–3, E2E `expectCurrent` |
| Current page conveyed visually, not only by the attribute | The computed background colour of the current link differs from the other's (filled vs outlined), so state is shown by fill and shape as well as colour | E2E `expectCurrent`; screenshots |
| Contrast | Current link: #09090b text on #dce5ef (about 16:1). Other link: #fafafa on #141419 (about 17:1). The current link's fill against the page background (#09090b) is about 16:1. | `index.css` tokens |
| Keyboard | Tab order is Sign out, then Equipment dashboard, then My requests. Enter navigates, and focus stays on the activated link after navigation. | client test 6, E2E keyboard test |
| Visible focus | `outline-style` is not `none` and `outline-width` is at least 2px when the link has keyboard focus | E2E keyboard test; `uat-e04-e2e-03-keyboard-focus.png` |
| Touch target | Each link is at least 44px high at 360, 375 and 390px | E2E responsive tests |
| Reflow | No horizontal scroll, links do not overlap, labels are not clipped (`scrollWidth <= clientWidth`) at 360, 375 and 390px | E2E responsive tests; `uat-e04-e2e-04-*` |

## 5. RED and GREEN

RED is the new tests run against the unchanged toggle implementation (`uat-e04-red.txt`):

| Suite | Result | Failure |
|---|---|---|
| `client/tests/borrower-navigation.test.tsx` | 7 failed, 3 passed (10) | `expected [ 'My Requests page' ] to deeply equal [ Array(2) ]`, and "Unable to find … link … My requests" |
| `e2e/tests/07-borrower-navigation.spec.ts` | 7 failed, 3 passed (10) | `toHaveText(["Equipment dashboard","My requests"])` received a single link |

The 3 tests that pass in each suite are guards that must hold both before and after the change: custodians have no borrower navigation, and signed-out `/dashboard` and `/requests` redirect to `/login`.

GREEN after the change (`uat-e04-green.txt`): focused client 10/10, focused Playwright 10/10.

Tests:

| # | Test | Client | E2E |
|---|---|---|---|
| 1 | `/dashboard`: both links visible, only Equipment dashboard current | ✓ | ✓ |
| 2 | `/requests`: both links visible, only My requests current | ✓ | ✓ |
| 3 | Trailing slash and direct URL access mark the right page | ✓ | ✓ |
| 4 | Clicking each link navigates and moves the marker | ✓ | ✓ |
| 5 | Clicking the current link adds no history entry | ✓ | – |
| 6 | Keyboard Tab order, Enter, visible focus | ✓ | ✓ |
| 7 | Browser Back and Forward restore route and marker | ✓ | ✓ |
| 8 | 360 / 375 / 390px usable, no horizontal scroll | – | ✓ (3 tests) |
| 9 | Not shown to custodians | ✓ | ✓ |
| 10 | Signed-out route protection intact | ✓ (2) | ✓ (2) |

## 6. Full regression

| Check | Result |
|---|---|
| Full client (Vitest) | 10 files, **77/77** (previously 67, plus 10 new) |
| Full server (Vitest, `kitloop_auth_test`) | 16 files, **129/129** (no server change) |
| Full browser E2E (Playwright, Chromium) | **53/53** (previously 43, plus 10 new). This includes the UAT-E01 (#61) request lifecycle, UAT-E02 (#62) loan duration and UAT-E03 (#63) readable names specs. |
| Client lint (`eslint .`) | exit 0, no findings |
| Client production build (`tsc -b && vite build`) | exit 0 |
| Server typecheck and production build | exit 0 |
| E2E typecheck (`tsc --noEmit`) | exit 0 |

The UAT-E01, E02 and E03 screenshots were regenerated by the full run, then restored to their committed versions so this change touches only UAT-E04 evidence.

## 7. Screenshots (real browser, synthetic borrower `e2e.borrower.a`)

| File | Shows |
|---|---|
| `uat-e04-before-dashboard-toggle.png` | Before: `/dashboard` with the single "My Requests page" button |
| `uat-e04-before-requests-toggle.png` | Before: `/requests` with the single button now reading "Equipment dashboard" |
| `uat-e04-e2e-01-dashboard-current.png` | After: both links, Equipment dashboard filled (current) |
| `uat-e04-e2e-02-requests-current.png` | After: both links, My requests filled (current) |
| `uat-e04-e2e-03-keyboard-focus.png` | Keyboard focus ring on My requests (on the dashboard page) |
| `uat-e04-e2e-04-{360,375,390}-{dashboard,requests}.png` | Mobile widths. Both links share the row; at 360px "Equipment dashboard" wraps onto two lines without clipping. |

## 8. Files changed

| File | Kind |
|---|---|
| `client/src/components/BorrowerNav.tsx` | new |
| `client/src/components/Ambient.tsx` | modified: optional `current` prop |
| `client/src/App.tsx` | modified: toggle replaced by `BorrowerNav` |
| `client/src/App.css` | modified: `.borrower-nav` styles |
| `client/tests/borrower-navigation.test.tsx` | new, 10 tests |
| `e2e/tests/07-borrower-navigation.spec.ts` | new, 10 tests (read-only; writes no records) |
| `e2e/tests/02-request-checkout-journey.spec.ts`, `03-access-control.spec.ts`, `04-request-lifecycle.spec.ts`, `06-readable-names.spec.ts` | modified: link label rename only |
| `artifacts/sprint-1/uat/uat-e04-*` | evidence: this report, PR description, RED and GREEN logs, 12 screenshots |

There are no server, API, database, configuration or deployment changes.

## 9. Team 7 retest steps

On the revision that includes this change, with a synthetic borrower account:

1. Sign in as Borrower A. On `/dashboard`, confirm that two links are visible under the page heading, **Equipment dashboard** and **My requests**, and that Equipment dashboard is highlighted (filled).
2. Select **My requests**. Confirm the URL is `/requests`, both links are still visible, and My requests is now highlighted.
3. Use the browser's Back button, then Forward. Confirm the URL and the highlighted link follow each step.
4. Type `/requests` into the address bar directly. Confirm My requests is highlighted.
5. Keyboard only: Tab from **Sign out**. Focus moves to Equipment dashboard and then My requests, with a visible focus ring. Press Enter to navigate.
6. Optional screen reader check (NVDA or VoiceOver): the links are announced inside the "Borrower pages" navigation, and the highlighted one as "current page".
7. Narrow the window, or use device emulation at 360, 375 and 390px. Confirm both links are fully readable side by side with no horizontal scrolling.
8. Sign out and sign in as a custodian. Confirm the borrower links are not shown.
9. Record the result in Part 4 of the UAT pack and on Issue #64.

## 10. Remaining risks and limitations

- **Visual review only in Chromium.** Automated tests run in Chromium and jsdom. Firefox and Safari use the same standard HTML and CSS (flexbox and `aria-current`), but they were not run.
- **Screen reader announcement not tested automatically.** The attribute is asserted, but how a particular screen reader announces it is left to the Team 7 retest (step 6).
- **"Equipment dashboard" wraps at 360px.** This is intended, so the label is never clipped. It is still readable at a height of at least 44px.
- **Custodians keep a single page.** That is unchanged by design. The issue covers the borrower page switch only.
