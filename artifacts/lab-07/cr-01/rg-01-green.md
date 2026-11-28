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

The latest frontend implementation tested for this PR is `885c09fdbbf84982b05fa3446902b01da4cc4353`. The backend and release tooling match the earlier verified source. Local verification used Node.js 24.22.3 and dedicated PostgreSQL 18.7 synthetic databases.

| Check | Result |
| --- | --- |
| Database migration | 4/4 applied on each dedicated database |
| Lifecycle API, rollout, reconciliation tests | [32/32 passed](rg-01-focused.txt) |
| Full backend regression and build | [152/152 passed](rg-01-backend.txt), TypeScript and build passed |
| Full frontend regression, build and lint | [105/105 passed](rg-01-frontend-post-92.txt) at `885c09f`, TypeScript, build and lint passed |
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

## GREEN after PR #89 merged into staging

27 November 2026 ICT. Staging merge `b30fa9f168824625adf788b46c6c215d22637194` was merged into the RG-01 branch at `2ed2a7c79f9ce29423e359c6a98eb3f78ffe7daa`. Git showed a clean merge with no differences in `server/` and `infra/gcp/` relative to the previous PR head `330e4cd`. The backend, reconciliation and guard results above remain evidence for the same source.

The full frontend suite passed **103/103** across 12 files at `2ed2a7c`, including the quota tests from #89. TypeScript, the production frontend build and lint passed. Commands from `client/` were `npm test -- --no-color`, `npm run build` and `npm run lint`. [Frontend output](rg-01-frontend-post-89.txt)

The production observations and OD-13 approval requirements above are separate from the staging integration.

## GREEN after PR #92 merged into staging

27 November 2026 ICT. Staging merge `bccee09e72c9be00ae8747bc2d70c902260fa667` was merged into the RG-01 branch at `885c09fdbbf84982b05fa3446902b01da4cc4353` without conflicts. The application trees match staging. The backend and release tooling trees match the previously verified PR head `8b06ac9`.

The full frontend suite passed **105/105** across 12 files at `885c09f`, including the route-entry quota invalidation and loading-state accessible name regressions from #92. TypeScript, build and lint passed. Commands from `client/` were `npm test -- --no-color`, `npm run build` and `npm run lint`. [Frontend output](rg-01-frontend-post-92.txt)

## Execution log provenance

All executions below took place on **27 November 2026 ICT**. An exit status of 0 applies to each listed command in the corresponding successful execution. Frontend logs include Vitest's recorded start time.

| Log | Exact source SHA | Working directory and command | Exit | Result |
| --- | --- | --- | --- | --- |
| [Focused backend](rg-01-focused.txt) | `e92512a37f6e87f90adde9009586e1e5b0a50bcf` | `server/`: `npm test -- tests/request-lifecycle.test.ts tests/lifecycle-rollout.test.ts tests/reconcile-competing-requests.test.ts --no-color` | 0 | 32/32 |
| [Backend regression](rg-01-backend.txt) | `e92512a37f6e87f90adde9009586e1e5b0a50bcf` | `server/`: `npm test -- --no-color` | 0 | 152/152 |
| [Initial frontend](rg-01-frontend.txt) | `fbdd64a45c9340d797335aaedcf6ddf87a72aa3f` | `client/`: `npm test -- --no-color`, `npm run build`, `npm run lint` | 0 each | 80/80, build and lint passed |
| [Deployment guards](rg-01-guards.txt) | `fbdd64a45c9340d797335aaedcf6ddf87a72aa3f` | Linux checkout root: `bash infra/gcp/deploy/guard.test.sh`, `bash infra/gcp/guards.test.sh` | 0 each | Passed |
| [Reconciliation CLI](rg-01-reconcile.json) | `fbdd64a45c9340d797335aaedcf6ddf87a72aa3f` | `server/`: `node ../artifacts/lab-07/cr-01/verify-rg01-reconcile.mjs` | 0 | Dry/apply/rerun stale count 1/0/0 |
| [Frontend after #89](rg-01-frontend-post-89.txt) | `2ed2a7c79f9ce29423e359c6a98eb3f78ffe7daa` | `client/`: `npm test -- --no-color`, `npm run build`, `npm run lint` | 0 each | 103/103, build and lint passed |
| [Frontend after #92](rg-01-frontend-post-92.txt) | `885c09fdbbf84982b05fa3446902b01da4cc4353` | `client/`: `npm test -- --no-color`, `npm run build`, `npm run lint` | 0 each | 105/105, build and lint passed |
