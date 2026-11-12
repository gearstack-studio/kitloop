#!/usr/bin/env bash
set -euo pipefail

config_file="${1:?Pass a path outside the Docker build context for the CI environment file}"
if [[ -e "$config_file" ]]; then
  printf 'Refusing to overwrite an existing configuration file.\n' >&2
  exit 1
fi

umask 077
database_password="$(openssl rand -hex 24)"
csrf_secret="$(openssl rand -hex 32)"
borrower_password="$(openssl rand -hex 24)"
custodian_password="$(openssl rand -hex 24)"
database_url="postgresql://kitloop_ci:${database_password}@db:5432/kitloop_ci?schema=public"

# Mask before any subsequent step could log a generated credential.
for value in "$database_password" "$csrf_secret" "$borrower_password" "$custodian_password" "$database_url"; do
  printf '::add-mask::%s\n' "$value"
done

cat > "$config_file" <<EOF
POSTGRES_USER=kitloop_ci
POSTGRES_PASSWORD=$database_password
POSTGRES_DB=kitloop_ci
DATABASE_URL=$database_url
SESSION_CSRF_SECRET=$csrf_secret
SESSION_TTL_HOURS=12
APP_ORIGIN=http://localhost:8080
WEB_PORT=8080
DEMO_BORROWER_PASSWORD=$borrower_password
DEMO_CUSTODIAN_PASSWORD=$custodian_password
EOF

printf 'Generated synthetic CI configuration.\n'
