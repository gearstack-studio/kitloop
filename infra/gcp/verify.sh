#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_gcloud
require_command curl
require_command jq

mode="${1:-}"
[[ "$mode" == private || "$mode" == public || "$mode" == evidence ]] || \
  die 'Usage: verify.sh {private|public|evidence SHA}'
origin="$(canonical_url)"
service="$(service_json)" || die 'Cannot describe the Cloud Run service.'
require_service_url "$service" "$origin"
serving="$(serving_revisions "$service")"
[[ -n "$serving" ]] || die 'No Cloud Run revision receives traffic.'

printf 'Project: %s\nRegion: %s\nCanonical URL: %s\n' "$PROJECT" "$REGION" "$origin"
# Report and validate the revisions that actually receive traffic, not merely the latest ready one.
while read -r revision percent; do
  require_safe_revision "$revision" "$origin"
  printf 'Serving revision: %s (%s%%)\n' "$revision" "$percent"
done <<<"$serving"
printf 'Latest ready revision: %s\n' "$(jq -r '.status.latestReadyRevisionName // "none"' <<<"$service")"
if [[ "$mode" == evidence ]]; then
  sha="${2:-}"
  printf 'Source SHA/tag: %s\nApp digest: %s\nMigration digest: %s\n' \
    "$sha" "$(digest_for "$(image_for app "$sha")")" "$(digest_for "$(image_for migration "$sha")")"
  note 'Cloud SQL state and IP types:'
  gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" \
    --format='table(state,region,databaseVersion,ipAddresses.type)'
  note 'Recent regional Cloud Builds (inspect the exact build ID and status):'
  gcloud builds list --project="$PROJECT" --region="$REGION" --limit=5 \
    --format='table(id,status,createTime)'
  note 'This inventory is not proof of successful HTTP, auth, migration, or persistence checks.'
  exit 0
fi

if [[ "$mode" == private ]]; then
  token="$(identity_token)"
  http_checks "$origin" "$token" || die 'Private HTTP checks failed.'
  unset token
else
  http_checks "$origin" || die 'Public HTTP checks failed.'
fi
note 'HTTP checks passed. Browser login, request/checkout, session and cross-revision persistence still require separate verification.'
