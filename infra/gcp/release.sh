#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_gcloud

action="${1:-}"
case "$action" in
  build)
    require_command git
    [[ "$(git branch --show-current)" == feat/5-first-gcp-deployment ]] || \
      die 'Build from feat/5-first-gcp-deployment only.'
    [[ -z "$(git status --porcelain)" ]] || die 'Build source is dirty. Use a clean clone of the reviewed commit.'
    sha="$(git rev-parse HEAD)"
    app_image="$(image_for app "${sha:0:12}")"
    migrate_image="$(image_for migrator "${sha:0:12}")"
    grep -q 'AS cloud' Dockerfile || die 'DEV4952 cloud Docker target is not integrated.'
    grep -q 'AS migrator' Dockerfile || die 'DEV4952 migrator Docker target is not integrated.'
    note "Building and pushing commit $sha with Cloud Build. Cloud Build minutes and image storage may incur charges."
    confirm build
    gcloud builds submit . --project="$PROJECT" --region="$REGION" \
      --service-account="projects/$PROJECT/serviceAccounts/$BUILD_SA" \
      --config=infra/gcp/cloudbuild.yaml \
      --substitutions="_APP_IMAGE=$app_image,_MIGRATE_IMAGE=$migrate_image"
    printf 'Source SHA: %s\nApp digest: %s\nMigrator digest: %s\n' \
      "$sha" "$(digest_for "$app_image")" "$(digest_for "$migrate_image")"
    ;;
  migrate)
    sha="${2:-}"
    migrate_image="$(digest_for "$(image_for migrator "$sha")")"
    gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" --format='value(state)' | grep -qx RUNNABLE || \
      die 'Cloud SQL is not RUNNABLE.'
    note 'Runs checked-in Prisma migrations against the production database. Review migration SQL and backup status first. Do not run db:seed.'
    confirm migrate
    gcloud run jobs deploy kitloop-migrate --project="$PROJECT" --region="$REGION" \
      --image="$migrate_image" --service-account="$MIGRATE_SA" \
      --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
      --set-cloudsql-instances="$CONNECTION" \
      --set-secrets=DATABASE_URL=kitloop-database-url:1 \
      --set-env-vars=NODE_ENV=production \
      --command=npm --args=run,db:deploy --tasks=1 --max-retries=0 --task-timeout=10m
    gcloud run jobs execute kitloop-migrate --project="$PROJECT" --region="$REGION" --wait
    ;;
  bootstrap)
    sha="${2:-}"
    migrate_image="$(digest_for "$(image_for migrator "$sha")")"
    grep -q '"db:bootstrap"' server/package.json || \
      die 'DEV4952 production db:bootstrap command is not integrated.'
    note 'One-time production account and asset provisioning. Confirm the implementation does not reset existing accounts or call the demo seed.'
    confirm bootstrap
    gcloud run jobs deploy kitloop-bootstrap --project="$PROJECT" --region="$REGION" \
      --image="$migrate_image" --service-account="$MIGRATE_SA" \
      --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
      --set-cloudsql-instances="$CONNECTION" \
      --set-secrets=DATABASE_URL=kitloop-database-url:1,BOOTSTRAP_BORROWER_PASSWORD=kitloop-borrower-password:1,BOOTSTRAP_CUSTODIAN_PASSWORD=kitloop-custodian-password:1 \
      --set-env-vars=NODE_ENV=production,BOOTSTRAP_BORROWER_USERNAME=borrower.lab,BOOTSTRAP_CUSTODIAN_USERNAME=custodian.lab \
      --command=npm --args=run,db:bootstrap --tasks=1 --max-retries=0 --task-timeout=10m
    gcloud run jobs execute kitloop-bootstrap --project="$PROJECT" --region="$REGION" --wait
    ;;
  deploy)
    sha="${2:-}"
    app_image="$(digest_for "$(image_for app "$sha")")"
    note 'Deploys privately first, then updates APP_ORIGIN to the actual HTTPS service URL. Requires completed migration and production bootstrap.'
    confirm deploy
    gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" \
      --image="$app_image" --service-account="$RUN_SA" \
      --network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only \
      --set-cloudsql-instances="$CONNECTION" \
      --set-secrets=DATABASE_URL=kitloop-database-url:1,SESSION_CSRF_SECRET=kitloop-csrf:1 \
      --set-env-vars=NODE_ENV=production,APP_ORIGIN=https://placeholder.invalid,SESSION_TTL_HOURS=12 \
      --port=8080 --cpu=1 --memory=512Mi --concurrency=10 \
      --min-instances=0 --max-instances=2 --no-allow-unauthenticated
    url="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
    [[ "$url" == https://* ]] || die 'Cloud Run did not return an HTTPS URL. Service remains private.'
    gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" \
      --update-env-vars="APP_ORIGIN=$url"
    printf 'Private service URL: %s\nApp digest: %s\n' "$url" "$app_image"
    ;;
  publish)
    note 'Makes the application publicly invokable. Confirm production account bootstrap and private health/readiness first.'
    bash "$(dirname "${BASH_SOURCE[0]}")/verify.sh" private
    confirm publish
    gcloud run services add-iam-policy-binding "$SERVICE" --project="$PROJECT" --region="$REGION" \
      --member=allUsers --role=roles/run.invoker >/dev/null
    bash "$(dirname "${BASH_SOURCE[0]}")/verify.sh" public
    ;;
  rollback)
    revision="${2:-}"
    [[ "$revision" =~ ^kitloop-[a-z0-9-]+$ ]] || die 'Pass an existing KitLoop revision name.'
    gcloud run revisions describe "$revision" --project="$PROJECT" --region="$REGION" >/dev/null
    note 'Routes all traffic to an older Cloud Run revision. This does not reverse a database migration.'
    confirm rollback
    gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" \
      --to-revisions="${revision}=100"
    bash "$(dirname "${BASH_SOURCE[0]}")/verify.sh" public
    ;;
  *) die 'Usage: release.sh {build|migrate SHA|bootstrap SHA|deploy SHA|publish|rollback REVISION}' ;;
esac
