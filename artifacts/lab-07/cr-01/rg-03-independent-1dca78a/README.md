# RG-03: independent integrated verification (yiiipunn)

Verifier: yiiipunn (independent production verifier, frontend). Prepared with AI assistance (Anthropic Claude ran the commands and collected the logs under my direction). All results come from the logs in `logs/`.

| Item | Value |
| --- | --- |
| Tested integration SHA | `1dca78a5e7735c784f01135c8c0bf7b57a8fb542` (`origin/sprint-1-staging`: merges of #88 `e92512a`, #89 `b30fa9f`, #92 `bccee09`, #90 `1dca78a`) |
| Checkout | Isolated worktree `D:\SWE_Project\kitloop-rg03-1dca78a` (detached, LF, clean) |
| Window | 2026-11-27 23:55 – 2026-11-28 00:19 ICT |
| Environment | Windows 11, Node v24.19.0, npm 11.3.0, PostgreSQL 17.11 (Docker `kitloop-review-pg88`, 127.0.0.1:55432), Playwright 1.64.1 Chromium. Fresh databases. Synthetic data only. |
| Scope | **Local** verification. Not production evidence. |

## Results
| Check | Command (cwd) | Result | Log |
| --- | --- | --- | --- |
| Frontend regression ×3 | `npx vitest run --reporter=verbose` (`client/`) | **105/105 ×3** (12 files) | `logs/10-frontend-full-run{1,2,3}.txt` |
| Frontend lint / TypeScript / build | `npm run lint`; `npx tsc -b`; `npm run build` | 0 / 0 / 0 | `logs/11-*` |
| Backend regression + build | `npx vitest run --reporter=verbose`; `npm run build` (`server/`, fresh `kitloop_rg03_test`) | **152/152** (17 files); build 0 | `logs/12-*` |
| Playwright e2e, preserved Sprint 1 behaviour (quota **off**, lifecycle on, per `e2e/playwright.config.ts`) | `npm run test:e2e:guarded` (`e2e/`) | **93 passed, 2 skipped, 0 failed**. Evidence guard PASS. | `logs/13-e2e-guarded.txt` |
| Real-API rehearsal of RG-05.E3–E9, auto-decline and the Release 1 disabled contract | `node scripts/rg05-local-rehearsal.cjs` | **10/10 PASS** | `logs/21-*` |
| Real-API browser, full borrower flow (no interception) | `node scripts/fullstack.cjs` | **10/10 PASS** | `logs/22-*`, `screenshots/fullstack-*` |
| Real-API browser, R05 stale-quota and C02 accessible name | `node scripts/r05-c02-realapi.cjs fixed` | **PASS**. 0 POSTs while the route-entry refresh was pending; name "Checking your borrowing limit: …" | `logs/23-*`, `screenshots/fixed-*` |

Skips: the 2 e2e skips are `08-landing-animation.spec.ts:262` "record 12 s of the landing page", which runs only with `UAT_EVIDENCE_EXPORT=e05` (annotation at line 260). They are justified and by design.

The real-API runs used two instances of the `1dca78a` build on the same database. `:3000` had `BORROWING_QUOTA=enabled` and `REQUEST_LIFECYCLE_WRITES=enabled`; `:3001` had both `disabled` (the Release 1 configuration). The R05 check delays delivery of the **real** quota response; it doesn't mock it. Final database state is in `logs/24-*`.

## STS active cases (19) at `1dca78a`
| TC | AC | Covered by (all PASS in this run) | Level |
| --- | --- | --- | --- |
| TC01 | AC01 | `borrowing-quota.test.ts` "TC01–TC03"; browser A1/A2 | I, E |
| TC02 | AC02 | "TC01–TC03"; browser A2/A3 | I, E |
| TC03 | AC03 | "TC01–TC03" (no writes); rehearsal E4; browser A5 | I, E |
| TC05 | AC05 | "TC05/TC13/TC14: checkout…"; rehearsal E7 | I |
| TC06 | AC06 | "TC06/TC12" (terminal and returned excluded) | I |
| TC07 | AC07 | "TC07/TC16" (P ≥ 3 history) | I |
| TC08 | AC08 | "TC08a" ×2 (P=0 ×3, P=1 ×2 races); "TC08b–d" ×4 (injected retry and exhaustion) | I |
| TC09 | AC09 | "TC09/TC10"; rehearsal E9 | I |
| TC10 | AC10 | "TC09/TC10"; frontend Q16; browser B1 (isolation, `?borrowerId` → 400) | I, K, E |
| TC11 | AC11 | Frontend Q01–Q10, the 409-refresh and catalog-error tests, R05, C02; browser A1–A4 and R05/C02 | K, E |
| TC12 | AC12 | "TC06/TC12" (reconnect); frontend Q14; browser A8 (reload) | I, K, E |
| TC13 | AC13 | "TC05/TC13/TC14: cancel"; rehearsal E5; browser A6/A7 | I, E |
| TC14 | AC14 | "TC05/TC13/TC14: decline / auto-decline"; rehearsal E6 and auto-decline | I |
| TC16 | AC16 | "TC07/TC16" | I |
| TC17 | AC17 | "TC17"; rehearsal E6 (unassigned custodian 404); browser B1 (foreign cancel 404) | I, E |
| TC18 | AC18 | Frontend Q11–Q13, R05; browser A6 | K, E |
| TC19 | AC19 | "TC19" (flag and lifecycle coupling); frontend Q15 ×2; Release 1 rehearsal | U, I, K |
| TC20 | AC20 | "TC20" ×5 (submission racing checkout, cancel, decline and auto-decline) | I |
| TC21 | AC21 | "TC21" ×2 (3 and 5 active loans); rehearsal E8 | I |

19/19 active cases are covered and passing at `1dca78a`. TC04 (superseded) and TC15 (deferred) are inactive.

## Gaps that keep RG-03 open
1. **CI on the release SHA.** "Build, test and Docker smoke" runs only on pull requests. No run exists for `1dca78a` itself; the latest is on PR #90's merge ref. It has to come from the staging → `main` release PR (not yet opened).
2. **STS-named Playwright spec missing.** `e2e/tests/09-borrowing-quota.spec.ts` (STS TC11, TC12, TC18 "E" level) does not exist. The E-level behaviour was verified here with reviewer scripts against the real API, but there is no committed spec. Either the team accepts this record as the E-level evidence, or the spec is added.
3. **Backend and infrastructure confirmation by DEV4952.** RG-03 is "Both": DEV4952's backend/infra run on the release SHA is still needed.
4. The e2e suite runs with the quota **off** (impact analysis §14.4: specs 04–06 would be blocked at P = 2). That is correct as a preserved-behaviour regression, but it is not quota-on e2e coverage.

**Local RG-03 verdict (yiiipunn part): PASS at `1dca78a`.** Gaps 1–3 must close before RG-03 is complete.
