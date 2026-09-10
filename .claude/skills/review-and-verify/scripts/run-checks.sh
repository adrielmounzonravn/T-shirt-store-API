#!/usr/bin/env bash
# Runs the project's executable checks and prints a markdown summary table.
# Usage: run-checks.sh [--skip-e2e]
#
# Exit code is non-zero if any check failed, so callers can branch on it.

set -uo pipefail

skip_e2e=false
for arg in "$@"; do
  case "$arg" in
    --skip-e2e) skip_e2e=true ;;
  esac
done

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root" || exit 1

log_dir="$(mktemp -d)"
overall_status=0

run_check() {
  local label="$1"
  shift
  local log_file="$log_dir/$(echo "$label" | tr ' /' '__').log"
  if "$@" >"$log_file" 2>&1; then
    printf '| %s | `%s` | OK |\n' "$label" "$*"
  else
    overall_status=1
    printf '| %s | `%s` | FAIL (see %s) |\n' "$label" "$*" "$log_file"
  fi
}

echo "| Check | Command | Result |"
echo "| --- | --- | --- |"
run_check "Lint" npm run lint
run_check "Typecheck" npm run typecheck
run_check "Unit tests" npm test
if [ "$skip_e2e" = false ]; then
  run_check "E2E tests" npm run test:e2e
else
  echo "| E2E tests | (skipped) | SKIPPED |"
fi

echo
echo "Full logs kept in: $log_dir"

exit $overall_status
