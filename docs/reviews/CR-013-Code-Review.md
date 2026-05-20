# Code Review: CR-013

**Verdict:** Needs Revision

## Summary

The implementation is functionally correct and matches the spec's intended outcome: a `formatPatientName` utility is extracted into `patientUtils.ts`, `WorkspaceContextBar.tsx` is updated to import from it, and the toolbar brand section gains a truncated patient name span that shows a placeholder when no series is active. The happy-path and empty-state component tests are present and passing. Three issues need addressing before merge: the utility's parameter type diverges from the canonical `Patient` type in shared-types (violating the "shared types first" convention), the fallback branches in `formatPatientName` have no direct unit test coverage, and the test element-selection strategy couples correctness to a CSS class name rather than a stable identifier.

## Issues

- [ ] `apps/client/src/core/dicom/patientUtils.ts:1`: The function parameter uses a locally-defined inline structural type (`{ name?: { given?: string; family?: string }; mrn?: string; id?: string }`) instead of the canonical `Patient` type from `@contourlab/shared-types`. Project convention is "shared types first"; `Patient` already exists with `id`, `mrn`, and `name` as required fields. Either accept `Patient` directly (the correct approach since every caller passes a `LoadedSeries.patient`), or — if incomplete DICOM data is a real runtime concern — widen `Patient` or define a `PatientDisplayInfo` partial type in shared-types and use that. Keeping an undocumented inline type in a shared utility is a drift risk.

- [ ] `apps/client/src/core/dicom/patientUtils.ts`: No unit test file exists for this module. `formatPatientName` contains a three-level fallback chain (`given+family` → `mrn` → `id` → `"Unknown patient"`) that is now shared logic, but only the `given+family` case and the `undefined` patient case are exercised by the component tests in `Toolbar.test.tsx`. The `mrn`-only branch, the `id`-only branch, and the `"Unknown patient"` branch are not tested anywhere. A colocated `patientUtils.test.ts` should cover these cases.

- [ ] `apps/client/src/components/viewer/Toolbar.test.tsx:367,378`: Both new tests locate the brand `<span>` via `classList.contains('max-w-[160px]')`. This ties test correctness to a Tailwind class that could change for unrelated design reasons. Add `data-testid="toolbar-patient-name"` to the span in `Toolbar.tsx` and use `getByTestId('toolbar-patient-name')` in the tests instead, which is the standard RTL pattern for disambiguation within a rendered tree.
