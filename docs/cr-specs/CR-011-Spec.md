---
cr_id: "CR-011"
disposition: approve
pipeline_route: standard
decline_rationale: ""
affected_items: []
proposed_new_items: []
design_impact_summary: "Remove the redundant 'Submit or track an issue' CTA from the About popup in Toolbar.tsx; the Change Requests entry point in the left sidebar already covers this navigation."
test_plan:
  auto_covered: []
  needs_new_tc:
    - "Update Toolbar.test.tsx: remove the assertion that the About dialog contains a 'Submit or track an issue' link; optionally assert the link is absent"
  must_be_manual:
    - "Open the About popup from the main workspace toolbar and confirm no issue-submission CTA is rendered."
---

## Summary

CR-011 requests removal of a "Submit or track an issue" CTA button from the
**About popup** (the `prototypeInfoOpen` modal in `Toolbar.tsx`). The popup is
opened by the "About" button in the main workspace toolbar. A functionally
equivalent entry point — the "Change Requests" icon in the left sidebar
(`LeftSidebar.tsx`, `/issues` route) — already exists, making this CTA redundant.

The CR is categorised as a **Bug** (duplicate UI / UX inconsistency). The change
is confined to two files: `Toolbar.tsx` (remove the CTA block) and
`Toolbar.test.tsx` (remove the corresponding assertion).

---

## Implementation Plan

### 1. Remove the CTA block from `Toolbar.tsx`

File: `apps/client/src/components/viewer/Toolbar.tsx`

Delete the `{/* CTA */}` block (approximately lines 464–474):

```tsx
{/* CTA */}
<div className="mt-4">
  <Link
    to="/issues"
    reloadDocument
    onClick={() => setPrototypeInfoOpen(false)}
    className="inline-flex h-8 items-center rounded bg-blue-800 px-3 text-[13px] font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
  >
    Submit or track an issue →
  </Link>
</div>
```

No other logic in `Toolbar.tsx` depends on this block.

### 2. Update `Toolbar.test.tsx`

File: `apps/client/src/components/viewer/Toolbar.test.tsx`

Remove the assertion that the About dialog contains the issue link
(approximately lines 319–321):

```tsx
expect(screen.getByRole('link', { name: /Submit or track an issue/i }).getAttribute('href')).toBe(
  '/issues'
);
```

Optionally add a negative assertion to prevent future regressions:

```tsx
expect(screen.queryByRole('link', { name: /Submit or track an issue/i })).toBeNull();
```

### 3. Validate

```bash
pnpm --filter @webtps/client test
pnpm --filter @webtps/client typecheck
pnpm --filter @webtps/client lint
```

---

## DHF Impact

**Product / UC / CRS**: Not required
Justification: Removing a duplicate navigation shortcut does not change any clinical workflow or user-facing capability; existing UC and CRS coverage remains accurate.
Impacted items: None
Recommended action: None

**Architecture / SYSARCH**: Not required
Justification: No system boundaries, API contracts, or data flow change; this is a localised UI deletion within a single frontend component.
Impacted items: None
Recommended action: None

**Requirements / SYS / SRS / SWDD**: Not required
Justification: No existing SRS or SYS item describes the presence of an issue-submission CTA in the About popup; removing it creates no requirement gap.
Impacted items: None
Recommended action: None

**Risk / RCM**: Not required
Justification: Removing a navigation link introduces no new hazard, changes no clinical data path, and weakens no existing risk control.
Impacted items: None
Recommended action: None

**SOUP / Dependencies**: Not required
Justification: No third-party dependencies are added, removed, or changed.
Impacted items: None
Recommended action: None

---

## Verification

| Check | Method | Pass criterion |
|---|---|---|
| CTA absent from About popup | Automated (Vitest) | `queryByRole('link', { name: /Submit or track an issue/i })` returns `null` |
| Existing About popup content intact | Automated (Vitest) | All other dialog assertions pass |
| TypeScript clean | `pnpm typecheck` | Zero errors |
| Lint clean | `pnpm lint` | Zero warnings/errors |
| Visual confirmation | Manual | About popup renders without the blue CTA button |

---

## Implementation Checklist

- [ ] Delete the `{/* CTA */}` block from `Toolbar.tsx` (lines ~464–474)
- [ ] Remove the stale `getByRole('link', { name: /Submit or track an issue/i })` assertion from `Toolbar.test.tsx`
- [ ] Optionally add a negative assertion (`queryByRole(...).toBeNull()`) for regression coverage
- [ ] Run `pnpm --filter @webtps/client test` — all tests pass
- [ ] Run `pnpm --filter @webtps/client typecheck` and `lint` — clean
- [ ] Manual: open the About popup and confirm no issue-submission CTA is visible

---

## Open Questions

None. The change is fully scoped: one TSX block to delete, one test assertion to update.
