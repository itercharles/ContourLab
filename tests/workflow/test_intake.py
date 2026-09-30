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


if __name__ == "__main__":
    import unittest
    unittest.main()
