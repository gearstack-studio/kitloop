import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { EVIDENCE_DIR, captureEvidence, evidenceName, exportEvidence, exportSettings, type ExportSettings } from "../support/evidence";

// PR #76 review (P2): routine E2E runs must never write UAT evidence; export is opt-in, validated and never replaces
// reviewed evidence without explicit authorisation. These checks use temporary, test-scoped folders only: the real
// artifacts/sprint-1/uat/ folder is never written here (asserted below).
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const png = Buffer.from("synthetic evidence");
const tempDir = (name: string) => { const dir = test.info().outputPath(name); mkdirSync(dir, { recursive: true }); return dir; };
const ROUTINE = { CI: undefined };   // an environment with no export variables

test.describe("UAT evidence export settings", () => {
  for (const value of [undefined, "", "0", "off", "false", "no", " OFF "]) {
    test(`export disabled when UAT_EVIDENCE_EXPORT is ${JSON.stringify(value)}: nothing is written`, () => {
      const dir = tempDir("uat");
      const settings = exportSettings({ UAT_EVIDENCE_EXPORT: value }, dir);
      expect(settings.findings.size).toBe(0);
      expect(exportEvidence("e05", "uat-e05-after-01-desktop-normal-motion.png", png, settings)).toBeNull();
      expect(readdirSync(dir)).toEqual([]);
    });
  }

  test("routine settings point at the real UAT folder but export nothing", () => {
    const settings = exportSettings(ROUTINE);
    expect(settings.dir).toBe(EVIDENCE_DIR);
    expect(settings).toMatchObject({ phase: null, overwrite: false });
    expect(settings.findings.size).toBe(0);
  });

  const invalid: Array<[string, Record<string, string | undefined>, RegExp]> = [
    ["an unknown finding", { UAT_EVIDENCE_EXPORT: "e06" }, /unknown value/],
    ["a bare 1 (findings must be named)", { UAT_EVIDENCE_EXPORT: "1" }, /unknown value/],
    ["e05 without a phase", { UAT_EVIDENCE_EXPORT: "e05" }, /requires UAT_EVIDENCE_PHASE/],
    ["an invalid phase", { UAT_EVIDENCE_EXPORT: "e05", UAT_EVIDENCE_PHASE: "later" }, /requires UAT_EVIDENCE_PHASE/],
    ["a phase for a finding without phases", { UAT_EVIDENCE_EXPORT: "e04", UAT_EVIDENCE_PHASE: "after" }, /applies only to e05/],
    ["an invalid overwrite value", { UAT_EVIDENCE_EXPORT: "e04", UAT_EVIDENCE_OVERWRITE: "please" }, /must be 1 or 0/],
    ["overwrite without export", { UAT_EVIDENCE_OVERWRITE: "1" }, /no effect without UAT_EVIDENCE_EXPORT/],
    ["a phase without export", { UAT_EVIDENCE_PHASE: "after" }, /no effect without UAT_EVIDENCE_EXPORT/],
    ["the retired UAT_E05_PHASE", { UAT_E05_PHASE: "after" }, /no longer used/],
    ["export under CI", { CI: "true", UAT_EVIDENCE_EXPORT: "e05", UAT_EVIDENCE_PHASE: "after" }, /CI is set/],
  ];
  for (const [label, env, message] of invalid) {
    test(`rejects ${label} with a clear message`, () => {
      expect(() => exportSettings(env, tempDir("uat"))).toThrow(message);
    });
  }

  test("a CI run without export is a normal routine run", () => {
    expect(exportSettings({ CI: "true" }).findings.size).toBe(0);
  });
});

test.describe("UAT evidence export writes", () => {
  const exportTo = (dir: string, env: Record<string, string>): ExportSettings => exportSettings(env, dir);

  test("enabled: writes the e05 file for the selected phase into the evidence folder", () => {
    const dir = tempDir("uat");
    for (const phase of ["before", "after"] as const) {
      const settings = exportTo(dir, { UAT_EVIDENCE_EXPORT: "e05", UAT_EVIDENCE_PHASE: phase });
      const name = evidenceName("e05", "01-desktop-normal-motion", "png", settings.phase);
      expect(exportEvidence("e05", name, png, settings)).toBe(path.join(dir, `uat-e05-${phase}-01-desktop-normal-motion.png`));
    }
    expect(readdirSync(dir).sort()).toEqual(["uat-e05-after-01-desktop-normal-motion.png", "uat-e05-before-01-desktop-normal-motion.png"]);
  });

  test("existing evidence is preserved without overwrite authorisation (hash unchanged)", () => {
    const dir = tempDir("uat");
    const file = path.join(dir, "uat-e05-after-03-desktop-reduced-motion.png");
    writeFileSync(file, "reviewed evidence");
    const before = sha(file);
    const settings = exportTo(dir, { UAT_EVIDENCE_EXPORT: "e05", UAT_EVIDENCE_PHASE: "after" });
    expect(() => exportEvidence("e05", "uat-e05-after-03-desktop-reduced-motion.png", png, settings)).toThrow(/refusing to overwrite/);
    expect(sha(file)).toBe(before);
  });

  test("explicit overwrite authorisation replaces the existing file", () => {
    const dir = tempDir("uat");
    const file = path.join(dir, "uat-e05-after-03-desktop-reduced-motion.png");
    writeFileSync(file, "reviewed evidence");
    const settings = exportTo(dir, { UAT_EVIDENCE_EXPORT: "e05", UAT_EVIDENCE_PHASE: "after", UAT_EVIDENCE_OVERWRITE: "1" });
    exportEvidence("e05", "uat-e05-after-03-desktop-reduced-motion.png", png, settings);
    expect(readFileSync(file)).toEqual(png);
  });

  test("the same name twice in one export is a collision, not a silent overwrite", () => {
    const dir = tempDir("uat");
    const settings = exportTo(dir, { UAT_EVIDENCE_EXPORT: "e04" });
    exportEvidence("e04", "uat-e04-e2e-01-dashboard-current.png", png, settings);
    expect(() => exportEvidence("e04", "uat-e04-e2e-01-dashboard-current.png", Buffer.from("other"), settings)).toThrow(/refusing to overwrite/);
    expect(readFileSync(path.join(dir, "uat-e04-e2e-01-dashboard-current.png"))).toEqual(png);
  });

  test("exporting one finding cannot write another finding's evidence or an unexpected file name", () => {
    const dir = tempDir("uat");
    const settings = exportTo(dir, { UAT_EVIDENCE_EXPORT: "e05", UAT_EVIDENCE_PHASE: "after" });
    expect(exportEvidence("e01", "uat-e01-e2e-01-borrower.png", png, settings)).toBeNull();   // e01 not selected
    expect(() => exportEvidence("e05", "uat-e01-e2e-01-borrower.png", png, settings)).toThrow(/not a e05 evidence file name/);
    expect(() => exportEvidence("e05", "../uat-e05-after-escape.png", png, settings)).toThrow(/not a e05 evidence file name/);
    expect(readdirSync(dir)).toEqual([]);
  });

  test("evidence names keep the existing conventions", () => {
    expect(evidenceName("e01", "03-custodian-queue", "png")).toBe("uat-e01-e2e-03-custodian-queue.png");
    expect(evidenceName("e05", "02-mobile-normal-motion", "png", "before")).toBe("uat-e05-before-02-mobile-normal-motion.png");
    expect(evidenceName("e05", "recording-reduced-motion", "webm", "after")).toBe("uat-e05-after-recording-reduced-motion.webm");
    expect(evidenceName("e05", "01-desktop-normal-motion", "png")).toBe("uat-e05-01-desktop-normal-motion.png");   // routine copy
  });
});

test.describe("UAT evidence: routine screenshots stay in Playwright output", () => {
  test.describe.configure({ mode: "serial" });
  const written: string[] = [];

  for (const motion of ["no-preference", "reduce"] as const) {
    test(`${motion}: the screenshot is saved in this test's output folder and attached, not in the UAT folder`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: motion });
      await page.setContent(`<h1>Synthetic ${motion} screen</h1>`);
      const uatBefore = readdirSync(EVIDENCE_DIR).length;
      const local = await captureEvidence(page, testInfo, "e05", "probe-same-name", { settings: exportSettings(ROUTINE) });
      expect(local).toBe(testInfo.outputPath("uat-e05-probe-same-name.png"));
      expect(local.startsWith(testInfo.outputDir)).toBe(true);
      expect(existsSync(local)).toBe(true);
      // attach() copies the file into the report's attachment store, so compare the attached bytes, not the path.
      const attached = testInfo.attachments.find((item) => item.name === "probe-same-name");
      expect(attached?.contentType).toBe("image/png");
      expect(readFileSync(attached!.path!)).toEqual(readFileSync(local));
      expect(existsSync(path.join(EVIDENCE_DIR, "uat-e05-probe-same-name.png"))).toBe(false);
      expect(readdirSync(EVIDENCE_DIR).length).toBe(uatBefore);
      written.push(local);
    });
  }

  test("the same screenshot name in two tests lands in two distinct test-scoped files", () => {
    expect(written).toHaveLength(2);
    expect(new Set(written).size).toBe(2);
    for (const file of written) expect(existsSync(file)).toBe(true);
  });
});
