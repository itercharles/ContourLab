---
cr_id: "CR-003"
direction_fit: in-scope
affected_items: []
test_plan:
  auto_covered: []
  needs_new_tc:
    - SRS-018
  must_be_manual: []
---

# CR-003 Dark Mode Contrast — Technical Specification

## Summary

The WebTPS dark mode shall render text at WCAG AA contrast ratios (≥ 4.5:1
for normal text, ≥ 3:1 for large text / UI controls), comparable to the
GitHub dark palette referenced in the CR. The fix formalizes an existing
automated contrast test by creating the missing DHF traceability chain
(CRS-011 → SYS-014 → SRS-018) and verifying — or adjusting — the CSS design
tokens in `apps/client/src/index.css` to satisfy the requirement.

## Implementation Plan

### Context

- The contrast test already exists at
  `apps/client/src/index.contrast.test.ts` with `@links:SRS-018` annotations.
- `SRS-018.yaml` (and its parents SYS-014 and CRS-011) do not yet exist in the
  DHF — the CI traceability gate fails because the test references a
  non-existent requirement.
- The dark theme tokens in `index.css` already match the GitHub dark palette;
  they appear to meet WCAG AA for the pairs the test checks, but this must be
  confirmed by running the test suite.

### Steps

1. **Create DHF items** (in order):
   - `DHF/items/01_req_crs/CRS-011.yaml` — "Users shall read UI text in dark
     mode at sufficient contrast for clinical readability", derived from UC-001
     (extends the "diagnostic quality" postcondition to include UI chrome).
   - `DHF/items/02_req_sys/SYS-014.yaml` — "System shall present dark mode UI
     text at ≥ 4.5:1 WCAG AA contrast against all surface backgrounds",
     satisfies CRS-011, verification method: Test.
   - `DHF/items/03_req_srs/SRS-018.yaml` — "Software shall define dark theme
     CSS tokens such that primary text (--color-text, --color-text-bright,
     --color-text-sec, --color-text-muted) on each dark surface
     (--color-surface, --color-surface-alt) achieves ≥ 4.5:1 WCAG AA contrast;
     large-text / UI-control token pairs shall achieve ≥ 3:1", derives from
     SYS-014, verification method: Test.

2. **Run the existing contrast test** to confirm all current token pairs pass.
   If any pair fails, lighten the failing foreground token in `index.css`
   until the threshold is met, then update the corresponding hex value in the
   test's `dark` constant to stay in sync.

3. **Extend the test if needed** — if `--color-text-dim` (`#6e7681`) is found
   to be used in normal-text (not large-text-only) contexts in the component
   files, add a test case for it. If it is used only for deemphasized / disabled
   content it qualifies for the 3:1 large-text threshold and does not require
   a 4.5:1 case.

4. **Validate** — run `medharness --dhf DHF dhf validate schema` and
   `pnpm --filter @webtps/client test` to confirm all tests pass and the DHF
   schema is clean.

### Touchpoints

| File | Change |
|---|---|
| `DHF/items/01_req_crs/CRS-011.yaml` | New item |
| `DHF/items/02_req_sys/SYS-014.yaml` | New item |
| `DHF/items/03_req_srs/SRS-018.yaml` | New item |
| `apps/client/src/index.css` | Adjust token values if any pair fails the test |
| `apps/client/src/index.contrast.test.ts` | Add `--color-text-dim` case if needed; keep token values in sync |

No API, DICOM, data model, or shared-types changes.

## DHF Impact

### `/product-impact`
**Required** — No existing CRS covers UI text contrast; CRS-011 is needed to
give the usability requirement a traceable home. Derived from UC-001 (its
postcondition already references "diagnostic quality").

### `/req-manage`
**Required** — Create CRS-011 → SYS-014 → SRS-018 to close the gap between
the existing test annotation and the DHF. No existing SYS or SRS items are
modified.

### `/architecture-impact`
**Not required** — The change is entirely within the browser client's CSS
token layer; no system boundaries, API contracts, or DICOM integration are
affected.

### `/risk-impact`
**Not required** — Contrast adjustment does not affect clinical data integrity,
contour editing, image geometry, or DICOM exchange; no new hazard pathway is
introduced.

### `/soup-impact`
**Not required** — Tailwind CSS is already in use; no new dependency or version
change is involved.

### `/test-impact`
**Required** — `index.contrast.test.ts` already contains the test cases
annotated `@links:SRS-018`; once SRS-018 exists the CI traceability gate will
resolve. Verify the test passes with the current tokens; extend it only if
`--color-text-dim` requires a new case.

## Verification

| Check | Method | Pass criterion |
|---|---|---|
| DHF schema valid | `medharness --dhf DHF dhf validate schema` | No errors |
| WCAG AA contrast (normal text) | `pnpm --filter @webtps/client test` (`index.contrast.test.ts`) | All primary text token pairs ≥ 4.5:1 |
| WCAG AA contrast (large text / controls) | Same test file | All large-text pairs ≥ 3:1 |
| Manual visual review | Dark mode in browser | Text is readable across patient browser, structure panel, viewport toolbar, and QA checklist |

## Implementation Checklist

- [x] Product behavior change is stated in one sentence.
- [x] Product direction, UC, and CRS impact checked with `/product-impact`.
- [x] CRS, SYS, and SRS requirement impact checked with `/req-manage`.
- [x] Architecture and SYSARCH impact checked with `/architecture-impact`.
- [x] Risk and RCM impact checked with `/risk-impact`.
- [x] SOUP and dependency impact checked with `/soup-impact`.
- [x] Test impact checked with `/test-impact`.
- [x] Expected product code touchpoints are identified.
- [x] Verification approach is stated with the smallest sufficient automated checks.
- [x] Manual test need is stated, including when no manual test is expected.
- [x] Open questions are listed, or explicitly marked as none.

## Open Questions

1. **UC-001 scope** — The spec derives CRS-011 from UC-001 via its "diagnostic
   quality" postcondition. If the team considers UI chrome contrast outside
   UC-001's intent, create UC-006 ("Use Application UI") as a general usability
   UC and derive CRS-011 from it instead.
