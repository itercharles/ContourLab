import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from scripts.automation.dhf_ops import main


class FakeOpsAdapter:
    def transition_item(self, item_id: str, to_state: str, *, performed_by: str):
        self.item_id = item_id
        self.to_state = to_state
        self.performed_by = performed_by
        return {"id": item_id, "status": to_state}


class DHFOpsTests(unittest.TestCase):
    def test_transition_command_uses_adapter(self):
        adapter = FakeOpsAdapter()
        with tempfile.TemporaryDirectory() as tmp:
            output = io.StringIO()
            with patch("scripts.automation.dhf_ops.make_dhf_adapter", return_value=adapter):
                with redirect_stdout(output):
                    status = main([
                        "transition",
                        "--dhf-repo",
                        tmp,
                        "--item-id",
                        "CR-034",
                        "--to-state",
                        "completed",
                        "--by",
                        "tester",
                    ])

        self.assertEqual(status, 0)
        self.assertEqual(adapter.item_id, "CR-034")
        self.assertEqual(adapter.to_state, "completed")
        self.assertEqual(adapter.performed_by, "tester")
        self.assertEqual(json.loads(output.getvalue())["status"], "completed")


if __name__ == "__main__":
    unittest.main()
