# Episode 8 — live persistence and traffic recovery

Issue [#40](https://github.com/gearstack-studio/kitloop/issues/40). Developer DEV4952, reviewer yiiipunn. Branch `feat/8-persistence-rollback`, integrated with `sprint-1-staging`.

## Current evidence

The selected request **passed baseline, controlled same-image restart and main-pipeline redeployment**. The original [baseline](evidence/persistence/baseline.json), [restart](evidence/persistence/after-restart.json), [UI screenshot](evidence/persistence/baseline-ui.png) and public-readiness evidence are preserved. The private verifier produced [after-redeploy.json](evidence/persistence/after-redeploy.json) at `2026-11-15T15:23:22.831879+00:00`, using harness commit `81e57bdc0225675cccbc5daf79152310d809bd11`.

All three reports match request `899544f9-d5a8-4248-829e-db75a44cbbf1`, database `lab-5-cloud-deployment-514310:asia-southeast1:kitloop-pg` and fingerprint `8ed64726bbc9291bc61aca6f41825e7e95cb5261d0ca03f0d1816e61ff9c81ed`. The restart uses a new revision with the baseline image/source. The redeployment uses source `be72f87e15a6ea0efdac75ac38e51ad2e5a03949`, revision `kitloop-be72f87e15a6-20261115143840` and app digest `sha256:f149e6dba8e94305b2ee817f4c371cd5764ebdf5b2224cd1f16b42677ebeb46b`, linked to [successful run 43717180011 attempt 2](https://github.com/gearstack-studio/kitloop/actions/runs/43717180011/attempts/2). The earlier skipped deployment is historical, not redeployment proof.

[Issue #40's verified evidence](https://github.com/gearstack-studio/kitloop/issues/40#issuecomment-6896828582) records artifact checksums and comparison results. Live rollback/roll-forward was **NOT EXECUTED**; [the proposed deferral](https://github.com/gearstack-studio/kitloop/issues/38#issuecomment-6896642784) awaits explicit DEV4952 acceptance. Independent yiiipunn review and this evidence PR's merge remain pending. No new cloud operation or credential access was performed to prepare this documentation update.

This branch prepares a read-only evidence capture tool and its offline regression tests. `infra/gcp/persistence/verify.py` reads Cloud Run, Artifact Registry and Cloud SQL metadata, checks a selected application record, and writes sanitized JSON. It prompts for a synthetic borrower's password without saving it, keeps cookies in memory, and attempts logout after each observation. It does not create the domain record or change cloud resources.

## Preconditions

1. Have yiiipunn complete first deployment and the main pipeline under #31/#38, and verify the required controls from #35. Use the approved public application origin and a synthetic borrower account from the team's password manager. Do not use demo seeding in production.
2. Use a current Cloud Shell checkout of the reviewed test code with Python 3.10+, gcloud, an authenticated operator, and read access to the named service, revisions, images, SQL instance and backups. Each gcloud call explicitly targets the lab project. The verifier service account from Episode 6 only reads project metadata and is not the operator identity for this inventory.
3. Record the first running release's full source SHA and immutable app digest. The public GitHub API must confirm the full SHA exists in main's history. A single ready revision must receive 100% traffic. The image must be the expected registry digest, matching its source-SHA tag. The revision's APP_ORIGIN and Cloud SQL connection must match the test's target.
4. Review backup freshness and migration compatibility. The tool records a successful backup ID/time; it does not assert a maximum backup age or validate restoration.
5. Obtain authorization for the exact controlled restart, main redeploy, and any rollback/roll-forward before performing those operations. Public URL observation and evidence collection are separate from those mutations. Keep the test record unchanged throughout the sequence.

## A. Create the baseline through the UI

Sign in as the synthetic borrower, request a designated test asset, and capture the resulting **Request UUID** displayed under My requests. Capture a screenshot showing the public URL, UUID, asset and status. Exclude passwords, cookies, tokens, personal accounts and browser request headers. Do not check out or modify this request while testing.

From the repository root in Cloud Shell:

```bash
read -r -p 'Verified public HTTPS origin: ' APP_URL
read -r -p 'Baseline full source SHA: ' BASE_SHA
read -r -p 'Synthetic Request UUID from My requests: ' REQUEST_ID
EVIDENCE_DIR="$HOME/kitloop-e8-evidence"

python3 -B infra/gcp/persistence/verify.py baseline \
  --url "$APP_URL" --source-sha "$BASE_SHA" --request-id "$REQUEST_ID" \
  --evidence-dir "$EVIDENCE_DIR"
```

The program prompts for the synthetic username/password after public HTTP checks pass. It compares the persisted request's UUID, borrower ID, asset ID, submitted timestamp and status through a SHA-256 fingerprint. Only the test UUID and hash are recorded, not raw borrower details, credentials, cookies, response bodies or environment values. Baseline and later successful phase files are exclusive and cannot be overwritten. Retain failed-attempt JSON alongside successful evidence.

## B. Controlled application restart using the same image

The supported restart method creates a new serving revision/process from the **same already-published source SHA and image digest**, using the existing reviewed release helper. It leaves PostgreSQL and migrations untouched. Obtain approval first and do not rebuild or retag the baseline image between observations.

```bash
# Authorized operator only. The existing helper prompts before mutation,
# checks the candidate, and routes traffic only after readiness passes.
bash infra/gcp/release.sh deploy "$BASE_SHA"

# Run only after the preceding operation succeeds.
python3 -B infra/gcp/persistence/verify.py after-restart \
  --url "$APP_URL" --source-sha "$BASE_SHA" --request-id "$REQUEST_ID" \
  --evidence-dir "$EVIDENCE_DIR"
```

Capture the same UI record again. The check requires a new serving revision with unchanged image/source, database, record identity and fingerprint. Cloud Run process restarts within an unchanged revision are not the restart mechanism verified by this procedure.

## C. Reviewed main pipeline redeployment

Use the reviewed release path from staging into main and the protected `lab5-production` environment described in [Episode 7](episode-7-deployment.md). Wait for the actual deployment job to complete successfully. Record the run ID and full deployed SHA from its evidence, then capture the same UI record and run:

```bash
read -r -p 'Deployed full main source SHA: ' RELEASE_SHA
read -r -p 'Successful Main Cloud Run Deployment run ID: ' RELEASE_RUN
python3 -B infra/gcp/persistence/verify.py after-redeploy \
  --url "$APP_URL" --source-sha "$RELEASE_SHA" --request-id "$REQUEST_ID" \
  --release-run "$RELEASE_RUN" --evidence-dir "$EVIDENCE_DIR"
```

The public GitHub API verifies the run's SHA, main push context, workflow path, successful deployment job and successful build/migrate/deploy/verify steps. A green CI run with the deployment job skipped is rejected. The serving revision must be newly created during that deployment attempt and differ from both earlier observations. Traffic is read again after the application observation; a concurrent revision change invalidates the capture. The tool cannot independently certify a human approval or all branch rules; retain their actual review/environment evidence separately.

## D. Optional approved traffic rollback and roll-forward

Review the baseline revision against the **current** database schema and record compatibility/backup approval before proceeding. Traffic rollback does not reverse migrations. If compatibility or authority is unknown, record `DEFERRED` and the reason; the issue permits documenting this deferral.

```bash
BASE_REV="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["revision"])' "$EVIDENCE_DIR/baseline.json")"
bash infra/gcp/release.sh rollback "$BASE_REV"
python3 -B infra/gcp/persistence/verify.py after-rollback \
  --url "$APP_URL" --source-sha "$BASE_SHA" --request-id "$REQUEST_ID" \
  --evidence-dir "$EVIDENCE_DIR"

RELEASE_REV="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["revision"])' "$EVIDENCE_DIR/after-redeploy.json")"
bash infra/gcp/release.sh rollback "$RELEASE_REV"
python3 -B infra/gcp/persistence/verify.py after-rollforward \
  --url "$APP_URL" --source-sha "$RELEASE_SHA" --request-id "$REQUEST_ID" \
  --evidence-dir "$EVIDENCE_DIR"
```

Run one command at a time and stop on failure. The first check requires the exact baseline revision/image/source; the second requires the recorded main deployment revision/image/source. Capture the same record in the UI at both points.

## Evidence and completion

Use [the evidence checklist](evidence/persistence/README.md). Review sanitized JSON and screenshots before attaching them to #40 and its PR. Include operator command/result, full source SHAs, image digests, revisions, public origin, record UUID, database identity, backup timestamp, workflow attempt URL, UI before/after observations and teammate review. Record the reviewed harness commit SHA as well. A reported PASS is an observation of the selected record and snapshot, not an exhaustive database audit or a session-persistence test.

Offline validation:

```bash
python3 -B -m unittest discover -s infra/gcp/persistence -p 'test_*.py' -v
git diff --check
```

CI runs these model/HTTP-mock tests without cloud credentials. They cover phase order, changed records, restart image consistency, exact rollback targets, skipped deployment jobs, stale revisions, split traffic, immutable-image/source matching, sanitization and non-overwriting evidence. They do not establish live C-05. Keep #40 open until baseline/restart/redeploy evidence and yiiipunn's review exist.
