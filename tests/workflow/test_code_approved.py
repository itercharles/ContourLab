"""code-approved: approving the code records the CR as completed on its branch.

The completion commit is what removes the separate close-out PR, so these run the two steps for real
against a local git remote with a scratch copy of the DHF; `gh` is a stub.
"""

from __future__ import annotations

import _support as s

COMPLETE = s.step_script("cr-lifecycle.yml", "code-approved", step_id="complete")
WAIT_CI = s.step_script("cr-lifecycle.yml", "code-approved", step_id="ci")


class Base(s.Scratch):
    def setUp(self) -> None:
        super().setUp()
        seed = self.scratch_dhf(self.tmp / "seed")
        self.cr = self.new_cr(seed, affected=["SYS-001"], status="develop")
        s.git(seed, "init", "-q", "-b", "main")
        s.git(seed, "add", "-A")
        s.git(seed, "commit", "-q", "-m", "base")
        self.origin = self.tmp / "origin.git"
        s.run(["git", "init", "-q", "--bare", "-b", "main", str(self.origin)], cwd=self.tmp)
        s.git(seed, "remote", "add", "origin", f"file://{self.origin}")
        s.git(seed, "push", "-q", "origin", "main")
        s.git(seed, "push", "-q", "origin", f"main:refs/heads/feat/{self.cr}")
        self.work = self.tmp / "work"
        s.run(["git", "clone", "-q", "--branch", f"feat/{self.cr}", f"file://{self.origin}", str(self.work)], cwd=self.tmp)
        self.bin = self.tmp / "bin"
        self.out = self.tmp / "out"
        self.out.write_text("")

    def outputs(self) -> dict[str, str]:
        return dict(l.split("=", 1) for l in self.out.read_text().splitlines() if "=" in l)

    def remote_head(self) -> str:
        return s.git(self.work, "ls-remote", "origin", f"refs/heads/feat/{self.cr}").stdout.split()[0]


class RecordCompleted(Base):
    def complete(self):
        return s.run(
            ["bash", "-e", "-c", COMPLETE], cwd=self.work, check=False,
            env={"CR_ID": self.cr, "GITHUB_OUTPUT": str(self.out), "GHA_EXPR": ""},
        )

    def status(self) -> str:
        return s.medharness(self.work, "item", "get", self.cr)["status"]

    def test_the_cr_is_completed_in_a_commit_that_is_pushed_to_the_branch(self):
        before = self.remote_head()
        result = self.complete()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.status(), "completed")
        after = self.remote_head()
        self.assertNotEqual(after, before, "the commit must reach the remote branch")
        self.assertEqual(self.outputs()["sha"], after)
        files = s.git(self.work, "show", "--name-only", "--format=%s", "HEAD").stdout
        self.assertIn(f"chore: complete {self.cr}", files)
        self.assertIn(f"{self.cr}.yaml", files)
        changed = [l for l in files.splitlines()[1:] if l.strip()]
        self.assertEqual(len(changed), 1, "the commit changes the CR file and nothing else")

    def test_the_commit_changes_only_the_status_line(self):
        self.complete()
        diff = s.git(self.work, "show", "--format=", "-U0", "HEAD").stdout
        changed = [l for l in diff.splitlines() if l[:1] in "+-" and not l.startswith(("+++", "---"))]
        self.assertEqual(changed, ["-status: develop", "+status: completed"])

    def test_a_cr_that_is_already_completed_is_left_alone(self):
        self.complete()
        head = self.remote_head()
        result = self.complete()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.remote_head(), head, "no second commit")
        self.assertEqual(self.outputs()["sha"], head)

    def test_a_cr_the_lifecycle_will_not_complete_stops_the_step_and_pushes_nothing(self):
        # A CR that is still `design` has no move to `completed`: the lifecycle refuses it.
        seed = self.tmp / "seed"
        cr2 = self.new_cr(seed, status="design")
        s.git(seed, "add", "-A")
        s.git(seed, "commit", "-q", "-m", "second CR")
        s.git(seed, "push", "-q", "origin", f"main:refs/heads/feat/{cr2}")
        work2 = self.tmp / "work2"
        s.run(["git", "clone", "-q", "--branch", f"feat/{cr2}", f"file://{self.origin}", str(work2)], cwd=self.tmp)
        before = s.git(work2, "ls-remote", "origin", f"refs/heads/feat/{cr2}").stdout.split()[0]

        result = s.run(
            ["bash", "-e", "-c", COMPLETE], cwd=work2, check=False,
            env={"CR_ID": cr2, "GITHUB_OUTPUT": str(self.out), "GHA_EXPR": ""},
        )

        self.assertNotEqual(result.returncode, 0)
        after = s.git(work2, "ls-remote", "origin", f"refs/heads/feat/{cr2}").stdout.split()[0]
        self.assertEqual(after, before)


class WaitForCi(Base):
    def wait(self, *, runs: str, watch_exit: int = 0, sha: str = "abc123") -> dict[str, str]:
        s.stub_bin(self.bin, "gh", f'''case "$1 $2" in
  "run list") printf '%s' '{runs}' | python3 -c "
import json,sys,re
# emulate --jq: print the databaseId of runs whose headSha matches
sha = sys.argv[1]
for run in json.load(sys.stdin):
    if run['headSha'] == sha: print(run['databaseId'])
" "$HEAD_SHA" ;;
  "run watch") exit {watch_exit} ;;
esac
''')
        s.stub_bin(self.bin, "sleep", "exit 0\n")
        s.run(
            ["bash", "-e", "-c", WAIT_CI], cwd=self.tmp,
            env={"PATH": f"{self.bin}:{s.os.environ['PATH']}", "GITHUB_OUTPUT": str(self.out), "GH_TOKEN": "t",
                 "REPO": "o/r", "BRANCH": "feat/CR-1", "HEAD_SHA": sha, "GHA_EXPR": ""},
        )
        return self.outputs()

    def test_waits_for_the_run_of_the_completion_commit_and_reports_green(self):
        runs = '[{"databaseId": 1, "headSha": "old"}, {"databaseId": 2, "headSha": "abc123"}]'
        self.assertEqual(self.wait(runs=runs)["passed"], "true")

    def test_a_failing_run_is_reported_with_its_id(self):
        runs = '[{"databaseId": 2, "headSha": "abc123"}]'
        result = self.wait(runs=runs, watch_exit=1)
        self.assertEqual(result["passed"], "false")
        self.assertIn("run 2", result["reason"])

    def test_a_run_for_an_older_commit_is_not_mistaken_for_it(self):
        runs = '[{"databaseId": 1, "headSha": "old"}]'
        result = self.wait(runs=runs)
        self.assertEqual(result["passed"], "false")
        self.assertIn("no CI run", result["reason"])


if __name__ == "__main__":
    import unittest
    unittest.main()
