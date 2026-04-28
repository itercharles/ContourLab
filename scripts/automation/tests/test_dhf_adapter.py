import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.automation.dhf_adapter import DHFAdapterError, LocalUtilsDHFAdapter, make_dhf_adapter


class RecordingRunner:
    def __init__(self):
        self.calls = []

    def __call__(self, command, **kwargs):
        self.calls.append((command, kwargs))
        if command[:3] == ["python", "-m", "utils"]:
            operation = command[5:]
            if operation[:2] == ["item", "list"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-001"}\n(1 item(s))\n', "")
            if operation[:2] == ["item", "get"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-001"}\n', "")
            if operation[:2] == ["item", "create"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-002"}\n', "")
            if operation[:2] == ["item", "update"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-001","title":"Updated"}\n', "")
            if operation[:2] == ["item", "transition"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-001","status":"implementing"}\n', "")
        if command[:2] == ["python", "-c"]:
            return subprocess.CompletedProcess(command, 0, "spec text", "")
        return subprocess.CompletedProcess(command, 1, "", "unexpected command")


class LocalUtilsDHFAdapterTests(unittest.TestCase):
    def make_adapter(self, runner):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        dhf_repo = Path(tmp.name)
        (dhf_repo / "DHF").mkdir()
        return LocalUtilsDHFAdapter(dhf_repo, python_executable="python", runner=runner)

    def test_list_items_runs_utils_through_adapter_boundary(self):
        runner = RecordingRunner()
        adapter = self.make_adapter(runner)

        self.assertEqual(adapter.list_items("CR"), [{"id": "CR-001"}])

        command, kwargs = runner.calls[0]
        self.assertEqual(command[:5], ["python", "-m", "utils", "--dhf", str(adapter.dhf_root)])
        self.assertEqual(command[5:], ["item", "list", "--type", "CR"])
        self.assertEqual(kwargs["cwd"], adapter.dhf_root)
        self.assertIn(str(adapter.dhf_root), kwargs["env"]["PYTHONPATH"])

    def test_create_and_transition_parse_json_results(self):
        runner = RecordingRunner()
        adapter = self.make_adapter(runner)

        self.assertEqual(adapter.create_item("CR", {"title": "T"}, author="tester"), {"id": "CR-002"})
        self.assertEqual(
            adapter.transition_item("CR-001", "implementing", performed_by="tester"),
            {"id": "CR-001", "status": "implementing"},
        )

    def test_get_and_update_item_parse_json_results(self):
        runner = RecordingRunner()
        adapter = self.make_adapter(runner)

        self.assertEqual(adapter.get_item("CR-001"), {"id": "CR-001"})
        self.assertEqual(
            adapter.update_item("CR-001", {"title": "Updated"}, author="tester"),
            {"id": "CR-001", "title": "Updated"},
        )

        update_command, _ = runner.calls[1]
        self.assertEqual(update_command[5:8], ["item", "update", "CR-001"])
        self.assertIn("--data", update_command)
        self.assertIn("--author", update_command)

    def test_get_document_uses_local_utils_provider_internally(self):
        runner = RecordingRunner()
        adapter = self.make_adapter(runner)

        self.assertEqual(adapter.get_document("CR-001-Spec"), "spec text")

        command, kwargs = runner.calls[0]
        self.assertEqual(command[0], "python")
        self.assertEqual(command[1], "-c")
        self.assertEqual(command[-2:], [str(adapter.dhf_root), "CR-001-Spec"])
        self.assertEqual(kwargs["cwd"], adapter.dhf_repo.resolve())

    def test_get_document_falls_back_to_current_cr_spec_location(self):
        def missing_document_runner(command, **kwargs):
            return subprocess.CompletedProcess(command, 2, "", "")

        adapter = self.make_adapter(missing_document_runner)
        spec_dir = adapter.dhf_repo / "docs" / "cr-specs"
        spec_dir.mkdir(parents=True)
        (spec_dir / "CR-001-Spec.md").write_text("legacy spec", encoding="utf-8")

        self.assertEqual(adapter.get_document("CR-001-Spec"), "legacy spec")

    def test_get_cr_context_returns_item_and_spec(self):
        runner = RecordingRunner()
        adapter = self.make_adapter(runner)

        self.assertEqual(
            adapter.get_cr_context("CR-001"),
            {"cr": {"id": "CR-001"}, "spec": "spec text"},
        )

    def test_raises_actionable_error_on_provider_failure(self):
        def failing_runner(command, **kwargs):
            return subprocess.CompletedProcess(command, 1, "", "provider failed")

        adapter = self.make_adapter(failing_runner)

        with self.assertRaisesRegex(DHFAdapterError, "provider failed"):
            adapter.list_items("CR")

    def test_factory_selects_local_utils_provider(self):
        with tempfile.TemporaryDirectory() as tmp:
            adapter = make_dhf_adapter(Path(tmp), "local_utils")
            self.assertIsInstance(adapter, LocalUtilsDHFAdapter)

    def test_factory_rejects_unsupported_provider(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(DHFAdapterError, "Unsupported DHF adapter"):
                make_dhf_adapter(Path(tmp), "rest")


if __name__ == "__main__":
    unittest.main()
