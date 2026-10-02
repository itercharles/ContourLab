"""The DHF side of a CR's life, on a scratch copy of ContourLab's real DHF.

ContourLab keeps items in older directory names (09_cr/, 01_req_crs/, ...), which is
what several medharness bugs only showed up against. Nothing here touches the real DHF.
"""

from __future__ import annotations

import difflib
import json

import _support as s


class Lifecycle(s.Scratch):
    def legacy_cr(self, root) -> str:
        """CR-013 lives in a legacy directory (09_cr/). Put it in a known state: the real record
        moves on (it is `completed` now), and these cases must not depend on that."""
        s.medharness(root, "item", "update", "CR-013", "--data", json.dumps({"status": "new"}))
        return "CR-013"

    def test_a_cr_moves_new_design_develop_completed_and_closes(self):
        root = self.scratch_dhf()
        cr = self.new_cr(root)
        self.assertEqual(s.medharness(root, "item", "get", cr)["status"], "new")
        for state in ("design", "develop", "completed"):
            s.medharness(root, "item", "transition", cr, state)
            self.assertEqual(s.medharness(root, "item", "get", cr)["status"], state)
        closure = s.medharness(root, "verify", "completion", "--cr", cr)
        self.assertTrue(closure["passed"], closure)

    def test_a_cr_cannot_skip_design_and_develop(self):
        root = self.scratch_dhf()
        cr = self.new_cr(root)
        self.assertNotEqual(s.medharness_code(root, "item", "transition", cr, "completed"), 0)
        self.assertEqual(s.medharness(root, "item", "get", cr)["status"], "new")

    def test_a_cr_cannot_complete_without_affected_items_recorded(self):
        root = self.scratch_dhf()
        created = s.medharness(root, "item", "create", "--type", "CR", "--data", json.dumps({
            "title": "t", "description": "d", "requested_by": "t", "priority": "Low", "status": "new"}))
        cr = created["id"]
        s.medharness(root, "item", "transition", cr, "design")
        s.medharness(root, "item", "transition", cr, "develop")
        self.assertNotEqual(s.medharness_code(root, "item", "transition", cr, "completed"), 0)

    def test_closure_fails_for_a_cr_that_was_never_planned(self):
        root = self.scratch_dhf()
        closure = s.medharness(root, "verify", "completion", "--cr", self.legacy_cr(root), check=False)
        self.assertFalse(closure["passed"])

    def test_updating_an_item_in_a_legacy_directory_keeps_one_file_in_place(self):
        root = self.scratch_dhf()
        cr = self.legacy_cr(root)
        (before,) = self.item_files(root, cr)
        s.medharness(root, "item", "update", cr, "--data", json.dumps({"priority": "High"}))
        after = self.item_files(root, cr)
        self.assertEqual(after, [before], "update must not leave a second copy in another directory")
        self.assertTrue(s.medharness(root, "verify", "dhf")["passed"])

    def test_transitioning_an_item_in_a_legacy_directory_keeps_one_file_in_place(self):
        root = self.scratch_dhf()
        cr = self.legacy_cr(root)
        (before,) = self.item_files(root, cr)
        s.medharness(root, "item", "transition", cr, "design")
        self.assertEqual(self.item_files(root, cr), [before])
        self.assertEqual(s.medharness(root, "item", "get", cr)["status"], "design")

    def test_an_update_changes_only_the_fields_passed(self):
        root = self.scratch_dhf()
        (path,) = self.item_files(root, "SOUP-001")
        before = path.read_text().splitlines()
        s.medharness(root, "item", "update", "SOUP-001", "--data", json.dumps({"version": "34.15.2"}))
        changed = [l for l in difflib.unified_diff(before, path.read_text().splitlines(), lineterm="", n=0)
                   if l[:1] in "+-" and l[:3] not in ("+++", "---")]
        self.assertLessEqual(len(changed), 2, changed)

    def test_an_update_the_schema_rejects_is_refused_and_leaves_the_file_alone(self):
        root = self.scratch_dhf()
        (path,) = self.item_files(root, "CRS-013")
        before = path.read_bytes()
        code = s.medharness_code(root, "item", "update", "CRS-013", "--data", '{"verification_method": "Test"}')
        self.assertEqual(code, 1)
        self.assertEqual(path.read_bytes(), before)
        self.assertTrue(s.medharness(root, "verify", "dhf")["passed"], "the DHF must stay readable")

    def test_item_data_must_be_a_json_object(self):
        root = self.scratch_dhf()
        self.assertEqual(s.medharness_code(root, "item", "update", "CR-013", "--data", "[1]"), 1)


class Changes(s.Scratch):
    """`verify changes`: the branch must change the items the CR lists, and only those."""

    def setUp(self) -> None:
        super().setUp()
        self.root = self.scratch_dhf()
        s.git(self.root, "init", "-q", "-b", "main")
        self.cr = self.new_cr(self.root, affected=["SYS-001"], status="design")
        s.git(self.root, "add", "-A")
        s.git(self.root, "commit", "-q", "-m", "base")
        s.git(self.root, "checkout", "-q", "-b", f"feat/{self.cr}")

    def changes(self, *extra: str) -> dict:
        return s.medharness(self.root, "verify", "changes", "--cr", self.cr, "--since-ref", "main", *extra, check=False)

    def test_passes_when_the_branch_changes_exactly_the_listed_item(self):
        s.medharness(self.root, "item", "update", "SYS-001", "--data", json.dumps({"title": "changed"}))
        self.assertTrue(self.changes()["passed"])

    def test_fails_when_a_listed_item_is_untouched(self):
        result = self.changes()
        self.assertFalse(result["passed"])
        self.assertIn("SYS-001", json.dumps(result["errors"]))

    def test_fails_when_the_branch_changes_an_item_the_cr_does_not_list(self):
        s.medharness(self.root, "item", "update", "SYS-001", "--data", json.dumps({"title": "changed"}))
        s.medharness(self.root, "item", "update", "SRS-001", "--data", json.dumps({"title": "also changed"}))
        result = self.changes()
        self.assertFalse(result["passed"])
        self.assertIn("SRS-001", json.dumps(result["errors"]))

    def test_uncommitted_changes_count(self):
        s.medharness(self.root, "item", "update", "SYS-001", "--data", json.dumps({"title": "uncommitted"}))
        self.assertEqual(s.git(self.root, "status", "--porcelain").stdout.count("SYS-001"), 1)
        self.assertTrue(self.changes()["passed"])

    def test_code_path_requires_a_changed_file_under_it(self):
        s.medharness(self.root, "item", "update", "SYS-001", "--data", json.dumps({"title": "changed"}))
        self.assertFalse(self.changes("--code-path", "apps/")["passed"])
        (self.root / "apps" / "client").mkdir(parents=True)
        (self.root / "apps" / "client" / "new.ts").write_text("export {};\n")
        self.assertTrue(self.changes("--code-path", "apps/")["passed"])


if __name__ == "__main__":
    import unittest
    unittest.main()
