"""gen-code's "Commit implementation" step, run for real against a local git remote.

The step decides whether the agent produced anything to push. It once dropped work the
agent had committed itself (CR-014, 2026-09-27); these cases pin that down. `gh` is a
stub that records its calls, so nothing reaches GitHub.
"""

from __future__ import annotations

import json
from pathlib import Path

import _support as s

SCRIPT = s.step_script("cr-lifecycle.yml", "gen-code", step_name="Commit implementation")


class CommitStep(s.Scratch):
    def setUp(self) -> None:
        super().setUp()
        seed = self.scratch_dhf(self.tmp / "seed")
        self.cr = self.new_cr(seed, affected=["SYS-001"], status="design")
        (seed / "apps" / "client").mkdir(parents=True)
        (seed / "apps" / "client" / "app.ts").write_text("export const a = 1;\n")
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
        self.gh_log = self.tmp / "gh.log"
        self.bin = self.tmp / "bin"
        s.stub_bin(self.bin, "gh", f'echo "$@" >> "{self.gh_log}"\n')
        self.env_file = self.tmp / "github_env"
        self.env_file.write_text("")

    def run_step(self) -> tuple[int, dict[str, str]]:
        result = s.run(
            ["bash", "-e", "-c", SCRIPT], cwd=self.work, check=False,
            env={
                "PATH": f"{self.bin}:{s.os.environ['PATH']}",
                "CR_ID": self.cr, "PR_NUMBER": "119", "GH_TOKEN": "unused",
                "GITHUB_ENV": str(self.env_file), "GHA_EXPR": "",
            },
        )
        flags = dict(l.split("=", 1) for l in self.env_file.read_text().splitlines() if "=" in l)
        return result.returncode, flags

    def head(self) -> str:
        return s.git(self.work, "rev-parse", "HEAD").stdout.strip()

    def status(self) -> str:
        return s.medharness(self.work, "item", "get", self.cr)["status"]

    def test_new_code_is_committed_and_the_cr_moves_to_develop(self):
        (self.work / "apps" / "client" / "feature.ts").write_text("export const f = 1;\n")
        before = self.head()
        code, flags = self.run_step()
        self.assertEqual(code, 0)
        self.assertEqual(flags.get("COMMITTED"), "true")
        self.assertNotEqual(self.head(), before)
        self.assertEqual(self.status(), "develop")
        committed = s.git(self.work, "show", "--stat", "--format=%s", "HEAD").stdout
        self.assertIn("feature.ts", committed)
        self.assertIn(f"{self.cr}.yaml", committed, "the status change travels in the same commit")

    def test_work_the_agent_committed_itself_still_counts(self):
        s.medharness(self.work, "item", "transition", self.cr, "develop")
        s.git(self.work, "add", "-A")
        s.git(self.work, "commit", "-q", "-m", "agent: develop")
        (self.work / "apps" / "client" / "feature.ts").write_text("export const f = 1;\n")
        s.git(self.work, "add", "-A")
        s.git(self.work, "commit", "-q", "-m", "agent: feature")
        before = self.head()
        code, flags = self.run_step()
        self.assertEqual(code, 0, "an agent-made commit must not be reported as 'no code changes'")
        self.assertEqual(flags.get("COMMITTED"), "true")
        self.assertEqual(self.head(), before, "nothing left to commit, so no extra commit")

    def test_no_changes_anywhere_fails_and_says_so_on_the_pr(self):
        s.medharness(self.work, "item", "transition", self.cr, "develop")
        s.git(self.work, "add", "-A")
        s.git(self.work, "commit", "-q", "-m", "agent: develop")
        s.git(self.work, "push", "-q", "origin", "HEAD")
        code, flags = self.run_step()
        self.assertEqual(code, 1)
        self.assertNotIn("COMMITTED", flags)
        self.assertIn("pr comment", self.gh_log.read_text())

    def test_the_commit_message_summarises_what_this_run_staged(self):
        (self.work / "apps" / "client" / "feature.ts").write_text("export const f = 1;\n")
        self.run_step()
        body = s.git(self.work, "log", "-1", "--format=%b").stdout
        self.assertRegex(body, r"\d+ files? changed")


if __name__ == "__main__":
    import unittest
    unittest.main()
