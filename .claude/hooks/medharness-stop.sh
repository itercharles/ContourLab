#!/usr/bin/env bash
# .claude/hooks/medharness-stop.sh
# Do not end a turn on a broken DHF: when the agent is about to stop and DHF/ has uncommitted changes,
# run verify dhf and, if it fails, send the findings back and keep the agent working.
# stop_hook_active is true when the agent is already continuing because of this hook, which keeps it from
# looping on a failure it cannot fix.
[ "$(jq -r '.stop_hook_active')" = "true" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
# Use the project's own medharness (pip install -r requirements.txt into .venv) when there is one: a
# medharness older than the pinned one reads this DHF wrongly ("Unknown doc type 'UC'") and would hold the agent
# for a fault that is not in the DHF. Without a .venv, the one on PATH is used, as in CI.
[ -x "$CLAUDE_PROJECT_DIR/.venv/bin/medharness" ] && PATH="$CLAUDE_PROJECT_DIR/.venv/bin:$PATH"
[ -z "$(git status --porcelain -- DHF)" ] && exit 0
findings=$(medharness --dhf DHF verify dhf 2>&1 >/dev/null) && exit 0
echo "$findings" | grep -A1 '^FAIL' >&2 || echo "$findings" >&2
exit 2
