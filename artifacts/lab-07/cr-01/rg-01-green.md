# RG-01 preflight and local GREEN evidence

27 November 2026 ICT. [Issue #83](https://github.com/gearstack-studio/kitloop/issues/83) is the RG-01 dependency for [Issue #85](https://github.com/gearstack-studio/kitloop/issues/85). See the [production procedure](../../../infra/gcp/CR-01-RG-01.md).

## Production preflight

| Observation | Result |
| --- | --- |
| Public endpoint `GET /api/version` | `e5ed70dbd65ac03d633fc7b8e0b73a72aa262490` |
| Public endpoint `GET /api/ready` | HTTP 200, `{"status":"ready"}` |
| Repository variable `LAB5_DEPLOY_ENABLED` | `false` |
| Production environment `KITLOOP_REQUEST_LIFECYCLE_WRITES` | `disabled` |
| Production environment `KITLOOP_BORROWING_QUOTA` | Unset in the observed GitHub variables |
| Serving Cloud Run revision, digest and effective environment | Pending authenticated Cloud Run readback. The public endpoints report source SHA and readiness. |

**RG-01 production status: BLOCKED.** The explicit dated authorization and config-only redeploy decision required by OD-13 have not been recorded in #83. DEV4952 owns execution and yiiipunn owns independent production verification. The serving revision, effective flags, synthetic actions and production reconciliation still require evidence before the gate can pass.

## Local GREEN

The source for the lifecycle tests and backend build was staging commit `e92512a37f6e87f90adde9009586e1e5b0a50bcf`. The prepared runbook and CLI verifier are committed at `fbdd64a45c9340d797335aaedcf6ddf87a72aa3f`, which has identical `server/` and `client/` trees. Frontend repeat and standalone CLI verification ran at that commit. PostgreSQL 18.7 and Node.js 24.22.3 used dedicated local synthetic databases.

| Check | Result |
| --- | --- |
| Database migration | 4/4 applied on each dedicated database |
| Lifecycle API, rollout, reconciliation tests | [32/32 passed](rg-01-focused.txt) |
| Full backend regression and build | [152/152 passed](rg-01-backend.txt), TypeScript and build passed |
| Full frontend regression, build and lint | [80/80 passed](rg-01-frontend.txt), build and lint passed |
| Offline deployment and release guards | Passed at `fbdd64a`. Ran `bash infra/gcp/deploy/guard.test.sh` and `bash infra/gcp/guards.test.sh` under Linux. [Output](rg-01-guards.txt) |
| Compiled reconciliation CLI | [Dry run, apply and rerun JSON](rg-01-reconcile.json). One stale PENDING row found, zero writes in dry run, one DECLINED row on apply, zero stale rows on rerun, no conflicts. |

Lifecycle tests cover borrower ownership, assigned-custodian scope, session and CSRF rejection with state preservation, checkout auto-decline, and phase-1 refusal of lifecycle writes. The CLI verifier creates only a synthetic scoped fixture and checks the persisted row before and after the commands.

From `server/`, with local synthetic settings from `.env.test.example`:

```sh
npm ci --offline --no-audit --no-fund
npx --no-install prisma generate
npm run db:deploy
npm run build
npm test -- tests/request-lifecycle.test.ts tests/lifecycle-rollout.test.ts tests/reconcile-competing-requests.test.ts --no-color
npm test -- --no-color
# Set DATABASE_URL to the dedicated local kitloop_rg01_cli_test database and migrate it.
node ../artifacts/lab-07/cr-01/verify-rg01-reconcile.mjs
```

From `client/`:

```sh
npm ci --offline --no-audit --no-fund
npm test -- --no-color
npm run build
npm run lint
```
