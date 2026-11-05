"""issue-to-cr's "Prepare CR from issue" step, run against awkward issue titles.

The step once took the title from `${{ github.event.issue.title }}` pasted into the script,
so a title with a double quote broke it (CR-intake for issue #129, 2026-09-30) and
`$(...)` in a title would have run as shell on a runner holding secrets. The title now
arrives through the environment; these cases pin that down. `gh` is a stub.
"""

from __future__ import annotations

import json
from pathlib import Path

import _support as s

SCRIPT = s.step_script("issue-to-cr.yml", "create-cr", step_id="prepare")
OPEN_PR = s.step_script("issue-to-cr.yml", "create-cr", step_id="open_pr")

TITLES = [
    'Release notes page: add a "Back to workspace" link in the header',
    'quote then command"; touch PWNED_QUOTE; echo "',
    "substitution $(touch PWNED_SUBST) here",
    "backticks `touch PWNED_TICK` here",
    "apostrophe it's and a \\ backslash",
]


class IntakeTitle(s.Scratch):
    def create_cr(self, title: str) -> tuple[str, Path]:
        root = self.scratch_dhf()
        bin_dir = self.tmp / "bin"
        s.stub_bin(bin_dir, "gh", 'echo "The body of the issue."\n')
        out = self.tmp / "out"
        out.write_text("")
        s.run(
            ["bash", "-e", "-c", SCRIPT], cwd=root,
            env={
                "PATH": f"{bin_dir}:{s.os.environ['PATH']}", "GH_TOKEN": "unused",
                "GITHUB_OUTPUT": str(out), "GHA_EXPR": "129",
                "ISSUE_TITLE": title, "ISSUE_URL": "https://example.test/issues/129",
                "REQUESTED_BY": "someone", "MILESTONE": "2026-W23",
            },
        )
        cr_id = json.loads(Path("/tmp/issue-to-cr.json").read_text())["cr_id"]
        return cr_id, root

    def test_the_title_is_recorded_exactly_and_never_run(self):
        for title in TITLES:
            with self.subTest(title):
                cr_id, root = self.create_cr(title)
                self.assertEqual(s.medharness(root, "item", "get", cr_id)["title"], title)
                self.assertEqual(list(root.glob("PWNED*")), [], "a command in the title was executed")

    def test_the_milestone_and_requester_are_recorded(self):
        cr_id, root = self.create_cr("plain title")
        cr = s.medharness(root, "item", "get", cr_id)
        self.assertEqual((cr["target_version"], cr["requested_by"], cr["status"]), ("2026-W23", "someone", "new"))
        self.assertIn("https://example.test/issues/129", cr["description"])


class IntakeSkipsTakenBranches(s.Scratch):
    """A cancelled CR is not on main, so its number looks free while its branch may still be on the remote.

    Reusing the number would force-push over that branch; intake takes the next number instead and leaves no
    file behind for the one it skipped.
    """

    def run_intake(self, remote_branches: list[str]):
        root = self.scratch_dhf(self.tmp / f"dhf-{len(remote_branches)}")
        s.git(root, "init", "-q", "-b", "main")
        s.git(root, "add", "-A")
        s.git(root, "commit", "-q", "-m", "base")
        origin = self.tmp / f"origin-{len(remote_branches)}.git"
        s.run(["git", "init", "-q", "--bare", "-b", "main", str(origin)], cwd=self.tmp)
        s.git(root, "remote", "add", "origin", f"file://{origin}")
        s.git(root, "push", "-q", "origin", "main")
        for branch in remote_branches:
            s.git(root, "push", "-q", "origin", f"main:refs/heads/{branch}")
        bin_dir = self.tmp / "bin"
        s.stub_bin(bin_dir, "gh", 'echo "The body of the issue."\n')
        out = self.tmp / "out"
        out.write_text("")
        before = {p.name for p in (root / "DHF" / "items").rglob("CR-*.yaml")}
        result = s.run(
            ["bash", "-e", "-c", SCRIPT], cwd=root, check=False,
            env={"PATH": f"{bin_dir}:{s.os.environ['PATH']}", "GH_TOKEN": "unused", "GITHUB_OUTPUT": str(out),
                 "GHA_EXPR": "130", "ISSUE_TITLE": "t", "ISSUE_URL": "https://example.test/issues/130",
                 "REQUESTED_BY": "someone", "MILESTONE": "2026-W23"},
        )
        after = {p.name for p in (root / "DHF" / "items").rglob("CR-*.yaml")}
        return result, json.loads(Path("/tmp/issue-to-cr.json").read_text())["cr_id"] if result.returncode == 0 else None, sorted(after - before)

    def test_with_no_stale_branch_the_next_number_is_used(self):
        result, cr_id, added = self.run_intake([])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(added, [f"{cr_id}.yaml"])

    def test_a_number_whose_branch_exists_is_skipped_and_leaves_no_file(self):
        _, first, _ = self.run_intake([])
        number = int(first.split("-")[1])
        taken = [f"feat/CR-{number:03d}", f"feat/CR-{number + 1:03d}"]
        result, cr_id, added = self.run_intake(taken)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(cr_id, f"CR-{number + 2:03d}", "both taken numbers are skipped")
        self.assertEqual(added, [f"{cr_id}.yaml"], "no file is left for the skipped numbers")
        self.assertIn("already exists on the remote", result.stdout + result.stderr)

    def test_without_a_remote_nothing_is_skipped(self):
        root = self.scratch_dhf()
        bin_dir = self.tmp / "bin"
        s.stub_bin(bin_dir, "gh", 'echo "The body of the issue."\n')
        out = self.tmp / "out"
        out.write_text("")
        result = s.run(
            ["bash", "-e", "-c", SCRIPT], cwd=root, check=False,
            env={"PATH": f"{bin_dir}:{s.os.environ['PATH']}", "GH_TOKEN": "unused", "GITHUB_OUTPUT": str(out),
                 "GHA_EXPR": "130", "ISSUE_TITLE": "t", "ISSUE_URL": "https://example.test/issues/130",
                 "REQUESTED_BY": "someone", "MILESTONE": "2026-W23"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)


FAILURE_COMMENT = s.step_script("issue-to-cr.yml", "create-cr-design", step_name="Post design failure comment")


class DesignFailureComment(s.Scratch):
    """What the PR is told when `build plan` fails: a triage rejection (0.67.0) is not something to re-trigger."""

    def comment(self, plan_output: dict) -> str:
        Path("/tmp/generate-dhf-out.json").write_text(json.dumps(plan_output))
        log = self.tmp / "gh.log"
        s.stub_bin(self.tmp / "bin", "gh", f'printf "%s\\n" "$*" >> "{log}"\n')
        result = s.run(
            ["bash", "-c", FAILURE_COMMENT], cwd=self.tmp, check=False,
            env={"PATH": f"{self.tmp / 'bin'}:{s.os.environ['PATH']}", "GH_TOKEN": "t", "GHA_EXPR": "7",
                 "CR_ID": "CR-099", "PR_NUMBER": "7"},
        )
        self.assertEqual(result.returncode, 1, "the step still fails the job")
        return log.read_text()

    def test_a_triage_rejection_says_so_and_does_not_offer_to_re_trigger(self):
        body = self.comment({
            "outcome": "rejected",
            "errors": [{"field": "triage_result", "fix": "Close the change request, or reword it and run build plan again.",
                        "issue": "Triage rejected CR-099, so no design was generated: Duplicate of CRS-002."}],
        })
        self.assertIn("CR-099 was rejected at triage", body)
        self.assertIn("Duplicate of CRS-002.", body)
        self.assertIn("close this PR, or reword the issue and set its milestone again", body)
        self.assertNotIn("re-trigger", body)

    def test_a_rejection_without_an_error_text_still_says_it_was_rejected(self):
        body = self.comment({"outcome": "rejected", "errors": []})
        self.assertIn("rejected at triage", body)
        self.assertIn("The model rejected the change request at triage.", body)

    def test_other_validation_errors_keep_the_old_message(self):
        body = self.comment({"outcome": "completed_with_errors",
                             "errors": [{"field": "SRS-001", "issue": "no test", "fix": "add one"}]})
        self.assertIn("residual errors", body)
        self.assertIn("re-trigger", body)
        self.assertNotIn("rejected at triage", body)

    def test_a_failure_with_no_output_keeps_the_generic_message(self):
        body = self.comment({})
        self.assertIn("Design generation failed", body)
        self.assertNotIn("rejected at triage", body)


class OpenDraftPr(s.Scratch):
    """The CR PR is opened by the bot, so its reviewer is not its author.

    GitHub bars an author from approving or requesting changes on their own PR. With the PAT
    opening it (the user's account), the maintainer could only comment, and the design gate
    could not be tested (CR-016, 2026-10-01). The PAT also cannot edit issues (CR-015).
    """

    def run_step(self) -> list[str]:
        Path("/tmp/issue-to-cr.json").write_text(json.dumps({"cr_id": "CR-099"}))
        log = self.tmp / "gh.log"
        bin_dir = self.tmp / "bin"
        s.stub_bin(bin_dir, "gh", f'''echo "$GH_TOKEN|$1 $2" >> "{log}"
case "$1 $2" in "pr create") echo https://example.test/pull/1 ;; esac
''')
        out = self.tmp / "out"
        out.write_text("")
        s.run(
            ["bash", "-e", "-c", OPEN_PR], cwd=self.tmp,
            env={
                "PATH": f"{bin_dir}:{s.os.environ['PATH']}", "GITHUB_OUTPUT": str(out), "GHA_EXPR": "129",
                "GH_TOKEN": "workflow-token", "PR_TOKEN": "pat-token", "ISSUE_TITLE": "a title",
            },
        )
        return log.read_text().splitlines()

    def test_every_call_uses_the_workflow_token_so_the_bot_is_the_author(self):
        calls = dict(line.split("|", 1)[::-1] for line in self.run_step())
        for call in ("pr create", "issue edit", "issue comment"):
            self.assertEqual(calls[call], "workflow-token", call)

    def test_the_pat_is_not_available_to_this_step(self):
        env = next(st for st in s.yaml.safe_load((s.WORKFLOWS / "issue-to-cr.yml").read_text())["jobs"]["create-cr"]["steps"]
                   if st.get("id") == "open_pr")["env"]
        self.assertNotIn("ACTIONS_PAT", json.dumps(env))


if __name__ == "__main__":
    import unittest
    unittest.main()
