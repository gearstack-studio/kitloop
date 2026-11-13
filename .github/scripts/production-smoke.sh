#!/usr/bin/env bash
set -euo pipefail

runtime_env="${1:?Pass the generated production-test configuration path}"
runtime_project="${COMPOSE_PROJECT_NAME:?Set a unique test Compose project name}-production"
compose() {
  docker compose -f docker-compose.production-test.yml --env-file "$runtime_env" -p "$runtime_project" "$@"
}
cleanup() {
  local status=$?
  trap - EXIT
  compose --profile check down --volumes --remove-orphans || status=1
  exit "$status"
}
trap cleanup EXIT

expect_exit() {
  local expected="$1"
  shift
  local status=0
  "$@" || status=$?
  if [[ "$status" -ne "$expected" ]]; then
    printf 'Expected exit %s, received %s.\n' "$expected" "$status" >&2
    exit 1
  fi
}

compose --profile check config --quiet
compose --profile check build
compose up -d --wait production
compose run --rm verify node scripts/verify-production.mjs before-restart
compose stop production
container_id="$(compose ps --all --quiet production)"
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$container_id")" == "0" ]]
printf 'PASS graceful SIGTERM shutdown with exit 0\n'
compose up -d --wait production
compose run --rm verify node scripts/verify-production.mjs after-restart

# These commands must fail, with sanitized messages and stable error categories.
expect_exit 2 compose run --rm --no-deps -e DATABASE_URL= migrate
expect_exit 1 compose run --rm --no-deps -e DATABASE_URL=postgresql://unreachable:unreachable@127.0.0.1:1/kitloop_test?connect_timeout=1 migrate
expect_exit 2 compose run --rm --no-deps -e BOOTSTRAP_INPUT= bootstrap
expect_exit 1 compose run --rm --no-deps -e SESSION_CSRF_SECRET=short production
expect_exit 1 compose run --rm --no-deps -e NODE_ENV=production verify npm run db:seed
printf 'PASS migration/configuration/bootstrap failure paths and production demo-seed guard\n'
