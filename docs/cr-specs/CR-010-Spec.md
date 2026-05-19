---
cr_id: "CR-010"
direction_fit: in-scope
affected_items: []
test_plan:
  auto_covered: []
  needs_new_tc: []
  must_be_manual: []
---

# CR-010: Rename "Issues" to "Change Requests"

## Summary

Two UI strings use the word "Issues" where "Change Requests" is more accurate and
aligned with IEC 62304 change-control language. The rename is purely cosmetic — no
routing, API, data model, or functional behavior changes.

**Affected strings:**

| File | Location | Current | New |
|------|----------|---------|-----|
| `apps/client/src/components/layout/LeftSidebar.tsx` | `title` and `aria-label` on the nav icon link (line 110–111) | `"Issues"` | `"Change Requests"` |
| `apps/client/src/pages/Issues.tsx` | `<h1>` page heading (line 163) | `Issues` | `Change Requests` |

The file and component names (`Issues.tsx`, `<Issues />`, route `/issues`) are internal
identifiers; they remain unchanged to avoid unnecessary churn across tests and routing.

## Implementation Plan

1. In `LeftSidebar.tsx`, change both `title="Issues"` and `aria-label="Issues"` to
   `title="Change Requests"` and `aria-label="Change Requests"`.

2. In `Issues.tsx`, change the `<h1>` content from `Issues` to `Change Requests`.

3. In `Issues.test.tsx`, add one test asserting that the page `<h1>` renders
   `"Change Requests"`.

4. Create `apps/client/src/components/layout/LeftSidebar.test.tsx` with one test
   asserting that the Issues nav link has `title="Change Requests"` and
   `aria-label="Change Requests"`. Mock `DicomRepoPanel` and `useUIStore` minimally.

No other files change.

## DHF Impact

**Product / UC / CRS:** Not required.  
Justification: The change corrects misleading UI copy; no user workflow is added or
altered, and existing CRS coverage of the CR-submission feature remains accurate.

**Requirements / SYS / SRS / SWDD:** Not required.  
Justification: No existing SRS, SYS, or SWDD item references the "Issues" label; the
rename introduces no new software behavior, so creating new requirement items would
add disproportionate DHF churn.

**Architecture / SYSARCH:** Not required.  
Justification: No system boundary, data flow, or deployment topology changes.

**Risk / RCM:** Not required.  
Justification: No clinical workflow, data integrity, or patient-safety behavior changes.

**SOUP / Dependencies:** Not required.  
Justification: No dependency additions, removals, or version changes.

**Test impact:** Required (development-level only).  
Two new Vitest tests verify the updated strings. No DHF traceability annotation is
needed because no SRS/SYS item covers this label; the tests are quality checks, not
IEC 62304 verification evidence.

## Verification

```bash
pnpm --filter @contourlab/client test        # new tests must pass
pnpm --filter @contourlab/client typecheck   # no type regressions
pnpm --filter @contourlab/client lint        # lint clean
```

Manual spot-check: open `/issues` and verify the page heading reads
"Change Requests"; hover the nav icon in the sidebar and verify the tooltip reads
"Change Requests".

## Implementation Checklist

- [ ] Update `title` and `aria-label` in `LeftSidebar.tsx`
- [ ] Update `<h1>` in `Issues.tsx`
- [ ] Add heading test to `Issues.test.tsx`
- [ ] Create `LeftSidebar.test.tsx` with nav-label assertion
- [ ] All tests pass; lint and typecheck clean
- [ ] Manual spot-check confirms both strings updated

## Open Questions

None.
