# Lab 5, Episode 2: KitLoop cloud readiness

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
