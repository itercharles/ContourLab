---
cr_id: "CR-003"
direction_fit: in-scope
affected_items:
  - SYSARCH-001
test_plan:
  auto_covered: []
  needs_new_tc: []
  must_be_manual:
    - dark-mode-contrast-visual-verification
---

## Summary

Increase text-to-background contrast in dark mode to meet WCAG AA accessibility standards (4.5:1 minimum for normal text, 3:1 for large text). Current palette, based on GitHub's dark theme, has inadequate contrast for secondary and muted text. Adjustments focus on brightening text colors while preserving the clinical dark aesthetic.

## Implementation Plan

### 1. Color Palette Analysis and Adjustment

Review `apps/client/src/index.css` and adjust dark theme (`:root, [data-theme="dark"]`) color variables:

- **Primary text (`--color-text`)**: Currently `#e6edf3` (ratio ~7.5:1 on `#0d1117`). Keep as-is; adequate.
- **Bright text (`--color-text-bright`)**: Currently `#f0f6fc` (ratio ~9:1). Keep; brightest.
- **Secondary text (`--color-text-sec`)**: Currently `#8b949e` (ratio ~2.7:1 on `#0d1117`). **Lighten to ~#a0aab9** for ~3.5:1.
- **Muted text (`--color-text-muted`)**: Currently `#7d8590` (ratio ~2.2:1 on `#0d1117`). **Lighten to ~#9199a4** for ~2.9:1.
- **Dim text (`--color-text-dim`)**: Currently `#6e7681` (ratio ~1.9:1 on `#0d1117`). **Lighten to ~#8a91a0** for ~2.5:1.

Use online WCAG contrast checker (WebAIM, Accessible Colors) to validate each adjustment.

### 2. Component Text Color Usage Audit

Scan React components for hardcoded text colors or misapplied Tailwind color classes:

- Search for `text-gray-*` classes that may override theme variables.
- Check `StatusBar.tsx`, `RightSidebar.tsx`, `LeftSidebar.tsx`, and panel contents for secondary/muted text usage.
- Ensure labels, hints, and disabled text use the adjusted variables, not lower contrast defaults.

### 3. Verify Default Text Rendering

Ensure HTML elements inherit `color: var(--color-text)` or explicitly use appropriate text-color variables:

- Body text defaults to `--color-text`.
- Labels and secondary information use `--color-text-sec`.
- Disabled or faint hints use `--color-text-muted` only when contrast is acceptable.
- Very dim text (`--color-text-dim`) is used sparingly and only for non-critical visual separators.

### 4. Test in Development

1. Start dev server: `pnpm dev`
2. Load DICOM workspace and navigate through panels.
3. Verify text legibility in:
   - Left sidebar (patient list, series selector)
   - Right sidebar (structure panel, settings)
   - Toolbar labels and hints
   - Status bar information
4. Use browser DevTools to confirm applied CSS variable values.
5. Run local contrast check (e.g., Lighthouse accessibility audit or aXe DevTools).

## DHF Impact

- **Product Impact**: Not required. This is an accessibility enhancement to an existing feature (dark mode UI), not a new product capability. Aligns with medical device usability standards (IEC 62304 considerations for human factors).
- **Requirements Impact**: Not required. No new functional requirements; this is a UI refinement. Existing CRS/SYS/SRS items remain unchanged.
- **Architecture Impact**: Required. Update SYSARCH-001 to reflect enhanced dark theme color palette and contrast ratios in the Tailwind CSS / color variable documentation section.
- **Risk Impact**: Not required. This change reduces usability risks (accessibility) rather than introducing new risks. No safety-critical logic changes.
- **SOUP Impact**: Not required. No new external libraries or dependencies.
- **Test Impact**: Required. Manual visual verification needed; no automated contrast testing in CI (WCAG testing not typically automated at CI stage). Add verification checklist to the PR.

## Verification

### Automated
- **Typecheck**: `pnpm --filter @webtps/client typecheck` — ensure no CSS variable references are broken.
- **Build**: `pnpm --filter @webtps/client build` — confirm CSS compiles without errors.

### Manual
1. **Contrast Measurement**: Use WebAIM Contrast Checker or similar to confirm each text color meets 4.5:1 on its intended background (dark base, surface, elevated).
2. **Workspace Visual Verification**:
   - Load sample DICOM study.
   - Verify all text in sidebars, toolbars, and panels is readable without eye strain.
   - Check disabled state text is still distinguishable.
   - Verify hover states and focus indicators are clear.
3. **Browser Accessibility Audit**: Run Chrome DevTools Lighthouse accessibility audit; confirm no low-contrast warnings.

### No Automated Test Coverage Expected
Contrast verification is inherently visual and environment-dependent (monitor calibration, ambient light). Manual review is the appropriate verification method.

## Implementation Checklist

- [ ] Analyze current text-to-background contrast ratios using WCAG contrast checker.
- [ ] Update `apps/client/src/index.css` dark theme color palette values.
- [ ] Audit React components for hardcoded text colors or overrides; apply theme variables consistently.
- [ ] Ensure body, label, hint, and disabled text use correct semantic color variables.
- [ ] Run `pnpm --filter @webtps/client typecheck` and `build`.
- [ ] Start dev server and visually verify contrast and legibility in all UI regions.
- [ ] Run Lighthouse accessibility audit and confirm no low-contrast issues remain.
- [ ] Update SYSARCH-001 to document new color palette and contrast compliance.
- [ ] Record before/after contrast measurements in PR description.

## Open Questions

- None. Scope and approach are clear; contrast adjustment is straightforward styling work.
