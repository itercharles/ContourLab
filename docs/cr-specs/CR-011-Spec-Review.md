# Spec Review: CR-011

**Verdict:** Approved

## Summary

The spec is concise, complete, and proportional to the change — a single JSX block deletion and a corresponding test update. No placeholders or unresolved gaps exist. The implementation plan names the exact files and code blocks to touch; line numbers are marked approximate but the literal code snippets provided make the intent unambiguous. DHF impact assessments all reach clear, well-justified "Not required" conclusions, which is appropriate for a localised UI deletion with no clinical workflow or data-path implications. The empty `affected_items` list is consistent with the DHF Impact section. Open questions are correctly marked as none.

## Issues

- [ ] **test_plan.needs_new_tc — semantic mismatch**: The front-matter bucket `needs_new_tc` is used to describe *removing* an existing test assertion, not creating a new test case. The implementer is unlikely to be misled (the instruction is clear in prose), but the field name implies addition rather than deletion. Consider whether the harness schema should expose a `needs_update_tc` bucket for this pattern, or whether the entry should be reworded to make it explicit that this is a removal ("Remove the existing assertion that… and optionally replace with a negative assertion").
