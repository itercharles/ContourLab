import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "ci" / "resolve_cr_design_route.py"
SPEC = importlib.util.spec_from_file_location("resolve_cr_design_route", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ResolveRouteTests(unittest.TestCase):
    def test_doc_only_route_skips_design_without_continuing_to_code(self) -> None:
        outputs = MODULE.resolve_route(
            {
                "pipeline_route": "doc-only",
                "affected_items": ["SRS-001"],
                "proposed_new_items": [{"type": "SRS", "title": "new item"}],
            }
        )
        self.assertEqual(
            outputs,
            {
                "route": "doc-only",
                "skip": "true",
                "reason": "route-doc-only",
                "continue_to_code": "false",
                "route_mismatch": "false",
            },
        )

    def test_standard_route_with_no_dhf_impact_skips_design_and_continues_to_code(self) -> None:
        outputs = MODULE.resolve_route(
            {
                "pipeline_route": "standard",
                "affected_items": [],
                "proposed_new_items": [],
            }
        )
        self.assertEqual(
            outputs,
            {
                "route": "standard",
                "skip": "true",
                "reason": "code-only-no-dhf",
                "continue_to_code": "true",
                "route_mismatch": "true",
            },
        )

    def test_non_empty_dhf_impact_keeps_standard_design_path(self) -> None:
        outputs = MODULE.resolve_route(
            {
                "pipeline_route": "standard",
                "affected_items": ["SRS-001"],
                "proposed_new_items": [],
            }
        )
        self.assertEqual(
            outputs,
            {
                "route": "standard",
                "skip": "false",
                "reason": "standard-design",
                "continue_to_code": "false",
                "route_mismatch": "false",
            },
        )


if __name__ == "__main__":
    unittest.main()
