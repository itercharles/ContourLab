---
cr_id: "CR-006"
direction_fit: in-scope
affected_items:
  - CRS-001
  - SYS-002
test_plan:
  auto_covered: []
  needs_new_tc:
    - SRS-018
    - SRS-019
  must_be_manual: []
---

## Summary

CR-006 adds a maximize/fullscreen feature to the image viewer, allowing clinicians to temporarily expand a single viewport (axial, sagittal, or coronal) to occupy the full workspace image area while keeping all other panels (repository browser, structure list, quality summary) visible. Users invoke maximize via a right-click context menu on any viewport. Restoring the standard three-pane layout is available through the same menu, Escape key, or automatic reset when the patient changes. 

**Rationale**: During detailed contour review and anatomic examination, clinicians need temporary full-screen access to a single view without losing awareness of workspace state (active structures, quality warnings, repository status). This improves efficiency during UC-003 (Review Structure Quality) workflows.

**Priority:** Medium  
**Target version:** 2026-W19

## Implementation Plan

### Frontend State Management (apps/client/)

1. **UI Store (uiStore)**
   - Add field: `maximizedViewport: "AXIAL" | "SAGITTAL" | "CORONAL" | null` (initially `null`)
   - Add action: `toggleMaximizeViewport(viewportId: string | null)`
     - If `maximizedViewport === null`, set it to `viewportId`
     - If `maximizedViewport === viewportId`, set it to `null`
   - Add action: `resetMaximizeViewport()` — unconditionally set to `null` (for patient change handler)
   - Store state in React Context or Zustand store alongside existing workspace state

2. **Viewport Components (ImageViewer, viewport panels)**
   - Add right-click (`onContextMenu`) handler to each viewport canvas element (Cornerstone3D)
   - Render context menu component conditionally on right-click
   - Menu options: "Maximize View" (if not maximized) or "Restore View" (if maximized)
   - Clicking menu option calls `toggleMaximizeViewport(viewportId)` or `resetMaximizeViewport()`

3. **Layout Rendering (ImageViewer)**
   - Conditional rendering based on `maximizedViewport` state:
     - If `null`: render standard three-pane grid (axial, sagittal, coronal in equal proportions)
     - If `"AXIAL"` (or sagittal/coronal): render that viewport full-width in image area; hide siblings
   - Use CSS flexbox/grid with flex-grow, width properties; consider CSS `transition` for smooth layout shift
   - Ensure all other workspace panels remain visible and unchanged (repository panel width, structure inspector, toolbar)

4. **Keyboard & Event Handlers**
   - Add Escape key listener (`onKeyDown`) to ImageViewer container
   - When Escape is pressed and `maximizedViewport !== null`, call `resetMaximizeViewport()`
   - Add effect hook to listen for patient/study changes
   - On patient change, automatically call `resetMaximizeViewport()` (layout always returns to normal on new patient)

### Data Flow
```
User right-clicks viewport
  → onContextMenu event → ContextMenu component rendered at cursor
User clicks "Maximize View"
  → toggleMaximizeViewport("AXIAL") called
  → uiStore updates maximizedViewport state
  → ImageViewer re-renders with maximized AXIAL layout
User presses Escape
  → resetMaximizeViewport() called
  → uiStore clears maximizedViewport
  → ImageViewer re-renders three-pane layout
```

### CSS & Styling
- Use Tailwind classes for layout (e.g., `flex`, `w-full`, `h-full`, `hidden`)
- Maximize state: set maximized viewport to `flex-1 w-full` or equivalent; set siblings to `hidden`
- Optional: smooth transition via CSS `transition: flex 0.3s ease-in-out`
- Ensure contour overlays remain visible and interactive in maximized viewport

### No Backend Changes
- This is a client-side feature; no API changes or backend logic required
- Workspace state (active patient, structures, contours) remains unchanged

### Testing

**Development Tests** (Vitest component tests)
- `ImageViewer.test.tsx`: test that right-click context menu appears on each viewport
- `ImageViewer.test.tsx`: test that clicking "Maximize" sets `maximizedViewport` state correctly
- `ImageViewer.test.tsx`: test that layout renders full-width when maximized and three-pane when restored
- `ImageViewer.test.tsx`: test that Escape key restores layout from maximized state
- `uiStore.test.ts`: test `toggleMaximizeViewport()` state transitions

**Manual Confirmation**
- Right-click on each viewport and confirm context menu appears with correct label
- Verify maximized viewport fills the image area and other panels remain accessible
- Verify Escape key restores layout
- Verify contour editing and viewport navigation remain functional in maximized mode

## DHF Impact

### Product / Use Cases & Customer Requirements
**Status:** Covered by existing requirement  
**Justification:** Maximize capability is a user-facing refinement of existing viewing workflows (UC-001, CRS-001). CRS-001 covers viewing in three planes and provides sufficient high-level scope for this feature. No new CRS item required.

### System Requirements (SYS)
**Status:** Covered by existing requirement  
**Justification:** SYS-002 describes three-pane viewport rendering and viewport synchronization; maximize is a layout variant that maintains these properties. No new SYS item required.

### Software Requirements (SRS)
**Status:** Required  
**Justification:** Two new SRS items are required to specify the software implementation of maximize capability at the requirement level. CSS layout implementation details are captured in SWDD.

**Recommended action during Design:**
- Create `SRS-018: Software shall render a context menu on viewport right-click with Maximize View option`
  - Derives from: SYS-002
  - Verification method: Test
  - Content: When a user right-clicks on a viewport canvas, a context menu shall appear with text "Maximize View" (or "Restore View" if already maximized). The menu shall disappear when clicked outside or when an option is selected.

- Create `SRS-019: Software shall toggle viewport fullscreen layout state and restore normal layout on user action or patient change`
  - Derives from: SYS-002
  - Verification method: Test
  - Content: Clicking "Maximize View" in the context menu shall set the maximized viewport state. Clicking "Restore View" or pressing Escape shall clear the state. Changing the active patient shall automatically restore normal layout. Layout state shall not persist across workspace reloads.

### Software Design Description (SWDD)
**Status:** Required  
**Justification:** Implementation-level details about layout rendering and CSS are documented here, not in SRS.

**Recommended content during Design:**
- Layout rendering shall use React conditional rendering based on `maximizedViewport` state
- CSS shall use Tailwind classes (`flex`, `w-full`, `hidden`) to show/hide viewports
- Maximized viewport shall be rendered with full width; sibling viewports shall be hidden
- All other workspace panels (repository, structure inspector, toolbar) shall remain visible
- Optional: CSS transitions for smooth layout shift on maximize/restore

### Architecture (SYSARCH)
**Status:** Not required  
**Justification:** No changes to system boundaries, data flow, or repository integration. Viewport rendering (Cornerstone3D) is unchanged. Layout is purely client-side React state management and CSS.

### Risk & Risk Control Measures (RISK / RCM)
**Status:** Not required  
**Justification:** Maximize is a non-clinical UI convenience feature with no impact on contour accuracy, image interpretation, DICOM handling, or patient safety. Contour edits, undo/redo, and image synchronization continue unchanged. No new hazards introduced.

### Software Used Off-The-Shelf (SOUP)
**Status:** Not required  
**Justification:** No new external dependencies or libraries required. Implemented using existing React, TypeScript, Tailwind CSS, and Cornerstone3D.

## Verification

### Development Tests (CI: `dev-frontend` phase)
```bash
pnpm --filter @contourlab/client test      # Unit & component tests
pnpm --filter @contourlab/client typecheck # TypeScript strictness
pnpm -r typecheck                      # Workspace-wide typecheck
```

### Test-SRS Verification (CI: `verify-srs` phase)
New Vitest tests with `@links:SRS-0XX` annotations:

- **SRS-018** — Context menu rendering
  - Test: Right-click on viewport shows context menu
  - Test: Menu contains "Maximize View" text
  - Test: Menu disappears when clicked outside
  - Test: Menu is positioned at cursor location

- **SRS-019** — Layout state toggle and restore
  - Test: Clicking "Maximize View" sets maximizedViewport state
  - Test: Clicking "Restore View" clears state
  - Test: Pressing Escape restores layout
  - Test: Changing patient auto-restores normal layout
  - Test: Layout state does not persist on workspace reload


### Test-SYS Verification (CI: `verify-sys` phase, manual confirmation)
- Maximize transverse viewport, verify sagittal/coronal remain synchronized when scrolling transverse
- Maximize viewport, draw a contour, restore, verify contour is present in all three views
- Maximize each viewport type (axial, sagittal, coronal) independently; verify correct viewport expands

### Test-CRS Validation (manual clinical workflow)
- Open a patient, examine contours in normal three-pane view
- Maximize transverse viewport and review contour detail
- Restore layout and verify no contours were lost
- Verify toolbar and structure quality warnings remain accessible during maximize

### Regression Check
- Full CI pipeline passes: `dev-frontend`, `dev-api`, `dev-integration` phases
- Existing viewport rendering, DICOM loading, contour editing all functional

## Implementation Checklist

### DHF Items (Design Phase)
- [ ] Create `SRS-018: Software shall render a context menu on viewport right-click with Maximize View option`
- [ ] Create `SRS-019: Software shall toggle viewport fullscreen layout state and restore normal layout on user action or patient change`
- [ ] Validate DHF schema: `medharness --dhf DHF dhf validate schema`
- [ ] Validate DHF traceability: `medharness --dhf DHF dhf validate traceability`

### Frontend Implementation (Development Phase)
- [ ] Add `maximizedViewport: "AXIAL" | "SAGITTAL" | "CORONAL" | null` to `uiStore`
- [ ] Add `toggleMaximizeViewport(viewportId)` action to `uiStore`
- [ ] Implement right-click event handler on each viewport canvas (Cornerstone3D)
- [ ] Implement context menu component with "Maximize" / "Restore" options
- [ ] Update `ImageViewer` layout logic to render fullscreen viewport when `maximizedViewport` is set
- [ ] Add CSS classes for maximized state (hide siblings, full width)
- [ ] Implement Escape key handler to restore layout
- [ ] Add patient change handler to auto-restore layout

### Testing
- [ ] Write `ImageViewer.test.tsx`: context menu appears on right-click
- [ ] Write `ImageViewer.test.tsx`: clicking Maximize sets state correctly
- [ ] Write `ImageViewer.test.tsx`: layout renders fullscreen when maximized
- [ ] Write `ImageViewer.test.tsx`: Escape key restores layout
- [ ] Write `uiStore.test.ts`: `toggleMaximizeViewport()` state transitions
- [ ] Write test with `@links:SRS-018` for context menu rendering
- [ ] Write test with `@links:SRS-019` for state toggle and auto-restore
- [ ] Manual test: right-click each viewport type and verify menu appears
- [ ] Manual test: maximize one viewport, verify others hidden, panels visible
- [ ] Manual test: perform contour edit in maximized mode, restore, verify contour present
- [ ] Manual test: verify Escape key restores layout
- [ ] Manual test: change patient while maximized, verify layout auto-restores
- [ ] Run full CI: `pnpm -r test`, `pnpm -r build`, `pnpm -r typecheck`

## Open Questions

1. **Keyboard Shortcut**: Should any additional keyboard shortcuts be supported (e.g., `M` for maximize)? Current plan: right-click menu + Escape only.
2. **Button UI**: Should a maximize button appear in viewport header, or only in right-click menu? Recommend menu for Phase A.
3. **Animation**: Should maximize/restore transition animate (CSS transition), or snap instantly? Recommend snap for Phase A.
4. **Mobile Support**: Right-click is mouse-centric. Mobile version (future phase) will need touch-and-hold or alternate UI.
5. **Preference Persistence**: Should maximize state be remembered per patient session, or reset on workspace reload? Current plan: reset on reload (no persistence).
