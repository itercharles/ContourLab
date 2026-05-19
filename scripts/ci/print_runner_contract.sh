#!/usr/bin/env bash

set -euo pipefail

cat <<'EOF'
ContourLab GitHub Actions runner contract

Runner labels:
- default CI runner: self-hosted, linux, contourlab-local
- codegen runner: self-hosted, linux, contourlab-local-codegen
- deploy runner: self-hosted, linux, contourlab-deploy

Register exactly one Linux runner instance per VM.
Do not run multiple runner processes in the same VM.

Repository variables to set today:
- CONTOURLAB_DEFAULT_RUNS_ON_JSON=["self-hosted","linux","contourlab-local"]
- CONTOURLAB_CODEGEN_RUNS_ON_JSON=["self-hosted","linux","contourlab-local-codegen"]
- CONTOURLAB_DEPLOY_RUNS_ON_JSON=["self-hosted","linux","contourlab-deploy"]

Rollback for non-deploy jobs:
- CONTOURLAB_DEFAULT_RUNS_ON_JSON=["ubuntu-latest"]

Suggested gh commands:
gh variable set CONTOURLAB_DEFAULT_RUNS_ON_JSON --body '["self-hosted","linux","contourlab-local"]'
gh variable set CONTOURLAB_CODEGEN_RUNS_ON_JSON --body '["self-hosted","linux","contourlab-local-codegen"]'
gh variable set CONTOURLAB_DEPLOY_RUNS_ON_JSON --body '["self-hosted","linux","contourlab-deploy"]'

Required packages in each CI/codegen VM:
Git, Docker Engine, Docker Compose plugin, curl, jq, gh (GitHub CLI), Python 3


Create the second Lima VM:
limactl create --name=contourlab-ci-codegen --vm-type=vz --cpus=4 --memory=8 --disk=60 template://ubuntu-24.04

Start after reboot:
limactl start contourlab-ci
limactl start contourlab-ci-codegen
limactl shell contourlab-ci -- sudo ./actions-runner/svc.sh status
limactl shell contourlab-ci-codegen -- sudo ./actions-runner/svc.sh status

Stop the local runner VM:
limactl stop contourlab-ci
limactl stop contourlab-ci-codegen
EOF

if command -v gh >/dev/null 2>&1; then
  if gh variable list >/tmp/contourlab-gh-variables.txt 2>/dev/null; then
    printf '\nCurrent repo variable values:\n'
    grep '^CONTOURLAB_.*RUNS_ON_JSON' /tmp/contourlab-gh-variables.txt || true
  fi
fi
