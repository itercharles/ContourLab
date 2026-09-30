"""cr-lifecycle's detect job: which GitHub event starts which stage.

Runs the job's own shell step against simulated events, so a change to the routing
in the workflow file is caught here rather than on a live PR.
"""

from __future__ import annotations

import json

import _support as s

SCRIPT = s.step_script("cr-lifecycle.yml", "detect", step_id="plan")

DESIGN = ["cr:stage/design", "cr-design-approved"]
CODE = ["cr:stage/code"]

# (name, event, review state, labels, review commit, head sha, merged, dispatch cr, dispatch stage, expected action)
CASES = [
    ("design approved on head starts code generation",   "pull_request_review", "approved", DESIGN, "a1", "a1", "", "", "", "gen-code"),
    ("design approval of an old commit is ignored",      "pull_request_review", "approved", DESIGN, "a0", "a1", "", "", "", "noop"),
    ("code approved on head is ready to merge",          "pull_request_review", "approved", CODE,   "a1", "a1", "", "", "", "code-approved"),
    ("code approval of an old commit is ignored",        "pull_request_review", "approved", CODE,   "a0", "a1", "", "", "", "noop"),
    ("changes requested at design revises the design",   "pull_request_review", "changes_requested", DESIGN, "a1", "a1", "", "", "", "revise-design"),
    ("changes requested at code revises the code",       "pull_request_review", "changes_requested", CODE,   "a1", "a1", "", "", "", "revise-code"),
    ("changes requested on an old commit still revises", "pull_request_review", "changes_requested", CODE,   "a0", "a1", "", "", "", "revise-code"),
    ("a plain comment starts nothing",                   "pull_request_review", "commented", DESIGN, "a1", "a1", "", "", "", "noop"),
    ("an approval with no stage label starts nothing",   "pull_request_review", "approved", [],     "a1", "a1", "", "", "", "noop"),
    ("a merged PR starts nothing here",                  "pull_request", "", DESIGN, "", "", "true",  "", "", "noop"),
    ("a PR closed unmerged cancels the CR",              "pull_request", "", DESIGN, "", "", "false", "", "", "cancel"),
    ("dispatching design runs code generation",          "workflow_dispatch", "", [], "", "", "", "CR-014", "design", "gen-code"),
    ("dispatching code marks it ready to merge",         "workflow_dispatch", "", [], "", "", "", "CR-014", "code",   "code-approved"),
]


class EventRouting(s.Scratch):
    def route(self, event, state, labels, review_commit, head_sha, merged, dispatch_cr, dispatch_stage, branch="feat/CR-014"):
        payload = self.tmp / "event.json"
        payload.write_text(json.dumps({"pull_request": {"labels": [{"name": n} for n in labels]}}))
        out = self.tmp / "out"
        out.write_text("")
        result = s.run(
            ["bash", "-e", "-c", SCRIPT], cwd=self.tmp, check=False,
            env={
                "EVENT_NAME": event, "REVIEW_STATE": state, "MERGED": merged,
                "HEAD_REF": branch if event != "workflow_dispatch" else "",
                "REVIEW_COMMIT": review_commit, "HEAD_SHA": head_sha,
                "INPUT_CR": dispatch_cr, "INPUT_STAGE": dispatch_stage,
                "GHA_EXPR": "119", "GITHUB_EVENT_PATH": str(payload), "GITHUB_OUTPUT": str(out),
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return dict(line.split("=", 1) for line in out.read_text().splitlines() if "=" in line)

    def test_routing_table(self):
        for name, *args, expected in CASES:
            with self.subTest(name):
                self.assertEqual(self.route(*args)["action"], expected)

    def test_cr_id_comes_from_the_branch_or_the_dispatch_input(self):
        self.assertEqual(self.route("pull_request_review", "approved", DESIGN, "a1", "a1", "", "", "")["cr_id"], "CR-014")
        self.assertEqual(self.route("workflow_dispatch", "", [], "", "", "", "CR-099", "design")["cr_id"], "CR-099")

    def test_a_branch_without_a_cr_id_yields_no_cr(self):
        out = self.route("pull_request_review", "approved", DESIGN, "a1", "a1", "", "", "", branch="feat/other")
        self.assertEqual(out["cr_id"], "")


if __name__ == "__main__":
    import unittest
    unittest.main()
