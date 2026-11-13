#!/usr/bin/env bash
# shellcheck disable=SC2034 # Constants are used by the scripts that source this file.
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
BUILD_SOURCE_BUCKET="${PROJECT}-kitloop-build-source"
RUN_SA="kitloop-run@${PROJECT}.iam.gserviceaccount.com"
MIGRATE_SA="kitloop-migrate@${PROJECT}.iam.gserviceaccount.com"
BOOTSTRAP_SA="kitloop-bootstrap@${PROJECT}.iam.gserviceaccount.com"
BUILD_SA="kitloop-build@${PROJECT}.iam.gserviceaccount.com"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${REPOSITORY}"
CONNECTION="${PROJECT}:${REGION}:${SQL_INSTANCE}"
# Cloud SQL instance label written only after a verified production bootstrap execution.
BOOTSTRAP_LABEL=kitloop_bootstrap
# Traffic tag used to health-check a new revision before it receives traffic.
CANDIDATE_TAG=candidate

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

# Canonical origin: Cloud Run's deterministic URL https://SERVICE-PROJECT_NUMBER.REGION.run.app.
# It is known before the service exists, so APP_ORIGIN never needs a placeholder. Browser login,
# Origin/CSRF checks and verification all use this one URL; the legacy *.a.run.app URL is not supported.
canonical_url() {
  local number
  number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" || die 'Cannot read the project number.'
  [[ "$number" =~ ^[0-9]+$ ]] || die 'Project number is unavailable.'
  printf 'https://%s-%s.%s.run.app' "$SERVICE" "$number" "$REGION"
}
service_exists() {
  local found
  found="$(gcloud run services list --project="$PROJECT" --region="$REGION" \
    --filter="metadata.name=$SERVICE" --format='value(metadata.name)')" || die 'Cannot list Cloud Run services.'
  [[ "$found" == "$SERVICE" ]]
}
service_json() {
  gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json
}
# Usage: require_service_url SERVICE_JSON ORIGIN
require_service_url() {
  jq -e --arg url "$2" '
    ([.status.url // empty] + ((.metadata.annotations["run.googleapis.com/urls"] // "[]") | fromjson))
    | any(.[]; . == $url)
  ' <<<"$1" >/dev/null || die "Cloud Run does not report the canonical origin $2 for $SERVICE."
}
# Prints "REVISION PERCENT" for every revision that currently receives traffic.
serving_revisions() {
  jq -r '.status.traffic[]? | select((.percent // 0) > 0) | "\(.revisionName) \(.percent)"' <<<"$1"
}
# Usage: require_serving SERVICE_JSON REVISION
require_serving() {
  jq -e --arg revision "$2" '
    [.status.traffic[]? | select((.percent // 0) > 0)]
    | length == 1 and .[0].revisionName == $revision and .[0].percent == 100
  ' <<<"$1" >/dev/null || die "Traffic is not routed 100% to $2."
}
# A revision may receive traffic only if it belongs to this service, is Ready, runs an Artifact Registry
# digest and has exactly the canonical APP_ORIGIN. Usage: require_safe_revision REVISION ORIGIN [IMAGE]
require_safe_revision() {
  local revision="$1" origin="$2" image="${3:-}" json
  json="$(gcloud run revisions describe "$revision" --project="$PROJECT" --region="$REGION" --format=json)" || \
    die "Cannot describe revision $revision."
  jq -e --arg service "$SERVICE" --arg origin "$origin" --arg prefix "$REGISTRY/kitloop-app@sha256:" --arg image "$image" '
    (.metadata.labels["serving.knative.dev/service"] == $service) and
    any(.status.conditions[]?; .type == "Ready" and .status == "True") and
    ((.spec.containers[0].image // "") | startswith($prefix)) and
    ($image == "" or .spec.containers[0].image == $image) and
    ([.spec.containers[0].env[]? | select(.name == "APP_ORIGIN") | .value] == [$origin])
  ' <<<"$json" >/dev/null || \
    die "Revision $revision is not a ready $SERVICE revision with a registry digest and APP_ORIGIN=$origin."
}
service_is_public() {
  local policy
  policy="$(gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json)" || \
    die 'Cannot read the Cloud Run service IAM policy.'
  jq -e 'any(.bindings[]?; .role == "roles/run.invoker" and any(.members[]?; . == "allUsers"))' <<<"$policy" >/dev/null
}
identity_token() {
  local token
  token="$(gcloud auth print-identity-token --project="$PROJECT")" || die 'Could not obtain an identity token.'
  [[ -n "$token" ]] || die 'Could not obtain an identity token.'
  printf '%s' "$token"
}
# Usage: http_checks BASE_URL [IDENTITY_TOKEN]. The token is passed on stdin, never as an argument.
http_checks() {
  local base="$1" token="${2:-}" path status
  for path in / /api/health /api/ready; do
    if [[ -n "$token" ]]; then
      status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 \
        --header @- "$base$path" <<<"Authorization: Bearer $token")" || status=000
    else
      status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 \
        "$base$path" </dev/null)" || status=000
    fi
    if [[ "$status" != 200 ]]; then
      note "FAIL $base$path HTTP $status (expected 200)"
      return 1
    fi
    printf 'PASS %s%s HTTP %s\n' "$base" "$path" "$status"
  done
}
