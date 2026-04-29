import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.automation.dhf_adapter import CompliantFlowDHFAdapter, DHFAdapterError, make_dhf_adapter


class RecordingRunner:
    def __init__(self):
        self.calls = []

    def __call__(self, command, **kwargs):
        self.calls.append((command, kwargs))
        if command[:3] == ["python", "-m", "compliantflow"]:
            operation = command[6:]
            if operation[:2] == ["item", "list"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-001"}\n', "")
            if operation[:2] == ["item", "get"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-001"}\n', "")
            if operation[:2] == ["item", "create"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-002"}\n', "")
            if operation[:2] == ["item", "update"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-001","title":"Updated"}\n', "")
            if operation[:2] == ["item", "transition"]:
                return subprocess.CompletedProcess(command, 0, '{"id":"CR-001","status":"implementing"}\n', "")
            if operation[:2] == ["context", "implementation"]:
                out_dir = Path(operation[operation.index("--out-dir") + 1])
                out_dir.mkdir(parents=True, exist_ok=True)
                cr_id = operation[operation.index("--cr") + 1]
                cr_path = out_dir / f"{cr_id}.json"
                spec_path = out_dir / f"{cr_id}-Spec.md"
                context_path = out_dir / "implementation-context.json"
                cr_path.write_text('{"id":"CR-001"}\n', encoding="utf-8")
                spec_path.write_text("spec text", encoding="utf-8")
                context_path.write_text("{}\n", encoding="utf-8")
                return subprocess.CompletedProcess(
                    command,
                    0,
                    f'{{"cr":"{cr_path}","implementation_spec":"{spec_path}","context":"{context_path}"}}\n',
                    "",
                )
        return subprocess.CompletedProcess(command, 1, "", "unexpected command")


class CompliantFlowDHFAdapterTests(unittest.TestCase):
    def make_adapter(self, runner):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        dhf_repo = Path(tmp.name)
        (dhf_repo / "DHF").mkdir()
        return CompliantFlowDHFAdapter(dhf_repo, python_executable="python", runner=runner)

    def test_list_items_runs_compliantflow_through_adapter_boundary(self):
        runner = RecordingRunner()
        adapter = self.make_adapter(runner)

        self.assertEqual(adapter.list_items("CR"), [{"id": "CR-001"}])

        command, kwargs = runner.calls[0]
        self.assertEqual(command[:6], ["python", "-m", "compliantflow", "--dhf", str(adapter.dhf_root), "dhf"])
        self.assertEqual(command[6:], ["item", "list", "--type", "CR"])
        self.assertEqual(kwargs["cwd"], adapter.dhf_repo.resolve())

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
        self.assertEqual(update_command[6:9], ["item", "update", "CR-001"])
        self.assertIn("--data", update_command)
        self.assertIn("--author", update_command)

    def test_get_document_uses_compliantflow_context_provider(self):
        runner = RecordingRunner()
        adapter = self.make_adapter(runner)

        self.assertEqual(adapter.get_document("CR-001-Spec"), "spec text")

        command, kwargs = runner.calls[0]
        self.assertEqual(command[:6], ["python", "-m", "compliantflow", "--dhf", str(adapter.dhf_root), "dhf"])
        self.assertEqual(command[6:8], ["context", "implementation"])
        self.assertEqual(kwargs["cwd"], adapter.dhf_repo.resolve())

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
            adapter = make_dhf_adapter(Path(tmp), "compliantflow")
            self.assertIsInstance(adapter, CompliantFlowDHFAdapter)

    def test_factory_rejects_unsupported_provider(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(DHFAdapterError, "Unsupported DHF adapter"):
                make_dhf_adapter(Path(tmp), "rest")


if __name__ == "__main__":
    unittest.main()
