#!/usr/bin/env bash
# Release-only authorization for an approved GitHub Actions environment job.
# This script does not grant permissions; GCP WIF and GitHub environment rules must be configured separately.
deploy_guard_die() { printf 'ERROR: %s\n' "$*" >&2; return 1; }

assert_trusted_deploy_context() {
  [[ "${KITLOOP_AUTOMATED_RELEASE:-}" == 1 ]] || deploy_guard_die 'Automated release mode is not enabled.'
  [[ "${GITHUB_ACTIONS:-}" == true ]] || deploy_guard_die 'Not running in GitHub Actions.'
  [[ "${GITHUB_EVENT_NAME:-}" == push ]] || deploy_guard_die 'Only main push events may deploy.'
  [[ "${GITHUB_REPOSITORY:-}" == gearstack-studio/kitloop ]] || deploy_guard_die 'Wrong repository.'
  [[ "${GITHUB_REPOSITORY_ID:-}" == 1442734708 ]] || deploy_guard_die 'Wrong repository ID.'
  [[ "${GITHUB_REPOSITORY_OWNER_ID:-}" == 351405823 ]] || deploy_guard_die 'Wrong owner ID.'
  [[ "${GITHUB_REF:-}" == refs/heads/main ]] || deploy_guard_die 'Wrong branch ref.'
  [[ "${GITHUB_REF_PROTECTED:-}" == true ]] || deploy_guard_die 'Main branch protection is not active.'
  [[ "${GITHUB_WORKFLOW_REF:-}" == gearstack-studio/kitloop/.github/workflows/deploy.yml@refs/heads/main ]] ||
    deploy_guard_die 'Wrong deployment workflow ref.'
  [[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || deploy_guard_die 'Invalid source commit SHA.'
  command -v git >/dev/null 2>&1 || deploy_guard_die 'git is required.'
  [[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || deploy_guard_die 'Checkout does not match the event SHA.'
  [[ "$(git branch --show-current)" == main ]] || deploy_guard_die 'Checkout is not on main.'
  [[ "$(git rev-parse origin/main)" == "$GITHUB_SHA" ]] ||
    deploy_guard_die 'Main advanced after this run; stop this release.'
  [[ -z "$(git status --porcelain)" ]] || deploy_guard_die 'Release checkout is dirty.'
}

authorize_automated_release() {
  case "$1" in
    build|migrate|deploy|rollback) ;;
    *) deploy_guard_die "Action $1 requires a human Cloud Shell confirmation."; return 1 ;;
  esac
  assert_trusted_deploy_context
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  assert_trusted_deploy_context
fi
