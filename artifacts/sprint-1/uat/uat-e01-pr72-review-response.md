Thanks for the careful review of `5738ee1`. Both findings are confirmed and addressed; details below.

### P1: rollback to the previous revision breaks request history

**Confirmed against the real previous revision, not only its client.** PR #72 wrote `DECLINED`/`CANCELLED` to an isolated database. Traffic then moved to the actual `8b6e5a9` server, which has its own install and generated Prisma client. Borrower B's `GET /api/requests/mine` and `GET /api/requests/:id` returned **500**. An already-deployed Prisma client can't be taught new enum values, so `8b6e5a9` can't be made compatible after the fact.

**Fix: a two-phase rollout of the same image**, controlled by `REQUEST_LIFECYCLE_WRITES` (`disabled` by default; any value other than `enabled`/`disabled` fails at startup):

- **Phase 1 (disabled).** The server reads every status but writes only `PENDING`/`CHECKED_OUT`, exactly as `8b6e5a9` does:
  - checkout doesn't auto-decline
  - cancel and decline return `404 LIFECYCLE_ACTIONS_DISABLED`
  - `/auth/me` and login send `features.requestLifecycleActions: false`, and the UI hides Cancel and Decline

  `8b6e5a9` therefore stays a safe rollback target, and phase 1 itself is a safe target **after** lifecycle rows exist.
- **Phase 2 (enabled).** The lifecycle behaviour as reviewed.
- **`release.sh` now carries the flag on every deploy** (`KITLOOP_REQUEST_LIFECYCLE_WRITES`, passed from a GitHub environment variable in `deploy.yml`).
  - It **refuses to enable phase 2 while a pre-lifecycle revision is serving**, so the automatic rollback target can always read lifecycle rows.
  - ~~It refuses to roll back to a pre-lifecycle revision while phase 2 is serving, unless the operator confirms `KITLOOP_CONFIRM_PRE_LIFECYCLE_ROLLBACK=no-lifecycle-rows`.~~ *Superseded after the re-review of `bbf8a36`; see `uat-e01-pr72-rereview-response.md`. Every pre-lifecycle rollback now requires a verified zero-row database check, and the bypass is removed.*
- Nothing rewrites terminal statuses to `PENDING`, drops enum values, or deletes closure data.

Real-server rollback matrix (isolated database):

| Data written by | Rollback target | Result |
|---|---|---|
| `5738ee1` (as reviewed) | `8b6e5a9` | 500 ✗ (your finding) |
| fix, phase 1 | `8b6e5a9` | no 5xx ✓ |
| fix, phase 2 | `8b6e5a9` | 500 ✗ (expected; now refused by `release.sh` and documented as unsafe) |
| fix, phase 2 | phase 1 revision | no 5xx ✓ (recommended target) |

Automated coverage:
- `server/tests/lifecycle-rollout.test.ts` generates the **`8b6e5a9` Prisma client from a verbatim copy of its schema** and asserts two things: it reads everything phase 1 writes, and it fails on `DECLINED` (the characterised hazard).
- `infra/gcp/guards.test.sh` has 7 new rollout and rollback cases.

Safe targets and the full procedure: `infra/gcp/REQUEST-LIFECYCLE-ROLLOUT.md`.

### P2: existing competing requests stay PENDING

Fixed with a **separately reviewed, explicitly executed reconciliation**, not a migration-time rewrite:
- Command: `node dist/lifecycle-cli.js reconcile` (dry run by default) and `reconcile --apply --confirm-database=<name>`.
- **Rule:** a `PENDING` request is stale when its asset has an **active** loan. It becomes `DECLINED` with `ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER`, `closedAt` = the reconciliation time, and `closedById = NULL` (system).
- Requests whose competing loan was **returned** stay `PENDING` (reported as `COMPETING_LOAN_RETURNED`). Terminal rows are never touched.

Safeguards:
- **Dry run** runs in a `READ ONLY` transaction.
- **Apply** requires `REQUEST_LIFECYCLE_WRITES=enabled` (so it can't create rows that `8b6e5a9` can't read) and a `--confirm-database` value matching `current_database()`.
- **Concurrency:** each asset is processed in a Serializable transaction that locks the `Asset` row first, as checkout does, and re-checks the rule under that lock. Conflicts with checkout, cancel or decline retry.
- **Idempotent:** a second run changes nothing.

Evidence on data created by the real `8b6e5a9` API:
- The migration left all 6 rows unchanged.
- The dry run found 2 stale and 1 kept request and changed nothing.
- Three refusals changed nothing.
- Apply closed 2 (Before: pending 4, stale 2 → After: pending 2, stale 0).
- A rerun closed 0.
- Team 7's example then shows `DECLINED` with the reason, is gone from the custodian queue, and checking it out returns 409.

Tests: `server/tests/reconcile-competing-requests.test.ts` covers dry run, refusals, apply, history preservation, idempotency, a race with borrower cancel, and a race with a concurrent checkout. Team 7's retest steps are in `artifacts/sprint-1/uat/uat-e01-team7-retest.md`.

### Expiry

`EXPIRED` stays reserved; nothing sets it, and no timeout was invented. Supported closures now are checkout, checkout auto-decline, borrower cancel, custodian decline (with reason) and the reconciliation. The deferral is written into the Team 7 retest note, ready to post on #61.

### Verification (isolated databases only)

- Server: 14 files, 106/106
- Client: 7 files, 42/42
- Browser E2E (Playwright): 31/31
- Server typecheck and build, client lint and build, E2E typecheck: clean
- Infra guard suites: pass, in WSL Ubuntu
- RED, captured before the fix: server 7 failed, the reconciliation module was missing, client 2 failed, and the first new guard case failed

Evidence: `artifacts/sprint-1/uat/uat-e01-review-red.txt`, `uat-e01-review-green.txt`; summary in `uat-e01-lab6-report.md` §11.

**Not verified:** the Cloud Run job template for the reconciliation hasn't been run in GCP, and the migration still hasn't been executed on PostgreSQL 12–17 (only on 18.4).
