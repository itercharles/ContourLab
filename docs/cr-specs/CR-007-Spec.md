---
cr_id: "CR-007"
direction_fit: in-scope
affected_items:
  - UC-002
  - CRS-002
  - SYS-004
  - SRS-005
  - SRS-006
  - SRS-007
  - SRS-008
  - SRS-014
test_plan:
  auto_covered:
    - SRS-005
    - SRS-006
    - SRS-007
    - SRS-008
    - SRS-014
  needs_new_tc: []
  must_be_manual:
    - SYS-004
---

## Summary

Contouring tool buttons (Brush, Freehand, Polygon) are non-responsive in the auto-deployed environment, though they function correctly in local development. Clicking the buttons does not activate the tool, and the mouse cursor does not reflect the selected tool state. This blocks clinical contouring workflows and violates the critical safety requirement SYS-004 (System shall provide freehand, polygon, brush, and eraser contouring tools).

## Implementation Plan

### Root Cause Investigation

1. **Identify environmental differences** between local and deployed builds:
   - Check Vite production build vs dev build output (assets, chunk names, module loading)
   - Verify React strict mode behavior, context providers, and store initialization order
   - Confirm Zustand store instantiation and hook binding in production
   - Check CSS class application and button disabled state in production

2. **Trace tool activation flow** in deployed environment:
   - Verify `ToolRail.activateTool()` is called when buttons are clicked
   - Confirm Zustand `setActiveTool()` updates UI store correctly
   - Trace state propagation to `activeTool` selectors in dependent components
   - Verify `MPRController.setActiveTool()` communication with Cornerstone3D backend

3. **Isolate tool state management**:
   - Check if button click events are attached correctly in production bundle
   - Verify `onClick` handler closure captures correct state
   - Confirm no JavaScript errors are silently failing in production

### Remediation

- Fix any identified tool state initialization or update issue
- Verify tool activation works for all contour tools: freehand, polygon, brush, eraser
- Ensure mouse cursor state reflects active tool (visual feedback)
- Test undo/redo stack functionality (SRS-007) works after fix

### Verification in Deployed Environment

- Test each tool in the contour group activates on button click
- Confirm mouse cursor icon changes when tool is active
- Draw a contour with each tool and verify contour data is captured
- Verify contour state persists and can be undone (SRS-007)

## DHF Impact

**Product / UC / CRS:** Not required  
Justification: UC-002 and CRS-002 already specify the full capability. This CR fixes implementation drift where the tools are specified but non-functional in deployed environment.  
Impacted items: UC-002, CRS-002  
Recommended action: None — no UC/CRS updates needed; capability is already baselined.

**Requirements / SYS / SRS:** Not required  
Justification: SYS-004 and related SRS items (SRS-005 through SRS-014) already define the contouring tool behavior in detail. This CR restores missing implementation for already-specified requirements.  
Impacted items: SYS-004, SRS-005, SRS-006, SRS-007, SRS-008, SRS-014  
Recommended action: None — no requirement items need updating; they already have complete specifications and existing passing unit tests.

**Architecture / SYSARCH:** Not required  
Justification: No architecture, data flow, or system boundary changes. Contouring tool activation is a localized UI state management issue within the client application.  
Impacted items: None  
Recommended action: None.

**Risk / RCM:** Not required  
Justification: This CR fixes an implementation of an existing safety control (critical_safety SYS-004) that is already designed in RISK-001 and mitigated by RCM-003. The hazards and controls are unchanged; only the implementation of the control is corrected.  
Impacted items: RISK-001, RCM-003  
Recommended action: None — risk assessment does not change; the control implementation remains critical but now functional.

**SOUP / Dependencies:** Not required  
Justification: No new or upgraded dependencies. The issue is localized to UI state management within existing Zustand store and Cornerstone3D integration.  
Impacted items: None  
Recommended action: None.

**Test Impact:** Required (manual verification only)  
Development checks: Existing unit tests (Vitest, Test-SRS) for contouring logic should pass; CI will confirm via `verify-srs` phase.  
Verification tests: No new automated test cases required; SRS-005 through SRS-014 already have passing test coverage. Tool activation tests already exist in `ToolRail.test.tsx`.  
Validation tests: No new validation tests needed; UC-002 workflow validation is covered by existing Test-CRS suites.  
Manual confirmation: **Required** — Tester must manually verify in the deployed environment that (1) clicking tool buttons activates the tool, (2) mouse cursor changes to reflect active tool, and (3) contouring operations complete successfully. Automated deployment testing cannot guarantee UI responsiveness in all production environments.

## Verification

1. **Automated tests (CI phase: `verify-srs`):**
   - Confirm all existing Test-SRS tests for SRS-005 through SRS-014 pass
   - `ToolRail.test.tsx` confirms button click handlers fire and state updates
   - No regression in other contouring logic (contour geometry, undo/redo, structure management)

2. **Manual test in deployed environment:**
   - Select a patient and load an image series
   - Open the contouring tool panel (Navigator → Structure/Edit)
   - For each tool (Freehand, Polygon, Brush, Eraser):
     - Click the tool button in the ToolRail
     - Verify the button becomes visually active (blue highlight, left edge indicator)
     - Verify the mouse cursor reflects the active tool (pen, polygon icon, brush, eraser)
     - Draw one contour slice and verify contour data is captured
   - Verify undo (Ctrl/Cmd+Z) removes the drawn contour
   - Verify tools remain functional across multiple contours and slices

## Implementation Checklist

- [ ] Investigate root cause: dev build vs production build output, module loading, store initialization
- [ ] Identify and fix tool state initialization or update issue
- [ ] Ensure button click handlers are correctly bound in production bundle
- [ ] Verify Zustand store updates propagate to UI in production
- [ ] Test all contour tools activate correctly: freehand, polygon, brush, eraser
- [ ] Verify cursor state reflects active tool
- [ ] Run `pnpm --filter @webtps/client test` — all existing tests pass
- [ ] Manual test in deployed environment: click buttons, verify activation, draw contours
- [ ] Merge implementation PR after code review
- [ ] Transition CR-007 to completed

## Open Questions

1. **Does the issue occur on all deployed instances or specific deployment environments?** (Helps narrow scope to browser, network, or environment-specific issues.)
2. **Are there any JavaScript errors or warnings in the browser console on the deployed instance?** (May indicate failed event binding or async initialization.)
3. **Does the issue persist after a hard refresh (Ctrl+Shift+R / Cmd+Shift+R)?** (Helps rule out stale cached assets.)
4. **When was the deployed environment last updated?** (Helps identify if the issue is from a recent change or longstanding.)
