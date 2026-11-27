# CR-01 follow-up #91: R05 route-entry quota invalidation and C02 loading-state name

Recorded 2026-11-27 ICT by yiiipunn, with AI assistance (Anthropic Claude ran the commands and collected the logs under my direction). All results come from the runs in `logs/`. ANSI colour codes were stripped; the logs are otherwise verbatim.

## Commits (branch `fix/91-quota-route-entry-a11y`, base `origin/sprint-1-staging` = `b30fa9f`, which includes merged PR #89)
| Commit | Content |
| --- | --- |
| `e4eaa7f` | test: adds R05 and C02 to `client/tests/borrowing-quota.test.tsx`. The only other change adds `fireEvent` to an existing import. No existing test changed. |
| `29f80e5` | fix: first version. The R05 invalidation was in an effect, which fails ESLint `react-hooks/set-state-in-effect`; the commit was made by mistake despite the lint error. It also contains the C02 accessible-name fix. |
| `3a44570` | fix: corrects R05 to invalidate during render, in the same render that enters `/requests`. Lint is clean. This is the tested head. |

Net change against `b30fa9f`: `client/src/App.tsx` +7, `client/src/components/Catalog.tsx` +1/−1, `client/tests/borrowing-quota.test.tsx` +33/−1. The session epoch guard (`if (epoch === sessionEpoch.current) setError(...)`) is unchanged. `server/` is identical to `b30fa9f`.

## RED and GREEN
| Run | Source | Result | Log |
| --- | --- | --- | --- |
| RED | `b30fa9f` application + the test file later committed as `e4eaa7f` (identical bytes) | **2 failed, 23 passed (25)**. R05: selector and Submit enabled during the route-entry re-read, and **1 POST sent** (0 expected). C02: no control named "Checking your borrowing limit: …". | `logs/01-red.txt` |
| GREEN | `3a44570` | **25/25** | `logs/03-green.txt` |
| Pre-commit GREEN runs | working tree before `29f80e5` and before `3a44570` | 25/25 each | `logs/02-*`, `logs/02b-*` |

## Regression at `3a44570` (isolated worktree, LF checkout)
| Check | Result | Log |
| --- | --- | --- |
| Frontend ×3 | 105/105, 105/105, 105/105 (12 files; 103 previous + 2 new) | `logs/04-frontend-full-run{1,2,3}.txt` |
| Lint / typecheck (`tsc -b`) / build | Pass / pass / pass | `logs/05-*` |
| Backend (isolated PostgreSQL 17.11, fresh DB) | 152/152 (17 files); build passes | `logs/06b-backend-regression.txt` |
| Backend first attempt | Setup error: the Prisma client was not generated in the fresh worktree. Not a code failure; rerun as 06b. | `logs/06a-*` |

## Real-API browser verification (real API + PostgreSQL, Playwright Chromium)
- API: `server/` of `3a44570` (identical to `b30fa9f`) on `:3000`, with quota and lifecycle writes enabled and the database `kitloop_91_e2e_test`.
- Frontend: Vite on `:5173`, serving the pre-fix client (`b30fa9f`) and then the fixed client (`3a44570`).
- R05/C02 script `scripts/r05-c02-realapi.cjs`: the **only** interception is on `GET /api/borrowing-quota`. The request goes to the real API immediately (`route.fetch`), and the **real** response is delivered unchanged after a hold. Nothing is mocked.
- Full borrower flow `scripts/fullstack.cjs`: no interception at all.

| Scenario | Pre-fix `b30fa9f` | Fixed `3a44570` |
| --- | --- | --- |
| R05: server at P = 2 after another session used the last slot; page entered My requests holding P = 1; route-entry re-read pending | Panel still showed "1 of 2 … You can submit 1 more request". Selector and Submit **enabled**. **1 stale POST sent → real 409 `BORROWING_QUOTA_EXCEEDED`.** | "Loading borrowing limit…". Selector and Submit **disabled**. **0 POSTs** while pending and after. Fresh 2 of 2 keeps Submit disabled. |
| R05 persisted rows (both runs) | Camera rows: 0 (backend rejected) | Camera rows: 0 |
| C02: catalog control while the initial quota read is pending | Accessible name "Checking limit: Camera, E2E-CAM-01 cannot be requested yet" | Accessible name "Checking your borrowing limit: Camera, E2E-CAM-01 cannot be requested yet". Visible text "Checking limit" unchanged. |
| Full borrower flow (submit 2, limit, backend 409, cancel, recover, reload, isolation) | — | **10/10 PASS** |

Logs: `logs/12-realapi-prefix.txt`, `logs/14-realapi-fixed.txt`, `logs/15-fullstack-fixed.txt`, `logs/16-db-final-state.txt`. Screenshots and result JSON are in `screenshots/`.

Synthetic data only. No production system was used. The production quota stays disabled.
