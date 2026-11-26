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
