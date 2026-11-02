# KitLoop

KitLoop is a web-based technology equipment inventory and borrowing system. The current Sprint 1 increment includes seeded Borrower/Custodian sign-in, protected catalog and request views, scoped checkout, and persistent loans. Return, search, reporting, and full inventory administration are scheduled later; see `docs/sprints/plan.md` for the draft plan and its allocation conflict.

## Local setup

Prerequisites: Node.js, npm, and PostgreSQL. From `server/`, install dependencies with `npm ci`, copy `.env.example` to `.env`, and set `DATABASE_URL`, `SESSION_CSRF_SECRET` (at least 32 characters), `DEMO_BORROWER_PASSWORD`, and `DEMO_CUSTODIAN_PASSWORD`. Use local synthetic credentials and keep `.env` out of version control. Set `APP_ORIGIN` to the client origin (default `http://localhost:5173`); `PORT` defaults to 3000 and `SESSION_TTL_HOURS` defaults to 12. The API requires the configured Origin for state-changing requests. In production, serve the client and API over HTTPS so the session cookie uses `Secure`.

Run `npx prisma generate`, `npm run db:deploy`, and `npm run db:seed` from `server/`. The seed creates `borrower.demo`, `borrower.other`, `custodian.demo`, and `custodian.other`, two synthetic assets, and distinct custodian assignments. Both Borrowers use `DEMO_BORROWER_PASSWORD`; both Custodians use `DEMO_CUSTODIAN_PASSWORD`. The seed is repeatable and stores salted password hashes. Start the API with `npm run dev`.

From `client/`, run `npm ci` and `npm run dev`. The UI targets `http://localhost:3000` by default; set `VITE_API_BASE_URL` if the API uses another origin. The browser uses an HttpOnly session cookie and an `X-CSRF-Token` header supplied by login or `/api/auth/me`. The token stays in memory and is restored after refresh through `/me`.

## Verification

Create a separate PostgreSQL test database with `test` in its name. From `server/`, copy `.env.test.example` to `.env.test` and set its test `DATABASE_URL`, `APP_ORIGIN`, and a distinct test `SESSION_CSRF_SECRET` of at least 32 characters. Apply migrations to that database with `npm run db:deploy` while `DATABASE_URL` points to the test database. `npm test` loads `.env.test` and rejects a database name without `test`; it must never target the development or production database. The integration suite creates and removes its own synthetic fixtures. Run `npm run build` in `server/`, and `npm run build` plus `npm run lint` in `client/`.

The session token is random and only its SHA-256 hash is stored in PostgreSQL. Logout deletes the current session; expiration is checked on every protected request. All protected domain routes validate the session and server-derived role. Borrower record reads and Custodian record reads use owner/asset-assignment filters in database queries. See `docs/sprints/sprint-1/FEAT-01-authentication.md` for the versioned contract, acceptance criteria, and test evidence.
