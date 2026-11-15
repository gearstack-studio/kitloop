#!/usr/bin/env bash
# Read-only preflight for subsequent releases. The first deployment and bootstrap remain manual Episode 5 work.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/../common.sh"
source "$script_dir/guard.sh"
assert_trusted_deploy_context
require_gcloud
require_command jq

gcloud artifacts repositories describe "$REPOSITORY" --project="$PROJECT" --location="$REGION" >/dev/null ||
  die 'The Episode 5 Artifact Registry repository is missing.'
gcloud storage buckets describe "gs://$BUILD_SOURCE_BUCKET" --project="$PROJECT" >/dev/null ||
  die 'The Episode 5 Cloud Build source bucket is missing.'
gcloud run jobs describe kitloop-migrate --project="$PROJECT" --region="$REGION" --format='value(metadata.name)' >/dev/null ||
  die 'The Episode 5 migration job must already exist.'

instance="$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" --format=json)" ||
  die 'The Episode 5 Cloud SQL instance is missing.'
jq -e --arg key "$BOOTSTRAP_LABEL" '
  .state == "RUNNABLE" and
  .settings.backupConfiguration.enabled == true and
  ((.settings.userLabels[$key] // "") != "")
' <<<"$instance" >/dev/null ||
  die 'Cloud SQL must be RUNNABLE with backups enabled and a verified bootstrap record.'

backups="$(gcloud sql backups list --instance="$SQL_INSTANCE" --project="$PROJECT" --format=json)" ||
  die 'Cannot inspect Cloud SQL backups.'
jq -e '[.[] | select(.status == "SUCCESSFUL")] | length > 0' <<<"$backups" >/dev/null ||
  die 'No successful Cloud SQL backup was found; review backup freshness before migration.'

origin="$(canonical_url)"
service="$(service_json)" || die 'The Episode 5 Cloud Run service is missing.'
require_service_url "$service" "$origin"
serving="$(serving_revisions "$service")"
[[ "$(printf '%s\n' "$serving" | wc -l)" -eq 1 ]] ||
  die 'Exactly one existing revision must receive traffic.'
read -r revision percent <<<"$serving"
[[ "$percent" == 100 ]] || die 'The existing revision must receive 100% of traffic.'
require_safe_revision "$revision" "$origin"
printf 'Preflight passed: project %s, region %s, serving revision %s, successful backup present.\n' \
  "$PROJECT" "$REGION" "$revision"
note 'Review the latest backup timestamp and migration compatibility during the GitHub environment approval.'
