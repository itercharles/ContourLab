"""When a CR is complete its issue loses the cr:stage labels; the jobs that touch the issue may do so.

The labels used to stay on the closed issue: the gen-code job that rotates them had no `issues: write`, so
`gh issue edit` failed silently (CR-024). `gh` is a stub that records its calls.
"""

from __future__ import annotations

import unittest

import _support as s

STEPS = {
    "complete-cr": s.step_script("cr-complete.yml", "complete-cr", step_name="Take the stage labels off the issue"),
    "close-out-merged": s.step_script("cr-complete.yml", "close-out-merged", step_name="Take the stage labels off the issue"),
}


def permissions(workflow: str, job: str) -> dict:
    doc = s.yaml.safe_load((s.WORKFLOWS / workflow).read_text(encoding="utf-8"))
    return doc["jobs"][job].get("permissions") or {}


class StageLabels(s.Scratch):
    def run_step(self, job: str, closing_issue: str) -> list[str]:
        log = self.tmp / f"gh-{job}-{closing_issue or 'none'}.log"
        s.stub_bin(self.tmp / "bin", "gh", f'''printf "%s\\n" "$*" >> "{log}"
case "$1 $2" in "pr view") echo "{closing_issue}" ;; esac
''')
        s.run(
            ["bash", "-e", "-c", STEPS[job]], cwd=self.tmp,
            env={"PATH": f"{self.tmp / 'bin'}:{s.os.environ['PATH']}", "GH_TOKEN": "t", "REPO": "o/r",
                 "PR_NUMBER": "213", "GHA_EXPR": ""},
        )
        return log.read_text().splitlines()

    def test_both_stage_labels_come_off_the_issue_the_pr_closes(self):
        for job in STEPS:
            with self.subTest(job):
                calls = self.run_step(job, "212")
                edits = [c for c in calls if c.startswith("issue edit")]
                self.assertEqual(len(edits), 2)
                self.assertTrue(all("212" in e for e in edits))
                self.assertTrue(any("--remove-label cr:stage/design" in e for e in edits))
                self.assertTrue(any("--remove-label cr:stage/code" in e for e in edits))

    def test_a_pr_that_closes_no_issue_edits_nothing(self):
        for job in STEPS:
            with self.subTest(job):
                calls = self.run_step(job, "")
                self.assertEqual([c for c in calls if c.startswith("issue edit")], [])


class Permissions(unittest.TestCase):
    def test_the_jobs_that_edit_the_issue_may_do_so(self):
        for workflow, job in [("cr-lifecycle.yml", "gen-code-push"), ("cr-complete.yml", "complete-cr"), ("cr-complete.yml", "close-out-merged")]:
            with self.subTest(job):
                self.assertEqual(permissions(workflow, job).get("issues"), "write")

    def test_runs_for_one_cr_queue_in_order_instead_of_cancelling_each_other(self):
        doc = s.yaml.safe_load((s.WORKFLOWS / "cr-lifecycle.yml").read_text(encoding="utf-8"))
        self.assertIs(doc["concurrency"]["cancel-in-progress"], False)


if __name__ == "__main__":
    unittest.main()
