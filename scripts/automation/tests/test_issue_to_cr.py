import tempfile
import unittest
from datetime import date
from pathlib import Path
from typing import Any

from scripts.automation.issue_to_cr import (
    IssueContext,
    build_cr_data,
    current_iso_week_milestone,
    issue_has_cr_marker,
    next_cr_id,
    prepare_cr,
)


class FakeDHFAdapter:
    def __init__(self, items: list[dict[str, Any]] | None = None, created_id: str = "CR-034"):
        self.items = items or []
        self.created_id = created_id
        self.created_data: dict[str, Any] | None = None

    def list_items(self, doc_type: str | None = None) -> list[dict[str, Any]]:
        self.listed_doc_type = doc_type
        return self.items

    def create_item(
        self,
        doc_type: str,
        data: dict[str, Any],
        *,
        author: str,
        cr_id: str | None = None,
    ) -> dict[str, Any]:
        self.created_doc_type = doc_type
        self.created_author = author
        self.created_data = data
        return {"id": self.created_id}

    def get_item(self, item_id: str) -> dict[str, Any] | None:
        return None

    def update_item(
        self,
        item_id: str,
        data: dict[str, Any],
        *,
        author: str,
        cr_id: str | None = None,
    ) -> dict[str, Any] | None:
        return None

    def transition_item(self, item_id: str, to_state: str, *, performed_by: str) -> dict[str, Any]:
        return {}

    def get_document(self, doc_id: str) -> str | None:
        return None

    def get_cr_context(self, cr_id: str) -> dict[str, Any]:
        return {}


def make_issue(milestone: str = "2026-W18") -> IssueContext:
    return IssueContext(
        number=123,
        title="Add weekly CR intake",
        body=(
            "### Requested change\n\nCreate CR from accepted issue.\n\n"
            "### User value / justification\n\nWeekly intake is easier.\n\n"
            "### Acceptance criteria\n\n- CR PR is opened automatically.\n\n"
            "### Change category\n\nFeature"
        ),
        state="open",
        html_url="https://github.com/itercharles/WebTPS/issues/123",
        author="charles",
        milestone=milestone,
    )


class IssueToCrTests(unittest.TestCase):
    def test_current_iso_week_milestone_uses_iso_year_and_week(self):
        self.assertEqual(current_iso_week_milestone(date(2026, 4, 26)), "2026-W17")
        self.assertEqual(current_iso_week_milestone(date(2027, 1, 1)), "2026-W53")

    def test_next_cr_id_uses_adapter_item_results(self):
        self.assertEqual(
            next_cr_id([
                {"id": "CR-001"},
                {"id": "SYS-009"},
                {"id": "CR-033"},
            ]),
            "CR-034",
        )

    def test_prepare_cr_requires_active_milestone(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = prepare_cr(
                make_issue("2026-W19"),
                "2026-W18",
                Path(tmp),
                [],
                write=True,
                adapter=FakeDHFAdapter(),
            )
            self.assertFalse(result.should_create)
            self.assertIn("not active milestone", result.reason)

    def test_prepare_cr_creates_cr_with_dhf_adapter(self):
        with tempfile.TemporaryDirectory() as tmp:
            adapter = FakeDHFAdapter()
            result = prepare_cr(
                make_issue(),
                "2026-W18",
                Path(tmp),
                [],
                write=True,
                adapter=adapter,
            )
            self.assertTrue(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")
            self.assertIsNone(result.cr_path)
            self.assertEqual(adapter.created_doc_type, "CR")
            self.assertEqual(adapter.created_author, "issue-to-cr")
            self.assertEqual(adapter.created_data["target_version"], "2026-W18")
            self.assertEqual(adapter.created_data["description"], "Create CR from accepted issue.\n\nSource issue: https://github.com/itercharles/WebTPS/issues/123")
            self.assertEqual(adapter.created_data["justification"], "Weekly intake is easier.")
            self.assertEqual(adapter.created_data["content"], "- CR PR is opened automatically.")
            self.assertIn("Source issue: https://github.com/itercharles/WebTPS/issues/123", adapter.created_data["description"])

    def test_prepare_cr_skips_existing_issue_marker_when_cr_in_dhf(self):
        with tempfile.TemporaryDirectory() as tmp:
            comments = [{"body": "Already created\n<!-- webtps-cr: CR-034 -->"}]
            # CR-034 exists in DHF → genuine skip
            result = prepare_cr(
                make_issue(), "2026-W18", Path(tmp), comments, write=True,
                adapter=FakeDHFAdapter([{"id": "CR-034", "description": ""}]),
            )
            self.assertFalse(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")

    def test_prepare_cr_retries_when_marker_cr_not_in_dhf(self):
        """PR was closed without merge: marker exists but CR never landed in DHF."""
        with tempfile.TemporaryDirectory() as tmp:
            comments = [{"body": "Previously attempted\n<!-- webtps-cr: CR-034 -->"}]
            # DHF has no CR-034 (PR was closed) → should retry
            adapter = FakeDHFAdapter()
            result = prepare_cr(
                make_issue(), "2026-W18", Path(tmp), comments, write=True,
                adapter=adapter,
            )
            self.assertTrue(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")

    def test_prepare_cr_skips_existing_source_issue_url(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = prepare_cr(
                make_issue(),
                "2026-W18",
                Path(tmp),
                [],
                write=True,
                adapter=FakeDHFAdapter(
                    [
                    {
                        "id": "CR-034",
                        "description": "Source issue: https://github.com/itercharles/WebTPS/issues/123",
                    }
                    ]
                ),
            )
            self.assertFalse(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")

    def test_marker_detection(self):
        self.assertEqual(issue_has_cr_marker([{"body": "<!-- webtps-cr: CR-099 -->"}]), "CR-099")

    def test_cr_data_includes_issue_context(self):
        issue = make_issue()
        issue = IssueContext(
            **{
                **issue.__dict__,
                "body": "### Requested change\n\nCreate CRs.\n\n### User value / justification\n\nWeekly intake is easier.\n\n### Change category\n\nOther",
            }
        )
        data = build_cr_data(issue)
        self.assertEqual(data["title"], "Add weekly CR intake")
        self.assertEqual(data["justification"], "Weekly intake is easier.")
        self.assertEqual(data["category"], "Other")
        self.assertEqual(data["description"], "Create CRs.\n\nSource issue: https://github.com/itercharles/WebTPS/issues/123")
        self.assertNotIn("### User value", data["description"])


if __name__ == "__main__":
    unittest.main()
