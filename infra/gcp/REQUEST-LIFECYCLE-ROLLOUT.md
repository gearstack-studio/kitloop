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

**Invariant.** A pre-lifecycle revision may receive traffic only after both of these hold:
1. A fresh, read-only check of the production database, run by `release.sh` in the same invocation, found **zero** request rows with `DECLINED`, `CANCELLED` or `EXPIRED`.
2. Nothing that could write such a row is running: no revision that can receive requests has lifecycle writes enabled, and no reconciliation job exists. A revision can receive requests through a traffic share **or a tag URL**. Cloud Run keeps tags across `update-traffic`, so after phase 2 → phase 1 the phase-2 revision normally still holds the `candidate` tag at 0% traffic. It still answers at `https://candidate---…run.app`, under the service's invoker policy.

The serving revision's `REQUEST_LIFECYCLE_WRITES` value is **not** evidence. Phase 1 writes nothing new, but rows written earlier by phase 2 remain. An operator's confirmation authorises a rollback; it never replaces the check.

| Target | Allowed when | Database check |
|---|---|---|
| Phase 1 or phase 2 revision (lifecycle-aware) | It's a ready KitLoop revision | Not needed: it reads every status |
| Pre-lifecycle revision (`8b6e5a9` and earlier) | No serving or tagged revision has writes enabled, **and** no `kitloop-reconcile` job exists, **and** the fresh check reports `lifecycleOnlyRows: 0` | **Required, every time** |
| The revision already serving 100% | Always (traffic doesn't change) | Not needed |

Once phase 2 has written any lifecycle row, **no pre-lifecycle revision is a safe target again**. Nothing deletes or rewrites those rows: terminal statuses aren't changed back to `PENDING`, enum values aren't dropped, and closure history isn't deleted. Roll back to a phase 1 revision instead.

### What `release.sh` enforces

- `deploy` always sets `REQUEST_LIFECYCLE_WRITES` from `KITLOOP_REQUEST_LIFECYCLE_WRITES` (default `disabled`) and refuses any other value.
- `deploy` with `enabled` is refused while any serving revision is pre-lifecycle, so the automatic rollback target in `deploy.yml` can always read lifecycle rows.
- **Release source verification.** `deploy`, `migrate` and `bootstrap` require a **resolvable local Git commit that contains the lifecycle migration**. Before any registry lookup or Cloud Run call, `release.sh` checks the supplied SHA:
  1. It must be 12–40 lowercase hex characters. Git must be available, and `release.sh` must run inside a clone of the repository.
  2. It must resolve, in that clone, to a single object whose ID starts with the input. An unknown SHA, an ambiguous abbreviation, or a ref name that only looks like a SHA is refused.
  3. That object must be a **commit**. A blob, tree or annotated tag object is refused.
  4. The commit must contain `server/prisma/migrations/20261121090000_request_lifecycle/migration.sql` as a file.

  The canonical 40-character SHA is then used for the image tags and the candidate's `/api/version` check. A registry image or an operator confirmation never substitutes for these checks. To release a commit that isn't in the clone, fetch it first (`git fetch origin`). Pre-lifecycle code reaches traffic only through the checked `rollback`.
- **Image provenance (limitation).** The image is selected by the tag `kitloop-app:<first 12 characters of the SHA>`, resolved to a digest. Before the new revision gets traffic, its self-reported `BUILD_COMMIT_SHA` (`/api/version`) must equal the verified full SHA. That isn't a signature: anyone who can push to Artifact Registry could publish a different image under a release tag with any `BUILD_COMMIT_SHA`. `prepare.sh` grants repository write access only to the Cloud Build service account, but project owners and editors can write too. The first deployment of a new service routes immediately and skips the candidate check.
- `rollback` to a pre-lifecycle revision runs this gate before any traffic change, whatever phase is serving:
  1. **Refuses** if any serving revision has `REQUEST_LIFECYCLE_WRITES=enabled`, because rows could be written after the check. Roll back to phase 1 first. It also **refuses** if a revision with writes enabled holds a tag at 0% traffic (normally `candidate` on the old phase-2 revision). Remove the tag first with `gcloud run services update-traffic kitloop --project=lab-5-cloud-deployment-514310 --region=asia-southeast1 --remove-tags=candidate`. Removing a tag doesn't move traffic, and the next `deploy` adds it back on its new revision.
  2. **Refuses** if Cloud Run jobs can't be listed, or if the reconciliation job `kitloop-reconcile` exists (it writes lifecycle rows). Delete it after reconciliation.
  3. Picks the check image: the image of a serving lifecycle-aware revision. If only pre-lifecycle revisions are serving, it uses `KITLOOP_ROLLBACK_CHECK_REVISION=<ready phase 1/2 revision>`, which **only selects the image**. Otherwise it refuses.
  4. Asks for the typed `rollback` confirmation.
  5. Deploys and executes the job `kitloop-rollback-check`: `node dist/lifecycle-cli.js rollback-check --require-zero --expect-database=kitloop`. It uses the runtime service account, the service's own `kitloop-database-url:1` secret and Cloud SQL connection, `--max-retries=0`, a 120-second task timeout and a 900-second client timeout.
  6. Accepts only a **new** execution that succeeded (`succeededCount 1`, `failedCount 0`, completed) with exactly that image, command `node` and those arguments. Anything else refuses: a failed, timed-out, unparseable or reused execution.
  7. Re-reads the whole traffic block (revisions, percentages **and tags**) and repeats steps 1–2. If anything changed during the check, it refuses.
  8. Only then calls `update-traffic`.

  Every refusal ends with *"Traffic was not changed."* The old `KITLOOP_CONFIRM_PRE_LIFECYCLE_ROLLBACK` bypass has been removed and no longer has any effect.

### The check itself

`rollback-check --require-zero --expect-database=NAME` runs in a PostgreSQL `READ ONLY` transaction, so the database rejects any write.
- It first compares `current_database()` with `NAME` and refuses (exit `2`, "nothing was checked") on a mismatch.
- It exits `0` only when `lifecycleOnlyRows` is `0`; exit `4` means lifecycle rows exist.
- It exits `1` when the database can't be reached or another error occurs.
- Its output is JSON counts per status plus a `SAFE`/`UNSAFE` line, never the connection string.

`release.sh` reads only the job execution's status, image, command and arguments, not log text.

**IAM.** The job runs as the runtime service account (`kitloop-run`), which already has Cloud SQL Client and access to `kitloop-database-url`. The operator, or the WIF deploy identity in `deploy.yml`, needs the job permissions it already uses for `kitloop-migrate`, plus `iam.serviceAccountUser` on `kitloop-run`, which deploys already require. Nothing new is granted.

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
| `rollback-check --require-zero --expect-database=NAME` | The gate `release.sh` runs (above). `READ ONLY` transaction; exit `0` only for zero lifecycle rows in `NAME` |
| `reconcile` | **Dry run** (the default) in a `READ ONLY` transaction: Before counts, stale and kept requests |
| `reconcile --apply --confirm-database=NAME` | Closes stale requests. Requires `REQUEST_LIFECYCLE_WRITES=enabled` and `NAME` = `current_database()` |
| `--asset=ID` (repeatable) | Restricts either command to the named assets, e.g. to retest one UAT example |

Exit codes: `0` success; `2` refused or invalid arguments (nothing written); `3` some assets still conflicted after 5 attempts (rerun); `1` unexpected error (the failing asset's transaction rolled back).

Run it as a one-off Cloud Run job using the release's **app image**, the runtime identity and the database secret. The template below follows the `kitloop-bootstrap` job in `release.sh`. **It has not been executed in GCP; review the IAM and arguments before using it.**

```bash
gcloud run jobs deploy kitloop-reconcile --project="$PROJECT" --region="$REGION" \
  --image="$APP_IMAGE_DIGEST" --service-account="$RUN_SA" \
  --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
  --set-cloudsql-instances="$CONNECTION" --set-secrets=DATABASE_URL=kitloop-database-url:1 \
  --set-env-vars=NODE_ENV=production,REQUEST_LIFECYCLE_WRITES=enabled \
  --command=node --args=dist/lifecycle-cli.js,reconcile --tasks=1 --max-retries=0 --task-timeout=10m
gcloud run jobs execute kitloop-reconcile --project="$PROJECT" --region="$REGION" --wait   # dry run; read the JSON in the job logs
# After review, re-deploy the job with --args=dist/lifecycle-cli.js,reconcile,--apply,--confirm-database=kitloop and execute it.
gcloud run jobs delete kitloop-reconcile --project="$PROJECT" --region="$REGION"          # required: release.sh refuses pre-lifecycle rollbacks while it exists
```

Keep the dry-run and apply JSON (Before/After counts and request IDs) as release evidence. Rerun the dry run afterwards and expect `staleOnActiveLoan: 0`, then **delete the job**. The output contains request, asset and borrower UUIDs but no credentials. Run reconciliation only while phase 2 is serving.

## Rollback procedures

- **Phase 2 has a problem.** Run `bash infra/gcp/release.sh rollback <phase-1 revision>`. Lifecycle rows stay readable; the UI stops offering cancel and decline; checkout stops auto-declining. Alternatively, redeploy the same SHA with `KITLOOP_REQUEST_LIFECYCLE_WRITES=disabled`.
- **Phase 1 has a problem, and phase 2 has never written a lifecycle row.** Run `bash infra/gcp/release.sh rollback <pre-lifecycle revision>`. `release.sh` runs the database check and moves traffic only if it reports zero lifecycle rows. If a phase-2 revision was ever deployed, first remove its `candidate` tag (see step 1 above); `release.sh` refuses while a writes-enabled revision is still reachable through a tag. The migration's extra enum values, nullable columns and constraint don't affect `8b6e5a9`; the real-server harness confirmed this with no 5xx.
- **Phase 1 has a problem, and phase 2 wrote lifecycle rows earlier.** A pre-lifecycle rollback is **not supported**: the check fails and `release.sh` refuses. Fix forward, or roll back to another phase 1 or phase 2 revision.
- **The check fails for a reason other than rows** (database unreachable, wrong database, timeout). The rollback is refused. Inspect the `kitloop-rollback-check` execution logs, fix the cause, and rerun. Don't bypass `release.sh`.
- **A pre-lifecycle revision is serving while lifecycle rows exist** (only possible through a manual Cloud Console traffic change that bypasses `release.sh`). Borrowers with closed requests get HTTP 500. Immediately route traffic to a phase 1 or phase 2 revision; that target needs no check. Don't edit request statuses.
- **The database migration itself** isn't reversed by any rollback. Its objects are additive and harmless to every revision listed above.

## Expiry is deferred

`EXPIRED` is reserved and nothing sets it: there's no timer, job or rule. Automatic expiry needs an approved, documented and configurable timeout policy (duration, configuration key, how it's evaluated), delivered as its own change. Until then, requests close only through checkout (the winner becomes `CHECKED_OUT`, competitors `DECLINED`), borrower cancel, custodian decline, or the reconciliation above. A request with no action stays `PENDING`.

## Later cleanup

Once no pre-lifecycle revision can be a rollback target (old revisions are retired and every environment has run phase 2), the flag's default can change to `enabled` and, later, the flag can be removed. Each step is a separate reviewed change.
