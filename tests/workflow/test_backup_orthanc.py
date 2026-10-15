"""scripts/deploy/backup-orthanc.sh: the repository is stopped for the copy and always started again.

Runs the real script against a scratch data directory, with a stub `docker`.
"""

from __future__ import annotations

import os
import stat
import time
import unittest
from pathlib import Path

import _support as s

SCRIPT = s.REPO / "scripts" / "deploy" / "backup-orthanc.sh"


class BackupOrthanc(s.Scratch):
    def setUp(self) -> None:
        super().setUp()
        self.data = self.tmp / "data"
        (self.data / "00").mkdir(parents=True)
        (self.data / "00" / "file.dcm").write_text("dicom bytes")
        (self.data / "index").write_text("index")
        self.backups = self.tmp / "backups"
        self.log = self.tmp / "docker.log"
        self.bin = self.tmp / "bin"

    def stub_docker(self, running: bool = True) -> None:
        s.stub_bin(self.bin, "docker", f'''echo "$@" >> "{self.log}"
case "$1" in
  inspect) echo {"true" if running else "false"} ;;
esac
''')

    def run_script(self, *, keep: str = "7", check: bool = True, backups: Path | None = None):
        return s.run(
            ["bash", str(SCRIPT)], cwd=self.tmp, check=check,
            env={
                "PATH": f"{self.bin}:{os.environ['PATH']}",
                "CONTOURLAB_ORTHANC_DATA_DIR": str(self.data),
                "CONTOURLAB_BACKUP_DIR": str(backups or self.backups),
                "CONTOURLAB_BACKUP_KEEP": keep,
                "CONTOURLAB_ORTHANC_CONTAINER": "orthanc-x",
            },
        )

    def docker_calls(self) -> list[str]:
        return [line.split()[0] for line in self.log.read_text().splitlines()]

    def archives(self) -> list[Path]:
        return sorted(self.backups.glob("orthanc-*.tar"))

    def test_writes_an_archive_with_the_data_that_only_its_owner_can_read(self):
        self.stub_docker()
        self.run_script()

        (archive,) = self.archives()
        self.assertEqual(stat.S_IMODE(archive.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.backups.stat().st_mode), 0o700)
        listing = s.run(["tar", "-tf", str(archive)], cwd=self.tmp).stdout
        self.assertIn("00/file.dcm", listing)
        self.assertIn("index", listing)

    def test_stops_the_container_for_the_copy_and_starts_it_again(self):
        self.stub_docker()
        self.run_script()
        self.assertEqual(self.docker_calls(), ["inspect", "stop", "start"])

    def test_a_backup_directory_that_cannot_be_made_stops_nothing(self):
        self.stub_docker()
        blocked = self.tmp / "not-a-directory"
        blocked.write_text("a file where the backup directory should be")

        result = self.run_script(check=False, backups=blocked / "backups")

        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.log.exists(), "docker must not be touched when there is nowhere to write")

    def test_a_failed_copy_after_the_stop_still_restarts_and_leaves_no_partial_archive(self):
        self.stub_docker()
        s.stub_bin(self.bin, "tar", "echo tar failed >&2\nexit 1\n")

        result = self.run_script(check=False)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.docker_calls(), ["inspect", "stop", "start"])
        self.assertEqual(list(self.backups.glob("*")), [])

    def test_leaves_a_stopped_container_stopped(self):
        self.stub_docker(running=False)
        self.run_script()
        self.assertEqual(self.docker_calls(), ["inspect"])
        self.assertEqual(len(self.archives()), 1)

    def test_keeps_only_the_newest_archives(self):
        self.stub_docker()
        for _ in range(3):
            self.run_script(keep="2")
            time.sleep(1.1)
        names = [p.name for p in self.archives()]
        self.assertEqual(len(names), 2)

    def test_nothing_to_back_up_is_not_an_error(self):
        self.stub_docker()
        self.data = self.tmp / "missing"
        result = self.run_script()
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.archives(), [])

    def test_a_bad_keep_value_is_refused(self):
        self.stub_docker()
        result = self.run_script(keep="0", check=False)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.archives(), [])


if __name__ == "__main__":
    unittest.main()
