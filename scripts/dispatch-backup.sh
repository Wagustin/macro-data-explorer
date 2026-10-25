#!/usr/bin/env bash
# Backup trigger for the GitHub Actions schedules, which GitHub delays or skips on free plans.
# Run from the home server's cron; dispatches the workflow only if it hasn't started in the
# last MAX_AGE minutes, so on normal days it does nothing.
# Usage: dispatch-backup.sh <workflow.yml> <max_age_minutes>
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
WF="$1"; MAX_AGE="${2:-90}"
REPO="Wagustin/macro-data-explorer"
LAST=$(gh run list -R "$REPO" --workflow "$WF" --limit 1 --json createdAt -q '.[0].createdAt' 2>/dev/null)
if [ -n "$LAST" ]; then
  AGE=$(( ( $(date -u +%s) - $(date -u -d "$LAST" +%s) ) / 60 ))
  [ "$AGE" -lt "$MAX_AGE" ] && exit 0
fi
gh workflow run "$WF" -R "$REPO"
