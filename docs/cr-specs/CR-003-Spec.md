---
cr_id: "CR-003"
direction_fit: in-scope
affected_items: []
test_plan:
  auto_covered: []
  needs_new_tc: []
  must_be_manual: []
---

# CR-003 Increase Dark Mode Text/Background Contrast — Technical Specification

## 1. Summary

**Product behavior change:** WebTPS dark mode shall render text against panel,
surface, and base backgrounds at WCAG AA contrast (≥ 4.5:1 normal, ≥ 3:1 large
text and UI control glyphs), comparable to GitHub's dark theme.

The current dark mode uses GitHub-inspired CSS custom properties in
`apps/client/src/index.css`, but the secondary, muted, and dim text tokens
(`--color-text-sec #8b949e`, `--color-text-muted #7d8590`,
`--color-text-dim #6e7681`) fall below 4.5:1 on the elevated/header surfaces
they are most often used against, causing the readability complaint in
issue #31. The fix is confined to dark-mode token values in `index.css`. No
API, DICOM, data flow, or React component logic changes are involved.

CR-001 (cancelled) raised the same concern; CR-003 supersedes it and follows
through with implementation.

---

## 2. Implementation Plan

### Scope

- **Workspace:** `apps/client` only — Tailwind theme CSS variables
- **No changes** to API, DICOM, shared types, or component markup

### Approach

1. **Audit** — measure contrast of every `--color-text*` token against
   `--color-base`, `--color-surface`, `--color-elevated`, `--color-header`,
   and `--color-tooltip-bg` in the dark theme block.
2. **Lift dim/muted/secondary text** — raise lightness of
   `--color-text-sec`, `--color-text-muted`, `--color-text-dim` so each meets
   ≥ 4.5:1 on every surface where it is currently used (or ≥ 3:1 if only used
   for large text / non-text UI). Keep the GitHub-dark visual character
   (cool gray, no pure white).
3. **Verify primary text** — confirm `--color-text` and `--color-text-bright`
   already pass on all surfaces; leave unchanged if they do.
4. **Borders / inputs** — confirm `--color-border` and `--color-border-input`
   meet ≥ 3:1 against the surfaces they sit on; bump only if failing.
5. **Spot check** — patient browser, structure list rows, top operation bar,
   tool rail tooltips, QA checklist — surfaces where small/secondary text is
   most prevalent.

### Expected touchpoints

- `apps/client/src/index.css` — dark-mode CSS variable values inside the
  `:root, [data-theme="dark"]` block
- `apps/client/tailwind.config.ts` — only if new tokens need to be exposed as
  Tailwind utilities (not expected; existing tokens are consumed via CSS vars)

No component files are expected to change. If any component hardcodes a hex
or `text-gray-*` class that bypasses the theme tokens, fix it in place — keep
the sweep small and bounded.

---

## 3. DHF Impact

### `/product-impact`

**Status:** Follow-up needed.
No existing UC or CRS covers UI readability or visual contrast. The design
stage shall add a usability CRS (under an existing or new usability UC) so
the requirement has a traceable home before implementation.

### `/req-manage`

**Status:** Follow-up needed.
No SYS or SRS item currently covers dark-mode contrast. Design stage shall
add CRS → SYS → SRS items stating WCAG AA contrast for dark-mode text
tokens. Existing items in the DHF are not affected.

### `/architecture-impact`

**Status:** Not required.
Change is confined to Tailwind theme CSS variables in the browser client.
System boundaries, data flow, API contracts, and DICOM integration
(SYSARCH-001/002/003) are unchanged.

### `/risk-impact`

**Status:** Not required.
Cosmetic token adjustment with no impact on contour data, image geometry,
DICOM exchange, or any existing risk control. No new hazard pathway.

### `/soup-impact`

**Status:** Not required.
Tailwind CSS is already an approved tool; this change uses it without
version change or new dependency. A small contrast-ratio helper for tests
(e.g. `wcag-contrast`) may be added — confirm at design stage; if added it
is a dev-only dependency and routed through SOUP review then.

### `/test-impact`

**Status:** Required.
- **Development:** existing typecheck/lint/build cover the change.
- **Verification (`@links:SRS-xxx`):** one Vitest unit test asserting
  computed contrast ratio ≥ 4.5:1 for each `--color-text*` token against
  every dark-mode surface variable it is used on (table-driven).
- **Validation (`@links:CRS-xxx`):** one Playwright smoke that loads the
  app in dark mode and runs `axe-core` against the patient browser and
  structure panel, asserting no `color-contrast` AA violation.
- **Manual:** required — clinician-style visual review of patient browser,
  structure list, top operation bar, tool rail tooltip, and QA checklist
  in dark mode.

---

## 4. Verification

| Check | Method | Pass criterion |
|---|---|---|
| Normal text contrast | Vitest unit (table-driven) | All `--color-text*` × surface pairs in use ≥ 4.5:1 |
| Large/UI control contrast | Vitest unit | All large-text and control-glyph pairs ≥ 3:1 |
| Dark-mode page sweep | Playwright + axe-core | Zero `color-contrast` AA violations on listed surfaces |
| Manual visual review | Clinician walkthrough | Readable, GitHub-dark-comparable in dark mode |

CI is the existing pipeline — no new jobs.

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

1. **Usability UC parent** — confirm at design stage whether to extend an
   existing UC to parent the new contrast CRS, or add a dedicated usability
   UC. Either is acceptable; pick whichever yields the cleaner traceability
   chain.
2. **Contrast helper dependency** — confirm whether any existing dev
   dependency already provides WCAG contrast math before adding a new one
   (`wcag-contrast`, `color2k`, etc.); reuse if possible to avoid a new
   SOUP entry.
