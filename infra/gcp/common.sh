#!/usr/bin/env bash
set -euo pipefail

# Fixed lab target. Every gcloud invocation in these scripts also passes --project.
PROJECT=lab-5-cloud-deployment-514310
REGION=asia-southeast1
REPOSITORY=kitloop
SERVICE=kitloop
SQL_INSTANCE=kitloop-pg
NETWORK=kitloop-vpc
SUBNET=kitloop-run
PSA_RANGE=kitloop-psa
RUN_SA="kitloop-run@${PROJECT}.iam.gserviceaccount.com"
MIGRATE_SA="kitloop-migrate@${PROJECT}.iam.gserviceaccount.com"
BUILD_SA="kitloop-build@${PROJECT}.iam.gserviceaccount.com"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${REPOSITORY}"
CONNECTION="${PROJECT}:${REGION}:${SQL_INSTANCE}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*" >&2; }
require_command() { command -v "$1" >/dev/null 2>&1 || die "Install $1 before continuing."; }
require_gcloud() {
  require_command gcloud
  local selected
  selected="$(gcloud config get-value project 2>/dev/null)"
  [[ "$selected" == "$PROJECT" ]] || die "Active gcloud project is not $PROJECT (found: $selected)."
  [[ -n "$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' --project="$PROJECT")" ]] || die 'No active gcloud account.'
}
confirm() {
  local action="$1" answer
  [[ -t 0 ]] || die 'State-changing commands require an interactive terminal.'
  note "This will change GCP resources in $PROJECT ($REGION)."
  read -r -p "Type ${PROJECT}/${action} to continue: " answer
  [[ "$answer" == "${PROJECT}/${action}" ]] || die 'Confirmation did not match; nothing changed.'
}
image_for() {
  local kind="$1" sha="$2"
  [[ "$sha" =~ ^[0-9a-f]{12,40}$ ]] || die 'Use a 12-40 character lowercase Git commit SHA.'
  printf '%s/kitloop-%s:%s' "$REGISTRY" "$kind" "${sha:0:12}"
}
digest_for() {
  local tagged="$1" digest
  digest="$(gcloud artifacts docker images describe "$tagged" --project="$PROJECT" --format='value(image_summary.fully_qualified_digest)')"
  [[ "$digest" == *@sha256:* ]] || die "No immutable digest found for $tagged."
  printf '%s' "$digest"
}
