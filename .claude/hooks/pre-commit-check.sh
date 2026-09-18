#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"
command="$(echo "$input" | jq -r '.tool_input.command // empty')"

matched=0
while IFS= read -r segment; do
  trimmed="$(echo "$segment" | sed -E 's/^[[:space:]]+//')"
  if [[ "$trimmed" =~ ^git[[:space:]]+commit([[:space:]]|$) ]]; then
    matched=1
    break
  fi
done < <(echo "$command" | sed -E 's/(&&|\|\||;|\|)/\n/g')

if [[ "$matched" -eq 1 ]]; then
  if npm run lint 1>&2 && npm run typecheck 1>&2 && npm test 1>&2 && npm run test:e2e 1>&2; then
    exit 0
  else
    exit 2
  fi
fi

exit 0
