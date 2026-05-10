#!/usr/bin/env bash
# wsl-deploy.sh — deploy the WebTPS stack to the local workstation.
#
# Owns the steps that the `deploy` job in .github/workflows/ci-pipeline.yml
# used to inline. Extracted so the same script can be run manually for
# ad-hoc redeploys without copy-pasting from the workflow.
#
# Inputs (env vars):
#   WEBTPS_ORTHANC_DATA_DIR  Persistent directory for Orthanc's database.
#                            Default: $HOME/webtps-orthanc-db.
#   SECRETS_FILE             Path to env file persisted between deploys
#                            (typically holds ISSUES_TOKEN). Default:
#                            $HOME/.webtps-secrets.env.
#   ISSUES_TOKEN             When set, written into SECRETS_FILE so that
#                            ad-hoc `docker compose` runs pick it up. Not
#                            required if SECRETS_FILE already exists.
#   COMPOSE_FILE             Compose file to deploy. Default:
#                            docker-compose.deploy.yml.
#
# Behaviour:
#   1. Resolve the persistent DICOM data dir; chmod 777 so the Orthanc
#      container can write regardless of which UID it runs as.
#   2. Keep the running Orthanc container untouched when its image matches
#      what the compose file requests. Otherwise (re)create it.
#   3. Persist ISSUES_TOKEN to SECRETS_FILE if provided.
#   4. `docker compose up -d --build --no-deps api client` to rebuild the
#      application containers.
#
# The verify-readiness step is the caller's responsibility — when running
# under CI it's handled by the wait-for-services composite action; for
# manual runs, hit the deployed endpoints yourself.

set -euo pipefail

WEBTPS_ORTHANC_DATA_DIR="${WEBTPS_ORTHANC_DATA_DIR:-$HOME/webtps-orthanc-db}"
SECRETS_FILE="${SECRETS_FILE:-$HOME/.webtps-secrets.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.deploy.yml}"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "::error::wsl-deploy: compose file '$COMPOSE_FILE' not found in CWD ($PWD)"
  exit 1
fi

# 1. Persistent DICOM data dir
mkdir -p "$WEBTPS_ORTHANC_DATA_DIR"
chmod 777 "$WEBTPS_ORTHANC_DATA_DIR"
echo "Using WEBTPS_ORTHANC_DATA_DIR=$WEBTPS_ORTHANC_DATA_DIR"
export WEBTPS_ORTHANC_DATA_DIR

# 2. Ensure persistent DICOM repository
desired_image="$(docker compose -f "$COMPOSE_FILE" config --images \
  | grep '^orthancteam/orthanc:' | head -n 1 || true)"
container_name="webtps-orthanc"

if [ -z "$desired_image" ]; then
  echo "::error::wsl-deploy: could not resolve desired DICOM repository image from $COMPOSE_FILE"
  exit 1
fi

running_state="$(docker inspect -f '{{.State.Running}}' "$container_name" 2>/dev/null || true)"
container_image_id="$(docker inspect -f '{{.Image}}' "$container_name" 2>/dev/null || true)"
container_config_image="$(docker inspect -f '{{.Config.Image}}' "$container_name" 2>/dev/null || true)"
desired_image_id="$(docker image inspect -f '{{.Id}}' "$desired_image" 2>/dev/null || true)"

orthanc_ok=false
if [ "$running_state" = "true" ] && [ -n "$desired_image_id" ] \
   && [ "$container_image_id" = "$desired_image_id" ]; then
  orthanc_ok=true
fi
if [ "$running_state" = "true" ] && [ -z "$desired_image_id" ] \
   && [ "$container_config_image" = "$desired_image" ]; then
  # Desired image not pulled locally, but the running container's config
  # references it by name — treat as up-to-date.
  orthanc_ok=true
fi

if [ "$orthanc_ok" = "true" ]; then
  echo "DICOM repository already running with $desired_image; leaving it unchanged."
else
  echo "Starting or updating persistent DICOM repository with $desired_image."
  docker compose -f "$COMPOSE_FILE" up -d dicom-repo
fi

# 3. Persist deployment secrets
if [ -n "${ISSUES_TOKEN:-}" ]; then
  printf 'ISSUES_TOKEN=%s\n' "$ISSUES_TOKEN" > "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
  echo "Wrote ISSUES_TOKEN to $SECRETS_FILE"
fi

# 4. Deploy application containers. Source secrets so ad-hoc compose runs
#    (container recreation, restarts) also pick up the token.
set -a
# shellcheck disable=SC1090
[ -f "$SECRETS_FILE" ] && . "$SECRETS_FILE"
set +a

docker compose -f "$COMPOSE_FILE" up -d --build --no-deps api client

docker compose -f "$COMPOSE_FILE" ps
