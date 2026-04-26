import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.automation.issue_to_cr import (
    IssueContext,
    build_cr_yaml,
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
        body="Create CR from accepted issue.",
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

    def test_prepare_cr_writes_yaml_for_active_week(self):
        with tempfile.TemporaryDirectory() as tmp:
            dhf = make_dhf(Path(tmp))
            result = prepare_cr(make_issue(), "2026-W18", dhf, [], write=True)
            self.assertTrue(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")
            cr_text = (dhf / result.cr_path).read_text()
            self.assertIn('source_issue: "itercharles/WebTPS#123"', cr_text)
            self.assertIn('target_version: "2026-W18"', cr_text)

    def test_prepare_cr_skips_existing_issue_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            dhf = make_dhf(Path(tmp))
            comments = [{"body": "Already created\n<!-- webtps-cr: CR-034 -->"}]
            result = prepare_cr(make_issue(), "2026-W18", dhf, comments, write=True)
            self.assertFalse(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")

    def test_prepare_cr_skips_existing_source_issue(self):
        with tempfile.TemporaryDirectory() as tmp:
            dhf = make_dhf(Path(tmp))
            cr_dir = dhf / "DHF" / "items" / "09_cr"
            (cr_dir / "CR-034.yaml").write_text('id: CR-034\nsource_issue: "itercharles/WebTPS#123"\n')
            result = prepare_cr(make_issue(), "2026-W18", dhf, [], write=True)
            self.assertFalse(result.should_create)
            self.assertEqual(result.cr_id, "CR-034")

    def test_marker_detection(self):
        self.assertEqual(issue_has_cr_marker([{"body": "<!-- webtps-cr: CR-099 -->"}]), "CR-099")

    def test_cr_yaml_includes_issue_context(self):
        issue = make_issue()
        issue = IssueContext(
            **{
                **issue.__dict__,
                "body": "### Requested change\n\nCreate CRs.\n\n### User value / justification\n\nWeekly intake is easier.\n\n### Change category\n\nInfrastructure",
            }
        )
        yaml = build_cr_yaml(issue, "CR-034")
        self.assertIn('title: "Add weekly CR intake"', yaml)
        self.assertIn("Weekly intake is easier.", yaml)
        self.assertIn('category: "Infrastructure"', yaml)
        self.assertIn("Source issue: https://github.com/itercharles/WebTPS/issues/123", yaml)


if __name__ == "__main__":
    unittest.main()
