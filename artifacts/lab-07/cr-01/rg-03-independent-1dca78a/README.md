# RG-03: independent integrated verification (yiiipunn)

Verifier: yiiipunn (independent production verifier, frontend). Prepared with AI assistance (Anthropic Claude ran the commands and collected the logs under my direction). All results come from the logs in this folder. **Local verification only; not production evidence.**

| Item | Value |
| --- | --- |
| Tested integration SHA | `1dca78a5e7735c784f01135c8c0bf7b57a8fb542` (`origin/sprint-1-staging`: merges of #88 `e92512a`, #89 `b30fa9f`, #92 `bccee09`, #90 `1dca78a`) |
| Original run | 2026-11-27 23:55 – 2026-11-28 00:19 ICT, isolated worktree at `1dca78a` (`logs/`, `screenshots/`, unchanged) |
| Review-correction run (PR #93 review) | 2026-11-28 00:49 – 00:56 ICT, a **different checkout** at PR head `8ab8ca6`, whose `server/`, `client/` and `e2e/` trees are identical to `1dca78a` (`verification-2026-11-28/`) |
| Environment | Windows 11, Node v24.19.0, npm 11.3.0, PostgreSQL 17.11 (Docker, 127.0.0.1:55432), Playwright 1.64.1 Chromium. Fresh dedicated databases, synthetic data only. |

## Results of the original run (unchanged)
| Check | Command (cwd) | Result | Log |
| --- | --- | --- | --- |
| Frontend regression ×3 | `npx vitest run --reporter=verbose` (`client/`) | **105/105 ×3** (12 files) | `logs/10-frontend-full-run{1,2,3}.txt` |
| Frontend lint / TypeScript / build | `npm run lint`; `npx tsc -b`; `npm run build` | 0 / 0 / 0 | `logs/11-*` |
| Backend regression + build | `npx vitest run --reporter=verbose`; `npm run build` (`server/`) | **152/152** (17 files); build 0 | `logs/12-*` |
| Playwright e2e, preserved Sprint 1 behaviour (quota **off**, lifecycle on) | `npm run test:e2e:guarded` (`e2e/`) | **93 passed, 2 skipped, 0 failed**. Evidence guard PASS. | `logs/13-e2e-guarded.txt` |
| Real-API rehearsal: RG-05.E3–E9, auto-decline, Release 1 disabled contract | `rg05-local-rehearsal.cjs` | **10/10 PASS** | `logs/21-*` |
| Real-API browser, full borrower flow (no interception) | `fullstack.cjs` | **10/10 PASS** | `logs/22-*`, `screenshots/fullstack-*` |
| Real-API browser, R05 stale quota and C02 accessible name | `r05-c02-realapi.cjs fixed` | **PASS** | `logs/23-*`, `screenshots/fixed-*` |

Justified skips: the 2 e2e skips are `08-landing-animation.spec.ts:262` "record 12 s of the landing page", evidence-only recordings that run only with `UAT_EVIDENCE_EXPORT=e05`.

## Review-correction run (2026-11-28)
| Check | Result | Log |
| --- | --- | --- |
| STS variant probe (`tc-variant-probe.mts`; in-process app, quota and lifecycle enabled, DB `kitloop_rg03_variants_test`) | **38/38 PASS** | `verification-2026-11-28/01-tc-variant-probe.txt` |
| Database safety guards (remote host, wrong and non-`kitloop_rg03_*` names) | 4/4 refused before connecting; no credentials written | `verification-2026-11-28/02-*` |
| Fixture at the portable path, `git check-ignore` | Seeded; check-ignore exit 0; file absent from `git status` | `verification-2026-11-28/03-*` |
| All runners from the repository root of the different checkout | Rehearsal 10/10; browser flow 10/10; R05/C02 PASS; **TC11 S6 stale 409 PASS** | `verification-2026-11-28/04-*`, `tc11-s6-*` |
| Cleanup and historical integrity | Credentials removed; 30 historical logs and screenshots byte-identical | `verification-2026-11-28/05-*` |

## STS active cases at variant level (source `1dca78a`)
Evidence keys: **B** = `server/tests/borrowing-quota.test.ts` (in `logs/12`); **BR** = other backend suites (in `logs/12`); **F** = `client/tests/borrowing-quota.test.tsx` (in `logs/10`); **V** = variant probe (`verification-2026-11-28/01`); **R** = real-API rehearsal (`logs/21`); **W** = real-API browser (`logs/22`, `logs/23`, `verification-2026-11-28/04`).

| TC | AC | Required variant | Executed assertion | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| TC01 | AC01 | U: `remaining(P)`, `canSubmit(P)` for P = 0…5 | No unit test exists. API-level grid P = 0…5 asserted exactly. | V | **PARTIAL** |
| TC01 | AC01 | I: GET {0,2,2,true} → POST 201 PENDING (session borrower) → GET {1,2,1,true}; 4 keys; `no-store`; no loan; asset available | Exactly as specified | V; W A1–A2 | Verified |
| TC01 | AC01 | Variant with loans(B1, 3) | 3 and 5 active loans, P = 0 → submits accepted | B "TC21" | Verified |
| TC02 | AC02 | P = 1 → 201 → {2,2,0,false}; exactly one new row | After recovery P = 1 → 201 → quota 2; rows = 2 | B "TC05/TC13/TC14", "TC08a", "TC21" | Verified |
| TC03 | AC03 | P = 2; POST ×3 → 409 quota, no `fields`, snapshot unchanged, A3 available; quota {2} | 3 blocked attempts with rows and loans unchanged, no `fields`, catalog available; quota {2} at P = 2 | B "TC01–TC03", "TC17"; V TC09 P = 2 | Verified |
| TC05 | AC05 | Checkout R1 at P = 2 → {1} → POST 201; R1 CHECKED_OUT, one loan, R2 PENDING | As specified | B "TC05…: checkout"; R E7 | Verified |
| TC05 | AC05 | Negatives at P = 2: past `dueAt` 400; mismatch 409 `REQUEST_MISMATCH`; P stays 2; no writes | As specified | V | Verified |
| TC06 | AC06 | 1 PENDING + CHECKED_OUT/DECLINED/CANCELLED/EXPIRED + active and returned loans; GET {1}; POST 201; POST 409; terminal and loan rows unchanged | As specified | V (B "TC06/TC12" partial) | Verified |
| TC07 | AC07 | pending(3) direct; GET {3}; POST 409; checkout → 201; GET {2}; nothing deleted | As specified | V; B "TC07/TC16" | Verified |
| TC08 | AC08 | a: 20 × (P=1, 2 parallel), 10 × (P=0, 3 parallel); b–d injected failures | All four parameterisations and 4 injection cases; never 500; final P = 2 | B "TC08a" ×2, "TC08b–d" ×4 | Verified (CONFLICT share is printed, not asserted) |
| TC09 | AC09 | Every AC09 row at P = 0: on-loan and retired 409 `ASSET_UNAVAILABLE`; unknown 404; malformed and extra 400 `VALIDATION_ERROR` (`fields.assetId`); invalid JSON 400 `INVALID_JSON`; >16 KB 413; POST and GET 401; custodian POST and GET 403 `FORBIDDEN`; missing CSRF 403 `INVALID_CSRF`; foreign Origin 403 `FORBIDDEN_ORIGIN`; no writes; quota unchanged | All 13 rows with codes; snapshot and quota unchanged | V (BR `borrow-requests.test.ts` covers part at P = 0 without codes) | Verified |
| TC09 | AC09 | Same rows at P = 2 | All 13 rows with codes; snapshot and quota unchanged | V; B "TC09/TC10" (4 rows) | Verified |
| TC09 | AC09 | Duplicate → 409 `DUPLICATE_REQUEST` | At P = 1 (impossible at P = 0) and at P = 2 | V; B "TC09/TC10" | Verified |
| TC10 | AC10 | B2 requests B1's asset 201; quotas {2} and {1}; `?borrowerId` and `?x=1` 400 (`fields.query`, no figures); foreign request and loan IDs 404 ×2; 4 keys, no UUIDs, `no-store` | As specified | B "TC09/TC10"; V; F Q16; W B1 | Verified |
| TC11 | AC11 | K: S1–S10 | Q01–Q10, 409-refresh, catalog error, R05, C02 | F | Verified |
| TC11 | AC11 | E smoke S1, S2 | Real-API browser panel 0/1/2, limit reached, controls disabled | W A1–A4 | Verified (reviewer script, not spec 09) |
| TC11 | AC11 | E smoke S6 | Real stale 409 shown, no success notice, quota re-read after the POST, one POST | W `tc11-s6-stale409.cjs` | Verified (reviewer script, not spec 09) |
| TC12 | AC12 | I: 2 via API → {2}; reconnect → {2}; checkout → {1} consistent with `/requests/mine` and `/loans/mine`; direct CANCELLED → {0} | Reconnect in B; the rest as specified | B "TC06/TC12"; V | Verified |
| TC12 | AC12 | E: page reload | State persists after reload | W A8 | Verified (reviewer script, not spec 09) |
| TC13 | AC13 | P = 2: POST 409; cancel 200 CANCELLED_BY_BORROWER; {1}; POST 201; no write on first POST | As specified | B "TC05…: cancel"; R E5; W A6–A7 | Verified |
| TC14 | AC14 | S1 decline and S2 auto-decline recovery | As specified | B "TC05…: decline / auto-decline"; R E6 and auto-decline | Verified |
| TC16 | AC16 | pending(4): cancel → POST → decline → POST → checkout → POST; 200, 409, 200, 409, 201, 201; quota 3, 2, 1 | As specified | B "TC07/TC16" | Verified |
| TC17 | AC17 | 7 attempts: 404, 403, 403, 404, 403 `INVALID_CSRF`, 400, 404; quota {2} after each; POST still 409 | Statuses in B; `INVALID_CSRF` code in V | B "TC17"; V | Verified |
| TC18 | AC18 | K: S1–S3 | Q11, Q12a, Q12b, Q13 | F | Verified |
| TC18 | AC18 | E: S1 cancel → quota GET → Submit re-enabled | As specified | W A6 | Verified (reviewer script, not spec 09) |
| TC18 | AC18 | E: S2 route-entry **and** Refresh re-read | Route entry at E level (R05, 0 POSTs while pending); **Refresh only at K level** (Q12b) | W `r05-c02`; F | **PARTIAL** |
| TC19 | AC19 | U: 4 × 3 flag matrix; I: off → POST 201, GET 404 `BORROWING_QUOTA_DISABLED`; K: no call, no panel | As specified | B "TC19"; F Q15 ×2; R Release 1 | Verified |
| TC20 | AC20 | S1–S5, 10 iterations each | Checkout at P = 2 and P = 1, cancel, decline, auto-decline | B "TC20" ×5 | Verified (distribution printed) |
| TC21 | AC21 | Ba loans(3) P = 0; Bb loans(5) P = 0; Bc loans(3) + pending(1); DTO without loan fields | As specified | B "TC21" ×2; R E8 | Verified |

### Coverage summary
- **Test cases mapped:** 19 of 19 active cases (TC04 superseded, TC15 deferred).
- **Fully verified:** **17** (TC02, TC03, TC05–TC14, TC16, TC17, TC19–TC21).
- **Partially verified:** **2**:
  - TC01: the unit-level capacity grid has no unit test; the API-level grid P = 0…5 was executed.
  - TC18: the Refresh re-read is verified at K level only, not E level.
- **Missing or deferred variants:**
  1. TC01 U-level `remaining(P)` / `canSubmit(P)` unit test.
  2. TC18 S2 Refresh re-read at E level.
  3. E-level variants of TC11, TC12 and TC18 are verified by the reviewer scripts here, **not** by the STS-named `e2e/tests/09-borrowing-quota.spec.ts`, which does not exist (decision pending in #85).

**Correction note.** Commit `8ab8ca6` stated "19/19 active cases covered and passing". That mapped every case but did not establish every specified variant (PR #93 review). The counts above replace it.

## Gaps that keep RG-03 open
1. CI "Build, test and Docker smoke" on the final **release candidate** (release PR not opened).
2. DEV4952's backend and infrastructure confirmation.
3. The spec 09 decision and, if Option A is agreed, its implementation (separate PR).
4. The two partial variants above (TC01 unit grid, TC18 E-level Refresh). Each would need a separate test change, outside this evidence-only PR.

**RG-03 remains PENDING. RG-01 and RG-05 remain BLOCKED.**

## Reproduction
**Prerequisites:**
- A KitLoop checkout with `npm ci` run in `server/`, `client/` and `e2e/`, and `npx prisma generate` and `npm run build` run in `server/`.
- Playwright Chromium installed (`npm run install:browsers` in `e2e/`).
- A **local** PostgreSQL. The scripts refuse any host other than `localhost`/`127.0.0.1`, and any database not matching `^kitloop_rg03_[a-z0-9_]+$`.

**Paths:**
- The scripts find the repository from their own location; set `KITLOOP_ROOT` to override.
- Generated credentials go to `scripts/.e2e-credentials.json` (git-ignored, random per run). Runtime output goes to `reproduction-output/` (git-ignored); reproduction scripts can use another location through `RG03_OUTPUT_DIR`. Historical `logs/` and `screenshots/` are never written.

1. Create two empty databases, `kitloop_rg03_realapi_test` and `kitloop_rg03_variants_test`, and run `npx prisma migrate deploy` (in `server/`) with `DATABASE_URL` pointing at each.
2. Variant probe (in `server/`): `DATABASE_URL=<…/kitloop_rg03_variants_test> npx tsx ../artifacts/lab-07/cr-01/rg-03-independent-1dca78a/scripts/tc-variant-probe.mts`
3. Fixture (in `server/`): `DATABASE_URL=<…/kitloop_rg03_realapi_test> npx tsx ../artifacts/lab-07/cr-01/rg-03-independent-1dca78a/scripts/fixture.mts`
4. Servers on the same database. Each needs `SESSION_CSRF_SECRET` set to a random value and `APP_ORIGIN=http://localhost:5173`.
   - `node server/dist/index.js` with `PORT=3000 REQUEST_LIFECYCLE_WRITES=enabled BORROWING_QUOTA=enabled`.
   - A second instance with `PORT=3001 REQUEST_LIFECYCLE_WRITES=disabled BORROWING_QUOTA=disabled`.
   - Vite: `node client/node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort` (in `client/`).
5. From the repository root: `node <scripts>/rg05-local-rehearsal.cjs`, `node <scripts>/fullstack.cjs`, `node <scripts>/r05-c02-realapi.cjs fixed`, `node <scripts>/tc11-s6-stale409.cjs`.
6. Cleanup: `node <scripts>/cleanup.cjs` removes generated credentials and preserves output. Add `--output` to remove only the fixed default `reproduction-output/` directory. If `RG03_OUTPUT_DIR` points elsewhere, `--output` fails; remove that custom directory manually after checking its path. Then stop the servers and drop both databases.

`<scripts>` = `artifacts/lab-07/cr-01/rg-03-independent-1dca78a/scripts`.
