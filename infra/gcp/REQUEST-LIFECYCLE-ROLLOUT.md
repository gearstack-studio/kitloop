# Request lifecycle rollout, rollback and reconciliation

This runbook covers releasing the request lifecycle from PR #72 (issue #61, UAT-E01). It replaces "roll back by moving traffic" for this release: once lifecycle data exists, only some revisions are safe rollback targets.

## Why a two-phase rollout

The lifecycle migration adds the `RequestStatus` values `DECLINED`, `CANCELLED` and `EXPIRED`. Revisions built before the lifecycle (**`8b6e5a9` and earlier**) run a Prisma client whose `RequestStatus` enum contains only `PENDING` and `CHECKED_OUT`. Reading any other value throws `Value 'DECLINED' not found in enum 'RequestStatus'`. After a traffic-only rollback to such a revision, `GET /api/requests/mine` and `GET /api/requests/:id` return **HTTP 500** for every borrower with a closed request. This was reproduced against the real `8b6e5a9` server; see `artifacts/sprint-1/uat/uat-e01-review-green.txt`.

An already-deployed Prisma client can't be made to read new enum values. The release is therefore split so that a lifecycle-aware revision always exists before any lifecycle value is written.

| Revision class | How to recognise it | Reads lifecycle statuses | Writes lifecycle statuses |
|---|---|---|---|
| **Pre-lifecycle**: `8b6e5a9` and earlier | No `REQUEST_LIFECYCLE_WRITES` env var on the Cloud Run revision | **No** (HTTP 500) | No |
| **Phase 1**, compatibility release | `REQUEST_LIFECYCLE_WRITES=disabled` (the default) | Yes | **No**: checkout leaves competing requests `PENDING` (Sprint 1 behaviour); cancel and decline return `404 LIFECYCLE_ACTIONS_DISABLED`; the UI hides both actions |
| **Phase 2**, lifecycle on | `REQUEST_LIFECYCLE_WRITES=enabled` | Yes | Yes: checkout auto-decline, borrower cancel, custodian decline, reconciliation |

Phase 1 and phase 2 are the **same image**. Only the env var differs, so moving between them is a redeploy or rollback that needs no new build or migration.

## Safe rollback targets

| Currently serving | Lifecycle rows in the database? | Safe targets | Unsafe targets |
|---|---|---|---|
| Phase 1 | None (`rollback-check` → `lifecycleOnlyRows: 0`) | Any earlier ready revision, including `8b6e5a9` | n/a |
| Phase 1 | Some (phase 2 ran earlier) | Phase 1 or phase 2 revisions only | Pre-lifecycle (`8b6e5a9` and earlier) |
| Phase 2 | Any | **A phase 1 revision (recommended)**, or another phase 2 revision | Pre-lifecycle, unless `rollback-check` reports `lifecycleOnlyRows: 0` |

`release.sh` enforces the common cases:

- `deploy` always sets `REQUEST_LIFECYCLE_WRITES` from `KITLOOP_REQUEST_LIFECYCLE_WRITES` (default `disabled`). It refuses any other value.
- `deploy` with `KITLOOP_REQUEST_LIFECYCLE_WRITES=enabled` is refused while any serving revision is pre-lifecycle. This guarantees the automatic rollback target in `deploy.yml` can read lifecycle rows.
- `rollback` to a pre-lifecycle revision is refused while a phase 2 revision is serving. It succeeds only with `KITLOOP_CONFIRM_PRE_LIFECYCLE_ROLLBACK=no-lifecycle-rows`, set after `rollback-check` reports `lifecycleOnlyRows: 0`.
- **Not enforced:** if phase 2 ran and the service was later moved back to phase 1, `release.sh` can't see that lifecycle rows exist. Before any rollback to a pre-lifecycle revision, always run `rollback-check`; the database is the ground truth.

Lifecycle data is never rewritten to make a rollback work. Terminal statuses aren't changed back to `PENDING`, enum values aren't dropped, and closure history isn't deleted. If lifecycle rows exist, the only safe rollback is to a lifecycle-aware revision.

## Procedure

Prerequisites: the reviewed PR is merged to `main`, a fresh Cloud SQL backup exists, and the operator has read this page.

### Phase 1, compatibility release

1. `bash infra/gcp/release.sh build`, then `release.sh migrate SHA`. The migration only adds objects and existing rows are unchanged. The still-serving pre-lifecycle revision keeps working, because no lifecycle value exists yet.
2. `release.sh deploy SHA`, with `KITLOOP_REQUEST_LIFECYCLE_WRITES` unset or `disabled`. In GitHub Actions, leave the `lab5-production` environment variable `KITLOOP_REQUEST_LIFECYCLE_WRITES` unset.
3. Verify: `verify.sh`, the borrower and custodian smoke checks, and `GET /api/auth/me` → `features.requestLifecycleActions: false`. Run `rollback-check` (below) and expect `lifecycleOnlyRows: 0`.
4. Record the phase 1 revision name. It's the rollback target for phase 2.

### Phase 2, enable lifecycle writes

1. With the phase 1 revision serving: `KITLOOP_REQUEST_LIFECYCLE_WRITES=enabled bash infra/gcp/release.sh deploy SHA` (same SHA). In GitHub Actions, set the environment variable to `enabled` **before** the next `main` deployment. Otherwise every automated deploy returns the service to phase 1.
2. Verify `features.requestLifecycleActions: true`, then cancel a test request and decline a test request.

### Reconcile pre-existing competing requests (after phase 2)

Requests that competed with a checkout made before phase 2 are still `PENDING` (review finding P2). Run the reviewed reconciliation as an explicit step, never as part of a migration.

**Rule:** a `PENDING` request is stale when its asset has an **active** loan (`returnedAt IS NULL`).
- **Stale requests** become `DECLINED`, with `closeReason = ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER`, `closedAt` = the reconciliation transaction time, and `closedById = NULL` (a system action).
- **Kept `PENDING`, reported as `COMPETING_LOAN_RETURNED`:** requests whose competing loan has been returned. They're fulfillable again.
- **Never touched:** requests that are already terminal.

Each asset is processed in its own Serializable transaction. The `Asset` row is locked first, as in checkout, and the rule is re-checked under that lock. A concurrent checkout, cancel or decline either finishes first or forces a retry, so no request is closed twice. The run is idempotent.

| Command (production image: `node dist/lifecycle-cli.js …`; local: `npm run lifecycle:dev -- …`) | Effect |
|---|---|
| `rollback-check` | Read-only. Counts per status, and whether pre-lifecycle revisions are still safe targets |
| `reconcile` | **Dry run** (the default) in a `READ ONLY` transaction: Before counts, stale and kept requests |
| `reconcile --apply --confirm-database=NAME` | Closes stale requests. Requires `REQUEST_LIFECYCLE_WRITES=enabled` and `NAME` = `current_database()` |
| `--asset=ID` (repeatable) | Restricts either command to the named assets, e.g. to retest one UAT example |

Exit codes: `0` success; `2` refused or invalid arguments (nothing written); `3` some assets still conflicted after 5 attempts (rerun); `1` unexpected error (the failing asset's transaction rolled back).

Run it as a one-off Cloud Run job using the release's **app image**, the runtime identity and the database secret. The template below follows the `kitloop-bootstrap` job in `release.sh`. **It has not been executed in GCP; review the IAM and arguments before using it.**

```bash
gcloud run jobs deploy kitloop-lifecycle --project="$PROJECT" --region="$REGION" \
  --image="$APP_IMAGE_DIGEST" --service-account="$RUN_SA" \
  --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
  --set-cloudsql-instances="$CONNECTION" --set-secrets=DATABASE_URL=kitloop-database-url:1 \
  --set-env-vars=NODE_ENV=production,REQUEST_LIFECYCLE_WRITES=enabled \
  --command=node --args=dist/lifecycle-cli.js,reconcile --tasks=1 --max-retries=0 --task-timeout=10m
gcloud run jobs execute kitloop-lifecycle --project="$PROJECT" --region="$REGION" --wait   # dry run; read the JSON in the job logs
# After review, re-deploy the job with --args=dist/lifecycle-cli.js,reconcile,--apply,--confirm-database=<db name> and execute it.
```

Keep the dry-run and apply JSON (Before/After counts and request IDs) as release evidence. Rerun the dry run afterwards and expect `staleOnActiveLoan: 0`. The output contains request, asset and borrower UUIDs but no credentials.

## Rollback procedures

- **Phase 2 has a problem.** Run `bash infra/gcp/release.sh rollback <phase-1 revision>`. Lifecycle rows stay readable; the UI stops offering cancel and decline; checkout stops auto-declining. Alternatively, redeploy the same SHA with `KITLOOP_REQUEST_LIFECYCLE_WRITES=disabled`.
- **Phase 1 has a problem, and phase 2 has never run** (`rollback-check` → `lifecycleOnlyRows: 0`). Rolling back to the previous pre-lifecycle revision is safe. The migration's extra enum values, nullable columns and constraint don't affect `8b6e5a9`; the harness confirmed this with no 5xx.
- **A pre-lifecycle revision is serving while lifecycle rows exist** (for example after a manual console change). Borrowers with closed requests get HTTP 500. Immediately route traffic to a phase 1 or phase 2 revision. Don't edit request statuses.
- **The database migration itself** isn't reversed by any rollback. Its objects are additive and harmless to every revision listed above.

## Expiry is deferred

`EXPIRED` is reserved and nothing sets it: there's no timer, job or rule. Automatic expiry needs an approved, documented and configurable timeout policy (duration, configuration key, how it's evaluated), delivered as its own change. Until then, requests close only through checkout (the winner becomes `CHECKED_OUT`, competitors `DECLINED`), borrower cancel, custodian decline, or the reconciliation above. A request with no action stays `PENDING`.

## Later cleanup

Once no pre-lifecycle revision can be a rollback target (old revisions are retired and every environment has run phase 2), the flag's default can change to `enabled` and, later, the flag can be removed. Each step is a separate reviewed change.
