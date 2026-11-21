#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/common.sh"
require_gcloud
require_command jq

# Branches whose pushed commits may be built and released.
RELEASE_BRANCHES=(main)
VERIFIED_EXECUTION=''

# A release must use a completed execution of the exact immutable image.
# Keep job descriptions in memory: they contain secret references and need no evidence dump.
require_successful_job() {
  local job="$1" expected_image="$2" execution_name execution
  execution_name="$(gcloud run jobs describe "$job" --project="$PROJECT" --region="$REGION" \
    --format='value(status.latestCreatedExecution.name)')" || die "Cannot inspect $job."
  [[ -n "$execution_name" ]] || die "$job has no execution."
  execution="$(gcloud run jobs executions describe "$execution_name" --project="$PROJECT" \
    --region="$REGION" --format=json)" || die "Cannot inspect the latest $job execution."
  jq -e --arg image "$expected_image" '
    ((.status.succeededCount // .succeededCount // 0) == 1) and
    ((.status.failedCount // .failedCount // 0) == 0) and
    ((.status.completionTime // .completionTime // "") != "") and
    ((.spec.template.spec.containers[0].image // .template.containers[0].image // "") == $image)
  ' <<<"$execution" >/dev/null || die "$job did not complete successfully with the expected image; release stopped."
  VERIFIED_EXECUTION="$execution_name"
  note "Verified completed $job execution: $execution_name"
}

# --- Pre-lifecycle rollback gate (PR #72 re-review P1) ----------------------------------------------------------------
# Invariant: a pre-lifecycle revision (no REQUEST_LIFECYCLE_WRITES; 8b6e5a9 and earlier) may receive traffic only after a
# fresh, read-only check of the production database ran successfully in this invocation and found ZERO request rows with
# lifecycle-only statuses, while nothing that could write such rows is running. The serving revision's flag is never
# evidence: phase 1 writes nothing new, but rows written earlier by phase 2 remain. Operator confirmation authorises the
# action; it never replaces the check.

# Refuses unless no lifecycle writer can run between the check and the traffic switch, or after it: no revision that
# can receive requests (a traffic share or a tag URL, which serves at 0% traffic) has writes enabled, and no
# reconciliation job exists. Prints the lifecycle-aware app image of a serving revision to run the check with.
pre_lifecycle_rollback_preflight() {
  local service="$1" rev tag state image="" source jobs
  while read -r rev tag; do
    [[ -n "$rev" ]] || continue
    state="$(revision_lifecycle "$rev")"
    if [[ "$state" == enabled && "$tag" == - ]]; then
      die "Refusing: serving revision $rev has lifecycle writes enabled, so lifecycle rows could be written after any \
check. Roll back to a phase-1 revision (REQUEST_LIFECYCLE_WRITES=disabled) first, then rerun. Traffic was not changed."
    elif [[ "$state" == enabled ]]; then
      die "Refusing: revision $rev has lifecycle writes enabled and is reachable through tag '$tag' at 0% traffic, so \
lifecycle rows could be written after any check. Remove the tag (gcloud run services update-traffic $SERVICE \
--project=$PROJECT --region=$REGION --remove-tags=$tag), then rerun. Traffic was not changed."
    fi
    if [[ -z "$image" && "$tag" == - && "$state" != absent ]]; then image="$(revision_image "$rev")"; fi
  done < <(reachable_revisions "$service")
  jobs="$(gcloud run jobs list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)')" || \
    die 'Cannot list Cloud Run jobs to rule out a running lifecycle writer. Traffic was not changed.'
  ! grep -qxF "$RECONCILE_JOB" <<<"$jobs" || die "Refusing: the reconciliation job $RECONCILE_JOB exists and writes \
lifecycle rows. Delete it after reconciliation (gcloud run jobs delete $RECONCILE_JOB), then rerun. Traffic was not changed."
  if [[ -z "$image" ]]; then
    source="${KITLOOP_ROLLBACK_CHECK_REVISION:-}"
    [[ -n "$source" ]] || die "No lifecycle-aware revision is serving, so the database check has no image to run. Set \
KITLOOP_ROLLBACK_CHECK_REVISION to a ready revision of the lifecycle release (it only selects the check image). Traffic was not changed."
    [[ "$source" =~ ^kitloop-[a-z0-9-]+$ ]] || die 'KITLOOP_ROLLBACK_CHECK_REVISION must be a KitLoop revision name. Traffic was not changed.'
    require_safe_revision "$source" "$(canonical_url)"
    [[ "$(revision_lifecycle "$source")" != absent ]] || die "$source predates the request lifecycle and cannot run the \
check. Traffic was not changed."
    image="$(revision_image "$source")"
  fi
  printf '%s' "$image"
}

# Runs 'lifecycle-cli rollback-check --require-zero' as a Cloud Run job against the service's database and accepts only
# a NEW execution that succeeded with exactly the expected image, command and arguments. The CLI exits 0 only for zero
# lifecycle-only rows in database $DB_NAME (READ ONLY transaction); rows present, a different database, an unreachable
# database or any error make the execution fail. Output is JSON counts only; credentials come from Secret Manager.
run_pre_lifecycle_rollback_check() {
  local image="$1" args previous latest execution
  args="dist/lifecycle-cli.js,rollback-check,--require-zero,--expect-database=$DB_NAME"
  gcloud run jobs deploy "$ROLLBACK_CHECK_JOB" --project="$PROJECT" --region="$REGION" \
    --image="$image" --service-account="$RUN_SA" \
    --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
    --set-cloudsql-instances="$CONNECTION" --set-secrets=DATABASE_URL=kitloop-database-url:1 \
    --set-env-vars=NODE_ENV=production --command=node --args="$args" \
    --tasks=1 --max-retries=0 --task-timeout=120s || die 'Cannot prepare the database check job. Traffic was not changed.'
  previous="$(gcloud run jobs describe "$ROLLBACK_CHECK_JOB" --project="$PROJECT" --region="$REGION" \
    --format='value(status.latestCreatedExecution.name)')" || die 'Cannot inspect the database check job. Traffic was not changed.'
  timeout 900 gcloud run jobs execute "$ROLLBACK_CHECK_JOB" --project="$PROJECT" --region="$REGION" --wait || \
    die "The database compatibility check did not pass: lifecycle-only rows exist, the database could not be verified, \
or the check failed or timed out. Inspect the $ROLLBACK_CHECK_JOB execution logs. Traffic was not changed."
  latest="$(gcloud run jobs describe "$ROLLBACK_CHECK_JOB" --project="$PROJECT" --region="$REGION" \
    --format='value(status.latestCreatedExecution.name)')" || die 'Cannot inspect the database check job. Traffic was not changed.'
  [[ -n "$latest" && "$latest" != "$previous" ]] || die 'No new database check execution was recorded. Traffic was not changed.'
  execution="$(gcloud run jobs executions describe "$latest" --project="$PROJECT" --region="$REGION" --format=json)" || \
    die "Cannot inspect database check execution $latest. Traffic was not changed."
  jq -e --arg image "$image" --arg args "$args" '
    (.status.succeededCount == 1) and ((.status.failedCount // 0) == 0) and ((.status.completionTime // "") != "") and
    (.spec.template.spec.containers[0].image == $image) and
    (.spec.template.spec.containers[0].command == ["node"]) and
    (.spec.template.spec.containers[0].args == ($args | split(",")))
  ' <<<"$execution" >/dev/null 2>&1 || die "Database check execution $latest could not be verified as a successful \
zero-row check. Traffic was not changed."
  note "Verified database check $latest: zero lifecycle-only request rows in database $DB_NAME."
}

# The verified bootstrap is recorded on the Cloud SQL instance it provisioned. Later releases rely on
# that record instead of the one-time job, its revoked manifest access, or the Cloud Run service.
recorded_bootstrap() {
  local instance
  instance="$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" --format=json)" || \
    die 'Cannot read the Cloud SQL bootstrap record.'
  jq -r --arg key "$BOOTSTRAP_LABEL" '.settings.userLabels[$key] // ""' <<<"$instance"
}

action="${1:-}"
case "$action" in
  build)
    require_command git
    branch="$(git branch --show-current)"
    [[ " ${RELEASE_BRANCHES[*]} " == *" $branch "* ]] || \
      die "Build from one of: ${RELEASE_BRANCHES[*]} (found: ${branch:-detached HEAD})."
    [[ -z "$(git status --porcelain)" ]] || die 'Build source is dirty. Use a clean clone of the reviewed commit.'
    sha="$(git rev-parse HEAD)"
    git merge-base --is-ancestor "$sha" "origin/$branch" 2>/dev/null || \
      die "Commit $sha is not on origin/$branch. Push the reviewed commit and run git fetch first."
    app_image="$(image_for app "${sha:0:12}")"
    migrate_image="$(image_for migration "${sha:0:12}")"
    grep -q 'AS production' Dockerfile || die 'Production Docker target is missing.'
    grep -q 'AS migration' Dockerfile || die 'Migration Docker target is missing.'
    gcloud storage buckets describe "gs://$BUILD_SOURCE_BUCKET" --project="$PROJECT" >/dev/null || \
      die 'Dedicated Cloud Build source bucket is missing.'
    note "Building and pushing commit $sha from $branch with Cloud Build. Cloud Build minutes and image storage may incur charges."
    confirm build
    gcloud builds submit . --project="$PROJECT" --region="$REGION" \
      --gcs-source-staging-dir="gs://$BUILD_SOURCE_BUCKET/source" --ignore-file=.gcloudignore \
      --service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA" \
      --config=infra/gcp/cloudbuild.yaml \
      --substitutions="_APP_IMAGE=$app_image,_MIGRATION_IMAGE=$migrate_image,_SOURCE_SHA=$sha"
    printf 'Source SHA: %s\nApp digest: %s\nMigration digest: %s\n' \
      "$sha" "$(digest_for "$app_image")" "$(digest_for "$migrate_image")"
    ;;
  migrate)
    sha="${2:-}"
    migrate_image="$(digest_for "$(image_for migration "$sha")")"
    gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" --format='value(state)' | grep -qx RUNNABLE || \
      die 'Cloud SQL is not RUNNABLE.'
    note 'Runs checked-in Prisma migrations against the production database while any current revision keeps serving. Migrations must stay backward compatible with that revision. Review migration SQL and backup status first. Do not run db:seed.'
    confirm migrate
    gcloud run jobs deploy kitloop-migrate --project="$PROJECT" --region="$REGION" \
      --image="$migrate_image" --service-account="$MIGRATE_SA" \
      --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
      --set-cloudsql-instances="$CONNECTION" \
      --set-secrets=DATABASE_URL=kitloop-database-url:1 \
      --set-env-vars=NODE_ENV=production \
      --command='' --args='' --tasks=1 --max-retries=0 --task-timeout=10m
    gcloud run jobs execute kitloop-migrate --project="$PROJECT" --region="$REGION" --wait
    require_successful_job kitloop-migrate "$migrate_image"
    ;;
  bootstrap)
    sha="${2:-}"
    migrate_image="$(digest_for "$(image_for migration "$sha")")"
    app_image="$(digest_for "$(image_for app "$sha")")"
    grep -q '"db:bootstrap"' server/package.json || \
      die 'Production db:bootstrap command is missing.'
    require_successful_job kitloop-migrate "$migrate_image"
    note "One-time production account and asset provisioning. Existing passwords and records are preserved. On success, the execution is recorded as Cloud SQL label $BOOTSTRAP_LABEL."
    confirm bootstrap
    gcloud run jobs deploy kitloop-bootstrap --project="$PROJECT" --region="$REGION" \
      --image="$app_image" --service-account="$BOOTSTRAP_SA" \
      --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
      --set-cloudsql-instances="$CONNECTION" \
      --set-secrets=DATABASE_URL=kitloop-database-url:1,BOOTSTRAP_INPUT=kitloop-bootstrap-input:1 \
      --set-env-vars=NODE_ENV=production \
      --command=node --args=dist/bootstrap-cli.js --tasks=1 --max-retries=0 --task-timeout=10m
    gcloud run jobs execute kitloop-bootstrap --project="$PROJECT" --region="$REGION" --wait
    require_successful_job kitloop-bootstrap "$app_image"
    execution="$VERIFIED_EXECUTION"
    [[ "$execution" =~ ^[a-z0-9_-]{1,63}$ ]] || die "Execution name $execution cannot be recorded as a label."
    gcloud sql instances patch "$SQL_INSTANCE" --project="$PROJECT" \
      --update-labels="$BOOTSTRAP_LABEL=$execution"
    [[ "$(recorded_bootstrap)" == "$execution" ]] || \
      die 'Bootstrap succeeded but its record was not saved. Rerun bootstrap (it preserves existing records).'
    printf 'Bootstrap execution: %s (recorded on %s)\n' "$execution" "$SQL_INSTANCE"
    ;;
  deploy)
    sha="${2:-}"
    [[ "$sha" =~ ^[0-9a-f]{12,40}$ ]] || die 'Use a 12-40 character lowercase Git commit SHA.'
    if [[ "${#sha}" -lt 40 ]]; then
      require_command git
      sha="$(git rev-parse --verify "$sha^{commit}")" || die 'Cannot resolve the release commit. Fetch the source repository or pass the full SHA.'
    fi
    # PR #72 re-review P1: pre-lifecycle code must not reach traffic by redeploying an old commit, which would skip the
    # database check (and would wrongly be labelled REQUEST_LIFECYCLE_WRITES). Known commits without the lifecycle
    # migration are refused; use 'release.sh rollback REVISION', which verifies the database first.
    if git -C "$script_dir" cat-file -e "$sha^{commit}" 2>/dev/null && \
       ! git -C "$script_dir" cat-file -e "$sha:$LIFECYCLE_MIGRATION" 2>/dev/null; then
      die "Commit $sha predates the request lifecycle. Pre-lifecycle code may only receive traffic through \
'release.sh rollback REVISION', which first verifies the database. Traffic was not changed."
    fi
    app_image="$(digest_for "$(image_for app "$sha")")"
    migrate_image="$(digest_for "$(image_for migration "$sha")")"
    require_successful_job kitloop-migrate "$migrate_image"
    bootstrap_execution="$(recorded_bootstrap)"
    [[ -n "$bootstrap_execution" ]] || \
      die "No verified production bootstrap is recorded on $SQL_INSTANCE. Run release.sh bootstrap SHA first."
    note "Production bootstrap previously verified: $bootstrap_execution"
    origin="$(canonical_url)"
    lifecycle="$(lifecycle_writes_setting)"
    note "Request lifecycle writes: $lifecycle (KITLOOP_REQUEST_LIFECYCLE_WRITES)."
    if [[ "$lifecycle" == enabled ]] && service_exists; then
      # Phase 2 needs a phase-1 (lifecycle-aware) revision serving, so the automatic and manual rollback target can read
      # lifecycle rows. A pre-lifecycle revision serving here would become the rollback target and return 500.
      for serving_revision in $(serving_revisions "$(service_json)" | cut -d' ' -f1); do
        [[ "$(revision_lifecycle "$serving_revision")" != absent ]] || die "Serving revision $serving_revision predates the \
request lifecycle. Deploy this commit with KITLOOP_REQUEST_LIFECYCLE_WRITES=disabled first (phase 1), verify it, then \
redeploy with enabled. Traffic was not changed."
      done
    fi
    suffix="${sha:0:12}-$(date -u +%Y%m%d%H%M%S)"
    revision="$SERVICE-$suffix"
    # shellcheck disable=SC2054 # Commas are gcloud list syntax inside single arguments.
    deploy_args=(--project="$PROJECT" --region="$REGION" --image="$app_image" --service-account="$RUN_SA"
      --revision-suffix="$suffix"
      --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only
      --set-cloudsql-instances="$CONNECTION"
      --set-secrets=DATABASE_URL=kitloop-database-url:1,SESSION_CSRF_SECRET=kitloop-csrf:1
      --set-env-vars="NODE_ENV=production,APP_ORIGIN=$origin,SESSION_TTL_HOURS=12,REQUEST_LIFECYCLE_WRITES=$lifecycle"
      --port=8080 --cpu=1 --memory=512Mi --concurrency=10 --min-instances=0 --max-instances=2)
    if ! service_exists; then
      note "First deployment: creates a PRIVATE service with APP_ORIGIN=$origin. Cloud Run routes the first revision immediately, but nobody can invoke it until release.sh publish."
      confirm deploy
      gcloud run deploy "$SERVICE" "${deploy_args[@]}" --no-allow-unauthenticated
      service="$(service_json)"
      require_service_url "$service" "$origin"
      require_safe_revision "$revision" "$origin" "$app_image"
      require_serving "$service" "$revision"
      printf 'First private revision: %s\nCanonical URL: %s\nApp digest: %s\n' "$revision" "$origin" "$app_image"
      note 'Next: verify.sh private, browser checks with an identity token or proxy, then release.sh publish.'
    else
      service="$(service_json)"
      require_service_url "$service" "$origin"
      previous="$(serving_revisions "$service" | tr '\n' ' ')"
      if service_is_public; then was_public=yes; else was_public=no; fi
      note "Existing service (public: $was_public; serving: ${previous:-none}). The new revision gets 0% traffic and tag '$CANDIDATE_TAG' until its health and database readiness checks pass. Invoker IAM is not changed."
      confirm deploy
      gcloud run deploy "$SERVICE" "${deploy_args[@]}" --no-traffic --tag="$CANDIDATE_TAG"
      require_safe_revision "$revision" "$origin" "$app_image"
      service="$(service_json)"
      candidate_url="$(jq -r --arg tag "$CANDIDATE_TAG" --arg revision "$revision" \
        '.status.traffic[]? | select(.tag == $tag and .revisionName == $revision) | .url' <<<"$service")"
      [[ "$candidate_url" == https://* ]] || die "Candidate URL for $revision is unavailable; traffic was not changed."
      # Cloud Run tag URLs accept tokens whose audience is the service URL, not the tag URL.
      token="$(identity_token "$origin")"
      http_checks "$candidate_url" "$token" "$sha" || die "Candidate $revision failed its checks; traffic was not changed."
      unset token
      gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" \
        --to-revisions="$revision=100"
      service="$(service_json)"
      require_serving "$service" "$revision"
      if service_is_public; then now_public=yes; else now_public=no; fi
      [[ "$now_public" == "$was_public" ]] || die "Invoker access changed during deployment (public: $was_public -> $now_public)."
      if [[ "$was_public" == yes ]]; then
        http_checks "$origin" "" "$sha" || die "Public checks failed after routing; roll back with: release.sh rollback ${previous%% *}"
      fi
      printf 'Serving revision: %s (100%%)\nPrevious: %s\nCanonical URL: %s\nApp digest: %s\n' \
        "$revision" "${previous:-none}" "$origin" "$app_image"
    fi
    ;;
  publish)
    note 'Makes the application publicly invokable. Confirm production account bootstrap and private health/readiness first.'
    bash "$script_dir/verify.sh" private
    confirm publish
    gcloud run services add-iam-policy-binding "$SERVICE" --project="$PROJECT" --region="$REGION" \
      --member=allUsers --role=roles/run.invoker >/dev/null
    bash "$script_dir/verify.sh" public
    ;;
  rollback)
    revision="${2:-}"
    [[ "$revision" =~ ^kitloop-[a-z0-9-]+$ ]] || die 'Pass an existing KitLoop revision name.'
    origin="$(canonical_url)"
    require_safe_revision "$revision" "$origin"
    service="$(service_json)"
    serving="$(serving_revisions "$service")"
    traffic_before="$(traffic_snapshot "$service")"
    note "Currently serving: $(tr '\n' ' ' <<<"$serving")"
    if [[ "$serving" == "$revision 100" ]]; then
      note "$revision already serves 100% of traffic; traffic is not changed."
    else
      check_image=""
      if [[ "$(revision_lifecycle "$revision")" == absent ]]; then
        # PR #72 re-review P1: pre-lifecycle code returns 500 for borrowers with DECLINED/CANCELLED/EXPIRED requests.
        note "$revision predates the request lifecycle. Traffic moves only after a fresh read-only check of database \
$DB_NAME finds zero DECLINED/CANCELLED/EXPIRED request rows."
        check_image="$(pre_lifecycle_rollback_preflight "$service")"
      fi
      note "Routes 100% of traffic to $revision. This does not reverse a database migration. A later release.sh deploy moves traffic to its new revision after checks."
      confirm rollback
      if [[ -n "$check_image" ]]; then
        run_pre_lifecycle_rollback_check "$check_image"
        # Nothing may have changed between the check and the switch: same traffic and tags, still no lifecycle writer.
        service="$(service_json)"
        [[ "$(traffic_snapshot "$service")" == "$traffic_before" ]] || \
          die 'Serving revisions or tags changed during the database check. Traffic was not changed; rerun the rollback.'
        pre_lifecycle_rollback_preflight "$service" >/dev/null
      fi
      gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" \
        --to-revisions="${revision}=100"
      service="$(service_json)"
    fi
    require_serving "$service" "$revision"
    if service_is_public; then
      bash "$script_dir/verify.sh" public
    else
      bash "$script_dir/verify.sh" private
    fi
    ;;
  *) die 'Usage: release.sh {build|migrate SHA|bootstrap SHA|deploy SHA|publish|rollback REVISION}' ;;
esac
