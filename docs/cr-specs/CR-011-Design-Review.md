# Design Review: CR-011

**Verdict:** Approved

## Summary

The sole DHF change for CR-011 is a content update to SRS-010, appending the sentence "RTSTRUCT candidate rows shall respond to a single click to activate; a keyboard Enter or Space key press shall be equivalent." This matches the exact wording called for in the spec narrative verbatim. The existing `derives_from` links (SYS-006, SYS-007, SYS-011, SYS-012) and `verification_method` fields are preserved; only their YAML serialisation style changed (inline list → block list, block-literal content scalar → single-quoted flow scalar). SYS-007 appears in `affected_items` as the parent requirement in the traceability chain; the spec explicitly states no SYS-level content change is needed, so leaving SYS-007 untouched is correct.

## Issues

- [ ] SRS-010 (cosmetic): The `content` field was reformatted from a block-literal scalar (`|-`) to a single-quoted flow scalar, which requires escaping embedded single quotes as `''` (e.g., `set''s`, `repository''s`). The YAML is valid and schema-clean, but the flow scalar is significantly harder to read and maintain than the original block form. Recommend re-serialising `content` as a block literal to restore readability; no substantive content change required.
