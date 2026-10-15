#!/usr/bin/env bash
# backup-orthanc.sh — copy the DICOM repository's data directory to a dated archive.
#
# Orthanc keeps its index and the DICOM files in one directory. Copying that directory while Orthanc
# writes to it can capture the index and the files at different moments, so the container is stopped
# for the copy (seconds for a few hundred megabytes) and always started again, even if the copy fails.
# The archive holds patient data: it is created readable by its owner only and stays on this
# machine unless someone copies it elsewhere.
#
# Inputs (env vars):
#   CONTOURLAB_ORTHANC_DATA_DIR  Orthanc's data directory. Default: $HOME/contourlab-orthanc-db.
#   CONTOURLAB_BACKUP_DIR        Where archives go. Default: $HOME/contourlab-backups.
#   CONTOURLAB_BACKUP_KEEP       How many of the newest archives to keep. Default: 7.
#   CONTOURLAB_ORTHANC_CONTAINER Container to stop for the copy. Default: webtps-orthanc.
#
# Restore: see docs/local_development.md ("Backup and restore of the deployed repository").

set -euo pipefail

DATA_DIR="${CONTOURLAB_ORTHANC_DATA_DIR:-$HOME/contourlab-orthanc-db}"
BACKUP_DIR="${CONTOURLAB_BACKUP_DIR:-$HOME/contourlab-backups}"
KEEP="${CONTOURLAB_BACKUP_KEEP:-7}"
CONTAINER="${CONTOURLAB_ORTHANC_CONTAINER:-webtps-orthanc}"

case "$KEEP" in ''|*[!0-9]*|0) echo "CONTOURLAB_BACKUP_KEEP must be a positive number, got '$KEEP'" >&2; exit 2 ;; esac

if [ ! -d "$DATA_DIR" ]; then
  echo "No data directory at $DATA_DIR; nothing to back up."
  exit 0
fi

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
archive="$BACKUP_DIR/orthanc-$stamp.tar"
partial="$archive.partial"

was_running="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)"
restart() {
  if [ "$was_running" = "true" ]; then
    docker start "$CONTAINER" > /dev/null
    echo "Started $CONTAINER again."
  fi
}

if [ "$was_running" = "true" ]; then
  echo "Stopping $CONTAINER for a consistent copy."
  docker stop "$CONTAINER" > /dev/null
fi
trap 'rm -f "$partial"; restart' EXIT

tar -cf "$partial" -C "$DATA_DIR" .
# An archive that cannot be read back is not a backup.
tar -tf "$partial" > /dev/null
mv "$partial" "$archive"
echo "Wrote $archive ($(du -h "$archive" | cut -f1))."

# Keep the newest $KEEP archives.
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/orthanc-*.tar 2>/dev/null | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
  rm -f "$old"
  echo "Removed old backup $old."
done
