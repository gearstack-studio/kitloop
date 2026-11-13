# Lab 5 deployment

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
