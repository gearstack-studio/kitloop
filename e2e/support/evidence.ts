import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { REPO_ROOT } from "./env";

/**
 * Lab 6 UAT evidence (PR #76 review, P2).
 *
 * Routine runs: every screenshot is written to the current test's Playwright output directory
 * (`testInfo.outputPath`, under the git-ignored test-results/) and attached to the HTML report. Nothing is written
 * under artifacts/sprint-1/uat/.
 *
 * Export is a deliberate local step, enabled per finding:
 *   UAT_EVIDENCE_EXPORT=e05 UAT_EVIDENCE_PHASE=after npx playwright test tests/08-landing-animation.spec.ts
 * - UAT_EVIDENCE_EXPORT   comma-separated findings to export (e01..e05); unset, empty, 0, off, false or no = none.
 * - UAT_EVIDENCE_PHASE    before | after. Required for e05 (its files are named per phase); rejected for the others.
 * - UAT_EVIDENCE_OVERWRITE 1 | 0 (default 0). Without it an existing evidence file is never replaced: files are
 *   created with an exclusive write, and an existing name fails the test with a clear message.
 * Any other value fails the run before a test starts. Export is refused when CI is set.
 */
export const EVIDENCE_DIR = path.join(REPO_ROOT, "artifacts", "sprint-1", "uat");
export const FINDINGS = ["e01", "e02", "e03", "e04", "e05"] as const;
export type Finding = (typeof FINDINGS)[number];
export type Phase = "before" | "after";
export type ExportSettings = { findings: ReadonlySet<Finding>; phase: Phase | null; overwrite: boolean; dir: string };

const OFF = /^(|0|off|false|no)$/;
const ON = /^(1|on|true|yes)$/;
const fail = (message: string) => new Error(`UAT evidence export: ${message} (see e2e/README.md, "UAT evidence export")`);

/** Parses and validates the export settings. Pure: takes the environment so it can be tested. */
export function exportSettings(env: Record<string, string | undefined>, dir = EVIDENCE_DIR): ExportSettings {
  if (env.UAT_E05_PHASE !== undefined) {
    throw fail("UAT_E05_PHASE is no longer used; export deliberately with UAT_EVIDENCE_EXPORT=e05 UAT_EVIDENCE_PHASE=before|after");
  }
  const requested = (env.UAT_EVIDENCE_EXPORT ?? "").trim().toLowerCase();
  const phase = (env.UAT_EVIDENCE_PHASE ?? "").trim().toLowerCase();
  const overwrite = (env.UAT_EVIDENCE_OVERWRITE ?? "").trim().toLowerCase();
  if (OFF.test(requested)) {
    if (phase || overwrite) throw fail("UAT_EVIDENCE_PHASE / UAT_EVIDENCE_OVERWRITE have no effect without UAT_EVIDENCE_EXPORT");
    return { findings: new Set(), phase: null, overwrite: false, dir };
  }
  const findings = requested.split(",").map((item) => item.trim());
  const unknown = findings.filter((item) => !(FINDINGS as readonly string[]).includes(item));
  if (unknown.length) throw fail(`UAT_EVIDENCE_EXPORT has unknown value(s) ${JSON.stringify(unknown)}; accepted: ${FINDINGS.join(", ")} (comma-separated), or 0/off to disable`);
  if (env.CI && !OFF.test(env.CI.trim().toLowerCase())) throw fail("refusing to export evidence when CI is set; export is a deliberate local step");
  if (!OFF.test(overwrite) && !ON.test(overwrite)) throw fail(`UAT_EVIDENCE_OVERWRITE must be 1 or 0, got ${JSON.stringify(env.UAT_EVIDENCE_OVERWRITE)}`);
  const needsPhase = findings.includes("e05");
  if (needsPhase && phase !== "before" && phase !== "after") throw fail("exporting e05 requires UAT_EVIDENCE_PHASE=before or after");
  if (!needsPhase && phase) throw fail("UAT_EVIDENCE_PHASE applies only to e05");
  return { findings: new Set(findings as Finding[]), phase: needsPhase ? (phase as Phase) : null, overwrite: ON.test(overwrite), dir };
}

/** The settings of this run, validated when a spec loads, so a bad value fails before any test starts. */
export const EXPORT = exportSettings(process.env);
export const exporting = (finding: Finding, settings: ExportSettings = EXPORT) => settings.findings.has(finding);

/**
 * Writes one evidence file into the UAT folder if (and only if) its finding is being exported. Returns the path
 * written, or null. Never replaces an existing file unless overwrite was authorised. The name must belong to the
 * finding, so exporting one finding cannot touch another finding's evidence.
 */
export function exportEvidence(finding: Finding, fileName: string, data: Buffer, settings: ExportSettings = EXPORT): string | null {
  if (!settings.findings.has(finding)) return null;
  if (!new RegExp(`^uat-${finding}-[a-z0-9][a-z0-9-]*\\.(png|webm)$`).test(fileName)) throw fail(`${fileName} is not a ${finding} evidence file name`);
  mkdirSync(settings.dir, { recursive: true });
  const target = path.join(settings.dir, fileName);
  try {
    writeFileSync(target, data, { flag: settings.overwrite ? "w" : "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw fail(`refusing to overwrite existing evidence ${path.relative(REPO_ROOT, target)}; set UAT_EVIDENCE_OVERWRITE=1 to replace reviewed evidence deliberately`);
    }
    throw error;
  }
  return target;
}

/** Evidence file name: e01-e04 keep "uat-eNN-e2e-<name>"; e05 is "uat-e05-<phase>-<name>" when exported. */
export function evidenceName(finding: Finding, name: string, extension: "png" | "webm", phase: Phase | null = null) {
  return finding === "e05" ? `uat-e05-${phase ? `${phase}-` : ""}${name}.${extension}` : `uat-${finding}-e2e-${name}.${extension}`;
}

/**
 * Screenshot for a test step: saved in this test's output directory and attached to the report (routine), and also
 * copied to the UAT folder when its finding is being exported. Returns the test-scoped path.
 */
export async function captureEvidence(page: Page, testInfo: TestInfo, finding: Finding, name: string,
  { fullPage = true, settings = EXPORT }: { fullPage?: boolean; settings?: ExportSettings } = {}) {
  const body = await page.screenshot({ fullPage });
  const local = testInfo.outputPath(evidenceName(finding, name, "png"));
  mkdirSync(path.dirname(local), { recursive: true });
  writeFileSync(local, body);
  await testInfo.attach(name, { path: local, contentType: "image/png" });
  exportEvidence(finding, evidenceName(finding, name, "png", settings.phase), body, settings);
  return local;
}
