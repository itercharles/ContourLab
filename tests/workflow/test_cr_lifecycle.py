"""The DHF side of a CR's life, on a scratch copy of ContourLab's real DHF.

ContourLab keeps items in older directory names (09_cr/, 01_req_crs/, ...), which is
what several medharness bugs only showed up against. Nothing here touches the real DHF.
"""

from __future__ import annotations

import difflib
import json
import re

import _support as s


class Lifecycle(s.Scratch):
    def legacy_cr(self, root) -> str:
        """CR-013 lives in a legacy directory (09_cr/). Put it in a known state: the real record
        moves on (it is `completed` now), and these cases must not depend on that.

        The status is written into the scratch copy's file: since medharness 0.59 `item update` cannot
        change the status of an item with a lifecycle (only `item transition` can, and that does not
        go from `completed` back to `new`), and this is test setup on a throwaway copy, not a move of a CR."""
        path = root / "DHF" / "items" / "09_cr" / "CR-013.yaml"
        path.write_text(re.sub(r"(?m)^status: .*$", "status: new", path.read_text(encoding="utf-8")), encoding="utf-8")
        return "CR-013"

    def test_a_cr_moves_new_design_develop_completed_and_closes(self):
        root = self.scratch_dhf()
        cr = self.new_cr(root)
        self.assertEqual(s.medharness(root, "item", "get", cr)["status"], "new")
        for state in ("design", "develop", "completed"):
            s.medharness(root, "item", "transition", cr, state)
            self.assertEqual(s.medharness(root, "item", "get", cr)["status"], state)
        closure = s.medharness(root, "verify", "tests", "--cr", cr)
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
        # Everything the move to develop asks for (0.63+: a triage result and implementation notes), but no
        # affected_items: that is the one thing this test leaves out.
        s.medharness(root, "item", "update", cr, "--data", json.dumps({
            "implementation_notes": "notes",
            "triage_result": {"verdict": "approved", "complexity": "small", "affected_subsystems": [],
                              "related_crs": [], "notes": "test"},
        }))
        s.medharness(root, "item", "transition", cr, "design")
        s.medharness(root, "item", "transition", cr, "develop")
        refused = s.run(["medharness", "--dhf", "DHF", "item", "transition", cr, "completed"], cwd=root, check=False)
        self.assertNotEqual(refused.returncode, 0)
        self.assertIn("affected_items", refused.stdout + refused.stderr, "refused for the reason the test is about")

    def test_closure_fails_for_a_cr_with_no_test_evidence(self):
        """`verify completion` was folded into `verify tests --cr` in 0.75: a CR whose items have no JUnit evidence fails."""
        root = self.scratch_dhf()
        closure = s.medharness(root, "verify", "tests", "--cr", self.legacy_cr(root), check=False)
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
    """`verify impact` (0.74 folded `verify changes` into it): the branch must change the items the CR lists, and
    only those (`dhf_branch`), and the code paths asked for (`code_branch`); whatever depends on a changed item
    must be changed or listed in `reviewed_items`."""

    def setUp(self) -> None:
        super().setUp()
        self.root = self.scratch_dhf()
        s.git(self.root, "init", "-q", "-b", "main")
        self.cr = self.new_cr(self.root, affected=["SYS-001"], status="design")
        s.git(self.root, "add", "-A")
        s.git(self.root, "commit", "-q", "-m", "base")
        s.git(self.root, "checkout", "-q", "-b", f"feat/{self.cr}")

    def impact(self, *extra: str) -> dict:
        return s.medharness(self.root, "verify", "impact", "--cr", self.cr, "--since-ref", "main", *extra, check=False)

    def coupling(self, *extra: str) -> list[str]:
        """The branch-coupling errors of `verify impact`: the changed items against the CR's `affected_items`
        (`dhf_branch`) and the required code paths (`code_branch`). The scratch CR has no impact_analysis and
        its dependents are not reviewed, so `passed` is false for those reasons: these tests look at the coupling."""
        return [e for e in self.impact(*extra)["errors"] if e.startswith(("dhf_branch:", "code_branch:"))]

    def dependents(self, result: dict) -> list[str]:
        """The items `verify impact` asks to be changed or reviewed."""
        return sorted({m.group(1) for e in result["errors"] if (m := re.match(r"impact\.(\S+?):", e))})

    def change_sys(self, title: str = "changed") -> None:
        s.medharness(self.root, "item", "update", "SYS-001", "--data", json.dumps({"title": title}))

    def test_passes_when_the_branch_changes_exactly_the_listed_item(self):
        self.change_sys()
        self.assertEqual(self.coupling(), [])

    def test_fails_when_a_listed_item_is_untouched(self):
        errors = self.coupling()
        self.assertTrue(any(e.startswith("dhf_branch:") for e in errors), errors)
        self.assertIn("SYS-001", json.dumps(errors))

    def test_fails_when_the_branch_changes_an_item_the_cr_does_not_list(self):
        self.change_sys()
        s.medharness(self.root, "item", "update", "SRS-001", "--data", json.dumps({"title": "also changed"}))
        errors = self.coupling()
        self.assertTrue(any(e.startswith("dhf_branch:") for e in errors), errors)
        self.assertIn("SRS-001", json.dumps(errors))

    def test_uncommitted_changes_count(self):
        self.change_sys("uncommitted")
        self.assertEqual(s.git(self.root, "status", "--porcelain").stdout.count("SYS-001"), 1)
        self.assertEqual(self.coupling(), [])

    def test_code_path_requires_a_changed_file_under_it(self):
        self.change_sys()
        self.assertTrue(any(e.startswith("code_branch:") for e in self.coupling("--code-path", "apps/")))
        (self.root / "apps" / "client").mkdir(parents=True)
        (self.root / "apps" / "client" / "new.ts").write_text("export {};\n")
        self.assertEqual(self.coupling("--code-path", "apps/"), [])

    def test_an_item_that_depends_on_a_changed_one_must_be_changed_or_reviewed(self):
        self.change_sys()
        result = self.impact()
        self.assertFalse(result["passed"])
        self.assertIn("SRS-001", self.dependents(result), "SRS-001 derives from SYS-001")
        self.assertIn("reviewed_items", json.dumps(result["errors"]))

    def test_listing_the_dependents_in_reviewed_items_clears_it(self):
        self.change_sys()
        deps = self.dependents(self.impact())
        self.assertTrue(deps)
        s.medharness(self.root, "item", "update", self.cr, "--data", json.dumps({"reviewed_items": deps}))
        self.assertEqual(self.dependents(self.impact()), [])
        self.assertEqual(s.medharness(self.root, "item", "get", self.cr)["reviewed_items"], deps)

    def test_changing_a_dependent_stops_it_being_asked_for_but_reaches_its_own_dependents(self):
        self.change_sys()
        self.assertIn("SRS-001", self.dependents(self.impact()))
        s.medharness(self.root, "item", "update", "SRS-001", "--data", json.dumps({"title": "reviewed and changed"}))
        s.medharness(self.root, "item", "update", self.cr, "--data", json.dumps({"affected_items": ["SYS-001", "SRS-001"]}))
        asked = self.dependents(self.impact())
        self.assertNotIn("SRS-001", asked, "a changed dependent is reviewed by being changed")
        self.assertIn("SWDD-002", asked, "SWDD-002 depends on SRS-001, which the branch now changes")
        s.medharness(self.root, "item", "update", self.cr, "--data", json.dumps({"reviewed_items": asked}))
        self.assertEqual(self.dependents(self.impact()), [])

    def test_a_branch_is_not_blamed_for_what_landed_on_main_after_it_branched(self):
        """CR-017's branch was cut, then a record fix merged to main. The diff base is the
        merge-base, not main's tip (0.49.1); against the tip, SOUP-001 looked like the branch's."""
        self.change_sys()
        s.git(self.root, "add", "-A")
        s.git(self.root, "commit", "-q", "-m", "branch work")
        branch = s.git(self.root, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
        s.git(self.root, "checkout", "-q", "main")
        s.medharness(self.root, "item", "update", "SOUP-001", "--data", json.dumps({"version": "34.15.2"}))
        s.git(self.root, "add", "-A")
        s.git(self.root, "commit", "-q", "-m", "landed on main after the branch was cut")
        s.git(self.root, "checkout", "-q", branch)
        self.assertEqual(s.git(self.root, "rev-list", "--count", f"{branch}..main").stdout.strip(), "1")
        self.assertNotIn("SOUP-001", json.dumps(self.impact()["errors"]))
        self.assertEqual(self.coupling(), [])

    def test_impact_depth_zero_turns_the_check_off(self):
        config = self.root / "DHF" / "config" / "global.yaml"
        config.write_text(config.read_text() + "\nimpact_depth: 0\n")
        self.change_sys()
        self.assertEqual(self.dependents(self.impact()), [])


if __name__ == "__main__":
    import unittest
    unittest.main()
