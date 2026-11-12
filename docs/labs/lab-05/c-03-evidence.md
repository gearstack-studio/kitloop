# C-03 execution record

Status: **Clean-clone container verification passed; C-03 review pending.** Tested implementation commit `aef044a51b1801c9f2eb5c01050db8c989d6255e`. A browser borrow-request/refresh check is pending, and a checkout concurrency failure occurred on earlier working-tree runs and remains unresolved.

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
- Clean-clone verification of the candidate commit is recorded below. C-03 acceptance still requires reviewer assessment of the browser check and the earlier intermittent checkout failure.

## Clean-clone candidate verification

Tested SHA: `aef044a51b1801c9f2eb5c01050db8c989d6255e`.

Cloned the pushed branch from GitHub into a new directory. `git status --porcelain` was empty before testing. Copied `.env.example` to ignored `.env` and filled local test values; used `APP_ORIGIN=http://localhost:8081`, `WEB_PORT=8081`, and the new `kitloop-c03-clean` Compose project to isolate containers and volumes from the earlier working-tree test. Docker reused available dependency/base-image build cache. No host dependencies, database or source files were copied into the clone.

| Command | Result |
| --- | --- |
| `git clone --branch docker-containerization-for-kitloop git@github.com:gearstack-studio/kitloop.git C:\SE\kitloop-c03-clean` | Exit 0. |
| `git rev-parse HEAD` | `aef044a51b1801c9f2eb5c01050db8c989d6255e` |
| `git status --porcelain` | Empty. |
| `docker compose -p kitloop-c03-clean --profile tools --profile test config --quiet` | Exit 0. |
| `docker compose -p kitloop-c03-clean --profile tools --profile test build` | Exit 0. All five application/tools/test images built. |
| `docker compose -p kitloop-c03-clean up -d --wait db` | Exit 0. Created a new volume and healthy PostgreSQL. |
| `docker compose -p kitloop-c03-clean run --rm tools npm run db:deploy` | Exit 0. Three migrations applied to the empty database. |
| `docker compose -p kitloop-c03-clean run --rm tools npm run db:seed` | Exit 0. Synthetic demo data seeded. |
| `docker compose -p kitloop-c03-clean up -d --wait` | Exit 0. Application available on port 8081, API and database healthy. |
| `docker compose -p kitloop-c03-clean run --rm tools node scripts/verify-docker.mjs` | Exit 0. HTML, readiness, session write/read, catalog read and logout passed. |
| `docker compose -p kitloop-c03-clean --profile test run --rm test` | Exit 0. 58/58 tests passed; live readiness returned expected 200 and 503. |
| `docker compose -p kitloop-c03-clean --profile test run --rm client-test` | Exit 0. 21/21 tests passed. |

The evidence update after this SHA changes documentation only. The tested application, Docker and Compose files are unchanged.

## Required clean-clone follow-up

1. Review the clean-clone results and tested SHA above. Resolve or explicitly triage the intermittent checkout failure from the earlier working-tree run.
2. Open the browser, sign in, create a borrow request, refresh request history, and record the results. Restart/readiness has already passed on the earlier working-tree stack.
3. Review the Git-ignore and image-secret inspection evidence above and repeat it on the clean-clone images if required for acceptance.
4. Ask `yiiipunn` to review C-03 specifically, including the pending browser action and known findings, before marking the issue accepted.
