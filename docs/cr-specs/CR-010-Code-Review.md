# Code Review: CR-010

**Verdict:** Needs Revision

## Summary

The two spec-required string changes (`title`/`aria-label` in `LeftSidebar.tsx` and `<h1>` in `Issues.tsx`) are implemented correctly, and the new `LeftSidebar.test.tsx` matches the spec. However, the implementation also changes two additional strings in `Issues.tsx` — the `<h2>` section heading and the description `<p>` — that the approved spec does not authorise. The spec table lists only the `<h1>` change in `Issues.tsx`, and the Implementation Plan explicitly states "No other files change." Two of the three new tests in `Issues.test.tsx` exist solely to cover these out-of-scope edits, confirming they were intentional additions.

## Issues

- [ ] `apps/client/src/pages/Issues.tsx:186`: `<h2>` text changed from `"Submit an Issue"` to `"Submit a Change Request"` — not listed in the spec's affected-strings table and not mentioned in the Implementation Plan. Revert this change or open a spec amendment before merging.

- [ ] `apps/client/src/pages/Issues.tsx:188`: Description `<p>` rewritten with new prose and inline `<span>` elements — also out of scope. Only the `<h1>` was approved for this file. Revert or amend the spec.

- [ ] `apps/client/src/pages/Issues.test.tsx` (`'section heading reads "Submit a Change Request"'` and `'description mentions enhancement and bug as change request types'` tests): These tests cover the two out-of-scope changes above. If those changes are reverted, remove these tests; if the changes are spec-amended and retained, keep the tests as-is.

- [ ] `apps/client/src/components/layout/LeftSidebar.test.tsx:20`: `expect(link).toBeTruthy()` is a redundant assertion — `screen.getByRole` already throws if the element is absent, so this line adds noise without catching regressions. Remove it or replace with `expect(link).toBeInTheDocument()`; the `title` assertion on the next line is the meaningful check. Minor nit; does not block approval once the scope issues above are resolved.
