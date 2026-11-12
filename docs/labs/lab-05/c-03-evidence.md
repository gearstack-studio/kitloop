# C-03 execution record

Status: **Local container verification passed on the final run; C-03 acceptance pending.** The implementation is uncommitted, so a clean-clone run against a candidate commit SHA is still required. A checkout concurrency failure occurred on earlier runs and remains unresolved.

Date: 2026-11-12 (Asia/Bangkok).

Implementation branch: `docker-containerization-for-kitloop`, based on `sprint-1-staging` at `17316f808bdc11044adc4faaf3c748b7679ae377`.

## Environment and scope

Windows host, WSL 3.0.5.0, Docker client/server 29.9.3, Compose v5.7.0. Docker Desktop was started after the initial unavailable-daemon attempt. Tests used the implementation working tree and a fresh `kitloop-c03` Compose project/volume. An ignored root `.env` was generated with random local test credentials. No credentials, cookies or CSRF tokens are reproduced here.

The working-tree test run started from the base SHA above. That base does **not** identify the Docker implementation as a tested commit. A candidate implementation commit and clean-clone verification must be recorded separately before C-03 acceptance.

## Commands and results

| Command | Result |
| --- | --- |
| `docker version` / `docker info --format '{{.ServerVersion}}'` | Initial daemon connection failed; after starting Docker Desktop, server 29.9.3 responded. |
| `docker compose version` | Docker Compose v5.7.0. |
| `docker compose --env-file .env.example --profile tools --profile test config --quiet` | Exit 0. Compose configuration valid with placeholder values. |
| `docker compose -p kitloop-c03 --profile tools --profile test config --quiet` | Exit 0 with generated local configuration. |
| `docker compose -p kitloop-c03 --profile tools build --pull` | Exit 0. API, web and tools images built. Server typecheck/compilation and client production build/lint passed. |
| `docker compose -p kitloop-c03 up -d --wait db` | Exit 0. New PostgreSQL volume initialized and database healthy. |
| `docker compose -p kitloop-c03 run --rm tools npm run db:deploy` | Exit 0. All three checked-in migrations applied to the fresh application database. |
| `docker compose -p kitloop-c03 run --rm tools npm run db:seed` | Exit 0. Synthetic accounts/assets seeded. |
| `docker compose -p kitloop-c03 --profile test build test client-test` | Exit 0. Both test images built. |
| `docker compose -p kitloop-c03 up -d --wait` | Exit 0. Database/API healthy; web available on host loopback port 8080. |
| `docker compose -p kitloop-c03 run --rm tools node scripts/verify-docker.mjs` | Exit 0. Frontend HTML, readiness, login/session write, persisted session authentication, seeded catalog reads and logout passed through Nginx. |
| `docker compose -p kitloop-c03 --profile test run --rm test` | Final run exit 0: 8 files / 58 tests passed. Live readiness returned expected 200 and 503. Earlier results and unresolved concurrency behavior are recorded below. |
| `docker compose -p kitloop-c03 --profile test run --rm client-test` | Final run exit 0: 4 files / 21 tests passed after setting the test-only absolute API base in Compose. |
| `docker compose -p kitloop-c03 restart api`, then `docker compose -p kitloop-c03 up -d --wait`, then the smoke command above | All exit 0. API recovered and full smoke passed after restart. |
| `Invoke-RestMethod http://localhost:8080/api/ready` | Returned `{"status":"ready"}`. |
| `git check-ignore .env server/.env client/.env` | All paths ignored. `git ls-files --stage .env server/.env client/.env` returned no tracked files. |
| `git diff --cached --check` | Exit 0. |

For each of `kitloop-c03-api`, `kitloop-c03-tools`, and `kitloop-c03-web`, ran `docker run --rm --entrypoint find IMAGE ROOT -type f -name '.env*'`, with `/app` for Node images and `/usr/share/nginx/html` for web. Filtering out `.example` files found no actual environment files. Read `docker image history --no-trunc --format '{{.CreatedBy}}' IMAGE` into memory and compared it with the local database URL, database password, CSRF secret and seed passwords. All three images passed with no matches. Only pass/fail output was recorded.

### Failures and limits

- The first frontend run passed 8/21 tests and failed 13 mocked workflow tests because the Docker same-origin build setting leaves `VITE_API_BASE_URL` empty, while the mocks call `new URL(input)` expecting an absolute URL. Setting `VITE_API_BASE_URL=http://localhost:3000` in the Compose `client-test` service fixed the test environment. The web build retains same-origin API access.
- The first backend run passed 57/58 tests. `rejects repeated and concurrent checkout of the same request` received `[201, 500]` instead of `[201, 409]`. A focused rerun reproduced it. Diagnostic runs and a subsequent complete run passed. **No checkout application fix was made, and the intermittent failure is still an open finding.** Temporary diagnostic mounts/logging were excluded from the final run and repository.
- Browser automation was attempted but reported `The browser access host is unavailable`. HTTP smoke verified application HTML and database-backed API actions. An actual browser borrow-request/refresh check is still pending.
- npm reported 3 high-severity server dependency advisories (also after production pruning) and 10 moderate client advisories during the locked dependency installs. Dependency upgrades were outside this containerization change.
- No candidate implementation commit SHA or clean-clone verification exists yet. Do not mark C-03 complete from this working-tree run.

## Required clean-clone follow-up

1. On a Docker-capable machine, clone the feature branch and record `git rev-parse HEAD` as the **tested commit SHA**. The base SHA above is provenance, not a tested implementation SHA.
2. Follow `deployment.md` using a fresh Compose project. Record configuration validation, build, migration, seed, container tests and startup commands with exit results. Resolve or explicitly triage the intermittent checkout failure above.
3. Run `docker compose run --rm tools node scripts/verify-docker.mjs`. It checks frontend HTML, database readiness, a login/session write, persisted session authentication, catalog reads, and logout without printing credentials or cookies.
4. Open the browser, sign in, create a borrow request, refresh request history, and record the results. Check readiness after an API restart.
5. Check Git ignores and inspect the images and image history for actual environment files/secrets. Store only sanitized pass/fail results, command names and commit SHA.
6. Add results here or to the PR and ask `yiiipunn` to review C-03 specifically. Keep C-03 pending until the run succeeds.
