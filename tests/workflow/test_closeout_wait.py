"""cr-complete waits for the close-out PR's checks, so "merge it" is said only when it can be merged.

The merge itself is the maintainer's: the pipeline never merges anything.
"""

from __future__ import annotations

import unittest

import _support as s

SCRIPT = s.step_script("cr-complete.yml", "complete-cr", step_id="checks")


class WaitForCloseoutChecks(s.Scratch):
    def wait(self, *, run_id: str, watch_exit: int) -> dict[str, str]:
        bin_dir = self.tmp / "bin"
        s.stub_bin(bin_dir, "gh", f'''case "$1 $2" in
  "run list") echo "{run_id}" ;;
  "run watch") exit {watch_exit} ;;
esac
''')
        s.stub_bin(bin_dir, "sleep", "exit 0\n")
        out = self.tmp / "out"
        out.write_text("")
        s.run(
            ["bash", "-e", "-c", SCRIPT], cwd=self.tmp,
            env={"PATH": f"{bin_dir}:{s.os.environ['PATH']}", "GITHUB_OUTPUT": str(out), "GH_TOKEN": "t",
                 "REPO": "o/r", "CR_ID": "CR-020"},
        )
        return dict(line.split("=", 1) for line in out.read_text().splitlines() if "=" in line)

    def test_green_checks_report_passed(self):
        self.assertEqual(self.wait(run_id="123", watch_exit=0)["passed"], "true")

    def test_failing_checks_report_failed_with_the_run(self):
        result = self.wait(run_id="123", watch_exit=1)
        self.assertEqual(result["passed"], "false")
        self.assertIn("123", result["reason"])

    def test_no_run_at_all_reports_failed_rather_than_waiting_forever(self):
        result = self.wait(run_id="", watch_exit=0)
        self.assertEqual(result["passed"], "false")
        self.assertIn("no CI run", result["reason"])


class NothingMerges(unittest.TestCase):
    def test_no_workflow_merges_a_pull_request(self):
        for path in sorted(s.WORKFLOWS.glob("*.yml")):
            with self.subTest(path.name):
                self.assertNotIn("gh pr merge", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
