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
DEPLOY_SA="kitloop-wif-deploy@${PROJECT}.iam.gserviceaccount.com"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${REPOSITORY}"
CONNECTION="${PROJECT}:${REGION}:${SQL_INSTANCE}"
# Cloud SQL instance label written only after a verified production bootstrap execution.
BOOTSTRAP_LABEL=kitloop_bootstrap
# Traffic tag used to health-check a new revision before it receives traffic.
CANDIDATE_TAG=candidate
# Request lifecycle rollout (PR #72). Application database created by prepare.sh, the migration that introduces the
# lifecycle statuses, the read-only job that gates pre-lifecycle rollbacks, and the reconciliation job (a lifecycle writer).
DB_NAME=kitloop
LIFECYCLE_MIGRATION=server/prisma/migrations/20261121090000_request_lifecycle/migration.sql
ROLLBACK_CHECK_JOB=kitloop-rollback-check
RECONCILE_JOB=kitloop-reconcile

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
  if [[ "${KITLOOP_AUTOMATED_RELEASE:-}" == 1 ]]; then
    # Only release.sh may use this path. prepare.sh, bootstrap and publish stay interactive-only.
    [[ "$(basename "${BASH_SOURCE[1]:-}")" == release.sh ]] ||
      die 'Automated release mode is reserved for release.sh.'
    source "$(dirname "${BASH_SOURCE[0]}")/deploy/guard.sh"
    authorize_automated_release "$action"
    return
  fi
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
# Usage: reachable_revisions SERVICE_JSON -> "REVISION TAG" per traffic entry that can receive requests: a traffic share
# (TAG "-") or a tag URL. A tag URL reaches its revision at 0% traffic, with the service's invoker policy.
reachable_revisions() {
  jq -r '.status.traffic[]? | select((.percent // 0) > 0 or ((.tag // "") != "")) | "\(.revisionName) \(.tag // "-")"' <<<"$1"
}
# Usage: traffic_snapshot SERVICE_JSON -> canonical JSON of every traffic entry (revision, percent, tag)
traffic_snapshot() {
  jq -c '[.status.traffic[]? | {revisionName, percent: (.percent // 0), tag: (.tag // null)}] | sort_by(.revisionName, .tag)' <<<"$1"
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
# Request lifecycle rollout (PR #72 P1). Every revision deployed from the lifecycle release onward declares
# REQUEST_LIFECYCLE_WRITES. Older revisions (8b6e5a9 and earlier) lack it and cannot read DECLINED/CANCELLED/EXPIRED
# request rows (Prisma enum error, HTTP 500), so they are safe rollback targets only while no such row exists.
# The operator chooses the setting with KITLOOP_REQUEST_LIFECYCLE_WRITES (default disabled = phase 1).
# Usage: loan_max_days_setting -> "" (no maximum; SRS OQ-01 undecided) or a whole number of days 1-3650 (UAT-E02 #62).
# Mirrors the server's LOAN_MAX_DAYS validation so an invalid value is refused before any Cloud Run call.
loan_max_days_setting() {
  local value="${KITLOOP_LOAN_MAX_DAYS:-}"
  [[ -z "$value" ]] || { [[ "$value" =~ ^[1-9][0-9]{0,3}$ ]] && (( value <= 3650 )); } || \
    die 'KITLOOP_LOAN_MAX_DAYS must be empty (no maximum) or a whole number of days from 1 to 3650. Nothing was changed.'
  printf '%s' "$value"
}
lifecycle_writes_setting() {
  local value="${KITLOOP_REQUEST_LIFECYCLE_WRITES:-disabled}"
  [[ "$value" == enabled || "$value" == disabled ]] || die 'KITLOOP_REQUEST_LIFECYCLE_WRITES must be enabled or disabled.'
  printf '%s' "$value"
}
borrowing_quota_setting() {
  local lifecycle="$1" value="${KITLOOP_BORROWING_QUOTA-disabled}"
  [[ "$value" == enabled || "$value" == disabled ]] || die 'KITLOOP_BORROWING_QUOTA must be enabled or disabled.'
  [[ "$value" == disabled || "$lifecycle" == enabled ]] || \
    die 'KITLOOP_BORROWING_QUOTA requires KITLOOP_REQUEST_LIFECYCLE_WRITES=enabled.'
  printf '%s' "$value"
}

# Usage: revision_lifecycle REVISION -> enabled | disabled | absent (absent = pre-lifecycle revision)
revision_lifecycle() {
  local json
  json="$(gcloud run revisions describe "$1" --project="$PROJECT" --region="$REGION" --format=json)" || \
    die "Cannot describe revision $1."
  jq -r '[.spec.containers[0].env[]? | select(.name == "REQUEST_LIFECYCLE_WRITES") | .value][0] // "absent"' <<<"$json"
}
# Usage: revision_image REVISION -> the revision's Artifact Registry app image digest
revision_image() {
  local json image
  json="$(gcloud run revisions describe "$1" --project="$PROJECT" --region="$REGION" --format=json)" || \
    die "Cannot describe revision $1."
  image="$(jq -r '.spec.containers[0].image // ""' <<<"$json")"
  [[ "$image" == "$REGISTRY/kitloop-app@sha256:"* ]] || die "Revision $1 does not run a registry app image digest."
  printf '%s' "$image"
}
service_is_public() {
  local policy
  policy="$(gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json)" || \
    die 'Cannot read the Cloud Run service IAM policy.'
  jq -e 'any(.bindings[]?; .role == "roles/run.invoker" and any(.members[]?; . == "allUsers"))' <<<"$policy" >/dev/null
}
# Decodes one base64url JWT segment (no signature check; Cloud Run verifies the signature).
jwt_segment() {
  local segment="${1//-/+}"
  segment="${segment//_//}"
  case $(( ${#segment} % 4 )) in 2) segment+='==' ;; 3) segment+='=' ;; 1) return 1 ;; esac
  base64 -d <<<"$segment" 2>/dev/null
}
# Automated (GitHub Actions) path. google-github-actions/auth writes an external_account credential file
# that impersonates the deployment account. gcloud print-identity-token cannot mint a Cloud Run ID token
# with the service audience from that file, so the impersonated access token calls IAM Credentials
# generateIdToken for the deployment account itself. Required, and granted separately after review:
# iam.serviceAccounts.getOpenIdToken on DEPLOY_SA for DEPLOY_SA (roles/iam.serviceAccountOpenIdTokenCreator).
deploy_identity_token() {
  local audience="$1" credentials impersonation_url access request response token payload claims
  [[ "${DEPLOY_SERVICE_ACCOUNT:-}" == "$DEPLOY_SA" ]] || die 'Unexpected deployment service account.'
  credentials="${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:-}"
  [[ -n "$credentials" && "$credentials" == "${GOOGLE_APPLICATION_CREDENTIALS:-}" && -r "$credentials" ]] ||
    die 'The GitHub WIF credential file is unavailable.'
  impersonation_url="https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/$DEPLOY_SA:generateAccessToken"
  jq -e --arg url "$impersonation_url" '
    .type == "external_account" and .service_account_impersonation_url == $url
  ' "$credentials" >/dev/null 2>&1 || die 'The GitHub WIF credential file targets the wrong identity.'
  access="$(gcloud auth print-access-token --project="$PROJECT" 2>/dev/null)" ||
    die 'Could not obtain a WIF-backed access token.'
  [[ -n "$access" ]] || die 'Could not obtain a WIF-backed access token.'
  request="$(jq -cn --arg audience "$audience" '{audience: $audience, includeEmail: true}')"
  # The bearer token travels on stdin, never in argv. curl --fail never prints the response body.
  response="$(curl --silent --show-error --fail --max-time 30 --request POST --header @- \
    --header 'Content-Type: application/json' --data-binary "$request" \
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/$DEPLOY_SA:generateIdToken" \
    <<<"Authorization: Bearer $access")" ||
    die 'IAM Credentials could not generate the Cloud Run ID token.'
  unset access
  token="$(jq -er '.token | select(type == "string" and length > 0)' <<<"$response" 2>/dev/null)" ||
    die 'IAM Credentials returned no ID token.'
  unset response
  [[ "$token" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]] ||
    die 'IAM Credentials returned an invalid ID token.'
  IFS=. read -r _ payload _ <<<"$token"
  claims="$(jwt_segment "$payload")" || die 'IAM Credentials returned an invalid ID token.'
  jq -e --arg audience "$audience" --arg account "$DEPLOY_SA" '
    .iss == "https://accounts.google.com" and .aud == $audience and
    .email == $account and .email_verified == true and
    (.exp | type == "number") and .exp > now
  ' <<<"$claims" >/dev/null 2>&1 ||
    die 'The ID token is not for the canonical Cloud Run audience and the deployment service account.'
  printf '%s' "$token"
}
# Usage: identity_token AUDIENCE. AUDIENCE must be the canonical service URL, also when the request
# goes to a candidate-tag URL. Prints the token to stdout only; callers keep it in memory.
identity_token() {
  local audience="${1:-}" token
  [[ -n "$audience" && "$audience" == "$(canonical_url)" ]] ||
    die 'ID-token audience must be the canonical Cloud Run service URL.'
  if [[ "${KITLOOP_AUTOMATED_RELEASE:-}" == 1 ]]; then
    token="$(deploy_identity_token "$audience")" || exit 1
  else
    # Cloud Shell operator flow (user account) remains unchanged for manual private checks.
    token="$(gcloud auth print-identity-token --project="$PROJECT")" || die 'Could not obtain an identity token.'
    [[ -n "$token" ]] || die 'Could not obtain an identity token.'
  fi
  printf '%s' "$token"
}
# Usage: http_checks BASE_URL [IDENTITY_TOKEN]. The token is passed on stdin, never as an argument.
http_checks() {
  local base="$1" token="${2:-}" expected_commit="${3:-}" path status version
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
  if [[ -n "$expected_commit" ]]; then
    if ! version="$(curl --fail --silent --show-error --max-time 20 --header @- \
      "$base/api/version" <<<"${token:+Authorization: Bearer $token}")" ||
      ! jq -e --arg commit "$expected_commit" '.commit == $commit' <<<"$version" >/dev/null; then
      note "FAIL $base/api/version did not report expected commit $expected_commit"
      return 1
    fi
    printf 'PASS %s/api/version commit %s\n' "$base" "$expected_commit"
  fi
}
