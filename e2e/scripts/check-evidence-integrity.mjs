#!/usr/bin/env node
// Runs Playwright and proves the run left the committed UAT evidence untouched (PR #76 review, P2).
//
//   node scripts/check-evidence-integrity.mjs [playwright test arguments...]
//   npm run test:e2e:guarded -- tests/08-landing-animation.spec.ts
//
// Before the run it records a SHA-256 of every file under artifacts/sprint-1/uat/ (tracked and untracked) and
// `git status --porcelain` for that folder; after the run it compares both. Any added, modified or removed file fails
// the check (exit 3), even when the tests passed. It never restores or deletes anything: the runner itself must avoid
// writing evidence. Do not use it together with UAT_EVIDENCE_EXPORT (an export is expected to add files).
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(E2E_DIR, "..");
const EVIDENCE = path.join(REPO_ROOT, "artifacts", "sprint-1", "uat");
const RELATIVE = path.relative(REPO_ROOT, EVIDENCE).split(path.sep).join("/");

function snapshot() {
  const files = new Map();
  if (existsSync(EVIDENCE)) {
    for (const name of readdirSync(EVIDENCE)) {
      const file = path.join(EVIDENCE, name);
      if (statSync(file).isFile()) files.set(name, createHash("sha256").update(readFileSync(file)).digest("hex"));
    }
  }
  const git = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", RELATIVE], { cwd: REPO_ROOT, encoding: "utf8" });
  if (git.status !== 0) throw new Error(`git status failed: ${git.stderr}`);
  return { files, git: git.stdout.trim() };
}

if (process.env.UAT_EVIDENCE_EXPORT && !/^(0|off|false|no)?$/i.test(process.env.UAT_EVIDENCE_EXPORT.trim())) {
  console.error("check-evidence-integrity: UAT_EVIDENCE_EXPORT is set; an export is expected to add files. Unset it for a routine run.");
  process.exit(2);
}

const before = snapshot();
console.log(`evidence guard: ${before.files.size} files under ${RELATIVE} hashed before the run`);
const run = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], { cwd: E2E_DIR, stdio: "inherit", shell: process.platform === "win32" });
const after = snapshot();

const added = [...after.files.keys()].filter((name) => !before.files.has(name));
const removed = [...before.files.keys()].filter((name) => !after.files.has(name));
const modified = [...after.files.keys()].filter((name) => before.files.has(name) && before.files.get(name) !== after.files.get(name));
console.log(`evidence guard: ${after.files.size} files after the run; added ${added.length}, modified ${modified.length}, removed ${removed.length}`);
for (const [label, list] of [["added", added], ["modified", modified], ["removed", removed]]) for (const name of list) console.log(`  ${label}: ${RELATIVE}/${name}`);
if (after.git !== before.git) console.log(`evidence guard: git status for ${RELATIVE} changed\n--- before\n${before.git || "(clean)"}\n--- after\n${after.git || "(clean)"}`);

const mutated = added.length + modified.length + removed.length > 0 || after.git !== before.git;
if (mutated) {
  console.error("evidence guard: FAIL, the run changed committed UAT evidence");
  process.exit(3);
}
console.log("evidence guard: PASS, UAT evidence unchanged (hashes and git status identical)");
process.exit(run.status ?? 1);
