"""The Claude Code hooks MedHarness recommends (docs/agents.md), as installed in .claude/.

Stop: do not end a turn on a broken DHF. PreToolUse: no hand edits of DHF/items. Run for real: the scripts
with the JSON Claude Code gives a hook on stdin, against a scratch copy of the DHF in a git repository.
"""

from __future__ import annotations

import json
import os
import re
import unittest

import _support as s

HOOKS = s.REPO / ".claude" / "hooks"
STOP = HOOKS / "medharness-stop.sh"
NO_HAND_EDITS = HOOKS / "medharness-no-hand-edits.sh"
SETTINGS = s.REPO / ".claude" / "settings.json"


def run_hook(script, stdin: dict, *, project) -> "subprocess.CompletedProcess":
    return s.run(
        [str(script)], cwd=project, check=False, input_text=json.dumps(stdin),
        env={"CLAUDE_PROJECT_DIR": str(project)},
    )


class Installed(unittest.TestCase):
    def test_the_scripts_exist_and_can_be_run(self):
        for script in (STOP, NO_HAND_EDITS):
            with self.subTest(script.name):
                self.assertTrue(script.is_file())
                self.assertTrue(os.access(script, os.X_OK), "chmod +x")

    def test_settings_run_both_hooks_and_keep_the_typecheck_hook(self):
        hooks = json.loads(SETTINGS.read_text(encoding="utf-8"))["hooks"]
        stop = json.dumps(hooks["Stop"])
        pre = hooks["PreToolUse"]
        self.assertIn("${CLAUDE_PROJECT_DIR}/.claude/hooks/medharness-stop.sh", stop)
        self.assertEqual(pre[0]["matcher"], "Edit|Write")
        self.assertIn("${CLAUDE_PROJECT_DIR}/.claude/hooks/medharness-no-hand-edits.sh", json.dumps(pre))
        self.assertIn("PostToolUse", hooks, "the existing typecheck hook stays")

    def test_every_hook_script_named_in_settings_exists(self):
        text = SETTINGS.read_text(encoding="utf-8")
        for name in re.findall(r"\.claude/hooks/([\w.-]+)", text):
            self.assertTrue((HOOKS / name).is_file(), name)


class NoHandEdits(unittest.TestCase):
    def check(self, path: str):
        return run_hook(NO_HAND_EDITS, {"tool_input": {"file_path": path}}, project=s.REPO)

    def test_an_edit_of_a_dhf_item_is_refused_with_what_to_do_instead(self):
        result = self.check("/work/proj/DHF/items/03_req_srs/SRS-001.yaml")
        self.assertEqual(result.returncode, 2)
        self.assertIn("medharness item create|update", result.stderr)

    def test_other_files_are_not_touched(self):
        for path in ("/work/proj/apps/client/src/a.ts", "/work/proj/DHF/config/global.yaml", "/work/proj/docs/a.md"):
            with self.subTest(path):
                self.assertEqual(self.check(path).returncode, 0)

    def test_a_tool_call_with_no_file_path_is_not_touched(self):
        self.assertEqual(run_hook(NO_HAND_EDITS, {"tool_input": {}}, project=s.REPO).returncode, 0)


class StopOnABrokenDhf(s.Scratch):
    def setUp(self) -> None:
        super().setUp()
        self.root = self.scratch_dhf(self.tmp / "proj")
        s.git(self.root, "init", "-q", "-b", "main")
        s.git(self.root, "add", "-A")
        s.git(self.root, "commit", "-q", "-m", "base")

    def stop(self, *, active: bool = False):
        return run_hook(STOP, {"stop_hook_active": active}, project=self.root)

    def break_the_dhf(self) -> None:
        """A hand edit of the kind the other hook forbids: a requirement derived from an item that is not there."""
        path = next(self.root.glob("DHF/items/*/SRS-001.yaml"))
        text = path.read_text(encoding="utf-8")
        self.assertIn("derives_from: [SYS-001]", text)
        path.write_text(text.replace("derives_from: [SYS-001]", "derives_from: [SYS-999]", 1), encoding="utf-8")
        self.assertFalse(s.medharness(self.root, "verify", "dhf", check=False)["passed"], "the edit must break the DHF")

    def test_a_clean_dhf_lets_the_agent_stop(self):
        self.assertEqual(self.stop().returncode, 0)

    def test_a_valid_uncommitted_change_lets_the_agent_stop(self):
        s.medharness(self.root, "item", "update", "SYS-001", "--data", json.dumps({"title": "changed"}))
        self.assertIn("SYS-001", s.git(self.root, "status", "--porcelain").stdout)
        self.assertEqual(self.stop().returncode, 0)

    def test_a_broken_uncommitted_dhf_keeps_the_agent_working_and_hands_it_the_findings(self):
        self.break_the_dhf()
        result = self.stop()
        self.assertEqual(result.returncode, 2)
        self.assertIn("FAIL", result.stderr)

    def test_it_does_not_loop_when_the_agent_is_already_continuing_because_of_it(self):
        self.break_the_dhf()
        self.assertEqual(self.stop(active=True).returncode, 0)

    def test_it_runs_the_projects_own_medharness_when_there_is_a_venv(self):
        """A medharness on PATH that is older than the pinned one reads the DHF wrongly and must not decide."""
        self.break_the_dhf()  # uncommitted, so the hook runs a check
        used = self.tmp / "used.log"
        s.stub_bin(self.tmp / "oldbin", "medharness", 'echo "unknown doc type UC" >&2\nexit 1\n')  # what PATH has
        s.stub_bin(self.root / ".venv" / "bin", "medharness", f'echo "$@" >> "{used}"\nexit 0\n')  # the project's
        result = s.run(
            [str(STOP)], cwd=self.root, check=False, input_text=json.dumps({"stop_hook_active": False}),
            env={"CLAUDE_PROJECT_DIR": str(self.root), "PATH": f"{self.tmp / 'oldbin'}:{os.environ['PATH']}"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("verify dhf", used.read_text())

    def test_without_a_venv_the_one_on_path_is_used(self):
        self.break_the_dhf()
        used = self.tmp / "used-path.log"
        s.stub_bin(self.tmp / "pathbin", "medharness", f'echo "$@" >> "{used}"\nexit 0\n')
        result = s.run(
            [str(STOP)], cwd=self.root, check=False, input_text=json.dumps({"stop_hook_active": False}),
            env={"CLAUDE_PROJECT_DIR": str(self.root), "PATH": f"{self.tmp / 'pathbin'}:{os.environ['PATH']}"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("verify dhf", used.read_text())

    def test_a_broken_dhf_that_is_committed_is_not_this_hooks_business(self):
        self.break_the_dhf()
        s.git(self.root, "add", "-A")
        s.git(self.root, "commit", "-q", "-m", "broken, committed")
        self.assertEqual(self.stop().returncode, 0)


if __name__ == "__main__":
    unittest.main()
