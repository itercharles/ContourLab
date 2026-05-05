# CR-001 Dark Mode Contrast Improvement — Technical Specification

## 1. Summary

**Product behavior change:** The WebTPS dark mode theme shall render text and
interactive elements at a contrast ratio sufficient for clinical readability,
comparable to GitHub's dark mode palette.

The current dark mode UI uses colors that produce contrast ratios below the
WCAG AA threshold (4.5:1 for normal text, 3:1 for large text/UI elements),
making text difficult to read in low-light clinical environments. The fix is
confined to Tailwind CSS design tokens and component-level color classes in
the browser client — no API, DICOM, or data flow changes are involved.

---

## 2. Implementation Plan

### Scope

- **Repository:** `itercharles/WebTPS` (browser client only)
- **Layer:** Tailwind CSS theme configuration and component color classes
- **No changes** to: API, DICOM handling, SRS/SYS clinical data paths, or
  repository integration

### Approach

1. **Audit current palette** — measure contrast ratios of foreground/background
   pairs used in the dark theme (primary text, secondary text, muted labels,
   interactive borders, input backgrounds).
2. **Define target palette** — adopt GitHub's `dark` theme color primitives as
   a reference (publicly documented). Key targets:
   - Normal text on surface: ≥ 4.5:1
   - Large text / UI control labels: ≥ 3:1
   - Interactive focus rings: ≥ 3:1
3. **Update Tailwind config** — adjust `theme.extend.colors` or CSS custom
   properties that drive the dark mode palette. Keep variable names stable to
   avoid scattering changes across components.
4. **Spot-check components** — verify high-traffic surfaces: patient browser,
   structure panel, viewport toolbar, top context bar, and QA checklist.
5. **Validate** — run automated contrast check and manual visual review in dark
   mode before opening the implementation PR.

### Expected touchpoints in `itercharles/WebTPS`

- `tailwind.config.ts` (or `tailwind.config.js`) — dark mode color tokens
- Global CSS file (e.g. `globals.css` or `index.css`) — CSS custom properties
  for dark theme if used alongside Tailwind
- Possibly isolated component files if any hardcode color classes that
  undercut the theme (inspect during implementation; update only as needed)

---

## 3. DHF Impact

### `/product-impact`

```
Product / UC / CRS: Required
Justification: No existing UC or CRS covers UI readability or visual contrast; a
  new CRS (and parent UC if warranted) is needed to give this usability
  requirement a traceable home.
Impacted items: None (new items required)
Recommended action: Create CRS-011 "Users shall read UI text in dark mode at
  sufficient contrast" derived from an appropriate UC (extend UC-001 or create
  UC-006 for general UI usability) during the design phase.
```

### `/req-manage`

```
Requirements impact: Required
Justification: No SYS or SRS item currently covers dark mode visual contrast;
  new SYS and SRS items are needed to make the requirement traceable and
  verifiable.
Impacted items: None (new items required)
Recommended action: Create, in order — UC-006 (if no general usability UC
  exists) → CRS-011 → SYS-014 → SRS-018 — during the design/implementing phase
  before opening the implementation PR.
```

### `/architecture-impact`

```
Architecture / SYSARCH: Not required
Justification: The change is entirely within the browser client's Tailwind CSS
  theme layer; it does not alter system boundaries, data flow, API contracts, or
  DICOM integration described in SYSARCH-001/002/003.
Impacted items: None
Recommended action: None
```

### `/risk-impact`

```
Risk / RCM: Not required
Justification: Contrast adjustment is cosmetic and does not affect clinical data
  integrity, contour editing, image geometry, DICOM exchange, or any existing
  risk control; no new hazard or harm pathway is introduced.
Impacted items: None
Recommended action: None
```

### `/soup-impact`

```
SOUP / Dependencies: Not required
Justification: Tailwind CSS is already in use as approved tooling (SYSARCH-001);
  this change uses it in the same approved way with no version change or new
  dependency.
Impacted items: None
Recommended action: None
```

### `/test-impact`

```
Test impact: Required
Development checks: TypeScript build, Tailwind purge/compile (no new scripts needed)
Verification tests: Add one Test-SRS annotated with @links:SRS-018 that asserts
  computed contrast ratios meet the ≥ 4.5:1 threshold for primary text tokens
  using a contrast-ratio utility (e.g. `color2k` or `wcag-contrast`).
Validation tests: Add one Test-CRS/Playwright smoke test annotated with
  @links:CRS-011 that loads the app in dark mode and asserts no WCAG AA
  violation on the patient browser and structure panel surfaces.
Manual confirmation: Required — visually inspect the dark mode UI on the patient
  browser, structure panel, viewport toolbar, and QA checklist in a real browser
  after implementation; screenshot comparison against GitHub dark mode is
  sufficient.
```

---

## 4. Verification

| Check | Method | Pass criterion |
|---|---|---|
| Contrast ratios ≥ 4.5:1 (normal text) | Automated unit test (`@links:SRS-018`) | All primary text token pairs pass |
| Contrast ratios ≥ 3:1 (large text / controls) | Automated unit test | All UI control token pairs pass |
| Playwright dark mode smoke | Test-CRS (`@links:CRS-011`) | No axe-core WCAG AA violations on target surfaces |
| Manual visual review | Manual | Clinician-readable in dark mode; matches GitHub dark palette intent |

---

## 5. Implementation Checklist

- [x] Product behavior change is stated in one sentence.
- [x] Product direction, UC, and CRS impact checked with `/product-impact`.
- [x] CRS, SYS, and SRS requirement impact checked with `/req-manage`.
- [x] Architecture and SYSARCH impact checked with `/architecture-impact`.
- [x] Risk and RCM impact checked with `/risk-impact`.
- [x] SOUP and dependency impact checked with `/soup-impact`.
- [x] Test impact checked with `/test-impact`.
- [x] Expected product code touchpoints are identified.
- [x] Verification approach is stated with the smallest sufficient automated checks.
- [x] Manual test need is stated.
- [x] Open questions are listed.

---

## 6. Open Questions

1. **UC scope** — Does a general "UI Usability" UC already exist or should one
   be created? If product team confirms UC-001 ("View DICOM Images") is broad
   enough to parent a contrast CRS, no new UC is needed; otherwise create UC-006.
2. **Contrast tool** — Confirm which contrast-ratio library is already present in
   the WebTPS dev dependencies before adding one; prefer reuse over a new SOUP
   entry.
3. **Scope of component sweep** — Implementation should verify whether any
   components hardcode color classes outside the Tailwind theme. If more than
   ~10 files require direct edits, the team should decide whether to scope those
   to a follow-up CR.
