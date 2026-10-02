# Design Review: CR-017

**Verdict:** Approved

## Summary

CR-017 is a small, well-scoped UI change that adds a "Back to workspace" `<Link>` to the Release Notes page header. The three DHF items in scope (SYS-016, SRS-031, SWDD-013) form a complete and internally consistent traceability chain from system requirement to design detail. All three acceptance criteria are now mapped to test points (T1–T4), including T4 added in response to the PR review to cover the "no change to existing content" constraint. The SWDD is specific enough to implement directly: it names the exact Tailwind classes for the focus ring, the flex layout approach, and the semantic element choice. One gap in the implementation notes is flagged below; it does not block implementation but must be resolved before the compliance gate can pass.

## Issues

- [ ] `CR-017` (implementation_notes — Tests section): The implementation notes instruct writing component-level tests for SRS-031 T3 and T4 (Vitest), but are silent on SYS-016 T3 system-level test coverage. SYS-016 T3 requires a test asserting that the back-navigation control is present, keyboard-focusable, and navigates to the workspace route — which maps to a Playwright system test (`verify-sys`). Without it, the CI compliance gate (`medharness verify tests` against `verify-sys-junit`) will report SYS-016 T3 as uncovered and fail. The implementation notes should either instruct the developer to add a `@links:SYS-016 @testing:T3` Playwright assertion to the existing release-notes system test, or explicitly note that the existing system test suite already covers this test point (in which case, verify that before closing the CR).
