# FEAT-03 verification record

Date: 2026-11-03. Base: `sprint-1-staging` at `6524ef8`. Branch: `feature/borrow-request-workflow`.

## Executed checks

| Check | Result |
| --- | --- |
| Isolated PostgreSQL migration deployment, `npm run db:deploy` in `server/` | Both auth baseline and unique-pending-request migrations applied successfully to `kitloop_f03_test`. |
| `npm test` in `server/` | 40 tests passed across 5 files: existing 31 tests plus 9 request-workflow/validation tests. |
| `npm run build` in `server/` | Passed (`tsc --noEmit`). |
| `npm test` in `client/` | 10 tests passed across 2 files: request component tests and app workflow tests with mocked HTTP. |
| `npm run build` in `client/` | Passed (TypeScript and Vite production build). |
| `npm run lint` in `client/` | Passed. |

Backend integration tests use actual PostgreSQL and synthetic fixtures. They check persisted pending requests, same-borrower duplicate rejection (including concurrency and direct database constraint checks), different-borrower competition, invalid/unavailable assets, ownership/scope/CSRF/role restrictions, checkout fulfillment and single active loan, rollback after an injected database failure, and sanitized errors. Test fixture rows and the rollback trigger/function are removed after use.

Client tests use jsdom, React Testing Library, and mocked HTTP responses. They verify available selection, pending exclusion, disabled submission, history/status rendering, loading/error/retry/empty states, success refresh, 409 recovery, expired-session cleanup, successful write followed by failed refresh, fresh-page history, and ignoring old-session responses after logout/account change. These are automated component/app integration checks, not live-browser end-to-end evidence.

## Limits and review gates

- This record does not claim strict TDD: tests and implementation were developed in the same working branch without a retained failing-baseline commit.
- Initial verification attempts failed because Prisma generation/network access and the temporary PostgreSQL startup were not ready. They are not passing evidence; the results above are from successful reruns after environment setup.
- A duplicate-pending migration was verified against a fresh test database. Existing deployments need the duplicate-data preflight in the [feature contract](../../../docs/sprints/sprint-1/FEAT-03-borrow-request-workflow.md); migration does not delete records.
- Different borrowers may retain pending requests for the same asset. This is the documented BR-10 interpretation; requests do not reserve equipment.
- Live-browser borrower/custodian smoke verification, teammate review, PR approval, and merge remain pending.
