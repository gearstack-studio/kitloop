#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# A fake gcloud makes these checks safe without any cloud credentials.
gcloud() {
  case "$1 $2" in
    'config get-value') printf '%s\n' lab-5-cloud-deployment-514310 ;;
    'auth list') printf '%s\n' reviewer@example.invalid ;;
    *) printf 'UNEXPECTED CLOUD CALL\n' >&2; return 99 ;;
  esac
}
export -f gcloud

output="$(bash "$script_dir/prepare.sh" registry </dev/null 2>&1 || true)"
[[ "$output" == *'interactive terminal'* ]] || { printf 'FAIL: noninteractive mutation was not refused\n' >&2; exit 1; }
[[ "$output" != *'UNEXPECTED CLOUD CALL'* ]] || { printf 'FAIL: cloud mutation was reached\n' >&2; exit 1; }

gcloud() {
  case "$1 $2" in
    'config get-value') printf '%s\n' wrong-project ;;
    'auth list') printf '%s\n' reviewer@example.invalid ;;
    *) printf 'UNEXPECTED CLOUD CALL\n' >&2; return 99 ;;
  esac
}
export -f gcloud
output="$(bash "$script_dir/prepare.sh" registry </dev/null 2>&1 || true)"
[[ "$output" == *'Active gcloud project is not'* ]] || { printf 'FAIL: wrong project was not refused\n' >&2; exit 1; }
[[ "$output" != *'UNEXPECTED CLOUD CALL'* ]] || { printf 'FAIL: cloud mutation was reached\n' >&2; exit 1; }

printf 'PASS: noninteractive and wrong-project mutation guards\n'
