# CR-01 r4 backend RED/GREEN evidence

2026-11-26 ICT. Scope: [parent #78](https://github.com/gearstack-studio/kitloop/issues/78), [approved contract #79](https://github.com/gearstack-studio/kitloop/pull/79), [RED evidence #80](https://github.com/gearstack-studio/kitloop/issues/80), [implementation #81](https://github.com/gearstack-studio/kitloop/issues/81).

The backend suite was authored from the checked-in r4 STS. A published backend assertion suite for #80 was unavailable in the fetched refs. RED used the baseline server source with the same `borrowing-quota.test.ts` and Vitest configuration carried into GREEN. The assertion file SHA-256 matched across both runs (`665228414a27232d9de241eb7a015a9296662e414f3dd0398d46ec1ab8b8fa04` before final whitespace cleanup).

| Run | SHA | Result |
| --- | --- | --- |
| RED quota suite | `7a3db98725881944a4e3ef8134676ca4f5cb81ed` | 17 failed, 5 passed |
| GREEN quota suite | `e6a49070dc190286875865127aa3b2243c92c9b4` | 22 passed, 0 failed |
| Server regression | Same implementation source | 151 passed, 0 failed, 17 suites |
| TypeScript | Same implementation source | Passed |

TC21 passed in RED and GREEN. Checkout, cancel, decline and auto-decline each reduced the borrower's pending count by one and permitted another submission. The three-attempt fault-injection tests verified a normal retry loser returns `BORROWING_QUOTA_EXCEEDED` and exhaustion returns `CONFLICT` without inserting the target request.

| Concurrent submissions | Rounds | Accepted | Quota rejections | Retry exhaustion |
| --- | ---: | ---: | ---: | ---: |
| P = 1, two submissions | 20 | 20 | 20 | 0 |
| P = 0, three submissions | 10 | 20 | 10 | 0 |

The final pending count was two in all 30 rounds. Another 50 rounds raced a submission against checkout, cancel, decline or auto-decline without exceeding capacity. Outcomes below show recovery HTTP status followed by submission HTTP status.

| Recovery | Initial P | Outcomes |
| --- | ---: | --- |
| Checkout | 2 | 201/201 × 1, 201/409 × 9 |
| Checkout | 1 | 409/201 × 10 |
| Cancel | 2 | 200/409 × 10 |
| Decline | 2 | 200/409 × 10 |
| Auto-decline | 2 | 201/409 × 10 |

Run from `server/` with Node.js 24.22.3, PostgreSQL 18 and a dedicated migrated test database for each run. Use `server/.env.test.example` for the required environment values. For RED, copy the GREEN assertion file and `vitest.config.ts` into the baseline checkout and run the quota suite there.

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm test -- tests/borrowing-quota.test.ts --reporter=verbose
npm run typecheck
npm test
```

The regression fixtures use fresh borrowers and pair quota with lifecycle settings in rollout tests. The existing exact auth DTO checks retain their original fields and now also assert `borrowingQuota`.

## 2026-11-27 ICT retest after PR review

The section above preserves the original RED/GREEN record. The RED run below is a retrospective reproduction using the final suite after the retry and TC21 changes.

| Verification | Tested source | Result |
| --- | --- | --- |
| Retrospective RED | `7a3db98725881944a4e3ef8134676ca4f5cb81ed` with the final suite and Vitest configuration overlaid | 19 failed, 4 passed. The third submission returned HTTP 201 where TC03 expected 409. [Raw output](backend-final-red.txt) |
| GREEN quota suite | `970d6dc7903faccba3b35e2c8227c00d59f6db13` | 23 passed. [Raw output](backend-final-green.txt) |
| Backend regression | Same GREEN source | 152 passed across 17 suites. [Raw output](backend-final-regression.txt) |
| Backend build and HTTP process restart | Same GREEN source | Passed. The API returned P=2 across distinct process IDs, then P=1 after checkout and P=0 after cancellation. Requests and loans matched the checkout readback. [Raw output](backend-final-restart.txt) |
| Frontend regression and Docker smoke | Same GREEN PR head | [GitHub Actions passed](https://github.com/gearstack-studio/kitloop/actions/runs/45984768218/job/140457431810). The two frontend test edits wait for the signed-out pathname after the sign-in button appears, avoiding a race with the redirect effect. |

The RED and GREEN working files had identical byte-level SHA-256 values on Windows:

| File | SHA-256 |
| --- | --- |
| `server/tests/borrowing-quota.test.ts` | `6b9a0f650cb06597ff1b4a135e3a05e1356dae934883bbdc055fb3d68cf0c86a` |
| `server/vitest.config.ts` | `796f4259f0f657e8c80e222a157debebb13ef449efd324b26f0cc793e735514f` |

Run with Node.js 24.22.3 and PostgreSQL 18.7. Use synthetic fixtures and a fresh migrated database for each run. Set test environment values from `server/.env.test.example`. Run the following from `server/` after copying the two files above into the RED checkout.

```sh
npm ci --offline --no-audit --no-fund
npx --no-install prisma generate
npm run db:deploy
npm test -- tests/borrowing-quota.test.ts --reporter=verbose --no-color
# GREEN only
npm test -- --no-color
npm run build
# Point DATABASE_URL at a separate, freshly migrated local pr88_restart_test database.
node ../artifacts/lab-07/cr-01/verify-backend-restart.mjs
```

TC08a accepted exactly two requests when P=0 and exactly one when P=1 in all 30 rounds in the GREEN log. All 30 rejected requests returned `BORROWING_QUOTA_EXCEEDED`. The injected exhaustion cases still returned `CONFLICT`. An additional 150 rounds on the same implementation produced 50 rounds at P=0 with two accepts each and 100 rounds at P=1 with one accept each, with zero exhausted retries.

TC20 checkout contention remains tracked under R-04 in the [impact analysis](../../../docs/labs/lab-07/CR-01-impact-analysis.md). In this rerun the checkout operation returned 409 in 10 of 10 P=1 races and in 0 of 10 P=2 races. Submission capacity and persisted state met the existing acceptance assertions. The process-restart run covers the backend HTTP readback for AC12. Browser reload remains part of frontend and release verification.
