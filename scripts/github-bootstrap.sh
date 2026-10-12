#!/usr/bin/env bash
# Creates labels, milestones and issues from scripts/backlog.json in the current repository.
# Requires: gh (authenticated, run inside the cloned repository), jq.
# Usage: scripts/github-bootstrap.sh            # create everything
#        DRY_RUN=1 scripts/github-bootstrap.sh  # print what would be created
# Safe to re-run: existing labels are updated, existing milestones and issues (same title) are skipped.
set -euo pipefail

cd "$(dirname "$0")/.."
FILE=scripts/backlog.json
DRY="${DRY_RUN:-0}"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
if [ "$DRY" != "1" ]; then
  command -v gh >/dev/null || { echo "gh is required" >&2; exit 2; }
  gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated: run 'gh auth login'" >&2; exit 2; }
fi

# jq.exe on Windows prints CRLF line endings, which breaks values read in this script.
# Strip carriage returns from every jq (and gh) result.
jq() { command jq "$@" | tr -d '\r'; }

run() { if [ "$DRY" = "1" ]; then printf 'DRY: %s\n' "$*"; else "$@" >/dev/null; fi; }

echo "== labels"
jq -r '.labels | to_entries[] | "\(.key)\t\(.value)"' "$FILE" | while IFS=$'\t' read -r name color; do
  run gh label create "$name" --color "$color" --force
done

echo "== milestones"
existing_ms=""
[ "$DRY" = "1" ] || existing_ms=$(gh api "repos/{owner}/{repo}/milestones?state=all&per_page=100" --jq '.[].title' | tr -d '\r')
jq -c '.milestones[]' "$FILE" | while read -r m; do
  title=$(jq -r .title <<<"$m")
  if grep -Fxq "$title" <<<"$existing_ms"; then echo "skip milestone: $title"; continue; fi
  desc=$(jq -r .description <<<"$m"); due=$(jq -r .due_on <<<"$m")
  run gh api "repos/{owner}/{repo}/milestones" -f title="$title" -f description="$desc" -f due_on="$due"
  echo "milestone: $title"
done

echo "== issues"
existing_is=""
[ "$DRY" = "1" ] || existing_is=$(gh issue list --state all --limit 1000 --json title --jq '.[].title' | tr -d '\r')
jq -c '.issues[]' "$FILE" | while read -r i; do
  title=$(jq -r .title <<<"$i")
  if grep -Fxq "$title" <<<"$existing_is"; then echo "skip issue: $title"; continue; fi
  milestone=$(jq -r .milestone <<<"$i")
  body=$(jq -r '"Refs: \(.refs)\n\n## Done when\n" + ([.done[] | "- [ ] " + .] | join("\n"))' <<<"$i")
  args=(--title "$title" --body "$body" --milestone "$milestone")
  while IFS= read -r l; do args+=(--label "$l"); done < <(jq -r '.labels[]' <<<"$i")
  run gh issue create "${args[@]}"
  echo "issue: $title"
  [ "$DRY" = "1" ] || sleep 2   # stay under GitHub secondary rate limits
done
echo "done"
