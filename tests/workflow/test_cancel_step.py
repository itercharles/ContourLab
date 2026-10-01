"""cancel-cr: a closed, unmerged CR PR records the CR as cancelled, through a PR of its own.

It once read the CR from DHF/items/09_cr/, where only the older CRs live; a CR made by
`item create` sits in 07_cr/, so cancelling CR-015 failed (2026-10-01). Run for real
against a local git remote, with a stub gh.
"""

from __future__ import annotations

import _support as s

SCRIPT = s.step_script("cr-lifecycle.yml", "cancel-cr", step_name="Cancel CR")


class CancelStep(s.Scratch):
    def setUp(self) -> None:
        super().setUp()
        self.seed = self.scratch_dhf(self.tmp / "seed")
        s.git(self.seed, "init", "-q", "-b", "main")
        s.git(self.seed, "add", "-A")
        s.git(self.seed, "commit", "-q", "-m", "base")
        self.origin = self.tmp / "origin.git"
        s.run(["git", "init", "-q", "--bare", "-b", "main", str(self.origin)], cwd=self.tmp)
        s.git(self.seed, "remote", "add", "origin", f"file://{self.origin}")
        s.git(self.seed, "push", "-q", "origin", "main")
        self.gh_log = self.tmp / "gh.log"
        self.bin = self.tmp / "bin"
        s.stub_bin(self.bin, "gh", f'echo "$@" >> "{self.gh_log}"\n')

    def push_cr_branch(self, move_to: str | None = None) -> str:
        """A feat/CR-NNN branch holding the CR, as intake leaves it (the CR is not on main)."""
        cr = self.new_cr(self.seed)
        branch = f"feat/{cr}"
        s.git(self.seed, "checkout", "-q", "-b", branch)
        if move_to:
            (self.item_files(self.seed, cr)[0]).rename(self.seed / "DHF" / "items" / move_to / f"{cr}.yaml")
        s.git(self.seed, "add", "-A")
        s.git(self.seed, "commit", "-q", "-m", f"cr: intake {cr}")
        s.git(self.seed, "push", "-q", "origin", branch)
        s.git(self.seed, "checkout", "-q", "main")
        return cr

    def cancel(self, cr: str, branch: str | None = None):
        work = self.tmp / "work"
        s.run(["git", "clone", "-q", f"file://{self.origin}", str(work)], cwd=self.tmp)
        result = s.run(
            ["bash", "-e", "-c", SCRIPT], cwd=work, check=False,
            env={"PATH": f"{self.bin}:{s.os.environ['PATH']}", "CR_ID": cr, "BRANCH": branch or f"feat/{cr}",
                 "GH_TOKEN": "unused", "GHA_EXPR": ""},
        )
        return work, result

    def assert_cancelled_on_its_own_branch(self, cr: str, work) -> None:
        pushed = s.git(work, "ls-remote", "--heads", "origin", f"chore/cancel-{cr}").stdout
        self.assertIn(f"chore/cancel-{cr}", pushed)
        self.assertIn("pr create", self.gh_log.read_text())
        (path,) = self.item_files(work, cr)
        self.assertIn("status: cancelled", path.read_text())
        self.assertEqual(s.git(work, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip(), f"chore/cancel-{cr}")

    def test_a_new_cr_in_the_default_directory_is_cancelled(self):
        cr = self.push_cr_branch()
        work, result = self.cancel(cr)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_cancelled_on_its_own_branch(cr, work)
        self.assertIn("07_cr", str(self.item_files(work, cr)[0]), "created by item create, so in the default directory")

    def test_an_older_cr_in_the_legacy_directory_is_cancelled_in_place(self):
        cr = self.push_cr_branch(move_to="09_cr")
        work, result = self.cancel(cr)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_cancelled_on_its_own_branch(cr, work)
        self.assertIn("09_cr", str(self.item_files(work, cr)[0]))
        self.assertEqual(len(self.item_files(work, cr)), 1)

    def test_a_branch_without_the_cr_file_fails_loudly(self):
        cr = self.push_cr_branch()
        work, result = self.cancel("CR-999", branch=f"feat/{cr}")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("CR-999 has no item file", result.stdout + result.stderr)
        self.assertFalse(self.gh_log.exists() and "pr create" in self.gh_log.read_text())


if __name__ == "__main__":
    import unittest
    unittest.main()
