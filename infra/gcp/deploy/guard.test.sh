#!/usr/bin/env bash
# Offline security checks. A disposable local Git repository stands in for the checked-out SHA.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
git -C "$work" init -q -b main
git -C "$work" config user.name Offline
git -C "$work" config user.email offline@example.invalid
printf 'reviewed source\n' > "$work/source"
git -C "$work" add source
git -C "$work" commit -qm source
git -C "$work" update-ref refs/remotes/origin/main "$(git -C "$work" rev-parse HEAD)"
export KITLOOP_AUTOMATED_RELEASE=1 GITHUB_ACTIONS=true GITHUB_EVENT_NAME=push
export GITHUB_REPOSITORY=gearstack-studio/kitloop GITHUB_REPOSITORY_ID=1442734708
export GITHUB_REPOSITORY_OWNER_ID=351405823 GITHUB_REF=refs/heads/main
export GITHUB_REF_PROTECTED=true
export GITHUB_WORKFLOW_REF=gearstack-studio/kitloop/.github/workflows/deploy.yml@refs/heads/main
export GITHUB_SHA
GITHUB_SHA="$(git -C "$work" rev-parse HEAD)"
source "$script_dir/guard.sh"
cd "$work"
pass=0
expect_pass() { "$@" >/dev/null 2>&1 || { printf 'FAIL: expected pass: %s\n' "$*" >&2; exit 1; }; pass=$((pass+1)); }
expect_fail() { if "$@" >/dev/null 2>&1; then printf 'FAIL: expected denial: %s\n' "$*" >&2; exit 1; fi; pass=$((pass+1)); }
expect_pass authorize_automated_release build
expect_pass authorize_automated_release migrate
expect_pass authorize_automated_release deploy
expect_pass authorize_automated_release rollback
expect_fail authorize_automated_release bootstrap
expect_fail authorize_automated_release publish
expect_fail bash -c 'source "$1"; confirm build' _ "$script_dir/../common.sh"
expect_fail env GITHUB_EVENT_NAME=pull_request bash "$script_dir/guard.sh"
expect_fail env GITHUB_REPOSITORY_ID=other bash "$script_dir/guard.sh"
expect_fail env GITHUB_REPOSITORY_OWNER_ID=other bash "$script_dir/guard.sh"
expect_fail env GITHUB_REF=refs/heads/sprint-1-staging bash "$script_dir/guard.sh"
expect_fail env GITHUB_REF_PROTECTED=false bash "$script_dir/guard.sh"
expect_fail env GITHUB_WORKFLOW_REF=gearstack-studio/kitloop/.github/workflows/wif-auth.yml@refs/heads/main bash "$script_dir/guard.sh"
expect_fail env GITHUB_SHA=0000000000000000000000000000000000000000 bash "$script_dir/guard.sh"
printf 'dirty\n' > untracked
expect_fail bash "$script_dir/guard.sh"
rm untracked
git update-ref refs/remotes/origin/main 0000000000000000000000000000000000000000
expect_fail bash "$script_dir/guard.sh"
printf 'PASS: %s offline deployment guard cases\n' "$pass"
