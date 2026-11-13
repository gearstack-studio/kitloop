# PR A production runtime review

## Baseline and scope

Work date: 2026-11-13 (Asia/Bangkok). Repository `gearstack-studio/kitloop`, issue [#31](https://github.com/gearstack-studio/kitloop/issues/31).

Started with a clean working tree on `sprint-1-staging`, fetched origin, verified Episodes 2-4 were merged and created `feat/5-production-runtime` from `bc582d8f34fb3e82059f2b0ca2a420013c5d7e24`. This is the baseline SHA. The results below were collected from the local pre-commit working tree. Publication, hosted CI results and tested implementation/merge SHAs are recorded in the PR.

The baseline already had compiled server output, persisted Prisma sessions, readiness, a production demo-seed guard, separate API/web Compose images and PR CI. It lacked the combined runtime, startup validation, graceful shutdown, a separate migration image and controlled production bootstrap. Existing source migrations, schema, password hashing and domain contracts were retained. PR B infrastructure scripts and cloud resources were not modified.

## Files in this change

| Files | Purpose |
| --- | --- |
| `Dockerfile` | Add `production-deps`, `production`, and `migration` targets; preserve existing targets |
| `server/src/app.ts`, `server/src/index.ts` | Mount production SPA, keep API errors separate, validate startup, drain/disconnect on signals |
| `server/src/config.ts`, `server/src/spa.ts` | Sanitized runtime/DB validation and testable SPA routing |
| `server/src/bootstrap.ts`, `server/src/bootstrap-cli.ts` | Reviewed manifest validation, scrypt hashing, transaction/advisory-lock provisioning and sanitized explicit CLI |
| `server/scripts/migrate.mjs`, `server/package.json` | One-shot migration command and bootstrap operational command |
| `server/.env.production.example` | Placeholder-only production configuration/manifest |
| `server/tests/bootstrap.test.ts`, `server/tests/runtime-config.test.ts`, `server/tests/spa.test.ts` | Validation, idempotency/concurrency/rollback and routing regressions |
| `docker-compose.production-test.yml`, `server/scripts/prepare-production-test.mjs`, `server/scripts/verify-production.mjs` | Isolated production-image verification, random credentials and workflow/restart assertions |
| `.github/scripts/production-smoke.sh`, `.github/workflows/pull-request-ci.yml` | Reusable production success/failure checks added after the original CI sequence |
| `docs/labs/lab-05/deployment.md`, this file | Runtime handoff, commands, environment inventory, evidence and prepared PR description |

Temporary synthetic environment files were created under `C:\SE\kitloop-runtime-test`, outside the repository and build context. Existing ignored developer `.env` files were preserved. No unrelated tracked changes were present in the initial audit.

## Design and operational contract

Express serves the Vite output and `/api` through one unprivileged process, listening on the supplied `PORT`. Cloud Run terminates HTTPS. The final/default Docker target is now `production`; PR B should select it explicitly. The image contains production dependencies plus the generated Prisma Client, compiled API/CLI code and SPA. A fresh runtime-only locked install excludes the optional Prisma/TypeScript peers that npm pruning retained.

Use a separately tagged `migration` target from the same source SHA for `prisma migrate deploy`. It exits after completion and is required before starting the release. Provision users/assets only by explicitly running `node dist/bootstrap-cli.js` in the application image with the reviewed `BOOTSTRAP_INPUT` secret. Existing passwords and identities are preserved, and conflicting role/asset input rolls back the batch. Neither job is called by normal startup.

PR B must provide the actual HTTPS origin, durable database, runtime session secret, Cloud SQL attachment/network access and image digests. It must execute migration successfully before bootstrap/traffic and use the application image with `NODE_ENV=production`. These contracts are detailed in `deployment.md`.

## Executed verification

Docker Engine 29.9.3 with Linux containers. Node inside the image reported v24.22.3. All test databases/projects below were isolated and synthetic.

| Commands/checks | Observed result |
| --- | --- |
| `docker compose -p kitloop-runtime-regression --profile test build test client-test` | Exit 0. Server typecheck and production TypeScript emit passed; frontend TypeScript/Vite build and lint passed (frontend cached unchanged build layers reused). |
| `docker compose -p kitloop-runtime-regression --profile test run --rm test` | Exit 0. **11 files, 70 tests passed**, including 12 added tests. Live readiness returned expected 200 and 503. No checkout concurrency failure reproduced. |
| `docker compose -p kitloop-runtime-regression --profile test run --rm client-test` | Exit 0. **4 files, 21 tests passed**. |
| `node server/scripts/prepare-production-test.mjs C:\SE\kitloop-runtime-test\runtime.env` | Exit 0 using the bundled Node executable. Generated a fresh local manifest and random test credentials without printing them. |
| `docker compose -f docker-compose.production-test.yml --env-file C:\SE\kitloop-runtime-test\runtime.env -p kitloop-runtime --profile check build` | Exit 0 for application, migration, bootstrap and verifier images. Initial image dependency audit identified optional CLI/tooling peers; packaging was corrected and the final full script below rebuilt the application. |
| `COMPOSE_PROJECT_NAME=kitloop-runtime-ci bash .github/scripts/production-smoke.sh C:/SE/kitloop-runtime-test/runtime.env` | Exit 0, executed with Git Bash on Windows outside the sandbox because MSYS named-object creation was blocked inside the sandbox. All success and required-failure checks below passed, and the script removed its own test resources. |
| `docker run --rm -v C:/SE/kitloop:/repo -w /repo rhysd/actionlint:latest -color` and `bash -n .github/scripts/production-smoke.sh` | Exit 0 after final workflow edits. The workflow generates the mode-0600 secret file as the runner UID/GID so Linux file permissions permit Compose to read it. |
| Legacy Compose build, fresh migration/seed, `up -d --wait`, `node scripts/verify-docker.mjs`, with external synthetic `legacy.env` and project `kitloop-runtime-legacy` | All exit 0. Existing API/web/database workflow passed on port 8084. |
| Production dependency install | 69 packages installed; npm reported **0 vulnerabilities** in this runtime-only install. Source lockfile and dependency versions unchanged. |
| Final image inspection | User `node`, command `["node","dist/index.js"]`. Verified `prisma`, `@prisma/config`, `deepmerge-ts`, `typescript`, `tsx` and `vitest` directories absent. |
| Filesystem secret checks | Scanned application/migration files for actual environment files and generated DB URL/password, CSRF secret and bootstrap passwords. Both images passed; only pass/fail output retained. |
| Image history checks | Compared application/migration build history in memory with generated DB URL/password and CSRF secret; no matches. |
| `git diff --check`, `git ls-files .env server/.env client/.env`, `git check-ignore .env server/.env` | Diff check passed. No actual environment files tracked; existing local environment paths ignored. |

Final tested application image ID: `sha256:6e01683c06dc2acace2727af67b24789391269cf9ed0a0f400615509815d536b`.

Final tested migration image ID: `sha256:82f7f4b8372bcf48b9d8c5e3f79fb2c4a46e235efd956b15a23c8fc9ee1445be`.

The production smoke printed these sanitized results:

```text
PASS production SPA/assets, health, readiness, Secure cookie, CSRF/origin, request write, role guard
PASS graceful SIGTERM shutdown with exit 0
PASS persisted session/request after restart, custodian checkout, active loan, availability and logout
PASS migration/configuration/bootstrap failure paths and production demo-seed guard
```

Its required failure cases were missing `DATABASE_URL` (migration exit 2), unreachable database (migration exit 1), empty `BOOTSTRAP_INPUT` (bootstrap exit 2), short session secret (application exit 1), and production demo seed (exit 1). Successful migration/bootstrap were also exercised repeatedly while starting dependencies. Server bootstrap tests separately verified existing hash/ID preservation, concurrent reruns and transaction rollback.

## Findings and remaining verification

| Severity | Finding | Disposition |
| --- | --- | --- |
| BLOCKER for deployment | Actual Cloud SQL connectivity, HTTPS/browser workflow, service identity and public endpoint have not been deployed/tested | PR B cloud integration and evidence remain required |
| MAJOR, pre-existing | Migration/tools dependency graph reports 3 high npm advisories through Prisma CLI -> `@prisma/config` -> `deepmerge-ts` (GHSA-ggr8-5vv4-36mx) | Excluded from long-running runtime; retained in one-shot job/build tooling. Prisma major-version upgrade needs separate review; do not claim job image is advisory-free |
| MAJOR, pre-existing | Earlier Episode 3 evidence recorded intermittent concurrent-checkout HTTP 500 | Did not reproduce in this 70-test run; no domain behavior change or suppression applied |
| MINOR | Updated hosted CI and tests tied to an implementation commit are pending | Requires the user's reviewed commit/push. Local actionlint and command sequence passed |
| SUGGESTION | Pin approved base-image digests for a deployment release | PR B should record immutable digests and source SHA as issue #31 requires |

No new unresolved blocker was found in repository-side runtime verification. No hardcoded production passwords, secret-bearing image contents, destructive initialization, auth bypass or permission bypass was found. Existing synthetic test/demo fixtures remain confined to their explicit workflows. The production smoke checks cookie attributes and server behavior over internal HTTP using a synthetic HTTPS Origin; actual browser Secure-cookie transport, certificate validation, Cloud SQL sockets and Cloud Run lifecycle still require PR B verification. This is **GO for PR A review**, and **NO-GO for claiming Episode 5 deployment complete**.

## Prepared PR description

Title: `[Lab 5] Prepare KitLoop production runtime for Cloud Run`

Base: `sprint-1-staging`; compare: `feat/5-production-runtime`; author: `DEV4952`; reviewer: `yiiipunn`; label: `lab5`.

```markdown
KitLoop now has a single-port production image serving the compiled SPA and API, separate migration execution and explicit production provisioning. This lets PR B deploy matching runtime/job images without invoking the local demo seed or running migrations during application startup.

Part of #31.

### Implementation
- Express serves SPA deep links and API routes from 0.0.0.0:$PORT, with startup validation and graceful SIGTERM shutdown.
- Add a non-root production image with locked runtime dependencies and a separate Prisma migration image.
- Add reviewed-manifest account/asset bootstrap with existing scrypt hashing, transaction/advisory locking, preserved passwords and rollback on conflicts.
- Add production configuration examples, runtime/bootstrap/routing tests, isolated production-image smoke and CI integration.
- Update deployment.md and production-runtime-review.md with commands, environment/secret inventory, image IDs, actual results and PR B contracts.

### Validation
- Backend 70/70, frontend 21/21; typechecks, builds, lint, actionlint and shell syntax passed locally.
- Production image passed SPA/assets, readiness, authentication, CSRF/Origin and role guards, request write, session/request persistence after SIGTERM restart, custodian checkout and logout.
- Migration success and missing/unreachable DB failure paths passed. Bootstrap validation/idempotency/concurrency/rollback passed. Demo seed remains blocked in production.
- Legacy Compose smoke passed. Final application/migration files and build history passed local secret checks. Runtime-only dependency install reported 0 npm vulnerabilities.

### Remaining integration and known findings
- PR B must build/tag both targets from this reviewed commit, configure the real HTTPS origin/database/secrets, run migration before traffic and perform cloud/browser persistence verification.
- Migration/build tooling retains 3 pre-existing Prisma CLI advisory-chain findings. Earlier concurrent-checkout 500 was not reproduced here and remains a known finding.
- Hosted CI awaits this PR's reviewed commit/push. No GCP resources were modified.

### Reviewer checklist
- [ ] Confirm runtime image contains frontend/API/Prisma Client, runs non-root, uses PORT and shuts down gracefully.
- [ ] Confirm job images/commands and PR B environment/socket contracts.
- [ ] Review bootstrap manifest validation, preserved passwords and transactional conflict behavior.
- [ ] Reproduce tests and review secret/advisory evidence.
- [ ] Verify the hosted CI run and implementation SHA after push.
- [ ] Keep #31 open for PR B deployment and cloud evidence.
```

## Scoped commands for the user's review

The scoped commands below identify the PR A files for review. Actual publication and hosted verification are recorded in the PR.

```bash
git status --short
git diff --check
git add -- Dockerfile docker-compose.production-test.yml .github/workflows/pull-request-ci.yml .github/scripts/production-smoke.sh
git add -- server/package.json server/.env.production.example server/src/app.ts server/src/index.ts server/src/config.ts server/src/spa.ts server/src/bootstrap.ts server/src/bootstrap-cli.ts
git add -- server/scripts/migrate.mjs server/scripts/prepare-production-test.mjs server/scripts/verify-production.mjs server/tests/bootstrap.test.ts server/tests/runtime-config.test.ts server/tests/spa.test.ts
git add -- docs/labs/lab-05/deployment.md docs/labs/lab-05/production-runtime-review.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat: prepare KitLoop production runtime for Cloud Run"
git push -u origin feat/5-production-runtime
```

Use the prepared PR description above and preserve the `Part of #31` reference. Keep the issue open for PR B deployment and cloud evidence.
