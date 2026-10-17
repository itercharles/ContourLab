"""cr-lifecycle's detect job: which GitHub event starts which stage.

Runs the job's own shell step against simulated events, so a change to the routing
in the workflow file is caught here rather than on a live PR.
"""

from __future__ import annotations

import json

import _support as s

SCRIPT = s.step_script("cr-lifecycle.yml", "detect", step_id="plan")

DESIGN = ["cr:stage/design", "cr-design-approved"]
DESIGN_PENDING = ["cr:stage/design"]  # intake has opened the PR but the design has not been generated yet
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
    ("approving before the design exists starts nothing",  "pull_request_review", "approved", DESIGN_PENDING, "a1", "a1", "", "", "", "noop"),
    ("requesting changes before the design exists starts nothing", "pull_request_review", "changes_requested", DESIGN_PENDING, "a1", "a1", "", "", "", "noop"),
    ("a plain comment starts nothing",                   "pull_request_review", "commented", DESIGN, "a1", "a1", "", "", "", "noop"),
    ("an approval with no stage label starts nothing",   "pull_request_review", "approved", [],     "a1", "a1", "", "", "", "noop"),
    ("a merged PR starts nothing here",                  "pull_request", "", DESIGN, "", "", "true",  "", "", "noop"),
    ("a PR closed unmerged records nothing, it only says so", "pull_request", "", DESIGN, "", "", "false", "", "", "closed"),
    ("dispatching design runs code generation",          "workflow_dispatch", "", [], "", "", "", "CR-014", "design", "gen-code"),
    ("dispatching code marks it ready to merge",         "workflow_dispatch", "", [], "", "", "", "CR-014", "code",   "code-approved"),
    ("dispatching cancel records the CR as cancelled",   "workflow_dispatch", "", [], "", "", "", "CR-014", "cancel", "cancel"),
]


class EventRouting(s.Scratch):
    def route(self, event, state, labels, review_commit, head_sha, merged, dispatch_cr, dispatch_stage, branch="feat/CR-014", association="OWNER"):
        payload = self.tmp / "event.json"
        payload.write_text(json.dumps({"pull_request": {"labels": [{"name": n} for n in labels]}}))
        out = self.tmp / "out"
        out.write_text("")
        result = s.run(
            ["bash", "-e", "-c", SCRIPT], cwd=self.tmp, check=False,
            env={
                "EVENT_NAME": event, "REVIEW_STATE": state, "REVIEW_ASSOCIATION": association, "MERGED": merged,
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

    def test_only_the_owner_or_a_member_can_drive_the_pipeline_with_a_review(self):
        # (association, expected action for an approved design and for changes requested at code)
        for association, approve, revise in [
            ("OWNER", "gen-code", "revise-code"),
            ("MEMBER", "gen-code", "revise-code"),
            ("COLLABORATOR", "noop", "noop"),
            ("CONTRIBUTOR", "noop", "noop"),
            ("FIRST_TIME_CONTRIBUTOR", "noop", "noop"),
            ("NONE", "noop", "noop"),
            ("", "noop", "noop"),
        ]:
            with self.subTest(association=association):
                self.assertEqual(
                    self.route("pull_request_review", "approved", DESIGN, "a1", "a1", "", "", "", association=association)["action"],
                    approve,
                )
                self.assertEqual(
                    self.route("pull_request_review", "changes_requested", CODE, "a1", "a1", "", "", "", association=association)["action"],
                    revise,
                )

    def test_a_review_before_the_design_exists_is_ignored_and_says_why(self):
        for state in ("approved", "changes_requested"):
            with self.subTest(state):
                out = self.route("pull_request_review", state, DESIGN_PENDING, "a1", "a1", "", "", "")
                self.assertEqual(out["action"], "noop")
                self.assertEqual(out["reason"], "design-not-ready")

    def test_once_the_design_exists_the_same_review_is_acted_on_with_no_reason(self):
        out = self.route("pull_request_review", "approved", DESIGN, "a1", "a1", "", "", "")
        self.assertEqual((out["action"], out["reason"]), ("gen-code", ""))

    def test_a_code_stage_review_does_not_need_the_design_label(self):
        out = self.route("pull_request_review", "approved", CODE, "a1", "a1", "", "", "")
        self.assertEqual((out["action"], out["reason"]), ("code-approved", ""))

    def test_a_plain_comment_before_the_design_exists_is_not_reported_as_a_missed_review(self):
        out = self.route("pull_request_review", "commented", DESIGN_PENDING, "a1", "a1", "", "", "")
        self.assertEqual((out["action"], out["reason"]), ("noop", ""))

    def test_the_owner_can_still_start_a_stage_by_dispatch(self):
        # A dispatch carries no review association; it is limited to people who can run workflows.
        self.assertEqual(self.route("workflow_dispatch", "", [], "", "", "", "CR-014", "design", association="")["action"], "gen-code")

    def test_cr_id_comes_from_the_branch_or_the_dispatch_input(self):
        self.assertEqual(self.route("pull_request_review", "approved", DESIGN, "a1", "a1", "", "", "")["cr_id"], "CR-014")
        self.assertEqual(self.route("workflow_dispatch", "", [], "", "", "", "CR-099", "design")["cr_id"], "CR-099")

    def test_a_dispatch_cr_id_that_is_not_a_cr_id_is_refused(self):
        payload = self.tmp / "event.json"
        payload.write_text(json.dumps({"pull_request": {"labels": []}}))
        out = self.tmp / "out"
        out.write_text("")
        for bad in ('CR-1"; touch PWNED; "', "CR-12 extra", "$(id)", "../x", ""):
            with self.subTest(bad):
                result = s.run(
                    ["bash", "-e", "-c", SCRIPT], cwd=self.tmp, check=False,
                    env={"EVENT_NAME": "workflow_dispatch", "REVIEW_STATE": "", "MERGED": "", "HEAD_REF": "",
                         "REVIEW_COMMIT": "", "HEAD_SHA": "", "INPUT_CR": bad, "INPUT_STAGE": "design",
                         "GHA_EXPR": "1", "GITHUB_EVENT_PATH": str(payload), "GITHUB_OUTPUT": str(out)},
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(list(self.tmp.glob("PWNED*")), [])

    def test_a_branch_without_a_cr_id_yields_no_cr(self):
        out = self.route("pull_request_review", "approved", DESIGN, "a1", "a1", "", "", "", branch="feat/other")
        self.assertEqual(out["cr_id"], "")


if __name__ == "__main__":
    import unittest
    unittest.main()
