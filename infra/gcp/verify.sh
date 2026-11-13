#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_gcloud
require_command curl

mode="${1:-}"
[[ "$mode" == private || "$mode" == public || "$mode" == evidence ]] || \
  die 'Usage: verify.sh {private|public|evidence SHA}'
url="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
[[ "$url" == https://* ]] || die 'Cloud Run URL is unavailable.'
revision="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.latestReadyRevisionName)')"
[[ -n "$revision" ]] || die 'No ready Cloud Run revision.'

printf 'Project: %s\nRegion: %s\nService URL: %s\nReady revision: %s\n' "$PROJECT" "$REGION" "$url" "$revision"
if [[ "$mode" == evidence ]]; then
  sha="${2:-}"
  printf 'Source SHA/tag: %s\nApp digest: %s\nMigrator digest: %s\n' \
    "$sha" "$(digest_for "$(image_for app "$sha")")" "$(digest_for "$(image_for migrator "$sha")")"
  note 'Cloud SQL state and IP types:'
  gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" \
    --format='table(state,region,databaseVersion,ipAddresses.type)'
  note 'Recent regional Cloud Builds (inspect the exact build ID and status):'
  gcloud builds list --project="$PROJECT" --region="$REGION" --limit=5 \
    --format='table(id,status,createTime)'
  note 'This inventory is not proof of successful HTTP, auth, migration, or persistence checks.'
  exit 0
fi

headers=()
if [[ "$mode" == private ]]; then
  token="$(gcloud auth print-identity-token --project="$PROJECT")"
  [[ -n "$token" ]] || die 'Could not obtain an identity token.'
  headers=(-H "Authorization: Bearer $token")
fi
for path in / /api/health /api/ready; do
  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --max-time 20 "${headers[@]}" "$url$path")"
  [[ "$status" == 200 ]] || die "$path returned HTTP $status (expected 200)."
  printf 'PASS %s HTTP %s\n' "$path" "$status"
done
unset token
note 'HTTP checks passed. Browser login, request/checkout, session and cross-revision persistence still require separate verification.'
