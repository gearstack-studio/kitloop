#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_gcloud

note "Project: $PROJECT; region: $REGION; active account: $(gcloud auth list --filter='status:ACTIVE' --format='value(account)' --project="$PROJECT")"
gcloud projects describe "$PROJECT" --format='value(lifecycleState)' --project="$PROJECT"
gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' --project="$PROJECT"
note 'Required API status:'
enabled_apis="$(gcloud services list --enabled --project="$PROJECT" --format='value(config.name)')"
for api in run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  sqladmin.googleapis.com secretmanager.googleapis.com iam.googleapis.com \
  compute.googleapis.com servicenetworking.googleapis.com logging.googleapis.com \
  storage.googleapis.com; do
  if grep -qx "$api" <<<"$enabled_apis"; then
    printf 'ENABLED %s\n' "$api"
  else
    printf 'MISSING %s\n' "$api"
  fi
done
note 'Artifact Registry repositories:'
if grep -qx artifactregistry.googleapis.com <<<"$enabled_apis"; then
  gcloud artifacts repositories list --location="$REGION" --project="$PROJECT" --format='table(name,format)'
else note 'Skipped: Artifact Registry API is disabled.'; fi
note 'Cloud SQL instances:'
if grep -qx sqladmin.googleapis.com <<<"$enabled_apis"; then
  gcloud sql instances list --project="$PROJECT" --format='table(name,region,state,databaseVersion)'
else note 'Skipped: Cloud SQL Admin API is disabled.'; fi
note 'Cloud Build source bucket:'
if grep -qx storage.googleapis.com <<<"$enabled_apis"; then
  gcloud storage buckets describe "gs://$BUILD_SOURCE_BUCKET" --project="$PROJECT" \
    --format='table(name,location,iamConfiguration.uniformBucketLevelAccess.enabled)' || \
    note 'Missing: dedicated source bucket has not been created.'
else note 'Skipped: Cloud Storage API is disabled.'; fi
note 'Cloud Run services:'
if grep -qx run.googleapis.com <<<"$enabled_apis"; then
  gcloud run services list --region="$REGION" --project="$PROJECT" --format='table(metadata.name,status.url)'
else note 'Skipped: Cloud Run API is disabled.'; fi
note 'VPC networks and regional subnets:'
if grep -qx compute.googleapis.com <<<"$enabled_apis"; then
  gcloud compute networks list --project="$PROJECT" --format='value(name)'
  gcloud compute networks subnets list --regions="$REGION" --project="$PROJECT" --format='table(name,network,ipCidrRange)'
else note 'Skipped: Compute Engine API is disabled.'; fi
note 'Manual gates: confirm remaining credits, budget alerts, trial eligibility, quota, and current regional estimate in the Console. No resources were changed.'
