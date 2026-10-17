"""The CR progress comment: what it says at each stage, and that it is edited in place.

Runs the action's own script, with a stub `gh` standing in for GitHub.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import _support as s

ACTION = s.REPO / ".github" / "actions" / "cr-progress"
sys.path.insert(0, str(ACTION))
import render  # noqa: E402

USER_STAGES = ["design-review", "code-review", "merge", "closeout"]
AUTOMATIC_STAGES = ["design-generating", "design-revising", "code-generating", "code-revising", "completing", "closeout-checking"]


class Rendering(unittest.TestCase):
    def test_every_stage_with_the_maintainer_as_the_actor_says_it_is_their_turn(self):
        for stage in USER_STAGES:
            with self.subTest(stage):
                body = render.render(stage, "CR-020")
                self.assertIn("your turn", body)
                self.assertEqual(body.count("👉"), 1)

    def test_automatic_stages_never_ask_the_maintainer_to_act(self):
        for stage in AUTOMATIC_STAGES:
            with self.subTest(stage):
                body = render.render(stage, "CR-020")
                self.assertNotIn("your turn", body)
                self.assertNotIn("👉", body)
                self.assertIn("Nothing for you to do", body)

    def test_the_gates_say_which_review_to_submit(self):
        self.assertIn("**Approve**", render.render("design-review", "CR-020"))
        self.assertIn("**Request changes**", render.render("design-review", "CR-020"))
        self.assertIn("**Approve**", render.render("code-review", "CR-020"))
        self.assertIn("Squash-merge", render.render("merge", "CR-020"))
        self.assertIn("**Merge it**", render.render("closeout", "CR-020"))

    def test_steps_before_the_current_one_are_ticked_and_the_ones_after_are_not(self):
        lines = render.render("code-review", "CR-020").splitlines()
        marks = [line[0] for line in lines if line and line[0] in "✅👉⏳⬜❌"]
        self.assertEqual(marks, ["✅", "✅", "✅", "👉", "⬜", "⬜"])

    def test_a_failure_marks_the_step_that_failed_and_says_what(self):
        body = render.render("failed", "CR-020", detail="CI failed on the generated code", failed_at=3)
        marks = [line[0] for line in body.splitlines() if line and line[0] in "✅👉⏳⬜❌"]
        self.assertEqual(marks, ["✅", "✅", "❌", "⬜", "⬜", "⬜"])
        self.assertIn("CI failed on the generated code", body)
        self.assertNotIn("your turn", body)

    def test_a_cancelled_cr_has_no_step_ticked(self):
        body = render.render("cancelled", "CR-020")
        self.assertNotIn("✅", body)
        self.assertIn("closed without merging", body)
        self.assertIn("not recorded in the DHF", body)

    def test_the_comment_carries_the_marker_and_the_cr_id(self):
        body = render.render("design-review", "CR-020")
        self.assertTrue(body.startswith(render.MARKER))
        self.assertIn("CR-020 progress", body)


class Posting(s.Scratch):
    def run_action(self, stage: str, existing: list[dict]) -> list[list[str]]:
        """Run the script with a stub gh; return the gh calls that changed something."""
        bin_dir = self.tmp / "bin"
        log = self.tmp / "calls.jsonl"
        (self.tmp / "comments.json").write_text(json.dumps(existing))
        bin_dir.mkdir(parents=True, exist_ok=True)
        stub = bin_dir / "gh"
        stub.write_text(f'''#!{sys.executable}
import json, sys
args = sys.argv[1:]
body = sys.stdin.read() if "--input" in args else ""
with open({str(log)!r}, "a") as f:
    f.write(json.dumps({{"args": args, "body": json.loads(body)["body"] if body else ""}}) + "\\n")
if args[0] == "api" and "-X" not in args:
    print(open({str(self.tmp / "comments.json")!r}).read())
''')
        stub.chmod(0o755)
        s.run(
            [sys.executable, str(ACTION / "render.py"), "--repo", "o/r", "--pr", "7", "--cr", "CR-020", "--stage", stage],
            cwd=self.tmp, env={"PATH": f"{bin_dir}:{s.os.environ['PATH']}"},
        )
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        return [c for c in calls if "-X" in c["args"]]

    def test_the_first_post_creates_the_checklist(self):
        writes = self.run_action("design-generating", [])
        self.assertEqual([w["args"][1:3] for w in writes], [["-X", "POST"]])
        self.assertIn(render.MARKER, writes[0]["body"])

    def test_a_later_post_edits_the_same_comment_in_place(self):
        writes = self.run_action("design-generating", [{"id": 41, "body": "something else"}, {"id": 42, "body": render.MARKER + " old"}])
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0]["args"][1:4], ["-X", "PATCH", "repos/o/r/issues/comments/42"])

    def test_when_it_is_the_maintainers_turn_a_short_new_comment_is_added_to_notify(self):
        writes = self.run_action("design-review", [{"id": 42, "body": render.MARKER + " old"}])
        self.assertEqual([w["args"][2] for w in writes], ["PATCH", "POST"])
        self.assertIn("your turn", writes[1]["body"])
        self.assertNotIn(render.MARKER, writes[1]["body"])

    def test_an_automatic_stage_adds_no_notification(self):
        writes = self.run_action("code-generating", [{"id": 42, "body": render.MARKER}])
        self.assertEqual([w["args"][2] for w in writes], ["PATCH"])

    def test_no_pull_request_number_posts_nothing(self):
        result = s.run(
            [sys.executable, str(ACTION / "render.py"), "--repo", "o/r", "--pr", " ", "--cr", "CR-020", "--stage", "merge"],
            cwd=self.tmp,
        )
        self.assertEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
