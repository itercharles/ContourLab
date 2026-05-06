# CR-002 Dark Mode Contrast — Follow-up Audit & Extension

## 1. Summary

**Product behavior change:** Verify that all dark-mode text/background pairs in
the WebTPS client meet WCAG AA (≥ 4.5:1 normal text, ≥ 3:1 large text/UI
controls) and raise contrast on any surfaces still below threshold so dark mode
matches the readability of GitHub's dark theme.

**Note on duplication:** CR-001 (cancelled) already landed the GitHub-dark
palette in `apps/client/src/index.css`, a Vitest contrast test
(`apps/client/src/index.contrast.test.ts`, `@links:SRS-018`), and a Playwright
smoke (`apps/client/e2e/crs/dark-mode-contrast.spec.ts`, `@links:CRS-011`).
CR-002 stems from a new user report (issue #24) on the same surface. Treat this
CR as a verification + targeted-fix pass rather than a rebuild.

---

## 2. Implementation Plan

### Scope

- Browser client only: `apps/client/`.
- Token layer (`src/index.css`) and any component-level color classes that
  bypass tokens.
- No API, DICOM, shared-types, or repository-integration changes.

### Approach

1. **Re-baseline.** Run the existing Vitest contrast suite and the Playwright
   `dark-mode-contrast` spec; capture current ratios for the dark token set.
2. **Locate residual offenders.** Grep `apps/client/src` for hardcoded color
   classes (e.g. `text-gray-500`, `text-gray-600`, `bg-gray-800`) that are not
   driven by tokens; spot-check the surfaces called out by issue #24:
   patient browser rows, structure panel labels, viewport overlays, settings
   panel, top context bar.
3. **Adjust tokens or classes.** Where a surface is below threshold:
   - Prefer raising the token (e.g. `--color-text-muted`, `--color-text-dim`)
     so the fix propagates everywhere, instead of editing each component.
   - Only edit a component when it hardcodes a Tailwind color outside the
     theme tokens.
4. **Extend coverage.** Add token pairs for any new surfaces identified
   (e.g. `text-dim` on `surface`, `text-muted` on `elevated`) to
   `index.contrast.test.ts` so regressions are caught at unit level.
5. **Confirm visually** in a running dev server (`pnpm dev`) before opening the
   implementation PR.

### Expected touchpoints

- `apps/client/src/index.css` — token values for `--color-text-*` and
  `--color-border-*` if any pair is below threshold.
- `apps/client/src/index.contrast.test.ts` — extend with any newly covered
  pairs.
- `apps/client/e2e/crs/dark-mode-contrast.spec.ts` — extend assertions if a
  new surface was found in step 2.
- A small number of components if they hardcode non-token colors (expect ≤ 5;
  if more, raise as Open Question rather than expanding scope).

---

## 3. DHF Impact

- `/product-impact`: **Not required.** Behavior is already covered by CRS-011
  (created during CR-001); CR-002 reuses the same product expectation.
- `/req-manage`: **Not required.** SYS-014 and SRS-018 already exist and remain
  valid; thresholds and surfaces are unchanged.
- `/architecture-impact`: **Not required.** Change is confined to the Tailwind
  token layer; no SYSARCH boundaries, data flow, or interfaces are affected.
- `/risk-impact`: **Not required.** Cosmetic contrast adjustment introduces no
  hazard or harm pathway and modifies no risk control.
- `/soup-impact`: **Not required.** No dependency added, removed, or upgraded.
- `/test-impact`: **Required.** Extend the existing Vitest contrast suite
  (`@links:SRS-018`) and, if a new surface is fixed, the Playwright spec
  (`@links:CRS-011`); no new test files expected.

---

## 4. Verification

| Check | Method | Pass criterion |
|---|---|---|
| Token pairs ≥ 4.5:1 (normal text) | Vitest `index.contrast.test.ts` | All asserted pairs pass |
| Token pairs ≥ 3:1 (UI controls / large text) | Vitest `index.contrast.test.ts` | All asserted pairs pass |
| Live DOM contrast on patient browser + structure panel | Playwright `dark-mode-contrast.spec.ts` | All assertions pass |
| Typecheck + lint | `pnpm --filter @webtps/client typecheck && lint` | Clean |
| Visual review (dev server) | Manual | Issue #24 surfaces read clearly in dark mode |

Manual test: required — load the app in dark mode, walk through patient browser,
structure panel, viewport toolbar, settings, and confirm against the surfaces
called out in issue #24.

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

1. **Specific surfaces from issue #24.** The source issue does not enumerate
   exact components. The implementer should reproduce the report against the
   current `main` build first; if the existing tokens already pass everywhere
   the user observed, surface this back to the requester before changing
   tokens.
2. **Component sweep size.** If more than ~5 components hardcode non-token
   colors that affect dark-mode contrast, scope the sweep to a follow-up CR
   rather than expanding this one.
