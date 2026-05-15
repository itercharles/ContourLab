#!/usr/bin/env bash

set -euo pipefail

cat <<'EOF'
WebTPS GitHub Actions runner contract

Runner labels:
- default CI runner: self-hosted, linux, webtps-local
- codegen runner: self-hosted, linux, webtps-local-codegen
- deploy runner: self-hosted, linux, webtps-deploy

Register exactly one Linux runner instance per VM.
Do not run multiple runner processes in the same VM.

Repository variables to set today:
- WEBTPS_DEFAULT_RUNS_ON_JSON=["self-hosted","linux","webtps-local"]
- WEBTPS_CODEGEN_RUNS_ON_JSON=["self-hosted","linux","webtps-local-codegen"]
- WEBTPS_DEPLOY_RUNS_ON_JSON=["self-hosted","linux","webtps-deploy"]

Rollback for non-deploy jobs:
- WEBTPS_DEFAULT_RUNS_ON_JSON=["ubuntu-latest"]

Suggested gh commands:
gh variable set WEBTPS_DEFAULT_RUNS_ON_JSON --body '["self-hosted","linux","webtps-local"]'
gh variable set WEBTPS_CODEGEN_RUNS_ON_JSON --body '["self-hosted","linux","webtps-local-codegen"]'
gh variable set WEBTPS_DEPLOY_RUNS_ON_JSON --body '["self-hosted","linux","webtps-deploy"]'

Required packages in each CI/codegen VM:
Git, Docker Engine, Docker Compose plugin, curl, jq, gh (GitHub CLI), Python 3

Create the second Lima VM:
limactl create --name=webtps-ci-codegen --vm-type=vz --cpus=4 --memory=8 --disk=60 template://ubuntu-24.04

Start after reboot:
limactl start webtps-ci
limactl start webtps-ci-codegen
limactl shell webtps-ci -- sudo ./actions-runner/svc.sh status
limactl shell webtps-ci-codegen -- sudo ./actions-runner/svc.sh status

Stop the local runner VM:
limactl stop webtps-ci
limactl stop webtps-ci-codegen
EOF

if command -v gh >/dev/null 2>&1; then
  if gh variable list >/tmp/webtps-gh-variables.txt 2>/dev/null; then
    printf '\nCurrent repo variable values:\n'
    grep '^WEBTPS_.*RUNS_ON_JSON' /tmp/webtps-gh-variables.txt || true
  fi
fi
