#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/common.sh"
require_gcloud
require_command jq

# Branches whose pushed commits may be built and released.
RELEASE_BRANCHES=(feat/5-first-gcp-deployment sprint-1-staging)
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
      --substitutions="_APP_IMAGE=$app_image,_MIGRATION_IMAGE=$migrate_image"
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
    app_image="$(digest_for "$(image_for app "$sha")")"
    migrate_image="$(digest_for "$(image_for migration "$sha")")"
    require_successful_job kitloop-migrate "$migrate_image"
    bootstrap_execution="$(recorded_bootstrap)"
    [[ -n "$bootstrap_execution" ]] || \
      die "No verified production bootstrap is recorded on $SQL_INSTANCE. Run release.sh bootstrap SHA first."
    note "Production bootstrap previously verified: $bootstrap_execution"
    origin="$(canonical_url)"
    suffix="${sha:0:12}-$(date -u +%Y%m%d%H%M%S)"
    revision="$SERVICE-$suffix"
    # shellcheck disable=SC2054 # Commas are gcloud list syntax inside single arguments.
    deploy_args=(--project="$PROJECT" --region="$REGION" --image="$app_image" --service-account="$RUN_SA"
      --revision-suffix="$suffix"
      --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only
      --set-cloudsql-instances="$CONNECTION"
      --set-secrets=DATABASE_URL=kitloop-database-url:1,SESSION_CSRF_SECRET=kitloop-csrf:1
      --set-env-vars="NODE_ENV=production,APP_ORIGIN=$origin,SESSION_TTL_HOURS=12"
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
      token="$(identity_token)"
      http_checks "$candidate_url" "$token" || die "Candidate $revision failed its checks; traffic was not changed."
      unset token
      gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" \
        --to-revisions="$revision=100"
      service="$(service_json)"
      require_serving "$service" "$revision"
      if service_is_public; then now_public=yes; else now_public=no; fi
      [[ "$now_public" == "$was_public" ]] || die "Invoker access changed during deployment (public: $was_public -> $now_public)."
      if [[ "$was_public" == yes ]]; then
        http_checks "$origin" || die "Public checks failed after routing; roll back with: release.sh rollback ${previous%% *}"
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
    note "Currently serving: $(serving_revisions "$service" | tr '\n' ' ')"
    note "Routes 100% of traffic to $revision. This does not reverse a database migration. A later release.sh deploy moves traffic to its new revision after checks."
    confirm rollback
    gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" \
      --to-revisions="${revision}=100"
    service="$(service_json)"
    require_serving "$service" "$revision"
    if service_is_public; then
      bash "$script_dir/verify.sh" public
    else
      bash "$script_dir/verify.sh" private
    fi
    ;;
  *) die 'Usage: release.sh {build|migrate SHA|bootstrap SHA|deploy SHA|publish|rollback REVISION}' ;;
esac
