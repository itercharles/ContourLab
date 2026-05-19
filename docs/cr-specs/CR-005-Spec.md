---
cr_id: "CR-005"
direction_fit: in-scope
affected_items: []
test_plan:
  auto_covered: []
  needs_new_tc: []
  must_be_manual: []
---

# CR-005: Remove Outdated GitHub Access Information

## Summary

Remove the "How to get access" section from the prototype info modal in `Toolbar.tsx` (lines 431–439) that instructs users to contact Charles Chen for GitHub repository write access. The system now provides an alternative approach to create issues, making this access method obsolete.

## Implementation Plan

### Code Changes

1. **apps/client/src/components/viewer/Toolbar.tsx**
   - Delete the access information block (lines 431–439):
     ```tsx
     <div className="mt-2 border border-amber-500/30 bg-amber-950/20 px-3 py-3">
       <p className="font-semibold text-amber-200">How to get access</p>
       <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
         GitHub issue creation requires repository write access.
         If you do not have access, send your GitHub username to{' '}
         <span className="font-semibold text-[var(--color-text)]">Charles Chen</span>{' '}
         to be added as a collaborator.
       </p>
     </div>
     ```

2. **apps/client/src/components/viewer/Toolbar.test.tsx**
   - Update the test "opens the prototype issue-driven AI coding notice from the top bar CTA" (lines 306–324)
   - Remove assertions on lines 319–320:
     ```tsx
     expect(screen.getByText(/send your GitHub username to/i)).toBeTruthy();
     expect(screen.getByText(/How to get access/i)).toBeTruthy();
     ```

## DHF Impact

- **Product Impact**: Not required — UI text removal from prototype info modal does not affect product requirements or use cases
- **Requirements Impact**: Not required — no CRS, SYS, or SRS items reference this access information
- **Architecture Impact**: Not required — no architectural changes
- **Risk Impact**: Not required — removing informational text does not introduce or mitigate identified risks
- **SOUP Impact**: Not required — no dependencies changed
- **Test Impact**: Required — update existing test assertions to remove checks for the deleted content

## Verification

### Automated Tests
- Run `pnpm --filter @contourlab/client test` — verify Toolbar.test.tsx passes with the updated assertions
- Run `pnpm --filter @contourlab/client typecheck` — no type errors after removal

### Manual Testing
- Open the prototype info modal (click the "Click Me" button in the toolbar)
- Verify the "How to get access" section is no longer visible
- Verify the rest of the modal content (workflow, links, CTA) renders correctly
- Verify the modal can still be closed

## Implementation Checklist

- [ ] Remove "How to get access" section from Toolbar.tsx
- [ ] Update test assertions in Toolbar.test.tsx
- [ ] Run frontend lint, typecheck, and tests
- [ ] Manual test: verify prototype modal displays correctly without the access section
- [ ] Verify no other code references the removed section

## Open Questions

None.
