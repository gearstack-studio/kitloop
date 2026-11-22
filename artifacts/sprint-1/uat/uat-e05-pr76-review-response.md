## Response to review: P2, routine E2E runs overwrite committed UAT evidence

Thanks, @DEV4952. Confirmed and fixed. The problem was wider than spec 08: specs 04 to 08 (UAT-E01 to E05) all wrote their screenshots into `artifacts/sprint-1/uat/` on every run, and spec 08 also defaulted to the `after` phase and always saved two `.webm` recordings there.

**RED** (isolated worktree at `5b12506`, no flags, new hash guard):
- **Spec 08 alone:** 14/14 tests passed, but 4 committed `uat-e05-after-*.png` files changed and 2 `.webm` files were added.
- **Full suite:** 36 tracked screenshots changed across e01 to e05.

**Fix:**
- **Routine runs:**
  - Screenshots go to the test's own Playwright output folder (`testInfo.outputPath`) and are attached to the report, so names never collide across tests.
  - The evidence-only recordings are skipped.
  - Nothing is written under `artifacts/sprint-1/uat/`.
- **Opt-in export** (`e2e/support/evidence.ts`): `UAT_EVIDENCE_EXPORT=e05 UAT_EVIDENCE_PHASE=after npx playwright test tests/08-landing-animation.spec.ts`.
  - Values are validated, so a bad value stops the run before any test.
  - The phase is required for e05; nothing defaults to `after`.
  - Export is refused under `CI`.
  - Files are created exclusively, so existing evidence is never replaced without `UAT_EVIDENCE_OVERWRITE=1`, and one finding's export cannot write another finding's files.
- **Recordings:** they write to the test output folder, and the context is closed in `finally`.
- **Guard:** `npm run test:e2e:guarded` fails the run if any file in the evidence folder is added, changed or removed, or its `git status` changes. It never restores anything.

**GREEN:**
- **Helper regression spec:** 28/28.
- **Spec 08 routine, guarded:** 12 passed, 2 skipped; guard unchanged. Same with `CI=1`.
- **Full E2E, guarded:** 93 passed, 2 skipped; guard unchanged.
- **Evidence hashes:** SHA-256 of all 85 evidence files identical before and after.
- **Export checks** (isolated worktree):
  - an invalid value stops the run;
  - without authorisation, the 4 existing PNGs are refused with their hashes unchanged;
  - with `UAT_EVIDENCE_OVERWRITE=1`, all 6 files are written.
- **Client and server:** client 80/80, server 129/129; lint, builds and typechecks are clean.

Two existing UAT tests were made more robust; no assertion was removed:
- the spec 08 pop-in sampler now uses frame-interval-aware limits, stricter at 60 fps, and I re-checked that it still fails on the original #65 animation;
- spec 07 now polls past a 150 ms colour transition instead of sampling mid-transition.

No landing-page production code changed. Details are in `uat-e05-lab6-report.md` §12, `uat-e05-pr76-red.txt` and `uat-e05-pr76-green.txt`.

#65 stays open for Team 7's retest of both motion modes on the original laptops.
