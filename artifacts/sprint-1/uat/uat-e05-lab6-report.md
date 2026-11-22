# UAT-E05 (#65): Landing page background animation is inconsistent across laptops and flickers

| Field | Entry |
|---|---|
| Issue | [#65](https://github.com/gearstack-studio/kitloop/issues/65), reported by Team 7 (independent UAT), classified Enhancement (UI), cosmetic |
| Scope | Landing page `/` (signed out). The same decorative layers also back the sign-in page (`Backdrop`). |
| Branch / base | `fix/65-uat-landing-animation` on `sprint-1-staging` at `4376248` (includes merged PR #75, UAT-E04) |
| Environment | Windows 11, local Vite and API, Playwright 1.64 with Chromium (headless shell, plus one headed probe). Synthetic data only; the isolated e2e database is dropped after each run. |
| Status | Implemented and verified locally in Chromium. Not committed, not pushed, no PR. Issue #65 stays open until deployment and Team 7's retest on the original laptops. |

## 1. What was reported

On two laptops, some showed the falling-equipment ("falling emoji") animation, while others showed "a flickering light instead". Team 7 suggested three possible causes: the reduced-motion rules, `filter: brightness()` animated on a full-screen image, and `mix-blend-mode: screen`. Issue #65 has no comments, laptop models or recordings yet (EV-E05-01 is still marked "to be added").

## 2. Animation audit (baseline `4376248`)

Every animation on the page, from `document.getAnimations()` in Chromium after load:

| Layer | Animation | Properties | Normal motion | Reduced motion (as shipped) |
|---|---|---|---|---|
| `.landing-ambient span` ×3, `position: fixed`, full page, `filter: blur(70px)` | `ambient-a/b/c`, 16–24 s, infinite, alternate | transform, opacity | runs | **still runs, at 0.01 ms per cycle** (§3.1) |
| `.landing-drop` ×6 (falling equipment icons) | `landing-fall`, 8–15 s, infinite | transform, opacity | runs, **pops in and jumps** (§3.2) | **hidden** (`display: none`) |
| `.landing-art img` (light-trails SVG, `mix-blend-mode: screen`) | `art-pan` 22 s and `art-breathe` 7 s, infinite | transform; **filter: brightness(0.8↔1.2) saturate()** | runs | stopped |
| `.landing-pulse` and `::after` (status dot) | 2 s, infinite | transform, opacity | runs | stopped |
| Hero grid `::before`, `.landing-art`, title lines, `.landing-rise` | one-shot entrance (0.8–1.8 s) | opacity, transform | once | effectively instant |
| `.landing-nav` | static `backdrop-filter: blur(10px)` | — | static | static |

A global rule in `index.css` sets every animation to `animation-duration: 0.01ms !important` under `prefers-reduced-motion: reduce`.

## 3. Root cause

### 3.1 Confirmed: reduced motion left three full-page light layers looping every 0.01 ms

```css
.landing-ambient span:nth-child(1) { …; animation: ambient-a 16s ease-in-out infinite alternate; }   /* specificity 0,2,1 */
@media (prefers-reduced-motion: reduce) { .landing-ambient span { animation: none; } }      /* specificity 0,1,1: loses */
```

1. **The reduced-motion override never applied.** The per-wash rules are more specific than the override, so the override lost and the washes kept their infinite animation.
2. **The global reset made it worse.** It shortened each cycle to 0.01 ms, so a 16–24 s drift became a cycle that completes about 100 times per millisecond.
3. **What appears on screen therefore depends on frame timing.** Each frame shows whatever phase the clock lands on. Measured in Chromium: moving the timeline by 3, 6, 9 and 12 microseconds changed a wash's opacity between 0.55 and 1.0. Its position shifts by up to about 20% of the viewport width in the same way.

Evidence:
- **Inventory, reduced motion:** `ambient-a`, `ambient-b` and `ambient-c` are running, with `iterations: Infinity` and `duration: 0.01`.
- **Reproduced in the browser:** in the 15 s stillness test, all three washes changed by themselves with reduced motion on. Opacity went 0.775 → 0.634, 0.75 → 0.906 and 0.725 → 0.584, and the layers moved by up to about 120 px (`uat-e05-red.txt`).
- **Measured cost:** in a 10 s headless trace, the baseline page recalculated styles on every frame (181 recalculations). With the fix it did 0 (§6).

How often the jumps happen depends on each device's frame timestamps, which vary with display refresh rate, timer resolution and GPU and compositor scheduling. On this machine they were rare: the per-frame sampler saw no frame-to-frame jump in either headless or headed Chromium, but the state still changed within 15 s. On another laptop the same rule can produce a large jump on many frames, which would look like a flickering light.

**This explains both symptoms together.** A laptop with Windows "Animation effects" off reports `prefers-reduced-motion: reduce` to the browser. On that laptop the equipment icons were hidden, and the large blurred light washes could jump at random. A laptop with animation effects on shows the falling icons. That matches the report closely. It remains an inference until Team 7 confirms the setting on the affected laptops (§9).

### 3.2 Confirmed: falling icons popped in and teleported (normal motion, every device)

At the end of each fall, `Backdrop.tsx` re-rolled the icon, position, size **and `animationDuration`**. Changing the duration of a running CSS animation recomputes its progress from the elapsed time, so the icon jumped to an arbitrary point in its fall.

Evidence: a per-frame sampler watched all six icons for 20 s. It recorded 13 discontinuities in an exploratory probe, and 14 in the RED test, for example opacity 0.01 → 0.45 with the top jumping from −5 px to 331 px in one frame. These are visible flashes on every device, with or without reduced motion.

### 3.3 Requirement gap: full-hero brightness animation (normal motion)

`art-breathe` animated `filter: brightness(0.8 → 1.2) saturate()` over 7 s on the full-hero light-trails image, which is also blended with `mix-blend-mode: screen`. That is a slow 50% brightness pulse across the hero. The issue's acceptance criterion is "no full-screen brightness animation", and light-sensitive users are a stated concern, so it is removed.

### 3.4 Not confirmed

- **GPU-specific flicker from the filter animation or the blend mode.** I did not reproduce this: only one laptop and Chromium's software or headless compositing were available. The filter animation is gone anyway (§3.3). The static `mix-blend-mode: screen` is kept because removing it would change how the artwork looks, and nothing showed it to be harmful. If Team 7 still sees flicker with motion **on** after this fix, the blend mode is the next suspect (§10).
- **Tab switching.** Not specifically observed. The duration-jump bug (§3.2), now removed, was the mechanism most likely to look wrong after the browser throttles a background tab.

## 4. Expected behaviour (acceptance criteria)

| Mode | Criterion | How it is checked |
|---|---|---|
| Normal motion | Falling icons visible and moving | E2E 1: `landing-fall` running on 3 or more icons, and visible icons in the hero |
| | No full-screen brightness or filter animation | E2E 2: no animation with `filter` keyframes |
| | No flashing: no icon pops in or teleports, washes change smoothly, layout stable, over 20 s | E2E 3: per-frame sampler; cumulative layout shift < 0.1 |
| | Decoration never covers or blocks text and controls; sign-in works | E2E 4: hit-testing at each control and text centre, `pointer-events: none` and `aria-hidden` on decorative layers, Get Started → `/login` |
| | Phone 375 px | E2E 5 |
| Reduced motion | Nothing loops | E2E 6: no running infinite animation |
| | A deliberate static scene: equipment icons shown still, no filter animation | E2E 7 |
| | Completely still for 15 s | E2E 8: per-frame sampler, plus identical computed opacity, transform, filter and position at the start and end |
| | Decoration never covers controls; sign-in works; phone 375 px | E2E 9, 10 |
| Both | Keyboard: Tab reaches Login with a visible focus ring | E2E 11, 12 |

The reduced-motion fallback is intentional. Reduced-motion users get no falling, drifting, pulsing or brightness change. They see the light-trails artwork, the column grid, static light washes, and the six equipment icons resting at fixed places (dimmer, at opacity 0.28), so the page keeps its identity instead of losing its icons. The resting places are the same on every load and every device.

## 5. Changes

| File | Change | Why |
|---|---|---|
| `client/src/Landing.css` | The reduced-motion override for the light washes uses `.landing-ambient span:nth-child(n)`, which matches the specificity of the per-wash rules, so `animation: none` now applies | §3.1 |
| | Reduced motion: `.landing-drop` rests at `var(--rest-x)` / `var(--rest-y)`, opacity 0.28, tilted, `animation: none`, replacing `.landing-beams { display: none }` | Deliberate static scene (§4) |
| | `art-breathe` (`filter: brightness() saturate()`) removed; the art keeps its slow transform-only `art-pan` | §3.3 |
| | The icon's horizontal position comes from `--fall-x`, so reduced motion can override it without `!important` | Supports the static scene |
| `client/src/components/Backdrop.tsx` | Each icon's fall duration is chosen once and kept. The per-loop re-roll changes only icon, position, size and tilt, at the start of the loop while the icon is fully transparent above the hero. Each icon also gets a fixed resting place (`--rest-x`, `--rest-y`). | §3.2 |
| `client/src/index.css` | The global reduced-motion reset also sets `animation-iteration-count: 1 !important` | Defence in depth: a future infinite animation that is missed in a reduced-motion override plays once and stops, instead of looping every frame |
| `client/tests/landing-animation.test.tsx` (new) | 3 unit tests: duration and delay unchanged across re-rolls (the re-roll is shown to run), fixed distinct resting places, decorative layer `aria-hidden` | RED/GREEN at component level |
| `e2e/tests/08-landing-animation.spec.ts` (new) | 12 checks plus 2 recordings in Chromium with controlled `reducedMotion` (§4). Signed out and read-only. | RED/GREEN in a real browser |

No new dependency, and no change to the composition, text, colours, artwork, routes or any signed-in page. The sign-in page shares `Backdrop`, so it gets the same fixes: its light washes no longer loop under reduced motion, and its icons rest instead of disappearing.

## 6. Performance and accessibility verification

### Measured (Chromium headless, 1280×800, 10 s window after load; `uat-e05-green.txt`)

Measured with a Chromium performance trace (`devtools.timeline`) plus Chromium's built-in performance metrics:

| | Baseline, normal | Fixed, normal | Baseline, reduced | Fixed, reduced |
|---|---|---|---|---|
| Running animations / infinite | 13 / 13 | 12 / 12 | 3 / 3 | **0 / 0** |
| Animations with `filter` keyframes | 1 | **0** | 0 | 0 |
| Style recalculations (UpdateLayoutTree) | 115 (33.6 ms) | 123 (34.5 ms) | **181 (13.9 ms)** | **0** |
| Layout events | 5 | 2 | 0 | 0 |
| Paint events | 10 (1.8 ms) | 4 (0.2 ms) | 0 | 0 |
| DOM elements | 102 | 103 | 100 | 99 |
| Console errors | 0 | 0 | 0 | 0 |
| Cumulative layout shift, 20 s (E2E 3) | — | < 0.1 (asserted) | — | — |

How to read the table:
- The clearest result is reduced motion. The baseline page did style work on every frame; the fixed page does none, so it is idle.
- Headless Chromium composites in software and does not pace frames like a real display, so frame counts, paint counts and task time are **not** representative of a laptop GPU.
- No FPS or GPU usage was measured, and none is claimed.

### Observed and asserted

- **Text and controls on top:** hit-testing at the centre of every nav link, CTA, title line and the lede returns that element, not a decorative layer. Checked in both modes, at 1280 px and 375 px.
- **Decorative layers:** `pointer-events: none` and `aria-hidden="true"`, asserted.
- **Keyboard:** Tab reaches Login with a visible focus ring (outline ≥ 2 px), in both modes. Get Started and Login navigate to `/login`.
- **No horizontal scroll** at 1280 px or 375 px, in either mode.
- **Contrast is unchanged.** Text colours and backgrounds are untouched, and the art no longer brightens to 1.2× behind the hero text.

### Other browsers

Firefox and WebKit are **NOT RUN**: only Chromium is installed for Playwright on this machine. Edge uses the same Chromium engine but was not run separately.

## 7. RED and GREEN

RED was captured against the unchanged code (`uat-e05-red.txt`):

| Suite | Result | Failures |
|---|---|---|
| E2E `08-landing-animation.spec.ts` | 6 failed, 8 passed (14) | the `art-breathe` filter animation; 14 icon pop-ins in 20 s; ambient-a/b/c looping under reduced motion; 0 icons in reduced motion (desktop and 375 px); the washes changed during the 15 s stillness window |
| Client `landing-animation.test.tsx` | 2 failed, 1 passed (3) | `animationDuration` changed after the loop re-roll; no resting places |

The 8 E2E tests that pass on RED are guards that must hold before and after: icons moving with normal motion, nothing covered, sign-in navigation, no horizontal scroll, keyboard focus, and the 2 recordings.

GREEN after the fix (`uat-e05-green.txt`): E2E 14/14, client 3/3.

During the full regression, the 20 s observation test failed once. A single sampled frame gap of about 29 minutes, with the host suspended, made three icons appear to jump because the animation legitimately advanced. The sampler now skips frame pairs more than 250 ms apart and reports them as `gaps`. I re-ran it against the baseline (still fails: pop-ins at 14.1 s, 14.5 s, …) and against the fix (passes), so the test still detects the real defect.

Separately, the E2E global setup intermittently failed with `read ECONNRESET` on its pre-test login probe, before any test ran. It happened 3 times and passed on retry each time. It is an environment flake unrelated to this change (no server code changed), and is noted here so it is not hidden.

## 8. Regression

| Check | Result |
|---|---|
| Full client (Vitest) | **PASS**: 11 files, 80/80 (77 before, plus 3 new) |
| Full server (Vitest, `kitloop_auth_test`) | **PASS**: 16 files, 129/129 (no server change) |
| Full browser E2E (Playwright, Chromium) | **PASS**: 67/67 = 01 auth/catalog 3, 02 request/checkout 8, 03 access control 12, 04 request lifecycle (UAT-E01 #61) 8, 05 loan duration (UAT-E02 #62) 5, 06 readable names (UAT-E03 #63) 7, 07 borrower navigation (UAT-E04 #64) 10, 08 landing animation (UAT-E05) 14 |
| Client lint (`eslint .`) | **PASS**: exit 0, no findings |
| Client production build | **PASS**: exit 0 |
| Server typecheck and production build | **PASS**: exit 0 |
| E2E typecheck (`tsc --noEmit`) | **PASS**: exit 0 |
| Firefox / WebKit smoke | **NOT RUN**: browsers not installed |

An earlier full run had 66/67; the one failure was the stalled-frame artefact described in §7, and the sampler was fixed and rechecked. The UAT-E01 to E04 screenshots regenerated by the full runs were restored to their committed versions.

## 9. Visual evidence

Screenshots are from Chromium, 1280×800 and 375×812, signed out, with no data involved. Still images cannot show smoothness, so the time-dependent behaviour is covered by the sampler and the animation-inventory assertions, plus the recordings.

| File | Shows |
|---|---|
| `uat-e05-before-01-desktop-normal-motion.png` | Before, normal motion, desktop |
| `uat-e05-before-02-mobile-normal-motion.png` | Before, normal motion, 375 px |
| `uat-e05-before-03-desktop-reduced-motion.png` | Before, reduced motion: no equipment icons (hidden) |
| `uat-e05-before-04-mobile-reduced-motion.png` | Before, reduced motion, 375 px |
| `uat-e05-after-01-desktop-normal-motion.png` | After, normal motion: same composition, falling icons |
| `uat-e05-after-02-mobile-normal-motion.png` | After, normal motion, 375 px |
| `uat-e05-after-03-desktop-reduced-motion.png` | After, reduced motion: static scene with resting icons |
| `uat-e05-after-04-mobile-reduced-motion.png` | After, reduced motion, 375 px: three icons below the buttons |
| `uat-e05-{before,after}-recording-{normal,reduced}-motion.webm` | 12 s Playwright recordings of each mode, before and after (headless Chromium; not proof of behaviour on other hardware) |

## 10. Known limitations and risks

- **The hardware symptom was not reproduced as visible per-frame flicker on this machine.** The mechanism (§3.1) is confirmed and removed, and the reduced-motion state change was reproduced over 15 s. Whether this was the flicker on Team 7's laptops is unconfirmed until they retest on the same laptops.
- **The static `mix-blend-mode: screen` and `backdrop-filter` on the sticky nav are unchanged.** If flicker persists with motion **on**, these are the next things to examine, ideally with the affected laptop's GPU model and browser version.
- **Only Chromium was tested;** Firefox and WebKit were not run (§6). Performance figures come from headless Chromium and do not represent laptop GPUs.
- **The 12 s `.webm` recordings are 1.6–4.2 MB each (about 13.6 MB together).** Drop them from the commit if repository size matters; the PNGs and logs are enough for review.

## 11. Team 7 independent retest

Please use **the same laptops** that showed the difference, on the revision that includes this change, signed out:

1. On each laptop, note the model, OS and browser version, and whether Windows **Settings → Accessibility → Visual effects → Animation effects** is on or off.
2. Open the KitLoop URL (`/`) and watch the hero for 20 s.
   - **Animation effects on:** equipment outlines fall smoothly and fade in at the top. No icon appears suddenly mid-screen, and there is no flashing or brightening and dimming of the light trails.
   - **Animation effects off:** the page is completely still. The light trails and six (three on a phone) equipment outlines rest in place, and nothing flickers or jumps.
3. On the laptop that previously flickered, toggle Animation effects, reload, and repeat step 2 in both states.
4. Check that **Get Started** and **Login** go to the sign-in page, and that Tab shows a visible focus ring on Login.
5. Optional: open `/login` signed out. Its background follows the same two behaviours.
6. Record the result, with a short recording from each laptop (EV-E05-01), in Part 4 of the UAT pack and on Issue #65. If flicker persists with Animation effects **on**, please include the GPU model and browser version (§10).
