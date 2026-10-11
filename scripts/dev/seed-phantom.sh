#!/usr/bin/env bash
# Upload the synthetic phantom series (apps/client/e2e/fixtures/dicom) to an Orthanc.
# Idempotent: the UIDs are fixed, so a second run replaces nothing and adds nothing.
#   ORTHANC_URL  default http://127.0.0.1:8042
set -euo pipefail

ORTHANC_URL="${ORTHANC_URL:-http://127.0.0.1:8042}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURES="$ROOT/apps/client/e2e/fixtures/dicom"

count=0
while IFS= read -r file; do
  curl -sf -X POST "$ORTHANC_URL/instances" -H 'Content-Type: application/dicom' \
    --data-binary "@$file" -o /dev/null || { echo "upload failed: $file" >&2; exit 1; }
  count=$((count + 1))
done < <(find "$FIXTURES" -name '*.dcm' | sort)

echo "uploaded $count phantom instances to $ORTHANC_URL"
