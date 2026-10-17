"""revise-code: a request for changes after the code was approved reopens the completed CR first.

Approving the code records the CR as completed on its branch, and the AI stages refuse a completed CR,
so the revision job reopens it in a commit of its own. Run for real against a local git remote with a
scratch copy of the DHF (MedHarness 0.62.0 or later).
"""

from __future__ import annotations

import _support as s

REOPEN = s.step_script("cr-lifecycle.yml", "revise-code", step_id="reopen")


class ReopenStep(s.Scratch):
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
        self.out = self.tmp / "out"
        self.out.write_text("")

    def branch_for(self, cr: str, *, completed: bool) -> "s.Path":
        """A clone of feat/<cr>, where the CR is completed (as code-approved leaves it) or in develop."""
        if completed:
            s.medharness(self.seed, "item", "transition", cr, "completed")
        s.git(self.seed, "add", "-A")
        s.git(self.seed, "commit", "-q", "--allow-empty", "-m", f"state of {cr}")
        s.git(self.seed, "push", "-q", "origin", f"main:refs/heads/feat/{cr}")
        work = self.tmp / f"work-{cr}"
        s.run(["git", "clone", "-q", "--branch", f"feat/{cr}", f"file://{self.origin}", str(work)], cwd=self.tmp)
        return work

    def run_step(self, work, cr):
        return s.run(
            ["bash", "-e", "-c", REOPEN], cwd=work, check=False,
            env={"CR_ID": cr, "GITHUB_OUTPUT": str(self.out), "GHA_EXPR": ""},
        )

    def remote_head(self, work, cr) -> str:
        return s.git(work, "ls-remote", "origin", f"refs/heads/feat/{cr}").stdout.split()[0]

    def outputs(self) -> dict[str, str]:
        return dict(l.split("=", 1) for l in self.out.read_text().splitlines() if "=" in l)

    def test_a_completed_cr_is_reopened_in_a_commit_of_its_own_that_is_pushed(self):
        cr = self.new_cr(self.seed, status="develop")
        work = self.branch_for(cr, completed=True)
        before = self.remote_head(work, cr)

        result = self.run_step(work, cr)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(s.medharness(work, "item", "get", cr)["status"], "develop")
        after = self.remote_head(work, cr)
        self.assertNotEqual(after, before, "the reopening must reach the remote branch")
        diff = s.git(work, "show", "--format=%s", "-U0", "HEAD").stdout
        self.assertIn(f"chore: reopen {cr}", diff)
        changed = [l for l in diff.splitlines() if l and l[0] in "+-" and not l.startswith(("+++", "---"))]
        self.assertEqual(changed, ["-status: completed", "+status: develop"])
        self.assertEqual(self.outputs()["reopened"], "true")

    def test_a_cr_that_is_not_completed_is_left_alone(self):
        cr = self.new_cr(self.seed, status="develop")
        work = self.branch_for(cr, completed=False)
        before = self.remote_head(work, cr)

        result = self.run_step(work, cr)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.remote_head(work, cr), before, "no commit when there is nothing to reopen")
        self.assertEqual(self.outputs()["reopened"], "false")

    def test_a_cr_that_a_release_lists_is_not_reopened_and_the_step_fails(self):
        # CR-003 is in REL-001's included_items in the real DHF: it shipped, a new CR changes it.
        work = self.branch_for("CR-003", completed=False)
        self.assertEqual(s.medharness(work, "item", "get", "CR-003")["status"], "completed")
        before = self.remote_head(work, "CR-003")

        result = self.run_step(work, "CR-003")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not_released", result.stdout + result.stderr)
        self.assertEqual(self.remote_head(work, "CR-003"), before)
        self.assertEqual(s.medharness(work, "item", "get", "CR-003")["status"], "completed")


if __name__ == "__main__":
    import unittest
    unittest.main()
