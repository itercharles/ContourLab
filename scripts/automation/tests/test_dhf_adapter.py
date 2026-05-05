import tempfile
import unittest
from pathlib import Path

from scripts.automation.dhf_adapter import MedHarnessDHFAdapter, DHFAdapterError, make_dhf_adapter


class StubDHFClient:
    def __init__(self):
        self.called = []

    def list_items(self, doc_type=None):
        self.called.append(("list_items", doc_type))
        return [{"id": "CR-001"}]

    def get_item(self, item_id):
        self.called.append(("get_item", item_id))
        return {"id": item_id}

    def create_item(self, doc_type, data, *, author=None, cr_id=None):
        self.called.append(("create_item", doc_type, data, author, cr_id))
        return {"id": "CR-002", "type": doc_type}

    def update_item(self, item_id, data, *, author=None, cr_id=None):
        self.called.append(("update_item", item_id, data, author, cr_id))
        return {"id": item_id, "title": "Updated"}

    def transition_item(self, item_id, to_state, *, performed_by=None):
        self.called.append(("transition_item", item_id, to_state, performed_by))
        return {"id": item_id, "status": "implementing"}

    def get_document(self, doc_id):
        self.called.append(("get_document", doc_id))
        if doc_id.endswith("-Spec"):
            return "spec text"
        return None

    def get_cr_context(self, cr_id):
        self.called.append(("get_cr_context", cr_id))
        return {"cr": {"id": cr_id}, "spec": "spec text"}


class MedHarnessDHFAdapterTests(unittest.TestCase):
    def make_adapter(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        dhf_repo = Path(tmp.name)
        (dhf_repo / "DHF").mkdir(parents=True)
        adapter = MedHarnessDHFAdapter.__new__(MedHarnessDHFAdapter)
        client = StubDHFClient()
        adapter._client = client
        adapter._client_stub = client  # keep ref for test assertions
        return adapter

    def test_list_items_runs_through_client(self):
        adapter = self.make_adapter()
        result = adapter.list_items("CR")
        self.assertEqual(result, [{"id": "CR-001"}])
        self.assertEqual(adapter._client_stub.called[0], ("list_items", "CR"))

    def test_get_and_update_item(self):
        adapter = self.make_adapter()
        self.assertEqual(adapter.get_item("CR-001"), {"id": "CR-001"})
        self.assertEqual(
            adapter.update_item("CR-001", {"title": "Updated"}, author="tester"),
            {"id": "CR-001", "title": "Updated"},
        )

    def test_create_and_transition(self):
        adapter = self.make_adapter()
        self.assertEqual(
            adapter.create_item("CR", {"title": "T"}, author="tester"),
            {"id": "CR-002", "type": "CR"},
        )
        self.assertEqual(
            adapter.transition_item("CR-001", "implementing", performed_by="tester"),
            {"id": "CR-001", "status": "implementing"},
        )

    def test_get_document(self):
        adapter = self.make_adapter()
        self.assertEqual(adapter.get_document("CR-001-Spec"), "spec text")

    def test_get_cr_context(self):
        adapter = self.make_adapter()
        self.assertEqual(
            adapter.get_cr_context("CR-001"),
            {"cr": {"id": "CR-001"}, "spec": "spec text"},
        )

    def test_raises_actionable_error(self):
        adapter = MedHarnessDHFAdapter.__new__(MedHarnessDHFAdapter)

        class Failing:
            def list_items(self, doc_type=None):
                raise DHFAdapterError("provider failed")

        adapter._client = Failing()
        with self.assertRaisesRegex(DHFAdapterError, "provider failed"):
            adapter.list_items("CR")

    def test_factory_selects_local_utils_provider(self):
        with tempfile.TemporaryDirectory() as tmp:
            dhf_repo = Path(tmp)
            dhf = dhf_repo / "DHF"
            dhf.mkdir(parents=True)
            (dhf / "config").mkdir()
            (dhf / "config" / "global.yaml").write_text("global_lifecycle:\n  states:\n    - id: planned\n      label: Planned\n")
            (dhf / "config" / "doc_types").mkdir()
            (dhf / "config" / "doc_types" / "cr.yaml").write_text(
                "code: CR\nname: Change Request\nprefix: CR-\ndirectory: 09_cr\nproperties:\n  - id\n"
            )
            adapter = make_dhf_adapter(dhf_repo, "medharness")
            self.assertIsInstance(adapter, MedHarnessDHFAdapter)

    def test_factory_rejects_unsupported_provider(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(DHFAdapterError, "Unsupported DHF adapter"):
                make_dhf_adapter(Path(tmp), "rest")


if __name__ == "__main__":
    unittest.main()
