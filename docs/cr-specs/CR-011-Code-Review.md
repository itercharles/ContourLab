# Code Review: CR-011

**Verdict:** Needs Revision

## Summary

The `Toolbar.tsx` change is correct and complete — the `{/* CTA */}` block was removed exactly as specified, and no unrelated code was touched. The negative assertion (`queryByRole(...).toBeNull()`) was added per the spec's optional recommendation. However, the implementation contains two related problems in `Toolbar.test.tsx`: the `@links:` annotation was injected into the test's `it()` description string rather than as a code comment, and the test name itself was not updated to reflect the test's new purpose. Together these leave the test file misleading and the traceability annotation in an unconventional, semantically incorrect form.

## Issues

- [ ] `apps/client/src/components/viewer/Toolbar.test.tsx:306`: The `@links:` annotation was embedded inside the `it()` description string (the test name) rather than as an inline comment in the test body. Annotations in test names are not a supported convention (CLAUDE.md specifies `// @links:SRS-xxx` style comments), they pollute test output and reporter UIs with a long prose string, and they are not pointing to a real DHF item ID — they contain the raw `needs_new_tc` prose description verbatim. **Fix**: remove the annotation from the test name and, since there is no SRS/SYS item to link to for this purely cosmetic removal, omit the `@links:` comment entirely (or add a plain `// CR-011: verifies CTA absent` comment if in-code traceability is desired). **Harness note**: the deterministic annotation check accepted this malformed form — that is a harness bug; the check should require the annotation to appear in a comment, not in the test name string.

- [ ] `apps/client/src/components/viewer/Toolbar.test.tsx:306`: The test description still reads *"opens the prototype issue-driven AI coding notice from the top bar CTA"*, which describes the old behaviour (clicking and reading CTA content). The test now verifies the CTA is **absent**. **Fix**: rename to something like `"About dialog does not render the 'Submit or track an issue' CTA"` so the intent is immediately clear.
