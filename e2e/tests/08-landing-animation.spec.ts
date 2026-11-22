import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { REPO_ROOT } from "../support/env";
import { evidence } from "../support/helpers";

// UAT-E05 (#65): the landing page background must animate smoothly with normal motion and be a deliberate static
// scene with reduced motion (Windows "Animation effects" off reports prefers-reduced-motion: reduce in Chromium).
// Signed-out, read-only: no records are created. Time-dependent behaviour is checked by sampling computed styles on
// every animation frame and by inspecting document.getAnimations(), not by screenshots alone.
const SHOTS = path.join(REPO_ROOT, "artifacts", "sprint-1", "uat");
mkdirSync(SHOTS, { recursive: true });
const PHASE = process.env.UAT_E05_PHASE ?? "after";   // "before" when capturing the baseline
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `uat-e05-${PHASE}-${name}.png`) });
  await evidence(page, testInfo, name);
}

async function openLanding(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !/401|Unauthorized/.test(message.text())) errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Everything you need/ })).toBeVisible();
  return errors;
}

/** Every animation in the document, with the CSS properties its keyframes animate. */
function inventory(page: Page) {
  return page.evaluate(() => document.getAnimations().map((animation) => {
    const effect = animation.effect as KeyframeEffect;
    const target = effect.target as Element;
    const properties = [...new Set(effect.getKeyframes().flatMap((frame) =>
      Object.keys(frame).filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key))))];
    return {
      name: (animation as CSSAnimation).animationName, target: `${target.tagName.toLowerCase()}.${target.getAttribute("class") ?? ""}`,
      pseudo: effect.pseudoElement, duration: Number(effect.getTiming().duration), iterations: effect.getTiming().iterations,
      playState: animation.playState, properties,
    };
  }));
}

/**
 * Samples every decorative layer on each animation frame for `ms` and reports discontinuities: a falling icon that
 * appears (opacity jump) or teleports while visible, and any frame-to-frame opacity jump of the ambient light washes.
 * Consecutive frames more than 250 ms apart (the host stalled or slept) are not compared: the animation legitimately
 * advanced in between. They are counted as `gaps` so a stalled run is visible in the result.
 */
function observe(page: Page, ms: number) {
  return page.evaluate(async (duration) => {
    const drops = [...document.querySelectorAll<SVGElement>(".landing-drop")];
    const washes = [...document.querySelectorAll<HTMLElement>(".landing-ambient span")];
    const previous = new Map<Element, { opacity: number; top: number }>();
    const popIns: Array<{ at: number; from: number; to: number; topFrom: number; topTo: number }> = [];
    let washJump = 0, frames = 0, visibleDropFrames = 0, gaps = 0;
    const start = performance.now();
    let last = start;
    await new Promise<void>((done) => {
      const tick = (now: number) => {
        frames++;
        if (now - last > 250) { gaps++; previous.clear(); }
        last = now;
        for (const element of [...drops, ...washes]) {
          const opacity = Number(getComputedStyle(element).opacity);
          const top = element.getBoundingClientRect().top;
          const before = previous.get(element);
          if (before && washes.includes(element as HTMLElement)) washJump = Math.max(washJump, Math.abs(opacity - before.opacity));
          if (before && !washes.includes(element as HTMLElement)) {
            const visible = before.opacity > 0.1 && opacity > 0.1;
            if (Math.abs(opacity - before.opacity) > 0.15 || (visible && Math.abs(top - before.top) > 150)) {
              popIns.push({ at: Math.round(now - start), from: +before.opacity.toFixed(2), to: +opacity.toFixed(2), topFrom: Math.round(before.top), topTo: Math.round(top) });
            }
          }
          if (!washes.includes(element as HTMLElement) && opacity > 0.05 && element.getBoundingClientRect().width > 0) visibleDropFrames++;
          previous.set(element, { opacity, top });
        }
        if (now - start < duration) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
    return { frames, gaps, popIns, washJump: +washJump.toFixed(3), visibleDropFrames };
  }, ms);
}

/** Falling-equipment icons currently rendered and visible inside the hero. */
function visibleIcons(page: Page) {
  return page.evaluate(() => {
    const hero = document.querySelector(".landing-hero")!.getBoundingClientRect();
    return [...document.querySelectorAll<SVGElement>(".landing-drop")].filter((icon) => {
      const box = icon.getBoundingClientRect();
      return box.width > 0 && Number(getComputedStyle(icon).opacity) > 0.05 && box.bottom > hero.top && box.top < hero.bottom;
    }).length;
  });
}

/** Cumulative layout shift observed so far (Chromium Layout Instability API). */
function layoutShift(page: Page, ms: number) {
  return page.evaluate((wait) => new Promise<number>((resolve) => {
    let total = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!entry.hadRecentInput) total += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    setTimeout(() => resolve(+total.toFixed(4)), wait);
  }), ms);
}

/** Controls and text are on top: the element hit at each centre point is the control/text itself, not a decorative layer. */
async function expectNothingCovers(page: Page) {
  const report = await page.evaluate(() => {
    const items = [
      ...document.querySelectorAll(".landing-nav a, .landing-actions a, .landing-title .landing-line, .landing-lede"),
    ];
    return items.map((item) => {
      const box = item.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { item: item.textContent?.trim().slice(0, 30), covered: !!hit && !item.contains(hit) && !hit.contains(item) };
    });
  });
  expect(report.filter((entry) => entry.covered)).toEqual([]);
  const decorative = await page.evaluate(() =>
    [...document.querySelectorAll(".landing-ambient, .landing-beams, .landing-art")].map((layer) => ({
      pointerEvents: getComputedStyle(layer).pointerEvents, hidden: layer.getAttribute("aria-hidden") ?? layer.closest("[aria-hidden]")?.getAttribute("aria-hidden"),
    })));
  for (const layer of decorative) expect(layer).toEqual({ pointerEvents: "none", hidden: "true" });
}

async function expectNoHorizontalScroll(page: Page) {
  const { scroll, viewport } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(viewport);
}

test.describe("UAT-E05 (#65) landing animation: normal motion", () => {
  test.use({ reducedMotion: "no-preference", viewport: DESKTOP });

  test("falling equipment icons are visible and moving", async ({ page }, testInfo) => {
    await openLanding(page);
    await page.waitForTimeout(3_000);
    const falls = (await inventory(page)).filter((animation) => animation.name === "landing-fall" && animation.playState === "running");
    expect(falls.length).toBeGreaterThanOrEqual(3);
    expect(await visibleIcons(page)).toBeGreaterThan(0);
    await shot(page, testInfo, "01-desktop-normal-motion");
  });

  test("no full-screen brightness or other filter animation is running", async ({ page }) => {
    await openLanding(page);
    const filters = (await inventory(page)).filter((animation) => animation.properties.includes("filter"));
    expect(filters).toEqual([]);
  });

  test("20 s observation: icons never pop in or teleport, light washes change smoothly, layout is stable", async ({ page }) => {
    test.setTimeout(60_000);
    await openLanding(page);
    const [watch, shift] = await Promise.all([observe(page, 20_000), layoutShift(page, 20_000)]);
    testInfo().annotations.push({ type: "observation", description: JSON.stringify({ frames: watch.frames, gaps: watch.gaps, washJump: watch.washJump, shift }) });
    expect(watch.frames).toBeGreaterThan(100);
    expect(watch.visibleDropFrames).toBeGreaterThan(0);
    expect(watch.popIns).toEqual([]);
    expect(watch.washJump).toBeLessThan(0.05);
    expect(shift).toBeLessThan(0.1);
  });

  test("decoration never covers or blocks text and controls; sign-in navigation works", async ({ page }) => {
    const errors = await openLanding(page);
    await page.waitForTimeout(2_000);
    await expectNothingCovers(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole("link", { name: /Get Started/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("mobile 375px: icons visible, nothing covered, no horizontal scroll", async ({ page }, testInfo) => {
    await page.setViewportSize(MOBILE);
    await openLanding(page);
    await page.waitForTimeout(3_000);
    await expectNothingCovers(page);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, "02-mobile-normal-motion");
  });
});

test.describe("UAT-E05 (#65) landing animation: reduced motion", () => {
  test.use({ reducedMotion: "reduce", viewport: DESKTOP });

  test("nothing loops: no running infinite animation remains", async ({ page }) => {
    await openLanding(page);
    await page.waitForTimeout(1_000);
    const looping = (await inventory(page)).filter((animation) => animation.playState === "running" && animation.iterations === Infinity);
    expect(looping).toEqual([]);
  });

  test("a deliberate static scene: equipment icons are shown still, with no filter animation", async ({ page }, testInfo) => {
    await openLanding(page);
    await page.waitForTimeout(1_000);
    expect(await visibleIcons(page)).toBeGreaterThanOrEqual(3);
    expect((await inventory(page)).filter((animation) => animation.properties.includes("filter"))).toEqual([]);
    await shot(page, testInfo, "03-desktop-reduced-motion");
  });

  test("15 s observation: every decorative layer is completely still", async ({ page }) => {
    test.setTimeout(60_000);
    await openLanding(page);
    const snapshot = () => page.evaluate(() => [...document.querySelectorAll(".landing-ambient span, .landing-drop, .landing-art img")]
      .map((layer) => { const style = getComputedStyle(layer); return `${style.opacity}|${style.transform}|${style.filter}|${layer.getBoundingClientRect().top}`; }));
    await page.waitForTimeout(500);
    const first = await snapshot();
    const watch = await observe(page, 15_000);
    expect(watch.popIns).toEqual([]);
    expect(watch.washJump).toBe(0);
    expect(await snapshot()).toEqual(first);
  });

  test("decoration never covers text or controls; sign-in navigation works", async ({ page }) => {
    const errors = await openLanding(page);
    await expectNothingCovers(page);
    await expectNoHorizontalScroll(page);
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("mobile 375px: static icons visible, nothing covered, no horizontal scroll", async ({ page }, testInfo) => {
    await page.setViewportSize(MOBILE);
    await openLanding(page);
    await page.waitForTimeout(1_000);
    expect(await visibleIcons(page)).toBeGreaterThanOrEqual(2);
    await expectNothingCovers(page);
    await expectNoHorizontalScroll(page);
    await shot(page, testInfo, "04-mobile-reduced-motion");
  });
});

test.describe("UAT-E05 (#65) keyboard access", () => {
  test.use({ viewport: DESKTOP });
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`${reducedMotion}: Tab reaches the Login link with a visible focus ring`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await openLanding(page);
      const login = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Login" });
      for (let i = 0; i < 6 &&!(await login.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
      await expect(login).toBeFocused();
      const outline = await login.evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
      expect(outline.style).not.toBe("none");
      expect(outline.width).toBeGreaterThanOrEqual(2);
    });
  }
});

// Evidence only: short recordings of each mode (Playwright video, Chromium). Not a pass/fail check.
test.describe("UAT-E05 (#65) recordings", () => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`record 12 s of the landing page (${reducedMotion})`, async ({ browser, baseURL }) => {
      test.setTimeout(60_000);
      const context = await browser.newContext({ baseURL, reducedMotion, viewport: DESKTOP, recordVideo: { dir: test.info().outputPath("video"), size: DESKTOP } });
      const page = await context.newPage();
      await openLanding(page);
      await page.waitForTimeout(12_000);
      const video = page.video()!;
      await context.close();
      await video.saveAs(path.join(SHOTS, `uat-e05-${PHASE}-recording-${reducedMotion === "reduce" ? "reduced-motion" : "normal-motion"}.webm`));
    });
  }
});

function testInfo() { return test.info(); }
