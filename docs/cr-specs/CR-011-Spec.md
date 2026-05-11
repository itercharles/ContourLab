---
cr_id: "CR-011"
direction_fit: in-scope
affected_items:
  - SYS-007
  - SRS-010
test_plan:
  auto_covered: []
  needs_new_tc:
    - SRS-010
  must_be_manual: []
---

# CR-011 — Cannot select RTSS for the opened patient

## Summary

When a patient is open, the repository panel shows available RTSTRUCT objects
nested under the active image set, but loading one requires a **double-click** on
the row. Double-click is non-standard for a list item activated with `role="button"`
and is inconsistent with the single-click used to load an image series. Users
cannot discover the interaction and report being unable to select an RTSS.

The fix is to change the RTSTRUCT row activation from `onDoubleClick` to
`onClick` in `DicomRepoPanel.tsx`, update the UI hint text, and clarify the
interaction model in SRS-010.

## Implementation Plan

### Code change — `apps/client/src/components/dicom/DicomRepoPanel.tsx`

1. Replace the `onDoubleClick` handler on the RTSTRUCT group row (around line 1384)
   with an `onClick` handler:

   ```tsx
   // Before
   onDoubleClick={() => {
     if (!importingRtstructSop) {
       void onLoadRtstruct(instance, [entry]);
     }
   }}

   // After
   onClick={() => {
     if (!importingRtstructSop) {
       void onLoadRtstruct(instance, [entry]);
     }
   }}
   ```

2. Update the `title` tooltip on the same element (line 1403):
   - Before: `"Double-click to activate this image set and RTSTRUCT"`
   - After: `"Click to activate this image set and RTSTRUCT"`

3. Update the hint text rendered inside the row (line 1436):
   - Before: `'Double-click to activate'`
   - After: `'Click to activate'`

No other logic changes are needed. `onLoadRtstruct` already handles the unsaved-
changes confirmation dialog and all load/replace logic.

### DHF item update — SRS-010

Add one sentence to SRS-010 to make the interaction model explicit:

> "RTSTRUCT candidate rows shall respond to a single click to activate; a
> keyboard Enter or Space key press shall be equivalent."

This removes the implicit double-click deviation and aligns the requirement with
the corrected implementation.

## DHF Impact

### Product / UC / CRS
**Not required.**
Existing UC-004 ("Exchange RTSTRUCT with Repository", Load flow step 3: "User selects
an RTSTRUCT to load") and CRS-006 already cover the user need. The change corrects
the interaction to match stated intent; no new user workflow is introduced.

### Architecture / SYSARCH
**Not required.**
No system boundary, data flow, or deployment change.

### Risk / RCM
**Not required.**
The interaction change does not affect data integrity, clinical workflow safety
controls, or DICOM data handling. `onLoadRtstruct` confirmation logic for unsaved
changes is preserved unchanged.

### SOUP / Dependencies
**Not required.**
No dependency change.

### Requirements
**SRS-010 — update required.**
Add the single-click interaction sentence described above. No new SYS or SRS items
are needed; the existing hierarchy (UC-004 → CRS-006 → SYS-007 → SRS-010) is
sufficient.

### Test impact
**One new component test required** against SRS-010.

- **Development checks:** `pnpm --filter @webtps/client test`, typecheck, lint.
- **Verification test (Test-SRS):** New Vitest/RTL test in `DicomRepoPanel.test.tsx`
  (or equivalent) that renders the RTSTRUCT row with a mock `onLoadRtstruct` callback,
  fires a single `click` event, and asserts the callback is called. Annotate with
  `@links:SRS-010`.
- **Validation tests:** Not required — existing Test-CRS for the RTSTRUCT load
  workflow remain valid and cover the end-to-end path.
- **Manual confirmation:** Open the panel with a patient that has multiple RTSTRUCTs,
  click (single-click) each non-active RTSTRUCT row, and confirm the workspace
  switches RTSS and displays the "ACTIVE" badge on the selected row.

## Verification

| Check | Method |
|---|---|
| Single click on RTSTRUCT row triggers load | Test-SRS (Vitest/RTL) `@links:SRS-010` |
| Keyboard Enter/Space still triggers load | Same test, separate assertion |
| "Click to activate" hint replaces "Double-click to activate" | Visual / lint |
| Unsaved-changes confirmation still fires when workspace is dirty | Manual |
| Active badge shown after load | Manual |

## Implementation Checklist

- [ ] Replace `onDoubleClick` with `onClick` on the RTSTRUCT group row in `DicomRepoPanel.tsx`
- [ ] Update `title` tooltip text on the same element
- [ ] Update `'Double-click to activate'` hint text string
- [ ] Update SRS-010 via medharness CLI to add single-click sentence
- [ ] Add `@links:SRS-010` component test for single-click RTSTRUCT activation
- [ ] Run `pnpm --filter @webtps/client test` — all pass
- [ ] Run `pnpm --filter @webtps/client typecheck` — clean
- [ ] Run `medharness --dhf DHF dhf validate schema` — clean

## Open Questions

None. The scope is a single interaction change with a corresponding SRS clarification.
