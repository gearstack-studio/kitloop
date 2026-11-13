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
      compute.googleapis.com servicenetworking.googleapis.com logging.googleapis.com
    ;;
  registry)
    confirm registry
    gcloud artifacts repositories create "$REPOSITORY" --project="$PROJECT" \
      --location="$REGION" --repository-format=docker \
      --description='KitLoop Lab 5 release images'
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
    database_url="postgresql://kitloop_app:${db_password}@localhost/kitloop?host=/cloudsql/${CONNECTION}&schema=public&connection_limit=5"
    printf '%s' "$database_url" | gcloud secrets create kitloop-database-url \
      --project="$PROJECT" --replication-policy=user-managed --locations="$REGION" --data-file=-
    printf '%s' "$csrf_secret" | gcloud secrets create kitloop-csrf \
      --project="$PROJECT" --replication-policy=user-managed --locations="$REGION" --data-file=-
    note 'Secrets created. Record only their names and version numbers; never display payloads.'
    ;;
  bootstrap-secrets)
    note 'Enter two distinct production account passwords from a password manager. They will not be echoed or logged.'
    confirm bootstrap-secrets
    [[ -t 0 ]] || die 'Secret input requires an interactive terminal.'
    set +x
    read -r -s -p 'Borrower password: ' borrower_password
    printf '\n' >&2
    read -r -s -p 'Custodian password: ' custodian_password
    printf '\n' >&2
    trap 'unset borrower_password custodian_password' EXIT
    [[ ${#borrower_password} -ge 16 && ${#custodian_password} -ge 16 && "$borrower_password" != "$custodian_password" ]] || \
      die 'Use distinct passwords of at least 16 characters.'
    printf '%s' "$borrower_password" | gcloud secrets create kitloop-borrower-password \
      --project="$PROJECT" --replication-policy=user-managed --locations="$REGION" --data-file=-
    printf '%s' "$custodian_password" | gcloud secrets create kitloop-custodian-password \
      --project="$PROJECT" --replication-policy=user-managed --locations="$REGION" --data-file=-
    note 'Bootstrap secrets created. Share account passwords only through the team password manager.'
    ;;
  bootstrap-grants)
    confirm bootstrap-grants
    for secret in kitloop-borrower-password kitloop-custodian-password; do
      gcloud secrets add-iam-policy-binding "$secret" --project="$PROJECT" \
        --member="serviceAccount:$MIGRATE_SA" --role=roles/secretmanager.secretAccessor >/dev/null
    done
    ;;
  bootstrap-revoke)
    confirm bootstrap-revoke
    for secret in kitloop-borrower-password kitloop-custodian-password; do
      gcloud secrets remove-iam-policy-binding "$secret" --project="$PROJECT" \
        --member="serviceAccount:$MIGRATE_SA" --role=roles/secretmanager.secretAccessor >/dev/null
    done
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
    gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter >/dev/null
    note 'Operator permissions (Cloud Run deployer, Cloud SQL admin, Service Account User, and IAM grant authority) must be reviewed separately.'
    ;;
  *) die 'Usage: prepare.sh {apis|registry|network SUBNET_CIDR PSA_BASE_IP PSA_PREFIX|database|identity|secrets|bootstrap-secrets|grants|bootstrap-grants|bootstrap-revoke}' ;;
esac
