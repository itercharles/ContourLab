"""closed-notice: closing a CR's PR unmerged records nothing and says so on the issue.

The CR exists only on its branch, so main is unchanged and there is nothing to cancel. The issue is cleaned
of its stage labels (so setting the milestone again starts fresh) and told how to start again or to record
the cancellation by hand. `gh` is a stub that records its calls.
"""

from __future__ import annotations

import _support as s

TELL_ISSUE = s.step_script("cr-lifecycle.yml", "closed-notice", step_name="Tell the issue")


class ClosedNotice(s.Scratch):
    def run_step(self) -> list[str]:
        log = self.tmp / "gh.log"
        s.stub_bin(self.tmp / "bin", "gh", f'printf "%s\\n" "$*" >> "{log}"\n')
        s.run(
            ["bash", "-e", "-c", TELL_ISSUE], cwd=self.tmp,
            env={"PATH": f"{self.tmp / 'bin'}:{s.os.environ['PATH']}", "GH_TOKEN": "t", "ISSUE_NUMBER": "202",
                 "CR_ID": "CR-022", "PR_NUMBER": "203", "GHA_EXPR": "o/r"},
        )
        return log.read_text().splitlines()

    def test_the_stage_labels_are_removed_from_the_issue(self):
        edit = next(line for line in self.run_step() if line.startswith("issue edit"))
        self.assertIn("202", edit)
        self.assertIn("--remove-label cr:stage/design", edit)
        self.assertIn("--remove-label cr:stage/code", edit)

    def test_the_issue_is_told_what_happened_and_how_to_go_on(self):
        comment = next(line for line in self.run_step() if line.startswith("issue comment"))
        self.assertIn("202", comment)
        self.assertIn("PR #203 was closed without merging", comment)
        self.assertIn("not recorded in the DHF", comment)
        self.assertIn("set the milestone on this issue again", comment)
        self.assertIn("stage cancel", comment)

    def test_nothing_is_created_or_pushed(self):
        calls = self.run_step()
        self.assertFalse([c for c in calls if c.startswith(("pr create", "pr merge"))])


if __name__ == "__main__":
    import unittest
    unittest.main()
