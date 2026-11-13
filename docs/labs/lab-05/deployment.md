# Lab 5 deployment

## Episode 5: first GCP deployment preparation

**Status:** Repository-side cloud tooling is prepared. No Cloud SQL instance, Secret Manager secret, service account, Artifact Registry repository, Cloud Build, Cloud Run job, or service has been created or verified by this work. The CPE334 Student Guide V1.1 and rubric were not available in the workspace; confirm their Episode 5 acceptance details before release.

### Architecture and integration boundary

Target project: `lab-5-cloud-deployment-514310`. Region: `asia-southeast1`. The target is one Cloud Run service serving the built React SPA and Express `/api` at the same HTTPS origin, with persistent PostgreSQL in a private-IP Cloud SQL instance. Artifact Registry stores immutable app and migrator images. Secret Manager supplies `DATABASE_URL` and `SESSION_CSRF_SECRET`. A one-time Cloud Run job applies checked-in Prisma migrations before the service is published. This design preserves the existing `Secure`, `HttpOnly`, `SameSite=Lax` cookie, Origin check, and CSRF behavior.

The current Compose `web` container cannot be deployed unchanged because its Nginx configuration proxies to the Compose-only hostname `api`. DEV4952 owns the combined `cloud` image target, same-origin routing, `migrator` image target, production bootstrap command, and production image tests. The contract for those targets, environment variables, endpoints, and image names is in [infra/gcp/README.md](../../../infra/gcp/README.md). The scripts fail rather than assume those targets exist. The local Compose PostgreSQL volume and demo passwords are never production inputs; `db:seed` remains blocked under `NODE_ENV=production`.

### Approval, cost and security gate

The GCP project was reported active with billing enabled and Cloud Run/Cloud SQL APIs enabled. Remaining Free Trial credits, budget alerts, quota, and a regional cost estimate still need verification. An active billing account is not proof of free usage. Cloud SQL compute is continuous and may incur storage, backup, and network charges. Cloud Run, Cloud Build, Artifact Registry, Secret Manager, and logs may also charge. The proposed paid lab starting point is Cloud SQL Enterprise PostgreSQL 17 on `db-f1-micro`, zonal, 10 GiB SSD, capped automatic growth, and scheduled backups. Shared-core instances have no Cloud SQL SLA. The separate 30-day Cloud SQL free-trial instance requires an eligible new project, has a fixed large configuration and no ordinary backups, and is not assumed available here. Check the [Cloud SQL pricing and trial terms](https://cloud.google.com/sql/pricing) and [free-trial conditions](https://docs.cloud.google.com/sql/docs/postgres/free-trial-instance) immediately before approval.

The database plan uses a dedicated VPC and subnet, private services access, and **no public IP**. Cloud Run service and migration job use Direct VPC egress and Cloud SQL attachment, with Prisma connecting through a Unix socket. The runtime service account gets Cloud SQL Client and accessor on the database URL and CSRF secret; the migration account gets Cloud SQL Client and accessor on the database URL only. The build account can write only to the KitLoop Artifact Registry repository and Cloud Logging. The temporary bootstrap password secrets are not granted to the runtime account. No service account keys are created. Confirm the operator's resource-creation and Service Account User permissions separately. [Cloud SQL private access](https://docs.cloud.google.com/sql/docs/postgres/configure-private-services-access), [Cloud Run VPC egress](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc), [Cloud Run IAM](https://docs.cloud.google.com/run/docs/reference/iam/roles).

### Ordered Cloud Shell commands

Run from a clean clone of the reviewed `feat/5-first-gcp-deployment` commit. Every `prepare.sh` and `release.sh` action prompts for its exact project/action before changing anything. Inspect all existing and peered IP ranges before choosing the two example placeholders below; **do not copy an overlapping range**. Stop at the cost/approval gate before `prepare.sh apis`.

```bash
gcloud config set project lab-5-cloud-deployment-514310
git status --porcelain
git rev-parse HEAD
bash infra/gcp/preflight.sh
# Verify credits, budget alerts, quotas, IAM and estimated charges in Console.
# Obtain approval before running any command below.
bash infra/gcp/prepare.sh apis
bash infra/gcp/prepare.sh registry
bash infra/gcp/prepare.sh identity
bash infra/gcp/prepare.sh network SUBNET_CIDR PSA_BASE_IP PSA_PREFIX
bash infra/gcp/prepare.sh database
bash infra/gcp/prepare.sh secrets
bash infra/gcp/prepare.sh grants
# After DEV4952's cloud and migrator targets are integrated and tested:
bash infra/gcp/release.sh build
SHA="$(git rev-parse --short=12 HEAD)"
# Review all migrations and database backup status first:
bash infra/gcp/release.sh migrate "$SHA"
# After production bootstrap is implemented, provision accounts/assets separately.
bash infra/gcp/prepare.sh bootstrap-secrets
bash infra/gcp/prepare.sh bootstrap-grants
bash infra/gcp/release.sh bootstrap "$SHA"
# Verify account and asset counts without secrets, then:
bash infra/gcp/prepare.sh bootstrap-revoke
bash infra/gcp/release.sh deploy "$SHA"
bash infra/gcp/verify.sh private
# After production browser checks and explicit approval to publish:
bash infra/gcp/release.sh publish
bash infra/gcp/verify.sh public
```

`release.sh deploy` creates a private service with a temporary placeholder origin, reads its generated HTTPS URL, and updates `APP_ORIGIN` to that exact URL before public invocation. It pins Secret Manager version `1` for the first deployment and records the image digest. For a later secret rotation, publish a new version and update the pinned reference deliberately. The bootstrap job requires DEV4952's `db:bootstrap` implementation and fails if it is absent; no demo seed is an acceptable substitute. Full command behavior, failure recovery, and rollback syntax are in [infra/gcp/README.md](../../../infra/gcp/README.md).

### Verification, evidence and rollback

The automated verification script checks the ready Cloud Run revision, `/`, `/api/health`, and database-backed `/api/ready` for HTTP 200 without printing tokens. It does **not** establish authentication, data workflow, or persistence. In a browser, verify login, session restoration after refresh, catalog read, borrower request, custodian checkout, and persistence across a new revision. Record the actual project/region, approved cost setting, source SHA, Cloud Build ID/status, immutable app/migrator image digests, Cloud SQL private connection and backup state, migration job execution/result, service URL/revision, HTTP statuses, browser evidence, and any limitations. Never attach expanded database URLs, secret payloads, passwords, cookies, CSRF headers, identity tokens, or unredacted environment dumps.

For a later release, retain the prior compatible Cloud Run revision and use `bash infra/gcp/release.sh rollback REVISION` to route traffic back, then rerun HTTP and browser checks. Rolling back traffic does not reverse a Prisma migration. Review backward compatibility and backups before applying schema changes; the first release has no prior application revision. Inspect Cloud Build step logs on build failure, the migration execution on schema failure, and Cloud Run revision logs on failed startup or readiness. Do not repeat a partially successful migration or reset the database without diagnosis.

## Episode 5, PR A: production runtime

PR A prepares the repository runtime for issue #31. GCP provisioning, deployment, IAM, service accounts and cloud evidence belong to PR B (`yiiipunn`). The runtime has been tested locally with isolated PostgreSQL; deployment to GCP is pending.

### Single-port image and shutdown

Build `Dockerfile` target `production` (also the final/default target). Express serves the compiled Vite SPA and `/api` from a single listener at `0.0.0.0:$PORT`. `/requests` and other client routes return `index.html`; missing assets and unknown API routes do not receive SPA HTML. Vite builds with an empty `VITE_API_BASE_URL`, so browser requests stay on the page's HTTPS origin. Cloud Run terminates TLS and forwards HTTP to this listener. A second proxy process is unnecessary.

The application image contains compiled backend code, the compiled frontend, Prisma Client and runtime dependencies and runs as user `node`. It contains no environment files, demo seed, migration scripts or source tests. Separate existing `api`, `web`, `server-test` and `client-test` stages still support Episodes 3-4. Application startup validates production configuration and does not migrate or bootstrap. Missing frontend artifacts fail startup explicitly. `SIGTERM`/`SIGINT` stop accepting requests, drain HTTP connections and disconnect Prisma. A 9-second deadline bounds shutdown within Cloud Run's termination window.

Port binding, TLS termination and the signal-handling design follow the [Cloud Run container contract](https://docs.cloud.google.com/run/docs/container-contract).

```bash
docker build --target production -t kitloop-runtime:local .
docker build --target migration -t kitloop-migration:local .
```

Use the same source commit for both images. PR B must record that SHA and immutable image digests. Runtime command is `node dist/index.js` with working directory `/app/server`. No extra shell entrypoint is needed. The application image can run with a read-only root filesystem, as tested by the production smoke stack.

### Production configuration contract

`server/.env.production.example` contains placeholders for the production settings. Supply actual values as runtime environment/secrets. Environment files used in local verification must remain ignored and outside the Docker context where practical.

| Variable | Consumer and purpose | Secret | Source |
| --- | --- | --- | --- |
| `NODE_ENV` | Runtime uses production validation and Secure cookies | No | Production image sets `production`; retain it for Cloud Run |
| `PORT` | Single HTTP listener, integer 1-65535 | No | Cloud Run supplies it; image default 8080 |
| `DATABASE_URL` | Prisma Client and migration job PostgreSQL connection | Yes | PR B's database provisioner / Secret Manager |
| `APP_ORIGIN` | Exact HTTPS browser origin, with no trailing slash/path/query/credentials | No | Actual Cloud Run URL or approved custom domain after PR B creates the service |
| `SESSION_CSRF_SECRET` | HMAC key, minimum 32 characters | Yes | Independently generated secret, persisted across revisions |
| `SESSION_TTL_HOURS` | Positive session duration, default 12 | No | Deployment configuration |
| `BOOTSTRAP_INPUT` | Explicit account/asset manifest, bootstrap job only | Yes | Reviewed operational input injected by Secret Manager or an approved secret channel |

`DATABASE_URL` accepts both `postgresql:` and `postgres:` URLs. For the Cloud SQL Unix-socket approach, Prisma can use a URL whose `host` query parameter points to `/cloudsql/PROJECT:REGION:INSTANCE`; percent-encode credentials and the socket query value when assembling the URL. PR B must attach the matching Cloud SQL instance and grant its runtime identity the required access. Network/TLS connectivity and the actual service URL require cloud verification by PR B.

Session cookies remain `Secure`, `HttpOnly`, `SameSite=Lax`, scoped to `/api`. Identity and sessions remain database-backed. CORS allows `APP_ORIGIN`; login/state-changing requests check Origin and mutations also check CSRF as before. Keep the same origin and session secret when testing session persistence across a revision. There is no production authentication bypass.

### Separate migration job

Use the `migration` image as a one-time job with only `DATABASE_URL`. Its entrypoint is `node scripts/migrate.mjs`, which runs the locked Prisma CLI's `migrate deploy` against checked-in migrations. Exit 0 means success, 2 means invalid/missing configuration, and 1 means execution/connectivity/migration failure. Output is sanitized to avoid logging connection strings or Prisma exception details. Inspect database connectivity and migration history through an approved operator session if diagnosis is required.

```bash
# /secure/migration.env contains DATABASE_URL and is supplied privately by the operator.
docker run --rm --env-file /secure/migration.env kitloop-migration:local
```

Run and await successful migration before starting the service revision or invoking bootstrap. No schema reset, automatic seed or GCP job creation is performed by application startup. The migration image retains Prisma CLI/build dependencies; those tools are isolated from the application image. Failed migration deployment must stop the release.

### Controlled account and asset bootstrap

Use the production application image with command `node dist/bootstrap-cli.js` (or `npm run db:bootstrap`). This explicitly invoked command needs `DATABASE_URL` and secret `BOOTSTRAP_INPUT`. It does not require `APP_ORIGIN` or session configuration. The manifest must be a JSON object with a nonempty `users` array and an `assets` array (empty is allowed). See the placeholder manifest in `server/.env.production.example`.

Each user supplies `username`, `password` (12-1024 characters), and `role` (`BORROWER` or `CUSTODIAN`). Each asset supplies `assetId`, `name`, `category`, `description`, and `custodianUsername` referencing a CUSTODIAN in the manifest. Passwords use the existing salted scrypt implementation. Account names, passwords and inventory values have no production defaults. Test fixtures are generated only by the separate test helper.

```bash
# /secure/bootstrap.env contains DATABASE_URL and a reviewed BOOTSTRAP_INPUT secret.
docker run --rm --env-file /secure/bootstrap.env kitloop-runtime:local node dist/bootstrap-cli.js
```

The bootstrap validates all entries and duplicate IDs before writing. One transaction holds a PostgreSQL advisory lock to serialize bootstrap invocations. Matching existing accounts keep their IDs/password hashes, even if a different input password is supplied. Existing roles and asset metadata must match; conflicting roles, changed metadata or retired assets abort the entire transaction. Matching assets and custodian assignments are inserted only if missing. The command provides no password-rotation or inventory-update mechanism. Those changes need a separate reviewed operation.

Reusing a manifest is safe and does not reset accounts. Use a complete reviewed manifest for each batch, including referenced custodians. Passwords on existing users are still validated but do not change stored passwords. Bootstrap outputs no credentials or identifiers. Exit 0 means success, 2 means configuration/manifest/conflict failure, and 1 means an operational database failure. The demo seed remains blocked in production. Avoid shell tracing, environment dumps and secret-bearing CLI arguments.

### Local production verification and CI

Create a new temporary configuration path outside the repository using the test-only generator. It produces random synthetic credentials and a disposable manifest. It refuses to overwrite a file. Use Bash with Docker for the automated sequence below; the same smoke script is invoked by the Episode 4 workflow after its original checks.

```bash
runtime_test_dir="$(mktemp -d)"
docker build --target server-test -t kitloop-runtime-check:local .
docker run --rm --user "$(id -u):$(id -g)" -v "$runtime_test_dir:/test-output" kitloop-runtime-check:local \
  node scripts/prepare-production-test.mjs /test-output/runtime.env
export COMPOSE_PROJECT_NAME="kitloop-runtime-check-$(date +%s)"
bash .github/scripts/production-smoke.sh "$runtime_test_dir/runtime.env"
rm -f -- "$runtime_test_dir/runtime.env"
rmdir -- "$runtime_test_dir"
```

The smoke script uses `docker-compose.production-test.yml` with a separate tmpfs database, single-port read-only production container and temporary session-state volume. Its default host port is 8083 (`RUNTIME_TEST_PORT` in the temporary file). The HTTPS origin `https://runtime.kitloop.test` is synthetic and used only to verify production Origin/cookie policy over Docker's internal HTTP transport, matching Cloud Run's TLS termination boundary. This does not verify browser TLS or a real Cloud Run endpoint.

The generator runs with the host operator's UID/GID so its mode-0600 file remains readable by that operator on Linux. CI applies the same ownership rule for the GitHub runner and masks the generated secrets before other steps run.

The checks cover root/deep-link SPA and JS assets, health/readiness, Secure-cookie attributes, CSRF/foreign-origin rejection, borrower permission checks, persisted session/request across SIGTERM restart, custodian checkout, loan/availability reads and logout. The script additionally requires the documented nonzero exits for missing/unreachable migration databases, missing bootstrap input, invalid production configuration, and the production demo-seed guard. It deletes only its own uniquely named containers/volumes on exit, including failures.

Backend tests additionally cover manifest validation, salted hashes, reruns with changed input passwords, concurrent bootstrap calls, role-conflict rollback and asset-conflict preservation. See [production-runtime-review.md](production-runtime-review.md) for actual results, findings and the PR B handoff. [Hosted CI and screenshot evidence](evidence/README.md) records the tested implementation and merge SHAs for PR #32.

## Episode 4: CI on pull requests

`.github/workflows/pull-request-ci.yml` runs for opened, updated, reopened and ready-for-review pull requests targeting `sprint-1-staging` or `main`. The check is named **Build, test and Docker smoke**. It checks out the PR merge commit and records both that SHA and the PR head SHA in the Actions run summary. A newer update cancels an older run for the same PR. Any failed build, lint, typecheck, test, migration or smoke command fails the job.

The workflow builds the existing Docker stages using committed npm lockfiles. Server typecheck/compilation and frontend TypeScript/build/lint execute during image builds. Then it runs the backend integration and live readiness tests against the ephemeral `db-test` service, runs frontend tests, migrates/seeds a separate fresh application database, starts the stack and performs the HTTP smoke check. Tests run sequentially. The workflow uses a unique Compose project per run and attempt and cleans up containers, volumes and generated configuration even when a check fails.

`.github/scripts/ci-env.sh` generates random synthetic credentials, masks them in Actions and writes configuration under the runner temporary directory, outside the Docker context. Compose loads it through `COMPOSE_ENV_FILES`. CI requires no repository secrets, host Node.js, host PostgreSQL or developer `.env`. The job token has `contents: read` and checkout does not persist credentials. Run logs and the SHA/status summary provide evidence; environment dumps and raw application logs are not uploaded as artifacts.

To reproduce on Linux or Git Bash with a Linux Docker engine, first create a fresh temporary directory and an unused Compose project name. Use a free host port; the example uses 8080. Stop any existing stack bound to that port or adjust `WEB_PORT` and `APP_ORIGIN` in the temporary configuration together.

```bash
ci_temp_dir="$(mktemp -d)"
export COMPOSE_PROJECT_NAME="kitloop-ci-local-$(date +%s)"
export COMPOSE_ENV_FILES="$ci_temp_dir/kitloop-ci.env"
# Suppress Actions masking directives when outside Actions; do not save this output.
bash .github/scripts/ci-env.sh "$COMPOSE_ENV_FILES" >/dev/null
docker compose --profile tools --profile test config --quiet
docker compose --profile tools --profile test build --pull
docker compose --profile test run --rm test
docker compose --profile test run --rm client-test
docker compose up -d --wait db
docker compose run --rm tools npm run db:deploy
docker compose run --rm tools npm run db:seed
docker compose up -d --wait
docker compose run --rm tools node scripts/verify-docker.mjs
# Run cleanup even if an earlier command failed. This deletes only this CI project's data.
docker compose --profile tools --profile test down --volumes --remove-orphans
rm -f -- "$COMPOSE_ENV_FILES"
rmdir -- "$ci_temp_dir"
```

On failure, open the failed Actions step and reproduce its command with the same tested commit and fresh test database. Keep the failure visible while diagnosing it. Earlier Docker verification recorded an intermittent concurrent-checkout HTTP 500; see `c-03-evidence.md`. CI does not retry or suppress test failures. Reviewers should verify the passing run link, tested merge/head SHAs and each step before merging. Making this check mandatory in branch protection is a separate repository setting controlled by maintainers.

## Episode 3: Docker containerization (R-01, R-02, C-03)

Run these commands from the repository root with Git, Docker Engine/Desktop running Linux containers, and Docker Compose v2 or later. Windows Docker Desktop requires a working WSL 2 installation. Node.js and PostgreSQL on the host are unnecessary for this workflow.

### Clean-clone configuration

```powershell
git clone https://github.com/gearstack-studio/kitloop.git
cd kitloop
git switch docker-containerization-for-kitloop
git rev-parse HEAD
Copy-Item .env.example .env
```

On Linux/macOS use `cp .env.example .env`. Edit `.env` locally and replace every `REPLACE_*` value. Use a URL-safe database user/password/database name (letters, digits, underscores and hyphens) and match those values in `DATABASE_URL`. Generate independent random passwords and a CSRF secret of at least 32 characters with a password manager. Keep the database hostname `db` and port `5432`. The defaults open the browser at `http://localhost:8080`; if changing `WEB_PORT`, change `APP_ORIGIN` to the same browser origin. The frontend uses same-origin `/api` requests through Nginx.

| Variable | Purpose | Secret? | Value source |
| --- | --- | --- | --- |
| `POSTGRES_USER` | PostgreSQL role created on first startup | No | Choose a local role name in root `.env` |
| `POSTGRES_PASSWORD` | PostgreSQL role password | Yes | Generate locally, put in root `.env` |
| `POSTGRES_DB` | Application database created on first startup | No | Choose a local database name in root `.env` |
| `DATABASE_URL` | API/Prisma database connection | Yes | Assemble from the three PostgreSQL values and `db:5432` in root `.env` |
| `SESSION_CSRF_SECRET` | HMAC key, minimum 32 characters | Yes | Generate locally in root `.env` |
| `SESSION_TTL_HOURS` | Session lifetime in hours | No | Root `.env`, default 12 |
| `APP_ORIGIN` | Exact origin for browser CORS/CSRF checks | No | Browser address in root `.env`, default `http://localhost:8080` |
| `WEB_PORT` | Host loopback port published by Nginx | No | Root `.env`, default 8080 |
| `DEMO_BORROWER_PASSWORD` | Password shared by synthetic borrower accounts | Yes | Generate locally in root `.env`; tools service only |
| `DEMO_CUSTODIAN_PASSWORD` | Password shared by synthetic custodian accounts | Yes | Generate locally in root `.env`; tools service only |
| `PORT` | Internal API listening port | No | Compose fixes it at 3000 to match the proxy and health check |
| `NODE_ENV` | Cookie policy and demo seed guard | No | Image defaults to `production`; local Compose uses `development`, test uses `test` |
| `VITE_API_BASE_URL` | Public API prefix embedded at client build time | No | Docker build argument defaults to empty for same-origin API access |
| `SMOKE_BASE_URL` | Optional HTTP smoke-test destination | No | Smoke script defaults to `http://web` on the Compose network |

Root `.env.example` lists the user-supplied Compose settings. Fixed internal settings and the optional frontend build argument are documented above. Existing `server/.env.example`, `server/.env.test.example`, and `client/.env.example` support host-based development. Docker excludes actual environment files at every directory level. No runtime secrets are build arguments. Never put secrets in any `VITE_` variable. Never attach expanded `docker compose config`, environment dumps, authentication response headers, cookies, or database URLs as evidence.

### Build, migrate, seed, and run

```powershell
docker version
docker compose version
docker compose config --quiet
docker compose --profile tools build --pull
docker compose up -d --wait db
docker compose run --rm tools npm run db:deploy
docker compose run --rm tools npm run db:seed
docker compose up -d --wait
docker compose ps
docker compose run --rm tools node scripts/verify-docker.mjs
```

Open `http://localhost:8080`, sign in as `borrower.demo` with the local `DEMO_BORROWER_PASSWORD`, open the catalog, and submit a request for an available asset. Confirm it appears in request history, refresh, and confirm it remains. Login writes a PostgreSQL session, the catalog reads seeded assets, and the request writes a BorrowRequest. `custodian.demo` manages cameras and `custodian.other` manages the laptop, using `DEMO_CUSTODIAN_PASSWORD`.

```powershell
Invoke-RestMethod http://localhost:8080/api/health
Invoke-RestMethod http://localhost:8080/api/ready
docker compose restart api
Invoke-RestMethod http://localhost:8080/api/ready
```

On Linux/macOS use `curl --fail http://localhost:8080/api/ready` and the equivalent health URL. Readiness must return HTTP 200 with `status=ready` after restart; retry briefly while the API starts. Record browser action results without recording passwords, cookies or CSRF tokens.

PostgreSQL persists in a named volume and is accessible only on the Compose network. `docker compose down` stops the stack and preserves data. Changing PostgreSQL initialization values does not update an existing volume. To reset disposable local data deliberately, run `docker compose down --volumes` and repeat migration/seed; this deletes the local database. Seeding is repeatable and resets demo passwords. Keep migrations explicit and run `db:deploy` before starting a newly updated API. The API health check waits for database connectivity and the web service waits for a ready API.

The API image uses compiled JavaScript and production dependencies under the unprivileged `node` user. The tools image retains Prisma CLI and tsx for migration/seed. Local HTTP Compose uses `NODE_ENV=development` so browsers can send session cookies. For production use HTTPS, set `NODE_ENV=production` and the real `APP_ORIGIN`, and provision accounts separately because the demo seed refuses production. GCP deployment is a later episode.

### Automated tests in containers

```powershell
docker compose --profile test build test client-test
docker compose --profile test run --rm test
docker compose --profile test run --rm client-test
docker compose --profile test stop db-test
docker compose --profile test rm -f db-test
```

The `test` service migrates a separate `kitloop_test` database, runs server integration tests, and checks live readiness responses (200 for reachable PostgreSQL and 503 for an unreachable database). Test data uses a separate PostgreSQL container with ephemeral storage. The `client-test` image builds and lints the frontend, then runs the existing client tests. Its runtime API base is `http://localhost:3000` to support the existing absolute-URL HTTP mocks. API compilation/typechecking runs while building the server test/tools/API stages. Execute the two test suites sequentially.

### C-03 evidence and review

Use a fresh clone of the exact candidate commit and a new Compose project (`$env:COMPOSE_PROJECT_NAME = 'kitloop-c03'` in PowerShell or `export COMPOSE_PROJECT_NAME=kitloop-c03` on Linux/macOS) so an existing database volume cannot conceal initialization problems. Record `git rev-parse HEAD`, Docker/Compose versions, commands above, exit results, health/readiness responses, and the catalog/request action with refresh. Check that `.env` is ignored using `git check-ignore .env` and that `git ls-files` contains no actual environment or secret files. Inspect the final API, tools and web images for actual `.env` files, and inspect image history for secret-bearing build arguments. Record pass/fail results only, without secret values.

The current execution record is in [c-03-evidence.md](c-03-evidence.md). A blocked run does not satisfy C-03. Include successful clean-clone evidence with the tested SHA in the PR before claiming acceptance. Request review from `yiiipunn` explicitly covering C-03, apply `lab5`, and use the confirmed staging branch as the PR base.

## Episode 2 historical readiness record

## Scope and baseline

This document describes the local cloud-readiness changes on `refactor/2-cloud-ready`, based on `sprint-1-staging` at `0d7d216`. No GCP deployment has been performed. The local `main` branch is one commit ahead of staging (`c787f84`), with Sprint 1 request-queue changes and integration evidence; do not silently merge those changes into this episode.

KitLoop has a React 19 / TypeScript / Vite browser client in `client/` and an Express 5 / TypeScript API in `server/`. Prisma 6 maps Users, Sessions, Assets, Custodian assignments, BorrowRequests, and Loans to PostgreSQL (`server/prisma/schema.prisma`). The browser sends an HttpOnly cookie to the API; the API derives user identity and role from a PostgreSQL Session row. The client keeps the CSRF token in memory and restores it through `/api/auth/me` after a refresh. The current Sprint 1 scope is sign-in, catalog, requests, and custodian checkout.

## Six-point readiness audit

| Check | Result | Evidence and decision |
| --- | --- | --- |
| Persistent storage | **PASS** | All current application records, including sessions, are Prisma models backed by PostgreSQL (`server/prisma/schema.prisma`, `server/src/db.ts`). No upload endpoint or file-writing application path exists in `server/src/`; upload persistence is **not applicable** to the current Sprint 1 scope. Cloud SQL or another durable PostgreSQL service must be provisioned later. |
| Production-safe seed | **FIXED** | `server/prisma/seed.ts` upserts local synthetic users, assets, and custodian assignments; passwords come from `DEMO_BORROWER_PASSWORD` and `DEMO_CUSTODIAN_PASSWORD`. `server/prisma/seed-policy.ts` refuses the demo seed when `NODE_ENV=production`, so a production deployment cannot accidentally create or reset demo accounts. `server/tests/seed-policy.test.ts` checks this guard. Production account provisioning remains a separate operational task. |
| Production authentication | **PASS** | `server/src/auth.ts` verifies scrypt password hashes, uses random opaque tokens, stores only token hashes, checks Origin/CSRF for state changes, validates server-derived roles, and sets `Secure` cookies in production. `SESSION_CSRF_SECRET` is required and has no insecure fallback. No development login bypass was found. Set `APP_ORIGIN` to the real HTTPS client origin. |
| Persistent sessions | **PASS** | `Session` is a PostgreSQL model (`server/prisma/schema.prisma`); login creates a row, each protected request reads it, and logout deletes it (`server/src/auth.ts`). `server/tests/auth.test.ts` verifies persisted hashes, session reuse through `/me`, expiration, and revocation. No process-memory session store is used. |
| Cloud Run runtime | **FIXED** | `server/src/index.ts` reads `PORT` with a local 3000 default and binds `0.0.0.0`. `server/package.json` now builds runnable `dist/` JavaScript and starts it with `npm start`; `server/tsconfig.build.json` emits only API source. |
| Readiness endpoint | **FIXED** | `GET /api/ready` in `server/src/app.ts` executes `SELECT 1` through the existing Prisma client, returns 200 `{ "status": "ready" }` on success or 503 `{ "status": "unavailable" }` on failure, and does not expose connection errors. `server/tests/health.test.ts` covers both branches. `/api/health` remains a process-only health response. |

## Configuration inventory

| Variable | Used by | Purpose | Secret? | Source |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Prisma schema/client, test preflight | Durable PostgreSQL connection | Yes | Local `server/.env` / `.env.test`; later deployment secret |
| `APP_ORIGIN` | API CORS and Origin check | Exact browser origin, including scheme | No | Local `server/.env`; later deployment configuration |
| `SESSION_CSRF_SECRET` | API | HMAC key for CSRF tokens; at least 32 characters | Yes | Local `server/.env` / `.env.test`; later deployment secret |
| `SESSION_TTL_HOURS` | API | Session lifetime; defaults to 12 | No | Optional local/deployment configuration |
| `PORT` | API entry point | Listening port; defaults to 3000 locally | No | Local configuration; Cloud Run supplies it |
| `NODE_ENV` | API cookie and seed policy | Enables `Secure` cookies and blocks demo seed in production | No | Node deployment runtime; use `production` for deployment |
| `DEMO_BORROWER_PASSWORD` | Demo seed only | Local synthetic borrower password | Yes | Local `server/.env`; never production |
| `DEMO_CUSTODIAN_PASSWORD` | Demo seed only | Local synthetic custodian password | Yes | Local `server/.env`; never production |
| `VITE_API_BASE_URL` | Vite client | Public API origin compiled into browser assets | No | `client/.env` or build environment |

Only `VITE_API_BASE_URL` is read by the frontend. Never add database URLs, seed passwords, or `SESSION_CSRF_SECRET` to `VITE_` variables. The root `.gitignore` excludes real `.env` and `.env.*` files while allowing example files. `server/.env.example`, `server/.env.test.example`, and `client/.env.example` contain placeholders only. A production build must set `VITE_API_BASE_URL` to the HTTPS API origin; the current localhost fallback is for local development. The current `SameSite=Lax` session cookie requires a same-site browser/API deployment. If the later GCP design uses cross-site origins, cookie delivery and CSRF protection need an explicit design and browser verification before release.

## Local commands

Prerequisites: Node.js, npm, and PostgreSQL. Use a local database for development and a separate database whose name contains `test` for API tests. Keep all actual credentials in ignored local environment files.

```sh
cd server
npm ci
# Copy .env.example to .env, then set local values.
npx prisma generate
npm run db:migrate       # local development migrations
npm run db:seed          # local demo data only; refuses NODE_ENV=production
npm run dev              # watch mode
npm run typecheck
npm run build            # typecheck plus dist/ output
npm start                # run the built API
```

For an existing deployment database, apply checked-in migrations with `npm run db:deploy` instead of `db:migrate`. Do not run the demo seed in production. For API tests, copy `server/.env.test.example` to `.env.test`, set a dedicated test `DATABASE_URL`, apply migrations to that database, then run `npm test` from `server/`. Vitest loads `.env.test` and rejects a database name without `test`. After `npm run build`, `npm run test:ready:live` starts the built server twice and checks `/api/ready` against the test database and an unreachable connection, expecting 200 and 503.

```sh
cd client
npm ci
# Copy .env.example to .env if the API is not at the local default.
npm run dev
npm test
npm run build            # includes TypeScript checking
npm run lint
```

The backend does not store uploads. For the current data model, database durability and backups are the persistence requirement. Future upload features must choose durable storage before deployment.

## Target and pending deployment work

- GCP Project ID: `lab-5-cloud-deployment-514310`
- Intended region: `asia-southeast1`
- **Pending — Docker:** choose an image build and runtime layout in the later container episode. No Docker files are part of Episode 2.
- **Pending — GCP resources:** provision durable PostgreSQL, secrets, and Cloud Run services; set HTTPS origins and verify connectivity. No billing, IAM, Cloud SQL, or other GCP resources have been changed here.
- **Pending — CI/CD release procedure:** define build, migration, deployment, smoke-test, and rollback gates in the later episode. No CI/CD files are part of this change.
- **Pending — running commit identification:** record the immutable commit SHA and deployed image digest after an approved release. This working branch is not committed or deployed.

## PR preparation (local only)

- Title: `refactor: prepare KitLoop for cloud deployment`
- Base: `sprint-1-staging`; compare: `refactor/2-cloud-ready`; label: `lab5`
- Issue reference: `Part of #ISSUE_NUMBER` — replace after confirming the GitHub issue number.
- Summary: PostgreSQL-backed readiness check and tests; explicit Cloud Run bind address; runnable backend build/start; production demo-seed guard; safe environment examples; this deployment audit.
- Review: confirm Sprint 1 behavior and UI remain intact; verify the six checks against source and tests; check production environment and secret handling; confirm no Docker, CI/CD, or GCP work is represented as complete; review the baseline local changes separately before staging a commit.
- Known limitations: production database, account provisioning, HTTPS origins and cookie topology, Docker packaging, deployment, and CI/CD remain pending. The seed deliberately cannot provision production users. `main` and `sprint-1-staging` are not identical.

### Verification on this working tree

| Command | Result |
| --- | --- |
| `cd server && npm test` | 8 files, 58 tests passed after changes. Initial baseline run while client tests/builds ran concurrently: 53 passed, 2 timed out. |
| `cd server && npm run typecheck` | Passed. |
| `cd server && npm run build` | Passed; TypeScript check and `dist/` output. |
| `cd server && npm run test:ready:live` | 200 with the test PostgreSQL database; 503 with an unreachable database URL. |
| `cd client && npm test` | 4 files, 21 tests passed after changes. Initial concurrent baseline: 14 passed, 7 failed/timed out; the isolated rerun passed. |
| `cd client && npx tsc -b --pretty false` | Passed. |
| `cd client && npm run build` | Passed; includes TypeScript checking and Vite production output. |
| `cd client && npm run lint` | Passed. |
| `git diff --check` | Passed after implementation. |

### Proposed GitHub issue completion comment

Episode 2 cloud-readiness code is complete locally on `refactor/2-cloud-ready`. The API now has a PostgreSQL-backed `/api/ready` endpoint with 200/503 tests, binds the Cloud Run port on `0.0.0.0`, and has a production build/start path. The local demo seed is blocked in production; existing PostgreSQL sessions and authentication controls remain in place. Backend tests: 58/58 passed; frontend tests: 21/21 passed; both builds passed. Environment examples and `docs/labs/lab-05/deployment.md` document the verified settings. Docker, GCP resources, and CI/CD are pending later episodes. Confirm the reviewed commit SHA before posting this comment.
