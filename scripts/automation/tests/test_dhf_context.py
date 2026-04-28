import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.automation.dhf_context import write_cr_context


class FakeContextAdapter:
    def get_cr_context(self, cr_id: str):
        return {
            "cr": {"id": cr_id, "title": "Context test"},
            "spec": "# Spec\n",
        }


class DHFContextTests(unittest.TestCase):
    def test_write_cr_context_uses_adapter_and_writes_stable_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out_dir = root / "out"
            with patch("scripts.automation.dhf_context.make_dhf_adapter", return_value=FakeContextAdapter()):
                paths = write_cr_context(root / "dhf", "CR-034", out_dir)

            self.assertEqual(paths["cr"], out_dir / "CR-034.json")
            self.assertEqual(paths["spec"], out_dir / "CR-034-Spec.md")
            self.assertEqual(json.loads(paths["cr"].read_text())["id"], "CR-034")
            self.assertEqual(paths["spec"].read_text(), "# Spec\n")


if __name__ == "__main__":
    unittest.main()
