# CR-003 Dark Mode Contrast Increase — Technical Specification

## 1. Summary

**Product behavior change:** Increase the foreground/background contrast of the
WebTPS dark theme so primary text reaches WCAG AA (≥ 4.5:1) and UI controls reach
≥ 3:1, matching GitHub's dark palette intent.

The dark theme is already wired through CSS custom properties in
`apps/client/src/index.css` and a Tailwind palette in
`apps/client/tailwind.config.ts`. The fix is confined to those two files plus any
component that hardcodes color classes outside the token system. No API, DICOM,
data-flow, or shared-types changes are involved.

---

## 2. Implementation Plan

### Scope

- **Repo:** `itercharles/WebTPS`, browser client only (`apps/client`)
- **Layer:** CSS custom properties (`index.css`) and Tailwind theme tokens
  (`tailwind.config.ts`)
- **Out of scope:** API, DICOM rendering, repository integration, shared-types

### Approach

1. **Audit current pairs.** Measure contrast for the foreground/background
   combinations driven by the dark-mode tokens in
   `apps/client/src/index.css:5-21`:
   - `--color-text` (`#e6edf3`) on `--color-base` (`#0d1117`) — primary text
   - `--color-text-sec` (`#8b949e`) on `--color-surface` (`#161b22`) — secondary
   - `--color-text-muted` (`#7d8590`) and `--color-text-dim` (`#6e7681`) on
     surfaces and panels
   - Borders (`--color-border` `#30363d`, `--color-border-input` `#3d444d`) on
     surface backgrounds
2. **Adjust failing tokens.** Brighten muted/secondary/dim text and any border
   used as a UI affordance until each pair meets the relevant WCAG AA threshold.
   Keep token names stable to avoid component churn.
3. **Component sweep.** Grep `apps/client/src` for hardcoded `text-gray-*` /
   `bg-gray-*` / `border-gray-*` that bypass the token system; convert to tokens
   or update only where necessary. The frontend rules at
   `.claude/rules/frontend.md` reference `bg-gray-950 / 900 / 800` as the
   surface stack — those rules must be reconciled with the token-driven theme
   if any conflict is found.
4. **Automated check.** Add a Vitest unit test that imports a contrast utility
   (prefer an already-present library; otherwise add a small inline ratio
   helper — no new SOUP entry) and asserts ≥ 4.5:1 for primary text pairs and
   ≥ 3:1 for control/border pairs.
5. **Manual visual review.** Compare patient browser, structure panel, viewport
   toolbar, top context bar, and QA checklist against GitHub dark mode.

### Expected touchpoints

- `apps/client/src/index.css` — dark-theme CSS custom properties (lines 5–21)
- `apps/client/tailwind.config.ts` — `theme.extend.colors` if any palette tier
  is referenced directly by components
- A new colocated test, e.g. `apps/client/src/theme/contrast.test.ts`
- Component files only if they hardcode color classes outside the token system
  (decided during implementation; expected to be a small number)

---

## 3. DHF Impact

### `/product-impact`

```
Product / UC / CRS: Required
Justification: No existing UC or CRS covers UI readability or dark-mode visual
  contrast; a traceable home for this usability requirement is needed.
Impacted items: None existing (UC-006 + CRS-011 to be created)
Recommended action: In the design phase, create UC-006 ("UI usability /
  readability") if no existing UC is broad enough, then CRS-011 ("Dark mode
  meets WCAG AA contrast for primary text and UI controls").
```

### `/req-manage`

```
Requirements impact: Required
Justification: No SYS or SRS item currently covers dark-mode contrast; new SYS
  and SRS entries are needed so the change is verifiable and traceable.
Impacted items: None existing (SYS-014 + SRS-018 to be created)
Recommended action: Create UC-006 → CRS-011 → SYS-014 ("System provides a
  dark theme meeting WCAG AA contrast") → SRS-018 ("Client dark-theme color
  tokens shall meet contrast ratios ≥ 4.5:1 for primary text and ≥ 3:1 for
  controls/borders") in the design phase, before implementation.
```

### `/architecture-impact`

```
Architecture / SYSARCH: Not required
Justification: Change is contained within the client's CSS/Tailwind theme
  layer; system boundaries, data flow, API contracts, and DICOM integration are
  unchanged.
Impacted items: None
Recommended action: None
```

### `/risk-impact`

```
Risk / RCM: Not required
Justification: A contrast adjustment is cosmetic — it does not affect clinical
  data integrity, contour editing, image geometry, or DICOM exchange. No new
  hazard or harm pathway is introduced.
Impacted items: None
Recommended action: None
```

### `/soup-impact`

```
SOUP / Dependencies: Not required
Justification: Tailwind CSS is already approved tooling and is used here in the
  same way. Prefer a tiny inline ratio helper or an already-present utility for
  the contrast test rather than adding a new dependency; if a new package is
  proposed during implementation, the SOUP impact must be re-assessed.
Impacted items: None expected
Recommended action: None unless a new package is introduced during implementation.
```

### `/test-impact`

```
Test impact: Required
Development checks: existing lint, typecheck, build (no new scripts)
Verification tests: One Vitest unit test annotated @links:SRS-018 asserting
  computed contrast ratios for the dark-theme token pairs meet thresholds.
Validation tests: None required if the unit test covers all token pairs; an
  optional Playwright smoke (annotated @links:CRS-011) loading the app in dark
  mode and asserting no axe-core WCAG AA violations on patient browser and
  structure panel may be added if low-cost.
Manual confirmation: Required — visual review on patient browser, structure
  panel, viewport toolbar, top context bar, and QA checklist; screenshot
  comparison against GitHub dark mode is sufficient evidence.
```

---

## 4. Verification

| Check | Method | Pass criterion |
|---|---|---|
| Primary text contrast ≥ 4.5:1 | Vitest unit test (`@links:SRS-018`) | All primary text/background token pairs pass |
| Control / border contrast ≥ 3:1 | Same Vitest test | All UI control/border pairs pass |
| Lint / typecheck / build | `pnpm --filter @webtps/client lint && typecheck && build` | Clean |
| Manual visual review | Manual | Clinician-readable in dark mode; matches GitHub dark intent |

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

1. **Relationship to CR-001/CR-002.** Both prior contrast CRs are `cancelled`
   without an implementation merged. Confirm CR-003 supersedes them and that no
   partial token work was previously merged that should be reused.
2. **UC scope.** Is an existing UC broad enough to parent CRS-011, or must
   UC-006 ("UI usability / readability") be created? Decide in the design phase.
3. **Frontend rules reconciliation.** `.claude/rules/frontend.md` calls out
   `bg-gray-950 / 900 / 800` directly while `index.css` drives the theme via
   CSS variables. Implementation should resolve which is authoritative — likely
   updating the rules doc to point at the token names.
4. **Contrast utility.** Confirm whether an existing dev dep can compute WCAG
   ratios; if not, use a small inline helper rather than introducing a new SOUP
   entry.
