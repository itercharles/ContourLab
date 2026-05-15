#!/usr/bin/env bash

set -euo pipefail

cat <<'EOF'
WebTPS GitHub Actions runner contract

Runner labels:
- self-hosted
- linux
- webtps-local
- webtps-deploy

Register exactly one Linux runner instance for now.
Apply both custom labels to that same runner:
- webtps-local
- webtps-deploy

Repository variables to set today:
- WEBTPS_DEFAULT_RUNS_ON_JSON=["self-hosted","linux","webtps-local"]
- WEBTPS_DEPLOY_RUNS_ON_JSON=["self-hosted","linux","webtps-deploy"]

Rollback for non-deploy jobs:
- WEBTPS_DEFAULT_RUNS_ON_JSON=["ubuntu-latest"]

Suggested gh commands:
gh variable set WEBTPS_DEFAULT_RUNS_ON_JSON --body '["self-hosted","linux","webtps-local"]'
gh variable set WEBTPS_DEPLOY_RUNS_ON_JSON --body '["self-hosted","linux","webtps-deploy"]'

Start after reboot:
limactl start webtps-ci
limactl shell webtps-ci -- sudo ./actions-runner/svc.sh status

Stop the local runner VM:
limactl stop webtps-ci
EOF

if command -v gh >/dev/null 2>&1; then
  if gh variable list >/tmp/webtps-gh-variables.txt 2>/dev/null; then
    printf '\nCurrent repo variable values:\n'
    grep '^WEBTPS_.*RUNS_ON_JSON' /tmp/webtps-gh-variables.txt || true
  fi
fi
