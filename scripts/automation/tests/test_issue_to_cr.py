import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.automation.issue_to_cr import (
    IssueContext,
    build_cr_data,
    current_iso_week_milestone,
    issue_has_cr_marker,
    next_cr_id,
    prepare_cr,
)


def make_dhf(root: Path) -> Path:
    dhf = root / "dhf"
    cr_dir = dhf / "DHF" / "items" / "09_cr"
    cr_dir.mkdir(parents=True)
    (cr_dir / "CR-033.yaml").write_text("id: CR-033\n")
    return dhf


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

    def test_next_cr_id_uses_existing_dhf_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            dhf = make_dhf(Path(tmp))
            self.assertEqual(next_cr_id(dhf / "DHF" / "items" / "09_cr"), "CR-034")

    def test_prepare_cr_requires_active_milestone(self):
        with tempfile.TemporaryDirectory() as tmp:
            dhf = make_dhf(Path(tmp))
            result = prepare_cr(make_issue("2026-W19"), "2026-W18", dhf, [], write=True)
            self.assertFalse(result.should_create)
            self.assertIn("not active milestone", result.reason)

    def test_prepare_cr_creates_cr_with_dhf_utility(self):
        with tempfile.TemporaryDirectory() as tmp:
            dhf = make_dhf(Path(tmp))
            captured = {}

            def create_item(_dhf: Path, data: dict):
                captured.update(data)
                return {"id": "CR-034"}

            result = prepare_cr(
                make_issue(),
                "2026-W18",
                dhf,
                [],
                write=True,
                list_items_fn=lambda _dhf: [],
                create_item_fn=create_item,
            )
            self.assertTrue(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")
            self.assertEqual(result.cr_path, "DHF/items/09_cr/CR-034.yaml")
            self.assertEqual(captured["target_version"], "2026-W18")
            self.assertEqual(captured["description"], "Create CR from accepted issue.\n\nSource issue: https://github.com/itercharles/WebTPS/issues/123")
            self.assertEqual(captured["justification"], "Weekly intake is easier.")
            self.assertEqual(captured["content"], "- CR PR is opened automatically.")
            self.assertIn("Source issue: https://github.com/itercharles/WebTPS/issues/123", captured["description"])

    def test_prepare_cr_skips_existing_issue_marker_when_cr_in_dhf(self):
        with tempfile.TemporaryDirectory() as tmp:
            dhf = make_dhf(Path(tmp))
            comments = [{"body": "Already created\n<!-- webtps-cr: CR-034 -->"}]
            # CR-034 exists in DHF → genuine skip
            result = prepare_cr(
                make_issue(), "2026-W18", dhf, comments, write=True,
                list_items_fn=lambda _: [{"id": "CR-034", "description": ""}],
            )
            self.assertFalse(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")

    def test_prepare_cr_retries_when_marker_cr_not_in_dhf(self):
        """PR was closed without merge: marker exists but CR never landed in DHF."""
        captured: dict = {}

        def create_item(_dhf, data):
            captured.update(data)
            return {"id": "CR-034"}

        with tempfile.TemporaryDirectory() as tmp:
            dhf = make_dhf(Path(tmp))
            comments = [{"body": "Previously attempted\n<!-- webtps-cr: CR-034 -->"}]
            # DHF has no CR-034 (PR was closed) → should retry
            result = prepare_cr(
                make_issue(), "2026-W18", dhf, comments, write=True,
                list_items_fn=lambda _: [],
                create_item_fn=create_item,
            )
            self.assertTrue(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")

    def test_prepare_cr_skips_existing_source_issue_url(self):
        with tempfile.TemporaryDirectory() as tmp:
            dhf = make_dhf(Path(tmp))
            result = prepare_cr(
                make_issue(),
                "2026-W18",
                dhf,
                [],
                write=True,
                list_items_fn=lambda _dhf: [
                    {
                        "id": "CR-034",
                        "description": "Source issue: https://github.com/itercharles/WebTPS/issues/123",
                    }
                ],
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
