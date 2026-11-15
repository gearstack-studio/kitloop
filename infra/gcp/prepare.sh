#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_gcloud

action="${1:-}"
case "$action" in
  apis)
    confirm apis
    gcloud services enable --project="$PROJECT" \
      run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
      sqladmin.googleapis.com secretmanager.googleapis.com iam.googleapis.com \
      compute.googleapis.com servicenetworking.googleapis.com logging.googleapis.com \
      storage.googleapis.com
    ;;
  registry)
    confirm registry
    gcloud artifacts repositories create "$REPOSITORY" --project="$PROJECT" \
      --location="$REGION" --repository-format=docker \
      --description='KitLoop Lab 5 release images'
    ;;
  build-source)
    confirm build-source
    gcloud storage buckets create "gs://$BUILD_SOURCE_BUCKET" --project="$PROJECT" \
      --location="$REGION" --uniform-bucket-level-access --public-access-prevention \
      --soft-delete-duration=0
    gcloud storage buckets update "gs://$BUILD_SOURCE_BUCKET" --project="$PROJECT" \
      --lifecycle-file=infra/gcp/build-source-lifecycle.json
    ;;
  network)
    subnet_cidr="${2:-}"
    psa_base="${3:-}"
    psa_prefix="${4:-}"
    [[ "$subnet_cidr" =~ ^[0-9.]+/[0-9]+$ && "$psa_base" =~ ^[0-9.]+$ && "$psa_prefix" =~ ^(1[6-9]|2[0-4])$ ]] || \
      die 'Usage: prepare.sh network SUBNET_CIDR PSA_BASE_IP PSA_PREFIX (16-24). Review ranges for overlap first.'
    (( ${subnet_cidr##*/} <= 26 )) || die 'Cloud Run Direct VPC subnet must be /26 or larger.'
    note "Requested subnet $subnet_cidr and private-service range $psa_base/$psa_prefix. Check all existing and peered ranges for overlap."
    confirm network
    gcloud compute networks create "$NETWORK" --project="$PROJECT" --subnet-mode=custom
    gcloud compute networks subnets create "$SUBNET" --project="$PROJECT" \
      --network="$NETWORK" --region="$REGION" --range="$subnet_cidr"
    gcloud compute addresses create "$PSA_RANGE" --project="$PROJECT" --global \
      --purpose=VPC_PEERING --addresses="$psa_base" --prefix-length="$psa_prefix" --network="$NETWORK"
    gcloud services vpc-peerings connect --project="$PROJECT" \
      --service=servicenetworking.googleapis.com --network="$NETWORK" --ranges="$PSA_RANGE"
    ;;
  database)
    note 'Paid Cloud SQL instance: Enterprise PostgreSQL 17, db-f1-micro, zonal, 10 GiB SSD, backups, capped storage growth. Shared core has no SLA.'
    gcloud compute networks describe "$NETWORK" --project="$PROJECT" >/dev/null
    gcloud services vpc-peerings list --project="$PROJECT" --network="$NETWORK" \
      --service=servicenetworking.googleapis.com --format='value(peering)' | grep -q . || \
      die 'Private services access is not ready.'
    confirm database
    gcloud sql instances create "$SQL_INSTANCE" --project="$PROJECT" --region="$REGION" \
      --database-version=POSTGRES_17 --edition=ENTERPRISE --tier=db-f1-micro \
      --availability-type=ZONAL --storage-type=SSD --storage-size=10 \
      --storage-auto-increase --storage-auto-increase-limit=20 \
      --backup-start-time=18:00 --retained-backups-count=7 \
      --deletion-protection --no-assign-ip \
      --network="projects/$PROJECT/global/networks/$NETWORK"
    gcloud sql databases create kitloop --project="$PROJECT" --instance="$SQL_INSTANCE"
    ;;
  identity)
    confirm identity
    gcloud iam service-accounts create kitloop-run --project="$PROJECT" \
      --display-name='KitLoop Cloud Run runtime'
    gcloud iam service-accounts create kitloop-migrate --project="$PROJECT" \
      --display-name='KitLoop one-time migrations'
    gcloud iam service-accounts create kitloop-bootstrap --project="$PROJECT" \
      --display-name='KitLoop one-time production bootstrap'
    gcloud iam service-accounts create kitloop-build --project="$PROJECT" \
      --display-name='KitLoop Cloud Build'
    ;;
  secrets)
    require_command openssl
    gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" \
      --format='value(ipAddresses[0].type)' | grep -qx PRIVATE || \
      die 'Cloud SQL must have a private IP before credentials are created.'
    note 'Creates a dedicated SQL user plus two regional Secret Manager secrets. No value is displayed.'
    confirm secrets
    set +x
    umask 077
    db_password="$(openssl rand -hex 24)"
    csrf_secret="$(openssl rand -hex 32)"
    trap 'unset db_password csrf_secret database_url' EXIT
    gcloud sql users create kitloop_app --project="$PROJECT" \
      --instance="$SQL_INSTANCE" --password="$db_password"
    database_url="postgresql://kitloop_app:${db_password}@localhost/kitloop?host=%2Fcloudsql%2F${CONNECTION}&schema=public&connection_limit=5"
    printf '%s' "$database_url" | gcloud secrets create kitloop-database-url \
      --project="$PROJECT" --replication-policy=user-managed --locations="$REGION" --data-file=-
    printf '%s' "$csrf_secret" | gcloud secrets create kitloop-csrf \
      --project="$PROJECT" --replication-policy=user-managed --locations="$REGION" --data-file=-
    note 'Secrets created. Record only their names and version numbers; never display payloads.'
    ;;
  bootstrap-secrets)
    require_command realpath
    require_command stat
    require_command jq
    require_command git
    manifest="${2:-}"
    [[ -n "$manifest" && -f "$manifest" && ! -L "$manifest" ]] || \
      die 'Usage: prepare.sh bootstrap-secrets /absolute/path/to/reviewed-bootstrap.json (regular file outside the repository).'
    manifest="$(realpath -- "$manifest")"
    [[ "$manifest" == /* ]] || die 'Bootstrap manifest must resolve to an absolute path.'
    repo_root="$(realpath -- "$(git rev-parse --show-toplevel)")"
    [[ "$manifest" != "$repo_root/"* ]] || die 'Keep the bootstrap manifest outside the repository.'
    permissions="$(stat -c '%a' "$manifest")"
    [[ "$permissions" == 600 || "$permissions" == 400 ]] || \
      die 'Bootstrap manifest must be owner-readable only (mode 600 or 400).'
    jq -e 'type == "object" and (.users | type == "array" and length > 0) and (.assets | type == "array")' \
      "$manifest" >/dev/null 2>&1 || die 'Bootstrap manifest must be JSON with users and assets arrays.'
    note 'Review the manifest against server/.env.production.example. Existing account passwords will not be rotated.'
    confirm bootstrap-secrets
    set +x
    gcloud secrets create kitloop-bootstrap-input --project="$PROJECT" \
      --replication-policy=user-managed --locations="$REGION" --data-file="$manifest"
    note 'Bootstrap manifest stored as a secret. Keep account passwords in the team password manager.'
    ;;
  bootstrap-grants)
    confirm bootstrap-grants
    gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$BOOTSTRAP_SA" --role=roles/cloudsql.client >/dev/null
    for secret in kitloop-database-url kitloop-bootstrap-input; do
      gcloud secrets add-iam-policy-binding "$secret" --project="$PROJECT" \
        --member="serviceAccount:$BOOTSTRAP_SA" --role=roles/secretmanager.secretAccessor >/dev/null
    done
    ;;
  bootstrap-revoke)
    confirm bootstrap-revoke
    for secret in kitloop-database-url kitloop-bootstrap-input; do
      gcloud secrets remove-iam-policy-binding "$secret" --project="$PROJECT" \
        --member="serviceAccount:$BOOTSTRAP_SA" --role=roles/secretmanager.secretAccessor >/dev/null
    done
    gcloud projects remove-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$BOOTSTRAP_SA" --role=roles/cloudsql.client >/dev/null
    ;;
  grants)
    confirm grants
    for account in "$RUN_SA" "$MIGRATE_SA"; do
      gcloud projects add-iam-policy-binding "$PROJECT" \
        --member="serviceAccount:$account" --role=roles/cloudsql.client >/dev/null
      gcloud secrets add-iam-policy-binding kitloop-database-url --project="$PROJECT" \
        --member="serviceAccount:$account" --role=roles/secretmanager.secretAccessor >/dev/null
    done
    gcloud secrets add-iam-policy-binding kitloop-csrf --project="$PROJECT" \
      --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null
    gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" \
      --project="$PROJECT" --location="$REGION" \
      --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer >/dev/null
    gcloud storage buckets add-iam-policy-binding "gs://$BUILD_SOURCE_BUCKET" \
      --project="$PROJECT" --member="serviceAccount:$BUILD_SA" \
      --role=roles/storage.objectViewer >/dev/null
    gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter >/dev/null
    note 'Operator permissions (Cloud Run deployer, Cloud SQL admin, Service Account User, and IAM grant authority) must be reviewed separately.'
    ;;
  *) die 'Usage: prepare.sh {apis|registry|build-source|network SUBNET_CIDR PSA_BASE_IP PSA_PREFIX|database|identity|secrets|bootstrap-secrets MANIFEST_PATH|grants|bootstrap-grants|bootstrap-revoke}' ;;
esac
