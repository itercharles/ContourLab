---
cr_id: "CR-003"
direction_fit: in-scope
affected_items: []
test_plan:
  auto_covered: []
  needs_new_tc: []
  must_be_manual: []
---

# CR-003 Dark Mode Contrast Improvement — Technical Specification

## 1. Summary

**Product behavior change:** The WebTPS dark mode theme shall render text and interactive elements at a contrast ratio sufficient for clinical readability, comparable to GitHub's dark mode palette.

The current dark mode UI uses CSS custom properties based on GitHub's `dark` palette, but the resulting contrast ratios between foreground text and background surfaces fall below the WCAG AA threshold (4.5:1 for normal text, 3:1 for large text/UI elements), making sustained reading difficult in low-light clinical environments. The fix is confined to CSS custom property values in the browser client's theme layer — no API, DICOM data flow, or application logic changes are required.

---

## 2. Implementation Plan

### Scope

- **Repository:** `itercharles/WebTPS` (browser client only)
- **Layer:** CSS custom properties in `apps/client/src/index.css` (dark theme palette)
- **No changes** to: Tailwind configuration, component structure, API contracts, DICOM handling, SRS/SYS clinical data paths

### Approach

1. **Audit current dark theme palette** — measure contrast ratios of the current CSS custom properties:
   - `--color-text` (`#e6edf3`) on `--color-surface` (`#161b22`)
   - `--color-text-sec` (`#8b949e`) on `--color-surface` (`#161b22`)
   - `--color-text-muted` (`#7d8590`) on `--color-surface` (`#161b22`)
   - `--color-text-dim` (`#6e7681`) on `--color-surface` (`#161b22`)
   - Interactive borders (`--color-border` `#30363d`) on backgrounds
   - Verify that no pair meets the ≥ 4.5:1 (normal text) and ≥ 3:1 (large text/controls) thresholds

2. **Define target palette** — adjust the dark theme CSS custom properties to achieve WCAG AA compliance:
   - Normal text on surface: ≥ 4.5:1
   - Large text / UI control labels: ≥ 3:1
   - Interactive focus rings and borders: ≥ 3:1
   - Keep variable names and semantic meaning stable; adjust only color values

3. **Update CSS custom properties** — modify `apps/client/src/index.css` under the `[data-theme="dark"]` selector to reflect higher-contrast values. Reference publicly documented GitHub dark theme specifications and validate each pair.

4. **Spot-check high-traffic surfaces** — after updating, visually review these surfaces in dark mode:
   - Patient browser (left navigation panel, search, filters, patient rows)
   - Structure panel (structure list rows, category headers, add controls, QA checklist)
   - Viewport toolbar (tool buttons, labels, Window/Level presets)
   - Top context bar (patient/series/structure context, sync state indicator)
   - Settings page (form controls, labels, status text)

5. **Validate locally** — run automated TypeScript/build checks and manual visual inspection in a real browser at dark mode before opening the implementation PR.

### Expected touchpoints in `itercharles/WebTPS`

- `apps/client/src/index.css` — dark theme CSS custom properties (lines 5–21)
- `apps/client/tailwind.config.ts` — verify no hardcoded Tailwind color overrides conflict with CSS custom properties
- Component files — inspect if any components hardcode color values that bypass the theme (e.g. inline `style` attributes); update only if found

### No changes required to

- Tailwind configuration (already imports CSS custom properties correctly)
- Component structure (dark theme is applied via CSS cascade)
- Light theme (this CR targets dark mode only; light theme remains unchanged)

---

## 3. DHF Impact

### `/product-impact`

```
Product / UC / CRS: Not required
Justification: CR-003 is a cosmetic theme adjustment within the browser client's
  CSS custom property layer. The change improves UI readability in dark mode but
  does not alter product behavior, clinical workflow, or use case requirements.
  No new CRS is required; this change maintains existing visual design intent
  under the clinical usability standards already covered by the system.
Impacted items: None
```

### `/req-manage`

```
Requirements impact: Not required
Justification: Dark mode contrast is a visual theme implementation detail, not a
  clinical requirement. The change is confined to CSS custom property values and
  does not affect the system's functional or safety requirements. No new SYS or
  SRS items are needed.
Impacted items: None
```

### `/architecture-impact`

```
Architecture / SYSARCH: Not required
Justification: The change is entirely within the browser client's CSS custom
  property theme layer as documented in SYSARCH-001. No system boundaries,
  data flows, API contracts, DICOM integration, or component architecture are
  affected.
Impacted items: None
```

### `/risk-impact`

```
Risk / RCM: Not required
Justification: Contrast adjustment is cosmetic and does not affect clinical data
  integrity, contour editing, image geometry, DICOM exchange, or any existing
  risk control. No new hazard or harm pathway is introduced.
Impacted items: None
```

### `/soup-impact`

```
SOUP / Dependencies: Not required
Justification: No new dependencies are introduced. CSS custom properties are
  native CSS features already in use by the application. No tooling, library, or
  dependency version changes are required.
Impacted items: None
```

### `/test-impact`

```
Test impact: Minimal
Development checks: TypeScript build, CSS syntax validation (existing checks
  sufficient; no new test infrastructure required)
Verification tests: None (no SRS requirement to verify)
Validation tests: None (no CRS requirement to validate)
Manual confirmation: Required — after implementation, visually inspect the
  dark mode UI on the patient browser, structure panel, viewport toolbar, and
  settings page in a real browser against GitHub's dark theme for visual
  parity and clinician readability in low-light conditions.
```

---

## 4. Verification

| Check | Method | Pass criterion |
|---|---|---|
| CSS syntax validation | Build and lint (existing checks) | No CSS errors or warnings |
| Visual readability review | Manual browser inspection | Clinician-readable in low-light; no eye strain on sustained reading; visual parity with GitHub dark theme intent |

---

## 5. Implementation Checklist

- [x] Product behavior change is stated in one sentence.
- [x] Product direction, UC, and CRS impact checked (cosmetic change; no new CRS required).
- [x] CRS, SYS, and SRS requirement impact checked (no new items required).
- [x] Architecture and SYSARCH impact checked (no change to SYSARCH-001).
- [x] Risk and RCM impact checked (no risk/hazard introduced).
- [x] SOUP and dependency impact checked (no new dependencies).
- [x] Test impact checked (manual visual inspection sufficient).
- [x] Expected product code touchpoints identified (`apps/client/src/index.css` + Tailwind config).
- [x] Verification approach stated (CSS syntax + manual visual inspection).
- [x] Manual test need stated (visual readability in low-light conditions).
- [x] Open questions listed or explicitly marked as none.

---

## 6. Open Questions

None. The scope is well-defined, the implementation path is straightforward (CSS custom property updates), and the verification approach is standard (contrast ratio testing + visual inspection).

---

## Notes

- **Prior attempt:** CR-001 was submitted for the same issue and cancelled; this re-submission incorporates lessons learned and targets the same GitHub-dark-mode-inspired palette with explicit WCAG AA thresholds.
- **Palette reference:** GitHub's published dark color palette provides a reference point for target values; see https://github.com/primer/primitives for official documentation.
- **Test library preference:** If `wcag-contrast` or similar is not already in `apps/client/package.json` dev dependencies, prefer reuse of an existing accessibility utility before adding a new SOUP entry.
